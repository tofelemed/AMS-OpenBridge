-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-17-hot-window-partitions.rollback.sql — CHG-102 rollback: analytics.cplm_short_feature_results back to DAILY
-- partitions (the cpm-10b shape: <table>_pYYYYMMDD, yesterday .. today + 2 UTC, + DEFAULT), every row kept; the
-- retention_policy "hours" column dropped. days stay as cpm-17 left them (SHORT_FEATURES 1, LONG_FEATURES 1 - the
-- plant's values before CHG-102). The long and gate tables were never changed by cpm-17.
--
-- RUN WITH cplm-api STOPPED, then start the PREVIOUS cplm-api image (it creates and drops whole days only), then
-- put the 6-hour DELETE cron back (the daily partitions alone would keep the short features 1-2 days):
--   docker stop traverse-cplm-api
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-17-hot-window-partitions.rollback.sql
--   (previous cplm-api image: /tmp/pre-<release>-images.txt, deploy.sh)
--   sudo cp migration/cron.d/cpa-prune-short-features /etc/cron.d/ && sudo chmod 644 /etc/cron.d/cpa-prune-short-features
--
-- One transaction (the DO block); re-runnable: a short table with no hourly partition left is skipped with a NOTICE.
-- Plain PostgreSQL only (refuses Timescale hypertables). Rows outside yesterday .. today + 2 land in DEFAULT.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    tbl    constant text := 'cplm_short_feature_results';
    today  date := (now() AT TIME ZONE 'UTC')::date;
    d      date;
    ch     record;
    relk   text;
    hourly int;
    kept   bigint;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        IF EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_schema = 'analytics'
                   AND hypertable_name = tbl) THEN
            RAISE EXCEPTION 'cpm-17 rollback is for the plant (plain PostgreSQL): analytics.% is a Timescale hypertable here', tbl;
        END IF;
    END IF;
    SELECT c.relkind::text INTO relk FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'analytics' AND c.relname = tbl;
    IF relk IS DISTINCT FROM 'p' THEN RAISE EXCEPTION 'analytics.% is not partitioned: nothing to roll back', tbl; END IF;

    SELECT count(*) INTO hourly FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = ('analytics.' || tbl)::regclass AND c.relname ~ ('^' || tbl || '_p[0-9]{10}$');
    IF hourly = 0 THEN
        RAISE NOTICE 'analytics.%: no hourly partition, skipped', tbl;
    ELSE
        CREATE TEMP TABLE cpm17_back ON COMMIT DROP AS SELECT * FROM analytics.cplm_short_feature_results;
        GET DIAGNOSTICS kept = ROW_COUNT;
        FOR ch IN SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
                  WHERE i.inhparent = ('analytics.' || tbl)::regclass AND c.relname ~ ('^' || tbl || '_p[0-9]{8}([0-9]{2})?$') LOOP
            EXECUTE format('DROP TABLE analytics.%I', ch.relname);
        END LOOP;
        EXECUTE format('TRUNCATE analytics.%I', tbl || '_default');
        FOR d IN SELECT g::date FROM generate_series(today - 1, today + 2, interval '1 day') g LOOP
            EXECUTE format('CREATE TABLE analytics.%I PARTITION OF analytics.%I FOR VALUES FROM (%L) TO (%L)',
                           tbl || '_p' || to_char(d, 'YYYYMMDD'), tbl, d::timestamp AT TIME ZONE 'UTC', (d + 1)::timestamp AT TIME ZONE 'UTC');
        END LOOP;
        INSERT INTO analytics.cplm_short_feature_results SELECT * FROM cpm17_back;
        RAISE NOTICE 'analytics.%: % hourly partitions replaced by daily ones; % rows kept', tbl, hourly, kept;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
            FOR ch IN SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = ('analytics.' || tbl)::regclass LOOP
                EXECUTE format('ALTER TABLE analytics.%I OWNER TO ams_user', ch.relname);
            END LOOP;
        END IF;
        EXECUTE format('ANALYZE analytics.%I', tbl);
    END IF;
END $$;

ALTER TABLE analytics.retention_policy DROP COLUMN IF EXISTS hours;
