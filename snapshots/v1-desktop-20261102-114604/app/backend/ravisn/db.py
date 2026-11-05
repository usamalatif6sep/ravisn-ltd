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
    return [p.stem for p in pending]


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
