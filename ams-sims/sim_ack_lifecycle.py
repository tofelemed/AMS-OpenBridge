#!/usr/bin/env python3
"""Full ACK loop: traverse.alarm.operator-actions -> OpcEventStreamJob -> traverse.alarm.ack-writeback ->
HttpAckWritebackService -> external ACK URL -> traverse.alarm.ack-results -> OpcEventStreamJob
-> traverse.alarm.current-alarm-state (ACK_STATE_UPDATE) -> Postgres -> SignalR.

Two modes:
  --via-api (default): seeds fresh alarms, then POSTs the real
      /api/v1/alarms/acknowledge/batch so the API's traverse.alarm.operator-actions publish and
      the "acknowledged is NEVER set directly on POST" invariant are covered.
  --inject-only: skips the API and injects OperatorActionMessage-shaped records
      straight into operator-actions.

Lab reality (pipeline.md PIPE-002): the DCS ACK URL (192.168.1.51:8010) is
unreachable, so the real HTTP leg ends ACK_FAILED. The sim verifies that chain,
then injects a synthetic ACK_CONFIRMED into traverse.alarm.ack-results (mimicking the DCS
reply) and verifies the confirm branch through to Postgres acknowledged=true.

Usage: python sim_ack_lifecycle.py [--count 3] [--run-tag X] [--inject-only]
"""
from __future__ import annotations

import json
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import simlib as sl


def seed_alarms(tag: str, count: int) -> dict[str, dict]:
    """Inject fresh ACTIVE alarms through the normal Pipeline A path."""
    records, expected = [], {}
    for i in range(count):
        alarm_id = f"ACK-{tag}-{i:03d}"
        source = f"AckSim.{tag}.Unit1.Tag_{i:03d}"
        payload = sl.make_raw_alarm(alarm_id, source, "HighHigh", severity=720,
                                    sub_condition="HighHigh")
        records.append((alarm_id, payload))
        expected[alarm_id] = payload
    sl.kafka_publish_batch("traverse.alarm.raw-alarms", records)
    ok = sl.wait_until(
        f"{count} seeded alarms in alarms.alarm_current",
        lambda: int(sl.pg_query(
            f"SELECT count(*) FROM alarms.alarm_current WHERE alarm_id LIKE 'ACK-{tag}-%'"
        )[0][0]) >= count,
        timeout_sec=120,
    )
    if not ok:
        raise sl.SimError("seed alarms never reached alarm_current — cannot test ACK")
    return expected


def make_operator_action(alarm_id: str, raw: dict, username: str = "ams-sims") -> dict:
    """Mimic OperatorActionMessage as published by the batch-acknowledge API."""
    cmd_id = str(uuid.uuid4())
    return {
        "schemaVersion": 1,
        "eventType": "OPERATOR_ACK_COMMAND",
        "commandId": cmd_id,
        "correlationId": cmd_id,
        "alarmId": alarm_id,
        "sourceAlarmId": f"{raw['sourceName']}|{raw['conditionName']}",
        "sourceEventId": raw["eventId"],
        "actionType": "ACKNOWLEDGE",
        "userId": "ams-sims",
        "username": username,
        "comment": "synthetic ack",
        "actionTimeEpochMs": int(time.time() * 1000),
        "serverId": raw["serverId"],
        "sourceName": raw["sourceName"],
        "conditionName": raw["conditionName"],
        "subConditionName": raw.get("subConditionName", ""),
        "activeTimeEpochMs": raw["activeTimeEpochMs"],
        "activeFileTime": 0,
        "cookieOffset": raw.get("cookieOffset", 1),
        "operatorStation": "sim-station",
    }


def main() -> int:
    ap = sl.base_parser(__doc__.splitlines()[0], default_count=3, default_interval=0.2)
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--via-api", dest="via_api", action="store_true", default=True)
    mode.add_argument("--inject-only", dest="via_api", action="store_false")
    args = ap.parse_args()
    tag = args.run_tag
    sl.banner(f"sim_ack_lifecycle  run-tag={tag}  count={args.count}  via_api={args.via_api}")

    sl.kafka_check_connectivity()
    token = sl.login()

    expected = seed_alarms(tag, args.count)
    alarm_ids = sorted(expected)

    awb_before = sl.kafka_end_offset_sum("traverse.alarm.ack-writeback")
    ares_before = sl.kafka_end_offset_sum("traverse.alarm.ack-results")

    checks: dict[str, bool] = {}
    detail: dict = {}

    # invariant precheck: seeded rows are unacknowledged
    pre = sl.pg_query(
        f"SELECT alarm_id, ack_status FROM alarms.alarm_current WHERE alarm_id LIKE 'ACK-{tag}-%'")
    detail["ack_status_before"] = {r[0]: r[1] for r in pre}

    if args.via_api:
        # the batch endpoint takes the alarm row GUIDs (items[].id), not the
        # string alarmIds — resolve them via /alarms/active by sourceName
        ra = sl.api("GET", "/api/v1/alarms/active?pageSize=500", token)
        items = ra.json().get("items", []) if ra.status_code == 200 else []
        guids = [a["id"] for a in items
                 if str(a.get("sourceName", "")).startswith(f"AckSim.{tag}.")]
        detail["resolved_guids"] = len(guids)
        if len(guids) < args.count:
            raise sl.SimError(
                f"only {len(guids)}/{args.count} seeded alarms visible in /alarms/active")
        r = sl.api("POST", "/api/v1/alarms/acknowledge/batch", token, json={
            "alarmIds": guids,
            "comment": "ams-sims synthetic batch ack",
            "operatorStation": "sim-station",
        })
        checks["api_batch_ack_accepted"] = r.status_code == 200
        detail["api_batch_ack_response"] = r.text[:500]
        # The API must NOT set acknowledged directly — only the Kafka round-trip
        # may. With the mock DCS answering instantly the whole loop can finish in
        # under 2 s, so "still false shortly after POST" is a race, not an
        # invariant. Accept either: (a) not yet acked at probe time, or (b) acked
        # WITH round-trip evidence (an ACK_CONFIRMED for our alarms on
        # traverse.alarm.ack-results — which only the writeback service produces).
        time.sleep(2)
        mid = sl.pg_query(
            f"SELECT count(*) FROM alarms.alarm_current WHERE alarm_id LIKE 'ACK-{tag}-%'"
            " AND ack_status")
        if int(mid[0][0]) == 0:
            checks["ack_only_via_kafka_roundtrip"] = True
        else:
            early = sl.kafka_consume("traverse.alarm.ack-results", max_messages=3000, timeout_sec=20,
                                     contains=f"AckSim.{tag}.")
            confirmed = [v for _, v in early if "ACK_CONFIRMED" in v]
            checks["ack_only_via_kafka_roundtrip"] = len(confirmed) >= int(mid[0][0])
            detail["early_ack_roundtrip_evidence"] = len(confirmed)
    else:
        actions = [(aid, make_operator_action(aid, expected[aid])) for aid in alarm_ids]
        sl.kafka_publish_batch("traverse.alarm.operator-actions", actions, interval=args.interval)
        sl.log(f"injected {len(actions)} traverse.alarm.operator-actions")

    # 1. Flink ack-processor -> traverse.alarm.ack-writeback (ACK_DISPATCHED)
    checks["ack_writeback_grew"] = sl.wait_until(
        "traverse.alarm.ack-writeback to grow",
        lambda: sl.kafka_end_offset_sum("traverse.alarm.ack-writeback") > awb_before, timeout_sec=90)
    awb = sl.kafka_consume("traverse.alarm.ack-writeback", max_messages=2000, timeout_sec=20,
                           contains=f"AckSim.{tag}.")
    checks["ack_writeback_dispatched"] = bool(awb) and all(
        '"ackState":"ACK_DISPATCHED"' in v for _, v in awb)
    detail["ack_writeback_matched"] = len(awb)

    # 2. HttpAckWritebackService -> traverse.alarm.ack-results (ACK_FAILED expected: PIPE-002)
    checks["ack_results_grew"] = sl.wait_until(
        "traverse.alarm.ack-results to grow",
        lambda: sl.kafka_end_offset_sum("traverse.alarm.ack-results") > ares_before, timeout_sec=180)
    ares = sl.kafka_consume("traverse.alarm.ack-results", max_messages=2000, timeout_sec=20,
                            contains=f"AckSim.{tag}.")
    states = sorted({json.loads(v).get("ResultState") or json.loads(v).get("resultState")
                     for _, v in ares if v.strip().startswith("{")})
    detail["ack_result_states"] = states
    checks["ack_results_have_result_state"] = bool(ares) and all(s for s in states)

    # 3. traverse.alarm.lifecycle-events carries the result state transitions
    lce = sl.kafka_consume("traverse.alarm.lifecycle-events", max_messages=5000, timeout_sec=20,
                           contains=f"AckSim.{tag}.")
    lstates = sorted({json.loads(v).get("lifecycleState") for _, v in lce
                      if v.strip().startswith("{")})
    detail["lifecycle_states_seen"] = lstates
    checks["lifecycle_ack_states_present"] = any(
        s and s.startswith("ACK_") for s in lstates)

    # 4. synthetic DCS confirm -> traverse.alarm.ack-results ACK_CONFIRMED -> ACK_STATE_UPDATE -> Postgres
    confirms = []
    for aid in alarm_ids:
        raw = expected[aid]
        cmd_id = str(uuid.uuid4())
        confirms.append((aid, {
            "schemaVersion": 1,
            "eventType": "ACK_RESULT",
            "commandId": cmd_id,
            "correlationId": cmd_id,
            "alarmId": aid,
            "serverId": raw["serverId"],
            "sourceName": raw["sourceName"],
            "conditionName": raw["conditionName"],
            "activeTimeEpochMs": raw["activeTimeEpochMs"],
            "cookieOffset": raw.get("cookieOffset", 1),
            "resultState": "ACK_CONFIRMED",
            "timestampEpochMs": int(time.time() * 1000),
        }))
    cas_before = sl.kafka_end_offset_sum("traverse.alarm.current-alarm-state")
    sl.kafka_publish_batch("traverse.alarm.ack-results", confirms)
    sl.log("injected synthetic ACK_CONFIRMED results (mimicking DCS reply)")

    checks["ack_confirm_reached_cas"] = sl.wait_until(
        "ACK_STATE_UPDATE on traverse.alarm.current-alarm-state",
        lambda: sl.kafka_end_offset_sum("traverse.alarm.current-alarm-state") > cas_before, timeout_sec=90)
    cas = sl.kafka_consume("traverse.alarm.current-alarm-state", max_messages=8000, timeout_sec=25,
                           contains=f"ACK-{tag}-")
    checks["cas_ack_state_update_seen"] = any(
        '"eventType":"ACK_STATE_UPDATE"' in v for _, v in cas)

    def acked_count() -> int:
        rows = sl.pg_query(
            f"SELECT count(*) FROM alarms.alarm_current WHERE alarm_id LIKE 'ACK-{tag}-%'"
            " AND ack_status")
        return int(rows[0][0]) if rows else 0

    checks["pg_acknowledged_after_confirm"] = sl.wait_until(
        f"{args.count} rows acknowledged in Postgres",
        lambda: acked_count() >= args.count, timeout_sec=90)
    detail["pg_acknowledged_rows"] = acked_count()
    post = sl.pg_query(
        f"SELECT alarm_id, ack_status, state FROM alarms.alarm_current WHERE alarm_id LIKE 'ACK-{tag}-%'")
    detail["ack_status_after"] = {r[0]: {"ack_status": r[1], "state": r[2]} for r in post}

    report = {
        "sim": "sim_ack_lifecycle", "run_tag": tag, "count": args.count,
        "via_api": args.via_api, "checks": checks, "detail": detail,
        "note": "ACK_CONFIRMED via real HTTP writeback is unreachable in this lab "
                "(PIPE-002); confirm branch exercised via synthetic ack-results.",
    }
    return sl.finish(args, report)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except sl.SimError as exc:
        sl.log(f"FATAL: {exc}")
        raise SystemExit(2)
