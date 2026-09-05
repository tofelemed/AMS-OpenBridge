#!/usr/bin/env bash
# Shared helpers for migration/*.sh. Source this; do not execute it.
# shellcheck shell=bash

set -euo pipefail

if [[ -n "${_AMS_MIGRATION_LIB:-}" ]]; then
  return 0 2>/dev/null || exit 0
fi
_AMS_MIGRATION_LIB=1

MIGRATION_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TRAVERSE_DBS=(
  traverse_auth
  traverse_assets
  traverse_cplm
  traverse_ingestion
  traverse_audit
)

# --- logging ---------------------------------------------------------------

log()  { printf '[%s] %s\n' "$1" "$2"; }
ok()   { log OK   "$1"; }
info() { log INFO "$1"; }
warn() { log WARN "$1"; }
fail() { log FAIL "$1"; }

die() { fail "$1"; exit 1; }

# --- env -------------------------------------------------------------------

load_env() {
  local envfile="${MIGRATION_ENV:-$MIGRATION_ROOT/.env}"
  if [[ ! -f "$envfile" ]]; then
    envfile="$MIGRATION_ROOT/.env"
  fi
  if [[ ! -f "$envfile" ]]; then
    die "missing $MIGRATION_ROOT/.env (copy migration/.env.example)"
  fi
  set -a
  # shellcheck disable=SC1090
  source "$envfile"
  set +a

  POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-instrumental-postgres}"
  POSTGRES_HOST="${POSTGRES_HOST:-instrumental-postgres}"
  POSTGRES_USER="${POSTGRES_USER:-postgres}"
  AMS_DB_USER="${AMS_DB_USER:-ams_user}"
  KAFKA_CONTAINER="${KAFKA_CONTAINER:-instrumental-kafka-1}"
  KAFKA_BOOTSTRAP_INSIDE="${KAFKA_BOOTSTRAP_INSIDE:-localhost:9092}"
  KAFKA_BOOTSTRAP_INTERNAL="${KAFKA_BOOTSTRAP_INTERNAL:-kafka-1:9092,kafka-2:9092}"
  KAFKA_TOPIC_RF="${KAFKA_TOPIC_RF:-2}"
  KAFKA_TOPIC_MIN_ISR="${KAFKA_TOPIC_MIN_ISR:-1}"
  DOCKER_NETWORK="${DOCKER_NETWORK:-instrumental-network}"
  FLINK_JOBMANAGER_CONTAINER="${FLINK_JOBMANAGER_CONTAINER:-ams-flink-jobmanager}"
  FLINK_JOBMANAGER_PORT="${FLINK_JOBMANAGER_PORT:-8081}"
  FLINK_JAR_PATH="${FLINK_JAR_PATH:-/opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar}"
  TOPIC_PREFIX="${TOPIC_PREFIX:-traverse.cpa.}"
}

require_not_change_me() {
  local name="$1" value="${2:-}"
  if [[ -z "$value" || "$value" == CHANGE_ME ]]; then
    die "$name is empty or CHANGE_ME — set it in migration/.env"
  fi
}

container_running() {
  local name="$1"
  docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null | grep -qx true
}

require_container() {
  local name="$1"
  docker inspect "$name" >/dev/null 2>&1 || die "container '$name' not found"
  container_running "$name" || die "container '$name' is not running"
}

# --- postgres --------------------------------------------------------------

is_forbidden_dbname() {
  local n="$1"
  case "$n" in
    ams|auth_service|shared_lookups|notification_service) return 0 ;;
    instrument_*) return 0 ;;
  esac
  return 1
}

assert_allowed_dbname() {
  local n="$1"
  is_forbidden_dbname "$n" && die "refusing database name '$n' (Instrumental or ams-alarm)"
  [[ "$n" == traverse_* ]] || die "refusing database name '$n' (must be traverse_*)"
}

psql_super() {
  docker exec -i "$POSTGRES_CONTAINER" \
    psql -U "$POSTGRES_USER" -v ON_ERROR_STOP=1 "$@"
}

psql_db() {
  local db="$1"
  shift
  assert_allowed_dbname "$db"
  docker exec -i "$POSTGRES_CONTAINER" \
    psql -U "$POSTGRES_USER" -d "$db" -v ON_ERROR_STOP=1 "$@"
}

psql_db_file() {
  local db="$1" file="$2"
  assert_allowed_dbname "$db"
  [[ -f "$file" ]] || die "SQL file not found: $file"
  docker exec -i "$POSTGRES_CONTAINER" \
    psql -U "$POSTGRES_USER" -d "$db" -v ON_ERROR_STOP=1 <"$file"
}

psql_scalar() {
  local db="$1" sql="$2"
  docker exec -i "$POSTGRES_CONTAINER" \
    psql -U "$POSTGRES_USER" -d "$db" -tAc "$sql"
}

db_exists() {
  local name="$1"
  local found
  found="$(psql_super -tAc "SELECT 1 FROM pg_database WHERE datname = '$name'")"
  [[ "$found" == 1 ]]
}

table_exists() {
  local db="$1" schema="$2" table="$3"
  local found
  found="$(psql_scalar "$db" \
    "SELECT 1 FROM information_schema.tables WHERE table_schema = '$schema' AND table_name = '$table'")"
  [[ "$found" == 1 ]]
}

# --- kafka -----------------------------------------------------------------

kafka_topics_bin() {
  if docker exec "$KAFKA_CONTAINER" sh -c 'command -v kafka-topics >/dev/null'; then
    echo kafka-topics
    return
  fi
  if docker exec "$KAFKA_CONTAINER" sh -c 'command -v kafka-topics.sh >/dev/null'; then
    echo kafka-topics.sh
    return
  fi
  if docker exec "$KAFKA_CONTAINER" test -x /opt/bitnami/kafka/bin/kafka-topics.sh; then
    echo /opt/bitnami/kafka/bin/kafka-topics.sh
    return
  fi
  die "no kafka-topics binary inside $KAFKA_CONTAINER"
}

kafka_topics() {
  local bin
  bin="$(kafka_topics_bin)"
  docker exec "$KAFKA_CONTAINER" "$bin" --bootstrap-server "$KAFKA_BOOTSTRAP_INSIDE" "$@"
}
