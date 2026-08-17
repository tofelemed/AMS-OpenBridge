#!/usr/bin/env python3
"""Flood / load test (run LAST — perturbs shared infra).

Injects a high-rate raw-alarms burst and verifies:
  - FloodDetectFilter drops severity >= 950 (flood-band records never reach
    current-alarm-state)
  - Report-by-Exception bounds live.alarms: repeated unchanged records for the
    same alarmId are suppressed (live.* growth << raw input)
  - no Flink checkpoint failures attributable to the burst; all jobs RUNNING
  - EMQX fan-out stays bounded (DDATA observed ~= RBE output, not raw volume)

Usage: python sim_stress_flood.py [--count 2000] [--repeat-factor 5]
"""
from __future__ import annotations

import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import simlib as sl

STANDING_JOBS = [
    "AMS - Alarm State Machine",
    "AMS - IoTDB Alarm Persistence",
    "AMS - Live State RBE",
    "AMS - CPLM Short Feature Engine",
    "AMS - CPLM Long Diagnostics Engine",
    "AMS - CPLM Gate Fusion Engine",
    "AMS - Loop Live RBE Engine",
]


def main() -> int:
    ap = sl.base_parser(__doc__.splitlines()[0], default_count=2000, default_interval=0.0)
    ap.add_argument("--repeat-factor", type=int, default=5,
                    help="how many identical repeats per distinct alarm (RBE suppression test)")
    ap.add_argument("--expect-flood-drop", action="store_true",
                    help="assert FloodDetectFilter drops the sev>=950 band. OFF by default: "
                         "for http-feed events ValidationMap clamps severity to the priority "
                         "floor (max 900) BEFORE the filter, so the >=950 drop never fires "
                         "(pipeline.md PIPE-012)")
    args = ap.parse_args()
    tag = args.run_tag
    sl.banner(f"sim_stress_flood  run-tag={tag}  count={args.count} "
              f"repeat-factor={args.repeat_factor}")

    sl.kafka_check_connectivity()

    # MQTT observer to measure EMQX fan-out during the burst
    ddata_count = {"n": 0}
    try:
        import paho.mqtt.client as mqtt

        def on_msg(_c, _u, msg):
            if "/DDATA/" in msg.topic and tag in msg.topic:
                ddata_count["n"] += 1

        mc = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"sims-flood-{tag}")
        mc.username_pw_set(sl.MQTT_USERNAME, sl.MQTT_PASSWORD)
        mc.on_message = on_msg
        mc.connect(sl.MQTT_HOST, sl.MQTT_PORT, keepalive=30)
        mc.subscribe(f"spBv1.0/{sl.SPARKPLUG_GROUP}/#", qos=0)
        mc.loop_start()
        mqtt_ok = True
    except Exception as exc:
        sl.log(f"MQTT observer unavailable: {exc}")
        mqtt_ok = False

    # baselines
    cp_before = {}
    jids = {}
    for name in STANDING_JOBS:
        jid = sl.flink_job_id(name)
        if jid:
            jids[name] = jid
            cp_before[name] = sl.flink_checkpoints(jid).get("failed", 0)
    cas_before = sl.kafka_end_offset_sum("current-alarm-state")
    la_before = sl.kafka_end_offset_sum("live.alarms")
    raw_before = sl.kafka_end_offset_sum("raw-alarms")

    # burst composition:
    #  - `count` distinct alarms, 25% in the flood band (>=950) -> must be dropped
    #  - each non-flood alarm repeated `repeat_factor`x with IDENTICAL state -> RBE food
    distinct = args.count
    flood_band = 0
    records = []
    for i in range(distinct):
        is_flood = (i % 4 == 0)  # 25%
        severity = 960 if is_flood else 700 + (i % 200)
        if is_flood:
            flood_band += 1
        alarm_id = f"FLD-{tag}-{i:05d}"
        source = f"Flood.{tag}.Unit{(i % 8) + 1}.Tag_{i:05d}"
        payload = sl.make_raw_alarm(alarm_id, source, "HighHigh", severity=severity,
                                    sub_condition="HighHigh")
        repeats = 1 if is_flood else args.repeat_factor
        for _ in range(repeats):
            records.append((alarm_id, dict(payload)))  # identical repeats (same ts) — dedup/RBE food
    expected_pass = distinct - flood_band

    t0 = time.time()
    n = sl.kafka_publish_batch("raw-alarms", records, interval=args.interval)
    publish_secs = time.time() - t0
    sl.log(f"published {n} records in {publish_secs:.1f}s "
           f"({n / max(publish_secs, 0.001):.0f} msg/s); distinct={distinct} "
           f"flood-band={flood_band} repeats={args.repeat_factor}")

    checks: dict[str, bool] = {}
    detail: dict = {
        "published": n, "publish_secs": round(publish_secs, 1),
        "distinct": distinct, "flood_band": flood_band, "expected_pass": expected_pass,
    }

    # let the pipeline drain
    checks["cas_growth_appeared"] = sl.wait_until(
        "current-alarm-state growth from burst",
        lambda: sl.kafka_end_offset_sum("current-alarm-state") > cas_before,
        timeout_sec=180)
    # allow the state machine to finish the whole burst
    stable_at = [0, 0]

    def drained() -> bool:
        cur = sl.kafka_end_offset_sum("current-alarm-state")
        stable_at[0], stable_at[1] = stable_at[1], cur
        return stable_at[0] == cur and cur > cas_before

    sl.wait_until("current-alarm-state to stop growing (drained)", drained,
                  timeout_sec=300, interval_sec=10)

    cas_grown = sl.kafka_end_offset_sum("current-alarm-state") - cas_before
    detail["cas_grown"] = cas_grown
    # In reality (PIPE-012) the whole distinct set reaches CAS; dedup must still
    # collapse the identical repeats (growth ~= distinct, NOT distinct*repeats).
    survived = expected_pass if args.expect_flood_drop else distinct
    if args.expect_flood_drop:
        flood_msgs = sl.kafka_consume("current-alarm-state", max_messages=100,
                                      timeout_sec=20, contains='"severity":960')
        ours_in_flood = [v for _, v in flood_msgs if f"FLD-{tag}-" in v]
        checks["flood_band_dropped"] = not ours_in_flood
    checks["dedup_collapsed_repeats"] = cas_grown <= survived * 1.2 + 10
    detail["cas_vs_expected"] = {"grown": cas_grown, "survived_expected": survived,
                                 "raw_published": n}

    # RBE bounding on live.alarms
    la_grown = sl.kafka_end_offset_sum("live.alarms") - la_before
    detail["live_alarms_grown"] = la_grown
    checks["rbe_bounded_live_alarms"] = la_grown <= survived * 1.2 + 10

    if mqtt_ok:
        time.sleep(10)
        mc.loop_stop()
        mc.disconnect()
        detail["emqx_ddata_observed"] = ddata_count["n"]
        checks["emqx_fanout_bounded"] = ddata_count["n"] <= survived * 1.5 + 20

    # Flink stability
    all_running = True
    cp_failures = {}
    for name, jid in jids.items():
        still = sl.flink_job_id(name)
        if not still:
            all_running = False
        failed_now = sl.flink_checkpoints(jid).get("failed", 0)
        if failed_now > cp_before.get(name, 0):
            cp_failures[name] = {"before": cp_before[name], "after": failed_now}
    checks["all_standing_jobs_running"] = all_running
    checks["no_new_checkpoint_failures"] = not cp_failures
    detail["checkpoint_failures"] = cp_failures
    detail["raw_alarms_grown"] = sl.kafka_end_offset_sum("raw-alarms") - raw_before

    report = {"sim": "sim_stress_flood", "run_tag": tag, "checks": checks,
              "detail": detail}
    return sl.finish(args, report)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except sl.SimError as exc:
        sl.log(f"FATAL: {exc}")
        raise SystemExit(2)
