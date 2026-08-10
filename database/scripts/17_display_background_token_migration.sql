-- Migrate hardcoded canvas backgrounds → the theme token.
--
-- The Designer used to write `backgroundColor: '#0f172a'` into every saved snapshot (and the viewer
-- applies it as an inline style), so those displays render dark navy in EVERY theme and cannot follow
-- day/night. Fixing the code only helps new saves; the value is already persisted in the JSONB
-- snapshot of every existing version, so it has to be rewritten here too.
--
-- Idempotent: re-running it changes nothing. Safe on a live DB (no locks beyond the row updates).
-- Applies to draft AND published versions so an operator's running screen re-themes without a re-publish.


-- DATA-11: this script has no \c and therefore ran against the default POSTGRES_DB
-- ('ams'), where these objects do not exist. Under the postgres entrypoint's
-- ON_ERROR_STOP that aborted the whole fresh-volume init at this file, so every
-- later script silently never ran. Connect to the owning database first.
\c traverse_displays

UPDATE displays.display_versions
SET snapshot = jsonb_set(
        snapshot,
        '{settings,backgroundColor}',
        '"var(--ams-canvas-bg)"'::jsonb,
        false)
WHERE snapshot -> 'settings' ? 'backgroundColor'
  AND snapshot #>> '{settings,backgroundColor}' IN ('#0f172a', '#1e1e1e', '#0b1220', '#111827');

-- The definition-level default column carries the same literal.
UPDATE displays.display_definitions
SET background_color = 'var(--ams-canvas-bg)'
WHERE background_color IN ('#0f172a', '#1e1e1e', '#0b1220', '#111827');

-- Report what is left (should be only intentional, per-display custom colors).
SELECT snapshot #>> '{settings,backgroundColor}' AS background_color, count(*) AS versions
FROM displays.display_versions
WHERE snapshot -> 'settings' ? 'backgroundColor'
GROUP BY 1
ORDER BY 2 DESC;
