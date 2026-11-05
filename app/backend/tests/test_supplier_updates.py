"""Supplier stock updates (preview, stable-identifier matching, flagged removals, rule pricing, never renumbering) and
supplier fulfilment facts (private, verified before anything is shown to customers)."""

import io
import json

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from ravisn import config, fulfilment, publishing, service, stock_updates
from ravisn.api import create_app
from ravisn.money import rule_price


def _pick(con, n=4):
    """A supplier with USA products carrying SKUs and item references, and some of its rule-priced products."""
    sid = con.execute("""SELECT o.supplier_id FROM offers o JOIN items i ON i.id = o.item_id
                         WHERE i.country = 'USA' AND o.supplier_sku IS NOT NULL AND o.supplier_id IS NOT NULL
                         GROUP BY o.supplier_id ORDER BY COUNT(*) DESC LIMIT 1""").fetchone()[0]
    rows = con.execute("""SELECT i.id, i.code, i.ref, i.qty, i.status, i.price_minor, i.price_mode, o.cost_minor, o.supplier_sku, o.item_ref
                          FROM items i JOIN offers o ON o.item_id = i.id
                          WHERE o.supplier_id = ? AND i.country = 'USA' AND i.archived = 0 AND i.price_mode = 'rule'
                            AND o.cost_minor IS NOT NULL AND o.supplier_sku IS NOT NULL AND o.item_ref IS NOT NULL
                            AND NOT EXISTS (SELECT 1 FROM offer_cost_tiers t WHERE t.offer_id = o.id)
                            AND (SELECT COUNT(*) FROM offers o2 JOIN items i2 ON i2.id = o2.item_id WHERE o2.supplier_id = o.supplier_id
                                 AND i2.country = 'USA' AND (upper(o2.supplier_sku) = upper(o.supplier_sku) OR upper(o2.item_ref) = upper(o.item_ref))) = 1
                          ORDER BY i.id LIMIT ?""", (sid, n)).fetchall()
    assert len(rows) == n
    return sid, rows


def _csv(lines):
    return ("\n".join(",".join(f'"{c}"' for c in r) for r in lines)).encode()


def test_preview_matches_by_identifiers_and_flags_removed(con):
    sid, (a, b, c, d) = _pick(con)
    total = con.execute("SELECT COUNT(*) FROM offers o JOIN items i ON i.id = o.item_id WHERE o.supplier_id = ? AND i.country = 'USA' AND i.archived = 0", (sid,)).fetchone()[0]
    new_cost = (a["cost_minor"] or 0) + 137
    data = _csv([
        ["Supplier SKU", "ASIN", "Product name", "Stock", "Unit price"],
        [a["supplier_sku"], "", "Renamed by supplier", "41", f"{new_cost / 100:.2f}"],   # by SKU: qty and cost change
        ["", b["item_ref"], "", "0", ""],                                              # by item reference: sold out
        [c["supplier_sku"].lower(), "", "", str(c["qty"] or 0), f"{c['cost_minor'] / 100:.2f}"],  # unchanged (case-insensitive SKU)
        [c["supplier_sku"], "", "", "5", ""],                                          # same product twice
        ["NEW-SKU-778899", "", "Brand new kettle 1.7L", "12", "9.99"],                 # new product to review
        ["", "", "No identifier here", "3", "1.00"],                                    # cannot be matched
    ])
    u = stock_updates.preview(con, sid, "USA", data, "stock.csv")
    by = {r["row"]: r for r in u["rows"]}
    assert by[2]["state"] == "matched" and by[2]["item_id"] == a["id"]
    assert by[2]["changes"]["cost_minor"] == [a["cost_minor"], new_cost] and by[2]["changes"]["qty"][1] == 41
    m = con.execute("SELECT markup_bp, min_margin_minor FROM countries WHERE key = 'USA'").fetchone()
    assert by[2]["price"] == {"mode": "rule", "old": a["price_minor"], "rule": rule_price(new_cost, m[0], m[1]), "action": "recalculated"}
    assert by[3]["state"] == "matched" and by[3]["changes"]["status"][1] == "Out of stock"
    assert by[4]["state"] in ("unchanged", "matched") and by[4]["item_id"] == c["id"]
    assert by[5]["state"] == "duplicate"
    assert by[6]["state"] == "new" and by[6]["price"]["rule"] == rule_price(999, m[0], m[1])
    assert by[7]["state"] == "invalid"
    assert u["summary"]["removed"] == total - 3 and d["id"] in {x["item_id"] for x in u["removed"]}
    # A preview changes nothing.
    assert con.execute("SELECT qty FROM items WHERE id = ?", (a["id"],)).fetchone()[0] == a["qty"]
    assert u["status"] == "preview"


def test_apply_updates_creates_reviewed_products_and_never_renumbers(con):
    sid, (a, b, c, d) = _pick(con)
    refs_before = dict(con.execute("SELECT id, ref FROM items").fetchall())
    count_before = len(refs_before)
    override = con.execute("""SELECT i.id, i.price_minor, o.supplier_sku FROM items i JOIN offers o ON o.item_id = i.id
                              WHERE o.supplier_id = ? AND i.country = 'USA' AND o.supplier_sku IS NOT NULL AND i.id NOT IN (?, ?, ?, ?)
                              AND NOT EXISTS (SELECT 1 FROM offer_cost_tiers t WHERE t.offer_id = o.id) LIMIT 1""", (sid, a["id"], b["id"], c["id"], d["id"])).fetchone()
    service.update_item(con, override["id"], {"price_mode": "override", "price_minor": 4321, "price_note": "agreed bulk rate"})
    dup = con.execute("SELECT COUNT(*) FROM offers o JOIN items i ON i.id = o.item_id WHERE o.supplier_id = ? AND i.country = 'USA' AND upper(o.supplier_sku) = upper(?)",
                      (sid, override["supplier_sku"])).fetchone()[0]
    new_cost = (a["cost_minor"] or 0) + 250
    data = _csv([
        ["SKU", "Name", "Qty", "Cost"],
        [a["supplier_sku"], "", "7", f"{new_cost / 100:.2f}"],
        [b["supplier_sku"], "", "0", ""],
        [override["supplier_sku"], "", "3", "1.23"],
        ["NEW-SKU-445566", "Ceramic mug set of 4", "20", "6.50"],
        ["NEW-SKU-NOCOST", "Mystery item", "2", ""],
    ])
    u = stock_updates.preview(con, sid, "USA", data, "stock.csv")
    new_row = next(r["row"] for r in u["rows"] if r["sku"] == "NEW-SKU-445566")
    no_cost = next(r["row"] for r in u["rows"] if r["sku"] == "NEW-SKU-NOCOST")
    res = stock_updates.apply(con, u["id"], {"create": [new_row, no_cost], "category": "Home & Kitchen", "removed": "flag"})
    assert res["status"] == "applied"
    r = res["result"]
    assert (config.BACKUP_DIR / r["backup"]).exists()
    m = con.execute("SELECT markup_bp, min_margin_minor FROM countries WHERE key = 'USA'").fetchone()
    got = con.execute("SELECT i.qty, i.price_minor, o.cost_minor FROM items i JOIN offers o ON o.item_id = i.id WHERE i.id = ?", (a["id"],)).fetchone()
    assert (got["qty"], got["cost_minor"], got["price_minor"]) == (7, new_cost, rule_price(new_cost, m[0], m[1]))
    assert con.execute("SELECT status FROM items WHERE id = ?", (b["id"],)).fetchone()[0] == "Out of stock"
    if dup == 1:
        kept = con.execute("SELECT i.price_minor, o.cost_minor FROM items i JOIN offers o ON o.item_id = i.id WHERE i.id = ?", (override["id"],)).fetchone()
        assert kept["price_minor"] == 4321 and kept["cost_minor"] == 123  # cost updated, hand-set price kept
    # Exactly one reviewed product was created, with a fresh permanent reference; nothing was renumbered or deleted.
    assert len(r["created"]) == 1 and r["created"][0]["ref"].startswith("RVN-US-") and r["created"][0]["ref"] not in refs_before.values()
    assert any(s["code"] == "NEW-SKU-NOCOST" for s in r["skipped"])
    refs_after = dict(con.execute("SELECT id, ref FROM items").fetchall())
    assert len(refs_after) == count_before + 1
    assert all(refs_after[i] == ref for i, ref in refs_before.items())
    new = con.execute("SELECT i.status, i.qty, i.price_minor, i.price_mode, o.supplier_id, o.supplier_sku FROM items i JOIN offers o ON o.item_id = i.id WHERE i.id = ?",
                      (r["created"][0]["item_id"],)).fetchone()
    assert (new["status"], new["qty"], new["price_mode"], new["supplier_id"], new["supplier_sku"]) == ("Available", 20, "rule", sid, "NEW-SKU-445566")
    assert new["price_minor"] == rule_price(650, m[0], m[1])
    # Products missing from the list are flagged in their history, never deleted or silently changed.
    assert r["flagged"] == u["summary"]["removed"] > 0
    assert con.execute("SELECT archived, status FROM items WHERE id = ?", (d["id"],)).fetchone()[:] == (0, d["status"])
    assert con.execute("SELECT COUNT(*) FROM audit WHERE entity = 'item' AND entity_id = ? AND action = 'stock_flag'", (d["id"],)).fetchone()[0] == 1
    with pytest.raises(service.ValidationError):
        stock_updates.apply(con, u["id"], {})


def test_changes_after_the_preview_are_not_overwritten(con):
    sid, (a, b, c, d) = _pick(con)
    u = stock_updates.preview(con, sid, "USA", _csv([["SKU", "Qty"], [a["supplier_sku"], "99"], [b["supplier_sku"], "98"]]), "s.csv")
    service.update_item(con, a["id"], {"qty": 3})
    res = stock_updates.apply(con, u["id"], {"removed": "out_of_stock"})["result"]
    assert con.execute("SELECT qty FROM items WHERE id = ?", (a["id"],)).fetchone()[0] == 3
    assert con.execute("SELECT qty FROM items WHERE id = ?", (b["id"],)).fetchone()[0] == 98
    assert [s["reason"] for s in res["skipped"] if s["row"] == 2] == ["Changed since the preview"]
    assert con.execute("SELECT status FROM items WHERE id = ?", (d["id"],)).fetchone()[0] == "Out of stock"


def test_excel_with_title_rows_and_ravisn_references(con):
    sid, (a, b, c, d) = _pick(con)
    wb = Workbook()
    ws = wb.active
    ws.append(["Weekly stock list"])
    ws.append([])
    ws.append(["Ravisn ref", "Description", "Available qty"])
    ws.append([a["ref"], "x", 12])
    ws.append([b["code"], "y", 0.0])
    buf = io.BytesIO()
    wb.save(buf)
    u = stock_updates.preview(con, sid, "USA", buf.getvalue(), "list.xlsx")
    assert u["summary"]["header_row"] == 3
    states = {r["item_id"]: r for r in u["rows"]}
    assert states[a["id"]]["changes"].get("qty", [None, 12])[1] == 12
    assert states[b["id"]]["item_id"] == b["id"]


def test_unusable_sheets_are_refused(con):
    sid, _ = _pick(con)
    with pytest.raises(service.ValidationError, match="identifier"):
        stock_updates.preview(con, sid, "USA", _csv([["Name", "Qty"], ["Thing", "1"]]), "a.csv")
    with pytest.raises(service.ValidationError, match="xlsx"):
        stock_updates.preview(con, sid, "USA", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"0" * 100, "old.xls")


class _Resp(io.BytesIO):
    def __init__(self, data, url):
        super().__init__(data)
        self._url = url

    def geturl(self):
        return self._url

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_google_sheet_links_are_downloaded_as_csv():
    seen = []

    def opener(req, timeout):
        seen.append(req.full_url)
        return _Resp(b"SKU,Qty\nA1,2\n", "https://doc-0s-sheets.googleusercontent.com/export/abc")

    data, source = stock_updates.fetch_google_sheet("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=42", opener)
    assert data.startswith(b"SKU") and seen == ["https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/export?format=csv&gid=42"]
    with pytest.raises(service.ValidationError):
        stock_updates.fetch_google_sheet("https://evil.example.com/spreadsheets/d/xyz", opener)
    with pytest.raises(service.ValidationError):
        stock_updates.fetch_google_sheet("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit",
                                         lambda req, timeout: _Resp(b"<html>sign in</html>", "https://accounts.google.com/signin"))


def test_fulfilment_facts_are_private_until_verified(con):
    sid, (a, *_rest) = _pick(con)
    name = con.execute("SELECT name FROM suppliers WHERE id = ?", (sid,)).fetchone()[0]
    f = fulfilment.save(con, sid, {"dispatch_cutoff": "2:00 PM", "cutoff_timezone": "Eastern Time", "carriers": "USPS, UPS",
                                   "dispatch_estimate": "1 to 2 working days after confirmation", "notes": "private note", "stock_update_frequency": "Weekly"})
    assert f["verified"] is False and f["customer_view"] is None
    row = lambda: con.execute("SELECT * FROM supplier_fulfilment WHERE supplier_id = ?", (sid,)).fetchone()  # noqa: E731
    assert publishing.public_fulfilment(row()) is None
    f = fulfilment.save(con, sid, {"verified": True})
    assert f["verified"] and f["customer_view"]["dispatch_cutoff"] == "2:00 PM Eastern Time"
    pub = publishing.public_fulfilment(row())
    assert "notes" not in json.dumps(pub) and "private note" not in json.dumps(pub) and "Weekly" not in json.dumps(pub)
    # Editing a customer-facing fact withdraws the verification until it is confirmed again.
    f = fulfilment.save(con, sid, {"carriers": "USPS"})
    assert f["verified"] is False and publishing.public_fulfilment(row()) is None
    with pytest.raises(service.ValidationError, match="supplier"):
        fulfilment.save(con, sid, {"label_arrangements": f"Labels printed by {name}", "verified": True})
    with pytest.raises(service.ValidationError, match="address"):
        fulfilment.save(con, sid, {"label_arrangements": "Ship from 12 Market Street", "verified": True})
    with pytest.raises(service.ValidationError):
        fulfilment.save(con, sid, {"last_stock_verified_at": "last week"})


def test_supplier_update_endpoints(con):
    c = TestClient(create_app(allowed_hosts={"testserver"}))
    r = c.post("/api/auth/setup", json={"password": "correct-horse-battery-9"})
    assert r.status_code == 200
    c.headers.update({"X-Ravisn-CSRF": r.json()["csrf"]})
    sid, (a, *_rest) = _pick(con)
    up = c.post(f"/api/admin/suppliers/{sid}/stock-updates", files={"file": ("s.csv", _csv([["SKU", "Qty"], [a["supplier_sku"], "17"]]), "text/csv")},
                data={"country": "USA"})
    assert up.status_code == 200, up.text
    uid = up.json()["id"]
    assert c.get(f"/api/admin/suppliers/{sid}/stock-updates").json()[0]["id"] == uid
    assert c.post(f"/api/admin/stock-updates/{uid}/discard").json()["status"] == "discarded"
    assert c.post(f"/api/admin/stock-updates/{uid}/apply", json={}).status_code == 422  # a discarded preview cannot be applied
    f = c.put(f"/api/admin/suppliers/{sid}/fulfilment", json={"carriers": "USPS"})
    assert f.status_code == 200 and f.json()["carriers"] == "USPS"
    assert TestClient(create_app(allowed_hosts={"testserver"})).get(f"/api/admin/suppliers/{sid}/fulfilment").status_code == 401
