-- cpm-05-gate-results-retention-check.sql — CHG-023 (P1-4): facts for the retention decision.
--
--   docker exec -i instrumental-postgres psql -U ams_user -d traverse_cplm -f - < ops/cpm-05-gate-results-retention-check.sql
--
-- READ-ONLY. The plant's traverse_cplm has NO hypertable, compression or retention on the
-- three CPLM result tables (migration/schema/03 never carried database/scripts/39), so they
-- grow without a ceiling: ~192 gate rows per loop per day (12h + 24h every 15 min) plus the
-- short/long feature rows. CHG-023's read path no longer slows down with size, but disk does
-- run out — this host has filled three times already.
--
-- Two ways to bound it; pick one after reading the output:
--   A. TimescaleDB (database/scripts/39 semantics: hypertable on window_end, compress > 30 d,
--      retain 730 d). Only if `timescaledb` appears in the first result, and only in a quiet
--      window with migrate_data => TRUE — it rewrites the table.
--   B. Plain deletes — a nightly `DELETE … WHERE window_end < now() - interval '730 days'`
--      per table (pg_cron if installed, else a host cron running psql), followed by VACUUM.
--      No extension, no rewrite, works on any Postgres.
\timing on

\echo '=== 1. Is TimescaleDB available on this Postgres? (empty = no; option B only) ==='
SELECT name, default_version, installed_version
FROM pg_available_extensions WHERE name IN ('timescaledb', 'pg_cron');

\echo '=== 2. Result-table sizes and growth ==='
SELECT t.relname AS table_name,
       pg_size_pretty(pg_total_relation_size(t.oid)) AS total_size,
       (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM analytics.%I', t.relname), false, true, '')))[1]::text::bigint AS rows
FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'analytics'
  AND t.relname IN ('cplm_gate_results', 'cplm_short_feature_results', 'cplm_long_feature_results', 'cplm_event_frames')
  AND t.relkind = 'r'
ORDER BY pg_total_relation_size(t.oid) DESC;

\echo '=== 3. Gate rows per day (last 14 days) — the growth rate ==='
SELECT date_trunc('day', window_end)::date AS day, count(*) AS gate_rows,
       pg_size_pretty(sum(pg_column_size(payload))) AS payload_bytes
FROM analytics.cplm_gate_results
WHERE window_end >= now() - interval '14 days'
GROUP BY 1 ORDER BY 1;

\echo '=== 4. Oldest rows and how much a 730-day (gate/long) / 365-day (short) policy would remove TODAY ==='
SELECT 'cplm_gate_results' AS table_name, min(window_end) AS oldest,
       count(*) FILTER (WHERE window_end < now() - interval '730 days') AS rows_past_retention
FROM analytics.cplm_gate_results
UNION ALL
SELECT 'cplm_long_feature_results', min(window_end),
       count(*) FILTER (WHERE window_end < now() - interval '730 days')
FROM analytics.cplm_long_feature_results
UNION ALL
SELECT 'cplm_short_feature_results', min(window_end),
       count(*) FILTER (WHERE window_end < now() - interval '365 days')
FROM analytics.cplm_short_feature_results;

\echo '=== 5. Disk headroom on the data directory (as Postgres sees it) ==='
SELECT current_setting('data_directory') AS data_directory,
       pg_size_pretty(pg_database_size('traverse_cplm')) AS traverse_cplm_size;
