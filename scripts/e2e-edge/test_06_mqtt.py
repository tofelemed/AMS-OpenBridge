#!/usr/bin/env python3
"""Test 06 — MQTT Sparkplug B DDATA from EMQX.

Fix history
-----------
* Previous CONNACK timeout: paho-mqtt uses raw TCP.  Connecting to the WS
  listener (8083) over raw TCP causes EMQX to close the socket immediately
  because the WebSocket upgrade handshake never happens.
  Fix: use MQTT_PORT=1883 (plain TCP) by default.
* EMQX has ALLOW_ANONYMOUS=false — we must supply username/password that match
  the sparkplug-edge-node credentials (EMQX_EDGE_USER / EMQX_EDGE_PASSWORD).
"""
from __future__ import annotations

import json
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import config as cfg
from common import fail, log, ok, print_banner, wait_until


def _feed_live_alarm(run_id: str) -> bool:
    """Publish a test alarm directly to traverse.alarm.live.alarms so edge node can emit DDATA."""
    alarm_id = f"MQTT-{run_id}-{uuid.uuid4().hex[:8]}"
    ts = int(time.time() * 1000)
    payload = {
        "alarmId": alarm_id,
        "serverId": cfg.TEST_SERVER_ID,
        "sourceName": f"MQTTTest.Unit1.{run_id}",
        "conditionName": "HighAlarm",
        "severity": 500,
        "message": f"MQTT E2E test alarm {run_id}",
        "state": "Active",
        "acknowledged": False,
        "conditionActive": True,
        "priority": "Medium",
        "rbeTs": ts,
    }
    key = alarm_id
    value = json.dumps(payload)
    
    try:
        cmd = [
            "docker", "exec", "-i", "ams-kafka",
            "kafka-console-producer",
            "--bootstrap-server", "localhost:9092",
            "--topic", "traverse.alarm.live.alarms",
            "--property", "parse.key=true",
            "--property", "key.separator=|",
        ]
        proc = subprocess.run(
            cmd,
            input=f"{key}|{value}\n",
            capture_output=True,
            text=True,
            timeout=10,
        )
        if proc.returncode == 0:
            log(f"  Fed traverse.alarm.live.alarms: {alarm_id} -> MQTTTest.Unit1.{run_id}")
            return True
        else:
            log(f"  [WARN] Failed to feed traverse.alarm.live.alarms: {proc.stderr}")
            return False
    except Exception as exc:
        log(f"  [WARN] Failed to feed traverse.alarm.live.alarms: {exc}")
        return False


def _try_connect(host: str, port: int, transport: str, username: str, password: str,
                 topic: str, received: list, connected_evt: threading.Event,
                 timeout_sec: float = 15):
    """Attempt a single paho-mqtt connect; returns the client or None on failure."""
    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        return None

    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"e2e-edge-{uuid.uuid4().hex[:8]}",
        protocol=mqtt.MQTTv311,
        transport=transport,
    )
    client.username_pw_set(username, password)

    def on_connect(cl, userdata, flags, reason_code, properties=None):
        if reason_code == 0:
            connected_evt.set()
            cl.subscribe(topic, qos=0)
            log(f"  MQTT subscribed ({transport} {host}:{port}) -> {topic}")
        else:
            log(f"  MQTT connect refused: reason={reason_code}")

    def on_message(cl, userdata, msg):
        received.append(msg.topic)
        log(f"  MQTT msg: {msg.topic} ({len(msg.payload)} bytes)")

    client.on_connect = on_connect
    client.on_message = on_message

    try:
        if transport == "websockets":
            client.connect(host, port, keepalive=30)
        else:
            client.connect(host, port, keepalive=30)
        client.loop_start()
    except Exception as exc:
        log(f"  MQTT connect error ({transport} {port}): {exc}")
        return None

    connected_evt.wait(timeout=timeout_sec)
    return client


def run(run_id: str) -> list:
    print_banner(f"Test 06 — MQTT Sparkplug B  run={run_id}")
    results = []

    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        results.append(fail("paho-mqtt", "not installed — pip install -r requirements.txt"))
        return results

    topic = f"spBv1.0/{cfg.SPARKPLUG_GROUP}/DDATA/{cfg.SPARKPLUG_EDGE}/#"
    received: list[str] = []
    connected_evt = threading.Event()

    # Attempt 1: plain TCP on port 1883 (preferred — paho native transport)
    client = _try_connect(
        cfg.MQTT_HOST, cfg.MQTT_PORT, "tcp",
        cfg.MQTT_USERNAME, cfg.MQTT_PASSWORD,
        topic, received, connected_evt, timeout_sec=15,
    )

    if not connected_evt.is_set():
        # Attempt 2: WebSocket transport on WS port (useful if TCP is firewalled)
        log(f"  Plain TCP connect to {cfg.MQTT_HOST}:{cfg.MQTT_PORT} failed — trying WebSocket {cfg.MQTT_WS_PORT}")
        if client:
            try:
                client.loop_stop()
                client.disconnect()
            except Exception:
                pass
        connected_evt.clear()
        client = _try_connect(
            cfg.MQTT_HOST, cfg.MQTT_WS_PORT, "websockets",
            cfg.MQTT_USERNAME, cfg.MQTT_PASSWORD,
            topic, received, connected_evt, timeout_sec=15,
        )

    if not connected_evt.is_set():
        if client:
            try:
                client.loop_stop()
            except Exception:
                pass
        results.append(
            fail(
                "MQTT connect",
                f"CONNACK timeout on both TCP:{cfg.MQTT_PORT} and WS:{cfg.MQTT_WS_PORT} — "
                "check EMQX is running, credentials match EMQX_EDGE_USER/EMQX_EDGE_PASSWORD, "
                "and port 1883 is exposed",
            )
        )
        return results

    results.append(ok("MQTT connect", f"{cfg.MQTT_HOST}:{cfg.MQTT_PORT}"))

    # Feed fresh data to traverse.alarm.live.alarms so edge node publishes DDATA while we're subscribed
    _feed_live_alarm(run_id)

    def has_ddata() -> bool:
        return len(received) > 0

    if wait_until("Sparkplug DDATA", has_ddata, cfg.WAIT_MQTT_SEC):
        results.append(ok("Sparkplug DDATA", f"{len(received)} message(s), last={received[-1]}"))
    else:
        results.append(
            fail(
                "Sparkplug DDATA",
                f"no DDATA in {cfg.WAIT_MQTT_SEC}s — check traverse.alarm.live.alarms topic has data "
                "and sparkplug-edge-node container is RUNNING (connects to emqx:1883 internally)",
            )
        )

    if client:
        try:
            client.loop_stop()
            client.disconnect()
        except Exception:
            pass

    return results


if __name__ == "__main__":
    import argparse
    from common import exit_code

    p = argparse.ArgumentParser()
    p.add_argument("--run-id", required=True)
    raise SystemExit(exit_code(run(p.parse_args().run_id)))
