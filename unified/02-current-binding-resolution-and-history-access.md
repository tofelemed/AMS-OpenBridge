# Current state: binding resolution, live-value contract and history access

Read-only analysis, 2026-09-30, of the AMS-open working tree (branch `feat/v25-next-release`).
Every statement below was checked in code, SQL, compose config or the repo's own docs; items
marked **(inferred)** are conclusions drawn from what was read, not something stated in code.
Where docs and code disagree the code is reported.

## 1. Scope and sources examined

| Area | Files read |
|---|---|
| binding-resolver | `src/services/binding-resolver/Program.cs`, `Services/PathResolver.cs`, `Models/BindingRequest.cs`, `Models/BindingResponse.cs`, `appsettings.json` |
| asset-model (identifier source of truth) | `src/services/asset-model/Models/Asset.cs`, `Program.cs` (endpoints, `asset-events`, self-heal DDL) |
| historian-bff | `src/services/historian-bff/Program.cs`, `IoTDbClient.cs`, `SnapshotReader.cs`, `IoTDbWarmupService.cs` |
| Live plane writers | `src/services/sparkplug-edge-node/.../AlarmMetricPublisher.java`, `SparkplugConfig.java`; `src/flink/.../cplm/LoopLiveRbeJob.java`; `src/services/analysis-service/Consumers/AnalysisResultConsumer.cs`, `Program.cs` |
| IoTDB writers / retention | `src/flink/.../IoTDBPersistenceJob.java`, `src/backend/AMS.Api/BackgroundServices/RawLoopIotDbConsumer.cs`, `infra/docker/iotdb-init-ttl.sh` |
| CPM roles & projections | `src/services/cplm-api/Services/BindingProvenanceProbe.cs`, `Controllers/CpmReadinessController.cs`, `Services/Registry/CpmLoopRegistryService.SignalAssets.cs`; `src/services/ingestion-service/Models/LoopIngestConfig.cs`, `Services/ProfileRegistry.cs` |
| SQL | `database/scripts/10_traverse_assets_schema.sql`, `32_cpm_loop_registry.sql`, `37_rbac_catalog.sql`, `43_traverse_assets_transport_overrides.sql`, `44_cpm_signal_asset_ledger.sql`, `54_cpm_instrument_bindings.sql`, `11_traverse_displays_schema.sql`, `14_traverse_analysis_schema.sql`, `23_analysis_calc_versions.sql` |
| Frontend | `src/frontend-ob/src/hooks/useBindingResolver.ts`, `store/mqttStore.ts`, `store/liveMetric.ts`, `utils/quality.ts`, `components/Designer/{DisplayViewer,SymbolRenderer,TrendCore,openBridgeTheme,types}.tsx/ts`, `hooks/useLoopLive.ts` |
| Gateway / infra | `src/services/gateway/appsettings.json`, `Caching/AssetCacheInvalidator.cs`, `infra/docker/docker-compose.yml` (redis-contract, edge env), `docs/api-gateway.md` |
| Docs / decisions | `MIGRATION_LOG.md` decisions 1-17, `changes_tracker.md` CHG-010 / CHG-024, `prod_decision.md`, `docs/alarm-identity-contract.md`, `docs/architecture-review/06-iotdb-historian.md`, `07-mqtt-sparkplug-live.md`, `04-data-layer-performance.md`, `09-gap-register.md` |
| Tests | `tests/integration/BindingResolverTests.cs`, `tests/binding-resolver.Tests/PathResolverBatchTests.cs`, `tests/historian-bff.Tests/SnapshotReaderTests.cs` (names only) |

## 2. How it works today

### 2.1 Binding model and tables

**What a "binding" is.** A binding is *not* a stored object. It is the run-time answer to
"for this UNS contextual path, which transport carries the *live*, *history* and *alarm* data?".

- **Input**: `path` = UNS contextual path `site/[area/]unit/device[.measurement]` plus `roles`
  = any of `live | history | alarm | all` (`Models/BindingRequest.cs:9-16`, `Program.cs:71-93`).
  "Role" in the resolver means **transport role**, never signal role (PV/SP/...); the CPM schema
  says so explicitly: "Traverse has NO role concept on a tag" (`32_cpm_loop_registry.sql:62-64`).
- **Output** `BindingResponse` (`Models/BindingResponse.cs:31-191`):
  `contextualPath`, `resolved`, `provenance` (`"asset-model"` | `"fallback"`), `error`, and
  - `live`: `mqtt{host,port,protocol,username,wsPath="/mqtt-ws"}`, `sparkplugTopic`, `sparkplugGroup`,
    `sparkplugEdgeNode`, `sparkplugDevice`, `sparkplugMetric`, `redisSnapshotKey`, `snapshotEndpoint`
  - `history`: `ioTDbPath`, `trendEndpoint` (`/api/hist/trend?series=`), `rawEndpoint`
  - `alarm`: `alarmSource` (`site:unit:device`), `signalRHub` (`/hubs/alarms`), `subscribeMethod`
    (`SubscribeToArea`), `kafkaTopic` (`traverse.alarm.live.alarms`), `alarmApiEndpoint`
  - **Absent from the contract**: value, unit, quality, timestamp, data type, engineering limits,
    source system, validity dates. The response is pure addressing.
- **Where the identifiers come from**: `traverse_assets.assets.assets`
  (`10_traverse_assets_schema.sql:21-34`: `contextual_path`, `name`, `asset_type` 1-5,
  `engineering_unit`, `lo/hi_eng_limit`, `parent_id`, `is_deleted`, `created_at`, `updated_at`;
  `template TEXT` added by `21_asset_template_column.sql`) plus five nullable **transport override
  columns** `iotdb_path_override`, `sparkplug_{group,edge,device,metric}_override`
  (`43_traverse_assets_transport_overrides.sql:26-30`). Every transport identifier is a *computed
  property* of `Asset` (`Asset.cs:100-183`): override wins, else derived from the path text.
- **Derivation rules** (`Asset.cs`): `IoTDbPath = root.<path with '/'→'.', ' '→'_'>` (:100-101);
  `SparkplugGroup = site` (:107); `SparkplugEdgeNode = <site>_edge1` (:113-114);
  `SparkplugDevice = <unit>_<device>` when the path has ≥4 segments, bare `<device>` below that
  (:120-130, MIGRATION_LOG decision #17); `SparkplugMetric = text after the '.'` (:136-145);
  `SparkplugTopic = spBv1.0/{group}/DDATA/{edge}/{device}` (:151); `AlarmSource = site:unit:device`
  (:158-168); `RedisSnapshotKey = snapshot:metric:{group}:{edge}:{device}:{metric}` (:174-183).
- **Alias table** `assets.alias_mapping(legacy_path, canonical_path, source_system, is_active,
  created_at)` (`10_...sql:58-72`) maps legacy identifiers (e.g. `source_system='instrumental-pro'`,
  MIGRATION_LOG #17) to a UNS path; resolved via `GET /resolve/alias` → asset-model
  `/aliases/resolve` (`Program.cs:156-179`, `PathResolver.cs:180-203`).
- **Versioning / audit**: none for assets or aliases. The table has only `created_at`/`updated_at`
  (trigger `10_...sql:77-89`); no history table exists (`grep asset_history|asset_versions` over
  `database/scripts` → nothing); alias delete is a hard delete, commented "an alias is
  configuration, not history" (`asset-model/Program.cs:949`); audit-service has no asset consumer
  (only `Auth/TraverseAuth.cs` mentions "asset"). Asset writes publish `{eventType, asset}` on
  the Redis pub/sub channel `asset-events` (`asset-model/Program.cs:1063-1073`) which carries no
  actor identity. **"Who changed the source of X and when" cannot be answered today** beyond
  `updated_at` and the gateway's request logs (inferred).
- **The one effective-dated binding table** is CPM-only: `cpm.signal_device_binding_history`
  (`54_cpm_instrument_bindings.sql:60-86`) records which *Instrumental device* was the primary
  source of a loop signal over `[valid_from, valid_to)`, with `approved_by`, `approved_at`, `note`
  and a GiST exclusion constraint against overlap. It binds `loop_id + signal_role → device_id`
  for instrument-health context; it does **not** feed `PathResolver` and does not change the
  transport a display reads.

### 2.2 Resolution algorithm (single and batch)

`GET /api/bindings/resolve?path=&roles=` (gateway strips `/api/bindings`, `gateway/appsettings.json:120-132`;
policy `binding.resolve`, `37_rbac_catalog.sql:36`):

1. Reject blank path; enforce token `assetScope` prefix claims (`Program.cs:77-83`, `AssetScope:240-252`).
2. `PathResolver.ResolveAsync` (`PathResolver.cs:34-69`):
   a. `GET asset-model /assets/by-path/{segment-escaped path}` with `X-Service-Key`
      (`:149-175`; per-segment escaping because the catch-all route matches literal slashes only).
   b. **Found** → `BuildBindingFromAsset` copies the asset's computed identifiers into the three
      sub-bindings, `provenance="asset-model"` (`:205-221`).
   c. **404 or unreachable** → `BuildBindingFromPath` derives the same shapes from the path string,
      stamped `provenance="fallback"` (`:223-269`). The fallback cannot see overrides, so for any
      asset whose data does not live where its path text says (all CPM loop signals) a fallback
      binding is "resolved and empty" (`BindingResponse.cs:44-53`, `43_...sql:9-14`).
   d. Any exception → `resolved=false, error` (`:59-68`). A resolved fallback still returns HTTP 200.
3. Descriptor URLs are gateway-relative (`Public:HistBase=/api/hist`, `Public:MqttWsPath=/mqtt-ws`,
   `Public:SignalRHub=/hubs/alarms`; PIPE-011, `:271-336`).

**Batch** `POST /api/bindings/resolve/batch {bindings:[{path,roles}]}` ≤ 100 items
(`Program.cs:97-129`): out-of-scope paths are returned unresolved in place; in-scope paths go through
`ResolveManyAsync` → one `POST asset-model /assets/by-paths` (≤ 2 000 paths,
`asset-model/Program.cs:264-278`); results align with the input, per-path fallback for absent paths,
all-fallback when asset-model is down (`PathResolver.cs:78-143`; proven by
`tests/binding-resolver.Tests/PathResolverBatchTests.cs:28-86`).

**"VP by default + param_roles overlay + 400 guard" (CHG-010)** is *not* in the resolver. It lives in
ingestion-service: `LoopIngestConfig.DefaultParamRoles` maps OT leaf names to tuple roles
(`PV→pv, SP→sp, OP→op, MODE→mode, VP→vp, SV→sp, MV→op, P/I/D/GW`, `LoopIngestConfig.cs:37-51`);
a source's `param_roles` overlays that map (null/blank removes an entry, `:58-70`); validation
refuses (HTTP 400, field `loop_ingest.param_roles`) any effective map lacking a source for
pv/sp/op/mode (`changes_tracker.md:425-470`). It is a wire-name → signal-role mapping for the loop
joiner, not a UNS binding.

**Signal-role → UNS path** for CPM: `cpm.loop_registry.tags` JSONB (`32_...sql:42`) and
`cpm.loop_tag_map(loop_id, signal_role, uns_path, source_system, source_tag, unit_conversion)`
(`32_...sql:67-78`). On activate/republish cplm-api **projects one Measurement asset per mapped role**
into traverse_assets with overrides `ioTDbPathOverride = root.site1.cpm.<SafeNode(loopId)>.<role>`,
`sparkplugDeviceOverride = sanitised loopId`, `sparkplugMetricOverride = <role>`
(`CpmLoopRegistryService.SignalAssets.cs:150-183`) and ledgers it in `cpm.loop_signal_asset`
(`44_cpm_signal_asset_ledger.sql:16-24`). That projection is the only mechanism that makes
path+role resolve to where loop data actually lands.

### 2.3 Live transport (Kafka → Sparkplug/EMQX + Redis)

- **Writer**: `sparkplug-edge-node` consumes `traverse.alarm.live.alarms`, `traverse.live.metrics`,
  `traverse.cpa.live.loop.metrics` (`SparkplugConfig.java:70-75`, compose `:874-875`) and per record
  publishes Sparkplug B `DDATA` on `spBv1.0/{group}/DDATA/{edge}/{device}` (`AlarmMetricPublisher.java:456`)
  after an `NBIRTH`/`DBIRTH` (`:392-402`), and writes Redis (`:512-527`):
  - key `snapshot:metric:{group}:{edge}:{device}:{metric}`; value JSON `{"v":…,"q":<int>,"ts":<ms>}`
    plus, since v2.5, optional `"src"`,`"ver"`,`"emit"` (source/verified/emission ms) and `"qt"`
    (quality token) (`:495-503`); `SETEX` with `REDIS_TTL_SECS` default **3600 s** (`SparkplugConfig.java:87`);
  - index sets `snapshot:devices` and `snapshot:index:<device>` (`:521-523`, DATA-09).
  - Alarm devices get six fields (`alarmId, severity, state, acknowledged, conditionActive, priority`),
    always `q=192` (`:601-625`).
- **Loop device rule**: `device = loopId.replaceAll("[^a-zA-Z0-9_\\-]","_")` under the *edge's own*
  group/edge (`ams_site1`/`ams_edge1` per compose), metrics `pv/sp/op/vp/mode/quality`
  (`:335-381`); `useLoopLive.ts:20-21,61` mirrors that rule client-side.
- **Quality**: producer verdict `GOOD|UNCERTAIN|BAD|UNKNOWN` → OPC code 192/64/0 (`:474-491`);
  carried as Sparkplug metric *property* `quality` plus `sourceTs/verifiedTs/emissionTs/qualityToken`
  (`:453-470`). The generic `traverse.live.metrics` branch reads `quality` with `asInt()` and defaults
  to 192 when absent (`:302`).
- **Redis tier**: `redis-contract` (`ams-redis-contract`): `maxmemory 256mb`, `noeviction`, AOF
  `everysec`, `requirepass` (compose `:152-166`); binding-resolver/historian-bff read it via
  `Redis__Host=redis-contract` (`:916,1356`). The cache tier `redis` stays `volatile-lru`.
- **Staleness**: `LoopLiveRbeJob` republishes every known signal every 300 s (heartbeat) so keys never
  lapse while the job runs; "staleness is signalled by the TIMESTAMP, not by absence"
  (`LoopLiveRbeJob.java:62-88`). Browser: `liveMetric.ts:12-20` typed `{value, quality, ts,
  sourceTs?, verifiedTs?, emissionTs?, qualityToken?}`; missing quality is **0 = BAD**, never GOOD
  (`:28-45`); `utils/quality.ts:33-49` maps code + staleness → `good | uncertain | bad | maintenance |
  outOfService` with NE107 labels (`:19-25`); `isStale` threshold **8 000 ms** (`openBridgeTheme.ts:71`).
- **Browser subscription**: `mqttStore` connects `/mqtt-ws?access_token=<JWT>` (`:267`), subscribes
  `spBv1.0/+/NBIRTH/+` and `spBv1.0/+/DBIRTH/+/#` globally (`:286-287`), and per-screen exact DDATA
  topics via `subscribeScreen` (`:373-408`); decoded metrics land in a Map keyed `${device}/${metric}`
  (`:657,672`); paint-on-open comes from `GET /api/hist/snapshot?assets=<device,…>` (`:45,462-488`).
- **Other Redis writers**: analysis-service writes derived results *directly* to the snapshot key
  (`{value,q:192,ts}`, 24 h TTL) and registers the output path as a Measurement asset
  (`AnalysisResultConsumer.cs:104-130`) — it bypasses the edge node, so derived values have a Redis
  snapshot but **no Sparkplug DDATA** (inferred from the absence of a Kafka produce in that path).
- **Producers of `traverse.live.metrics`**: `ProfileRegistry.cs:39-47` declares an `MQTT_TELEMETRY`
  profile with that destination, but no subscriber implementation references the topic
  (`grep` over ingestion-service finds only the registry); LiveStateJob was moved off it (STR-12,
  `LiveStateJob.java:40,92`). **(inferred)** Today only loop metrics and alarm metrics reach the
  live plane; generic UNS process tags do not.

### 2.4 History transport (IoTDB via historian-bff)

Routes (`historian-bff/Program.cs`, policy `historian.view`, gateway prefix `/api/hist`):

| Route | Params | Notes |
|---|---|---|
| `GET /trend` | `series, start, end, width(10..2000), measurements?, envelope?` | `GROUP BY ([start,end), (end-start)/width ms)`; default columns are **alarm-shaped** (`avg(severity), last_value(state|ack_status|priority)`, `IoTDbClient.cs:100-102`); process series must pass `measurements`; `envelope=true` adds `_min/_max/_avg` (`:117-120, 336-342`) |
| `GET /last` | `series, measurements?` | `SELECT last …` — durable last-known value with its own timestamp (`Program.cs:124-161`) |
| `GET /raw` | `series, start, end, maxCount(≤500), offset` | `ORDER BY time DESC LIMIT/OFFSET` (`:163-199`) |
| `GET /raw/cursor` | `…, maxCount(≤9 999), cursor` | timestamp-cursor paging for evidence replay (`:201-247`, `IoTDbClient.cs:34-35`) |
| `GET /summary` | `series, start, end, measurement` | min/max/avg/sum/count (`:249-289`) |
| `GET /snapshot` | `assets=<dev,…>|*`, `limit(≤2000)`, `offset` | **Redis**, not IoTDB: `SMEMBERS snapshot:index:<dev>` + `MGET`, 2 s in-memory burst cache, lazy pruning of expired members and dead devices (`:291-355`, `SnapshotReader.cs`) |
| `GET /series` | `prefix?` | `SHOW TIMESERIES`, default `root.ams.site1.alarms.**` (`:357-379`) |

- Series must match `^root(\.[A-Za-z0-9_]+)+$`, measurements `^[A-Za-z0-9_]+$` (`IoTDbClient.cs:74-84`);
  IoTDB REST v2 non-200 codes inside HTTP 200 are raised as errors (`:52-66`); largest LIMIT is
  `rest_query_default_row_size_limit - 1 = 9 999` (`:22-35`).
- **UNS path → IoTDB path**: `root.` + path with `/`→`.` (`Asset.cs:100-101`), unless overridden.
- **Trees and writers** (verified in code; the table in `docs/architecture-review/06-iotdb-historian.md` agrees):
  `root.ams.site1.alarms.<alarmId sanitised [^A-Za-z0-9_]→_>` with measurements
  `severity,state,ack_status,condition_active,priority,source_name,condition_name` ← Flink
  `IoTDBPersistenceJob` (`:20-36`; `docs/alarm-identity-contract.md`);
  `root.site1.cpm.<SafeNode(loopId)>.{pv,sp,op,vp,mode}` ← `RawLoopIotDbConsumer.cs:13-29,239-243`;
  `root.site1.cpm.<loop>.kpi.*` ← cplm-api `IotDbWriteClient`;
  `root.<uns path>` ← edge node best-effort REST insert only when a `traverse.live.metrics` record
  carries `path` (`AlarmMetricPublisher.java:326-330, 405-420`).
- **Retention** (`infra/docker/iotdb-init-ttl.sh:27-34, 85-127`): database `root.ams` TTL 365 d;
  database `root.site1` TTL 90 d; a 730 d TTL on `root.site1.cpm.**.kpi.**` is attempted but on IoTDB
  1.3.2 a path-pattern TTL rewrites the database TTL, so KPIs inherit 90 d. Plant Postgres has **no
  TimescaleDB** (`prod_decision.md:16`); CPM result retention is by `analytics.retention_policy`
  rows and daily partitions (`prod_decision.md` §3).
- Gateway caches `GET /api/hist/trend*|summary*` for 10 s and `GET /api/bindings/resolve*` for 30 s
  (`docs/api-gateway.md:101-102`); rate classes `snapshot` 30/min, `historian` 120/min per user (`:81-82`).

### 2.5 Alarm transport

`AlarmBinding` advertises hub `/hubs/alarms`, method `SubscribeToArea`, topic
`traverse.alarm.live.alarms`, and `GET /api/v1/alarms/active?sourceNameContains=site:unit:device`
(`PathResolver.cs:317-336`). `AlarmHub` groups are `role-{r}`, `station-{s}`, `server-{id}`,
`area-{id}`, `alarms-{PRIORITY}` (`AlarmHub.cs:51-112`); broadcasts go to `Clients.All`,
`alarms-{priority}` and `server-{serverId}` (`:300-321`) — no publisher targets `area-*`
(only the join at `:104`), so `SubscribeToArea` narrows nothing today **(inferred)**.
The Designer does not consume `binding.alarm` at all: symbols carry their own `alarmSource`
string matched against `alarmStore` (`types.ts:36`, `SymbolRenderer.tsx:192-198, 417`).
Alarm history for a live alarm is derived by `GET /resolve/alarm?alarmId=` (`Program.cs:138-151`),
the single sanitisation authority (DATA-07).

### 2.6 Batch APIs (CHG-024, built 2026-09-13, folded into release v2.4+)

| API | Route | Purpose / payload | Measured (lab, `changes_tracker.md:1361-1370`) |
|---|---|---|---|
| Readiness | `GET /api/v1/cpm/loops/{loopId}/readiness` (`CpmReadinessController.cs:106`) | checks `registry_row, monitoring_enabled, loop_type, tag_{pv,sp,op,mode}, tag_vp, peer_links, binding_provenance, evidence_short, evidence_verdict, cplm_jobs` (`:149-214`); `binding_provenance` = one `POST /resolve/batch` for roles `pv,sp,op,vp,mode` with `roles:["live"]`, forwarding `X-Auth-*` headers, and fails if any slot's `provenance != "asset-model"` (`BindingProvenanceProbe.cs:22-89`) | per loop 3.22/0.70/0.24 s → 1.81/0.38/0.18 s |
| Bulk resolve | `POST /api/bindings/resolve/batch` (≤100) → `POST /assets/by-paths` (≤2 000) | see 2.2 | 20 paths 0.93/0.17/0.41 s → 0.13/0.06/0.11 s |
| Bulk republish | `POST /api/v1/cpm/loops/bulk-republish-evidence {loopIds[]}` (≤5 000), policy `cpm.manage` | re-projects signal assets + evidence per loop with per-item outcomes, one audit event | 3 loops 1.7-6.2 s in series → 0.21 s |
| KPIs latest | `GET /api/v1/cpm/loops/{id}/kpis/latest?resolutions=1m,…,60m&limit=12` | `{byResolution:{kind:{tier,count,samples}}}` from shared `KpiSql.cs` | 6 calls 1.14-1.60 s → 0.34-0.38 s |
| Roles | `GET /api/auth/roles?include=permissions` | one JOIN in auth-service | 5 calls 0.79 s → 18-43 ms |

### 2.7 Caching and invalidation

- binding-resolver has **no cache**: every resolve hits asset-model (`PathResolver.cs:149-175`).
- Gateway response cache: `GET /api/bindings/resolve*` 30 s, `GET /api/assets*` 60 s
  (`docs/api-gateway.md:101`; `ot-data-integration` memory notes the 60 s trap). `asset-events`
  busts only `cache:assets:*` (`AssetCacheInvalidator.cs:20`); cached binding responses age out.
- Browser: react-query `['binding', path, role]` `staleTime` 60 s; `DisplayViewer` primes all bound
  paths of a display in one batch before slot hooks mount (`useBindingResolver.ts:51-107`,
  `DisplayViewer.tsx:311-323`).
- Asset writes → `PUBLISH asset-events` (Redis pub/sub, fire-and-forget, no replay). Consumers found:
  the gateway invalidator and, per the comment at `asset-model/Program.cs:1055-1059`, ingestion's
  alias cache. Nothing re-resolves open displays; a moved asset is picked up when the 30 s / 60 s
  caches expire and the display re-resolves (inferred).
- Display snapshots store only `bindings: {slot: "<uns path>"}` (`types.ts:13`,
  `11_traverse_displays_schema.sql:57-89` trigger rejects process values — decision #9).

### 2.8 Sequence: a display opens, resolves and subscribes

```mermaid
sequenceDiagram
  participant UI as frontend-ob (DisplayViewer)
  participant GW as gateway :8081
  participant BR as binding-resolver
  participant AM as asset-model (traverse_assets)
  participant HB as historian-bff
  participant RC as redis-contract
  participant MQ as EMQX (/mqtt-ws)
  participant EN as sparkplug-edge-node
  UI->>GW: POST /api/bindings/resolve/batch {paths, roles:[live]}
  GW->>BR: /resolve/batch (X-Auth-* headers)
  BR->>AM: POST /assets/by-paths (X-Service-Key)
  AM-->>BR: assets incl. overrides
  BR-->>UI: bindings[] {provenance, live{sparkplugTopic, sparkplugDevice, sparkplugMetric, redisSnapshotKey}}
  UI->>GW: GET /api/hist/snapshot?assets=dev1,dev2
  GW->>HB: /snapshot
  HB->>RC: SMEMBERS snapshot:index:dev1 ; MGET keys
  HB-->>UI: {assets:{dev1:{metric:{v,q,ts,src?,emit?}}}}
  UI->>MQ: SUBSCRIBE spBv1.0/<group>/DDATA/<edge>/<device>
  EN->>MQ: DDATA (quality property, sourceTs/emissionTs)
  EN->>RC: SETEX snapshot:metric:... TTL 3600
  MQ-->>UI: DDATA → metrics.set("device/metric") → quality.ts (NE107) + isStale(8 s)
  UI->>GW: GET /api/hist/trend?series=root.…&measurements=pv (trend dialog)
```

## 3. Code map

| Concern | file:line | Note |
|---|---|---|
| Resolve endpoints, asset scope | `src/services/binding-resolver/Program.cs:71-227` | `/resolve`, `/resolve/batch` (≤100), `/resolve/alarm`, `/resolve/alias`, `/preview` |
| Resolution + fallback | `src/services/binding-resolver/Services/PathResolver.cs:34-143, 223-269` | provenance stamp; ≥4-segment device rule |
| Response contract | `src/services/binding-resolver/Models/BindingResponse.cs:31-191` | no value/quality/unit fields |
| Transport derivation + overrides | `src/services/asset-model/Models/Asset.cs:86-183` | override ?? derived |
| Batch path lookup | `src/services/asset-model/Program.cs:264-278` | `by-paths` ≤2 000 |
| Asset change event | `src/services/asset-model/Program.cs:1063-1073` | Redis pub/sub `asset-events` |
| Override columns | `database/scripts/43_traverse_assets_transport_overrides.sql:26-30` | nullable, null = derive |
| Signal roles (CPM) | `database/scripts/32_cpm_loop_registry.sql:67-78` | CHECK list of 9 roles |
| Effective-dated device binding | `database/scripts/54_cpm_instrument_bindings.sql:60-86` | CPM instrument health only |
| Signal-asset projection | `src/services/cplm-api/Services/Registry/CpmLoopRegistryService.SignalAssets.cs:150-183` | writes overrides |
| Readiness provenance check | `src/services/cplm-api/Services/BindingProvenanceProbe.cs:22-89` | fails on `fallback` |
| param_roles overlay + defaults | `src/services/ingestion-service/Models/LoopIngestConfig.cs:37-70` | CHG-010 |
| Redis snapshot writer | `.../sparkplug-edge-node/.../AlarmMetricPublisher.java:495-527, 601-625` | `{v,q,ts,src,ver,emit,qt}`, SETEX 3600 |
| Sparkplug publish + quality | `.../AlarmMetricPublisher.java:453-491` | property `quality` 192/64/0 |
| Loop device sanitiser | `.../AlarmMetricPublisher.java:353` | `[^a-zA-Z0-9_-]→_` |
| RBE + heartbeat | `src/flink/.../cplm/LoopLiveRbeJob.java:28-88` | 300 s heartbeat, ts = staleness |
| Redis contract tier | `infra/docker/docker-compose.yml:152-166` | noeviction, AOF, 256 MB |
| Historian routes | `src/services/historian-bff/Program.cs:88-379` | trend/last/raw/raw-cursor/summary/snapshot/series |
| IoTDB SQL + limits | `src/services/historian-bff/IoTDbClient.cs:22-35, 74-124` | 9 999 rows; alarm-shaped defaults |
| Snapshot reader | `src/services/historian-bff/SnapshotReader.cs:22-79` | SMEMBERS+MGET, prunes dead devices |
| Alarm historian path | `src/flink/.../IoTDBPersistenceJob.java:20-36` | `root.ams.site1.alarms.<sanitised>` |
| Loop historian path | `src/backend/AMS.Api/BackgroundServices/RawLoopIotDbConsumer.cs:13-29, 239` | `root.site1.cpm.<loop>.{pv,…}` |
| IoTDB TTL | `infra/docker/iotdb-init-ttl.sh:27-34, 85-127` | 365 d / 90 d |
| Frontend resolve hooks | `src/frontend-ob/src/hooks/useBindingResolver.ts:33-168` | batch prime, staleTime 60 s |
| MQTT store | `src/frontend-ob/src/store/mqttStore.ts:45-50, 267-287, 373-408, 636-673` | topics, Map key `device/metric` |
| Quality model | `src/frontend-ob/src/store/liveMetric.ts:12-89`, `utils/quality.ts:19-58`, `openBridgeTheme.ts:71` | NE107 mapping, 8 s stale |
| Derived (calc) values | `src/services/analysis-service/Consumers/AnalysisResultConsumer.cs:104-130` | direct Redis write, 24 h TTL |
| Calculation grammar | `src/flink/.../ExpressionEvaluator.java:7-16` | arithmetic only, inputs from the command |
| Gateway routes/cache | `src/services/gateway/appsettings.json:120-132, 230-235`; `docs/api-gateway.md:30,38,101` | prefix strip; 30 s / 10 s TTL |
| Tests | `tests/integration/BindingResolverTests.cs:116-329`; `tests/binding-resolver.Tests/PathResolverBatchTests.cs:27-86` | 8 + 5 tests |

## 4. Constraints, settled decisions and traps

**Settled decisions** (`MIGRATION_LOG.md:288-330`): #2 bind through UNS (path + role); #5 UNS
`root.<site>.<unit>.<device>.<measurement>`; #9 displays store configuration only; #11 quality on
reopen NE107/ISA-18.2; #14 one database per service; #16 edge-only auth (the resolver trusts
`X-Auth-*`; internal calls use `X-Service-Key`, `Program.cs:20-30`); #17 four-level paths with
Areas as segments and the ≥4-segment device rule shared by asset-model and the fallback.
Flink-only compute (#3) is why calculations run in `AnalysisExecutionJob` and why the pitch's
"calculation binding" would have to land there.

**Traps documented in code or tracker:**
- Fallback provenance: a path with no asset row resolves to a *different* device id
  (`crude1_pump101` vs `pump101`) and looks resolved (`BindingResponse.cs:44-53`); readiness treats
  `fallback` as unresolved (`BindingProvenanceProbe.cs:7-9`).
- Three device-id derivations exist (asset-model, resolver fallback, analysis-service
  `SnapshotKeyFor` bare-device, `analysis-service/Program.cs:593-609`); `ot-data-integration` memory
  records "transport fields must come from asset-model".
- Alarm identity: historian sanitiser drops hyphens, Sparkplug device sanitiser keeps them
  (`docs/alarm-identity-contract.md` "known, deliberate divergence"); changing it = topic + key migration.
- `/resolve` advertised a non-existent hub method until fixed (`PathResolver.cs:328-331`);
  descriptor URLs must be gateway-relative (PIPE-011).
- Quality mangling on the generic branch: `node.get("quality").asInt()` turns `"GOOD"` into 0 while
  absence becomes 192 (`AlarmMetricPublisher.java:302`; open item in `ot-data-integration` memory).
  `prod_decision.md` §4 mandates `quality_protocol = STRING_ENUM` on every loop source.
- Redis: snapshots live on `redis-contract`, not `redis` (compose `:118`); Lua scripts bypass
  `maxmemory` checks, test noeviction with plain commands (`plan05` memory); index set hygiene is
  lazy (dead devices pruned only on read, `SnapshotReader.cs:54-79`); the analysis-service writes
  derived keys with a 24 h TTL and no index entry, so `/snapshot?assets=*` cannot list them (inferred).
- IoTDB: REST reports query failures as HTTP 200 + code (`IoTDbClient.cs:52-66`); LIMIT must stay
  below 10 000 (`:22-35`); 1.3.2 cannot set a sub-tree TTL (`iotdb-init-ttl.sh:110-117`); registry
  rows with dotted `root.…` paths cannot be resolved by the resolver (memory, loop registry picker).
- Ops: use `127.0.0.1` not `localhost` from host tooling; gateway TTL-caches `GET /api/assets*` 60 s;
  `GET /assets/by-path` returns 200 with an empty body when absent (memory notes).
- `traverse.live.metrics` has no live producer today (2.3), so the "UNS process tag" live path is
  exercised only by simulators (`scripts/sim/limit_watchdog.py:42-46`) **(inferred)**.

## 5. Mapping to the Truss living-asset pitch

| Pitch concept | What exists today | Status | Notes / gap |
|---|---|---|---|
| Binding = semantic field of an entity → data source | UNS contextual path (`site/area/unit/device.measurement`) → transport descriptors; the "field" *is* the path's measurement segment | PARTIAL | No entity/field abstraction separate from the path; semantic names live only as `assets.name` and CPM roles |
| Live binding (MQTT topic) | `LiveBinding.sparkplugTopic` + `redisSnapshotKey`, derived from the path or overrides | EXISTS | Sparkplug B only; no arbitrary MQTT topic or PI tag as a source |
| Historical binding (IoTDB path) | `HistoryBinding.ioTDbPath` + historian-bff routes | EXISTS | IoTDB only; three trees with different key rules |
| Historical binding (PI-AF path / PI Web API) | none — `alias_mapping.source_system` can *name* a PI source but nothing reads PI | MISSING | Would need a PI reader beside `IoTDbClient` and a source discriminator in `HistoryBinding` |
| Calculation binding (formula over other fields) | `analysis.analysis_definitions(target_path, configuration, output_path)` + Flink `ExpressionEvaluator` (arithmetic, inputs carried on the command); result written to Redis + registered as a Measurement asset | PARTIAL | Output is a plain UNS tag, not a binding kind; no formula-over-bound-fields graph, no dependency validation, no MQTT publish for derived values |
| Bindings versioned with context (validFrom/validTo, revision) | assets/overrides are mutable rows with `updated_at` only; `cpm.signal_device_binding_history` is effective-dated but CPM-instrument-only | MISSING (transport) / PARTIAL (CPM device) | No revision, no validity window, no "who approved" for transport bindings |
| "As-of" resolution for historical queries | resolver has no time parameter; `/trend` takes only the *current* IoTDB path | MISSING | A re-pointed override silently changes what old ranges read |
| Compiler validates each binding references an existing source | readiness `binding_provenance` proves the *asset exists*; nothing proves the Redis key, topic or IoTDB series actually has data | PARTIAL | `/last` and `/snapshot` could be probed; no compile step exists |
| Historical Query Service (entity, metric, from, to) | historian-bff `/trend|/raw|/summary` keyed by IoTDB series + measurement; caller must resolve first | PARTIAL | Two hops (resolve → hist); alarm-shaped defaults leak into process queries |
| Per-field state `{value, unit, timestamp, quality GOOD/STALE/UNAVAILABLE, source}` | `{v,q,ts,src,ver,emit,qt}` snapshot + browser `LiveMetric`/`quality.ts` (good/uncertain/bad/maintenance/outOfService + 8 s stale) | PARTIAL | Unit is on the asset row, not the value; no `source` provenance on the value; STALE is a UI derivation, not a stored state; UNAVAILABLE ≈ missing key |
| UI requests semantic metric names, never raw tags | Designer slots hold UNS paths (`bindings:{slot:path}`); CPM UI uses `loopId` + role | PARTIAL | UNS path is semantic-ish but is also the physical key everywhere (IoTDB, Sparkplug, Redis) |
| Per-binding provenance ("who changed the source") | `asset-events` has no actor; no history table; audit-service does not record asset writes | MISSING | Only gateway logs + `updated_at` |
| Knowledge-graph relationships | `assets.assets.parent_id` tree + `31_assets_relationships.sql` (`AssetRelationship.cs`) | PARTIAL | Hierarchy + typed relationships exist; not examined in depth here |
| Batch / readiness / bulk republish | CHG-024 endpoints (2.6) | EXISTS | Performance numbers documented |

## 6. Open questions

1. Does anything produce `traverse.live.metrics` in production, or is the generic UNS live path
   effectively dormant (only loop and alarm metrics reach Sparkplug/Redis)? The MQTT_TELEMETRY
   profile exists but no subscriber code was found.
2. Is `SubscribeToArea` intended to work? No publisher targets `area-*` groups; the Designer ignores
   `binding.alarm` and filters by `alarmSource` client-side.
3. Should derived (calculation) values be routed through the edge node so they get DDATA, DBIRTH
   and index entries like every other metric, instead of the analysis-service's direct Redis write?
4. If bindings become effective-dated, which store is authoritative for history — a new
   `assets.asset_binding_history` beside `assets.assets`, or a generalisation of
   `cpm.signal_device_binding_history`? Who approves, and does the resolver get an `asOf` parameter?
5. The KPI TTL: on IoTDB 1.3.2 `root.site1.cpm.**.kpi.**` inherits 90 d rather than the intended 730 d.
   Is that accepted at the plant, or is an IoTDB upgrade planned?
6. Three sanitiser rules (historian, Sparkplug device, analysis-service bare device) are documented as
   deliberate; any semantic-name layer on top must pick one canonical identifier per asset and keep
   the others as derived aliases.
