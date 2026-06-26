#!/usr/bin/env python3
"""Test 07 — PostgreSQL + AMS API active alarms (Flink → Postgres path)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import config as cfg
from common import api_get, fail, log, ok, print_banner, wait_until


def load_manifest(run_id: str) -> list[dict]:
    path = Path(__file__).resolve().parent / f"manifest_{run_id}.json"
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8")).get("alarms", [])


def run(run_id: str) -> list:
    print_banner(f"Test 07 — API / PostgreSQL  run={run_id}")
    results = []
    alarms = load_manifest(run_id)
    sources = [a["sourceName"] for a in alarms]

    # Pipeline health
    try:
        resp = api_get("/api/v1/health/pipeline")
        if resp.status_code == 200:
            body = resp.json()
            score = body.get("readiness", {}).get("score", "?")
            results.append(ok("Pipeline health", f"readiness score={score}"))
        else:
            results.append(fail("Pipeline health", f"HTTP {resp.status_code}"))
    except Exception as exc:
        results.append(fail("Pipeline health", str(exc)))

    def api_has_e2e_alarm() -> bool:
        try:
            resp = api_get("/api/v1/alarms/active?pageSize=500")
            if resp.status_code != 200:
                return False
            items = resp.json().get("items") or []
            for item in items:
                src = item.get("sourceName") or ""
                if cfg.TEST_PREFIX in src or any(s in src for s in sources):
                    return True
            return False
        except Exception as exc:
            log(f"  API poll: {exc}")
            return False

    if alarms and wait_until("E2E alarm in API", api_has_e2e_alarm, cfg.WAIT_API_SEC):
        results.append(ok("API active alarms", f"found {cfg.TEST_PREFIX} alarm(s)"))
    elif alarms:
        results.append(
            fail(
                "API active alarms",
                f"no {cfg.TEST_PREFIX} alarm after {cfg.WAIT_API_SEC}s — check OpcEventStreamJob + NormalizedAlarmConsumer",
            )
        )
    else:
        results.append(fail("Manifest", "missing"))

    # Direct PostgreSQL check (optional)
    try:
        import psycopg2

        conn = psycopg2.connect(
            host=cfg.PG_HOST,
            port=cfg.PG_PORT,
            dbname=cfg.PG_DB,
            user=cfg.PG_USER,
            password=cfg.PG_PASS,
            connect_timeout=10,
        )
        cur = conn.cursor()
        cur.execute(
            """
            SELECT COUNT(*) FROM alarms.alarm_current
            WHERE source_name LIKE %s
            """,
            (f"{cfg.TEST_PREFIX}%",),
        )
        count = cur.fetchone()[0]
        cur.close()
        conn.close()
        if count > 0:
            results.append(ok("PostgreSQL alarm_current", f"{count} row(s) matching {cfg.TEST_PREFIX}%"))
        else:
            results.append(fail("PostgreSQL alarm_current", f"0 rows matching {cfg.TEST_PREFIX}%"))
    except ImportError:
        log("  SKIP  PostgreSQL — psycopg2 not installed")
    except Exception as exc:
        results.append(fail("PostgreSQL alarm_current", str(exc)))

    return results


if __name__ == "__main__":
    import argparse
    from common import exit_code

    p = argparse.ArgumentParser()
    p.add_argument("--run-id", required=True)
    raise SystemExit(exit_code(run(p.parse_args().run_id)))
