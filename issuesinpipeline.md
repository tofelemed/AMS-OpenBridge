# CPLM Pipeline — Open Issues

**Produced:** 2026-08-06, from an end-to-end test with real plant data (`B2_027PIC`, 4 days of
Honeywell PI exports) plus four parallel audits: calculation correctness (independent recompute
from the raw CSVs), data loss/duplication, silent-failure code audit, and cross-hop contract drift.

**Verification legend**
- ✅ **VERIFIED** — I reproduced it directly against the running stack or the source.
- 🔍 **AGENT-CONFIRMED** — an audit agent reproduced it with evidence quoted; I did not independently re-run it.
- ❓ **SUSPECTED** — mechanism confirmed in code, not yet observed firing.

> One agent finding was **rejected** after checking: the `cplm-api` compose healthcheck was reported
> as matching `Healthy` inside `Unhealthy`. It does not — `grep` is case-sensitive and "U**n**healthy"
> contains lowercase `healthy`. Tested both directions plus the live container. **The healthcheck is correct.**

---

## FIX STATUS — 2026-08-07

All P0 and P1-1…P1-12 items below have been fixed, deployed and validated on the
running stack. Each is marked inline. Evidence and the validation method for every
item is in the commit message and in `docs/cplm-intake/pipeline-fix-validation.md`.

| ID | Fix | Validated by |
|---|---|---|
| P0-1 | Duplicate jobs cancelled; supervisor now counts RUNNING copies and refuses to stack a second | 7 jobs running, 0 duplicate names |
| P0-2 | Long job skips timers the watermark already passed | Long tier now emits **current** windows (was frozen at 2026-07-27) |
| P0-3 | Fusion sources use `committedOffsets(EARLIEST)` | Source diff + job restarted on new jar |
| P0-4 | `good_error_pct` scaled ×100 at every render site | API 0.8965 → UI 89.7% |
| P0-5 | `travel_per_day`/`reversals_per_hour` emitted on the long payload | Key present in 6/6 new rows, absent in 348/348 old |
| P0-6 | All three upserts guarded with `WHERE EXCLUDED.sample_count >= …` | 3 guards in deployed source |
| P1-1 | Freeze must be material (≥60 s **and** ≥10 % of window); `freeze_fraction` published | Key present in 6/6 new rows |
| P1-2 | `toneFor` covers STRONG + LOW/MEDIUM/HIGH/CRITICAL | 1,201 STRONG cells no longer render grey |
| P1-3 | `cplm_gate_latest` orders by `window_end` before "has a verdict" | View definition confirmed in DB |
| P1-4 | Fleet joins use `lower(loop_id)` in all three places | Deployed source |
| P1-5 | One shared `loopSeries()` helper mirroring `SafeNode`; `loop_id` validated at onboarding | `FIC-101` now rejected with a 422 explaining the collision |
| P1-6 | `lateRecordsDropped` surfaced per job (+ terminal-job dedupe) | Metrics payload carries it; 12 phantom rows → 7 real |
| P1-7 | Mode vocabulary normalised in the engine | `AUT`/`CASCADE` → auto_pct **1.000**, G1 PASS; `MAN` still EXCLUDED |
| P1-9 | `sufficient_data` exposed on the KPI endpoint | Deployed SQL |
| P1-10 | `long_metrics_qualified` stamped on every gate row | `false` on new INSUFFICIENT_DATA rows |
| P1-11 | Bad quality ≥50 % now FAILS G0 | Test loop: `bad_quality_pct=1.0` → **G0 FAIL** (was WARN) |
| P1-12 | Missing/non-numeric pv/sp/op marks the sample invalid | Test loop with no `op` produced **zero** windows (was G4 PASS on op=0) |

**Also found and fixed while validating (not in the original register):**
- **The Flink job supervisor had been dead the whole time.** `flink-job-supervisor.sh`
  was checked out CRLF, so bash read `set -o pipefail
` as an invalid option and the
  script failed on line 12 every 60-second loop — it had never resubmitted anything.
  This is the *same* defect that silently broke `iotdb-init-ttl.sh`. All five
  `infra/docker/*.sh` files were CRLF; all are now LF, and a new `.gitattributes`
  pins `*.sh eol=lf` so a Windows checkout cannot reintroduce it.
- **`/cpm/pipeline-metrics` listed terminal jobs**, so Pipeline Health showed 12 rows
  including cancelled duplicates — which would have made a real duplicate impossible
  to spot on the very screen meant to reveal it. Now one row per job, RUNNING preferred.
- **`criticality` is normalised to lowercase on insert** and validated (P2-9), so
  `"MEDIUM"` returns 422 with the valid list instead of a bare 500.

| P1-8 | Uncomputed metrics now persist as **SQL NULL**, not 0.0 | Declined window stores `mae`/`good_error_pct`/`travel_per_day` = NULL (`jsonb_typeof` = `null`); `sample_count` still a real number |

**Still open:** everything under P2/P3.

---

## P0 — Fix first (active outage, or wrong numbers reaching users now)

### P0-1 ✅ Two "CPLM Long Diagnostics Engine" jobs are running at once, on one consumer group
`/jobs/overview` lists the job twice: started `08-05 16:20` and `08-06 16:04`. Flink's `KafkaSource`
does not use Kafka group coordination — **each job assigns itself all 16 partitions** and both commit
to `flink-ams-cplm-long`. Every sample is processed and emitted twice, and on restart a job resumes
from whichever instance committed last, so one can silently skip records the other already advanced past.
`infra/docker/flink-job-supervisor.sh:45` matches on `grep -F "$1" | grep -q "(RUNNING)"` — a name
substring — which cannot detect that a *second* copy of the same name is already running.
**Fix:** cancel one job now; make the supervisor refuse to submit when a job of that name already exists.

### P0-2 🔍 The Long Diagnostics job is in a checkpoint-death loop — no live 4h/12h/24h verdict will ever be produced
`restored=5, total=290, completed=279, failed=10`, root cause `Checkpoint expired before completing`.
It restarts roughly every 13.5 minutes, always resuming emission at `window_end = 2026-07-26 17:45`
and dying around `2026-07-27 00:00`. It has **never advanced past 2026-07-27.**
Cause: `CplmLongDiagnosticsStreamJob.java:176-177` steps its event-time timer strictly `+15 min`, and
`:97` holds a 24h `ListState` per loop. Crossing the 11-day gap between the July backfill and the live
sim needs ~1,056 sequential timer firings, each rescanning a 17,280-element buffer. It manages ~37 per
lifetime before the checkpoint expires.
**Note this is a direct consequence of backfilling historical data into the same key as a live stream.**
**Fix:** replace the full-sample `ListState` with an aggregating accumulator or RocksDB incremental
state; separately, don't mix an 11-day-old backfill into a live keyed stream.

### P0-3 ✅ Gate Fusion job restarts from `latest()`, silently discarding every verdict window it was down for
`CplmGateFusionStreamJob.java:46` and `:54` both use `OffsetsInitializer.latest()`. This is the exact
defect already fixed in the ingest path — `CplmIngestPipeline.java:31` uses
`committedOffsets(EARLIEST)` with a comment explaining that `latest()` "silently skipped every sample
published while a job was down." The fusion job's own two sources were never converted, and the
supervisor re-submits on a 60s loop. After any restart `cplm_gate_results` has a hole, while
`/gates/latest` keeps serving the pre-outage verdict as current.
**Fix:** one-line change to `committedOffsets(OffsetResetStrategy.EARLIEST)` on both sources.

### P0-4 ✅ `good_error_pct` is a 0–1 fraction rendered as a percentage — every screen is 100× wrong
`CplmGateEngine.java:202` writes `goodErrorCount / n` (0–1). `CpmPerformance.tsx:100-101` renders
`${value.toFixed(1)}%` and tones on `>= 80`. Live right now:

| loop | stored | UI shows | truth |
|---|---|---|---|
| G13_LOOP_A | 0.6702 | **0.7%** | 67.0% |
| B2_027PIC | 0.8965 | **0.9%** | 89.7% |

The `>= 80` threshold is unreachable for a fraction, so the headline KPI tile is permanently amber even
for a perfect fleet. `CpmPerformance.tsx:70` uses a `?? 101` null-sentinel, confirming the 0–100
assumption. Same error in `CpmInvestigation.tsx:52`, `CpmHistorical.tsx:33`, `CpmCalculations.tsx:41`
(whose own description says "Time **fraction**" while its unit says `%`).
**Fix:** multiply by 100 at the render sites (the other `*_pct` fields — completeness, auto_pct,
saturation_pct — are already handled correctly, so do **not** change the engine).

### P0-5 ✅ `travel_per_day` and `reversals_per_hour` are hard zero in the long tier — for every loop, always
`SELECT count(*) FILTER (WHERE travel_per_day <> 0)` on `analytics.cplm_long_feature_results` =
**0 of 884 rows**. `CplmLongDiagnosticsResult` has no such field, so the emitted JSON has no key;
`CplmResultConsumerService.cs:451` coerces the absent key to `0.0` and writes it to an indexed column;
`CpmAnalyticsController.cs:141` selects it for every long resolution; `CpmCalculations.tsx:43-44`
publishes it to the engineer as *"OP travel per day"* and *"OP reversals per hour"*, sourced `long`.
The real values exist in the **gate** table (e.g. 567.92 %/day, 31.92 reversals/h for 2026-07-27).
**Fix:** either compute them in the long tier, or have the long-tier KPI endpoint read them from the
gate payload, or remove them from the long-tier catalogue. Do not leave a zero where a number belongs.

### P0-6 ❓ The upsert can silently replace a complete result with a partial one
All three `ON CONFLICT … DO UPDATE` clauses (`CplmResultConsumerService.cs:181`, `:270`, `:289`) are
**unconditional** — no `WHERE` guard on `sample_count`, completeness, or watermark. Measured absorption
is real: in 12 minutes the gate topic grew +79 messages while gate rows grew +2 (97% absorbed by
`DO UPDATE`). Today the overwrites are value-identical because both writers replay the same bytes, so
no corruption is visible — but `CplmLongDiagnosticsStreamJob.java:135/151/167` emits whenever
`slice.size() >= MIN_SAMPLES` with no completeness floor, so a restarting job re-emits the same
`window_end` with a refilling buffer (`sample_count` climbing 139 → 319 → … → 6619). The later,
worse row wins. Both `*_latest` views then tie-break on `created_at DESC`, so the freshest — possibly
worst — row is what gets served.
**Fix:** add `WHERE EXCLUDED.sample_count >= <table>.sample_count` (or a completeness predicate) to all three.

---

## P1 — High (wrong conclusions, or invisible loss)

### P1-1 🔍 `freeze_index_s` measures the historian's compression deadband, not sensor freeze — and it blocks whole days
`CplmGateEngine.java:1049-1064` defines freeze as the longest run of unchanged samples **on the
forward-filled 5s grid**. With PI storing on-change, that run is exactly the largest gap between archive
events. Proven identity:

| day | max gap between PV archive rows | stored `freeze_index_s` |
|---|---|---|
| 2026-07-27 | 75 s | 70 s |
| 2026-07-29 | 7,076 s | 7,070 s |

G11 warns at ≥60s and fusion turns that into a **blocking** `EXCLUDED_SENSOR`. For 2026-07-27 that was
70s out of 86,400 — **0.081% of the day** — and it discarded the entire day's diagnosis.
**Every PI-fed loop with a compression deadband coarser than 60s will be permanently excluded as a
sensor fault.** Across all 93 stored windows for this loop, `confidence = 0.0` in **93 of 93**.
**Fix:** measure freeze as a *fraction* of the window, and/or exclude forward-filled points from the
freeze statistic (the merge knows which samples were interpolated — the engine does not).

### P1-2 ✅ `STRONG` — and every severity value — renders as neutral grey
`shared.tsx:16-28` `toneFor()` has no branch for `STRONG` (**1,201 stored cells**), `PENDING` (2,400),
`INSUFFICIENT_EVIDENCE` (1,242), or `HIGH`/`MEDIUM`/`LOW`. All fall through to `return 'muted'`.
On `G13_LOOP_A` — diagnosis SUSPECTED_FINAL_ELEMENT_NONLINEARITY, severity HIGH — the three gates that
*produced* that verdict (G7 stiction shape, G8 Horch oddness, G9 phase geometry) are all `STRONG` and
render **grey, visually identical to "not evaluated"**, while the weaker WARN gates render amber.
The evidence signal is inverted. `CpmPerformance.tsx:31` handles `STRONG` correctly, so the same gate is
amber on one screen and grey on five others.
**Fix:** add `STRONG` → warn/bad and the three severity levels to the shared `toneFor`.

### P1-3 🔍 `cplm_gate_latest` serves a week-old replay verdict as the loop's current state
The view is `DISTINCT ON (loop_id, window_kind)` ordered first by "has a real diagnosis", and **`source`
is in the unique key but not in the ordering**. So any historical-replay row with a non-INSUFFICIENT_DATA
diagnosis outranks every live row forever. Observed: the `24h` "latest" for B2_027PIC is a **2026-07-30
batch-replay row**, while a live 2026-08-06 result exists in the same table.
**Fix:** include recency (and/or source preference) in the view's ordering.

### P1-4 ✅ Fleet endpoints join `loop_id` case-sensitively while every other read uses `lower()`
`CpmFleetController.cs:55`, `:120`, `:188` join `r.loop_id = g.loop_id` raw; `CpmAnalyticsController`
uses `lower(loop_id)` in 4 places, and the schema even creates `idx_cplm_gate_results_loop_lower`
precisely because case-insensitive lookup is the norm. A loop registered as `FIC-101` whose bridge emits
`fic-101` shows a real verdict on its detail page and `NOT_EVALUATED` across the entire fleet dashboard.
**Fix:** `lower()` on both sides of the three joins.

### P1-5 🔍 Four incompatible loop-id sanitizers — hyphenated or digit-leading tags blank every chart
Writer `IotDbWriteClient.cs:71` maps every non-alphanumeric to `_` and prefixes a leading digit with `_`.
Six frontend files use `loopId.replace(/[^a-zA-Z0-9_-]/g,'_')` — which **keeps hyphens** and adds no
digit prefix. Live behaviour: `root.site1.cpm.FIC-10409` → HTTP 400; `root.site1.cpm.101FIC` → HTTP 200
with an **empty array** (silent). Meanwhile data is being written the whole time to `FIC_10409` / `_101FIC`.
The onboarding form's own placeholder is `"FIC-10409"`. There is no `loop_id` validation anywhere.
Worse, `SafeNode` collapses `FIC-101`, `FIC.101`, `FIC 101` and `FIC_101` onto **one** device path while
the registry keeps them distinct — two loops' data would merge, last-write-wins.
**Fix:** one shared sanitizer, plus a `loop_id` validation rule at onboarding.

### P1-6 ✅ Late data is dropped with no side output; the counter exists but is never surfaced
Six `allowedLateness` calls in `CplmShortFeatureStreamJob.java` (30s → 3min), **zero**
`sideOutputLateData`/`OutputTag` anywhere. `numLateRecordsDropped` reads **~81,500–81,850 per window
operator**. Our 66,116-sample backfill produced **zero** short-feature windows — every record was
late-dropped, with no error anywhere. `GET /cpm/pipeline-metrics` exposes state/uptime/checkpoints only.
**Fix (cheapest high-value change in the system):** add `numLateRecordsDropped` per window operator to
the metrics proxy and show it on Pipeline Health. No Flink change required.

### P1-7 ✅ `mode` matching is `contains("AUTO")` — real DCS vocabularies silently exclude every window
`CplmNormalizedSample.java:93`. PI exports say `AUT`; `"AUT".contains("AUTO")` is false → `auto_pct = 0`
→ G1 EXCLUDED → `EXCLUDED_MODE` on every window, which reads as "operator left it in manual".
**`CASCADE` fails identically** — and `cplm-replay-csv-live.ps1:54-59` actively emits `"CASCADE"`, so
every cascade slave loop (a normal, fully evaluable state) is excluded. The two producers also disagree:
the same raw `CAS` becomes `CASCADE` from PowerShell and `UNKNOWN` from Python.
**Fix:** normalize mode vocabulary **in the engine**, not in each producer.

### P1-8 🔍 `0.0` means "not computed" for the metrics most likely to be read as performance
`CplmGateEngine.java:128-135` returns early on `!gate0Pass || n < 10`, leaving
`mae/rmse/iae/ise/itae/autoPct/goodErrorPct/effortRatio/travelPerDay/spMin/spMax` at Java's `0.0`;
the consumer writes them as NOT NULL columns. For this loop `mae`, `rmse`, `iae`, `travel_per_day`,
`sp_range` are non-zero in only **5 of 93 rows**. Worst case: a window with 9,637 real samples stores
`sp_min = sp_max = 0.0` when the true values are ≈ −1.5…−0.04.
`mae = 0` reads as perfect control; `auto_pct = 0` reads as "in manual"; `sp_min = sp_max = 0` reads as
a setpoint at zero. Any fleet KPI averaging these columns is biased toward zero by the 88/93 rows that
never ran.
**Fix:** persist NULL (or an `is_computed` flag) instead of 0.0, and make the KPI endpoints skip them.

### P1-9 ✅ `sufficient_data` is computed but never persisted
`CplmShortFeatureResult.java:129` emits it; the consumer's column list and self-healing DDL have no such
column; `/kpis` selects only typed columns. So the flag that distinguishes "declined to evaluate" from
"measured zero" survives only inside the payload JSONB, which that endpoint doesn't read. The KPI trend
draws MAE = 0 for windows the engine explicitly refused to judge.
**Fix:** add the column, or expose it via the payload in `/kpis`.

### P1-10 🔍 Gates 5–11 are computed and published on windows that failed G0
`computeLongDiagnostics` gates only on `n < 10` — no completeness check — and `fuse()` copies all long
metrics **before** the `!sufficientData` early return. A stored row with `completeness = 0.0601` and
`gate0_status = FAIL` nonetheless publishes `acf_period_s=550`, `triangularity=0.4846`,
`corner_score=0.9633`, `effort_ratio=26.481` and gate verdicts `G5=WARN … G11=PASS` — while
simultaneously reporting `pv_std = 0.0` and `op_std = 0.0`, which is arithmetically impossible given
`effort_ratio` is defined as σ_OP/σ_PV.
**Fix:** gate the long-diagnostic block on the same sufficiency test the short tier uses.

### P1-11 🔍 `bad_quality_pct` can never fail Gate 0
`CplmGateEngine.java:118-126`: `PASS` requires `badQualityPct < 0.05`, but the `else if` falls to `WARN`
on completeness alone and `FAIL` is completeness-only. There is no path from bad quality to FAIL, and
fusion only blocks on FAIL. Bad-quality samples are also never excluded from the metric arrays.
A transmitter failing with a held last-good value at full rate gives `completeness = 1.0` → `G0 = WARN`
→ full diagnosis computed over dead data → an engineer dispatched to a valve because a sensor died.
**Fix:** make a bad-quality majority a G0 FAIL, and exclude bad-quality samples from the metric arrays.

### P1-12 🔍 Missing `pv`/`sp`/`op` coerce to 0.0 while `isValid` stays true
`CplmNormalizedSample.java:61-63` — `asDouble(0.0)` also swallows JSON `null` and unparseable strings.
`isValid` is only cleared for a missing loop id/timestamp. With `op` stuck at 0: `effort_ratio = 0`,
`travel_per_day = 0`, `reversals_per_hour = 0` → **`G4 = PASS`, "actuator healthy"** for a valve nobody
is receiving data from. The live plane publishes `op = 0.0` with `quality = "GOOD"` to the HMI faceplate.
**Fix:** treat a missing required role as invalid, not as zero.

---

## P2 — Medium (misleading, but narrower blast radius)

| # | Issue | Evidence | Status |
|---|---|---|---|
| P2-1 | **FFT "validated period" is the record length.** The UNKNOWN profile sets `tauMaxS = 86400`, so bin 1 is never excluded and every 24h window reports `validated_period_s = 86400` with `completed_cycles = 1`. Triangularity is then fitted over one "cycle" = the whole day, giving ~0.50 (coin flip) — and **G7 reports PASS**, i.e. "no stiction", for a test that never ran. | `CplmGateEngine.java:743-840`, `:491-499` | 🔍 |
| P2-2 | **Site-prefixed tags fall through to the UNKNOWN dynamics profile.** `inferFromTag` matches on first character; `B2_027PIC` starts with `B` → UNKNOWN, not PIC. That sets `tauMaxS = 86400` (root cause of P2-1) and disables the geometry family (G9) entirely. Real plant tags are almost always site-prefixed. | `CplmLoopDynamicsProfile.java:206-220` | 🔍 |
| P2-3 | **`effort_ratio` is dimensionally inconsistent** — σ(OP in %) / σ(PV in engineering units) = 83.03 here against thresholds of 3/8, so `G4 = STRONG` on every evaluable window. Any loop whose PV has small-magnitude units reports "strong actuator effort" regardless of behaviour. | `CplmGateEngine.java:214` | 🔍 |
| P2-4 | **`corner_score` is noise-dominated** — no OP-movement qualification, so nearly every vertex on 5s noisy data is a "sharp corner": 815 of 861 rows read > 0.90. The fix already exists in the code (`cornerScoreQualified`) but the API and UI expose the raw one. | `CplmGateEngine.java:1034,1040` | 🔍 |
| P2-5 | **Replay and streaming compute different numbers from the same data.** `fuseFromSamples` substitutes an empty long-diagnostics result when short data is insufficient; the streaming path does not. Result: a window with *less* data reports *more* metrics. Both are stored as authoritative and `/gates/latest` can surface either. | `CplmGateFusionEngine.java:645-646` | 🔍 |
| P2-6 | **`> 0` used as a null-check in fusion** — a genuine zero is treated as missing and silently replaced with another stage's value, computed on a different sample set. This is the mechanism behind the `pv_std=0` + `effort_ratio=26.5` contradiction. | `CplmGateFusionEngine.java:97,102,146,157` | 🔍 |
| P2-7 | **Replay provenance is discarded for feature rows.** Gate rows keep `source='flink-historical-replay'`; short/long rows hardcode `'flink'`, so a recompute overwrites streaming KPI rows in place and you cannot tell them apart. It also makes `/gates` return the same `windowEnd` twice, which makes Investigation's "previous vs current" table compare a window against itself — every delta renders `0.00`. | `CplmResultConsumerService.cs:226` vs `:317` | 🔍 |
| P2-8 | **`recommendation` is the diagnostic reason, shown as "Next-best action".** `blockDiagnosis` sets `recommendation = reason`, so the Investigation panel tells the operator `"G1 mode/service EXCLUDED"` — a gate code, not an action — for 585 of 643 stored rows. | `CplmGateFusionEngine.java:479-480` | 🔍 |
| P2-9 | **`criticality` bypasses validation into a Postgres CHECK → HTTP 500.** `loopType` *is* validated in code (clean 422 listing valid values); its neighbour isn't. Also, the self-healing DDL omits the CHECK the migration has, so the two environments disagree about what's valid. | `CpmLoopRegistryService.cs:286-308` | ✅ |
| P2-10 | **Registry `unsPath` values are dead config** — zero readers in any Flink job, binding-resolver, historian-bff or controller. The historian path is `LoopRootPrefix + SafeNode(loopId)`. The two registered loops even use mutually incompatible formats (`root.site1.b2.b2_027pic.pv` vs `site1/unit1/G13_LOOP_A.pv`), neither of which resolves. The UI displays them as binding provenance. | `CpmLoopRegistryService.cs:203` | ✅ |
| P2-11 | **UI hardcodes a 5s sample period** while the engine publishes `sample_period_sec` and `expected_sample_count` per window (neither is exposed by `/kpis`). A 1s loop reports 20% completeness when it is complete. | `CpmWindows.tsx:22` | 🔍 |
| P2-12 | **Unevaluated gates are labelled "Outside"** (i.e. out of spec). Only the literal `NOT_EVALUATED` is special-cased; `PENDING` and `INSUFFICIENT_EVIDENCE` fall through to the else branch. | `CpmCalculations.tsx:86-90` | 🔍 |
| P2-13 | **UTC instants formatted in browser-local time with no zone label**, while CSV export writes raw UTC ISO. An operator at UTC+5 sees `16:49` on screen and `11:49:00Z` in the export. ~25 call sites. The underlying epoch handling is clean — this is display only. | `CpmHistorical.tsx:168-170` et al | 🔍 |
| P2-14 | **`acked_by` is written from a claim the token may not carry** (`User.Identity?.Name`) while the audit trail uses `Actor()` (`preferred_username`). The evidence store can record `"unknown"` while the audit records the real user. | `CpmEventsController.cs:82` vs `:33` | 🔍 |
| P2-15 | **`EnsureTimeseriesAsync` marks a device ensured *before* the CREATE runs** and discards the result. A transient IoTDB outage on first write leaves that device permanently unpinned for the process lifetime — defeating the mechanism in exactly the case it exists for. | `IotDbWriteClient.cs:81-92` | 🔍 |
| P2-16 | **`GetStatusAsync` hardcodes `gateResults: 0`** (never queried) and leaves `state = "UNKNOWN", finished = false` **forever** if Flink 404s an archived job. The UI shows a successful recompute that produced nothing, or polls indefinitely. | `CplmRecomputeService.cs:129,144-145` | 🔍 |
| P2-17 | **Poison-pill livelock in the 500-row IoTDB batch.** One bad value rejects all 500 rows; offsets are withheld; the identical batch is redelivered forever. No DLQ, no bisect, no retry ceiling — only a repeating warning. | `IotDbWriteClient.cs:139-162` | ❓ |
| P2-18 | **Silent, unlogged sample drop in the IoTDB consumer's parse path** — two `return false` branches with no log and no counter, while offsets advance regardless. A field rename would stop the historian gaining data with zero diagnostics. | `RawLoopIotDbConsumer.cs:144-173` | ❓ |
| P2-19 | **A UTF-8 BOM in Kafka message keys splits one loop across two partitions.** `"﻿G13_LOOP_A"` (9 msgs) hashes differently from `"G13_LOOP_A"` (17,276 msgs). With `withIdleness(1min)`, the sparse partition drops out of watermark computation and its records then arrive late → dropped. Also `CPA/CPAMAIN/scripts/inject-loop-hour-data.ps1:80` omits `parse.key` entirely → null key → round-robin across all 16 partitions. `B2_027PIC` is unaffected. | live partition scan | 🔍 |
| P2-20 | **`quality` vocabulary is exact-`GOOD`-only** in the engine (`Good_NonSpecific`, `192` all count as bad), while `useLoopLive.ts:66-72` expects OPC **numerics** and would return red "BAD" for the string `"GOOD"`. Neither handles `MAINTENANCE`/`OUT_OF_SERVICE`, which CLAUDE.md's NE107 rule mandates. | `CplmNormalizedSample.java:88-90` | 🔍/❓ |
| P2-21 | **Sparkplug edge node auto-commits Kafka offsets independently of MQTT delivery** and treats "MQTT not connected" as a non-error. An EMQX restart longer than the auto-commit interval permanently drops every alarm change and RBE delta in that window; because the plane is report-by-exception, the HMI keeps painting stale values. | `AlarmMetricPublisher.java:99,559-563` | 🔍 |
| P2-22 | **historian-bff never checks IoTDB's embedded response `code`** — IoTDB REST returns HTTP 200 with a non-200 body code on query failure, so `/trend`, `/raw` and `/summary` return `200 {points: []}`. The *write* client in the same repo guards against exactly this. An operator reads a flat/empty trend as "the process was steady". | `historian-bff/IoTDbClient.cs:22-34` | 🔍 |
| P2-23 | **`TrendCore` converts every per-pen fetch failure into an empty series** with no banner and no console warning — one pen silently vanishes while its siblings plot normally. | `TrendCore.tsx:253-274` | 🔍 |

---

## P3 — Low

- **`window_area_norm` exceeds 1.0 in 43 of 93 rows** (max 1.17). The shoelace sum takes `abs` *after*
  summation, so counter-rotating sub-loops cancel and multiply-wound trajectories exceed the bbox.
  G9's band `[0.05, 1.5]` implies a [0,1] fraction — both tails are mis-scaled. `CplmGateEngine.java:983-989`
- **IAE/ISE/ITAE integrate with the median Δt applied uniformly**, so they scale with *sample count*, not
  window duration — a 95%-complete window reports ~95% of the true integral while being labelled a 24h IAE.
  ITAE also anchors to the first *present* sample, not `windowStart`. `CplmGateEngine.java:191-194`
- **`G12`/`G13` report `EXCLUDED` when they were never evaluated** — the field default survives
  `blockDiagnosis`. The G0-fail path correctly says `NOT_EVALUATED` for the identical situation. `CplmGateResult.java:154-155`
- **`validated_period_s` is unstable across adjacent windows** — 1200 → 430 → 3520 → 1280 s on 15-minute
  steps over the same signal, flipping G9 between IN_BAND and BELOW_BAND on noise.
- **Historian prefix `root.site1.cpm` is configurable server-side but hardcoded in six frontend files**
  (plus `iotdb-init-ttl.sh`). Repointing for a second site blanks every chart with no error.
- **`PENDING` sentinel leaks into the public gate vocabulary** (2,400 stored cells) — not in `GateDefs`,
  not in any frontend map, not documented as an API value.
- **`dynamic_class` and `dynamics_class` are both written; only `dynamics_class` is read.** `CplmGateResult.java:196,199`
- **OP is assumed 0–100% with no way to declare otherwise** — a 0–1 valve fraction makes G2r pass
  unconditionally and saturation read 0. The registry has no engineering-range fields.
- **Case-insensitive SQL lookups against case-sensitive storage keys** — `fic-101` and `FIC-101` would be
  two registry rows and two IoTDB devices returning one merged analytics answer.
- **historian-bff's compose healthcheck is TCP-only** while its own `/health` correctly probes IoTDB and
  Redis — the container reports healthy with the historian down.
- **`/health` in cplm-api proves only Postgres.** Both Kafka consumers can be stuck in an unbounded DDL
  retry loop, or not registered at all (a misspelled `Cplm__ConsumersEnabled` defaults to `false`), and
  health stays green with the backlog growing.

---

## Data-quality note — the test data itself has a corrupt SP tag ✅

Not a pipeline bug, but it invalidates any benchmark run on the later part of this dataset:

| day | SP rows identical (timestamp **and** value) to a PV row |
|---|---|
| 7/26 | 0 / 4 |
| 7/27 | 0 / 3 |
| **7/28** | **701 / 717** |
| **7/29** | **738 / 738** |
| **7/30** | **245 / 249** |

From 07-28 onward the SP export is a verbatim copy of PV — the classic mis-mapped-tag signature. The
engine has no `SP ≡ PV` sanity check, so for 07-29 it computed `mae = 0.0, good_error_pct = 1.0, G3 = PASS`
— arithmetically correct, physically meaningless, on a day the loop was 100% in MANUAL with the valve
shut. Only the independent G1 mode exclusion prevented a "perfect loop" verdict.
**Recommend:** re-export SP for 07-28…07-30, and add an `SP ≡ PV` guard to the engine.
*(2026-07-27 is clean — SP was genuinely flat at −1.5 — so that window's `mae = 0.0743` is a real measurement.)*

---

## Verified clean — do not spend time here

The independent recompute is the strongest positive result in this audit:

- **The arithmetic is correct.** All 48 metrics recomputed from the raw CSVs for a reference 24h window
  match the stored payload to ≤2×10⁻¹¹ relative — floating-point summation noise only. MAE, RMSE, IAE,
  ISE, ITAE, completeness, auto_pct, effort_ratio, travel, reversals, saturation, freeze, quantisation,
  ACF, FFT, Horch oddness, triangularity and phase geometry are all computed exactly as written.
  Five more windows matched on every column.
- **Gate threshold logic is correct.** Re-deriving G0–G14 from each row's own stored metrics across
  **all 93 rows produced 0 threshold violations.** The problems above are about *what is measured* and
  *what is published*, not about the comparisons.
- **Metric field names, end to end** — all 98 payload fields pass through untouched; all 25 the frontend
  reads exist in the live payload. **Zero name mismatches.**
- **Timestamp/epoch handling in the data path** — verified byte-exact from Python through Kafka, Flink,
  Postgres `timestamptz` and back out as ISO-with-`Z`. No double conversion, no naive local time.
- **At-least-once persistence and idempotency** — `EnableAutoOffsetStore=false` + `StoreOffset`-after-persist
  is correct; `rows == distinct keys` on all three tables (643/4,080/878), so redelivery has produced
  **zero** duplicate rows.
- **Kafka → IoTDB conservation is exact** — 66,797 messages on the partition, 66,797 rows in IoTDB.
- **G13 / `HAS_PEER_LINKS` is genuinely wired** — writer, broadcast key, reader and the fusion connect
  all match. (This was dead in both original codebases; it is not dead now.)
- **The gate-status rollup contract**, `ack_state` vocabulary, window-kind catalogues, IoTDB datatypes,
  and the trend/raw-cursor read path all check out.
- **Auth policy registration** — every key in `Perms.All` gets a policy; the referenced-but-unregistered
  defect that bit us earlier is not present in cplm-api.
- **The `cplm-api` compose healthcheck is correct** (the reported bug was a false positive — see the header).

---

## Suggested order of work

1. **P0-1** (cancel the duplicate job) — one command, stops active double-processing.
2. **P0-3, P0-4, P1-2, P1-4** — four small, self-contained fixes; two of them (`latest()`, `good_error_pct`)
   are one-liners with large blast radius.
3. **P0-6** (upsert guard) — three `WHERE` clauses; closes the silent-corruption surface.
4. **P1-6** (surface the late-drop counter) — best value-per-effort in the system.
5. **P0-2 / P1-1** — the two that need real design thought: the long-job state model, and what
   `freeze_index_s` should actually measure on a compressed historian feed.
