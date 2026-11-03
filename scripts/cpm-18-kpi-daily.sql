-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-18-kpi-daily.sql — PLANT live upgrade for CHG-102 (IoTDB + PostgreSQL plan, Phase 6): three years of Overview-KPI
-- history with the loops behind every point (project rule: every KPI has a drill-down to its loops and values).
--   * analytics.cplm_kpi_daily (new): one row per plant day (UTC), fused window (12h / 24h) and monitored loop - exactly
--     what GET fleet/kpis/loops?asOf=<day end, 00:00 UTC> returned for that loop: state / reason / outcome / band / family,
--     the mode / saturation flags, limited_by, the verdict window it was judged on (window_end, age) and the classifier's
--     inputs (jsonb), with FleetKpiClassifier.RuleVersion. ~143 loops x 2 windows x 1095 days ~ 0.3 M rows (tens of MB).
--   * analytics.cplm_kpi_daily_run (new): one row per day and window - "this day is stored" (even with no loop monitored),
--     the rule version and the thresholds it was classified with.
--   * retention_policy KPI_DAILY = 1095 days (the new cplm-api deletes older days by day; NULL days = keep forever).
-- Filled by the new cplm-api (FleetKpiDailyJob, hourly, consumers instance): every ended day inside the 14-day gate-result
-- retention is backfilled on its first pass (~2 s per day-window at plant size), then one day per day.
--
-- RUN ONLINE (no stop), BEFORE the cplm-api image swap (release step PRE_SWAP 4f), so the new image finds the tables on its
-- first pass; the old cplm-api ignores them (its evidence sweeper reads the KPI_DAILY row as an evidence class that no
-- manifest carries - a no-op). Applied after the swap instead, the new image logs "apply cpm-18" hourly and serves the
-- trend live for 14 days until it is applied:
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-18-kpi-daily.sql
-- Idempotent: CREATE ... IF NOT EXISTS, the retention row is DO NOTHING (an operator's own value is kept). Instant.
-- Ownership: the tables go to ams_user (as 02-apply-schemas.sh normalises; cplm-api only reads / writes them, no self-heal
-- DDL - they ship as ops SQL like the other v2.5+ tables).
--
-- Rollback (online): ops/cpm-18-kpi-daily.rollback.sql (drops both tables and the row; the stored history is lost). The new
-- cplm-api keeps working without them: the trend falls back to the 14-day live computation.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS analytics.cplm_kpi_daily (
    day                  date         NOT NULL,
    window_kind          varchar(16)  NOT NULL,
    loop_id              varchar(256) NOT NULL,
    as_of                timestamptz  NOT NULL,
    site                 text,
    area                 text,
    unit                 text,
    state                varchar(24)  NOT NULL,
    reason               varchar(64),
    outcome              varchar(24)  NOT NULL,
    band                 varchar(32),
    family               varchar(64),
    diagnosis            varchar(128),
    window_end           timestamptz,
    age_seconds          double precision,
    fresh                boolean      NOT NULL,
    normal_mode_measured boolean      NOT NULL,
    in_normal_mode       boolean      NOT NULL,
    saturation_measured  boolean      NOT NULL,
    saturated            boolean      NOT NULL,
    manual_mode_measured boolean      NOT NULL,
    in_manual_mode       boolean      NOT NULL,
    limited_by           text[]       NOT NULL DEFAULT '{}',
    inputs               jsonb        NOT NULL DEFAULT '{}'::jsonb,
    rule_version         int          NOT NULL,
    computed_at          timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (day, window_kind, loop_id)
);
COMMENT ON TABLE analytics.cplm_kpi_daily IS
    'CHG-102: per plant day (UTC), fused window and monitored loop, the Overview-KPI classification as of the day end (00:00 UTC next day) - what GET fleet/kpis/loops?asOf returned - with its inputs and FleetKpiClassifier rule_version. Kept retention_policy KPI_DAILY days (1095). Written by cplm-api FleetKpiDailyJob.';
CREATE TABLE IF NOT EXISTS analytics.cplm_kpi_daily_run (
    day          date         NOT NULL,
    window_kind  varchar(16)  NOT NULL,
    as_of        timestamptz  NOT NULL,
    rule_version int          NOT NULL,
    loops        int          NOT NULL,
    thresholds   jsonb        NOT NULL DEFAULT '{}'::jsonb,
    computed_at  timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (day, window_kind)
);
COMMENT ON TABLE analytics.cplm_kpi_daily_run IS
    'CHG-102: one row per stored day and window of analytics.cplm_kpi_daily (present = stored, even with 0 loops), with the rule version and the Cpm:Kpi thresholds used.';

INSERT INTO analytics.retention_policy (record_class, days) VALUES ('KPI_DAILY', 1095)
    ON CONFLICT (record_class) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        ALTER TABLE analytics.cplm_kpi_daily OWNER TO ams_user;
        ALTER TABLE analytics.cplm_kpi_daily_run OWNER TO ams_user;
        GRANT ALL ON analytics.cplm_kpi_daily, analytics.cplm_kpi_daily_run TO ams_user;
    END IF;
END $$;
