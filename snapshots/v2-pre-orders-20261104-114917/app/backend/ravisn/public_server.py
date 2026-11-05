"""Local preview of the public reseller website.

Serves only the files of the release being previewed: no database access, no admin routes, no API.
This is exactly what Cloudflare Pages will serve once a release is published.
"""

import json
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse

from . import config, publishing

CSP = ("default-src 'self'; img-src 'self' https://i.ebayimg.com data:; style-src 'self' 'unsafe-inline'; font-src 'self'; "
       "script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
EMPTY = """<!doctype html><meta charset="utf-8"><title>Ravisn catalogue</title>
<body style="font-family:system-ui;color:#1d1d1f;display:grid;place-items:center;height:90vh;margin:0">
<div style="text-align:center"><h1 style="font-weight:600">No catalogue yet</h1>
<p style="color:#6e6e73">Build a release in the admin panel (Website), then reload this page.</p></div>"""


def create_public_app(allowed_hosts: set[str] | None = None, port: int = config.PUBLIC_PORT, folder_provider=publishing.preview_folder) -> FastAPI:
    app = FastAPI(title="Ravisn catalogue preview", docs_url=None, redoc_url=None, openapi_url=None)
    hosts = allowed_hosts or {f"127.0.0.1:{port}", f"localhost:{port}"}

    @app.middleware("http")
    async def guard(request: Request, call_next):
        if request.headers.get("host", "") not in hosts:
            return PlainTextResponse("Forbidden", status_code=403)
        if request.method not in ("GET", "HEAD"):
            return PlainTextResponse("Method not allowed", status_code=405)
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = CSP
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Robots-Tag"] = "noindex"
        return response

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
