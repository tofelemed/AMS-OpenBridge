# 08 — Alarm Business Logic

Scope: where each alarm rule is **actually implemented**, in whichever language, graded on evidence
only. Names are never taken as proof of behaviour. Paths are repo-relative to
`d:\HMI_Project_Usama\AMS-open`. `src/xmlgraphics-batik-main ScreeN Import/` and the untracked
`CPA/CPAMAIN/` copy are excluded.

Grades: **Implemented** / **Partially implemented** / **Placeholder** / **Missing**.

---

## Master status table

| # | Capability | Status | Where implemented (primary) | Decisive evidence |
|---|---|---|---|---|
| 1 | Alarm creation | **Implemented** (two independent creators) | `src/flink/.../PipelineOperators.java:34-97` (`ValidationMap`); `src/backend/AMS.Domain/Alarms/ActiveAlarm.cs:152-201` + `src/backend/AMS.Infrastructure/Kafka/NormalizedAlarmIngestor.cs:57-98` | Flink builds the canonical event; C# materialises the row. Required fields = `sourceName` + `conditionName`, else dropped. |
| 2 | Alarm classification | **Partially implemented** | `PipelineOperators.java:165` `evt.category = "PROCESS";`; `:182` `opc.put("alarmEventKind","CONDITION")` | Full ISA/OPC enums exist (`ActiveAlarm.cs:36-56`) but the pipeline hardcodes one category and one event type; `Category` is `b.Ignore`d in EF. |
| 3 | Priority / severity | **Implemented but duplicated 6× with 1 numeric divergence** | `PipelineOperators.java:161-164`, `:486-495`; `AlarmEnricher.cs:62-69`; `IoTDBPersistenceJob.java:184-206`; `AnalyticsController.cs:79-84`; `NormalizedAlarmIngestor.cs:294-302`; `AlarmIngestionService.cs:213-229` | Bands 900/700/400/100 agree everywhere. `DIAGNOSTIC→50` exists only in the IoTDB job (§3.3). |
| 4 | Alarm state transitions | **Partially implemented** | `PipelineOperators.LifecycleMap` (`:231-274`) — 3 states; `ActiveAlarm.cs:21-31` declares 8 | `Inhibited` is never assigned; `AcknowledgedCleared`/`UnacknowledgedCleared` are unreachable in the live projection because clears **delete** the row. |
| 5 | Active / cleared (RTN) | **Partially implemented** | `OpcEventStreamJob.java:137-151`; `PipelineOperators.toDeleteAlarmStateJson:443-456`; `NormalizedAlarmIngestor.HandleDeleteAsync:174-193` | RTN deletes the projection row. `KafkaConsumerService.cs:438-439` **skips** `ALARM_STATE_DELETE` from `alarm_history` → no CLEARED row is ever written to Postgres history. |
| 6 | Acknowledgement | **Partially implemented** | `AlarmCommands.cs:55-75` (single), `:122-162` (batch); `OperatorActionPublisher.cs:33-106`; Flink `OpcEventStreamJob.java:153-188` | **Ack-by-whom, ack-time and ack-comment are never persisted** (`AmsDbContext.cs:81-83` ignores them; `ActiveAlarm.Acknowledge` has zero production callers). |
| 7 | Suppression / OOS | **Partially implemented** | `ActiveAlarm.cs:269-294`; `AlarmCommands.cs:347-427`; `AmsDbContext.cs:89,96` | `is_suppressed` persists; `IsOutOfService` is `b.Ignore`d (state string only); no un-suppress; no OPC writeback; `AlarmEnricher.cs:89-91` hardcodes all three to `false` in the API DTO. |
| 8 | Shelving | **Partially implemented** | `ActiveAlarm.Shelve/Unshelve:231-266`; `ShelveExpiryService.cs:20-48`; `database/scripts/36_alarm_shelving.sql:55-81` | Expiry **does** fire (registered `Program.cs:163`, real SQL function). But expiry force-sets `state='ACTIVE'`, shelved rows are unreachable through `/alarms/active`, and the next OPC event silently un-shelves (§8.3). |
| 9 | Deduplication | **Partially implemented — CRITICAL producer/consumer key mismatch** | `PipelineOperators.DedupFilter:100-145`; `AlarmKeys.java:11-27`; `AlarmPartitionKeys.cs:24-59`; `src/frontend-ob/src/utils/alarmIdentity.ts:1-9` | Flink and C# derive **different UUIDs from the same alarm** — two independent causes, empirically verified (§9.2). |
| 10 | Alarm correlation | **Placeholder** | `PipelineOperators.CorrelationMap:278-295`; `RootCauseMap:297-334`; `ActiveAlarm.SetCorrelation:466-472` | `CorrelationMap` is a metric-counting pass-through. `RootCauseMap` is a hardcoded string match on CRUSHER/CONVEYOR/FEEDER/MOTOR. `SetCorrelation` has zero callers; `CorrelationId` is `b.Ignore`d. |
| 11 | Aggregation / rollup | **Partially implemented** | `AlarmKpiStreamJob.java:111-172`; `AlarmEnricher.GetStatsSummaryAsync:35-53`; `AnalyticsController.cs:20-102`; `alarmStore.ts:186-248` | Flink KPIs are global-only (`keyBy(json -> "GLOBAL")`) and dead-end in the UI (`alarmKpis` is written, never read). No rollup by area/unit anywhere. |
| 12 | Threshold / deadband / delay | **Missing** (server) — display-only on client | `openBridgeTheme.ts:55-65`; `AlarmRulesConfig.tsx:7-11` | No rule engine evaluates limits into alarms. `AlarmRulesConfig.tsx` is local `useState` with a disabled Save and a self-declared "Not functional yet" banner. `deadband` is authored (`types.ts:179`) and read by nothing. |
| 13 | Escalation | **Missing** | — | Zero backend hits for `escalat`. Only `NotificationsConfig.tsx:29,80` — a non-functional page with a fake 600 ms save. |
| 14 | Recovery / drift | **Partially implemented** | `OpcEventStreamJob.java:32-50`; `StateDriftDetectionJob.java`; `DriftAlertConsumerService.cs` | Flink recovery is real (EXACTLY_ONCE + committed offsets). The drift detector is **never submitted** and reads two producerless topics; the consumer only forwards to SignalR — it never acts. |
| 15 | Notification | **Partially implemented** | `src/services/notification-service/Providers/*`; `Orchestrator/NotificationOrchestrator.cs` | Providers really send (MailKit SMTP, Teams webhook). Policies are a hardcoded mock (`:162-178`), area matching is a comment, and the `root-cause-events` schema does not match `RootCauseEvent` (§15.2). Not wired to alarms directly. |
| 16 | Write-back | **Implemented** (ACK only) | `OpcCookieHelper.cs:91-140`; `OperatorActionPublisher.cs:41-47`; `HttpAckWritebackService.cs:104-183` | Real eligibility rules + idempotency key + at-least-once commit. **Shelve writeback is a no-op** (`NoOpOpcDcsGateway.cs:25-29`); unshelve/suppress have no writeback at all. |
| 17 | Flood / chattering | **Placeholder** | `PipelineOperators.FloodDetectFilter:360-383`; `AlarmKpiStreamJob.java:111-137`; `FloodAlertBanner.tsx` | `FloodDetectFilter` **discards** every alarm with severity ≥ 950 instead of flagging a flood. `OnFloodAlert` has no backend publisher, so the banner can never render (§17.3). Chattering exists only in never-deployed SQL. |
| 18 | Rationalization / master alarm DB | **Missing** | — | No table in `database/scripts/` (the only path mounted to `/docker-entrypoint-initdb.d`, `docker-compose.yml:58`). `configuration.alarm_tags` is referenced only by dead `database/procedures/alarm_operations.sql`. Zero `masterAlarm`/`MAD` hits in the UI. |

---

## 1. Alarm creation

**Status: Implemented** (two independent creators that must agree — and mostly do).

### 1.1 Primary creator — Flink `ValidationMap`

`src/flink/src/main/java/com/ams/flink/PipelineOperators.java:34-97`. This is where an alarm event
first becomes an object.

Required fields (hard gate, line 40):
```java
String source = text(root, "sourceName", "sourcePath");
String condition = text(root, "conditionName", "condition");
if (source.isEmpty() || condition.isEmpty()) return null;
```
Everything else is defaulted:

| Field | Default | Line |
|---|---|---|
| `serverId` | `f0af9a6d-…d110` (HTTP feed) / `7ce5ecbf-…383` (OPC) | `:44-47` |
| `subCondition` | `""` | `:48-49` |
| `alarmId` | `AlarmKeys.stableAlarmId(alarmKey)` unless the payload carries one | `:57-60` |
| `severity` | OPC path `300`; HTTP path derived from the `priority` string | `:63`, `:73` |
| `conditionActive` | `true` unless `state == "CLEARED"` / `conditionActive == false` | `:71`, `:75` |
| `ackRequired` | `true` for the HTTP feed, else from payload | `:77` |
| `eventTime` | `System.currentTimeMillis()` if no parseable timestamp | `:471-484` |

Feed discrimination is structural, not declared (`:42`):
```java
boolean httpFeed = root.has("alarmId") && root.has("state");
```

### 1.2 Secondary creator — the C# projection

`src/backend/AMS.Infrastructure/Kafka/NormalizedAlarmIngestor.cs:57-98` creates the Postgres row via
`ActiveAlarm.CreateFromOpcEvent` (`src/backend/AMS.Domain/Alarms/ActiveAlarm.cs:152-201`), which
enforces the only real domain invariants in the system:
```csharp
if (severity is < 1 or > 1000)
    throw new ArgumentOutOfRangeException(nameof(severity), "OPC A&E severity must be 1-1000");
if (string.IsNullOrWhiteSpace(sourceName))
    throw new ArgumentException("Source name is required", nameof(sourceName));
```
and always starts in `AlarmState.UnacknowledgedUncleared` (`:193`).

Creation is gated on `evt.ConditionActive` (`NormalizedAlarmIngestor.cs:57`): a first-sighting event
that is already cleared creates nothing.

There is a **third, informal creator** in the HTTP poller
(`src/backend/AMS.Api/BackgroundServices/AlarmIngestionService.cs:104-159`), which synthesises
`alarmId` as `correlation_id` or `"{tagName}|{condition}"` (`:114-116`) and emits synthetic `CLEARED`
records for anything that disappears from the snapshot (`:128-137`).

---

## 2. Alarm classification

**Status: Partially implemented.**

The type system is complete and ISA/OPC-shaped — `ActiveAlarm.cs:36-41` (`Simple=1`, `Tracking=2`,
`Condition=4`, matching OPC A&E §3.2), `:46-56` (8 categories), `:61-73` (10 source types).

The **pipeline never uses it.** `PipelineOperators.EnrichmentMap` (`:158-190`) hardcodes both:
```java
evt.category = "PROCESS";          // :165
opc.put("alarmEventKind", "CONDITION");   // :182
```
The C# side parses whatever arrives (`NormalizedAlarmIngestor.cs:304-323`) with `PROCESS` /
`CONDITION` as the fall-through defaults — so the parsers are correct but permanently fed one value.

`Category` and `EventType` are then discarded at the persistence boundary — `AmsDbContext.cs:74,76`:
```csharp
b.Ignore(a => a.EventType);
b.Ignore(a => a.Category);
```
and re-invented at read time as a constant — `AlarmEnricher.cs:83`: `Category: AlarmCategory.Process`.

Condition / sub-condition **are** carried faithfully end to end (`:43-44` in `AmsDbContext`,
`condition` / `sub_condition` columns) and are part of the identity key. That half is Implemented;
category and event-type classification is not.

---

## 3. Priority / severity logic

**Status: Implemented, but the mapping is written out six times.**

### 3.1 The canonical severity → priority band

Identical numeric thresholds in every location:

| Location | Code |
|---|---|
| `PipelineOperators.java:161-164` | `severity >= 900 ? "CRITICAL" : >= 700 ? "HIGH" : >= 400 ? "MEDIUM" : >= 100 ? "LOW" : "DIAGNOSTIC"` |
| `AlarmEnricher.cs:62-69` | `>= 900 => Critical, >= 700 => High, >= 400 => Medium, >= 100 => Low, _ => Diagnostic` |
| `IoTDBPersistenceJob.java:200-206` | `>= 900 CRITICAL, >= 700 HIGH, >= 400 MEDIUM, >= 100 LOW, else DIAGNOSTIC` |
| `AnalyticsController.cs:79-84` (SQL) | `>= 900 'CRITICAL', >= 700 'HIGH', >= 400 'MEDIUM', ELSE 'LOW'` — **no DIAGNOSTIC band** |
| `ActiveAlarm.cs:8-15` (doc comment only) | `Critical 900-1000, High 700-899, Medium 400-699, Low 100-399, Diagnostic 1-99` |

The SQL rollup in `AnalyticsController` is the one asymmetry: severity < 100 is counted as `LOW`
there and as `DIAGNOSTIC` everywhere else.

### 3.2 The reverse map (priority string → severity)

`PipelineOperators.priorityToSeverity` (`:486-495`):
```java
case "CRITICAL": return 900;
case "HIGH":     return 700;
case "MEDIUM":   return 400;
case "LOW":      return 100;
default:         return 300;
```

`IoTDBPersistenceJob.priorityToSeverity` (`:184-198`) is the same **plus one extra case**:
```java
case "DIAGNOSTIC": return 50;
```

### 3.3 Divergence (bug)

An HTTP-feed alarm with `priority: "DIAGNOSTIC"` is stored as **severity 50 / priority DIAGNOSTIC**
in IoTDB and as **severity 300 / priority LOW** in Postgres and the projection. The PIPE-007 comment
at `IoTDBPersistenceJob.java:187-190` explicitly requires the two to agree; the DIAGNOSTIC case
breaks that requirement.

### 3.4 Per-source override

There is **no** per-source or per-tag priority override anywhere. The only source-dependent
severity input is the HTTP feed's own numeric priority
(`AlarmIngestionService.cs:213-220`: `<=1 → CRITICAL, 2 → HIGH, 3 → MEDIUM, 4 → LOW, _ → LOW`).

### 3.5 Priority is not persisted

`AmsDbContext.cs:75` — `b.Ignore(a => a.Priority);`. `alarms.alarm_current`
(`database/scripts/02_alarm_schema.sql:37-50`) has **no priority column**. Consequences:

* `AlarmEnricher.cs:62` re-derives priority from `severity` on every read — correct.
* `AlarmHub.MapToPayload` (`src/backend/AMS.Api/Hubs/AlarmHub.cs:387`) does **not**:
  `Priority: a.Priority.ToString().ToUpper()`. On an entity loaded from Postgres, `Priority` is the
  enum default `0` (no member has value 0 — `Critical = 1`), so the SignalR payload carries the
  literal string `"0"`. Same file `:390` `ConditionActive: a.ConditionActive` → always `false`, and
  `:395` `ActiveTimeEpochMs: a.ActiveTime.ToUnixTimeMilliseconds()` → `-62135596800000`.
* `ActiveAlarmRepository.ApplyActiveFilters` (`AlarmRepositories.cs:77-82`) filters on the ignored
  `Priority` and `Category` properties, and `:50-51` sorts by `Priority`. These cannot be translated
  to SQL by EF Core — `?priority=Critical`, `?category=Safety` and `?sortBy=Priority` on
  `GET /api/v1/alarms/active` will throw rather than filter.

---

## 4. Alarm state transitions

**Status: Partially implemented.**

### 4.1 What Flink actually implements

`PipelineOperators.LifecycleMap` (`:211-274`), keyed by `alarmKey`, holds two `ValueState`s
(`prevLifecycle`, `prevAcknowledged`) and implements exactly **three** transitions (`:239-248`):

```java
if (prev == null)            { evt.transitionType = "NEW";     evt.lifecycleState = "ACTIVE";  }
else if (evt.conditionActive){ evt.transitionType = "ACTIVE";  evt.lifecycleState = "ACTIVE";  }
else                         { evt.transitionType = "CLEARED"; evt.lifecycleState = "CLEARED"; }
```

Guards:
* **Ack latch** (`:254-260`): a prior `acknowledged=true` is preserved across events *only while the
  condition stays active*; a fresh activation (`prev == null`) deliberately resets ack.
* **State eviction** (`:265-271`): on `CLEARED` both keyed states are cleared, so a re-activation is
  treated as `NEW` with ack reset. This bounds state growth at the cost of losing
  `AcknowledgedCleared` entirely.

### 4.2 What the domain declares but does not implement

`ActiveAlarm.cs:21-31` declares 8 states. Reachability in the live path:

| State | Reachable? | Evidence |
|---|---|---|
| `UnacknowledgedUncleared` | yes | `ActiveAlarm.cs:193`, `:421` |
| `AcknowledgedUncleared` | yes | `:222`, `:331`, `:369` |
| `UnacknowledgedCleared` | **no in the projection** — clears delete the row | `NormalizedAlarmIngestor.cs:153-157` `DeleteAsync` |
| `AcknowledgedCleared` | **no in the projection** — same | `:135-139` |
| `Shelved` | yes | `:244` |
| `SuppressedByDesign` | yes | `:277` |
| `OutOfService` | state string only; the boolean is `b.Ignore`d | `:291`, `AmsDbContext.cs:96` |
| `Inhibited` | **never assigned anywhere** | grep: only in the enum, `ConvertToDb:120` and `ConvertFromDb:140` |

`AmsDbContext.ConvertToDb` (`:109-123`) further collapses the 4 OPC states into 2 DB strings
(`ACTIVE` / `CLEARED`), so ack-ness has to be re-derived from `ack_status` on read
(`AlarmEnricher.ResolveEffectiveState:116-121`).

### 4.3 The un-ack / un-shelve regression (bug)

`AmsDbContext.cs:79` — `b.Ignore(a => a.ConditionActive);`. Every entity loaded from Postgres
therefore has `ConditionActive == false`. `ActiveAlarm.ApplyConditionChange` (`:400-426`) branches on
it:

```csharp
var wasActive = ConditionActive;      // always false for a loaded row
...
else if (conditionActive && !wasActive)
{
    Acknowledged = false;  AckTime = null;  AckedBy = null;
    ActiveTime   = eventTime;
    State        = AlarmState.UnacknowledgedUncleared;
}
```

`NormalizedAlarmIngestor.cs:133` and `:151` call this on **every** matched ingest event. So any
subsequent ACTIVE event for an existing alarm resets `Acknowledged` to `false` and forces
`State = ACTIVE` — which also silently un-shelves a shelved alarm and un-suppresses a suppressed one.
The Flink dedup filter throttles how often this happens, but it does not prevent it: the filter
explicitly lets an event through whenever the ack bit changes (`DedupFilter:133`), which is exactly
the oscillation this creates.

---

## 5. Active / cleared (RTN) logic

**Status: Partially implemented.**

Detection is a single boolean, decided at parse time
(`PipelineOperators.java:71` and `:75`) and re-decided at the projection boundary
(`OpcEventStreamJob.java:138-143`):
```java
if (!e.conditionActive) { return PipelineOperators.toDeleteAlarmStateJson(e); }
return PipelineOperators.toCurrentAlarmStateJson(e, e.acknowledged);
```

Effect on state: the C# consumer **deletes the row**
(`NormalizedAlarmIngestor.HandleDeleteAsync:187-192`):
```csharp
await publisher.PublishAlarmClearedAsync(alarm.Id, alarm.SourceName, eventTime, ct);
await uow.ActiveAlarms.DeleteAsync(alarm.Id, ct);
```
The same happens on the normal ingest path when `evt.ConditionActive == false` (`:135-139`,
`:153-157`). Consequences:

* An **unacknowledged cleared** alarm — the state ISA-18.2 requires an operator to still see —
  vanishes from the console. The frontend mirrors this (`alarmStore.ts:292-295`: an update with
  `conditionActive === false` deletes the entry from the Map).
* `AlarmState.UnacknowledgedCleared` / `AcknowledgedCleared` become unreachable in `alarm_current`.

Effect on history — **RTN is not recorded in Postgres.**
`src/backend/AMS.Infrastructure/Kafka/KafkaConsumerService.cs:432-444`:
```csharp
foreach (var evt in batch)
{
    if (string.Equals(evt.EventType, "ALARM_STATE_DELETE", StringComparison.OrdinalIgnoreCase))
        continue;                                  // ← every clear is skipped
    ...
    var state = !evt.ConditionActive ? "CLEARED" : evt.Acknowledged ? "ACKNOWLEDGED" : "ACTIVE";
```
The `"CLEARED"` branch is dead for the current producer, because every clear arrives as
`ALARM_STATE_DELETE`. `alarms.alarm_history.cleared_time` (`02_alarm_schema.sql:68`) therefore stays
NULL, which in turn makes `AnalyticsController.cs:48-52` ("fleeting alarms" =
`cleared_time - event_time < 60s`) permanently return 0.

RTN **is** recorded in IoTDB, on a separate path from `raw-alarms`
(`IoTDBPersistenceJob.java:156-160`), so historian-side RTN analysis is intact.

`alarms.alarm_state_transitions` exists (migration
`20260530160000_AddAlarmStateTransitions.cs:15`) and is queryable
(`AlarmsController.cs:402-427`), but `AlarmTransitionRepository.cs` contains only `QueryAsync` and
`StreamAsync` — **nothing in the solution ever INSERTs a transition row.** The SOE/transition API
returns an always-empty table.

---

## 6. Acknowledgement logic

**Status: Partially implemented.**

### 6.1 Single vs bulk

Both are real and distinct commands, but they behave differently:

* **Single** — `AlarmCommands.cs:55-75`. Loads the alarm, publishes straight to Kafka. It does **not**
  pre-check writeback eligibility, so an ineligible alarm surfaces as the
  `InvalidOperationException` thrown at `OperatorActionPublisher.cs:44`, which
  `GlobalExceptionFilter.cs:25-31` turns into a **500 with the generic message**
  `"An unexpected error occurred. Please contact support."` — the real reason is discarded.
* **Bulk** — `AlarmCommands.cs:122-162`, capped at 5000 (`:96-97`). It *does* check eligibility
  first (`:133-140`) and reports per-alarm failures.

The console routes both single-row and multi-row acknowledgement through the **batch** endpoint —
`AlarmConsole.tsx:199-216` filters the selection with `isOpcAckWriteable`, toasts a per-alarm skip
reason for the rest (`:203-209`), then calls `acknowledgeAlarmsBatch(ids, comment, operatorStation)`
(`:216`) — so the single-ack 500 path is latent rather than routinely hit.

Neither handler mutates the DB. Both delegate to Kafka `operator-actions`
→ Flink `toAckWriteback` (`OpcEventStreamJob.java:213-242`) → `ack-writeback`
→ `HttpAckWritebackService` → `ack-results` → Flink `toAckConfirmedState` (`:278-314`) →
`current-alarm-state` as `ACK_STATE_UPDATE`.

### 6.2 Ack-by-whom / ack-time / ack-comment — not persisted

`ActiveAlarm.Acknowledge(userId, comment, ackTime)` (`ActiveAlarm.cs:212-228`) is the only method
that sets `AckedBy` and `AckComment`. **It has zero production callers** — a full-solution grep finds
it only in `AMS.Tests.Integration/Alarms/AlarmLifecycleTests.cs:46,58,60,107`. Production uses:

* `ReconcileAcknowledgement(eventTime, userId: null, comment: null)` —
  `NormalizedAlarmIngestor.cs:92` and `:124`; and
* `ApplyAckLifecycle(...)` — `ActiveAlarm.cs:297-343`, which on `ACK_CONFIRMED` sets only
  `Acknowledged` / `AckTime` / `State`.

And the storage layer discards even those — `AmsDbContext.cs:81-83`:
```csharp
b.Ignore(a => a.AckTime);
b.Ignore(a => a.AckedBy);
b.Ignore(a => a.AckComment);
```
`alarms.alarm_current` has no `ack_time`/`acked_by`/`ack_comment` columns
(`02_alarm_schema.sql:37-50`). The API therefore **fabricates** an ack time —
`AlarmEnricher.cs:95-97`:
```csharp
AckTime:            a.Acknowledged ? DateTimeOffset.UtcNow : null,
AckedByUsername:    null,
AckComment:         null,
```
Every acknowledged alarm reports "acknowledged just now, by nobody, with no comment". This is an
ISA-18.2 / audit-trail gap, and it also makes the client-side MTTA calculation
(`Dashboard.tsx:50-63`, which uses `ackTimeEpochMs - activeTimeEpochMs`) meaningless.

The ack *lifecycle* state (`ACK_REQUESTED` … `ACK_CONFIRMED`) is written to
`CustomAttributes` (`ActiveAlarm.cs:306-321`) — which is also `b.Ignore`d
(`AmsDbContext.cs:102`). It survives only in memory and over SignalR.

### 6.3 Ack of already-cleared alarms

Blocked, in three places:
* `OpcCookieHelper.IsConditionActiveOnDcs` (`:87-89`) → `IsWritebackAckEligible` (`:91-120`) returns
  false → publisher throws.
* Client: `opcAckWriteable.ts:22-45` `if (!alarm.conditionActive) return false;`
* Moot in practice, because cleared alarms are deleted from the projection (§5).

### 6.4 Idempotency

* Domain: `ActiveAlarm.Acknowledge:214` `if (Acknowledged) return Result.Failure(...)` (dead code);
  `ReconcileAcknowledgement:362` `if (Acknowledged) return;`; `ApplyAckLifecycle:326` `if (!Acknowledged)`.
* Lifecycle ordering: `LifecycleEventConsumerService.cs:70-72` refuses to regress a terminal ack
  state — mirrored client-side in `alarmReconciliation.ts:140-149`.
* Writeback: `HttpAckWritebackService.cs:104-106` builds an `idempotency_key` from `CommandId`, or
  `"{alarmId}|{activeTimeEpochMs}|{cookieOffset}"`, and commits the Kafka offset only after the
  `ack-result` publish succeeds (`:169-183`) — genuine at-least-once with dedup at the DCS.
* Comment is **not** enforced despite the UI claim: `AcknowledgeDialog.tsx:42` auto-fills
  `'Acknowledged by operator via console'`.

---

## 7. Suppression logic

**Status: Partially implemented.**

Three distinct concepts exist and are kept apart in the domain (`ActiveAlarm.cs`):

| Concept | Method | Persisted? |
|---|---|---|
| Designed / engineering suppression | `Suppress:269-282` → `State = SuppressedByDesign`, `IsSuppressed = true` | `is_suppressed` **yes** (`AmsDbContext.cs:89`); `SuppressedAt`/`SuppressedBy`/`SuppressionReason` **no** (`:93-95`) |
| Out of service | `SetOutOfService:285-294` → `State = OutOfService` | boolean **no** (`b.Ignore`, `:96`); only the state string survives |
| Shelving | §8 | partially |

Guards that are real: `Suppress:271` rejects a double-suppress; `SetOutOfService:287-288` rejects a
double-set and an empty reason.

What is missing:
* **No un-suppress / return-to-service path at all.** `IOpcDcsGateway` (`AlarmCommands.cs:494-498`)
  has only `AcknowledgeAlarmAsync` and `ShelveAlarmAsync`. The client documents the gap deliberately
  — `src/frontend-ob/src/api/alarmApi.ts:95-98`.
* **No DCS writeback** for suppression or OOS.
* **The suppression flag never reaches the API consumer.** `AlarmEnricher.cs:89-91` hardcodes
  `IsShelved: false, IsSuppressed: false, IsOutOfService: false` in every `ActiveAlarmDto`.
* **The counters are stubs.** `AlarmEnricher.GetStatsSummaryAsync:49-52` returns
  `Shelved: 0, Suppressed: 0, AlarmsPerTenMin: 0, FloodActive: false`.

**Filtering from views is inconsistent and unreliable:**

| Surface | Excludes shelved/suppressed? | Evidence |
|---|---|---|
| `GET /alarms/active` | Yes — but as a side effect | `AlarmRepositories.cs:73` keeps only `UnacknowledgedUncleared`/`AcknowledgedUncleared`; a shelved row's state is `SHELVED`, so it is excluded. This makes the advertised `?isShelved=true` filter (`:87-88`) **unreachable** — you cannot list shelved alarms. |
| DTO / stats | No — hardcoded false / 0 | `AlarmEnricher.cs:89-91,49-50` |
| Console grid (client) | **No** | `AlarmConsole.tsx:128-135` filters only on `alarmMatchesConnectedOpcServer` + `isDisplayableOpcAlarm` + the preset facets. The former (`opcAlarmFilter.ts:24-33`) drops non-active rows via `isActiveOpcAlarm` (`:3-5`, `conditionActive === true`) but has **no shelve/suppress/OOS check**, so those rows stay in the grid and are merely CSS-styled (`AlarmConsole.tsx:501-502`) |
| Client stats | Yes | `alarmStore.ts:193` |
| HMI symbol index | Yes | `alarmStore.ts:223` |
| Designer alarm table | Yes | `SymbolRenderer.tsx:194` |

The repository doc comment at `AlarmRepositories.cs:36-37` ("with no filters, all Active alarms
(incl. shelved/suppressed) are returned") contradicts line 73 and is factually wrong.

---

## 8. Shelving

**Status: Partially implemented — expiry does fire.**

### 8.1 Shelve / unshelve

`ActiveAlarm.Shelve:231-249` enforces the ISA-18.2 rules that matter:
```csharp
if (IsShelved) return Result.Failure("Alarm is already shelved");
if (durationMinutes > maxDurationMinutes)          // default 480 = 8 h
    return Result.Failure($"Shelve duration exceeds maximum allowed ({maxDurationMinutes} minutes)");
if (string.IsNullOrWhiteSpace(comment))
    return Result.Failure("Shelve comment is required per ISA-18.2");
```
Duplicated as a FluentValidation rule (`AlarmCommands.cs:187-190`), a DataAnnotation
(`AlarmsController.cs:487`) and a client check (`ShelveDialog.tsx:70-77`) — all agreeing on 1–480.

`Unshelve:252-266` restores via `DetermineNormalState()` (`:474-480`). It has an explicit TODO for
the missing DCS un-suppression (`AlarmCommands.cs:307`).

Shelve *does* attempt a DCS writeback (`AlarmCommands.cs:234`) — into `NoOpOpcDcsGateway`
(`src/backend/AMS.Infrastructure/Opc/NoOpOpcDcsGateway.cs:25-29`), which logs and returns. Registered
at `Program.cs:108`. So plant-side suppression never happens.

### 8.2 Does expiry actually fire? — **Yes**

Three things all had to be true, and all three are:
1. `ShelveExpiryService` is registered — `Program.cs:161-163` (`// DOM-02: … was implemented but
   never registered`), running once a minute (`ShelveExpiryService.cs:41`).
2. `alarms.expire_shelved_alarms()` exists against the table the code actually uses —
   `database/scripts/36_alarm_shelving.sql:55-81` (the older definition in
   `database/procedures/alarm_operations.sql:229` targeted the non-existent `alarms.active_alarms`).
3. The columns exist and are EF-mapped — `36_alarm_shelving.sql:21-25`, `AmsDbContext.cs:87-91`.

`database/scripts/` is the directory mounted at `/docker-entrypoint-initdb.d`
(`infra/docker/docker-compose.yml:58`), so script 36 runs on bootstrap.
`database/procedures/` is **not mounted anywhere** — every function in it is dead.

### 8.3 What is still wrong

* Expiry resets state unconditionally (`36_alarm_shelving.sql:61-68`):
  ```sql
  UPDATE alarms.alarm_current SET is_shelved = FALSE, shelve_until = NULL,
         state = 'ACTIVE', last_updated = NOW()
  ```
  An alarm that cleared or was acknowledged while shelved comes back as `ACTIVE`. `shelved_by` is
  also left populated.
* `ShelvedAt` and `ShelveComment` are `b.Ignore`d (`AmsDbContext.cs:90,92`) — the mandatory ISA-18.2
  comment is validated, then thrown away.
* Shelved alarms are invisible to `GET /alarms/active` in *both* directions (§7).
* The next OPC event un-shelves the alarm through `ApplyConditionChange` (§4.3).
* `alarms.shelving_actions` (`36_alarm_shelving.sql:34-45`) is written **only** by the expiry sweep
  — operator shelve/unshelve actions are never inserted, so the audit trail records auto-expiry but
  not the human action that caused it.

---

## 9. Deduplication

**Status: Partially implemented — with a critical producer/consumer key mismatch.**

### 9.1 The runtime dedup filter

`PipelineOperators.DedupFilter:100-145`, keyed by `alarmKey`. Three `ValueState`s
(`lastEventTime`, `lastConditionActive`, `lastAcknowledged`) and one rule (`:135-138`):
```java
if (prev != null && prev >= evt.eventTimeEpochMs && !activeChanged && !ackChanged) {
    evt.duplicate = true;
    return false;
}
```
i.e. suppress non-advancing timestamps *unless* the active bit or the ack bit changed. That is a
sound design. A second, independent RBE dedup runs in `LiveStateJob.RbeAlarmStateMap:156-160` on the
fingerprint `state|severity|ack|active|priority`.

### 9.2 The identity key — three formulas, two of them incompatible

| Producer/consumer | Key string | UUID derivation |
|---|---|---|
| Flink (`AlarmKeys.java:11-13`, `:15-27`) | `serverId\|source\|condition\|subCondition` — **no prefix, no trim** | raw MD5 → `new UUID(msb,lsb)`; **no version/variant bits**; big-endian |
| C# (`AlarmPartitionKeys.cs:31-36`, `:53-59`) | `"v1\|" + serverId\|trim(source)\|trim(condition)\|trim(sub)` | MD5 → `hash[6]=(hash[6]&0x0F)\|0x30; hash[8]=(hash[8]&0x3F)\|0x80` → `new Guid(span)` = **little-endian** for the first three fields |
| Frontend (`alarmIdentity.ts:1-9`) | `serverId\|source\|condition\|sub`, trimmed — *family id only*, never hashed | n/a |

Empirically verified for `7ce5ecbf-70c9-498d-b899-5c8bb7add383|FIC1001|PVLEVEL|HI`:

```
Flink AlarmKeys.stableAlarmId(key)              -> 200857f7-7e97-0e79-066c-a810cf9613e5
C#    DeterministicAlarmId("v1|" + key)         -> 97985a3e-a11e-8636-b131-bb1139e1ccfa
C#    derivation applied to the SAME key string -> f7570820-977e-793e-866c-a810cf9613e5
Java  UUID.nameUUIDFromBytes("v1|" + key)       -> 3e5a9897-1ea1-3686-b131-bb1139e1ccfa
```

Two independent defects:
1. **Different input string.** C# prepends `v1|`; Flink does not.
2. **Different UUID assembly.** Even on the identical string the outputs differ
   (`200857f7-…` vs `f7570820-…`) because `new Guid(byte[])` is little-endian for `Data1/2/3` while
   Java's `new UUID(msb,lsb)` is big-endian. The C# comment at `AlarmPartitionKeys.cs:52`
   ("Matches Java `UUID.nameUUIDFromBytes(versionedInstanceKey)`") is demonstrably false —
   `3e5a9897-…` vs `97985a3e-…`, byte-swapped. The version nibble is also set on the wrong byte for
   .NET's layout, so the emitted GUID reports version `8`, not `3`.

**Why it has not exploded yet:** `NormalizedAlarmIngestor.ResolveAlarmIdentity:270-282` prefers the
`alarmId` carried on the Kafka record and only falls back to `DeterministicAlarmId` when it is
absent or unparseable. Since Flink always populates `alarmId`, the C# formula is dormant on the main
path. It becomes live the moment any producer omits `alarmId`, or any C# component (a backfill, a
reconciliation, a new HTTP path) computes the id itself — at which point the same physical alarm
gets two rows. `alarms.alarm_current.alarm_id` is `UNIQUE` (`02_alarm_schema.sql:39`) but the two
formulas produce two *different* `alarm_id`s, so the constraint will not catch it.

**Frontend vs C# family id agree.** `alarmIdentity.ts:8` and `AlarmPartitionKeys.LogicalAlarmFamilyId:42-47`
produce the same string. But `AlarmEnricher.cs:109` builds it from the *config* server id rather than
the alarm's own, so an API-supplied family id can disagree with the hub-supplied one
(`AlarmHub.cs:404-405`, which uses `a.ServerId`). Note also that the family id is computed and shipped
but **never used as a dedup key** — the client dedups on the raw `alarm.id` string
(`alarmStore.ts:138,299`).

---

## 10. Alarm correlation

**Status: Placeholder.**

* `PipelineOperators.CorrelationMap:278-295` is named "correlation-engine" and wired as such
  (`OpcEventStreamJob.java:100-105`). Its entire body increments two metric counters and returns the
  input unchanged. No correlation is computed.
* `PipelineOperators.RootCauseMap:297-334` is the only real logic, and it is a hardcoded demo:
  ```java
  if (!src.contains("CRUSHER") && !src.contains("CONVEYOR") && !src.contains("FEEDER") && !src.contains("MOTOR"))
      return "";
  out.put("rootCause", src.contains("CRUSHER") ? "Crusher" : evt.source);
  ```
  It emits a `suppressed` array of *tag-name substrings*, not alarm ids. No time window, no topology,
  no plant model.
* `ActiveAlarm.SetCorrelation:466-472` — zero callers. `CorrelationId`, `RootCauseAlarmId` and
  `IsRootCause` are all `b.Ignore`d (`AmsDbContext.cs:97-99`), so nothing could persist anyway.
* Client: no grouping, no parent/child tree, no related-alarm list. `correlationId` and `isRootCause`
  render as two read-only rows in `AlarmDetailPanel.tsx:280-291`. Worse, the field is reused for ACK
  command tracing (`alarmReconciliation.ts:167`), conflating two different meanings on one property.
* The only operational "correlation" is manual: suppression reason presets
  (`SuppressDialog.tsx:17,19` — "Redundant alarm — primary alarm active on parent").

---

## 11. Alarm aggregation / rollup

**Status: Partially implemented.**

### Flink — `AlarmKpiStreamJob.java`
* Alarm rate: 10-minute sliding window, 1-minute slide (`:77`), counting only `lifecycleState == "ACTIVE"`
  (`:71-76`). **`windowAll` — not keyed by area, server or priority** (`:77`).
* Standing alarms: `keyBy(json -> "GLOBAL")` (`:95`, comment: `// Simple global counter for lab purposes`)
  with a naive `++` / `Math.max(0, --)` (`:155-159`). `oldestStandingDurationMs` is hardcoded 0
  (`:168`, `// Requires complex state map to track oldest, simplified for demo`). The source starts
  at `OffsetsInitializer.latest()` (`:46`), so the count restarts from 0 on every job restart and
  drifts permanently against reality.

### Backend
* `AlarmEnricher.GetStatsSummaryAsync:35-53` — a genuine priority rollup over the active set
  (`>= 900`, `700–899`, `400–699`, `100–399`), plus stub zeros for shelved/suppressed/rate/flood.
* `AnalyticsController.cs:20-102` — real SQL rollups: hourly rates, top-10 bad actors (7 d),
  priority histogram, stale-alarm count (unacked > 15 min), a chattering *proxy*
  (`HAVING COUNT(*) >= 5` per source in 24 h, `:39-46`) and a fleeting count that is
  structurally always 0 (§5).

### Client
* `alarmStore.recalcStatsFromAlarms:186-210` — priority rollup, with `LOW` and `DIAGNOSTIC` merged
  (`:199`).
* `alarmStore.rebuildSourceIndex:217-248` — rollup **by source name**, the closest thing to an area
  rollup. **There is no rollup by plant area/unit anywhere in the system.**
* `alarmStore.ts:717-719` — `state.alarmKpis[payload.kpiType] = payload;` overwrites by KPI type, so
  any per-area or per-priority KPI sharing a `kpiType` clobbers the previous one. And **nothing ever
  reads `alarmKpis`** (verified: written at `:718`, no readers) — the entire Flink KPI → SignalR
  chain terminates in an unread store field.

---

## 12. Threshold logic

**Status: Missing on the server; display-only on the client.**

There is **no alarm rule engine**. Nothing in the repo evaluates a limit, deadband, hysteresis,
on-delay or off-delay to *produce* an alarm. Alarms arrive pre-formed from the DCS/HTTP feed.

The nearest candidate is not one: `AnalysisExecutionJob.java` + `ExpressionEvaluator.java` is an
arithmetic-only calculator for the analysis-service (`ExpressionEvaluator.java:8-16`:
"Supports + - * / % ^, parentheses, unary minus … Deliberately NOT a general scripting engine"). It
has no comparison operators and cannot emit an alarm.

### `AlarmRulesConfig.tsx` — traced to its consumer: there is none

`src/frontend-ob/src/components/Administration/AlarmRulesConfig.tsx:7-11`:
```tsx
const [formData, setFormData] = useState({
  floodThreshold: 10, floodWindowMinutes: 10,
  maxShelveDurationHours: 24, chatteringThreshold: 3,
  chatteringWindowMinutes: 5, autoUnshelve: true, requireAckComment: true,
});
```
No `fetch`, no axios, no react-query, no localStorage, no store. The Save button is hard-disabled
(`:41-53`, label `"Save unavailable"`) and the page carries its own banner (`:20-28`):
*"Not functional yet — these settings are not connected to the backend and cannot be saved."*

Two of its defaults actively contradict shipped behaviour:
* `maxShelveDurationHours: 24` vs the enforced 480-minute (8 h) cap (`ActiveAlarm.cs:231`,
  `ShelveDialog.tsx:74`).
* `requireAckComment: true` vs `AcknowledgeDialog.tsx:42`, which silently auto-fills a comment.

The one real admin endpoint is `AlarmFeedConfig.tsx` → `GET /api/v1/admin/alarm-feed` and
`POST /api/v1/admin/alarm-feed/test` — feed connectivity only, no rules.

### Client-side limit evaluation (HMI symbols, not alarms)

`src/frontend-ob/src/components/Designer/openBridgeTheme.ts:55-65` and the duplicate at
`SymbolRenderer.tsx:47-66`:
```ts
if (limits.hiHi !== undefined && value >= limits.hiHi) return OBC.alarm;
if (limits.loLo !== undefined && value <= limits.loLo) return OBC.alarm;
if (limits.hi   !== undefined && value >= limits.hi)   return OBC.warning;
if (limits.lo   !== undefined && value <= limits.lo)   return OBC.caution;
```
This colours a symbol; it does not create an alarm. `deadband` is authored
(`Designer/types.ts:179`, editor input at `PropertyInspector.tsx:1863-1864`) and **read by nothing**
— so a value sitting on a limit flickers. On-delay exists only as a recommendation string
(`Analytics.tsx:587`: `'Apply 5s ON-delay'`).

---

## 13. Escalation logic

**Status: Missing.**

No time-based escalation of unacknowledged alarms exists anywhere. A repo grep for
`escalat|Escalat` across `src/` returns five hits: three unrelated comments and two strings in
`NotificationsConfig.tsx` (`:29`, `:80`, `:198`) — a page whose "save" is
`await new Promise(r => setTimeout(r, 600))` (`:49`), starts empty, and carries a
"Not functional yet" banner (`:73-81`).

The closest live mechanism is the **ACK SLA watchdog**, and it is switched off —
`src/backend/AMS.Infrastructure/Kafka/AckSlaWatchdogService.cs:13`:
```csharp
[Obsolete("Disabled in Flink-only mode. Flink lifecycle engine owns ACK SLA and timeouts.")]
```
It is not in the `AddHostedService` list (`Program.cs:130-163`). Its thresholds (`:25-31`:
QUEUED 5 s, PROCESSING 10 s, DISPATCHED 15 s, PENDING_DCS 30 s) are therefore inert. **The claim in
that attribute is false**: grepping the Flink jobs for `ACK_TIMEOUT` / `AckTimeout` returns nothing
but checkpoint timeouts. No component emits `ACK_TIMEOUT`. The client already treats `ACK_TIMEOUT` as a terminal ack state
(`AlarmConsole.tsx:352`; `alarmReconciliation.ts:140-149`) and renders a pending-ack elapsed timer
against it (`:351-353`) — a state no component in the system ever emits, so the timer counts up
forever.

---

## 14. Recovery logic

**Status: Partially implemented.**

### What works
* `OpcEventStreamJob.java:32-36` — 30 s `EXACTLY_ONCE` checkpointing, 120 s timeout,
  `RETAIN_ON_CANCELLATION`. All keyed state (dedup, lifecycle, ack latch) is snapshotted.
* `:42-50` — offsets default to `committedOffsets(EARLIEST)`, so a JobManager incident resumes rather
  than replaying the whole topic. `:198-202` applies the same to `operator-actions` / `ack-results`,
  which is what stops a restart from re-dispatching historical ACK writebacks.
* `KafkaConsumerService.FlushBatchAsync:291-338` — offsets commit only after Postgres accepts the
  batch, with exponential backoff and a DLQ that itself must confirm before offsets advance.
* `HttpAckWritebackService.cs:53,169-183` — manual commit after the ack-result publish (STR-10).
* `infra/docker/flink-job-supervisor.sh:64-87` — resubmits missing jobs on an interval and refuses to
  submit on top of a running copy (correctly noting that Flink's KafkaSource does not use consumer
  group coordination, so duplicates double-process).
* Client: `alarmStore.ts:570-579` refetches the full active set on `onreconnected` and evicts
  anything the API no longer returns (`:412-428`).

### What does not
* **State is rebuilt in Flink, not in Postgres.** `alarm_current` is a projection with no
  reconciliation job — a Postgres restore from backup is never re-derived from
  `current-alarm-state` (which *is* compacted, so the material exists).
* **`StateDriftDetectionJob` never runs.** It is absent from
  `infra/docker/flink-job-supervisor.sh:89-136` (which submits nine other jobs) and from every
  `flink-submit-*.sh`. It also reads two topics that exist but have **no producer** —
  `alarm.events.raw` and `alarm.state.active` (`StateDriftDetectionJob.java:32,41`; the topics are
  created by `scripts/kafka-reset-lab-topics.ps1:33,35`; independently confirmed by
  `docs/architecture-review/05-streaming-review.md:49` and `docs/plans/STR-08-job-decisions.md:16`).
  It also sets **no checkpointing at all**.
* Its detection rule, were it running, is one timer (`:96-97`, `:107-120`): if a raw event arrives
  and no state update follows within 10 s, emit `DRIFT_MISSING_STATE`. No value comparison, no
  reconciliation.
* **`DriftAlertConsumerService` only reports.** `src/backend/AMS.Api/BackgroundServices/DriftAlertConsumerService.cs:57`:
  `await _hub.Clients.All.OnDriftAlertReceived(payload);` — that is the whole handler. It never
  corrects state, never quarantines, never raises a lifecycle alert.
* `AlarmReplayEngine.java:39` reads the same producerless `alarm.events.raw`, so replay-based
  recovery cannot work either. It is launched on demand from `FlinkRestClient.cs:35`.

---

## 15. Notification logic

**Status: Partially implemented.**

### 15.1 Does it send anything? Yes — email and Teams; no SMS.
* `Providers/EmailProvider.cs:31-55` — real MailKit SMTP `ConnectAsync` / `SendAsync`, HTML body,
  rethrows on failure. Config `Smtp:Host` (default `localhost`), `Smtp:Port` (25), `Smtp:From`.
* `Providers/TeamsWebhookProvider.cs:19-56` — real `PostAsJsonAsync` of an AdaptiveCard,
  `EnsureSuccessStatusCode`.
* No SMS provider exists (`NotificationChannel.Type` comments mention it, `Models.cs:37`).
* `docker-compose.yml:1205-1207` leaves `SMTP_HOST` empty by default, so out of the box the email
  path connects to `localhost:25` and fails into the log.

### 15.2 Is it wired to alarms? Only indirectly, and the wiring is broken.

Two consumers (`Program.cs:35,38`):
* `RootCauseConsumer` → topic `root-cause-events` (`:26`), produced by
  `OpcEventStreamJob.java:119-122`.
* `LifecycleAlertConsumer` → topic `lifecycle-alerts`.

**Schema mismatch on the root-cause path.** Flink emits (`PipelineOperators.RootCauseMap:323-332`):
`{alarmId, rootCause, suppressed[], eventTime}`. The consumer deserialises into `RootCauseEvent`
(`Models/Models.cs:9-20`), which expects `RootCauseId, InitiatingAlarmId, RootEquipmentId,
RootEquipmentName, CorrelatedAlarmIds, AffectedAreas, DetectedAtEpochMs, PropagationDurationMs,
RuleName`. **No field overlaps.** With `PropertyNameCaseInsensitive = true` the deserialise
*succeeds* and yields an all-default object, which then produces an email whose subject is
`"[AMS ROOT CAUSE] : "` and whose body lists an empty equipment name, alarm id and 1970 timestamp.

**Policies are a mock.** `Orchestrator/NotificationOrchestrator.cs:162-178`:
```csharp
private List<NotificationPolicy> GetActivePoliciesForArea(List<string> areas)
{
    // Mock DB fetch
    return new List<NotificationPolicy> { new NotificationPolicy {
        Name = "Critical Operations Team",
        TargetAreas = new List<string> { "Plant/Area1", "Plant/Area2" }, // Assume it matches
        Channels = new List<NotificationChannel> {
            new NotificationChannel { Type = "EMAIL", TargetEndpoint = "ops-lead@plant.local" }, } } };
}
```
The `areas` parameter is never read — `TargetAreas` is never compared to anything. Shift scheduling
is equally nominal (`:150-160`, `// Shift logic evaluation (mock simple logic)` — only day-of-week is
checked; `StartTime`/`EndTime`/`Timezone` are ignored). There is no notification-policy table in
`database/scripts/`.

**No alarm-triggered notification.** There is no consumer of `current-alarm-state`,
`lifecycle-events`, or any priority threshold. An individual CRITICAL alarm notifies nobody.
`lifecycle-alerts` is a *platform* alert channel (telemetry deadman + the disabled ACK-SLA watchdog),
explicitly documented as such at `NotificationOrchestrator.cs:74-78` and `:131-132`.

---

## 16. Write-back logic

**Status: Implemented for ACK; missing for everything else.**

The governing rule is `OpcCookieHelper.IsWritebackAckEligible`
(`src/backend/AMS.Application/Alarms/OpcCookieHelper.cs:91-120`) — the single decision point,
called from `OperatorActionPublisher.cs:41` (every ACK) and `AlarmCommands.cs:133` (batch pre-check):

```csharp
if (IsHttpFeedAlarm(alarm))
    return IsConditionActiveOnDcs(alarm) && !string.IsNullOrWhiteSpace(alarm.ConditionName);

if (IsSnapshotFeedAlarm(alarm)) return false;
if (!IsConditionActiveOnDcs(alarm)) return false;
if (string.IsNullOrWhiteSpace(alarm.ConditionName)) return false;
var cookie = ExtractCookieOffset(alarm);
if (cookie <= 0) return false;
if (alarm.OpcAttributes.TryGetValue("opcAckWriteable", out var flag)) { ... }
var kind = ... ; if (!string.Equals(kind, "CONDITION", ...)) return false;
if (src.StartsWith("Tracking", ...) || src.StartsWith("System", ...)) return false;
```

So the business rules are: OPC path requires a **live cookie offset** (the OPC A&E ACK handle), an
**active condition on the DCS**, a **condition name**, event kind `CONDITION`, and a source that is
not a Tracking/System pseudo-event; HTTP-feed path only needs active + condition name. Each rejection
has an operator-readable reason (`AckIneligibleReason:122-140`).

The producer of `opcAckWriteable` is `PipelineOperators.EnrichmentMap:173-174`, and it is recomputed
identically in C# at `NormalizedAlarmIngestor.IsOpcAckWriteable:253-264` and again on the client at
`opcAckWriteable.ts:22-45`. **Three copies, and this time they agree** — a rare consistency in this
codebase, but still three places to keep in step.

Delivery: `HttpAckWritebackService.cs:108-116` POSTs
`{correlation_ids, source_event_id, idempotency_key, action:"ACKNOWLEDGE", operator, timestamp}`,
resolving the DCS-side correlation id by preference order `sourceAlarmId` →
`"{sourceName}|{conditionName}" `→ `alarmId` (`:199-211`). Success/failure is published to
`ack-results` and only then is the offset committed (`:169-183`).

**Everything except ACK is unwired.** `IOpcDcsGateway` exposes only `AcknowledgeAlarmAsync` and
`ShelveAlarmAsync` (`AlarmCommands.cs:494-498`), and both land in `NoOpOpcDcsGateway`
(`:19-29`), registered at `Program.cs:108`. Shelve logs a warning and returns; unshelve, suppress and
out-of-service have no gateway method at all.

---

## 17. Flood / chattering detection

**Status: Placeholder.**

### 17.1 `FloodDetectFilter` is not flood detection — it is a severity blackhole

`PipelineOperators.java:360-383`, wired as the `flood-detection` operator
(`OpcEventStreamJob.java:107-111`):
```java
if (Math.max(evt.severity, evt.rawSeverity) >= 950) {
    return false;                          // ← the event is DROPPED
}
```
This is a `RichFilterFunction`. Returning `false` removes the record from the stream entirely — it
never reaches the lifecycle projection, `current-alarm-state`, `lifecycle-events` or the root-cause
sink. **Any alarm with severity ≥ 950 is silently discarded**, which is the exact inverse of what
ISA-18.2 flood handling requires. There is no rate measurement here at all, and no flood *signal* is
emitted.

(The PIPE-012 comment at `:374-376` claims `rawSeverity` makes the band reachable for HTTP-feed
events. It does not: `AlarmIngestionService.PublishEventAsync:144-156` never emits a `severity` key,
so `ValidationMap:66-68` leaves `rawSeverity == severity ≤ 900`.)

### 17.2 The real rate calculation exists but goes nowhere

`AlarmKpiStreamJob.AlarmRateProcessWindowFunction:111-137`, over a 10-min/1-min sliding window:
```java
if      (count > 50) result.floodStatus = "SEVERE_FLOOD";
else if (count > 20) result.floodStatus = "MAJOR_FLOOD";
else if (count > 10) result.floodStatus = "MINOR_FLOOD";
else                 result.floodStatus = "NORMAL";
```
(`> 10 per 10 min` is the ISA-18.2 threshold, correctly chosen.) The job **is** submitted
(`flink-job-supervisor.sh:131`) and sinks to `kpi-alarm-rates`, consumed by
`KpiConsumerService.cs:17-24,70-72` → `OnAlarmKpiUpdate` → `alarmStore.ts:718`
`state.alarmKpis[payload.kpiType] = payload;` — **and nothing reads `alarmKpis`.** Dead end.

### 17.3 `FloodAlertBanner.tsx` — traced to its feed: an event nobody publishes

The banner is purely presentational (`FloodAlertBanner.tsx:11-12`: `if (!alert.isFlood) return null;`).
Its only source is `alarmStore.ts:536-538`:
```ts
connection.on('OnFloodAlert', (alert: FloodAlert) => {
  set(state => { state.floodAlert = alert.isFlood ? alert : null; });
});
```
`OnFloodAlert` is emitted by `AlarmSignalRPublisher.PublishFloodAlertAsync`
(`AlarmHub.cs:335-340`, threshold `rate > 10`) — and a solution-wide grep finds **no caller**: the
symbol appears only at the interface declaration (`AlarmCommands.cs:438`) and the implementation.
The same is true of `OnAnalyticsUpdate`, `PublishBulkAlarmsUpdatedAsync`, `PublishConnectionStatusAsync`
and `OnSoeEvent`. **The flood banner can never render.**

The other flood indicator, `stats.floodActive` from `/alarms/active/statistics`, is hardcoded false
(`AlarmEnricher.cs:51-52`), and the client deliberately preserves rather than recomputes it
(`alarmStore.ts:204-208`).

### 17.4 Chattering

The only real implementation is `analytics.detect_chattering_alarms`
(`database/procedures/alarm_operations.sql:345-370`, `> p_threshold` transitions in
`p_window_minutes`), which is **never created** — `database/procedures/` is not mounted
(`docker-compose.yml:58` mounts only `database/scripts`), and it reads
`alarms.alarm_state_transitions`, which nothing ever writes (§5), joined to
`configuration.alarm_tags`, which no live script creates.

What ships instead is a coarse proxy in `AnalyticsController.cs:39-46` —
`GROUP BY source HAVING COUNT(*) >= 5` over 24 h of `alarm_history` — surfaced as
`chatteringCount` in `Analytics.tsx:143-145`. That counts *occurrences*, not
active↔clear transitions, so it cannot distinguish a chattering alarm from a busy one.
No client-side chattering detection exists.

---

## 18. Alarm rationalization / master alarm database

**Status: Missing.**

ISA-18.2 §6–7 requires a master alarm database (the rationalized record: design basis, consequence,
operator action, assigned priority, allowable response time) as the authority for every configured
alarm. There is none.

* **No schema.** `database/scripts/` (the only path mounted to `/docker-entrypoint-initdb.d`) has no
  rationalization, alarm-master or alarm-tag table. Grep for
  `rationaliz|master_alarm|alarm_tags|bad_actor` across `database/` matches exactly one file:
  `database/procedures/alarm_operations.sql`, which is never deployed and which references
  `configuration.alarm_tags` and `analytics.bad_actor_analysis` — neither of which any live script
  creates.
* **No priority authority.** Priority is derived from the incoming OPC severity number at every read
  (§3). There is no per-tag configured priority, no override, and therefore nothing to rationalize
  against.
* **No UI.** Zero hits for `masterAlarm` / `MAD`. `rationaliz` appears four times, all cosmetic:
  the heading of the non-functional `AlarmRulesConfig.tsx:35`, a description string in
  `Analytics.tsx:139`, and a shelve-reason preset in `ShelveDialog.tsx:29`.
* **No supporting record.** `ActiveAlarm` has no consequence, operator-action, response-time or
  design-basis field; `AlarmTagId` exists on the entity (`ActiveAlarm.cs:84`) and is `b.Ignore`d
  (`AmsDbContext.cs:73`), pointing at a table that does not exist.

---

## Divergent duplicate logic

Business rules implemented more than once, ordered by severity.

### D1 — Alarm identity: Flink vs C# (CRITICAL)
`AlarmKeys.java:11-27` vs `AlarmPartitionKeys.cs:31-59`. Different key string (`v1|` prefix) **and**
different UUID assembly (endianness + version/variant bits). Empirically:
`200857f7-7e97-0e79-066c-a810cf9613e5` (Flink) vs `97985a3e-a11e-8636-b131-bb1139e1ccfa` (C#) for the
same alarm. The documented equivalence at `AlarmPartitionKeys.cs:52` is false. Currently masked
because C# accepts Flink's `alarmId` verbatim (`NormalizedAlarmIngestor.cs:272-276`); any path that
omits `alarmId` produces duplicate rows that the `UNIQUE` constraint cannot catch. **Fix: make one
side authoritative and delete the other; add a cross-language golden-vector test.**

### D2 — `DIAGNOSTIC` priority → severity (BUG)
`IoTDBPersistenceJob.java:195` returns `50`; `PipelineOperators.java:493` has no `DIAGNOSTIC` case and
returns `300`. The same alarm is stored as severity 50 in IoTDB and 300 in Postgres, and reports
priority `DIAGNOSTIC` vs `LOW`. The PIPE-007 comment at `IoTDBPersistenceJob.java:187-190` states
these must agree.

### D3 — Priority on the SignalR payload vs the REST payload (BUG)
`AlarmEnricher.cs:62-69` re-derives priority from severity; `AlarmHub.cs:387` reads the
`b.Ignore`d `ActiveAlarm.Priority` and emits `"0"` for any DB-loaded alarm. The same alarm reports
`"CRITICAL"` over REST and `"0"` over the hub. `ConditionActive` (`:390`) and `ActiveTimeEpochMs`
(`:395`, `-62135596800000`) are wrong on the hub for the same reason.

### D4 — Shelved/suppressed flags: repository vs DTO vs client (BUG)
Persisted (`AmsDbContext.cs:87-91`), filterable at the repository (`AlarmRepositories.cs:87-90`),
then hardcoded to `false` in the API DTO (`AlarmEnricher.cs:89-91`) and correct again on the hub
(`AlarmHub.cs:392-393`). Meanwhile the console grid does not filter them out
(`AlarmConsole.tsx:128-135`) while client stats, the symbol index and the Designer table all do
(`alarmStore.ts:193,223`; `SymbolRenderer.tsx:194`) — so the KPI bar and the row count disagree by
the shelved + suppressed + OOS total.

### D5 — Severity → colour on the client: three different band sets
`AlarmConsole.tsx:411-414` uses 900/700/400; `MqttAlarmListItem.tsx:38-43` and
`IoTDBTrendViewer.tsx:34-39` use 800/600/400 (and disagree with each other on the 400 colour). None
matches the canonical 900/700/400/100 backend bands for the lower two tiers. The JS priority→colour
maps (`LiveEventStream.tsx:10-15` et al., `HIGH → caution`) are also one band off from the CSS badge
classes (`app.css:568-578`, `high → --alert-warning-*`, `medium → --alert-caution-*`).

### D6 — Priority histogram: DIAGNOSTIC band dropped in SQL
`AnalyticsController.cs:79-84` has no `>= 100` branch, so severity 1–99 is counted as `LOW`; every
other implementation calls it `DIAGNOSTIC`. The client compounds this by merging LOW and DIAGNOSTIC
again (`alarmStore.ts:199`).

### D7 — Shelve maximum: 480 min enforced vs 24 h advertised
`ActiveAlarm.cs:231` / `AlarmCommands.cs:187` / `AlarmsController.cs:487` / `ShelveDialog.tsx:74` all
enforce 480 minutes. `AlarmRulesConfig.tsx:9` shows `maxShelveDurationHours: 24`.

### D8 — Ack comment: "mandatory" vs auto-filled
`AlarmRulesConfig.tsx:10` `requireAckComment: true`; `AcknowledgeDialog.tsx:42`
`comment.trim() || 'Acknowledged by operator via console'`. No server-side requirement exists
(`AcknowledgeAlarmCommandValidator`, `AlarmCommands.cs:25-34`, only length-limits the comment).

### D9 — Flood rate threshold: three numbers for one KPI
Flink `> 10 / 10 min` (`AlarmKpiStreamJob.java:130`); backend `rate > 10`
(`AlarmHub.cs:338`, uncalled); dead SQL `> 10` (`alarm_operations.sql:440`); client
`Dashboard.tsx:66` warns above **1.0** while `Analytics.tsx:101` passes below **2.0** and the label on
the same line states the target is **≤ 1.0**.

### D10 — ACK SLA ownership
`AckSlaWatchdogService.cs:13` asserts "Flink lifecycle engine owns ACK SLA and timeouts", and is
disabled on that basis. No Flink job implements an ACK timeout (grep for `ACK_TIMEOUT` in
`src/flink/` returns only checkpoint timeouts). Nobody owns it.

### D11 — ACK eligibility: same rules, different evaluation order (BUG)
`PipelineOperators.java:173-174`, `NormalizedAlarmIngestor.cs:253-264`,
`OpcCookieHelper.cs:91-120`, `opcAckWriteable.ts:22-45`. The rule *set* matches, but the client
evaluates it in a different order. C# runs the gates first and consults the stored flag last
(`OpcCookieHelper.cs:96-106`: snapshot-feed → active → conditionName → `cookie <= 0` → **then**
`opcAckWriteable`). TypeScript short-circuits on the stored flag **second**
(`opcAckWriteable.ts:27-29`), before the snapshot-feed, cookie, active and conditionName gates at
`:31-36`. So an alarm carrying a stale `opcAckWriteable: true` that has since gone inactive or lost
its cookie is offered as ackable by the console and rejected by the server — a skip toast in the
batch path (`AlarmConsole.tsx:203-209`), or the generic 500 of §6.1 in the single path.
Second, smaller divergence: `opcAckWriteable.ts:13,17` also treat
`serverName === 'Current Alarms Feed'` as the HTTP feed; C# keys only off the `feed` / `ackPath`
attributes (`OpcCookieHelper.cs:8-15`).

---

## Unknown / requires verification

* Whether `alarms.alarm_current` in a **running** deployment actually has the columns from
  `36_alarm_shelving.sql` — the script is idempotent (`ADD COLUMN IF NOT EXISTS`) but
  `/docker-entrypoint-initdb.d` only runs on an **empty** data volume. An existing lab volume
  predating script 36 would silently lack `is_shelved` / `shelve_until` / `shelved_by` /
  `is_suppressed`, and every shelve would throw. Verify against a live database.
* Whether `alarm.events.raw` / `alarm.state.active` receive any producer in a deployment not visible
  in this repo (an external tool, a hand-run script). Every artefact here says no.
* Whether `SMTP_HOST` is populated in any real environment — the compose default is empty.
* Whether the EF `Priority` / `Category` filter and sort paths in
  `AlarmRepositories.cs:50,77-82` throw at runtime as the model implies, or whether some EF Core 8
  behaviour tolerates them. The static reading is unambiguous (`b.Ignore` removes the property from
  the model), but this deserves an actual `?priority=Critical` request against a live API.
* The exact behaviour of `new Guid(ReadOnlySpan<byte>)` vs `new Guid(byte[])` for the span overload
  used at `AlarmPartitionKeys.cs:58` — the divergence result above was reproduced against the
  documented little-endian layout, but a runtime check against Flink's output would close it
  definitively.
