#!/usr/bin/env python3
"""CPLM / loop path: traverse.cpa.loop.samples.v1 -> {CplmShortFeatureStreamJob,
CplmLongDiagnosticsStreamJob, CplmGateFusionStreamJob} -> clpm.*.v1 ->
cplm-api consumers -> traverse_cplm + IoTDB KPI dual-write; in parallel
RawLoopIotDbConsumer -> root.site1.cpm.<loop>.{pv,sp,op,vp,mode} and
LoopLiveRbeJob -> live.loop.metrics.

Event time is compressed: samples are backdated across --span-minutes so the
long-diagnostics 15-minute event-time timers and the fusion's 24h-slice
evaluation fire within a single run (they never would with wall-clock pacing).

Usage: python sim_loop_samples.py [--count 1200] [--span-minutes 45]
                                  [--loops G13_LOOP_A,G13_LOOP_B]
"""
from __future__ import annotations

import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import simlib as sl

CPLM_TOPICS = ["traverse.cpa.clpm.feature.short.v1", "traverse.cpa.clpm.feature.long.v1", "traverse.cpa.clpm.gate.results.v1"]


def iotdb_count(loop: str, measurement: str = "pv") -> int:
    try:
        data = sl.iotdb_query(
            f"select count({measurement}) from root.site1.cpm.{loop}")
        vals = data.get("values") or []
        if vals and vals[0]:
            return int(vals[0][0])
    except Exception:
        pass
    return 0


def iotdb_series(loop: str) -> list[str]:
    try:
        data = sl.iotdb_query(f"show timeseries root.site1.cpm.{loop}.**")
        cols = data.get("columns") or []
        idx = cols.index("timeseries") if "timeseries" in cols else 0
        return [row for row in (data.get("values") or [[]])[idx] if row]
    except Exception:
        return []


def main() -> int:
    ap = sl.base_parser(__doc__.splitlines()[0], default_count=1200, default_interval=0.0)
    ap.add_argument("--loops", default="G13_LOOP_A,G13_LOOP_B",
                    help="comma-separated registered loop ids")
    ap.add_argument("--span-minutes", type=float, default=45.0,
                    help="event-time span the samples are spread across (backdated)")
    args = ap.parse_args()
    loops = [l.strip() for l in args.loops.split(",") if l.strip()]
    tag = args.run_tag
    sl.banner(f"sim_loop_samples  run-tag={tag}  loops={loops}  count={args.count} "
              f"span={args.span_minutes}m")

    sl.kafka_check_connectivity()

    # forbidden-job guard first: CplmGateStreamJob must NOT run beside the trio
    running_names = [j["name"] for j in sl.flink_jobs() if j["state"] == "RUNNING"]
    forbidden = [n for n in running_names if "Gate Engine" in n or "CplmGateStream" in n]

    baselines = {t: sl.kafka_end_offset_sum(t) for t in CPLM_TOPICS}
    baselines["traverse.cpa.live.loop.metrics"] = sl.kafka_end_offset_sum("traverse.cpa.live.loop.metrics")
    iotdb_before = {l: iotdb_count(l) for l in loops}
    pg_gate_before = int(sl.pg_query(
        "SELECT count(*) FROM analytics.cplm_gate_results", db="traverse_cplm")[0][0])
    pg_short_before = int(sl.pg_query(
        "SELECT count(*) FROM analytics.cplm_short_feature_results", db="traverse_cplm")[0][0])
    sl.log(f"baselines: {baselines} iotdb={iotdb_before} "
           f"pg_short={pg_short_before} pg_gate={pg_gate_before}")

    # build backdated, per-loop interleaved samples
    now_ms = int(time.time() * 1000)
    span_ms = int(args.span_minutes * 60_000)
    start_ms = now_ms - span_ms
    per_loop = args.count
    step_ms = max(1000, span_ms // per_loop)
    records = []
    for i in range(per_loop):
        ts = start_ms + i * step_ms
        for loop in loops:
            phase = (i / 30.0) * 2 * math.pi
            sp = 50.0
            pv = sp + 4.0 * math.sin(phase) + 0.5 * math.sin(phase * 7)
            op = 40.0 + 6.0 * math.cos(phase)
            records.append((loop, sl.make_loop_sample(
                loop, event_ts_ms=ts, pv=round(pv, 3), sp=sp, op=round(op, 3),
                vp=round(op - 0.4, 3), mode="AUTO", quality="GOOD")))

    n = sl.kafka_publish_batch("traverse.cpa.loop.samples.v1", records, interval=args.interval)
    sl.log(f"published {n} samples ({per_loop} per loop, event time "
           f"{args.span_minutes:.0f}m compressed)")

    checks: dict[str, bool] = {}
    detail: dict = {"forbidden_jobs_running": forbidden}
    checks["cplm_gate_stream_job_not_running"] = not any(
        "CplmGateStream" in n for n in forbidden) and "AMS - CPLM Gate Engine" not in running_names

    # 1. short features
    checks["short_features_grew"] = sl.wait_until(
        "traverse.cpa.clpm.feature.short.v1 to grow",
        lambda: sl.kafka_end_offset_sum("traverse.cpa.clpm.feature.short.v1") > baselines["traverse.cpa.clpm.feature.short.v1"],
        timeout_sec=240)

    # 2. long diagnostics (15-min event-time timers over the compressed span)
    checks["long_features_grew"] = sl.wait_until(
        "traverse.cpa.clpm.feature.long.v1 to grow",
        lambda: sl.kafka_end_offset_sum("traverse.cpa.clpm.feature.long.v1") > baselines["traverse.cpa.clpm.feature.long.v1"],
        timeout_sec=300)

    # 3. gate fusion
    checks["gate_results_grew"] = sl.wait_until(
        "traverse.cpa.clpm.gate.results.v1 to grow",
        lambda: sl.kafka_end_offset_sum("traverse.cpa.clpm.gate.results.v1") > baselines["traverse.cpa.clpm.gate.results.v1"],
        timeout_sec=300)

    # 4. raw historian: RawLoopIotDbConsumer -> root.site1.cpm.<loop>.*
    def raw_written(loop: str) -> bool:
        return iotdb_count(loop) >= iotdb_before[loop] + per_loop

    checks["iotdb_raw_samples"] = all(
        sl.wait_until(f"IoTDB pv count for {loop} (+{per_loop})",
                      lambda l=loop: raw_written(l), timeout_sec=240)
        for loop in loops)
    series_report = {}
    series_ok = True
    for loop in loops:
        series = iotdb_series(loop)
        series_report[loop] = series
        for m in ("pv", "sp", "op", "vp", "mode"):
            if not any(s.endswith(f".{m}") for s in series):
                series_ok = False
    checks["iotdb_series_pv_sp_op_vp_mode"] = series_ok
    detail["iotdb_series"] = series_report
    detail["iotdb_pv_counts"] = {l: iotdb_count(l) for l in loops}

    # idempotency: exact-count increase means no duplicate (series,ts) points
    checks["iotdb_no_duplicate_points"] = all(
        iotdb_count(l) == iotdb_before[l] + per_loop for l in loops)

    # 5. cplm-api consumers -> traverse_cplm
    checks["pg_short_feature_rows"] = sl.wait_until(
        "analytics.cplm_short_feature_results to grow",
        lambda: int(sl.pg_query(
            "SELECT count(*) FROM analytics.cplm_short_feature_results",
            db="traverse_cplm")[0][0]) > pg_short_before,
        timeout_sec=180)
    checks["pg_gate_result_rows"] = sl.wait_until(
        "analytics.cplm_gate_results to grow",
        lambda: int(sl.pg_query(
            "SELECT count(*) FROM analytics.cplm_gate_results",
            db="traverse_cplm")[0][0]) > pg_gate_before,
        timeout_sec=180)

    # 6. IoTDB KPI dual-write from cplm-api
    kpi_series = {l: [s for s in iotdb_series(l) if ".kpi." in s] for l in loops}
    detail["iotdb_kpi_series"] = kpi_series
    checks["iotdb_kpi_dual_write"] = any(v for v in kpi_series.values())

    # 7. live RBE
    checks["live_loop_metrics_grew"] = sl.wait_until(
        "traverse.cpa.live.loop.metrics to grow",
        lambda: sl.kafka_end_offset_sum("traverse.cpa.live.loop.metrics") > baselines["traverse.cpa.live.loop.metrics"],
        timeout_sec=120)

    detail["final_offsets"] = {t: sl.kafka_end_offset_sum(t)
                               for t in CPLM_TOPICS + ["traverse.cpa.live.loop.metrics"]}
    report = {
        "sim": "sim_loop_samples", "run_tag": tag, "loops": loops,
        "count_per_loop": per_loop, "span_minutes": args.span_minutes,
        "baselines": baselines, "checks": checks, "detail": detail,
    }
    return sl.finish(args, report)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except sl.SimError as exc:
        sl.log(f"FATAL: {exc}")
        raise SystemExit(2)
