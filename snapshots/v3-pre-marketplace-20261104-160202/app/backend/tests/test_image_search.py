"""Replacement photo search for ended eBay listings: strict same-product matching, never approved automatically,
logged with eBay's original error, deduplicated and kept within the API allowance."""

import json

import pytest
from fastapi.testclient import TestClient

from ravisn import config, db, image_match, images
from ravisn.api import create_app

PHOTO = {"imageUrl": "https://i.ebayimg.com/images/g/abc/s-l1600.jpg"}


@pytest.mark.parametrize("ours, theirs, ok", [
    ("Jean Paul Gaultier Le Male Elixir 4.2 oz / 125 ml Eau de Parfum", "Jean Paul Gaultier Le Male Elixir Parfum 4.2 oz 125ml Spray", True),
    ("Jean Paul Gaultier Le Male Elixir 4.2 oz / 125 ml Eau de Parfum", "Jean Paul Gaultier Le Male EDT 125ml", False),
    ("Gucci Flora Gorgeous Gardenia Intense 100ml", "Gucci Flora Gorgeous Gardenia Eau de Parfum Intense 100ml", True),
    ("Gucci Flora Gorgeous Gardenia Intense 100ml", "Gucci Flora Gorgeous Gardenia EDP 100ml TESTER", False),
    ("Prevagen Extra Strength 20mg Capsules - 60 Count", "Prevagen Extra Strength 20mg 60 Capsules Memory Support", True),
    ("Prevagen Extra Strength 20mg Capsules - 60 Count", "Prevagen Extra Strength 20mg 30 Capsules", False),
    ("Prada Paradoxe Intense Eau de Parfum 3 oz", "Prada Paradoxe Intense EDP 90ml Spray", True),
    ("Prada Paradoxe Intense Eau de Parfum 3 oz", "Prada Paradoxe EDP 90ml", False),
    ("Hello Kitty Stanley Cup Flowstate Tumbler - 40oz - Purple Glitter", "Stanley Hello Kitty 40oz Tumbler Pink", False),
    ("Biosil Collagen Generator With Ch-Osa 120 Capsules", "BioSil Collagen Generator 2 Pack 120 Capsules ch-OSA", False),
    ("Christian Dior Sauvage Elixir 3.4 fl oz 100mL", "Dior Sauvage Elixir 100ml", True),
    ("Nutrafol Men's Hair Growth Supplements, Clinically Tested", "Nutrafol Women's Hair Growth Supplement 120 Capsules", False),
    ("Lifevantage Protandim Nad Synergizer 60 Caps – Energy, Health & Cellular Support", "LifeVantage Protandim NAD Synergizer 60 Capsules", True),
    ("Versace Eros by Versace Parfum Spray 3.4 oz / e 100 ml", "Versace Eros Pour Femme EDP 100ml", False),
    ("Bright Crystal by Versace Eau De Toilette Spray 3 oz / e 90 ml", "Versace Bright Crystal Absolu EDP 90ml", False),
    ("Nutrafol Women Hair Growth Nutraceutical Dietary Supplement, 120 Capsules", "Nutrafol Women's Balance Hair Growth Supplement, 120 Capsules", False),
    ("Acqua Di Gio by Giorgio Armani Eau De Parfum Spray 6.7 oz for Men", "Acqua Di Gio Profondo by Giorgio Armani EDP 6.7 oz for Men", False),
    ("Louis Vuitton Fragrance 'Rose Des Vents' EDP", "Louis Vuitton Rose Des Vents Eau De Parfum (2ml)", False),
    ("Yves Saint Laurent Y 100ML / 3.3oz Men's Eau de Parfum", "Yves Saint Laurent L'Homme Ultime Eau de Parfum 3.3 fl oz", False),
    ("Alien By Thierry Mugler 3 FL OZ / 90 ml EDP", "Mugler Alien Extraintense Eau de Parfum 90ml Talisman", False),
    ("Hugo Boss Scent For Him EDT 100 ml", "Hugo Boss Men's x Y Eau de Toilette Spray 100ml", False),
    ("Christian Dior Sauvage Eau de Toilette 100ml 3.3oz", "Dior EAU SAUVAGE Eau de Toilette, 100ml", False),
    ("Yves Saint Laurent Y 100ML / 3.3oz Men's Eau de Parfum", "Y by Yves Saint Laurent cologne for men EDP 3.3 / 3.4 oz", True),
    ("Frontline Plus Flea and Tick Treatment for Small Dogs 5-22 LBs 6 Doses", "Frontline Plus Small Dogs Flea Tick Treatment 5-22 Lbs, 3 Doses", False),
    ("Purina Pro Plan Fortiflora Probiotic Food Supplement For Dogs - 30 X 1g Sachets",
     "2 x PURINA PRO PLAN FortiFlora Probiotic Food Supplement for Dogs 30 x 1g Sachet", False),
    ("Purina Pro Plan Fortiflora Probiotic Food Supplement For Dogs - 30 X 1g Sachets",
     "PURINA PRO PLAN FortiFlora Probiotic Food Supplement for Dogs 30 x 1g Sachets", True),
    ("LifeVantage Protandim Nrf1 Synergizer 60 Caps", "2 Bottle LifeVantage Protandim NRF1 Synergizer Dietary Supplement 60 Capsule", False),
    ("Fisico Arthrozene Natural Joint Health Supplement 30 Capsules", "(3) Fisico Arthrozene Natural Joint Health Supplement 30 Caps", False),
])
def test_same_product_rules(ours, theirs, ok):
    assert image_match.evaluate(ours, theirs)["ok"] is ok


@pytest.mark.parametrize("ours, theirs", [
    ("Carolina Herrera Very Good Girl Glam EDP Spray Women 2.7 oz", "Carolina Herrera Very Good Girl 80ml Women's EDP Spray"),
    ("Alien By Thierry Mugler 3 FL OZ / 90 ml EDP", "Mugler Alien Goddess Eau de Parfum 90ml"),
    ("Dior Sauvage Eau De Parfum 100ml", "Dior Sauvage Parfum 100 ml Refillable Spray, Regular Size Eau de Parfum"),
    ("Bleu De Chanel Perfume For Men -100ml", "BRAND NEW Bleu de CHANEL Parfum Men, 3.4 fl oz (100 Ml)"),
])
def test_missing_or_extra_name_words_are_never_high_confidence(ours, theirs):
    assert image_match.evaluate(ours, theirs)["confidence"] == "medium"


def test_similar_title_alone_is_never_high_confidence():
    r = image_match.evaluate("Elemis Pro-Collagen Cleansing Balm", "Elemis Pro-Collagen Cleansing Balm 100g")
    assert r["ok"] and r["confidence"] == "medium"  # our name gives no size, so it cannot be confirmed
    assert image_match.evaluate("Prada Paradoxe Intense EDP 90ml", "Prada Paradoxe Intense EDP 90ml", is_group=True)["confidence"] == "medium"


class FakeEbay:
    def __init__(self, listings: dict[str, list[dict]], remaining: int = 1000):
        self.listings, self.remaining, self.calls = listings, remaining, []

    def token(self):
        return "token"

    def get(self, path, params, market):
        assert path == "item_summary/search" and params["filter"] == "conditions:{NEW}"
        self.calls.append((params["q"], market))
        for word, items in self.listings.items():
            if word in params["q"]:
                return 200, {"total": len(items), "itemSummaries": items}
        return 200, {"total": 0}

    def get_url(self, url, params, market=None):
        return 200, {"rateLimits": [{"apiContext": "buy", "apiName": "Browse", "resources": [
            {"name": "buy.browse", "rates": [{"limit": 5000, "remaining": self.remaining, "reset": "2026-11-04T00:00:00Z", "timeWindow": 86400}]}]}]}


def _ended(con, names: list[str]) -> list[int]:
    """Give Canadian products these names and an ended eBay listing (eBay answered 404 / 11003)."""
    ids = [r[0] for r in con.execute("SELECT id FROM items WHERE country = 'Canada' AND archived = 0 ORDER BY seq LIMIT ?", (len(names),))]
    for n, (item, name) in enumerate(zip(ids, names)):
        legacy = f"90000000000{n}"
        con.execute("UPDATE items SET name = ?, variant = NULL, link = ? WHERE id = ?", (name, f"https://www.ebay.ca/itm/{legacy}", item))
        con.execute("DELETE FROM item_images WHERE item_id = ?", (item,))
        con.execute("INSERT OR REPLACE INTO image_checks (item_id, state, detail, source_key, checked_at) VALUES (?, 'not_found', ?, ?, ?)",
                    (item, "eBay says this listing has ended or no longer exists", f"ebay:EBAY_CA:{legacy}:", db.now()))
        con.execute("INSERT OR REPLACE INTO api_cache (source_key, status, response, fetched_at) VALUES (?, 404, ?, ?)",
                    (f"ebay:EBAY_CA:{legacy}:", json.dumps({"errors": [{"errorId": 11003, "message": "The specified legacy item Id was not found."}]}), db.now()))
    con.commit()
    return ids


@pytest.fixture()
def ended(con, tmp_path, monkeypatch):
    monkeypatch.setattr(config, "SECRETS_FILE", tmp_path / "secrets.bin")
    ids = _ended(con, ["Prada Paradoxe Intense Eau de Parfum 3 oz", "Prevagen Extra Strength 20mg Capsules - 60 Count",
                       "Zzyzx Unfindable Widget 12ml", "Prada Paradoxe Intense Eau de Parfum 3 oz"])
    return con, ids


LISTINGS = {
    "prada": [{"title": "Prada Paradoxe Intense EDP 90ml Spray", "legacyItemId": "111", "image": PHOTO, "seller": {"username": "secret_seller"}},
              {"title": "Prada Paradoxe Intense EDP 90ml TESTER", "legacyItemId": "112", "image": PHOTO}],
    "prevagen": [{"title": "Prevagen Extra Strength 20mg 30 Capsules", "legacyItemId": "222", "image": PHOTO}],
}


def test_search_finds_candidates_and_never_approves(ended):
    con, (prada, prevagen, unknown, prada_twin) = ended
    live_before = con.execute("SELECT COUNT(*) FROM item_images WHERE status IN ('approved', 'verified')").fetchone()[0]
    assert {p["id"] for p in images.products(con, "Canada") if p["search_pending"]} >= {prada, prevagen, unknown, prada_twin}
    client = FakeEbay(LISTINGS)
    res = images.run_search(lambda: db.connect(config.DB_PATH), client=client, pause=0, item_ids={prada, prevagen, unknown, prada_twin})
    assert res["processed"] == 4 and res["message"] == "Finished"

    # Same product twice in one country: searched once.
    assert sum(1 for q, _ in client.calls if "prada" in q) == 1
    assert all(m == "EBAY_CA" for _, m in client.calls)

    rows = con.execute("SELECT item_id, status, confidence, source_ref, seen_title FROM item_images WHERE item_id IN (?, ?)", (prada, prada_twin)).fetchall()
    assert rows and all(r["status"] == "needs_review" and r["confidence"] == "high" and r["source_ref"] == "search:EBAY_CA:111" for r in rows)
    assert con.execute("SELECT COUNT(*) FROM item_images WHERE status IN ('approved', 'verified')").fetchone()[0] == live_before

    log = {r["item_id"]: r for r in con.execute("SELECT * FROM image_search_log")}
    assert log[prada]["outcome"] == "candidate_high" and "11003" in log[prada]["original"]
    assert any("tester" in " ".join(x["reasons"]) for x in json.loads(log[prada]["rejected"]))
    assert log[prevagen]["outcome"] == "no_match" and "different size" in log[prevagen]["rejected"]
    assert log[unknown]["outcome"] == "no_results"

    status = {p["id"]: p for p in images.products(con, "Canada")}
    assert status[prada]["photo"] == "candidate"
    assert status[prevagen]["photo"] == "manual_needed" and "no exact match" in status[prevagen]["photo_reason"]
    assert status[unknown]["photo"] == "manual_needed" and not status[unknown]["search_pending"]
    assert "secret_seller" not in json.dumps([dict(r) for r in con.execute("SELECT response FROM api_cache")])

    # A second run makes no calls: everything is logged and cached.
    again = FakeEbay(LISTINGS)
    images.run_search(lambda: db.connect(config.DB_PATH), client=again, pause=0, item_ids={prada, prevagen, unknown, prada_twin})
    assert again.calls == []

    report = images.search_report(con)
    assert report["outcomes"]["candidate_high"] == 2 and report["by_original"]["eBay error 11003"] == 4


def test_approving_a_candidate_publishes_its_photos(ended):
    con, (prada, *_rest) = ended
    images.run_search(lambda: db.connect(config.DB_PATH), client=FakeEbay(LISTINGS), pause=0, item_ids={prada})
    main = con.execute("SELECT id FROM item_images WHERE item_id = ? ORDER BY sort LIMIT 1", (prada,)).fetchone()[0]
    images.set_status(con, main, "approve")
    assert con.execute("SELECT COUNT(*) FROM public_images WHERE item_id = ?", (prada,)).fetchone()[0] >= 1


def test_search_stops_at_the_allowance(ended):
    con, ids = ended
    client = FakeEbay(LISTINGS, remaining=images.SEARCH_RESERVE)  # nothing above the reserve
    res = images.run_search(lambda: db.connect(config.DB_PATH), client=client, pause=0, item_ids=set(ids))
    assert client.calls == [] and res["message"].startswith("Paused") and res["processed"] == 0
    assert con.execute("SELECT COUNT(*) FROM image_search_log").fetchone()[0] == 0


def test_regrading_uses_the_cache_even_without_allowance(ended):
    con, ids = ended
    images.run_search(lambda: db.connect(config.DB_PATH), client=FakeEbay(LISTINGS), pause=0, item_ids=set(ids))
    assert images.reset_undecided_searches(con, set(ids)) == 4
    client = FakeEbay(LISTINGS, remaining=images.SEARCH_RESERVE)
    res = images.run_search(lambda: db.connect(config.DB_PATH), client=client, pause=0, item_ids=set(ids))
    assert client.calls == [] and res["processed"] == 4 and res["message"] == "Finished"


def test_search_routes(ended):
    c = TestClient(create_app(allowed_hosts={"testserver"}))
    for path in ("/api/admin/images/search/report", "/api/admin/images/search/report.csv"):
        assert c.get(path).status_code == 401
    assert c.post("/api/admin/images/search/run", json={}).status_code == 401
    csrf = c.post("/api/auth/setup", json={"password": "correct-horse-battery-9"}).json()["csrf"]
    c.headers.update({"X-Ravisn-CSRF": csrf})
    assert c.get("/api/admin/images/search/report").json()["pending_products"] >= 4
    assert c.get("/api/admin/images/search/report.csv").status_code == 200
    assert c.get("/api/admin/images?confidence=high").status_code == 200
    r = c.post("/api/admin/images/search/run", json={"limit": 1})  # no eBay keys in the test vault
    assert r.status_code == 200
    assert c.post("/api/admin/images/search/stop").status_code == 200


def test_reuse_photos_of_identical_products_only(ended):
    con, (prada, prevagen, unknown, prada_twin) = ended
    images.run_search(lambda: db.connect(config.DB_PATH), client=FakeEbay(LISTINGS), pause=0, item_ids={prada, prada_twin, prevagen, unknown})
    main = con.execute("SELECT id FROM item_images WHERE item_id = ? ORDER BY sort LIMIT 1", (prada,)).fetchone()[0]
    images.set_status(con, main, "approve")
    # The twin still has its own candidate to check, so it is left alone; once rejected, the identical product's photo is reused.
    twin = con.execute("SELECT id FROM item_images WHERE item_id = ? ORDER BY sort LIMIT 1", (prada_twin,)).fetchone()[0]
    images.set_status(con, twin, "reject")
    similar = con.execute("SELECT id FROM items WHERE country = 'Canada' AND id NOT IN (?, ?, ?, ?) ORDER BY seq LIMIT 1", (prada, prevagen, unknown, prada_twin)).fetchone()[0]
    con.execute("UPDATE items SET name = 'Prada Paradoxe Intense Eau de Parfum 1.7 oz' WHERE id = ?", (similar,))
    con.execute("DELETE FROM item_images WHERE item_id = ?", (similar,))
    con.commit()
    assert images.reuse_identical(con)["reused"] >= 1  # the real catalogue holds more products with exactly this name
    rows = con.execute("SELECT status, source_ref FROM item_images WHERE item_id = ? AND status = 'approved'", (prada_twin,)).fetchall()
    assert rows and rows[0]["source_ref"].startswith("reuse:")
    assert not con.execute("SELECT 1 FROM item_images WHERE item_id = ? AND source_ref LIKE 'reuse:%'", (similar,)).fetchone()  # similar is not identical


def test_illustrative_photos_are_labelled_on_the_website(ended):
    from ravisn import publishing

    con, (prada, *_rest) = ended
    images.run_search(lambda: db.connect(config.DB_PATH), client=FakeEbay(LISTINGS), pause=0, item_ids={prada})
    main = con.execute("SELECT id FROM item_images WHERE item_id = ? ORDER BY sort LIMIT 1", (prada,)).fetchone()[0]
    images.set_status(con, main, "illustrative")
    _site, products, _report, _files = publishing.collect(con)
    code = con.execute("SELECT code FROM items WHERE id = ?", (prada,)).fetchone()[0]
    p = next(x for x in products["canada"] if x["code"] == code)
    assert p["images"] and p["illustrative"] is True


def test_supplier_image_feed(ended, tmp_path, monkeypatch):
    from tests.test_images import _jpeg

    monkeypatch.setattr(config, "IMAGE_DIR", tmp_path / "images")
    con, (prada, *_rest) = ended
    code = con.execute("SELECT code FROM items WHERE id = ?", (prada,)).fetchone()[0]
    feed = f"Product code,Image URL\n{code},https://supplier.example/a.jpg | https://supplier.example/b.jpg\nXX-0001,https://supplier.example/c.jpg\n{code},http://insecure.example/d.jpg\n"
    with pytest.raises(images.ImageError):
        images.import_feed(con, feed.encode(), "")
    fetched = []
    res = images.import_feed(con, feed.encode(), "Supplier media pack, permission by email", fetch=lambda u: fetched.append(u) or _jpeg((len(fetched), 3, 3)),
                             host_ok=lambda u: True, pause=0)
    assert len(res["added"]) == 2 and res["unmatched"] == ["XX-0001"] and res["errors"]
    assert fetched == ["https://supplier.example/a.jpg", "https://supplier.example/b.jpg"]
    assert con.execute("SELECT COUNT(*) FROM item_images WHERE item_id = ? AND status = 'approved' AND source = 'bulk_upload'", (prada,)).fetchone()[0] == 2


def test_products_without_an_ebay_listing_are_searched_too(con):
    row = con.execute("SELECT i.id FROM items i WHERE i.link LIKE '%amazon.%' AND i.id NOT IN (SELECT item_id FROM item_images) LIMIT 1").fetchone()
    if row is None:
        pytest.skip("no Amazon-linked product without photos")
    p = next(x for x in images.products(con) if x["id"] == row[0])
    assert p["search_pending"] and not p["ended"] and "eBay search" in p["photo_reason"]
    assert images._reason(p, "no_match") == "No exact match on eBay: upload a photo"
