#!/usr/bin/env bash
# Standing Flink job supervisor (CPLM Phase 2.5, pattern from CPA).
#
# The one-shot flink-submit-* containers are restart:"no": after a JobManager
# restart or a Docker daemon bounce (twice on 2026-08-05 alone) every job is
# gone and nothing brings them back — there is no JM HA. This container loops
# forever, re-submitting any of the TEN standing jobs that is not RUNNING.
#
# Keep this list in step with scripts/ensure_flink_jobs.py CORE_JOBS — the two
# drifted once already (AnalysisExecutionJob existed only in the Python script,
# which stack startup never invokes, so it silently stayed dead — STR-07).
#
# Job identity is the exact display name; every job hardcodes its own name, so
# the grep is stable. FAILED/FINISHED jobs do not block resubmission (the guard
# requires the "(RUNNING)" state, not just the name).
set -euo pipefail

JM_HOST="${FLINK_JOBMANAGER_HOST:-ams-flink-jobmanager}"
JM_PORT="${FLINK_JOBMANAGER_PORT:-8081}"
JAR="${FLINK_JAR_PATH:-/opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar}"
KAFKA_BROKERS="${KAFKA_BROKERS:-kafka:9092}"
INTERVAL="${SUPERVISOR_INTERVAL_SEC:-60}"
RAW_ALARMS_OFFSETS="${RAW_ALARMS_STARTING_OFFSETS:-earliest}"
IOTDB_HOST="${IOTDB_HOST:-iotdb}"
IOTDB_PORT="${IOTDB_PORT:-6667}"

# Explicit input topic: the compiled CPLM default (clpm.normalized.samples.v1)
# is a dead topic — never rely on it.
CPLM_ARGS=(
  --bootstrap.servers "${KAFKA_BROKERS}"
  --input-topic loop.samples.v1
  --short-feature-topic clpm.feature.short.v1
  --long-feature-topic clpm.feature.long.v1
  --output-topic clpm.gate.results.v1
  --consumer-group-id flink-ams-cplm
)

wait_jm() {
  for _ in $(seq 1 60); do
    if curl -sf "http://${JM_HOST}:${JM_PORT}/overview" >/dev/null 2>&1; then return 0; fi
    sleep 5
  done
  echo "[supervisor] JobManager not reachable at ${JM_HOST}:${JM_PORT}" >&2
  return 1
}

# Count PRESENT jobs whose display name matches. Returns the count so callers
# can tell "missing" (0) from "healthy" (1) from "DUPLICATE" (>1).
#
# Prod item 3 (2026-08-17): a job mid-recovery is PRESENT, not missing. The old
# "(RUNNING)"-only grep raced against restart cycles — a job caught in
# RESTARTING/INITIALIZING at poll time got a second copy submitted on top
# (observed live 2026-08-13: duplicate "AMS - Live State RBE" double-consuming
# every partition). With JM HA, jobs also pass through recovery states after a
# JobManager restart and must not be resubmitted while recovering.
job_running_count() {
  /opt/flink/bin/flink list -m "${JM_HOST}:${JM_PORT}" 2>/dev/null \
    | grep -F "$1" | grep -cE '\((CREATED|INITIALIZING|RUNNING|RESTARTING|RECONCILING)\)'
}

job_running() {
  [ "$(job_running_count "$1")" -ge 1 ]
}

submit_if_missing() {
  local name="$1"; local class="$2"; shift 2
  local running
  running="$(job_running_count "$name")"
  # A second copy of a standing job is worse than none: Flink's KafkaSource does
  # not use consumer-group coordination, so BOTH copies assign themselves every
  # partition, double-process every record, and clobber each other's committed
  # offsets. The old check was a plain "is it running" grep, which cannot see a
  # duplicate. Never submit on top of an existing one, and say so loudly.
  if [ "$running" -gt 1 ]; then
    echo "[supervisor] WARNING: $running copies of '$name' are RUNNING. Duplicate jobs" >&2
    echo "[supervisor]          share a consumer group and will clobber offsets." >&2
    echo "[supervisor]          Cancel all but one: flink cancel <jobid>" >&2
    return 0
  fi
  if [ "$running" -ge 1 ]; then return 0; fi
  if [ ! -f "$JAR" ]; then
    echo "[supervisor] JAR missing at ${JAR}; cannot submit '$name'" >&2
    return 1
  fi
  echo "[supervisor] submitting '$name' (${class})"
  /opt/flink/bin/flink run -d -m "${JM_HOST}:${JM_PORT}" -c "$class" "$JAR" "$@" || true
  sleep 8
}

ensure_all() {
  wait_jm || return 1
  submit_if_missing "AMS - Alarm State Machine" com.ams.flink.OpcEventStreamJob \
    --bootstrap.servers "${KAFKA_BROKERS}" \
    --raw-alarms.starting-offsets "${RAW_ALARMS_OFFSETS}" \
    --parallelism.raw-ingest 2 --parallelism.validation 2 --parallelism.dedup 2 \
    --parallelism.normalization 2 --parallelism.soe 2 --parallelism.lifecycle 2 \
    --parallelism.correlation 2 --parallelism.flood 1 --parallelism.kpi 1 \
    --parallelism.projection 2 --parallelism.ack 2
  submit_if_missing "AMS - IoTDB Alarm Persistence" com.ams.flink.IoTDBPersistenceJob \
    --bootstrap.servers "${KAFKA_BROKERS}" \
    --iotdb.host "${IOTDB_HOST}" --iotdb.port "${IOTDB_PORT}"
  submit_if_missing "AMS - Live State RBE" com.ams.flink.LiveStateJob \
    --bootstrap.servers "${KAFKA_BROKERS}"
  submit_if_missing "AMS - CPLM Short Feature Engine" com.ams.flink.cplm.CplmShortFeatureStreamJob \
    "${CPLM_ARGS[@]}" --job-name "AMS - CPLM Short Feature Engine"
  submit_if_missing "AMS - CPLM Long Diagnostics Engine" com.ams.flink.cplm.CplmLongDiagnosticsStreamJob \
    "${CPLM_ARGS[@]}" --job-name "AMS - CPLM Long Diagnostics Engine" --window-hours 24
  submit_if_missing "AMS - CPLM Gate Fusion Engine" com.ams.flink.cplm.CplmGateFusionStreamJob \
    "${CPLM_ARGS[@]}" --job-name "AMS - CPLM Gate Fusion Engine"
  # Phase 6.1 — live loop metrics (report-by-exception) for HMI badges.
  # --live-topic is MANDATORY: the compiled default is live.metrics, which
  # LiveStateJob already produces to with an incompatible alarm-shaped payload.
  # Decision C-A put loop metrics on their own topic rather than adding a third
  # schema to a topic that already carries two.
  submit_if_missing "AMS - Loop Live RBE Engine" com.ams.flink.cplm.LoopLiveRbeJob \
    --bootstrap.servers "${KAFKA_BROKERS}" \
    --input-topic loop.samples.v1 \
    --live-topic "${CPLM_LIVE_TOPIC:-live.loop.metrics}" \
    --consumer-group-id flink-ams-cplm \
    --deadband "${CPLM_LIVE_DEADBAND:-0.05}"
  # STR-07 — this job used to live only in scripts/ensure_flink_jobs.py, which the
  # stack never calls (only the validation/e2e scripts do). After any JobManager
  # restart it stayed dead, analysis.executions piled up unconsumed and every
  # analysis sat "pending" until a human ran the validation script by hand.
  submit_if_missing "AMS - Analysis Execution Engine" com.ams.flink.AnalysisExecutionJob \
    --bootstrap.servers "${KAFKA_BROKERS}"
  # STR-08 — both of these had a LIVE input topic and a LIVE .NET consumer in ams-api,
  # but no submission mechanism at all: KpiConsumerService and AlarmStateDeltaConsumerService
  # sat idle forever waiting on topics nothing produced to.
  submit_if_missing "AMS - Alarm KPI Engine" com.ams.flink.AlarmKpiStreamJob \
    --bootstrap.servers "${KAFKA_BROKERS}"
  submit_if_missing "AMS Alarm State Export Engine" com.ams.flink.AlarmStateExportJob \
    --bootstrap.servers "${KAFKA_BROKERS}"
}

echo "[supervisor] starting; interval=${INTERVAL}s jar=${JAR}"
while true; do
  ensure_all || echo "[supervisor] ensure pass failed; retrying in ${INTERVAL}s"
  sleep "${INTERVAL}"
done
