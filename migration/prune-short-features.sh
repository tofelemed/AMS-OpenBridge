#!/usr/bin/env bash
# Marun capacity control, installed 2026-09-26 (docs/marun-capacity-remediation.md item 2 is the
# permanent form). Interim retention for the two analytics tables that have none in production.
# DELETE holds each table at a steady size through page reuse; it does not shrink it.
# analytics.cplm_gate_results is deliberately NOT pruned: it is the verdict history.
# Cron: migration/cron.d/cpa-capacity  (every 30 minutes, as root)
q() { docker exec instrumental-postgres psql -U postgres -d traverse_cplm -c "$1"; }
q "DELETE FROM analytics.cplm_short_feature_results WHERE window_end < now() - interval '6 hours'"
q "DELETE FROM analytics.cplm_long_feature_results  WHERE window_end < now() - interval '24 hours'"
