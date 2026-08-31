# Pre-prod analysis: AMS / Traverse on Marun next to Instrumental Pro

**Date:** 2026-08-28  
**Audience:** team deploying AMS (this repo) as a **second** product on the same Marun Linux VM as Instrumental Pro.  
**Constraint:** no code changes in this pass — inventory, reuse verdict, gaps, and checklists only.  
**Pattern source:** Instrumental `microservices/migration/` (Linux `.sh` run order that already worked on Marun). Copy the **shape**, not Instrumental database names, topic names, or `deploy.sh` lines that `up -d` Postgres/Kafka.

This is **not** an Instrumental audit. It is how **this** application stacks up against that pattern, and what to reuse vs bring ourselves.

**Repo sources of truth used here (code wins over drifted docs):**

| Area | Live source | Drifted / do not treat as live |
|---|---|---|
| Compose / ports / hostnames | `infra/docker/docker-compose.yml` | `docs/migration/kafka-topic-catalog.md` (still mentions `raw-opc-events`, RF=1, missing CPLM) |
| Kafka topics | `scripts/kafka-reset-lab-topics.ps1` | same catalog doc; `architecture_document.md` `raw-opc-events` |
| Flink jobs | `infra/docker/flink-job-supervisor.sh` | `scripts/ensure_flink_jobs.py` (mirrors list, not invoked at stack start) |
| Databases | `database/scripts/*.sql` + compose `POSTGRES_DB=ams` | `database/procedures/alarm_operations.sql` (never applied) |
| Deeper alarm census | `docs/alarm-analysis/02-flink-jobs.md`, `04-kafka-architecture.md`, `07-database-and-state.md` | — |

---

## 0. Bottom line

**Yes — reuse Instrumental’s Postgres *process* and Kafka *cluster*. Do not start a second Postgres or a second Kafka. Do not bind `:80`.**

AMS still has to bring its own **Flink, IoTDB, EMQX, MinIO**, and all **AMS / Traverse** containers.

Today this repo is a **self-contained lab stack**: Windows `.ps1`, own Postgres / Kafka / Redis / frontend nginx on host `:3000`. It does **not** match the Marun `migration/` pattern yet.

---

## 1. What Instrumental did (shape to copy)

| Step | Script (Linux `.sh`; optional `.py` twin) | Job |
|---|---|---|
| 0 | `00-prerequisites-check.sh` | Docker, RAM, disk, **ports not already taken** |
| 1 | `01-create-databases.sh` | `CREATE DATABASE` (idempotent) inside the **existing** Postgres container |
| 2 | `02-apply-schemas.sh` | Apply `schema/*.sql` dumps; skip DB if tables already exist unless `--force` |
| 3 | `03-seed.sh` | Site seed (`ON CONFLICT`); never touch Instrumental’s DBs |
| 4 | `04-create-kafka-topics.sh` | Create **this app’s** topics only (`--if-not-exists`) |
| 4b | `04b-submit-flink-jobs.sh` | **AMS uses Flink** — after topics exist |
| 5 | `05-validate.sh` | Containers, DBs, topics, Flink jobs, HTTP health |
| all | `run-migration.sh` | Chain 01–05 (infra already up) |
| VM | `deploy/prepare-vm.sh` | CRLF→LF, chmod, `.env`, log dir owners |
| VM | `deploy/deploy.sh` | One-shot: wait infra → migrate → start **this app’s** containers → validate |

Instrumental has **no Flink**. AMS **must** ship step 4b.

**Rules learned the hard way (apply here):**

- One canonical topic list. Bash, Python, `topics.txt`, and validate must be the **same** names. Missing topics + `allowAutoTopicCreation: false` = silent empty caches.
- `deploy.sh` must **tee a log file**. SSH drops otherwise lose the build.
- Schema dumps are `pg_dump --schema-only` for a **fresh** DB. Never `--force` apply dumps onto a live shared Postgres.
- Seed only this app’s databases.

---

## 2. Reuse verdict (same Marun host)

| Shared thing | Reuse? | How | Blocker if we get it wrong |
|---|---|---|---|
| **Postgres process** `instrumental-postgres` | **Yes, with a Timescale decision (T1)** | `docker exec … psql` → `CREATE DATABASE` AMS names only | AMS `ams` DB **requires TimescaleDB** (`CREATE EXTENSION timescaledb` in `database/scripts/01_init_extensions.sql`). Instrumental PG is almost certainly vanilla. |
| **Kafka** `instrumental-kafka-1/2/3` | **Yes** | Create **this app’s** topics only, `--if-not-exists`, RF=3 / minISR=2 | Today AMS points at hostname `kafka:9092` (its own broker). On Marun it must be `kafka-1:9092,kafka-2:9092,kafka-3:9092`. Auto-create is off → missing topics = silent empty caches. |
| **Network** `instrumental-network` | **Must join** | `external: true`; AMS services attach to it | Containers on `ams-backend` only **cannot** resolve `postgres` / `kafka-1`. |
| **HTTP `:80`** `instrumental-nginx` | **Do not take it** | Hostname or path on *their* nginx, **or** a free host port | Typing the server IP will keep opening Instrumental. See §7. |
| **Redis** | **Do not share DB 0 as-is** | Own Redis **or** dedicated DB index + key prefix | AMS uses Redis **logical DB 0** and keys `snapshot:*`, `cache:*`, `rl:*`, `alias:*`. AMS also wants **two** Redis (cache vs contract / `noeviction`). |
| **nginx `:80` / frontend `:3000`** | **No second `:80`; `:3000` already taken** | See §7 | Instrumental already publishes 3000. |
| **ZooKeeper** | Reuse Instrumental’s ZK **only for Kafka**. Flink HA can use a **chroot** (`/flink-ams`) on the same ZK, or AMS brings its own Flink ZK — do not start a second Kafka ZK. | Collision on `/` if two Kafka clusters share ZK. |
| **Flink** | **Bring our own** (Instrumental has none) | Jobs **after** topics exist; unique job names | Must sit on `instrumental-network` so jobs can read Kafka. |
| **IoTDB, EMQX, MinIO** | **Bring our own** | Not part of Instrumental | Host ports 1883 / 6667 / 9000 may still collide — check on server. |
| **JWT / auth** | **Do not reuse Instrumental `JWT_SECRET` / `auth_service`** | AMS already uses **RS256 + JWKS** (`traverse-auth`, audience `ams-services`) | SSO is a later, intentional project. |

### Decision T1 — Timescale (freeze before writing `01-create-databases.sh`)

1. **Preferred for isolation:** keep AMS **Timescale** as its own container (`ams-postgres`), **do not** attach it to `instrumental-network` under the name `postgres`. Reuse Instrumental PG **only if** ops installs Timescale on it (risky for Instrumental).
2. **Preferred for “one Postgres on the host”:** install Timescale on `instrumental-postgres`, create `ams` + `traverse_*` there, **do not** compose-up a second Postgres.
3. **Split:** `ams` (Timescale, own container) + `traverse_*` on Instrumental PG — two Postgres processes; only if T1/T2 are rejected.

Until T1 is decided, do not write `01-create-databases.sh` against live Instrumental.

**Do not reuse (Instrumental owns these):**

- Database names: `auth_service`, `shared_lookups`, `instrument_*`, `notification_service`
- Topics in `raw.instrument.*`, `domain.instrument.*`, `dlq.ingestion.failed`, …
- Consumer groups: `instrument-*-service-*`
- Container names: `instrumental-postgres`, `api-gateway`, `ingestion-service`, …
- MQTT client IDs already used by Instrumental ingestion
- `JWT_SECRET` / Instrumental `auth_service` unless building SSO on purpose

AMS already prefixes containers (`ams-*`, `traverse-*`) and DBs (`ams`, `traverse_*`). Topic names are **not** prefixed (`raw-alarms`, `audit-events`, …) — confirm they are absent on the live broker before create.

---

## 3. Inventory — what this application is today

### 3.1 Docker Compose — lab is a full island

**File:** `infra/docker/docker-compose.yml`  
**Network:** `ams-backend` only (no `instrumental-network`).  
**Defines (must not recreate on Marun):** `postgres`, `kafka`, `zookeeper`, `redis`, `redis-contract`, frontend nginx **`3000:80`**.

HA overlay `infra/docker/docker-compose.ha.yml` adds Kafka-2/3 (`ams-kafka-2`, hostname `kafka-2`) and Flink/Postgres replicas — lab drill only. Marun already has a 3-broker Kafka; do not compose-up a second cluster.

**App / platform containers to keep (unique names — good):**

| Container | Role |
|---|---|
| `ams-api` | Alarms, SignalR, ACK writeback, ingest |
| `ams-frontend` | SPA nginx → gateway |
| `traverse-gateway` | YARP, host **8081** |
| `traverse-auth-service` | RS256 / JWKS |
| `traverse-asset-model` | UNS asset model |
| `traverse-display-service` | Displays |
| `traverse-template-service` | Templates |
| `traverse-analysis-service` | Analysis defs |
| `traverse-binding-resolver` | Path+role → transport |
| `traverse-ingestion-service` | OT data-source configs |
| `traverse-audit-service` | Audit log |
| `traverse-notification-service` | Notifications |
| `traverse-cplm-api` | Loop performance (CPLM) |
| `ams-historian-bff` | IoTDB reads |
| `ams-sparkplug-edge-node` | Kafka → MQTT + Redis snapshots |
| `ams-flink-jobmanager` / `ams-flink-taskmanager` / `ams-flink-job-supervisor` + submit sidecars | Flink |
| `ams-iotdb` | Historian |
| `ams-emqx` | MQTT / Sparkplug |
| `ams-minio` | Flink checkpoints (`s3://ams-flink/…`) |
| `ams-mock-dcs` | Lab ACK stub — **not for Marun** |
| `ams-prometheus`, `ams-grafana`, `ams-pgadmin`, `kafka-ui`, exporters | Observability — many **port collisions** |

**Must drop from Marun compose:** `postgres`, `kafka`, `zookeeper` (Kafka’s), `kafka-ui` on 8085, frontend bind to **3000**, anything on Instrumental’s port list. Do not deploy `ams-mock-dcs` as the production ACK target.

**DNS trap:** if AMS keeps a service named `postgres` **and** joins `instrumental-network`, two containers fight over hostname `postgres`. Same for `redis` / `kafka`. Marun compose must **not** declare those services, or must not alias those names on the shared network.

Example fragment (after T1 / HTTP are frozen):

```yaml
services:
  ams-api:
    container_name: ams-api
    environment:
      DB_HOST: postgres
      # Connection strings stay on NEW database names (ams, traverse_*)
      Kafka__BootstrapServers: kafka-1:9092,kafka-2:9092,kafka-3:9092
    networks:
      - instrumental-network
      - ams-backend          # optional, own overlay for app-only traffic

networks:
  instrumental-network:
    external: true
    name: instrumental-network
  ams-backend:
    name: ams-backend
```

Flink JobManager / TaskManager must sit on `instrumental-network` as well so they can read/write Kafka.

### 3.2 Databases (9 logical DBs)

Created by `database/scripts/*.sql` mounted at **`/docker-entrypoint-initdb.d`** — runs **once**, empty volume only. **There is no `01-create-databases.sh` for an already-running Postgres.**

| Database | Owner script(s) | Notes |
|---|---|---|
| `ams` | compose `POSTGRES_DB` + `01`–`03`, `35`–`40` | Timescale hypertables (`alarm_history`, …) |
| `traverse_assets` | `10_` + seed `15`, `16`, `31`, `43`, `48` | UNS + HDPE plant |
| `traverse_displays` | `11_` + `13`, `17`–`22` | Displays / personal views |
| `traverse_templates` | `12_` | |
| `traverse_analysis` | `14_` + `23` | |
| `traverse_auth` | `17_traverse_auth_schema.sql` | **Not** Instrumental `auth_service` |
| `traverse_audit` | `24_` | |
| `traverse_cplm` | `29_` + `30`, `32`–`34`, `42`, `44` | |
| `traverse_ingestion` | `45_` + `46`, `47` | |

**Collision with Instrumental names:** none of `auth_service`, `shared_lookups`, `instrument_*`, `notification_service`. Keep `ams` / `traverse_*`. Do not create Instrumental names.

**Schema vs pattern:** scripts are **incremental + `\c` + mixed DDL/seed**, not `pg_dump --schema-only` one-file-per-DB. Initdb-on-empty-volume **does not work** against live Instrumental PG.

**Seed mixed into schema path:**

- `15_traverse_assets_2site_plant.sql` — houston/dallas **lab** plant
- `16_pumpstation_20_pumps.sql` — 20 demo pumps
- `48_hdpe_plant_hierarchy.sql` — real HDPE tree; aliases `source_system = 'instrumental-pro'`

Default Marun path should seed **HDPE only**, not houston lab plant — that belongs in `03-seed.sh` with a flag, not auto-applied dumps. Seeds use `ON CONFLICT DO NOTHING` (good).

**Role:** everything uses `ams_user`. Pattern wants a dedicated role; fine if we `GRANT` only on AMS DBs, never on Instrumental DBs. Never `DROP DATABASE`. Never create `auth_service` / `instrument_*`.

**Bootstrap caveat:** a new `NN_*.sql` added to `database/scripts/` never reaches an existing volume. For Marun, `02-apply-schemas.sh` is the apply path, not Docker initdb.

### 3.3 Kafka topics

**Canonical list today:** `scripts/kafka-reset-lab-topics.ps1` (not `kafka/topics.txt`).  
**Broker (lab):** `ams-kafka`, bootstrap **inside** `kafka:9092`, `KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"`.  
**Lab default:** RF=1 / minISR=1. Script already parametrizes `KAFKA_TOPIC_RF` / `KAFKA_TOPIC_MIN_ISR`. **Marun must run RF=3 / minISR=2.**

**Danger:** with `-Force` this script **deletes and recreates** topics. On shared Kafka that would destroy AMS data and must never run as-is. Need create-only `--if-not-exists`.

Against Instrumental Kafka, create from **inside** `instrumental-kafka-1` with bootstrap `localhost:9092`:

```text
kafka-topics --create --if-not-exists
  --partitions N --replication-factor 3
  --config min.insync.replicas=2
  --config cleanup.policy=delete|compact
  --config retention.ms=…
```

#### Live / create list (do not add Instrumental `raw.instrument.*`)

| Topic | Policy | Parts (script) | Live? |
|---|---|---|---|
| `raw-alarms` | delete | 8 | yes |
| `raw-alarms-dlq` | delete | 2 | yes (projection DLQ) |
| `current-alarm-state` | **compact** | 8 | yes |
| `operator-actions` | delete | 4 | yes |
| `ack-writeback` | delete | 2 | yes |
| `ack-results` | delete | 2 | yes |
| `lifecycle-events` | delete | 4 | yes |
| `root-cause-events` | delete | 2 | yes |
| `lifecycle-alerts` | delete | 4 | yes (ensure-only in script) |
| `kpi-alarm-rates` | delete | 4 | yes |
| `kpi-standing-snapshots` | compact | 2 | yes |
| `kpi-bad-actors` | delete | 4 | **no producer** |
| `kpi-health-scores` | delete | 2 | **no producer** |
| `live.alarms` | delete | 4 | yes |
| `live.alarm.metrics` | delete | 4 | **no consumer** |
| `live.metrics` | delete | 8 | sim-only producer |
| `live.loop.metrics` | delete | 8 | yes (CPLM) |
| `flink.state.alarm.delta` | delete | 4 | yes |
| `flink.state.alarm.replay` | delete | 2 | on-demand / broken submit |
| `system.state.drift.alerts` | delete | 2 | job never submitted |
| `alarm.events.raw` | delete | 8 | **no producer** |
| `alarm.state.delta` | delete | 4 | orphan |
| `alarm.state.active` | compact | 4 | **no producer** |
| `loop-raw-data` | delete | 16 | dead |
| `loop-kpis-5m` | delete | 8 | job never submitted |
| `analysis.executions` | delete | 2 | yes |
| `analysis.results` | delete | 2 | yes |
| `loop.samples.v1` | delete | 16 | yes (CPLM, ensure-only) |
| `clpm.feature.short.v1` | delete | 8 | yes |
| `clpm.feature.long.v1` | delete | 8 | yes |
| `clpm.gate.results.v1` | delete | 8 | yes (30 d retention) |
| `ams.metadata.updates` | compact | 3 | yes |
| `context.parameter-set.v1` | compact | 3 | yes |
| `audit-events` | delete | 4 | yes |
| `raw.telemetry.site1` | delete | 16 | future |

**Produced in code but not in the create script:** `analysis.commands` (produce fails with auto-create off).  
**Declared, never created:** `ack-writeback-dlq`.

**Legacy names the reset script deletes if present** (do not create on Marun): `raw-opc-events`, `raw-opc-events-dlq`, `current-opc-state`, `opc-events`, `opc-ack`, `alarm-created`, `alarm-updated`, `alarm-cleared`, `alarm-acknowledged`.

Topic names do **not** use an `ams.` prefix. They also do **not** match Instrumental `raw.instrument.*`. Collision risk is **generic names** (`audit-events`, `live.metrics`, `lifecycle-events`). **Inventory Instrumental’s topic list on the server before create.** If any name already exists, prefix (`ams.raw-alarms`, …) — that is a **code + compose config** change later (alarm Flink jobs hardcode topic names in Java).

Compacted topics **must** stay keyed (`current-alarm-state`, `kpi-standing-snapshots`, `ams.metadata.updates`, `context.parameter-set.v1`, `alarm.state.active`). Do not create unused “maybe later” topics that collide with leftovers.

### 3.4 Consumer groups

Prefix is already `ams-` / `flink-ams-` / `traverse-`. Do not collide with `instrument-*-service-*` unless a generic name exists on the cluster. Groups are created by **clients**, not by the topic script. Freeze this list into `kafka/CONSUMER-GROUPS.md`.

| Group | Topic(s) | Owner |
|---|---|---|
| `flink-ams-raw-alarms` | `raw-alarms` | `OpcEventStreamJob` |
| `flink-ams-iotdb-persistence` | `raw-alarms` | `IoTDBPersistenceJob` |
| `flink-ams-operator-actions` | `operator-actions` | `OpcEventStreamJob` |
| `flink-ams-ack-results` | `ack-results` | `OpcEventStreamJob` |
| `flink-ams-live-state` | `current-alarm-state` | `LiveStateJob` |
| `flink-state-export-job` | `current-alarm-state` | `AlarmStateExportJob` |
| `flink-ams-alarm-kpi` | `lifecycle-events` | `AlarmKpiStreamJob` |
| `flink-ams-cplm` (+ job suffixes) | CPLM topics | CPLM Flink jobs |
| `flink-analysis-execution` | `analysis.executions` | `AnalysisExecutionJob` |
| `ams-backend-2` | `current-alarm-state` | `ams-api` projection |
| `ams-backend-2-lifecycle` | `lifecycle-events` | `ams-api` |
| `ams-backend-2-http-ack-writeback` | `ack-writeback` | `ams-api` |
| `ams-backend-2-telemetry-deadman` | `raw-alarms` | `ams-api` |
| `ams-api-kpi-consumer` | KPI topics | `ams-api` |
| `ams-api-cplm-results` | CPLM results | `cplm-api` — **exactly one member** |
| `ams-api-cplm-results-frames` | CPLM frames | `cplm-api` — **exactly one member** |
| `ams-iotdb-raw-loop` | `loop.samples.v1` | `ams-api` `RawLoopIotDbConsumer` |
| `ams-sparkplug-edge-node` | `live.alarms`, `live.metrics`, `live.loop.metrics` | edge node |
| `ams-delta-consumer-ui` | `flink.state.alarm.delta` | `ams-api` |
| `notification-service-group` | `root-cause-events` | notification-service |
| `notification-service-lifecycle-alerts` | `lifecycle-alerts` | notification-service |
| `audit-service-group` | `audit-events` | audit-service |
| `analysis-service-results` | `analysis.results` | analysis-service |

**Hazard:** `PipelineHealthService` creates `ams-health-lag-<guid>` per `/api/v1/health/pipeline` probe (unbounded `__consumer_offsets` metadata).

**Lab vs compose:** `appsettings.json` default group is `ams-backend`; compose sets `Kafka__ConsumerGroupId: ams-backend-2`. Marun compose must set the intended id explicitly.

### 3.5 Flink jobs (step 4b required)

Submitted by `infra/docker/flink-job-supervisor.sh` (authoritative). Order: **topics first, then jobs.**

| Job name (must stay unique) | Class | After topics |
|---|---|---|
| `AMS - Alarm State Machine` | `com.ams.flink.OpcEventStreamJob` | yes |
| `AMS - IoTDB Alarm Persistence` | `com.ams.flink.IoTDBPersistenceJob` | needs IoTDB |
| `AMS - Live State RBE` | `com.ams.flink.LiveStateJob` | yes |
| `AMS - CPLM Short Feature Engine` | `com.ams.flink.cplm.CplmShortFeatureStreamJob` | yes |
| `AMS - CPLM Long Diagnostics Engine` | `com.ams.flink.cplm.CplmLongDiagnosticsStreamJob` | yes |
| `AMS - CPLM Gate Fusion Engine` | `com.ams.flink.cplm.CplmGateFusionStreamJob` | yes |
| `AMS - Loop Live RBE Engine` | `com.ams.flink.cplm.LoopLiveRbeJob` | yes |
| `AMS - Analysis Execution Engine` | `com.ams.flink.AnalysisExecutionJob` | yes |
| `AMS - Alarm KPI Engine` | `com.ams.flink.AlarmKpiStreamJob` | yes |
| `AMS Alarm State Export Engine` | `com.ams.flink.AlarmStateExportJob` | yes |

**Not submitted (do not require in 05 unless product asks):** `StateDriftDetectionJob`, `LoopKpiStreamJob`, `CplmGateStreamJob` (deliberate — would double-produce gate results), `AlarmReplayEngine` (on-demand; `/jars` upload path is broken because the JAR is baked into the image).

Checkpoint store: **MinIO** `s3://ams-flink/checkpoints` (HA `s3://ams-flink/ha/`). No savepoint-on-upgrade in deploy today — document policy in `migration/flink/`.  
Two copies of the same job each assign **every** partition (Flink `KafkaSource` does not use group coordination). Supervisor already guards duplicates.  
Alarm topic names are **hardcoded in Java** — a rename/prefix is a code change, not env.

`04b` must be idempotent: skip if job name already `RUNNING`. Log the Flink REST submit response into the deploy log.

### 3.6 Redis / MQTT / secrets

| Item | Lab value | Marun rule |
|---|---|---|
| Redis DB | `GetDatabase()` → **0** | Dedicated instance **or** DB ≠ 0 **or** key prefix `ams:` |
| Cache keys | `cache:*`, `rl:*`, pub/sub `asset-events` | Must not share Instrumental DB 0 unprefixed `cache:*` |
| Contract keys | `snapshot:metric:…`, `snapshot:devices`, `snapshot:index:*`, `alias:<group>:<edge>` | Own Redis (AMS uses a second instance `ams-redis-contract`, `noeviction`) |
| MQTT client IDs | `ams-edge-node-1`; browsers `ams-hmi-<random>` | Unique vs Instrumental ingestion IDs |
| Sparkplug | group `ams_site1`, edge `ams_edge1` | Unique vs Instrumental MQTT namespace |
| Auth | **RS256** JWKS, issuer `traverse-auth`, audience `ams-services` | Do not use Instrumental `JWT_SECRET` |
| `.env.example` | still `CHANGE_ME_*` | `deploy.sh` must **refuse** `CHANGE_ME` |
| EMQX host port | TCP **1883**, dashboard **18083** | Remap if Instrumental already uses MQTT on 1883 |

`ams-api` itself does not use Redis (in-process cache). Gateway, historian-bff, binding-resolver, asset-model, display-service, analysis-service, and sparkplug-edge-node do.

### 3.7 Scripts today vs Marun pattern

| Pattern script | AMS today | Gap |
|---|---|---|
| `00-prerequisites-check.sh` | none | **missing** |
| `01-create-databases.sh` | initdb.d only | **missing** (initdb will not run on Instrumental) |
| `02-apply-schemas.sh` | 39 SQL files, mixed seed | **missing** as a Linux apply-to-existing path |
| `03-seed.sh` | seed inside `15` / `16` / `48` | **not separated** |
| `04-create-kafka-topics.sh` | `kafka-reset-lab-topics.ps1` **deletes** | **wrong tool** for shared broker |
| `04b-submit-flink-jobs.sh` | supervisor + `.ps1` + Python twin | need **Linux one-shot** after topics; supervisor can stay |
| `05-validate.sh` | `scripts/validate-deployment.ps1`, many e2e `.ps1` | Windows-only |
| `run-migration.sh` | `scripts/start-ams-production.ps1` **ups Postgres+Kafka** | **unsafe** on Marun |
| `deploy/deploy.sh` + tee log | none | **missing** |
| `deploy/prepare-vm.sh` | none | **missing** |
| `kafka/topics.txt` | array inside `.ps1` + drifted markdown | **not one file** |
| Linux `.sh` | ~12 scripts, all **inside** Flink/EMQX/IoTDB images | **no VM migration pack** |

Ops automation is **PowerShell**. Marun is **Linux**. That is the largest process gap.

`start-ams-production.ps1` order today: Docker stack (including Kafka/Postgres) → **wipe topics** → build JAR → submit one Flink job. Inverse of the Marun rule (infra already healthy → migrate → then `up -d` **this app**).

---

## 4. Host port collisions

Instrumental already has: `3000–3013`, `3001`, `3002`, `3008`, `3009`, `4000`, `5050`, `8080/8085`, `9090`, `3100`, `5432`, `6379`, `9092–9097`.

| AMS publish | Collision? | Marun action |
|---|---|---|
| **3000** frontend | **YES** | unpublish; see §7 |
| **3001** Grafana | **YES** | unpublish or remap |
| **5050** pgAdmin | **YES** | do not deploy pgAdmin |
| **8085** kafka-ui | **YES** | do not deploy; use Instrumental kafka-ui |
| **9090** Prometheus | **YES** | unpublish or remap |
| **9093** Kafka EXTERNAL | **YES** (9092–9097) | **do not publish Kafka**; apps use internal `kafka-1:9092` |
| **5433** Postgres | maybe free | omit if reusing Instrumental PG |
| **8081** gateway | not on their list | **likely the public AMS API port** (confirm with `00`) |
| **8082** Flink UI | check | remap if taken |
| **1883 / 18083** EMQX | check MQTT | remap if Instrumental uses 1883 |
| **6667 / 8181 / 9091** IoTDB | check | keep if free |
| **9000 / 9001** MinIO | check | remap if taken |
| **8978** CloudBeaver | skip on Marun | |
| **9249 / 9250** Flink metrics | check | internal scrape preferred |
| **9121 / 9187 / 9308** exporters | check | skip or remap |

`00-prerequisites-check.sh` must **fail** if this app’s published ports are already bound.

---

## 5. Compose checklist vs pattern (current = FAIL)

| Rule | Status |
|---|---|
| No second Postgres / Kafka / ZK / `:80` | **FAIL** — all defined in compose |
| `instrumental-network` external | **FAIL** — only `ams-backend` |
| Unique `container_name` / volumes | **PASS** (`ams-*`, `traverse-*`) |
| Unique host ports | **FAIL** — 3000, 3001, 5050, 8085, 9090, 9093 |
| Kafka bootstrap `kafka-1:9092,…` | **FAIL** — `kafka:9092` |
| Postgres `DB_HOST=postgres` + **new** DB names | names OK; host only works **after** join + no second `postgres` alias |
| Redis not DB 0 / prefix | **FAIL** — DB 0, unprefixed `cache:*` / `snapshot:*` |
| Healthchecks on services deploy waits on | **partial** (~26 healthchecks; not every sidecar) |
| Startup: infra already up → migrate → then `up -d` **this app** | **FAIL** — `start-ams-production.ps1` starts infra |
| Flink on same network as Kafka | lab yes; Marun only if Flink joins `instrumental-network` |
| Prod images + no `CHANGE_ME` | `.env.example` still `CHANGE_ME` |
| `ams-mock-dcs` not production ACK target | lab-only today |

---

## 6. Folder layout to create (not written yet)

Mirror Instrumental. Linux `.sh` is what the VM runs.

```
migration/
├── migration.md                 ← short operator steps
├── .env.example                 ← secrets; no CHANGE_ME left at deploy
│
├── 00-prerequisites-check.sh    ← Docker, compose v2, RAM, disk, free ports
├── 01-create-databases.sh       ← CREATE DATABASE inside instrumental-postgres
├── 02-apply-schemas.sh          ← schema/*.sql
├── 03-seed.sh                   ← this app’s seed only (HDPE default)
├── 04-create-kafka-topics.sh    ← this app’s topics only, --if-not-exists
├── 04b-submit-flink-jobs.sh     ← required (AMS uses Flink)
├── 05-validate.sh
├── run-migration.sh             ← 01–05 (and 04b); --from N to resume
│
├── schema/                      ← one .sql per database (pg_dump --schema-only)
├── sql/                         ← seed + one-shot backfills (HDPE; not houston)
├── kafka/
│   ├── topics.txt               ← same names as 04 script
│   └── CONSUMER-GROUPS.md
├── flink/                       ← job JARs / SQL / savepoint notes
└── deploy/
    ├── prepare-vm.sh
    ├── pull-images.sh           ← this app’s images only
    ├── deploy.sh                ← one-shot + tee log
    └── README.md
```

Keep **one** topic list (`kafka/topics.txt`) that 04 and 05 both read. Do not maintain three copies that can drift.

Make container names variables (`POSTGRES_CONTAINER`, `KAFKA_CONTAINER`) so they are not hardcoded forever. Targets on Marun today: Postgres `instrumental-postgres`, Kafka `instrumental-kafka-1`.

---

## 7. HTTP `:80` — what operators should type

Instrumental nginx owns **`:80`**. AMS frontend nginx listens **container `:80`**, published **host `:3000`**. Browser path: SPA on `/`; `/api`, `/hubs`, `/mqtt-ws` → `traverse-gateway:8080` (`src/frontend-ob/nginx.conf`).

**Do not** put a second nginx on `:80`. **Do not** publish AMS on `:3000`.

### Recommended (ops-friendly; bare IP still opens Instrumental)

1. DNS / hosts: `ams.<plant>` (or `cams.marun.local`).
2. **One extra server block on Instrumental nginx** (they keep `:80`):
   - `server_name ams.…;`
   - `/` → `ams-frontend:80` (container on `instrumental-network`)
   - `/api/`, `/hubs/`, `/mqtt-ws` can stay on AMS nginx (it already proxies to the gateway) **or** go straight to `traverse-gateway:8080`.
3. Operators type the **hostname**, not the bare IP.

### Fallback if Instrumental nginx must not change

Publish **only** `ams-frontend` on a **free** port (e.g. `3014` or `8088` — confirm with `00`). Operators use `http://<ip>:3014`. Gateway can stay unpublished (frontend reaches it on the Docker network) **or** stay on **8081** for scripts.

**Do not** path-prefix `/ams/` on the same Instrumental vhost without an SPA `base` href change (that is a later code change). Hostname vhost is the zero-frontend-change option.

---

## 8. Scripts to write — step by step

### Step 0 — `00-prerequisites-check.sh`

Pass / fail / warn only. No writes.

- Docker daemon + `docker compose version` (v2).
- RAM/disk (Flink needs extra heap; Instrumental Kafka already uses ~3 GB; add AMS Flink + IoTDB + EMQX).
- **Ports:** fail if this app’s published ports are already bound.
- `docker network inspect instrumental-network` exists.
- `docker ps` shows `instrumental-postgres` and `instrumental-kafka-1` **healthy**.
- Flink JobManager URL reachable **after** AMS Flink is up (or warn “Flink not up yet” if 00 runs before compose).

Zero `[FAIL]` before continuing.

### Step 1 — `01-create-databases.sh`

```text
docker exec -i instrumental-postgres psql -U postgres
  CREATE DATABASE ams / traverse_*  WHERE NOT EXISTS
  GRANT to a dedicated role (optional but better than sharing postgres superuser)
```

Idempotent. **Never** `DROP DATABASE`. **Never** create `auth_service` / `instrument_*`. Honour T1 (Timescale on this cluster vs own `ams-postgres`).

### Step 2 — `02-apply-schemas.sh`

- `schema/01-ams.sql` → matching DB, etc.
- Skip if the DB already has base tables, unless `--force` (**dev only**).
- `ON_ERROR_STOP=1`. Fresh DBs only (bare `CREATE TABLE`).
- Never `--force` onto live shared Postgres.

### Step 3 — `03-seed.sh`

- `ON CONFLICT DO UPDATE` / `DO NOTHING`.
- Users/roles for **this** product only.
- Default: HDPE (`48`). Houston/dallas (`15`/`16`) stays out of the default path.

### Step 4 — `04-create-kafka-topics.sh`

Against `instrumental-kafka-1`, bootstrap `localhost:9092` **from inside that container**. `--if-not-exists` only. **Do not** call `kafka-reset-lab-topics.ps1`. Put the list in **one** file; 04 and 05 must match.

### Step 4b — `04b-submit-flink-jobs.sh`

Order: **topics first, then jobs.** For each job in §3.5:

1. Idempotent: skip if job name already `RUNNING`.
2. Checkpoint / restart strategy written down.
3. Source/sink topic names = the list from step 4.
4. Unique Flink job names (`AMS - …`).
5. Log the Flink REST submit response into the deploy log.

### Step 5 — `05-validate.sh`

| Check | Expect |
|---|---|
| This app’s containers | `healthy` |
| This app’s databases | exist; required tables present |
| Seed | min row counts (e.g. HDPE site `hdpe`) |
| Kafka | every topic from the canonical list; **fail** if any Instrumental topic was overwritten |
| Consumer groups | appear after first subscribe (document expected names) |
| Flink | each job in §3.5 `RUNNING` |
| HTTP | this app’s health URLs (host port **or** `docker exec` if unpublished) — **not** Instrumental `:80` unless host proxy is already routed |
| Instrumental still healthy | their UI/API still up |

Exit 1 on any FAIL so `deploy.sh` does not report success.

### `run-migration.sh`

```text
01 → 02 → 03 → 04 → 04b → 05
--from N to resume
```

Assumes infra is already up. Does **not** `docker compose up` Instrumental.

### `deploy/deploy.sh` (mandatory logging)

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/ams-open   # deploy root

STAMP=$(date +%Y%m%d_%H%M%S)
LOGDIR=migration/deploy/logs
mkdir -p "$LOGDIR"
LOG="$LOGDIR/deploy-${STAMP}.log"
exec > >(tee -a "$LOG") 2>&1
echo "Logging to $LOG"

# refuse CHANGE_ME in .env
# confirm instrumental-postgres + kafka-1 healthy
# docker compose -f their-compose.yml build   # AMS images only
# docker compose create && up -d AMS services
# wait health
# bash migration/01-create-databases.sh
# … 02 03 04 04b 05
# curl AMS health (not :80 unless host proxy is already routed)
```

Flags worth copying: `--no-build`, `--skip-migration`, `--help`.

`prepare-vm.sh`: CRLF strip, `chmod +x`, log directories writable by the image user. Kafka advertised listeners are already set on this host — **do not** re-patch Instrumental’s compose unless ops agrees.

---

## 9. Best run order on Marun

```
A. Inventory Instrumental (once)
   docker exec instrumental-kafka-1 kafka-topics --bootstrap-server localhost:9092 --list
   docker exec instrumental-postgres psql -U postgres -c '\l'
   docker network inspect instrumental-network
   ss -lnt | egrep ':80|:3000|:8081|:1883|:5432|:9092'
   Note every DB name, topic, and bound port. AMS names must not appear
   (or we prefix topics).

B. Audit THIS repo (this document)

C. Freeze T1 (Timescale) and HTTP (hostname vs free port).
   Freeze compose overlay. Then write migration/ as in §6–§8.
   Dry-run 00–05 against a copy or empty DBs, not live Instrumental data.

D. On the server
   1. Snapshot Postgres (pg_dumpall) and note Kafka topic list.
   2. Join instrumental-network; do not compose-up a second Kafka/Postgres.
   3. bash migration/00-prerequisites-check.sh
   4. bash migration/deploy/deploy.sh          # log in deploy/logs/
   5. Validate AMS UI/API and confirm Instrumental UI/API still healthy.

E. Rollback
   docker compose -f ams-compose.yml down     # does NOT take down Instrumental
   DROP only ams / traverse_* databases
   kafka-topics --delete only AMS topics from topics.txt
   Cancel only "AMS - *" Flink jobs
```

Never `docker compose down -v` on Instrumental’s project. Never `--force` schema dumps on shared Postgres.

---

## 10. Print checklist (pre-prod)

### Compose

- [ ] No second Postgres / Kafka / ZK / `:80` / `:3000`
- [ ] External `instrumental-network`; Flink + app on it
- [ ] Unique containers/volumes (already `ams-*` / `traverse-*`)
- [ ] Unique host ports vs Instrumental list (§4)
- [ ] Kafka bootstrap `kafka-1:9092,kafka-2:9092,kafka-3:9092` (INTERNAL)
- [ ] Postgres hostname = Instrumental service name; **new** DB names only (`ams`, `traverse_*`)
- [ ] Redis: dedicated instance **or** DB ≠ 0 **or** `ams:` key prefix
- [ ] Healthchecks on everything `deploy.sh` waits for
- [ ] Order: Instrumental healthy → 01–04b → `up -d` AMS only
- [ ] MQTT client IDs `ams-*`; EMQX not colliding on 1883
- [ ] No `ams-mock-dcs` as production ACK target
- [ ] No second `postgres` / `kafka` / `redis` DNS alias on `instrumental-network`

### Scripts (all missing today)

- [ ] `00` … `05` + `04b`
- [ ] `run-migration.sh` (`--from N`)
- [ ] `deploy.sh` with **tee log**
- [ ] `prepare-vm.sh` (CRLF→LF, chmod, log dir owners)
- [ ] One `kafka/topics.txt` = 04 = 05
- [ ] One Flink job list = 04b = 05
- [ ] Schema per prefixed DB; seed only AMS DBs
- [ ] Validate **fails** deploy on missing topic / missing Flink job

### Safety

- [ ] Topic names confirmed **absent** from `kafka-topics --list` on Marun (or prefix decided)
- [ ] Consumer groups `ams-` / `flink-ams-` / `traverse-`
- [ ] Redis not sharing Instrumental DB 0 unprefixed keys
- [ ] Not Instrumental `JWT_SECRET`
- [ ] No `CHANGE_ME` in `.env`
- [ ] Timescale decision **T1** signed off
- [ ] HTTP decision signed off (hostname on Instrumental nginx vs dedicated free port)
- [ ] RAM: Instrumental Kafka ~3 GB **plus** AMS Flink + IoTDB + EMQX
- [ ] Rollback = AMS compose `down` only; `DROP` only `ams`/`traverse_*`; delete only AMS topics; cancel only `AMS - *` jobs
- [ ] Never `docker compose down -v` on Instrumental
- [ ] Never `--force` schema dumps on shared Postgres
- [ ] CPLM groups `ams-api-cplm-results` / `ams-api-cplm-results-frames` remain **single-member**

---

## 11. Suggested work order (no code until T1 + HTTP are picked)

1. **Freeze T1** (Timescale: own PG vs extension on Instrumental vs split).
2. **Freeze HTTP** (hostname on Instrumental nginx vs dedicated free port).
3. **On Marun:** dump Instrumental DB names + topic list + bound ports (§9 A).
4. **Freeze compose overlay:** AMS-only services + external network + bootstrap hosts + port map — still no scripts.
5. **Then** write `migration/` 00–05 + `deploy.sh` (Linux), with create-only Kafka and no `--force` schemas.
6. Dry-run on empty DBs / a copy, **not** live Instrumental data.

---

## 12. Open decisions (block script writing)

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| **T1** | Where does Timescale live? | (1) own `ams-postgres` (2) Timescale extension on Instrumental PG (3) split `ams` vs `traverse_*` | Ops call — (1) safest for Instrumental, (2) matches “one Postgres” pattern |
| **HTTP** | How do operators open AMS? | (1) hostname vhost on Instrumental nginx (2) free host port | (1) if ops will add a server block; (2) otherwise |
| **Topics** | Prefix `ams.` or keep current names? | Keep if absent on broker; prefix if collision | Inventory first; alarm Flink hardcodes names so prefix = code change |
| **Redis** | Own two Redis vs share Instrumental | Own AMS Redis (cache + contract) vs DB index + prefix | Own AMS Redis — different `noeviction` contract tier; skip host ports |
| **Orphan topics** | Create dead topics (`kpi-bad-actors`, `alarm.events.raw`, …)? | Create all of current script vs live-path only | Live-path only for Marun; do not create unused names that can collide |
| **Product slice** | Full AMS vs CPA-first | Full stack vs Loop Performance + live PV/SP/OP + shared users | **Frozen CPA-first.** Live plane in; MQTT ingestion to be built; same `traverse_auth` for later modules. See [marun-cpa-slice.md](marun-cpa-slice.md). |

---

## Appendix A — AMS databases (do not create Instrumental names)

`ams`, `traverse_assets`, `traverse_displays`, `traverse_templates`, `traverse_analysis`, `traverse_auth`, `traverse_audit`, `traverse_cplm`, `traverse_ingestion`

## Appendix B — Flink job names for 04b = 05

`AMS - Alarm State Machine`  
`AMS - IoTDB Alarm Persistence`  
`AMS - Live State RBE`  
`AMS - CPLM Short Feature Engine`  
`AMS - CPLM Long Diagnostics Engine`  
`AMS - CPLM Gate Fusion Engine`  
`AMS - Loop Live RBE Engine`  
`AMS - Analysis Execution Engine`  
`AMS - Alarm KPI Engine`  
`AMS Alarm State Export Engine`

## Appendix C — Related repo docs

| Need | Look at |
|---|---|
| Topic producers/consumers (code census) | `docs/alarm-analysis/04-kafka-architecture.md` |
| Flink job behaviour / defects | `docs/alarm-analysis/02-flink-jobs.md` |
| Postgres / Timescale / Redis / IoTDB | `docs/alarm-analysis/07-database-and-state.md` |
| Lab topic create flags (do **not** use the delete path on Marun) | `scripts/kafka-reset-lab-topics.ps1` |
| HA Kafka RF=3 drill | `docs/ha-production-guide.md`, `infra/docker/docker-compose.ha.yml` |
| Gateway routes / host 8081 | `docs/api-gateway.md` |
| CPLM single-member groups | `docs/cplm-consumer-cutover-runbook.md` |
