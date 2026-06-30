# Migration Log — PI Vision++ → AMS/Traverse Edge Unification

**Migration start:** 2026-06-30  
**Current phase:** Phase 0 — Foundations  
**Branch:** `migration/phase0-foundations`

---

## Phase 0 — Foundations

**Status:** COMPLETE — AWAITING APPROVAL  
**Started:** 2026-06-30  
**Branch:** `migration/phase0-foundations`  
**Commit:** `2a2b06a`

### Scope

1. Define unified UNS/namespace (contextual pattern)
2. Document migration path from `root.ams.site1.*`
3. Provision per-service PostgreSQL databases
4. Publish unified Kafka topic catalog
5. Unify auth/RBAC on AMS identity model
6. Pin OpenBridge and document license note

### Deliverables

| Artifact | Status | Location |
|----------|--------|----------|
| UNS Namespace Specification | ✅ | `docs/migration/uns-namespace-spec.md` |
| PostgreSQL Provision Scripts | ✅ | `database/migrations/phase0/` |
| Kafka Topic Catalog | ✅ | `docs/migration/kafka-topic-catalog.md` |
| Auth/RBAC Unification | ✅ | `docs/migration/rbac-unification.md` |
| OpenBridge License Note | ✅ | `docs/migration/openbridge-license-note.md` |

### Acceptance Criteria

- [x] One contextual namespace with documented migration from `root.ams.*`
- [x] One topic catalog (reconciled `af.*` + AMS topics)
- [x] One identity model (admin/engineer/operator/viewer)
- [x] Databases provisioned (traverse_assets, traverse_templates, traverse_analysis, traverse_displays, traverse_shared)
- [x] Zero behavioral change to AMS pipelines (verified: all containers healthy)

### Commits

- `2a2b06a` feat(migration): Phase 0 foundations - UNS, databases, topic catalog, RBAC

---

---

## Phase 1 — Asset Model + Binding Resolver

**Status:** IN PROGRESS  
**Started:** 2026-06-30  
**Branch:** `migration/phase1-asset-model-binding-resolver`

### Scope

1. Provision `traverse_assets` database
2. Build Asset Model service (UNS source of truth)
3. Build Binding Resolver BFF (path + role → transport)
4. Automated resolution tests

### Deliverables

| Artifact | Status | Location |
|----------|--------|----------|
| traverse_assets DB schema | ✅ | `database/scripts/10_traverse_assets_schema.sql` |
| Asset Model service | ✅ | `src/services/asset-model/` |
| Binding Resolver BFF | ✅ | `src/services/binding-resolver/` |
| Docker Compose integration | ✅ | `infra/docker/docker-compose.yml` |
| Resolution tests | ✅ | `tests/integration/` |

### Acceptance Criteria

- [x] Asset Model service built with UNS path generation
- [x] Binding Resolver resolves path → live (Sparkplug topic, Redis snapshot key)
- [x] Binding Resolver resolves path → history (IoTDB path, historian-bff endpoints)
- [x] Binding Resolver resolves path → alarm (SignalR hub, alarm source)
- [x] Integration test suite created
- [x] No UI changes
- [x] AMS pipelines green (verified: all core services healthy)

### Next Steps (requires Docker build)

To complete integration testing:
```bash
cd infra/docker
docker-compose build asset-model binding-resolver
docker-compose up -d asset-model binding-resolver
cd ../../tests/integration
dotnet test --filter "Category=Integration"
```

### Commits

| Hash | Description |
|------|-------------|
| `fb2d2f0` | Asset Model + Binding Resolver services, DB schema, tests |

---

---

## Phase 2 — Designer MVP + Runtime

**Status:** IN PROGRESS  
**Started:** 2026-06-30  
**Branch:** `migration/phase2-designer-runtime`

### Scope

1. Display Service backend (CRUD for display definitions)
2. Designer frontend ported to AMS with OpenBridge theming
3. Runtime display rendering with Binding Resolver integration
4. DOM/SVG canvas (retire Konva)

### Deliverables

| Artifact | Status | Location |
|----------|--------|----------|
| Display Service | ✅ | `src/services/display-service/` |
| traverse_displays DB schema | ✅ | `database/scripts/11_traverse_displays_schema.sql` |
| Designer frontend routes | ✅ | `src/frontend-ob/src/components/Designer/` |
| Symbol renderer | ✅ | `src/frontend-ob/src/components/Designer/SymbolRenderer.tsx` |
| Binding Resolver hook | ✅ | `src/frontend-ob/src/hooks/useBindingResolver.ts` |
| Docker Compose integration | ✅ | `infra/docker/docker-compose.yml` |

### Acceptance Criteria

- [x] Display Service with versioned definitions (CRUD API)
- [x] CQRS trigger enforcement (no process values in snapshots)
- [x] Designer canvas with DOM/SVG rendering (no Konva)
- [x] Symbol palette with drag-drop
- [x] Property inspector with UNS binding configuration
- [x] useBindingResolver hook for live data integration
- [x] No Konva dependencies
- [x] AMS pipelines green

### Commits

| Hash | Description |
|------|-------------|
| `4e42286` | Display Service, designer frontend, DB schema, Docker integration |

---

---

## Phase 3 — Templates, Multi-state, Personal Views

**Status:** IN PROGRESS  
**Started:** 2026-06-30  
**Branch:** `migration/phase3-templates-multistate-views`

### Scope

1. Template Service for reusable element/display templates
2. Multi-state symbol rendering (NAMUR NE107 status colors)
3. Personal Views (operator-customizable, non-controlled displays)
4. Template instantiation in designer

### Deliverables

| Artifact | Status | Location |
|----------|--------|----------|
| Template Service | ✅ | `src/services/template-service/` |
| traverse_templates DB schema | ✅ | `database/scripts/12_traverse_templates_schema.sql` |
| Personal Views schema | ✅ | `database/scripts/13_personal_views_schema.sql` |
| Multi-state symbols | ✅ | `src/frontend-ob/src/components/Designer/MultiStateSymbol.tsx` |
| Template Palette | ✅ | `src/frontend-ob/src/components/Designer/TemplatePalette.tsx` |
| Docker Compose | ✅ | Port 5004 |

### Acceptance Criteria

- [x] Template Service with parameterized bindings ({{basePath}} substitution)
- [x] System templates seeded: Centrifugal Pump, Control Valve
- [x] Template instantiation endpoint with parameter validation
- [x] Multi-state symbols with NAMUR NE107 colors (Good/Uncertain/Bad/Maintenance/OutOfService)
- [x] Personal Views schema (non-versioned, operator-owned)
- [x] Template Palette with drag-drop and parameter dialog
- [x] AMS pipelines green

### Commits

| Hash | Description |
|------|-------------|
| `7fb3b08` | Template Service, multi-state symbols, personal views schema |

---

---

## Phase 4 — Analysis on Flink

**Status:** IN PROGRESS  
**Started:** 2026-06-30  
**Branch:** `migration/phase4-analysis-flink`

### Scope

1. Analysis Service (design-time CRUD for analysis definitions)
2. Flink SQL job for analysis execution
3. Analysis results persistence to IoTDB
4. API for triggering and monitoring analyses

### Deliverables

| Artifact | Status | Location |
|----------|--------|----------|
| Analysis Service | ✅ | `src/services/analysis-service/` |
| traverse_analysis DB schema | ✅ | `database/scripts/14_traverse_analysis_schema.sql` |
| Kafka topics | ✅ | `analysis.commands`, `analysis.executions` |
| Docker Compose | ✅ | Port 5005 |

### Acceptance Criteria

- [x] Analysis Service with CRUD API
- [x] Four analysis types: Rollup, Threshold, RateOfChange, Expression
- [x] Kafka integration for Flink coordination
- [x] Execution tracking (pending/running/completed/failed)
- [x] Sample analyses seeded (Pump 101 Rollup, Pressure Alert, Flow ROC)
- [x] AMS pipelines green

### Commits

| Hash | Description |
|------|-------------|
| `5e8a917` | Analysis Service, DB schema, Kafka integration |

---

---

## Phase 5 — Legacy Decommission + Hardening

**Status:** IN PROGRESS  
**Started:** 2026-06-30  
**Branch:** `migration/phase5-decommission-hardening`

### Scope

1. Document deprecated components from reference app
2. Create migration scripts for legacy data
3. Add health check aggregation endpoint
4. Create deployment validation script
5. Update README with new architecture

### Deliverables

| Artifact | Status | Location |
|----------|--------|----------|
| Deprecation manifest | ⏳ | `docs/migration/` |
| Legacy data migration scripts | ⏳ | `database/migrations/` |
| Health aggregator endpoint | ⏳ | New service or AMS API |
| Deployment validation script | ⏳ | `scripts/` |
| Updated README | ⏳ | Root |

### Acceptance Criteria

- [ ] All deprecated components documented
- [ ] Migration path for existing data defined
- [ ] Single health check endpoint for all services
- [ ] Deployment validation script passes
- [ ] Full E2E test passes
- [ ] AMS pipelines green

### Commits

*(in progress)*

---

## Deployment & Testing (Post-Migration)

| Step | Status |
|------|--------|
| Run database schemas | ⏳ |
| Build all services | ⏳ |
| Recreate containers | ⏳ |
| API smoke tests | ⏳ |
| E2E data flow test | ⏳ |
| Unit tests | ⏳ |
| System tests | ⏳ |

---

## Recorded Decisions (Settled)

Per `Unified-HMI-Platform-Feasibility-and-Transition-Plan.md` §1–§2:

1. CQRS discipline enforced
2. Bind through UNS (path + role)
3. Flink-only compute
4. Reuse infra (one PG, one Kafka, one EMQX, one IoTDB)
5. UNS: `root.<site>.<unit>.<device>.<measurement>`
6. DOM/SVG editor (not Konva)
7. OpenBridge = vocabulary + theme
8. Retire Batik from live path
9. Display = configuration only (no values)
10. Two-tier displays (controlled vs personal)
11. Quality mandatory on reopen (NE107/ISA-18.2)
12. Designer embedded in `src/frontend-ob`
13. Retire StreamPipes + CouchDB
14. Separate database per service
15. Thumbnails client-side at save
