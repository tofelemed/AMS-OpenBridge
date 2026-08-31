#!/usr/bin/env python3
"""
Feed synthetic alarm events into Kafka for edge-platform E2E testing.

Pipeline exercised:
  traverse.alarm.raw-alarms → Flink (OpcEventStreamJob + IoTDBPersistenceJob)
            → traverse.alarm.current-alarm-state → LiveStateJob → traverse.alarm.live.alarms / traverse.live.metrics
            → Sparkplug Edge Node → EMQX → Redis snapshot
            → Historian BFF / IoTDB / Frontend

Usage:
  python feed_test_data.py
  python feed_test_data.py --run-id demo01 --count 5
  python feed_test_data.py --also-current-state   # accelerate MQTT path (optional)
"""
from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path

# Allow running from repo root or this folder
sys.path.insert(0, str(Path(__file__).resolve().parent))

import config as cfg
from common import (
    iotdb_alarm_path,
    kafka_publish,
    log,
    make_alarm_id,
    make_current_state_upsert,
    make_raw_alarm,
    print_banner,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Feed E2E test alarms to Kafka")
    parser.add_argument("--run-id", default=uuid.uuid4().hex[:8], help="Unique run identifier")
    parser.add_argument("--count", type=int, default=3, help="Number of alarms to inject")
    parser.add_argument(
        "--also-current-state",
        action="store_true",
        help="Also publish ALARM_STATE_UPSERT to traverse.alarm.current-alarm-state (MQTT fast-path)",
    )
    parser.add_argument("--clear-one", action="store_true", help="Send a CLEARED event for alarm-001")
    args = parser.parse_args()

    print_banner(f"Feed Test Data  run={args.run_id}  count={args.count}")

    manifest: list[dict] = []
    for i in range(1, args.count + 1):
        alarm_id = make_alarm_id(args.run_id, i)
        source = f"{cfg.TEST_PREFIX}.Unit1.Tag_{i:03d}"
        raw = make_raw_alarm(alarm_id, source, "High", state="ACTIVE", priority="HIGH")
        kafka_publish(cfg.TOPIC_RAW_ALARMS, key=alarm_id, payload=raw)
        log(f"Published traverse.alarm.raw-alarms  key={alarm_id}  source={source}")
        manifest.append({
            "alarmId": alarm_id,
            "sourceName": source,
            "iotdbPath": iotdb_alarm_path(alarm_id),
        })

        if args.also_current_state:
            upsert = make_current_state_upsert(raw)
            kafka_publish(cfg.TOPIC_CURRENT_STATE, key=alarm_id, payload=upsert)
            log(f"Published traverse.alarm.current-alarm-state  key={alarm_id}")

    if args.clear_one and args.count >= 1:
        alarm_id = make_alarm_id(args.run_id, 1)
        source = f"{cfg.TEST_PREFIX}.Unit1.Tag_001"
        cleared = make_raw_alarm(alarm_id, source, "High", state="CLEARED", priority="LOW", severity=100)
        cleared["conditionActive"] = False
        kafka_publish(cfg.TOPIC_RAW_ALARMS, key=alarm_id, payload=cleared)
        log(f"Published CLEARED traverse.alarm.raw-alarms  key={alarm_id}")

    out_path = Path(__file__).resolve().parent / f"manifest_{args.run_id}.json"
    out_path.write_text(
        json.dumps({"runId": args.run_id, "alarms": manifest}, indent=2),
        encoding="utf-8",
    )
    log(f"Manifest written → {out_path.name}")
    log(f"Use: python run_all.py --run-id {args.run_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
