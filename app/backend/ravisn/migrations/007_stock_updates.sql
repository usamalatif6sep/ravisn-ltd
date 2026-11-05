-- v7: supplier stock updates. Each upload is previewed against the catalogue and applied only when the owner says so.

CREATE TABLE stock_updates (
    id INTEGER PRIMARY KEY,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    country TEXT NOT NULL REFERENCES countries(key),
    source TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'applied', 'discarded')),
    summary TEXT NOT NULL,
    rows TEXT NOT NULL,
    applied_at TEXT,
    result TEXT
) STRICT;
CREATE INDEX stock_updates_supplier ON stock_updates(supplier_id, created_at);
