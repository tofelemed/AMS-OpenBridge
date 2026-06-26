#!/usr/bin/env python3
"""
Edge Platform — Full End-to-End Test Orchestrator

Workflow:
  1. Health check all services
  2. Feed synthetic alarms → Kafka raw-alarms
  3. Verify IoTDB persistence (Flink IoTDBPersistenceJob)
  4. Verify Historian BFF /trend + /snapshot
  5. Verify MQTT Sparkplug B (live.alarms → edge node → EMQX)
  6. Verify API + PostgreSQL (OpcEventStreamJob → current-alarm-state → API)
  7. Verify Prometheus targets

Usage:
  python run_all.py
  python run_all.py --skip-feed --run-id abc12345
  python run_all.py --also-current-state
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from common import StepResult, exit_code, log, print_banner


def load_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    parser = argparse.ArgumentParser(description="Run full edge E2E test suite")
    parser.add_argument("--run-id", default=uuid.uuid4().hex[:8])
    parser.add_argument("--skip-feed", action="store_true", help="Skip Kafka feed (reuse existing manifest)")
    parser.add_argument("--count", type=int, default=3, help="Alarms to inject")
    parser.add_argument(
        "--also-current-state",
        action="store_true",
        help="Also publish to current-alarm-state (accelerates MQTT path)",
    )
    parser.add_argument("--skip-prometheus", action="store_true")
    args = parser.parse_args()

    print_banner(f"AMS Edge Platform — E2E Test Suite  run={args.run_id}")
    all_results: list[StepResult] = []

    # ── 01 Health ──
    t01 = load_module("t01", "test_01_health.py")
    all_results.extend(t01.run())

    health_ok = all(r.passed for r in all_results)
    if not health_ok:
        log("Aborting - infrastructure health checks failed")
        return exit_code(all_results)

    # ── Ensure Flink jobs ──
    ensure = load_module("ensure", "ensure_flink_jobs.py")
    flink_results = ensure.run()
    all_results.extend(flink_results)
    if not all(r.passed for r in flink_results):
        log("Aborting - required Flink jobs not running")
        return exit_code(all_results)

    # ── Feed ──
    if not args.skip_feed:
        feed = load_module("feed", "feed_test_data.py")
        import subprocess

        cmd = [
            sys.executable,
            str(ROOT / "feed_test_data.py"),
            "--run-id",
            args.run_id,
            "--count",
            str(args.count),
        ]
        if args.also_current_state:
            cmd.append("--also-current-state")
        log(f"Running: {' '.join(cmd)}")
        rc = subprocess.call(cmd)
        if rc != 0:
            all_results.append(StepResult("Feed test data", False, f"exit code {rc}"))
            return exit_code(all_results)
        all_results.append(StepResult("Feed test data", True, f"{args.count} alarm(s)"))
    else:
        log(f"Skipping feed — using manifest_{args.run_id}.json")

    # ── 02 Kafka ──
    t02 = load_module("t02", "test_02_kafka.py")
    all_results.extend(t02.run(args.run_id))

    # ── 03 IoTDB ──
    t03 = load_module("t03", "test_03_iotdb.py")
    all_results.extend(t03.run(args.run_id))

    # ── 04 BFF trend ──
    t04 = load_module("t04", "test_04_bff_trend.py")
    all_results.extend(t04.run(args.run_id))

    # ── 05 BFF snapshot ──
    t05 = load_module("t05", "test_05_bff_snapshot.py")
    all_results.extend(t05.run(args.run_id))

    # ── 06 MQTT ──
    t06 = load_module("t06", "test_06_mqtt.py")
    all_results.extend(t06.run(args.run_id))

    # ── 07 API / Postgres ──
    t07 = load_module("t07", "test_07_api_postgres.py")
    all_results.extend(t07.run(args.run_id))

    # ── 08 Prometheus ──
    if not args.skip_prometheus:
        t08 = load_module("t08", "test_08_prometheus.py")
        all_results.extend(t08.run())

    # ── Summary ──
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
