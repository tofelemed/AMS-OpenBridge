#!/usr/bin/env python3
"""
Live Alarm Generator - Continuously pushes alarms to Kafka for real-time testing.

Usage:
    python live_alarm_generator.py [--interval 5] [--topic traverse.alarm.live.alarms]

This script publishes unique alarms every N seconds to test the full pipeline:
    Kafka -> LiveStateJob -> traverse.alarm.live.alarms -> sparkplug-edge-node -> EMQX -> MQTT
"""

import argparse
import json
import subprocess
import sys
import time
import uuid
from datetime import datetime

# Default Kafka settings (via docker exec)
KAFKA_CONTAINER = "ams-kafka"
KAFKA_BOOTSTRAP = "localhost:9092"


def publish_to_kafka(topic: str, key: str, value: dict) -> bool:
    """Publish a message to Kafka via docker exec."""
    json_str = json.dumps(value, separators=(",", ":"))
    
    # Use echo + kafka-console-producer via docker exec
    cmd = [
        "docker", "exec", "-i", KAFKA_CONTAINER,
        "kafka-console-producer",
        "--bootstrap-server", KAFKA_BOOTSTRAP,
        "--topic", topic,
        "--property", "parse.key=true",
        "--property", "key.separator=|"
    ]
    
    message = f"{key}|{json_str}"
    
    try:
        proc = subprocess.run(
            cmd,
            input=message.encode(),
            capture_output=True,
            timeout=10
        )
        return proc.returncode == 0
    except Exception as e:
        print(f"  [ERROR] Kafka publish failed: {e}")
        return False


def generate_alarm(seq: int) -> tuple[str, dict]:
    """Generate a unique alarm with incrementing sequence."""
    now_ms = int(time.time() * 1000)
    alarm_id = f"LIVE-{seq:06d}-{uuid.uuid4().hex[:8]}"
    
    alarm = {
        "alarmId": alarm_id,
        "serverId": "f0af9a6d-85f6-4c9f-a8ad-6de277d1d110",  # Valid GUID for API
        "state": "ACTIVE",
        "severity": 700 + (seq % 300),  # Vary severity
        "acknowledged": False,
        "conditionActive": True,
        "priority": ["HIGH", "MEDIUM", "LOW"][seq % 3],
        "sourceName": f"LiveGen.Unit{(seq % 5) + 1}.Tag_{seq:03d}",
        "conditionName": ["HighHigh", "High", "Low", "LowLow"][seq % 4],
        "subConditionName": "",
        "message": f"Live generated alarm #{seq} at {datetime.now().strftime('%H:%M:%S')}",
        "eventTimeEpochMs": now_ms,
        "rbeTs": now_ms,  # RBE timestamp for sparkplug-edge-node
        "activeTime": now_ms,
    }
    
    return alarm_id, alarm


def main():
    parser = argparse.ArgumentParser(description="Generate live alarms to Kafka")
    parser.add_argument("--interval", type=float, default=3.0,
                        help="Seconds between alarms (default: 3)")
    parser.add_argument("--topic", default="traverse.alarm.live.alarms",
                        help="Kafka topic (default: traverse.alarm.live.alarms)")
    parser.add_argument("--also-raw", action="store_true",
                        help="Also publish to traverse.alarm.raw-alarms topic")
    parser.add_argument("--count", type=int, default=0,
                        help="Stop after N alarms (0 = infinite)")
    args = parser.parse_args()

    print("=" * 60)
    print("  Live Alarm Generator")
    print("=" * 60)
    print(f"  Topic:    {args.topic}")
    print(f"  Interval: {args.interval}s")
    print(f"  Also raw: {args.also_raw}")
    print(f"  Count:    {'infinite' if args.count == 0 else args.count}")
    print("=" * 60)
    print()
    print("Press Ctrl+C to stop...")
    print()

    seq = 1
    try:
        while args.count == 0 or seq <= args.count:
            alarm_id, alarm = generate_alarm(seq)
            
            # Publish to traverse.alarm.live.alarms (direct to sparkplug-edge-node)
            ok = publish_to_kafka(args.topic, alarm_id, alarm)
            status = "OK" if ok else "FAIL"
            print(f"[{datetime.now().strftime('%H:%M:%S')}] #{seq:04d} -> {args.topic}: {alarm_id} [{status}]")
            
            # Optionally also publish to traverse.alarm.raw-alarms (goes through Flink)
            if args.also_raw:
                ok2 = publish_to_kafka("traverse.alarm.raw-alarms", alarm_id, alarm)
                status2 = "OK" if ok2 else "FAIL"
                print(f"[{datetime.now().strftime('%H:%M:%S')}] #{seq:04d} -> traverse.alarm.raw-alarms: {alarm_id} [{status2}]")
            
            seq += 1
            
            if args.count == 0 or seq <= args.count:
                time.sleep(args.interval)
                
    except KeyboardInterrupt:
        print()
        print(f"Stopped after {seq - 1} alarm(s)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
