#!/usr/bin/env python3
"""
Edge Platform — Full End-to-End Test Orchestrator

Workflow:
  1. Health check all services
  2. Feed synthetic alarms → Kafka raw-alarms (and current-alarm-state by default)
  3. Verify IoTDB persistence (Flink IoTDBPersistenceJob)
  4. Verify Historian BFF /trend, /raw, /snapshot
  5. Verify MQTT Sparkplug B (live.alarms → edge node → EMQX)
  6. Verify API + PostgreSQL (OpcEventStreamJob → current-alarm-state → API)
  7. Verify Prometheus targets

Usage:
  python run_all.py
  python run_all.py --skip-feed --run-id abc12345
  python run_all.py --no-current-state   # raw-alarms only (skips Postgres path acceleration)
  python run_all.py --skip-prometheus
  python run_all.py --skip-health        # skip abort-on-health-failure (useful while stack is partly up)
"""
from __future__ import annotations

import argparse
import importlib.util
import subprocess
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from common import StepResult, exit_code, log, print_banner

# Steps that must pass before tests run (absence → abort)
_CRITICAL_HEALTH_STEPS = {
    "Kafka topics",
    "AMS API",
    "BFF direct /health",
    "IoTDB",
}


def load_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    parser = argparse.ArgumentParser(description="Run full edge E2E test suite")
    parser.add_argument("--run-id", default=uuid.uuid4().hex[:8])
    parser.add_argument("--skip-feed", action="store_true",
                        help="Skip Kafka feed (reuse existing manifest)")
    parser.add_argument("--count", type=int, default=3,
                        help="Alarms to inject (default: 3)")
    parser.add_argument(
        "--no-current-state",
        action="store_true",
        help="Do NOT also publish to current-alarm-state. "
             "By default both raw-alarms AND current-alarm-state are fed so "
             "the Postgres/API path is exercised without waiting for Flink "
             "OpcEventStreamJob to process the E2E server ID.",
    )
    parser.add_argument("--skip-prometheus", action="store_true")
    parser.add_argument(
        "--skip-health-abort",
        action="store_true",
        help="Continue even when non-critical health checks fail (useful while "
             "stack is partly up).",
    )
    args = parser.parse_args()

    # --also-current-state is now the DEFAULT; --no-current-state opts out.
    also_current_state = not args.no_current_state

    print_banner(f"AMS Edge Platform — E2E Test Suite  run={args.run_id}")
    all_results: list[StepResult] = []

    # ── 01 Health ──────────────────────────────────────────────────────────
    t01 = load_module("t01", "test_01_health.py")
    health_results: list[StepResult] = t01.run()
    all_results.extend(health_results)

    # Only abort if a *critical* service is down (allow MQTT/Prometheus to fail)
    if not args.skip_health_abort:
        critical_failures = [
            r for r in health_results
            if not r.passed and r.name in _CRITICAL_HEALTH_STEPS
        ]
        if critical_failures:
            log(
                "Aborting — critical health checks failed: "
                + ", ".join(r.name for r in critical_failures)
            )
            return exit_code(all_results)

    # ── Ensure Flink jobs ──────────────────────────────────────────────────
    ensure = load_module("ensure", "ensure_flink_jobs.py")
    flink_results = ensure.run()
    all_results.extend(flink_results)
    if not all(r.passed for r in flink_results):
        log("Aborting — required Flink jobs not running")
        return exit_code(all_results)

    # ── Feed ───────────────────────────────────────────────────────────────
    if not args.skip_feed:
        cmd = [
            sys.executable,
            str(ROOT / "feed_test_data.py"),
            "--run-id", args.run_id,
            "--count", str(args.count),
        ]
        if also_current_state:
            cmd.append("--also-current-state")
        log(f"Running: {' '.join(cmd)}")
        rc = subprocess.call(cmd)
        if rc != 0:
            all_results.append(StepResult("Feed test data", False, f"exit code {rc}"))
            return exit_code(all_results)
        mode = "+current-alarm-state" if also_current_state else "raw-alarms only"
        all_results.append(StepResult("Feed test data", True, f"{args.count} alarm(s) ({mode})"))
    else:
        log(f"Skipping feed — using manifest_{args.run_id}.json")

    # ── 02 Kafka ───────────────────────────────────────────────────────────
    t02 = load_module("t02", "test_02_kafka.py")
    all_results.extend(t02.run(args.run_id))

    # ── 03 IoTDB ───────────────────────────────────────────────────────────
    t03 = load_module("t03", "test_03_iotdb.py")
    all_results.extend(t03.run(args.run_id))

    # ── 04 BFF /trend ──────────────────────────────────────────────────────
    t04 = load_module("t04", "test_04_bff_trend.py")
    all_results.extend(t04.run(args.run_id))

    # ── 05 BFF /snapshot ───────────────────────────────────────────────────
    t05 = load_module("t05", "test_05_bff_snapshot.py")
    all_results.extend(t05.run(args.run_id))

    # ── 06 MQTT ────────────────────────────────────────────────────────────
    t06 = load_module("t06", "test_06_mqtt.py")
    all_results.extend(t06.run(args.run_id))

    # ── 07 API / Postgres ──────────────────────────────────────────────────
    t07 = load_module("t07", "test_07_api_postgres.py")
    all_results.extend(t07.run(args.run_id))

    # ── 08 Prometheus ──────────────────────────────────────────────────────
    if not args.skip_prometheus:
        t08 = load_module("t08", "test_08_prometheus.py")
        all_results.extend(t08.run())

    # ── 09 BFF /raw ────────────────────────────────────────────────────────
    t09 = load_module("t09", "test_09_bff_raw.py")
    all_results.extend(t09.run(args.run_id))

    # ── Summary ────────────────────────────────────────────────────────────
    print_banner("E2E Summary")
    passed = sum(1 for r in all_results if r.passed)
    failed = sum(1 for r in all_results if not r.passed)
    log(f"Total: {len(all_results)}  Passed: {passed}  Failed: {failed}")
    for r in all_results:
        mark = "PASS" if r.passed else "FAIL"
        print(f"  [{mark}] {r.name}: {r.detail}")

    return exit_code(all_results)


if __name__ == "__main__":
    raise SystemExit(main())
