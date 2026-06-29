#!/bin/bash
# Submits IoTDBPersistenceJob to Flink after all dependencies are healthy.
# Called by the flink-job-submit-iotdb container (restart: no).
set -e

JOBMANAGER="${FLINK_JOBMANAGER_HOST:-ams-flink-jobmanager}:${FLINK_JOBMANAGER_PORT:-8081}"
KAFKA="${KAFKA_BROKERS:-kafka:9092}"
IOTDB_H="${IOTDB_HOST:-iotdb}"
IOTDB_P="${IOTDB_PORT:-6667}"
JAR="${FLINK_JAR_PATH:-/opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar}"

echo "[IoTDB-Submit] Waiting for Flink JobManager at http://${JOBMANAGER} ..."
until curl -sf "http://${JOBMANAGER}/overview" > /dev/null 2>&1; do
  sleep 3
done
echo "[IoTDB-Submit] JobManager ready."

echo "[IoTDB-Submit] Waiting for IoTDB at ${IOTDB_H}:${IOTDB_P} ..."
# Use /dev/tcp instead of nc — nc may not be installed in the flink image.
until bash -c "echo > /dev/tcp/${IOTDB_H}/${IOTDB_P}" 2>/dev/null; do
  sleep 3
done
echo "[IoTDB-Submit] IoTDB ready."

# Guard: skip if IoTDBPersistenceJob is already RUNNING to avoid duplicate instances.
RUNNING=$(curl -sf "http://${JOBMANAGER}/jobs/overview" \
  | grep -o '"name":"AMS - IoTDB Alarm Persistence"' | wc -l || true)
if [ "${RUNNING}" -gt 0 ]; then
  echo "[IoTDB-Submit] IoTDBPersistenceJob already RUNNING — skipping duplicate submit."
  exit 0
fi

echo "[IoTDB-Submit] Submitting IoTDBPersistenceJob ..."
# Note: flink run -m expects host:port (no http:// prefix)
flink run -d \
  -m "${JOBMANAGER}" \
  -c com.ams.flink.IoTDBPersistenceJob \
  "${JAR}" \
  --bootstrap.servers "${KAFKA}" \
  --iotdb.host "${IOTDB_H}" \
  --iotdb.port "${IOTDB_P}"

echo "[IoTDB-Submit] Job submitted successfully."
