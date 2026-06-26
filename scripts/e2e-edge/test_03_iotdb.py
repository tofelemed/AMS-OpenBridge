#!/usr/bin/env python3
"""Test 03 — Flink → IoTDB write path."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import config as cfg
from common import fail, iotdb_alarm_path, iotdb_query, log, ok, print_banner, wait_until


def load_manifest(run_id: str) -> list[dict]:
    path = Path(__file__).resolve().parent / f"manifest_{run_id}.json"
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("alarms", [])


def run(run_id: str) -> list:
    print_banner(f"Test 03 — IoTDB Write Path  run={run_id}")
    results = []
    alarms = load_manifest(run_id)
    if not alarms:
        results.append(fail("Manifest", f"manifest_{run_id}.json not found — run feed_test_data.py first"))
        return results

    alarm_ids = [a["alarmId"] for a in alarms]
    safe_paths = [a.get("iotdbPath") or iotdb_alarm_path(a["alarmId"]) for a in alarms]

    def iotdb_has_data() -> bool:
        try:
            for path in safe_paths:
                sql = f"SELECT severity, state FROM {path} ORDER BY time DESC LIMIT 1"
                result = iotdb_query(sql)
                ts = result.get("timestamps") or []
                if ts:
                    return True
            # Fallback: wildcard count
            show = iotdb_query("SHOW TIMESERIES root.ams.site1.alarms.*")
            names = show.get("values", [[]])
            if names and names[0]:
                joined = " ".join(str(x) for row in names for x in row)
                return any(aid.replace("-", "_") in joined or aid in joined for aid in alarm_ids)
        except Exception as exc:
            log(f"  IoTDB poll error: {exc}")
        return False

    if wait_until("IoTDB alarm series", iotdb_has_data, cfg.WAIT_IOTDB_SEC):
        results.append(ok("IoTDB persistence", f"data found for run {run_id}"))
    else:
        results.append(
            fail(
                "IoTDB persistence",
                f"no data after {cfg.WAIT_IOTDB_SEC}s — check IoTDBPersistenceJob in Flink UI",
            )
        )

    # Sample query one series
    try:
        path = safe_paths[0]
        result = iotdb_query(f"SELECT severity, state, priority FROM {path} ORDER BY time DESC LIMIT 3")
        count = len(result.get("timestamps") or [])
        results.append(ok("IoTDB sample query", f"{count} point(s) on {path}"))
    except Exception as exc:
        results.append(fail("IoTDB sample query", str(exc)))

    return results


if __name__ == "__main__":
    import argparse
    from common import exit_code

    p = argparse.ArgumentParser()
    p.add_argument("--run-id", required=True)
    args = p.parse_args()
    raise SystemExit(exit_code(run(args.run_id)))
