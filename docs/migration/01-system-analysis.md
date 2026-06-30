# Stage A.1 — Migration Readiness Report: System Analysis

**Document:** `01-system-analysis.md`  
**Date:** 2026-06-30  
**Status:** VERIFIED AGAINST SOURCE CODE  
**Scope:** PI Vision++ reference app → AMS / Traverse Edge unification

---

## 1. Executive Summary

This report inventories the **actual state** of both applications by examining source code, docker-compose files, package.json dependencies, and database schemas. All claims have been verified against code; discrepancies with documentation are flagged.

**Key Finding:** The reference app documentation states "Konva canvas" as the designer engine, but code inspection reveals **dual implementations**: a DOM/SVG-based `Canvas.tsx` (currently active) alongside an alternative `KonvaCanvas.tsx`. The DOM/SVG implementation aligns with the feasibility plan's recommendation to retire Konva.

---

## 2. Reference Application Inventory (PI Vision++ / xmlgraphics-batik-main)

### 2.1 Service Inventory

| Service | Runtime | Port | Entry Point | Status | Doc vs Code |
|---------|---------|------|-------------|--------|-------------|
| `frontend` | React 19 + Vite 7 | 3000→5173 | `industrial-vis-frontend/src/main.tsx` | **REAL** | ✓ Match |
| `industrial-platform` | Spring Boot 3.1 / Java 17 | 8081→8080 | `VisPlatformMain.java` | **REAL** | ✓ Match |
| `template-service` | Spring Boot 3.2 / Java 17 | 3001 | Module 1 | **REAL** | ✓ Match |
| `hierarchy-service` | Spring Boot 3.2 / Java 17 | 3002 | Module 2 | **STUB** | ⚠️ Doc says "full API lives in industrial-platform" |
| `analysis-service` | Spring Boot 3.2 / Java 17 | 3003 | Module 5 | **REAL** | ✓ Match |
| `auth-service` | Node.js 20 / Express | 8080 | JWT login | **BUILT BUT NOT ROUTED** | ⚠️ Auth routed to industrial-platform |
| `asset-service` | Node.js / Express | 8080 | Mock assets | **MOCK** | ✓ Match |
| `realtime-service` (data-gateway) | Node.js / Socket.IO | 8080 | WebSocket bridge | **REAL** | ✓ Match |
| `query-service` | Node.js / Express | 8080 | Historical mock | **MOCK** | ✓ Match |
| `batik-microservice` | Spring Boot / Batik | — | `ConverterController.java` | **REAL (not in compose)** | ✓ Match |
| `graph-service` | Java / Neo4j | — | Impact analysis | **COMMENTED OUT** | ✓ Match |
| `ml-inference-service` | Python | — | Anomaly detection | **COMMENTED OUT** | ✓ Match |
| `streampipes-backend` | Apache StreamPipes 0.95 | 8030 | Pipeline mgmt | **REAL** | ✓ Match |
| `streampipes-ui` | Apache StreamPipes 0.95 | 8088 | Pipeline design | **REAL** | ✓ Match |
| `streampipes-extensions` | Apache StreamPipes 0.95 | 8090 | JVM processors | **REAL** | ✓ Match |

### 2.2 Data Stores

| Store | Technology | Container Port | Host Port | Ownership | Verified Tables/Paths |
|-------|------------|----------------|-----------|-----------|----------------------|
| PostgreSQL | 14-alpine | 5432 | internal | industrial-platform | `industrial_vis`: `element_templates`, `elements`, `attribute_instances`, `analysis_definitions`, `display_definitions`, `display_versions`, `display_comments`, `uom_classes`, `uom_units`, `categories`, `roles`, `users`, `audit_logs` |
| IoTDB | 1.0.0-standalone | 6667 | 26667 | industrial-platform | AF-derived device paths (auto-schema) |
| CouchDB | 3.3 | 5984 | internal | StreamPipes | `genericstorage` (SP config + legacy displays) |
| Redis | alpine | 6379 | 26379 | template-service, hierarchy-service, realtime-service | Caching only |

### 2.3 Messaging (Kafka)

**Verified Topic Catalog:**

| Topic | Producer(s) | Consumer(s) | Payload |
|-------|-------------|-------------|---------|
| `af.live.stream` | AFImportService, StreamPipesGenerator, opc_ua_bridge | AnalysisService, IoTDBWriterService | Live telemetry |
| `af.computed.stream` | AnalysisService, BackfillEngine | Frontend bindings | Computed values |
| `af.raw.xml` | ImportController | Audit | Raw AF XML |
| `af.template.created` | TemplateService | Downstream | Template events |
| `template.propagated` | TemplatePropagationService | Hierarchy sync | Inheritance |
| `af.events` | EventFrameService | GraphSyncConsumer | Event frames |
| `af.analysis.results` | AnalysisEngineService | Self (feedback) | Analysis output |

### 2.4 Live Data Path (Verified in Code)

```
OPC UA / StreamPipes Adapter
    ↓ Kafka (af.live.stream)
    ↓ analysis-service (optional compute)
    ↓ Kafka (af.computed.stream / af.live.stream)
    ↓ realtime-service (data-gateway)
    ↓ Socket.IO WebSocket
    ↓ Frontend (useDataManager store)
```

**Socket.IO Protocol (verified in `data-gateway`):**
- Client connects: `/socket.io/`
- Subscribe: `subscribe` event with tag list
- Server emits: `tag:update` with `{ tag, value, timestamp, quality }`

### 2.5 Historical Data Path (Verified in Code)

```
Frontend (useHistoricalData hook)
    ↓ GET /api/query/history (via query-service MOCK)
    ↓ [Production: industrial-platform → IoTDB Session API]
    ↓ JSON time-series response
```

**⚠️ Discrepancy:** `query-service` is a MOCK with simulated data. Real IoTDB queries go through `industrial-platform/QueryController` directly (port 8081), which is NOT routed through NGINX gateway.

### 2.6 Designer Stack (Verified Against Source)

#### Canvas Implementation

**Package.json dependencies (verified):**
```json
{
  "konva": "^10.2.0",
  "react-konva": "^19.2.2",
  "echarts": "^6.0.0"
}
```

**⚠️ CRITICAL FINDING:** Two canvas implementations exist:

| File | Technology | Status |
|------|------------|--------|
| `Canvas.tsx` | DOM/SVG with `foreignObject` | **ACTIVE** - Default implementation |
| `KonvaCanvas.tsx` | react-konva canvas | **ALTERNATIVE** - Exists but not primary |

The active `Canvas.tsx` uses:
- React DOM with absolute positioning
- SVG `<foreignObject>` for PIVision rendering mode
- CSS transforms for zoom/pan
- `SymbolHost` component renders symbols as DOM elements (not canvas)

#### Symbol Library

**Location:** `Graphics/` folder  
**Format:** SVG files with ISA-5.1-style symbols  
**Loading:** `SymbolLibraryHydrator` fetches from `/Graphics/` path  
**Multi-state:** Rule engine in `editorStore` applies `states[]` array with conditional styling

#### Binding Model (Verified in `editorStore.ts` and `Canvas.tsx`)

```typescript
interface CanvasItem {
  bindings: {
    value?: string;    // Tag path for numeric value
    status?: string;   // Tag path for boolean/status
    level?: string;    // Tag path for tank levels
    [key: string]: string | undefined;
  };
  states?: StateRule[];  // Multi-state logic
}
```

Binding resolution via `BindingResolverService`:
- Resolves tag paths to Kafka topics / IoTDB paths
- Placeholder topics (`af.placeholder.{hash}`) for unresolved bindings

#### Display Persistence Schema (Verified in `schema.sql`)

```sql
display_definitions (
    id UUID PRIMARY KEY,
    name VARCHAR(255),
    current_version_id UUID,
    -- ...
)

display_versions (
    id UUID PRIMARY KEY,
    display_id UUID REFERENCES display_definitions(id),
    version_number INTEGER,
    snapshot JSONB,  -- Full PDIX/JSON snapshot
    checksum VARCHAR(64),
    -- ...
)

display_comments (
    id UUID PRIMARY KEY,
    display_id UUID,
    version_id UUID,
    comment TEXT,
    symbol_id VARCHAR(100),
    position_x DOUBLE PRECISION,
    position_y DOUBLE PRECISION
)
```

#### Batik Role (Verified)

**NOT used for interactive canvas.** Batik modules are used for:
1. SVG parsing (`batik-parser`, `batik-dom`)
2. GVT manipulation (`batik-gvt`, `batik-bridge`)
3. Server-side rasterization (`batik-microservice/ConverterController.java`)

The `batik-microservice` exposes:
- `POST /convert` — multipart SVG upload → PNG/JPEG response

---

## 3. AMS / Traverse Edge Application Inventory

### 3.1 Service Inventory

| Service | Runtime | Port | Entry Point | Status |
|---------|---------|------|-------------|--------|
| `ams-api` | .NET 8 | 8000 | `AMS.Api` | **REAL** |
| `ams-frontend` | React 18 + Vite 5 | 3000→80 | `frontend-ob/src/main.tsx` | **REAL** |
| `sparkplug-edge-node` | Node.js | — | Kafka→EMQX bridge | **REAL** |
| `historian-bff` | .NET 8 Minimal API | 8090 | `/trend`, `/raw`, `/snapshot` | **REAL** |
| `flink-jobmanager` | Flink 1.18 / Java 11 | 8082→8081 | JobManager | **REAL** |
| `flink-taskmanager` | Flink 1.18 / Java 11 | — | TaskManager | **REAL** |
| `flink-job-submit` | Flink 1.18 | — | OpcEventStreamJob | **REAL** |
| `flink-job-submit-iotdb` | Flink 1.18 | — | IoTDBPersistenceJob | **REAL** |
| `flink-job-submit-live-state` | Flink 1.18 | — | LiveStateJob | **REAL** |

### 3.2 Data Stores

| Store | Technology | Port | Verified Schema/Paths |
|-------|------------|------|----------------------|
| PostgreSQL | TimescaleDB/pg15 | 5433→5432 | `alarms.alarm_current`, `alarms.alarm_history`, `configuration.opc_servers` |
| IoTDB | 1.3.2-standalone | 6667, 8181 | `root.ams.site1.alarms.*` |
| Redis | 7.2-alpine | 6380→6379 | `snapshot:metric:*`, `alias:*` |
| EMQX | 5.6.0 | 1883, 8083, 18083 | Sparkplug B topics |

### 3.3 Messaging (Kafka)

**Verified Topic Catalog (from docker-compose + code):**

| Topic | Producer | Consumer | Purpose |
|-------|----------|----------|---------|
| `raw-alarms` | External OPC feeds | Flink OpcEventStreamJob | OPC-AE telemetry |
| `current-alarm-state` | Flink | NormalizedAlarmConsumerService | Production alarm stream |
| `live.alarms` | Flink LiveStateJob | sparkplug-edge-node | Live alarm state |
| `live.metrics` | Flink LiveStateJob | sparkplug-edge-node | Live metrics (RBE) |
| `operator-actions` | AMS API | Flink | ACK commands |
| `ack-writeback` | Flink | OPC Gateway | DCS writeback |
| `ack-results` | OPC Gateway | Flink, API | ACK confirmation |
| `lifecycle-events` | API, Gateway, Flink | LifecycleEventConsumer | State machine log |

### 3.4 Live Data Path (Verified in `mqttStore.ts`)

```
Flink LiveStateJob
    ↓ Kafka (live.alarms / live.metrics)
    ↓ sparkplug-edge-node
    ↓ EMQX (Sparkplug B: spBv1.0/ams_site1/DDATA/ams_edge1/*)
    ↓ MQTT.js WebSocket (ws://localhost:8083/mqtt)
    ↓ sparkplug-payload decode
    ↓ mqttStore (Zustand)
    ↓ React components
```

**Snapshot-on-open (verified):**
1. `GET /api/hist/snapshot?assets=*` → Redis snapshot
2. Parse `{ device: { metric: { v, q, ts } } }`
3. Subscribe DDATA topics for live deltas

### 3.5 Historical Data Path (Verified in `mqttStore.ts`)

```
Frontend (fetchTrend / fetchRaw)
    ↓ GET /api/hist/trend?series=&start=&end=&width=
    ↓ historian-bff
    ↓ IoTDB REST v2 (port 8181)
    ↓ Decimated/aggregated response
```

### 3.6 OpenBridge Usage (Verified in `package.json`)

```json
{
  "@oicl/openbridge-webcomponents": "^1.0.1",
  "@oicl/openbridge-webcomponents-react": "^1.0.1"
}
```

**Usage pattern:** AMS frontend uses the core web components directly. Components observed:
- Alarm console (AG Grid-based, not OpenBridge)
- Dashboard layouts
- System monitor

**Theming:** Not explicitly using OpenBridge palettes (day/dusk/night) yet.

**Client code available for reuse:**
- `mqttStore.ts` — MQTT.js + Sparkplug connection
- `alarmStore.ts` — SignalR alarm subscriptions
- `historianHealth.ts` — Historian BFF health checks

---

## 4. Flink Jobs Summary (AMS)

| Job | Entry Class | Sources | Sinks | Purpose |
|-----|-------------|---------|-------|---------|
| OpcEventStreamJob | `com.ams.flink.OpcEventStreamJob` | alarm-created, alarm-updated, alarm-cleared, alarm-acknowledged, operator-actions, ack-results | JDBC (alarm_current, alarm_history), Kafka (ack-writeback, alarm-acknowledged) | Alarm state machine + ACK routing |
| IoTDBPersistenceJob | `com.ams.flink.IoTDBPersistenceJob` | raw telemetry | IoTDB Tablet writes | Time-series persistence |
| LiveStateJob | `com.ams.flink.LiveStateJob` | raw telemetry | Kafka (live.alarms, live.metrics) | RBE filtering → Sparkplug edge node |

---

## 5. Critical Discrepancies Between Docs and Code

| Area | Documentation Claim | Code Reality | Impact |
|------|---------------------|--------------|--------|
| Designer canvas | "Konva-based canvas" | DOM/SVG `Canvas.tsx` (active); `KonvaCanvas.tsx` (alternative) | **Positive** — aligns with feasibility recommendation |
| hierarchy-service | "Module 2 hierarchy engine" | Stub service; full API in industrial-platform | Consolidation target already partially centralized |
| query-service | "Historical queries" | MOCK service with simulated data | Must use industrial-platform:8081 directly |
| auth-service | "JWT authentication" | Built but NOT routed; auth via industrial-platform | Single auth point already in place |
| NGINX routing | "Single entry point" | Several endpoints not proxied (displays, events, hierarchy full API) | Gateway config needs completion |
| StreamPipes | "Compute layer" | Used for adapters + pipelines | Must retire compute usage, keep adapters only (per feasibility) |

---

## 6. Technology Stack Comparison

| Layer | Reference App | AMS / Traverse | Unification Target |
|-------|---------------|----------------|-------------------|
| Frontend Framework | React 19 + Vite 7 | React 18 + Vite 5 | React 18 (stable) |
| State Management | Zustand 5 | Zustand 4 | Zustand 4 (stable) |
| Designer Canvas | DOM/SVG + Konva (alt) | None | DOM/SVG (retire Konva) |
| HMI Components | Custom symbols | OpenBridge 1.0 | OpenBridge |
| Live Transport | Socket.IO | Sparkplug B / MQTT | Sparkplug B / MQTT |
| Alarm UI | Custom | SignalR + AG Grid | SignalR + AG Grid |
| Stream Compute | StreamPipes 0.95 | Flink 1.18 | Flink only |
| Historian | IoTDB 1.0 | IoTDB 1.3 | IoTDB 1.3 |
| Metadata DB | PostgreSQL 14 | PostgreSQL/Timescale 15 | PostgreSQL/Timescale 15 |
| Cache | Redis | Redis 7.2 | Redis 7.2 |
| Messaging | Kafka (Confluent 7.3) | Kafka (Confluent 7.5) | Kafka 7.5 |

---

## 7. Verified Port Map

### Reference Application

| Service | Host Port | Container Port |
|---------|-----------|----------------|
| Frontend | 3000 | 5173 |
| NGINX Gateway | 8080 | 80 |
| industrial-platform | 8081 | 8080 |
| StreamPipes Backend | 8030 | 8030 |
| StreamPipes UI | 8088 | 8088 |
| Kafka | 9092, 29092 | 9092 |
| IoTDB | 26667 | 6667 |
| Redis | 26379 | 6379 |

### AMS / Traverse

| Service | Host Port | Container Port |
|---------|-----------|----------------|
| Frontend | 3000 | 80 |
| AMS API | 8000 | 8000 |
| Flink UI | 8082 | 8081 |
| historian-bff | 8090 | 8090 |
| IoTDB | 6667, 8181 | 6667, 8181 |
| Redis | 6380 | 6379 |
| Kafka | 9093 | 9092 |
| EMQX | 1883, 8083, 18083 | same |
| Grafana | 3001 | 3000 |
| Prometheus | 9090 | 9090 |

---

## 8. RBAC Comparison

| Role | Reference Permissions | AMS Mapping |
|------|----------------------|-------------|
| Admin | Full R/W/D all modules | Admin |
| Engineer | R/W templates, elements, analyses; R security | Engineer |
| Operator | R templates/elements; R/W attributes | Operator |
| Viewer | R only | Viewer |

**ISA-101 alignment:** Both implement 4-tier model (admin/engineer/operator/viewer). Unification should preserve this.

---

## 9. Summary Findings

### Ready for Migration
1. **Display persistence model** — PostgreSQL schema exists, can map to new database
2. **Template/hierarchy engine** — Centralized in industrial-platform, ready to extract
3. **Binding resolver concept** — Exists, needs UNS alignment
4. **DOM/SVG canvas** — Already active, aligns with target architecture

### Requires Re-platforming
1. **Live transport** — Socket.IO → Sparkplug B/MQTT
2. **Stream compute** — StreamPipes → Flink
3. **Historical queries** — Align to historian-bff pattern
4. **CouchDB data** — Migrate to PostgreSQL, retire CouchDB

### Gaps to Fill
1. **HMI designer in AMS** — Does not exist; must build
2. **ISA-5.1 symbol library** — Theme-aware SVGs needed
3. **Multi-state rule engine** — Port from reference app
4. **Namespace reconciliation** — UNS definition needed

---

*Document generated from source code analysis. Verified against:*
- `infra/docker/docker-compose.yml` (AMS)
- `docker-compose.yml` (reference app)
- `package.json` (both frontends)
- `services/db/schema.sql` (reference app)
- `database/scripts/02_alarm_schema.sql` (AMS)
- Source files: Canvas.tsx, KonvaCanvas.tsx, mqttStore.ts, editorStore.ts
