"""Private supplier fulfilment facts, and the customer-safe part of them.

Everything here is private admin data. Only fields marked public, only once the owner has verified them, and only
after a scan for supplier names, phone numbers, emails and SKUs, ever reach a product page (see
publishing.public_fulfilment). Changing a public field withdraws the verification until it is confirmed again.
"""

import re

from . import db
from .leaks import LeakScanner
from .service import ValidationError

FIELDS = {
    "stock_update_frequency": 80,
    "last_stock_verified_at": 10,
    "countries_served": 200,
    "dispatch_cutoff": 40,
    "cutoff_timezone": 60,
    "shipping_methods": 300,
    "carriers": 200,
    "label_arrangements": 400,
    "tracking_arrangements": 300,
    "dispatch_estimate": 120,
    "notes": 2000,
}
PUBLIC = ("dispatch_cutoff", "cutoff_timezone", "dispatch_estimate", "carriers", "shipping_methods", "label_arrangements", "tracking_arrangements")
ADDRESS_HINT = re.compile(r"\b(\d{1,5}\s+\w+\s+(street|st|road|rd|avenue|ave|lane|ln|drive|dr|way|unit|suite|warehouse))\b|\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b", re.I)


def get(con, supplier_id: int) -> dict:
    if not con.execute("SELECT 1 FROM suppliers WHERE id = ?", (supplier_id,)).fetchone():
        raise KeyError(supplier_id)
    row = con.execute("SELECT * FROM supplier_fulfilment WHERE supplier_id = ?", (supplier_id,)).fetchone()
    out = {k: (row[k] if row else None) for k in FIELDS}
    out["verified"] = bool(row and row["verified"])
    out["verified_at"] = row["verified_at"] if row else None
    out["updated_at"] = row["updated_at"] if row else None
    out["public_fields"] = list(PUBLIC)
    from .publishing import public_fulfilment

    out["customer_view"] = public_fulfilment(row) if row else None
    return out


def save(con, supplier_id: int, body: dict) -> dict:
    current = get(con, supplier_id)
    vals = {}
    for k, n in FIELDS.items():
        if k in body:
            v = body[k]
            v = (re.sub(r"[ \t]+", " ", str(v)).strip()[:n] or None) if v is not None else None
            if k == "last_stock_verified_at" and v and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
                raise ValidationError("Write the last verified date as YYYY-MM-DD")
            vals[k] = v
    merged = {**{k: current[k] for k in FIELDS}, **vals}
    public_changed = any(k in vals and vals[k] != current[k] for k in PUBLIC)
    verified = body.get("verified")
    if verified is True:
        if not any(merged[k] for k in PUBLIC):
            raise ValidationError("Add at least one customer-facing fact before marking it verified")
        scanner = LeakScanner(con)
        for k in PUBLIC:
            hits = scanner.scan(merged[k])
            if hits:
                raise ValidationError(f"{k.replace('_', ' ').capitalize()} mentions {hits[0][1]}. Customer-facing facts must not name a supplier or give contact details.")
            if merged[k] and ADDRESS_HINT.search(merged[k]):
                raise ValidationError(f"{k.replace('_', ' ').capitalize()} looks like it contains an address. Dispatch addresses are confirmed privately, never published.")
        new_verified, verified_at = 1, db.now()
    elif verified is False or public_changed:
        new_verified, verified_at = 0, None
    else:
        new_verified, verified_at = (1 if current["verified"] else 0), current["verified_at"]
    changes = {k: [current[k], merged[k]] for k in FIELDS if merged[k] != current[k]}
    if new_verified != (1 if current["verified"] else 0):
        changes["verified"] = [current["verified"], bool(new_verified)]
    if not changes:
        return current
    ts = db.now()
    cols = list(FIELDS)
    with con:
        con.execute(
            f"""INSERT INTO supplier_fulfilment (supplier_id, {', '.join(cols)}, verified, verified_at, updated_at)
                VALUES (?, {', '.join('?' * len(cols))}, ?, ?, ?)
                ON CONFLICT(supplier_id) DO UPDATE SET {', '.join(f'{c} = excluded.{c}' for c in cols)},
                verified = excluded.verified, verified_at = excluded.verified_at, updated_at = excluded.updated_at""",
            (supplier_id, *[merged[c] for c in cols], new_verified, verified_at, ts),
        )
        db.audit(con, "supplier", supplier_id, "fulfilment", {k: v for k, v in changes.items() if k != "notes"} | ({"notes": ["…", "…"]} if "notes" in changes else {}))
    return get(con, supplier_id)
