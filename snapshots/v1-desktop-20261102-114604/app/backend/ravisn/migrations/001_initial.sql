-- Ravisn schema v1.
-- Public tables: countries, statuses, settings, policy_*, items, item_price_tiers.
-- Private tables: suppliers, offers, offer_cost_tiers, offer_source_rows, import_values.
-- Customer exports read only the public_* views.

CREATE TABLE countries (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prefix TEXT NOT NULL UNIQUE,
    currency TEXT NOT NULL,
    symbol TEXT NOT NULL,
    markup_bp INTEGER NOT NULL DEFAULT 500 CHECK (markup_bp BETWEEN 0 AND 10000),
    min_margin_minor INTEGER NOT NULL DEFAULT 100 CHECK (min_margin_minor >= 0),
    sort INTEGER NOT NULL,
    stock_text TEXT NOT NULL,
    currency_text TEXT NOT NULL,
    how_to_order TEXT NOT NULL
) STRICT;

CREATE TABLE statuses (
    name TEXT PRIMARY KEY,
    availability TEXT NOT NULL CHECK (availability IN ('available', 'pending', 'unavailable')),
    definition TEXT NOT NULL,
    sort INTEGER NOT NULL
) STRICT;

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
) STRICT;

CREATE TABLE policy_sections (
    id INTEGER PRIMARY KEY,
    country TEXT NOT NULL REFERENCES countries(key),
    sort INTEGER NOT NULL,
    heading TEXT NOT NULL
) STRICT;

CREATE TABLE policy_items (
    id INTEGER PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES policy_sections(id) ON DELETE CASCADE,
    sort INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    generated TEXT
) STRICT;

CREATE TABLE suppliers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone TEXT,
    whatsapp_link TEXT,
    other_numbers TEXT,
    emails TEXT,
    whatsapp_groups TEXT,
    shown_in_sheet TEXT,
    note TEXT,
    verified_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
) STRICT;

-- Every code ever issued. Rows can never be changed or deleted, so a code is never reused.
CREATE TABLE code_registry (
    code TEXT PRIMARY KEY,
    country TEXT NOT NULL REFERENCES countries(key),
    seq INTEGER NOT NULL CHECK (seq > 0),
    issued_at TEXT NOT NULL,
    UNIQUE (country, seq)
) STRICT;

CREATE TRIGGER code_registry_no_delete BEFORE DELETE ON code_registry
BEGIN SELECT RAISE(ABORT, 'Product codes are permanent and cannot be deleted'); END;

CREATE TRIGGER code_registry_no_update BEFORE UPDATE ON code_registry
BEGIN SELECT RAISE(ABORT, 'Product codes are permanent and cannot be changed'); END;

CREATE TABLE items (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE REFERENCES code_registry(code),
    country TEXT NOT NULL REFERENCES countries(key),
    seq INTEGER NOT NULL,
    name TEXT NOT NULL,
    variant TEXT,
    category TEXT NOT NULL,
    status TEXT NOT NULL REFERENCES statuses(name),
    qty INTEGER CHECK (qty IS NULL OR qty >= 0),
    qty_basis TEXT NOT NULL CHECK (qty_basis IN ('reported', 'minimum', 'confirmed')),
    qty_confirmed_at TEXT,
    price_minor INTEGER CHECK (price_minor IS NULL OR price_minor >= 0),
    price_mode TEXT NOT NULL CHECK (price_mode IN ('rule', 'imported', 'override')),
    price_note TEXT,
    link TEXT,
    link_label TEXT,
    more_link TEXT,
    more_link_label TEXT,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX items_country_seq ON items(country, seq);

CREATE TRIGGER items_no_delete BEFORE DELETE ON items
BEGIN SELECT RAISE(ABORT, 'Products are archived, never deleted'); END;

CREATE TABLE item_price_tiers (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id),
    sort INTEGER NOT NULL,
    label TEXT NOT NULL,
    price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
    UNIQUE (item_id, label)
) STRICT;

CREATE TABLE offers (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL UNIQUE REFERENCES items(id),
    supplier_id INTEGER REFERENCES suppliers(id),
    cost_minor INTEGER CHECK (cost_minor IS NULL OR cost_minor >= 0),
    item_ref TEXT,
    supplier_sku TEXT,
    source_tab TEXT,
    source_row INTEGER,
    source_link TEXT,
    source_link_label TEXT,
    note TEXT,
    updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX offers_supplier ON offers(supplier_id);

CREATE TABLE offer_cost_tiers (
    id INTEGER PRIMARY KEY,
    offer_id INTEGER NOT NULL REFERENCES offers(id),
    sort INTEGER NOT NULL,
    label TEXT NOT NULL,
    cost_minor INTEGER NOT NULL CHECK (cost_minor >= 0),
    UNIQUE (offer_id, label)
) STRICT;

CREATE TABLE offer_source_rows (
    offer_id INTEGER PRIMARY KEY REFERENCES offers(id),
    data TEXT NOT NULL
) STRICT;

CREATE TABLE import_batches (
    id INTEGER PRIMARY KEY,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    source_dir TEXT NOT NULL,
    files TEXT NOT NULL,
    report TEXT
) STRICT;

-- Original values exactly as read from the workbooks, for traceability.
CREATE TABLE import_values (
    item_id INTEGER PRIMARY KEY REFERENCES items(id),
    batch_id INTEGER NOT NULL REFERENCES import_batches(id),
    catalogue_row INTEGER NOT NULL,
    master_row INTEGER NOT NULL,
    public_json TEXT NOT NULL,
    private_json TEXT NOT NULL
) STRICT;

CREATE TABLE issues (
    id INTEGER PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('blocker', 'warning', 'info')),
    country TEXT,
    item_id INTEGER REFERENCES items(id),
    supplier_id INTEGER REFERENCES suppliers(id),
    group_key TEXT,
    detail TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved', 'dismissed')),
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX issues_kind_state ON issues(kind, state);
CREATE INDEX issues_item ON issues(item_id);

-- A user decision that a match found by the leak check is not supplier information.
CREATE TABLE leak_allowances (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id),
    field TEXT NOT NULL,
    match_hash TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (item_id, field, match_hash)
) STRICT;

CREATE TABLE audit (
    id INTEGER PRIMARY KEY,
    at TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id INTEGER,
    action TEXT NOT NULL,
    changes TEXT NOT NULL,
    note TEXT
) STRICT;

CREATE INDEX audit_entity ON audit(entity, entity_id);

CREATE TABLE exports (
    id INTEGER PRIMARY KEY,
    at TEXT NOT NULL,
    kind TEXT NOT NULL,
    country TEXT,
    path TEXT NOT NULL,
    rows INTEGER NOT NULL,
    excluded INTEGER NOT NULL,
    report TEXT NOT NULL
) STRICT;

CREATE VIEW public_catalogue AS
SELECT i.id, i.code, i.country, i.seq, i.name, i.variant, i.category, i.status,
       s.availability, s.sort AS status_sort, i.qty, i.qty_basis, i.price_minor,
       i.link, i.link_label, i.more_link, i.more_link_label
FROM items i
JOIN statuses s ON s.name = i.status
WHERE i.archived = 0;

CREATE VIEW public_price_tiers AS
SELECT t.item_id, t.sort, t.label, t.price_minor
FROM item_price_tiers t
JOIN items i ON i.id = t.item_id
WHERE i.archived = 0;
