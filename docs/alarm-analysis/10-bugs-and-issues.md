# Alarm Path — Bug, Security and Technical-Issue Review

**Scope:** the end-to-end alarm path only — `src/flink/**` alarm jobs, `src/backend/AMS.Api` +
`AMS.Application` / `AMS.Domain` / `AMS.Infrastructure` alarm code, and
`src/frontend-ob/src` alarm store / API / console.
**Method:** read-only code review. Every finding below was checked against the surrounding code
for an existing guard before being reported; where a guard partially mitigates the defect it is
stated inline. Findings marked **PLAUSIBLE** could not be fully proven by reading alone and need
a runtime check.

**Reviewed at commit:** `2886ccb` (branch `main`).

---

## Summary

Findings use two ID series: `BUG-nnn` (correctness/reliability) and `SEC-nnn`
(security, in its own section at the end). They are counted separately.

| Severity | BUG-\* | SEC-\* | Total |
|---|---|---|---|
| **Critical** | 6 | 0 | 6 |
| **High** | 19 | 4 | 23 |
| **Medium** | 17 | 4 | 21 |
| **Low / Informational** | 8 | 1 (refuted) | 9 |
| **Total** | **50** | **9** | **59** |

| Category (BUG-\* only) | Count |
|---|---|
| Lost / reverted acknowledgement | 6 |
| Lost or dropped alarm events | 5 |
| Data-consistency / projection integrity | 9 |
| Incorrect severity / priority mapping | 5 |
| Incorrect filtering (operator sees the wrong set) | 5 |
| Race conditions / ordering | 4 |
| Kafka handling (offsets, commit, retention) | 4 |
| Timestamps / timezone | 3 |
| Resource / memory growth | 5 |
| Other (contract drift, dead code, DoS surface) | 4 |

### Critical findings at a glance

| ID | Title | Location |
|---|---|---|
| BUG-001 | `ConditionActive` is not persisted → every projection update un-acknowledges the alarm | `AmsDbContext.cs:79`, `ActiveAlarm.cs:400`, `NormalizedAlarmIngestor.cs:151` |
| BUG-002 | External OPC acknowledgement is undone two lines after it is applied | `NormalizedAlarmIngestor.cs:120-144` |
| BUG-003 | Flood filter silently **deletes** every alarm with severity ≥ 950 | `PipelineOperators.java:371-382` |
| BUG-004 | Acknowledging an alarm makes it vanish from the operator console | `AlarmHub.cs:390`, `alarmStore.ts:288-295`, `opcAlarmFilter.ts:22-32` |
| BUG-005 | SignalR alarm events are broadcast **before** the DB commit and re-broadcast on every retry | `KafkaConsumerService.cs:307-310` |
| BUG-006 | Shelved / suppressed / out-of-service alarms disappear from every operator surface | `AlarmRepositories.cs:73`, `AlarmEnricher.cs:89-91` |

---

# CRITICAL

## BUG-001 — `ConditionActive` is unmapped, so every projection update treats an active alarm as a brand-new activation and wipes the acknowledgement

**Severity:** Critical · **Status:** CONFIRMED

**Files:**
- `src/backend/AMS.Infrastructure/Persistence/AmsDbContext.cs:79`
- `src/backend/AMS.Domain/Alarms/ActiveAlarm.cs:400-426`
- `src/backend/AMS.Infrastructure/Kafka/NormalizedAlarmIngestor.cs:145-162`

```csharp
// AmsDbContext.cs:79
b.Ignore(a => a.ConditionActive);
```

```csharp
// ActiveAlarm.cs:400-426
public void ApplyConditionChange(bool conditionActive, string? message, int severity, DateTimeOffset eventTime)
{
    var wasActive = ConditionActive;          // <-- ALWAYS false on an entity loaded from Postgres
    ConditionActive = conditionActive;
    ...
    else if (conditionActive && !wasActive)
    {
        // Condition re-activated
        Acknowledged = false;
        AckTime      = null;
        AckedBy      = null;
        ActiveTime   = eventTime;
        State        = AlarmState.UnacknowledgedUncleared;
        AddDomainEvent(new AlarmActivatedEvent(...));
    }
}
```

`ConditionActive` is `b.Ignore(...)`-ed, so EF never materialises it. Every `ActiveAlarm` read back
from `alarms.alarm_current` has `ConditionActive == false`. `NormalizedAlarmIngestor.cs:151` calls
`ApplyConditionChange(evt.ConditionActive /* true */, …)` on exactly such an entity, so
`wasActive` is `false` and `conditionActive` is `true` — the "condition re-activated" branch fires
on **every single upsert for an already-active alarm**.

**Failure scenario (deterministic):**
1. Alarm `FIC-101 / PVHIGH` is active and the operator acknowledges it. The ACK round-trip
   (`operator-actions → ack-writeback → DCS → ack-results → ACK_STATE_UPDATE`) sets
   `alarm_current.ack_status = true`.
2. The DCS now reports `acknowledged: true` for that tag, so `AlarmIngestionService` publishes a
   delta to `raw-alarms`; Flink emits an `ALARM_STATE_UPSERT` with `conditionActive=true,
   acknowledged=true`.
3. `NormalizedAlarmIngestor` loads the row (`ConditionActive` → `false`), takes the
   `else` branch at line 145, and calls `ApplyConditionChange(true, …)`.
4. `wasActive == false` → `Acknowledged = false; AckTime = null; AckedBy = null;
   State = UnacknowledgedUncleared`.

**Impact:** The operator's acknowledgement is destroyed by the very telemetry event that confirms
it. The alarm returns to unacknowledged/blinking, `ActiveTime` is reset (so "time in alarm"
restarts), and a spurious `AlarmActivatedEvent` is raised for every update. This defeats
ISA-18.2 acknowledgement semantics for the entire plant.

> Partial mitigation checked and rejected: a *batch* that contains two events for the same alarm
> will see the second one with `ConditionActive == true` (EF change tracking keeps the same
> instance inside one scope), but `FlushBatchAsync` creates a **new scope per batch**
> (`KafkaConsumerService.cs:302`) and flushes as soon as `Consume` returns `null`
> (line 213-217), so in practice each event is the first of its scope.

---

## BUG-002 — An external OPC acknowledgement is applied and then undone in the same code path

**Severity:** Critical · **Status:** CONFIRMED

**File:** `src/backend/AMS.Infrastructure/Kafka/NormalizedAlarmIngestor.cs:120-144`

```csharp
if (evt.Acknowledged && !alarm.Acknowledged)
{
    alarm.ReconcileAcknowledgement(eventTime, userId: null, comment: null);   // Acknowledged = true
    alarm.MergeOpcAttributes(...);
    alarm.OpcAttributes["ackSource"] = "External OPC Client";
    alarm.ApplyConditionChange(evt.ConditionActive, evt.Message, evt.Severity, eventTime); // <-- resets it
    ...
}
```

`ReconcileAcknowledgement` (`ActiveAlarm.cs:360`) does **not** touch `ConditionActive`, so it is
still the unmapped default `false` when `ApplyConditionChange(true, …)` runs on the next line.
That takes the re-activation branch and sets `Acknowledged = false; AckTime = null;
AckedBy = null`.

Additionally, `ReconcileAcknowledgement` itself sets
`State = ConditionActive ? AcknowledgedUncleared : AcknowledgedCleared` — with `ConditionActive`
always `false`, it picks `AcknowledgedCleared`, which `ConvertToDb` maps to the string
`"CLEARED"`. `ApplyActiveFilters` (`AlarmRepositories.cs:73`) only returns rows whose state
converts to `"ACTIVE"`, so even in the (non-existent) window before line 133 undoes it, the alarm
would have dropped off the active list.

> Note `ApplyAckLifecycle` (`ActiveAlarm.cs:331`) *was* patched for this exact problem
> (`(ConditionActive || State == AlarmState.UnacknowledgedUncleared)`), which confirms the
> unmapped-`ConditionActive` hazard is known — `ReconcileAcknowledgement` was simply missed.

**Failure scenario:** An engineering workstation or a second HMI acknowledges an active alarm
through the OPC A&E server. AMS ingests `acknowledged: true`, briefly marks the alarm
acknowledged, and immediately reverts it. AMS and the DCS permanently disagree about
acknowledgement state for every externally-acknowledged alarm.

**Impact:** Externally acknowledged alarms can never settle; nuisance re-annunciation; ISA-18.2
"acknowledge once" is violated.

---

## BUG-003 — The "flood detection" filter silently drops every alarm with severity ≥ 950

**Severity:** Critical · **Status:** CONFIRMED

**File:** `src/flink/src/main/java/com/ams/flink/PipelineOperators.java:360-383`

```java
public static class FloodDetectFilter extends RichFilterFunction<RawOpcAlarmEvent> {
    @Override
    public boolean filter(RawOpcAlarmEvent evt) {
        recordsIn.inc();
        if (evt == null) return false;
        if (Math.max(evt.severity, evt.rawSeverity) >= 950) {
            return false;            // <-- dropped, not routed anywhere
        }
        recordsOut.inc();
        return true;
    }
}
```

There is no rate/window state in this operator — it is a pure severity threshold, and everything
above it is discarded. `floodFiltered` is the sole upstream of the `lifecycle-events` sink, the
`current-alarm-state` projection sink and the root-cause/KPI branches
(`OpcEventStreamJob.java:107-151`), so a dropped record never reaches PostgreSQL, SignalR, the
historian projection, or the operator.

**Failure scenario:** An OPC A&E source publishes a severity-1000 event (the top of the OPC A&E
1.10 severity range, used for SIS/ESD-class conditions). `ValidationMap` sets
`evt.severity = 1000, evt.rawSeverity = 1000`; `FloodDetectFilter` returns `false`; the alarm never
appears in `alarm_current`, `lifecycle-events`, `live.alarms` or the console. There is no log line
and no DLQ record — only the operator metric `records_in > records_out`.

The HTTP-feed path reaches the same outcome differently: `ValidationMap:63-69` keeps the wire
severity in `rawSeverity`, so a feed record carrying `"severity": 1000` is dropped even though its
normalised severity would have been 900.

**Impact:** The single highest-urgency alarm class is invisible to the operator. This is a safety
defect, not a filtering preference.

---

## BUG-004 — Acknowledging an alarm removes it from the operator console

**Severity:** Critical · **Status:** CONFIRMED

**Files:**
- `src/backend/AMS.Api/Hubs/AlarmHub.cs:390` (`ConditionActive: a.ConditionActive`)
- `src/backend/AMS.Infrastructure/Kafka/NormalizedAlarmIngestor.cs:105-116`
- `src/frontend-ob/src/utils/opcAlarmFilter.ts:22-32`
- `src/frontend-ob/src/store/alarmStore.ts:288-295`

```ts
// alarmStore.ts:288-295
const incoming = mapHubAlarmPayload(d.raw, state.alarms.get(id));
if (!alarmMatchesConnectedOpcServer(incoming, state.connectedOpcServerIds)) {
  if (state.alarms.delete(id)) dirty = true;      // <-- alarm removed from the console
  continue;
}
if (d.kind === 'update' && !incoming.conditionActive) {
  if (state.alarms.delete(id)) dirty = true;      // <-- and again here
  continue;
}
```

```ts
// opcAlarmFilter.ts
export function isActiveOpcAlarm(alarm: ActiveAlarm): boolean { return alarm.conditionActive === true; }
export function alarmMatchesConnectedOpcServer(alarm, connectedServerIds) {
  if (!isDisplayableOpcAlarm(alarm)) return false;
  if (!isActiveOpcAlarm(alarm)) return false;    // <-- conditionActive === false ⇒ drop
  ...
}
```

The ACK projection branch in `NormalizedAlarmIngestor.cs:105-116` calls `ApplyAckLifecycle` and
then `PublishAlarmUpdatedAsync(alarm)` **without** calling `ApplyConditionChange`, so the entity's
unmapped `ConditionActive` is still `false` when `MapToPayload` reads it (`AlarmHub.cs:390`). The
hub therefore emits `conditionActive: false` for an alarm whose condition is still active, and the
store deletes it.

**Failure scenario:**
1. Operator clicks *Acknowledge* on active alarm `P-4711 / LOWFLOW`.
2. ACK completes; Flink emits `ACK_STATE_UPDATE`; the projection consumer applies the ack
   lifecycle and calls `PublishAlarmUpdatedAsync`.
3. The browser receives `OnAlarmUpdated { conditionActive: false, … }`.
4. `flushHubDeltas` deletes the alarm from the Zustand map; the row leaves the AG-Grid, the
   per-source symbol index loses it, and `recalcStatsFromAlarms` drops the count.
5. The alarm reappears only on the next full REST hydration (the 30 s poll or F5).

**Impact:** The act of acknowledging makes an active alarm disappear from the alarm list and from
HMI symbol state for up to 30 s. Operators lose track of live conditions immediately after acting
on them. The same path fires for shelve/unshelve (`ShelveAlarmCommandHandler` publishes an update
built from a DB-loaded entity).

---

## BUG-005 — SignalR alarm events are published before the database commit, and re-published on every retry

**Severity:** Critical · **Status:** CONFIRMED

**File:** `src/backend/AMS.Infrastructure/Kafka/KafkaConsumerService.cs:298-338`

```csharp
for (var attempt = 1; attempt <= MaxFlushAttempts; attempt++)
{
    try
    {
        using var scope = _sp.CreateScope();
        ...
        foreach (var evt in _batch)
            await NormalizedAlarmIngestor.ProcessAsync(evt, uow, publisher, ct);   // publishes SignalR inline
        await uow.SaveChangesAsync(ct);                                            // commit happens AFTER
        ...
    }
    catch (Exception ex) when (attempt < MaxFlushAttempts && ...)
    { ... await Task.Delay(delay, ct); }        // whole batch is re-processed → SignalR replayed
```

`NormalizedAlarmIngestor.ProcessAsync` calls `publisher.PublishNewAlarmAsync`,
`PublishAlarmUpdatedAsync` and `PublishAlarmClearedAsync` *inside* the loop; the transaction is
committed only afterwards, and a failure re-runs the entire batch from the top.

**Failure scenario:** A batch of 100 events includes 20 `ALARM_STATE_DELETE`s. All 100 SignalR
messages go out, removing 20 alarms from every console. `SaveChangesAsync` then fails (deadlock,
`uq_alarm_current_identity` violation, connection reset). Three retries each re-broadcast the same
100 messages. After the fourth failure the batch is routed to the DLQ and the offsets advance.
Postgres still holds all 20 rows as active; every operator console has removed them and will not
learn otherwise until a full re-hydration.

**Impact:** UI and system-of-record diverge silently; alarms can be removed from every console
without ever having been cleared; duplicated new-alarm broadcasts on every retry.

---

## BUG-006 — Shelved, suppressed and out-of-service alarms are invisible on every operator surface

**Severity:** Critical · **Status:** CONFIRMED

**Files:**
- `src/backend/AMS.Infrastructure/Repositories/AlarmRepositories.cs:70-93`
- `src/backend/AMS.Api/Services/AlarmEnricher.cs:89-91`
- `src/backend/AMS.Domain/Alarms/ActiveAlarm.cs:231-294`

```csharp
// AlarmRepositories.cs:73 — base predicate of the ONLY active-alarm query
q = q.Where(a => a.State == AlarmState.UnacknowledgedUncleared || a.State == AlarmState.AcknowledgedUncleared);
...
if (query.IsShelved.HasValue)  q = q.Where(a => a.IsShelved == query.IsShelved.Value);
```

```csharp
// AlarmEnricher.cs:89-91 — the DTO the API returns
IsShelved:          false,
IsSuppressed:       false,
IsOutOfService:     false,
```

`Shelve()` / `Suppress()` / `SetOutOfService()` set `State` to `Shelved` / `SuppressedByDesign` /
`OutOfService`, which `ConvertToDb` writes as `'SHELVED'` / `'SUPPRESSED'` / `'OUT_OF_SERVICE'`.
The base predicate excludes all three, so:
- `GET /api/v1/alarms/active` never returns a shelved alarm;
- `GET /api/v1/alarms/active?isShelved=true` is unsatisfiable — the two predicates are mutually
  exclusive, so it **always** returns an empty list;
- even if a row did come back, `AlarmEnricher` hard-codes `IsShelved: false`, so the console's
  `alarm-row-shelved` styling (`AlarmConsole.tsx:501`) and the `shelved` KPI can never light up.

**Failure scenario:** An operator shelves a chattering alarm for 30 minutes. It disappears from the
console completely with no shelved indicator, no shelved list, and a `shelved` KPI stuck at 0
(`AlarmEnricher.cs:49` also hard-codes `Shelved: 0`). Thirty minutes later
`alarms.expire_shelved_alarms()` un-shelves it and it silently returns. There is no way for the
operator or a supervisor to enumerate what is currently shelved.

**Impact:** ISA-18.2 §11 requires a visible, reviewable shelved-alarm list. Shelving here is
functionally an *undocumented mute*. `ShelveComment` and `SuppressionReason` are validated as
mandatory (`AlarmCommands.cs`) and then discarded (`AmsDbContext.cs:92,95`), so the mandated
justification is not recorded either.

---

# HIGH

## BUG-007 — The entire ACK lifecycle is held in an unmapped dictionary and never persisted

**Severity:** High · **Status:** CONFIRMED

**Files:** `AmsDbContext.cs:102`, `ActiveAlarm.cs:297-343`, `ActiveAlarm.cs:375-397`,
`LifecycleEventConsumerService.cs:200-213`

```csharp
b.Ignore(a => a.CustomAttributes);   // AmsDbContext.cs:102
```

`ApplyAckLifecycle` writes `ackLifecycleState`, `pendingAckCommandId`, `ackCorrelationId`,
`ackLifecycleId`, `dcsSequenceId`, `ackRequestedAtEpochMs` and `ackLifecycleDetail` into
`CustomAttributes` — a property EF is told to ignore. `LifecycleEventConsumerService` then calls
`UpdateAsync` + `SaveChangesAsync` on that entity, which writes nothing for any of those fields.

Two consequences:

1. **The ack-pending indicator never resolves after a restart.** The `ACK_REQUESTED → … →
   ACK_CONFIRMED` transition log exists only in process memory, so after an `ams-api` restart the
   REST DTO reports `ackLifecycleState: null` for every alarm.
2. **It defeats the guard in `ClearOpcInferredAcknowledgement`:**

```csharp
public void ClearOpcInferredAcknowledgement()
{
    if (!Acknowledged) return;
    if (CustomAttributes.ContainsKey("ackCorrelationId")) return;   // <-- always false: never loaded
    var lifecycle = GetAckLifecycleState();                          // <-- always null
    if (lifecycle is "ACK_REQUESTED" or ... ) return;
    Acknowledged = false; AckTime = null; AckedBy = null; ...
}
```

The guard is designed to stop an OPC event with `acknowledged:false` from wiping an
operator-confirmed ACK. Because `CustomAttributes` is never rehydrated, every freshly-loaded
entity fails both checks and the ACK is wiped.

**Failure scenario:** Operator acks `TIC-220 / HIHI`; `ack_status` becomes true. Within the same
2 s poll window the feed emits an unrelated field change while still reporting
`acknowledged: false` (the DCS has not refreshed yet). The projection consumer takes
`NormalizedAlarmIngestor.cs:148`, calls `ClearOpcInferredAcknowledgement()`, both guards no-op, and
the acknowledgement is reverted.

---

## BUG-008 — `AckTime`, `AckedBy` and `AckComment` are not persisted; the API fabricates the ack timestamp

**Severity:** High · **Status:** CONFIRMED

**Files:** `AmsDbContext.cs:81-83`, `AlarmEnricher.cs:95-97`, `AlarmHub.cs:397`

```csharp
b.Ignore(a => a.AckTime);
b.Ignore(a => a.AckedBy);
b.Ignore(a => a.AckComment);
```

```csharp
// AlarmEnricher.cs:95-97
AckTime:            a.Acknowledged ? DateTimeOffset.UtcNow : null,   // fabricated on every request
AckedByUsername:    null,
AckComment:         null,
```

`ApplyAckLifecycle` never sets `AckedBy` at all, and the fields it does set are unmapped. The API
therefore invents `AckTime = now` on every read, so an alarm acknowledged three hours ago always
displays as "acknowledged just now". `AlarmHub.cs:397` hard-codes `AckedByUsername: null`.

**Failure scenario:** A supervisor reviews an incident: `GET /api/v1/alarms/active` shows the
critical alarm as acknowledged, with `ackTime` equal to the moment of the request and no
acknowledging user. Two consecutive polls report two different ack times for the same untouched
alarm. There is no record anywhere in `alarm_current` of who acknowledged what or when.

**Impact:** ISA-18.2 / EEMUA-191 operator-action traceability is not merely missing — the value
returned is a fabricated timestamp presented as fact. It also causes needless UI churn:
`alarmsEqual` (`alarmReconciliation.ts:83`) compares `ackTimeEpochMs`, so every acknowledged alarm
is treated as changed on every 30 s poll.

---

## BUG-009 — `Priority` and `Category` are unmapped: SignalR sends priority `"0"`, and filtering/sorting by priority throws

**Severity:** High · **Status:** CONFIRMED (payload) / PLAUSIBLE (query translation — needs a runtime check)

**Files:** `AmsDbContext.cs:75-76`, `AlarmHub.cs:387`, `AlarmRepositories.cs:77-82`, `:44-54`

```csharp
b.Ignore(a => a.Priority);
b.Ignore(a => a.Category);
```

`AlarmPriority` has no member with value `0` (`Critical = 1 … Diagnostic = 5`), so an entity
loaded from Postgres has `Priority == (AlarmPriority)0` and
`a.Priority.ToString().ToUpper()` (`AlarmHub.cs:387`) yields the literal string `"0"`.

**Failure scenario A (CONFIRMED):** A CRITICAL alarm is created — `PublishNewAlarmAsync` sends the
correct `priority: "CRITICAL"` because the entity was built in memory. The next update for the same
alarm loads it from the DB and `PublishAlarmUpdatedAsync` sends `priority: "0"`.
`mapHubAlarmPayload` (`alarmMappers.ts:158`) picks `priority` (no `priorityLabel` on the hub
payload) and stores `"0"`. Downstream:
`getRowClass` (`AlarmConsole.tsx:488`) emits `alarm-row-0` — no CSS rule, so the row loses its
critical colouring; `PRIORITY_RANK["0"]` is undefined so the console sort falls back to `9`;
`recalcStatsFromAlarms` (`alarmStore.ts`) counts it in none of the priority buckets, so the
CRITICAL KPI tile drops it; `PublishNewAlarmAsync` also targets the group `alarms-0`.

**Failure scenario B (PLAUSIBLE):** `ApplyActiveFilters` builds
`q.Where(a => a.Priority == query.Priority.Value)` and `q.OrderBy(a => a.Priority)` over an
*ignored* property. EF Core cannot translate access to an unmapped member and throws
`InvalidOperationException: The LINQ expression … could not be translated`. If so,
`GET /api/v1/alarms/active?priority=CRITICAL` (the drill-in the dashboard KPI card issues —
`AlarmConsole.tsx:91`) and `?sortBy=Priority` return HTTP 500. Needs a runtime check to confirm
EF's exact behaviour for `Ignore`d members in this configuration.

---

## BUG-010 — The Flink ACK projection hard-codes `severity: 100`, `priority: LOW`, `category: PROCESS`

**Severity:** High · **Status:** CONFIRMED

**File:** `src/flink/src/main/java/com/ams/flink/OpcEventStreamJob.java:278-314`

```java
private static String toAckConfirmedState(String json) {
    ...
    out.put("eventType", "ACK_STATE_UPDATE");
    out.put("alarmId", AlarmJson.text(node, "AlarmId", "alarmId"));
    ...
    out.put("severity", 100);        // <-- invented
    out.put("priority", "LOW");      // <-- invented
    out.put("category", "PROCESS");  // <-- invented
    // Do NOT hardcode conditionActive=true — let the consumer preserve existing state.
    out.put("acknowledged", true);
```

The record is written to the compacted `current-alarm-state` topic keyed by `alarmId`
(`OpcEventStreamJob.java:185`). Two consumers read it and neither ignores the invented fields:

1. **`LiveStateJob`** (`LiveStateJob.java:142-156`) builds its RBE fingerprint from
   `state|severity|ack|active|priority`, sees severity fall from 900 → 100 and priority become `""`,
   decides that is a change, and publishes to `live.alarms` an envelope claiming the alarm is now
   `severity: 100, priority: ""`. Every MQTT/HMI-symbol consumer of `live.alarms` now shows the
   just-acknowledged critical alarm as a low-severity one.
2. **`BuildHistoryRecords`** (`KafkaConsumerService.cs:441-456`) — see BUG-011.

`NormalizedAlarmIngestor` *is* guarded (`isAckStateUpdate` routes to `ApplyAckLifecycle` only), so
`alarm_current` is unaffected; the corruption is confined to the live/MQTT path and to
`alarm_history`.

---

## BUG-011 — Every operator acknowledgement writes a `CLEARED` row into `alarm_history`

**Severity:** High · **Status:** CONFIRMED

**File:** `src/backend/AMS.Infrastructure/Kafka/KafkaConsumerService.cs:432-459`

```csharp
foreach (var evt in batch)
{
    if (string.Equals(evt.EventType, "ALARM_STATE_DELETE", ...)) continue;   // only DELETE is skipped
    var eventTime = DateTimeOffset.FromUnixTimeMilliseconds(evt.EventTimeEpochMs);
    var state = !evt.ConditionActive ? "CLEARED"
              : evt.Acknowledged     ? "ACKNOWLEDGED" : "ACTIVE";
    rows.Add(new AlarmHistoryRecord(..., Severity: evt.Severity, State: state,
        ClearedTime: evt.ConditionActive ? null : eventTime));
}
```

`ACK_STATE_UPDATE` is not skipped. Its JSON deliberately omits `conditionActive`
(`OpcEventStreamJob.java:298`), so `NormalizedAlarmEvent.ConditionActive` deserialises to its
default `false`, and the history writer classifies the ACK as **`CLEARED`** with a non-null
`cleared_time` and the invented `severity: 100` from BUG-010.

**Failure scenario:** A severity-900 alarm is acknowledged at 09:00 and clears at 11:00.
`alarms.alarm_history` records a `CLEARED` row with `severity=100, cleared_time=09:00` and then the
real clear at 11:00. `AnalyticsController.GetKpi` (`AnalyticsController.cs:48-52`) computes
`fleetingCount` as `cleared_time - event_time < 60 s` and the priority histogram from `severity`;
both are now wrong. Any MTTA/MTTR or ISA-18.2 alarm-performance report built from this table
attributes a 09:00 clear to an alarm that was still active.

---

## BUG-012 — Lifecycle consumer auto-commits offsets and writes non-ACK states into the ACK lifecycle field

**Severity:** High · **Status:** CONFIRMED

**File:** `src/backend/AMS.Infrastructure/Kafka/LifecycleEventConsumerService.cs:160-214`

```csharp
var config = new ConsumerConfig
{
    ...
    AutoOffsetReset  = AutoOffsetReset.Latest,
    EnableAutoCommit = true,          // <-- offsets advance on a timer, not on success
};
...
catch (Exception ex)
{
    _logger.LogError(ex, "Unexpected error in LifecycleEventConsumerService");
    await Task.Delay(1000, stoppingToken);      // message is gone; offset already committed
}
```

**Two defects:**

**(a) Lost ACK lifecycle transitions.** With `EnableAutoCommit = true` the offset advances
independently of whether `SaveChangesAsync` succeeded. A transient Postgres failure while applying
`ACK_CONFIRMED` logs one line, sleeps 1 s, and moves on — the transition is never retried. The
alarm is left showing `ACK_DISPATCHED` forever (and `AckLifecycleStates.IsPending` reports it as
still pending). `AutoOffsetReset.Latest` compounds it: a brand-new consumer group skips every
lifecycle event produced before it first joined.

**(b) Non-ACK states pollute the ACK lifecycle field.** `lifecycle-events` carries two schemas:
Flink's `toLifecycleJson` (`PipelineOperators.java:400-411`) emits
`lifecycleState = "ACTIVE" | "CLEARED"`, while `toAckLifecycleEvent` emits `ACK_*`. The consumer
does not discriminate:

```csharp
var terminal        = incoming is Confirmed or Failed or Timeout;
var alreadyTerminal = currentLifecycle is Confirmed or Failed or Timeout;
if (!alreadyTerminal || terminal)
    alarm.ApplyAckLifecycle(incoming, ...);   // incoming may be "ACTIVE"
```

An alarm sitting at `ACK_DISPATCHED` (non-terminal) that receives an `ACTIVE` lifecycle event has
its `ackLifecycleState` overwritten with `"ACTIVE"`. It is not in `TERMINAL_ACK`, so the frontend's
`shouldApplyAckLifecycle` and the backend's `IsPending` both keep treating it as an unresolved ACK,
and the console's `alarm-ack-pending` styling (`AlarmConsole.tsx:490`) never clears. It also
broadcasts `OnAckLifecycleUpdated { lifecycleState: "ACTIVE" }` to every client for every alarm
activation.

> Mitigation checked: an already-`ACK_CONFIRMED` alarm *is* protected by `alreadyTerminal`.
> Alarms mid-ACK are not.

---

## BUG-013 — Offsets are committed one message short, so the last event of every batch is reprocessed

**Severity:** High · **Status:** CONFIRMED

**File:** `src/backend/AMS.Infrastructure/Kafka/KafkaConsumerService.cs:246-247, 333`

```csharp
_batch.Add(evt);
_offsets[cr.TopicPartition] = cr.TopicPartitionOffset;   // offset N, not N+1
...
consumer.Commit(_offsets.Values);
```

`IConsumer.Commit(IEnumerable<TopicPartitionOffset>)` commits the given offset as *the next offset
to be consumed*. Committing `N` therefore means "resume at `N`" and message `N` is delivered again.
The DLQ path in the same file gets this right (`cr.Offset + 1`, line 233), which makes the batch
path an off-by-one.

**Failure scenario:** `ams-api` is restarted (or the group rebalances). The last message of the most
recently committed batch is redelivered. `NormalizedAlarmIngestor` upserts are idempotent for
`alarm_current`, but `AppendHistoryAsync` (`AlarmRepositories.cs:245-259`) is a plain `INSERT` with
no unique key on `alarms.alarm_history`, so a duplicate history row is written on **every** restart
and **every** rebalance. The same event is also re-broadcast over SignalR.

**Impact:** `alarm_history` accumulates duplicates that inflate `chatteringCount`,
`totalAlarms24h`, `badActors` and `top10ContributionPercent` in `AnalyticsController.GetKpi`. In a
crash-loop the duplication is unbounded.

---

## BUG-014 — `GET /api/v1/alarms/historical` silently ignores `serverId`, `priority` and `category`, and stamps every row with the HTTP-feed server id

**Severity:** High · **Status:** CONFIRMED

**File:** `src/backend/AMS.Infrastructure/Repositories/AlarmRepositories.cs:165-229`

```csharp
var conditions = new List<string> { "event_time BETWEEN @From AND @To" };
...
if (query.State.HasValue)              { conditions.Add("state = @State"); ... }
if (!string.IsNullOrWhiteSpace(query.SourceNameContains)) { ... }
if (query.IsAcknowledged.HasValue)     { ... }
// query.ServerId / query.Priority / query.Category are never referenced

var sql = $@"
    SELECT id, 'f0af9a6d-85f6-4c9f-a8ad-6de277d1d110'::UUID as server_id, ...
    FROM alarms.alarm_history WHERE {where} ...";
```

The controller advertises all three filters, the query object carries them, and the repository drops
them. Worse, the projection hard-codes the HTTP-feed server UUID as `server_id` for every row.

**Failure scenario:** During an incident review the engineer queries
`?from=…&to=…&serverId=<Kiln OPC server>&priority=Critical`. The response contains alarms from
**every** server at **every** priority, each labelled as belonging to the Current-Alarms-Feed
server. The reviewer has no way to tell that the filter was ignored — this is exactly the class of
bug the `DATA-10` comment (`AlarmRepositories.cs:33-38`) says was fixed for active alarms, left
unfixed for history. `StreamAsync` (line 264-279) and `CountAsync` (line 231-239) ignore the same
filters.

---

## BUG-015 — Every alarm DTO reports the wrong server, hard-codes quality "Good" and category "Process"

**Severity:** High · **Status:** CONFIRMED

**File:** `src/backend/AMS.Api/Services/AlarmEnricher.cs:55-110`

```csharp
var serverId = Guid.TryParse(_ingest.ServerId, out var sid) ? sid : AlarmIngestionOptions.DefaultHttpFeedServerId;
...
return new ActiveAlarmDto(
    ServerId:           serverId,             // NOT a.ServerId
    Category:           AlarmCategory.Process,// hard-coded
    QualityGood:        true,                 // hard-coded
    ActiveTime:         a.EventTime,          // wrong field
    ServerReceivedAt:   DateTimeOffset.UtcNow,// fabricated
    TimeInAlarm:        DateTimeOffset.UtcNow - a.EventTime,
    LogicalAlarmFamilyId: $"{serverId}|{a.SourceName}|{a.ConditionName}|{a.SubConditionName}", ...
```

- **`ServerId`** is taken from configuration, not from the alarm. In a multi-server deployment every
  alarm claims to come from the HTTP feed. `alarmMatchesConnectedOpcServer`
  (`opcAlarmFilter.ts:26-34`) filters by exactly this field, so the console's per-server scoping is
  meaningless, and the `?serverId=` REST filter (which *is* honoured by
  `ApplyActiveFilters`) returns rows that then all render under a different server.
- **`QualityGood: true`** violates the project's own NAMUR NE107 / ISA-18.2 quality rule
  (CLAUDE.md, "Quality on reopen"). `Quality` is also unmapped (`AmsDbContext.cs:77`), so there is
  no value to report even if the hard-code were removed. A BAD-quality alarm is shown as Good.
- **`Category`** is always `Process`, so a `SAFETY`-category alarm is presented as a process alarm
  and the `?category=` filter is decorative.
- **`ActiveTime = a.EventTime`** and **`TimeInAlarm = now - EventTime`**: `EventTime` is rewritten
  by `ApplyConditionChange` on every update, so "time in alarm" resets to zero every time the alarm
  updates rather than counting from activation.
- **`LogicalAlarmFamilyId`** is built from the wrong server id and without the `Normalize()` trim
  that `AlarmPartitionKeys.LogicalAlarmFamilyId` applies (`AlarmPartitionKeys.cs:106-111`), so the
  REST DTO and the SignalR payload disagree on the same alarm's family id.

---

## BUG-016 — Alarm statistics ignore the server filter, hard-code the ISA-18.2 KPIs to zero, and load every active row into memory

**Severity:** High · **Status:** CONFIRMED

**File:** `src/backend/AMS.Api/Services/AlarmEnricher.cs:35-53`

```csharp
public async Task<AlarmStatsSummary> GetStatsSummaryAsync(Guid? serverId, CancellationToken ct = default)
{
    var q = _ctx.ActiveAlarms.AsNoTracking()
        .Where(a => a.State == ... || a.State == ...);       // serverId is never used
    var rows = await q.Select(a => new { a.Severity, a.Acknowledged }).ToListAsync(ct);  // no LIMIT
    return new AlarmStatsSummary(
        ...,
        Shelved:          0,
        Suppressed:       0,
        AlarmsPerTenMin:  0,
        FloodActive:      false);
}
```

**Failure scenarios:**
- `GET /api/v1/alarms/active/statistics?serverId=X` returns plant-wide counts. The response is
  additionally cached under the key `stats:{serverId}` (`AlarmsController.cs:102`), so the per-server
  and global entries hold identical values.
- `alarmsPerTenMin` and `floodActive` are hard-wired to `0` / `false`. The console's
  `FloodAlertBanner` and the EEMUA-191 alarm-rate KPI therefore never fire from this endpoint. The
  only other source is `OnFloodAlert` / `OnAnalyticsUpdate`, and no code path in the reviewed
  backend calls `PublishFloodAlertAsync` or `OnAnalyticsUpdate` — **so alarm-flood annunciation in
  the UI is dead.** (PLAUSIBLE for the "no caller" half — verified by grep over the reviewed
  assemblies only.)
- The query materialises one object per active alarm on **every** call, and
  `GetActiveAlarmsQueryHandler.Handle` (`AlarmQueries.cs:129`) calls it on every alarm-list request.
  In a flood with 50 000 standing alarms and N consoles polling, each poll allocates 50 000 rows.

---

## BUG-017 — `AlarmIngestionService` keeps its delta state in memory, so clears that happen while the API is down are lost forever

**Severity:** High · **Status:** CONFIRMED

**File:** `src/backend/AMS.Api/BackgroundServices/AlarmIngestionService.cs:50, 104-140`

```csharp
private readonly ConcurrentDictionary<string, AlarmSnapshot> _lastSnapshot = new(StringComparer.OrdinalIgnoreCase);
...
foreach (var kv in _lastSnapshot)                 // synthesise CLEARED for alarms that left the feed
{
    if (currentIds.Contains(kv.Key)) continue;
    if (kv.Value.State == "CLEARED") continue;
    var cleared = kv.Value with { State = "CLEARED", Timestamp = DateTimeOffset.UtcNow.ToString("o") };
    await PublishEventAsync(cleared, rawRecord: null, ct);
```

The synthetic CLEARED event is the **only** way an alarm that disappears from the HTTP feed is ever
cleared, and it depends entirely on the in-process `_lastSnapshot` dictionary.

**Failure scenario:** Alarm `FIC-101 / PVHIGH` is active. `ams-api` restarts (deploy, OOM, node
drain). While it is down the process condition returns to normal and the alarm leaves the feed.
On startup `_lastSnapshot` is empty, so the alarm is in neither `currentIds` nor `_lastSnapshot`;
the disappearance loop never runs for it; no `CLEARED` is ever published. `alarm_current` keeps the
row as active indefinitely and the console shows a ghost alarm that no operator action can remove.

Two related defects in the same dictionary:
- It is **never pruned**. Entries persist after `CLEARED` (the loop only skips re-publishing), so
  the map grows monotonically with total distinct alarms observed for the lifetime of the process —
  an unbounded memory leak on a high-cardinality plant.
- `Math.Clamp(_opts.PollIntervalMs, 1000, 5000)` (line 100) silently overrides the configured poll
  interval; `AlarmIngestion__PollIntervalMs: 30000` polls every 5 s.

---

## BUG-018 — A feed record without a severity string is promoted to CRITICAL

**Severity:** High · **Status:** CONFIRMED

**File:** `src/backend/AMS.Api/BackgroundServices/AlarmIngestionService.cs:176-220`

```csharp
var priority = !string.IsNullOrWhiteSpace(record.Severity)
    ? MapSeverityString(record.Severity)
    : MapNumericPriority(record.Priority);          // Priority is a non-nullable int → 0 when absent
...
private static string MapNumericPriority(int priority) => priority switch
{
    <= 1 => "CRITICAL",                              // 0 lands here
    ...
};
```

`HttpFeedAlarmRecord.Priority` is `int` (line 303), not `int?`. A feed payload that carries neither
`severity` nor `priority` deserialises to `0`, which `MapNumericPriority` maps to `CRITICAL`.

**Failure scenario:** The DCS feed emits records with only `tag_name`, `description`, `state` and
`source_timestamp` (a legitimate minimal shape — every other field on the record is nullable).
Every one of those alarms enters the pipeline as `priority: "CRITICAL"`, becomes severity 900 in
`ValidationMap`, and floods the operator's critical band and the CRITICAL KPI tile.

---

## BUG-019 — `ActiveTime` and `ServerReceivedAt` are unmapped, so SignalR sends epoch −62135596800000 (year 0001)

**Severity:** High · **Status:** CONFIRMED

**Files:** `AmsDbContext.cs:80, 84`, `AlarmHub.cs:395, 403`

```csharp
b.Ignore(a => a.ActiveTime);
b.Ignore(a => a.ServerReceivedAt);
...
ActiveTimeEpochMs:     a.ActiveTime.ToUnixTimeMilliseconds(),          // DateTimeOffset.MinValue
ServerReceivedEpochMs: a.ServerReceivedAt.ToUnixTimeMilliseconds(),    // DateTimeOffset.MinValue
```

`default(DateTimeOffset).ToUnixTimeMilliseconds()` is `-62135596800000`.

**Failure scenario:** Any `OnAlarmUpdated` for a DB-loaded alarm carries
`activeTimeEpochMs: -62135596800000`. `mapHubAlarmPayload` (`alarmMappers.ts:250`) copies it
verbatim; `alarmIdentity.ts:TIME_AUTHORITY.DURATION` declares `activeTime` the authority for
durations, so any duration widget renders ≈ 2025 years. `serverReceivedEpochMs` feeds the ingest
latency/audit display with the same value.

---

## BUG-020 — No concurrency token: an operator shelve/unshelve overwrites concurrent projection writes with a stale full row

**Severity:** High · **Status:** CONFIRMED

**Files:** `AmsDbContext.cs:27-107` (no `IsConcurrencyToken` / `RowVersion` / `xmin`),
`AlarmRepositories.cs:26-30, 101-105`, `AlarmCommands.cs` (Shelve/Unshelve/Suppress handlers)

```csharp
public async Task<ActiveAlarm?> GetByIdAsync(Guid id, ...)
    => await _ctx.ActiveAlarms.AsSplitQuery().AsNoTracking().FirstOrDefaultAsync(a => a.Id == id, ct);

public Task UpdateAsync(ActiveAlarm alarm, ...) { _ctx.ActiveAlarms.Update(alarm); return Task.CompletedTask; }
```

`GetByIdAsync` is `AsNoTracking`, and `DbSet.Update` on a detached entity marks **every mapped
property** as modified. The generated `UPDATE` therefore rewrites `severity`, `message`,
`event_time`, `ack_status`, `state` and `opc_attributes` from the snapshot the request read, with no
`WHERE` guard on a version column.

**Failure scenario:**
1. `t0` — operator opens the shelve dialog; `ShelveAlarmCommandHandler` reads the alarm
   (`severity=400`, `ack_status=false`).
2. `t0+40 ms` — the projection consumer commits an escalation for the same alarm
   (`severity=900`, `state=ACTIVE`) plus an operator ACK (`ack_status=true`).
3. `t0+60 ms` — `SaveChangesAsync` for the shelve writes the whole stale row back:
   `severity` reverts to 400 and `ack_status` reverts to false.

**Impact:** Silent lost updates on the safety-critical row. Severity escalations and
acknowledgements can be reverted by any concurrent operator action on the same alarm.

---

## BUG-021 — Un-keyed, monotonically drifting "standing alarm" KPI, and a global-key hot partition

**Severity:** High · **Status:** CONFIRMED

**File:** `src/flink/src/main/java/com/ams/flink/AlarmKpiStreamJob.java:346-379`

```java
.keyBy(json -> "GLOBAL")
...
if ("ACTIVE".equalsIgnoreCase(state))      current++;
else if ("CLEARED".equalsIgnoreCase(state)) current = Math.max(0, current - 1);
```

The counter increments per *lifecycle event*, not per *distinct alarm*. `toLifecycleJson`
(`PipelineOperators.java:400`) emits `lifecycleState = "ACTIVE"` for **every** event of an active
alarm — severity updates, message changes, external ack changes — not only on the
inactive→active transition.

**Failure scenario:** A chattering analogue tag emits 60 `ACTIVE` lifecycle events in 10 minutes for
one alarm. `standingCount` climbs by 60. The single `CLEARED` at the end decrements it by 1. After a
shift the "standing alarms" KPI reported to the operator via `kpi-standing-snapshots` →
`KpiConsumerService` → `OnAlarmKpiUpdate` bears no relation to the number of standing alarms and
only ever grows. `oldestStandingDurationMs` is hard-coded to `0` (line 375).

Secondary: `keyBy(json -> "GLOBAL")` routes the entire lifecycle stream to a single sub-task
regardless of the configured parallelism.

---

## BUG-022 — A single malformed record permanently crash-loops the alarm KPI job

**Severity:** High · **Status:** CONFIRMED

**File:** `src/flink/src/main/java/com/ams/flink/AlarmKpiStreamJob.java:355-360`

```java
public void processElement(String json, Context ctx, Collector<AlarmKpiResult> out) throws Exception {
    ...
    JsonNode node = MAPPER.readTree(json);            // throws on non-JSON
    String state = node.get("lifecycleState").asText("");   // NPE when the field is absent
```

Neither call is guarded, unlike the sibling filter at line 278-283 which wraps the same parse in a
`try/catch`. An exception propagates out of `processElement`, fails the task, and the job restarts
from the last checkpoint — which replays the same offset and the same poison record.

**Failure scenario:** Any producer writes a record to `lifecycle-events` without `lifecycleState`
(for example a manual `kafka-console-producer` probe, or a future producer using a different
schema). `AlarmKpiStreamJob` enters an unbounded restart loop; the alarm-rate and standing-alarm
KPIs stop updating and the job's checkpoint state (the sliding 10-minute window) is repeatedly
discarded. There is no DLQ and no side-output.

---

## BUG-023 — `LiveStateJob` starts at `latest`, so every fresh submit loses the live-state gap

**Severity:** High · **Status:** CONFIRMED

**File:** `src/flink/src/main/java/com/ams/flink/LiveStateJob.java:53-61`

```java
KafkaSource<String> source = KafkaSource.<String>builder()
        .setTopics("current-alarm-state")
        .setGroupId("flink-ams-live-state")
        .setStartingOffsets(OffsetsInitializer.latest())   // <-- ignores the group's committed offsets
```

`OpcEventStreamJob` and `IoTDBPersistenceJob` were both deliberately changed to
`committedOffsets(EARLIEST)` (see the comments at `OpcEventStreamJob.java:38-50, 198-202`);
`LiveStateJob` was not.

**Failure scenario:** The JobManager is restarted or the job is resubmitted without a savepoint
(the normal path for a JAR redeploy). `latest()` overrides the committed offsets, so every
`current-alarm-state` record produced while the job was down is skipped. Because the job's whole
purpose is report-by-exception, the *skipped* records are precisely the state changes: `live.alarms`
and every MQTT/HMI-symbol consumer keep showing the pre-outage state until the next change for that
alarm — which for a steady standing alarm may be never.

Related: the per-alarm `ValueState` fingerprints in `RbeAlarmStateMap` / `RbeMetricsMap` have no
state TTL, so keyed state grows with total distinct alarm ids for the lifetime of the job.

---

## BUG-024 — A failed ACK writeback is terminal: no retry, no dead-letter, no operator feedback loop

**Severity:** High · **Status:** CONFIRMED

**File:** `src/backend/AMS.Api/BackgroundServices/HttpAckWritebackService.cs:123-183`

```csharp
catch (Exception ex)
{
    resultState  = AckLifecycleStates.Failed;
    errorMessage = $"HTTP Exception: {ex.Message}";
    _logger.LogError(ex, "HTTP ACK Writeback exception for FeedCorrelation={FeedCorrelation}", feedCorrelationId);
}
// ... publishes ACK_FAILED and commits the offset
```

A `Failed` result is published to `ack-results` and the offset is committed. `AckWritebackDlqTopic`
is declared in `KafkaOptions` (`KafkaConsumerService.cs:32`) and never used. There is no retry
policy, no backoff schedule, and no re-queue.

**Failure scenario:** The DCS ACK endpoint returns HTTP 503 for 30 s during a failover. Every
acknowledgement issued in that window is marked `ACK_FAILED`. `LifecycleEventConsumerService`
records the terminal state, `ClearOpcInferredAcknowledgement` may then revert `ack_status`, and the
alarm silently returns to unacknowledged. The operator's only signal is the `alarm-ack-failed` row
class — there is no toast, no retry, and no record in a DLQ to replay from.

Secondary: `AutoOffsetReset.Latest` on a brand-new consumer group means the very first deployment
skips any `ack-writeback` command produced before the consumer joined.

---

## BUG-025 — `KafkaSinks` falls back to the whole JSON document as the compaction key

**Severity:** High · **Status:** CONFIRMED

**File:** `src/flink/src/main/java/com/ams/flink/KafkaSinks.java:73-88`

```java
public byte[] serialize(String value) {
    String key = null;
    try {
        JsonNode node = MAPPER.readTree(value).get(field);
        if (node != null && !node.isNull()) key = node.asText();
    } catch (Exception ignored) { }
    if (key == null || key.isEmpty()) {
        key = value;    // never emit a null key — compacted topics reject it
    }
    return key.getBytes(StandardCharsets.UTF_8);
}
```

The fallback avoids the broker rejection, but the resulting key is the entire record body. On the
**compacted** `current-alarm-state` topic that means every such record has a unique key, so log
compaction can never collapse it and the "latest state per alarm" invariant is broken for those
records. It also scatters an alarm's records across partitions, breaking the per-alarm ordering the
class doc-comment says keying provides.

**Failure scenario:** `ValidationMap` produces an event whose `alarmId` resolves to the empty string
(e.g. an HTTP-feed record whose `correlation_id` is `""` and whose derived key is empty), or a
`toCurrentAlarmStateJson` serialisation regression drops the field. Each such record is written
under its own unique key and is retained forever by compaction. A projection rebuild by replaying
the compacted topic then replays every one of those historical records, resurrecting alarms that
were cleared long ago. The event count also grows without bound in a topic whose retention model
assumes bounded key cardinality.

---

# MEDIUM

## BUG-026 — `DedupFilter` state grows without bound and drops same-millisecond transitions

**Severity:** Medium · **Status:** CONFIRMED
**File:** `src/flink/src/main/java/com/ams/flink/PipelineOperators.java:100-145`

```java
if (prev != null && prev >= evt.eventTimeEpochMs && !activeChanged && !ackChanged) {
    evt.duplicate = true;
    return false;
}
```

Three `ValueState`s (`lastEventTime`, `lastConditionActive`, `lastAcknowledged`) are keyed by
`alarmKey` and **never cleared** — unlike `LifecycleMap`, which explicitly clears its state on
`CLEARED` "to prevent unbounded state growth" (line 263-271). Keyed state therefore grows with the
number of distinct alarm keys ever seen, for the lifetime of the job.

The predicate also drops any event whose timestamp is `<=` the previous one unless the
active or ack bit flipped. Two distinct transitions stamped with the same millisecond (common on
OPC servers with 1 ms clock granularity during a burst) — for example a severity escalation
400 → 900 with an unchanged active/ack state — are silently discarded, so the escalation never
reaches the console.

## BUG-027 — Case-sensitivity mismatch between the ingest match and the DB unique index

**Severity:** Medium · **Status:** PLAUSIBLE (requires a runtime check against real tag casing)
**Files:** `NormalizedAlarmIngestor.cs:217-224`, `AlarmRepositories.cs:140-144`,
`database/scripts/35_alarm_current_identity.sql`

`MatchesIngestEvent` compares `ConditionName`/`SubConditionName` with
`StringComparison.OrdinalIgnoreCase`, while `GetBySourceNameForIngestAsync` compares `SourceName`
with `==` (case-sensitive in Postgres) and `uq_alarm_current_identity` is a plain case-sensitive
btree over `(server_id, source, condition, COALESCE(sub_condition,''))`.

Failure scenario: the same tag arrives once as `Pump01` and once as `PUMP01`. The lookup finds no
match, `AddAsync` inserts a second row, and the case-sensitive unique index allows it — two live
rows for one physical alarm, each acknowledged independently. Conversely, if a `condition` differs
only by case the ingestor treats the rows as one and an `AddAsync` elsewhere in the same batch can
violate the unique index, failing the whole 100-event batch (see BUG-005 for what that costs).

## BUG-028 — `PurgeLabInjectedAlarms` ignores its `serverId` parameter and deletes on a source-name heuristic

**Severity:** Medium (Critical when combined with the authorization gap — see SEC-004)
**Status:** CONFIRMED
**File:** `src/backend/AMS.Infrastructure/Repositories/AlarmRepositories.cs:113-125`

```csharp
public async Task<int> PurgeLabInjectedAlarmsAsync(Guid? serverId = null, CancellationToken ct = default)
{
    var q = _ctx.ActiveAlarms.Where(a =>
        (a.Message != null && EF.Functions.ILike(a.Message, "%Autonomous storm%"))
        || a.SourceName.Contains("/")           // <-- any hierarchical tag name
        || EF.Functions.ILike(a.SourceName, "Kiln/%") ...);
    var removed = await q.ExecuteDeleteAsync(ct);
```

`serverId` is accepted and never used. The predicate `a.SourceName.Contains("/")` matches any
hierarchical tag name — the exact convention the repo's own HDPE UNS work adopts.
`ExecuteDeleteAsync` bypasses the change tracker, so no SignalR `OnAlarmCleared` is published and
no history row is written: the alarms just vanish from `alarm_current` while every connected
console keeps showing them until the next full hydration.

The frontend calls this on **every** hub connect (`alarmStore.ts` → `hydrateAlarmsFromApi({purgeLab:true})`)
whenever the primary connection's protocol is `OPC-AE`.

## BUG-029 — `NormalizedAlarmEvent.EventId` is never used for idempotency

**Severity:** Medium · **Status:** CONFIRMED
**Files:** `PipelineOperators.java:417` (`eventId = alarmId + ":" + eventTimeEpochMs`),
`KafkaConsumerService.cs:71`, `NormalizedAlarmIngestor.cs`

Flink goes to the trouble of emitting a deterministic `eventId`, and the consumer deserialises it,
but nothing on the consume path ever checks it. Combined with at-least-once Kafka delivery and
BUG-013's off-by-one commit, a redelivered event is fully reprocessed: a duplicate
`alarm_history` row, a duplicate SignalR broadcast, and another `ApplyConditionChange` (which,
because of BUG-001, is another acknowledgement reset).

## BUG-030 — Partitions-revoked handler blocks the librdkafka callback thread for seconds

**Severity:** Medium · **Status:** CONFIRMED
**File:** `src/backend/AMS.Infrastructure/Kafka/KafkaConsumerService.cs:176-197`

```csharp
.SetPartitionsRevokedHandler((c, partitions) =>
{
    ...
    FlushBatchAsync(c, CancellationToken.None).GetAwaiter().GetResult();
```

`FlushBatchAsync` retries up to four times with `250 → 500 → 1000 ms` backoff plus the Postgres
round-trips, all synchronously blocking the rebalance callback. During a Postgres slowdown the
callback can hold for many seconds; the rebalance stalls for the whole consumer group and can trip
`max.poll.interval.ms`, causing another rebalance — a rebalance storm. `CancellationToken.None`
also means shutdown cannot interrupt it.

Note the `SemaphoreSlim _flushLock` is **not** re-entrant; it does not deadlock today only because
`Consume` (the sole caller of the rebalance callback) is never invoked from inside
`FlushBatchAsync`. That is a fragile invariant with no assertion protecting it.

## BUG-031 — `StateDriftDetectionJob` reads topics nothing produces and keys on a field that does not exist

**Severity:** Medium · **Status:** CONFIRMED
**File:** `src/flink/src/main/java/com/ams/flink/StateDriftDetectionJob.java:32-41, 453-461`

```java
.setTopics("alarm.events.raw")     // no producer anywhere in src/
.setTopics("alarm.state.active")   // no producer anywhere in src/
...
return AlarmJson.text(node, "Id", "id");   // alarm JSON uses alarmId, never Id/id
```

Grep over `src/**` finds only consumers for both topics; the live pipeline uses `raw-alarms` and
`current-alarm-state`. `extractId` looks for `Id`/`id`, which the alarm envelopes do not carry, so
every record would key to `""` anyway. `DriftAlertConsumerService` in `ams-api` therefore consumes a
topic that is never written, and the drift alert panel silently shows nothing — presented as
"no drift" rather than "detector not wired".

Additional defect in the same class: `processElement1` registers a **new** 10-second processing-time
timer for every event (line 477) with no de-duplication, so timers accumulate one per event.

## BUG-032 — `AlarmStateDeltaConsumerService`, `ReplayResultConsumerService`, `DriftAlertConsumerService`: auto-commit + swallowed deserialisation errors

**Severity:** Medium · **Status:** CONFIRMED
**Files:** `AlarmStateDeltaConsumerService.cs:352-397`, `ReplayResultConsumerService.cs:361-410`,
`DriftAlertConsumerService.cs:286-335`

All three use `EnableAutoCommit = true` with `AutoOffsetReset.Latest` and a catch-all that logs and
sleeps 1 s. A deserialisation failure or a SignalR send failure loses the message permanently (the
offset has already been auto-committed). They also broadcast to `Clients.All` on
`ObservabilityHub`, which is gated to `system.manage` — so the message is delivered only to
authorised clients, but every authorised client gets every message regardless of scope.

## BUG-033 — `KpiConsumerService` never disposes its consumer and subscribes to two topics no job produces

**Severity:** Medium · **Status:** CONFIRMED
**File:** `src/backend/AMS.Api/BackgroundServices/KpiConsumerService.cs:15-46, 86`

The `IConsumer` is built in the constructor, the class does not implement `IDisposable`, and
`_consumer.Close()` runs only if the `while` loop exits normally — an exception escaping the loop
leaves the consumer (and its librdkafka handle and threads) leaked. `_topics` includes
`kpi-bad-actors` and `kpi-health-scores`, which no reviewed Flink job produces; with the default
`allow.auto.create.topics=true` the subscription silently creates them with broker defaults.

`AlarmKpiPayload` is a positional record with non-nullable `string KpiType`, deserialised from
Flink's `AlarmKpiResult.toJson()`, which only emits the branch fields matching `kpiType`
(`AlarmKpiResult.java:41-53`). A payload for `ALARM_RATE` therefore yields
`standingCount = 0, oldestStandingDurationMs = 0` etc., and the frontend stores it keyed by
`kpiType` (`alarmStore.ts` `setAlarmKpi`), so an ALARM_RATE update zeroes nothing but a
STANDING_ALARM_SNAPSHOT update overwrites the rate fields with defaults.

## BUG-034 — `AnalyticsController` returns naive `DateTime` hour buckets and counts non-active rows

**Severity:** Medium · **Status:** PLAUSIBLE (Npgsql `DateTime` kind must be confirmed at runtime)
**File:** `src/backend/AMS.Api/Controllers/V1/AnalyticsController.cs:26-89`

```csharp
hour = (DateTime)r.bucket,     // date_trunc('hour', event_time) over a timestamptz
```

The value is cast to `DateTime`, not `DateTimeOffset`, so it is serialised without an offset. The
browser's `new Date(...)` then interprets it in the viewer's local zone, shifting every hourly
alarm-rate bucket by the UTC offset. Elsewhere in the codebase the alarm path is explicitly
epoch-ms or `timestamptz`; this is the one place a naive local-looking timestamp escapes.

Two more issues in the same handler:
- `staleAlarmCount` and `priorities` query `alarms.alarm_current` with **no state filter**, so
  `SHELVED`, `SUPPRESSED` and `CLEARED` rows are counted as though they were active.
- Seven sequential un-limited aggregate scans over `alarm_history` (24 h and 7 d ranges, plus a
  `GROUP BY source HAVING COUNT(*) >= 5`) run per dashboard request with no caching.

## BUG-035 — Unbounded historical exports and transition queries

**Severity:** Medium · **Status:** CONFIRMED
**File:** `src/backend/AMS.Api/Controllers/V1/AlarmsController.cs:366-397, 402-456`

`GetHistoricalAlarms` enforces a 365-day cap, but `StreamHistoricalAlarms` and
`StreamAlarmStateTransitions` enforce nothing — a caller can request the entire retention window and
stream every row of a TimescaleDB hypertable. `GetAlarmStateTransitions` checks only `to > from`
and allows `pageSize` up to 5000 with no range cap.

`Response.Headers.Append("Transfer-Encoding", "chunked")` (lines 377, 442) is also incorrect —
Kestrel owns that header; setting it manually produces a duplicate/invalid header and is not valid
under HTTP/2.

## BUG-036 — `BatchAcknowledgeRequest.AlarmIds` has no size limit at the API boundary

**Severity:** Medium · **Status:** CONFIRMED
**Files:** `AlarmsController.cs:480-484`, `AlarmCommands.cs` (`BatchAcknowledgeAlarmsValidator`)

The DTO carries only `[Required]`. The FluentValidation rule caps it at 5000, but the handler then
issues one `GetByIdAsync` **and** one Kafka `ProduceAsync` per id, sequentially, inside the request
(`BatchAcknowledgeAlarmsHandler.Handle`). 5000 ids therefore mean 5000 round-trips to Postgres plus
10 000 awaited Kafka produces (each `PublishAcknowledgeAsync` emits two lifecycle events plus the
action) on a single HTTP request with no timeout of its own.

## BUG-037 — `GetCurrentUserId()` silently degrades to `Guid.Empty`

**Severity:** Medium · **Status:** PLAUSIBLE (depends on the `sub` format auth-service issues)
**File:** `src/backend/AMS.Api/Controllers/V1/AlarmsController.cs:461-465`

```csharp
var claim = User.FindFirst("sub") ?? User.FindFirst(ClaimTypes.NameIdentifier);
return Guid.TryParse(claim?.Value, out var id) ? id : Guid.Empty;
```

If `sub` is not a GUID (a username, an email, an opaque IdP subject), the ack/shelve/suppress
commands receive `Guid.Empty` as the actor. `AcknowledgeAlarmCommandValidator` has
`RuleFor(x => x.UserId).NotEmpty()`, so the request would fail validation with the misleading
message "UserId is required" — i.e. **all acknowledgements fail** with an error that points at the
request body rather than at the token format. For shelve, `ShelvedBy` would be recorded as
`00000000-0000-0000-0000-000000000000`.

## BUG-038 — Hub reconnect bypasses the concurrent-hydration guard

**Severity:** Medium · **Status:** CONFIRMED
**File:** `src/frontend-ob/src/store/alarmStore.ts:570-579, 624-635`

```ts
connection.onreconnected(async () => {
  ...
  await hydrateAlarmsFromApi(set, { reconcile: true });   // does NOT take refreshInFlight
});
...
refreshActiveAlarms: async () => {
  if (refreshInFlight) return;                            // guard applies only here
```

`refreshInFlight` exists precisely because "two concurrent hydrations can apply out of order"
(the FE-07 comment). `onreconnected` and the `initialize` path both call `hydrateAlarmsFromApi`
directly and neither takes the guard.

Failure scenario: the hub reconnects while the 30 s poll is mid-hydration. Both runs end with the
`reconcile` block, which deletes every store entry not in **its own** `fetchedIds`. The older run
finishes last and deletes the alarms the newer run just added, leaving the console short of alarms
until the following poll.

## BUG-039 — A re-activated alarm can be pinned as "acknowledged" by a stale lifecycle state

**Severity:** Medium · **Status:** PLAUSIBLE
**File:** `src/frontend-ob/src/utils/alarmReconciliation.ts:98-105`

```ts
function resolveOperatorAcknowledged(existing, incoming) {
  if (incoming.acknowledged === true) return true;
  if (existing.ackLifecycleState === 'ACK_CONFIRMED') return true;   // sticky forever
  ...
}
```

`mergeFields` keeps `incoming.ackLifecycleState ?? existing.ackLifecycleState`, and the REST DTO
supplies `null` for that field (`alarmMappers.ts` reads it from `opcAttributes`/`customAttributes`,
neither of which the API populates — see BUG-007). So once an alarm reaches `ACK_CONFIRMED` in the
store, any later payload saying `acknowledged: false` is overridden.

Reachability is limited because `flushHubDeltas` deletes the alarm on a clear, which discards the
stale state. It becomes reachable when the alarm re-activates without an intervening `clear` delta
(e.g. the clear was lost, or the store was hydrated from REST across the transition). Needs a
runtime repro.

## BUG-040 — Alarm annunciation fires one oscillator per alarm in a burst

**Severity:** Medium · **Status:** CONFIRMED
**File:** `src/frontend-ob/src/store/alarmStore.ts:278, 302, 311`

```ts
if (d.kind === 'new' && !existing) sounds.push(incoming.priority);
...
sounds.forEach(playAlarmSound);
```

`playAlarmSound` creates a fresh `OscillatorNode` + `GainNode` per call with no throttle, cap or
de-duplication. A 100 ms flush batch during an alarm flood can contain hundreds of new alarms; the
result is hundreds of simultaneous 400 ms oscillators — audibly a single distorted blast rather
than an annunciation, and a CPU/audio-graph spike on the operator workstation. EEMUA-191 expects
flood annunciation to be rate-limited.

## BUG-041 — `AlarmSignalRPublisher` delivers new alarms two to three times to the same client

**Severity:** Medium · **Status:** CONFIRMED
**File:** `src/backend/AMS.Api/Hubs/AlarmHub.cs:298-319`

```csharp
await _hub.Clients.All.OnNewAlarm(payload);
await _hub.Clients.Group($"alarms-{alarm.Priority.ToString().ToUpper()}").OnNewAlarm(payload);
await _hub.Clients.Group($"server-{alarm.ServerId}").OnNewAlarm(payload);
```

Every connection is in `Clients.All`; the console additionally joins `server-{id}` on hydration
(`alarmStore.ts` `subscribeToServer`) and may join `alarms-{priority}`. Each client therefore
receives the same `OnNewAlarm` two or three times, tripling hub fan-out on the hot path.

> Mitigated on the client: within one 100 ms flush batch the second copy finds `existing` and is
> dropped by `alarmsEqual`, so it does not double-beep or duplicate the row. The wasted bandwidth
> and serialisation remain, and the mitigation depends on both copies landing in the same batch.

## BUG-042 — `RootCauseMap` timestamps root-cause events in the server's local zone

**Severity:** Medium · **Status:** CONFIRMED
**File:** `src/flink/src/main/java/com/ams/flink/PipelineOperators.java:330`

```java
out.put("eventTime", OffsetDateTime.now().toString());
```

Every other timestamp on the alarm path is epoch-ms or explicitly `ZoneOffset.UTC`
(`toAlarmTopicJson`, line 393-394). `OffsetDateTime.now()` uses the TaskManager's default zone, so
`root-cause-events` carries a local-offset timestamp whose value depends on the container's
`TZ`. Correlating root-cause events with `lifecycle-events` (epoch-ms UTC) shifts by the offset,
and the field is a wall-clock *processing* time rather than the event time of the triggering alarm.

---

# LOW

| ID | Title | Location | Note |
|---|---|---|---|
| BUG-043 | `LifecycleEventPublisher` overwrites the stream `EventType` with the lifecycle state, so `eventType` is never the declared `LIFECYCLE_TRANSITION` contract value | `LifecycleEventPublisher.cs:36` | Contract drift; consumers switch on `lifecycleState` instead |
| BUG-044 | `SoeOrderMap` and `CorrelationMap` are named pipeline stages that only increment counters — the "SOE ordering" and "correlation engine" advertised in the job graph do nothing | `PipelineOperators.java:193-209, 278-295` | Out-of-order SOE events are never reordered |
| BUG-045 | `AlarmHub` group subscriptions are decorative: every publish also goes to `Clients.All`, so `role-`, `station-`, `area-` and `alarms-{priority}` groups never restrict anything | `AlarmHub.cs:51-113` vs `:303-332` | See SEC-008 |
| BUG-046 | `_connections` static dictionary in `AlarmHub` is written on connect/disconnect but only read by `TotalConnections`; it survives a hub scale-out incorrectly (per-process) | `AlarmHub.cs:28` | Connection counts under-report with more than one instance |
| BUG-047 | `bulkUpdateAlarms` mutates `state.stats.shelved`/`totalActive` and then immediately overwrites `state.stats` with `recalcStatsFromAlarms` — the increments are dead code; the `'ACKNOWLEDGED'` branch is an unconditional `continue` | `alarmStore.ts:669-698` | Dead code that reads as behaviour |
| BUG-048 | `queueHubDelta`'s `setTimeout` is only cleared by `disconnect()`; a store teardown without disconnect leaves a pending flush holding a stale `set` | `alarmStore.ts:266-270` | Small leak on hot-reload / route teardown |
| BUG-049 | `AlarmIngestionService` includes the source `Timestamp` in the snapshot equality record, so a feed that refreshes `source_timestamp` every poll republishes every alarm every 2 s | `AlarmIngestionService.cs:120, 279-288` | Feed-dependent; becomes a `raw-alarms` storm |
| BUG-050 | `IoTDBPersistenceJob.warnOnSanitisationCollision` logs a collision once and then keeps writing both alarms into the same device path — the histories still interleave | `IoTDBPersistenceJob.java:91-102` | Documented as deliberate; the data corruption is real |

---

# Security findings

## SEC-001 — `OpcConnectionsController`: SSRF and destructive writes reachable with only `analytics.view`

**Severity:** High · **Status:** CONFIRMED
**File:** `src/backend/AMS.Api/Controllers/V1/OpcConnectionsController.cs:22, 303-321, 494-500`

```csharp
[Authorize(Policy = "analytics.view")]          // class-level default
public sealed class OpcConnectionsController : ControllerBase
{
    ...
    [HttpPost("test")]                          // no method-level [Authorize] override
    public async Task<IActionResult> TestDraft([FromBody] UpsertOpcConnectionRequest request, ...)
    ...
    [HttpPost("sync-from-gateway")]             // no method-level [Authorize] override
    public async Task<IActionResult> SyncFromGateway(CancellationToken ct)
    {
        await SyncGatewayOpcConnectionsAsync(ct);   // DELETEs and UPSERTs connection rows
```

Every other mutating action on this controller carries `[Authorize(Policy = "system.manage")]`
(lines 116, 168, 222, 233, 276, 293). `test`, `sync-from-gateway` and `browse` do not, so they fall
back to the read-only `analytics.view` policy.

- `POST /api/v1/opcconnections/test` accepts an attacker-chosen `Endpoint` and has the server fetch
  it (`TestHttpJsonFeedAsync`), returning success/failure and the error text — a classic
  server-side request forgery from inside the compose network, available to any read-only analyst
  account.
- `POST /api/v1/opcconnections/sync-from-gateway` **deletes** rows matching `IsStaleLabSimulation`
  and upserts others, and calls out to `OpcGateway:BaseUrl`. A read-only role can destroy OPC
  connection configuration.

**Fix direction:** move `[Authorize(Policy = "system.manage")]` onto all three actions (or make it
the class default and downgrade only the genuine read actions).

## SEC-002 — OPC/DCS connection passwords are encrypted with a key hard-coded in the repository

**Severity:** High · **Status:** CONFIRMED
**File:** `src/backend/AMS.Infrastructure/Security/ConnectionPasswordCrypto.cs:10-15`

```csharp
var keyMaterial = config["Security:ConnectionPasswordKey"] ?? "ams-dev-connection-key-32bytes!!";
_key = SHA256.HashData(Encoding.UTF8.GetBytes(keyMaterial));
```

`Security:ConnectionPasswordKey` appears in **no** `appsettings*.json`, no compose file and no helm
values in this repo (verified by grep), so the fallback is the key actually in use. Anyone with the
source tree plus read access to `alarms.opc_connections` can decrypt every stored DCS credential.

Secondary weakness: AES-CBC with a random IV and **no** authentication tag (`Encrypt`/`Decrypt`,
lines 17-45). The ciphertext is malleable, and `Decrypt` surfaces padding failures as exceptions —
a padding-oracle shape if any endpoint reflects decryption errors.

## SEC-003 — Database password committed to the repository (twice)

**Severity:** High · **Status:** CONFIRMED
**Files:** `src/backend/AMS.Api/appsettings.json:3`,
`src/flink/src/main/java/com/ams/flink/PipelineConfig.java:187`

```json
"AmsDb": "Host=postgres;Port=5433;Database=ams;Username=ams_user;Password=supersecurepassword123"
```

```java
System.getenv().getOrDefault("DB_PASS", "supersecurepassword123"),
```

`docker-compose.yml` correctly requires `POSTGRES_PASSWORD` via `${VAR:?…}`, so the deployed stack
does not use these — but the credential is in version control, and both fallbacks silently accept
it if the environment variable is missing in any other deployment shape. `PipelineConfig.java:203-204`
likewise defaults IoTDB to `root`/`root`.

## SEC-004 — A mass-delete of active alarms is gated behind the acknowledge permission

**Severity:** High · **Status:** CONFIRMED
**File:** `src/backend/AMS.Api/Controllers/V1/AlarmsController.cs:114-124`

```csharp
[HttpPost("active/purge-lab-data")]
[Authorize(Policy = "alarm.acknowledge")]
public async Task<IActionResult> PurgeLabInjectedAlarms(...)
```

The command `ExecuteDeleteAsync`s rows from `alarms.alarm_current` on a source-name heuristic that
matches any tag containing `/` (BUG-028), across **all** servers (the `serverId` parameter is
ignored), with no SignalR notification and no history record. A console operator holding only
`alarm.acknowledge` can silently delete the live alarm list. This should require `system.manage` at
minimum, and arguably should not exist outside a lab build.

## SEC-005 — Deployed stack runs with `ASPNETCORE_ENVIRONMENT=Development`

**Severity:** Medium-High · **Status:** CONFIRMED
**File:** `infra/docker/docker-compose.yml:692`

```yaml
ASPNETCORE_ENVIRONMENT:   Development
```

Consequences visible in `Program.cs`:
- Swagger UI is served (line 273-284) and reachable through the gateway.
- SignalR `EnableDetailedErrors = true` (line 178) — exception messages and stack details are sent
  to connected clients.
- CORS policy `AmsPolicy` is registered and applied (lines 244-246, 281) with
  `AllowAnyHeader().AllowAnyMethod().AllowCredentials()`.
- `UseHttpsRedirection` is skipped (line 296).
- `BackgroundServiceExceptionBehavior.Ignore` (line 54) — a hosted service that throws is silently
  removed from the process with the host still reporting healthy. For the alarm path that means the
  projection consumer or the ingestion poller can die while `/health/ready` stays green.
- EF migrations are skipped on startup (line 262-264).

## SEC-006 — Authenticated SSRF with response-body reflection in the alarm-feed admin endpoint

**Severity:** Medium · **Status:** CONFIRMED
**File:** `src/backend/AMS.Api/Controllers/V1/AlarmIngestionAdminController.cs:167-195`

```csharp
[HttpPost("test")]
[Authorize(Policy = "admin.users.edit")]
public async Task<IActionResult> TestFeed([FromBody] TestAlarmFeedRequest? request, ...)
{
    var url = string.IsNullOrWhiteSpace(request?.FeedUrl) ? _opts.FeedUrl : request!.FeedUrl!.Trim();
    ...
    var body = await response.Content.ReadAsStringAsync(ct);
    return (false, $"HTTP {(int)response.StatusCode}: {body}", (int)response.StatusCode);   // body reflected
}
```

No scheme/host allow-list. A holder of `admin.users.edit` (a user-administration permission, not an
infrastructure one) can make `ams-api` fetch any URL reachable from inside the compose network —
`http://kafka:9092`, `http://postgres:5432`, internal service endpoints, or a cloud metadata
service — and read the response body back through the API. Note this endpoint is reachable through
the gateway on `:8081`, i.e. from the operator network.

## SEC-007 — Unauthenticated pipeline/broker health disclosure

**Severity:** Medium · **Status:** CONFIRMED
**File:** `src/backend/AMS.Api/Controllers/V1/HealthPipelineController.cs:349-371`

```csharp
[HttpGet("pipeline")]
[AllowAnonymous]
public async Task<IActionResult> GetPipeline(CancellationToken ct)
{
    var report = await _health.GetAsync(ct, _opcConnections);
    return Ok(report);          // full PipelineHealthService report, incl. OPC connection inventory
}
```

`GetPipeline` passes the OPC connection repository into the report builder, so the anonymous
response is shaped by the plant's actual OPC connection inventory. `GetKafka` discloses the topic
name, throughput and consumer lag. Health *liveness* does not require this level of internal
detail; if an unauthenticated probe is needed, return a status token and gate the detail behind
`system.manage`.

## SEC-008 — Every alarm is broadcast to every authenticated client regardless of role, area or station

**Severity:** Medium · **Status:** CONFIRMED
**File:** `src/backend/AMS.Api/Hubs/AlarmHub.cs:35-113, 298-376`

`OnConnectedAsync` builds `role-{role}`, `station-{station}`, `server-{id}`, `area-{id}` and
`alarms-{priority}` groups, and the hub exposes `SubscribeToServer` / `SubscribeToArea` /
`SubscribeToPriority` so clients can join them. Every publish method then sends to
`Clients.All` anyway (`OnNewAlarm`, `OnAlarmUpdated`, `OnAlarmCleared`, `OnBulkAlarmsUpdated`,
`OnFloodAlert`, `OnServerStatusChanged`, `OnAckLifecycleUpdated`, `OnLoopKpiUpdate`,
`OnAlarmKpiUpdate`). A `VIEWER` scoped to one area receives the full plant alarm stream, including
messages, process values and OPC attributes for units they are not authorised to see. The group
machinery gives the false impression that scoping is enforced.

`SubscribeToServer` and `SubscribeToArea` also accept any string with no validation or
authorisation check, so a client can join an arbitrary group name
(`SubscribeToPriority` is the only one that validates its input, line 110-111).

## SEC-009 — `X-Auth-*` header trust — **checked and NOT exploitable from outside**

**Severity:** Informational · **Status:** REFUTED (documented so it is not re-raised)
**Files:** `src/backend/AMS.Api/Auth/GatewayHeaderAuthHandler.cs:28-58`,
`src/services/gateway/Program.cs:124-131, 185-192`, `infra/docker/docker-compose.yml:679-733`

`GatewayHeaderAuthHandler` grants a full `ClaimsPrincipal` — including the `permission` claims that
drive `alarm.acknowledge`, `alarm.shelve` and `system.manage` — from unvalidated request headers.
That is only safe because two things hold, and both were verified:

1. The gateway removes any client-supplied `X-Auth-*` header on ingress
   (`Program.cs:185-192`) and again on the proxy request (`:124-127`) before injecting its own.
2. `ams-api` publishes **no** host port in `docker-compose.yml` (the block at line 679-733 has no
   `ports:` key) — it is reachable only on the `ams-backend` compose network.

The residual risk is that the entire authorization model collapses if either invariant is broken —
a debugging `ports:` line, a second ingress, or any workload on `ams-backend` that can reach
`ams-api:8000` directly. Worth a compose-lint assertion, but it is not a live vulnerability today.

---

# Appendix — invariants worth asserting in CI

These would have caught most of the Critical findings mechanically:

1. **No mapped-domain-property may be `Ignore`d if any code path reads it after a DB load.**
   `ConditionActive`, `Priority`, `Category`, `Quality`, `AckTime`, `AckedBy`, `AckComment`,
   `ActiveTime`, `ServerReceivedAt` and `CustomAttributes` are all `Ignore`d in
   `AmsDbContext.cs:71-106` and all are read after a load. (BUG-001, 002, 004, 007, 008, 009, 019)
2. **A projection consumer must not publish to SignalR before its transaction commits.**
   (BUG-005)
3. **Every Kafka `Commit(TopicPartitionOffset)` must use `offset + 1`.** (BUG-013)
4. **No operator on the alarm path may `return false` / drop a record without a side-output or a
   counter that is alerted on.** (BUG-003)
5. **A DTO field must be derived from the entity, never from configuration or a literal**, unless
   the literal is the documented contract. (BUG-015, BUG-016)
6. **Every REST query parameter the controller declares must be referenced by the repository that
   serves it.** (BUG-014, BUG-016, BUG-028)
