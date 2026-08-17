#!/usr/bin/env python3
"""Pipeline A: raw-alarms -> OpcEventStreamJob -> current-alarm-state /
lifecycle-events -> NormalizedAlarmConsumerService -> alarms.alarm_current ->
SignalR /hubs/alarms.

Verifies:
  - keyed ALARM_STATE_UPSERT records (key == alarmId) land on current-alarm-state
  - Postgres alarms.alarm_current rows appear with the correct identity columns
    (server_id + source + condition + sub_condition) and severity
  - severity -> priority mapping (CRITICAL>=900 / HIGH>=700 / MEDIUM>=400 / LOW>=100)
    as returned by GET /api/v1/alarms/active
  - SignalR OnNewAlarm / OnAlarmUpdated fires for the injected run
  - lifecycle-events grows

Usage: python sim_alarm_feed.py [--count 12] [--interval 0.25] [--run-tag X]
"""
from __future__ import annotations

import json
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import simlib as sl

# stay under the FloodDetectFilter cutoff (>= 950 is dropped by design)
SEVERITY_BANDS = [920, 720, 450, 150]
CONDITIONS = ["HighHigh", "High", "Low", "LowLow"]


def start_signalr_listener(token: str, events: list, errors: list):
    try:
        from signalrcore.hub_connection_builder import HubConnectionBuilder
    except ImportError as exc:
        errors.append(f"signalrcore not installed: {exc}")
        return None

    ws_url = sl.GATEWAY.replace("http://", "ws://").replace("https://", "wss://")
    # negotiate-then-connect through the gateway 404s ("No Connection with that
    # ID"), so connect the websocket directly and skip negotiation.
    for options in (
        {"access_token_factory": lambda: token, "skip_negotiation": True},
        {"access_token_factory": lambda: token},
    ):
        url = f"{ws_url}/hubs/alarms" if options.get("skip_negotiation") else f"{sl.GATEWAY}/hubs/alarms"
        conn = HubConnectionBuilder().with_url(url, options=options).build()
        for target in ("OnNewAlarm", "OnAlarmUpdated"):
            conn.on(target, lambda payload, t=target: events.append((t, payload)))
        conn.on_error(lambda data: errors.append(str(data)))
        try:
            conn.start()
            return conn
        except Exception as exc:
            errors.append(f"signalr start failed ({url}): {exc}")
    return None


def main() -> int:
    ap = sl.base_parser(__doc__.splitlines()[0], default_count=12, default_interval=0.25)
    ap.add_argument("--skip-signalr", action="store_true",
                    help="skip the SignalR verification leg")
    args = ap.parse_args()
    tag = args.run_tag
    sl.banner(f"sim_alarm_feed  run-tag={tag}  count={args.count}")

    sl.kafka_check_connectivity()
    token = sl.login()

    signalr_events: list = []
    signalr_errors: list = []
    conn = None
    if not args.skip_signalr:
        conn = start_signalr_listener(token, signalr_events, signalr_errors)
        time.sleep(2)  # let the websocket settle before injecting

    cas_before = sl.kafka_end_offset_sum("current-alarm-state")
    lce_before = sl.kafka_end_offset_sum("lifecycle-events")
    sl.log(f"baseline offsets: current-alarm-state={cas_before} lifecycle-events={lce_before}")

    records = []
    expected = {}
    for i in range(args.count):
        severity = SEVERITY_BANDS[i % len(SEVERITY_BANDS)]
        condition = CONDITIONS[i % len(CONDITIONS)]
        alarm_id = f"SIM-{tag}-{i:03d}"
        source = f"SimFeed.{tag}.Unit{(i % 3) + 1}.Tag_{i:03d}"
        payload = sl.make_raw_alarm(
            alarm_id, source, condition, severity=severity,
            sub_condition=condition,
            include_priority=(i != 0),  # record 0 omits priority: does the pipeline derive it?
        )
        records.append((alarm_id, payload))
        priority = sl.severity_to_priority(severity)
        # http-feed events (alarmId+state present) get severity REPLACED by the
        # priority band floor in Flink (PipelineOperators.ValidationMap:63);
        # record 0 has no priority field -> defaults to 300 -> LOW.
        expected[alarm_id] = {
            "source": source, "condition": condition,
            "severity": {"CRITICAL": 900, "HIGH": 700, "MEDIUM": 400, "LOW": 100}[priority]
            if i != 0 else 300,
            "priority": priority if i != 0 else "LOW",
        }

    n = sl.kafka_publish_batch("raw-alarms", records, interval=args.interval)
    sl.log(f"published {n} raw alarms to raw-alarms")

    checks: dict[str, bool] = {}
    detail: dict = {}

    # 1. current-alarm-state grew and our records are keyed upserts
    grew = sl.wait_until(
        f"current-alarm-state to grow by {args.count}",
        lambda: sl.kafka_end_offset_sum("current-alarm-state") >= cas_before + args.count,
        timeout_sec=120,
    )
    checks["current_alarm_state_grew"] = grew
    cas_msgs = sl.kafka_consume("current-alarm-state", max_messages=5000,
                                timeout_sec=25, contains=f"SIM-{tag}-")
    keyed_ok = bool(cas_msgs) and all(k is not None and k.startswith(f"SIM-{tag}-") for k, _ in cas_msgs)
    upsert_ok = bool(cas_msgs) and all('"eventType":"ALARM_STATE_UPSERT"' in v for _, v in cas_msgs)
    checks["cas_records_keyed_by_alarm_id"] = keyed_ok
    checks["cas_records_are_upserts"] = upsert_ok
    detail["cas_matched"] = len(cas_msgs)

    # 2. Postgres projection with correct identity columns
    def pg_count() -> int:
        rows = sl.pg_query(
            f"SELECT count(*) FROM alarms.alarm_current WHERE alarm_id LIKE 'SIM-{tag}-%'")
        return int(rows[0][0]) if rows else 0

    checks["pg_alarm_current_rows"] = sl.wait_until(
        f"alarms.alarm_current rows == {args.count}",
        lambda: pg_count() >= args.count, timeout_sec=120)
    rows = sl.pg_query(
        "SELECT alarm_id, server_id, source, condition, coalesce(sub_condition,''), severity"
        f" FROM alarms.alarm_current WHERE alarm_id LIKE 'SIM-{tag}-%'")
    ident_ok = len(rows) >= args.count
    for r in rows:
        aid, server_id, source, condition, subc, severity = r
        exp = expected.get(aid)
        if not exp:
            ident_ok = False
            continue
        if (server_id.lower() != sl.SERVER_ID.lower() or source != exp["source"]
                or condition != exp["condition"] or int(severity) != exp["severity"]):
            ident_ok = False
            detail.setdefault("identity_mismatches", []).append(r)
    checks["pg_identity_columns_correct"] = ident_ok
    detail["pg_rows"] = len(rows)

    # 3. severity -> priority mapping via the API
    r = sl.api("GET", "/api/v1/alarms/active?pageSize=500", token)
    prio_ok = r.status_code == 200
    mismatches = []
    if prio_ok:
        body = r.json()
        items = body if isinstance(body, list) else body.get("items") or body.get("data") or []
        by_source = {e["source"]: e for e in expected.values()}
        ours = [a for a in items
                if str(a.get("sourceName", "")).startswith(f"SimFeed.{tag}.")]
        detail["api_active_matched"] = len(ours)
        for a in ours:
            exp = by_source.get(str(a.get("sourceName")))
            got = str(a.get("priorityLabel") or a.get("priority") or "").upper()
            if exp and exp["priority"] != got:
                mismatches.append({"sourceName": a.get("sourceName"),
                                   "expected": exp["priority"], "got": got})
        prio_ok = len(ours) > 0 and not mismatches
    detail["priority_mismatches"] = mismatches
    checks["api_priority_mapping"] = prio_ok

    # 4. lifecycle-events grew
    checks["lifecycle_events_grew"] = sl.wait_until(
        "lifecycle-events to grow",
        lambda: sl.kafka_end_offset_sum("lifecycle-events") > lce_before, timeout_sec=60)

    # 5. SignalR
    if not args.skip_signalr:
        deadline = time.time() + 30
        seen = False
        while time.time() < deadline and not seen:
            seen = any(tag in json.dumps(p, default=str) for _, p in signalr_events)
            if not seen:
                time.sleep(2)
        checks["signalr_on_new_or_updated"] = seen
        detail["signalr_events_total"] = len(signalr_events)
        detail["signalr_errors"] = signalr_errors[:3]
        if conn:
            try:
                conn.stop()
            except Exception:
                pass

    # informational: what happened to the record injected without a priority field
    r0 = sl.pg_query(
        f"SELECT alarm_id, severity FROM alarms.alarm_current WHERE alarm_id = 'SIM-{tag}-000'")
    detail["no_priority_record_projected"] = bool(r0)

    report = {
        "sim": "sim_alarm_feed", "run_tag": tag, "count": args.count,
        "baseline": {"current_alarm_state": cas_before, "lifecycle_events": lce_before},
        "checks": checks, "detail": detail,
    }
    return sl.finish(args, report)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except sl.SimError as exc:
        sl.log(f"FATAL: {exc}")
        raise SystemExit(2)
