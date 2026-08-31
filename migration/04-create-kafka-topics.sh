#!/usr/bin/env bash
# Phase 6 — create topics from kafka/topics.txt only (--if-not-exists).
# Refuse until ALLOW_CREATE_PREFIXED_TOPICS=yes (ops confirm on the shared broker).
# Never delete topics. Never call scripts/kafka-reset-lab-topics.ps1.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_env

if [[ "${ALLOW_CREATE_PREFIXED_TOPICS:-}" != yes ]]; then
  die "refusing to create topics on the shared broker without ALLOW_CREATE_PREFIXED_TOPICS=yes.
That flag is the ops confirm for Instrumental Kafka. Code already uses ${TOPIC_PREFIX}*.
Never run scripts/kafka-reset-lab-topics.ps1 on this cluster."
fi

require_container "$KAFKA_CONTAINER"
LIST="$MIGRATION_ROOT/kafka/topics.txt"
[[ -f "$LIST" ]] || die "missing $LIST"

info "creating topics on $KAFKA_CONTAINER (RF=${KAFKA_TOPIC_RF} minISR=${KAFKA_TOPIC_MIN_ISR})"

created=0
while IFS= read -r raw || [[ -n "$raw" ]]; do
  line="${raw%%$'\r'}"
  [[ -z "$line" || "$line" == \#* ]] && continue
  IFS=$'\t' read -r topic parts cleanup retention compression lab <<<"$line"
  [[ -n "$topic" ]] || continue
  [[ "$topic" == "${TOPIC_PREFIX}"* ]] || die "topic '$topic' does not start with ${TOPIC_PREFIX}"
  [[ "$parts" =~ ^[0-9]+$ ]] || die "bad partition count for $topic"

  args=(
    --create --if-not-exists
    --topic "$topic"
    --partitions "$parts"
    --replication-factor "$KAFKA_TOPIC_RF"
    --config "min.insync.replicas=${KAFKA_TOPIC_MIN_ISR}"
    --config "cleanup.policy=${cleanup}"
  )
  if [[ "$cleanup" == delete && -n "${retention:-}" ]]; then
    args+=(--config "retention.ms=${retention}")
  fi
  if [[ -n "${compression:-}" && "$compression" != - ]]; then
    args+=(--config "compression.type=${compression}")
  fi

  info "ensure $topic (parts=$parts policy=$cleanup lab=$lab)"
  if kafka_topics "${args[@]}"; then
    created=$((created + 1))
  else
    die "kafka-topics failed for $topic"
  fi
done <"$LIST"

info "topic list (prefixed):"
kafka_topics --list | grep "^${TOPIC_PREFIX}" || true
ok "04-create-kafka-topics complete (${created} ensure calls)"
