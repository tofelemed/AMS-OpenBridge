#!/usr/bin/env bash
# Runs migration/04b-submit-flink-jobs.sh against a FAKE docker and prints, per job, the class, the
# --evidence-emit value the job would receive (the FIRST one wins: EvidencePolicy.fromArgs) and the
# parallelism. No container, no Flink, nothing submitted. Use it after every edit of 04b.
#   bash migration/deploy/stub-04b.sh                                            # defaults
#   bash migration/deploy/stub-04b.sh CPLM_SHORT_EVIDENCE_EMIT=episodes CPLM_SHORT_PARALLELISM=4
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/docker" <<'DOCKER'
#!/usr/bin/env bash
case "${1:-}" in
  inspect) [[ "${2:-}" == -f ]] && echo true; exit 0 ;;
  exec)
    shift 2
    case "${1:-}" in
      curl|test) exit 0 ;;
      /opt/flink/bin/flink) shift; [[ "${1:-}" == list ]] && exit 0; echo "SUBMIT $*"; exit 0 ;;
    esac ;;
esac
exit 0
DOCKER
cat > "$tmp/sleep" <<'SLEEP'
#!/usr/bin/env bash
exit 0
SLEEP
chmod +x "$tmp/docker" "$tmp/sleep"
printf 'POSTGRES_PASSWORD=stub\n' > "$tmp/env"
for kv in "$@"; do printf '%s\n' "$kv" >> "$tmp/env"; done
PATH="$tmp:$PATH" ALLOW_FLINK_SUBMIT=yes MIGRATION_ENV="$tmp/env" bash "$here/../04b-submit-flink-jobs.sh" 2>/dev/null \
  | grep '^SUBMIT ' | while read -r _ rest; do
      class="$(grep -oE ' -c [^ ]+' <<<" $rest" | awk '{print $2}')"
      emit="$(grep -oE -- '--evidence-emit [^ ]+' <<<"$rest" | head -1 | awk '{print $2}')"
      par="$(grep -oE ' -p [^ ]+' <<<" $rest" | awk '{print $2}')"
      printf '%-52s evidence-emit=%-9s parallelism=%s\n' "$class" "${emit:-<not given>}" "$par"
    done || true
