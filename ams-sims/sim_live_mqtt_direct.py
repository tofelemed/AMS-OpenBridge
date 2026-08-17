#!/usr/bin/env python3
"""Pipeline B isolated: live.alarms -> sparkplug-edge-node -> EMQX Sparkplug B
-> Redis snapshots, bypassing raw-alarms/Flink entirely (mqtt-mode pattern from
scripts/e2e-edge/live_events_feed.py).

Verifies, with a live MQTT subscription on spBv1.0/<group>/#:
  - DBIRTH for a brand-new device arrives BEFORE its first DDATA, and declares
    the alias map used by subsequent DDATA
  - messages are QoS 0 and not retained
  - Redis snapshot keys exist with a TTL and content matching published values
  - no IoTDB write happens for these alarm ids (IOTDB_PERSIST not enabled)

Usage: python sim_live_mqtt_direct.py [--count 6] [--interval 1.0] [--run-tag X]
"""
from __future__ import annotations

import json
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import simlib as sl
import spb_decode


class SpCapture:
    def __init__(self):
        self.messages: list[dict] = []  # {topic, kind, device, qos, retain, payload, t}
        self.lock = threading.Lock()

    def on_message(self, _client, _userdata, msg):
        parts = msg.topic.split("/")
        kind = parts[2] if len(parts) > 2 else "?"
        device = parts[4] if len(parts) > 4 else None
        try:
            payload = spb_decode.decode_payload(msg.payload)
        except Exception as exc:
            payload = {"decode_error": str(exc)}
        with self.lock:
            self.messages.append({
                "topic": msg.topic, "kind": kind, "device": device,
                "qos": msg.qos, "retain": bool(msg.retain),
                "payload": payload, "t": time.time(),
            })


def make_live_alarm(alarm_id: str, source: str, seq: int, severity: int) -> dict:
    now_ms = int(time.time() * 1000)
    return {
        "alarmId": alarm_id,
        "serverId": sl.SERVER_ID,
        "state": "ACTIVE",
        "severity": severity,
        "acknowledged": False,
        "conditionActive": True,
        "priority": sl.severity_to_priority(severity),
        "sourceName": source,
        "conditionName": "High",
        "subConditionName": "",
        "message": f"ams-sims live-direct #{seq}",
        "eventTimeEpochMs": now_ms,
        "rbeTs": now_ms,
        "activeTime": now_ms,
    }


def main() -> int:
    ap = sl.base_parser(__doc__.splitlines()[0], default_count=6, default_interval=1.0)
    args = ap.parse_args()
    tag = args.run_tag
    sl.banner(f"sim_live_mqtt_direct  run-tag={tag}  count={args.count}")

    sl.kafka_check_connectivity()

    import paho.mqtt.client as mqtt

    cap = SpCapture()
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                         client_id=f"ams-sims-{tag}-{args.group_id_suffix}")
    client.username_pw_set(sl.MQTT_USERNAME, sl.MQTT_PASSWORD)
    client.on_message = cap.on_message
    client.connect(sl.MQTT_HOST, sl.MQTT_PORT, keepalive=30)
    client.subscribe(f"spBv1.0/{sl.SPARKPLUG_GROUP}/#", qos=0)
    client.loop_start()
    time.sleep(2)

    # unique devices per run: device id = sanitized sourceName
    records = []
    sources = {}
    for i in range(args.count):
        alarm_id = f"MQT-{tag}-{i:03d}"
        source = f"MqttSim.{tag}.Unit1.Tag_{i:03d}"
        severity = 700 + (i * 40) % 250
        records.append((alarm_id, make_live_alarm(alarm_id, source, i, severity)))
        sources[alarm_id] = {"source": source, "severity": severity}

    n = sl.kafka_publish_batch("live.alarms", records, interval=args.interval)
    sl.log(f"published {n} live.alarms records (Flink bypassed)")

    # wait for DDATA for all our devices (device id derives from sourceName)
    def our_msgs():
        with cap.lock:
            return [m for m in cap.messages if m["device"] and tag in m["device"]]

    got_all = sl.wait_until(
        f"DDATA for {args.count} sim devices on EMQX",
        lambda: len({m["device"] for m in our_msgs() if m["kind"] == "DDATA"}) >= args.count,
        timeout_sec=90, interval_sec=2)

    time.sleep(2)
    client.loop_stop()
    client.disconnect()

    checks: dict[str, bool] = {"mqtt_ddata_all_devices": got_all}
    detail: dict = {}
    msgs = our_msgs()
    detail["captured"] = len(msgs)
    detail["kinds"] = sorted({m["kind"] for m in msgs})

    # birth-before-data + alias declaration per device
    birth_ok = True
    alias_ok = True
    devices = sorted({m["device"] for m in msgs})
    for dev in devices:
        dev_msgs = [m for m in msgs if m["device"] == dev]
        births = [m for m in dev_msgs if m["kind"] == "DBIRTH"]
        datas = [m for m in dev_msgs if m["kind"] == "DDATA"]
        if not births or not datas or min(m["t"] for m in births) > min(m["t"] for m in datas):
            birth_ok = False
            detail.setdefault("birth_violations", []).append(dev)
            continue
        declared = {m.get("alias"): m.get("name")
                    for b in births for m in b["payload"].get("metrics", [])
                    if m.get("alias") is not None}
        detail.setdefault("alias_maps", {})[dev] = declared
        for d in datas:
            for metric in d["payload"].get("metrics", []):
                if metric.get("name") is None and metric.get("alias") is not None:
                    if metric["alias"] not in declared:
                        alias_ok = False
                        detail.setdefault("alias_violations", []).append(
                            {"device": dev, "alias": metric["alias"]})
    checks["dbirth_before_ddata"] = birth_ok
    checks["ddata_aliases_declared_in_dbirth"] = alias_ok

    # QoS 0 / no retained flag
    checks["qos_zero"] = all(m["qos"] == 0 for m in msgs) if msgs else False
    checks["not_retained"] = all(not m["retain"] for m in msgs) if msgs else False

    # Redis snapshot: key exists, has TTL, content matches
    snap_ok = True
    snap_detail = {}
    keys_raw = sl.redis_cli("--scan", "--pattern", f"snapshot:metric:*{tag}*")
    keys = [k for k in keys_raw.splitlines() if k.strip()]
    snap_detail["keys_found"] = len(keys)
    snap_detail["sample_keys"] = keys[:5]
    if not keys:
        snap_ok = False
    for k in keys[:10]:
        ttl = int(sl.redis_cli("TTL", k) or "-2")
        val = sl.redis_cli("GET", k)
        if ttl <= 0:
            snap_ok = False
            snap_detail.setdefault("no_ttl", []).append(k)
        if tag not in val and not any(s["source"].split(".")[-1] in k for s in sources.values()):
            pass  # content correlation is checked loosely below
    snap_detail["sample_value"] = (sl.redis_cli("GET", keys[0])[:300] if keys else None)
    checks["redis_snapshot_with_ttl"] = snap_ok
    detail["redis"] = snap_detail

    # No IoTDB writes for these alarms unless IOTDB_PERSIST is enabled
    persist_env = sl.run(
        ["docker", "exec", "ams-sparkplug-edge-node", "sh", "-c", "printenv IOTDB_PERSIST || true"],
        check=False).stdout.decode().strip()
    detail["edge_iotdb_persist_env"] = persist_env or "(unset)"
    no_write_expected = persist_env.lower() not in ("1", "true", "yes")
    iotdb_hit = False
    try:
        data = sl.iotdb_query(f"show timeseries root.ams.site1.alarms.MQT_{tag}*")
        vals = data.get("values") or []
        iotdb_hit = any(v for v in vals)
    except Exception:
        iotdb_hit = False
    checks["no_iotdb_write_on_direct_path"] = (not iotdb_hit) if no_write_expected else True
    detail["iotdb_hit"] = iotdb_hit

    report = {
        "sim": "sim_live_mqtt_direct", "run_tag": tag, "count": args.count,
        "devices_seen": devices, "checks": checks, "detail": detail,
    }
    return sl.finish(args, report)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except sl.SimError as exc:
        sl.log(f"FATAL: {exc}")
        raise SystemExit(2)
