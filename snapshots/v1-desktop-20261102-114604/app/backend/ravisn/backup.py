"""Consistent SQLite snapshots with retention, and restore."""

import re
import sqlite3
import threading
from datetime import datetime, timedelta
from pathlib import Path

from . import config

NAME_RE = re.compile(r"^ravisn-(\d{8}-\d{6})-([a-z-]+?)(?:-(\d+))?\.db$")


def backup_now(con: sqlite3.Connection, reason: str = "manual") -> Path:
    config.BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = config.BACKUP_DIR / f"ravisn-{stamp}-{reason}.db"
    n = 1
    while path.exists():
        n += 1
        path = config.BACKUP_DIR / f"ravisn-{stamp}-{reason}-{n}.db"
    dest = sqlite3.connect(path)
    try:
        con.backup(dest)
        ok = dest.execute("PRAGMA integrity_check").fetchone()[0]
    finally:
        dest.close()
    if ok != "ok":
        path.unlink(missing_ok=True)
        raise RuntimeError("Backup failed its integrity check")
    prune()
    return path


def list_backups() -> list[dict]:
    out = []
    for p in sorted(config.BACKUP_DIR.glob("ravisn-*.db"), reverse=True):
        m = NAME_RE.match(p.name)
        if not m:
            continue
        at = datetime.strptime(m.group(1), "%Y%m%d-%H%M%S")
        out.append({"name": p.name, "at": at.isoformat(timespec="seconds"), "reason": m.group(2), "bytes": p.stat().st_size})
    return out


def prune(now: datetime | None = None) -> None:
    """Keep everything from the last 14 days, one per week for 8 weeks, one per month for 12 months, and the newest 10."""
    now = now or datetime.now()
    items = list_backups()
    keep = {b["name"] for b in items[:10]}
    weeks, months = set(), set()
    for b in items:
        at = datetime.fromisoformat(b["at"])
        age = now - at
        if age <= timedelta(days=14):
            keep.add(b["name"])
        elif age <= timedelta(weeks=8):
            wk = at.isocalendar()[:2]
            if wk not in weeks:
                weeks.add(wk)
                keep.add(b["name"])
        elif age <= timedelta(days=366):
            mo = (at.year, at.month)
            if mo not in months:
                months.add(mo)
                keep.add(b["name"])
    for b in items:
        if b["name"] not in keep:
            (config.BACKUP_DIR / b["name"]).unlink(missing_ok=True)


def restore(con: sqlite3.Connection, name: str) -> Path:
    if not NAME_RE.match(name) or "/" in name or "\\" in name:
        raise ValueError("Unknown backup")
    src_path = config.BACKUP_DIR / name
    if not src_path.exists():
        raise ValueError("Unknown backup")
    src = sqlite3.connect(f"file:{src_path}?mode=ro", uri=True)
    try:
        if src.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("That backup is damaged and cannot be restored")
        safety = backup_now(con, "pre-restore")
        src.backup(con)
    finally:
        src.close()
    return safety


def latest_age_hours() -> float | None:
    items = list_backups()
    if not items:
        return None
    return (datetime.now() - datetime.fromisoformat(items[0]["at"])).total_seconds() / 3600


class AutoBackup(threading.Thread):
    """Takes a daily backup while the app is running."""

    def __init__(self, connect):
        super().__init__(daemon=True, name="auto-backup")
        self.connect = connect
        self.stop = threading.Event()

    def run(self):
        while not self.stop.is_set():
            age = latest_age_hours()
            if age is None or age >= 24:
                con = self.connect()
                try:
                    backup_now(con, "daily")
                except Exception:  # noqa: BLE001 - a failed backup must never stop the app
                    import logging
                    logging.exception("Daily backup failed")
                finally:
                    con.close()
            self.stop.wait(3600)
