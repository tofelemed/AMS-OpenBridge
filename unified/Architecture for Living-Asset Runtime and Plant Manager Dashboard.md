# **Architecture for Living-Asset Runtime and Plant Manager Dashboard** 

**Executive Summary:** We propose a unified architecture that implements _living industrial assets_ using the existing Truss data model, streaming analytics, and a responsive OpenBridge-based UI. The system extends Truss with persona- and view-specific configuration, compiles approved context into a runtime package for Apache Flink, and publishes a versioned object state and issue ledger back to clients. Realtime signals (from MQTT) and historical data (from PI/IoTDB) are joined in Flink to maintain up-to-date asset state (operating metrics, KPIs, assessments) and detect conditions. A Plant Manager dashboard is then simply a persona-specific view over these living objects. This document specifies **system architecture, components, data flows, interfaces, schemas, message contracts, runtime formats, operational deployment, and a step-by-step implementation plan** . We include concrete examples for a simple ammonia plant to demonstrate end-to-end operation, along with tables of component responsibilities, message formats, REST/WebSocket APIs and acceptance tests. 

## **1. System Architecture Overview** 

The solution divides into three layers: 

- **Truss (Governance and Configuration):** Asset definitions, relationships, KPI/metric definitions, persona/view templates and security policies live here. An approved, versioned _runtime package_ is published from Truss. 

- **Streaming Runtime (Flink-Based):** Consumes the runtime package and real-time streams to produce _living asset objects_ . It maintains current state and issues/events. Key components include Flink jobs for state assembly, pattern detection (CEP), and store adapters for historical queries. 

- **Unified UI (OpenBridge Dashboard):** The Plant Manager persona UI fetches the living object state via REST/WS APIs and historical trends from the runtime or historical store. The UI uses OpenBridge components to display KPIs, assets, and drill-down links (via unique issue IDs) while enforcing persona permissions. 

A high-level data flow is illustrated below: 



<!-- Start of picture text -->
Truss (Asset/Persona config, KPI definitions, etc.)<br>   └── publishes versioned context package → Kafka (compacted) ─┐<br>                                                              │<br>                   ┌───────────────┐   ┌────────────┐          ▼<br>MQTT Sensors ----> │Kafka topics   │ ─▶ │ Flink      │ ──► Asset State /<br>Issues<br>                   └───────────────┘   └────────────┘          │<br>                                 ^                            │<br>                                 │  ┌────────────┐           │<br>Historical Store (PI/IoTDB) <───┘  │Historical  │◄───────────┘<br><!-- End of picture text -->

1 

```
(fetched on demand)                │Query Service│
                                   └────────────┘
```

- **MQTT/Kafka:** All real-time signals are published on an MQTT broker; a Kafka Connect **MQTT Source Connector** (with _at-least-once_ mode) bridges them into Kafka topics (e.g. <mark>`source/ dcs/...` )</mark> . 

- **Context Distribution:** Truss publishes configuration (asset models, KPI definitions, persona views) as a _compacted_ Kafka topic (or a REST-pushed package). Flink consumes this as a **broadcast state** to configure jobs. 

- **Flink Engine:** Processes incoming data streams and context to update asset states. Key design elements: **Keyed streams** for each asset/asset type; **broadcast state** for config; **CEP** (Complex Event Processing) for issue detection; output sinks for current state and issue updates. 

- **Runtime Sinks:** Flink writes current asset snapshots to a database or to an internal cache service. It also publishes state updates and issue events over a “runtime” MQTT namespace or WebSocket feed for low-latency UI updates. 

- **UI Layer:** The Unified UI (using OpenBridge UI components) calls the Runtime API to retrieve asset state, metrics and issues, and subscribes to live updates via WebSocket or MQTT. Drilling down triggers further calls for asset details, historical trends or evidence (e.g. via PI Web API). 

**Figure 1:** _Simplified Component Diagram._ 

_(Diagram not included: imagine Truss, Kafka/MQTT, Flink, Historical DB, and UI with WebSocket connections.)_ 

The design ensures **single source of truth** : Truss remains the authoritative context model, Flink simply executes it. Personas are implemented as **views** on the same underlying assets. All assets use their canonical Truss IDs; no duplicate hierarchies are built in Flink or UI. The runtime package generated from Truss contains everything Flink needs to know (semantic metrics, source bindings, contribution rules, etc.), so that **no schema or calculation logic is hard-coded outside Truss** . This enables living assets whose state updates continuously, with evidence-driven drill-down. 

## **2. Key Components and Responsibilities** 

|Component|Responsibility|Examples/Notes|
|---|---|---|
|**Truss (Asset**|Manage canonical<br>asset model,<br>relationships,<br>calculations, KPI<br>definitions, persona<br>i|Contains entities (Plant, Unit, Equipment, Instrument,<br>etc.); extended schema to include_PersonaDefinition_,<br>_ii_|
|**Catalog)**|profiles and access<br>policies. Publishes<br>versioned<br>configuration to<br>runtime.|_SemanticViewDefinition_,_CalculationDefinition_,<br>_MetricBinding_,_IssueDefinition_.|



2 

|Component|Responsibility|Examples/Notes|
|---|---|---|
|**Context Pub/**<br>**Sub**|Distribute approved<br>context (bindings,<br>roles, view definitions,<br>rules) to runtime. Uses<br>compacted Kafka<br>topics or REST/publish.<br>Caches data for<br>efficient Flink<br>broadcast.|e.g.<br>`truss/config/package/<revision>` Kafka<br>topic; context service API.|
|**MQTT Broker**|Publish real-time<br>telemetry (process<br>data, alarms,<br>diagnostics) from<br>control systems and<br>analytical engines.|Topics like<br>`dcs/U300/K302/discharge_pressure` ,<br>`apm/K302/efficiency` ,<br>`instrumental/PT301/`<br>`namur` ,etc.|
|**Kafka + MQTT**<br>**Source**|Bridge MQTT to Kafka<br>(for reliability, ordering,<br>replay). Kafka topics<br>mirror MQTT topics.|Use Confluent MQTT Source Connector【13†L129-<br>L137】. Example Kafka topic:<br>`source/mqtt/dcs/`<br>`U300/K302/discharge_pressure` .|
|**Flink Runtime**<br>**Engine**|Stateful stream<br>processor executing<br>the living-object logic.<br>Key tasks: resolve asset<br>identity, join streams<br>by key, update state,<br>run CEP for issues, and<br>serve output.|DataStream API with_keyed state_,_broadcast state_,<br>_timers/Windows_, CEP. Exactly-once via checkpointing<br>【22†L61-L68】.|
|**State Store**|Persist and serve the<br>current asset state and<br>issues. Flink writes<br>latest snapshots to a<br>database or cache for<br>API queries.|Could be PostgreSQL (structured tables) or Redis/Key-<br>Value for speed. Contains tables like<br>`asset_state(entity_id)` ,<br>`issue(episode_id)` .|
|**Historical**<br>**Query API**|Fetch time-series and<br>event history for a<br>given asset and metric.<br>Routes requests to<br>AVEVA PI Web API or<br>Apache IoTDB query.|REST endpoints:<br>`/history?`<br>`entity=E&metric=M&from=...&to=...` .Acts as<br>proxy to PI/AF or IoTDB.|
|**Issue/Episode**<br>**Ledger**|Archive of detected<br>events/issues for<br>assets, with evidence<br>references. Supports<br>versioning and status.|Tables:<br>`Issue(id, entity_id, type,`<br>`start_time, status, evidence_refs,`<br>`context_rev)` .Flink updates or creates issues.|



3 

|Component|Responsibility|Examples/Notes|
|---|---|---|
|**Runtime API/**<br>**Gateway**|Provides data to UI.<br>REST API for initial data<br>(asset state, historical<br>trend, issue details)<br>and WebSocket for live<br>updates.|Endpoints:<br>`GET /runtime/asset/{id}` ,<br>`GET /`<br>`runtime/issue/{id}` ,<br>`GET /runtime/asset/`<br>`{id}/history` ,etc. Pushes updates via WS or MQTT<br>topic subscription (e.g.<br>`runtime/asset/{id}/`<br>`state` ).|
|**Unified UI**<br>**(OpenBridge)**|Plant Manager<br>dashboard and<br>investigation pages.<br>Fetches and displays<br>data using OpenBridge<br>components.<br>Implements drill-down<br>and persona-switch.|Components: KPI cards, charts, asset cards, issue<br>tables, breadcrumbs. Uses WebSocket or MQTT to<br>receive live updates.|



## **3. Truss Schema Extensions** 

We extend the Truss ontology with several concepts to support persona views and living KPIs. These configurations are versioned and published. 

### **3.1 New/Extended Entities** 

|Entity Type|Purpose|
|---|---|
|**PersonaDefinition**|Defines a user persona (e.g. Plant Manager) with default views,<br>priorities, default time horizon, and allowed scopes.|
|**SemanticViewDefinition**|Defines a view of entities and metrics for a role. Specifies which<br>properties, metrics, and related objects to expose.|
|**ResponsibilityAssignment**|Assigns roles/persona to particular asset scopes (plants/units) with<br>effective dates.|
|**DashboardTemplate**|Defines named, reusable dashboard layouts and widgets. (Optional:<br>UI-focused config.)|
|**CalculationDefinition**|Defines how a KPI is calculated (formula, aggregation rule, or<br>external source).|
|**MetricBinding**|Maps a semantic metric (like<br>`production.actual_quantity` )to<br>a particular data source (PI tag, analytic output, calculated formula).|
|**DrillRule**|Defines navigation links: e.g. “clicking this KPI drills to that view<br>preserving context”.|
|**AccessPolicyReference**|Tags a view or metric with required roles/ACL for access<br>enforcement (complement to auth module).|



These definitions allow _roles and personas_ to be configured in Truss as part of the model, not hardcoded. For example, we define a <mark>`PersonaDefinition`</mark> for “PlantManager” that includes <mark>`defaultView=PlantOverview` ,</mark> <mark>`allowedScope=assigned plant` ,</mark> etc. A 

4 

<mark>`SemanticViewDefinition`</mark> for “PlantOverview” might list metrics like <mark>`plant.production` ,</mark> <mark>`plant.specific_energy` ,</mark> and sub-entity summaries. 

### **3.2 Example Schema Snippets** 

```
PersonaDefinition:
```

```
id:PM01
name:PlantManager
default_scope:PLANT
default_time_horizon:DAY
priority_metrics:[production,specific_energy,availability]
dashboard_template:"plantManager.v1"
drill_rules:[PlantToUnit,KPIContributions]
```

```
SemanticViewDefinition:
```

```
id:PlantOverview
entity_type:Plant
attributes:[operatingState,availability.current]
metrics:[production.shift_total,energy.specific,
utilities.steam_specific]
related_entities:[Unit,LossEvent]
```

```
CalculationDefinition:
```

```
id:SpecificEnergyCalculation
metric:energy.specific
formula:"steam.shift_total/production.shift_total"
units:"tsteam/tproduct"
inputs:[production.shift_total,utilities.steam]
quality_policy:approved_ready
```

```
MetricBinding:
```

```
id:PlantProdBinding
metric:production.shift_total
entity_type:Plant
binding_type:"PI_AF"
af_path:"\\\\PIserver\Plant01\ProdTotal"
retrieval:"Readattributevalue"
time_basis:SHIFT
```

_(These are illustrative YAML-like structures; actual implementation may be in JSON or a database schema.)_ 

### **3.3 Data Flows from Truss to Flink** 

Truss publishes an asset’s **approved context** for Flink to consume. We propose a _Truss-to-Runtime compiler_ that performs: 

1. **Resolve Asset Context:** For each asset (Plant, Unit, etc.) produce an object containing its identity, type, fixed properties, and relevant relationship keys (e.g. parent unit, containing plant). 

2. **Collect KPI and Metric Definitions:** For each entity, gather semantic metrics and their calculation definitions or source bindings. 

5 

3. **Translate to Runtime Package:** Generate a versioned package (JSON/YAML) that Flink can consume. Example fragment for plant: 

```
{
"entity_id":"AMMONIA_PLANT_01",
"type":"Plant",
"metrics":{
"production.shift_total":{"source":"PI","af_attribute":"ProdTotal"},
"utilities.steam":{"source":"MQTT","topic":"utility/
plant01/steam"},
"energy.specific":{"calc":"steam / production","inputs":
["utilities.steam","production.shift_total"]}
},
"assessments":{
"energy_status":{"type":"threshold","value":"energy.specific",
"target":"plant_energy_target"}
},
"children":["U100","U200","U300"],
"drill_rules":{...}
}
```

The compiler can be a service or part of the Truss backend. It validates completeness (no missing bindings, no circular calc without state, etc.). The output is versioned (e.g. <mark>`context/v1.02/ <entity>.yaml` )</mark> and pushed into a context Kafka topic or made available via REST. Flink reads the newest version at job startup and on updates. 

## **4. Flink Runtime Design** 

Apache Flink is chosen as the streaming engine for its strong support of stateful stream processing, exactly-once guarantees, event-time semantics and CEP【22†L54-L57】【22†L61-L68】. We outline the Flink topology and key behaviors: 

### **4.1 Topology and Keying** 

- **Stream Sources:** Consume from Kafka the data and config streams: 

- 

- _Config stream_ (compacted topic): context package from Truss (broadcast). 

- 

- _Data stream(s)_ : telemetry topics (converted from MQTT). We may have many topics (one per signal), but we define a unified Kafka topic namespace and use key-value records. 

- **Parsing and Enrichment:** Map raw Kafka records into typed events <mark>`(entity_id, signal_id, value, timestamp, quality)` .</mark> Entity resolution: We may 

- embed entity ID in topic or use a mapping table. For example, each instrument’s topic is tagged with its parent asset. 

- **Key Partitioning:** Each event stream is keyed by the primary asset ID (e.g. equipment or instrument ID). This allows each parallel Flink task to maintain state for a subset of entities. 

- **Broadcast Configuration:** The context package (all metrics definitions, static topology for a plant, etc.) is broadcast to all parallel instances. Using <mark>`DataStream.broadcast()` ,</mark> Flink distributes a <mark>`MapState`</mark> of config that can be joined with keyed streams【22†L63-L68】. 

- **State Store:** For each entity (identified by ID), Flink maintains a keyed <mark>`ValueState`</mark> representing the current _object state_ (latest values of attributes, computed KPIs, status). It also keeps any window or CEP state needed to evaluate calculations. 

6 

- **CEP/Patterns:** Use Flink CEP library to detect conditions that raise issues. For example, a pattern might detect “if <mark>`production.shift_total`</mark> falls below plan by >10% _and_ any critical alarm is active on that unit” over a sliding window of 1h. Each pattern has an associated rule from <mark>`CalculationDefinition`</mark> or a _ConditionEvaluator_ component. 

- **Timers:** Use event-time timers if needed to trigger end-of-shift or end-of-day calculations, or to finalize an issue if a condition persists. 

- **Sinks:** When state changes significantly or issues are raised/cleared, Flink emits updates: 

- 

- **Current State Sink:** writes the latest object state (e.g. as JSON) to the State Store (Postgres/ NoSQL) and/or publishes to <mark>`traverse/runtime/entity/<id>/state` .</mark> 

- **Issue Sink:** when a CEP pattern matches, create or update an entry in the Issue ledger and publish to <mark>`traverse/runtime/issue/<issue_id>` .</mark> 

### **4.2 Data and State Model** 

Flink state for an equipment entity may include: 

- **Latest Values:** Most recent sample for each signal (e.g. last pressure, flow, temperature). 

- 

- **Computed KPIs:** e.g. efficiency, specific consumption, updated when inputs arrive. 

- 

- **Quality Flags:** Per-field data quality and freshness. 

- 

- **Active Issues:** Pointers to issue IDs currently open for this entity. 

- 

- **Timers/Windows:** Data for multi-event patterns (e.g. last 30 mins of production vs plan). 

- 

By partitioning by asset ID, Flink can update each entity independently. The runtime _object state_ output includes all relevant fields (with timestamps and quality) so the UI can display them. Each record can be a self-contained JSON for that entity. 

**At-Least-Once & Exactly-Once:** Using Kafka checkpointing and state snapshots ensures that Flink recovers exactly-once semantics【22†L61-L68】. We will configure Kafka Connect in “clean.session=false” mode for at-least-once MQTT pickup【13†L42-L50】. 

### **4.3 Calculations and Aggregations** 

- **Using Approved Calculations:** If a metric like <mark>`plant.production`</mark> is already calculated (e.g. in PI or by another job), Flink simply reads it. For example, the semantic 

- <mark>`production.shift_total`</mark> can be bound to a PI AF attribute. Flink will fetch this via the PI 

- Web API or from a live stream, but not recalc it. 

- **Defining New Metrics:** For metrics without an existing source (e.g. _combined specific consumption_ ), include a <mark>`CalculationDefinition`</mark> that Flink implements, using a ProcessFunction or a simple map. 

- **Contribution Roll-ups:** We explicitly specify which child metrics contribute to a parent. For example, total plant output = sum of non-overlapping unit outputs. Flink can verify roll-up consistency but should **not** blindly sum overlapping values (the model prevents doublecounting). 

- **Thresholds/Alerts:** Some KPI fields include target values or alarm thresholds. Flink performs comparisons (e.g. if <mark>`specific_energy > target`</mark> → raise issue). 

- 

- **Condition Evaluators:** We will build a library of common evaluators (e.g. _limit breach_ , _variance_ , _stagnation_ , _exceeded capacity_ ) that can be parameterized in config. 

7 

### **4.4 State Broadcast and Updates** 

The context package may change (e.g. when a new instrument is added). Flink’s broadcast stream ensures updated configuration flows to all tasks without restart. We handle: 

- **Bootstrap:** On Flink start, consume the latest context snapshot from Kafka (or via HTTP call) to initialize state. 

- **Config Updates:** On a new Truss publish, broadcast updated definitions (with version). Flink updates its broadcast state and can re-evaluate rules accordingly. We freeze evals for historical investigations via versioning. 

- **State Purging:** If an asset is removed from context, Flink will eventually expire its keyed state (we can set timeouts or handle tombstones in config). 

### **4.5 Example Flink Java Pseudocode** 

```
// Pseudocode outline
DataStream<ContextPackage>configStream=...;// compacted broadcast topic
MapStateDescriptor<String,MetricDef>metricStateDesc=
```

```
newMapStateDescriptor<>("metrics",String.class,MetricDef.class);
BroadcastStream<ContextPackage>broadcastConfig=
configStream.broadcast(metricStateDesc);
```

```
DataStream<SensorEvent>rawEvents=env.fromKafka("source/kafka-topic");
DataStream<SensorEvent>keyedEvents=rawEvents
```

```
.map(parse)// e.g. JSON to SensorEvent(entityId, key, value)
.keyBy(event->event.getEntityId());
```

```
BroadcastConnectedStream<SensorEvent,ContextPackage>connected=
keyedEvents.connect(broadcastConfig);
```

```
connected.process(newProcessFunctionWithConfig());
```

```
// This ProcessFunction holds KeyedState for object and reads BroadcastState
for config.
```

```
// CEP pattern example (simplified)
```

```
Pattern<SensorEvent,?>highLoss=Pattern.<SensorEvent>begin("start")
```

```
.where(ev->ev.getKey().equals("production.loss"))
.oneOrMore()
.within(Time.minutes(30));
```

```
CEP.pattern(keyedEvents,highLoss)
```

```
.select((Map<String,List<SensorEvent>>match)->{
```

```
// create issue
returnnewIssue("HighLoss",...);
```

```
});
```

Citing Flink’s core purpose: “Flink is a framework and distributed processing engine for stateful computations over unbounded data streams”【22†L54-L57】. Its exactly-once and event-time features are leveraged to ensure correctness【22†L61-L68】. 

8 

## **5. Data Ingestion and Messaging** 

### **5.1 MQTT Topics and Kafka Bridge** 

- **MQTT Structure:** Real-time data is organized by domain, e.g.: 

- 

- <mark>`dcs/<unit>/<asset>/<param>`</mark> – continuous process variables (PV). 

- 

- <mark>`alarm/<unit>/<asset>/<alarm_code>`</mark> – alarms (On/Off or alarm details). 

- 

- <mark>`apm/<asset>/<model>`</mark> – advanced analytics outputs (e.g. efficiency). 

- 

- <mark>`control/<loop>`</mark> – loop status/performance. 

- 

- <mark>`instrumental/<instrument>`</mark> – instrument health (NAMUR status, diagnostics). 

- 

- <mark>`utility/plantXX/<meter>`</mark> – utilities like gas, power, steam. 

- 

#### _Example MQTT topics:_ 

- 

- 

- 

- 

- 

- <mark>`dcs/U300/K302/discharge_pressure`</mark> (float) 

- <mark>`apm/K302/efficiency`</mark> (float) 

- <mark>`alarm/U300/PIC-301/state`</mark> (string ON/OFF) 

- <mark>`instrumental/PT-301/namur`</mark> (enum code) 

- <mark>`utility/AMMONIA_PLANT_01/steam`</mark> (float) 

• **Kafka Connect Setup:** We recommend using Confluent’s MQTT Source Connector (or similar) to ingest MQTT into Kafka. It subscribes to wildcard topics and writes each as a Kafka record 【13†L129-L137】. Each record’s key can be blank or set to the MQTT topic; the value is the payload (we can use a JSON schema). The connector ensures _at-least-once_ delivery if configured with <mark>`clean.session=false` 【</mark> 13†L42-L50】. 

- **Topic Naming:** Kafka topics may mirror MQTT or be abstracted via transformations. For simplicity, we assume one topic per MQTT _category_ , with messages containing the original full topic in the payload. For example, Kafka topic <mark>`kafka.mqtt`</mark> with records: 

```
{
"mqtt_topic":"dcs/U300/K302/discharge_pressure",
"value":4.23,
"timestamp":"2026-09-29T08:30:00Z",
"quality":"GOOD"
}
```

```
"mqtt_topic":"dcs/U300/K302/discharge_pressure",
```

The Flink parser splits out <mark>`entity_id=K302` ,</mark> <mark>`param=discharge_pressure` .</mark> Alternatively, use RegexRouter in Connect to route topics to Kafka topics like <mark>`dcs`</mark> and then parse. 

### **5.2 Message Schemas** 

We define JSON schemas (or Avro/Protobuf in production) for all message types: 

- **SensorData** (from MQTT/Kafka): 

9 

```
{
"timestamp":"2026-09-29T08:30:00Z",
"entity_id":"K302",
"asset_type":"Pump",
"parameter":"discharge_pressure",
"value":5.4,
"uom":"bar",
"quality":"GOOD"
}
```

#### • **CalculatedMetric** (if needed): 

```
{
"timestamp":"...",
"entity_id":"K302",
"metric":"APM.efficiency",
"value":76.2,
"quality":"GOOD"
}
```

#### • **IssueEvent** (Flink → clients): 

```
{
"issue_id":"I-204",
"entity_id":"K302",
"type":"EfficiencyDeviation",
"start_time":"2026-09-29T08:17:00Z",
"status":"ACTIVE",
"description":"Efficiency below target",
"severity":"High"
}
```

#### • **AssetStateUpdate** : 

```
{
"entity_id":"K302",
"timestamp":"2026-09-29T08:30:12Z",
"state":{
"operating":"Running",
"suction_pressure":{"value":4.1,"uom":"bar","status":
"GOOD"},
"efficiency":{"value":71.2,"uom":"%","status":"GOOD"},
"expected_eff":{"value":77.0,"uom":"%","status":"OK"}
},
"issues":["I-204"]
}
```

10 

Clients subscribe to **runtime MQTT topics** such as <mark>`traverse/runtime/entity/K302/state`</mark> or use WebSocket push. 

### **5.3 Runtime MQTT Namespace** 

We separate raw sources from runtime outputs: 

- **Source topics:** e.g. <mark>`dcs/...` ,</mark> <mark>`apm/...` .</mark> These feed the pipeline. 

- 

- **Runtime topics:** e.g. <mark>`traverse/runtime/entity/{id}/state` ,</mark> <mark>`traverse/runtime/ issue/{id}` ,</mark> <mark>`traverse/runtime/entity/{id}/history` .</mark> 

All dashboards should use the <mark>`traverse/runtime`</mark> namespace only. For example, the Plant Manager dashboard subscribes to: 

```
traverse/runtime/entity/AMMONIA_PLANT_01/state
traverse/runtime/issue/# (or filtered by plant)
```

to get plant-level and issue-level updates. 

### **5.4 Historical Data Access** 

For any metric not in the realtime feed (or to fetch past values), the system queries AVEVA PI or IoTDB: 

- **PI Web API:** Use REST calls (e.g. <mark>`/piwebapi/streams/{webId}/value`</mark> or /Interpolated to get series). This is used for legacy metrics or batch queries. 

- **IoTDB:** If historical data is in IoTDB, use its JDBC or REST interface <mark>(</mark> <mark>`/rest/v1/query`</mark> etc.). We wrap these in a **Historical Query Service** that the UI calls (via the Runtime API). This service uses the metric’s <mark>`binding`</mark> from Truss to know where to get the data. 

Example: 

Client calls <mark>`GET /runtime/asset/K302/history?metric=pressure&from=...&to=...` .</mark> The service sees <mark>`binding: PI path for PT-301` ,</mark> calls PI Web API to get pressure series, and returns: 

- `[{ "timestamp":"2026-09-29T08:00Z", "value":4.0 }, { "timestamp":"2026-09-29T08:01Z", "value":4.2 },` <mark>`...]`</mark> 

This allows the UI to plot the trend. 

## **6. Issue/Episode Ledger and Provenance** 

A core feature is that every detected “issue” or condition becomes a first-class object: 

- **Issue Record:** When Flink’s CEP or rule engine flags a condition, it creates/updates an <mark>`Issue`</mark> record with fields: <mark>`issue_id` ,</mark> <mark>`entity_id` ,</mark> <mark>`type` ,</mark> <mark>`start_time` ,</mark> <mark>`status` ,</mark> <mark>`severity` ,</mark> and a list of <mark>`evidence_refs`</mark> (IDs of readings or events that triggered it). 

- **Evidence References:** Each issue links to the raw data that caused it. For example, Issue I-204 might reference “Alarm A-567 from 08:15” and “APM finding F-321 at 08:17”. 

11 

- **Provenance:** Every field in <mark>`AssetStateUpdate`</mark> can include a <mark>`source`</mark> and <mark>`timestamp` .</mark> UI can show tooltips like “value at 08:30 from MQTT message from PLC”. 

- **Immutability:** Issue records are append-only (only status and severity may update). Historical issues are not deleted, supporting investigation of past events. 

- **Traceability:** Each returned metric includes the <mark>`definition_id`</mark> and <mark>`context_revision` .</mark> This ensures we know which version of the logic produced a value. 

The ledger runs outside of Flink’s graph context (to avoid storing every event in the main graph). It might be a Postgres or specialized ledger DB. Issues are also pushed to UI via MQTT or WS. 

## **7. Security and Access Control** 

- **Authentication:** UI users authenticate (SSO, OAuth2, etc). We assume an external auth service providing JWT tokens with user roles and allowed plants. 

- **Authorization:** The Runtime API enforces that the user’s assigned persona/role and plant(s) match the requested data. For example, a Plant Manager token for Plant01 can read only <mark>`Plant01`</mark> data. We leverage the <mark>`PersonaDefinition.allowed_scope`</mark> and <mark>`AccessPolicyReference`</mark> in Truss. 

- **Field-Level Access:** If needed, certain metrics or alarms could be hidden by role (e.g. safety alarms only for engineers). We include an <mark>`access_policy`</mark> on metrics/views to check claims. 

- **Transport Security:** All communication (HTTP, MQTT, WebSocket) uses TLS. Brokers use ACLs so only authorized clients can publish or subscribe to certain topics. 

- **MQTT Client Security:** If using WebSockets for MQTT, include token-based auth so the UI only receives its allowed topics. 

## **8. Deployment and Operations** 

### **8.1 Components and Scalability** 

- **Truss Server:** Backend (Java/Node/Python) with PostgreSQL for config. Horizontal scale not needed (transactional publish). 

- 

- **Kafka Cluster:** Handles topic throughput (likely moderate, thousands of msg/sec). Must have retention for context (compact) and event data (short-term). 

- **Flink Cluster:** Deploy on Kubernetes or YARN. Start with a few TaskManagers; scale by adding jobs or increasing parallelism per key domain. 

- **MQTT Broker:** Can use HiveMQ or Mosquitto; scale via clustering if needed. 

- 

- **PostgreSQL (State/Config):** Stores static config, and possibly current state/ledger if not held fully in Flink state (if used for queries by the API). 

- 

- **Identity/Access Server:** For auth (could be Keycloak or cloud IAM). 

- 

### **8.2 CI/CD and Versioning** 

- **Truss Models:** Stored in Git, changes reviewed. Each published model auto-generates a new revision (e.g. <mark>`v2026-09-01` )</mark> . 

- **Config Packages:** Tie to Truss model revision. Flink reads context revision 42, 43, etc. A new Flink deployment only after successful compile/validation of package. 

- 

- **Flink Code:** Also in Git. Releases tagged with compatibility. Use savepoints for upgrades: when updating job logic, take a savepoint, deploy new jar, restore state. 

- **Testing:** Unit tests for each CalculationDefinition, end-to-end tests using recorded streams. 

- 

12 

### **8.3 Monitoring and Logs** 

- **Metrics:** Expose Flink metrics (latency, throughput, backlog). Monitor Kafka consumer lag for realtime topics. Monitor data freshness (e.g. last update time for critical signals). 

- **Alerts:** Automate alerts for dropped messages, context mismatch, or if a critical issue remains unresolved. 

- **Logging:** Flink logs trace errors to trace missing data or rule misfires. Truss logs validation errors on config publication. 

## **9. Implementation Plan** 

### **9.1 Tasks for Truss Team** 

1. **Schema Updates:** Add <mark>`PersonaDefinition` ,</mark> <mark>`SemanticViewDefinition` ,</mark> <mark>`CalculationDefinition` ,</mark> <mark>`MetricBinding` ,</mark> etc. to the Truss data model. Define database 

tables or JSON structures accordingly. 

2. **Persona and View Configuration:** Define at least one Plant Manager persona, a Plant Overview view, Unit and Equipment views as needed. Enter definitions (e.g. via admin UI or config files). 

3. **KPI and Binding Setup:** Register semantic KPIs (production, energy, efficiency, etc.), associate them with CalculationDefinitions or bindings (PI/IoTDB path, formula). Ensure consistency. 

- **Drill and Navigation Rules:** Configure how drill-down works (e.g. Plant exception → Unit view; Equipment view → relevant loops/instruments). 

4. 

5. **Publish Service:** Implement or configure context publication: assemble config into versioned package, write to Kafka or expose via REST. (Use JSON or YAML format, see example below.) 

6. **Access Control:** Map UI roles to PersonaDefinitions; assign users to plants in ResponsibilityAssignment. 

- **Documentation:** Document new config types and how to use them. 

7. 

### **9.2 Tasks for Unified UI Team** 

- **API Contract Design:** Specify REST/WebSocket endpoints: 

1. 

2. <mark>`GET /api/runtime/entity/{id}`</mark> → returns current state JSON (see example in Section 5). 

3. <mark>`GET /api/runtime/entity/{id}/history?metric=X&from=...&to=...`</mark> → time series JSON. 

4. <mark>`GET /api/runtime/issue/{issueId}`</mark> → returns issue details with evidence. 

5. WebSocket <mark>`ws://.../subscribe`</mark> to topics like <mark>`runtime/entity/{id}/state` ,</mark> <mark>`runtime/ issue/#` .</mark> 

6. **OpenBridge Components:** Identify needed widgets from OpenBridge library: e.g. <mark>`kpivaluecard` ,</mark> <mark>`chart-trend` ,</mark> <mark>`data-table` ,</mark> <mark>`breadcrumb` .</mark> Possibly extend or theme them. 

- **Persona View:** Implement Plant Manager dashboard: 

7. 

8. Use retrieved data (Plant state JSON) to populate overview cards (production, energy, availability). 

- Unit grid/table with health badges (OK/ATTENTION). 

9. 

   - Charts for trend (connect to history API). 

10. 

   - Issue list (subscribe to issue updates). 

11. 

12. Drill actions: clicking a card or issue must navigate (e.g. push new route and fetch entity details). 

13 

13. **Asset Page:** A generic view that shows an equipment’s state and recent issues (subscribe to `/` <mark>`entity/{id}` )</mark> , with a “Investigate” button to open the issue page. 

14. **Issue/Investigation Page:** Display issue details and timeline of related evidence (fetch via history and context API). 

15. **Connectivity:** Implement MQTT/WS connection (socket with JWT token). Ensure automatic reconnection and snapshot retrieval on load. 

16. **Testing:** Create mock data feed (see example in Section 11) and verify UI reacts correctly. Use storybook to test OpenBridge components with sample JSON. 

17. **Persona Switch:** Ensure UI can change persona (e.g. for demo/test, or reflect different roles). 

### **9.3 Timeline (Illustrative)** 

|Phase|Duration|Milestone|
|---|---|---|
|**Design & Review**|1-2 weeks|Architecture approval, schema design|
|**Truss Implementation**|2-3 weeks|Schema updates, initial context config|
|**Flink Setup**|2 weeks|Basic engine with context ingestion|
|**Data Pipeline**|2 weeks|MQTT→Kafka connect, topic schemas|
|**Runtime Logic**|3-4 weeks|Calculations, CEP rules, state updates|
|**UI Development**|3-4 weeks|Plant dashboard, asset and issue pages|
|**Integration Testing**|2 weeks|End-to-end with sample data|
|**Optimization & Hardening**|2 weeks|Performance tuning, security review|
|**Demo & Training**|1 week|Live demo with simulation scenario|



Adjust based on team size and parallelization. 

## **10. Example Simulation** 

We illustrate with our **Ammonia Plant** example from Section 3. For brevity, focus on a single asset chain. 

### **10.1 Truss Context Example (YAML)** 

```
# Published context package for AMMONIA_PLANT_01
entity_id:AMMONIA_PLANT_01
type:Plant
children:["U300"]
metrics:
production.shift_total:
source:"MQTT"
topic:"source/mqtt/production/plant01/shift_total"
uom:"tonnes"
utilities.steam:
source:"MQTT"
topic:"source/mqtt/utility/AMMONIA_PLANT_01/steam"
```

14 

```
uom:"tonnes"
energy.specific:
formula:"utilities.steam/production.shift_total"
uom:"tonne_steam_per_tonne_product"
assessments:
specific_energy_status:
type:threshold
value_metric:energy.specific
target:0.55# threshold t/t
severity:["warning","critical"]
```

```
# Unit U300 context
entity_id:U300
type:Unit
parent:AMMONIA_PLANT_01
metrics:
production.shift_total:
source:"MQTT"
topic:"source/mqtt/production/U300/shift_total"
utilities.steam:
source:"MQTT"
topic:"source/mqtt/utility/U300/steam"
```

```
# Equipment K-302 context
entity_id:K-302
type:Equipment
parent:U300
signals:
suction_pressure:"dcs/U300/K302/suction_pressure"
discharge_pressure:"dcs/U300/K302/discharge_pressure"
speed:"dcs/U300/K302/speed"
kpis:
efficiency:
formula:"apm/K302/efficiency"# assume APM publishes this
expected_eff:
formula:"apm/K302/expected_efficiency"
issues:
allow:
-HydraulicPerformanceIssue
```

```
# PersonaDefinition for Plant Manager
id:Persona.PM
default_scope:AMMONIA_PLANT_01
home_view:PlantOverview
```

15 

### **10.2 MQTT Message Flows** 

Below is a sample sequence of incoming MQTT messages (as JSON) and the resulting state updates: 

|Time|MQTT Topic|Payload|Description|
|---|---|---|---|
|08:00:00|`source/mqtt/production/`|`{value:1200.0,`|Plant production|
|UTC|`plant01/shift_total`|`timestamp:...}`|today at shift end.|
|08:00:00|`source/mqtt/production/`|`{value:450.0,`|Unit U300|
|UTC|`U300/shift_total`|`timestamp:...}`|production.|
|08:01:00|`d/U300/K302/d`|`{value:1490,`|Compressor speed|
|UTC|`csspee`|`ts:...}`|(updates every sec).|
|08:01:05<br>UTC|`apm/K302/efficiency`|`{value:71.0,`<br>`ts:...}`|APM model reports<br>71% eff.|
|08:01:05|`apm/K302/`|`{value:77.0,`|APM td 77%|
|UTC|`expected_efficiency`|`ts:...}`|expece .|
|08:02:00|`l/U300/PIC301/tt`|`{value:"ALARM",`|Loop PIC-301 alarm|
|UTC|`aarm-sae`|`ts:...}`|goes active.|
|08:02:10|`instrumental/PT-301/`|`{value:"OK",`|Instrument reports|
|UTC|`diagnostic`|`ts:...}`|OK status.|



The Flink job processes these: 

- **State updates:** When 08:00 data arrives, Flink updates <mark>`Plant.production.shift_total=1200` ,</mark> <mark>`U300.production.shift_total=450` .</mark> It 

- computes <mark>`Plant.energy.specific = steam / production` .</mark> (Assume steam=700 => 0.583). 

- **Issue detection:** At 08:01:05, the plant sees <mark>`U300.efficiency=71%`</mark> vs expected 77%. Flink CEP, given a rule like “eff < expected - 3% => raise performance issue,” creates <mark>`Issue I-204`</mark> on K-302 (efficiency deviation). 

- **Update asset:** K-302 state now has <mark>`{efficiency:71%, expected:77%}`</mark> and <mark>`issues: [I-204]` .</mark> 

- **Notifications:** Flink emits <mark>`runtime/issue/I-204`</mark> with details, and publishes updated <mark>`K-302`</mark> state to <mark>`runtime/entity/K-302/state` .</mark> 

- 

### **10.3 API Usage and UI** 

1. **Plant Manager Dashboard loads:** UI calls <mark>`GET /api/runtime/entity/AMMONIA_PLANT_01` .</mark> Returns JSON with latest production, specific energy, unit summaries (including U300’s status). 

2. **Live updates:** The UI subscribes (WebSocket) to <mark>`runtime/entity/AMMONIA_PLANT_01/state`</mark> and to issues for Plant01. If any update (e.g. 

U300 production changed), the card refreshes. 

3. **Drill into U300:** Clicking “U300 ATTENTION” issues <mark>`GET /api/runtime/entity/U300` ,</mark> showing unit metrics and list of critical assets (K-302 appears as attention). 

4. **Click K-302:** UI now requests <mark>`/api/runtime/entity/K-302` .</mark> This shows current state (speed, pressures, eff, issues=[I-204]). The UI highlights “Efficiency low (I-204)”. 

16 

5. **Open Issue I-204:** UI calls <mark>`/api/runtime/issue/I-204` .</mark> The response includes: 

6. Issue description, type, severity. 

7. A list of supporting data points (APM output, loop alarm). 

8. **Evidence:** URLs to fetch time-series (e.g. <mark>`/api/runtime/entity/U300/history? metric=speed&from=...` )</mark> . The UI plots these (e.g. efficiency over time). 

9. **Historical Trend:** For context, clicking trend on dashboard calls <mark>`/api/runtime/asset/U300/ history?metric=production.shift_total&from=...&to=...`</mark> and plots it. 

Throughout, every displayed value shows its source and timestamp (e.g. “from APM model, t=08:01:05”). 

### **10.4 UI Mock-up (Textual)** 

```
Ammonia Plant 01 | Current Shift
-------------------------------------------
Production: 1200 t      vs Plan: 1250 t (96%)
Specific Energy: 0.58 tsteam/t   (Target 0.55)
Availability: 98.7%
Units:
- U300: ATTENTION – High energy; K-302 effi low
- U200: OK
- U400: OK
Production/Plan (chart)  Specific Energy (chart)
Top Exceptions:
[ HIGH ] U300 / K-302: Efficiency 71% vs 77%
[ WARNING ] U300: Specific energy 0.58 vs target 0.55
[ INFO ] U200: Minor deviations...
```

Clicking the first exception drills to K-302’s detail/investigation view. 

## **11. Acceptance Criteria** 

To be convinced of correctness, we test: 

|Check|Expected Result|
|---|---|
|**Same KPI via different**<br>**persona**|Value is identical; no conflict.|
|**Asset state retrieval**|REST returns latest state JSON with sources/quality for each field.|
|**Real-time update**|Pushing new MQTT data updates UI within seconds (via WS).|
|**Drill maintains**<br>**context**|Filters remain (e.g. plant/shift remain same when drilling into units).|
|**Issue transparency**|Issue page lists exactly the evidence and calculations (no hidden data).|



17 

|Check|Expected Result|
|---|---|
|**Historical query**|Trends from PI/IoTDB match known data; UI overlays plan vs actual if<br>needed.|
|**Missing data handling**|If an instrument goes offline, UI shows “stale” rather than default 0.|
|**Access control**|Plant Manager token only sees Plant01; cannot see Plant02’s data.|
|**System resilience**|On broker restart, Flink resumes from Kafka; UI reconnects via WS.|
|**Config update**|Changing a KPI definition in Truss (and republishing) updates Flink logic<br>after propagation.|
|**Performance**|System sustains data rates (e.g. 1000 msg/s) with <1s UI latency.|
|**End-to-end validity**|Given a known scenario, the end user (Plant Manager) can follow an<br>investigation from plant KPI down to sensor evidence.|



Each criterion should be checked with unit tests, integration tests or manual verification. 

## **12. Conclusion** 

This specification outlines a **complete living-asset architecture** : Truss-driven configuration, Flinkbased runtime and a modern UI. The key principle is _reuse and separation of concerns_ : Truss owns the model and calculation rules【22†L54-L57】, Flink executes them and maintains state, and the UI simply presents filtered slices. Personae are achieved via different views on the same objects. 

By following this plan, the Truss team and UI team can work in parallel. The Truss team delivers the certified context (schema, entities, KPIs), while the UI team builds against the published Runtime APIs and uses OpenBridge components【15†L31-L39】 for consistency. The Flink runtime compiles the model into actionable analytics, ensuring real-time situational awareness with complete traceability. This will enable a Plant Manager to drill from a business KPI into the precise root cause with confidence. 

**Key References:** Apache Flink for stateful stream processing【22†L54-L57】【22†L61-L68】, Confluent MQTT Connector for MQTT-Kafka integration【13†L129-L137】, and the OpenBridge industrial UI design system【15†L31-L39】 were used as guidance in this design. 

18 

