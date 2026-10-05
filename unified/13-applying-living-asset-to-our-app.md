# Applying the "Living Asset" concept to our app (AMS / Traverse)

Written 2026-10-04. This answers one question: **if we want the Living Asset idea (live state + issues per
asset, persona dashboards, drill) inside the app we already run in production, how does it work with
what we have?** It covers how the context is built, how ingestion works, what happens to the asset-model
service and the control loops we configure today, how live data reaches the screen, and the questions to
settle before building.

It builds on the earlier analysis in this folder: [10](10-truss-concept-map-and-gap-analysis.md) (gap
analysis, decisions D-01…D-12), [11](11-target-architecture.md) (target architecture) and
[12](12-implementation-plan.md) (phased plan). The evidence for every "today" statement is in reports
`01`–`09`, cited as `path:line`.

---

## 1. Short answer

- **We already have half of it.** Our app already has a plant tree (asset-model, HDPE with Unit 3002), a
  streaming lane (OT MQTT → ingestion-service → Kafka → Flink → cplm-api → UI), and a governed, signed,
  versioned configuration channel into Flink with an activation handshake (the CPLM gate-config bundles).
  These are the "context", "ingestion" and "compiler" parts of the sandbox pitch.
- **What is missing** is the *living asset* layer itself: a Flink job keyed by **entity** (plant / area /
  unit / equipment / loop) that combines all inputs into one state per asset, rolls children up to
  parents, and opens evidence-backed **issues**; a small service that serves that state; and persona
  pages on top.
- **Do not copy the sandbox's stack choices into our app.** Kafka Connect, `source/*` topics, GraphQL, SSE,
  its own JWT and its own Postgres on port 5435 all clash with how our production is set up (shared
  Kafka with a `traverse.cpa.*` prefix rule, edge-only auth at the gateway, SignalR push, one logical DB per
  service). We keep the *concept* and implement it with *our* pieces (table in §3).
- **The sandbox can still be built safely inside our app**: new services and a new Flink job behind a
  `START_RUNTIME` knob, new databases (`traverse_context`, `traverse_runtime`), new topics only. Nothing
  existing changes until the flag is on (§9).

---

## 2. The idea in our words

```text
Plant map (who/what/where)        →  "context"   : asset-model tree + loop registry (+ Truss later)
Live numbers (what is happening)  →  "ingestion" : OT MQTT → ingestion-service → Kafka
Brain (state + issues)            →  "runtime"   : Flink (CPLM jobs today + NEW LivingAssetRuntimeJob)
Screens (who sees what)           →  "serving"   : gateway → runtime-api (NEW) → /plant/* pages (NEW)
```

The difference from what we run today is the **key**. Today every stream is keyed by its *own* id:
loops by `loop_id`, alarms by `serverId|source|condition`, live values by a Sparkplug device. Nothing is
keyed by "Unit 3002". The living asset layer adds **one key for everything: the entity id**, so a unit can
say "3 of my loops need attention, 1 transmitter is NE107 Failure, level is 55 %, 2 issues open".

---

## 3. Sandbox pitch vs our app, component by component

| Sandbox pitch | What we have today | What we do in our app | Why |
|---|---|---|---|
| Sandbox-Truss (copy of HDPE tree inside `living_asset` DB) | `traverse_assets.assets` already holds the HDPE tree (1 site, 8 areas, 26 units incl. `hdpe/section_300/u3002_hexane_purification_ii_adsorbtion`) | asset-model **is** our context source in phase 1; Truss feeds it later via an export | the tree is already in prod and every service derives transport from it |
| Compiler → versioned package on Kafka + Flink ACK | CPLM signed bundles on compacted `traverse.cpa.context.gate-config.v1`, PREPARE/APPLY → ACK/NACK | NEW `context-compiler` service reusing that exact pattern; new topic `traverse.cpa.context.runtime-package.v1` | proven at the plant; no second control plane |
| MQTT sim → **Kafka Connect** → Kafka | `ingestion-service` (MQTTnet, QoS 1, 5 s loop joiner, role mapping, quality decoding, DLQ) | add a **telemetry profile** to ingestion-service → `traverse.cpa.telemetry.v1`; simulator = `ams-sims` | shared plant Kafka only allows `traverse.cpa.*`/`traverse.ingestion.*`; no Connect anywhere; our service already does more |
| Flink job keyed by entity + CEP rules | 7 CPLM jobs keyed by loop; no CEP | NEW `LivingAssetRuntimeJob` keyed by `entity_id`; rules as explicit state machines | CPLM jobs stay untouched and become **inputs** |
| State + issue tables | `analytics.cplm_event_frames` (loop-only issue ledger) | NEW `traverse_runtime` DB: `entity_state_current`, `issue`, `issue_action`, `issue_evidence_ref` | event frames are the template, not the ledger |
| Living API: REST + GraphQL + SSE | REST through the gateway; SignalR for alarms | NEW `runtime-api`: REST `/api/runtime/*` + SignalR `/hubs/runtime` | gateway caching/rate classes; SignalR is the proven push path |
| History: PI simulator | IoTDB + historian-bff (no PI at the plant) | history via historian-bff; KPI history in IoTDB `root.runtime` | no PI system exists |
| Own JWT users (`pm_hdpe`, `ops`, `admin`) | auth-service + gateway, edge-only, roles + ~38 permissions, **no scope** | add `scope[]` (UNS prefixes) + `persona` claims; gateway injects `X-Auth-Scope/Persona` | decision #16: only the gateway validates JWTs |
| Port 8001, own network | everything behind gateway :8081 | new routes `/api/context`, `/api/runtime`, `/hubs/runtime` | Plan 04 lockdown: no new host ports |
| OpenBridge widgets in a sandbox shell | frontend-ob with OpenBridge (`KpiTile`, `GateMatrix`, `AttentionList`, echarts trends) | new `/plant/*` module in frontend-ob | same design system, same rules |

---

## 4. How we build the context

### 4.1 What "context" means here

Context = everything the runtime needs to know that does not change every second:

1. **Entities**: plant, section (area), unit, equipment/device, control loop, measurement — with a stable id.
2. **Relationships**: contains (tree), loop → its signals (PV/SP/OP/VP/MODE), loop ↔ loop (cascade,
   upstream), instrument → signal.
3. **Fields per entity**: which live value or calculation each entity exposes (`level`, `production.rate`,
   `loops.attention`, `health.ne107`).
4. **Assessments**: rules that open issues (`level out of band`, `device health bad`, `loop oscillating`).
5. **Roll-up rules**: how a unit summarises its children (worst-of, count, sum — only non-overlapping).
6. **Personas, views, drill rules, targets, shift calendar.**

### 4.2 Where each piece lives today

| Context piece | Today | Gap |
|---|---|---|
| Entities + tree | `traverse_assets.assets` (Site/Area/Unit/Device/Measurement, path = identity) | no stable external id, no version/revision |
| Loops | `traverse_cplm.cpm.loop_registry` (+ `asset_id` soft link to the Device row) | loops are not "entities" outside CPLM |
| Loop → signals | `cpm.loop_tag_map` (roles), signal projection creates `CpmLoop` Device + `CpmLoopSignal` Measurements in asset-model | already good |
| Loop ↔ loop | `assets.asset_relationships` → projected to `cpm.loop_link` | already good |
| Instrument → signal | `cpm.signal_device_binding_history` (effective-dated) + NE107 ledger | already good |
| External names | `assets.alias_mapping` (`instrumental-pro`, `ot-gateway`) | ingestion never reads it today |
| KPIs, targets, assessments | compiled in Java (CPLM gates) | **missing** as data |
| Personas, views, drill | hard-coded (`cpaHref.ts`), roles without scope | **missing** |
| Revision | `bundle_hash` + `context_revision` on CPLM results only | **missing** on the tree |

### 4.3 How the context gets built (the compile step)

```text
asset-model tree  ┐
loop registry     ├─► context-compiler (NEW) ──validate──► runtime package (per entity) ──► Kafka (compacted, signed)
aliases/relations ┘        ▲                                                                   │
Truss export (later) ──────┘                                                                   ▼
                                                               LivingAssetRuntimeJob: PREPARE → ACK → APPLY → ACK
```

1. The compiler reads the tree from asset-model (by REST), loops from cplm-api, relationships and aliases.
2. It builds one **entity record** per node: id, type, UNS path, parent, children, fields, assessments,
   roll-up rules, plus an **attribution map** (`loop_id → entity`, `asset_uuid → entity`, `uns_path → entity`,
   `alias → entity`) so Flink can attach every incoming record to the right asset.
3. It validates (every source field resolves through binding-resolver, formulas parse, no cycles, roll-up
   contributors don't overlap), seals the package with a `context_revision` and hash, signs it, and
   publishes PREPARE/APPLY. Flink ACKs. Same handshake the CPLM bundles use today.
4. A change (new loop, new KPI target, renamed unit) = a new revision → PREPARE/APPLY → Flink re-evaluates
   **without a restart**.

### 4.4 Where Truss fits

The pasted doc treats Truss (KG-explorer, `kg_explorer` DB) as the plant map. Our asset-model also holds
the HDPE map. Two masters for the same tree is the biggest design risk. Recommendation (D-01 in doc 10):

- **Phase 1–3: asset-model + loop registry are the context source.** We can prove the whole living asset
  idea on data the plant already has, without Truss.
- **Later: Truss owns the model** (entities, KPIs, targets, personas) and sends a versioned **export**
  (JSON file at the air-gapped plant, HTTP in the lab). The compiler writes those entities into
  asset-model with `external_source='truss'`, `external_id=<truss id>`. asset-model stays the **transport
  projection** (paths, overrides) that every existing service already uses.

---

## 5. What happens to the asset-model service and the loops we configure

### 5.1 asset-model

It stays, with no change to existing behaviour. Small additions:

| Change | Purpose |
|---|---|
| columns `external_source`, `external_id`, `context_revision` | stable entity id that survives renames; the Flink key |
| `GET /assets/export?site=` | the compiler (and Truss round-trips) read the whole tree at once |
| `POST /assets/project` (idempotent bulk upsert by external id) | the compiler (or Truss) writes Truss-managed nodes |
| still publishes Redis `asset-events` | gateway cache bust unchanged |

Displays keep binding by UNS path. Persona pages bind by `entity_id + field`. Both work side by side.

### 5.2 A loop we configure in the app — before and after

Today, when an engineer creates and activates a loop in **CPM → Loop Registry**
([LoopRegistry.tsx](../src/frontend-ob/src/components/Cpm/LoopRegistry.tsx)):

1. cplm-api writes `cpm.loop_registry` + `cpm.loop_tag_map` (PV/SP/OP/VP/MODE paths).
2. On activation it validates the site/area/unit exists in asset-model, then **projects** a `CpmLoop`
   Device and five `CpmLoopSignal` Measurements into asset-model (signal projection, "Option C").
3. ingestion-service refreshes its cached loop list and starts joining OT MQTT messages for that loop
   into `traverse.cpa.loop.samples.v1`.
4. The 7 CPLM Flink jobs evaluate it; results/episodes land in `traverse_cplm`; `/cpm/*` pages show them.

With the living asset layer, **steps 1–4 do not change**. Added after them:

5. The compiler sees the new loop (by registry or a new revision) and adds an entity record
   `type=ControlLoop`, parent = its Unit, attribution `loop_id=45FIC-109 → entity`.
6. The runtime job attaches CPLM outputs to that loop entity as **fields**, and rolls them up to the
   unit, section and plant.

| CPLM output (existing topic) | Becomes field on the loop entity | Rolls up to the unit as |
|---|---|---|
| `traverse.cpa.live.loop.metrics` (PV/SP/OP/VP/MODE, RBE) | `pv`, `sp`, `op`, `vp`, `mode` | — (not summed) |
| `traverse.cpa.clpm.gate.results.v1` | `verdict.severity`, `gates.*` | `loops.attention` = count where severity ∈ MEDIUM/HIGH |
| `traverse.cpa.clpm.condition.v1` | `condition.*` + evidence ref | `conditions.open` |
| `traverse.cpa.context.instrument-health.v1` | `health.ne107`, `eligibility` | `instruments.bad` |
| (monitoring flag, data freshness) | `freshness`, `quality` | `loops.monitored`, `coverage` |

So **a loop becomes one living asset among others**, and the unit, section and plant get real, non-simulated
KPIs from day one. Sliding CPLM windows are read as "latest", never summed (otherwise totals double count).

### 5.3 Other objects

| Object in our app | In the living asset model |
|---|---|
| Site `hdpe` | Plant entity (roll-up root) |
| Area `section_300` | Section entity |
| Unit `u3002_…` | Unit entity (main Plant Manager drill target) |
| Device (transmitter, pump, `CpmLoop`) | Equipment / Instrument / ControlLoop entity |
| Measurement (`.pv`, `.level`) | **field** of its parent entity, not a separate entity |
| Alarm (`tag_name`) | `alarms.active/unacked` fields via alias → path → entity — only once the alarm lane runs at the plant (today lab-only) |
| HMI display | unchanged (path bindings); a display can be linked from an entity page |
| CPLM event frame / episode | evidence reference inside a living-asset issue |

---

## 6. How ingestion works and how live data connects

### 6.1 Today

```text
Instrumental OT broker (mosquitto, OT/HDPE/…)  ──► ingestion-service profile MQTT_LOOP_SAMPLES ──► traverse.cpa.loop.samples.v1 ──► CPLM jobs
traverse/instrumental/v1/… (NE107)             ──► ingestion-service profile INSTRUMENTAL_HEALTH ──► instrument-health topics
MQTT_TELEMETRY / MQTT_ALARMS / MQTT_PRM        ──► config only, no subscriber pipeline yet
traverse.live.metrics                          ──► written only by a lab simulator; no production producer
```

The plant today ingests **loop data and instrument health only**. There is no production counter, energy
meter, tank level stream or availability signal anywhere in the pipeline.

### 6.2 With the living asset layer

```text
OT MQTT (loops)        → ingestion-service MQTT_LOOP_SAMPLES (unchanged) → loop.samples → CPLM jobs ─┐
OT MQTT (NE107)        → ingestion-service INSTRUMENTAL_HEALTH (unchanged) → instrument-health ──────┤
OT MQTT (levels, flow, → ingestion-service MQTT_TELEMETRY (NEW wiring)                               ├─► LivingAssetRuntimeJob
 production, utility)     topic → field map, quality decode, entity lookup                           │      (keyed entity_id)
                          → traverse.cpa.telemetry.v1 {entity_id, uns_path, field, value, uom,       │
                            quality, source_ts, verified_ts, emission_ts}  (+ DLQ) ─────────────────┘
```

How a raw MQTT message finds its asset:

1. The data source config (`/api/ingestion`) has a `topic_template` that captures parts of the topic
   (as the loop profile does with `{site}{fcs}{loop}{param}`) and a parameter → field map.
2. The captured tag is resolved to a UNS path by `alias_mapping` (source `ot-gateway`) or by the path
   itself, then to `external_id` by a cached asset-model lookup.
3. The record is stamped with `entity_id` and produced to `traverse.cpa.telemetry.v1`.
4. Anything that can't be resolved goes to the DLQ with the reason — **never silently dropped**.
5. The runtime job re-checks against its attribution map; still-unmatched records go to
   `traverse.cpa.runtime.unattributed-dlq.v1`.

Simulation for the lab = an `ams-sims` script (`sim_living_asset.py`) publishing level, device health,
production and steam on the lab mosquitto, playing the role of the pitch's "MQTT sim".

### 6.3 From Flink to the screen

```text
LivingAssetRuntimeJob ─► traverse.cpa.runtime.entity-state.v1 (compacted, key entity_id) ─► runtime-api ─► Postgres entity_state_current
                     ─► traverse.cpa.runtime.issues.v1 (key issue_id)                    ─► runtime-api ─► Postgres issue (+ actions, evidence)
                     ─► IoTDB root.runtime.<site>.<entity>.<field> (KPI history)       ─► historian-bff
runtime-api ─► REST snapshot  GET /api/runtime/entities/{id}?include=children,issues
            ─► SignalR /hubs/runtime  OnEntityState / OnIssueChanged (groups per entity and per scope)
frontend /plant/* ─► loads snapshot once, then applies pushed deltas (no polling, no full reload)
```

The job emits a state record only when something changed (RBE) plus a heartbeat every 300 s, so the UI can
show **stale** honestly instead of showing an old value as live.

---

## 7. Worked example — Unit 3002

Entity `HDPE.SECTION_300.U3002` (path `hdpe/section_300/u3002_hexane_purification_ii_adsorbtion`).

1. Context: compiler emits the unit with children (its loops and transmitters), fields
   `loops.attention`, `instruments.bad`, `status`, and (when the source exists) `level` on the adsorber
   vessel with assessment `level_out_of_band {threshold lo/hi, min_duration_s 300}`.
2. Live: a loop under 3002 gets a HIGH oscillation verdict from Gate Fusion → runtime job sets
   `verdict.severity=HIGH` on the loop → unit `loops.attention` goes 0 → 1 → section and plant update
   in the next hops.
3. Issue: the vessel level stays above hi for 5 min → issue `OPEN` with value at open, limit, the
   `context_revision`, and evidence refs (telemetry sample, IoTDB series range, the loop episode if any).
4. Screen: Plant Manager tile "units needing attention" ticks up → click → Section 300 → Unit 3002 →
   the issue → evidence trend (historian-bff). The URL carries `?entity&from&to&rev` so every drill
   keeps the same window and revision.
5. Persona switch to Maintenance: same entities and same values, different tiles first (NE107 health,
   open conditions). Switching never widens what the user is allowed to see.

---

## 8. What is new, what is updated, what stays

| New | Updated | Unchanged |
|---|---|---|
| `context-compiler` + `traverse_context` DB | asset-model (external id, export, project) | 7 CPLM jobs, cplm-api, CPM pages |
| `LivingAssetRuntimeJob` (Flink) | ingestion-service (telemetry profile) | binding-resolver, historian-bff (tiny prefix change) |
| `runtime-api` + `traverse_runtime` DB + `/hubs/runtime` | auth-service + gateway + `TraverseAuth.cs` (scope, persona) | HMI designer and displays (path bindings) |
| topics `runtime-package(.acks)`, `telemetry`, `entity-state`, `issues`, `unattributed-dlq` (all `traverse.cpa.*`) | frontend-ob (`/plant/*`, `KpiTile` sparkline) | sparkplug-edge-node, alarm lane |
| IoTDB `root.runtime` (own TTL) | `migration/` pack (DBs, topics, job roster, env) | Kafka/EMQX/IoTDB/Postgres clusters (shared infra) |

Each release follows our rules: schema in four copies, `changes_tracker.md` CHG entry with services and
plant scripts in order, `prod_decision.md` rows for every retention value, topic and setting.

---

## 9. Running it as an isolated sandbox **inside** our app

The pasted doc's isolation goal is right; the way to reach it here is a flag, not a second stack:

| Isolation need | How in our app |
|---|---|
| Don't touch prod hierarchy | compiler only **reads** asset-model in sandbox mode (`CONTEXT_PROJECT_WRITES=false`); Truss-managed writes come later |
| Own database | `traverse_context`, `traverse_runtime` (per-service DB rule) |
| Own topics | new `traverse.cpa.runtime.*` / `context.runtime-package*` only; no existing topic gets a new producer |
| Own compute | one new Flink job, submitted last, parallelism 2 (fits the free slots) |
| Off switch | `START_RUNTIME=no` (plant default until approved); persona pages hidden behind the CPA slice flag |
| Simulated data | lab mosquitto + `ams-sims`; at the plant, phases 1–3 use only real loop/NE107 data — no simulated numbers in prod |

---

## 10. Questions to ask (and settle) before building

### A. Context and ownership
1. Who is the **master of the plant tree**: our asset-model, or Truss (KG-explorer)? If Truss, does
   asset-model become a projection written only by the compiler?
2. Can Truss produce a **versioned export** (JSON) with stable ids, and can that file be carried to the
   air-gapped plant? Who approves a revision?
3. Is Truss's Unit 3002 subtree the same as ours (same units, same instruments)? Who reconciles differences?
4. What is an **entity** for us: do Measurements become entities, or fields on their Device? (Proposal: fields.)
5. Do we need "as-of" (what did the model look like last month) now, or later?

### B. Loops and the asset model
6. Is a control loop an entity of its own, or a field group on its unit? (Proposal: its own entity, child of the unit.)
7. When a loop is activated/retired in Loop Registry, should the living-asset package update **automatically**,
   or only on an engineer-approved revision?
8. Which CPLM results count at unit level (verdict only? conditions? instrument health?), and how do they
   combine into one unit `status`?
9. Should loop ↔ loop relations (cascade, upstream) propagate issues (root cause), or only be shown?

### C. Ingestion and live data
10. Which live signals does the Plant Manager actually need (production rate, tank level, steam, power,
    availability)? **Do they exist on any MQTT broker today?** Who owns them (Instrumental / plant OT team)?
11. What is the topic layout and payload of those signals, and how is quality encoded?
12. Expected update rate per signal (sets stale thresholds, topic sizing, IoTDB volume).
13. Do we store raw telemetry history in IoTDB under the UNS tree, or only KPI history in `root.runtime`?
14. Are we OK **not** using Kafka Connect (shared broker prefix rule, ingestion-service already does joining,
    quality, DLQ)?
15. Should alarms feed living assets? The alarm lane is not deployed at the plant — is deploying it in scope?

### D. KPIs, rules and issues
16. Who defines KPI formulas, targets and limits — engineers in our app, or Truss? Where are they approved?
17. Which assessment types do we need first (threshold, target deviation, stale, stagnation, rate of change)?
18. Issue lifecycle: who acknowledges/shelves/closes? Does an issue relate to CPLM episodes (link, merge, or both)?
19. Retention: how long to keep issues, actions, KPI history? (Proposal: issues 180 d, actions 730 d, KPI 730 d.)
20. Shift calendar and production day start — who owns them?

### E. Personas, UI and security
21. Which personas first (Plant Manager, Operations, Maintenance, Shift Supervisor)? What are each one's top 5 tiles?
22. Do users need **scope** (only Section 300)? Who assigns responsibility (`pm_hdpe` → whole plant)?
23. Is the `/plant/*` module inside the CPA slice, or a separate menu entry (sidebar rule)?
24. Should non-browser consumers (another system) receive living-asset state over MQTT? (Deferred by default.)

### F. Production and operations
25. Disk budget on the shared plant host (~25 GB free historically) for the new DBs, topics and IoTDB tree?
26. Flink slots: is one more job acceptable on the single TaskManager?
27. Backups for the new DBs — are we starting the plant's first scheduled `pg_dump` here?
28. Release numbering: one release per phase (v2.7 compiler, v2.8 runtime, v2.9 personas)?
29. Acceptance demo: what exactly must management see, on which data (real loop data vs simulated levels)?

---

## 11. Suggested order

| Step | Delivers | Needs |
|---|---|---|
| 0. Decide | answers to §10 A, C-10, D-16, E-21; decisions recorded in `MIGRATION_LOG.md` | you + plant OT |
| 1. Identity + compiler | entity ids on asset-model, signed package, Flink ACK (stub job) | — |
| 2. Runtime + runtime-api | real living objects for plant/section/unit/loop from CPLM + NE107 data; issues; REST + SignalR | step 1 |
| 3. Persona pages | Plant Manager / Ops / Maintenance views, drill, scope | step 2 |
| 4. New data | telemetry profile, production/level/utility signals, calculated KPIs | step 1 + data sources from Q10 |
| 5. Harden | notifications, backups, as-of, retire analysis-service | steps 2–3 |

Details, estimates, plant scripts and acceptance per step: [12-implementation-plan.md](12-implementation-plan.md).
