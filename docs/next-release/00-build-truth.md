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
