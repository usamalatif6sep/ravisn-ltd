"""Local preview of the public reseller website.

Serves the files of the release being previewed, plus the storefront API under /api/store (orders and chat).
The API reads only the published catalogue files and the separate storefront database: it has no access to the
private catalogue database, so it cannot reveal supplier information. In production the same API runs as a
Cloudflare Pages Worker (app/deploy/worker) behind HTTPS.
"""

import json
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, Response

from . import addressing, config, publishing, storefront

CSP = ("default-src 'self'; img-src 'self' https://i.ebayimg.com data:; style-src 'self' 'unsafe-inline'; font-src 'self'; "
       "script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
EMPTY = """<!doctype html><meta charset="utf-8"><title>Ravisn catalogue</title>
<body style="font-family:system-ui;color:#1d1d1f;display:grid;place-items:center;height:90vh;margin:0">
<div style="text-align:center"><h1 style="font-weight:600">No catalogue yet</h1>
<p style="color:#6e6e73">Build a release in the admin panel (Website), then reload this page.</p></div>"""
MAX_BODY = 64 * 1024


def create_public_app(allowed_hosts: set[str] | None = None, port: int = config.PUBLIC_PORT, folder_provider=publishing.preview_folder,
                      store_path: Path | None = None) -> FastAPI:
    app = FastAPI(title="Ravisn catalogue preview", docs_url=None, redoc_url=None, openapi_url=None)
    hosts = allowed_hosts or {f"127.0.0.1:{port}", f"localhost:{port}"}

    @app.middleware("http")
    async def guard(request: Request, call_next):
        host = request.headers.get("host", "")
        if host not in hosts:
            return PlainTextResponse("Forbidden", status_code=403)
        path = request.url.path
        if request.method not in ("GET", "HEAD"):
            if request.method != "POST" or not path.startswith("/api/store/"):
                return PlainTextResponse("Method not allowed", status_code=405)
            # Only this website may send orders and messages: same origin, JSON, and the site's own header.
            origin = request.headers.get("origin")
            if origin is not None and origin.split("://", 1)[-1] != host:
                return JSONResponse({"error": "Requests must come from the Ravisn website"}, status_code=403)
            label = path.endswith("/label")
            kind = request.headers.get("content-type", "")
            if request.headers.get("x-ravisn-store") != "1" or ("multipart/form-data" if label else "application/json") not in kind:
                return JSONResponse({"error": "Unsupported request"}, status_code=415)
            if int(request.headers.get("content-length") or 0) > (storefront.LABEL_MAX + 64 * 1024 if label else MAX_BODY):
                return JSONResponse({"error": "That request is too large"}, status_code=413)
        response = await call_next(request)
        response.headers.setdefault("Content-Security-Policy", CSP)  # labels keep their stricter sandboxed policy
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["X-Robots-Tag"] = "noindex"
        if path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    def store():
        return storefront.connect(store_path)

    async def body_of(request: Request) -> dict:
        raw = await request.body()
        if len(raw) > MAX_BODY:
            raise storefront.StoreError("That request is too large", status=413)
        try:
            data = json.loads(raw or b"{}")
        except ValueError as exc:
            raise storefront.StoreError("The request could not be read") from exc
        if not isinstance(data, dict):
            raise storefront.StoreError("The request could not be read")
        return data

    def who(con, request: Request) -> str:
        return storefront.client_hash(con, request.client.host if request.client else None)

    @app.exception_handler(storefront.StoreError)
    async def store_error(_request: Request, exc: storefront.StoreError):
        return JSONResponse({"error": str(exc), "fields": exc.fields}, status_code=exc.status)

    @app.get("/api/store/config")
    def store_config():
        con = store()
        try:
            return {"orders": folder_provider() is not None, "chat": True, "team_online": storefront.team_online(con),
                    "countries": addressing.public_rules(), "catalogue_delivery": addressing.CATALOGUE_DELIVERY,
                    "whatsapp": storefront.WHATSAPP, "team_away": storefront.TEAM_AWAY, "retention": storefront.retention(con),
                    "shipping_note": storefront.SHIPPING_NOTE, "label_max": storefront.LABEL_MAX, "ai": False}
        finally:
            con.close()

    @app.post("/api/store/orders")
    async def submit_order(request: Request):
        body = await body_of(request)
        cat = storefront.catalogue(folder_provider())
        if cat is None:
            raise storefront.StoreError("Ordering is not available right now", status=503)
        con = store()
        try:
            if body.get("website"):  # a field people never see: only robots fill it
                raise storefront.StoreError("Your order could not be sent", status=400)
            clean = storefront.validate_order(body, cat)
            w = who(con, request)
            if not (storefront.allow(con, "order", w) and storefront.allow(con, "order_day", w)):
                raise storefront.StoreError("Too many orders from this connection. Please wait a little, or contact us on WhatsApp.", status=429)
            return storefront.create_order(con, clean, request.headers.get("idempotency-key") or body.get("idempotency_key"), w)
        finally:
            con.close()

    @app.get("/api/store/orders/{number}")
    def order_status(number: str, request: Request):
        con = store()
        try:
            return storefront.lookup_order(con, number, request.headers.get("x-order-token"))
        finally:
            con.close()

    @app.post("/api/store/orders/{number}/shipments/{sid}")
    async def shipment_update(number: str, sid: int, request: Request):
        body = await body_of(request)
        con = store()
        try:
            if not storefront.allow(con, "chat_msg", who(con, request)):
                raise storefront.StoreError("Too many changes from this connection. Please wait a moment.", status=429)
            return storefront.reseller_update_shipment(con, number, request.headers.get("x-order-token"), sid, body)
        finally:
            con.close()

    @app.post("/api/store/orders/{number}/shipments/{sid}/label")
    async def label_upload(number: str, sid: int, request: Request):
        form = await request.form()
        file = form.get("file")
        if file is None or not hasattr(file, "read"):
            raise storefront.StoreError("Choose the label file")
        data = await file.read(storefront.LABEL_MAX + 1)
        con = store()
        try:
            if not storefront.allow(con, "chat_msg", who(con, request)):
                raise storefront.StoreError("Too many uploads from this connection. Please wait a moment.", status=429)
            return storefront.upload_label(con, number, request.headers.get("x-order-token"), sid, data, file.filename or "label")
        finally:
            con.close()

    @app.get("/api/store/orders/{number}/shipments/{sid}/label")
    def label_download(number: str, sid: int, request: Request):
        con = store()
        try:
            data, kind, name = storefront.label_file(con, sid, number, request.headers.get("x-order-token"))
        finally:
            con.close()
        return Response(data, media_type=kind, headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store",
                                                        "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox"})

    @app.post("/api/store/chat")
    async def chat_start(request: Request):
        body = await body_of(request)
        con = store()
        try:
            if body.get("website"):
                raise storefront.StoreError("Chat is not available", status=400)
            if not storefront.allow(con, "chat_start", who(con, request)):
                raise storefront.StoreError("Too many chats from this connection. Please try again later.", status=429)
            return storefront.chat_start(con, body.get("page"), who(con, request))
        finally:
            con.close()

    @app.get("/api/store/chat/{cid}")
    def chat_get(cid: str, request: Request, after: int = 0):
        con = store()
        try:
            return storefront.chat_state(con, cid, request.headers.get("x-chat-token"), after)
        finally:
            con.close()

    @app.post("/api/store/chat/{cid}/messages")
    async def chat_message(cid: str, request: Request):
        body = await body_of(request)
        con = store()
        try:
            if not storefront.allow(con, "chat_msg", who(con, request)):
                raise storefront.StoreError("You're sending messages very quickly. Please wait a moment.", status=429)
            return storefront.chat_post(con, cid, request.headers.get("x-chat-token"), body.get("text"), body.get("assistant_reply"))
        finally:
            con.close()

    @app.post("/api/store/chat/{cid}/team")
    async def chat_team(cid: str, request: Request):
        body = await body_of(request)
        con = store()
        try:
            if not storefront.allow(con, "chat_msg", who(con, request)):
                raise storefront.StoreError("You're sending messages very quickly. Please wait a moment.", status=429)
            return storefront.chat_request_team(con, cid, request.headers.get("x-chat-token"), body.get("name"), body.get("contact"), body.get("message"))
        finally:
            con.close()

    @app.get("/{path:path}")
    def serve(path: str):
        root = folder_provider()
        if root is None:
            return HTMLResponse(EMPTY, status_code=503)
        root = Path(root).resolve()
        if path.startswith("api/") or path.startswith("_"):
            return PlainTextResponse("Not found", status_code=404)
        target = (root / path).resolve()
        if root != target and root not in target.parents:
            return PlainTextResponse("Not found", status_code=404)
        if target.is_file():
            cache = "no-cache" if path.startswith("data/") or path.endswith(".html") else "public, max-age=3600"
            return FileResponse(target, headers={"Cache-Control": cache})
        if path.startswith(("data/", "assets/", "img/")) or "." in path.rsplit("/", 1)[-1]:
            return PlainTextResponse("Not found", status_code=404)
        return FileResponse(root / "index.html", headers={"Cache-Control": "no-cache"})

    return app


def release_info() -> dict | None:
    try:
        return json.loads((config.PUBLIC_DIR / "preview.json").read_text())
    except (OSError, ValueError):
        return None
