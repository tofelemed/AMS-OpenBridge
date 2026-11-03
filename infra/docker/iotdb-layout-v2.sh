#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# CHG-102 — IoTDB storage layout v2 (sourced by iotdb-init-ttl.sh when
# IOTDB_LAYOUT=v2). Idempotent: every object is checked before it is created.
#
#   ${LOOP_DB}           raw loop samples, one ALIGNED device per loop, template cpm_raw
#   ${KPI_DB}.<family>.<loop>   KPI + verdict history (gate_12h/24h, long_4h/12h/24h,
#                        m1 = 1-minute rollup of the raw tree), TTL KPI_TTL_DAYS (3 y)
#   ${KPIS_DB}.<family>.<loop>  short-window KPIs (short_1m … short_60m), TTL 90 d
#
# Why separate databases: on 1.3.2 TTL is per database, and a template set on the
# raw database would auto-activate (and auto-extend) on any KPI device below it.
# Templates are set per FAMILY subtree (a template on a database root blocks
# templates below it). Writers must only write the template's measurements —
# with auto-create on, an unknown measurement EXTENDS the template for all devices.
# Types: FLOAT for values (plant sources are 32-bit; lab rel. error 6e-8), avg()
# results DOUBLE (IoTDB returns DOUBLE for avg and refuses a FLOAT target), all
# text TEXT/DICTIONARY, every series compressor ZSTD.
# ─────────────────────────────────────────────────────────────────────────────

KPI_DB="${KPI_DB:-root.hdpe.kpi}"
KPIS_DB="${KPIS_DB:-root.hdpe.kpis}"
KPI_TTL_MS=$(( ${KPI_TTL_DAYS:-1095} * 24 * 3600 * 1000 ))
KPIS_TTL_MS=$(( ${KPIS_TTL_DAYS:-90} * 24 * 3600 * 1000 ))

F="FLOAT encoding=GORILLA compressor=ZSTD"
D="DOUBLE encoding=GORILLA compressor=ZSTD"
T="TEXT encoding=DICTIONARY compressor=ZSTD"

cols() {  # cols "<type spec>" name1 name2 … → "name1 <spec>, name2 <spec>, …"
  local spec="$1"; shift
  local out="" n
  for n in "$@"; do out="${out:+$out, }$n $spec"; done
  echo "$out"
}

# Measurement lists — the single source of truth for the writers
# (src/backend/AMS.Api RawLoopIotDbConsumer, src/services/cplm-api KpiHistoryWriter).
RAW_COLS="$(cols "$F" pv sp op vp), $(cols "$T" mode)"
GATE_COLS="$(cols "$F" sample_count mae rmse iae good_error_pct acf_period_s acf_regularity \
  effort_ratio triangularity horch_oddness phase_area_norm_per_cycle corner_score travel_per_day \
  reversals_per_hour harmonic_amplitude_ratio harmonic_energy_ratio confidence auto_pct \
  saturation_pct completeness), $(cols "$T" diagnosis severity selected_family g0 g1 g2 g2r g3 g4 \
  g5 g6 g7 g8 g9 g10 g11 g12 g13 g14 g15 bundle_hash engine)"
LONG_COLS="$(cols "$F" sample_count acf_period_s acf_regularity effort_ratio triangularity \
  horch_oddness corner_score travel_per_day reversals_per_hour harmonic_amplitude_ratio \
  harmonic_energy_ratio), $(cols "$T" evaluation_state g5 g6 g7 g8 g9 g10 g11 bundle_hash engine)"
SHORT_COLS="$(cols "$F" sample_count iae ise mae rmse good_error_pct effort_ratio travel_per_day \
  reversals_per_hour auto_pct completeness), $(cols "$T" sufficient_data evaluation_state g0 g1 g2 \
  g2r g3 g4 bundle_hash engine)"
M1_COLS="$(cols "$F" pv_min pv_max op_min op_max), $(cols "$D" pv_avg op_avg sp_avg vp_avg)"

cli() {
  echo "$1" | "${IOTDB_CLI}" -h "${IOTDB_HOST}" -p "${IOTDB_PORT}" \
      -u "${IOTDB_USER}" -pw "${IOTDB_PASS}" -disableISO8601 2>&1 || true
}

LAYOUT_FAILED=0
# The CLI echoes the statement (column names such as good_error_pct contain
# "error"), so only its "Msg:" line is judged. $3 = extra "already done" pattern.
step() {  # step "<description>" "<sql>" ["<ok-pattern>"]
  local msg; msg=$(cli "$2;" | grep -E "^Msg:" | head -1)
  if echo "$msg" | grep -q "executed successfully" || { [ -n "$3" ] && echo "$msg" | grep -qiE "$3"; }; then
    echo "[iotdb-layout-v2] ok: $1"
  else
    echo "[iotdb-layout-v2] FAILED: $1 — ${msg:-no reply}"
    LAYOUT_FAILED=1
  fi
}

ensure_db() {  # ensure_db <db> <ttl_ms>
  step "database $1" "CREATE DATABASE $1" "already (been )?(created|exist)"
  step "TTL $1 = $2 ms" "SET TTL TO $1 $2"
}

ensure_template() {  # ensure_template <name> "<columns>"
  if cli "SHOW DEVICE TEMPLATES;" | grep -qw "$1"; then
    echo "[iotdb-layout-v2] ok: template $1 exists"
  else
    step "create template $1" "CREATE DEVICE TEMPLATE $1 ALIGNED ($2)"
  fi
}

mount_template() {  # mount_template <name> <path>
  if cli "SHOW PATHS SET DEVICE TEMPLATE $1;" | grep -q "$2"; then
    echo "[iotdb-layout-v2] ok: $1 already set on $2"
  else
    step "set $1 on $2" "SET DEVICE TEMPLATE $1 TO $2"
  fi
}

echo "[iotdb-layout-v2] raw=${LOOP_DB} kpi=${KPI_DB} (${KPI_TTL_DAYS:-1095} d) kpis=${KPIS_DB} (${KPIS_TTL_DAYS:-90} d)"

ensure_template cpm_raw "$RAW_COLS"
ensure_template cpm_kpi_gate "$GATE_COLS"
ensure_template cpm_kpi_long "$LONG_COLS"
ensure_template cpm_kpi_short "$SHORT_COLS"
ensure_template cpm_raw_1m "$M1_COLS"

# Raw: the template sits on the database itself; it refuses (and we report) if the
# database already holds non-template series (a legacy tree — see CHG-101 runbook).
mount_template cpm_raw "${LOOP_DB}"

ensure_db "${KPI_DB}" "${KPI_TTL_MS}"
for fam in gate_12h gate_24h; do mount_template cpm_kpi_gate "${KPI_DB}.${fam}"; done
for fam in long_4h long_12h long_24h; do mount_template cpm_kpi_long "${KPI_DB}.${fam}"; done
mount_template cpm_raw_1m "${KPI_DB}.m1"

ensure_db "${KPIS_DB}" "${KPIS_TTL_MS}"
for fam in short_1m short_5m short_10m short_15m short_30m short_60m; do
  mount_template cpm_kpi_short "${KPIS_DB}.${fam}"
done

# 1-minute rollup of the raw tree into ${KPI_DB}.m1.<loop> (3-year trends and the
# compact evidence traces). ${N} = the loop level of "${LOOP_CPM_PREFIX}.*".
if [ "${ROLLUP_1M:-true}" = "true" ]; then
  LOOP_LEVEL=$(( $(echo "${LOOP_CPM_PREFIX}" | tr -cd '.' | wc -c) + 1 ))
  if cli "SHOW CONTINUOUS QUERIES;" | grep -q "cq_cpm_raw_1m"; then
    echo "[iotdb-layout-v2] ok: cq_cpm_raw_1m exists"
  else
    step "continuous query cq_cpm_raw_1m" "CREATE CONTINUOUS QUERY cq_cpm_raw_1m RESAMPLE EVERY 1m RANGE 5m BEGIN SELECT min_value(pv), max_value(pv), min_value(op), max_value(op), avg(pv), avg(op), avg(sp), avg(vp) INTO ${KPI_DB}.m1.\${${LOOP_LEVEL}}(pv_min, pv_max, op_min, op_max, pv_avg, op_avg, sp_avg, vp_avg) FROM ${LOOP_CPM_PREFIX}.* GROUP BY(1m) ALIGN BY DEVICE END"
  fi
fi

if [ "${LAYOUT_FAILED}" = "1" ]; then
  echo "[iotdb-layout-v2] ERROR: layout v2 incomplete — see FAILED lines above." >&2
  exit 1
fi
echo "[iotdb-layout-v2] layout v2 in place."
