from datetime import datetime, timedelta

from ravisn import backup, config, service


def test_backup_and_restore(con):
    item_id = con.execute("SELECT id FROM items WHERE country = 'Canada' ORDER BY seq LIMIT 1").fetchone()[0]
    name_before = con.execute("SELECT name FROM items WHERE id = ?", (item_id,)).fetchone()[0]
    snap = backup.backup_now(con, "manual")
    service.update_item(con, item_id, {"name": "Changed after the backup"})
    safety = backup.restore(con, snap.name)
    assert con.execute("SELECT name FROM items WHERE id = ?", (item_id,)).fetchone()[0] == name_before
    assert (config.BACKUP_DIR / safety.name).exists()
    assert {b["reason"] for b in backup.list_backups()} >= {"manual", "pre-restore"}


def test_restore_rejects_bad_names(con):
    for bad in ("../ravisn.db", "nope.db"):
        try:
            backup.restore(con, bad)
            raise AssertionError("should fail")
        except ValueError:
            pass


def test_prune_keeps_recent_and_spreads_older(con, monkeypatch):
    now = datetime(2026, 12, 31, 12, 0, 0)
    for days in list(range(0, 40)) + [100, 101, 200, 400]:
        at = now - timedelta(days=days)
        (config.BACKUP_DIR / f"ravisn-{at:%Y%m%d-%H%M%S}-daily.db").write_bytes(b"x")
    backup.prune(now)
    left = {b["name"] for b in backup.list_backups()}
    assert f"ravisn-{now:%Y%m%d-%H%M%S}-daily.db" in left
    assert len([n for n in left]) < 44
    assert not any(n.startswith(f"ravisn-{now - timedelta(days=400):%Y%m%d}") for n in left)
