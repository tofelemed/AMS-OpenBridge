# Current state: display/template binding and the runtime display page

Read-only analysis, 2026-09-30, branch `feat/v25-next-release`. Every claim cites `path:line`; anything not verified in code is marked **(inferred)**. Where a document and the code disagree, the code is treated as the truth and the disagreement is called out.

## 1. Scope and sources examined

| Area | Files read (line numbers cited below) |
|---|---|
| display-service | `src/services/display-service/Program.cs` (1361 lines), `Models/Display.cs`, `Models/Governance.cs`, `Models/MediaAsset.cs` |
| template-service | `src/services/template-service/Program.cs` (378 lines), `Models/Template.cs` |
| binding-resolver | `src/services/binding-resolver/Program.cs`, `Services/PathResolver.cs`, `Models/BindingResponse.cs` |
| historian-bff | `src/services/historian-bff/Program.cs` (endpoint list only) |
| SQL | `database/scripts/11_traverse_displays_schema.sql`, `12_traverse_templates_schema.sql`, `13_personal_views_schema.sql`, `22_display_governance.sql` |
| Designer model + runtime | `src/frontend-ob/src/components/Designer/{types.ts, DisplayViewer.tsx, SymbolRenderer.tsx, ruleEngine.ts, TrendChart.tsx, TrendCore.tsx, Sparkline.tsx, CollectionRenderer.tsx, NavigationEditor.tsx, TemplatePalette.tsx, PropertyInspector.tsx, DisplayDesigner.tsx, ImportPage.tsx, SymbolPalette.tsx, openBridgeAutomationLibrary.ts, openBridgeCatalogLibrary.ts, customSymbolRegistry.ts, trend/trendSupport.ts}` |
| Live-data plumbing | `src/frontend-ob/src/hooks/{useBindingResolver.ts, useAssetMetadata.ts, useAssetSearch.ts}`, `store/{mqttStore.ts, liveMetric.ts, timeStore.ts, alarmStore.ts}`, `utils/quality.ts`, `App.tsx` routes |
| PI Vision import | `src/frontend-ob/src/services/import/pdixImport.ts` (the only importer in the live tree; `ScreenImportService.ts` lives only in the retired legacy app) |
| Docs | `MIGRATION_LOG.md` (Recorded Decisions), `remaining.md`, `HMI-GAP-REMEDIATION-PLAN.md`, `docs/DESIGNER-FEATURE-GUIDE.md`, `conversion.md`, `docs/api-gateway.md` |

## 2. How it works today

### 2.1 Display snapshot and element binding schema

**Storage.** A display is a `displays.display_definitions` row plus append-only `displays.display_versions` rows whose `snapshot JSONB` holds the whole canvas (`11_traverse_displays_schema.sql:21-72`; EF models `Display.cs:9-153`). Display-level metadata outside the snapshot: `name, category, description, hierarchyPath, width, height, backgroundColor, publishedVersion/At/By, thumbnailSvg, level (ISA-101 1-4), draftVersion, folderId, tags, ownerId` (`Display.cs:16-96`).

**Snapshot top level (what the client actually writes).** `{ items: CanvasItem[], settings: { gridSize, showGrid, backgroundColor, backgroundImageId?, canvasWidth, canvasHeight, importReport? } }` (`DisplayDesigner.tsx:228-231`; import path `ImportPage.tsx:91`). The viewer reads `snapshot.items` and `snapshot.settings.{canvasWidth,canvasHeight,backgroundColor,backgroundImageId}` (`DisplayViewer.tsx:67-83`). No time-window defaults are stored in the snapshot (grep of `DisplayDesigner.tsx`/`TimeBar.tsx` finds no `startExpr` persistence; the time store seeds only from URL, `timeStore.ts:111-117`). *Docs vs code:* the SQL comment says `{ items: [], metadata: {} }` (`11_…sql:68`); the code writes `settings`, never `metadata`.

**Element model (`CanvasItem`, `types.ts:8-74`).** Common: `id, type, position{x,y}, size{width,height}, rotation, zIndex, locked, hidden, flipH/V, groupId, label, style, formatting, shapeProps, textProps, automationProps, obcProps, mediaId`. Data-related sub-schemas:

| Field | Shape | Purpose | Ref |
|---|---|---|---|
| `bindings` | `Record<slot, string>` | **The binding model.** Key = slot name declared by the symbol (`bindingSlots`, `types.ts:233`), value = a **raw UNS contextual path string** `site/[area/]unit/device.measurement` (e.g. `houston/crude1/pump101.discharge_press`, `Display.cs:178-182`). Nothing else: no role, no expression, no units, no entity id. | `types.ts:13` |
| `formatting` | `{decimals, unit, prefix, suffix, showUnit, showLabel, valueColor, backgroundColor}` | presentation only | `types.ts:163-172` |
| `uom`, `showQuality`, `inheritLimits`, `showTimestamp`, `stateMap[]` | display unit switch; NE107 badge; asset-limit inheritance; discrete value → label/colour | `types.ts:57-65` |
| `alarmLimits` | `{hiHi, hi, lo, loLo, deadband}` | author thresholds (back-filled from asset lo/hiEngLimit unless `inheritLimits=false`) | `types.ts:174-180`, `SymbolRenderer.tsx:381-389` |
| `alarmSource` | free-text ISA-18.2 `sourceName` | joins the symbol to `alarmStore` | `types.ts:36`, `PropertyInspector.tsx:696-703` |
| `rules[]` | `{slot?, op, value, value2?, effect: color/blink/hidden/rotate, color?, rotateDeg?}` | conditional formatting on ONE slot value | `types.ts:111-122` |
| `multiStateConfig` | `{slot?, states[{min,max,equals,label,color,blink}], default}` | value range → colour/label | `types.ts:124-137` |
| `navigationLink` | see 2.4 | drill-down | `types.ts:139-161` |
| `collectionConfig` | `{criteria{root, returnAllDescendants, assetType, template}, cell, columns, gap, items[], maxInstances, sort}` | repeat a cell per asset, substituting `{{element}}` | `types.ts:93-108` |
| `comparison` | `{criteria, attributes[]}` | one row/bar per asset from an asset query | `types.ts:51` |
| `summaryColumns`, `trace`, `trendScale`, `steppedLines`, `showRegression`, `transpose`, `timeMode` | table aggregates (min/max/avg), per-pen style, Y scale, per-symbol time context | `types.ts:41-73` |

The server-side `CanvasItem` (`Display.cs:159-218`) is a narrower, older mirror (no rules/nav/collections); it is documentation only — the snapshot is stored as an opaque `JsonDocument` and is never deserialised into it **(inferred from `Program.cs:381-430`, which only regex-scans the raw JSON)**.

**Element types available.** From `SymbolPalette.tsx:56-196` (categories Indicators, Controls, Equipment ISA-5.1, Instruments ISA-5.1, Piping & Flow, Shapes & Layout, Text & Labels, Alarms ISA-18.2, Navigation, Trends & Charts):
`obc.readout, obc.readout-unit, obc.status, obc.bar, obc.bar-horizontal, obc.badge, ind.gauge, ind.multistate, ind.digital, ind.setpoint, obc.button, obc.toggle, obc.slider, obc.slider-horizontal, obc.input, obc.check, ctrl.selector, equip.pump, equip.valve, equip.valve-onoff, equip.motor, equip.tank, equip.hx, equip.compressor, equip.fan, equip.heater, equip.cooler, equip.conveyor, equip.agitator, inst.ti/pi/fi/li/ai/tt, pipe.horizontal/vertical/elbow/tee/reducer, flow.arrow, obc.card, obc.elevated-card, shape.rect/hotspot/circle/line/polygon/divider, image.static, text.label/title/dynamic, obc.clock, obc.alert-icon, obc.alert-button, alarm.banner/beacon/horn/summary/table, obc.nav-item, obc.breadcrumb, nav.faceplate, chart.trend, chart.sparkline, chart.bar, chart.xy, chart.pie, table.value, table.compare, table.timeseries`.
Plus: `obc.auto.*` (23 OpenBridge automation components, `openBridgeAutomationLibrary.ts:61-197`), `obc.ob.<category>.<id>` catalog symbols (UI Components, Bars and Graphs, Instruments, Indicators, AR, Building Blocks; `openBridgeCatalogLibrary.ts:19-168`), `collection.container`, `custom:<id>` user SVG symbols (`customSymbolRegistry.ts:19-33`, persisted in **localStorage**, `:38`), and `import.unmapped` placeholders (`pdixImport.ts:151`).
Slot names actually resolved at runtime are the fixed `KNOWN_SLOTS` list: `value, pv, sp, status, state, running, level, speed, position, position2, temperature, current, pressure, flow, setpoint, command, text, values, x, y, source, alarms, active, asset, tempIn, tempOut` (`SymbolRenderer.tsx:76-84`). A binding under any other key is stored but never subscribed.

### 2.2 Templates and tiers

**Element templates (template-service).** `ElementTemplate{name, category, description, icon, publishedVersion, draftVersion, ownerId, isSystem}` + `TemplateVersion{definition JSON, defaultWidth/Height, status}` + `TemplateParameter{name, label, type: path|string|number|boolean, defaultValue, required}` (`Template.cs:9-131`; SQL `12_…sql:17-71`). The definition is `{ items: CanvasItem[] }` whose bindings/labels contain `{{paramName}}` placeholders, e.g. `"bindings": {"status": "{{basePath}}.running"}` (`12_…sql:113-135`). Creating a template with no parameters auto-adds a required `basePath` of type `path` (`Program.cs:184-193`).
Instantiation is `POST /templates/{id}/instantiate {parameters, position}`: required params checked (`:298-303`), then a **plain string `Replace("{{name}}", value)` over the raw definition JSON** (`:315-320`); returns `{instanceId, templateId, templateVersion, resolvedParameters, size, definition}` (`:322-333`). Publish flips the draft to `published` (`:257-275`). A `TemplateInstance` model exists (`Template.cs:137-159`) but nothing persists it — an instantiated template becomes ordinary items in the display snapshot with no back-reference **(inferred: no `templateId` field on `CanvasItem`, `types.ts:8-74`)**.

**The template UI is orphaned.** `TemplatePalette.tsx` calls `/api/templates` and would invoke `onInstantiateTemplate`, but no file imports it (grep across `src/frontend-ob/src` returns only the file itself) and `DisplayDesigner.tsx` contains no template handling. *Docs vs code:* `MIGRATION_LOG.md:169` records "Template Palette ✅"; `remaining.md:206` correctly calls it orphaned. The designer therefore has **no server-template instantiation path today**.

What is used instead as "templating": (a) **asset-relative displays** — bindings containing `{{element}}` are substituted at runtime with the `?asset=` path or the first same-type peer found by `POST /api/assets/search` (`DisplayViewer.tsx:108-120, 251-309`); (b) **collections** — a cell repeated per matching asset with the same `{{element}}` substitution (`CollectionRenderer.tsx:9-17, 35-60`); (c) **custom SVG symbols** with `{{slot}}`/`{{slot:fixedN}}` placeholders (`customSymbolRegistry.ts:19-33`).

**Two tiers.** *Controlled displays*: draft/published/archived versions (`Display.cs:129-134`), publish/unpublish/revert/restore endpoints (`Program.cs:433, 488, 517, 1156`), publisher taken from the token (`:455-463`), thumbnail regenerated from design mode at publish (`DisplayDesigner.tsx:266-274`), governed folders + ACL grants (`Governance.cs:246-273`, `22_…sql:19-67`), comments/favorites/recents. Policies `DisplayView / DisplayEdit / DisplayPublish` from gateway-injected permission claims (`Program.cs:40`); edit authorization = owner, Admin, or an `edit` ACL on the display or an ancestor folder (`:1290-1300`). *Personal views*: `displays.personal_views` (non-versioned, per-user, `config JSONB` with the same snapshot schema, optional `source_display_id`, `is_shared/shared_with`, `13_…sql:12-37`); created from the runtime viewer via `POST /me/views {name, sourceDisplayId, config:{items, settings}}` (`DisplayViewer.tsx:471-477`) and rendered on `/my-view/:id` (`App.tsx:410-411`, `DisplayViewer.tsx:46-60`). Templates have their own draft/published lifecycle but no folders/ACL.

There is **no review/approve step**: publish is a single permission-gated action; comments are free-text and not a gate (`Program.cs:1181-1190`).

### 2.3 Runtime pipeline (published display → live pixels)

```
Operator            DisplayViewer            binding-resolver        mqttStore / EMQX            historian-bff / asset-model      alarmStore
   |  /display/:id?asset&start&end&kiosk |                          |                            |                                 |
   |----------------------------------->|                          |                            |                                 |
   |   GET /api/displays/{id}/content?stage=published  (DisplayViewer.tsx:63-66)                |                                 |
   |   {{element}} substitution + peer search  (:108-120, :258-309)  --POST /api/assets/search-->|                                 |
   |   collect every bindings[*] path  (:313-321)                    |                            |                                 |
   |------ POST /api/bindings/resolve/batch {path, roles:[live]} x100 (useBindingResolver.ts:66-77) |                            |
   |<----- {contextualPath, live{sparkplugTopic, group, edgeNode, device, metric, redisSnapshotKey}, history{iotDbPath}, alarm{alarmSource}}
   |   per-slot useBindingResolver(path,'live') reads primed cache (SymbolRenderer.tsx:92-101; hook :102-107)
   |   subscribeScreen([spBv1.0/<grp>/DDATA/<edge>/<dev>]) ref-counted (hook :122-137; mqttStore.ts:373-402)
   |                                                                  |--GET /api/hist/snapshot?assets=dev1,dev2 (mqttStore.ts:219-231, 478-500)
   |                                                                  |<-- Redis snapshot {v,q,ts,src,ver,emit,qt} (liveMetric.ts:33-59)
   |                                                                  |<== DDATA (sparkplug-payload decode :664; alias map from DBIRTH :649)
   |                                                                  |    coalesced flush every 100 ms into metrics Map<"dev/metric", LiveMetric> (:586-604)
   |   slot selector re-renders only its key (useBindingResolver.ts:116-119) -> quality/stale/rules -> SymbolFxWrap (SymbolRenderer.tsx:273-320)
   |   trends: role 'all' -> history.iotDbPath -> GET /api/hist/trend?series&start&end&width (TrendCore.tsx:68,179; mqttStore.ts:508-527)
   |   alarms: item.alarmSource -> alarmStore.alarmIndexBySource (SymbolRenderer.tsx:121-124) <== SignalR /hubs/alarms (alarmStore.ts:470-526)
```

Step detail:
1. **Load.** Route `/display/:id` (`App.tsx:393-394`) → `GET {API}/displays/{id}/content?stage=published`; a never-published display is a terminal "no published version" error (`DisplayViewer.tsx:63-66, 226-230`). Server: `Program.cs:237-282` (also upserts the operator's "recent" list). Auto-refresh of the definition is optional (10 s/30 s/1 m, `:85-90`); a failed refetch keeps the last content and shows a "Refresh failed — showing the last loaded version" banner (`:449-453`).
2. **Context from the URL.** `asset`, `assetRoot`, `kiosk`, `hideBar`, `hideTimebar`, `start`, `end`, `tz` (`DisplayViewer.tsx:128-140`, `timeStore.ts:111-117`). Time expressions are PI-style (`*-1h`, `*`) resolved by `timeStore.ts:43-52`; live windows re-tick.
3. **Resolve.** `binding-resolver` looks the path up in asset-model (`GET /assets/by-path/{path}`, batch `POST /assets/by-paths`, `PathResolver.cs:119-160`) and otherwise **derives** the transport from the path string alone: topic `spBv1.0/{site}/DDATA/{site}_edge1/{unit_device|device}`, Redis key `snapshot:metric:…`, IoTDB `root.<path with dots>`, alarmSource `{site}:{unit}:{device}` (`PathResolver.cs:236-262`). Response records: `BindingResponse.cs:54-95, 119, 140`. Gateway route `/api/bindings/**` (`docs/api-gateway.md:30`), resolve GETs cached 30 s (`:101`). An unknown path therefore still "resolves" — there is no unresolvable-binding signal at runtime beyond a value that never arrives (symbol shows `...`/`--`, `SymbolRenderer.tsx:338, 496`).
4. **Subscribe.** MQTT over `/mqtt-ws` through the gateway (`mqttStore.ts:19-45`; `docs/api-gateway.md:41`), libraries lazy-loaded (`:336-358`). Only exact per-device DDATA topics are subscribed for a screen; the plant-wide firehose is reserved for monitoring pages (`:47-50, 424-439`). On connect: NBIRTH/DBIRTH wildcards + `GET /api/hist/snapshot?assets=*` (`:287-290, 478-500`). Reconnect resubscribes and refreshes the JWT password (`:306-316`).
5. **Value → element.** `LiveMetric{value, quality, ts, sourceTs, verifiedTs, emissionTs, qualityToken}` (`liveMetric.ts:12-20`). Primary scalar = first received slot in `PRIMARY_VALUE_SLOTS` (`SymbolRenderer.tsx:86-89, 334-336`); unit conversion from the asset's `engineeringUnit` via `GET /api/assets/by-path` (`useAssetMetadata.ts:23`; `SymbolRenderer.tsx:371-376`); `stateMap` label mapping (`:379`); OBC components receive `alarmLimits` for scale/zones (`:407`).
6. **Quality / stale / bad.** Stale = no sample newer than **8 s** (`openBridgeTheme.ts:71`; `SymbolRenderer.tsx:392`). `qualityFromCode` maps OPC/Sparkplug quality to `good | uncertain | bad | maintenance | outOfService`; stale-but-good → `uncertain`; bad never masked by stale (`utils/quality.ts:33-49`). Rendering: stale → `grayscale(1)`, opacity 0.5, `symbol-quality-stale` class; NE107 badge shown for any non-good state when `showQuality` or when bad/uncertain (safety) (`SymbolRenderer.tsx:287-320`). Staleness is computed from `sourceTs`, never from arrival time (`liveMetric.ts:1-9, 83-89`).
7. **Rules / multistate.** `evaluateRules` (later rule wins per effect) and `evaluateMultiState` (first match) operate on ONE slot value each (`ruleEngine.ts:34-52, 57-75`); results become fill colour, blink, hidden, rotate (`SymbolRenderer.tsx:425-440`).
8. **Alarms on symbols.** Symbol `alarmSource` (free text) → `alarmStore.alarmIndexBySource` summary `{active, unacked, count, highestPriority, message}` (`SymbolRenderer.tsx:103-124`; index `alarmStore.ts:133, 297`). Effect: priority-coloured outline while active, blink while unacknowledged (`:436-440`), annunciator symbols (`obc.alert-button`, beacons, `alarm.summary`) read plant-wide `stats`; `alarm.table` lists alarms filtered by source (`:190-213`). Feed: SignalR `/hubs/alarms` events `OnNewAlarm/OnAlarmUpdated/OnAlarmCleared/OnBulkAlarmsUpdated/OnAckLifecycleUpdated/OnFloodAlert` (`alarmStore.ts:470-526`). Note the resolver's `alarm` role is **never requested** by Designer code (all calls use `live`, `history` or `all`) — the join is by the free-text `alarmSource`, not by resolution.
9. **Trends / history.** Pens = every binding whose value contains `/` (`TrendChart.tsx:19-25`); `TrendCore` resolves with role `all`, splits `history.iotDbPath` into series/measurement (`trendSupport.ts:85-90`) and calls `GET /api/hist/trend?series&start&end&width&measurements` sized to the plot width (`TrendCore.tsx:136, 179`; `mqttStore.ts:508-527`; historian-bff `/trend :88, /summary :252, /raw :165, /snapshot :305, /series :359`). Live tail comes from the same MQTT metrics. `table.value` adds `/summary` min/max/avg; `table.timeseries` uses role `history`; `chart.sparkline`, `chart.xy`, `graph.*` use an in-memory live ring buffer only (no history seed on open, `Sparkline.tsx:15-38`). Runtime ad-hoc trend: whole display / ctrl-click selection / pick mode (`DisplayViewer.tsx:145-155, 324-335, 525-545`).

### 2.4 Navigation between displays

`NavigationLink{targetDisplayId | targetUrl, label, openMode: replace|new-tab|popup, assetContextMode: none|current-asset|current-asset-as-root|explicit, assetContext, includeTimeRange}` (`types.ts:139-161`). Targets are stored as a **display FK, not a route** (`:140-142`). Any symbol (including static shapes/hotspots) can carry one; authored in the Action tab (`NavigationEditor.tsx:50-218`); URLs limited to `https:` or same-origin (`:27-32`, re-checked at runtime `DisplayViewer.tsx:193-195`).

Runtime (`DisplayViewer.tsx:153-206`): the passed asset is the symbol's own device path (first binding containing `/`, stripped after the last `.`) or the explicit path; URL becomes `/display/{targetId}?asset=<path>[&assetRoot=<path>][&start=<expr>&end=<expr>]`. Time is carried as **expressions**, so a live window stays live. `popup` renders an embedded `DisplayViewer` inline sharing the MQTT client and query cache (`:577-590`). A breadcrumb trail (id, asset, name) lives in `sessionStorage` (`:86-96, 233-246`). `assetRoot` is written but the viewer only reads `asset` (`:129`) **(inferred: no consumer found in DisplayViewer)**. The launcher opens `/display/{id}` with no parameters (`DisplayLauncher.tsx:142, 167`).
Context that is **not** carried: user identity (implicit in the JWT only), shift/product/batch context, any "context revision", selected time cursor, alarm selection.

### 2.5 Widgets and expressions

*Dashboard-like widgets inside displays:* KPI-style readouts (`obc.readout*`, `obc.badge`, `obc.card`), gauges (`ind.gauge`, OBC instruments), `chart.sparkline`, `chart.bar`, `chart.pie`, `chart.xy`, `chart.trend`, `table.value`, `table.compare` (asset query → rows), `table.timeseries`, `alarm.table`, `collection.container`. All bind to **measurement tags**; none binds to a derived KPI.
*Dashboard concept:* none in the designer. The app's `/dashboard` (`components/Dashboard/Dashboard.tsx:128-155`, hard-coded `PrimaryKpi` tiles over `alarmStore` with `navigate('/alarms?…')`) and the `/cpm/*` pages (`App.tsx:451-466`) are fixed React pages, not configurable displays; there is no `DashboardTemplate`/persona artifact anywhere.
*Expressions/calculations:* **none**. Grep for expression/formula/calc across Designer, hooks, store, utils finds only the time-expression parser and the rule engine. A symbol cannot combine two bindings; the only client-side derivations are single-slot rules/multistate, UOM conversion, `stateMap`, table `summaryColumns` (server `/summary`), and the trend regression overlay (`trendSupport.ts:35`).

### 2.6 Validation on save / publish

Server (`Program.cs:381-430`): snapshot required; **only** a regex/substring guard against the keys `currentValue|processValue|liveValue|realTimeValue` (`:392-396`, mirrored by DB trigger `11_…sql:76-89` and applied to personal views `:1000, :1250-1256`); edit ACL (`:386`). Publish requires an existing draft (`:444`) and `display.publish`. **Not validated anywhere:** that a binding path exists in asset-model, that a slot name is one the renderer knows, that `targetDisplayId` exists, that `{{element}}` is satisfiable, or that `alarmSource` matches a real alarm source. Client-side: `isSafeUrl` for links; design mode paints unbound symbols with a dashed outline (`SymbolRenderer.tsx:1040`); template-service checks required parameters (`:298-303`, orphaned UI). The PI import report marks every imported binding "unresolved" (`pdixImport.ts:351`) and persists that report in `settings.importReport` (`:371-377`).

### 2.7 PI Vision import

`pdixImport.ts` unzips `display_json` and maps each symbol (`:210-329`):
- Type mapping: `DataShape` first, then `SymbolType` (`:77-87, :50-73`); only types with a renderer are emitted (`:92-96`); library graphics (`DirectoryKey/FileKey`) keyword-matched to `equip.*` (`:103-115`), otherwise a visible `import.unmapped` placeholder.
- Bindings: `pi:\\SRV\TAG` / `af:\\SRV\A\B|ATTR` are slugged into `site/…/device.measurement` (GUID query segments and `#Value` dropped) (`:184-196`); only the **first** DataSource is bound to `value` (`:198-201, :307-308`), except trends which get a pen per DataSource (`:301-305`); graphics bind their driver tag to `status` (`:265-268`).
- Kept: position/size/rotation, fill/stroke/width, font size, static text, `FormatType` decimals + `ShowUOM` (`:313-316`), `LinkURL` → `targetUrl` with internal PI routes flagged for re-pointing (`:136-148, :318-321`).
- Dropped/counted: MultiState dynamics (PI does not export them, `:323-326`), groups (`:252`), secondary bindings, tables' criteria, images. No AF element/attribute model is retained — the only PI/AF trace is the path shape; there is no `AFParser` in `frontend-ob` (`remaining.md:163` describes one only in the retired app).
- Save: `POST /displays` then `PUT /displays/{id}/content {snapshot:{items, settings}}`, then `/designer/{id}` (`ImportPage.tsx:73-104`).

## 3. Code map

| Concern | file:line | Note |
|---|---|---|
| Element/binding model | `src/frontend-ob/src/components/Designer/types.ts:8-74, 139-161` | `bindings: Record<slot, UNS path>`; `navigationLink` |
| Slot list actually resolved | `Designer/SymbolRenderer.tsx:76-101` | `KNOWN_SLOTS`; per-slot `useBindingResolver(…,'live')` |
| Snapshot write shape | `Designer/DisplayDesigner.tsx:228-231` | `{items, settings{…}}` |
| Save/publish/versions API | `src/services/display-service/Program.cs:381, 433, 488, 517, 578, 1134-1156` | content PUT; publish; unpublish; revert; duplicate; versions/restore |
| Published read for runtime | `display-service/Program.cs:237-282` | `?stage=published`; draft by default |
| Config-only guard | `display-service/Program.cs:392-396`; `database/scripts/11_traverse_displays_schema.sql:76-89` | four forbidden keys only |
| Governance (folders/ACL/PV/favorites/recent/comments) | `display-service/Models/Governance.cs:246-325`; `Program.cs:831-1190`; `database/scripts/22_display_governance.sql`, `13_personal_views_schema.sql` | edit authz `Program.cs:1290-1300` |
| Template model + instantiate | `src/services/template-service/Models/Template.cs:9-159`; `Program.cs:283-334` | `{{param}}` string replace |
| Template UI (orphaned) | `Designer/TemplatePalette.tsx` | no importer anywhere |
| Asset-relative `{{element}}` | `Designer/DisplayViewer.tsx:108-120, 251-309`; `Designer/CollectionRenderer.tsx:9-17` | runtime substitution |
| Batch resolve + cache priming | `src/frontend-ob/src/hooks/useBindingResolver.ts:51-88, 90-146` | `/resolve/batch` 100/call; `['binding', path, role]` |
| Resolver transport rules | `src/services/binding-resolver/Services/PathResolver.cs:34-68, 223-268`; `Models/BindingResponse.cs:54-140` | asset-model lookup, path-derived fallback |
| MQTT/Sparkplug store | `src/frontend-ob/src/store/mqttStore.ts:19-50, 219-231, 287-316, 373-439, 478-527, 586-604, 649-664` | `/mqtt-ws`, snapshot seed, ref-counted topics, 100 ms flush |
| Live metric + three times | `src/frontend-ob/src/store/liveMetric.ts:12-89` | stale from `sourceTs` |
| Quality mapping | `src/frontend-ob/src/utils/quality.ts:33-58`; `Designer/openBridgeTheme.ts:71` | NE107; 8 s stale threshold |
| Rule engine | `Designer/ruleEngine.ts:34-75` | single-slot compare |
| Alarm join | `Designer/SymbolRenderer.tsx:103-124, 190-213, 417-440`; `store/alarmStore.ts:133, 470-526` | by `alarmSource`; SignalR |
| Trend/history | `Designer/TrendChart.tsx:19-36`; `Designer/TrendCore.tsx:68, 179`; `mqttStore.ts:508-560`; `src/services/historian-bff/Program.cs:88-359` | `/api/hist/trend`, `/summary`, `/raw`, `/snapshot`, `/series` |
| Time context | `src/frontend-ob/src/store/timeStore.ts:43-118`; `Designer/TimeBar.tsx` | expressions, URL seed |
| Navigation runtime | `Designer/DisplayViewer.tsx:153-206, 577-590`; `Designer/NavigationEditor.tsx:27-32` | asset + time carried; popup embed |
| Routes | `src/frontend-ob/src/App.tsx:375-411, 468-474` | `/designer/:id`, `/display/:id`, `/my-view/:id`, `/displays`, `/trend` |
| Gateway route map | `docs/api-gateway.md:29-41, 99-101` | `/api/displays`, `/api/bindings`, `/api/assets`, `/api/templates`, `/api/hist`, `/hubs`, `/mqtt-ws` |
| PI Vision import | `src/frontend-ob/src/services/import/pdixImport.ts:50-115, 184-201, 210-329`; `Designer/ImportPage.tsx:73-104` | |
| Fixed KPI pages (not displays) | `src/frontend-ob/src/components/Dashboard/Dashboard.tsx:128-155`; `components/Cpm/*` | hard-coded |

## 4. Constraints, settled decisions and traps

- **Settled decisions** (`MIGRATION_LOG.md:288-314`): CQRS discipline; bind through UNS path+role; Flink-only compute; display = configuration only; two-tier displays; DOM/SVG not Konva; OpenBridge as vocabulary; NE107 quality mandatory on reopen; thumbnails client-side; edge-only auth (#16); four-level UNS with unit_device Sparkplug ids (#17, mirrored in `PathResolver.cs:243-250`).
- **The binding is a string, not a reference.** Renaming an asset path silently breaks every display; nothing links a display to asset ids, and the resolver fabricates a transport for any well-formed path (`PathResolver.cs:57, 223-268`). There is no "where used" query.
- **Config-only guard is lexical.** Only four key names are forbidden; a snapshot could carry values under any other key. Conversely a legitimate property literally named `liveValue` can never be stored.
- **Template service is dark.** `/api/templates` is routed and seeded but has no UI caller; `TemplateInstance` is never persisted; instantiation is textual replace with no type checking of `path` params.
- **Custom symbols are per-browser** (`customSymbolRegistry.ts:38`), so a display using `custom:<id>` renders as unknown on another machine.
- **Slot whitelist.** Any binding key outside `KNOWN_SLOTS` is inert (`SymbolRenderer.tsx:76-84`); custom slot names from templates/imports must be mapped.
- **Stale threshold is a constant (8 s)** with no per-tag/expected-rate awareness; report-by-exception tags rely on the edge heartbeat (`liveMetric.ts:5-8`).
- **Alarm join is free text** (`alarmSource`), independent of the resolver's `alarm` role — two vocabularies for the same identity.
- **Offline/resume**: values retained in memory and re-seeded from Redis on reconnect (`mqttStore.ts:290, 373-402`); `connected=false` is set (`:302`) but the viewer shows no explicit "offline" banner for live values, only the stale/uncertain treatment per symbol and a banner when a definition refetch fails.
- **Docs are stale relative to code:** `remaining.md` still lists viewer/trends/navigation as missing (superseded per `HMI-GAP-REMEDIATION-PLAN.md:9-24`); `DESIGNER-FEATURE-GUIDE.md:654` says "no version-history UI" although `VersionHistoryDialog.tsx` exists; `MIGRATION_LOG.md:169` marks the template palette delivered.
- **Controls write nothing** (buttons/sliders/inputs are read-only in preview; `HMI-GAP-REMEDIATION-PLAN.md:95`, `HMI-PHASE-5-DESIGN.md`).

## 5. Mapping to the Truss living-asset pitch

| Pitch concept | What exists today | Status | Notes / gap |
|---|---|---|---|
| Bind a component to a semantic field of a living object (`entity.metrics['production']`) | `bindings[slot] = "site/unit/device.measurement"`; slot role fixed per call site | PARTIAL | Abstraction is path+role, but the leaf is a raw measurement tag; no entity object, no field vocabulary, no derived metrics. Would need a new binding kind (entity id + field) beside the path string. |
| `entity.status` | `status` slot bound to a tag; visual state computed client-side by rules/multistate | PARTIAL | No server-computed status; each display re-derives it. |
| `entity.history['specific_energy']` | history role → IoTDB path of a raw tag via `/api/hist/trend` | PARTIAL | Works for stored tags only; no history of derived KPIs unless Flink writes them as tags. |
| UI subscribes to `traverse/runtime/entity/{id}/state` | Per-device Sparkplug DDATA topics + Redis snapshot via `/api/hist/snapshot` | MISSING | `mqttStore` can subscribe arbitrary topics (`:373`), but decode is Sparkplug-only (`:664`); an entity-state JSON topic needs a second decoder and a metric-key scheme. |
| Persona dashboards (Plant Manager / Ops / Maintenance / Shift Supervisor) as views over the same objects | Role-based read/edit ACLs, ISA-101 `level`, folders, personal views | MISSING | No persona/audience attribute on a display, no persona-scoped launcher; "same object, different view" is only achievable by authoring separate displays. |
| `DashboardTemplate` / `SemanticViewDefinition` | template-service (`{{param}}` textual), `{{element}}` asset-relative, collections, custom symbols | PARTIAL | Template UI orphaned; substitution is string-level; no schema for "view over object type". |
| DrillRules: KPI tile → unit breakdown → unit dashboard → investigation panel | `navigationLink` with asset context modes, popup faceplates, time-range carry | PARTIAL | Carries entity path + time window; no KPI→breakdown semantics, no rule catalogue, no investigation panel target type. |
| Context preserved across drills (entity id, time range, shift/product, user identity, context revision) | `?asset`, `?start/end/tz` expressions, breadcrumb trail; identity via JWT | PARTIAL | Shift/product/context-revision do not exist anywhere in the UI or snapshot. |
| KPI cards with sparkline | `obc.readout*` + `chart.sparkline` (live ring buffer, no history seed); hard-coded `PrimaryKpi` on `/dashboard` | PARTIAL | No composite "KPI card" symbol (value + delta + sparkline + drill) in the designer. |
| Grids | `table.value`, `table.compare`, `table.timeseries`, `alarm.table` | EXISTS | Tag-level columns; `table.compare` already does one-row-per-asset from an asset query. |
| Trend charts | `chart.trend` / `TrendCore`, ad-hoc trend from any display | EXISTS | Historian-backed, multi-pen, time bar. |
| Breadcrumbs | Viewer trail (session) + decorative `obc.breadcrumb` | PARTIAL | Trail is display-based, not entity-hierarchy-based. |
| Offline/resume with retained snapshot + stale labelling | Redis snapshot-on-open, in-memory retention on disconnect, 8 s stale → grey + NE107 Uncertain, refresh-failure banner | PARTIAL | No explicit "offline since …" label; staleness is per-tag not per-entity. |
| Truss as canonical configuration system | asset-model is the UNS source of truth; displays store path strings with no FK | MISSING | Adopting an external canonical model means either re-pointing `asset-model` or adding an id-based binding and a resolver adapter. |
| Alarm/quality on the object | ISA-18.2 alarm join by `alarmSource`; NE107 per tag | EXISTS (tag-level) | Would need entity-level roll-up (worst-of children). |
| Config validation (unresolvable bindings rejected) | Lexical config-only guard only | MISSING | No path/entity existence check on save or publish. |

## 6. Open questions

1. Does the pitch expect the runtime entity-state topic to replace Sparkplug DDATA for displays, or sit beside it? The viewer's decode path and `metrics` keying (`device/metric`) assume Sparkplug.
2. Would "semantic field" bindings be stored as a new binding kind on `CanvasItem` (entity id + field + role) or as a resolver-side mapping from a synthetic UNS path (e.g. `entity/<id>.production`)? The latter keeps the snapshot schema and `KNOWN_SLOTS` intact.
3. Who owns derived-metric history (`entity.history[...]`) — Flink writing back into IoTDB under the UNS tree (compatible with `/api/hist/trend`), or a new store the historian-bff must front?
4. Persona dashboards: is a persona a display attribute (filterable in the launcher), a folder/ACL convention, or a separate artifact type? Today only `level`, `category`, `tags`, folders and role ACLs exist.
5. Is the orphaned template-service the intended home for `DashboardTemplate` / `SemanticViewDefinition`, or should those be a Truss-side artifact rendered by a new viewer mode?
6. Which "context" fields must survive a drill (shift, product, context revision)? None exist today; they would need a home in the URL contract and the time store.
7. Does adopting Truss as canonical config require id-stable bindings (rename-safe)? Today every binding is a mutable path string with no where-used index.
8. Should the config-only guard become structural (schema validation + asset existence) as part of this work, given the pitch's "validated configuration" framing?
