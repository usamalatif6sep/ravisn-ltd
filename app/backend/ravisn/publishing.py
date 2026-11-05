"""Public reseller website releases.

A release is a folder of static files: the public website, plus JSON built from an explicit allowlist of
public fields read through the public_* database views. Products held back by the review checks are left
out. Every file is checked for private supplier information before the release is saved.

Draft releases are previewed locally. Only an approved release can be published, and publishing to
Cloudflare Pages needs the owner's own Cloudflare token and an explicit confirmation in the admin panel.
"""

import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone

from fastapi import Body, Depends

from . import addressing, config, db, issues, links, service, vault
from .importer import status_meanings_text
from .leaks import LeakScanner, allowances
from .reference import STATUS_NAMES

log = logging.getLogger(__name__)

SLUGS = {"UK": "uk", "USA": "usa", "Canada": "canada", "Germany": "germany", "Australia": "australia"}
PRODUCT_KEYS = ("code", "legacy", "name", "variant", "category", "department", "price", "tiers", "status", "availability", "qty", "qty_basis",
                "link", "link_site", "images", "illustrative", "group", "added", "fulfilment")
# Browsing departments, worked out from product names (first match wins). They help resellers browse; they are not claims.
DEPARTMENTS = [
    ("Fragrance", r"perfume|parfum|eau de|\bedp\b|\bedt\b|cologne|fragrance|body mist|\battar\b|\boud\b"),
    ("Pet Supplies", r"\bdogs?\b|\bcats?\b|\bpets?\b|puppy|kitten|feliway|frontline|flea|nutripaw"),
    ("Health & Wellness", r"supplement|capsule|\bcaps\b|vitamin|gumm|softgel|probiotic|collagen|omega|protein|nutrition|\bnad\b|magnesium|tablets?\b"),
    ("Beauty & Personal Care", r"serum|cream|moistur|lotion|skin|\blip|mascara|foundation|makeup|cosmetic|shampoo|conditioner|\bhair\b|nail|razor|toothbrush"),
    ("Toys & Collectibles", r"lego|\btoys?\b|pok[eé]mon|booster|\btcg\b|plush|figure|\bdoll|puzzle|funko|collectible"),
    ("Electronics & Gaming", r"controller|playstation|\bps[45]\b|xbox|nintendo|console|headphone|earbud|airpods|speaker|charger|camera|laptop|ipad|iphone|smart ?watch|gaming|keyboard|bluetooth|\busb\b"),
    ("Tools & DIY", r"makita|dewalt|milwaukee|bosch|\bdrill|grinder|\btools?\b|\bsaw\b|screwdriver"),
    ("Home, Kitchen & Garden", r"kitchen|cookware|\bpan\b|blender|tumbler|\bcups?\b|\bmugs?\b|bottle|vacuum|bedding|pillow|towel|candle|decor|garden|storage|\blamp|\bhome\b"),
    ("Fashion & Accessories", r"\bbags?\b|wallet|jewel|\bwatch\b|sunglasses|\bshoes?\b|sneaker|\bhat\b|scarf|\bbelt\b|tiffany|handbag"),
]


def department(name: str) -> str:
    n = (name or "").lower()
    return next((d for d, rx in DEPARTMENTS if re.search(rx, n)), "More Products")
COUNTRY_KEYS = ("key", "slug", "name", "currency", "symbol", "count", "available", "categories", "stock_text", "currency_text", "ordering", "policies")
SITE_KEYS = ("company", "whatsapp", "email", "generated", "release", "countries", "statuses", "indexing")
HIDDEN_LINKS = {"link_malformed", "link_redirect", "link_short", "link_private_host"}
SITE_NAMES = (("ebay.", "eBay"), ("amazon.", "Amazon"), ("walmart.", "Walmart"))
TEXT_SUFFIXES = {".json", ".html", ".js", ".css", ".txt", ".svg", ".map", ""}
DEFAULTS = {"site_whatsapp_display": "+92 342 6290958", "site_project": "ravisn-catalogue", "site_indexing": False}


class PublishError(Exception):
    pass


def setting(con, key):
    v = db.get_setting(con, key)
    return DEFAULTS.get(key) if v is None else v


def _link_site(url: str | None) -> str | None:
    host = links.host_of(url or "")
    return next((name for frag, name in SITE_NAMES if frag in host), "the reference site" if url else None)


def public_product(row, tiers: list, images: list[str], link: str | None, group: str | None, illustrative: bool = False,
                   fulfilment: dict | None = None) -> dict:
    """The complete public record of a product. Nothing outside this allowlist is ever published. "code" is the permanent
    Ravisn reference; "legacy" the original catalogue code, which keeps working in links and searches."""
    return {
        "code": row["ref"] or row["code"],
        "legacy": row["code"],
        "name": row["name"],
        "variant": row["variant"],
        "category": row["category"],
        "department": department(f"{row['name']} {row['variant'] or ''}"),
        "price": None if tiers else row["price_minor"],
        "tiers": [[label, price] for label, price in tiers] or None,
        "status": row["status"],
        "availability": row["availability"],
        "qty": row["qty"],
        "qty_basis": row["qty_basis"],
        "link": link,
        "link_site": _link_site(link),
        "images": images,
        "illustrative": bool(images) and illustrative,
        "group": group,
        "added": (row["created_at"] or "")[:10] or None,
        "fulfilment": fulfilment,
    }


def dept_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower().replace("&", "and")).strip("-")


def home_data(products: dict[str, list[dict]]) -> dict:
    """Small selections for the homepage, taken from the published records only (so nothing new is exposed)."""
    def good(p):
        return bool(p["images"]) and p["availability"] == "available" and not p["illustrative"]

    deps: dict[str, dict] = {}
    for slug, items in products.items():
        for p in items:
            d = deps.setdefault(p["department"], {"name": p["department"], "slug": dept_slug(p["department"]), "count": 0, "image": None,
                                                  "countries": []})
            d["count"] += 1
            if slug not in d["countries"]:
                d["countries"].append(slug)
            if d["image"] is None and good(p):
                d["image"] = p["images"][0]
    departments = sorted(deps.values(), key=lambda d: (d["name"] == "More Products", -d["count"]))
    pools = {d["name"]: [(s, p) for s, items in products.items() for p in items if p["department"] == d["name"] and good(p)] for d in departments}
    featured, seen = [], set()
    for rnd in range(6):  # round-robin: variety of departments and countries
        for d in departments:
            pool = pools[d["name"]]
            for s, p in pool[rnd * 7: rnd * 7 + 7]:
                key = p["name"].lower()[:40]
                if key not in seen and p["price"] is not None or (key not in seen and p["tiers"]):
                    seen.add(key)
                    featured.append({"slug": s, "product": p})
                    break
            if len(featured) >= 12:
                break
        if len(featured) >= 12:
            break
    def seq(p):
        m = re.search(r"(\d+)$", p["legacy"] or "")
        return int(m.group(1)) if m else 0
    recent = sorted(((s, p) for s, items in products.items() for p in items if good(p)), key=lambda sp: (sp[1]["added"] or "", seq(sp[1])), reverse=True)
    recent_out, names = [], set()
    for s, p in recent:
        if p["name"].lower()[:40] not in names:
            names.add(p["name"].lower()[:40])
            recent_out.append({"slug": s, "product": p})
        if len(recent_out) >= 12:
            break
    countries = {s: [p["images"][0] for p in items if good(p)][:4] for s, items in products.items()}
    hero = []
    for s, items in products.items():
        best = next((p for p in items if good(p) and p["department"] != "More Products"), None)
        if best:
            hero.append({"kind": "country", "slug": s, "image": best["images"][0], "product": best["code"], "product_name": best["name"]})
    for d in departments[:3]:
        s, p = next(iter(pools[d["name"]]), (None, None))
        if p:
            hero.append({"kind": "department", "slug": d["slug"], "name": d["name"], "image": p["images"][0], "product": p["code"], "product_name": p["name"],
                         "country": s})
    return {"departments": departments, "featured": featured, "recent": recent_out, "countries": countries, "hero": hero[:6], "video": None}


def public_fulfilment(row) -> dict | None:
    """Only verified, customer-safe dispatch facts: never a supplier name, address or contact."""
    if row is None or not row["verified"]:
        return None
    cutoff = " ".join(x for x in (row["dispatch_cutoff"], row["cutoff_timezone"]) if x)
    out = {"dispatch_cutoff": cutoff or None, "dispatch_estimate": row["dispatch_estimate"], "carriers": row["carriers"],
           "shipping_methods": row["shipping_methods"], "labels": row["label_arrangements"], "tracking": row["tracking_arrangements"],
           "verified_at": (row["verified_at"] or "")[:10] or None}
    return {k: v for k, v in out.items() if v} or None


def _ordering(country_steps: list[str]) -> list[str]:
    web = [
        "Find the product and open its reference link to check the photos, size, variation and full description.",
        "Choose the option and quantity, add it to your order, and enter the recipient's delivery details.",
        "Review and send the order request. Ravisn Ltd confirms stock, price and delivery with you before payment.",
    ]
    return web + country_steps[3:]


def _policies(con, key: str, used: list[str]) -> list[dict]:
    defs = {r["name"]: r["definition"] for r in con.execute("SELECT name, definition FROM statuses")}
    out = []
    for sec in con.execute("SELECT id, heading FROM policy_sections WHERE country = ? ORDER BY sort", (key,)).fetchall():
        items = []
        for it in con.execute("SELECT title, body, generated FROM policy_items WHERE section_id = ? ORDER BY sort", (sec["id"],)):
            body = status_meanings_text(defs, used) if it["generated"] == "status_meanings" else it["body"]
            items.append({"title": it["title"], "body": body})
        out.append({"heading": sec["heading"], "items": items})
    return out


def collect(con) -> tuple[dict, dict[str, list[dict]], dict, list[str]]:
    """Build every public record. Returns (site, products by slug, report, local image files)."""
    issues.evaluate(con)
    report = {"countries": {}, "totals": {}}
    files: list[str] = []
    wa_display = setting(con, "site_whatsapp_display")
    wa_number = re.sub(r"\D", "", db.get_setting(con, "whatsapp_link") or wa_display)
    site = {
        "company": db.get_setting(con, "company"),
        "whatsapp": {"display": wa_display, "number": wa_number},
        "email": db.get_setting(con, "email"),
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "release": None,
        "countries": [],
        "statuses": [{"name": s["name"], "availability": s["availability"], "definition": s["definition"]}
                     for s in con.execute("SELECT * FROM statuses ORDER BY sort")],
        "indexing": bool(setting(con, "site_indexing")),
    }
    products: dict[str, list[dict]] = {}
    for c in con.execute("SELECT * FROM countries ORDER BY sort").fetchall():
        key = c["key"]
        rows = con.execute("SELECT * FROM public_catalogue WHERE country = ? ORDER BY seq", (key,)).fetchall()
        blockers = issues.blockers_by_item(con, key)
        hidden_links = {r["item_id"] for r in con.execute(
            f"SELECT item_id FROM issues WHERE state = 'open' AND country = ? AND kind IN ({','.join('?' * len(HIDDEN_LINKS))}) AND group_key IS NULL",
            (key, *HIDDEN_LINKS))}
        tiers: dict[int, list] = {}
        for t in con.execute("SELECT t.* FROM public_price_tiers t JOIN items i ON i.id = t.item_id WHERE i.country = ? ORDER BY t.item_id, t.sort", (key,)):
            tiers.setdefault(t["item_id"], []).append((t["label"], t["price_minor"]))
        fulfil = {f["item_id"]: public_fulfilment(f) for f in con.execute(
            "SELECT o.item_id, sf.* FROM offers o JOIN items i ON i.id = o.item_id JOIN supplier_fulfilment sf ON sf.supplier_id = o.supplier_id WHERE i.country = ?", (key,))}
        imgs: dict[int, list[str]] = {}
        illustrative: dict[int, bool] = {}
        for g in con.execute("SELECT p.* FROM public_images p JOIN items i ON i.id = p.item_id WHERE i.country = ? ORDER BY p.item_id, p.sort", (key,)):
            illustrative.setdefault(g["item_id"], bool(g["illustrative"]))
            if g["url"]:
                imgs.setdefault(g["item_id"], []).append(g["url"])
            elif g["file"]:
                imgs.setdefault(g["item_id"], []).append(f"/img/{g['file']}")
                files.append(g["file"])
        # Variations are shown only when the owner has named them: codes sharing a listing, each with a variant.
        groups: dict[tuple, list] = {}
        for r in rows:
            if r["variant"] and r["link"]:
                groups.setdefault((links.normalise(r["link"]), r["name"].strip().lower()), []).append(r["code"])
        group_of = {code: hashlib.sha1("|".join(codes).encode()).hexdigest()[:10] for codes in groups.values() if len(codes) > 1 for code in codes}
        excluded: dict[str, int] = {}
        out = []
        for r in rows:
            if r["id"] in blockers:
                for reason in blockers[r["id"]]:
                    excluded[reason] = excluded.get(reason, 0) + 1
                continue
            link = None if r["id"] in hidden_links else links.clean(r["link"])
            out.append(public_product(r, tiers.get(r["id"], []), imgs.get(r["id"], [])[:6], link, group_of.get(r["code"]), illustrative.get(r["id"], False),
                                      fulfil.get(r["id"])))
        slug = SLUGS[key]
        products[slug] = out
        used = sorted({p["status"] for p in out}, key=STATUS_NAMES.index)
        cats: dict[str, int] = {}
        for p in out:
            cats[p["category"]] = cats.get(p["category"], 0) + 1
        site["countries"].append({
            "key": key, "slug": slug, "name": c["name"], "currency": c["currency"], "symbol": c["symbol"],
            "count": len(out), "available": sum(1 for p in out if p["availability"] == "available"),
            "categories": [k for k, _ in sorted(cats.items(), key=lambda kv: -kv[1])],
            "stock_text": c["stock_text"], "currency_text": c["currency_text"],
            "ordering": _ordering(json.loads(c["how_to_order"])), "policies": _policies(con, key, used),
        })
        report["countries"][key] = {"published": len(out), "excluded": sum(1 for r in rows if r["id"] in blockers), "reasons": excluded,
                                    "with_images": sum(1 for p in out if p["images"]), "links_hidden": sum(1 for p in out if p["link"] is None)}
    t = report["totals"]
    for c in report["countries"].values():
        for k in ("published", "excluded", "with_images", "links_hidden"):
            t[k] = t.get(k, 0) + c[k]
    return site, products, report, sorted(set(files))


# ---------------------------------------------------------------- privacy gate

def _private_strings(con) -> list[str]:
    """Free-text private values that must never appear in public files."""
    # "Shown in their sheet" holds a product name as the supplier writes it, which is public anyway, so it is not checked.
    out = set()
    for (v,) in con.execute("SELECT note FROM offers WHERE note IS NOT NULL UNION SELECT note FROM suppliers WHERE note IS NOT NULL "
                            "UNION SELECT whatsapp_groups FROM suppliers WHERE whatsapp_groups IS NOT NULL"):
        v = (v or "").strip()
        if len(v) >= 12:
            out.add(v.lower())
    return sorted(out)


def check_public_data(con, site: dict, products: dict[str, list[dict]]) -> list[str]:
    """Structural and content checks on the public records. Returns a list of problems (empty = safe)."""
    problems = []
    if set(site) != set(SITE_KEYS):
        problems.append(f"site.json has unexpected keys: {sorted(set(site) ^ set(SITE_KEYS))}")
    for c in site["countries"]:
        if set(c) != set(COUNTRY_KEYS):
            problems.append(f"{c.get('key')} has unexpected keys: {sorted(set(c) ^ set(COUNTRY_KEYS))}")
    scanner = LeakScanner(con)
    allowed = allowances(con)
    ids = {r["code"]: r["id"] for r in con.execute("SELECT id, code FROM items")} | {r["ref"]: r["id"] for r in con.execute("SELECT id, ref FROM items WHERE ref IS NOT NULL")}
    for slug, items in products.items():
        for p in items:
            if tuple(p) != PRODUCT_KEYS:
                problems.append(f"{p.get('code')} has unexpected fields")
                continue
            fl = p["fulfilment"] or {}
            for field, value in fl.items():
                for kind, desc, h in scanner.scan(value):
                    problems.append(f"{p['code']} fulfilment {field}: {desc}")
            for field in ("name", "variant", "category", "link"):
                for kind, desc, h in scanner.scan(p[field]):
                    if not any((ids.get(p["code"]), f, h) in allowed for f in ("name", "variant", "category", "link", "more_link")):
                        problems.append(f"{p['code']} {field}: {desc}")
            for u in p["images"]:
                if not (u.startswith("https://i.ebayimg.com/") or re.fullmatch(r"/img/[0-9a-f]{24}\.(jpg|png|webp)", u)):
                    problems.append(f"{p['code']}: image from an unexpected address")
    text = json.dumps(site, ensure_ascii=False)
    for _, desc, _ in scanner.scan(text):
        problems.append(f"site information: {desc}")
    return problems


def scan_folder(con, folder) -> list[str]:
    """Final gate on the finished release: no supplier contact, SKU or private note in any text file."""
    scanner = LeakScanner(con)
    scanner.names = []  # names are checked per product above, where confirmed coincidences are known
    secrets_ = [s.lower() for s in _private_strings(con)]
    problems = []
    for path in folder.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        rel = path.relative_to(folder).as_posix()
        for _, desc, _ in scanner.scan(text):
            problems.append(f"{rel}: {desc}")
        low = text.lower()
        for s in secrets_:
            if s in low:
                problems.append(f"{rel}: a private note")
        for word in ("cost_minor", "supplier_id", "supplier_sku", "item_ref", "source_tab", "source_row", "source_link"):
            if word in text:
                problems.append(f"{rel}: private field name {word}")
    return problems


# ---------------------------------------------------------------- releases

HEADERS = """/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; img-src 'self' https://i.ebayimg.com data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
/data/*
  Cache-Control: no-cache
/assets/*
  Cache-Control: public, max-age=31536000, immutable
"""


def build_release(con) -> dict:
    index = config.PUBLIC_SITE_DIST / "index.html"
    if not index.exists():
        raise PublishError("The public website has not been built yet")
    site, products, report, files = collect(con)
    problems = check_public_data(con, site, products)
    if problems:
        raise PublishError("Release stopped by the privacy check: " + "; ".join(problems[:6]))
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    with con:
        rid = con.execute("INSERT INTO releases (created_at, folder, state, summary) VALUES (?, '', 'draft', '{}')", (db.now(),)).lastrowid
    folder = config.RELEASE_DIR / f"r{rid:04d}-{stamp}"
    try:
        shutil.copytree(config.PUBLIC_SITE_DIST, folder)
        site["release"] = rid
        (folder / "data").mkdir(exist_ok=True)
        (folder / "data" / "site.json").write_text(json.dumps(site, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        for slug, items in products.items():
            (folder / "data" / f"{slug}.json").write_text(json.dumps(items, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        (folder / "data" / "home.json").write_text(json.dumps(home_data(products), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        if files:
            (folder / "img").mkdir(exist_ok=True)
            for name in files:
                shutil.copy2(config.IMAGE_DIR / name, folder / "img" / name)
        worker = config.DEPLOY_DIR / "worker" / "worker.js"
        if worker.exists():
            # Orders and chat on Cloudflare: the storefront Worker, with the delivery-country rules built in.
            rules = json.dumps(addressing.COUNTRIES, ensure_ascii=False)
            (folder / "_worker.js").write_text(worker.read_text(encoding="utf-8").replace("/*RULES*/ null", rules), encoding="utf-8")
        (folder / "_headers").write_text(HEADERS + ("" if site["indexing"] else "/*\n  X-Robots-Tag: noindex\n"), encoding="utf-8")
        (folder / "robots.txt").write_text("User-agent: *\n" + ("Allow: /\n" if site["indexing"] else "Disallow: /\n"), encoding="utf-8")
        problems = scan_folder(con, folder)
        if problems:
            raise PublishError("Release stopped by the privacy check: " + "; ".join(problems[:6]))
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        with con:
            con.execute("DELETE FROM releases WHERE id = ?", (rid,))
        raise
    all_files = [p for p in folder.rglob("*") if p.is_file()]
    report.update(files=len(all_files), bytes=sum(p.stat().st_size for p in all_files),
                  public_fields=list(PRODUCT_KEYS), privacy_check="passed")
    with con:
        con.execute("UPDATE releases SET folder = ?, summary = ? WHERE id = ?", (folder.name, json.dumps(report), rid))
        db.audit(con, "release", rid, "build", {"products": [None, report["totals"]["published"]]})
    set_preview(folder.name, rid)
    return release(con, rid)


def set_preview(folder_name: str, rid: int) -> None:
    config.PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    (config.PUBLIC_DIR / "preview.json").write_text(json.dumps({"folder": folder_name, "release": rid}))


def preview_folder():
    try:
        state = json.loads((config.PUBLIC_DIR / "preview.json").read_text())
        folder = config.RELEASE_DIR / state["folder"]
        return folder if folder.is_dir() else None
    except (OSError, ValueError, KeyError):
        return None


def release(con, rid: int) -> dict:
    r = con.execute("SELECT * FROM releases WHERE id = ?", (rid,)).fetchone()
    if r is None:
        raise KeyError(rid)
    return {**dict(r), "summary": json.loads(r["summary"])}


def approve(con, rid: int) -> dict:
    r = release(con, rid)
    if r["state"] not in ("draft", "approved"):
        raise PublishError("Only a draft release can be approved")
    if not (config.RELEASE_DIR / r["folder"]).is_dir():
        raise PublishError("The release files are missing. Build a new release.")
    with con:
        con.execute("UPDATE releases SET state = 'superseded' WHERE state = 'approved' AND id != ?", (rid,))
        con.execute("UPDATE releases SET state = 'approved', approved_at = ? WHERE id = ?", (db.now(), rid))
        db.audit(con, "release", rid, "approve", {"state": [r["state"], "approved"]})
    set_preview(r["folder"], rid)
    return release(con, rid)


def write_pages_config(project: str, folder, store: dict) -> None:
    """wrangler.toml for the Pages project: binds the order database (D1) to the storefront Worker."""
    (config.DEPLOY_DIR / "wrangler.toml").write_text(
        f'name = "{project}"\npages_build_output_dir = "{folder.as_posix()}"\ncompatibility_date = "2026-10-01"\n\n'
        f'[[d1_databases]]\nbinding = "DB"\ndatabase_name = "{store["database_name"]}"\ndatabase_id = "{store["database_id"]}"\n',
        encoding="utf-8")


def setup_order_service(con, confirm: str, run=subprocess.run) -> dict:
    """Owner's explicit action: create the Cloudflare D1 database for orders and chats and set the Worker's secrets.
    Needs the owner's Cloudflare token. Nothing about suppliers or the catalogue database is uploaded."""
    import secrets as _secrets

    project = setting(con, "site_project")
    if (confirm or "").strip() != project:
        raise PublishError(f"Type the project name “{project}” to confirm")
    creds = vault.get("cloudflare")
    if not creds:
        raise PublishError("Add your Cloudflare account ID and API token in Website settings first")
    cmd = wrangler_cmd()
    if cmd is None:
        raise PublishError("The Cloudflare publishing tool is not installed")
    env = {**os.environ, "CLOUDFLARE_API_TOKEN": creds["api_token"], "CLOUDFLARE_ACCOUNT_ID": creds["account_id"], "WRANGLER_SEND_METRICS": "false", "CI": "1"}

    def call(args, stdin=None):
        p = run([*cmd, *args], env=env, input=stdin, capture_output=True, text=True, timeout=300, cwd=config.DEPLOY_DIR)
        return p.returncode, (p.stdout or "") + (p.stderr or "")

    call(["pages", "project", "create", project, "--production-branch", "main"])
    name = f"{project}-orders"
    store = db.get_setting(con, "cloud_store")
    if not store:
        code, out = call(["d1", "create", name])
        m = re.search(r"database_id\s*=\s*\"?([0-9a-f-]{36})", out) or re.search(r"\"uuid\"\s*:\s*\"([0-9a-f-]{36})", out)
        if code != 0 or not m:
            raise PublishError("Cloudflare did not create the order database: " + (out.strip().splitlines() or ["unknown error"])[-1][:300])
        store = {"database_name": name, "database_id": m.group(1)}
    remote = vault.get("storefront_remote") or {}
    store_secret = remote.get("store_secret") or _secrets.token_hex(32)
    admin_token = remote.get("token") or _secrets.token_urlsafe(40)
    for key, value in (("STORE_SECRET", store_secret), ("ADMIN_TOKEN", admin_token)):
        code, out = call(["pages", "secret", "put", key, "--project-name", project], stdin=value)
        if code != 0:
            raise PublishError(f"Cloudflare did not accept the {key} secret: " + (out.strip().splitlines() or ["unknown error"])[-1][:300])
    vault.put("storefront_remote", {"url": f"https://{project}.pages.dev", "token": admin_token, "store_secret": store_secret})
    with con:
        db.set_setting(con, "cloud_store", store)
        db.audit(con, "release", None, "order-service", {"database": [None, store["database_name"]]})
    return {"database": store["database_name"], "url": f"https://{project}.pages.dev"}


def wrangler_cmd() -> list[str] | None:
    js = config.DEPLOY_DIR / "node_modules" / "wrangler" / "bin" / "wrangler.js"
    if not (js.exists() and config.NODE_EXE.exists()):
        return None
    return [str(config.NODE_EXE), str(js)]


def deploy(con, rid: int, confirm: str) -> dict:
    """Upload an approved release to Cloudflare Pages. Called only from the owner's explicit action."""
    r = release(con, rid)
    project = setting(con, "site_project")
    if r["state"] not in ("approved", "published"):
        raise PublishError("Approve the release before publishing it")
    if (confirm or "").strip() != project:
        raise PublishError(f"Type the project name “{project}” to confirm publishing")
    creds = vault.get("cloudflare")
    if not creds:
        raise PublishError("Add your Cloudflare account ID and API token in Website settings first")
    cmd = wrangler_cmd()
    if cmd is None:
        raise PublishError("The Cloudflare publishing tool is not installed")
    folder = config.RELEASE_DIR / r["folder"]
    problems = scan_folder(con, folder)
    if problems:
        raise PublishError("Publishing stopped by the privacy check: " + "; ".join(problems[:6]))
    store = db.get_setting(con, "cloud_store")
    if (folder / "_worker.js").exists() and not store:
        raise PublishError("Set up the order service first (Website › Order service), so orders and chats have a secure database")
    if store:
        write_pages_config(project, folder, store)
    env = {**os.environ, "CLOUDFLARE_API_TOKEN": creds["api_token"], "CLOUDFLARE_ACCOUNT_ID": creds["account_id"], "WRANGLER_SEND_METRICS": "false",
           "CI": "1"}
    create = subprocess.run([*cmd, "pages", "project", "create", project, "--production-branch", "main"], env=env, capture_output=True,
                            text=True, timeout=180, cwd=config.DEPLOY_DIR)
    if create.returncode != 0 and "already exists" not in (create.stdout + create.stderr).lower():
        log.warning("project create: %s", create.stderr[-2000:])
    run = subprocess.run([*cmd, "pages", "deploy", str(folder), "--project-name", project, "--branch", "main", "--commit-dirty=true"],
                         env=env, capture_output=True, text=True, timeout=900, cwd=config.DEPLOY_DIR)
    out = run.stdout + run.stderr
    if run.returncode != 0:
        raise PublishError("Cloudflare did not accept the upload: " + out.strip().splitlines()[-1][:300] if out.strip() else "unknown error")
    url = f"https://{project}.pages.dev"
    with con:
        con.execute("UPDATE releases SET state = 'superseded' WHERE state = 'published' AND id != ?", (rid,))
        con.execute("UPDATE releases SET state = 'published', published_at = ?, published_url = ? WHERE id = ?", (db.now(), url, rid))
        db.audit(con, "release", rid, "publish", {"url": [None, url]})
    return release(con, rid)


# ---------------------------------------------------------------- routes

def register_routes(admin, get_con) -> None:
    @admin.get("/website")
    def website(con=Depends(get_con)):
        rels = [{**dict(r), "summary": json.loads(r["summary"])} for r in con.execute("SELECT * FROM releases ORDER BY id DESC LIMIT 20")]
        prev = preview_folder()
        return {
            "releases": rels,
            "preview": {"url": f"http://{config.HOST}:{config.PUBLIC_PORT}/", "folder": prev.name if prev else None},
            "site_built": (config.PUBLIC_SITE_DIST / "index.html").exists(),
            "publisher_installed": wrangler_cmd() is not None,
            "settings": {k: setting(con, k) for k in DEFAULTS},
            "cloudflare_configured": vault.has("cloudflare"),
            "order_service": db.get_setting(con, "cloud_store"),
        }

    @admin.post("/website/order-service")
    def order_service(body: dict = Body(...), con=Depends(get_con)):
        return setup_order_service(con, body.get("confirm", ""))

    @admin.post("/website/releases")
    def new_release(con=Depends(get_con)):
        return build_release(con)

    @admin.post("/website/releases/{rid}/approve")
    def approve_release(rid: int, con=Depends(get_con)):
        return approve(con, rid)

    @admin.post("/website/releases/{rid}/preview")
    def preview_release(rid: int, con=Depends(get_con)):
        r = release(con, rid)
        if not (config.RELEASE_DIR / r["folder"]).is_dir():
            raise PublishError("The release files are missing")
        set_preview(r["folder"], rid)
        return {"ok": True}

    @admin.post("/website/releases/{rid}/deploy")
    def deploy_release(rid: int, body: dict = Body(...), con=Depends(get_con)):
        return deploy(con, rid, body.get("confirm", ""))

    @admin.put("/website/settings")
    def save_site_settings(body: dict = Body(...), con=Depends(get_con)):
        with con:
            if "site_whatsapp_display" in body:
                v = (body["site_whatsapp_display"] or "").strip()
                if not re.fullmatch(r"\+?[\d ()-]{8,20}", v):
                    raise service.ValidationError("Enter the WhatsApp number as it should appear, e.g. +92 342 6290958")
                db.set_setting(con, "site_whatsapp_display", v)
            if "site_project" in body:
                v = (body["site_project"] or "").strip().lower()
                if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,56}[a-z0-9]", v):
                    raise service.ValidationError("Use lowercase letters, numbers and hyphens for the project name")
                db.set_setting(con, "site_project", v)
            if "site_indexing" in body:
                db.set_setting(con, "site_indexing", bool(body["site_indexing"]))
        return {k: setting(con, k) for k in DEFAULTS}

    @admin.put("/website/credentials")
    def save_credentials(body: dict = Body(...)):
        if body.get("remove"):
            vault.put("cloudflare", None)
            return {"cloudflare_configured": False}
        account, token = (body.get("account_id") or "").strip(), (body.get("api_token") or "").strip()
        if not re.fullmatch(r"[0-9a-f]{32}", account) or len(token) < 20:
            raise service.ValidationError("Enter the 32-character account ID and the API token from Cloudflare")
        vault.put("cloudflare", {"account_id": account, "api_token": token})
        return {"cloudflare_configured": True}
