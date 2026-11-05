import re

import pytest
from openpyxl import load_workbook

from ravisn import config, exporter, links, service
from ravisn.importer import parse_tiers
from ravisn.money import to_minor

COUNTRIES = ["UK", "USA", "Canada", "Germany", "Australia"]


def _supplier_tokens(con):
    names = [r[0].strip().lower() for r in con.execute("SELECT name FROM suppliers") if len(r[0].strip()) >= 4]
    phones = set()
    for (p,) in con.execute("SELECT coalesce(phone, '') || ' ' || coalesce(other_numbers, '') || ' ' || coalesce(whatsapp_link, '') FROM suppliers"):
        for run in re.findall(r"\d[\d\s().\-]{6,}\d", p):
            d = re.sub(r"\D", "", run)
            if len(d) >= 8:
                phones.add(d[-8:])
    emails = {e.lower() for (x,) in con.execute("SELECT coalesce(emails, '') FROM suppliers") for e in re.findall(r"\S+@\S+", x)}
    return names, phones, emails


def _all_text(wb):
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for cell in row:
                if isinstance(cell.value, str):
                    yield ws.title, cell, cell.value
                if cell.hyperlink is not None and cell.hyperlink.target:
                    yield ws.title, cell, cell.hyperlink.target


@pytest.mark.parametrize("country", COUNTRIES)
def test_customer_export_matches_original_and_has_no_private_data(con, country):
    result = exporter.export_catalogue(con, country, exclude_blocked=True)
    wb = load_workbook(result["path"])
    assert wb.sheetnames == ["Cover", f"{country} Products", "Notes & Policies"]
    ws = wb[f"{country} Products"]

    # Compare every exported product with the original customer catalogue.
    orig = load_workbook(config.DEFAULT_SOURCE_DIR / config.SOURCE_FILES[country])[f"{country} Products"]
    original = {}
    for r in range(5, orig.max_row + 1):
        code = orig.cell(r, 1).value
        if code:
            original[code] = r
    blocked = {b["code"] for b in exporter.precheck(con, country)["blocked"]}
    exported = 0
    for r in range(5, ws.max_row + 1):
        code = ws.cell(r, 1).value
        if not code:
            continue
        exported += 1
        o = original[code]
        assert ws.cell(r, 2).value == orig.cell(o, 2).value
        assert ws.cell(r, 3).value == orig.cell(o, 3).value
        ov, ev = orig.cell(o, 4).value, ws.cell(r, 4).value
        if isinstance(ov, str):
            assert parse_tiers(ev) == parse_tiers(ov)
        else:
            assert to_minor(ev) == to_minor(ov)
        assert ws.cell(r, 5).value == orig.cell(o, 5).value
        assert ws.cell(r, 6).value == orig.cell(o, 6).value
        assert ("+" in ws.cell(r, 6).number_format) == ("+" in orig.cell(o, 6).number_format)
        # Exported links are the originals with tracking and seller parameters removed.
        assert ws.cell(r, 7).hyperlink.target == links.clean(orig.cell(o, 7).hyperlink.target)
        assert links.normalise(ws.cell(r, 7).hyperlink.target).split("/ref=")[0] == links.normalise(orig.cell(o, 7).hyperlink.target).split("/ref=")[0]
        assert code not in blocked
    assert exported == len(original) - len(blocked) == result["rows"]

    names, phones, emails = _supplier_tokens(con)
    allowed = {r["item_id"] for r in con.execute("SELECT item_id FROM leak_allowances")}
    assert not allowed
    for sheet, cell, text in _all_text(wb):
        low = text.lower()
        for n in names:
            assert not re.search(r"(?<![a-z0-9])" + re.escape(n) + r"(?![a-z0-9])", low), f"supplier name in {sheet}!{cell.coordinate}"
        digits = re.sub(r"\D", "", text)
        for p in phones:
            assert p not in digits or len(digits) > 40, f"supplier phone in {sheet}!{cell.coordinate}"
        for e in emails:
            assert e not in low


def test_export_refuses_blocked_items_unless_excluded(con):
    pc = exporter.precheck(con, "UK")
    assert pc["blocked"], "the UK catalogue has products that need attention"
    with pytest.raises(exporter.ExportBlocked):
        exporter.export_catalogue(con, "UK")


def test_planted_supplier_name_is_excluded(con):
    supplier = con.execute("SELECT name FROM suppliers WHERE length(name) >= 4 LIMIT 1").fetchone()[0]
    item_id = con.execute("SELECT id FROM items WHERE country = 'Germany' ORDER BY seq LIMIT 1").fetchone()[0]
    service.update_item(con, item_id, {"name": f"Test product from {supplier}"})
    pc = exporter.precheck(con, "Germany")
    assert item_id in {b["id"] for b in pc["blocked"]}
    result = exporter.export_catalogue(con, "Germany", exclude_blocked=True)
    wb = load_workbook(result["path"])
    for _, _, text in _all_text(wb):
        assert supplier.lower() not in text.lower()


def test_final_gate_stops_supplier_name_in_settings(con):
    supplier = con.execute("SELECT name FROM suppliers WHERE length(name) >= 4 LIMIT 1").fetchone()[0]
    from ravisn import db
    db.set_setting(con, "cover_note", f"Ask {supplier} for details")
    con.commit()
    with pytest.raises(exporter.ExportBlocked):
        exporter.export_catalogue(con, "Canada", exclude_blocked=True)
    assert not list(config.CUSTOMER_EXPORT_DIR.glob("*Canada*"))


def test_final_gate_checks_built_workbook(con):
    rows, tiers = exporter._public_rows(con, "Canada")
    c = con.execute("SELECT * FROM countries WHERE key = 'Canada'").fetchone()
    import datetime
    wb = exporter.build_catalogue(con, c, rows, tiers, datetime.date.today())
    supplier = con.execute("SELECT name FROM suppliers WHERE length(name) >= 4 LIMIT 1").fetchone()[0]
    wb["Canada Products"]["B5"] = f"Leaked {supplier}"
    with pytest.raises(exporter.ExportBlocked):
        exporter.final_gate(con, wb, rows)


def test_stock_sheet_round_trip(con):
    out = exporter.export_stock_sheet(con, "Canada")
    wb = load_workbook(out["path"])
    ws = wb["Update"]
    code = ws["A5"].value
    ws["D5"] = 7
    ws["E5"] = "confirmed"
    wb.save(out["path"])
    preview = exporter.read_stock_sheet(con, config.PRIVATE_EXPORT_DIR / out["file"])
    assert [c["code"] for c in preview["changes"]] == [code]
    assert preview["changes"][0]["patch"] == {"qty": 7, "qty_basis": "confirmed"}
    exporter.apply_stock_sheet(con, config.PRIVATE_EXPORT_DIR / out["file"])
    row = con.execute("SELECT qty, qty_basis, qty_confirmed_at FROM items WHERE code = ?", (code,)).fetchone()
    assert row["qty"] == 7 and row["qty_basis"] == "confirmed" and row["qty_confirmed_at"]


def test_private_master_export(con):
    out = exporter.export_private_master(con)
    assert out["rows"] == 10547
    assert out["file"].startswith("PRIVATE_")
