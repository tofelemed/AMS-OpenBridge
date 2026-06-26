#!/usr/bin/env python3
"""Test 05 — Historian BFF /snapshot (Redis via Sparkplug edge node)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import requests

import config as cfg
from common import fail, log, ok, print_banner, wait_until


def load_manifest(run_id: str) -> list[dict]:
    path = Path(__file__).resolve().parent / f"manifest_{run_id}.json"
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8")).get("alarms", [])


def device_id(source_name: str) -> str:
    import re
    return re.sub(r"[^a-zA-Z0-9_\-]", "_", source_name)


def run(run_id: str) -> list:
    print_banner(f"Test 05 — Historian BFF /snapshot  run={run_id}")
    results = []
    alarms = load_manifest(run_id)
    if not alarms:
        results.append(fail("Manifest", "missing — run feed_test_data.py first"))
        return results

    assets = [device_id(a["sourceName"]) for a in alarms[:3]]
    assets_param = ",".join(assets)

    def snapshot_has_metrics() -> bool:
        try:
            url = f"{cfg.BFF_BASE.rstrip('/')}/snapshot"
            resp = requests.get(url, params={"assets": assets_param}, timeout=20)
            if resp.status_code != 200:
                return False
            body = resp.json()
            assets_obj = body.get("assets") or {}
            for asset in assets:
                metrics = assets_obj.get(asset) or {}
                if metrics:
                    return True
            # Any asset with data counts
            return bool(assets_obj)
        except Exception as exc:
            log(f"  snapshot poll: {exc}")
            return False

    if wait_until("Redis snapshot via BFF", snapshot_has_metrics, cfg.WAIT_MQTT_SEC):
        results.append(ok("BFF /snapshot", f"metrics for assets: {assets_param[:80]}"))
    else:
        results.append(
            fail(
                "BFF /snapshot",
                f"no snapshot after {cfg.WAIT_MQTT_SEC}s — check LiveStateJob + sparkplug-edge-node + EMQX",
            )
        )

    # nginx proxy
    try:
        url = f"{cfg.BFF_VIA_NGINX.rstrip('/')}/snapshot"
        resp = requests.get(url, params={"assets": assets[0]}, timeout=20)
        if resp.status_code == 200:
            results.append(ok("BFF /snapshot (nginx)", f"HTTP 200 for {assets[0]}"))
        else:
            results.append(fail("BFF /snapshot (nginx)", f"HTTP {resp.status_code}"))
    except Exception as exc:
        results.append(fail("BFF /snapshot (nginx)", str(exc)))

    return results


if __name__ == "__main__":
    import argparse
    from common import exit_code

    p = argparse.ArgumentParser()
    p.add_argument("--run-id", required=True)
    raise SystemExit(exit_code(run(p.parse_args().run_id)))
