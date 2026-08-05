# CPLM → Traverse Edge — Risk Register

**Date:** 2026-08-04 · Companions: `traverse-cplm-gap-analysis.md`, `traverse-cplm-decision-record.md`, `traverse-cplm-build-plan.md`.

---

## The five that decide whether this works

| # | Risk | Severity | Why |
|---|---|---|---|
| **R1** | **There is no process data.** No PV/SP/OP/VP/MODE feed exists, on either side. | **Critical** | Everything else is solvable engineering. This is a missing input. |
| **R2** | **TaskManager cannot hold the long job's state.** 1 TM, 1 GB, 1 CPU vs a 24 h keyed buffer per loop. | **Critical** | The job will not fail cleanly; it will checkpoint-timeout and thrash. |
| **R3** | **No valve position ⇒ nothing ever reaches CONFIRMED.** | **High** | Ships a product whose top confidence band is structurally unreachable. |
| **R4** | **No asset edges ⇒ the disturbance soft-block never fires.** | **High** | Not a missing feature — an active **false-positive** generator. |
| **R5** | **Kafka retention (24 h) is shorter than the state buffer (24 h).** | **High** | Any restart outliving the window loses the buffer with no replay path. |

---

## Compatibility risks

### C1 — Flink/Java version: **no risk. This one is genuinely clean.**

`flink:1.18.1-java11` ([docker-compose.yml:320](../../infra/docker/docker-compose.yml#L320)) against `<flink.version>1.18.1</flink.version>` + `maven.compiler.source/target = 11` ([pom.xml:12-14](../../src/flink/pom.xml#L12-L14)); built-jar manifest `Build-Jdk: 11.0.31`; identical connector versions (`flink-connector-kafka:3.0.1-1.18`, `flink-connector-jdbc:3.1.2-1.18`); no Scala anywhere. Exact match.

⚠ **But `infra/helm/ams/charts/flink/templates/jobmanager-deployment.yaml:34` pins `flink:1.18.1-java17`.** If anyone ever deploys via Helm, the runtime JDK changes underneath a jar compiled for 11. It will mostly work and occasionally not. Helm also uses the pre-1.14 deprecated metrics key `metrics.reporter.prom.class` vs compose's `.factory.class`. **Align or delete the Helm chart** — it currently covers 2 of ~14 services and declares 16 TaskManager replicas with **no taskmanager template at all**.

### C2 — Shading and classloader collisions — **Medium, and the reason to merge rather than co-deploy**

Traverse's shaded jar bundles **~5 383 `org/apache/flink/**` classes** (the connectors, notably `flink-iotdb-connector:1.3.2`, do not mark Flink `provided`), with **no relocations and no `ServicesResourceTransformer`** ([pom.xml:110-145](../../src/flink/pom.xml#L110-L145)). Two consequences:

- The jar's `META-INF/services` entries from Kafka/JDBC/IoTDB connectors silently overwrite each other. This is a latent bug in Traverse today, not something the port introduces.
- Under Flink's default **child-first** classloading, a second fat jar with overlapping Flink internals would win over the cluster's. **Shipping two jars is the risky option; merging into one is the safe one.**

Post-merge, Traverse's jobs use `org.apache.flink.shaded.jackson2.*` while CPLM uses plain `com.fasterxml.jackson` — the declared `jackson-databind:2.15.3` becomes live for the first time. Pin it and re-run the golden test.

### C3 — State sizing — **Critical (R2)**

| Setting | Value | Source |
|---|---|---|
| TaskManagers | **1** (no `replicas`/`scale` key exists in compose) | [docker-compose.yml:371-416](../../infra/docker/docker-compose.yml#L371-L416) |
| TM process memory | **1024m** | `:390` |
| TM container limit | **1.00 CPU / 1536M** | `:382-386` |
| Task slots | 16 | `:391` |
| State backend | RocksDB + incremental ✅ | `:394-395` |
| Checkpoint storage | `file:///flink-checkpoints`, a **local Docker volume** | `:396`, `:21` |
| Already running there | `OpcEventStreamJob` (~11 chained operators at parallelism 2), `IoTDBPersistenceJob`, `LiveStateJob` | `:435`, `flink-submit-*.sh` |

The CPLM contract's sizing driver is `loops × sampleRate × 24 h`. At 200 loops × 1 Hz that is ~17 M buffered samples. **16 slots on one core with 1 GB is not a rounding error away from that — it is two orders of magnitude away.** Failure mode is not a clean OOM: RocksDB will spill, checkpoints will exceed the 120 s timeout, and the job will restart-loop while the alarm pipeline starves for CPU on the same TaskManager.

**Mitigations, in order:** raise TM memory to ≥ 8 GB and CPU to ≥ 2 before any multi-loop run; add TM replicas; move checkpoints off the local volume; **start the pilot at ≤ 10 loops and measure `flink_taskmanager_job_task_operator_*` state size before scaling.** That last one requires C7 fixed first.

### C4 — Kafka retention shorter than the state buffer — **High (R5)**

Broker default is `KAFKA_LOG_RETENTION_HOURS: 24` ([docker-compose.yml:302](../../infra/docker/docker-compose.yml#L302)), and **the topic-creation script's per-topic config is never applied** — the `Config` strings at [kafka-reset-lab-topics.ps1:13-38](../../scripts/kafka-reset-lab-topics.ps1#L13-L38) are not passed to `--create` and never `--alter`ed. So every topic gets 24 h whatever the script says.

CPLM's long job buffers **24 h + 10 min**. Retention equal to the buffer means a job outage of any length loses data permanently. Set `retention.ms` explicitly on `loop.samples.v1` (7 d) and `clpm.gate.results.v1` (30 d), **and verify with `kafka-topics --describe`** — the script will report success either way.

Related: **nothing in Traverse is actually compacted.** `current-alarm-state` is declared `compact` *and* written with **null keys** ([OpcEventStreamJob.java:179-182](../../src/flink/src/main/java/com/ams/flink/OpcEventStreamJob.java#L179-L182)) — compaction is impossible on null-keyed records. Do not assume `context.parameter-set.v1` will compact just because you declare it.

### C5 — Topic-name and schema collisions — **Medium**

- **`live.metrics` is a direct name collision** with CPLM's K6, and the existing topic already carries **two incompatible schemas**: `LiveStateJob`'s alarm RBE payload and the simulator's process-value records. Adding a third would be the third strike. Use `live.loop.metrics`.
- **`analytics` schema already exists** in DB `ams` and is in the database-level `search_path` — empty today, but qualify table names.
- **SQL file numbering collides:** CPLM uses 15/17/19/20/21/24; Traverse has 15/17/18/19/20/21/22/23/24 and already has a duplicate-17 pair of its own.
- `cpm` schema is **collision-free** (verified).

### C6 — IoTDB REST version mismatch — **Low, but real work**

CPLM's contract specifies **REST v1** (`/rest/v1/query`, `/rest/v1/nonQuery`). Traverse is on **v2** everywhere: [IoTDbClient.cs:24](../../src/services/historian-bff/IoTDbClient.cs#L24) and [AlarmMetricPublisher.java:274](../../src/services/sparkplug-edge-node/src/main/java/com/ams/sparkplug/AlarmMetricPublisher.java#L274). Both exist on IoTDB 1.3.2 but the response shapes differ. Port CPLM's historian writer/reader to v2; do not run two conventions.

### C7 — Observability gaps — **downgraded to Medium after live verification**

> **Correction (verified against the running cluster, 2026-08-04).** The original finding claimed the Flink Prometheus reporter was configured but its jar never staged, leaving both scrape targets dead. **That was wrong.** `flink:1.18.1-java11` ships `/opt/flink/plugins/metrics-prometheus/flink-metrics-prometheus-1.18.1.jar` pre-staged, so the reporter loads with no `ENABLE_BUILT_IN_PLUGINS` needed. Confirmed live: the JobManager serves `flink_jobmanager_*` on :9249 and the TaskManager serves 35 `flink_taskmanager_*` series. **Flink metrics work.**
>
> Worse, the "fix" derived from that wrong finding was actively dangerous: the official entrypoint's `copy_plugins_if_required()` does `exit 1` when the named plugin is absent from `/opt/flink/opt` — and on this image it *is* absent, because it lives in `plugins/` already. Setting `ENABLE_BUILT_IN_PLUGINS` would have killed both Flink containers on next recreate. It was added and then reverted; see the Phase 0 status table.

The remaining, still-true gaps are narrower: `historian-bff` is scraped at `/metrics` but has **no metrics package and no `MapMetrics()`**, so that one target really is permanently down; **Grafana has a dashboard provider and zero dashboard JSON files**; Prometheus has **no `rule_files` and the Alertmanager block commented out**, so **no alerts exist at all**; and `SystemMonitor.tsx` / `EdgeNodeMonitor.tsx` display **hardcoded strings** (`'3'` connected clients, lag `'0'`, `status="active"`).

**Net for CPLM:** you *can* measure the long job's keyed-state size and checkpoint duration from day one — which is what C3 needs. You cannot yet be alerted when it degrades.

---

## Operational risks

### O1 — Is Traverse production or shared? **Neither. It is a single-developer lab.**

22 commits, one contributor, branch `phase8-polish`. `run-all.ps1:6-8` describes itself as starting "every **lab** service". Corroborating evidence: seeded demo plants (houston/dallas), a `math.sin` simulator, `EMQX_ALLOW_ANONYMOUS: "true"`, IoTDB `root:root` **hardcoded and un-overridable** in historian-bff ([IoTDbClient.cs:17-19](../../src/services/historian-bff/IoTDbClient.cs#L17-L19) — no appsettings file, compose sets only `IoTDB__RestUrl`), default service key `traverse-internal-dev-key`, bootstrap admin `ChangeMe123!`, `ASPNETCORE_ENVIRONMENT: Development`, floating image tags (`timescale/timescaledb:latest-pg15`, `provectuslabs/kafka-ui:master`, `dpage/pgadmin4:latest`), a lab-purge endpoint shipped in the API, and ~50 lab/E2E PowerShell harnesses.

**This is mostly good news** — the disruption budget is large. The risk is the inverse: **do not mistake this stack for a production baseline.** Nothing here has survived contact with a plant, so "Traverse already handles that" should be checked, not assumed.

### O2 — The documented startup path does not run — **High, and it will be misattributed to CPLM**

Three independent breakages in the launcher chain:
- `scripts/start-ams-docker-full.ps1` passes `-f docker-compose.lab.yml` on **every** compose call; **that file does not exist**.
- It waits on containers `ams-api-v3`/`ams-frontend-v3`; compose names them `ams-api`/`ams-frontend`.
- `scripts/stabilize-ams-e2e.ps1:31` passes `-RawOpcStartingOffsets` to a function whose parameter is `$RawAlarmsStartingOffsets` ([AmsFlinkJob.ps1:47-48](../../scripts/lib/AmsFlinkJob.ps1#L47-L48)) — PowerShell binding throws.
- Health checks send `Authorization: "Bearer dev"` to an RS256-validating API; golden-verify cannot pass, and failure is downgraded to a warning.

Whoever runs `run-all.ps1` on day one of the port will see it fail and conclude the merge broke it. **Fix and re-baseline before Phase 1.**

### O3 — There is no deployment or rollback path — **High**

- Schema delivery is `docker-entrypoint-initdb.d`, which runs **once on an empty volume**. A schema change means wiping the DB, or hand-applying SQL, or following the ad-hoc "self-healing DDL on startup" pattern.
- EF migrations exist and are **disabled** (compose forces Development; `Program.cs:365-367` skips `MigrateAsync`), and `03_apply_ef_migrations.sql:183-190` back-fills `__EFMigrationsHistory` so EF *believes* it is current — silently skipping the Timescale hypertable, compression and retention policy.
- No built service carries an `image:` tag; compose builds from context. **Rollback = rebuild from source.** No blue/green, no pinned versions, no registry.
- `scripts/start-ams-production.ps1` is "production" in name only — it runs the same stack and calls `kafka-reset-lab-topics.ps1 -Force`, **wiping topics on every start**.
- `appsettings.Production.json` is 8 lines with no connection string and no auth config; production would fail at startup.

**Before Phase 3, agree a schema-delivery mechanism.** Adding a fourth uncoordinated one is the default outcome if nobody decides.

### O4 — No job supervision, no HA JobManager — **High for a 24 h-state job**

All three compose submit containers are `restart: "no"` and run once. `ensure_flink_jobs.py` is a real reconciler but is **invoked manually**, never on a timer. There is **no `high-availability` config** — a JobManager restart loses every submitted job. Jobs are identified **by display-name string**, and `AlarmReplayEngine` embeds a UUID in its name, defeating that.

A job holding 24 h of buffered state that silently stops and is not resubmitted is the worst version of this failure: the UI keeps rendering the last window, and nobody notices for a day. **Extend `ensure_flink_jobs.py`'s `CORE_JOBS` and run it on a timer** — do not write a fourth mechanism.

### O5 — Checkpoint configuration is incoherent — **Medium**

Every job overrides the cluster's compose settings in Java, and they disagree: 30 s EXACTLY_ONCE (`OpcEventStreamJob`), 30 s **AT_LEAST_ONCE** (`LiveStateJob`), 60 s AT_LEAST_ONCE (`IoTDBPersistenceJob`, `AnalysisExecutionJob`), 180 s EXACTLY_ONCE (`LoopKpiStreamJob`), and **two jobs never enable checkpointing at all** (`AlarmStateExportJob`, `StateDriftDetectionJob`). No Kafka sink calls `setDeliveryGuarantee`, so **every sink is AT_LEAST_ONCE regardless of the checkpoint mode** — end-to-end exactly-once is not achieved anywhere, despite the compose config claiming `EXACTLY_ONCE`.

Set CPLM's checkpointing explicitly and deliberately; do not inherit by omission.

### O6 — Security posture blocks any real deployment — **Medium now, High later**

Two controllers are **completely anonymous** with **no fallback authorization policy**: `ObservabilityController` (an unauthenticated caller can **submit a Flink job**) and `OpcConnectionsController` (unauthenticated create/update/**delete** on records holding `password_encrypted`). `X-Service-Key` grants **every** permission and compose ships the source-visible default; `docker-compose.sims.yml:16-22` forces `Development` on two services **specifically so the fail-closed check does not fire**. `Security__DisableApiAuthorization` is correctly `false` — but one env flip opens the entire API. Secrets are committed (`Password=supersecurepassword123` in `appsettings.json`, `admin`/`public` in `prometheus.yml`).

CPLM inherits all of this the moment it shares the host.

---

## Data-quality risks *(the ones that produce wrong answers rather than outages)*

### Q1 — No process data at all — **Critical (R1)**

| Field | State |
|---|---|
| `pv`/`sp`/`op` | Exist **only** as fields on `RawLoopData` ([RawLoopData.java:13-15](../../src/flink/src/main/java/com/ams/flink/RawLoopData.java#L13-L15)), a class fed by nothing. `loop-raw-data` has **zero producers**. |
| `mode` | On `RawLoopData` (free text, no AUTO/MANUAL enum). **Absent from `live.metrics` entirely.** No source anywhere. |
| `quality` | Not on `RawLoopData` at all. On `live.metrics` as a **hardcoded `192`**, and **stripped at the MQTT hop**. |
| `vp` | **Does not exist as a field.** Only as an ordinary measurement asset named `position` under a device named `valve01`, with no link to any controller. |
| rate | **2 s**, from a `math.sin` simulator that is **not in the main compose**. |

The only running numeric feed is a sine-wave generator emitting 122 tags at 2 s ([process_value_sim.py:42-80,87-97](../../scripts/sim/process_value_sim.py#L42-L80)) from the opt-in overlay [docker-compose.sims.yml:27-37](../../infra/docker/docker-compose.sims.yml#L27-L37). **A plain `docker compose up` produces zero live process values.**

**Do not build a synthetic-data demo and call it validated.** Sine waves make G5/G6 look excellent and tell you nothing about G7/G8/G9, which is where the actual diagnostic value is. Use CPLM's `SynTic001` generator (which has a real stiction signature with transport lag) for validation, and treat a real plant feed as a hard prerequisite for any claim about accuracy.

### Q2 — Quality is broken end-to-end — **High**

Present at the producer, present at the UI, **dropped in the middle**. `publishMetricDData` ([AlarmMetricPublisher.java:290-299](../../src/services/sparkplug-edge-node/src/main/java/com/ams/sparkplug/AlarmMetricPublisher.java#L290-L299)) builds the Sparkplug metric with **no `properties`**, while the UI reads `m.properties?.quality?.value ?? 192` ([mqttStore.ts:486](../../src/frontend-ob/src/store/mqttStore.ts#L486)) — **always 192, on every live tick, forever.** The NE107/ISA-18.2 mapping in [quality.ts:33-49](../../src/frontend-ob/src/utils/quality.ts#L33-L49) is real, correct, and starved of input. `isBadQuality` exists in `openBridgeTheme.ts` and is **not referenced by `SymbolRenderer`** — the only signal that actually fires is an 8-second staleness timer.

This directly violates CPLM non-negotiable #6 ("never paint a stale Good") and blinds G0, which is a **blocking** gate. **A CPLM deployment on this live plane would show Good quality on a dead sensor.**

### Q3 — No valve position ⇒ CONFIRMED is unreachable — **High (R3)**

G14 caps confidence at 0.89 without `vp`; the diagnosis bands put `CONFIRMED_*` at ≥ 0.90. Ship without VP and the top band is structurally dead — every diagnosis reads `SUSPECTED_*` with `NO_VP` forever. The golden test itself asserts exactly this shape (`confidence=0.89`, flag `NO_VP`), so it is by design — **but users will read a permanent ceiling as a product that never commits.** Either source VP for the pilot loops, or make the ceiling explicit in the UI from day one.

### Q4 — No peer links ⇒ false stiction, not missing detail — **High (R4)**

The disturbance soft-block only fires *"if peer links exist"*. With no `asset_relationships` table, an oscillating loop with no actuator stress is **never** disqualified with `DISTURBANCE_CONTEXT`. You do not get a conservative gap; you get **stiction called on loops being disturbed from upstream** — the single most credibility-damaging error this product can make with control engineers. G13 also reports `NOT_EVALUATED`/`NO_UPSTREAM_LINKS` permanently.

### Q5 — Every loop falls to the `UNKNOWN` profile — **Medium**

Class resolution is: explicit override → declared `loopType` → **ISA first-letter inference from the tag name**. Traverse tag names are `pump101.discharge_press`, `tank01.level`, `hx01.temp_in` — no ISA prefix anywhere. Inference fails, and `UNKNOWN` has **geometry prior 0.0 (geometry disabled)** and τ 5–86400 s (an essentially unbounded band, so `PERIOD_OUT_OF_BAND` almost never fires and period arbitration loses its guard). **Make `loop_type` mandatory at onboarding.**

### Q6 — 2 s sampling degrades the fast classes — **Medium**

At 2 s, FIC (τ_min 10 s) gives 5 samples/period and PIC (τ_min 5 s) gives 2.5 — below the `minSamplesPerPeriod: 8` in the FIC profile. G6's spectral resolution and G7's per-cycle triangle fit both degrade. Slow classes (TIC/PIC_VAPOUR, τ_min 300 s) are fine. **Either source 1 Hz or restrict the pilot to slow loops and say so.**

### Q7 — Decimation aliases the very thing you are diagnosing — **High for the UI, invisible until demo day**

`/trend` decimates with **`last_value(m)`** for every non-severity column ([IoTDbClient.cs:68-71](../../src/services/historian-bff/IoTDbClient.cs#L68-L71)), `width` capped at 2000. Over an 8 h window that is ~14 s per bucket; over 24 h, ~43 s. A `last_value` sample per bucket **aliases** a 45-minute oscillation into something that can look flat or beat at a false period.

So the gate says "oscillation, period 2700 s, regularity 0.9" and the evidence chart next to it shows a flat line. **That is the moment a control engineer stops believing the tool.** Add min/max/avg envelope output before U6/U8.

### Q8 — Historian types are undeclared and TTL is aimed at the wrong tree — **Medium**

Zero `CREATE TIMESERIES` statements exist in Traverse; `enable_auto_create_schema: "true"`; and the process-value writer **string-concatenates the value into SQL** ([AlarmMetricPublisher.java:270-271](../../src/services/sparkplug-edge-node/src/main/java/com/ams/sparkplug/AlarmMetricPublisher.java#L270-L271)), so IoTDB infers the type from whichever literal arrives first — the same measurement can become a different type depending on startup order. This is **worse than CPLM's own FLOAT/DOUBLE inconsistency**, because at least CPLM's is deterministic.

TTL is set on `root.ams.site1.alarms` (365 d) and `root.ams.site1.metrics` (90 d) — but **nothing writes to the metrics tree**; process values land under `root.<site>.<unit>.<device>` with **no storage group and no TTL**. Every statement in that script is `|| true`, so failures are silent. **Declare DOUBLE explicitly, create `root.<site>` storage groups, set TTL, and verify with `SHOW ALL TTL`.**

### Q9 — Results are broadcast, never stored — **High**

Every windowed analytic in Traverse today goes to Kafka and is fanned out over SignalR **without persistence** ([KpiConsumerService.cs:61-72](../../src/backend/AMS.Api/BackgroundServices/KpiConsumerService.cs#L61-L72) → [AlarmHub.cs:368-375](../../src/backend/AMS.Api/Hubs/AlarmHub.cs#L368-L375)). No Flink job has a JDBC sink. `analysis-service` writes computed values to **Redis with a 24 h TTL** and nowhere else.

If CPLM inherits this pattern, "which window produced this verdict, under which profile version" is unanswerable — which is the entire premise of the product. **The result→Postgres consumer is not optional infrastructure; it is the deliverable.**

### Q10 — The alarm store would destroy event frames — **High if A-A is decided wrongly**

Detailed in the decision record. In short: severity ≥ 950 is **silently dropped** ([PipelineOperators.java:353-369](../../src/flink/src/main/java/com/ams/flink/PipelineOperators.java#L353-L369)); frame closure **hard-deletes the row** ([NormalizedAlarmIngestor.cs:138,156,191](../../src/backend/AMS.Infrastructure/Kafka/NormalizedAlarmIngestor.cs#L138)); `alarms.alarm_history` and `alarms.alarm_state_transitions` have **no writers anywhere in the repo**, so the historical API and the ISA-18.2 KPI dashboard read permanently-empty tables; and `ShelveExpiryService` is implemented but **never registered**, so shelves never expire.

A diagnosis that opened Tuesday and closed Thursday would leave no record at all.

### Q11 — Silent binding drift — **Medium**

`binding-resolver` **fabricates** bindings from the raw path string when asset-model 404s ([PathResolver.cs:74-78,143-183](../../src/services/binding-resolver/Services/PathResolver.cs#L74-L78)), producing a *different* device id (`crude1_pump101` vs `pump101`). The code comments on this itself. A loop can therefore look correctly configured while pointing at a topic nobody publishes — and CPLM would report `EXCLUDED_DATA_QUALITY` rather than "misconfigured". **Surface resolution provenance in the readiness checklist.**

---

## What would change my assessment

Stated plainly, because these are the places I would want to be wrong:

1. ~~**Whether the Flink Prometheus plugin is genuinely absent.**~~ **CHECKED 2026-08-04 — I was wrong.** The base image pre-stages it in `plugins/`; both JM and TM serve metrics on :9249. See the correction in C7. *(This is the one I most expected to be wrong, and it was. The lesson generalises: "no code does X" is not the same as "X does not happen" when a base image is involved.)*
2. **Actual TaskManager headroom under load.** I read the configured limits, not observed usage. Check: run the long job at 10 loops and read `flink_taskmanager_Status_JVM_Memory_*` and state size — which requires (1).
3. **Whether `.env` is present in the environment you actually deploy to.** It is untracked here, so the password split-default may or may not bite you. Check: `docker compose config | grep POSTGRES_PASSWORD`.
4. **IoTDB's inferred numeric type for the existing process-value writes.** I established that the type is *undeclared*; I did not query a live instance. Check: `SHOW TIMESERIES root.houston.**`.
5. **Whether the 2 s simulator interval reflects an intended target rate** or is just a lab convenience. That changes Q6 from a constraint to a non-issue.
