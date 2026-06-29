#!/usr/bin/env python3
"""Test 04 — Historian BFF /trend endpoint (IoTDB decimated query).

Root cause of previous failure: IoTDB GROUP BY does not support wildcard series
(root.ams.site1.alarms.*). We now query a concrete device path loaded from the
run manifest, with a fallback to /series discovery.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import requests

import config as cfg
from common import bff_get, fail, log, ok, print_banner


def load_manifest(run_id: str) -> list[dict]:
    path = Path(__file__).resolve().parent / f"manifest_{run_id}.json"
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8")).get("alarms", [])


def discover_series(bff_base: str) -> str | None:
    """Ask BFF /series for the first available alarm series path."""
    try:
        resp = requests.get(f"{bff_base.rstrip('/')}/series", timeout=15)
        if resp.status_code != 200:
            return None
        body = resp.json()
        # IoTDB SHOW TIMESERIES returns {"values": [["root.ams.site1.alarms.X", ...], ...]}
        values = body.get("values") or []
        for row in values:
            if row and str(row[0]).startswith("root.ams.site1.alarms."):
                return str(row[0])
    except Exception as exc:
        log(f"  /series discovery error: {exc}")
    return None


def run(run_id: str) -> list:
    print_banner(f"Test 04 — Historian BFF /trend  run={run_id}")
    results = []

    alarms = load_manifest(run_id)
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=2)

    # Prefer concrete series from the manifest; fall back to /series discovery.
    series_candidates: list[str] = []
    if alarms:
        series_candidates = [a["iotdbPath"] for a in alarms if a.get("iotdbPath")]

    if not series_candidates:
        discovered = discover_series(cfg.BFF_BASE)
        if discovered:
            log(f"  /series discovery found: {discovered}")
            series_candidates = [discovered]
        else:
            results.append(
                fail(
                    "BFF /trend series",
                    "no manifest and /series returned nothing — IoTDB may be empty",
                )
            )
            return results

    # Use the first known concrete path for the trend query.
    series = series_candidates[0]
    log(f"  Querying series: {series}")

    base_params = {
        "series": series,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "width": 200,
    }

    for label, base in [("BFF direct", cfg.BFF_BASE), ("BFF via nginx", cfg.BFF_VIA_NGINX)]:
        url = f"{base.rstrip('/')}/trend"
        try:
            resp = requests.get(url, params=base_params, timeout=30)
            if resp.status_code != 200:
                results.append(fail(f"{label} /trend", f"HTTP {resp.status_code}: {resp.text[:300]}"))
                continue
            body = resp.json()
            points = body.get("points") or []
            if points:
                results.append(ok(f"{label} /trend", f"{len(points)} decimated point(s) for {series}"))
            else:
                # Empty but HTTP 200 — likely no data in the time window yet
                results.append(
                    fail(
                        f"{label} /trend",
                        f"HTTP 200 but 0 points for {series} — "
                        "IoTDB has the series but no data in window, or GROUP BY interval too coarse",
                    )
                )
        except Exception as exc:
            results.append(fail(f"{label} /trend", str(exc)))

    # Also test with manifest's second series (if present) to improve coverage
    if len(series_candidates) > 1:
        series2 = series_candidates[1]
        try:
            params2 = {**base_params, "series": series2}
            resp = requests.get(f"{cfg.BFF_BASE.rstrip('/')}/trend", params=params2, timeout=30)
            if resp.status_code == 200:
                pts = (resp.json().get("points") or [])
                results.append(
                    ok("BFF /trend (2nd series)", f"{len(pts)} point(s) for {series2}")
                    if pts else
                    fail("BFF /trend (2nd series)", f"0 points for {series2}")
                )
        except Exception as exc:
            results.append(fail("BFF /trend (2nd series)", str(exc)))

    # BFF /series listing
    try:
        resp = requests.get(f"{cfg.BFF_BASE.rstrip('/')}/series", timeout=15)
        if resp.status_code == 200:
            body = resp.json()
            values = body.get("values") or []
            e2e_series = [
                str(row[0])
                for row in values
                if row and cfg.TEST_PREFIX.replace("-", "_") in str(row[0])
            ]
            results.append(
                ok("BFF /series", f"{len(e2e_series)} E2E series visible: {e2e_series[:3]}")
                if e2e_series else
                fail("BFF /series", f"no {cfg.TEST_PREFIX} series found — {len(values)} total")
            )
        else:
            results.append(fail("BFF /series", f"HTTP {resp.status_code}"))
    except Exception as exc:
        results.append(fail("BFF /series", str(exc)))

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
