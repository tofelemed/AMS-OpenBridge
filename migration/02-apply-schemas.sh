#!/usr/bin/env bash
# Phase 3 — apply schema/*.sql onto the five DBs.
# Skip a DB when its sentinel table already exists, unless --force.
# --force on instrumental-postgres also requires CONFIRM_FORCE=yes.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_env

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help)
      echo "usage: $0 [--force]"
      echo "  --force  re-apply DDL (IF NOT EXISTS). On ${POSTGRES_CONTAINER:-instrumental-postgres}"
      echo "           also set CONFIRM_FORCE=yes (dev only; never on live shared PG with data)."
      exit 0
      ;;
    *) die "unknown arg: $arg" ;;
  esac
done

require_container "$POSTGRES_CONTAINER"

if (( FORCE == 1 )) && [[ "$POSTGRES_CONTAINER" == instrumental-postgres ]]; then
  if [[ "${CONFIRM_FORCE:-}" != yes ]]; then
    die "--force on $POSTGRES_CONTAINER requires CONFIRM_FORCE=yes (dev only)"
  fi
  warn "--force on live shared Postgres — DDL is IF NOT EXISTS but this is still unusual"
fi

apply_one() {
  local db="$1" file="$2" schema="$3" table="$4"
  local path="$MIGRATION_ROOT/schema/$file"
  [[ -f "$path" ]] || die "missing $path"
  db_exists "$db" || die "database $db does not exist — run 01-create-databases.sh first"

  if [[ -n "$schema" && -n "$table" ]] && table_exists "$db" "$schema" "$table"; then
    if (( FORCE == 0 )); then
      ok "$db already has ${schema}.${table} — skip (pass --force to re-apply)"
      return 0
    fi
    warn "re-applying $file onto $db (--force)"
  else
    info "applying $file → $db"
  fi
  psql_db_file "$db" "$path"
  ok "applied $file"
}

# sentinel schema.table; empty table = always apply (audit is GRANT-only)
apply_one traverse_auth       01-traverse_auth.sql       public    roles
apply_one traverse_assets     02-traverse_assets.sql     assets    assets
apply_one traverse_cplm       03-traverse_cplm.sql       cpm       loop_registry
apply_one traverse_ingestion  04-traverse_ingestion.sql  ingestion data_source_configs
apply_one traverse_audit      05-traverse_audit.sql      ""        ""

ok "02-apply-schemas complete"
