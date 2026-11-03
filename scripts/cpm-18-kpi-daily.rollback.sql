-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-18-kpi-daily.rollback.sql — undoes scripts/cpm-18-kpi-daily.sql (CHG-102 Phase 6). ONLINE.
-- The stored daily KPI history is LOST (it cannot be rebuilt beyond the 14 days of gate results). Either cplm-api image
-- keeps working: the new one logs "apply cpm-18" hourly and serves the trend from the 14-day live computation.
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-18-kpi-daily.rollback.sql
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS analytics.cplm_kpi_daily;
DROP TABLE IF EXISTS analytics.cplm_kpi_daily_run;
DELETE FROM analytics.retention_policy WHERE record_class = 'KPI_DAILY';
