# Traverse CPA Release v2.5 — Next-Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every phase below is executed as its own detailed plan; this document is the master plan and the audit of record.

**Goal:** Ship release **v2.5** of the CPA/CPM loop-performance product implementing the "Traverse CPA Next-release engineering specification v6" (16 Sep 2026): qualified per-role observations, sound fusion, a real G12 system-response capability, Flink-produced per-gate evidence with an evidence workbench, Instrumental NE107 transmitter-health context, and a governed configuration service — built, verified and tested end-to-end on the lab stack before the air-gapped Marun deploy.

**Architecture:** Keep the existing route (ingestion-service → Kafka `traverse.cpa.loop.samples.v1` → Flink short/long/fusion → Kafka `traverse.cpa.clpm.*` → cplm-api consumers → PostgreSQL `traverse_cplm` → React/OpenBridge). Extend the existing samples tuple additively (schema 1.1, `roles{}` per-role provenance), add three new Flink jobs (`CplmConditionStreamJob`, `CplmInstrumentContextJob`, `CplmResponseAnalysisJob`), seven new Kafka topics, a durable evidence store (PostgreSQL bytea chunks behind an `IEvidenceBlobStore`), immutable run identity columns on the existing v1 result rows (`method_run_ids`, `bundle_hash`, `purpose`, …) plus an `analysis_run` registry, and a config control plane (bundle → prepare → worker ACK → activate → rollback). All math stays in Flink; cplm-api persists verbatim and materialises reads; the browser only renders.

**Tech Stack:** .NET 8 minimal APIs + Npgsql (cplm-api, ingestion-service), Java 11 / Flink 1.18.1 / Kafka connector 3.2.0-1.18 (+ **Apache commons-math3 3.6.1**, new), PostgreSQL (`traverse_cplm`, `traverse_auth`), EMQX/mosquitto MQTT, React 18 + Vite + TypeScript + `@oicl/openbridge-webcomponents-react` + echarts-for-react + @tanstack/react-query + zustand, xUnit / JUnit 4 / vitest, PowerShell E2E scripts, `migration/deploy/build-release.py` for the plant bundle.

**Spec:** `release-out/next release/COMPLETE_NEXT_RELEASE_SPECIFICATION.md` (+ `Traverse_CPA_Next_Release_Tracker_v6.xlsx`: gap register R01–R26, 165-property catalogue CFG-001…165, 62 acceptance scenarios NR-001…062, 52 response quantities, 17 gate evidence views, 25 API ops, execution-plan contract; the docx and HTML navigator carry the same data). Extracted TSVs of every workbook sheet are in the session scratchpad (`xlsx_*.tsv`) and must be copied to `docs/next-release/spec/` in Phase 0.

---

## Context — why this release

Prod (Marun VM) runs v3 + v2.3 + v2.4 (`changes_tracker.md`, latest manifest `migration/deploy/releases/v2.4.txt`). The v6 spec is a source-bound audit of the CPA product: it retains the whole application and lists 26 gaps (22 × P0) that block operational diagnoses today — G12 is a boolean, G14 "confirms" a valve fault from VP presence, missing evidence closes episodes, quality `UNKNOWN` becomes `GOOD`, the tuple has one timestamp for five roles, nothing carries a reproducible run identity, per-gate evidence is scalars only, there is no Instrumental (NE107) context and no governed configuration.

**This plan was audited against the code on branch `feat/ot-loop-ingestion` @ `5cec34ef`, not against docs or memory.** The findings below are what the code does today. Every "DONE / PARTIAL / NOT DONE" verdict cites a file:line.

## Audit of record — spec gap register vs. code

| Gap | P | Verdict | What the code does today (evidence) | Phase |
|---|---|---|---|---|
| R01 G12 is not a system-response analysis | P0 | **NOT DONE** | `CplmGateFusionEngine.java:207-216` — boolean step-test flag → PASS / `NO_STEP_TEST`. No response package, no estimators, no numeric lib (`src/flink/pom.xml`: junit only). | 2 |
| R02 Generic final-element confirmation unsound | P0 | **PARTIAL** | Confirmed requires conf ≥ 0.90 **and VP present** (`CplmGateFusionEngine.java:590-618`); VP caps at 0.89 (`:237,412`) — VP presence is still the physical discriminator; no positive non-following evidence required. Persistence cap `:435-479`. | 1E |
| R03 Native per-role fidelity not preserved | P0 | **NOT DONE** | `LoopJoiner.cs:10-14` `LoopTuple` has ONE `EventTsMs` + ONE `Quality`; per-member ts exists internally (`Member{Value,TsMs,Good}` `:63`) and is dropped at serialisation; VP/MODE held forever, hold invisible (`:306-311`); vp/mode quality ignored (`:312`). | 1A |
| R04 Unknown/numeric quality → GOOD | P0 | **NOT DONE** | `OtPayloadParser.cs:80-86` `Str(root,"quality") ?? "GOOD"` — numeric quality silently dropped; `LoopJoiner.IsGood :338` "g"-prefix; `CplmNormalizedSample.isGoodQuality :106-117` null ⇒ good; no `IsFinite` anywhere; `Double.parseDouble("NaN")` accepted. | 1B |
| R05 5 s capture vs fast dynamics | P0 | **NOT DONE** | `LoopIngestConfig.cs:67` grid 5 s; `minSamplesPerPeriod=8` applied only inside the long job (`CplmGateEngine.java:372,519-571`); no per-loop acquisition policy, no bandwidth eligibility reason surfaced. | 1D, 2G |
| R06 G2/G4 unit-dependent | P0 | **PARTIAL** | G2 `spRangePassMax` default 1.0 EU (`CplmLoopDynamicsProfile.java:92`), not span-relative; G4 `>8.0 / >3.0` hardcoded (`CplmGateEngine.java:253-257`). G3 band is span-based (C01 done: `CplmLoopDynamicsProfile.java:127-132`). | 1D |
| R07 Geometry/lag over-interpreted | P0 | **PARTIAL** | G8 `computeHorch :1003-1038` is a cross-correlation non-reciprocity index labelled "oddness" and feeds stiction (`:427`); G9 geometry safeguards exist (`isGeometryDecisiveForbidden`). | 1E, 2C |
| R08 Limits/freeze rely on samples | P0 | **PARTIAL** | G10 `satLowPct/satHighPct` 5/95 + `satLimitDwellSamplesWarn=30` (profile, `CplmLoopDynamicsProfile.java:94-97`) — samples not seconds, no engineering-range limits; G11 `freeze ≥60 s && ≥10 % window` hardcoded (`CplmGateEngine.java:472`). | 1D |
| R09 G13 links are not interaction analysis | P1 | **NOT DONE** | `CplmGateFusionEngine.java:218-229` boolean `hasPeerLinks` from broadcast `cplm.loop.evidence`. | 2F |
| R10 Missing evidence closes an episode | P0 | **NOT DONE** | `CplmEventFrameService.cs:33-40,144-153` — EXCLUDED/INSUFFICIENT/NO_CALL close open frames. | 1F |
| R11 Response/health wait on long fusion | P0 | **NOT DONE** | Fusion 12h/24h only (`CplmGateFusionStreamJob.java:108-110`), 4h never fused; no fast condition path. | 1D, 2B |
| R12 Per-gate evidence plots incomplete | P0 | **NOT DONE** | Engine emits scalars only (`CplmGateResult.java`, `CplmLongDiagnosticsResult.java`); UI has 8 generic charts, no ACF/PSD/fit/residual/Bode (`historical/chartOption.ts`, `CpmReplay.tsx:158-195`). | 2C, 2E |
| R13 Evidence drawer selects latest | P0 | **NOT DONE** | `GateEvidencePanel.tsx:63` `useLatestGates`; static `GATE_ROLES :36-44` (3 copies incl. `CpmReplay.tsx:31`, `ProfileAside.tsx:27`). | 2E |
| R14 Mixed units on one axis | P1 | **NOT DONE** | `historical/chartOption.ts:165-197` one yAxis for PV/SP/OP/VP; tooltip local time, no unit/quality. | 2E |
| R15 Instrumental NAMUR integration | P0 | **NOT DONE** | Zero hits for NAMUR/NE107/instrument health in ingestion, Flink, cplm-api, DB; UI only `utils/quality.ts`. | 1H |
| R16 Configuration panel | P0 | **NOT DONE** | Only `thresholdProfileId` free text (`AddLoopWizard.tsx:265`), fire-and-forget metadata broadcast (`CpmLoopRegistryService.cs:1673-1737`), no endpoints/lifecycle. | 3 |
| R17 Config scoping/fallback unsafe | P0 | **NOT DONE** | Static `SPINE` map (`CplmDynamicsParameterSetSupport.java:39`), parse failures swallowed (`:64-66,281,337,381`), field overlay on class pack (`:174`), canonical topic gated off by default (`CplmParameterSetBroadcastSupport.java:41-47`). | 3C |
| R18 Window/state changes ≠ hot params | P0 | **NOT DONE** | Windows compiled (`CplmShortFeatureStreamJob.java:57-127`, `CplmLongDiagnosticsStreamJob.java:39-47`); no change-class model. | 3A, 3F |
| R19 Run identity/historical context | P0 | **NOT DONE** | Upsert guarded by `sample_count` (`CplmResultConsumerService.cs:208-226`); replay writes the live topic (`CplmHistoricalReplayJob.java:47`), Kafka-only input; no run/purpose/bundle ids. | 1G |
| R20 Heartbeat disguises stale | P0 | **PARTIAL** | RBE heartbeat keeps `p.ts` (`LoopLiveRbeJob.java:294,304`) — good; quality-only change does not pass value deadband (`:258-270`); UI shows one `ts` (`mqttStore.ts:134-146`). | 1C |
| R21 Latency claim start point | P1 | **NOT DONE** | No source-vs-tuple latency measurement anywhere. | 4 |
| R22 Persistence/recovery carried forward | P0 | **PARTIAL** | At-least-once + poison-pill skip exists (`CplmResultConsumerService.cs:76-81,144,186-191`); no reconciliation/backlog metric. | 1G |
| R23 Identity/SQL-init/build/scope | P0 | **PARTIAL** | Flink test suite does not compile (`CplmLoopDynamicsAwareTest.java:304,312` → `GateFusionCoProcess` vs actual `GateFusionProcess`); lab/prod schema drift (`migration/schema/03` hand-merged). | 0 |
| R24 Lifecycle catalogue vs work control | P1 | **PARTIAL** | Ack/shelve on event frames only (`CpmEventsController.cs:98-121`); notes piggyback on ack (`CpmReplay.tsx:447-472`). | 2D |
| R25 Tag-derived loop class | P0 | **NOT DONE** | `cpm.loop_registry.loop_type CHECK IN (FIC,PIC,PIC_GAS,PIC_VAPOUR,LIC,TIC,UNKNOWN)` (`32_cpm_loop_registry.sql:33-34`); `dynamicClassOf` client-side (`registryShared.ts:18-24`). | 2G |
| R26 Version strings don't identify behaviour | P0 | **NOT DONE** | Only `calculationVersion="3.0.0"`/`dynamicsProfileVersion="2.0.0"` in payload JSONB (`CplmGateResult.java:126-127`); no jar/config/bundle hash. | 1G |

**Build conflicts C01–C07 resolved against code:** C01 span band **is** in code (0.005 × span, fallback 0.5). C02 quiet-tick skipping + newest-member time **is** in code (`LoopJoiner.cs:292-302`). C03 300 s heartbeat **is** in code and does *not* refresh ts. C04 MIN_SAMPLES=32 **is** in code (`CplmLongDiagnosticsStreamJob.java:47`). C05 unresolved: ~45 parser fields, G4 3/8 hardcoded → Phase 3 catalogue closes it. C06 no late side-outputs; short lateness 30 s…3 min per branch, long timer skips ahead — record in capability manifest. C07 → R26 task.

**Retained (do not rebuild):** 12 CPM pages, registry + wizard + bulk import, engineering ranges, linked 4-lane historical chart, phase-plane replay, event frames ack/shelve, audit chain, fleet reads with index probes + cache, at-least-once consumers with static membership, 6 short window branches, long 15-min timer, YAML dynamic-class packs, replay job, RBE heartbeat.

---

## Global Constraints (apply to every task)

- **Read-only toward DCS/SIS.** No task writes to a controller, initiates a step test, or acknowledges an Instrumental diagnostic. (spec §1.1)
- **400–500 lines max per file** (CLAUDE.md). Existing oversize files touched by a task are split as part of that task: `CplmGateEngine.java` (1341), `CplmGateFusionEngine.java` (694), `CpmLoopRegistryService.cs` (~1850), `cpmApi.ts` (659), `CpmInvestigation.tsx` (570), `CpmReplay.tsx` (479).
- **Flink-only compute**; cplm-api never estimates gains, recomputes FFT, or derives diagnostics; browser math is presentation only. (spec §1.5; CLAUDE.md)
- **Bind through the UNS**; auth is edge-only: new permissions go in `src/services/_shared/TraverseAuth.cs` `Perms` + `Perms.All`, then `scripts/sync-auth-module.ps1`, then SQL under `\c traverse_auth`.
- **OpenBridge only** in the UI: import per-path from `@oicl/openbridge-webcomponents-react`, tokens for colour/size, `obi-*` icons, alert tokens for attention; charts via echarts with `cpmChartColors()`/`cpmToneColors()` (`components/Cpm/shared.tsx:42,267`).
- **Kafka topics are created explicitly** (lab: `scripts/kafka-reset-lab-topics.ps1` list + `KAFKA_AUTO_CREATE_TOPICS_ENABLE=false`; prod: `migration/kafka/topics.txt` via `04-create-kafka-topics.sh`). Compacted topics reject null keys — use `KafkaSinks.keyedByJsonField`.
- **CPLM consumer groups have exactly one member** (`traverse-cpa-cplm-results`, `…-frames`); new consumers get their own group + `SingleMemberGuard`.
- **Schema ships three ways and all three must agree:** `database/scripts/NN_*.sql` (lab, `\c traverse_cplm` header, `IF NOT EXISTS`), `migration/schema/03-traverse_cplm.sql` (fresh prod snapshot, no `\c`), and `ops/cpm-NN-*.sql` in `build-release.py OPS_FILES` (live prod, additive/online). cplm-api self-heal DDL mirrors `30_*` only — new tables are **not** self-healed; they ship as ops SQL applied before the image swap.
- **One results world, one samples topic.** The existing v1 tables (`analytics.cplm_gate_results`, `cplm_short_feature_results`, `cplm_long_feature_results`) and the existing topic `traverse.cpa.loop.samples.v1` are **extended in place, additively** — no parallel "v2" copies. New identity/evidence columns are added to the v1 rows; the samples message gains a `roles{}` block (schema 1.1) next to the unchanged top-level fields. Verified safe: every v1 reader parses tolerantly (`CplmNormalizedSample.fromJson :39-75` uses `has()`, `RawLoopIotDbConsumer.cs:217-231` uses `TryGetProperty`). Old rows without the new columns are read as `legacy` (G12/G14 shown as `LEGACY_FLAG_ONLY`).
- **Version identity:** every v2 result carries `source_commit`, `jar_sha256`, `contract_version`, `method_version`, `bundle_hash`, `context_revision`, `dataset_hash`. Version strings alone never identify behaviour. (R26)
- **Units:** seconds, hertz, PV EU, actuator percentage point (`pp`), normalised fraction — never interchangeable; fractions ≠ percent. Every metric is `{quantity_id, value|null, unit, path_id, uncertainty|null, method, support, config_hash, reason_if_null}`.
- **Tests before code** (TDD): every task has a failing test first. Java tests must compile (`mvn -f src/flink/pom.xml test-compile`) — the suite is broken today and Phase 0 fixes it.
- **Lab E2E harness:** `run-all.ps1` stack, `scripts/test-ot-loop-ingestion-e2e.ps1` (23 steps) is the template for new E2E scripts; gateway at `http://127.0.0.1:8081` (never `localhost`).
- **Commit per task**; bundles ship `git archive HEAD` so uncommitted work does not exist on the plant.

---

## New surface introduced by this release (reference for all tasks)

### Kafka topics (add to `scripts/kafka-reset-lab-topics.ps1` and `migration/kafka/topics.txt`)

| Topic | Parts | Policy | Key | Producer → Consumer |
|---|---|---|---|---|
| `traverse.cpa.loop.samples.v1` (**existing, schema 1.0 → 1.1 additive**, no new topic) | 16 | unchanged | `loop_id` | ingestion-service → Flink short/long/condition/response, ams-api historian |
| `traverse.cpa.instrument.health.v1` | 8 | delete 30d | `device_id` | ingestion-service InstrumentalHealthSubscriber → CplmInstrumentContextJob, cplm-api mirror consumer |
| `traverse.cpa.context.instrument-health.v1` | 8 | compact | `loop_id` | CplmInstrumentContextJob → long/response/fusion jobs, cplm-api |
| `traverse.cpa.clpm.response.results.v1` | 8 | delete 30d | `loop_id` | CplmResponseAnalysisJob → cplm-api, fusion |
| `traverse.cpa.clpm.gate.evidence.v1` | 8 | delete 7d, `max.message.bytes=1048576` | `method_run_id` | all engine jobs → cplm-api evidence consumer |
| `traverse.cpa.context.gate-config.v1` | 3 | compact | `bundle_id` | cplm-api control plane → all CPLM jobs (broadcast) |
| `traverse.cpa.context.gate-config.acks.v1` | 3 | delete 7d | `bundle_id` | CPLM jobs → cplm-api deployment tracker |
| `traverse.cpa.clpm.condition.v1` | 8 | delete 7d | `loop_id` | fast G10/G11 condition path → cplm-api, fusion |

### PostgreSQL (`traverse_cplm`) — scripts `53_cplm_v25_identity_evidence.sql` … `59_cpm_v25_permissions.sql`

**Extended in place (ALTER … ADD COLUMN, additive):** `analytics.cplm_gate_results`, `cplm_short_feature_results`, `cplm_long_feature_results` gain `method_run_ids jsonb` (gate → deterministic uuid), `bundle_hash`, `context_revision`, `result_revision`, `purpose`, `source_commit`, `jar_sha256`, `analysis_run_id`; their unique index gains `bundle_hash` so a re-evaluation under a different configuration is a new row, never an overwrite. `analytics.cplm_event_frames` gains `availability_state`, `condition_state`, `result_revision`, `qualified_support_ms`. `cpm.loop_registry` gains the loop-model dimension columns (2G).

**New tables (things that have no v1 home):** `analytics.analysis_run` (run registry for REPLAY/SHADOW/EVIDENCE_RECONSTRUCTION — replaces the `replay_id`-in-payload convention), `analytics.evidence_manifest`, `analytics.evidence_chunk`, `analytics.condition_event`, `analytics.response_event`, `analytics.response_metric`, `analytics.system_model`, `analytics.model_validation` (G12 is event-keyed, not window-keyed, so it cannot share the window tables), `analytics.investigation_reference`, `cpm.controller_snapshot`, `cpm.loop_objective_version`, `cpm.signal_device_binding_history`, `cpm.instrument_health_observation`, `cpm.device_health_interval`, `cpm.source_availability`, `cpm.gate_config_bundle`, `cpm.gate_config_layer`, `cpm.config_approval`, `cpm.config_deployment`, `cpm.config_worker_ack`, `cpm.config_active`.

### Flink (new package `com.ams.flink.cplm.*`)

`cplm/contract/` (tuple v2, quality decoders, topic catalogue), `cplm/evidence/` (artifact writer, chunker), `cplm/identity/` (run identity, hashes), `cplm/health/` (instrument context job), `cplm/response/{model,event,simulation,estimation,validation,evidence}` (G12), `cplm/config/` (bundle state, ACK), `cplm/condition/` (fast G10/G11). Jobs: `CplmInstrumentContextJob`, `CplmResponseAnalysisJob`, `CplmConditionStreamJob`.

### cplm-api — new controllers (all under `/api/v1/cpm`, gateway catch-all already routes them)

`CpmCapabilitiesController`, `CpmAnalysisRunsController`, `CpmMethodRunsController`, `CpmEvidenceController`, `CpmResponseController`, `CpmModelsController`, `CpmContextController` (analysis-context, controller-snapshots, instrument-bindings), `CpmInstrumentHealthController`, `CpmConfigurationController` (+ `CpmConfigDeploymentsController`). New consumers: `CplmEvidenceConsumerService`, `CplmResponseConsumerService`, `CplmInstrumentHealthMirrorService`, `CplmConfigAckConsumerService`, `CplmConditionConsumerService`.

### Permissions (new; `Perms` + SQL `59_cpm_v25_permissions.sql` under `\c traverse_auth`)

`cpm.analysis.create`, `cpm.model.review`, `cpm.context.manage`, `cpm.config.read`, `cpm.config.draft`, `cpm.config.validate`, `cpm.config.shadow`, `cpm.config.approve`, `cpm.config.activate`, `cpm.config.rollback`.

### Frontend (`src/frontend-ob/src/components/Cpm/evidence/`, `…/response/`, `…/health/`, `…/config/`)

`GateEvidenceWorkspace.tsx`, `GateEvidenceHeader.tsx`, `EvidenceArtifactRenderer.tsx`, `SignalContextLanes.tsx`, `MethodTracePanel.tsx`, `ResponseWorkspace.tsx`, `TransmitterHealthPanel.tsx`, `GateConfigurationWorkspace.tsx`, shared `CpmChart.tsx`, `GateResultState.tsx`; API modules `src/api/cpm/{evidence,response,health,config}.ts`; hooks `src/hooks/cpm/{useEvidence,useResponse,useHealth,useConfig}.ts`. Routes `/cpm/evidence`, `/cpm/response`, `/cpm/config`.

---

# Phase 0 — Build truth and test baseline (spec Slice 0; R23, R26, C01–C07)

Exit criteria: Flink test suite compiles and passes; every existing test project green; the seven conflicts recorded against `5cec34ef`; a machine-readable capability manifest published by the build; spec package checked into `docs/`.

### Task 0.1: Fix the Flink test compile break and prove the baseline

**Files:**
- Modify: `src/flink/src/test/java/com/ams/flink/cplm/CplmLoopDynamicsAwareTest.java:304,312` (`GateFusionCoProcess` → `GateFusionProcess`)
- Test: whole `src/flink` suite

- [x] **Step 1: Reproduce** — `mvn -f src/flink/pom.xml -q test-compile`. Expected: `cannot find symbol GateFusionCoProcess`.
- [x] **Step 2: Fix** the two references to `CplmGateFusionStreamJob.GateFusionProcess.elevatedFamilyForHistory(...)`.
- [x] **Step 3: Run** `mvn -f src/flink/pom.xml test`. Expected: 30 tests, 0 failures. If any golden test (`CplmGateEngineSynTic001Test`) fails, record the delta in `docs/next-release/00-build-truth.md` — do not "fix" the golden.
- [x] **Step 4: Run the other baselines** and record counts in `docs/next-release/00-build-truth.md`: `dotnet test tests/ingestion-service.Tests` (expect 109), `dotnet test tests/cplm-api.Tests` (expect 43, needs lab Postgres on 5433), `dotnet test tests/binding-resolver.Tests`, `dotnet test tests/historian-bff.Tests`, `cd src/frontend-ob && npm test && npm run lint && npm run build`.
- [x] **Step 5: Commit** `test(flink): restore CPLM test compile (GateFusionProcess rename)`.

### Task 0.2: Check the spec package and the code-audit into the repo

**Files:**
- Create: `docs/next-release/spec/` (copy of the four release-out files + the 12 `xlsx_*.tsv` exports), `docs/next-release/00-build-truth.md`, `docs/next-release/01-audit-vs-code.md` (the audit table from this plan, verbatim with file:line), `docs/next-release/conflicts.md` (C01–C07 with the disposition found in code, see "Build conflicts" above).

- [x] **Step 1: Write** the three markdown files. `conflicts.md` must state for each C0n: archive claim, doc claim, **code at 5cec34ef** (file:line), disposition.
- [x] **Step 2: Commit** `docs(next-release): spec v6 package + code audit of record`.

### Task 0.3: Build identity — stamp source commit and jar hash into every Flink result

**Files:**
- Create: `src/flink/src/main/java/com/ams/flink/cplm/identity/BuildIdentity.java`
- Modify: `src/flink/pom.xml` (add `git-commit-id-maven-plugin` 5.0.0 → `git.properties` on classpath; add `commons-math3` 3.6.1 now so Phase 2 does not change the pom again)
- Modify: `CplmGateResult.java:126-133`, `CplmShortFeatureResult.java`, `CplmLongDiagnosticsResult.java` — add `public String sourceCommit=""; public String jarSha256=""; public String contractVersion="v1";`
- Modify: `CplmShortFeatureStreamJob`, `CplmLongDiagnosticsStreamJob`, `CplmGateFusionStreamJob`, `CplmHistoricalReplayJob` — call `BuildIdentity.stamp(result)` before sink
- Test: `src/flink/src/test/java/com/ams/flink/cplm/identity/BuildIdentityTest.java`

**Interfaces (produces):**
```java
package com.ams.flink.cplm.identity;
public final class BuildIdentity implements java.io.Serializable {
  public static BuildIdentity current();            // reads git.properties + hashes the running jar (CodeSource) once, memoised
  public final String sourceCommit;                 // 40-hex or "unknown"
  public final String jarSha256;                    // 64-hex or "unknown-not-a-jar" (tests)
  public final String buildTimeUtc;
  public static <T> T stamp(T result);              // reflection-free: overloads for the 3 result types + ResponseResult later
}
```

- [x] **Step 1: Failing test** — `BuildIdentityTest.currentReturnsCommitFromGitProperties()` writes a temp `git.properties` on the test classpath (`git.commit.id.full=abc…`), asserts `current().sourceCommit` equals it and `jarSha256` is `unknown-not-a-jar` when not running from a jar.
- [x] **Step 2: Run** `mvn -f src/flink/pom.xml -Dtest=BuildIdentityTest test` → FAIL (class missing).
- [x] **Step 3: Implement** `BuildIdentity` (read `/git.properties`, `MessageDigest SHA-256` over the jar file from `BuildIdentity.class.getProtectionDomain().getCodeSource().getLocation()` when it ends with `.jar`).
- [x] **Step 4: Pom** — add plugin + dependency; `mvn -q package -DskipTests` must still produce `target/ams-flink-1.0-SNAPSHOT.jar` (the name `scripts/build-flink-jar.ps1` and `CplmRecomputeService.cs:230` expect).
- [x] **Step 5: Stamp** in the four jobs; extend `CplmFormulaContractTest` JSON round-trip assertion to include the three new fields.
- [x] **Step 6: Run** full suite → PASS. **Commit** `feat(flink): build identity (source commit + jar sha256) on every CPLM result`.

### Task 0.4: cplm-api reads and exposes the build identity; `/capabilities` v0

**Files:**
- Create: `src/services/cplm-api/Controllers/CpmCapabilitiesController.cs`, `src/services/cplm-api/Services/CapabilityManifest.cs`
- Modify: `src/services/cplm-api/Data/GateReadSql.cs:44-52` (also COALESCE `sourceCommit`, `jarSha256`, `contractVersion` from payload), `Controllers/CpmEventsController.cs:151-227` (`/calculations` includes them in `engine`)
- Test: `tests/cplm-api.Tests/CapabilityManifestTests.cs` (pure), extend `GateReadSqlTests`

**Interfaces (produces):** `GET /api/v1/cpm/capabilities` → 
```json
{ "service": {"version":"<assembly informational version>","sourceCommit":"…"},
  "engine":  {"observed":[{"calculationVersion":"3.0.0","dynamicsProfileVersion":"2.0.0","sourceCommit":"…","jarSha256":"…","contractVersion":"v1","lastSeen":"…"}]},
  "methods": [ {"gate":"G12","methodId":"G12.STEP_TEST_FLAG","version":"legacy","state":"LEGACY_FLAG_ONLY"} , … ],
  "topics":  { "samples":"traverse.cpa.loop.samples.v1", … },
  "schemas": { "tuple":"v1", "gateResult":"v1" },
  "windows": <body of /resolutions> }
```
The `methods` list is the **installed** catalogue; Phases 2–3 append `G12.SYSTEM_RESPONSE`, property support and execution-plan capacity. `CapabilityManifest.Build(IEnumerable<EngineVersionRow>, WindowSpecs)` is a pure function so it is unit-testable without a DB.

- [x] **Step 1: Failing test** `CapabilityManifestTests.ListsEveryGateOnceWithInstalledState()` — 17 gate entries exactly once (G0…G15 + G2r), G12/G13/G14 flagged `LEGACY_FLAG_ONLY`.
- [x] **Step 2: Implement** controller + manifest builder (reuse `CpmAnalyticsController.GateDefs/WindowSpecs`).
- [x] **Step 3: Run** `dotnet test tests/cplm-api.Tests --filter CapabilityManifest` → PASS. **Commit** `feat(cplm-api): GET /capabilities with build identity`.

### Task 0.5: Frontend shows build identity; `cpmApi.ts` split

**Files:**
- Create: `src/frontend-ob/src/api/cpm/capabilities.ts`, `src/frontend-ob/src/api/cpm/index.ts` (re-exports; keep `src/api/cpmApi.ts` as a re-export shim so existing imports do not change)
- Modify: `components/Cpm/CpmGovernance.tsx` version-provenance card shows `sourceCommit`/`jarSha256` (first 12 chars, full in tooltip) per observed engine.
- Test: `src/api/cpm/capabilities.test.ts` (fetch mock → typed parse)

- [x] **Step 1: Failing test**, **Step 2: implement**, **Step 3:** `npm test && npm run lint && npm run build` → clean. **Commit** `feat(cpm-ui): build identity in Governance; api/cpm module split`.

---

# Phase 1 — Qualification and safe semantics (spec Slice 1)

Exit criteria: tuple v2 flowing in the lab alongside v1; strict quality; heartbeat/quality separation proven; G2/G4/G10/G11 semantics per spec with profile-driven thresholds; fusion separates observations/hypotheses/confirmation and never confirms from VP presence; episodes track availability separately; every v2 result has an immutable `method_run_id`; evidence blob store live; Instrumental health context flowing MQTT → Kafka → Flink → API → UI lane. Lab E2E `scripts/test-cpm-v25-slice1-e2e.ps1` green.

## Subphase 1A — Per-role provenance on the existing samples tuple (R03, C02; NR-019, NR-020)

Design decision: **no new topic.** The v1 message keeps every existing top-level field byte-for-byte (`loop_id, event_ts_ms, ingest_ts_ms, pv, sp, op, vp, mode, quality, loop_type, site, area, unit, asset_uuid, source_fcs, extras`) and gains `schema_version:"1.1"`, `binding_revision` and a `roles{}` block. All current readers ignore the additions (verified in Global Constraints). The historian writer (`RawLoopIotDbConsumer`) keeps writing the top-level values, so IoTDB is unchanged.

### Task 1A.1: `roles{}` block on `LoopTuple` in ingestion-service

**Files:**
- Create: `src/services/ingestion-service/Pipeline/RoleObservation.cs` (record + JSON writer)
- Modify: `Pipeline/LoopJoiner.cs:10-14,19` (`LoopTuple` + `Roles`; `ToJson` appends `schema_version`, `binding_revision`, `roles`; `Member :63` gains `VerifiedTsMs`, `QualityNative`, `QualityProtocol`, `Unit`; `Held` computed at tick), `Models/LoopIngestConfig.cs` (`EmitRoles` default true — off switch for an emergency rollback to 1.0 output)
- Test: `tests/ingestion-service.Tests/LoopTupleRolesTests.cs`, extend `LoopJoinerTests.cs`

**Interfaces (produces) — `traverse.cpa.loop.samples.v1`, schema 1.1 (additive):**
```json
{ "loop_id":"FIC10101","event_ts_ms":1789500000000,"ingest_ts_ms":1789500000123,"pv":101.2,"sp":100,"op":42.1,"vp":41.8,"mode":"AUT","quality":"GOOD",
  "loop_type":"FIC","site":"…","area":"…","unit":"…","asset_uuid":"…","source_fcs":"…",          ← unchanged 1.0 fields
  "schema_version":"1.1","binding_revision":17,"grid_seconds":5,
  "roles": {
    "pv":   {"value":101.2,"sample_ts_ms":1789499998000,"verified_ts_ms":1789499998000,"quality_native":"192","quality_protocol":"OPC_DA","quality":"GOOD","unit":"t/h","held":false,"age_ms":2000},
    "sp":   {...}, "op": {..., "unit":"pp"}, "vp": {..., "held":true, "age_ms":93000} | null,
    "mode": {"value":"AUT","mode_native":"1","sample_ts_ms":…,"quality":"GOOD","held":false} } }
```
Per-role `quality` ∈ `GOOD|UNCERTAIN|BAD|UNKNOWN` (never defaulted, see 1B). `held=true` means the value was carried from a previous tick; `age_ms = event_ts_ms − sample_ts_ms`. The top-level `quality` stays the 1.0 worst-of(pv,sp,op) for old readers.

- [x] **Step 1: Failing tests** — `Tick_EmitsRolesWithPerRoleTimesAndHeldFlag()` (feed pv/sp/op at t, vp at t−90 s → `roles.vp.held=true, age_ms=90000`, `roles.pv.held=false`), `Tick_RoleQualityIsPerRoleNotWorstOf()`, `Tick_TopLevelFieldsUnchanged()` (golden: strip `schema_version/binding_revision/grid_seconds/roles` and the JSON must equal today's 1.0 output byte-for-byte).
- [x] **Step 2: Run** `dotnet test tests/ingestion-service.Tests --filter LoopTupleRoles|LoopJoiner` → FAIL.
- [x] **Step 3: Implement**. **Step 4: Run** → PASS (109 + new). **Commit** `feat(ingestion): samples schema 1.1 — per-role sample/verified time, quality, unit, held flag`.

### Task 1A.2: Flink reads `roles{}` with 1.0 fallback; topic catalogue

**Files:**
- Create: `src/flink/src/main/java/com/ams/flink/cplm/contract/RoleObservation.java`, `…/contract/TupleCodec.java` (parses 1.1 `roles`; for 1.0 messages synthesises roles from the top-level fields with `held=false, verified=sample, quality_protocol="LEGACY_TUPLE"`), `…/contract/CplmTopics.java` (**the topic catalogue** — all names as constants + arg names; every job reads from here)
- Modify: `CplmNormalizedSample.java:39-75` (`fromJson` delegates to `TupleCodec`; existing getters `pv()/sp()/op()/vp()` unchanged so `CplmGateEngine` compiles untouched; new `role(String)` accessor), `CplmIngestPipeline.java:40-54` (watermark from `max(role.sample_ts)` when roles present)
- Test: `src/flink/src/test/java/com/ams/flink/cplm/contract/TupleCodecTest.java`

- [x] **Step 1: Failing tests** — 1.1 JSON round-trip; 1.0 JSON → roles with `LEGACY_TUPLE`; held vp excluded when `age_ms > profile.vpMaxAgeS*1000` (new profile field, default 60 s) → `vpEligible()==false`; the existing golden `CplmGateEngineSynTic001Test` (1.0 fixtures) still passes unchanged.
- [x] **Step 2–4:** implement, run, commit `feat(flink): samples schema 1.1 codec + topic catalogue; 1.0 fallback`.

### Task 1A.3: Prove the additive change on every reader (no topic/env changes)

**Files:**
- Modify: `scripts/test-ot-loop-ingestion-e2e.ps1` — new steps: (a) 5 messages from `traverse.cpa.loop.samples.v1` carry `schema_version=="1.1"` and `roles.pv.sample_ts_ms`; (b) IoTDB `root.<site>.cpm.<loop>.pv` still receives rows (historian reader unaffected); (c) `/api/v1/cpm/loops/{id}/readiness` still reports samples flowing; (d) a short window still produces a gate row (Flink reader unaffected).
- Verify also with `ams-api` unit tests if any cover `RawLoopIotDbConsumer` (grep `tests/` and `src/backend/AMS.Tests.*`); add a tolerant-parse test with a 1.1 fixture if none exists.

- [x] **Step 1:** add the steps, run → (a) FAIL until 1A.1 image is rebuilt, (b)–(d) PASS on the old image (baseline). **Step 2:** rebuild ingestion + jar (`docker compose -f infra/docker/docker-compose.yml build traverse-ingestion-service`, `scripts/build-flink-jar.ps1`, cancel+resubmit the three CPLM jobs). **Step 3:** run → 27/27. **Commit** `test(e2e): samples 1.1 additive contract proven on all readers`.

## Subphase 1B — Protocol-specific quality, finite numerics (R04; NR-021)

### Task 1B.1: `QualityDecoder` in ingestion-service

**Files:**
- Create: `src/services/ingestion-service/Pipeline/QualityDecoder.cs`
- Modify: `Pipeline/OtPayloadParser.cs:50-58,80-86` (value: reject non-finite → DLQ reason `NON_FINITE`; quality: keep native string/number + `quality_protocol` from source config `LoopIngestConfig.QualityProtocol` ∈ `OPC_DA|OPC_UA|SPARKPLUG|STRING_ENUM|NONE`; missing quality with protocol `NONE` → `UNKNOWN`, never GOOD), `Pipeline/LoopJoiner.cs:338-340` (delete `IsGood` "g"-prefix; use decoder), `Models/LoopIngestConfig.cs` (new field, default `NONE`), `Services/DataSourceValidation.cs` (enum validation)
- Test: `tests/ingestion-service.Tests/QualityDecoderTests.cs`, extend `OtPayloadParserTests.cs`

**Interfaces (produces):**
```csharp
public enum QualityProtocol { OPC_DA, OPC_UA, SPARKPLUG, STRING_ENUM, NONE }
public enum NormalizedQuality { GOOD, UNCERTAIN, BAD, UNKNOWN }
public static class QualityDecoder {
  // OPC_DA: 8-bit word: (q & 0xC0) == 0xC0 GOOD, 0x40 UNCERTAIN, 0x00 BAD; else UNKNOWN
  // OPC_UA: 32-bit StatusCode: severity bits 30-31: 00 Good, 01 Uncertain, 1x Bad
  // SPARKPLUG: 192 GOOD, 500 STALE→UNCERTAIN, 0 BAD (Sparkplug B quality property codes)
  // STRING_ENUM: exact-match case-insensitive GOOD|UNCERTAIN|BAD only; anything else UNKNOWN
  public static (NormalizedQuality q, string nativeText, string? reason) Decode(QualityProtocol p, System.Text.Json.JsonElement? raw);
}
```

- [x] **Step 1: Failing tests** (table-driven `[Theory]`): OPC_DA 0→BAD, 64→UNCERTAIN, 192→GOOD, 200→GOOD; OPC_UA 0x00000000→GOOD, 0x80000000→BAD, 0x40000000→UNCERTAIN; SPARKPLUG 192/500/0; STRING_ENUM "good"→GOOD, "goodish"→UNKNOWN, "GARBAGE"→UNKNOWN; NONE null→UNKNOWN; `Parse` with `"value":"NaN"` → DLQ `NON_FINITE`; `"value":"1e309"` → `NON_FINITE`.
- [x] **Step 2–4:** implement, run (`dotnet test tests/ingestion-service.Tests`), commit `fix(ingestion): protocol-specific quality decoder; UNKNOWN != GOOD; reject non-finite`.
- [x] **Step 5: Fixture regression** — `scripts/sim/process_value_sim.py` and `scripts/fixtures/*` must set `quality_protocol` on the data-source config (`STRING_ENUM`) or the pilot loops go UNKNOWN; update `test-ot-loop-ingestion-e2e.ps1` data-source JSON accordingly and re-run 24/24.

### Task 1B.2: Flink strict finiteness + quality use

**Files:**
- Modify: `cplm/contract/TupleCodec.java` (reject non-finite per role → role `quality=BAD, reason=NON_FINITE`, never drop the tuple), `CplmNormalizedSample.java:106-117` (`isGoodQuality` → `roleQuality(role)==GOOD`; null ⇒ UNKNOWN), `CplmGateEngine.java:102-128` (G0 counts `unknown_quality_pct` separately; UNKNOWN never counted as good in `completeness`), `CplmIngestPipeline.java:54`
- Test: `TupleCodecTest` + `CplmGateEngineQualityTest` (new; G0 with 100 % UNKNOWN → `FAIL`, reason `QUALITY_UNKNOWN`)

- [x] Steps 1–4 as above; commit `fix(flink): UNKNOWN quality is not GOOD; non-finite roles marked BAD`.

## Subphase 1C — Heartbeat and quality transitions (R20, C03; NR-022, NR-023)

### Task 1C.1: RBE emits on quality change; three timestamps on live metrics

**Files:**
- Modify: `src/flink/src/main/java/com/ams/flink/cplm/LoopLiveRbeJob.java:190,258-304` (compare key `(value, quality)`; `render` writes `source_ts`, `verified_ts`, `emission_ts`, `heartbeat`), `historian-bff` snapshot writer (`src/services/historian-bff/SnapshotReader.cs` + the Redis writer that consumes `traverse.cpa.live.loop.metrics`) to keep the three ts.
- Modify UI: `src/frontend-ob/src/store/mqttStore.ts:134-146` (parse `source_ts`/`emission_ts`), `src/hooks/useLoopLive.ts:33` (`lastSourceTs`, `lastEmissionTs`), `explorer/SummaryTab.tsx` + `overview/LoopFocus.tsx` staleness chip shows **source age**, tooltip shows emission age.
- Test: `src/flink/src/test/java/com/ams/flink/cplm/LoopLiveRbeQualityTest.java` (same value, quality GOOD→BAD → emitted; heartbeat → `emission_ts` advances, `source_ts` unchanged); vitest `useLoopLive.test.tsx`.

- [x] Steps: failing tests → implement → `mvn test`, `npm test` → commit `fix(live): quality transitions bypass deadband; source vs emission time separated`.

## Subphase 1D — Gate semantics corrections (R05, R06, R08, R11; NR-018, NR-024, NR-025)

### Task 1D.1: Split `CplmGateEngine` into per-tier files (no behaviour change)

**Files:**
- Create: `cplm/engine/ShortFeatureCalculator.java` (G0–G4 from `computeShortFeatures :55-262`), `cplm/engine/LongDiagnosticsCalculator.java` (`computeLongDiagnostics :301-476`), `cplm/engine/OscillationMath.java` (`computeAcfPeriod`, `computeFftBandLimited`, `resolveValidPeriod`), `cplm/engine/ShapeMath.java` (`computeTriangularity`, `computeHorch`, `computeGeometry`), `cplm/engine/LimitMath.java` (`computeSaturationStats`, freeze)
- Modify: `CplmGateEngine.java` becomes a ≤150-line façade delegating to the above (public signatures unchanged so `CplmGateEngineSynTic001Test` golden passes unchanged).

- [x] **Step 1:** run golden tests → PASS (baseline). **Step 2:** move code, no edits. **Step 3:** golden → PASS byte-identical. **Commit** `refactor(flink): split CplmGateEngine into engine/* (≤400 lines each)`.

### Task 1D.2: G2 span/EU policy, G4 profile thresholds and dimensionless activity (R06)

**Files:**
- Modify: `CplmLoopDynamicsProfile.java` (+ `spStabilityBandSpanFraction` (default null), `spStabilityBandPvEu` (default null), `g4ActivityWarnRatio` 3.0, `g4ActivityHighRatio` 8.0, `g4ReversalDeadbandPp`), `CplmDynamicsParameterSetSupport.parseProfileJson` (+ fields), `cplm/engine/ShortFeatureCalculator.java` (G2: band = `max(pvEu, spanFraction×span)`; if both null → `G2 = NOT_EVALUATED reason NO_OBJECTIVE`; G4: thresholds from profile; `activity_ratio_norm = (σ_u/span_u)/(σ_pv/span_pv)` only when both spans valid, else `null`+reason `NO_SPAN`)
- Test: `cplm/engine/ShortFeatureCalculatorTest.java` — unit invariance: same trace in °C and in K×10 gives identical G2/G4 statuses when spans are declared (NR-018); missing objective → NOT_EVALUATED not PASS.

- [x] Failing test → implement → `mvn test` → commit `fix(flink): G2 span/EU stability policy; G4 profile-driven dimensionless activity`.

### Task 1D.3: G10 time-based limits from engineering range; G11 source-qualified freeze episodes (R08)

**Files:**
- Modify: `CplmLoopDynamicsProfile.java` (`satLimitDwellSamplesWarn` → `limitDwellWarnS` seconds; `limitTolerancePp` default 1.0; low/high limit = declared `opMin/opMax` when present (NR-024: 80 % max detected) else 0/100 fallback flagged `LIMIT_SOURCE=FALLBACK`), `cplm/engine/LimitMath.java` (dwell in seconds from timestamps; emit `dwell_events[]` `{start_ms,end_ms,side}`), freeze: `freezeToleranceEu` (default from span × 0.0005), `freezeDwellS` (60) — episode list `freeze_events[]` retained regardless of window fraction; `materialFreeze` = any episode ≥ dwell (drop the 10 % rule; keep `freeze_fraction` as a metric)
- Modify: `CplmLongDiagnosticsResult.java`, `CplmShortFeatureResult.java` (+ arrays `dwellEvents`, `freezeEvents`)
- Test: `LimitMathTest` (1-hour freeze inside 24 h → `freeze_events.size()==1`, G11 WARN; OP pinned at 80 with `opMax=80` → G10 `active_high`), `CplmFormulaContractTest` round-trip includes the arrays.

- [ ] Failing test → implement → commit `fix(flink): G10 limits from engineering range in seconds; G11 freeze episodes retained`.

### Task 1D.4: Fast condition path — `CplmConditionStreamJob` (R11 part 1)

**Files:**
- Create: `cplm/condition/CplmConditionStreamJob.java`, `cplm/condition/ConditionDetector.java` (keyed process function on tuple v2: G10 limit-dwell and G11 freeze detection with the same `LimitMath` code; emits `ConditionEvent{loop_id, gate, kind (LIMIT_LOW|LIMIT_HIGH|FREEZE), state (OPEN|UPDATE|CLOSED), start_ms, last_ms, evidence{…}}` to `traverse.cpa.clpm.condition.v1`), `cplm/condition/ConditionEvent.java`
- Modify: `infra/docker/flink-submit-cplm.sh`, `flink-job-supervisor.sh`, `scripts/ensure_flink_jobs.py`, `migration/04b-submit-flink-jobs.sh`, `migration/flink/JOBS.md` (job `AMS - CPLM Condition Engine`)
- Test: `cplm/condition/ConditionDetectorTest.java` (harness `KeyedOneInputStreamOperatorTestHarness`: 70 s flat PV → OPEN at 60 s; value resumes → CLOSED with duration)

- [ ] Failing test → implement → commit `feat(flink): CplmConditionStreamJob (fast G10/G11 condition evidence)`.

### Task 1D.5: cplm-api condition consumer + `condition_event` table; fuse 4h and conditions

**Files:**
- Create: `database/scripts/53_cplm_v25_identity_evidence.sql` (**first part**: `analytics.condition_event(loop_id, gate, kind, start_ms, last_ms, end_ms null, state, evidence jsonb, source_commit, jar_sha256, PRIMARY KEY(loop_id,gate,kind,start_ms))`), `src/services/cplm-api/BackgroundServices/CplmConditionConsumerService.cs` (group `traverse-cpa-cplm-conditions`, `SingleMemberGuard`), `Controllers/CpmConditionsController.cs` (`GET /loops/{id}/conditions?from&to`), mirror DDL into `migration/schema/03-traverse_cplm.sql` and `scripts/cpm-07-v25-schema.sql` (ops file, added to `OPS_FILES`)
- Modify: `CplmGateFusionStreamJob.java:108-110` (fuse 4h as well; label `horizon`), `CplmGateFusionEngine` consumes open conditions from a broadcast of `traverse.cpa.clpm.condition.v1` (G10/G11 gate status from condition state, not only the long slice)
- Test: `tests/cplm-api.Tests/ConditionConsumerTests.cs` (upsert idempotent on replayed message), Flink `CplmFusionConditionTest`.

- [ ] Failing tests → implement → E2E step (1-hour freeze via simulator → `/conditions` returns it within 2 min) → commit `feat: condition events persisted and fused; 4h horizon fused`.

## Subphase 1E — Fusion: observations, hypotheses, fault-scoped confirmation (R02, R07; NR-026, NR-027)

### Task 1E.1: Split `CplmGateFusionEngine`; introduce `FusionVerdictV2`

**Files:**
- Create: `cplm/fusion/Observations.java` (symptoms: oscillation, effort, geometry, lag-asymmetry, limit, freeze — each `{present, score, support, method_id}`), `cplm/fusion/Hypotheses.java` (STICTION, TUNING, EXTERNAL_DISTURBANCE, SENSOR, ACTUATOR_LIMIT — scores from observation groups; `evidence_groups[]`, `contradictions[]`), `cplm/fusion/Confirmation.java` (G14: `claim_type`, `positive_evidence_ids[]`, `contradictions[]`, `scope`; CONFIRMED only when a positive non-following record exists: VP tracking error ≥ `nonfollowingErrorPp` for ≥ `nonfollowingDwellS` with valid VP quality, **or** an approved test record id), `cplm/fusion/FusionVerdictV2.java` (+ legacy fields kept for v1 readers)
- Modify: `CplmGateFusionEngine.java` → façade ≤ 300 lines; `g14Cap` 0.89 replaced by: no positive evidence ⇒ `hypothesis` max state `SUSPECTED`, never CONFIRMED; VP healthy tracking ⇒ contradiction recorded and stiction hypothesis demoted; G8 renamed `method_id="XCORR_ASYMMETRY_V1"` and moved to `SUPPORTING` for stiction (never decisive) (R07).
- Modify: `CplmGateResult.java` (+ `observations`, `hypotheses`, `confirmation`, `score_semantics="EVIDENCE_SCORE_UNCALIBRATED"`, `result_revision`)
- Test: `cplm/fusion/FusionVerdictV2Test.java` — NR-026 (effort-only + VP mapped, VP tracking healthy → stiction SUSPECTED, contradiction listed, G14 `NOT_CONFIRMED`), NR-027 (linear delayed plant fixture → geometry/lag cannot confirm), existing `CplmFormulaContractTest` weights/cap test rewritten to the new semantics.

- [ ] Failing tests → implement → golden `CplmGateEngineSynTic001Test`: update expectation file only for the **added** fields (diff must show additions only) → commit `feat(flink): fusion v2 — observations/hypotheses/fault-scoped confirmation; no VP-presence confirmation`.

### Task 1E.2: cplm-api and UI read fusion v2

**Files:**
- Modify: `Data/GateReadSql.cs` (project `payload->'hypotheses'`, `'confirmation'`), `CpmAnalyticsController.cs` gates/latest response (+ `hypotheses`, `confirmation`, `scoreSemantics`), `CpmInvestigation.tsx:60-68` `HYPOTHESES` now from server (delete client string-matching `caseFor :36-46`), `GateEvidencePanel.tsx:131-144` fusion prose from `confirmation.reason` (delete hardcoded "0.89")
- Split `CpmInvestigation.tsx` (570) → `investigation/CaseTriage.tsx`, `investigation/HypothesisPanel.tsx`, `investigation/ReasoningChain.tsx`
- Test: `tests/cplm-api.Tests/GateReadSqlTests` (+ v2 fields), vitest `HypothesisPanel.test.tsx`.

- [ ] Failing tests → implement → commit `feat(cpm): fusion v2 surfaced in gates/latest and Investigation`.

## Subphase 1F — Episodes: availability vs condition (R10; NR-029, NR-030)

### Task 1F.1: `CplmEventFrameService` keeps conditions open on missing evidence

**Files:**
- Modify: `database/scripts/53_…sql` (ALTER `analytics.cplm_event_frames` ADD `availability_state text default 'OBSERVED'`, `condition_state text default 'OPEN'`, `result_revision int default 1`, `qualified_support_ms bigint default 0`), mirrors in `migration/schema/03` and `scripts/cpm-07-v25-schema.sql`
- Modify: `BackgroundServices/CplmEventFrameService.cs:33-40,144-153,168-196` — EXCLUDED/INSUFFICIENT/NO_CALL ⇒ `availability_state='UNOBSERVABLE'`, frame stays `condition_state='OPEN'`; close only on a **qualified** contrary result whose support ≥ `recoverySupportS` (from profile, surfaced in payload) on a comparable window kind; `window_count` increments only for **non-overlapping** support (`qualified_support_ms` union), NR-029.
- Test: `tests/cplm-api.Tests/EventFrameLifecycleTests.cs` (pure: feed the `Apply(frame, result)` function — extract it from the consumer into `Services/EventFrameLifecycle.cs` so it is testable without Kafka).

- [ ] Failing tests → implement → commit `fix(cplm-api): missing evidence never closes an episode; overlapping windows do not multiply persistence`.

### Task 1F.2: Events UI shows availability and condition separately

**Files:**
- Modify: `components/Cpm/CpmEvents.tsx` (two pills: condition state, availability state; filter chips), `CalcDrawer.tsx` episodes tab
- Test: vitest `eventsState.test.ts` on the row classifier.

## Subphase 1G — Immutable run identity, evidence blob store, replay isolation (R19, R22, R26; NR-056, NR-057, NR-058, NR-060)

### Task 1G.1: Identity columns on the v1 result tables; `analysis_run`, `evidence_manifest`, `evidence_chunk`

Design decision: **the v1 row is the method run.** A gate-results row already is "one evaluation of 17 gates over one support"; it gets the immutable identity columns instead of a parallel table. `method_run_id` stays a **deterministic uuid per gate** (so evidence, the workbench and G12 all reference one id type) and is stored in `method_run_ids jsonb` on the row (`{"G5":"<uuid>", …}`), resolved by an expression index. G12 response events are event-keyed and live in `analytics.response_event` (2B.2) with their own `method_run_id`; `/method-runs/{id}` resolves either.

**Files:**
- Modify: `database/scripts/53_cplm_v25_identity_evidence.sql` (**second part**), mirrors as above.

```sql
\c traverse_cplm
-- 1. Identity on the existing rows (additive; DEFAULTs are metadata-only in PG ≥ 11, no rewrite)
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['cplm_gate_results','cplm_short_feature_results','cplm_long_feature_results'] LOOP
    EXECUTE format('ALTER TABLE analytics.%I
      ADD COLUMN IF NOT EXISTS method_run_ids   jsonb NOT NULL DEFAULT ''{}''::jsonb,
      ADD COLUMN IF NOT EXISTS bundle_hash      text  NOT NULL DEFAULT ''legacy'',
      ADD COLUMN IF NOT EXISTS context_revision int   NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS result_revision  int   NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS purpose          text  NOT NULL DEFAULT ''LIVE'',
      ADD COLUMN IF NOT EXISTS analysis_run_id  uuid,
      ADD COLUMN IF NOT EXISTS source_commit    text,
      ADD COLUMN IF NOT EXISTS jar_sha256       text,
      ADD COLUMN IF NOT EXISTS dataset_hash     text', t);
  END LOOP; END $$;
-- 2. A different configuration is a NEW row, never an overwrite (spec §1.6). Swap the unique key online.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_cplm_gate_results_window_bundle
  ON analytics.cplm_gate_results (loop_id, window_kind, window_end, source, bundle_hash);
DROP INDEX CONCURRENTLY IF EXISTS uq_cplm_gate_results_window;      -- same for uq_cplm_short_window / uq_cplm_long_window
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_cplm_gate_results_method_run_ids ON analytics.cplm_gate_results USING gin (method_run_ids);
-- (ops copy cpm-07 keeps CONCURRENTLY and runs outside a transaction; the lab script runs plain CREATE INDEX)
-- 3. Run registry (control plane for REPLAY / SHADOW / EVIDENCE_RECONSTRUCTION; LIVE rows have analysis_run_id NULL)
CREATE TABLE IF NOT EXISTS analytics.analysis_run (
  analysis_run_id uuid PRIMARY KEY,
  tenant_id text NOT NULL DEFAULT 'default', site text NOT NULL, loop_id text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('REPLAY','SHADOW','EVIDENCE_RECONSTRUCTION')),
  requested_from_ms bigint, requested_to_ms bigint, actual_from_ms bigint, actual_to_ms bigint,
  dataset_hash text, bundle_hash text, context_revision int, source_commit text, jar_sha256 text,
  state text NOT NULL DEFAULT 'CREATED', created_by text, created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz, error text, manifest jsonb NOT NULL DEFAULT '{}'::jsonb);
-- 4. Evidence (arrays) — new, keyed by the per-gate method_run_id; gate_result_id is the cheap join to the v1 row
CREATE TABLE IF NOT EXISTS analytics.evidence_manifest (
  evidence_id uuid PRIMARY KEY, method_run_id uuid NOT NULL, gate_result_id bigint REFERENCES analytics.cplm_gate_results(id) ON DELETE SET NULL,
  gate_id text NOT NULL,
  artifact_kind text NOT NULL, role_or_path text, x_quantity text, x_unit text, y_quantity text, y_unit text,
  data_type text NOT NULL, encoding text NOT NULL DEFAULT 'f64le+gzip', calculation_samples int, display_points int,
  chunk_count int NOT NULL, total_bytes bigint NOT NULL, sha256 text NOT NULL,
  readiness text NOT NULL DEFAULT 'PENDING' CHECK (readiness IN ('PENDING','COMPLETE','FAILED','EXPIRED')),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb, retention_class text NOT NULL DEFAULT 'STANDARD', pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS analytics.evidence_chunk (
  evidence_id uuid NOT NULL REFERENCES analytics.evidence_manifest(evidence_id) ON DELETE CASCADE,
  chunk_no int NOT NULL, byte_length int NOT NULL, sha256 text NOT NULL, payload bytea NOT NULL,
  PRIMARY KEY (evidence_id, chunk_no));
```

- Modify: `Data/FleetLatestSql.cs`, `Data/GateReadSql.cs` (the "newest row per loop" probes from CHG-023 must now pick `ORDER BY window_end DESC, result_revision DESC, created_at DESC` — existing `GateReadSqlTests` oracle pattern proves equivalence on legacy rows), `Data/CplmReadIndexes.cs` (self-heal DDL learns the new unique index name so a fresh lab volume matches).
- [ ] **Step 1:** apply to lab (`docker exec -i ams-postgres psql -U postgres < database/scripts/53_…sql`), idempotent re-run OK. **Step 2:** `tests/cplm-api.Tests/SchemaV25Tests.cs` asserts the columns/tables/indexes exist on 5433 (Integration trait); `FleetLatestSqlTests`/`GateReadSqlTests` still equal their oracles. **Commit** `feat(db): identity columns on v1 result rows, analysis_run + evidence tables (53)`.

### Task 1G.2: Flink `RunIdentity` + evidence artifact writer (Kafka chunk records)

**Files:**
- Create: `cplm/identity/RunIdentity.java` (`methodRunId = UUIDv5(namespace, loop|gate|method|version|from|to|bundleHash|contextRev|rev)` — deterministic so retries are idempotent), `cplm/identity/DatasetHash.java` (SHA-256 over sorted `(role, sample_ts, value, quality)` of the accepted support), `cplm/evidence/EvidenceArtifact.java` (`kind`, `xQuantity/unit`, `yQuantity/unit`, `double[] x, y`, `boolean[] mask`, `Map<String,Object> provenance`), `cplm/evidence/EvidenceChunker.java` (f64 little-endian + gzip, ≤ 256 KiB per chunk, per-chunk SHA-256, manifest SHA-256 over concatenation), `cplm/evidence/EvidenceKafkaRecords.java` (manifest record + chunk records, key `method_run_id`)
- Modify: `CplmKafkaSink.java` (+ `attachKeyedBytes` for chunk payload as base64 in JSON — keep one serialisation format), `CplmTopics`
- Test: `EvidenceChunkerTest` (100k-point artifact → N chunks, reassembles bit-identical, manifest sha matches), `RunIdentityTest` (same inputs → same UUID; different bundle hash → different UUID).

- [ ] Failing tests → implement → commit `feat(flink): deterministic method_run_id + evidence chunk transport`.

### Task 1G.3: Every engine result carries its identity on the same v1 record; evidence persisted separately

**Files:**
- Modify: `CplmGateResult.java`, `CplmShortFeatureResult.java`, `CplmLongDiagnosticsResult.java` (+ `methodRunIds{gate→uuid}`, `bundleHash`, `contextRevision`, `resultRevision`, `purpose`, `analysisRunId`, `datasetHash` — stamped by the jobs from `RunIdentity`/`DatasetHash`; the **same** `traverse.cpa.clpm.gate.results.v1` message, additive fields); evidence artifacts go to `traverse.cpa.clpm.gate.evidence.v1` (`record_kind: EVIDENCE_MANIFEST | EVIDENCE_CHUNK`, key `method_run_id`).
- Modify: `CplmResultConsumerService.cs:208-226,306-336` — upsert conflict target becomes `(loop_id, window_kind, window_end, source, bundle_hash)`; the `sample_count >=` guard stays **within** the same bundle (late-data refinement of the same evaluation), a different bundle inserts a new row; new columns written from payload (`bundle_hash` defaults to `'legacy'` when absent so old jars still persist); add `projection_lag_ms` metric (consumer lag → `/pipeline-metrics`), NR-058 backlog visibility.
- Create: `src/services/cplm-api/BackgroundServices/CplmEvidenceConsumerService.cs` (group `traverse-cpa-cplm-evidence`, single member; MANIFEST → insert PENDING (+ `gate_result_id` looked up by `method_run_ids @> {gate: id}` when the row already exists, else back-filled by a 60 s reconciler); CHUNK → insert; when all chunks present and per-chunk + total sha verify → `readiness=COMPLETE`; mismatch → `FAILED` + log; **never** marks COMPLETE early), `Services/EvidenceBlobStore.cs` (`IEvidenceBlobStore { Task PutChunk(...); Task<byte[]?> GetChunk(...); Task<ManifestStatus> Verify(...) }` + `PostgresEvidenceBlobStore`)
- Test: `tests/cplm-api.Tests/EvidenceConsumerTests.cs` (pure `Apply` function: out-of-order chunks, duplicate chunk, corrupted chunk → FAILED, complete → COMPLETE), `ResultUpsertTests.cs` (same bundle + larger sample_count → update; different bundle → second row; legacy payload → `bundle_hash='legacy'`), Flink `CplmPipelineSynTic001Test` extended: results carry 17 `methodRunIds`, deterministic across two runs of the same fixture.

- [ ] Failing tests → implement → E2E: after a 1-minute short window, the newest `cplm_gate_results` row has 17 `method_run_ids`, `bundle_hash <> 'legacy'`, `jar_sha256` = the running jar → commit `feat: run identity on v1 result rows; evidence persisted with checksum-verified COMPLETE`.

### Task 1G.4: Replay isolation — purpose, namespace, IoTDB source

**Files:**
- Modify: `CplmHistoricalReplayJob.java:47,98-108,230-239` (**same output topic** `traverse.cpa.clpm.gate.results.v1` and same table — isolation is by the `purpose` column + `source='flink-historical-replay'` already in the unique key; `purpose=REPLAY|SHADOW|EVIDENCE_RECONSTRUCTION` and `analysis_run_id` become first-class fields instead of the bolted-on `replay_id`; keyed sink like live), `Services/CplmRecomputeService.cs:78-123,161-162` (creates `analytics.analysis_run` first, passes `--analysis-run-id`, `--purpose`; status counts rows by `analysis_run_id` column, not `payload->>'replay_id'`), `CplmEventFrameService.cs:132-134` (ignore anything with `purpose <> 'LIVE'`), fleet/latest reads (`FleetLatestSql.cs`, `GateReadSql.cs`) filter `purpose='LIVE'` (they already filter `source='flink'`; keep both), new `Controllers/CpmAnalysisRunsController.cs` (`POST /analysis-runs` (perm `cpm.analysis.create`, 202 + id, Idempotency-Key header honoured via `analytics.analysis_run.manifest->>'idempotency_key'`), `GET /analysis-runs/{id}`), `POST /loops/{id}/recompute` becomes a thin adapter creating an analysis run (kept for old clients).
- IoTDB source: `cplm/replay/IotDbBoundedSource.java` (reads `root.<site>.cpm.<loop>.{pv,sp,op,vp,mode}` between from/to via the IoTDB session API already on the classpath (`flink-iotdb-connector`), materialises tuple v2 with `quality_protocol=HISTORIAN_HOLD`, `held` unknown ⇒ `hold_kind=HISTORIAN`), selected by `--source iotdb|kafka`; NR-056.
- Test: `CplmHistoricalReplayJob` parity test extended: `purpose` and `analysis_run_id` present on every record; `tests/cplm-api.Tests/AnalysisRunsApiTests.cs` (202, GET state, duplicate Idempotency-Key returns same id).

- [ ] Failing tests → implement → commit `feat: replay runs are analysis_runs with purpose, separate topic, IoTDB source`.

### Task 1G.5: Retention by record class

**Files:**
- Modify: `database/scripts/53_…sql` (retention policy table `analytics.retention_policy(record_class, days)`, seed `STANDARD=90`, `PINNED=NULL`), `Services/EvidenceRetentionSweeper.cs` (hosted, daily; marks manifests `EXPIRED` and deletes chunks for `STANDARD` beyond days unless `pinned`; never touches v1 rows — the retention decision for `cplm_gate_results` stays with ops per CHG-023 P1-4), `GET /method-runs/{id}/evidence` returns `EVIDENCE_EXPIRED` readiness (NR-060).
- Test: `EvidenceRetentionTests.cs` (pinned survives, unpinned expired, chunks gone, manifest kept).

## Subphase 1H — Instrumental NE107 transmitter health (R15; NR-036…NR-045)

### Task 1H.1: Contract + JSON schema + lab simulator publisher

**Files:**
- Create: `docs/next-release/instrumental-health-contract.md` (topics, envelope, state object, exactly as spec §4.3–4.5), `contracts/instrumental-health/v1/state.schema.json`, `event.schema.json`, `availability.schema.json` (strict: `additionalProperties:false`, required envelope fields `schema_version, message_kind, observation_id, tenant_id, site_id, producer_id, producer_epoch, sequence, source_id, device_id, observed_at, verified_at, published_at, state_revision, state_complete`; state `active_flags` array of `F|C|S|M`, `native_status`, `primary_flag?`, `collection_state` ∈ `VERIFIED|STALE|UNKNOWN|OFFLINE`, `measurement_impact` ∈ `VALID|INVALID|DEGRADED|UNKNOWN`, `diagnostics[]` with `diagnostic_id, native_code, message, flags, affected_variable_ids, measurement_impact, first_observed_at, cause, remedy, source_record_ref`; event adds `event_id`).
- Create: `scripts/sim/instrumental_health_sim.py` (paho; publishes retained `…/devices/{device}/state` QoS1, `/events` non-retained with full post-state, `/sources/{source}/availability` retained + LWT `offline`; scenarios via CLI: `--scenario f-on-pv|c-test|s-degraded|m-only|clear|stale|dup|conflict|epoch-reset|late-correction|replace-device`), `scripts/sim/requirements.txt` (+ paho-mqtt)
- Test: `scripts/sim/test_instrumental_health_sim.py` (pytest: every scenario payload validates against the schema with `jsonschema`).

- [ ] Write schemas → pytest fails → simulator → pytest passes → commit `feat(contracts): Instrumental NE107 health MQTT contract v1 + lab simulator`.

### Task 1H.2: ingestion-service `InstrumentalHealthSubscriber` → Kafka + DLQ

**Files:**
- Create: `src/services/ingestion-service/Health/InstrumentalHealthSubscriber.cs` (one per `INSTRUMENTAL_HEALTH` data-source profile; **separate from `OtLoopSubscriber` and `LoopParameterMapper`**), `Health/InstrumentalHealthValidator.cs` (schema validation via `JsonSchema.Net`; topic-capture vs payload tenant/site/device match; size/skew limits; `received_at`, `mqtt_retained`, `authenticated_producer` added by the gateway wrapper), `Health/InstrumentalHealthProducer.cs` (topic `traverse.cpa.instrument.health.v1`, key `device_id`; invalid → `traverse.ingestion.health-dlq`), `Health/HealthDedupe.cs` (LRU by `tenant/site/source/observation_id`; same id + different payload → `INTEGRITY_CONFLICT` to DLQ + metric)
- Modify: `Services/ProfileRegistry.cs` (+ profile `INSTRUMENTAL_HEALTH` with fields `topic_prefix`, `tenant_id`, `site_id`, `allowed_source_ids[]`), `Pipeline/OtIngestionHostService.cs` (host both subscriber kinds; keep `SupportedProfile` logic per profile), `Program.cs` DI, `PipelineEndpoints.cs` (`/stats` gains `instrumentalHealth{received, forwarded, dlq, conflicts}`)
- Test: `tests/ingestion-service.Tests/InstrumentalHealthValidatorTests.cs` (NR-036 all flags preserved; NR-039 exact duplicate idempotent, differing payload → conflict; NR-040 old sequence after new epoch without snapshot → parked `EPOCH_WITHOUT_SNAPSHOT`; malformed alias `first_seen` → rejected; oversized diagnostics → rejected), `InstrumentalHealthSubscriberTests.cs` (mosquitto-in-docker integration, `[Trait("Category","Integration")]`).

- [ ] Failing tests → implement → commit `feat(ingestion): InstrumentalHealthSubscriber (NE107) → Kafka with strict schema + DLQ`.

### Task 1H.3: Effective-dated primary device binding

**Files:**
- Create: `database/scripts/54_cpm_instrument_bindings.sql`:
```sql
\c traverse_cplm
CREATE TABLE IF NOT EXISTS cpm.signal_device_binding_history (
  binding_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default', site text NOT NULL, loop_id text NOT NULL REFERENCES cpm.loop_registry(loop_id),
  signal_role text NOT NULL CHECK (signal_role IN ('PV','SP','OP','VP','MODE')),
  device_id text NOT NULL, installation_id text, source_id text NOT NULL,
  valid_from timestamptz NOT NULL, valid_to timestamptz,           -- half-open [from,to)
  approved_by text NOT NULL, approved_at timestamptz NOT NULL DEFAULT now(), note text,
  CONSTRAINT ck_binding_range CHECK (valid_to IS NULL OR valid_to > valid_from));
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE cpm.signal_device_binding_history ADD CONSTRAINT ex_binding_no_overlap
  EXCLUDE USING gist (loop_id WITH =, signal_role WITH =, tstzrange(valid_from, valid_to, '[)') WITH &&);
CREATE TABLE IF NOT EXISTS cpm.instrument_health_observation (
  observation_id text NOT NULL, tenant_id text NOT NULL, site text NOT NULL, source_id text NOT NULL, device_id text NOT NULL,
  message_kind text NOT NULL, producer_epoch bigint NOT NULL, sequence bigint NOT NULL, state_revision bigint NOT NULL,
  observed_at timestamptz NOT NULL, verified_at timestamptz, published_at timestamptz, received_at timestamptz NOT NULL,
  active_flags text[] NOT NULL, collection_state text NOT NULL, measurement_impact text NOT NULL,
  payload jsonb NOT NULL, interpretation_version int NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, site, source_id, observation_id));
CREATE TABLE IF NOT EXISTS cpm.device_health_interval (
  interval_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, site text NOT NULL, device_id text NOT NULL,
  from_at timestamptz NOT NULL, to_at timestamptz, boundary_kind text NOT NULL,   -- NEWER_STATE|FRESHNESS_EXPIRED|SOURCE_OFFLINE|OPEN
  active_flags text[] NOT NULL, collection_state text NOT NULL, measurement_impact text NOT NULL, health_state_id text NOT NULL,
  affected_variable_ids text[] NOT NULL DEFAULT '{}', from_observation_id text NOT NULL, revision int NOT NULL DEFAULT 1, recorded_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS ix_dhi_device_time ON cpm.device_health_interval (tenant_id, site, device_id, from_at DESC);
CREATE TABLE IF NOT EXISTS cpm.source_availability (
  tenant_id text NOT NULL, site text NOT NULL, source_id text NOT NULL, state text NOT NULL, since_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL, PRIMARY KEY (tenant_id, site, source_id, since_at));
```
- Create: `Controllers/CpmContextController.cs` (`POST /loops/{id}/instrument-bindings` perm `cpm.context.manage`: body `{signalRole, deviceId, installationId?, sourceId, validFrom, note}`; server closes the previous open binding at `validFrom` (temporal split), 409 on overlap conflict, 422 on missing identity; `GET /loops/{id}/instrument-bindings?at=`), `Services/InstrumentBindingService.cs`
- Modify: `TraverseAuth.cs` Perms (+ `cpm.context.manage`), `59_cpm_v25_permissions.sql`, `sync-auth-module.ps1` run.
- Test: `InstrumentBindingServiceTests.cs` (replacement splits, overlap 409, as-of resolution picks the device installed at that time — NR-041).

### Task 1H.4: `CplmInstrumentContextJob` — as-of health intervals per loop/role

**Files:**
- Create: `cplm/health/CplmInstrumentContextJob.java`, `cplm/health/HealthObservation.java`, `cplm/health/DeviceStateMachine.java` (keyed by device: epoch/sequence ordering, `STATE_SNAPSHOT` supersedes, `STATE_EVENT` requires known epoch, freshness timer `max(3×scan_interval, site_min)` → `STALE`, availability offline → `OFFLINE`; late records with earlier onset produce a **revision** interval, never rewrite), `cplm/health/BindingBroadcast.java` (broadcast state of `signal_device_binding_history` pushed by cplm-api on `traverse.cpa.context.gate-config.v1`? **No** — bindings ride the existing `traverse.cpa.ams.metadata.updates` attribute `cplm.loop.binding` (same envelope as `cplm.loop.evidence`, `CpmLoopRegistryService.cs:1697-1712` pattern) so no new topic is needed), `cplm/health/LoopHealthContext.java` (output on `traverse.cpa.context.instrument-health.v1`, key `loop_id`: `{loop_id, role, device_id, from_ms, to_ms|null, active_flags, collection_state, measurement_impact, eligibility (ELIGIBLE|LIMITED|INELIGIBLE|UNKNOWN|NOT_CONFIGURED), reason, health_state_id, binding_id, revision}`) with the **impact policy table** of spec §4.6 encoded in `HealthEligibilityPolicy.java` (F affecting PV → INELIGIBLE; C → INELIGIBLE for identification, LIMITED for descriptive; S → LIMITED; M → ELIGIBLE; unrelated variable → ELIGIBLE (state visible); UNKNOWN/STALE → LIMITED; no binding → NOT_CONFIGURED; fresh empty → ELIGIBLE `NO_ACTIVE_DIAGNOSTIC`).
- Submit-script/JOBS registration (job `AMS - CPLM Instrument Context Engine`).
- Test: `DeviceStateMachineTest` (NR-037 empty verified state clears; NR-038 stale retained snapshot → STALE not clear; NR-040 epoch reset; NR-042 variable-specific fault leaves other channel ELIGIBLE; NR-045 late correction → revision 2 with original kept), `HealthEligibilityPolicyTest` (one test per policy row).

- [ ] Failing tests → implement → commit `feat(flink): CplmInstrumentContextJob — NE107 device state → loop/role eligibility intervals`.

### Task 1H.5: cplm-api mirror consumer + `instrument-health` endpoints

**Files:**
- Create: `BackgroundServices/CplmInstrumentHealthMirrorService.cs` (consumes both health topics; group `traverse-cpa-cplm-health`; observation insert-ignore on PK; interval upsert by `(device, from_at, revision)`), `Controllers/CpmInstrumentHealthController.cs` (`GET /loops/{id}/instrument-health?at=` → effective device (binding as-of) + latest/as-of interval + `observed_age_s`, `verified_age_s`, `NOT_CONFIGURED` when no binding; `GET /loops/{id}/instrument-health/history?from&to&cursor` cursor-paged intervals incl. availability gaps and replacements), `Services/InstrumentHealthReads.cs`
- Modify: `CplmGateFusionEngine`/long job: G11 emits `health_lanes` from the context stream (F/C/S/M intervals, `source_verified_time`, `measurement_impact`, `eligibility_intervals`) — **absence of health ≠ OK** (`NOT_CONFIGURED` shown).
- Test: `InstrumentHealthReadsTests.cs` (as-of with replacement, stale age), E2E steps in `scripts/test-cpm-v25-slice1-e2e.ps1` using the simulator: publish F on PV → `/instrument-health` shows F within 30 s; publish `clear` with `state_complete=true` → NO_ACTIVE_DIAGNOSTIC; stop the sim (LWT) → OFFLINE with last observed status retained.

### Task 1H.6: UI — `TransmitterHealthPanel`, header indicators, G11 lanes, fleet filters

**Files:**
- Create: `components/Cpm/health/TransmitterHealthPanel.tsx` (drawer: device, F/C/S/M chips using `--alert-*` tokens with **text labels** always visible, native status, observed/verified age, diagnostics table with cause/remedy, mapping version, allow-listed deep link), `health/HealthLane.tsx` (echarts `custom` interval lane reused by Historical and G11 view; step intervals, gaps preserved), `health/useInstrumentHealth.ts` hooks, `api/cpm/health.ts`
- Modify: `explorer/LoopWorkspace.tsx` header (+ health indicator), `CpmInvestigation` health timeline synced to selection, `CpmPerformance.tsx` fleet filter chips `missing binding | stale collection | active affected-device condition` (server-side param on `/fleet/rankings?health=`), `historical/chartOption.ts` (+ optional health lane)
- Test: vitest `TransmitterHealthPanel.test.tsx` (NR-044: M-only renders "context only, measurement valid"; NOT_CONFIGURED renders unavailable state, not OK).

### Task 1H.7: Slice-1 E2E script and tracker entry

**Files:**
- Create: `scripts/test-cpm-v25-slice1-e2e.ps1` (copies the `Step`/`Assert` harness; steps: v2 tuple present; UNKNOWN quality loop → G0 FAIL reason; quality-only change emitted on live topic; freeze episode → `/conditions`; NR-026 fixture → SUSPECTED not CONFIRMED; method_run rows + COMPLETE evidence manifest; replay run → separate topic, no live episode; all 1H.5 health steps).
- Modify: `changes_tracker.md` (new `## CHG-026 ✅ Slice 1 — qualification and safe semantics` entry in the house format: Reported/Root cause/What changed table/Measured/Verification), `docs/next-release/01-audit-vs-code.md` (verdicts flipped with commit ids).

# Phase 2 — System response (G12), gate evidence workbench, interactions, loop model (spec Slice 2)

Exit criteria: G12.SYSTEM_RESPONSE v1 producing eligibility/events/metrics/candidate models/validation on lab fixtures (NR-001…NR-017); every engine gate emits its exact artifacts; `/method-runs/{id}/evidence` + chunk transport served with ETag; `GateEvidenceWorkspace` opens all 17 gate views from an immutable selection; G13 aligned peer analysis or explicit unavailable; registry stores service family / dynamic class / objective / topology / acquisition separately. Lab E2E `scripts/test-cpm-v25-slice2-e2e.ps1` green.

## Subphase 2A — Response numerical kernel (pure Java, commons-math3; R01)

Package `com.ams.flink.cplm.response.*`. Everything here is deterministic, side-effect free, and unit-tested against the spec's synthetic examples. No Flink types.

### Task 2A.1: Model bank and simulators (`response.model`, `response.simulation`)

**Files:**
- Create: `response/model/ModelFamily.java` (enum `FOPDT, SOPDT, SO_UNDERDAMPED, IPDT, INTEGRATOR_LAG; UNSUPPORTED_INVERSE, UNSUPPORTED_UNSTABLE, UNSUPPORTED_MIMO`), `response/model/ProcessModel.java` (immutable: family, `Map<String,Quantity> params` with units, `pathId`, `sign`), `response/model/Quantity.java` (`quantityId, Double value, String unit, Double uncertainty, String method, String reasonIfNull`), `response/simulation/StateSpace.java` (A,B,C,D + delay), `response/simulation/ZohSimulator.java` (exact ZOH per actual interval: `A_d = expm(A·dt)`, `B_d = ∫expm(A s)B ds` via augmented matrix exponential using `org.apache.commons.math3.linear` — never `1/(τ1−τ2)`), `response/simulation/InputReconstruction.java` (held intervals `[t_i, t_{i+1})`, fractional delay by linear interpolation of the delayed input at sub-grid resolution, gaps beyond `maxBridgeS` → simulation stops, mask false)
- Test: `response/simulation/ZohSimulatorTest.java`:
  - FOPDT Kp=3, θ=4, τ=20 step 40→45 from y0=100 → `y(∞)=115`, `y(4+20)=100+15(1−e⁻¹)` within 1e-9; t10=6.1072, t90=50.0517 (spec §2.11)
  - SOPDT with τ1=τ2=10 → finite, equals analytic critically damped response
  - IPDT step 2 pp, Ki=0.000166667 m/(s·pp), θ=12 → slope change 0.010→0.030 m/min
  - Irregular sampling (5 s, 7 s, 3 s) equals uniform reference within 1e-9
  - Gap > maxBridge → mask false after gap

- [ ] Failing tests → implement → `mvn -Dtest=ZohSimulatorTest test` → commit `feat(response): model bank + exact ZOH simulators`.

### Task 2A.2: Observed-response metrics (`response.metrics`)

**Files:**
- Create: `response/metrics/ResponseMetricCalculator.java`, `response/metrics/Endpoints.java` (robust baseline/final on separately qualified stable support: median of last `preSupportS` before t0 and of the tail dwell; returns `null` + `NO_STABLE_ENDPOINT` when tail dwell not satisfied → right-censored), `response/metrics/Crossings.java` (first **sustained** crossing with `crossingDwellS`, linear interpolation between samples, direction-normalised progress `p(t)`), `response/metrics/ErrorIntegrals.java` (held half-open intervals clipped to event bounds: IAE, ISE, exact ITAE `0.5|e|((b−t0)²−(a−t0)²)`, MAE_time, RMSE_time, `valid_coverage`, `excluded_duration_s`), `response/metrics/Settling.java` (`B_resp = max(absBand, relBand·|dy|, noiseFloor)`; `t_settle_response` OBSERVED_THROUGH_T semantics; `t_settle_target` vs approved SP band; censoring), `response/metrics/Overshoot.java` (response overshoot/undershoot from p(t), target overshoot vs r1, `ess=r1−yss`, peak time/EU, decay ratio only from qualified same-side successive peaks)
- Test: `ResponseMetricCalculatorTest.java` — NR-001 timings on the synthetic FOPDT; NR-002 negative gain (step 45→40, Kp −3) → same rise time, overshoot 0; NR-008 truncated capture (ends at t=40 s) → `settle_response=null reason RIGHT_CENSORED`; NR-009 biased response (yss=113 with r1=115) → response-settle finite, target-settle null `TARGET_BAND_NOT_ENTERED`, `steady_error=2`; ITAE exactness vs closed form on a held constant error; coverage with a 30 s BAD-quality hole → `valid_coverage<1`, integrals exclude the hole.

### Task 2A.3: Event detection and capture state machine (`response.event`)

**Files:**
- Create: `response/event/ResponseEventDetector.java` (trigger `max(stepMinInputEu, stepMinSpanFraction×span, noiseMultiplier×1.4826×MAD(pre-window detrended))`; pre-support stability; amplitude + direction persistence for `eventDwellS`; step vs ramp classification by `d(sp)/dt` persistence; event types `SERVO_STEP, CASCADE_SP_STEP, LOAD_RESPONSE, UNMEASURED_DISTURBANCE_RESPONSE, INPUT_TEST, RAMP_TRACKING, ROUTINE_IDENTIFICATION`), `response/event/CaptureStateMachine.java` (`IDLE→CANDIDATE→CAPTURING→QUALIFIED→ESTIMATING→CANDIDATE_MODEL→VALIDATING→COMPLETE | REJECTED | CENSORED`; segmentation triggers: new SP/input event, mode transfer, source gap, health change, binding/config change, region exit, actuator constraint; max-duration guard → `CENSORED reason CAPTURE_MAX`), `response/event/ResponseEvent.java` (id = UUIDv5 of loop|t0|type|bundleHash; `input_sequence[]` retained, never collapsed), `response/event/InputPathResolver.java` (`OP_TO_PV`, `VP_TO_PV`, `SLAVE_SP_TO_PV` (cascade), `EXOGENOUS_TEST`; requires `u_applied` availability; cascade master OP is **not** a valve command)
- Test: `ResponseEventDetectorTest` (NR-006 constant input → no candidate; noise-only SP jitter below threshold → none; ramp → `RAMP_TRACKING` not step), `CaptureStateMachineTest` (NR-007 second step at t=30 s → first event `CENSORED reason SUPERSEDED_BY_EVENT`, second event created with full input sequence; mode→MAN during capture → CENSORED `MODE_TRANSFER`; NR-043 F on PV during capture → CENSORED `HEALTH_INELIGIBLE`).

### Task 2A.4: Estimators (`response.estimation`)

**Files:**
- Create: `response/estimation/ModelEstimator.java` (interface: `EstimationResult estimate(EventDataset ds, EstimatorSettings s)`; each adapter publishes `supportedFamilies()`, `supportedPaths()`, `parameterKeys()`), `response/estimation/OutputErrorEstimator.java` (bounded weighted least squares with `LevenbergMarquardtOptimizer` (commons-math3 `fitting.leastsquares`) over `[Kp, θ, τ (,τ2|ζ,ωn), y0, v0]`; delay profile grid over `[delayMinS, delayMaxS]` at signal-time resolution then LM refine per seed; both sign candidates when sign unknown; stores objective-vs-delay curve, Jacobian-based covariance, bounds-hit flags, condition number; `fitMaxIterations`, `fitRelativeTolerance` from settings), `response/estimation/IntegratingEstimator.java` (slope-change fit for IPDT / integrator+lag on the **actual delayed input**, baseline drift `v0` nuisance; never reports static Kp), `response/estimation/ClosedLoopPemEstimator.java` (Box-Jenkins one-step innovation minimisation over a bounded order/delay set for `ROUTINE_IDENTIFICATION`; stable/invertible noise filter enforced; excitation rank test; returns `NO_EXCITATION` / `AMBIGUOUS_MODELS` states — **never** endpoint ratio on closed-loop data), `response/estimation/EstimationResult.java` (candidate list, each with `ProcessModel`, `J`, `covariance`, `identifiability{flat_delay, bounds_hit, cond}`), `response/estimation/EstimatorRegistry.java` (family/path/estimator legality table; unsupported → validation error not a zero model)
- Test: `OutputErrorEstimatorTest` (NR-001 recover Kp=3±0.02, θ=4±0.2, τ=20±0.5 on noise σ=0.2 t/h; NR-002 negative; NR-010 θ=0.5 s on 5 s grid → `dead_time.uncertainty ≥ 2.5`, identifiability `FLAT_DELAY`; NR-013 SOPDT τ1=τ2 → finite; NR-006 no excitation → `NOT_ESTIMATED`), `IntegratingEstimatorTest` (NR-003 Ki recovered, `process_gain=null reason INTEGRATING`), `ClosedLoopPemEstimatorTest` (NR-005 steady-SP routine noise → abstains; NR-012 correlated residuals → REJECTED with lag convention in reason).

### Task 2A.5: Validation, uncertainty, controller/frequency outputs (`response.validation`, `response.controller`)

**Files:**
- Create: `response/validation/ModelValidator.java` (train/holdout split by whole events and contiguous time; free-run simulation RMSE + one-step prediction RMSE; `fit_improvement` vs declared baseline (constant `y0` model); residual bias; whiteness (Ljung-Box) only where assumptions hold; input–residual correlation with declared lag convention (positive lags only); AICc across candidates on the same support; verdict `CANDIDATE|VALIDATED|REJECTED`), `response/validation/UncertaintyEstimator.java` (methods `COVARIANCE`, `PROFILE_LIKELIHOOD`, `BLOCK_BOOTSTRAP` (event/time-block, seed recorded); `confidenceLevel`, repetitions from settings), `response/controller/ControllerSnapshot.java` (native form/units/gains/times/filters/limits + `conversion_adapter_version`; `UNKNOWN` form ⇒ no conversion), `response/controller/ControllerFormAdapter.java` (parallel ↔ ideal only; series ⇒ `UNSUPPORTED_FORM`), `response/controller/FrequencyResponse.java` (L(jω)=C·G with delay; S, T, all crossings, GM/PM, peak |S|, |T|, bandwidth; `UNAVAILABLE` reasons for unknown form / unvalidated model / no crossing in band), `response/controller/SimcAdvisor.java` (named rule `SIMC_2003_CORRECTED`, only when model VALIDATED + controller known + approved λ (`G12.lambda_s`); output is advisory `{Kc, Ti, Td}` with units — never applied)
- Test: `ModelValidatorTest` (NR-011 holdout by event; free-run vs prediction reported separately; flexible predictor with wrong plant fails free-run), `UncertaintyEstimatorTest` (block bootstrap CI wider than i.i.d. on autocorrelated residuals — assert ordering), `FrequencyResponseTest` (FOPDT + PI known margins vs closed form; NR-014 unknown form → `gain_margin=null reason CONTROLLER_FORM_UNKNOWN`), `SimcAdvisorTest` (self-regulating vs integrating rule paths; refuses on CANDIDATE model).

### Task 2A.6: G12 result schema + evidence artifacts (`response.evidence`)

**Files:**
- Create: `response/G12Result.java` (`method_id="G12.SYSTEM_RESPONSE"`, `method_version="1.0.0"`, subgates A–H each `{state, outputs}`, `evaluation_state`, `eligibility`, `finding`, `model_state`, `metrics[]` (all 52 quantities from the workbook, each a `Quantity`), `evidence.has_approved_test_record`, `controller_snapshot_ref`, `health_exclusions[]`, identity block), `response/evidence/ResponseEvidenceWriter.java` (artifacts: `response_event`, `accepted_samples` (+mask), `input_reconstruction`, `y_fit`, `y_predict`, `prediction_interval`, `confidence_interval`, `baseline`, `target`, `response_times`, `residuals`, `residual_acf`, `excitation_rank`, `candidate_models` (table), `delay_objective_curve`, `parameter_intervals`, `bode` (when valid), `rejection_reasons`) via `EvidenceArtifact` from 1G.2
- Test: `G12ResultTest` (JSON round-trip; every quantity id from `xlsx_Response_quantities.tsv` present exactly once — test reads the TSV checked in at `docs/next-release/spec/`; `process_gain` null with reason on IPDT; `gain` never appears without unit and path).

## Subphase 2B — `CplmResponseAnalysisJob` (event-time, budgeted; R01, R11)

### Task 2B.1: The job

**Files:**
- Create: `cplm/response/CplmResponseAnalysisJob.java` (sources: tuple v2 (keyed loop), broadcast: gate-config bundle (Phase 3; until then the resolved `CplmLoopDynamicsProfile` + G12 settings block), instrument-health context, controller snapshots + bindings via `ams.metadata.updates` attributes; keyed process function `ResponseCaptureOperator` holding `CaptureStateMachine` state (checkpointed), event-time timers for pre/post/max capture, on QUALIFIED → `EstimationOperator` (async I/O style bounded pool, per-loop concurrency 1, global `--max-concurrent-fits`, per-fit time budget → CENSORED `BUDGET_EXCEEDED` never a partial model); outputs: `G12Result` → `traverse.cpa.clpm.response.results.v1` (keyed loop) + METHOD_RUN/EVIDENCE records → `traverse.cpa.clpm.gate.evidence.v1`), `cplm/response/ResponseCaptureOperator.java`, `cplm/response/EstimationOperator.java`, `cplm/response/ResponseJobConfig.java`
- Bounded replay: `CplmHistoricalReplayJob` gains `--methods G12` to run the **same operators** over the bounded source with `purpose=REPLAY|EVIDENCE_RECONSTRUCTION` (NR-056/057).
- Register job in submit scripts, supervisor, `ensure_flink_jobs.py`, `04b`, `JOBS.md`, `topics.txt`, lab reset script (`traverse.cpa.clpm.response.results.v1`).
- Test: `CplmResponseAnalysisJobTest` (MiniCluster: feed synthetic FOPDT servo step tuples v2 at 5 s → one COMPLETE event, `servo_gain≈1`, `process_gain=null reason PATH_NOT_EXOGENOUS`; feed exogenous INPUT_TEST with `u_applied` → FOPDT candidate VALIDATED after second event; NR-017 thermal event exceeding `captureMaxS` → CENSORED; NR-016 5 s grid fast flow → eligibility `LIMITED reason BANDWIDTH`), `ResponseReplayParityTest` (live vs replay on the same fixture → identical `G12Result` minus identity).

### Task 2B.2: cplm-api response consumer, tables, endpoints

**Files:**
- Create: `database/scripts/55_cplm_response.sql` (`analytics.response_event(event_id uuid PK, loop_id, method_run_id, event_type, t0_ms, t_end_ms, capture_state, path_id, input_step jsonb, sp_step jsonb, censor_reason, bundle_hash, context_revision, result jsonb)`, `analytics.response_metric(method_run_id, quantity_id, value double precision, unit, path_id, uncertainty, method, support_from_ms, support_to_ms, config_hash, reason, PRIMARY KEY(method_run_id, quantity_id))`, `analytics.system_model(model_id uuid PK, loop_id, path_id, family, parameters jsonb, estimator, uncertainty_method, training_support jsonb, validation_support jsonb, model_state text CHECK IN ('CANDIDATE','VALIDATED','ACTIVE_BASELINE','REJECTED','EXPIRED','SUPERSEDED'), approved_domain jsonb, controller_snapshot_id uuid, context_revision int, created_from_event uuid, created_at, superseded_by uuid)`, `analytics.model_validation(model_id, validation_id uuid PK, holdout_support jsonb, free_run_rmse, prediction_rmse, fit_improvement, residual_bias, whiteness jsonb, verdict, details jsonb)`, `cpm.controller_snapshot(snapshot_id uuid PK, loop_id, valid_from, valid_to, vendor, algorithm_family, form, native jsonb, normalized jsonb, adapter_version, source, imported_by, imported_at)`, `cpm.loop_objective_version(objective_id uuid PK, loop_id, objective_type, band jsonb, approved_by, approved_at, valid_from, valid_to)`), mirrors in `migration/schema/03` and `scripts/cpm-07-v25-schema.sql`
- Create: `BackgroundServices/CplmResponseConsumerService.cs` (group `traverse-cpa-cplm-response`; verbatim persistence), `Controllers/CpmResponseController.cs` (`GET /loops/{id}/response-events?from&to&cursor` incl. rejected/censored; `GET /response-events/{id}` with subgates/models), `Controllers/CpmModelsController.cs` (`GET /loops/{id}/models?at&regime` — applicable validated/candidate as-of, never "latest"; `POST /models/{id}/review` perm `cpm.model.review`: body `{decision: VALIDATED|REJECTED|ACTIVE_BASELINE|EXPIRED, domain, note}` bound to `model_id` + evidence ids, If-Match on model revision, 409 on stale), `CpmContextController` (+ `POST /loops/{id}/controller-snapshots` perm `cpm.context.manage` — import approved native settings; `GET /loops/{id}/analysis-context?at=` → objectives, roles, bindings, controller snapshot, acquisition contract, health refs as-of)
- Perms: `cpm.analysis.create`, `cpm.model.review` (+ SQL, `Perms`, sync).
- Test: `ResponseConsumerTests`, `ModelsApiTests` (as-of picks VALIDATED in regime; review is server-owned: decision recorded with actor from `X-Auth-*`; 403 without perm), `AnalysisContextTests`.

## Subphase 2C — Exact intermediates for G0–G11, G13–G15 (R12 backend half)

### Task 2C.1: Engine artifact emission per gate

For each gate the engine writes artifacts with **exactly the workbook field names** (`xlsx_Gate_evidence.tsv`, column "Artifact fields") through `EvidenceArtifact` — no summary-derived series.

**Files:**
- Create: `cplm/evidence/GateArtifacts.java` (typed builders per gate; single source for artifact kinds/units), `cplm/engine/*` emit through it:
  - G0 `sample_time, verified_time, arrival_time, value, quality_native, quality_normalized, hold_kind, age_s, delta_t_s, accepted_mask, exclusion_reason` (per role)
  - G1 `mode_native, mode_normalized, controlling_authority, selector_id, selected, tracking, op_requested, u_applied, state_intervals`
  - G2 `sp, pv, d_sp_dt, event_id, trigger_threshold, stable_pre_mask, event_type`
  - G2r `pv, u_applied, region_vertices_or_bounds, domain_mask, operating_regime_id`
  - G3 `error, tolerance_band, cumulative_iae, cumulative_ise, cumulative_itae, eligible_duration, objective_id, benchmark_interval`
  - G4 `u_applied, vp, delta_u, reversal_markers, command_total_variation, measured_travel_variation, sigma_u_norm, sigma_pv_norm, baseline_activity`
  - G5 `preprocessed_signal, acf_lag_s, acf_value, acf_pair_count, crossing_times, accepted_cycles, regularity_method` — **`OscillationMath.computeAcfPeriod` returns the full ACF array** (bounded by estimator support)
  - G6 `frequency_hz, psd_or_amplitude, ordinate_kind, spectral_window, detrend, fft_size, resolution_hz, noise_reference, peak_indices, harmonic_indices` — replace the naïve DFT with commons-math3 `FastFourierTransformer` (zero-padded to 2ⁿ, Hann window, Welch averaging with `segment_samples`/`overlap_fraction` from profile) producing a real PSD in signal²/Hz; `ordinate_kind="PSD"`; keep old scalars (peak ratio etc.) computed **from this PSD** so golden values move only within documented tolerance
  - G7 `cycle_id, original_indices, phase, measured_cycle, sine_fit, triangle_fit, amplitudes, phases, sse_sine, sse_triangle, cycle_score` per accepted **and rejected** cycle with rejection reason
  - G8 `lag_s, phi_positive, phi_negative, odd_contribution, even_contribution, method_id="XCORR_ASYMMETRY_V1"`; bicoherence not installed ⇒ artifact absent with capability reason
  - G9 `cycle_id, pair_indices, pv, u_applied, normalized_pairs, polygon_vertices, corners, area, bbox_area, qualification_steps`
  - G10 `u_requested, u_applied, vp, tracking_error, active_low, active_high, limit_reason, dwell_events, supply_pressure, actuator_pressure, validity` (pressures null with `NOT_MAPPED`)
  - G11 `pv, delta_pv, noise_band, freeze_events, spikes, quantization, F, C, S, M, health_state_id, source_verified_time, measurement_impact, eligibility_intervals`
  - G13 (2F), G14 `claim_type, positive_evidence_ids, contradictions, source_validity, test_id, review_record, scope, confirmed_at`, G15 `observations, hypotheses, evidence_groups, score_semantics, explanations, qualified_support, condition_state, availability, case_state, result_revision`
- Test: `GateArtifactsTest` (per gate: artifact set equals the workbook field list — the test parses `docs/next-release/spec/xlsx_Gate_evidence.tsv`; units present; lengths consistent; masks boolean), `OscillationMathPsdTest` (pure sine 100 s period at 5 s → PSD peak at 0.01 Hz, units signal²/Hz, Parseval within 2 %), golden `CplmGateEngineSynTic001Test` re-baselined **only** for G6 scalars with the tolerance recorded in `docs/next-release/00-build-truth.md`.

### Task 2C.2: Evidence API — manifest + chunks with ETag, on-demand reconstruction

**Files:**
- Create: `Controllers/CpmMethodRunsController.cs` (`GET /method-runs/{id}` immutable — resolves the uuid through `cplm_gate_results.method_run_ids @> '{"<gate>":"<id>"}'` (GIN) or `analytics.response_event.method_run_id`, returns that gate's slice of the row's payload plus the identity columns; `GET /method-runs/{id}/evidence` → manifest `{artifacts:[{artifact_id, method_run_id, kind, role_or_path, support, x{quantity,unit}, y{quantity,unit}, data_type, encoding, checksum, calculation_samples, display_points, masks, provenance, readiness}]}` with `ETag = sha256(manifest)`; readiness `PENDING|COMPLETE|FAILED|EXPIRED`), `Controllers/CpmEvidenceController.cs` (`GET /evidence/{id}/chunks/{n}` → `application/octet-stream` (gzip f64le), `ETag` = chunk sha, `Cache-Control: private, immutable, max-age=31536000`, 404 when EXPIRED with JSON reason, tenant/site check on every request via the loop's site vs `X-Auth-Sites`), `POST /analysis-runs` accepts `purpose=EVIDENCE_RECONSTRUCTION` + `method_run_id` → new linked run through `CplmHistoricalReplayJob --methods <gate>` (never changes the original verdict).
- Test: `EvidenceApiTests` (COMPLETE manifest served, ETag stable across calls, `If-None-Match` → 304; PENDING → readiness only; EXPIRED → 410 with `EVIDENCE_EXPIRED`; cross-site → 403).

## Subphase 2D — API breadth for the workbench (R13, R24)

### Task 2D.1: Gate catalogue, investigation references

**Files:**
- Modify: `CpmCapabilitiesController` (+ `GET /gate-catalogue` → 17 entries: definition, installed method(s)/versions, artifact kinds, property ids (Phase 3 fills), capability state; **the UI's `GATE_ROLES` and `calcCatalogue.ts` are replaced by this**)
- Create: `database/scripts/56_cplm_investigation_refs.sql` (`analytics.investigation_reference(ref_id uuid PK, loop_id, method_run_id, evidence_ids uuid[], note, created_by, created_at, pinned bool)`), `Controllers/CpmInvestigationsController.cs` (`POST /investigations` perm `cpm.manage` → pins evidence (`evidence_manifest.pinned=true`), `GET /loops/{id}/investigations`) — replaces the note-on-acknowledge hack (`CpmReplay.tsx:447-472`); "completed work ≠ restored" NR-062: an investigation has `outcome ∈ WORK_COMPLETED|PERFORMANCE_RESTORED|INCONCLUSIVE` set explicitly, default `INCONCLUSIVE`.
- Test: `GateCatalogueTests` (17 once, G2r included), `InvestigationsApiTests` (pin survives the retention sweeper test from 1G.5).

## Subphase 2E — Frontend: `GateEvidenceWorkspace` and the 17 views (R12 UI half, R13, R14; NR-031…NR-035)

### Task 2E.1: Chart and state infrastructure

**Files:**
- Create: `components/Cpm/evidence/CpmChart.tsx` (single echarts wrapper: `ResizeObserver`, `notMerge`, theme from `useObcTheme`, colours from `cpmChartColors/cpmToneColors`, `timeZone` prop → all x-axis labels/tooltips via `Intl.DateTimeFormat(…, {timeZone})` with the zone label visible; **`connectNulls:false` enforced; `step:'end'` for held/hold_kind series**; companion `<DataTable>` toggle + CSV export with the same values), `components/Cpm/evidence/GateResultState.tsx` (discriminated union `LOADING|NO_RESULT|NOT_EVALUATED|UNSUPPORTED_METHOD|EVIDENCE_PENDING|EVIDENCE_EXPIRED|FAILED_REQUEST|SHADOW|DISABLED` → OpenBridge-token panel with prerequisite text, "which results remain valid", next observation; `classifyGateResult(cell, manifest, error)` pure), `components/Cpm/evidence/timezone.ts` (site tz from loop registry `timezone`; DST-safe), `components/Cpm/evidence/artifactCodec.ts` (fetch chunks → `Float64Array` via `DecompressionStream('gzip')`, verify sha-256 with `crypto.subtle`, cache by `evidence_id` in IndexedDB (no-network continuation of previously retained artifacts))
- Test: vitest `classifyGateResult.test.ts` (all 9 states), `artifactCodec.test.ts` (reassembly + checksum mismatch → FAILED), `timezone.test.ts` (non-UTC + DST boundary formats correctly), `CpmChart.test.tsx` (option has separate yAxis per unit group; tooltip contains unit/quality/sample time/verified time).

### Task 2E.2: Historical chart axes and tooltip (R14)

**Files:**
- Modify: `components/Cpm/historical/chartOption.ts:165-197` (yAxis[0] PV/SP EU, yAxis[1] OP/VP `pp` right side; explicit "Normalize" toggle shows the conversion; tooltip = unit, original value, sample time, verified time, hold kind, quality; site tz), `CpmHistorical.tsx` (toggle), split `CpmReplay.tsx` (479) into `replay/ReplayChart.tsx`, `replay/TransformationStepper.tsx`, `replay/LineageStrip.tsx`; replay requests `pv,sp,op,vp` and walks the cursor (`getRawCursor`) until `hasMore=false` or a budget of 200k points with a visible "truncated" state.
- Test: `chartOption.test.ts` (400 °C PV and 0–100 pp OP → two axes, both legible; NR-033).

### Task 2E.3: `GateEvidenceWorkspace` shell + immutable selection (R13; NR-031)

**Files:**
- Create: `components/Cpm/evidence/GateEvidenceWorkspace.tsx` (route `/cpm/evidence?loop=&methodRun=&gate=&mode=`; **props are an immutable `EvidenceSelection {tenant, site, loopId, analysisRunId?, methodRunId, resultRevision, gateId, support{from,to}, bundleHash, bindingRevision, controllerSnapshotId?, representation}`**; never calls `useLatestGates`; explicit "Go to latest" action navigates with a new selection; three columns: gate list (left, searchable, eligibility/finding), centre `SignalContextLanes` + gate view, right `MethodTracePanel`), `GateEvidenceHeader.tsx` (loop/tag, device as-of, `LIVE|FROZEN|FIXED|REPLAY|COMPARE` mode, interval + tz, source age, objective/regime, command path, method/config version, readiness), `SignalContextLanes.tsx` (PV/SP pane, OP/VP pane, mode lane, health lane, availability lane — shared crosshair/zoom via echarts `connect`), `MethodTracePanel.tsx` (metric, formula, parameters used **from the method_run**, why/not-why, exclusions, next valid action; role/threshold/preconditions from the selected run, `GATE_ROLES` deleted from all three files), `EvidenceArtifactRenderer.tsx` (switch on `artifact.kind` → gate view component), `evidence/useEvidence.ts` hooks (`useMethodRun`, `useEvidenceManifest`, `useArtifact`, `useGateCatalogue`) with abort on selection change (stale response after loop switch must not render — NR "stale response arrival")
- Modify: `GateEvidencePanel.tsx` becomes a thin launcher ("Open in workbench") that passes the **clicked cell's `method_run_id`**; `GateMatrix`/`CpmPerformance` cells carry `methodRunId` from `/fleet/heatmap` (+ column in `FleetLatestSql.cs`); `App.tsx` route + nav entry "Evidence Workbench".
- Test: `GateEvidenceWorkspace.test.tsx` (renders from a fixed selection without any latest-gates request — assert the mock fetch is never called with `/gates/latest`; browser back/forward restores selection from URL).

### Task 2E.4: The 17 gate views

One file per gate under `components/Cpm/evidence/views/` (each ≤ 300 lines; shared primitives in `views/primitives/` — `IntervalLane`, `MaskedLine`, `Markers`, `ScatterTrajectory`, `SpectrumChart`, `LagChart`, `PhaseOverlay`, `PolygonChart`, `TimelineTable`). Each view consumes only its artifacts (2C.1 names) and implements the workbook's "Required views / Axes / Interaction / Guard" rows:

- `G0DataQualification.tsx` — per-role ribbons, gap/age trend (separate axis), interval histogram, accepted/rejected masks; brush → highlights exact original points.
- `G1ModeAuthority.tsx` — mode/tracking/selector/authority lanes + `op_requested` vs `u_applied` (pp lane); click transfer → vendor mapping + command-path revision.
- `G2SpEvents.tsx` — SP/PV shared EU pane, `d_sp_dt` pane, event markers, threshold line; select event → opens G12 with the **same support**.
- `G2rOperatingRegion.tsx` — PV vs `u_applied` trajectory with region bounds; in/out lane; select out-of-domain interval → reason.
- `G3ObjectiveError.tsx` — error + band, cumulative IAE/ISE/ITAE panes (separate units), eligible duration, benchmark switch (server-provided alternatives, no browser recompute).
- `G4ControlActivity.tsx` — OP/VP pp pane + PV pane, reversal markers, cumulative variations, normalised σ comparison only when metadata valid; reversal → G10 link.
- `G5Oscillation.tsx` — preprocessed signal, ACF vs lag (s), crossings/cycle markers, period distribution; click ACF peak → highlights cycles.
- `G6Spectrum.tsx` — PSD/amplitude per `ordinate_kind`, band/fundamental/harmonics, resolution + bandwidth shown; peak → G5/G7 link.
- `G7WaveformFits.tsx` — accepted-cycle overlays in phase coordinates with sine/triangle predictions, per-cycle SSE table incl. rejected + reason.
- `G8LagStructure.tsx` — `phi_positive`/`phi_negative` vs lag, odd/even contributions, method id shown, counterexample annotation; bicoherence panel only if artifact present, else `UNSUPPORTED_METHOD`.
- `G9CycleGeometry.tsx` — ordered trajectory with arrows/start-end, polygon/bbox/corners, gate ladder, rejected cycles.
- `G10Actuator.tsx` — requested/applied/VP pp, active-limit bands, tracking error, dwell episodes, demand–travel trajectory, pressures if mapped.
- `G11Measurement.tsx` — PV/ΔPV/noise band, freeze/spike intervals, F/C/S/M lanes (`HealthLane`), source availability, impact, eligibility; click status → `TransmitterHealthPanel`.
- `G12Response.tsx` — see 2E.5 (`ResponseWorkspace`).
- `G13Interaction.tsx` — see 2F.
- `G14Confirmation.tsx` — demand/VP + diagnostics over the qualifying interval, evidence table (positive ids, contradictions, test/review records), support-vs-contradiction timeline; **no numeric certainty curve**.
- `G15Decision.tsx` — observations/hypotheses/severity, evidence-group contributions **only in the form fusion actually uses** (argmax → ranked list, not a waterfall), condition/availability/case timelines, revision history with supersession links.
- Test: one vitest per view rendering from a fixture manifest (`src/components/Cpm/evidence/__fixtures__/*.json`) asserting: axis units, no `connectNulls`, unavailable artifact → `GateResultState` not an empty chart (NR-034), band meaning label (NR-035).

### Task 2E.5: `ResponseWorkspace` (G12 UI) and models

**Files:**
- Create: `components/Cpm/response/ResponseWorkspace.tsx` (route `/cpm/response?loop=&event=`), `response/EventList.tsx` (incl. rejected/censored with reasons; cursor paging), `response/ResponseChart.tsx` (input/PV/SP/VP panes, fitted + holdout predicted, prediction vs confidence bands **labelled**, t10/t50/t63/t90 & settling markers, health exclusions shaded), `response/ResidualPanel.tsx` (residuals + residual ACF), `response/CandidateModelsTable.tsx` (delay-objective curve, parameter intervals, rejection reasons), `response/BodePanel.tsx` (only when `bode` artifact valid; margins with "model-domain estimate" caption), `response/ModelHistory.tsx` (parameter points as **interval markers**, no connecting line), `response/ModelReviewDialog.tsx` (`POST /models/{id}/review`, perm-gated), `response/useResponse.ts`, `api/cpm/response.ts`
- Nav: "System Response" under Loop Performance.
- Test: `ResponseChart.test.tsx` (bands labelled; integrating fixture shows `process_gain` as "not applicable (integrating)" not 0), `ModelHistory.test.tsx` (no line series).

## Subphase 2F — G13 aligned interaction analysis (R09; NR-028)

### Task 2F.1: Engine + artifacts + view

**Files:**
- Create: `cplm/engine/InteractionMath.java` (for each configured peer binding (`G13.peer_binding_ids`, max `G13.max_peers`): align on the loop's accepted support (`min_compatible_support_s`), cross-correlation over `±lag_max_s`, magnitude-squared coherence via Welch (reuse 2C.1 PSD code), `support_mask`; output `alternative_explanations[]`; when a peer has no samples → `UNAVAILABLE reason PEER_UNOBSERVED` — **link existence alone yields no verdict**), long job wires peer sample side-input (peers' tuple v2 keyed by their loop id, joined by a `loop_link` broadcast), artifacts `peer_ids, relationship_revision, aligned_series, cross_correlation, coherence, frequency_hz, lag_s, support_mask, alternative_explanations`
- Modify: `CplmGateFusionEngine` G13 status from analysis (`INTERACTION_DETECTED|NO_INTERACTION|UNAVAILABLE`), the disturbance soft-block only on `INTERACTION_DETECTED`.
- UI: `views/G13Interaction.tsx` (aligned peer panes sharing time, candidate relationship graph (d3 force, tokens), pairwise lag/coherence chart, propagation timeline; "graph relation ≠ proof" caption).
- Test: `InteractionMathTest` (lagged copy peer → lag recovered, coherence ≈ 1 in band; unrelated noise → low coherence; missing peer → UNAVAILABLE), fusion test NR-028.

## Subphase 2G — Loop model dimensions and acquisition contract (R05, R25; NR-016, NR-019)

### Task 2G.1: Registry schema + API + wizard

**Files:**
- Create: `database/scripts/57_cpm_loop_model_dimensions.sql`:
```sql
\c traverse_cplm
ALTER TABLE cpm.loop_registry
  ADD COLUMN IF NOT EXISTS service_family text CHECK (service_family IN ('FLOW','PRESSURE_LIQUID','PRESSURE_GAS','PRESSURE_VAPOUR','LEVEL','TEMPERATURE','COMPOSITION_ANALYZER','PH_CONDUCTIVITY','SPEED_POSITION_POWER','CASCADE','SPLIT_RANGE_OVERRIDE_RATIO','UNKNOWN_UNSTABLE_INVERSE_MIMO')),
  ADD COLUMN IF NOT EXISTS dynamic_class text CHECK (dynamic_class IN ('FAST_SELF_REG','SLOW_SELF_REG','INTEGRATING','INTEGRATING_LAG','UNDERDAMPED','UNKNOWN')),
  ADD COLUMN IF NOT EXISTS objective_type text CHECK (objective_type IN ('TIGHT','AVERAGING','RATIO','CONSTRAINT','RAMP','BATCH','QUALITY','SUPERVISORY','UNSET')) DEFAULT 'UNSET',
  ADD COLUMN IF NOT EXISTS topology text CHECK (topology IN ('SINGLE','CASCADE_MASTER','CASCADE_SLAVE','SPLIT_RANGE','OVERRIDE','RATIO','FEEDFORWARD','UNKNOWN')) DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS command_path text CHECK (command_path IN ('OP_TO_VALVE','OP_TO_VFD','OP_TO_SLAVE_SP','UNKNOWN')) DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS acquisition jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {mode: PERIODIC|RBE|SAMPLE_HOLD, grid_seconds, source_filter_s, timestamp_quantization_ms, declared_scan_s}
  ADD COLUMN IF NOT EXISTS classification_source text NOT NULL DEFAULT 'PRESET_FROM_LOOP_TYPE';
```
- Modify: `Services/CpmLoopRegistryService.cs` (split first: `Services/Registry/LoopRegistryWriter.cs`, `LoopRegistryBroadcast.cs`, `LoopRegistryEvidence.cs` each ≤ 400 lines) — activation accepts the new fields; when absent, derive from `loop_type` **and stamp `classification_source='PRESET_FROM_LOOP_TYPE'`**; explicit values set `EXPLICIT` and are never overwritten by presets; broadcast the dimensions to Flink (`cplm.loop.model` attribute); `GET /registry-contract` lists enums.
- Flink: profile resolution keys on `dynamic_class`/`objective_type` when EXPLICIT (falls back to `loop_type` pack); `MethodEligibility.java` computes bandwidth eligibility from `acquisition.grid_seconds` vs `G5.period_min_s`/`min_samples_per_period` and G12 `delay_min_s` → `LIMITED reason BANDWIDTH` surfaced on G5/G6/G12 (NR-016), and RBE sources set `hold_kind=RBE_HOLD` in G0 artifacts (NR-019).
- UI: `AddLoopWizard.tsx` (split: `registry/wizard/ClassificationStep.tsx` with the five explicit selects + preset suggestion + "explicit overrides preset" note), `registryShared.ts` `dynamicClassOf` deleted (server value), `LoopRegistry` shows classification source.
- Test: `RegistryDimensionsTests.cs` (explicit LIC self-regulating stays after re-activation with preset LIC), Flink `MethodEligibilityTest` (5 s grid, 10 s period → LIMITED), vitest `ClassificationStep.test.tsx`.

### Task 2G.2: Slice-2 E2E and tracker

**Files:**
- Create: `scripts/test-cpm-v25-slice2-e2e.ps1` (simulator `process_value_sim.py` gains `--scenario servo-step|input-test|integrating-step|interrupted-step`; steps: response event COMPLETE within capture bounds; `/response-events` lists censored second step; `/method-runs/{id}/evidence` COMPLETE with chunk sha verified by the script; G5 ACF artifact length > 0; G6 `ordinate_kind=PSD`; workbench URL opens from heatmap cell (Playwright optional — else assert the `methodRunId` is in the heatmap payload); G13 UNAVAILABLE for unmapped peer).
- `changes_tracker.md` `## CHG-027 ✅ Slice 2 — G12 system response, evidence workbench, G13, loop model`.

# Phase 3 — Governed runtime configuration (spec Slice 3; R16, R17, R18; NR-046…NR-055)

Exit criteria: 165-property typed catalogue served from the build; deterministic resolved bundle (factory → site → one profile → loop → one regime) with content hash; draft → validate → shadow → approve → prepare (worker ACKs from every required CPLM task) → active-verified → rollback lifecycle enforced server-side with scoped permissions; Flink consumes only complete immutable bundles pinned on every result; the static `SPINE` map and swallowed parse failures are gone; window/estimator changes classified and rejected unless within deployed capacity; `GateConfigurationWorkspace` UI. Lab E2E `scripts/test-cpm-v25-slice3-e2e.ps1` green.

## Subphase 3A — Catalogue, change classes, capability manifest (R16, R18)

### Task 3A.1: Property catalogue as code (single source for API, Flink, UI)

**Files:**
- Create: `contracts/gate-config/v1/property-catalogue.json` (generated **once** from `docs/next-release/spec/xlsx_Gate_properties.tsv` by `scripts/gen-property-catalogue.py`; each entry `{id:"CFG-001", gate:"G0", property:"G0.mode", type:"enum|number|integer|boolean|string_array", unit, default (null = "Commissioning required"), validation (enum list | {minimum,maximum} | array schema), change_class:"POLICY|STATE_BOUNDARY|DEPLOYMENT", consumer:"flink:short|flink:long|flink:fusion|flink:response|flink:condition|api|ui", dependencies:[…]}`), `contracts/gate-config/v1/execution-plan.schema.json` (horizon ids, duration/slide seconds, per-gate horizon assignment, trigger ∈ `WINDOW|CONDITION_AND_WINDOW|EVENT|EVIDENCE_UPDATE`, required qualification, capacity identity), `contracts/gate-config/v1/bundle.schema.json` (`bundle_id, version, hash, scope{tenant,site,profile_id?,loop_id?,regime_id?}, parent_hashes[], requires{method_versions, schema_version, build_capability}, change_class, effective_from, approvals[], constraints, layers[], resolved{properties, execution_plan}`)
- Create: `src/services/cplm-api/Config/PropertyCatalogue.cs` (loads the JSON from the assembly as an embedded resource; typed accessors; **dependency graph** for class promotion), `src/flink/src/main/java/com/ams/flink/cplm/config/PropertyCatalogue.java` (same JSON as a classpath resource), `src/frontend-ob/src/api/cpm/config.ts` (types generated from the JSON by `scripts/gen-config-types.ts` at build)
- Modify: `scripts/build-flink-jar.ps1` and the three consumers' build steps copy `contracts/gate-config/v1/*` in (Dockerfiles `COPY contracts/gate-config …`).
- Test: `PropertyCatalogueTests.cs` (165 ids unique; every gate id appears; every property has a consumer; dependency cycles rejected), Java `PropertyCatalogueTest` (same JSON → same count; catalogue hash equals the API's — shared `catalogue_hash` constant compared in `/capabilities`).

### Task 3A.2: Capability manifest v1 (deployed build truth)

**Files:**
- Modify: `CapabilityManifest.cs` / `/capabilities` (+ `config: {catalogue_hash, readable_property_ids[] (from the **Flink ACK of the running jobs**, not the JSON), supported_role_mode_combinations, execution_plan_capacity {max_retention_s, supported_slides[], max_active_horizons, scheduler_mode:"FIXED_COMPILED"}, schemas, artifact_kinds[]}`), Flink jobs publish a `CAPABILITY` record on startup to `traverse.cpa.context.gate-config.acks.v1` listing the property ids each job actually reads (`PropertyReaders.java` — a registry every operator registers against; an accepted property with no reader is a **release defect** and a test fails, NR-046).
- Test: `CapabilityCoverageTest.java` — for every catalogue property whose consumer starts with `flink:`, some operator registered a reader, or the property is explicitly listed in `contracts/gate-config/v1/unsupported-in-build.json` with a reason.

## Subphase 3B — Configuration store and lifecycle API (R16, R17)

### Task 3B.1: Schema

**Files:**
- Create: `database/scripts/58_cpm_config_governance.sql` (+ mirrors):
```sql
\c traverse_cplm
CREATE TABLE IF NOT EXISTS cpm.gate_config_bundle (
  bundle_id uuid PRIMARY KEY, version int NOT NULL, content_hash text NOT NULL,       -- SHA-256 of canonical JSON (RFC 8785)
  tenant_id text NOT NULL DEFAULT 'default', site text NOT NULL, scope_kind text NOT NULL CHECK (scope_kind IN ('SITE','PROFILE','LOOP','REGIME')),
  scope_ref text, parent_bundle_id uuid, parent_hash text, catalogue_hash text NOT NULL, execution_plan_hash text NOT NULL,
  change_class text NOT NULL CHECK (change_class IN ('POLICY','STATE_BOUNDARY','DEPLOYMENT')),
  state text NOT NULL CHECK (state IN ('DRAFT','VALIDATED','SHADOW_EVALUATED','APPROVED','SCHEDULED','PREPARED','ACTIVE_VERIFIED','REJECTED','EXPIRED','PARTIALLY_ACKNOWLEDGED','ACTIVATION_FAILED','ROLLED_BACK','SUPERSEDED')),
  layers jsonb NOT NULL, resolved jsonb NOT NULL, validation jsonb, shadow jsonb, effective_from timestamptz,
  created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), etag text NOT NULL,
  UNIQUE (site, scope_kind, scope_ref, version));
CREATE TABLE IF NOT EXISTS cpm.gate_config_layer (
  layer_id uuid PRIMARY KEY, bundle_id uuid NOT NULL REFERENCES cpm.gate_config_bundle(bundle_id),
  layer_kind text NOT NULL CHECK (layer_kind IN ('FACTORY','SITE','PROFILE','LOOP','REGIME')), layer_ref text, content jsonb NOT NULL, content_hash text NOT NULL, ordinal int NOT NULL);
CREATE TABLE IF NOT EXISTS cpm.config_approval (
  approval_id uuid PRIMARY KEY, bundle_id uuid NOT NULL REFERENCES cpm.gate_config_bundle(bundle_id), content_hash text NOT NULL,
  approver text NOT NULL, role text NOT NULL, decision text NOT NULL CHECK (decision IN ('APPROVED','REJECTED')), note text, expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS cpm.config_deployment (
  deployment_id uuid PRIMARY KEY, bundle_id uuid NOT NULL REFERENCES cpm.gate_config_bundle(bundle_id), content_hash text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('ACTIVATE','ROLLBACK')), rollback_of uuid, scheduled_for timestamptz, topology_generation text,
  required_members jsonb NOT NULL, state text NOT NULL, probe_results jsonb, epoch int, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS cpm.config_worker_ack (
  deployment_id uuid NOT NULL REFERENCES cpm.config_deployment(deployment_id), job_name text NOT NULL, subtask_index int NOT NULL,
  phase text NOT NULL CHECK (phase IN ('PREPARE','APPLY')), status text NOT NULL CHECK (status IN ('ACK','NACK')), bundle_hash text NOT NULL,
  jar_sha256 text NOT NULL, source_commit text, topology_generation text, reason text, received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deployment_id, job_name, subtask_index, phase));
CREATE TABLE IF NOT EXISTS cpm.config_active (site text NOT NULL, scope_kind text NOT NULL, scope_ref text, bundle_id uuid NOT NULL, content_hash text NOT NULL, since timestamptz NOT NULL, PRIMARY KEY (site, scope_kind, scope_ref));
```
- Test: `SchemaV25Tests` extended.

### Task 3B.2: Deterministic merge + canonical hash (pure library)

**Files:**
- Create: `src/services/cplm-api/Config/CanonicalJson.cs` (RFC 8785 JSON Canonicalization Scheme: sorted keys, no whitespace, number formatting per ECMAScript; SHA-256), `Config/EffectiveConfigResolver.cs` (order FACTORY → SITE → exactly one PROFILE → LOOP → exactly one REGIME; deep merge typed objects, arrays replace whole, absent inherits, `RESET_TO_INHERITED` removes the layer override, explicit `null` only where schema allows; ambiguous profiles/regimes → `ValidationError PROFILE_AMBIGUOUS`; missing required objective stays unset → property `NO_OBJECTIVE`), `Config/ChangeClassifier.cs` (effective class = max over edited properties, promoted through the catalogue dependency graph), `Config/BundleValidator.cs` (finite typed values; fraction vs percent unit guard; bounds; forbidden combinations (G9 role cannot be PRIMARY; G8 method cannot be renamed to a spectral estimator; model family only within validated domain per `service_family`/`dynamic_class`); execution plan: unique horizons/gates, positive durations, supported slide ratios, all 17 gates once, qualification coverage, no dependency cycles, retention/memory vs **capability manifest** → `DEPLOYMENT_REQUIRED`; unknown fields → rejected naming the field)
- Test: `CanonicalJsonTests` (RFC 8785 vectors), `EffectiveConfigResolverTests` (NR-047 partial override keeps unrelated commissioned values; two loops' overrides never leak; same layers → same hash on repeated resolution; RESET semantics; explicit null rejected where not allowed), `ChangeClassifierTests` (threshold used by an event detector promotes to STATE_BOUNDARY), `BundleValidatorTests` (NR-049 NaN/Inf/inverted limits/absent objective/impossible period; NR-050 integrity-bypass attempts rejected; NR-055 unsupported scheduler mode → DEPLOYMENT_REQUIRED; NR-048 unknown field named in the error).

### Task 3B.3: Lifecycle endpoints

**Files:**
- Create: `Controllers/CpmConfigurationController.cs` (`GET /configuration/effective?loopId&at&regime` perm `cpm.config.read` → resolved bundle, source layers, **actual worker versions from `config_worker_ack`**; `POST /configuration/drafts` perm `cpm.config.draft` (parent version + scope; Idempotency-Key); `PATCH /configuration/drafts/{id}` (If-Match etag; requested changes only; `{"op":"set"|"reset", "property":"G12.noise_multiplier", "value":5}`; 409 stale); `POST …/validate` perm `cpm.config.validate` (→ VALIDATED or REJECTED with per-field reasons); `POST …/shadow` perm `cpm.config.shadow` (creates an `analysis_run(purpose=SHADOW)` over a configurable retained interval through `CplmHistoricalReplayJob --bundle <hash>`; stores before/after gate matrix diff in `shadow`; **no operational outputs**); `POST …/approve` perm `cpm.config.approve` (independent reviewer ≠ author; fleet-wide or objective/test-permission changes additionally require role `ControlAuthority` claim — self-approval 403; approval bound to `content_hash`, expires)), `Controllers/CpmConfigDeploymentsController.cs` (`POST /configuration/deployments` perm `cpm.config.activate` (APPROVED + not expired → SCHEDULED → PREPARE broadcast), `GET /configuration/deployments/{id}` (required membership, ACK matrix, state, probes), `POST …/{id}/rollback` perm `cpm.config.rollback` (new deployment of the previous ACTIVE bundle; history retained)), `Services/ConfigDeploymentService.cs` (state machine; PREPARE → all required members ACK with matching `bundle_hash` + `jar_sha256` + `topology_generation` → PREPARED → APPLY broadcast at `effective_from` (event-time selection) → APPLY ACKs → **probe**: wait for N pinned results carrying `bundle_hash` on `method_run` → ACTIVE_VERIFIED; any NACK → ACTIVATION_FAILED + `CONFIG_REJECTED` audit; partial → PARTIALLY_ACKNOWLEDGED, composite results from mixed bundles quarantined (`method_run.result->>'quarantine'`)), `BackgroundServices/CplmConfigAckConsumerService.cs` (group `traverse-cpa-cplm-config-acks`), producer to `traverse.cpa.context.gate-config.v1` (keyed `bundle_id`, full immutable bundle, signed with the service key HMAC — `X-Service-Key` secret — so Flink can verify origin)
- Perms: the seven `cpm.config.*` + roles in `59_cpm_v25_permissions.sql` (Engineer: read/draft/validate/shadow; Supervisor: approve; Admin: activate/rollback — configurable by ops).
- Audit: every transition through `ICplmAuditEmitter`.
- Test: `ConfigLifecycleTests.cs` (full happy path with a fake ACK feed; self-approval 403; expired approval → 409; NR-051 mixed jar hash ACK → not ACTIVE_VERIFIED; NR-054 rollback creates new deployment and old results untouched; POLICY_RECLASSIFICATION recorded when a shadow diff removes symptoms).

## Subphase 3C — Flink bundle consumption and ACK protocol (R17; NR-052, NR-053)

### Task 3C.1: Remove `SPINE`; operator-owned versioned bundle state

**Files:**
- Create: `cplm/config/GateConfigBundle.java` (immutable, parsed from the bundle JSON; `hash`, `resolvedProperties`, `executionPlan`; typed getters through `PropertyCatalogue`), `cplm/config/BundleBroadcastFunction.java` (broadcast state keyed `scope → bundle` per site/profile/loop/regime; on PREPARE: validate capability/scope/bounds/dependency coverage locally → ACK/NACK record `{deployment_id, job_name, subtask_index, phase, status, bundle_hash, jar_sha256, source_commit, topology_generation (= job id + parallelism + restore checkpoint id), reason}` to `traverse.cpa.context.gate-config.acks.v1`; on APPLY: promote to active for `effective_from` (event-time; windows whose `window_end ≥ effective_from` use the new bundle, older keep the old — never mixed within one result); signature verified with the shared HMAC key or NACK `UNSIGNED`), `cplm/config/EffectiveBundleSelector.java` (`select(loopKey, decisionTimeMs)` → exactly one bundle; G12 pins at event start; STATE_BOUNDARY bundles allocate a new `epoch` → keyed state for that operator is cleared and warm-up begins; results during warm-up carry `evaluation_state=WAITING reason WARMUP`), `cplm/config/PropertyReaders.java` (3A.2)
- Modify: `CplmDynamicsParameterSetSupport.java` (delete `SPINE` static map `:39`, `applyParameterSetJson` catch-ignore `:64-66`, `parseProfileJson` null return `:281`, `applyEngineering` `:135`; parse failures → side output `traverse.cpa.clpm.config.rejected.v1`? **No new topic** — emit a NACK record with `reason=PARSE_ERROR` to the acks topic + a Flink counter metric `cplm_config_rejected`), `CplmParameterSetBroadcastSupport.java` (legacy `ams.metadata.updates` path kept for bindings/evidence/model attributes only; profile values come from the bundle), `CplmLoopDynamicsProfile.java` (`fromBundle(GateConfigBundle, loopKey)`; YAML packs become the **FACTORY layer** content, exported once into `contracts/gate-config/v1/factory-layer.json` by a test so the two cannot drift), all jobs stamp `bundle_hash` + `context_revision` on every result/method_run (1G).
- Test: `BundleBroadcastFunctionTest` (harness: PREPARE with unknown property → NACK naming it; APPLY at T → window ending before T uses old hash, after uses new; two loops' overrides isolated; restore from a savepoint reproduces the same effective hash — NR-052), `EffectiveBundleSelectorTest` (NR-053 STATE_BOUNDARY → new epoch, WAITING results, no mixed-event state), `FactoryLayerParityTest` (YAML ≡ factory-layer.json).

### Task 3C.2: Bounded scheduler capacity check (not a dynamic scheduler)

The deployed build keeps the compiled horizons (`short_1m…60m`, `long_4h/12h/24h`, EVENT for G12, CONDITION_AND_WINDOW for G10/G11, EVIDENCE_UPDATE for G13–G15). This release implements **capacity declaration + validation only**; an execution plan asking for anything else is `DEPLOYMENT_REQUIRED`. (Spec §5.2 allows "offer only the currently installed fixed horizons"; a bounded keyed scheduler is explicitly a later deployment.)

**Files:**
- Create: `cplm/config/ExecutionPlanCapacity.java` (declares the compiled plan; `validate(plan)` → ok | DEPLOYMENT_REQUIRED reasons), exported into the CAPABILITY record (3A.2); `contracts/gate-config/v1/execution-plan.installed.json` generated by a test from the Java declaration (parity).
- Test: `ExecutionPlanCapacityTest` (workbook illustrative plan validates; a `long_30h` horizon → DEPLOYMENT_REQUIRED; a six-hour period request on G5 with `period_max_s=21600` and 5 cycles → `G5 UNSUPPORTED_CAPACITY` reason referencing 24h retention — spec §6.3).

## Subphase 3D — UI: `GateConfigurationWorkspace` (spec §5.7)

### Task 3D.1: Workspace, property form, effective drawer, deployments

**Files:**
- Create: `components/Cpm/config/GateConfigurationWorkspace.tsx` (route `/cpm/config`; navigation scope → loop/profile/regime → gate → properties → effective values → diff/impact → shadow comparison → review/activation), `config/PropertyForm.tsx` (per property: definition, unit, effective value, inherited value + source layer, default status ("Commissioning required" prominent), bounds, installed method version, change class chip, dependencies, affected loops, validation result; typed inputs from the catalogue; arrays replaced atomically; `RESET_TO_INHERITED` action; read-only/locked properties show the reason), `config/EffectiveConfigDrawer.tsx` (linked from `LoopRegistry` and from every gate result in the workbench — **read-only, shows what was used** (`method_run.bundle_hash`), never today's editor values), `config/DiffImpactPanel.tsx`, `config/ShadowComparison.tsx` (before/after gate matrix from the shadow run), `config/ApprovalPanel.tsx`, `config/DeploymentStatus.tsx` (states: pending validation, rejected field, profile conflict, shadow incomplete, approval expired, scheduled, warmup, partially acknowledged, active verified, rollback in progress, failed; **actual active bundle per job** from the ACK matrix; bulk change affected-loop preview + phased rollout with stop criteria configured before activation), `config/useConfig.ts`, `api/cpm/config.ts`
- Modify: `CpmGovernance.tsx` (approvals queue now real: pending approvals list + link; remove "DG-8" empty state), `App.tsx` route + nav "Gate Configuration" (perm `cpm.config.read`), `MethodTracePanel.tsx` (link to `EffectiveConfigDrawer` for the run's bundle)
- Test: vitest `PropertyForm.test.tsx` (fraction input rejects `50` for a `fraction` unit, accepts `0.5`; array replace; reset), `DeploymentStatus.test.tsx` (partial ACK never shows "active").

### Task 3D.2: Slice-3 E2E and tracker

**Files:**
- Create: `scripts/test-cpm-v25-slice3-e2e.ps1` (draft → set `G4.activity_warn_ratio` → validate → shadow (bounded run) → approve (second user) → deploy → poll `/configuration/deployments/{id}` until ACTIVE_VERIFIED (all running CPLM jobs ACKed, probe method_run carries the hash) → change reflected in the next short window's G4 status → rollback → previous hash active; negative: unknown field 422 naming it; self-approval 403; `long_30h` plan → DEPLOYMENT_REQUIRED).
- `changes_tracker.md` `## CHG-028 ✅ Slice 3 — governed gate configuration`.

---

# Phase 4 — Release engineering v2.5 (build, verify, package, runbook)

Exit criteria: `release-out/v2.5-<date>/` produced by `build-release.py` with every updated image, the JAR, ops SQL, SHA256SUMS and `VM-STEPS.md`; `migration/V2.5-DEPLOY.md`; `changes_tracker.md` "Release v2.5 — what to build and run" section; all test suites and the three slice E2E scripts green on the lab stack from a clean tree; latency and load numbers measured and recorded (R21, NR-061).

### Task 4.1: Manifest, ops files, runbook

**Files:**
- Create: `migration/deploy/releases/v2.5.txt`:
```
# Release v2.5 — spec v6: qualification, G12 system response, evidence workbench, NE107 health, governed config.
# Consumed by: python migration/deploy/build-release.py --release v2.5
# Schema: ADDITIVE (new tables + columns), applied online BEFORE the cplm-api image swap:
#   ops/cpm-07-v25-schema.sql        (53–58 merged, idempotent, no locks on hot tables beyond ADD COLUMN … DEFAULT)
#   ops/cpm-08-v25-permissions.sql   (traverse_auth: new cpm.* keys + role grants)
#   ops/cpm-09-v25-kafka-topics.txt  (7 new topics appended to migration/kafka/topics.txt; create with 04 under ALLOW_CREATE_PREFIXED_TOPICS=yes;
#                                     traverse.cpa.loop.samples.v1 and traverse.cpa.clpm.gate.results.v1 are UNCHANGED — additive JSON only)
# Flink: JAR rebuilt; the three CPLM jobs are CANCELLED AND RESUBMITTED (CHG-008), and three NEW jobs submitted
#   (Condition, Instrument Context, Response) — 04b/JOBS.md updated. Live RBE job resubmitted (quality/ts change).
# Config: each MQTT_LOOP_SAMPLES data source needs quality_protocol set (set-quality-protocol.py); one INSTRUMENTAL_HEALTH
#   data source per Instrumental publisher (none until Instrumental ships its publisher — NOT_CONFIGURED until then).
traverse-ingestion-service
cplm-api
historian-bff
ams-frontend
gateway
```
  (`gateway` only if the route map needs `/api/v1/cpm/evidence` size/timeout tuning — verify in 4.2; drop the line if unchanged.)
- Modify: `migration/deploy/build-release.py:51-63` `OPS_FILES` (+ `cpm-07-v25-schema.sql`, `cpm-08-v25-permissions.sql`, `cpm-09-v25-kafka-topics.txt`, `set-quality-protocol.py`), `vm_steps` (+ steps: apply 07/08 before swap, create topics, cancel+resubmit 4 jobs, submit 3 new jobs, post-checks: `/capabilities` shows new jar sha; `/gate-catalogue` 17; consumer groups each 1 member (`traverse-cpa-cplm-results`, `…-frames`, `…-evidence`, `…-response`, `…-conditions`, `…-health`, `…-config-acks`)), `scripts/cpm-07-v25-schema.sql` (concatenation of `database/scripts/53…58` minus `\c`), `scripts/cpm-08-v25-permissions.sql` (= `59_cpm_v25_permissions.sql` minus `\c`), `scripts/set-quality-protocol.py` (like `set-mode-map.py`: dry-run/apply against `/api/ingestion/data-sources`), `migration/kafka/topics.txt` (7 new lines), `migration/flink/JOBS.md`, `migration/04b-submit-flink-jobs.sh`, `migration/schema/03-traverse_cplm.sql` (full mirror), `migration/UPDATE-RUNBOOK.md` (new jobs), `migration/V2.5-DEPLOY.md` (A: config first — quality protocol; B: build box; C: VM in order; D: post-deploy proof; rollback = previous images + `docker load` of the v2.4 bundle; the schema is additive so no down-migration, documented)
- Test: `python migration/deploy/build-release.py --release v2.5 --dry-run` prints the plan with every ops file present.

### Task 4.2: Full verification run on a clean tree

- [ ] `git status --short` empty.
- [ ] `mvn -f src/flink/pom.xml test` → all green (record count).
- [ ] `dotnet test tests/ingestion-service.Tests`, `tests/cplm-api.Tests`, `tests/binding-resolver.Tests`, `tests/historian-bff.Tests` → green (record counts).
- [ ] `cd src/frontend-ob; npm test; npm run lint; npm run build` → green/clean.
- [ ] `pytest scripts/sim` → green.
- [ ] `.\run-all.ps1` (full rebuild), then `scripts/test-ot-loop-ingestion-e2e.ps1` (24/24), `scripts/test-cpm-v25-slice1-e2e.ps1`, `-slice2-`, `-slice3-` → all PASS; `scripts/verify-ot-loop-flow.ps1` 10/10.
- [ ] Reliability scenarios (NR-057/058 + spec §6.8) scripted in `scripts/test-cpm-v25-reliability.ps1`: kill cplm-api mid-batch → no lost/duplicate method_run; Flink job restart from checkpoint → same bundle hash on next result; Kafka duplicate delivery of an evidence chunk → idempotent; Postgres down 60 s → consumer resumes without skipping; MQTT sim killed → OFFLINE interval, last status retained.
- [ ] Load/latency (R21, NR-061): `scripts/cpm-v25-load-probe.ps1` runs the simulator at 171 loops × 5 s + 20 % quality-only updates + 5 response events/min for 30 min; records p50/p95/p99 of **source-observation→UI** (tuple `roles.pv.sample_ts_ms` → live metric `emission_ts` → snapshot read) and **tuple→UI** separately, Flink checkpoint duration, consumer lag, evidence chunk rate; results into `docs/next-release/04-load-report.md` with hardware used. No universal claim.
- [ ] Record everything in `docs/next-release/03-acceptance-evidence.md`: table NR-001…NR-062 → test name(s) → commit → result.

### Task 4.3: Build the bundle and finish the tracker

- [ ] `python migration/deploy/build-release.py --release v2.5` → `release-out/v2.5-<date>/` (images, `ams-flink-1.0-SNAPSHOT.jar`, `ops/`, `SHA256SUMS`, `VM-STEPS.md`); `sha256sum -c` clean.
- [ ] `changes_tracker.md`: **Summary** paragraph for the v6 spec set; `## Release v2.5 — what to build and run` with the **updated-services table** (compose service | image | carries CHG-026/027/028), **unchanged and not rebuilt** list (asset-model, binding-resolver, audit-service, sparkplug-edge-node, ams-api, auth, gateway unless 4.1 says otherwise), **scripts to run — build box** (exact commands from 4.2 in order + `build-release.py --release v2.5`), **scripts to run — plant VM** (pointer to `migration/V2.5-DEPLOY.md` §C: `sha256sum -c`, rollback point, `set-quality-protocol.py --apply`, `cpm-07`, `cpm-08`, topics, `docker load` ×N, JAR copy, JM/TM recreate, `deploy.sh --prod`, cancel+resubmit CPLM jobs, submit new jobs, `deploy.sh --prod`), **post-deploy proof**, **config knobs**, and the **Risks** section updated (Instrumental publisher not yet delivered → health NOT_CONFIGURED; retention of v1 gate rows still an ops decision; bounded scheduler not implemented — capacity validation only).
- [ ] Commit `release(v2.5): manifest, ops SQL, runbook, tracker` and tag `v2.5`.

---

## Verification matrix — spec acceptance scenarios → tasks

| NR | Task(s) | NR | Task(s) | NR | Task(s) |
|---|---|---|---|---|---|
| 001–002 | 2A.1, 2A.2, 2A.4 | 003–004 | 2A.4, 2B.1 | 005–006 | 2A.3, 2A.4 |
| 007 | 2A.3 | 008–009 | 2A.2 | 010 | 2A.4 |
| 011–012 | 2A.5 | 013–014 | 2A.4, 2A.5 | 015 | 2A.5 (lifecycle), 3C.1 (context) |
| 016 | 2G.1 | 017 | 2B.1 | 018 | 1D.2 |
| 019 | 1A.1, 2G.1 | 020 | 1A.2 | 021 | 1B.1, 1B.2 |
| 022–023 | 1C.1 | 024–025 | 1D.3 | 026–027 | 1E.1 |
| 028 | 2F.1 | 029–030 | 1F.1 | 031 | 2E.3 |
| 032 | 2C.1, 2E.4 | 033 | 2E.2 | 034–035 | 2E.1, 2E.4, 2E.5 |
| 036–040 | 1H.2, 1H.4 | 041 | 1H.3 | 042–044 | 1H.4 |
| 045 | 1H.4, 1H.5 | 046 | 3A.2 | 047–049 | 3B.2 |
| 050 | 3B.2, 1E.1 | 051 | 3B.3 | 052–053 | 3C.1 |
| 054 | 3B.3 | 055 | 3C.2 | 056–057 | 1G.4, 2B.1 |
| 058 | 1G.3, 4.2 | 059 | 0.1, 4.2 | 060 | 1G.5, 2D.1 |
| 061 | 4.2 | 062 | 2D.1 | | |

Gap register coverage: R01 (2A, 2B), R02 (1E), R03 (1A), R04 (1B), R05 (2G), R06 (1D.2), R07 (1E, 2C), R08 (1D.3), R09 (2F), R10 (1F), R11 (1D.4/1D.5, 2B), R12 (2C, 2E), R13 (2E.3), R14 (2E.2), R15 (1H), R16 (3A, 3B, 3D), R17 (3C), R18 (3A, 3C.2), R19 (1G), R20 (1C), R21 (4.2), R22 (1G.3, 4.2), R23 (0.1, 4.2), R24 (2D.1), R25 (2G), R26 (0.3, 0.4).

## Execution notes

- **Order is the dependency order** (spec §6.7): Phase 0 → 1A/1B/1C → 1D → 1E/1F → 1G → 1H → 2A (pure Java, can start in parallel with 1G/1H) → 2B → 2C → 2D → 2E → 2F → 2G → 3A → 3B → 3C → 3D → 4. Subphases inside a phase that do not share files may run as parallel worktrees (e.g. 1B ∥ 1C, 2A ∥ 1H, 2E ∥ 2F).
- **Each phase is executed from its own detailed plan** written with `superpowers:writing-plans` at execution time into `docs/superpowers/plans/2026-MM-DD-v25-phase-N.md`, expanding every task above into the write-test / run-fail / implement / run-pass / commit steps with full code. This master plan fixes scope, files, interfaces and acceptance; it is the audit of record.
- **Never** "fix" a golden fixture to make a semantic change pass; re-baseline only with a recorded tolerance and reason in `docs/next-release/00-build-truth.md`.
- **Do not** submit `CplmGateStreamJob` (legacy monolith) anywhere; the new jobs are added next to the existing three plus Live RBE.
- **Plant caveats to carry into the runbook:** Instrumental publisher is external; until it exists every loop shows `NOT_CONFIGURED` health and G12 model promotion is limited (health-required prerequisites), which is the spec's intended behaviour, not a defect.

## Self-review (done against the spec with fresh eyes)

- **Spec coverage:** §1 corrections → Phase 1 + 1G; §2 G12 (subgates A–H: A=2A.3/2G.1 eligibility, B=2A.3, C=2A.2, D=2A.4, E=2A.5, F=2A.5 controller/frequency, G=2A.5 validator baseline comparison + 2B.2 models as-of, H=2A.5 SimcAdvisor + 2E.5 action package) ✔; §3 workbench (3.1–3.5) → 2C, 2D, 2E ✔; §4 Instrumental (4.1–4.8) → 1H ✔ (4.7 fleet filters in 1H.6; 4.8 QA scenarios in 1H tests); §5 configuration (5.1–5.8) → Phase 3 ✔ (5.2.1 execution plan → 3A.1/3C.2 with the "installed fixed horizons" option chosen); §6.1–6.3 → 2G ✔; §6.4 map → each row has a task; §6.5 25 API ops → 0.4, 1G.4, 1H.3, 1H.5, 2B.2, 2C.2, 2D.1, 3B.3 (all 25 present); §6.6 migrations → 53–58 + mirrors + ops ✔; §6.7 slices → phases ✔; §6.8 acceptance/observability → 4.2 ✔.
- **Placeholder scan:** no TBD/TODO; every schema, topic, permission, class and route is named; code-level step detail is deferred to the per-phase plans by design (stated in Execution notes).
- **Same-v1 decision (user review):** samples stay on `traverse.cpa.loop.samples.v1` (schema 1.1 additive, readers verified tolerant); results stay in the v1 tables with identity columns added and `bundle_hash` in the unique key; no `method_run` table — `method_run_id` is a per-gate uuid stored on the v1 row (`method_run_ids jsonb`, GIN) and on `response_event`; replay/shadow share the tables and are isolated by `purpose` + `source`. New tables exist only for data with no v1 home (evidence arrays, G12 events/models, health, config).
- **Type consistency:** `method_run_id` (uuid) used identically in 1G, 2B.2, 2C.2, 2D.1, 2E.3; `bundle_hash`/`content_hash` = SHA-256 of RFC 8785 canonical JSON everywhere; `EvidenceArtifact` (1G.2) is the only artifact type (2A.6, 2C.1); `NormalizedQuality` (1B.1) ≡ tuple v2 `quality` values (1A.1); eligibility enum `ELIGIBLE|LIMITED|INELIGIBLE|UNKNOWN|NOT_CONFIGURED` shared by 1H.4 and G12 (2A.6); deployment states in 3B.1 DDL match spec §5.6 list exactly.
