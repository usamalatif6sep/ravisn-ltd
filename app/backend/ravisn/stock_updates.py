"""Supplier stock updates, kept apart from the website and from the original workbooks.

A supplier's new stock list (Excel, CSV, or a Google Sheet shared by link) is read and matched to that supplier's
products in one country by stable identifiers only: the supplier's SKU, the supplier's item reference, or the Ravisn
reference / legacy code. Names are never used to match, so a product is never updated by guesswork.

Nothing changes until the owner applies the preview, and then:
- a verified backup of the database is taken first;
- matched products get the new quantity, status and cost; prices on the pricing rule are recalculated with the
  country's approved markup and minimum margin; imported prices are recalculated too when the owner chooses;
  prices the owner set by hand (override) are never touched;
- rows that match nothing are new products to review: only those the owner picks are created, each with a new
  permanent Ravisn reference, and no existing reference is ever renumbered or reused;
- products of this supplier that are missing from the list are flagged in their history (and, if the owner chooses,
  marked out of stock). Nothing is deleted;
- anything that changed after the preview was made is skipped and reported, not overwritten.
"""

import csv
import hashlib
import io
import json
import re
import urllib.parse
import urllib.request

from . import backup, db, issues, service
from .money import rule_price, to_minor
from .service import ValidationError

MAX_BYTES = 15 * 1024 * 1024
MAX_ROWS = 20000

COLUMNS = {
    "ravisn": ("ravisn ref", "ravisn reference", "ravisn code", "rvn ref", "rvn"),
    "sku": ("sku", "supplier sku", "item sku", "product sku", "seller sku", "stock code", "item code", "product code", "code", "article", "article number"),
    "ref": ("item ref", "item reference", "reference", "ref", "asin", "product ref", "model", "model number", "upc", "ean", "barcode", "gtin"),
    "name": ("name", "product", "product name", "title", "product title", "item", "item name", "description", "product description"),
    "variant": ("variant", "variation", "size", "option", "colour", "color"),
    "qty": ("qty", "quantity", "stock", "stock qty", "stock quantity", "available", "available qty", "units", "inventory", "on hand", "in stock"),
    "cost": ("cost", "unit cost", "cost price", "price", "unit price", "wholesale", "wholesale price", "buy price", "trade price", "our price"),
    "category": ("category", "department", "type", "product type"),
}
EMPTY = {"", "-", "n/a", "na", "none", "null", "#n/a", "tbc"}


def _cell(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() else repr(v)
    return str(v).strip()


def read_table(data: bytes, filename: str, sheet: str | None = None) -> list[list[str]]:
    if len(data) > MAX_BYTES:
        raise ValidationError("That file is larger than 15 MB")
    name = (filename or "").lower()
    if data[:4] == b"PK\x03\x04":
        from openpyxl import load_workbook

        try:
            wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        except Exception as e:  # noqa: BLE001 - any unreadable workbook is a user error
            raise ValidationError("That Excel file could not be read") from e
        try:
            sheets = [ws for ws in wb.worksheets if not sheet or ws.title.strip().lower() == sheet.strip().lower()]
            if not sheets:
                raise ValidationError(f"There is no sheet called {sheet}")
            best: list[list[str]] = []
            for ws in sheets:
                rows = []
                for r in ws.iter_rows(values_only=True):
                    rows.append([_cell(v) for v in r])
                    if len(rows) > MAX_ROWS + 30:
                        raise ValidationError(f"The sheet has more than {MAX_ROWS} rows")
                if len([r for r in rows if any(r)]) > len([r for r in best if any(r)]):
                    best = rows
            return best
        finally:
            wb.close()
    if name.endswith(".xls") or data[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        raise ValidationError("Old .xls files are not supported. Save it as .xlsx or CSV and upload again.")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("cp1252", errors="replace")
    if "<html" in text[:600].lower():
        raise ValidationError("That is a web page, not a spreadsheet. If it is a Google Sheet, share it as “Anyone with the link can view”.")
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    rows = [[c.strip() for c in r] for r in csv.reader(io.StringIO(text), dialect)]
    if len(rows) > MAX_ROWS + 30:
        raise ValidationError(f"The file has more than {MAX_ROWS} rows")
    return rows


GOOGLE = re.compile(r"^https://docs\.google\.com/spreadsheets/d/(e/)?([A-Za-z0-9_-]{20,})")


def fetch_google_sheet(url: str, opener=urllib.request.urlopen) -> tuple[bytes, str]:
    """Download a Google Sheet the supplier shared by link, as CSV. Nothing is uploaded anywhere."""
    url = (url or "").strip()
    m = GOOGLE.match(url)
    if not m:
        raise ValidationError("Paste a Google Sheets link (https://docs.google.com/spreadsheets/...)")
    parsed = urllib.parse.urlparse(url)
    gid = (urllib.parse.parse_qs(parsed.query).get("gid") or urllib.parse.parse_qs(parsed.fragment).get("gid") or ["0"])[0]
    if not gid.isdigit():
        gid = "0"
    if m.group(1):  # "Publish to the web" link
        export = f"https://docs.google.com/spreadsheets/d/e/{m.group(2)}/pub?output=csv&gid={gid}"
    else:
        export = f"https://docs.google.com/spreadsheets/d/{m.group(2)}/export?format=csv&gid={gid}"
    req = urllib.request.Request(export, headers={"User-Agent": "Ravisn-stock-update/1.0"})
    try:
        with opener(req, timeout=30) as r:
            host = urllib.parse.urlparse(r.geturl()).hostname or ""
            if not (host == "docs.google.com" or host.endswith(".googleusercontent.com")):
                raise ValidationError("The sheet could not be downloaded. Share it as “Anyone with the link can view”.")
            data = r.read(MAX_BYTES + 1)
    except ValidationError:
        raise
    except Exception as e:  # noqa: BLE001
        raise ValidationError("The sheet could not be downloaded. Share it as “Anyone with the link can view” and try again.") from e
    return data, f"Google Sheet {m.group(2)[:8]}…"


def _norm(h: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (h or "").lower()).strip()


def find_columns(rows: list[list[str]], override: dict | None = None) -> tuple[int, dict[str, int]]:
    best = (0, -1, {})
    for i, r in enumerate(rows[:30]):
        heads = [_norm(h) for h in r]
        mapping: dict[str, int] = {}
        for field, names in COLUMNS.items():
            for j, h in enumerate(heads):
                if h in names and j not in mapping.values():
                    mapping[field] = j
                    break
        if override:
            for field, header in override.items():
                if field in COLUMNS and header:
                    if _norm(header) in heads:
                        mapping[field] = heads.index(_norm(header))
        if len(mapping) > best[0]:
            best = (len(mapping), i, mapping)
    _, header_row, mapping = best
    if not ({"sku", "ref", "ravisn"} & set(mapping)):
        raise ValidationError("No identifier column was found. The sheet needs a supplier SKU, an item reference (for example ASIN) or a Ravisn reference column.")
    if not ({"qty", "cost"} & set(mapping)):
        raise ValidationError("No quantity or cost column was found, so there is nothing to update.")
    return header_row, mapping


def _key(v: str | None) -> str | None:
    k = re.sub(r"\s+", "", v or "").upper()
    return None if k.lower() in EMPTY else k


def _qty(v: str) -> int | None:
    v = (v or "").strip().replace(",", "")
    if v.lower() in EMPTY:
        return None
    m = re.fullmatch(r"(\d+)(\.0+)?\+?", v)
    if m:
        return int(m.group(1))
    if v.lower() in ("out of stock", "oos", "sold out"):
        return 0
    return None


def _cost(v: str) -> int | None:
    v = re.sub(r"[£$€\s]|[A-Z]{3}$", "", (v or "").strip())
    if v.lower() in EMPTY:
        return None
    try:
        c = to_minor(v)
    except ValueError:
        return None
    return c if c is not None and 0 <= c <= 100_000_000 else None


def _catalogue(con, supplier_id: int, country: str):
    rows = con.execute(
        """SELECT i.id, i.code, i.ref, i.name, i.variant, i.status, i.qty, i.price_minor, i.price_mode, i.archived,
                  o.cost_minor, o.supplier_sku, o.item_ref, s.availability, c.markup_bp, c.min_margin_minor,
                  (SELECT COUNT(*) FROM offer_cost_tiers t WHERE t.offer_id = o.id) AS cost_tiers
           FROM items i JOIN offers o ON o.item_id = i.id JOIN statuses s ON s.name = i.status JOIN countries c ON c.key = i.country
           WHERE o.supplier_id = ? AND i.country = ?""", (supplier_id, country)).fetchall()
    index: dict[str, dict[str, list[int]]] = {"ravisn": {}, "sku": {}, "ref": {}}
    by_id = {r["id"]: r for r in rows}
    for r in rows:
        for k in (r["ref"], r["code"]):
            if k:
                index["ravisn"].setdefault(k.upper(), []).append(r["id"])
        if _key(r["supplier_sku"]):
            index["sku"].setdefault(_key(r["supplier_sku"]), []).append(r["id"])
        if _key(r["item_ref"]):
            index["ref"].setdefault(_key(r["item_ref"]), []).append(r["id"])
    return by_id, index


def preview(con, supplier_id: int, country: str, data: bytes, source: str, sheet: str | None = None, columns: dict | None = None) -> dict:
    sup = con.execute("SELECT id, name FROM suppliers WHERE id = ?", (supplier_id,)).fetchone()
    if sup is None:
        raise KeyError(supplier_id)
    if not con.execute("SELECT 1 FROM countries WHERE key = ?", (country,)).fetchone():
        raise ValidationError("Choose the country catalogue this list is for")
    table = read_table(data, source, sheet)
    header_row, cols = find_columns(table, columns)
    by_id, index = _catalogue(con, supplier_id, country)
    others = {r[0].upper(): r[1] for r in con.execute("SELECT code, id FROM items WHERE country = ?", (country,))} | \
             {r[0].upper(): r[1] for r in con.execute("SELECT ref, id FROM items WHERE country = ? AND ref IS NOT NULL", (country,))}
    get = lambda r, f: (r[cols[f]] if f in cols and cols[f] < len(r) else "")  # noqa: E731
    out, seen = [], {}
    for n, r in enumerate(table[header_row + 1:], start=header_row + 2):
        if not any(c.strip() for c in r):
            continue
        keys = {f: _key(get(r, f)) for f in ("ravisn", "sku", "ref")}
        row = {"row": n, "sku": get(r, "sku") or None, "ref": get(r, "ref") or None, "ravisn": get(r, "ravisn") or None,
               "name": (get(r, "name") or "")[:300] or None, "variant": (get(r, "variant") or "")[:120] or None,
               "category": (get(r, "category") or "")[:80] or None,
               "qty": _qty(get(r, "qty")) if "qty" in cols else None, "cost_minor": _cost(get(r, "cost")) if "cost" in cols else None,
               "state": "new", "item_id": None, "code": None, "item_ref_code": None, "changes": {}, "price": None, "notes": []}
        if "qty" in cols and get(r, "qty") and row["qty"] is None:
            row["notes"].append(f"Quantity “{get(r, 'qty')[:20]}” is not a number, so it is not changed")
        if "cost" in cols and get(r, "cost") and row["cost_minor"] is None:
            row["notes"].append(f"Cost “{get(r, 'cost')[:20]}” is not an amount, so it is not changed")
        if not any(keys.values()):
            row["state"] = "invalid"
            row["notes"].append("No SKU or reference on this row")
            out.append(row)
            continue
        ids: list[int] = []
        for f in ("ravisn", "sku", "ref"):
            if keys[f] and keys[f] in index[f]:
                ids = index[f][keys[f]]
                break
        if not ids and keys["ravisn"] and keys["ravisn"] in others:
            row["state"] = "other_supplier"
            row["notes"].append("That Ravisn reference belongs to another supplier's product, so it is not changed")
            out.append(row)
            continue
        if len(set(ids)) > 1:
            row["state"] = "ambiguous"
            row["notes"].append(f"Matches {len(set(ids))} products; update them by hand")
            out.append(row)
            continue
        if ids:
            it = by_id[ids[0]]
            row.update(item_id=it["id"], code=it["code"], item_ref_code=it["ref"], current_name=it["name"] + (f", {it['variant']}" if it["variant"] else ""))
            if it["id"] in seen:
                row["state"] = "duplicate"
                row["notes"].append(f"The same product is already on row {seen[it['id']]}")
                out.append(row)
                continue
            seen[it["id"]] = n
            if it["archived"]:
                row["state"] = "archived"
                row["notes"].append("This product is archived, so it is not changed")
                out.append(row)
                continue
            ch = {}
            if row["qty"] is not None and row["qty"] != it["qty"]:
                ch["qty"] = [it["qty"], row["qty"]]
            if row["qty"] == 0 and it["availability"] != "unavailable":
                ch["status"] = [it["status"], "Out of stock"]
            elif row["qty"] and it["status"] == "Out of stock":
                ch["status"] = [it["status"], "Available"]
            if row["cost_minor"] is not None and row["cost_minor"] != it["cost_minor"]:
                if it["cost_tiers"]:
                    row["notes"].append("This product has pack costs, so its cost is changed by hand")
                else:
                    ch["cost_minor"] = [it["cost_minor"], row["cost_minor"]]
            if "cost_minor" in ch:
                new_rule = rule_price(row["cost_minor"], it["markup_bp"], it["min_margin_minor"])
                action = {"rule": "recalculated", "imported": "recalculate_if_chosen", "override": "kept"}[it["price_mode"]]
                row["price"] = {"mode": it["price_mode"], "old": it["price_minor"], "rule": new_rule, "action": action}
                if it["price_mode"] == "override":
                    row["notes"].append("The price was set by hand, so it is kept. Check it against the new cost.")
            row["changes"] = ch
            row["state"] = "matched" if ch else "unchanged"
        else:
            if row["cost_minor"] is None:
                row["notes"].append("A new product needs a cost before it can be created from this list")
            row["price"] = {"mode": "rule", "old": None, "rule": rule_price(row["cost_minor"], *con.execute(
                "SELECT markup_bp, min_margin_minor FROM countries WHERE key = ?", (country,)).fetchone()), "action": "new"} if row["cost_minor"] is not None else None
        out.append(row)
    removed = [{"item_id": i, "code": r["code"], "ref": r["ref"], "name": r["name"] + (f", {r['variant']}" if r["variant"] else ""),
                "status": r["status"], "qty": r["qty"]}
               for i, r in by_id.items() if i not in seen and not r["archived"]]
    summary = {k: sum(1 for r in out if r["state"] == k) for k in ("matched", "unchanged", "new", "ambiguous", "duplicate", "invalid", "other_supplier", "archived")}
    summary.update(rows=len(out), removed=len(removed), columns={k: table[header_row][v] for k, v in cols.items()}, header_row=header_row + 1,
                   price_recalculated=sum(1 for r in out if r["price"] and r["price"]["action"] == "recalculated"),
                   price_kept=sum(1 for r in out if r["price"] and r["price"]["action"] == "kept"),
                   price_imported=sum(1 for r in out if r["price"] and r["price"]["action"] == "recalculate_if_chosen"))
    ts = db.now()
    with con:
        uid = con.execute("INSERT INTO stock_updates (supplier_id, country, source, sha256, created_at, summary, rows) VALUES (?, ?, ?, ?, ?, ?, ?)",
                          (supplier_id, country, (source or "upload")[:200], hashlib.sha256(data).hexdigest(), ts,
                           json.dumps(summary), json.dumps({"rows": out, "removed": removed}))).lastrowid
        db.audit(con, "supplier", supplier_id, "stock_preview", {"update": [None, uid], "country": [None, country]})
    return detail(con, uid)


def detail(con, update_id: int) -> dict:
    u = con.execute("SELECT u.*, s.name AS supplier_name FROM stock_updates u JOIN suppliers s ON s.id = u.supplier_id WHERE u.id = ?", (update_id,)).fetchone()
    if u is None:
        raise KeyError(update_id)
    body = json.loads(u["rows"])
    return {"id": u["id"], "supplier": {"id": u["supplier_id"], "name": u["supplier_name"]}, "country": u["country"], "source": u["source"],
            "created_at": u["created_at"], "status": u["status"], "applied_at": u["applied_at"], "summary": json.loads(u["summary"]),
            "result": json.loads(u["result"]) if u["result"] else None, "rows": body["rows"], "removed": body["removed"]}


def history(con, supplier_id: int) -> list[dict]:
    return [{"id": r["id"], "country": r["country"], "source": r["source"], "created_at": r["created_at"], "status": r["status"],
             "applied_at": r["applied_at"], "summary": json.loads(r["summary"])}
            for r in con.execute("SELECT * FROM stock_updates WHERE supplier_id = ? ORDER BY id DESC LIMIT 30", (supplier_id,))]


def discard(con, update_id: int) -> dict:
    with con:
        n = con.execute("UPDATE stock_updates SET status = 'discarded' WHERE id = ? AND status = 'preview'", (update_id,)).rowcount
    if not n:
        raise ValidationError("Only a preview that has not been applied can be discarded")
    return detail(con, update_id)


def apply(con, update_id: int, options: dict) -> dict:
    u = detail(con, update_id)
    if u["status"] != "preview":
        raise ValidationError("This update has already been applied or discarded")
    reprice = options.get("reprice_imported", True) is True
    mark_out = options.get("removed") == "out_of_stock"
    create = {int(x) for x in options.get("create") or []}
    category = (str(options.get("category") or "").strip()[:80]) or None
    if create and not category and any(not r["category"] for r in u["rows"] if r["row"] in create):
        raise ValidationError("Choose a category for the new products")
    path = backup.backup_now(con, "stock-update")
    note = f"Supplier stock update {update_id}"
    country = u["country"]
    res = {"updated": 0, "repriced": 0, "created": [], "flagged": 0, "marked_out": 0, "skipped": [], "backup": path.name}
    for r in u["rows"]:
        if r["state"] != "matched":
            continue
        cur = con.execute("SELECT i.qty, i.status, i.price_mode, i.archived, o.cost_minor FROM items i JOIN offers o ON o.item_id = i.id WHERE i.id = ?",
                          (r["item_id"],)).fetchone()
        old = {"qty": cur["qty"], "status": cur["status"], "cost_minor": cur["cost_minor"]}
        if cur["archived"] or any(old[k] != v[0] for k, v in r["changes"].items()):
            res["skipped"].append({"row": r["row"], "code": r["item_ref_code"] or r["code"], "reason": "Changed since the preview"})
            continue
        patch = {k: v[1] for k, v in r["changes"].items()}
        if "cost_minor" in patch and cur["price_mode"] == "imported" and reprice:
            patch["price_mode"] = "rule"
        try:
            if service.update_item(con, r["item_id"], patch, note, evaluate=False):
                res["updated"] += 1
                if "cost_minor" in patch and (cur["price_mode"] == "rule" or patch.get("price_mode") == "rule"):
                    res["repriced"] += 1
        except ValidationError as e:
            res["skipped"].append({"row": r["row"], "code": r["item_ref_code"] or r["code"], "reason": str(e)})
    for r in u["rows"]:
        if r["state"] != "new" or r["row"] not in create:
            continue
        if r["cost_minor"] is None or not r["name"]:
            res["skipped"].append({"row": r["row"], "code": r["sku"] or r["ref"], "reason": "A new product needs a name and a cost"})
            continue
        qty = r["qty"]
        data = {"name": r["name"], "category": r["category"] or category,
                "status": "Available" if qty else "Out of stock" if qty == 0 else "Available on demand",
                "supplier_id": u["supplier"]["id"], "cost_minor": r["cost_minor"], "price_mode": "rule", "qty_basis": "reported"}
        if r["variant"]:
            data["variant"] = r["variant"]
        if qty is not None:
            data["qty"] = qty
        if r["sku"]:
            data["supplier_sku"] = r["sku"]
        if r["ref"]:
            data["item_ref"] = r["ref"]
        try:
            item_id = service.create_item(con, country, data)
            ref = con.execute("SELECT ref, code FROM items WHERE id = ?", (item_id,)).fetchone()
            db.audit(con, "item", item_id, "stock_new", {}, note)
            res["created"].append({"row": r["row"], "item_id": item_id, "ref": ref["ref"], "code": ref["code"]})
        except ValidationError as e:
            res["skipped"].append({"row": r["row"], "code": r["sku"] or r["ref"], "reason": str(e)})
    for m in u["removed"]:
        cur = con.execute("SELECT i.status, s.availability, i.archived FROM items i JOIN statuses s ON s.name = i.status WHERE i.id = ?", (m["item_id"],)).fetchone()
        if cur is None or cur["archived"]:
            continue
        with con:
            db.audit(con, "item", m["item_id"], "stock_flag", {}, f"Not in the supplier's latest stock list ({note}). Check before selling.")
        res["flagged"] += 1
        if mark_out and cur["availability"] != "unavailable":
            try:
                service.update_item(con, m["item_id"], {"status": "Out of stock"}, f"{note}: not in the supplier's latest list", evaluate=False)
                res["marked_out"] += 1
            except ValidationError as e:
                res["skipped"].append({"row": None, "code": m["ref"] or m["code"], "reason": str(e)})
    issues.evaluate(con, [country])
    with con:
        con.execute("UPDATE stock_updates SET status = 'applied', applied_at = ?, result = ? WHERE id = ?", (db.now(), json.dumps(res), update_id))
        db.audit(con, "supplier", u["supplier"]["id"], "stock_apply", {"update": [None, update_id], "updated": [None, res["updated"]],
                                                                      "created": [None, len(res["created"])], "flagged": [None, res["flagged"]]})
    return detail(con, update_id)
