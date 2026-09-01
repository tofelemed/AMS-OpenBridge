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

# P3-5 - the historian trees are configurable everywhere else (frontend
# VITE_LOOP_ROOT_PREFIX / VITE_ALARM_ROOT_PREFIX, server config); hardcoding
# them here meant a repointed site got TTLs on the wrong tree with no error.
ALARM_DB="${ALARM_DB:-root.ams}"
LOOP_DB="${LOOP_DB:-root.site1}"
LOOP_CPM_PREFIX="${LOOP_CPM_PREFIX:-${LOOP_DB}.cpm}"

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

# ── Enforce the configured password (Marun finding, 2026-09-02) ───────────────
# A fresh IoTDB ships root/root; this script always LOGGED IN with IOTDB_PASS
# but nothing ever SET it — so on first boot every statement below failed
# silently and writers presenting the real password got 801 WRONG_LOGIN_PASSWORD.
# Probe with the configured password; if rejected, rotate off the default.
# IoTDB refuses passwords outside 4..32 chars (303 "illegal") — fail loudly
# here instead of leaving the server on root/root with nobody noticing.
if [ "${#IOTDB_PASS}" -gt 32 ] || [ "${#IOTDB_PASS}" -lt 4 ]; then
  echo "[iotdb-init-ttl] FATAL: IOTDB_PASS is ${#IOTDB_PASS} chars; IoTDB allows 4..32. Regenerate (openssl rand -hex 12)." >&2
  exit 1
fi
probe=$(echo "show databases;" | "${IOTDB_CLI}" -h "${IOTDB_HOST}" -p "${IOTDB_PORT}" \
    -u "${IOTDB_USER}" -pw "${IOTDB_PASS}" -disableISO8601 2>&1) || true
if echo "$probe" | grep -qiE "801|Authentication failed|WRONG_LOGIN_PASSWORD"; then
  echo "[iotdb-init-ttl] Configured password rejected — rotating off factory default…"
  echo "ALTER USER ${IOTDB_USER} SET PASSWORD '${IOTDB_PASS}';" | \
    "${IOTDB_CLI}" -h "${IOTDB_HOST}" -p "${IOTDB_PORT}" \
    -u "${IOTDB_USER}" -pw root -disableISO8601 2>&1 | tail -1
  verify=$(echo "show databases;" | "${IOTDB_CLI}" -h "${IOTDB_HOST}" -p "${IOTDB_PORT}" \
      -u "${IOTDB_USER}" -pw "${IOTDB_PASS}" -disableISO8601 2>&1) || true
  if echo "$verify" | grep -qiE "801|Authentication failed"; then
    echo "[iotdb-init-ttl] FATAL: cannot authenticate with configured password NOR rotate from the default." >&2
    exit 1
  fi
  echo "[iotdb-init-ttl] Password enforced; proceeding."
fi

# IoTDB 1.3.2: no IF NOT EXISTS on CREATE DATABASE (parse error), and databases
# are prefix-exclusive — auto_create_schema made root.ams the database when the
# alarm sink first wrote, so root.ams.site1.alarms was never a database and the
# original per-subtree TTLs here NEVER applied. TTL is set on the real database.
echo "[iotdb-init-ttl] Creating alarm database ${ALARM_DB} (already-exists is fine)…"
run_sql "CREATE DATABASE ${ALARM_DB};"

echo "[iotdb-init-ttl] Setting TTL — alarm tree ${ALARM_DB}: ${TTL_365_DAYS}ms (365 days)…"
run_sql "SET TTL TO ${ALARM_DB} ${TTL_365_DAYS};"

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

echo "[iotdb-init-ttl] Creating loop-historian database ${LOOP_DB} (already-exists is fine)…"
run_sql "CREATE DATABASE ${LOOP_DB};"

# ORDER MATTERS. KPI series should outlive raw samples (730 d vs 90 d), but on
# IoTDB 1.3.2 a path-pattern SET TTL just rewrites the owning DATABASE's TTL.
# Attempting the kpi TTL FIRST and the database TTL LAST is correct on both
# versions: 1.3.2 ends at 90 d everywhere (kpi limitation noted), ≥1.3.3 keeps
# a separate 730 d device TTL on the kpi subtree.
echo "[iotdb-init-ttl] Attempting KPI-subtree TTL: ${TTL_730_DAYS}ms (730 days)…"
if ! run_sql_v "SET TTL TO ${LOOP_CPM_PREFIX}.**.kpi.** ${TTL_730_DAYS};"; then
  echo "[iotdb-init-ttl] NOTE: path-scoped TTL unsupported — kpi.* will inherit the 90 d database TTL."
fi

echo "[iotdb-init-ttl] Setting TTL — raw loop samples ${LOOP_DB}: ${TTL_90_DAYS}ms (90 days)…"
run_sql_v "SET TTL TO ${LOOP_DB} ${TTL_90_DAYS};" || true

echo "[iotdb-init-ttl] Verifying TTL settings (SHOW ALL TTL)…"
TTL_OUT=$(echo "SHOW ALL TTL;" | "${IOTDB_CLI}" -h "${IOTDB_HOST}" -p "${IOTDB_PORT}" \
    -u "${IOTDB_USER}" -pw "${IOTDB_PASS}" -disableISO8601 2>&1 || true)
echo "$TTL_OUT"
if ! echo "$TTL_OUT" | grep -q "${LOOP_DB}"; then
  echo "[iotdb-init-ttl] ERROR: ${LOOP_DB} has no TTL — raw loop samples would grow unbounded."
  exit 1
fi

echo "[iotdb-init-ttl] Done."
