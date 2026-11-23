#!/usr/bin/env bash
# Runs migration/04b-submit-flink-jobs.sh against a FAKE docker and prints, per job, the class, the
# --evidence-emit value the job would receive (the FIRST one wins: EvidencePolicy.fromArgs), the
# parallelism and the savepoint it would restore from. No container, no Flink, nothing submitted.
# Use it after every edit of 04b.
#   bash migration/deploy/stub-04b.sh                                            # defaults
#   bash migration/deploy/stub-04b.sh CPLM_SHORT_EVIDENCE_EMIT=episodes CPLM_SHORT_PARALLELISM=4
#   bash migration/deploy/stub-04b.sh RESUME_LONG_FROM=s3://ams-flink/savepoints/savepoint-aaaaaa-111111111111 \
#        RESUME_FUSION_FROM=s3://ams-flink/savepoints/savepoint-bbbbbb-222222222222 [STUB_AGE_MIN=300]
#   (CHG-226: STUB_AGE_MIN fakes the savepoint's age in MinIO, default 5; the fake JobManager reports every
#    restored job RUNNING, restored from the path it was given, with one completed checkpoint.)
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
      test) exit 0 ;;
      stat) echo $(( $(date +%s) - ${STUB_AGE_MIN:-5} * 60 )); exit 0 ;;
      curl)
        url="${*: -1}"; jid="$(grep -oE '[0-9a-f]{32}' <<<"$url" || true)"
        case "$url" in
          */checkpoints) printf '{"counts":{"restored":1,"total":1,"in_progress":0,"completed":1,"failed":0},"latest":{"restored":{"id":7,"restore_timestamp":1,"is_savepoint":true,"external_path":"%s"}}}\n' "$(cat "$STUB_DIR/$jid" 2>/dev/null)" ;;
          */jobs/*) printf '{"jid":"%s","name":"stub","state":"RUNNING"}\n' "$jid" ;;
        esac
        exit 0 ;;
      /opt/flink/bin/flink)
        shift; [[ "${1:-}" == list ]] && exit 0
        n=$(( $(cat "$STUB_DIR/n" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$STUB_DIR/n"
        jid="$(printf '%032x' "$n")"
        grep -oE ' -s [^ ]+' <<<" $*" | awk '{print $2}' > "$STUB_DIR/$jid" || true
        echo "SUBMIT $*"; echo "Job has been submitted with JobID $jid"; exit 0 ;;
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
PATH="$tmp:$PATH" STUB_DIR="$tmp" ALLOW_FLINK_SUBMIT=yes MIGRATION_ENV="$tmp/env" \
  bash "$here/../04b-submit-flink-jobs.sh" 2>/dev/null \
  | while IFS= read -r line; do
      case "$line" in
        "SUBMIT "*)
          rest="${line#SUBMIT }"
          class="$(grep -oE ' -c [^ ]+' <<<" $rest" | awk '{print $2}')"
          emit="$(grep -oE -- '--evidence-emit [^ ]+' <<<"$rest" | head -1 | awk '{print $2}')"
          par="$(grep -oE ' -p [^ ]+' <<<" $rest" | awk '{print $2}')"
          from="$(grep -oE ' -s [^ ]+' <<<" $rest" | awk '{print $2}' || true)"
          grep -q -- '--allowNonRestoredState' <<<"$rest" && from="$from +allowNonRestoredState"
          printf '%-52s evidence-emit=%-9s parallelism=%s%s\n' "$class" "${emit:-<not given>}" "$par" "${from:+ restore=$from}" ;;
        *restor*|*savepoint*|*"not proven"*) echo "  $line" ;;
      esac
    done || true   # the fake 'flink list' lists nothing, so 04b's presence check always ends non-zero here
