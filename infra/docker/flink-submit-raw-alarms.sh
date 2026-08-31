#!/usr/bin/env bash
# Submits OpcEventStreamJob (traverse.alarm.raw-alarms → traverse.alarm.current-alarm-state) once Flink cluster is ready.
set -euo pipefail

JOBMANAGER_HOST="${FLINK_JOBMANAGER_HOST:-ams-flink-jobmanager}"
JOBMANAGER_PORT="${FLINK_JOBMANAGER_PORT:-8081}"
JM_URL="http://${JOBMANAGER_HOST}:${JOBMANAGER_PORT}"
KAFKA_BROKERS="${KAFKA_BROKERS:-kafka:9092}"
JAR_PATH="${FLINK_JAR_PATH:-/opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar}"
ENTRY_CLASS="${FLINK_ENTRY_CLASS:-com.ams.flink.OpcEventStreamJob}"
JOB_NAME="AMS - Alarm State Machine"
RAW_ALARMS_OFFSETS="${RAW_ALARMS_STARTING_OFFSETS:-earliest}"
MAX_WAIT="${FLINK_SUBMIT_MAX_WAIT_SEC:-300}"

echo "[Flink Submit] Waiting for JobManager at ${JM_URL}..."
elapsed=0
until curl -sf "${JM_URL}/overview" >/dev/null 2>&1; do
  sleep 5
  elapsed=$((elapsed + 5))
  if [ "$elapsed" -ge "$MAX_WAIT" ]; then
    echo "[Flink Submit] ERROR: Timed out waiting for JobManager (${MAX_WAIT}s)"
    exit 1
  fi
done
echo "[Flink Submit] JobManager is ready."

if [ ! -f "$JAR_PATH" ]; then
  echo "[Flink Submit] ERROR: JAR not found at ${JAR_PATH}. Run scripts/build-flink-jar.ps1 first."
  exit 1
fi

# Skip submit if the alarm state machine job is already present. Recovery states
# count (prod item 3): with JM HA a cold start recovers jobs through
# CREATED/INITIALIZING/RECONCILING, and a RUNNING-only check would duplicate them.
if /opt/flink/bin/flink list -m "${JOBMANAGER_HOST}:${JOBMANAGER_PORT}" 2>/dev/null \
  | grep -F "${JOB_NAME}" | grep -qE '\((CREATED|INITIALIZING|RUNNING|RESTARTING|RECONCILING)\)'; then
  echo "[Flink Submit] Job '${JOB_NAME}' already present; skipping submit."
  exit 0
fi

echo "[Flink Submit] Submitting ${ENTRY_CLASS} (traverse.alarm.raw-alarms → traverse.alarm.current-alarm-state)..."
/opt/flink/bin/flink run -d \
  -m "${JOBMANAGER_HOST}:${JOBMANAGER_PORT}" \
  -c "${ENTRY_CLASS}" \
  "${JAR_PATH}" \
  --bootstrap.servers "${KAFKA_BROKERS}" \
  --raw-alarms.starting-offsets "${RAW_ALARMS_OFFSETS}" \
  --parallelism.raw-ingest 2 \
  --parallelism.validation 2 \
  --parallelism.dedup 2 \
  --parallelism.normalization 2 \
  --parallelism.soe 2 \
  --parallelism.lifecycle 2 \
  --parallelism.correlation 2 \
  --parallelism.flood 1 \
  --parallelism.kpi 1 \
  --parallelism.projection 2 \
  --parallelism.ack 2

sleep 10
if /opt/flink/bin/flink list -m "${JOBMANAGER_HOST}:${JOBMANAGER_PORT}" 2>/dev/null \
  | grep -q "${JOB_NAME} (RUNNING)"; then
  echo "[Flink Submit] Job submitted successfully."
  /opt/flink/bin/flink list -m "${JOBMANAGER_HOST}:${JOBMANAGER_PORT}" 2>/dev/null | grep "${JOB_NAME}" || true
  exit 0
fi

echo "[Flink Submit] ERROR: Job did not appear in JobManager overview."
exit 1
