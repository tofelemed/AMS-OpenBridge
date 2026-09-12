#!/usr/bin/env bash
# =====================================================================
# CPM loop validation — 12 h gate investigation, one pass.
#
#   ./scripts/validate-loops.sh                 # default loop set, 12 h
#   ./scripts/validate-loops.sh -H 24           # 24 h window
#   ./scripts/validate-loops.sh -l "FIC10409 LIC10501"
#   ./scripts/validate-loops.sh -s 4            # jump straight to step 4
#   ./scripts/validate-loops.sh -o              # ALSO keep the evidence on disk
#   OUTDIR=/var/tmp/run1 ./scripts/validate-loops.sh -o     # choose the folder
#
# Read-only against the plant: every command is a SELECT, a GET, or a topic
# read. -o only writes to the local report directory, never to a service.
#
# WITHOUT -o nothing is kept — output goes to the terminal and is lost when it
# closes. With -o you get, under cpm-validation-<UTC timestamp>/ by default:
#     report.txt            the full console transcript
#     findings.txt          just the FINDING lines, for the review record
#     payload-<LOOP>.json   each loop's latest 12h gate payload, pretty-printed
#     gates.csv             one row per loop x window: all 16 gates + diagnosis
#   plus <dir>.tar.gz alongside it, so copy-back is a single scp.
# Every step prints either "ok" or "FINDING:" lines — grep for FINDING.
# =====================================================================
set -uo pipefail

LOOPS_DEFAULT="FIC10409 FIC10509 FIC10501 FIC10502 LIC10501 PIC00605 PIC80143 PIC80141 FIC80103 PIC80140"
LOOPS="${LOOPS:-$LOOPS_DEFAULT}"
HOURS="${HOURS:-12}"
ONLY_STEP=""

PG="${PG:-ams-postgres}"
PGUSER="${PGUSER:-ams_user}"
PGDB="${PGDB:-traverse_cplm}"
KAFKA="${KAFKA:-ams-kafka}"
BROKER="${BROKER:-localhost:9092}"
GW="${GW:-http://127.0.0.1:8081}"
FLINK="${FLINK:-http://127.0.0.1:8082}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-}"
SAMPLES_TOPIC="${SAMPLES_TOPIC:-traverse.cpa.loop.samples.v1}"
META_TOPIC="${META_TOPIC:-traverse.cpa.ams.metadata.updates}"

# -o is a flag (bash getopts has no optional-argument form). Choose the
# directory with OUTDIR=/path, or let it default to a timestamped one here.
OUTDIR_SET=""
OUTDIR="${OUTDIR:-}"
while getopts "l:H:s:oh" o; do
  case "$o" in
    l) LOOPS="$OPTARG" ;;
    H) HOURS="$OPTARG" ;;
    s) ONLY_STEP="$OPTARG" ;;
    o) OUTDIR_SET=1 ;;
    h) sed -n '2,24p' "$0"; exit 0 ;;
    *) exit 2 ;;
  esac
done
if [ -n "$OUTDIR_SET" ] || [ -n "$OUTDIR" ]; then
  OUTDIR="${OUTDIR:-cpm-validation-$(date -u +%Y%m%dT%H%M%SZ)}"
else
  OUTDIR=""
fi

# Tee everything from here on. stdout becomes a pipe, so the colour guard below
# turns itself off and the transcript stays free of escape codes.
if [ -n "$OUTDIR" ]; then
  mkdir -p "$OUTDIR" || { echo "cannot create $OUTDIR" >&2; exit 1; }
  exec 3>&1 4>&2                       # keep the real terminal for the trap
  exec > >(tee "$OUTDIR/report.txt") 2>&1
fi

# The archive must be built AFTER tee has flushed, or report.txt inside it is
# truncated. Restore the original fds first so tee sees EOF and exits.
archive_on_exit() {
  [ -n "$OUTDIR" ] || return 0
  command -v tar >/dev/null 2>&1 || return 0
  exec 1>&3 2>&4 3>&- 4>&-
  sleep 0.3
  grep -E 'FINDING' "$OUTDIR/report.txt" 2>/dev/null | sed 's/^ *//' > "$OUTDIR/findings.txt"
  T="${OUTDIR%/}.tar.gz"
  if tar -czf "$T" -C "$(dirname "$OUTDIR")" "$(basename "$OUTDIR")" 2>/dev/null; then
    printf '   archive: %s  (%s)  <- copy this one file back
'       "$T" "$(du -h "$T" 2>/dev/null | cut -f1)"
  fi
}
trap archive_on_exit EXIT

# ── helpers ──────────────────────────────────────────────────────────
BOLD=$'\033[1m'; RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; OFF=$'\033[0m'
[ -t 1 ] || { BOLD=""; RED=""; GRN=""; YEL=""; OFF=""; }

hdr()  { printf '\n%s== %s %s%s\n' "$BOLD" "$1" "$(printf '=%.0s' $(seq 1 $((66-${#1}))))" "$OFF"; }
ok()   { printf '   %sok%s   %s\n' "$GRN" "$OFF" "$1"; }
find_(){ printf '   %sFINDING%s  %s\n' "$RED" "$OFF" "$1"; }
warn() { printf '   %snote%s %s\n' "$YEL" "$OFF" "$1"; }
skip() { [ -n "$ONLY_STEP" ] && [ "$ONLY_STEP" != "$1" ]; }

# SQL list literal:  FIC10409 FIC10509  ->  'FIC10409','FIC10509'
sql_list() { printf "%s" "$(echo "$LOOPS" | tr ' ' '\n' | sed "/^$/d;s/.*/'&'/" | paste -sd, -)"; }
# grep alternation: FIC10409|FIC10509
re_list()  { printf "%s" "$(echo "$LOOPS" | tr ' ' '|' | sed 's/|$//')"; }

have() { command -v "$1" >/dev/null 2>&1; }
HAVE_PY3=""; have python3 && HAVE_PY3=1
have docker || { echo "docker not on PATH — run as a user in the docker group, or with sudo" >&2; exit 1; }
have curl   || echo "note: curl missing — the gateway and Flink checks will be skipped" >&2

# Marun's Postgres is Instrumental's container, not ours, so its pg_hba may not
# trust a local-socket connection for ams_user. Pass PGPASSWORD through when set;
# an EMPTY one is worse than none (psql would send a blank password instead of
# falling back), so the flag is only added when there is something to send.
_pgexec() {
  if [ -n "${PGPASSWORD:-}" ]; then
    docker exec -i -e PGPASSWORD="$PGPASSWORD" "$PG" "$@"
  else
    docker exec -i "$PG" "$@"
  fi
}
q() { _pgexec psql -U "$PGUSER" -d "$PGDB" -qAt -F'|' -c "$1" 2>&1; }
Q() { _pgexec psql -U "$PGUSER" -d "$PGDB" -c "$1" 2>&1; }

IDS="$(sql_list)"
SINCE="NOW() - INTERVAL '$HOURS hours'"
# The gate engine only ever emits these two kinds (CplmGateFusionStreamJob:108 drops
# anything else), and -H used to change only this header and the lookback while every
# gate query stayed pinned to '12h' - so `-H 24` printed "window=24h" over 12 h results.
case "$HOURS" in
  12) WKIND=12h ;;
  24) WKIND=24h ;;
  *)  echo "ERROR: -H must be 12 or 24; the gate engine produces no other window kind." >&2
      exit 2 ;;
esac

echo "${BOLD}CPM loop validation${OFF}   loops=$(echo "$LOOPS" | wc -w)   window=${HOURS}h (gate window_kind=$WKIND)   db=$PGDB"
echo "$LOOPS" | tr ' ' '\n' | sed 's/^/   /' | paste -sd' ' -

# ── 1. reachability ──────────────────────────────────────────────────
if ! skip 1; then
hdr "1. Reachability"
if docker exec "$PG" pg_isready -U "$PGUSER" -d "$PGDB" >/dev/null 2>&1; then
  ok "postgres $PG / $PGDB"
else
  find_ "cannot reach $PG — check the container name (docker ps)"; exit 1
fi
docker exec "$KAFKA" bash -c "kafka-topics --bootstrap-server $BROKER --list" >/dev/null 2>&1 \
  && ok "kafka $KAFKA" || find_ "cannot reach kafka $KAFKA (steps 3 and 7 will fail)"
curl -sf -m 10 "$GW/health" >/dev/null 2>&1 || curl -sf -m 10 "$GW" >/dev/null 2>&1 \
  && ok "gateway $GW" || warn "gateway not answering — API steps will be skipped"
fi

# ── 2. configuration ─────────────────────────────────────────────────
if ! skip 2; then
hdr "2. Configuration — registered, monitored, roles, ranges"
Q "SELECT s.loop_id,
       COALESCE(r.loop_type,'** NOT REGISTERED **') AS type,
       COALESCE(r.monitoring->>'enabled','-')       AS mon,
       COALESCE(r.site||'/'||r.area||'/'||r.unit,'-') AS location,
       (SELECT string_agg(m.signal_role,',' ORDER BY m.signal_role)
          FROM cpm.loop_tag_map m WHERE m.loop_id=r.loop_id) AS roles,
       COALESCE((r.engineering->>'pvMin')||'..'||(r.engineering->>'pvMax'),'-') AS pv_range,
       COALESCE((r.engineering->>'opMin')||'..'||(r.engineering->>'opMax'),'-') AS op_range,
       CASE WHEN r.engineering ? 'pvMin' AND r.engineering ? 'pvMax'
              AND (r.engineering->>'pvMax')::numeric > (r.engineering->>'pvMin')::numeric
            THEN round(0.005*((r.engineering->>'pvMax')::numeric-(r.engineering->>'pvMin')::numeric),4)
            ELSE 0.5 END AS g3_band_eu
FROM (SELECT unnest(ARRAY[$IDS]) AS loop_id) s
LEFT JOIN cpm.loop_registry r ON r.loop_id=s.loop_id
ORDER BY 1;"

n=$(q "SELECT count(*) FROM (SELECT unnest(ARRAY[$IDS]) l) s
        LEFT JOIN cpm.loop_registry r ON r.loop_id=s.l WHERE r.loop_id IS NULL;")
[ "$n" = "0" ] && ok "all loops registered" || find_ "$n loop(s) NOT registered — nothing downstream can work"

n=$(q "SELECT count(*) FROM cpm.loop_registry r WHERE r.loop_id IN ($IDS)
        AND (SELECT count(*) FROM cpm.loop_tag_map m
              WHERE m.loop_id=r.loop_id AND m.signal_role IN ('PV','SP','OP','MODE'))<4;")
[ "$n" = "0" ] && ok "all have PV/SP/OP/MODE mapped" || find_ "$n loop(s) missing a required signal role"

n=$(q "SELECT count(*) FROM cpm.loop_registry WHERE loop_id IN ($IDS)
        AND NOT (COALESCE(engineering,'{}'::jsonb) ? 'pvMin');")
[ "$n" = "0" ] && ok "all declare a PV range" || warn "$n loop(s) have no PV range — G3 uses the flat 0.5 EU band"
fi

# ── 3. feed ──────────────────────────────────────────────────────────
if ! skip 3; then
hdr "3. Did data arrive in the last ${HOURS}h?"
Q "SELECT s.loop_id,
       count(f.id) FILTER (WHERE f.window_kind='1m')  AS win_1m,
       count(f.id) FILTER (WHERE f.window_kind='60m') AS win_60m,
       round(avg(f.completeness)::numeric,3)          AS completeness,
       round(avg(f.sample_count)::numeric,1)          AS avg_samples,
       max(f.window_end)                              AS last_window,
       CASE WHEN count(f.id)=0 THEN '** NO DATA **'
            WHEN max(f.window_end) < NOW()-INTERVAL '30 minutes' THEN 'STALE'
            ELSE 'flowing' END                        AS feed
FROM (SELECT unnest(ARRAY[$IDS]) AS loop_id) s
LEFT JOIN analytics.cplm_short_feature_results f
       ON f.loop_id=s.loop_id AND f.window_start >= $SINCE
GROUP BY s.loop_id ORDER BY 1;"

n=$(q "SELECT count(*) FROM (SELECT unnest(ARRAY[$IDS]) l) s
        WHERE NOT EXISTS (SELECT 1 FROM analytics.cplm_short_feature_results f
                           WHERE f.loop_id=s.l AND f.window_start >= $SINCE);")
[ "$n" = "0" ] && ok "every loop produced windows" \
  || find_ "$n loop(s) produced NO windows — ingestion problem, not a gate problem (step 4)"
fi

# ── 4. ingestion / tuple shape ───────────────────────────────────────
if ! skip 4; then
hdr "4. Ingestion — tuple shape on $SAMPLES_TOPIC"
TUPLES=$(docker exec "$KAFKA" bash -c \
  "kafka-console-consumer --bootstrap-server $BROKER --topic $SAMPLES_TOPIC \
   --timeout-ms 20000 --max-messages 600" 2>/dev/null \
   | grep -E "\"loop_id\":\"($(re_list))\"")
c=$(printf '%s' "$TUPLES" | grep -c . )
if [ "$c" = "0" ]; then
  find_ "no tuples for these loops in a 20 s sample — check the OT feed"
else
  ok "$c tuple(s) sampled"
  printf '%s\n' "$TUPLES" | tail -2 | sed 's/^/       /'
  bad=$(printf '%s\n' "$TUPLES" | grep -cE '"mode":"[0-9]+"')
  [ "$bad" = "0" ] && ok "mode is a token everywhere" \
    || find_ "$bad tuple(s) carry a RAW NUMERIC mode — mode_value_map is wrong, G1 will exclude every window"
  bq=$(printf '%s\n' "$TUPLES" | grep -cE '"quality":"(BAD|UNCERTAIN)"')
  [ "$bq" = "0" ] && ok "quality GOOD on every sampled tuple" || warn "$bq tuple(s) not GOOD — feeds G0"
  eq=$(printf '%s\n' "$TUPLES" | python3 -c '
import sys,json
same=0; tot=0
for l in sys.stdin:
    try: j=json.loads(l)
    except Exception: continue
    tot+=1
    if j.get("event_ts_ms")==j.get("ingest_ts_ms"): same+=1
print(same)' 2>/dev/null || echo "?")
  [ "$eq" = "0" ] && ok "event_ts_ms differs from ingest_ts_ms (process time carried)" \
    || warn "$eq tuple(s) have event_ts_ms == ingest_ts_ms"
  dup=$(printf '%s\n' "$TUPLES" | python3 -c '
import sys,json,collections
c=collections.Counter()
for l in sys.stdin:
    try: j=json.loads(l)
    except Exception: continue
    c[(j.get("loop_id"),j.get("event_ts_ms"))]+=1
print(sum(1 for v in c.values() if v>1))' 2>/dev/null || echo "?")
  [ "$dup" = "0" ] && ok "no duplicate (loop, event_ts_ms)" \
    || find_ "$dup duplicated timestamp(s) — two data sources on overlapping topics"
fi
fi

# ── 5. verdict ───────────────────────────────────────────────────────
if ! skip 5; then
hdr "5. Current ${WKIND} verdict — all 16 gates"
Q "WITH latest AS (
     SELECT DISTINCT ON (g.loop_id) g.* FROM analytics.cplm_gate_results g
      WHERE g.loop_id IN ($IDS) AND g.window_kind='$WKIND'
      ORDER BY g.loop_id, g.window_end DESC)
SELECT s.loop_id, COALESCE(to_char(l.window_end,'MM-DD HH24:MI'),'-') AS win,
       COALESCE(l.payload->'gates'->>'G0','-')  AS g0,
       COALESCE(l.payload->'gates'->>'G1','-')  AS g1,
       COALESCE(l.payload->'gates'->>'G2','-')  AS g2,
       COALESCE(l.payload->'gates'->>'G2r','-') AS g2r,
       COALESCE(l.payload->'gates'->>'G3','-')  AS g3,
       COALESCE(l.payload->'gates'->>'G4','-')  AS g4,
       COALESCE(l.payload->'gates'->>'G5','-')  AS g5,
       COALESCE(l.payload->'gates'->>'G6','-')  AS g6,
       COALESCE(l.payload->'gates'->>'G7','-')  AS g7,
       COALESCE(l.payload->'gates'->>'G8','-')  AS g8,
       COALESCE(l.payload->'gates'->>'G9','-')  AS g9,
       COALESCE(l.payload->'gates'->>'G10','-') AS g10,
       COALESCE(l.payload->'gates'->>'G11','-') AS g11,
       COALESCE(l.payload->'gates'->>'G14','-') AS g14,
       COALESCE(l.payload->'gates'->>'G15','-') AS g15,
       COALESCE(l.diagnosis,'-') AS diagnosis,
       round(l.confidence::numeric,3) AS conf
FROM (SELECT unnest(ARRAY[$IDS]) AS loop_id) s
LEFT JOIN latest l ON l.loop_id=s.loop_id ORDER BY 1;"
warn "STRONG is NOT good — on G4/G7/G8/G9 it is strong evidence of a FAULT."
warn "conf exactly 0.890 = the G14 no-VP cap demoting CONFIRMED to SUSPECTED."
fi

# ── 6. blocking ──────────────────────────────────────────────────────
if ! skip 6; then
hdr "6. What is blocking — first exclusion that fires"
Q "WITH latest AS (
     SELECT DISTINCT ON (g.loop_id) g.* FROM analytics.cplm_gate_results g
      WHERE g.loop_id IN ($IDS) AND g.window_kind='$WKIND'
      ORDER BY g.loop_id, g.window_end DESC)
SELECT s.loop_id, COALESCE(l.diagnosis,'NO 12h VERDICT') AS diagnosis,
       CASE WHEN l.loop_id IS NULL THEN 'no verdict row at all'
            WHEN (l.payload->>'sufficient_data')::boolean IS FALSE THEN '1. INSUFFICIENT_DATA'
            WHEN l.payload->'gates'->>'G0'='FAIL'      THEN '2. G0 data quality'
            WHEN l.payload->'gates'->>'G1'='EXCLUDED'  THEN '3. G1 mode/service'
            WHEN l.payload->'gates'->>'G2r'='FAIL'     THEN '4. G2r operating region'
            WHEN l.payload->'gates'->>'G11'='WARN'
             AND (l.payload->>'freeze_index_s')::numeric>=60 THEN '5. G11 sensor freeze'
            ELSE 'not blocked' END AS blocked_by,
       l.payload->>'selected_family' AS family,
       l.payload->>'observability_flags' AS flags
FROM (SELECT unnest(ARRAY[$IDS]) AS loop_id) s
LEFT JOIN latest l ON l.loop_id=s.loop_id ORDER BY 1;"
fi

# ── 7. why — the numbers ─────────────────────────────────────────────
if ! skip 7; then
hdr "7a. G0 data quality"
Q "SELECT f.loop_id,
       round(avg((f.payload->>'completeness')::numeric),4)    AS completeness,
       round(avg((f.payload->>'bad_quality_pct')::numeric),4) AS bad_quality,
       sum((f.payload->>'duplicate_timestamps')::int)         AS dup_ts,
       sum((f.payload->>'gap_count')::int)                    AS gaps,
       round(max((f.payload->>'max_gap_s')::numeric),1)       AS max_gap_s,
       count(*) FILTER (WHERE f.payload->>'gate0_status'='FAIL') AS g0_fail
FROM analytics.cplm_short_feature_results f
WHERE f.loop_id IN ($IDS) AND f.window_kind='60m' AND f.window_start >= $SINCE
GROUP BY 1 ORDER BY 1;"

hdr "7b. G1 mode — auto_pct"
Q "SELECT f.loop_id, round(avg(f.auto_pct)::numeric,4) AS auto_pct,
       round(min(f.auto_pct)::numeric,4) AS auto_min,
       count(*) FILTER (WHERE f.payload->>'gate1_status'='EXCLUDED') AS excluded_windows,
       CASE WHEN avg(f.auto_pct)<0.05 THEN 'ZERO auto: if other loops here show 1.0 the map is fine and this loop is genuinely in MAN'
            WHEN avg(f.auto_pct)<0.70 THEN 'genuinely manual'
            ELSE 'ok' END AS note
FROM analytics.cplm_short_feature_results f
WHERE f.loop_id IN ($IDS) AND f.window_kind='60m' AND f.window_start >= $SINCE
GROUP BY 1 ORDER BY 1;"

hdr "7c. G3 control error — mae vs the band it is measured against"
Q "SELECT f.loop_id, round(avg(f.good_error_pct)::numeric,4) AS good_error_pct,
       round(avg(f.mae)::numeric,4) AS mae,
       CASE WHEN r.engineering ? 'pvMin' AND r.engineering ? 'pvMax'
              AND (r.engineering->>'pvMax')::numeric>(r.engineering->>'pvMin')::numeric
            THEN round(0.005*((r.engineering->>'pvMax')::numeric-(r.engineering->>'pvMin')::numeric),4)
            ELSE 0.5 END AS band_eu,
       round(avg((f.payload->>'oce')::numeric),4) AS oce
FROM analytics.cplm_short_feature_results f
JOIN cpm.loop_registry r ON r.loop_id=f.loop_id
WHERE f.loop_id IN ($IDS) AND f.window_kind='60m' AND f.window_start >= $SINCE
GROUP BY 1, r.engineering ORDER BY 1;"
warn "mae >> band_eu means good_error_pct is 0 by arithmetic, not by control quality."

hdr "7d. G4 / G10 effort and saturation"
Q "SELECT f.loop_id, round(avg(f.effort_ratio)::numeric,3) AS effort_ratio,
       round(avg((f.payload->>'saturation_pct')::numeric),4) AS saturation,
       round(avg((f.payload->>'op_std')::numeric),3) AS op_std,
       round(avg(f.travel_per_day)::numeric,1) AS travel_day,
       count(*) FILTER (WHERE f.payload->>'gate4_status'='STRONG') AS g4_strong
FROM analytics.cplm_short_feature_results f
WHERE f.loop_id IN ($IDS) AND f.window_kind='60m' AND f.window_start >= $SINCE
GROUP BY 1 ORDER BY 1;"
fi

# ── 8. stability ─────────────────────────────────────────────────────
if ! skip 8; then
hdr "8. Stability across the window"
Q "SELECT g.loop_id, count(*) AS verdicts, count(DISTINCT g.diagnosis) AS distinct_dx,
       string_agg(DISTINCT g.diagnosis,' | ') AS diagnoses,
       round(min(g.confidence)::numeric,3) AS conf_min,
       round(max(g.confidence)::numeric,3) AS conf_max
FROM analytics.cplm_gate_results g
WHERE g.loop_id IN ($IDS) AND g.window_kind='$WKIND' AND g.window_end >= $SINCE
GROUP BY 1 ORDER BY 1;"
fi

# ── 9. engineering broadcast ─────────────────────────────────────────
if ! skip 9; then
hdr "9. Did the engineering ranges reach Flink?"
BC=$(docker exec "$KAFKA" bash -c \
  "kafka-console-consumer --bootstrap-server $BROKER --topic $META_TOPIC \
   --from-beginning --timeout-ms 15000" 2>/dev/null \
   | grep -E "\"calcInstanceId\":\"($(re_list))\"")
for L in $LOOPS; do
  if printf '%s\n' "$BC" | grep -q "\"calcInstanceId\":\"$L\""; then
    if printf '%s\n' "$BC" | grep "\"calcInstanceId\":\"$L\"" | grep -q 'cplm.loop.engineering'; then
      ok "$L — engineering broadcast present"
    else
      find_ "$L — evidence broadcast but NO cplm.loop.engineering: ranges are invisible to the engine"
    fi
  else
    find_ "$L — no broadcast at all: run POST /api/v1/cpm/loops/$L/republish-evidence"
  fi
done
fi

# ── 10. engine health ────────────────────────────────────────────────
if ! skip 10; then
hdr "10. Engine health"
if [ -z "$HAVE_PY3" ]; then
  warn "python3 not found — showing raw Flink job states"
  curl -s -m 15 "$FLINK/jobs/overview" 2>/dev/null     | tr ',' '
' | grep -iE '"name"|"state"|start-time' | sed 's/^/   /' | head -30
else
curl -s -m 15 "$FLINK/jobs/overview" 2>/dev/null | python3 -c '
import sys,json,datetime
try: d=json.load(sys.stdin)
except Exception: print("   could not read Flink overview"); raise SystemExit
for j in d.get("jobs",[]):
    if "CPLM" in j["name"]:
        t=datetime.datetime.fromtimestamp(j["start-time"]/1000)
        print("   %-34s %-9s started %s" % (j["name"], j["state"], t.strftime("%Y-%m-%d %H:%M")))
' 2>/dev/null || warn "Flink not reachable at $FLINK"
fi
warn "A job started BEFORE the last deploy is running the OLD jar."
warn "Lab only: ZooKeeper HA would recover the previous JobGraph + jar. Marun has NO HA -"
warn "removing both Flink containers really does destroy every job, which is how a deploy lands."
for G in traverse-cpa-cplm-results ams-api-cplm-results-frames; do
  m=$(docker exec "$KAFKA" bash -c \
      "kafka-consumer-groups --bootstrap-server $BROKER --describe --group $G 2>/dev/null" \
      | awk 'NR>1 && NF>1 {print $NF}' | grep -v '^-$' | sort -u | grep -c . )
  [ "$m" = "1" ] && ok "$G — single consumer" \
    || find_ "$G — $m members; two split the partitions and each persists a subset silently"
done
fi

# ── 11. keep the evidence ────────────────────────────────────────────
if [ -n "$OUTDIR" ] && [ -z "$ONLY_STEP" ]; then
hdr "11. Saving evidence to $OUTDIR"

# One JSON per loop — the same payload you would otherwise copy by hand.
for L in $LOOPS; do
  P=$(q "SELECT jsonb_pretty(payload) FROM analytics.cplm_gate_results
          WHERE loop_id='$L' AND window_kind='$WKIND'
          ORDER BY window_end DESC LIMIT 1;")
  if [ -n "$P" ] && [ "${P:0:1}" = "{" ]; then
    printf '%s\n' "$P" > "$OUTDIR/payload-$L.json"
    ok "payload-$L.json"
  else
    warn "$L — no 12h payload to save"
  fi
done

# One CSV row per loop x window across the whole window: the review record.
_pgexec psql -U "$PGUSER" -d "$PGDB" -qAt -F',' -c \
"COPY (
  SELECT g.loop_id, g.window_kind, g.window_start, g.window_end, g.sample_count,
         g.payload->'gates'->>'G0'  AS g0,  g.payload->'gates'->>'G1'  AS g1,
         g.payload->'gates'->>'G2'  AS g2,  g.payload->'gates'->>'G2r' AS g2r,
         g.payload->'gates'->>'G3'  AS g3,  g.payload->'gates'->>'G4'  AS g4,
         g.payload->'gates'->>'G5'  AS g5,  g.payload->'gates'->>'G6'  AS g6,
         g.payload->'gates'->>'G7'  AS g7,  g.payload->'gates'->>'G8'  AS g8,
         g.payload->'gates'->>'G9'  AS g9,  g.payload->'gates'->>'G10' AS g10,
         g.payload->'gates'->>'G11' AS g11, g.payload->'gates'->>'G12' AS g12,
         g.payload->'gates'->>'G13' AS g13, g.payload->'gates'->>'G14' AS g14,
         g.payload->'gates'->>'G15' AS g15,
         g.diagnosis, g.severity, g.confidence,
         g.good_error_pct, g.mae, g.effort_ratio,
         g.payload->>'auto_pct'            AS auto_pct,
         g.payload->>'completeness'        AS completeness,
         g.payload->>'saturation_pct'      AS saturation_pct,
         g.payload->>'observability_flags' AS observability_flags
  FROM analytics.cplm_gate_results g
  WHERE g.loop_id IN ($IDS) AND g.window_end >= $SINCE
  ORDER BY g.loop_id, g.window_kind, g.window_end
) TO STDOUT WITH CSV HEADER;" > "$OUTDIR/gates.csv" 2>/dev/null

rows=$(( $(wc -l < "$OUTDIR/gates.csv") - 1 ))
[ "$rows" -gt 0 ] && ok "gates.csv — $rows verdict row(s)" || warn "gates.csv is empty (no verdicts in window)"

grep -E 'FINDING' "$OUTDIR/report.txt" 2>/dev/null | sed 's/^ *//' > "$OUTDIR/findings.txt"
nf=$(grep -c . "$OUTDIR/findings.txt" 2>/dev/null || echo 0)
{ echo "run:     $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "host:    $(hostname 2>/dev/null || echo '?')"
  echo "window:  ${HOURS}h (gate window_kind=$WKIND)   db: $PGDB   gateway: $GW"
  echo "loops:   $LOOPS"
  echo "findings: $nf"; } > "$OUTDIR/run.txt"
[ "$nf" = "0" ] && ok "findings.txt — none" || find_ "findings.txt — $nf line(s)"

fi

hdr "Done"
if [ -n "$OUTDIR" ]; then
  echo "   Evidence kept in: $OUTDIR"
  ls -1 "$OUTDIR" 2>/dev/null | sed 's/^/     /'
else
  echo "   Nothing was saved — re-run with -o to keep the evidence on disk."
fi
echo "   Re-read anything marked FINDING above. Full per-gate detail:"
echo "     scripts/cpm-validate-loops.sql   (sections 5-13)"
echo "   Interpretation: docs/cpm-loop-validation-runbook.md"
