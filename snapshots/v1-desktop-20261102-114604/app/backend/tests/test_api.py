import sqlite3

import pytest
from fastapi.testclient import TestClient

from ravisn import service
from ravisn.api import create_app

PRIVATE_KEYS = {"supplier", "supplier_id", "cost_minor", "cost_tiers", "item_ref", "supplier_sku", "private"}


@pytest.fixture()
def client(con):
    app = create_app(token="test-token", allowed_hosts={"testserver"})
    c = TestClient(app)
    c.headers.update({"X-Ravisn-Token": "test-token"})
    return c


def test_token_required(con):
    app = create_app(token="t", allowed_hosts={"testserver"})
    c = TestClient(app)
    assert c.get("/api/health").status_code == 200
    assert c.get("/api/meta").status_code == 401
    assert c.get("/api/meta", headers={"X-Ravisn-Token": "wrong"}).status_code == 401


def test_other_hosts_rejected(con):
    app = create_app(token="t")
    c = TestClient(app)
    assert c.get("/api/health").status_code == 403


def test_cross_origin_writes_rejected(client):
    r = client.post("/api/backups", headers={"Origin": "https://evil.example"})
    assert r.status_code == 403


def test_public_lists_carry_no_private_fields(client):
    items = client.get("/api/items", params={"country": "UK"}).json()
    assert len(items) == 2161
    assert not PRIVATE_KEYS & set(items[0])
    detail = client.get(f"/api/items/{items[0]['id']}").json()
    assert "private" not in detail
    assert "private" not in (detail["original"] or {})
    search = client.get("/api/search", params={"q": "UK-0001"}).json()
    assert search and "supplier" not in search[0]


def test_private_fields_need_private_mode(client):
    item = client.get("/api/items", params={"country": "Canada"}).json()[0]
    r = client.patch(f"/api/items/{item['id']}", json={"patch": {"cost_minor": 999}})
    assert r.status_code == 422
    r = client.patch(f"/api/items/{item['id']}?private=1", json={"patch": {"cost_minor": 5000}})
    assert r.status_code == 200
    body = r.json()["item"]
    assert body["private"]["cost_minor"] == 5000
    assert body["price_minor"] == 5250  # price follows the rule


def test_edit_validate_and_undo(client):
    item = client.get("/api/items", params={"country": "Germany"}).json()[0]
    bad = client.patch(f"/api/items/{item['id']}", json={"patch": {"status": "Sold"}})
    assert bad.status_code == 422
    r = client.patch(f"/api/items/{item['id']}", json={"patch": {"status": "Out of stock", "qty": 0}})
    assert r.status_code == 200
    audit_id = r.json()["audit_id"]
    assert r.json()["item"]["status"] == "Out of stock"
    u = client.post(f"/api/audit/{audit_id}/undo")
    assert u.status_code == 200
    after = client.get(f"/api/items/{item['id']}").json()
    assert after["status"] == item["status"] and after["qty"] == item["qty"]


def test_override_needs_reason(client):
    item = client.get("/api/items", params={"country": "Australia"}).json()[0]
    r = client.patch(f"/api/items/{item['id']}", json={"patch": {"price_minor": 1234}})
    assert r.status_code == 422
    r = client.patch(f"/api/items/{item['id']}", json={"patch": {"price_minor": 1234, "price_note": "Agreed with customer"}})
    assert r.status_code == 200 and r.json()["item"]["price_mode"] == "override"


def test_new_codes_continue_and_never_reuse(client, con):
    r = client.post("/api/items", json={"country": "UK", "name": "New product", "category": "Perfumes"})
    assert r.status_code == 200
    assert r.json()["code"] == "UK-2162"
    with pytest.raises(sqlite3.DatabaseError):
        con.execute("DELETE FROM code_registry WHERE code = 'UK-0001'")
    with pytest.raises(sqlite3.DatabaseError):
        con.execute("DELETE FROM items WHERE code = 'UK-0001'")


def test_codes_beyond_four_digits(con):
    ts = "2026-01-01T00:00:00Z"
    con.execute("INSERT INTO code_registry (code, country, seq, issued_at) VALUES ('DE-9999', 'Germany', 9999, ?)", (ts,))
    con.commit()
    assert service.next_code(con, "Germany") == ("DE-10000", 10000)


def test_review_and_exports_endpoints(client):
    summary = client.get("/api/review").json()
    kinds = {k["kind"]: k for k in summary}
    assert kinds["price_exception"]["open"] == 7
    assert kinds["no_supplier_available"]["open"] == 18
    check = client.get("/api/exports/check", params={"country": "Canada"}).json()
    assert check["total"] == 114
    r = client.post("/api/exports/catalogue", json={"country": "UK"})
    assert r.status_code == 409


def test_leak_issue_cannot_be_dismissed(client, con):
    row = con.execute("SELECT id FROM issues WHERE kind LIKE 'leak_%' AND state = 'open' LIMIT 1").fetchone()
    if row is None:
        pytest.skip("no supplier-information matches in this data")
    r = client.post(f"/api/review/issues/{row[0]}", json={"action": "dismiss"})
    assert r.status_code == 422


def test_bulk_zero_out_of_stock(client, con):
    before = con.execute("SELECT COUNT(*) FROM items i WHERE status = 'Out of stock' AND qty > 0 AND country = 'Australia'").fetchone()[0]
    r = client.post("/api/review/bulk", json={"kind": "status_qty_conflict", "action": "zero_out_of_stock", "country": "Australia"})
    assert r.json()["changed"] == before
    assert con.execute("SELECT COUNT(*) FROM items WHERE status = 'Out of stock' AND qty > 0 AND country = 'Australia'").fetchone()[0] == 0
