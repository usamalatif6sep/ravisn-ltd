"""Reading and changing products, offers and suppliers, with validation and an audit trail."""

import json
import re
from collections import defaultdict

from . import db, issues, links
from .money import rule_price
from .reference import QTY_BASIS, STATUS_NAMES

PUBLIC_EDITABLE = ("name", "variant", "category", "status", "qty", "qty_basis", "link", "link_label", "more_link", "more_link_label")
PRIVATE_EDITABLE = ("supplier_id", "cost_minor", "item_ref", "supplier_sku", "source_tab", "source_row", "source_link", "note")


class ValidationError(ValueError):
    pass


def tiers_by_item(con, item_ids) -> dict[int, dict[str, list]]:
    out: dict[int, dict[str, list]] = defaultdict(lambda: {"price": [], "cost": []})
    ids = list(item_ids)
    for chunk in range(0, len(ids), 900):
        part = ids[chunk:chunk + 900]
        if not part:
            continue
        ph = ",".join("?" * len(part))
        for r in con.execute(f"SELECT item_id, label, price_minor FROM item_price_tiers WHERE item_id IN ({ph}) ORDER BY sort", part):
            out[r["item_id"]]["price"].append({"label": r["label"], "price_minor": r["price_minor"]})
        for r in con.execute(f"SELECT o.item_id, t.label, t.cost_minor FROM offer_cost_tiers t JOIN offers o ON o.id = t.offer_id WHERE o.item_id IN ({ph}) ORDER BY t.sort", part):
            out[r["item_id"]]["cost"].append({"label": r["label"], "cost_minor": r["cost_minor"]})
    return out


def _issue_counts(con, country=None) -> dict[int, dict]:
    sql = "SELECT item_id, severity, COUNT(*) n FROM issues WHERE state = 'open' AND item_id IS NOT NULL"
    args = []
    if country:
        sql += " AND country = ?"
        args.append(country)
    out: dict[int, dict] = defaultdict(lambda: {"blocker": 0, "warning": 0, "info": 0})
    for r in con.execute(sql + " GROUP BY item_id, severity", args):
        out[r["item_id"]][r["severity"]] = r["n"]
    return out


def list_items(con, country: str, include_private: bool, include_archived: bool = False) -> list[dict]:
    sql = """SELECT i.id, i.code, i.seq, i.name, i.variant, i.category, i.status, i.qty, i.qty_basis, i.price_minor, i.price_mode,
                    i.link, i.archived, o.supplier_id, o.cost_minor, o.item_ref, o.supplier_sku, s.name AS supplier
             FROM items i JOIN offers o ON o.item_id = i.id LEFT JOIN suppliers s ON s.id = o.supplier_id
             WHERE i.country = ?""" + ("" if include_archived else " AND i.archived = 0") + " ORDER BY i.seq"
    rows = con.execute(sql, (country,)).fetchall()
    tiers = tiers_by_item(con, [r["id"] for r in rows])
    counts = _issue_counts(con, country)
    from . import images

    photos = images.photo_status_by_item(con, country)
    out = []
    for r in rows:
        t = tiers.get(r["id"], {"price": [], "cost": []})
        c = counts.get(r["id"], {"blocker": 0, "warning": 0, "info": 0})
        item = {
            "id": r["id"], "code": r["code"], "seq": r["seq"], "name": r["name"], "variant": r["variant"], "category": r["category"],
            "status": r["status"], "qty": r["qty"], "qty_basis": r["qty_basis"], "price_minor": r["price_minor"],
            "price_tiers": t["price"], "price_mode": r["price_mode"], "link": r["link"], "archived": bool(r["archived"]),
            "issues": c, "photo": photos.get(r["id"], "manual_needed"),
        }
        if include_private:
            item.update(supplier_id=r["supplier_id"], supplier=r["supplier"], cost_minor=r["cost_minor"], cost_tiers=t["cost"],
                        item_ref=r["item_ref"], supplier_sku=r["supplier_sku"])
        out.append(item)
    return out


def item_detail(con, item_id: int, include_private: bool) -> dict:
    r = con.execute(
        """SELECT i.*, c.symbol, c.markup_bp, c.min_margin_minor, st.availability FROM items i
           JOIN countries c ON c.key = i.country JOIN statuses st ON st.name = i.status WHERE i.id = ?""",
        (item_id,),
    ).fetchone()
    if r is None:
        raise KeyError(item_id)
    t = tiers_by_item(con, [item_id]).get(item_id, {"price": [], "cost": []})
    detail = {k: r[k] for k in ("id", "code", "country", "seq", "name", "variant", "category", "status", "qty", "qty_basis",
                                "qty_confirmed_at", "price_minor", "price_mode", "price_note", "link", "link_label", "more_link",
                                "more_link_label", "created_at", "updated_at", "availability")}
    detail["archived"] = bool(r["archived"])
    detail["price_tiers"] = t["price"]
    detail["export_link"] = links.clean(r["link"])
    detail["issues"] = [dict(i) for i in con.execute(
        "SELECT id, kind, severity, detail, state, note FROM issues WHERE item_id = ? AND state != 'resolved' ORDER BY id", (item_id,))]
    for i in detail["issues"]:
        i["title"] = issues.KINDS[i["kind"]][0]
        i["private"] = issues.KINDS[i["kind"]][3]
    if include_private:
        o = con.execute("SELECT o.*, s.name AS supplier, s.phone AS supplier_phone, s.whatsapp_link AS supplier_whatsapp FROM offers o LEFT JOIN suppliers s ON s.id = o.supplier_id WHERE o.item_id = ?", (item_id,)).fetchone()
        src = con.execute("SELECT data FROM offer_source_rows WHERE offer_id = ?", (o["id"],)).fetchone()
        detail["private"] = {
            "supplier_id": o["supplier_id"], "supplier": o["supplier"], "supplier_phone": o["supplier_phone"], "supplier_whatsapp": o["supplier_whatsapp"],
            "cost_minor": o["cost_minor"], "cost_tiers": t["cost"], "item_ref": o["item_ref"], "supplier_sku": o["supplier_sku"],
            "source_tab": o["source_tab"], "source_row": o["source_row"], "source_link": o["source_link"], "note": o["note"],
            "source_data": json.loads(src["data"]) if src else None,
            "rule_price_minor": rule_price(o["cost_minor"], r["markup_bp"], r["min_margin_minor"]) if o["cost_minor"] is not None else None,
        }
        orig = con.execute("SELECT public_json, private_json FROM import_values WHERE item_id = ?", (item_id,)).fetchone()
        detail["original"] = {"public": json.loads(orig["public_json"]), "private": json.loads(orig["private_json"])} if orig else None
    else:
        orig = con.execute("SELECT public_json FROM import_values WHERE item_id = ?", (item_id,)).fetchone()
        detail["original"] = {"public": json.loads(orig["public_json"])} if orig else None
    detail["history"] = [
        {"id": h["id"], "at": h["at"], "action": h["action"], "changes": _redact(json.loads(h["changes"]), include_private), "note": h["note"]}
        for h in con.execute("SELECT * FROM audit WHERE entity = 'item' AND entity_id = ? ORDER BY id DESC LIMIT 50", (item_id,))
    ]
    return detail


def _redact(changes: dict, include_private: bool) -> dict:
    if include_private:
        return changes
    return {k: v for k, v in changes.items() if k not in PRIVATE_EDITABLE and k != "cost_tiers"}


# ---------------------------------------------------------------- validation

def _text(value, field, required=False, max_len=500) -> str | None:
    if value is None:
        if required:
            raise ValidationError(f"{field} is required")
        return None
    if not isinstance(value, str):
        raise ValidationError(f"{field} must be text")
    value = re.sub(r"\s+", " ", value).strip()
    if required and not value:
        raise ValidationError(f"{field} cannot be empty")
    if len(value) > max_len:
        raise ValidationError(f"{field} is too long (maximum {max_len} characters)")
    return value or None


def _int(value, field, minimum=0) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise ValidationError(f"{field} must be a whole number")
    try:
        f = float(str(value).replace(",", ""))
    except ValueError as exc:
        raise ValidationError(f"{field} must be a whole number") from exc
    if f != int(f):
        raise ValidationError(f"{field} must be a whole number")
    if f < minimum:
        raise ValidationError(f"{field} cannot be below {minimum}")
    return int(f)


def _url(value, field) -> str | None:
    value = _text(value, field, max_len=2000)
    if value and not links.is_valid(value):
        raise ValidationError(f"{field} must be a full web address starting with https://")
    return value


def _tiers(value, key) -> list[dict]:
    if not isinstance(value, list):
        raise ValidationError("Tiers must be a list")
    out, seen = [], set()
    for t in value:
        label = _text(t.get("label"), "Tier name", required=True, max_len=30)
        if label.lower() in seen:
            raise ValidationError(f"Tier {label} appears twice")
        seen.add(label.lower())
        amount = _int(t.get(key), f"{label} amount")
        if amount is None:
            raise ValidationError(f"{label} needs an amount")
        out.append({"label": label, key: amount})
    return out


# ---------------------------------------------------------------- updates

def _load(con, item_id):
    item = con.execute("SELECT i.*, c.markup_bp, c.min_margin_minor FROM items i JOIN countries c ON c.key = i.country WHERE i.id = ?", (item_id,)).fetchone()
    if item is None:
        raise KeyError(item_id)
    offer = con.execute("SELECT * FROM offers WHERE item_id = ?", (item_id,)).fetchone()
    return item, offer


def update_item(con, item_id: int, patch: dict, note: str | None = None, evaluate: bool = True) -> int | None:
    """Apply a validated change. Returns the audit id, or None if nothing changed."""
    item, offer = _load(con, item_id)
    t = tiers_by_item(con, [item_id]).get(item_id, {"price": [], "cost": []})
    new_item: dict = {}
    new_offer: dict = {}
    for field, value in patch.items():
        if field == "name":
            new_item["name"] = _text(value, "Product name", required=True)
        elif field in ("variant", "link_label", "more_link_label"):
            new_item[field] = _text(value, field.replace("_", " ").capitalize(), max_len=120)
        elif field == "category":
            new_item["category"] = _text(value, "Category", required=True, max_len=80)
        elif field == "status":
            if value not in STATUS_NAMES:
                raise ValidationError("Choose a status from the list")
            new_item["status"] = value
        elif field == "qty":
            new_item["qty"] = _int(value, "Quantity")
        elif field == "qty_basis":
            if value not in QTY_BASIS:
                raise ValidationError("Quantity basis must be reported, minimum or confirmed")
            new_item["qty_basis"] = value
        elif field in ("link", "more_link"):
            new_item[field] = _url(value, "Link")
        elif field == "price_mode":
            if value not in ("rule", "override"):
                raise ValidationError("Price mode must be rule or override")
            new_item["price_mode"] = value
        elif field == "price_minor":
            new_item["price_minor"] = _int(value, "Price")
        elif field == "price_note":
            new_item["price_note"] = _text(value, "Reason", max_len=300)
        elif field == "archived":
            new_item["archived"] = 1 if value else 0
        elif field == "supplier_id":
            if value is not None and not con.execute("SELECT 1 FROM suppliers WHERE id = ?", (value,)).fetchone():
                raise ValidationError("Unknown supplier")
            new_offer["supplier_id"] = value
        elif field == "cost_minor":
            new_offer["cost_minor"] = _int(value, "Cost")
        elif field in ("item_ref", "supplier_sku", "source_tab", "note"):
            new_offer[field] = _text(value, field.replace("_", " ").capitalize(), max_len=300)
        elif field == "source_row":
            new_offer["source_row"] = _int(value, "Source row", minimum=1)
        elif field == "source_link":
            new_offer["source_link"] = _url(value, "Supplier listing link")
        elif field in ("price_tiers", "cost_tiers"):
            pass
        else:
            raise ValidationError(f"{field} cannot be changed")

    price_tiers = _tiers(patch["price_tiers"], "price_minor") if "price_tiers" in patch else t["price"]
    cost_tiers = _tiers(patch["cost_tiers"], "cost_minor") if "cost_tiers" in patch else t["cost"]
    # Typing a price by hand is an override, whatever the previous mode was.
    if ("price_minor" in patch or "price_tiers" in patch) and "price_mode" not in patch:
        new_item["price_mode"] = "override"

    merged = {**dict(item), **new_item}
    merged_offer = {**dict(offer), **new_offer}
    if merged["qty_basis"] == "confirmed" and (item["qty_basis"] != "confirmed" or "qty" in new_item):
        new_item["qty_confirmed_at"] = db.now()
    elif merged["qty_basis"] != "confirmed" and item["qty_confirmed_at"]:
        new_item["qty_confirmed_at"] = None

    mode = merged["price_mode"]
    if mode == "rule":
        if cost_tiers:
            labels = [c["label"] for c in cost_tiers]
            price_tiers = [{"label": c["label"], "price_minor": rule_price(c["cost_minor"], item["markup_bp"], item["min_margin_minor"])} for c in cost_tiers]
            if labels:
                new_item["price_minor"] = None
        elif merged_offer["cost_minor"] is not None:
            new_item["price_minor"] = rule_price(merged_offer["cost_minor"], item["markup_bp"], item["min_margin_minor"])
            price_tiers = []
        else:
            raise ValidationError("Add a cost before using the pricing rule")
        if "price_note" not in patch and item["price_mode"] != "rule":
            new_item["price_note"] = None
    elif mode == "override":
        if not price_tiers and merged["price_minor"] is None and new_item.get("price_minor") is None:
            raise ValidationError("Enter the price to use")
        if not (new_item.get("price_note") or (item["price_mode"] == "override" and item["price_note"] and "price_note" not in patch)):
            raise ValidationError("Give a reason for the price override")

    changes = {}
    for k, v in new_item.items():
        if item[k] != v:
            changes[k] = [item[k], v]
    for k, v in new_offer.items():
        if offer[k] != v:
            changes[k] = [offer[k], v]
    if [(x["label"], x["price_minor"]) for x in price_tiers] != [(x["label"], x["price_minor"]) for x in t["price"]]:
        changes["price_tiers"] = [t["price"], price_tiers]
    if [(x["label"], x["cost_minor"]) for x in cost_tiers] != [(x["label"], x["cost_minor"]) for x in t["cost"]]:
        changes["cost_tiers"] = [t["cost"], cost_tiers]
    if not changes:
        return None
    ts = db.now()
    with con:
        _write(con, item_id, offer["id"], {k: v[1] for k, v in changes.items()}, ts)
        audit_id = db.audit(con, "item", item_id, "update", changes, note)
    if evaluate:
        issues.evaluate(con, [item["country"]], items=[item_id])
    return audit_id


def _write(con, item_id, offer_id, values: dict, ts: str) -> None:
    item_cols = {k: v for k, v in values.items() if k in PUBLIC_EDITABLE or k in ("price_mode", "price_minor", "price_note", "archived", "qty_confirmed_at")}
    offer_cols = {k: v for k, v in values.items() if k in PRIVATE_EDITABLE}
    if item_cols:
        con.execute(f"UPDATE items SET {', '.join(f'{k} = ?' for k in item_cols)}, updated_at = ? WHERE id = ?", (*item_cols.values(), ts, item_id))
    if offer_cols:
        con.execute(f"UPDATE offers SET {', '.join(f'{k} = ?' for k in offer_cols)}, updated_at = ? WHERE id = ?", (*offer_cols.values(), ts, offer_id))
    if "price_tiers" in values:
        con.execute("DELETE FROM item_price_tiers WHERE item_id = ?", (item_id,))
        for i, tier in enumerate(values["price_tiers"], start=1):
            con.execute("INSERT INTO item_price_tiers (item_id, sort, label, price_minor) VALUES (?, ?, ?, ?)", (item_id, i, tier["label"], tier["price_minor"]))
    if "cost_tiers" in values:
        con.execute("DELETE FROM offer_cost_tiers WHERE offer_id = ?", (offer_id,))
        for i, tier in enumerate(values["cost_tiers"], start=1):
            con.execute("INSERT INTO offer_cost_tiers (offer_id, sort, label, cost_minor) VALUES (?, ?, ?, ?)", (offer_id, i, tier["label"], tier["cost_minor"]))


def undo(con, audit_id: int) -> int:
    a = con.execute("SELECT * FROM audit WHERE id = ? AND entity = 'item' AND action IN ('update', 'bulk')", (audit_id,)).fetchone()
    if a is None:
        raise ValidationError("That change cannot be undone")
    item_id = a["entity_id"]
    changes = json.loads(a["changes"])
    item, offer = _load(con, item_id)
    t = tiers_by_item(con, [item_id]).get(item_id, {"price": [], "cost": []})
    current = {**dict(offer), **dict(item), "price_tiers": t["price"], "cost_tiers": t["cost"]}
    for k, (old, new) in changes.items():
        cur = current.get(k)
        if k.endswith("_tiers"):
            cur = [{kk: vv for kk, vv in x.items()} for x in cur]
        if cur != new:
            raise ValidationError("This product has changed since, so the earlier change cannot be undone automatically")
    ts = db.now()
    with con:
        _write(con, item_id, offer["id"], {k: v[0] for k, v in changes.items()}, ts)
        new_id = db.audit(con, "item", item_id, "undo", {k: [v[1], v[0]] for k, v in changes.items()}, f"Undo of change {audit_id}")
    issues.evaluate(con, [item["country"]], items=[item_id])
    return new_id


def next_code(con, country: str) -> tuple[str, int]:
    c = con.execute("SELECT prefix FROM countries WHERE key = ?", (country,)).fetchone()
    if c is None:
        raise ValidationError("Unknown country")
    seq = (con.execute("SELECT MAX(seq) FROM code_registry WHERE country = ?", (country,)).fetchone()[0] or 0) + 1
    return f"{c['prefix']}-{seq:04d}", seq


def create_item(con, country: str, data: dict) -> int:
    name = _text(data.get("name"), "Product name", required=True)
    category = _text(data.get("category"), "Category", required=True, max_len=80)
    status = data.get("status") or "Available on demand"
    if status not in STATUS_NAMES:
        raise ValidationError("Choose a status from the list")
    ts = db.now()
    with con:
        code, seq = next_code(con, country)
        con.execute("INSERT INTO code_registry (code, country, seq, issued_at) VALUES (?, ?, ?, ?)", (code, country, seq, ts))
        item_id = con.execute(
            """INSERT INTO items (code, country, seq, name, category, status, qty, qty_basis, price_minor, price_mode, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, NULL, 'reported', NULL, 'override', ?, ?)""",
            (code, country, seq, name, category, status, ts, ts),
        ).lastrowid
        con.execute("INSERT INTO offers (item_id, updated_at) VALUES (?, ?)", (item_id, ts))
        db.audit(con, "item", item_id, "create", {"code": [None, code], "name": [None, name]}, None)
    rest = {k: v for k, v in data.items() if k not in ("name", "category", "status")}
    if rest:
        try:
            update_item(con, item_id, rest, "Details added when the product was created", evaluate=False)
        except ValidationError:
            # Keep the product (its code is already issued) and report the problem.
            issues.evaluate(con, [country], items=[item_id])
            raise
    issues.evaluate(con, [country], items=[item_id])
    return item_id


def bulk_update(con, item_ids: list[int], patch: dict, note: str) -> int:
    allowed = {"status", "qty", "qty_basis", "category", "archived"}
    if not set(patch) <= allowed:
        raise ValidationError("Only status, quantity, quantity basis, category and archive can be changed in bulk")
    countries = set()
    changed = 0
    for item_id in item_ids:
        country = con.execute("SELECT country FROM items WHERE id = ?", (item_id,)).fetchone()
        if country is None:
            continue
        if update_item(con, item_id, patch, note, evaluate=False):
            changed += 1
        countries.add(country[0])
    if countries:
        issues.evaluate(con, sorted(countries), items=item_ids)
    return changed


def search(con, q: str, include_private: bool, limit: int = 40) -> list[dict]:
    words = [w for w in re.split(r"\s+", q.strip().lower()) if w]
    if not words:
        return []
    fields = "lower(i.code || ' ' || i.name || ' ' || coalesce(i.variant, '') || ' ' || i.category)"
    if include_private:
        fields = "lower(i.code || ' ' || i.name || ' ' || coalesce(i.variant, '') || ' ' || i.category || ' ' || coalesce(o.item_ref, '') || ' ' || coalesce(o.supplier_sku, '') || ' ' || coalesce(s.name, ''))"
    where = " AND ".join(f"instr({fields}, ?) > 0" for _ in words)
    exact = q.strip().upper()
    rows = con.execute(
        f"""SELECT i.id, i.code, i.country, i.name, i.variant, i.status, i.price_minor, c.symbol, i.archived, s.name AS supplier
            FROM items i JOIN offers o ON o.item_id = i.id JOIN countries c ON c.key = i.country LEFT JOIN suppliers s ON s.id = o.supplier_id
            WHERE {where}
            ORDER BY (i.code = ?) DESC, i.archived, c.sort, i.seq LIMIT ?""",
        (*words, exact, limit),
    ).fetchall()
    out = []
    for r in rows:
        d = {k: r[k] for k in ("id", "code", "country", "name", "variant", "status", "price_minor", "symbol")}
        d["archived"] = bool(r["archived"])
        if include_private:
            d["supplier"] = r["supplier"]
        out.append(d)
    return out
