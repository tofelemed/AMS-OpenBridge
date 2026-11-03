-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-17-hot-window-partitions.sql — PLANT live upgrade for CHG-102 (IoTDB + PostgreSQL plan, Phase 4): the
-- feature hot windows are kept by partition DROP instead of the 30-minute DELETE cron.
--   * analytics.cplm_short_feature_results: daily partitions (cpm-10b) -> HOURLY partitions <table>_pYYYYMMDDHH
--     (UTC hour-aligned) + DEFAULT. Only the rows of the last 6 h are carried over; retention SHORT_FEATURES = 6 h.
--   * analytics.cplm_long_feature_results: stays daily; retention LONG_FEATURES = 1 day (makes official the row the
--     plant set outside a release on 2026-11-03).
--   * analytics.cplm_gate_results: untouched (daily, GATE_RESULTS 14 d).
-- Plain PostgreSQL only: refuses to run on Timescale hypertables (the lab), like cpm-10b. Needs cpm-10b applied.
--
-- RUN WITH cplm-api STOPPED, BEFORE the cplm-api image swap (release step PRE_SWAP 4e); the old cplm-api's
-- maintenance cannot read hourly partitions, so do not start the old image on the new shape:
--   sudo rm -f /etc/cron.d/cpa-prune-short-features
--   docker stop traverse-cplm-api
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-17-hot-window-partitions.sql
--   (then the release's deploy.sh recreates cplm-api with the new image)
-- Rows carried over: the last 6 h (override: docker exec -i -e PGOPTIONS='-c cpm.copy_hours_short=8' ...).
-- Hourly partitions are created from the copy window to the current hour + 3 (the new cplm-api keeps >= 3 h ahead).
--
-- One transaction (the DO block): a failure leaves the table exactly as it was. Re-runnable: a short table that has
-- no daily partition left is skipped with a NOTICE; the retention rows are upserts.
--
-- In place: the partitioned PARENT stays (columns, primary key (id, window_end), the id sequence, every partitioned
-- index under its cpm-10b name, the cplm_short_feature_latest view, ownership), so cplm-api's startup self-heal DDL
-- (CplmResultSchema.cs) stays a no-op and the view needs no rebuild. Only the children change: the kept rows go to a
-- temp table, every day/hour child is dropped (the ~1.1 GB of dead tuples returns to the filesystem at commit), the
-- DEFAULT is emptied, the hourly children are created (each gets its child indexes from the parent automatically),
-- the rows go back, children -> ams_user (cplm-api drops them later; the go-live 42501 trap).
--
-- retention_policy gains a nullable "hours" column: the new cplm-api uses hours when set, else days x 24. days stays
-- filled (SHORT_FEATURES = 1) because the previous cplm-api reads only days.
--
-- Expected effect (Marun 2026-11-03): cplm_short_feature_results 1,110 MB -> the rows of 6-7 h (~0.5 GB at
-- ~2.2 GB/day, lower once the dead tuples are gone), then flat: one hourly partition created and one dropped per hour.
-- cplm_long_feature_results keeps 24-48 h (days before yesterday dropped; was 24 h by the DELETE).
--
-- Rollback (cplm-api STOPPED): ops/cpm-17-hot-window-partitions.rollback.sql (daily partitions back, hours column
-- dropped), then the previous cplm-api image, then the cron back:
--   sudo cp migration/cron.d/cpa-prune-short-features /etc/cron.d/ && sudo chmod 644 /etc/cron.d/cpa-prune-short-features
-- ═══════════════════════════════════════════════════════════════════════════

SELECT set_config('cpm.copy_hours_short', COALESCE(NULLIF(current_setting('cpm.copy_hours_short', true), ''), '6'), false);
SET maintenance_work_mem = '512MB';

ALTER TABLE analytics.retention_policy ADD COLUMN IF NOT EXISTS hours int;
COMMENT ON COLUMN analytics.retention_policy.hours IS
    'CHG-102: retention in hours; when set it wins over days (cplm-api partition maintenance). SHORT_FEATURES = 6 (hourly partitions dropped).';

DO $$
DECLARE
    tbl        constant text := 'cplm_short_feature_results';
    copy_hours int := current_setting('cpm.copy_hours_short')::int;
    hour_now   timestamptz := date_trunc('hour', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    h          timestamptz;
    ch         record;
    relk       text;
    daily      int;
    hourly     int;
    kept       bigint;
    made       int := 0;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        IF EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_schema = 'analytics'
                   AND hypertable_name IN ('cplm_short_feature_results', 'cplm_long_feature_results', 'cplm_gate_results')) THEN
            RAISE EXCEPTION 'cpm-17 is for the plant (plain PostgreSQL): these tables are Timescale hypertables here';
        END IF;
    END IF;
    SELECT c.relkind::text INTO relk FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'analytics' AND c.relname = tbl;
    IF relk IS NULL THEN RAISE EXCEPTION 'analytics.% does not exist', tbl; END IF;
    IF relk <> 'p' THEN RAISE EXCEPTION 'analytics.% is not partitioned: apply cpm-10b first', tbl; END IF;
    IF to_regclass('analytics.' || tbl || '_default') IS NULL THEN
        RAISE EXCEPTION 'analytics.%_default is missing: not the cpm-10b shape', tbl;
    END IF;

    SELECT count(*) FILTER (WHERE c.relname ~ ('^' || tbl || '_p[0-9]{8}$')),
           count(*) FILTER (WHERE c.relname ~ ('^' || tbl || '_p[0-9]{10}$'))
      INTO daily, hourly
      FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = ('analytics.' || tbl)::regclass;
    IF daily = 0 THEN
        RAISE NOTICE 'analytics.%: already hourly (% hourly partitions), skipped', tbl, hourly;
        RETURN;
    END IF;

    -- 1. the rows kept (window_end in the last copy_hours, future ones included), wherever they are now
    CREATE TEMP TABLE cpm17_keep ON COMMIT DROP AS
        SELECT * FROM analytics.cplm_short_feature_results WHERE window_end >= now() - make_interval(hours => copy_hours);
    GET DIAGNOSTICS kept = ROW_COUNT;

    -- 2. every day / hour child goes (the space returns at commit), DEFAULT emptied
    FOR ch IN SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
              WHERE i.inhparent = ('analytics.' || tbl)::regclass AND c.relname ~ ('^' || tbl || '_p[0-9]{8}([0-9]{2})?$') LOOP
        EXECUTE format('DROP TABLE analytics.%I', ch.relname);
    END LOOP;
    EXECUTE format('TRUNCATE analytics.%I', tbl || '_default');

    -- 3. hourly children from the copy window to the current hour + 3
    FOR h IN SELECT g FROM generate_series(hour_now - make_interval(hours => copy_hours), hour_now + interval '3 hours', interval '1 hour') g LOOP
        EXECUTE format('CREATE TABLE analytics.%I PARTITION OF analytics.%I FOR VALUES FROM (%L) TO (%L)',
                       tbl || '_p' || to_char(h AT TIME ZONE 'UTC', 'YYYYMMDDHH24'), tbl, h, h + interval '1 hour');
        made := made + 1;
    END LOOP;

    -- 4. the rows back (anything past the last hour lands in DEFAULT; cplm-api moves it when it creates that hour)
    INSERT INTO analytics.cplm_short_feature_results SELECT * FROM cpm17_keep;
    RAISE NOTICE 'analytics.%: % daily + % hourly partitions replaced by % hourly; % rows of the last % h kept',
        tbl, daily, hourly, made, kept, copy_hours;

    -- 5. ownership (cplm-api runs as ams_user and drops these later), statistics
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        FOR ch IN SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = ('analytics.' || tbl)::regclass LOOP
            EXECUTE format('ALTER TABLE analytics.%I OWNER TO ams_user', ch.relname);
        END LOOP;
    END IF;
    EXECUTE format('ANALYZE analytics.%I', tbl);
END $$;

-- SHORT_FEATURES: 6 h by the hourly DROP (days = 1 for the previous cplm-api); LONG_FEATURES: 1 day by the daily DROP.
-- GATE_RESULTS is not touched (14 d at the plant).
INSERT INTO analytics.retention_policy (record_class, days, hours)
VALUES ('SHORT_FEATURES', 1, 6), ('LONG_FEATURES', 1, NULL)
ON CONFLICT (record_class) DO UPDATE SET days = EXCLUDED.days, hours = EXCLUDED.hours;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA analytics TO ams_user;
    END IF;
END $$;
