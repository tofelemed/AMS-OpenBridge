-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-12b-evidence-reclaim.sql — CHG-049 (cplm-api STOPPED): drop the expired evidence tombstones, then give
-- the high-water mark (3.7 GB at the plant) back to the disk with VACUUM FULL.
--
-- RUN ONCE, with cplm-api STOPPED, after the new jar has run >= 1 h. VACUUM FULL takes an ACCESS EXCLUSIVE lock
-- and rewrites each table. FREE-SPACE GUARD, BEFORE the stop - one step prints the three tables' size and the free disk:
--   docker exec instrumental-postgres psql -U postgres -d traverse_cplm -tAc "select pg_size_pretty(pg_total_relation_size('analytics.evidence_chunk')+pg_total_relation_size('analytics.evidence_manifest')+pg_total_relation_size('analytics.response_metric'))"; df -h /
--   continue only if free >= 2 x that total (old and new copies coexist); otherwise STOP, do not run this file.
--   docker stop traverse-cplm-api
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-12b-evidence-reclaim.sql
--   docker start traverse-cplm-api
-- The script cannot check disk itself - the size + df step above is the guard.
--
-- Re-runnable: the DELETEs match nothing the second time and VACUUM FULL on compact tables is cheap.
-- Pinned manifests are never deleted. Not wrapped in a transaction (VACUUM cannot be).
-- ═══════════════════════════════════════════════════════════════════════════
\c traverse_cplm
\set ON_ERROR_STOP 1
SELECT pg_size_pretty(pg_total_relation_size('analytics.evidence_chunk') + pg_total_relation_size('analytics.evidence_manifest') + pg_total_relation_size('analytics.response_metric')) AS before;
DELETE FROM analytics.evidence_manifest WHERE readiness = 'EXPIRED' AND pinned = FALSE;
-- TRANSIENT: new runs replace them; deleted runs are not rebuilt. This also drops TRANSIENT evidence captured but
-- not yet promoted (lookback <= 7 h); run at a quiet time.
DELETE FROM analytics.evidence_manifest WHERE retention_class = 'TRANSIENT' AND pinned = FALSE;
VACUUM (FULL, ANALYZE) analytics.evidence_chunk;
VACUUM (FULL, ANALYZE) analytics.evidence_manifest;
VACUUM (FULL, ANALYZE) analytics.response_metric;
SELECT pg_size_pretty(pg_total_relation_size('analytics.evidence_chunk') + pg_total_relation_size('analytics.evidence_manifest') + pg_total_relation_size('analytics.response_metric')) AS after;
