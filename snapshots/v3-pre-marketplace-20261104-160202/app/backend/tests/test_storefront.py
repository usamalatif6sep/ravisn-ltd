"""Reseller orders and live chat: validation, prices from the catalogue only, duplicate and spam protection, the
admin view with private supplier data, and no supplier information in any public answer."""

import json

import pytest
from fastapi.testclient import TestClient

from ravisn import config, storefront
from ravisn.api import create_app
from ravisn.public_server import create_public_app

STORE_HEADERS = {"X-Ravisn-Store": "1", "Content-Type": "application/json"}


@pytest.fixture()
def shop(con, tmp_path, monkeypatch):
    """A published catalogue with real UK codes from the imported data, and an empty storefront database."""
    monkeypatch.setattr(config, "STOREFRONT_DB", tmp_path / "storefront.db")
    storefront._migrated.clear()
    rows = con.execute("""SELECT i.code, i.name, i.price_minor FROM items i JOIN statuses s ON s.name = i.status
                          WHERE i.country = 'UK' AND i.archived = 0 AND s.availability = 'available' AND i.price_minor IS NOT NULL
                          AND i.id NOT IN (SELECT item_id FROM item_price_tiers) ORDER BY i.seq LIMIT 3""").fetchall()
    tiered = con.execute("SELECT i.code, i.name FROM items i WHERE i.country = 'UK' AND i.id IN (SELECT item_id FROM item_price_tiers) LIMIT 1").fetchone()
    products = [{"code": r["code"], "name": r["name"], "variant": None, "category": "Test", "price": r["price_minor"], "tiers": None,
                 "status": "Available", "availability": "available", "qty": 10, "qty_basis": "reported", "link": None, "link_site": None,
                 "images": [], "group": None} for r in rows]
    products.append({**products[0], "code": "UK-9999", "status": "Out of stock", "availability": "unavailable"})
    if tiered:
        products.append({**products[0], "code": tiered["code"], "name": tiered["name"], "price": None, "tiers": [["Single", 1500], ["Pack", 2500]]})
    folder = tmp_path / "release"
    (folder / "data").mkdir(parents=True)
    (folder / "index.html").write_text("<!doctype html><title>t</title>")
    site = {"company": "Ravisn Ltd", "release": 7, "countries": [{"key": "UK", "slug": "uk", "name": "United Kingdom", "currency": "GBP", "symbol": "£"}]}
    (folder / "data" / "site.json").write_text(json.dumps(site))
    (folder / "data" / "uk.json").write_text(json.dumps(products))
    public = TestClient(create_public_app(allowed_hosts={"testserver"}, folder_provider=lambda: folder, store_path=config.STOREFRONT_DB))
    return {"public": public, "codes": [r["code"] for r in rows], "prices": [r["price_minor"] for r in rows], "tiered": tiered["code"] if tiered else None,
            "con": con}


def order_body(codes, **extra):
    body = {"catalogue": "uk", "items": [{"code": c, "qty": 2} for c in codes], "customer_name": "Jo Reseller", "email": "jo@example.com",
            "phone_dial": "44", "phone": "07700 900123", "recipient_name": "Sam Buyer", "address_country": "GB", "address1": "1 High Street",
            "city": "London", "postcode": "sw1a1aa", "confirmed": True}
    return body | extra


def post(client, path, body, **headers):
    return client.post(path, content=json.dumps(body), headers=STORE_HEADERS | headers)


def test_order_is_saved_with_catalogue_prices(shop):
    c = shop["public"]
    body = order_body(shop["codes"][:2])
    body["items"][0]["price"] = 1  # a price sent by the browser is ignored
    r = post(c, "/api/store/orders", body, **{"Idempotency-Key": "abc-1"})
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["number"].startswith("RV") and len(o["token"]) == 32
    assert o["subtotal_minor"] == 2 * shop["prices"][0] + 2 * shop["prices"][1]
    assert o["status"] == "New" and o["payment_status"] == "Pending confirmation"
    assert o["delivery"]["postcode"] == "SW1A 1AA"
    # Resubmitting the same request (double click, network retry) returns the same order.
    again = post(c, "/api/store/orders", body, **{"Idempotency-Key": "abc-1"}).json()
    assert again["number"] == o["number"] and again["duplicate"]
    twin = post(c, "/api/store/orders", body, **{"Idempotency-Key": "abc-2"}).json()
    assert twin["number"] == o["number"] and twin["duplicate"]
    # Only the holder of the order's token can see it.
    assert c.get(f"/api/store/orders/{o['number']}", headers={"X-Order-Token": o["token"]}).json()["number"] == o["number"]
    assert c.get(f"/api/store/orders/{o['number']}", headers={"X-Order-Token": "x" * 32}).status_code == 404


def test_order_numbers_are_unique(shop):
    c = shop["public"]
    numbers = set()
    for n in range(5):
        body = order_body(shop["codes"][:1], email=f"r{n}@example.com")
        numbers.add(post(c, "/api/store/orders", body, **{"Idempotency-Key": f"k{n}"}).json()["number"])
    assert len(numbers) == 5


@pytest.mark.parametrize("change, field", [
    ({"email": "not-an-email"}, "email"),
    ({"phone": "123"}, "phone"),
    ({"postcode": "12345"}, "postcode"),
    ({"address_country": "US", "postcode": "10001", "region": ""}, "region"),
    ({"address_country": "US", "postcode": "1000", "region": "NY"}, "postcode"),
    ({"address_country": "CA", "postcode": "K1A0B1", "region": "XX"}, "region"),
    ({"recipient_name": ""}, "recipient_name"),
    ({"confirmed": False}, "confirmed"),
])
def test_delivery_details_are_checked_by_country(shop, change, field):
    r = post(shop["public"], "/api/store/orders", order_body(shop["codes"][:1], **change))
    assert r.status_code == 422 and field in r.json()["fields"], r.text


def test_country_rules_accept_valid_addresses(shop):
    c = shop["public"]
    us = order_body(shop["codes"][:1], address_country="US", postcode="10001-1234", region="ny", phone_dial="1", phone="212 555 0100", email="us@example.com")
    ca = order_body(shop["codes"][:1], address_country="CA", postcode="k1a0b1", region="ON", phone_dial="1", phone="613 555 0100", email="ca@example.com")
    de = order_body(shop["codes"][:1], address_country="DE", postcode="10115", phone_dial="49", phone="030 123456", email="de@example.com")
    for body in (us, ca, de):
        r = post(c, "/api/store/orders", body)
        assert r.status_code == 200, r.text
    assert post(c, "/api/store/orders", us).json()["delivery"]["region"] == "NY"


def test_unavailable_unknown_and_option_rules(shop):
    c = shop["public"]
    assert "out of stock" in post(c, "/api/store/orders", order_body(["UK-9999"])).json()["error"]
    assert "no longer" in post(c, "/api/store/orders", order_body(["UK-0000X"])).json()["error"]
    if shop["tiered"]:
        assert "Choose an option" in post(c, "/api/store/orders", order_body([shop["tiered"]])).json()["error"]
        body = order_body([])
        body["items"] = [{"code": shop["tiered"], "option": "Pack", "qty": 3}]
        assert post(c, "/api/store/orders", body).json()["subtotal_minor"] == 7500
    body = order_body(shop["codes"][:1])
    body["items"][0]["qty"] = 1000
    assert post(c, "/api/store/orders", body).status_code == 422


def test_spam_and_request_protection(shop):
    c = shop["public"]
    assert post(c, "/api/store/orders", order_body(shop["codes"][:1], website="http://spam")).status_code == 400
    assert c.post("/api/store/orders", content=json.dumps(order_body(shop["codes"][:1])), headers={"Content-Type": "application/json"}).status_code == 415
    assert post(c, "/api/store/orders", order_body(shop["codes"][:1]), Origin="https://evil.example").status_code == 403
    assert c.post("/data/uk.json", content="{}", headers=STORE_HEADERS).status_code == 405
    statuses = [post(c, "/api/store/orders", order_body(shop["codes"][:1], email=f"s{n}@example.com")).status_code for n in range(8)]
    assert statuses[:6] == [200] * 6 and 429 in statuses[6:]


def test_public_answers_never_contain_supplier_data(shop):
    con = shop["con"]
    private = [r[0].lower() for r in con.execute("SELECT name FROM suppliers") if len(r[0]) >= 5]
    private += [r[0].lower() for r in con.execute("SELECT supplier_sku FROM offers WHERE supplier_sku IS NOT NULL AND length(supplier_sku) >= 6 LIMIT 500")]
    c = shop["public"]
    o = post(c, "/api/store/orders", order_body(shop["codes"][:2])).json()
    answers = [json.dumps(o), c.get("/api/store/config").text, c.get(f"/api/store/orders/{o['number']}", headers={"X-Order-Token": o["token"]}).text]
    for text in answers:
        low = text.lower()
        assert not [p for p in private if p in low]
        for word in ("cost", "supplier", "margin", "sku"):
            assert word not in low


def test_chat_with_assistant_then_team(shop):
    c = shop["public"]
    start = post(c, "/api/store/chat", {"page": "/uk"}).json()
    h = {"X-Chat-Token": start["token"]}
    s = post(c, f"/api/store/chat/{start['id']}/messages", {"text": "Do you have Dior?", "assistant_reply": "Here are 3 products"}, **h).json()
    assert [m["sender"] for m in s["messages"]] == ["visitor", "assistant"] and s["mode"] == "assistant"
    # Nobody is online: the visitor is told so, never that someone is about to answer.
    s = post(c, f"/api/store/chat/{start['id']}/team", {"name": "Jo"}, **h).json()
    assert s["team_online"] is False and s["messages"][-1]["body"] == storefront.TEAM_AWAY and s["mode"] == "waiting"
    assert c.get(f"/api/store/chat/{start['id']}", headers={"X-Chat-Token": "wrong"}).status_code == 404

    store = storefront.connect()
    storefront.set_presence(store, True)
    assert storefront.summary(store)["unread_chats"] == 1
    storefront.chat_reply(store, start["id"], "Hello Jo, how can I help?")
    s = c.get(f"/api/store/chat/{start['id']}", headers=h).json()
    assert s["team_online"] and s["mode"] == "human"
    assert [m["body"] for m in s["messages"][-2:]] == [storefront.TEAM_JOINED, "Hello Jo, how can I help?"]
    # Once the team has taken over, automated replies are no longer stored.
    s = post(c, f"/api/store/chat/{start['id']}/messages", {"text": "Thanks", "assistant_reply": "bot"}, **h).json()
    assert s["messages"][-1]["sender"] == "visitor"
    storefront.chat_set(store, start["id"], "archive")
    assert c.get(f"/api/store/chat/{start['id']}", headers=h).status_code == 410
    store.close()


def _admin(con):
    c = TestClient(create_app(allowed_hosts={"testserver"}))
    csrf = c.post("/api/auth/setup", json={"password": "correct-horse-battery-9"}).json()["csrf"]
    c.headers.update({"X-Ravisn-CSRF": csrf})
    return c


def test_admin_manages_orders_with_private_data(shop):
    o = post(shop["public"], "/api/store/orders", order_body(shop["codes"][:2], instructions="Leave with the neighbour")).json()
    anon = TestClient(create_app(allowed_hosts={"testserver"}))
    assert anon.get("/api/admin/orders").status_code == 401 and anon.get(f"/api/admin/orders/{o['number']}").status_code == 401
    a = _admin(shop["con"])
    assert a.get("/api/admin/store/summary").json()["new_orders"] == 1
    listing = a.get("/api/admin/orders").json()
    assert listing["total"] == 1 and listing["orders"][0]["number"] == o["number"]
    d = a.get(f"/api/admin/orders/{o['number']}").json()
    assert d["instructions"] == "Leave with the neighbour" and d["phone"] == "+447700900123"
    line = d["items"][0]
    assert line["private"]["supplier"] is not None and line["private"]["cost_minor"] is not None
    assert d["margin_minor"] is not None
    assert a.get("/api/admin/store/summary").json()["new_orders"] == 0
    other = shop["con"].execute("SELECT id FROM suppliers WHERE id != ? LIMIT 1", (line["private"]["supplier"]["id"],)).fetchone()[0]
    d = a.patch(f"/api/admin/orders/{o['number']}", json={"status": "Awaiting confirmation", "payment_status": "Awaiting payment", "tracking": "TRK1",
                                                          "carrier": "Royal Mail", "notes": "Call supplier at 10", "lines": [{"line_id": line["id"], "supplier_id": other}]}).json()
    assert d["status"] == "Awaiting confirmation" and d["payment_status"] == "Awaiting payment"
    assert d["items"][0]["private"]["supplier"]["id"] == other and d["notes"] == "Call supplier at 10"
    assert {e["kind"] for e in d["events"]} >= {"created", "status", "payment", "tracking"}
    assert a.patch(f"/api/admin/orders/{o['number']}", json={"status": "Paid"}).status_code == 422  # payment is not an order status
    # The reseller sees the new statuses and tracking, never the private notes or supplier.
    pub = shop["public"].get(f"/api/store/orders/{o['number']}", headers={"X-Order-Token": o["token"]}).json()
    assert pub["payment_status"] == "Awaiting payment" and pub["tracking"] == "TRK1" and "Call supplier" not in json.dumps(pub)
    assert a.post(f"/api/admin/orders/{o['number']}/erase", json={"confirm": "nope"}).status_code == 422
    d = a.post(f"/api/admin/orders/{o['number']}/erase", json={"confirm": o["number"]}).json()
    assert d["email"] == "[erased]" and d["erased_at"] and d["items"]


def test_retention_purges_old_chats(shop):
    store = storefront.connect()
    start = storefront.chat_start(store, "/", "x")
    storefront.chat_post(store, start["id"], start["token"], "hello")
    store.execute("UPDATE chats SET last_message_at = '2020-01-01T00:00:00Z'")
    assert storefront.purge(store)["chats_deleted"] == 1
    with pytest.raises(storefront.StoreError):
        storefront.set_retention(store, {"chat_days": 1})
    store.close()


def test_order_service_setup_and_publish_guard(con, tmp_path, monkeypatch):
    from ravisn import db, publishing, vault

    monkeypatch.setattr(config, "SECRETS_FILE", tmp_path / "secrets.bin")
    vault.put("cloudflare", {"account_id": "0" * 32, "api_token": "t" * 40})
    calls = []

    class Done:
        def __init__(self, out=""):
            self.returncode, self.stdout, self.stderr = 0, out, ""

    def fake_run(args, **kw):
        calls.append((args[2:], kw.get("input")))
        return Done('database_id = "11111111-2222-3333-4444-555555555555"' if args[2:4] == ["d1", "create"] else "")

    monkeypatch.setattr(publishing, "wrangler_cmd", lambda: ["node", "wrangler.js"])
    with pytest.raises(publishing.PublishError):
        publishing.setup_order_service(con, "wrong-name", run=fake_run)
    project = publishing.setting(con, "site_project")
    out = publishing.setup_order_service(con, project, run=fake_run)
    assert out["database"] == f"{project}-orders"
    secrets_set = [c for c in calls if c[0][:3] == ["pages", "secret", "put"]]
    assert {c[0][3] for c in secrets_set} == {"STORE_SECRET", "ADMIN_TOKEN"} and all(len(c[1]) >= 40 for c in secrets_set)
    assert db.get_setting(con, "cloud_store")["database_id"] == "11111111-2222-3333-4444-555555555555"
    assert vault.get("storefront_remote")["url"] == f"https://{project}.pages.dev"
    folder = tmp_path / "rel"
    folder.mkdir()
    publishing.write_pages_config(project, folder, db.get_setting(con, "cloud_store"))
    toml = (config.DEPLOY_DIR / "wrangler.toml").read_text()
    assert 'binding = "DB"' in toml and "11111111-2222" in toml
    (config.DEPLOY_DIR / "wrangler.toml").unlink()
