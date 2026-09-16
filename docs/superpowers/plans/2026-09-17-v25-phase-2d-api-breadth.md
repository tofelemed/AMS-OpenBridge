# v2.5 Phase 2D — API breadth for the workbench: gate catalogue and investigation references

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Expands master-plan task 2D.1 (R13, R24; NR-062).

**Goal:** The workbench (2E) reads the gate catalogue from the build (definition, role, installed method and version, artifact kinds, capability state) instead of three static `GATE_ROLES` copies and `calcCatalogue.ts`; an investigation is a first-class, pinned reference to evidence with an explicit outcome (`WORK_COMPLETED | PERFORMANCE_RESTORED | INCONCLUSIVE`) instead of a note piggy-backed on an acknowledge.

**Architecture:** `GateCatalog` (cplm-api, single source since 0.4) gains role, definition, precondition text, artifact kinds and the v2.5 method truth; `GET /gate-catalogue` serves it and `/capabilities.methods` derives from the same list. Script 56 adds `analytics.investigation_reference`; `CpmInvestigationsController` pins the referenced manifests so the retention sweeper (1G.5) never expires them.

**Tech Stack:** as Phase 1G (cplm-api, Dapper, lab Postgres tests).

**Spec:** §3.1 (gate catalogue served from the build), §3.4 (investigation references), NR-062 ("work completed ≠ performance restored").

## Global Constraints

- One catalogue: `GateCatalog.Defs` is the only place a gate's name/tier/role/method lives; `CapabilityManifestTests` and the new `GateCatalogueTests` both read it.
- Artifact kinds per gate are the kinds the 2C.1c builders emit (verbatim strings); G13 is `UNAVAILABLE` with reason until 2F.
- Schema ships three ways (lab script 56, `migration/schema/03`, `scripts/cpm-07-v25-schema.sql`).
- Files ≤ 400–500 lines; TDD; commit per task.

---

### Task 2D.1: Gate catalogue endpoint

**Files:**
- Modify: `src/services/cplm-api/Services/GateCatalog.cs` (`GateDef` + `Role`, `Definition`, `Preconditions`, `ArtifactKinds[]`; v2.5 methods: G6 `G6.WELCH_PSD` 1.0.0, G8 `G8.XCORR_ASYMMETRY_V1`, G12 `G12.SYSTEM_RESPONSE` 1.0.0 INSTALLED, G14 `G14.FAULT_SCOPED_CONFIRMATION` 2.0.0 INSTALLED, G13 `G13.PEER_LINK_FLAG` LEGACY_FLAG_ONLY)
- Modify: `Controllers/CpmCapabilitiesController.cs` (`GET /gate-catalogue`)
- Modify: `tests/cplm-api.Tests/CapabilityManifestTests.cs` (the v2.5 truth), Create: `tests/cplm-api.Tests/GateCatalogueTests.cs`
- Create: `src/frontend-ob/src/api/cpm/catalogue.ts` (types + fetch; the UI switch-over is 2E.3)

- [ ] Failing test: 17 entries once, G2r included, every INSTALLED gate has ≥ 1 artifact kind, G13 UNAVAILABLE with reason, G12 INSTALLED with `G12.SYSTEM_RESPONSE`.
- [ ] Implement; `dotnet test --filter GateCatalogue|CapabilityManifest`; commit `feat(cplm-api): GET /gate-catalogue from the build's own catalogue (2D.1)`.

### Task 2D.2: Investigation references

**Files:**
- Create: `database/scripts/56_cplm_investigation_refs.sql` (+ mirrors), `Controllers/CpmInvestigationsController.cs` (`POST /investigations` perm `cpm.manage`: `{loopId, methodRunId, evidenceIds[], note, outcome?}` → pins manifests; `GET /loops/{id}/investigations`; `PATCH /investigations/{id}` outcome), `Services/InvestigationStore.cs`
- Test: `tests/cplm-api.Tests/InvestigationsApiTests.cs` (pinned manifest survives the retention sweeper; outcome defaults INCONCLUSIVE; 404 on unknown evidence).

- [ ] Failing test → implement → commit `feat(cplm-api): investigation references pin evidence with an explicit outcome (2D.2)`.
