# CPLM → Traverse Edge — Phased Build Plan

**Date:** 2026-08-04 · Companions: `traverse-cplm-gap-analysis.md` (evidence), `traverse-cplm-decision-record.md` (choices).
Every item is tagged **REUSE** (Traverse already has it, unchanged) · **EXTEND** (Traverse has it, needs change) · **BUILD** (does not exist).

---

## Shape of the work

| Phase | Goal | Exit criterion |
|---|---|---|
| **0** | Make the stack start | `docker compose up` reaches a healthy stack and `mvn package` produces the jar, both without manual repair |
| **1** | **Golden-loop test green on Traverse** | `CplmGateEngineSynTic001Test` + `CplmFormulaContractTest` pass inside `src/flink`, in CI, on the merged module |
| **2** | Samples flowing, jobs running | A CSV replay through `loop.samples.v1` yields `clpm.gate.results.v1` records whose gate values match the offline validator |
| **3** | Schemas + result consumers | Gate results survive a restart: queryable from Postgres by `(loop, resolution, windowEnd)`; series in IoTDB with declared types and TTL |
| **4** | Asset edges + loop registry + onboarding API | A loop onboarded through the API produces a diagnosis with G13 **evaluated**, not `NO_UPSTREAM_LINKS` |
| **5** | CPA API module | All A1–A16 endpoints serve real data; readiness checklist reflects true observability |
| **6** | Live + historical wiring | Loop badges on the Sparkplug live plane; evidence trends that do not alias oscillation |
| **7** | Frontend | The twelve screens on real data |

Phases 3–5 can overlap. Phase 1 gates everything.

---

## Phase 0 — Repair the ground you are standing on

**Nothing below is CPLM work.** It is the cost of discovering that the documented one-command startup does not run as committed. Do it first or Phase 1 will look like a CPLM failure.

| # | Item | Type | Detail |
|---|---|---|---|
| 0.1 | `docker-compose.lab.yml` missing | **BUILD/FIX** | `scripts/start-ams-docker-full.ps1` passes `-f docker-compose.lab.yml` on **every** compose call; the file does not exist (`infra/docker/` holds only `docker-compose.yml` and `docker-compose.sims.yml`). `run-all.ps1` wraps this script. Either create the overlay or drop the flag. |
| 0.2 | Flink submit parameter-binding bug | **FIX** | `scripts/stabilize-ams-e2e.ps1:31` passes `-RawOpcStartingOffsets` to a function whose parameter is `$RawAlarmsStartingOffsets` ([AmsFlinkJob.ps1:47-48](../../scripts/lib/AmsFlinkJob.ps1#L47-L48)). Not a valid prefix → PowerShell binding throws at "Deploying Flink alarm job". |
| 0.3 | Container-name drift | **FIX** | Same script waits on `ams-api-v3`/`ams-frontend-v3`; compose names them `ams-api` ([docker-compose.yml:447](../../infra/docker/docker-compose.yml#L447)) and `ams-frontend` (`:505`). Waits always time out. |
| 0.4 | Postgres password split-default | **FIX** | Postgres is *created* with `${POSTGRES_PASSWORD:-postgres}` (`:49`); ams-api and both Flink services *connect* with `${POSTGRES_PASSWORD:-supersecurepassword123}` (`:356`, `:407`, `:464`). **`infra/docker/.env` is git-untracked** — only `.env.example` is committed, and it contains the literal `CHANGE_ME_USE_32_CHAR_RANDOM_STRING`. On a clean clone the stack cannot authenticate. Unify the default. |
| 0.5 | ~~Flink Prometheus plugin never staged~~ | **RETRACTED — the finding was wrong** | Verified against the running cluster: `flink:1.18.1-java11` already ships `/opt/flink/plugins/metrics-prometheus/flink-metrics-prometheus-1.18.1.jar`, and both JM and TM serve metrics on :9249. No change was needed. The "fix" (`ENABLE_BUILT_IN_PLUGINS`) was briefly applied and **reverted** — the image has no copy in `/opt/flink/opt`, and the entrypoint's `copy_plugins_if_required()` does `exit 1` when the named plugin is missing there, so it would have killed both Flink containers on next recreate. Only the TaskManager host port (`9250:9249`) was kept, for manual state-size inspection in Phase 2. |
| 0.6 | Build toolchain | **EXTEND** | `java` and `mvn` are not on PATH on this machine. `scripts/build-flink-jar.ps1:12` already builds in `maven:3.9-eclipse-temurin-11` — make that the only supported path and wire it into CI. |
| 0.7 | Jar-path landmine | **REUSE (document)** | The jar is **bind-mounted**, not uploaded ([docker-compose.yml:363](../../infra/docker/docker-compose.yml#L363)). If `src/flink/target/ams-flink-1.0-SNAPSHOT.jar` is absent, Docker creates a **directory** at that path and every job silently fails. `GET /jars` returns empty, so `FlinkRestClient`'s `POST /jars/{id}/run` path can never work — CPLM's replay job must be submitted with `flink run`. |
| 0.8 | **PowerShell scripts unparseable under PS 5.1** *(found during Phase 0, not in the original audit)* | **FIX** | 10 scripts — including `start-ams-lab.ps1` (the largest launcher), `run-v2-validation.ps1`, `e2e-full-system-test.ps1`, `run-e2e-tests.ps1` and `production-acceptance-test.ps1` — **failed to parse under Windows PowerShell 5.1**, which every script in this repo declares via `#Requires -Version 5.1`. Cause: the files are UTF-8 **without a BOM** and contain non-ASCII characters (em-dashes, box-drawing). PS 5.1 falls back to the ANSI codepage for BOM-less files, mangling each multi-byte character into 2–3 characters; where one landed inside a quoted string it broke the string terminator and cascaded. `scripts/Invoke-AmsGoldenStartupVerify.ps1` additionally contained **double-encoded mojibake** (`â€”` in place of an em-dash) — evidence the file had already been through one bad decode/re-save cycle. |

**Exit:** `docker compose -f docker-compose.yml up -d` reaches healthy for postgres, kafka, flink-jobmanager, flink-taskmanager, iotdb, redis, emqx; `flink list` shows the three baseline jobs; Prometheus shows `flink-jobmanager` **up**; every script in the startup path parses under PS 5.1.

**Disruption risk:** low. All of this is already broken; fixing it cannot regress a working path.

### Phase 0 status — applied 2026-08-04

| Item | State | What changed |
|---|---|---|
| 0.1 | **done** | `Invoke-Compose` now builds the `-f` list from files that exist, via `Get-ComposeFileArgs`; overlays are opt-in through a new `-ApplyOverlay` parameter (plumbed through `run-all.ps1`). The stale echo of a three-overlay command line now prints the real one. |
| 0.2 | **done** | `Ensure-AmsFlinkAlarmJob` gained `[Alias("RawOpcStartingOffsets")]`, which fixes **all** call sites at once; the three Traverse callers (`stabilize-ams-e2e.ps1`, `autonomous-ams-validation.ps1`, `start-ack-test.ps1`) also renamed to the canonical `-RawAlarmsStartingOffsets`. |
| 0.3 | **done** | Waits now target `ams-api`/`ams-frontend` (was `*-v3`), and `ams-flink-taskmanager` was added. |
| 0.4 | **done** | All 11 Postgres credential sites unified on `${POSTGRES_PASSWORD:-supersecurepassword123}`. Chosen over `postgres` because it matches the committed `appsettings.json` and therefore any existing volume. Verified: with `.env` removed, every site still resolves identically. |
| 0.5 | **done** | `ENABLE_BUILT_IN_PLUGINS: flink-metrics-prometheus-1.18.1.jar` added to jobmanager **and** taskmanager; TM now publishes `9250:9249` for manual state-size inspection during the CPLM sizing work. |
| 0.6 | **done** | `build-flink-jar.ps1` now checks Docker is present, removes a stray *directory* at the jar path, propagates Maven's exit code (previously ignored), and takes `-RunTests` for the Phase 1 golden-loop gate. |
| 0.7 | **done** | `flink-submit-iotdb-persistence.sh` and `flink-submit-live-state.sh` gained the `[ ! -f "$JAR" ]` guard the raw-alarms script already had. |
| 0.8 | **done** | UTF-8 BOM added to 33 BOM-less scripts; mojibake repaired in `Invoke-AmsGoldenStartupVerify.ps1`. **69 of 70 scripts now parse under PS 5.1** (was 60). `scripts/replay-kafka-dlq.ps1` is left exactly as committed — it was already broken before this work (backtick-continuation bug at `:283-291`, unrelated to encoding) and is an operator tool outside the startup path. |

**Not yet verified:** a full `docker compose up` bring-up. That kills host processes on ports 8000/3000 and rebuilds images, so it is the user's call to run.

---

## Phase 1 — Golden-loop test green *(the gate)*

The single result that proves the gate math survived the move. It is cheaper than it looks: `CplmGateEngineSynTic001Test` is a **pure JUnit 4 unit test** over `SynTic001ReferenceGenerator` — no Kafka, no Flink cluster, no database.

| # | Item | Type | Detail |
|---|---|---|---|
| 1.1 | Merge the `cplm` package | **BUILD (copy)** | Copy `com/ams/flink/cplm/**` (**21** files) into `src/flink/src/main/java/`. Verified safe: the package has **zero references — imports or fully-qualified — to any other `com.ams` package**. Do **not** copy `com/ams/operator/loop/**` or the diverged `LoopKpiStreamJob`/`LoopKpiResult`. |
| 1.2 | Profile pack | **BUILD (copy)** | Create `src/flink/src/main/resources/cplm/loop-dynamics-profiles.yaml` (246 lines). Traverse's flink module has **no `src/main/resources` at all** today. Parser is hand-rolled regex — **no snakeyaml needed**. |
| 1.3 | Test harness | **EXTEND** | Create `src/flink/src/test/java/`; copy the four `cplm` tests; add `junit:4.13.2` test-scope to [pom.xml](../../src/flink/pom.xml). Surefire 2.12.4 is already declared (`:104-106`) and supports JUnit 4. **This is the only build-file change the port requires.** |
| 1.4 | Reconcile `PipelineConfig` | **EXTEND** | Both forks changed the same constructor — Traverse added `iotdbHost/Port/User/Pass/BatchSize`, CPLM added `jobName/kpiConsumerGroupId/enabledKpis`. Keep **Traverse's** version (its IoTDB fields are load-bearing for a deployed job); CPLM's `cplm` package does not use `PipelineConfig` at all, so nothing breaks. |
| 1.5 | ~~Jackson pinning~~ | **NO ACTION — earlier claim was wrong** | Checked in the merged tree: the `cplm` package imports **only** `org.apache.flink.shaded.jackson2.*`, exactly like Traverse's own jobs. There is no plain `com.fasterxml.jackson` reference anywhere in it. The declared `jackson-databind:2.15.3` stays inert. |
| 1.7 | **CI built the jar on the wrong JDK** *(found during Phase 1)* | **FIX** | `.github/workflows/ci-cd.yml` set `JAVA_VERSION: '17'` while the pom targets 11 and the runtime image is `flink:1.18.1-java11`. `-source/-target 11` on a JDK 17 toolchain still links against the JDK 17 class library, so the jar compiles clean and can throw `NoSuchMethodError` on the cluster — the exact hazard in risk C1. The variable is used only by `build-flink`, so setting it to `11` is contained. |
| 1.6 | CI job | **BUILD** | `mvn -f src/flink/pom.xml test` in the temurin-11 container, as a required check. Without this the regression gate is a one-off, not a gate. |

**Exit criteria (all four):**
1. `CplmGateEngineSynTic001Test` passes — all 20 assertions, including `mae=0.375`, `effortRatio=8.0`, `triangularity=1.0`, `horchOddness=0.999928`, `phaseAreaNormPerCycle=0.5`, `confidence=0.89`, `diagnosis="SUSPECTED_FINAL_ELEMENT_NONLINEARITY"`, `observabilityFlags` contains `NO_VP`.
2. `CplmFormulaContractTest` and `CplmLoopDynamicsAwareTest` pass.
3. `mvn package` produces a single `ams-flink-1.0-SNAPSHOT.jar` containing **both** `com/ams/flink/OpcEventStreamJob` and `com/ams/flink/cplm/CplmShortFeatureStreamJob`.
4. The existing three baseline jobs still submit and run from that jar — **the merge must not break Traverse's alarm pipeline.**

**Disruption risk:** **this phase touches the jar that Traverse's live alarm pipeline runs from.** Criterion 4 is not ceremony. Keep the shade `mainClass` as `OpcEventStreamJob` (submitters pass `-c` explicitly, so it is cosmetic, but changing it changes nothing useful and risks a surprise).

### Phase 1 status — source merge applied 2026-08-04, build BLOCKED

| Item | State | Detail |
|---|---|---|
| 1.1 | **done** | 21 `cplm` sources copied to `src/flink/src/main/java/com/ams/flink/cplm/`. **Every file verified byte-identical to the CPLM source via `cmp`.** No edits of any kind. |
| 1.2 | **done** | `loop-dynamics-profiles.yaml` (246 lines) copied to a newly created `src/flink/src/main/resources/cplm/`; byte-identical. No snakeyaml needed — the parser is hand-rolled regex. |
| 1.3 | **done** | 4 test classes copied byte-identical to `src/flink/src/test/java/com/ams/flink/cplm/`; `junit:4.13.2` (test scope) added to the pom. Confirmed the tests need nothing else: their only non-JDK imports are JUnit and `StreamExecutionEnvironment`, and `flink-streaming-java` is already `provided`, which is on the test classpath. |
| 1.4 | **no action needed** | The `cplm` package never references `PipelineConfig`. Verified by a binary-safe scan for any `com.ams.` reference outside `com.ams.flink.cplm` — zero hits. Traverse's `PipelineConfig` is untouched. |
| 1.5 | **no action needed** | See the corrected row above. |
| 1.6 | **done** | `.github/workflows/ci-cd.yml` already ran `mvn test`, so the golden tests now run automatically. Added a dedicated `-Dtest='Cplm*Test' -DfailIfNoTests=true` step **before** the full suite so gate-math drift is the headline failure, not a buried one. |
| 1.7 | **done** | CI `JAVA_VERSION` 17 → 11. |

**Discipline check:** `git status src/flink` shows exactly one modified tracked file — `pom.xml` (one dependency added). Everything else is new, untracked, byte-identical files. **No pre-existing Java source was edited, and no formula was touched.**

**Blocked on:** Docker Desktop's Linux engine is returning HTTP 500 on every API call, and this machine has no local JDK and no `~/.m2` cache — so `mvn` cannot run at all. Exit criteria 1–4 are therefore **unverified**. Nothing further in Phase 1 can proceed until the daemon is restarted.

One incidental note for whoever builds first: `LoopLiveRbeJob.java` contains a single raw NUL byte, used deliberately as a key separator in a string literal (`p.loopId + "\0" + p.metric`). It is legal Java and byte-identical to source; it only makes `grep` treat the file as binary.

---

## Phase 2 — Samples in, gate results out

| # | Item | Type | Detail |
|---|---|---|---|
| 2.1 | `loop.samples.v1` topic | **BUILD** | 16 partitions, key `loop_id`, `retention.ms=604800000`. **Set the config with a real `--config` flag and verify with `--describe`** — the reset script's config strings are never applied and the broker default is **24 h** ([docker-compose.yml:302](../../infra/docker/docker-compose.yml#L302)). 24 h retention against a 24 h state buffer leaves zero replay margin. |
| 2.2 | Result topics | **BUILD** | `clpm.feature.short.v1` (8), `clpm.feature.long.v1` (8), `clpm.gate.results.v1` (8, 30 d), `live.loop.metrics` (8), `context.parameter-set.v1` (compacted). Add all to `scripts/kafka-reset-lab-topics.ps1` **and fix that script to actually apply `--config`** (EXTEND). |
| 2.3 | CSV replay producer | **BUILD** | Port CPLM's CSV/Excel replay + the deterministic simulator. This is the only sample source that exists on either side — **Traverse has no OPC-UA/DCS bridge** (`src/services/opc-connector/` is one `.dockerignore`, not in compose) and CPLM has no production edge adapter. |
| 2.4 | Submit the four CPLM jobs | **BUILD** | New `flink-submit-cplm.sh` + compose one-shot, following the existing pattern. Note the existing scripts identify jobs **by display-name string** ([flink-submit-raw-alarms.sh:12,35-36](../../infra/docker/flink-submit-raw-alarms.sh#L12)) — use stable, distinct job names. |
| 2.5 | Job supervision | **BUILD** | Traverse has **none** — all three submit containers are `restart: "no"`, `ensure_flink_jobs.py` is manual, and there is no HA JobManager, so a JM restart loses every job. CPLM's long job cannot tolerate that. Either run `ensure_flink_jobs.py` on a timer (cheapest — extend `CORE_JOBS` at `:83-128`) or configure ZK HA. **EXTEND** the existing reconciler; do not write a third mechanism. |
| 2.6 | Slot/memory budget | **EXTEND** | One TaskManager, `taskmanager.memory.process.size: 1024m`, container 1 CPU / 1536M ([docker-compose.yml:382-390](../../infra/docker/docker-compose.yml#L382-L390)), 16 slots. The long job holds up to 24 h of samples per loop in keyed RocksDB state. **Raise TM memory and add TM replicas before any multi-loop run.** Checkpoints go to a local Docker volume — fine for the lab, not for anything else. |
| 2.7 | Checkpoint-config conflict | **EXTEND** | Every existing job calls `env.enableCheckpointing(...)` in Java, overriding the compose cluster settings, and they disagree: 30 s EXACTLY_ONCE, 60 s AT_LEAST_ONCE, 180 s EXACTLY_ONCE, and **two jobs never enable checkpointing at all**. No Kafka sink sets `setDeliveryGuarantee`, so all sinks are AT_LEAST_ONCE regardless. Decide CPLM's setting explicitly rather than inheriting the mess. |

**Exit:** replay the golden CSV → `clpm.gate.results.v1` carries a `SYN_TIC_001` record whose gate values match `SynTic001CliValidator` output offline; Flink checkpoints succeed; no backpressure at target loop count.

**Disruption risk:** the new jobs compete for the same 16 slots as the alarm pipeline on a 1-CPU TaskManager. **Add a TaskManager before this phase, not after the alarm UI goes sluggish.**

---

## Phase 3 — Schemas and result consumers

| # | Item | Type | Detail |
|---|---|---|---|
| 3.1 | `cpm.*` schema | **BUILD** | `loop_registry`, `loop_tag_map`, `loop_tag_catalog`, `loop_config_version`, `threshold_profile`, `loop_group(_member)`. `cpm` is **collision-free** in Traverse (verified). `site` non-null from day one (decision M-A). |
| 3.2 | `analytics.cplm_*` tables | **BUILD** | `cplm_short_feature_results`, `cplm_long_feature_results`, `cplm_gate_results` + `_latest` views. Normalise the `clpm_`/`cplm_` split **now** (decision N-A) — there is no data to migrate. The `analytics` schema already exists in `ams` and is **empty**. |
| 3.3 | Delivery mechanism | **BUILD** | ⚠ Traverse has **three uncoordinated migration mechanisms** and none is a versioned runner. `database/scripts/*.sql` runs **once, on an empty volume only**; EF migrations are **disabled** (compose forces `ASPNETCORE_ENVIRONMENT: Development` and `Program.cs:365-367` skips `MigrateAsync`); only the "self-healing DDL on startup" pattern ([analysis-service/Program.cs:63-85](../../src/services/analysis-service/Program.cs#L63-L85)) re-applies on every deploy. **Follow that pattern** or a schema change means wiping the volume. Renumber CPLM's SQL to 30+ to avoid the 15/17/19/20/21/24 collisions. |
| 3.4 | Result → Postgres consumer | **BUILD** | **No Flink job in Traverse has a JDBC sink** — `flink-connector-jdbc:3.1.2-1.18` is declared and unused. Every existing KPI result goes to Kafka and is broadcast over SignalR **without persistence** ([KpiConsumerService.cs:61-72](../../src/backend/AMS.Api/BackgroundServices/KpiConsumerService.cs#L61-L72)). Build this properly; it is the difference between an evidence system and a dashboard. |
| 3.5 | Samples → IoTDB consumer | **BUILD** | Do **not** copy the existing process-value path: it is one fire-and-forget HTTP request per sample, response discarded, no batching, no retry ([AlarmMetricPublisher.java:264-283](../../src/services/sparkplug-edge-node/src/main/java/com/ams/sparkplug/AlarmMetricPublisher.java#L264-L283)). Model it on the batched, typed alarm sink instead ([IoTDBPersistenceJob.java:71-86](../../src/flink/src/main/java/com/ams/flink/IoTDBPersistenceJob.java#L71-L86), batch 500 / flush 5 s). Tree: `root.<site>.<unit>.<loop>.{pv,sp,op,vp,mode}`. |
| 3.6 | KPI series → IoTDB | **BUILD** | `root.<site>.<unit>.<loop>.kpi.*`. Nothing in Traverse writes derived series today (analysis-service writes to **Redis with a 24 h TTL** and nowhere else). |
| 3.7 | **Explicit historian schema** | **BUILD** | `CREATE TIMESERIES … DOUBLE` for every numeric. Traverse has **zero** `CREATE TIMESERIES` statements, runs `enable_auto_create_schema: "true"`, and has a writer that string-concatenates values into SQL so the type is inferred per-literal. This is the fix the CPLM contract doc asks for — do it here, not later. |
| 3.8 | **TTL** | **EXTEND** | [iotdb-init-ttl.sh](../../infra/docker/iotdb-init-ttl.sh) sets 365 d on `root.ams.site1.alarms` and 90 d on `root.ams.site1.metrics` — but **nothing writes to the metrics tree**; real process values land under `root.<site>.…` with **no TTL and no storage group**. Add `CREATE DATABASE root.<site>` + `SET TTL`. Suggested: raw samples 90 d, KPI series 730 d. Note every statement in that script is `\|\| true`, so failures are silent — **verify with `SHOW ALL TTL`**. |

**Exit:** restart the whole stack; gate results from before the restart are still queryable from Postgres by `(loop_id, resolution, windowEnd)`; `SHOW TIMESERIES root.<site>.**` shows DOUBLE; `SHOW ALL TTL` shows the loop tree.

**Disruption risk:** medium. 3.2 creates tables in the pre-existing `analytics` schema in the shared `ams` database. It is empty today, but qualify every table name — `analytics` is in the database-level `search_path`.

---

## Phase 4 — Identity: asset edges, loop registry, onboarding

| # | Item | Type | Detail |
|---|---|---|---|
| 4.1 | `assets.asset_relationships` | **BUILD (in Traverse)** | `from_asset_id, to_asset_id, rel_type, created_at` with `rel_type ∈ {PEER, UPSTREAM_OF, DOWNSTREAM_OF, CASCADE_PRIMARY, CASCADE_SECONDARY}`. **This is the G13 unlock and it does not exist in any form** — two tables, one `parent_id`, no navigation collections, no relate endpoint. Belongs in `traverse_assets`, exposed by asset-model, because displays and alarm correlation want it too. |
| 4.2 | asset-model routes | **EXTEND** | `POST/DELETE /assets/{id}/relationships`, `GET /assets/{id}/relationships?type=`. Note asset-model has **no scope filtering** (`GET /assets` returns everything regardless of `assetScope`) — decide whether relationships inherit that or tighten it. |
| 4.3 | Signal-role concept | **BUILD** | `cpm.loop_tag_map (loop_id, signal_role, uns_path)` with `signal_role ∈ {PV, SP, OP, VP, MODE}`. Traverse has **no role concept on a tag** — the word means transport role or RBAC role, never signal role. Keeping this in `cpm` (rather than adding a column to `assets.assets`) avoids changing a schema six services read. |
| 4.4 | `loop_type` mandatory | **BUILD** | Traverse tags are named `pump101.discharge_press`, not `FIC10409` — **ISA first-letter inference will fail** and every loop falls to the `UNKNOWN` profile, where the geometry prior is **0.0** and geometry is disabled. Make `loop_type` required at onboarding. |
| 4.5 | Onboarding API | **BUILD** | `POST /api/v1/cpm/loops/activate` + tag mapping + tag catalog. Traverse has **no asset write path in the frontend at all** and **no asset bulk import** (the only CSV import in the repo is for users). |
| 4.6 | Bulk CSV import | **BUILD** | Assets today are populated **exclusively by seed SQL** ([10_…:95-118](../../database/scripts/10_traverse_assets_schema.sql#L95-L118), [15_…](../../database/scripts/15_traverse_assets_2site_plant.sql), [16_…](../../database/scripts/16_pumpstation_20_pumps.sql)). |
| 4.7 | Binding provenance | **EXTEND** | `binding-resolver` **fabricates** bindings from the raw path when asset-model 404s, producing a *different* device id ([PathResolver.cs:74-78,143-183](../../src/services/binding-resolver/Services/PathResolver.cs#L74-L78)) — a loop can appear resolved while pointing at nothing. Surface resolution provenance (`asset-model` vs `fallback`) and fail the readiness check on fallback. |
| 4.8 | Two `binding-resolver` defects | **FIX** | `BuildAlarmBinding` advertises `SubscribeMethod = "SubscribeToAlarms"` (`:236`) — **no such method on `AlarmHub`**. And `binding-resolver/appsettings.json:21` points at `http://historian-bff:5000` while the service listens on **8090**, masked only by the compose override. |

**Exit:** onboard two loops with a `PEER` edge between them; a gate result for either shows `gate13_status` **evaluated** (not `NO_UPSTREAM_LINKS`) and `has_peer_links: true`; the disturbance soft-block demonstrably fires on a synthetic upstream-disturbance case.

**Disruption risk:** 4.1/4.2 change a shared Traverse service and its database. Additive-only (new table, new routes) — but asset-model has no migration mechanism beyond `ALTER TABLE … ADD COLUMN IF NOT EXISTS` at startup ([asset-model/Program.cs:37](../../src/services/asset-model/Program.cs#L37)); extend that pattern rather than adding a fourth mechanism.

---

## Phase 5 — The CPA API module

Deliver as a new `src/services/cpa-api` following the Traverse minimal-API convention (`.RequireAuthorization("<permission>")`, nginx-prefixed), **not** the AMS.Api MVC convention — the Traverse services are the pattern the rest of this stack uses.

| Row | Capability | Type | Note |
|---|---|---|---|
| A1, A2 | Registry CRUD + onboarding | **BUILD** | on Phase 4 |
| A3 | Gate matrix for a window | **BUILD** | reads `analytics.cplm_gate_results` |
| A4 | KPI stream by resolution | **BUILD** | |
| A5 | Signal trend | **EXTEND** | `historian-bff /trend` exists and is server-side decimated — but see 6.3 |
| A6 | Readiness checklist | **BUILD** | must include binding provenance (4.7) and VP presence |
| A7 | Pipeline status | **EXTEND** | `PipelineHealthService` selects the job by **name containing `"Alarm State Machine"`** ([PipelineHealthService.cs:129](../../src/backend/AMS.Infrastructure/Health/PipelineHealthService.cs#L129)) — generalise to a required-job list |
| A8 | Recompute + replay polling | **BUILD** | must use `flink run`, not `POST /jars/{id}/run` (0.7) |
| A9 | CSV ingest | **BUILD** | |
| A10 | Flink jobs/checkpoints | **EXTEND** | `Flink:JobManagerUrl` defaults to `http://localhost:8082` in appsettings (the *host* mapping) and a **third** value is hardcoded at `Program.cs:135` ignoring config entirely — fix while here |
| A11 | Fleet summary/rankings/heatmap | **BUILD** | `AnalyticsController`'s Dapper-over-Timescale approach is a good *pattern* |
| A12 | Event frames | **BUILD** | `analytics.cplm_event_frames`, per decision A-A |
| A12b | Mirror to `raw-alarms` | **EXTEND** | cap severity at **949** (`FloodDetectFilter` drops ≥ 950); register a **distinct `serverId`** (a missing one defaults to a hardcoded GUID shared with the OPC feed) |
| A13 | Per-window metadata | **BUILD** | additive payload bump + `schemaVersion` |
| A14 | Calculations catalogue | **BUILD** | ⚠ do not repeat `analysis-service`'s `GET /analyses/types`, which returns a hardcoded list of capabilities that **have no executor** |
| A15 | Audit read + approval | **EXTEND** | `audit-service` is real and deployed with a hash-chained append-only store — but its **only producer is display-service**, and it emits with a `Null` Kafka key. Alarm ack/shelve emit nothing. Add a CPLM audit emitter. Note WORM/S3 archival is opt-in and **off** in compose. |
| A16 | Live binding lookup | **REUSE** | the one row Traverse satisfies outright |
| — | Close the two anonymous controllers | **FIX** | `ObservabilityController` and `OpcConnectionsController` have **no `[Authorize]`** and there is **no fallback policy** — an unauthenticated caller can submit a Flink job. Fix before CPA endpoints share the host. |

**Exit:** every A-row endpoint returns real data from real stores; no endpoint returns a hardcoded catalogue; the readiness checklist correctly reports `NO_VP` for loops without a VP mapping.

---

## Phase 6 — Live and historical wiring

| # | Item | Type | Detail |
|---|---|---|---|
| 6.1 | `LoopLiveRbeJob` → `live.loop.metrics` | **BUILD (port)** | Per decision C-A. New topic, not `live.metrics`. |
| 6.2 | Edge-node loop branch | **EXTEND** | Add `live.loop.metrics` to the subscription list at [AlarmMetricPublisher.java:107](../../src/services/sparkplug-edge-node/src/main/java/com/ams/sparkplug/AlarmMetricPublisher.java#L107) + a branch. Also **publish DBIRTH for process-value devices** — the metric branch never does (`bornDevices` is reachable only from the alarm branch), so those devices emit DDATA with no birth certificate. And **attach quality as a metric property** at `:290-299`: the UI already reads `m.properties?.quality?.value` and therefore sees a constant `192` today. |
| 6.3 | Decimation that preserves oscillation | **EXTEND** | `/trend` decimates with `last_value(m)` for every non-severity column ([IoTDbClient.cs:68-71](../../src/services/historian-bff/IoTDbClient.cs#L68-L71)). **A `last_value`-decimated PV trend aliases the oscillation** — precisely the evidence CPLM's screens must show. Add min/max/avg envelope output (`max_value`/`min_value`/`avg` per bucket). Without this, U6 and U8 will show a diagnosis of "45-minute oscillation" over a flat line. |
| 6.4 | Multi-series aligned read | **BUILD** | `/trend` accepts one concrete device path; wildcards are rejected. Multiple `measurements` align only **within one device** — an argument for modelling a loop as an IoTDB device with pv/sp/op/vp as its measurements, which makes PV+SP+OP+VP align **for free**. Otherwise the client does N calls and aligns itself, as `TrendCore` does today. |
| 6.5 | Raw paginated read for evidence replay | **EXTEND** | Real cap is **500** ([Program.cs:129](../../src/services/historian-bff/Program.cs#L129)) despite a 10 000 comment; paging is deep-`OFFSET` with no cursor. 24 h @1 Hz = 86 400 samples = 173 pages of degrading scans. Add cursor paging keyed on timestamp. |
| 6.6 | Snapshot-on-open | **FIX** | `loadSnapshot` fires on **MQTT connect**, not on display open ([mqttStore.ts:258](../../src/frontend-ob/src/store/mqttStore.ts#L258); [DisplayViewer.tsx:197-198](../../src/frontend-ob/src/components/Designer/DisplayViewer.tsx#L197-L198)) — a faceplate opened on an already-connected client is blank until the next tick. |
| 6.7 | Snapshot durability | **EXTEND** | Redis runs `--maxmemory 200mb --maxmemory-policy allkeys-lru` — the snapshot store is **evictable**. A paint-on-open contract on an LRU cache is not a contract. |
| 6.8 | As-of recompute | **BUILD** | No point-in-time concept exists anywhere in Traverse. Artifact versioning exists but `AnalysisExecution` **has no version field** and the execute handler never stamps one — do not repeat that: stamp `calculationVersion` + `dynamicsProfileVersion` on every stored window. |

**Exit:** a loop faceplate paints on open with live PV/SP/OP/MODE and a real quality badge; an 8 h evidence trend visibly shows the oscillation the gate detected.

**Disruption risk:** **6.2 and 6.3 change deployed, working components.** 6.2 touches the bridge that carries Traverse's live alarms; 6.3 changes the response shape of `/trend`, which the Designer, `TrendCore`, `TimeSeriesTable` and `TableSymbol` all consume. Version the trend response or add the envelope as opt-in query params.

---

## Phase 7 — Frontend

The CPA UI is a mock-data prototype: no network calls, no typed contracts, single route. Traverse's frontend is React 18 + Vite + **OpenBridge web components**, with zustand + react-query, and — per the repo's own rules — **all UI must be built from OpenBridge components and tokens**. The CPA prototype's styling will not transfer; its *information architecture* will.

| # | Item | Type |
|---|---|---|
| 7.1 | Routing + typed contract layer + API client | **BUILD** — Traverse's historian calls bypass react-query entirely (raw `useEffect` + `Promise.all` in `TrendCore`), and shapes are hand-declared TS interfaces mirroring C# anonymous objects. There is no generated client. Do not inherit that. |
| 7.2 | U1 Overview, U3 Performance | **BUILD** on A11 |
| 7.3 | U2 Explorer, U6 Historical | **EXTEND** — reuse `binding-resolver` + `mqttStore` + `TrendCore`; needs 6.3 |
| 7.4 | U4 Events | **BUILD** on A12; use **OpenBridge alert components** with the ISA-18.2 alert mapping, not custom banners |
| 7.5 | U5 Investigation, U7 Window inspector, U8 Evidence replay | **BUILD** on A3/A8/A13/H2 |
| 7.6 | U9 Calculations, U10 Registry, U12 Governance | **BUILD** on A14/A1/A2/A15 |
| 7.7 | U11 Pipeline health | **EXTEND/REBUILD** — ⚠ `SystemMonitor.tsx` and `EdgeNodeMonitor.tsx` **display hardcoded strings**: `'SignalR Connected Clients' = '3'`, topic lag `'0'`/`'—'`/`'Healthy'`, `status="active"`. Nothing there is measured. Rebuild on A7/A10/P11, and remove the fabricated panels rather than extending them. |

---

## Things that change Traverse's existing behaviour

Flag these to whoever owns Traverse before starting:

| Change | Phase | Blast radius |
|---|---|---|
| Merging `cplm` into `src/flink` and rebuilding the jar | 1 | **The alarm pipeline runs from this jar.** Phase-1 exit criterion 4 exists for this reason. |
| Adding jobs to a 1-CPU / 1 GB TaskManager | 2 | Slot and memory contention with the live alarm state machine |
| `assets.asset_relationships` + new asset-model routes | 4 | Shared service and shared database; additive but schema-touching |
| `/trend` response shape (min/max envelope) | 6 | Designer, `TrendCore`, `TimeSeriesTable`, `TableSymbol` all consume it |
| `sparkplug-edge-node` new branch, DBIRTH, quality property | 6 | Carries Traverse's live alarms today |
| Widening `LoopKpiPayload` (SignalR) | 6 | `alarmStore` subscribes; currently receives nothing, so risk is near-zero today |
| Mirroring frames into `raw-alarms` | 5 | CPLM diagnoses appear in operators' alarm lists — **an operational change, not just technical.** Agree it with the control room. |
| Fixing the Postgres password default | 0 | Any environment relying on the current split |

## Things at risk of disrupting current users

Honestly: **very little, because there are no current users.** 22 commits, one contributor, a lab stack with seeded demo plants, a sine-wave simulator, anonymous EMQX, hardcoded `root:root`, and a launcher that does not run as committed. The disruption risk is to *your own* Traverse development, not to a production control room.

The one genuine caution: the **live alarm path is the most finished thing in this repo** (ingest → Flink state machine → SignalR → OpenBridge UI). Phases 1, 2 and 6 all touch it. Everything else is greenfield.
