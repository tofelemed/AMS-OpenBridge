# v2.5 release checklist — CPM/CPA next release (spec v6)

Status board for the work in `docs/superpowers/plans/2026-09-16-v25-next-release-master-plan.md`
(the master plan holds the detail; this page holds the state). Branch `feat/v25-next-release`,
audited base `5cec34ef`. Operational facts (what to run on the plant) live in `changes_tracker.md`.

Legend: ✅ done and committed · 🔄 in progress · ⬜ pending · commit ids are on this branch.

_Last updated: 2026-09-17 17:45 (audit follow-up: all 22 frontend findings fixed, lab re-audited; Phases 0-3 implemented, committed and lab-proven: slice-1 18/18, slice-2 19/19, slice-3 14/14; Phase 4 started on the user's go at 10:42 ("start phase 4 - build images - i want to test it"): every suite re-run green on the clean tree, the five v2.5 images rebuilt from HEAD and running on the lab, `WHATS-NEW-v2.5.md` written for the user's test tour; the reliability / load probes, the bundle and the tag wait for the user's testing to finish)._

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

## Phase 2 — G12 system response, evidence workbench, G13, loop model ✅ (closed 2026-09-17; CHG-027)

| Subphase | Tasks | Status |
|---|---|---|
| 2A response kernel (commons-math3) | 2A.1 ✅ f3a91c84 (14) · 2A.2 ✅ 33e167a7 (15) · 2A.3 ✅ fbb2e8df (11) · 2A.4 ✅ ae226715 (10; noise-free spec FOPDT exact, noisy within the fit's own standard errors) · 2A.5 ✅ 1b0c6087 (9) · 2A.6 ✅ 79305f58 (4; all 52 catalogue quantities) | ✅ |
| 2B `CplmResponseAnalysisJob` | 2B.1 ✅ 3599d519 · 2B.2 ✅ 01e8122a · lab fixes ✅ 81baa69c, 14c3cff1, 9bca728c (stale held VP is not the applied input; irregular-grid crossings; capture closes on the settle band measured from the band-entry sample; pre/post slopes; qualified peaks; millisecond event bounds) · lab proof ✅ COMPLETE `INPUT_TEST` events with Kp 3.000, τ 20.00 s, θ 2.7 ± 2.5 s, settle 80.1 s, 12 evidence artifacts; second event **VALIDATED** against the first (validation RMSE 0.36, prediction RMSE 0.23, fit improvement 0.97) | ✅ |
| 2C exact intermediates | 2C.1a ✅ c0e672dd · 2C.1b ✅ dfc75202 (Welch PSD, segment follows the band) · 2C.1c ✅ 19727d1d + f83688d6 (every gate's artifacts with the workbook's field names; policy `--evidence-emit`; lab: short-tier manifests COMPLETE) · 2C.2 ✅ 38f42e73 + 8dd09e33 (method-run resolution across tiers, manifest ETag/304, chunk bytes with sha ETag + immutable, site scope, EVIDENCE_RECONSTRUCTION runs under the original identity) · lab ✅ a7d7b2a7 + 117a9622: identity parity (registry parameter set applied), retention cycle EXPIRED → reconstruct → ATTACHED/COMPLETE, chunk columns decoded | ✅ |
| 2D API breadth | 2D.1 ✅ a5cdf73c (`GET /gate-catalogue`, 17 entries once incl. G2r, capability state per gate) · 2D.2 ✅ 7af35971 (`analytics.investigation_reference` (56), `POST /investigations` pins evidence, explicit outcome WORK_COMPLETED / PERFORMANCE_RESTORED / INCONCLUSIVE - completed work ≠ restored) | ✅ |
| 2E frontend workbench | 2E.1 ✅ 8ec77afb (`CpmChart` one axis per unit, no null bridging, stepped holds, labelled bands; `GateResultState` 9 states; site-zone times; artifact codec with checksum) · 2E.2 ✅ f909830e (historical + replay charts one axis per unit group, replay split ≤ 400 lines, raw slice walked to a budget) · 2E.3 ✅ 5c986106 (`GateEvidenceWorkspace` from an immutable URL selection, never `useLatestGates`; signal context lanes; method trace; launcher passes the clicked cell's `methodRunId`) · 2E.4 ✅ f5f4d20a (17 views on the exact artifacts, pure bodies tested) · 2E.5 ✅ c00629e9 (+ 7854ebb1, c73ef24d writer columns/lists: `ResponseWorkspace` events incl. rejected/censored, fits, labelled prediction band, residuals, candidate models, Bode only when written, model history as interval markers, server-owned review with If-Match) · frontend 93/93, lint + tsc clean · **not yet on the lab** (frontend + jar redeploy pending) | ✅ |
| 2F G13 interaction | 2F.1 ✅ 47dfbaa0 (`InteractionMath`: nearest alignment, normalised xcorr with the smallest-lag tie rule, Welch MSC) · a8d6df4e (long-job peer fan-out `CplmPeerFanoutSupport`, `INTERACTION_DETECTED / NO_INTERACTION / UNAVAILABLE`, fusion soft-block only on INTERACTION_DETECTED, legacy rows `LEGACY_FLAG_ONLY`) · 43b83a25 API · 22e56fa5 `G13Interaction` view · ea8ed2c7 **lab finding**: the no-watermark control stream held every long-job timer - watermarks re-assigned after the fan-out (`LongJobTopologyTest` pins it) | ✅ |
| 2G loop model | 2G.1 ✅ 1e7d2b8b (registry split) + 910c5b93 (57: service family / dynamic class / objective / topology / command path / acquisition / classification source; EXPLICIT never overwritten by a preset; `cplm.loop.model` broadcast) + 48695ba8 (Flink `applyLoopModel`, `MethodEligibility` BANDWIDTH on G5/G6/G12) + 52b4d4a6 (API eligibility) + 459bec7e (`ClassificationStep`) · 2G.2 ✅ `scripts/test-cpm-v25-slice2-e2e.ps1` **19/19** on the lab at 04:45 (jar 4ea1da78) after four lab defects were fixed on the way (ea8ed2c7 watermarks, 6bdcfd78 + 95f25b74 G13 identity / eligibility on excluded rows, 770e3315 NR-007 streaming supersede, d0003ba5 fused identity inherits the long tier's bundle); CHG-027 written | ✅ |

## Phase 3 — governed runtime configuration ✅ (implemented and lab-proven 2026-09-17)

| Subphase | Tasks | Status |
|---|---|---|
| 3A catalogue + change classes | 3A.1 ✅ 45a8567f (165 properties generated from the spec sheet into API / jar / UI with one `catalogue_hash`; `gen-property-catalogue.py --check`) · 3A.2 ✅ c62cfe66 (Flink `BundleProfileMapper`, `PropertyReaders`, `CapabilityRecord` announced at every job start, `ExecutionPlanCapacity`; `CapabilityCoverageTest`: 78 declared unsupported with a reason) + 2cc34ed5 (`/capabilities.config` from the RUNNING jobs: readable ids, not-read, mixed jars, catalogue mismatch; lab: 6 workers on one jar, 70 readable) | ✅ |
| 3B store + lifecycle | 3B.1 ✅ 8a0a6084 (58: bundles, layers, approvals, deployments, worker ACKs, active, worker capability) · 3B.2 ✅ 8a0a6084 (RFC 8785 `CanonicalJson`, `EffectiveConfigResolver` FACTORY→SITE→one PROFILE→LOOP→one REGIME, `ChangeClassifier` via dependants, `BundleValidator` NR-047..050/055) · 3B.3 ✅ 9de5eb45 (`ConfigStore`, `ConfigDeploymentService` state machine with ACK + probe windows, `BundleEnvelope` HMAC, `CplmConfigAckConsumerService`, controllers with the `cpm.config.*` permissions, shadow runs through `--bundle-properties-b64`; `ConfigLifecycleTests` 5: happy path, self-approval 403, expiry, NR-051, NR-054) + 1b853e89 (approvals on GET, shadow before/after comparison, deployments list) | ✅ |
| 3C Flink bundles | 3C.1 ✅ b3eb83c6 (`CanonicalJson` = the API's bytes (Python-pinned HMAC), `GateConfigBundle` local validation, `BundleBroadcastHandler` PREPARE/APPLY → ACK/NACK with jar + topology generation, UNSIGNED / NOT_PREPARED / PARSE_ERROR counted, `EffectiveBundleSelector` LOOP>PROFILE>SITE by effective event time, STATE_BOUNDARY epoch + WARMUP `evaluation_state`, static `SPINE` deleted → `Lookup` over the checkpointed broadcast state, bounded jobs via `CplmParameterUpdateReader`, response captures pinned per bundle, replay `--bundle-hash`; `CPLM_GATE_CONFIG_KEY` on the Flink containers; 4 new test classes) · 3C.2 ✅ 96036c50 (`ExecutionPlanCapacityTest`: installed plan == Java declaration; long_30h / moved gate / other scheduler / six-hour G5 period DEPLOYMENT_REQUIRED by name) | ✅ |
| 3D UI | 3D.1 ✅ 1b853e89 (`/cpm/config` workspace: scope → bundle → gate → `PropertyForm` (typed, fraction≠percent, arrays whole, reset, locked with the build's reason), `EffectiveConfigDrawer` (read-only; from the Method Trace names the run's bundle and says when it is no longer active), `DiffImpactPanel`, `ShadowComparison`, `ApprovalPanel`, `DeploymentStatus` (ACK matrix - a partial matrix never reads as active), Governance approvals queue real; tests 6; lint + build clean) · 3D.2 ✅ `scripts/test-cpm-v25-slice3-e2e.ps1` **14/14** on the lab at 02:52 (jar 27544b6f: PREPARE/APPLY ACKs from the five property-reading jobs, ACTIVE_VERIFIED with pinned results, effective config, rollback); five lab findings fixed on the way (observer jobs 80d68b56, change class 80d68b56, edit-time refusal 3de059b8, auth revocation epoch 3e87aea2, G13 identity on excluded rows 6bdcfd78); CHG-028 written | ✅ |

## Phase 4 — release engineering v2.5 🔄 started 2026-09-17 10:42 on the user's go (halted 04:50 → resumed: "start phase 4 - build images - i want to test it")

| Task | Status |
|---|---|
| 4.1 manifest `migration/deploy/releases/v2.5.txt`, ops files (cpm-07/07b/08, topics, `set-quality-protocol.py`), `V2.5-DEPLOY.md`, runbook, mirrors | ✅ 1cd299b6, 3e87aea2 (`!v25-upgrade` VM steps in `build-release.py`, `V2.5-DEPLOY.md`, `UPDATE-RUNBOOK.md` checks + traps, `set-quality-protocol.py`; auth-service in the manifest); `--dry-run` clean |
| 4.2 full verification on a clean tree | 🔄 **suites re-run 2026-09-17 10:43–10:52 on the clean tree at 1cc8a8b4, all green** (table below); the five v2.5 images rebuilt from HEAD with `SOURCE_COMMIT` and recreated on the lab (all healthy; `/capabilities` service commit = HEAD, six workers on jar 4ea1da78, 70 readable ids intact after the cplm-api tests); the slice E2Es stand from Phases 1–3 (18/18, 19/19, 14/14). **Pending:** `test-cpm-v25-reliability.ps1` and `cpm-v25-load-probe.py --minutes 30` → `04-load-report.md` (they kill cplm-api / stop Postgres / restart jobs, so they run after the user's manual test tour, not during it); NR table in `03-acceptance-evidence.md` then finalised |
| 4.2b user test tour | 🔄 `WHATS-NEW-v2.5.md` (repo root) — what was added, where in the UI, how to try it, the OT/Instrumental ingestion contract, how it fits; lab prepared: OT sim on the pilot loops for 8 h (pid 16756, `--exclude FIC10302`) |
| 4.2c frontend audit (user: "audit the system - check that what you are telling me really implemented") | 🔄 `docs/next-release/05-frontend-audit-2026-09-17.md` — rendered audit of 18 pages + 3 flows + all 17 gate views with Playwright (`scripts/validation/ui-v25-{audit,probe,gates}.mjs`): 0 console errors / 0 failed calls; **three defects fixed** (v2.5 pages missing from the sidebar/palette — slice whitelist; two active nav entries; G7 view crashed the workbench on >1 accepted cycle) with tests (frontend 121/121); **22 findings** ranked, F4 (stale "latest" verdict disables the workbench launcher fleet-wide) and F10 (three v2.5 jobs unsupervised) are API-side; redesign proposal for the three new pages awaits the user's go → **all 22 findings closed** (4.2d + 4.2e) |
| 4.2d Evidence Workbench redesign (user-approved plan 2026-09-17: gate strip, collapsible explain column, fused + short windows, batch APIs, performance budget) | ✅ 13 tasks, TDD, one commit each (87858877 … 4e62b25a): cplm-api KPI run ids + `projection=summary` + `POST /method-runs/evidence/batch` + `GET /method-runs/{id}/evidence/bundle` (`KpiReadsTests`, `GateMatrixProjectionTests`, `EvidenceApiTests`; cplm-api 164/164); frontend `format`, state vocabulary (NOT_RETAINED / SHORT_TIER), `gateFacts` / `verdictCopy` / `headlines`, `GateChipStrip`, `EvidenceHeaderStrip` + `CopyableId`, `VerdictCard` + `WindowFlags`, `ExplainPanel`, `useEvidenceWindows` + `EvidenceToolbar`, shell rewrite (toolbar → facts → strip → reading + explain), `HistorianLanes` fallback, chart disclosure + LTTB sampling + G5 crossings as markers; frontend **191/191**, lint + build clean; lab re-audit `ui-v25-gates.mjs` 17/17 render, 12–13 requests per cold gate open (G9 was ~50), first chart 0.9–2.6 s |
| 4.2e the remaining audit findings (user: "first fix All F open tasks") | ✅ F10 `5b2260d1`, F11 `07b34062`, F12+F21 `ac28100d`, F4 `51408de3`, F22 `9210d67a`, F5+F19+F20 `638865f7`, F18 `a49b0851`, follow-ups `1a6f2b7a` `3c0ae161` `d35f5369` `7c0cb089` - test-first each (cplm-api **171/171**, frontend **225/225**, lint + build clean); cplm-api + ams-frontend rebuilt and recreated on the lab; re-audit `ui-v25-audit.mjs` 18 pages + 3 flows 0 console errors / 0 failed calls / no overflow, `ui-v25-gates.mjs` 17/17, 12–13 requests per gate, first chart 0.9–2.5 s warm (`05-frontend-audit` §4.6) |
| 4.2f performance of the two redesigned pages (user: "Remaining 2 pages redesigned?? Also performance?") | ✅ `ui-v25-pages-perf.mjs` written and run before/after: Response event open **15.3 s → 1.0–2.6 s**, idle polling 3/min → 0, Config bundle 0.3 s; two cplm-api defects found and fixed test-first (`48a36cd4` run lookup indexed + response_event first + CTE probe, `MethodRunLookupIndexTests`; `dd09fec6` bounded per-tier reconcile, `EvidenceReconcileTests`; `59f62caa` boot-schema parity) - GIN indexes on short/long `method_run_ids` + partial `ix_evidence_manifest_unlinked` added to scripts 53 and `cpm-07-v25-schema.sql` (plant runs cpm-07 before the swap, unchanged step); cplm-api **176/176**; observed, not fixed: gateway refresh fails CLOSED on a Redis timeout (03-acceptance-evidence) |
| 4.2g gateway rate limiter under a Redis stall (user: "go ahead and test it deeply") | ✅ gateway `RateLimit/*` rewritten (session class fail-open, one bounded round trip, circuit breaker, in-process counters), SPA refresh policy (`auth/refreshPolicy.ts`, `authStore`), `tests/gateway.Tests` **17/17**, frontend **234/234**; lab proofs `test-gateway-redis-outage.ps1` Pause **9/9** + Stop **9/9** (old image reproduced the incident: 429 on refresh, 5 s reads, deny-all login), `gw-redis-stall-load.mjs` 40-concurrent p99 395 ms → 50 ms, `ui-refresh-resilience.mjs` **6/6**; gateway added to the v2.5 manifest (`03-acceptance-evidence.md`, `docs/api-gateway.md` §3) |
| 4.2h Gate Configuration frame redesign (user: filters at the top like other pages, loop search, sub-pages, on-demand data; plan approved 2026-09-18) | ✅ `3fc02496` fleet summary + drafts summary projection (`ConfigEffectiveSummaryTests`), `fc69d59b` helpers, `dbdd8d09` EffectiveView + drawer wrapper, `b3f86ef6` header + BundlesView, `c6480e2a` ConfigOverview, `d60d050c` shell (toolbar, URL machine, EditorView) - `3410f68a` real-data fixes (unset sources, observer workers) - cplm-api **179/179**, frontend **257/257**, tsc + build clean; lab: audit 0 errors / 0 failed / no overflow, Overview 0.27 s (one 49 KB fleet read), Effective 0.21 s (one 16.6 KB read), Bundles 0.20 s, idle 0 requests (`03-acceptance-evidence.md`) |
| 4.2i CPA navigation / UI repair (user: audit-driven page fixes, plan approved 2026-09-20; CHG-030) | ✅ code Phases 1–7 (`docs/cpa-ui-fix-plan.md`): context-carrying `ObcButton` navigation on six pages, drag-rectangle zoom on every trend, clock-derived shelf state, contained Response layout — lint / tsc / frontend **272/272** / build clean; browser-verified Phases 1–4; Phases 5–7 browser pass **done 2026-09-25** on the rebuilt lab: `scripts/validation/ui-v25-shelving-zoom.mjs` (real drag-rectangle zoom → Reset / Undo enabled, Reset returns; System Response 0 px overflow, aside / tables contained; 19/19) + `ui-v25-audit.mjs` 19 pages 0 console errors / 0 failed responses. Frontend-only |
| 4.2j episode shelving lifecycle (user: "proper shelve / unshelve management as we have acknowledge management", API changes allowed; CHG-032) | ✅ `cplm-api`: `EventShelvingRules` (pure) + `EventActionStore` + `CpmEventActionsController` (ack / shelve / **unshelve** / **actions** / shelving-policy) + `CplmShelfExpirySweeper`; schema `database/scripts/60` = `ops/cpm-09-event-shelving.sql` = `migration/schema/03` + self-heal DDL; frontend Review-and-shelf section, Unshelve / History panels; cplm-api unit **117/117** (+5 rules tests), frontend **277/277**, lint / tsc / build clean; **2026-09-25 on the lab:** `EventActionsApiTests` found a real defect — `GET /events/{id}/actions` threw on any history (DateTimeOffset record vs Npgsql DateTime, Dapper no-constructor) — fixed 965b72bc, **4/4**; browser pass `ui-v25-shelving-zoom.mjs` **19/19** (shelve → Shelved pill; acknowledge keeps the shelf; unshelve keeps the ack; History › lists SHELVED / ACKNOWLEDGED / UNSHELVED); new plant step cpm-09 in C2 |
| 4.2k pre-production review (user: "do a complete pre-prod", 2026-09-25) | ✅ `docs/pre-prod/v2.5-pre-prod-readiness.md` + `v2.5-ot-instrumental-requests.md`; seven procedure gaps closed in the tooling: G1 `build-release.py` ships `src-<commit>.tar.gz` and VM-STEPS extracts it first (`migration/deploy/test_build_release.py` 7/7), G2 ownership normalization step after cpm-09, G3 TM metaspace decision (above), G4 `05-validate.sh` checks the seven jobs, G5 topic numbers (8 new / 15), G6 env exports before `deploy.sh`, G7 tree committed (e654e8e6, fc444112) |
| 4.3 build the bundle (`build-release.py --release v2.5`); tracker release section final; tag `v2.5` | ✅ 2026-09-25 23:00: bundle `release-out/v2.5-20260925-r2` (`--skip-jar`, the lab-proven jar `2dc8788aa07f`) from the tagged commit; tag `v2.5`; the 35b29aa1 bundle set aside as SUPERSEDED (its jobs had never run on the lab — the supervisor resubmitted the old jar during the build). 2026-09-26 06:49 slice2 on the shipped jar **18/19** after the overnight Docker outage (all seven jobs restored from chk-64..337, 0 exceptions); the two remaining E2E failures are script expectations (slice1 `profile:*` hash; slice2 newest-row query mixing 12 h / 24 h windows) — user's call (readiness §7.1) |

## Verification status (last runs, lab)

| Suite / script | Result | When |
|---|---|---|
| Flink `mvn -o test` (Docker Maven) | **269 run / 0 failures / 2 skipped** (incl. the Response-capture re-delivery test and the two announce-source tests; the earlier "534 / 4" figure was the same run counted twice) | 2026-09-25 21:48 (after 888e1963) |
| cplm-api tests (lab DB, run alone) | **191 / 191** — 188 + 3 on a quiet feed (the 3 FleetLatestSql ranking oracles compare two reads seconds apart and flip when a window lands between them); 2026-09-25 found and fixed 3 real defects in this suite (history read, sweeper, analysis-run read) | 2026-09-25 19:57 / 20:16 |
| ingestion-service tests | **212 / 212** | 2026-09-25 17:29 |
| binding-resolver / gateway / historian-bff tests | 5 / 5 · 17 / 17 · 4 / 4 | 2026-09-25 17:29 |
| frontend vitest / lint / tsc | **277 / 277 · clean · clean** (build proven by the image build) | 2026-09-25 17:31 |
| Flink restore proof (FLINK-25920 fix; TaskManager restart at chk-1) | **7 / 7 RUNNING, 0 `UnsupportedOperationException`**; chk-1 restores on Short, Instrument Context, Loop Live RBE, Fusion, Response; post-restore checkpoints on all | 2026-09-25 21:58 + 22:16 (jar 2dc8788a, 888e1963) |
| Lab E2E on the shipped jar `2dc8788a` (888e1963), each alone | ingestion **28 / 28** · slice3 **14 / 14** · slice2 **18 / 19** (09-26 06:49; the fail is the script's newest-row query picking the 12 h window and comparing it with the 24 h one) · slice1 **17 / 18** (the fused row's `bundle_hash` is a governed hash, the script expects `profile:*` — stale expectation, left for the user) | 2026-09-25 22:26–22:37 |
| release tooling `pytest migration/deploy` | **13 / 13** (source archive LF, VM step order, numbers) | 2026-09-25 20:0x |
| `scripts/validation/ui-v25-audit.mjs` (rendered UI audit, lab) | 19 pages, 0 console errors, 0 failed responses | 2026-09-25 17:40 |
| `scripts/validation/ui-v25-shelving-zoom.mjs` (CHG-032 lifecycle + CHG-030 zoom / Response layout, real clicks) | **19 / 19** (detail-scoped assertions) | 2026-09-25 18:31 |
| `scripts/validation/ui-v25-gates.mjs` (17 gate views, lab) | 17/17 render, 0 page errors, 12–13 requests per gate, first chart 0.9–2.5 s warm | 2026-09-17 17:20 |
| auth-service `tsc --noEmit` | clean | 2026-09-25 17:29 |
| simulator pytest | 17 / 17 | 2026-09-25 17:29 |
| `gen-property-catalogue.py --check` | 165 properties, 4 copies identical | 2026-09-25 17:29 |
| `scripts/test-ot-loop-ingestion-e2e.ps1` | **28 / 28** (jar b2ba6e8e, cplm-api d5113d6e) | 2026-09-25 19:50 |
| `scripts/test-cpm-v25-slice1-e2e.ps1` | **18 / 18** | 2026-09-25 18:29 |
| `scripts/test-cpm-v25-slice2-e2e.ps1` | **16 / 19** — the G12 response path passes end to end; the 3 fails read the newest *fused* row, which exists on the new jar only after its first 4 h window → **re-run after ≥ 4 h on jar b2ba6e8e** (pending proof) | 2026-09-25 19:56 |
| `scripts/test-cpm-v25-slice3-e2e.ps1` | **14 / 14** | 2026-09-25 18:32 |
| `scripts/test-cpm-v25-reliability.ps1` | **R1 / R2 / R4 pass** (6-min warm feed; an empty 1-min window before the kill reads as a gap), **R3 pass** alone (`-Steps R3`; its producer call never worked before 2026-09-25) | 2026-09-25 20:15 / 20:22 |
| `scripts/test-gateway-redis-outage.ps1` | **9 / 9 Pause · 9 / 9 Stop** | 2026-09-25 18:44 / 18:45 |
| `python scripts/cpm-v25-load-probe.py --minutes 30` | **done** — 230 loops at 5 s + response scenarios on FIC10302; source→tuple p95 ≈ 2.9–4.1 s over 30 min (the 5 s grid tick dominates), consumer lag flat at 4, chunks +4,121, no errors → `docs/next-release/04-load-report.md` (the first attempt's tap hung on a busy topic; bounded since) | 2026-09-25 20:52 |

## Lab state (for whoever picks this up)

- 2026-09-17 10:52: the five v2.5 service images (`traverse-ingestion-service`, `cplm-api`, `historian-bff`,
  `ams-frontend`, `traverse-auth-service`) rebuilt from HEAD 1cc8a8b4 (`SOURCE_COMMIT` set) and recreated - all
  healthy; `/capabilities.service.sourceCommit` = 1cc8a8b4. Jar `4ea1da78…` on all six CPLM engine jobs (Short,
  Long, Condition, Instrument Context, Fusion, Response) + Live RBE; one jar in `/capabilities.config.jarSha256s`.
  Deploy flow and its traps: `docs/next-release/00-build-truth.md` and the scratchpad `deploy_flink_lab.py`
  (package first, entry-class check, supervisor log, cancel any worker announcing another jar after a ZK-HA recreate).
- `/health` of cplm-api shows the consumers `results`, `frames`, `evidence`, `health`, `response` (one member each);
  the conditions and config-ACK consumers run in the groups `traverse-cpa-cplm-results-conditions` and
  `traverse-cpa-cplm-results-config-acks` (not in `/health`; check with `kafka-consumer-groups --describe`).
- Data sources: `INSTRUMENTAL_HEALTH` "Lab Instrumental NE107 (mosquitto-test)" active (tenant `default`, site `hdpe`,
  source `instr-prm-1`); `MQTT_LOOP_SAMPLES` "E2E OT Gateway (mosquitto-test)" active (`quality_protocol` unset →
  STRING_ENUM default; `param_roles POS→vp`). PV binding FIC10302 → TT-10302 (instr-prm-1).
- Feeds: OT sim `ams-sims/sim_ot_gateway_mqtt.py --minutes 480 --exclude FIC10302` started 10:52 (pid 16756) on the
  four pilot loops; FIC10302 is the step-sim loop and runs under the slice-3 bundle v1 (hash f9153b00, G4 warn 4.5).
- G12 on the lab: `scripts/sim/loop_step_sim.py --loop FIC10302 --scenario input-test --pre-s 180 --post-s 360 --interval 1`
  yields one COMPLETE event per run (~9 min); run it twice ≥ 90 s apart for a VALIDATED model.
- The user's tour: `WHATS-NEW-v2.5.md` (root).

## Open items and risks carried

- Instrumental's real publisher is external: every plant loop reports `NOT_CONFIGURED` health until it ships (intended).
- Every plant `MQTT_LOOP_SAMPLES` data source needs `quality_protocol` set (`STRING_ENUM`) or its loops read `UNKNOWN` quality (by design); tool ships in Phase 4.
- The branch compiles from 06418b2c onward (the 1G commit carries whole files completed by 1H.5 classes) — stated in both messages.
- Retention of the v1 gate rows stays an ops decision; the sweeper touches evidence only.
- **Release blocker for Phase 4 → decision 2026-09-25 (pre-prod gap G3):** bounded replay / reconstruction submissions leak TaskManager metaspace (one user-code classloader per REST submission); the lab TM died of `OutOfMemoryError: Metaspace` on the second submission at 256m. Decided: ship v2.5 with the Marun TM at `jvm-metaspace 512m` / `process.size 2560m` (`docker-compose.marun.yml`, same headroom the lab has run since 2026-09-17) plus the operating rule "no more than ~10 shadow / replay / reconstruction runs between TM recreates; watch `flink_taskmanager_Status_JVM_Metaspace_Used`". The leak itself (release the submission classloader, or run bounded jobs on a separate session cluster) stays open for v2.6. Cost if wrong: a TM restart takes all seven jobs back to fresh window state (≤ 1 h short, a day for 12 h / 24 h).
