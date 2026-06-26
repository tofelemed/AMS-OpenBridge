#!/usr/bin/env python3
"""Test 08 — Prometheus observability scrape targets."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import requests

import config as cfg
from common import fail, log, ok, print_banner


def run() -> list:
    print_banner("Test 08 — Prometheus Observability")
    results = []

    try:
        resp = requests.get(f"{cfg.PROMETHEUS}/api/v1/targets", timeout=15)
        resp.raise_for_status()
        targets = resp.json().get("data", {}).get("activeTargets", [])
        up = [t for t in targets if t.get("health") == "up"]
        down = [t for t in targets if t.get("health") != "up"]
        results.append(ok("Prometheus targets", f"{len(up)} up, {len(down)} down"))

        expected_jobs = {"prometheus", "ams-api", "historian-bff", "flink-jobmanager"}
        found_jobs = {t.get("labels", {}).get("job", "") for t in up}
        missing = expected_jobs - found_jobs
        if missing:
            results.append(fail("Expected scrape jobs", f"missing UP: {', '.join(sorted(missing))}"))
        else:
            results.append(ok("Expected scrape jobs", "core jobs reporting UP"))

        for t in down[:3]:
            job = t.get("labels", {}).get("job", "?")
            err = t.get("lastError", "")[:80]
            log_detail = f"{job}: {err}" if err else job
            results.append(fail(f"Target down: {job}", log_detail))

    except Exception as exc:
        results.append(fail("Prometheus API", str(exc)))

    return results


if __name__ == "__main__":
    from common import exit_code, log

    raise SystemExit(exit_code(run()))
