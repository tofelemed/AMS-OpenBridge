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
