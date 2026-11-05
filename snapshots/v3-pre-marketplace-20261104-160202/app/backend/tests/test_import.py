import hashlib

from ravisn import config, db

EXPECTED = {"UK": 2161, "USA": 8005, "Canada": 114, "Germany": 57, "Australia": 210}


def test_every_code_imported(imported):
    report = imported["report"]
    for key, n in EXPECTED.items():
        c = report["countries"][key]
        assert c["catalogue_rows"] == c["master_rows"] == c["imported"] == n


def test_verification_checks_pass(imported):
    failed = [c for c in imported["report"]["checks"] if not c["ok"]]
    assert failed == []


def test_pricing_exceptions_are_the_seven_known_rows(imported):
    exc = imported["report"]["exceptions"]
    assert len(exc) == 7
    assert all(e["code"].startswith("US-") for e in exc)
    assert all(abs(e["price_minor"] - e["rule_minor"]) <= 106 for e in exc)


def test_counts_in_database(con):
    for key, n in EXPECTED.items():
        assert con.execute("SELECT COUNT(*) FROM items WHERE country = ?", (key,)).fetchone()[0] == n
    assert con.execute("SELECT COUNT(*) FROM code_registry").fetchone()[0] == 10547
    assert con.execute("SELECT COUNT(*) FROM suppliers").fetchone()[0] == 12
    assert con.execute("SELECT COUNT(*) FROM items WHERE price_mode = 'rule'").fetchone()[0] == 10444
    assert con.execute("SELECT COUNT(*) FROM item_price_tiers").fetchone()[0] == 68


def test_quantities_keep_minimum_marker(con):
    assert con.execute("SELECT COUNT(*) FROM items WHERE qty_basis = 'minimum'").fetchone()[0] == 1628
    assert con.execute("SELECT COUNT(*) FROM items WHERE qty_basis = 'confirmed'").fetchone()[0] == 0


def test_unmapped_uk_codes(con):
    n = con.execute("SELECT COUNT(*) FROM offers o JOIN items i ON i.id = o.item_id WHERE o.supplier_id IS NULL").fetchone()[0]
    assert n == 96


def test_originals_untouched(imported):
    for f in imported["report"]["files"]:
        h = hashlib.sha256((config.DEFAULT_SOURCE_DIR / f["name"]).read_bytes()).hexdigest()
        assert h == f["sha256"]


def test_live_quantities_policy_reworded(con):
    titles = [r[0] for r in con.execute("SELECT title FROM policy_items")]
    assert "Live quantities" not in titles
    assert "Quantities" in titles
    assert db.get_setting(con, "company") == "Ravisn Ltd"
