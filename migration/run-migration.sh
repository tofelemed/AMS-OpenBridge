#!/usr/bin/env bash
# Orchestrate migration phases. Default: 00 → 01 → 02 → 03, then 05 (no Kafka create).
# 04 / 04b stay gated: ALLOW_CREATE_PREFIXED_TOPICS / ALLOW_FLINK_SUBMIT are ops
# confirms on the shared Instrumental broker — not automatic.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

FROM=00
WITH_KAFKA=0
WITH_FLINK=0

usage() {
  cat <<EOF
usage: $0 [--from 00|01|02|03|04|04b|05] [--with-kafka] [--with-flink]

Default runs 00, 01, 02, 03, then 05 (DBs + schema + HDPE/RBAC; topics optional).
--with-kafka  also runs 04 (script still refuses unless ALLOW_CREATE_PREFIXED_TOPICS=yes)
--with-flink  also runs 04 and 04b (refuses unless ALLOW_FLINK_SUBMIT=yes; JobManager must be up)
--from N      resume at that step

Does not compose-up Instrumental. Does not DROP anything.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from)
      FROM="${2:-}"
      [[ -n "$FROM" ]] || die "--from requires 00|01|02|03|04|04b|05"
      shift 2
      ;;
    --with-kafka) WITH_KAFKA=1; shift ;;
    --with-flink) WITH_FLINK=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown arg: $1" ;;
  esac
done

# Return 0 if this step should run given --from.
should_run() {
  local order="00 01 02 03 04 04b 05"
  local started=0 s
  for s in $order; do
    [[ "$s" == "$FROM" ]] && started=1
    if (( started == 1 )) && [[ "$s" == "$1" ]]; then
      return 0
    fi
  done
  return 1
}

run() {
  local step="$1" script="$2"
  info "===== $step $script ====="
  bash "$MIGRATION_ROOT/$script"
}

load_env

should_run 00 && run 00 00-prerequisites-check.sh
should_run 01 && run 01 01-create-databases.sh
should_run 02 && run 02 02-apply-schemas.sh
should_run 03 && run 03 03-seed.sh

if (( WITH_FLINK == 1 )); then
  WITH_KAFKA=1
fi

if (( WITH_KAFKA == 1 )); then
  should_run 04 && run 04 04-create-kafka-topics.sh
else
  info "skipping 04 (ops confirm: set ALLOW_CREATE_PREFIXED_TOPICS=yes and re-run with --with-kafka)"
fi

if (( WITH_FLINK == 1 )); then
  should_run 04b && run 04b 04b-submit-flink-jobs.sh
fi

val_args=()
(( WITH_KAFKA == 1 )) && val_args+=(--require-kafka)
(( WITH_FLINK == 1 )) && val_args+=(--require-flink)
if should_run 05; then
  info "===== 05 05-validate.sh ${val_args[*]:-} ====="
  bash "$MIGRATION_ROOT/05-validate.sh" ${val_args[@]+"${val_args[@]}"}
fi

ok "run-migration finished"
