#!/usr/bin/env bash
# Marun daily check (v2.6.3+). One run per morning:  bash /opt/AMS-open/migration/daily-check.sh
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
# CHG-039: checkpoints are ~1 GB for seven jobs (v2.6.6: the Short job keeps 3 full heap snapshots of ~120 MB); GBs mean orphaned trees (a cancel or a killed JobManager) or a backlogged job
ckmb=$(docker exec ams-minio sh -c 'du -sm /data/ams-flink/checkpoints | cut -f1' 2>/dev/null)
if [ "${ckmb:-0}" -gt 3072 ]; then act "checkpoints ${ckmb} MB - orphaned checkpoint trees or a backlogged job: MARUN-DAILY-CHECK.md 1 and 4"; elif [ "${ckmb:-0}" -gt 1536 ]; then warn "checkpoints ${ckmb} MB - growing; MARUN-DAILY-CHECK.md 1"; else ok "checkpoints ${ckmb:-?} MB"; fi

echo "== 2. containers"
for c in traverse-cplm-api traverse-ingestion-service ams-flink-jobmanager ams-flink-taskmanager ams-iotdb ams-minio traverse-gateway ams-frontend; do
  st=$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$c" 2>/dev/null)
  case "$st" in running\ healthy|running\ ) ok "$c $st";; running*) warn "$c $st";; *) act "$c ${st:-missing}";; esac
done
# CHG-060: an OOM now exits the Flink JVM and Docker restarts it; a growing count is a crash loop (MARUN-DAILY-CHECK.md 2 and 4).
# The count resets to 0 when a deploy recreates the container.
for c in ams-flink-taskmanager ams-flink-jobmanager; do
  rc=$(docker inspect -f '{{.RestartCount}}' "$c" 2>/dev/null)
  [ "${rc:-0}" -eq 0 ] && ok "$c RestartCount ${rc:-?}" || warn "$c RestartCount $rc - exits since the last recreate (OOM?); MARUN-DAILY-CHECK.md 4"
done

# CHG-068: a zero-byte ZooKeeper txn log crash-loops it (ZOOKEEPER-2332); counted from the volume, not inside the (possibly dead) container
zkimg=$(for i in alpine python:3.11-alpine; do docker image inspect "$i" >/dev/null 2>&1 && { echo "$i"; break; }; done)
if [ -z "$zkimg" ]; then warn "zookeeper: cannot check zero-byte transaction logs (no alpine or python:3.11-alpine image on this host)"
elif ! docker volume inspect microservices_zookeeper-logs >/dev/null 2>&1; then warn "zookeeper txn-log volume not found - cannot check zero-byte logs"
else
  # a failing find must not read as 0: the sh -c prints nodir / the find error, and only a plain number counts
  zk0=$(docker run --rm -v microservices_zookeeper-logs:/l:ro "$zkimg" sh -c '[ -d /l/version-2 ] || { echo nodir; exit 0; }; n=$(find /l/version-2 -maxdepth 1 -name "log.*" -size 0) || { echo findfail; exit 0; }; [ -z "$n" ] && echo 0 || echo "$n" | wc -l' 2>/dev/null | tr -d ' ')
  case "$zk0" in 0) ok "zookeeper: no zero-byte transaction logs";; ''|*[!0-9]*) warn "zookeeper: cannot check zero-byte transaction logs (${zk0:-docker run failed})";; *) act "zookeeper: $zk0 zero-byte transaction log(s) - MARUN-DISK.md J";; esac
fi

echo "== 3. OT feed -> samples (60 s)"
s1=$(off traverse.cpa.loop.samples.v1); sleep 60; s2=$(off traverse.cpa.loop.samples.v1); d=$((s2-s1))
if [ "$d" -ge 500 ]; then ok "samples +$d/min"; elif [ "$d" -gt 0 ]; then warn "samples +$d/min (a live plant sends ~1,700)"; else act "no samples in 60 s - OT feed or ingestion (MARUN-DAILY-CHECK.md 3)"; fi
auth=$(docker logs --since 24h traverse-ingestion-service 2>&1 | grep -ci 'not authori'); [ "$auth" -eq 0 ] && ok "ingestion: no authorisation errors (24 h)" || act "ingestion: $auth 'not authorised' lines - the broker user vanished (MARUN-CONTEXT 13)"

echo "== 4. Flink jobs"
# CHG-102 5c: 8 jobs = the 7 engine jobs + "AMS - CPLM On-Demand Evaluation" (1 slot)
run=$(jm flink list -m localhost:8081 | grep -c '(RUNNING)'); [ "$run" -eq 8 ] && ok "8 jobs RUNNING" || act "$run jobs RUNNING, expected 8: jm flink list; resubmit with 04b"
slots=$(jm curl -s localhost:8081/overview | grep -o '"slots-available":[0-9]*' | cut -d: -f2); [ "$slots" = "5" ] && ok "slots-available 5 (Short on 4)" || warn "slots-available $slots (expected 5)"
# per-job checkpoints: a job whose failed count rivals its completed count is in the restart loop (MARUN-DAILY-CHECK.md 4)
jm curl -s localhost:8081/jobs/overview | python3 -c '
import sys, json, subprocess
try:
    jobs = json.load(sys.stdin)["jobs"]
except Exception as e:
    print("WARN  flink jobs overview unreadable: " + str(e)); jobs = []
for j in jobs:
    if j.get("state") != "RUNNING": continue
    name = (j.get("name") or "?")[:40].ljust(40)
    try:
        raw = subprocess.run(["docker", "exec", "ams-flink-jobmanager", "curl", "-s", "localhost:8081/jobs/" + j["jid"] + "/checkpoints"], capture_output=True, text=True).stdout
        c = json.loads(raw)["counts"]
        tag = "OK   " if c["failed"] == 0 or c["completed"] > 5 * c["failed"] else "ACT  "
        print(tag + " " + name + " checkpoints ok " + str(c["completed"]) + " failed " + str(c["failed"]))
    except Exception as e:
        print("WARN  " + name + " checkpoints unreadable: " + str(e)[:60])
'
# the Short job backlog in Kafka terms (section 4 remedy when it only grows)
lag=$(kf kafka-consumer-groups --bootstrap-server kafka-1:9092 --describe --group traverse-cpa-flink-cplm-short 2>/dev/null | awk 'NR>1 && $6 ~ /^[0-9]+$/ {s+=$6} END {print s+0}')
[ "${lag:-0}" -lt 50000 ] && ok "Short job consumer lag $lag samples" || act "Short job consumer lag $lag samples - backlog; MARUN-DAILY-CHECK.md 4 (cancel, reset offsets to latest, resubmit)"
# CHG-061: the Short buffer hit its per-loop cap (MARUN-DAILY-CHECK.md 4: lag / backlog, or a mis-declared grid)
capped=$(docker logs --since 24h ams-flink-taskmanager 2>&1 | grep -c SHORT_BUFFER_CAPPED); [ "${capped:-0}" -eq 0 ] && ok "Short buffer cap: no SHORT_BUFFER_CAPPED in 24 h" || warn "Short buffer cap: $capped SHORT_BUFFER_CAPPED lines in 24 h (MARUN-DAILY-CHECK.md 4)"
# F5: Kafka fetcher direct-buffer OOM on a mass restore (TM stays up, tasks restart; prod_decision.md section 6). The container log is capped (10 m x 3): a busy day can roll lines out, so 0 is not proof
dbm=$(docker logs --since 24h ams-flink-taskmanager 2>&1 | grep -c 'OutOfMemoryError: Direct buffer memory'); [ "${dbm:-0}" -eq 0 ] && ok "TaskManager direct memory: no 'Direct buffer memory' OOM in 24 h (log is capped)" || warn "TaskManager direct memory: $dbm 'Direct buffer memory' OOM lines in 24 h - MARUN-DAILY-CHECK.md 4 (F5)"

echo "== 5. calculations (rows written recently)"
sh10=$(pg "select case when count(*) = 0 then '0 rows' else count(*)||' rows, newest window '||coalesce(to_char(max(window_end) at time zone 'utc','MM-DD HH24:MI'),'-')||' UTC, '||coalesce(extract(epoch from now()-max(window_end))::int/60,-1)||' min behind now' end from analytics.cplm_short_feature_results where created_at > now() - interval '10 min'")
behind=$(echo "$sh10" | grep -oE '[0-9-]+ min behind' | cut -d' ' -f1)
case "$sh10" in 0\ rows*) act "short features: $sh10 (10 min) - Short job stalled? MARUN-DAILY-CHECK.md 5";;
  *) if [ "${behind:-0}" -gt 120 ]; then act "short features: $sh10 - the Short job is hours behind real time (event-time backlog): MARUN-DAILY-CHECK.md 4"; else ok "short features: $sh10 (10 min)"; fi;; esac
lg=$(pg "select count(*)||' rows' from analytics.cplm_long_feature_results where created_at > now() - interval '30 min'"); case "$lg" in 0\ rows) warn "long features: none in 30 min (Long job warming up after a restart is normal for an hour)";; *) ok "long features: $lg (30 min)";; esac
gt=$(pg "select coalesce(string_agg(window_kind||'='||n, ' '),'none') from (select window_kind, count(*) n from analytics.cplm_gate_results where created_at > now() - interval '30 min' group by 1) s"); case "$gt" in none) warn "fused verdicts: none in 30 min";; *) ok "fused verdicts (30 min): $gt";; esac
cmp=$(pg "select coalesce(round(avg(completeness)::numeric,3)::text,'-') from analytics.cplm_short_feature_results where window_kind='1m' and created_at > now() - interval '1 hour'")
case "$cmp" in -) warn "1m completeness: no rows in the last hour";; *) python3 -c "import sys; v=float('$cmp'); print(('OK   ' if v>=0.95 else 'WARN ')+' 1m completeness last hour: $cmp (expected >= 0.95)')";; esac

echo "== 6. cplm-api consumers (lag per topic, members)"
kf kafka-consumer-groups --bootstrap-server kafka-1:9092 --describe --group traverse-cpa-cplm-results | awk 'NR>1 && $6 ~ /^[0-9]+$/ {lag[$2]+=$6} END {for (t in lag) printf "      %-42s lag %s\n", t, lag[t]}'
for g in traverse-cpa-cplm-results traverse-cpa-cplm-results-frames traverse-cpa-cplm-evidence; do
  m=$(kf kafka-consumer-groups --bootstrap-server kafka-1:9092 --describe --group $g --members | grep -c -- '-sole'); [ "$m" -eq 1 ] && ok "$g: 1 member" || act "$g: $m members (must be exactly 1 - CLAUDE.md consumer rule)"
done

echo "== 7. evidence (bounds: TRANSIENT <= 2 GB and oldest <= 6 h; EPISODE levels off ~2 GB; STANDARD 3 d; RESPONSE <= its cap)"
pg "select retention_class||' '||count(*)||' manifests '||pg_size_pretty(sum(total_bytes))||' oldest '||to_char(min(created_at) at time zone 'utc','MM-DD HH24:MI') from analytics.evidence_manifest group by 1 order by 1" | sed 's/^/      /'
tb=$(pg "select coalesce(sum(total_bytes),0) from analytics.evidence_manifest where retention_class='TRANSIENT'"); [ "${tb:-0}" -le 2400000000 ] && ok "TRANSIENT payload within budget" || act "TRANSIENT payload above 2.4 GB: the sweep is not bounding - MARUN-DAILY-CHECK.md 7"
eb=$(pg "select coalesce(sum(total_bytes),0) from analytics.evidence_manifest where retention_class='EPISODE'"); [ "${eb:-0}" -le 3500000000 ] && ok "EPISODE payload within bound" || act "EPISODE payload above 3.5 GB: truncate lever: MARUN-DAILY-CHECK.md 7"
# CHG-105: System Response charts kept with their event; the sweeper trims the class to retention_policy RESPONSE max_bytes (2 GiB)
rb=$(pg "select coalesce(sum(total_bytes),0) from analytics.evidence_manifest where retention_class='RESPONSE'"); rcap=$(pg "select coalesce(max_bytes,0) from analytics.retention_policy where record_class='RESPONSE'")
if [ "${rcap:-0}" -eq 0 ]; then warn "RESPONSE charts: no cap set (cpm-21 not run?) - $(( ${rb:-0} / 1048576 )) MB"; elif [ "${rb:-0}" -le $(( rcap + rcap / 10 )) ]; then ok "RESPONSE charts $(( ${rb:-0} / 1048576 )) MB within the $(( rcap / 1048576 )) MB cap"; else act "RESPONSE charts above their cap: the sweeper is not trimming - MARUN-DAILY-CHECK.md 7"; fi
ep=$(pg "select count(*) filter (where opened_at > now()-interval '24 hours')||' opened / '||count(*) filter (where closed_at > now()-interval '24 hours')||' closed / '||count(*) filter (where closed_at is null)||' open now' from analytics.cplm_event_frames"); echo "      episodes 24 h: $ep"
# CHG-049: the files, not the payload sum - DELETE never shrinks them (2026-10-06: 1.9 GB payload "within budget", 3.7 GB on disk)
evmb=$(pg "select (pg_total_relation_size('analytics.evidence_chunk')+pg_total_relation_size('analytics.evidence_manifest'))/1048576")
if [ "${evmb:-0}" -gt 4096 ]; then act "evidence tables ${evmb} MB on disk - MARUN-DAILY-CHECK.md 7"; elif [ "${evmb:-0}" -gt 2560 ]; then warn "evidence tables ${evmb} MB on disk"; else ok "evidence tables ${evmb} MB on disk"; fi

echo "== 7b. CHG-102: evidence archive, on-demand evaluation, KPI history, IoTDB backup"
if [ "$(pg "select to_regclass('analytics.evidence_archive_run') is not null")" != "t" ]; then warn "evidence archive not installed (cpm-19) - boundary evidence ages out with the live rows"
else
  echo "      archive: $(pg "select count(*)||' sets, '||pg_size_pretty(coalesce(sum(payload_bytes),0))||' packed, oldest day '||coalesce(min(partition_day)::text,'-')||', newest window '||coalesce(to_char(max(window_end) at time zone 'utc','MM-DD HH24:MI'),'-')||' UTC' from analytics.evidence_archive_run")"
  # a boundary set every 12 h (plant 00:00 / 12:00) + 15 min settle + 5 min pass: none newer than 14 h = boundary emission or the archiver stopped
  age=$(pg "select coalesce(extract(epoch from now()-max(window_end))::int/3600, 999) from analytics.evidence_archive_run")
  [ "${age:-999}" -le 14 ] && ok "archive: newest boundary set ${age} h old" || act "archive: newest boundary set ${age} h old (> 14 h) - Long/Fusion boundary emission or the cplm-api archiver: MARUN-DAILY-CHECK.md 7b"
  ab=$(pg "select coalesce(sum(payload_bytes),0) from analytics.evidence_archive_run"); cap=$(pg "select coalesce(max_bytes,0) from analytics.retention_policy where record_class='EVIDENCE_ARCHIVE'")
  [ "${cap:-0}" -eq 0 ] || [ "${ab:-0}" -le $(( ${cap:-0} * 9 / 10 )) ] && ok "archive payload within 90 % of its cap" || warn "archive payload above 90 % of its cap - the oldest days go first; MARUN-DAILY-CHECK.md 7b"
  if [ "$(pg "select to_regclass('analytics.evidence_archive_kept') is not null")" = "t" ]; then
    echo "      kept past their day (pins / episodes): $(pg "select count(*)||' sets ('||count(*) filter (where kept_reason='PINNED')||' pinned), '||pg_size_pretty(coalesce(sum(payload_bytes),0)) from analytics.evidence_archive_kept")"
  else warn "evidence_archive_kept not installed (cpm-20b) - a pin keeps its whole archive day"; fi
fi
if [ "$(pg "select exists (select 1 from pg_constraint where conname='analysis_run_purpose_check' and pg_get_constraintdef(oid) like '%EVALUATE%')")" = "t" ]; then
  echo "      on-demand evaluations 24 h: $(pg "select coalesce(string_agg(state||'='||n, ' '),'none') from (select state, count(*) n from analytics.analysis_run where purpose='EVALUATE' and created_at > now()-interval '24 hours' group by 1) s")"
  nr=$(pg "select count(*) from analytics.analysis_run where purpose='EVALUATE' and created_at > now()-interval '24 hours' and error like 'NO_RESPONSE_FROM_EVALUATION_JOB%'")
  [ "${nr:-0}" -eq 0 ] && ok "on-demand: no evaluation timed out in 24 h" || act "on-demand: $nr evaluation(s) got no answer in 24 h - is 'AMS - CPLM On-Demand Evaluation' RUNNING? MARUN-DAILY-CHECK.md 7b"
else warn "on-demand evaluation not installed (cpm-20)"; fi
jm flink list -m localhost:8081 | grep '(RUNNING)' | grep -q 'CPLM On-Demand Evaluation' && ok "On-Demand Evaluation job RUNNING" || warn "On-Demand Evaluation job not RUNNING - the Workbench 'Evaluate a window' times out; resubmit with 04b"
if [ "$(pg "select to_regclass('analytics.cplm_kpi_daily') is not null")" = "t" ]; then
  kd=$(pg "select coalesce((current_date - max(day))::text, 'none') from analytics.cplm_kpi_daily")
  case "$kd" in 0|1) ok "KPI daily history: newest plant day ${kd} day(s) back";; none) warn "KPI daily history: empty (cpm-18 applied, the hourly job has not stored a day yet)";; *) act "KPI daily history: newest day $kd days back - FleetKpiDailyJob stopped? MARUN-DAILY-CHECK.md 7b";; esac
fi
# CHG-102 Phase 8: the historian is the only copy of history beyond the Postgres hot window (cron.d/cpa-iotdb-backup)
bk=$(ls -1d /var/backups/ams/iotdb/iotdb-backup-* 2>/dev/null | sort | tail -1)
if [ -z "$bk" ]; then act "IoTDB backup: none under /var/backups/ams/iotdb - install cron.d/cpa-iotdb-backup (MARUN-DAILY-CHECK.md 7b)"
else
  bage=$(( ( $(date +%s) - $(stat -c %Y "$bk") ) / 3600 ))
  if [ "$bage" -gt 30 ]; then act "IoTDB backup: newest $(basename "$bk") is ${bage} h old (> 30 h)"
  elif awk '/^result:/ { exit !($2 == $4) } END { if (NR == 0) exit 1 }' "$bk/MANIFEST.txt" 2>/dev/null && grep -q '^result:' "$bk/MANIFEST.txt"; then ok "IoTDB backup: $(basename "$bk") $(grep '^result:' "$bk/MANIFEST.txt" | cut -d' ' -f2-) ($(du -sh "$bk" | cut -f1))"
  else warn "IoTDB backup: $(basename "$bk") incomplete - $bk/MANIFEST.txt"; fi
fi

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
