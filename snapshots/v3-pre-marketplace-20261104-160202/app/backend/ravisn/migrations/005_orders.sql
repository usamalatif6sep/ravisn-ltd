-- v5: private side of reseller orders. The orders themselves live in storefront.db; supplier assignment, cost
-- snapshots and internal notes stay here, in the private database, and are never sent to the website.

CREATE TABLE order_private (
    order_number TEXT PRIMARY KEY,
    notes TEXT,
    updated_at TEXT NOT NULL
) STRICT;

-- A photo of a similar item, shown only with an "Illustrative image" label, never as the actual product.
ALTER TABLE item_images ADD COLUMN illustrative INTEGER NOT NULL DEFAULT 0;
DROP VIEW public_images;
CREATE VIEW public_images AS
SELECT g.item_id, g.sort, g.url, g.file, g.illustrative
FROM item_images g
JOIN items i ON i.id = g.item_id
WHERE g.status IN ('verified', 'approved') AND i.archived = 0;

CREATE TABLE order_line_costs (
    order_number TEXT NOT NULL,
    line_id INTEGER NOT NULL,
    item_id INTEGER REFERENCES items(id),
    supplier_id INTEGER REFERENCES suppliers(id),
    cost_minor INTEGER,
    captured_at TEXT NOT NULL,
    PRIMARY KEY (order_number, line_id)
) STRICT;
