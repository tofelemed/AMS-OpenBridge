#!/usr/bin/env python3
"""OT gateway stand-in: publishes the real HDPE hierarchy to the lab MQTT broker.

Topic:   OT/HDPE/<FCS>/<class>/<loop>/PIDParams/<PARAM>   (8 params per loop)
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
import json
import math
import os
import random
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

# The lab plant: 4 loops meant to be registered + 1 deliberately unregistered.
LOOPS = [
    # (fcs,       process_class,  loop_tag,   base_pv, sp)
    ("FCS0101", "Flow",         "FIC10302", 60.0, 63.0),
    ("FCS0101", "Flow",         "FIC10405", 40.0, 41.0),
    ("FCS0101", "Pressure",     "PIC10201", 12.0, 12.5),
    ("FCS0101", "Temperature",  "TIC10101", 180.0, 182.0),
    ("FCS0101", "Flow",         "FIC99999", 10.0, 10.0),  # NOT registered -> proves parking
]
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
    args = ap.parse_args()

    client = mqtt.Client(client_id="sim-ot-gateway")
    client.username_pw_set(args.username, args.password)
    client.connect(args.host, args.port, keepalive=30)
    client.loop_start()
    print(f"[sim-ot-gateway] publishing to mqtt://{args.host}:{args.port} "
          f"({len(LOOPS)} loops, every {args.interval}s)", flush=True)

    start = time.time()
    published = 0
    last_tuning = -TUNING_PERIOD_S
    try:
        while args.minutes <= 0 or time.time() - start < args.minutes * 60:
            t = time.time() - start
            send_tuning = t - last_tuning >= TUNING_PERIOD_S
            for fcs, cls, loop, base, sp in LOOPS:
                pv = base + 2.0 * math.sin(t / 30.0) + random.gauss(0, 0.2)
                op = 30.0 + 5.0 * math.sin(t / 45.0) + random.gauss(0, 0.5)
                fast = {"PV": (pv, ""), "SP": (sp, ""), "OP": (op, "%"), "MODE": (4.0, "")}
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
