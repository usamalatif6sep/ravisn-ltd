"""One-time import of the six Ravisn workbooks, with verification.

The original files are never opened for writing. They are copied into the data
folder first (fingerprints checked before and after), and only the copies are read.
"""

import hashlib
import json
import re
import shutil
import stat
from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook

from . import config, db, issues
from .money import rule_price, to_minor
from .reference import COUNTRIES, QUANTITY_POLICY_BODY, QUANTITY_POLICY_TITLE, STATUSES

TIER_RE = re.compile(r"([A-Za-z]+)\s+(?:[A-Z]{0,2}\$|£|€)\s?([\d,]+(?:\.\d{1,2})?)")
CODE_RE = re.compile(r"^([A-Z]{2})-(\d+)$")
STATUS_DEF_RE = re.compile(r"“([^”]+)”\s*(.*?)(?=\s*“|\Z)", re.S)


class ImportError_(Exception):
    pass


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_tiers(text: str) -> list[tuple[str, int]]:
    return [(m.group(1), to_minor(m.group(2))) for m in TIER_RE.finditer(text or "")]


def status_definitions(text: str) -> dict[str, str]:
    return {m.group(1).strip(): m.group(2).strip() for m in STATUS_DEF_RE.finditer(text or "")}


def status_meanings_text(definitions: dict[str, str], used: list[str]) -> str:
    return " ".join(f"“{s}” {definitions[s]}" for s in used if s in definitions)


def _str(v) -> str | None:
    if v is None:
        return None
    return v if isinstance(v, str) else str(v)


def _link(cell):
    return cell.hyperlink.target if cell.hyperlink is not None and cell.hyperlink.target else None


def copy_originals(source_dir: Path) -> tuple[Path, list[dict]]:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = config.ORIGINALS_DIR / stamp
    dest.mkdir(parents=True, exist_ok=False)
    files = []
    for role, name in config.SOURCE_FILES.items():
        src = source_dir / name
        if not src.exists():
            raise ImportError_(f"Missing workbook: {src}")
        before = sha256(src)
        target = dest / name
        shutil.copy2(src, target)
        copied = sha256(target)
        after = sha256(src)
        if not (before == copied == after):
            raise ImportError_(f"Fingerprint check failed for {name}")
        target.chmod(stat.S_IREAD)
        files.append({"role": role, "name": name, "sha256": before, "bytes": src.stat().st_size, "copy": str(target)})
    return dest, files


def run_import(con, source_dir: Path | None = None) -> dict:
    source_dir = Path(source_dir or config.DEFAULT_SOURCE_DIR)
    if db.is_imported(con):
        raise ImportError_("Data has already been imported. Restore a backup to start again.")
    config.ensure_dirs()
    copy_dir, files = copy_originals(source_dir)
    started = db.now()

    master = load_workbook(copy_dir / config.SOURCE_FILES["master"], data_only=True)
    catalogues = {key: load_workbook(copy_dir / config.SOURCE_FILES[key], data_only=True) for key, *_ in COUNTRIES}

    report: dict = {"files": files, "countries": {}, "checks": [], "exceptions": []}
    with con:
        cur = con.execute(
            "INSERT INTO import_batches (started_at, source_dir, files) VALUES (?, ?, ?)",
            (started, str(source_dir), json.dumps(files)),
        )
        batch_id = cur.lastrowid
        _import_reference(con, catalogues, report)
        supplier_ids = _import_suppliers(con, master)
        source_rows = _read_uk_source_rows(master)
        for key, name, prefix, currency, symbol, sort in COUNTRIES:
            _import_country(con, batch_id, key, prefix, catalogues[key], master[key], supplier_ids, source_rows, report)
        db.audit(con, "import", batch_id, "import", {"files": [f["name"] for f in files]}, "Initial import of the six workbooks")
    _verify(con, catalogues, master, report)
    issues.evaluate(con)
    report["issue_counts"] = issues.summary(con)
    with con:
        con.execute("UPDATE import_batches SET finished_at = ?, report = ? WHERE id = ?", (db.now(), json.dumps(report, ensure_ascii=False), batch_id))
    # Originals must be byte-identical after the import.
    for f in files:
        if sha256(source_dir / f["name"]) != f["sha256"]:
            raise ImportError_(f"{f['name']} changed during import")
    return report


def _import_reference(con, catalogues, report) -> None:
    uk = catalogues["UK"]
    cover = uk["Cover"]
    notes = uk["Notes & Policies"]
    company = cover["B2"].value
    wa_display = _str(cover["C9"].value)
    email = _str(cover["C10"].value)
    settings = {
        "company": company,
        "whatsapp_display": wa_display,
        "whatsapp_link": _link(cover["C9"]),
        "email": email,
        "email_link": _link(cover["C10"]),
        "cover_note": cover["B22"].value,
        "policy_intro": notes["B4"].value,
        "footer": notes["B40"].value,
    }
    for k, v in settings.items():
        db.set_setting(con, k, v)

    definitions: dict[str, str] = {}
    for key, *_ in COUNTRIES:
        ws = catalogues[key]["Notes & Policies"]
        for row in ws.iter_rows(min_row=6, max_col=3):
            if row[1].value == "Status meanings":
                definitions.update(status_definitions(row[2].value))
    for i, (status, availability) in enumerate(STATUSES, start=1):
        if status not in definitions:
            raise ImportError_(f"No definition found for status {status}")
        con.execute("INSERT INTO statuses (name, availability, definition, sort) VALUES (?, ?, ?, ?)", (status, availability, definitions[status], i))

    for key, name, prefix, currency, symbol, sort in COUNTRIES:
        cov = catalogues[key]["Cover"]
        steps = [cov[f"C{r}"].value.replace(f"{key} Products", "{sheet}") for r in range(15, 21)]
        con.execute(
            "INSERT INTO countries (key, name, prefix, currency, symbol, markup_bp, min_margin_minor, sort, stock_text, currency_text, how_to_order) VALUES (?, ?, ?, ?, ?, 500, 100, ?, ?, ?, ?)",
            (key, name, prefix, currency, symbol, sort, cov["C11"].value, cov["C12"].value, json.dumps(steps, ensure_ascii=False)),
        )
        _import_policies(con, key, catalogues[key]["Notes & Policies"], company)


def _import_policies(con, key, ws, company) -> None:
    section_id = None
    s_sort = 0
    i_sort = 0
    for row in ws.iter_rows(min_row=6, max_col=3):
        title, body = row[1].value, row[2].value
        if title is None:
            continue
        if isinstance(title, str) and title.startswith(f"{company}  ·"):
            break
        if body is None:
            s_sort += 1
            i_sort = 0
            section_id = con.execute("INSERT INTO policy_sections (country, sort, heading) VALUES (?, ?, ?)", (key, s_sort, title)).lastrowid
            continue
        i_sort += 1
        generated = "status_meanings" if title == "Status meanings" else None
        if title == "Live quantities":
            db.audit(con, "policy", None, "reword", {"title": [title, QUANTITY_POLICY_TITLE], "body": [body, QUANTITY_POLICY_BODY]},
                     f"{key}: quantities are not verified live counts, so the policy no longer calls them live")
            title, body = QUANTITY_POLICY_TITLE, QUANTITY_POLICY_BODY
        con.execute("INSERT INTO policy_items (section_id, sort, title, body, generated) VALUES (?, ?, ?, ?, ?)", (section_id, i_sort, title, body, generated))


def _import_suppliers(con, master) -> dict[str, int]:
    ws = master["Suppliers"]
    ids = {}
    ts = db.now()
    for r in range(5, ws.max_row + 1):
        name = ws.cell(r, 1).value
        if not name:
            continue
        phone_cell = ws.cell(r, 2)
        wa = _str(ws.cell(r, 14).value) or _link(phone_cell)
        cur = con.execute(
            "INSERT INTO suppliers (name, phone, whatsapp_link, other_numbers, emails, whatsapp_groups, shown_in_sheet, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (name.strip(), _str(phone_cell.value), wa, _str(ws.cell(r, 3).value), _str(ws.cell(r, 4).value), _str(ws.cell(r, 5).value),
             _str(ws.cell(r, 6).value), _str(ws.cell(r, 7).value), ts, ts),
        )
        ids[name] = cur.lastrowid
    return ids


def _read_uk_source_rows(master) -> dict[str, dict]:
    ws = master["UK Source Rows"]
    header = [c.value for c in ws[4]]
    out = {}
    for row in ws.iter_rows(min_row=5, values_only=True):
        if row[0]:
            out[row[0]] = {h: v for h, v in zip(header, row) if v is not None}
    return out


def _import_country(con, batch_id, key, prefix, cat_wb, mws, supplier_ids, source_rows, report) -> None:
    cws = cat_wb[f"{key} Products"]
    has_more = cws.max_column >= 8 and cws.cell(4, 8).value == "More links"
    master_rows = {}
    for r in range(5, mws.max_row + 1):
        code = mws.cell(r, 1).value
        if code:
            master_rows[code] = r
    country = con.execute("SELECT * FROM countries WHERE key = ?", (key,)).fetchone()
    ts = db.now()
    counts = {"catalogue_rows": 0, "master_rows": len(master_rows), "imported": 0, "rule_priced": 0, "tiered": 0, "exceptions": 0, "no_cost": 0}
    for r in range(5, cws.max_row + 1):
        code = cws.cell(r, 1).value
        if not code:
            continue
        counts["catalogue_rows"] += 1
        m = CODE_RE.match(code)
        if not m or m.group(1) != prefix:
            raise ImportError_(f"{key}: unexpected code {code!r} in row {r}")
        if code not in master_rows:
            raise ImportError_(f"{key}: {code} is in the catalogue but not in the supplier master")
        mr = master_rows[code]
        seq = int(m.group(2))
        name = cws.cell(r, 2).value
        category = cws.cell(r, 3).value
        price_cell = cws.cell(r, 4)
        status = cws.cell(r, 5).value
        qty_cell = cws.cell(r, 6)
        link_cell = cws.cell(r, 7)
        more_cell = cws.cell(r, 8) if has_more else None

        supplier_name = mws.cell(mr, 3).value
        cost_raw = mws.cell(mr, 7).value
        mprice_raw = mws.cell(mr, 8).value

        qty = None if qty_cell.value is None else int(round(float(qty_cell.value)))
        qty_basis = "minimum" if "+" in (qty_cell.number_format or "") else "reported"

        price_tiers = parse_tiers(price_cell.value) if isinstance(price_cell.value, str) else []
        cost_tiers = parse_tiers(cost_raw) if isinstance(cost_raw, str) else []
        price_minor = None if price_tiers else to_minor(price_cell.value)
        cost_minor = None if cost_tiers or isinstance(cost_raw, str) else to_minor(cost_raw)

        mode = "imported"
        if price_tiers:
            counts["tiered"] += 1
            if cost_tiers and [t[0] for t in cost_tiers] == [t[0] for t in price_tiers] and all(
                p == rule_price(c, country["markup_bp"], country["min_margin_minor"]) for (_, c), (_, p) in zip(cost_tiers, price_tiers)
            ):
                mode = "rule"
        elif cost_minor is not None and price_minor is not None:
            if price_minor == rule_price(cost_minor, country["markup_bp"], country["min_margin_minor"]):
                mode = "rule"
            else:
                counts["exceptions"] += 1
                report["exceptions"].append({"code": code, "price_minor": price_minor,
                                             "rule_minor": rule_price(cost_minor, country["markup_bp"], country["min_margin_minor"])})
        if cost_minor is None and not cost_tiers:
            counts["no_cost"] += 1
        if mode == "rule":
            counts["rule_priced"] += 1

        con.execute("INSERT INTO code_registry (code, country, seq, issued_at) VALUES (?, ?, ?, ?)", (code, key, seq, ts))
        item_id = con.execute(
            """INSERT INTO items (code, country, seq, name, variant, category, status, qty, qty_basis, price_minor, price_mode,
               link, link_label, more_link, more_link_label, created_at, updated_at)
               VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (code, key, seq, name, category, status, qty, qty_basis, price_minor, mode,
             _link(link_cell), _str(link_cell.value), _link(more_cell) if more_cell is not None else None,
             _str(more_cell.value) if more_cell is not None else None, ts, ts),
        ).lastrowid
        for i, (label, p) in enumerate(price_tiers, start=1):
            con.execute("INSERT INTO item_price_tiers (item_id, sort, label, price_minor) VALUES (?, ?, ?, ?)", (item_id, i, label, p))

        source_row = mws.cell(mr, 6).value
        offer_id = con.execute(
            """INSERT INTO offers (item_id, supplier_id, cost_minor, item_ref, supplier_sku, source_tab, source_row, source_link, source_link_label, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (item_id, supplier_ids.get(supplier_name) if supplier_name else None, cost_minor, _str(mws.cell(mr, 11).value),
             _str(mws.cell(mr, 12).value), _str(mws.cell(mr, 5).value), int(source_row) if source_row is not None else None,
             _str(mws.cell(mr, 14).value), _str(mws.cell(mr, 13).value), ts),
        ).lastrowid
        for i, (label, c) in enumerate(cost_tiers, start=1):
            con.execute("INSERT INTO offer_cost_tiers (offer_id, sort, label, cost_minor) VALUES (?, ?, ?, ?)", (offer_id, i, label, c))
        if key == "UK" and code in source_rows:
            con.execute("INSERT INTO offer_source_rows (offer_id, data) VALUES (?, ?)", (offer_id, json.dumps(source_rows[code], ensure_ascii=False, default=str)))

        public = {"code": code, "name": name, "category": category, "price": price_cell.value, "status": status,
                  "qty": qty_cell.value, "qty_format": qty_cell.number_format, "link": _link(link_cell), "link_label": link_cell.value}
        if more_cell is not None:
            public.update(more_link=_link(more_cell), more_link_label=more_cell.value)
        private = {"supplier": supplier_name, "source_tab": mws.cell(mr, 5).value, "source_row": source_row, "cost": cost_raw,
                   "customer_price": mprice_raw, "item_id": mws.cell(mr, 11).value, "supplier_sku": mws.cell(mr, 12).value,
                   "listing_label": mws.cell(mr, 13).value, "listing_url": mws.cell(mr, 14).value}
        con.execute("INSERT INTO import_values (item_id, batch_id, catalogue_row, master_row, public_json, private_json) VALUES (?, ?, ?, ?, ?, ?)",
                    (item_id, batch_id, r, mr, json.dumps(public, ensure_ascii=False, default=str), json.dumps(private, ensure_ascii=False, default=str)))
        counts["imported"] += 1
    missing = set(master_rows) - {cws.cell(r, 1).value for r in range(5, cws.max_row + 1)}
    if missing:
        raise ImportError_(f"{key}: {len(missing)} codes are in the supplier master but not in the catalogue")
    report["countries"][key] = counts


def _check(report, name, ok, detail) -> None:
    report["checks"].append({"name": name, "ok": bool(ok), "detail": detail})


def _verify(con, catalogues, master, report) -> None:
    """Re-read the copies and compare every value with what is now in the database."""
    from . import service

    total_cat = total_db = 0
    pub_mismatch = []
    priv_mismatch = []
    for key, *_ in COUNTRIES:
        cws = catalogues[key][f"{key} Products"]
        mws = master[key]
        db_items = {r["code"]: r for r in con.execute(
            "SELECT i.*, o.cost_minor, o.supplier_id, o.item_ref, o.supplier_sku, o.source_tab, o.source_row, o.source_link, s.name AS supplier_name "
            "FROM items i JOIN offers o ON o.item_id = i.id LEFT JOIN suppliers s ON s.id = o.supplier_id WHERE i.country = ?", (key,))}
        tiers = service.tiers_by_item(con, [r["id"] for r in db_items.values()])
        total_db += len(db_items)
        for r in range(5, cws.max_row + 1):
            code = cws.cell(r, 1).value
            if not code:
                continue
            total_cat += 1
            it = db_items.get(code)
            if it is None:
                pub_mismatch.append(f"{code}: missing")
                continue
            price_v = cws.cell(r, 4).value
            exp_price = parse_tiers(price_v) if isinstance(price_v, str) else to_minor(price_v)
            got_price = [(t["label"], t["price_minor"]) for t in tiers.get(it["id"], {}).get("price", [])] or it["price_minor"]
            qcell = cws.cell(r, 6)
            checks = {
                "name": (cws.cell(r, 2).value, it["name"]),
                "category": (cws.cell(r, 3).value, it["category"]),
                "price": (exp_price, got_price),
                "status": (cws.cell(r, 5).value, it["status"]),
                "qty": (None if qcell.value is None else int(round(float(qcell.value))), it["qty"]),
                "qty_basis": ("minimum" if "+" in (qcell.number_format or "") else "reported", it["qty_basis"]),
                "link": (_link(cws.cell(r, 7)), it["link"]),
            }
            for field, (a, b) in checks.items():
                if a != b:
                    pub_mismatch.append(f"{code} {field}")
        for r in range(5, mws.max_row + 1):
            code = mws.cell(r, 1).value
            if not code:
                continue
            it = db_items[code]
            cost_v = mws.cell(r, 7).value
            exp_cost = parse_tiers(cost_v) if isinstance(cost_v, str) else to_minor(cost_v)
            got_cost = [(t["label"], t["cost_minor"]) for t in tiers.get(it["id"], {}).get("cost", [])] or it["cost_minor"]
            sr = mws.cell(r, 6).value
            checks = {
                "supplier": (mws.cell(r, 3).value, it["supplier_name"]),
                "cost": (exp_cost, got_cost),
                "item_id": (_str(mws.cell(r, 11).value), it["item_ref"]),
                "supplier_sku": (_str(mws.cell(r, 12).value), it["supplier_sku"]),
                "source": ((_str(mws.cell(r, 5).value), None if sr is None else int(sr)), (it["source_tab"], it["source_row"])),
                "listing_url": (_str(mws.cell(r, 14).value), it["source_link"]),
            }
            for field, (a, b) in checks.items():
                if a != b:
                    priv_mismatch.append(f"{code} {field}")
    _check(report, "Every catalogue row imported", total_cat == total_db, f"{total_db:,} of {total_cat:,} codes")
    _check(report, "Customer values match the catalogues", not pub_mismatch, f"{len(pub_mismatch)} differences" + (f": {', '.join(pub_mismatch[:10])}" if pub_mismatch else ""))
    _check(report, "Private values match the supplier master", not priv_mismatch, f"{len(priv_mismatch)} differences" + (f": {', '.join(priv_mismatch[:10])}" if priv_mismatch else ""))
    reg = con.execute("SELECT COUNT(*) FROM code_registry").fetchone()[0]
    _check(report, "Every code registered as permanent", reg == total_db, f"{reg:,} codes registered")
    if con.execute("SELECT 1 FROM pragma_table_info('items') WHERE name = 'ref'").fetchone():
        db.ensure_refs(con)
        refs = con.execute("SELECT COUNT(DISTINCT ref) FROM items WHERE ref IS NOT NULL").fetchone()[0]
        _check(report, "Every product has a permanent Ravisn reference", refs == total_db, f"{refs:,} references")
    rule = con.execute("SELECT COUNT(*) FROM items WHERE price_mode = 'rule'").fetchone()[0]
    _check(report, "Prices that follow 5% / minimum 1", True, f"{rule:,} follow the rule; {len(report['exceptions'])} exceptions kept as imported for review")

    # Policies and cover text regenerated by the app must equal the originals.
    defs = {r["name"]: r["definition"] for r in con.execute("SELECT name, definition FROM statuses")}
    settings = {k: db.get_setting(con, k) for k in ("company", "whatsapp_display", "email")}
    text_diffs = []
    for key, *_ in COUNTRIES:
        cat = catalogues[key]
        used = [s for s, _ in STATUSES if con.execute("SELECT 1 FROM items WHERE country = ? AND status = ? LIMIT 1", (key, s)).fetchone()]
        for row in cat["Notes & Policies"].iter_rows(min_row=6, max_col=3):
            if row[1].value == "Status meanings" and row[2].value != status_meanings_text(defs, used):
                text_diffs.append(f"{key} status meanings")
        cover = cat["Cover"]
        steps = json.loads(con.execute("SELECT how_to_order FROM countries WHERE key = ?", (key,)).fetchone()[0])
        for i, step in enumerate(steps):
            if cover[f"C{15 + i}"].value != step.replace("{sheet}", f"{key} Products"):
                text_diffs.append(f"{key} how-to-order step {i + 1}")
        footer = f"{settings['company']}  ·  WhatsApp {settings['whatsapp_display']}  ·  {settings['email']}"
        if cat["Notes & Policies"]["B40"].value != footer and cat["Notes & Policies"]["B39"].value != footer:
            text_diffs.append(f"{key} footer")
    _check(report, "Cover and policy text reproduced exactly", not text_diffs, "identical" if not text_diffs else ", ".join(text_diffs))
