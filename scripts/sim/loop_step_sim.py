"""Lab publisher that gives ONE registered loop a response event (v2.5 2B verification aid).

Scenarios:
  input-test   an exogenous applied-input step: OP 40 -> 45 pp held, PV follows an FOPDT path
               (Kp 3, theta 4 s, tau 20 s - the spec §2.11 example), SP constant. G12 captures an
               INPUT_TEST, estimates the FOPDT through the output-error adapter, and on the second
               event validates it against the first (run the scenario twice, ~12 min apart).
  servo-step   a reference step: SP 100 -> 110 with the loop in AUT, PV settling to 110 under a
               PI-like closed-loop response; G12 reports the servo gain and routes to PEM.
  integrating  OP 50 -> 52 on a level-like path: PV slope changes from 0.010 to 0.030 EU/min after
               12 s (spec §2.11 LIC example); G12 reports an integrating gain and NO static Kp.

Publishes on the OT test broker exactly like ams-sims/sim_ot_gateway_mqtt.py
(OT/HDPE/{fcs}/{cls}/{loop}/PIDParams/{item}); an MQTT_LOOP_SAMPLES data source must be active.
Each scenario is: pre-support (stable) -> step -> capture -> settled tail, so one run yields one event.

  python scripts/sim/loop_step_sim.py --loop FIC10302 --scenario input-test
"""
import argparse
import json
import math
import os
import sys
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

TYPE_CLASS = {"FIC": "Flow", "PIC": "Pressure", "LIC": "Level", "TIC": "Temperature"}


def envelope(fcs, cls, loop, item, value, unit):
    return json.dumps({
        "value": value, "unit": unit, "quality": "GOOD",
        "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "source": "opc_ua", "seq": 0,
        "device": loop, "area": fcs, "line": cls, "enterprise": "",
        "site": "HDPE", "process_unit": cls, "equipment": loop, "item": item,
    })


def fopdt(t, t0, y0, dy, theta, tau):
    return y0 if t < t0 + theta else y0 + dy * (1.0 - math.exp(-(t - t0 - theta) / tau))


def scenario_values(name, t, t0):
    """(pv, sp, op) at elapsed time t for a step at t0."""
    if name == "input-test":
        op = 40.0 if t < t0 else 45.0
        return fopdt(t, t0, 100.0, 15.0, 4.0, 20.0), 100.0, op
    if name == "servo-step":
        sp = 100.0 if t < t0 else 110.0
        pv = fopdt(t, t0, 100.0, 10.0, 4.0, 25.0)
        op = 40.0 + 3.3 * (pv - 100.0) / 10.0
        return pv, sp, op
    if name == "integrating":
        op = 50.0 if t < t0 else 52.0
        v0 = 0.010 / 60.0
        ki = 0.010 / 60.0                              # 0.000166667 EU/(s*pp)
        pv = 1.0 + v0 * t + ki * 2.0 * max(0.0, t - t0 - 12.0)
        return pv, 1.0, op
    raise SystemExit(f"unknown scenario {name}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--loop", default="FIC10302")
    ap.add_argument("--scenario", default="input-test", choices=["input-test", "servo-step", "integrating"])
    ap.add_argument("--fcs", default=None)
    ap.add_argument("--cls", default=None)
    ap.add_argument("--pre-s", type=float, default=150.0, help="stable pre-support before the step (s)")
    ap.add_argument("--post-s", type=float, default=330.0, help="capture + settled tail after the step (s)")
    ap.add_argument("--interval", type=float, default=5.0)
    ap.add_argument("--host", default=os.environ.get("SIM_OT_MQTT_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("SIM_OT_MQTT_PORT", "1884")))
    ap.add_argument("--username", default=os.environ.get("SIM_OT_MQTT_USERNAME", "ams_ingest"))
    ap.add_argument("--password", default=os.environ.get("SIM_OT_MQTT_PASSWORD", "ams-ingest-test"))
    args = ap.parse_args(argv)

    loop = args.loop.strip().upper()
    fcs = args.fcs or loop
    cls = args.cls or TYPE_CLASS.get(loop[:3], "Flow")
    client = mqtt.Client(client_id=f"sim-loop-step-{loop}")
    client.username_pw_set(args.username, args.password)
    client.connect(args.host, args.port, keepalive=30)
    client.loop_start()
    total = args.pre_s + args.post_s
    t0 = args.pre_s
    started = time.time()
    n = 0
    print(f"{args.scenario} on {loop}: pre {args.pre_s:.0f}s, step at t0, post {args.post_s:.0f}s, every {args.interval}s "
          f"(OT/HDPE/{fcs}/{cls}/{loop}/PIDParams/*)", flush=True)
    try:
        while True:
            t = time.time() - started
            if t > total:
                break
            pv, sp, op = scenario_values(args.scenario, t, t0)
            for item, (value, unit) in {"PV": (round(pv, 4), ""), "SP": (sp, ""), "OP": (round(op, 4), "%"), "MODE": (1.0, "")}.items():
                client.publish(f"OT/HDPE/{fcs}/{cls}/{loop}/PIDParams/{item}", envelope(fcs, cls, loop, item, value, unit), qos=1)
            n += 1
            if n % 24 == 0:
                print(f"  t={t:.0f}s pv={pv:.3f} sp={sp} op={op:.2f}", flush=True)
            time.sleep(args.interval)
    finally:
        client.loop_stop()
        client.disconnect()
    print(f"done: {n} ticks", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
