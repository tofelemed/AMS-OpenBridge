# 07 — Alarm Data Storage & State

Scope: PostgreSQL/TimescaleDB, Apache IoTDB, Redis, and in-process state that holds alarm
data. Everything below was read out of the repository at commit `2886ccb` (branch `main`).
Claims that could only be settled by running the stack are marked
**Unknown / Requires Verification**.

Read-only analysis. `src/xmlgraphics-batik-main ScreeN Import/` was excluded.

---

## 1. Master table inventory

The `ams` database is the only PostgreSQL database holding alarm state. Scripts live in
`database/scripts/` and are mounted at `/docker-entrypoint-initdb.d`
(`infra/docker/docker-compose.yml:58`), so they run **once, on an empty data volume**, in
filename order, each as its own `psql` invocation (a `\c` only rebinds the rest of *that*
file).

| Table | Purpose | Written by | Read by | Status |
|---|---|---|---|---|
| `alarms.alarm_current` | Live alarm projection (the operator console's table) | `NormalizedAlarmIngestor` (`src/backend/AMS.Infrastructure/Kafka/NormalizedAlarmIngestor.cs:96,138,156,191`), `LifecycleEventConsumerService.cs:82-84`, shelve/unshelve/suppress/OOS handlers (`src/backend/AMS.Application/Alarms/Commands/AlarmCommands.cs:226,304,361,416`), `ActiveAlarmRepository.PurgeLabInjectedAlarmsAsync` (`AlarmRepositories.cs:122`), `alarms.expire_shelved_alarms()` via `ShelveExpiryService.cs:29` | `ActiveAlarmRepository` (`AlarmRepositories.cs:42,68,129,142`), `AlarmEnricher.cs:37`, `AnalyticsController.cs:74,86` | **Written & read** |
| `alarms.alarm_history` | Append-only alarm event log (hypertable) | `HistoricalAlarmRepository.AppendHistoryAsync` (`AlarmRepositories.cs:245-259`) — called from `KafkaConsumerService.cs:324` | `AlarmRepositories.cs:211,216,237,273`; `AnalyticsController.cs:29,42,49,55,60,70` | **Written & read** |
| `alarms.alarm_state_transitions` | ISA-18.2 state-transition log (hypertable) | **nothing** — only DDL (`database/scripts/03_apply_ef_migrations.sql:161`, `src/backend/AMS.Infrastructure/Migrations/20260530160000_AddAlarmStateTransitions.cs:15`) | `AlarmTransitionRepository.cs:59,64,81` → `GET /api/v1/alarms/transitions` and `/transitions/stream` (`AlarmsController.cs:402,432`) | **Read only — permanently empty** |
| `alarms.historical_alarms` | Legacy bulk-COPY history (hypertable) | **nothing** — writer deleted (`AlarmRepositories.cs:261`, `src/backend/AMS.Domain/Repositories/IRepositories.cs:40`) | **nothing** — `CountAsync` was repointed to `alarm_history` (`AlarmRepositories.cs:233-238`) | **Dead table** (still gets Timescale compression+retention policies, `39_timescale_policies.sql:72-79`) |
| `alarms.active_alarms` | Original EF `ActiveAlarm` table | **nothing** | **nothing** — the EF entity is remapped to `alarm_current` (`AmsDbContext.cs:29`) | **Dead table** (referenced only by EF migration/snapshot artifacts) |
| `alarms.shelving_actions` | Shelve/unshelve audit trail | only `alarms.expire_shelved_alarms()` for `AUTO_EXPIRED` (`36_alarm_shelving.sql:63-72`). Operator shelve/unshelve **never** writes it. | nothing in production code (only `AMS.Tests.Integration/Alarms/Plan01ProjectionIntegrityTests.cs:173`) | **Write-only, and only for one of three action types** |
| `configuration.opc_servers` | Legacy OPC server registry (`02_alarm_schema.sql:11`) | nothing | nothing (`OpcServerRepository` is an explicit stub, `StubRepositories.cs:41-52`) | **Dead table** |
| `configuration.opc_connections` | OPC/StreamPipes connection config (the alarm source) | `OpcConnectionRepository.cs`, `OpcConnectionConfiguration.cs` | same | Written & read |
| `public.__EFMigrationsHistory` | EF bookkeeping | `03_apply_ef_migrations.sql:180-188` pre-seeds all 5 migrations | EF at startup | Written & read |
| `audit.immutable_events` (db `traverse_audit`) | Hash-chained audit log | `audit-service` only (`src/services/audit-service/Persistence/AuditDbContext.cs:17`, EnsureCreated) | audit-service | Written & read — **but no alarm operator action writes to it** (§8) |

### Schemas that exist but contain nothing

`01_init_extensions.sql:18-25` creates `soe`, `analytics`, `notifications`, `security`,
`audit`, `keycloak` inside `ams`. **No script creates a single table in any of them.**
`SoeEventRepository` is a documented stub that returns an empty page
(`StubRepositories.cs:21-38`), so SOE events reach the UI only as SignalR pushes and are
never persisted.

### `alarms.alarm_current` — final column set

Base table `02_alarm_schema.sql:37-52`, extended by `35_alarm_current_identity.sql` and
`36_alarm_shelving.sql`.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK, `DEFAULT uuid_generate_v4()` | EF sets it explicitly (`ValueGeneratedNever`, `AmsDbContext.cs:32`) from `AlarmPartitionKeys.DeterministicAlarmId` |
| `alarm_id` | `VARCHAR(255) NOT NULL UNIQUE` | v1 instance key `v1\|{server}\|{source}\|{cond}\|{sub}` (`AlarmPartitionKeys.cs:31-36`) |
| `server_id` | `UUID NOT NULL DEFAULT 'f0af9a6d-85f6-4c9f-a8ad-6de277d1d110'` | added by `35:29-45`; the default must stay in step with `OpcEventStreamJob.HTTP_FEED_SERVER_ID` (`OpcEventStreamJob.java:26`) |
| `source` | `VARCHAR(1024) NOT NULL` | |
| `severity` | `INTEGER NOT NULL` | |
| `message` | `TEXT` | |
| `condition` / `sub_condition` | `VARCHAR(512)` | part of identity; `sub_condition` NULL and `''` are folded by the index |
| `event_time` | `TIMESTAMPTZ(3) NOT NULL` | timezone-correct |
| `state` | `VARCHAR(64) NOT NULL` | domain `ACTIVE`/`CLEARED`/`SHELVED`/`SUPPRESSED`/`OUT_OF_SERVICE`/`INHIBITED` (`AmsDbContext.ConvertToDb`, `:108-122`) — **not** the `alarms.alarm_state` enum |
| `ack_status` | `BOOLEAN NOT NULL DEFAULT FALSE` | |
| `opc_attributes` | `JSONB NOT NULL DEFAULT '{}'` | the only persisted attribute bag |
| `last_updated` | `TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()` | **only the SQL default / the expiry function set it** — EF ignores `UpdatedAt` (`AmsDbContext.cs:72`), so it is never bumped on an EF update |
| `is_shelved` | `BOOLEAN NOT NULL DEFAULT FALSE` | `36:23` |
| `shelve_until` | `TIMESTAMPTZ(3)` | |
| `shelved_by` | `VARCHAR(255)` | **type mismatch with the EF property `Guid?`** — see BUG-02 |
| `is_suppressed` | `BOOLEAN NOT NULL DEFAULT FALSE` | |

Indexes: `alarm_current_pkey(id)`; `UNIQUE(alarm_id)`; `idx_alarm_current_state(state)`
(`02:54`); `uq_alarm_current_identity UNIQUE(server_id, source, condition, COALESCE(sub_condition,''))`
(`35:59-60`); `idx_alarm_current_source(source)` (`35:66`, `40:26`);
`idx_alarm_current_state_time(state, event_time DESC)` (`35:72`, `40:28`);
`idx_alarm_current_shelved(shelve_until) WHERE is_shelved` (`36:29-31`);
`idx_alarm_current_source_trgm GIN(source gin_trgm_ops)` (`40:30`). Not a hypertable —
correct, it is bounded by the number of standing alarms.

### `alarms.alarm_history` — columns and Timescale config

Base `02_alarm_schema.sql:57-72`: `id UUID PK default uuid_generate_v4()`, `alarm_id VARCHAR(255)`,
`source VARCHAR(1024) NOT NULL`, `severity INT NOT NULL`, `message TEXT`,
`condition`/`sub_condition VARCHAR(512)`, `event_time TIMESTAMPTZ(3) NOT NULL`,
`state VARCHAR(64) NOT NULL`, `ack_status BOOLEAN NOT NULL DEFAULT FALSE`,
`cleared_time TIMESTAMPTZ(3)`, `last_updated TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()`.

`39_timescale_policies.sql:44-63` widens the PK to `(id, event_time)`, then:

- `create_hypertable('alarms.alarm_history','event_time', chunk_time_interval => '1 day', migrate_data => TRUE)`
- compression on, `compress_segmentby='source'`, `compress_orderby='event_time DESC'`
- `add_compression_policy(... '7 days')`
- `add_retention_policy(... '730 days')`

Indexes: `idx_alarm_history_alarm_id(alarm_id)`, `idx_alarm_history_event_time(event_time DESC)`
(`02:74-75`), plus `idx_alarm_history_state_time(state, event_time DESC)`,
`idx_alarm_history_time_source(event_time, source)`, `idx_alarm_history_source_trgm`
(`40:34-39`). **No unique constraint on any business key** — see §4.

Other hypertables created by `39`: `alarms.historical_alarms` (`timestamp`, 1 d chunks, 7 d
compress, 730 d retention) and `alarms.alarm_state_transitions` (`transition_time`, 1 d, 7 d,
730 d). Both are on tables nothing writes.

### Functions / triggers

- `alarms.expire_shelved_alarms()` (`36:47-77`) — the only alarm function in the live path.
  Un-shelves rows past `shelve_until`, sets `state='ACTIVE'`, and inserts an `AUTO_EXPIRED`
  row into `alarms.shelving_actions`. Called once a minute by
  `src/backend/AMS.Api/BackgroundServices/ShelveExpiryService.cs:29`.
- **No triggers** on any alarm table.
- `database/procedures/alarm_operations.sql` defines `alarms.acknowledge_alarm`,
  `batch_acknowledge_alarms`, `shelve_alarm`, a *second* `expire_shelved_alarms`,
  `archive_cleared_alarm`, `get_alarm_statistics`, `analytics.detect_chattering_alarms`,
  `refresh_bad_actor_rankings`, `get_current_alarm_rate`. **It is not under
  `database/scripts/`, so it is never applied**, and nothing in `src/` calls any of them.
  Applying it by hand would overwrite the working `expire_shelved_alarms()` with one that
  targets the dead `alarms.active_alarms` table.

---

## 2. EF Core mapping

`AmsDbContext` (`src/backend/AMS.Infrastructure/Persistence/AmsDbContext.cs`) has exactly two
DbSets: `ActiveAlarms` and `OpcConnections` (`:14-15`). Default schema `alarms` (`:19`).

`ActiveAlarmConfiguration` maps the rich domain entity `AMS.Domain.Alarms.ActiveAlarm`
(489 lines, 40+ properties) onto the 17-column `alarm_current` table by **ignoring 25
properties** (`:71-103`). What that costs:

| Ignored property | Consequence |
|---|---|
| `Priority`, `Category` (`:75-76`) | the repository filters and sorts on them anyway (`AlarmRepositories.cs:77-82,50-51`) → untranslatable LINQ. **BUG-01** |
| `AckTime`, `AckedBy`, `AckComment` (`:81-83`) | who acknowledged an alarm, when, and why is **never persisted**. `AlarmEnricher.cs:95` fabricates `AckTime = UtcNow` on read. |
| `CustomAttributes` (`:102`) | `ApplyAckLifecycle` writes the whole ACK lifecycle into `CustomAttributes` (`ActiveAlarm.cs:306-321`) → the lifecycle state is lost on every reload. **BUG-04** |
| `ShelvedAt`, `ShelveComment`, `SuppressedAt`, `SuppressedBy`, `SuppressionReason` (`:88-95`) | the ISA-18.2 mandatory shelve comment is validated (`AlarmCommands.cs:189`) and then discarded |
| `IsOutOfService` (`:96`) | only the `state` column carries out-of-service; the boolean resets to `false` on reload |
| `ConditionActive` (`:78`) | inferred from `state` on read (`AlarmEnricher.cs:87`) |
| `CreatedAt` / `UpdatedAt` (`:71-72`) | `last_updated` is never refreshed by the API |
| `Quality`, `ProcessValue`, `ProcessUnit`, `CorrelationId`, `RootCauseAlarmId`, `IsRootCause`, `Kafka*` | not stored; `QualityGood` is hardcoded `true` in the DTO (`AlarmEnricher.cs:92`) |

Other mapping notes:

- **No `HasNoKey` entities** anywhere. No owned types, no navigations, so **no N+1 risk** —
  `AlarmEnricher.EnrichAsync` is pure in-memory mapping (`AlarmEnricher.cs:24-33`).
- `AsNoTracking` is used on every read path (`AlarmRepositories.cs:29,42,68,130`,
  `AlarmEnricher.cs:37`). The one deliberately-tracking query is the ingest lookup
  (`AlarmRepositories.cs:140-144`), which is correct.
- `GetByIdAsync` uses `.AsSplitQuery()` on an entity with no navigations
  (`AlarmRepositories.cs:28`) — harmless but pointless.
- **Entity with no table:** none. **Tables with no entity:** `alarm_history`,
  `alarm_state_transitions`, `historical_alarms`, `shelving_actions`, `active_alarms`,
  `opc_servers` — the first two are reached by Dapper, the rest are dead.
- `AmsDbContextModelSnapshot.cs:244` still says `b.ToTable("active_alarms","alarms")`. The
  design-time snapshot has drifted from the runtime configuration; the next
  `dotnet ef migrations add` will generate a rename against the wrong table.
- `03_apply_ef_migrations.sql:180-188` pre-marks all five migrations as applied — including
  `20260528000000_AddTimescaleDbHypertables`, deliberately, so `39_timescale_policies.sql`
  owns the hypertable conversion (documented at `03:170-178`).

---

## 3. State tiers

```
                        ┌──────────────────────────────────────────────┐
   OPC / HTTP feed ────► │ Kafka  raw-alarms  (durable event log)       │
   AlarmIngestionService └──────────────────────────────────────────────┘
   (delta baseline in RAM)                  │
                                            ▼
                        ┌──────────────────────────────────────────────┐
                        │ FLINK  OpcEventStreamJob                     │  ◄── AUTHORITATIVE
                        │  keyed ValueState per alarmKey:              │      ALARM STATE
                        │   DedupFilter.lastEventTime /                │      (checkpointed,
                        │     lastConditionActive / lastAcknowledged   │       exactly-once)
                        │   LifecycleMap.prevState / prevAcknowledged  │
                        └──────────────────────────────────────────────┘
                             │                              │
        ALARM_STATE_UPSERT / ALARM_STATE_DELETE             │ (raw-alarms, 2nd consumer)
                             ▼                              ▼
        ┌────────────────────────────────┐    ┌──────────────────────────────┐
        │ Kafka current-alarm-state      │    │ IoTDBPersistenceJob          │
        │ (COMPACTED, keyed by alarmId)  │    │  + FailLoudIoTDBSink         │
        └────────────────────────────────┘    └──────────────────────────────┘
             │                    │                        │
             │                    │                        ▼
             │                    │            root.ams.site1.alarms.<safeId>
             │                    │            {severity,state,ack_status,
             │                    │             condition_active,priority,
             │                    │             source_name,condition_name}
             │                    │            TTL 365 d on database root.ams
             │                    │                        │
             │                    ▼                        ▼
             │      ┌───────────────────────┐   ┌──────────────────────────┐
             │      │ LiveStateJob (RBE)    │   │ historian-bff  /series   │
             │      │ → live.alarms         │   │ (IoTDB REST v2 reads)    │
             │      └───────────────────────┘   └──────────────────────────┘
             │                    │
             │                    ▼
             │      ┌─────────────────────────────────────────┐
             │      │ sparkplug-edge-node AlarmMetricPublisher │
             │      │  EMQX Sparkplug DDATA                    │
             │      │  Redis CONTRACT tier (noeviction):       │
             │      │   snapshot:metric:<g>:<e>:<dev>:<metric> │
             │      │     SETEX 3600 s                         │
             │      │   snapshot:devices        (SET, no TTL)  │
             │      │   snapshot:index:<device> (SET, no TTL)  │
             │      └─────────────────────────────────────────┘
             ▼
   ┌──────────────────────────────────────────────────────────┐
   │ ams-api NormalizedAlarmConsumerService (batch of 100)     │
   │   NormalizedAlarmIngestor → EF Add / Update / Delete      │
   │   uow.SaveChangesAsync()                                  │  ◄── DERIVED READ MODEL
   │   AlarmReadCache.Invalidate()                             │
   │   AppendHistoryAsync() → alarm_history  (best-effort)     │
   │   consumer.Commit(offsets)                                │
   └──────────────────────────────────────────────────────────┘
             │                              │
             ▼                              ▼
   alarms.alarm_current            alarms.alarm_history
   (bounded projection)            (hypertable, 730 d)
             │
             ▼
   AlarmReadCache (IMemoryCache, 3 s TTL, version-stamped)  ◄── per-process, single-instance
             │
             ▼
   REST /api/v1/alarms/*  +  SignalR AlarmHub  →  browser Zustand alarmStore
```

**Not in the picture:** `ams-api` has no Redis at all — `Program.cs:175` says "Redis removed
per simplified architecture" and `:196` "Single-instance backend does not need Redis
backplane". The only `StackExchange.Redis` reference in `AMS.Api` is an unused `using`
(`Program.cs:22`). No `IConnectionMultiplexer` is registered anywhere in `src/backend`.

---

## 4. Upsert / idempotency — verdict

**A unique identity index exists. There is no upsert.**

- The index is real: `uq_alarm_current_identity UNIQUE(server_id, source, condition,
  COALESCE(sub_condition,''))` (`35_alarm_current_identity.sql:59-60`), covered by four
  integration tests (`Plan01ProjectionIntegrityTests.cs:111-148`). The memory note
  "no upsert index" is **out of date** with respect to the index itself.
- But the write path is a **read-then-write in application code**, not `ON CONFLICT`:
  `GetBySourceNameForIngestAsync` → in-memory match → `Add`/`Update`/`Delete` →
  `SaveChangesAsync` (`NormalizedAlarmIngestor.cs:52-165`, `AlarmRepositories.cs:95-111`).
  A repository-wide grep finds `ON CONFLICT` only in `display-service`, `auth-service` and
  `cplm-api` — **zero occurrences for any `alarms.*` table**.
- Consequence: the unique index is a *tripwire*, not a merge. Two events for the same
  **new** alarm inside one 100-record Kafka batch both take the `matches.Count == 0` branch
  (the second one's DB query cannot see the first one's un-flushed insert), and both call
  `Add` with the same deterministic `Id` → the second `Add` throws. See BUG-03.
- **No Flink JDBC sink writes any alarm table.** `OpcEventStreamJob.java:22` states it
  explicitly, and a grep for `jdbc|JdbcSink|INSERT INTO|ON CONFLICT` over
  `src/flink/src/main/java` returns only `PipelineConfig.java:82` (a `DB_URL` field that is
  never read by any job) and comments. So "does the Flink sink blind-insert?" is moot:
  Flink never touches PostgreSQL.
- `alarm_history` **is** a blind insert: `INSERT INTO alarms.alarm_history (...) VALUES (...)`
  with no conflict clause (`AlarmRepositories.cs:249-255`) and no unique index on any
  business key. Kafka redelivery (offset commit failure, partition rebalance, DLQ retry)
  duplicates rows and nothing de-duplicates on read, so ISA-18.2 rate / bad-actor KPIs
  over-count after any redelivery.

---

## 5. IoTDB

**Writer.** `src/flink/src/main/java/com/ams/flink/IoTDBPersistenceJob.java` consumes
`raw-alarms` (group `flink-ams-iotdb-persistence`, committed-offsets-with-earliest-fallback,
`:47-58`), maps each event to `IoTDBAlarmRow` (`:111-180`) and writes through
`FailLoudIoTDBSink` (`:71-75`).

**Path scheme.** `root.ams.site1.alarms.<sanitisedAlarmId>` where the sanitisation is
`alarmId.replaceAll("[^a-zA-Z0-9_]", "_")` (`IoTDBPersistenceJob.java:132`). This is the
canonical alarm-identity rule; `binding-resolver` re-implements it byte-for-byte at
`src/services/binding-resolver/Program.cs:135-136` and the browser asks that endpoint rather
than guessing (`src/frontend-ob/src/utils/iotdbPaths.ts:92`).

**Measurements** (7 per event, `IoTDBAlarmRow.java:9-30`): `severity`, `state`
(`ACTIVE|CLEARED|ACKNOWLEDGED`), `ack_status`, `condition_active`, `priority`, `source_name`,
`condition_name`. Timestamp is the **source** event time (`eventTimeEpochMs`, falling back to
`activeTimeEpochMs`, then `System.currentTimeMillis()` if both are ≤ 0 — `:137-138`).

**Durability.** `FailLoudIoTDBSink` buffers to `batchSize` (default 500) and flushes
synchronously inside `snapshotState` (`FailLoudIoTDBSink.java:84-88`); three failed attempts
throw, failing the checkpoint so Kafka replays (`:126-150`). The job checkpoints every 60 s
AT_LEAST_ONCE (`IoTDBPersistenceJob.java:43`) — safe because IoTDB `(series, timestamp)`
writes are idempotent. Latency floor is therefore ~60 s at low event rates (documented at
`:35-37`).

**Collision guard.** A bounded `ConcurrentHashMap` (50 000 entries,
`IoTDBPersistenceJob.java:87-102`) logs a warning when two distinct alarm ids sanitise to the
same path segment. It only warns — the two histories still interleave.

**Retention.** `infra/docker/iotdb-init-ttl.sh` sets `SET TTL TO root.ams 365 days`. The
script's own comment records that the original per-subtree TTLs never applied because
`auto_create_schema` made `root.ams` the database. The alarm-tree TTL uses the *silent*
`run_sql` helper (`|| true`), so an alarm-TTL failure is not surfaced; only the loop tree
(`root.site1`) gets the verifying `run_sql_v` and the final `SHOW ALL TTL` assertion.

**Readers.** `src/services/historian-bff` — `IoTDbClient.cs` (REST v2; `StripPrefix` at
`:217-241` understands the alarm path shape) and `Program.cs:365-366`
(`SHOW TIMESERIES root.ams.site1.alarms.**`). Reads are gated by `historian.view` and by an
`assetScope` prefix check (`Program.cs:378-395`). `ams-api`'s own
`Services/IotDbWriteClient.cs` is loop/CPLM-only and writes under `root.site1.cpm.*` —
`:33-36` states it is "Deliberately NOT root.ams.*".

---

## 6. Redis

`ams-api` does not use Redis (§3). Two Redis instances exist
(`infra/docker/docker-compose.yml:118-174`), neither published to the host:

| Tier | Container | Policy | Alarm-relevant contents |
|---|---|---|---|
| cache | `ams-redis` | `--maxmemory 512mb --maxmemory-policy volatile-lru`, AOF everysec, `requirepass` | gateway rate-limit counters `rl:{class}:{clientId}:{windowStart}` (`src/services/gateway/RateLimit/RedisRateLimiter.cs:79`), gateway response cache, asset-cache invalidation pub/sub |
| contract | `ams-redis-contract` | `--maxmemory 256mb --maxmemory-policy noeviction`, AOF everysec, `requirepass` | **alarm live snapshots** and the Sparkplug alias registry |

**Alarm keys on the contract tier** (written by
`src/services/sparkplug-edge-node/src/main/java/com/ams/sparkplug/AlarmMetricPublisher.java`):

- `snapshot:metric:<group>:<edge>:<device>:{alarmId,severity,state,acknowledged,conditionActive,priority}`
  → `{"v":…,"q":192,"ts":…}`, written with `SETEX cfg.redisTtlSeconds` (`:550-567`, `:463-471`).
  `REDIS_TTL_SECS` defaults to **3600** (`SparkplugConfig.java:87`).
- `snapshot:devices` — SET of device ids, **no TTL** (`:470`, `:564`).
- `snapshot:index:<device>` — SET of that device's snapshot keys, **no TTL** (`:471`, `:565`).
- `alias:<group>:<edge>` — Sparkplug alias hash (`:42`).

**Readers.** `historian-bff` `/snapshot` uses `SMEMBERS snapshot:index:<device>` + `MGET` and
lazily removes index members whose snapshot key expired
(`src/services/historian-bff/Program.cs:339-341`); `binding-resolver` `PathResolver.cs`
resolves live bindings. The browser reads snapshots via `/api/hist/snapshot`
(`src/frontend-ob/src/store/mqttStore.ts:44`).

**"Lua vs maxmemory" trap — verified absent.** A repo-wide grep for
`ScriptEvaluate|EVAL |LuaScript|redis.call` over `src/` returns **no matches**. No Redis Lua
script exists in this codebase, so that trap does not apply to the current tree. The live
risk on the contract tier is the opposite one: two **un-TTL'd sets**
(`snapshot:devices`, `snapshot:index:*`) growing forever on a `noeviction` instance — BUG-09.

---

## 7. In-memory alarm state

| Holder | Contents | Thread-safety | Bounded? | Loss on restart |
|---|---|---|---|---|
| `AlarmReadCache` (`src/backend/AMS.Infrastructure/Caching/AlarmReadCache.cs`) | alarm list/stats responses, key `alarms:{version}:{querystring}`, 3 s TTL | `IMemoryCache` + `Interlocked` version stamp (`:29,33`) | by TTL only; a distinct query string per poll creates a distinct entry | harmless (rebuilt from Postgres). Explicitly single-instance-only (`:11-14`) |
| `AlarmIngestionService._lastSnapshot` (`src/backend/AMS.Api/BackgroundServices/AlarmIngestionService.cs:50`) | last-seen HTTP-feed snapshot per alarmId — the **delta baseline** for emitting CLEARED | `ConcurrentDictionary` | **no** — cleared entries are updated in place (`:133`) but never removed | **yes, and it matters** — BUG-05 |
| `AckSlaWatchdogService._states` (`src/backend/AMS.Infrastructure/Kafka/AckSlaWatchdogService.cs:23`) | in-flight ACK lifecycle per `alarmId:correlationId` | `ConcurrentDictionary` | removed on terminal states (`:86-90`); a lifecycle that never terminates leaks | yes — but the service **is not registered** in `Program.cs`, so it never runs (BUG-17) |
| `AlarmHub._connections` (`src/backend/AMS.Api/Hubs/AlarmHub.cs:28`) | SignalR connection metadata | `ConcurrentDictionary` | removed on disconnect | yes (irrelevant) |
| `TelemetryIngestState` (`.../Kafka/TelemetryIngestState.cs`) | ingest heartbeat counters | `Interlocked` + `volatile` + lock | O(1) | yes (health only) |
| `ReadinessHistoryStore` (`.../Health/ReadinessHistoryStore.cs`) | last 48 readiness snapshots | `lock` | capped at 48 (`:11,24-25`) | yes (health only) |
| `IotDbWriteClient._ensuredDevices` (`src/backend/AMS.Api/Services/IotDbWriteClient.cs:46`) | devices whose timeseries DDL succeeded | `lock` (`:47`) | grows with distinct loop devices | yes (re-issues idempotent DDL) |
| Flink `DedupFilter` / `LifecycleMap` keyed state | the real alarm state machine | Flink keyed state (single-threaded per key) | `LifecycleMap` clears on CLEARED (`PipelineOperators.java:264-268`); **`DedupFilter` never clears and has no `StateTtlConfig`** | survives restart via checkpoints/savepoints |
| Browser `alarmStore` (`src/frontend-ob/src/store/alarmStore.ts`) | operator's view | Zustand/immer | pruned (`:414-419`) | yes (re-fetched) |

---

## 8. Where authoritative alarm state lives

**Apache Flink keyed state is authoritative.** Evidence:

1. `OpcEventStreamJob.java:22` — "PostgreSQL is updated only by the API projection consumer
   — no Flink JDBC sinks." Verified by grep (§4).
2. `NormalizedAlarmIngestor.cs:11-12` — "Idempotent upsert contract… PostgreSQL is
   at-least-once; **Kafka+Flink are source of truth**."
3. `ActiveAlarm.ApplyAckLifecycle` is documented as "materialized view projection — **not
   authoritative**" (`ActiveAlarm.cs:303`).
4. `KafkaOptions.UseFlinkOrchestration` — "Must be true: Flink is the sole lifecycle/ACK
   orchestration engine" (`KafkaConsumerService.cs:36-37`).

Everything below it is derived:

| Tier | Role | Consistency mechanism |
|---|---|---|
| Flink keyed state + `raw-alarms` log | authority | EXACTLY_ONCE checkpoints every 30 s (`OpcEventStreamJob.java:32`), externalized RETAIN_ON_CANCELLATION |
| Kafka `current-alarm-state` | durable materialized view, **compacted**, keyed by `alarmId` (`OpcEventStreamJob.java:146-150`) | log compaction keeps the latest per alarm |
| `alarms.alarm_current` | read model for REST | rebuilt by replaying the compacted topic; the batch is persisted **before** offsets are committed (`KafkaConsumerService.cs:310-333`) |
| `alarms.alarm_history` | analytics log | appended **after** the projection commits; failure logged and swallowed (`KafkaConsumerService.cs:322-331`) |
| IoTDB `root.ams.site1.alarms.*` | historian | independent consumer group off `raw-alarms`; fail-loud sink |
| Redis `snapshot:*` | paint-on-open live values | independent of Postgres; `noeviction` + 1 h TTL |
| `AlarmReadCache` | 3 s response cache | version-stamped; invalidated on every projection write (`KafkaConsumerService.cs:314-316`, `LifecycleEventConsumerService.cs:85-87`) |

### Consistency risks

- **Dual write, no transaction.** `SaveChangesAsync` (projection) and `AppendHistoryAsync`
  (history) run on two different connections — EF's `AmsDbContext` and a raw
  `NpgsqlDataSource` — with no shared transaction (`KafkaConsumerService.cs:310,324`). The
  ordering is deliberate and correct (history can only lag, never lead), but the two can
  disagree indefinitely: a history failure is logged and the batch still commits.
- **Operator writes bypass Flink for shelve/suppress/out-of-service.** ACK goes the right
  way (`AcknowledgeAlarmCommandHandler` only publishes to `operator-actions`,
  `AlarmCommands.cs:74-79`), but shelve/unshelve/suppress/OOS write straight into
  `alarm_current` (`:226-227,304-305,361-362,416-417`). Flink knows nothing about them, so
  the next `ALARM_STATE_UPSERT` for that alarm runs `ApplyConditionChange`
  (`NormalizedAlarmIngestor.cs:151`) and can move `state` off `SHELVED` while `is_shelved`
  stays `true`. **Requires runtime verification** of the exact interleaving; the code path
  has no guard against it.
- **Two writers to `alarm_current` with different delivery guarantees.**
  `NormalizedAlarmConsumerService` (manual commit, batched, retried) and
  `LifecycleEventConsumerService` (`EnableAutoCommit = true`, `AutoOffsetReset.Latest`,
  `LifecycleEventConsumerService.cs:38-39`). The latter can lose events on crash and starts
  at the tail — an ACK lifecycle spanning a restart is simply dropped.
- **`alarm_current` rows are deleted, not tombstoned, on clear**
  (`NormalizedAlarmIngestor.cs:138,156,191`). Any consumer expecting to find a cleared alarm
  in the projection will not.

---

## 9. Alarm-row lifecycle

```
NEW ACTIVATION
  raw-alarms → Flink LifecycleMap (prevState==null → "NEW"/"ACTIVE")
             → ALARM_STATE_UPSERT (conditionActive=true)
  ams-api    → matches.Count==0 && ConditionActive → ActiveAlarm.CreateFromOpcEvent
             → INSERT alarms.alarm_current (state='ACTIVE', ack_status=false)
             → AppendHistoryAsync row  state='ACTIVE',  cleared_time=NULL
             → SignalR OnNewAlarm

SUBSEQUENT UPDATE (severity / message change)
             → matches.Count>0 → ApplyConditionChange → UPDATE alarm_current in place
             → AppendHistoryAsync row  state='ACTIVE' | 'ACKNOWLEDGED'
             → SignalR OnAlarmUpdated

ACKNOWLEDGE (operator)
  POST /alarms/{id}/acknowledge
             → publishes to Kafka operator-actions ONLY — no DB write here
  Flink      → ack-writeback → OPC gateway → DCS → ack-results
             → ACK_STATE_UPDATE on current-alarm-state  (conditionActive ABSENT!)
             → LIFECYCLE_EVENT on lifecycle-events
  ams-api    → ACK_STATE_UPDATE: ApplyAckLifecycle only, conditionActive untouched
             → UPDATE alarm_current SET ack_status=true, state='ACTIVE'
             → ack lifecycle detail → CustomAttributes → DISCARDED (EF-ignored)   ◄ BUG-04
             → AppendHistoryAsync writes state='CLEARED', cleared_time=eventTime  ◄ BUG-06
             → lifecycle consumer UPDATEs the same row again (second writer)

ACKNOWLEDGE (external HMI via OPC)
             → normal ingest path, evt.Acknowledged=true
             → ReconcileAcknowledgement + OpcAttributes["ackSource"]="External OPC Client"
             → UPDATE alarm_current (ack_status=true); OpcAttributes IS persisted

CLEAR / RETURN-TO-NORMAL
  Flink      → conditionActive=false → toDeleteAlarmStateJson → ALARM_STATE_DELETE
             → LifecycleMap clears its keyed state
  ams-api    → HandleDeleteAsync → SignalR OnAlarmCleared → DELETE FROM alarm_current
             → BuildHistoryRecords SKIPS ALARM_STATE_DELETE                       ◄ BUG-07
               ⇒ the clear is recorded NOWHERE in alarms.alarm_history
  IoTDB      → separate raw-alarms consumer DOES record state='CLEARED'

SHELVE
  POST /alarms/{id}/shelve (comment mandatory, ≤ 480 min)
             → domain sets IsShelved / ShelvedAt / ShelvedBy / ShelveUntil /
               ShelveComment, State=Shelved
             → UPDATE alarm_current SET is_shelved, shelve_until, shelved_by,
                                        state='SHELVED'
               (ShelvedAt + ShelveComment are EF-ignored → lost)
             → NO row in alarms.shelving_actions                                  ◄ BUG-08
             → NoOpOpcDcsGateway (Opc/NoOpOpcDcsGateway.cs) — DCS suppression is a no-op

SHELVE EXPIRY  (ShelveExpiryService, every 60 s)
             → alarms.expire_shelved_alarms()
             → UPDATE alarm_current SET is_shelved=false, shelve_until=NULL,
                                        state='ACTIVE', last_updated=NOW()
             → INSERT alarms.shelving_actions (action='AUTO_EXPIRED')  ← the only writer

UNSHELVE / SUPPRESS / OUT-OF-SERVICE
             → UPDATE alarm_current (state, plus is_suppressed for suppress)
             → IsOutOfService boolean is EF-ignored — only `state` survives
             → no audit row anywhere

PURGE (lab)
  POST /alarms/active/purge-lab-data → ExecuteDeleteAsync over pattern matches

RETENTION
  alarm_history / historical_alarms / alarm_state_transitions: chunks compressed at 7 d,
  dropped at 730 d.  alarm_current: bounded by DELETE-on-clear (no retention policy).
  IoTDB root.ams: TTL 365 d.
```

**Is history append-only?** `alarm_history` is INSERT-only from the application
(`AlarmRepositories.cs:249-255`) — nothing UPDATEs or DELETEs it except the Timescale
retention policy. `alarm_current` is mutated in place and deleted on clear.

**Is there an audit trail, and is it written?** Only `alarms.shelving_actions`, and only for
`AUTO_EXPIRED`. Operator ACK / shelve / unshelve / suppress / OOS produce **no database audit
row**; `audit.immutable_events` in `traverse_audit` is written by `audit-service` and no alarm
code path calls it (a grep for `audit` across `src/backend/**/*.cs` finds only an
authorization policy name and comments). The only durable operator-action record is the Kafka
`operator-actions` topic, whose retention is finite.

---

## 10. Migrations & drift

- **Bootstrap is one-shot.** `database/scripts` is mounted at `/docker-entrypoint-initdb.d`
  (`docker-compose.yml:58`), which the postgres image runs **only when the data directory is
  empty**. There is no migration runner: a new `NN_*.sql` added to the folder never reaches
  an existing volume. Every alarm script is written idempotently (`IF NOT EXISTS`, guarded
  `DO $$`), so a manual re-run is safe, but nothing does it automatically.
- **Ordering is lexicographic and currently correct** for the alarm path: `01`
  (extensions/schemas) → `02` (alarm_current / alarm_history) → `03` (EF tables + EF history)
  → `35` (identity) → `36` (shelving) → `39` (hypertables; must follow `02`/`03` because it
  widens their PKs) → `40` (hot indexes; must follow `39` so indexes propagate to chunks).
  `17_display_background_token_migration.sql` sorts before `17_traverse_auth_schema.sql`
  (`d` < `t`) — no conflict, but two files sharing prefix `17` is fragile.
- **`\c` targets exist by the time they run:** `39` switches to `traverse_analysis` (created
  by `14`) and `traverse_cplm` (created by `29`); `40` switches to `ams`. Scripts `35`/`36`
  have no `\c` and therefore run against `POSTGRES_DB=ams` — correct.
- **Fresh-DB failure candidates:** none found for the alarm path. `35`'s
  `ALTER COLUMN server_id SET NOT NULL` is safe on an empty table; `39`'s PK widening is
  guarded by a `pg_constraint` lookup; `create_hypertable(..., if_not_exists => TRUE,
  migrate_data => TRUE)` is re-runnable. **Requires verification on a real fresh volume** —
  the integration fixture loads only `01, 02, 35, 36`
  (`Plan01ProjectionIntegrityTests.cs:45-53`), so `03`, `39` and `40` have no automated
  bootstrap coverage.
- **Code referencing schema not in `database/scripts/`:** none for alarms.
  `audit.immutable_events` is created by `audit-service` `EnsureCreated()` at runtime
  (documented at `24_traverse_audit_db.sql:3-4`) — a deliberate exception.
- **Drift to fix:** (a) `AmsDbContextModelSnapshot.cs:244` still maps `ActiveAlarm` to
  `active_alarms`; (b) `database/procedures/alarm_operations.sql` is unapplied and conflicts
  with `36`; (c) `02_alarm_schema.sql` creates `configuration.opc_servers` while `03` creates
  `configuration.opc_connections` for the same purpose (`03:126-129` acknowledges the
  duplication); (d) `01_init_extensions.sql:30-84` carries ~55 lines of commented-out ENUM
  definitions that no longer match the four types `03` actually creates.

---

## 11. Bugs

| # | Sev | Title | Evidence | Impact |
|---|---|---|---|---|
| BUG-01 | **Critical** | Active-alarm list filters/sorts on EF-ignored properties | `AlarmRepositories.cs:77-82` filters `a.Priority`/`a.Category`; `:50-51` sorts by `a.Priority`; both are `b.Ignore(...)` at `AmsDbContext.cs:75-76` | `GET /api/v1/alarms/active?priority=…`, `?category=…` or `?sortBy=Priority` cannot be translated to SQL → EF throws → 500 on the operator console's primary screen. The DATA-10 fix that added these filters never checked the mapping. **Requires runtime confirmation of the exact exception**; the property is definitively not in the model. |
| BUG-02 | **High** | `shelved_by` type mismatch: `Guid?` property vs `VARCHAR(255)` column | domain `ActiveAlarm.cs:115` `public Guid? ShelvedBy`; mapping `AmsDbContext.cs:91` with no `HasColumnType`; DDL `36_alarm_shelving.sql:26` `shelved_by VARCHAR(255)`; the integration test writes a *string* (`Plan01ProjectionIntegrityTests.cs:159`) | Npgsql infers `uuid` for a `Guid` parameter → `POST /alarms/{id}/shelve` should fail with `42804 column "shelved_by" is of type character varying but expression is of type uuid`. **Requires runtime verification** — no test exercises the EF shelve path. |
| BUG-03 | **High** | No upsert: two events for the same *new* alarm in one batch abort the batch | `NormalizedAlarmIngestor.cs:52-57` queries the DB for matches (cannot see un-flushed inserts) then `:96` `AddAsync`; ids are deterministic (`:270-282`, `AlarmPartitionKeys.cs:53-59`); batch size 100 (`KafkaConsumerService.cs:203`) | The second `Add` with the same PK throws; four retries replay the identical batch (`KafkaConsumerService.cs:298-348`) and then the **whole 100-event batch goes to the DLQ**. An `ON CONFLICT` upsert or a per-batch local dictionary removes the class entirely. |
| BUG-04 | **High** | ACK lifecycle state is never persisted | `ActiveAlarm.ApplyAckLifecycle` writes only to `CustomAttributes` (`ActiveAlarm.cs:306-321`); `AmsDbContext.cs:102` ignores `CustomAttributes` | `GetAckLifecycleState()` always returns `null` after a reload, so `LifecycleEventConsumerService.cs:68-72`'s "do not regress terminal ACK states" guard is inert, `OpcCookieHelper`'s pending-ACK checks see nothing, and the console loses ACK progress on refresh. Only the `ack_status` boolean survives. |
| BUG-05 | **High** | HTTP-feed delta baseline is RAM-only → ghost alarms after an ams-api restart | `AlarmIngestionService._lastSnapshot` (`:50`); CLEARED is emitted only for ids present in that dictionary (`:127-136`) | An alarm that clears while `ams-api` is down is never emitted as CLEARED, so its `alarm_current` row is never deleted and the operator sees a standing alarm that no longer exists in the DCS. The dictionary is also never pruned → unbounded growth over process lifetime. |
| BUG-06 | **High** | ACK confirmations are written to `alarm_history` as bogus CLEARED rows | `toAckConfirmedState` deliberately omits `conditionActive` (`OpcEventStreamJob.java:299-300`) → C# `bool ConditionActive` defaults `false` (`KafkaConsumerService.cs:83`) → `BuildHistoryRecords` writes `state='CLEARED'`, `cleared_time=eventTime`, `severity=100` (`:442-456`) | Every ACK inserts a false "cleared" event. The ISA-18.2 fleeting-alarm KPI (`AnalyticsController.cs:48-52`, `cleared_time - event_time < 60s`) then counts every acknowledgement as a fleeting alarm, since `cleared_time == event_time`. |
| BUG-07 | **High** | Real clears are never recorded in `alarm_history` | Flink emits `ALARM_STATE_DELETE` (not an UPSERT) for `conditionActive=false` (`OpcEventStreamJob.java:139-142`, `PipelineOperators.java:441-456`); `BuildHistoryRecords` skips that event type (`KafkaConsumerService.cs:438-439`) | `alarms.alarm_history` has no return-to-normal record and (apart from BUG-06's false rows) `cleared_time` is always NULL. Alarm duration, chattering and fleeting analytics are unusable. IoTDB *does* record the clear, so the two historians disagree. |
| BUG-08 | **High** | Operator shelve/unshelve leaves no audit row | `ShelveAlarmCommandHandler` (`AlarmCommands.cs:213-250`) and `UnshelveAlarmCommandHandler` (`:291-315`) only `SaveChangesAsync`; the only `INSERT INTO alarms.shelving_actions` is inside `alarms.expire_shelved_alarms()` (`36:63-72`) | ISA-18.2 §11 requires a shelving record. The mandatory comment (validated at `AlarmCommands.cs:189`) is also dropped because `ShelveComment` is EF-ignored (`AmsDbContext.cs:90`). |
| BUG-09 | **High** | `snapshot:devices` / `snapshot:index:*` have no TTL on a `noeviction` Redis | `AlarmMetricPublisher.java:470-471,564-566` use `sadd` with no expiry; `docker-compose.yml:162-163` `--maxmemory 256mb --maxmemory-policy noeviction` | The index sets grow monotonically with every device ever seen while the value keys expire at 1 h. On a `noeviction` instance that ends in OOM-on-write, breaking the paint-on-open snapshot contract. `historian-bff` prunes stale *members* lazily (`Program.cs:339-341`) but never removes a device from `snapshot:devices`. |
| BUG-10 | **Medium** | `alarm_history` state vocabulary mismatch — the state filter never matches | writer emits `ACTIVE`/`ACKNOWLEDGED`/`CLEARED` (`KafkaConsumerService.cs:442-444`); reader filters `state = @State` with `UNACKNOWLEDGED_UNCLEARED`… (`AlarmRepositories.cs:180-182,281-292`) | `GET /api/v1/alarms/historical?state=…` always returns zero rows, and `idx_alarm_history_state_time` is never used. |
| BUG-11 | **Medium** | Shelve/suppress/OOS state is invisible in the API response | `AlarmEnricher.MapToDto` hardcodes `IsShelved:false, IsSuppressed:false, IsOutOfService:false, ShelveUntil:null, ShelveComment:null, SuppressionReason:null` (`AlarmEnricher.cs:89-100`); `GetStatsSummaryAsync` hardcodes `Shelved:0, Suppressed:0` (`:49-50`) | The DOM-02 persistence work landed in the schema and EF but the read model still reports every alarm as un-shelved. The `?isShelved=` filter runs in SQL and works, so the returned rows contradict the filter. |
| BUG-12 | **Medium** | Flink `DedupFilter` keyed state grows without bound | `PipelineOperators.java:103-118` — three `ValueState`s per `alarmKey`, never `clear()`ed (contrast `LifecycleMap` at `:264-268`), and no `StateTtlConfig` anywhere in `src/flink` | RocksDB state grows with the number of distinct alarm keys ever seen and is carried through every checkpoint/savepoint forever. |
| BUG-13 | **Medium** | `alarm_state_transitions` is exposed as an API but nothing writes it | writer: none (§1); readers `AlarmTransitionRepository.cs:59,64,81`, endpoints `AlarmsController.cs:402,432`, UI export `src/frontend-ob/src/components/HistoricalViewer/HistoricalViewer.tsx:131` | The SOE-replay export silently produces an empty file. Timescale compression/retention policies are maintained on a permanently empty hypertable. |
| BUG-14 | **Medium** | Stats summary materialises every active alarm row | `AlarmEnricher.cs:37-48` — `.Select(a => new { a.Severity, a.Acknowledged }).ToListAsync()` then eight in-memory `Count(...)` passes | One row per standing alarm crosses the wire on every stats call (3 s cache). During an alarm flood that is exactly when it hurts. A single `GROUP BY` would return ≤ 5 rows. |
| BUG-15 | **Medium** | `last_updated` is never refreshed by the API | `AmsDbContext.cs:71-72` ignores `CreatedAt`/`UpdatedAt`; only the column default and `expire_shelved_alarms()` set it | Anything reasoning about staleness from `last_updated` gets the row's insert time. |
| BUG-16 | **Medium** | `LifecycleEventConsumerService` auto-commits and starts at the tail | `LifecycleEventConsumerService.cs:38-39` (`AutoOffsetReset.Latest`, `EnableAutoCommit = true`) while it mutates `alarm_current` at `:82-84` | ACK lifecycle updates are silently lost across a restart or a crash mid-processing — the opposite guarantee from the projection consumer next to it. |
| BUG-17 | **Medium** | `AckSlaWatchdogService` is never registered | class at `AckSlaWatchdogService.cs:14`; no `AddHostedService<AckSlaWatchdogService>` in `src/backend/AMS.Api/Program.cs` | ACK SLA breach alerts (`ACK_SLA_BREACH`) and the ACK-timeout watchdog never fire; nothing produces to `lifecycle-alerts` on this path. |
| BUG-18 | **Low** | Trigram GIN index on a compressed hypertable column | `40_alarm_hot_indexes.sql:38-39` creates `idx_alarm_history_source_trgm`; `39:65-68` compresses `segmentby='source'` after 7 days | Indexes are not maintained on compressed chunks, so `source ILIKE '%…%'` over data older than 7 days decompresses rather than probing. The plan's "drop indexes with `idx_scan = 0`" review will flag this one. |
| BUG-19 | **Low** | `alarm_history` compression complicates late backfill | `39:65-69` compression policy at 7 days; blind `INSERT` writer | A Kafka replay older than 7 days writes into compressed chunks. Behaviour depends on the TimescaleDB version — **Unknown / Requires Verification** against the deployed `timescale/timescaledb:latest-pg15`. |
| BUG-20 | **Low** | `database/procedures/alarm_operations.sql` is a loaded gun | not under `database/scripts/`, so never applied; defines a conflicting `alarms.expire_shelved_alarms()` operating on the dead `alarms.active_alarms` (`:229`) | Anyone who "restores the stored procedures" breaks shelve expiry. |
| BUG-21 | **Low** | `AsSplitQuery()` on an entity with no navigations | `AlarmRepositories.cs:28` | Dead configuration; misleads the next reader into thinking there are includes. |
| BUG-22 | **Low** | `alarm_history` streaming holds a pooled connection for the whole enumeration | `AlarmRepositories.cs:264-279` (`QueryUnbufferedAsync` inside an async iterator) | A slow or abandoned NDJSON client pins one of the (default 100) pool slots. Bounded by pool size, not a leak — `await using` disposes on enumerator disposal. |
| BUG-23 | **Low** | IoTDB alarm-tree TTL failures are swallowed | `infra/docker/iotdb-init-ttl.sh` uses `run_sql` (`… \|\| true`) for `SET TTL TO root.ams`; only the loop tree uses the verifying `run_sql_v` + final `SHOW ALL TTL` assertion | If the alarm TTL silently fails, `root.ams` grows unbounded and nothing reports it. |

### Checked and found *not* to be bugs

- **Timestamp types.** Every alarm timestamp column is `TIMESTAMPTZ` (`(3)` on the hot ones).
  No naive `timestamp` anywhere in the alarm schema, and all C# parameters are
  `DateTimeOffset`. Timezone handling is correct.
- **SQL injection in dynamic ORDER BY.** Both dynamic-SQL repositories map `SortBy` through a
  closed `switch` (`AlarmRepositories.cs:198-203`, `AlarmTransitionRepository.cs:47-52`);
  every value is a Dapper parameter.
- **Cascade deletes.** There are no foreign keys between alarm tables at all, hence no cascade
  risk (and no referential integrity either — `shelving_actions.alarm_id` is not an FK).
- **Missing index on the hot list path.** Covered: `idx_alarm_current_state_time`,
  `uq_alarm_current_identity` (leads with `server_id, source`, so the ingest probe is an index
  scan), `idx_alarm_current_source_trgm` for `ILIKE '%…%'`, and the matching trio on
  `alarm_history` (`40_alarm_hot_indexes.sql`).
- **`AsNoTracking` on read paths.** Present everywhere it should be.
- **Redis Lua vs maxmemory.** No Lua scripts exist in this repo (§6).
- **Connection pooling.** EF and Dapper share one `NpgsqlDataSource` singleton
  (`Program.cs:62-71`), so there is one pool, with `EnableRetryOnFailure(5)` and a 60 s command
  timeout. `MaxPoolSize` is left at the Npgsql default of 100 — **Unknown / Requires
  Verification** whether that is right for the deployed load.
