# v2.5 release checklist — CPM/CPA next release (spec v6)

Status board for the work in `docs/superpowers/plans/2026-09-16-v25-next-release-master-plan.md`
(the master plan holds the detail; this page holds the state). Branch `feat/v25-next-release`,
audited base `5cec34ef`. Operational facts (what to run on the plant) live in `changes_tracker.md`.

Legend: ✅ done and committed · 🔄 in progress · ⬜ pending · commit ids are on this branch.

_Last updated: 2026-09-17 01:30 (2D + 2E committed with green suites; 2F next; lab still runs the 2C.1c jar - redeploy pending)._

## Phase 0 — build truth and test baseline ✅

| Task | Status | Commit | Proof |
|---|---|---|---|
| 0.1 Flink test compile restored | ✅ | 5c97c064 | `mvn test` green (2 replay-divergence tests ignored pending 1G.4, now re-enabled by 1G) |
| 0.2 spec package + audit of record + conflicts C01–C07 | ✅ | bca08174 | `docs/next-release/{spec/,01-audit-vs-code.md,conflicts.md,00-build-truth.md}` |
| 0.3 build identity on every Flink result | ✅ | 7bf7f6b2 | `identity/BuildIdentity`, `BuildIdentityTest` |
| 0.4 `GET /capabilities` + 0.5 Governance shows engine builds, `api/cpm` split | ✅ | 441b30a5, 92bca7d7 | `CapabilityManifestTests`; `SOURCE_COMMIT` build arg |

## Phase 1 — qualification and safe semantics ✅ (closed 2026-09-16; see CHG-026)

| Subphase / task | Status | Commit | Proof |
|---|---|---|---|
| 1A.1 samples schema 1.1 `roles{}` (ingestion) | ✅ | bbbbf083 | `LoopTupleRolesTests`, `LoopJoinerTests` |
| 1A.2 Flink codec + 1.0 fallback + topic catalogue | ✅ | 65db8eec | `TupleCodecTest`, golden unchanged |
| 1A.3 additive contract proven on every reader | ✅ | 5852567d | ingestion E2E 25/25 then |
| 1B.1 protocol-specific quality decoder, non-finite → DLQ | ✅ | 4d311cdb | `QualityDecoderTests`, `OtPayloadParserTests` |
| 1B.2 Flink: UNKNOWN ≠ GOOD, G0 says why | ✅ | 5f31502e | `CplmGateEngineQualityTest` |
| 1C.1 RBE quality transitions; source/verified/emission time | ✅ | 7b256208 | `LoopLiveRbeQualityTest`, `liveMetric.test.ts`, `LoopMetricSnapshotTest` |
| 1D.1 `CplmGateEngine` split into `engine/*` | ✅ | 0ff8edc0 | golden byte-identical |
| 1D.2 G2 band policy, G4 profile thresholds | ✅ | 83c4ad57 | `ShortFeatureCalculatorTest` (unit invariance) |
| 1D.3 G10 seconds/declared range, G11 freeze episodes | ✅ | 08ea68a2 | `LimitMathTest`, contract round-trip |
| 1D.4 `CplmConditionStreamJob` (fast G10/G11) | ✅ | 25a8de85 | `ConditionDetectorTest` |
| 1D.5 conditions persisted + fused; 4h fusable | ✅ | 49938db1 | `ConditionConsumerTests`, `FusionConditionsTest` |
| 1E.1 fusion v2: observations / hypotheses / confirmation | ✅ | 49938db1 | `FusionVerdictV2Test` (NR-026/027) |
| 1E.2 fusion v2 served (gates/latest, rankings, Investigation) | ✅ | 1ec96268 | `GateReadSqlTests`, `HypothesisPanel.test.tsx` |
| 1F.1 episodes: availability vs condition | ✅ | 3535c78a | `EventFrameLifecycleTests` |
| 1F.2 Events UI shows both states | ✅ | 3535c78a | `eventsState.test.ts` |
| 1G.1 identity columns, `analysis_run`, evidence tables (53 / 03 / cpm-07 / cpm-07b) | ✅ | 04bdb7d5 | `SchemaV25Tests` (lab), `ResultUpsertTests` |
| 1G.2 `RunIdentity`, `DatasetHash`, evidence chunker/records | ✅ | 04bdb7d5 | `RunIdentityTest`, `DatasetHashTest`, `EvidenceChunkerTest` |
| 1G.3 identity on every result; evidence consumer + blob store; `/method-runs` | ✅ | 04bdb7d5 | `EvidenceAssemblyTests`; E2E identity steps |
| 1G.4 replay isolation by purpose; `POST /analysis-runs`; IoTDB source | ✅ | 04bdb7d5 | E2E step 28 (202 on the lab; 500 → 502 handling) |
| 1G.5 retention sweeper; v2.5 permissions (59 / cpm-08) | ✅ | 04bdb7d5 | `EvidenceRetentionTests` |
| 1H.1 NE107 contract v1 + simulator | ✅ | eb56752c, 547482a5 | pytest 17/17 |
| 1H.2 `InstrumentalHealthSubscriber` → Kafka + DLQ | ✅ | 09d82159 | `InstrumentalHealthTests` 11; suite 212 |
| 1H.3 effective-dated device bindings | ✅ | 4ef64e9a | `InstrumentBindingTests` (lab) |
| 1H.4 `CplmInstrumentContextJob` (device state machine, §4.6 policy) | ✅ | 9df8052e | `DeviceStateMachineTest`, `HealthEligibilityPolicyTest` (17); RUNNING on the lab |
| 1H.5 mirror consumer, `/instrument-health`, G11 health lanes in fusion | ✅ | 06418b2c | `InstrumentHealthReadsTests` (lab), `FusionHealthLanesTest` (5); MQTT → API proven |
| 1H.6 UI panel, health lane, header pill, fleet `?health=` | ✅ | 210d26e9 | `TransmitterHealthPanel.test.tsx` (4), `FleetHealthFilterTests` (5); lint + build clean |
| 1H.7 slice-1 E2E script, freeze publisher, tracker CHG-026, audit disposition, plan tick | ✅ | see git log (1H.7) | slice-1 E2E **18/18** at 15:14 on the redeployed jar (jar e09d6f40; NE107 path, fusion v2 + identity + health lanes, evidence COMPLETE, fleet filters, availability); evidence path proven (COMPLETE manifests from a frozen loop); CHG-026 + audit disposition written |

## Phase 2 — G12 system response, evidence workbench, G13, loop model 🔄 (2A started 2026-09-16)

| Subphase | Tasks | Status |
|---|---|---|
| 2A response kernel (commons-math3) | 2A.1 ✅ f3a91c84 (14) · 2A.2 ✅ 33e167a7 (15) · 2A.3 ✅ fbb2e8df (11) · 2A.4 ✅ ae226715 (10; noise-free spec FOPDT exact, noisy within the fit's own standard errors) · 2A.5 ✅ 1b0c6087 (9) · 2A.6 ✅ 79305f58 (4; all 52 catalogue quantities) | ✅ |
| 2B `CplmResponseAnalysisJob` | 2B.1 ✅ 3599d519 · 2B.2 ✅ 01e8122a · lab fixes ✅ 81baa69c, 14c3cff1, 9bca728c (stale held VP is not the applied input; irregular-grid crossings; capture closes on the settle band measured from the band-entry sample; pre/post slopes; qualified peaks; millisecond event bounds) · lab proof ✅ COMPLETE `INPUT_TEST` events with Kp 3.000, τ 20.00 s, θ 2.7 ± 2.5 s, settle 80.1 s, 12 evidence artifacts; second event **VALIDATED** against the first (validation RMSE 0.36, prediction RMSE 0.23, fit improvement 0.97) | ✅ |
| 2C exact intermediates | 2C.1a ✅ c0e672dd · 2C.1b ✅ dfc75202 (Welch PSD, segment follows the band) · 2C.1c ✅ 19727d1d + f83688d6 (every gate's artifacts with the workbook's field names; policy `--evidence-emit`; lab: short-tier manifests COMPLETE) · 2C.2 ✅ 38f42e73 + 8dd09e33 (method-run resolution across tiers, manifest ETag/304, chunk bytes with sha ETag + immutable, site scope, EVIDENCE_RECONSTRUCTION runs under the original identity) · lab ✅ a7d7b2a7 + 117a9622: identity parity (registry parameter set applied), retention cycle EXPIRED → reconstruct → ATTACHED/COMPLETE, chunk columns decoded | ✅ |
| 2D API breadth | 2D.1 ✅ a5cdf73c (`GET /gate-catalogue`, 17 entries once incl. G2r, capability state per gate) · 2D.2 ✅ 7af35971 (`analytics.investigation_reference` (56), `POST /investigations` pins evidence, explicit outcome WORK_COMPLETED / PERFORMANCE_RESTORED / INCONCLUSIVE - completed work ≠ restored) | ✅ |
| 2E frontend workbench | 2E.1 ✅ 8ec77afb (`CpmChart` one axis per unit, no null bridging, stepped holds, labelled bands; `GateResultState` 9 states; site-zone times; artifact codec with checksum) · 2E.2 ✅ f909830e (historical + replay charts one axis per unit group, replay split ≤ 400 lines, raw slice walked to a budget) · 2E.3 ✅ 5c986106 (`GateEvidenceWorkspace` from an immutable URL selection, never `useLatestGates`; signal context lanes; method trace; launcher passes the clicked cell's `methodRunId`) · 2E.4 ✅ f5f4d20a (17 views on the exact artifacts, pure bodies tested) · 2E.5 ✅ c00629e9 (+ 7854ebb1, c73ef24d writer columns/lists: `ResponseWorkspace` events incl. rejected/censored, fits, labelled prediction band, residuals, candidate models, Bode only when written, model history as interval markers, server-owned review with If-Match) · frontend 93/93, lint + tsc clean · **not yet on the lab** (frontend + jar redeploy pending) | ✅ |
| 2F G13 interaction | 2F.1 `InteractionMath` + fusion + view | ⬜ |
| 2G loop model | 2G.1 registry dimensions (57), acquisition contract, wizard · 2G.2 slice-2 E2E + CHG-027 | ⬜ |

## Phase 3 — governed runtime configuration ⬜

| Subphase | Tasks | Status |
|---|---|---|
| 3A catalogue + change classes | 3A.1 property catalogue as code · 3A.2 capability manifest v1 (worker ACK coverage) | ⬜ |
| 3B store + lifecycle | 3B.1 schema (58) · 3B.2 canonical JSON, resolver, classifier, validator · 3B.3 lifecycle endpoints + deployments + ACK consumer | ⬜ |
| 3C Flink bundles | 3C.1 remove `SPINE`, bundle broadcast + ACK protocol · 3C.2 execution-plan capacity check | ⬜ |
| 3D UI | 3D.1 `GateConfigurationWorkspace` · 3D.2 slice-3 E2E + CHG-028 | ⬜ |

## Phase 4 — release engineering v2.5 ⬜

| Task | Status |
|---|---|
| 4.1 manifest `migration/deploy/releases/v2.5.txt`, ops files (cpm-07/07b/08, topics, `set-quality-protocol.py`), `V2.5-DEPLOY.md`, runbook, mirrors | ⬜ (cpm-07 / cpm-07b / cpm-08 and the topic lists already exist from Phase 1) |
| 4.2 full verification on a clean tree (all suites, three slice E2Es, reliability + load probes, acceptance evidence NR-001…062) | ⬜ |
| 4.3 build the bundle; `changes_tracker.md` "Release v2.5 — what to build and run"; tag `v2.5` | ⬜ |

## Verification status (last runs, lab)

| Suite / script | Result | When |
|---|---|---|
| Flink `mvn test` (Docker Maven, from PowerShell) | 213 run / 0 failures / 2 skipped | 2026-09-16 after 2C.2 |
| cplm-api tests (lab DB, run alone) | 112 / 112 | 2026-09-17 after 2C.2 lab fixes |
| ingestion-service tests | 212 / 212 (health 11) | 2026-09-16 |
| frontend vitest / lint / build | 51 / 51 · clean · OK | 2026-09-16 after 1H.6 |
| simulator pytest | 17 / 17 | 2026-09-16 after 547482a5 |
| `scripts/test-ot-loop-ingestion-e2e.ps1` | **28 / 28** | 2026-09-16 14:45 (corrected jar) |
| `scripts/test-cpm-v25-slice1-e2e.ps1` | 18 / 18 | 2026-09-16 15:14 (jar e09d6f…) |

## Lab state (for whoever picks this up)

- Jar `2a6dd18a…` deployed (2B fixes, 2C.1b, 2C.1c, reconstruction mode); cplm-api image rebuilt with 2C.2; earlier: jar `8bdf0868…` (2B fixes + 2C.1b); all six CPLM jobs RUNNING (Short, Long, Condition, Instrument Context, Fusion, Response); the earlier note follows: jar `e09d6f40…` had all five CPLM jobs RUNNING; fusion verdicts with `health_lanes` written on this jar (POJO fix proven under real records) (Short, Long, Condition, Instrument Context, Fusion). Deploy flow and its
  traps: `docs/next-release/00-build-truth.md` (package first, entry-class check, supervisor log, no duplicate method refs).
- cplm-api image rebuilt with 1H.5/1H.6; `/health` shows consumers `results`, `frames`, `evidence`, `health`, one member each.
- Data sources: `INSTRUMENTAL_HEALTH` "Lab Instrumental NE107 (mosquitto-test)" active; the ingestion E2E's `MQTT_LOOP_SAMPLES`
  config kept active (`-KeepConfig`) for the freeze publisher. PV binding FIC10302 → TT-10302 (instr-prm-1).
- G12 on the lab: `scripts/sim/loop_step_sim.py --loop FIC10302 --scenario input-test --pre-s 180 --post-s 360 --interval 1` yields one COMPLETE event per run (~9 min); run it twice ≥ 90 s apart for a VALIDATED model. FIC10302's tuples carry a stale held VP from an old soak - by design it is ignored (held past 60 s).
- Evidence path: emits only for episode-bearing long windows; `scripts/sim/loop_freeze_sim.py --loop FIC10301` was run 14:29–14:35;
  the first long window carrying it is awaited (then `analytics.evidence_manifest` must show COMPLETE rows).

## Open items and risks carried

- Instrumental's real publisher is external: every plant loop reports `NOT_CONFIGURED` health until it ships (intended).
- Every plant `MQTT_LOOP_SAMPLES` data source needs `quality_protocol` set (`STRING_ENUM`) or its loops read `UNKNOWN` quality (by design); tool ships in Phase 4.
- The branch compiles from 06418b2c onward (the 1G commit carries whole files completed by 1H.5 classes) — stated in both messages.
- Retention of the v1 gate rows stays an ops decision; the sweeper touches evidence only.
- **Release blocker for Phase 4:** bounded replay / reconstruction submissions leak TaskManager metaspace (one user-code classloader per REST submission); the lab TM died of `OutOfMemoryError: Metaspace` on the second submission at 256m. Lab compose now 512m; find the leak or bound submissions per TM lifetime before v2.5 ships.
