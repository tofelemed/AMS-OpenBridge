# Flink Jobs Fleet Audit — All Pipelines

**Date:** 2026-09-01 · **Companion:** [audit.md](audit.md) (CPLM Short Feature Engine deep-dive) · **Scope:** the other 11 running Flink jobs + 2 non-running classes, their Kafka topics, backend consumption (ams-api, cplm-api, services), and UI delivery.

---

## 0. Executive summary

**All 12 jobs are RUNNING with zero restarts, checkpoints healthy — but roughly half of the fleet's output never reaches a user, and several live paths corrupt data on the way.** The pattern across pipelines is consistent: Flink-side computation is real and mostly sound; the losses happen at the seams — deserialization mismatches, dead consumers, unkeyed sinks, stores written but never rendered.

**Top findings (full detail in the sections below):**

1. **Every operator ACK corrupts the live alarm.** The `ACK_STATE_UPDATE` record hardcodes `severity=100, priority="LOW"`, omits `conditionActive`; `LiveStateJob` doesn't branch on `eventType`, so an ACK downgrades a CRITICAL alarm on the HMI live plane until the next real state event. ([OpcEventStreamJob.java:294-298](src/flink/src/main/java/com/ams/flink/OpcEventStreamJob.java#L294), `LiveStateJob.java:142-146`)
2. **Every Flink-emitted lifecycle event is silently discarded by ams-api** — `LifecycleEventConsumerService.cs:57` requires a GUID `alarmId`, Flink passes the feed correlation string (`BB26-BF402|Alarm high`). No log, no metric, no DLQ.
3. **ACK lifecycle state is never persisted** — written into `CustomAttributes`, which `AmsDbContext.cs:102` ignores; the DTO omits it too, so the ACK column resets to `—` on every refresh/poll. Ack time is fabricated as `DateTimeOffset.UtcNow` on read (`AlarmEnricher.cs:89-101`).
4. **One malformed timestamp on any of the 3 CPLM result topics halts all three evidence streams forever** (shared consumer loop, 2 s retry, offset never stored) — `CplmResultConsumerService.cs:144,152-157,512-518`.
5. **A feed schema change wipes live alarms plant-wide**: `AlarmIngestionService.ParseResponse` swallows parse errors → empty list → synthetic `CLEARED` published for every known alarm (`AlarmIngestionService.cs:128-137,263,273`).
6. **ISA-18.2 violation:** unacknowledged return-to-normal alarms are deleted from `alarm_current` (must remain visible); the state machine is 2-state ACTIVE/CLEARED — no RTN-UNACK, no SHELVED/SUPPRESSED transitions (`PipelineOperators.java:239-248`).
7. **The Historical Viewer is largely broken:** rows serialize snake_case, the mapper reads camelCase (blank Source/Condition/State columns); the `state` filter compares values that are never written; priority/category/serverId filters are accepted and ignored; "Export Transitions" always downloads an empty file (`alarms.alarm_state_transitions` has no writer).
8. **Loop KPI + State Drift are running-but-inert**: submitted only by `stabilize-ams-e2e.ps1` (not the supervisor — they die permanently on JM restart), consuming topics **with no producers** (verified live: 0 messages), feeding consumers → hubs → stores that no UI reads. Four independent dead links per chain.
9. **Gate Fusion's short-feature source is dead code**: the long job always embeds `alignedShort`, so fusion's fallback ladder never fires — yet fusion consumes the whole `feature.short.v1` topic from earliest into checkpointed MapState that is never read (supersedes audit.md F-3).
10. **Replay verdicts are systematically stronger than streaming verdicts** for the same window: replay skips `applyPersistence` (no 0.54 cap) and resamples onto a hardcoded 5 s grid; profile resolution depends on which TaskManager JVM the batch lands in.

**Live snapshot (2026-09-01):** 12/12 jobs RUNNING, 0 exceptions. Alarm topics all at offset 0 (no alarm feed active in the lab; the deadman watchdog correctly emitted 2 CRITICAL `TELEMETRY_STALLED` alerts). Hot topics: `loop.samples.v1` 107k, `live.loop.metrics` 198k (keyed ✔). `ams` DB retains 3,195 current / 7,151 history alarms from prior runs. **`traverse.ingestion.ot-dlq` holds 54,244 messages — 100 % `LOOP_NOT_REGISTERED` for the sim's sentinel `FIC99999`, flooding since Aug 31** and burying any real DLQ signal.

---

## 1. Fleet inventory & supervision matrix

| Job (display name) | Class | Supervised¹ | Input → Output | Output consumed | Reaches UI |
|---|---|---|---|---|---|
| AMS - Alarm State Machine | `OpcEventStreamJob` | ✔ | raw-alarms (+operator-actions, ack-results) → current-alarm-state ᵏ, lifecycle-events, ack-writeback, root-cause-events | ✔ ams-api projection, notification-service | ✔ alarm console (via SignalR) |
| AMS - Live State RBE | `LiveStateJob` | ✔ | current-alarm-state → live.alarms ᵏ, live.alarm.metrics ᵏ | live.alarms → sparkplug → MQTT ✔ · **live.alarm.metrics → nobody** | ✔ MQTT live tab |
| AMS - IoTDB Alarm Persistence | `IoTDBPersistenceJob` | ✔ | raw-alarms → IoTDB `root.ams.site1.alarms.*` | ✔ historian-bff, binding-resolver | ✔ trends |
| AMS Alarm State Export Engine | `AlarmStateExportJob` | ✔ | current-alarm-state → flink.state.alarm.delta (unkeyed!) | ams-api → ObservabilityHub | ❌ **no hub client** |
| AMS - Alarm KPI Engine | `AlarmKpiStreamJob` | ✔ | lifecycle-events → kpi-alarm-rates, kpi-standing-snapshots ᵏ | ams-api KpiConsumerService | ❌ **store field never read** |
| AMS - Loop KPI Engine | `LoopKpiStreamJob` | ❌ ps1-only | **loop-raw-data (NO PRODUCER)** → loop-kpis-5m | consumer idles at EOF | ❌ dead ×4 |
| AMS State Drift Detection | `StateDriftDetectionJob` | ❌ ps1-only | **events.raw + state.active (NO PRODUCERS)** → state.drift.alerts | ams-api → ObservabilityHub | ❌ dead ×4 |
| AMS - Analysis Execution Engine | `AnalysisExecutionJob` | ✔ | analysis.executions → analysis.results | ✔ analysis-service → Postgres+Redis+asset-model | ❌ **no frontend caller** |
| AMS - CPLM Short Feature Engine | `CplmShortFeatureStreamJob` | ✔ | *(see [audit.md](audit.md))* | ✔ | ⚠ Window Inspector only |
| AMS - CPLM Long Diagnostics | `CplmLongDiagnosticsStreamJob` | ✔ | loop.samples.v1 → feature.long.v1 (unkeyed) | ✔ cplm-api | ⚠ 10 typed cols; ~60 fields JSONB-only |
| AMS - CPLM Gate Fusion Engine | `CplmGateFusionStreamJob` | ✔ | feature.long.v1 (+dead short source) → gate.results.v1 (unkeyed) | ✔ cplm-api + event frames | ✔ gate matrix pages |
| AMS - Loop Live RBE Engine | `LoopLiveRbeJob` | ✔ | loop.samples.v1 → live.loop.metrics ᵏ | ✔ sparkplug-edge-node → MQTT | ✔ `useLoopLive` |
| *(not running)* legacy monolith | `CplmGateStreamJob` | — | **no submit path exists — verified safe** (excluded everywhere; sim guard asserts absence) | — | — |
| *(on-demand batch)* replay | `CplmHistoricalReplayJob` | — | loop.samples.v1 (filtered) → gate.results.v1, `source=flink-historical-replay` | ✔ coexists via upsert key | ✔ CpmReplay |

¹ `flink-job-supervisor.sh` (60 s loop, 10 jobs). "ps1-only" = submitted by `scripts/stabilize-ams-e2e.ps1` via stack startup — **not resubmitted after a JobManager restart**; the marun compose puts the supervisor behind a `lab-alarm` profile, so a prod deploy without it self-heals nothing. ᵏ = keyed sink.

**Prior-review status:** `DeliveryGuarantee.NONE` — fixed (all sinks AT_LEAST_ONCE). Upsert index — fixed (`35_alarm_currentidentity.sql`). **Flink-side DLQ — still absent**: ~12 silent-drop points across the alarm jobs; `raw-alarms-dlq` is written only by the .NET projection consumer.

---

## 2. Alarm core (state machine → live/export/persist)

**The state machine itself** (`OpcEventStreamJob` + `PipelineOperators`): per-record keyed pipeline, no windows/watermarks; dedup → enrich → lifecycle → flood-filter → 4 sinks. Checkpoint 30 s EXACTLY_ONCE; compacted `current-alarm-state` correctly keyed. ACK round-trip (operator-actions → ack-writeback → mock-DCS POST → ack-results → ACK_STATE_UPDATE) is fully traversable, with offset-after-publish discipline in `HttpAckWritebackService`.

| # | Finding (severity) | Where |
|---|---|---|
| A1 | **ACK stub corrupts live plane** (crit — see summary #1). Fix: branch on `eventType` in LiveStateJob/AlarmStateExportJob, or emit full state on ACK. | `OpcEventStreamJob.java:278-314` |
| A2 | **Export job never emits REMOVE for real deletes** — looks for `action=="delete"` (never written) or `cleared&&acked`; the actual marker is `eventType=ALARM_STATE_DELETE` with `acknowledged=false` on unacked clears → UPDATE instead of REMOVE + unbounded keyed state. | `AlarmStateExportJob.java:114-120` |
| A3 | **First-seen/repeated CLEAR emits `lifecycleState=ACTIVE, transitionType=NEW`** (prev-state null branch ignores `conditionActive`). | `PipelineOperators.java:239-248` |
| A4 | **FloodDetectFilter silently deletes severity ≥ 950 events** — no DLQ/side-output/metric; they never reach Postgres or the UI. | `PipelineOperators.java:377-379` |
| A5 | 2-state ISA-18.2 model; unacked RTN deleted from `alarm_current` (summary #6). | `PipelineOperators.java:239-248`, `NormalizedAlarmIngestor.cs:25-29` |
| A6 | Export sink unkeyed on a keyed stream (per-alarm delta order lost); poison JSON in export = restart loop (unguarded `readTree`); new `ObjectMapper` per record in key selector. | `AlarmStateExportJob.java:61-68,84,110` |
| A7 | `latest()` offsets on both `current-alarm-state` consumers → cold-start skips the whole compacted state; HMI empty until each alarm changes. Also 3-way `RAW_ALARMS_STARTING_OFFSETS` drift across submitters (earliest/committed/committed). | `LiveStateJob.java:57`, `AlarmStateExportJob.java:48`, `docker-compose.yml:670,1524` |
| A8 | No TTL on any keyed state (dedup ×3, RBE fingerprints ×2, export prev-state) — RocksDB grows per alarm key forever. Missing `uid()` on several sinks/sources breaks savepoint restore. | `PipelineOperators.java:116-118`, `LiveStateJob.java:125,199` |
| A9 | `lifecycle-events` carries two incompatible schemas (main path: no `eventType`, has `transitionType`; ack path: the reverse). `live.alarm.metrics` has no consumer. Dead KPI branch serializes every record to nothing (`OpcEventStreamJob.java:124-129`). Hardcoded CRUSHER/CONVEYOR taxonomy + wall-clock `eventTime` in root-cause events. | `PipelineOperators.java:298-332,400-411` |
| A10 | **IoTDB alarm tree (`root.ams.site1.alarms.*`)**: TTL init runs via `run_sql()` ending `\|\| true` and the verification gate only asserts the loop DB — a failed alarm-tree TTL exits 0 silently → unbounded growth on that tree only. Path sanitization (`[^a-zA-Z0-9_]→'_'`) agrees across Flink/binding-resolver/FE (good), but alarm IDs are `SOURCE\|Condition`, so IDs differing only in punctuation collapse onto one device (Flink logs, doesn't prevent), and the `root.ams` prefix is hardcoded in 3 uncoordinated places — repointing a site requires a Flink rebuild. The only alarm-history-from-IoTDB UI is `/iotdb-trend` via historian-bff, independent of ams-api. | `infra/docker/iotdb-init-ttl.sh:48-102`, `IoTDBPersistenceJob.java:36,91-134`, `iotdbPaths.ts:16,47` |

---

## 3. Backend + UI consumption of the alarm pipeline (ams-api / frontend-ob)

10 background consumers, all enabled unconditionally except the ingest poller (`AlarmIngestion:Enabled`, on in compose) and IoTDB (`IotDb:Enabled` default-on). Projection consumer (`NormalizedAlarmConsumerService`) is the healthy exemplar: manual commits, batch, retry→DLQ, metrics. Everything else degrades from there.

| # | Finding (severity) | Where |
|---|---|---|
| C1 | **Flink lifecycle events all dropped** (crit — GUID parse; summary #2). | `LifecycleEventConsumerService.cs:57` |
| C2 | **ACK lifecycle unpersisted + unhydrated** (crit — summary #3); DTO hardcodes shelve/suppress/ack metadata to null; stats hardcode `Shelved:0, Suppressed:0, AlarmsPerTenMin:0, FloodActive:false`; shelving an alarm **removes it from the console** (unmapped `ConditionActive=false` → treated as cleared). | `AmsDbContext.cs:71-106`, `AlarmEnricher.cs:49-105`, `alarmStore.ts:292-295` |
| C3 | **Ingest poller silent-wipe** (crit — summary #5). | `AlarmIngestionService.cs:114-137,263-273` |
| C4 | **Historical Viewer**: snake_case/camelCase mismatch (blank grid columns); `state` filter values never written (`UNACKNOWLEDGED_UNCLEARED` vs stored `ACTIVE/ACKNOWLEDGED/CLEARED`); priority/category/serverId params dropped from SQL; `server_id` hardcoded to the HTTP-feed GUID. | `AlarmRepositories.cs:168-292`, `alarmMappers.ts:95-116` |
| C5 | **`alarms.alarm_state_transitions`**: hypertable + retention + 2 endpoints + export button, **no writer anywhere**. Same for `alarms.historical_alarms`. | `AlarmTransitionRepository.cs`, `39_timescale_policies.sql:69,80` |
| C6 | **Dead SignalR surface**: `OnBulkAlarmsUpdated`/`OnFloodAlert`/`OnServerStatusChanged` have zero publishers (FloodAlertBanner can never render); `OnSoeEvent`/`OnAnalyticsUpdate` have no publisher method at all (SoE panel + Live-Events SignalR tab permanently empty); entire ObservabilityHub (drift/delta/replay) has no frontend connection. `loopKpis`/`alarmKpis` store fields written, never read. | `AlarmHub.cs:127-160`, `alarmStore.ts:536-564,715-718` |
| C7 | EEMUA/Analytics page: 7 KPIs (`peakAlarmRate`, `timeInFloodPercent`, `meanTimeToAckSec`, …) never returned by `AnalyticsController` → render `—`; the controller re-derives KPIs from SQL, fully duplicating (and diverging from) the Flink KPI engine. | `AnalyticsController.cs:20`, `Analytics.tsx:95-184` |
| C8 | **No consumer-lag/liveness health for any of the 10 consumers** — `/health/pipeline` tracks only Flink's groups; a wedged projection consumer is invisible. `KpiConsumerService` has no error backoff (tight-spin on persistent failure). | `PipelineHealthService.cs:187-192`, `KpiConsumerService.cs:75-83` |
| C9 | Duplicated hub fan-out (`Clients.All` + priority group + server group) — SPA receives each alarm twice; only the sound-guard prevents double annunciation. Dead Kafka config: 8 topic settings with zero references; `AckWritebackDlqTopic` never used. `shelved_by` Guid?→VARCHAR mapping. NoOp OPC gateway means **shelve performs no DCS suppression** while returning success. | `AlarmHub.cs:298-312`, `KafkaConsumerService.cs:31-43`, `Program.cs:108` |

---

## 4. KPI / drift / analysis jobs

| # | Finding (severity) | Where |
|---|---|---|
| K1 | **Loop KPI chain quadruple-dead** (crit): input `loop-raw-data` has no producer (live: 0 msgs; real samples on `loop.samples.v1` — and the parser expects legacy `{tagId,timestamp}`, so even repointing yields 100 % silent drops); unsupervised (ps1-only); output consumer feeds an unread store field. **Retire or rebuild — resubmitting under supervision just makes an idle job idle more reliably.** Pending decision doc: `docs/plans/STR-08-job-decisions.md`. | `LoopKpiStreamJob.java:36-53`, `RawLoopData.java:26-31` |
| K2 | **State-drift chain equally dead** (both inputs producerless, hub has no client) **and the job has no checkpointing** — offsets never commit, `latest()` on restart skips everything, state lost on failover. Both sources share one group id across two topics. | `StateDriftDetectionJob.java:24-51` |
| K3 | **Standing-alarm KPI is numerically meaningless**: `latest()` offsets + ValueState from 0 → count resets on every submit then drifts; `oldestStandingDurationMs` hardcoded 0; one output record per input event to a compacted single-key topic. | `AlarmKpiStreamJob.java:46,140-168` |
| K4 | **NPE crash path**: `node.get("lifecycleState").asText()` unguarded in the standing tracker — one malformed lifecycle event restart-loops the KPI job. | `AlarmKpiStreamJob.java:153` |
| K5 | Alarm-rate branch OK (sliding 10m/1m, `windowAll` — parallelism-1 by design) but: no `withIdleness` (4-partition input; one idle partition freezes the window forever), no allowed-lateness/side-output. `KpiConsumerService` also subscribes to `kpi-bad-actors`/`kpi-health-scores`, whose producing branches are unreachable dead code. | `AlarmKpiStreamJob.java:52-77`, `AlarmKpiResult.java:47-52` |
| K6 | **Analysis Execution is the only fully-live chain** (REST → Kafka → Flink eval → Postgres + Redis snapshot + asset-model registration) — **but no UI ever triggers or displays it**; only an e2e script exercises it. AT_LEAST_ONCE checkpoint mode (sole deviation). | `AnalysisExecutionJob.java:39`, `AnalysisResultConsumer.cs:72-136` |
| K7 | Submission-tooling defects: `Test-AmsFlinkJobHealthy` returns healthy on curl failure; the ps1 path builds a fresh JAR on the host then submits the *stale image-baked* JAR (no `docker cp` sync, unlike `ensure_flink_jobs.py`). | `AmsFlinkJob.ps1:39,163`, `stabilize-ams-e2e.ps1:24-28` |

---

## 5. CPLM long diagnostics / gate fusion / replay / live RBE

Long job: rolling 24h+10min ListState buffer per loop, 15-min event-time timers emitting 4h/12h/24h slices (min 32 samples), gates 5–11 (ACF, band-limited O(n²) DFT, triangularity, Horch, per-cycle shoelace geometry, saturation, sensor health) with an embedded recomputed short-feature block. Fusion: keyed co-process, fires on 12h/24h long records only, gates 12–15, family selection with priors/persistence (2-of-3, 0.54 cap), NO_VP confidence cap 0.89. Replay: bounded BATCH over the live samples topic filtered by loop, 24h tumbling with learned offset, results tagged `flink-historical-replay` (event frames correctly ignore them). RBE: the model citizen — keyed sink, producer timeout bounds, first-observation-emits.

| # | Finding (severity) | Where |
|---|---|---|
| L1 | **Fusion's short source + fallback ladder are dead code** (summary #9): `alignedShort` always present → ladder never fires → whole `feature.short.v1` consumed from earliest into never-read MapState. Supersedes audit.md F-3 (10m/30m blindness real but moot). No TTL/freshness on `shortByKind`/`familyHistoryByKind` either. | `CplmGateFusionStreamJob.java:127-142` |
| L2 | **Gate results + long features are unkeyed across 8 partitions** while `CplmEventFrameService` is order-sensitive (open/extend/close sequence per loop) — interleaved 12h/24h verdicts can reopen closed frames or mis-ratchet `peak_confidence`. `attachKeyed` exists (RBE uses it). | `CplmKafkaSink.java:14-40`, `CplmEventFrameService.cs:142-197` |
| L3 | **Replay ≠ streaming, presented identically** (summary #10): skips `applyPersistence` (C-F1); hardcoded 5 s evaluation grid resamples the window (C-F7); profile from a static JVM map populated by co-resident streaming jobs — slot-placement-dependent (C-F3); `windowKind` hardcoded 24h so a recompute never refreshes 12h; UI invalidates KPI caches that replay never writes. | `CplmHistoricalReplayJob.java:37,130-135`, `CplmRecomputeService.cs:185-205`, `useCpm.ts:299-308` |
| L4 | **Silent insufficiency**: a 10–31-sample slice emits nothing — no record, no reason; readiness counts long rows but never turns `evidence_long` into a check. | `CplmLongDiagnosticsStreamJob.java:143-175`, `CpmReadinessController.cs:182-192` |
| L5 | **Structurally-constant fields rendered as measured**: `effort_ratio_normalized` always 0 on gate results (`fromJson` never parses it back); `/calculations` versions always null (snake_case filter vs camelCase payload); `long_metrics_qualified` on long `/kpis` always TRUE (key only exists on gate payloads); long `expected_sample_count` always NULL. | `CplmShortFeatureResult.java:139 vs 158-217`, `CpmEventsController.cs:164-170`, `CpmAnalyticsController.cs:201-208` |
| L6 | **Long tier: 10 typed columns, ~60 payload fields with no endpoint projection** (`gate5..11_status`, `validated_period_s`, `spectral_entropy`, `pv_drift_per_day`, `sat_cycling_pattern`, …) — reachable only via the fused 12h/24h `metrics{}`; the 4h slice has **no** API path at all (also consumed-and-discarded by fusion, B-F9). Long-tier analogue of audit.md B-1/B-2. | `CplmResultConsumerService.cs:319-322` |
| L7 | RBE: single absolute deadband (0.05 EU) for all loops/metrics/units — never consults the per-loop engineering ranges the profile system already carries; `latest()` offsets + no checkpoint retention contradict the house rule the ingest pipeline documents; `"null"` mode string publishable; DBIRTH advertises only the first-seen metric (Sparkplug-spec-invalid for third parties); job is a *blocking* readiness dependency though it contributes no gate evidence. | `LoopLiveRbeJob.java:61-85`, `AlarmMetricPublisher.java:387-405`, `CpmReadinessController.cs:45-57` |
| L8 | Poison-pill (summary #4) applies to all three CPLM result topics, not just short. `gate10_status` re-derived consumer-side against a hardcoded 0.05 threshold that can disagree with the profile; `dynamics_class` vs `dynamic_class` both still emitted on the long topic; `--window-hours` accepted-and-ignored by every submitter; event-frame `DO UPDATE` never refreshes `dynamics_profile_version`; `mirrored_alarm_id` is a pure stub (alarm mirroring unimplemented). | `CplmResultConsumerService.cs:512-518`, `CplmLongDiagnosticsResult.java:184-301`, `CplmEventFrameService.cs:171-197` |
| L9 | Doc-drift cluster: RBE Javadoc says "NOT in supervisor" (it is, and blocking); replay Javadoc claims a dedicated per-replay topic (it's the live topic, filtered); two submitters justify fusion ordering with an offsets policy the code doesn't use; state-size estimate predates per-sample profile attachment (real state is multiples); compose comment says "six core jobs"/"no JM HA" (ten; HA exists); legacy monolith safe but still shipped in the jar with no `RequiredJobs` alarm if hand-submitted. | refs in agent findings §A/§B/§C/§E |
| L10 | **Legacy monolith footgun on dev machines**: the git-ignored `CPA/CPAMAIN/` intake tree (invisible to review and normal grep) carries a **prebuilt jar containing `CplmGateStreamJob.class`**, a runnable second supervisor script, and the upstream `FlinkDeployService.cs` that submitted it (`CplmGateEntryClass`, "cplm-gate" case) — the port deliberately dropped that service, so the "would double-produce gate results" warnings in the submit scripts guard a capability that genuinely existed one generation back. A hand-run `flink run -c com.ams.flink.cplm.CplmGateStreamJob` produces a second writer on `gate.results.v1` under the same `source='flink'` upsert key; the only detection surface is `/pipeline-status`'s `unexpectedJobs`, which nothing alarms on. Mitigation: alert on `unexpectedJobs`, and/or exclude the class from the shaded jar. | `CPA/CPAMAIN/src/backend/AMS.Api/Services/FlinkDeployService.cs:24,109,422`, `CpmReadinessController.cs:45-57,241` |

---

## 6. Cross-cutting themes

1. **Unkeyed sinks are the fleet default** — only `current-alarm-state`, `kpi-standing-snapshots`, `live.alarms`/`live.alarm.metrics`, and `live.loop.metrics` are keyed. Everything order-sensitive downstream (event frames, fusion history, delta export) rides round-robin partitions.
2. **No Flink-side DLQ anywhere**; silent drops at ~12 alarm-path points + flood filter + RBE/long parse filters. The one real DLQ (`ot-dlq`) is flooded by a permanent test tag.
3. **Offsets policy is inconsistent** (`latest` vs `committed/EARLIEST` vs `earliest`) across jobs and even across submitters of the *same* job — each divergence is a replay-or-gap bug on restart.
4. **Dead-end delivery**: 6 of 12 running jobs produce output no user ever sees (export, alarm-KPI, loop-KPI, drift, analysis, live.alarm.metrics). The waste isn't compute — it's the misleading impression of a working feature.
5. **Two submission universes** (bash supervisor/py vs PowerShell one-shots) with different job lists, different JARs, and different offset args; prod (marun) can end up with zero supervision.
6. **Doc/Javadoc drift is endemic** — 15+ confirmed instances; several previously-recorded audit claims were themselves stale (Loop KPI "never submitted"; fusion "latest()" rationale).
7. **State hygiene**: no TTLs on any keyed state; several missing `uid()`s block savepoint upgrades (STR-11).

---

## 7. Recommended remediation order

> **Implementation status (2026-09-01, same day):** executed as Phases D–J, each validated against the live stack.
> **D (ACK/lifecycle)** — ACK stub merge in LiveStateJob/AlarmStateExportJob (validated: post-ACK live record keeps severity 800/HIGH), real `ALARM_STATE_DELETE` → REMOVE (validated: INSERT→UPDATE→REMOVE keyed delta sequence), lifecycle consumer accepts string alarm keys + skips state-transitions deliberately, ack lifecycle persisted (script 50: `custom_attributes`/`ack_time`/`acked_by`/`ack_comment` + EF mapping + DTO/hub; validated: `ACK_CONFIRMED` + real ack_time survive REST rehydrate), committed offsets + 7-day state TTLs on both consumers of the compacted state topic.
> **E (Historical Viewer)** — camelCase row contract + derived priority (validated live), state filter maps to the stored vocabulary (validated: 7038/71/44 match the DB exactly), priority filter now in SQL (6,201 HIGH rows), phantom transitions-export button removed.
> **F (safety/honesty)** — ingest-poller parse failure = "no data" not "all clear"; BE-1/2/3 fixed (validated: versions 3.0.0/2.0.0 served, `long_metrics_qualified` honestly false on thin windows, `expected_sample_count` 8640) + a pre-existing 500 on `/cpm/calculations` (SRF-with-DISTINCT) found and fixed; FIC99999 throttled to one probe/5 min (takes effect on next sim start); B-F7 `effort_ratio_normalized` parsed.
> **G (retirement)** — see §8. Validated: both jobs cancelled and absent, fleet is exactly the 10 supervised jobs, builds clean.
> **H (CPLM alignment)** — fusion's dead short source + MapState removed (validated: `-short-in` group has no members; fresh 12h/24h verdicts emitting after restructure); replay applies the persistence cap and derives the real median sample period (ran end-to-end; cap branch code-verified — lab's thin window correctly returned INSUFFICIENT_DATA before reaching it).
> **I (safe subset)** — flood-band drops now side-output to `raw-alarms-dlq` (validated: severity-980 inject landed in DLQ with reason, absent from alarm_current). **RTN-unack retention deliberately parked** pending alarm-philosophy sign-off.
> **J (hygiene)** — dedup-state TTLs, one-shot submitter offsets aligned to `committed`, dead Kafka config options removed, doc-drift fixes (supervisor comment, live-metrics topic references). Backlog kept: consumer-lag health (C8), per-loop RBE deadband, the §8 kept-chain last miles.

**P0 — live-path correctness (do first):**
1. Fix ACK stub corruption (A1) — emit full state or branch on `eventType` in both consumers of `current-alarm-state`.
2. Fix lifecycle GUID drop (C1) + persist ack lifecycle (C2) — these two unlock the entire ACK UX.
3. Guard the ingest poller (C3): treat parse failure as "no data", never as "all clear".
4. Fix the CPLM consumer poison-pill (L8/summary #4): skip + log + DLQ instead of retry-forever.
5. Historical Viewer field-name + state-filter fixes (C4) — small, user-visible daily.

**P1 — stop lying to users / stop wasting compute:**
6. Decide Loop-KPI and State-Drift per `STR-08-job-decisions.md`: retire (recommended — CPLM covers loop KPIs properly) or rebuild input wiring + supervision + a UI.
7. Remove fusion's dead short source (L1); key the three CPLM result sinks (L2).
8. Align replay with streaming (L3): apply persistence, honor real sample period, pass the profile as args.
9. Surface or remove: ObservabilityHub trio, `OnSoeEvent`/`OnAnalyticsUpdate`, `alarmKpis`/`loopKpis` stores, EEMUA missing KPIs (C6/C7), analysis-service UI (K6).
10. Fix constant-value fields (L5) — four one-line JSON key fixes.
11. Unacked-RTN retention + flood-filter side-output (A4/A5) — ISA-18.2 compliance.
12. Register `FIC99999` DLQ noise: cap the sim, or add a DLQ monitor that excludes the sentinel.

**P2 — hygiene:** supervisor coverage parity + marun profile; single offsets policy; state TTLs; `uid()`s; consumer-lag health checks (C8); per-loop RBE deadband; doc-drift sweep; delete dead config/topics/branches.

---

## 8. Retirement record (Phase G, 2026-09-01)

**Retired outright** (jobs cancelled, classes deleted from `src/flink`, submitters/consumers removed):
- **AMS - Loop KPI Engine** (`LoopKpiStreamJob` + `LoopKpiResult` + `RawLoopData`): input `traverse.cpa.loop-raw-data` had no producer and the parser expected the legacy `{tagId,timestamp}` schema. CPLM short/long/fusion is the loop-KPI path. Removed: `stabilize-ams-e2e.ps1` submit, `AmsFlinkJob.ps1` helpers, `KpiConsumerService` subscription, `PublishLoopKpiAsync`/`OnLoopKpiUpdate` hub method, `alarmStore.loopKpis`.
- **AMS State Drift Detection Engine** (`StateDriftDetectionJob`): both inputs (`events.raw`, `state.active`) producerless, no checkpointing, hub had no client. Removed: submitter, helpers, `DriftAlertConsumerService`, `OnDriftAlertReceived`.
- Dead topics removed from creation + queued for deletion on next reset: `loop-raw-data`, `loop-kpis-5m`, `kpi-bad-actors`, `kpi-health-scores`, `state.active`, `system.state.drift.alerts`. `events.raw` kept (AlarmReplayEngine's source).

**Kept, with a backlog note (working chains whose last mile is unbuilt):**
- Alarm-KPI chain (AlarmKpiStreamJob → `kpi-alarm-rates`/`kpi-standing-snapshots` → KpiConsumerService → `OnAlarmKpiUpdate` → `alarmStore.alarmKpis`) — **backlog: render it** (dashboard KPI strip), and fix K3 (standing count resets on restart) before trusting the numbers.
- AlarmStateExportJob → delta topic → `OnAlarmStateDeltaReceived`, and the on-demand replay path (`/observability/replay` → AlarmReplayEngine → `OnReplayDeltaReceived`) — **backlog: an engineering observability view** joining `/hubs/observability`.
- SoE panel + Live-Events SignalR tab, `OnFloodAlert`/`OnBulkAlarmsUpdated`/`OnServerStatusChanged`/`OnAnalyticsUpdate` handlers, EEMUA page's 7 unserved KPIs — **backlog: build the feeds or remove the surfaces**; left untouched to avoid churning in-flight UI work.

---

*Method: four parallel code audits (alarm-core jobs; KPI/drift/analysis; CPLM long/fusion/replay/RBE + their backend; alarm backend + UI) cross-checked against live cluster/broker/DB state. Detailed file:line evidence for every finding is preserved in the agent reports; this document is the consolidated index. Short-feature pipeline: see [audit.md](audit.md).*
