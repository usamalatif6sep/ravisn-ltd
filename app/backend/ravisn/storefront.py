"""The reseller storefront: orders and chats sent from the public website.

Customer data lives in its own database (data/storefront.db), apart from the private catalogue database. The public
server opens only this file and the published catalogue files, never supplier records, so nothing it answers can
contain supplier names, contacts, costs or private SKUs. Prices are always taken from the published catalogue, never
from the browser. A submitted order is a request: Ravisn Ltd confirms stock, price and delivery, then asks for payment.

In production the same API runs as a Cloudflare Pages Worker with a D1 database (app/deploy/worker); the admin panel
then syncs orders and chats from it (storefront_sync.py).
"""

import hashlib
import hmac
import json
import re
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import addressing, config

ORDER_STATUSES = ["New", "Awaiting confirmation", "Supplier contacted", "Processing", "Dispatched", "Delivered", "Cancelled"]
PAYMENT_STATUSES = ["Pending confirmation", "Awaiting payment", "Paid", "Refunded"]
CLOSED_STATUSES = {"Delivered", "Cancelled"}
WHATSAPP = "+92 342 6290958"
TEAM_JOINED = "You're now chatting with the Ravisn Ltd team."
TEAM_AWAY = ("Need a little more help? You can leave us a message here, and we'll get back to you. "
             "For urgent assistance, you can also contact us on WhatsApp.")
TEAM_REQUESTED = "Thanks. A member of the Ravisn Ltd team will join this chat as soon as they can. You can keep typing here."
LEFT_MESSAGE = "Thanks, your message has been saved. The Ravisn Ltd team will reply here or contact you using the details you gave."
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"  # no 0/O, 1/I/L, U
ONLINE_SECONDS = 120
LIMITS = {"order": (6, 3600), "order_day": (20, 86400), "chat_start": (10, 3600), "chat_msg": (40, 600)}
DEFAULT_RETENTION = {"chat_days": 90, "order_personal_days": 730}

SCHEMA = [
    """
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        number TEXT NOT NULL UNIQUE,
        idem_key TEXT UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        catalogue TEXT NOT NULL,
        currency TEXT NOT NULL,
        symbol TEXT NOT NULL,
        subtotal_minor INTEGER NOT NULL,
        prices_pending INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        payment_status TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        recipient_name TEXT NOT NULL,
        address_country TEXT NOT NULL,
        address1 TEXT NOT NULL,
        address2 TEXT,
        city TEXT NOT NULL,
        region TEXT,
        postcode TEXT,
        instructions TEXT,
        carrier TEXT,
        tracking TEXT,
        release INTEGER,
        client TEXT,
        seen_at TEXT,
        erased_at TEXT
    ) STRICT;
    CREATE INDEX orders_created ON orders(created_at);
    CREATE TABLE order_items (
        id INTEGER PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        option TEXT,
        qty INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 999),
        unit_minor INTEGER,
        line_minor INTEGER,
        status TEXT NOT NULL,
        link TEXT
    ) STRICT;
    CREATE TABLE order_events (
        id INTEGER PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        at TEXT NOT NULL,
        actor TEXT NOT NULL CHECK (actor IN ('reseller', 'admin', 'system')),
        kind TEXT NOT NULL,
        detail TEXT NOT NULL
    ) STRICT;
    CREATE TABLE chats (
        id INTEGER PRIMARY KEY,
        public_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_message_at TEXT,
        status TEXT NOT NULL CHECK (status IN ('open', 'closed', 'archived')),
        mode TEXT NOT NULL CHECK (mode IN ('assistant', 'waiting', 'human')),
        name TEXT,
        contact TEXT,
        page TEXT,
        unread INTEGER NOT NULL DEFAULT 0,
        client TEXT
    ) STRICT;
    CREATE TABLE chat_messages (
        id INTEGER PRIMARY KEY,
        chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        at TEXT NOT NULL,
        sender TEXT NOT NULL CHECK (sender IN ('visitor', 'assistant', 'team', 'system')),
        body TEXT NOT NULL
    ) STRICT;
    CREATE INDEX chat_messages_chat ON chat_messages(chat_id, id);
    CREATE TABLE rate (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires REAL NOT NULL) STRICT;
    """,
    # v2: annual order references (RVS-2026-000184), Ravisn product references on lines, shipping arrangements and labels.
    """
    CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL) STRICT;
    ALTER TABLE orders ADD COLUMN legacy_number TEXT;
    CREATE UNIQUE INDEX orders_legacy_number ON orders(legacy_number);
    ALTER TABLE order_items ADD COLUMN legacy_code TEXT;
    ALTER TABLE order_items ADD COLUMN shipment_id INTEGER;
    CREATE TABLE shipments (
        id INTEGER PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        arranged_by TEXT NOT NULL CHECK (arranged_by IN ('reseller', 'ravisn')),
        carrier TEXT,
        service TEXT,
        tracking TEXT,
        instructions TEXT,
        label_status TEXT NOT NULL DEFAULT 'none' CHECK (label_status IN ('none', 'submitted', 'approved', 'rejected')),
        label_note TEXT,
        charge_minor INTEGER,
        payment_status TEXT NOT NULL DEFAULT 'not_applicable' CHECK (payment_status IN ('not_applicable', 'quote_pending', 'awaiting_payment', 'paid')),
        address_requested INTEGER NOT NULL DEFAULT 0,
        dispatch_status TEXT NOT NULL DEFAULT 'pending' CHECK (dispatch_status IN ('pending', 'dispatched')),
        dispatched_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE labels (
        id INTEGER PRIMARY KEY,
        shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        data BLOB NOT NULL,
        uploaded_at TEXT NOT NULL,
        current INTEGER NOT NULL DEFAULT 1
    ) STRICT;
    """,
]
SHIPPING_NOTE = ("Shipping is arranged and paid for by the reseller. You may provide your own prepaid label or request a shipping quote "
                 "from Ravisn.")
LABEL_TYPES = {"application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
LABEL_MAX = 1_500_000  # also fits Cloudflare D1's row limit


class StoreError(ValueError):
    def __init__(self, message: str, fields: dict | None = None, status: int = 422):
        super().__init__(message)
        self.fields = fields or {}
        self.status = status


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------- database

_migrated: set[str] = set()
_lock = threading.Lock()


def connect(path: Path | None = None) -> sqlite3.Connection:
    path = Path(path or config.STOREFRONT_DB)
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=15, check_same_thread=False, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA busy_timeout=15000")
    key = str(path)
    if key not in _migrated:
        with _lock:
            migrate(con)
            _migrated.add(key)
    return con


def migrate(con) -> None:
    version = con.execute("PRAGMA user_version").fetchone()[0]
    for n, sql in enumerate(SCHEMA[version:], start=version + 1):
        con.execute("BEGIN IMMEDIATE")
        for statement in [s for s in sql.split(";") if s.strip()]:
            con.execute(statement)
        con.execute(f"PRAGMA user_version = {n}")
        if n == 2:
            _renumber_legacy_orders(con)
        con.execute("COMMIT")
    if not get_meta(con, "secret"):
        set_meta(con, "secret", secrets.token_hex(32))


def _next_number(con, year: str) -> str:
    """The next order reference of that year from an atomic counter (never by counting rows), inside the caller's transaction."""
    n = con.execute("INSERT INTO counters (name, value) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1 RETURNING value",
                    (f"order:{year}",)).fetchone()[0]
    return f"RVS-{year}-{n:06d}"


def _renumber_legacy_orders(con) -> None:
    """Orders sent before references existed get an RVS reference; their first number stays valid as an alias."""
    for o in con.execute("SELECT id, number, created_at FROM orders WHERE number NOT LIKE 'RVS-%' ORDER BY created_at, id").fetchall():
        number = _next_number(con, o["created_at"][:4])
        con.execute("UPDATE orders SET legacy_number = ?, number = ? WHERE id = ?", (o["number"], number, o["id"]))
        con.execute("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, 'system', 'reference', ?)",
                    (o["id"], now(), f"Order reference {number} (previously {o['number']})"))
    for o in con.execute("SELECT id, created_at FROM orders WHERE id NOT IN (SELECT order_id FROM shipments)").fetchall():
        con.execute("INSERT INTO shipments (order_id, arranged_by, created_at, updated_at) VALUES (?, 'reseller', ?, ?)", (o["id"], o["created_at"], o["created_at"]))
        con.execute("UPDATE order_items SET shipment_id = last_insert_rowid() WHERE order_id = ?", (o["id"],))


class _Tx:
    """BEGIN IMMEDIATE ... COMMIT, so concurrent submissions cannot interleave."""

    def __init__(self, con):
        self.con = con

    def __enter__(self):
        self.con.execute("BEGIN IMMEDIATE")
        return self.con

    def __exit__(self, exc_type, *_):
        self.con.execute("ROLLBACK" if exc_type else "COMMIT")


def tx(con) -> _Tx:
    return _Tx(con)


def get_meta(con, key: str, default=None):
    row = con.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    return json.loads(row[0]) if row else default


def set_meta(con, key: str, value) -> None:
    con.execute("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, json.dumps(value)))


def _sign(con, kind: str, value: str) -> str:
    """Access tokens are derived from a server secret, so they never need to be stored."""
    return hmac.new(bytes.fromhex(get_meta(con, "secret")), f"{kind}:{value}".encode(), hashlib.sha256).hexdigest()[:32]


def _check_token(con, kind: str, value: str, token: str | None) -> None:
    if not token or not hmac.compare_digest(_sign(con, kind, value), token):
        raise StoreError("Not found", status=404)


def client_hash(con, ip: str | None) -> str:
    """A salted hash of the visitor's address, for rate limits and duplicate checks. The address itself is not kept."""
    return hashlib.sha256(f"{get_meta(con, 'secret')}:{ip or '-'}".encode()).hexdigest()[:24]


def allow(con, scope: str, who: str) -> bool:
    limit, window = LIMITS[scope]
    t = time.time()
    bucket = f"{scope}:{who}"
    with tx(con):
        con.execute("DELETE FROM rate WHERE expires < ?", (t,))
        row = con.execute("SELECT count FROM rate WHERE bucket = ?", (bucket,)).fetchone()
        if row and row["count"] >= limit:
            return False
        if row:
            con.execute("UPDATE rate SET count = count + 1 WHERE bucket = ?", (bucket,))
        else:
            con.execute("INSERT INTO rate (bucket, count, expires) VALUES (?, 1, ?)", (bucket, t + window))
    return True


# ---------------------------------------------------------------- published catalogue

class Catalogue:
    """The catalogue exactly as the website shows it (the release's public JSON files)."""

    def __init__(self, folder: Path):
        data = Path(folder) / "data"
        self.site = json.loads((data / "site.json").read_text(encoding="utf-8"))
        self.countries = {c["slug"]: c for c in self.site["countries"]}
        self.products: dict[str, dict[str, dict]] = {}
        for slug in self.countries:
            items = json.loads((data / f"{slug}.json").read_text(encoding="utf-8"))
            # Ravisn references and legacy codes both find a product (old links, saved orders in progress, typed codes).
            self.products[slug] = {p["legacy"].upper(): p for p in items if p.get("legacy")} | {p["code"].upper(): p for p in items}


_cat_cache: dict[tuple, Catalogue] = {}


def catalogue(folder) -> Catalogue | None:
    if folder is None:
        return None
    site = Path(folder) / "data" / "site.json"
    try:
        key = (str(folder), site.stat().st_mtime)
    except OSError:
        return None
    if key not in _cat_cache:
        _cat_cache.clear()
        _cat_cache[key] = Catalogue(Path(folder))
    return _cat_cache[key]


def unit_price(product: dict, option: str | None) -> tuple[int | None, str | None, str | None]:
    """(price in minor units or None when on request, the option used, error)."""
    tiers = product.get("tiers") or []
    if tiers:
        labels = {label: price for label, price in tiers}
        if option not in labels:
            return None, None, "Choose an option"
        return labels[option], option, None
    if option:
        return None, None, "This product has no options"
    return product.get("price"), None, None


# ---------------------------------------------------------------- order validation

_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
EMAIL_RE = re.compile(r"[^@\s]{1,64}@[^@\s]+\.[A-Za-z]{2,24}")


def _text(body: dict, field: str, label: str, errors: dict, required=True, max_len=100, min_len=2, multiline=False) -> str | None:
    v = body.get(field)
    v = "" if v is None else str(v)
    v = _CTRL.sub("", v if multiline else v.replace("\n", " ")).strip()
    if not multiline:
        v = re.sub(r"\s+", " ", v)
    if not v:
        if required:
            errors[field] = f"Enter the {label}"
        return None
    if len(v) < min_len:
        errors[field] = f"Enter the full {label}"
    elif len(v) > max_len:
        errors[field] = f"Keep the {label} under {max_len} characters"
    return v


def validate_order(body: dict, cat: Catalogue) -> dict:
    """Check everything the reseller sent. Raises StoreError with a message per field."""
    errors: dict[str, str] = {}
    slug = str(body.get("catalogue") or "").lower()
    country = cat.countries.get(slug)
    if country is None:
        raise StoreError("Choose the catalogue country for this order")

    raw_items = body.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        raise StoreError("Your order is empty. Add at least one product.")
    if len(raw_items) > 60:
        raise StoreError("An order can hold up to 60 different products. Split it into two orders.")
    merged: dict[tuple, int] = {}
    for it in raw_items:
        if not isinstance(it, dict):
            raise StoreError("The order could not be read. Reload the page and try again.")
        code = str(it.get("code") or "").strip().upper()
        option = (str(it["option"]).strip() or None) if it.get("option") is not None else None
        try:
            qty = int(it.get("qty"))
        except (TypeError, ValueError):
            qty = 0
        if not 1 <= qty <= 999:
            raise StoreError(f"Enter a quantity between 1 and 999 for {code or 'each product'}")
        code = cat.products[slug].get(code, {}).get("code", code).upper()  # a legacy code counts as its Ravisn reference
        merged[(code, option)] = merged.get((code, option), 0) + qty
    lines, subtotal, pending = [], 0, False
    for (code, option), qty in merged.items():
        p = cat.products[slug].get(code)
        if p is None:
            raise StoreError(f"{code} is no longer in the {country['name']} catalogue. Remove it from your order.")
        if p["availability"] == "unavailable":
            raise StoreError(f"{code} is out of stock. Remove it from your order.")
        if qty > 999:
            raise StoreError(f"Order at most 999 of {code}")
        price, option, err = unit_price(p, option)
        if err:
            raise StoreError(f"{code}: {err}")
        line = None if price is None else price * qty
        pending |= price is None
        subtotal += line or 0
        name = p["name"] + (f", {p['variant']}" if p.get("variant") else "")
        lines.append({"code": p["code"], "legacy_code": p.get("legacy"), "name": name, "option": option, "qty": qty, "unit_minor": price,
                      "line_minor": line, "status": p["status"], "link": p.get("link")})

    out = {"catalogue": slug, "country_key": country["key"], "currency": country["currency"], "symbol": country["symbol"],
           "lines": lines, "subtotal_minor": subtotal, "prices_pending": pending, "release": cat.site.get("release")}
    out["customer_name"] = _text(body, "customer_name", "your name or business name", errors)
    email = _text(body, "email", "email address", errors, max_len=254, min_len=6)
    if email and not EMAIL_RE.fullmatch(email):
        errors["email"] = "Enter an email address like name@example.com"
    out["email"] = email.lower() if email else None
    phone, perr = addressing.normalise_phone(str(body.get("phone_dial") or ""), str(body.get("phone") or ""))
    if perr:
        errors["phone"] = perr
    out["phone"] = phone
    out["recipient_name"] = _text(body, "recipient_name", "recipient's full name", errors)
    dest = str(body.get("address_country") or "").upper()
    if dest not in addressing.COUNTRIES:
        errors["address_country"] = "Choose the delivery country"
    out["address_country"] = dest
    out["address1"] = _text(body, "address1", "first line of the address", errors, max_len=120, min_len=3)
    out["address2"] = _text(body, "address2", "second address line", errors, required=False, max_len=120, min_len=1)
    out["city"] = _text(body, "city", "city or town", errors, max_len=80)
    region = _text(body, "region", "state, province or county", errors, required=False, max_len=80, min_len=1)
    if dest in addressing.COUNTRIES:
        rerr = addressing.check_region(dest, region or "")
        if rerr:
            errors["region"] = rerr
        if region and addressing.COUNTRIES[dest]["regions"]:
            region = region.upper()
        pc = addressing.normalise_postcode(dest, str(body.get("postcode") or ""))
        perr2 = addressing.check_postcode(dest, pc)
        if perr2:
            errors["postcode"] = perr2
        out["postcode"] = pc or None
    out["region"] = region
    out["instructions"] = _text(body, "instructions", "special instructions", errors, required=False, max_len=1500, min_len=1, multiline=True)
    if body.get("confirmed") is not True:
        errors["confirmed"] = "Please confirm you have reviewed the item, variation and quantity"
    ship = body.get("shipping") if isinstance(body.get("shipping"), dict) else {}
    method = ship.get("method") or "reseller"
    if method not in ("reseller", "ravisn"):
        errors["shipping"] = "Choose who arranges shipping"
    out["shipping"] = {"method": method}
    for field, label, max_len in (("carrier", "carrier", 60), ("service", "shipping service", 60), ("tracking", "tracking number", 80),
                                  ("instructions", "shipping instructions", 800)):
        out["shipping"][field] = _text(ship, field, label, errors, required=False, max_len=max_len, min_len=1, multiline=field == "instructions")
    if errors:
        raise StoreError("Some details need your attention", errors)
    return out


# ---------------------------------------------------------------- orders

def create_order(con, clean: dict, idem_key: str | None, who: str) -> dict:
    """Save a validated order once. Repeating the same submission returns the order already saved. The reference comes from
    an atomic annual counter inside the same write transaction, so simultaneous checkouts can never get the same number."""
    idem_key = (idem_key or "")[:80] or None
    with tx(con):
        if idem_key:
            row = con.execute("SELECT number FROM orders WHERE idem_key = ?", (idem_key,)).fetchone()
            if row:
                return {**public_order(con, row["number"]), "token": _sign(con, "order", row["number"]), "duplicate": True}
        # The same reseller sending the same products again within 10 minutes is almost always a double submission.
        fingerprint = hashlib.sha256(json.dumps([clean["email"], clean["catalogue"], sorted((l["code"], l["option"] or "", l["qty"]) for l in clean["lines"]),
                                                 clean["address1"], clean["postcode"]]).encode()).hexdigest()[:24]
        since = (datetime.now(timezone.utc) - timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
        row = con.execute("SELECT number FROM orders WHERE client = ? AND created_at >= ?", (f"{who}:{fingerprint}", since)).fetchone()
        if row:
            return {**public_order(con, row["number"]), "token": _sign(con, "order", row["number"]), "duplicate": True}
        ts = now()
        number = _next_number(con, ts[:4])
        oid = con.execute(
            """INSERT INTO orders (number, idem_key, created_at, updated_at, catalogue, currency, symbol, subtotal_minor, prices_pending, status,
                                   payment_status, customer_name, email, phone, recipient_name, address_country, address1, address2, city,
                                   region, postcode, instructions, release, client)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', 'Pending confirmation', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (number, idem_key, ts, ts, clean["country_key"], clean["currency"], clean["symbol"], clean["subtotal_minor"], int(clean["prices_pending"]),
             clean["customer_name"], clean["email"], clean["phone"], clean["recipient_name"], clean["address_country"], clean["address1"],
             clean["address2"], clean["city"], clean["region"], clean["postcode"], clean["instructions"], clean["release"], f"{who}:{fingerprint}"),
        ).lastrowid
        s = clean.get("shipping") or {"method": "reseller"}
        sid = con.execute(
            """INSERT INTO shipments (order_id, arranged_by, carrier, service, tracking, instructions, payment_status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (oid, s["method"], s.get("carrier"), s.get("service"), s.get("tracking"), s.get("instructions"),
             "quote_pending" if s["method"] == "ravisn" else "not_applicable", ts, ts)).lastrowid
        for l in clean["lines"]:
            con.execute("""INSERT INTO order_items (order_id, code, legacy_code, name, option, qty, unit_minor, line_minor, status, link, shipment_id)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (oid, l["code"], l.get("legacy_code"), l["name"], l["option"], l["qty"], l["unit_minor"], l["line_minor"], l["status"], l["link"], sid))
        con.execute("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, 'reseller', 'created', ?)",
                    (oid, ts, f"Order request sent with {len(clean['lines'])} product(s); shipping "
                              + ("to be quoted by Ravisn" if s["method"] == "ravisn" else "arranged by the reseller")))
    return {**public_order(con, number), "token": _sign(con, "order", number), "duplicate": False}


def _shipments(con, order_id: int, admin: bool = False) -> list[dict]:
    out = []
    for s in con.execute("SELECT * FROM shipments WHERE order_id = ? ORDER BY id", (order_id,)):
        label = con.execute("SELECT id, filename, content_type, size, uploaded_at FROM labels WHERE shipment_id = ? AND current = 1", (s["id"],)).fetchone()
        d = {k: s[k] for k in ("id", "arranged_by", "carrier", "service", "tracking", "instructions", "label_status", "label_note", "charge_minor",
                               "payment_status", "address_requested", "dispatch_status", "dispatched_at")}
        d["address_requested"] = bool(d["address_requested"])
        d["label"] = dict(label) if label else None
        d["lines"] = [r["code"] for r in con.execute("SELECT code FROM order_items WHERE shipment_id = ? ORDER BY id", (s["id"],))]
        if admin:
            d["line_ids"] = [r["id"] for r in con.execute("SELECT id FROM order_items WHERE shipment_id = ? ORDER BY id", (s["id"],))]
        out.append(d)
    return out


def _find_order(con, number: str):
    n = (number or "").strip().upper()
    return con.execute("SELECT * FROM orders WHERE number = ? OR legacy_number = ?", (n, n)).fetchone()


def public_order(con, number: str) -> dict:
    """What the reseller sees about their own order."""
    o = _find_order(con, number)
    if o is None:
        raise StoreError("Not found", status=404)
    items = [{k: r[k] for k in ("code", "legacy_code", "name", "option", "qty", "unit_minor", "line_minor")}
             for r in con.execute("SELECT * FROM order_items WHERE order_id = ? ORDER BY id", (o["id"],))]
    erased = o["erased_at"] is not None
    return {
        "number": o["number"], "legacy_number": o["legacy_number"], "created_at": o["created_at"], "status": o["status"],
        "payment_status": o["payment_status"], "catalogue": o["catalogue"], "currency": o["currency"], "symbol": o["symbol"],
        "subtotal_minor": o["subtotal_minor"], "prices_pending": bool(o["prices_pending"]), "items": items, "carrier": o["carrier"],
        "tracking": o["tracking"], "shipments": _shipments(con, o["id"]), "shipping_note": SHIPPING_NOTE,
        "delivery": None if erased else {
            "recipient_name": o["recipient_name"], "address1": o["address1"], "address2": o["address2"], "city": o["city"],
            "region": o["region"], "postcode": o["postcode"], "country": o["address_country"]},
        "updates": [{"at": e["at"], "detail": e["detail"]} for e in con.execute(
            "SELECT at, detail FROM order_events WHERE order_id = ? AND kind IN ('created', 'status', 'payment', 'tracking', 'message', 'shipping', 'reference') ORDER BY id",
            (o["id"],))],
    }


def lookup_order(con, number: str, token: str | None) -> dict:
    """Only the holder of the order's private key sees it; knowing an order number alone reveals nothing."""
    number = (number or "").strip().upper()
    _check_token(con, "order", number, token)
    return public_order(con, number)


def _own_shipment(con, number: str, token: str | None, sid: int):
    number = (number or "").strip().upper()
    _check_token(con, "order", number, token)
    o = _find_order(con, number)
    s = con.execute("SELECT * FROM shipments WHERE id = ? AND order_id = ?", (sid, o["id"] if o else -1)).fetchone()
    if o is None or s is None:
        raise StoreError("Not found", status=404)
    if s["dispatch_status"] == "dispatched":
        raise StoreError("This shipment has already been dispatched, so it can no longer be changed.", status=409)
    if o["status"] == "Cancelled":
        raise StoreError("This order was cancelled.", status=409)
    return o, s


def reseller_update_shipment(con, number: str, token: str | None, sid: int, body: dict) -> dict:
    """Before dispatch the reseller may choose who arranges shipping, add carrier and tracking details, or ask Ravisn to
    confirm the dispatch address privately (needed to buy a label). Nothing here marks anything as shipped."""
    o, s = _own_shipment(con, number, token, sid)
    errors: dict[str, str] = {}
    vals = {f: _text(body, f, label, errors, required=False, max_len=n, min_len=1, multiline=f == "instructions")
            for f, label, n in (("carrier", "carrier", 60), ("service", "shipping service", 60), ("tracking", "tracking number", 80),
                                ("instructions", "shipping instructions", 800)) if f in body}
    method = body.get("arranged_by", s["arranged_by"])
    if method not in ("reseller", "ravisn"):
        errors["arranged_by"] = "Choose who arranges shipping"
    if errors:
        raise StoreError("Some details need your attention", errors)
    ts, changes = now(), []
    with tx(con):
        if method != s["arranged_by"]:
            if s["payment_status"] in ("awaiting_payment", "paid"):
                raise StoreError("Ravisn has already quoted this shipment. Ask the team in the chat to change it.", status=409)
            con.execute("UPDATE shipments SET arranged_by = ?, payment_status = ? WHERE id = ?",
                        (method, "quote_pending" if method == "ravisn" else "not_applicable", sid))
            changes.append("shipping quote requested from Ravisn" if method == "ravisn" else "reseller will arrange shipping")
        for f, v in vals.items():
            if v != s[f]:
                con.execute(f"UPDATE shipments SET {f} = ? WHERE id = ?", (v, sid))
                changes.append(f"{f} updated")
        if body.get("request_address") and not s["address_requested"]:
            con.execute("UPDATE shipments SET address_requested = 1 WHERE id = ?", (sid,))
            changes.append("asked Ravisn to confirm the dispatch address and label requirements")
        if changes:
            con.execute("UPDATE shipments SET updated_at = ? WHERE id = ?", (ts, sid))
            con.execute("UPDATE orders SET updated_at = ?, seen_at = NULL WHERE id = ?", (ts, o["id"]))
            con.execute("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, 'reseller', 'shipping', ?)",
                        (o["id"], ts, "Shipping: " + "; ".join(changes)))
    return lookup_order(con, number, token)


def check_label(data: bytes, filename: str) -> str:
    """The label's real content type, from its first bytes. Only PDF, PNG, JPEG and WebP; no active PDF content."""
    if not data or len(data) > LABEL_MAX:
        raise StoreError("Labels must be a PDF or image of at most 1.5 MB", status=413 if data else 422)
    if data.startswith(b"%PDF-"):
        head = data[:400_000]
        if re.search(rb"/(JavaScript|JS|Launch|EmbeddedFile)\b", head):
            raise StoreError("That PDF contains active content. Save the label again as a plain PDF and upload it.")
        kind = "application/pdf"
    elif data.startswith(b"\x89PNG\r\n\x1a\n"):
        kind = "image/png"
    elif data.startswith(b"\xff\xd8\xff"):
        kind = "image/jpeg"
    elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        kind = "image/webp"
    else:
        raise StoreError("Upload the label as a PDF, PNG, JPEG or WebP file")
    return kind


def upload_label(con, number: str, token: str | None, sid: int, data: bytes, filename: str) -> dict:
    o, s = _own_shipment(con, number, token, sid)
    if s["arranged_by"] != "reseller":
        raise StoreError("Ravisn is arranging this shipment, so no label is needed from you.", status=409)
    kind = check_label(data, filename)
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", (filename or "label").rsplit("/", 1)[-1].rsplit("\\", 1)[-1])[:80] or "label"
    safe = (safe.rsplit(".", 1)[0].strip("._") or "label") + LABEL_TYPES[kind]  # the extension always matches the real content
    ts = now()
    with tx(con):
        con.execute("UPDATE labels SET current = 0 WHERE shipment_id = ?", (sid,))
        con.execute("INSERT INTO labels (shipment_id, filename, content_type, size, sha256, data, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (sid, safe, kind, len(data), hashlib.sha256(data).hexdigest(), data, ts))
        con.execute("UPDATE shipments SET label_status = 'submitted', label_note = NULL, updated_at = ? WHERE id = ?", (ts, sid))
        con.execute("UPDATE orders SET updated_at = ?, seen_at = NULL WHERE id = ?", (ts, o["id"]))
        con.execute("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, 'reseller', 'shipping', ?)",
                    (o["id"], ts, f"Shipping label uploaded ({safe}); Ravisn will check it before dispatch"))
    return lookup_order(con, number, token)


def label_file(con, sid: int, number: str | None = None, token: str | None = None) -> tuple[bytes, str, str]:
    """The current label of a shipment: for the order's holder (number and key) or, with no key, for the admin panel only."""
    if number is not None:
        _check_token(con, "order", number.strip().upper(), token)
        o = _find_order(con, number)
        if o is None or not con.execute("SELECT 1 FROM shipments WHERE id = ? AND order_id = ?", (sid, o["id"])).fetchone():
            raise StoreError("Not found", status=404)
    row = con.execute("SELECT filename, content_type, data FROM labels WHERE shipment_id = ? AND current = 1", (sid,)).fetchone()
    if row is None:
        raise StoreError("Not found", status=404)
    return row["data"], row["content_type"], row["filename"]


# ---------------------------------------------------------------- chat

def _chat(con, public_id: str, token: str | None):
    _check_token(con, "chat", public_id, token)
    row = con.execute("SELECT * FROM chats WHERE public_id = ?", (public_id,)).fetchone()
    if row is None or row["status"] == "archived":
        raise StoreError("This chat has ended. Start a new one.", status=410)
    return row


def team_online(con) -> bool:
    p = get_meta(con, "presence")
    if not p or not p.get("online"):
        return False
    return time.time() - float(p.get("at", 0)) < ONLINE_SECONDS


def _add_message(con, chat_id: int, sender: str, body: str, unread: bool = False) -> int:
    ts = now()
    mid = con.execute("INSERT INTO chat_messages (chat_id, at, sender, body) VALUES (?, ?, ?, ?)", (chat_id, ts, sender, body)).lastrowid
    con.execute("UPDATE chats SET updated_at = ?, last_message_at = ?, unread = unread + ? WHERE id = ?", (ts, ts, int(unread), chat_id))
    return mid


def _clean_message(text, max_len=1000) -> str:
    t = _CTRL.sub("", str(text or "")).strip()
    if not t:
        raise StoreError("Type a message first")
    if len(t) > max_len:
        raise StoreError(f"Keep messages under {max_len} characters")
    return t


def chat_start(con, page: str | None, who: str) -> dict:
    public_id = secrets.token_urlsafe(12)
    ts = now()
    with tx(con):
        con.execute("INSERT INTO chats (public_id, created_at, updated_at, status, mode, page, client) VALUES (?, ?, ?, 'open', 'assistant', ?, ?)",
                    (public_id, ts, ts, (page or "")[:200] or None, who))
    return {"id": public_id, "token": _sign(con, "chat", public_id)}


def chat_state(con, public_id: str, token: str | None, after: int = 0) -> dict:
    c = _chat(con, public_id, token)
    msgs = [dict(m) for m in con.execute("SELECT id, at, sender, body FROM chat_messages WHERE chat_id = ? AND id > ? ORDER BY id LIMIT 200",
                                         (c["id"], after))]
    return {"mode": c["mode"], "status": c["status"], "team_online": team_online(con), "messages": msgs}


def chat_post(con, public_id: str, token: str | None, text, assistant_reply=None) -> dict:
    """A visitor message. While the automated assistant is answering, its reply (worked out in the browser from the
    public catalogue only) is kept too, so the team sees the whole conversation if they take over."""
    c = _chat(con, public_id, token)
    body = _clean_message(text)
    with tx(con):
        if c["status"] == "closed":
            con.execute("UPDATE chats SET status = 'open' WHERE id = ?", (c["id"],))
        _add_message(con, c["id"], "visitor", body, unread=c["mode"] != "assistant")
        if c["mode"] == "assistant" and assistant_reply:
            _add_message(con, c["id"], "assistant", _clean_message(assistant_reply, 3000))
    return chat_state(con, public_id, token, 0)


def chat_request_team(con, public_id: str, token: str | None, name=None, contact=None, message=None) -> dict:
    """The visitor asks for a person. Nobody is shown as online unless the team really is."""
    c = _chat(con, public_id, token)
    name = (_CTRL.sub("", str(name or "")).strip() or None)
    contact = (_CTRL.sub("", str(contact or "")).strip() or None)
    if name and len(name) > 80 or contact and len(contact) > 120:
        raise StoreError("Keep your name and contact details short")
    with tx(con):
        con.execute("UPDATE chats SET name = COALESCE(?, name), contact = COALESCE(?, contact), status = 'open', "
                    "mode = CASE WHEN mode = 'human' THEN 'human' ELSE 'waiting' END WHERE id = ?", (name, contact, c["id"]))
        if message:
            _add_message(con, c["id"], "visitor", _clean_message(message), unread=True)
            if not team_online(con):
                _add_message(con, c["id"], "system", LEFT_MESSAGE)
        elif c["mode"] != "human":
            con.execute("UPDATE chats SET unread = unread + 1 WHERE id = ?", (c["id"],))
            _add_message(con, c["id"], "system", TEAM_REQUESTED if team_online(con) else TEAM_AWAY)
    return chat_state(con, public_id, token, 0)


# ---------------------------------------------------------------- admin side (local admin panel only)

def set_presence(con, online: bool) -> dict:
    set_meta(con, "presence", {"online": bool(online), "at": time.time()})
    return {"online": team_online(con)}


def summary(con) -> dict:
    purge_if_due(con)
    return {
        "new_orders": con.execute("SELECT COUNT(*) FROM orders WHERE seen_at IS NULL").fetchone()[0],
        "open_orders": con.execute(f"SELECT COUNT(*) FROM orders WHERE status NOT IN ({','.join('?' * len(CLOSED_STATUSES))})",
                                   tuple(CLOSED_STATUSES)).fetchone()[0],
        "unread_chats": con.execute("SELECT COUNT(*) FROM chats WHERE unread > 0 AND status != 'archived'").fetchone()[0],
        "waiting_chats": con.execute("SELECT COUNT(*) FROM chats WHERE mode = 'waiting' AND status = 'open'").fetchone()[0],
        "online": team_online(con),
    }


def list_orders(con, status: str | None = None, q: str | None = None, limit: int = 100, offset: int = 0) -> dict:
    sql, args = "SELECT * FROM orders WHERE 1 = 1", []
    if status == "open":
        sql += f" AND status NOT IN ({','.join('?' * len(CLOSED_STATUSES))})"
        args += list(CLOSED_STATUSES)
    elif status in ORDER_STATUSES:
        sql += " AND status = ?"
        args.append(status)
    elif status in PAYMENT_STATUSES:
        sql += " AND payment_status = ?"
        args.append(status)
    if q:
        like = f"%{q.strip()}%"
        sql += (" AND (number LIKE ? OR legacy_number LIKE ? OR customer_name LIKE ? OR recipient_name LIKE ? OR email LIKE ? OR phone LIKE ? OR tracking LIKE ?"
                " OR id IN (SELECT order_id FROM order_items WHERE code LIKE ? OR name LIKE ?))")
        args += [like] * 9
    total = con.execute(f"SELECT COUNT(*) FROM ({sql})", args).fetchone()[0]
    rows = con.execute(sql + " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?", (*args, min(limit, 500), offset)).fetchall()
    out = []
    for o in rows:
        items = con.execute("SELECT code, qty FROM order_items WHERE order_id = ? ORDER BY id", (o["id"],)).fetchall()
        out.append({k: o[k] for k in ("number", "created_at", "catalogue", "currency", "symbol", "subtotal_minor", "prices_pending", "status",
                                      "payment_status", "customer_name", "recipient_name", "address_country", "seen_at", "erased_at")}
                   | {"items": len(items), "units": sum(i["qty"] for i in items), "codes": [i["code"] for i in items[:4]]})
    return {"total": total, "orders": out}


def order_row(con, number: str):
    o = _find_order(con, number)
    if o is None:
        raise KeyError(number)
    return o


def admin_order(con, number: str, mark_seen: bool = True) -> dict:
    o = order_row(con, number)
    if mark_seen and o["seen_at"] is None:
        con.execute("UPDATE orders SET seen_at = ? WHERE id = ?", (now(), o["id"]))
    d = {k: o[k] for k in o.keys() if k not in ("idem_key", "client")}
    d["items"] = [dict(r) for r in con.execute("SELECT * FROM order_items WHERE order_id = ? ORDER BY id", (o["id"],))]
    d["shipments"] = _shipments(con, o["id"], admin=True)
    d["events"] = [dict(r) for r in con.execute("SELECT at, actor, kind, detail FROM order_events WHERE order_id = ? ORDER BY id", (o["id"],))]
    d["address_country_name"] = addressing.COUNTRIES.get(o["address_country"], {}).get("name", o["address_country"])
    return d


def update_order(con, number: str, changes: dict) -> dict:
    o = order_row(con, number)
    if o["erased_at"] and any(k in changes for k in ("tracking", "carrier")):
        raise StoreError("This order's personal details were erased")
    ts = now()
    with tx(con):
        if "status" in changes and changes["status"] != o["status"]:
            if changes["status"] not in ORDER_STATUSES:
                raise StoreError("Unknown order status")
            if changes["status"] in ("Dispatched", "Delivered") and con.execute(
                    "SELECT 1 FROM shipments WHERE order_id = ? AND dispatch_status != 'dispatched'", (o["id"],)).fetchone():
                raise StoreError("Confirm the dispatch of every shipment first (Shipping, Confirm dispatch). An order is never marked as sent without it.")
            con.execute("UPDATE orders SET status = ? WHERE id = ?", (changes["status"], o["id"]))
            con.execute("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, 'admin', 'status', ?)",
                        (o["id"], ts, f"Order status: {changes['status']}"))
        if "payment_status" in changes and changes["payment_status"] != o["payment_status"]:
            if changes["payment_status"] not in PAYMENT_STATUSES:
                raise StoreError("Unknown payment status")
            con.execute("UPDATE orders SET payment_status = ? WHERE id = ?", (changes["payment_status"], o["id"]))
            con.execute("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, 'admin', 'payment', ?)",
                        (o["id"], ts, f"Payment: {changes['payment_status']}"))
        if "tracking" in changes or "carrier" in changes:
            tracking = (str(changes.get("tracking", o["tracking"]) or "").strip()[:80]) or None
            carrier = (str(changes.get("carrier", o["carrier"]) or "").strip()[:60]) or None
            if (tracking, carrier) != (o["tracking"], o["carrier"]):
                con.execute("UPDATE orders SET tracking = ?, carrier = ? WHERE id = ?", (tracking, carrier, o["id"]))
                con.execute("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, 'admin', 'tracking', ?)",
                            (o["id"], ts, f"Tracking: {' '.join(x for x in (carrier, tracking) if x) or 'removed'}"))
        if changes.get("message"):
            msg = _clean_message(changes["message"], 800)
            con.execute("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, 'admin', 'message', ?)", (o["id"], ts, msg))
        con.execute("UPDATE orders SET updated_at = ? WHERE id = ?", (ts, o["id"]))
    return admin_order(con, number, mark_seen=False)


def erase_order_personal_data(con, number: str) -> dict:
    """Remove the reseller's and recipient's personal details, keeping the order lines and number for the books."""
    o = order_row(con, number)
    with tx(con):
        con.execute("""UPDATE orders SET customer_name = '[erased]', email = '[erased]', phone = '[erased]', recipient_name = '[erased]',
                       address1 = '[erased]', address2 = NULL, city = '[erased]', region = NULL, postcode = NULL, instructions = NULL,
                       tracking = NULL, client = NULL, erased_at = ? WHERE id = ?""", (now(), o["id"]))
        con.execute("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, 'admin', 'erased', 'Personal details erased')",
                    (o["id"], now()))
    return admin_order(con, number, mark_seen=False)


SHIP_PAYMENT = ("not_applicable", "quote_pending", "awaiting_payment", "paid")


def admin_shipment(con, number: str, sid: int):
    o = order_row(con, number)
    s = con.execute("SELECT * FROM shipments WHERE id = ? AND order_id = ?", (sid, o["id"])).fetchone()
    if s is None:
        raise KeyError(sid)
    return o, s


def admin_update_shipment(con, number: str, sid: int, ch: dict) -> dict:
    """Carrier, tracking, Ravisn's shipping charge and its payment, and the label review. Approving a label needs the
    owner to confirm it matches the order's destination, the authorised dispatch origin, the parcel and the carrier."""
    o, s = admin_shipment(con, number, sid)
    if s["dispatch_status"] == "dispatched" and set(ch) - {"tracking", "carrier"}:
        raise StoreError("This shipment is already dispatched")
    ts, notes, sets = now(), [], {}
    for f, n in (("carrier", 60), ("service", 60), ("tracking", 80), ("instructions", 800)):
        if f in ch:
            v = (str(ch[f] or "").strip()[:n]) or None
            if v != s[f]:
                sets[f] = v
                notes.append(f"{f}: {v or 'removed'}" if f in ("carrier", "tracking") else f"{f} updated")
    if "arranged_by" in ch and ch["arranged_by"] != s["arranged_by"]:
        if ch["arranged_by"] not in ("reseller", "ravisn"):
            raise StoreError("Choose who arranges shipping")
        sets["arranged_by"] = ch["arranged_by"]
        sets.setdefault("payment_status", "quote_pending" if ch["arranged_by"] == "ravisn" else "not_applicable")
        notes.append("shipping arranged by " + ("Ravisn" if ch["arranged_by"] == "ravisn" else "the reseller"))
    if "charge_minor" in ch:
        v = ch["charge_minor"]
        if v is not None and (not isinstance(v, int) or v < 0 or v > 10_000_000):
            raise StoreError("Enter the shipping charge as an amount")
        if v != s["charge_minor"]:
            sets["charge_minor"] = v
            notes.append(f"shipping charge {o['symbol']}{v / 100:.2f}" if v is not None else "shipping charge removed")
            if v is not None and s["payment_status"] == "quote_pending" and "payment_status" not in ch:
                sets["payment_status"] = "awaiting_payment"
    if "payment_status" in ch and ch["payment_status"] != s["payment_status"]:
        if ch["payment_status"] not in SHIP_PAYMENT:
            raise StoreError("Unknown shipping payment status")
        sets["payment_status"] = ch["payment_status"]
        notes.append({"paid": "shipping payment received", "awaiting_payment": "shipping payment requested",
                      "quote_pending": "shipping quote being prepared", "not_applicable": "no shipping payment needed"}[ch["payment_status"]])
    if "label_status" in ch and ch["label_status"] != s["label_status"]:
        if ch["label_status"] == "approved":
            checks = ch.get("checks") or {}
            if not all(checks.get(k) is True for k in ("destination", "origin", "parcel", "carrier")):
                raise StoreError("Confirm the label matches the destination, the authorised dispatch origin, the parcel and the carrier")
            if not con.execute("SELECT 1 FROM labels WHERE shipment_id = ? AND current = 1", (sid,)).fetchone():
                raise StoreError("There is no label to approve")
            notes.append("label checked and approved")
        elif ch["label_status"] == "rejected":
            if len(str(ch.get("label_note") or "").strip()) < 4:
                raise StoreError("Say what needs to change on the label")
            notes.append(f"label needs a change: {str(ch['label_note']).strip()[:300]}")
        else:
            raise StoreError("Approve the label or ask for a change")
        sets["label_status"] = ch["label_status"]
        sets["label_note"] = (str(ch.get("label_note") or "").strip()[:300]) or None
    if "address_requested" in ch:
        sets["address_requested"] = 1 if ch["address_requested"] else 0
    if sets:
        with tx(con):
            con.execute(f"UPDATE shipments SET {', '.join(f'{k} = ?' for k in sets)}, updated_at = ? WHERE id = ?", (*sets.values(), ts, sid))
            if notes:
                con.execute("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, 'admin', 'shipping', ?)",
                            (o["id"], ts, "Shipping: " + "; ".join(notes)))
            con.execute("UPDATE orders SET updated_at = ? WHERE id = ?", (ts, o["id"]))
    return admin_order(con, number, mark_seen=False)


def admin_split_shipment(con, number: str, line_ids: list[int], arranged_by: str = "reseller") -> dict:
    """A separate shipping arrangement for some product lines (for example a different fulfilment group)."""
    o = order_row(con, number)
    ids = [int(i) for i in line_ids]
    rows = con.execute(f"SELECT i.id, s.dispatch_status FROM order_items i LEFT JOIN shipments s ON s.id = i.shipment_id "
                       f"WHERE i.order_id = ? AND i.id IN ({','.join('?' * len(ids))})", (o["id"], *ids)).fetchall() if ids else []
    total = con.execute("SELECT COUNT(*) FROM order_items WHERE order_id = ?", (o["id"],)).fetchone()[0]
    if not rows or len(rows) != len(ids):
        raise StoreError("Choose product lines of this order")
    if any(r["dispatch_status"] == "dispatched" for r in rows):
        raise StoreError("A chosen line is already dispatched")
    if len(ids) == total:
        raise StoreError("Choose some of the lines, not all of them")
    if arranged_by not in ("reseller", "ravisn"):
        raise StoreError("Choose who arranges shipping")
    ts = now()
    with tx(con):
        sid = con.execute("INSERT INTO shipments (order_id, arranged_by, payment_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                          (o["id"], arranged_by, "quote_pending" if arranged_by == "ravisn" else "not_applicable", ts, ts)).lastrowid
        con.execute(f"UPDATE order_items SET shipment_id = ? WHERE order_id = ? AND id IN ({','.join('?' * len(ids))})", (sid, o["id"], *ids))
        con.execute("DELETE FROM shipments WHERE order_id = ? AND id NOT IN (SELECT DISTINCT shipment_id FROM order_items WHERE order_id = ? AND shipment_id IS NOT NULL)",
                    (o["id"], o["id"]))
        con.execute("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, 'admin', 'shipping', ?)",
                    (o["id"], ts, f"Shipping: {len(ids)} product line(s) will be shipped separately"))
    return admin_order(con, number, mark_seen=False)


def admin_dispatch(con, number: str, sid: int, body: dict) -> dict:
    """Record that a shipment has actually been handed to the carrier. Needs the real carrier and tracking number, the
    owner's confirmation, a paid shipping charge when Ravisn arranged it, and an approved label when the reseller did."""
    o, s = admin_shipment(con, number, sid)
    if s["dispatch_status"] == "dispatched":
        raise StoreError("Already dispatched")
    if body.get("confirm") is not True:
        raise StoreError("Confirm that this shipment has been handed to the carrier")
    if not (s["carrier"] and s["tracking"]):
        raise StoreError("Add the carrier and the carrier's tracking number first")
    if s["arranged_by"] == "ravisn" and s["payment_status"] != "paid":
        raise StoreError("The shipping charge has not been marked as paid")
    if s["arranged_by"] == "reseller" and s["label_status"] != "approved" and body.get("label_elsewhere") is not True:
        raise StoreError("Approve the reseller's label first, or confirm the label was supplied another way")
    if o["payment_status"] != "Paid" and body.get("unpaid_ok") is not True:
        raise StoreError("The order has not been marked as paid")
    ts = now()
    with tx(con):
        con.execute("UPDATE shipments SET dispatch_status = 'dispatched', dispatched_at = ?, updated_at = ? WHERE id = ?", (ts, ts, sid))
        con.execute("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, 'admin', 'tracking', ?)",
                    (o["id"], ts, f"Dispatched with {s['carrier']}, tracking {s['tracking']}"))
        if not o["tracking"]:
            con.execute("UPDATE orders SET carrier = ?, tracking = ? WHERE id = ?", (s["carrier"], s["tracking"], o["id"]))
        if not con.execute("SELECT 1 FROM shipments WHERE order_id = ? AND dispatch_status != 'dispatched'", (o["id"],)).fetchone() \
                and o["status"] not in ("Dispatched", "Delivered"):
            con.execute("UPDATE orders SET status = 'Dispatched' WHERE id = ?", (o["id"],))
            con.execute("INSERT INTO order_events (order_id, at, actor, kind, detail) VALUES (?, ?, 'admin', 'status', 'Order status: Dispatched')", (o["id"], ts))
        con.execute("UPDATE orders SET updated_at = ? WHERE id = ?", (ts, o["id"]))
    return admin_order(con, number, mark_seen=False)


def list_chats(con, view: str = "open") -> list[dict]:
    where = {"open": "status = 'open'", "closed": "status = 'closed'", "archived": "status = 'archived'"}.get(view, "status = 'open'")
    out = []
    for c in con.execute(f"SELECT * FROM chats WHERE {where} AND last_message_at IS NOT NULL ORDER BY (mode = 'waiting') DESC, last_message_at DESC LIMIT 300"):
        last = con.execute("SELECT sender, body, at FROM chat_messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1", (c["id"],)).fetchone()
        out.append({k: c[k] for k in ("public_id", "created_at", "last_message_at", "status", "mode", "name", "contact", "page", "unread")}
                   | {"last": dict(last) if last else None})
    return out


def admin_chat(con, public_id: str, mark_read: bool = True) -> dict:
    c = con.execute("SELECT * FROM chats WHERE public_id = ?", (public_id,)).fetchone()
    if c is None:
        raise KeyError(public_id)
    if mark_read and c["unread"]:
        con.execute("UPDATE chats SET unread = 0 WHERE id = ?", (c["id"],))
    msgs = [dict(m) for m in con.execute("SELECT id, at, sender, body FROM chat_messages WHERE chat_id = ? ORDER BY id", (c["id"],))]
    return {k: c[k] for k in ("public_id", "created_at", "last_message_at", "status", "mode", "name", "contact", "page")} | {"messages": msgs}


def chat_reply(con, public_id: str, text) -> dict:
    c = con.execute("SELECT * FROM chats WHERE public_id = ?", (public_id,)).fetchone()
    if c is None:
        raise KeyError(public_id)
    body = _clean_message(text, 2000)
    with tx(con):
        if c["mode"] != "human":
            con.execute("UPDATE chats SET mode = 'human' WHERE id = ?", (c["id"],))
            _add_message(con, c["id"], "system", TEAM_JOINED)
        if c["status"] != "open":
            con.execute("UPDATE chats SET status = 'open' WHERE id = ?", (c["id"],))
        _add_message(con, c["id"], "team", body)
        con.execute("UPDATE chats SET unread = 0 WHERE id = ?", (c["id"],))
    return admin_chat(con, public_id)


def chat_set(con, public_id: str, action: str) -> dict:
    c = con.execute("SELECT * FROM chats WHERE public_id = ?", (public_id,)).fetchone()
    if c is None:
        raise KeyError(public_id)
    with tx(con):
        if action == "takeover" and c["mode"] != "human":
            con.execute("UPDATE chats SET mode = 'human', status = 'open' WHERE id = ?", (c["id"],))
            _add_message(con, c["id"], "system", TEAM_JOINED)
        elif action == "assistant":
            con.execute("UPDATE chats SET mode = 'assistant' WHERE id = ?", (c["id"],))
            _add_message(con, c["id"], "system", "The automated assistant is answering again. You can ask for the team at any time.")
        elif action == "close":
            con.execute("UPDATE chats SET status = 'closed', unread = 0 WHERE id = ?", (c["id"],))
            _add_message(con, c["id"], "system", "This conversation has been closed. Write again at any time if you need anything else.")
        elif action == "archive":
            con.execute("UPDATE chats SET status = 'archived', unread = 0 WHERE id = ?", (c["id"],))
        elif action == "reopen":
            con.execute("UPDATE chats SET status = 'open' WHERE id = ?", (c["id"],))
        elif action == "delete":
            con.execute("DELETE FROM chats WHERE id = ?", (c["id"],))
            return {"deleted": True}
        elif action not in ("takeover",):
            raise StoreError("Unknown action")
    return admin_chat(con, public_id, mark_read=False)


def retention(con) -> dict:
    return DEFAULT_RETENTION | (get_meta(con, "retention") or {})


def set_retention(con, values: dict) -> dict:
    r = retention(con)
    for k in DEFAULT_RETENTION:
        if k in values:
            v = int(values[k])
            if not 7 <= v <= 3650:
                raise StoreError("Choose between 7 and 3,650 days")
            r[k] = v
    set_meta(con, "retention", r)
    return r


def purge(con) -> dict:
    """Delete chats with no activity for the retention period, and erase personal details of orders closed longer ago."""
    r = retention(con)
    chat_cut = (datetime.now(timezone.utc) - timedelta(days=r["chat_days"])).strftime("%Y-%m-%dT%H:%M:%SZ")
    order_cut = (datetime.now(timezone.utc) - timedelta(days=r["order_personal_days"])).strftime("%Y-%m-%dT%H:%M:%SZ")
    with tx(con):
        chats = con.execute("DELETE FROM chats WHERE COALESCE(last_message_at, created_at) < ?", (chat_cut,)).rowcount
    old = [row["number"] for row in con.execute(
        f"SELECT number FROM orders WHERE erased_at IS NULL AND updated_at < ? AND status IN ({','.join('?' * len(CLOSED_STATUSES))})",
        (order_cut, *CLOSED_STATUSES))]
    for n in old:
        erase_order_personal_data(con, n)
    set_meta(con, "purged_at", time.time())
    return {"chats_deleted": chats, "orders_erased": len(old)}


def purge_if_due(con) -> None:
    if time.time() - float(get_meta(con, "purged_at", 0) or 0) > 3600:
        purge(con)
