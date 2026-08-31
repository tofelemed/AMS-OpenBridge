#!/usr/bin/env python3
"""Test 07 — PostgreSQL + AMS API active alarms (Flink → Postgres path).

Why E2E alarms may not appear in /api/v1/alarms/active
--------------------------------------------------------
OpcEventStreamJob reads traverse.alarm.raw-alarms and writes to current-alarm-state.
NormalizedAlarmConsumer (ams-api) consumes traverse.alarm.current-alarm-state and upserts
into alarms.alarm_current.  The API only returns alarms whose serverId
matches a registered server — so E2E synthetic alarms (serverId=e2e-server-001)
will not appear in /active unless that server is registered.

To bypass this, run feed_test_data.py with --also-current-state so the E2E
ALARM_STATE_UPSERT messages are injected directly into traverse.alarm.current-alarm-state,
matching exactly what NormalizedAlarmConsumer expects.

The PostgreSQL direct check uses column source_name (snake_case schema).
The API check uses JSON field sourceName (camelCase).
"""
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
    source_names = [a["sourceName"] for a in alarms]

    # ── Pipeline health ──────────────────────────────────────────────────────
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

    # ── API active alarms ────────────────────────────────────────────────────
    def api_has_e2e_alarm() -> bool:
        try:
            resp = api_get("/api/v1/alarms/active?pageSize=500")
            if resp.status_code != 200:
                return False
            items = resp.json().get("items") or []
            for item in items:
                # API returns camelCase sourceName
                src = item.get("sourceName") or item.get("source_name") or ""
                if cfg.TEST_PREFIX in src or any(s in src for s in source_names):
                    return True
            return False
        except Exception as exc:
            log(f"  API poll: {exc}")
            return False

    if alarms:
        found = wait_until("E2E alarm in API", api_has_e2e_alarm, cfg.WAIT_API_SEC)
        if found:
            results.append(ok("API active alarms", f"found {cfg.TEST_PREFIX} alarm(s)"))
        else:
            results.append(
                fail(
                    "API active alarms",
                    f"no {cfg.TEST_PREFIX} alarm after {cfg.WAIT_API_SEC}s. "
                    "Likely causes: (1) E2E serverId not registered — re-run with "
                    "--also-current-state to inject directly into traverse.alarm.current-alarm-state; "
                    "(2) OpcEventStreamJob not running; (3) NormalizedAlarmConsumer "
                    "consumer group 'ams-backend-2' offset behind.",
                )
            )
    else:
        results.append(fail("Manifest", "missing — run feed_test_data.py first"))

    # ── Direct PostgreSQL check ──────────────────────────────────────────────
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

        # Discover available columns first (schema may use source_name or sourceName)
        cur.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'alarms' AND table_name = 'alarm_current'
        """)
        col_names = {row[0] for row in cur.fetchall()}
        log(f"  alarm_current columns: {sorted(col_names)}")

        # Build WHERE clause against whichever column name exists
        # Schema may use 'source', 'source_name', or 'sourceName' depending on migration
        if "source_name" in col_names:
            src_col = "source_name"
        elif "source" in col_names:
            src_col = "source"
        elif "sourceName" in col_names:
            src_col = '"sourceName"'
        else:
            src_col = None

        if src_col:
            cur.execute(
                f"SELECT COUNT(*) FROM alarms.alarm_current WHERE {src_col} LIKE %s",
                (f"{cfg.TEST_PREFIX}%",),
            )
            count = cur.fetchone()[0]
            if count > 0:
                results.append(ok("PostgreSQL alarm_current", f"{count} row(s) matching {cfg.TEST_PREFIX}%"))
            else:
                results.append(
                    fail(
                        "PostgreSQL alarm_current",
                        f"0 rows matching {cfg.TEST_PREFIX}% in {src_col} — "
                        "check NormalizedAlarmConsumer and consumer group offset",
                    )
                )
        else:
            results.append(
                fail("PostgreSQL alarm_current", f"no source_name column found — columns: {sorted(col_names)}")
            )

        # Also check alarm_history
        if "source_name" in col_names or "sourceName" in col_names:
            cur.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'alarms' AND table_name = 'alarm_history'
            """)
            hist_cols = {row[0] for row in cur.fetchall()}
            hist_src = "source_name" if "source_name" in hist_cols else ('"sourceName"' if "sourceName" in hist_cols else None)
            if hist_src:
                cur.execute(
                    f"SELECT COUNT(*) FROM alarms.alarm_history WHERE {hist_src} LIKE %s",
                    (f"{cfg.TEST_PREFIX}%",),
                )
                hist_count = cur.fetchone()[0]
                results.append(
                    ok("PostgreSQL alarm_history", f"{hist_count} row(s) matching {cfg.TEST_PREFIX}%")
                    if hist_count > 0 else
                    fail("PostgreSQL alarm_history", f"0 rows matching {cfg.TEST_PREFIX}%")
                )

        cur.close()
        conn.close()
    except ImportError:
        log("  SKIP  PostgreSQL — psycopg2 not installed")
    except Exception as exc:
        results.append(fail("PostgreSQL connect", str(exc)))

    return results


if __name__ == "__main__":
    import argparse
    from common import exit_code

    p = argparse.ArgumentParser()
    p.add_argument("--run-id", required=True)
    raise SystemExit(exit_code(run(p.parse_args().run_id)))
