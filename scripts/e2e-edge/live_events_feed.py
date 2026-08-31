#!/usr/bin/env python3
"""
Continuous live-event feeder for HMI testing.

Open http://localhost:3000/live-events and switch to the **MQTT Sparkplug** tab
while this script runs.

Pipeline by mode
----------------
  full  (default)
    traverse.alarm.raw-alarms -> Flink OpcEventStreamJob -> traverse.alarm.current-alarm-state
              -> LiveStateJob -> traverse.alarm.live.alarms -> sparkplug-edge-node -> EMQX -> MQTT -> HMI

  fast
    traverse.alarm.current-alarm-state -> LiveStateJob -> traverse.alarm.live.alarms -> sparkplug-edge-node -> EMQX -> MQTT
    (also updates API / alarm console via NormalizedAlarmIngestor)

  mqtt
    traverse.alarm.live.alarms -> sparkplug-edge-node -> EMQX -> MQTT -> HMI  (skips Flink — no IoTDB writes)

Each tick varies severity/priority so Flink RBE still emits to live.alarms.

For IoTDB Trend Viewer use --mode full (default), not mqtt.

Usage
-----
  cd scripts/e2e-edge
  python live_events_feed.py
  python live_events_feed.py --interval 3 --mode full
  python live_events_feed.py --mode mqtt --interval 2
  python live_events_feed.py --count 20

Prerequisites: Docker stack up (kafka, flink jobs, sparkplug-edge-node, emqx, frontend).
"""
from __future__ import annotations

import argparse
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import config as cfg
from common import kafka_publish, log, make_current_state_upsert, make_raw_alarm


PRIORITIES = ("CRITICAL", "HIGH", "MEDIUM", "LOW")
CONDITIONS = ("HighHigh", "High", "Low", "LowLow")
STATES = ("ACTIVE", "ACTIVE", "ACTIVE", "ACKNOWLEDGED")  # mostly active


def make_live_alarm(
    alarm_id: str,
    source_name: str,
    *,
    seq: int,
    condition_name: str = "High",
    state: str = "ACTIVE",
    priority: str = "HIGH",
    severity: int = 700,
) -> dict:
    """Envelope for traverse.alarm.live.alarms (matches LiveStateJob / sparkplug-edge-node)."""
    now_ms = int(time.time() * 1000)
    return {
        "alarmId": alarm_id,
        "serverId": cfg.TEST_SERVER_ID,
        "state": state,
        "severity": severity,
        "acknowledged": state == "ACKNOWLEDGED",
        "conditionActive": state not in ("CLEARED",),
        "priority": priority,
        "sourceName": source_name,
        "conditionName": condition_name,
        "subConditionName": "",
        "message": f"Live demo #{seq} — {source_name} @ {datetime.now().strftime('%H:%M:%S')}",
        "eventTimeEpochMs": now_ms,
        "rbeTs": now_ms,
        "activeTime": now_ms,
    }


def pick_source(seq: int, run_tag: str) -> str:
    unit = (seq % 5) + 1
    tag = (seq % 20) + 1
    return f"LiveDemo.{run_tag}.Unit{unit}.Tag_{tag:03d}"


def pick_alarm_id(seq: int, run_tag: str) -> str:
    # Re-use a small pool so the HMI list updates in place; new seq still changes RBE fields
    slot = (seq % 8) + 1
    return f"LIVE-{run_tag}-{slot:02d}"


def publish_tick(seq: int, run_tag: str, mode: str) -> None:
    alarm_id = pick_alarm_id(seq, run_tag)
    source = pick_source(seq, run_tag)
    priority = PRIORITIES[seq % len(PRIORITIES)]
    state = STATES[seq % len(STATES)]
    severity = 400 + (seq * 37) % 600
    condition = CONDITIONS[seq % len(CONDITIONS)]

    if mode == "mqtt":
        payload = make_live_alarm(
            alarm_id,
            source,
            seq=seq,
            condition_name=condition,
            state=state,
            priority=priority,
            severity=severity,
        )
        kafka_publish(cfg.TOPIC_LIVE_ALARMS, key=alarm_id, payload=payload)
        log(f"#{seq:04d} mqtt  traverse.alarm.live.alarms  {alarm_id}  {source}  sev={severity}  {priority}")
        return

    raw = make_raw_alarm(
        alarm_id,
        source,
        condition,
        state=state,
        priority=priority,
        severity=severity,
    )
    raw["message"] = f"Live demo #{seq} — {source} @ {datetime.now().strftime('%H:%M:%S')}"

    if mode == "full":
        kafka_publish(cfg.TOPIC_RAW_ALARMS, key=alarm_id, payload=raw)
        log(f"#{seq:04d} full  traverse.alarm.raw-alarms  {alarm_id}  {source}  sev={severity}  {priority}")
        return

    # fast: traverse.alarm.current-alarm-state only
    upsert = make_current_state_upsert(raw)
    kafka_publish(cfg.TOPIC_CURRENT_STATE, key=alarm_id, payload=upsert)
    log(f"#{seq:04d} fast  traverse.alarm.current-alarm-state  {alarm_id}  {source}  sev={severity}  {priority}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Continuously feed live alarms for HMI /live-events testing",
    )
    parser.add_argument(
        "--mode",
        choices=("full", "fast", "mqtt"),
        default="full",
        help="Pipeline path (default: full = traverse.alarm.raw-alarms through Flink)",
    )
    parser.add_argument("--interval", type=float, default=3.0, help="Seconds between events")
    parser.add_argument("--count", type=int, default=0, help="Stop after N events (0 = run forever)")
    parser.add_argument(
        "--run-tag",
        default=uuid.uuid4().hex[:6],
        help="Short tag embedded in alarm IDs / source names",
    )
    args = parser.parse_args()

    print()
    print("=" * 62)
    print("  Live Events Feed  (HMI demo)")
    print("=" * 62)
    print(f"  UI:       {cfg.FRONTEND}/live-events  →  MQTT Sparkplug tab")
    print(f"  Mode:     {args.mode}")
    print(f"  Interval: {args.interval}s")
    print(f"  Count:    {'∞' if args.count == 0 else args.count}")
    print(f"  Run tag:  {args.run_tag}")
    if args.mode == "full":
        print("  Path:     traverse.alarm.raw-alarms → Flink → traverse.alarm.live.alarms → MQTT → HMI")
    elif args.mode == "fast":
        print("  Path:     traverse.alarm.current-alarm-state → Flink → traverse.alarm.live.alarms → MQTT → HMI")
    else:
        print("  Path:     traverse.alarm.live.alarms → sparkplug-edge-node → MQTT → HMI")
    print("=" * 62)
    print("  Press Ctrl+C to stop")
    print()

    seq = 1
    try:
        while args.count == 0 or seq <= args.count:
            try:
                publish_tick(seq, args.run_tag, args.mode)
            except Exception as exc:
                log(f"  [ERROR] publish failed: {exc}")
            seq += 1
            if args.count == 0 or seq <= args.count:
                time.sleep(args.interval)
    except KeyboardInterrupt:
        print()
        log(f"Stopped after {seq - 1} event(s)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
