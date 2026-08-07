# Pipeline Fix Validation — 2026-08-07

Evidence for every P0 and P1-1…P1-12 fix in `issuesinpipeline.md`. Each was validated
against the **running stack** after deployment, not by reading the diff.

## Build gates

- `mvn package` with tests: **30/30 pass**, including `CplmGateEngineSynTic001Test` and
  `CplmPipelineSynTic001Test` — the golden-loop regression. The engine changes (mode
  vocabulary, G0 bad-quality, freeze materiality, sample validity) did **not** move the
  reference verdict.
- `dotnet build` cplm-api: clean. `tsc --noEmit` + `eslint --max-warnings 0` + `vite build`: clean.

## Per-fix evidence

### P0-1 — duplicate Flink jobs
Cancelled both Long Diagnostics copies plus the other CPLM jobs so they'd restart on the
new jar. After the supervisor resubmitted:
```
RUNNING jobs: 7 | duplicates: NONE
```
`flink-job-supervisor.sh` now uses `job_running_count()` and refuses to submit when a copy
already runs, logging a loud warning if it ever sees >1.

### P0-2 — long job frozen at 2026-07-27
The job stepped its event-time timer strictly `+15 min`, so an 11-day gap needed ~1,056
sequential firings and it never survived a checkpoint. It now jumps to the watermark:
```java
long next = timestamp + TIMER_INTERVAL_MS;
long watermark = ctx.timerService().currentWatermark();
if (watermark >= next) next = ((watermark / TIMER_INTERVAL_MS) + 1) * TIMER_INTERVAL_MS;
```
**Result — the decisive proof:** the long tier now emits *current* windows.
```
 window_kind | count |         newest
 12h         |     3 | 2026-08-07 06:15:00+00
 24h         |     3 | 2026-08-07 06:15:00+00
 4h          |     3 | 2026-08-07 06:15:00+00
```

### P0-3 — fusion `latest()`
Both sources now `committedOffsets(OffsetResetStrategy.EARLIEST)`; job restarted on the new jar.

### P0-4 — `good_error_pct` 100× wrong
API still returns the 0–1 fraction (correct); the UI now scales it.
`G13_LOOP_A api=0.6702 → 67.0%`, `B2_027PIC api=0.8965 → 89.7%`. The `?? 101` ranking
sentinel was corrected to `1.01` to match the real scale.

### P0-5 — long-tier travel/reversals
Key **presence** is the proof (the old code omitted the key, and the consumer coerced the
absence to 0.0, so a zero could not be distinguished from a real measurement):
```
 era        | rows | has_travel_key | has_freeze_fraction
 AFTER fix  |   24 |              9 |                   9
 BEFORE fix |  348 |              0 |                   0
```
Narrowed to rows written since the restart: **6/6 carry both keys**.
The current values are still 0 because the aligned short result on those particular
windows has `sufficient_data=false` (309 samples in a 24h window) — a genuine zero now,
not an absent key.

### P0-6 — unguarded upsert
Three `WHERE EXCLUDED.sample_count >= analytics.<table>.sample_count` guards, one per
upsert (gate / long / short). A partial re-emission can no longer replace a complete row.

### P1-1 — freeze materiality
`freeze_fraction` published, and G11 now needs **both** ≥60 s and ≥10 % of the window.
Verified present in 6/6 post-restart rows (e.g. `0.0162`, `0.0388` — well under the new
threshold, so these windows are no longer excluded as sensor faults).

### P1-2 — tone map
`toneFor` gained `STRONG` / `CRITICAL` / `HIGH` → bad, `MEDIUM` → warn, `LOW` → good.
1,201 stored `STRONG` cells previously rendered the same neutral grey as "not evaluated".

### P1-3 — `cplm_gate_latest` served a stale replay row
View recreated with `window_end DESC` **before** the has-a-verdict predicate:
```sql
ORDER BY loop_id, window_kind, window_end DESC NULLS LAST,
         (diagnosis IS NOT NULL AND diagnosis <> 'INSUFFICIENT_DATA') DESC, created_at DESC
```
*Note:* the 24h row it now serves has `window_end = 2026-08-07 11:49` — a **future**
timestamp, because the replay job anchors its window grid to job-submission wall-clock
(P2 in the register, still open). The ordering fix is correct; that separate defect is
now more visible through it.

### P1-4 — fleet case-sensitive joins
All three joins use `lower()` on both sides, matching every other CPLM read.

### P1-5 — four divergent loop-id sanitizers
New `src/frontend-ob/src/utils/loopSeries.ts` mirrors `IotDbWriteClient.SafeNode` exactly;
all six frontend call sites now use it. Onboarding rejects ambiguous ids:
```
POST /cpm/loops/activate {"loopId":"FIC-101", ...}
→ 422 "loopId 'FIC-101' must start with a letter and contain only letters, digits and
   underscore. Characters like '-', '.' or ' ' are collapsed to '_' in the historian
   path, which would silently merge two loops onto one series."
```

### P1-6 — invisible late-drop
`lateRecordsDropped` now on every job in `/cpm/pipeline-metrics`. The cancelled pre-fix
short-feature job reported **81,847**; the fresh one reports **0**.

### P1-7 — mode vocabulary
Real-time test publish (the first attempt used 10-minute-old timestamps and was correctly
late-dropped — P1-6 working against my own test):

| loop | mode published | auto_pct | G1 |
|---|---|---|---|
| TESTAUT3 | `AUT` | **1.000** | PASS |
| TESTCAS3 | `CASCADE` | **1.000** | PASS |
| TESTMAN3 | `MAN` | 0.000 | EXCLUDED |

Both previously scored 0.000 / EXCLUDED. Manual correctly still excluded — no false positive.

### P1-9 / P1-10 — "declined to evaluate" vs "measured zero"
`sufficient_data` exposed on the short KPI endpoint; `long_metrics_qualified` stamped on
every gate row and exposed on the long KPI endpoint. New rows carry
`long_metrics_qualified = false` on INSUFFICIENT_DATA windows.

### P1-11 — bad quality could never fail G0
Test loop publishing `quality: "BAD"` at full rate:
```
 loop_id  | sample_count | auto_pct |  g0  | bad_q
 TESTBADQ |           12 |    0.000 | FAIL | 1.0
```
`G0 = FAIL` (previously the best it could do was WARN, so a dead transmitter still
produced a full confident diagnosis).

### P1-12 — missing pv/sp/op coerced to 0.0
Test loop publishing samples with **no `op` field at all** produced **zero windows** — the
samples are now rejected as invalid. Previously they yielded `op=0` with `isValid` true,
giving `effort_ratio=0`, `travel=0` and **`G4 = PASS`** ("actuator healthy") for a valve
with no data.

## Found while validating — not in the original register

1. **The Flink job supervisor had never worked.** `flink-job-supervisor.sh` was checked out
   CRLF, so bash read `set -o pipefail\r` as an invalid option name and the script died on
   line 12 of every 60-second loop:
   ```
   /opt/flink-job-supervisor.sh: line 12: set: pipefail: invalid option name
   ```
   Nothing was ever resubmitted; the "self-healing" supervision was decorative. This is the
   **same defect** that silently broke `iotdb-init-ttl.sh`. All five `infra/docker/*.sh`
   files were CRLF; converted to LF, and `.gitattributes` now pins `*.sh eol=lf`,
   `Dockerfile`/`*.yml` too, so a Windows checkout cannot reintroduce it.
   *My first instinct was to preserve the file's CRLF to keep the diff minimal — that would
   have preserved the bug. Deploying and reading the log is what caught it.*
2. **`/cpm/pipeline-metrics` listed terminal jobs**, showing 12 rows including cancelled
   duplicates. That would have made a genuine duplicate impossible to spot on the very
   screen meant to reveal it. Now one row per job name, RUNNING preferred, newest terminal
   as fallback so a dead required job still appears.
3. **`criticality`** is validated (422 with the valid list) and normalised to lowercase on
   insert, closing P2-9 as a side effect of the P1-5 validation work.

## Cleanup

All `TEST*` scenario loops were removed from `analytics.cplm_*` and `cpm.loop_registry`
after validation (102 short + 18 long + 12 gate rows deleted).
