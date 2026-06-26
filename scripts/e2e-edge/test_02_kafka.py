#!/usr/bin/env python3
"""Test 02 — Kafka publish + consume verification."""
from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import config as cfg
from common import fail, kafka_consume_latest, kafka_publish, make_raw_alarm, ok, print_banner


def run(run_id: str | None = None) -> list:
    print_banner("Test 02 — Kafka Publish / Consume")
    results = []
    run_id = run_id or uuid.uuid4().hex[:8]
    alarm_id = f"{cfg.TEST_PREFIX}-kafka-{run_id}"
    source = f"{cfg.TEST_PREFIX}.KafkaProbe.{run_id}"

    payload = make_raw_alarm(alarm_id, source, "Probe")
    try:
        kafka_publish(cfg.TOPIC_RAW_ALARMS, key=alarm_id, payload=payload)
        results.append(ok("Kafka publish raw-alarms", alarm_id))
    except Exception as exc:
        results.append(fail("Kafka publish raw-alarms", str(exc)))
        return results

    msgs = kafka_consume_latest(cfg.TOPIC_RAW_ALARMS, timeout_sec=15.0, contains=alarm_id)
    if msgs:
        results.append(ok("Kafka consume raw-alarms", f"found message with {alarm_id}"))
    else:
        results.append(
            fail(
                "Kafka consume raw-alarms",
                "no matching message in 15s (consumer may need more time or job lag)",
            )
        )

    # live.alarms — optional, may take longer via Flink chain
    live = kafka_consume_latest(cfg.TOPIC_LIVE_ALARMS, timeout_sec=5.0)
    if live:
        results.append(ok("Kafka live.alarms activity", f"{len(live)} recent message(s)"))
    else:
        from common import log
        log("  INFO  live.alarms — no recent msgs yet (expected before full pipeline propagates)")

    return results


if __name__ == "__main__":
    from common import exit_code

    raise SystemExit(exit_code(run()))
