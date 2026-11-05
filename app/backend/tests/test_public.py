"""The public website must contain only approved public fields, never supplier data."""

import json
import re

import pytest
from fastapi.testclient import TestClient

from ravisn import config, images, publishing, vault
from ravisn.api import create_app
from ravisn.public_server import create_public_app

def _png(color=(200, 30, 30), size=(40, 30)) -> bytes:
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "PNG")
    return buf.getvalue()


PNG = _png()


@pytest.fixture()
def release_env(con, tmp_path, monkeypatch):
    monkeypatch.setattr(config, "RELEASE_DIR", tmp_path / "releases")
    monkeypatch.setattr(config, "PUBLIC_DIR", tmp_path / "public")
    monkeypatch.setattr(config, "IMAGE_DIR", tmp_path / "images")
    monkeypatch.setattr(config, "SECRETS_FILE", tmp_path / "secrets.bin")
    if not (config.PUBLIC_SITE_DIST / "index.html").exists():
        pytest.skip("public site not built")
    return con


WELCOME = "Welcome to Ravisn! I can help you explore products, place an order, arrange shipping or track an existing order. What would you like to do?"


def _private_tokens(con):
    names = [r[0].strip().lower() for r in con.execute("SELECT name FROM suppliers") if len(r[0].strip()) >= 4]
    phones = set()
    for (p,) in con.execute("SELECT coalesce(phone,'') || ' ' || coalesce(other_numbers,'') || ' ' || coalesce(whatsapp_link,'') FROM suppliers"):
        for run in re.findall(r"\d[\d\s().\-]{6,}\d", p):
            d = re.sub(r"\D", "", run)
            if len(d) >= 8:
                phones.add(d[-8:])
    emails = {e.lower() for (x,) in con.execute("SELECT coalesce(emails,'') FROM suppliers") for e in re.findall(r"[^\s,;]+@[^\s,;]+", x)}
    # Same rule as the privacy gate: letter-and-digit SKUs are private. Amazon ASINs and purely numeric
    # model numbers (which appear in the product names themselves) are public identifiers.
    skus = {s.lower() for (s,) in con.execute("SELECT DISTINCT supplier_sku FROM offers WHERE supplier_sku IS NOT NULL")
            if len(s) >= 5 and re.search(r"[A-Za-z]", s) and re.search(r"\d", s) and not re.match(r"^(b0[a-z0-9]{8})$", s.lower())}
    return names, phones, emails, skus


def test_release_contains_only_public_data(release_env):
    con = release_env
    r = publishing.build_release(con)
    folder = config.RELEASE_DIR / r["folder"]
    site = json.loads((folder / "data" / "site.json").read_text(encoding="utf-8"))
    assert set(site) == set(publishing.SITE_KEYS)
    blocked = {row[0] for row in con.execute(
        "SELECT i.code FROM issues x JOIN items i ON i.id = x.item_id WHERE x.state = 'open' AND x.severity = 'blocker'")}
    published = 0
    for c in site["countries"]:
        assert set(c) == set(publishing.COUNTRY_KEYS)
        items = json.loads((folder / "data" / f"{c['slug']}.json").read_text(encoding="utf-8"))
        for p in items:
            assert tuple(p) == publishing.PRODUCT_KEYS
            assert p["legacy"] not in blocked and p["code"].startswith("RVN-")
        published += len(items)
    assert published == r["summary"]["totals"]["published"] == 10547 - len(blocked)

    names, phones, emails, skus = _private_tokens(con)
    for path in folder.rglob("*"):
        if not path.is_file() or path.suffix in (".woff2", ".png", ".jpg", ".webp"):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        # The owner's mandated assistant greeting uses the ordinary verb "explore", which is also a supplier's name.
        # Only that exact sentence is exempt; the word anywhere else still fails.
        low = text.lower().replace(WELCOME.lower(), "")
        rel = path.relative_to(folder).as_posix()
        for n in names:
            assert not re.search(r"(?<![a-z0-9])" + re.escape(n) + r"(?![a-z0-9])", low), f"supplier name in {rel}"
        digits_runs = [re.sub(r"\D", "", m) for m in re.findall(r"\d[\d\s().\-]{6,}\d", text)]
        for ph in phones:
            assert not any(ph in d for d in digits_runs), f"supplier phone in {rel}"
        for e in emails:
            assert e not in low, f"supplier email in {rel}"
        for s in skus:
            assert not re.search(r"(?<![a-z0-9])" + re.escape(s) + r"(?![a-z0-9])", low), f"supplier SKU in {rel}"
        for word in ("cost_minor", "supplier_id", "supplier_sku", "item_ref", "source_tab", "source_link", '"margin"', '"cost"', '"supplier"', "/api/admin"):
            assert word not in text, f"{word} in {rel}"


def test_privacy_gate_stops_planted_secret(release_env):
    con = release_env
    supplier = con.execute("SELECT name, phone FROM suppliers WHERE phone IS NOT NULL LIMIT 1").fetchone()
    # A supplier phone typed into a public policy must stop the release.
    con.execute("UPDATE policy_items SET body = body || ' Call ' || ? WHERE id = (SELECT MIN(id) FROM policy_items)", (supplier["phone"],))
    con.commit()
    with pytest.raises(publishing.PublishError):
        publishing.build_release(con)
    assert not list(config.RELEASE_DIR.glob("r*")) or all(not any(p.iterdir()) for p in config.RELEASE_DIR.glob("r*"))


def test_public_product_is_an_allowlist():
    row = {"code": "UK-0001", "ref": "RVN-UK-12345", "created_at": "2026-10-31T00:00:00Z", "name": "N", "variant": None, "category": "C", "price_minor": 100, "status": "Available", "availability": "available",
           "qty": 1, "qty_basis": "reported", "cost_minor": 50, "supplier": "Secret Co", "item_ref": "123"}
    out = publishing.public_product(row, [], [], None, None)
    assert tuple(out) == publishing.PRODUCT_KEYS
    assert out["code"] == "RVN-UK-12345" and out["legacy"] == "UK-0001"
    assert "Secret Co" not in json.dumps(out) and "cost" not in json.dumps(out)


def test_public_server_serves_only_release_files(release_env):
    r = publishing.build_release(release_env)
    c = TestClient(create_public_app(allowed_hosts={"testserver"}))
    assert c.get("/data/uk.json").status_code == 200
    assert c.get("/uk/UK-0001").headers["content-type"].startswith("text/html")
    assert c.get("/api/admin/meta").status_code == 404
    assert c.get("/api/auth/status").status_code == 404
    assert c.get("/_headers").status_code == 404
    assert c.get("/data/../../ravisn.db").status_code == 404
    assert c.get("/data/%2e%2e/%2e%2e/ravisn.db").status_code == 404
    assert c.get("/data/missing.json").status_code == 404
    assert c.post("/data/uk.json").status_code == 405
    assert "default-src 'self'" in c.get("/").headers["content-security-policy"]
    assert r["state"] == "draft"


def test_admin_photo_and_website_routes_need_sign_in(release_env):
    c = TestClient(create_app(allowed_hosts={"testserver"}))
    for path in ("/api/admin/images/coverage", "/api/admin/website", "/api/admin/images?status=needs_review"):
        assert c.get(path).status_code == 401
    assert c.post("/api/admin/website/releases").status_code == 401
    assert c.put("/api/admin/website/credentials", json={}).status_code == 401


def test_image_lookup_verifies_and_publishes(release_env, monkeypatch):
    con = release_env
    target = con.execute(
        """SELECT i.id, i.code, i.name, i.link FROM items i WHERE i.country = 'Germany' AND i.link LIKE '%ebay.de/itm/%'
           AND (SELECT COUNT(*) FROM items j WHERE j.link = i.link) = 1 ORDER BY i.seq LIMIT 1""").fetchone()
    assert target, "need an eBay-linked German product"
    kind, key, _ = images.classify(target["link"])
    assert kind == "ebay"

    class FakeClient:
        calls = 0

        def get(self, path, params, market):
            FakeClient.calls += 1
            legacy = params["legacy_item_id"]
            if legacy == key.split(":")[2]:
                return 200, {"title": target["name"], "image": {"imageUrl": "https://i.ebayimg.com/images/g/abc/s-l1600.jpg"},
                             "additionalImages": [{"imageUrl": "https://i.ebayimg.com/images/g/def/s-l1600.jpg"}]}
            return 404, {"errors": [{"errorId": 11001, "message": "not found"}]}

    monkeypatch.setattr(images, "products", (lambda orig: lambda c, country=None: [p for p in orig(c, country) if p["country"] == "Germany"])(images.products))
    result = images.run_lookup(lambda: __import__("ravisn.db", fromlist=["x"]).connect(config.DB_PATH), client=FakeClient(), pause=0)
    assert result["found"] >= 1
    status = con.execute("SELECT status FROM item_images WHERE item_id = ? AND sort = 1", (target["id"],)).fetchone()[0]
    assert status == "verified"
    r = publishing.build_release(con)
    de = json.loads((config.RELEASE_DIR / r["folder"] / "data" / "germany.json").read_text(encoding="utf-8"))
    product = next(p for p in de if p["legacy"] == target["code"])
    assert product["images"][0] == "https://i.ebayimg.com/images/g/abc/s-l1600.jpg"
    # A listing is fetched once: running again makes no new calls for it.
    before = FakeClient.calls
    images.run_lookup(lambda: __import__("ravisn.db", fromlist=["x"]).connect(config.DB_PATH), client=FakeClient(), pause=0)
    assert FakeClient.calls == before


def test_title_score():
    assert images.title_score("Dior Sauvage EDT 100ml", "Dior Sauvage Eau de Toilette EDT 100ml Spray") > 0.55
    assert images.title_score("Dior Sauvage EDT 100ml", "Chanel Bleu 50ml") < 0.3
    assert images.title_score("Dior Sauvage 100ml", "Dior Sauvage 60ml") < images.title_score("Dior Sauvage 100ml", "Dior Sauvage 100ml")


def test_needs_review_and_rejected_photos_are_not_published(release_env):
    con = release_env
    item = con.execute("SELECT id, code FROM items WHERE country = 'Canada' ORDER BY seq LIMIT 1").fetchone()
    ts = "2026-01-01T00:00:00Z"
    con.execute("INSERT INTO item_images (item_id, sort, url, source, status, rights, created_at, updated_at) VALUES (?, 1, 'https://i.ebayimg.com/review.jpg', 'ebay_api', 'needs_review', 'ebay_listing', ?, ?)", (item["id"], ts, ts))
    con.execute("INSERT INTO item_images (item_id, sort, url, source, status, rights, created_at, updated_at) VALUES (?, 2, 'https://i.ebayimg.com/rejected.jpg', 'ebay_api', 'rejected', 'ebay_listing', ?, ?)", (item["id"], ts, ts))
    con.commit()
    r = publishing.build_release(con)
    text = (config.RELEASE_DIR / r["folder"] / "data" / "canada.json").read_text(encoding="utf-8")
    assert "review.jpg" not in text and "rejected.jpg" not in text


def test_manual_upload_is_published_as_a_local_copy(release_env):
    con = release_env
    item = con.execute("SELECT id, code FROM items WHERE country = 'Australia' ORDER BY seq LIMIT 1").fetchone()
    with pytest.raises(images.ImageError):
        images.save_upload(con, item["id"], b"not an image", "x.txt", "mine")
    with pytest.raises(images.ImageError):
        images.save_upload(con, item["id"], PNG, "x.png", "")
    images.save_upload(con, item["id"], PNG, "photo.png", "My own photo")
    r = publishing.build_release(con)
    folder = config.RELEASE_DIR / r["folder"]
    au = json.loads((folder / "data" / "australia.json").read_text(encoding="utf-8"))
    src = next(p for p in au if p["legacy"] == item["code"])["images"][0]
    assert re.fullmatch(r"/img/[0-9a-f]{24}\.jpg", src)
    assert (folder / src.lstrip("/")).exists()


def test_publish_needs_approval_confirmation_and_credentials(release_env):
    con = release_env
    r = publishing.build_release(con)
    with pytest.raises(publishing.PublishError):
        publishing.deploy(con, r["id"], "ravisn-catalogue")  # still a draft
    publishing.approve(con, r["id"])
    with pytest.raises(publishing.PublishError):
        publishing.deploy(con, r["id"], "wrong-name")
    assert not vault.has("cloudflare")
    with pytest.raises(publishing.PublishError):
        publishing.deploy(con, r["id"], "ravisn-catalogue")  # no Cloudflare details
    assert con.execute("SELECT state FROM releases WHERE id = ?", (r["id"],)).fetchone()[0] == "approved"
