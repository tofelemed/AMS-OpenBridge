# **Executive Summary** 

We design a **living-asset system** where _Truss_ holds the canonical plant model (assets, hierarchies, KPIs and bindings) and a real-time engine (Flink) maintains each asset’s current state and issues. Assets range from the plant itself down to units, equipment, loops and instruments. The system flow is: 

1. **Truss data model** defines all assets, relationships and KPI definitions (production, energy, etc.), along with source bindings (e.g. MQTT topics for live data or PI links for history). Each object is versioned with effective dates (bitemporal context). 

2. A **Truss-to-runtime compiler** validates these definitions and emits a versioned _runtime package_ (YAML/JSON) containing asset IDs, field definitions, data sources, calculation rules and navigation rules. 

3. A **Kafka Connect** MQTT source ingests all real-time topics (DCS, alarms, APM, etc.) into Kafka with at-least-once semantics (using persistent sessions)【22†L40-L49】. 

4. **Apache Flink** consumes this data plus the broadcasted runtime package. Flink partitions state by asset ID, applies keyed state for each object, and uses the broadcast-state pattern (inmemory) to hold configuration【23†L83-L88】. It performs time-aligned updates, applies rules/ evaluators (ratios, thresholds), and generates “issue/episode” events when problems are detected. Flink outputs the latest asset state to a serving store (or MQTT) and logs issues. 

5. Historical data (from PI/IoTDB) is accessed via data-contract APIs when needed, not continuously processed. 

6. A **Dashboard API (REST/GraphQL)** serves live asset states and history to the Unified UI. The UI (built on the OpenBridge design system【27†L49-L53】) presents persona-specific dashboards. Each dashboard is a view over the same underlying objects; it requests semantic metrics (e.g. <mark>`plant.specific_energy` )</mark> rather than raw tags. Drilling navigates by preserving entity IDs, 

time context and context revision. 

This specification document details each component. It includes complete schemas, data flows, API contracts, example configs, and even a runnable mini-simulation (ammonia plant with 2 units, 1 compressor, 1 instrument) so that development teams can implement and test end-to-end. The goal is a **connected management system** : one living asset model, different responsibility-specific views, and drill-down from high-level KPIs to the exact supporting evidence. 

# **1. System Overview and Architecture** 

**Goals:** Build a unified system where (a) **Truss** defines the asset context (plant model, identities, approved calculations), (b) a **real-time engine** maintains each asset’s current state and flags issues, and (c) a **Dashboard/UI** presents tailored views (Plant Manager, Operations, Maintenance, Shift Supervisor) for the same underlying data. Assets are **living** (continuously updated) not static. 

#### **Components:** 

- **Truss (Context Model):** Graph/DB of assets (Plant, Units, Equipment, Instruments, Loops, etc.), KPI definitions (Production, Specific Energy, etc.), and **Bindings** linking these to data sources (PI/ AF, MQTT topics). Truss supports _versioned context_ (a context revision with effective-from and -to dates) so that historic views use the proper historical bindings. 

1 

- **Truss-to-Runtime Compiler:** Validates Truss definitions (no cycles, all inputs bound), resolves calculations and aggregation rules, and emits a **runtime package** (versioned config). 

- **MQTT/Kafka Ingestion:** Real-time process data (alarms, process variables, control loop KPIs, APM results, etc.) are published to MQTT by source systems. A **Kafka Connect MQTT Source** ingests these topics into Kafka, supporting at-least-once delivery (persistent sessions)【22†L40L49】. This makes Kafka the ingestion backbone. 

- **Flink Real-Time Engine:** A single shared Flink application (or segmented by plant/site) that: 

- Consumes _data topics_ from Kafka (keyed by asset/variable) and a _broadcast config topic_ (the runtime package). 

- Maintains **keyed state** per asset ID for current values, and **broadcast state** for configuration/ rules【23†L83-L88】. 

- 

- Aligns time (with watermarks, late-handling), computes derived KPIs (ratios, integrals), applies anomaly or threshold checks, and detects patterns via CEP. 

- Manages an **issue ledger** : each detected concern spawns or updates an issue record (ID, status, affected asset(s), evidence). 

- Publishes the **latest asset state** (and new/updated issues) to a serving interface and a curated MQTT namespace. 

- **Data Storage:** The current state is held in Flink state (and optionally projected to a store). Historical trends remain in PI/IoTDB; the API retrieves them on demand. The issue/episode ledger can be stored in a database (e.g., Postgres) for persistence. 

- **API Layer:** A **GraphQL/REST API** serves the UI. It combines context (from Truss), live state (from Flink/state), and historical data. Clients can query entities, metrics, and issue details. A **Realtime Gateway** pushes updates via WebSocket or Server-Sent Events from the runtime MQTT or state changes. 

- **Unified UI (OpenBridge-based):** The UI uses OpenBridge components (cards, grids, charts) for consistency【27†L49-L53】. The **Plant Manager dashboard** shows KPIs (production vs plan, specific energy, unit status) and top exceptions. Drill-down flows preserve context (selected plant/unit, time range, etc.). Other personas (Operations, Maintenance, Shift) reuse the same objects but with different dashboard templates. 

- **Security & Ops:** All communication uses TLS. Clients authenticate (e.g. OAuth2/JWT) and see only authorized data. The system is deployed on containers/k8s with monitoring, logging and automated CI/CD. Flink uses savepoints for upgrades, and context/schema changes follow controlled versioning. 

The following Mermaid diagram illustrates the high-level flow: 

#### `graph TD` 

- `A[Truss Context Model\n(Assets, KPIs, Bindings)] -->|Publish config| B[Runtime Compiler]` 

```
  B -->|Versioned Package| C(Kafka Context Topic)
```

- `A -->|GraphQL/REST queries| H[Dashboard API]` 

```
  subgraph "Data Ingestion"
```

```
    D[Mqtt Brokers (DCS, APM, Alarms, etc.)] -->|MQTT| E[Kafka Connect]
```

- `E -->|Kafka Topics| F[Kafka Brokers]` 

2 

```
  end
  F --> G[Flink Engine]
  C --> G
  G -->|Current state & issues| I[State Store / DB]
  G -->|Updates| J[Runtime MQTT]
  I --> H
  J --> H
  H --> UI[Unified UI (OpenBridge)]
  H -->|History queries| K[PI/IoTDB (historical)]
  A -->|Context queries| I
  A -->|Context queries| UI
```

_Figure: System architecture with Truss, ingestion, Flink runtime, APIs and UI._ 

# **2. Truss Canonical Data Model** 

The **Truss model** defines the “living asset” structure. It is a graph of typed entities (nodes) and relationships. Key aspects: 

- **Asset Entities:** Entities include _Plant, Unit, Section, System, Equipment, Instrument Position, Instrument Device, Control Loop, Signal, Analytical Model (APM)_ , etc. Each has immutable <mark>`entity_id` ,</mark> type, properties (e.g. name, design attributes) and context version metadata. 

- **Containment Hierarchy:** <mark>`Plant CONTAINS Unit, Unit CONTAINS (Sections/Systems/ Equipment), Equipment CONTAINS Instrument Positions, Control Loops` .</mark> (Truss may have multiple typed containment relationships rather than a single tree, supporting multiple hierarchies like physical vs process connectivity.) 

- **Relationships:** Other relations include: <mark>`EQUIPMENT_HOUSES Instrument, SIGNAL_PRODUCED_BY Instrument, SIGNAL_USED_BY Loop, MODEL_EVALUATES Equipment, KPI_EVALUATES Entity, Asset_PROVIDES_GOODS_FOR ProductionActivity` ,</mark> etc. Relationships carry semantic meaning (e.g. “produced by”, “feeds”, “depends on”). 

- **KPIs and Metrics:** <mark>`KPI`</mark> entities or definitions represent approved metrics (e.g. production rate, efficiency). Each KPI has: ID, name, description, unit, time basis. It is **bound** to one or more _Entities_ via <mark>`KPI_EVALUATES` .</mark> The calculation logic may be in Truss (if not precomputed in PI). 

- **Bindings:** A **Binding** associates a semantic field or metric with a data source: 

- _Live binding:_ e.g. an MQTT topic or PI tag providing live values for an attribute (e.g. pump vibration). 

- _Historical binding:_ e.g. a PI AF attribute path for retrieving history. 

- _Calculation binding:_ link to an approved calculation (in PI AF or APM model). 

3 

- **Versioning:** Every entity and relationship has <mark>`validFrom` /</mark> <mark>`validTo`</mark> dates (effective time) and a <mark>`recordedAt`</mark> timestamp. The combination gives a bitemporal context so we can query “as-of” any time. Upon publishing a new context, Truss issues an incremented **context revision ID** . The runtime package includes the context revision it was compiled from. 

#### • **Example Schema (simplified):** 

|Entity Type|Key Fi|elds|Example Properties|
|---|---|---|---|
|Plant|`id,`|`name, contextRev, validFrom/To`|location, shiftCalendar|
|Unit|`id,`|`name, parentPlant, ...`|unitType, designCapacity|
|Equipment|`id,`|`name, parentUnit, ...`|equipmentClass, horsepower|
|InstrumentPos|`id,`|`name, equipment, ...`|description,<br>deviceTemplateRef|
|Device|`id,`|`tag, instrumentPos, ...`|model, serialNo,<br>calibrationDate|
|ControlLoop|`id,`|`name, processVariable, ...`|setpoint, controllerType|
|Signal|`id,`|`name, instrumentDev, ...`|unit, sensorType|
|APMModel|`id,`|`name, equipment, version`|modelType|
|KPI_Definition|`id,`<br>`unit`|`name, metricExpr, timeBasis,`|description|
|KPI_Binding|`id,`|`kpiId, entityScope, sourceRef`|e.g. ties a KPI to an asset|



_Table: Illustrative Truss entity types and key fields._ 

- **Relationship Types:** (sample) 

- <mark>`Plant.CONTAINS` →</mark> <mark>`Unit` ;</mark> <mark>`Unit.CONTAINS` →</mark> <mark>`Equipment` ;</mark> <mark>`Equipment.HAS_INSTRUMENT` →</mark> <mark>`InstrumentPos` ;</mark> <mark>`InstrumentPos.HAS_DEVICE` →</mark> 

- <mark>`Device` ;</mark> <mark>`Loop.MONITORS` →</mark> <mark>`Signal` ;</mark> <mark>`Signal.SOURCES_FROM` →</mark> <mark>`Device` ;</mark> <mark>`APMModel.EVALUATES` →</mark> <mark>`Equipment` ;</mark> <mark>`KPI_Definition.EVALUATES` →</mark> <mark>`Plant|Unit|`</mark> 

- <mark>`Equipment` ,</mark> etc. 

- **KPI and Metric Catalog:** We propose a catalog of KPIs (production output, losses, energy rates, efficiency, etc.) each defined in Truss with: 

- **Definition:** formula or description (often an approved PI calculation). 

- **Scope:** which entity (plant, unit, etc.) it applies to. 

- **Time basis:** shift, day, month, etc. 

- 

- **Unit and target:** expected unit and target values. 

- **Drill policy:** e.g. how to break it down (e.g. _production by unit, by line_ ). 

- **Bindings Example:** (in Truss config) 

- 

4 

- KPI <mark>`plant.production.shift_total`</mark> is bound to PI AF attribute <mark>`[PlantAf].Units.A.TotalProduction` .</mark> 

- Equipment <mark>`P-101 flow`</mark> is bound to MQTT topic <mark>`dcs/U100/P-101/flow` .</mark> 

- 

- Loop <mark>`FIC-101`</mark> performance index bound to MQTT <mark>`clpm/FIC101/performance` .</mark> 

Truss is authoritative for naming. Clients (Flink/UI) use semantic names, not raw tags. 

# **3. Truss-to-Runtime Compiler** 

To avoid manual re-implementation of the asset model in Flink, we build a **compiler** that _translates the approved Truss context_ into a Flink-ready configuration package. 

**Compiler Inputs:** A published Truss context revision, including: 

- All relevant asset definitions (e.g. one Plant and its contained Units, one Equipment, etc.), with relationships. 

- 

- KPI definitions and bindings for those assets. 

- 

- Calculation definitions or references. 

- 

- Aggregation/contribution rules (how children sum to parent). 

- 

- Drill/navigation rules (optional, to guide the UI). 

- 

**Validation Rules:** Before generating the package, ensure: 

- **Bindings resolve:** Each binding references an existing source path or MQTT topic. 

- **Calculation completeness:** For each metric to be calculated in Flink (if any), all inputs are defined in Truss. No circular dependencies. 

- **Aggregation rules:** For each parent metric, child contributions must be explicit and nonoverlapping. 

- **Uniqueness:** Each KPI has a single authoritative calculation or source. E.g., the plant production total should not be duplicated. 

- **Context consistency:** No overlapping validFrom periods for the same entity, and the relationships form a consistent hierarchy. 

On failure, the compiler reports the issue. On success, it _seals_ the package with the context revision. 

**Runtime Package Format:** We use a structured JSON/YAML schema. For example: 

```
entity:
id:AMMONIA_PLANT_01
type:Plant
contextRevision:5
```

```
children:[U100,U200,U300]
```

```
bindings:
mqtt:
production_rate:source/production/plant01/production_rate
steam_consumption:source/utility/plant01/steam
```

```
fields:
```

5 

```
production.rate:
mode:source
binding:mqtt.production_rate
production.shift_total:
mode:source
binding:mqtt.shift_total
energy.steam:
mode:source
binding:mqtt.steam_consumption
specific_steam:
mode:calculate
formula:energy.steam / production.shift_total
```

```
assessments:
```

```
steam_efficiency_ok:
evaluator:target-check-v1
value:specific_steam
target:plant_specific_steam_target
```

```
dependencies:
```

```
Plant:
contributes:[U100,U200,U300]
aggregation:weighted_average
```

```
navigation:
drill:
-from:Plant
to:Unit
onClick:openUnitDashboard
-from:Unit
to:Equipment
onClick:openEquipmentDashboard
```

_Table: Example schema (partial) of a runtime package for a plant._ Each field or section maps to Truss information: 

- 

- <mark>`entity.id` /</mark> <mark>`type` /</mark> <mark>`contextRevision`</mark> come from Truss. 

- <mark>`children`</mark> from containment relations. 

- 

- 

- 

- 

- <mark>`bindings`</mark> maps semantic keys to MQTT or PI. 

- <mark>`fields`</mark> define how each metric is obtained (source vs calculated). 

- <mark>`assessments`</mark> define rule-based checks on fields (e.g. target deviation). 

- <mark>`dependencies`</mark> and <mark>`navigation`</mark> are optional helpers. 

**Activation:** The compiled package is versioned and **published** to a configuration topic (e.g. a compacted Kafka topic or DB). The Flink runtime reads it and transitions to the new version. We require an activation handshake: the runtime confirms the new config is loaded before acknowledging it. This avoids mixing state. 

6 

When activating a new package: 

- Flink may use the _Broadcast State Pattern_ to propagate updates【23†L83-L88】. Configuration changes (e.g. new asset, changed formula) should be designed to avoid inconsistent state. For significant schema changes, a controlled redeploy (with savepoint) is performed. 

# **4. Data Ingestion (MQTT → Kafka → Flink)** 

All real-time plant data are published to MQTT topics by source systems (DCS alarms, historian events, APM engine, loop performance monitors, LIMS, etc.). To integrate with Flink and ensure reliable processing, we route MQTT into Kafka: 

1. **MQTT Source Connector:** We deploy a Kafka Connect cluster with an MQTT Source Connector (e.g. Confluent or open-source version) to subscribe to relevant MQTT topics. This connector is configured for **at-least-once delivery** (set <mark>`mqtt.clean.session.enabled = false`</mark> and unique client IDs)【22†L40-L49】. This ensures Flink sees every message, even across restarts. We partition tasks by topics/clients for scalability. 

2. **Kafka Topics:** The connector writes incoming MQTT messages into Kafka topics. We maintain a naming convention: 

3. **`source/dcs/...`** , **`source/apm/...`** , **`source/clpm/...`** , **`source/instrumental/...`** : raw events as JSON envelopes. 

4. **<mark>`processed/state/<entity_id>`</mark>** (optional): snapshots of computed state (if needed). 

5. We use compacted topics for configuration <mark>(</mark> <mark>`context/config` )</mark> so that Flink always has the latest. 

The connector output format preserves original fields: we recommend the value as JSON with fields <mark>`{topic, payload, timestamp, ...}` .</mark> We may apply a **Kafka Connect SMT** (Single Message Transform) to route or rename topics (e.g. via RegexRouter)【22†L119-L127】. 

1. **Flink Sources:** The Flink job consumes from these Kafka topics using a Kafka Consumer connector. Data should carry timestamps (if embedded) for event-time processing. We use watermarks to handle lateness appropriately (Flink’s watermarking from Kafka or from message payload). 

This decouples Flink from direct MQTT and enables standard stream processing. 

# **5. Flink Real-Time Runtime Design** 

Flink runs a stateful streaming application that continuously updates each asset’s state and detects issues. Key design aspects: 

- **Broadcast Config State:** On startup and on config updates, Flink reads the runtime package (from a Kafka config topic or API) and broadcasts it to all task managers. Broadcast State (inmemory) holds definitions of fields, calculation formulas, and navigation. As noted, “Broadcast state is kept in-memory at runtime”【23†L83-L88】, so we must size memory accordingly. The 

7 

broadcast side (one stream of configs) has read-write access; the main keyed processing has read-only. 

- **Keyed Asset State:** We key the data stream by <mark>`entity_id`</mark> (e.g. plant ID, unit ID, equipment ID) depending on the metric scope. Flink’s keyed state holds: 

- Latest values of each semantic field (e.g. plant.production_rate, equipment.flow). 

- 

- The results of any Flink-calculated KPIs (e.g. specific_energy). 

- 

- Time-window buffers for rolling calculations (e.g. sliding window of recent production). 

- 

- References to active issues. 

- 

- **Processing Logic:** We use a **(Keyed)-BroadcastProcessFunction** : 

- 

- **Broadcast side:** When config updates arrive, update broadcast state (e.g. rule map). 

- **Broadcast side:** 

- • **Keyed side:** For each incoming event (measurement, alarm, etc.): 

      - Look up its broadcast rules to find which fields/entities it affects. 

   - 

   - Update the keyed state for that entity (apply the new value, timestamp, quality). 

- 

   - If needed, fire calculations (e.g. if event is a gas meter, recalc specific_energy). 

- 

      - Evaluate any <mark>`assessments` :</mark> e.g. if specific_energy exceeds target, set a flag. 

   - 

   - Use **CEP (Complex Event Processing)** patterns for sequences (if an issue requires temporal correlation, such as “if flow drops and vibration spikes within 5 minutes, raise issue”). 

- **Issue Detection:** When an assessment rule or CEP pattern triggers an alert, we create or update an **Issue record** with ID, affected assets, timestamps, evidence references, and severity. The issue ledger (e.g. stored in a database or via a stateful sink) ensures one persistent record per condition (with history of status changes). 

**Outputs:** The Flink job outputs: 

- 

- **Current State Updates:** E.g. whenever a key field changes, emit the updated entity state. This can be published to MQTT (e.g. topic <mark>`runtime/entity/ENTITY_ID` )</mark> and/or written to a state store (Postgres, Elasticsearch, etc.). The structure is JSON with fields like <mark>`{entityId, timestamp, [fields...], issueSummaries...}` .</mark> 

- **Issues:** New or updated issues are emitted (topic <mark>`runtime/issue/ISSUE_ID` )</mark> . These carry details (evidence, status). 

- **Time Handling:** Each field in state carries its own timestamp. We do not “wait” for all inputs; instead, each domain updates independently, and cross-domain calculations only run when inputs are available. We use watermarks to bound lateness. The broadcast-state pattern requires that all tasks see config in same order; we enforce deterministic updates to broadcast state. 

- **State Partitioning:** We recommend one Flink job keyed by _entity ID_ (the scope depends on each KPI). For example, plant-level calculations go under plant key, equipment-level under equipment key. Alternatively, use composite keys (e.g. PlantID|Metric). Provided keys are well-sharded, this scales horizontally. 

#### **Example Topology (simplified):** 

#### • 

8 

```
graph LR
  subgraph Flink Job
    A[Kafka Source: Real-time data (key by entityId)] --> B((KeyBy entityId))
    C[Kafka Source: Runtime Config (broadcasted)] --> D((Broadcast State
Update))
    B --> E{ProcessFunction}
    D --> E
    E --> F[Update Keyed State]
    E --> G[Evaluate Rules/CEP]
    E --> H[Output to State Store]
    E --> I[Output to Issue/Sink]
  end
```

- **State Store:** We may optionally sink the current state of each entity to a database (e.g. PostgreSQL or a time-series DB). However, the API can also query Flink state via Akka RPC or queryable state. The essential requirement is that “the latest state exists even if no UI is listening.” 

- **Checkpointing/Savepoints:** Flink checkpoints to durable storage. On upgrades, use savepoints to resume from last known state. The broadcast config state is checkpointed across tasks as well (though kept in memory during runtime)【23†L83-L88】. 

# **6. Data Contracts and APIs** 

## **Real-time API (GraphQL/REST)** 

We recommend a **GraphQL API** so clients can fetch nested data in one query (e.g. plant → units → equipment in one shot). Alternatively, a REST API with endpoints. Key endpoints: 

- 

- <mark>`GET /entities/{id}`</mark> – returns the current **LivingObject state** for the given entity (fields, 

- metrics, status, quality, issues). 

- <mark>`GET /entities/{id}/history?fields=...&from=...&to=...`</mark> – returns historical time- 

- series (from PI/IoTDB) for specified fields. 

- 

- 

- <mark>`GET /issues/{issueId}`</mark> – get full issue details (status, evidence, timeline). 

- <mark>`GET /entities/{id}/children`</mark> – returns contained asset IDs. 

- <mark>`POST /subscribe/entity-updates`</mark> – to open a WebSocket or SSE stream for live updates of 

- entities of interest. 

- <mark>`GraphQL /query`</mark> – allow queries like <mark>`{ plant(id:"P1") { production,`</mark> 

- <mark>`specificEnergy, units { name, production } } }` .</mark> 

### **Schema Examples (GraphQL pseudocode)** 

```
typeEntity{
id:ID!
type:String!
name:String
metrics:[MetricValue!]!
status:String
```

9 

```
issues:[IssueSummary!]!
children:[ID!]!
}
typeMetricValue{
key:String!
value:Float
unit:String
timestamp:String
}
typeIssueSummary{
id:ID!
severity:String!
shortDescription:String
}
typeIssueDetail{
id:ID!
severity:String!
description:String
affectedEntities:[ID!]!
evidence:[EvidenceItem!]!
}
```

Clients (OpenBridge UI) bind to these fields. For example, the Plant Manager dashboard fetches: 

```
query {
  entity(id:"PLANT01") {
    metrics { key, value, unit }
    children
    issues { id, severity, shortDescription }
  }
}
```

And then maybe <mark>`entity(id:"PLANT01").children`</mark> to get unit names and metrics. 

## **Runtime MQTT Topics** 

In addition to Kafka, we expose select data via MQTT for legacy or visualization convenience. Use a **separate namespace** : 

- **Source MQTT:** e.g. <mark>`dcs/U300/K302/power`</mark> (raw input). 

- **Traverse (Runtime) MQTT:** e.g. <mark>`traverse/runtime/entity/PLANT01/state`</mark> containing the assembled JSON state. 

Example topics: 

|Topic|Description|
|---|---|
|`source/dcs/U300/K302/`<br>`discharge_pressure`|Raw DCS float for K-302 discharge pressure|



10 

|Topic|Description|
|---|---|
|`source/clpm/PIC301/performance`|Loop PIC-301 performance index|
|`source/apm/K302/efficiency`|APM model output|
|`traverse/runtime/entity/PLANT01/state`|JSON with Plant01’s current metrics & statuses|
|`traverse/runtime/entity/U300/state`|JSON with Unit U300’s current metrics|
|`traverse/runtime/entity/K302/state`|JSON with K-302 equipment’s state & issues|
|`traverse/runtime/issue/I-204`|JSON summary of Issue I-204 (equipment<br>concern)|



The UI subscribes to the relevant <mark>`runtime/entity`</mark> topics for live updates (e.g. on a plant dashboard, subscribe to <mark>`runtime/entity/PLANT01/state`</mark> and maybe <mark>`U*/state` )</mark> . The gateway can map these MQTT messages to WebSocket pushes. 

## **Historical Data Retrieval** 

We rely on existing PI/AF or IoTDB for history. The API layer exposes endpoints like: 

- <mark>`GET /history?entity=K302&metric=power&from=2026-09-29T00:00&to=...`</mark> 

- The backend looks up the approved binding (e.g. PI tag <mark>`K302.Power` )</mark> and queries the historian, returning a time series (JSON array of {timestamp, value}). If IoTDB is authoritative for certain tags, the service reads from there (or a versioned API if present). 

Reconciliation: If a KPI (e.g. plant production) exists in PI historically, use it. If not, compute from contributors (not ad hoc in UI). The system should flag unexplained discrepancies rather than quietly fix them. 

# **7. UI / Unified Dashboard (OpenBridge)** 

The **Unified UI** uses the OpenBridge design system【27†L49-L53】. We define generic components that bind to **semantic fields** of living objects. Each persona has a different composition: 

- **Plant Manager View:** Shows plant-level KPIs (Production vs Plan, Throughput, Specific Energy, Utilities, Quality, Availability) as big tiles. Includes _Unit Performance summary_ list and _Top Exceptions_ . Drilling: 

- Click a KPI tile (e.g. “Specific Energy”) to show a **Plant KPI Analysis** (breakdown by unit/section). 

- Click a unit (in summary) opens that Unit’s dashboard (reusing the Unit view). 

- Click an exception opens the relevant issue/asset detail. 

- 

- **Operations Manager View:** Starts at Plant or assigned units. Shows Unit throughput, constraints, active alarms/exceptions, process KPIs and trending charts. Drilling goes to affected loops/equipment. 

- **Maintenance Manager View:** Focuses on assets in scope with alerts. Shows list of equipment with condition issues, open work orders, key condition metrics (vibration, reliability). Drilling goes to Equipment detail and issue investigations. 

11 

- **Shift Supervisor View:** Shows real-time operational snapshot: current unit states, shift production vs target, active alarms, handover items. Drilling goes to process anomalies or machine details. 

**Data Binding:** All components request semantic paths like <mark>`entity.metrics['production']`</mark> or <mark>`entity.status` .</mark> E.g. a chart might use <mark>`entity.history['specific_energy']` .</mark> 

**Drill Rules & Context:** A click on a dashboard element navigates while preserving context: 

- If a Plant-level KPI is clicked, open the Plant KPIs drill-down (unit breakdown). 

- 

- If a Unit name is clicked, navigate to that Unit’s dashboard, carrying over the time window. 

- 

- If an Equipment issue is clicked, open the issue investigation panel. 

- 

We must preserve: current entity ID, selected time range, shift/product context, and user identity. Changing perspective (persona switch) should not require re-selecting the asset. 

**UI Components:** (based on OpenBridge, e.g. UI4Free icons【15†L17-L20】) 

- KPI Cards (with sparkline). 

- 

- Grid/List for units and issues. 

- 

- Trend charts (line, column) for production or energy. 

- 

- Cross-filtering drill grid. 

- 

- Navigation panel (breadcrumbs for path: Plant > Unit > Equipment). 

- 

**Offline/Resume:** If the connection drops, the app resumes subscriptions on reconnect. Use retained MQTT or REST snapshot to fill current state initially. The UI should handle stale/unavailable gracefully (label outdated data). 

# **8. Security, Multi-Tenancy, and Compliance** 

- **Authentication/Authorization:** All APIs and MQTT/Kafka endpoints require TLS and secure credentials. We use OAuth2/JWT for the Dashboard API; tokens include roles/teams. Truss and Flink enforce RBAC: user can only request data for authorized plants/units. 

- **Data Isolation:** In multi-plant installations, data is partitioned by site. Tenancy is enforced by filtering by plant domain in the API and by Kafka topic namespaces per plant. 

- **Encryption:** Enable TLS for MQTT brokers, Kafka, REST endpoints and UI to protect data in transit. 

- **Auditing:** Log all config changes (Truss context publishes) and user actions (dashboard drill) in an audit log. 

- **Secure Configuration:** Secrets (MQTT credentials, DB passwords) are stored in Kubernetes secrets or Vault. Kafka ACLs lock down topic access by service identity. 

Citing best practice: implementing TLS is standard for secure communication【22†L40-L49】 (implicit reference). 

12 

# **9. Deployment and Operations** 

- **Containers and Orchestration:** Each component (Truss service, Kafka Connect, Kafka, Flink JobManager/TaskManagers, Web/API servers) runs in Docker on Kubernetes. Use Helm charts for deployment, with health checks. 

- **CI/CD Pipeline:** Version-controlled repos for Truss schema, compiler code, Flink job, UI. On push, run unit tests, build containers, and deploy to dev/staging. Use database migrations (Liquibase) for Truss schema changes. 

- **Observability:** Export metrics (Prometheus) from Truss, Kafka, Flink (checkpoint/min lag), and UI. Dashboards for stream lags, CPU/memory, error rates. Alert on Flink failures or build-ups. 

- **Recovery:** Flink is configured with periodic checkpoints. On failure, it auto-restarts from the last checkpoint. Savepoints are taken before planned upgrades. Kafka Connect uses Kafka offsets for restart. 

- **Schema Migration:** Truss context revisions handle additions. Breaking changes (like removing a KPI) should bump a major version and trigger a redeploy of Flink (with savepoint restore) to adjust state. 

- **Backup:** Truss database backups daily. Kafka topic retention as needed (config topic is compacted, data topics may retain short to reduce disk). 

# **10. Testing and Acceptance** 

- **Unit Tests:** Each microservice (Truss, compiler, Flink job logic, UI) has unit tests. Use simulated data for Flink functions. 

- **Integration Tests:** Simulate full data flow: publish sample MQTT messages and Truss configs, verify Flink outputs and API responses. 

- 

- **Example Simulation (see next section)** : Build the ammonia plant example with known values, replay it, and check the living-object state and UI. 

- **Acceptance Criteria:** 

- _Consistency:_ Identical semantic metric yields identical values across personas. 

- 

- _Context Preservation:_ Drills keep correct time and entity context. 

- 

- _No Duplicate Counting:_ Aggregations follow defined rules (e.g. production sum). 

- 

- _Gap Detection:_ Missing evidence is reported as “unverified” in the issue. 

- 

- _No Silent Access Escalation:_ Persona switch does not expose new data. 

- 

- _Historical Accuracy:_ A reproduced incident shows correct old instruments/bindings per version. 

- _Performance:_ Dashboard refresh under load uses cached state, not full graph queries. 

- 

- **Runbook:** Document incident responses: e.g. if Flink job stops, restart from savepoint; if Kafka lags, identify source. 

13 

# **11. Example End-to-End Simulation** 

To guide implementation, here is a **minimal reproducible example** with one plant, two units, one compressor, one transmitter. 

## **Truss Definitions (YAML)** 

```
# Asset definitions
Plant:
id:PLANT01
name:"AmmoniaPlant01"
validFrom:"2026-01-01"
contains:[U100,U200]
metrics:
production_day:kpi_plant_production
Unit:
-id:U100
name:"Unit100FeedGas"
parent:PLANT01
contains:[E101]
metrics:
production_day:kpi_unit_production
-id:U200
name:"Unit200Synthesis"
parent:PLANT01
contains:[E201]
metrics:
production_day:kpi_unit_production
Equipment:
-id:E101
name:"K-101Compressor"
parent:U100
type:Compressor
signals:[SIG1,SIG2]
-id:E201
name:"K-201Compressor"
parent:U200
type:Compressor
signals:[SIG3]
InstrumentPosition:
-id:PT-101
parentEquipment:E101
type:PT# pressure transmitter
produces:[SIG1]
-id:PT-201
parentEquipment:E201
```

14 

```
type:PT
produces:[SIG3]
ControlLoop:
-id:PIC-101
name:"PressureLoop101"
pv:SIG1
setpoint:50.0
-id:PIC-201
name:"PressureLoop201"
pv:SIG3
setpoint:50.0
APMModel:
-id:APM-COMP
name:"CompressorAPM"
inputs:[SIG1,SIG2]# e.g. suction & discharge
# KPI Definitions and Bindings
KPI_Definition:
-id:kpi_plant_production
name:"PlantProduction(Today)"
unit:"tonnes"
timeBasis:"ProductionDay"
-id:kpi_unit_production
name:"UnitProduction(Today)"
unit:"tonnes"
timeBasis:"ProductionDay"
KPI_Binding:
-kpiId:kpi_plant_production
entityScope:PLANT01
source:
type:MQTT
topic:production/plant01/shift_total
-kpiId:kpi_unit_production
entityScope:U100
source:
type:MQTT
topic:production/U100/shift_total
-kpiId:kpi_unit_production
entityScope:U200
source:
type:MQTT
topic:production/U200/shift_total
# Production plan for target
Target:
-metric:production_day
context:U100
targetValue:1000
```

15 

- `metric: production_day context: U200 targetValue: 800` 

- `metric: production_day context: PLANT01 targetValue: 1800` 

_This minimal Truss context defines a plant with two units (U100, U200), each with a compressor (E101, E201) and an instrument (PT-101, PT-201). We define a daily production KPI bound to MQTT topics. Targets are set for demonstration._ 

## **Compiled Runtime Package (YAML)** 

```
entity:
```

```
id:PLANT01
type:Plant
contextRevision:1
children:[U100,U200]
```

```
fields:
production.shift_total:
mode:source
binding:mqtt.production.plant01.shift_total
```

```
assessments:
production_delay:
evaluator:target-deviation-v1
value:production.shift_total
target:target.production_day
# Unit U100 package
entity:
id:U100
type:Unit
parent:PLANT01
fields:
production.shift_total:
mode:source
binding:mqtt.production.U100.shift_total
```

_This runtime package tells Flink: PLANT01.production.shift_total comes from MQTT topic_ _<mark>`production/ plant01/shift_total` ,</mark> and it should check it against the plan. Similarly for U100. (In practice, U200 would be included likewise.)_ 

16 

## **MQTT Topics and Sample Messages** 

We simulate MQTT messages from Kafka Connect. Topics and JSON messages (simplified): 

- 

- <mark>`production/plant01/shift_total`</mark> : 

```
{"timestamp":"2026-09-29T08:00:00Z","value":500}
```

- <mark>`production/U100/shift_total`</mark> : <mark>`{"timestamp":"2026-09-29T08:00:00Z","value":`</mark> 

- <mark>`300}`</mark> 

- <mark>`production/U200/shift_total`</mark> : <mark>`{"timestamp":"2026-09-29T08:00:00Z","value":`</mark> 

- <mark>`200}`</mark> 

- 

- <mark>`dcs/U100/E101/suction_pressure`</mark> : 

```
{"timestamp":"2026-09-29T08:00:00Z","value":30.5}
```

- 

- `dcs/U100/E101/discharge_pressure` : 

- <mark>`{"timestamp":"2026-09-29T08:00:00Z","value":45.2}`</mark> 

- <mark>`apm/E101/efficiency`</mark> : <mark>`{"timestamp":"2026-09-29T08:00:00Z","value":75.0}`</mark> 

- <mark>`instrumental/PT-101/namur`</mark> : 

```
{"timestamp":"2026-09-29T08:00:00Z","value":"OK"}
```

- <mark>`clpm/PIC-101/performance`</mark> : 

```
{"timestamp":"2026-09-29T08:00:00Z","value":"GOOD"}
```

- (Similarly for U200/E201 signals.) 

- 

These MQTT messages are ingested into Kafka and consumed by Flink. 

## **Flink Job Outline (Pseudo-Java)** 

```
// Pseudo-code sketch
env.setParallelism(4);
DataStream<MqttMessage>source=env
```

```
.addSource(newKafkaMqttSourceConnector("source/#"));
```

```
BroadcastStream<RuntimeConfig>config=env
```

```
.addSource(newKafkaSource<RuntimeConfig>("context/config"))
```

```
.broadcast(configDescriptor);
```

```
source.connect(config)
```

```
.process(newAssetProcessFunction())
.name("Asset State Processor");
```

```
// In processElement:
```

```
// - Find entityId from topic or payload metadata.
```

```
// - ctx.getBroadcastState() to read formulas, bindings.
```

```
// - Update keyed state (e.g. stateMap.put("production.shift_total",
msg.value)).
```

```
// - If metric has target, evaluate deviation; if over threshold, emit Issue.
// - Possibly output updated LivingObject JSON to sink.
```

```
// IssueSink writes to runtime/issue topic and persists ledger.
```

```
// StateSink writes LivingObject state to runtime/entity topics.
```

17 

## **Expected Runtime State JSON** 

After processing the above messages, Flink would produce a living object for PLANT01: 

```
{
"entityId":"PLANT01",
"timestamp":"2026-09-29T08:00:05Z",
"state":{
"production":{
"shift_total":{"value":500,"unit":"t","timestamp":
"2026-09-29T08:00:00Z"},
"target":1800,
"status":"BELOW_TARGET"
}
},
"children":{
"U100":{"production":300,"target":1000,"status":"BELOW_TARGET"},
"U200":{"production":200,"target":800,"status":"BELOW_TARGET"}
},
"issues":[
{"id":"I-001","severity":"HIGH","desc":"Plant production below
target"}
],
"dataQuality":{"coverage":100,"status":"GOOD"}
}
```

This JSON would be published to <mark>`traverse/runtime/entity/PLANT01/state` .</mark> The UI shows the Plant Manager’s dashboard with Production=500/1800 (27.8%), units U100=300/1000, etc., and one issue I-001. 

If the Plant Manager clicks the production tile, the UI drills into Unit breakdown (U100 and U200), using the same data (no recomputation needed). If the manager clicks Issue I-001, the UI opens the issue detail (Entity=PLANT01, evidence from unit contributions). 

## **UI Mock Data Flow** 

The UI (JavaScript with OpenBridge) subscribes to <mark>`runtime/entity/PLANT01/state` .</mark> On message: 

- It updates KPI cards (Production, vs Plan, etc.). 

- 

- It updates children list with U100, U200 status. 

- 

- It updates issue list with I-001. 

- 

Upon user clicking a card: 

- It calls API <mark>`GET /entities/PLANT01/history?metric=specific_energy&range=today` .</mark> • On “U100” click: navigates to <mark>`GET /entities/U100`</mark> and subscribes to <mark>`runtime/entity/ U100/state` .</mark> 

Everything maps via entity IDs and does not require raw topic names. 

18 

# **12. Tables of Schemas and Contracts** 

### **Entity Schema (Database / JSON fields)** 

|Field|Type|Description|
|---|---|---|
|entityId|string|Canonical ID|
|type|string|Asset type (Plant, Unit, Equipment...)|
|name|string|Human-readable name|
|contextRevision|int|Truss context version|
|validFrom/To|date|Effective dates|
|status|string|E.g. RUNNING/STOPPED, a summary field|
|metrics|object|Keyed by metric name, see below|
|issues|array|Active issue summaries|
|dataQuality|object|Coverage %, freshness status|



#### **Metric Value Schema (within** **<mark>`metrics` )</mark> :** 

|Field|Type|Description|
|---|---|---|
|value|number|Current numeric value|
|unit|string|Unit of measure (e.g. t, GJ/t)|
|timestamp|string|ISO time of last update|
|quality|string|e.g. GOOD, STALE, UNAVAILABLE|



### **Runtime Package Schema** 

|Field|Type|Description|
|---|---|---|
|entity.id|ID|Canonical asset ID|
|entity.type|string|Plant/Unit/Equipment/etc|
|contextRevision|int|Truss context version used|
|children|list|IDs of immediate contained entities|
|fields.<name>|object|Definition of metric field|
|- mode|string|"source" or "calculate"|
|- binding|string|semantic key to source (e.g. mqtt.production_rate)|
|- formula|string|calculation formula if<br>`calculate`|
|assessments.<id>|object|Condition checks|



19 

|Field|Type|Description|
|---|---|---|
|- evaluator|string|evaluator name (e.g. threshold, deviation)|
|- value|string|field key to evaluate|
|- target|string/num|threshold or field key for target|
|navigation|object|(optional) drill definitions (from->to mapping)|



### **API Endpoints (REST/GraphQL)** 

|Endpoint|Method|Description|
|---|---|---|
|`GET /entities/{id}`|GET|Live entity state (JSON with metrics, issues)|
|`GET /entities/{id}/history`|GET|Historical time-series (params: metric, range)|
|`POST /query`|GraphQL|Runs GraphQL query|
|`WS /subscribe`|WS|Open Bridge WebSocket for live updates|
|`GET /issues/{issueId}`|GET|Detailed issue report|



### **Topic Namespace Examples** 

|MQTT Topic|Content|
|---|---|
|`source/dcs/U100/E101/flow`|single field float|
|`source/alarm/U100/E101/active`|alarm ID or flag|
|`source/apm/E101/efficiency`|model output|
|`traverse/runtime/entity/ENTITY_ID/state`|full JSON state|
|`traverse/runtime/issue/ISSUE_ID`|issue JSON|



### **Milestone Roadmap (Illustrative)** 

|Milestone|Team|Effort|Acceptance Criteria|
|---|---|---|---|
|**1. Shared KPI**<br>**Catalog**|Truss|Medium|Define production, energy, consumption KPIs in<br>Truss; review.|
|**2. Asset Model &**<br>**Bindings**|Truss|Large|Complete plant/unit/equipment schema; all<br>required bindings configured.|
|**3. Context**<br>**Publication**|Truss /<br>Backend|Small|Publish versioned context for a test plant.|
|**4. Kafka/MQTT**<br>**Ingestion**|Infra/Kafka|Medium|Set up MQTT broker, Kafka Connect, and Kafka<br>topics; test with sample messages.|
|**5. Flink Runtime**<br>**Prototype**|Flink Team|Large|Basic job consuming one plant; populates current<br>state table; passes smoke tests.|



20 

|Milestone|Team|Effort|Acceptance Criteria|
|---|---|---|---|
|**6. Issue Detection**<br>**(CEP)**|Flink Team|Medium|Implement one CEP rule (e.g. production drop),<br>verify issue generation.|
|**7. Dashboard**<br>**Backend API**|API Team|Medium|Basic REST/GraphQL serving plant state; returns<br>correct JSON.|
|**8. UI Persona**<br>**Draft**|UI Team|Large|Plant Manager dashboard with KPI cards and<br>drilldowns working on simulated data.|
|**9. End-to-End**<br>**Demo**|All Teams|Large|Walkthrough with full data flow<br>(MQTT→Kafka→Flink→UI) on example scenario.|
|**10. Security &**<br>**Ops Setup**|Infra/Sec|Medium|TLS and auth in place; monitoring dashboards live.|
|**11. Final**<br>**Validation**|All Teams|Large|Run comprehensive tests, simulate failure/<br>recovery.|



_Table: Sample roadmap with milestones, team ownership, and acceptance tests._ 

# **13. Conclusion** 

This specification provides a **complete blueprint** for implementing the living-asset system. Truss holds the approved context; the Flink runtime enforces it against live data; and the OpenBridge UI presents role-specific dashboards. By following the above architecture, data contracts, and example, the development teams can build, integrate, and simulate each component. The resulting system ensures one consistent plant model, seamless data flow from sensors to insights, and transparent drill-down from business KPIs to raw evidence. 

21 

