# 00 — Executive Summary

**Analysis date:** 2026-08-25 · **Commit:** `2886ccb` (branch `main`, clean working tree)
**Method:** ten specialised agents traced the alarm domain independently and cross-checked where their
areas overlapped. Every claim below is anchored to a call site. No production code was modified.

---

## 1. The one-paragraph verdict

The alarm platform has a **well-engineered spine and a hollow perimeter**. Between `raw-alarms` and the
operator console, the streaming architecture is real: a genuine Flink state machine, correct
manual-commit projection semantics, a no-loss IoTDB sink, JobManager HA on MinIO checkpoints, and an
ACK command path whose seven hops all carry correlation IDs end to end. But **both ends of that spine
are missing**. There is no OPC client anywhere in the repository — alarms arrive by HTTP-polling an
endpoint that is neither in the repo nor reachable from the lab. And the DCS write-back terminates at a
twenty-line Python script that prints the request and returns `200 OK`. In between, a single
schema/entity mismatch (`alarm_current` has 11 columns; the entity has 31) silently breaks
acknowledgement, priority, categorisation, and audit attribution. The system is best understood as a
**high-quality streaming skeleton with simulated endpoints and an unfinished data model** — not as a
deployable ISA-18.2 alarm management system.

---

## 2. What is actually implemented

**Genuinely working, end to end:**

- HTTP feed → `raw-alarms` → `OpcEventStreamJob` → `current-alarm-state` → Postgres → REST → console
- The ACK command path: UI → `/alarms/acknowledge/batch` → `operator-actions` → Flink ACK orchestrator
  → `ack-writeback` → `HttpAckWritebackService` → HTTP POST → `ack-results` → Flink → Postgres →
  SignalR → UI badge. Idempotency keys, correlation IDs, poison-message handling, and manual offset
  commits are all correct.
- `raw-alarms` → `IoTDBPersistenceJob` → IoTDB, with a genuine fail-loud sink that flushes inside
  `snapshotState` and fails the checkpoint rather than dropping data.
- `current-alarm-state` → `LiveStateJob` → `live.alarms` → Sparkplug edge node → MQTT.
- Shelve expiry (`ShelveExpiryService` + the `expire_shelved_alarms()` SQL function).
- Edge-only auth: the gateway is the sole RS256 validator and strips inbound `X-Auth-*` headers. An
  agent actively tried to break this model and **refuted** the attack — it holds.

**Engineering quality worth preserving:** `FailLoudIoTDBSink`, `KafkaSinks` keyed compaction, the
Flink job supervisor's duplicate-job guard, the projection consumer's persist-then-commit ordering, and
the ACK path's terminal-state regression guard are all careful, well-reasoned work.

---

## 3. What the pipeline actually looks like

```
HTTP JSON feed (192.168.1.51:8010 — not in repo, unreachable)
        │  ✗ broken in every shipped config
        ▼
AlarmIngestionService (poll + in-RAM diff)  ── ams-sims inject here instead
        ▼
   raw-alarms ──────────────────┬──────────────► IoTDBPersistenceJob ──► IoTDB
        ▼                       │
  OpcEventStreamJob "AMS - Alarm State Machine"
   (3 lifecycle states; no DLQ; no restart strategy)
        │
        ├──► current-alarm-state ──┬──► NormalizedAlarmIngestor ──► Postgres alarm_current
        │                          ├──► LiveStateJob ──► live.alarms ──► Sparkplug ──► MQTT
        │                          └──► AlarmStateExportJob ──► flink.state.alarm.delta
        ├──► lifecycle-events ─────┬──► LifecycleEventConsumerService  ✗ rejects non-GUID ids
        │                          └──► AlarmKpiStreamJob ──► kpi-* topics
        ├──► root-cause-events ───────► notification-service  ✗ field-name mismatch
        └──► ack-writeback ───────────► HttpAckWritebackService ──► mock-dcs (python print)
                                                                        │
                          ack-results ◄──────────────────────────────────┘
                                 ▼
                         Postgres ──► AlarmHub /hubs/alarms ──► Operations tab
```

Full diagrams, hop tables, and the ACK sequence: **`11-architecture-reconstruction.md`**.

---

## 4. What reaches the Operations tab

Six pages. Four carry real data; one is permanently empty; flood annunciation is dead at every layer.

| Page | Reality |
|---|---|
| `/dashboard` | Real REST + SignalR + MQTT. Several tiles hardcoded — flood is permanently `false`. |
| `/alarms` (Active Alarms) | The most complete page. AG-Grid, 15 columns, live ack-lifecycle badge with a DCS timer. **Unshelve always 400s; SignalR-delivered alarms cannot be acknowledged; some alarms the console offers as ackable are rejected by the server** (see §10). |
| `/live-events` | MQTT tab works. SignalR tab is empty — its event source has no publisher. |
| `/soe` (Sequence of Events) | **Permanently empty.** No publisher for `OnSoeEvent`, the repository is a stub, `alarm_state_transitions` is a table nothing writes, and the page never fetches. |
| `/historical` (Alarm History) | Real queries — but `cleared_time` is never real (see §7), and `serverId`/`priority`/`category` filters are silently ignored. |
| `/analytics` | Real KPI endpoint. The fleeting-alarm metric counts every acknowledgement as a fleeting alarm. |

**Fabricated data is presented to operators as fact.** `AlarmDetailPanel.tsx:331-384` renders an
invented alarm History tab with wrong timestamps and asserted strings such as
`"Process variable recovered to acceptable range"` and `"Reason: DCS Rule"`. The statistics endpoint
hardcodes shelved/suppressed counts to `0`, and the API fabricates `AckTime = UtcNow` on every read —
so two consecutive polls report two different acknowledgement times for an untouched alarm.

---

## 5. Does DCS write-back exist?

**No — not to a DCS.** It is implemented against an HTTP stub.

The first six hops are real code. The seventh does not exist:

| Hop | Status |
|---|---|
| UI → API → `operator-actions` → Flink → `ack-writeback` → `HttpAckWritebackService` | ✅ real |
| `HttpAckWritebackService` → HTTP POST (idempotency key, resilience handler, **no auth headers**) | ✅ real HTTP, no protocol |
| **OPC Gateway** | ⚫ **not in this repository** — `scripts/start-opc-gateway-lab.ps1:10` points at `e:\AMS - HMI GRID\...` |
| Actual target in default compose | 🟠 `mock-dcs`, a 20-line Python `print()` server (`docker-compose.yml:413-445`, wired at `:718`) |
| `ack-results` → Flink → Postgres → SignalR → UI | ✅ real |
| Shelve → DCS | 🟠 `NoOpOpcDcsGateway` — logs, returns, UI reports "Alarm shelved successfully" |

**Zero industrial-protocol libraries exist in the repo** — no `Opc.Ua`, `QuickOPC`, `node-opcua`, or
`milo` in any `.csproj`, `pom.xml`, or `package.json`. Any 2xx from any listener is recorded as
`ACK_CONFIRMED` with no body parsing and no read-back, and `mock-dcs` has **no `profiles:` key**, so it
starts on a plain `docker compose up` and the full ISA-18.2 round trip goes green while no DCS is told.
`scripts/test-full-pipeline-e2e.ps1:104-108` lists that round trip as a *critical* pass criterion.

---

## 6. Kafka topics and Flink jobs involved

**Live alarm topics (11):** `raw-alarms`, `current-alarm-state` (compacted), `lifecycle-events`,
`operator-actions`, `ack-writeback`, `ack-results`, `root-cause-events`, `lifecycle-alerts`,
`live.alarms`, `flink.state.alarm.delta`, `kpi-alarm-rates` + `kpi-standing-snapshots`.

**Dead topics (13+):** `raw-opc-events` (deleted at startup, yet ~12 validation scripts still assert on
it), `alarm.events.raw`, `alarm.state.active`, `alarm.state.delta`, `live.alarm.metrics`,
`kpi-bad-actors`, `kpi-health-scores`, `ack-writeback-dlq`, `raw-alarms-dlq` (produced, never
consumed), `loop-raw-data`, `loop-kpis-5m`, `raw.telemetry.site1`, `soe-events`. Two parallel naming
taxonomies (dash-case and dot-case) are both created by the same script.

**Live Flink jobs (6):** `OpcEventStreamJob`, `IoTDBPersistenceJob`, `LiveStateJob`,
`AlarmKpiStreamJob`, `AlarmStateExportJob`, `AnalysisExecutionJob`.
**Never submitted (3):** `StateDriftDetectionJob`, `LoopKpiStreamJob`, `AlarmReplayEngine`.

**Live .NET consumers on producerless topics (4):** `DriftAlertConsumerService`,
`ReplayResultConsumerService`, and two of `KpiConsumerService`'s five subscriptions.

---

## 7. What is missing

Of 18 alarm capabilities graded against the implementation: **2 implemented, 11 partial, 3 placeholder,
3 missing.**

- **The ISA-18.2 state machine implements 3 of 8 declared states.** Shelved, Suppressed-by-design,
  Out-of-Service, RTN-Unacknowledged, and Latched are grep-verified absent from Flink.
- **No flood or chattering detection anywhere.** `FloodDetectFilter` is a bare
  `if (severity >= 950) return false;` — it *deletes* the highest-severity alarms rather than detecting
  floods. The KPI is hardcoded to `0`, `OnFloodAlert` has no publisher, and `FloodAlertBanner` is dead
  code. Three layers each assume another does it.
- **No escalation.** The only `ACK_SLA_BREACH` producer is `[Obsolete]` and unregistered; it defers to
  a Flink timer that does not exist. `ACK_TIMEOUT` is unreachable — a stalled ACK sits at
  `ACK_DISPATCHED` forever behind a UI timer that never terminates.
- **No threshold/rule evaluation.** `AlarmRulesConfig.tsx` makes zero API calls, has a disabled Save
  button, and self-declares "Not functional yet."
- **No alarm rationalization / master alarm database** — an ISA-18.2 requirement.
- **No audit trail for any operator action.** ams-api produces nothing to `audit-events`; shelve/ack
  comments are validated then discarded by EF; `shelving_actions` receives only `AUTO_EXPIRED` rows.
- **No NAMUR NE107 quality mapping** — quality is the literal `192`.
- **No correlation or SOE ordering** — those Flink operators are pure pass-throughs that only draw
  boxes in the Flink UI. `RootCauseMap` is `contains("CRUSHER"/"CONVEYOR"/"FEEDER"/"MOTOR")`.
- **No Flink DLQ at all** — zero `OutputTag`/`sideOutput` matches. A malformed operator ACK is dropped
  with no log, no metric, no topic. (The .NET DLQ, by contrast, is real.)

---

## 8. Dead code

`AlarmCommands.cs` is 943 lines of which **406 are comments**, and `:505-943` is a wholesale
commented-out duplicate of the file's own live handlers. All 10 domain events are collected and never
dispatched — no dispatcher exists. Six SignalR server→client methods are declared and never invoked.
Four database tables are dead (`alarm_state_transitions`, `historical_alarms`, `active_alarms`,
`configuration.opc_servers`), and six schemas (`soe`, `analytics`, `notifications`, `security`,
`audit`, `keycloak`) are created with zero tables. `database/procedures/alarm_operations.sql` holds 444
lines of real ISA-18.2 logic — batch ack, chattering detection, bad-actor ranking — that is **never
deployed**. Full inventory with removal-risk ratings: `09-dead-code-and-hardcoded.md`.

---

## 9. What is hardcoded

- **`192.168.1.51:8010`** compiled in at `AlarmIngestionService.cs:20-21` as *both* the feed URL and
  the ACK write-back fallback. An unconfigured deployment polls a stranger's LAN box and **POSTs
  operator acknowledgements to it**. `appsettings.Development.json:8` warns against exactly this while
  the constants remain, and `appsettings.Production.json:5` ships the same IP.
- **The lab GUID `f0af9a6d-…`** is the `server_id` column DEFAULT in the live schema
  (`35_alarm_current_identity.sql:41,49`) and simultaneously the frontend's alarm-visibility allowlist
  (`opcAlarmFilter.ts:22`). Since `alarmApi.ts:147-149` swallows errors with `catch { return []; }`, an
  admin-API failure is indistinguishable from "no servers" — **the console renders zero alarms while
  looking healthy**.
- **Credentials in source:** `supersecurepassword123` in `appsettings.json:3` and
  `PipelineConfig.java:84`; IoTDB `root`/`root`; and DCS connection passwords encrypted with the
  hardcoded key `"ams-dev-connection-key-32bytes!!"`.
- **`ASPNETCORE_ENVIRONMENT: Development`** on `ams-api` in the *main* compose file — which enables
  `BackgroundServiceExceptionBehavior.Ignore`, so **a crashed alarm consumer is silently swallowed
  while `/health/ready` stays green**.
- **Audit-trail integrity:** unshelve hardcodes station `'CCR-01'`; the ack dialog silently stamps
  `'Acknowledged by operator via console'`.
- `category = "PROCESS"` for every alarm; `oldestStandingDurationMs = 0 // simplified for demo`.

A useful negative: there are **zero** `FIXME`/`HACK`/`XXX`/`NotImplementedException` markers in alarm
code, and no fabricated numeric process data. The gaps are marked with `NoOp…`, `Stub…`, `mock-…`, and
hardcoded returns — which is precisely why they read as finished features.

---

## 10. Critical and high-priority issues

59 defects: **6 Critical, 19 High, 17 Medium, 8 Low, plus 9 security findings.** Full detail with
failure scenarios in `10-bugs-and-issues.md`.

**The six criticals:**

| ID | Finding |
|---|---|
| BUG-001 | **Every projection update un-acknowledges the alarm.** The entity loads with `ConditionActive=false`, so the "re-activated" branch always fires — the DCS event that *confirms* the ack is the one that destroys it. |
| BUG-002 | An external OPC ack is applied, then undone two lines later, and the alarm drops off the active list. |
| BUG-003 | The flood filter **silently deletes** every alarm with severity ≥ 950 — no log, no DLQ. |
| BUG-004 | **Acknowledging an alarm removes it from the operator console** for up to 30 s. |
| BUG-005 | SignalR broadcasts before the DB commit and re-broadcasts on every retry, so a failed batch leaves Postgres holding rows every console has already removed. |
| BUG-006 | Shelved/suppressed/OOS alarms are invisible everywhere; `?isShelved=true` is unsatisfiable. Shelving is an **undocumented mute** — ISA-18.2 §11 violation. |

**Highest-priority security items:** SSRF plus destructive OPC-connection writes from an analyst
account (`OpcConnectionsController` — three actions missing the `system.manage` override their siblings
carry); a hardcoded DCS-password encryption key; a plant-wide `ExecuteDeleteAsync` gated only behind
`alarm.acknowledge`; and `Clients.All` on every hub publish, which defeats all role/area/station
scoping.

**One further operator-facing divergence, added on re-verification:** the ACK-eligibility rule is
implemented twice and the two orders disagree. C# runs its gates first and consults the stored flag
last (`OpcCookieHelper.cs:96-106`: snapshot-feed → active → conditionName → `cookie <= 0` →
`opcAckWriteable`), while TypeScript short-circuits on the flag **second**
(`opcAckWriteable.ts:27-29`), ahead of those four gates. A stale `opcAckWriteable: true` on an alarm
that has since gone inactive or lost its cookie is **offered as ackable by the console and rejected by
the server**. Together with the `AlarmHub` payload never populating `opcAttributes`, the two halves of
this rule fail in opposite directions: the newest alarms cannot be acked at all, and some stale ones
appear ackable but are not.

**Two cross-cutting root causes account for most of the above:**

1. **`AmsDbContext.cs:71-106` `b.Ignore`s ten properties that live code reads after a DB load** —
   because `alarms.alarm_current` has 11 columns and the entity has 31. This single block is the origin
   of 8 of the 25 Critical+High findings.
2. **Alarm history is corrupted in both directions.** Real clears are never written
   (`KafkaConsumerService.cs:438-439` skips `ALARM_STATE_DELETE`), while every ACK writes a fake
   `state='CLEARED'` row. `cleared_time` is therefore never real, and MTTA/MTTR/fleeting-count are all
   derived from it.

---

## 11. Why testing did not catch this

Worth stating explicitly, because it explains how a system with six critical defects reports green:

- `ams-sims/sim_alarm_feed.py` validates only `ALARM_STATE_UPSERT` records and the Postgres projection.
  The ACK key-split bug surfaces in `live.alarms`, so the sim **passes green while the bug is live**.
- The E2E suite's DCS assertion is satisfied by `mock-dcs` returning `200 OK`.
- ~12 validation scripts assert on `raw-opc-events`, a topic deleted at startup — those gates pass
  vacuously or fail permanently.
- There are **zero tests** for any controller, the hub, the ACK workflow, the enricher, or any
  consumer. Every Critical and High finding sits in untested code.

---

## 12. Recommended next steps

Ordered by leverage. Steps 1–3 are prerequisites for trusting any further work.

**Immediate — correctness of what already exists**

1. **Reconcile `alarm_current` with `ActiveAlarm`.** Add the missing columns (or drop the properties)
   and remove the `b.Ignore` block. Highest single-fix leverage in the review — clears 8 of 25
   Critical+High findings, including BUG-001.
2. **Fix alarm history in both directions** — persist real clears, stop writing fake CLEARED rows on
   ACK. Every ISA-18.2 KPI depends on `cleared_time`.
3. **Remove `FloodDetectFilter`'s severity-≥950 drop.** It is unreachable on today's HTTP feed but
   fires the moment any source emits ≥950 — the simulators already do. It deletes exactly the alarms
   that matter most.
4. Fix BUG-004 (ack removes alarm from console) and the unshelve 400 — both are small, and both are
   visible to operators on every shift.

**Short term — make failure visible**

5. Add a Flink DLQ (side outputs on all four drop points) and a configured restart strategy. Today a
   poison message causes an infinite 1 s restart loop the supervisor counts as healthy.
6. Set `ASPNETCORE_ENVIRONMENT=Production` in the main compose so a crashed consumer stops being
   swallowed.
7. Close SEC-001, SEC-002, SEC-004 — these are small, contained changes.

**Decide, then build**

8. **Resolve the ingestion question.** There is no OPC client. Either bring `AMS.OpcGateway` into this
   repository, build the ingestion-service MQTT subscriber that is currently `"NotBuilt"`, or formally
   adopt the HTTP feed and document its contract. This is a product decision, not a bug.
9. **Decide what "DCS write-back" means for this product**, then either implement a real protocol
   client or relabel the current path honestly. Until then, `mock-dcs` should get a `profiles:` key so
   it cannot start by accident, and the E2E suite should stop treating a mock's `200 OK` as a passing
   DCS acknowledgement.
10. Fix the alarm-identity formulas (`AlarmKeys.java` vs `AlarmPartitionKeys.cs`) before anything
    depends on them. The mismatch is currently masked; the `alarm_id UNIQUE` constraint cannot catch it
    because the two formulas produce two different ids.

**Housekeeping**

11. Update `CLAUDE.md`, `architecture_document.md`, and `docs/ams-alarm-architecture.md` — they
    describe four components that do not exist, a StreamPipes tier that is absent, and the wrong ingest
    topic. Details in `12-documentation-drift.md`.
12. Repoint or delete the ~12 validation scripts that assert on `raw-opc-events`.
13. Add the six CI-assertable invariants proposed at the end of `10-bugs-and-issues.md` — chief among
    them: *no `Ignore`d domain property may be read after a DB load*, which would have caught the
    largest cluster of findings mechanically.

---

## 13. Confidence and limits

- Findings are marked **CONFIRMED** or **PLAUSIBLE (requires verification)** in `10-bugs-and-issues.md`.
  The adversarial reviewer refuted one candidate security finding rather than reporting it, which is
  the discipline the rest of the list was held to.
- **Unknown / Requires Verification:** what the endpoint at `192.168.1.51:8010` actually returns (not
  in the repo, no captured sample); whether the out-of-repo `AMS.OpcGateway` contains a real OPC stack;
  whether `AlarmReplayEngine` can submit at all given the JAR is bind-mounted rather than uploaded; and
  whether a real DCS endpoint would honour the `idempotency_key` the write-back relies on.
- This was analysis only. **No production code was modified.**
