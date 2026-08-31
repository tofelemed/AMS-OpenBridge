# Alarm Module — Decision Brief & Gap Register

**For:** product owner (decisions) and the developer building this module (scope + faults).
**Basis:** full code analysis of the alarm domain, 2026-08-25, commit `2886ccb`. Detail behind every
claim is in `docs/alarm-analysis/` files 01–12; this file is the decision layer only.

---

## Part 0 — Read this first (one page)

**What exists.** A genuinely good streaming spine: Flink state machine, correct projection semantics,
a no-loss IoTDB sink, JobManager HA, and an ACK command path whose seven hops all carry correlation
IDs. Roughly 60% of an alarm platform is real and working.

**What does not exist.** Both ends. There is **no OPC client anywhere in the repository** — alarms
arrive by HTTP-polling `192.168.1.51:8010`, an endpoint that is not in the repo and not reachable from
the lab. The DCS write-back terminates at a 20-line Python script that prints the request and returns
`200 OK`. The component that would talk to a real DCS (`AMS.OpcGateway`) lives on a different drive
(`e:\AMS - HMI GRID\...`) and is not in this repository at all.

**The one thing that breaks the most.** `alarms.alarm_current` has 11 columns; the domain entity has
31. So EF ignores 20 properties that live code still reads — the origin of **8 of the 25 Critical+High
defects**, including: *every projection update un-acknowledges the alarm.*

**Honest status against the ISA-18.2 pitch.** 3 of 8 lifecycle states implemented. No flood detection,
no chattering detection, no escalation, no alarm rationalization / master alarm database, no operator
audit trail, no NAMUR NE107 quality mapping. 59 defects: 6 Critical, 19 High, 17 Medium, 8 Low, plus
9 security findings.

**Why nobody noticed.** The E2E suite's DCS assertion is satisfied by a mock returning `200 OK`; the
simulator validates only the Postgres projection so it passes green while a live bug corrupts
`live.alarms`; ~12 validation scripts assert on `raw-opc-events`, a topic deleted at startup; and there
are **zero tests** for any controller, hub, ACK workflow, or consumer.

**The decision that gates everything else is D1 (ingestion) and D6 (write-back).** Until those two are
answered, effort spent on the middle of the pipeline is speculative.

---

## Part 1 — Decisions required

Each decision: the question, what it blocks, the options, and a recommendation. **⛔ = blocking**
(nothing downstream can be safely built until answered). **⚠️ = shapes scope**, decide before the
relevant sprint. Evidence is cited so the developer can verify rather than trust.

---

### A. Ingestion & edge — how do alarms actually get in?

**⛔ D1 — What is the production alarm source?**
*Blocks:* everything. The current path is unreachable in every shipped config.
*Evidence:* `AlarmIngestionService.cs:20-21`, `docker-compose.yml:705`, `appsettings.Production.json:4-5`.

| Option | What it means | Trade-off |
|---|---|---|
| **A. MQTT from an OT gateway** (Sparkplug B or plain topics) | Build the subscriber in `src/services/ingestion-service` — it already declares 4 profiles (`ot/alarms/#`, `ot/loops/#`, `ot/telemetry/#`, `prm/data/#`) with **zero subscribers**; its health endpoint literally reports `"NotBuilt"` (`Program.cs:88`) | Cleanest fit for the existing architecture. EMQX, Sparkplug decoder and the edge node already exist. Needs the OT gateway to publish alarms, which is a plant-side dependency. |
| **B. Direct HTTP poll of the DCS/historian** | Keep `AlarmIngestionService`, fix it, formalise the contract | Fastest. But polling loses event ordering and sub-poll transitions, and the current diff logic has three structural defects (below). Not viable for SOE. |
| **C. Native OPC-UA A&C / OPC A&E client** | Build or import a real protocol client | Only option that meets the "OPC A&E 1.10 compliant" claim in the product description. Highest effort; needs `AMS.OpcGateway` brought in-repo or rewritten. |
| **D. Sparkplug from edge nodes** | Extend `sparkplug-edge-node`, currently **egress only** (`AlarmMetricPublisher.java`) | Reuses existing infra but Sparkplug models process values, not alarm conditions — you'd be inventing an alarm encoding. |

**Recommendation: A (MQTT from OT gateway) as primary, B kept as a documented fallback for sites that
can only expose a REST endpoint.** A is the only option where most of the plumbing already exists and
the plant-side team owns the hard part. But this is a plant-integration decision, not a code decision —
answer it with the OT team, not the developer.

**⛔ D2 — If MQTT: what is the alarm payload contract?** Topic structure, field names, timestamp format
and timezone, condition/subcondition model, severity range, quality encoding, and whether the gateway
sends *state* (current snapshot) or *events* (transitions). The current pipeline's discriminator keys
off `root.has("alarmId") && root.has("state")` (`PipelineOperators.java:42`) — any new source must
either match that or the discriminator must be redesigned.

**⚠️ D3 — Snapshot-diff or event stream?** The existing ingestion diffs a snapshot in RAM. That design
loses every transition between polls and cannot support Sequence of Events. If SOE is in scope (D18),
the source must be event-based.

**⚠️ D4 — Who owns alarm configuration (limits, priorities, deadbands)?** Today nothing server-side
evaluates thresholds: `AlarmRulesConfig.tsx` makes zero API calls, has a disabled Save button, and a
self-declared *"Not functional yet"* banner. Either the DCS owns alarm generation entirely (AMS is a
consolidator only), or AMS needs a rule engine — which is a separate product.
**Recommendation: DCS owns generation. AMS consolidates.** Otherwise scope doubles.

**⚠️ D5 — Multi-site from day one?** The IoTDB path is hardcoded `root.ams.site1.` (so a second site
cannot be historised), the `server_id` column has the lab GUID as its **DEFAULT** in the live schema
(`35_alarm_current_identity.sql:41,49`), and the product description claims 74 sites. Decide now — this
is a schema and partitioning decision, expensive to retrofit.

---

### B. DCS write-back — does the operator's acknowledgement reach the plant?

**⛔ D6 — Is DCS write-back a product requirement, or is AMS read-only?**
*Blocks:* the whole ACK story, and the safety claim.
*Evidence:* `docker-compose.yml:413-445,718` (mock), `NoOpOpcDcsGateway.cs:19-29`, `Program.cs:108`.

| Option | What it means | Trade-off |
|---|---|---|
| **A. Read-only alarm consolidator** | Operators acknowledge *in AMS*; the DCS is never told | Honest, shippable now, removes an entire class of risk. But two ack states then exist in the plant, and operators must still ack on the DCS console. Must be stated explicitly in the product description. |
| **B. Real write-back over OPC-UA / A&E** | Bring `AMS.OpcGateway` in-repo or build a protocol client | Meets the original pitch. Significant work: no OPC library exists in this repo today. |
| **C. Write-back over a vendor REST/API** | Keep the current HTTP shape, point it at something real | Cheapest path to *a* real write-back if the DCS or its historian exposes an API. Requires the endpoint contract (D7). |

**Recommendation: decide A vs B explicitly and say so in the product description.** The current state —
claiming write-back while posting to a mock — is the single most misleading thing in the system. If the
answer is A or "later", **give `mock-dcs` a `profiles:` key so it cannot start by accident**, and stop
the E2E suite treating a mock's `200 OK` as a passing DCS acknowledgement
(`test-full-pipeline-e2e.ps1:104-108` lists it as a *critical* pass criterion).

**⛔ D7 — If write-back: what is the DCS-side contract?** Endpoint, auth (the current POST sends **no
authentication headers at all**), the ack addressing model (cookie/handle/sequence semantics), whether
it honours the `idempotency_key` the retry logic depends on, and what a *successful* ack looks like.
Today **any 2xx from any listener is recorded as `ACK_CONFIRMED`** with no body parsing and no
read-back (`HttpAckWritebackService.cs:126-132`).

**⚠️ D8 — Do shelve / suppress / out-of-service also write back?** Currently shelve calls
`NoOpOpcDcsGateway`, which logs and returns while the UI reports *"Alarm shelved successfully"*.
Suppress and OOS don't even attempt it. And none of the four publish anything to Kafka — **Flink never
learns an alarm was shelved.**

---

### C. Data model & identity

**⛔ D9 — Widen `alarm_current`, or narrow the domain model?**
*Blocks:* 8 of 25 Critical+High defects. **This is the highest-leverage single decision in the brief.**
*Evidence:* `AmsDbContext.cs:71-106` vs `02_alarm_schema.sql:37-50`.

Twenty properties are `b.Ignore()`d — including `Priority`, `Category`, `ConditionActive`, `AckTime`,
`AckedBy`, `AckComment`, `IsOutOfService`, `SuppressionReason`, `CustomAttributes` — while live code
reads all of them after a DB load. Consequences today: filtering by priority returns **HTTP 500**; the
hub emits `priority:"0"` and `activeTimeEpochMs` = year 0001; the API **fabricates** `AckTime = UtcNow`
on every read; and the ACK lifecycle is written into an unmapped field and silently discarded.

**Recommendation: widen the table.** Narrowing the domain model means deleting acknowledgement
attribution, which D28 (audit) almost certainly forbids.

**⛔ D10 — Which alarm-identity formula is canonical?** `.NET DeterministicAlarmId` and Flink
`AlarmKeys.stableAlarmId` **cannot ever agree** — verified empirically:

```
Flink  AlarmKeys.stableAlarmId(key)     -> 200857f7-7e97-0e79-066c-a810cf9613e5
C#     DeterministicAlarmId("v1|"+key)  -> 97985a3e-a11e-8636-b131-bb1139e1ccfa
```

Two independent causes: C# prepends `"v1|"`; and `new Guid(span)` is little-endian while
`new UUID(msb,lsb)` is big-endian. The comment at `AlarmPartitionKeys.cs:52` claiming they match is
false. Currently **masked** because the ingestor takes Flink's id verbatim — it goes live the moment
any producer omits it, and the `alarm_id UNIQUE` constraint cannot catch it because the two formulas
produce two different ids.

**⚠️ D11 — What is the dedup/identity key?** Today `serverId|source|condition|subCondition`. On the
HTTP feed `sourceName` degrades through `tag_name→asset→area→site→"HTTP Feed"`, so **distinct alarms
can collide onto one keyed state and one is silently dropped.** Confirm the tuple against the real
source (D2).

**⚠️ D12 — Is alarm history append-only?** Currently corrupted in both directions: real clears are
**never** written (`KafkaConsumerService.cs:438-439` skips `ALARM_STATE_DELETE`), while **every ACK
writes a fake `state='CLEARED'` row**. So `cleared_time` is never real — and MTTA, MTTR and the
fleeting-alarm KPI are all derived from it. The analytics screen currently counts every acknowledgement
as a fleeting alarm.

**⚠️ D13 — Schema management: SQL scripts or EF migrations?** Both exist. `database/scripts/` is live
but is **one-shot initdb only — no migration runner**, so a new `NN_*.sql` never reaches an existing
volume. The EF migration tree is stale and targets `active_alarms`, a table nothing uses; it is skipped
only because compose pins `Development`. **In a genuinely non-Development deployment, migrations would
build the wrong table and every alarm read would fail.**

---

### D. ISA-18.2 functional scope — what are we actually claiming?

**⛔ D14 — How many lifecycle states?** Three are implemented (NEW, ACTIVE, CLEARED). Grep-verified
absent from Flink: **RTN-Unacknowledged, Shelved, Suppressed-by-design, Out-of-Service, Latched.**
The most safety-relevant consequence: **an unacknowledged alarm that self-clears is deleted** and
vanishes before anyone sees it (`OpcEventStreamJob.java:138-141`) — a direct ISA-18.2 break.

**⚠️ D15 — Flood detection: build it, or drop the claim?** There is none, at any layer. What exists is
misnamed: `FloodDetectFilter` is `if (severity >= 950) return false;` — it **deletes the
highest-severity alarms** rather than detecting floods. The KPI is hardcoded `0`, `OnFloodAlert` has no
publisher, and `FloodAlertBanner` is dead code. Three layers each assume another does it. If built:
what window, what threshold? (Three inconsistent numbers are advertised today: 1.0, 2.0 and 10 per
10 min, on three different screens.)

**⚠️ D16 — Chattering / nuisance-alarm detection?** Not implemented. Note: 444 lines of real logic for
this — chattering detection, bad-actor ranking, ISA-18.2 alarm rate — already exist in
`database/procedures/alarm_operations.sql` and are **never deployed**, because only `database/scripts/`
is mounted. Cheapest win in the brief if the approach is acceptable.

**⚠️ D17 — Escalation of unacknowledged alarms?** Not implemented. The only `ACK_SLA_BREACH` producer
is `[Obsolete]` and unregistered; it defers to a Flink timer that does not exist. Consequence today:
**a stalled ACK sits at `ACK_DISPATCHED` forever**, behind a UI timer that counts up and never
resolves.

**⚠️ D18 — Sequence of Events: build or remove?** Currently **inert end to end** — `/soe` has no
publisher for its event source, its repository is a documented stub, `alarm_state_transitions` is a
hypertable nothing writes, and the page never fetches. It is a menu item that can never show data.
Note this depends on D3: SOE needs an event stream, not a snapshot diff.

**⚠️ D19 — Alarm rationalization / master alarm database?** Missing entirely. ISA-18.2 requires it. This
is a substantial sub-product (alarm registry, review workflow, priority assignment, documentation of
consequence and operator action) — treat as its own phase.

**⚠️ D20 — Quality model.** Quality is the literal `192` everywhere; no NAMUR NE107 mapping exists,
despite the project's own rule requiring Good/Uncertain/Bad/Maintenance/OutOfService.

**⚠️ D21 — Correlation and root cause?** The Flink operators named for this are pass-throughs that only
draw boxes in the Flink UI. `RootCauseMap` is hardcoded
`contains("CRUSHER"/"CONVEYOR"/"FEEDER"/"MOTOR")` string matching — not CEP, and no CEP dependency
exists. Downstream, `notification-service` receives these events with **zero overlapping field names**,
so every root-cause email is fully defaulted (empty equipment, 0 correlated alarms, 1970 timestamp).

---

### E. Reliability & operations

**⚠️ D22 — Exactly-once or at-least-once?** Documented as exactly-once; **is at-least-once.**
Checkpointing is `EXACTLY_ONCE` but every sink is `AT_LEAST_ONCE` and there are zero
`transactionalIdPrefix` occurrences in the repo. Duplicates are possible on every restart, including
duplicate `ack-writeback` commands. Pick one and make the code and the docs agree.

**⚠️ D23 — What happens to a message that cannot be processed?** **There is no Flink DLQ** — zero
`OutputTag`/`sideOutput` matches across the job tree. Every parse failure returns null and is dropped
with no log, no metric and no topic, **including malformed operator ACKs**. (The .NET DLQ is real; only
Flink is missing one.) `ack-writeback-dlq` is declared and never produced to, so failed write-backs
have nowhere to go.

**⚠️ D24 — Restart policy on poison messages?** No restart strategy is configured anywhere, so Flink's
default is effectively infinite: a poison message in `AlarmKpiStreamJob` (unguarded, NPEs on a missing
field) causes a 1-second restart loop that **the supervisor counts as healthy**.

**⚠️ D25 — Retention.** Alarm history is 730 days; IoTDB has its own TTL. Confirm against the
regulatory requirement — and note `alarm_history` has no unique business key, so redelivery duplicates
rows and inflates every KPI derived from it.

**⚠️ D26 — Which dead subsystems are removed vs finished?** `StateDriftDetectionJob` and
`AlarmReplayEngine` are never submitted and read topics nothing produces; four .NET consumers run
permanently idle against producerless topics; `raw-opc-events` is deleted at startup yet ~12 validation
scripts still assert on it. Each is either finished or deleted — leaving them is what makes the
architecture unreadable.

**⚠️ D27 — Deployment environment.** The main compose runs `ASPNETCORE_ENVIRONMENT=Development`, which
enables `BackgroundServiceExceptionBehavior.Ignore`: **a crashed alarm consumer is silently swallowed
while `/health/ready` stays green.** Swagger, CORS and detailed errors are also on.

---

### F. Security & compliance

**⛔ D28 — Is an operator audit trail required?** Almost certainly yes for ISA-18.2 record-keeping —
and **it does not exist.** ams-api produces nothing to `audit-events`; the mandatory shelve comment and
suppression reason are validated then discarded by EF; `shelving_actions` receives only `AUTO_EXPIRED`
rows. **There is no durable record of who acknowledged or shelved an alarm, or why.** Worse, the UI
fabricates one: `AlarmDetailPanel.tsx:331-384` renders an invented History tab with made-up timestamps
and asserted strings like *"Process variable recovered to acceptable range"*.

**⚠️ D29 — Who may acknowledge, shelve, suppress?** Policies exist but `alarm.view` guards **zero**
alarm read endpoints, and `soe.view` guards nothing anywhere. Meanwhile a plant-wide
`ExecuteDeleteAsync` of active alarms is gated only behind `alarm.acknowledge`.

**⚠️ D30 — Secrets.** `supersecurepassword123` is committed twice; IoTDB defaults to `root/root`; DCS
connection passwords are encrypted with the hardcoded key `"ams-dev-connection-key-32bytes!!"`; the
audit hash-chain salt falls back to `"default-development-salt"` and `AUDIT_SALT` is set nowhere.

**⚠️ D31 — Alarm visibility scoping.** Every hub publish also goes to `Clients.All`, so role, area,
station and server groups enforce nothing — a scoped viewer receives the full plant stream. Decide
whether per-area/per-role scoping is a requirement.

---

### G. Questions only the plant / customer can answer

Not answerable from the codebase. Get these before sizing anything.

1. Which DCS vendors and versions? OPC A&E, OPC-UA A&C, or a vendor API?
2. Is an OT gateway available, and can it publish alarms to MQTT? Who owns it?
3. Is acknowledgement-from-AMS a hard requirement, or may operators ack on the DCS console?
4. How many sites, servers and tags at go-live vs. target? (The description says 74 sites; the code
   supports one.)
5. Peak alarm rate, and expected flood magnitude?
6. End-to-end latency SLA from DCS event to operator screen?
7. Retention and regulatory record-keeping obligations?
8. Is there an existing master alarm database / rationalization record to import?
9. Who are the notification recipients, and on what policy? (Today: one hardcoded
   `ops-lead@plant.local`, area argument ignored, SMTP host empty.)
10. Availability target — does this need the HA path, or is single-node acceptable?

---

## Part 2 — Faults in the current system

Full detail in `10-bugs-and-issues.md` (59 defects) and `09-dead-code-and-hardcoded.md`. This is the
prioritised view.

### Critical — operator-visible or data-destroying

| # | Fault | Where |
|---|---|---|
| 1 | **Every projection update un-acknowledges the alarm.** Entity loads with `ConditionActive=false`, so the "re-activated" branch always fires. *The DCS event that confirms the ack is the one that destroys it.* | `AmsDbContext.cs:79`, `ActiveAlarm.cs:400` |
| 2 | **An external OPC ack is applied, then undone two lines later**, and the alarm drops off the active list | `NormalizedAlarmIngestor.cs:120-144` |
| 3 | **Alarms with severity ≥ 950 are silently deleted** — no log, no DLQ. Latent on today's feed (capped at 900); fires the moment any source emits ≥950, which the simulators already do | `PipelineOperators.java:371-382` |
| 4 | **Acknowledging an alarm removes it from the console** for up to 30 s | `AlarmHub.cs:390`, `alarmStore.ts:288` |
| 5 | **SignalR broadcasts before the DB commit** and re-broadcasts on retry, so a failed batch leaves Postgres holding rows every console has removed | `KafkaConsumerService.cs:307-310` |
| 6 | **Shelved/suppressed alarms are invisible everywhere**; `?isShelved=true` is unsatisfiable by construction. Shelving is an undocumented mute — ISA-18.2 §11 violation | `AlarmRepositories.cs:73`, `AlarmEnricher.cs:89` |

### High — broken features and wrong data

- **Every feed-originated lifecycle event is silently dropped** — the consumer requires a GUID, Flink emits the raw feed string (`LifecycleEventConsumerService.cs:57`). Its sibling consumer accepts the same ids fine.
- **`GET /alarms/active` returns HTTP 500** when filtered or sorted by `priority` or `category`.
- **Unshelve always returns 400** — the frontend omits the required `reason` field.
- **SignalR-delivered alarms cannot be acknowledged** — the hub never populates `opcAttributes`, so the write-guard rejects them. The *newest* alarms are the ones an operator can't ack.
- **Conversely, some alarms the console offers as ackable are rejected by the server** — the eligibility rule is implemented twice with different evaluation orders (`OpcCookieHelper.cs:96-106` vs `opcAckWriteable.ts:27-29`).
- **One bad event DLQs an entire 100-event batch**, as does two events for the same new alarm in one batch.
- **The historical query silently ignores `serverId`, `priority` and `category`**, and stamps every row with one hardcoded server GUID.
- **`AlarmIngestionService` loses clears across restarts** (RAM-only baseline, never pruned) → permanent ghost alarms; and a malformed feed response parses to an empty list that **synthetically clears every tracked alarm**.
- **A missing severity promotes an alarm to CRITICAL** (`Priority` is a non-nullable `int` → 0 → `<=1 => CRITICAL`).
- **Alarms are delivered 2–3× to every client** (`Clients.All` plus two groups).
- **The gateway's 4 KB ACK body limit never fires** — it matches `/api/alarms`; the real route is `/api/v1/alarms`.
- **Operator ACKs fail *closed* when Redis is down** while reads fail open — the alarm list keeps updating while every acknowledge returns 429.

### Fabricated data shown to operators as fact

| What | Where |
|---|---|
| The entire alarm **History tab** — invented timestamps, asserted strings | `AlarmDetailPanel.tsx:331-384` |
| `ackTime` = `UtcNow` on every read — two polls report two different ack times for an untouched alarm | `AlarmEnricher.cs:95` |
| Shelved/suppressed/OOS counts hardcoded `0`; `qualityGood` hardcoded `true`; `category` hardcoded `Process` | `AlarmEnricher.cs:49-52,83-92` |
| Flood status permanently `false` — the EEMUA-191 annunciator can never fire | `AlarmEnricher.cs:52` |
| OPC server status hardcoded `"Connected"`, never probed | `AdminOpcServersController.cs:27-39` |
| `alarmsPerShift = total24h / 2`; `oldestStandingDurationMs = 0 // simplified for demo` | `Analytics.tsx:36`, `AlarmKpiStreamJob.java:168` |

### Hardcoded values that will break another deployment

| Value | Impact |
|---|---|
| `192.168.1.51:8010` compiled in as **both** feed URL and ACK write-back fallback | An unconfigured deployment polls a stranger's LAN box and **POSTs operator acknowledgements to it**. Also shipped in `appsettings.Production.json:5`. |
| Lab GUID `f0af9a6d-…` as the `server_id` **column DEFAULT** *and* the frontend's visibility allowlist | An admin-API error is indistinguishable from "no servers" (`catch { return []; }`) — **the console renders zero alarms while looking healthy** |
| `e:\AMS - HMI GRID\...` absolute path to the OPC Gateway | The component that talks to the DCS cannot be built from this repo |
| Station `'CCR-01'` hardcoded on unshelve; ack comment auto-filled | Corrupts what little audit data exists |
| `root.ams.site1.` in the IoTDB path | A second site cannot be historised |

### Dead code and misleading artefacts

`AlarmCommands.cs` is 943 lines of which **406 are comments**, `:505-943` being a wholesale
commented-out duplicate of its own live handlers. All 10 domain events are collected and never
dispatched — no dispatcher exists. Six SignalR methods are declared and never invoked. Four DB tables
are dead; six schemas are created with zero tables. `alarm_operations.sql` holds 444 lines of real
ISA-18.2 logic that is never deployed.

**Documented components that do not exist in `src/`:** `AlarmStreamProcessorService`, `NotificationHub`,
`OpcAeRawEventIngestService`, `AckFlinkBridgeService`, and the entire StreamPipes tier that
`architecture_document.md` calls the "sole telemetry authority". `CLAUDE.md:23` also tells every
developer to ignore a directory that no longer exists.

> **Note for the developer:** there are **zero** `TODO`/`FIXME`/`HACK` markers in the alarm code, and no
> fabricated numeric process data. The gaps are marked with `NoOp…`, `Stub…`, `mock-…` and hardcoded
> returns instead — which is exactly why they read as finished features. Do not trust a name.

---

## Part 3 — Suggested build order once decisions land

**Phase 0 — Stop the bleeding (no decisions needed, ~1 sprint).** Fixes 1, 4, 6 above and the unshelve
400; remove the severity-≥950 drop; set `ASPNETCORE_ENVIRONMENT=Production`; give `mock-dcs` a
`profiles:` key; close the three security items (SSRF + destructive write, hardcoded crypto key,
plant-wide delete).

**Phase 1 — Data model (needs D9, D10, D12, D13).** Widen `alarm_current`, remove the `b.Ignore` block,
delete the fabricated `AlarmEnricher` fields, fix history in both directions, pick one schema tool and
add a migration runner. Clears 8 of 25 Critical+High findings and unblocks audit.

**Phase 2 — Ingestion (needs D1–D5).** Build the chosen source. If MQTT, finish `ingestion-service`.

**Phase 3 — Make failure visible (needs D22–D24, D27).** Flink DLQ side-outputs on all four drop points,
a configured restart strategy, and real metrics. Then add tests — every Critical and High finding above
sits in untested code.

**Phase 4 — Functional scope (needs D14–D21).** Whichever of shelving semantics, flood, chattering,
escalation, SOE and rationalization survive the scope decision.

**Phase 5 — Write-back (needs D6–D8), or formally drop it.**

---

## Part 4 — What we could not determine from code

Mark these as unknown rather than assumed:

- What the endpoint at `192.168.1.51:8010` actually returns — not in the repo, no captured sample.
- Whether the out-of-repo `AMS.OpcGateway` contains a real OPC stack. (`.env.example:75` says
  *"QuickOPC removed — gateway cannot publish raw-opc-events"*, which suggests it may not.)
- Whether `AlarmReplayEngine` can submit at all, given the JAR is bind-mounted rather than uploaded.
- Whether any real DCS endpoint would honour the `idempotency_key` the retry logic depends on.
