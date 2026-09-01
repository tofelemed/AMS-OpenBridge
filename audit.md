# CPLM Short Feature Engine — End-to-End Audit

**Date:** 2026-09-01 · **Branch:** `feat/ot-loop-ingestion` · **Scope:** Flink job → Kafka `traverse.cpa.clpm.feature.short.v1` → cplm-api consumer/storage → REST API → CPM UI (Performance, Loop Explorer, and siblings)

---

## 0. Executive summary

**The pipeline is healthy end-to-end — data flows, is stored losslessly, and is fresh — but the finest-grained results (the 1-minute windows and the per-window gate verdicts) are almost entirely invisible in the UI.**

1. **Premise correction:** only the **`1m` window is a tumbling window**. `5m/10m/15m/30m/60m` are **sliding windows with overlap** (e.g. 5m slides every 1m → 80 % overlap). Any UI or rollup that sums/averages across sliding windows double-counts data. Verified live and in code (`CplmShortFeatureStreamJob.java:51-120`).
2. **Kafka: confirmed live.** ~27,700 events on the topic, all six window kinds present, full feature+gate payload per window, zero consumer lag, latest 1m window ≈ 2 min behind wall clock (watermark-bounded, expected).
3. **Backend: everything is stored, little is served.** All six window kinds land in `analytics.cplm_short_feature_results` (idempotent upsert, hypertable, 365-day retention). But only **10 of ~40 payload fields** get typed columns, the **short-window gate statuses (G0–G4, G2r) are persisted in JSONB and exposed by NO endpoint**, ~30 metrics are unreachable over HTTP, and a parallel IoTDB KPI series is written that nothing ever reads.
4. **UI: the 1m tumbling window is reachable from exactly ONE control in the whole product** (Window Inspector's profile `<select>`). The **Performance page** offers only `12h|24h` (hardcoded, correct for fused verdicts but unexplained). The **Loop Explorer has no window selector at all** — five tabs, four hardcoded to `'24h'`. The Window Inspector fetches per-window feature values (`/kpis`) and **discards them** — it renders only timestamps/sample counts. **There is no screen where a user can see MAE/IAE/effort per 1m window, or compare a loop across window sizes.**

The application "calculates everything even at 1 min" — the calculation side of that claim is true and running; the *presentation* side is ~15 % delivered.

---

## 1. Stage 1 — Flink job (producer)

**Job:** `AMS - CPLM Short Feature Engine` — [CplmShortFeatureStreamJob.java](src/flink/src/main/java/com/ams/flink/cplm/CplmShortFeatureStreamJob.java) · math in [CplmGateEngine.java](src/flink/src/main/java/com/ams/flink/cplm/CplmGateEngine.java) (`computeShortFeatures`, lines 53-256) · payload POJO [CplmShortFeatureResult.java](src/flink/src/main/java/com/ams/flink/cplm/CplmShortFeatureResult.java)

### 1.1 Window branches (all event-time, keyed per `loopId`, unioned to one sink)

| window_kind | Assigner | Size | Slide | Allowed lateness | Re-emit cadence |
|---|---|---|---|---|---|
| `1m` | **Tumbling** | 1 min | — | 30 s | 1 min |
| `5m` | Sliding | 5 min | 1 min | 60 s | 1 min |
| `10m` | Sliding | 10 min | 2 min | 90 s | 2 min |
| `15m` | Sliding | 15 min | 5 min | 2 min | 5 min |
| `30m` | Sliding | 30 min | 5 min | 2 min | 5 min |
| `60m` | Sliding | 60 min | 5 min | 3 min | 5 min |

≈ 3.1 records/min/loop. Watermarks: 2 min out-of-orderness + 1 min idleness ([CplmIngestPipeline.java:40-43](src/flink/src/main/java/com/ams/flink/cplm/CplmIngestPipeline.java#L40-L43)). Checkpointing EXACTLY_ONCE @180 s; sink is AT_LEAST_ONCE (duplicates absorbed by the DB upsert). Parallelism 1 (cluster default).

### 1.2 What each window computes (calc v3.0.0, profile v2.0.0)

- **Gate 0 — data quality:** `sample_period_sec` (median Δt), `expected_sample_count`, `completeness`, `bad_quality_pct`, `duplicate_timestamps`, `sampling_jitter`, `gap_count`, `max_gap_s`. FAIL if bad ≥ 50 % or completeness < 95 %.
- **Gate 1 — mode/service:** `auto_pct`, `manual_pct`, `mode_changes_per_h` (≥0.90 PASS / ≥0.70 WARN / EXCLUDED).
- **Gate 2 — setpoint activity:** `sp_min/max/range`, `sp_changes_per_h`.
- **Gate 2r — operating region:** `region_out_of_band_pct`, `operating_region_valid`.
- **Gate 3 — base performance:** `mae`, `rmse`, `iae`, `ise`, `itae` (interval-weighted ZOH), `good_error_pct`, `oce`, `pv_std`, `op_std`, `freeze_index_s`, `saturation_pct`.
- **Gate 4 — control effort:** `effort_ratio`, `effort_ratio_normalized`, `op_travel`, `travel_per_day`, `reversal_count`, `reversals_per_hour`.
- Early-exit: G0 FAIL or n < 10 → `sufficient_data=false`, all metrics emitted as JSON `null` (deliberate: unevaluated ≠ zero).

Siblings for contrast: **long job** (4h/12h/24h rolling-buffer slices, 15-min timers, gates 5–11: ACF/FFT oscillation, stiction/Horch, geometry) → `feature.long.v1`; **fusion job** joins short+long and emits full G0–G15 verdicts (diagnosis/severity/confidence) → `gate.results.v1`, firing **only on 12h/24h**.

### 1.3 Producer-side findings

| # | Finding | Where |
|---|---|---|
| F-1 | Class Javadoc says **4** branches ("1m tumbling + 5m/15m/60m sliding"); code has **6**. `:122` still says "Union all four branches". | `CplmShortFeatureStreamJob.java:18-27,122` |
| F-2 | **Output records are unkeyed** (value-only sink). No per-loop partition ordering on the topic; keyed variant `attachKeyed` exists and is used by the RBE job but not here. Confirmed live: message keys are `null`. | `CplmShortFeatureStreamJob.java:124`, `CplmKafkaSink.java:14-40` |
| F-3 | Fusion fallback ladder probes only `60m → 15m → 5m → 1m`; **10m and 30m are invisible to fusion** (still stored/KPI'd). | `CplmGateFusionStreamJob.java:139-142` |
| F-4 | **`itae` is not comparable across window kinds** (time weight anchored to `windowStartMs` → ~60× larger at 60m than 1m). Nothing in the payload flags this. | `CplmGateEngine.java:211` |
| F-5 | Compiled default input topic `traverse.cpa.clpm.normalized.samples.v1` is **dead** — every submitter overrides with `traverse.cpa.loop.samples.v1`. A submit that forgets `--input-topic` silently produces nothing. | `CplmJobConfig.java:43` |

---

## 2. Stage 2 — Kafka topic (live evidence, 2026-09-01)

- Topic `traverse.cpa.clpm.feature.short.v1`: 8 partitions, ~27,700 messages, **all six window kinds observed** (sample of 4,000: 1m×1281, 5m×1282, 10m×660, 15m×240, 30m×269, 60m×268).
- Payload sample (live, 1m window): `{"eventType":"CPLM_SHORT_FEATURE","loop_id":"FIC10404","window_kind":"1m","windowStartMs":…,"windowEndMs":…,"sample_count":12,"completeness":1.0,"gate0_status":"PASS",…,"mae":0.38,"rmse":0.47,"iae":23.0,…,"effort_ratio":3.24,"gate4_status":"WARN","sufficient_data":true}` — full field list in §1.2; mixed snake_case/camelCase is real.
- `feature.long.v1` live: `CPLM_LONG_DIAGNOSTIC` at 12h/24h with embedded `short_features` object. `gate.results.v1` live: full G0–G15 + `diagnosis/severity/confidence/recommendation`.
- **Consumer group `traverse-cpa-cplm-results`: single static member (`-sole`), lag 0 on all 24 partitions across all three topics.** The one-member rule from the runbook is being honored.
- Freshness: latest stored 1m `window_end` was 2 min 45 s behind `now()` — consistent with the 2-min watermark + flush; not a defect.

---

## 3. Stage 3 — Backend consumption & storage (cplm-api)

**Sole consumer:** [CplmResultConsumerService.cs](src/services/cplm-api/BackgroundServices/CplmResultConsumerService.cs) — one loop subscribes to gate.results + feature.short + feature.long (`:115-117`), group `traverse-cpa-cplm-results`, offsets stored only after successful persist (at-least-once). Event frames are built by the separate `CplmEventFrameService` (`-frames` group, gate topic only). ams-api has no short-feature consumer (correct per the cutover runbook).

**Persistence per message** (`PersistFeatureAsync:260-349`): no typed DTO — raw `JsonDocument`; extracts `loop_id`, `window_kind`, window bounds, `sample_count`, and **exactly 10 metrics** into typed columns (`iae, ise, mae, rmse, good_error_pct, effort_ratio, travel_per_day, reversals_per_hour, auto_pct, completeness`); the **whole raw message goes to `payload` JSONB** (nothing lost at rest). Upsert on `(loop_id, window_kind, window_end, source)` guarded by `EXCLUDED.sample_count >= existing` — late/duplicate deliveries are idempotent.

**Table** `analytics.cplm_short_feature_results` ([30_cplm_analytics_schema.sql:92-131](database/scripts/30_cplm_analytics_schema.sql#L92-L131)): hypertable on `window_end` (7-day chunks), compress after 30 d, **retention 365 d** ([39_timescale_policies.sql:123-152](database/scripts/39_timescale_policies.sql#L123-L152)). Verified live: **all six window kinds stored** (1m×14,962 · 5m×15,089 · 10m×7,641 · 15m×3,094 · 30m×3,205 · 60m×3,402 rows; Aug 4 → now; 27 of 216 registered loops producing — the sim feeds a subset).

**Dual-write:** every window also writes an IoTDB series `root.site1.cpm.<loop>.kpi.short_<kind>` (`:346-382`; nulls skipped → genuine gaps, not zeros).

### 3.1 Backend findings

| # | Finding | Where |
|---|---|---|
| B-1 | **Short-window gate statuses (`gate0..4_status`, `gate2r_status`) exist only in `payload` JSONB — no column, no endpoint.** A client can never see per-1m/5m gate verdicts although every one is persisted. | `CplmShortFeatureResult.java:117-146` vs `CpmAnalyticsController.cs:129,158` |
| B-2 | **~30 payload metrics have no typed column AND no API projection**: `itae, oce, pv_std, op_std, freeze_index_s, manual_pct, mode_changes_per_h, sp_min/max/range, sp_changes_per_h, bad_quality_pct, duplicate_timestamps, sampling_jitter, gap_count, max_gap_s, effort_ratio_normalized, op_travel, reversal_count, saturation_pct, region_out_of_band_pct, operating_region_valid, dynamics_class, gate_profile_id, loop_type, versions…` Queryable in JSONB, unreachable over HTTP. | `CplmResultConsumerService.cs:326-327`, `CpmAnalyticsController.cs:216-227` |
| B-3 | **IoTDB KPI series has no reader** — written per window, matched by nothing in `historian-bff` or anywhere else. Pure write-only cost. | `CplmResultConsumerService.cs:346-382` |
| B-4 | **`_latest` views are dead** (no consumers) and the two feature views tiebreak on `created_at DESC` — the exact recency bug already fixed for the gate view (P1-3). Inert today, a trap if adopted. | `30_cplm_analytics_schema.sql:126-131,165` |
| B-5 | **Poison-pill risk:** missing/0 `windowEndMs` → `DBNull` into the hypertable's NOT NULL partition column → insert throws → offset never stored → 2 s retry loop **halts all three streams** (shared consumer loop). | `CplmResultConsumerService.cs:144,152-157,512-518` |
| B-6 | Self-healing `EnsureSchemaAsync` recreates tables/indexes/views but **not** hypertable/compression/retention — a DB healed by the service alone grows unbounded on the fastest-growing table. | `CplmResultConsumerService.cs:386-482` |
| B-7 | `/kpis` `limit` clamps at 500 with **no cursor** — one day of 1m windows is 1,440 rows; full-fidelity 1m retrieval is impossible. Rows return newest-first (clients must reverse). | `CpmAnalyticsController.cs:184,232` |
| B-8 | `source` column is permanently `'flink'` for short features — the producer never emits `calculation_source` (only the gate-replay path does), so the replay-provenance rationale is unrealized here. | `CplmShortFeatureResult.java` (absent key), `CplmResultConsumerService.cs:339-343` |
| B-9 | `/resolutions` window contract is a **hand-maintained mirror** of the Flink sources (doc comment admits drift-by-construction). It is currently correct (verified against the job), but nothing enforces it. | `CpmAnalyticsController.cs:47-107` |

### 3.2 REST surface relevant to windows

| Endpoint | Window control | Reads |
|---|---|---|
| `GET /api/v1/cpm/loops/{id}/kpis?resolution=&from=&to=&limit=` | **The only knob**: `resolution` ∈ {1m,5m,10m,15m,30m,60m,4h,12h,24h}; validated, 400 with allowed list on miss. **Default `24h`** → a caller that omits it never sees short features. Serves 14 fields incl. `sufficient_data`, `sample_period_sec`, `expected_sample_count`. | short/long feature tables |
| `GET /api/v1/cpm/loops/{id}/gates/latest?windowKind=` · `GET …/gates?windowKind=&from=&to=&includeInsufficient=` | `windowKind` default `24h` — only 12h/24h rows exist | `cplm_gate_results` only |
| `GET /api/v1/cpm/fleet/{summary,rankings,heatmap}?windowKind=` | takes `windowKind` but joins **gate results only** → short kinds return empty. **No fleet short-feature analytics exist server-side.** | `cplm_gate_results` |
| `GET /api/v1/cpm/resolutions` | none — serves the full window contract (kind/tier/assigner/size/slide/lateness/cadence/minSamples/fusion.firesOn) | static |
| `GET /api/v1/cpm/loops/{id}/readiness` | none — short features surface only as a `COUNT(*)` | short table |

**No push transport for features/gates** — no SignalR/MQTT in cplm-api (explicitly deferred, `:38-39`); UI polls react-query over REST. (ams-api's `OnLoopKpiUpdate` hub method is fed by a topic whose producer is never submitted — dead on both ends.)

---

## 4. Stage 4 — Frontend (the main gap)

Pages: `/cpm` Overview · `/cpm/performance` **Performance** · `/cpm/explorer` **Loop Explorer** · Historical · **Window Inspector** (`/cpm/windows`) · Replay · Investigation · Calculations · Registry · Events · Pipeline · Governance. API layer: [cpmApi.ts](src/frontend-ob/src/api/cpmApi.ts) / [useCpm.ts](src/frontend-ob/src/hooks/useCpm.ts) — the window contract is fully typed (`CpmWindowSpec`, `cpmApi.ts:494-506`) but **`useCpmResolutions` is consumed by only 3 of 12 pages** (CpmWindows, PipelinePanel, AddLoopWizard).

### 4.1 Performance page ([CpmPerformance.tsx](src/frontend-ob/src/components/Cpm/CpmPerformance.tsx))

- Window selector exists but offers **literals `12h`/`24h` only** (`:157-167`, guard `:162`), default `'24h'` (`:53`). Not derived from `resolutions.fusion.firesOn` — a new fusion trigger server-side would never appear.
- This is *defensible* (gate verdicts only exist at 12h/24h) but **unexplained on screen**: no mention that short windows exist, that 12h/24h are rolling-buffer slices recomputed every 15 min, or why 1m…60m aren't offered. The control reads like a chart time-range.
- Heatmap rows carry `windowEnd` only — no `windowStart`, no `windowKind` per row (`cpmApi.ts:396-404`). Staleness banner uses a fixed 3 h regardless of selected window's cadence (`:39,228-233`).
- KPI tiles are computed client-side over the **capped top-50 confidence-ordered ranking page** (median MAE, avg good-error) — honest `truncated` captions exist, but it's a sample statistic presented as fleet-level.

### 4.2 Loop Explorer ([CpmExplorer.tsx](src/frontend-ob/src/components/Cpm/CpmExplorer.tsx) + `explorer/*`)

- **No window selector anywhere.** Gate/verdict reads hardcode `'24h'` in **four tabs** (`LoopWorkspace.tsx:47`, `SummaryTab.tsx:27`, `CalculationsTab.tsx:28`, `RelationshipsTab.tsx:29`).
- The only thing labeled "Window" on Summary is the **8-hour rolling historian trend range** (`shared.tsx:88`) — a wall-clock envelope, not an engine window. Same noun, different concept, on the page where the confusion matters most.
- Calculations tab prose says "once a 12h window has been evaluated" while querying `'24h'` (`CalculationsTab.tsx:57`).
- History tab sums event-frame `window_count` across episodes and prints "N windows" **with no window size**, though `window_kind` is in the type and is rendered on CpmEvents.

### 4.3 Window Inspector ([CpmWindows.tsx](src/frontend-ob/src/components/Cpm/CpmWindows.tsx)) — the only real per-window view

The good: per-window-size `<select>` grouped short/long, labels from `fmtWindowShape` ("1m — 1 min tumbling", "5m — 5 min / 1 min slide"); per-window list (end, start, samples, emitted-at, completeness pill); metadata panel with `[start, end)` boundary semantics, size/slide, expected vs actual samples, lateness/cadence; deep links to Historical/Trend pinned to window bounds.

The gaps:
- **Fetches `/kpis` and renders NO feature values** — MAE/RMSE/IAE/effort/auto_pct per window are in the response and discarded. The user's core ask ("see the calculations per 1-min window") dies exactly here.
- `limit=12` hardcoded, no from/to, no paging → on 1m that's 12 minutes of history, ever.
- Default profile `'15m'` hardcoded (a sliding kind) instead of contract-driven.
- `sufficient_data=false` windows render an ordinary completeness pill — engine-declined windows are indistinguishable.
- No gate chips (correct server-side today — see B-1 — but the page never says short windows *have* gate statuses that aren't shown).

### 4.4 Calculations page ([CpmCalculations.tsx](src/frontend-ob/src/components/Cpm/CpmCalculations.tsx))

Latest-value snapshot at **frozen literals**: short metrics pinned `'60m'`, long `'24h'` (`:60-62`); the "Window" table cell prints the string constant `'60m' | '24h' | '24h fused'` (`:257`). Honors `sufficient_data` (`— (declined)`). No way to ask "what did 1m say?".

### 4.5 Hardcoded window kinds — consolidated

`'24h'` literals: LoopWorkspace:47, SummaryTab:27, CalculationsTab:28, RelationshipsTab:29, FocusedLoopDrawer:39, CpmCalculations:60,62, CpmHistorical:112, CpmReplay:89,104, CpmPipeline:52, plus every hook/API default (`useCpm.ts:114,137,158,168,223,233`; `cpmApi.ts:265,270,309,386,406,478`). Others: CpmPerformance `12h|24h` (:162-166), CpmCalculations `'60m'` (:61), CpmWindows default `'15m'` (:62) + local `PROFILE_SECONDS` map (:28-31), CpmInvestigation `24h|12h` (:299-303), CpmHistorical overlay literals `15m|24h` (:38-44).

The word "tumbling" appears on **one screen** (`shared.tsx:141`, `CpmWindows.tsx:401-404`). Nothing else tells the user 5m–60m overlap.

---

## 5. Consolidated gap analysis

**Where the value is being wasted (data exists, UI blind):**

| Layer | Have | Missing |
|---|---|---|
| Flink → Kafka | 6 window kinds, ~40 fields + 6 gate statuses/window, live & fresh | keying; contract not self-describing (no slide/assigner in payload) |
| DB | 100 % of payload in JSONB, all kinds, idempotent, retained 365 d | 30 metrics un-columnised; short gates unprojected |
| API | `/kpis?resolution=` per-kind rows; `/resolutions` contract | short gate statuses (B-1); full payload projection (B-2); paging (B-7); fleet short-window analytics; push |
| UI | Window Inspector metadata; contract typed in TS | **feature values per window; 1m visibility anywhere else; window selectors; cross-kind comparison; sliding-vs-tumbling honesty** |

**Correctness risks to schedule:** B-5 poison-pill, F-2 unkeyed topic, B-6 partial self-heal, B-4 dead-view recency bug, F-5 dead default input topic, F-1 stale Javadoc.

---

## 6. Recommendations (ordered)

> **Implementation status (2026-09-01, same day):** Phases A, B and C below are IMPLEMENTED and validated against the live stack — A1 gate statuses + A2 keyset paging on `/kpis` (verified via gateway-header calls), A3 poison-pill guard (verified by injecting malformed messages; skipped loudly, lag 0), B4–B8 UI (Window Inspector feature grid + gate chips + declined + load-older + cross-kind comparison; Explorer window selector/`window_kind`/"Trend range"; Performance contract-driven toggle + Inspector link; honest sliding labels — lint/tsc clean, deployed), C9 all three CPLM sinks keyed by loop_id (verified: live messages now keyed), plus F-1 Javadoc, F-5 dead default topic, B-4 `_latest` view ordering (live views confirmed fixed). Open by choice: B-3 IoTDB KPI series (read-or-remove is a product decision), fusion ladder documented as dead code rather than extended.

### Phase A — backend exposure (unblocks all UI work)
1. **Project short-window gate statuses through `/kpis`** — add `gate0_status..gate4_status`, `gate2r_status`, `sufficient_data` from `payload` to the SELECT (JSONB extraction; no migration needed). Optionally add `?fields=` for the long tail of B-2 metrics.
2. **Add keyset paging to `/kpis`** (`before=window_end` cursor) so a full day of 1m windows is retrievable.
3. Fix **B-5** (skip + DLQ-log a message with no usable `window_end` instead of retrying forever) — small change, removes a stream-halting failure mode.

### Phase B — UI: make the windows first-class
4. **Window Inspector: render the feature values it already fetches** — a per-window grid (MAE, RMSE, IAE, good-error %, effort ratio, auto %, completeness + gate chips once Phase A lands), `sufficient_data=false` rows visibly declined, paging past 12 rows.
5. **Loop Explorer: add a window-kind selector** (driven by `useCpmResolutions`, not literals) on the Calculations tab, defaulting to 24h fused but letting the user drop to 1m…60m feature rows; render `window_kind` next to "N windows" in History; rename the 8-h trend envelope so it stops colliding with engine windows ("Trend range", not "Window").
6. **Performance: derive the toggle from `resolutions.fusion.firesOn`** and add one line of copy ("Verdicts fuse at 12h/24h · per-window features in the Window Inspector →" with a deep link).
7. **Label sliding honestly everywhere a kind is shown** — reuse `fmtWindowShape` (already correct) instead of the bare kind string; never sum/average across sliding kinds client-side.
8. **A small cross-window comparison view** (same loop, same metric, 1m vs 5m vs 15m vs 60m lanes) — this is the "calculator" story made visible; all data already served by `/kpis` per kind.

### Phase C — hygiene
9. Key the producer sink by `loop_id` (`attachKeyed`) — align with the PIPE-010 precedent.
10. Fix the Flink Javadoc (F-1), the dead default input topic (F-5), fusion's 10m/30m blindness (F-3, or document them as KPI-only), the dead `_latest` views (drop or fix ordering, B-4), and either read or stop writing the IoTDB KPI series (B-3).

---

*Method: three parallel code audits (Flink job, cplm-api backend, frontend) + live verification against the running stack (Kafka topic sampling, consumer-group lag, `traverse_cplm` row counts/freshness) on 2026-09-01.*
