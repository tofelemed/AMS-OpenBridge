"""Shared helpers for the ams-sims pipeline-validation suite.

Conventions (mirrors scripts/e2e-edge, extended for this suite):
- Kafka access is via `docker exec ams-kafka` console tools. The host-published
  9093 listener advertises an empty host (pipeline.md PIPE-001) so host clients
  cannot use it; the console tools inside the broker container always work and,
  critically, `kafka-console-producer --property parse.key=true` lets us key
  every record (compacted topics reject null-key records — see
  docs/alarm-history-flink-sink-stuck.md).
- Keys/values are separated by a TAB on the console-producer/consumer wire
  (JSON values never contain raw tabs; keys must not either).
- Every simulator: `--count`, `--interval`, `--run-tag`, `--group-id-suffix`,
  `--report`, exits non-zero on Kafka connection failure (fail loudly), and
  prints a machine-parseable JSON summary to stdout as its last line.
"""
from __future__ import annotations

import argparse
import base64
import json
import subprocess
import sys
import time
import uuid
from datetime import datetime
from typing import Any, Callable, Iterable

import requests

# ── endpoints (env-overridable to match e2e-edge style) ──────────────────────
import os

KAFKA_CONTAINER = os.getenv("SIM_KAFKA_CONTAINER", "ams-kafka")
KAFKA_BOOTSTRAP = os.getenv("SIM_KAFKA_BOOTSTRAP", "localhost:9092")  # inside container
POSTGRES_CONTAINER = os.getenv("SIM_PG_CONTAINER", "ams-postgres")
# snapshots live on the CONTRACT tier (edge node REDIS_HOST=redis-contract),
# not the general-purpose ams-redis (Plan 05 split)
REDIS_CONTAINER = os.getenv("SIM_REDIS_CONTAINER", "ams-redis-contract")
PG_USER = os.getenv("SIM_PG_USER", "ams_user")
# 127.0.0.1, NOT localhost: Python resolves localhost to ::1 first and the
# Docker-published ports black-hole IPv6 connects (each new connection then
# burns the whole connect timeout before falling back, or hangs outright).
GATEWAY = os.getenv("SIM_GATEWAY", "http://127.0.0.1:8081")
FLINK_UI = os.getenv("SIM_FLINK_UI", "http://127.0.0.1:8082")
IOTDB_REST = os.getenv("SIM_IOTDB_REST", "http://127.0.0.1:8181")
IOTDB_USER = os.getenv("SIM_IOTDB_USER", "root")
IOTDB_PASS = os.getenv("SIM_IOTDB_PASS", "root")
ADMIN_USER = os.getenv("SIM_ADMIN_USER", "admin")
ADMIN_PASS = os.getenv("SIM_ADMIN_PASS", "ChangeMe123!")
SERVICE_KEY = os.getenv("SIM_SERVICE_KEY", "traverse-internal-dev-key")
MQTT_HOST = os.getenv("SIM_MQTT_HOST", "127.0.0.1")
MQTT_PORT = int(os.getenv("SIM_MQTT_PORT", "1883"))
MQTT_USERNAME = os.getenv("SIM_MQTT_USERNAME", "ams_edge")
MQTT_PASSWORD = os.getenv("SIM_MQTT_PASSWORD", "changeme_edge")
SPARKPLUG_GROUP = os.getenv("SIM_SPARKPLUG_GROUP", "ams_site1")
SPARKPLUG_EDGE = os.getenv("SIM_SPARKPLUG_EDGE", "ams_edge1")
# CRITICAL: must be a valid GUID — NormalizedAlarmIngestor drops non-GUID serverIds.
SERVER_ID = os.getenv("SIM_SERVER_ID", "f0af9a6d-85f6-4c9f-a8ad-6de277d1d110")

SEP = "\t"


class SimError(RuntimeError):
    pass


# ── console / logging ────────────────────────────────────────────────────────
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def banner(title: str) -> None:
    print("\n" + "=" * 64, flush=True)
    print(f"  {title}", flush=True)
    print("=" * 64, flush=True)


def wait_until(label: str, predicate: Callable[[], bool], timeout_sec: float,
               interval_sec: float = 3.0) -> bool:
    deadline = time.time() + timeout_sec
    log(f"waiting up to {timeout_sec:.0f}s for: {label}")
    while time.time() < deadline:
        try:
            if predicate():
                return True
        except Exception as exc:  # transient check errors are not fatal
            log(f"  (check error, retrying: {exc})")
        time.sleep(interval_sec)
    return False


# ── subprocess ───────────────────────────────────────────────────────────────
def run(cmd: list[str], *, stdin: bytes | None = None, timeout: float = 120,
        check: bool = True, retries: int = 0) -> subprocess.CompletedProcess:
    """retries: for READ-ONLY commands only — docker exec on Windows fails
    transiently under concurrent load; retried calls must be idempotent."""
    attempt = 0
    while True:
        proc = subprocess.run(cmd, input=stdin, capture_output=True, timeout=timeout)
        if proc.returncode == 0 or not check:
            return proc
        attempt += 1
        if attempt > retries:
            err = proc.stderr.decode("utf-8", errors="replace")[-2000:]
            raise SimError(f"command failed rc={proc.returncode}: {' '.join(cmd[:6])}…\n{err}")
        time.sleep(2 * attempt)


# ── Kafka (docker exec) ──────────────────────────────────────────────────────
def kafka_publish_batch(topic: str, records: Iterable[tuple[str, dict]],
                        interval: float = 0.0) -> int:
    """Publish keyed records. interval>0 paces line-by-line (single producer)."""
    cmd = [
        "docker", "exec", "-i", KAFKA_CONTAINER,
        "kafka-console-producer", "--bootstrap-server", KAFKA_BOOTSTRAP,
        "--topic", topic,
        "--property", "parse.key=true",
        "--property", f"key.separator={SEP}",
        "--request-required-acks", "all",
    ]
    records = list(records)
    lines = []
    for key, payload in records:
        if SEP in key:
            raise SimError(f"key contains separator: {key!r}")
        lines.append(f"{key}{SEP}{json.dumps(payload, separators=(',', ':'))}")

    if interval <= 0:
        data = ("\n".join(lines) + "\n").encode("utf-8")
        run(cmd, stdin=data, timeout=max(120, len(lines) * 0.05 + 60))
        return len(lines)

    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        assert proc.stdin is not None
        for i, line in enumerate(lines):
            proc.stdin.write((line + "\n").encode("utf-8"))
            proc.stdin.flush()
            if i < len(lines) - 1:
                time.sleep(interval)
        proc.stdin.close()
        rc = proc.wait(timeout=60)
        if rc != 0:
            err = (proc.stderr.read() if proc.stderr else b"").decode("utf-8", "replace")[-2000:]
            raise SimError(f"kafka-console-producer rc={rc}: {err}")
    finally:
        if proc.poll() is None:
            proc.kill()
    return len(lines)


def kafka_end_offset_sum(topic: str) -> int:
    proc = run([
        "docker", "exec", KAFKA_CONTAINER, "kafka-run-class",
        "kafka.tools.GetOffsetShell", "--broker-list", KAFKA_BOOTSTRAP,
        "--topic", topic,
    ], timeout=60, retries=2)
    total = 0
    for ln in proc.stdout.decode("utf-8", "replace").splitlines():
        parts = ln.strip().split(":")
        if len(parts) == 3 and parts[0] == topic:
            try:
                total += int(parts[2])
            except ValueError:
                pass
    return total


def kafka_consume(topic: str, *, max_messages: int = 200, timeout_sec: float = 15,
                  from_beginning: bool = True, contains: str | None = None,
                  group: str | None = None) -> list[tuple[str | None, str]]:
    """Consume (key, value) pairs; filters client-side on `contains`."""
    cmd = [
        "docker", "exec", KAFKA_CONTAINER,
        "kafka-console-consumer", "--bootstrap-server", KAFKA_BOOTSTRAP,
        "--topic", topic,
        "--max-messages", str(max_messages),
        "--timeout-ms", str(int(timeout_sec * 1000)),
        "--property", "print.key=true",
        "--property", f"key.separator={SEP}",
    ]
    if from_beginning:
        cmd.append("--from-beginning")
    if group:
        cmd += ["--group", group]
    proc = run(cmd, timeout=timeout_sec + 45, check=False)  # rc!=0 on timeout is fine
    out: list[tuple[str | None, str]] = []
    for ln in proc.stdout.decode("utf-8", "replace").splitlines():
        if SEP in ln:
            k, v = ln.split(SEP, 1)
        else:
            k, v = None, ln
        if not v.strip():
            continue
        if contains is None or contains in ln:
            out.append((k if k not in ("", "null") else None, v))
    return out


def kafka_check_connectivity() -> None:
    """Fail loudly (SimError) if the broker is unreachable."""
    try:
        proc = run([
            "docker", "exec", KAFKA_CONTAINER, "kafka-broker-api-versions",
            "--bootstrap-server", KAFKA_BOOTSTRAP,
        ], timeout=30)
        if not proc.stdout:
            raise SimError("kafka-broker-api-versions returned no output")
    except Exception as exc:
        raise SimError(f"Kafka connectivity check failed: {exc}") from exc


# ── Flink REST ───────────────────────────────────────────────────────────────
def flink_jobs() -> list[dict]:
    return requests.get(f"{FLINK_UI}/jobs/overview", timeout=15).json()["jobs"]


def flink_job_id(name: str, state: str = "RUNNING") -> str | None:
    for j in flink_jobs():
        if j["name"] == name and j["state"] == state:
            return j["jid"]
    return None


def flink_vertices(jid: str) -> list[dict]:
    data = requests.get(f"{FLINK_UI}/jobs/{jid}", timeout=15).json()
    return [
        {
            "name": v["name"],
            "read": v.get("metrics", {}).get("read-records"),
            "write": v.get("metrics", {}).get("write-records"),
        }
        for v in data.get("vertices", [])
    ]


def flink_checkpoints(jid: str) -> dict:
    c = requests.get(f"{FLINK_UI}/jobs/{jid}/checkpoints", timeout=15).json()
    return c.get("counts", {})


# ── Postgres / Redis / IoTDB ────────────────────────────────────────────────
def pg_query(sql: str, db: str = "ams") -> list[list[str]]:
    proc = run([
        "docker", "exec", POSTGRES_CONTAINER, "psql", "-U", PG_USER, "-d", db,
        "-tA", "-F", "\x1f", "-c", sql,
    ], timeout=60, retries=2)
    rows = []
    for ln in proc.stdout.decode("utf-8", "replace").splitlines():
        if ln.strip():
            rows.append(ln.split("\x1f"))
    return rows


REDIS_PASSWORD = os.getenv("SIM_REDIS_PASSWORD", "supersecureredis123")


def redis_cli(*args: str) -> str:
    proc = run(["docker", "exec", REDIS_CONTAINER, "redis-cli",
                "-a", REDIS_PASSWORD, "--no-auth-warning", *args],
               timeout=30, retries=2)
    return proc.stdout.decode("utf-8", "replace").strip()


def iotdb_query(sql: str, timeout: int = 30) -> dict:
    token = base64.b64encode(f"{IOTDB_USER}:{IOTDB_PASS}".encode()).decode()
    resp = requests.post(
        f"{IOTDB_REST}/rest/v2/query",
        json={"sql": sql},
        headers={"Authorization": f"Basic {token}", "Content-Type": "application/json"},
        timeout=timeout,
    )
    resp.raise_for_status()
    return resp.json()


# ── Gateway API ──────────────────────────────────────────────────────────────
def login(username: str = ADMIN_USER, password: str = ADMIN_PASS) -> str:
    r = requests.post(f"{GATEWAY}/api/auth/login",
                      json={"username": username, "password": password}, timeout=20)
    if r.status_code != 200:
        raise SimError(f"login failed HTTP {r.status_code}: {r.text[:200]}")
    token = r.json().get("token")
    if not token:
        raise SimError(f"login returned no token: {r.text[:200]}")
    return token


def api(method: str, path: str, token: str | None = None, *,
        service_key: bool = False, **kwargs) -> requests.Response:
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if service_key:
        headers["X-Service-Key"] = SERVICE_KEY
    return requests.request(method, f"{GATEWAY}{path}", headers=headers,
                            timeout=kwargs.pop("timeout", 30), **kwargs)


# ── payload factories ────────────────────────────────────────────────────────
def severity_to_priority(severity: int) -> str:
    if severity >= 900:
        return "CRITICAL"
    if severity >= 700:
        return "HIGH"
    if severity >= 400:
        return "MEDIUM"
    return "LOW"


def make_raw_alarm(alarm_id: str, source_name: str, condition_name: str = "High",
                   *, state: str = "ACTIVE", severity: int = 700,
                   sub_condition: str = "High", message: str | None = None,
                   include_priority: bool = True) -> dict:
    now_ms = int(time.time() * 1000)
    payload = {
        "schemaVersion": 2,
        "eventType": "RAW_ALARM_EVENT",
        "eventId": str(uuid.uuid4()),
        "alarmId": alarm_id,
        "serverId": SERVER_ID,
        "serverName": "ams-sims synthetic feed",
        "opcEventType": 4,
        "sourceName": source_name,
        "conditionName": condition_name,
        "subConditionName": sub_condition,
        "message": message or f"ams-sims synthetic alarm - {source_name}/{condition_name}",
        "severity": severity,
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
    if include_priority:
        payload["priority"] = severity_to_priority(severity)
    return payload


def make_loop_sample(loop_id: str, *, event_ts_ms: int | None = None, pv: float,
                     sp: float, op: float, vp: float | None = None,
                     mode: str = "AUTO", quality: str = "GOOD") -> dict:
    payload = {
        "loop_id": loop_id,
        "event_ts_ms": event_ts_ms or int(time.time() * 1000),
        "pv": pv, "sp": sp, "op": op,
        "mode": mode, "quality": quality,
    }
    if vp is not None:
        payload["vp"] = vp
    return payload


# ── CLI plumbing ─────────────────────────────────────────────────────────────
def base_parser(desc: str, *, default_count: int = 10,
                default_interval: float = 0.5) -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=desc)
    p.add_argument("--count", type=int, default=default_count,
                   help=f"number of synthetic records (default {default_count})")
    p.add_argument("--interval", type=float, default=default_interval,
                   help=f"seconds between records (default {default_interval})")
    p.add_argument("--run-tag", default=uuid.uuid4().hex[:8],
                   help="unique tag embedded in ids (default: random)")
    p.add_argument("--group-id-suffix", default=uuid.uuid4().hex[:6],
                   help="suffix for any consumer group ids (ephemeral per run)")
    p.add_argument("--report", default=None,
                   help="also write the JSON summary to this file")
    return p


def finish(args, report: dict) -> int:
    """Print machine-parseable summary (last stdout line) and return exit code."""
    report.setdefault("finished_utc", datetime.utcnow().isoformat() + "Z")
    text = json.dumps(report, indent=2, default=str)
    if args.report:
        from pathlib import Path as _P
        _P(args.report).parent.mkdir(parents=True, exist_ok=True)
        with open(args.report, "w", encoding="utf-8") as fh:
            fh.write(text)
        log(f"report written to {args.report}")
    checks = report.get("checks", {})
    failed = [k for k, v in checks.items() if v is False]
    print("SUMMARY_JSON " + json.dumps(report, separators=(",", ":"), default=str),
          flush=True)
    if failed:
        log(f"FAILED checks: {', '.join(failed)}")
        return 1
    log("all checks passed")
    return 0
