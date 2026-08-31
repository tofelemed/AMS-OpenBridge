#!/usr/bin/env bash
# Phase 2 — create the five traverse_* databases + AMS_DB_USER.
# Idempotent. Never DROP DATABASE. Never create Instrumental names or ams.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_env

require_container "$POSTGRES_CONTAINER"
require_not_change_me AMS_DB_PASSWORD "${AMS_DB_PASSWORD:-}"

for d in "${TRAVERSE_DBS[@]}"; do
  assert_allowed_dbname "$d"
done

info "creating role ${AMS_DB_USER} (if missing) and databases on $POSTGRES_CONTAINER"

# Password via psql -v so %L quotes the secret. Do not put it in the SQL file.
docker exec -i "$POSTGRES_CONTAINER" \
  psql -U "$POSTGRES_USER" -v ON_ERROR_STOP=1 \
    -v "dbpw=${AMS_DB_PASSWORD}" -v "rolename=${AMS_DB_USER}" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'rolename', :'dbpw')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'rolename')\gexec
SQL

if [[ "$(psql_super -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${AMS_DB_USER}'")" != 1 ]]; then
  die "role ${AMS_DB_USER} was not created"
fi
psql_super -c "ALTER ROLE ${AMS_DB_USER} WITH LOGIN;" >/dev/null
ok "role ${AMS_DB_USER} exists (existing passwords are not changed)"

for d in "${TRAVERSE_DBS[@]}"; do
  if db_exists "$d"; then
    ok "database $d already exists — skip CREATE"
  else
    info "CREATE DATABASE $d OWNER ${AMS_DB_USER}"
    docker exec -i "$POSTGRES_CONTAINER" \
      psql -U "$POSTGRES_USER" -v ON_ERROR_STOP=1 \
        -v "dbname=${d}" -v "rolename=${AMS_DB_USER}" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'dbname', :'rolename')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'dbname')\gexec
SQL
    db_exists "$d" || die "CREATE DATABASE $d failed"
    ok "created $d"
  fi
  psql_super -c "GRANT ALL PRIVILEGES ON DATABASE ${d} TO ${AMS_DB_USER};" >/dev/null
  psql_db "$d" -c "GRANT ALL ON SCHEMA public TO ${AMS_DB_USER};" >/dev/null
  # No Timescale here (T1-lite still open). 39_ is not applied this cut.
done

info "databases matching traverse_:"
psql_super -c '\l' || true

ok "01-create-databases complete"
