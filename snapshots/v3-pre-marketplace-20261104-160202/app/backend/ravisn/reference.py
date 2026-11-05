"""Fixed reference data: countries, statuses and their workbook formats."""

COUNTRIES = [
    # key, name, code prefix, currency, display symbol, sort
    ("UK", "United Kingdom", "UK", "GBP", "£", 1),
    ("USA", "United States", "US", "USD", "US$", 2),
    ("Canada", "Canada", "CA", "CAD", "CA$", 3),
    ("Germany", "Germany", "DE", "EUR", "€", 4),
    ("Australia", "Australia", "AU", "AUD", "A$", 5),
]

COUNTRY_KEYS = [c[0] for c in COUNTRIES]

# Excel number formats used in customer exports (USA uses US$ so it cannot be confused with CA$ or A$).
EXCEL_PRICE_FORMAT = {
    "UK": '"£"#,##0.00',
    "USA": '"US$"#,##0.00',
    "Canada": '"CA$"#,##0.00',
    "Germany": '"€"#,##0.00',
    "Australia": '"A$"#,##0.00',
}

# Order and grouping match the drop-down and colour rules in the original catalogues.
STATUSES = [
    ("Available", "available"),
    ("Available with label", "available"),
    ("Available without label", "available"),
    ("Available in bulk", "available"),
    ("Bulk only", "available"),
    ("Available on demand", "pending"),
    ("Available in 10 days", "pending"),
    ("In transit", "pending"),
    ("Out of stock", "unavailable"),
]
STATUS_NAMES = [s[0] for s in STATUSES]

QTY_BASIS = ("reported", "minimum", "confirmed")

# Replaces the original "Live quantities" policy, which described unverified figures as live counts.
QUANTITY_POLICY_TITLE = "Quantities"
QUANTITY_POLICY_BODY = (
    "Quantities shown with + are the minimum available. Other quantities are the latest figures we have "
    "and change during the day. Stock is confirmed on WhatsApp before payment; first confirmed, first served."
)
