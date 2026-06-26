#!/usr/bin/env python3
"""Test 01 — Infrastructure health checks."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import requests

import config as cfg
from common import _use_docker_kafka, fail, ok, print_banner


def run() -> list:
    print_banner("Test 01 — Infrastructure Health")
    results = []

    checks = [
        ("AMS API", f"{cfg.API_BASE}/health"),
        ("Historian BFF", f"{cfg.BFF_BASE}/health"),
        ("Historian BFF (nginx)", f"{cfg.BFF_VIA_NGINX.rstrip('/')}/health"),
        ("Frontend", cfg.FRONTEND),
        ("Prometheus", f"{cfg.PROMETHEUS}/-/healthy"),
    ]

    for name, url in checks:
        try:
            resp = requests.get(url, timeout=15)
            if resp.status_code in (200, 503):
                results.append(ok(name, f"HTTP {resp.status_code}"))
            else:
                results.append(fail(name, f"HTTP {resp.status_code}"))
        except Exception as exc:
            results.append(fail(name, str(exc)))

    # IoTDB REST
    try:
        from common import iotdb_query

        iotdb_query("SHOW VERSION")
        results.append(ok("IoTDB REST", "SHOW VERSION OK"))
    except Exception as exc:
        results.append(fail("IoTDB REST", str(exc)))

    # Kafka topics — via docker exec (reliable from host when advertised listeners use internal names)
    try:
        if _use_docker_kafka():
            proc = __import__("subprocess").run(
                ["docker", "exec", cfg.KAFKA_DOCKER_CONTAINER, "kafka-topics", "--bootstrap-server", "localhost:9092", "--list"],
                capture_output=True,
                timeout=20,
                text=True,
            )
            if proc.returncode != 0:
                raise RuntimeError(proc.stderr)
            topics = set(proc.stdout.strip().splitlines())
        else:
            from confluent_kafka.admin import AdminClient

            admin = AdminClient({"bootstrap.servers": cfg.KAFKA_BOOTSTRAP})
            meta = admin.list_topics(timeout=10)
            topics = set(meta.topics.keys())
        needed = {cfg.TOPIC_RAW_ALARMS, cfg.TOPIC_CURRENT_STATE, cfg.TOPIC_LIVE_ALARMS}
        missing = needed - topics
        if missing:
            results.append(fail("Kafka topics", f"missing: {', '.join(sorted(missing))}"))
        else:
            results.append(ok("Kafka topics", f"{len(topics)} topics, core pipeline present"))
    except Exception as exc:
        results.append(fail("Kafka", str(exc)))

    return results


if __name__ == "__main__":
    from common import exit_code

    raise SystemExit(exit_code(run()))
