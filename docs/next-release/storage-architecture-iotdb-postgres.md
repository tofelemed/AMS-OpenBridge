# Storage architecture — IoTDB and PostgreSQL: roles, speed and space

Date: 2026-11-03 · Proposal, nothing changed · Applies to the CPM / CPLM path (Marun: 143 loops, 5 s grid).
Related: `evidence-and-historian-retention.md`, `recompute-from-iotdb.md`, CHG-101 (IoTDB root → `root.hdpe.cpm`),
CHG-102 (evidence archive + on-demand evaluation).

## 1. One job per store

| Store | Holds | Optimised for | Does NOT hold |
|---|---|---|---|
| **IoTDB** | raw loop samples (PV, SP, OP, VP, mode); optionally 1-min summaries and numeric KPI series | append-heavy writes, compression, time-range reads | configuration, decisions, blobs |
| **PostgreSQL** (`traverse_cplm`) | configuration history, registry, verdict summaries, episodes, acknowledgements, notes, shelving, 24 h evidence archive | relational queries, transactions, the fleet pages | raw samples, recomputable evidence |
| **Kafka** | tra    nsport only (samples 12 h, results ≤ 3 d) | decoupling, replay of the last hours | history |
| **Redis** | latest state per loop (hot cache) | sub-ms page reads | anything durable |
| **Flink** | all computation, live and on demand (project rule "Flink-only compute") | — | — |

Rule of thumb: **store what cannot be recomputed** (raw data, configuration, decisions, the verdicts people acted on);
**recompute what can** (evidence), and keep only a 3-day cache plus the SME's 24 h archive.

## 2. IoTDB today (measured / read from code, 2026-11-03)

| Item | Today | Source |
|---|---|---|
| Version | 1.3.2 standalone | `infra/docker/docker-compose.yml` |
| Layout | one device per loop `root.site1.cpm.<loop>`, 5 measurements, **not aligned**, no template | `RawLoopIotDbConsumer.cs` |
| Types | pv / sp / op / vp **DOUBLE**; mode **TEXT** ("AUTO", "MAN", …) on every sample | same |
| Encoding | defaults: DOUBLE → **GORILLA**, TEXT → **PLAIN**, time → TS_2DIFF | `iotdb-common.properties` of the 1.3.2 image |
| Compression | default **LZ4** | same |
| Schema creation | `CREATE TIMESERIES … WITH DATATYPE=…` (encoding left to defaults); `enable_auto_create_schema=true` | `IotDbWriteClient.cs`, compose |
| Writes | REST v2, batches of 500 rows or 5 s per loop | `RawLoopIotDbConsumer.cs` |
| Retention | `root.site1` TTL 90 d, `root.ams` 365 d | plant `show all ttl` |
| Size | 1.7 GB for 63 days ≈ **27 MB/day** ≈ **2.2 bytes per point** (12.4 M points/day) — upper bound, the volume also holds `root.ams` and the WAL | plant `du` |

## 3. IoTDB — what the Apache documentation offers

Encodings ([IoTDB 1.3 Encoding and Compression](https://iotdb.apache.org/UserGuide/V1.3.x/Technical-Insider/Encoding-and-Compression.html)):

| Encoding | Suits (per the docs) | Our signal |
|---|---|---|
| TS_2DIFF | monotonically increasing/decreasing sequences; poor on fluctuating data | **timestamps** on a regular 5 s grid (default) |
| GORILLA | lossless; numeric sequences with similar values | SP, VP (steady, repeated values) |
| CHIMP | lossless; "state of the art" for streaming floating-point data; best on similar values, not on noise | PV, OP — **to be tested against GORILLA** |
| RLE | runs of repeated values; floats need a fixed number of decimals | mode (as an integer code) |
| DICTIONARY | lossless; low-cardinality TEXT | mode, if kept as TEXT |
| SPRINTZ / RLBE | small differences / small increasing increments | candidates for SP, test only |
| PLAIN | no encoding | today's mode (wasteful) |

Compressors: UNCOMPRESSED, SNAPPY, **LZ4 (recommended by Apache, fastest)**, GZIP, **ZSTD (smaller, a little more CPU)**,
LZMA2 (smallest, slowest). Encoding, data type and compressor can be set **per series**, including inside an aligned
group. The achieved ratio is logged by IoTDB in `data/datanode/system/compression_ratio`.

Other relevant features (same docs, [metadata operations](https://iotdb.apache.org/UserGuide/V1.3.x/Basic-Concept/Operate-Metadata_apache.html)):
- **Aligned timeseries** — one device's measurements share one time column; each keeps its own type / encoding / compressor.
- **Device templates** — devices of the same kind share one schema: less metadata memory, and new loops get the right
  types and encodings instead of auto-create defaults.
- **TTL** — per database / device path, by data timestamp; expired data is physically removed at compaction.
- **Continuous queries** — scheduled `SELECT … INTO … GROUP BY (time)` for downsampling into another database.

Published background: CHIMP (Liakos et al., PVLDB 15, 2022) reports better ratio and speed than GORILLA on
floating-point series; one third-party test measured 4.66 vs 5.92 bytes/point on gauge data
([graupel](https://docs.rs/crate/graupel/latest)) — numbers depend on the data, so we test on ours. An early
IoTDB issue (IOTDB-2549, 0.13 snapshot) reported aligned reads slower on sequential data — also tested, on 1.3.2.

## 4. IoTDB — recommended for our data

| # | Change | Why | Expected effect |
|---|---|---|---|
| 1 | **Device template** for a loop: pv / sp / op / vp + mode, set on `root.hdpe.cpm` | every loop gets the right schema; no auto-create defaults; less metadata | correctness, memory |
| 2 | pv / sp / op / vp **FLOAT** instead of DOUBLE | PI / OPC values are 32-bit at the source (confirm with the data team) — DOUBLE stores noise digits | ~30–50 % less for these series |
| 3 | PV, OP: **CHIMP** or **GORILLA** (pick by lab test); SP, VP: **GORILLA** | lossless; SP / VP repeat, PV / OP vary smoothly | 10–30 % (CHIMP vs GORILLA, test) |
| 4 | mode: **INT32 code + RLE** (0 = MAN, 1 = AUTO, 2 = CAS, …) or TEXT + DICTIONARY | mode changes a few times a day; PLAIN TEXT repeats the word 17,280 times per loop per day | mode ≈ 0 |
| 5 | Compressor **ZSTD** for these series (LZ4 elsewhere) | ~12 M points/day is light CPU; ZSTD is smaller than LZ4 | ~15–30 % |
| 6 | **Aligned** device per loop (template marked aligned) | one time column instead of five; one read returns all five signals (what rebuilds need) | modest space (TS_2DIFF already shrinks regular timestamps); fewer chunks; **read speed to be verified** |
| 7 | Keep compaction on (defaults: seq / unseq / cross = true); keep the 500-row / 5 s batching (or larger) | small files waste metadata; late samples land in unsequence files until merged | steady size |
| 8 | **TTL** on the new database (`root.hdpe`) = the SME's choice (1 year recommended) | without it the new database never expires | bounded size |
| 9 | Optional: **1-min min / avg / max** by continuous query into `root.hdpe_1m` with a long TTL (3–5 years) | multi-week trends read 12× fewer points; old years stay cheap | old years ≈ ¼ of raw |
| 10 | Do **not** use store-on-change / deadband for PV / OP | the engine expects a sample every 5 s; rebuilds would differ | — |

**Estimate:** 27 → **~10–15 MB/day** (3 years ≈ 11–16 GB instead of ~30 GB). This is an estimate to be replaced by
the lab test in §6.

**When:** CHG-101 already creates new series under `root.hdpe.cpm` and copies the history — create the template
there **before the first write**, and the copied history gets the new encoding for free.

## 5. PostgreSQL — recommended

| # | Change | Why |
|---|---|---|
| 1 | Evidence: stop storing what can be rebuilt; keep the 3-day on-demand cache and the 24 h archive in a **day-partitioned** table, retention by `DROP PARTITION` | DELETE-based retention bloated the tables (needed `VACUUM FULL`, Oct 2026); dropping a partition frees disk at once |
| 2 | **Verdict summary** rows (gate statuses, diagnosis, score, config version, engine version), with the bulky JSON moved to the on-demand evidence | gate results are ~21.5 KB per row today and the fleet pages read only a few fields |
| 3 | Keep the result tables day-partitioned (CHG-033); add **BRIN** indexes on the time column of append-only partitions | BRIN is tiny and fast for time ranges on append-only data |
| 4 | `default_toast_compression = lz4` (PostgreSQL 15) | faster read / write of large JSON than the default pglz, similar size |
| 5 | Latest state per loop from **Redis** / a "latest" table, never a whole-table `DISTINCT ON` | the fleet-page fix of CHG-023 (34.8 s → 0.14 s) stays the pattern |
| 6 | Check `\dx` on `instrumental-postgres`: if TimescaleDB is available, its columnar compression on old result partitions saves ~80–90 % | not assumed — the plant has no hypertables today |

## 6. Lab test before the plant (≈ half a day)

1. One day of real samples (copy from the plant export or the lab feed) written into four test databases:
   (a) today's schema, (b) FLOAT + GORILLA + LZ4, (c) FLOAT + CHIMP + ZSTD, (d) (c) + aligned + INT32 mode / RLE.
2. `flush`, wait for compaction, then compare `du` per database and `compression_ratio`.
3. Read speed: a 24 h read of all five signals for one loop, and 143 loops × 1 h, per layout.
4. Pick the layout; put it in the CHG-101 template; record it in `prod_decision.md`.

## 7. Summary

- **IoTDB** = all raw data, compact and long-lived; **PostgreSQL** = the small context that cannot be recomputed;
  **Flink** recomputes evidence on demand; **Redis** serves the latest state.
- Biggest IoTDB wins for our data: FLOAT instead of DOUBLE, mode as a coded integer, ZSTD, a device template — done
  once, in the `root.hdpe` move.
- Biggest PostgreSQL wins: no stored recomputable evidence, slim verdict rows, partitions instead of DELETE.

Sources: [IoTDB 1.3 Encoding and Compression](https://iotdb.apache.org/UserGuide/V1.3.x/Technical-Insider/Encoding-and-Compression.html) ·
[IoTDB 1.3 metadata operations (aligned, templates, TTL)](https://iotdb.apache.org/UserGuide/V1.3.x/Basic-Concept/Operate-Metadata_apache.html) ·
[IoTDB continuous queries](https://iotdb.apache.org/UserGuide/V0.13.x/Process-Data/Continuous-Query.html) ·
[TsFile](https://tsfile.apache.org) · [Chimp, PVLDB 2022](https://scispace.com/papers/chimp-3ia6m4tg) ·
[graupel benchmark](https://docs.rs/crate/graupel/latest) · IoTDB 1.3.2 defaults read from the `apache/iotdb:1.3.2-standalone` image.

## 8. Frontend speed — what can be instant and what cannot

| View | Served from | Target | How |
|---|---|---|---|
| Overview, fleet KPIs, loop lists | Redis / PostgreSQL "latest" rows | **< 150 ms** (measured 0.14 s after CHG-023) | indexed latest rows, never a table scan |
| Trends (PV / SP / OP / mode) for any range IoTDB holds | IoTDB via historian-bff | **~50–300 ms** *(estimate)* | aligned device read; the server returns ~1–2 k points per chart (`GROUP BY` time buckets with min / max), never all 17 k–100 k raw points |
| Evidence of the last 6 h and the archived 24 h sets | PostgreSQL (one row per set) | **~100–300 ms** *(estimate)* | one packed row per window; decoded once, cached in the browser |
| Evidence on demand (older windows, 1 min … 12 h intervals) | Flink recomputes from IoTDB | **seconds, not ms** | calculation over tens of thousands of samples per gate plus scheduling |

On-demand evidence cannot be milliseconds; it can be made short and never block the page:
1. an always-running Flink on-demand job (no job start per click): ~10–20 s per gate today → *estimate* 1–3 s for a whole set;
2. compute the whole set in one pass, not one job per gate;
3. show the raw trend from IoTDB at once (ms) and fill in the evidence panels when they arrive (progress shown);
4. cache every rebuilt set for 3 days; a second open is ms;
5. optionally pre-compute at night the windows most likely to be opened (loops with open episodes).

Frontend side: react-query caching and prefetch on hover, canvas charts (echarts), and never more than ~2 k points per
series sent to the browser.

## 9. PostgreSQL for instant views — current, possible, optimized

PostgreSQL is what makes the pages instant: everything a page shows without waiting is a stored row. The question
is which rows, how long, and how slim.

### 9.1 Current (plant, 2026-11-03)

| Data | Table(s) | Kept | Size / volume | Serves |
|---|---|---|---|---|
| Fused verdicts (12 h / 24 h, every 15 min) | `cplm_gate_results` (day partitions) | **14 d** | **measured: ~270 MB/day**, ~27 k rows/day (143 loops × 192), row ~7 KB (TOAST-compressed) ≈ 10 KB on disk with indexes; **14 d = 3.6 GB**, half the database | Overview, KPIs, Explorer, Investigation, Calculations |
| Long features (4 h / 12 h / 24 h) | `cplm_long_feature_results` | **24 h** (cron; row = 1 d) | 393 MB on disk (5 day partitions) | Historical, Calculations |
| Short features (1–60 min) | `cplm_short_feature_results` | **6 h** (cron; row = 1 d) | 1,110 MB on disk for 6 h of rows — the cron DELETEs rows but the files only shrink when the day partition is dropped | short-window views |
| Evidence | `evidence_manifest` / `evidence_chunk` | 6 h live, episodes 2 d | 1.28 GB on disk | Evidence Workbench |
| Episodes, shelving, notes, acknowledgements | `cplm_event_frames`, `investigation_reference`, … | no expiry | small | Events, notes |
| Response events / models | `response_event`, `response_metric`, models | 14 d (censored 3 d) | — | G12 |
| Configuration, registry | config / registry tables | no expiry | small | everything |
| **Whole database** | `traverse_cplm` | | **7.5 GB** | |

Consequence: **anything older than 14 days is not instant** — there is no verdict or KPI history beyond it, and
features vanish after 6 h / 24 h. The verdict rows are fat: the pages read a few fields out of ~10 KB per row on disk.

### 9.2 What we can keep

| Option | Kept | Volume | 3 years | Verdict |
|---|---|---|---|---|
| Every 15-min verdict, full row (today's form) | 3 years | 270 MB/day | ~295 GB | not possible |
| Every 15-min verdict, slim (~2 KB) | 3 years | 55 MB/day | ~60 GB | too much for the history value |
| **Boundary verdicts, slim** (12 h × 2 + 24 h × 1 per loop per day) | 3 years | **~0.9 MB/day** | **~1 GB** | **yes** |
| **Daily KPI per loop** (one row per loop per day, ~0.5 KB) | 3 years | ~70 KB/day | ~80 MB | **yes** |
| Daily fleet KPI (one row per day per KPI) | 3 years | tiny | < 10 MB | **yes** |

### 9.3 Optimized design

| Layer | Table | Kept | Holds | Speed |
|---|---|---|---|---|
| **Now** | `cplm_gate_results` (as today, day partitions) | 14 d | full fused rows, every 15 min | ms (indexed latest) |
| **Latest** | Redis + a `latest` row per loop × window kind | always current | the newest verdict only | **< 50 ms** |
| **History** (new) | `cplm_verdict_history`, partitioned by month | **3 years** | slim boundary verdicts: loop, window kind, window end, gate statuses (G0–G15 as short codes), diagnosis, band, family, evidence score, key metrics (AUTO %, saturation %, oscillation period, …), **config version, engine version**, link to the archived evidence set | **ms** |
| **KPI daily** (new) | `cplm_kpi_daily` (per loop per day) + fleet rollup | **3 years** | each Overview KPI per loop per day, with the rule version | **ms**; every KPI drills down to its loops (project rule) |
| Evidence | archive (24 h, 3 years) + 3-day cache | per SME | packed sets | 100–300 ms |
| Context | episodes, notes, acknowledgements, shelving, config history, registry | no expiry | decisions | ms |

How it fills: cplm-api writes the slim boundary row and the daily KPI rows when it stores the boundary verdict
(no extra Flink work); retention is `DROP PARTITION` by month.

Space, 3 years: verdict history ~1 GB + KPI daily ~0.1 GB + 24 h evidence archive ~25 GB — the history layer is
almost free compared with the evidence.

### 9.4 Slimming the 14-day verdict rows (optional, later)

The ~10 KB row (on disk) carries arrays and explanation detail the list pages never read. Splitting it into the slim columns
above plus a compressed detail column (`lz4` TOAST) read only by the detail page would cut the 14-day table
(3.6 GB, half of today's 7.5 GB database) by an *estimated* 60–75 % (to ~1–1.5 GB) and make every fleet query lighter. Contract change: the API keeps its
shape; only storage changes.

### 9.5 Plant measurement (2026-11-03, partition sizes)

| Table | Partitions | On disk | Per day |
|---|---:|---:|---|
| `cplm_gate_results` | 15 days + 2 future + default | 3,641 MB | **~270 MB** (full days 259–272 MB; Sat 24 Oct 167, Sun 25 Oct 139) |
| `cplm_long_feature_results` | 5 | 393 MB | rows kept 24 h by the cron |
| `cplm_short_feature_results` | 5 | 1,110 MB | rows kept 6 h by the cron; space freed only by partition drop |

Average verdict row `pg_column_size` 6,970 bytes; 27,264 verdict rows in the last 24 h.

