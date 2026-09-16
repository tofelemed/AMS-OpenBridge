"""Lab publisher that gives ONE registered loop a frozen PV and an OP pinned at its low limit
(v2.5 1G.3 / 1D.3 verification aid).

Why it exists: the long job emits per-gate evidence artifacts only for windows that CONTAIN a
G10 limit-dwell or a G11 freeze episode (evidence/LongEvidence). A lab whose simulated loops
never freeze or saturate therefore never exercises the evidence path (topic -> cplm-api
evidence consumer -> checksum-verified COMPLETE manifest). Run this for a few minutes against
the OT test broker while an MQTT_LOOP_SAMPLES data source is active (e.g. the one
scripts/test-ot-loop-ingestion-e2e.ps1 -KeepConfig leaves behind), then:

  * within ~2 min the Condition Engine opens FREEZE / LIMIT_LOW for the loop
    (GET /api/v1/cpm/loops/<loop>/conditions),
  * at the long job's next 15-minute evaluation the 4h/12h/24h rows carry freeze_events /
    dwell_events and evidence lands: analytics.evidence_manifest readiness = COMPLETE.

Same topic / envelope as ams-sims/sim_ot_gateway_mqtt.py (OT/HDPE/{fcs}/{cls}/{loop}/PIDParams/{item}).

  python scripts/sim/loop_freeze_sim.py --loop FIC10301 --minutes 5
"""
import argparse
import json
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


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--loop", default="FIC10301")
    ap.add_argument("--fcs", default=None, help="FCS segment of the topic (default: the loop id, as the registry import derives it)")
    ap.add_argument("--cls", default=None, help="class segment (default from the loop-type prefix: FIC->Flow, PIC->Pressure, ...)")
    ap.add_argument("--pv", type=float, default=61.5, help="frozen PV value (constant -> G11 freeze after freezeDwellS)")
    ap.add_argument("--sp", type=float, default=63.5)
    ap.add_argument("--op", type=float, default=0.0, help="OP value; 0.0 sits at the low limit -> G10 dwell")
    ap.add_argument("--mode", type=float, default=1.0, help="1=AUT")
    ap.add_argument("--interval", type=float, default=1.0)
    ap.add_argument("--minutes", type=float, default=5.0)
    ap.add_argument("--host", default=os.environ.get("SIM_OT_MQTT_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("SIM_OT_MQTT_PORT", "1884")))
    ap.add_argument("--username", default=os.environ.get("SIM_OT_MQTT_USERNAME", "ams_ingest"))
    ap.add_argument("--password", default=os.environ.get("SIM_OT_MQTT_PASSWORD", "ams-ingest-test"))
    args = ap.parse_args(argv)

    loop = args.loop.strip().upper()
    fcs = args.fcs or loop
    cls = args.cls or TYPE_CLASS.get(loop[:3], "Flow")
    client = mqtt.Client(client_id=f"sim-loop-freeze-{loop}")
    client.username_pw_set(args.username, args.password)
    client.connect(args.host, args.port, keepalive=30)
    client.loop_start()
    items = {"PV": (args.pv, ""), "SP": (args.sp, ""), "OP": (args.op, "%"), "MODE": (args.mode, "")}
    deadline = time.time() + args.minutes * 60.0
    n = 0
    print(f"freezing {loop}: PV={args.pv} SP={args.sp} OP={args.op} MODE={args.mode} on OT/HDPE/{fcs}/{cls}/{loop}/PIDParams/* "
          f"every {args.interval}s for {args.minutes} min", flush=True)
    try:
        while time.time() < deadline:
            for item, (value, unit) in items.items():
                client.publish(f"OT/HDPE/{fcs}/{cls}/{loop}/PIDParams/{item}", envelope(fcs, cls, loop, item, value, unit), qos=1)
            n += 1
            if n % 30 == 0:
                print(f"  {n} ticks published", flush=True)
            time.sleep(args.interval)
    finally:
        client.loop_stop()
        client.disconnect()
    print(f"done: {n} ticks", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
