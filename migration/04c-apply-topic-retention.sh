#!/usr/bin/env bash
# Phase 6b — apply retention.ms / segment.ms from kafka/topics.txt to topics that ALREADY EXIST.
# 04-create-kafka-topics.sh only creates (--if-not-exists): a retention change in topics.txt
# never reaches a live topic, and deleting a topic a consumer polls resurrects it with broker
# defaults within seconds (auto-create). This is the one lever: kafka-configs --alter.
# Compacted topics are left alone (they are never time-limited). Same segment rule as 04:
# roll at retention/4, floor 1 h, cap 6 h - retention only deletes CLOSED segments.
# Refuses until ALLOW_CREATE_PREFIXED_TOPICS=yes (ops confirm on the shared broker); --dry-run prints.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_env

DRY=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    -h|--help) echo "usage: $0 [--dry-run]"; exit 0 ;;
    *) die "unknown arg: $arg" ;;
  esac
done

if [[ "${ALLOW_CREATE_PREFIXED_TOPICS:-}" != yes && $DRY -eq 0 ]]; then
  die "refusing to alter topics on the shared broker without ALLOW_CREATE_PREFIXED_TOPICS=yes (or pass --dry-run)"
fi
require_container "$KAFKA_CONTAINER"

existing="$(docker exec "$KAFKA_CONTAINER" kafka-topics --bootstrap-server "$KAFKA_BOOTSTRAP_INTERNAL" --list 2>/dev/null)" \
  || die "could not list topics on $KAFKA_CONTAINER"

altered=0; skipped=0
while IFS= read -r raw || [[ -n "$raw" ]]; do
  line="${raw%%$'\r'}"
  [[ -z "$line" || "$line" == \#* ]] && continue
  IFS='|' read -r topic parts cleanup retention compression lab <<<"${line//$'\t'/|}"
  [[ -n "$topic" ]] || continue
  [[ "$topic" == "${TOPIC_PREFIX}"* || "$topic" == traverse.ingestion.* ]] \
    || die "topic '$topic' is outside the allowed namespaces (${TOPIC_PREFIX}*, traverse.ingestion.*)"
  if [[ "$cleanup" != delete || -z "${retention:-}" ]]; then
    continue                                   # compacted: never time-limited
  fi
  [[ "$retention" =~ ^[0-9]+$ ]] || die "bad retention for $topic: $retention"
  if ! grep -qx "$topic" <<<"$existing"; then
    warn "$topic does not exist yet - 04 creates it with these values"; skipped=$((skipped+1)); continue
  fi
  seg=$(( retention / 4 )); (( seg < 3600000 )) && seg=3600000; (( seg > 21600000 )) && seg=21600000
  cmd=(docker exec "$KAFKA_CONTAINER" kafka-configs --bootstrap-server "$KAFKA_BOOTSTRAP_INTERNAL"
       --alter --entity-type topics --entity-name "$topic"
       --add-config "retention.ms=${retention},segment.ms=${seg}")
  if (( DRY == 1 )); then
    echo "DRY: ${cmd[*]}"
  else
    "${cmd[@]}" >/dev/null && ok "$topic retention.ms=${retention} segment.ms=${seg}" || die "alter failed for $topic"
  fi
  altered=$((altered+1))
done <"$MIGRATION_ROOT/kafka/topics.txt"

ok "04c-apply-topic-retention: ${altered} topic(s) $( (( DRY == 1 )) && echo 'would be' || echo '') aligned, ${skipped} not created yet"
