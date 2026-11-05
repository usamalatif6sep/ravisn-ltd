"""Tests run against a throwaway data folder. The real data folder is never touched."""

import os
import shutil
import sqlite3
import tempfile
from pathlib import Path

os.environ["RAVISN_DATA"] = tempfile.mkdtemp(prefix="ravisn-test-")

import pytest  # noqa: E402

from ravisn import config, db  # noqa: E402
from ravisn.importer import run_import  # noqa: E402

SOURCE = config.DEFAULT_SOURCE_DIR


@pytest.fixture(scope="session")
def imported():
    """Import the real workbooks once into the test data folder."""
    if not all((SOURCE / n).exists() for n in config.SOURCE_FILES.values()):
        pytest.skip("source workbooks not available")
    config.ensure_dirs()
    con = db.connect()
    db.migrate(con)
    report = run_import(con, SOURCE)
    con.close()
    yield {"report": report, "db": config.DB_PATH}


@pytest.fixture()
def con(imported, tmp_path, monkeypatch):
    """A private copy of the imported database for tests that change data."""
    path = tmp_path / "ravisn.db"
    src = sqlite3.connect(imported["db"])
    dest = sqlite3.connect(path)
    src.backup(dest)
    src.close()
    dest.close()
    monkeypatch.setattr(config, "DB_PATH", path)
    for name in ("BACKUP_DIR", "CUSTOMER_EXPORT_DIR", "PRIVATE_EXPORT_DIR", "UPLOAD_DIR"):
        d = tmp_path / name.lower()
        d.mkdir()
        monkeypatch.setattr(config, name, d)
    monkeypatch.setattr(config, "EXPORT_DIR", tmp_path)
    c = db.connect(path)
    yield c
    c.close()


def pytest_sessionfinish(session, exitstatus):
    data = Path(os.environ["RAVISN_DATA"])
    for p in data.rglob("*"):
        if p.is_file():
            p.chmod(0o666)
    shutil.rmtree(data, ignore_errors=True)
