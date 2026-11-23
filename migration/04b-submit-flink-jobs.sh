#!/usr/bin/env bash
# Phase 7 — submit the four CPA Flink jobs (Fusion last).
# Prefixed topics + traverse-cpa- groups. Skip if already RUNNING.
# Refuse until ALLOW_FLINK_SUBMIT=yes (ops confirm on Marun; JobManager must be up).
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_env

if [[ "${ALLOW_FLINK_SUBMIT:-}" != yes ]]; then
  die "refusing Flink submit without ALLOW_FLINK_SUBMIT=yes (ops confirm on Marun).
Jobs already default to ${TOPIC_PREFIX}* (see flink/JOBS.md). JobManager must be running."
fi

require_container "$KAFKA_CONTAINER"
require_container "$FLINK_JOBMANAGER_CONTAINER"

JM="${FLINK_JOBMANAGER_CONTAINER}"
JM_PORT="${FLINK_JOBMANAGER_PORT}"
JAR="${FLINK_JAR_PATH}"
BROKERS="${KAFKA_BOOTSTRAP_INTERNAL}"
GROUP="${CPLM_CONSUMER_GROUP:-traverse-cpa-flink-cplm}"

INPUT_TOPIC="${CPLM_INPUT_TOPIC:-traverse.cpa.loop.samples.v1}"
SHORT_TOPIC="${CPLM_SHORT_FEATURE_TOPIC:-traverse.cpa.clpm.feature.short.v1}"
LONG_TOPIC="${CPLM_LONG_FEATURE_TOPIC:-traverse.cpa.clpm.feature.long.v1}"
OUTPUT_TOPIC="${CPLM_OUTPUT_TOPIC:-traverse.cpa.clpm.gate.results.v1}"
LIVE_TOPIC="${CPLM_LIVE_TOPIC:-traverse.cpa.live.loop.metrics}"

for t in "$INPUT_TOPIC" "$SHORT_TOPIC" "$LONG_TOPIC" "$OUTPUT_TOPIC" "$LIVE_TOPIC"; do
  [[ "$t" == "${TOPIC_PREFIX}"* ]] || die "refusing unprefixed topic flag: $t"
done

flink() {
  docker exec "$JM" /opt/flink/bin/flink "$@"
}

rest() {
  docker exec "$JM" curl -sf "http://localhost:${JM_PORT}$1"
}

job_present() {
  flink list -m "localhost:${JM_PORT}" 2>/dev/null \
    | grep -F "$1" | grep -qE '\((CREATED|INITIALIZING|RUNNING|RESTARTING|RECONCILING)\)'
}

# CHG-226: optional resume from a savepoint for the two jobs whose memory takes hours to refill (Long: the 12 h / 24 h
# windows; Fusion: the persistence history and open conditions). The lines come from migration/flink-stop-with-savepoint.sh.
# Not set = a fresh submit, exactly as before. Never put them in migration/.env: a later release would restore an old state.
#   RESUME_LONG_FROM=s3://ams-flink/savepoints/savepoint-...    (+ RESUME_LONG_ALLOW_NON_RESTORED=yes only when the lab
#                                                                 rehearsal of this jar needed it)
#   RESUME_FUSION_FROM=s3://ams-flink/savepoints/savepoint-...  (always --allowNonRestoredState: its Kafka sources have no uid)
# RESUME_MAX_AGE_MIN (240) refuses an older savepoint: the topics it resumes from keep 6 h (long features) / 12 h (samples).
# RESUME_VERIFY_TIMEOUT_S (900) bounds the restore check at the end. The Response job is stateless by rule and the other
# jobs refill within the hour: they always start fresh. Procedure: docs/next-release/flink-savepoint-procedure.md.
unset JOB_RESUME_FROM JOB_ALLOW_NON_RESTORED   # set per call below, never inherited
RESUMED=()                                      # "job id|savepoint|name", checked at the end

check_resume_path() {
  local path="$1" obj mtime age max="${RESUME_MAX_AGE_MIN:-240}"
  [[ "$path" == s3://*/* ]] || die "resume path '$path' is not an s3:// savepoint path"
  obj="/data/${path#s3://}"; obj="${obj%/}"; obj="${obj%/_metadata}"
  require_container "$MINIO_CONTAINER"
  mtime="$(docker exec "$MINIO_CONTAINER" stat -c %Y "$obj/_metadata" 2>/dev/null)" \
    || die "no savepoint at $path ($obj/_metadata not in $MINIO_CONTAINER): deleted or mistyped. Unset the variable for a fresh submit"
  age=$(( ($(date +%s) - mtime) / 60 ))
  (( age <= max )) || die "savepoint $path is $age min old (limit $max min): Kafka no longer holds everything after it. Unset the variable for a fresh submit"
  info "savepoint $path found, $age min old"
}

submit_if_missing() {
  local name="$1" class="$2"
  shift 2
  local n out jid restore=()
  n="$(flink list -m "localhost:${JM_PORT}" 2>/dev/null | grep -F "$name" | grep -cE '\((CREATED|INITIALIZING|RUNNING|RESTARTING|RECONCILING)\)' || true)"
  if [[ "${n:-0}" -gt 1 ]]; then
    warn "$n copies of '$name' already present — not submitting another"
    return 0
  fi
  if [[ "${n:-0}" -ge 1 ]]; then
    ok "'$name' already present — skip"
    [[ -z "${JOB_RESUME_FROM:-}" ]] || warn "'$name' still runs, so it is NOT restored from $JOB_RESUME_FROM (stop it with flink-stop-with-savepoint.sh first)"
    return 0
  fi
  if [[ -n "${JOB_RESUME_FROM:-}" ]]; then
    check_resume_path "$JOB_RESUME_FROM"
    restore=(-s "$JOB_RESUME_FROM")
    if [[ "${JOB_ALLOW_NON_RESTORED:-}" == yes ]]; then restore+=(--allowNonRestoredState); fi
  fi
  info "submitting $class as '$name' (parallelism ${SUBMIT_PARALLELISM:-1})${JOB_RESUME_FROM:+, restoring from $JOB_RESUME_FROM}"
  # Marun 2026-09-27: six sliding windows over 142 loops saturate one core; a job that cannot keep up
  # falls behind on every partition and its results arrive late for ever. SUBMIT_PARALLELISM is set per
  # call below from migration/.env (deploy.sh exports it); a keyed job spreads its windows across cores.
  # A restored job keeps its savepoint's max parallelism (128): any parallelism up to that restores.
  out="$(flink run -d -p "${SUBMIT_PARALLELISM:-1}" -m "localhost:${JM_PORT}" ${restore[@]+"${restore[@]}"} -c "$class" "$JAR" "$@" 2>&1)" \
    || { printf '%s\n' "$out"; die "submit of '$name' failed"; }
  printf '%s\n' "$out"
  if [[ -n "${JOB_RESUME_FROM:-}" ]]; then
    jid="$(grep -oE 'JobID [0-9a-f]{32}' <<<"$out" | tail -1 | cut -d' ' -f2 || true)"
    [[ -n "$jid" ]] || die "no JobID in the submit output of '$name': check its restore by hand"
    RESUMED+=("$jid|$JOB_RESUME_FROM|$name")
  fi
  sleep 8
}

# CHG-226: a restored job proves the restore: RUNNING, restored from exactly that path, and one checkpoint completed
# since (the state is in use; from then on the savepoint is not needed). Long checkpoints every 5 min, Fusion every 3.
verify_restore() {
  local jid="$1" path="$2" name="$3" t st ck from done again limit="${RESUME_VERIFY_TIMEOUT_S:-900}"
  path="${path%/}"; path="${path%/_metadata}"
  for (( t = 0; t <= limit; t += 15 )); do
    st="$(rest "/jobs/$jid" | grep -oE '"state":"[A-Z]+"' | head -1 | cut -d'"' -f4 || true)"
    ck="$(rest "/jobs/$jid/checkpoints" || true)"
    from="$(grep -oE '"restored":\{[^}]*\}' <<<"$ck" | grep -oE '"external_path":"[^"]*"' | cut -d'"' -f4 || true)"
    done="$(grep -oE '"counts":\{[^}]*\}' <<<"$ck" | grep -oE '"completed":[0-9]+' | cut -d: -f2 || true)"
    again="$(grep -oE '"counts":\{[^}]*\}' <<<"$ck" | grep -oE '"restored":[0-9]+' | cut -d: -f2 || true)"
    case "$st" in
      FAILED|FAILING|CANCELED|CANCELLING|FINISHED|SUSPENDED)
        fail "'$name' ($jid) is $st after the restore from $path"; return 1 ;;
    esac
    if (( ${again:-0} > 1 )); then
      fail "'$name' ($jid) restarted after the restore (restored ${again} times): read /jobs/$jid/exceptions"; return 1
    fi
    if [[ "$st" == RUNNING && "${from%/}" == "$path" && "${done:-0}" -ge 1 ]]; then
      ok "'$name' restored from $path and completed a checkpoint: its windows run on"; return 0
    fi
    sleep 15
  done
  fail "'$name' ($jid) not proven within ${limit} s: state ${st:-?}, restored from ${from:-nothing}, ${done:-0} checkpoints"
  return 1
}

info "waiting for JobManager REST on ${JM}:${JM_PORT}"
for _ in $(seq 1 60); do
  if docker exec "$JM" curl -sf "http://localhost:${JM_PORT}/overview" >/dev/null 2>&1; then
    break
  fi
  sleep 5
done
docker exec "$JM" curl -sf "http://localhost:${JM_PORT}/overview" >/dev/null \
  || die "JobManager REST not reachable inside $JM"

docker exec "$JM" test -f "$JAR" || die "JAR missing inside $JM at $JAR"

COMMON=(
  # Marun 2026-09-26: evidence volume ran ~20x the lab estimate (nearly every window has a finding,
  # so EPISODES behaves like ALL) and filled the shared disk in three hours. Put
  # CPLM_EVIDENCE_EMIT=none in migration/.env (deploy.sh exports it) to switch artifact emission
  # off; verdicts are unaffected. all|episodes|none.
  --evidence-emit "${CPLM_EVIDENCE_EMIT:-episodes}"
  --evidence-min-interval-min "${CPLM_EVIDENCE_MIN_INTERVAL_MIN:-60}"
  --evidence-max-cycles "${CPLM_EVIDENCE_MAX_CYCLES:-12}"
  --bootstrap.servers "$BROKERS"
  --input-topic "$INPUT_TOPIC"
  --short-feature-topic "$SHORT_TOPIC"
  --long-feature-topic "$LONG_TOPIC"
  --output-topic "$OUTPUT_TOPIC"
  --consumer-group-id "$GROUP"
)

# CHG-102 5a: boundary evidence lands on the PLANT's local 00:00 (24h) and 00:00/12:00 (12h). PLANT_TIME_ZONE
# (default local) = this host's zone, resolved here to a concrete id so the job never depends on the JVM's
# zone inside the container; IR / Asia/Tehran is a fixed +03:30 in the job. CPLM_EVIDENCE_BOUNDARY_KINDS
# (default 12h,24h; empty = off) picks the kinds. Long and Fusion only.
resolve_plant_tz() {
  local tz="${PLANT_TIME_ZONE:-local}"
  if [[ "$tz" == local ]]; then
    tz="$(timedatectl show -p Timezone --value 2>/dev/null || true)"
    [[ -n "$tz" ]] || tz="$(readlink /etc/localtime 2>/dev/null | sed 's#.*/zoneinfo/##' || true)"
    [[ -n "$tz" ]] || tz=UTC
  fi
  printf '%s' "$tz"
}
PLANT_TZ="$(resolve_plant_tz)"
BOUNDARY_KINDS="${CPLM_EVIDENCE_BOUNDARY_KINDS-12h,24h}"
[[ -n "$BOUNDARY_KINDS" ]] || BOUNDARY_KINDS=none     # an empty program argument is fragile through flink run
info "plant time zone for boundary evidence: ${PLANT_TZ} (PLANT_TIME_ZONE=${PLANT_TIME_ZONE:-local}); day start: ${PLANT_DAY_START:-00:00}; boundary kinds: ${BOUNDARY_KINDS}"
EVIDENCE_CLOCK=(
  --plant-time-zone "$PLANT_TZ"
  --evidence-boundary-kinds "$BOUNDARY_KINDS"
  --plant-day-start "${PLANT_DAY_START:-00:00}"   # CHG-106: e.g. 06:00 for 06:00 / 18:00 shifts
)

# Short → Long → Live RBE → Fusion last (latest() sources).
# CPLM_SHORT_PARALLELISM=4 in migration/.env on a 16-slot TaskManager (9 free after the seven jobs).
# CHG-033 (Marun 2026-09-27): the six short windows emitted ~24 GB/day of artifacts that nothing kept.
# The Short job gets its own switch, default none (G0-G4 evidence is reconstructed on demand; the
# long tier and fusion keep emitting). It must come BEFORE "${COMMON[@]}": EvidencePolicy.fromArgs
# takes the FIRST --evidence-emit it sees. Prove any edit here with migration/deploy/stub-04b.sh.
# CHG-061b: CPLM_SHORT_MAX_SAMPLES_PER_LOOP caps each loop's Short buffer (0 = max(ceil(1.4 x 66 min / grid), 1100), 1,109 at 5 s).
SUBMIT_PARALLELISM="${CPLM_SHORT_PARALLELISM:-1}" \
submit_if_missing "AMS - CPLM Short Feature Engine" \
  com.ams.flink.cplm.CplmShortFeatureStreamJob \
  --evidence-emit "${CPLM_SHORT_EVIDENCE_EMIT:-none}" \
  --short-max-samples-per-loop "${CPLM_SHORT_MAX_SAMPLES_PER_LOOP:-0}" \
  "${COMMON[@]}" \
  --job-name "AMS - CPLM Short Feature Engine"

JOB_RESUME_FROM="${RESUME_LONG_FROM:-}" JOB_ALLOW_NON_RESTORED="${RESUME_LONG_ALLOW_NON_RESTORED:-}" \
submit_if_missing "AMS - CPLM Long Diagnostics Engine" \
  com.ams.flink.cplm.CplmLongDiagnosticsStreamJob \
  "${COMMON[@]}" \
  "${EVIDENCE_CLOCK[@]}" \
  --job-name "AMS - CPLM Long Diagnostics Engine" \
  --window-hours 24

submit_if_missing "AMS - Loop Live RBE Engine" \
  com.ams.flink.cplm.LoopLiveRbeJob \
  --bootstrap.servers "$BROKERS" \
  --input-topic "$INPUT_TOPIC" \
  --live-topic "$LIVE_TOPIC" \
  --consumer-group-id "$GROUP" \
  --deadband "${CPLM_LIVE_DEADBAND:-0.05}"

# v2.5 (Task 1D.4): fast G10/G11 condition path.
submit_if_missing "AMS - CPLM Condition Engine" \
  com.ams.flink.cplm.condition.CplmConditionStreamJob \
  "${COMMON[@]}" \
  --condition-topic "${CPLM_CONDITION_TOPIC:-traverse.cpa.clpm.condition.v1}"

# v2.5 (Task 1H.4): Instrumental NE107 device intervals -> per-loop/role eligibility contexts.
submit_if_missing "AMS - CPLM Instrument Context Engine" \
  com.ams.flink.cplm.health.CplmInstrumentContextJob \
  "${COMMON[@]}" \
  --health-topic "${CPLM_HEALTH_TOPIC:-traverse.cpa.instrument.health.v1}" \
  --context-topic "${CPLM_HEALTH_CONTEXT_TOPIC:-traverse.cpa.context.instrument-health.v1}"

# v2.5 (Task 2B.1): G12 system response - event capture, estimation, validation, evidence.
submit_if_missing "AMS - CPLM Response Engine" \
  com.ams.flink.cplm.response.CplmResponseAnalysisJob \
  "${COMMON[@]}" \
  --response-topic "${CPLM_RESPONSE_TOPIC:-traverse.cpa.clpm.response.results.v1}" \
  --evidence-topic "${CPLM_EVIDENCE_TOPIC:-traverse.cpa.clpm.gate.evidence.v1}"

JOB_RESUME_FROM="${RESUME_FUSION_FROM:-}" JOB_ALLOW_NON_RESTORED=yes \
submit_if_missing "AMS - CPLM Gate Fusion Engine" \
  com.ams.flink.cplm.CplmGateFusionStreamJob \
  "${COMMON[@]}" \
  "${EVIDENCE_CLOCK[@]}" \
  --job-name "AMS - CPLM Gate Fusion Engine"

# CHG-102 5c: on-demand evaluation (cplm-api POST analysis-runs purpose=EVALUATE) - one standing job reading the
# request topic, instead of a BATCH job per click. Reads the loop historian: LOOP_ROOT_PREFIX as cplm-api has it
# (a request names its device; this is the fallback). IoTDB credentials come from the TaskManager's env.
submit_if_missing "AMS - CPLM On-Demand Evaluation" \
  com.ams.flink.cplm.CplmOnDemandEvaluationJob \
  --bootstrap.servers "$BROKERS" \
  --request-topic "${CPLM_EVALUATION_REQUEST_TOPIC:-traverse.cpa.clpm.evaluation.requests.v1}" \
  --status-topic "${CPLM_EVALUATION_STATUS_TOPIC:-traverse.cpa.clpm.evaluation.status.v1}" \
  --output-topic "$OUTPUT_TOPIC" \
  --evidence-topic "${CPLM_EVIDENCE_TOPIC:-traverse.cpa.clpm.gate.evidence.v1}" \
  --iotdb-host "${IOTDB_HOST:-iotdb}" --iotdb-port "${IOTDB_PORT:-6667}" \
  --iotdb-root-prefix "${LOOP_ROOT_PREFIX:-root.site1.cpm}"

rc=0
for name in \
  "AMS - CPLM Short Feature Engine" \
  "AMS - CPLM Long Diagnostics Engine" \
  "AMS - Loop Live RBE Engine" \
  "AMS - CPLM Condition Engine" \
  "AMS - CPLM Instrument Context Engine" \
  "AMS - CPLM Response Engine" \
  "AMS - CPLM Gate Fusion Engine" \
  "AMS - CPLM On-Demand Evaluation"
do
  if job_present "$name"; then
    ok "'$name' RUNNING/present"
  else
    fail "'$name' not present after submit"
    rc=1
  fi
done

# CHG-226: the restore checks come last, so the tail of deploy.sh's output shows them.
for r in ${RESUMED[@]+"${RESUMED[@]}"}; do
  IFS='|' read -r jid path name <<<"$r"
  if ! verify_restore "$jid" "$path" "$name"; then
    rc=1
    warn "keep $path and do not run the checkpoint sweep yet. Fall back to a fresh submit: cancel $jid if it is still listed, then rerun 04b without its RESUME_ variable"
  fi
done
exit "$rc"
