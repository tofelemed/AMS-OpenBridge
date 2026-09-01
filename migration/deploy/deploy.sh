#!/usr/bin/env bash
# One-shot Marun deploy. Tees a log. Does not compose-up Instrumental Postgres/Kafka.
# Does not DROP databases or delete Kafka topics.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
REPO_ROOT="$(cd "$MIGRATION_ROOT/.." && pwd)"
# shellcheck source=../lib.sh
source "$MIGRATION_ROOT/lib.sh"

SKIP_MIGRATION=0
SKIP_COMPOSE=1
NO_BUILD=0
WITH_COMPOSE=0

usage() {
  cat <<EOF
usage: $0 [--compose] [--prod] [--no-build] [--skip-migration] [--skip-compose]

  (default)  00 → 01 → 02 → 03 → 05
             + 04 if ALLOW_CREATE_PREFIXED_TOPICS=yes
  --compose  docker compose --profile cpa (may build if images missing)
  --prod     plant start: implies --compose --no-build (never npm / registry)
  --no-build skip image build; pass --no-build to compose up
  --skip-migration  compose only (infra already migrated)
  --skip-compose    ignore --compose (migration only)

04 / 04b never run from this script unless the matching ALLOW_* flag is yes.
Never: docker compose down -v, kafka-reset-lab-topics.ps1, DROP DATABASE.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --compose) WITH_COMPOSE=1; SKIP_COMPOSE=0; shift ;;
    --prod) WITH_COMPOSE=1; SKIP_COMPOSE=0; NO_BUILD=1; shift ;;
    --no-build) NO_BUILD=1; shift ;;
    --skip-migration) SKIP_MIGRATION=1; shift ;;
    --skip-compose) SKIP_COMPOSE=1; WITH_COMPOSE=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown arg: $1" ;;
  esac
done

load_env
require_not_change_me AMS_DB_PASSWORD "${AMS_DB_PASSWORD:-}"

mkdir -p "$DEPLOY_DIR/logs"
STAMP="$(date +%Y%m%d_%H%M%S)"
LOG="$DEPLOY_DIR/logs/deploy-${STAMP}.log"
exec > >(tee -a "$LOG") 2>&1
info "logging to $LOG"

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ams-cpa}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$AMS_DB_PASSWORD}"
export AUTH_BOOTSTRAP_PASSWORD="${AUTH_BOOTSTRAP_PASSWORD:-${BOOTSTRAP_ADMIN_PASSWORD:-}}"
export AUTH_BOOTSTRAP_USERNAME="${AUTH_BOOTSTRAP_USERNAME:-${BOOTSTRAP_ADMIN_USERNAME:-admin}}"
export AUTH_BOOTSTRAP_EMAIL="${AUTH_BOOTSTRAP_EMAIL:-${BOOTSTRAP_ADMIN_EMAIL:-admin@local}}"

COMPOSE=(
  docker compose
  --env-file "$MIGRATION_ROOT/.env"
  -f "$REPO_ROOT/infra/docker/docker-compose.yml"
  -f "$DEPLOY_DIR/docker-compose.marun.yml"
  --project-directory "$REPO_ROOT/infra/docker"
  --profile cpa
)

if [[ "${START_AMS_API:-}" == yes ]]; then
  COMPOSE+=(--profile cpa-ams-api)
  warn "START_AMS_API=yes — ams-api needs an 'ams' database this cut does not create"
fi

require_compose_secrets() {
  local n
  for n in TRAVERSE_SERVICE_KEY REDIS_PASSWORD EMQX_EDGE_PASSWORD \
           EMQX_DASHBOARD_PASSWORD INGESTION_ENCRYPTION_KEY IOTDB_PASSWORD \
           MINIO_ROOT_PASSWORD GRAFANA_PASSWORD PGADMIN_DEFAULT_PASSWORD; do
    require_not_change_me "$n" "${!n:-}"
  done
  require_not_change_me AUTH_BOOTSTRAP_PASSWORD "${AUTH_BOOTSTRAP_PASSWORD:-}"
}

if (( SKIP_MIGRATION == 0 )); then
  mig_args=()
  if [[ "${ALLOW_CREATE_PREFIXED_TOPICS:-}" == yes ]]; then
    mig_args+=(--with-kafka)
  else
    warn "ALLOW_CREATE_PREFIXED_TOPICS not yes — skipping Kafka topic create (04)"
  fi
  # 04b needs JobManager. With --compose that container does not exist yet.
  if [[ "${ALLOW_FLINK_SUBMIT:-}" == yes ]]; then
    if (( WITH_COMPOSE == 1 && SKIP_COMPOSE == 0 )); then
      info "ALLOW_FLINK_SUBMIT=yes — 04b runs after compose brings up JobManager"
    else
      mig_args+=(--with-flink)
    fi
  else
    warn "ALLOW_FLINK_SUBMIT not yes — skipping Flink submit (04b)"
  fi
  info "===== run-migration ${mig_args[*]:-(db/schema/seed only)} ====="
  bash "$MIGRATION_ROOT/run-migration.sh" ${mig_args[@]+"${mig_args[@]}"}
else
  info "skipping migration (--skip-migration)"
  bash "$MIGRATION_ROOT/00-prerequisites-check.sh"
fi

if (( WITH_COMPOSE == 1 && SKIP_COMPOSE == 0 )); then
  require_compose_secrets
  info "===== compose up --profile cpa (no Instrumental postgres/kafka) ====="
  if (( NO_BUILD == 0 )); then
    # Plant guard: building on the air-gapped VM would hit npm/NuGet/Maven.
    # The Instrumental stack only exists on the shared Marun VM.
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^instrumental-postgres$'; then
      err "instrumental-postgres is running — this is the PLANT VM. Use --prod (images arrive via docker load)."
      exit 1
    fi
    "${COMPOSE[@]}" build
    "${COMPOSE[@]}" up -d
  else
    info "up --no-build (missing image fails instead of npm ci / docker pull)"
    "${COMPOSE[@]}" up -d --no-build
  fi
  info "HTTP: gateway host port ${GATEWAY_HOST_PORT:-8081} (Instrumental keeps :80). Frontend ${FRONTEND_HOST_PORT:-8090}."

  if [[ "${ALLOW_FLINK_SUBMIT:-}" == yes ]]; then
    if [[ "${ALLOW_CREATE_PREFIXED_TOPICS:-}" != yes ]]; then
      warn "ALLOW_FLINK_SUBMIT=yes but topics were not created this run — 04b still submits"
    fi
    info "===== 04b after JobManager is up ====="
    bash "$MIGRATION_ROOT/04b-submit-flink-jobs.sh"
    val=(--require-flink)
    [[ "${ALLOW_CREATE_PREFIXED_TOPICS:-}" == yes ]] && val+=(--require-kafka)
    bash "$MIGRATION_ROOT/05-validate.sh" "${val[@]}"
  fi
else
  info "compose skipped (pass --compose when overlay + secrets are ready)"
fi

ok "deploy finished  log=$LOG"
ok "Instrumental Postgres/Kafka were not stopped or wiped"
