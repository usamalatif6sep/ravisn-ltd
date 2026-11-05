-- v6: permanent Ravisn product references (RVN-UK-10482). Legacy codes (UK-0001) stay as immutable aliases.

ALTER TABLE items ADD COLUMN ref TEXT;
CREATE UNIQUE INDEX items_ref ON items(ref);

-- Every reference ever issued. A reference is never reused, even if its product is removed.
CREATE TABLE ref_registry (
    ref TEXT PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id),
    country TEXT NOT NULL,
    issued_at TEXT NOT NULL
) STRICT;

CREATE TRIGGER items_ref_permanent BEFORE UPDATE OF ref ON items
WHEN OLD.ref IS NOT NULL AND NEW.ref IS NOT OLD.ref
BEGIN SELECT RAISE(ABORT, 'Ravisn product references are permanent'); END;

CREATE TRIGGER items_code_permanent BEFORE UPDATE OF code ON items
WHEN NEW.code IS NOT OLD.code
BEGIN SELECT RAISE(ABORT, 'Legacy product codes are permanent'); END;

DROP VIEW public_catalogue;
CREATE VIEW public_catalogue AS
SELECT i.id, i.code, i.ref, i.country, i.seq, i.name, i.variant, i.category, i.status,
       s.availability, s.sort AS status_sort, i.qty, i.qty_basis, i.price_minor,
       i.link, i.link_label, i.more_link, i.more_link_label, i.created_at
FROM items i
JOIN statuses s ON s.name = i.status
WHERE i.archived = 0;

-- Customer-safe fulfilment facts per supplier (private admin; only verified, customer-safe text is ever published).
CREATE TABLE supplier_fulfilment (
    supplier_id INTEGER PRIMARY KEY REFERENCES suppliers(id),
    stock_update_frequency TEXT,
    last_stock_verified_at TEXT,
    countries_served TEXT,
    dispatch_cutoff TEXT,
    cutoff_timezone TEXT,
    shipping_methods TEXT,
    carriers TEXT,
    label_arrangements TEXT,
    tracking_arrangements TEXT,
    dispatch_estimate TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    verified_at TEXT,
    notes TEXT,
    updated_at TEXT NOT NULL
) STRICT;
