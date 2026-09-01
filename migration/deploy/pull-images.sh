#!/usr/bin/env bash
# ============================ BUILD BOX ONLY =================================
# Pulls from Docker Hub — NEVER run on the plant VM (air-gapped; images arrive
# there exclusively via the offline bundle + `docker load`).
# Pull list must stay in sync with PULL_SERVICES in deploy/prodimages.py.
# =============================================================================
# Pull images referenced by the CPA overlay. Does not start containers.
# Services that only have `build:` are skipped by pull — those are built by build-prod-images.py.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
REPO_ROOT="$(cd "$MIGRATION_ROOT/.." && pwd)"
# shellcheck source=../lib.sh
source "$MIGRATION_ROOT/lib.sh"
load_env
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ams-cpa}"

# Plant guard: the Instrumental stack only exists on the shared Marun VM.
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^instrumental-postgres$'; then
  err "instrumental-postgres is running on this host — this looks like the PLANT VM. Refusing to pull."
  exit 1
fi

COMPOSE=(
  docker compose
  --env-file "$MIGRATION_ROOT/.env"
  -f "$REPO_ROOT/infra/docker/docker-compose.yml"
  -f "$DEPLOY_DIR/docker-compose.marun.yml"
  --project-directory "$REPO_ROOT/infra/docker"
  --profile cpa
)

info "pulling CPA overlay images (incl. init helpers; app images are built by build-prod-images.py)"
"${COMPOSE[@]}" pull redis redis-contract iotdb iotdb-init minio minio-init emqx emqx-init
ok "pull finished"
