# Plan 01 — Alarm Data Integrity (no silent loss or duplication)

**Phase:** 1 · **Effort:** M · **Depends on:** nothing (start here)
**Gaps closed:** STR-01, DOM-01, STR-09, STR-10, DATA-01, DATA-06, DOM-02
**Objective:** guarantee that every alarm event that enters the pipeline is persisted exactly once and never silently dropped, duplicated, or mis-matched.

## Why

This is the highest-leverage plan in the programme. Today an alarm can be **lost** in three independent places — a Flink sink that never flushes on checkpoint, a DLQ that only writes a log line, and a rebalance that commits un-persisted offsets — and can be **duplicated** because no database constraint backs the projection key. Every KPI, ACK, and audit claim the product makes depends on this chain being correct.

## Work items

| # | Task | Gap | Where | Effort |
|---|---|---|---|---|
| 1 | Set explicit `DeliveryGuarantee` on all 13 Kafka sinks | STR-01 | `src/flink/.../*Job.java`, `cplm/CplmKafkaSink.java` | M |
| 2 | Replace the stub DLQ with a real dead-letter producer | DOM-01 | `AMS.Infrastructure/Kafka/KafkaConsumerService.cs:272-291` | M |
| 3 | Make rebalance commit only persisted offsets | STR-09 | `KafkaConsumerService.cs:153-159` | S |
| 4 | Make ACK writeback at-least-once | STR-10 | `AMS.Api/BackgroundServices/HttpAckWritebackService.cs` | M |
| 5 | Add the projection identity constraint + `ON CONFLICT` upsert | DATA-01 | `02_alarm_schema.sql`, `AlarmRepositories.cs`, `NormalizedAlarmIngestor.cs` | M |
| 6 | Give `alarm_history` a writer (or repoint readers) | DATA-06 | `AMS.Infrastructure`, `AnalyticsController.cs` | M |
| 7 | Register `ShelveExpiryService` + create its missing table | DOM-02 | `AMS.Api/Program.cs:567-602`, `database/scripts/` | S |

## Implementation steps

### 1. Explicit sink delivery guarantee (STR-01)

Every `KafkaSink` builder currently ends `.setRecordSerializer(...).build()` with no guarantee, so the pinned connector defaults to `DeliveryGuarantee.NONE` — buffered records are not flushed on checkpoint barriers and can be lost on a TaskManager crash.

- Add `.setDeliveryGuarantee(DeliveryGuarantee.AT_LEAST_ONCE)` to **all** sinks as the floor.
- For the alarm-state path (`OpcEventStreamJob` → `current-alarm-state`, `lifecycle-events`, `ack-writeback`), use `EXACTLY_ONCE` **plus** `.setTransactionalIdPrefix("<job>-<sink>")` — or keep AT_LEAST_ONCE once item 5 makes the projection idempotent. Pick one and record it.
- Centralise the shared helper `CplmKafkaSink.attach` so the CPLM jobs inherit the setting in one edit.
- Set `transaction.timeout.ms` below the broker's `transaction.max.timeout.ms` if EXACTLY_ONCE is chosen.
- Document the retained at-least-once contracts (IoTDB `series+ts`, live.* `alarmId+ts`, CPLM `ON CONFLICT`) in a comment at each sink.

### 2. Real dead-letter queue (DOM-01)

`SendToDeadLetterAsync` currently logs and returns `Task.CompletedTask`, while the `finally` block clears the batch — a transient Postgres failure silently discards up to 100 alarm events.

- Inject a Kafka producer and publish failures to the already-declared `raw-alarms-dlq` topic (config exists, was never used).
- **Do not clear the batch or advance offsets on failure.** Retry with bounded exponential backoff; only route to the DLQ after retries are exhausted, and only then commit.
- Emit a `dlq_depth` metric and alert on any non-zero value.

### 3. Rebalance-safe offset commit (STR-09)

The revoked-partitions handler calls bare `c.Commit()`, committing consume positions that include un-persisted in-memory batch records.

- Flush and persist the in-flight batch **before** committing in the revoke handler, then commit only the stored offsets of persisted records.
- If the flush fails, do not commit — let the new owner re-read from the last durable offset.

### 4. At-least-once ACK writeback (STR-10)

`HttpAckWritebackService` runs with `EnableAutoCommit = true`, so an offset can commit before the DCS HTTP POST succeeds — a crash between the two silently drops an operator acknowledgement.

- Switch to `EnableAutoCommit = false` (or `EnableAutoOffsetStore = false` + `StoreOffset` after success).
- Commit only after both the DCS POST and the `ack-results` publish succeed.
- Ensure the writeback is idempotent on the DCS side (include the ACK's unique id) so redelivery is harmless.

### 5. Projection identity constraint (DATA-01)

The live table `alarms.alarm_current` has **no `server_id` column** (`ServerId` is `b.Ignore`'d) and only `UNIQUE(alarm_id)`; the ingest lookup filters `source` alone, unindexed, so every event sequential-scans the table.

```sql
ALTER TABLE alarms.alarm_current
  ADD COLUMN server_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

CREATE UNIQUE INDEX uq_alarm_current_identity
  ON alarms.alarm_current (server_id, source, condition, COALESCE(sub_condition, ''));
```

- Un-ignore `ServerId` in `AmsDbContext` and map the column.
- Backfill `server_id` for existing rows from the alarm-id key format before enforcing the constraint.
- Replace the read-modify-write in `NormalizedAlarmIngestor` with `INSERT … ON CONFLICT (server_id, source, condition, sub_condition) DO UPDATE` so concurrent redelivery converges instead of raising `23505`.
- Fix `GetBySourceNameForIngestAsync` to actually filter on `serverId`.
- Normalise casing consistently (the matcher is case-insensitive while the key builder is case-sensitive — align them).

### 6. `alarm_history` writer (DATA-06)

The KPI dashboard and history search read `alarms.alarm_history`, but **no writer exists anywhere in the repo**.

- Decide: (a) add a projection writer that appends to `alarm_history` on every lifecycle transition, or (b) repoint the readers at `historical_alarms` and retire `alarm_history`.
- Recommended: (a) — it keeps the existing read paths and index plan intact.
- Note the Dapper `BulkInsertAsync` COPY column list does not match the `historical_alarms` DDL; fix or remove it as part of this item.

### 7. Shelve expiry (DOM-02)

`ShelveExpiryService` is implemented but never registered, and the SQL function it calls inserts into `alarms.shelving_actions`, which no script creates.

- Add `services.AddHostedService<ShelveExpiryService>();`.
- Create `alarms.shelving_actions` in `database/scripts/` (mounted path) with the columns the function writes.
- Add a test that a shelved alarm returns to the active list at expiry (ISA-18.2 shelving timeout).

## Exit criteria

- [ ] No `KafkaSink` in `src/flink` builds without an explicit `DeliveryGuarantee` (grep returns a match for every sink).
- [ ] Fault-injection test: kill Postgres mid-batch → **zero** events lost; failures land in `raw-alarms-dlq`; offsets do not advance.
- [ ] Rebalance test: force a partition revoke mid-batch → no committed offset exceeds the last persisted record.
- [ ] ACK test: kill the service between commit and DCS POST → the acknowledgement is redelivered, not lost.
- [ ] Duplicate-redelivery test: replay the same alarm batch twice → row count unchanged, no `23505`.
- [ ] Two OPC servers publishing the same `sourceName` produce two distinct rows.
- [ ] `alarm_history` is populated by a live writer and the KPI dashboard reads non-zero data.
- [ ] A shelved alarm auto-unshelves at expiry.

## Rollback

Items 1–4 are code-only and revert by redeploy. Item 5 requires a database migration — take a `pg_dump` of the `ams` database first; rollback = drop the unique index and the added column, redeploy the previous ingestor. Items 6–7 are additive.

## Risks & notes

- **Backfill risk (item 5):** existing `alarm_current` rows have no server dimension. Backfill from the `v1|{serverId}|…` alarm-id format where present; rows created from Flink-supplied ids may need a default server assignment — agree this mapping with the alarm domain owner before running.
- Choosing `EXACTLY_ONCE` sinks adds transactional overhead and requires broker `transaction.max.timeout.ms` headroom; AT_LEAST_ONCE + the new upsert is the lower-risk combination and is the recommended default.
- This plan does **not** address availability — the pipeline still stops if the single broker or JobManager restarts (see Plan 09).
