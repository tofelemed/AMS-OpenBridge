# CPLM End-to-End Pipeline Test — B2_027PIC (real plant data)

**Date:** 2026-08-06 · **Data:** `test data/B2_027PIC` — Honeywell PI Archive exports,
4 days (Jul 26–30, 2026, UTC), PV/SP/OP/MODE. No VP signal exists.
**Feeder:** `scripts/cplm-loop-pipeline-sim.py` (merge → 5 s grid → Kafka; `historical` and `live` modes).

## Data profile

| Signal | Rows | Cadence | Notes |
|---|---|---|---|
| PV | 24,332 | 5 s median (PI-compressed) | −5.3 … 0.0 |
| SP | 1,711 | on-change | −1.4 / −1.5 / −1.8 steps |
| OP | 5,884 | on-change | saturates at 0 and 100 |
| MODE | 17 | on-change | `AUT`/`MAN` — **45% of the span is MANUAL** |

Merged: **66,116 samples** on the 5 s grid (grid starts at the latest first-timestamp
so no signal is fabricated backwards; mode mapped `AUT→AUTO`, `MAN→MANUAL`).

## Pipeline 1 — HISTORICAL (original UTC timestamps)

| # | Hop | Check | Result |
|---|---|---|---|
| H1 | Loop registry | `POST /loops/activate` → monitoring on, 4 signal roles, flags `NO_VP`+`NO_UPSTREAM_LINKS` | **PASS** |
| H2 | Kafka ingest | `loop.samples.v1` +66,116 messages exactly (55,855 → 121,971) | **PASS** |
| H3 | Flink consumption | short job consumed all partitions to lag 0 | **PASS** |
| H4 | Streaming windows | **no emissions — expected**: watermark already at ~Aug 5, 13-day-old events are late and dropped (see finding F1) | **PASS (by design)** |
| H5 | IoTDB raw history | `root.site1.cpm.B2_027PIC` count(pv) = **66,116** | **PASS** |
| H6 | A8 recompute | replay `ed2e439e1e90` FINISHED; **5 gate verdicts** written by cplm-api's consumer | **PASS** |
| H7 | IoTDB KPI dual-write | `kpi.gate_24h.confidence` series present at window ends | **PASS** |
| H8 | Backend APIs (via nginx :3000) | `gates/latest` full 17-gate matrix + 98 metrics + calc v3.0.0; fleet rankings include the loop | **PASS** |
| H9 | Trend envelope | `/api/hist/trend?envelope=true` 48/48 buckets with pv_min/max/avg | **PASS** |
| H10 | `/kpis` feature rows | 0 rows for historical range — replay writes gate results, not per-resolution feature rows (finding F2) | **GAP (known)** |

### The verdicts (real diagnostics on real data)

| 24h window end (UTC) | Verdict | Why (from the gate payload) |
|---|---|---|
| Jul 27 | INSUFFICIENT_DATA | partial window — data starts 17:33 |
| Jul 28 | **EXCLUDED_SENSOR** | 100% AUTO, but PV froze in 70 s stretches, 242 quantization events, OP pinned at a limit for 100 samples — "G11 sensor freeze dominant" |
| Jul 29 | EXCLUDED_MODE | auto_pct = 0.62 — below eligibility |
| Jul 30 | EXCLUDED_MODE | MANUAL periods |
| Jul 31 | INSUFFICIENT_DATA | partial window — data ends 13:23 |

These exclusions are the engine working correctly: this loop's window genuinely cannot
support a stiction/oscillation verdict, and it says exactly why instead of guessing.

## Pipeline 2 — LIVE (file replayed, re-stamped to now, 5 s cadence)

| # | Hop | Check | Result |
|---|---|---|---|
| L1 | Kafka ingest | records keyed `B2_027PIC`, `event_ts_ms` = wall clock | **PASS** |
| L2 | Flink short features | rows at **all six resolutions** (1m…60m) with window_end = now | **PASS** |
| L3 | Live RBE | `live.loop.metrics` emitting per-metric deltas (deadband 0.05) | **PASS** |
| L4 | Sparkplug edge → Redis | all 5 snapshot keys (`pv/sp/op/mode/quality`); pv snapshot **4 s old**, quality 192 GOOD | **PASS** |
| L5 | EMQX Sparkplug DDATA | **directly observed** in edge-node logs: `Publishing 56 bytes to spBv1.0/ams_site1/DDATA/ams_edge1/B2_027PIC`, one publish per metric with quality (`pv=-0.9005871 q=192`, `sp=-1.4 q=192`). Topic matches exactly what the frontend's `useLoopLive` subscribes to. | **PASS** |
| L6 | IoTDB live rows | last pv **10 s old** | **PASS** |
| L7 | `/kpis` live rows | 1m resolution rows with window_end = now | **PASS** |

Sustained-run confirmation (~20 min after start): feature rows kept accumulating at every
resolution — 1m: 22 rows, 5m: 22, 10m: 11, 15m/30m/60m: 5 each, newest window_end tracking
the clock; IoTDB last PV 7 s old. The live plane is steady-state, not a first-sample fluke.

## Findings (worth knowing, none blocking)

- **F1 — Old data cannot enter the streaming path, and the evidence is already being
  collected but never surfaced.** Event-time watermarks never regress; the short windows use
  `allowedLateness(30s)` and there is **no `sideOutputLateData`/`OutputTag` anywhere**, so
  late records are discarded without capture. Historical loads MUST go: publish → IoTDB (raw
  consumer has no windows) → **A8 recompute** for verdicts. That part is by design.

  What is *not* by design: this is invisible to every operator surface. Flink itself has been
  counting it the whole time — `numLateRecordsDropped` exists on all six window operators and
  reads (cumulative since job start, including this backfill and earlier replays):

  | operator | late-dropped |
  |---|---|
  | cplm-short-window-1m | 81,847 |
  | cplm-short-window-5m | 81,799 |
  | cplm-short-window-10m | 81,739 |
  | cplm-short-window-15m | 81,703 |
  | cplm-short-window-30m | 81,523 |
  | cplm-short-window-60m | 81,163 |

  Our DG-1 metrics proxy (`GET /cpm/pipeline-metrics`) exposes state/uptime/checkpoints only,
  so nothing in the API or the Pipeline Health screen shows this. **Cheapest high-value fix in
  the whole system:** add `numLateRecordsDropped` per window operator to that proxy and surface
  it on U11 — it turns "my backfill silently vanished" into a self-diagnosing number, with no
  Flink job change required.
- **F2 — A8 produces verdicts, not feature rows.** `analytics.cplm_short/long_feature_results`
  only fill from streaming. For a historical-only loop, U7 Windows / U6 KPI overlay /
  `/kpis` are empty (honest empty states); Calculations still works because the gate payload
  carries all 98 metrics. If per-resolution historical KPIs are ever needed, the replay job
  would have to emit feature records too — a scoped enhancement, not a bug.
- **F3 — Historical backfill leaks into the live plane.** The live-RBE job has no windows,
  so it happily processed the 13k backlog deltas with July timestamps → Redis/EMQX briefly
  carried stale-stamped values until the live sim overwrote them. Cosmetic during backfills;
  worth remembering when a UI chip shows an odd "last change" time mid-load.
- **F4 — Two onboarding traps found by testing:** registry `criticality` must be lowercase
  (`medium`, not `MEDIUM` — CHECK constraint 500s otherwise), and PI mode strings must be
  mapped (`AUT`→`AUTO`) because the engine matches `mode.contains("AUTO")` — raw `AUT`
  silently zeroes auto_pct and G1 excludes every window.
- **F5 — No VP** in the source data → confidence permanently capped at 0.89 for this loop,
  G14 INSUFFICIENT_EVIDENCE. Correct behavior; add a VP tag if the plant has one.

## Where to look in the UI

- `http://localhost:3000/cpm` — overview; B2_027PIC in the priority queue; live signal row on the focus panel
- `http://localhost:3000/cpm/explorer?loop=B2_027PIC` — tabs incl. live operating state + 8 h trend
- `http://localhost:3000/cpm/performance?window=24h&loop=B2_027PIC` — gate matrix row (EXCLUDED_MODE)
- `http://localhost:3000/cpm/historical?loop=B2_027PIC&from=2026-07-26T17:33:00Z&to=2026-07-30T13:23:00Z` — envelope trend + diagnosis bands + mode ribbon (shows the MAN periods)
- `http://localhost:3000/cpm/investigation?loop=B2_027PIC` — reasoning chain: G1 EXCLUDED, machine reason
- `http://localhost:3000/cpm/replay?loop=B2_027PIC` — evidence replay over a stored window

## Re-run / operate

```powershell
python scripts/cplm-loop-pipeline-sim.py stats        # merge only, no publish
python scripts/cplm-loop-pipeline-sim.py historical   # one-shot backfill (then recompute via UI or API)
python scripts/cplm-loop-pipeline-sim.py live         # continuous 5s publisher, Ctrl+C to stop
```

The live simulator from this test run is still running in the background. Stop it with:

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like '*cplm-loop-pipeline-sim*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId }
```
