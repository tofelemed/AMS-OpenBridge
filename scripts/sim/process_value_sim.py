#!/usr/bin/env python3
"""
Process-value simulator for the AMS/Traverse HMI live-data pipeline.

Stands in for real OPC/field edge feeds. Publishes changing process values
(tank level, pump speed, valve position, temperatures, flow, running status)
for TWO sites (houston + dallas) onto Kafka `live.metrics`, from where the
sparkplug-edge-node bridges them to EMQX (Sparkplug B DDATA) + Redis snapshots,
and the HMI Designer renders them live.

Record shape (matches AlarmMetricPublisher.processMetricRecord):
    {"group","edge","device","metric","value","quality","ts","type"}

The group/edge/device/metric values follow the UNS->transport contract computed
by asset-model/Models/Asset.cs, so binding-resolver resolves the same identifiers
the display binds to. Contextual path is <site>/<unit>/<device>.<metric>;
group=<site>, edge=<site>_edge1, device=<device>, metric=<metric>.

Usage:
    python process_value_sim.py                      # continuous, both sites
    python process_value_sim.py --interval 1.0
    python process_value_sim.py --once               # one batch then exit
    python process_value_sim.py --exclude houston/crude1/tank01.level   # freeze a tag (staleness demo)
    python process_value_sim.py --bootstrap localhost:9093
"""
import argparse
import json
import math
import signal
import sys
import time

try:
    from kafka import KafkaProducer
except ImportError:
    sys.exit("kafka-python not installed. pip install kafka-python")

TOPIC = "live.metrics"

# ── 2-site plant model (must match database/scripts/15_traverse_assets_2site_plant.sql) ──
# (site, unit, device, metric, lo, hi, kind)  kind: 'wave'|'ramp'|'bool'
TAGS = [
    # houston / crude1
    ("houston", "crude1", "tank01",  "level",           5,   95,  "wave"),
    ("houston", "crude1", "tank01",  "temperature",     40,  160, "wave"),
    ("houston", "crude1", "pump101", "speed",           1200, 3300, "wave"),
    ("houston", "crude1", "pump101", "discharge_press", 60,  420, "wave"),
    ("houston", "crude1", "pump101", "motor_temp",      45,  120, "wave"),
    ("houston", "crude1", "pump101", "current",         20,  85,  "wave"),
    ("houston", "crude1", "pump101", "running",         0,   1,   "bool"),
    ("houston", "crude1", "valve01", "position",        10,  90,  "wave"),
    ("houston", "crude1", "hx01",    "temp_in",         120, 260, "wave"),
    ("houston", "crude1", "hx01",    "temp_out",        80,  180, "wave"),
    ("houston", "crude1", "hx01",    "flow",            200, 850, "wave"),
    # dallas / blend1
    ("dallas",  "blend1", "tank02",  "level",           5,   95,  "wave"),
    ("dallas",  "blend1", "tank02",  "temperature",     35,  140, "wave"),
    ("dallas",  "blend1", "pump201", "speed",           1000, 3000, "wave"),
    ("dallas",  "blend1", "pump201", "discharge_press", 50,  380, "wave"),
    ("dallas",  "blend1", "pump201", "motor_temp",      40,  110, "wave"),
    ("dallas",  "blend1", "pump201", "current",         15,  75,  "wave"),
    ("dallas",  "blend1", "pump201", "running",         0,   1,   "bool"),
    ("dallas",  "blend1", "valve02", "position",        15,  85,  "wave"),
    ("dallas",  "blend1", "hx02",    "temp_in",         110, 240, "wave"),
    ("dallas",  "blend1", "hx02",    "temp_out",        70,  160, "wave"),
    ("dallas",  "blend1", "hx02",    "flow",            180, 780, "wave"),
]


# Phase E: 20 pump-station pumps (houston/pumpstation/pumpNN) for asset-swap demo.
for _i in range(1, 21):
    _dev = f"pump{_i:02d}"
    _base = 900 + _i * 110  # distinct speed band per pump so a rebind is visibly different
    TAGS += [
        ("houston", "pumpstation", _dev, "speed",           _base, _base + 300, "wave"),
        ("houston", "pumpstation", _dev, "discharge_press", 40 + _i, 380,        "wave"),
        ("houston", "pumpstation", _dev, "motor_temp",      40,    120,          "wave"),
        ("houston", "pumpstation", _dev, "current",         15,    80,           "wave"),
        ("houston", "pumpstation", _dev, "running",         0,     1,            "bool"),
    ]


def path_of(site, unit, device, metric):
    return f"{site}/{unit}/{device}.{metric}"


def value_for(kind, lo, hi, phase, t):
    """Deterministic-ish changing value in [lo,hi]."""
    if kind == "bool":
        # slow square wave, ~40s period
        return (math.sin(t / 6.4 + phase) > 0)
    # sine sweep across the range + a faster small ripple so movement is obvious
    mid = (lo + hi) / 2.0
    amp = (hi - lo) / 2.0
    base = math.sin(t / 9.0 + phase)
    ripple = 0.08 * math.sin(t / 1.7 + phase * 2)
    return round(mid + amp * (0.85 * base + ripple), 2)


def main():
    ap = argparse.ArgumentParser(description="AMS 2-site process-value simulator")
    ap.add_argument("--bootstrap", default="localhost:9093", help="Kafka bootstrap servers")
    ap.add_argument("--interval", type=float, default=2.0, help="publish interval seconds")
    ap.add_argument("--once", action="store_true", help="publish one batch then exit")
    ap.add_argument("--exclude", action="append", default=[],
                    help="contextual path(s) to FREEZE (not published) — e.g. houston/crude1/tank01.level")
    args = ap.parse_args()

    excluded = set(args.exclude)
    producer = KafkaProducer(
        bootstrap_servers=args.bootstrap,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        key_serializer=lambda k: k.encode("utf-8"),
        acks=1,
        linger_ms=50,
    )

    active = [t for t in TAGS if path_of(t[0], t[1], t[2], t[3]) not in excluded]
    skipped = [path_of(*t[:4]) for t in TAGS if path_of(t[0], t[1], t[2], t[3]) in excluded]
    print(f"[sim] bootstrap={args.bootstrap} topic={TOPIC} tags={len(active)} interval={args.interval}s")
    if skipped:
        print(f"[sim] FROZEN (not publishing): {', '.join(skipped)}")

    running = {"go": True}
    signal.signal(signal.SIGINT, lambda *_: running.update(go=False))

    phases = {path_of(*t[:4]): (i * 0.7) for i, t in enumerate(active)}
    t0 = time.time()
    n = 0
    while running["go"]:
        now_ms = int(time.time() * 1000)
        t = time.time() - t0
        for site, unit, device, metric, lo, hi, kind in active:
            p = path_of(site, unit, device, metric)
            val = value_for(kind, lo, hi, phases[p], t)
            rec = {
                "group":   site,
                "edge":    f"{site}_edge1",
                "device":  device,
                "metric":  metric,
                "value":   val,
                "quality": 192,
                "ts":      now_ms,
                "type":    "bool" if kind == "bool" else "double",
                # full UNS contextual path — lets the edge-node build the IoTDB
                # history path root.<site>.<unit>.<device>.<measurement>
                "path":    p,
            }
            producer.send(TOPIC, key=device, value=rec)
            n += 1
        producer.flush()
        if args.once:
            print(f"[sim] published one batch ({len(active)} records)")
            break
        if n % (len(active) * 5) < len(active):
            print(f"[sim] published {n} records so far (t={t:.0f}s)")
        time.sleep(args.interval)

    producer.flush()
    producer.close()
    print(f"[sim] stopped after {n} records")


if __name__ == "__main__":
    main()
