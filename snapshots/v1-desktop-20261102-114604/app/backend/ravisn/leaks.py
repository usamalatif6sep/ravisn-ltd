"""Detects private supplier information in customer-facing text.

Used three times: by the review queue, by the export pre-check, and as a final
gate on every cell of a finished customer workbook before it is saved.
"""

import hashlib
import re

DIGIT_RUN = re.compile(r"\d[\d\s().\-]{6,}\d")
ASIN = re.compile(r"^(b0[a-z0-9]{8}|\d{9}[\dx])$")
WORD_START = re.compile(r"(?<![a-z0-9])[a-z0-9]")


def match_hash(kind: str, token: str) -> str:
    return hashlib.sha256(f"{kind}:{token}".encode()).hexdigest()[:24]


class LeakScanner:
    def __init__(self, con):
        self.names: list[tuple[str, re.Pattern]] = []
        self.phones: set[str] = set()
        self.emails: set[str] = set()
        for s in con.execute("SELECT name, phone, whatsapp_link, other_numbers, emails FROM suppliers"):
            name = (s["name"] or "").strip()
            if len(name) >= 4:
                self.names.append((name, re.compile(r"(?<![A-Za-z0-9])" + re.escape(name) + r"(?![A-Za-z0-9])", re.I)))
            for field in ("phone", "whatsapp_link", "other_numbers"):
                for run in re.findall(r"\d[\d\s().\-]{6,}\d", s[field] or ""):
                    digits = re.sub(r"\D", "", run)
                    if len(digits) >= 8:
                        self.phones.add(digits[-8:])
            for e in re.findall(r"[^\s,;<>]+@[^\s,;<>]+\.[A-Za-z]{2,}", s["emails"] or ""):
                self.emails.add(e.lower())
        # SKUs are looked up by their first four characters: thousands of SKUs, checked against tens of thousands of texts.
        # Amazon ASINs (B0 + 8 characters) are public catalogue numbers that appear in every Amazon link, so they are not secrets.
        self.sku_index: dict[str, list[str]] = {}
        self.sku_display: dict[str, str] = {}
        for (sku,) in con.execute("SELECT DISTINCT supplier_sku FROM offers WHERE supplier_sku IS NOT NULL"):
            sku = sku.strip()
            low = sku.lower()
            if ASIN.match(low):
                continue
            if len(sku) >= 5 and re.search(r"[A-Za-z]", sku) and re.search(r"\d", sku) and low not in self.sku_display:
                self.sku_display[low] = sku
                self.sku_index.setdefault(low[:4], []).append(low)

    def _skus(self, low: str) -> set[str]:
        found = set()
        if not self.sku_index:
            return found
        n = len(low)
        for m in WORD_START.finditer(low):
            i = m.start()
            for s in self.sku_index.get(low[i:i + 4], ()):
                end = i + len(s)
                if low.startswith(s, i) and not (i > 0 and low[i - 1].isalnum()) and not (end < n and low[end].isalnum()):
                    found.add(s)
        return found

    def scan(self, text: str | None) -> list[tuple[str, str, str]]:
        """Return (kind, description, match_hash) for each private match in `text`."""
        if not text:
            return []
        hits = []
        for name, rx in self.names:
            if rx.search(text):
                hits.append(("leak_supplier_name", f"supplier “{name}”", match_hash("name", name.lower())))
        low = text.lower()
        for e in self.emails:
            if e in low:
                hits.append(("leak_supplier_contact", f"supplier email {e}", match_hash("email", e)))
        if self.phones:
            for run in DIGIT_RUN.findall(text):
                digits = re.sub(r"\D", "", run)
                for p in self.phones:
                    if p in digits:
                        hits.append(("leak_supplier_contact", "a supplier phone number", match_hash("phone", p)))
        for s in sorted(self._skus(low)):
            hits.append(("leak_supplier_sku", f"supplier SKU {self.sku_display[s]}", match_hash("sku", s)))
        return hits


def allowances(con) -> set[tuple[int, str, str]]:
    return {(r["item_id"], r["field"], r["match_hash"]) for r in con.execute("SELECT item_id, field, match_hash FROM leak_allowances")}
