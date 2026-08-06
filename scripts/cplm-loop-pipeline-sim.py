#!/usr/bin/env python3
"""
CPLM pipeline test feeder for real PI Archive exports (B2_027PIC).

Two modes over the same merged dataset:

  historical  — publish the file's 4 days once, with ORIGINAL UTC timestamps.
                Feeds: RawLoopIotDbConsumer → IoTDB history, streaming CPLM jobs,
                and the A8 recompute (which re-reads loop.samples.v1).
  live        — replay the merged rows re-stamped to "now", one every 5 s,
                looping forever. Feeds the live plane: short features,
                LoopLiveRbeJob → live.loop.metrics → sparkplug-edge → EMQX/Redis.

Merge rules (why, not just what):
  * PI compression stores on-change only. The CPLM engine bills completeness
    against a 5 s grid, so signals are forward-filled onto that grid — an
    unchanged PI value IS the value at every grid point in between.
  * The grid starts at the LATEST first-timestamp across PV/SP/OP/MODE: before
    a signal's first row its value is unknown, and inventing it would be test
    data fraud. (Costs ~4 h of the 96 h span.)
  * Mode strings map AUT→AUTO, MAN→MANUAL: the engine's auto detection is
    mode.contains("AUTO"), so raw "AUT" would silently zero auto_pct and G1
    would exclude every window.
  * No VP column exists → vp omitted → NO_VP path (confidence caps at 0.89).

Publishing uses kafka-console-producer inside the ams-kafka container with
parse.key (key = loop_id), the same proven path as cplm-replay-csv-live.ps1 —
no Python Kafka client needed on the host.

Usage:
  python scripts/cplm-loop-pipeline-sim.py historical
  python scripts/cplm-loop-pipeline-sim.py live [--speed 1.0]
  python scripts/cplm-loop-pipeline-sim.py stats      # merge + print, no publish
"""
import argparse
import csv
import datetime as dt
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "test data" / "B2_027PIC"
LOOP_ID = "B2_027PIC"
TOPIC = "loop.samples.v1"
GRID_S = 5
MODE_MAP = {"AUT": "AUTO", "MAN": "MANUAL"}

FILES = {
    "pv": "ArchiveEditorListing_SRV-PI01_B2_027PIC_PV.csv",
    "sp": "ArchiveEditorListing_SRV-PI01_B2_027PIC_SP.csv",
    "op": "ArchiveEditorListing_SRV-PI01_B2_027PIC_OP.csv",
    "mode": "ArchiveEditorListing_SRV-PI01_B2_027PIC_Mode.csv",
}


def load_signal(name: str):
    """[(epoch_ms, value)] sorted; timestamps are UTC per the data owner."""
    rows = []
    with open(DATA_DIR / FILES[name], encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            ts = dt.datetime.strptime(r["Timestamp"], "%m/%d/%Y %I:%M:%S %p")
            ts = ts.replace(tzinfo=dt.timezone.utc)
            v = r["Value"].strip()
            rows.append((int(ts.timestamp() * 1000), v))
    rows.sort(key=lambda x: x[0])
    return rows


def merge_grid():
    """Forward-fill all four signals onto a shared 5 s grid."""
    sig = {name: load_signal(name) for name in FILES}
    start_ms = max(s[0][0] for s in sig.values())
    end_ms = min(s[-1][0] for s in (sig["pv"],))  # PV bounds the useful end
    start_ms = ((start_ms // 1000 + GRID_S - 1) // GRID_S) * GRID_S * 1000

    idx = {name: 0 for name in sig}
    last = {name: None for name in sig}
    out = []
    t = start_ms
    while t <= end_ms:
        for name, rows in sig.items():
            i = idx[name]
            while i < len(rows) and rows[i][0] <= t:
                last[name] = rows[i][1]
                i += 1
            idx[name] = i
        out.append({
            "ts": t,
            "pv": float(last["pv"]),
            "sp": float(last["sp"]),
            "op": float(last["op"]),
            "mode": MODE_MAP.get(last["mode"], "UNKNOWN"),
        })
        t += GRID_S * 1000
    return out


def record(row, ts_ms):
    """Canonical loop.samples.v1 record (CplmNormalizedSample field names)."""
    return json.dumps({
        "loop_id": LOOP_ID,
        "event_ts_ms": ts_ms,
        "pv": row["pv"],
        "sp": row["sp"],
        "op": row["op"],
        "mode": row["mode"],
        "quality": "GOOD",   # every source row had Questionable=False
    })


def open_producer():
    return subprocess.Popen(
        ["docker", "exec", "-i", "ams-kafka", "kafka-console-producer",
         "--bootstrap-server", "localhost:9092", "--topic", TOPIC,
         "--property", "parse.key=true", "--property", "key.separator=\t"],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
        text=True)


def cmd_stats(rows):
    lo = dt.datetime.fromtimestamp(rows[0]["ts"] / 1000, dt.timezone.utc)
    hi = dt.datetime.fromtimestamp(rows[-1]["ts"] / 1000, dt.timezone.utc)
    modes = {}
    for r in rows:
        modes[r["mode"]] = modes.get(r["mode"], 0) + 1
    print(f"grid rows : {len(rows)} @ {GRID_S}s")
    print(f"range UTC : {lo} -> {hi}")
    print(f"modes     : {modes}")
    print(f"pv range  : {min(r['pv'] for r in rows):.3f} .. {max(r['pv'] for r in rows):.3f}")
    print(f"op range  : {min(r['op'] for r in rows):.3f} .. {max(r['op'] for r in rows):.3f}")


def cmd_historical(rows):
    print(f"publishing {len(rows)} historical samples (original UTC timestamps)…")
    p = open_producer()
    assert p.stdin is not None
    t0 = time.time()
    for i, row in enumerate(rows):
        p.stdin.write(f"{LOOP_ID}\t{record(row, row['ts'])}\n")
        if (i + 1) % 10000 == 0:
            p.stdin.flush()
            print(f"  {i + 1}/{len(rows)}")
    p.stdin.close()
    rc = p.wait(timeout=600)
    err = p.stderr.read() if p.stderr else ""
    if rc != 0:
        sys.exit(f"producer exited {rc}: {err[-500:]}")
    # kafka-console-producer exits 0 even on some publish errors — surface stderr.
    if err.strip():
        print(f"producer stderr (check for errors):\n{err[-800:]}")
    print(f"done in {time.time() - t0:.1f}s")


def cmd_live(rows, speed: float):
    period = GRID_S / speed
    print(f"LIVE replay: {len(rows)} rows looped, one sample every {period:.1f}s "
          f"(event_ts = wall clock). Ctrl+C to stop.")
    p = open_producer()
    assert p.stdin is not None
    i, sent = 0, 0
    try:
        while True:
            row = rows[i % len(rows)]
            now_ms = int(time.time() * 1000)
            p.stdin.write(f"{LOOP_ID}\t{record(row, now_ms)}\n")
            p.stdin.flush()
            sent += 1
            if sent % 12 == 0:  # once a minute at 5 s
                print(f"  sent={sent} pv={row['pv']:.3f} sp={row['sp']:.3f} "
                      f"op={row['op']:.3f} mode={row['mode']}")
            i += 1
            time.sleep(period)
    except KeyboardInterrupt:
        print(f"\nstopped after {sent} samples")
    finally:
        p.stdin.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["historical", "live", "stats"])
    ap.add_argument("--speed", type=float, default=1.0,
                    help="live mode: samples per 5s-slot multiplier (1.0 = real time)")
    args = ap.parse_args()
    rows = merge_grid()
    if args.mode == "stats":
        cmd_stats(rows)
    elif args.mode == "historical":
        cmd_stats(rows)
        cmd_historical(rows)
    else:
        cmd_live(rows, args.speed)


if __name__ == "__main__":
    main()
