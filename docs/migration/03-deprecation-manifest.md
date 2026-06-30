# Deprecation Manifest

**Document:** `03-deprecation-manifest.md`  
**Date:** 2026-06-30  
**Status:** COMPLETE

This document lists all components from the PI Vision++ reference application that are deprecated and will not be migrated to the Traverse Edge platform.

---

## 1. Fully Deprecated Components

### 1.1 Services (DROP)

| Component | Location | Reason | Replacement |
|-----------|----------|--------|-------------|
| **batik-microservice** | `batik-microservice/` | Cannot render web components; structurally incompatible | Headless Chromium (if needed for PDF export) |
| **auth-service** | `services/auth-service/` | Mock service; already routed through industrial-platform | AMS identity model |
| **asset-service** | `services/asset-service/` | Mock service | Asset Model service |
| **query-service** | `services/query-service/` | Mock service | historian-bff |
| **realtime-service / data-gateway** | `services/data-gateway/` | Socket.IO based | EMQX Sparkplug + mqttStore |
| **graph-service (Neo4j)** | `services/graph-service/` | Out of scope for first release | Deferred |
| **ml-inference-service** | `services/ml-inference-service/` | Out of scope for first release | Deferred |

### 1.2 Infrastructure (DROP)

| Component | Reason | Replacement |
|-----------|--------|-------------|
| **CouchDB** | Document store not needed | PostgreSQL (traverse_displays, traverse_templates) |
| **StreamPipes (compute)** | Flink-only compute per spec | Apache Flink |
| **Socket.IO** | WebSocket transport | Sparkplug B over MQTT |

### 1.3 Frontend Components (DROP)

| Component | Location | Reason | Replacement |
|-----------|----------|--------|-------------|
| **KonvaCanvas.tsx** | `industrial-vis-frontend/` | Canvas library | DOM/SVG DesignerCanvas |
| **react-konva dependency** | package.json | Not needed | Native SVG |

---

## 2. Retained with Modifications

### 2.1 Services (PORT/CONSOLIDATE)

| Component | Disposition | Target |
|-----------|-------------|--------|
| **industrial-platform** (Spring Boot) | SPLIT | Asset Model + Template + Analysis + Display services |
| **template-service** | PORT | Template Service (.NET 8) |
| **hierarchy-service** | CONSOLIDATE | Asset Model service |
| **analysis-service** | RE-PLATFORM | Analysis Service + Flink |

### 2.2 Frontend Components (PORT)

| Component | Target |
|-----------|--------|
| **Canvas.tsx** (DOM/SVG) | DesignerCanvas.tsx |
| **PropertyInspector.tsx** | PropertyInspector.tsx |
| **SymbolPalette.tsx** | SymbolPalette.tsx |
| **Graphics/ (SVG library)** | To be themed with OpenBridge tokens |

---

## 3. Data Migration Requirements

### 3.1 From Reference App Databases

| Source | Target | Migration Script |
|--------|--------|------------------|
| `industrial_vis.elements` | `traverse_assets.assets` | `migrate_elements_to_assets.sql` |
| `industrial_vis.templates` | `traverse_templates.element_templates` | `migrate_templates.sql` |
| `industrial_vis.displays` | `traverse_displays.display_definitions` | `migrate_displays.sql` |

### 3.2 Path Translation

Legacy AF-style paths must be translated to UNS format:

```
Legacy:  Houston/CrudeUnit1/Pump101.DischargePress
UNS:     houston/crude1/pump101.discharge_press
IoTDB:   root.houston.crude1.pump101.discharge_press
```

Use the `alias_mapping` table in `traverse_assets` for runtime translation.

---

## 4. Decommission Checklist

Before removing deprecated components:

- [ ] Verify all data migrated to new databases
- [ ] Confirm alias mappings populated for legacy paths
- [ ] Test all UNS paths resolve through Binding Resolver
- [ ] Verify Flink jobs running for migrated analyses
- [ ] Confirm displays load and bind correctly
- [ ] Remove Docker services from production compose
- [ ] Archive deprecated source code (do not delete)

---

## 5. Timeline

| Milestone | Target |
|-----------|--------|
| Phase 5 code complete | 2026-06-30 |
| Data migration dry-run | Before production cutover |
| Production cutover | After stakeholder approval |
| Legacy removal | 30 days post-cutover (monitoring period) |
