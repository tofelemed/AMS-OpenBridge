#!/usr/bin/env bash
# Phase 8 / 0 — pass/fail/warn only. No writes.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_env

FAILS=0
hit() { fail "$1"; FAILS=$((FAILS + 1)); }

info "prerequisites (read-only)  postgres=$POSTGRES_CONTAINER  kafka=$KAFKA_CONTAINER"

command -v docker >/dev/null || hit "docker is not on PATH"
if command -v docker >/dev/null; then
  docker info >/dev/null 2>&1 || hit "docker daemon is not reachable"
  docker compose version >/dev/null 2>&1 || warn "docker compose v2 not found (needed later for deploy)"
fi

if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  if docker network inspect "$DOCKER_NETWORK" >/dev/null 2>&1; then
    ok "network $DOCKER_NETWORK exists"
  else
    hit "docker network '$DOCKER_NETWORK' missing"
  fi

  if container_running "$POSTGRES_CONTAINER"; then
    if docker exec "$POSTGRES_CONTAINER" pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1; then
      ok "$POSTGRES_CONTAINER is running and pg_isready"
    else
      hit "$POSTGRES_CONTAINER running but pg_isready failed"
    fi
  else
    hit "$POSTGRES_CONTAINER is not running"
  fi

  if container_running "$KAFKA_CONTAINER"; then
    ok "$KAFKA_CONTAINER is running"
  else
    hit "$KAFKA_CONTAINER is not running"
  fi
fi

if [[ -n "${AMS_DB_PASSWORD:-}" && "$AMS_DB_PASSWORD" != CHANGE_ME ]]; then
  ok "AMS_DB_PASSWORD is set"
else
  warn "AMS_DB_PASSWORD is empty or CHANGE_ME (01 will refuse)"
fi
if [[ -n "${BOOTSTRAP_ADMIN_PASSWORD:-}" && "$BOOTSTRAP_ADMIN_PASSWORD" != CHANGE_ME ]]; then
  ok "BOOTSTRAP_ADMIN_PASSWORD is set"
else
  warn "BOOTSTRAP_ADMIN_PASSWORD is empty or CHANGE_ME (03 will skip admin user)"
fi

if command -v free >/dev/null; then
  mem_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
  mem_gb=$((mem_kb / 1024 / 1024))
  if (( mem_gb < 16 )); then
    warn "host RAM ~${mem_gb}G — Flink + EMQX + IoTDB on top of Instrumental Kafka needs headroom"
  else
    ok "host RAM ~${mem_gb}G"
  fi
fi

if command -v df >/dev/null; then
  avail="$(df -BG / 2>/dev/null | awk 'NR==2 {gsub(/G/,"",$4); print $4}')"
  if [[ "${avail:-}" =~ ^[0-9]+$ ]] && (( avail < 20 )); then
    warn "root filesystem has ${avail}G free"
  fi
fi

# This app's usual host ports. Instrumental keeps :80 — do not fail on 80/3000.
if command -v ss >/dev/null; then
  for p in 8081 8082 8088 1883 6667; do
    if ss -lnt 2>/dev/null | grep -q ":${p} "; then
      warn "host port ${p} is already bound (confirm it is not an unexpected collision)"
    fi
  done
fi

if container_running "$POSTGRES_CONTAINER" 2>/dev/null; then
  info "existing databases on $POSTGRES_CONTAINER:"
  psql_super -c '\l' || true
  for d in "${TRAVERSE_DBS[@]}"; do
    if db_exists "$d"; then
      warn "database $d already exists (01 is idempotent; 02 will skip unless --force)"
    fi
  done
  for bad in ams auth_service; do
    if db_exists "$bad" 2>/dev/null; then
      info "found '$bad' (expected for Instrumental or later AMS) — this cut will not touch it"
    fi
  done
fi

if container_running "$KAFKA_CONTAINER" 2>/dev/null; then
  if kafka_topics --list >/tmp/ams-mig-topics.txt 2>/dev/null; then
    if grep -q "^${TOPIC_PREFIX}" /tmp/ams-mig-topics.txt; then
      warn "prefixed topics already present (04 is --if-not-exists only)"
    fi
    if grep -qE '^(raw\.instrument|domain\.instrument)\.' /tmp/ams-mig-topics.txt; then
      ok "Instrumental topic namespace visible — 04 will not touch those names"
    fi
  else
    warn "could not list Kafka topics (binary or bootstrap mismatch)"
  fi
  rm -f /tmp/ams-mig-topics.txt
fi

if container_running "$FLINK_JOBMANAGER_CONTAINER" 2>/dev/null; then
  ok "$FLINK_JOBMANAGER_CONTAINER is running"
else
  warn "$FLINK_JOBMANAGER_CONTAINER not up (expected until AMS Flink compose)"
fi

if (( FAILS > 0 )); then
  fail "$FAILS check(s) failed — fix before 01"
  exit 1
fi
ok "prerequisites passed (zero FAIL)"
exit 0
