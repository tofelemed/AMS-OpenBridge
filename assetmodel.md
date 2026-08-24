# `asset-model` — Deep Analysis, Consumer Map, and a Plant → Area → Unit Build Plan

**Scope:** `src/services/asset-model` (the UNS source of truth), its database `traverse_assets`,
every consumer of it, and what to adopt from the *Instrumental Pro* Plant → Area → Unit
standalone specification.
**Method:** source read + schema read + **live queries against the running stack** (2026-08-24).
**Status:** analysis + plan only. No code changed.

---

## Part 0 — Executive summary

| Question | Answer |
|---|---|
| What is this service? | A ~750-line .NET 8 minimal API over three tables. It is the **single declaration of what exists in the plant**, and the **only place** that computes IoTDB paths, Sparkplug topics, Redis snapshot keys, and alarm sources. |
| How is mapping managed? | **Nothing is stored twice.** `contextual_path` (`site/[area/]unit/device[.measurement]`) is the natural key; all five physical transports are **computed properties in C#** ([Asset.cs](src/services/asset-model/Models/Asset.cs)) with five nullable per-asset override columns as the escape hatch. |
| "Its DB is read by six services" — true? | **No, and this matters.** Exactly **one** process holds a connection string to `traverse_assets`: asset-model itself. The number counts *dependents on the data*, not DB readers. Verified breakdown in Part 4. |
| What's actually in the DB? | 377 live rows of 15,898 (**15,521 soft-deleted, never purged**). 2 Sites, **0 Areas**, 3 Units, 31 Devices, 341 Measurements — of which **219 are parentless orphans** and 217 are CPLM-projected. `alias_mapping` is **empty**. `asset_relationships` has **1 row**. |
| Does the Plant→Area→Unit spec apply? | **The tree already exists** — do NOT add `plants`/`areas`/`units` tables. What is missing is everything *around* it: the cascade filter API, the admin UI, delete guards, path validation, and import validation. Those are exactly what the spec describes, and they port cleanly. |
| Biggest trap for adopting a 3-level hierarchy | Introducing an **Area** level changes `contextual_path` from 3 to 4 segments, which **silently changes the derived Sparkplug device id** for every asset under it (Part 7, G-01). This is a data-plane break, not a cosmetic one. |
| Biggest trap for the real plant data | The origin's natural-key IDs contain **spaces** (`Section 100`, `1001-Polymerization Reactor 1`). Those cannot be UNS path segments. Part 8.3 gives the slug + display-name split. |

---

## Part 1 — What the service is

```
src/services/asset-model/
├── Program.cs             749 lines — the entire API (minimal-API style, no controllers)
├── Models/
│   ├── Asset.cs           193 — entity + 8 COMPUTED transport projections + AssetType enum
│   ├── AliasMapping.cs     32 — legacy/OT tag → canonical UNS path
│   └── AssetRelationship.cs 65 — non-hierarchical edges + AssetRelationshipTypes helper
├── Data/AssetDbContext.cs  94 — EF Core mapping (schema "assets"), computed props Ignore()d
├── Auth/TraverseAuth.cs         — synced copy of src/services/_shared/TraverseAuth.cs
└── appsettings.json / Dockerfile / .csproj
```

Runtime: `traverse-asset-model` container, **no published host port** (Plan 04 lockdown).
Reachable only via the gateway on `8081` at `/api/assets/*` and `/api/aliases/*`, or in-network
at `http://asset-model:5000`.

Two infrastructure dependencies:
- **PostgreSQL** `traverse_assets` (`ConnectionStrings__TraverseAssets`) — the store.
- **Redis** — *pub/sub only*, not a cache. Every create/update/delete publishes to the
  `asset-events` channel ([Program.cs:637-642](src/services/asset-model/Program.cs#L637-L642)).
  This is the cache-invalidation signal for downstream consumers.

### 1.1 Startup self-healing (no migration runner)

The service has **no EF migrations**. On boot it runs raw idempotent DDL
([Program.cs:31-62](src/services/asset-model/Program.cs#L31-L62)):
`ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS template TEXT` and the full
`assets.asset_relationships` DDL — duplicating `database/scripts/21_…` and `31_…` so an
already-initialised volume converges without a wipe. Failures are logged as warnings, not fatal.

**Consequence for any schema change you make:** a new column must be added in *two* places —
a `database/scripts/NN_….sql` for fresh installs **and** the startup block for existing volumes.
The transport-override columns (43_…) were added to the SQL script **but not** to the startup
block, so a pre-43 volume that never re-ran init would 500 on every read. Worth fixing while
you are in here.

---

## Part 2 — The data model

### 2.1 `assets.assets` — the UNS

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `contextual_path` | TEXT NOT NULL | **The natural key.** Unique *among live rows only*: `idx_assets_contextual_path_unique … WHERE NOT is_deleted` |
| `name` | TEXT NOT NULL | display label; defaults to the last path segment on create |
| `asset_type` | INT NOT NULL, CHECK 1–5 | 1=Site 2=Area 3=Unit 4=Device 5=Measurement |
| `description` | TEXT | searchable (GIN tsvector index on name+description — **declared but never used**; the API uses `LIKE`) |
| `engineering_unit` | TEXT | free text (`PSI`, `degC`, `%`) |
| `lo_eng_limit` / `hi_eng_limit` | float8 | HMI scaling; read by `useAssetMetadata` |
| `template` | TEXT | free-text type label (`Pump`, `Tank`, `CpmLoopSignal`) — powers collections + asset-relative display swap |
| `parent_id` | UUID → self | **hierarchy stored twice** (here *and* in the path string) with nothing keeping them consistent |
| `is_deleted` | bool | soft delete. **There is no `is_active`.** |
| `created_at` / `updated_at` | timestamptz | trigger `trg_assets_updated_at` maintains `updated_at` |
| `iotdb_path_override` | TEXT NULL | ┐ |
| `sparkplug_group_override` | TEXT NULL | │ five transport escape hatches |
| `sparkplug_edge_override` | TEXT NULL | │ NULL = derive from the path |
| `sparkplug_device_override` | TEXT NULL | │ written by cplm-api's signal projection |
| `sparkplug_metric_override` | TEXT NULL | ┘ |

Indexes: unique-live-path, `parent_id`, `asset_type`, `created_at`, `template WHERE NOT is_deleted`, GIN full-text.

### 2.2 The mapping mechanism — *computed*, not stored

This is the part worth understanding before touching anything. Eight properties on `Asset` are
`Ignore()`d by EF and evaluated in C# on every read
([Asset.cs:88-190](src/services/asset-model/Models/Asset.cs#L88-L190)):

| Derived field | Rule (override wins) | `houston/crude1/pump101.discharge_press` |
|---|---|---|
| `IoTDbPath` | `root.` + path, `/`→`.`, ` `→`_` | `root.houston.crude1.pump101.discharge_press` |
| `SparkplugGroup` | segment[0] | `houston` |
| `SparkplugEdgeNode` | `{segment[0]}_edge1` | `houston_edge1` |
| `SparkplugDevice` | **≥4 segments → `{seg[-2]}_{device}`; else `{device}`** | `pump101` (3 segments) |
| `SparkplugMetric` | text after the first `.` in the last segment | `discharge_press` |
| `SparkplugTopic` | `spBv1.0/{group}/DDATA/{edge}/{device}` | `spBv1.0/houston/DDATA/houston_edge1/pump101` |
| `AlarmSource` | `{seg[0]}:{seg[-2] or "default"}:{device}` | `houston:crude1:pump101` |
| `RedisSnapshotKey` | `snapshot:metric:{g}:{e}:{d}:{m}` | `snapshot:metric:houston:houston_edge1:pump101:discharge_press` |

**The path string IS the mapping.** There is no mapping table, no join, no lookup. Change the
path text and you change where the platform looks for the data. That is why path-shape rules
are safety-critical here in a way they are not in an ordinary CRUD app.

The overrides exist because that assumption breaks for CPLM loop signals: those live in IoTDB at
`root.<site>.cpm.<loopId>.<role>` (keyed by **loop id**, written by `RawLoopIotDbConsumer`) and
publish under `ams_site1/ams_edge1` with device = sanitized loop id. Without overrides such an
asset resolves "successfully" to a location nothing writes.

### 2.3 `assets.alias_mapping` — the OT bridge

`(id, legacy_path, canonical_path, source_system, is_active, created_at)`, unique on
`(legacy_path, source_system)`. Designed as the **OT tag → UNS path** bridge so the DCS never has
to be renamed. **Live row count: 0.** API surface is `GET /aliases/resolve` + `POST /aliases`
only — no list, no update, no delete, no bulk. It is declared infrastructure that nothing uses yet.

### 2.4 `assets.asset_relationships` — the graph

`(id, from_asset_id, to_asset_id, rel_type, created_at, created_by)` with
`rel_type ∈ {PEER, UPSTREAM_OF, DOWNSTREAM_OF, CASCADE_PRIMARY, CASCADE_SECONDARY}`,
FK-cascading on both endpoints, unique per `(from,to,type)`, self-edge blocked by CHECK.

PEER is symmetric-in-meaning but stored as **one directed row** — every reader must query both
directions. The API's `effectiveRelType` field inverts inbound edges so the caller sees the
relation *as seen from the queried asset*.

Its reason to exist is CPLM gate **G13** (disturbance context): with no peer/upstream edges the
disturbance soft-block never fires and an oscillating loop that is being disturbed from upstream
is misdiagnosed as valve stiction. **Live row count: 1.**

---

## Part 3 — API surface (complete)

Base = `/api/assets` and `/api/aliases` through the gateway; `PathRemovePrefix: /api`.

| Method | Route | Permission | Notes |
|---|---|---|---|
| GET | `/health` | none | DB + Redis; 503 when degraded |
| GET | `/assets?type=&parentId=&search=&skip=&take=` | `asset.view` | take capped at 1000; `search` is `LIKE` on path+name; returns `{total, skip, take, assets[]}` |
| GET | `/assets/{id}` | `asset.view` | 404 when missing |
| GET | `/assets/by-path/{**path}` | `asset.view` | **Returns `200` with a `null` body when absent** — deliberate; absence is normal, 404s spammed the console |
| POST | `/assets/by-paths` | `asset.view` | batch of by-path, ≤2000 paths, misses simply absent |
| POST | `/assets` | `asset.edit` | validates **only** non-blank path + unique-live-path |
| POST | `/assets/bulk` | `asset.edit` | ≤5000 items; `{creates, updates, deletes}`; **partial success by design**, errors listed per item |
| PUT | `/assets/{id}` | `asset.edit` | PATCH semantics; on overrides `null`=untouched, `""`=clear to derived |
| DELETE | `/assets/{id}` | `asset.edit` | **soft delete, no guards** |
| POST | `/assets/search` | `asset.view` | structural only: `root`, `returnAllDescendants` (path-prefix), `assetType`, `template`, `search`; take 1–2000 |
| GET | `/assets/{id}/children` | `asset.view` | one level, by `parent_id` |
| GET | `/assets/{id}/descendants?type=` | `asset.view` | path-prefix, unbounded |
| GET | `/assets/{id}/hierarchy` | `asset.view` | root→self, **one query per level** (N+1 by design) |
| GET | `/assets/{id}/relationships?type=&direction=` | `asset.view` | direction `in\|out\|both`; resolves the far end |
| POST | `/assets/{id}/relationships` | `asset.edit` | both endpoints must be live; PEER mirror rejected; idempotent (`status:"exists"`) |
| DELETE | `/assets/{id}/relationships?toAssetId=&relType=` | `asset.edit` | deletes either direction for PEER |
| GET | `/aliases/resolve?legacy=&source=` | `asset.view` | 404 if no mapping; `{canonicalPath, asset\|null}` |
| POST | `/aliases` | `asset.edit` | no uniqueness pre-check → relies on the DB index |

### 3.1 Auth

Edge-only per MIGRATION_LOG decision #16. `AddTraverseAuth()` validates RS256 against
auth-service JWKS *or* accepts `X-Service-Key` for internal callers.
**asset-model is the only service that receives internal `X-Service-Key` calls**, scoped to
`Auth__ServicePermissions: "asset.view,asset.edit"` (compose line 908).

`asset.view` is held by viewer/operator/engineer/admin; `asset.edit` by engineer/admin
([37_rbac_catalog.sql](database/scripts/37_rbac_catalog.sql#L34-L35)).

**Gap:** there is **no asset-scope filtering**. `GET /assets` returns everything regardless of the
token's `assetScope` claim — which historian-bff *does* enforce for series reads. An operator
scoped to one site still browses the whole plant tree.

### 3.2 Gateway treatment

- Routes `api-assets`, `api-assets-bare`, `api-aliases` → cluster `asset-model`.
- **60 s response cache** on `/api/assets` and `/api/aliases`
  ([ResponseCacheMiddleware.cs:47-48](src/services/gateway/Caching/ResponseCacheMiddleware.cs#L47-L48)).
- Body-limit exemptions for `/assets/bulk` and `/assets/by-paths`.

---

## Part 4 — Who depends on it (the "six services" question, settled)

**Direct database access:** exactly **one** process. A repo-wide search for
`Database=traverse_assets` returns three hits — `docker-compose.yml:898`,
`asset-model/Program.cs:13`, `asset-model/appsettings.json:11`. All three are asset-model's own
connection string. No other service, no Flink job, and not `ams-api` touch the table.

The "six services read the assets table" phrasing that appears in
[docs 02 §2.2](docs/ot-data-integration/02-uns-asset-tag-loop-configuration.md),
[doc 04](docs/ot-data-integration/04-mqtt-source-config-analysis.md) and the
[CPLM build plan §4.3](docs/cplm-intake/traverse-cplm-build-plan.md) means
*"six things depend on this data, so don't change its shape casually."* As a blast-radius
argument it is sound; as a statement about DB connections it is wrong. Verified map:

| # | Dependent | How | What it calls | Breaks if asset-model is down |
|---|---|---|---|---|
| 1 | **binding-resolver** | HTTP, `Services:AssetModel` | `GET /assets/by-path/{path}` per resolve | **No** — silently falls back to deriving transports from the raw path string, with a *different* device rule (`unit_device` at ≥3 segments vs asset-model's ≥4). Binding says `resolved:true` and points at a topic nobody publishes. `provenance` is the only honest signal |
| 2 | **cplm-api** | HTTP, `Cpm:AssetModelUrl` | `POST /assets/by-paths`, `POST /assets/bulk` (creates/updates/deletes), `GET/POST /assets/{id}/relationships` | Loop activation registers but the signal projection fails → warning surfaced, loops unusable until re-projected |
| 3 | **analysis-service** | HTTP, `Services:AssetModel` | `POST /assets` — registers derived measurements from calculation results ([AnalysisResultConsumer.cs:121-135](src/services/analysis-service/Consumers/AnalysisResultConsumer.cs#L121-L135)) | No — logged at Debug and swallowed |
| 4 | **gateway** | reverse proxy | routes + 60 s cache + body limits | 502 to the frontend |
| 5 | **frontend-ob** | HTTP via gateway | `AssetBrowser` (tree+search), `DisplayViewer` (asset-relative swap), `useAssetMetadata` (EU/limits), `useAssetSearch` (collections), `plantLocation` (CPM site/area/unit picker) | Tag picker empty, EU/limits fall back to regex guesses, CPM location picker degrades to manual text entry |
| 6 | **Indirect consumers of the projections** — historian-bff, ams-api/SignalR, sparkplug-edge-node, IoTDB writers | never call it | consume `IoTDbPath` / `RedisSnapshotKey` / `AlarmSource` *shapes* | Not at request time — but any change to the derivation rules desynchronises writers from readers |

**Also written by** (not just read): cplm-api (bulk create/update/delete of `CpmLoopSignal`
measurements, ledgered in `cpm.loop_signal_asset`) and analysis-service (derived measurements).
**No human-facing write path exists at all** — no UI, no CLI, no import tool.

---

## Part 5 — Live database state (queried 2026-08-24)

```
asset_type | count            total | deleted        template      | count
-----------+------            ------+--------       --------------+------
 1 Site    |     2            15898 |  15521         CpmLoopSignal |   217
 2 Area    |     0                                   (null)        |   160
 3 Unit    |     3           alias_mapping      : 0 rows
 4 Device  |    31           asset_relationships: 1 row (PEER)
 5 Measure |   341           parentless Measurements: 219 of 341
```

Live hierarchy — 36 non-measurement nodes:

```
houston (Site)                     dallas (Site)
├── crude1 (Unit)                  └── blend1 (Unit)
│   ├── pump101, tank01,               ├── pump201, tank02,
│   │   valve01, hx01 (Devices)        │   valve02, hx02
│   └── rbacprobe  ← ORPHAN (no parent_id, test residue)
└── pumpstation (Unit)
    └── pump01 … pump20 (Devices)

site1/unit1/G13_LOOP_A  ← ORPHAN Device, no Site/Unit rows above it
site1/unit1/G13_LOOP_B  ← ORPHAN Device
```

Corresponding CPM loop registry:

```
site    | area | unit   | loops        loops with asset_id: 2 of 54
--------+------+--------+------        loop_tag_catalog     : 0 rows
houston |      | crude1 |   50
site1   |      | unit1  |    2
site1   | B2   | B2     |    1
narnia  |      | unit9  |    1   ←  a site that exists in NO asset model
```

### What this tells you

1. **The Area level is unexercised.** Zero type-2 rows in a system that has shipped. Every code
   path that handles areas — `areasOf`/`unitsOf` in `plantLocation.tsx`, `deriveSignalPath`,
   `SparkplugDevice`'s 4-segment branch — is **untested against real data.** Introducing
   `Section 100`-style areas exercises all of it for the first time.
2. **`narnia` and `B2` are exactly the defect the origin spec's INVARIANTs prevent.** Free-text
   site/area/unit on `cpm.loop_registry`, no referential check, so a typo becomes a loop whose
   signal paths project into a phantom asset that resolves to nothing instead of failing loudly.
   `plantLocation.tsx` already added a picker and an "(not in UNS)" flag — but manual entry is
   still allowed and nothing validates server-side.
3. **219 of 341 measurements have no parent.** The CPLM projection posts `parentId = null`
   ([CpmLoopRegistryService.cs:1083](src/services/cplm-api/Services/CpmLoopRegistryService.cs#L1083)),
   so projected loop signals resolve and trend but are **invisible in the tree browser** — they
   exist only to path-prefix search. The origin spec's *Unassigned* catch-all is the fix.
4. **15,521 dead rows, 97.6% of the table.** Soft delete with no purge and no `is_active`. The
   unique index is filtered on `NOT is_deleted` so correctness holds, but every scan pays for it.
5. **The OT bridge is empty.** `alias_mapping` = 0 rows. Doc 07's telemetry chain
   (`alias_mapping[tag] → assets by-path → transport`) has no data in its first hop.

---

## Part 6 — How assets get created today

| Route | Who | Sets `parent_id`? | Validates? |
|---|---|---|---|
| Seed SQL `10_`, `15_`, `16_` | init only | yes (INSERT…SELECT on parent path) | n/a |
| `POST /assets` | analysis-service (derived measurements) | **no** | non-blank + unique only |
| `POST /assets/bulk` | cplm-api signal projection | **no** (`parentId: null`) | same, per item |
| Frontend | — | **nothing. There is no asset write UI.** | — |

So: the hierarchy is **seed-script-only**, and every *runtime* writer creates parentless leaves.
That is the direct cause of finding #3 above.

---

## Part 7 — Gap register

| ID | Gap | Severity | Evidence |
|---|---|---|---|
| **G-01** | **Adding an Area level changes derived Sparkplug device ids.** `SparkplugDevice` branches at `parts.Length >= 4`. `houston/crude1/pump101.press` (3) → `pump101`; `hdpe/section100/reactor1/pump101.press` (4) → `reactor1_pump101`. Topics, Redis keys and every live subscription move. binding-resolver's fallback branches at ≥3, so the two disagree in the 3-segment case too. | **Critical** — data-plane break | [Asset.cs:120-129](src/services/asset-model/Models/Asset.cs#L120-L129), [PathResolver.cs](src/services/binding-resolver/Services/PathResolver.cs) |
| **G-02** | **No delete guard.** `DELETE /assets/{id}` soft-deletes a Site with live children; children keep a `parent_id` pointing at a deleted row and vanish from `/children` while staying live in `/assets`. | High | Program.cs DELETE handler |
| **G-03** | **No path ↔ parent consistency check.** `parentId` is accepted unvalidated; the path is never checked against the parent's path. Hierarchy is stored twice with nothing reconciling them. | High | POST/bulk handlers |
| **G-04** | **No path grammar validation.** No lowercase rule, no charset rule, no depth cap, no segment-count-vs-`asset_type` check. A Site can be created at `a/b/c/d.e`. Naming conventions live only in `docs/migration/uns-namespace-spec.md`. | High | "The API only enforces non-blank + unique-active-path" — doc 02 §2.1 |
| **G-05** | **No cascade/filter API.** `plantLocation.tsx` fetches `?type=1&take=1000`, `type=2`, `type=3` — three unfiltered pulls — and reconstructs parentage **by string-splitting paths client-side**. No `?parentId` narrowing, no server-side cascade. | Medium (scaling) | [plantLocation.tsx](src/frontend-ob/src/components/Cpm/plantLocation.tsx) |
| **G-06** | **No asset write UI, no import UI.** `POST /assets/bulk` exists and is used only by cplm-api. Operators cannot create, edit, or import a single asset. | High (product) | Part 6 |
| **G-07** | **`cpm.loop_registry.site/area/unit` are unvalidated free text** across a database boundary. Live proof: `narnia`. | High | live query, Part 5 |
| **G-08** | **`alias_mapping` has no admin surface** — no list/update/delete/bulk. Empty in production. | Medium | Part 3 |
| **G-09** | **No `is_active`; no purge of soft-deleted rows.** 97.6% dead rows. | Medium | live query |
| **G-10** | **No asset-scope filtering on reads** while historian-bff enforces `assetScope` on series. | Medium (security) | CPLM build plan §4.2 |
| **G-11** | **Transport-override columns are not in the startup self-heal block** (only in `43_….sql`). A volume that skips init 500s on every read. | Medium | Program.cs:31-62 vs AssetDbContext |
| **G-12** | **219 parentless measurements** — resolve and trend, invisible in the tree. | Medium | live query |

---

## Part 8 — The Plant → Area → Unit specification, mapped onto this platform

### 8.1 The headline judgement

**Do not build `plants` / `areas` / `units` tables.** Every INVARIANT in that spec is about giving
a three-level site tree one authoritative home and making everything else reference it. This
platform **already has that home** — `assets.assets` types 1/2/3 — and it is load-bearing for
displays, bindings, the historian, and the alarm pipeline. Adding a parallel tree would create
a second source of truth and directly violate recorded decision #2 (*bind through the UNS*).

What the spec actually supplies that this platform lacks is **the product around the tree**:
a lookup/filter API split, cascading dropdowns, an admin CRUD surface, delete guards, path
validation, and import rules. Those port almost verbatim.

### 8.2 INVARIANT-by-INVARIANT

| Origin INVARIANT | Status here | Action |
|---|---|---|
| IDs are immutable natural strings, not UUIDs | **Already true.** `contextual_path` is the natural key everywhere — CSVs, Kafka payloads, display JSON. (`id` UUID exists but nothing external keys on it.) | Make immutability **explicit**: `contextual_path` is absent from `UpdateAssetRequest` today — keep it that way and document it |
| Exactly three levels, FK `units → areas → plants` | Partly. Five levels; `parent_id` is a self-FK; **no check** that a type-3 Unit's parent is a type-2 Area or type-1 Site | **Adopt** — add a level-adjacency rule (Part 9, P1) |
| Entity row stores all three IDs; filters query those columns, never join | **Already true, twice over.** `cpm.loop_registry.site/area/unit` is the denormalised copy; display documents store the full path string | Keep. Add validation (G-07) |
| Create/import verifies the three IDs form a real path | **Missing entirely.** Nothing validates that a loop's site/area/unit exist or are related | **Adopt** — `assertHierarchyPath` as a cplm-api call to `POST /assets/by-paths` |
| Import never auto-creates hierarchy | **Violated.** The CPLM signal projection auto-creates parentless assets on activate | Keep the projection (it is a deliberate, ledgered Route-B escape hatch) but **stop creating parentless rows** — attach to an `Unassigned` unit |
| `/areas` requires `plantId`; `/units` requires `areaId` | **Missing** (G-05) | **Adopt** — `/assets/filters/*` (Part 9, P2) |
| UI: area disabled until plant chosen; changing parent resets children | **Already implemented** in `plantLocation.tsx` (`setField` resets narrower selections; selects disabled without a site) | Reuse that component as the platform-wide filter bar |
| Delete blocked while children or entities exist; **fail closed** | **Missing** (G-02) | **Adopt.** Fail-closed matters more here: the "entities" live in *another database* (`traverse_cplm`), exactly the origin's cross-DB situation |
| Lookup writes invalidate filter caches | **Half present.** Redis `asset-events` pub/sub exists; the gateway's 60 s `/api/assets` cache is **not** wired to it | **Adopt** — subscribe the gateway cache to `asset-events`, and invalidate React Query keys on mutation |
| Kafka/cache/event rows copy the three IDs at write time | Partly — loop rows do; alarm rows carry `AlarmSource` (`site:unit:device`) which is a *different* denormalisation | Leave; note the two shapes |
| Catch-all `Unassigned` area+unit exists | **Missing** — and its absence is exactly G-12 | **Adopt.** Seed `<site>/unassigned` (Unit) per site and parent every projected loop signal there |

### 8.3 Translating the real plant tree (HDPE) — the naming problem

The origin uses human-readable natural keys **with spaces**:
`plant_id='HDPE'`, `area_id='Section 100'`, `unit_id='1001-Polymerization Reactor 1'`.

Concatenated into a contextual path that gives:

```
HDPE/Section 100/1001-Polymerization Reactor 1/fic10409.pv
```

which breaks in at least four places:

| Consumer | What happens |
|---|---|
| `GET /assets/by-path/{**path}` | catch-all matches literal slashes only; spaces must be percent-encoded, and `useAssetMetadata` already uses `encodeURIComponent` — but any `#`/`&` would corrupt the segment |
| `IoTDbPath` | ` `→`_` is handled → `root.HDPE.Section_100.1001-Polymerization_Reactor_1…`; but IoTDB nodes starting with a digit (`1001-…`) need backticks |
| `SparkplugDevice` / topic | **not** space-sanitised → `Section 100_1001-Polymerization Reactor 1` inside an MQTT topic |
| `deriveSignalPath` (CPM) | lowercases the whole path but keeps spaces → mismatch against a mixed-case asset row |

**Recommendation — split identity from label** (this is the one place to *deviate* from the origin spec):

| Field | Value | Why |
|---|---|---|
| `contextual_path` segment | `hdpe` / `section_100` / `1001_polymerization_reactor_1` | lowercase snake_case slug; safe in URLs, MQTT topics, IoTDB nodes |
| `name` | `HDPE`, `Section 100`, `1001-Polymerization Reactor 1` | what operators see in every dropdown and the tree |
| `description` | free text | searchable |
| `alias_mapping` row | `legacy_path='Section 100'`, `canonical_path='hdpe/section_100'`, `source_system='instrumental-pro'` | so the origin system's IDs still resolve, and CSVs exported from it import unchanged |

This keeps the origin's "operators can read the ID" property (it lives in `name`) without putting
spaces on the data plane. The alias table finally earns its keep.

**Also decide up front:** is `1001-Polymerization Reactor 1` a **Unit** (type 3) or a **Device**
(type 4)? Given loops hang off it, model it as **Unit**, with the loop's device/tag as the type-4
node. Then a loop signal is `hdpe/section_100/1001_polymerization_reactor_1/45fic109.pv` —
**four segments before the dot**, which triggers G-01.

### 8.4 The origin's two-API-surface rule

The spec insists Lookups (admin CRUD) and Filters (runtime cascade) stay separate. That maps onto
existing conventions cleanly:

| Origin | Here |
|---|---|
| `/lookups/plants\|areas\|units` (GET open, writes admin) | existing `/assets` CRUD, already permissioned `asset.view` / `asset.edit` |
| `/filters/plants`, `/filters/areas?plantId=`, `/filters/units?areaId=` | **new** `/assets/filters/sites`, `/assets/filters/areas?site=`, `/assets/filters/units?site=&area=` |

Keep them separate for the same reason the origin does: the filter endpoints must be
narrow, cacheable, and refuse to return the whole tree.

### 8.5 What from the origin spec is **not** applicable

- **`shared_lookups` split-database variant (Appendix A).** This platform is already per-service
  DBs with a documented cross-DB soft reference (`cpm.loop_registry.asset_id`). Nothing to add.
- **`demand_types` / `failure_modes` / `test_types`.** Out of domain.
- **`plant_code` / `area_code` / `unit_code` columns.** Redundant — the slug segment *is* the code
  and `name` is the label. If codes are genuinely a third distinct identifier, put them in
  `alias_mapping` rather than growing a table six things depend on.
- **`is_active` as a separate flag from delete.** Tempting, but this table already carries
  `is_deleted` and a 97.6% dead-row problem (G-09). Fix the purge before adding a second lifecycle
  column.

---

## Part 9 — Implementation plan

Ordered so each phase is independently shippable and testable. Phases 1–2 are backend-only and
unblock everything else; the real HDPE tree lands in Phase 6.

### P0 — Decide G-01 before anything else  *(blocking, ~half a day, on paper)*

Introducing Areas takes paths from 3 to 4 segments and flips `SparkplugDevice` to `unit_device`.
Three options, pick one and record it in `MIGRATION_LOG.md`:

| Option | What | Cost |
|---|---|---|
| **A — Areas are labels, not path segments** | Model Area rows (type 2) for filtering/UI but keep `contextual_path` at `site/unit/device.meas`; Area↔Unit relation carried by `parent_id` only | Zero data-plane change. **Cost:** path no longer fully encodes the hierarchy, so `returnAllDescendants` path-prefix search and `areasOf()` string-splitting both break — every consumer must walk `parent_id` instead |
| **B — Areas are path segments; fix the derivation** | Accept 4-segment paths; change `SparkplugDevice` to key off `asset_type`/parent rather than segment count, and align binding-resolver's fallback | Correct long-term. **Cost:** touches the hot binding path; needs a re-verify of every live subscription. Cheap *now* (0 Area rows, 2 sites) and expensive later |
| **C — Areas are path segments; freeze the derivation via overrides** | Accept 4-segment paths, and set `sparkplug_device_override` on every affected asset at import time | No code change, but 300+ override rows and a permanent divergence between path and transport |

**Recommendation: B.** There are zero Area rows and 36 hierarchy nodes today — this is the
cheapest this decision will ever be, and A quietly disables the path-prefix search that
`/assets/search` and `/assets/{id}/descendants` are built on.

### P1 — Hierarchy integrity in asset-model  *(backend)*

1. **`assertHierarchyPath` on write.** On `POST /assets` and every `creates[]` item:
   - path is non-blank, ≤6 segments, `^[a-z0-9_]+(/[a-z0-9_]+)*(\.[a-z0-9_]+)?$`
   - segment count is consistent with `asset_type` under the P0 decision
   - if `parentId` is supplied → the parent is live and its path is this path's prefix
   - if `parentId` is **omitted** → **derive it** from the path prefix (this alone fixes G-12
     for analysis-service; keep an explicit `parentId: null` opt-out for the CPLM projection)
2. **Delete guards** (G-02). `DELETE /assets/{id}` → 409 with a `references` body when live
   children exist. For Site/Area/Unit also count `cpm.loop_registry` rows via a cplm-api
   probe, and **fail closed** if cplm-api is unreachable — never delete a node that
   might be referenced across the DB boundary.
3. **Immutability.** `contextual_path` stays absent from `UpdateAssetRequest`. Add an explicit
   `POST /assets/{id}/move` later if re-parenting is ever needed; do not smuggle it into PUT.
4. **Startup self-heal parity** (G-11): add the five override columns to the startup DDL block.
5. **Purge job** (G-09): a scheduled hard-delete of `is_deleted` rows older than N days that no
   `cpm.loop_signal_asset` ledger row references.

### P2 — Filter/cascade API  *(backend, small)*

```
GET /assets/filters/sites                      → [{path, name}]           (type 1, live)
GET /assets/filters/areas?site=hdpe            → 400 without site         (type 2, children of site)
GET /assets/filters/units?site=&area=          → 400 without site         (type 3)
GET /assets/filters/devices?unit=<path>        → optional 4th level
```

Narrow projections (`path, name` only), ordered by name, live rows only, cacheable. Replaces the
three `take=1000` pulls in `plantLocation.tsx` (G-05).

**Wire the invalidation loop:** subscribe the gateway's `ResponseCacheMiddleware` to the Redis
`asset-events` channel so an asset write busts `/api/assets*` immediately instead of after 60 s.

### P3 — Master Data admin UI  *(frontend)*

New route under the existing shell: **`/admin/plant-model`**, inside `Administration.tsx`,
gated on `asset.view` (read) / `asset.edit` (write) — the permissions already exist.

- Tree view (Site → Area → Unit → Device → Measurement) driven by `/children`, with search.
- Create/edit dialogs per level; parent chosen from a **select of the level above** (never free
  text) — exactly the origin's rule.
- Measurement dialog additionally edits `engineering_unit`, `lo/hi_eng_limit`, `template`.
- Delete surfaces the 409 `references` payload as a plain sentence
  ("Section 100 still has 4 units and 12 loops. Remove those first.").
- On any mutation: invalidate `['assets', …]` **and** `['cpm','plant-locations']`.
- **OpenBridge only** — per `openbridge-agent-rules.md` and the `openbridge` skill. No bespoke
  tables, no raw hex, no custom dialogs.

This is G-06 and the single largest product gap in this analysis: the UNS is the source of truth
for the entire platform and it currently has **no editor**.

### P4 — Bulk import  *(frontend + backend)*

Two importers, both modelled on the existing `BulkImportModal.tsx` (users) and the CPM loop CSV
importer currently in the working tree — same 3-step Source → Review → Activate shape.

**a) Hierarchy + tags CSV** → `POST /assets/bulk`. Headers (from doc 02 §6.1):
```
site, area, unit, device, measurement, name, description,
engineering_unit, range_lo, range_hi, device_template, ot_tag
```
Rules, straight from the origin spec §5.2:
- preload the existing path set **once** (`POST /assets/by-paths`), never query per row
- validate every row before sending anything — review is a real gate
- reject unknown parents; **do not auto-create hierarchy from a tag row** unless the operator
  explicitly ticks "create missing hierarchy levels", and then show exactly what will be created
- `ot_tag` non-blank → also write an `alias_mapping` row (`source_system: 'ot-gateway'`)

**b) Alias CSV** → needs new endpoints first (G-08): `GET /aliases`, `PUT /aliases/{id}`,
`DELETE /aliases/{id}`, `POST /aliases/bulk`.

### P5 — Close the loop-registry hole  *(cplm-api + frontend)*

1. **Server-side validation on activate** (G-07): resolve `site`/`site/area`/`site/area/unit`
   through `POST /assets/by-paths` and reject unknown or non-adjacent locations with a clear
   422 — *unless* an explicit `allowUnmodelledLocation: true` is passed, which the UI surfaces as
   a checkbox with the consequence spelled out. This is the origin's `assertHierarchyPath` at the
   only boundary that currently lets `narnia` through.
2. **Projection gets a home** (G-12): seed `<site>/unassigned` as a Unit per site and set
   `parentId` on projected `CpmLoopSignal` assets instead of `null`.
3. **Backfill:** reconcile the 54 existing loops — 52 have no `asset_id`; `narnia` and the two
   `site1` loops need either real locations or `Unassigned`.
4. Make `plantLocation.tsx` read the P2 filter endpoints, and keep its "(not in UNS)" flag.

### P6 — Load the real HDPE tree  *(data)*

Once P1–P4 are in:
1. Apply the §8.3 slug/label split to the real Plant → Area → Unit list.
2. Write `database/scripts/48_hdpe_plant_hierarchy.sql` — idempotent `INSERT … ON CONFLICT DO
   NOTHING` in the style of `15_…`/`16_…` — creating Site → Area → Unit rows plus one
   `unassigned` Unit per Site, and `alias_mapping` rows from the origin IDs.
3. Import devices + measurements via the P4 CSV importer (that is what it is for; keep the SQL
   script to the stable hierarchy only).
4. Retire the `houston` / `dallas` / `site1` demo data, or fence it behind a lab-only script.

### P7 — Deferred / explicitly out of scope

- **G-10 asset-scope filtering on reads.** Real, but a security workstream of its own — it must
  align with historian-bff's existing `assetScope` semantics rather than invent a second model.
- **`is_active` as a lifecycle distinct from `is_deleted`.** Revisit only after P1.5's purge.
- **Re-parenting / `POST /assets/{id}/move`.** Deliberately excluded — the origin spec forbids
  changing an ID, and here the path *is* the transport address, so a move rewrites where the
  platform looks for data. Needs its own design.

---

## Part 10 — What to hand over with the real plant list

To turn the HDPE tree into a load script, the following per row is enough:

| Level | Needed | Example |
|---|---|---|
| Plant → **Site** | display name, chosen slug | `HDPE` → `hdpe` |
| Area | display name, chosen slug, parent site | `Section 100` → `section_100` |
| Unit | display name, chosen slug, parent area | `1001-Polymerization Reactor 1` → `1001_polymerization_reactor_1` |

Plus, per plant, three confirmations:
1. **Is every Unit under an Area**, or do some hang directly off the Plant? (The path grammar
   allows both; the validator needs to know which is legal.)
2. **Which level do control loops attach to** — Unit, or a Device below it?
3. **Do the origin IDs need to keep resolving** (i.e. write the `alias_mapping` rows), or is this
   a clean start?

Answer P0 (Part 9) at the same time, and the hierarchy script plus the tag-import template can be
generated directly from the list.
