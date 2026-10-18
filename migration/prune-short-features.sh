#!/usr/bin/env bash
# Marun feature retention - the OFFICIAL retention of the short / long feature tables at this plant
# (decision 2026-10-18, prod_decision.md section 3): short features 6 h, long features 24 h.
# Installed 2026-09-26 as an interim control; CHG-033 (v2.6) meant the daily partitions to take over
# (SHORT_FEATURES 3 d / LONG_FEATURES 14 d), but those need ~6.6 + 3.4 GB this shared 96 GB disk does
# not have (measured 2026-10-18: short ~2.2 GB/day, long ~245 MB/day). The partitions now only drop
# the emptied days; this DELETE sets what is kept. It holds each table at a steady size through page
# reuse; it does not shrink the files.
# analytics.cplm_gate_results is deliberately NOT pruned: it is the verdict history (GATE_RESULTS days).
# Cron: migration/cron.d/cpa-prune-short-features  (every 30 minutes, as root) - NOT cpa-capacity.
q() { docker exec instrumental-postgres psql -U postgres -d traverse_cplm -c "$1"; }
q "DELETE FROM analytics.cplm_short_feature_results WHERE window_end < now() - interval '6 hours'"
q "DELETE FROM analytics.cplm_long_feature_results  WHERE window_end < now() - interval '24 hours'"
