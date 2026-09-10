#!/usr/bin/env python3
"""OT gateway stand-in: publishes the real HDPE hierarchy to the lab MQTT broker.

Topic:   OT/HDPE/<FCS>/<class>/<loop>/PIDParams/<PARAM>   (8 params per loop,
         +1 positioner feedback leaf on the loops named by --vp-loops)
Payload: the exact envelope observed on the production gateway
         (docs/ot-data-integration/08-ot-mqtt-loop-ingestion-assessment.md §1.3).

Default broker is the compose mosquitto-test service (the OT-broker stand-in):
    docker compose -f infra/docker/docker-compose.yml --profile mqtt-test up -d mosquitto-test
    python ams-sims/sim_ot_gateway_mqtt.py --minutes 30

The loop list deliberately includes UNREGISTERED FIC99999 so the pipeline's
parking/DLQ path is exercised alongside the happy path. Pilot registration
fixture: scripts/fixtures/hdpe-pilot-loops.csv (FIC99999 intentionally absent).
"""
import argparse
import csv
import json
import math
import os
import random
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

# Default lab plant: 4 loops meant to be registered + 1 deliberately unregistered.
# For the full-plant feed pass --loops-csv scripts/fixtures/hdpe-all-loops.csv
# (161 loops; FCS + class derived per row).
LOOPS = [
    # (fcs,       process_class,  loop_tag,   base_pv, sp)
    ("FCS0101", "Flow",         "FIC10302", 60.0, 63.0),
    ("FCS0101", "Flow",         "FIC10405", 40.0, 41.0),
    ("FCS0101", "Pressure",     "PIC10201", 12.0, 12.5),
    ("FCS0101", "Temperature",  "TIC10101", 180.0, 182.0),
    ("FCS0101", "Flow",         "FIC99999", 10.0, 10.0),  # NOT registered -> proves parking
]

# loop_type -> (broker class level, base_pv, sp offset) for --loops-csv rows.
TYPE_CLASS = {
    "FIC": ("Flow", 60.0, 2.0),
    "PIC": ("Pressure", 12.0, 0.5),
    "LIC": ("Level", 55.0, 1.0),
    "TIC": ("Temperature", 180.0, 2.0),
}


def load_loops_csv(path, include_unknown=True, limit=0):
    """Registry-import CSV (loop_id, loop_type, pv_ot_tag=FCS.LOOP.PV, ...) -> sim rows."""
    rng = random.Random(48)
    loops = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            loop = row["loop_id"].strip()
            if not loop:
                continue
            fcs = (row.get("pv_ot_tag") or "").split(".")[0] or "FCS0101"
            cls, base, sp_off = TYPE_CLASS.get(row.get("loop_type", "")[:3], TYPE_CLASS["FIC"])
            base = base + rng.uniform(-0.3, 0.3) * base  # spread the plant out a bit
            loops.append((fcs, cls, loop, base, base + sp_off))
    if limit and limit > 0:
        loops = loops[:limit]
    if include_unknown:
        loops.append(("FCS0101", "Flow", "FIC99999", 10.0, 10.0))
    return loops
TUNING = {"P": (300.0, "%"), "I": (240.0, "s"), "D": (0.0, "s"), "GW": (0.0, "%")}
TUNING_PERIOD_S = 30.0  # tuning params republished slowly, like a sane gateway would


def envelope(fcs, cls, loop, item, value, unit):
    return json.dumps({
        "value": value, "unit": unit, "quality": "GOOD",
        "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "source": "opc_ua", "seq": 0,
        "device": loop, "area": fcs, "line": cls, "enterprise": "",
        "site": "HDPE", "process_unit": cls, "equipment": loop, "item": item,
    })


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default=os.environ.get("SIM_OT_MQTT_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("SIM_OT_MQTT_PORT", "1884")))
    ap.add_argument("--username", default=os.environ.get("SIM_OT_MQTT_USERNAME", "ams_ingest"))
    ap.add_argument("--password", default=os.environ.get("SIM_OT_MQTT_PASSWORD", "ams-ingest-test"))
    ap.add_argument("--interval", type=float, default=1.0, help="seconds between fast-param publishes")
    ap.add_argument("--minutes", type=float, default=0.0, help="stop after N minutes (0 = run forever)")
    ap.add_argument("--loops-csv", default=None,
                    help="registry-import CSV (e.g. scripts/fixtures/hdpe-all-loops.csv) - feed every loop in it")
    ap.add_argument("--limit", type=int, default=0,
                    help="feed only the first N loops from --loops-csv (0 = all)")
    ap.add_argument("--no-unknown", action="store_true",
                    help="do not add the unregistered FIC99999 parking probe")
    # CENTUM enum (SME-confirmed 2026-09-09): 1=AUT 2=MAN 3=CAS 4=MAN IMAN.
    # Default 1 so the feed lands in the ANALYSED path — a sim pinned to 4 exercises
    # ingestion but every loop is excluded at G1, so the CPLM chain proves nothing.
    ap.add_argument("--mode", type=float, default=1.0,
                    help="MODE value to publish (1=AUT 2=MAN 3=CAS 4=IMAN); default 1")
    # Valve positioner feedback is OPTIONAL on the real plant — most loops have none.
    # Publish it for a named subset so one run proves both paths: the loop with VP
    # carries it on the tuple, the loop without it carries no vp key at all.
    ap.add_argument("--vp-loops", default="FIC10302",
                    help="loops that publish positioner feedback: comma list, 'all' or 'none' (default FIC10302)")
    ap.add_argument("--vp-item", default="VP",
                    help="leaf name for positioner feedback (default VP; use e.g. POS to rehearse a param_roles overlay)")
    args = ap.parse_args()
    vp_all = args.vp_loops.strip().lower() == "all"
    vp_loops = set() if args.vp_loops.strip().lower() in ("none", "") \
        else {x.strip().upper() for x in args.vp_loops.split(",") if x.strip()}

    loops = load_loops_csv(args.loops_csv, include_unknown=not args.no_unknown, limit=args.limit) \
        if args.loops_csv \
        else [l for l in LOOPS if not (args.no_unknown and l[2] == "FIC99999")]

    client = mqtt.Client(client_id="sim-ot-gateway")
    client.username_pw_set(args.username, args.password)
    client.connect(args.host, args.port, keepalive=30)
    client.loop_start()
    print(f"[sim-ot-gateway] publishing to mqtt://{args.host}:{args.port} "
          f"({len(loops)} loops, every {args.interval}s)", flush=True)

    start = time.time()
    published = 0
    last_tuning = -TUNING_PERIOD_S
    # audit-jobs.md Phase F: the unregistered sentinel (FIC99999) proves the
    # DLQ/parking path, but publishing it at full cadence flooded
    # traverse.ingestion.ot-dlq with 50k+ identical LOOP_NOT_REGISTERED rows,
    # burying any REAL DLQ signal. One probe every UNKNOWN_PERIOD_S keeps the
    # negative path exercised without the noise.
    UNKNOWN_PERIOD_S = 300.0
    last_unknown = -UNKNOWN_PERIOD_S
    # The t=0 probe is published before the subscriber has connected (it starts within
    # ~30 s of the config being saved), so on its own the next evidence of the parking
    # path is 5 minutes away and any test that checks sooner sees nothing. One extra
    # early probe makes the negative path observable without changing the steady rate.
    early_unknown_at = 45.0
    early_unknown_sent = False
    try:
        while args.minutes <= 0 or time.time() - start < args.minutes * 60:
            t = time.time() - start
            send_tuning = t - last_tuning >= TUNING_PERIOD_S
            send_unknown = t - last_unknown >= UNKNOWN_PERIOD_S
            if not send_unknown and not early_unknown_sent and t >= early_unknown_at:
                send_unknown = True
                early_unknown_sent = True
            elif send_unknown:
                last_unknown = t
            for fcs, cls, loop, base, sp in loops:
                if loop == "FIC99999" and not send_unknown:
                    continue
                pv = base + 2.0 * math.sin(t / 30.0) + random.gauss(0, 0.2)
                op = 30.0 + 5.0 * math.sin(t / 45.0) + random.gauss(0, 0.5)
                fast = {"PV": (pv, ""), "SP": (sp, ""), "OP": (op, "%"), "MODE": (args.mode, "")}
                if vp_all or loop.upper() in vp_loops:
                    # Positioner feedback TRACKS the output demand with a small lag and
                    # its own noise — G14 compares the two, so it must not be a copy of OP.
                    vp = op - 0.8 + 0.4 * math.sin(t / 20.0) + random.gauss(0, 0.15)
                    fast[args.vp_item] = (max(0.0, min(100.0, vp)), "%")
                for item, (value, unit) in fast.items():
                    client.publish(f"OT/HDPE/{fcs}/{cls}/{loop}/PIDParams/{item}",
                                   envelope(fcs, cls, loop, item, value, unit), qos=1)
                    published += 1
                if send_tuning:
                    for item, (value, unit) in TUNING.items():
                        client.publish(f"OT/HDPE/{fcs}/{cls}/{loop}/PIDParams/{item}",
                                       envelope(fcs, cls, loop, item, value, unit), qos=1)
                        published += 1
            if send_tuning:
                last_tuning = t
                print(f"[sim-ot-gateway] {published} messages published (t={int(t)}s)", flush=True)
            time.sleep(args.interval)
    except KeyboardInterrupt:
        pass
    finally:
        client.loop_stop()
        client.disconnect()
        print(f"[sim-ot-gateway] done — {published} messages", flush=True)


if __name__ == "__main__":
    main()
