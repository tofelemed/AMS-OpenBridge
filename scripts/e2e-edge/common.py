"""Shared helpers for edge E2E tests."""
from __future__ import annotations

import base64
import json
import re
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

import requests

import config as cfg

# Windows consoles often default to cp1252; avoid UnicodeEncodeError on log output.
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def _ascii(msg: str) -> str:
    return (
        msg.replace("\u2192", "->")
        .replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u2026", "...")
    )


@dataclass
class StepResult:
    name: str
    passed: bool
    detail: str = ""
    data: dict[str, Any] = field(default_factory=dict)


def log(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {_ascii(msg)}", flush=True)


def ok(name: str, detail: str = "", **data: Any) -> StepResult:
    log(f"  PASS  {name} - {detail}")
    return StepResult(name, True, detail, dict(data))


def fail(name: str, detail: str = "", **data: Any) -> StepResult:
    log(f"  FAIL  {name} - {detail}")
    return StepResult(name, False, detail, dict(data))


def wait_until(
    label: str,
    predicate: Callable[[], bool],
    timeout_sec: float,
    interval_sec: float | None = None,
) -> bool:
    interval = interval_sec or cfg.POLL_INTERVAL_SEC
    deadline = time.time() + timeout_sec
    log(f"Waiting up to {timeout_sec:.0f}s for {label}...")
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return False


def iotdb_auth_header() -> dict[str, str]:
    token = base64.b64encode(f"{cfg.IOTDB_USER}:{cfg.IOTDB_PASS}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def iotdb_query(sql: str, timeout: int = 30) -> dict[str, Any]:
    url = f"{cfg.IOTDB_REST.rstrip('/')}/rest/v2/query"
    resp = requests.post(
        url,
        json={"sql": sql},
        headers={**iotdb_auth_header(), "Content-Type": "application/json"},
        timeout=timeout,
    )
    resp.raise_for_status()
    return resp.json()


def bff_get(path: str, **params: Any) -> requests.Response:
    url = f"{cfg.BFF_BASE.rstrip('/')}{path}"
    return requests.get(url, params=params, timeout=30)


def api_get(path: str, token: str = "anonymous-token") -> requests.Response:
    url = f"{cfg.API_BASE.rstrip('/')}{path}"
    return requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=30)


def sanitize_iotdb_alarm_id(alarm_id: str) -> str:
    """Match IoTDBPersistenceJob.parseToRow path sanitisation (alnum + underscore only)."""
    return re.sub(r"[^a-zA-Z0-9_]", "_", alarm_id)


def iotdb_alarm_path(alarm_id: str) -> str:
    return f"root.ams.site1.alarms.{sanitize_iotdb_alarm_id(alarm_id)}"


def make_alarm_id(run_id: str, idx: int) -> str:
    return f"{cfg.TEST_PREFIX}-{run_id}-alarm-{idx:03d}"


def make_raw_alarm(
    alarm_id: str,
    source_name: str,
    condition_name: str = "High",
    *,
    state: str = "ACTIVE",
    priority: str = "HIGH",
    severity: int = 700,
) -> dict[str, Any]:
    now_ms = int(time.time() * 1000)
    return {
        "schemaVersion": 2,
        "eventType": "RAW_ALARM_EVENT",
        "eventId": str(uuid.uuid4()),
        "alarmId": alarm_id,
        "serverId": cfg.TEST_SERVER_ID,
        "serverName": "E2E Test Server",
        "opcEventType": 4,
        "sourceName": source_name,
        "conditionName": condition_name,
        "subConditionName": "High",
        "message": f"E2E synthetic alarm — {source_name}/{condition_name}",
        "severity": severity,
        "priority": priority,
        "state": state,
        "conditionActive": state != "CLEARED",
        "acknowledged": False,
        "ackRequired": True,
        "eventTimeEpochMs": now_ms,
        "activeTimeEpochMs": now_ms,
        "serverReceivedMs": now_ms,
        "eventCategory": 1,
        "quality": 192,
        "cookieOffset": 1,
        "ingestionId": str(uuid.uuid4()),
        "sequenceNumber": 1,
    }


def make_current_state_upsert(raw: dict[str, Any]) -> dict[str, Any]:
    """ALARM_STATE_UPSERT envelope (Flink → traverse.alarm.current-alarm-state)."""
    now_ms = int(time.time() * 1000)
    return {
        "schemaVersion": 1,
        "eventType": "ALARM_STATE_UPSERT",
        "eventId": f"{raw['alarmId']}:{raw['eventTimeEpochMs']}",
        "alarmId": raw["alarmId"],
        "serverId": raw["serverId"],
        "sourceName": raw["sourceName"],
        "conditionName": raw["conditionName"],
        "subConditionName": raw.get("subConditionName", "High"),
        "message": raw["message"],
        "severity": raw["severity"],
        "priority": raw["priority"],
        "category": "PROCESS",
        "alarmEventKind": "CONDITION",
        "conditionActive": raw["conditionActive"],
        "acknowledged": raw["acknowledged"],
        "quality": 192,
        "eventTimeEpochMs": raw["eventTimeEpochMs"],
        "activeTimeEpochMs": raw["activeTimeEpochMs"],
        "serverReceivedEpochMs": now_ms,
        "cookieOffset": raw.get("cookieOffset", 1),
    }


def kafka_producer():
    from confluent_kafka import Producer

    return Producer(
        {
            "bootstrap.servers": cfg.KAFKA_BOOTSTRAP,
            "linger.ms": 5,
            "acks": "all",
        }
    )


def _kafka_publish_docker(topic: str, key: str, payload: dict[str, Any]) -> None:
    import subprocess

    line = json.dumps(payload)
    cmd = [
        "docker",
        "exec",
        "-i",
        cfg.KAFKA_DOCKER_CONTAINER,
        "kafka-console-producer",
        "--bootstrap-server",
        "localhost:9092",
        "--topic",
        topic,
    ]
    proc = subprocess.run(cmd, input=line.encode("utf-8"), capture_output=True, timeout=30)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", errors="replace") or f"exit {proc.returncode}")


def _kafka_consume_docker(topic: str, timeout_sec: float, contains: str | None) -> list[str]:
    import subprocess

    cmd = [
        "docker",
        "exec",
        cfg.KAFKA_DOCKER_CONTAINER,
        "kafka-console-consumer",
        "--bootstrap-server",
        "localhost:9092",
        "--topic",
        topic,
        "--from-beginning",
        "--max-messages",
        "50",
        "--timeout-ms",
        str(int(timeout_sec * 1000)),
    ]
    proc = subprocess.run(cmd, capture_output=True, timeout=timeout_sec + 30)
    text = proc.stdout.decode("utf-8", errors="replace")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip().startswith("{")]
    if contains:
        lines = [ln for ln in lines if contains in ln]
    return lines


def _host_kafka_works() -> bool:
    try:
        from confluent_kafka.admin import AdminClient

        admin = AdminClient({"bootstrap.servers": cfg.KAFKA_BOOTSTRAP})
        admin.list_topics(timeout=5)
        return True
    except Exception:
        return False


def _use_docker_kafka() -> bool:
    mode = cfg.KAFKA_VIA_DOCKER.lower()
    if mode == "true":
        return True
    if mode == "false":
        return False
    return not _host_kafka_works()


def kafka_publish(topic: str, key: str, payload: dict[str, Any]) -> None:
    if _use_docker_kafka():
        _kafka_publish_docker(topic, key, payload)
        return
    producer = kafka_producer()
    data = json.dumps(payload).encode("utf-8")

    def _acked(err, msg):
        if err:
            raise RuntimeError(f"Kafka delivery failed: {err}")

    producer.produce(topic, key=key, value=data, callback=_acked)
    producer.flush(15)


def kafka_consume_latest(topic: str, timeout_sec: float = 10.0, contains: str | None = None) -> list[str]:
    if _use_docker_kafka():
        return _kafka_consume_docker(topic, timeout_sec, contains)

    from confluent_kafka import Consumer, KafkaError

    consumer = Consumer(
        {
            "bootstrap.servers": cfg.KAFKA_BOOTSTRAP,
            "group.id": f"e2e-edge-{uuid.uuid4()}",
            "auto.offset.reset": "latest",
            "enable.auto.commit": False,
        }
    )
    consumer.subscribe([topic])
    deadline = time.time() + timeout_sec
    messages: list[str] = []
    try:
        while time.time() < deadline:
            msg = consumer.poll(1.0)
            if msg is None:
                continue
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                raise RuntimeError(str(msg.error()))
            text = msg.value().decode("utf-8")
            if contains is None or contains in text:
                messages.append(text)
    finally:
        consumer.close()
    return messages


def exit_code(results: list[StepResult]) -> int:
    failed = [r for r in results if not r.passed]
    if failed:
        log(f"\n{len(failed)} step(s) FAILED")
        return 1
    log("\nAll steps PASSED")
    return 0


def print_banner(title: str) -> None:
    print("\n" + "=" * 60, flush=True)
    print(f"  {_ascii(title)}", flush=True)
    print("=" * 60, flush=True)


def die(msg: str, code: int = 1) -> None:
    log(f"ERROR: {msg}")
    sys.exit(code)
