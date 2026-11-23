#!/usr/bin/env bash
# CHG-226 — stop the stateful CPA jobs with a savepoint before a planned Flink restart, so 04b can resume them and
# the 12 h / 24 h windows run straight through. Prints, per job, the line 04b takes:
#   export RESUME_LONG_FROM=s3://ams-flink/savepoints/savepoint-...
#   export RESUME_FUSION_FROM=s3://ams-flink/savepoints/savepoint-...
# usage: ALLOW_FLINK_STOP=yes bash migration/flink-stop-with-savepoint.sh [--out FILE] [long] [fusion]
#   jobs   default "long fusion"; Long first, so a failed Long savepoint leaves everything running.
#   --out  also appends the lines to FILE (then `source FILE` before deploy.sh / 04b; the newest line wins).
# Never drains: a drain fires every pending window timer and writes windows that end in the future.
# Refuses to go on when a savepoint fails; the job it failed on keeps running. Uses the JobManager REST API
# (POST /jobs/<id>/stop, then polls), not `flink stop`, whose client gives up after 60 s while a large savepoint
# is still being written. Procedure and rules: docs/next-release/flink-savepoint-procedure.md.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_env
export MSYS_NO_PATHCONV=1   # Git Bash (lab rehearsal): leave /data/... arguments alone; no effect on Linux

[[ "${ALLOW_FLINK_STOP:-}" == yes ]] || die "refusing without ALLOW_FLINK_STOP=yes (stops the named Flink jobs; verdicts pause until 04b resumes them)"

JM="${FLINK_JOBMANAGER_CONTAINER}"
JM_PORT="${FLINK_JOBMANAGER_PORT}"
TIMEOUT="${SAVEPOINT_TIMEOUT_S:-900}"
FORMAT="${SAVEPOINT_FORMAT:-CANONICAL}"      # NATIVE = RocksDB files: smaller and faster, same backend required
OUT=""
KEYS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT="${2:?--out needs a file}"; shift 2 ;;
    long|fusion) KEYS+=("$1"); shift ;;
    *) die "unknown argument '$1' (long | fusion | --out FILE). Response is stateless by rule and the other jobs refill within the hour: they restart fresh" ;;
  esac
done
[[ ${#KEYS[@]} -gt 0 ]] || KEYS=(long fusion)
[[ "$FORMAT" == CANONICAL || "$FORMAT" == NATIVE ]] || die "SAVEPOINT_FORMAT must be CANONICAL or NATIVE"

rest() {   # rest <path> [curl args]: no -f, so an error reply's text reaches the message
  local path="$1"; shift
  docker exec "$JM" curl -s -m 30 "$@" "http://localhost:${JM_PORT}${path}"
}

field() {   # field <json> <key>: the first string value of "key"
  grep -oE "\"$2\":\"[^\"]*\"" <<<"$1" | head -1 | cut -d'"' -f4 || true
}

require_container "$JM"
if docker ps --format '{{.Names}}' | grep -qx ams-flink-job-supervisor; then
  die "ams-flink-job-supervisor is running: it would resubmit a stopped job fresh within a minute. docker stop it first"
fi
SP_DIR="${SAVEPOINT_DIR:-}"
if [[ -z "$SP_DIR" ]]; then
  SP_DIR="$(rest /jobmanager/config | grep -oE '"key":"state\.savepoints\.dir","value":"[^"]*"' | cut -d'"' -f8 || true)"
fi
[[ -n "$SP_DIR" ]] || die "state.savepoints.dir is not configured on $JM (set SAVEPOINT_DIR)"
info "savepoint directory $SP_DIR, format $FORMAT, timeout ${TIMEOUT}s per job"

stop_one() {
  local name="$1" var="$2" jids jid trig body st loc state cause t0 t
  jids="$(rest /jobs/overview | sed 's/{"jid":/\n&/g' | grep -F "\"name\":\"$name\"" | grep -F '"state":"RUNNING"' \
          | grep -oE '"jid":"[0-9a-f]{32}"' | cut -d'"' -f4 || true)"
  [[ "$(wc -w <<<"$jids")" -eq 1 ]] || die "expected one RUNNING '$name', found $(wc -w <<<"$jids"): stopped nothing more"
  jid="$jids"; t0="$(date +%s)"
  info "stopping '$name' ($jid) with a savepoint (no drain)"
  body="$(rest "/jobs/$jid/stop" -X POST -H 'Content-Type: application/json' \
          -d "{\"targetDirectory\":\"$SP_DIR\",\"drain\":false,\"formatType\":\"$FORMAT\"}" || true)"
  trig="$(field "$body" request-id)"
  [[ -n "$trig" ]] || die "the JobManager refused the stop of '$name' ($jid): it keeps running. Reply: ${body:-none}"
  for (( t = 0; t < TIMEOUT; t += 5 )); do
    body="$(rest "/jobs/$jid/savepoints/$trig" || true)"
    st="$(grep -oE '"status":\{"id":"[A-Z_]+"' <<<"$body" | cut -d'"' -f6 || true)"
    [[ "$st" == COMPLETED ]] && break
    sleep 5
  done
  [[ "$st" == COMPLETED ]] || die "savepoint of '$name' not finished after ${TIMEOUT}s (status ${st:-unknown}): look at /jobs/$jid before anything else"
  loc="$(field "$body" location)"
  if [[ -z "$loc" ]]; then
    cause="$(grep -oE 'Caused by: [^\\]*' <<<"$body" | tail -1 || true)"
    die "savepoint of '$name' FAILED (${cause:-$(field "$body" class)}); the job keeps running, check /jobs/$jid"
  fi
  for (( t = 0; t < 120; t += 5 )); do
    state="$(rest "/jobs/$jid" | grep -oE '"state":"[A-Z]+"' | head -1 | cut -d'"' -f4 || true)"
    [[ "$state" == FINISHED ]] && break
    sleep 5
  done
  [[ "$state" == FINISHED ]] || die "savepoint written ($loc) but '$name' is ${state:-unknown}, not FINISHED: check /jobs/$jid"
  ok "'$name' stopped in $(( $(date +%s) - t0 )) s; savepoint $loc"
  if [[ "$loc" == s3://ams-flink/* ]]; then
    info "size: $(docker exec "$MINIO_CONTAINER" du -sh "/data/${loc#s3://}" 2>/dev/null | cut -f1 || echo '?')"
  fi
  echo "export $var=$loc"
  if [[ -n "$OUT" ]]; then
    printf '# %s %s (job %s)\nexport %s=%s\n' "$(date -u +%FT%TZ)" "$name" "$jid" "$var" "$loc" >> "$OUT"
  fi
}

for key in "${KEYS[@]}"; do
  case "$key" in
    long)   stop_one "AMS - CPLM Long Diagnostics Engine" RESUME_LONG_FROM ;;
    fusion) stop_one "AMS - CPLM Gate Fusion Engine" RESUME_FUSION_FROM ;;
  esac
done
info "next: cancel the other jobs, deploy, then 04b with these variables set${OUT:+ (source $OUT)}."
info "keep the savepoints until 04b reports each restore with a completed checkpoint; no MinIO clean-up in between."
