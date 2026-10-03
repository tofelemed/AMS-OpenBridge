# Target architecture: Truss-governed living assets on the AMS / Traverse stack

Written 2026-09-30. This is the pitch (`Executive Summary.md`, `Architecture for Living-Asset Runtime and
Plant Manager Dashboard.md`) re-expressed against what the code does today (reports `01`–`09`) and the
decisions D-01…D-12 in `10-truss-concept-map-and-gap-analysis.md`. Everything here honours the settled
decisions in `MIGRATION_LOG.md` (CQRS, bind through the UNS, Flink-only compute, one database per service,
edge-only auth, four-level UNS with areas, DOM/SVG designer, OpenBridge vocabulary).

## 1. Principles

1. **Truss governs, Traverse executes.** Truss is the authoring and approval system for the plant model,
   KPIs, targets, personas and views. Nothing in Truss is read at runtime; only compiled, signed, versioned
   packages reach Flink and the UI.
2. **One control plane.** The runtime package travels on the same kind of compacted, signed, ACKed topic
   as the CPLM gate-config bundles. The runtime job speaks the same PREPARE/APPLY protocol.
3. **Entity id is the runtime key; UNS path is the transport address.** Every runtime record carries both.
   Displays keep binding by path; persona dashboards bind by entity id + field.
4. **Flink computes, services project and serve.** Flink writes Kafka and IoTDB only; Postgres is written
   by one single-member consumer per topic; the UI reads REST and SignalR.
5. **Existing lanes are inputs, not rewrites.** The CPLM jobs, the alarm jobs, the instrument-health job and
   the Sparkplug live plane are unchanged; their outputs are attributed to entities by the runtime job.
6. **Ship with retention.** Every new table, topic and IoTDB database is created with its retention rule.

## 2. Layered view

```mermaid
flowchart TB
  subgraph GOV["Governance (Truss)"]
    TR["Truss knowledge graph<br/>entities, relationships, KPIs, targets,<br/>personas, views, drill rules, revisions"]
  end
  subgraph CTL["Control plane (new context-compiler, DB traverse_context)"]
    CC["context-compiler<br/>import revision → validate → resolve UNS → seal package"]
    AM["asset-model (updated)<br/>UNS projection: paths, overrides, aliases, external_id"]
    PK[("traverse.cpa.context.runtime-package.v1<br/>compacted, signed, key entity:id / manifest:site")]
    AK[("…runtime-package.acks.v1")]
  end
  subgraph IN["Ingestion (existing services)"]
    ING["ingestion-service<br/>loop samples + NE107 + NEW telemetry profile"]
    TEL[("traverse.cpa.telemetry.v1<br/>key entity_id")]
    LS[("traverse.cpa.loop.samples.v1")]
  end
  subgraph FL["Flink (existing 7 CPLM jobs + 1 new)"]
    CPLM["CPLM jobs → gate.results / condition / live.loop.metrics / context.instrument-health"]
    RT["LivingAssetRuntimeJob (new)<br/>keyed by entity_id, broadcast package<br/>fields · calculations · assessments · roll-ups · issues"]
  end
  subgraph OUT["Runtime outputs"]
    ES[("traverse.cpa.runtime.entity-state.v1<br/>compacted, key entity_id")]
    IS[("traverse.cpa.runtime.issues.v1<br/>key issue_id, 3 d")]
    IOT[("IoTDB root.runtime.<site>.<entity>.<field>")]
  end
  subgraph SRV["Serving (new runtime-api, DB traverse_runtime)"]
    RA["runtime-api<br/>REST /api/runtime/* + SignalR /hubs/runtime"]
    HB["historian-bff (existing)"]
  end
  subgraph UI["frontend-ob"]
    PM["/plant/* persona module (new)<br/>Plant Manager · Operations · Maintenance · Shift"]
    HMI["HMI displays (unchanged, path bindings)"]
  end
  TR -->|export JSON (HTTP or file)| CC
  CC <-->|REST by-paths / bulk| AM
  CC --> PK
  PK --> RT
  RT --> AK --> CC
  ING --> TEL --> RT
  ING --> LS --> CPLM --> RT
  RT --> ES --> RA
  RT --> IS --> RA
  RT --> IOT --> HB
  RA --> PM
  HB --> PM
  AM --> HMI
```

## 3. Components

| Component | Kind | Responsibility | Store | In | Out | Gateway |
|---|---|---|---|---|---|---|
| **Truss** | external product | Author and approve entities, relationships, KPI definitions, targets, calendars, personas, views, drill rules; mint `context_revision`; export a revision as JSON | Truss's own | – | export document | none (not on the plant network by default) |
| **context-compiler** | NEW .NET 8 minimal API, `src/services/context-compiler` | Import a Truss export (pull URL or uploaded file); validate (§7); resolve every entity to a UNS row in asset-model (create/update rows for Truss-managed entities, write `external_id`); build per-entity runtime packages; store package + deployment; publish signed PREPARE/APPLY; consume ACKs; expose packages, personas, views and drill rules to the UI | `traverse_context` | Truss export; asset-model REST; ACK topic | package topic; audit events | `/api/context/**` |
| **asset-model** | UPDATED | Unchanged behaviour plus: `external_source`/`external_id` columns, `context_revision` column, `GET /assets/export`, `POST /assets/project` (idempotent bulk upsert by external id) | `traverse_assets` | compiler | Redis `asset-events` (unchanged) | `/api/assets`, `/api/aliases` |
| **ingestion-service** | UPDATED | Wire the `MQTT_TELEMETRY` profile: per-source `topic_template`, parameter → `field` map, quality protocol, entity resolution through a cached asset-model lookup (path or alias → `external_id`) | `traverse_ingestion` | OT/utility MQTT | `traverse.cpa.telemetry.v1` (+ DLQ) | `/api/ingestion` |
| **LivingAssetRuntimeJob** | NEW Flink job, `com.ams.flink.runtime` | Broadcast package; attribute every input record to an entity; keyed per-entity state; calculated fields; assessments → issues; roll-ups; RBE + heartbeat emission of the living object; KPI history to IoTDB; CAPABILITY + ACK | Flink state (RocksDB) | telemetry, gate results, conditions, live loop metrics, instrument-health context, (live alarms when deployed), package topic | entity-state, issues, ACKs, IoTDB | – |
| **runtime-api** | NEW .NET 8 minimal API | Single-member consumers of entity-state and issues → Postgres; REST reads (§8); SignalR hub with per-entity and per-scope groups; issue actions (acknowledge, comment, pin evidence); scope filtering from `X-Auth-Scope` | `traverse_runtime` | runtime topics | SignalR, audit events | `/api/runtime/**`, `/hubs/runtime` |
| **historian-bff** | UPDATED (small) | `/series` prefix default gains `root.runtime.**`; no other change (runtime-api resolves field → series and calls `/trend`) | – | – | – | `/api/hist` |
| **auth-service, gateway, TraverseAuth.cs** | UPDATED | `scope[]` and `persona` claims from `traverse_context.responsibility_assignment` (read at token issue); gateway injects `X-Auth-Scope`, `X-Auth-Persona`; `TraverseAuth` exposes them | `traverse_auth` | – | – | – |
| **frontend-ob** | UPDATED | `/plant/*` module: persona home, KPI analysis, entity page, issue page; `runtimeHref.ts` drill rules; runtime hub client; `KpiTile` sparkline; `SLICE_NAV` extension; persona switch in the top bar | – | runtime-api, historian-bff, context-compiler | – | – |
| **sparkplug-edge-node** | UNCHANGED (phase 5 option) | Optional republish of entity state to MQTT `traverse/runtime/entity/{id}/state` for non-browser consumers | – | entity-state | EMQX | – |
| **notification-service** | UPDATED (phase 5) | Consume issues; policies and subscriptions in a table instead of code | own tables | issues | e-mail / Teams | – |
| **analysis-service** | RETIRE (phase 5) | Calculated fields replace its expression job | – | – | – | – |

## 4. Identity model

| Identity | Owner | Where it lives | Used for |
|---|---|---|---|
| `entity_id` (Truss id, immutable string) | Truss | package records; `assets.assets.external_id`; every runtime record; runtime-api ids; persona URLs `?entity=` | the Flink key, API id, issue scope, drill context |
| UNS `contextual_path` | asset-model | `assets.assets`; display bindings; binding-resolver | transport derivation (IoTDB, Sparkplug, Redis, alarm source); HMI displays |
| asset `id` (uuid) | asset-model | `assets.assets.id`; `cpm.loop_registry.asset_id`; loop tuple `asset_uuid` | the bridge from the loop lane to `entity_id` |
| `loop_id` | cplm-api | registry, CPLM topics | CPLM lane key; mapped to `entity_id` through the loop's Device asset |
| alarm identity `serverId|source|condition` | ams-api / Flink | alarm topics | mapped to `entity_id` through `alias_mapping` (tag → path → external id) when the alarm lane is deployed |
| `context_revision` | Truss (minted), compiler (sealed) | package manifest; every runtime record; issue rows | provenance, "which logic produced this" |
| `package_hash` | compiler | manifest; ACKs; runtime records | activation verification (same role as `bundle_hash`) |

**Attribution map.** The compiler emits, per site, an `attribution` section: `by_asset_uuid`, `by_loop_id`,
`by_uns_path`, `by_alias{source_system: {legacy: entity_id}}`. The runtime job loads it into broadcast
state and resolves every incoming record with the first matching rule; unresolvable records go to
`traverse.cpa.runtime.unattributed-dlq.v1` with the reason, never silently dropped (the fleet audit's
"silent drop" lesson).

## 5. The runtime package (contract v1)

One compacted topic, two record kinds, one envelope. The envelope is the existing `BundleEnvelope`
(`record_kind`, `phase`, `deployment_id`, `bundle_id`, `hash`, `signature` HMAC-SHA256 with
`TRAVERSE_SERVICE_KEY`), so the Flink `BundleBroadcastHandler` logic is reused with a new
`record_kind` switch.

**Manifest record** (key `manifest:<site>`, the activation unit):

```json
{
  "record_kind": "RUNTIME_PACKAGE_MANIFEST", "phase": "PREPARE|APPLY",
  "deployment_id": "…", "bundle_id": "…", "hash": "sha256 of canonical entity set",
  "site": "hdpe", "context_revision": 42, "compiled_at": "2026-10-14T08:00:00Z",
  "truss_export_id": "…", "compiler_version": "1.0.0", "contract_version": "v1",
  "entities": ["hdpe", "hdpe/section_300", "…"],  "entity_count": 205,
  "calendar": { "timezone": "Asia/Riyadh", "shifts": [{"name":"A","start":"07:00","hours":12}, …], "production_day_start": "07:00" },
  "personas": [ { "id": "PLANT_MANAGER", "home_view": "PlantOverview", "default_horizon": "DAY", "priority_metrics": ["production.rate","energy.specific","availability"] } ],
  "views": [ { "id": "PlantOverview", "entity_type": "Plant", "tiles": [ … ], "children_summary": { "fields": ["status","production.rate"] }, "exceptions": { "max": 10 } } ],
  "navigation": [ { "from": "Plant", "on": "tile:production.rate", "to": "KpiBreakdown", "carry": ["entity","from","to","rev"] }, … ],
  "signature": "…"
}
```

**Entity record** (key `entity:<entity_id>`; a tombstone `{"__tombstone":true,"key":"entity:<id>"}` removes it):

```json
{
  "record_kind": "RUNTIME_PACKAGE_ENTITY", "context_revision": 42, "package_hash": "…",
  "entity_id": "HDPE.SECTION_300.U3005", "type": "Unit", "name": "Butene recovery",
  "uns_path": "hdpe/section_300/u3005_butene_recovery", "asset_uuid": "…",
  "parent": "HDPE.SECTION_300", "children": ["HDPE.SECTION_300.U3005.45FIC109", "…"],
  "attribution": { "loop_ids": ["45FIC-109"], "uns_paths": ["hdpe/section_300/u3005_butene_recovery.*"], "aliases": {"ot-gateway": ["45FT109.PV"]} },
  "fields": {
    "production.rate":    { "mode": "source",    "source": "telemetry", "uns_path": "hdpe/section_300/u3005_butene_recovery/prod.rate", "uom": "t/h", "expected_interval_s": 60, "history": "root.runtime.hdpe.u3005.production_rate" },
    "loops.attention":    { "mode": "derived",   "source": "cplm", "reducer": "count_children_where", "args": { "field": "verdict.severity", "in": ["MEDIUM","HIGH"] } },
    "energy.specific":    { "mode": "calculate", "formula": "energy.steam / production.rate", "uom": "t/t", "inputs": ["energy.steam","production.rate"] },
    "status":             { "mode": "derived",   "reducer": "worst_of", "args": { "fields": ["assessments.*"], "children": true } }
  },
  "assessments": {
    "energy_over_target": { "evaluator": "target_deviation", "value": "energy.specific", "target": "targets.energy.specific", "warn_pct": 5, "high_pct": 10, "min_duration_s": 900, "severity": ["MEDIUM","HIGH"] },
    "production_stale":   { "evaluator": "stale", "value": "production.rate", "max_age_s": 300, "severity": ["LOW"] }
  },
  "targets": { "energy.specific": { "value": 0.55, "basis": "PRODUCTION_DAY", "valid_from": "2026-10-01" } },
  "dependencies": { "production.rate": { "aggregation": "sum", "contributes_from": ["HDPE.SECTION_300.U3005.LINE1", "…"], "non_overlapping": true } },
  "views": ["UnitOverview"], "drill": ["UnitToEquipment"]
}
```

Field modes: `source` (a telemetry, loop or alarm value attributed to this entity), `derived` (a reducer
over this entity's other fields or its children), `calculate` (an arithmetic formula over fields; the
existing `ExpressionEvaluator` grammar). Every field value in state and output carries
`{value, uom, ts, quality, freshness, source, context_revision}`.

**Validation performed by the compiler** (NACK-style report, package refused on any error): every
entity has a UNS row (created on demand for Truss-managed entities); every `source` field resolves to
a transport through binding-resolver's batch resolve with `provenance = asset-model`; formulas parse
and reference only declared fields; no cycles in `calculate` or `dependencies`; roll-up contributors
are disjoint; one authoritative definition per (entity, field); calendar and targets have no
overlapping validity; every evaluator and reducer name is in the runtime's CAPABILITY record.

## 6. Runtime job design

`LivingAssetRuntimeJob` (one job, three keyed stages; a second job only if the plant's 16 slots demand it):

1. **Attribute.** Union of sources → `EntityFieldUpdate {entity_id, field, value, uom, ts, quality, source_ts, verified_ts, emission_ts, source}`:
   - `traverse.cpa.telemetry.v1` (already entity-tagged by ingestion; re-checked against the map),
   - `traverse.cpa.clpm.gate.results.v1` → `verdict.*`, `gates.*` fields on the loop entity,
   - `traverse.cpa.clpm.condition.v1` → `condition.*` fields and evidence refs,
   - `traverse.cpa.live.loop.metrics` → `pv/sp/op/vp/mode` on the loop entity (RBE already applied),
   - `traverse.cpa.context.instrument-health.v1` → `health.*` on the loop/device entity,
   - `traverse.alarm.live.alarms` → `alarms.active`, `alarms.unacked` (only when the lane is deployed).
   A `BroadcastProcessFunction` holds the attribution map; unmatched records go to the DLQ topic.
2. **Living object.** `KeyedBroadcastProcessFunction<entity_id>` with `ValueState<EntityState>` (field map,
   open issues, last emission fingerprint) and the package in broadcast state. On each update: write the
   field, recompute `calculate` fields whose inputs changed, evaluate assessments (evaluator library:
   `threshold`, `target_deviation`, `stagnation`, `stale`, `rate_of_change`, `coverage`), open/extend/
   escalate/close issues, emit an `EntityState` record when the fingerprint changes (RBE) and every
   `heartbeat_s` (300 s, the `LoopLiveRbeJob` convention) so freshness is timestamp-driven. Event-time
   timers drive `stale` and `min_duration_s`; calendar timers close production-day and shift windows.
   On a package APPLY the function walks keyed state with `applyToKeyedState` (the instrument-context
   pattern): removed entities are cleared, changed assessments are re-evaluated, `context_revision` bumps.
3. **Roll-up.** Child `EntityState` records are re-keyed by `parent` and reduced per `dependencies`
   (`sum`, `avg`, `weighted_avg`, `worst_of`, `count_where`); the parent update is written back to
   `traverse.cpa.runtime.entity-state.v1`, which the job also consumes, so a four-level plant converges in
   four hops with no cycle inside the graph. Only non-overlapping inputs are summed (tumbling or
   boundary-closed values; sliding CPLM windows are read as "latest", never summed).

Outputs: `entity-state` (compacted, key `entity_id`), `issues` (key `issue_id`, deterministic
`issue:<entity_id>:<assessment>:<open_ts_ms>`, so a resubmit re-emits idempotently), KPI history rows to
IoTDB through `FailLoudIoTDBSink` under `root.runtime.<site>.<entity_slug>.<field_slug>`, ACK/CAPABILITY
to the acks topic. Startup with no savepoint: read the package topic and the entity-state topic to end
offset (the `CplmParameterUpdateReader` pattern) before opening the live sources, so a cold resubmit
restores the last living object of every entity.

Not in this design: Flink CEP (temporal rules are explicit state machines), Postgres writes from Flink,
per-window evidence arrays (issues reference evidence; they do not copy it).

## 7. Issue ledger

`traverse_runtime.issue` is append-only by **revision**: a row per `(issue_id, revision)`, written only
when `status`, `severity` or `assigned evidence` changes (not on every evaluation). Columns: `issue_id`,
`revision`, `entity_id`, `entity_path`, `type` (assessment id), `status` (`OPEN | ESCALATED | RECOVERING |
CLOSED | UNOBSERVABLE`), `severity` (`LOW | MEDIUM | HIGH`), `opened_at`, `closed_at`, `close_reason`,
`description`, `value_at_open`, `target_at_open`, `context_revision`, `package_hash`, `job_build`,
`evidence_refs jsonb[]`, `created_at`. Companion tables: `issue_action` (acknowledge, comment, shelve,
pin; actor, at, note — the `cplm_event_actions` pattern) and `issue_evidence_ref` (typed references:
`alarm{alarm_id, event_time}`, `loop_episode{episode_id}`, `method_run{method_run_id}`, `series{iotdb_path,
from, to}`, `telemetry{entity_id, field, ts}`). Daily partitions on `opened_at` with `retention_policy`
rows (`ISSUES` 180 d, `ISSUE_ACTIONS` 730 d) following `FeaturePartitions`.

`traverse_runtime.entity_state_current`: one row per entity (`entity_id` PK, `state jsonb`,
`context_revision`, `updated_at`, `emission_ts`), upserted by the entity-state consumer; the REST snapshot
reads it, the hub pushes the delta.

## 8. Serving contracts

REST (runtime-api, gateway prefix `/api/runtime`, policy `runtime.view`; writes `runtime.act`):

| Route | Returns |
|---|---|
| `GET /entities/{id}?include=children,issues,views` | living object: `entity_id, type, name, uns_path, context_revision, status, fields{…}, data_quality{coverage,status}, children[{id,type,name,status,summary}], issues[{issue_id,severity,type,opened_at}]` |
| `POST /entities/batch {ids[]}` | the same for ≤ 200 entities (the CHG-024 batch rule: no N+1 from dashboards) |
| `GET /entities/{id}/children?depth=1` | children with summary fields |
| `GET /entities/{id}/hierarchy` | root → entity chain (breadcrumb) |
| `GET /entities/{id}/history?field=&from=&to=&width=` | resolves the field's `history` series and proxies historian-bff `/trend` (envelope on) |
| `GET /entities/{id}/issues?status=&from=&to=` | issue heads for the entity and its subtree |
| `GET /issues/{id}` | full issue with revisions, actions and typed evidence refs, each with a resolvable link (`/api/v1/alarms/historical?…`, `/api/v1/cpm/events/{id}`, `/api/v1/cpm/method-runs/{id}`, `/api/hist/trend?…`) |
| `POST /issues/{id}/actions {kind, note, until?}` | acknowledge / comment / shelve / pin evidence |
| `GET /exceptions?scope=&persona=&limit=` | Top Exceptions: open issues in scope ranked by severity, age and entity level |
| `GET /context/packages/current?site=` (context-compiler) | manifest: personas, views, navigation, calendar, `context_revision` |

SignalR `/hubs/runtime` (gateway route `/hubs/runtime/**` → runtime-api, ordered before `/hubs/**` → ams-api):
`SubscribeEntity(id)`, `SubscribeScope(uns_prefix)`, `SubscribeIssues(scope)`; events `OnEntityState`,
`OnIssueChanged`, `OnHeartbeat`. Groups are real (per entity, per scope), unlike `AlarmHub`'s cosmetic
groups. Scope claims filter subscriptions server-side.

Caching at the gateway: `GET /api/runtime/entities*` 5 s, `/exceptions` 5 s, `/issues/{id}` 30 s,
`/context/packages/current` 60 s; hub never cached. Rate class `read`.

## 9. UI module

Routes (all inside the CPA slice; `SLICE_NAV` extended): `/plant` (persona home: the manifest's
`home_view` for the token's persona), `/plant/kpi/:field` (KPI analysis: breakdown by children over the
time range), `/plant/entity/:id` (generic entity page: tiles, children grid, issues, trends; tabs from the
entity's `views`), `/plant/issues/:id` (issue page: revisions, evidence timeline with each ref rendered by
its domain component). Context is URL-only per the recorded rule: `?entity&from&to&rev&shift&persona`
built by `runtimeHref.ts` from the manifest's `navigation` rules. Persona switch is a top-bar control
(the sidebar stays untouched); switching changes the view, never the scope or permissions. Building
blocks: `KpiTile` gains an optional sparkline fed by `/history`; children grid = the `GateMatrix` ARIA grid
pattern; Top Exceptions = `AttentionList`; trends = `TrendCore`; breadcrumb from `/hierarchy`. Every value
shows `quality` and `freshness` (NE107 badge, stale after `expected_interval_s × 3`).

## 10. Topics and stores (all `traverse.cpa.*`, compacted topics keyed)

| Topic | Key | Policy / retention | Producer | Consumer (group) |
|---|---|---|---|---|
| `traverse.cpa.context.runtime-package.v1` | `manifest:<site>`, `entity:<id>` | compact | context-compiler | runtime job (broadcast) |
| `traverse.cpa.context.runtime-package.acks.v1` | `bundle_id` | 3 d | runtime job | context-compiler (`traverse-cpa-context-acks`, one member) |
| `traverse.cpa.telemetry.v1` | `entity_id` | 12 h, lz4, 16 partitions | ingestion-service | runtime job; (later) IoTDB persistence |
| `traverse.cpa.runtime.entity-state.v1` | `entity_id` | compact | runtime job | runtime-api (`traverse-cpa-runtime-state`, one member); runtime job (roll-up feedback + restore) |
| `traverse.cpa.runtime.issues.v1` | `issue_id` | 3 d | runtime job | runtime-api (`traverse-cpa-runtime-issues`, one member) |
| `traverse.cpa.runtime.unattributed-dlq.v1` | source key | 3 d | runtime job | manual |
| `traverse.cpa.audit-events` (existing) | – | 3 d | compiler, runtime-api | audit-service |

| Store | Contents | Retention |
|---|---|---|
| `traverse_context` (Postgres) | `truss_export`, `runtime_package` (manifest + hash + revision), `package_entity`, `package_deployment`, `worker_ack`, `worker_capability`, `persona`, `view_definition`, `drill_rule`, `responsibility_assignment`, `validation_report` | packages 10 revisions + active; exports 90 d |
| `traverse_runtime` (Postgres) | `entity_state_current`, `issue` (daily partitions), `issue_action`, `issue_evidence_ref`, `retention_policy` | 180 d issues, 730 d actions, current state unbounded (one row per entity) |
| IoTDB `root.runtime` | `root.runtime.<site>.<entity_slug>.<field_slug>` KPI/field history | database TTL 730 d (separate database because 1.3.2 cannot set sub-tree TTLs) |
| Redis | none new | – |

## 11. Sequences

**Publish a revision.** Truss export → `POST /api/context/imports` (file or URL) → compiler validates,
projects entities into asset-model (`POST /assets/project`), resolves bindings (`/api/bindings/resolve/batch`),
writes `runtime_package` + entities, publishes `PREPARE` records → runtime job verifies signature and
capability, ACKs → compiler publishes `APPLY` → job swaps broadcast state at `effective_from`, walks
keyed state, ACKs → deployment `ACTIVE_VERIFIED` when an entity-state record with the new `package_hash`
arrives (the probe-window rule) → audit `CONTEXT_PACKAGE_ACTIVATED`. Rollback = redeploy the previous package.

**A value reaches a dashboard.** OT MQTT → ingestion telemetry profile → `traverse.cpa.telemetry.v1`
(`entity_id`, `field`, `uom`, quality, three timestamps) → runtime job stage 1 attributes → stage 2 updates
`production.rate`, recomputes `energy.specific`, evaluates `energy_over_target` → emits `EntityState` →
runtime-api upserts `entity_state_current` and pushes `OnEntityState` to the entity's and its ancestors'
groups → the Plant Manager tile re-renders with value, uom, quality and freshness; stage 3 rolls the unit
into the area and the plant.

**An issue's life.** Assessment breaches for `min_duration_s` → `issue` revision 1 `OPEN` with
`value_at_open`, `target_at_open`, `context_revision`, evidence refs (the telemetry sample, the loop
episode if any) → severity rises → revision 2 `ESCALATED` → value returns within band for the recovery
support → `RECOVERING` → `CLOSED` with `close_reason`; operator actions append to `issue_action`; the
issue page renders each evidence ref through its own domain view (alarm history row, loop episode with
its captured method run, historian trend).

**A drill.** Plant Manager clicks the specific-energy tile → `navigation` rule `tile:energy.specific →
KpiBreakdown` → `/plant/kpi/energy.specific?entity=HDPE&from=…&to=…&rev=42` → breakdown by `children`
using `POST /entities/batch` → click a unit → `/plant/entity/HDPE.SECTION_300.U3005?from=…&to=…&rev=42`
(same window, same revision) → click an exception → `/plant/issues/issue:…`. Persona switch keeps
`entity`, `from`, `to`, `rev`.

## 12. Deployment view (Compose, Marun overlay)

New compose services `traverse-context-compiler` and `traverse-runtime-api` (no host ports; `/health`
via `/dev/tcp`; `Auth__*`, `Kafka__BootstrapServers`, `ConnectionStrings__*`; `TRAVERSE_SERVICE_KEY` for
signing); gateway routes `api-context`, `api-runtime`, `hubs-runtime`; `prodimages.BUILD_SERVICES` +
Marun overlay blocks; `lib.sh TRAVERSE_DBS` + `02-apply-schemas.sh` sentinels + `05-validate.sh` for the
two databases; `topics.txt` rows + `04-create-kafka-topics.sh`; `04b` submits `LivingAssetRuntimeJob`
after Fusion; `RUNTIME_PACKAGE_KEY=TRAVERSE_SERVICE_KEY` on JM/TM; `iotdb-init-ttl.sh` creates
`root.runtime` with its TTL; a `pg_dump` cron for `traverse_context` and `traverse_runtime`; env knobs
`RUNTIME_HEARTBEAT_S`, `RUNTIME_EMIT_HISTORY`, `START_RUNTIME=yes`.

Capacity at HDPE scale (1 site, 8 areas, 26 units, ~170 loops, ~200 telemetry points): ~400 entities,
entity-state records ≈ 5 KB → compacted topic < 5 MB; issues at a few hundred per day → < 10 MB/day;
IoTDB history ≈ 200 fields × 1/min ≈ 0.3 M points/day; Flink state < 100 MB; one extra job at
parallelism 2 fits the remaining 9 free slots. Disk budget: < 1 GB/month for the runtime databases with the
retention above, to be measured on the lab before the release (the `prod_decision.md` §3 discipline).

## 13. Deviations from the pitch, and why

| Pitch | Here | Reason |
|---|---|---|
| Kafka Connect MQTT source + `source/*` topics | `ingestion-service` profiles + `traverse.cpa.telemetry.v1` | shared broker prefix guard; the custom service already joins, maps roles, decodes quality, DLQs |
| MQTT `traverse/runtime/*` for the UI | SignalR `/hubs/runtime` + REST snapshot | EMQX ACL is `spBv1.0/#`, the browser decoder is Sparkplug-only, SignalR is the proven push path |
| GraphQL | REST with `include` and batch | gateway caching, rate classes and the existing API style |
| Flink CEP | explicit state machines | no `flink-cep` today; the fleet's patterns are state machines |
| Flink writes the state store | Flink → Kafka → single-member consumer → Postgres | the "Postgres is written only by projection consumers" rule and the consumer-group discipline |
| Liquibase | numbered SQL, four copies | the release process of record |
| Savepoint upgrades | rebuild from compacted topics | no HA at the plant |
| PI Web API | none | no PI system exists; IoTDB is the historian |
| Per-entity package files | per-entity records under one manifest key | compaction keyed by entity gives tombstones and partial updates for free |
