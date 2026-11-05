"""Permanent Ravisn product references (RVN-UK-10482): unique, never changed or reused, with legacy codes as aliases."""

import re
import sqlite3

import pytest

from ravisn import db, service


def test_every_product_has_a_unique_permanent_reference(con):
    rows = con.execute("SELECT code, ref, country FROM items").fetchall()
    prefix = {"UK": "UK", "USA": "US", "Canada": "CA", "Germany": "DE", "Australia": "AU"}
    assert all(r["ref"] and re.fullmatch(rf"RVN-{prefix[r['country']]}-\d{{5}}", r["ref"]) for r in rows)
    assert len({r["ref"] for r in rows}) == len(rows) == 10547
    assert con.execute("SELECT COUNT(*) FROM ref_registry").fetchone()[0] == len(rows)
    with pytest.raises(sqlite3.IntegrityError):
        con.execute("UPDATE items SET ref = ? WHERE code = ?", (rows[1]["ref"], rows[0]["code"]))
    with pytest.raises(sqlite3.IntegrityError, match="permanent"):
        con.execute("UPDATE items SET ref = 'RVN-UK-99999' WHERE code = ?", (rows[0]["code"],))
    with pytest.raises(sqlite3.IntegrityError, match="permanent"):
        con.execute("UPDATE items SET code = 'UK-9999' WHERE code = ?", (rows[0]["code"],))


def test_legacy_codes_and_references_both_find_products(con):
    r = con.execute("SELECT id, code, ref FROM items ORDER BY id LIMIT 1").fetchone()
    assert db.find_item_id(con, r["code"]) == db.find_item_id(con, r["ref"].lower()) == r["id"]
    assert [x["id"] for x in service.search(con, r["ref"], False)][0] == r["id"]
    assert [x["id"] for x in service.search(con, r["code"], False)][0] == r["id"]


def test_new_products_get_a_fresh_reference_and_none_is_reused(con):
    used = {r[0] for r in con.execute("SELECT ref FROM ref_registry")}
    item_id = service.create_item(con, "Germany", {"name": "Test product", "category": "Test"})
    ref = con.execute("SELECT ref FROM items WHERE id = ?", (item_id,)).fetchone()[0]
    assert ref.startswith("RVN-DE-") and ref not in used
    assert db.ensure_refs(con) == 0  # nothing left without a reference, nothing renumbered
    assert con.execute("SELECT ref FROM items WHERE id = ?", (item_id,)).fetchone()[0] == ref
