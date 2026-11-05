"""Paths and runtime settings.

Code lives in <root>/app, data in <root>/data. RAVISN_DATA overrides the data
folder (used by the tests so they never touch real data).
"""

import os
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[2]          # .../Ravisn/app
INSTALL_ROOT = APP_ROOT.parent                          # .../Ravisn
FRONTEND_DIST = APP_ROOT / "frontend" / "dist"

DATA_DIR = Path(os.environ.get("RAVISN_DATA", INSTALL_ROOT / "data"))
DB_PATH = DATA_DIR / "ravisn.db"
BACKUP_DIR = DATA_DIR / "backups"
EXPORT_DIR = DATA_DIR / "exports"
CUSTOMER_EXPORT_DIR = EXPORT_DIR / "customer"
PRIVATE_EXPORT_DIR = EXPORT_DIR / "private"
ORIGINALS_DIR = DATA_DIR / "originals"
UPLOAD_DIR = DATA_DIR / "uploads"
LOG_DIR = DATA_DIR / "logs"
SERVER_STATE = DATA_DIR / "server.json"
IMAGE_DIR = DATA_DIR / "images"
PUBLIC_DIR = DATA_DIR / "public"
RELEASE_DIR = PUBLIC_DIR / "releases"
SECRETS_FILE = DATA_DIR / "secrets.bin"
PUBLIC_SITE_DIST = APP_ROOT / "public-site" / "dist"
DEPLOY_DIR = APP_ROOT / "deploy"
NODE_EXE = INSTALL_ROOT / "tools" / "node" / "node.exe"

DEFAULT_SOURCE_DIR = Path(r"C:\Users\Hp\Downloads\ravisn project")

HOST = "127.0.0.1"
PORT = int(os.environ.get("RAVISN_PORT", "47321"))
PUBLIC_PORT = int(os.environ.get("RAVISN_PUBLIC_PORT", "47322"))

SOURCE_FILES = {
    "master": "Ravisn_Private_Supplier_Master_DO_NOT_SHARE.xlsx",
    "UK": "Ravisn_Ltd_UK_Catalogue_1.xlsx",
    "USA": "Ravisn_Ltd_USA_Catalogue_1.xlsx",
    "Canada": "Ravisn_Ltd_Canada_Catalogue_1.xlsx",
    "Germany": "Ravisn_Ltd_Germany_Catalogue_1.xlsx",
    "Australia": "Ravisn_Ltd_Australia_Catalogue_1.xlsx",
}


def ensure_dirs() -> None:
    for d in (DATA_DIR, BACKUP_DIR, CUSTOMER_EXPORT_DIR, PRIVATE_EXPORT_DIR, ORIGINALS_DIR, UPLOAD_DIR, LOG_DIR, IMAGE_DIR, RELEASE_DIR):
        d.mkdir(parents=True, exist_ok=True)
