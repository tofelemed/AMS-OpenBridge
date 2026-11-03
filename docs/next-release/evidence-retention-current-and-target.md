# Evidence Workbench — evidence retention: current state and target

Date: 2026-11-03 · Status: **analysis + proposal, nothing built** · Scope: `src/flink` (evidence emission),
`cplm-api` (evidence store, sweeper, reader), `traverse_cplm` schema, Evidence Workbench (read path only).

The question: the workbench shows the evidence behind a 12 h / 24 h verdict (G5–G15 artifacts: ACF, PSD, cycle fits,
polygons, actuator limits, lag structure, …). After the September / October disk incidents we bounded that evidence so
hard that it is effectively **not retained**: live artifacts live 6 h, episode captures 2 days. We now need to keep it.
How much does it cost per loop and per window, what is the best way to store it, and how far back can we afford to keep it?

**Plant measurement 2026-11-03 (§9) supersedes the lab sizes: §5–§6 use the plant's figures.** Sections 2–3 are
measured on the lab database (`traverse_cplm`, 1,049,910 manifests, 161 loops, 16 Sep–15 Oct)
and re-encoded offline from real payloads, unless marked *estimate*. Plant figures (Marun, 144 loops) come from
`prod_decision.md` and the daily checks. Section 7 lists the plant queries that replace the estimates.

---

## 1. Current state

### 1.1 Data path

```
Flink Long job (every 15 min, per loop: 4h / 12h / 24h windows, G5–G11)
Flink Fusion job (12h / 24h verdict, G13–G15)          ─┐
Flink Response job (G12 events)                          ├─► Kafka evidence topic (retention 1 h)
Flink Short job (G0–G4): emits NOTHING at the plant     ─┘        │
                                                                   ▼
                       cplm-api evidence consumer ─► analytics.evidence_manifest (1 row per artifact)
                                                     analytics.evidence_chunk    (bytea, ≤ 256 KiB per chunk)
                                                                   │
                       EvidenceRetentionSweeper (every 15 min) ────┘  delete / expire by class
                                                                   │
                       Workbench ◄─ GET /method-runs/{id}/evidence, /evidence/{id}/chunks/{n}
```

Encoding of one artifact (`EvidenceChunker.java`): every column as **f64 little-endian**, concatenated, **gzip**,
SHA-256 per chunk and over the payload. Each artifact carries its own provenance JSON (window, bundle hash, dataset
hash, loop, method fields, ~250–680 bytes).

### 1.2 What is emitted (Flink, `EvidencePolicy` / `EvidenceThrottle`)

| Rule | Setting at Marun | Effect |
|---|---|---|
| Emit mode | `CPLM_EVIDENCE_EMIT=episodes` | Long: only when G7–G11 has a finding (G5/G6 alone are context). Fusion: G14 / fault diagnosis / PV-ineligible or limited lane |
| Short tier (G0–G4) | `CPLM_SHORT_EVIDENCE_EMIT` unset = `none` | never emitted; rebuilt on demand from IoTDB (`EVIDENCE_RECONSTRUCTION`) |
| Throttle | `--evidence-min-interval-min 60` | an unchanged finding re-emits at most once per hour per loop × window kind; a changed signature emits at once (a flapping verdict re-emits every ~30 min) |
| Cycle cap | `--evidence-max-cycles 12` | G7 `cycle_fit`, G9 `cycle_polygon` / `normalized_pairs`: at most 12 cycles per run (+ one `cycle_scores` summary) |

At Marun nearly every window has a finding, so in practice every loop emits a long-tier set for 4 h, 12 h and 24 h
**about once an hour** (up to 72 sets per loop per day).

### 1.3 What is kept (cplm-api, `EvidenceRetentionSweeper` / `EvidenceRetentionTiers`)

| Class | Gets there by | Kept | Then |
|---|---|---|---|
| `TRANSIENT` | every live artifact | **6 h AND 2 GiB** (oldest first) | DELETE (chunks cascade) |
| `EPISODE` | episode OPEN / ESCALATE / CLOSE capture promotes the run's TRANSIENT rows (max 3 automatic + CLOSE) | **2 days after the episode closes** (cut from 90 d on 2026-10-02) | EXPIRED tombstone 1 day, then DELETE |
| `STANDARD` | operator reconstruction / replay | **3 days** | EXPIRED 1 day, then DELETE |
| `PINNED` | engineering note / investigation reference | forever | — |

Related tables the workbench also depends on (so they bound history too):

| Data | Kept at Marun |
|---|---|
| Gate results (fused verdict rows, 21.5 KB each) | `GATE_RESULTS` 14 d (daily partitions) |
| Long features | 24 h (cron `cpa-prune-short-features`) |
| Short features | 6 h (same cron) |
| Kafka evidence topic | 1 h |
| Kafka samples topic | 12 h |
| IoTDB loop series (reconstruction source) | "weeks" — TTL not recorded (§7 query 4) |

### 1.4 What the workbench can actually show today, by age of the window

| Window age | Long / fusion evidence (G5–G15) | Short evidence (G0–G4) |
|---|---|---|
| 0–6 h | yes, if that hour's set was emitted (throttle) | reconstruct on demand |
| 6 h – 2 d | only windows an episode captured | reconstruct on demand |
| 2 d – 14 d | **nothing** (verdict row still exists) → reconstruct on demand | reconstruct on demand |
| > 14 d | **nothing, and the verdict row is gone too** | — |

So "evidence history" today is: whatever the historian still holds, rebuilt one window at a time by hand, labelled
*Reconstructed* (CHG-099) — never the original proof.

### 1.5 Why it was cut (the incidents that set these numbers)

| Date | What happened | Root cause in evidence terms |
|---|---|---|
| 2026-09-26 | 311 MB free, 3 h after v2.5 | every window of every tier emitted (~1.4 GB/h) |
| 2026-10-02 | 1.4 GB free | `EPISODE` 90 d + verdict family flapping: 1,350 captures/day × ~95 artifacts |
| 2026-10-06 | 1.4 GB free, evidence 3.7 GB on disk vs 1.9 GB payload | ~1 M manifests/day write-then-delete; **DELETE never shrinks table files** (needed `VACUUM FULL`, `cpm-12b`) |
| since 2026-10-10 | bounded (v2.7.0, CHG-049) | cap 12 cycles, 60 min throttle, narrower policy; 2.1 GB → 32 MB after `cpm-12b`; ~1.1 GB on disk at the 15 Oct check |

Lessons that the target must keep: (1) row count, not payload, drove the size; (2) DELETE-based retention bloats;
(3) episode capture volume follows verdict churn, not loop count; (4) the plant disk (96 GB) is shared and had
2–17 GB free in October.

---

## 2. Measured volume

### 2.1 Where the bytes are (lab, all 1.05 M manifests)

| | Size | Per artifact |
|---|---|---|
| `evidence_manifest` (rows + 5 indexes) | 1,382 MB | **~1.38 KB** |
| `evidence_chunk` (rows + TOAST + PK) | 2,629 MB | 2.5 KB, of which payload 2.03 KB → **~0.6 KB overhead** |
| **Fixed overhead per artifact** | | **~2.0 KB** — larger than the payload of every per-cycle artifact |

### 2.2 One artifact, by kind (lab, 19 Sep, a full day at 161 loops)

| Gate · artifact | Samples | Payload | Note |
|---|---:|---:|---|
| G11 `measurement` | ~2,020 | 37 KB | largest |
| G9 `corners` | ~2,015 | 24 KB | |
| G5 `preprocessed_signal` | ~2,010 | 23 KB | |
| G10 `actuator_limits` | ~2,010 | 23 KB | |
| G5 `acf_series` | ~1,005 | 14 KB | |
| G6 `psd` | ~1,095 | 14 KB | |
| G8 `lag_structure` | 200 | 7 KB | |
| G7 `cycle_fit` (per cycle) | 52 | 1.25 KB | ×12 after the cap |
| G9 `cycle_polygon` / `normalized_pairs` (per cycle) | 53 | 1.0 / 0.9 KB | ×12 each after the cap |
| G5 `crossing_times`, G11 `eligibility_intervals` | | ≤ 0.4 KB | |
| G13 / G14 / G15 records | 0 | 20 B | payload is in the provenance |
| G12 response (7 artifacts per event) | ≤ 92 | 2.5 KB per event | |

**Plant correction (§9):** the lab rows above are an older build that resampled to ~2,000 points (24 h = 12 h: 140.8 vs
138.9 KB). At the plant every sample of the window is carried (8,613 at 12 h, 17,223 at 24 h on the 5 s grid) and
cycles are long (~570–800 samples each), so a plant set is ~4× the lab's and a 24 h set is ~1.7× a 12 h set.

### 2.3 One evidence set = one loop × one window (12 h or 24 h), cycle cap applied

| | Mean | p95 | Max |
|---|---:|---:|---:|
| Artifacts | 54 | — | — |
| Payload | **140 KB** | 240 KB | 630 KB |
| On disk today (payload + 54 × 2 KB) | **~250 KB** | ~350 KB | ~740 KB |
| Fusion records for the same verdict | 3 artifacts, < 1 KB payload, ~6 KB of rows | | |

### 2.4 Per loop and fleet, per 12 h / 24 h

| What is retained | Sets per loop per day | Per loop per day | Fleet (144 loops) per day | Per 12 h |
|---|---:|---:|---:|---:|
| Everything emitted today, 12 h + 24 h kinds (throttled hourly, finding in every window) | ≤ 48 | ~12 MB | **~1.7 GB** | ~0.85 GB |
| … plus the 4 h kind | ≤ 72 | ~18 MB | ~2.6 GB | ~1.3 GB |
| Lab stress run S1 (post CHG-049, 161 loops, 24 limit-cycle loops), measured | — | — | 1.2 GB payload + ~1.3 GB rows | — |

**This is the write-then-delete churn the TRANSIENT class absorbs today.** Keeping it all is not an option on the
plant disk: 30 days would be ~50 GB.

---

## 3. Storage options evaluated

### 3.1 Encoding — measured on 575 real payloads (25 per artifact kind)

| Codec | Bytes vs today | Exact? |
|---|---:|---|
| Today: f64 LE + gzip | 1.00 | yes |
| Byte-shuffle (Blosc-style) + gzip | 0.85 | yes |
| **Time axis as (start, step) when uniform + XOR-delta + byte-shuffle + deflate-9** | **0.77** | **yes, bit-exact; original SHA-256 still verifies** |
| same + LZMA instead of deflate | 0.74 | yes (not worth a new codec in Java + browser) |
| same with value columns as f32 | 0.32 | no — max relative error 5.9e-8 (7 significant digits) |

f32 error is far below instrument resolution (and PI / OPC values are usually float32 at the source), but it breaks
the bit-exact SHA-256 of the original artifact, which is what the workbench's *Retained proof* label rests on
(SME review 2 #18, CHG-099).

### 3.2 Packing — measured on 40 complete 12 h / 24 h windows (2,000+ artifacts)

One row per window instead of one row per artifact, identical columns stored once (the PV / OP / time columns repeat
across `preprocessed_signal`, `measurement`, `actuator_limits`, `corners`):

| Per window | Mean | p95 | vs today |
|---|---:|---:|---:|
| Today (rows per artifact) | 272 KB | 295 KB | 1.00 |
| **Packed, lossless** | **124 KB** | 139 KB | **0.45** |
| Packed, f32 values | 58 KB | 65 KB | 0.21 |

(These 40 windows are limit-cycle loops with the full 12 cycles, so they sit above the fleet mean; the ratio is what
carries over. Planning value for the average window: **~117 KB lossless, ~57 KB f32, including a ~5 KB compressed
verdict snapshot**.)

### 3.3 Where to store it

| Option | Verdict |
|---|---|
| Keep TRANSIENT rows longer (raise 6 h) | **No.** Same 2 KB/row overhead, DELETE bloat, 1.7 GB/day |
| Raise `EPISODE` days back up | **No** on its own: volume follows verdict churn (§1.5) and captures land on arbitrary 15-min windows |
| **New packed archive table in `traverse_cplm`, partitioned by day, retention by `DROP PARTITION`** | **Yes.** One row per window, no DELETE bloat, no `VACUUM FULL`, reuses the daily-partition maintenance the result tables already have (CHG-033) |
| Object storage (MinIO) behind `IEvidenceBlobStore` | Later, if the archive passes ~20 GB or several plants share it; not needed for ≤ 1 year at Marun |
| Point at the historian instead of storing (reconstruct every time) | Keeps working as a fallback, but it is *Reconstructed*, not proof, and the IoTDB TTL bounds it |

---

## 4. Target design

### 4.1 Principle

Keep **one complete evidence set per loop per non-overlapping period** — the 12 h windows ending 00:00 and 12:00 UTC
and the 24 h window ending 00:00 UTC — as **one packed, lossless, immutable row**, plus the windows an episode
captured. The 15-min sliding evaluations in between stay TRANSIENT (6 h) exactly as today. Every period of the
loop's history is then covered once by a 12 h set and once by a 24 h set, without overlap.

Boundary sets are kept **whether or not the window has a finding**: a healthy reference window is what an engineer
compares a faulty one against.

### 4.2 Changes by component

**Flink (`src/flink`, Long + Fusion jobs) — small.**
- A window whose end is a 12 h / 24 h boundary (`windowEndMs % kindMs == 0`; the 15-min timers are epoch-aligned,
  so they hit 00:00 / 12:00 UTC exactly) **always emits**, bypassing the throttle and the `episodes` finding rule.
  Mode `none` still emits nothing. New argument `--evidence-boundary-kinds` (env `CPLM_EVIDENCE_BOUNDARY_KINDS`,
  default `12h,24h`, empty = off).
- The cycle cap (12) stays. No codec change in Flink: the live path keeps f64 + gzip.

**Schema (`database/scripts/65_…` + plant `cpm-NN` ops script) — new tables.**
- `analytics.evidence_archive`, partitioned by day on `window_end`: `archive_id`, `loop_id`, `window_kind`,
  `window_end`, `archive_class` (`BOUNDARY` / `EPISODE` / `PINNED`), `pinned`, `episode_id`, `codec`,
  `artifact_count`, `payload_bytes`, `sha256`, `payload bytea` (column `STORAGE EXTERNAL`: it is already compressed),
  `verdict_snapshot` inside the payload, `created_at`. Unique `(loop_id, window_kind, window_end, archive_class)`.
- `analytics.evidence_archive_run (method_run_id → archive_id)`: the workbench keeps addressing evidence by method
  run; this is the lookup when the live rows are gone.
- `retention_policy` rows `ARCHIVE` (days) and `EPISODE_ARCHIVE` (days after close).

**cplm-api — new `EvidenceArchiver` + reader fallback.**
- Every 15 min: for each boundary window (and each episode capture) whose artifacts are COMPLETE — or 60 min after
  the window end, whatever is complete, marked partial — read the TRANSIENT rows of its method runs (long gates +
  fusion records + the verdict row), pack them (lossless codec of §3.1/3.2, original `evidence_id`s, per-artifact
  SHA-256 and provenance kept in the pack's index), insert one archive row, commit. The TRANSIENT rows then age out
  as today.
- `EvidenceManifestReader`: no live rows for a method run → look in `evidence_archive_run` → serve the same manifest
  shape (original ids and checksums, readiness COMPLETE, `source: ARCHIVE`); the chunk endpoint re-expands the
  artifact to today's f64 + gzip bytes. **The frontend decoder does not change** and the original SHA-256 verifies.
- Retention: drop partitions older than `ARCHIVE` days; `Cplm__EvidenceArchiveBudgetBytes` drops the oldest
  `BOUNDARY` partitions first if the archive outgrows its budget (episode and pinned packs are never dropped by the
  budget). Episode packs expire `EPISODE_ARCHIVE` days after the episode closes.

**Episodes — reference, never copy (§5.3: ~300 episodes/day at the plant).**
- An episode protects the boundary packs that overlap it until N days after it closes; no extra packs are written.
- The existing `EPISODE` class on live rows (2 d after close) stays for the exact triggering window.

**Workbench (`src/frontend-ob`) — labels and reach.**
- Archived sets show as *Retained proof (archived)*; checksums verify as today.
- The historical window list for > 14 d comes from the archive index (the verdict snapshot travels with the pack,
  because `GATE_RESULTS` is 14 d at Marun). OpenBridge components only.

**Ops.**
- Daily check: an `evidence archive N MB, oldest <date>` line next to the existing evidence line.
- `migration/backup-cplm-db.sh` dumps everything in `traverse_cplm`: the archive grows every backup by its size —
  decide whether backups carry it (§6 D5).
- `prod_decision.md` rows for the new knobs; `changes_tracker.md` entry; lab 24 h soak to measure MB/day before the plant.

### 4.3 What stays the same

TRANSIENT (6 h / 2 GiB) for the live workbench; `STANDARD` reconstructions (3 d); `PINNED` forever; the Short tier
emits nothing; G0–G4 for a historical window are still rebuilt from IoTDB on demand while the historian holds the
data; the 4 h window kind is not archived (the workbench shows 12 h by default and 24 h on a switch, CHG-089).

---

## 5. Capacity — how far back we can keep it (plant figures, 2026-11-03)

Sizes come from the plant's own artifacts (§9). Packing ratio: the lab measured 0.69 of payload for a lossless pack
and 0.32 for f32; the plant's series are longer and share more columns (5 s time axis, PV / OP in four artifacts), so
0.7 is used as a conservative planning value until the lab soak measures it on plant-shaped data.

### 5.1 One full evidence set at the plant (all long gates, ~10 cycles)

| Window | Fixed artifacts | Per-cycle artifacts (×10) | Full set payload | With 12 cycles |
|---|---:|---:|---:|---:|
| 12 h (8,613 samples) | 321 KB | 246 KB | **~570 KB** | ~620 KB |
| 24 h (17,223 samples) | 607 KB | 347 KB | **~950 KB** | ~1,020 KB |

The plant artifacts carry every sample of the window (5 s grid) — **a 24 h set is ~1.7× a 12 h set**, not equal as
the lab's older resampled artifacts suggested (§2.2).

### 5.2 Boundary archive, 143 loops

| What is kept per loop per day | Payload / loop / day | Fleet / day, packed lossless (planning +25 %) | Fleet / day, f32 (planning) |
|---|---:|---:|---:|
| **12 h × 2 + 24 h × 1 (recommended)** | 2.1 MB | **~260 MB** | ~120 MB |
| 12 h × 2 only (covers every hour once) | 1.1 MB | ~140 MB | ~65 MB |
| 24 h × 1 only | 0.95 MB | ~120 MB | ~55 MB |

| Kept | 12 h + 24 h, lossless | 12 h + 24 h, f32 | 12 h only, lossless | 24 h only, lossless |
|---|---:|---:|---:|---:|
| 7 days | 1.8 GB | 0.8 GB | 1.0 GB | 0.8 GB |
| 30 days | **7.8 GB** | 3.6 GB | 4.3 GB | 3.6 GB |
| 60 days | **15.6 GB** | 7.2 GB | 8.5 GB | 7.2 GB |
| 90 days | **23.4 GB** | 10.8 GB | 12.8 GB | 10.7 GB |
| 180 days | 47 GB | 22 GB | 26 GB | 21 GB |
| 365 days | 95 GB | 44 GB | 52 GB | 43 GB |

For comparison, today's row format would need ~420 MB/day (90 d ≈ 38 GB).

### 5.3 Episodes: reference, never copy

The plant opens **~300 episodes a day** (14-day mean 285, weekdays 290–360, Sunday 34) — the CHG-034 debounce
halved the October 580 but did not make episodes rare. Copying the OPEN + CLOSE windows (the earlier proposal) would be
~600 packs/day × ~0.8 MB ≈ **480 MB/day**, more than the whole boundary archive. Therefore:

- an episode **references** the boundary packs that overlap it and protects them until N days after it closes
  (no extra bytes; a 12 h boundary pack always contains, or directly follows, the window that opened the episode);
- the existing `EPISODE` class on live rows (2 d after close) stays as is for the exact triggering window.

### 5.4 "Previous evidence" — what exists and what a backfill costs

- **Nothing older than ~2 days exists as original evidence** (open episodes aside: their captures reach back to
  19 Oct, 13,371 artifacts, 196 MB). Evidence was truncated 26 Sep, 2 Oct and 6 Oct and is swept since 10 Oct.
- **The historian holds 90 days** (`root.site1` TTL 7,776,000,000 ms; oldest PV 2026-09-01), so every window since
  1 Sep can be rebuilt (`EVIDENCE_RECONSTRUCTION`, source `iotdb`), labelled *Reconstructed* (CHG-099).
- Backfill cost per plant-day: ~260 MB (lossless) and 429 window replays (143 × 3) on one TaskManager slot,
  *estimate* ~10–20 s each → 1.2–2.4 h of slot time per day; 63 days back to 1 Sep ≈ 16 GB and ~3–6 days of one slot.
- Beyond 90 days the raw samples are gone: an archived set older than that can no longer be rebuilt, only read.

### 5.5 Fit to the plant disk

Plant 2026-11-03: **194 GB, 90 GB free** (the VM disk was enlarged since October's 96 GB); evidence tables 1.28 GB on
disk; whole `traverse_cplm` 7.5 GB. The disk is still shared with other teams' deployments (17 GB appeared in three
days in October), so the archive gets a budget cap.

| Plan | Archive at plateau | Share of today's free 90 GB |
|---|---:|---:|
| 30 d, 12 h + 24 h, lossless | ~8 GB | 9 % |
| 60 d, 12 h + 24 h, lossless | ~16 GB | 17 % |
| **90 d, 12 h + 24 h, lossless** (= historian reach) | **~23 GB** | **26 %** |
| 90 d, 12 h + 24 h, f32 | ~11 GB | 12 % |
| 365 d, lossless | ~95 GB | does not fit |

---

## 6. Recommendation and decisions needed

**Recommended:** packed, lossless boundary archive (12 h × 2 + 24 h × 1 per loop per day, finding or not) in a
day-partitioned `evidence_archive` table, episodes referencing it. Go live at **30 days with a 12 GiB budget cap**,
measure the real packed MB/day for two weeks, then raise to **90 days (≈ 23 GB, cap 30 GiB)** — the historian's reach,
so every archived window can also still be rebuilt. The live path (TRANSIENT 6 h) and the frontend decoder do not
change; every archived artifact verifies against its original SHA-256.

Decisions for the user / SME:

| # | Decision | Recommendation |
|---|---|---|
| D1 | Retention days | 30 d at go-live, 90 d after two weeks of measured size |
| D2 | Lossless or f32 | lossless (bit-exact proof); f32 halves the size but loses the original checksum |
| D3 | Boundary clock | plant time (server is `Etc/UTC`; the plant is UTC+3:30) or shift change — SME. No timer change: the boundary test takes an offset, 3:30 is a multiple of 15 min |
| D4 | Episodes | reference boundary packs, no copies (§5.3) |
| D5 | Backups | exclude `evidence_archive` data from the routine dump (it would add up to 23 GB per backup) or accept it |
| D6 | Backfill from IoTDB (1 Sep onward) | optional, ~16 GB + ~3–6 days of one slot; label *Reconstructed* |
| D7 | Which windows | 12 h + 24 h; 12 h only halves the cost and still covers every hour |

Side finding: live long-tier emission runs at **1.7–1.8 per loop per hour** for 12 h / 24 h (designed ≤ 1): finding
signatures change between windows (flapping, CHG-049 O1), so the TRANSIENT churn is ~2.8 GB/day of payload. It is
bounded (6 h / 2 GiB). **User decision 2026-11-03: fixed in this release, together with the archive, after the SME review.**

Indicative build: Flink boundary emit (1 change + tests), schema + ops script, cplm-api archiver + reader fallback +
retention, workbench labels and archive-backed window list, docs/ops. One release; CHG and `cpm-NN` numbers to be
reserved before the build.

---

## 7. Plant queries that replace the estimates (read-only)

Run in `traverse_cplm` at Marun before fixing D1 / D4:

```sql
-- 1. episodes opened per day since the CHG-034 debounce (drives §5.2)
SELECT date_trunc('day', opened_at)::date AS day, count(*) FROM analytics.cplm_event_frames
WHERE opened_at > now() - interval '14 days' GROUP BY 1 ORDER BY 1;

-- 2. evidence on disk now (the daily-check figure)
SELECT pg_size_pretty(pg_total_relation_size('analytics.evidence_manifest') + pg_total_relation_size('analytics.evidence_chunk'));

-- 3. plant evidence set per loop × window (validates the 140 KB lab mean; TRANSIENT holds the last 6 h)
SELECT kind, count(*) AS sets, round(avg(n)) AS artifacts,
       round(avg(b) / 1024) AS payload_kb, round(max(b) / 1024) AS max_kb
FROM (SELECT provenance->>'loop_id' AS loop, provenance->>'window_kind' AS kind, provenance->>'window_end_ms' AS win_end,
             count(*) AS n, sum(total_bytes) AS b
      FROM analytics.evidence_manifest
      WHERE gate_id IN ('G5','G6','G7','G8','G9','G10','G11')
      GROUP BY 1, 2, 3) s
GROUP BY kind ORDER BY kind;

-- 4. historian reach for reconstruction / backfill (IoTDB CLI, not SQL):
--    show all ttl;   select pv from root.<site>.cpm.<loop> order by time asc limit 1;
```

Also `df -h /` on the VM for §5.4.

---

## 8. Method and caveats

- Lab database `docker_postgres-data` mounted read-only-in-practice in a throw-away container (no port, removed after),
  2026-11-03. The lab's live rows are classed `STANDARD` (older lab image), which is why two weeks survived to be measured.
- Per-window figures use 18–19 Sep (full days, 161 loops, emission before CHG-049) with the 12-cycle cap applied
  in the query; replay duplicates removed per window.
- The codec and packing ratios are from offline re-encoding (Python, numpy, zlib / lzma) of the real gzip payloads;
  the Java implementation must reproduce them in the lab before the plant numbers are fixed.
- Lab loops are partly synthetic (limit-cycle sims); plant windows may carry fewer cycle artifacts (smaller sets) —
  §7 query 3 settles it.

---

## 9. Plant measurement (Marun, 2026-11-03 06:42 UTC, read-only)

| Item | Value |
|---|---|
| Disk | 194 GB, 96 GB used, **90 GB free** |
| Evidence tables | manifest 118 MB + chunk 1,162 MB; `traverse_cplm` 7,543 MB |
| Retention rows | EPISODE 2, GATE_RESULTS 14, LONG_FEATURES 1, SHORT_FEATURES 1, RESPONSE 14, RESPONSE_CENSORED 3, STANDARD 3, PINNED null |
| Evidence by class | TRANSIENT 54,445 rows / 703 MB payload, oldest 00:34 (6.1 h); EPISODE COMPLETE 13,371 / 196 MB (oldest 19 Oct, open episodes); EPISODE EXPIRED 3,832 |
| Episodes opened / day (20 Oct – 2 Nov) | 172, 296, 341, 359, 165, 34, 235, 285, 335, 288, 342, 310, 302, 332 |
| Gate results | oldest 2026-10-19 23:58 (14 d) |
| IoTDB TTL | `root.site1` 7,776,000,000 ms (90 d); `root.ams` 365 d; oldest `PIC80105.pv` 2026-09-01T22:44:15Z |
| Server clock | `Etc/UTC` |
| Live emissions, long tier | 12 h 1.81, 24 h 1.70, 4 h 1.08 per loop per hour; per emission 12 h 8 artifacts / 149 KB (p95 688, max 887), 24 h 10 / 299 KB (p95 1,198, max 1,729) |

Artifact sizes at the plant (TRANSIENT, mean payload):

| Artifact | 12 h | 24 h | Samples 12 h / 24 h |
|---|---:|---:|---:|
| G11 `measurement` | 81.9 KB | 162.5 KB | 8,613 / 17,223 |
| G9 `corners` | 87.9 | 171.5 | 8,640 / 17,280 |
| G5 `preprocessed_signal` | 52.2 | 106.9 | 8,613 / 17,223 |
| G10 `actuator_limits` | 45.6 | 92.7 | 8,613 / 17,223 |
| G6 `psd` | 35.4 | 53.0 | 4,192 / 6,740 |
| G5 `acf_series` | 9.6 | 10.3 | 728 / 787 |
| G8 `lag_structure` | 7.0 | 6.9 | 200 |
| G7 `cycle_fit` (per cycle) | 13.2 | 19.0 | 571 / 806 |
| G9 `normalized_pairs` / `cycle_polygon` (per cycle) | 7.0 / 4.4 | 9.7 / 6.0 | 537 / 764 |
| G7 `cycle_scores`, G10 `DWELL_EVENTS`, G11 `FREEZE_EVENTS`, G5 `crossing_times`, G13–G15 records | ≤ 1.7 | ≤ 1.7 | |

Every artifact fits one 256 KiB chunk (max_chunks 1).

