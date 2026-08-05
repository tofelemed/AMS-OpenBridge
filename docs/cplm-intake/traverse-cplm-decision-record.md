# CPLM → Traverse Edge — Decision Record

**Date:** 2026-08-04 · Companion to `traverse-cplm-gap-analysis.md` (all evidence lives there).
Each decision states the recommendation first, then the code facts that force it, then what it costs you.

---

## Summary

| ID | Decision | Recommendation |
|---|---|---|
| **S-A** | Loop identity | **Hybrid (b→a).** `cpm.loop_registry` owns loop identity and references Traverse `asset_id`; add `assets.asset_relationships` in the same phase so G13 has a path to evaluable. Do **not** try to model loops purely as Traverse assets today. |
| **K-A** | Sample stream | **Add `loop.samples.v1` as a new topic.** Do not reuse `live.metrics` (wrong shape, already double-booked) and do not revive `loop-raw-data` (no quality, no vp). Produce the canonical shape from day one. |
| **C-A** | Report-by-exception job | **Add CPLM's `LoopLiveRbeJob` writing to a new `live.loop.metrics`.** Traverse's `LiveStateJob` RBE is alarm-scoped and its `live.metrics` branch is dead code — extending it means fixing someone else's broken branch and changing a deployed contract. |
| **A-A** | Event frames | **Own them in `analytics.cplm_event_frames` and mirror selected high-confidence diagnoses into `raw-alarms` as advisory conditions.** Do not make the Traverse alarm store the system of record — it hard-deletes frames on clear, has no history writer, and drops severity ≥ 950. |
| **N-A** | Naming / schema | Keep CPLM's topic names. **Fix the `clpm_`/`cplm_` table split now**, before any data exists. Keep `windowStartMs`/`windowEndMs` as-is. |
| **M-A** | Multi-plant scope | Single-site for the port. Add `site` to `cpm.loop_registry` and partition the IoTDB tree by site now; defer real tenancy. |

---

## S-A — Loop identity *(the most important one)*

### Recommendation

**Option (b) with a mandatory, in-scope extension: CPLM keeps `cpm.loop_registry` as the loop system-of-record, referencing Traverse `assets.assets.id`; and you build `assets.asset_relationships` in Traverse during the same phase.**

Do not attempt option (a) — "loops become Traverse assets" — as stated. It is not a mapping exercise; it is building an asset model Traverse does not have.

### Why option (a) is not available today

Option (a) presumes Traverse's asset model can express a loop. Read against the code, it cannot express any of the four things a loop needs:

| Required | Traverse reality |
|---|---|
| A loop as a typed node | `assets.assets` has `asset_type ∈ {Site,Area,Unit,Device,Measurement}` ([Asset.cs:159-166](../../src/services/asset-model/Models/Asset.cs#L159-L166), CHECK constraint at [10_traverse_assets_schema.sql:25](../../database/scripts/10_traverse_assets_schema.sql#L25)). No loop type. `assets.template` is a **free-text string with no FK** into `templates.element_templates` ([Asset.cs:54](../../src/services/asset-model/Models/Asset.cs#L54)) — the two "template" concepts are entirely unlinked in code. |
| Tags with signal roles (pv/sp/op/vp/mode) | **There is no tag table.** A tag is an asset row with `asset_type=5`. There is **no role column and no role enum anywhere**. `role` in Traverse means a *transport* role on a binding request (`live\|history\|alarm\|all`, stringly-typed at [PathResolver.cs:35-38](../../src/services/binding-resolver/Services/PathResolver.cs#L35-L38)) or an *RBAC* role. Neither is a signal role. |
| A template declaring required tags | `TemplateParameter` is a **string-substitution variable** (`{{basePath}}`), not a tag contract ([Template.cs:95-131](../../src/services/template-service/Models/Template.cs#L95-L131)); instantiation is literal `String.Replace` on display JSON ([template-service/Program.cs:316-320](../../src/services/template-service/Program.cs#L316-L320)). Seeded templates are "Centrifugal Pump" and "Control Valve" — display symbols, not asset types. |
| Peer/upstream edges (G13) | **None.** Two tables in the assets DB; one nullable `parent_id`; **no navigation collections at all** on `Asset` — not even `Children` ([AssetDbContext.cs:10-11](../../src/services/asset-model/Data/AssetDbContext.cs#L10-L11)); no relate/link endpoint in the complete route surface ([asset-model/Program.cs:85-302](../../src/services/asset-model/Program.cs#L85-L302)). template-service *does* use `HasMany`, so the absence on Asset is deliberate. |

⚠ **Do not be seduced by `database/migrations/phase0/`.** It contains `attribute_instances`, `state_machine_definitions`, `template_id`, and PID `fic1002.pv/.sp/.op` seed rows at `002_traverse_assets_schema.sql:209-211` — almost exactly what CPLM wants. It is **not deployed**: compose mounts only `database/scripts` ([docker-compose.yml:52](../../infra/docker/docker-compose.yml#L52)), and `database/migrations/phase0/README.md:1-14` disowns it verbatim (*"⛔ SUPERSEDED — DO NOT USE … do not exist"*). Someone will find this file and propose reviving it. Reviving it means rewriting asset-model, binding-resolver and every seed script.

### Why not pure option (b) either

Pure (b) leaves G13 permanently `NOT_EVALUATED` / `NO_UPSTREAM_LINKS`, and — worse — silently disables the **disturbance soft-block**. Per the functional spec §3, the soft-block only fires *"if peer links exist"*. With no peer links, an oscillating loop with no actuator stress is never disqualified with `DISTURBANCE_CONTEXT`. You do not get a conservative failure; you get **stiction called on loops that are actually being disturbed from upstream**. That is a false-positive generator pointed straight at your credibility with control engineers.

So the peer-relationship capability is not optional polish. It is a correctness dependency.

### The recommended shape

```
assets.assets                 (Traverse, unchanged)  ── id UUID
      ▲                                                    │
      │ asset_id FK (nullable, soft)                        │
cpm.loop_registry ── loop_id PK, asset_id, site, loop_type, │
                     tags JSONB {pv,sp,op,vp,mode},         │
                     monitoring JSONB, threshold_profile_id │
                                                            │
assets.asset_relationships  (NEW, in Traverse)  ────────────┘
      from_asset_id, to_asset_id, rel_type, created_at
      rel_type ∈ { PEER, UPSTREAM_OF, DOWNSTREAM_OF, CASCADE_PRIMARY, CASCADE_SECONDARY }
```

- `cpm.loop_registry.tags` holds the five UNS paths, which resolve through the **existing** `binding-resolver` (`role=live` → MQTT topic + Redis snapshot key; `role=history` → IoTDB path). That is genuine reuse — A16 is the one API row Traverse already satisfies outright.
- `asset_relationships` lives in `traverse_assets` and is exposed by asset-model, because it is a general Traverse capability, not a CPLM one. Displays, alarm correlation and future analytics all want it.
- CPLM resolves peers by: `loop → asset_id → asset_relationships → asset_id → loop_id`. G13 becomes evaluable without CPLM owning the graph.

### Consequences

| | |
|---|---|
| **G13** | Evaluable once `asset_relationships` has rows. Until then, `NOT_EVALUATED` — which is CPLM's correct, documented behaviour, not a bug. |
| **Onboarding UI** | Two-step: pick/create the Traverse asset, then map the five signal roles. Traverse has **no asset write UI at all** today (zero POST/PUT/DELETE of assets anywhere in `src/frontend-ob`) and **no asset bulk import** — the only CSV import in the repo is for users ([bulkImportService.ts:1-3](../../src/services/auth-service/src/services/bulkImportService.ts#L1-L3)). Both must be built; budget for it. |
| **Two sources of truth** | Real but bounded: Traverse owns *where the signal lives*, CPLM owns *what the loop is*. The failure mode is orphaned `asset_id`s. Mitigate with a nightly reconcile job, not an FK across databases (they are separate Postgres databases — `traverse_assets` vs `ams` — so a real FK is impossible anyway). |
| **Silent-drift hazard** | binding-resolver **fabricates** bindings from the raw path string when asset-model 404s ([PathResolver.cs:74-78,143-183](../../src/services/binding-resolver/Services/PathResolver.cs#L74-L78)) — and produces a *different* device id (`crude1_pump101` vs `pump101`). A loop can therefore appear to resolve while pointing at nothing. **Set `Services__AssetModel` strictness or add a resolution-provenance field to the readiness checklist (A6).** |
| **`loop_type`** | Traverse tag names are `pump101.discharge_press`, not `FIC10409` — ISA first-letter inference will fail and every loop falls to the `UNKNOWN` profile (geometry prior **0.0**, geometry disabled). `loop_type` must be an explicit, mandatory field on `cpm.loop_registry`. |

---

## K-A — Reuse, adapt, or add a sample topic?

### Recommendation: **add `loop.samples.v1`, produce the canonical schema.**

### The three candidates, as they actually are

**`loop-raw-data` — right contract, no producer, wrong fields.** `RawLoopData` parses `{tagId, timestamp, pv, sp, op, mode}` ([RawLoopData.java:11-17](../../src/flink/src/main/java/com/ams/flink/RawLoopData.java#L11-L17)). `tagId`/`timestamp` are **exactly CPLM's documented legacy aliases**, so CPLM's parser reads this topic unchanged today. It is declared at 16 partitions ([kafka-reset-lab-topics.ps1:21](../../scripts/kafka-reset-lab-topics.ps1#L21)) and has **zero producers repo-wide**. Tempting — but it has **no `quality` and no `vp`**, which costs you G0's bad-data detection and caps every diagnosis at 0.89 forever. Adopting it means adopting a schema that is permanently one version behind.

**`live.metrics` — real cadence, wrong shape, already double-booked.** `{group, edge, device, metric, value, quality, ts, type, path}`, key `device`, **one scalar per message** ([process_value_sim.py:136-149](../../scripts/sim/process_value_sim.py#L136-L149)). Reconstructing a PV/SP/OP/VP/MODE tuple would mean a stateful join over five independent messages with no shared correlation key — that is a Flink job you'd have to write, test and operate, purely to undo a shape decision. And the topic already carries **two incompatible schemas**: the simulator's, plus `LiveStateJob`'s alarm-RBE payload ([LiveStateJob.java:210-216](../../src/flink/src/main/java/com/ams/flink/LiveStateJob.java#L210-L216)). Adding a third is not a plan.

**`raw.telemetry.site1` — an empty shell.** Created by script ([kafka-reset-lab-topics.ps1:38](../../scripts/kafka-reset-lab-topics.ps1#L38)); zero producers, zero consumers.

### What a new topic actually costs

Almost nothing, and the alternative costs more. `KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"` ([docker-compose.yml:299](../../infra/docker/docker-compose.yml#L299)) means the topic appears on first produce. The work is not the topic — **it is the producer, which does not exist under any option.** No component in Traverse emits PV/SP/OP as a tuple. You are building a producer regardless; build it against the schema you actually want.

### Two things you must fix while you are here

1. **Set the topic config explicitly.** The reset script's `Config` strings are decorative — they are never passed to `--create` and never `--alter`ed ([kafka-reset-lab-topics.ps1:98-101](../../scripts/kafka-reset-lab-topics.ps1#L98-L101)). Broker defaults win: **24 h retention** ([docker-compose.yml:302](../../infra/docker/docker-compose.yml#L302)) and 4 partitions. CPLM's long job buffers **24 h**; a 24 h topic retention gives you exactly zero recovery margin — a job restart that outlives the retention window loses the buffer with no replay. Set `retention.ms=604800000` (7 d) on `loop.samples.v1` and `2592000000` (30 d) on `clpm.gate.results.v1`, and *verify with `--describe`*, because the script will lie to you.
2. **Key by `loop_id`.** Traverse's existing habit is null keys (`current-alarm-state`, `live.alarms`, `loop-kpis-5m` all null-keyed — [OpcEventStreamJob.java:179-182](../../src/flink/src/main/java/com/ams/flink/OpcEventStreamJob.java#L179-L182)), which is why `current-alarm-state` is declared compact and cannot possibly compact. Do not inherit that.

### Where the samples come from

This is the honest part: **there is no source.** Traverse has no OPC-UA/DCS bridge (`src/services/opc-connector/` is one `.dockerignore`, not in compose; `raw-opc-events` is on the reset script's *delete* list). The real ingest is an HTTP poll of `http://192.168.1.51:8010/api/current-alarms` — **alarms only**. CPLM has no production edge adapter either. **Neither side brings one.** For Phase 1–2, use CPLM's CSV replay and the `SynTic001` generator; treat the edge adapter as a first-class, separately-scoped project.

---

## C-A — Does Traverse already run an RBE job to extend?

### Recommendation: **port CPLM's `LoopLiveRbeJob`, target a new topic `live.loop.metrics`. Do not extend `LiveStateJob`.**

`LiveStateJob` *is* a genuine report-by-exception implementation — keyed `ValueState` fingerprints, suppress-if-unchanged ([LiveStateJob.java:93-157](../../src/flink/src/main/java/com/ams/flink/LiveStateJob.java#L93-L157), `:167-220`). But:

- **It is alarm-scoped.** It reads `current-alarm-state` and fingerprints on `severity|state`. There is no process-value concept in it.
- **Its `live.metrics` branch is dead.** It emits `{alarmId, severity, state, priority, conditionActive, rbeTs}` (`:210-216`); the only consumer requires `device`+`metric` and `LOG.warn`-drops everything else ([AlarmMetricPublisher.java:226-230](../../src/services/sparkplug-edge-node/src/main/java/com/ams/sparkplug/AlarmMetricPublisher.java#L226-L230)). **Every record that branch has ever produced has been silently discarded.**
- **`live.metrics` is a name collision with CPLM's K6.** Same name, three incompatible payloads if you add CPLM's.

Extending it would mean repairing a broken branch, changing a deployed job's output contract, and sharing a topic that already has a schema conflict — to save writing a job that already exists and is already tested on the CPLM side.

**Use `live.loop.metrics` as the topic name** (not `live.metrics`), and extend `sparkplug-edge-node` to subscribe to it. That is a two-line change to the topic list at [AlarmMetricPublisher.java:107](../../src/services/sparkplug-edge-node/src/main/java/com/ams/sparkplug/AlarmMetricPublisher.java#L107) plus a branch, and it gets loop KPI badges onto the existing Sparkplug live plane with the existing Redis snapshot and the existing `binding-resolver` addressing.

**Bonus: the SignalR KPI socket is already built and idle.** `OnLoopKpiUpdate` → `KpiConsumerService` → `alarmStore` is complete and wired to the frontend, and `KpiConsumerService` currently subscribes to **five topics no deployed component writes** ([KpiConsumerService.cs:17-24](../../src/backend/AMS.Api/BackgroundServices/KpiConsumerService.cs#L17-L24)). Widening `LoopKpiPayload` (`:90-98`) to carry `diagnosis`, `confidence`, `oce` is the single cheapest path to live loop badges in the existing UI — and it costs nothing today because nothing produces to those topics.

### Also fix while here

The edge node has **no deadband, no batching, no coalescing** — one Kafka record becomes one synchronous MQTT publish ([AlarmMetricPublisher.java:251,464-485](../../src/services/sparkplug-edge-node/src/main/java/com/ams/sparkplug/AlarmMetricPublisher.java#L251)) at QoS 0. At 1 Hz × N loops × 5 signals that is your throughput ceiling. CPLM's RBE upstream helps; the bridge still needs batching before any real plant.

---

## A-A — Should CPLM event frames feed Traverse's alarm service?

### Recommendation: **No — not as the system of record. Own the frames, mirror the verdicts.**

- **`analytics.cplm_event_frames`** (CPLM-owned) is the durable store: `(loop_id, gate, opened_at, closed_at, diagnosis, confidence, severity, ack_state, shelve_until, calculation_version, dynamics_profile_version)`. This is what the U4 Events screen and the governance screens read.
- **Mirror only `CONFIRMED_*` and `SUSPECTED_*` frames** into `raw-alarms` as advisory conditions, so loop diagnoses appear in the operator's existing alarm list and inherit ack/shelve UX.

### Why not make `raw-alarms` the system of record

The shape fits beautifully — which is exactly why this decision needs stating. The parser is duck-typed JSON requiring only `sourceName` and `conditionName` ([PipelineOperators.java:38-40](../../src/flink/src/main/java/com/ams/flink/PipelineOperators.java#L38-L40)); `conditionActive: true` then `false` on a stable key genuinely opens and closes a frame, correctly dedup'd and keyed. `RawOpcAlarmEvent` even has `opcAttributesJson` to carry the gate payload.

The store underneath does not hold up:

| Defect | Evidence | Effect on a diagnosis |
|---|---|---|
| **Severity ≥ 950 silently dropped** | `FloodDetectFilter.filter()` → `return evt.severity < 950;` ([PipelineOperators.java:353-369](../../src/flink/src/main/java/com/ams/flink/PipelineOperators.java#L353-L369)) | Map `CONFIRMED_*` to a high severity and it vanishes before persistence. Cap at 949 — and note this filter is a landmine for Traverse's own critical alarms too. |
| **Frame closure hard-deletes the row** | [NormalizedAlarmIngestor.cs:138,156,191](../../src/backend/AMS.Infrastructure/Kafka/NormalizedAlarmIngestor.cs#L138) | A stiction diagnosis that opened Tuesday and closed Thursday leaves **no record**. The whole point of an event frame is destroyed. |
| **No history writer** | Nothing in the repo inserts into `alarms.alarm_history` or `alarms.alarm_state_transitions` | The "durable" backstop is a permanently empty table. |
| **Shelves never expire** | `ShelveExpiryService` implemented, **never registered** ([Program.cs:653-688](../../src/backend/AMS.Api/Program.cs#L653-L688)) | A shelved diagnosis stays shelved forever. |
| **Ack requires OPC cookies** | `cookieOffset`, `activeFileTime` gate `IsWritebackAckEligible` ([PipelineOperators.java:76,80](../../src/flink/src/main/java/com/ams/flink/PipelineOperators.java#L76); `AlarmCommands.cs:133`) | Batch-ack of CPLM frames fails eligibility. Ack also never persists locally — it is dispatched to Kafka and returns success ([AlarmCommands.cs:63-73](../../src/backend/AMS.Application/Alarms/Commands/AlarmCommands.cs#L63-L73)). |
| **Shelve/suppress never traverse Kafka** | DB-only writes (`AlarmCommands.cs:226,304,331,387`) | CPLM cannot observe or express shelve state through the stream at all. |
| **Three state vocabularies** | DB enum `UnackedActive` vs C# `UnacknowledgedUncleared` vs mapper `"UNACKNOWLEDGED_UNCLEARED"` ([AlarmRepositories.cs:256-259](../../src/backend/AMS.Infrastructure/Repositories/AlarmRepositories.cs#L256-L259)) | Any integration picks one and drifts. |

Also register a **distinct `serverId`** for CPLM. `PipelineOperators.java:45-46` defaults a missing `serverId` to a hardcoded GUID (`f0af9a6d-…`) that appears in six other files — omit it and your diagnoses are attributed to the OPC alarm feed.

**Net:** mirroring gives you operator visibility for free. Depending on it for durability would lose your evidence trail — which is the one thing CPLM exists to provide.

---

## N-A — Naming and schema conventions

| Item | Decision | Reason |
|---|---|---|
| Topic names | **Keep CPLM's `a.b.c.v1`** | Traverse has two unenforced taxonomies coexisting (dash-case and dot-case, side by side at [kafka-reset-lab-topics.ps1:13-38](../../scripts/kafka-reset-lab-topics.ps1#L13-L38)), and `flink.state.alarm.delta` vs `alarm.state.delta` shows there is no convention to conform to. **No Traverse topic carries a version suffix.** CPLM's names are strictly better and set a precedent worth setting. |
| `clpm_` vs `cplm_` table prefix | **Normalise to `cplm_` now.** | The split (`clpm_short_feature_results`, `clpm_long_feature_results`, `cplm_gate_results`) is a typo that became a contract. There is **no data in Traverse to migrate** — this is free today and permanent tomorrow. Bump `schemaVersion` and record it. |
| `windowStartMs`/`windowEndMs` camelCase amid snake_case | **Keep.** | Ugly, but it is load-bearing across the engine, the golden test's expected output, and the UI. Changing it during a port means the golden test can no longer prove the port was clean. Fix it in a later, isolated version bump — never in the same change as the move. |
| Postgres schema names | `cpm` (**collision-free**, verified) and `analytics` (**already exists and is empty** — [01_init_extensions.sql:17](../../database/scripts/01_init_extensions.sql#L17)) | Note `analytics` is in the DB-level `search_path` and collides semantically with the `analytics.view` RBAC permission key. Acceptable, but qualify table names in queries. |
| SQL file numbering | **Renumber CPLM's scripts to 30+.** | CPLM uses 15/17/19/20/21/24; Traverse already has 15/17/18/19/20/21/22/23/24, and already has a duplicate-17 collision of its own. |
| IoTDB tree | `root.<site>.<unit>.<loop>.{pv,sp,op,vp,mode}` + `kpi.*` beneath | Matches Traverse's existing UNS-derived convention ([Asset.cs:77](../../src/services/asset-model/Models/Asset.cs#L77), [PathResolver.cs:172](../../src/services/binding-resolver/Services/PathResolver.cs#L172)) so `binding-resolver` and `historian-bff` work unchanged. **Do not** use `root.ams.site1.*` — that is the alarm tree. |
| Numeric types | **Declare `CREATE TIMESERIES … DOUBLE` explicitly** for every numeric | Traverse currently has zero `CREATE TIMESERIES` statements, `enable_auto_create_schema: "true"`, and a writer that string-concatenates values into SQL ([AlarmMetricPublisher.java:270-271](../../src/services/sparkplug-edge-node/src/main/java/com/ams/sparkplug/AlarmMetricPublisher.java#L270-L271)) so the type is inferred from whichever literal lands first. This is worse than CPLM's own inconsistency; fix it on the way in. |

---

## M-A — Multi-plant / multi-tenant scope

### Recommendation: **single-site for the port; make it site-aware in the schema now, defer real tenancy.**

Traverse has **no tenant discriminator anywhere** — `grep -i tenant` over `src/services/` and `database/` returns zero. "Site" is purely the first segment of the contextual path ([Asset.cs:83](../../src/services/asset-model/Models/Asset.cs#L83)) plus an `asset_type=1` row. The seeded two-site plant (houston, dallas) is a data-shape convention, not a boundary.

The one real isolation mechanism is a **JWT `assetScope` claim** doing prefix matching, and it is enforced **only in binding-resolver** ([binding-resolver/Program.cs:199-219](../../src/services/binding-resolver/Program.cs#L199-L219)) and historian-bff ([Program.cs:299-310](../../src/services/historian-bff/Program.cs#L299-L310)). **`asset-model` itself does not filter by scope** — `GET /assets` returns everything. And **absent claim = unrestricted**. That is not a tenancy boundary.

So:
- Put `site` on `cpm.loop_registry` and make it non-null from the first row. Retrofitting a discriminator after loops exist is the expensive version.
- Partition the IoTDB tree by site (`root.<site>.…`) — already the convention, and it makes per-site TTL possible.
- Make `threshold_profile_id` resolvable per site, since dynamics profiles are plant-physics-specific.
- **Do not** build tenant isolation into CPLM. If Traverse gains real multi-tenancy it must be platform-wide (asset-model included), and CPLM should inherit it, not invent a parallel model.

---

## One decision not on your list, but forced by the code

### F-A — Merge the Flink fork; do not ship two jars.

`CPA/CPAMAIN/src/flink` and `src/flink` are **the same Maven module** — `com.ams:ams-flink:1.0-SNAPSHOT`, Flink 1.18.1, Java 11, identical connector versions — diverged from a common ancestor. They share five classes by FQN, of which `PipelineConfig`, `LoopKpiResult` and `LoopKpiStreamJob` have **diverged on both sides** (Traverse added IoTDB fields to `PipelineConfig`'s constructor; CPLM added `jobName`/`kpiConsumerGroupId`/`enabledKpis` to the same constructor). Both build to `ams-flink-1.0-SNAPSHOT.jar`, which compose bind-mounts at that exact path in five places.

**Decision: copy `com.ams.flink.cplm` (+ `src/main/resources/cplm/loop-dynamics-profiles.yaml` + the four tests) into `src/flink` and ship one jar.**

This is safe, and verifiably so: `grep '^import com.ams' CPA/CPAMAIN/.../cplm/*.java` returns **nothing** — the `cplm` package has zero dependencies on any sibling `com.ams` class. It lifts as a unit. Do **not** merge `com.ams.operator.loop.*` or the diverged `LoopKpiStreamJob`; Traverse's simpler version stays until `clpm.feature.short.v1` replaces the 5-minute tier.

Build changes required: add `junit:4.13.2` (test scope) — that is all. The YAML parser is hand-rolled `java.util.regex`, so **no snakeyaml, no new runtime dependency**.

Why not two jars: Traverse's shaded jar already leaks ~5 383 `org/apache/flink/**` classes (connectors don't mark Flink `provided`) with **no relocations and no `ServicesResourceTransformer`** ([pom.xml:110-145](../../src/flink/pom.xml#L110-L145)). Two fat jars with overlapping Flink internals under child-first classloading is a debugging session nobody needs.

*Correction after performing the merge:* an earlier draft of this record claimed CPLM uses plain Jackson while Traverse uses the Flink-shaded copy. That is wrong. The `cplm` package imports **only** `org.apache.flink.shaded.jackson2.*` — identical to Traverse's own jobs — so the declared `jackson-databind:2.15.3` remains inert and needs no pinning.
