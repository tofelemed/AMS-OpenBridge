# Current state: asset model and hierarchy

Read-only analysis of the Traverse `asset-model` service and everything that writes to or reads from it, as a baseline for evaluating the Truss "living-asset" proposal. Every statement below was verified in code, SQL or config unless marked **(inferred)**. Where docs and code disagree the code is trusted and the disagreement is called out.

## 1. Scope and sources examined

| Area | Files |
|---|---|
| Service | `src/services/asset-model/Program.cs` (1259 lines, all endpoints), `Models/Asset.cs`, `Models/AssetRelationship.cs`, `Models/AliasMapping.cs`, `Data/AssetDbContext.cs`, `Services/DeletedAssetPurgeService.cs`, `Auth/TraverseAuth.cs`, `appsettings.json`, `Dockerfile`, `asset-model.csproj` |
| Schema | `database/scripts/10_traverse_assets_schema.sql`, `15_…2site_plant.sql`, `16_pumpstation_20_pumps.sql`, `21_asset_template_column.sql`, `31_assets_relationships.sql`, `43_traverse_assets_transport_overrides.sql`, `48_hdpe_plant_hierarchy.sql`, `37_rbac_catalog.sql`; CPM side `32_cpm_loop_registry.sql`, `44_cpm_signal_asset_ledger.sql`, `54_cpm_instrument_bindings.sql`; plant pack `migration/schema/02-traverse_assets.sql`, `migration/02-apply-schemas.sh`, `migration/03-seed.sh` |
| Consumers | `src/services/binding-resolver` (Program.cs, Services/PathResolver.cs), `src/services/cplm-api` (Registry/*.cs), `src/services/analysis-service/Consumers/AnalysisResultConsumer.cs`, `src/services/ingestion-service` (Pipeline/LoopRegistryCache.cs, Models/LoopIngestConfig.cs), `src/services/gateway` (Caching/AssetCacheInvalidator.cs, appsettings.json, Limits/BodyLimitMiddleware.cs), `infra/docker/docker-compose.yml` |
| UI | `src/frontend-ob/src/components/Administration/{PlantModelConfig,PlantModelImport,PlantModelStatus,AliasConfig}.tsx`, `Designer/{AssetBrowser,DisplayViewer}.tsx`, `hooks/{useAssetMetadata,useAssetSearch}.ts`, `Cpm/plantLocation.tsx` |
| Docs | `MIGRATION_LOG.md` (decisions 5 and 17), `assetmodel.md`, `HIERARCHY-CHECKLIST.md`, `docs/plant-model/README.md`, `docs/ot-data-integration/02-uns-asset-tag-loop-configuration.md`, `docs/api-gateway.md`, `docs/architecture-review/09-databases.md`, `prod_decision.md`, `checklist.md`, `changes_tracker.md`, `architecture_document.md` |
| Tests | `tests/integration/BindingResolverTests.cs`, `tests/binding-resolver.Tests/PathResolverBatchTests.cs`, `tests/cplm-api.Tests/{BindingProvenanceProbeTests,BulkRepublishTests}.cs` |

Not examined: `src/xmlgraphics-batik-main ScreeN Import/` (retired), Flink jobs (none reference the asset model — verified by grep over `src/flink/src`).

## 2. How it works today

### 2.1 Data model (database `traverse_assets`, schema `assets`)

Three tables. EF Core maps them in `AssetDbContext.cs:16-101`; there is **no migration runner** — schema changes need both a `database/scripts/NN_*.sql` file and the startup self-heal DDL in `Program.cs:55-97`.

**`assets.assets`** (`10_traverse_assets_schema.sql:21-34`, extended by 21 and 43):

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `contextual_path` | TEXT NOT NULL | **The identity and the transport address.** Unique among live rows: partial index `WHERE NOT is_deleted` (`10_…sql:41-43`, `AssetDbContext.cs:46`). Not case-normalised. |
| `name` | TEXT | human label, freely editable |
| `asset_type` | INTEGER CHECK 1..5 | `1=Site 2=Area 3=Unit 4=Device 5=Measurement` (`Asset.cs:186-193`, `10_…sql:25,38`) |
| `description`, `engineering_unit`, `lo_eng_limit`, `hi_eng_limit` | TEXT / DOUBLE | EU + HMI scale limits, meaningful on Measurements only (UI sends them only for type 5, `PlantModelConfig.tsx:226-228`) |
| `template` | TEXT | free-text "type label" (`Tank`, `Pump`, `CpmLoop`, `CpmLoopSignal`) for collections / asset-relative displays (`21_…sql:14-15`, `Asset.cs:54`). Not a FK to any template catalogue. |
| `parent_id` | UUID self-FK, no cascade | containment edge (`10_…sql:30`) |
| `is_deleted` | BOOLEAN | soft delete; purged after 30 days (§2.4) |
| `created_at`, `updated_at` | TIMESTAMPTZ | `updated_at` also bumped by trigger `trg_assets_updated_at` (`10_…sql:77-89`) |
| `iotdb_path_override`, `sparkplug_group_override`, `sparkplug_edge_override`, `sparkplug_device_override`, `sparkplug_metric_override` | TEXT NULL | per-asset transport exceptions; NULL = derive from path (`43_…sql:26-30`, `Asset.cs:86-90`) |

There is **no JSONB metadata column**; every attribute is a typed column. Indexes: `parent_id`, `asset_type`, `created_at`, `template WHERE NOT is_deleted`, and a GIN full-text index on name+description (`10_…sql:51-52`) that **no query uses** — all API search is EF `.Contains` → `LIKE '%x%'` (`Program.cs:156, 687`) **(inferred: index dead)**.

**Derived (not stored) transport fields**, computed in `Asset.cs:100-183` and returned in every `AssetDto` (`Program.cs:1076-1104`):
- `IoTDbPath` = override ?? `root.` + path with `/`→`.` (`Asset.cs:100-101`)
- `SparkplugGroup` = site segment; `SparkplugEdgeNode` = `{site}_edge1` (`Asset.cs:107-114`)
- `SparkplugDevice` = `{unit}_{device}` when the path has **≥ 4 segments**, bare `device` at 3 (`Asset.cs:120-130`) — decision #17's rule
- `SparkplugMetric` = text after the first dot of the last segment; `SparkplugTopic` = `spBv1.0/{group}/DDATA/{edge}/{device}`; `AlarmSource` = `{site}:{unit}:{device}`; `RedisSnapshotKey` = `snapshot:metric:{group}:{edge}:{device}:{metric}` (`Asset.cs:136-183`)

**`assets.alias_mapping`** (`10_…sql:58-72`, `AliasMapping.cs`): `legacy_path` + `source_system` (unique pair) → `canonical_path`, `is_active`. Source systems in use: `instrumental-pro` (59 rows seeded by `48_…sql:76-137`) and `ot-gateway` (written by the CSV importer, `PlantModelImport.tsx:223`).

**`assets.asset_relationships`** (`31_…sql:18-39`, `AssetRelationship.cs`): directed edge `from_asset_id → to_asset_id`, `rel_type` CHECK IN (`PEER`, `UPSTREAM_OF`, `DOWNSTREAM_OF`, `CASCADE_PRIMARY`, `CASCADE_SECONDARY`), `created_at`, `created_by`; unique per (from, to, type); `ON DELETE CASCADE` on both ends; self-edge forbidden. PEER is stored once and queried both ways (`AssetRelationshipTypes.Inverse`, `AssetRelationship.cs:56-64`).

### 2.2 Hierarchy rules

The hierarchy is stored **twice**: as the materialised path string `contextual_path` and as `parent_id`. The path is the source of truth; `parent_id` must agree with it (`Program.cs:203-228`).

Path grammar (`HierarchyRules`, `Program.cs:1201-1258`):
- Slash-separated segments of `[A-Za-z0-9_-]+`; a `.measurement` suffix (one or more dotted parts) is allowed on the **last** segment only; max 512 chars, max 6 segments (`:1207-1225`).
- Level ↔ segment count: Site = 1; Area = 2 (`site/area`); Unit = 2–3 (`site/unit` legacy flat, or `site/area/unit`); Device = 3–5; Measurement = 2–6 and must contain a dot; non-Measurement paths must not contain a dot (`:1229-1241`).
- Natural parent = path minus last `.part` (Measurement) or minus last `/segment` (`ParentPathOf`, `:1249-1258`).
- On create, an explicit `parentId` must exist, be a strictly higher level (`parent.Type < child.Type`) and be exactly the natural parent; an omitted `parentId` is **derived** from the path prefix, resolved against the DB and against the same bulk batch (`:208-228`, `:348-415`).

So the model is Site → Area → Unit → Device → Measurement, **with Area optional** (legacy `houston/crude1/pump101.speed` is 3-segment; HDPE `hdpe/section_100/u1001_…/45fic109.pv` is 4-segment). Decision #17 (`MIGRATION_LOG.md:315-327`) makes Areas real path segments for the HDPE plant.

Slug conventions (decision #17, `48_…sql:5-10`, `PlantModelConfig.tsx:18-20`): segments are lowercase `snake_case`; a unit slug gets a `u` prefix because IoTDB nodes must not start with a digit (`u1001_polymerization_reactor_1`); display labels live in `name`; origin Instrumental-Pro IDs (`Section 100`, `HDPE Plant\Section 100\1001-…`) resolve via `alias_mapping`. The server grammar does **not** enforce lowercase; only the UI slugger does.

Seeded HDPE tree (`48_hdpe_plant_hierarchy.sql`): 1 site `hdpe`, 8 areas (`section_100…800` + `unassigned`), 26 units (25 real + `unassigned/unassigned`). The plant pack reseeds the same tree (`migration/03-seed.sh:19-20`). Demo trees `houston`/`dallas` (scripts 15/16) are kept for lab sims (`HIERARCHY-CHECKLIST.md:94`).

Measurement leaves: a Measurement is a row of type 5 whose path is `<device>.<measurement>`; it carries EU/limits and, for CPLM-projected signals, the five transport overrides. Control loops are **Device** rows (template `CpmLoop`) under their Unit, with PV/SP/OP/VP/MODE Measurements under them (`SignalAssets.cs:209-218, 168-186`).

Filter cascade (`Program.cs:613-655`, helper `:1037-1052`): `GET /assets/filters/sites`, `/areas?site=`, `/units?site=[&area=]`, `/devices?site=&unit=[&area=]` — children resolved through `parent_id` after locating the parent by path+type; unknown parent → empty list. Consumed by `Cpm/plantLocation.tsx:87-106`.

```
traverse_assets.assets                          (one row per node; path = identity)
  hdpe                        Site(1)   parent_id = NULL
  └ hdpe/section_300          Area(2)   parent_id → hdpe
    └ hdpe/section_300/u3005_butene_recovery            Unit(3)
      ├ …/u3005_butene_recovery/45ft109                 Device(4)  template=Transmitter
      │   └ …/45ft109.pv                                Measurement(5) EU=m3/h lo=0 hi=250
      └ …/u3005_butene_recovery/45fic-109               Device(4)  template=CpmLoop   (cplm-api projection)
          ├ …/45fic-109.pv   Measurement(5) template=CpmLoopSignal, iotdb_path_override=root.<site>.cpm.<loop>.pv
          └ …/45fic-109.op   …                           sparkplug_device_override=<sanitised loopId>
asset_relationships: 45fic-109 --UPSTREAM_OF--> 45pic-110   (CPLM G13 disturbance context)
alias_mapping:       '45FT109.PV' (ot-gateway) -> hdpe/section_300/u3005_butene_recovery/45ft109.pv
```

### 2.3 API surface (all routes under `/api` at the gateway, `docs/api-gateway.md:31-32`)

Gateway strips `/api` and proxies `/api/assets[/**]` and `/api/aliases/**` to `asset-model:5000` (`gateway/appsettings.json:135-153`). Auth is edge-only: the gateway validates the JWT and injects `X-Auth-*`; asset-model builds a principal from those headers (`TraverseAuth.cs:92-148`) and enforces one policy per permission key. Internal callers use `X-Service-Key`, scoped to `asset.view,asset.edit` (`docker-compose.yml:970`). Role matrix (`37_rbac_catalog.sql:52-84`): `asset.view` → Viewer, Operator, Engineer, Admin; `asset.edit` → Engineer, Admin.

| Method + route | Purpose | Permission | Program.cs |
|---|---|---|---|
| GET `/health` | DB + Redis ping | none | 102-135 |
| GET `/assets?type&parentId&search&skip&take` | list, take ≤ 1000, ordered by path | asset.view | 139-166 |
| GET `/assets/{id}` | one asset | asset.view | 169-173 |
| GET `/assets/by-path/{**path}` | lookup by path; **200 with null body when absent** | asset.view | 183-187 |
| POST `/assets/by-paths` `{paths[]}` | batch lookup, ≤ 2000 | asset.view | 264-278 |
| POST `/assets` | create; grammar + parent rules; 409 on live duplicate | asset.edit | 190-257 |
| POST `/assets/bulk` `{creates[],updates[],deletes[]}` | ≤ 5000 items, one SaveChanges, **partial success** with per-item `errors`; deletes are soft and child-guarded, the CPLM guard is skipped here | asset.edit | 286-518 |
| PUT `/assets/{id}` | PATCH semantics; overrides: null = untouched, `""` = clear | asset.edit | 521-552 |
| DELETE `/assets/{id}` | soft delete; 409 if live children; 409 if cplm-api reports referencing loops or **cannot answer (fail closed)** | asset.edit | 558-611 |
| GET `/assets/filters/{sites,areas,units,devices}` | dropdown cascade | asset.view | 619-655 |
| POST `/assets/search` `{root,returnAllDescendants,assetType,template,search,take}` | structural search (path-prefix subtree or direct children), take ≤ 2000 | asset.view | 662-692 |
| GET `/assets/{id}/descendants?type` | path-prefix subtree | asset.view | 696-705 |
| GET `/assets/{id}/children` | one level via parent_id | asset.view | 708-717 |
| GET `/assets/{id}/hierarchy` | root→node chain (one query per level) | asset.view | 721-735 |
| GET `/assets/{id}/relationships?type&direction=in|out|both` | edges with far-end resolved | asset.view | 745-792 |
| POST `/assets/{id}/relationships` `{toAssetId,relType}` | idempotent create; PEER mirror rejected | asset.edit | 795-835 |
| DELETE `/assets/{id}/relationships?toAssetId&relType` | | asset.edit | 838-855 |
| GET `/aliases/resolve?legacy&source` | legacy → canonical (+asset if present) | asset.view | 860-875 |
| GET `/aliases?search&source&includeInactive` | list | asset.view | 880-894 |
| POST / PUT / DELETE `/aliases[/{id}]` | CRUD; identity (legacy_path, source) immutable; delete is hard | asset.edit | 897-958 |
| POST `/aliases/bulk` `{creates[],deletes[]}` | ≤ 5000 | asset.edit | 962-1023 |

Not present: any export endpoint, any move/re-parent endpoint (`HIERARCHY-CHECKLIST.md:93` deferred), any version/history endpoint, any asset-scope filtering on reads (G-10 deferred).

### 2.4 Events, lifecycle, caching

- **Events**: asset-model publishes to **Redis pub/sub channel `asset-events`** only — no Kafka dependency at all (`asset-model.csproj:16-22`, grep for Kafka empty). Payload `{eventType: "asset.created"|"asset.updated"|"asset.deleted", asset: AssetDto}` (`Program.cs:1068-1073`) and `{eventType: "alias.created"|"alias.updated"|"alias.deleted"|"alias.bulk"}` (`:1061-1066`). Fire-and-forget, after commit, not transactional, not persisted, no key/ordering.
- **Subscribers**: exactly one — the gateway's `AssetCacheInvalidator` deletes `cache:assets:*` on any message (`AssetCacheInvalidator.cs:19-20, 62-85`). The comment in `Program.cs:1054-1058` claiming ingestion tag-resolution caches also key off this channel is **not true in code** (no reference in `src/services/ingestion-service`).
- **Caching**: gateway response cache 60 s TTL on `GET /api/assets*` and `/api/aliases*` plus the event bust (`docs/api-gateway.md:99`); asset-model itself has no cache; binding-resolver has no cache (grep `cache|MemoryCache` empty); frontend react-query with a 30 s poll for collections (`useAssetSearch.ts:22-23`). Body limits on `/assets/bulk` and `/assets/by-paths` are enforced at the gateway (`BodyLimitMiddleware.cs:55-56`).
- **Lifecycle**: soft delete only; `DeletedAssetPurgeService` hard-deletes rows with `is_deleted AND updated_at < now - Maintenance:PurgeDeletedAfterDays` (default 30, 0 disables) daily, skipping rows still referenced as `parent_id` (`DeletedAssetPurgeService.cs:42-54`). No `is_active`, no published/draft state, no version number, no history table, no validity dates, no audit-service emission from asset-model (only `asset_relationships.created_by`).
- **Startup self-heal**: `ALTER TABLE … ADD COLUMN IF NOT EXISTS` for `template` and the five override columns and `CREATE TABLE IF NOT EXISTS asset_relationships` (`Program.cs:55-97`).

### 2.5 Consumers (who calls asset-model and why)

| Caller | Config | Calls | Behaviour when asset-model is down |
|---|---|---|---|
| **binding-resolver** | `Services:AssetModel` (`Program.cs:22`) | `GET /assets/by-path`, `POST /assets/by-paths` (CHG-024 batch), `GET /aliases/resolve` (`PathResolver.cs:126,159,185`) | Falls back to deriving transports from the path string with the same ≥4-segment device rule (`PathResolver.cs:48-57, 249`), stamped `Provenance="fallback"` (`:264`); overrides are invisible in fallback |
| **cplm-api** | `Cpm:AssetModelUrl` (`Program.cs:52`) | `POST /assets/by-paths` (location validation G-07, `AssetModel.cs:61-128`), `POST /assets/bulk` (signal projection, `SignalAssets.cs:168-236`; retirement `CpmLoopRegistryService.cs:418-423`), `DELETE/PUT /assets/{id}` (release, `AssetModel.cs:210-222`), `GET /assets/{id}/relationships` (peer/upstream → `cpm.loop_link`, `Projection.cs:27-70`) | Activation refuses unmodelled locations unless `AllowUnmodelledLocation` (`CpmLoopRegistryContracts.cs:72`); link projection returns 0 and G13 degrades to NOT_EVALUATED |
| **analysis-service** | `Services:AssetModel` (`Program.cs:47`) | `POST /assets` type=5 for each calculation output path in UNS form (`AnalysisResultConsumer.cs:118-135`) | Debug-logged and swallowed |
| **gateway** | route map | proxy + cache + invalidator | 502 |
| **frontend-ob** | `/api/assets`, `/api/aliases` | Administration (Plant Model, Tag Aliases, status strip), Designer `AssetBrowser` (`?type=1` then `?parentId=`), `DisplayViewer` asset-relative swap (`by-path` then `search` by template/type, `DisplayViewer.tsx:268-288`), `useAssetMetadata` (EU/limits by path), `useAssetSearch` (collections), `plantLocation` (filters cascade) | pickers empty; EU falls back to regex guess |
| **asset-model → cplm-api** (reverse) | `Services:CplmApi` (`docker-compose.yml:974`) | `GET /api/v1/cpm/loops/referencing?path&assetType` for the delete guard (`Program.cs:574-602`, `AssetModel.cs:136-167`) | delete fails closed |

Not consumers: `ams-api` (no reference), any Flink job, `ingestion-service`, `historian-bff`, `display-service`, `template-service`, `audit-service` — they only consume the *shapes* (IoTDB path, Redis key, alarm source) that the derivation rules produce (`assetmodel.md:206`).

### 2.6 Tag / OPC item / loop-signal association

There is no single tag→asset table. Association lives in three places:
1. **The path itself**: a Measurement's `contextual_path` *is* its IoTDB series and Sparkplug metric (§2.1). Plant telemetry that arrives at the derived location needs no mapping row.
2. **`alias_mapping`**: external names (DCS/OT tag, Instrumental-Pro ID, PI-AF path) → canonical path. Written by the CSV importer (`ot_tag` column → `source_system='ot-gateway'`, `PlantModelImport.tsx:185-229`) and by `48_…sql`. Read only by `GET /aliases/resolve` and binding-resolver's `/resolve/legacy` (`binding-resolver/Program.cs:154-178`, **no callers found** in the frontend or services). `docs/plant-model/README.md` says these rows make "incoming telemetry resolve"; **the ingestion service never reads them** (grep empty) — it joins MQTT topics to loops via `topic_template` capturing `{site}{fcs}{loop}{param}` (`LoopIngestConfig.cs:13-14`) and a cached copy of `GET /api/v1/cpm/loops` (`LoopRegistryCache.cs:32`).
3. **CPLM registry (database `traverse_cplm`)**: `cpm.loop_tag_map(loop_id, signal_role ∈ PV/SP/OP/VP/MODE/STATUS/QUALITY/UPSTREAM/UTILITY, uns_path, source_tag)` (`32_…sql:67-78`) is the role-typed link from a loop to its signal paths; `cpm.loop_signal_asset(loop_id, signal_role, contextual_path, asset_id, created_by_projection)` (`44_…sql:16-23`) is the ledger of which asset rows the projection created or merely overrode; `cpm.loop_registry.asset_id` and `site/area/unit` are soft references validated at activation, never FKs (`32_…sql:4-7, 22-28`). Signal roles deliberately live in `cpm`, not on `assets.assets` (`32_…sql:62-65`).

## 3. Code map

| Concern | File:line | Note |
|---|---|---|
| Asset entity + derived transports | `src/services/asset-model/Models/Asset.cs:8-184` | ≥4-segment device rule at 120-130 |
| Level enum | `Models/Asset.cs:186-193` | 1..5, mirrored by SQL CHECK `10_…sql:25` |
| Relationship types | `Models/AssetRelationship.cs:38-64` | 5 CPLM-motivated edge types |
| Alias entity | `Models/AliasMapping.cs:5-32` | |
| EF mapping, self-FK, indexes | `Data/AssetDbContext.cs:16-101` | self-FK mapped at 57 (insert-ordering trap) |
| Path grammar + parent derivation | `Program.cs:1201-1258` | `HierarchyRules` |
| Create / parent consistency | `Program.cs:190-257` | |
| Bulk create/update/delete | `Program.cs:286-518` | partial success, in-batch parent wiring 348-415 |
| Delete guards | `Program.cs:558-611` | children 566-572; cross-DB loop guard 574-602 fail-closed |
| Filter cascade | `Program.cs:613-655, 1037-1052` | |
| Structural search | `Program.cs:662-692` | path-prefix LIKE |
| Relationships API | `Program.cs:737-855` | |
| Alias API | `Program.cs:857-1023` | |
| Redis event publish | `Program.cs:1061-1073` | channel `asset-events` |
| DTO shape | `Program.cs:1076-1104` | |
| Purge of soft deletes | `Services/DeletedAssetPurgeService.cs:21-66` | 30-day default |
| Header-trust auth | `Auth/TraverseAuth.cs:92-148, 170-190` | one policy per permission key |
| Base schema + seed | `database/scripts/10_traverse_assets_schema.sql:21-118` | |
| Template column | `database/scripts/21_asset_template_column.sql:14-15` | |
| Relationship table | `database/scripts/31_assets_relationships.sql:18-39` | |
| Override columns | `database/scripts/43_traverse_assets_transport_overrides.sql:26-30` | |
| HDPE tree + aliases | `database/scripts/48_hdpe_plant_hierarchy.sql:18-137` | |
| RBAC keys and roles | `database/scripts/37_rbac_catalog.sql:34-35, 45-84` | |
| Plant-pack schema/seed | `migration/schema/02-traverse_assets.sql`, `migration/03-seed.sh:19-20` | 10+31+43 folded into one CREATE |
| Compose wiring | `infra/docker/docker-compose.yml:944-983` | no host port; service perms 970; CplmApi 974 |
| Gateway route / cache / limits | `src/services/gateway/appsettings.json:135-153`, `Caching/AssetCacheInvalidator.cs:19-95`, `Limits/BodyLimitMiddleware.cs:55-56` | 60 s TTL + event bust |
| Resolver lookup + fallback | `src/services/binding-resolver/Services/PathResolver.cs:34-69, 126, 159, 237-264` | provenance `fallback` |
| CPLM location validation | `src/services/cplm-api/Services/Registry/CpmLoopRegistryService.AssetModel.cs:61-128` | G-07 |
| CPLM delete-guard count | `…AssetModel.cs:136-167` | matches registry segments + tag paths |
| CPLM signal/device projection | `…CpmLoopRegistryService.SignalAssets.cs:33, 150-236` | `CpmLoopSignal` / `CpmLoop`, overrides |
| CPLM link projection | `…CpmLoopRegistryService.Projection.cs:27-70` | edges → `cpm.loop_link` |
| CPLM registry tables | `database/scripts/32_cpm_loop_registry.sql:18-78`, `44_cpm_signal_asset_ledger.sql:16-23` | soft refs |
| Effective-dated instrument bindings (CPLM only) | `database/scripts/54_cpm_instrument_bindings.sql:25-47` | `[valid_from,valid_to)` EXCLUDE gist |
| Derived-measurement registration | `src/services/analysis-service/Consumers/AnalysisResultConsumer.cs:104-136` | best effort |
| Plant Model editor | `src/frontend-ob/src/components/Administration/PlantModelConfig.tsx:3-20, 195-252, 353` | create/edit/delete |
| CSV importer | `…/PlantModelImport.tsx:27-28, 119, 212, 223-229` | 12 columns |
| Status strip | `…/PlantModelStatus.tsx:21, 58` | counts per level |
| Alias admin | `…/AliasConfig.tsx` | list/create/delete/CSV |
| Designer tree / swap / metadata / collections | `Designer/AssetBrowser.tsx:24-27`, `Designer/DisplayViewer.tsx:264-290`, `hooks/useAssetMetadata.ts:18-25`, `hooks/useAssetSearch.ts:18-25` | |
| CPM location picker | `Cpm/plantLocation.tsx:87-106, 269, 305` | "(not in UNS)" flag |
| Import scripts | `scripts/import-plant-tags.ps1:24-31`, `scripts/import-cpm-loops.ps1:25-36` | via gateway; `-DryRun` |
| Decision record | `MIGRATION_LOG.md:292 (#5), 315-327 (#17)` | |
| Gap register / live state | `assetmodel.md:187-305`, `HIERARCHY-CHECKLIST.md:84-96` | 2026-08-24 |

## 4. Constraints, settled decisions and traps

Settled (do not re-litigate):
- **Decision #17** (`MIGRATION_LOG.md:315-327`): 4-level `site/area/unit/device[.measurement]`, Areas are real segments, `{unit}_{device}` Sparkplug id at ≥4 segments, loops are Device nodes (ISA-88 control module) under their Unit, lowercase snake_case slugs with `u` prefix, labels in `name`, origin IDs via `alias_mapping`.
- **Decision #5** (`MIGRATION_LOG.md:292`) and `CLAUDE.md` still state the UNS as `root.<site>.<unit>.<device>.<measurement>` (no area). **Code disagrees**: `IoTDbPath` is `root.` + the full path, so HDPE series are `root.hdpe.section_300.u3005_….45ft109.pv` (5 nodes). Trust the code / decision #17.
- Bind through the UNS by path + role; displays store paths only (CQRS); the path **is** the transport address, so renaming a segment moves IoTDB series, MQTT topics and Redis keys — which is why there is no rename/move endpoint (`HIERARCHY-CHECKLIST.md:93`).
- One database per service; `traverse_cplm` ↔ `traverse_assets` links are soft references reconciled by cplm-api, never FKs (`32_…sql:4-7`).
- Edge-only auth; asset-model is the only service that accepts internal `X-Service-Key` calls, scoped to `asset.view,asset.edit` (`docker-compose.yml:967-970`).

Traps recorded in code, tracker and memory:
- EF must keep the `parent_id` self-FK mapped (`AssetDbContext.cs:50-57`), otherwise same-batch parent+child inserts order by random GUID and intermittently violate `assets_parent_id_fkey`.
- Every new write path **must** publish on `asset-events` or the gateway serves stale admin dropdowns for 60 s (`AssetCacheInvalidator.cs:1-12`).
- Schema changes need both the SQL script and the startup self-heal block (`Program.cs:55-97`); pre-43 volumes 500'd on every read until G-11 was fixed.
- `GET /assets/by-path` returns **200 + null**, never 404, for missing paths (`Program.cs:175-187`); callers must null-check.
- binding-resolver's fallback cannot see overrides — CPLM loop signals resolved "successfully" to empty locations until 43 + the projection existed (`43_…sql:4-14`); readiness must check `binding_provenance`, not `resolved`.
- CPLM projection only covers PV/SP/OP/VP/MODE; STATUS/QUALITY/UPSTREAM/UTILITY are deliberately not projected (`SignalAssets.cs:26-33`). A loop onboarded by SQL alone has **no** UNS assets until `POST /api/v1/cpm/loops/{id}/republish-evidence` runs (`changes_tracker.md:545-551`).
- Bulk delete skips the cross-DB loop guard on purpose (retirement would deadlock otherwise, `Program.cs:471-477`).
- Live-state numbers (lab, 2026-08-24, `assetmodel.md:216-232`): 15,898 rows of which 15,521 soft-deleted (97.6 %), 219 of 341 measurements parentless, 0 areas, 0 aliases, 1 relationship — all since addressed by the purge, parent derivation, HDPE seed and alias seed. Plant scale today: 144 loops (`prod_decision.md:42`) / 161 imported (`memory: ot-data-integration`) / 170 with bounds (`changes_tracker.md:552-553`), each projecting up to 6 asset rows (Device + 5 signals) **(inferred: ~1,000 projected rows)**.
- `prod_decision.md` records **no** asset-model settings (no purge window, no cache TTL) — the defaults (`PurgeDeletedAfterDays=30`, gateway 60 s) are what the plant runs **(inferred)**.
- `/assets/{id}/hierarchy` is N+1 (one query per level, `Program.cs:726-732`); `/descendants` and `search` use `LIKE 'prefix/%'` on `contextual_path` (`:671, 701`) — fine at thousands of rows, untested beyond.
- Deferred by design (`HIERARCHY-CHECKLIST.md:91-96`): asset-scope filtering on reads (G-10), `is_active` lifecycle, `POST /assets/{id}/move`, relocating the `narnia` loops.

## 5. Mapping to the Truss living-asset pitch

| Pitch concept | What exists today | Status | Gap / notes |
|---|---|---|---|
| Typed entities Plant / Unit / Section / System / Equipment / InstrumentPosition / Device / ControlLoop / Signal / APMModel | Five fixed levels as an integer enum (Site, Area, Unit, Device, Measurement) plus a free-text `template` label; ControlLoop = Device with `template='CpmLoop'`; Signal = Measurement | PARTIAL | No entity-type catalogue, no per-type attribute schema, no System / InstrumentPosition / APMModel; "Section" is Area; attributes are fixed columns, no JSONB |
| Typed relationships CONTAINS, HAS_INSTRUMENT, HAS_DEVICE, MONITORS, SOURCES_FROM, EVALUATES, KPI_EVALUATES | CONTAINS via `parent_id` + path; five process edges PEER / UPSTREAM_OF / DOWNSTREAM_OF / CASCADE_PRIMARY / CASCADE_SECONDARY; loop→signal role links live in `cpm.loop_tag_map`, not in the asset graph; instrument→signal primary binding in `cpm.signal_device_binding_history` | PARTIAL | Edge vocabulary is closed by a CHECK constraint; no edge attributes; no cross-database edges; MONITORS/EVALUATES/KPI_EVALUATES absent |
| Bitemporal versioning (validFrom / validTo / recordedAt) + context revision id | None on assets: `created_at`, `updated_at`, soft delete, 30-day purge. Effective dating exists **only** for CPLM instrument bindings (`54_…sql:25-47`) | MISSING | No history table, no revision, no as-of reads, no snapshot/publish state |
| KPI definitions (formula, scope entity, time basis, unit, target, drill policy) | Nothing on the asset; EU + lo/hi limits only. CPLM gate config bundles and analysis-service calculations live in other services/databases | MISSING (in this slice) | No KPI entity, no target, no scope/time-basis metadata on any node |
| Bindings: live MQTT topic / historical IoTDB or PI-AF / calculation | Derived from the path (Sparkplug topic, IoTDB path, Redis key, alarm source) with five nullable override columns; resolved per path+role by binding-resolver; `alias_mapping` for external names; calculation outputs registered as plain Measurements with no formula | EXISTS / PARTIAL | Binding is implicit-by-convention, not a first-class typed object; no `mode: source|calculate`, no formula on the asset, no PI-AF adapter in the live path |
| Compiler / validation (bindings resolve, no cycles, non-overlapping aggregation, uniqueness, no overlapping validity) | Write-time grammar, level adjacency, natural-parent and unique-live-path checks; delete guards (children, referencing loops, fail-closed); CPLM readiness probe checks binding provenance at read time | PARTIAL | No cycle detection on relationship edges (only self-edge), no aggregation rules, no validity to overlap, no whole-model validation pass, no "compile" step |
| Versioned runtime package on a compacted Kafka config topic | asset-model has **no Kafka producer**; changes go to Redis pub/sub (`asset-events`, cache-bust only). No Flink job reads the asset model | MISSING | cplm-api does broadcast loop/gate config to Flink, but from `traverse_cplm`, not from the asset model |
| Flink job with broadcast config + keyed per-entity "living object" state | None for assets; Flink keys state by loop id / alarm id from CPLM and alarm topics | MISSING | |
| Issue / episode ledger | None on assets; CPLM has event frames / episodes keyed by loop | MISSING (in this slice) | |
| Runtime API (entity state, drill, navigation) | REST configuration API: CRUD, bulk, search, filters cascade, children/descendants/hierarchy, relationships, aliases | PARTIAL | Pure configuration; no live state, no computed assessments, no navigation/drill rules |
| Persona dashboards | Plant Model admin page, status strip, Designer tree/collections | MISSING | |
| External-ID / legacy path mapping | `alias_mapping` (legacy_path, source_system → canonical) | EXISTS | Consumed only by resolver endpoints, not by ingestion |
| Import / export | CSV import (UI 3-step + `import-plant-tags.ps1`), HDPE SQL seed; **no export** | PARTIAL | No round-trip, no diff/preview against a versioned baseline |
| Scope / security on the model | Two permission keys (`asset.view`, `asset.edit`), edge-only auth | PARTIAL | No per-subtree / asset-scope authorization (G-10 deferred) |

## 6. Open questions

1. Decision #5 / `CLAUDE.md` still describe a 4-node UNS without Area while the code emits 5-node IoTDB paths for HDPE — should the decision text be corrected, and does anything (retention policies, IoTDB storage groups) assume the shorter form?
2. `alias_mapping` rows with `source_system='ot-gateway'` are written by the importer but read by nothing in the telemetry path — is the `ot_tag` column meant to feed a future ingestion joiner, or is the README wrong?
3. What are the current production row counts (assets by type, aliases, relationships) after the purge? The only live numbers are lab figures from 2026-08-24.
4. Is the `template` label meant to become a real type catalogue (with attribute schemas), or stay a free-text tag for collections?
5. Relationship edges are typed for CPLM's G13 only — who else (displays, alarm correlation, as `31_…sql:12-13` anticipates) is expected to write them, and is any cycle check required before that?
6. No history/versioning exists; the pitch's bitemporal model would need a decision on whether the *path* (the transport address) can ever change over time, which today it cannot.
7. Does the plant's `prod_decision.md` need to record `Maintenance:PurgeDeletedAfterDays` and the gateway asset cache TTL as settings of record?
8. `GET /aliases/resolve` and binding-resolver `/resolve/legacy` have no callers found — are they dead or reserved for the `.pdix` importer path?
