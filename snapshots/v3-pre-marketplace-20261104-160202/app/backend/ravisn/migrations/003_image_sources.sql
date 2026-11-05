-- v3: more image sources (a reference link that is itself an eBay photo; bulk uploads).
-- SQLite cannot change a CHECK constraint in place, so the table is rebuilt.

DROP VIEW public_images;

CREATE TABLE item_images_new (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id),
    sort INTEGER NOT NULL DEFAULT 1,
    url TEXT,
    file TEXT,
    source TEXT NOT NULL CHECK (source IN ('ebay_api', 'reference_image', 'manual_upload', 'bulk_upload')),
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

INSERT INTO item_images_new SELECT * FROM item_images;
DROP TABLE item_images;
ALTER TABLE item_images_new RENAME TO item_images;
CREATE INDEX item_images_item ON item_images(item_id, status);

CREATE VIEW public_images AS
SELECT g.item_id, g.sort, g.url, g.file
FROM item_images g
JOIN items i ON i.id = g.item_id
WHERE g.status IN ('verified', 'approved') AND i.archived = 0;
