#!/usr/bin/env bash
# Pull images referenced by the CPA overlay. Does not start containers.
# Services that only have `build:` are skipped by pull — those are built by deploy.sh --compose.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
REPO_ROOT="$(cd "$MIGRATION_ROOT/.." && pwd)"
# shellcheck source=../lib.sh
source "$MIGRATION_ROOT/lib.sh"
load_env
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ams-cpa}"

COMPOSE=(
  docker compose
  --env-file "$MIGRATION_ROOT/.env"
  -f "$REPO_ROOT/infra/docker/docker-compose.yml"
  -f "$DEPLOY_DIR/docker-compose.marun.yml"
  --project-directory "$REPO_ROOT/infra/docker"
  --profile cpa
)

info "pulling CPA overlay images (redis/iotdb/minio/emqx; app images are built by deploy.sh)"
"${COMPOSE[@]}" pull redis redis-contract iotdb minio emqx
ok "pull finished"
