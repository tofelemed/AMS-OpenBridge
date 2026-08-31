#!/usr/bin/env bash
# Phase 8 — validate DBs/seed; topics/jobs if those phases ran.
# Exit 1 on FAIL so deploy does not report success.
# Does not require Kafka sample rate (ingestion phase 2 not built yet).
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_env

FAILS=0
hit() { fail "$1"; FAILS=$((FAILS + 1)); }

require_kafka="${REQUIRE_KAFKA:-0}"
require_flink="${REQUIRE_FLINK:-0}"
for arg in "$@"; do
  case "$arg" in
    --require-kafka) require_kafka=1 ;;
    --require-flink) require_flink=1 ;;
    -h|--help)
      echo "usage: $0 [--require-kafka] [--require-flink]"
      exit 0
      ;;
    *) die "unknown arg: $arg" ;;
  esac
done

info "validate on postgres=$POSTGRES_CONTAINER kafka=$KAFKA_CONTAINER"

if ! container_running "$POSTGRES_CONTAINER"; then
  hit "$POSTGRES_CONTAINER is not running (Instrumental Postgres must stay up)"
else
  docker exec "$POSTGRES_CONTAINER" pg_isready -U "$POSTGRES_USER" >/dev/null \
    && ok "Instrumental Postgres is accepting connections" \
    || hit "$POSTGRES_CONTAINER pg_isready failed"
fi

if (( FAILS == 0 )); then
  for d in "${TRAVERSE_DBS[@]}"; do
    if db_exists "$d"; then
      ok "database $d exists"
    else
      hit "database $d missing"
    fi
  done

  table_exists traverse_auth public roles \
    && ok "traverse_auth.roles" || hit "traverse_auth.roles missing"
  table_exists traverse_assets assets assets \
    && ok "assets.assets" || hit "assets.assets missing"
  table_exists traverse_cplm cpm loop_registry \
    && ok "cpm.loop_registry" || hit "cpm.loop_registry missing"
  table_exists traverse_ingestion ingestion data_source_configs \
    && ok "ingestion.data_source_configs" || hit "ingestion.data_source_configs missing"

  if table_exists traverse_assets assets assets; then
    sites="$(psql_scalar traverse_assets "SELECT COUNT(*) FROM assets.assets WHERE contextual_path = 'hdpe' AND NOT is_deleted")"
    areas="$(psql_scalar traverse_assets "SELECT COUNT(*) FROM assets.assets WHERE asset_type = 2 AND NOT is_deleted")"
    units="$(psql_scalar traverse_assets "SELECT COUNT(*) FROM assets.assets WHERE asset_type = 3 AND NOT is_deleted")"
    [[ "$sites" == 1 ]] && ok "HDPE site row present" || hit "expected 1 HDPE site, got ${sites:-0}"
    [[ "$areas" == 8 ]] && ok "HDPE areas=$areas" || hit "expected 8 HDPE areas, got ${areas:-0}"
    [[ "$units" == 25 ]] && ok "HDPE units=$units" || hit "expected 25 HDPE units, got ${units:-0}"
  fi

  if table_exists traverse_auth public roles; then
    roles="$(psql_scalar traverse_auth "SELECT COUNT(*) FROM roles")"
    perms="$(psql_scalar traverse_auth "SELECT COUNT(*) FROM permissions")"
    roles="${roles:-0}"
    perms="${perms:-0}"
    (( roles >= 4 )) && ok "roles=$roles" || hit "expected >=4 roles, got ${roles}"
    (( perms >= 28 )) && ok "permissions=$perms" || hit "expected >=28 permission keys, got ${perms}"
  fi
fi

if container_running "$KAFKA_CONTAINER"; then
  ok "$KAFKA_CONTAINER is running"
  if list="$(kafka_topics --list 2>/dev/null)"; then
    while IFS= read -r raw || [[ -n "$raw" ]]; do
      line="${raw%%$'\r'}"
      [[ -z "$line" || "$line" == \#* ]] && continue
      IFS=$'\t' read -r topic _ <<<"$line"
      [[ -n "$topic" ]] || continue
      if grep -qxF "$topic" <<<"$list"; then
        ok "topic $topic"
      else
        if (( require_kafka == 1 )); then
          hit "topic $topic missing"
        else
          warn "topic $topic not created yet (Phase 6; pass --require-kafka after 04)"
        fi
      fi
    done <"$MIGRATION_ROOT/kafka/topics.txt"
  else
    warn "could not list Kafka topics"
  fi
else
  if (( require_kafka == 1 )); then
    hit "$KAFKA_CONTAINER is not running"
  else
    warn "$KAFKA_CONTAINER is not running"
  fi
fi

if container_running "$FLINK_JOBMANAGER_CONTAINER"; then
  for name in \
    "AMS - CPLM Short Feature Engine" \
    "AMS - CPLM Long Diagnostics Engine" \
    "AMS - Loop Live RBE Engine" \
    "AMS - CPLM Gate Fusion Engine"
  do
    if docker exec "$FLINK_JOBMANAGER_CONTAINER" \
         /opt/flink/bin/flink list -m "localhost:${FLINK_JOBMANAGER_PORT}" 2>/dev/null \
         | grep -F "$name" | grep -qE '\((CREATED|INITIALIZING|RUNNING|RESTARTING|RECONCILING)\)'; then
      ok "Flink job '$name'"
    else
      if (( require_flink == 1 )); then
        hit "Flink job '$name' not RUNNING"
      else
        warn "Flink job '$name' not present (Phase 7; pass --require-flink after 04b)"
      fi
    fi
  done
else
  if (( require_flink == 1 )); then
    hit "$FLINK_JOBMANAGER_CONTAINER is not running"
  else
    warn "$FLINK_JOBMANAGER_CONTAINER not up"
  fi
fi

if (( FAILS > 0 )); then
  fail "$FAILS check(s) failed"
  exit 1
fi
ok "05-validate passed"
exit 0
