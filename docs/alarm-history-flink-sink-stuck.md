# Issue: Alarm History empty — Flink state-machine sink to `current-alarm-state` is stuck

**Status:** RESOLVED (2026-08-13, follow-up session) — root cause confirmed, fix deployed and verified E2E
**Confirmed root cause:** `current-alarm-state` is a **compacted** topic; the Flink sink writes records
with a **null key**; the broker rejects every record with
`InvalidRecordException: Compacted topic cannot accept message without key`. See the updated
"Root-cause analysis" section — the original "wedged producer after topic recreation" hypothesis
below is retained for history but was wrong.
**Area:** Flink alarm pipeline → Kafka → ams-api projection → Postgres/TimescaleDB
**Severity:** High for the Alarm History feature; the alarm *state machine* code itself is correct
**First observed:** 2026-08-13 (this session), while investigating why the Alarm History page was empty
**Author:** diagnosis session (Claude)

---

## TL;DR

- The **Alarm History page** (`/historical`) reads `alarms.alarm_history` (TimescaleDB) via
  `GET /api/v1/alarms/historical` — **not IoTDB**. IoTDB only backs the Trend Viewer and loop trends.
- The table was **empty** because the alarm pipeline is starved at exactly one seam: the Flink
  **Alarm State Machine** (`OpcEventStreamJob`) processes alarms correctly through every stage, but its
  **Kafka sink into `current-alarm-state` receives records and writes 0** to the topic.
- Everything on **both sides** of that seam is healthy: raw-alarms is consumed and validated fine;
  the `current-alarm-state` topic accepts writes; and `current-alarm-state → ams-api → alarm_history`
  (and `current-alarm-state → Flink → flink.state.alarm.delta`) both work.
- **Root cause (most likely):** the alarm topics were **deleted and recreated** during earlier
  ZooKeeper/Kafka volume resets (see “Related incidents”). The `OpcEventStreamJob` KafkaSink producer
  ends up unable to land records on the recreated `current-alarm-state` topic and — critically — **does
  not error**; it completes checkpoints while writing nothing. It survives a job resubmit *and* a
  TaskManager restart, which is the surprising part.
- **Workaround applied (lab only):** 60 correctly-formatted `ALARM_STATE_UPSERT` messages were produced
  **directly** to `current-alarm-state`, which ams-api projected into **51 `alarm_history` / `alarm_current`
  rows**. The Alarm History page now renders data. **Live alarms still won’t auto-flow** until the sink is fixed.

---

## Impact

- Alarm History page shows nothing (until worked around).
- Any consumer of `current-alarm-state` (ams-api projection to `alarm_current` + `alarm_history`,
  the delta/export jobs, SignalR live alarm summaries) sees no *live* alarm-state changes originating
  from the state machine.
- Trends, CPLM, and process values are **unaffected** (different path: `raw.telemetry` / `live.metrics`
  → IoTDB / Sparkplug).

---

## Expected data flow (what should happen)

```
OPC A&E feed / injector ──▶ Kafka: raw-alarms
                                     │
                                     ▼
        Flink: "AMS - Alarm State Machine"  (OpcEventStreamJob)
        raw-alarms → validation → dedup → normalization → SOE
                   → lifecycle → correlation → projection-builder
                                     │  (toCurrentAlarmStateJson / toDeleteAlarmStateJson)
                                     ▼
                         Kafka: current-alarm-state   ◀── ❌ STUCK HERE (sink writes 0)
                                     │
                     ┌───────────────┴───────────────┐
                     ▼                                ▼
   ams-api NormalizedAlarmConsumerService     Flink "Alarm State Export"
   → NormalizedAlarmIngestor                  → flink.state.alarm.delta
   → Postgres alarms.alarm_current (upsert)
   → Postgres alarms.alarm_history (AppendHistoryAsync)   ◀── Alarm History page reads this
                     │
                     ▼
       GET /api/v1/alarms/historical  → HistoricalViewer (/historical)
```

Key source files:
- Frontend: `src/frontend-ob/src/components/HistoricalViewer/HistoricalViewer.tsx`
  → `authedAxios.get('/api/v1/alarms/historical')`
- API: `src/backend/AMS.Api/Controllers/V1/AlarmsController.cs` (`GetHistoricalAlarms`)
  → `AMS.Application/Alarms/Queries/AlarmQueries.cs` → `IUnitOfWork.HistoricalAlarms.QueryAsync`
  → `AMS.Infrastructure/Repositories/AlarmRepositories.cs` (reads `alarms.alarm_history`)
- Projection/writer: `src/backend/AMS.Infrastructure/Kafka/KafkaConsumerService.cs`
  (`NormalizedAlarmConsumerService` → `ProcessAsync` + `AppendHistoryAsync` → `alarms.alarm_history`)
- Flink: `src/flink/src/main/java/com/ams/flink/OpcEventStreamJob.java`
  (`current-alarm-state-sink`, `kafkaSink(...)` helper) and
  `src/flink/src/main/java/com/ams/flink/PipelineOperators.java`
  (`ValidationMap`, `toCurrentAlarmStateJson`, `toDeleteAlarmStateJson`)

---

## Diagnosis walkthrough (with evidence)

### 1. Alarm History reads Postgres, not IoTDB
`GetHistoricalAlarms` → `HistoricalAlarms.QueryAsync` → `SELECT ... FROM alarms.alarm_history`.
The dead `alarms.historical_alarms` table (Plan 10 A4) is *not* used. So an empty page = an empty
`alarm_history` table, upstream of any IoTDB concern.

### 2. `alarm_history` was empty; `alarm_current` had a stale single row
```
alarm_history rows | 0
alarm_current rows | 1
```

### 3. The source topic `current-alarm-state` was empty; `raw-alarms` had 2500 STATIC records
```
raw-opc-events      : 0
raw-alarms          : 2500   (static — the sim produces PROCESS VALUES, not alarms)
current-alarm-state : 0
flink.state.alarm.delta : 0
```

### 4. The existing `raw-alarms` messages were garbage
A sample `raw-alarms` value was the bare string `2001` — not alarm JSON. So the state machine
**correctly dropped all 2500** in `ValidationMap` (requires non-empty `sourceName` + `conditionName`).

### 5. Injected VALID alarms flow through the whole state machine but die at the sink
Injected 40 → 50 → 30 valid alarms (schema below). Flink per-operator record counts (REST
`/jobs/<jid>` → vertices):
```
Source: raw-alarms-source -> validation        in=0    out=2540
validation-filter                              in=2540 out=40     (2500 garbage dropped, 40 valid pass)
deduplication -> normalization                 in=40   out=40
lifecycle-engine -> correlation-engine         in=40   out=40
current-alarm-state-sink: Writer               in=90   out=0     ◀── receives 90, writes 0
```
`current-alarm-state` topic offset stayed **0** (verified with `read_uncommitted` too — nothing stuck
in an open transaction; genuinely nothing written).

### 6. The topic itself is HEALTHY
Manual produce landed and read back:
```
echo 'TESTKEY|{"test":1}' | kafka-console-producer --topic current-alarm-state --property parse.key=true --property key.separator='|'
# offset 0 → 1, message read back OK
```

### 7. The DOWNSTREAM is HEALTHY
That one manual message flowed `current-alarm-state → ams-api → alarm_history` (both went 0→1), and a
Flink job consumed `current-alarm-state` and produced `flink.state.alarm.delta` (0 → 59). So **other
Flink Kafka sinks work**, and the ams-api projection + history writer work.

### 8. The failure survives a job resubmit AND a TaskManager restart
- Cancelled + resubmitted `AMS - Alarm State Machine` via `scripts/ensure_flink_jobs.py`
  (idempotent — back to exactly 10 jobs, no duplicate-job storm). Fresh producer → still `out=0`.
- Restarted `ams-flink-taskmanager` (jobs restore from checkpoint). Still `out=0`.

### 9. Config-drift smell: parallel topic naming
`kafka-topics --list` shows **two parallel schemes** for the same concepts:
```
current-alarm-state   ↔  alarm.state.active
flink.state.alarm.delta ↔ alarm.state.delta
raw-alarms            ↔  alarm.events.raw
clpm.gate.results.v1  ↔  clpm.gate.results
```
Worth confirming which names the *current* job builds and the *current* consumers expect — a rename
migration that left the old sink wired to a recreated topic is a plausible contributor.

---

## Root-cause analysis — CONFIRMED (supersedes the hypothesis below)

**Root cause: null-key records produced to a compacted topic are rejected by the Kafka broker.**

Three facts, each verified:

1. `current-alarm-state` has `cleanup.policy=compact` (`scripts/kafka-reset-lab-topics.ps1`, and
   confirmed live via `kafka-configs --describe`).
2. The sink (`OpcEventStreamJob.kafkaSink`) builds its `KafkaRecordSerializationSchema` with only
   `setValueSerializationSchema` — **`setKeySerializationSchema` is used nowhere in any Flink job**.
   Every record leaves Flink with a null key.
3. Kafka brokers hard-reject null-key records on compacted topics. Smoking-gun test (same console
   producer as step 6, but WITHOUT a key):
   ```bash
   echo '{"test":"nokey"}' | docker exec -i ams-kafka kafka-console-producer \
     --bootstrap-server localhost:9092 --topic current-alarm-state
   # ERROR ... org.apache.kafka.common.InvalidRecordException:
   #   Compacted topic cannot accept message without key in topic partition current-alarm-state-0
   ```
   Reproduced 2026-08-13. Per-record, broker-side, non-retriable.

This explains every observation:

- **Only this sink fails** — every working Flink sink (`lifecycle-events`, `root-cause-events`,
  `ack-writeback`, `flink.state.alarm.delta`) targets a `cleanup.policy=delete` topic where null keys
  are legal. The stuck sink (and `ack-projection-sink`) are the only ones targeting a compacted topic.
- **The step-6 "topic is healthy" test passed** because it used `parse.key=true` with an explicit key.
  A keyed record is accepted; the Flink records are keyless. The test accidentally tested the wrong thing.
- **Survives job resubmit + TM restart** — the failure is deterministic (every record null-key), not
  stateful producer wedging.
- **The `topicId changed` tell** — before Plan 09 disabled topic auto-creation, the topic was likely
  auto-created with the broker default `cleanup.policy=delete`, so keyless writes worked. The post-ZK-
  incident recreation applied the *declared* compact policy, and keyless writes started bouncing. The
  recreation mattered because it changed the effective cleanup policy — not because of producer epoch state.
- **Silence** — the Flink `KafkaWriter` receives the error in the async producer callback, increments
  `numRecordsOutErrors`, and defers the throw; connector `3.0.1-1.18` is from the era with known gaps
  surfacing async produce errors at flush/checkpoint time (FLINK-31305 family), so checkpoints complete
  while 100% of records are dropped.

**Collateral finding:** `kpi-standing-snapshots` is also compacted and its sink
(`AlarmKpiStreamJob`, `standing-sink`) is equally keyless — same defect, silently writing 0.
(`alarm.state.active` is compacted too but only *consumed* by Flink, not produced.)

### Original hypothesis (historical — retained for context, WRONG)

The sink config (`OpcEventStreamJob.kafkaSink`): `DeliveryGuarantee.AT_LEAST_ONCE`,
`KafkaRecordSerializationSchema` with `setTopic(topic)` + `SimpleStringSchema` value, **no key**
(`current-alarm-state` is a **compacted** topic, so null-key records can’t be compacted, but that alone
would not stop writes — *this dismissal was the error: it does stop writes, see above*). The projection
(`toCurrentAlarmStateJson`) always returns valid non-null JSON.

TaskManager logs around the failure show the producer relearning the topic:
```
[Producer clientId=producer-1] Resetting the last seen epoch of partition current-alarm-state-2
  ... topicId changed from null to ErXOTy4rQxiVb7aqZYj7tw
[Producer ...] ProducerId set to 3003 with epoch 1   (idempotent producer)
```
The `topicId changed` is the tell: `current-alarm-state` was **deleted and recreated** at some point
(new topicId). Combined with an **idempotent producer** (ProducerId/epoch), the most plausible mechanism
is that the sink’s producer ends up in a state where `send()`s are accepted into the client but never
land/ack for the recreated topic, and — because it’s AT_LEAST_ONCE with `flush()` on checkpoint — the
flush neither blocks nor throws, so checkpoints keep completing “successfully” while data is silently
dropped. **This silent success is the real defect**: an AT_LEAST_ONCE sink that writes zero records
should fail its checkpoint, not complete it.

> ⚠️ This last step is a hypothesis, not proven. The confirmed facts are: sink `in=90 out=0`, topic
> empty (incl. uncommitted), topic accepts manual writes, survives job + TM restart, `topicId changed`
> in the producer log. Confirm by enabling Kafka producer client logging (`log4j` for
> `org.apache.kafka.clients.producer`) on the TaskManager and watching for silent metadata / epoch /
> `NOT_LEADER` / `UNKNOWN_TOPIC_ID` retries on `current-alarm-state`.

### How it got here (contributing history — see “Related incidents”)
Earlier in the program, ZooKeeper’s anonymous-volume shadowing caused `InconsistentClusterIdException`
and forced **Kafka volume resets**, after which **topics were manually recreated** (documented). Any
topic that was dropped + recreated under a running Flink job is a candidate for exactly this producer
wedging.

---

## Current lab state (after this session)

- `alarm_history`: **51 rows**, `alarm_current`: **51 rows**, spread over the last ~6h (workaround data).
- `GET /api/v1/alarms/historical` returns **50 rows** with full fields
  (`source_name`, `severity`, `alarm_state`, `condition_name`, `event_time`, …). Page renders.
- These rows came from **direct injection to `current-alarm-state`** (bypassing the stuck sink), NOT
  from the live state machine. **New live alarms will not appear** until the sink is fixed.
- Flink: 10 canonical jobs RUNNING (no duplicates).

---

## Fix options — which is long-term / prod-ready?

**Neither of the two quick options is a long-term or production fix.** Both are one-time *lab recovery*
that gets you unstuck without preventing recurrence.

| Option | What it does | Good for | Prod-ready? |
|---|---|---|---|
| **A. Full clean stack restart** (`.\run-all.ps1`) | Rebuilds every topic + resubmits every Flink job from a known-good state; clears all producer/consumer/txn state | **Reliably** unsticking the lab right now | ❌ No — full downtime; doesn’t prevent recurrence |
| **B. Targeted topic rebuild** (delete + recreate `current-alarm-state`, `live.alarms`, `flink.state.alarm.delta`; resubmit alarm jobs) | Narrower blast radius | A faster lab recovery if you can coordinate consumers | ❌ No — riskier (must stop ams-api + delta/export jobs + CPLM consumers first, in order), and *re-triggers the exact same failure mode* if a producer is mid-flight |

**Recommendation for “just make the lab work again”: Option A (`run-all.ps1`).** It’s the more reliable
of the two because it rebuilds from a single known-good definition rather than partially mutating a live
cluster. Do **not** do Option B piecemeal without stopping the producing/consuming jobs first.

### The actual long-term / production-ready fix (updated after root-cause confirmation)

> With the confirmed root cause, **neither lab-recovery option is needed** — the topic and cluster are
> fine; the producer records are malformed for a compacted topic. The fix is in the Flink jobs:
>
> 1. **Key every record with `alarmId`** in `kafkaSink` (both `current-alarm-state-sink` and
>    `ack-projection-sink`), and key the `kpi-standing-snapshots` sink. This fixes the broker
>    rejection, makes compaction actually retain latest-state-per-alarm, and gives per-alarm partition
>    ordering (previously upserts for one alarm would spray across 8 partitions).
> 2. **Upgrade `flink-connector-kafka` 3.0.1-1.18 → 3.1.0-1.18** so async producer errors fail the
>    checkpoint instead of being swallowed; set explicit producer timeouts; alert on
>    `numRecordsOutErrors`.
> 3. **Item 6 below (drop the Kafka hop for JDBC) is REJECTED** — decision 2026-08-13: the Kafka hop
>    stays, because `current-alarm-state` fans out to multiple consumers (ams-api projection,
>    delta/export, replay) and the hop was never the fragile part; the keyless serializer was.
>
> The original list follows; items 1, 4, 5 remain valid infra hygiene. Item 2's *timeout* framing is
> obsolete (nothing times out — the broker answers promptly with a rejection), but its
> alert-on-send-metrics point stands.

### Original fix list (pre-confirmation)

1. **Treat topics as immutable infrastructure.** Create them once (fixed partitions, RF, `cleanup.policy`)
   via a single init job; **forbid delete/recreate in prod**. The whole incident stems from topics being
   dropped + recreated under running jobs. (The ZK anonymous-volume shadowing that forced the resets was
   already fixed this program — named `zookeeper_data`/`zookeeper_log` volumes — keep it that way.)
2. **Make the sink fail loud, not silent.** An AT_LEAST_ONCE `KafkaSink` that lands 0 records must not
   complete checkpoints. Set explicit `delivery.timeout.ms` / `request.timeout.ms` / `max.block.ms` on the
   sink producer so a wedged producer throws → Flink’s restart strategy re-initialises it. Add a
   `numRecordsSend` (Kafka producer `record-send-total`) alert per sink so “received but not sent” is
   caught immediately.
3. **If a topic ever IS recreated, restart the producing Flink job** as part of the same operation
   (its producer metadata/epoch is invalidated). Bake this into the deploy tooling.
4. **Production RF ≥ 3** for these topics (lab is RF=1); a broker blip shouldn’t risk state.
5. **Resolve the parallel topic naming** (`current-alarm-state` vs `alarm.state.active`, etc.). Pick one
   scheme; make the job’s sink topic and every consumer’s subscription come from one shared config so a
   rename can never leave a sink writing to an orphaned/recreated topic.
6. **Architecture question worth asking:** does `current-alarm-state` need to be a Kafka hop at all?
   A Flink → **JDBC sink straight to Postgres** (`alarm_current`/`alarm_history`) removes the Kafka
   topic + ams-api projection consumer and this whole failure surface. Bigger change; evaluate against the
   need for other `current-alarm-state` consumers (delta/export, SignalR).

---

## Verification / reproduction commands

Offsets:
```bash
for t in raw-alarms current-alarm-state flink.state.alarm.delta; do
  docker exec ams-kafka bash -lc \
   "kafka-run-class kafka.tools.GetOffsetShell --broker-list localhost:9092 --topic $t \
    | awk -F: '{s+=\$3} END{print \"'$t': \" s+0}'"
done
```

Flink per-operator record counts (find the state-machine JID from the Flink UI :8082):
```bash
curl -s http://localhost:8082/jobs/<JID> | python -c "import sys,json; \
 [print(v['name'][:44], v['metrics'].get('read-records'), v['metrics'].get('write-records')) \
  for v in json.load(sys.stdin)['vertices']]"
```

Postgres row counts (user `ams_user`, db `ams`, password from `infra/docker/.env`):
```bash
PGPW=$(grep -E '^POSTGRES_PASSWORD=' infra/docker/.env | cut -d= -f2-)
docker exec ams-postgres bash -lc "PGPASSWORD='$PGPW' psql -U ams_user -d ams -tA -c \
 \"SELECT 'history', count(*) FROM alarms.alarm_history; \
   SELECT 'current', count(*) FROM alarms.alarm_current;\""
```

Confirm the topic accepts writes (isolates Flink from a broken topic):
```bash
echo 'TESTKEY|{"test":1}' | docker exec -i ams-kafka kafka-console-producer \
  --bootstrap-server localhost:9092 --topic current-alarm-state \
  --property parse.key=true --property key.separator='|'
```

Valid `raw-alarms` schema (what `ValidationMap` accepts) — key = `alarmId`, value:
```json
{"alarmId":"LAB-000001","serverId":"f0af9a6d-85f6-4c9f-a8ad-6de277d1d110","state":"ACTIVE",
 "severity":720,"acknowledged":false,"conditionActive":true,"priority":"HIGH",
 "sourceName":"LabGen.Unit1.Tag_001","conditionName":"HighHigh","subConditionName":"",
 "message":"...","eventTimeEpochMs":<ms>,"rbeTs":<ms>,"activeTime":<ms>}
```

`current-alarm-state` contract (what ams-api projects — bypasses the stuck sink for lab seeding):
key = `alarmId`, value from `PipelineOperators.toCurrentAlarmStateJson`:
```json
{"schemaVersion":1,"eventType":"ALARM_STATE_UPSERT","eventId":"<alarmId>:<ms>","alarmId":"LAB-0001",
 "serverId":"f0af9a6d-85f6-4c9f-a8ad-6de277d1d110","sourceName":"Plant.Unit1.FIC-101",
 "conditionName":"HighHigh","message":"...","severity":720,"priority":"HIGH","category":"PROCESS",
 "alarmEventKind":"CONDITION","conditionActive":true,"acknowledged":false,"quality":192,
 "eventTimeEpochMs":<ms>,"activeTimeEpochMs":<ms>,"serverReceivedEpochMs":<ms>,"cookieOffset":1}
```
(`eventType":"ALARM_STATE_DELETE"` + `conditionActive":false` for a cleared/return-to-normal event.)

---

## Related incidents / context

- **ZooKeeper anonymous-volume shadowing → Kafka volume resets → topics recreated** (fixed this program
  by mounting exact `zookeeper_data` / `zookeeper_log` volumes; topics were recreated in
  `scripts/kafka-reset-lab-topics.ps1`). This is the origin of the recreated `current-alarm-state`.
- **`__consumer_offsets` / RF-3 caveat** — documented in `docs/ha-production-guide.md`.
- **Flink duplicate-job storm** — resubmitting must go through `scripts/ensure_flink_jobs.py` (idempotent);
  do not run multiple submitters.
- The `sim` (`docker-compose.sims.yml`) publishes **process values**, not alarms; alarms come from the
  OPC A&E feed or an injector (`scripts/e2e-edge/live_alarm_generator.py --also-raw`).

---

## Fix applied and verified (2026-08-13)

**Code changes:**
- New `src/flink/src/main/java/com/ams/flink/KafkaSinks.java` — shared sink builders:
  `valueOnly` (delete-policy topics), `keyedByJsonField` (key = a JSON field, e.g. `alarmId`),
  `fixedKey` (snapshot topics). All set explicit `delivery.timeout.ms`/`request.timeout.ms`/`max.block.ms`.
- `OpcEventStreamJob`: `current-alarm-state-sink` and `ack-projection-sink` now use
  `keyedByJsonField(..., "alarmId")`; all other sinks route through `KafkaSinks.valueOnly`.
- `AlarmKpiStreamJob`: `standing-sink` (compacted `kpi-standing-snapshots`) now uses `fixedKey("GLOBAL")`.
- `pom.xml`: `flink-connector-kafka` 3.0.1-1.18 → **3.2.0-1.18** (propagates async produce errors →
  checkpoints fail loud), plus `flink-connector-base` as `provided` (no longer transitive in 3.2.0;
  the classes ship in flink-dist 1.18.1 — verified in the running image).

**Deploy path used (lab):** `scripts/build-flink-jar.ps1`, `docker cp` jar into
`ams-flink-job-supervisor` (+ jobmanager), cancel the two jobs via REST, supervisor resubmits from the
new jar within 60 s. Durable across container recreation once images are rebuilt (next `run-all.ps1`).

**Verification (all passed):**
- Smoking gun reproduced pre-fix: keyless console-produce → `InvalidRecordException`.
- Post-fix, the state machine (restarted from earliest) replayed 2667 raw records → 109 past dedup →
  **`current-alarm-state` offsets 61 → 170 (+109, exact)**; every record keyed by `alarmId`.
- Live E2E: 5 fresh alarms injected into `raw-alarms` → validated → sink → topic → ams-api projection →
  `alarms.alarm_history`/`alarm_current` rows → returned by
  `GET /api/v1/alarms/historical` through the gateway with a real JWT. Seconds of latency.
- Fan-out consumers confirmed flowing: `flink.state.alarm.delta` grew (delta/export job),
  `kpi-standing-snapshots` **0 → 5** (that sink had been silently dead too).
- New job: 18/18 checkpoints completed, 0 failed, no exceptions, still exactly 10 canonical jobs.

**Also observed while testing:** `scripts/inject-sample-alarms-e2e.ps1` produces records that FAIL
`ValidationMap` parsing (Windows PowerShell console-encoding garbling on the pipe into
`kafka-console-producer`) — its 7 samples were dropped at `validation-filter`. Pre-existing script bug,
unrelated to the sink fix; inject via bash/python (`scripts/e2e-edge/live_alarm_generator.py`) instead.

## Open questions to answer while fixing

1. Enable Kafka producer client logging on the TaskManager — what does `current-alarm-state-sink`’s
   producer actually do with the 90 sends? (metadata loop? `UNKNOWN_TOPIC_ID`? silent buffer?)
2. Does the sink recover if `current-alarm-state` is recreated **and** the job is restarted **in that
   order** (topic first, then job)? If yes → codify the ordering in deploy tooling.
3. Which topic-naming scheme is authoritative (`current-alarm-state` vs `alarm.state.active`)? Remove the
   dead one.
4. Should the alarm-state projection skip Kafka entirely (Flink → JDBC → Postgres)?
