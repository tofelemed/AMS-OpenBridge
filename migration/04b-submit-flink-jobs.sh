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

job_present() {
  flink list -m "localhost:${JM_PORT}" 2>/dev/null \
    | grep -F "$1" | grep -qE '\((CREATED|INITIALIZING|RUNNING|RESTARTING|RECONCILING)\)'
}

submit_if_missing() {
  local name="$1" class="$2"
  shift 2
  local n
  n="$(flink list -m "localhost:${JM_PORT}" 2>/dev/null | grep -F "$name" | grep -cE '\((CREATED|INITIALIZING|RUNNING|RESTARTING|RECONCILING)\)' || true)"
  if [[ "${n:-0}" -gt 1 ]]; then
    warn "$n copies of '$name' already present — not submitting another"
    return 0
  fi
  if [[ "${n:-0}" -ge 1 ]]; then
    ok "'$name' already present — skip"
    return 0
  fi
  info "submitting $class as '$name'"
  flink run -d -m "localhost:${JM_PORT}" -c "$class" "$JAR" "$@"
  sleep 8
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
  --bootstrap.servers "$BROKERS"
  --input-topic "$INPUT_TOPIC"
  --short-feature-topic "$SHORT_TOPIC"
  --long-feature-topic "$LONG_TOPIC"
  --output-topic "$OUTPUT_TOPIC"
  --consumer-group-id "$GROUP"
)

# Short → Long → Live RBE → Fusion last (latest() sources).
submit_if_missing "AMS - CPLM Short Feature Engine" \
  com.ams.flink.cplm.CplmShortFeatureStreamJob \
  "${COMMON[@]}" \
  --job-name "AMS - CPLM Short Feature Engine"

submit_if_missing "AMS - CPLM Long Diagnostics Engine" \
  com.ams.flink.cplm.CplmLongDiagnosticsStreamJob \
  "${COMMON[@]}" \
  --job-name "AMS - CPLM Long Diagnostics Engine" \
  --window-hours 24

submit_if_missing "AMS - Loop Live RBE Engine" \
  com.ams.flink.cplm.LoopLiveRbeJob \
  --bootstrap.servers "$BROKERS" \
  --input-topic "$INPUT_TOPIC" \
  --live-topic "$LIVE_TOPIC" \
  --consumer-group-id "$GROUP" \
  --deadband "${CPLM_LIVE_DEADBAND:-0.05}"

submit_if_missing "AMS - CPLM Gate Fusion Engine" \
  com.ams.flink.cplm.CplmGateFusionStreamJob \
  "${COMMON[@]}" \
  --job-name "AMS - CPLM Gate Fusion Engine"

rc=0
for name in \
  "AMS - CPLM Short Feature Engine" \
  "AMS - CPLM Long Diagnostics Engine" \
  "AMS - Loop Live RBE Engine" \
  "AMS - CPLM Gate Fusion Engine"
do
  if job_present "$name"; then
    ok "'$name' RUNNING/present"
  else
    fail "'$name' not present after submit"
    rc=1
  fi
done
exit "$rc"
