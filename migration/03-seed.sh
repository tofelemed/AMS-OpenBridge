#!/usr/bin/env bash
# Phase 4 — HDPE hierarchy + full RBAC catalog + optional bootstrap Admin.
# Re-runnable (ON CONFLICT DO NOTHING). No houston/dallas. No loop registry rows.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_env

require_container "$POSTGRES_CONTAINER"
db_exists traverse_auth   || die "traverse_auth missing — run 01 then 02"
db_exists traverse_assets || die "traverse_assets missing — run 01 then 02"
table_exists traverse_auth public roles || die "auth schema missing — run 02-apply-schemas.sh"
table_exists traverse_assets assets assets || die "assets schema missing — run 02-apply-schemas.sh"

info "seeding RBAC catalog → traverse_auth"
psql_db_file traverse_auth "$MIGRATION_ROOT/sql/03-auth-rbac.sql"
ok "RBAC catalog applied"

info "seeding HDPE site/areas/units → traverse_assets"
psql_db_file traverse_assets "$MIGRATION_ROOT/sql/03-hdpe-hierarchy.sql"
ok "HDPE hierarchy applied"

hash_admin_password() {
  local pw="$1" out=""
  if command -v python3 >/dev/null; then
    out="$(python3 - "$pw" 2>/dev/null <<'PY' || true
import sys
pw = sys.argv[1]

try:
    import bcrypt
    print(bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=10)).decode())
except Exception:
    sys.exit(1)
PY
)"
    [[ -n "$out" ]] && { printf '%s\n' "$out"; return 0; }
  fi
  if command -v htpasswd >/dev/null; then
    out="$(htpasswd -nbBC 10 x "$pw" 2>/dev/null | awk -F: '{print $2}')" || true
    [[ -n "$out" ]] && { printf '%s\n' "$out"; return 0; }
  fi
  return 1
}

insert_admin() {
  local user="${BOOTSTRAP_ADMIN_USERNAME:-admin}"
  local email="${BOOTSTRAP_ADMIN_EMAIL:-admin@local}"
  local pw="${BOOTSTRAP_ADMIN_PASSWORD:-}"
  if [[ -z "$pw" || "$pw" == CHANGE_ME ]]; then
    warn "BOOTSTRAP_ADMIN_PASSWORD unset — skip Admin user (set it and re-run, or seed from auth-service)"
    return 0
  fi
  local existing
  # The query must arrive on STDIN: psql applies :'var' interpolation only to
  # stdin/interactive input, never to -c strings (and -c after -tAc previously
  # swallowed "-v" as the SQL). Same pattern as the INSERT heredoc below.
  existing="$(docker exec -i "$POSTGRES_CONTAINER" \
    psql -U "$POSTGRES_USER" -d traverse_auth -tA \
    -v "u=${user}" -v "e=${email}" \
    <<< "SELECT 1 FROM users WHERE username = :'u' OR email = :'e' LIMIT 1;")"
  if [[ "$existing" == 1 ]]; then
    ok "Admin user '${user}' already exists — leave password unchanged"
    return 0
  fi
  local hash
  if ! hash="$(hash_admin_password "$pw")"; then
    warn "could not bcrypt-hash password (need python3+bcrypt or apache2-utils htpasswd)"
    warn "after auth-service is up: docker exec traverse-auth-service node dist/database/seed-admin.js"
    return 0
  fi
  [[ -n "$hash" ]] || { warn "empty bcrypt hash — skip Admin insert"; return 0; }
  docker exec -i "$POSTGRES_CONTAINER" \
    psql -U "$POSTGRES_USER" -d traverse_auth -v ON_ERROR_STOP=1 \
      -v "u=${user}" -v "e=${email}" -v "h=${hash}" <<'SQL'
INSERT INTO users (username, email, password_hash, full_name, role, is_active)
VALUES (:'u', :'e', :'h', 'System Administrator', 'Admin', TRUE)
ON CONFLICT (username) DO NOTHING;
SQL
  ok "bootstrap Admin user '${user}' created"
}

insert_admin

sites="$(psql_scalar traverse_assets "SELECT COUNT(*) FROM assets.assets WHERE contextual_path = 'hdpe' AND NOT is_deleted")"
units="$(psql_scalar traverse_assets "SELECT COUNT(*) FROM assets.assets WHERE asset_type = 3 AND NOT is_deleted")"
info "HDPE site rows=${sites} unit rows=${units}"
ok "03-seed complete"
