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

## Production deployment — Marun

| | |
|---|---|
| Released | **v2.5 deployed 2026-09-26 ~07:20 UTC** from `release-out/v2.5-20260925-r2` (tag `v2.5` = aae3c77a, jar `2dc8788aa07f`) |
| Result | every `VM-STEPS.md` step clean: 8 new tables, 0 non-`ams_user` owners, 15 `traverse.cpa.*` topics, 13 retention-aligned, 7 Flink jobs RUNNING, 6 workers ANNOUNCED on one jar, 17 gates, tuple 1.1, quality protocol STRING_ENUM |
| Decisions taken at the window | evidence `STANDARD` retention **3 days** (not the planned 7, and not the shipped 90) after the disk survey; Kafka minimum retention applied ahead of the window to reclaim space |
| Found at the plant | disk had 11 GB free (recovered to 24 GB via `resize2fs` +9 GB and log truncation; 15 GB after the load); `/opt/AMS-open` is **not** a git checkout so the dirty-tree guard is a no-op; ~14.6% of OT messages park correctly (one Bender insulation monitor is 99.8% of them) |
| Loop model, 2026-09-26 | `command_path` set and republished (170 of 170, 584 ms): **169 `OP_TO_VALVE` + 1 `OP_TO_VFD` (FIC10405), all EXPLICIT**; the 5 loops with no `loop_type` left `UNKNOWN`. **Assumption carried:** the valve sweep ran with an exception list of one, so any cascade master or drive-driven loop among the 169 is currently asserted to be a valve. G12 will label such findings as valve problems; G14 cannot confirm them (no VP on the feed). Correct with a named UPDATE + republish of just those ids once the control engineer supplies the VFD and cascade-master list |
| Still open | **the VFD / cascade-master exception list** (above); narrow the MQTT subscription to exclude `OT/HDPE/BENDER/#` (one Bender monitor is 99.8% of parked messages); watch `df -h /` daily for a week (15 GB, evidence class 3 d); rotate the admin password (it was pasted into a session transcript); tell Instrumental about the diode-outbox backlog and their IoTDB error log |

## Production patches after v2.5 (Marun, 2026-09-27)

| | |
|---|---|
| Symptom, day two | every loop DEGRADED, no short windows on 98 of 142 loops, G0 FAIL on every 12h verdict. Not the gateway, not data quality: two engine defects only a real fleet on a real host shows |
| Patch 1, deployed 05:24 UTC | jar `b4a10e5474e7a557` (`9244adf8`): `21e4260b` completeness from the declared grid (median of whole-second intervals gave 4 or 6, never 5; PASS rows read 1.13-1.19); `6bbfc7b2` per-partition watermarks at the source, idle-marking control streams, both post-join re-assignments removed (single max-based watermark over 16 interleaved partitions dropped 91 percent of samples as late) |
| Found on patch 1 | 73 percent still late: `withIdleness(1 min)` let a back-pressured reader that drains one partition at a time drop the other fifteen from the minimum; every late record re-fired twelve 60m windows and saturated the one core. Also: the Short job runs six sliding windows on one core and can only fall behind |
| Patch 2, bundle `release-out/v2.5-flink-patch2-20260927` | jar `f7c99294e0767ea9` (`3d6a905e`): idleness 30 min; `04b0c2ce` submitter takes `CPLM_SHORT_PARALLELISM` (plant: 4 of 16 slots, 16 cores); `9244adf8` incident controls as repository files (`CPLM_EVIDENCE_EMIT`, prune / cap scripts, cron drop-in, topics.txt at the plant values). Flink suite 275 run / 0 failures / 2 skipped. Plant proof pending at write time |
| Lever used twice | cancel the Short job, `kafka-consumer-groups --reset-offsets --to-latest`, resubmit: evens the partitions instantly; the backlog it skips was being discarded anyway |
| Proof on fresh rows (patch 1 + reset) | 1m windows: 141 loops, completeness **1.000**, 12 of 12 samples; longer kinds fill over their own length after any restart |

## CHG-033 / v2.6 — bounded evidence + partitioned result tables (started 2026-09-27; plan: melodic-tumbling-bubble)

Space fix after the 2026-09-26 outage: evidence kept by class (TRANSIENT hours + budget, EPISODE 90 d after the episode closes,
promoted at OPEN / ESCALATE / CLOSE), the three result tables range-partitioned by day at the plant (PG15, no Timescale) with a
maintenance loop that drops partitions past `retention_policy`, the Short job's artifacts stopped at the source (04b flag).
Ticked with commit id + verification as each lands. Every file stays under 500 lines.

- [x] **Phase 0 — bookkeeping** (2026-09-27): this section; ledger `.superpowers/sdd/melodic-tumbling-bubble/progress.md`
- [x] **Phase 1 — evidence classes** (2026-09-27)
  - [x] 1 (54d0ebfd; suite 192/192) `scripts/cpm-10a-episode-evidence.sql` + `database/scripts/61_cplm_episode_capture.sql` + `migration/schema/03` + `CplmEventFrameService.EnsureSchemaAsync` — `SchemaV25Tests`
  - [x] 2 (b3402a53; suite 196/196) `TransitionKind.Escalate`, `GateVerdict.MethodRunIds`, `BandRank` — `EventFrameLifecycleTests`
  - [x] 3 (4559bc1e; suite 199/199) manifest INSERT sets `retention_class` TRANSIENT / STANDARD — `EvidenceClassTests`
- [x] **Phase 2 — capture + sweeper** (2026-09-27)
  - [x] 4 (11fa8e03; suite 203/203) `EpisodeCaptureStore` + frame-service transaction + `ParseVerdict` run ids — `EpisodeCaptureTests`
  - [x] 5 (139d1202; suite 206/206) sweeper: 15-min interval, `SweepResult`, promote / TRANSIENT age + budget / EPISODE tiers — `EvidenceRetentionSweeperTests`
- [x] **Phase 3 — partitions (plant)** (2026-09-27)
  - [x] 6 (81e373a2; suite 212/212) `scripts/cpm-10b-result-partitions.sql` (short, long, gate) + `CplmResultSchema` created_at indexes + mirrors — `FeaturePartitionTests`
  - [x] 7 (44b3ead3; suite 216/216) `FeaturePartitions` / `FeaturePartitionMaintenance` / options + `Program.cs` — `FeaturePartitionTests`
- [x] **Phase 4 — release** (2026-09-27; lab end-to-end passed)
  - [x] 8 (stub-04b: Short none, others episodes; bash -n ok) `migration/04b` Short job `--evidence-emit "${CPLM_SHORT_EVIDENCE_EMIT:-none}"` first — `bash -n` + stub run
  - [x] 9 (pytest migration/deploy 18/18) `releases/v2.6.txt`, `build-release.py` OPS_FILES + VM-STEPS, cron line removed, `prune-short-features.sh` deleted — `test_build_release.py`
  - [x] docs (2026-09-27): `changes_tracker.md` CHG-033 + "Release v2.6 — what to build and run", `MARUN-DISK.md`, `marun-capacity-remediation.md`, release-note addendum
  - [x] full suites green (cplm-api 217/217 after the fix pass; pytest 20/20; stub-04b); bundle `release-out/v2.6-20260927-r3` (src-e3cc0b01, cplm-api image PROD)
  - [x] final whole-branch review (fresh reviewer): 10 findings; fixed 1 (critical: no source overlay in the VM steps), 2 (headroom UPDATE before the row exists), 5 (Enabled ignored at startup), 8a (vacuous plan assertion) in e3cc0b01; 3/4/6/7/8b/8c/9/10 deferred as minors (ledger)
  - [x] `prod_decision.md` created (production settings of record)
  - [x] **End-to-end on the lab (2026-09-27 12:05-12:35 UTC, new image `docker-cplm-api` as `traverse-cplm-api`):** records produced into the lab Kafka exactly as Flink emits them (manifest + chunk, fused LOW verdict naming a stored run and a late one, HIGH verdict, clear verdict with support) → the real consumers: manifests COMPLETE and TRANSIENT, the frame OPEN → ESCALATE → CLOSE (RECOVERED) with capture rows OPEN x2 / ESCALATE / CLOSE and `capture_count` 3, three artifacts promoted to EPISODE in the frame transaction, the late one by the first sweep (`Evidence retention: 1 promoted to EPISODE`), the reconciler linking, the gateway API `/api/v1/cpm/method-runs/{id}/evidence` returning both as COMPLETE / EPISODE with an admin token; a second instance of the same image against a plain database built from `03` + `cpm-10b` (`cplm_plain_e2e`, own consumer groups): self-heal DDL clean on the partitioned tables, feature records routed into today's partition, a 30-day replay into DEFAULT, a duplicate key upserted (6 rows / 6 window_ends, ids 1-6 from the new sequence), long rows in their partition, 256 replayed real verdicts, real Flink manifests classified TRANSIENT, no errors. Found and fixed: the VM step 6d relkind proof used `relname||relkind` (ambiguous on PG15) - now `relkind::text` with a pytest.
- [ ] **Phase 5 — plant rollout as v2.6.1 = v2.6 + Flink patch 2** (user runs; ticked from pasted output; bundle `release-out/v2.6.1-20260927`)
  - [ ] 5.0 source archive extracted - **not yet** (2026-09-27 16:5x UTC: the plant copy is the first regeneration, archive `src-b6973926.tar.gz`; the `be6db4f4` name in the runbook did not exist there, greps printed 0 / 1; step 5 therefore ran with the OLD 04b: Short job p=1, slots-available 9, short-tier evidence on). Corrective: extract `src-b6973926.tar.gz`, cancel Short / Long / Fusion, resubmit with the new 04b
  - [x] 5.1 (2026-09-27) `cpm-10a` online (ALTER, CREATE TABLE, 2 indexes, INSERT 0 1, DO) + `02-apply-schemas.sh` complete + owners 0 + `EPISODE|90 PINNED| STANDARD|3`
  - [ ] 5.2 cplm-api image swap + `/health` + first `Evidence retention:` log line
  - [~] 5.2a (2026-09-27) `.env` switches written (`CPLM_EVIDENCE_EMIT=episodes`, `CPLM_SHORT_PARALLELISM=4`), both images loaded, JM + TM removed, `deploy.sh --prod` OK, 7 RUNNING, cplm-api healthy - but with the old 04b (see 5.0); resubmit pending. `.env` switches written in 4a (`CPLM_EVIDENCE_EMIT=episodes`, `CPLM_SHORT_PARALLELISM=4`, no short-evidence line), Flink image loaded, `docker rm -f` JM + TM, `deploy.sh --prod` resubmits all seven jobs
  - [ ] 5.3 proofs after 15 min: G5+-only manifests, `slots-available` 6, every worker announces jar f7c99294e0767ea9, late drops 0
  - [x] 5.0 / 5.2a / 5.3 completed 2026-09-27 17:30 UTC (archive extracted, Short / Long / Fusion resubmitted with the new 04b, 7 RUNNING, slots-available 6, new image confirmed from the DLL; the plant logs at level Error so the sweeper never prints)
  - [!] 5.4 measurement result (2026-09-30 / 10-02): TRANSIENT bounded as designed (1.75 GB, nothing older than 2.5 h) but EPISODE grew ~1 GB/day: 1,350 capture events/day from verdict-family flapping (348 FAMILY_CHANGED closes/day, 413 episodes under 1 h); disk hit 1.4 GB free on 10-02. Actions: evidence off again, EPISODE 90 → 2 d, evidence tables truncated (0 pinned), 34 orphaned checkpoint dirs (5 GB) deleted → 17 GB free. **Blocker before evidence returns: the capture policy must not open a new episode (and capture ~95 artifacts) on every family flip.**
  - [x] 5.4a evidence back ON 2026-10-02 13:19 UTC, bounded (EPISODE 2 d; cache stays 2 GiB because the compose overlay does not forward `Cplm__EvidenceTransientBudgetBytes` - pass-through owed in the next release); Long + Fusion cancelled cleanly and resubmitted
  - [ ] 5.4b 24 h measurement + headroom rule (`GATE_RESULTS` 14 via `INSERT ... ON CONFLICT DO UPDATE` if needed - the row exists only after cpm-10b)
  - [x] 5.5 (2026-10-03) `GATE_RESULTS` 14 set first; cpm-10b: short 0/8311 (6 h), long 40797/40797, gate 285353/308383 carried over; 3 x relkind p; all DEFAULTs 0; probe 25 ms → 112 ms (partition append, inside budget); cplm-api healthy
  - [x] 5.6 (2026-10-03) cron drop-in installed (prune line 0); 12 GB free after the swap; next-day partition drop still to confirm
  - [!] 5.7 found during 5.5: the Short job had been in a checkpoint restart loop since the 2 Oct ingestion stop (1,072 completed / 1,070 expired checkpoints, restarts every 10-30 min, event time 13 h behind, re-firing the same 448 windows, 46 short rows in 16 min). Fix as on 27 Sep: cancel, `traverse-cpa-flink-cplm-short` offsets to latest, resubmit (06:3x UTC). Watch: checkpoints completed rising with failed 0; short rows current

## CHG-034 / v2.6.2 — family-change debounce (started 2026-10-03)

- [x] lifecycle: candidate family + takeover after `Cplm:FamilyChangeWindows` (3) — `EventFrameLifecycleTests` 20/20
- [x] frame service persists `candidate_family` / `candidate_windows`; self-heal DDL; `cpm-11` plant script + `62_` lab + `03`
- [x] plant compose forwards the five `Cplm__*` knobs; VM steps cancel every job before `docker rm -f` JM/TM and sweep orphan checkpoints — `test_build_release.py` 30/30
- [x] `releases/v2.6.2.txt` + VM steps 4a / 4e / 6e
- [x] full cplm-api suite 2026-10-03: 219/221 green; the 2 failures are the lab (long-table GIN probe on Timescale-compressed chunks; config lifecycle timing right after the Docker restart, passes on re-run)
- [x] lab injection 2026-10-03 (new image): 7 windows OSC, STI, STI, OSC, STI, STI, STI → 2 episodes / 1 FAMILY_CHANGED / captures OPEN x2 + CLOSE x1 (old lifecycle on the same input: 4 episodes / 3 closes)
- [x] fresh review 2026-10-03: 6 findings, all applied in f1171518 (candidate windows never escalate or move severity; closed rows carry no candidate; unjudged windows keep the candidate, documented; orphan sweep guarded; v2.6.2 steps carry the checkout guard + START_AMS_API); suite 218/218 without the two lab-bound tests; bundle `release-out/v2.6.2-20261003` (src-f1171518, checksums OK)
- [ ] plant (now inside the v2.6.3 bundle; v2.6.2 withdrawn): overlay → cpm-11 → ownership → swap → proofs; next day `FAMILY_CHANGED` closes in the tens

## CHG-035 / v2.6.3 — Explorer 12h/24h toggle + on-demand CSV (2026-10-03)

- [x] `CpmChart`: data table removed, one flat `Export CSV` built on click — `CpmChartCsv.test.tsx` RED→GREEN
- [x] `explorerHref` writes `?window=`; Explorer reads it; workspace pill + Summary strip share the query; `WindowKindToggle` with the empty-emit guard — `cpaHref.test.ts` +1, `WindowKindToggle.test.tsx` 2/2
- [x] Performance → Explorer hand-off carries the kind
- [x] vitest 281/281 · lint clean · build clean
- [x] lab browser pass (FIC10302): 12h eyebrow / run id / request / pill; G5 detail 2 charts, 0 tables, 2 CSV buttons, 0 new console errors
- [x] workbench reconstruction posts `source: 'iotdb'` (historian) — `api/cpm/evidence.test.ts` RED→GREEN; suite 282/282, lint clean
- [x] lab E2E, submit level: the historian POST is accepted on the patch-3 jar (202, run cc6dd5e2, job 516b30ff, tier long, source iotdb); before the fix the same POST was 502 (CHG-036). Completion needs a free TaskManager slot (lab 16/16, two duplicate jobs) → proven at the plant, runbook step H
- [x] plant 2026-10-03 09:03 UTC: v2.6.3 deployed — checksums 19/19, overlay, cpm-11 (2 columns), both images, containers recreated, sourceCommit 5dc9dcf4, knobs 1073741824 / 3, Healthy + groupSplit False, frontend 200 + assets; step H → ANALYSIS_RUN_SUBMIT_FAILED → CHG-036
- [x] release v2.6.3 = cplm-api (CHG-034) + ams-frontend (CHG-035), one bundle, replaces v2.6.2 (folder + rar removed) — manifest + builder tests 34/34; bundle `release-out/v2.6.3-20261003` (src-5dc9dcf4, both images, 16 ops files, VM-STEPS.md, SHA256SUMS 19/19 OK); frontend image assets carry the toggle and `source="iotdb"`, no "Data table / CSV"
- [ ] plant: browser proofs (Ctrl+F5, toggle, CSV), next-day FAMILY_CHANGED in the tens

## CHG-036 — historian-backed bounded runs refused by Flink (2026-10-03)

- [x] `CplmHistoricalReplayJobTest` RED (missing `historianSource`) → GREEN 2/2; Flink suite 277 / 0 / 2 skipped (Docker Maven); jar `26020dfd4f78eb20`
- [x] add-on `release-out/v2.6.3-20261003/flink-replay-jar-patch4/` (jar + SHA256SUMS + STEPS.md: cp over the host jar, restart cplm-api, no engine change)
- [x] plant: jar patch applied 10:21 UTC (container sha 26020dfd, Healthy) — still refused; hand-built submission to the JobManager accepted (job c6b5bf75) → second cause: `--brokers kafka:9092` (lab default) → `CplmParameterUpdateReader` fails in main()
- [x] overlay forwards `CplmRecompute__BootstrapServers` — `test_plant_compose_gives_recompute_the_plant_brokers` RED→GREEN, 35/35
- [x] cplm-api falls back to its own `Kafka:BootstrapServers` — `CplmRecomputeOptionsTests` RED→GREEN 3/3 (next image)
- [x] plant: overlay line patched, cplm-api recreated 11:09 UTC; hand submission ran → third cause `801: Authentication failed` (job read IOTDB_PASSWORD, fleet sets IOTDB_PASS)
- [x] job reads `IOTDB_PASS` then `IOTDB_PASSWORD` — `historianCredentialsFollowTheFleetEnvNames` RED→GREEN; suite 278 / 0 / 2 skipped; add-on jar `01a54d9f99b4b385`
- [x] plant 12:23 UTC: hand submission with `--site site1` + credentials → job 50d52c31 → `STANDARD/COMPLETE=3` for run b6c924cf — **reconstruction from IoTDB proven at the plant**; fourth cause = device path from the registry site
- [x] job resolves the device from `--iotdb-device` / `--iotdb-root-prefix` / `LOOP_ROOT_PREFIX` / `root.site1.cpm` + SafeNode mirror — test RED→GREEN 4/4; cplm-api passes `--iotdb-device` — `CplmRecomputeOptionsTests` 4/4 (next image)
- [x] plant 2026-10-03 13:19 UTC: patch 4 swapped (container sha 043a6456, brokers kafka-1/kafka-2); step H through cplm-api (PIC10412, run 5d0d8ebf) → `accepted … source iotdb gate G5` (run 4d697f22, job 50c44fb0) → `STANDARD/COMPLETE=3` within 20 s — **CHG-036 closed at the plant; the workbench Reconstruct button works on any window the historian holds** → `accepted … source iotdb`, job runs and ends, `STANDARD/COMPLETE=N`, workbench shows the artifacts
- [ ] next Flink image release carries this source (closes the engine/replay jar split)

## CHG-037 / v2.6.4 — evidence checksum without SubtleCrypto (2026-10-03)

- [x] `sha256Hex` native-or-pure fallback — `artifactCodec.test.ts` +2 RED→GREEN
- [x] frontend suite 284/284, lint clean, build clean; builder test `test_v264_manifest…` RED→GREEN 36/36
- [x] workbench polls the manifest every 10 s while a reconstruction is pending — `GateEvidenceWorkspace.test.tsx` +1 RED→GREEN; suite 285/285
- [x] bundle `release-out/v2.6.4-20261003` rebuilt with the polling change (src-2a737e30, SHA256SUMS 18/18 OK; the src-84191a91 build is superseded)
- [x] lab browser 2026-10-03 (Vite, FIC10302 12h): Summary G5 → 2 charts (21,414 points) with the native engine; with `crypto.subtle` removed from the page (the plant's HTTP case) Summary G11 → 2 charts (21,402 / 64,206 points) and Workbench G8 → 4 charts, no "did not verify", no Reconstruct offer; G6 (no evidence in the lab) shows the Reconstruct action as designed
- [ ] plant: image swap, Ctrl+F5, evidence charts draw on the Explorer gate panel and the Workbench

## CHG-038 / v2.6.5 — Short job checkpointing + Flink image (2026-10-04)

- [x] `configureCheckpointing`: tolerate 1,000 failures, unaligned after 30 s, timeout 15 min — `CplmShortFeatureStreamJobTest` RED→GREEN
- [x] manifest `v2.6.5` (flink-jobmanager + cplm-api) — builder tests RED→GREEN
- [x] Flink suite 280 / 0 / 2 skipped; jar 0fd03445; bundle `release-out/v2.6.5-20261004` (src-0556248e, Flink image carries jar 0fd03445, cplm-api image, SHA256SUMS 20/20 OK; RUNBOOK.md with the 7-job swap order)
- [x] plant 2026-10-04 08:28 UTC: 7 cancelled → 0 running → JM/TM removed → deploy → 7 RUNNING, 6 slots free; orphan sweep 1.8 GB → 99 MB; JM image created today, usrlib jar 0fd03445, cplm-api 0556248e with mounted jar 0fd03445, Healthy / no split; Short job `/checkpoints/config` = timeout 900000, unaligned, tolerable 1000
- [ ] `/capabilities` engine jars still list f7c99294 (consumed announcements lag the swap) — re-check in an hour; next-day daily check
- [x] plant 2026-10-04 07:0x: v2.6.4 deployed (ams-frontend created 07:03, fallback in the shipped chunk); daily check: Short job in the restart loop (32/212, 839 min behind, lag 1.48 M) → section 4 remedy applied; disk 12 GB WARN; FAMILY_CHANGED 184 (was 348)

## CHG-039 / v2.6.6 — Short job: one buffer on heap state, TaskManager 3584m (2026-10-05)

- [x] Marun 05:56 daily check: 3 GB free, Short 1.46 M behind → section 1 sweep (3 → 9.4 GB), section 4 reset; root causes found (32 sample copies; job overrode DELETE_ON_CANCELLATION → 4.1 GB orphan)
- [x] `ShortFeatureBufferFn` + `ShortWindowSpecs` + `ShortFeatureEmitter`; job graph = one `cplm-short-windows` operator; `DELETE_ON_CANCELLATION`
- [x] `ShortWindowParityTest` (heap + RocksDB, 15,749 records identical; 2 mutation checks fail it); Flink suite 284 / 0 / 2 skipped
- [x] layout chosen by measurement (lab thread dumps): flat map 16/s → minute lists 153/s → seq map + minute index + timer chain
- [x] RocksDB at Marun's 45 MB per slot = 47/s (72 MB 127, 128 MB 208); heap 804/s (`ShortWindowBacklogBench -Dshort.bench.real=true`) → **heap chosen** (user, 2026-10-05); `configureStateBackend` + test
- [x] TaskManager 2560m → 3584m (plant overlay + lab compose); lab TM recreated: taskHeap 1,101 MB
- [x] release manifest `v2.6.6` + `!chg039-short-heap` VM-step proofs; builder tests 41 passed
- [x] daily check: checkpoint-size line, zero-rows display fix; runbook §1
- [x] lab heap run (30 loops, p=3): busy 0–30 ms/s, windows ~3 min behind, checkpoints 0 failed; survived a lab ZooKeeper suspension at 11:36 (restored from its heap checkpoint)
- [x] lab near-full buffer (55 of 60 min, 12:18–12:23 UTC): busy 0 ms/s, windows ~2 min behind, checkpoint 111–118 MB (bench predicted ~116), heap 647–843 of 1,230 MB, 0 old-gen GC. Run ended 12:26 when the session/Docker Desktop stopped
- [ ] lab: a second restore of the Short job ~12:12 (checkpoint count 9 → 2) while the PC wrote the 616 MB bundle image; job recovered by itself and was on time by 12:18; cause NOT verified (JM log unreadable after Docker stopped) — likely the same ZooKeeper/Docker stall as 11:36; watch for restores at the plant (`restored` in /checkpoints)
- [x] commits 31b8c114 (living-asset doc), 5307c456 (CHG-039), 06d9880c (VM steps 4a); bundle `release-out/v2.6.6-20261005` (src-06d9880c, jar b432802f, 19/19 SHA256 OK)
- [ ] push `feat/v25-next-release` and fast-forward `main` (blocked for the agent by the permission classifier — user runs it)
- [x] plant 2026-10-05: pre-sweep + `rmi ams-flink:pre-v2.6.5` (4.8 GB free), SHA256 OK, rollback tag `ams-flink:pre-v2.6.6`, 4a (3584m line 1, available 11 GiB), load, step 5: 7 cancelled → JM/TM removed → deploy → 7 RUNNING 12:56–12:57; sweep → 118 MB; one tm_ dir; disk 11 GB free; proofs: taskHeap 1154272437, `cplm-short-windows`, delete_on_cancellation true, 6 slots free, jar b432802f
- [x] plant retest +30 min (~13:26 UTC): lag 4,560; six kinds × 143 loops, 10-min counts 1m 1,430 · 5m 1,430 · 10m 715 · 15m/30m/60m 286 (exact cadence); newest 1m 13:23 (~3 min behind); checkpoints 8 ok / 0 failed / 0 restored, 115.4 MB, duration < 1 s (was 553 s); windows busy 0 ms/s at 8 samples/s per subtask; heap 554 / 1,290 MB, 3 old-gen GC; disk 12 GB free
- [ ] plant retest +70 min (~14:10, buffer full): checkpoint size settles (≤ ~250 MB OK; plant tuples heavier than the lab's), heap, lag; next-morning daily check

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
