# 05 — Operations Tab (frontend) — Code-verified analysis

**Scope**: the six nav entries in the `Operations` group of `src/frontend-ob/src/App.tsx:664-669`, their component trees, and the data plumbing behind them (`api/alarmApi.ts`, `api/alarmMappers.ts`, `store/alarmStore.ts`, `store/mqttStore.ts`, `utils/alarm*.ts`, `hooks/useAlarmAnalytics.ts`, shared alarm components).

**Method**: every claim below was read out of the actual file at the cited line. Backend counterparts were read in `src/backend/AMS.Api/Hubs/AlarmHub.cs`, `AMS.Api/Controllers/V1/*.cs`, `AMS.Application/Alarms/Queries/AlarmQueries.cs`, `AMS.Application/Alarms/Commands/AlarmCommands.cs`, `AMS.Infrastructure/Kafka/*.cs`. Anything not verifiable from code is marked **Unknown / Requires Verification**.

**Excluded**: `src/xmlgraphics-batik-main ScreeN Import/`.

---

## 0. Transport map (verified)

### 0.1 HTTP

| Path (frontend) | Verb | Called from | Backend route |
|---|---|---|---|
| `/api/v1/alarms/active` | GET | `api/alarmApi.ts:42` | `AlarmsController.cs:42` `[HttpGet("active")]` |
| `/api/v1/alarms/active/statistics` | GET | `api/alarmApi.ts:12` | `AlarmsController.cs:93` |
| `/api/v1/alarms/active/purge-lab-data` | POST | `api/alarmApi.ts:153` | `AlarmsController.cs:114` |
| `/api/v1/alarms/acknowledge/batch` | POST | `api/alarmApi.ts:77` | `AlarmsController.cs:170` |
| `/api/v1/alarms/{id}/shelve` | POST | `api/alarmApi.ts:90` | `AlarmsController.cs:201` |
| `/api/v1/alarms/{id}/unshelve` | POST | `api/alarmApi.ts:104` | `AlarmsController.cs:235` |
| `/api/v1/alarms/{id}/suppress` | POST | `api/alarmApi.ts:112` | `AlarmsController.cs:262` |
| `/api/v1/alarms/{id}/out-of-service` | POST | `api/alarmApi.ts:123` | `AlarmsController.cs:287` |
| `/api/v1/alarms/historical` | GET | `HistoricalViewer.tsx:33` | `AlarmsController.cs:317` |
| `/api/v1/alarms/historical/stream` | GET | `HistoricalViewer.tsx:127` | `AlarmsController.cs:366` |
| `/api/v1/alarms/transitions/stream` | GET | `HistoricalViewer.tsx:131` | `AlarmsController.cs:432` |
| `/api/v1/admin/alarm-feed` | GET | `api/alarmApi.ts:133` | `AlarmIngestionAdminController.cs:34` |
| `/api/v1/analytics/kpi` | GET | `hooks/useAlarmAnalytics.ts:35` | `AnalyticsController.cs:20` |
| `/api/hist/snapshot?assets=…` | GET | `store/mqttStore.ts:481,507` | historian-bff (via gateway) |
| `/api/hist/trend`, `/summary`, `/raw` | GET | `store/mqttStore.ts:536,559,577` | historian-bff (not used by Operations pages directly except the Live-Alarm dialog's "View IoTDB Trend" navigation) |

Proxy: dev `vite.config.ts:14-36` → `http://localhost:8081` (gateway). Prod `src/frontend-ob/nginx.conf:28-59` → `http://gateway:8080`.

### 0.2 SignalR — hub URL `/hubs/alarms`

Client: `store/alarmStore.ts:480-564`. Server: `AMS.Api/Program.cs:315`, `AMS.Api/Hubs/AlarmHub.cs`.
SignalR JSON is camelCase on both sides (`Program.cs:191-194`); the frontend mappers additionally accept PascalCase (`api/alarmMappers.ts:5-10`).

| Client `.on(name)` | file:line | Server declares | Server actually **invokes** it? |
|---|---|---|---|
| `OnNewAlarm` | `alarmStore.ts:501` | `AlarmHub.cs:127` | **Yes** — `NormalizedAlarmIngestor.cs:97` |
| `OnAlarmUpdated` | `alarmStore.ts:505` | `AlarmHub.cs:130` | **Yes** — `NormalizedAlarmIngestor.cs:115,142,160,213`, `AlarmCommands.cs:229,306,363,418` |
| `OnAlarmCleared` | `alarmStore.ts:509` | `AlarmHub.cs:136` | **Yes** — `NormalizedAlarmIngestor.cs:137,155,190` |
| `OnAckLifecycleUpdated` | `alarmStore.ts:517` | `AlarmHub.cs:133` | **Yes** — `LifecycleEventConsumerService.cs:95` |
| `OnLoopKpiUpdate` | `alarmStore.ts:558` | `AlarmHub.cs:159` | **Yes** — `KpiConsumerService.cs:65` (payload stored, **never rendered**) |
| `OnAlarmKpiUpdate` | `alarmStore.ts:562` | `AlarmHub.cs:160` | **Yes** — `KpiConsumerService.cs:72` (payload stored, **never rendered**) |
| `OnConnected` / `onconnected` | `alarmStore.ts:533-534` | `AlarmHub.cs:154` | Yes (`AlarmHub.cs:62`) — client handlers are empty no-ops |
| `OnBulkAlarmsUpdated` | `alarmStore.ts:513` | `AlarmHub.cs:139` | **NO** — `PublishBulkAlarmsUpdatedAsync` (`AlarmHub.cs:321`) has zero callers |
| `OnFloodAlert` | `alarmStore.ts:536` | `AlarmHub.cs:142` | **NO** — `PublishFloodAlertAsync` (`AlarmHub.cs:335`) has zero callers |
| `OnServerStatusChanged` | `alarmStore.ts:540` | `AlarmHub.cs:145` | **NO** — `PublishConnectionStatusAsync` (`AlarmHub.cs:342`) has zero callers |
| `OnSoeEvent` | `alarmStore.ts:544` | `AlarmHub.cs:148` | **NO** — no code anywhere invokes it (grep for `OnSoeEvent` returns only the interface + the record) |
| `OnAnalyticsUpdate` | `alarmStore.ts:548` | `AlarmHub.cs:151` | **NO** — no caller |
| — (not subscribed) | — | `OnHeartbeat` `AlarmHub.cs:157` | NO |

Client→server invokes: `SubscribeToServer` (`alarmStore.ts:736` → `AlarmHub.cs:89`) ✔, `SubscribeToPriority` (`alarmStore.ts:741` → `AlarmHub.cs:108`) ✔ but **never called by any component**.

### 0.3 MQTT (Sparkplug B)

- URL resolution `store/mqttStore.ts:20-42`; default when `VITE_MQTT_WS_URL` is unset = `ws://localhost:8083/mqtt` (`mqttStore.ts:23`). Compose sets it to `/mqtt-ws` at build time (`infra/docker/docker-compose.yml:737`).
- Always-on subscriptions on connect: `spBv1.0/+/NBIRTH/+`, `spBv1.0/+/DBIRTH/+/#` (`mqttStore.ts:305-306`).
- Firehose (ref-counted, opt-in): `spBv1.0/+/DDATA/+/#` (`mqttStore.ts:49`, subscribe `mqttStore.ts:448`).
- Firehose subscribers in Operations: `Dashboard.tsx:42-48`, `LiveEventsPage.tsx:48-55`, `components/shared/LiveEventStream.tsx:30-36` (the side rail, mounted app-wide by `App.tsx:627-631`).
- Alarm fields decoded from DDATA metric names: `state, severity, acknowledged, priority, sourceName, conditionName, message` (`mqttStore.ts:616-618`), assembled by `buildLiveAlarmFromMetrics` (`mqttStore.ts:150-170`).
- `VITE_SPARKPLUG_GROUP` / `VITE_SPARKPLUG_EDGE` are plumbed through compose and the image (`docker-compose.yml:740-741`, `infra/docker/frontend/Dockerfile:16-17,26-27`) but are read **only** by `EdgeNodeMonitor.tsx:180-181` and `hooks/useLoopLive.ts:17-18` — every Sparkplug topic string shown in the Operations tab is hardcoded instead (M-12/13/14).

---

## 1. `/dashboard` — `components/Dashboard/Dashboard.tsx` (994 lines)

**Status: Partially implemented.** Real live counts; several panels are session-scoped or blocked by dead SignalR events.

### UI element → backend trace

| UI element | file:line | Source | Backend / data origin | Verdict |
|---|---|---|---|---|
| Hydration gate ("Loading alarm data…") | `Dashboard.tsx:76-86` | `alarmStore.hydrated` | set after first `hydrateAlarmsFromApi` (`alarmStore.ts:606`) | Implemented |
| "Active Alarms" KPI (click → `/alarms`) | `Dashboard.tsx:131-138` | `stats.totalActive` | `GET /api/v1/alarms/active/statistics` at hydration, then client recount `alarmStore.ts:186-210` | Implemented |
| "Critical Alarms" (click → `/alarms?priority=CRITICAL`) | `Dashboard.tsx:139-146` | `stats.totalCritical` | same | Implemented |
| "Unacknowledged" (click → `/alarms?unacked=1`) | `Dashboard.tsx:147-154` | `stats.unacknowledged` | same | Implemented |
| "Alarm Rate /10 min" + flood sub-label | `Dashboard.tsx:155-162` | `stats.alarmsPerTenMin`, `stats.floodActive` | **only** `/statistics`; `OnAnalyticsUpdate` never fires | **Stale — see BUG-H1** |
| 24 h rate sparkline | `Dashboard.tsx:164`, `367-405` | `useAlarmAnalytics().hourlyRates` | `GET /api/v1/analytics/kpi` → `alarms.alarm_history` hourly `COUNT(*)` (`AnalyticsController.cs:26-37`) | Implemented (units are **per hour**, ISA line drawn at 6/hr `Dashboard.tsx:365`) |
| High/Medium/Low priority tiles | `Dashboard.tsx:169-175` | `stats.*` | client recount | Implemented |
| "Out of Service" tile | `Dashboard.tsx:176-181` | `stats.outOfService` | **`AlarmStatsSummary` has no `OutOfService` field** (`AlarmQueries.cs:75-86`); `alarmApi.ts:26` maps a field the server never sends → 0, then client recount | **Partially implemented — BUG-M2** |
| "OPC Servers — N/N connected" | `Dashboard.tsx:182-187`, `798-852` | `alarmStore.serverStatuses` | `GET /api/v1/admin/alarm-feed`, **`isConnected` hardcoded `true`** at `alarmStore.ts:324` | **BUG-H3 — always green** |
| Priority distribution bar + legend | `Dashboard.tsx:194-196`, `613-690` | `stats` | client recount | Implemented |
| "Mean Time to Acknowledge" | `Dashboard.tsx:201-210` | `analytics.meanTimeToAckSec` ?? session compute | **API never returns `meanTimeToAckSec`** (`AnalyticsController.cs:91-101`) → always the session fallback (`Dashboard.tsx:50-63`) computed from *currently active* alarms only | **Partially implemented — BUG-M3** |
| "Alarms Handled — Acknowledged in session" | `Dashboard.tsx:211-216` | `operatorMetrics.totalHandled` | count of acked alarms **currently in the active map** — not a session counter | **Mislabelled — BUG-M4** |
| "Shelved" / "Suppressed" metrics | `Dashboard.tsx:217-228` | `stats.shelved/suppressed` | client recount | Implemented |
| Alarm-state matrix (6 tiles) | `Dashboard.tsx:234-236`, `695-789` | `stats` | client recount | Implemented |
| "Live MQTT Stream (Sparkplug B)" panel | `Dashboard.tsx:250-256`, `883-992` | `mqttStore.liveAlarms` (top 10) | MQTT DDATA firehose | Implemented |
| `spBv1.0/ams_site1 · Sparkplug B` chip | `Dashboard.tsx:911` | string literal | — | **Hardcoded** (actual subscription is `spBv1.0/+/…`) |

### Missing / notable
- No plant/area scoping — all counters are plant-wide.
- No flood banner on this page (the app-shell one at `App.tsx:465` never fires; see BUG-C2).
- `FloodAlertBanner` is rendered twice in the app when it ever fires: `App.tsx:465` (`{floodAlert && …}`) and `AlarmConsole.tsx:693` (`{floodAlert?.isFlood && …}`).

---

## 2. `/alarms` "Active Alarms" — `components/AlarmConsole/*` (1080 + 165 + 438 + 183 + 278 + 225 lines)

**Status: Implemented** (the most complete page), with several contract mismatches.

### UI element → backend trace

| UI element | file:line | Action | API / hub | Verdict |
|---|---|---|---|---|
| Flood banner | `AlarmConsole.tsx:693` → `shared/FloodAlertBanner.tsx` | render | `OnFloodAlert` (**never fires**) | **Dead — BUG-C2** |
| KPI summary bar | `AlarmConsole.tsx:696`, `962-1044` | render | `alarmStore.stats` | Implemented (rate cell stale — BUG-H1) |
| Quick filter input (debounced 250 ms) | `AlarmConsole.tsx:705-711`, `105` | AG Grid `quickFilterText` | client-side | Implemented |
| Preset chip `?priority=` / `?unacked=1` | `AlarmConsole.tsx:723-741`, `89-98` | URL search params | client-side filter `AlarmConsole.tsx:129-135` | Implemented |
| Freeze / Frozen toggle | `AlarmConsole.tsx:756-758`, `178-191` | snapshot `alarms` map | client-side | Implemented |
| Acknowledge (F2 / Ctrl+Shift+A / toolbar / row button / context menu) | `AlarmConsole.tsx:761-768`, `195-229`, `363-370`, `654-662` | `POST /api/v1/alarms/acknowledge/batch` | `AlarmsController.cs:170`; policy `alarm.acknowledge_batch` | Implemented — optimistic `ACK_REQUESTED` then SignalR truth |
| Shelve (toolbar / context menu) | `AlarmConsole.tsx:771-778`, `231-243` | `POST /{id}/shelve` per alarm (`Promise.allSettled`) | `AlarmsController.cs:201`; `alarm.shelve` | Implemented |
| Unshelve (context menu) | `AlarmContextMenu.tsx:71-78` → `AlarmConsole.tsx:246-253` | `POST /{id}/unshelve` body `{ operatorStation }` | `UnshelveRequest.Reason` is `[Required]` (`AlarmsController.cs:497-500`) | **BROKEN — BUG-C1 (always 400)** |
| Suppress (context menu / detail panel) | `AlarmConsole.tsx:255-260`, `SuppressDialog.tsx:23-127` | `POST /{id}/suppress` `{ reason, operatorStation }` | `AlarmsController.cs:262`; `alarm.suppress` | Implemented |
| Set Out of Service | `AlarmConsole.tsx:262-267`, `SuppressDialog.tsx:136-225` | `POST /{id}/out-of-service` | `AlarmsController.cs:287`; `alarm.suppress` | Implemented |
| Export CSV | `AlarmConsole.tsx:674-681`, `789-791` | AG Grid `exportDataAsCsv` | client-side | Implemented |
| Refresh (F5 / toolbar) | `AlarmConsole.tsx:664-670`, `794-803` | `alarmStore.refreshActiveAlarms()` | full re-hydration | Implemented |
| Live Events panel toggle | `AlarmConsole.tsx:808-814` | `LiveEventsContext` | localStorage | Implemented |
| Grid rows | `AlarmConsole.tsx:820-865` | `applyTransactionAsync` deltas (`AlarmConsole.tsx:509-557`) | `alarmStore.alarms` | Implemented, virtualized + paginated (25/50/100/200/500, sticky in `localStorage['ams.alarms.pageSize']`) |
| "ACK" column badge / inline Ack button | `AlarmConsole.tsx:323-372` | `ackLifecycleState`, `isOpcAckWriteable` | `OnAckLifecycleUpdated` + `utils/opcAckWriteable.ts` | Implemented; see BUG-H4 |
| "Time in Alarm" (1 s tick) | `AlarmConsole.tsx:456-479`, `630-640` | `Date.now() - activeTimeEpochMs` | client-side | Implemented; shows ~56 y when `activeTime` is 0 |
| Row classes (blink, ack states, shelved) | `AlarmConsole.tsx:484-504` + `components/AlarmConsole/ag-theme-openbridge.css:186-217` | CSS | — | **Partially compliant — BUG-H5** |
| Detail panel → Details / OPC Attributes / History tabs | `AlarmDetailPanel.tsx:151-155` | none (all derived from the in-memory alarm) | — | **History tab is fabricated — BUG-H6** |

### ACK / shelve / suppress / comment flow (verified end-to-end)

1. **ACK**: `AcknowledgeDialog` collects `comment` (defaulted to `'Acknowledged by operator via console'` when blank, `AcknowledgeDialog.tsx:42`) + `operatorStation` (hardcoded picklist). `handleAcknowledgeConfirm` (`AlarmConsole.tsx:195-229`) filters by `isOpcAckWriteable`, optimistically sets `ACK_REQUESTED` for each id (`AlarmConsole.tsx:213`), clears selection, fires the batch POST, and on rejection sets `ACK_FAILED` (`AlarmConsole.tsx:225`). Server truth returns via `OnAckLifecycleUpdated` → `applyAckLifecycleToAlarm` (`utils/alarmReconciliation.ts:151-187`), which is monotonic w.r.t. terminal states (`shouldApplyAckLifecycle:140-149`). **Reconciliation is correct.**
2. **DCS write-back status IS surfaced** — the ACK column renders the lifecycle badge with a live elapsed timer (`AlarmConsole.tsx:349-359`) and row classes for `ACK_PENDING_DCS` / `ACK_DISPATCHED` / `ACK_FAILED` / `ACK_TIMEOUT` / `ACK_RETRYING` (`AlarmConsole.tsx:489-497`). This is the strongest part of the page.
3. **Shelve/Suppress/OOS are NOT optimistic** — the UI only toasts "command sent … State updates via SignalR" (`AlarmConsole.tsx:240,249,259,266`). Because `PublishBulkAlarmsUpdatedAsync` is dead and the commands publish `OnAlarmUpdated` (`AlarmCommands.cs:306,363,418`), the state does arrive — but `IsOutOfService` is **not in the hub payload** (see BUG-H2), so an OOS command's effect is lost on the next update.
4. **"Comment" is write-only**: the ack comment is posted and rendered back from REST (`AlarmDetailPanel.tsx:243`), but the hub payload's `AckComment` is populated (`AlarmHub.cs:407`) while `AckedByUsername` is **hardcoded `null`** (`AlarmHub.cs:397`). There is no comment/annotation endpoint beyond ack/shelve/suppress reasons.
5. **Error text is generic**: `api/http.ts` never extracts the server's `{ message }` body, so all dialogs show axios' `"Request failed with status code 400"` instead of the ISA-18.2 validation reason (BUG-M5).

### Live ↔ REST merge (`utils/alarmReconciliation.ts`)

- Entry points: `mapHubAlarmPayload` (`alarmMappers.ts:118-147`) → `upsertAlarm`; and again in `flushHubDeltas` (`alarmStore.ts:297`) — **the merge runs twice per delta** (idempotent, but wasteful).
- Guard: an incoming payload with an **older** `eventTimeEpochMs` is discarded (`alarmReconciliation.ts:78-80`) — good, no lost-update from out-of-order hub delivery.
- `mergeFields` (`alarmReconciliation.ts:113-138`) spreads `...incoming` over `...existing` and then explicitly rescues only: `acknowledged, subConditionName, ackComment, ackedByUsername, ackTimeEpochMs, logicalAlarmFamilyId, instanceKeySchemaVersion, opcAttributes, commandId, correlationId, lifecycleId, dcsSequenceId, ackLifecycleState, ackRequestedAtEpochMs, pendingAckActionId`.
  **Not rescued and therefore clobbered by every hub update**: `serverName` (hub sends `""`, `AlarmHub.cs:381`), `isOutOfService` / `qualityGood` / `shelveComment` / `suppressionReason` (absent from `AlarmHubPayload`, so `mapActiveAlarmDto` supplies the defaults `false / true / null / null`, `alarmMappers.ts:66-75`), and `eventTimeMissing` (see BUG-H7). **This is the highest-value defect in the reconciliation path.**
- Duplicate-delivery risk: `PublishNewAlarmAsync` sends the same payload to `Clients.All`, to `alarms-{priority}`, and to `server-{id}` (`AlarmHub.cs:303-311`); the FE joins `server-{id}` (`alarmStore.ts:736`), so **each alarm is delivered twice per client**. The 100 ms coalescer (`alarmStore.ts:267-312`) de-dupes by id and only annunciates when `!existing`, so no double beep — but 2× bandwidth.
- De-registration: an alarm whose `conditionActive` goes false, or whose `sourceName`/`conditionName` is blank, or whose `serverId` is not in `connectedOpcServerIds`, is **deleted from the store** (`alarmStore.ts:288-295`). Combined with BUG-C3 this can silently empty the console.

### Timestamps / sorting / filtering

- All display formatting: `utils/time.ts:3-6` → `dayjs(ms).format('YYYY-MM-DD HH:mm:ss.SSS')` — **browser-local time, no timezone suffix anywhere in the Operations tab**. Epoch-ms values are unambiguous, but an operator cannot tell local from UTC (BUG-M6).
- Default sort: `eventTimeEpochMs desc, priority asc` (`AlarmConsole.tsx:565-571`); sort state survives grid rebuilds (`sortStateRef`, `AlarmConsole.tsx:576-583`).
- Store-side sort helper `sortAlarmsForConsole` (`opcAlarmFilter.ts:39-45`) uses the same keys.
- Filter narrowing resets to page 1 (`AlarmConsole.tsx:613-615`) — correct.
- `HistoricalViewer` sends ISO-8601 with offset (`HistoricalViewer.tsx:35-36`) — correct.

### Performance

- Grid is virtualized (`rowBuffer:20`) + paginated; deltas via `applyTransactionAsync` with `asyncTransactionWaitMillis:50`.
- Hub deltas coalesced at 100 ms (`alarmStore.ts:265-312`); MQTT DDATA coalesced at 100 ms (`mqttStore.ts:611-646`).
- 1 s `setInterval` for the live timer columns, cleaned up (`AlarmConsole.tsx:630-640`). Context-menu listeners cleaned up (`AlarmContextMenu.tsx:52-58`). Detail-panel keydown cleaned up (`AlarmDetailPanel.tsx:36-42`).
- `alarmStore.alarms` is an **unbounded** Map (bounded only by the plant's active-alarm count).
- **`mqttStore.metrics` is unbounded and never evicted** (`mqttStore.ts:634`) while the firehose is on — see BUG-H8.

---

## 3. `/live-events` — `components/LiveEvents/*` (322 + 427 + 191 + 225 lines)

**Status: SignalR tab = Placeholder (permanently empty). MQTT tab = Implemented.**

### UI element → backend trace

| UI element | file:line | Source | Verdict |
|---|---|---|---|
| "SignalR Live/…" badge | `LiveEventsPage.tsx:109` | `alarmStore.connectionState` | Implemented |
| "MQTT Live/Offline" badge | `LiveEventsPage.tsx:110` | `mqttStore.connected` | Implemented |
| Pause / Resume | `LiveEventsPage.tsx:111-123`, `57-67` | freezes local copies | Implemented |
| KPI row (MQTT tab): Active / Unacked / Devices / MQTT Link | `LiveEventsPage.tsx:131-134` | `mqttStore.liveAlarms` | Implemented |
| KPI row (SignalR tab): Events / Critical / Out-of-order / MQTT Alarms | `LiveEventsPage.tsx:138-141` | `alarmStore.recentSoeEvents` | **Always 0/0 — BUG-C4** |
| Tab bar `📡 SignalR SOE` / `⬡ MQTT Sparkplug` | `LiveEventsPage.tsx:152-170` | local state, default `mqtt` | Implemented |
| Priority + Source/Message filters | `LiveEventsPage.tsx:176-190` | applied to SOE only (`LiveEventsPage.tsx:71-78`) | Implemented, but the list they filter is always empty |
| "Open SOE Timeline →" | `LiveEventsPage.tsx:191-198` | `navigate('/soe')` | Implemented |
| SignalR event list + pager | `LiveEventsPage.tsx:233-246`, `293-320` | `recentSoeEvents` (`OnSoeEvent`) | **Dead — never populated** |
| MQTT filter pills / search / sort / list-vs-table | `MqttLiveStream.tsx:176-205` | client-side over `liveAlarms` | Implemented |
| "↻ Snapshot" button | `MqttLiveStream.tsx:207-210` | `GET /api/hist/snapshot?assets=*` | Implemented |
| Pipeline chips (MQTT / Redis snapshot) | `MqttLiveStream.tsx:153-154` | `connected`, `snapshotLoaded` | Implemented |
| Row flash-on-update (1.8 s) | `MqttLiveStream.tsx:76-90` | `ts` comparison | Implemented |
| Row/table click → `LiveAlarmDetailDialog` | `MqttLiveStream.tsx:258-265`, `393` | `mqttStore.metrics` for the device | Implemented |
| "📈 View IoTDB Trend" | `LiveAlarmDetailDialog.tsx:81-100` | `resolveHistorianPathServerFirst` → binding-resolver, then `/iotdb-trend` | Implemented |
| Header topic label `spBv1.0/ams_site1/DDATA/ams_edge1/#` | `MqttLiveStream.tsx:236` | string literal | **Hardcoded / wrong** (real sub is `spBv1.0/+/DDATA/+/#`) |
| Dialog "MQTT Topic" property | `LiveAlarmDetailDialog.tsx:190` | template literal with hardcoded group/edge | **Hardcoded** |
| Dialog "Live path" / "Historian path" | `LiveAlarmDetailDialog.tsx:193-194` | static strings | **Static documentation text** |
| Empty state with `python scripts/e2e-edge/live_events_feed.py` | `MqttLiveStream.tsx:358-364` | string literal | **Lab instruction shipped to operators** |

### Missing
- The MQTT tab ignores the page-level `priorityFilter` / `sourceFilter` entirely: `filteredMqtt = useMemo(() => frozenMqtt, [frozenMqtt])` (`LiveEventsPage.tsx:80`) is an identity memo. The MQTT panel has its own independent filters.
- MQTT alarms have **no ack/shelve action** — the dialog is read-only. There is no route from a Sparkplug alarm back to the AMS alarm id.
- `paused` freezes the list but the store keeps ingesting; the KPI header says `frozen`, which is honest.

---

## 4. `/soe` "Sequence of Events" — `components/Soe/SoePanel.tsx` (367 lines)

**Status: Dead feature — the page is well built but its only data source is never published.**

| UI element | file:line | Source | Verdict |
|---|---|---|---|
| d3 zoomable timeline (scroll-zoom, drag-pan, zoom preserved across rebuilds) | `SoePanel.tsx:43-197` | `alarmStore.recentSoeEvents` | Code is complete; **data is always `[]`** |
| Tooltip (HTML-escaped, `SoePanel.tsx:12-15`) | `SoePanel.tsx:164-186` | same | Implemented (XSS-safe) |
| Priority legend | `SoePanel.tsx:213-226` | static | Implemented |
| Event log + `ListPager` (25/page) | `SoePanel.tsx:290-361` | same | Implemented |
| "Waiting for live SOE events" empty state | `SoePanel.tsx:247-255` | — | **This is the only state that ever renders** |

**Root cause chain (verified)**:
1. `recentSoeEvents` is written only by `addSoeEvent` (`alarmStore.ts:707-713`), called only from the `OnSoeEvent` handler (`alarmStore.ts:544-546`).
2. `IAlarmHubClient.OnSoeEvent` (`AlarmHub.cs:148`) has **no invoker anywhere in the backend**.
3. The REST fallback does not exist either: `SoeEventRepository.QueryAsync` returns an empty page **by design** — `src/backend/AMS.Infrastructure/Repositories/StubRepositories.cs:6-10` states "the `soe` schema has NO tables … the REST query path therefore returns an empty page by design".
4. There is no SOE REST route in `AlarmsController` at all; the page never issues a fetch, so **it is also empty on every page load even if events had been streamed** (no backfill).

**Also**: the header claims "High-precision **microsecond** timeline" (`SoePanel.tsx:209`) but `SoeEvent.sourceTimestampEpochMs` is **milliseconds** (`alarmStore.ts:103`, `AlarmHub.cs:243`).

---

## 5. `/historical` "Alarm History" — `components/HistoricalViewer/HistoricalViewer.tsx` (302 lines)

**Status: Implemented.** Cleanest page in the tab.

| UI element | file:line | API | Verdict |
|---|---|---|---|
| Date-range picker (default last 24 h) | `HistoricalViewer.tsx:50-52`, `162-169` | drives `from`/`to` ISO | Implemented |
| Priority select | `HistoricalViewer.tsx:171-180` | `?priority=CRITICAL` → `AlarmPriority?` enum (members `Critical…`, `ActiveAlarm.cs:8-15`) | Implemented — case-insensitive binding **Requires Verification** |
| Source/Tag input (debounced 300 ms) | `HistoricalViewer.tsx:182-186`, `59` | `?sourceNameContains=` | Implemented |
| Refresh | `HistoricalViewer.tsx:188-202` | react-query `refetch` | Implemented |
| Results count | `HistoricalViewer.tsx:204-212` | `data.totalCount` | Implemented |
| Error banner + Retry | `HistoricalViewer.tsx:217-231` | react-query `isError` | Implemented |
| AG Grid (9 columns) | `HistoricalViewer.tsx:236-241`, `81-96` | `mapHistoricalAlarmRow` (`alarmMappers.ts:95-116`) | Implemented |
| Prev / Next paging (500/page) | `HistoricalViewer.tsx:261-264`, `134-135` | `pageNumber` | Implemented; `hasNext = items.length >= pageSize` over-shoots by one page on an exact multiple (BUG-L1) |
| "↓ Export Alarms NDJSON" | `HistoricalViewer.tsx:126-128` | `GET /api/v1/alarms/historical/stream` via `apiFetch` → Blob | Implemented (token no longer in the URL) |
| "↓ Export Transitions NDJSON" | `HistoricalViewer.tsx:130-132` | `GET /api/v1/alarms/transitions/stream` | Implemented |

### Missing
- Export ignores `priority` / `sourceNameContains` — only `from`/`to` are sent (`HistoricalViewer.tsx:104-108`); the streamed file will not match the grid the operator is looking at.
- No CSV export (only NDJSON), no column chooser, no ack-comment / shelve-reason columns.
- No `state`, `category`, `isAcknowledged`, or `serverId` filters even though the endpoint accepts them (`AlarmsController.cs:324-329`).

---

## 6. `/analytics` — `components/Analytics/Analytics.tsx` (799 lines)

**Status: Partially implemented.** Prior hardcoded chart arrays have been removed (comments `H5` at `Analytics.tsx:142,185,446,499,618`); what remains is a set of KPIs whose backing fields the API never returns.

Backing endpoint `GET /api/v1/analytics/kpi` returns exactly (`AnalyticsController.cs:91-101`):
`hourlyRates, chatteringCount, fleetingCount, top10ContributionPercent, badActors, staleAlarmCount, totalAlarms24h, priorities`.

| UI KPI / chart | file:line | Field consumed | Served by API? | Renders |
|---|---|---|---|---|
| Average Alarm Rate | `Analytics.tsx:99-101` | `stats.alarmsPerTenMin` | via `/statistics` | value (stale — BUG-H1); **`status` passes at ≤ 2.0 while the label says "Target ≤ 1.0"** — BUG-M7 |
| Peak Alarm Rate | `Analytics.tsx:102-103`, `34` | derived `max(hourlyRates)` | derived | **unit label `/ 10 min` but the data is per hour** — BUG-M8 |
| Time in Flood | `Analytics.tsx:104-105`, `35` | `timeInFloodPercent` | **No** | always `—` |
| Alarms / Shift | `Analytics.tsx:106`, `36` | `alarmsPerShift` ?? `totalAlarms24h / 2` | **No** | **hardcoded 12-h-shift assumption** |
| Alarm Rate vs Target chart | `Analytics.tsx:108-115`, `344-437` | `hourlyRates` | Yes | Implemented (24 buckets rebuilt client-side, `Analytics.tsx:321-342`) |
| MTTA | `Analytics.tsx:125-126`, `37` | `meanTimeToAckSec` | **No** | always `—` |
| Mean Time to Respond | `Analytics.tsx:127`, `38` | `meanTimeToRespondMin` | **No** | always `—` |
| Operator Compliance | `Analytics.tsx:128-129`, `39` | `operatorCompliancePercent` | **No** | always `—` |
| Unacknowledged Active | `Analytics.tsx:130-131` | `stats.unacknowledged` | Yes | Implemented |
| Chattering Alarms | `Analytics.tsx:143-145` | `chatteringCount` | Yes | Implemented — but the SQL counts **sources with ≥ 5 events in 24 h** (`AnalyticsController.cs:39-46`), not ISA-18.2 chatter (≥3 transitions/min). **Semantic mismatch — BUG-M9** |
| Fleeting Alarms | `Analytics.tsx:146-148` | `fleetingCount` | Yes (`< 60 s` duration) | Implemented |
| Top 10 Contribution | `Analytics.tsx:149-151` | `top10ContributionPercent` | Yes | Implemented; target "< 5%" is unreachable for a top-10 share → permanently `Exceeds` |
| False Alarm Rate | `Analytics.tsx:152-153`, `40` | `falseAlarmRatePercent` | **No** | always `—` |
| Priority Donut | `Analytics.tsx:157-159`, `448-492` | `priorities` | Yes (severity buckets over `alarms.alarm_current`) | Implemented |
| Bad Behaviours bar | `Analytics.tsx:160-167`, `501-545` | chattering/fleeting/stale + `stats.totalActive` | Yes | Implemented |
| Bad Actors table (7 d) | `Analytics.tsx:170-172`, `550-601` | `badActors` | Yes | Implemented |
| Stale Alarms | `Analytics.tsx:182` | `staleAlarmCount` | Yes — **but the SQL is "unacked > 15 minutes"** (`AnalyticsController.cs:73-76`) while the card says "> 24 h standing" | **BUG-H9** |
| Standing / Suppressed+Shelved | `Analytics.tsx:183-184` | `stats.*` | Yes | Implemented |
| Safety Latency / System Data Loss | `Analytics.tsx:186-187` | literal `"—"` | — | **Honest placeholders** |
| Drill-Down RCA table | `Analytics.tsx:197`, `611-786` | `badActors` | Yes | Partially — `priorityMix` and `mtta` are literal `'—'` (`Analytics.tsx:624-625`); "Suggested Action" is a hardcoded `count > 500` heuristic (`Analytics.tsx:628`) |
| "↓ Export ISA-18.2 Report" | `Analytics.tsx:45-59`, `74-89` | client-side JSON Blob of what is on screen | — | Implemented (not a real ISA-18.2 report) |

---

## 7. Consolidated: mock / hardcoded / static / placeholder data (27 items)

| # | What | file:line | Kind | Impact |
|---|---|---|---|---|
| M-01 | `HistoryTab` synthesises a lifecycle chronology from the current alarm record: "Alarm Activated", "Acknowledged", "Shelved", "Suppressed", "Returned to Normal" | `AlarmDetailPanel.tsx:331-384` | **Fabricated audit trail** | Shelve event is stamped with `ackTimeEpochMs ?? eventTimeEpochMs` (`:355`) and Suppressed with `eventTimeEpochMs` (`:365`) — **wrong timestamps presented as history**. Header says "sorted by event-time authority" (`:389`). |
| M-02 | `"Process variable recovered to acceptable range"` | `AlarmDetailPanel.tsx:378` | Hardcoded narrative | Claims a physical cause the system never observed |
| M-03 | `"Reason: DCS Rule"` fallback for suppression | `AlarmDetailPanel.tsx:367` | Hardcoded | Invents a suppression source |
| M-04 | ACK-source guess `'Ext. OPC'` / `'This App'` | `AlarmConsole.tsx:338-341` | Heuristic shown as fact | Backend always sends `AckedByUsername: null` on the hub (`AlarmHub.cs:397`), so hub-only alarms always read "Ext. OPC" |
| M-05 | Operator-station picklist `CCR-01 / CCR-02 / FCR-01 / ENG-01 / REMOTE` | `AcknowledgeDialog.tsx:158-162`, `ShelveDialog.tsx:245-249`, `SuppressDialog.tsx:119-123`, `SuppressDialog.tsx:218-220` | Static demo data | Not sourced from any station registry; recorded in the audit trail as fact |
| M-06 | Unshelve hardcodes station `'CCR-01'` | `AlarmConsole.tsx:248` | Hardcoded | Audit attribution is wrong regardless of the logged-in station |
| M-07 | Shelve reason presets (6) | `ShelveDialog.tsx:26-33` | Static presets | Acceptable, but not configurable |
| M-08 | Suppress reason presets (5) | `SuppressDialog.tsx:15-21` | Static presets | Same |
| M-09 | Default ack comment `'Acknowledged by operator via console'` | `AcknowledgeDialog.tsx:42` | Auto-filled | Silently writes a comment the operator never typed |
| M-10 | `HTTP_FEED_SERVER_ID = 'f0af9a6d-85f6-4c9f-a8ad-6de277d1d110'` | `utils/opcAlarmFilter.ts:22` | Hardcoded lab GUID | Sole fallback filter when no server list resolves — see BUG-C3 |
| M-11 | `isLabStormAlarm()` always returns `false` | `utils/opcAlarmFilter.ts:11-13` | Stub | Dead |
| M-12 | Topic label `spBv1.0/ams_site1/DDATA/ams_edge1/#` | `MqttLiveStream.tsx:236` | Hardcoded, wrong | Real subscription is `spBv1.0/+/DDATA/+/#` (`mqttStore.ts:49`). `VITE_SPARKPLUG_GROUP`/`_EDGE` exist and are wired (`docker-compose.yml:740-741`, `infra/docker/frontend/Dockerfile:16-17,26-27`) but **no Operations file reads them** — only `EdgeNodeMonitor.tsx:180-181` and `hooks/useLoopLive.ts:17-18` do |
| M-13 | Dialog "MQTT Topic" `spBv1.0/ams_site1/DDATA/ams_edge1/{id}` | `LiveAlarmDetailDialog.tsx:190` | Hardcoded | Wrong for any non-`ams_site1` group; ignores `VITE_SPARKPLUG_GROUP`/`_EDGE` |
| M-14 | Chip `spBv1.0/ams_site1 · Sparkplug B` | `Dashboard.tsx:911` | Hardcoded | Same — ignores `VITE_SPARKPLUG_GROUP` |
| M-15 | Static architecture strings "Sparkplug B DDATA → Redis snapshot → HMI" / "Flink → IoTDB → Historian BFF /trend" | `LiveAlarmDetailDialog.tsx:193-194` | Static doc text | Presented as per-alarm data |
| M-16 | `python scripts/e2e-edge/live_events_feed.py --mode mqtt` in the empty state | `MqttLiveStream.tsx:363` | Lab instruction | Shown to production operators |
| M-17 | `"Run live_events_feed.py to push test alarms"` | `components/shared/LiveEventStream.tsx:144` | Lab instruction | Same |
| M-18 | `alarmsPerShift = totalAlarms24h / 2` | `Analytics.tsx:36` | Hardcoded 12-h shift | Wrong for 8-h shift plants |
| M-19 | "Suggested Action": `count > 500 ? 'Apply 5s ON-delay' : 'Review setpoint'` | `Analytics.tsx:587` and `Analytics.tsx:628` | Hardcoded engineering advice | Rationalisation guidance with no basis in the data |
| M-20 | `priorityMix: '—'`, `mtta: '—'` in the RCA table | `Analytics.tsx:624-625` | Placeholder | Two of six columns are permanently blank |
| M-21 | "Safety Latency" / "System Data Loss" = `"—"`, `"Not instrumented yet"` | `Analytics.tsx:186-187` | Honest placeholder | Two KPI cards that never do anything |
| M-22 | `ISA_TARGET_PER_HOUR = 6` and chart markLines at 6 / 12 | `Dashboard.tsx:365`, `Analytics.tsx:392-393` | Hardcoded thresholds | Not configurable per plant |
| M-23 | Severity colour thresholds 900/700/400 and 800/600/400 | `AlarmConsole.tsx:411-413`, `MqttAlarmListItem.tsx:38-43` | Hardcoded, **inconsistent between the two surfaces** | Same alarm gets a different colour on two pages |
| M-24 | Dead runtime env `VITE_API_BASE_URL` / `VITE_SIGNALR_HUB_URL` on `ams-frontend` | `infra/docker/docker-compose.yml:750-752` | Dead config | Vite env is compile-time; these runtime values never take effect (the build args at `:734-741` are the real ones) |
| M-24b | `VITE_DEMO_MODE` and `VITE_KEYCLOAK_URL` declared as ARG+ENV in the frontend image | `infra/docker/frontend/Dockerfile:8,11,19,22` | Dead config | Consumed **nowhere** in `src/frontend-ob/src` (grep returns zero hits). `VITE_DEMO_MODE` in particular implies a demo/mock switch that does not exist |
| M-25 | MQTT default URL `ws://localhost:8083/mqtt` | `store/mqttStore.ts:23,39` | Stale default | Port 8083 is no longer published (`CLAUDE.md` port table) → **MQTT never connects in `npm run dev` unless `VITE_MQTT_WS_URL` is set** |
| M-26 | `.env.example` documents the **wrong** dev value and contradicts its own comment: `# Dev: set to ws://localhost:8083/mqtt (Vite proxy handles /mqtt-ws in dev)` followed by `VITE_MQTT_WS_URL=ws://localhost:8083/mqtt` | `infra/docker/.env.example:96-98` | Wrong documented config | The value bypasses the `/mqtt-ws` ws proxy that `vite.config.ts:26-34` actually defines, and targets an unpublished port. Anyone following the example gets a permanently dead MQTT link in dev — compounds M-25 |

*(`Math.random()` appears once, at `mqttStore.ts:289`, as an MQTT client-id suffix — legitimate, not fake data. No `TODO`/`FIXME`/`mock` markers remain in the Operations tree.)*

---

## 8. Consolidated: bugs

### Critical

| ID | Bug | Evidence | Impact |
|---|---|---|---|
| **BUG-C1** | **"Unshelve" always fails with HTTP 400.** The client posts `{ operatorStation }` with no `reason`; `UnshelveRequest.Reason` is `[Required]`, and the controller returns `BadRequest(ModelState)` on invalid state. | `api/alarmApi.ts:99-105` vs `AlarmsController.cs:242-246, 497-500` | The only way to un-shelve an alarm from the UI is broken. Operator sees the generic toast `'Unshelve command failed'` (`AlarmConsole.tsx:251`). |
| **BUG-C2** | **Alarm-flood detection never reaches the UI.** `OnFloodAlert` is declared but `PublishFloodAlertAsync` has zero callers, and `OnAnalyticsUpdate` (the other `floodActive` source) also has zero callers. | `AlarmHub.cs:142,151,335`; grep for callers returns only the interface/implementation | `FloodAlertBanner` (`AlarmConsole.tsx:693`, `App.tsx:465`) is unreachable code. `stats.floodActive` only ever reflects the value from one `/statistics` call at hydration. ISA-18.2 flood annunciation is non-functional. |
| **BUG-C3** | **A deployment whose OPC server id ≠ the hardcoded lab GUID shows an empty alarm console** if `/api/v1/admin/alarm-feed` is unreachable or `enabled:false`. `alarmMatchesConnectedOpcServer` falls back to `serverId === 'f0af9a6d-…'` when the connected-server set is empty, and the hydration seeding loop uses that same empty-set predicate. | `utils/opcAlarmFilter.ts:22,31-32`; `alarmStore.ts:388-395`; `alarmApi.ts:128-150` (returns `[]` on `!feed.enabled` or on any throw) | Every alarm is filtered out of `rowData` (`AlarmConsole.tsx:129-135`) and out of `stats` — the console reads "No active alarms" while the API is returning rows. `VITE_OPC_SERVER_ID` (`alarmStore.ts:333,351`) is the only escape hatch and is not set in compose. |
| **BUG-C4** | **The entire Sequence-of-Events feature is inert.** `OnSoeEvent` has no server-side invoker; the REST path is a documented stub returning an empty page; the page never fetches anything on mount. | `AlarmHub.cs:148` (no callers); `AMS.Infrastructure/Repositories/StubRepositories.cs:6-10,27-28`; `SoePanel.tsx:29` | `/soe` renders "Waiting for live SOE events" forever, and the `/live-events` SignalR tab plus its 4 KPI cards are permanently zero. Two of six Operations pages are effectively empty. |

### High

| ID | Bug | Evidence | Impact |
|---|---|---|---|
| **BUG-H1** | **`alarmsPerTenMin` freezes for the whole session while SignalR is healthy.** The 30 s poll (the only path that re-reads `/statistics`) short-circuits when the hub is connected, and `recalcStatsFromAlarms` deliberately preserves the previous rate. `OnAnalyticsUpdate` never fires. | `App.tsx:241-247`; `alarmStore.ts:204-208`; `alarmStore.ts:367-370` | Dashboard "Alarm Rate" KPI (`Dashboard.tsx:155-162`), the console KPI cell (`AlarmConsole.tsx:1022`) and the Analytics "Average Alarm Rate" card (`Analytics.tsx:99`) all show a value frozen at login time. |
| **BUG-H2** | **`AlarmHubPayload` omits `IsOutOfService`, `QualityGood`, `ShelveComment`, `SuppressionReason` and hardcodes `ServerName: string.Empty`.** `mergeFields` does not rescue any of them, so every hub update overwrites the REST-hydrated values with the mapper defaults. | `AlarmHub.cs:165-195, 381`; `alarmMappers.ts:66-75`; `alarmReconciliation.ts:119-137` | An Out-of-Service alarm silently returns to "in service" in the UI on the next update; `Quality` flips to GOOD; shelve/suppression reasons blank out; the **Server column empties** (`AlarmConsole.tsx:427-433`), which also flips `isHttpFeedAlarm`'s `serverName === 'Current Alarms Feed'` test (`opcAckWriteable.ts:13,17`). |
| **BUG-H3** | **OPC server connectivity is faked as always-connected.** `syncConnectedOpcServers` writes `isConnected: true` unconditionally, even when `/admin/alarm-feed` reports `Status: "Error"`. | `alarmStore.ts:320-328`; `AlarmIngestionAdminController.cs:54` | The Dashboard "OPC Servers — 1/1 connected" card (`Dashboard.tsx:182-187`) and every `ServerCard` (`Dashboard.tsx:798-852`) show green during a feed outage. `OnServerStatusChanged`, the real source, never fires. |
| **BUG-H4** | **A brand-new alarm delivered only over SignalR is not ACK-writeable.** The hub payload's `OpcAttributes` is null → `{}` → `cookieOffset` 0 → `isOpcAckWriteable` returns false. | `AlarmHub.cs:194` (`OpcAttributes = null` default, never populated by `MapToPayload:378-408`); `alarmMappers.ts:32`; `opcAckWriteable.ts:33-34` | The inline "Ack" button renders locked with "No OPC cookieOffset — wait for live DCS event" (`opcAckWriteable.ts:58`) until the next REST re-hydration — which, per BUG-H1, only happens if the hub drops. **The freshest, most urgent alarms are the ones the operator cannot ack.** |
| **BUG-H5** | **Only CRITICAL unacknowledged rows blink; the blink also stops on any ACK-lifecycle state.** `getRowClass` puts `alarm-unacked` in an `else if` chain after all ack-lifecycle branches and gates it on `priority === 'CRITICAL'`. | `AlarmConsole.tsx:489-500`; blink rule at `components/AlarmConsole/ag-theme-openbridge.css:192-194` | `conversion.md:62-63` and `openbridge-agent-rules.md:155-157` require blink-while-unacknowledged for alarm/critical/caution severities. HIGH and MEDIUM unacked alarms never blink; a CRITICAL alarm in `ACK_FAILED` stops blinking while still unacknowledged. |
| **BUG-H6** | **The alarm detail "History" tab fabricates a chronology.** No audit/transition endpoint is called; events and timestamps are invented from the current record. | `AlarmDetailPanel.tsx:331-384` (no fetch anywhere in the file) | Operators/auditors read invented shelve and suppress times as fact. `/api/v1/alarms/transitions` (`AlarmsController.cs:402`) exists and is not used here. |
| **BUG-H7** | **Every hub-updated alarm is marked "event time missing (contract violation)".** `mapHubAlarmPayload` computes `eventTimeMissing` from `mapActiveAlarmDto(raw)`, which looks for `eventTime`/`EventTime`; the hub only sends `eventTimeEpochMs`, so the flag is always `true`. | `alarmMappers.ts:44,91,119,143`; `AlarmHub.cs:181` | The detail panel's "Event Time (SOE)" row shows `— missing (contract violation)` (`AlarmDetailPanel.tsx:212-220`) for any alarm whose last update came over SignalR — i.e. almost all of them. |
| **BUG-H8** | **Unbounded memory growth in `mqttStore.metrics` while the DDATA firehose is on.** `liveSeries` has a 4000-key cap (`mqttStore.ts:205`) but `s.metrics` has no cap or eviction. | `mqttStore.ts:634`, `676`, `694` | The Live Events side rail is mounted app-wide by default (`App.tsx:627-631`), so a long control-room session accumulates one immer-tracked entry per `device/metric` ever seen, plus a full immer clone cost per 100 ms flush. |
| **BUG-H9** | **"Stale Alarms — > 24 h standing" is actually "unacknowledged > 15 minutes".** | `Analytics.tsx:182` vs `AnalyticsController.cs:73-76` | The KPI reads ~2 orders of magnitude high and drives a `pass/warn` badge off the wrong definition. |

### Medium

| ID | Bug | Evidence |
|---|---|---|
| **BUG-M1** | Every alarm is delivered **twice** to a subscribed client: `Clients.All` + `Clients.Group("server-{id}")` (and a third time to the priority group for new alarms). The FE joins `server-{id}` at `alarmStore.ts:736`. | `AlarmHub.cs:303-311, 317-318` |
| **BUG-M2** | `fetchAlarmStatistics` maps `outOfService` from a field `AlarmStatsSummary` does not have → always 0 from the server. | `alarmApi.ts:26` vs `AlarmQueries.cs:75-86` |
| **BUG-M3** | Dashboard MTTA falls back to a compute over **currently active** alarms only, so it excludes every alarm that has cleared — systematically biased. | `Dashboard.tsx:50-63, 205-207` |
| **BUG-M4** | "Alarms Handled — Acknowledged in session" is not a session counter; it is `count(active && acknowledged && ackTime)`, so it goes **down** when acked alarms clear. | `Dashboard.tsx:52-53, 211-216` |
| **BUG-M5** | Server error messages are never surfaced. `authedAxios` has no response-body extraction, so `err.message` is axios' `"Request failed with status code 400"`. | `api/http.ts:38-49`; consumed at `AlarmConsole.tsx:224`, `ShelveDialog.tsx:84`, `SuppressDialog.tsx:54`, `SuppressDialog.tsx:166` |
| **BUG-M6** | No timezone indicator anywhere in the Operations tab. `formatTimestampMs` renders browser-local time with no suffix. | `utils/time.ts:3-6`; used in `AlarmConsole.tsx:312,454`, `SoePanel.tsx:325`, `HistoricalViewer.tsx:83,94`, `AlarmDetailPanel.tsx:217`, `LiveAlarmDetailDialog.tsx:161` |
| **BUG-M7** | Analytics "Average Alarm Rate" label says "Target ≤ 1.0 / 10 min" but the pass/fail threshold is `<= 2.0`. | `Analytics.tsx:99-101` |
| **BUG-M8** | "Peak Alarm Rate" is `max(hourlyRates)` (alarms **per hour**) but is labelled `/ 10 min`; the `> 10 → fail` threshold is therefore ~6× too lenient. | `Analytics.tsx:34, 102-103`; `AnalyticsController.cs:26-37` |
| **BUG-M9** | "Chattering Alarms — Rapid ON/OFF" is SQL `HAVING COUNT(*) >= 5` per source over 24 h — a busy-source count, not a chatter metric. | `Analytics.tsx:143-145` vs `AnalyticsController.cs:39-46` |
| **BUG-M10** | `LiveEventsPage` re-sorts the whole plant live-alarm list into React state on **every** MQTT flush (≈10 Hz) via a `useEffect` + `setFrozenMqtt`. | `LiveEventsPage.tsx:57-63` |
| **BUG-M11** | The `/live-events` page-level Priority and Source filters do nothing on the MQTT tab (`filteredMqtt` is an identity memo), yet the "Devices — in current view" KPI is computed from it. | `LiveEventsPage.tsx:80, 133` |
| **BUG-M12** | NDJSON exports ignore the active priority/source filters — only the date range is sent. | `HistoricalViewer.tsx:104-108` |
| **BUG-M13** | `purgeLabInjectedAlarms` only runs when `protocol === 'OPC-AE'`, but `/admin/alarm-feed` hardcodes `Protocol: "HTTP-JSON"` — the purge path is unreachable in the current deployment. | `alarmStore.ts:357` vs `AlarmIngestionAdminController.cs:52` |
| **BUG-M14** | `mergeFields`/`upsertAlarm` runs twice per hub delta (once inside `mapHubAlarmPayload`, once in `flushHubDeltas`). | `alarmMappers.ts:146`; `alarmStore.ts:287,297` |
| **BUG-M15** | Severity→colour thresholds differ between the console (900/700/400) and the MQTT list (800/600/400), so one alarm gets two colours. | `AlarmConsole.tsx:411-413` vs `MqttAlarmListItem.tsx:38-43` |

### Low

| ID | Bug | Evidence |
|---|---|---|
| **BUG-L1** | `hasNext = items.length >= pageSize` shows a Next button onto an empty page when the total is an exact multiple of 500. | `HistoricalViewer.tsx:135` |
| **BUG-L2** | "Time in Alarm" renders ~56 years when `activeTimeEpochMs` is 0 (the mapper's last-resort default). | `AlarmConsole.tsx:463-470`; `alarmMappers.ts:69` |
| **BUG-L3** | SOE header claims "microsecond timeline"; the payload is epoch **milliseconds**. | `SoePanel.tsx:209` vs `alarmStore.ts:103`, `AlarmHub.cs:243` |
| **BUG-L4** | The Analytics "Top 10 Contribution" target of "< 5% of alarms" is structurally unreachable → permanently badged `Exceeds`. | `Analytics.tsx:149-151` |
| **BUG-L5** | The 5 s `setTick` in `MqttLiveStream` is a dependency of the `filtered` memo, so the entire live list is re-filtered and re-sorted every 5 s purely to refresh relative-time labels. | `MqttLiveStream.tsx:64,70-73,126` |
| **BUG-L6** | `AlarmContextMenu` positions with fixed offsets `window.innerWidth - 260` / `innerHeight - 400` rather than measuring the menu. | `AlarmContextMenu.tsx:60-61` |
| **BUG-L7** | `SuppressDialog`/`OutOfServiceDialog` use `catch (err: any)` (two occurrences) — untyped and inconsistent with the rest of the tree. | `SuppressDialog.tsx:53, 165` |

---

## 9. Dead code (grep-verified across `src/frontend-ob/src`, excluding `node_modules`)

| Item | file:line | Evidence |
|---|---|---|
| `isLabStormAlarm` | `utils/opcAlarmFilter.ts:11-13` | 1 occurrence = the definition. Also a permanent `return false` stub. |
| `isLiveSimulatorAlarm` | `utils/opcAlarmFilter.ts:15-17` | 1 occurrence = the definition |
| `TIME_AUTHORITY` | `utils/alarmIdentity.ts:13-17` | 1 occurrence = the definition |
| `alarmStore.setAlarm` | `alarmStore.ts:160, 650` | declaration + implementation only |
| `alarmStore.removeAlarm` | `alarmStore.ts:161, 654` | same |
| `alarmStore.setStats` | `alarmStore.ts:170, 702` | same |
| `alarmStore.setFloodAlert` | `alarmStore.ts:171, 703` | same |
| `alarmStore.setServerStatus` | `alarmStore.ts:172, 704` | same |
| `alarmStore.toggleAlarmSelection` | `alarmStore.ts:176, 720` | same |
| `alarmStore.subscribeToPriority` | `alarmStore.ts:181, 738` | same — the `alarms-{PRIORITY}` hub groups are never joined |
| `alarmStore.bulkUpdateAlarms` | `alarmStore.ts:673-700` | reachable only from the `OnBulkAlarmsUpdated` handler, whose server publisher has no callers |
| `alarmStore.loopKpis` / `alarmKpis` | `alarmStore.ts:146-147, 463-464, 714-719` | written by `OnLoopKpiUpdate`/`OnAlarmKpiUpdate` (which **do** fire, from `KpiConsumerService.cs:65,72`) and **never read by any component** — live data thrown away |
| `OnConnected` / `onconnected` handlers | `alarmStore.ts:533-534` | empty function bodies |
| Orphaned stylesheet `src/styles/ag-theme-openbridge.css` (11.5 KB) | — | zero imports; the live one is `components/AlarmConsole/ag-theme-openbridge.css` (imported by `AlarmConsole.tsx:20` and `HistoricalViewer.tsx:12`) |
| Backend `OnHeartbeat` | `AlarmHub.cs:157` | declared, never invoked, and no client subscribes |
| Backend `AlarmHub.Ping()`, `UnsubscribeFromServer`, `SubscribeToArea` | `AlarmHub.cs:96-116` | no frontend caller |
| Dead runtime env on `ams-frontend` | `infra/docker/docker-compose.yml:750-752` | Vite env is build-time only |

---

## 10. OpenBridge compliance (against `openbridge-agent-rules.md` and `conversion.md`)

**Compliant**
- Colour/size tokens: `styles/theme.ts:16-60` maps every `T.*` key to an OpenBridge CSS variable; only four `'#fff'` literals remain in the Operations tab (`Dashboard.tsx:112,607,608`, `Analytics.tsx:775`, `HistoricalViewer.tsx:191,200`, `LiveAlarmDetailDialog.tsx:76,95`).
- `FloodAlertBanner` uses `ObcAlertIcon alert-type="alarm"` (`shared/FloodAlertBanner.tsx:18`) — the correct alert component.
- `AlarmStateIcon` uses only `obi-*` React icons (`shared/AlarmStateIcon.tsx:4-8`).
- `Dashboard` uses `Obi*` icons throughout (`Dashboard.tsx:9-17`).
- Buttons in dialogs and `ListPager` use `ObcButton` (`AcknowledgeDialog.tsx:8`, `ShelveDialog.tsx:7`, `SuppressDialog.tsx:6`, `shared/ListPager.tsx:5`).
- `prefers-reduced-motion` guard on the blink animation (`components/AlarmConsole/ag-theme-openbridge.css:195-197`).

**Violations**
1. **Emoji used as icons throughout the Operations tab**, against the "`obi-*` only" rule and against the stated intent of `AlarmStateIcon.tsx:15` ("no emoji"): `AlarmConsole.tsx:718,738,757,767,777,790,802` (`✕ ❄ ⏸ ✔ 📥 ↓ ↻`); `AlarmContextMenu.tsx:65,74,83,90,98,104` (`✓ 📥 🔇 🔧 📋 📎`); `AcknowledgeDialog.tsx:75`; `ShelveDialog.tsx:103,160,255`; `SuppressDialog.tsx:68,86,168,197`; `LiveEventsPage.tsx:122,153,154,235,287,316`; `MqttLiveStream.tsx:210,347`; `LiveAlarmDetailDialog.tsx:67,99`; `SoePanel.tsx:177,252,338`; `Analytics.tsx:88,424,676`; `HistoricalViewer.tsx:151,152,201,262,263`; `shared/LiveEventStream.tsx:81,99,139`.
2. **`react-toastify` is used for all alarm-action feedback** instead of OpenBridge alert/notification components — `AlarmConsole.tsx:22` and 14 `toast.*` call sites (`:147,155,184,187,205,219,222,226,240,249,251,259,266,365,677,679`). `openbridge-agent-rules.md` requires OpenBridge alert components for alarm/notification surfaces.
3. **Blink-while-unacknowledged is not implemented per `conversion.md:62-63`** — only CRITICAL rows blink and any ack-lifecycle class suppresses it (BUG-H5). `conversion.md:72-75` maps Critical→`alert-alarm`, High→`alert-critical`, Medium→`alert-caution`; the code has no `alert-critical` usage at all.
4. **Hand-rolled banners** instead of alert components: the `?priority=`/`?unacked=` preset chip (`AlarmConsole.tsx:723-741`), the historical error banner (`HistoricalViewer.tsx:217-231`), the MQTT error strip (`MqttLiveStream.tsx:159-167`), the `isa-notice` blocks (`ShelveDialog.tsx:254-261`, `SuppressDialog.tsx:85-92,196-203`).
5. **Alert tint distinction is lost**: `theme.ts` collapses `successBg`, `warningBg`, `criticalBg`, `cautionBg`, `blueLight` all onto `var(--container-section-color)` (`theme.ts:38,43,50,46,20`), so priority pills, KPI cards and status chips differ only by border/text colour — not by the alert background tokens the rulebook calls for.
6. **Hand-written `<table>` markup** for the MQTT table view (`MqttLiveStream.tsx:375-426`), Bad Actors (`Analytics.tsx:552-599`) and the RCA table (`Analytics.tsx:696-762`) rather than any OpenBridge list/table component.
7. Inline `style={{}}` object literals dominate every Operations page (Dashboard, Analytics, LiveEvents, SOE, HistoricalViewer are ~100 % inline-styled), which defeats theme cascade overrides even though the values themselves are tokens.

---

## 11. Summary verdict per page

| Page | Verdict |
|---|---|
| `/dashboard` | **Partially implemented** — real counts; rate/flood frozen, OPC connectivity faked, MTTA & "alarms handled" mislabelled |
| `/alarms` | **Implemented** — the strongest page; broken Unshelve, hub-payload data loss, ack-writeability gap on fresh alarms |
| `/live-events` | **MQTT tab Implemented; SignalR SOE tab is a Placeholder that can never populate** |
| `/soe` | **Dead feature** — complete d3 implementation with no data source (hub method never published, REST repo is a documented stub) |
| `/historical` | **Implemented** — cleanest page; export ignores filters |
| `/analytics` | **Partially implemented** — 6 of ~17 KPIs can never render a value; 3 KPIs are labelled differently from what the SQL computes |
