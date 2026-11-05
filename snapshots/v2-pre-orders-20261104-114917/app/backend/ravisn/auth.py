"""Admin authentication: one owner password (scrypt), server-side sessions, CSRF tokens and login throttling."""

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request

from . import db

COOKIE = "ravisn_admin"
SESSION_HOURS = 12
MIN_PASSWORD = 12
MAX_FAILURES = 5
LOCK_MINUTES = 10


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**15, r=8, p=1, maxmem=64 * 1024 * 1024, dklen=32)
    return f"scrypt$32768$8$1${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, digest = stored.split("$")
        if algo != "scrypt":
            return False
        calc = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p), maxmem=64 * 1024 * 1024, dklen=32)
        return hmac.compare_digest(calc.hex(), digest)
    except (ValueError, TypeError):
        return False


def check_strength(password: str) -> None:
    if not isinstance(password, str) or len(password) < MIN_PASSWORD:
        raise ValueError(f"Use at least {MIN_PASSWORD} characters")
    if password.lower() in ("ravisnltd123", "passwordpassword", "123456789012") or len(set(password)) < 5:
        raise ValueError("Choose a less predictable password")


def is_configured(con) -> bool:
    return con.execute("SELECT 1 FROM admin_auth WHERE id = 1").fetchone() is not None


def set_password(con, password: str) -> None:
    check_strength(password)
    ts = db.now()
    with con:
        con.execute(
            "INSERT INTO admin_auth (id, password_hash, created_at, updated_at) VALUES (1, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at",
            (hash_password(password), ts, ts),
        )
        con.execute("DELETE FROM admin_sessions")
        db.audit(con, "admin", None, "password", {"password": ["", "changed"]})


def locked_for(con) -> int:
    """Seconds until another login attempt is allowed (0 = allowed)."""
    since = _iso(_now() - timedelta(minutes=LOCK_MINUTES))
    rows = con.execute("SELECT at, ok FROM login_attempts WHERE at >= ? ORDER BY id DESC", (since,)).fetchall()
    failures = 0
    for r in rows:
        if r["ok"]:
            break
        failures += 1
    if failures < MAX_FAILURES:
        return 0
    last = datetime.strptime(rows[0]["at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return max(0, int((last + timedelta(minutes=LOCK_MINUTES) - _now()).total_seconds()))


def login(con, password: str) -> tuple[str, str] | None:
    row = con.execute("SELECT password_hash FROM admin_auth WHERE id = 1").fetchone()
    ok = bool(row) and verify_password(password or "", row["password_hash"])
    with con:
        con.execute("INSERT INTO login_attempts (at, ok) VALUES (?, ?)", (db.now(), 1 if ok else 0))
        con.execute("DELETE FROM login_attempts WHERE at < ?", (_iso(_now() - timedelta(days=30)),))
    return create_session(con) if ok else None


def create_session(con) -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(24)
    now = _now()
    with con:
        con.execute("DELETE FROM admin_sessions WHERE expires_at < ?", (_iso(now),))
        con.execute(
            "INSERT INTO admin_sessions (token_hash, csrf, created_at, expires_at, last_seen) VALUES (?, ?, ?, ?, ?)",
            (hashlib.sha256(token.encode()).hexdigest(), csrf, _iso(now), _iso(now + timedelta(hours=SESSION_HOURS)), _iso(now)),
        )
    return token, csrf


def session_for(con, token: str | None):
    if not token:
        return None
    row = con.execute("SELECT * FROM admin_sessions WHERE token_hash = ?", (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
    if row is None or row["expires_at"] < _iso(_now()):
        return None
    now = _now()
    if row["last_seen"] < _iso(now - timedelta(minutes=5)):
        with con:
            con.execute("UPDATE admin_sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?",
                        (_iso(now), _iso(now + timedelta(hours=SESSION_HOURS)), row["token_hash"]))
    return row


def logout(con, token: str | None) -> None:
    if token:
        with con:
            con.execute("DELETE FROM admin_sessions WHERE token_hash = ?", (hashlib.sha256(token.encode()).hexdigest(),))


def require_admin(request: Request):
    """FastAPI dependency for every /api/admin route: a valid session, plus the CSRF token on any change."""
    con = db.connect()
    try:
        session = session_for(con, request.cookies.get(COOKIE))
    finally:
        con.close()
    if session is None:
        raise HTTPException(status_code=401, detail="Please sign in")
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if not hmac.compare_digest(request.headers.get("x-ravisn-csrf", ""), session["csrf"]):
            raise HTTPException(status_code=403, detail="Missing or invalid security token. Reload the page.")
    return session
