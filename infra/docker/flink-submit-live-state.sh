#!/bin/bash
# Submits LiveStateJob to Flink — publishes live.alarms and live.metrics (RBE).
# Called by the flink-job-submit-live-state container (restart: no).
set -e

JOBMANAGER="${FLINK_JOBMANAGER_HOST:-ams-flink-jobmanager}:${FLINK_JOBMANAGER_PORT:-8081}"
KAFKA="${KAFKA_BROKERS:-kafka:9092}"
JAR="${FLINK_JAR_PATH:-/opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar}"

# The jar is bind-mounted from the host. If it was never built, Docker silently creates a
# DIRECTORY at this path and `flink run` fails with an opaque error — so check for a file.
if [ ! -f "$JAR" ]; then
  echo "[LiveState-Submit] ERROR: JAR not found (or is a directory) at ${JAR}."
  echo "[LiveState-Submit]        Run scripts/build-flink-jar.ps1, then recreate this container."
  exit 1
fi

echo "[LiveState-Submit] Waiting for Flink JobManager at http://${JOBMANAGER} ..."
until curl -sf "http://${JOBMANAGER}/overview" > /dev/null 2>&1; do
  sleep 3
done
echo "[LiveState-Submit] JobManager ready."

# Guard: skip if a LiveStateJob is already RUNNING to avoid duplicate instances.
RUNNING=$(curl -sf "http://${JOBMANAGER}/jobs/overview" \
  | grep -o '"name":"AMS - Live State RBE"' | wc -l || true)
if [ "${RUNNING}" -gt 0 ]; then
  echo "[LiveState-Submit] LiveStateJob already RUNNING — skipping duplicate submit."
  exit 0
fi

echo "[LiveState-Submit] Submitting LiveStateJob ..."
# Note: flink run -m expects host:port (no http:// prefix)
flink run -d \
  -m "${JOBMANAGER}" \
  -c com.ams.flink.LiveStateJob \
  "${JAR}" \
  --bootstrap.servers "${KAFKA}"

echo "[LiveState-Submit] Job submitted successfully."
