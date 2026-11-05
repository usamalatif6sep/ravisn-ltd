"""Review queue: rule-based checks that turn data problems into a worklist.

`evaluate` recomputes every check and syncs the `issues` table: new problems are
opened, problems that no longer apply are marked resolved, and anything the user
dismissed stays dismissed.
"""

import hashlib
import re
from collections import defaultdict

from . import db, links
from .leaks import LeakScanner, allowances
from .money import fmt, rule_price

# kind: (title, severity, description, private)
KINDS = {
    "leak_supplier_name": ("Supplier name in customer-facing text", "blocker", "A supplier's name appears in a product name, category or link. The product is left out of customer exports until the text is changed or you confirm it is not supplier information.", True),
    "leak_supplier_contact": ("Supplier phone or email in customer-facing text", "blocker", "A supplier phone number or email appears in a customer-facing field.", True),
    "leak_supplier_sku": ("Supplier SKU in customer-facing text", "blocker", "A supplier SKU appears in a customer-facing field.", True),
    "link_private_host": ("Link to Google Drive, WhatsApp or similar", "blocker", "These pages can show the owner's name or contact details, so the product is left out of exports until the link is replaced.", False),
    "no_supplier_available": ("Offered as available with no supplier", "blocker", "Customers see this product as available, but no supplier is mapped, so it cannot be fulfilled. Left out of exports until a supplier is mapped or the status changes.", False),
    "price_missing": ("No price", "blocker", "The product has no customer price.", False),
    "no_supplier": ("No supplier mapped", "warning", "No supplier is linked to this code.", False),
    "no_cost": ("No cost recorded", "warning", "Without a cost the price cannot be checked against the pricing rule.", False),
    "price_exception": ("Price differs from the pricing rule", "warning", "The imported price does not equal the higher of cost + 5% and cost + 1. It has been kept exactly as imported.", False),
    "status_qty_conflict": ("Status and quantity disagree", "warning", "Out of stock with a quantity above zero, or an available status with no quantity. The original values are kept until you change them.", False),
    "duplicate_offer": ("Possible duplicate code", "warning", "Same link, name, supplier, cost, price and item ID as another code. Not merged: customers may have ordered by either code.", False),
    "variant_unclear": ("Same name and link, different price", "warning", "Customers cannot tell these codes apart. Add a variant or size to each.", False),
    "link_missing": ("No listing link", "warning", "The product has no reference link.", False),
    "link_malformed": ("Link is not a valid web address", "warning", "The link cannot be opened as written.", False),
    "link_seller_param": ("Link contains a seller identifier", "warning", "The seller part is removed on export. Check the cleaned link still shows the product.", False),
    "link_redirect": ("Google redirect or search link", "warning", "Replace with the product page itself.", False),
    "link_label_mismatch": ("Link text does not match the site", "info", "The link text names one site but the link goes to another.", False),
    "link_short": ("Shortened link", "info", "Short links hide their destination and cannot be checked offline.", False),
    "link_other_country": ("Listing on another country's marketplace", "info", "The reference listing is on a different country's site. Often fine for pictures; check it is intended.", False),
    "link_tracking": ("Tracking text in link", "info", "Sharing and tracking text is removed automatically on export.", False),
    "name_spaces": ("Extra spaces in product name", "info", "Leading, trailing or double spaces.", False),
    "name_no_size": ("No size or count in name", "info", "Customers are asked to match size, weight or count exactly, but the name gives none. Add a variant if it matters.", False),
    "supplier_no_phone": ("Supplier has no phone number", "warning", "Add a verified phone or WhatsApp number.", True),
    "supplier_unverified": ("Supplier contact not verified", "info", "Confirm the phone and email are correct, then mark the supplier as verified.", True),
}

SEVERITY_ORDER = {"blocker": 0, "warning": 1, "info": 2}
SIZE_RE = re.compile(r"(?i)(\b\d+(\.\d+)?\s?(ml|oz|fl\.?\s?oz|g|gm|gms|grams?|kg|lbs?|l|ltr|litres?|liters?|mg|mcg|pcs?|pieces?|pack|packs|count|ct|tablets?|capsules?|caps|softgels?|sachets?|bars?|rolls?|sheets?|pairs?)\b|\bx\s?\d+\b|\b\d+\s?x\b|\bpack of\b|\bset of\b)")


def _key(kind, item_id=None, supplier_id=None, group=None) -> str:
    return f"{kind}:{item_id or ''}:{supplier_id or ''}:{group or ''}"


def _price_sig(item, tiers) -> str:
    t = tiers.get(item["id"])
    return "|".join(f"{l}={p}" for l, p in t) if t else str(item["price_minor"])


def _group_key(it) -> tuple:
    return (it["country"], links.normalise(it["link"]), (it["name"] or "").strip().lower())


def _compute(con, countries, focus: set[int] | None = None) -> tuple[dict[str, tuple], set[int]]:
    """All issues for `countries`, or only those touching the `focus` item ids (and their duplicate groups)."""
    from . import service

    placeholders = ",".join("?" * len(countries))
    all_rows = con.execute(
        f"""SELECT i.*, s.availability, o.supplier_id, o.cost_minor, o.item_ref, c.symbol, c.markup_bp, c.min_margin_minor
            FROM items i JOIN statuses s ON s.name = i.status JOIN offers o ON o.item_id = i.id JOIN countries c ON c.key = i.country
            WHERE i.archived = 0 AND i.country IN ({placeholders})""",
        countries,
    ).fetchall()
    if focus is not None:
        keys = {_group_key(r) for r in all_rows if r["id"] in focus}
        rows = [r for r in all_rows if r["id"] in focus or _group_key(r) in keys]
    else:
        rows = all_rows
    tier_map = service.tiers_by_item(con, [r["id"] for r in rows])
    price_tiers = {k: [(t["label"], t["price_minor"]) for t in v["price"]] for k, v in tier_map.items() if v["price"]}
    cost_tiers = {k: [(t["label"], t["cost_minor"]) for t in v["cost"]] for k, v in tier_map.items() if v["cost"]}
    scanner = LeakScanner(con)
    allowed = allowances(con)
    out: dict[str, tuple] = {}

    def add(kind, item, detail, group=None):
        out[_key(kind, item["id"], None, group)] = (kind, KINDS[kind][1], item["country"], item["id"], None, group, detail)

    groups = defaultdict(list)
    for it in rows:
        sym = it["symbol"]
        # Private information in public fields
        for field in ("name", "variant", "category", "link", "more_link"):
            for kind, desc, h in scanner.scan(it[field]):
                if (it["id"], field, h) not in allowed:
                    add(kind, it, f"The {field.replace('_', ' ')} contains {desc}.", f"{field}:{h}")
        # Supplier, cost and price
        has_cost = it["cost_minor"] is not None or it["id"] in cost_tiers
        if it["supplier_id"] is None:
            if it["availability"] != "unavailable":
                add("no_supplier_available", it, f"Status is “{it['status']}” but no supplier is mapped.")
            else:
                add("no_supplier", it, "No supplier is mapped (currently out of stock).")
        elif not has_cost:
            add("no_cost", it, "Supplier mapped but no cost recorded.")
        if it["price_minor"] is None and it["id"] not in price_tiers:
            add("price_missing", it, "No customer price.")
        if it["price_mode"] == "imported" and it["cost_minor"] is not None and it["price_minor"] is not None:
            rp = rule_price(it["cost_minor"], it["markup_bp"], it["min_margin_minor"])
            if rp != it["price_minor"]:
                add("price_exception", it, f"Price {fmt(it['price_minor'], sym)}; the rule gives {fmt(rp, sym)} (difference {fmt(abs(rp - it['price_minor']), sym)}).")
        # Stock
        if it["availability"] == "unavailable" and (it["qty"] or 0) > 0:
            add("status_qty_conflict", it, f"Out of stock, but quantity is {it['qty']:,}.")
        elif it["availability"] == "available" and not it["qty"]:
            add("status_qty_conflict", it, f"“{it['status']}”, but quantity is {0 if it['qty'] is None else it['qty']}.")
        # Names
        name = it["name"] or ""
        if name != name.strip() or "  " in name:
            add("name_spaces", it, "The name has extra spaces.")
        if not it["variant"] and not SIZE_RE.search(name):
            add("name_no_size", it, "No size, weight or count in the name.")
        # Links
        for field, label_field in (("link", "link_label"), ("more_link", "more_link_label")):
            if field == "more_link" and not it[field]:
                continue
            for kind, detail in links.findings(it[field], it[label_field], it["country"]):
                add(kind, it, detail if field == "link" else f"More links: {detail}", None if field == "link" else "more")
        groups[_group_key(it)].append(it)

    for (country, link_key, _), members in groups.items():
        if len(members) < 2 or not link_key:
            continue
        by_offer = defaultdict(list)
        by_variant = defaultdict(list)
        for it in members:
            by_offer[(it["supplier_id"], it["cost_minor"], _price_sig(it, price_tiers), it["item_ref"])].append(it)
            by_variant[(it["variant"] or "").strip().lower()].append(it)
        for sig, same in by_offer.items():
            if len(same) > 1:
                g = hashlib.sha1(repr((country, link_key, sig)).encode()).hexdigest()[:12]
                for it in same:
                    others = [o["code"] for o in same if o["id"] != it["id"]]
                    add("duplicate_offer", it, "Identical to " + ", ".join(others[:6]) + (f" and {len(others) - 6} more" if len(others) > 6 else "") + ".", g)
        for variant, same in by_variant.items():
            if len({_price_sig(it, price_tiers) for it in same}) > 1:
                g = hashlib.sha1(repr((country, link_key, variant, same[0]["name"].strip().lower())).encode()).hexdigest()[:12]
                for it in same:
                    others = [o["code"] for o in same if o["id"] != it["id"]]
                    add("variant_unclear", it, f"Same name and link as {', '.join(others[:6])}{' and more' if len(others) > 6 else ''}, at a different price.", g)
    return out, {r["id"] for r in rows}


def _compute_suppliers(con) -> dict[str, tuple]:
    out = {}
    for s in con.execute("SELECT id, name, phone, whatsapp_link, verified_at FROM suppliers"):
        if not (s["phone"] or s["whatsapp_link"]):
            out[_key("supplier_no_phone", None, s["id"])] = ("supplier_no_phone", "warning", None, None, s["id"], None, f"{s['name']} has no phone or WhatsApp number.")
        if not s["verified_at"]:
            out[_key("supplier_unverified", None, s["id"])] = ("supplier_unverified", "info", None, None, s["id"], None, f"Confirm {s['name']}'s phone and email.")
    return out


def evaluate(con, countries: list[str] | None = None, items: list[int] | None = None) -> None:
    """Recompute issues. With `items`, only those products and the products grouped with them are rechecked."""
    all_countries = [r[0] for r in con.execute("SELECT key FROM countries ORDER BY sort")]
    scope = countries or all_countries
    ts = db.now()
    placeholders = ",".join("?" * len(scope))
    if items:
        focus = set(items)
        ph = ",".join("?" * len(focus))
        # Products that shared a duplicate group with these ones before the change must be rechecked too.
        for (gid,) in con.execute(
            f"SELECT DISTINCT x2.item_id FROM issues x1 JOIN issues x2 ON x2.group_key = x1.group_key AND x2.kind = x1.kind "
            f"WHERE x1.item_id IN ({ph}) AND x1.kind IN ('duplicate_offer', 'variant_unclear')", list(focus)):
            focus.add(gid)
        desired, computed = _compute(con, scope, focus)
        affected = list(focus | computed)
        existing = {}
        for i in range(0, len(affected), 900):
            part = affected[i:i + 900]
            ph = ",".join("?" * len(part))
            existing.update({r["key"]: r for r in con.execute(f"SELECT id, key, state, detail FROM issues WHERE item_id IN ({ph})", part)})
    else:
        desired, _ = _compute(con, scope)
        desired.update(_compute_suppliers(con))
        existing = {r["key"]: r for r in con.execute(
            f"SELECT id, key, state, detail FROM issues WHERE country IN ({placeholders}) OR supplier_id IS NOT NULL", scope)}
    with con:
        for key, row in existing.items():
            if key not in desired and row["state"] == "open":
                con.execute("UPDATE issues SET state = 'resolved', note = 'No longer applies', updated_at = ? WHERE id = ?", (ts, row["id"]))
        for key, (kind, severity, country, item_id, supplier_id, group, detail) in desired.items():
            row = existing.get(key)
            if row is None:
                con.execute(
                    "INSERT INTO issues (key, kind, severity, country, item_id, supplier_id, group_key, detail, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)",
                    (key, kind, severity, country, item_id, supplier_id, group, detail, ts, ts),
                )
            elif row["state"] == "resolved":
                con.execute("UPDATE issues SET state = 'open', note = NULL, detail = ?, updated_at = ? WHERE id = ?", (detail, ts, row["id"]))
            elif row["detail"] != detail:
                con.execute("UPDATE issues SET detail = ?, updated_at = ? WHERE id = ?", (detail, ts, row["id"]))


def summary(con) -> list[dict]:
    counts = defaultdict(lambda: {"open": 0, "dismissed": 0, "resolved": 0})
    for r in con.execute("SELECT kind, state, COUNT(*) AS n FROM issues GROUP BY kind, state"):
        counts[r["kind"]][r["state"]] = r["n"]
    out = []
    for kind, (title, severity, description, private) in KINDS.items():
        c = counts.get(kind, {"open": 0, "dismissed": 0, "resolved": 0})
        out.append({"kind": kind, "title": title, "severity": severity, "description": description, "private": private, **c})
    out.sort(key=lambda k: (SEVERITY_ORDER[k["severity"]], -k["open"]))
    return out


def blockers_by_item(con, country: str) -> dict[int, list[str]]:
    out = defaultdict(list)
    for r in con.execute("SELECT item_id, kind FROM issues WHERE state = 'open' AND severity = 'blocker' AND country = ?", (country,)):
        out[r["item_id"]].append(KINDS[r["kind"]][0])
    return out
