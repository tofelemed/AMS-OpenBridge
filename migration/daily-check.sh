#!/usr/bin/env bash
# Marun daily check (v2.6.1). One run per morning:  bash /opt/AMS-open/migration/daily-check.sh
# Prints OK / WARN / ACT per check with the value; MARUN-DAILY-CHECK.md explains each line and the action.
# Read-only except for nothing: no container, job, table or file is changed by this script.
cd /opt/AMS-open 2>/dev/null || true
pg(){ docker exec instrumental-postgres psql -U postgres -d traverse_cplm -tA -c "$1" 2>/dev/null; }
kf(){ docker exec instrumental-kafka-1 "$@" 2>/dev/null; }
jm(){ docker exec ams-flink-jobmanager "$@" 2>/dev/null; }
off(){ kf kafka-run-class kafka.tools.GetOffsetShell --broker-list kafka-1:9092 --topic "$1" --time -1 | awk -F: '{s+=$3} END {print s+0}'; }
ok(){ echo "OK    $1"; }; warn(){ echo "WARN  $1"; }; act(){ echo "ACT   $1"; }
NOW=$(date -u +%H:%M); echo "== Marun daily check $(date -u +%F) ${NOW} UTC"

echo "== 1. disk"
avail=$(df -BG / | awk 'NR==2 {gsub("G","",$4); print $4}')
if [ "$avail" -ge 15 ]; then ok "free ${avail} GB"; elif [ "$avail" -ge 10 ]; then warn "free ${avail} GB - watch; see MARUN-DAILY-CHECK.md 1"; else act "free ${avail} GB - act today: MARUN-DAILY-CHECK.md 1"; fi
echo "      traverse_cplm $(docker exec instrumental-postgres psql -U postgres -tAc "select pg_size_pretty(pg_database_size('traverse_cplm'))" 2>/dev/null) | kafka $(kf sh -c 'du -sh /var/lib/kafka/data | cut -f1') | checkpoints $(docker exec ams-minio sh -c 'du -sh /data/ams-flink/checkpoints | cut -f1' 2>/dev/null)"

echo "== 2. containers"
for c in traverse-cplm-api traverse-ingestion-service ams-flink-jobmanager ams-flink-taskmanager ams-iotdb ams-minio traverse-gateway ams-frontend; do
  st=$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$c" 2>/dev/null)
  case "$st" in running\ healthy|running\ ) ok "$c $st";; running*) warn "$c $st";; *) act "$c ${st:-missing}";; esac
done

echo "== 3. OT feed -> samples (60 s)"
s1=$(off traverse.cpa.loop.samples.v1); sleep 60; s2=$(off traverse.cpa.loop.samples.v1); d=$((s2-s1))
if [ "$d" -ge 500 ]; then ok "samples +$d/min"; elif [ "$d" -gt 0 ]; then warn "samples +$d/min (a live plant sends ~1,700)"; else act "no samples in 60 s - OT feed or ingestion (MARUN-DAILY-CHECK.md 3)"; fi
auth=$(docker logs --since 24h traverse-ingestion-service 2>&1 | grep -ci 'not authori'); [ "$auth" -eq 0 ] && ok "ingestion: no authorisation errors (24 h)" || act "ingestion: $auth 'not authorised' lines - the broker user vanished (MARUN-CONTEXT 13)"

echo "== 4. Flink jobs"
run=$(jm flink list -m localhost:8081 | grep -c '(RUNNING)'); [ "$run" -eq 7 ] && ok "7 jobs RUNNING" || act "$run jobs RUNNING, expected 7: jm flink list; resubmit with 04b"
slots=$(jm curl -s localhost:8081/overview | grep -o '"slots-available":[0-9]*' | cut -d: -f2); [ "$slots" = "6" ] && ok "slots-available 6 (Short on 4)" || warn "slots-available $slots (expected 6)"
jm curl -s localhost:8081/jobs/overview | python3 -c '
import sys,json,subprocess
for j in json.load(sys.stdin)["jobs"]:
    if j["state"]!="RUNNING": continue
    c=json.loads(subprocess.run(["docker","exec","ams-flink-jobmanager","curl","-s","localhost:8081/jobs/"+j["jid"]+"/checkpoints"],capture_output=True,text=True).stdout)["counts"]
    tag="OK   " if c["failed"]==0 or c["completed"]>5*c["failed"] else "ACT  "
    print(f"{tag} {j[\"name\"][:40].ljust(40)} checkpoints ok {c[\"completed\"]} failed {c[\"failed\"]}")' 2>/dev/null

echo "== 5. calculations (rows written recently)"
sh10=$(pg "select count(*)||' rows, newest window '||coalesce(to_char(max(window_end) at time zone 'utc','HH24:MI'),'-') from analytics.cplm_short_feature_results where created_at > now() - interval '10 min'")
case "$sh10" in 0\ rows*) act "short features: $sh10 (10 min) - Short job stalled? MARUN-DAILY-CHECK.md 5";; *) ok "short features: $sh10 (10 min)";; esac
lg=$(pg "select count(*)||' rows' from analytics.cplm_long_feature_results where created_at > now() - interval '30 min'"); case "$lg" in 0\ rows) warn "long features: none in 30 min (Long job warming up after a restart is normal for an hour)";; *) ok "long features: $lg (30 min)";; esac
gt=$(pg "select coalesce(string_agg(window_kind||'='||n, ' '),'none') from (select window_kind, count(*) n from analytics.cplm_gate_results where created_at > now() - interval '30 min' group by 1) s"); case "$gt" in none) warn "fused verdicts: none in 30 min";; *) ok "fused verdicts (30 min): $gt";; esac
cmp=$(pg "select coalesce(round(avg(completeness)::numeric,3)::text,'-') from analytics.cplm_short_feature_results where window_kind='1m' and created_at > now() - interval '1 hour'")
case "$cmp" in -) warn "1m completeness: no rows in the last hour";; *) python3 -c "import sys; v=float('$cmp'); print(('OK   ' if v>=0.95 else 'WARN ')+' 1m completeness last hour: $cmp (expected >= 0.95)')";; esac

echo "== 6. cplm-api consumers (lag per topic, members)"
kf kafka-consumer-groups --bootstrap-server kafka-1:9092 --describe --group traverse-cpa-cplm-results | awk 'NR>1 && $6 ~ /^[0-9]+$/ {lag[$2]+=$6} END {for (t in lag) printf "      %-42s lag %s\n", t, lag[t]}'
for g in traverse-cpa-cplm-results traverse-cpa-cplm-results-frames traverse-cpa-cplm-evidence; do
  m=$(kf kafka-consumer-groups --bootstrap-server kafka-1:9092 --describe --group $g --members | grep -c -- '-sole'); [ "$m" -eq 1 ] && ok "$g: 1 member" || act "$g: $m members (must be exactly 1 - CLAUDE.md consumer rule)"
done

echo "== 7. evidence (bounds: TRANSIENT <= 2 GB and oldest <= 6 h; EPISODE levels off ~2 GB; STANDARD 3 d)"
pg "select retention_class||' '||count(*)||' manifests '||pg_size_pretty(sum(total_bytes))||' oldest '||to_char(min(created_at) at time zone 'utc','MM-DD HH24:MI') from analytics.evidence_manifest group by 1 order by 1" | sed 's/^/      /'
tb=$(pg "select coalesce(sum(total_bytes),0) from analytics.evidence_manifest where retention_class='TRANSIENT'"); [ "${tb:-0}" -le 2400000000 ] && ok "TRANSIENT payload within budget" || act "TRANSIENT payload above 2.4 GB: the sweep is not bounding - MARUN-DAILY-CHECK.md 7"
eb=$(pg "select coalesce(sum(total_bytes),0) from analytics.evidence_manifest where retention_class='EPISODE'"); [ "${eb:-0}" -le 3500000000 ] && ok "EPISODE payload within bound" || act "EPISODE payload above 3.5 GB: switch evidence off (MARUN-DAILY-CHECK.md 7)"
ep=$(pg "select count(*) filter (where opened_at > now()-interval '24 hours')||' opened / '||count(*) filter (where closed_at > now()-interval '24 hours')||' closed / '||count(*) filter (where closed_at is null)||' open now' from analytics.cplm_event_frames"); echo "      episodes 24 h: $ep"

echo "== 8. partitions and retention rows"
pg "select record_class||'='||coalesce(days::text,'never') from analytics.retention_policy order by 1" | tr '\n' ' ' | sed 's/^/      /'; echo
for t in cplm_short_feature_results cplm_long_feature_results cplm_gate_results; do
  n=$(pg "select count(*) from pg_inherits where inhparent='analytics.$t'::regclass"); dflt=$(pg "select count(*) from analytics.${t}_default")
  newest=$(pg "select max(c.relname) from pg_inherits h join pg_class c on c.oid=h.inhrelid where h.inhparent='analytics.$t'::regclass and c.relname like '%_p2%'")
  [ "$dflt" = "0" ] && ok "$t: $n partitions, newest $newest, DEFAULT empty" || warn "$t: DEFAULT holds $dflt rows (replays; pruned hourly)"
done

echo "== 9. errors in the last 24 h"
for c in traverse-cplm-api traverse-ingestion-service; do e=$(docker logs --since 24h $c 2>&1 | grep -c '^fail:\|^crit:'); [ "$e" -eq 0 ] && ok "$c: 0 error lines" || warn "$c: $e error lines - docker logs --since 24h $c 2>&1 | grep -E '^fail:|^crit:' | tail -5"; done
echo "== done"
