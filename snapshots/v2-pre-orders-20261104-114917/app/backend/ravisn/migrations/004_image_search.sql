-- v4: replacement photo search for ended eBay listings.

ALTER TABLE item_images ADD COLUMN confidence TEXT;

-- One row per product: what was searched, what eBay originally said, and why candidates were accepted or rejected.
CREATE TABLE image_search_log (
    item_id INTEGER PRIMARY KEY REFERENCES items(id),
    query TEXT NOT NULL,
    market TEXT NOT NULL,
    original TEXT,
    outcome TEXT NOT NULL CHECK (outcome IN ('candidate_high', 'candidate_medium', 'no_match', 'no_results', 'error')),
    reason TEXT NOT NULL,
    considered INTEGER NOT NULL DEFAULT 0,
    rejected TEXT NOT NULL DEFAULT '[]',
    chosen_title TEXT,
    chosen_listing TEXT,
    searched_at TEXT NOT NULL
) STRICT;
