"""Local secret storage (eBay keys, Cloudflare token), encrypted with Windows DPAPI for the current user.

Secrets are entered by the owner in the admin panel, never shown again, never written to the database,
backups, exports or the public website.
"""

import ctypes
import json
import sys
from ctypes import wintypes

from . import config


class _Blob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _crypt(data: bytes, protect: bool) -> bytes:
    if sys.platform != "win32":
        return data  # tests on other platforms; the app itself only runs on Windows
    blob_in = _Blob(len(data), ctypes.cast(ctypes.create_string_buffer(data, len(data)), ctypes.POINTER(ctypes.c_char)))
    blob_out = _Blob()
    fn = ctypes.windll.crypt32.CryptProtectData if protect else ctypes.windll.crypt32.CryptUnprotectData
    if not fn(ctypes.byref(blob_in), None, None, None, None, 0x01, ctypes.byref(blob_out)):
        raise OSError("Windows could not protect the secret")
    try:
        return ctypes.string_at(blob_out.pbData, blob_out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(blob_out.pbData)


def _load() -> dict:
    if not config.SECRETS_FILE.exists():
        return {}
    return json.loads(_crypt(config.SECRETS_FILE.read_bytes(), protect=False).decode())


def get(name: str):
    return _load().get(name)


def put(name: str, value) -> None:
    data = _load()
    if value is None:
        data.pop(name, None)
    else:
        data[name] = value
    config.SECRETS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = config.SECRETS_FILE.with_suffix(".tmp")
    tmp.write_bytes(_crypt(json.dumps(data).encode(), protect=True))
    tmp.replace(config.SECRETS_FILE)


def has(name: str) -> bool:
    return bool(get(name))
