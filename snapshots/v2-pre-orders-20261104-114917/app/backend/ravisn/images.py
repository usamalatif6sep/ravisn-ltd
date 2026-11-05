"""Product photos for the public website.

Sources, all legitimate:
  * eBay Browse API (official), with the owner's own free eBay developer keys. Item listings, eBay product
    pages (/p/<number>) and listings with variations are supported. Each listing is fetched once and cached
    without any seller or user data. Photos stay on eBay's servers and products link to their listing.
  * When a listing has ended, the Browse API search looks for another live listing of the SAME product in the
    same country's marketplace. Candidates must agree on brand, model, size, count, colour and version
    (image_match.py) and always need the owner's approval. Every search, and why candidates were rejected, is logged.
  * Reference links that are themselves eBay photo addresses: offered as candidates for review.
  * Short ebay.us links are expanded with a single HEAD request where eBay's robots.txt allows it.
  * Photos the owner uploads, one by one, in bulk (files or ZIP) or through the inbox folder, matched by
    product code or supplier SKU. Uploads are resized and stripped of camera metadata.
Amazon, Walmart and other marketplace pages are never scraped.

Per product status: has_photo, candidate (found, needs a check), not_looked_up (eBay, lookup pending)
and manual_needed. Only 'verified' and 'approved' photos are ever published.
"""

import base64
import csv
import hashlib
import http.client
import io
import json
import logging
import re
import shutil
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response

from . import config, db, image_match, links, vault

log = logging.getLogger(__name__)

EBAY_MARKETS = {"ebay.co.uk": "EBAY_GB", "ebay.com": "EBAY_US", "ebay.ca": "EBAY_CA", "ebay.de": "EBAY_DE", "ebay.com.au": "EBAY_AU"}
MARKET_DOMAIN = {v: k for k, v in EBAY_MARKETS.items()}
COUNTRY_MARKET = {"UK": "EBAY_GB", "USA": "EBAY_US", "Canada": "EBAY_CA", "Germany": "EBAY_DE", "Australia": "EBAY_AU"}
MARKET_COUNTRY = {"EBAY_GB": "GB", "EBAY_US": "US", "EBAY_CA": "CA", "EBAY_DE": "DE", "EBAY_AU": "AU"}
SEARCH_RESERVE = 100  # eBay calls always left for ordinary listing lookups
SEARCH_CACHE_DAYS = 14
SEARCH_LIMIT = 40
EBAY_ITEM_RE = re.compile(r"/itm/(?:[^/?#]+/)?(\d{9,15})(?:[/?#]|$)")
EBAY_PRODUCT_RE = re.compile(r"/p/(\d{5,15})(?:[/?#]|$)")
AUTO_KINDS = ("ebay", "ebay_product", "ebay_image")
DAILY_CAP = 4800
VERIFY_SCORE = 0.55
UA = "RavisnCatalogue/1.0 (+mailto:usamalatif.alismart@gmail.com)"
STOP = {"the", "and", "for", "with", "by", "of", "a", "an", "in", "new", "x", "&", "-", "uk", "us", "usa", "free", "fast", "ship", "shipping"}
CODE_FILE_RE = re.compile(r"^([A-Za-z]{2})[-_ ]?(\d{1,6})(?:\s*[-_ (]\s*(\d{1,2})\)?)?$")
PHOTO_TYPES = (".jpg", ".jpeg", ".png", ".webp")
STATUS_LABEL = {"has_photo": "Has photo", "candidate": "Candidate found", "not_looked_up": "Not looked up yet", "manual_needed": "Manual upload needed"}


class ImageError(ValueError):
    pass


def inbox_dir() -> Path:
    return config.IMAGE_DIR / "inbox"


# ---------------------------------------------------------------- link classification

def classify(url: str | None) -> tuple[str, str | None, str]:
    """Return (kind, source_key, reason) for a reference link."""
    if not url or not links.is_valid(url):
        return "no_link", None, "No reference link"
    host = links.host_of(url)
    parts = urllib.parse.urlsplit(url)
    query = dict(urllib.parse.parse_qsl(parts.query))
    if host == "ebay.us":
        return "needs_full_link", None, "Short eBay link (ebay.us): use “Expand short links”, or paste the full listing link"
    if host == "ebay.io":
        return "needs_full_link", None, "Short eBay link (ebay.io): paste the full listing link, or upload a photo"
    if host == "i.ebayimg.com":
        return "ebay_image", f"img:{url}", "The reference link is an eBay photo"
    market = EBAY_MARKETS.get(host)
    if market:
        m = EBAY_ITEM_RE.search(parts.path + "/")
        if m:
            var = query.get("var")
            var = var if var and var.isdigit() and var != "0" else None
            return "ebay", f"ebay:{market}:{m.group(1)}:{var or ''}", "eBay listing"
        p = EBAY_PRODUCT_RE.search(parts.path + "/")
        if p:
            iid = query.get("iid")
            if iid and iid.isdigit():
                return "ebay", f"ebay:{market}:{iid}:", "eBay listing"
            return "ebay_product", f"ebayp:{market}:{p.group(1)}", "eBay product page"
        return "unsupported", None, "eBay search or category link, not a product: upload a photo"
    if "amazon." in host or host in ("amzn.to", "amzn.eu", "a.co"):
        return "unsupported", None, "Amazon link: Amazon does not allow automatic copying, so upload a photo"
    if "walmart." in host:
        return "unsupported", None, "Walmart link: upload a photo"
    return "unsupported", None, f"Link to {host}: upload a photo"


def _tokens(text: str) -> set[str]:
    t = (text or "").lower().replace("’", "'")
    return {w for w in re.findall(r"[a-z0-9]+(?:\.[0-9]+)?", t) if w not in STOP and len(w) > 1}


def title_score(product: str, listing: str) -> float:
    """Similarity between our product name and the listing title (0 to 1), penalising different sizes."""
    a, b = _tokens(product), _tokens(listing)
    if not a or not b:
        return 0.0
    score = 2 * len(a & b) / (len(a) + len(b))
    sizes_a = set(re.findall(r"(\d+(?:\.\d+)?)\s?(ml|oz|g|kg|mg|ct|pcs|pack|count)", (product or "").lower()))
    sizes_b = set(re.findall(r"(\d+(?:\.\d+)?)\s?(ml|oz|g|kg|mg|ct|pcs|pack|count)", (listing or "").lower()))
    if sizes_a and sizes_b and not (sizes_a & sizes_b):
        score *= 0.5
    return round(score, 3)


# ---------------------------------------------------------------- eBay Browse API

class EbayClient:
    TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token"
    BASE = "https://api.ebay.com/buy/browse/v1/"

    def __init__(self, client_id: str, client_secret: str, opener=None):
        self.client_id = client_id
        self.client_secret = client_secret
        self.opener = opener or urllib.request.urlopen
        self._token = None
        self._expires = 0.0

    def _request(self, req) -> tuple[int, dict]:
        try:
            with self.opener(req, timeout=25) as r:
                return r.status, json.loads(r.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as e:
            try:
                body = json.loads(e.read().decode("utf-8") or "{}")
            except ValueError:
                body = {}
            return e.code, body

    def token(self) -> str:
        if self._token and time.time() < self._expires - 60:
            return self._token
        basic = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        data = urllib.parse.urlencode({"grant_type": "client_credentials", "scope": "https://api.ebay.com/oauth/api_scope"}).encode()
        req = urllib.request.Request(self.TOKEN_URL, data=data, method="POST",
                                     headers={"Authorization": f"Basic {basic}", "Content-Type": "application/x-www-form-urlencoded"})
        try:
            status, body = self._request(req)
        except OSError as exc:
            raise ImageError("Could not reach eBay. Check the internet connection and try again.") from exc
        if status != 200 or "access_token" not in body:
            raise ImageError("eBay did not accept these keys. Use the Production App ID and Cert ID (not Sandbox).")
        self._token = body["access_token"]
        self._expires = time.time() + int(body.get("expires_in", 7200))
        return self._token

    def get(self, path: str, params: dict, market: str) -> tuple[int, dict]:
        return self.get_url(self.BASE + path, params, market)

    def get_url(self, url: str, params: dict, market: str | None = None) -> tuple[int, dict]:
        headers = {"Authorization": f"Bearer {self.token()}", "Accept": "application/json"}
        if market:
            headers["X-EBAY-C-MARKETPLACE-ID"] = market
        return self._request(urllib.request.Request(url + ("?" + urllib.parse.urlencode(params) if params else ""), headers=headers))


ANALYTICS_URL = "https://api.ebay.com/developer/analytics/v1_beta/rate_limit/"


def ebay_quota(client: EbayClient) -> dict | None:
    """eBay's own count of Browse API calls left for this app (Developer Analytics API; does not use up calls)."""
    try:
        status, body = client.get_url(ANALYTICS_URL, {})
    except (OSError, ImageError):
        return None
    if status != 200:
        return None
    for rl in body.get("rateLimits") or []:
        if (rl.get("apiContext") or "").lower() != "buy" or (rl.get("apiName") or "").lower() != "browse":
            continue
        for res in rl.get("resources") or []:
            if res.get("name") == "buy.browse":
                for rate in res.get("rates") or []:
                    return {"limit": rate.get("limit"), "remaining": rate.get("remaining"), "reset": rate.get("reset"),
                            "window": rate.get("timeWindow"), "checked_at": db.now()}
    return None


def _slim_item(it: dict) -> dict:
    """Keep only product facts. Seller and buyer data is never stored (only the country the item ships from)."""
    out = {k: it[k] for k in ("title", "image", "additionalImages", "price", "legacyItemId", "localizedAspects", "itemGroupType") if k in it}
    if (it.get("itemLocation") or {}).get("country"):
        out["itemCountry"] = it["itemLocation"]["country"]
    return out


def _slim(body: dict) -> dict:
    if not isinstance(body, dict):
        return {}
    out = {}
    if "errors" in body:
        out["errors"] = [{"errorId": e.get("errorId"), "message": e.get("message", "")[:200]} for e in body["errors"][:3]]
    if "group" in body:
        out["group"] = {"items": [_slim_item(i) for i in (body["group"].get("items") or [])]}
    if "itemSummaries" in body:
        out["itemSummaries"] = [_slim_item(i) for i in body["itemSummaries"]]
    if "total" in body:
        out["total"] = body["total"]
    if "title" in body:
        out.update(_slim_item(body))
    return out


def _usage(con, api: str) -> int:
    row = con.execute("SELECT calls FROM api_usage WHERE day = ? AND api = ?", (date.today().isoformat(), api)).fetchone()
    return row["calls"] if row else 0


def _count_call(con, api: str) -> None:
    with con:
        con.execute("INSERT INTO api_usage (day, api, calls) VALUES (?, ?, 1) ON CONFLICT(day, api) DO UPDATE SET calls = calls + 1",
                    (date.today().isoformat(), api))


def _fetch(con, client: EbayClient, key: str) -> tuple[int, dict]:
    cached = con.execute("SELECT status, response FROM api_cache WHERE source_key = ?", (key,)).fetchone()
    if cached:
        return cached["status"], json.loads(cached["response"])
    if key.startswith("ebayp:"):
        _, market, epid = key.split(":")
        status, body = client.get("item_summary/search", {"epid": epid, "limit": "5"}, market)
        _count_call(con, "ebay")
    else:
        _, market, legacy, var = key.split(":")
        params = {"legacy_item_id": legacy}
        if var:
            params["legacy_variation_id"] = var
        status, body = client.get("item/get_item_by_legacy_id", params, market)
        _count_call(con, "ebay")
        errors = {e.get("errorId") for e in body.get("errors", [])} if isinstance(body, dict) else set()
        if status != 200 and 11006 in errors:
            # A listing with variations: fetch the whole group so the right variation can be chosen.
            status, body = client.get("item/get_items_by_item_group", {"item_group_id": legacy}, market)
            _count_call(con, "ebay")
            body = {"group": body} if status == 200 else body
    body = _slim(body)
    if status in (200, 404) or (status == 400 and body.get("errors")):
        with con:
            con.execute("INSERT OR REPLACE INTO api_cache (source_key, status, response, fetched_at) VALUES (?, ?, ?, ?)",
                        (key, status, json.dumps(body), db.now()))
    return status, body


def _images_of(item: dict) -> list[str]:
    out = []
    main = (item.get("image") or {}).get("imageUrl")
    if main:
        out.append(main)
    for extra in item.get("additionalImages") or []:
        u = extra.get("imageUrl")
        if u and u not in out:
            out.append(u)
    return [u for u in out if u.startswith("https://i.ebayimg.com/")][:5]


def _pick(items: list[dict], product: dict) -> tuple[dict | None, bool, str]:
    """Choose the variation or listing that matches the product. Returns (item, exact, note)."""
    if not items:
        return None, False, "No listing found"
    cost = product.get("cost_minor")
    if cost is not None:
        priced = [it for it in items if abs(round(float((it.get("price") or {}).get("value", -1)) * 100) - cost) <= 1]
        if len(priced) == 1:
            return priced[0], True, "Variation matched by supplier price"
    best = max(items, key=lambda it: title_score(product["full_name"], it.get("title", "")))
    return best, False, "Closest match by title: check it is the right one"


def _store(con, product: dict, urls: list[str], source: str, state: str, score: float | None, title: str, note: str | None,
           ref: str | None = None, confidence: str | None = None) -> None:
    ts = db.now()
    with con:
        con.execute("DELETE FROM item_images WHERE item_id = ? AND source IN ('ebay_api', 'reference_image') AND status IN ('verified', 'needs_review')",
                    (product["id"],))
        for i, u in enumerate(urls, start=1):
            con.execute(
                """INSERT INTO item_images (item_id, sort, url, source, source_ref, status, score, seen_title, rights, note, confidence, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ebay_listing', ?, ?, ?, ?)""",
                (product["id"], i, u, source, ref or product["source_key"], state, score, title, note, confidence, ts, ts),
            )


def _apply(con, product: dict, status: int, body: dict, shared: int) -> tuple[str, str]:
    """Turn an API response into stored photos for one product. Returns (check_state, detail)."""
    if status == 404:
        return "not_found", "eBay says this listing has ended or no longer exists"
    if status != 200:
        msg = "; ".join(e.get("message", "") for e in body.get("errors", [])[:1])
        return "error", f"eBay returned {status}{': ' + msg if msg else ''}"
    note = None
    if "group" in body:
        item, exact, note = _pick(body["group"].get("items") or [], product)
    elif "itemSummaries" in body or product["kind"] == "ebay_product":
        item, _, note = _pick(body.get("itemSummaries") or [], product)
        exact = False
        note = "From the eBay product page: check it shows this exact item"
    else:
        item, exact = body, bool(product["source_key"].split(":")[3])
    if not item:
        return "not_found", note or "No listing found"
    urls = _images_of(item)
    if not urls:
        return "not_found", "The listing has no photos"
    title = item.get("title", "")
    score = title_score(product["full_name"], title)
    confident = product["kind"] == "ebay" and score >= VERIFY_SCORE and (exact or shared == 1)
    _store(con, product, urls, "ebay_api", "verified" if confident else "needs_review", score, title, note)
    if confident:
        return "found", "Verified automatically"
    why = []
    if score < VERIFY_SCORE:
        why.append(f"title match {score:.0%}")
    if not exact and shared > 1:
        why.append(f"{shared} codes share this listing")
    if product["kind"] == "ebay_product":
        why.append("photo from an eBay product page")
    return "found", "Needs your check: " + ", ".join(why or [note or "check the photo"])


# ---------------------------------------------------------------- per-product status

def products(con, country: str | None = None) -> list[dict]:
    rows = con.execute(
        """SELECT i.id, i.code, i.country, i.seq, i.name, i.variant, i.link, s.availability, o.cost_minor, k.sort AS csort, k.currency,
                  (SELECT COUNT(*) FROM issues x WHERE x.item_id = i.id AND x.state = 'open' AND x.severity = 'blocker') AS blockers,
                  (SELECT COUNT(*) FROM item_images g WHERE g.item_id = i.id AND g.status IN ('approved', 'verified')) AS live,
                  (SELECT COUNT(*) FROM item_images g WHERE g.item_id = i.id AND g.status = 'needs_review') AS review,
                  (SELECT COUNT(*) FROM item_images g WHERE g.item_id = i.id AND g.status = 'rejected') AS rejected,
                  c.state AS checked, c.detail AS check_detail, sl.outcome AS search_outcome, sl.reason AS search_reason
           FROM items i JOIN statuses s ON s.name = i.status JOIN offers o ON o.item_id = i.id JOIN countries k ON k.key = i.country
           LEFT JOIN image_checks c ON c.item_id = i.id
           LEFT JOIN image_search_log sl ON sl.item_id = i.id
           WHERE i.archived = 0 AND (? IS NULL OR i.country = ?)
           ORDER BY blockers > 0, s.availability = 'unavailable', k.sort, i.seq""",
        (country, country),
    ).fetchall()
    out = []
    for r in rows:
        kind, key, reason = classify(r["link"])
        p = {**dict(r), "kind": kind, "source_key": key, "full_name": r["name"] + (f" {r['variant']}" if r["variant"] else ""),
             "search_pending": False}
        ended = kind in ("ebay", "ebay_product") and r["checked"] == "not_found"
        if r["live"]:
            p["photo"], p["photo_reason"] = "has_photo", "Photo approved for the website"
        elif r["review"]:
            p["photo"], p["photo_reason"] = "candidate", r["search_reason"] or r["check_detail"] or "Photo found: check it"
        elif ended and not r["rejected"] and r["search_outcome"] in (None, "error"):
            p["search_pending"] = True
            p["photo"] = "not_looked_up"
            p["photo_reason"] = (r["search_reason"] if r["search_outcome"] == "error" else
                                 f"{r['check_detail']}: search for another listing of this product pending")
        elif kind in AUTO_KINDS and r["checked"] not in ("found", "not_found") and not (r["rejected"] and r["checked"]):
            p["photo"], p["photo_reason"] = "not_looked_up", (r["check_detail"] if r["checked"] == "error" else f"{reason}: not looked up yet")
        else:
            p["photo"] = "manual_needed"
            p["photo_reason"] = ("Found photos were rejected: upload one" if r["rejected"] else
                                 r["search_reason"] if r["search_outcome"] else
                                 r["check_detail"] if r["checked"] == "not_found" else reason)
        out.append(p)
    return out


def photo_status_by_item(con, country: str | None = None) -> dict[int, str]:
    return {p["id"]: p["photo"] for p in products(con, country)}


# ---------------------------------------------------------------- lookup job

JOB = {"running": False, "stop": False, "processed": 0, "total": 0, "found": 0, "verified": 0, "message": "", "started_at": None, "finished_at": None}
SHORT_JOB = {"running": False, "processed": 0, "total": 0, "expanded": 0, "refused": 0, "message": "", "finished_at": None}
_lock = threading.Lock()


def _record(con, product_id: int, state: str, detail: str, key: str | None) -> None:
    with con:
        con.execute(
            "INSERT INTO image_checks (item_id, state, detail, source_key, checked_at) VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(item_id) DO UPDATE SET state = excluded.state, detail = excluded.detail, source_key = excluded.source_key, checked_at = excluded.checked_at",
            (product_id, state, detail, key, db.now()),
        )


def run_lookup(connect, limit: int | None = None, client: EbayClient | None = None, pause: float = 0.25) -> dict:
    """Find photos for products that have none. Safe to stop and resume; each eBay listing is fetched once."""
    with _lock:
        if JOB["running"]:
            raise ImageError("A photo lookup is already running")
        if SEARCH_JOB["running"]:
            raise ImageError("Wait for the replacement search to finish first")
        JOB.update(running=True, stop=False, processed=0, total=0, found=0, verified=0, message="Starting", started_at=db.now(), finished_at=None)
    con = connect()
    try:
        items = products(con)
        todo = [p for p in items if p["photo"] == "not_looked_up" and not p["search_pending"]]
        shared: dict[str, int] = {}
        for p in items:
            if p["source_key"]:
                shared[p["source_key"]] = shared.get(p["source_key"], 0) + 1
        # Reference links that are eBay photos need no API call.
        for p in [p for p in todo if p["kind"] == "ebay_image"]:
            _store(con, p, [p["link"]], "reference_image", "needs_review", None, "", "The reference link is this photo")
            _record(con, p["id"], "found", "Needs your check: the reference link is a photo", p["source_key"])
            JOB["found"] += 1
        todo = [p for p in todo if p["kind"] != "ebay_image"]
        if client is None:
            creds = vault.get("ebay")
            if not creds:
                JOB["message"] = "Add your eBay keys to look up eBay listings" if todo else "Finished"
                return dict(JOB)
            client = EbayClient(creds["client_id"], creds["client_secret"])
            client.token()
        if limit:
            todo = todo[:limit]
        JOB["total"] = len(todo)
        for p in todo:
            if JOB["stop"]:
                JOB["message"] = "Stopped. Click Look up photos to continue where it left off."
                break
            cached = con.execute("SELECT 1 FROM api_cache WHERE source_key = ?", (p["source_key"],)).fetchone()
            if not cached and _usage(con, "ebay") >= DAILY_CAP:
                JOB["message"] = f"Paused at today's limit of {DAILY_CAP:,} eBay calls. Click Look up photos tomorrow to continue."
                break
            try:
                status, body = _fetch(con, client, p["source_key"])
            except OSError as exc:
                JOB["message"] = f"Lost the connection to eBay ({exc.__class__.__name__}). Click Look up photos to retry."
                break
            if status == 429:
                JOB["message"] = "eBay asked us to slow down. Try again in an hour."
                break
            state, detail = _apply(con, p, status, body, shared.get(p["source_key"], 1))
            _record(con, p["id"], state, detail, p["source_key"])
            JOB["processed"] += 1
            if state == "found":
                JOB["found"] += 1
                JOB["verified"] += detail.startswith("Verified")
            if not cached and pause:
                time.sleep(pause)
        else:
            JOB["message"] = "Finished"
        return dict(JOB)
    except ImageError as exc:
        JOB["message"] = str(exc)
        raise
    except Exception as exc:  # noqa: BLE001 - shown in the admin panel
        log.exception("Photo lookup failed")
        JOB["message"] = f"Stopped by an error: {exc}"
        raise
    finally:
        JOB["running"] = False
        JOB["finished_at"] = db.now()
        con.close()


# ---------------------------------------------------------------- replacement search for ended listings

SEARCH_JOB = {"running": False, "stop": False, "processed": 0, "total": 0, "searches": 0, "searches_total": 0, "api_calls": 0,
              "high": 0, "medium": 0, "no_match": 0, "no_results": 0, "errors": 0, "message": "", "quota": None,
              "started_at": None, "finished_at": None}
OUTCOME_REASON = {
    "candidate_high": "Listing ended: another eBay listing of this exact product found (high confidence): check it",
    "candidate_medium": "Listing ended: a likely match on another eBay listing (medium confidence): check it",
    "no_match": "Listing ended, no exact match on eBay: upload a photo",
    "no_results": "Listing ended, no other eBay listing found: upload a photo",
}
OUTCOME_COUNTER = {"candidate_high": "high", "candidate_medium": "medium", "no_match": "no_match", "no_results": "no_results", "error": "errors"}


def _market_for(p: dict) -> str:
    return COUNTRY_MARKET.get(p["country"]) or ((p["source_key"] or "").split(":") + ["", ""])[1] or "EBAY_US"


def _search_key(market: str, q: str) -> str:
    return f"search:{market}:{hashlib.sha1(q.encode()).hexdigest()[:20]}"


def _search_cached(con, market: str, q: str) -> tuple[int, dict] | None:
    row = con.execute("SELECT status, response, fetched_at FROM api_cache WHERE source_key = ?", (_search_key(market, q),)).fetchone()
    if row and (datetime.now(timezone.utc) - datetime.fromisoformat(row["fetched_at"])).days < SEARCH_CACHE_DAYS:
        return row["status"], json.loads(row["response"])
    return None


def _search(con, client: EbayClient, market: str, q: str) -> tuple[int, dict, int]:
    """One Browse API search for new items in that country's marketplace, cached. Returns (status, body, calls made)."""
    cached = _search_cached(con, market, q)
    if cached:
        return cached[0], cached[1], 0
    status, body = client.get("item_summary/search", {"q": q, "limit": str(SEARCH_LIMIT), "filter": "conditions:{NEW}"}, market)
    _count_call(con, "ebay")
    body = _slim(body)
    if status == 200 or (status in (400, 404) and body.get("errors")):
        with con:
            con.execute("INSERT OR REPLACE INTO api_cache (source_key, status, response, fetched_at) VALUES (?, ?, ?, ?)",
                        (_search_key(market, q), status, json.dumps(body), db.now()))
    return status, body, 1


def _original_error(con, p: dict) -> str | None:
    """What eBay said about the original listing, for the diagnostic log."""
    row = con.execute("SELECT status, response FROM api_cache WHERE source_key = ?", (p["source_key"],)).fetchone() if p["source_key"] else None
    if row is None:
        return p.get("check_detail")
    errors = json.loads(row["response"]).get("errors") or []
    if errors:
        return f"HTTP {row['status']} · eBay error {errors[0].get('errorId')}: {errors[0].get('message', '')}"
    return f"HTTP {row['status']} · {p.get('check_detail') or 'no usable listing'}"


def _price_note(p: dict, item: dict) -> str | None:
    """A listing priced far below even our wholesale cost is often a sample, tester or fake. (Retail listings are
    normally well above wholesale cost, so a high price says nothing.)"""
    price, cost = item.get("price") or {}, p.get("cost_minor")
    try:
        value = round(float(price.get("value")) * 100)
    except (TypeError, ValueError):
        return None
    if not cost or cost <= 0 or price.get("currency") != p.get("currency"):
        return None
    if value < cost * 0.45:
        return "listing price is far below the usual price: may be a sample, tester or fake"
    return None


def _evaluate(p: dict, market: str, results: list[dict]) -> tuple[dict | None, list[dict]]:
    """Grade every search result against the product. Returns (best acceptable candidate or None, rejected results)."""
    best, rejected = None, []
    for it in results:
        title = it.get("title") or ""
        r = image_match.evaluate(p["full_name"], title, is_group=bool(it.get("itemGroupType")))
        urls = _images_of(it)
        if r["ok"] and not urls:
            r = {**r, "ok": False, "reasons": ["listing has no photo"]}
        if not r["ok"]:
            rejected.append({"title": title[:160], "listing": it.get("legacyItemId"), "reasons": r["reasons"][:4], "coverage": r["coverage"]})
            continue
        price_note = _price_note(p, it)
        reasons = r["reasons"] + ([price_note] if price_note else [])
        confidence = "high" if r["confidence"] == "high" and not price_note else "medium"
        rank = (confidence == "high", r["coverage"], it.get("itemCountry") == MARKET_COUNTRY.get(market), len(urls))
        if best is None or rank > best["rank"]:
            best = {"rank": rank, "item": it, "confidence": confidence, "reasons": reasons, "matched": r["matched"], "urls": urls,
                    "coverage": r["coverage"]}
    rejected.sort(key=lambda x: -x["coverage"])
    return best, rejected


def _log_search(con, p: dict, query: str, market: str, original: str | None, outcome: str, reason: str, considered: int,
                rejected: list[dict], chosen_title: str | None, chosen: str | None) -> None:
    with con:
        con.execute(
            """INSERT OR REPLACE INTO image_search_log (item_id, query, market, original, outcome, reason, considered, rejected, chosen_title,
                                                        chosen_listing, searched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (p["id"], query, market, original, outcome, reason, considered, json.dumps(rejected[:8], ensure_ascii=False), chosen_title, chosen, db.now()),
        )


def _apply_search(con, p: dict, market: str, query: str, status: int, results: list[dict]) -> str:
    """Store the best candidate for review (never approved here) and log the outcome. Returns the outcome."""
    original = _original_error(con, p)
    if status != 200:
        _log_search(con, p, query, market, original, "error", f"Replacement search failed (eBay {status}): it will be retried", 0, [], None, None)
        return "error"
    best, rejected = _evaluate(p, market, results)
    if best is None:
        outcome = "no_match" if results else "no_results"
        _log_search(con, p, query, market, original, outcome, OUTCOME_REASON[outcome], len(results), rejected, None, None)
        return outcome
    it, outcome = best["item"], f"candidate_{best['confidence']}"
    ref = f"search:{market}:{it.get('legacyItemId')}"
    note = (f"Replacement from another eBay listing, {best['confidence']} confidence (the original listing has ended). "
            f"Matches: {', '.join(best['matched']) or 'product name'}." + (f" Check: {'; '.join(best['reasons'])}." if best["reasons"] else ""))
    _store(con, p, best["urls"], "ebay_api", "needs_review", best["coverage"], it.get("title", ""), note, ref=ref, confidence=best["confidence"])
    _log_search(con, p, query, market, original, outcome, OUTCOME_REASON[outcome], len(results), rejected, it.get("title"), ref)
    return outcome


def _search_groups(items: list[dict]) -> dict[tuple[str, str], list[dict]]:
    """Products waiting for a replacement search, grouped so each distinct product is searched once per marketplace."""
    groups: dict[tuple[str, str], list[dict]] = {}
    for p in items:
        if p["search_pending"]:
            groups.setdefault((_market_for(p), image_match.norm(p["full_name"]).strip()), []).append(p)
    return groups


def run_search(connect, limit: int | None = None, client: EbayClient | None = None, pause: float = 0.3,
               item_ids: set[int] | None = None) -> dict:
    """Search eBay for another live listing of each product whose listing has ended. Candidates always need approval.
    Stays within our daily limit and eBay's own remaining allowance; safe to stop and resume."""
    with _lock:
        if SEARCH_JOB["running"]:
            raise ImageError("A replacement search is already running")
        if JOB["running"]:
            raise ImageError("Wait for the photo lookup to finish first")
        SEARCH_JOB.update(running=True, stop=False, processed=0, total=0, searches=0, searches_total=0, api_calls=0, high=0, medium=0,
                          no_match=0, no_results=0, errors=0, message="Starting", started_at=db.now(), finished_at=None)
    con = connect()
    try:
        groups = _search_groups([p for p in products(con) if not item_ids or p["id"] in item_ids])
        keys = list(groups)[:limit] if limit else list(groups)
        SEARCH_JOB["searches_total"] = len(keys)
        SEARCH_JOB["total"] = sum(len(groups[k]) for k in keys)
        if client is None:
            creds = vault.get("ebay")
            if not creds:
                SEARCH_JOB["message"] = "Connect eBay first"
                return dict(SEARCH_JOB)
            client = EbayClient(creds["client_id"], creds["client_secret"])
        client.token()

        def allowance() -> int:
            quota = ebay_quota(client)
            if quota:
                SEARCH_JOB["quota"] = quota
                db.set_setting(con, "ebay_quota", quota)
                con.commit()
            ours = DAILY_CAP - _usage(con, "ebay")
            if quota and isinstance(quota.get("remaining"), int):
                return min(ours, quota["remaining"] - SEARCH_RESERVE)
            return ours

        left = allowance()
        since_check, waiting = 0, 0
        for market, _name in keys:
            if SEARCH_JOB["stop"]:
                SEARCH_JOB["message"] = "Stopped. Click Find replacement photos to continue where it left off."
                break
            members = groups[(market, _name)]
            first = image_match.query_for(members[0]["full_name"])
            queries = [first] if first else []
            results: list[dict] = []
            used, status, paused = [], 200, False
            while queries:
                q = queries.pop(0)
                if _search_cached(con, market, q) is None and (left <= 0 or _usage(con, "ebay") >= DAILY_CAP):
                    paused = True
                    break
                st, body, calls = _search(con, client, market, q)
                SEARCH_JOB["api_calls"] += calls
                left -= calls
                since_check += calls
                used.append(q)
                if calls and pause:
                    time.sleep(pause)
                if st != 200:
                    status = st
                    break
                known = {r.get("legacyItemId") for r in results}
                results += [it for it in body.get("itemSummaries") or [] if it.get("legacyItemId") not in known]
                if _evaluate(members[0], market, results)[0]:
                    break
                if len(used) == 1:
                    second = image_match.fallback_query(members[0]["full_name"], bool(results))
                    if second:
                        queries.append(second)
            if paused:
                # Out of allowance: products that need a new eBay call wait for tomorrow; cached ones still get graded.
                waiting += len(members)
                continue
            if status == 429:
                SEARCH_JOB["message"] = "eBay asked us to slow down. Try again in an hour."
                break
            if status in (401, 403):
                SEARCH_JOB["message"] = "eBay refused the search with these keys. Check the eBay connection."
                break
            for p in members:
                outcome = _apply_search(con, p, market, " | ".join(used), status, results) if first else None
                if outcome is None:
                    _log_search(con, p, "", market, _original_error(con, p), "no_match",
                                "Listing ended, and the product name is too short to search safely: upload a photo", 0, [], None, None)
                    outcome = "no_match"
                SEARCH_JOB[OUTCOME_COUNTER[outcome]] += 1
                SEARCH_JOB["processed"] += 1
            SEARCH_JOB["searches"] += 1
            if since_check >= 250:
                left, since_check = allowance(), 0
        else:
            if waiting:
                quota = SEARCH_JOB["quota"]
                SEARCH_JOB["message"] = (f"Paused: today's eBay allowance is used up, {waiting:,} products wait"
                                         + (f" (eBay reports {quota['remaining']:,} calls left, {SEARCH_RESERVE} kept for listing lookups)" if quota else "")
                                         + ". Click Find replacement photos tomorrow to continue.")
            else:
                SEARCH_JOB["message"] = "Finished"
        return dict(SEARCH_JOB)
    except ImageError as exc:
        SEARCH_JOB["message"] = str(exc)
        raise
    except OSError as exc:
        SEARCH_JOB["message"] = f"Lost the connection to eBay ({exc.__class__.__name__}). Click Find replacement photos to retry."
        return dict(SEARCH_JOB)
    except Exception as exc:  # noqa: BLE001 - shown in the admin panel
        log.exception("Replacement search failed")
        SEARCH_JOB["message"] = f"Stopped by an error: {exc}"
        raise
    finally:
        SEARCH_JOB["running"] = False
        SEARCH_JOB["finished_at"] = db.now()
        con.close()


def reset_undecided_searches(con, item_ids: set[int] | None = None) -> int:
    """Forget search results the owner has not decided on yet, so improved matching rules can grade them again
    (from the cache, without new eBay calls). Approved and rejected photos are never touched."""
    rows = [r[0] for r in con.execute(
        """SELECT sl.item_id FROM image_search_log sl WHERE NOT EXISTS (
               SELECT 1 FROM item_images g WHERE g.item_id = sl.item_id AND g.source_ref LIKE 'search:%' AND g.status IN ('approved', 'verified', 'rejected'))""")
            if item_ids is None or r[0] in item_ids]
    with con:
        for item_id in rows:
            con.execute("DELETE FROM item_images WHERE item_id = ? AND source_ref LIKE 'search:%' AND status = 'needs_review'", (item_id,))
            con.execute("DELETE FROM image_search_log WHERE item_id = ?", (item_id,))
    return len(rows)


def _reason_kind(reason: str) -> str:
    r = re.sub(r"“[^”]*”", "…", reason)
    r = re.sub(r"\s*\([^)]*\)", "", r)
    return re.sub(r"\d+(?:\.\d+)?%?", "N", r).strip()


def search_report(con) -> dict:
    """Counts for the replacement search: outcomes by country and by what eBay said about the original listing."""
    rows = con.execute(
        """SELECT sl.*, i.code, i.country, i.name, i.variant,
                  (SELECT g.status FROM item_images g WHERE g.item_id = sl.item_id AND g.source_ref = sl.chosen_listing ORDER BY g.sort LIMIT 1) AS decision
           FROM image_search_log sl JOIN items i ON i.id = sl.item_id WHERE i.archived = 0""").fetchall()
    outcomes, by_country, by_original, decisions, rejections = {}, {}, {}, {}, {}
    for r in rows:
        outcomes[r["outcome"]] = outcomes.get(r["outcome"], 0) + 1
        c = by_country.setdefault(r["country"], {})
        c[r["outcome"]] = c.get(r["outcome"], 0) + 1
        code = re.search(r"eBay error (\d+)", r["original"] or "")
        orig = f"eBay error {code.group(1)}" if code else (r["original"] or "unknown").split(" · ")[-1][:60]
        by_original[orig] = by_original.get(orig, 0) + 1
        if r["chosen_listing"]:
            d = r["decision"] or "removed"
            decisions[d] = decisions.get(d, 0) + 1
        if r["outcome"] == "no_match":
            for rej in json.loads(r["rejected"] or "[]")[:3]:
                for reason in rej["reasons"][:1]:
                    k = _reason_kind(reason)
                    rejections[k] = rejections.get(k, 0) + 1
    items = products(con)
    groups = _search_groups(items)
    pending_calls = sum(1 for (m, _), ps in groups.items() if _search_cached(con, m, image_match.query_for(ps[0]["full_name"])) is None)
    return {"searched": len(rows), "outcomes": outcomes, "by_country": by_country, "by_original": dict(sorted(by_original.items(), key=lambda kv: -kv[1])),
            "decisions": decisions, "top_rejections": dict(sorted(rejections.items(), key=lambda kv: -kv[1])[:10]),
            "pending_products": sum(len(v) for v in groups.values()), "pending_searches": len(groups), "pending_calls_estimate": pending_calls,
            "quota": db.get_setting(con, "ebay_quota"), "job": dict(SEARCH_JOB)}


def search_rows(con) -> list[dict]:
    out = []
    for r in con.execute(
            """SELECT sl.*, i.code, i.country, i.name, i.variant,
                      (SELECT g.status FROM item_images g WHERE g.item_id = sl.item_id AND g.source_ref = sl.chosen_listing ORDER BY g.sort LIMIT 1) AS decision,
                      (SELECT g.confidence FROM item_images g WHERE g.item_id = sl.item_id AND g.source_ref = sl.chosen_listing ORDER BY g.sort LIMIT 1) AS confidence
               FROM image_search_log sl JOIN items i ON i.id = sl.item_id JOIN countries k ON k.key = i.country
               WHERE i.archived = 0 ORDER BY k.sort, i.seq"""):
        d = dict(r)
        d["rejected"] = json.loads(d["rejected"] or "[]")
        d["listing_url"] = _listing_url(d["chosen_listing"])
        out.append(d)
    return out


def _listing_url(ref: str | None) -> str | None:
    parts = (ref or "").split(":")
    if len(parts) >= 3 and parts[0] in ("search", "ebay") and parts[2].isdigit():
        return f"https://www.{MARKET_DOMAIN.get(parts[1], 'ebay.com')}/itm/{parts[2]}"
    return None


def _robots_allows(url: str) -> bool:
    parts = urllib.parse.urlsplit(url)
    rp = urllib.robotparser.RobotFileParser()
    try:
        req = urllib.request.Request(f"{parts.scheme}://{parts.netloc}/robots.txt", headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=15) as r:
            rp.parse(r.read().decode("utf-8", "replace").splitlines())
    except urllib.error.HTTPError as e:
        return e.code == 404
    except OSError:
        return False
    return rp.can_fetch(UA, url)


def _head_location(url: str) -> str | None:
    parts = urllib.parse.urlsplit(url)
    conn = http.client.HTTPSConnection(parts.netloc, timeout=15)
    try:
        conn.request("HEAD", parts.path + (f"?{parts.query}" if parts.query else ""), headers={"User-Agent": UA})
        resp = conn.getresponse()
        return resp.getheader("Location") if 300 <= resp.status < 400 else None
    finally:
        conn.close()


def expand_short_links(connect, head=_head_location, robots=_robots_allows, pause: float = 1.0) -> dict:
    """Replace ebay.us short links with the full listing link (one HEAD request each, no page is downloaded)."""
    from . import service

    with _lock:
        if SHORT_JOB["running"]:
            raise ImageError("Already expanding short links")
        SHORT_JOB.update(running=True, processed=0, total=0, expanded=0, refused=0, message="Starting", finished_at=None)
    con = connect()
    try:
        rows = con.execute("SELECT id, link FROM items WHERE archived = 0 AND link LIKE '%ebay.us/%'").fetchall()
        SHORT_JOB["total"] = len(rows)
        if rows and not robots(rows[0]["link"]):
            SHORT_JOB["message"] = "eBay's robots.txt does not allow this for ebay.us links. Paste full links instead."
            return dict(SHORT_JOB)
        for r in rows:
            try:
                target = head(r["link"])
            except OSError:
                target = None
            SHORT_JOB["processed"] += 1
            if target and "/n/error" in target:
                SHORT_JOB["refused"] += 1
            if target and classify(target)[0] in ("ebay", "ebay_product"):
                service.update_item(con, r["id"], {"link": target}, "Short eBay link expanded to the full listing link")
                SHORT_JOB["expanded"] += 1
            if pause:
                time.sleep(pause)
        if SHORT_JOB["expanded"] == 0 and SHORT_JOB["refused"]:
            SHORT_JOB["message"] = ("eBay does not expand these short links for automatic requests (it returns an error page), "
                                    "so they stay on the manual list. Paste the full listing link on a product, or upload a photo.")
        else:
            SHORT_JOB["message"] = f"Expanded {SHORT_JOB['expanded']} of {SHORT_JOB['total']} short links"
        db.set_setting(con, "short_links_result", {"at": db.now(), "expanded": SHORT_JOB["expanded"], "refused": SHORT_JOB["refused"],
                                                   "total": SHORT_JOB["total"], "message": SHORT_JOB["message"]})
        con.commit()
        return dict(SHORT_JOB)
    finally:
        SHORT_JOB["running"] = False
        SHORT_JOB["finished_at"] = db.now()
        con.close()


# ---------------------------------------------------------------- uploads

def process_photo(data: bytes) -> bytes:
    """Validate a photo, fix its rotation, remove metadata (location, camera) and resize it to at most 1600 px."""
    from PIL import Image, ImageOps

    Image.MAX_IMAGE_PIXELS = 60_000_000
    try:
        probe = Image.open(io.BytesIO(data))
        fmt = probe.format
        probe.verify()
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as exc:  # noqa: BLE001 - any decoding problem means it is not a usable photo
        raise ImageError("That file is not a readable photo. Use JPEG, PNG or WebP.") from exc
    if fmt not in ("JPEG", "PNG", "WEBP"):
        raise ImageError("Use JPEG, PNG or WebP photos")
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        background = Image.new("RGB", img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[-1])
        img = background
    img = img.convert("RGB")
    img.thumbnail((1600, 1600))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=86, optimize=True, progressive=True)
    return out.getvalue()


def save_upload(con, item_id: int, data: bytes, filename: str, rights_note: str, source: str = "manual_upload",
                status: str = "approved", note: str | None = None, sort: int | None = None) -> int:
    if not con.execute("SELECT 1 FROM items WHERE id = ?", (item_id,)).fetchone():
        raise KeyError(item_id)
    if len(data) > 25 * 1024 * 1024:
        raise ImageError("Photos must be smaller than 25 MB")
    if len((rights_note or "").strip()) < 3:
        raise ImageError("Confirm that you own the photo or have permission to use it")
    photo = process_photo(data)
    name = hashlib.sha256(photo).hexdigest()[:24] + ".jpg"
    config.IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    path = config.IMAGE_DIR / name
    if not path.exists():
        path.write_bytes(photo)
    if con.execute("SELECT 1 FROM item_images WHERE item_id = ? AND file = ? AND status != 'rejected'", (item_id, name)).fetchone():
        raise ImageError("This photo is already on that product")
    if sort is None:
        sort = (con.execute("SELECT MAX(sort) FROM item_images WHERE item_id = ? AND status != 'rejected'", (item_id,)).fetchone()[0] or 0) + 1
    ts = db.now()
    with con:
        image_id = con.execute(
            """INSERT INTO item_images (item_id, sort, file, source, source_ref, status, rights, note, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'owner_confirmed', ?, ?, ?)""",
            (item_id, sort, name, source, filename[:200], status, note or rights_note.strip()[:300], ts, ts),
        ).lastrowid
        db.audit(con, "item", item_id, "image-upload", {"image": [None, name]}, rights_note.strip()[:300])
    return image_id


def match_file(con, filename: str) -> tuple[list[int], int, str]:
    """Match a photo file name to products: by code (UK-0012.jpg, UK-0012-2.jpg) or by supplier SKU / item ID.
    Returns (item ids, photo order, how it matched)."""
    stem = Path(filename).stem.strip()
    m = CODE_FILE_RE.match(stem)
    if m:
        prefix, seq, order = m.group(1).upper(), int(m.group(2)), int(m.group(3) or 1)
        row = con.execute("SELECT i.id FROM items i JOIN countries c ON c.key = i.country WHERE c.prefix = ? AND i.seq = ?", (prefix, seq)).fetchone()
        if row:
            return [row["id"]], order, "code"
    ids = [r["item_id"] for r in con.execute(
        "SELECT o.item_id FROM offers o JOIN items i ON i.id = o.item_id WHERE i.archived = 0 AND (lower(o.supplier_sku) = lower(?) OR o.item_ref = ?)",
        (stem, stem))]
    return ids, 1, "sku" if ids else "none"


def import_files(con, files: list[tuple[str, bytes]], rights: str) -> dict:
    """Add photos named after product codes (or supplier SKUs / item IDs). ZIP files are unpacked."""
    if len((rights or "").strip()) < 3:
        raise ImageError("Confirm that you own these photos or have permission to use them")
    expanded: list[tuple[str, bytes]] = []
    for name, data in files:
        if name.lower().endswith(".zip"):
            try:
                with zipfile.ZipFile(io.BytesIO(data)) as z:
                    for info in z.infolist():
                        inner = Path(info.filename).name
                        if not info.is_dir() and inner.lower().endswith(PHOTO_TYPES) and not inner.startswith("."):
                            if info.file_size > 25 * 1024 * 1024:
                                continue
                            expanded.append((inner, z.read(info)))
            except zipfile.BadZipFile:
                expanded.append((name, b""))
        else:
            expanded.append((name, data))
    result = {"added": [], "to_review": [], "unmatched": [], "errors": []}
    codes = {r["id"]: r["code"] for r in con.execute("SELECT id, code FROM items")}
    for name, data in expanded:
        if not name.lower().endswith(PHOTO_TYPES):
            result["errors"].append({"file": name, "message": "Not a JPEG, PNG or WebP photo"})
            continue
        ids, order, how = match_file(con, name)
        if not ids:
            result["unmatched"].append(name)
            continue
        status = "approved" if len(ids) == 1 else "needs_review"
        note = None if len(ids) == 1 else f"Matched by SKU or item ID shared by {len(ids)} codes: check it fits this one"
        for item_id in ids:
            try:
                save_upload(con, item_id, data, name, rights, source="bulk_upload", status=status, note=note,
                            sort=order if how == "code" and order > 1 else None)
                (result["added"] if status == "approved" else result["to_review"]).append({"file": name, "code": codes[item_id]})
            except ImageError as exc:
                result["errors"].append({"file": name, "code": codes[item_id], "message": str(exc)})
    return result


def import_inbox(con, rights: str) -> dict:
    """Import every photo in the inbox folder. Imported files move to inbox\\imported; unmatched ones stay."""
    box = inbox_dir()
    box.mkdir(parents=True, exist_ok=True)
    paths = [p for p in box.iterdir() if p.is_file() and p.suffix.lower() in (*PHOTO_TYPES, ".zip")]
    if not paths:
        return {"added": [], "to_review": [], "unmatched": [], "errors": [], "message": "The inbox folder is empty"}
    result = import_files(con, [(p.name, p.read_bytes()) for p in paths], rights)
    done_dir = box / "imported" / datetime.now().strftime("%Y-%m-%d_%H%M%S")
    unmatched = set(result["unmatched"]) | {e["file"] for e in result["errors"]}
    for p in paths:
        if p.name not in unmatched:
            done_dir.mkdir(parents=True, exist_ok=True)
            shutil.move(str(p), done_dir / p.name)
    return result


def local_image(name: str) -> Path | None:
    if not re.fullmatch(r"[0-9a-f]{24}\.(jpg|png|webp)", name or ""):
        return None
    p = config.IMAGE_DIR / name
    return p if p.exists() else None


def set_status(con, image_id: int, action: str) -> None:
    row = con.execute("SELECT * FROM item_images WHERE id = ?", (image_id,)).fetchone()
    if row is None:
        raise KeyError(image_id)
    ts = db.now()
    with con:
        if action in ("approve", "reject"):
            new = "approved" if action == "approve" else "rejected"
            con.execute("UPDATE item_images SET status = ?, updated_at = ? WHERE id = ?", (new, ts, image_id))
            if row["source"] in ("ebay_api", "reference_image") and row["sort"] == 1:
                # The listing's other photos follow the decision on its main photo.
                con.execute("UPDATE item_images SET status = ?, updated_at = ? WHERE item_id = ? AND source = ? AND source_ref IS ? AND status != 'rejected'",
                            (new, ts, row["item_id"], row["source"], row["source_ref"]))
        elif action == "primary":
            con.execute("UPDATE item_images SET sort = sort + 1 WHERE item_id = ? AND sort < ?", (row["item_id"], row["sort"]))
            con.execute("UPDATE item_images SET sort = 1 WHERE id = ?", (image_id,))
        else:
            raise ImageError("Unknown action")
        db.audit(con, "item", row["item_id"], f"image-{action}", {"image": [row["status"], action]})


def item_images(con, item_id: int) -> list[dict]:
    return [_image_row(r) for r in con.execute("SELECT * FROM item_images WHERE item_id = ? ORDER BY status = 'rejected', sort, id", (item_id,))]


def _image_row(r) -> dict:
    d = dict(r)
    d["src"] = d["url"] or (f"/api/admin/images/file/{d['file']}" if d["file"] else None)
    d["listing_url"] = _listing_url(d.get("source_ref"))
    d["replacement"] = (d.get("source_ref") or "").startswith("search:")
    return d


def coverage(con) -> dict:
    keys = ("total", "publishable", "has_photo", "candidate", "not_looked_up", "manual_needed")
    out: dict[str, dict] = {}
    reasons: dict[str, int] = {}
    listings: set[str] = set()
    search_pending = 0
    for p in products(con):
        c = out.setdefault(p["country"], {k: 0 for k in keys} | {"publishable_with_photo": 0})
        c["total"] += 1
        pub = not p["blockers"]
        c["publishable"] += pub
        c[p["photo"]] += 1
        c["publishable_with_photo"] += pub and p["photo"] == "has_photo"
        if p["photo"] == "manual_needed":
            label = re.sub(r":.*$", "", p["photo_reason"]).replace(" (ebay.us)", "").replace(" (ebay.io)", "")
            label = "Link to another site" if label.startswith("Link to ") else label
            reasons[label] = reasons.get(label, 0) + 1
        if p["photo"] == "not_looked_up" and p["kind"] in ("ebay", "ebay_product") and not p["search_pending"]:
            listings.add(p["source_key"])
        search_pending += p["search_pending"]
    totals = {k: sum(c[k] for c in out.values()) for k in (*keys, "publishable_with_photo")}
    cached = {r[0] for r in con.execute("SELECT source_key FROM api_cache")}
    calls = len(listings - cached)
    return {"countries": out, "totals": totals, "manual_reasons": dict(sorted(reasons.items(), key=lambda kv: -kv[1])),
            "listings_to_look_up": calls, "days_needed": max(1, -(-calls // DAILY_CAP)) if calls else 0,
            "ebay_configured": vault.has("ebay"), "ebay_calls_today": _usage(con, "ebay"), "daily_cap": DAILY_CAP,
            "short_links": con.execute("SELECT COUNT(*) FROM items WHERE archived = 0 AND link LIKE '%ebay.us/%'").fetchone()[0],
            "short_links_result": db.get_setting(con, "short_links_result"), "job": dict(JOB), "short_job": dict(SHORT_JOB),
            "search_pending": search_pending, "search_job": dict(SEARCH_JOB), "ebay_quota": db.get_setting(con, "ebay_quota")}


def needed(con, status: str | None, country: str | None, q: str | None) -> list[dict]:
    words = [w for w in (q or "").lower().split() if w]
    out = []
    for p in products(con):
        if p["photo"] == "has_photo" and status != "has_photo":
            continue
        if status and p["photo"] != status:
            continue
        if country and p["country"] != country:
            continue
        if words and not all(w in f"{p['code']} {p['name']}".lower() for w in words):
            continue
        out.append({"id": p["id"], "code": p["code"], "country": p["country"], "name": p["name"], "variant": p["variant"],
                    "photo": p["photo"], "status_label": STATUS_LABEL[p["photo"]], "reason": p["photo_reason"], "link": p["link"],
                    "publishable": not p["blockers"]})
    return out


# ---------------------------------------------------------------- routes

def register_routes(admin, get_con) -> None:
    @admin.get("/images/coverage")
    def get_coverage(con=Depends(get_con)):
        return coverage(con)

    @admin.get("/images")
    def list_images(status: str = "needs_review", country: str | None = None, confidence: str | None = None, limit: int = 120, offset: int = 0,
                    con=Depends(get_con)):
        sql = """SELECT g.*, i.code, i.name, i.variant, i.country, i.link FROM item_images g JOIN items i ON i.id = g.item_id
                 WHERE g.status = ? AND g.id = (SELECT g2.id FROM item_images g2 WHERE g2.item_id = g.item_id AND g2.status = g.status ORDER BY g2.sort, g2.id LIMIT 1)
                 AND i.archived = 0"""
        args: list = [status]
        if country:
            sql += " AND i.country = ?"
            args.append(country)
        if confidence in ("high", "medium"):
            sql += " AND g.confidence = ?"
            args.append(confidence)
        elif confidence == "original":
            sql += " AND g.confidence IS NULL"
        total = con.execute(f"SELECT COUNT(*) FROM ({sql})", args).fetchone()[0]
        counts = {k or "original": n for k, n in con.execute(
            "SELECT g.confidence, COUNT(DISTINCT g.item_id) FROM item_images g JOIN items i ON i.id = g.item_id WHERE g.status = ? AND i.archived = 0 GROUP BY g.confidence",
            (status,))}
        rows = con.execute(sql + " ORDER BY g.confidence IS NULL, g.confidence = 'medium', g.score IS NULL, g.score DESC, i.country, i.seq LIMIT ? OFFSET ?",
                           (*args, min(limit, 500), offset)).fetchall()
        return {"total": total, "counts": counts, "images": [_image_row(r) for r in rows]}

    @admin.post("/images/bulk")
    def bulk_action(body: dict = Body(...), con=Depends(get_con)):
        ids = [int(i) for i in body.get("ids", [])][:2000]
        action = body.get("action")
        if action not in ("approve", "reject"):
            raise ImageError("Unknown action")
        for image_id in ids:
            set_status(con, image_id, action)
        return {"changed": len(ids)}

    @admin.post("/images/{image_id:int}")
    def image_action(image_id: int, body: dict = Body(...), con=Depends(get_con)):
        set_status(con, image_id, body.get("action", ""))
        return {"ok": True}

    @admin.get("/items/{item_id:int}/images")
    def get_item_images(item_id: int, con=Depends(get_con)):
        row = con.execute("SELECT link FROM items WHERE id = ?", (item_id,)).fetchone()
        if row is None:
            raise KeyError(item_id)
        check = con.execute("SELECT state, detail, checked_at FROM image_checks WHERE item_id = ?", (item_id,)).fetchone()
        kind, _, detail = classify(row["link"])
        return {"images": item_images(con, item_id), "check": dict(check) if check else None, "source": {"kind": kind, "detail": detail}}

    @admin.post("/items/{item_id:int}/images")
    async def upload_image(item_id: int, file: UploadFile = File(...), rights: str = Form(""), con=Depends(get_con)):
        image_id = save_upload(con, item_id, await file.read(), file.filename or "upload", rights)
        return {"id": image_id}

    @admin.post("/images/import")
    async def bulk_upload(files: list[UploadFile] = File(...), rights: str = Form(""), con=Depends(get_con)):
        if len(files) > 1000:
            raise ImageError("Upload at most 1,000 files at a time, or put them in a ZIP")
        data = [(f.filename or "upload", await f.read()) for f in files]
        return import_files(con, data, rights)

    @admin.post("/images/import-inbox")
    def inbox_import(body: dict = Body(default={}), con=Depends(get_con)):
        return import_inbox(con, body.get("rights", ""))

    @admin.get("/images/file/{name}")
    def image_file(name: str):
        path = local_image(name)
        if path is None:
            raise HTTPException(404)
        return FileResponse(path, headers={"Cache-Control": "private, max-age=86400"})

    @admin.get("/images/needed")
    def get_needed(status: str | None = None, country: str | None = None, q: str | None = None, limit: int = 200, offset: int = 0, con=Depends(get_con)):
        rows = needed(con, status, country, q)
        return {"total": len(rows), "products": rows[offset:offset + min(limit, 1000)]}

    @admin.get("/images/needed.csv")
    def needed_csv(status: str | None = None, country: str | None = None, con=Depends(get_con)):
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["Code", "Country", "Product", "Variant", "Photo status", "What to do", "Reference link", "Can be published"])
        for r in needed(con, status, country, None):
            w.writerow([r["code"], r["country"], r["name"], r["variant"] or "", r["status_label"], r["reason"], r["link"] or "", "yes" if r["publishable"] else "no"])
        return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": 'attachment; filename="ravisn-products-needing-photos.csv"'})

    @admin.get("/images/settings")
    def image_settings():
        return {"ebay_configured": vault.has("ebay"), "daily_cap": DAILY_CAP}

    @admin.put("/images/settings")
    def save_image_settings(body: dict = Body(...)):
        if body.get("remove"):
            vault.put("ebay", None)
            return {"ebay_configured": False}
        cid, secret = (body.get("client_id") or "").strip(), (body.get("client_secret") or "").strip()
        if not cid or not secret:
            raise ImageError("Paste both the App ID (Client ID) and the Cert ID (Client Secret)")
        if "-SBX-" in cid.upper():
            raise ImageError("Those are Sandbox keys. Use the Production keyset instead.")
        EbayClient(cid, secret).token()  # proves the keys work before saving them
        vault.put("ebay", {"client_id": cid, "client_secret": secret})
        return {"ebay_configured": True}

    @admin.post("/images/run")
    def start_lookup(body: dict = Body(default={})):
        if JOB["running"]:
            raise ImageError("A photo lookup is already running")
        limit = body.get("limit")
        threading.Thread(target=lambda: _safe(run_lookup, db.connect, limit), daemon=True, name="photo-lookup").start()
        time.sleep(0.3)
        return dict(JOB)

    @admin.post("/images/stop")
    def stop_lookup():
        JOB["stop"] = True
        return dict(JOB)

    @admin.post("/images/expand-short-links")
    def start_expand():
        if SHORT_JOB["running"]:
            raise ImageError("Already expanding short links")
        threading.Thread(target=lambda: _safe(expand_short_links, db.connect), daemon=True, name="short-links").start()
        time.sleep(0.3)
        return dict(SHORT_JOB)

    @admin.get("/images/job")
    def job_status():
        return {"job": dict(JOB), "short_job": dict(SHORT_JOB), "search_job": dict(SEARCH_JOB)}

    @admin.post("/images/search/run")
    def start_search(body: dict = Body(default={})):
        if SEARCH_JOB["running"]:
            raise ImageError("A replacement search is already running")
        if JOB["running"]:
            raise ImageError("Wait for the photo lookup to finish first")
        limit = body.get("limit")
        threading.Thread(target=lambda: _safe(run_search, db.connect, limit), daemon=True, name="photo-search").start()
        time.sleep(0.3)
        return dict(SEARCH_JOB)

    @admin.post("/images/search/stop")
    def stop_search():
        SEARCH_JOB["stop"] = True
        return dict(SEARCH_JOB)

    @admin.get("/images/search/report")
    def get_search_report(con=Depends(get_con)):
        return search_report(con)

    @admin.get("/images/search/report.csv")
    def search_report_csv(con=Depends(get_con)):
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["Code", "Country", "Product", "Variant", "What eBay said about the original listing", "Search used", "Result", "Confidence",
                    "Replacement listing title", "Replacement listing", "Your decision", "Listings checked", "Closest rejected listings (and why)"])
        labels = {"candidate_high": "Candidate, high confidence", "candidate_medium": "Candidate, medium confidence", "no_match": "No exact match",
                  "no_results": "No listings found", "error": "Search failed (will retry)"}
        decision = {"needs_review": "to check", "approved": "approved", "rejected": "rejected", "verified": "approved"}
        for r in search_rows(con):
            closest = " || ".join(f"{x['title']} — {'; '.join(x['reasons'])}" for x in r["rejected"][:3])
            w.writerow([r["code"], r["country"], r["name"], r["variant"] or "", r["original"] or "", r["query"], labels.get(r["outcome"], r["outcome"]),
                        r["confidence"] or "", r["chosen_title"] or "", r["listing_url"] or "", decision.get(r["decision"] or "", r["decision"] or ""),
                        r["considered"], closest])
        return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": 'attachment; filename="ravisn-replacement-photo-search.csv"'})


def _safe(fn, *args):
    try:
        fn(*args)
    except Exception:  # noqa: BLE001 - the message is kept for the admin panel
        pass
