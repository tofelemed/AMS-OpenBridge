#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Phase 6 — IoTDB retention / TTL initialisation
#
# Runs against the IoTDB CLI inside the container after startup.
# Sets default TTL on the AMS storage groups (databases) so that old time-series
# data is automatically purged, preventing unbounded disk growth.
#
# IoTDB 1.3 TTL syntax:
#   SET TTL TO <database_path> <ttl_in_ms>;
#   UNSET TTL TO <database_path>;   -- removes TTL (keep forever)
#
# Usage (called from docker compose or ad-hoc):
#   docker exec ams-iotdb bash /iotdb-init-ttl.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

IOTDB_CLI="${IOTDB_CLI:-/iotdb/sbin/start-cli.sh}"
IOTDB_HOST="${IOTDB_HOST:-127.0.0.1}"
IOTDB_PORT="${IOTDB_PORT:-6667}"
IOTDB_USER="${IOTDB_USER:-root}"
IOTDB_PASS="${IOTDB_PASS:-root}"

# TTL values in milliseconds
TTL_90_DAYS=$(( 90 * 24 * 3600 * 1000 ))
TTL_365_DAYS=$(( 365 * 24 * 3600 * 1000 ))

echo "[iotdb-init-ttl] Waiting for IoTDB to accept connections…"
for i in $(seq 1 30); do
  if bash -c "echo > /dev/tcp/${IOTDB_HOST}/${IOTDB_PORT}" 2>/dev/null; then
    echo "[iotdb-init-ttl] IoTDB ready."
    break
  fi
  echo "[iotdb-init-ttl] Attempt $i/30 — retrying in 5s…"
  sleep 5
done

run_sql() {
  echo "$1" | "${IOTDB_CLI}" -h "${IOTDB_HOST}" -p "${IOTDB_PORT}" \
      -u "${IOTDB_USER}" -pw "${IOTDB_PASS}" -disableISO8601 2>/dev/null || true
}

echo "[iotdb-init-ttl] Creating storage groups (databases) if absent…"
run_sql "CREATE DATABASE IF NOT EXISTS root.ams;"
run_sql "CREATE DATABASE IF NOT EXISTS root.ams.site1;"
run_sql "CREATE DATABASE IF NOT EXISTS root.ams.site1.alarms;"
run_sql "CREATE DATABASE IF NOT EXISTS root.ams.site1.metrics;"

echo "[iotdb-init-ttl] Setting TTL — alarm history: ${TTL_365_DAYS}ms (365 days)…"
run_sql "SET TTL TO root.ams.site1.alarms ${TTL_365_DAYS};"

echo "[iotdb-init-ttl] Setting TTL — live metrics cache: ${TTL_90_DAYS}ms (90 days)…"
run_sql "SET TTL TO root.ams.site1.metrics ${TTL_90_DAYS};"

echo "[iotdb-init-ttl] Verifying TTL settings…"
run_sql "SHOW ALL TTL;"

echo "[iotdb-init-ttl] Done."
