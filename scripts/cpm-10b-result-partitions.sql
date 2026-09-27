-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-10b-result-partitions.sql — PLANT live upgrade for CHG-033: the three result tables
-- (cplm_short_feature_results, cplm_long_feature_results, cplm_gate_results) become daily RANGE
-- partitions on window_end. Plain PostgreSQL 15; the lab keeps its Timescale hypertables
-- (database/scripts/39) and this script refuses to run on them.
--
-- RUN WITH cplm-api STOPPED (the writer must not insert during the swap; minutes at plant size):
--   docker stop traverse-cplm-api
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-10b-result-partitions.sql
--   docker start traverse-cplm-api
-- Rows carried over (hours back from now; the plant holds 6 h / 24 h of features today and every gate
-- row since go-live): defaults 6 / 24 / 720. Override before psql with
--   PGOPTIONS='-c cpm.copy_hours_short=6 -c cpm.copy_hours_long=24 -c cpm.copy_hours_gate=720'
-- Needs free disk for one copy of the rows kept (old and new coexist until the commit): df -h first.
--
-- One transaction (the DO block): a failure leaves every table exactly as it was. Re-runnable: an
-- already partitioned table is skipped with a NOTICE.
--
-- Per table: drop the *_latest view (it pins the relation); rename to *_old; CREATE TABLE ...
-- PARTITION BY RANGE (window_end) with the same columns - window_end NOT NULL, id on a plain sequence
-- (PG15 has no identity column on a partitioned parent); daily partitions from the copy window to
-- today + 2 (UTC) plus a DEFAULT partition; copy the kept rows; advance the sequence past every id
-- ever used; drop the old table; replay every index the old table had WITH THE SAME NAMES, so
-- cplm-api's startup self-heal DDL (CplmResultSchema.cs, CplmReadIndexes.cs) stays a no-op - the
-- primary key becomes (id, window_end), the pre-v2.5 unique key without bundle_hash is not carried;
-- recreate the view; ownership -> ams_user (the go-live 42501 trap). Then the retention rows.
--
-- Retention afterwards is by window DAY for every purpose - the lab's Timescale semantics, only
-- shorter: retention_policy SHORT_FEATURES / LONG_FEATURES / GATE_RESULTS (days) drive
-- FeaturePartitionMaintenance in cplm-api (creates today + 2, drops past days, prunes DEFAULT).
-- A replay of a window older than retention lands in DEFAULT and is pruned there.
-- Fresh install (03 then this, before cplm-api ever started): the two feature GIN indexes exist only
-- through the self-heal DDL, so the first cplm-api start builds them on the empty parents - expected.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT set_config('cpm.copy_hours_short', COALESCE(NULLIF(current_setting('cpm.copy_hours_short', true), ''), '6'),   false);
SELECT set_config('cpm.copy_hours_long',  COALESCE(NULLIF(current_setting('cpm.copy_hours_long',  true), ''), '24'),  false);
SELECT set_config('cpm.copy_hours_gate',  COALESCE(NULLIF(current_setting('cpm.copy_hours_gate',  true), ''), '720'), false);
SET maintenance_work_mem = '512MB';

DO $$
DECLARE
    p        record;
    ix       record;
    d        date;
    relk     text;
    n        bigint;
    old_rows bigint;
    maxid    bigint;
    old_tbl  text;
    view_sql text;
    today    date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        IF EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_schema = 'analytics'
                   AND hypertable_name IN ('cplm_short_feature_results', 'cplm_long_feature_results', 'cplm_gate_results')) THEN
            RAISE EXCEPTION 'cpm-10b is for the plant (plain PostgreSQL): these tables are Timescale hypertables here';
        END IF;
    END IF;
    CREATE TEMP TABLE IF NOT EXISTS cpm10b_idx (tbl text, name text, def text, is_pk boolean) ON COMMIT DROP;

    FOR p IN SELECT * FROM (VALUES
        ('cplm_short_feature_results', current_setting('cpm.copy_hours_short')::int, 'cplm_short_feature_latest'),
        ('cplm_long_feature_results',  current_setting('cpm.copy_hours_long')::int,  'cplm_long_feature_latest'),
        ('cplm_gate_results',          current_setting('cpm.copy_hours_gate')::int,  'cplm_gate_latest')) AS t(tbl, copy_hours, view_name)
    LOOP
        SELECT c.relkind::text INTO relk FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
        WHERE ns.nspname = 'analytics' AND c.relname = p.tbl;
        IF relk IS NULL THEN RAISE EXCEPTION 'analytics.% does not exist', p.tbl; END IF;
        IF relk = 'p' THEN RAISE NOTICE 'analytics.%: already partitioned, skipped', p.tbl; CONTINUE; END IF;
        old_tbl := p.tbl || '_old';

        -- 1. the view pins the relation: remember it, drop it
        SELECT pg_get_viewdef(('analytics.' || v.viewname)::regclass, true) INTO view_sql
        FROM pg_views v WHERE v.schemaname = 'analytics' AND v.viewname = p.view_name;
        EXECUTE format('DROP VIEW IF EXISTS analytics.%I', p.view_name);

        -- 2. the swap
        EXECUTE format('ALTER TABLE analytics.%I RENAME TO %I', p.tbl, old_tbl);
        EXECUTE format('CREATE TABLE analytics.%I (LIKE analytics.%I INCLUDING DEFAULTS INCLUDING CONSTRAINTS) PARTITION BY RANGE (window_end)', p.tbl, old_tbl);
        EXECUTE format('ALTER TABLE analytics.%I ALTER COLUMN window_end SET NOT NULL', p.tbl);
        EXECUTE format('CREATE SEQUENCE analytics.%I OWNED BY analytics.%I.id', p.tbl || '_idseq', p.tbl);
        EXECUTE format('ALTER TABLE analytics.%I ALTER COLUMN id SET DEFAULT nextval(%L)', p.tbl, 'analytics.' || p.tbl || '_idseq');
        FOR d IN SELECT g::date FROM generate_series(((now() - make_interval(hours => p.copy_hours)) AT TIME ZONE 'UTC')::date, today + 2, interval '1 day') g LOOP
            EXECUTE format('CREATE TABLE analytics.%I PARTITION OF analytics.%I FOR VALUES FROM (%L) TO (%L)',
                           p.tbl || '_p' || to_char(d, 'YYYYMMDD'), p.tbl, d::timestamp AT TIME ZONE 'UTC', (d + 1)::timestamp AT TIME ZONE 'UTC');
        END LOOP;
        EXECUTE format('CREATE TABLE analytics.%I PARTITION OF analytics.%I DEFAULT', p.tbl || '_default', p.tbl);

        -- 3. the rows kept, the sequence past every id ever used
        EXECUTE format('INSERT INTO analytics.%I SELECT * FROM analytics.%I WHERE window_end IS NOT NULL AND window_end >= now() - make_interval(hours => %s)',
                       p.tbl, old_tbl, p.copy_hours);
        GET DIAGNOSTICS n = ROW_COUNT;
        EXECUTE format('SELECT count(*) FROM analytics.%I', old_tbl) INTO old_rows;
        RAISE NOTICE 'analytics.%: % of % rows carried over (last % h)', p.tbl, n, old_rows, p.copy_hours;
        EXECUTE format('SELECT GREATEST(COALESCE(max(id), 0), (SELECT COALESCE(max(id), 0) FROM analytics.%I)) FROM analytics.%I', old_tbl, p.tbl) INTO maxid;
        PERFORM setval('analytics.' || p.tbl || '_idseq', maxid + 1, false);

        -- 4. the old table's indexes, same names, on the new parent; the old table goes first (it holds the names)
        DELETE FROM cpm10b_idx WHERE tbl = p.tbl;
        INSERT INTO cpm10b_idx
        SELECT p.tbl, i.indexname, replace(i.indexdef, ' ON analytics.' || old_tbl || ' ', ' ON analytics.' || p.tbl || ' '),
               EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = ('analytics.' || old_tbl)::regclass AND c.contype = 'p'
                       AND c.conindid = ('analytics.' || quote_ident(i.indexname))::regclass)
        FROM pg_indexes i WHERE i.schemaname = 'analytics' AND i.tablename = old_tbl;
        EXECUTE format('DROP TABLE analytics.%I', old_tbl);
        EXECUTE format('ALTER TABLE analytics.%I ADD CONSTRAINT %I PRIMARY KEY (id, window_end)', p.tbl, p.tbl || '_pkey');
        FOR ix IN SELECT name, def FROM cpm10b_idx WHERE tbl = p.tbl AND NOT is_pk
                  AND name NOT IN ('uq_cplm_gate_results_window', 'uq_cplm_short_window', 'uq_cplm_long_window') LOOP
            EXECUTE ix.def;
        END LOOP;

        -- 5. the view back (its definition names the new table), ownership, statistics
        IF view_sql IS NOT NULL THEN EXECUTE format('CREATE VIEW analytics.%I AS %s', p.view_name, view_sql); END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
            EXECUTE format('ALTER TABLE analytics.%I OWNER TO ams_user', p.tbl);
            FOR ix IN SELECT c.relname FROM pg_inherits h JOIN pg_class c ON c.oid = h.inhrelid WHERE h.inhparent = ('analytics.' || p.tbl)::regclass LOOP
                EXECUTE format('ALTER TABLE analytics.%I OWNER TO ams_user', ix.relname);
            END LOOP;
            EXECUTE format('ALTER SEQUENCE analytics.%I OWNER TO ams_user', p.tbl || '_idseq');
            IF view_sql IS NOT NULL THEN EXECUTE format('ALTER VIEW analytics.%I OWNER TO ams_user', p.view_name); END IF;
        END IF;
        EXECUTE format('ANALYZE analytics.%I', p.tbl);
    END LOOP;
END $$;

INSERT INTO analytics.retention_policy (record_class, days)
VALUES ('SHORT_FEATURES', 3), ('LONG_FEATURES', 30), ('GATE_RESULTS', 30)
ON CONFLICT (record_class) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA analytics TO ams_user;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA analytics TO ams_user;
    END IF;
END $$;
