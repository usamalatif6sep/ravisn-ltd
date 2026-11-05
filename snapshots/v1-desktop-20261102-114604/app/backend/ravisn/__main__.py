"""Start Ravisn: one double-click opens the app, starting the local server if it is not already running.

    pythonw -m ravisn                  start (or reuse) the server and open the app window
    python -m ravisn --import [DIR]    first-time import of the six workbooks
    python -m ravisn --serve           run the server without opening a window
"""

import argparse
import json
import logging
import os
import socket
import subprocess
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


def _free_port(preferred: int) -> int:
    for port in [preferred] + list(range(preferred + 1, preferred + 20)):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((config.HOST, port))
                return port
            except OSError:
                continue
    raise RuntimeError("No free local port for Ravisn")


def open_window(url: str) -> None:
    candidates = [
        Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Microsoft/Edge/Application/msedge.exe",
    ]
    for edge in candidates:
        if edge.exists():
            subprocess.Popen([str(edge), f"--app={url}", "--window-size=1480,940"], creationflags=getattr(subprocess, "DETACHED_PROCESS", 0))
            return
    webbrowser.open(url)


def serve(open_browser: bool) -> None:
    import uvicorn

    from .api import create_app

    config.ensure_dirs()
    con = db.connect()
    db.migrate(con, before_apply=lambda: backup.backup_now(con, "pre-migration"))
    if not db.is_imported(con) and all((config.DEFAULT_SOURCE_DIR / n).exists() for n in config.SOURCE_FILES.values()):
        from .importer import run_import
        logging.info("First run: importing workbooks from %s", config.DEFAULT_SOURCE_DIR)
        run_import(con, config.DEFAULT_SOURCE_DIR)
        backup.backup_now(con, "import")
    con.close()

    port = _free_port(config.PORT)
    app = create_app(port=port)
    server = uvicorn.Server(uvicorn.Config(app, host=config.HOST, port=port, log_config=None, access_log=False))
    app.state.server = server
    config.SERVER_STATE.write_text(json.dumps({"port": port, "pid": os.getpid()}))
    auto = backup.AutoBackup(db.connect)
    auto.start()
    url = f"http://{config.HOST}:{port}/"
    if open_browser:
        def _open_when_ready():
            for _ in range(100):
                if server.started:
                    open_window(url)
                    return
                time.sleep(0.1)
        threading.Thread(target=_open_when_ready, daemon=True).start()
    logging.info("Ravisn listening on %s", url)
    try:
        server.run()
    finally:
        auto.stop.set()
        config.SERVER_STATE.unlink(missing_ok=True)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="ravisn")
    p.add_argument("--import", dest="import_dir", nargs="?", const=str(config.DEFAULT_SOURCE_DIR), help="import the six workbooks from this folder")
    p.add_argument("--serve", action="store_true", help="run without opening a window")
    args = p.parse_args(argv)
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
        open_window(f"http://{config.HOST}:{port}/")
        return 0
    serve(open_browser=not args.serve)
    return 0


if __name__ == "__main__":
    sys.exit(main())
