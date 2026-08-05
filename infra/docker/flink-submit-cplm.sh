#!/usr/bin/env bash
# Submits the CPLM three-stage pipeline (loop.samples.v1 → clpm.gate.results.v1)
# once the Flink cluster is ready: Short Feature → Long Diagnostics → Gate Fusion.
#
# Fusion is submitted LAST: its two Kafka sources start at OffsetsInitializer.latest(),
# so the feature topics must exist (created by scripts/kafka-reset-lab-topics.ps1 or
# broker auto-create on first produce) before it starts.
#
# NOT submitted here:
#   - CplmGateStreamJob        (legacy monolith; would double-produce gate results)
#   - CplmHistoricalReplayJob  (on-demand batch, per-request job name)
#   - LoopLiveRbeJob           (Phase 6; needs --live-topic live.loop.metrics to avoid
#                               colliding with LiveStateJob's live.metrics)
set -euo pipefail

JOBMANAGER_HOST="${FLINK_JOBMANAGER_HOST:-ams-flink-jobmanager}"
JOBMANAGER_PORT="${FLINK_JOBMANAGER_PORT:-8081}"
JM_URL="http://${JOBMANAGER_HOST}:${JOBMANAGER_PORT}"
KAFKA_BROKERS="${KAFKA_BROKERS:-kafka:9092}"
JAR_PATH="${FLINK_JAR_PATH:-/opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar}"
MAX_WAIT="${FLINK_SUBMIT_MAX_WAIT_SEC:-300}"

# The compiled default input topic (clpm.normalized.samples.v1) is dead — every
# submit MUST pass --input-topic explicitly or the jobs silently consume an
# auto-created empty topic.
INPUT_TOPIC="${CPLM_INPUT_TOPIC:-loop.samples.v1}"
SHORT_TOPIC="${CPLM_SHORT_FEATURE_TOPIC:-clpm.feature.short.v1}"
LONG_TOPIC="${CPLM_LONG_FEATURE_TOPIC:-clpm.feature.long.v1}"
OUTPUT_TOPIC="${CPLM_OUTPUT_TOPIC:-clpm.gate.results.v1}"
CONSUMER_GROUP="${CPLM_CONSUMER_GROUP:-flink-ams-cplm}"
WINDOW_HOURS="${CPLM_WINDOW_HOURS:-24}"

echo "[CPLM Submit] Waiting for JobManager at ${JM_URL}..."
elapsed=0
until curl -sf "${JM_URL}/overview" >/dev/null 2>&1; do
  sleep 5
  elapsed=$((elapsed + 5))
  if [ "$elapsed" -ge "$MAX_WAIT" ]; then
    echo "[CPLM Submit] ERROR: Timed out waiting for JobManager (${MAX_WAIT}s)"
    exit 1
  fi
done
echo "[CPLM Submit] JobManager is ready."

# The jar is bind-mounted from the host. If it was never built, Docker silently
# creates a DIRECTORY at this path and `flink run` fails with an opaque error.
if [ ! -f "$JAR_PATH" ]; then
  echo "[CPLM Submit] ERROR: JAR not found (or is a directory) at ${JAR_PATH}."
  echo "[CPLM Submit]        Run scripts/build-flink-jar.ps1, then recreate this container."
  exit 1
fi

job_running() {
  # Match name AND state — matching the name alone would let a FAILED job block
  # resubmission forever.
  /opt/flink/bin/flink list -m "${JOBMANAGER_HOST}:${JOBMANAGER_PORT}" 2>/dev/null \
    | grep -F "$1" | grep -q "(RUNNING)"
}

submit_if_missing() {
  local name="$1"
  local class="$2"
  shift 2
  if job_running "$name"; then
    echo "[CPLM Submit] '${name}' already RUNNING; skipping."
    return 0
  fi
  echo "[CPLM Submit] Submitting ${class} as '${name}'..."
  /opt/flink/bin/flink run -d \
    -m "${JOBMANAGER_HOST}:${JOBMANAGER_PORT}" \
    -c "$class" \
    "$JAR_PATH" \
    "$@"
  sleep 8
}

COMMON_ARGS=(
  --bootstrap.servers "${KAFKA_BROKERS}"
  --input-topic "${INPUT_TOPIC}"
  --short-feature-topic "${SHORT_TOPIC}"
  --long-feature-topic "${LONG_TOPIC}"
  --output-topic "${OUTPUT_TOPIC}"
  --consumer-group-id "${CONSUMER_GROUP}"
)

submit_if_missing "AMS - CPLM Short Feature Engine" \
  com.ams.flink.cplm.CplmShortFeatureStreamJob \
  "${COMMON_ARGS[@]}" \
  --job-name "AMS - CPLM Short Feature Engine"

submit_if_missing "AMS - CPLM Long Diagnostics Engine" \
  com.ams.flink.cplm.CplmLongDiagnosticsStreamJob \
  "${COMMON_ARGS[@]}" \
  --job-name "AMS - CPLM Long Diagnostics Engine" \
  --window-hours "${WINDOW_HOURS}"

submit_if_missing "AMS - CPLM Gate Fusion Engine" \
  com.ams.flink.cplm.CplmGateFusionStreamJob \
  "${COMMON_ARGS[@]}" \
  --job-name "AMS - CPLM Gate Fusion Engine"

sleep 5
fail=0
for name in "AMS - CPLM Short Feature Engine" "AMS - CPLM Long Diagnostics Engine" "AMS - CPLM Gate Fusion Engine"; do
  if job_running "$name"; then
    echo "[CPLM Submit] OK: '${name}' RUNNING."
  else
    echo "[CPLM Submit] ERROR: '${name}' not RUNNING after submit."
    fail=1
  fi
done
exit $fail
