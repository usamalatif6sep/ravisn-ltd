"""Country-aware delivery addresses and international phone numbers for reseller orders.

Each country says what its regions and postcodes look like, so the website can show the right fields and the
server can check them. Countries without a rule here still work: their postcode and region are optional.
"""

import re

US_STATES = [
    ("AL", "Alabama"), ("AK", "Alaska"), ("AZ", "Arizona"), ("AR", "Arkansas"), ("CA", "California"), ("CO", "Colorado"),
    ("CT", "Connecticut"), ("DE", "Delaware"), ("DC", "District of Columbia"), ("FL", "Florida"), ("GA", "Georgia"), ("HI", "Hawaii"),
    ("ID", "Idaho"), ("IL", "Illinois"), ("IN", "Indiana"), ("IA", "Iowa"), ("KS", "Kansas"), ("KY", "Kentucky"), ("LA", "Louisiana"),
    ("ME", "Maine"), ("MD", "Maryland"), ("MA", "Massachusetts"), ("MI", "Michigan"), ("MN", "Minnesota"), ("MS", "Mississippi"),
    ("MO", "Missouri"), ("MT", "Montana"), ("NE", "Nebraska"), ("NV", "Nevada"), ("NH", "New Hampshire"), ("NJ", "New Jersey"),
    ("NM", "New Mexico"), ("NY", "New York"), ("NC", "North Carolina"), ("ND", "North Dakota"), ("OH", "Ohio"), ("OK", "Oklahoma"),
    ("OR", "Oregon"), ("PA", "Pennsylvania"), ("PR", "Puerto Rico"), ("RI", "Rhode Island"), ("SC", "South Carolina"),
    ("SD", "South Dakota"), ("TN", "Tennessee"), ("TX", "Texas"), ("UT", "Utah"), ("VT", "Vermont"), ("VA", "Virginia"),
    ("WA", "Washington"), ("WV", "West Virginia"), ("WI", "Wisconsin"), ("WY", "Wyoming"),
]
CA_PROVINCES = [
    ("AB", "Alberta"), ("BC", "British Columbia"), ("MB", "Manitoba"), ("NB", "New Brunswick"), ("NL", "Newfoundland and Labrador"),
    ("NS", "Nova Scotia"), ("NT", "Northwest Territories"), ("NU", "Nunavut"), ("ON", "Ontario"), ("PE", "Prince Edward Island"),
    ("QC", "Quebec"), ("SK", "Saskatchewan"), ("YT", "Yukon"),
]
AU_STATES = [
    ("ACT", "Australian Capital Territory"), ("NSW", "New South Wales"), ("NT", "Northern Territory"), ("QLD", "Queensland"),
    ("SA", "South Australia"), ("TAS", "Tasmania"), ("VIC", "Victoria"), ("WA", "Western Australia"),
]

# code, name, calling code, postcode pattern (None = no postcodes), postcode label and example, region label, regions, region required
_C = [
    ("GB", "United Kingdom", "44", r"(GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})", "Postcode", "SW1A 1AA", "County", None, False),
    ("US", "United States", "1", r"\d{5}(-\d{4})?", "ZIP code", "10001", "State", US_STATES, True),
    ("CA", "Canada", "1", r"[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d", "Postal code", "K1A 0B1", "Province or territory", CA_PROVINCES, True),
    ("DE", "Germany", "49", r"\d{5}", "Postleitzahl (postcode)", "10115", "State", None, False),
    ("AU", "Australia", "61", r"\d{4}", "Postcode", "2000", "State or territory", AU_STATES, True),
    ("IE", "Ireland", "353", r"([AC-FHKNPRTV-Y]\d{2}|D6W) ?[0-9AC-FHKNPRTV-Y]{4}", "Eircode", "D02 X285", "County", None, False),
    ("FR", "France", "33", r"\d{5}", "Code postal", "75001", "Region", None, False),
    ("NL", "Netherlands", "31", r"\d{4} ?[A-Z]{2}", "Postcode", "1012 AB", "Province", None, False),
    ("BE", "Belgium", "32", r"\d{4}", "Postcode", "1000", "Province", None, False),
    ("ES", "Spain", "34", r"\d{5}", "Codigo postal", "28001", "Province", None, False),
    ("IT", "Italy", "39", r"\d{5}", "CAP", "00184", "Province", None, False),
    ("AT", "Austria", "43", r"\d{4}", "Postcode", "1010", "State", None, False),
    ("CH", "Switzerland", "41", r"\d{4}", "Postcode", "8001", "Canton", None, False),
    ("SE", "Sweden", "46", r"\d{3} ?\d{2}", "Postcode", "111 22", "County", None, False),
    ("DK", "Denmark", "45", r"\d{4}", "Postcode", "1050", "Region", None, False),
    ("NO", "Norway", "47", r"\d{4}", "Postcode", "0150", "County", None, False),
    ("PL", "Poland", "48", r"\d{2}-\d{3}", "Postcode", "00-001", "Voivodeship", None, False),
    ("PT", "Portugal", "351", r"\d{4}-\d{3}", "Postcode", "1000-001", "District", None, False),
    ("NZ", "New Zealand", "64", r"\d{4}", "Postcode", "6011", "Region", None, False),
    ("AE", "United Arab Emirates", "971", None, "", "", "Emirate", None, False),
    ("SA", "Saudi Arabia", "966", r"\d{5}(-\d{4})?", "Postal code", "11564", "Province", None, False),
    ("PK", "Pakistan", "92", r"\d{5}", "Postal code", "54000", "Province", None, False),
    ("IN", "India", "91", r"\d{6}", "PIN code", "110001", "State", None, False),
    ("SG", "Singapore", "65", r"\d{6}", "Postal code", "018989", "", None, False),
    ("MY", "Malaysia", "60", r"\d{5}", "Postcode", "50088", "State", None, False),
    ("ZA", "South Africa", "27", r"\d{4}", "Postal code", "8001", "Province", None, False),
]
COUNTRIES = {c[0]: {"code": c[0], "name": c[1], "dial": c[2], "postcode": c[3], "postcode_label": c[4], "postcode_example": c[5],
                    "region_label": c[6], "regions": [{"code": a, "name": b} for a, b in (c[7] or [])], "region_required": c[8]} for c in _C}
# Catalogue country -> the delivery country it ships to by default
CATALOGUE_DELIVERY = {"UK": "GB", "USA": "US", "Canada": "CA", "Germany": "DE", "Australia": "AU"}
DIALS = sorted({c["dial"] for c in COUNTRIES.values()}, key=lambda d: (len(d), d))


def public_rules() -> list[dict]:
    """What the website needs to draw the address form (no patterns that only the server checks)."""
    return [{k: v for k, v in c.items() if k != "postcode"} | {"has_postcode": c["postcode"] is not None} for c in COUNTRIES.values()]


def normalise_postcode(country: str, value: str) -> str:
    v = re.sub(r"\s+", " ", (value or "").strip().upper())
    if country in ("GB", "CA") and " " not in v and len(v) > 3:
        v = f"{v[:-3]} {v[-3:]}"
    return v


def check_postcode(country: str, value: str) -> str | None:
    """Returns an error message, or None when the postcode is fine for that country."""
    rule = COUNTRIES.get(country)
    v = normalise_postcode(country, value)
    if rule is None:
        return None if len(v) <= 12 else "Enter a shorter postcode"
    if rule["postcode"] is None:
        return None
    if not v:
        return f"Enter the {rule['postcode_label'].lower()}"
    if not re.fullmatch(rule["postcode"], v):
        return f"Enter a valid {rule['postcode_label'].lower()}, for example {rule['postcode_example']}"
    return None


def check_region(country: str, value: str) -> str | None:
    rule = COUNTRIES.get(country)
    v = (value or "").strip()
    if rule is None:
        return None
    if rule["regions"]:
        if not v:
            return f"Choose the {rule['region_label'].lower()}" if rule["region_required"] else None
        if v.upper() not in {r["code"] for r in rule["regions"]}:
            return f"Choose the {rule['region_label'].lower()} from the list"
    elif rule["region_required"] and not v:
        return f"Enter the {rule['region_label'].lower()}"
    return None


def normalise_phone(dial: str, number: str) -> tuple[str | None, str | None]:
    """(+E.164 number, error). The national number may be typed with spaces, dashes or a leading 0."""
    d = re.sub(r"\D", "", dial or "")
    raw = (number or "").strip()
    if raw.startswith("+"):
        digits = re.sub(r"\D", "", raw)
        if not d or not digits.startswith(d):
            return None, "Choose the country code that matches the number, or type the number without the + prefix"
        national = digits[len(d):]
    else:
        national = re.sub(r"\D", "", raw)
        if d != "39":  # Italy keeps its leading 0
            national = national.lstrip("0")
    if d not in DIALS and not (1 <= len(d) <= 3):
        return None, "Choose a country code"
    total = len(d) + len(national)
    if not national or total < 8 or total > 15:
        return None, "Enter a complete phone number"
    return f"+{d}{national}", None
