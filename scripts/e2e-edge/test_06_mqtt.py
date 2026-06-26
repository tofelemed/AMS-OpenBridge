#!/usr/bin/env python3
"""Test 06 — MQTT Sparkplug B DDATA from EMQX."""
from __future__ import annotations

import json
import sys
import threading
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import config as cfg
from common import fail, log, ok, print_banner, wait_until


def run(run_id: str) -> list:
    print_banner(f"Test 06 — MQTT Sparkplug B  run={run_id}")
    results = []

    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        results.append(fail("paho-mqtt", "not installed — pip install -r requirements.txt"))
        return results

    received: list[str] = []
    connected = threading.Event()

    topic = f"spBv1.0/{cfg.SPARKPLUG_GROUP}/DDATA/{cfg.SPARKPLUG_EDGE}/#"

    def on_connect(client, userdata, flags, reason_code, properties=None):
        if reason_code == 0:
            connected.set()
            client.subscribe(topic, qos=0)
            log(f"MQTT subscribed → {topic}")
        else:
            log(f"MQTT connect failed: {reason_code}")

    def on_message(client, userdata, msg):
        received.append(msg.topic)
        log(f"  MQTT msg: {msg.topic} ({len(msg.payload)} bytes)")

    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"e2e-edge-{uuid.uuid4().hex[:8]}",
        protocol=mqtt.MQTTv311,
    )
    client.on_connect = on_connect
    client.on_message = on_message

    try:
        client.connect(cfg.MQTT_HOST, cfg.MQTT_PORT, keepalive=30)
        client.loop_start()
    except Exception as exc:
        results.append(fail("MQTT connect", str(exc)))
        return results

    if not connected.wait(timeout=15):
        client.loop_stop()
        results.append(fail("MQTT connect", "timeout waiting for CONNACK"))
        return results

    results.append(ok("MQTT connect", f"{cfg.MQTT_HOST}:{cfg.MQTT_PORT}{cfg.MQTT_PATH}"))

    def has_ddata() -> bool:
        return len(received) > 0

    # Wait for Sparkplug DDATA (edge node publishes on live.alarms)
    if wait_until("Sparkplug DDATA", has_ddata, cfg.WAIT_MQTT_SEC):
        results.append(ok("Sparkplug DDATA", f"{len(received)} message(s), last={received[-1]}"))
    else:
        results.append(
            fail(
                "Sparkplug DDATA",
                f"no DDATA in {cfg.WAIT_MQTT_SEC}s — check live.alarms → sparkplug-edge-node",
            )
        )

    client.loop_stop()
    client.disconnect()
    return results


if __name__ == "__main__":
    import argparse
    from common import exit_code

    p = argparse.ArgumentParser()
    p.add_argument("--run-id", required=True)
    raise SystemExit(exit_code(run(p.parse_args().run_id)))
