-- Record WHEN a display was published, and BY WHOM.
--
-- Publish flips an existing draft row's status to 'published' — it inserts no row and never touches
-- created_at. So display_versions.created_at is the SAVE time, not the publish time: a draft saved on
-- Monday and published on Friday reported Monday. And unpublish→publish re-flips the same row, so it
-- can be arbitrarily stale. display_definitions.updated_at is no proxy either — it is bumped by
-- metadata edits, saves, publishes, unpublishes, reverts and deletes alike.
--
-- Idempotent (IF NOT EXISTS) so it is safe on a live DB and on a fresh initdb volume.

ALTER TABLE displays.display_definitions
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS published_by TEXT;

ALTER TABLE displays.display_versions
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS published_by TEXT;

COMMENT ON COLUMN displays.display_definitions.published_at IS
    'When the current published_version went live (NOT the version''s created_at, which is its save time).';

-- Backfill for rows published before this column existed: the best available approximation is the
-- published version's save time. Marked as approximate via published_by.
UPDATE displays.display_definitions d
SET published_at = COALESCE(
        (SELECT v.created_at FROM displays.display_versions v
          WHERE v.display_id = d.id AND v.version = d.published_version),
        d.updated_at),
    published_by = COALESCE(d.published_by, 'unknown (pre-migration)')
WHERE d.published_version IS NOT NULL
  AND d.published_at IS NULL;

UPDATE displays.display_versions v
SET published_at = v.created_at,
    published_by = COALESCE(v.published_by, 'unknown (pre-migration)')
WHERE v.status = 'published'
  AND v.published_at IS NULL;

SELECT count(*) FILTER (WHERE published_at IS NOT NULL) AS with_publish_time,
       count(*)                                          AS published_displays
FROM displays.display_definitions
WHERE published_version IS NOT NULL;
