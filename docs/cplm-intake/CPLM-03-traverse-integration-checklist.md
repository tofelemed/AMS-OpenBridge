# CPLM → Traverse Edge — Integration & Gap-Analysis Worksheet

**Doc 3 of 3.**
**Task for whoever holds the Traverse Edge codebase:** work through the tables below. For each row, inspect **the Traverse code** (not its documentation) and fill in *Traverse has?* / *Gap* / *Action*. The output is a build plan for adding CPLM to Traverse.

Read `CPLM-01-functional-spec.md` (what CPLM computes) and `CPLM-02-technical-contract.md` (what it needs) first.

---

## 0. How to use this document

Fill the last three columns of every table:

- **Has?** — `YES` (exists and usable as-is) · `PARTIAL` (exists, needs change) · `NO` (must be built)
- **Evidence** — file path + line, or service/container name. **A doc reference is not evidence.** If it only appears in a README or architecture note, mark it `NO`.
- **Action** — reuse / extend / build / decide

Two framing facts that shape every decision:

1. **CPLM's compute is a self-contained Flink jar.** Kafka in → Kafka out. No database, no HTTP, no dependency on its current host application. If Traverse runs a compatible Flink cluster, the engine can be dropped in essentially unchanged.
2. **The gate math is frozen.** Thresholds, fusion rules and diagnosis bands must transfer byte-identical, validated by the golden-loop test. Anything Traverse needs done differently should be solved by configuration or by an adapter layer — not by editing the engine.

---

## 1. Platform prerequisites

| # | Requirement | Detail | Has? | Evidence | Action |
|---|---|---|---|---|---|
| P1 | Apache Flink cluster | **1.18.x, Java 11** for a drop-in jar. Other minor versions need rebuild + golden-test rerun | | | |
| P2 | Flink state backend | RocksDB + incremental checkpoints recommended — long job buffers up to 24 h of samples per loop in keyed state | | | |
| P3 | Flink job supervision | Long-running jobs must be auto-restarted/resubmitted | | | |
| P4 | Kafka | Broker + ability to create the topics in §2 with specified partitions/cleanup | | | |
| P5 | Time-series store | IoTDB or equivalent with a write + range-query API | | | |
| P6 | PostgreSQL | For `cpm.*` config and `analytics.*` results schemas | | | |
| P7 | Live push plane | MQTT/Sparkplug (or equivalent) + snapshot-on-open cache | | | |
| P8 | Historical read service | Decimated trend / raw / summary queries over the historian | | | |
| P9 | Asset / UNS model | To host loops as assets and PV/SP/OP/VP/MODE as tags | | | |
| P10 | AuthN/AuthZ | CPLM's API is anonymous today and expects the platform to provide this | | | |
| P11 | Observability | Flink metrics, Kafka lag, checkpoint success — also needed by the UI's pipeline-health screen | | | |

**Sizing note for P2:** state ≈ `activeLoops × sampleRate × 24 h`. At 200 loops × 1 Hz that is ~17 M samples buffered.

---

## 2. Kafka topics

| # | Topic | Role | Config | Has? | Evidence | Action |
|---|---|---|---|---|---|---|
| K1 | `loop.samples.v1` | CPLM input | 16 partitions, key `loop_id`, delete 7 d | | | |
| K2 | `clpm.feature.short.v1` | G0–G4 results | 8 partitions | | | |
| K3 | `clpm.feature.long.v1` | G5–G11 results | 8 partitions | | | |
| K4 | `clpm.gate.results.v1` | fused diagnosis | 8 partitions, delete 30 d | | | |
| K5 | `cplm.replay.{id}` | as-of recompute input | dynamic, 1 partition, 2 h | | | |
| K6 | `live.metrics` | RBE feed to the live plane | compacted | | | |
| K7 | `context.parameter-set.v1` | broadcast threshold governance | compacted | | | |

**Decision K-A — does Traverse already carry process samples on a topic?** If yes, record its name and payload shape. CPLM's parser accepts several field aliases, so an adapter may be unnecessary; if the shapes differ materially, decide: adapt the parser (config), add a mapping job, or dual-produce.
**Decision K-B — naming convention.** If Traverse has a topic taxonomy, decide whether CPLM topics conform to it or keep their current names.

---

## 3. Data the engine requires per sample

| # | Field | Required? | Consequence if missing | Has? | Evidence | Action |
|---|---|---|---|---|---|---|
| D1 | `loop_id` | **yes** | sample dropped | | | |
| D2 | `event_ts_ms` | **yes** | sample dropped | | | |
| D3 | `pv`, `sp`, `op` | yes (default 0) | G3/G4 meaningless | | | |
| D4 | `mode` | strongly | G1 cannot exclude manual operation; `auto_pct` wrong | | | |
| D5 | `quality` | strongly | G0 cannot detect bad data | | | |
| D6 | `vp` (valve position) | optional | **G14 caps all confidence at 0.89 — no diagnosis can ever reach CONFIRMED** | | | |
| D7 | `loop_type` / class | optional | falls back to ISA letter inference from the tag, else UNKNOWN profile (geometry disabled) | | | |
| D8 | Sample rate ~1 Hz | — | long diagnostics need ≥ 32 samples/window; spectral resolution degrades | | | |

**Decision D-A:** does Traverse's tag model expose valve position as a distinct role? This single field materially changes achievable diagnosis confidence.

---

## 4. Compute layer

| # | Component | Has? | Evidence | Action |
|---|---|---|---|---|
| C1 | Short-feature job (G0–G4, six window branches) | | | port jar |
| C2 | Long-diagnostics job (G5–G11, 4 h/12 h/24 h) | | | port jar |
| C3 | Fusion job (G12–G15, persistence state) | | | port jar |
| C4 | Historical replay job (bounded batch, as-of) | | | port jar |
| C5 | Live RBE job (→ `live.metrics`) | | | port jar; may be redundant if Traverse already has an RBE path |
| C6 | Dynamics-profile pack (YAML) on the classpath | | | port config |
| C7 | Broadcast parameter-set hydration | | | optional |
| C8 | Golden-loop regression test | | | **run first after porting** |

**Decision C-A:** does Traverse already run a report-by-exception job feeding its live plane? If so, extend it with loop metrics instead of adding C5.
**Decision C-B:** where do the hardcoded constants (§4 of doc 2) need to become configurable for Traverse's plants?

---

## 5. Storage

| # | Item | Has? | Evidence | Action |
|---|---|---|---|---|
| S1 | `cpm.loop_registry` + tag map + config versions + threshold profiles + groups + audit | | | |
| S2 | `analytics.clpm_short_feature_results` | | | |
| S3 | `analytics.clpm_long_feature_results` | | | |
| S4 | `analytics.cplm_gate_results` (+ `_latest` views) | | | |
| S5 | Consumer writing gate/feature results → Postgres | | | |
| S6 | Consumer writing raw samples → historian | | | |
| S7 | Consumer writing derived KPI series → historian | | | |
| S8 | Historian TTL/retention policy | | | **absent in CPLM today — define during the port** |
| S9 | Explicit historian schema + consistent numeric types | | | **inconsistent in CPLM today — fix during the port** |

**Decision S-A — the biggest integration decision: loop identity.**
CPLM models a loop as an asset node with `template_id = 'tpl-pidloop'`, whose PV/SP/OP/MODE/VP are asset tags, and whose peer relationships are asset edges. Traverse has its own asset/UNS model. Choose one:

- **(a) Map onto Traverse's asset model** — loops become Traverse assets, tags become Traverse tags/bindings, `cpm.loop_registry` keeps only CPLM-specific config and references Traverse asset IDs. *Best long-term; more upfront work; requires the peer-relationship concept to exist or be added for G13.*
- **(b) Keep `cpm.*` self-contained** — CPLM owns its registry, linked to Traverse assets by ID only. *Faster; risks a second source of truth for loop identity.*

Record the choice and its consequences for G13 (peer links) and for the onboarding UI.

---

## 6. Delivery — the two routes

### Live route

| # | Capability | Has? | Evidence | Action |
|---|---|---|---|---|
| L1 | MQTT/Sparkplug broker | | | |
| L2 | Kafka → live-plane bridge (birth/alias/data) | | | |
| L3 | Snapshot cache for paint-on-open (Sparkplug is QoS 0 / no-retain) | | | |
| L4 | Snapshot read endpoint | | | |
| L5 | Path+role → live address resolution, so the UI never hardcodes topics | | | |
| L6 | Quality/mode carried on live values and on reopen | | | |
| L7 | Loop KPI badges (confidence, diagnosis, OCE) on the live feed | | | extend whatever L2 exists |

### Historical route

| # | Capability | Has? | Evidence | Action |
|---|---|---|---|---|
| H1 | Decimated trend query (`series`, `start`, `end`, target width) | | | |
| H2 | Raw paginated query (for evidence replay / sample manifests) | | | |
| H3 | Summary aggregates (min/max/avg/count) | | | |
| H4 | Series discovery | | | |
| H5 | Multi-series time-aligned reads (PV+SP+OP+VP together) | | | |
| H6 | Persisted window results queryable by `(loop, resolution, windowEnd)` | | | |
| H7 | As-of recompute that resolves the profile/calculation version effective at that time **without perturbing the live pipeline** | | | |

---

## 7. API surface

| # | Capability | Status in CPLM | Has? | Evidence | Action |
|---|---|---|---|---|---|
| A1 | Loop list / registry CRUD | exists | | | |
| A2 | Loop onboarding (activate, tag map, tag catalog, config versions, threshold profile) | exists | | | |
| A3 | Gate matrix + metrics for a window (`cplm-gates`) | exists | | | |
| A4 | KPI stream by resolution | exists | | | |
| A5 | Signal trend (PV/SP/OP, downsampled) | exists | | | |
| A6 | Loop readiness checklist | exists | | | |
| A7 | Pipeline status (required jobs running) | exists | | | |
| A8 | Recompute-gates + replay polling | exists | | | |
| A9 | CSV telemetry ingest | exists | | | |
| A10 | Flink jobs / checkpoints / backpressure | exists | | | |
| A11 | **Fleet summary + rankings + heatmap + fleet gate matrix** | **missing** | | | build |
| A12 | **Event frames** (gate transitions → events with severity, ack, shelve) | **missing** | | | build |
| A13 | **Per-window metadata** (Result ID, expected vs actual samples, late/out-of-order) | **missing** | | | build (needs an additive payload bump) |
| A14 | **Calculations catalogue** (~143 metrics: definition, window, formula, threshold, version) | **missing** | | | build |
| A15 | **Audit read + approval workflow** | partial | | | build |
| A16 | Live binding lookup (`role=live` → address + snapshot key) | missing | | | build |

**Decision A-A:** does Traverse already expose an alarm/event service that A12's event frames should feed into, rather than CPLM inventing a parallel event store?

---

## 8. UI requirements

The frontend is a separate project with twelve screens (see doc 1 §6). It is currently a **prototype driven entirely by mock data** — no network calls, no typed contracts, single route. It needs: real routing, a typed contract layer, an API client, a live subscription client, and ISO-8601/epoch timestamps (the mock uses pre-formatted display strings).

| # | Screen | Primary needs | Has? | Evidence | Action |
|---|---|---|---|---|---|
| U1 | Overview | fleet summary (A11), live runtime stats, rankings | | | |
| U2 | Explorer | loop tree, live faceplate (L1–L6), trend (H1) | | | |
| U3 | Performance | heatmap + fleet gate matrix (A11) | | | |
| U4 | Events | event frames + ack/shelve (A12) | | | |
| U5 | Investigation | gate evidence (A3), replay (A8), decision trace | | | |
| U6 | Historical explorer | trends + KPI overlay + diagnosis bands (H1, H6) | | | |
| U7 | Window inspector | window metadata (A13) | | | |
| U8 | Evidence replay | raw samples (H2) + gate definitions (A14) | | | |
| U9 | Calculations | catalogue (A14) | | | |
| U10 | Loop registry | A1, A2 + bulk import | | | |
| U11 | Pipeline health | A7, A10, P11 | | | |
| U12 | Governance | A15 | | | |

---

## 9. Questions to answer before planning the build

1. **Flink version and Java runtime** on Traverse — does the CPLM jar drop in, or is a rebuild needed?
2. **Existing process-sample stream** — name, payload shape, rate, and whether quality/mode/VP are present.
3. **Asset model** — decision S-A (a) or (b), and whether peer/upstream relationships exist for G13.
4. **Live plane** — what exactly runs today (broker, bridge, snapshot cache), and can loop metrics be added to it rather than duplicated?
5. **Historian API** — which of H1–H5 already exist; is decimation server-side?
6. **Event/alarm service** — should CPLM event frames feed it (A-A)?
7. **Shared vs dedicated platform** — is Traverse production/multi-tenant? This governs how carefully topics, jobs and schemas are staged, and whether CPLM gets its own namespace.
8. **Ingestion** — does Traverse already bridge OPC-UA/DCS to Kafka? CPLM has no production edge adapter.
9. **Naming/schema conventions** — do CPLM's topic names, `snake_case` payloads and the `clpm_`/`cplm_` table-spelling inconsistency get normalised on the way in? (Normalise deliberately, with a version bump — not accidentally.)
10. **Multi-plant scope** — one Traverse instance serving several sites changes the loop-identity and profile-governance model.

---

## 10. Suggested output of the mapping exercise

1. A filled version of tables §1–§8.
2. A **reuse list** — Traverse capabilities CPLM adopts unchanged (ideally: Kafka, Flink, historian, live plane, asset model, auth, observability).
3. A **build list** — the genuine gaps, most likely: CPLM Flink jobs deployed, `cpm.*` + `analytics.*` schemas, result→store consumers, the CPA API module (A1–A16 minus whatever Traverse covers), and the frontend wiring.
4. A **decision record** for S-A, K-A, C-A and A-A.
5. A phased plan whose **first milestone is the golden-loop test passing on Traverse** — that single result proves the engine survived the move before any UI work starts.
