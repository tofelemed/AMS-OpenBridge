# CPLM — Technical Contract & Component Inventory

**Doc 2 of 3** · Everything CPLM needs from a host platform, stated concretely.
**Audience:** engineers mapping CPLM onto Traverse Edge AMS.
**Status:** code-verified inventory of a working implementation. Field lists, job arguments, table names and route signatures are transcribed from source.

Read with `CPLM-01-functional-spec.md` (what it computes) and `CPLM-03-traverse-integration-checklist.md` (the mapping worksheet).

---

## 1. Runtime dependencies

| Need | Current implementation | Notes for the port |
|---|---|---|
| Stream transport | Apache Kafka | Any recent broker. Topic list in §2 |
| Stream compute | **Apache Flink 1.18.1, Java 11** | The CPLM jar is built against these. A different Flink minor version needs a rebuild + retest |
| Time-series store | Apache IoTDB (REST v1) | Raw samples + derived KPI series. Any historian with an equivalent write/query API can substitute, but the writer and reader both need porting |
| Relational store | PostgreSQL | Loop registry, tag map, config versions, window results |
| Live push | *(not present in CPLM today)* | CPLM emits results to Kafka; the live plane is expected from the host platform (Sparkplug/MQTT or equivalent) |
| Historical read | *(thin, in-API today)* | Decimated trend queries; expected from the host platform's historian service |

**Key portability fact:** the CPLM compute is a **single self-contained Maven module** producing one shaded jar. Its only contract with the outside world is *Kafka in → Kafka out*. It has no dependency on the current .NET API, no database connection, and no HTTP surface. Dropping the jar on any compatible Flink cluster and pointing it at topics is sufficient to run the engine.

---

## 2. Kafka topics

### Input

| Topic | Key | Partitions | Cleanup | Producer |
|---|---|---|---|---|
| `loop.samples.v1` | `loop_id` | 16 | delete, 7 d | Edge adapter / OPC bridge / CSV replay / simulator |

**Canonical sample payload:**

```json
{
  "loop_id": "FIC10409",
  "event_ts_ms": 1754300000000,
  "pv": 42.1, "sp": 42.0, "op": 37.6,
  "vp": 37.2,
  "mode": "AUTO",
  "quality": "GOOD",
  "isValid": true,
  "loop_type": "FIC",
  "asset_uuid": "…",
  "dynamic_class": "FAST_SELF_REG"
}
```

Rules: `loop_id` and `event_ts_ms` required. `vp` null ⇒ G14 caps confidence at 0.89 and raises `NO_VP`. Quality is good when null or case-insensitively `"GOOD"`. AUTO detection is `mode.toUpperCase().contains("AUTO")`. The parser also accepts legacy aliases (`tagId`/`timestamp`, `is_good_quality`, camelCase variants), so an existing platform feed can often be adapted without changing producers.

### Output

| Topic | Partitions | Cleanup | Emitted by | Contains |
|---|---|---|---|---|
| `clpm.feature.short.v1` | 8 | delete, 7 d | short-feature job | G0–G4 + G2r per short window |
| `clpm.feature.long.v1` | 8 | delete, 7 d | long-diagnostics job | G5–G11 per long window, embedding the aligned short features |
| `clpm.gate.results.v1` | 8 | delete, 30 d | fusion job | Full G0–G15 result + diagnosis |
| `cplm.replay.{replayId}` | 1 | delete, 2 h | API (dynamic) | Bounded replay input for as-of recompute |

### Optional / governance

| Topic | Cleanup | Purpose |
|---|---|---|
| `context.parameter-set.v1` | compact | Broadcast dynamics-profile overrides into running jobs (re-govern thresholds without redeploy) |
| `live.metrics` | compact | Report-by-exception PV/SP/OP/VP/MODE/quality + KPI deltas, for the live plane bridge |

---

## 3. Result payload schemas

All results are JSON, `schemaVersion: 1`, keyed by `loop_id`. Field names are **snake_case except the window bounds**, which are `windowStartMs` / `windowEndMs` — a real inconsistency in the current implementation; preserve it or migrate deliberately with a version bump.

### `clpm.feature.short.v1` — `eventType: CPLM_SHORT_FEATURE`

Identity/window: `loop_id`, `asset_uuid`, `window_kind` (`1m|5m|10m|15m|30m|60m`), `windowStartMs`, `windowEndMs`, `sample_period_sec`, `expected_sample_count`, `sample_count`, `sufficient_data`

G0: `completeness`, `bad_quality_pct`, `duplicate_timestamps`, `sampling_jitter`, `gap_count`, `max_gap_s`, `gate0_status`
G1: `auto_pct`, `manual_pct`, `mode_changes_per_h`, `gate1_status`
G2: `sp_min`, `sp_max`, `sp_range`, `sp_changes_per_h`, `gate2_status`
G2r: `gate2r_status`, `region_out_of_band_pct`, `operating_region_valid`
G3: `mae`, `rmse`, `iae`, `ise`, `itae`, `good_error_pct`, `oce`, `pv_std`, `op_std`, `freeze_index_s`, `gate3_status`
G4: `effort_ratio`, `op_travel`, `travel_per_day`, `reversal_count`, `reversals_per_hour`, `saturation_pct`, `gate4_status`
Versioning: `calculationVersion`, `dynamicsProfileVersion`, `dynamics_class`, `gate_profile_id`, `loop_type`

### `clpm.feature.long.v1` — `eventType: CPLM_LONG_DIAGNOSTIC`

Identity/window: `loop_id`, `asset_uuid`, `window_kind` (`4h|12h|24h`), window bounds, `sample_count`, `sample_period_sec`, `vp_available`

G5: `acf_period_s`, `acf_regularity`, `acf_gamma0`, `acf_zero_crossing_count`, `acf_period_candidate_count`, `gate5_status`
G6: `fft_peak_bin`, `fft_max_bin`, `fft_peak_amplitude`, `fft_peak_freq_hz`, `fft_peak_period_s`, `fft_peak_ratio`, `fft_peak_to_median`, `fft_total_energy`, `h2_amp`, `h3_amp`, `h5_amp`, `harmonic_amplitude_ratio`, `harmonic_energy_ratio`, `spectral_entropy_bin_count`, `spectral_entropy`, `gate6_status`
G7: `triangularity`, `cycle_samples`, `cycle_source`, `completed_cycles`, `valid_cycles`, `first_cycle_sse_sine`, `first_cycle_sse_triangle`, `gate7_status`
G8: `horch_oddness`, `horch_odd_sum`, `horch_even_sum`, `gate8_status`
G9: `phase_area_norm_per_cycle`, `phase_bbox_area`, `phase_path_area`, `window_area_norm`, `corner_score`, `corner_score_raw`, `corner_score_qualified`, `valid_turning_angles`, `gate9_status`, `gate9_reason`, `period_status`, `validated_period_s`, `period_reject_reason`
G10: `gate10_valve_output` (+ legacy alias `gate10_status`), saturation stats, `op_range_pct`, `effort_ratio`
G11: freeze/quantization/drift/spike fields, `gate11_status`
Plus `observability_flags[]` and a nested **`short_features`** object carrying the aligned short-window payload.

### `clpm.gate.results.v1` — the fused result

Superset of the above, plus:

- `tagId` (mirror of `loop_id`), `profile_source`, `gate_profile_id`, `dynamic_class`, `stiction_signal`
- G12–G14: `gate12_status`, `gate13_status`, `has_step_test_evidence`, `has_peer_links`, `vp_available`, `gate14_status`, `g14_confidence_cap`
- Detector scores: `oscillation_score`, `fft_score`, `effort_score`, `stiction_score`, `horch_score`, `geometry_score`, `raw_final_element_score`
- Family: `stiction_family_score`, `oscillation_family_score`, `effort_family_score`, `geometry_family_score` (+ `*_qualified` booleans), `selected_family`, `family_score`
- Verdict: `gate15_status`, `diagnosis`, `severity`, `confidence`, `recommendation`, `status_reason`, `insufficient_evidence_reason`, `family_disqualifiers[]`, `observability_flags[]`
- Persistence: `persistence_agree_count`, `persistence_windows_required`, `persistence_satisfied`
- A rolled-up `gates { G0 … G15 }` object for direct UI consumption
- Replay results additionally carry `replay_id`, `calculation_source = flink-historical-replay`, `replay_input_topic`

---

## 4. Flink jobs

One shaded jar, four streaming jobs plus a batch job. All take `--key value` arguments.

| Job class (suffix) | Role | Input | Output | Notes |
|---|---|---|---|---|
| `CplmShortFeatureStreamJob` | G0–G4 | `loop.samples.v1` | `clpm.feature.short.v1` | Six union'd window branches; `keyBy(loop_id)` |
| `CplmLongDiagnosticsStreamJob` | G5–G11 | `loop.samples.v1` | `clpm.feature.long.v1` | Keyed process fn + ListState buffer + 15-min event-time timers; emits 4 h/12 h/24 h |
| `CplmGateFusionStreamJob` | G12–G15 | short + long topics | `clpm.gate.results.v1` | Keyed co-process join; fires on 12 h/24 h; holds persistence state |
| `LoopLiveRbeJob` | live plane | `loop.samples.v1` (+ gate results) | `live.metrics` | Report-by-exception deltas; deadband on numerics, any-change on strings |
| `CplmHistoricalReplayJob` | as-of recompute | `--input-topic` (bounded) | `clpm.gate.results.v1` | BATCH mode, parallelism 1, zero out-of-orderness, replay-tagged output |

**Common arguments:** `--bootstrap.servers`, `--job-name`, `--consumer-group-id`, `--input-topic`, `--output-topic`, `--short-feature-topic`, `--long-feature-topic`, `--window-hours` (24), `--out-of-orderness-minutes` (2).
**Environment:** `KAFKA_BROKERS`; optional broadcast-profile vars for the parameter-set topic.

**Runtime expectations:** checkpointing enabled (short job uses 180 s, EXACTLY_ONCE); RocksDB with incremental checkpoints recommended for the long job, which holds up to ~24 h of samples per loop in keyed state. Sizing driver: `loops × sampleRate × 24 h` of buffered samples.

**Gate thresholds are not job arguments.** They come from embedded class defaults → a classpath YAML profile pack → optional broadcast parameter-sets.

**Values currently hardcoded** (lift to config if the host platform needs them tunable): good-error band `0.5` EU, Horch max lag `200`, phase-area STRONG threshold `0.30`, SP-change epsilon `1e-6`, ACF max lag cap `2000`, long-job timer `15 min`, buffer retention `24 h + 10 min`, `MIN_SAMPLES = 32`, the six fusion weights, and the confidence band edges.

**Job supervision:** the jobs are long-running and must be kept alive. Today a supervisor re-submits any missing job every 60 s, identifying jobs by display name. Any equivalent (operator, scheduler, platform job manager) is fine.

---

## 5. PostgreSQL schema

### Configuration — schema `cpm`

| Table | Purpose |
|---|---|
| `loop_registry` | `loop_id` PK, `asset_id`, `display_name`, `tags` JSONB `{pv,sp,op,mode,vp}`, `monitoring` JSONB `{enabled,kpiPipeline,cplmPipeline}`, `scope` JSONB (enterprise/plant/area/unit/equipment), `is_active`, plus `site/area/unit/loop_type/criticality/observability_flags/threshold_profile_id/engineering` |
| `loop_tag_map` | `(loop_id, signal_role, source_tag)` → source system, unit conversion, last value/time |
| `loop_tag_catalog` | discovered source tags for the onboarding picker |
| `loop_config_version` | versioned PID config: `pid_form`, `kc`, `ti_s`, `td_s`, rate limit, anti-windup, SP weight, filter time, `snapshot` JSONB, `effective_from/to` |
| `threshold_profile` | named threshold profiles |
| `loop_group`, `loop_group_member` | grouping |
| `audit_events` | config-change audit trail |

### Results — schema `analytics`

| Table | Fed from | Notes |
|---|---|---|
| `clpm_short_feature_results` | `clpm.feature.short.v1` | multi-resolution; has a "newest complete window" view guard |
| `clpm_long_feature_results` | `clpm.feature.long.v1` | |
| `cplm_gate_results` | `clpm.gate.results.v1` | full gate + diagnosis set |

Each has a `_latest` view. **Note the spelling inconsistency in the current implementation:** short/long tables use `clpm_`, the gate table uses `cplm_`. Normalise deliberately if you touch it.

### Asset linkage

Loops are asset nodes with `template_id = 'tpl-pidloop'`; their PV/SP/OP/MODE/VP tags live in an asset-tag registry joined via template tag definitions. Peer/upstream relationships are asset **edges** (`PEER_*`) — their presence is what makes gate G13 evaluable rather than `NOT_EVALUATED`.

**If the host platform already has an asset/UNS model, this is the main integration decision:** either map `cpm.loop_registry` onto it, or keep the registry self-contained and reference host asset IDs. See the checklist doc.

---

## 6. IoTDB layout

Written by consumers of the Kafka topics (not by Flink):

| Path | Contents |
|---|---|
| `root.<prefix>.<loopId>` | raw `PV`, `SP`, `OP`, `MODE` per sample |
| `root.<prefix>.cpm.<loopId>.short_<windowKind>` | G0–G4 series |
| `root.<prefix>.cpm.<loopId>.long_<windowKind>` | G5–G11 series |
| `root.<prefix>.cpm.<loopId>.gate_<windowKind>` | fused results incl. confidence |

Access is IoTDB REST v1 (`/rest/v1/query`, `/rest/v1/nonQuery`) with basic auth; writes are batched multi-row inserts. Idempotent on `(series, timestamp)`, so replays do not duplicate.

**Gaps in the current implementation to fix during the port:** no TTL/retention is configured anywhere, no explicit schema is declared (everything auto-creates on first insert), and numeric types are inconsistent across writers (FLOAT in one path, DOUBLE in another). A target UNS tree of `root.<site>.<unit>.<loop>.{pv,sp,op,vp,mode}` with `kpi.*` beneath it is recommended, with all numerics DOUBLE.

---

## 7. API surface

Three route families the UI depends on. Auth is currently anonymous — the host platform is expected to supply real authn/authz.

### Loop data — `/api/v1/loops`

| Route | Key params |
|---|---|
| `GET /` | `registryOnly`, `includeTestLoops`, `resolution` |
| `GET /kpi-stream` | `tagId`, `resolution`, `from`, `to`, `limit` — resolutions `Live,5m,10m,15m,30m,1h,12h,24h`; returns 503 `FLINK_JOB_NOT_RUNNING` when the pipeline is down, 400 `UNSUPPORTED_RESOLUTION` |
| `GET /cplm-gates` | `loopId`, `resolution`, `windowEnd`, `limit` → the gate matrix + all metrics for a window; also returns `availableWindowEnds[]`, `nearestWindowEnd`, `dataPending`, `source` (`flink` / `feature-rebuild` / `signal-computed`) |
| `GET /{loopId}/signal-trend` | `from`,`to` or `hours`; `maxPoints` (server-side downsample) |
| `GET /{loopId}/readiness` | per-loop blocker/warning checklist |
| `GET /pipeline-status` | which required Flink jobs are running |
| `POST /{loopId}/recompute-gates` | `{windowEnd, resolution}` → launches bounded replay |
| `GET /{loopId}/cplm-replays/{replayId}` | poll replay state |
| `POST /{loopId}/ingest-csv`, `…/ingest-csv-signals` | CSV telemetry upload (single combined file, or separate PV/OP/SP/MODE files) |

### Loop configuration — `/api/v1/cpm`

`GET|PUT|DELETE /loops[/{id}]` · `GET /loops/{id}/detail` · `POST /loops/activate` (onboarding payload: tags, observability flags, threshold profile, engineering ranges, PID config) · `POST /loops/{id}/tags` · `GET /tag-catalog` · `POST|GET /loops/{id}/config-versions` · `POST /loops/{id}/threshold-profile` · `POST /loop-groups[/{id}/members]`

### Platform/health

`GET /api/v1/flink/jobs` (+ state, checkpoints, backpressure) · `GET /api/v1/pipelines/flow-registry` · `GET /api/v1/health/pipeline[/topology]`

### Live push

A hub/stream carrying loop KPI updates as `{eventType, entityId, timestamp, payload}`. In the target architecture this is replaced by the platform's live plane (Sparkplug/MQTT + snapshot-on-open).

### Endpoints the UI needs that do **not** exist yet

Fleet summary; loop rankings; loops × time heatmap buckets; fleet-wide gate matrix; **event frames** (gate-status transitions → events with severity/ack/shelve lifecycle); per-window metadata (Result IDs, expected vs actual samples, late/out-of-order counts); the calculations catalogue (~143 metric definitions with formulas, windows, thresholds, versions); audit read; KPI series by field.

---

## 8. Ingestion

CPLM does not include a production edge adapter. Sources used today: CSV/Excel replay into Kafka at wall-clock or accelerated rate, a deterministic simulator, and an HTTP tag-snapshot poller. **A real OPC-UA/DCS bridge is expected from the host platform** — CPLM only requires that samples arrive on `loop.samples.v1` in the §2 shape, keyed by `loop_id`.

---

## 9. Verification assets

- A **golden reference loop** with a committed expected-output test — the regression gate proving the gate math is unchanged after any move or refactor. Run it first on the host platform; a green result is the strongest possible evidence the port preserved behaviour.
- Synthetic reference generators (e.g. triangular-OP stiction signature with a transport lag) for validating detectors without plant data.
- CLI validators that run the window certification and reference checks outside Flink.
- End-to-end scripts: replay a CSV → assert gate results land in Postgres/IoTDB.
