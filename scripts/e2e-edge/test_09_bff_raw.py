#!/usr/bin/env python3
"""Test 09 — Historian BFF /raw endpoint (non-decimated IoTDB records).

Unlike /trend (GROUP BY decimation), /raw returns individual rows with a
WHERE time >= / < filter and a LIMIT cap (max 10 000).
We use the concrete series paths from the manifest so the query is not a
wildcard (which IoTDB does not support in time-range WHERE clauses).
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import requests

import config as cfg
from common import fail, log, ok, print_banner


def load_manifest(run_id: str) -> list[dict]:
    path = Path(__file__).resolve().parent / f"manifest_{run_id}.json"
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8")).get("alarms", [])


def run(run_id: str) -> list:
    print_banner(f"Test 09 — Historian BFF /raw  run={run_id}")
    results = []

    alarms = load_manifest(run_id)
    if not alarms:
        results.append(fail("Manifest", "missing — run feed_test_data.py first"))
        return results

    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=2)

    series_paths = [a["iotdbPath"] for a in alarms if a.get("iotdbPath")]
    if not series_paths:
        results.append(fail("Series paths", "manifest has no iotdbPath entries"))
        return results

    for series in series_paths[:2]:
        params = {
            "series": series,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "maxCount": 100,
        }
        url = f"{cfg.BFF_BASE.rstrip('/')}/raw"
        try:
            resp = requests.get(url, params=params, timeout=30)
            if resp.status_code != 200:
                results.append(fail(f"BFF /raw ({series})", f"HTTP {resp.status_code}: {resp.text[:300]}"))
                continue
            body = resp.json()
            count = body.get("count", 0)
            points = body.get("points") or []
            if count > 0 or points:
                results.append(ok(f"BFF /raw ({series})", f"{count} raw record(s)"))
            else:
                results.append(
                    fail(
                        f"BFF /raw ({series})",
                        "HTTP 200 but 0 records — IoTDB has the series but no data in window",
                    )
                )
        except Exception as exc:
            results.append(fail(f"BFF /raw ({series})", str(exc)))

    # Also test via nginx proxy (uses /api/hist/raw path)
    series0 = series_paths[0]
    try:
        url = f"{cfg.BFF_VIA_NGINX.rstrip('/')}/raw"
        params = {
            "series": series0,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "maxCount": 50,
        }
        resp = requests.get(url, params=params, timeout=30)
        if resp.status_code == 200:
            cnt = (resp.json().get("count") or 0)
            results.append(ok("BFF /raw (nginx)", f"HTTP 200, {cnt} record(s) for {series0}"))
        else:
            results.append(fail("BFF /raw (nginx)", f"HTTP {resp.status_code}"))
    except Exception as exc:
        results.append(fail("BFF /raw (nginx)", str(exc)))

    return results


if __name__ == "__main__":
    import argparse
    from common import exit_code

    p = argparse.ArgumentParser()
    p.add_argument("--run-id", required=True)
    raise SystemExit(exit_code(run(p.parse_args().run_id)))
