#!/usr/bin/env bash
# CHG-102 Phase 8 - online backup of the IoTDB historian (raw loop samples, KPI series, alarms) as TsFiles.
#
# Why: from CHG-102 the historian is the only copy of the loop history older than the hot Postgres window, and the
# evidence archive's trace references (5b-2) re-read raw columns from it. backup-cplm-db.sh covers Postgres only.
#
# How: IoTDB keeps running. For every database (SHOW DATABASES, or --db) every device (SHOW DEVICES <db>.**) is
# exported with one query per device and time window - one query per device because a whole-database SELECT fails
# with "301: not enough memory to execute current fragment instance" on a memory-capped IoTDB (lab, 2026-11-04).
# All queries of a database run in ONE export-tsfile.sh process (-s sqlfile). Devices with no rows in the window give
# empty files, which are dropped. Each database ends as <db>.tar.gz plus a MANIFEST (window, device / file counts,
# SHA-256). Exports overlap safely: a restore writes the same values at the same timestamps.
#
#   nightly (cron): migration/backup-iotdb.sh --hours 26 --keep 14     # last plant day + 2 h overlap
#   weekly:         migration/backup-iotdb.sh --full --keep 4          # everything inside the TTL (add --window-hours
#                   168 only if a device query hits the 301 memory error; windows multiply the query count)
#
# Restore (any IoTDB >= 1.3, same or new box; series are re-created from the files):
#   tar -xzf <db>.tar.gz -C /restore/<db> && docker cp /restore/<db> ams-iotdb:/tmp/restore-<db>
#   docker exec -e IOTDB_PW ams-iotdb /iotdb/tools/load-tsfile.sh -f /tmp/restore-<db> --onSuccess none \
#       -h 127.0.0.1 -p 6667 -u root -pw "$IOTDB_PW"        # IOTDB_PW exported in the calling shell
#
# Credentials: IOTDB_PASSWORD from migration/.env (or the environment). It reaches the container as an environment
# variable (never on the docker exec command line). The IoTDB client tools accept a password only as -pw, so the
# java process inside the container carries it as an argument while it runs; host users who can run `ps` (the same
# operators who can read migration/.env) can see it for that time.
#
# usage: migration/backup-iotdb.sh [--out DIR] [--hours N | --full] [--window-hours N] [--db NAME]... [--keep N]
#          [--container NAME] [--user NAME] [--min-free-gb N] [--list]
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

usage() {
  cat <<EOF
usage: $0 [options]
  --out DIR          base directory; each run writes DIR/iotdb-backup-<UTC ts>/ (default: ./iotdb-backups)
  --hours N          export the last N hours (default 26: one plant day + overlap)
  --full             export everything the databases hold (inside their TTL); use --window-hours to bound queries
  --window-hours N   split each device's range into windows of N hours (default: one window)
  --db NAME          only this database (repeatable; default: every database except root.__system)
  --keep N           keep the newest N iotdb-backup-* runs in the base directory, delete older ones (default: keep all)
  --container NAME   IoTDB container (default: IOTDB_CONTAINER from migration/.env, else ams-iotdb)
  --user NAME        IoTDB user (default: IOTDB_USER, else root)
  --min-free-gb N    refuse to start when the base directory has less free space (default 5)
  --list             list the databases and their device counts, export nothing
EOF
}

OUT_BASE="" HOURS=26 FULL=0 WINDOW_H=0 KEEP=0 ARG_CONTAINER="" ARG_USER="" MIN_FREE_GB=5 LIST=0
DBS=()
while (( $# )); do
  case "$1" in
    --out) OUT_BASE="${2:?--out needs a directory}"; shift ;;
    --hours) HOURS="${2:?--hours needs a number}"; shift ;;
    --full) FULL=1 ;;
    --window-hours) WINDOW_H="${2:?--window-hours needs a number}"; shift ;;
    --db) DBS+=("${2:?--db needs a name}"); shift ;;
    --keep) KEEP="${2:?--keep needs a number}"; shift ;;
    --container) ARG_CONTAINER="${2:?--container needs a name}"; shift ;;
    --user) ARG_USER="${2:?--user needs a name}"; shift ;;
    --min-free-gb) MIN_FREE_GB="${2:?--min-free-gb needs a number}"; shift ;;
    --list) LIST=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; die "unknown arg: $1" ;;
  esac
  shift
done
for n in HOURS WINDOW_H KEEP MIN_FREE_GB; do
  [[ "${!n}" =~ ^[0-9]+$ ]] || die "--$(tr '[:upper:]_' '[:lower:]-' <<<"$n") must be a whole number"
done
(( FULL || HOURS > 0 )) || die "--hours must be > 0 (or use --full)"
# database names go into IoTDB statements: only plain path names are accepted
for d in "${DBS[@]}"; do [[ "$d" =~ ^root(\.[A-Za-z0-9_]+)+$ ]] || die "--db '$d' is not a database path (root.x.y)"; done

PRE_PW="${IOTDB_PASSWORD:-}"            # an exported IOTDB_PASSWORD wins over migration/.env (cron, the lab)
if [[ -f "${MIGRATION_ENV:-$MIGRATION_ROOT/.env}" ]]; then load_env; fi
[[ -n "$PRE_PW" ]] && IOTDB_PASSWORD="$PRE_PW"
IOT_C="${ARG_CONTAINER:-${IOTDB_CONTAINER:-ams-iotdb}}"
IOT_U="${ARG_USER:-${IOTDB_USER:-root}}"
[[ "$IOT_U" =~ ^[A-Za-z0-9_]+$ ]] || die "IoTDB user '$IOT_U' is not a plain name"
IOTDB_PW="${IOTDB_PASSWORD:-${IOTDB_PASS:-}}"
require_not_change_me IOTDB_PASSWORD "$IOTDB_PW"
export IOTDB_PW IOT_U
require_container "$IOT_C"

# runs bash inside the IoTDB container with the password in its environment (never on this command line)
iot() { MSYS_NO_PATHCONV=1 docker exec -i -e IOTDB_PW -e IOT_U "$IOT_C" bash -c "$1"; }
CLI='/iotdb/sbin/start-cli.sh -h 127.0.0.1 -p 6667 -u "$IOT_U" -pw "$IOTDB_PW" -disableISO8601'
# the first column of a CLI table, rows starting with root. (a header or a footer never does)
first_col() { awk -F'|' '$2 ~ /^ *root\./ { gsub(/ /, "", $2); print $2 }'; }

if (( ${#DBS[@]} == 0 )); then
  mapfile -t DBS < <(iot "$CLI -e 'show databases' 2>/dev/null" | first_col | grep -v '^root\.__system' || true)
  (( ${#DBS[@]} )) || die "SHOW DATABASES returned nothing - check the password and that IoTDB answers on 6667"
fi

if (( LIST )); then
  for d in "${DBS[@]}"; do
    n=$(iot "$CLI -e 'count devices $d.**' 2>/dev/null" | awk -F'|' '$2 ~ /[0-9]/ { gsub(/ /, "", $2); print $2 }' | head -1)
    printf '%-40s %s device(s)\n' "$d" "${n:-?}"
  done
  exit 0
fi

OUT_BASE="${OUT_BASE:-$PWD/iotdb-backups}"
mkdir -p "$OUT_BASE"
free_kb=$(df -Pk "$OUT_BASE" | awk 'NR == 2 { print $4 }')
(( free_kb / 1024 / 1024 >= MIN_FREE_GB )) || die "only $(( free_kb / 1024 / 1024 )) GB free under $OUT_BASE (need $MIN_FREE_GB; --min-free-gb)"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_DIR="$OUT_BASE/iotdb-backup-$TS"
mkdir -p "$RUN_DIR"
NOW_MS=$(( $(date +%s) * 1000 ))
if (( FULL )); then FROM_MS=0; else FROM_MS=$(( NOW_MS - HOURS * 3600 * 1000 )); fi
WINDOW_MS=$(( WINDOW_H * 3600 * 1000 ))

{
  echo "IoTDB backup $TS (UTC)  container=$IOT_C  user=$IOT_U"
  if (( FULL )); then echo "range: everything held (--full), window ${WINDOW_H:-0} h"
  else echo "range: [$(date -u -d "@$(( FROM_MS / 1000 ))" +%FT%TZ), $(date -u -d "@$(( NOW_MS / 1000 ))" +%FT%TZ)) = last $HOURS h"; fi
  echo "restore: tar -xzf <db>.tar.gz, then load-tsfile.sh -f <dir> --onSuccess none (see the header of migration/backup-iotdb.sh)"
  echo
  printf '%-32s %8s %8s %10s %12s  %s\n' database devices queries files bytes sha256
} > "$RUN_DIR/MANIFEST.txt"

failed=0
for db in "${DBS[@]}"; do
  info "$db: listing devices"
  # one workspace per database inside the container (mktemp: a fresh directory, never an existing path)
  work=$(iot "mktemp -d /tmp/iotdb-backup.XXXXXX")
  [[ "$work" =~ ^/tmp/iotdb-backup\.[A-Za-z0-9]{6}$ ]] || die "unexpected workspace '$work' in $IOT_C"
  iot "$CLI -e 'show devices $db.**' 2>/dev/null" | first_col > "$RUN_DIR/.devices"
  devices=$(wc -l < "$RUN_DIR/.devices")
  # one query per device (and window); device paths come from IoTDB itself, quoted as stored
  : > "$RUN_DIR/.queries.sql"
  while IFS= read -r dev; do
    if (( WINDOW_MS > 0 && FULL )); then
      # --full with windows: oldest data inside the longest TTL (365 d covers root.ams); empty windows give empty files
      for (( t = NOW_MS - 366 * 86400000; t < NOW_MS; t += WINDOW_MS )); do
        echo "select * from $dev where time >= $t and time < $(( t + WINDOW_MS ))" >> "$RUN_DIR/.queries.sql"
      done
    elif (( WINDOW_MS > 0 )); then
      for (( t = FROM_MS; t < NOW_MS; t += WINDOW_MS )); do
        echo "select * from $dev where time >= $t and time < $(( t + WINDOW_MS ))" >> "$RUN_DIR/.queries.sql"
      done
    elif (( FULL )); then
      echo "select * from $dev" >> "$RUN_DIR/.queries.sql"
    else
      echo "select * from $dev where time >= $FROM_MS" >> "$RUN_DIR/.queries.sql"
    fi
  done < "$RUN_DIR/.devices"
  queries=$(wc -l < "$RUN_DIR/.queries.sql")
  info "$db: $devices device(s), $queries quer(ies) - exporting"
  MSYS_NO_PATHCONV=1 docker cp "$RUN_DIR/.queries.sql" "$IOT_C:$work/queries.sql" >/dev/null
  set +e
  iot "mkdir -p '$work/out' && /iotdb/tools/export-tsfile.sh -h 127.0.0.1 -p 6667 -u \"\$IOT_U\" -pw \"\$IOTDB_PW\" \
        -td '$work/out' -s '$work/queries.sql' -t 600000 2>&1" > "$RUN_DIR/.export.log"
  rc=$?
  set -e
  done_n=$(grep -c 'Export completely' "$RUN_DIR/.export.log" || true)
  errors=$(grep -E 'Cannot dump|Exception|Connect failed|[0-9]{3}: ' "$RUN_DIR/.export.log" | grep -v 'Export completely' | head -3 || true)
  if (( rc != 0 )) || [[ -n "$errors" ]] || (( done_n != queries )); then
    fail "$db: export incomplete (rc=$rc, $done_n of $queries queries): ${errors:-see $RUN_DIR/$db.export.log}"
    cp "$RUN_DIR/.export.log" "$RUN_DIR/$db.export.log"
    failed=$(( failed + 1 ))
  fi
  # an empty result is a 40-byte TsFile header: dropped; the rest packed (the map query -> dumpN stays in queries.sql)
  iot "cd '$work/out' && find . -maxdepth 1 -name '*.tsfile' -size -100c -delete; cp ../queries.sql . && tar -czf ../db.tar.gz ."
  files=$(iot "ls '$work/out' | grep -c '\\.tsfile\$' || true")
  MSYS_NO_PATHCONV=1 docker cp "$IOT_C:$work/db.tar.gz" "$RUN_DIR/$db.tar.gz" >/dev/null
  iot "rm -rf -- '$work'"
  bytes=$(stat -c %s "$RUN_DIR/$db.tar.gz")
  sha=$(sha256sum "$RUN_DIR/$db.tar.gz" | cut -d' ' -f1)
  printf '%-32s %8s %8s %10s %12s  %s\n' "$db" "$devices" "$queries" "$files" "$bytes" "$sha" >> "$RUN_DIR/MANIFEST.txt"
  ok "$db: $files non-empty file(s), $(( bytes / 1024 )) KiB"
done
rm -f "$RUN_DIR/.devices" "$RUN_DIR/.queries.sql" "$RUN_DIR/.export.log"
echo >> "$RUN_DIR/MANIFEST.txt"
echo "result: $(( ${#DBS[@]} - failed )) of ${#DBS[@]} database(s) complete" >> "$RUN_DIR/MANIFEST.txt"

if (( KEEP > 0 )); then
  mapfile -t old < <(ls -1d "$OUT_BASE"/iotdb-backup-* 2>/dev/null | sort -r | tail -n +"$(( KEEP + 1 ))")
  for o in "${old[@]}"; do
    [[ "$(basename "$o")" =~ ^iotdb-backup-[0-9]{8}T[0-9]{6}Z$ ]] || continue
    rm -rf -- "$o"; info "retention: removed $(basename "$o")"
  done
fi

(( failed == 0 )) || die "$failed database(s) incomplete - see $RUN_DIR/MANIFEST.txt"
ok "IoTDB backup complete: $RUN_DIR ($(du -sh "$RUN_DIR" | cut -f1))"
