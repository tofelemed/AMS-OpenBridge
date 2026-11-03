# Plan — IoTDB + PostgreSQL storage split (CPM / CPLM)

Date: 2026-11-03 · Status: **plan, nothing built** · Change: CHG-102 (reserved; evidence archive + storage split)
Design basis: `storage-architecture-iotdb-postgres.md` · Related: `evidence-and-historian-retention.md`,
`recompute-from-iotdb.md`, CHG-101 (IoTDB loop tree `root.site1.cpm` → `root.hdpe.cpm`, ams-open-cf, in progress).

Built from four code surveys (2026-11-03): PostgreSQL readers/writers, IoTDB writers/readers, evidence contents,
retention/migration/ops conventions. File references are `path:line` at the time of the survey.
Figures marked *(est.)* are estimates that Phase 0 replaces with measurements.

---

## 1. Findings that shape the plan

| # | Finding | Evidence | Consequence |
|---|---|---|---|
| F1 | **Only cplm-api reads the PG result tables** at runtime; the frontend never touches storage directly | survey 1 | storage can change behind the same API — **frontend contracts stay as they are** |
| F2 | cplm-api already **dual-writes every KPI to IoTDB** (`<prefix>.<loop>.kpi.{gate_*,short_*,long_*}`) — but **nothing reads it**, the write is best-effort (result ignored) and **not filtered by purpose** (SHADOW / REPLAY rows overwrite the LIVE point of the same window) | `CplmResultConsumerService.cs:307-318, 377-378, 389-413` | the KPI history in IoTDB today is not trustworthy enough to be the only copy; fix before relying on it |
| F3 | At the plant the feature tables hold **6 h (short) / 24 h (long)** (cron DELETE, `migration/prune-short-features.sh`), so `/cpm/historical` presets 7 d / 30 d / 90 d (`historical/timeRange.ts:16-21`) show **nothing** for KPI overlays beyond that | survey 1 §1 | moving KPI history to IoTDB **adds** history the pages already ask for |
| F4 | Gate (verdict) history is capped at **14 d** (`GATE_RESULTS` row; `CpmFleetKpiController.cs:127` `MaxTrendDays = 14`) | survey 1 §2 | anything older must come from somewhere cheaper than full PG rows |
| F5 | The short-feature table is **1.1 GB on disk for 6 h of rows**: daily partitions + DELETE cron = dead tuples until the day partition is dropped | plant 2026-11-03 | hourly partitions + DROP, cron retired |
| F6 | Nothing sets an IoTDB **encoding, compressor, template or aligned** layout anywhere; all series use 1.3.2 defaults (DOUBLE/GORILLA, TEXT/PLAIN, LZ4) | survey 2 §1, §3 | one place to fix: the `root.hdpe` creation (CHG-101) |
| F7 | `mode` as INT32 would break 4 places: raw writer sends `'AUT'` (whole batch rejected → consumer pauses), replay source turns `1` into `"1"` (= not AUTO), two frontend views drop non-string modes, `/last` returns 1.0 | survey 2 §2 | **keep mode TEXT with DICTIONARY encoding** — same space win, zero code change |
| F8 | FLOAT pv/sp/op/vp is already parsed everywhere (replay `dbl()`, historian-bff, frontend `number`) | survey 2 §2 | FLOAT is safe for readers |
| F9 | In a 24 h evidence set ~80–90 % of bytes are **n-length arrays** (17,280 rows); of those, G10 `actuator_limits`, G11 `measurement`, G13 `aligned_series`, G9 `cycle_polygon` are **slices of PV / OP / VP that IoTDB already holds** | survey 3 §1, §5 | the archive stores derived arrays only; traces are re-read from IoTDB |
| F10 | The workbench **already** draws PV/SP/OP/VP/mode lanes from `/api/hist` when G0 arrays are absent (`HistorianLanes.tsx:48-67`) | survey 3 §3 | trace-from-historian is a proven UI path |
| F11 | G0 quality / hold / arrival / age **are not in IoTDB** (replay fakes GOOD) | `IotDbBoundedSource.java:124,142-161` | short-tier rebuilds are labelled "quality assumed" unless a quality column is added (D5) |
| F12 | IoTDB 1.3.2 TTL is **per database**; the 730 d TTL on `**.kpi.**` is silently overwritten by the database's 90 d | `iotdb-init-ttl.sh:109-120` | KPI history needs **its own database** to get its own retention |
| F13 | **IoTDB has no backup**; PG has `backup-cplm-db.sh` | survey 4 §4 | IoTDB becomes a system of record → backup is a prerequisite, not an extra |
| F14 | cplm-api has **no Redis**; "latest" reads use in-process `IMemoryCache` 15 s (`FleetReadCache.cs`) — the storage doc's "Redis latest" is aspirational | survey 1 §5 | no Redis work in this plan; fleet pages stay as they are (0.14 s) |
| F15 | The CHG-101 move script creates **no series or template**; `select … into` auto-creates non-aligned DOUBLE/TEXT targets (`iotdb-move-loop-tree.py:241-302`) | survey 2 §4 | the template must be set between `prepare` and `copy`, and `copy` must cast + write aligned |

---

## 2. Target split — what lives where

### 2.1 IoTDB (time series, compressed, long-lived)

| Database (own TTL) | Device | Measurements (type / encoding / compressor) | Written by | TTL |
|---|---|---|---|---|
| `root.hdpe.cpm` (raw) | `<loop>` — **aligned**, template `cpm_raw` | pv, sp, op, vp **FLOAT / GORILLA or CHIMP / ZSTD**; mode **TEXT / DICTIONARY / ZSTD**; optional `q` quality code INT32 / RLE (D5) | ams-api `RawLoopIotDbConsumer` | SME: **1 year** recommended (D2) |
| `root.hdpe.kpi` (**new**, KPI + verdict history) | `<loop>.<family>` — aligned, families `gate_12h`, `gate_24h`, `long_4h/12h/24h` | today's KPI fields **FLOAT / GORILLA / ZSTD**; diagnosis, severity, **G0–G15 statuses, band, family, config version, engine version** **TEXT / DICTIONARY** | cplm-api result consumer (LIVE only) | **3 years** |
| `root.hdpe.kpis` (**new**, short KPIs) | `<loop>.short_<wk>` (1m … 60m) | short fields FLOAT; `sufficient_data`, `evaluation_state`, G0–G4 statuses TEXT / DICTIONARY | cplm-api (LIVE only) | **90 days** (D3) |
| `root.hdpe.cpm1m` (optional, D4) | `<loop>` aligned | pv/sp/op/vp min, avg, max per minute (FLOAT) | IoTDB continuous query | 3 years |
| `root.ams` (unchanged) | alarm tree | as today | Flink `IoTDBPersistenceJob` | 365 d |

Why separate databases: per-database TTL on 1.3.2 (F12), and the raw template must not auto-activate on KPI
devices (survey 2 §1 inference: today KPI devices sit *under* the loop device).

### 2.2 PostgreSQL `traverse_cplm` (context, decisions, hot window)

| Data | Kept | Change |
|---|---|---|
| `cplm_gate_results` full rows (fleet pages, evidence links, audit) | **14 d** | unchanged (slimming = optional Phase 7) |
| `cplm_long_feature_results` | **24 h hot window** | partition DROP instead of cron DELETE |
| `cplm_short_feature_results` | **6 h hot window** | **hourly** partitions, DROP; cron retired |
| Evidence live / episode / reconstruction cache | 6 h / 2 d / 3 d | unchanged |
| **`evidence_archive`** (new, day-partitioned) | 24 h sets: full detail 90 d, compact to 3 y | Phase 5 |
| **`cplm_kpi_daily`** (new) — per loop per day, every Overview KPI + rule version | 3 y | Phase 6 — fleet KPI trend beyond 14 d with loop drilldown (project rule) |
| Episodes, acks, shelving, notes, reviews, config history, bundles, registry, analysis runs, response (G12) | as today | unchanged — relational, transactional, decisions |

### 2.3 How the application fetches — one API, tiered behind it

| Page / endpoint | Range ≤ hot window | Older range | Frontend change |
|---|---|---|---|
| `GET loops/{id}/kpis` (`/cpm/historical`, `/cpm/windows`, `/cpm/evidence` picker, `/cpm/replay`) | PG (full row incl. `method_run_ids` → evidence link) | **IoTDB** `root.hdpe.kpi[s]` via new cplm-api read client; rows carry no evidence link | none — same JSON; older rows have `method_run_ids: []` |
| `GET loops/{id}/kpis/latest`, `/cpm/calculations`, explorer newest row | PG | — | none |
| `GET loops/{id}/gates` history (`/cpm/historical`, `/cpm/investigation`) | PG ≤ 14 d | **IoTDB** `kpi.gate_*` (statuses + diagnosis + metrics; `projection=summary` only) | none for summary; matrix detail stays ≤ 14 d |
| Fleet summary / rankings / heatmap / latest | PG + `IMemoryCache` | — | none |
| Fleet KPI trend `fleet/kpis/trend` | PG ≤ 14 d | **`cplm_kpi_daily`** | lift the 14-day clamp |
| Raw trends (`/api/hist/*`) | IoTDB via historian-bff | IoTDB (or `cpm1m` for > 30 d, D4) | prefix only (CHG-101 `VITE_LOOP_ROOT_PREFIX`) |
| Evidence workbench, archived 24 h set | derived arrays from PG archive + traces re-read from IoTDB, **re-assembled server-side into today's artifact format** | compact form after 90 d | none — `artifactCodec.ts` unchanged |
| Evidence for any other window | on-demand Flink job (Phase 5) | same | "Reconstructed" label (exists) |

Rule: **the API decides the tier; the frontend never knows**. A response field `source: "postgres" | "historian"`
is added for transparency (shown as a small caption only where it matters).

---

## 3. Benefits — space and speed (143 loops)

| Item | Today | After | Basis |
|---|---|---|---|
| IoTDB raw per day | ~27 MB (DOUBLE, TEXT/PLAIN, LZ4, not aligned) | **~10–15 MB** *(est.)* | FLOAT + ZSTD + DICTIONARY mode + aligned; Phase 0 measures |
| IoTDB raw, 1 year | ~9.8 GB | **~3.7–5.5 GB** *(est.)* | |
| KPI + verdict history | 14 d verdicts / 6–24 h features; no older history | **3 y verdict + long KPIs ≈ 2–4 GB; 90 d short KPIs ≈ 0.5–0.9 GB** *(est.)* in IoTDB | ~0.7 M + ~2.9 M points/day at 2–3 B/point |
| Planned PG `cplm_verdict_history` (storage doc §9.3) | — | **not built** — replaced by `root.hdpe.kpi` | saves the table, its code and ~1 GB |
| PG short features on disk | 1.1 GB | **~0.2–0.3 GB** *(est.)* | hourly DROP, no dead tuples |
| PG long features on disk | 0.39 GB | **~0.2 GB** *(est.)* | DROP, no dead tuples |
| 24 h evidence, 3 years | option C ≈ 25 GB | **~11–15 GB** *(est.)* | derived-only full detail 90 d (~3 GB) + compact 3 y (~8–12 GB); traces from IoTDB |
| Plan-2 three-year footprint | ~35 GB | **~20–27 GB** *(est.)* | sum of the rows above |
| Fleet pages (Overview, Performance) | 0.14 s | **unchanged** | same PG + cache path |
| `/cpm/historical` 30 d / 90 d KPI overlay | empty beyond 6 h / 24 h at the plant | **data**, ~50–300 ms *(est.)* | IoTDB aligned read, ≤ 2,000 points (8,640 × 15 m windows in 90 d) |
| Verdict history > 14 d | none | ~50–300 ms *(est.)* | IoTDB `kpi.gate_*` |
| Archived 24 h evidence open | n/a (expired after 6 h) | ~150–400 ms *(est.)* | 1 PG row + 1 aligned IoTDB read |
| PG maintenance | DELETE cron every 30 min, bloat, VACUUM FULL incidents | partition DROPs only | |

---

## 4. Decisions needed before Phase 1

| # | Decision | Recommendation |
|---|---|---|
| D1 | KPI history in separate IoTDB databases (`root.hdpe.kpi`, `root.hdpe.kpis`) instead of under the loop device | **yes** — own TTL (F12), no template clash; needs CHG-101 agreement (its `copy` currently moves 1,974 KPI devices under the loop tree) |
| D2 | Raw TTL | **1 year** (SME plan 2); 3 years only with more disk |
| D3 | Short-KPI history reach | **90 days** |
| D4 | 1-minute continuous-query rollup (`cpm1m`) | **yes, if Phase 0 shows 1.3.2 CQ is stable** — it is also the trace source of compact evidence after 90 d |
| D5 | Add a quality code column `q` to the raw template | **yes** (INT32 / RLE ≈ free) — makes G0 rebuilds faithful (F11); needs the ingestion sample's quality |
| D6 | PV/OP encoding GORILLA vs CHIMP | **by Phase 0 measurement** |
| D7 | SME: compact form after 90 d (option C) | pending SME |

---

## 5. Phases

Each phase ends lab-proven with tests named; nothing reaches the plant until the release in Phase 8.
Phase order = least risk, most value first. Phases 1–2 must land **with CHG-101's move** (one move only).

### Phase 0 — Lab measurements and spikes (no product change) · ~1 day

| Step | What | Output |
|---|---|---|
| 0.1 | One plant-like day (`ams-sims/sim_loop_samples.py` or a plant export) into 4 test databases: (a) today, (b) FLOAT+GORILLA+LZ4, (c) FLOAT+CHIMP+ZSTD, (d) (c)+aligned+mode TEXT/DICTIONARY | `du` + `compression_ratio` per layout → fills §3 |
| 0.2 | Read speed: 24 h × 5 signals one loop; 143 loops × 1 h; 90 d of a KPI family | ms per layout |
| 0.3 | Syntax spikes on 1.3.2 over **REST v2**: `INSERT … ALIGNED VALUES` into a template device; `CREATE TIMESERIES USING DEVICE TEMPLATE ON`; `SELECT cast(pv AS FLOAT) … INTO ALIGNED`; template on a database without auto-extending; continuous query create/run | go / no-go per feature |
| 0.4 | Archive size: re-pack 20 plant 24 h sets derived-only (drop G10/G11/G13/G9-polygon trace columns, f32 + sparse masks) and in compact form | KB per set → fills §3 |
| 0.5 | PG: hourly partitions for the short table on `PlainCplmDb` (plain-PG fixture) | DDL + maintenance works |
| 0.6 | Data team: are plant values 32-bit at source? | confirms FLOAT |

Exit: §3 updated with measured numbers, D1–D6 answered.

**Phase 0 results (lab, 2026-11-03)** — status: DONE

| Test | Result |
|---|---|
| Size, one dense lab day (180 loops, 9.5 M points) | today 45.8 MB (4.8 B/pt) · FLOAT/GORILLA/LZ4 66 % · FLOAT/CHIMP/ZSTD + mode DICTIONARY 60 % · **aligned FLOAT/GORILLA/ZSTD + mode DICTIONARY 38 % (1.8 B/pt)** · aligned CHIMP 37 % |
| Read speed | 24 h × 5 signals, one loop: 10–40 ms in every layout (no aligned penalty) · 180 loops × 1 h: ~100 ms |
| FLOAT precision | lab values are 64-bit (simulated); FLOAT relative error 6 × 10⁻⁸ |
| Syntax on 1.3.2 REST | template + aligned ✔ · **plain INSERT (today's writers) into an aligned template device ✔** · `cast(x AS FLOAT) … INTO ALIGNED` ✔ · CHIMP ✔ |
| Template auto-extension | **confirmed**: an insert into `<loop>.kpi` under a template activated it there and added `mae` to the template for every device → KPI series live in their own databases (D1) |
| Template placement | a template on a database root blocks templates below it → KPI devices are **family-then-loop** (`root.hdpe.kpi.gate_24h.<loop>`), one template per family subtree |
| Continuous query | one CQ for all loops ✔ (`INTO <kpi>.m1.${3} … ALIGN BY DEVICE`); `::` not allowed with aggregates; `avg()` is DOUBLE and refuses a FLOAT target (no cast) → `*_avg` DOUBLE |
| Region groups | the lab node refused new databases at ~11 (`no available DataRegionGroup`) → the 1-min rollup lives in `root.hdpe.kpi.m1`, no `cpm1m` database; plant total 4–5 databases |

Decisions taken (user: "start with the recommendations"): D1 yes, D2 raw 1 year, D3 90 d, D4 yes (in `kpi.m1`),
D5 deferred (needs the quality in the ingestion sample), D6 **GORILLA** (CHIMP +3 % only, newer encoder).
Plant expectation: 27 MB/day × 0.38 ≈ **10 MB/day** raw (to be confirmed on the first plant days).

### Phase 1 — IoTDB layout at the `root.hdpe` move (with CHG-101) · ~2 days

Status: init script **DONE** (`infra/docker/iotdb-layout-v2.sh`, sourced when `IOTDB_LAYOUT=v2`; lab-run twice,
idempotent; raw/KPI/short/1-min writes verified). Move script = ams-open-cf (template list sent 2026-11-03).

| Change | Files |
|---|---|
| Init script: create databases `root.hdpe.cpm`, `root.hdpe.kpi`, `root.hdpe.kpis` (+ `cpm1m`), templates `cpm_raw` (aligned) and `cpm_kpi_*`, `SET SCHEMA TEMPLATE`, TTLs; idempotent; verify with `SHOW SCHEMA TEMPLATES` / `SHOW ALL TTL` | `infra/docker/iotdb-init-ttl.sh` (+ compose env `docker-compose.yml:1466-1488`, `migration/deploy/docker-compose.marun.yml`) |
| Raw writer: activate the template per device instead of `CREATE TIMESERIES`; insert with `ALIGNED`; types unchanged in C# (FLOAT parses from the `R` format) | `src/backend/AMS.Api/Services/IotDbWriteClient.cs:109-126, 193-217`; `RawLoopIotDbConsumer.cs:27-30, 130` |
| Move script: template step after `prepare`; `copy` with `cast(pv AS FLOAT)` … `INTO ALIGNED`; KPI devices to `root.hdpe.kpi[s].<loop>.<family>`; `verify` compares counts **and** min/max per series | `migration/iotdb-move-loop-tree.py:241-302, 315-360`; runbook `migration/IOTDB-LOOP-TREE-MOVE.md` |
| Plant `.env` keys: `IOTDB_KPI_DB`, `IOTDB_KPIS_DB` | `migration/.env.example:52-60` |
| Tests: new `IotDbWriteClientTests` (DDL/insert text, aligned, template activation), move-script dry-run test; e2e `test-ot-loop-ingestion-e2e.ps1` counts on the new tree | `tests/` (no unit tests exist today — survey 2 §5) |

Reader impact: none (F7 avoided by TEXT mode; F8 FLOAT safe). Replay source unchanged.

### Phase 2 — KPI and verdict history in IoTDB, made reliable · ~2 days

| Change | Files |
|---|---|
| Write **LIVE only** (`purpose` = LIVE, `calculation_source` = flink); recompute/shadow rows never touch IoTDB (fixes F2 overwrite) | `CplmResultConsumerService.cs:307-318, 377-378` |
| Gate family gains G0–G15 status, band, family, evidence score, `bundle_hash`/config version, engine version (`sourceCommit`) as TEXT; short family gains `sufficient_data`, `evaluation_state`, G0–G4 statuses | same, `:389-413` |
| New device path `root.hdpe.kpi[s].<loop>.<family>` (config `IotDb:KpiDatabase`, `IotDb:ShortKpiDatabase`) | `src/services/cplm-api/Services/IotDbWriteClient.cs`; `appsettings`; compose `:1433-1436` |
| **Reliable write:** client returns Ok / Rejected / Unavailable like the ams-api copy; on Unavailable the consumer retries and does **not** store the offset (PG upsert and IoTDB point are both idempotent by window end) | `cplm-api/Services/IotDbWriteClient.cs:110-139`; `CplmResultConsumerService.cs:149-151` |
| Metric `cplm_iotdb_kpi_write_failures_total` + last-write timestamp in `/health` | cplm-api metrics |
| Tests: purpose filter, field mapping, retry-no-offset, idempotent re-write | `tests/cplm-api.Tests` (new `KpiHistoryWriterTests`) |

Backfill: the `copy` of Phase 1 brings Sept–Nov KPI history across (DOUBLE → FLOAT cast); old points have no
status fields (shown as "—").

### Phase 3 — Tiered reads in cplm-api · ~3 days

Status: **DONE, lab-tested, committed 9261bda5** — `IotDbReadClient` + `KpiHistoryReader`: `/kpis` and `/gates?projection=summary`
(LIVE) append historian rows strictly older than the oldest PG row when PG returns a short page; cursor crosses the seam;
`source` per row; `degraded: true` on IoTDB failure. Known limits: device name is case-sensitive (request loop id as
registered); FLOAT precision in historian rows; no GROUP BY thinning yet (pages are ≤ 500 rows anyway).

| Change | Files |
|---|---|
| New `IotDbReadClient` (REST v2 `/query`, aligned select, `GROUP BY` decimation to ≤ 2,000 points, 5 s timeout, typed mapping) | new `src/services/cplm-api/Services/IotDbReadClient.cs` |
| `KpiHistoryReader`: split `[from, to]` at the hot-window edge; PG part via today's `KpiSql`, IoTDB part mapped to the same row shape; merge, keyset cursor `nextBefore` keeps working across the edge | new `Data/KpiHistoryReader.cs`; `Controllers/CpmAnalyticsController.cs:107-147`; `Data/KpiReads.cs:16-34` |
| `GET loops/{id}/gates?projection=summary` older than 14 d from `kpi.gate_*` | `CpmAnalyticsController.cs:65-100` |
| Response field `source` per row; OpenAPI note | controllers |
| Frontend: none required. Optional caption "from historian" on `/cpm/historical` rows with `source = historian` (OpenBridge text token only) | `components/Cpm/CpmHistorical.tsx` (optional) |
| Tests: edge split, empty IoTDB, IoTDB down (PG part still returned + `degraded: true`), cursor across the edge | `tests/cplm-api.Tests` (new `KpiHistoryReaderTests`) |

### Phase 4 — PostgreSQL hot window by partition DROP · ~1 day

Status: **DONE, lab-tested** — `FeaturePartitions.cs` hourly grain for short (names `_pYYYYMMDDHH`), `retention_policy.hours`
(nullable; old image keeps reading `days`), cpm-17 + rollback (in place on the partitioned parent, one transaction),
`65_cplm_hot_window_partitions.sql`, release block `chg102-cpm17` (PRE_SWAP, removes the cron, cplm-api stays stopped
until step 6). Tests: FeaturePartition + HotWindow 30/30, release tests 53/53, whole cplm-api.Tests 397/399 (2 lab-data
failures, unrelated). Lab Postgres for tests is on **5436** (5433 = ProAct). Long table now holds 24–48 h (≤ ~0.5 GB).

| Change | Files |
|---|---|
| Hourly partitions for `cplm_short_feature_results` (`_pYYYYMMDDHH`), daily stays for long / gate; maintenance creates now..+3 h and drops by `retention_policy` **hours** | `src/services/cplm-api/Services/FeaturePartitions.cs:23-105`; `FeaturePartitionOptions.cs` |
| Migration **cpm-17**: convert short table to hourly (cplm-api STOPPED, copy last 6 h), retention rows SHORT_FEATURES = 6 h, LONG_FEATURES = 1 d (makes the 2026-11-03 out-of-release change official) | new `scripts/cpm-17-hot-window-partitions.sql` (+ `.rollback`); `database/scripts/65_*.sql`; `migration/schema/03-traverse_cplm.sql` |
| Retire the DELETE cron | remove `migration/cron.d/cpa-prune-short-features` install from the release steps; keep `prune-short-features.sh` one release as rollback |
| Release wiring | `migration/deploy/build-release.py:56-79` (`OPS_FILES`), `release_blocks.py` (new `chg102_cpm17`, PRE_SWAP) |
| Tests: `FeaturePartitionTests` hourly case on `PlainCplmDb` | `tests/cplm-api.Tests/FeaturePartitionTests.cs` |

### Phase 5 — Evidence: boundary archive + on-demand evaluation · ~5–7 days

| Change | Files |
|---|---|
| Flink: long tier always emits on boundary windows (12 h at 00/12, 24 h at 00, plant-time offset), bypassing throttle/policy; **flapping fix** (one emission per finding change, not per 15-min tick) | `cplm/evidence/EvidencePolicy.java:83-118`, `EvidenceThrottle.java:22-31`, `CplmLongDiagnosticsStreamJob.java:36-62,166` |
| Archive table `analytics.evidence_archive` (day partitions, one packed row per loop per boundary set) + `evidence_archive_run` lookup; DROP-partition retention + byte cap | `scripts/cpm-19-evidence-archive.sql` (reserved); `database/scripts/67_*.sql` |
| Archiver: derived arrays stored (f32 + sparse masks, packed); **trace columns** of G9 polygon / G10 / G11 / G13 replaced by a reference (device, from, to, column) + a hash of the trace at emission | new `cplm-api/Services/EvidenceArchiver.cs`; `EvidenceBlobStore.cs:47-142` |
| Reader: re-assemble today's artifact (columns from archive + IoTDB trace read) → same manifest/bundle JSON; trace hash mismatch → artifact flag `trace: "historian, differs"` | `Services/EvidenceManifestReader.cs:58-241` |
| Compact form after 90 d (option C, D7): drop n-length derived arrays, keep ACF/PSD/lag/≤3 cycles/events; traces from `cpm1m` | archiver job |
| On-demand evaluation: always-running Flink job reading a request topic (loop + interval + end), IoTDB source, emits a full set as `EVIDENCE_RECONSTRUCTION`; API `POST analysis-runs` gains `kind=EVALUATE` | `CplmHistoricalReplayJob.java:148-185`, `replay/EvidenceReconstruction.java`, new on-demand job; `CpmAnalysisRunsController.cs:92-134`; `CplmRecomputeService.cs:217-225` |
| Episodes reference boundary sets (no copies) | `EpisodeCaptureStore.cs:27-57` |
| Tests: Flink `EvidencePolicyTest`/`EvidenceThrottleTest` boundary + flapping; archive round-trip (archive → re-assembled bytes decode in `artifactCodec.ts`); reader with IoTDB down | Flink tests; `tests/cplm-api.Tests`; `frontend-ob` vitest |

### Phase 6 — Fleet KPI daily (3 years) · ~1–2 days

Status: **DONE, lab-tested** — `cplm_kpi_daily` (PK day, window_kind, loop_id) + ledger `cplm_kpi_daily_run`
(thresholds used per day), `FleetKpiDailyJob` hourly (UTC day, settle 60 min, backfill inside gate retention,
`RuleVersion` recompute), one shared classify path `FleetKpiSnapshot`; trend up to 1095 d; `/cpm/kpi` range
14 d / 90 d / 1 y / 3 y; migration **cpm-18** (online, PRE_SWAP 4f) + `66_cplm_kpi_daily.sql`. Day boundary is UTC
(no plant time-zone setting exists) — decide before history accumulates if local days are wanted.

| Change | Files |
|---|---|
| `analytics.cplm_kpi_daily` (loop, day, each Overview KPI, rule version) filled at plant-day end from the 24 h boundary verdict | migration (with cpm-17/18); new background service in cplm-api |
| `fleet/kpis/trend` and `fleet/kpis/loops?asOf` read the daily table beyond 14 d; drilldown to loops kept | `CpmFleetKpiController.cs:91-166`; `Data/FleetKpiSql.cs` |
| Frontend: lift the 14-day range limit on `/cpm/kpi` | `components/Cpm/kpi/useFleetKpis.ts`, `CpmKpiDrilldown.tsx` |

### Phase 7 — Optional, later

- Slim the 14-day `cplm_gate_results` (detail JSON split, lz4 TOAST): 3.6 GB → ~1–1.5 GB *(est.)*.
- REST v2 `insertTablet` for the raw writer (typed, fewer bytes on the wire).

### Phase 8 — Ops, records, release

| Item | Files |
|---|---|
| **IoTDB backup** (prerequisite once IoTDB is the only history): nightly `export-tsfile` (or flush + snapshot) of `root.hdpe.kpi*`, weekly of raw; restore drill in the lab | new `migration/backup-iotdb.sh`; `prod_decision.md` §8 |
| daily-check: IoTDB `du` per database, KPI last-write age, write-failure counter, archive size vs cap | `migration/daily-check.sh` |
| `prod_decision.md`: IoTDB layout (types, encodings, ZSTD, aligned, templates, databases, TTLs), PG hot windows, archive tiers, backup; fix §3 line 66 (cron "retired in v2.6" contradiction) | `prod_decision.md` |
| `changes_tracker.md`: CHG-102 entry (services updated, migrations, plant scripts, rollback) | `changes_tracker.md` |
| Release manifest + VM steps | `migration/deploy/releases/<next>.txt`, `release_blocks.py` |

---

## 6. Services and files touched (summary)

| Service / area | Phases | Change |
|---|---|---|
| IoTDB init / plant env | 1 | databases, templates, TTLs |
| ams-api (`RawLoopIotDbConsumer`, `IotDbWriteClient`) | 1 | template activation, aligned insert |
| CHG-101 move script + runbook | 1 | template, cast, aligned, KPI relocation (with ams-open-cf) |
| cplm-api | 2, 3, 4, 5, 6 | LIVE-only reliable KPI write, IoTDB read client, tiered KPI/gate reads, hourly partitions, archiver + reader, kpi daily |
| Flink (`cplm` jobs) | 5 | boundary emission, flapping fix, on-demand job |
| historian-bff | — | unchanged (reads raw; optional `cpm1m` routing later) |
| frontend-ob | 3, 6 (optional captions; KPI-trend range) | no contract change |
| PostgreSQL migrations | 4, 5, 6 | cpm-17 (+18), `database/scripts/65+`, `03-traverse_cplm.sql` |
| Ops | 8 | IoTDB backup, daily-check, cron retired |

---

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| IoTDB becomes the only copy of history | Phase 2 reliable write; Phase 8 backup **before** the release; PG keeps 14 d / hot windows as fallback |
| REST SQL syntax for template / aligned / cast differs on 1.3.2 | Phase 0.3 spikes gate Phase 1; fallback = aligned devices without template (explicit `CREATE ALIGNED TIMESERIES`) |
| FLOAT trace ≠ the DOUBLE values the engine used → evidence checksum differs | archive stores its own trace hash; mismatch shown, verdict untouched; confirm 32-bit source (0.6) |
| CHG-101 is mid-flight (uncommitted, ams-open-cf) | agree D1 and the template step with ams-open-cf **before** their plant move; one move only |
| Edge-split reads double-count or gap at the hot-window edge | single split point computed once per request; tests in Phase 3 |
| On-demand evidence takes seconds | always-running job, progress shown, 3-day cache (storage doc §8) |
| Lab ports shared with ProAct (5433) | use `PlainCplmDb` fixture / portless temp container as before |

## 8. Order and effort

| Phase | Effort *(est.)* | Depends on |
|---|---|---|
| 0 Lab measurements | 1 d | — |
| 1 IoTDB layout | 2 d | 0, CHG-101 agreement |
| 2 Reliable KPI history | 2 d | 1 |
| 3 Tiered reads | 3 d | 2 |
| 4 PG hot window | 1 d | — (parallel with 1–3) |
| 5 Evidence archive + on-demand | 5–7 d | 1, SME (D7) |
| 6 KPI daily | 1–2 d | 2 |
| 8 Ops + release | 1–2 d | all |

Total ≈ 16–20 working days; Phases 0–4 (≈ 9 d) deliver the space and history wins on their own and can ship first
if the SME answer on evidence is late.
