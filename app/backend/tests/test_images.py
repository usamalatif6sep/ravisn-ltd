"""Photo workflow: link types, privacy-safe eBay cache, bulk import, short links and per-product status."""

import io
import json
import zipfile

import pytest
from fastapi.testclient import TestClient

from ravisn import config, db, images
from ravisn.api import create_app


def _jpeg(color=(10, 120, 200)) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    img = Image.new("RGB", (3000, 2000), color)
    exif = img.getexif()
    exif[0x010F] = "SecretCameraMaker"
    img.save(buf, "JPEG", exif=exif)
    return buf.getvalue()


@pytest.fixture()
def photo_env(con, tmp_path, monkeypatch):
    monkeypatch.setattr(config, "IMAGE_DIR", tmp_path / "images")
    monkeypatch.setattr(config, "SECRETS_FILE", tmp_path / "secrets.bin")
    return con


def test_classify_link_types():
    assert images.classify("https://www.ebay.co.uk/itm/123456789012")[0] == "ebay"
    assert images.classify("https://www.ebay.com/itm/Some-Title/123456789012?var=555")[1] == "ebay:EBAY_US:123456789012:555"
    assert images.classify("https://www.ebay.com/p/12345678?iid=123456789012")[1] == "ebay:EBAY_US:123456789012:"
    assert images.classify("https://www.ebay.com/p/12345678")[0] == "ebay_product"
    assert images.classify("https://i.ebayimg.com/images/g/abc/s-l1600.jpg")[0] == "ebay_image"
    assert images.classify("https://ebay.us/m/AbCd")[0] == "needs_full_link"
    assert images.classify("https://www.amazon.com/dp/B0ABCDEFGH")[0] == "unsupported"
    assert images.classify("https://www.ebay.com/sch/i.html?_nkw=x")[0] == "unsupported"
    assert images.classify(None)[0] == "no_link"


def test_cache_never_stores_seller_data():
    body = {"title": "Dior Sauvage", "image": {"imageUrl": "https://i.ebayimg.com/a.jpg"},
            "seller": {"username": "some_seller", "feedbackScore": 99}, "itemLocation": {"postalCode": "AB1"}, "price": {"value": "10.00"}}
    slim = images._slim(body)
    assert "seller" not in json.dumps(slim) and "some_seller" not in json.dumps(slim) and "postalCode" not in json.dumps(slim)
    assert slim["title"] == "Dior Sauvage"
    group = images._slim({"group": {"items": [body]}})
    assert "some_seller" not in json.dumps(group)


def test_uploaded_photo_is_resized_and_metadata_removed(photo_env):
    con = photo_env
    item = con.execute("SELECT id FROM items WHERE country = 'Germany' ORDER BY seq LIMIT 1").fetchone()[0]
    images.save_upload(con, item, _jpeg(), "big.jpg", "My own photo")
    name = con.execute("SELECT file FROM item_images WHERE item_id = ?", (item,)).fetchone()[0]
    from PIL import Image

    stored = (config.IMAGE_DIR / name).read_bytes()
    assert b"SecretCameraMaker" not in stored
    assert max(Image.open(io.BytesIO(stored)).size) == 1600
    with pytest.raises(images.ImageError):
        images.save_upload(con, item, _jpeg(), "big.jpg", "My own photo")  # same photo twice


def test_bulk_import_matches_codes_skus_and_zip(photo_env):
    con = photo_env
    sku_row = con.execute("""SELECT o.supplier_sku, i.code FROM offers o JOIN items i ON i.id = o.item_id WHERE o.supplier_sku IS NOT NULL
                             GROUP BY o.supplier_sku HAVING COUNT(*) = 1 LIMIT 1""").fetchone()
    zbuf = io.BytesIO()
    with zipfile.ZipFile(zbuf, "w") as z:
        z.writestr("photos/DE-0003.jpg", _jpeg((1, 2, 3)))
        z.writestr("__MACOSX/._DE-0003.jpg", b"junk")
    files = [("DE-0001.jpg", _jpeg((5, 5, 5))), ("de_0002 (2).png", _jpeg((6, 6, 6))), (f"{sku_row['supplier_sku']}.jpg", _jpeg((7, 7, 7))),
             ("XX-0001.jpg", _jpeg((8, 8, 8))), ("notes.txt", b"hello"), ("set.zip", zbuf.getvalue())]
    with pytest.raises(images.ImageError):
        images.import_files(con, files, "")
    result = images.import_files(con, files, "Supplier photos, with permission")
    added = {a["code"] for a in result["added"]}
    assert {"DE-0001", "DE-0002", "DE-0003", sku_row["code"]} <= added
    assert "XX-0001.jpg" in result["unmatched"]
    assert any(e["file"] == "notes.txt" for e in result["errors"])
    sort = con.execute("SELECT g.sort FROM item_images g JOIN items i ON i.id = g.item_id WHERE i.code = 'DE-0002'").fetchone()[0]
    assert sort == 2


def test_inbox_folder_import(photo_env):
    con = photo_env
    box = images.inbox_dir()
    box.mkdir(parents=True)
    (box / "AU-0001.jpg").write_bytes(_jpeg((9, 9, 9)))
    (box / "unknown-photo.jpg").write_bytes(_jpeg((10, 10, 10)))
    result = images.import_inbox(con, "My own photos")
    assert [a["code"] for a in result["added"]] == ["AU-0001"]
    assert (box / "unknown-photo.jpg").exists() and not (box / "AU-0001.jpg").exists()
    assert list((box / "imported").rglob("AU-0001.jpg"))


def test_reference_photo_links_become_candidates_without_keys(photo_env, monkeypatch):
    con = photo_env
    item = con.execute("SELECT id FROM items WHERE country = 'Canada' ORDER BY seq LIMIT 1").fetchone()[0]
    con.execute("UPDATE items SET link = 'https://i.ebayimg.com/images/g/xyz/s-l1600.jpg' WHERE id = ?", (item,))
    con.commit()
    monkeypatch.setattr(images, "products", (lambda orig: lambda c, country=None: [p for p in orig(c, country) if p["country"] == "Canada"])(images.products))
    images.run_lookup(lambda: db.connect(config.DB_PATH), pause=0)
    row = con.execute("SELECT status, source FROM item_images WHERE item_id = ?", (item,)).fetchone()
    assert (row["status"], row["source"]) == ("needs_review", "reference_image")
    assert images.photo_status_by_item(con, "Canada")[item] == "candidate"


def test_expand_short_links_respects_robots(photo_env):
    con = photo_env
    item = con.execute("SELECT id FROM items WHERE link LIKE '%ebay.us/%' ORDER BY id LIMIT 1").fetchone()
    if item is None:
        pytest.skip("no ebay.us links")
    res = images.expand_short_links(lambda: db.connect(config.DB_PATH), head=lambda u: "https://www.ebay.com/itm/123456789012", robots=lambda u: False, pause=0)
    assert res["expanded"] == 0
    res = images.expand_short_links(lambda: db.connect(config.DB_PATH), head=lambda u: "https://www.ebay.com/itm/123456789012", robots=lambda u: True, pause=0)
    assert res["expanded"] == res["total"] > 0
    assert con.execute("SELECT link FROM items WHERE id = ?", (item[0],)).fetchone()[0] == "https://www.ebay.com/itm/123456789012"


def test_photo_status_counts_cover_every_product(photo_env):
    cov = images.coverage(photo_env)
    t = cov["totals"]
    assert t["has_photo"] + t["candidate"] + t["not_looked_up"] + t["manual_needed"] == t["total"] == 10547
    assert cov["listings_to_look_up"] > 3000


def test_photo_routes_need_sign_in(photo_env):
    c = TestClient(create_app(allowed_hosts={"testserver"}))
    for path in ("/api/admin/images/needed", "/api/admin/images/needed.csv", "/api/admin/images/job"):
        assert c.get(path).status_code == 401
    assert c.post("/api/admin/images/import-inbox", json={}).status_code == 401
    assert c.post("/api/admin/images/expand-short-links").status_code == 401


def test_photo_action_routes_reach_their_handlers(photo_env):
    c = TestClient(create_app(allowed_hosts={"testserver"}))
    csrf = c.post("/api/auth/setup", json={"password": "correct-horse-battery-9"}).json()["csrf"]
    c.headers.update({"X-Ravisn-CSRF": csrf})
    r = c.post("/api/admin/images/run", json={})
    assert r.status_code == 200 and "processed" in r.json()
    assert c.post("/api/admin/images/stop").status_code == 200
    assert c.get("/api/admin/images/job").status_code == 200
    assert c.post("/api/admin/images/import-inbox", json={"rights": "My own photos"}).status_code == 200
    assert c.post("/api/admin/images/bulk", json={"ids": [], "action": "approve"}).status_code == 200
    assert c.post("/api/admin/images/999999", json={"action": "approve"}).status_code == 404
    images.JOB["stop"] = True
