"""SQLite access: connections, migrations and small shared helpers."""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from . import config

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def connect(path: Path | None = None) -> sqlite3.Connection:
    con = sqlite3.connect(path or config.DB_PATH, timeout=15, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    con.execute("PRAGMA synchronous = FULL")
    return con


def migrate(con: sqlite3.Connection, before_apply=None) -> list[str]:
    """Apply pending migrations in order. `before_apply` runs once before the first one (used for a backup)."""
    con.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT")
    done = {r[0] for r in con.execute("SELECT version FROM schema_migrations")}
    pending = [p for p in sorted(MIGRATIONS_DIR.glob("*.sql")) if p.stem not in done]
    if pending and before_apply and done:
        before_apply()
    for p in pending:
        with con:
            con.executescript("BEGIN;" + p.read_text(encoding="utf-8") + ";INSERT INTO schema_migrations VALUES ('%s', '%s');COMMIT;" % (p.stem, now()))
    if "006_references" in done | {p.stem for p in pending}:
        ensure_refs(con)
    return [p.stem for p in pending]


REF_PREFIX = {"UK": "UK", "USA": "US", "Canada": "CA", "Germany": "DE", "Australia": "AU"}


def ensure_refs(con: sqlite3.Connection) -> int:
    """Give every product without one a permanent Ravisn reference, RVN-<country>-<five digits>. Numbers are random
    within each country (so they reveal nothing about catalogue size), unique, recorded, and never reused."""
    import secrets

    rows = con.execute("SELECT id, country FROM items WHERE ref IS NULL ORDER BY country, seq").fetchall()
    if not rows:
        return 0
    used = {r[0] for r in con.execute("SELECT ref FROM ref_registry")}
    ts = now()
    with con:
        for r in rows:
            prefix = REF_PREFIX.get(r[1], (r[1] or "XX")[:2].upper())
            while True:
                ref = f"RVN-{prefix}-{10000 + secrets.randbelow(90000)}"
                if ref not in used:
                    break
            used.add(ref)
            con.execute("INSERT INTO ref_registry (ref, item_id, country, issued_at) VALUES (?, ?, ?, ?)", (ref, r[0], r[1], ts))
            con.execute("UPDATE items SET ref = ? WHERE id = ?", (ref, r[0]))
    return len(rows)


def find_item_id(con: sqlite3.Connection, code: str) -> int | None:
    """A product by its Ravisn reference or its legacy code (both stay valid forever)."""
    c = (code or "").strip().upper()
    row = con.execute("SELECT id FROM items WHERE ref = ? OR code = ?", (c, c)).fetchone()
    return row[0] if row else None


def audit(con: sqlite3.Connection, entity: str, entity_id: int | None, action: str, changes: dict, note: str | None = None) -> int:
    cur = con.execute(
        "INSERT INTO audit (at, entity, entity_id, action, changes, note) VALUES (?, ?, ?, ?, ?, ?)",
        (now(), entity, entity_id, action, json.dumps(changes, ensure_ascii=False), note),
    )
    return cur.lastrowid


def get_setting(con: sqlite3.Connection, key: str, default=None):
    row = con.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return json.loads(row[0]) if row else default


def set_setting(con: sqlite3.Connection, key: str, value) -> None:
    con.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, json.dumps(value, ensure_ascii=False)),
    )


def is_imported(con: sqlite3.Connection) -> bool:
    return con.execute("SELECT COUNT(*) FROM items").fetchone()[0] > 0
