# CHG-102 — what we did (to the point)

Branch `feat/v25-next-release`, 2026-11-01 .. 2026-11-04. Not yet released (draft release `v2.9.0`).
Full plan: `plan-iotdb-postgres.md`. Plant settings: `prod_decision.md`. Change record: `changes_tracker.md` (CHG-102).

## 1. The problem we solved

The plant disk (96 GB, shared) limited history to days:

| Data | Before |
|---|---|
| Live evidence | 6 h |
| Verdict history | 14 d |
| Fleet KPI history | 14 d |
| Short / long features | deleted by a cron every 30 min |

The SME asked for 24 h evidence kept long term, and any other window on demand.
The answer: **IoTDB holds the time series; Postgres holds what pages need instantly, plus one packed evidence set per day boundary.**

## 2. What we built, phase by phase

| Phase | What | Where it lives |
|---|---|---|
| 1 | IoTDB layout v2: aligned raw template, KPI databases `root.hdpe.kpi` / `root.hdpe.kpis` | `infra/docker/iotdb-layout-v2.sh`, ams-api writer (switched on with the CHG-101 move) |
| 2 | Only LIVE verdicts are written to the IoTDB KPI history (no replays mixed in) | cplm-api |
| 3 | Tiered reads: loop KPI stream and verdict history continue into IoTDB beyond Postgres | cplm-api `/kpis`, `/gates?projection=summary` |
| 4 | Postgres hot window by partition DROP: short features 6 h (hourly partitions), long 1 d; the delete cron retired | cplm-api + migration `cpm-17` (plant only) |
| 5a | Every loop gets a complete evidence set at each **plant-day boundary**: 12 h at local 00:00 and 12:00, 24 h at 00:00. Plus a fix for findings that flapped every 15 min | Flink Long + Fusion jobs |
| 5b-1 | **Evidence archive:** each boundary set is packed losslessly into one row and kept 30 d / 12 GiB | cplm-api + `cpm-19` |
| 5b-2 | Archived raw-sample columns proven bit-identical to IoTDB are stored as a verified reference (about 57 % less space) | cplm-api (only with layout v2) |
| 5c | **On-demand evaluation** of any window from IoTDB: one standing Flink job, no job start per click | new Flink job + cplm-api + Workbench + `cpm-20` |
| 5c | Episodes and pins keep only the archived sets they need (30 d after close / 4 GiB); a pin no longer keeps a whole day | cplm-api + `cpm-20b` |
| 6 | Fleet KPI history **3 years**, one row per loop per plant day; trend ranges 14 d / 90 d / 1 y / 3 y with drilldown | cplm-api + `cpm-18` + KPI page |
| 6 | Plant day follows `PLANT_TIME_ZONE` (`local` / `UTC` / `IR` / IANA / `+HH:MM`) | cplm-api + Flink submit scripts |
| 8 | IoTDB backup (nightly, restore drill passed), daily check 7b, records, draft release manifest | `migration/backup-iotdb.sh`, `migration/daily-check.sh` |
| perf | Caches for method-run lookups and unpacked archive sets | cplm-api |

## 3. Which data comes from IoTDB now

### Raw samples: `pv`, `sp`, `op`, `vp`, `mode` per loop

ams-api writes them, as before.

| Reader | Since | Notes |
|---|---|---|
| Loop trends and Workbench "Signal context" lanes (historian-bff) | before CHG-102 | unchanged |
| **On-demand evaluation** ("Evaluate a window") | **CHG-102 5c** | the engine re-runs short + long + fusion over any window the historian holds (90 d) |
| Evidence reconstruction / replay with `source=iotdb` | v2.5 | unchanged |
| **Archived evidence with trace references** | **CHG-102 5b-2** | on read the raw columns are re-read from IoTDB and re-hashed; served only if bit-identical. **Only after the layout v2 move** |

### KPI / verdict history: `.kpi.*` families, written by cplm-api

| Reader | Since | Notes |
|---|---|---|
| **Loop KPI stream** (`/kpis`) older than the oldest Postgres row | **CHG-102 3** | tiered; `source` per row, `degraded` if IoTDB fails. **Active only with `IotDb:Layout=v2`** (after the CHG-101 move); until then Postgres only |
| **Verdict history summaries** (`/gates?projection=summary`) older than Postgres | **CHG-102 3** | same condition |

### Still in Postgres (not IoTDB)

| Data | Kept |
|---|---|
| Verdicts | 14 d |
| Live evidence | 6 h |
| **Evidence archive** | 30 d / 12 GiB |
| **Fleet KPI daily history** | 3 y |
| On-demand evaluation runs and their evidence | 3 d |
| Episodes, notes, configuration | as before |

**Backup.** IoTDB is now the only copy of history beyond the Postgres window. `migration/backup-iotdb.sh` exports it nightly; cron `cpa-iotdb-backup`, 30 runs kept.

## 4. What changed in the Evidence Workbench

### What the user sees

1. **"Evaluate a window from the historian"** (under *Change*): pick 4 h / 12 h / 24 h and an end time, then Evaluate.
   - Queued → running → the result opens by itself.
   - The verdict shows in about 1–2 s; evidence panels fill as the artifacts land.
   - The same window again returns at once (kept 3 days).
2. **An evaluated window shows its own verdict**, tagged **EVALUATE** in the header (URL `?analysisRun=…`), even where the live engine also judged that window.
3. **Evidence basis "Evaluated from the historian"**: says the verdict and arrays are the evaluation's, kept 3 days. The old sentence "verdicts come only from the live engine" is no longer shown there.
4. **Evidence older than 6 h still opens for boundary windows:**
   - which windows: the 12 h windows ending at plant 00:00 / 12:00 and the 24 h window ending at 00:00;
   - for: 30 days;
   - from the archive, byte-identical (same checksums and ETag);
   - labelled **Retained proof**, like live evidence. The screen does not distinguish archived from live; the API's `source` field does (`LIVE` / `ARCHIVE`).
5. **Other windows older than 6 h:** "Reconstruct evidence" (one gate's run) or "Evaluate a window" (the whole set).

### Behind the screen

| Change | Effect |
|---|---|
| Every loop gets evidence at each plant-day boundary (5a), whether or not it has a finding | there is always a healthy reference window to compare with |
| Flapping fix (5a) | a finding that changes every 15 min no longer re-emits evidence each time (interval applies to changes too) |
| Rebuild-beside fix (E2E 2026-11-04) | a reconstruction or evaluation of a window whose live rows aged out no longer hides its archived proof; the proof shows and the rebuild is listed beside it |
| Caches (perf) | opening a run on the lab: 2.1 s → 0.26 s (p50); archived sets unpacked once per 10 min, not on every request |
| Pins and episodes keep their archived sets | an investigation's pinned evidence survives the 30-day archive drop; an episode keeps the sets it overlaps until 30 d after it closes |

## 5. How it was tested

- **Unit / integration:** cplm-api suites per phase; Flink 388; frontend 146; release scripts 63.
- **Lab E2E**, after a full Flink swap to the release jar: `scripts/test-chg102-e2e.py` **20/20**. It checks:
  - migrations;
  - jobs and jar;
  - tiered reads;
  - KPI trend and zone;
  - boundary evidence for every loop;
  - the archive, including delete-live → same bytes from the archive;
  - an evaluation and its isolation from live rows;
  - the backup tool.
- **Regression:** slice-1 E2E 18/18.
- **Restore drill:** an IoTDB export loaded into a fresh IoTDB — identical counts per series.
- **Browser:** KPI trend, Workbench (live, archived, evaluated), day / night, 1440 / 768 px.

### Lab performance (warm p50)

| Endpoint | Time |
|---|---|
| Overview KPIs | 29 ms |
| KPI trend 14 d – 3 y | 21–32 ms |
| Archive list | 24 ms |
| Archived manifest / bundle | ~90 ms |
| Evaluation click → verdict | 1.3–1.7 s |

Lab-only slowness: the first open of a run (compressed hypertables; the plant's plain partitions use the index).

## 6. Open before the plant

- Release name / scope (`v2.9.0` draft; CHG-103 in or out), and ams-open-cf's CHG-101 files committed so the build can run.
- `PLANT_TIME_ZONE=IR` in the plant `migration/.env`.
- Plant check: are raw source values 32-bit? This decides whether trace references can save space after the v2 move.
- SME D7 (compact archive after 90 d — not built); D5 (backups carry the archive or not).
- Consider On-Demand job parallelism 2 if several engineers evaluate at once (a burst queues; one evaluation ≈ 1.3 s).
- Lab FIC10401: Nov 2–3 is a 24 h-shifted copy of its own Nov 3–4 samples (test data for the Workbench); its evaluated evidence expires about Nov 7.
