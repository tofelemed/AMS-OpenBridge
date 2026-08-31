#!/usr/bin/env python3
"""
Ensure core AMS Flink streaming jobs exist and are RUNNING.

Queries the Flink REST API, then submits any missing jobs via
``docker exec`` on the JobManager container (avoids host shell/CRLF issues).

Required jobs (edge pipeline):
  - AMS - Alarm State Machine      (OpcEventStreamJob)
  - AMS - IoTDB Alarm Persistence  (IoTDBPersistenceJob)
  - AMS - Live State RBE           (LiveStateJob)

Usage:
  python scripts/ensure_flink_jobs.py
  python scripts/ensure_flink_jobs.py --list
  python scripts/ensure_flink_jobs.py --dry-run
  python scripts/ensure_flink_jobs.py --no-wait

Environment overrides:
  FLINK_UI              http://localhost:8082
  FLINK_JM_CONTAINER    ams-flink-jobmanager
  FLINK_JM_ADDRESS      ams-flink-jobmanager:8081
  FLINK_JAR_PATH        /opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar
  KAFKA_BROKERS         kafka:9092
  IOTDB_HOST            iotdb
  IOTDB_PORT            6667
  WAIT_FLINK_SEC        120
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: requests is required.  pip install requests", file=sys.stderr)
    raise SystemExit(1)


REPO_ROOT = Path(__file__).resolve().parents[1]


# ── Configuration ────────────────────────────────────────────────────────────

FLINK_UI = os.getenv("FLINK_UI", os.getenv("E2E_FLINK_UI", "http://localhost:8082"))
FLINK_JM_CONTAINER = os.getenv("FLINK_JM_CONTAINER", "ams-flink-jobmanager")
FLINK_JM_ADDRESS = os.getenv("FLINK_JM_ADDRESS", "ams-flink-jobmanager:8081")
FLINK_JAR = os.getenv(
    "FLINK_JAR_PATH",
    "/opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar",
)
FLINK_JAR_RUNTIME = os.getenv(
    "FLINK_JAR_RUNTIME",
    "/tmp/ams-flink-1.0-SNAPSHOT.jar",
)
HOST_JAR = Path(os.getenv(
    "FLINK_HOST_JAR",
    str(REPO_ROOT / "src" / "flink" / "target" / "ams-flink-1.0-SNAPSHOT.jar"),
))

# Set by sync_jar_to_container() — path passed to flink run
_active_jar: str = FLINK_JAR
KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "kafka:9092")
IOTDB_HOST = os.getenv("IOTDB_HOST", "iotdb")
IOTDB_PORT = os.getenv("IOTDB_PORT", "6667")
WAIT_FLINK_SEC = int(os.getenv("WAIT_FLINK_SEC", os.getenv("E2E_WAIT_FLINK_SEC", "120")))
POLL_SEC = float(os.getenv("FLINK_POLL_SEC", "3"))


@dataclass(frozen=True)
class FlinkJobSpec:
    name: str
    entry_class: str
    extra_args: tuple[str, ...]


CORE_JOBS: tuple[FlinkJobSpec, ...] = (
    FlinkJobSpec(
        name="AMS - Alarm State Machine",
        entry_class="com.ams.flink.OpcEventStreamJob",
        extra_args=(
            "--bootstrap.servers", KAFKA_BROKERS,
            # committed-with-earliest-fallback (prod item 4, 2026-08-17): keep in
            # step with the compose supervisor's RAW_ALARMS_STARTING_OFFSETS.
            "--raw-alarms.starting-offsets", "committed",
            "--parallelism.raw-ingest", "2",
            "--parallelism.validation", "2",
            "--parallelism.dedup", "2",
            "--parallelism.normalization", "2",
            "--parallelism.soe", "2",
            "--parallelism.lifecycle", "2",
            "--parallelism.correlation", "2",
            "--parallelism.flood", "1",
            "--parallelism.kpi", "1",
            "--parallelism.projection", "2",
            "--parallelism.ack", "2",
        ),
    ),
    FlinkJobSpec(
        name="AMS - IoTDB Alarm Persistence",
        entry_class="com.ams.flink.IoTDBPersistenceJob",
        extra_args=(
            "--bootstrap.servers", KAFKA_BROKERS,
            "--iotdb.host", IOTDB_HOST,
            "--iotdb.port", IOTDB_PORT,
        ),
    ),
    FlinkJobSpec(
        name="AMS - Live State RBE",
        entry_class="com.ams.flink.LiveStateJob",
        extra_args=(
            "--bootstrap.servers", KAFKA_BROKERS,
        ),
    ),
    # Phase 7 — evaluates calculation expressions (traverse.analysis.executions → traverse.analysis.results). Previously
    # analysis-service produced execution commands that no job consumed; this closes that loop.
    FlinkJobSpec(
        name="AMS - Analysis Execution Engine",
        entry_class="com.ams.flink.AnalysisExecutionJob",
        extra_args=(
            "--bootstrap.servers", KAFKA_BROKERS,
        ),
    ),
    # CPLM three-stage pipeline (traverse.cpa.loop.samples.v1 → traverse.cpa.clpm.gate.results.v1).
    # --input-topic MUST be passed explicitly: the compiled default is the dead
    # clpm.normalized.samples.v1. Do NOT add CplmGateStreamJob (legacy monolith —
    # would double-produce gate results) or CplmHistoricalReplayJob (on-demand
    # batch with a per-request name that defeats name-based reconciliation).
)
_CPLM_COMMON_ARGS: tuple[str, ...] = (
    "--bootstrap.servers", KAFKA_BROKERS,
    "--input-topic", "traverse.cpa.loop.samples.v1",
    "--short-feature-topic", "traverse.cpa.clpm.feature.short.v1",
    "--long-feature-topic", "traverse.cpa.clpm.feature.long.v1",
    "--output-topic", "traverse.cpa.clpm.gate.results.v1",
    "--consumer-group-id", "traverse-cpa-flink-cplm",
)
CORE_JOBS = CORE_JOBS + (
    FlinkJobSpec(
        name="AMS - CPLM Short Feature Engine",
        entry_class="com.ams.flink.cplm.CplmShortFeatureStreamJob",
        extra_args=_CPLM_COMMON_ARGS + ("--job-name", "AMS - CPLM Short Feature Engine"),
    ),
    FlinkJobSpec(
        name="AMS - CPLM Long Diagnostics Engine",
        entry_class="com.ams.flink.cplm.CplmLongDiagnosticsStreamJob",
        extra_args=_CPLM_COMMON_ARGS
        + ("--job-name", "AMS - CPLM Long Diagnostics Engine", "--window-hours", "24"),
    ),
    # Fusion last: both of its sources start at OffsetsInitializer.latest(), so the
    # feature topics should exist before it runs.
    FlinkJobSpec(
        name="AMS - CPLM Gate Fusion Engine",
        entry_class="com.ams.flink.cplm.CplmGateFusionStreamJob",
        extra_args=_CPLM_COMMON_ARGS + ("--job-name", "AMS - CPLM Gate Fusion Engine"),
    ),
    # Phase 6.1 - live loop metrics. --live-topic is passed explicitly, though the
    # compiled default now matches it; it used to be mandatory because the default
    # was traverse.live.metrics, which already carries LiveStateJob's alarm payload.
    FlinkJobSpec(
        name="AMS - Loop Live RBE Engine",
        entry_class="com.ams.flink.cplm.LoopLiveRbeJob",
        extra_args=(
            "--bootstrap.servers", KAFKA_BROKERS,
            "--input-topic", "traverse.cpa.loop.samples.v1",
            "--live-topic", "traverse.cpa.live.loop.metrics",
            "--consumer-group-id", "traverse-cpa-flink-cplm",
            "--deadband", "0.05",
        ),
    ),
    # STR-08 parity with flink-job-supervisor.sh (the two lists must not drift —
    # that is how AnalysisExecutionJob stayed dead once already, STR-07).
    FlinkJobSpec(
        name="AMS - Alarm KPI Engine",
        entry_class="com.ams.flink.AlarmKpiStreamJob",
        extra_args=("--bootstrap.servers", KAFKA_BROKERS),
    ),
    FlinkJobSpec(
        name="AMS Alarm State Export Engine",
        entry_class="com.ams.flink.AlarmStateExportJob",
        extra_args=("--bootstrap.servers", KAFKA_BROKERS),
    ),
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def log(msg: str) -> None:
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def flink_jobs_by_state() -> dict[str, set[str]]:
    """Return {state: {job_name, ...}} from Flink REST."""
    resp = requests.get(f"{FLINK_UI.rstrip('/')}/jobs/overview", timeout=15)
    resp.raise_for_status()
    by_state: dict[str, set[str]] = {}
    for job in resp.json().get("jobs", []):
        state = job.get("state", "UNKNOWN")
        name = job.get("name", "")
        by_state.setdefault(state, set()).add(name)
    return by_state


def running_job_names() -> set[str]:
    return flink_jobs_by_state().get("RUNNING", set())


def wait_for_jobmanager(timeout_sec: float = 60) -> None:
    deadline = time.time() + timeout_sec
    url = f"{FLINK_UI.rstrip('/')}/overview"
    while time.time() < deadline:
        try:
            r = requests.get(url, timeout=5)
            if r.status_code == 200:
                return
        except requests.RequestException:
            pass
        time.sleep(2)
    raise TimeoutError(f"Flink JobManager not reachable at {url} after {timeout_sec:.0f}s")


def docker_exec(args: list[str], *, timeout: int = 300) -> subprocess.CompletedProcess[str]:
    cmd = ["docker", "exec", FLINK_JM_CONTAINER, *args]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def jar_exists_in_container() -> bool:
    proc = docker_exec(["test", "-f", FLINK_JAR], timeout=15)
    return proc.returncode == 0


def container_jar_size() -> int | None:
    proc = docker_exec(["stat", "-c", "%s", FLINK_JAR], timeout=15)
    if proc.returncode != 0:
        return None
    try:
        return int((proc.stdout or "").strip())
    except ValueError:
        return None


def sync_jar_to_container(*, dry_run: bool = False) -> bool:
    """
    Ensure the JobManager has the latest host-built JAR.

    Bind-mounted JARs on Docker Desktop cannot be overwritten in place, so we
    copy to FLINK_JAR_RUNTIME (/tmp/...) when sizes differ.
    Returns True if the runtime JAR was refreshed from the host.
    """
    global _active_jar

    if not HOST_JAR.is_file():
        log(f"WARN  host JAR not found at {HOST_JAR} — using {_active_jar}")
        return False

    host_size = HOST_JAR.stat().st_size
    mounted_size = container_jar_size()
    runtime_size = None
    proc = docker_exec(["stat", "-c", "%s", FLINK_JAR_RUNTIME], timeout=15)
    if proc.returncode == 0:
        try:
            runtime_size = int((proc.stdout or "").strip())
        except ValueError:
            pass

    if mounted_size == host_size:
        _active_jar = FLINK_JAR
        return False

    if runtime_size == host_size:
        _active_jar = FLINK_JAR_RUNTIME
        log(f"Using previously synced JAR at {_active_jar}")
        return False

    log(
        f"JAR out of sync (host={host_size:,} B, mounted={mounted_size or 0:,} B) "
        f"— copying to {FLINK_JM_CONTAINER}:{FLINK_JAR_RUNTIME}"
    )
    if dry_run:
        _active_jar = FLINK_JAR_RUNTIME
        return True

    proc = subprocess.run(
        ["docker", "cp", str(HOST_JAR), f"{FLINK_JM_CONTAINER}:{FLINK_JAR_RUNTIME}"],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or f"exit {proc.returncode}").strip()
        raise RuntimeError(f"docker cp failed: {err}")

    proc = docker_exec(["stat", "-c", "%s", FLINK_JAR_RUNTIME], timeout=15)
    if proc.returncode != 0 or int((proc.stdout or "0").strip()) != host_size:
        raise RuntimeError("JAR copy completed but runtime size still mismatched")

    _active_jar = FLINK_JAR_RUNTIME
    log(f"JAR synced to {_active_jar}")
    return True


def submit_job(spec: FlinkJobSpec, *, dry_run: bool = False) -> None:
    jar = _active_jar
    cmd = [
        "/opt/flink/bin/flink", "run", "-d",
        "-m", FLINK_JM_ADDRESS,
        "-c", spec.entry_class,
        jar,
        *spec.extra_args,
    ]
    if dry_run:
        log(f"DRY-RUN  would submit: {spec.name}")
        log(f"         docker exec {FLINK_JM_CONTAINER} {' '.join(cmd)}")
        return

    log(f"Submitting {spec.name} ({spec.entry_class}) ...")
    proc = docker_exec(cmd, timeout=300)
    out = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode != 0:
        raise RuntimeError(
            f"flink run failed for {spec.name} (exit {proc.returncode}):\n{out.strip()[-1500:]}"
        )
    for line in out.splitlines():
        if line.strip():
            log(f"  {line.strip()}")


def wait_for_jobs(
    needed: set[str],
    timeout_sec: float,
    poll_sec: float = POLL_SEC,
) -> tuple[set[str], set[str]]:
    """Wait until all *needed* job names are RUNNING. Returns (running, still_missing)."""
    deadline = time.time() + timeout_sec
    log(f"Waiting up to {timeout_sec:.0f}s for: {', '.join(sorted(needed))}")
    while time.time() < deadline:
        running = running_job_names()
        missing = needed - running
        if not missing:
            return running, set()
        time.sleep(poll_sec)
    running = running_job_names()
    return running, needed - running


# ── CLI ──────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Submit core AMS Flink jobs if they are not already RUNNING.",
    )
    p.add_argument(
        "--list", action="store_true",
        help="List Flink jobs grouped by state and exit.",
    )
    p.add_argument(
        "--dry-run", action="store_true",
        help="Print submit commands without executing them.",
    )
    p.add_argument(
        "--no-wait", action="store_true",
        help="Submit missing jobs but do not wait for RUNNING state.",
    )
    p.add_argument(
        "--wait-sec", type=int, default=WAIT_FLINK_SEC,
        help=f"Seconds to wait for jobs to reach RUNNING (default {WAIT_FLINK_SEC}).",
    )
    p.add_argument(
        "--no-sync-jar", action="store_true",
        help="Do not copy host JAR into the JobManager container.",
    )
    p.add_argument(
        "--jobs", nargs="*",
        help="Submit only these job names (default: all core jobs).",
    )
    return p


def main() -> int:
    args = build_parser().parse_args()

    try:
        wait_for_jobmanager()
    except TimeoutError as exc:
        log(f"ERROR: {exc}")
        return 1

    if args.list:
        by_state = flink_jobs_by_state()
        if not by_state:
            log("No Flink jobs found.")
        for state in sorted(by_state):
            names = ", ".join(sorted(by_state[state])) or "(none)"
            log(f"{state}: {names}")
        return 0

    if not args.dry_run and not jar_exists_in_container() and not HOST_JAR.is_file():
        log(
            f"ERROR: JAR not found in container at {FLINK_JAR} "
            f"and no host JAR at {HOST_JAR}. Build: scripts/build-flink-jar.ps1"
        )
        return 1
    if not args.dry_run and not args.no_sync_jar:
        sync_jar_to_container(dry_run=args.dry_run)
    elif not args.dry_run and jar_exists_in_container():
        pass  # _active_jar stays FLINK_JAR

    running = running_job_names()
    specs = CORE_JOBS
    if args.jobs:
        wanted = set(args.jobs)
        specs = tuple(s for s in CORE_JOBS if s.name in wanted)
        unknown = wanted - {s.name for s in specs}
        if unknown:
            log(f"ERROR: unknown job name(s): {', '.join(sorted(unknown))}")
            return 1

    to_submit = [s for s in specs if s.name not in running]
    if not to_submit:
        log(f"All {len(specs)} required job(s) already RUNNING.")
        for s in specs:
            log(f"  OK  {s.name}")
        return 0

    log(f"RUNNING: {', '.join(sorted(running)) or '(none)'}")
    log(f"Missing: {', '.join(s.name for s in to_submit)}")

    submitted: list[FlinkJobSpec] = []
    for spec in to_submit:
        try:
            submit_job(spec, dry_run=args.dry_run)
            submitted.append(spec)
        except Exception as exc:
            log(f"ERROR submitting {spec.name}: {exc}")
            return 1

    if args.dry_run or args.no_wait:
        log("Done (no wait requested).")
        return 0

    missing_names = {s.name for s in submitted}
    _, still_missing = wait_for_jobs(missing_names, args.wait_sec)
    if still_missing:
        log(f"ERROR: still not RUNNING after {args.wait_sec}s: {', '.join(sorted(still_missing))}")
        log(f"Check Flink UI: {FLINK_UI}")
        return 1

    log(f"All {len(specs)} required job(s) are RUNNING.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
