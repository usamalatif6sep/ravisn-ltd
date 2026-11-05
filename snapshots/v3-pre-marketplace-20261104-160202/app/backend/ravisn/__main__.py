"""Start Ravisn: the private admin panel and the local preview of the public reseller website.

    pythonw -m ravisn                  start both (or reuse a running copy) and open the admin panel in the browser
    python -m ravisn --serve           start without opening a browser
    python -m ravisn --import [DIR]    first-time import of the six workbooks
    python -m ravisn --reset-password  set a new admin password (signs out every session)
"""

import argparse
import asyncio
import getpass
import json
import logging
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

from . import backup, config, db


def _setup_logging() -> None:
    config.LOG_DIR.mkdir(parents=True, exist_ok=True)
    log = open(config.LOG_DIR / "ravisn.log", "a", encoding="utf-8", buffering=1)  # noqa: SIM115
    if sys.stdout is None:
        sys.stdout = log
    if sys.stderr is None:
        sys.stderr = log
    logging.basicConfig(stream=log, level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def _running_port() -> int | None:
    try:
        state = json.loads(config.SERVER_STATE.read_text())
        port = int(state["port"])
        with urllib.request.urlopen(f"http://{config.HOST}:{port}/api/health", timeout=1.5) as r:
            if json.loads(r.read()).get("app") == "ravisn":
                return port
    except Exception:  # noqa: BLE001
        return None
    return None


def _port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((config.HOST, port))
            return True
        except OSError:
            return False


def serve(open_browser: bool) -> None:
    import uvicorn

    from .api import create_app
    from .public_server import create_public_app

    config.ensure_dirs()
    con = db.connect()
    db.migrate(con, before_apply=lambda: backup.backup_now(con, "pre-migration"))
    if not db.is_imported(con) and all((config.DEFAULT_SOURCE_DIR / n).exists() for n in config.SOURCE_FILES.values()):
        from .importer import run_import
        logging.info("First run: importing workbooks from %s", config.DEFAULT_SOURCE_DIR)
        run_import(con, config.DEFAULT_SOURCE_DIR)
        backup.backup_now(con, "import")
    con.close()

    for port in (config.PORT, config.PUBLIC_PORT):
        if not _port_free(port):
            raise SystemExit(f"Port {port} is in use by another program. Close it and start Ravisn again.")
    admin_app = create_app(port=config.PORT)
    public_app = create_public_app(port=config.PUBLIC_PORT)
    admin = uvicorn.Server(uvicorn.Config(admin_app, host=config.HOST, port=config.PORT, log_config=None, access_log=False))
    public = uvicorn.Server(uvicorn.Config(public_app, host=config.HOST, port=config.PUBLIC_PORT, log_config=None, access_log=False))
    admin_app.state.servers = [admin, public]
    config.SERVER_STATE.write_text(json.dumps({"port": config.PORT, "public_port": config.PUBLIC_PORT, "pid": os.getpid()}))
    auto = backup.AutoBackup(db.connect)
    auto.start()
    url = f"http://{config.HOST}:{config.PORT}/admin/"
    if open_browser:
        def _open_when_ready():
            for _ in range(100):
                if admin.started:
                    webbrowser.open(url)
                    return
                time.sleep(0.1)
        threading.Thread(target=_open_when_ready, daemon=True).start()
    logging.info("Admin panel on %s, public preview on http://%s:%s/", url, config.HOST, config.PUBLIC_PORT)

    async def both():
        await asyncio.gather(admin.serve(), public.serve())

    try:
        asyncio.run(both())
    finally:
        auto.stop.set()
        config.SERVER_STATE.unlink(missing_ok=True)


def reset_password() -> int:
    from . import auth

    config.ensure_dirs()
    con = db.connect()
    db.migrate(con)
    print("Set a new Ravisn admin password (at least 12 characters). Every open session will be signed out.")
    first = getpass.getpass("New password: ")
    if first != getpass.getpass("Repeat it: "):
        print("The two passwords do not match. Nothing was changed.")
        return 1
    try:
        auth.set_password(con, first)
    except ValueError as exc:
        print(exc)
        return 1
    print("Password changed.")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="ravisn")
    p.add_argument("--import", dest="import_dir", nargs="?", const=str(config.DEFAULT_SOURCE_DIR), help="import the six workbooks from this folder")
    p.add_argument("--serve", action="store_true", help="run without opening a browser")
    p.add_argument("--reset-password", action="store_true", help="set a new admin password")
    args = p.parse_args(argv)
    if args.reset_password:
        return reset_password()
    if args.import_dir:
        from .importer import run_import
        config.ensure_dirs()
        con = db.connect()
        db.migrate(con)
        report = run_import(con, Path(args.import_dir))
        backup.backup_now(con, "import")
        print(json.dumps({"countries": report["countries"], "checks": report["checks"], "exceptions": len(report["exceptions"])}, indent=2, ensure_ascii=False))
        return 0
    _setup_logging()
    port = _running_port()
    if port and not args.serve:
        webbrowser.open(f"http://{config.HOST}:{port}/admin/")
        return 0
    serve(open_browser=not args.serve)
    return 0


if __name__ == "__main__":
    sys.exit(main())
