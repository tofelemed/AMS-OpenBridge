# Truss living-asset pitch: concept map and gap analysis against AMS-open

Written 2026-09-30 from the nine current-state reports in this folder (`01` to `09`) and the two pitch
documents (`Executive Summary.md`, `Architecture for Living-Asset Runtime and Plant Manager Dashboard.md`).
Every "what exists" cell cites the report that proves it; the reports cite code as `path:line`.
Status vocabulary: **EXISTS** (usable as-is), **PARTIAL** (pattern or half of it exists), **MISSING**.

## 1. The pitch in one page, in our terms

The pitch describes six things joined in a line:

1. **A canonical, versioned plant model in Truss** (a knowledge-graph product): typed entities, typed
   relationships, KPI definitions, bindings to data sources, persona and view definitions, each with
   effective dates and a monotonically increasing *context revision*.
2. **A compiler** that validates a Truss revision and emits a *runtime package* per entity (fields with
   `mode: source | calculate`, assessments, children, aggregation rules, drill rules) onto a
   **compacted Kafka config topic**, with an activation handshake.
3. **Ingestion** of every real-time source (DCS values, alarms, loop KPIs, instrument health, utilities)
   through MQTT into Kafka under a `source/*` namespace (they suggest Kafka Connect).
4. **A Flink runtime** keyed by `entity_id` that holds each entity's latest field values, computes
   calculated fields and roll-ups, evaluates assessments, and keeps an **issue/episode ledger** with
   evidence references; it publishes a per-entity *living object* state and issues.
5. **A runtime API and push channel** (`/entities/{id}`, `/children`, `/history`, `/issues/{id}`,
   WebSocket or MQTT `traverse/runtime/...`).
6. **Persona dashboards on OpenBridge** (Plant Manager, Operations, Maintenance, Shift Supervisor) that
   bind to semantic fields of living objects and drill while preserving entity, time and revision.

The headline is the Plant Manager view: production vs plan, specific energy, availability, unit
summaries, top exceptions, drill to evidence.

## 2. The ten findings that decide the shape of the work

**F1. The pitch's control plane already exists, for one domain.** The CPLM lane ships a governed
configuration pipeline that is, mechanically, the compiler-to-runtime path the pitch asks for:
immutable content-hashed bundles with approvals (`58_cpm_config_governance.sql`), an HMAC-signed
envelope on a **compacted** topic (`traverse.cpa.context.gate-config.v1`), Flink **checkpointed
broadcast state**, a **PREPARE/APPLY → ACK/NACK** handshake with epochs and effective-from event time,
CAPABILITY announcements, and `bundle_hash` + `context_revision` stamped on every result
(report 04 §2.2, report 06 §2.3). It carries 165 gate *properties* scoped SITE/PROFILE/LOOP, not an
entity graph, and its validator rejects anything outside that catalogue. The right move is to
**generalise this plane**, not to build a second one.

**F2. Nothing in any stream carries an entity id.** Alarms are keyed `serverId|source|condition`
(a tag name), loops by `loop_id` with an optional `asset_uuid`, live metrics by a Sparkplug device id
derived from the UNS path. No Flink job reads the asset model; no stream is keyed by hierarchy
(report 04 §2.3, report 08 §2.1). **Entity attribution is the first prerequisite** of everything else.

**F3. The asset model is a five-level tree with no versioning and no KPI/target/formula/persona.**
`traverse_assets.assets.assets` stores Site/Area/Unit/Device/Measurement with typed columns; the
materialised path *is* the transport address (IoTDB path, Sparkplug topic, Redis key derive from it);
edges are a CPLM-motivated closed set; there is no history table, no `validFrom/validTo`, no revision,
no publish state, and changes go out on Redis pub/sub, not Kafka (report 01). The v2.5 specification
already states the intended split: *"Truss/asset context owns plant identity and primary source
binding"* (`docs/next-release/spec/COMPLETE_NEXT_RELEASE_SPECIFICATION.md:55`).

**F4. The plant runs only the loop-performance lane, and the Plant Manager KPIs have no input data.**
Production runs seven CPLM Flink jobs and cplm-api; the alarm lane is lab-only (no `traverse.alarm.*`
topics at the plant, ams-api optional and database-less); the generic process-value plane
`traverse.live.metrics` has **no production producer**; there is no production counter, utility
meter, energy or availability signal anywhere in the pipeline (reports 05 §2.1, 07 §2.1, 08 §2.0).
The pitch's headline tiles therefore need **new data sources**, not just new dashboards.

**F5. Ingestion is a custom service on a shared broker, not Kafka Connect on our own.** MQTT→Kafka is
`ingestion-service` (MQTTnet QoS 1, persistent session, 5 s loop joiner, role mapping, quality decoding,
DLQ); two of five profiles are wired. Kafka is Instrumental's; only `traverse.cpa.*` /
`traverse.ingestion.*` topics may be created; EMQX's ACL allows `spBv1.0/#` only; the OT broker is a
third-party mosquitto with its own namespace (report 05). The pitch's `source/*` topics, Kafka Connect
and `traverse/runtime/*` MQTT namespace all collide with these facts.

**F6. The closest issue ledger is the CPLM event frame.** `analytics.cplm_event_frames` has a pure
lifecycle (Open/Extend/Escalate/Observe/Unobservable/Close), severity bands, independent ack and shelf
axes, append-only actions and episode captures, class-based evidence retention. It is keyed
`(loop_id, window_kind, family)`, mutated in place, carries no `context_revision`, and its evidence
references are CPLM-internal arrays (report 06 §2.4). It is the template for a generic ledger, not the
ledger.

**F7. The UI has the building blocks but no persona, scope or semantic binding.** Context is URL-only
by recorded rule; roles are Admin/Engineer/Operator/Viewer with ~38 permissions and **no site or unit
scope**; drill rules are hard-coded in `cpaHref.ts`; `KpiTile`, `PlantScopeFilter`, `GateMatrix`,
`AttentionList`, echarts trends and the plant-model tree exist; CPM pages poll, they do not push; the
sidebar drops context and is under a "sidebar untouched" rule (report 07).

**F8. Displays bind by raw UNS path strings and cannot compute.** A symbol's binding is
`bindings[slot] = "site/area/unit/device.measurement"`, resolved to Sparkplug/IoTDB/Redis addresses
by binding-resolver; no expression engine, lexical-only validation, the template palette is orphaned
(report 03). Persona dashboards must bind by `entity_id + field`, which is a new binding kind beside
the path string, not a replacement.

**F9. Operations constrain every new store.** Plant Postgres has no TimescaleDB (daily partitions +
`retention_policy` rows), the shared disk had ~25 GB free after four fill incidents, there are no
automated backups, no Flink HA or savepoints (jar change = `docker rm -f` + resubmit, fresh window
state), every schema change is written four times, releases are air-gapped tarballs (report 09).

**F10. Several documents disagree with the code.** StreamPipes and `raw-opc-events` are retired; the
.NET fallback processor does not exist; Flink does not enrich alarms with assets; decision #5 still
says four UNS levels while HDPE paths have five; the template palette is recorded as delivered but is
orphaned; the CPLM runbook names a stale consumer group (reports 01, 03, 05, 06, 08). The target
architecture must be written against the code.

## 3. Concept map: pitch concept → what exists → status → gap

### 3.1 Model (governance layer)

| # | Pitch concept | What exists today (report) | Status | Gap / how it closes |
|---|---|---|---|---|
| T-01 | Typed entities Plant/Unit/Section/System/Equipment/InstrumentPosition/Device/ControlLoop/Signal/APMModel | 5 fixed levels Site/Area/Unit/Device/Measurement + free-text `template`; loop = Device `CpmLoop`; signal = Measurement (01 §2.1) | PARTIAL | Truss owns the type catalogue; the compiler projects each entity to a UNS row + `external_id`. No new asset levels needed for HDPE (Plant=Site, Section=Area). |
| T-02 | Typed relationships (CONTAINS, HAS_INSTRUMENT, MONITORS, EVALUATES, KPI_EVALUATES) | `parent_id` tree + edge table with 5 CPLM types; loop→signal roles in `cpm.loop_tag_map`; instrument→signal in `cpm.signal_device_binding_history` (01 §2.1, 02 §2.1) | PARTIAL | Truss holds the graph; only CONTAINS and the 5 process edges are projected; the rest live in the runtime package (children, dependencies). |
| T-03 | Bitemporal versioning + context revision | none on assets; effective dating only on CPLM instrument bindings; `bundle_hash`/`context_revision` on CPLM results (01 §2.4, 04 §2.6) | MISSING (model) / EXISTS (result stamping) | Revision is minted by Truss; the compiler seals packages with it; every runtime record carries it (pattern exists). "As-of" reads are a later phase. |
| T-04 | KPI definitions (formula, scope, time basis, unit, target, drill policy) | formulas compiled in Java; `GateCatalog`/`WindowCatalog` hand mirrors; 165-property catalogue = evaluator parameters, no targets/scope/time basis (06 §2.2) | MISSING | Runtime package `fields` + `assessments` + `targets` sections; a small evaluator library in Flink reads them. |
| T-05 | Bindings live / historical / calculation | live + history + alarm addressing derived from the UNS path with overrides; calculation = analysis-service expression job writing a plain tag (02 §5) | PARTIAL | Live and history bindings resolve today; a `calculate` field mode and per-field `source` provenance are new. |
| T-06 | PI-AF / PI Web API sources | none; "piarchiver" is Instrumental's product (05 §2.8) | MISSING | Out of scope unless a PI system appears; IoTDB is the historian. |
| T-07 | PersonaDefinition, SemanticViewDefinition, ResponsibilityAssignment, DashboardTemplate, DrillRule, AccessPolicyReference | role + flat permissions; hard-coded `cpaHref.ts`; ISA-101 `level` on displays (07 §2.5, 03 §2.4) | MISSING | Authored in Truss, compiled into the package's `navigation`/`views`/`personas` sections; scope becomes a JWT claim. |
| T-08 | Truss authoritative for naming; clients use semantic names | UNS path is both the semantic name and the physical key (02 §5) | PARTIAL | Keep UNS path as transport identity; add `entity_id` + `field` as the semantic address for dashboards. |

### 3.2 Compile and distribute

| # | Pitch concept | What exists today (report) | Status | Gap / how it closes |
|---|---|---|---|---|
| T-09 | Truss-to-runtime compiler with validation (bindings resolve, no cycles, non-overlapping aggregation, uniqueness, no overlapping validity) | write-time grammar and parent checks in asset-model; `BundleValidator` NR-047..055 and `EffectiveConfigResolver` in cplm-api; readiness probes (01 §2.2, 06 §2.3) | PARTIAL | New `context-compiler` service reusing the bundle store/deployment pattern; validation rules are new code. |
| T-10 | Versioned runtime package on a compacted Kafka topic | `traverse.cpa.context.gate-config.v1` + `ams.metadata.updates` (compacted, keyed, signed, tombstones) (04 §2.2, 05 §2.3) | EXISTS (pattern) | New topic `traverse.cpa.context.runtime-package.v1` with the same envelope and a per-entity key. |
| T-11 | Activation handshake, no mixed state | PREPARE/APPLY → ACK/NACK, `NOT_PREPARED`, `UNSIGNED`, epochs, ACTIVE_VERIFIED state machine (04 §2.2) | EXISTS | Reuse verbatim; the runtime job joins the ACK protocol. |
| T-12 | Config update handling (re-evaluate, purge removed entities, savepoint on breaking change) | tombstones purge broadcast keys; STATE_BOUNDARY epochs; keyed state never purged; no savepoints at the plant (04 §5) | PARTIAL | `KeyedBroadcastProcessFunction.applyToKeyedState` on package change (pattern in the instrument job); tombstone → clear keyed state; cold resubmit stays the upgrade path (design the job to rebuild from its compacted output). |

### 3.3 Ingestion and streams

| # | Pitch concept | What exists today (report) | Status | Gap / how it closes |
|---|---|---|---|---|
| T-13 | MQTT namespaces `dcs/…`, `alarm/…`, `apm/…`, `control/…`, `instrumental/…`, `utility/…` | OT loops on Instrumental's `OT/HDPE/…`; NE107 on `traverse/instrumental/v1/…`; alarms by HTTP poll; nothing for APM/utility (05 §2.1) | MISSING | Namespaces belong to the source owners; ingestion-service `topic_template` per data source absorbs whatever they publish. |
| T-14 | Kafka Connect MQTT source, `source/*` topics, RegexRouter | `ingestion-service` (functionally superior for our sources); shared broker rejects non-`traverse.cpa.*` prefixes; no Connect anywhere (05 §2.2, 09 §4) | PARTIAL | Do not adopt Connect. Wire the `MQTT_TELEMETRY` profile to a new `traverse.cpa.telemetry.v1` with an entity-tagged envelope. |
| T-15 | SensorData `{timestamp, entity_id, asset_type, parameter, value, uom, quality}` | loop tuple `{loop_id, asset_uuid?, site/area/unit, pv/sp/op/vp/mode, quality}`; live metric `{device, metric, value, quality, ts}`; no `uom` on any record (05 §2.5) | PARTIAL | New telemetry envelope carries `entity_id`, `uns_path`, `field`, `uom`, quality, three timestamps (CHG-026 convention). |
| T-16 | Exactly-once Flink from Kafka, event time, lateness bounds | CPLM jobs: EXACTLY_ONCE, per-partition watermarks, 30 min idleness, allowed lateness (04 §2.1) | EXISTS | Copy `CplmIngestPipeline` watermarking. |
| T-17 | Compacted config topic for context | four compacted CPA context topics; asset-model events on Redis pub/sub only (05 §2.3, 01 §2.4) | PARTIAL | Compiler pulls asset-model by REST at compile time; a Kafka asset-events topic is optional later. |

### 3.4 Runtime (Flink)

| # | Pitch concept | What exists today (report) | Status | Gap / how it closes |
|---|---|---|---|---|
| T-18 | Broadcast config state, `MapStateDescriptor`, `KeyedBroadcastProcessFunction` | `PROFILE_STATE` broadcast (checkpointed); one keyed-broadcast job (instrument context) (04 §2.2) | EXISTS | New job keyed by `entity_id` with the same descriptors. |
| T-19 | Keyed per-entity state: latest fields (value/unit/ts/quality), computed KPIs, windows, issue refs | per-loop state in six jobs; per-(loop, metric) last value in `LoopLiveRbeJob` (04 §2.4) | PARTIAL | New `LivingAssetRuntimeJob`; the loop jobs stay as they are and become *inputs*. |
| T-20 | Evaluator library (limit breach, target deviation, variance, stagnation) parameterised from config | gates G0–G15 and `ConditionDetector`, loop-specific, compiled; `ExpressionEvaluator` arithmetic (04 §5) | PARTIAL | Generic evaluators over entity fields: `threshold`, `target_deviation`, `stagnation`, `stale`, `rate_of_change`, `worst_of_children`, `coverage`. |
| T-21 | Flink CEP | absent (`pom.xml` has no `flink-cep`) (04 §2.2) | MISSING | Not needed for phase 1–3; temporal rules as hand-written state machines like the rest of the fleet. |
| T-22 | Timers for shift/day roll-ups | 15-min event-time timers, freshness timers, 300 s heartbeat; no calendar (04 §5) | PARTIAL | Calendar section in the package (shift pattern, production day start); event-time timers per boundary. |
| T-23 | Hierarchy roll-ups with non-overlapping contribution rules | none; fleet views are counts; sliding windows overlap (06 §2.6) | MISSING | `dependencies` section in the package; roll-up stage re-keyed by parent; only tumbling or event-boundary inputs count. |
| T-24 | Living-object state sink (store + MQTT `traverse/runtime/entity/{id}/state`) | Flink → Kafka only; edge node → Redis/Sparkplug per metric; .NET consumers → Postgres (04 §5, 05 §2.7) | PARTIAL | Compacted `traverse.cpa.runtime.entity-state.v1` → `runtime-api` (Postgres + SignalR). MQTT runtime namespace deferred (EMQX ACL, Sparkplug-only browser decoder). |
| T-25 | Issue ledger (append-only, evidence refs, `context_rev`) + `traverse/runtime/issue/{id}` | event frames, conditions, actions, captures; no topic, no push, loop-only (06 §2.4) | PARTIAL | `traverse.cpa.runtime.issues.v1` → `traverse_runtime.issue` (revisioned rows) with typed evidence refs (alarm id + time, loop episode id, method run id, IoTDB series + range). |
| T-26 | `context_rev` on every record | on every CPLM result (04 §2.6); alarm records only `schemaVersion` | EXISTS (CPLM) | Runtime records carry `context_revision` + `package_hash`. |

### 3.5 Serving and UI

| # | Pitch concept | What exists today (report) | Status | Gap / how it closes |
|---|---|---|---|---|
| T-27 | Runtime API `/entities/{id}`, `/children`, `/history`, `/issues/{id}`, subscribe | asset-model (config), binding-resolver (addressing), historian-bff (IoTDB), cplm-api (loop episodes), AlarmHub (07 §2.6, 08 §2.3) | PARTIAL | New `runtime-api` (read side of the runtime topics) + `/hubs/runtime`; history delegates to historian-bff. |
| T-28 | GraphQL | none; REST + batch endpoints + gateway cache classes (08 §2.6) | MISSING | Not adopted; REST with `?include=children,issues` and batch reads. |
| T-29 | Persona dashboards as views over the same objects | one engineer dashboard (`/cpm`), one dormant alarm dashboard; CPA slice flag (07 §2.1) | MISSING | New `/plant/*` module driven by the package's `views` + `personas`; extend `SLICE_NAV`. |
| T-30 | Drill rules preserving entity, time, shift, identity, revision | URL-only context (`?site&area&unit&loop&window`), display `NavigationLink` with asset + time (07 §2.3, 03 §2.4) | PARTIAL | `runtimeHref.ts` reads drill rules from the package; URL contract `?entity&from&to&rev&shift`. |
| T-31 | KPI cards with sparkline, grids, trends, breadcrumbs, Top Exceptions | `KpiTile` (no sparkline), AG Grid, `GateMatrix`, echarts + box zoom, static crumbs, `AttentionList`, alarm bad actors (07 §2.7) | PARTIAL | Extend `KpiTile`; entity breadcrumb from `/children`/`/hierarchy`; Top Exceptions = open issues ranked by severity within scope. |
| T-32 | Offline/resume, stale labelling | `ConnectivityBanner`, MQTT snapshot re-seed, hub reconcile, `sourceTs` staleness, NE107 quality (07 §2.6, 03 §2.3) | PARTIAL | Per-field `quality` and `freshness` in the living object; a generic stale badge. |
| T-33 | Scope-limited tokens, no escalation on persona switch | role + permissions; `assetScope` prefix claim read by binding-resolver only (02 §2.2); no scope on users (07 §2.5) | PARTIAL | `scope[]` (UNS prefixes) + `persona` claims issued by auth-service from ResponsibilityAssignment; gateway header + `TraverseAuth.cs`. |
| T-34 | Audit of config publishes and drill actions | hash-chained audit-service; display/CPM/auth/ingestion emit; asset-model and ams-api do not; no read auditing (08 §2.7) | PARTIAL | Compiler and runtime-api emit `CONTEXT_*` / `ISSUE_*` events; read/drill auditing stays out (volume, no retention on the chain). |

### 3.6 Operations

| # | Pitch concept | What exists today (report) | Status | Gap / how it closes |
|---|---|---|---|---|
| T-35 | Liquibase migrations | numbered idempotent SQL, four copies, no version table (09 §2.2) | PARTIAL | Follow the four-copy rule; no new migration framework. |
| T-36 | Savepoint upgrades | none at the plant; `DELETE_ON_CANCELLATION` (09 §2.5) | MISSING | Runtime job rebuilds from compacted topics; no savepoint dependency. |
| T-37 | Daily Truss DB backups | none automated anywhere (09 §2.8) | MISSING | Add `pg_dump` cron for the new databases; the plant's first scheduled backup. |
| T-38 | Prometheus, k8s secrets, Helm | lab-only observability; compose `.env`; Helm stale (09 §2.9–2.10) | PARTIAL | Compose + `.env`; health via `/gw/upstreams/<cluster>/health` and CAPABILITY records. |
| T-39 | TLS + broker ACLs by service identity | EMQX JWT + one built-in user; Kafka PLAINTEXT; gateway mTLS to services (05 §5) | PARTIAL | Unchanged in this programme. |

## 4. What is already implemented, what changes, what is new

**Reusable as-is (do not rebuild):** the UNS asset model and its transport derivation; binding-resolver
batch resolve; historian-bff trend/raw/summary/snapshot; the Sparkplug/Redis live plane and the browser
MQTT store; the CPLM jobs and their result/episode/evidence tables; the governed bundle store,
deployment state machine, signed envelope, ACK consumer and CAPABILITY records; `KafkaSinks` keyed
sinks; `CplmIngestPipeline` watermarking; the gateway (routes, caching, rate classes, header injection);
`TraverseAuth.cs`; the audit chain; `KpiTile`, `PlantScopeFilter`, `GateMatrix`, `AttentionList`,
echarts trend components; the release tooling (`build-release.py`, `ops/`, VM steps).

**Updated:** `asset-model` (external id + revision columns, export, Truss projection endpoint);
`ingestion-service` (telemetry profile → entity-tagged envelope); `auth-service` + gateway +
`TraverseAuth.cs` (scope and persona claims); `sparkplug-edge-node` (optional runtime namespace,
later); `frontend-ob` (persona module, runtime hub client, KPI tile sparkline, URL contract);
`notification-service` (issue subscriptions, later); `migration/` pack (databases, topics, jobs, env);
`docs/api-gateway.md`, `architecture_document.md` (corrections from F10).

**New:** `context-compiler` service + `traverse_context` database; `LivingAssetRuntimeJob` (+ roll-up
stage) in `src/flink`; `runtime-api` service + `traverse_runtime` database + `/hubs/runtime`; topics
`traverse.cpa.context.runtime-package.v1`, `…runtime-package.acks.v1`, `traverse.cpa.runtime.entity-state.v1`,
`traverse.cpa.runtime.issues.v1`, `traverse.cpa.telemetry.v1`; IoTDB database `root.runtime` for KPI
history; persona pages `/plant/*`.

**Retire or decide:** `analysis-service` (no UI caller; its expression job is subsumed by calculated
fields), the dead topics (`events.raw`, `state.delta`, `raw.telemetry.site1`, `live.alarm.metrics`),
the unused JDBC dependency, `traverse.live.metrics` in favour of the prefixed telemetry topic.

## 5. Decisions required before building

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D-01 | Source of truth split between Truss and asset-model | Truss owns entities, relationships, KPIs, targets, personas, views, revisions. asset-model stays the runtime **UNS transport projection** (paths, overrides, aliases) and is written by the compiler for Truss-managed entities; hand edits remain possible for the transition. | Honors decisions #2/#5/#17 (bind through the UNS) and the v2.5 spec line; keeps every existing consumer of asset-model untouched. |
| D-02 | How Truss reaches the compiler | Truss export as a versioned JSON document: pulled over HTTP where reachable, carried as a file at the air-gapped plant. | The plant has no route to a cloud Truss; a file is the only universal path. |
| D-03 | The runtime key | Truss `entity_id` (immutable) is the Flink key and API id; UNS path stays the transport address; both are on every runtime record. | F2; rename-safe ids for dashboards; displays keep path bindings. |
| D-04 | Control-plane implementation | Reuse the gate-config plane: same envelope, signature, PREPARE/APPLY, ACK record; **separate** topic and ACK consumer group; the C# store/deployment classes are copied into the compiler with a sync script (the `TraverseAuth.cs` precedent). | F1; single-member consumer rule forbids sharing cplm-api's ACK consumer. |
| D-05 | Push channel to the UI | SignalR `/hubs/runtime` + REST snapshot. MQTT `traverse/runtime/*` deferred. | EMQX ACL is `spBv1.0/#` only; browser decoder is Sparkplug-only; SignalR is the proven alarm pattern. |
| D-06 | Ingestion | No Kafka Connect. Extend `ingestion-service` profiles; new `traverse.cpa.telemetry.v1` envelope with entity id and uom. | F5; the custom service already does joining, roles, quality, DLQ. |
| D-07 | Alarm lane at the plant | Out of scope for the first three phases; phase 4 adds alarm→entity attribution only if the lane is deployed. | F4; no alarm topics at the plant today. |
| D-08 | `analysis-service` / `notification-service` | Retire `analysis-service` after calculated fields ship; rebuild notification policies on the issues topic in phase 5. | Both are dormant or mocked (report 06 §2.7–2.8). |
| D-09 | Scope in the token | `scope[]` (UNS prefixes) and `persona` claims; gateway injects `X-Auth-Scope` / `X-Auth-Persona`; services filter reads. | Edge-only auth (#16); binding-resolver already reads a prefix claim. |
| D-10 | Retention and disk | Every new table and topic ships with a `retention_policy` row / `retention.ms`; issue revisions only on state or severity change; KPI history in IoTDB `root.runtime` (own TTL). | F9; IoTDB 1.3.2 cannot set a sub-tree TTL. |
| D-11 | Upgrades without savepoints | The runtime job restores state from its own compacted entity-state topic and the package topic on start; issue ids are deterministic so re-emission upserts. | F9; no HA at the plant. |
| D-12 | CEP and GraphQL | Neither in phases 1–4. | T-21, T-28. |

## 6. Reading the rest of this folder

`11-target-architecture.md` turns the "how it closes" column into components, contracts and diagrams.
`12-implementation-plan.md` orders the work into releases that fit `build-release.py`, the four-copy
schema rule, `changes_tracker.md` and `prod_decision.md`.
