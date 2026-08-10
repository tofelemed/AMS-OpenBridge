# 04 — Data Layer Performance

**Purpose:** audit PostgreSQL/TimescaleDB, IoTDB, and Redis for schema/index correctness, contract-vs-eviction, caching, and retention.
**Reviewed commit:** `4e2758c951df06a170f35d23313824cb57c9ef03`
**Date:** 2026-08-08
**Anchors:** Postgres covering/partial indexing, Timescale hypertable+compression+retention, Npgsql/PgBouncer pooling, EF read-path hygiene, IoTDB deployment guidance (spec §6), Redis persistence/eviction correctness.
**Verification:** H-13, H-14, H-15, H-18, H-19 in [PHASE1-VERIFICATION.md](./PHASE1-VERIFICATION.md); index inventory in `evidence-E-database.md`.

### Domain summary grades

| Store | Lab | Prod | GAP |
|---|---|---|---|
| PostgreSQL schema/index | C | D | No upsert-key index (DATA-01), missing hot indexes (DATA-10), wrong-DB scripts (DATA-11) |
| TimescaleDB usage | C | D | Hypertables/retention absent on docker init (DATA-02) |
| IoTDB | B | D | Standalone vs 3C3D (DATA-04) |
| Redis | B | C | Evictable contract keys, no auth (DATA-03) |
| API-tier caching | C | C | None (DATA-08, DATA-09) |
| Pooling | C | C | Default pool, no PgBouncer (DATA-05) |

---

## 1. PostgreSQL — schema, indexes, and the upsert-key verdict

### 1.1 Per-database index posture (summary; full inventory in evidence-E §2)

82 `CREATE [UNIQUE] INDEX` in live `database/scripts/` (9 unique). The best-indexed area is **CPLM** (`30/32/34`): upsert-backing uniques (`uq_cplm_*_window` on `(loop_id,window_kind,window_end,source)`), `(loop_id,window_kind,window_end DESC)` composites, `lower(loop_id)` functional, and a partial-unique open-frame index — these correctly back real `ON CONFLICT` upserts. `traverse_assets`, `traverse_displays`, `traverse_templates` are adequately indexed for their CRUD predicates. The **weak area is the AMS alarm core**.

### 1.2 H-14 — the projection upsert-key verdict (AMENDED → DATA-01)

The claimed key `serverId+sourceName+conditionName+subConditionName` exists **only as a code comment** (`NormalizedAlarmIngestor.cs:10-12`). Reality:
- The live projection table is `alarms.alarm_current` (`AmsDbContext.cs:29`), whose DDL (`02_alarm_schema.sql:37-52`) has **no `server_id` column** (`ServerId` is `b.Ignore`'d) and only `UNIQUE(alarm_id)` + `idx_alarm_current_state(state)`.
- No index anywhere references `sub_condition_name` (DL-4). The richer `alarms.active_alarms` table *has* the four columns but is orphaned (EF remapped to `alarm_current`; its procedure layer is unmounted).
- The "upsert" is app-level read-modify-write via `AlarmRepositories.cs:114-118`, whose predicate filters `source` only (serverId ignored) and is **unindexed** — every Kafka event sequentially scans `alarm_current`.
- DB dedup rests on `UNIQUE(alarm_id)`, whose value equals the 4-part key only when Flink supplies no `AlarmId`; casing and cross-server same-name tags bypass it.

**Consequence:** at-least-once redelivery or a second API instance can throw `23505` (crashing the consume loop) or create duplicate logical alarms.

**Remediation DDL (DATA-01):**
```sql
ALTER TABLE alarms.alarm_current ADD COLUMN server_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
CREATE UNIQUE INDEX uq_alarm_current_identity
  ON alarms.alarm_current (server_id, source, condition, COALESCE(sub_condition, ''));
-- then convert the read-modify-write to INSERT ... ON CONFLICT (server_id, source, condition, sub_condition) DO UPDATE
```

### 1.3 Hot-predicate audit — missing indexes as concrete DDL (DATA-10)

| Query class | Table | Predicate/sort | Existing | Missing DDL |
|---|---|---|---|---|
| Ingest match (per-event, hot) | `alarm_current` | `source = $1` | none | `CREATE INDEX idx_alarm_current_source ON alarms.alarm_current(source);` (subsumed by the unique above) |
| Active alarm list | `alarm_current` | `state IN(...)` + `source ILIKE '%x%'`, ORDER BY event_time | `idx_alarm_current_state` | `CREATE INDEX idx_alarm_current_state_time ON alarms.alarm_current(state, event_time DESC);` and `CREATE INDEX idx_alarm_current_source_trgm ON alarms.alarm_current USING gin (source gin_trgm_ops);` (pg_trgm already installed) |
| History search | `alarm_history` | `event_time BETWEEN` + `state=` + `source ILIKE` | `idx_alarm_history_event_time` | `CREATE INDEX idx_alarm_history_state_time ON alarms.alarm_history(state, event_time DESC);` + trigram GIN on `source` |
| 7d bad-actor KPI | `alarm_history` | 7d range GROUP BY source | event_time index | `CREATE INDEX idx_alarm_history_time_source ON alarms.alarm_history(event_time, source);` |

### 1.4 EF read-path hygiene

- **Good:** `GetActiveAlarmsAsync` uses `AsNoTracking` + `Skip/Take`, page size capped 1000 at controller and handler (`AlarmRepositories.cs:35,59-62`; `AlarmsController.cs:56`); `HistoricalAlarmRepository.QueryAsync` uses Dapper `LIMIT/OFFSET`.
- **Bad:** `GetUnacknowledgedAsync` (`AlarmRepositories.cs:120-125`) is **unpaginated** — returns every unacknowledged alarm (unbounded under a flood). `GetActiveAlarmsAsync` silently ignores 5 of 8 advertised filters (ServerId/Priority/Category/IsShelved/IsSuppressed).
- Every alarm-list request runs list + `CountActiveAsync` + `GetStatsSummaryAsync` — three DB query groups, uncached (DATA-08).

### 1.5 Pooling (DATA-05)

No connection string sets pool bounds anywhere (DL-6) → Npgsql default Max 100 per data source. One `ams_user` (plaintext default password) across 8 DBs; ~12 client processes; no PgBouncer. AMS.Api uses one `NpgsqlDataSource`; under load the pool queues unboundedly.

---

## 2. IoTDB

- **Deployment (DATA-04):** `apache/iotdb:1.3.2-standalone`, single node, root/root, `enable_auto_create_schema=true`. Spec §6 (`Traverse-Edge-Platform-Specification.md:129`) requires 3C3D (3 ConfigNodes Ratis schema-replica-3 + 3 DataNodes IoTConsensus data-replica-2). Standalone is a historian SPOF.
- **Write path:** Flink `IoTDBPersistenceJob` uses the session connector with `withBatchSize` + `withFlushIntervalMs(5000)` — batched (good). `RawLoopIotDbConsumer` and `cplm-api` write via REST v2 with `create timeseries` + `INSERT`. **Three distinct namespaces** are fed by three components (`root.ams.site1.alarms.*`, `root.site1.cpm.*`, and edge-node `root.<path>`), and the alarm namespace uses a *different identity + sanitization* than the Sparkplug live plane (DATA-07 — see 05 §3.3).
- **Schema/cardinality:** auto-create-schema on with no template governance — unbounded series cardinality risk. Spec calls for schema-template cardinality control (§6).
- **TTL:** `iotdb-init-ttl.sh` sets `root.ams` 365d, `root.site1` 90d; the 1.3.2 path-pattern SET-TTL caveat is handled. This is the one retention that actually works in the stack.
- **Read/decimation (BFF contract):** historian-bff `/trend` decimates to `width∈[10,2000]` via `GROUP BY interval`; `/raw` bounded 500/page; `/raw/cursor` ≤10,000 O(1). The decimation contract is real and bounded (H-18). No session pooling concept (REST), no result cache, no retry/timeout policy (DATA-09).

---

## 3. Redis — contract-vs-eviction (DATA-03)

`--maxmemory 512mb --maxmemory-policy volatile-lru --appendonly yes --appendfsync everysec --save 60 1`; no `requirepass`; host-published :6380. Snapshot keys are written `setex(key, 3600, json)` (`SparkplugConfig.java:83`). Because the "paint-on-open contract" keys **carry a TTL**, they are exactly the keys `volatile-lru` evicts under pressure — so a memory spike can evict a live snapshot → blank faceplate with no retry (the doc's own failure-mode row).

**Remediation options (DATA-03):**
1. **Key-class separation (recommended):** contract snapshot keys on a dedicated instance/db with `maxmemory-policy noeviction`, cache-tier keys on a separate `allkeys-lru` instance. Sizing: at ~1 KB/snapshot × (tags × devices) working set (see 07 §1 load model), 512 MB holds ~500k snapshots — size the noeviction tier to the real working set + headroom, alerting on `used_memory` > 80%.
2. `noeviction` on a single instance + sizing (simpler, but a cache-tier leak could then OOM the contract).
3. Persistent snapshots (drop TTL, explicit delete on alarm clear) — changes the contract semantics.
Add `requirepass`/ACL + TLS regardless (H-13/SEC-02).

---

## 4. Caching strategy end-to-end

| Tier | Cached today | Should cache | Invalidation |
|---|---|---|---|
| Browser (React Query) | `staleTime 30s`, no gcTime override, no request cancellation (FE-03) | keep; add AbortController | on mutation |
| Gateway (new) | nothing (no gateway) | asset tree, display config, binding resolutions, historian trend/summary | write-triggered per owning service (10 §3) |
| API tier | **nothing** (DATA-08) | hot alarm-list read (short TTL) + stats summary | on projection write |
| historian-bff | **nothing**; `/snapshot` does a Redis SCAN per request (DATA-09) | trend/summary results; replace SCAN with a maintained snapshot index set | on new snapshot write |
| Redis | live snapshots (evictable — DATA-03) | contract keys non-evicting | on alarm clear |

**Never cache:** current alarm state, ACK endpoints, SignalR streams, live MQTT values (authoritative list in 10 §3).

---

## 5. Backup/restore and retention posture

| Store | Backup today | Retention | Gap |
|---|---|---|---|
| PostgreSQL | none in compose; single volume | none — TimescaleDB unused (DATA-02); `alarm_history` unbounded, no writer (DATA-06) | Add hypertables + retention (DDL below); PITR/replica (DATA-05) |
| IoTDB | single volume | TTL 365d/90d works | 3C3D + async pipe to standby (DATA-04) |
| Redis | AOF everysec + RDB `save 60 1` | TTL 3600s (but evictable) | Separate contract tier (DATA-03) |
| Kafka | single broker, 24h retention | 24h bounds replay | RF≥3 + longer retention (STR-04) |

**Timescale remediation (DATA-02)** — run in mounted SQL (not pre-marked EF migrations):
```sql
SELECT create_hypertable('alarms.alarm_history','event_time', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
ALTER TABLE alarms.alarm_history SET (timescaledb.compress, timescaledb.compress_segmentby='source');
SELECT add_compression_policy('alarms.alarm_history', INTERVAL '7 days');
SELECT add_retention_policy('alarms.alarm_history', INTERVAL '2 years');
```
(Apply the same pattern to `alarm_state_transitions`, `analysis_executions`, and the CPLM result tables per their retention class.)

The consolidated target data layer — HA topology, PgBouncer placement, pool sizing, the indexing standard, the Timescale policy set, IoTDB 3C3D, and the Redis contract-tier separation — is in [10-target-architecture.md](./10-target-architecture.md) §5.
