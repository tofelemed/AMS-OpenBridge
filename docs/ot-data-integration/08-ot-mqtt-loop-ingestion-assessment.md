# OT MQTT Loop Ingestion — Assessment (Yokogawa/HDPE gateway → CPM pipeline)

**Date:** 2026-08-31.
**Input evidence:** the OT MQTT broker screenshots (topic tree + payloads + counts), the OT integration prompt, and the code in this repo. Every claim below about the platform is verified against a file in this repo; every claim about the OT side is verified against the screenshots or explicitly flagged as an open question.
**Companions:** [01](01-ot-data-requirements.md) (target Kafka contracts), [03](03-mqtt-ingestion-enrichment-service.md) (ingestion service design), [06](06-mqtt-topic-payload-contracts.md) (gateway publishing contracts), [07](07-pre-ingestion-configuration-and-uns-bootstrap.md) (what must be configured first), [09](09-ot-mqtt-loop-mapping.md) (field-by-field mapping), and the implementation plan at `docs/superpowers/plans/2026-08-31-ot-mqtt-loop-ingestion.md`.

---

## 1. What the screenshots show (the real gateway contract)

### 1.1 Topic hierarchy — 7 levels

```
OT / HDPE / FCS0101 / Flow / FIC10302 / PIDParams / PV
 │     │       │        │       │          │        └─ parameter (8 leaves per loop)
 │     │       │        │       │          └─ parameter group (screenshots show "PIDParams", one word —
 │     │       │        │       │             NOT "PIDR params"; treat the exact string as config)
 │     │       │        │       └─ loop tag (= the plant tag, e.g. FIC10302, FIC10303A, FIC10303B)
 │     │       │        └─ process class: Flow | Pressure | Temperature | Level
 │     │       └─ FCS station: FCS0101..FCS0104 (Yokogawa field control station, NOT a plant area)
 │     └─ site: HDPE
 └─ namespace root
```

### 1.2 Parameters — 8 leaves per loop, observed values (FIC10302)

| Leaf | value | unit | Reading |
|---|---|---|---|
| `PV` | -0.2363… | "" | process value |
| `SP` | 63.0 | "" | setpoint |
| `OP` | 33.948… | "%" | controller output |
| `MODE` | 4.0 | "" | **numeric** controller mode — enum meaning unconfirmed |
| `P` | 300.0 | "%" | consistent with Yokogawa proportional band (%) — semantics to confirm |
| `I` | 240.0 | "s" | consistent with integral time (s) — to confirm |
| `D` | 0.0 | "s" | consistent with derivative time (s) — to confirm |
| `GW` | 0.0 | "%" | **unresolved** — plausibly Yokogawa "gap width" (GAP control dead band, %); DO NOT assume until the OT team confirms |

### 1.3 Payload shape (identical envelope on every leaf)

```json
{ "value": 0.0, "unit": "s", "quality": "GOOD", "ts": "2026-08-30T20:44:43.456Z",
  "source": "opc_ua", "seq": 0,
  "device": "FIC10302", "area": "FCS0101", "line": "Flow", "enterprise": "",
  "site": "HDPE", "process_unit": "Flow", "equipment": "FIC10302", "item": "D" }
```

Redundancy on purpose: `device == equipment` (both the loop tag), `line == process_unit` (both the process class), `area` = the FCS. The topic and the payload therefore carry the **same identity twice** — which is exactly what enables mismatch detection (§5).

### 1.4 Counts — the 8-parameter model holds

Flow 184 / Pressure 256 / Temperature 80 / Level 64 topics on FCS0101 = 584 = 73 loops × 8. FCS0102 544 (68 loops), FCS0103 88 (11), FCS0104 72 (9). **All counts ≡ 0 mod 8 → 161 loops visible.** Message counts per loop differ (22k–39k, and a few at exactly 8 messages, i.e. one publish per leaf — likely fresh/idle loops), so cadence is per-loop, not global. All 8 leaves of a loop appear to publish at similar cadence (message counts per topic within a loop are near-equal): **the gateway is publishing tuning parameters cyclically too**, worth an OT-side RBE recommendation but not something this repo controls.

### 1.5 Not visible in the screenshots (must be verified live during Phase G)

Retained flags, QoS of the publisher, whether `seq` ever increments (both observed samples say `0` — treat as non-functional until proven otherwise), whether `ts` differs per leaf or is snapshot-stamped, broker auth for our subscriber.

---

## 2. Current implementation in this repo (verified)

### 2.1 What already exists

| Piece | State | Where |
|---|---|---|
| **ingestion-service (phase 1)** | ✅ built: data-source config CRUD, AES-256-GCM credential store, MQTT connection tester, profiles, admin UI, gateway route `/api/ingestion/*` | `src/services/ingestion-service/` — `Program.cs:88` reports `subscriber: NotBuilt` |
| **MQTT_LOOP_SAMPLES profile** | ✅ registered, destination `traverse.cpa.loop.samples.v1` | `Services/ProfileRegistry.cs:27-36` |
| **Loop Registry** | ✅ production: `cpm.loop_registry` (PK **`loop_id` = the plant tag itself**, `VARCHAR(64)`, case-insensitively unique) + `cpm.loop_tag_map` (per-role `uns_path`, `source_system`, `source_tag`) + signal-asset projection | `database/scripts/32_cpm_loop_registry.sql`, `src/services/cplm-api/Services/CpmLoopRegistryService.cs` |
| **Registry plant placement** | ✅ `site`/`area`/`unit` columns on `loop_registry` (NOT the FCS — the HDPE tree `hdpe/section_100..800/u<unit>` is already seeded) | `database/scripts/48_hdpe_plant_hierarchy.sql` |
| **Kafka loop-samples contract** | ✅ live: `traverse.cpa.loop.samples.v1`, 16 partitions, key = `loop_id`, merged-tuple JSON, 4 Flink jobs + `RawLoopIotDbConsumer` consume it | `src/flink/.../cplm/CplmNormalizedSample.java`, `src/backend/AMS.Api/BackgroundServices/RawLoopIotDbConsumer.cs` |
| **Loop onboarding** | ✅ UI wizard + bulk CSV + `scripts/import-cpm-loops.ps1` (the only path that sets `sourceTag`) | `src/frontend-ob/src/components/Cpm/`, `scripts/import-cpm-loops.ps1` |
| **Service-to-service auth** | ✅ `X-Service-Key`; cplm-api already grants internal callers `analytics.view` (enough for `GET /api/v1/cpm/loops`) | `infra/docker/docker-compose.yml:1350` |
| **Lab OT-broker stand-in** | ✅ `mosquitto-test` compose service (profile `mqtt-test`, host port 1884, user `ams_ingest`) | `infra/docker/docker-compose.yml:927-958` |

### 2.2 What does NOT exist (the gaps this project closes)

| # | Gap (proven) | Evidence |
|---|---|---|
| GAP-001 | **No MQTT→Kafka path at all.** EMQX is egress-only (Kafka→Sparkplug→browser); nothing in the repo subscribes to inbound OT MQTT | `infra/docker/emqx/acl.conf` denies all non-`spBv1.0/#`; repo-wide grep: zero MQTT consumers producing to Kafka |
| GAP-002 | **`traverse.cpa.loop.samples.v1` has no production producer** — only simulators/replay scripts | `docs/ot-data-integration/03:15`; producers are `ams-sims/sim_loop_samples.py`, `scripts/cplm-loop-pipeline-sim.py` |
| GAP-003 | No topic parser / payload validator for the observed `OT/HDPE/...` hierarchy — the string appears nowhere in the repo | repo-wide grep for `PIDParams`, `FIC10302`, `OT/HDPE` = zero hits |
| GAP-004 | No loop-registry resolver/cache in ingestion-service; no unknown-loop parking store | `Program.cs` has no cplm-api client; `traverse_ingestion` has only `data_source_configs` |
| GAP-005 | No per-loop joiner — and the CPM engine **requires merged tuples**; per-parameter records with missing `pv/sp/op` are silently filtered | `CplmNormalizedSample.java:66-69` |
| GAP-006 | No DLQ/quarantine for the loop plane (alarm plane has `traverse.alarm.raw-alarms-dlq`; loops have nothing) | `scripts/kafka-reset-lab-topics.ps1` topic list |
| GAP-007 | No numeric-MODE handling anywhere — the engine's mode vocabulary is string-based (`AUT`, `CAS`, `MAN`…); `4.0` counts as unknown and hurts window eligibility | `CplmNormalizedSample.java:132-149` |
| GAP-008 | No home for P/I/D/GW — `signal_role` CHECK allows only `PV,SP,OP,VP,MODE,STATUS,QUALITY,UPSTREAM,UTILITY`; tuning params are not modeled | `32_cpm_loop_registry.sql:70` |
| GAP-009 | `last_data_received` column + UI slot exist but nothing populates them | `DataSourcesConfig` list renders "—" |
| GAP-010 | No OT-shaped lab simulator (all sims publish Kafka directly, none publish OT MQTT) | `ams-sims/` survey |

---

## 3. Answers to the codebase questions (prompt §33)

1. **Exact MQTT topic pattern:** `OT/<site>/<FCS>/<class>/<loop>/PIDParams/<param>` per the screenshots; the exact `PIDParams` spelling is config, verified live in Phase G. Subscription filter: `OT/HDPE/+/+/+/PIDParams/+` (stored per data-source config, not hardcoded).
2. **Exactly 8 parameters per loop?** Yes in all visible counts (÷8 exactly). Runtime must NOT require it — unknown params are observable, missing ones only affect the roles they map to.
3. **`GW` meaning:** unresolved — flagged to the OT team (candidate: Yokogawa gap width, %). Ingested and preserved as an extension field either way; no semantics assigned.
4. **`P`/`I`/`D`:** units on the wire are `%`/`s`/`s` — consistent with Yokogawa proportional band / integral time / derivative time, but semantics are NOT assigned in code; they ride through as extension fields.
5. **`MODE` numeric:** yes, `4.0`. Meaning unconfirmed → per-config `mode_value_map` (e.g. `{"4":"AUT"}`) supplied once the OT team confirms the CENTUM enum; unmapped values pass through raw and are counted (visible, not silently wrong).
6. **`seq`:** `0` in every observed sample. Preserved in the DLQ envelope for traceability; NOT used for dedup/loss detection.
7. **QoS / 8. retained:** not visible; subscriber requests QoS 1 (config default); retained handling is idempotent by design (a retained replay just refreshes joiner state). Verified live in Phase G.
9. **Loop storage:** `cpm.loop_registry` + `cpm.loop_tag_map` + `cpm.loop_signal_asset` in `traverse_cplm` (Postgres). No duplicate registry will be created.
10. **Canonical loop PK:** `loop_id` **= the plant tag string itself** (`FIC10302`), case-insensitively unique, historian-collision-guarded. The OT topic's loop level therefore IS the registry key — resolution is a direct (case-insensitive) lookup, with `loop_tag_map.source_tag` as the alias fallback for loops whose registry id differs from the OT tag.
11. **`FCS0101` modeling:** it is the **control station**, not a plant location. The registry's `site/area/unit` are plant-tree segments (`hdpe`, `section_100`, `u1001_…`). The FCS is source identity only — validated against `payload.area`, carried as `source_fcs` in the enriched event, not stored in the registry (roadmap: an optional `engineering` field if ops want per-FCS views).
12. **`Flow/Pressure/Temperature/Level`:** loop categories, NOT process units. They correlate with `loop_type` (Flow→FIC, Pressure→PIC/PIC_GAS/PIC_VAPOUR, Temperature→TIC, Level→LIC) — used as a warning-level consistency check only.
13. **Payload duplication:** the gateway flattens the same identity into topic + UNS-ish payload fields. We use it for mismatch detection (§5) — never for placement.
14. **Registry-authoritative metadata:** plant placement (`site/area/unit`), `loop_type`, display name, `asset_id`, engineering (opMin/opMax), canonical casing of `loop_id`. OT-authoritative: value, unit, quality, source timestamp, mode raw value.
15. **Source-binding table:** yes — `cpm.loop_tag_map(source_system, source_tag)` per role, plus `assets.alias_mapping` for the telemetry plane. Reused, not duplicated.
16. **Kafka topic:** `traverse.cpa.loop.samples.v1` (16 partitions, 7 d, lz4). 17. **Partition key:** `loop_id` (plain UTF-8 string) — mandatory, Flink `keyBy(loopId)`.
18. **Schema Registry:** not deployed; plain JSON everywhere (the `Confluent.SchemaRegistry` reference in AMS.Infrastructure is documented dead code). No Avro will be introduced.
19. **Flink expectation:** merged tuple per loop per grid tick; `event_ts_ms` event time; 2 min out-of-orderness watermark; pv/sp/op required numerics; mode vocabulary. **The prompt's "publish atomic parameter events, let Flink join" preference is overridden by the platform's existing, verified contract** — the joiner lives in ingestion (this is the prompt's own escape hatch: "if the current application already creates synchronized loop snapshots, inspect why" — it does, by deliberate design validated on real Honeywell data; see doc 01 §4.2).
20. **IoTDB path:** `root.site1.cpm.<SafeNode(loop_id)>` device with `pv,sp,op,vp,mode` measurements, written by `RawLoopIotDbConsumer` from the same topic.
21. **DLQ:** none for loops today → new `traverse.ingestion.ot-dlq` (name ends in `-dlq` so the existing Prometheus alert `DlqReceivingMessages` and `scripts/replay-kafka-dlq.ps1` pick it up automatically).
22. **Loop onboarding:** `/cpm/registry` UI wizard, bulk CSV import dialog, or `scripts/import-cpm-loops.ps1` → `POST /api/v1/cpm/loops/activate|bulk-activate` (upsert).
23. **Dynamic registry updates:** yes — activate is an upsert; the ingestion registry cache refreshes on an interval (default 60 s) + on-demand, so a newly registered loop starts flowing without redeploy.
24. **EU/ranges in metadata:** `assets.assets.engineering_unit/lo_eng_limit/hi_eng_limit` + `loop_registry.engineering{opMin,opMax}` — available, used for unit-mismatch warnings only in v1.
25. **Source timestamp for event time:** ~~the tuple's `event_ts_ms` is the **grid tick**~~ — **superseded 2026-09-02**: `event_ts_ms` is the newest member's **OT source timestamp**. Process time is the record in an industrial system; stamping ingestion time made the historian and the DCS trend disagree. Watermark discipline is no longer automatic — see doc 10 §4 for the backlog consequence; member source timestamps drive freshness/staleness. Late OT data cannot poison the stream — it only makes members stale (→ `quality: BAD` ticks). Historical backfill stays on the IoTDB+recompute door (doc 03 §6).

---

## 4. Target architecture (decided)

Extend `src/services/ingestion-service` with the phase-2 subscriber pipeline — the design docs scoped this service for exactly this job, and the decrypted broker credentials already live there.

```
OT broker (lab: mosquitto-test)                     ingestion-service (extended)
OT/HDPE/FCS0101/Flow/FIC10302/PIDParams/PV   ┌──────────────────────────────────────────┐
        │                                    │ OtIngestionHostService (BackgroundService)│
        └── MQTTnet managed client ─────────▶│  one subscriber per active               │
            client id ingestion-<config_id>  │  MQTT_LOOP_SAMPLES data-source config    │
            QoS 1, persistent session        │                                          │
                                             │ 1 OtTopicParser   (template-driven)      │
                                             │ 2 OtLoopPayload   (JSON + ts validation) │
                                             │ 3 Consistency     (topic vs payload)     │
                                             │ 4 LoopRegistryCache (cplm-api, cached,   │
                                             │     case-insensitive, 60 s refresh)      │
                                             │ 5 LoopParameterMapper (roles + mode map) │
                                             │ 6 LoopJoiner (per-loop LKV, 5 s grid,    │
                                             │     forward-fill, stale ⇒ quality BAD)   │
                                             └───────┬──────────────────┬───────────────┘
                              valid tuples           │                  │ invalid / unknown
                              key = loop_id          ▼                  ▼
                              acks=all, idempotent  Kafka        traverse.ingestion.ot-dlq
                              lz4                   traverse.cpa.       + ingestion.unknown_sources
                                                    loop.samples.v1      inventory (reviewable)
                                                     │
                            ┌────────────────────────┼─────────────────────────┐
                            ▼                        ▼                         ▼
                    Flink CPLM trio          RawLoopIotDbConsumer        LoopLiveRbeJob
                    (short/long/fusion)      → root.site1.cpm.<loop>     → live loop badges
```

Key decisions (each traceable to evidence above):

1. **Join in ingestion, not Flink** — the platform contract is the merged tuple (§3 Q19).
2. **Resolution = registry `loop_id` direct lookup** (case-insensitive), because loop ids ARE plant tags; `loop_tag_map.source_tag` is the alias fallback. Emit with the **registry's exact casing** (the engine keys by exact string).
3. **Enrichment from the registry row**: `loop_type`, `site`, `area`, `unit`, `asset_uuid` — the plant placement the user asked for; `source_fcs`/`source` context preserved for traceability. Extra JSON fields are ignored by every existing consumer (verified: both deserializers read named fields only) — confirmed again in E2E.
4. **P/I/D/GW ride the tuple as extension fields** (`p`, `i`, `d`, `gw`, forward-filled). Zero downstream change today; retained on the topic (7 d) for future tuning-change analytics; optional roadmap task extends `RawLoopIotDbConsumer`'s measurement list to historize them.
5. **MODE**: per-config `mode_value_map` translates the numeric enum into the engine vocabulary; unmapped → raw string + counter (visible degradation, no silent guessing).
6. **Quality:** tuple quality = worst-of the OT quality tags on pv/sp/op — **simplified 2026-09-02**: the `stale_after_seconds` ageing rule is removed. Only the source can call a value bad; a setpoint untouched for an hour is unchanged, not untrustworthy, and ageing it out flagged healthy loops BAD. A gateway that stops publishing entirely emits nothing at all (the no-advance skip), so silence is still not mistaken for good data. Never emit before pv+sp+op have each been seen once.
7. **Unknowns park, never auto-create**: unknown loop → `LOOP_NOT_REGISTERED`, unknown param → `UNKNOWN_PARAMETER`; both go to the DLQ topic and the aggregated `ingestion.unknown_sources` inventory (rate-limited logs, Prometheus counters). Registering the loop makes it flow on the next cache refresh — no restart.
8. **Delivery:** MQTT QoS 1 + persistent session (broker queues during our downtime); Kafka `acks=all` + idempotent producer + lz4; end-to-end **at-least-once** (duplicates are harmless downstream: IoTDB upserts by timestamp, windows tolerate dupes). No exactly-once claim.
9. **Config over code:** topic template, subscription filters, QoS, param→role map, mode map, grid, staleness, skew tolerances, refresh interval — all per data-source config (`profile_config.loop_ingest`) or env. No loop names in code, ever.

## 5. Validation & authority rules

Authority: **1. Loop Registry** (canonical identity + placement) → **2. MQTT topic** (routing identity) → **3. payload fields** (cross-check + measurement).

Per message: `topic.site == payload.site`, `topic.fcs == payload.area`, `topic.loop == payload.device == payload.equipment`, `topic.param == payload.item` (all case-insensitive) — any identity mismatch ⇒ DLQ `LOOP_IDENTITY_MISMATCH`/`PARAMETER_MISMATCH` (never silently prefer one side). `topic.class` vs `payload.line/process_unit` and vs registry `loop_type` ⇒ warning counters only (semantics equivalence unproven). Timestamps: ISO-8601 parse-or-DLQ (`BAD_TIMESTAMP`); future beyond skew tolerance ⇒ DLQ (`FUTURE_TIMESTAMP`); stale values are legal inputs — staleness is the joiner's business. Units: source `unit` preserved; mismatch vs registry EU ⇒ `UNIT_MISMATCH` warning counter (v1: warn, don't reject).

## 6. Risks & open questions (owner: OT/gateway team unless noted)

1. **MODE enum** — need the CENTUM numeric→mode table (blocks correct AUTO/MANUAL classification; until then tuples flow but window eligibility suffers, visibly).
2. **GW semantics** — blocked on vendor confirmation; carried opaque meanwhile.
3. **QoS/retained/session behavior of the gateway broker** + credentials for our subscriber; whether the broker is reachable from the compose network (ops).
4. **`ts` provenance** — OPC source time vs gateway receive time (degrades nothing structurally; affects staleness precision).
5. **Registry pre-load** — the 161 loops must be registered (worksheet → `import-cpm-loops.ps1`) before their data flows; unregistered loops park by design. The parking inventory doubles as the discovery list.
6. **Publish cadence of tuning params** — cyclic publishing of P/I/D/GW is wasteful at scale; recommend RBE on the gateway (outside this repo's scope).
7. (internal) **Two-member consumer trap** — the new subscriber must never run twice against the same broker/config (stable client id makes the broker evict the twin — detectable); Kafka side is a producer, so no group-split risk.
