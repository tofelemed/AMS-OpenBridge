#!/usr/bin/env python3
"""
Limit watchdog — turns a REAL live-tag limit breach into a REAL alarm.

Reads a process tag's live value from the Redis snapshot the edge-node writes, and when it
crosses a HiHi limit publishes a genuine alarm event into the AMS alarm pipeline
(traverse.alarm.raw-alarms + traverse.alarm.current-alarm-state → Flink → API → SignalR → frontend alarmStore). The alarm
is LATCHED (ISA-18.2): it stays ACTIVE once breached until the value drops below a clear
threshold (deadband), then a CLEARED event is published.

This is not a mock — the alarm flows through the same pipeline as production OPC A&E alarms
and lands in the same alarmStore the HMI symbols read.

Usage:
  python limit_watchdog.py --tag houston/crude1/pump101.discharge_press --hihi 250 --source houston/crude1/pump101
  python limit_watchdog.py --tag ... --hihi 250 --once-active   # publish ACTIVE immediately if breached, then exit
"""
import argparse
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "e2e-edge"))
import common  # noqa: E402
import config as cfg  # noqa: E402


def redis_get(key: str) -> str | None:
    try:
        out = subprocess.run(
            ["docker", "exec", "ams-redis", "redis-cli", "GET", key],
            capture_output=True, timeout=10,
        )
        val = out.stdout.decode("utf-8", "replace").strip()
        return val or None
    except Exception:
        return None


def snapshot_key(tag: str) -> str:
    # tag = site/unit/device.measurement  → snapshot:metric:<site>:<site>_edge1:<device>:<metric>
    site = tag.split("/")[0]
    device = tag.split("/")[-1].split(".")[0]
    metric = tag.split(".")[-1]
    return f"snapshot:metric:{site}:{site}_edge1:{device}:{metric}"


def live_value(tag: str) -> float | None:
    raw = redis_get(snapshot_key(tag))
    if not raw:
        return None
    try:
        import json
        return float(json.loads(raw).get("v"))
    except Exception:
        return None


def publish_active(alarm_id: str, source: str, severity: int) -> None:
    raw = common.make_raw_alarm(alarm_id, source, "HiHi", state="ACTIVE", priority="CRITICAL", severity=severity)
    common.kafka_publish(cfg.TOPIC_RAW_ALARMS, key=alarm_id, payload=raw)
    common.kafka_publish(cfg.TOPIC_CURRENT_STATE, key=alarm_id, payload=common.make_current_state_upsert(raw))


def publish_clear(alarm_id: str, source: str) -> None:
    raw = common.make_raw_alarm(alarm_id, source, "HiHi", state="CLEARED", priority="LOW", severity=100)
    raw["conditionActive"] = False
    common.kafka_publish(cfg.TOPIC_RAW_ALARMS, key=alarm_id, payload=raw)
    up = common.make_current_state_upsert(raw)
    up["conditionActive"] = False
    common.kafka_publish(cfg.TOPIC_CURRENT_STATE, key=alarm_id, payload=up)


def main() -> int:
    ap = argparse.ArgumentParser(description="AMS limit watchdog (real limit breach → real alarm)")
    ap.add_argument("--tag", required=True, help="contextual tag path, e.g. houston/crude1/pump101.discharge_press")
    ap.add_argument("--hihi", type=float, required=True, help="HiHi limit")
    ap.add_argument("--clear-below", type=float, help="clear threshold (default = hihi * 0.9, deadband)")
    ap.add_argument("--source", help="alarm sourceName (default = device path, e.g. houston/crude1/pump101)")
    ap.add_argument("--severity", type=int, default=900)
    ap.add_argument("--interval", type=float, default=1.5)
    ap.add_argument("--once-active", action="store_true", help="publish ACTIVE now if breached, then exit")
    args = ap.parse_args()

    source = args.source or args.tag.rsplit(".", 1)[0]      # device path
    clear_below = args.clear_below if args.clear_below is not None else args.hihi * 0.9
    alarm_id = f"WATCHDOG-{source.replace('/', '.')}-HiHi"
    print(f"[watchdog] tag={args.tag} HiHi={args.hihi} clear<{clear_below} source={source} id={alarm_id}")

    latched = False
    while True:
        v = live_value(args.tag)
        if v is None:
            print("[watchdog] no live value yet…")
        else:
            if not latched and v >= args.hihi:
                publish_active(alarm_id, source, args.severity)
                latched = True
                print(f"[watchdog] BREACH {args.tag}={v:.1f} >= {args.hihi} → ALARM ACTIVE ({source})")
                if args.once_active:
                    return 0
            elif latched and v < clear_below:
                publish_clear(alarm_id, source)
                latched = False
                print(f"[watchdog] RTN {args.tag}={v:.1f} < {clear_below} → CLEARED ({source})")
            else:
                print(f"[watchdog] {args.tag}={v:.1f} {'(latched active)' if latched else '(normal)'}")
        if args.once_active and not latched:
            time.sleep(args.interval)
            continue
        time.sleep(args.interval)


if __name__ == "__main__":
    raise SystemExit(main())
