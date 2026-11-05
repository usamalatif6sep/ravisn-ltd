-- v2: admin authentication, product images, public website releases.

CREATE TABLE admin_auth (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE admin_sessions (
    token_hash TEXT PRIMARY KEY,
    csrf TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen TEXT NOT NULL
) STRICT;

CREATE TABLE login_attempts (
    id INTEGER PRIMARY KEY,
    at TEXT NOT NULL,
    ok INTEGER NOT NULL CHECK (ok IN (0, 1))
) STRICT;

-- Images shown on the public website. Only 'verified' and 'approved' images are ever published.
CREATE TABLE item_images (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id),
    sort INTEGER NOT NULL DEFAULT 1,
    url TEXT,
    file TEXT,
    source TEXT NOT NULL CHECK (source IN ('ebay_api', 'manual_upload')),
    source_ref TEXT,
    status TEXT NOT NULL CHECK (status IN ('verified', 'needs_review', 'approved', 'rejected')),
    score REAL,
    seen_title TEXT,
    rights TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (url IS NOT NULL OR file IS NOT NULL)
) STRICT;

CREATE INDEX item_images_item ON item_images(item_id, status);

-- Outcome of the last image lookup for each product.
CREATE TABLE image_checks (
    item_id INTEGER PRIMARY KEY REFERENCES items(id),
    state TEXT NOT NULL,
    detail TEXT,
    source_key TEXT,
    checked_at TEXT NOT NULL
) STRICT;

-- Raw marketplace API responses (private, never published), so one listing is fetched once.
CREATE TABLE api_cache (
    source_key TEXT PRIMARY KEY,
    status INTEGER NOT NULL,
    response TEXT NOT NULL,
    fetched_at TEXT NOT NULL
) STRICT;

CREATE TABLE api_usage (
    day TEXT NOT NULL,
    api TEXT NOT NULL,
    calls INTEGER NOT NULL,
    PRIMARY KEY (day, api)
) STRICT;

CREATE TABLE releases (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    folder TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('draft', 'approved', 'superseded', 'published')),
    summary TEXT NOT NULL,
    approved_at TEXT,
    published_at TEXT,
    published_url TEXT
) STRICT;

CREATE VIEW public_images AS
SELECT g.item_id, g.sort, g.url, g.file
FROM item_images g
JOIN items i ON i.id = g.item_id
WHERE g.status IN ('verified', 'approved') AND i.archived = 0;
