#!/usr/bin/env python3
"""Test 04 — Historian BFF /trend endpoint (IoTDB decimated query)."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import requests

import config as cfg
from common import bff_get, fail, ok, print_banner


def run(run_id: str) -> list:
    print_banner(f"Test 04 — Historian BFF /trend  run={run_id}")
    results = []

    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=1)
    params = {
        "series": "root.ams.site1.alarms.*",
        "start": start.isoformat(),
        "end": end.isoformat(),
        "width": 200,
    }

    for label, base in [("BFF direct", cfg.BFF_BASE), ("BFF via nginx", cfg.BFF_VIA_NGINX)]:
        url = f"{base.rstrip('/')}/trend"
        try:
            resp = requests.get(url, params=params, timeout=30)
            if resp.status_code != 200:
                results.append(fail(f"{label} /trend", f"HTTP {resp.status_code}: {resp.text[:200]}"))
                continue
            body = resp.json()
            points = body.get("points") or []
            if points:
                results.append(ok(f"{label} /trend", f"{len(points)} decimated point(s)"))
            else:
                results.append(fail(f"{label} /trend", "empty points — IoTDB may not have data in window"))
        except Exception as exc:
            results.append(fail(f"{label} /trend", str(exc)))

    # Health JSON shape
    try:
        resp = requests.get(f"{cfg.BFF_BASE.rstrip('/')}/health", timeout=15)
        body = resp.json()
        if body.get("status") and body.get("iotdb"):
            results.append(ok("BFF health JSON", f"status={body['status']} iotdb={body['iotdb']}"))
        else:
            results.append(fail("BFF health JSON", str(body)[:200]))
    except Exception as exc:
        results.append(fail("BFF health JSON", str(exc)))

    return results


if __name__ == "__main__":
    import argparse
    from common import exit_code

    p = argparse.ArgumentParser()
    p.add_argument("--run-id", required=True)
    raise SystemExit(exit_code(run(p.parse_args().run_id)))
