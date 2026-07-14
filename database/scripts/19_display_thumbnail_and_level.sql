-- Display thumbnails + the ISA-101 hierarchy level.
--
-- thumbnail_svg: a real preview of the display, generated from the DESIGN-MODE render on publish.
--   Stored as SVG text, not a raster: we render DOM/SVG (no Konva), so this is a serialization rather
--   than a rasterization — no headless browser, no html2canvas, no binary blobs in Postgres.
--   Generated on PUBLISH only (never on autosave), and from the design-mode render, so no process
--   values are ever captured into a thumbnail (a live value in a preview would leak plant data into
--   every screenshot of the display list).
--
-- level: the ISA-101 display hierarchy (Clause 6.3; the L1–L4 naming is Hollifield's High Performance
--   HMI Handbook, which ISA-101 accommodates):
--     1 = Operation overview   2 = Unit control   3 = Unit detail   4 = Support/diagnostic
--   `category` has been doing double duty for this, which is why the launcher cannot present a
--   hierarchy. NULL = unclassified.
--
-- Idempotent: safe on a live DB and on a fresh initdb volume.

ALTER TABLE displays.display_definitions
    ADD COLUMN IF NOT EXISTS thumbnail_svg TEXT,
    ADD COLUMN IF NOT EXISTS thumbnail_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS level         SMALLINT;

ALTER TABLE displays.display_definitions
    DROP CONSTRAINT IF EXISTS chk_display_level;
ALTER TABLE displays.display_definitions
    ADD CONSTRAINT chk_display_level CHECK (level IS NULL OR level BETWEEN 1 AND 4);

COMMENT ON COLUMN displays.display_definitions.level IS
    'ISA-101 display hierarchy: 1=overview, 2=unit control, 3=unit detail, 4=support/diagnostic.';
COMMENT ON COLUMN displays.display_definitions.thumbnail_svg IS
    'Design-mode SVG preview, regenerated on publish. Never contains process values.';

-- Seed a sensible level from the category that has been standing in for it.
UPDATE displays.display_definitions SET level = 1 WHERE level IS NULL AND category = 'overview';
UPDATE displays.display_definitions SET level = 3 WHERE level IS NULL AND category = 'detail';
UPDATE displays.display_definitions SET level = 4 WHERE level IS NULL AND category = 'faceplate';

SELECT level, count(*) FROM displays.display_definitions WHERE NOT is_deleted GROUP BY level ORDER BY level;
