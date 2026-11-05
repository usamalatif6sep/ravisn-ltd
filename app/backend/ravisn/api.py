"""Admin HTTP API and admin interface. Listens on 127.0.0.1 only; every /api/admin call needs a signed-in session."""

import json
import os
import re
import subprocess
from pathlib import Path

from fastapi import APIRouter, Body, Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, auth, backup, config, db, exporter, fulfilment, images, issues, orders_admin, publishing, service, stock_updates, storefront
from .money import rule_price
from .reference import STATUS_NAMES


def get_con():
    con = db.connect()
    try:
        yield con
    finally:
        con.close()


def _private(flag) -> bool:
    return str(flag).lower() in ("1", "true", "yes")


def create_app(allowed_hosts: set[str] | None = None, port: int = config.PORT) -> FastAPI:
    app = FastAPI(title="Ravisn admin", version=__version__, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.servers = []
    hosts = allowed_hosts or {f"127.0.0.1:{port}", f"localhost:{port}"}
    origins = {f"http://{h}" for h in hosts}

    @app.middleware("http")
    async def guard(request: Request, call_next):
        if request.headers.get("host", "") not in hosts:
            return PlainTextResponse("Forbidden", status_code=403)
        path = request.url.path
        origin = request.headers.get("origin")
        if path.startswith("/api/") and origin and origin not in origins:
            return JSONResponse({"detail": "Forbidden origin"}, status_code=403)
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        # A route may set a stricter policy (shipping labels are served sandboxed); never loosen it.
        response.headers.setdefault("Content-Security-Policy", (
            "default-src 'self'; img-src 'self' data: https://i.ebayimg.com; style-src 'self' 'unsafe-inline'; font-src 'self'; "
            "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
        ))
        if path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(service.ValidationError)
    async def _validation(_, exc):
        return JSONResponse({"detail": str(exc)}, status_code=422)

    @app.exception_handler(exporter.ExportBlocked)
    async def _blocked(_, exc):
        return JSONResponse({"detail": str(exc), "precheck": exc.precheck}, status_code=409)

    @app.exception_handler(KeyError)
    async def _missing(_, exc):
        return JSONResponse({"detail": "Not found"}, status_code=404)

    @app.exception_handler(images.ImageError)
    async def _image_error(_, exc):
        return JSONResponse({"detail": str(exc)}, status_code=422)

    @app.exception_handler(publishing.PublishError)
    async def _publish_error(_, exc):
        return JSONResponse({"detail": str(exc)}, status_code=409)

    @app.exception_handler(storefront.StoreError)
    async def _store_error(_, exc):
        return JSONResponse({"detail": str(exc), "fields": exc.fields}, status_code=exc.status if exc.status != 404 else 404)

    @app.get("/api/health")
    def health():
        return {"app": "ravisn", "version": __version__}

    # ------------------------------------------------------------ sign-in

    def _set_cookie(response: Response, token: str) -> None:
        response.set_cookie(auth.COOKIE, token, max_age=auth.SESSION_HOURS * 3600, httponly=True, samesite="strict", path="/api")

    @app.get("/api/auth/status")
    def auth_status(request: Request, con=Depends(get_con)):
        session = auth.session_for(con, request.cookies.get(auth.COOKIE))
        return {"configured": auth.is_configured(con), "authenticated": session is not None, "csrf": session["csrf"] if session else None,
                "locked_seconds": auth.locked_for(con)}

    @app.post("/api/auth/setup")
    def auth_setup(response: Response, body: dict = Body(...), con=Depends(get_con)):
        if auth.is_configured(con):
            raise HTTPException(409, "An admin password already exists. Sign in instead.")
        try:
            auth.set_password(con, body.get("password", ""))
        except ValueError as exc:
            raise service.ValidationError(str(exc)) from exc
        token, csrf = auth.create_session(con)
        _set_cookie(response, token)
        return {"authenticated": True, "csrf": csrf}

    @app.post("/api/auth/login")
    def auth_login(response: Response, body: dict = Body(...), con=Depends(get_con)):
        wait = auth.locked_for(con)
        if wait:
            raise HTTPException(429, f"Too many attempts. Try again in {max(1, round(wait / 60))} minutes.")
        result = auth.login(con, str(body.get("password", "")))
        if result is None:
            raise HTTPException(401, "That password is not correct")
        token, csrf = result
        _set_cookie(response, token)
        return {"authenticated": True, "csrf": csrf}

    @app.post("/api/auth/logout")
    def auth_logout(request: Request, response: Response, con=Depends(get_con)):
        auth.logout(con, request.cookies.get(auth.COOKIE))
        response.delete_cookie(auth.COOKIE, path="/api")
        return {"authenticated": False}

    admin = APIRouter(dependencies=[Depends(auth.require_admin)])

    @admin.post("/auth/password")
    def change_password(body: dict = Body(...), con=Depends(get_con)):
        row = con.execute("SELECT password_hash FROM admin_auth WHERE id = 1").fetchone()
        if not row or not auth.verify_password(str(body.get("current", "")), row["password_hash"]):
            raise service.ValidationError("The current password is not correct")
        try:
            auth.set_password(con, body.get("new", ""))
        except ValueError as exc:
            raise service.ValidationError(str(exc)) from exc
        return {"ok": True, "signed_out": True}

    # ------------------------------------------------------------ meta

    @admin.get("/meta")
    def meta(private: str = "0", con=Depends(get_con)):
        countries = []
        for c in con.execute("SELECT * FROM countries ORDER BY sort"):
            n = con.execute("SELECT COUNT(*) FROM items WHERE country = ? AND archived = 0", (c["key"],)).fetchone()[0]
            cats = [r[0] for r in con.execute("SELECT category FROM items WHERE country = ? GROUP BY category ORDER BY COUNT(*) DESC", (c["key"],))]
            countries.append({**dict(c), "count": n, "categories": cats})
        out = {
            "imported": db.is_imported(con),
            "countries": countries,
            "statuses": [dict(s) for s in con.execute("SELECT * FROM statuses ORDER BY sort")],
            "settings": {k: db.get_setting(con, k) for k in ("company", "whatsapp_display", "whatsapp_link", "email")},
            "review": {r["severity"]: r["n"] for r in con.execute("SELECT severity, COUNT(*) n FROM issues WHERE state = 'open' GROUP BY severity")},
            "version": __version__,
            "data_dir": str(config.DATA_DIR),
        }
        if _private(private):
            out["suppliers"] = [dict(s) for s in con.execute("SELECT id, name FROM suppliers ORDER BY name COLLATE NOCASE")]
        return out

    # ------------------------------------------------------------ items

    @admin.get("/items")
    def items(country: str, private: str = "0", archived: str = "0", con=Depends(get_con)):
        return service.list_items(con, country, _private(private), _private(archived))

    @admin.get("/items/{item_id}")
    def item(item_id: int, private: str = "0", con=Depends(get_con)):
        return service.item_detail(con, item_id, _private(private))

    @admin.patch("/items/{item_id}")
    def update(item_id: int, body: dict = Body(...), private: str = "0", con=Depends(get_con)):
        patch = body.get("patch") or {}
        if not _private(private) and set(patch) & set(service.PRIVATE_EDITABLE):
            raise service.ValidationError("Show private data to change supplier details")
        audit_id = service.update_item(con, item_id, patch, body.get("note"))
        return {"audit_id": audit_id, "item": service.item_detail(con, item_id, _private(private))}

    @admin.post("/items")
    def create(body: dict = Body(...), private: str = "0", con=Depends(get_con)):
        country = body.pop("country", None)
        if not con.execute("SELECT 1 FROM countries WHERE key = ?", (country,)).fetchone():
            raise service.ValidationError("Choose a country")
        item_id = service.create_item(con, country, body)
        return service.item_detail(con, item_id, _private(private))

    @admin.post("/items/bulk")
    def bulk(body: dict = Body(...), con=Depends(get_con)):
        ids = [int(i) for i in body.get("ids", [])][:20000]
        n = service.bulk_update(con, ids, body.get("patch") or {}, body.get("note") or "Bulk change")
        return {"changed": n}

    @admin.post("/audit/{audit_id}/undo")
    def undo(audit_id: int, con=Depends(get_con)):
        return {"audit_id": service.undo(con, audit_id)}

    @admin.get("/search")
    def search(q: str, private: str = "0", con=Depends(get_con)):
        return service.search(con, q, _private(private))

    # ------------------------------------------------------------ suppliers (private)

    @admin.get("/suppliers")
    def suppliers(con=Depends(get_con)):
        counts: dict = {}
        for r in con.execute("SELECT o.supplier_id, i.country, COUNT(*) n FROM offers o JOIN items i ON i.id = o.item_id WHERE i.archived = 0 GROUP BY o.supplier_id, i.country"):
            counts.setdefault(r["supplier_id"], {})[r["country"]] = r["n"]
        out = []
        for s in con.execute("SELECT * FROM suppliers ORDER BY name COLLATE NOCASE"):
            d = dict(s)
            d["counts"] = counts.get(s["id"], {})
            d["total"] = sum(d["counts"].values())
            out.append(d)
        return {"suppliers": out, "unmapped": counts.get(None, {})}

    @admin.get("/suppliers/{supplier_id}")
    def supplier(supplier_id: int, con=Depends(get_con)):
        s = con.execute("SELECT * FROM suppliers WHERE id = ?", (supplier_id,)).fetchone()
        if s is None:
            raise KeyError(supplier_id)
        d = dict(s)
        d["issues"] = [dict(i, title=issues.KINDS[i["kind"]][0]) for i in con.execute("SELECT id, kind, severity, detail, state FROM issues WHERE supplier_id = ? AND state = 'open'", (supplier_id,))]
        d["history"] = [dict(h, changes=json.loads(h["changes"])) for h in con.execute("SELECT * FROM audit WHERE entity = 'supplier' AND entity_id = ? ORDER BY id DESC LIMIT 30", (supplier_id,))]
        return d

    SUPPLIER_FIELDS = ("name", "phone", "whatsapp_link", "other_numbers", "emails", "whatsapp_groups", "shown_in_sheet", "note")

    def _supplier_values(body: dict) -> dict:
        vals = {}
        for k in SUPPLIER_FIELDS:
            if k in body:
                v = body[k]
                vals[k] = (re.sub(r"[ \t]+", " ", v).strip() or None) if isinstance(v, str) else None
        if "name" in vals and not vals["name"]:
            raise service.ValidationError("Supplier name cannot be empty")
        if vals.get("phone"):
            digits = re.sub(r"\D", "", vals["phone"])
            if not vals["phone"].startswith("+") or not 8 <= len(digits) <= 15:
                raise service.ValidationError("Write the phone in international format, for example +44 7700 900123")
            if "whatsapp_link" not in body:
                vals["whatsapp_link"] = f"https://wa.me/{digits}"
        if vals.get("whatsapp_link") and not re.match(r"^https://(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)/", vals["whatsapp_link"]):
            raise service.ValidationError("WhatsApp link must start with https://wa.me/")
        if vals.get("emails"):
            for e in re.split(r"[,;\s]+", vals["emails"]):
                if e and not re.match(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$", e):
                    raise service.ValidationError(f"{e} is not a valid email address")
        return vals

    @admin.patch("/suppliers/{supplier_id}")
    def update_supplier(supplier_id: int, body: dict = Body(...), con=Depends(get_con)):
        s = con.execute("SELECT * FROM suppliers WHERE id = ?", (supplier_id,)).fetchone()
        if s is None:
            raise KeyError(supplier_id)
        vals = _supplier_values(body)
        changes = {k: [s[k], v] for k, v in vals.items() if s[k] != v}
        if changes:
            if "phone" in changes or "emails" in changes or "whatsapp_link" in changes:
                changes["verified_at"] = [s["verified_at"], None]
                vals["verified_at"] = None
            with con:
                con.execute(f"UPDATE suppliers SET {', '.join(f'{k} = ?' for k in vals)}, updated_at = ? WHERE id = ?", (*vals.values(), db.now(), supplier_id))
                db.audit(con, "supplier", supplier_id, "update", changes)
            issues.evaluate(con)
        return supplier(supplier_id, con)

    @admin.post("/suppliers")
    def create_supplier(body: dict = Body(...), con=Depends(get_con)):
        vals = _supplier_values(body)
        if not vals.get("name"):
            raise service.ValidationError("Supplier name is required")
        if con.execute("SELECT 1 FROM suppliers WHERE name = ?", (vals["name"],)).fetchone():
            raise service.ValidationError("A supplier with that name already exists")
        ts = db.now()
        with con:
            sid = con.execute(f"INSERT INTO suppliers ({', '.join(vals)}, created_at, updated_at) VALUES ({', '.join('?' * len(vals))}, ?, ?)", (*vals.values(), ts, ts)).lastrowid
            db.audit(con, "supplier", sid, "create", {k: [None, v] for k, v in vals.items()})
        issues.evaluate(con)
        return supplier(sid, con)

    @admin.post("/suppliers/{supplier_id}/verify")
    def verify_supplier(supplier_id: int, body: dict = Body(default={}), con=Depends(get_con)):
        verified = body.get("verified", True)
        ts = db.now() if verified else None
        with con:
            con.execute("UPDATE suppliers SET verified_at = ?, updated_at = ? WHERE id = ?", (ts, db.now(), supplier_id))
            db.audit(con, "supplier", supplier_id, "verify" if verified else "unverify", {"verified_at": [None, ts]})
        issues.evaluate(con)
        return supplier(supplier_id, con)

    # ------------------------------------------------------------ supplier fulfilment and stock updates (private)

    @admin.get("/suppliers/{supplier_id}/fulfilment")
    def get_fulfilment(supplier_id: int, con=Depends(get_con)):
        return fulfilment.get(con, supplier_id)

    @admin.put("/suppliers/{supplier_id}/fulfilment")
    def put_fulfilment(supplier_id: int, body: dict = Body(...), con=Depends(get_con)):
        return fulfilment.save(con, supplier_id, body)

    @admin.get("/suppliers/{supplier_id}/stock-updates")
    def stock_update_history(supplier_id: int, con=Depends(get_con)):
        return stock_updates.history(con, supplier_id)

    @admin.post("/suppliers/{supplier_id}/stock-updates")
    async def stock_update_preview(supplier_id: int, request: Request, con=Depends(get_con)):
        kind = request.headers.get("content-type", "")
        if kind.startswith("multipart/form-data"):
            form = await request.form()
            f = form.get("file")
            if f is None or not hasattr(f, "read"):
                raise service.ValidationError("Choose the supplier's stock file")
            data = await f.read(stock_updates.MAX_BYTES + 1)
            source = f.filename or "upload"
            country, sheet = str(form.get("country") or ""), (str(form.get("sheet") or "") or None)
        else:
            body = await request.json()
            data, source = stock_updates.fetch_google_sheet(str(body.get("url") or ""))
            country, sheet = str(body.get("country") or ""), None
        return stock_updates.preview(con, supplier_id, country, data, source, sheet)

    @admin.get("/stock-updates/{update_id}")
    def stock_update_detail(update_id: int, con=Depends(get_con)):
        return stock_updates.detail(con, update_id)

    @admin.post("/stock-updates/{update_id}/apply")
    def stock_update_apply(update_id: int, body: dict = Body(default={}), con=Depends(get_con)):
        return stock_updates.apply(con, update_id, body)

    @admin.post("/stock-updates/{update_id}/discard")
    def stock_update_discard(update_id: int, con=Depends(get_con)):
        return stock_updates.discard(con, update_id)

    # ------------------------------------------------------------ review

    @admin.get("/review")
    def review(con=Depends(get_con)):
        by_country = {}
        for r in con.execute("SELECT kind, country, COUNT(*) n FROM issues WHERE state = 'open' AND country IS NOT NULL GROUP BY kind, country"):
            by_country.setdefault(r["kind"], {})[r["country"]] = r["n"]
        return [dict(k, by_country=by_country.get(k["kind"], {})) for k in issues.summary(con)]

    @admin.get("/review/issues")
    def review_issues(kind: str, state: str = "open", country: str | None = None, con=Depends(get_con)):
        sql = """SELECT x.id, x.kind, x.severity, x.country, x.item_id, x.supplier_id, x.group_key, x.detail, x.state, x.note, x.updated_at,
                        i.code, i.name, i.status, i.qty, s.name AS supplier_name
                 FROM issues x LEFT JOIN items i ON i.id = x.item_id LEFT JOIN suppliers s ON s.id = x.supplier_id
                 WHERE x.kind = ? AND x.state = ?"""
        args = [kind, state]
        if country:
            sql += " AND x.country = ?"
            args.append(country)
        sql += " ORDER BY x.country, x.group_key, i.seq LIMIT 20000"
        return [dict(r) for r in con.execute(sql, args)]

    @admin.post("/review/issues/{issue_id}")
    def review_action(issue_id: int, body: dict = Body(...), con=Depends(get_con)):
        row = con.execute("SELECT * FROM issues WHERE id = ?", (issue_id,)).fetchone()
        if row is None:
            raise KeyError(issue_id)
        action = body.get("action")
        if action == "dismiss":
            if row["kind"].startswith("leak_"):
                raise service.ValidationError("Supplier information cannot be dismissed. Change the text, or confirm it is not supplier information.")
            with con:
                con.execute("UPDATE issues SET state = 'dismissed', note = ?, updated_at = ? WHERE id = ?", (body.get("note") or None, db.now(), issue_id))
                db.audit(con, "issue", issue_id, "dismiss", {"kind": [row["kind"], row["kind"]]}, body.get("note"))
        elif action == "reopen":
            with con:
                con.execute("UPDATE issues SET state = 'open', note = NULL, updated_at = ? WHERE id = ?", (db.now(), issue_id))
            issues.evaluate(con, [row["country"]] if row["country"] else None)
        elif action == "allow":
            if not row["kind"].startswith("leak_") or not row["item_id"]:
                raise service.ValidationError("Only supplier-information matches can be confirmed this way")
            note = (body.get("note") or "").strip()
            if len(note) < 3:
                raise service.ValidationError("Say why this is not supplier information")
            field, _, h = (row["group_key"] or "").partition(":")
            with con:
                con.execute("INSERT OR IGNORE INTO leak_allowances (item_id, field, match_hash, note, created_at) VALUES (?, ?, ?, ?, ?)", (row["item_id"], field, h, note, db.now()))
                db.audit(con, "issue", issue_id, "allow", {"kind": [row["kind"], row["kind"]]}, note)
            issues.evaluate(con, [row["country"]])
        else:
            raise service.ValidationError("Unknown action")
        return {"ok": True}

    @admin.post("/review/bulk")
    def review_bulk(body: dict = Body(...), con=Depends(get_con)):
        kind, action, country = body.get("kind"), body.get("action"), body.get("country")
        if kind not in issues.KINDS:
            raise service.ValidationError("Unknown issue type")
        sql = "SELECT x.id, x.item_id, i.name, i.qty, st.availability FROM issues x LEFT JOIN items i ON i.id = x.item_id LEFT JOIN statuses st ON st.name = i.status WHERE x.kind = ? AND x.state = 'open'"
        args = [kind]
        if country:
            sql += " AND x.country = ?"
            args.append(country)
        rows = con.execute(sql, args).fetchall()
        if action == "dismiss":
            if kind.startswith("leak_") or issues.KINDS[kind][1] == "blocker":
                raise service.ValidationError("Items that block exports must be handled one by one")
            with con:
                con.executemany("UPDATE issues SET state = 'dismissed', note = ?, updated_at = ? WHERE id = ?", [(body.get("note"), db.now(), r["id"]) for r in rows])
                db.audit(con, "issue", None, "bulk-dismiss", {"kind": [kind, kind], "count": [0, len(rows)]}, body.get("note"))
            return {"changed": len(rows)}
        if action == "zero_out_of_stock" and kind == "status_qty_conflict":
            ids = [r["item_id"] for r in rows if r["availability"] == "unavailable" and (r["qty"] or 0) > 0]
            return {"changed": service.bulk_update(con, ids, {"qty": 0}, "Quantity set to 0 for out-of-stock products")}
        if action == "tidy_names" and kind == "name_spaces":
            changed = 0
            for r in rows:
                if service.update_item(con, r["item_id"], {"name": r["name"]}, "Extra spaces removed from the name", evaluate=False):
                    changed += 1
            issues.evaluate(con)
            return {"changed": changed}
        raise service.ValidationError("That action is not available for this issue type")

    # ------------------------------------------------------------ exports and imports

    @admin.get("/exports/check")
    def export_check(country: str, con=Depends(get_con)):
        return exporter.precheck(con, country)

    @admin.post("/exports/catalogue")
    def export_catalogue(body: dict = Body(...), con=Depends(get_con)):
        return exporter.export_catalogue(con, body["country"], bool(body.get("exclude_blocked")))

    @admin.post("/exports/private-master")
    def export_private(con=Depends(get_con)):
        return exporter.export_private_master(con)

    @admin.post("/exports/stock-sheet")
    def export_stock(body: dict = Body(...), con=Depends(get_con)):
        return exporter.export_stock_sheet(con, body["country"])

    @admin.get("/exports")
    def export_history(con=Depends(get_con)):
        out = []
        for r in con.execute("SELECT * FROM exports ORDER BY id DESC LIMIT 100"):
            d = dict(r)
            d["report"] = json.loads(r["report"])
            d["file"] = Path(r["path"]).name
            d["exists"] = Path(r["path"]).exists()
            out.append(d)
        return out

    @admin.post("/imports/stock-sheet")
    async def upload_stock(file: UploadFile = File(...), con=Depends(get_con)):
        if not (file.filename or "").lower().endswith(".xlsx"):
            raise service.ValidationError("Choose an .xlsx file")
        data = await file.read()
        if len(data) > 50 * 1024 * 1024:
            raise service.ValidationError("That file is too large")
        token = secrets.token_hex(8)
        config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        path = config.UPLOAD_DIR / f"{token}.xlsx"
        path.write_bytes(data)
        try:
            preview = exporter.read_stock_sheet(con, path)
        except ValueError as exc:
            path.unlink(missing_ok=True)
            raise service.ValidationError(str(exc)) from exc
        return {"token": token, "file": file.filename, **preview}

    @admin.post("/imports/stock-sheet/{token}/apply")
    def apply_stock(token: str, con=Depends(get_con)):
        if not re.fullmatch(r"[0-9a-f]{16}", token):
            raise KeyError(token)
        path = config.UPLOAD_DIR / f"{token}.xlsx"
        if not path.exists():
            raise KeyError(token)
        backup.backup_now(con, "pre-update")
        try:
            result = exporter.apply_stock_sheet(con, path)
        except ValueError as exc:
            raise service.ValidationError(str(exc)) from exc
        path.unlink(missing_ok=True)
        return result

    @admin.get("/import/report")
    def import_report(con=Depends(get_con)):
        r = con.execute("SELECT * FROM import_batches ORDER BY id DESC LIMIT 1").fetchone()
        if r is None:
            return None
        return {**dict(r), "files": json.loads(r["files"]), "report": json.loads(r["report"] or "{}")}

    # ------------------------------------------------------------ backups

    @admin.get("/backups")
    def backups():
        return {"backups": backup.list_backups(), "folder": str(config.BACKUP_DIR)}

    @admin.post("/backups")
    def make_backup(con=Depends(get_con)):
        return {"name": backup.backup_now(con, "manual").name}

    @admin.post("/backups/restore")
    def restore(body: dict = Body(...), con=Depends(get_con)):
        try:
            safety = backup.restore(con, body.get("name", ""))
        except ValueError as exc:
            raise service.ValidationError(str(exc)) from exc
        return {"restored": body["name"], "safety_backup": safety.name}

    # ------------------------------------------------------------ settings

    SETTING_KEYS = ("company", "whatsapp_display", "whatsapp_link", "email", "email_link", "cover_note", "policy_intro")

    @admin.get("/settings")
    def settings(con=Depends(get_con)):
        policies = {}
        for sec in con.execute("SELECT * FROM policy_sections ORDER BY country, sort"):
            items_ = [dict(i) for i in con.execute("SELECT id, title, body, generated FROM policy_items WHERE section_id = ? ORDER BY sort", (sec["id"],))]
            policies.setdefault(sec["country"], []).append({"heading": sec["heading"], "items": items_})
        return {
            "settings": {k: db.get_setting(con, k) for k in SETTING_KEYS},
            "countries": [dict(c, how_to_order=json.loads(c["how_to_order"])) for c in con.execute("SELECT * FROM countries ORDER BY sort")],
            "statuses": [dict(s) for s in con.execute("SELECT * FROM statuses ORDER BY sort")],
            "policies": policies,
        }

    @admin.put("/settings")
    def save_settings(body: dict = Body(...), con=Depends(get_con)):
        changes = {}
        with con:
            for k in SETTING_KEYS:
                if k not in body:
                    continue
                v = body[k]
                if not isinstance(v, str) or not v.strip():
                    raise service.ValidationError(f"{k.replace('_', ' ').capitalize()} cannot be empty")
                else:
                    v = v.strip()
                old = db.get_setting(con, k)
                if old != v:
                    changes[k] = [old, v]
                    db.set_setting(con, k, v)
            if changes:
                db.audit(con, "settings", None, "update", changes)
        return settings(con)

    @admin.put("/countries/{key}")
    def save_country(key: str, body: dict = Body(...), con=Depends(get_con)):
        c = con.execute("SELECT * FROM countries WHERE key = ?", (key,)).fetchone()
        if c is None:
            raise KeyError(key)
        vals = {}
        for k in ("stock_text", "currency_text"):
            if k in body:
                if not isinstance(body[k], str) or not body[k].strip():
                    raise service.ValidationError("This text cannot be empty")
                vals[k] = body[k].strip()
        if "how_to_order" in body:
            steps = body["how_to_order"]
            if not isinstance(steps, list) or not steps or not all(isinstance(x, str) and x.strip() for x in steps):
                raise service.ValidationError("Each ordering step needs text")
            vals["how_to_order"] = json.dumps([x.strip() for x in steps], ensure_ascii=False)
        if vals:
            with con:
                con.execute(f"UPDATE countries SET {', '.join(f'{k} = ?' for k in vals)} WHERE key = ?", (*vals.values(), key))
                db.audit(con, "country", None, "update", {k: [c[k], v] for k, v in vals.items()}, key)
        row = con.execute("SELECT * FROM countries WHERE key = ?", (key,)).fetchone()
        return dict(row, how_to_order=json.loads(row["how_to_order"]))

    def _rule_changes(con, key, markup_bp, min_margin):
        out = []
        rows = con.execute("SELECT i.id, i.code, i.price_minor, o.cost_minor FROM items i JOIN offers o ON o.item_id = i.id WHERE i.country = ? AND i.price_mode = 'rule' AND i.archived = 0", (key,)).fetchall()
        tiers = service.tiers_by_item(con, [r["id"] for r in rows])
        for r in rows:
            t = tiers.get(r["id"], {"price": [], "cost": []})
            if t["cost"]:
                new = [rule_price(c["cost_minor"], markup_bp, min_margin) for c in t["cost"]]
                if new != [p["price_minor"] for p in t["price"]]:
                    out.append({"id": r["id"], "code": r["code"]})
            elif r["cost_minor"] is not None and rule_price(r["cost_minor"], markup_bp, min_margin) != r["price_minor"]:
                out.append({"id": r["id"], "code": r["code"], "old": r["price_minor"], "new": rule_price(r["cost_minor"], markup_bp, min_margin)})
        return out

    def _rule_args(body):
        markup = service._int(body.get("markup_bp"), "Markup")
        margin = service._int(body.get("min_margin_minor"), "Minimum margin")
        if markup is None or margin is None or markup > 10000:
            raise service.ValidationError("Enter a markup and a minimum margin")
        return markup, margin

    @admin.post("/countries/{key}/rule-preview")
    def rule_preview(key: str, body: dict = Body(...), con=Depends(get_con)):
        markup, margin = _rule_args(body)
        ch = _rule_changes(con, key, markup, margin)
        return {"changes": len(ch), "sample": ch[:20]}

    @admin.post("/countries/{key}/rule")
    def rule_apply(key: str, body: dict = Body(...), con=Depends(get_con)):
        markup, margin = _rule_args(body)
        c = con.execute("SELECT * FROM countries WHERE key = ?", (key,)).fetchone()
        if c is None:
            raise KeyError(key)
        backup.backup_now(con, "pre-reprice")
        with con:
            con.execute("UPDATE countries SET markup_bp = ?, min_margin_minor = ? WHERE key = ?", (markup, margin, key))
            db.audit(con, "country", None, "pricing-rule", {"markup_bp": [c["markup_bp"], markup], "min_margin_minor": [c["min_margin_minor"], margin]}, key)
        changed = 0
        for ch in _rule_changes(con, key, markup, margin):
            if service.update_item(con, ch["id"], {"price_mode": "rule"}, "Pricing rule changed", evaluate=False):
                changed += 1
        issues.evaluate(con, [key])
        return {"changed": changed}

    @admin.put("/policies/{country}")
    def save_policies(country: str, body: dict = Body(...), con=Depends(get_con)):
        sections = body.get("sections")
        if not isinstance(sections, list) or not sections:
            raise service.ValidationError("Policies need at least one section")
        for s in sections:
            if not (s.get("heading") or "").strip() or not isinstance(s.get("items"), list):
                raise service.ValidationError("Each section needs a heading")
            for it in s["items"]:
                if not (it.get("title") or "").strip() or (not (it.get("body") or "").strip() and it.get("generated") != "status_meanings"):
                    raise service.ValidationError("Each policy needs a title and text")
        old = settings(con)["policies"].get(country)
        with con:
            con.execute("DELETE FROM policy_items WHERE section_id IN (SELECT id FROM policy_sections WHERE country = ?)", (country,))
            con.execute("DELETE FROM policy_sections WHERE country = ?", (country,))
            for si, s in enumerate(sections, start=1):
                sid = con.execute("INSERT INTO policy_sections (country, sort, heading) VALUES (?, ?, ?)", (country, si, s["heading"].strip())).lastrowid
                for ii, it in enumerate(s["items"], start=1):
                    gen = "status_meanings" if it.get("generated") == "status_meanings" else None
                    con.execute("INSERT INTO policy_items (section_id, sort, title, body, generated) VALUES (?, ?, ?, ?, ?)", (sid, ii, it["title"].strip(), (it.get("body") or "").strip(), gen))
            db.audit(con, "policies", None, "update", {"sections": [old, sections]}, country)
        return settings(con)["policies"].get(country)

    @admin.put("/statuses/{name}")
    def save_status(name: str, body: dict = Body(...), con=Depends(get_con)):
        if name not in STATUS_NAMES:
            raise KeyError(name)
        d = (body.get("definition") or "").strip()
        if not d:
            raise service.ValidationError("The definition cannot be empty")
        old = con.execute("SELECT definition FROM statuses WHERE name = ?", (name,)).fetchone()[0]
        with con:
            con.execute("UPDATE statuses SET definition = ? WHERE name = ?", (d, name))
            db.audit(con, "status", None, "update", {"definition": [old, d]}, name)
        return {"name": name, "definition": d}

    # ------------------------------------------------------------ system

    @admin.post("/system/open")
    def open_target(body: dict = Body(...)):
        targets = {"customer": config.CUSTOMER_EXPORT_DIR, "private": config.PRIVATE_EXPORT_DIR, "backups": config.BACKUP_DIR, "data": config.DATA_DIR,
                   "inbox": images.inbox_dir()}
        target = body.get("target")
        if target == "file":
            p = Path(body.get("path", "")).resolve()
            if config.EXPORT_DIR.resolve() not in p.parents or not p.exists():
                raise service.ValidationError("That file is not in the exports folder")
            if body.get("reveal"):
                subprocess.Popen(["explorer", "/select,", str(p)])
            else:
                os.startfile(p)  # noqa: S606 - opens a local export in Excel
            return {"ok": True}
        if target not in targets:
            raise service.ValidationError("Unknown folder")
        targets[target].mkdir(parents=True, exist_ok=True)
        os.startfile(targets[target])  # noqa: S606
        return {"ok": True}

    @admin.post("/system/quit")
    def quit_app():
        for server in app.state.servers:
            server.should_exit = True
        return {"ok": True}

    images.register_routes(admin, get_con)
    publishing.register_routes(admin, get_con)
    orders_admin.register_routes(admin, get_con)
    app.include_router(admin, prefix="/api/admin")

    # ------------------------------------------------------------ interface

    def index_html() -> HTMLResponse:
        index = config.FRONTEND_DIST / "index.html"
        if not index.exists():
            return HTMLResponse("<p>The admin interface has not been built yet.</p>", status_code=503)
        return HTMLResponse(index.read_text(encoding="utf-8"), headers={"Cache-Control": "no-store"})

    assets = config.FRONTEND_DIST / "assets"
    if assets.exists():
        app.mount("/admin/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/admin/images/{name}")
    def admin_image(name: str):
        path = images.local_image(name)
        if path is None:
            raise HTTPException(404)
        return FileResponse(path, headers={"Cache-Control": "private, max-age=86400"})

    @app.get("/admin/favicon.svg")
    def favicon():
        p = config.FRONTEND_DIST / "favicon.svg"
        if not p.exists():
            raise HTTPException(404)
        return FileResponse(p)

    @app.get("/")
    def root():
        return RedirectResponse("/admin/")

    @app.get("/admin")
    def admin_root():
        return RedirectResponse("/admin/")

    @app.get("/admin/{path:path}")
    def admin_spa(path: str):
        return index_html()

    @app.get("/{path:path}")
    def not_found(path: str):
        raise HTTPException(404)

    return app
