# 00 — Architecture Review Index

**Review:** Full production-readiness architecture review of the AMS / Traverse Edge monorepo.
**Reviewed commit:** `4e2758c951df06a170f35d23313824cb57c9ef03` (branch `main`)
**Date:** 2026-08-08
**Method:** static code analysis only (no `docker compose up`, no builds, no test execution). Every finding is verified against code; documentation is treated as prior claims to be tested. Grading is dual-column (Lab vs Production-candidate).

---

## Reading order

| # | Document | Contents |
|---|---|---|
| — | [00-review-framework.md](./00-review-framework.md) | Input contract (grading model, hypotheses, skeletons) — not modified |
| — | [PHASE0-INVENTORY.md](./PHASE0-INVENTORY.md) | Service / Flink-job / topic inventory + 17-item documentation-drift list |
| — | [PHASE1-VERIFICATION.md](./PHASE1-VERIFICATION.md) | Verdict blocks H-01..H-28 + discovery findings H-29..H-45 + Gate 1 |
| — | [EVIDENCE-APPENDIX.md](./EVIDENCE-APPENDIX.md) | Recorded discovery-sweep commands + absence-claim logs |
| 01 | [01-architecture-assessment.md](./01-architecture-assessment.md) | C4 diagrams, microservices maturity, CQRS, Twelve-Factor, failure domains |
| 02 | [02-auth-security-review.md](./02-auth-security-review.md) | Auth as-built, ASVS findings, service trust, IEC 62443, verdict |
| 03 | [03-api-gateway-and-edge.md](./03-api-gateway-and-edge.md) | nginx as-built, gateway gap analysis, YARP target, migration |
| 04 | [04-data-layer-performance.md](./04-data-layer-performance.md) | PG index/upsert verdict, Timescale, IoTDB, Redis contract, caching |
| 05 | [05-streaming-review.md](./05-streaming-review.md) | Kafka readiness, topic audit, Flink lifecycle, consumer correctness |
| 06 | [06-frontend-performance.md](./06-frontend-performance.md) | Render architecture, subscription hygiene, per-route audit |
| 07 | [07-scalability-reliability.md](./07-scalability-reliability.md) | Load model, scale blockers, SPOFs, HA/DR, SLOs |
| 08 | [08-technology-rationale.md](./08-technology-rationale.md) | Per-component what/why/how/prod-delta |
| 09 | [09-gap-register.md](./09-gap-register.md) | Flat gap table (53 GAPs) + three-phase roadmap |
| 10 | [10-target-architecture.md](./10-target-architecture.md) | Consolidated to-be reference (build-against) |
| 11 | [11-proposed-architecture.md](./11-proposed-architecture.md) | Executive/PM summary — component catalog, current vs proposed, approval ask |
| → | [docs/plans/](../plans/00-plan-index.md) | **Implementation plans** — 9 phase-wise plans covering all 53 gaps |

**Start here if new:** 00 → PHASE0 → 01 → 05 → 09 → 10.

---

## Methodology (hypothesis → verification → grading)

1. **Ground-truthing (Phase 0):** read the framework, full compose, nginx, every service entry point, all Flink jobs + submit/supervisor scripts, all SQL, the frontend stores/components, and the auth module. Six parallel domain sweeps produced code-cited evidence.
2. **Verification (Phase 1):** each hypothesis H-01..H-28 assigned CONFIRMED/REFUTED/AMENDED with `file:line` evidence; a §4 discovery sweep added H-29..H-45. Absence claims recorded in the evidence appendix.
3. **Grading (Phase 2):** dual-column (Lab/Prod) grades + severity per finding; load model with explicit arithmetic; concrete target designs.
4. **Documents (Phase 3) + reconciliation (Phase 4):** eleven documents; every C/D grade reconciled to a GAP-ID; every S1/S2/S3 GAP traced to a target element.

---

## Consolidated dual-column scorecard (Gate 2)

| Domain | Lab | Prod | Top gaps | S1 | S2 |
|---|---|---|---|---|---|
| Architecture (01) | B | C | distributed-monolith seams, no failure isolation | 0 | 1 |
| Auth & security (02) | C | D | AUTH-01/02/03, no revocation/rotation | 3 | 3 |
| API gateway & edge (03) | C | D | no gateway, no edge authn/limits/TLS | 1* | 0 |
| Data layer (04) | C | D | DATA-01/02, no Timescale, single PG/IoTDB | 2 | 5 |
| Streaming (05) | C | D | STR-01/02/03/04, stub DLQ, orphan alerts | 5 | 6 |
| Frontend (06) | B | C | firehose render storm, no memo/debounce/abort | 0 | 1 |
| Scalability/reliability (07) | C | D | ams-api singleton, all SPOFs | (rolls up) | 1 |
| Technology rationale (08) | — | — | cross-references only | — | — |

*AUTH-03 (anonymous live plane via public `/mqtt-ws`) is counted under Auth; it is the edge's S1.

**Totals across the register:** S1 = 11 · S2 = 16 · S3 = 16 · S4 = 8 · S5 = 2 (53 gaps).

**Overall verdict:** **A capable, well-decomposed lab platform that is not production-candidate.** The domain decomposition, CQRS discipline, alarm state machine, CPLM engine, and OpenBridge HMI are real and mostly sound (Lab B/C). Production candidacy is blocked by eleven S1 gaps spanning data durability (Flink sink guarantees, checkpoints, projection integrity, retention), availability (no Kafka/Flink/PG/IoTDB HA, single-replica ams-api), and security (anonymous live plane, authz kill switch, shared full-permission service key) — plus a silent alarm-loss path (stub DLQ) and safety alerts published to a void.

### Gate 2 — proposed S1/S2 list (recorded; execution continued per user instruction)

> The framework specifies a human approval gate before final documents. The user directed a single continuous run, so this gate is recorded, not blocking.

**S1 (11):** STR-01, STR-02, STR-03, STR-04, AUTH-01, AUTH-02, AUTH-03, DATA-01, DATA-02, STR-05, DOM-01.
**S2 (16):** SCALE-01, STR-06, DATA-03, DATA-04, DATA-05, STR-07, STR-08, AUTH-04, AUTH-05, AUTH-06, STR-09, STR-10, DATA-06, DOM-02, FE-01, DATA-07.

---

## Phase 4 — acceptance-criteria self-audit (framework §6)

| # | Criterion | Result |
|---|---|---|
| 1 | Every hypothesis H-01..H-28 has a status + evidence citation (or UNVERIFIED with reason) | **PASS** — all 28 verdicted with `file:line`; 0 UNVERIFIED (PHASE1 summary table) |
| 2 | Every discovery-sweep command appears in the evidence appendix with its result | **PASS** — EVIDENCE-APPENDIX §1–§6 (DL/CR/KF/FE/SO series + manual inspections) |
| 3 | Every document conforms to its skeleton; no section omitted without NOT APPLICABLE | **PASS** — 01–10 follow framework §5; no omissions |
| 4 | Every finding has both grades, a severity, a standard anchor, and a remediation | **PASS** — 09-gap-register columns populated for all 53 GAPs |
| 5 | Gap register reconciles: every C/D grade maps to a GAP-ID; no orphan grades | **PASS** — reconciliation index 09 §3; scorecard grades trace to GAPs |
| 6 | Every S1/S2/S3 GAP maps to a resolving element in 10; 10 is self-sufficient with no UNVERIFIED | **PASS** — 10 §9 traceability matrix; 10 contains no UNVERIFIED markers |
| 7 | No claim in any findings document lacks a code citation or UNVERIFIED marker | **PASS** — findings cite `file:line`; the one library-default claim (H-07 connector NONE) is explicitly marked library/standards-anchored, not repo-line-anchored |
| 8 | Mermaid diagrams render (validated syntax) | **PASS** — all blocks use `graph`/`sequenceDiagram` with quoted labels; validated in Phase 4 |
| 9 | Human approval gate after hypothesis verification, before drafting | **RECORDED** — Gates 1 and 2 documented (PHASE1 end; above); the user explicitly directed a continuous run, so gates were recorded rather than blocking. This is the one deviation from the framework, made on explicit instruction. |

---

## Final summary

**Findings by severity:** S1 = 11 · S2 = 16 · S3 = 16 · S4 = 8 · S5 = 2 (**53 total**). Hypotheses: 20 CONFIRMED, 3 confirmed-with-amendment, 2 AMENDED, 1 MIXED, 2 partially-REFUTED, 0 UNVERIFIED; plus 17 new discovery findings.

**Top ten production blockers:**
1. **STR-01** — Flink Kafka sinks run at `DeliveryGuarantee.NONE`: alarm-state, ACK, and CPLM records can be silently lost across a TaskManager crash.
2. **DOM-01** — the projection consumer's DLQ is a stub that logs; a transient Postgres failure drops a 100-event alarm batch.
3. **AUTH-03** — the live plane is fully anonymous: any browser reaching the public `/mqtt-ws` reads all Sparkplug data and can inject DDATA/device commands.
4. **DATA-01** — no unique index backs the alarm projection key and `alarm_current` has no server dimension: duplicate alarms or a `23505` crash on redelivery.
5. **STR-04** — single Kafka broker, RF=1: one restart stalls the entire alarm pipeline.
6. **STR-03 / STR-02** — no Flink HA and checkpoints on a local volume: a JobManager or host loss destroys all in-flight state.
7. **DATA-02** — TimescaleDB is unused; `alarm_history` and other time-series tables grow unbounded with no retention.
8. **AUTH-01 / AUTH-02** — a source-visible shared service key grants every permission, and one env var (`Security:DisableApiAuthorization`) makes the whole ams-api REST surface anonymous.
9. **STR-05** — the telemetry-deadman and ACK-SLA watchdog alerts are published to `lifecycle-alerts`, which has no consumer: a dead OPC feed raises no operator alert.
10. **SCALE-01 / DATA-04 / DATA-05** — ams-api (SignalR), IoTDB, and PostgreSQL are all un-replicable single points of failure.

**Single highest-leverage remediation:** **fix the Flink→Kafka delivery guarantee and the projection's DLQ + upsert integrity together (STR-01 + DOM-01 + DATA-01).** These three are the difference between an alarm-management system that can silently lose or duplicate alarms and one that cannot — the load-bearing correctness guarantee of the entire product. They are all Effort-M, land in Phase 1, and unblock the credibility of every downstream KPI, ACK, and audit claim.
