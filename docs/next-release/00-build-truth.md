# Build truth — v2.5 baseline (Phase 0)

**Base commit:** `8899c684` on `feat/ot-loop-ingestion` (code identical to the audited `5cec34ef`; the `bkp` commit only removed docs/test-data files). Work branch: `feat/v25-next-release`.
**Date:** 2026-09-16. **Toolchain:** .NET SDK 8.0.421, Node 24.11.1 / npm 11.6.2, Docker 29.6.1; Maven/Java only via `maven:3.9-eclipse-temurin-11` (as `scripts/build-flink-jar.ps1`), lab stack up (`run-all.ps1`).

## Test baselines on the base commit

| Suite | Command | Result | Note |
|---|---|---|---|
| Flink CPLM (Java) | `docker run … maven:3.9-eclipse-temurin-11 mvn -q test` in `src/flink` | **did not compile** before Task 0.1 (`CplmLoopDynamicsAwareTest.java:304,312` referenced `GateFusionCoProcess`; the class is `GateFusionProcess`). After the rename: **30 run, 28 pass, 2 fail** (below). | Confirms tracker "Risks": no engine change was test-covered since the break. |
| ingestion-service | `dotnet test tests/ingestion-service.Tests` | **150 / 150** | (109 methods; theories expand) |
| cplm-api | `dotnet test tests/cplm-api.Tests` | **43 / 43** run alone | **4 failed when run concurrently** with the historian-bff and binding-resolver suites (shared lab Postgres 5433). Run this suite alone. |
| binding-resolver | `dotnet test tests/binding-resolver.Tests` | **5 / 5** | |
| historian-bff | `dotnet test tests/historian-bff.Tests` (+ throwaway `snaptest-redis` on 6390) | **4 / 4** | |
| frontend | `npm test` / `npm run lint` | **22 / 22**, lint clean | `npm run build` verified in Task 0.5 |

## Known-failing Flink tests carried into Phase 1 (not "fixed" by editing expectations)

Both are in `CplmLoopDynamicsAwareTest` and both describe **replay divergence** — spec gap **R19**, reworked in **Task 1G.4** (replay runs become `analysis_run`s with `purpose`, IoTDB source, same kernel and identical materialisation). They are marked `@Ignore` with this reference and must be re-enabled (and pass) in 1G.4.

| Test | Expectation | Observed at base | Root cause in code |
|---|---|---|---|
| `exceptionEventsMaterializeToTheFiveSecondDesignTimeline` | 24 h materialised on a 5 s grid → 17 280 samples | 1 440 samples (60 s grid) | `CplmHistoricalReplayJob.medianPeriodMs :155-169` derives the grid from the window's median inter-sample period clamped to [1 s, 60 s]; sparse exception events → 60 s. The test assumes a fixed 5 s design timeline. |
| `historicalReplayUsesTheNativeFusionEngineWithoutChangingResults` | replay JSON ≡ live JSON | `sample_period_sec` 1.0 vs 5.0, `persistence_agree_count` 1 vs 0, verdict `DETECTED…/0.54` vs `SUSPECTED…/0.89` | same grid derivation (1 s for the dense fixture) **and** `CplmHistoricalReplayJob.java:150` applies the persistence cap with empty history, so a replay can never reproduce a live SUSPECTED verdict. |

## Golden fixtures

`CplmGateEngineSynTic001Test` and `CplmPipelineSynTic001Test` (SYN-TIC-001 golden) **pass unchanged** at base. Any later re-baseline must be recorded here with the tolerance and reason (Task 2C.1 G6 PSD).

## Lab deploy trap found in Phase 1 (adds to CHG-008)

The Flink jar is **baked into the `ams-flink:1.0-SNAPSHOT` image** (`infra/docker/flink/Dockerfile`
`COPY target/ams-flink-1.0-SNAPSHOT.jar /opt/flink/usrlib/`); no container bind-mounts it. Rebuilding the
jar on the host therefore changes nothing in the lab until the image is rebuilt **and** every container
using it is recreated. The proven sequence (2026-09-16):

1. cancel the CPLM jobs (`PATCH /jobs/{id}?mode=cancel`) - otherwise ZooKeeper HA recovers them with the old blob;
2. `docker compose build flink-jobmanager` (rebuilds the image with the current jar);
3. `docker compose up -d --force-recreate flink-jobmanager flink-taskmanager flink-job-supervisor`;
4. the supervisor resubmits the three CPLM jobs from the new image (do **not** also recreate
   `flink-job-submit-cplm` at the same time - the two race and submit duplicates);
5. verify: `docker exec ams-flink-jobmanager sha256sum /opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar` equals the host jar,
   and a fresh short-feature record carries `sourceCommit` (E2E step 9b).

Also seen: after several cancel/resubmit cycles on one TaskManager the Fusion job entered a restart loop with
`NoClassDefFoundError: Could not initialize class org.apache.kafka.common.protocol.Errors` (poisoned
classloader); recreating the TaskManager cleared it. The plant runbook already recreates JM/TM (UPDATE-RUNBOOK).

## 2026-09-16 — Subphase 1G lab deploy notes (run identity, evidence, analysis runs)

- **Schema ships in two ops files now.** `scripts/cpm-07-v25-schema.sql` is additive and safe with the
  old cplm-api running. `scripts/cpm-07b-v25-result-key.sql` swaps the result tables' unique key to
  `(loop_id, window_kind, window_end, source, bundle_hash)` and MUST run with cplm-api stopped, right
  before the v2.5 image starts: the old consumer's `ON CONFLICT (…, source)` needs the old index, the
  new one needs the new index. The lab script `53_cplm_v25_identity_evidence.sql` contains both parts.
- The lab Postgres superuser is `ams_user` (POSTGRES_USER), not `postgres`.
- `analytics.evidence_manifest.gate_result_id` has no foreign key: `cplm_gate_results.id` is not
  unique-constrained on the lab volume (hypertable history); the evidence consumer links it by a GIN
  probe on `method_run_ids` every 60 s instead.
- New Kafka topic `traverse.cpa.clpm.gate.evidence.v1` (8 partitions, 7 d): auto-create is off, so it
  must exist before the v2.5 long job starts (lab: `scripts/kafka-reset-lab-topics.ps1`; plant: 04).
  Chunks are ≤ 256 KiB gzip, base64 in JSON, under the broker's default 1 MiB message limit.
- `bundle_hash` until Phase 3 = `profile:<sha256[:16]>` of the resolved dynamics profile VALUES
  (`identity/ProfileHash`); Phase 3 replaces it with the RFC 8785 bundle hash — same column.
- The historian (`root.<site>.cpm.<loop>.{pv,sp,op,vp,mode}`) stores no quality. A historian-backed
  analysis run (`source=iotdb`) stamps GOOD under an explicit assumption: roles carry
  `quality_native=HISTORIAN_ASSUMED`, `provenance=HISTORIAN`, and the result carries the observability
  flag `HISTORIAN_QUALITY_ASSUMED`. Never a silent default.
- E2E `scripts/test-ot-loop-ingestion-e2e.ps1` is now 28 steps (three 1G steps at the end).
- After `cpm-07b` the planner's statistics still referenced the dropped unique indexes and the
  latest-row probes picked `idx_cplm_gate_results_loop_lower` instead of the `latest_*` indexes
  (`GateReadSqlTests.Latest_gate_row_plan_probes_the_latest_indexes` failed); the swap scripts now end
  with `ANALYZE` on the three tables. The `purpose = 'LIVE'` filter on the probes is served as a
  Filter under the same index scans (verified with EXPLAIN on the lab volume).
- `result_revision DESC` was NOT added to the latest-row ORDER BY (plan 1G.1): every v2.5 row is
  revision 1, and an extra sort key would defeat the CHG-023 probe indexes. Revisit when revisions
  exist (Phase 2 evidence reconstruction), together with the index definition.
- The lab broker had never had `traverse.cpa.clpm.condition.v1` created (declared in the reset script
  at 1D.4, script not re-run): the v2.5 fusion job's condition source failed with
  UnknownTopicOrPartition until the topic was created. Both v2.5 topics now exist on the lab broker.


## 1H — Instrumental NE107 transmitter health (2026-09-16)

- Contract v1 (`contracts/instrumental-health/v1/*.schema.json`, `docs/next-release/instrumental-health-contract.md`) and the lab
  simulator `scripts/sim/instrumental_health_sim.py` (pytest 17/17). Instrumental's real publisher is external: until it ships, every
  plant loop shows `NOT_CONFIGURED` health, which is the intended state, not a defect.
- ingestion-service `INSTRUMENTAL_HEALTH` profile (strict schema, dedupe/conflict, epoch discipline, gateway wrapper) → `traverse.cpa.instrument.health.v1`,
  DLQ `traverse.ingestion.health-dlq`. Tests 11 (suite 212/212). Lab data source: `mqtt://mosquitto-test:1883`, tenant `default`, site `hdpe`,
  allowed source `instr-prm-1`, the three contract topic filters in `profileConfig.mqtt.topics` (the profile needs an explicit `mqtt` block).
- Bindings `cpm.signal_device_binding_history` (btree_gist EXCLUDE) + `POST/GET /loops/{id}/instrument-bindings[?at=]`; mirror tables
  `cpm.instrument_health_observation`, `cpm.device_health_interval`, `cpm.source_availability`, `cpm.loop_health_context` (54 + mirrors + cpm-07).
- Flink `AMS - CPLM Instrument Context Engine` (`CplmInstrumentContextJob`): `DeviceStateMachine` + `HealthEligibilityPolicy` (§4.6 table),
  bindings from the metadata topic (read from EARLIEST on every start, so no republish is needed), contexts on the compacted
  `traverse.cpa.context.instrument-health.v1` keyed by `context_key`. Tests 17. The fusion job takes the contexts as a second keyed side input
  (`FusionSideInput` union with the conditions) — `health_lanes` on every verdict, `HEALTH_NOT_CONFIGURED` / `HEALTH_LIMITED` flags,
  PV `INELIGIBLE` ⇒ `EXCLUDED_INSTRUMENT_HEALTH`. Its health source starts at `earliest()` (compacted, small). Flink suite 114 run / 0 fail / 2 skipped.
- cplm-api `CplmInstrumentHealthMirrorService` (group `traverse-cpa-cplm-health`, single member; `/health` shows it as `health`),
  `GET /loops/{id}/instrument-health[?at=]` and `/history`; before a Flink context exists the API reports the device's own flags/collection/impact
  with eligibility `UNKNOWN` / `NO_CONTEXT_YET` — never derives eligibility itself. `GET /fleet/rankings?health=missing-binding|stale-collection|active-affected`
  filters server-side (unknown → 400). cplm-api suite 96/96 (lab DB).
- UI: `components/Cpm/health/{TransmitterHealthPanel,HealthLane,useInstrumentHealth}`, `api/cpm/health.ts`, header pill in the loop workspace,
  fifth lane in Historical, timeline in Investigation, Performance filter chips (`ObcFilterChip`, event `onChipToggle`). Alert tokens used:
  `--alert-alarm-*` (F), `--alert-caution-*` (S), `--alert-running-*` (C), `--alert-limit-secondary-color` (M). Vitest 51/51; lint clean; build OK.
- Traps hit: the Maven container must be started from PowerShell (Git Bash rewrites `-v host:/container`); Flink classes use the SHADED Jackson
  (`org.apache.flink.shaded.jackson2…`), so any `toJson(ObjectMapper)` shared with `CplmGateResult` must import that one; `CplmGateResult.toJson()` is an
  instance method; a hosted service's constructor dependencies must be registered or the container crash-loops (exit 139) — `/gw/upstreams/cplm-api/health`
  says "Unreachable" in that case; xUnit runs test classes in parallel, so lab-DB tests that share fixtures need one `[Collection]`.
- Deploy trap (2026-09-16): `infra/docker/flink/Dockerfile` only COPIES `src/flink/target/ams-flink-1.0-SNAPSHOT.jar`; `docker compose build flink-jobmanager`
  does NOT compile anything. A lab deploy is therefore: Maven `package` (Docker Maven, from PowerShell) → cancel CPLM jobs → image build → recreate JM/TM/supervisor
  → compare `sha256sum` host jar vs `/opt/flink/usrlib/…` → check the supervisor log for `ClassNotFoundException` (a stale jar submits the old jobs fine and only the
  NEW job fails, so a green "JAR MATCH" is not proof the new code is in). Symptom seen: `AMS - CPLM Instrument Context Engine` → "entry point class … not found in the jar".
- Flink trap (2026-09-16): two identical method references in ONE job class (`filter(Objects::nonNull)` on two streams of different
  element types) are serialized as lambdas and deserialized on the TaskManager through the class's `$deserializeLambda$`, which matches
  on the implementation method only - both filters resolve to the FIRST one, whose bridge casts to the other stream's type
  (`ClassCastException: LoopBindings cannot be cast to HealthObservation`, job RESTARTING, task `…bindings-source -> Map -> Filter`).
  Use distinct lambdas (`o -> o != null`, `lb -> lb != null`) per stream. The job compiled, its tests passed and the jar digest matched:
  only the supervisor/JobManager exception list shows it - the lab deploy script now prints the CPLM job states after submission.
- Evidence path on the lab (2026-09-16): `traverse.cpa.clpm.gate.evidence.v1` had 0 records and `analytics.evidence_manifest` 0 rows after hours
  of running - not a defect: `LongEvidence.artifacts` emits only for long windows that CONTAIN a G10 limit-dwell or G11 freeze episode, and the
  lab's simulated loops never froze or saturated (8,265 long rows, none with `dwell_events`/`freeze_events`; the only LIMIT_LOW conditions were
  a 2026-09-08 test loop). `scripts/sim/loop_freeze_sim.py` (frozen PV + OP at the low limit for one registered loop while an
  MQTT_LOOP_SAMPLES data source is active) exercises it; the slice-1 E2E's evidence step is strict whenever an episode-bearing window exists
  and says "unexercised" otherwise (`-WaitForEvidenceSec` polls for one). Phase 2C.1 makes every long window evidence-bearing (series artifacts).
- Flink trap (2026-09-16, found on the lab, invisible to unit tests): a value class carried inside `CplmGateResult` between CHAINED operators
  (join → serialize) is rebuilt by Flink's chained copy; a non-POJO (`final` field, no no-arg constructor, `Collections.unmodifiableMap`)
  came back with a null map and the fusion job went RESTARTING on `NullPointerException` (`HealthLanes.configured`). Result-carried classes
  must be Flink POJOs: public no-arg constructor, public mutable fields, plain `TreeMap`/`ArrayList`, and readers that tolerate null.
  The root exception in the JobManager REST API loses its frames after a few fast throws (`OmitStackTraceInFastThrow`); the TaskManager
  log keeps the first occurrence with frames (`docker logs ams-flink-taskmanager | grep -A20 NullPointerException`).
- Device state machine (2026-09-16): an identical state observed again (heartbeat snapshot, event restating the post-state) refreshes the
  interval; it no longer opens a new one. Loop-context CLOSE records are rendered too, so `cpm.loop_health_context.to_at` gets filled.
  The fleet health filters judge the newest context per role (DISTINCT ON), not "any row without to_at". The API's source-availability
  read follows receipt order (`received_at`), not the producer's `since`.

## 2A/2B — G12 system response (2026-09-16)

- Kernel `com.ams.flink.cplm.response.*` (2A.1-2A.6, six commits f3a91c84..79305f58): exact ZOH simulation (Padé expm; no 1/(τ1−τ2)), observed
  metrics with censoring (§2.5 numbers pinned: t10 6.1072, t90 50.0517, 2 % settle 82.24), safe triggering + capture state machine (§2.4),
  bounded OE with delay profile / integrating adapter / closed-loop ARMAX PEM / legality registry (§2.7), holdout validation with free-run
  AND one-step errors, named uncertainty methods, controller adapters, model-domain frequency outputs, SIMC advisory (§2.8-2.9), `G12Result`
  with all 52 catalogue quantities (null WITH reason) and the §2.10 artifacts. Estimator tolerances: the noise-free spec curve is recovered
  exactly (3.000 / 4.001 / 19.999); noisy recovery is asserted within the fit's OWN standard errors — anything tighter is the false precision
  the spec forbids. A bound counts as hit only on both yardsticks (fraction of the range AND of the parameter's own scale).
- Job `AMS - CPLM Response Engine` (2B.1, 3599d519): keyed `ResponseCapture` + inline `ResponseEvaluator`; results on
  `traverse.cpa.clpm.response.results.v1` keyed by loop_id; evidence on the gate-evidence topic keyed by method_run_id; the previous COMPLETE
  event of a loop is the independent validation holdout. G12 settings come from job args (`--g12-*`, spec commissioning defaults) until Phase 3;
  their content hash is the G12 `bundle_hash` (`g12:<sha256[:16]>`). Registered in all five submit paths; topic declared for lab + plant.
- cplm-api (2B.2, 01e8122a): script 55 (+ 03 / cpm-07 mirrors), verbatim `ResponseResultStore`, consumer `response` (group
  `traverse-cpa-cplm-response`), `/loops/{id}/response-events`, `/response-events/{id}`, `/loops/{id}/models?at=`, `/models/{id}`,
  `POST /models/{id}/review` (If-Match on revision, audited, review survives job re-delivery). `ResultIdentityUuid.V5` = Flink's `RunIdentity`
  derivation (RFC vector pinned on both sides).
- Lab finding (fixed before commit): after a publisher stopped mid-capture and 40 min of silence, a clean scenario produced NO event. The
  ring kept the pre-gap samples, the detector returned the OLD step first, and the "already captured" guard ended detection there. A gap longer
  than `maxGapS` is a break in support (§2.7): the ring now restarts after it and already-captured candidates are skipped rather than terminal.
  Regression test `aScenarioAfterALongSilenceIsCapturedNotSwallowedByTheGap`. Lab publishers: `scripts/sim/loop_step_sim.py`
  (`input-test` = the §2.11 FOPDT, `servo-step`, `integrating`); 1 s or 5 s cadence both yield 12 tuples/min on the 5 s grid.
- Lab fact (2026-09-16): the first G12 proof scenario overlapped a jar deploy; the Response Engine restarted 3 min into the scenario, its keyed
  state (ring + open capture) was rebuilt empty from the committed offset and the new instance saw only the settled tail — no event, correctly.
  The job checkpoints every 5 min: a capture younger than the last checkpoint does not survive a restart (it is neither emitted nor censored).
  Phase 4.2's reliability scenario must prove the checkpointed path ("restart from checkpoint → the open capture continues"); the JM UI shows
  container-local time (UTC+4) — compare with the DB's `now()` before reasoning about ordering.
- Lab finding 2 (2026-09-16, the real reason the stable job produced no event): every FIC10302 tuple carried `vp: 29.33` with
  `roles.vp.held=true, age_ms≈7,000,000` — a positioner value held for two hours from the earlier soak next to a fresh OP. The response job
  took "VP present" as "VP is the applied input" (`s.vp != null`), so `u_applied` was frozen at the stale VP and the OP step 40→45 was
  invisible; the earlier CENSORED events were only ever closed by the next run's first sample tripping the time gap. The codec already
  says when VP is evidence (`vpEligible`: mapped, GOOD, not held past `vpMaxAgeS`); the job now asks that, with the limit as its own
  setting (`--g12-vp-max-age-s`, default 60 s, part of the G12 bundle hash). A change of applied-input source (VP going stale, or a
  stale VP coming back) is a gap in the applied-input support: an open capture is CENSORED SOURCE_GAP at the last sample before it and
  the ring restarts, so the switch between the OP and VP scales can never read as an input step. Tests:
  `aStaleHeldVpIsNotTheAppliedInput_theOpStepIsCapturedOnTheOpPath`, `theVpTurningStaleDuringACaptureCensorsItAsASourceGap`,
  `aPositionerFeedReturningWhileIdleIsNotAnInputStep`.
- Tooling trap (same day): a "traced" jar was never on the lab — `target/ams-flink-1.0-SNAPSHOT.jar` (21:00) predated the trace edits
  (21:30) and the deploy had run before them. The scratchpad deploy script now refuses a jar older than any `src/main` file. Rule: after
  ANY source edit the proof is the jar's mtime vs the newest source, not the deploy log.
- Lab proof, first COMPLETE G12 event (2026-09-16 18:07Z, FIC10302, `input-test`): `INPUT_TEST | COMPLETE | EVALUATED |
  RESPONSE_CHARACTERISED | CANDIDATE | OP_TO_PV`; process_gain 2.9999 ± 0.00003 (true 3), time_constant 19.994 ± 0.001 s (true 20),
  dead_time 2.84 ± 2.5 s (true 4; the uncertainty is the 5 s grid's half-step floor), t63 22.9 s, t90 48.7 s, 12 evidence artifacts
  COMPLETE in `analytics.evidence_manifest`, a FOPDT `analytics.system_model` row CANDIDATE. Three quantities on that real capture
  exposed kernel defects the synthetic tests had not, all fixed test-first the same day:
  1. `t10` null: the tuples sit on an irregular grid (0, 4.1, 11.1, 16.1 … s after the step — the ingestion stamps the newest
     member's time), the 10 % crossing fell at 5.1 s and NO sample lay inside its 5 s dwell, so `Crossings.sustained` refused it.
     Sustained now means observed at the sampling resolution: every valid sample up to the dwell's end is above the level and the
     first valid sample at or after it is too; a declared record end no longer vouches for an unobserved dwell (the converse defect).
  2. `settle_response` right-censored on a capture the job had closed as settled: the capture's close test was a 0.5 EU range over
     the tail dwell while the spec's settle band (B_resp = 0.3 EU here) had only 105 s of tail. The capture now closes only when the
     tail is a stable endpoint support AND inside B_resp around its median for the whole tail dwell — the metric can then never be
     censored by construction on a COMPLETE capture. Cost: the capture ran ~15 s longer on this scenario.
  3. `pre_slope` and `post_slope` were catalogue quantities nobody produced (always "INSUFFICIENT_SUPPORT"): pre_slope is now the
     Theil-Sen rate of the valid pre-support; post_slope the Theil-Sen rate of the tail beyond the estimated delay on integrating /
     ramp paths only (catalogue support rule), else NO_VALID_SLOPE.
  Also: `peak_time`/`peak_pv` reported the LAST sample of a monotone response as its peak; a peak is now qualified exactly as the
  decay-ratio code qualifies one (an excursion beyond the endpoint by more than the band), else NO_QUALIFIED_PEAK.
  Tuple-grid fact for the record: 108 of 109 intervals in the window were 5.0 s; the others 3.0/4.1/6.0/7.0 s (newest-member time).

## 2C — exact intermediates and the G6 Welch PSD (2026-09-16)

- 2C.1a (c0e672dd): every long-window calculator retains the intermediates its gate used (ACF arrays with lag seconds and pair
  counts, per-cycle fits incl. rejected cycles with reasons, Horch lag structure, cycle polygons + corner masks, saturation and
  delta-PV masks) on a transient `LongIntermediates` companion — no published scalar changed (goldens byte-identical).
- 2C.1b: G6 is a Welch PSD in signal^2/Hz (Hann, declared overlap, power-of-two FFT, one-sided, window-power corrected; Parseval
  within 2 % asserted). Every legacy scalar keeps its name and is derived from the PSD: bin "amplitude" = sqrt(psd·df), peak ratio =
  main-lobe energy / band energy (a Hann line occupies a lobe, not a bin; lobe half-width scales with the zero-padding factor),
  harmonic ratios from those amplitudes, entropy over the band energy with each lobe merged into one component (a windowed line is
  ONE component: a pure sine stays ≈ 0, noise ≈ 1). **The segment follows the band:** one segment spans ≥ `g6BandCyclesPerSegment`
  (4) cycles of the profile's `tauMaxS`, floored by `g6SegmentSamples` (256) and capped by the record (then one Hann periodogram of
  the whole window). A fixed 256-sample segment (21 min at 5 s) had folded SYN-TIC-001's 2700 s cycle onto bin 1 (1280 s) — caught
  by measuring, not by the golden, which pins fusion outputs only.
  G6 movement on SYN-TIC-001 (op shape signal, 24 h at 5 s; old naive DFT → Welch PSD): peak period 2700.0 → 2685.9 s (one padded
  bin: 2700 s is bin 60.68 of the 32768-point zero-padded record), peak ratio 0.9855 → 0.9673, harmonic amplitude ratio 0.151 → 0.121,
  harmonic energy ratio 0.0139 → 0.0098, spectral entropy 0.0144 → 0.0315, peak-to-median 1.0e6 → 2.2e5 (gate ≥ 3 either way), peak
  "amplitude" 4.86 → 2.00 (a different quantity now: the RMS in the peak bin, not the sine amplitude — the UI must read the PSD).
  Fusion outputs (confidence 0.89, SUSPECTED_FINAL_ELEMENT_NONLINEARITY, VALID period from ACF) unchanged; golden tests unchanged.
- 2C.1c (19727d1d, f83688d6): every gate emits its exact intermediates as artifacts with the workbook's field names
  (`GateArtifactsTest` parses `xlsx_Gate_evidence.tsv`). Artifacts gained named per-sample columns with units and legends
  (categoricals ride as codes, never strings in the payload); the chunker encodes them after x / y / mask; units and legends
  also sit inside the manifest provenance because the store persists `columns` + `provenance` only. Live emission policy:
  `--evidence-emit episodes|all|none` (default episodes = results with a finding); everything else is reconstructable on
  demand. Lab: the first G0 manifests showed FIC10302's two-hour-old held VP as accepted - the artifact exclusion now applies
  the codec's over-age rule (HELD_OVER_AGE). Volume note for the plant: a 24 h TIC long window carries ~30 cycle-fit artifacts
  and a 16k-bin PSD; with `episodes` the lab produced ~30 manifests/hour for one probe loop with findings.
- 2C.2 (38f42e73, 8dd09e33): `GET /method-runs/{id}` resolves through any tier's row or a response event; the evidence
  manifest carries a content ETag (If-None-Match -> 304), a readiness summary and always the reconstruction action;
  `GET /evidence/{id}/chunks/{n}` serves bytes with the chunk SHA-256 as ETag and `private, immutable`; PENDING 409, EXPIRED
  404 EVIDENCE_EXPIRED; `X-Auth-Sites` scope (403). Reconstruction: `POST /analysis-runs {purpose: EVIDENCE_RECONSTRUCTION,
  methodRunId}` runs the replay jar in a bounded mode over exactly the run's support and emits the gate's artifacts under the
  SAME method_run_id. **Lab finding:** the first reconstruction produced its 3 manifests under a DIFFERENT run id: the streaming
  jobs resolve profiles under the registry's broadcast parameter set (engineering ranges), the replay resolved from the bare
  spine, so the bundle hash differed (`profile:ef9abb…` vs `profile:65efce…`). The reconstruction now reads the compacted
  metadata topic to its end in the driver and applies every update before computing (`readParameterUpdates` /
  `applyParameterUpdate`), and `GET /analysis-runs/{id}` reports `reconstructionOutcome` = ATTACHED |
  IDENTITY_MISMATCH_CONFIGURATION_CHANGED | NO_EVIDENCE_YET with the attached count - a registry change since the original
  run is reported, never hidden. Proof on the lab: manifest ETag/304, chunk ETag/304/immutable, 61x6 f64 columns decoded
  from the chunk stream (cumulative IAE reproduced), G12 refused 422.
- 2C.2 lab cycle (a7d7b2a7, 117a9622): reconstruction identity parity PROVEN - after the replay applies the registry's
  broadcast parameter set, the rebuilt G5 artifacts carry the original run id and bundle hash (`profile:ef9abb…`).
  Retention cycle PROVEN: evidence expired (404 EVIDENCE_EXPIRED + reconstruct hint) → POST reconstruction 202 → FINISHED,
  3/3 manifests attached (`reconstructionOutcome=ATTACHED`) → all COMPLETE, chunks served again. Two pre-existing
  recompute-path defects fixed on the way: the named jar-upload HTTP client was still under the factory's default 10 s / 30 s
  resilience budget (a 45 MB upload or a slow job-graph build failed with a 500 while the retry had actually submitted the
  job - the run stayed CREATED); the JobManager client is now a plain long-lived HttpClient with a six-minute ceiling. And an
  EXPIRED / FAILED manifest could never return to COMPLETE (the store ignored re-delivered manifests, the consumer skipped
  assembly for those states) - a re-delivery now revives it.
- **Phase 4 reliability item (found here):** every bounded replay / reconstruction submitted through the REST API loads the fat
  jar in a fresh user-code classloader; on the lab the TaskManager died of `OutOfMemoryError: Metaspace` on the second bounded
  submission of a session at the 256m default (all streaming jobs restarted from checkpoints; the bounded job failed). The lab
  compose now gives the TM 512m metaspace / 2560m process size (the plant compose is a runbook decision); the leak itself
  (which classes pin the classloader - Kafka JMX reporters and shaded Jackson are the usual suspects) must be found or the
  number of submissions per TM lifetime bounded before v2.5 ships. The recompute path existed before v2.5 (CHG-008); the
  reconstruction feature makes it a routine operation, so this is a release blocker, not a footnote.

## 2D / 2E / 2F / 2G — workbench, response workspace, G13, loop model (2026-09-17)

- 2D (a5cdf73c, 7af35971): `GET /gate-catalogue` is the build's own 17-entry catalogue (G2r included, one row per gate, method id +
  version + artifact kinds + capability state); `analytics.investigation_reference` (56) pins evidence with an explicit outcome
  (`WORK_COMPLETED | PERFORMANCE_RESTORED | INCONCLUSIVE`, default INCONCLUSIVE - completed work is not restored performance).
- 2E (8ec77afb … c00629e9): the browser only renders. `CpmChart` refuses mixed units on one axis and null bridging; a held series
  steps; a band's meaning is part of its name; every time is the site zone from the registry (`timezone`, UTC when undeclared).
  The workbench selection is the URL (`/cpm/evidence?loop=&methodRun=&gate=&mode=`) and never `useLatestGates`; "go to latest"
  is an explicit navigation to a new selection. The artifact codec verifies every chunk SHA-256 before anything draws; a mismatch
  is a stated state. `ResponseWorkspace` (`/cpm/response`) lists rejected and censored events with their reasons and draws only
  the kernel's G12 artifacts; the prediction interval carries `lower` as a COLUMN (Java arrays leaked into provenance as
  `[D@…` before 7854ebb1) and list provenance is `;`-joined (c73ef24d) because the manifest stringifies values.
  The 2E.3 workspace classes had no CSS until 2E.5 (`styles/cpm-evidence.css`, OpenBridge tokens only).
- 2F (47dfbaa0, a8d6df4e, 43b83a25, 22e56fa5): G13 is the LONG tier's aligned peer analysis. The long job connects the registry
  broadcast a second time (`CplmPeerFanoutSupport`): every sample is emitted once for its own loop (stamped with its configured
  peers) and once per loop that lists it as a peer (`peerOfLoopId`), keyed under that loop into a separate `peerBuffer`
  ListState with the same 24 h retention. `InteractionMath`: nearest-sample alignment within 0.75 grid, shared support mask,
  normalised cross-correlation over ±`g13LagMaxS` (periodic lag ambiguity resolves to the SMALLEST lag within 2 % of the peak
  |r| - a pure sine peaked at 510 s for a 60 s delay otherwise), Welch magnitude-squared coherence (`WelchPsd.cross`) in the
  loop's band [1/tauMaxS, 1/tauMinS]. Association needs coherence ≥ `g13CoherenceMin` (0.6) AND |peak r| ≥ `g13XcorrMin` (0.5)
  on ≥ `g13MinCompatibleSupportS` (1800 s). The summary rides the long results JSON (`interaction`) and the fused row; the
  arrays become artifacts under the long tier's G13 method run id, which the fused row SHARES (deterministic per
  loop/support/bundle) - so `ResultIdentity.LONG_GATES` now names G13 and the fused row writes no second record. Fusion: the
  disturbance soft-block fires only on `INTERACTION_DETECTED`; the old "peer link ⇒ G13 PASS" contract test is re-stated, not
  fixed. Bounded replay has one loop's samples: a reconstructed long run reads G13 `LEGACY_FLAG_ONLY`.
  `CplmGateResult` (516 lines) split into `CplmGateResultFields` + the JSON writer. Fixture trap: `FusionEvidence` counts
  actuator stress from `effortRatio ≥ 2 × effortRatioFloor` (TIC floor 0.03) and `opRangePct ≥ opTravelFloorPct` (1.0) - a
  "no stress" fixture needs effort < 0.06 and travel < 1.
- 2G (1e7d2b8b … 459bec7e): `cpm.loop_registry` gains the five dimensions + `acquisition` + `classification_source` (57; also in
  the self-heal DDL so a fresh lab volume has them). Resolution is in C# (`LoopModelDimensions.Resolve`): no request ⇒ keep a
  stored EXPLICIT model, else the loop_type preset; a request ⇒ EXPLICIT field by field over that baseline. The bulk path
  encodes the same rule in SQL (a preset never overwrites EXPLICIT). Flink: `cplm.loop.model` on the broadcast sets
  acquisition / topology / command path always and overrides the pack's dynamic class + objective only when EXPLICIT
  (`DynamicClass` gains INTEGRATING_LAG, UNDERDAMPED, UNKNOWN; `integrating` follows the class). `MethodEligibility` reads the
  declared (else observed) grid against tauMinS: G5/G6 LIMITED:BANDWIDTH below `minSamplesPerPeriod`, G12 LIMITED when the grid
  exceeds tauMinS/4; the response job's subgate A reports `sample_grid_s` and, with `--g12-delay-min-s`, its own bandwidth
  verdict. RBE holds are `RBE_HOLD` in G0. `CpmLoopRegistryService` (1866 lines) is now seven partial files.
- Lab deploy 2026-09-17: jar `37d11f25…` (2F + 2G) - all six CPLM jobs RUNNING, no ClassNotFound, cplm-api and frontend images
  rebuilt and recreated. `scripts/test-cpm-v25-slice2-e2e.ps1`: first green run **19/19** on 2026-09-17 04:45 (jar `4ea1da78…`), after five lab runs
  that each found a real defect on the cold lab (watermarks after the peer fan-out; G13 identity and method eligibility on
  excluded fused rows; the streaming capture never superseding on a second step; the fusion job selecting no bundle without a
  site so the tiers' method run ids forked) - all fixed and unit-pinned. Result: CHG-027.

## 3A / 3B / 3C / 3D — governed runtime configuration (2026-09-17)

- 3A (45a8567f, c62cfe66, 2cc34ed5): the 165-property catalogue is generated ONCE from the spec sheet
  (`scripts/gen-property-catalogue.py`) into four identical copies (contract, API embedded resource, jar resource, UI
  generated types) under one `catalogue_hash` - SHA-256 of the Python canonical JSON (`sort_keys, separators=(",",":"),
  ensure_ascii=False`), reproduced in C# (`PropertyCatalogue.HashOf`) and Java (`PropertyCatalogue.hashOf`) with Python's
  float repr rules (`1e-06`, `1000000000000000.0`). Trap: the Write tool resolves `\uXXXX` escapes inside string content - a
  unicode fixture (``) must be built with explicit escapes. Capability is what the RUNNING jobs announce: every job emits
  a `CAPABILITY` record on the ACK topic at start; `BundleProfileMapper` is the only property → setting table;
  `unsupported-in-build.json` names the 78 properties no job reads (`CapabilityCoverageTest` fails the build otherwise).
- 3B (8a0a6084, 9de5eb45, 1b853e89): schema 58; RFC 8785 canonical JSON; resolver / classifier / validator are pure; the
  deployment state machine has TWO windows (`Cpm:ConfigAckWindowMinutes` for the matrix, `Cpm:ConfigProbeWindowMinutes` for the
  pinned-result probe) - a single zero window marked a deployment partial on its first lone ACK before the second could arrive
  (the first NR-051 test found it). A PARTIALLY_ACKNOWLEDGED or ACTIVATION_FAILED bundle may be deployed again under its still-
  valid hash-bound approval. `ConfigLifecycleTests` share the lab database with the RUNNING fleet: the tests snapshot / restore
  `cpm.config_worker_capability` (the first version overwrote three real workers with `jar-A`, and the lab's capability read
  "mixed jars" until the three jobs were restarted to re-announce). FACTORY layer parity: the jar exports the packs
  (`FactoryLayer`, `FactoryLayerParityTest`); pack sentinels below the catalogue minimum (G12.lambda_s 0, G10.limit_dwell_warn_s
  0) are OMITTED so they resolve to NO_VALUE, stated.
- 3C (b3eb83c6, 96036c50): the static `SPINE` is gone. `CplmDynamicsParameterSetSupport.resolve(..., Lookup)` reads the
  operator's checkpointed broadcast state; the metadata envelope reader (`CplmMetadataEnvelope`) and the bounded-job reader
  (`CplmParameterUpdateReader`) share one parser; a parse failure is a `cplm_config_rejected` counter, never a swallowed
  exception. Bundles ride the SAME control broadcast as the registry metadata (one more Kafka source unioned in);
  `BundleBroadcastHandler` verifies the HMAC-SHA256 signature with `CPLM_GATE_CONFIG_KEY` (= `TRAVERSE_SERVICE_KEY`, now on the
  Flink containers in both compose files), validates locally and ACKs / NACKs through a side output sunk to the ACK topic with
  the worker's jar, commit and topology generation (job id / parallelism / restored checkpoint id via `CheckpointedFunction`).
  Java canonicalises byte-identically to the API (`CanonicalJsonTest` carries the API's vectors and a Python-pinned HMAC).
  Selection: LOOP > PROFILE > SITE, by effective-from event time; a window decides at its END (`SignalMath.latestResolvedProfile`,
  was "first") so `window_end ≥ effective_from` uses the new bundle and never a mixed one; `ResultIdentity` stamps the bundle
  hash and the epoch (`context_revision`, previously always 0) and WAITING / WARMUP on windows that began before a
  STATE_BOUNDARY effective time (`evaluation_state`, additive JSON on every tier). A bundle overlays the class pack with its
  SITE / PROFILE / LOOP layer CONTENTS (not the fully resolved block: a SITE bundle must not reset a TIC loop to factory values).
  The sample now carries `site` (the scope key) - `--site` on the job is the fallback. The response job pins a capture to the
  bundle in force at its start (`ResponseJobConfig.underBundle`). Bounded runs take `--bundle-hash / --bundle-properties-b64`
  (shadow runs; reconstructions under the governed bundle behind the run's hash). `CplmJobConfig.forJob()` keeps the
  control-plane settings across the per-job re-creation (the 9-arg constructor silently dropped them). The compiled capacity is
  declared (`ExecutionPlanCapacity`) and the installed plan JSON now ships in the jar (`ExecutionPlanCapacityTest` parity).
- 3D (1b853e89): the workspace renders the server's record and edits requested changes only. `ShadowComparison` materialises the
  before / after gate matrix server-side (SHADOW rows vs the LIVE rows of the same windows) and writes `POLICY_RECLASSIFICATION`
  on the bundle's shadow record only when the numbers moved (a read must not churn the etag).
- Lab findings 2026-09-17: (1) a cold 24 h window fails G0 and the fused row was EXCLUDED before the context gates were stamped,
  so G13 read `LEGACY_FLAG_ONLY` as if an old jar had produced it - the long tier's analysis identity now rides every fused row
  (6bdcfd78); (2) `/capabilities.config` on the lab: `ANNOUNCED`, 6 workers on one jar, catalogue matching, 70 readable ids;
  (3) the security review flagged raw `X-Auth-User` fallbacks in five controllers - a header the gateway never sends; identity
  is now the claims principal the edge-trust handler builds (2cc34ed5).
- Release engineering (1cd299b6 …): `migration/deploy/releases/v2.5.txt` + `!v25-upgrade` steps in `build-release.py`
  (schema → cplm-api stopped for cpm-07b → topics → images → seven jobs → the signing key proven → quality protocol declared),
  `migration/V2.5-DEPLOY.md`, `scripts/set-quality-protocol.py`, `scripts/test-cpm-v25-reliability.ps1`,
  `scripts/cpm-v25-load-probe.py`, `docs/next-release/03-acceptance-evidence.md`. **The bundle build and the tag (4.3) are
  deliberately not run** - the agreed stop point.


## 2026-09-25 — lab redeploy trap, measured

A JobManager recreate with ZooKeeper HA restores every job whose cancel had not reached CANCELED - all seven CPLM jobs
came back from their OLD jar blobs (one was mid-restart-loop when cancelled 8 s earlier), the supervisor saw the names
present and submitted nothing, and `/capabilities` kept naming the old jar. The working sequence: cancel via REST,
poll until every CPLM-family job is CANCELED, only then recreate (or just let the supervisor resubmit from the new
image: 7 RUNNING after 150 s). Also measured: a worker in a 1 s restart loop re-ACKs every retained bundle on each
restart - an hour left ~2,200 ACK records and the config-acks consumer 10 minutes behind.

**Second variant, measured the same evening (21:06):** the cancel-and-wait was right, but the *supervisor container
kept running through the 4-minute jar build* and resubmitted all seven cancelled jobs to the old JobManager from
the old jar; the recreate then recovered those fourteen graphs from ZooKeeper and restored the CPLM ones from
chk-1 - which also exposed the FLINK-25920 announce-source loop (three engines RESTARTING for ever; fixed, see
`AnnounceOnceSource`). The file check (`sha256sum` of the jar inside the JM container) passed while every job
announced the previous jar. Sequence that holds: **stop the supervisor first**, cancel, wait for CANCELED, build,
recreate JM + TM + supervisor, then verify the jar through the `CAPABILITY` records the RUNNING jobs write to
`traverse.cpa.context.gate-config.acks.v1` (`jar_sha256`, `source_commit`) - never through the file.
