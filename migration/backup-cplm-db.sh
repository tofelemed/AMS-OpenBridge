#!/usr/bin/env bash
# Export traverse_cplm (the cplm-api database: loop registry, calculated KPIs, gate / feature
# results, event frames, evidence) as ONE self-contained SQL script, schema + data, that creates
# the database on any PostgreSQL >= 15 and checks its own row counts at the end:
#
#   psql -U postgres -v target_db=traverse_cplm -f traverse_cplm-<ts>.sql
#
# The CREATE DATABASE fails (and the script stops) when target_db already exists, so a restore
# can never land on top of a live database. target_db defaults to traverse_cplm.
#
# Consistency: one REPEATABLE READ snapshot is exported and held open; pg_dump, the row counts and
# the Timescale hypertable copies all read that snapshot, so the counts embedded in the file are
# exact for the data in it, even while the consumers keep writing.
#
# Portability: --no-owner --no-privileges (no ams_user role needed on the target);
# --load-via-partition-root (rows re-route through the parent, so the plant's daily partitions
# restore on any partition layout). On the lab (TimescaleDB) the hypertables are written as
# plain tables with all their chunk rows; the timescaledb extension is NOT required to restore.
#
# usage: migration/backup-cplm-db.sh [--out DIR] [--gzip] [--inserts] [--verify] [--sample-rows N]
#          [--container NAME] [--user NAME] [--db NAME] [--keep-restrict] [--force-space]
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

usage() {
  cat <<EOF
usage: $0 [options]
  --out DIR          output directory (default: ./cplm-export-<UTC timestamp>)
  --gzip             write <file>.sql.gz instead of .sql (recommended on a tight disk)
  --inserts          multi-row INSERT statements instead of COPY (opens in GUI tools such as
                     pgAdmin / DBeaver; slower to restore and about 2x larger)
  --verify           restore the file into a scratch database traverse_cplm_verify_<ts> on the
                     SAME server, let its row-count check run, then drop it (needs free space
                     of about 1.5x the database size on the Postgres volume)
  --container NAME   Postgres container (default: POSTGRES_CONTAINER from migration/.env)
  --user NAME        Postgres superuser (default: POSTGRES_USER from migration/.env)
  --db NAME          source database (default: traverse_cplm)
  --keep-restrict    keep pg_dump's \\restrict lines (they need psql >= 15.14 / 16.10 / 17.6
                     to restore; stripped by default so an older psql can run the file)
  --force-space      skip the free-disk check of the output directory
  --sample-rows N    full schema, but only the first N rows of every table (a sample for another
                     team or a test database); foreign keys are created NOT VALID, sequences
                     keep their source values
EOF
}

OUT_DIR="" GZIP=0 INSERTS=0 VERIFY=0 KEEP_RESTRICT=0 FORCE_SPACE=0 SAMPLE=0
ARG_CONTAINER="" ARG_USER="" SRC_DB=traverse_cplm
while (( $# )); do
  case "$1" in
    --out) OUT_DIR="${2:?--out needs a directory}"; shift ;;
    --gzip) GZIP=1 ;;
    --inserts) INSERTS=1 ;;
    --verify) VERIFY=1 ;;
    --container) ARG_CONTAINER="${2:?--container needs a name}"; shift ;;
    --user) ARG_USER="${2:?--user needs a name}"; shift ;;
    --db) SRC_DB="${2:?--db needs a name}"; shift ;;
    --keep-restrict) KEEP_RESTRICT=1 ;;
    --force-space) FORCE_SPACE=1 ;;
    --sample-rows) SAMPLE="${2:?--sample-rows needs a number}"; shift
      [[ "$SAMPLE" =~ ^[1-9][0-9]*$ ]] || die "--sample-rows must be a positive number" ;;
    -h|--help) usage; exit 0 ;;
    *) usage; die "unknown arg: $1" ;;
  esac
  shift
done

# migration/.env is optional here: the lab has none, --container / --user cover it.
if [[ -f "${MIGRATION_ENV:-$MIGRATION_ROOT/.env}" ]]; then load_env; fi
PG_C="${ARG_CONTAINER:-${POSTGRES_CONTAINER:-instrumental-postgres}}"
PG_U="${ARG_USER:-${POSTGRES_USER:-postgres}}"
assert_allowed_dbname "$SRC_DB"
require_container "$PG_C"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${OUT_DIR:-$PWD/cplm-export-$TS}"
mkdir -p "$OUT_DIR"
SQL_FILE="$OUT_DIR/${SRC_DB}-${TS}.sql"; (( SAMPLE )) && SQL_FILE="${SQL_FILE%.sql}-sample$SAMPLE.sql"
(( GZIP )) && SQL_FILE="$SQL_FILE.gz"
MANIFEST="$OUT_DIR/MANIFEST.txt"

q() { docker exec -i "$PG_C" psql -U "$PG_U" -d "$SRC_DB" -X -qAt -v ON_ERROR_STOP=1 -c "$1"; }

# --- preflight -------------------------------------------------------------------------------
[[ "$(docker exec -i "$PG_C" psql -U "$PG_U" -d postgres -X -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '$SRC_DB'")" == 1 ]] || die "database $SRC_DB not found in $PG_C"
DB_BYTES="$(q "SELECT pg_database_size(current_database())")"
PG_VER="$(q "SHOW server_version")"
info "source $PG_C/$SRC_DB: $(numfmt --to=iec "$DB_BYTES" 2>/dev/null || echo "$DB_BYTES B"), PostgreSQL $PG_VER"

# The dump has no indexes' bytes but bytea grows ~2x as text: the database size is a fair bound.
NEED=$DB_BYTES; (( GZIP )) && NEED=$(( DB_BYTES / 3 )); (( SAMPLE )) && NEED=$(( 64 * 1048576 ))
FREE=$(( $(df -Pk "$OUT_DIR" | awk 'NR==2 {print $4}') * 1024 ))
if (( FREE < NEED )) && (( ! FORCE_SPACE )); then
  die "only $(( FREE / 1048576 )) MB free in $OUT_DIR, about $(( NEED / 1048576 )) MB needed (use --gzip, another --out, or --force-space)"
fi

HAS_TS="$(q "SELECT count(*) FROM pg_extension WHERE extname = 'timescaledb'")"

# --- one snapshot for everything -------------------------------------------------------------
coproc SNAP { docker exec -i "$PG_C" psql -U "$PG_U" -d "$SRC_DB" -X -qAt -F'|' -v ON_ERROR_STOP=1 2>&1; }
SNAP_PID=$SNAP_PID
exec {SNAP_IN}>&"${SNAP[1]}" {SNAP_OUT}<&"${SNAP[0]}"
cleanup() {
  { echo "COMMIT;" >&"$SNAP_IN"; exec {SNAP_IN}>&-; } 2>/dev/null || true
  kill "$SNAP_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Runs one statement in the snapshot session; prints its rows (up to the end marker).
snap_query() {
  local line
  printf '%s\nSELECT %s;\n' "$1" "'__END__'" >&"$SNAP_IN"
  while IFS= read -r -t 3600 line <&"$SNAP_OUT"; do
    [[ "$line" == __END__ ]] && return 0
    [[ "$line" == *ERROR:* ]] && die "snapshot session: $line"
    printf '%s\n' "$line"
  done
  die "snapshot session closed or timed out"
}

echo "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;" >&"$SNAP_IN"
SNAPSHOT="$(snap_query "SELECT pg_export_snapshot();")"
[[ "$SNAPSHOT" =~ ^[0-9A-F]+-[0-9A-F]+(-[0-9]+)?$ ]] || die "could not export a snapshot: $SNAPSHOT"
info "snapshot $SNAPSHOT held open for the export"

# Every user table that holds rows: plain tables and partition ROOTS (a root's count includes its
# partitions); no partition children, no extension-owned tables, no Timescale internals.
COUNTS="$(snap_query "
SELECT n.nspname, c.relname,
       (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg\_%' AND n.nspname NOT LIKE '\_timescaledb%' AND n.nspname NOT LIKE 'timescaledb\_%'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
ORDER BY 1, 2;")"
[[ -n "$COUNTS" ]] || die "no tables found in $SRC_DB"
TABLES=$(wc -l <<<"$COUNTS"); ROWS=$(awk -F'|' '{s += $3} END {print s}' <<<"$COUNTS")
info "$TABLES tables, $ROWS rows in the snapshot"

HYPERTABLES=""
if (( HAS_TS )); then
  HYPERTABLES="$(snap_query "SELECT hypertable_schema, hypertable_name FROM timescaledb_information.hypertables ORDER BY 1, 2;")"
  info "TimescaleDB present: $(grep -c . <<<"$HYPERTABLES" || true) hypertable(s) written as plain tables"
fi

# --- assemble the file -----------------------------------------------------------------------
DUMP_OPTS=(--snapshot="$SNAPSHOT" --no-owner --no-privileges --load-via-partition-root)
(( INSERTS )) && DUMP_OPTS+=(--column-inserts --rows-per-insert=500)
(( HAS_TS )) && DUMP_OPTS+=(--exclude-schema='_timescaledb*' --exclude-schema='timescaledb_*')

pg_dump_section() {
  docker exec "$PG_C" pg_dump -U "$PG_U" -d "$SRC_DB" "${DUMP_OPTS[@]}" "$@"
}

# Drops what a plain PostgreSQL cannot run: the timescaledb extension (lab only) and, unless
# --keep-restrict, the \restrict / \unrestrict guard lines of newer pg_dump builds.
filter_dump() {
  local expr='/^CREATE EXTENSION IF NOT EXISTS timescaledb /d; /^COMMENT ON EXTENSION timescaledb /d; /ts_insert_blocker/d'
  (( KEEP_RESTRICT )) || expr="$expr; /^\\\\(un)?restrict /d"
  sed -E "$expr"
}

header() {
  cat <<EOF
-- ===========================================================================================
-- $SRC_DB export: schema + data, one consistent snapshot
--   source     : container $PG_C, PostgreSQL $PG_VER, $(date -u '+%Y-%m-%d %H:%M:%S UTC')
--   content    : $TABLES tables, $ROWS rows in the source$( (( SAMPLE )) && printf '%s' "; SAMPLE: the first $SAMPLE rows of every table, foreign keys NOT VALID")
--   restore    : psql -U postgres -v target_db=$SRC_DB -f $(basename "${SQL_FILE%.gz}")
--                (target_db must not exist yet; needs the btree_gist + pgcrypto contrib extensions)
--   produced by: migration/backup-cplm-db.sh
-- ===========================================================================================
\\set ON_ERROR_STOP on
\\if :{?target_db}
\\else
\\set target_db $SRC_DB
\\endif
SELECT format('CREATE DATABASE %I TEMPLATE template0 ENCODING ''UTF8''', :'target_db') \\gexec
\\connect :"target_db"

EOF
}

# One COPY block per table, read through the same snapshot (a hypertable: chunks + compressed
# chunks; a partition root: all partitions). $3 = row limit (empty: every row).
copy_table() {
  local s="$1" t="$2" limit="${3:-}" cols
  cols="$(q "SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) FROM pg_attribute
             WHERE attrelid = format('%I.%I', '$s', '$t')::regclass AND attnum > 0 AND NOT attisdropped AND attgenerated = ''")"
  printf '\n-- %s.%s%s\nCOPY "%s"."%s" (%s) FROM stdin;\n' "$s" "$t" "${limit:+ (first $limit rows)}" "$s" "$t" "$cols"
  printf "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSET TRANSACTION SNAPSHOT '%s';\nCOPY (SELECT %s FROM \"%s\".\"%s\"%s) TO STDOUT;\nCOMMIT;\n" \
    "$SNAPSHOT" "$cols" "$s" "$t" "${limit:+ LIMIT $limit}" | docker exec -i "$PG_C" psql -U "$PG_U" -d "$SRC_DB" -X -q -v ON_ERROR_STOP=1
  printf '\\.\n'
}

hypertable_data() {
  local s t
  while IFS='|' read -r s t <&3; do
    [[ -n "$s" ]] && copy_table "$s" "$t"
  done 3<<<"$HYPERTABLES"
}

# --sample-rows: the first N rows of every table, then every sequence at its source value
# (new inserts on the restored database never collide with the sampled ids).
sample_data() {
  local s t n
  while IFS='|' read -r s t n <&3; do
    [[ -n "$s" ]] && copy_table "$s" "$t" "$SAMPLE"
  done 3<<<"$COUNTS"
  printf '\n-- sequences at their source values\n'
  q "SELECT format('SELECT pg_catalog.setval(%L, %s, %s);', format('%I.%I', schemaname, sequencename),
                   coalesce(last_value, start_value), CASE WHEN last_value IS NULL THEN 'false' ELSE 'true' END)
     FROM pg_sequences WHERE schemaname NOT LIKE '\_timescaledb%' AND schemaname NOT LIKE 'timescaledb\_%' ORDER BY 1"
}

# A sample's child rows may point at parent rows that were not sampled: foreign keys are created
# NOT VALID (enforced for every new row, existing sample rows not checked).
fk_not_valid() {
  sed -E '/ADD CONSTRAINT .* FOREIGN KEY /s/;$/ NOT VALID;/'
}

footer() {
  local values
  values="$(awk -F'|' -v q="'" -v cap="$SAMPLE" '{n = $3; if (cap > 0 && n > cap) n = cap;
    printf "%s(%s%s%s, %s%s%s, %s)", (NR > 1 ? ",\n    " : "    "), q, $1, q, q, $2, q, n}' <<<"$COUNTS")"
  cat <<EOF

-- ===========================================================================================
-- Self-check: every table must hold exactly the rows it held in the source snapshot.
-- ===========================================================================================
SET search_path = public;
SET client_min_messages = notice;
DO \$check\$
DECLARE r record; n bigint; bad int := 0;
BEGIN
  FOR r IN SELECT * FROM (VALUES
$values
  ) AS v(s, t, expected) LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I', r.s, r.t) INTO n;
    IF n <> r.expected THEN
      bad := bad + 1;
      RAISE WARNING '%.%: % rows, expected %', r.s, r.t, n, r.expected;
    END IF;
  END LOOP;
  IF bad > 0 THEN RAISE EXCEPTION 'restore check FAILED: % table(s) differ from the source', bad; END IF;
  RAISE NOTICE 'restore check OK: $TABLES tables, $(awk -F'|' -v cap="$SAMPLE" '{n = $3; if (cap > 0 && n > cap) n = cap; s += n} END {print s}' <<<"$COUNTS") rows match the source$( (( SAMPLE )) && echo " sample")';
END
\$check\$;
ANALYZE;
EOF
}

info "writing $SQL_FILE"
# A broken stream (pg_dump killed, server restart, docker exec dropped) must never leave a
# plausible-looking file behind: any failure removes it, and the file must end with the footer.
if ! {
  header
  if (( SAMPLE )); then
    pg_dump_section --section=pre-data | filter_dump
    sample_data
    pg_dump_section --section=post-data | filter_dump | fk_not_valid
  elif [[ -z "$HYPERTABLES" ]]; then
    pg_dump_section | filter_dump
  else
    pg_dump_section --section=pre-data --section=data | filter_dump
    hypertable_data
    pg_dump_section --section=post-data | filter_dump
  fi
  footer
} | if (( GZIP )); then gzip -6; else cat; fi >"$SQL_FILE"; then
  rm -f "$SQL_FILE"
  die "export FAILED (pg_dump or the server stopped mid-stream); partial file removed"
fi
LAST_LINE="$(if (( GZIP )); then gunzip -c "$SQL_FILE"; else cat "$SQL_FILE"; fi | tail -n 1)"
if [[ "$LAST_LINE" != "ANALYZE;" ]]; then
  rm -f "$SQL_FILE"
  die "export FAILED: the file does not end with the self-check (truncated stream); partial file removed"
fi

cleanup; trap - EXIT
ok "export done: $(du -h "$SQL_FILE" | cut -f1)"

SHA="$(sha256sum "$SQL_FILE" | cut -d' ' -f1)"
{
  echo "$SRC_DB export $TS"
  echo "file      : $(basename "$SQL_FILE")"
  echo "sha256    : $SHA"
  echo "source    : $PG_C, PostgreSQL $PG_VER, database size $DB_BYTES bytes"
  echo "snapshot  : $SNAPSHOT"
  echo "format    : $( (( INSERTS )) && echo INSERT || echo COPY )$( (( GZIP )) && echo ', gzip' )$( (( HAS_TS )) && echo ', Timescale hypertables as plain tables' )$( (( SAMPLE )) && echo ", SAMPLE first $SAMPLE rows per table (COPY), foreign keys NOT VALID" )"
  echo
  echo "restore (target database must not exist; PostgreSQL >= 15 with contrib):"
  if (( GZIP )); then
    echo "  gunzip -c $(basename "$SQL_FILE") | psql -U postgres -v target_db=$SRC_DB"
  else
    echo "  psql -U postgres -v target_db=$SRC_DB -f $(basename "$SQL_FILE")"
  fi
  echo "  the last statement prints 'restore check OK' or stops with 'restore check FAILED'"
  echo
  echo "rows per table at export (schema.table rows):"
  awk -F'|' '{printf "  %-60s %12s\n", $1 "." $2, $3}' <<<"$COUNTS"
} >"$MANIFEST"
ok "manifest: $MANIFEST"

# --- optional trial restore ------------------------------------------------------------------
if (( VERIFY )); then
  VDB="${SRC_DB}_verify_$(date -u +%Y%m%d%H%M%S)"
  assert_allowed_dbname "$VDB"
  PG_FREE=$(( $(docker exec "$PG_C" df -Pk /var/lib/postgresql/data | awk 'NR==2 {print $4}') * 1024 ))
  WANT=$(( DB_BYTES * 3 / 2 )); (( SAMPLE )) && WANT=$(( 1024 * 1048576 ))
  (( PG_FREE > WANT )) || die "verify skipped: $(( PG_FREE / 1048576 )) MB free on the Postgres volume, $(( WANT / 1048576 )) MB wanted"
  drop_vdb() { docker exec -i "$PG_C" psql -U "$PG_U" -d postgres -X -q -c "DROP DATABASE IF EXISTS \"$VDB\"" >/dev/null || warn "drop $VDB by hand"; }
  trap drop_vdb EXIT
  info "trial restore into $VDB"
  VLOG="$OUT_DIR/verify-restore.log"
  set +e
  if (( GZIP )); then gunzip -c "$SQL_FILE"; else cat "$SQL_FILE"; fi |
    docker exec -i "$PG_C" psql -U "$PG_U" -d postgres -X -q -v ON_ERROR_STOP=1 -v target_db="$VDB" >"$VLOG" 2>&1
  RC=$?
  set -e
  grep -E 'restore check|ERROR|FATAL|WARNING' "$VLOG" || true
  (( RC == 0 )) && grep -q 'restore check OK' "$VLOG" || die "trial restore FAILED (exit $RC, full log $VLOG)"
  ok "trial restore passed; $VDB dropped (log $VLOG)"
  echo "verified  : trial restore OK $(date -u '+%Y-%m-%d %H:%M:%S UTC')" >>"$MANIFEST"
fi
