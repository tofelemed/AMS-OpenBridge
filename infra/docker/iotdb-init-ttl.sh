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
TTL_730_DAYS=$(( 730 * 24 * 3600 * 1000 ))

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

# IoTDB 1.3.2: no IF NOT EXISTS on CREATE DATABASE (parse error), and databases
# are prefix-exclusive — auto_create_schema made root.ams the database when the
# alarm sink first wrote, so root.ams.site1.alarms was never a database and the
# original per-subtree TTLs here NEVER applied. TTL is set on the real database.
echo "[iotdb-init-ttl] Creating alarm database root.ams (already-exists is fine)…"
run_sql "CREATE DATABASE root.ams;"

echo "[iotdb-init-ttl] Setting TTL — alarm tree root.ams: ${TTL_365_DAYS}ms (365 days)…"
run_sql "SET TTL TO root.ams ${TTL_365_DAYS};"

# ── CPLM Phase 3 (3.8) — loop historian tree ─────────────────────────────────
# Raw samples + KPI series live under root.<site> (root.site1.cpm.<loop>.…),
# NOT under root.ams.* (the alarm tree). Written by RawLoopIotDbConsumer and
# CplmResultConsumerService in ams-api.
# run_sql_v() surfaces errors instead of the silent `|| true` above — a TTL that
# silently fails means unbounded disk growth discovered months later.
run_sql_v() {
  local out
  out=$(echo "$1" | "${IOTDB_CLI}" -h "${IOTDB_HOST}" -p "${IOTDB_PORT}" \
      -u "${IOTDB_USER}" -pw "${IOTDB_PASS}" -disableISO8601 2>&1) || true
  if echo "$out" | grep -qiE "error|exception|failed"; then
    echo "[iotdb-init-ttl] WARNING — statement had errors: $1"
    echo "$out" | grep -iE "error|exception|failed" | head -3
    return 1
  fi
  return 0
}

echo "[iotdb-init-ttl] Creating loop-historian database root.site1 (already-exists is fine)…"
run_sql "CREATE DATABASE root.site1;"

# ORDER MATTERS. KPI series should outlive raw samples (730 d vs 90 d), but on
# IoTDB 1.3.2 a path-pattern SET TTL just rewrites the owning DATABASE's TTL.
# Attempting the kpi TTL FIRST and the database TTL LAST is correct on both
# versions: 1.3.2 ends at 90 d everywhere (kpi limitation noted), ≥1.3.3 keeps
# a separate 730 d device TTL on the kpi subtree.
echo "[iotdb-init-ttl] Attempting KPI-subtree TTL: ${TTL_730_DAYS}ms (730 days)…"
if ! run_sql_v "SET TTL TO root.site1.cpm.**.kpi.** ${TTL_730_DAYS};"; then
  echo "[iotdb-init-ttl] NOTE: path-scoped TTL unsupported — kpi.* will inherit the 90 d database TTL."
fi

echo "[iotdb-init-ttl] Setting TTL — raw loop samples root.site1: ${TTL_90_DAYS}ms (90 days)…"
run_sql_v "SET TTL TO root.site1 ${TTL_90_DAYS};" || true

echo "[iotdb-init-ttl] Verifying TTL settings (SHOW ALL TTL)…"
TTL_OUT=$(echo "SHOW ALL TTL;" | "${IOTDB_CLI}" -h "${IOTDB_HOST}" -p "${IOTDB_PORT}" \
    -u "${IOTDB_USER}" -pw "${IOTDB_PASS}" -disableISO8601 2>&1 || true)
echo "$TTL_OUT"
if ! echo "$TTL_OUT" | grep -q "root.site1"; then
  echo "[iotdb-init-ttl] ERROR: root.site1 has no TTL — raw loop samples would grow unbounded."
  exit 1
fi

echo "[iotdb-init-ttl] Done."
