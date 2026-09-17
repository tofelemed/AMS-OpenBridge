#!/usr/bin/env python3
"""v2.5 load / latency probe (Task 4.2; spec v6 R21 / NR-061) - measured on the RUNNING lab stack, no universal claim.

Drives the OT gateway stand-in over every registered loop at the plant cadence (5 s) with a fraction of
quality-only updates, and while it runs measures, once a minute:

  * source-observation -> live emission   (live metric emissionTs - sourceTs)       the pipeline's own latency
  * emission -> reader                    (wall clock at consume - emissionTs)       what a tailing reader adds
  * source-observation -> tuple           (samples Kafka append time - event_ts_ms) ingestion + join
  * Flink checkpoint duration / size      (JobManager REST, every CPLM job)
  * consumer-group lag                    (kafka-consumer-groups, every CPLM group)
  * evidence chunk rate                   (analytics.evidence_chunk rows per minute)
  * result rows per minute                (short / long / gate tables)

Writes docs/next-release/04-load-report.md with p50 / p95 / p99 per minute and the hardware it ran on.
Response events: the step simulator drives ONE loop per ~8-minute scenario, so the probe runs it in the
background for the duration (one INPUT_TEST every scenario), not five events per minute - stated in the report.

  python scripts/cpm-v25-load-probe.py --minutes 30
  python scripts/cpm-v25-load-probe.py --minutes 30 --no-sim      # measure only (a simulator is already running)

Env: GW (http://127.0.0.1:8081), ADMIN_PW (ChangeMe123! on the lab).
"""
import argparse, json, os, platform, statistics, subprocess, sys, time
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
GW = os.environ.get("GW", "http://127.0.0.1:8081").rstrip("/")
JM = os.environ.get("JM", "http://127.0.0.1:8082").rstrip("/")
CPLM_GROUPS = ["traverse-cpa-cplm-results", "traverse-cpa-cplm-results-frames", "traverse-cpa-cplm-evidence",
               "traverse-cpa-cplm-response", "traverse-cpa-cplm-conditions", "traverse-cpa-cplm-health", "traverse-cpa-cplm-results-config-acks"]
CPLM_JOBS = ["AMS - CPLM Short Feature Engine", "AMS - CPLM Long Diagnostics Engine", "AMS - CPLM Gate Fusion Engine",
             "AMS - CPLM Condition Engine", "AMS - CPLM Instrument Context Engine", "AMS - CPLM Response Engine", "AMS - Loop Live RBE Engine"]


def sh(args, timeout=120):
    p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    return p.stdout


def sql(q):
    return sh(["docker", "exec", "ams-postgres", "psql", "-U", "ams_user", "-d", "traverse_cplm", "-tAc", q]).strip()


def pct(values, p):
    if not values:
        return None
    v = sorted(values)
    k = max(0, min(len(v) - 1, int(round((p / 100.0) * (len(v) - 1)))))
    return v[k]


def tap(topic, seconds, ts_field_of):
    """Consume the tail of a topic for N seconds; return (append_ts_ms, record) pairs."""
    out = sh(["docker", "exec", "ams-kafka", "kafka-console-consumer", "--bootstrap-server", "localhost:9092", "--topic", topic,
              "--property", "print.timestamp=true", "--timeout-ms", str(seconds * 1000)], timeout=seconds + 60)
    rows = []
    for line in out.splitlines():
        if not line.startswith("CreateTime:"):
            continue
        try:
            head, body = line.split("\t", 1)
            append_ms = int(head.split(":", 1)[1])
            rec = json.loads(body)
            rows.append((append_ms, rec))
        except Exception:
            continue
    return rows


def checkpoints():
    try:
        jobs = json.load(__import__("urllib.request").request.urlopen(JM + "/jobs/overview", timeout=15))["jobs"]
    except Exception:
        return {}
    res = {}
    for j in jobs:
        if j["name"] not in CPLM_JOBS or j["state"] != "RUNNING":
            continue
        try:
            c = json.load(__import__("urllib.request").request.urlopen(f"{JM}/jobs/{j['jid']}/checkpoints", timeout=15))
            last = (c.get("latest") or {}).get("completed") or {}
            res[j["name"]] = {"duration_ms": last.get("end_to_end_duration"), "size_bytes": last.get("state_size") or last.get("checkpointed_size"),
                              "failed": (c.get("counts") or {}).get("failed")}
        except Exception as e:
            res[j["name"]] = {"error": str(e)[:80]}
    return res


def lags():
    res = {}
    for g in CPLM_GROUPS:
        out = sh(["docker", "exec", "ams-kafka", "kafka-consumer-groups", "--bootstrap-server", "localhost:9092", "--describe", "--group", g])
        total = 0
        members = set()
        for line in out.splitlines():
            parts = line.split()
            if len(parts) >= 6 and parts[0] == g and parts[5].lstrip("-").isdigit():
                total += int(parts[5])
                if len(parts) >= 7:
                    members.add(parts[6])
        res[g] = {"lag": total, "members": len([m for m in members if m != "-"])}
    return res


def hardware():
    info = {"host": platform.node(), "os": platform.platform(), "python": platform.python_version()}
    try:
        d = json.loads(sh(["docker", "info", "--format", "{{json .}}"]))
        info["docker_cpus"] = d.get("NCPU")
        info["docker_mem_gb"] = round((d.get("MemTotal") or 0) / 1e9, 1)
    except Exception:
        pass
    return info


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--minutes", type=int, default=30)
    ap.add_argument("--no-sim", action="store_true", help="do not start the OT simulator / step simulator")
    ap.add_argument("--quality-flip", type=float, default=0.2)
    ap.add_argument("--response-loop", default="FIC10302")
    ap.add_argument("--out", default=str(REPO / "docs" / "next-release" / "04-load-report.md"))
    args = ap.parse_args()

    loops = sql("SELECT count(*) FROM cpm.loop_registry WHERE is_active")
    sims = []
    if not args.no_sim:
        sims.append(subprocess.Popen([sys.executable, str(REPO / "ams-sims" / "sim_ot_gateway_mqtt.py"), "--interval", "5", "--minutes", str(args.minutes + 2),
                                      "--quality-flip", str(args.quality_flip), "--exclude", args.response_loop],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        sims.append(subprocess.Popen([sys.executable, "-W", "ignore", str(REPO / "scripts" / "sim" / "loop_step_sim.py"), "--loop", args.response_loop,
                                      "--scenario", "input-test", "--repeat", str(max(1, args.minutes // 9))],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        print(f"simulators started over {loops} loops (+ {args.response_loop} response scenarios); warming up 90 s", flush=True)
        time.sleep(90)

    samples = []
    t_start = time.time()
    counts0 = {t: int(sql(f"SELECT count(*) FROM {t}") or 0) for t in
               ("analytics.cplm_short_feature_results", "analytics.cplm_long_feature_results", "analytics.cplm_gate_results", "analytics.evidence_chunk", "analytics.response_event")}
    minute = 0
    while time.time() - t_start < args.minutes * 60:
        minute += 1
        t0 = time.time()
        live = tap("traverse.cpa.live.loop.metrics", 20, None)
        now_ms = int(time.time() * 1000)
        src_to_emit = [r["emissionTs"] - r["sourceTs"] for _, r in live if r.get("emissionTs") and r.get("sourceTs") and not r.get("heartbeat")]
        emit_to_reader = [now_ms - r["emissionTs"] for _, r in live if r.get("emissionTs")]
        tuples = tap("traverse.cpa.loop.samples.v1", 15, None)
        src_to_tuple = [a - r["event_ts_ms"] for a, r in tuples if r.get("event_ts_ms")]
        role_to_tuple = [r["event_ts_ms"] - r["roles"]["pv"]["sample_ts_ms"] for _, r in tuples if r.get("roles", {}).get("pv", {}).get("sample_ts_ms")]
        quality_only = sum(1 for _, r in live if r.get("qualityChanged") or (r.get("quality") and r.get("quality") != "GOOD"))
        row = {
            "minute": minute, "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "live_records": len(live), "tuples": len(tuples), "quality_non_good_live": quality_only,
            "src_to_emit_ms": {p: pct(src_to_emit, p) for p in (50, 95, 99)},
            "emit_to_reader_ms": {p: pct(emit_to_reader, p) for p in (50, 95, 99)},
            "src_to_tuple_ms": {p: pct(src_to_tuple, p) for p in (50, 95, 99)},
            "role_sample_to_tuple_ms": {p: pct(role_to_tuple, p) for p in (50, 95, 99)},
            "checkpoints": checkpoints(), "lags": lags(),
            "rows": {t: int(sql(f"SELECT count(*) FROM {t}") or 0) - counts0[t] for t in counts0},
        }
        samples.append(row)
        print(f"[{row['at']}] min {minute}: live {len(live)} tuples {len(tuples)} src->emit p95 {row['src_to_emit_ms'][95]} ms, "
              f"src->tuple p95 {row['src_to_tuple_ms'][95]} ms, lag {sum(v['lag'] for v in row['lags'].values())}, chunks {row['rows']['analytics.evidence_chunk']}", flush=True)
        time.sleep(max(0, 60 - (time.time() - t0)))

    for s in sims:
        try:
            s.terminate()
        except Exception:
            pass

    hw = hardware()
    lines = [f"# v2.5 load / latency report (lab, {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')})", "",
             f"Generated by `scripts/cpm-v25-load-probe.py --minutes {args.minutes}` on **{hw.get('host')}** ({hw.get('os')}; Docker {hw.get('docker_cpus')} CPUs, {hw.get('docker_mem_gb')} GB) - "
             f"the lab stack with every service on one Docker host. **These are this host's numbers, not a universal claim (R21).**", "",
             f"Load: the OT gateway stand-in over **{loops} registered loops at 5 s** (4-5 parameters per loop per tick), **{int(args.quality_flip * 100)} % of PV publishes repeated as a quality-only "
             f"change**, the step simulator driving `{args.response_loop}` with INPUT_TEST scenarios back to back (one response event per ~8-minute scenario - the simulator cannot produce five events per minute; stated, not claimed).", "",
             "Latencies are measured from a 20 s / 15 s tail of the Kafka topics once a minute (Kafka append time vs the record's own timestamps); `source -> emission` is the pipeline (ingestion join + Flink RBE), "
             "`emission -> reader` is what a tailing reader adds at that instant, `source -> tuple` is ingestion only, `role sample -> tuple` is the join's hold (per-role time vs the tuple's time).", "",
             "| minute | live records | tuples | src→emit p50 / p95 / p99 (ms) | emit→reader p95 (ms) | src→tuple p50 / p95 / p99 (ms) | role→tuple p95 (ms) | Σ consumer lag | evidence chunks (cum.) | short / long / gate rows (cum.) |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    for r in samples:
        se, er, st, rt = r["src_to_emit_ms"], r["emit_to_reader_ms"], r["src_to_tuple_ms"], r["role_sample_to_tuple_ms"]
        lines.append(f"| {r['minute']} | {r['live_records']} | {r['tuples']} | {se[50]} / {se[95]} / {se[99]} | {er[95]} | {st[50]} / {st[95]} / {st[99]} | {rt[95]} | {sum(v['lag'] for v in r['lags'].values())} | "
                     f"{r['rows']['analytics.evidence_chunk']} | {r['rows']['analytics.cplm_short_feature_results']} / {r['rows']['analytics.cplm_long_feature_results']} / {r['rows']['analytics.cplm_gate_results']} |")
    all_se = [v for r in samples for v in [r["src_to_emit_ms"][95]] if v is not None]
    all_st = [v for r in samples for v in [r["src_to_tuple_ms"][95]] if v is not None]
    lines += ["", "## Summary", "",
              f"- source → live emission p95 over the run: median of the per-minute p95 = **{statistics.median(all_se) if all_se else 'n/a'} ms**, worst minute {max(all_se) if all_se else 'n/a'} ms",
              f"- source → tuple p95 over the run: median {statistics.median(all_st) if all_st else 'n/a'} ms, worst minute {max(all_st) if all_st else 'n/a'} ms",
              f"- rows written during the run: {samples[-1]['rows'] if samples else {}}",
              f"- response events written during the run: {int(sql('SELECT count(*) FROM analytics.response_event') or 0) - counts0['analytics.response_event']}",
              "", "## Flink checkpoints (last completed, per job, at the end of the run)", "", "| job | duration (ms) | size (bytes) | failed count |", "|---|---|---|---|"]
    for name, c in (samples[-1]["checkpoints"] if samples else {}).items():
        lines.append(f"| {name} | {c.get('duration_ms')} | {c.get('size_bytes')} | {c.get('failed')} |")
    lines += ["", "## Consumer groups (end of run)", "", "| group | lag | members |", "|---|---|---|"]
    for g, v in (samples[-1]["lags"] if samples else {}).items():
        lines.append(f"| {g} | {v['lag']} | {v['members']} |")
    lines += ["", "Raw per-minute samples: `docs/next-release/04-load-report.json`.", ""]
    Path(args.out).write_text("\n".join(lines), encoding="utf-8")
    Path(args.out).with_suffix(".json").write_text(json.dumps({"hardware": hw, "samples": samples}, indent=1), encoding="utf-8")
    print("wrote", args.out)


if __name__ == "__main__":
    main()
