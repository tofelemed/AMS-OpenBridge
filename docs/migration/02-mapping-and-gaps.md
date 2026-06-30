# Stage A.2 — Component Mapping & Gap Analysis

**Document:** `02-mapping-and-gaps.md`  
**Date:** 2026-06-30  
**Status:** ANALYSIS COMPLETE — AWAITING DECISIONS  
**Scope:** PI Vision++ reference app → AMS / Traverse Edge unification

---

## 1. Component Mapping Table

### 1.1 Service-Level Disposition

| Reference Component | Location | Disposition | Target in AMS | Notes |
|---------------------|----------|-------------|---------------|-------|
| **industrial-platform** (Spring Boot hub) | `industrial-vis-platform/` | **SPLIT** | Asset Model + Template + Analysis-def + Display services | Central orchestrator becomes multiple bounded services |
| **template-service** (Module 1) | `services/template-service/` | **PORT** | `traverse_templates` DB, new Spring/Java service | Keep API, migrate data |
| **hierarchy-service** (Module 2) | `services/hierarchy-service/` | **CONSOLIDATE** | **Asset Model service** = UNS source of truth | Stub → full implementation |
| **analysis-service** (Module 5) | `services/analysis-service/` | **RE-PLATFORM** | Design-time CRUD → `traverse_analysis` DB; execution → Flink | Split design from runtime |
| **Display engine** (Module 12) | `industrial-vis-platform/` | **PORT** | `traverse_displays` DB, Display service | Keep versioning/diff/comments |
| **BindingResolverService** | `industrial-vis-platform/core/` | **PROMOTE** | First-class **Binding Resolver BFF** | UNS path+role → transport |
| **Designer frontend** (Canvas.tsx) | `industrial-vis-frontend/` | **PORT** | New routes in `src/frontend-ob` | DOM/SVG substrate retained |
| **KonvaCanvas.tsx** (alternative) | `industrial-vis-frontend/` | **DROP** | — | Not needed; DOM/SVG is target |
| **Graphics/ symbols** | `Graphics/` folder | **MIGRATE** | Theme-aware SVG library | Re-theme to OpenBridge tokens |
| **realtime-service** (data-gateway) | `services/data-gateway/` | **DROP** | EMQX Sparkplug + mqttStore | Socket.IO → Sparkplug |
| **query-service** (mock) | `services/query-service/` | **DROP** | historian-bff | Mock replaced by real BFF |
| **batik-microservice** | `batik-microservice/` | **DROP** | Headless Chromium render (if needed) | Batik structurally cannot render web components |
| **auth-service** | `services/auth-service/` | **DROP** | AMS identity model | Already routed to industrial-platform |
| **asset-service** (mock) | `services/asset-service/` | **DROP** | Asset Model service | Mock replaced by real service |
| **StreamPipes backend/ui/extensions** | docker services | **DROP** (compute); **DEFER** (adapters) | Flink only | See §1.2 decision |
| **CouchDB** | docker service | **DROP** | — | Migrate data to PostgreSQL |
| **graph-service** (Neo4j) | `services/graph-service/` | **DEFER** | — | Out of first-release scope |
| **ml-inference-service** | `services/ml-inference-service/` | **DEFER** | — | Out of first-release scope |

### 1.2 Open Decision: StreamPipes Disposition

**Options:**
- **RETIRE (Recommended):** Drop StreamPipes entirely; Flink-only compute per Traverse spec
- **RETAIN Connect Only:** Keep StreamPipes Connect for UI-driven OT-adapter onboarding; no compute pipelines

**Current state:** StreamPipes 0.95 runs adapters + pipelines. The feasibility plan recommends retiring compute usage but notes "the only reason to retain StreamPipes would be its UI-driven OT-adapter onboarding."

---

## 2. Namespace Reconciliation Plan

### 2.1 Current State

| Application | Namespace Pattern | Example |
|-------------|-------------------|---------|
| AMS | `root.ams.site1.alarms.*` | `root.ams.site1.alarms.FIC1002` |
| Reference (AF) | AF-derived device paths | `Houston/CrudeUnit1/Pump101.DischargePress` |

### 2.2 Unified Namespace (UNS) Structure

**Target pattern (ISA-95 aligned):**

```
root.<site>.<area>.<unit>.<device>.<measurement>
```

**Mapping rules:**

| Representation | Generated From UNS | Example |
|----------------|-------------------|---------|
| **IoTDB tree path** | Direct | `root.site1.u200.p101.disch_press` |
| **Sparkplug topic** | `spBv1.0/<site>_<area>/DDATA/<edge>/<device>` | `spBv1.0/site1_u200/DDATA/edge1/p101` |
| **Sparkplug metric** | `<device>/<measurement>` + alias | `p101/disch_press` (alias 1042) |
| **Alarm source** | `<site>.<area>.<unit>.<device>` | `site1.u200.p101` |

### 2.3 Migration Path

1. **Asset Model service** becomes single source of UNS truth
2. Each asset entry stores: `{ path, iotdbPath, sparkplugGroup, sparkplugEdge, sparkplugDevice }`
3. Binding Resolver queries Asset Model to resolve `path + role` → concrete transport
4. Legacy `root.ams.site1.alarms.*` paths aliased during transition, then migrated

### 2.4 IoTDB Tree Reconciliation

| Current (AMS) | Current (Reference) | Unified |
|---------------|---------------------|---------|
| `root.ams.site1.alarms.FIC1002` | `root.houston.crude1.pump101.discharge_press` | `root.site1.u200.pump101.discharge_press` |

**Storage groups:** Create per-site storage groups with appropriate TTLs:
- `root.site1` — 90-day retention for alarms
- `root.site1.history` — extended retention for metrics

---

## 3. PostgreSQL Plan

### 3.1 Database-per-Service Model (Recommended)

**Single PostgreSQL instance (TimescaleDB 15)** with separate logical databases:

| Database | Owner Service | Source Tables | Notes |
|----------|---------------|---------------|-------|
| `ams` | AMS API (.NET) | `alarms.*`, `configuration.*`, `soe.*`, `analytics.*`, `audit.*` | **UNCHANGED** |
| `traverse_assets` | Asset Model service | `elements`, `attribute_instances`, `state_machine_definitions` | From reference `industrial_vis` |
| `traverse_templates` | Template service | `element_templates`, `attribute_templates`, `analysis_templates`, `template_versions` | From reference |
| `traverse_analysis` | Analysis-definition service | `analysis_definitions`, `analysis_executions` | Design-time only; execution in Flink |
| `traverse_displays` | Display service | `display_definitions`, `display_versions`, `display_comments` | From reference |
| `traverse_shared` | Shared / BFF | `uom_classes`, `uom_units`, `categories`, `category_tags`, `roles`, `users`, `audit_logs` | Shared reference data |

### 3.2 Migration Scripts Required

```
migrations/
├── 001_create_traverse_assets_db.sql
├── 002_create_traverse_templates_db.sql
├── 003_create_traverse_analysis_db.sql
├── 004_create_traverse_displays_db.sql
├── 005_create_traverse_shared_db.sql
├── 006_migrate_elements_from_industrial_vis.sql
├── 007_migrate_templates_from_industrial_vis.sql
├── 008_migrate_displays_from_industrial_vis.sql
└── 009_migrate_uom_categories_rbac.sql
```

### 3.3 Alternative: Schema-per-Service

If cross-context joins become necessary:

| Schema | Owner | Tables |
|--------|-------|--------|
| `traverse.assets` | Asset Model | elements, attributes |
| `traverse.templates` | Template service | templates, versions |
| `traverse.displays` | Display service | definitions, versions, comments |
| `shared` | Multiple | uom, categories, rbac |

**Recommendation:** Start with separate databases; consolidate to schemas only if cross-joins prove necessary.

---

## 4. Kafka Topic Catalog (Unified)

### 4.1 Retained AMS Topics (Unchanged)

| Topic | Owner | Purpose |
|-------|-------|---------|
| `raw-alarms` | External OPC → Flink | OPC-AE telemetry ingest |
| `current-alarm-state` | Flink | Normalized alarm stream |
| `live.alarms` | Flink LiveStateJob | Live alarm state → Sparkplug |
| `live.metrics` | Flink LiveStateJob | Live metrics (RBE) → Sparkplug |
| `operator-actions` | AMS API | Operator ACK/shelve commands |
| `ack-writeback` | Flink | DCS writeback commands |
| `ack-results` | OPC Gateway | ACK confirmation |
| `lifecycle-events` | Multiple | Append-only state machine log |

### 4.2 New Topics (From Reference + Unified)

| Topic | Owner | Purpose | Replaces |
|-------|-------|---------|----------|
| `asset.created` | Asset Model service | Asset creation event | `af.template.created` (partial) |
| `asset.updated` | Asset Model service | Asset modification | — |
| `template.created` | Template service | Template creation | `af.template.created` |
| `template.propagated` | Template service | Inheritance notification | `template.propagated` |
| `analysis.scheduled` | Analysis-def service | Flink job scheduling | — |
| `display.published` | Display service | Display version published | — |

### 4.3 Deprecated Topics (To Remove After Migration)

| Topic | Reason |
|-------|--------|
| `af.live.stream` | Replaced by Sparkplug DDATA |
| `af.computed.stream` | Replaced by Flink → live.metrics |
| `af.raw.xml` | Retained for audit only |
| `af.events` | Consolidated into lifecycle-events |
| `af.analysis.results` | Replaced by Flink → IoTDB + live.metrics |

---

## 5. OpenBridge Gap List

### 5.1 Components Available in OpenBridge 1.0

| Category | Available | Suitable for Process HMI |
|----------|-----------|-------------------------|
| **Gauges** | Linear, radial, dial | ✓ Yes |
| **Indicators** | Status, alerts, notifications | ✓ Yes |
| **Navigation** | Breadcrumbs, tabs, menus | ✓ Yes |
| **Automation** | HVAC components, system diagrams | ✓ Partial (maritime-origin) |
| **Data display** | Cards, values, trends (basic) | ✓ Yes |

### 5.2 ISA-5.1 Process Symbols NOT in OpenBridge

| Symbol Type | Required | Resolution |
|-------------|----------|------------|
| **Valves** (gate, globe, ball, butterfly, control) | ✓ Critical | Author as theme-aware SVG |
| **Pumps** (centrifugal, PD, vacuum) | ✓ Critical | Author as theme-aware SVG |
| **Motors** (electric, VFD indicators) | ✓ Critical | Author as theme-aware SVG |
| **Vessels** (tanks, drums, columns, reactors) | ✓ Critical | Author as theme-aware SVG |
| **Heat exchangers** (shell-tube, plate, fin) | ✓ Important | Author as theme-aware SVG |
| **Compressors** (centrifugal, reciprocating) | ✓ Important | Author as theme-aware SVG |
| **Instruments** (transmitters, controllers, I/P) | ✓ Important | Author or migrate from Graphics/ |
| **Piping** (lines, reducers, branches) | ✓ Critical | SVG paths with palette tokens |
| **Equipment labels** (ISA-format tag blocks) | ✓ Important | Custom component |

### 5.3 Existing Graphics/ Assets Migration

**Source:** `Graphics/` folder in reference app  
**Count:** ~200 SVG symbols  
**Format:** Static SVG, some with embedded scripts

**Migration steps:**
1. Audit existing symbols for ISA-5.1 coverage
2. Re-author using OpenBridge color tokens (`--obc-*` variables)
3. Remove embedded scripts; externalize state logic
4. Register in symbol palette with bindable properties declared
5. Test across all four palettes (bright/day/dusk/night)

### 5.4 Theme-Aware SVG Pattern

```svg
<svg viewBox="0 0 100 100">
  <rect fill="var(--obc-surface-primary)" stroke="var(--obc-border-primary)"/>
  <circle class="status-indicator" 
          fill="var(--obc-status-normal)"  
          data-bind-fill="status"/>
</svg>
```

**State mapping (NAMUR NE107):**
| Status | Variable |
|--------|----------|
| Normal/Good | `--obc-status-normal` (green-ish, muted) |
| Warning/Uncertain | `--obc-status-warning` (yellow/amber) |
| Alarm/Bad | `--obc-status-alarm` (red, saturated per ISA-101) |
| Maintenance | `--obc-status-maintenance` (blue) |

---

## 6. Risk Register

### 6.1 Technical Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R1 | **OpenBridge React wrapper instability** (0.0.17) | Medium | Medium | Consume core web components directly; thin custom React bindings; pin to stable/Apache releases |
| R2 | **Licensing nuance** (AGPL→Apache delay) | Low | High | Build on Apache-aged releases only; legal review before shipping |
| R3 | **ISA-5.1 symbol gap** | High | Medium | Start theme-aware SVG library in Phase 2; migrate existing Graphics/ assets |
| R4 | **Analysis re-platforming effort** | Medium | Medium | Keep design-time CRUD separate; migrate execution to Flink incrementally; SQL/CEP first |
| R5 | **Live-node performance** (many DOM nodes) | Medium | Medium | Per-open-screen subscription; update rate cap (~1s); virtualize lists |
| R6 | **CQRS discipline erosion** | Low | High | Enforce via code review; bindings resolve only through BFF; no direct historian reads for live values |
| R7 | **Namespace migration breaks existing displays** | Medium | High | Dual-path resolution during transition; migrate displays with namespace aliases first |
| R8 | **Flink job complexity** | Medium | Medium | Express logic in SQL/MATCH_RECOGNIZE where possible; Java UDF only for stateful KPIs |

### 6.2 Organizational Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R9 | **Scope creep** (adding features during migration) | High | Medium | Strict phase gates; features only after parity proven |
| R10 | **AMS pipeline regression** | Low | Critical | Integration tests on every phase; green pipelines as gate |
| R11 | **Knowledge silos** (reference app expertise) | Medium | Medium | Document all ported code; pair programming during port |

---

## 7. Acceptance Criteria by Phase

### Phase 0 — Foundations
- [ ] Single UNS definition documented
- [ ] Per-service PostgreSQL databases created with migrations
- [ ] Unified Kafka topic catalog published
- [ ] RBAC model unified (4 tiers per ISA-101)
- [ ] OpenBridge pinned to stable/Apache release
- [ ] No behavioral change to AMS alarm pipelines

### Phase 1 — Asset Model + Binding Resolver
- [ ] Asset Model service running with `traverse_assets` DB
- [ ] Binding Resolver BFF operational
- [ ] `path + role` resolves to:
  - Live (Sparkplug/EMQX + Redis snapshot)
  - History (IoTDB via historian-bff)
  - Alarm (SignalR / live.alarms)
- [ ] Automated test passes against existing AMS data

### Phase 2 — Designer MVP
- [ ] DOM/SVG editor in `src/frontend-ob`
- [ ] Grid-snap, multi-select, z-order, transform, undo/redo
- [ ] OpenBridge palette + starter SVG symbols
- [ ] Binding picker browses UNS
- [ ] Display saved to `traverse_displays`
- [ ] Runtime renderer paints live-bound components
- [ ] E2E test: design → bind → deploy → observe live

### Phase 3 — Templates + Multi-State
- [ ] Template service ported with `traverse_templates` DB
- [ ] Multi-state rule schema (NAMUR NE107 / ISA-18.2)
- [ ] `%Element%` context switching works
- [ ] Display versioning/diff/comments functional

### Phase 4 — Analysis on Flink
- [ ] Analysis-definition CRUD with `traverse_analysis` DB
- [ ] Execution re-platformed to Flink SQL/CEP
- [ ] Computed series written to IoTDB + live.metrics
- [ ] No StreamPipes compute pipelines running

### Phase 5 — Reporting + Decommission + Hardening
- [ ] (If approved) Headless Chromium render service operational
- [ ] Decommissioned: Konva, Batik, StreamPipes, CouchDB, Socket.IO services
- [ ] IEC 62443 segmentation review passed
- [ ] Observability SLOs defined
- [ ] Concurrency load test to target operator count

---

## 8. Open Decisions for Human Approval

Before proceeding to Stage B (execution), the following decisions require explicit answers:

### Decision 1: Designer Placement

| Option | Description | Recommendation |
|--------|-------------|----------------|
| **A** | Embed in `src/frontend-ob` as new routes (`/designer`, `/displays`) | **RECOMMENDED** — maximizes reuse |
| **B** | Standalone designer application | Separate deployment, duplication of auth/MQTT code |

**Recommendation rationale:** Embedding maximizes reuse of existing AMS infrastructure (OpenBridge, MQTT store, historian-bff client, AG Grid, auth). Single deployment artifact.

### Decision 2: StreamPipes + CouchDB Disposition

| Option | Description | Recommendation |
|--------|-------------|----------------|
| **A** | Retire completely | **RECOMMENDED** — Flink-only consistency per Traverse spec |
| **B** | Retain StreamPipes Connect only (UI-driven OT-adapter onboarding) | If adapter UI is valued; no compute |

**Recommendation rationale:** Traverse spec explicitly forbids StreamPipes Flink wrapper. Adapter-only usage adds operational complexity for limited benefit if other ingestion paths exist.

### Decision 3: PostgreSQL Isolation

| Option | Description | Recommendation |
|--------|-------------|----------------|
| **A** | Separate database per service | **RECOMMENDED** — clean ownership, independent migrations |
| **B** | Separate schemas in one database | Only if cross-context joins prove necessary |

**Recommendation rationale:** Microservice best practice; each service owns its data and migrations. Cross-database queries are rare and can use foreign data wrappers if needed.

### Decision 4: Reporting/Export at Launch

| Option | Description | Timing Impact |
|--------|-------------|---------------|
| **A** | Yes — server-side thumbnails/PNG/PDF required | Headless Chromium render service moves to Phase 2/3 |
| **B** | No — client-side PNG export sufficient for launch | Render service deferred to Phase 5 or post-launch |

**Question for stakeholder:** Is server-side thumbnail/PDF output required at launch, or can we defer to client-side export initially?

---

## 9. Next Steps

**STOP POINT:** This document and `01-system-analysis.md` complete Stage A analysis.

Before executing Stage B:
1. Review both analysis documents
2. Answer the four open decisions above
3. Confirm any scope adjustments
4. Approve Phase 0 start

Once approved, Stage B begins with Phase 0: Foundations.

---

*Analysis complete. Awaiting human review and decision inputs.*
