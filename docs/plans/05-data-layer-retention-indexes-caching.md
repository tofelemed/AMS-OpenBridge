# Plan 05 — Data Layer: Retention, Indexes & Caching

**Phase:** 2 · **Effort:** M · **Depends on:** Plan 01 (schema change lands first), Plan 04 (gateway cache tier)
**Gaps closed:** DATA-02, DATA-03, DATA-07, DATA-08, DATA-09, DATA-10, DATA-11, DATA-12, RES-01
**Objective:** stop unbounded table growth, index the hot query paths, add the missing cache tiers, and make the live snapshot contract non-evictable.

> **Scope note:** database **replication and clustering** (PG replica, IoTDB 3C3D) are held for [Plan 09](./09-replication-clustering-ha.md). This plan is single-node correctness and performance.

## Why

The stack runs the TimescaleDB image and creates the extension, but **no table is actually a hypertable** on a docker-initialised database — the SQL bootstrap pre-marks the hypertable migrations as applied without running them, so there is no compression and no retention anywhere. Alarm history grows forever. Meanwhile the hot ingest predicate is unindexed, there is no cache between the API and Postgres, and the paint-on-open snapshot "contract" sits on evictable keys.

## Work items

| # | Task | Gap | Where | Effort |
|---|---|---|---|---|
| 1 | Enable real hypertables, compression & retention | DATA-02 | `database/scripts/` | M |
| 2 | Add missing hot-predicate indexes | DATA-10 | `database/scripts/` | S |
| 3 | Split Redis into contract + cache tiers | DATA-03 | compose, edge node, historian-bff | M |
| 4 | Replace the `/snapshot` keyspace SCAN | DATA-09 | `historian-bff/Program.cs` | M |
| 5 | Add API-tier output caching | DATA-08 | `AMS.Api`, gateway | M |
| 6 | Unify the alarm identity across live/history | DATA-07 | Flink, edge node, frontend | M |
| 7 | Fix wrong-database init scripts | DATA-11 | `database/scripts/` | S |
| 8 | Timestamp + orphan-database cleanup | DATA-12 | `17_traverse_auth_schema.sql`, docs | S |
| 9 | Turn on resilience policies (Polly is packaged, unused) | RES-01 | all HttpClient registrations | M |

## Implementation steps

### 1. Real Timescale policies (DATA-02)

`03_apply_ef_migrations.sql` inserts the hypertable migration IDs into `__EFMigrationsHistory` after creating plain tables, so EF believes they ran and `create_hypertable` never executes.

- Stop pre-marking those migration IDs.
- Create hypertables + policies in the **mounted SQL** so docker-initialised databases get them:

```sql
SELECT create_hypertable('alarms.alarm_history','event_time',
       chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
ALTER TABLE alarms.alarm_history
      SET (timescaledb.compress, timescaledb.compress_segmentby='source');
SELECT add_compression_policy('alarms.alarm_history', INTERVAL '7 days');
SELECT add_retention_policy('alarms.alarm_history', INTERVAL '2 years');
```

- Apply the same pattern per retention class to `alarms.alarm_state_transitions`, `analysis.analysis_executions`, `audit.immutable_events` (respect audit immutability rules), and the CPLM result tables.
- Note `add_compression_policy` appears **nowhere** in the repo today — compression would be enabled but never scheduled without it.
- For an existing populated database, convert with `migrate_data => true` during a maintenance window.

### 2. Hot-predicate indexes (DATA-10)

```sql
-- covered by Plan 01's unique identity index, but if that is staged later:
CREATE INDEX idx_alarm_current_source      ON alarms.alarm_current(source);
CREATE INDEX idx_alarm_current_state_time  ON alarms.alarm_current(state, event_time DESC);
CREATE INDEX idx_alarm_current_source_trgm ON alarms.alarm_current USING gin (source gin_trgm_ops);
CREATE INDEX idx_alarm_history_state_time  ON alarms.alarm_history(state, event_time DESC);
CREATE INDEX idx_alarm_history_time_source ON alarms.alarm_history(event_time, source);
CREATE INDEX idx_alarm_history_source_trgm ON alarms.alarm_history USING gin (source gin_trgm_ops);
```

`pg_trgm` is already installed. Validate against `pg_stat_statements` after a week and drop anything unused. Also fix `GetActiveAlarmsAsync`, which silently ignores five of its eight advertised filters, and `GetUnacknowledgedAsync`, which is unpaginated (unbounded during an alarm flood).

### 3. Redis contract tier (DATA-03)

Snapshot keys are written with a 1-hour TTL under `volatile-lru`, which means the paint-on-open contract keys are exactly the ones eviction targets under memory pressure — the documented "blank faceplate" failure.

- Run **two** Redis instances/databases: a **contract tier** with `maxmemory-policy noeviction` for `snapshot:*`, and a **cache tier** with `allkeys-lru` for gateway/API caching.
- Size the contract tier to the real snapshot working set (≈1 KB/snapshot × tags × devices) plus headroom; alert at 80% `used_memory`.
- Add `requirepass`/ACL and TLS to both; stop publishing the port to the host.
- Point the edge node's snapshot writer and historian-bff's reader at the contract tier.

### 4. Fix `/snapshot` (DATA-09)

The endpoint runs a Redis keyspace `SCAN` plus a `GET` per key on **every request**, unbounded — and it is the shift-change hot path (~4,000 reads).

- Maintain a snapshot index (a Redis SET or hash per asset/device) updated by the edge node on write.
- Serve `/snapshot` from the index with `MGET`; add paging and a short result cache.
- Add a rate limit at the gateway (Plan 04) as a second line of defence.

### 5. API-tier caching (DATA-08)

There is no cache between ams-api reads and Postgres; each alarm-list request issues list + count + stats-summary.

- Add ASP.NET output caching (or a short-TTL Redis cache on the cache tier) for the hot alarm-list read and the stats summary.
- Invalidate on projection write so operators never see stale alarm state; keep TTLs short (1–5 s) given the never-cache rule for alarm state at the edge.
- Reuse the count/stats result across the same request where possible.

### 6. Unify alarm identity (DATA-07)

Three different identities/sanitisers describe the same alarm: IoTDB uses the sanitised `alarmId`, Sparkplug uses the sanitised `sourceName` (hyphens preserved), and the browser re-derives the historian path — silently returning an empty trend when the bridging metric is absent.

- Choose one canonical alarm identity and one sanitisation rule; publish it as a shared contract used by the Flink persistence job, the edge node, and the UNS.
- Have `binding-resolver` return the historian path for a live alarm so the browser stops deriving it.
- Guard against sanitisation collisions (`FIC-101` vs `FIC.101` currently collapse to the same IoTDB path segment).
- Fix the broken live→trend deep link as part of this (see also Plan 07 FE-07).

### 7. Init-script targeting (DATA-11)

Five scripts lack a `\c` and execute against `ams`: four error out, and `20_display_media_assets.sql` creates `displays.media_assets` in the **wrong database**. Services self-heal at startup, which masks it.

- Add the correct `\c <database>` to `17_display_background_token_migration`, `18`, `19`, `20`, `21`.
- Verify a clean-volume initialisation completes with zero errors and every object lands in its owning database.

### 8. Cleanup (DATA-12)

- Convert `traverse_auth` timestamps from naive `TIMESTAMP` to `TIMESTAMPTZ` (it is the only schema that deviates).
- Either create `traverse_shared` in `database/scripts/` or remove it from CLAUDE.md and the docs — today it is documented but has no live creation script.

### 9. Resilience policies (RES-01)

Polly is referenced in `AMS.Infrastructure.csproj` but has **zero call sites**; no HttpClient in the estate has retry or circuit-breaking.

- Add `AddStandardResilienceHandler()` (retry + circuit breaker + timeout) to every outbound client: Flink REST, IoTDB writers/readers, asset-model calls, the DCS ACK writeback, and the alarm feed poller.
- Keep timeouts shorter than the caller's own deadline so failures surface fast.

## Exit criteria

- [ ] `alarm_history` (and the other time-series tables) are hypertables with compression **and** retention policies scheduled; a growth test shows bounded disk over time.
- [ ] Every hot query predicate is index-backed; no sequential scan on the ingest path under load.
- [ ] Snapshot keys live on a `noeviction` tier; a memory-pressure test does not evict a live snapshot.
- [ ] `/snapshot` serves without a keyspace scan and holds up at a 4,000-request shift-change burst.
- [ ] Alarm-list reads hit a cache; a write invalidates it within the TTL.
- [ ] One canonical alarm identity across Flink, edge, and UI; live→trend navigation works.
- [ ] A clean-volume database init completes with zero errors and no object in the wrong database.
- [ ] Every outbound HttpClient has retry + circuit breaker.

## Rollback

Index and policy additions are reversible (`DROP INDEX`, `remove_retention_policy`). Hypertable conversion is **not trivially reversible** — snapshot the database first and rehearse on a copy. Redis tier split: keep the old instance running until both writer and reader have cut over. Caching and resilience are feature-flagged code changes.

## Risks & notes

- **Hypertable conversion on a populated table takes a maintenance window** proportional to table size; measure on a restored copy first.
- Retention policies **delete data** — confirm the 2-year alarm-history and per-class retentions with compliance/audit owners before enabling.
- Item 6 changes a data contract across three components plus stored IoTDB paths; decide whether historical series are migrated or dual-read during transition.
