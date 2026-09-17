# v2.5 acceptance evidence — NR-001 … NR-062 (spec v6 `xlsx_Acceptance.tsv`)

Every scenario names the automated evidence that exercises it (a unit / integration test that cites the
scenario id or asserts its expected result, and/or a step of a lab E2E script), the commit that landed it
on `feat/v25-next-release`, and the result. "Unit" evidence proves the mechanism; "lab" evidence proves
the running application - the spec's own rule ("isolated Python reference tests do not establish
production acceptance") is why every slice also has an E2E script against the running stack.

Suite state at the time of writing (2026-09-17): Flink `mvn test` **265 / 0 failures / 2 skipped**;
cplm-api **159 / 159**; ingestion-service **212 / 212**; frontend vitest **101 / 101**, lint + build
clean; `pytest scripts/sim` **17 / 17**. Lab E2E results are recorded in `changes_tracker.md`
(CHG-026 slice 1 **18/18**; CHG-027 slice 2 and CHG-028 slice 3: the entries carry the run results).

| NR | Scenario (area) | Evidence | Commit(s) | Result |
|---|---|---|---|---|
| 001 | Synthetic FOPDT exogenous step (G12) | `ResponseMetricCalculatorTest`, `CrossingsTest`, `OutputErrorEstimatorTest` (Kp 3 ± 0.02, θ 4 ± 0.2, τ 20 ± 0.5); lab: COMPLETE `INPUT_TEST` events Kp 3.000 / τ 20.00 s / θ 2.7 ± 2.5 s (CHG-027) | 33e167a7, ae226715, 9bca728c | unit + lab pass |
| 002 | Negative gain step | `CrossingsTest`, `OutputErrorEstimatorTest` (same rise time, overshoot 0) | 33e167a7, ae226715 | unit pass |
| 003 | Integrating level step | `IntegratingEstimatorTest` (Ki recovered, `process_gain` null `INTEGRATING`); UI `quantityText` "not applicable (integrating)" (`ResponseChart.test.tsx`) | ae226715, c00629e9 | unit pass |
| 004 | Closed-loop level response | `ClosedLoopPemEstimatorTest`, `ResponseCaptureEvaluatorTest` (servo path, `process_gain` `PATH_NOT_EXOGENOUS`) | ae226715, 3599d519 | unit pass |
| 005 | Steady SP closed-loop routine noise | `ClosedLoopPemEstimatorTest` (abstains: `NO_EXCITATION`) | ae226715 | unit pass |
| 006 | Poor excitation | `ResponseEventDetectorTest` (no candidate), `OutputErrorEstimatorTest` (`NOT_ESTIMATED`) | fbb2e8df, ae226715 | unit pass |
| 007 | Step interrupted by another step | `CaptureStateMachineTest` (`SUPERSEDED_BY_EVENT`), `ResponseCaptureEvaluatorTest.nr007…` (the STREAMING capture supersedes on a second step - the lab found the machine path was unit-only); lab: slice-2 E2E "a second step 30 s after the first CENSORS the first" (`loop_step_sim.py --scenario interrupted-step`) | fbb2e8df, 729ae54e, 770e3315 | unit pass; lab per CHG-027 |
| 008 | No stable final endpoint | `EndpointsAndSettlingTest` (`RIGHT_CENSORED`) | 33e167a7 | unit pass |
| 009 | Reference offset | `EndpointsAndSettlingTest` (response settle finite, target settle `TARGET_BAND_NOT_ENTERED`, steady error 2) | 33e167a7 | unit pass |
| 010 | Delay below source-time uncertainty | `OutputErrorEstimatorTest` (θ 0.5 s on a 5 s grid → uncertainty ≥ 2.5 s, `FLAT_DELAY`) | ae226715 | unit pass |
| 011 | Independent model validation | `ModelValidatorTest` (holdout by event; free-run vs prediction reported separately), `ResponseCaptureEvaluatorTest`; lab: second event VALIDATED against the first (CHG-027) | 1b0c6087, 9bca728c | unit + lab pass |
| 012 | Correlated residuals / invalid instruments | `ModelValidatorTest` (whiteness only where assumptions hold; input–residual correlation with the declared lag convention → REJECTED) | 1b0c6087 | unit pass |
| 013 | SOPDT repeated poles | `ZohSimulatorTest` (τ1 = τ2 finite, equals the analytic response), `OutputErrorEstimatorTest` | f3a91c84, ae226715 | unit pass |
| 014 | Unknown controller form | `FrequencyResponseTest` (`gain_margin` null `CONTROLLER_FORM_UNKNOWN`); `BodePanel` renders only when the kernel wrote a `bode` artifact | 1b0c6087, c00629e9 | unit pass |
| 015 | New controller / device / regime | `ResponseCaptureEvaluatorTest` (context revision on the result; controller snapshot as-of); models as-of (`ModelsApiTests` in `ResponseResultStoreTests`); bundles pin per event (3C.1 `ResponseJobConfig.underBundle`) | 3599d519, 01e8122a, b3eb83c6 | unit pass |
| 016 | 5 s samples on fast flow dynamics | `MethodEligibilityTest` (5 s grid, 10 s period → `LIMITED:BANDWIDTH` on G5/G6/G12), `GateMatrixProjectionTests`; lab: slice-2 E2E "bandwidth eligibility rides the long and fused rows and the gate cells" | 48695ba8, 52b4d4a6 | unit pass; lab per CHG-027 |
| 017 | Longer than 24 h thermal event | `CaptureStateMachineTest`, `ResponseCaptureEvaluatorTest` (`CENSORED CAPTURE_MAX`) | fbb2e8df, 3599d519 | unit pass |
| 018 | Unit conversion (Signals) | `ShortFeatureCalculatorTest` (°C vs K×10 give identical G2/G4 statuses with declared spans) | 83c4ad57 | unit pass |
| 019 | Sparse change-based source | `MethodEligibilityTest` (RBE holds → `RBE_HOLD` in G0), `RegistryDimensionsTests` (acquisition contract), `ClassificationStep` | 48695ba8, 910c5b93 | unit pass |
| 020 | Stale optional VP / MODE | `TupleCodecTest` (held VP past `vpMaxAgeS` → not eligible), `ResponseCaptureEvaluatorTest` (a stale held VP is not the applied input) | 65db8eec, 81baa69c | unit pass |
| 021 | BAD numeric / unknown quality | `QualityDecoderTests`, `QualityPipelineTests` (ingestion), `CplmGateEngineQualityTest` (G0 FAIL `QUALITY_UNKNOWN`); lab: slice-1 E2E "UNKNOWN quality loop → G0 FAIL reason" | 4d311cdb, 5f31502e | unit + lab pass |
| 022 | Same numeric value, changed quality | `LoopLiveRbeQualityTest` (quality-only change passes the deadband); load probe drives 20 % quality-only publishes | 7b256208 | unit pass |
| 023 | Heartbeat only | `LoopLiveRbeQualityTest` (`emission_ts` advances, `source_ts` unchanged), `useLoopLive` / `liveMetric.test.ts` | 7b256208 | unit pass |
| 024 | Known output maximum 80 % | `LimitEpisodesTest` (declared `opMax` 80 → `active_high`, `LIMIT_SOURCE` declared) | 08ea68a2 | unit pass |
| 025 | One-hour freeze in 24 h | `LimitEpisodesTest` (one `freeze_event`, G11 WARN, retained); lab: slice-1 E2E "freeze episode → /conditions" | 08ea68a2, 25a8de85 | unit + lab pass |
| 026 | Effort-only with VP mapped | `FusionVerdictV2Test` (stiction SUSPECTED, contradiction listed, G14 NOT_CONFIRMED); lab: slice-1 E2E NR-026 fixture | 49938db1 | unit + lab pass |
| 027 | Purely linear phase delay | `FusionVerdictV2Test` (geometry / lag cannot confirm) | 49938db1 | unit pass |
| 028 | Upstream link but no peer measurements | `InteractionMathTest`, `FusionInteractionTest` (`UNAVAILABLE / PEER_UNOBSERVED`, never a disturbance context); lab: slice-2 E2E G13 steps | 47dfbaa0, a8d6df4e, 6bdcfd78 | unit pass; lab per CHG-027 |
| 029 | Repeated overlapping windows | `EventFrameLifecycleTests` (`qualified_support_ms` union; overlapping windows do not multiply persistence) | 3535c78a | unit pass |
| 030 | No data or NAMUR source outage | `EventFrameLifecycleTests` (missing evidence never closes an episode: `availability_state`), `eventsState.test.ts`; slice-1 E2E availability step | 3535c78a | unit + lab pass |
| 031 | Historical gate click (UI) | `GateEvidenceWorkspace.test.tsx` (renders from an immutable selection, never `/gates/latest`; URL restores the selection; a loop alone lands on its newest window with run identity, URL replaced; the gate strip, the steppers and Newest navigate within the loaded windows) | 5c986106, dc8b7cef | unit pass; lab: `ui-v25-gates.mjs` 17/17 gate views open (2026-09-17) |
| 032 | G5–G9 artifact panels | `GateArtifactsTest` (every gate's artifact set equals the workbook field list), 17 views (`views.test.tsx`); lab: slice-2 E2E "G5 acf_series has length and G6 psd declares ordinate_kind PSD" | 19727d1d, f5f4d20a | unit pass; lab per CHG-027 |
| 033 | Mixed engineering units | `CpmChart.test.ts`, `chartOption.test.ts` (one axis per unit group; 400 °C PV and 0–100 pp OP both legible) | 8ec77afb, f909830e | unit pass |
| 034 | Unavailable method artifact | `classifyGateResult.test.ts` (9 states), `views.test.tsx` (unavailable artifact → `GateResultState`, never an empty chart), `EvidenceApiTests` (EXPIRED → 410) | 8ec77afb, f5f4d20a, 38f42e73 | unit pass |
| 035 | Model confidence / prediction bands | `ResponseChart.test.tsx` (bands labelled with their meaning), `CpmChart.test.ts` | c00629e9 | unit pass |
| 036 | All F/C/S/M and simultaneous flags (NAMUR) | `InstrumentalHealthTests` (all flags preserved); lab: slice-1 E2E "publish F on PV → /instrument-health shows F" | 09d82159 | unit + lab pass |
| 037 | Complete verified empty state | `DeviceStateMachineTest`; slice-1 E2E "clear with state_complete → NO_ACTIVE_DIAGNOSTIC" | 9df8052e | unit + lab pass |
| 038 | Stale retained snapshot | `DeviceStateMachineTest`, `InstrumentalHealthTests` (STALE, not clear); slice-1 E2E | 09d82159, 9df8052e | unit + lab pass |
| 039 | Duplicate and conflicting observation id | `InstrumentalHealthTests` (exact duplicate idempotent; differing payload → `INTEGRITY_CONFLICT` DLQ); slice-1 E2E | 09d82159 | unit + lab pass |
| 040 | Restart / epoch and out-of-order event | `DeviceStateMachineTest`, `InstrumentalHealthTests` (old sequence after a new epoch without snapshot → parked) | 09d82159, 9df8052e | unit pass |
| 041 | Temporal hardware replacement | `InstrumentBindingTests` (replacement splits, overlap 409), `InstrumentHealthReadsTests` (as-of picks the device installed then) | 4ef64e9a, 06418b2c | unit pass (lab DB) |
| 042 | Variable-specific fault | `DeviceStateMachineTest` / `HealthEligibilityPolicyTest` (fault on one variable leaves the other channel ELIGIBLE); slice-1 E2E | 9df8052e | unit + lab pass |
| 043 | F or Function Check during a response | `CaptureStateMachineTest` (`CENSORED HEALTH_INELIGIBLE`) | fbb2e8df | unit pass |
| 044 | M with valid measurement / missing integration | `TransmitterHealthPanel.test.tsx` (M-only: "context only, measurement valid"; `NOT_CONFIGURED` is not OK); slice-1 E2E | 210d26e9 | unit + lab pass |
| 045 | Late correction | `DeviceStateMachineTest` (revision 2, original kept), `InstrumentHealthReadsTests` | 9df8052e, 06418b2c | unit pass |
| 046 | Every exposed property mutation (Config) | `CapabilityCoverageTest` (every flink-consumed catalogue property is read by a registered reader or declared unsupported with a reason - 78 declared), `/capabilities.config` from the running jobs; lab: slice-3 E2E step 1 | c62cfe66, 2cc34ed5 | unit pass; lab per CHG-028 |
| 047 | Partial override inheritance | `ConfigLibraryTests` (resolver: unrelated commissioned values kept; two loops never leak), `EffectiveBundleSelectorTest` (LOOP > PROFILE > SITE; another loop never sees the override), `ConfigLifecycleTests` | 8a0a6084, b3eb83c6 | unit pass |
| 048 | Wrong loop / site or unknown field | `ConfigLibraryTests` (unknown field named), `BundleBroadcastHandlerTest` (worker NACKs `UNKNOWN_PROPERTY` by name); lab: slice-3 E2E "an unknown field is refused naming it" | 8a0a6084, b3eb83c6 | unit pass; lab per CHG-028 |
| 049 | Invalid scalar / bounds / dependent parameters | `ConfigLibraryTests.Nr049_…` (NaN / Inf / inverted limits / impossible period / fraction as percent refused, field named), `BundleBroadcastHandlerTest` (OUT_OF_BOUNDS / TYPE by name), `PropertyForm.test.tsx` (a percent for a fraction refused before sending) | 8a0a6084, b3eb83c6, 1b853e89 | unit pass |
| 050 | Attempted integrity bypass | `BundleBroadcastHandlerTest` (foreign signature → `UNSIGNED`; edited content → `HASH_MISMATCH`; no key → nothing accepted), `ConfigLibraryTests` (G9 PRIMARY, VP_PRESENCE proof refused) | b3eb83c6, 8a0a6084 | unit pass |
| 051 | Mixed worker versions / partial ACK | `ConfigLifecycleTests.Nr051_…` (mixed jars → `ACTIVATION_FAILED`; a lone ACK past the window → `PARTIALLY_ACKNOWLEDGED`, never active), `DeploymentStatus.test.tsx`; lab: slice-3 E2E activation step (one jar, every worker) | 9de5eb45, 1b853e89 | unit pass; lab per CHG-028 |
| 052 | Restart, restore and rescale | `EffectiveBundleSelectorTest` (the same broadcast state selects the same hash), `BundleBroadcastHandlerTest`; lab: `test-cpm-v25-reliability.ps1` R2 (TaskManager restart → same bundle hash on the next result) | b3eb83c6, 6bdcfd78 | unit pass; lab per the reliability run |
| 053 | Stateful window / estimator change | `BundleBroadcastHandlerTest` + `EffectiveBundleSelectorTest` (STATE_BOUNDARY → new epoch), `ResultIdentity.warmup` (WAITING / WARMUP on windows whose support began before the boundary) | b3eb83c6 | unit pass |
| 054 | Rollback and policy improvement | `ConfigLifecycleTests` (rollback = a new deployment of the previous bundle, old results untouched), `ShadowComparison` (`POLICY_RECLASSIFICATION` when symptoms disappear); lab: slice-3 E2E rollback step | 9de5eb45, 1b853e89 | unit pass; lab per CHG-028 |
| 055 | Unsupported algorithm / new topology | `ExecutionPlanCapacityTest` (long_30h, moved gate, other scheduler, six-hour G5 period → `DEPLOYMENT_REQUIRED`), `ConfigLibraryTests`, `BundleBroadcastHandlerTest` (REGIME scope, DEPLOYMENT class refused) | 96036c50, b3eb83c6, 8a0a6084 | unit pass |
| 056 | Bounded replay after Kafka expiry | `ResultIdentityTest`, IoTDB bounded source (`--source iotdb`); lab: slice-1 E2E replay step + CHG-027 reconstruction from the historian | 04bdb7d5, 117a9622 | unit + lab pass |
| 057 | Live / replay / shadow parallel | `EvidenceReconstructionTest` (a reconstruction never changes the original verdict; isolation by purpose), `ResultUpsertTests` (a different bundle is a new row); lab: shadow runs (slice 3), reliability R1 | 04bdb7d5, 9de5eb45 | unit pass; lab per CHG-028 |
| 058 | Crash / retry before downstream projection | `EvidenceAssemblyTests` (out-of-order / duplicate / corrupt chunks), `ResultUpsertTests`; lab: `test-cpm-v25-reliability.ps1` R1 (cplm-api SIGKILL), R3 (duplicate chunk), R4 (Postgres paused) | 04bdb7d5, 6bdcfd78 | unit pass; lab per the reliability run |
| 059 | Clean database and frontend CI | `SchemaV25Tests` (53..58 on the lab DB from the scripts), the lab volume rebuilt from `database/scripts` by `run-all.ps1`; frontend `npm test && npm run lint && npm run build` clean; Flink test compile restored (0.1) | 5c97c064, 04bdb7d5 | pass |
| 060 | Retention expiration with investigation evidence | `EvidenceRetentionTests` (pinned survives, unpinned EXPIRED, chunks gone, manifest kept), `EvidenceApiTests` (410 `EVIDENCE_EXPIRED`), `InvestigationsApiTests` (a pin survives the sweeper); lab: CHG-027 retention cycle EXPIRED → reconstruct → ATTACHED | 04bdb7d5, 7af35971, 117a9622 | unit + lab pass |
| 061 | Declared target load and latency | `scripts/cpm-v25-load-probe.py` → `docs/next-release/04-load-report.md` (this host's numbers: source → emission, source → tuple, checkpoints, consumer lag, evidence rate; stated deviations: one response event per ~8 min scenario, not five per minute) | 75744c77 | measured on the lab (see the report) |
| 062 | Completed work but inconclusive response | `InvestigationsApiTests` (outcome explicit, default INCONCLUSIVE; WORK_COMPLETED ≠ PERFORMANCE_RESTORED); lab: slice-2 E2E investigation step | 7af35971, 729ae54e | unit pass; lab per CHG-027 |

## Rendered audit of the Evidence Workbench (2026-09-17, redesign)

`scripts/validation/ui-v25-gates.mjs` opens every gate of one fused window of FIC10405 (24h, INSUFFICIENT_DATA,
run ids present) on the lab frontend and records what renders, the API requests issued for the page load and the
time from navigation to the first drawn chart or stated panel. Result at commit `4e62b25a` (frontend image
built from it): **17 / 17 gates render**, 0 page errors, no horizontal overflow at 1600 px; every gate open is
**12–13 requests** on a cold page load (6 of them the app's own bootstrap: auth refresh + me, filters, loops,
resolutions, catalogue; the workbench's own are the method run, the summary window list, ONE batch-manifests
POST, ONE bundle per run read - G9's 34 polygon artifacts arrive in one response - and the two bucketed
historian trend reads for the context lanes); first chart in **0.9–2.6 s** (G5 1.2 s, G7 1.0 s, G9 2.1 s, G15
2.6 s). Before the redesign G9 was ~50 requests and the G7 view crashed the page. A token refresh crossing the
probe made two gates stall once (`POST /api/auth/refresh` mid-run; the batch fell back to single reads) - an
app-level refresh race noted for the Response/Config follow-up, not a workbench defect.

**Re-audit after the remaining findings (2026-09-17 17:20–17:40, frontend `7c0cb089`, cplm-api `638865f7`):**
`ui-v25-audit.mjs` 18 pages + 3 flows (matrix → inspector → workbench; response → event; config → active
bundle): 0 console errors, 0 failed calls, no horizontal overflow at 1600 px; `ui-v25-gates.mjs` 17 / 17 gate
views, 0 page errors, 12–13 requests per gate, first chart 0.9–2.5 s warm (G5 1.0 s, G9 1.5 s, G14 1.9 s,
G15 2.5 s). The first probe right after recreating cplm-api measured G9 10.3 s / G14 9.2 s / G15 16.5 s - a
cold service (JIT + cold bundle reads), repeated warm at the numbers above. Five probe runs inside 15 min
tripped the gateway's rate limit on `POST /api/auth/refresh` once (429 on the Performance page) - probe
cadence, not a page defect. Screenshots reviewed: System Response (result card, compact rows, censored
candidates counted, steps A–H, key results, catalogue folded), Gate Configuration (property table, tabs,
lifecycle column, deployments timeline), Loop Events (fast conditions with stale opens stated).

**System Response and Gate Configuration measured (`scripts/validation/ui-v25-pages-perf.mjs`, 2026-09-17
18:40–19:30; each step is a cold document load, so the app's own bootstrap - refresh + me, filters, the 177 KB
loop list - is inside every number; an in-app navigation pays none of it):**

| Step | Requests | Bytes | Ready (first chart / property table) | Idle 60 s |
|---|---|---|---|---|
| Response landing | 5 | 180 KB | 0.5 s | 0 requests |
| Response, loop chosen (event list) | 6 | 196 KB | 0.5–2.0 s | 0 |
| Response, one event (result card, 7 charts, aside) | 9 | 239 KB | **1.0–2.6 s** (was **15.3 s**) | **0** (was 3 manifest polls / min) |
| Config landing | 5 | 340 KB | 0.2–0.5 s | 0 |
| Config, loop scope (bundle list) | 5 | 323 KB | 0.4–1.4 s | 0 |
| Config, active bundle, G0 (21 rows) | 7 | 363 KB | **0.3 s** | 0 |
| Config, same bundle, G12 (38 rows) | 7 | 363 KB | 0.2–1.3 s | 0 |

The probe found two cplm-api defects behind the 15 s, both fixed and pinned by tests (`48a36cd4`, `dd09fec6`):
(1) every evidence read (manifest, batch, bundle) resolves the run's location through `MethodRunResolver`,
whose containment probe seq-scanned the short (119k rows) and long result tables - only the fusion table had a
GIN index on `method_run_ids`, and the planner walked `created_at` under `LIMIT 1` even there; the two tables
gain GIN indexes (scripts 53 / `cpm-07-v25-schema.sql`, boot schema parity), the probe runs in a MATERIALIZED CTE
and `response_event` is probed first - a G12 manifest read went 2.3–3.3 s → 0.25 s; (2) the evidence consumer's
minute reconcile joined every unlinked manifest of the day (108k on the lab, 97 % of them, because it looked only
in the fusion table) with a per-row containment probe - a three-minute UPDATE re-run every minute whose lock
queue the reads waited on (a 27 s manifest read; the "cold-start 9–16 s" gate opens recorded above were this) -
it now links per tier from the last 20 minutes of rows, index-joined (`ix_evidence_manifest_unlinked`): 18 ms.
On the lab the two oldest short-table chunks are TimescaleDB-compressed and are decompressed on every short-tier
probe (~0.5 s; prod tables are plain and fully indexed).

**Gateway under a Redis stall - found, then fixed on the user's go (2026-09-17 evening).** The gateway's rate
limiter failed CLOSED on a Redis timeout for the "mutation" class, and `POST /api/auth/refresh` was in that class:
a 1.1 s Redis stall on the lab host (slowlog `INFO replication` 1,139 ms; Redis otherwise 0–1 ms) became a 429 on
refresh, the SPA ended its session, and every in-flight gateway request took +7 s (`/gw/metrics` 6.4 s). Reproduced
on purpose with `scripts/test-gateway-redis-outage.ps1` against the old image (Redis paused 20 s): refresh → **429**,
reads **5,018 ms** each, login **deny-all** (12 × 429). Fixed in three places, each test-first: the gateway
(`RateLimit/*`: a `session` class that fails open, one bounded 300 ms Redis round trip with no backlog, a circuit
breaker, in-process counters so fail-closed means enforced-locally; `tests/gateway.Tests` 17/17), the SPA
(`auth/refreshPolicy.ts` + `authStore.refresh/bootstrap`: a 429 / 5xx / network failure keeps a still-valid token and
retries after Retry-After, a bootstrap retries three times; 9 unit tests) and the docs (`docs/api-gateway.md` §3).
Lab proofs on the new images: `test-gateway-redis-outage.ps1` **9/9 in Pause mode** (refresh 200 during the stall,
reads 321 / 257 ms for the two bounded timeouts then 14–19 ms with the breaker open, login 10 × reach auth-service
then 429 from the local counters, breaker trips and closes, the session refreshes afterwards) and **9/9 in Stop
mode** (connection refused: reads 22–38 ms throughout); `gw-redis-stall-load.mjs` 40 concurrent reads × 3 rounds
under the pause: p99 **395 ms** for the round that paid the timeout, **~50 ms** after, 0 non-200 (was +7 s across
the board); `ui-refresh-resilience.mjs` 6/6 (a page load during the stall lands on the app in 0.97 s with the
refresh answering 200; the SPA's bootstrap rides out two injected 429s in 2.5 s; a 401 still ends the session).
The gateway image joins the v2.5 manifest (stateless recreate). Left as it is, by design: a Redis stall still
costs the first few requests one 300 ms timeout each before the breaker opens.

## Not automated (stated)

- **NR-061 target load**: the spec's declared load (171 loops × 5 s + 20 % quality-only + 5 response events / min) is approximated - the response event rate is bounded by the step simulator (one loop, ~8 min per event). The report says so.
- **Instrumental publisher**: NR-036..045 are proven against the contract simulator (`scripts/sim/instrumental_health_sim.py`), not against Instrumental's own publisher, which does not exist yet.
- **Phased rollout with stop criteria** (spec §5.7 UI): not in this build; a deployment switches its whole scope at the effective time (stated in the workspace).
