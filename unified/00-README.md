# unified/ — Truss living-asset proposal against the AMS / Traverse platform

This folder holds the evaluation of the "living-asset" proposal (Truss knowledge graph as the canonical
plant configuration, a Flink runtime keeping per-entity state and an issue ledger, persona dashboards on
OpenBridge) against what the AMS-open codebase actually does on 2026-09-30 (branch
`feat/v25-next-release`, production = release v2.6.1 pending at Marun).

## Reading order

| File | What it is | Read it when |
|---|---|---|
| `Executive Summary.md` | the pitch, part 1 (system overview, Truss model, compiler, ingestion, Flink, APIs, UI, example) | you need the proposal's own words |
| `Architecture for Living-Asset Runtime and Plant Manager Dashboard.md` | the pitch, part 2 (component responsibilities, Truss schema extensions, Flink design, message schemas, issue ledger, plan) | same |
| `10-truss-concept-map-and-gap-analysis.md` | **start here**: the pitch in our terms, the ten findings that shape the work, 39 concepts mapped to what exists (EXISTS / PARTIAL / MISSING), what is reused / updated / new, the twelve decisions to take | deciding whether and how to proceed |
| `11-target-architecture.md` | components, identity model, runtime package contract, runtime job design, issue ledger, serving contracts, topics and stores, sequences, deployment view, deviations from the pitch and why | designing or reviewing the build |
| `12-implementation-plan.md` | phases 0–5 as releases (scope, schema four copies, plant scripts in order, acceptance), work breakdown, tests, risks, the records to keep | planning and tracking the work |
| `01`–`09-current-*.md` | the evidence: nine read-only analyses of the current system, every claim cited as `path:line` | verifying any statement in 10–12 |

## The current-state reports

| # | Slice | Headline |
|---|---|---|
| 01 | asset model and hierarchy | one table, five fixed levels, the path is the transport address, no versioning, Redis pub/sub events only |
| 02 | binding resolution and history | a binding is computed addressing, not a stored object; signal roles exist only in CPM; no PI, no as-of |
| 03 | display/template binding and runtime UI | bindings are raw path strings per slot, no expressions, lexical validation, template palette orphaned |
| 04 | Flink jobs and configuration | 13 jobs in the lab, 7 at the plant; alarm jobs have no config plane; CPLM jobs already run a signed compacted-topic broadcast with PREPARE/APPLY ACKs |
| 05 | ingestion and topic catalog | custom ingestion-service (no Kafka Connect), shared plant broker with a prefix guard, EMQX ACL `spBv1.0/#` only, no process-value producer in production |
| 06 | CPLM, analysis, issue-ledger analogs | KPI formulas compiled in Java; governed config bundles are the strongest analog of the pitch; event frames are the closest issue ledger; everything loop-scoped |
| 07 | UI, dashboards, personas, navigation | the plant runs the CPA slice; URL-only context; roles without scope; no production/energy KPIs anywhere |
| 08 | alarm core, hubs, KPIs, audit | alarm lane is lab-only; alarms carry a tag name, no asset join; hub groups cosmetic; no scope claims |
| 09 | data layer and release process | no migration ledger (four copies), no TimescaleDB at the plant, ~25 GB free, no backups, no savepoints, air-gapped tarball releases |

## One-paragraph verdict

The pitch is implementable on this stack without a second platform: its control plane (versioned,
signed, compacted config with an activation handshake and revision-stamped results) already exists for
the loop-performance lane and generalises; its runtime is one new Flink job keyed by a Truss entity id
plus one new read-side service; its dashboards are one new frontend module driven by compiled persona
and view definitions. The three things the pitch does not say and this folder does are: nothing in the
platform carries an entity id today, so identity comes first; the plant currently ingests loop data only,
so the Plant Manager's production and energy tiles need new data sources before they can be real; and
the shared, air-gapped plant host dictates the ingestion, push and retention choices (no Kafka Connect,
SignalR before MQTT, retention rows with every table).

## Housekeeping

Nothing in this folder changes running code. `changes_tracker.md` and `prod_decision.md` gain entries
only when a phase of `12-implementation-plan.md` ships. The doc-vs-code disagreements listed as finding
F10 in `10-…` should be corrected in phase 0.
