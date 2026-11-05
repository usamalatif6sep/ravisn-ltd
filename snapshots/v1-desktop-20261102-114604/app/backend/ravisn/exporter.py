"""Excel exports.

Customer catalogues are built only from the public_* views, settings and policies.
Before a customer file is saved, every cell and link in it is scanned for supplier
names, phones, emails and SKUs; any hit aborts the export.
"""

import json
import math
import os
from datetime import date
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.properties import PageSetupProperties
from openpyxl.worksheet.table import Table

from . import config, db, issues, links, service
from .importer import status_meanings_text
from .leaks import LeakScanner, allowances
from .money import fmt, to_minor
from .reference import EXCEL_PRICE_FORMAT, QTY_BASIS, STATUS_NAMES

FONT = "Helvetica Neue"
INK, GREY, TERTIARY, BLUE = "FF1D1D1F", "FF6E6E73", "FF86868B", "FF0066CC"
RED, ORANGE, GREEN = "FFD70015", "FFB25000", "FF248A3D"
LIGHT = Border(bottom=Side(style="thin", color="FFE5E5EA"))
DARK = Border(bottom=Side(style="thin", color="FF1D1D1F"))
HEADER_LINE = Border(bottom=Side(style="thin", color="FFD2D2D7"))
HEADER_FILL = PatternFill("solid", fgColor="FFF5F5F7")


class ExportBlocked(Exception):
    def __init__(self, message: str, precheck: dict | None = None):
        super().__init__(message)
        self.precheck = precheck


def f(size, bold=False, color=INK):
    return Font(name=FONT, size=size, bold=bold, color=color)


def _unique_path(folder: Path, stem: str) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    p = folder / f"{stem}.xlsx"
    n = 2
    while p.exists():
        p = folder / f"{stem}_{n}.xlsx"
        n += 1
    return p


def _save(wb: Workbook, path: Path) -> None:
    tmp = path.with_suffix(".tmp")
    wb.save(tmp)
    os.replace(tmp, path)


def _lines(text: str, per_line: int) -> int:
    return max(1, sum(max(1, math.ceil(len(part) / per_line)) for part in (text or "").split("\n")))


# ---------------------------------------------------------------- customer catalogue

def _public_rows(con, country: str):
    rows = con.execute("SELECT * FROM public_catalogue WHERE country = ? ORDER BY seq", (country,)).fetchall()
    tiers: dict[int, list] = {}
    for t in con.execute("SELECT t.* FROM public_price_tiers t JOIN items i ON i.id = t.item_id WHERE i.country = ? ORDER BY t.item_id, t.sort", (country,)):
        tiers.setdefault(t["item_id"], []).append((t["label"], t["price_minor"]))
    return rows, tiers


def _global_texts(con, country: str) -> list[tuple[str, str]]:
    texts = []
    for k in ("company", "whatsapp_display", "whatsapp_link", "email", "email_link", "cover_note", "policy_intro", "footer"):
        texts.append((f"setting {k}", db.get_setting(con, k) or ""))
    c = con.execute("SELECT * FROM countries WHERE key = ?", (country,)).fetchone()
    for i, step in enumerate(json.loads(c["how_to_order"]), start=1):
        texts.append((f"how to order step {i}", step))
    texts += [("stock text", c["stock_text"]), ("currency text", c["currency_text"])]
    for p in con.execute("SELECT s.heading, i.title, i.body FROM policy_sections s JOIN policy_items i ON i.section_id = s.id WHERE s.country = ?", (country,)):
        texts += [("policy heading", p["heading"]), ("policy title", p["title"]), ("policy text", p["body"])]
    for s in con.execute("SELECT definition FROM statuses"):
        texts.append(("status definition", s["definition"]))
    return texts


def precheck(con, country: str) -> dict:
    issues.evaluate(con, [country])
    rows, _ = _public_rows(con, country)
    blockers = issues.blockers_by_item(con, country)
    scanner = LeakScanner(con)
    global_hits = [{"where": where, "found": desc} for where, text in _global_texts(con, country) for _, desc, _ in scanner.scan(text)]
    blocked = [{"id": r["id"], "code": r["code"], "name": r["name"], "reasons": blockers[r["id"]]} for r in rows if r["id"] in blockers]
    warn = con.execute(
        "SELECT kind, COUNT(*) n FROM issues WHERE state = 'open' AND severity = 'warning' AND country = ? GROUP BY kind", (country,)).fetchall()
    return {
        "country": country,
        "total": len(rows),
        "exportable": len(rows) - len(blocked),
        "blocked": blocked,
        "global_leaks": global_hits,
        "warnings": [{"kind": w["kind"], "title": issues.KINDS[w["kind"]][0], "count": w["n"]} for w in warn],
    }


def export_catalogue(con, country: str, exclude_blocked: bool = False, folder: Path | None = None) -> dict:
    pc = precheck(con, country)
    if pc["global_leaks"]:
        raise ExportBlocked("Supplier information was found in the cover or policy text. Edit it in Settings before exporting.", pc)
    if pc["blocked"] and not exclude_blocked:
        raise ExportBlocked(f"{len(pc['blocked'])} products need attention before they can be exported.", pc)
    blocked_ids = {b["id"] for b in pc["blocked"]}
    rows, tiers = _public_rows(con, country)
    rows = [r for r in rows if r["id"] not in blocked_ids]
    c = con.execute("SELECT * FROM countries WHERE key = ?", (country,)).fetchone()
    today = date.today()
    wb = build_catalogue(con, c, rows, tiers, today)
    final_gate(con, wb, rows)
    path = _unique_path(folder or config.CUSTOMER_EXPORT_DIR, f"Ravisn_Ltd_{country}_Catalogue_{today.isoformat()}")
    _save(wb, path)
    report = {"excluded": [{"code": b["code"], "reasons": b["reasons"]} for b in pc["blocked"]], "warnings": pc["warnings"]}
    with con:
        con.execute("INSERT INTO exports (at, kind, country, path, rows, excluded, report) VALUES (?, 'customer', ?, ?, ?, ?, ?)",
                    (db.now(), country, str(path), len(rows), len(blocked_ids), json.dumps(report)))
    return {"path": str(path), "file": path.name, "rows": len(rows), "excluded": len(blocked_ids)}


def build_catalogue(con, c, rows, tiers, today: date) -> Workbook:
    key = c["key"]
    s = {k: db.get_setting(con, k) for k in ("company", "whatsapp_display", "whatsapp_link", "email", "email_link", "cover_note", "policy_intro", "footer")}
    s["how_to_order"] = json.loads(c["how_to_order"])
    wb = Workbook()
    wb.properties.creator = s["company"]
    wb.properties.lastModifiedBy = s["company"]
    wb.properties.title = f"{s['company']} {key} Products Catalogue"
    cover = wb.active
    cover.title = "Cover"
    products = wb.create_sheet(f"{key} Products")
    notes = wb.create_sheet("Notes & Policies")
    available = sum(1 for r in rows if r["availability"] == "available")
    _cover(cover, s, c, len(rows), available, today, products.title)
    _products(products, s, c, rows, tiers)
    used = sorted({r["status"] for r in rows}, key=STATUS_NAMES.index)
    _notes(con, notes, s, key, used)
    return wb


def _cover(ws, s, c, total, available, today, products_title):
    ws.sheet_view.showGridLines = False
    for col, w in (("A", 4), ("B", 22), ("C", 26), ("F", 4)):
        ws.column_dimensions[col].width = w
    heights = {1: 36, 2: 49.5, 3: 27.75, 4: 30, 5: 36, 6: 21.75, 7: 30, 8: 33.75, 9: 31.5, 10: 31.5, 11: 31.5, 12: 31.5, 13: 27.75,
               14: 33.75, 15: 49.5, 16: 49.5, 17: 49.5, 18: 33.75, 19: 49.5, 20: 33.75, 21: 27.75, 22: 33.75}
    for r, h in heights.items():
        ws.row_dimensions[r].height = h
    ws["B2"] = s["company"]
    ws["B2"].font = f(36, True)
    ws["B3"] = f"{c['key']} Products Catalogue"
    ws["B3"].font = f(18, color=GREY)
    for cell, value, fmt_ in (("B5", total, "#,##0"), ("C5", available, "#,##0"), ("D5", today, r"d\ mmm\ yyyy")):
        ws[cell] = value
        ws[cell].font = f(26, True)
        ws[cell].alignment = Alignment(horizontal="left", vertical="bottom")
        ws[cell].number_format = fmt_
    ws.merge_cells("D5:E5")
    for cell, label in (("B6", "Products"), ("C6", "Available now"), ("D6", "Updated")):
        ws[cell] = label
        ws[cell].font = f(12, color=GREY)
        ws[cell].alignment = Alignment(horizontal="left", vertical="top")
    ws.merge_cells("D6:E6")

    def heading(row, text):
        ws[f"B{row}"] = text
        ws[f"B{row}"].font = f(17, True)
        ws[f"B{row}"].alignment = Alignment(horizontal="left", vertical="bottom")
        for col in "BCDE":
            ws[f"{col}{row}"].border = DARK

    heading(8, "Contact")
    contact = [("WhatsApp", s["whatsapp_display"], s["whatsapp_link"], BLUE), ("Email", s["email"], s["email_link"], BLUE),
               ("Stock", c["stock_text"], None, INK), ("Currency", c["currency_text"], None, INK)]
    for i, (label, value, link, color) in enumerate(contact):
        r = 9 + i
        ws[f"B{r}"] = label
        ws[f"B{r}"].font = f(12, color=GREY)
        ws[f"B{r}"].alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        ws[f"C{r}"] = value
        ws[f"C{r}"].font = f(13, color=color)
        ws[f"C{r}"].alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        if link:
            ws[f"C{r}"].hyperlink = link
        ws.merge_cells(f"C{r}:E{r}")
        for col in "BCDE":
            ws[f"{col}{r}"].border = LIGHT
    heading(14, "How to order")
    for i, step in enumerate(s["how_to_order"]):
        r = 15 + i
        ws[f"B{r}"] = i + 1
        ws[f"B{r}"].font = f(13, True, BLUE)
        ws[f"B{r}"].alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        ws[f"C{r}"] = step.replace("{sheet}", products_title)
        ws[f"C{r}"].font = f(13)
        ws[f"C{r}"].alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        ws.merge_cells(f"C{r}:E{r}")
        for col in "BCDE":
            ws[f"{col}{r}"].border = LIGHT
    ws["B22"] = s["cover_note"]
    ws["B22"].font = f(12, color=BLUE)
    ws["B22"].alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
    ws["B22"].hyperlink = "#'Notes & Policies'!A1"
    ws.merge_cells("B22:E22")
    _page(ws, "portrait")


def _page(ws, orientation):
    ws.page_setup.orientation = orientation
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.print_options.horizontalCentered = True


def _row_height(lines: int) -> float:
    return {1: 30, 2: 45.75, 3: 61.5, 4: 78}.get(lines, 78 + 16.5 * (lines - 4))


def _products(ws, s, c, rows, tiers):
    key = c["key"]
    has_more = any(r["more_link"] for r in rows)
    headers = ["Code", "Product", "Category", "Price", "Status", "Qty", "Listing"] + (["More links"] if has_more else [])
    last_col = "H" if has_more else "G"
    ws.sheet_view.showGridLines = False
    for col, w in zip("ABCDEFGH", (13, 70, 18, 16, 26, 11, 18, 18)):
        if col <= last_col:
            ws.column_dimensions[col].width = w
    ws.row_dimensions[1].height = 39.75
    ws.row_dimensions[2].height = 21.75
    ws.row_dimensions[3].height = 13.5
    ws.row_dimensions[4].height = 30
    ws["A1"] = f"{key} Products"
    ws["A1"].font = f(22, True)
    ws["A1"].alignment = Alignment(horizontal="left", vertical="bottom", indent=1)
    ws["A2"] = f"{len(rows):,} products  ·  Prices in {c['currency']}  ·  Order by code on WhatsApp {s['whatsapp_display']}"
    ws["A2"].font = f(12, color=GREY)
    ws["A2"].alignment = Alignment(horizontal="left", vertical="center", indent=1)
    for i, h in enumerate(headers):
        cell = ws.cell(4, i + 1, h)
        cell.font = f(11, True, GREY)
        cell.fill = HEADER_FILL
        cell.border = HEADER_LINE
        cell.alignment = Alignment(horizontal="right" if h in ("Price", "Qty") else "left", vertical="center", indent=1)
    price_fmt = EXCEL_PRICE_FORMAT[key]
    left = Alignment(horizontal="left", vertical="center", indent=1)
    left_wrap = Alignment(horizontal="left", vertical="center", indent=1, wrap_text=True)
    right = Alignment(horizontal="right", vertical="center", indent=1)
    right_wrap = Alignment(horizontal="right", vertical="center", indent=1, wrap_text=True)
    for n, r in enumerate(rows):
        row = 5 + n
        product = r["name"] if not r["variant"] else f"{r['name']}, {r['variant']}"
        t = tiers.get(r["id"])
        values = [r["code"], product, r["category"], None, r["status"], r["qty"], r["link_label"] or ("View listing" if r["link"] else None)]
        if has_more:
            values.append(r["more_link_label"] if r["more_link"] else None)
        for i, v in enumerate(values):
            ws.cell(row, i + 1, v)
        a, b, cc, d, e, q, g = (ws.cell(row, i) for i in range(1, 8))
        a.font, a.alignment = f(12, True), left
        b.font, b.alignment = f(12), left_wrap
        cc.font, cc.alignment = f(12, color=GREY), left
        if t:
            d.value = "\n".join(f"{label}  {fmt(p, c['symbol'])}" for label, p in t)
        else:
            d.value = None if r["price_minor"] is None else r["price_minor"] / 100
            d.number_format = price_fmt
        d.font, d.alignment = f(12), right_wrap
        e.font, e.alignment = f(12, color=GREY), left
        q.font, q.alignment = f(12), right
        q.number_format = "#,##0\\+" if r["qty_basis"] == "minimum" else "#,##0"
        g.font, g.alignment = f(12, color=BLUE), left
        if r["link"]:
            g.hyperlink = links.clean(r["link"])
        cells = [a, b, cc, d, e, q, g]
        if has_more:
            h = ws.cell(row, 8)
            h.font, h.alignment = f(12, color=BLUE), left
            if r["more_link"]:
                h.hyperlink = links.clean(r["more_link"])
            cells.append(h)
        for cell in cells:
            cell.border = LIGHT
        ws.row_dimensions[row].height = _row_height(max(_lines(product, 64), len(t) if t else 1))
    last_row = 4 + len(rows)
    if rows:
        table = Table(displayName=f"{key}_Products", ref=f"A4:{last_col}{last_row}")
        ws.add_table(table)
        st = f"E5:E{last_row}"
        ws.conditional_formatting.add(st, FormulaRule(formula=['$E5="Out of stock"'], font=Font(color=RED, bold=True)))
        ws.conditional_formatting.add(st, FormulaRule(formula=['OR($E5="Available on demand",$E5="Available in 10 days",$E5="In transit")'], font=Font(color=ORANGE, bold=True)))
        ws.conditional_formatting.add(st, FormulaRule(formula=['OR($E5="Available",$E5="Available with label",$E5="Available without label",$E5="Available in bulk",$E5="Bulk only")'], font=Font(color=GREEN, bold=True)))
        ws.conditional_formatting.add(f"A5:F{last_row}", FormulaRule(formula=['$E5="Out of stock"'], font=Font(color=TERTIARY)))
        ws.conditional_formatting.add(f"F5:F{last_row}", FormulaRule(formula=["$F5=0"], font=Font(color=TERTIARY)))
        dv = DataValidation(type="list", formula1='"' + ",".join(STATUS_NAMES) + '"', allow_blank=False, showErrorMessage=True, error="Pick a status from the list.")
        dv.add(st)
        ws.add_data_validation(dv)
    ws.freeze_panes = "B5"
    ws.print_title_rows = "4:4"
    _page(ws, "landscape")


def _notes(con, ws, s, key, used_statuses):
    ws.sheet_view.showGridLines = False
    for col, w in (("A", 4), ("B", 32), ("C", 92), ("D", 4)):
        ws.column_dimensions[col].width = w
    ws.row_dimensions[1].height = 21.75
    ws.row_dimensions[2].height = 19.5
    ws.row_dimensions[3].height = 43.5
    ws.row_dimensions[4].height = 39.75
    ws["B2"] = s["company"]
    ws["B2"].font = f(12, True, GREY)
    ws["B3"] = "Notes & Policies"
    ws["B3"].font = f(28, True)
    ws["B4"] = s["policy_intro"]
    ws["B4"].font = f(13, color=GREY)
    ws["B4"].alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
    ws.merge_cells("B4:C4")
    defs = {r["name"]: r["definition"] for r in con.execute("SELECT name, definition FROM statuses")}
    row = 5
    ws.row_dimensions[row].height = 21.75

    def heading(r, text):
        ws[f"B{r}"] = text
        ws[f"B{r}"].font = f(17, True)
        ws[f"B{r}"].alignment = Alignment(horizontal="left", vertical="bottom")
        ws[f"B{r}"].border = DARK
        ws[f"C{r}"].border = DARK
        ws.row_dimensions[r].height = 33.75

    sections = con.execute("SELECT id, heading FROM policy_sections WHERE country = ? ORDER BY sort", (key,)).fetchall()
    for sec in sections:
        row += 1
        heading(row, sec["heading"])
        for it in con.execute("SELECT title, body, generated FROM policy_items WHERE section_id = ? ORDER BY sort", (sec["id"],)):
            row += 1
            body = status_meanings_text(defs, used_statuses) if it["generated"] == "status_meanings" else it["body"]
            ws[f"B{row}"] = it["title"]
            ws[f"B{row}"].font = f(12, True)
            ws[f"C{row}"] = body
            ws[f"C{row}"].font = f(12)
            for col in "BC":
                ws[f"{col}{row}"].alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
                ws[f"{col}{row}"].border = LIGHT
            ws.row_dimensions[row].height = max(33.75, 16.5 * (_lines(body, 95) + 1))
        row += 1
        ws.row_dimensions[row].height = 21.75
    footer = f"{s['company']}  ·  WhatsApp {s['whatsapp_display']}  ·  {s['email']}"
    row += 1
    heading(row, footer)
    row += 1
    ws.row_dimensions[row].height = 27.75
    row += 1
    ws[f"B{row}"] = footer
    ws[f"B{row}"].font = f(11, color=TERTIARY)
    ws.merge_cells(f"B{row}:C{row}")
    ws.row_dimensions[row].height = 15
    _page(ws, "portrait")


def final_gate(con, wb: Workbook, rows) -> None:
    """Last check on the finished workbook: no supplier information in any cell or link."""
    scanner = LeakScanner(con)
    allowed = allowances(con)
    own_links = {db.get_setting(con, "whatsapp_link"), db.get_setting(con, "email_link")}
    by_row = {5 + n: r["id"] for n, r in enumerate(rows)}
    problems = []
    for ws in wb.worksheets:
        is_products = ws.title.endswith(" Products")
        for row in ws.iter_rows():
            for cell in row:
                texts = []
                if isinstance(cell.value, str):
                    texts.append(cell.value)
                if cell.hyperlink is not None and cell.hyperlink.target:
                    target = cell.hyperlink.target
                    texts.append(target)
                    private_host = any(k == "link_private_host" for k, _ in links.findings(target, None, ""))
                    if (private_host or target.startswith(("mailto:", "tel:"))) and target not in own_links:
                        problems.append(f"{ws.title}!{cell.coordinate}: link to a private page")
                for text in texts:
                    for kind, desc, h in scanner.scan(text):
                        item_id = by_row.get(cell.row) if is_products else None
                        if item_id and any((item_id, fld, h) in allowed for fld in ("name", "variant", "category", "link", "more_link")):
                            continue
                        problems.append(f"{ws.title}!{cell.coordinate}: {desc}")
    if problems:
        raise ExportBlocked("Export stopped: supplier information was found in the finished file (" + "; ".join(problems[:5]) + ")")


# ---------------------------------------------------------------- private files

PRIVATE_BANNER = "PRIVATE  ·  Ravisn Ltd only  ·  Do not share"


def _private_header(ws, title, headers, widths):
    ws["A1"] = PRIVATE_BANNER
    ws["A1"].font = Font(name=FONT, size=11, bold=True, color=RED)
    ws["A2"] = title
    ws["A2"].font = Font(name=FONT, size=18, bold=True, color=INK)
    for i, (h, w) in enumerate(zip(headers, widths), start=1):
        cell = ws.cell(4, i, h)
        cell.font = Font(name=FONT, size=11, bold=True, color=GREY)
        cell.fill = HEADER_FILL
        cell.border = HEADER_LINE
        ws.column_dimensions[cell.column_letter].width = w
    ws.freeze_panes = "B5"
    ws.sheet_view.showGridLines = False


def export_private_master(con) -> dict:
    wb = Workbook()
    wb.properties.creator = "Ravisn Ltd"
    first = True
    total = 0
    headers = ["Code", "Product", "Variant", "Category", "Status", "Qty", "Qty basis", "Price", "Price mode", "Supplier", "Supplier phone",
               "Cost", "Margin", "Markup", "Item ID", "Supplier SKU", "Source tab", "Source row", "Customer link", "Supplier listing", "Archived"]
    widths = [11, 60, 16, 16, 22, 8, 11, 14, 11, 20, 18, 12, 10, 9, 16, 16, 16, 10, 40, 40, 9]
    for c in con.execute("SELECT * FROM countries ORDER BY sort").fetchall():
        ws = wb.active if first else wb.create_sheet()
        first = False
        ws.title = c["key"]
        _private_header(ws, f"{c['key']} supplier mapping", headers, widths)
        rows = con.execute(
            """SELECT i.*, o.cost_minor, o.item_ref, o.supplier_sku, o.source_tab, o.source_row, o.source_link, s.name AS supplier, s.phone
               FROM items i JOIN offers o ON o.item_id = i.id LEFT JOIN suppliers s ON s.id = o.supplier_id WHERE i.country = ? ORDER BY i.seq""",
            (c["key"],)).fetchall()
        tiers = service.tiers_by_item(con, [r["id"] for r in rows])
        for n, r in enumerate(rows):
            t = tiers.get(r["id"], {"price": [], "cost": []})
            price = "\n".join(f"{x['label']}  {fmt(x['price_minor'], c['symbol'])}" for x in t["price"]) or (None if r["price_minor"] is None else r["price_minor"] / 100)
            cost = "\n".join(f"{x['label']}  {fmt(x['cost_minor'], c['symbol'])}" for x in t["cost"]) or (None if r["cost_minor"] is None else r["cost_minor"] / 100)
            margin = markup = None
            if r["cost_minor"] is not None and r["price_minor"] is not None:
                margin = (r["price_minor"] - r["cost_minor"]) / 100
                markup = (r["price_minor"] - r["cost_minor"]) / r["cost_minor"] if r["cost_minor"] else None
            values = [r["code"], r["name"], r["variant"], r["category"], r["status"], r["qty"], r["qty_basis"], price, r["price_mode"], r["supplier"],
                      r["phone"], cost, margin, markup, r["item_ref"], r["supplier_sku"], r["source_tab"], r["source_row"], r["link"], r["source_link"],
                      "yes" if r["archived"] else ""]
            for i, v in enumerate(values, start=1):
                cell = ws.cell(5 + n, i, v)
                cell.font = Font(name=FONT, size=11, color=INK)
                if i in (8, 12, 13) and isinstance(v, float):
                    cell.number_format = EXCEL_PRICE_FORMAT[c["key"]]
                if i == 14 and v is not None:
                    cell.number_format = "0.0%"
            total += 1
    ws = wb.create_sheet("Suppliers")
    sh = ["Supplier", "Phone", "WhatsApp link", "Other numbers", "Email", "WhatsApp groups", "Shown in their sheet", "Note", "Verified"]
    _private_header(ws, "Suppliers", sh, [24, 18, 30, 22, 30, 22, 18, 40, 14])
    for n, s in enumerate(con.execute("SELECT * FROM suppliers ORDER BY name")):
        for i, v in enumerate([s["name"], s["phone"], s["whatsapp_link"], s["other_numbers"], s["emails"], s["whatsapp_groups"], s["shown_in_sheet"], s["note"], s["verified_at"]], start=1):
            ws.cell(5 + n, i, v).font = Font(name=FONT, size=11, color=INK)
    path = _unique_path(config.PRIVATE_EXPORT_DIR, f"PRIVATE_Ravisn_Supplier_Master_{date.today().isoformat()}")
    _save(wb, path)
    with con:
        con.execute("INSERT INTO exports (at, kind, country, path, rows, excluded, report) VALUES (?, 'private_master', NULL, ?, ?, 0, '{}')", (db.now(), str(path), total))
    return {"path": str(path), "file": path.name, "rows": total}


UPDATE_HEADERS = ["Code", "Product", "Status", "Qty", "Qty basis", "Cost", "Price override", "Current price", "Price mode"]


def export_stock_sheet(con, country: str) -> dict:
    c = con.execute("SELECT * FROM countries WHERE key = ?", (country,)).fetchone()
    wb = Workbook()
    wb.properties.creator = "Ravisn Ltd"
    ws = wb.active
    ws.title = "Update"
    _private_header(ws, f"{country} stock and price update", UPDATE_HEADERS, [11, 60, 24, 9, 12, 12, 14, 14, 11])
    ws["A3"] = ("Change Status, Qty, Qty basis (reported, minimum or confirmed), Cost or Price override, then import this file in Ravisn. "
                "Blank cells leave values unchanged. Prices follow the pricing rule when the cost changes, unless you enter an override.")
    ws["A3"].font = Font(name=FONT, size=11, color=GREY)
    rows = con.execute("SELECT i.*, o.cost_minor FROM items i JOIN offers o ON o.item_id = i.id WHERE i.country = ? AND i.archived = 0 ORDER BY i.seq", (country,)).fetchall()
    tiers = service.tiers_by_item(con, [r["id"] for r in rows])
    for n, r in enumerate(rows):
        t = tiers.get(r["id"], {"price": []})
        current = "\n".join(f"{x['label']}  {fmt(x['price_minor'], c['symbol'])}" for x in t["price"]) or (None if r["price_minor"] is None else r["price_minor"] / 100)
        values = [r["code"], r["name"], r["status"], r["qty"], r["qty_basis"], None if r["cost_minor"] is None else r["cost_minor"] / 100, None, current, r["price_mode"]]
        for i, v in enumerate(values, start=1):
            cell = ws.cell(5 + n, i, v)
            cell.font = Font(name=FONT, size=11, color=INK if i in (3, 4, 5, 6, 7) else GREY)
            if i in (6, 7, 8) and not isinstance(v, str):
                cell.number_format = EXCEL_PRICE_FORMAT[country]
    last = 4 + len(rows)
    if rows:
        dv = DataValidation(type="list", formula1='"' + ",".join(STATUS_NAMES) + '"', allow_blank=True)
        dv.add(f"C5:C{last}")
        ws.add_data_validation(dv)
        dv2 = DataValidation(type="list", formula1='"reported,minimum,confirmed"', allow_blank=True)
        dv2.add(f"E5:E{last}")
        ws.add_data_validation(dv2)
    path = _unique_path(config.PRIVATE_EXPORT_DIR, f"PRIVATE_Stock_and_price_update_{country}_{date.today().isoformat()}")
    _save(wb, path)
    with con:
        con.execute("INSERT INTO exports (at, kind, country, path, rows, excluded, report) VALUES (?, 'stock_sheet', ?, ?, ?, 0, '{}')", (db.now(), country, str(path), len(rows)))
    return {"path": str(path), "file": path.name, "rows": len(rows)}


def read_stock_sheet(con, path: Path) -> dict:
    """Compare an edited update sheet with the database. Nothing is changed here."""
    wb = load_workbook(path, data_only=True)
    if "Update" not in wb.sheetnames:
        raise ValueError("This is not a Ravisn stock and price update sheet")
    ws = wb["Update"]
    if [ws.cell(4, i).value for i in range(1, len(UPDATE_HEADERS) + 1)] != UPDATE_HEADERS:
        raise ValueError("The column headings have been changed, so the sheet cannot be read safely")
    changes, errors, unknown = [], [], []
    for r in range(5, ws.max_row + 1):
        code = ws.cell(r, 1).value
        if not code:
            continue
        item = con.execute("SELECT i.*, o.cost_minor FROM items i JOIN offers o ON o.item_id = i.id WHERE i.code = ?", (str(code).strip(),)).fetchone()
        if item is None:
            unknown.append(str(code))
            continue
        patch = {}
        status, qty, basis, cost, override = (ws.cell(r, i).value for i in (3, 4, 5, 6, 7))
        try:
            if status not in (None, "") and status != item["status"]:
                if status not in STATUS_NAMES:
                    raise ValueError(f"unknown status “{status}”")
                patch["status"] = status
            if qty not in (None, ""):
                q = service._int(qty, "Qty")
                if q != item["qty"]:
                    patch["qty"] = q
            if basis not in (None, "") and basis != item["qty_basis"]:
                if basis not in QTY_BASIS:
                    raise ValueError("Qty basis must be reported, minimum or confirmed")
                patch["qty_basis"] = basis
            if cost not in (None, ""):
                cm = to_minor(cost)
                if cm != item["cost_minor"]:
                    patch["cost_minor"] = cm
            if override not in (None, ""):
                pm = to_minor(override)
                if pm != item["price_minor"] or item["price_mode"] != "override":
                    patch.update(price_mode="override", price_minor=pm, price_note="Set in the stock and price update sheet")
        except (ValueError, service.ValidationError) as exc:
            errors.append({"row": r, "code": item["code"], "message": str(exc)})
            continue
        if patch:
            changes.append({"item_id": item["id"], "code": item["code"], "name": item["name"], "patch": patch,
                            "before": {k: item[k] if k != "cost_minor" else item["cost_minor"] for k in patch if k in item.keys()}})
    return {"changes": changes, "errors": errors, "unknown_codes": unknown}


def apply_stock_sheet(con, path: Path) -> dict:
    preview = read_stock_sheet(con, path)
    if preview["errors"]:
        raise ValueError("Fix the errors in the sheet before applying it")
    applied, failed = 0, []
    countries = set()
    for ch in preview["changes"]:
        try:
            if service.update_item(con, ch["item_id"], ch["patch"], f"Stock and price update sheet {path.name}", evaluate=False):
                applied += 1
        except service.ValidationError as exc:
            failed.append({"code": ch["code"], "message": str(exc)})
        countries.add(con.execute("SELECT country FROM items WHERE id = ?", (ch["item_id"],)).fetchone()[0])
    if countries:
        issues.evaluate(con, sorted(countries))
    return {"applied": applied, "failed": failed}
