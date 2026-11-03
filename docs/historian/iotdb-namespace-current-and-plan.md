# IoTDB historian namespace: current state and plan

**Date:** 2026-11-03 · **Branch:** `feat/v25-next-release` · **Status:** analysis + proposal. Nothing has been built yet.
**Question asked:** why do historian devices look like `root.site1.cpm.FIC10401`, where is this used, and what
should the hierarchy be?

**Evidence basis:** source code on this branch (file:line references below), `prod_decision.md`,
`migration/MARUN-CONTEXT.md`, `infra/docker/iotdb-init-ttl.sh`. The lab IoTDB container was **not running**
during this analysis, so there are no live `SHOW DEVICES` counts here. Phase 0 below captures them before any change.

---

## 1. Summary

**What `root.site1.cpm.FIC10401` is.** It is the IoTDB *device* holding one control loop's raw samples
(`pv, sp, op, vp, mode`). It was set as a placeholder during CPLM intake Phase 3, before any asset registry
existed. The code comment still says so: *"With no asset registry yet (Phase 4), site defaults to site1 and
'cpm' stands in for the unit segment"* (`src/backend/AMS.Api/Services/IotDbWriteClient.cs:30-36`).
The registry and the plant hierarchy were built later (decision #17, HDPE tree, `48_hdpe_plant_hierarchy.sql`),
but the historian path was never revisited.

**What is wrong with it**
1. `site1` is not a site. At Marun the registry site is `hdpe`. This mismatch already caused one production
   bug: replay read nothing (CHG-036, `prod_decision.md:96`).
2. `cpm` is a software module name sitting in the place of a plant unit.
3. The platform has **four different IoTDB naming conventions** (section 3.1). None of them follows the
   documented UNS spec `root.<site>.<area>.<unit>.<device>.<measurement>` (`docs/migration/uns-namespace-spec.md:16-21`).
4. The rule *prefix + SafeNode(loop)* is re-implemented in **5 code bases** and configured in **5 places**.
   Every drift between them has produced a blank chart or an empty replay (P1-5, CHG-036).
5. Asset-scoped authorization in historian-bff compares a UNS scope (`hdpe/section_100` → `root.hdpe.section_100`)
   against series that live under `root.site1.cpm.*` and `root.ams.site1.alarms.*`. A scoped user can **never**
   read a loop or alarm trend (F-05).
6. With `enable_auto_create_schema=true`, any write outside the two pre-created databases creates a new
   database **with no TTL**, which means unbounded disk growth (F-08).

**Recommendation (details in sections 4-6)**
- The **plant hierarchy belongs in the asset model** (the PI AF equivalent), not in the IoTDB device path.
  A loop moves between areas and units (Marun has an `Unassigned` area by design). IoTDB 1.3.2 cannot rename
  a path, so a hierarchy-in-path design splits a loop's history every time it is relocated.
- The IoTDB path gets a **real structure**: `root.<data class>.<site>.<entity>.<measurement>`, for example
  `root.loop.hdpe.FIC10401.pv`. The data class is the IoTDB database, which in IoTDB 1.3.2 is the unit of
  TTL, so each retention class gets its own database. Site is the real plant slug from the asset model.
  The entity is the stable loop id.
- Area, unit and asset id are written as **IoTDB tags** on each series. That lets IoTDB-native tools and the
  PI/data team filter by hierarchy (`SHOW TIMESERIES root.loop.hdpe.** WHERE TAGS(unit)='u1001_…'`).
  A relocation then is a tag update, not a data move.
- **One source of truth for the device:** a `historian_device` column on `cpm.loop_registry`, returned by the
  API. No component derives the path itself any more.

---

## 2. IoTDB facts that drive the design (1.3.2, tree model)

| Fact | Consequence for us |
|---|---|
| Path = `root.<database>.<…>.<device>.<measurement>`; a **database** is a prefix and databases cannot nest | Everything under `root.site1` shares one database, so it shares one TTL |
| **TTL is per database on 1.3.2.** A path-pattern `SET TTL` rewrites the database TTL; path-level TTL arrives in ≥ 1.3.3 | The intended 730 d KPI TTL silently became 90 d (`iotdb-init-ttl.sh:105-118`). Retention classes must be separate databases |
| No rename/move of a path. The only route is `SELECT … INTO` new path, then `DELETE` old | Anything that can change (area, unit) must not be in the path |
| Paths are case-sensitive; a node cannot start with a digit or contain `-` or `.` unquoted | Needs one sanitiser (`SafeNode`), used everywhere |
| `enable_auto_create_schema=true` creates a database at the default level (level 1) on the first write to an unknown root | `root.houston`, `root.analysis`, … appear with no TTL |
| Rows are keyed by (device, timestamp); a repeated timestamp **overwrites** | Two loops sanitising to the same node merge silently (guarded, F-10) |
| Tags/attributes on timeseries (`TAGS(...)`, `ALTER TIMESERIES … UPSERT TAGS`) are indexed and cheap to change | Hierarchy can live on the series as metadata without being in the path |

---

## 3. Current state

### 3.1 The four trees

| # | Tree | IoTDB database / TTL | Written by | Read by | Live at Marun? |
|---|---|---|---|---|---|
| T1 | `root.site1.cpm.<SafeNode(loop)>.{pv,sp,op,vp,mode}` | `root.site1`, **90 d** | ams-api `RawLoopIotDbConsumer` | historian-bff (all CPM trend/raw/last pages), Flink replay job, cplm-api recompute | **Yes**, the main historian |
| T1k | `root.site1.cpm.<loop>.kpi.<family>` (`gate_12h`, `gate_24h`, feature families) | `root.site1`, 90 d (intended 730 d, not possible on 1.3.2) | cplm-api `CplmResultConsumerService.WriteKpiSeriesAsync` | **Nobody.** KPI trends come from Postgres via cplm-api | Yes (write-only cost) |
| T2 | `root.ams.site1.alarms.<sanitised alarmId>` | `root.ams`, **365 d** | Flink `IoTDBPersistenceJob` | historian-bff `/series` default, IoTDBTrendViewer, binding-resolver `/resolve/alarm` | No (alarm ingestion is off at Marun) |
| T3 | `root.<UNS path with / → .>` e.g. `root.houston.refinery.crude1.pump101.discharge_press` | auto-created at level 1, **no TTL** | sparkplug-edge-node `AlarmMetricPublisher.writeToIoTDB` | asset-model `IoTDbPath` default, binding-resolver history binding, historian-bff scope check | No (lab/demo) |
| T4 | `root.analysis.<target path>` | auto-created, **no TTL** | analysis-service default `OutputPath` | analysis definitions | No |

### 3.2 Why it is `root.site1.cpm`

- CPLM intake ported CPA's `IotDbClient` into Traverse and fixed the tree at `root.<site>.<unit>`.
  No registry existed yet, so the values were filled with `site1` and `cpm`
  (`AMS.Api/Services/IotDbWriteClient.cs:30-36`, same text in `cplm-api/Services/IotDbWriteClient.cs:35-41`).
- It was deliberately kept apart from `root.ams.*` (the alarm tree) for separate retention.
- The registry (`32_cpm_loop_registry.sql:26-28`: `site NOT NULL, area, unit`) and the HDPE tree
  (`48_hdpe_plant_hierarchy.sql`: 1 site, 7 areas + Unassigned, 25 units) arrived later. The historian
  writer never started using them, although every sample **already carries them**: ingestion stamps
  `site`, `area`, `unit`, `asset_uuid` on each tuple (`ingestion-service/Pipeline/LoopJoiner.cs:45-49`).
- `LoopRootPrefix` is not set in `migration/deploy/docker-compose.marun.yml`, so production runs on the code
  default `root.site1.cpm`. That default is now load-bearing: Marun has weeks of data under it
  (`MARUN-CONTEXT.md:240-252` uses `root.site1.cpm.PIC80105` in its runbook commands).

### 3.3 Where the hierarchy actually lives today

```
Postgres traverse_cplm  cpm.loop_registry        loop_id, site=hdpe, area, unit, asset_id
                        cpm.loop_tag_map          loop_id, role → uns_path  (hdpe/section_100/…/fic10401.pv)
Postgres traverse_assets assets                   Site → Area → Unit → Device(loop) → Measurement(role)
                                                  each Measurement: ioTDbPathOverride = root.site1.cpm.FIC10401.pv
IoTDB                   root.site1.cpm.FIC10401.pv    ← flat; no site/area/unit anywhere
```

So the plant tree exists and is correct, but only in Postgres. The link from the tree to the historian is the
`ioTDbPathOverride` that the CPLM signal-asset projection writes onto each Measurement asset
(`cplm-api/Services/Registry/CpmLoopRegistryService.SignalAssets.cs:155, 242-252`). A Measurement asset the
projection did not touch falls back to `root.<uns path>` (`asset-model/Models/Asset.cs:100-101`), a path where
no data exists. The same signal can therefore resolve to two different historian paths depending on how its
asset row was created.

### 3.4 Every place that builds or parses a historian path

**Writers**

| Component | File | What it does |
|---|---|---|
| ams-api | `src/backend/AMS.Api/Services/IotDbWriteClient.cs:36, 86` | `LoopRootPrefix` default + `SafeNode` |
| ams-api | `src/backend/AMS.Api/BackgroundServices/RawLoopIotDbConsumer.cs:239` | `device = prefix + SafeNode(loopId)` for every sample |
| cplm-api | `src/services/cplm-api/Services/IotDbWriteClient.cs:41, 66` | second copy of the options and `SafeNode` |
| cplm-api | `src/services/cplm-api/BackgroundServices/CplmResultConsumerService.cs:395` | KPI device `…<loop>.kpi.<family>` |
| Flink | `src/flink/src/main/java/com/ams/flink/IoTDBPersistenceJob.java:36, 134` | alarm prefix **hardcoded** `static final` |
| sparkplug-edge-node | `src/services/sparkplug-edge-node/.../AlarmMetricPublisher.java:410` | `root.` + UNS path |
| analysis-service | `src/services/analysis-service/Program.cs:179` | `root.analysis.` + target path |
| iotdb-init | `infra/docker/iotdb-init-ttl.sh:27-29` | `ALARM_DB=root.ams`, `LOOP_DB=root.site1` |

**Readers / derivers**

| Component | File | What it does |
|---|---|---|
| frontend | `src/frontend-ob/src/utils/loopSeries.ts:18-35` | `VITE_LOOP_ROOT_PREFIX` (build-time) + TS port of `SafeNode` |
| frontend | 9 CPM components: `CpmHistorical`, `CpmInvestigation`, `CpmReplay`, `evidence/HistorianLanes`, `explorer/summary/LoopTrendPanel`, `explorer/summary/OperatingState`, `explorer/SummaryTab`, `overview/LoopFocus`, `windows/WindowDetail` | call `loopSeries(loopId)` |
| frontend | `src/frontend-ob/src/utils/iotdbPaths.ts:9-10` | `VITE_ALARM_ROOT_PREFIX` + alarm sanitiser |
| Flink replay | `src/flink/.../cplm/replay/IotDbBoundedSource.java:65-71` | Java port of the rule; `devicePath(site, loop)` builds `root.<site>.cpm` (the CHG-036 trap) |
| Flink replay | `src/flink/.../cplm/CplmHistoricalReplayJob.java:83` | `--iotdb-root-prefix` / `LOOP_ROOT_PREFIX` env |
| cplm-api | `src/services/cplm-api/Services/CplmRecomputeService.cs:115, 484-488` | derives the device for `--iotdb-device` |
| cplm-api | `CpmLoopRegistryService.cs:112-123`, `Registry/CpmLoopRegistryService.Bulk.cs:89-108` | collision guard on `SafeNode` |
| binding-resolver | `src/services/binding-resolver/Services/PathResolver.cs:257`, `Program.cs:143, 215` | UNS fallback `root.<path>`; alarm prefix from config |
| historian-bff | `src/services/historian-bff/Program.cs:375` | `/series` default `root.ams.site1.alarms.**` hardcoded |
| historian-bff | `src/services/historian-bff/Program.cs:391-402` | `AssetScope.SeriesInScope`: UNS scope → `root.<scope>` |
| asset-model | `src/services/asset-model/Models/Asset.cs:100-101` | `IoTDbPath` = override ?? `root.<path>` |
| scripts | `scripts/test-ot-loop-ingestion-e2e.ps1`, `scripts/verify-ot-loop-flow.ps1`, `scripts/e2e-edge/*`, `ams-sims/*` | literal paths |
| docs/runbooks | `migration/MARUN-CONTEXT.md:240-252`, `prod_decision.md:96-98`, `docs/architecture-review/06-iotdb-historian.md` | literal paths in operator commands |

### 3.5 Findings

| ID | Severity | Finding | Evidence | Consequence |
|---|---|---|---|---|
| F-01 | High | `site1` is a placeholder, not the plant's site (`hdpe`) | `IotDbWriteClient.cs:30-36`; registry `site='hdpe'` | Already caused CHG-036 (replay built `root.hdpe.cpm.*` and read nothing). A second plant on the same build also writes `site1` |
| F-02 | Medium | `cpm` sits in the unit position | same comment: "cpm stands in for the unit segment" | The path claims a hierarchy it does not have, which is the confusion that prompted this review |
| F-03 | High | The device rule is re-implemented in C# ×2, Java, TS, PowerShell/Python; the prefix is configured in 5 places (`IotDb__LoopRootPrefix` in ams-api and cplm-api, `VITE_LOOP_ROOT_PREFIX` at **build** time, Flink `LOOP_ROOT_PREFIX`/`--iotdb-root-prefix`, `LOOP_DB` in iotdb-init) | section 3.4 | Changing one place gives blank charts with HTTP 200 (P1-5 history in `loopSeries.ts:1-15`). The frontend value is baked into the image, so it cannot be fixed per site without a rebuild |
| F-04 | Medium | Four naming conventions (T1-T4) plus the documented spec, which matches none of them | section 3.1; `uns-namespace-spec.md:16-21` | No one can predict a path from the plant tree. The spec's migration table (`uns-namespace-spec.md:89-141`) was never executed |
| F-05 | High (latent) | Asset-scope check maps `hdpe/section_100` → `root.hdpe.section_100` and requires a prefix match | `historian-bff/Program.cs:391-402` | Every loop (`root.site1.cpm.*`) and alarm (`root.ams.*`) series is out of scope, so a user with an `assetScope` claim gets 403 on every trend. Latent today because no user carries the claim; it breaks on the first scoped user (G-10 still open) |
| F-06 | Medium | The alarm prefix is configurable in the resolver and frontend but **hardcoded** in the Flink writer | `IoTDBPersistenceJob.java:36` | "Configurable" only in name: a repointed prefix makes readers look where nothing is written |
| F-07 | Medium | The KPI subtree is write-only and gets the wrong TTL | no reader of `.kpi.` in frontend/services; `iotdb-init-ttl.sh:105-118` | Write load and disk at Marun for data nobody reads, kept 90 d instead of the intended 730 d |
| F-08 | Medium | Auto-create schema + level-1 default makes un-TTL'd databases (`root.houston`, `root.analysis`, …) | `docker-compose.yml:80`; T3/T4 writers | Unbounded disk growth on any deployment that turns those writers on. iotdb-init only checks `LOOP_DB` |
| F-09 | Medium | Two answers for one signal: projected Measurement → `root.site1.cpm.X.pv`; unprojected → `root.hdpe.….x.pv` (empty) | `Asset.cs:100-101` vs `SignalAssets.cs:242-252` | Designer bindings on a non-projected tag silently trend nothing |
| F-10 | Low (guarded) | `SafeNode` is lossy: `FIC-104`, `FIC.104`, `FIC_104` collapse to one device | `CpmLoopRegistryService.cs:112-123` | Guarded at registration (409). Keep the guard in any new design |
| F-11 | Low | Two different leading-digit rules: historian `_101FIC`, asset slugs `u1001_…` | `SafeNode`; memory/decision #17 slug rule | Same IoTDB constraint, two encodings |
| F-12 | Low | No time-aware resolution: an override re-pointed today changes what last month's ranges read | `unified/02-…:343` | Any path change needs an explicit cut-over design (section 6) |
| F-13 | Info | Replay and recompute depend on the writer's prefix, not the registry | `CplmRecomputeService.cs:484-488`; `prod_decision.md:96` | Solved for now by passing `--iotdb-device`; the registry column in Phase 1 makes it structural |

---

## 4. Design options for the target

| | A. Full hierarchy in the path | **B. Stable identity path + hierarchy as metadata (recommended)** | C. Rename only |
|---|---|---|---|
| Example | `root.hdpe.section_100.u1001_polymerization_reactor_1.FIC10401.pv` | `root.loop.hdpe.FIC10401.pv` + `TAGS(area=section_100, unit=u1001_…, role=pv)` | `root.hdpe.cpm.FIC10401.pv` |
| Browse by area/unit in IoTDB | Native (`root.hdpe.section_100.**`) | `SHOW TIMESERIES root.loop.hdpe.** WHERE TAGS(unit)='…'`; in the app via asset-model | No |
| Loop relocated (Unassigned → real unit, area correction) | **New device. History splits.** Needs `SELECT INTO` + delete per move, or stitched reads forever | Tag update (`ALTER TIMESERIES … UPSERT TAGS`); no data moves | No change |
| Retention per class on 1.3.2 | Loops, alarms, KPI share `root.hdpe`, so **one TTL** | One database per class: `root.loop` 90 d, `root.alarm` 365 d, `root.kpi` 730 d | Same problem as A |
| Readers need the registry to find a path | Yes, always (path is not derivable from loop id) | No for the device; yes only for hierarchy questions | No |
| Asset-scope security | Prefix check works | Resolved via asset-model (loop → unit), which is how G-10 must work anyway | Broken |
| Matches how PI works | No | **Yes**: PI Data Archive has flat stable tags, PI AF holds the hierarchy. Same split as Traverse historian + asset-model | — |
| Migration cost | Highest (path depends on mutable data; Unassigned loops guarantee re-moves) | Medium, once | Medium, once, and it does not fix F-02/F-07/F-08 |

**Why not A.** It looks "proper", but it ties stored data identity to the most volatile attribute in the model.
Marun's tree has an `Unassigned` area/unit where loops are parked until located (`48_hdpe_plant_hierarchy.sql:33, 67`),
so moves are expected, not exceptional. On 1.3.2 every move is a bulk copy on a 96 GB VM that has filled up
four times (`prod_decision.md:153-156`). It also forces all retention classes into one TTL.

**Why B is still "proper hierarchy".** Hierarchy navigation (the Plant Model UI, filter cascade, scope) already
works from the asset model. B makes the historian obey it: every series is tagged with its place in the tree,
the asset Measurement points at exactly one series, and the site segment is real.

---

## 5. Target namespace (proposal B)

### 5.1 Databases (one per retention class)

| Database | Contents | TTL (current decision, unchanged) |
|---|---|---|
| `root.loop` | raw loop samples | 90 d |
| `root.alarm` | alarm history | 365 d |
| `root.kpi` | KPI/gate series, **only if D-3 keeps the dual-write** | 730 d (now possible, own database) |
| `root.proc` | non-loop process tags (Sparkplug edge / UNS writers) | decide per site (D-5) |
| `root.analysis` | analysis-service outputs | decide (D-5) |

Rule: **every database is pre-created by iotdb-init with a TTL, and iotdb-init fails if `SHOW DATABASES` lists
one without a TTL** (closes F-08). Auto-create stays on for timeseries inside these databases.

### 5.2 Paths

```
root.loop.<site>.<loopNode>.{pv,sp,op,vp,mode}          raw samples
root.kpi.<site>.<loopNode>.<family>.<metric>            only if kept (D-3)
root.alarm.<site>.<alarmNode>.{severity,state,…}        same measurements as today
root.proc.<site>.<area>.<unit>.<device>.<measurement>   generic UNS tags (path IS the identity here)
```

- `<site>` = the asset-model Site slug (`hdpe`), never a placeholder. Taken from the registry row.
- `<loopNode>` = `SafeNode(loop_id)` with registry casing, unchanged, so `FIC10401` stays `FIC10401`, the same
  name the PI tag and the operators use. The collision guard (F-10) stays.
- One leading-digit rule for the whole platform (D-4): keep `_` for loops (existing data) and document both,
  or align on `u`.

### 5.3 Tags and attributes on each loop series

```sql
CREATE TIMESERIES root.loop.hdpe.FIC10401.pv WITH DATATYPE=DOUBLE, ENCODING=GORILLA
  TAGS(area='section_100', unit='u1001_polymerization_reactor_1', role='pv', loop_type='FIC')
  ATTRIBUTES(asset_uuid='…', loop_id='FIC10401');
```

(Area/unit values above are illustrative; the real ones come from the registry.)
Tags are filterable, attributes are descriptive. On relocation, cplm-api runs
`ALTER TIMESERIES … UPSERT TAGS(area=…, unit=…)` for the loop's five series. That is cheap and keeps no history copy.
Keep the tag set small (4 keys): IoTDB holds the tag index in memory.

### 5.4 One source of truth for the device

- New column `cpm.loop_registry.historian_device TEXT NOT NULL` (backfilled with today's value), owned by cplm-api.
- Returned on every loop DTO as `historianDevice`. The frontend uses it instead of `loopSeries()`. Flink replay
  already takes `--iotdb-device`. The writer resolves it from the samples tuple (ingestion adds
  `historian_device` to the tuple from its registry cache, which it already has) so ams-api stops deriving.
- The asset-model Measurement override is written from the same column.
- `SafeNode` survives in exactly one place: cplm-api, when it **assigns** the device at registration.

### 5.5 Example: FIC10401

| | Today | Target |
|---|---|---|
| Raw PV | `root.site1.cpm.FIC10401.pv` | `root.loop.hdpe.FIC10401.pv` tagged `area=…, unit=…` |
| 12 h gate KPI | `root.site1.cpm.FIC10401.kpi.gate_12h.*` (unread, 90 d) | dropped, or `root.kpi.hdpe.FIC10401.gate_12h.*` (730 d) |
| Asset tree | `hdpe/section_…/u…/fic10401.pv` → override `root.site1.cpm.FIC10401.pv` | same tree → `historianDevice` + `.pv` |
| Who knows the path | 5 code bases | the registry row |

---

## 6. Migration plan (production-safe)

Constraints: prod (Marun) is live on v2.8.x and offline. The VM disk is 96 GB shared with other products and has
filled repeatedly. There must be **no gap and no split** in any loop's history, and every step must be reversible
per loop.

### Phase 0: Measure and decide (no code)
1. On Marun (read-only): `show databases`, `show all ttl`, `count devices root.site1.cpm.*`,
   `count timeseries root.site1.**`, `du -sh` of `iotdb-data`, and `count devices root.**` to find stray databases.
2. Same on the lab once it is up.
3. Close decisions D-1..D-6 (section 7).
**Exit:** sizes recorded in `prod_decision.md`; decisions recorded.

### Phase 1: Single source of truth, path unchanged (low risk, ships alone)
| Task | Where |
|---|---|
| Add `historian_device` (+ backfill `root.site1.cpm.` + SafeNode) | new `database/scripts/NN_cpm_historian_device.sql` + cplm-api startup self-heal |
| Expose `historianDevice` on loop DTOs; assign at registration/bulk import | cplm-api registry + Bulk |
| Ingestion stamps `historian_device` on the tuple; `RawLoopIotDbConsumer` uses it (fallback to prefix+SafeNode for one release) | ingestion-service `LoopJoiner`, `LoopRegistryCache`; ams-api consumer |
| Frontend: replace `loopSeries(loopId)` with `loop.historianDevice` in the 9 components; keep `loopSeries` only as fallback | `src/frontend-ob/src/utils/loopSeries.ts` + components |
| Recompute/replay read the column, not the prefix | `CplmRecomputeService.cs:484-488` |
| SignalAssets projection writes the override from the column | `CpmLoopRegistryService.SignalAssets.cs` |
| Fix F-05: historian-bff scope check resolves series → asset (via binding-resolver/asset-model) instead of string prefix | `historian-bff/Program.cs:391-402` |
| Fix F-06: Flink alarm prefix from `PipelineConfig`/env | `IoTDBPersistenceJob.java:36` |
**Verify:** lab E2E (`scripts/test-ot-loop-ingestion-e2e.ps1`, `scripts/verify-ot-loop-flow.ps1`), every CPM
trend page in a browser, one replay. Byte-for-byte the same IoTDB paths before and after.
**Rollback:** previous images. The column is additive.

### Phase 2: New namespace, per-loop cut-over
1. iotdb-init creates `root.loop` (90 d) and, per D-3, `root.kpi` (730 d). It adds the "no database without TTL" check.
2. Writer **dual-writes** each sample to `historian_device` and `historian_device_next` when the latter is set.
   That doubles writes for the copy period only.
3. Backfill per loop, per day, with `SELECT pv,sp,op,vp,mode INTO root.loop.hdpe.X(pv,sp,op,vp,mode) FROM root.site1.cpm.X WHERE time >= d AND time < d+1`
   (90 days × ~170 loops, scripted, throttled, resumable). Then check `count()` equality per day.
   **Disk:** needs roughly the size of the loop tree free (Phase 0 measures it). If it is not free, use the
   alternative: no copy, stitched reads until the old tree ages out at 90 d (D-2).
4. Create the new series with tags (5.3) before the first write.
5. Flip the loop: `historian_device := next`, `next := NULL`. Readers follow automatically (Phase 1).
   Flip 1 loop, then 10, then all.
6. After a soak (≥ 7 days, D-6): stop writes to `root.site1`, then `DELETE DATABASE root.site1`.
**Rollback:** until step 6, flip the column back; the old tree is still being written.

### Phase 3: Alarms, KPI, stray trees
- Alarms: `root.ams.site1.alarms.*` → `root.alarm.<site>.*` (Flink, binding-resolver `Alarm:HistorianPrefix`,
  `VITE_ALARM_ROOT_PREFIX`, historian-bff `/series` default, e2e manifests). Not live at Marun, so this is a
  direct switch; lab data ages out.
- KPI per D-3: delete the writer (preferred), or move to `root.kpi.<site>.*`.
- T3/T4 under `root.proc` / `root.analysis` with TTL. asset-model default `IoTDbPath` becomes
  `root.proc.<path>` (F-09).
- Relocation hook: when a loop's area/unit changes, cplm-api upserts the tags.
- Update `docs/migration/uns-namespace-spec.md`, `docs/architecture-review/06-iotdb-historian.md`,
  `migration/MARUN-CONTEXT.md` commands, and `ams-sims`.

### Phase 4: Optional, separate decision
IoTDB ≥ 1.3.3 (path-level TTL) or 2.x (table model, where hierarchy columns are first-class). Do not combine it
with the namespace move.

---

## 7. Decisions needed

| ID | Question | Recommendation |
|---|---|---|
| D-1 | Option A (hierarchy in path) or B (stable path + tags + asset model)? | **DECIDED 2026-11-03 (user): `root.hdpe.cpm.<loop>.<role>`**, i.e. real site + `cpm` + stable loop id. Area/unit stay out of the path (tags + asset model). See section 9 |
| D-2 | Copy history into the new tree or stitch reads until 90 d TTL ages it out? | Copy if Phase 0 shows enough free disk, else stitch |
| D-3 | Keep the IoTDB KPI dual-write? Nothing reads it; Postgres is authoritative | **Drop it** |
| D-4 | One leading-digit rule (`_` vs `u`)? | Keep `_` for loop nodes (existing ids), document it |
| D-5 | TTL for `root.proc` / `root.analysis` | 90 d, same as loops, until a use case needs more |
| D-6 | Soak length before deleting `root.site1` | 7 days, plus one daily-check pass |

---

## 8. Release bookkeeping (when built)

- `changes_tracker.md`: one CHG per phase. Services touched by Phase 1: cplm-api, ams-api, ingestion-service,
  historian-bff, ams-frontend, Flink jar (alarm prefix), plus schema `NN_cpm_historian_device.sql`.
  Phase 2 adds iotdb-init, a backfill script (`migration/iotdb-loop-namespace-backfill.sh`, resumable, read-only
  dry-run first) and a verify script.
- `prod_decision.md` gets a new "Historian namespace" section: database list + TTLs, path grammar, tag set,
  `SafeNode` rule, who assigns `historian_device`, the "no database without TTL" guard, and the cut-over date
  per site. Its line 96 ("Historian device for replays") is then superseded.
- **At a new plant:** the site slug comes from the asset model. Nothing in the historian may be named
  `site1` again.

---

## 9. Decision 2026-11-03: `root.hdpe.cpm.<loop>` and storage for 365 d / 2 years

**Path (user decision):** `root.hdpe.cpm.FIC10401.{pv,sp,op,vp,mode}`. `<site>` comes from the registry, so
another plant gets `root.<its site>.cpm.*`. This supersedes the `root.loop.<site>.*` grammar in 5.1-5.2. The rest of
the plan is unchanged: the `historian_device` column, tags for area/unit, per-loop cut-over, and the F-05/F-06 fixes.

**Database boundary:** create the database at **`root.hdpe.cpm`** (level 2), not `root.hdpe`. TTL is per
database on 1.3.2, so this lets later `root.hdpe.<other>` trees (alarms, KPI, process tags) keep their own TTL.

### 9.1 Inputs (measured at Marun)

| Input | Value | Source |
|---|---|---|
| Feed rate | ~1,700 rows/min ≈ 28 rows/s ≈ **2.45 M rows/day** (one row = pv, sp, op, vp, mode of one loop) | `prod_decision.md:153, 155`; `changes_tracker.md:2195` |
| Loops / grid | ~144 monitored loops at a 5 s grid (144 / 5 s = 28.8 rows/s, consistent) | `prod_decision.md:54, 63` |
| Series per loop | 4 DOUBLE (vp absent on many loops) + 1 TEXT | `RawLoopIotDbConsumer.cs:239-243` |
| Storage form | **non-aligned** series (`create timeseries`), so each of the 5 series stores its own time column; IoTDB 1.3.2 defaults (GORILLA for DOUBLE, TS_2DIFF time, LZ4) | `IotDbWriteClient.EnsureTimeseriesAsync` |
| Data held now | since 2026-09-01 (oldest `PIC80105.pv` 2026-09-01T22:44Z); TTL 90 d has not yet deleted anything | `docs/next-release/evidence-retention-current-and-target.md:415` |

### 9.2 Estimate (first principles, not yet measured)

Bytes per row (all 5 series together): noisy pv/op ≈ 4-6 B each with Gorilla; sp and mode nearly constant
≈ 0.3 B each; vp ≈ 3 B on average; 5 time columns ≈ 1.5-2 B each. Range **12-35 B/row, middle ≈ 21 B/row**.

| Retention | Low (12 B/row) | **Middle (21 B/row)** | High (35 B/row) | Middle, aligned series (≈ 15 B/row) |
|---|---|---|---|---|
| per day | 29 MB | **51 MB** | 86 MB | 37 MB |
| 90 d (today) | 2.6 GB | **4.6 GB** | 7.7 GB | 3.3 GB |
| **365 d** | 10.7 GB | **18.8 GB** | 31.3 GB | 13.4 GB |
| **730 d (2 years)** | 21.5 GB | **37.5 GB** | 62.5 GB | 26.8 GB |

Add **~15 %** for compaction working space and TsFile metadata. The KPI subtree adds a few percent while the
dual-write stays (D-3). Scaling: per loop ≈ **130 MB/year** at a 5 s grid. A 1 s grid is 5×.

**Aligned series:** the new `root.hdpe.cpm.*` devices are created fresh in the cut-over anyway. Creating them
`ALIGNED` (one shared time column, `INSERT … ALIGNED VALUES`) saves about 30 % for free. Readers' `SELECT` is
unchanged. Verify historian-bff `/trend`, `/raw/cursor`, `/last` and the replay source on the lab first.

### 9.3 Fit on the Marun VM

The VM has 96 GB shared with other products. Our other stores run at ≈ 25-45 GB (`MARUN-DISK.md` §I), and the
disk has filled four times (`prod_decision.md:153-156`). **365 d (~15-22 GB with headroom, aligned/non-aligned
middle) is tight but plausible. 2 years (~31-43 GB) needs a disk extension or a dedicated IoTDB volume.** Decide
after the measurement below.

### 9.4 Replace the estimate with a measurement (run on Marun, read-only)

```bash
IOTDB_PW=$(grep -E '^IOTDB_PASSWORD=' /opt/AMS-open/migration/.env | cut -d= -f2-)
sudo du -sb "$(docker volume inspect -f '{{.Mountpoint}}' ams-cpa_iotdb-data)"       # bytes on disk now
docker exec ams-iotdb /iotdb/sbin/start-cli.sh -h 127.0.0.1 -p 6667 -u root -pw "$IOTDB_PW" \
  -e "select count(pv) from root.site1.cpm.* align by device" | awk -F'|' '{s+=$3} END {print s" rows"}'
```

bytes ÷ rows = real B/row. Then **365 d = B/row × 2.45 M × 365**, **2 y = × 730**, plus 15 %. Because nothing has
aged out yet, `bytes ÷ days since 2026-09-01` is a second check; feed outages make it slightly low. Record the
result and the chosen TTL in `prod_decision.md`.

---

## 10. Moving the loop tree to `root.hdpe.<seg>.<loop>`: changes and production runbook (TTL stays 90 d)

`<seg>` is `cpm` (section 9) or `loop`. Only the prefix string differs; the steps are identical.
Loop nodes keep registry casing (`FIC10401`). Lowercase (`fic10401`) would change `SafeNode` in four code bases
plus the collision guard, and is **not** part of this move.

### 10.1 Changing IoTDB alone does not work

IoTDB cannot rename a path. Every writer and reader builds the path from its **own** prefix setting. If you only
create `root.hdpe.cpm` in IoTDB, nothing writes there. If you only change the settings, all history before the
switch disappears from every chart, replay and export, because readers look in the new tree only.
So the move = **settings in 5 places + copy the 90 days of data + re-project asset overrides**. No C# or Java code
change is needed.

**"Just rename root.site1?" (checked 2026-11-03).** IoTDB 1.3.2 has no rename for a database or a path. Path rename
(`ALTER TIMESERIES … RENAME TO`) exists only from **2.0.8**, per series, and crossing into another database is not
documented. Logical views (`CREATE VIEW`) only add a second, read-only name while data and writes stay in
`root.site1`, and a view is needed for each new loop. Whatever replaces the copy, the application-side changes in
10.2 are the same, because every service holds its own prefix. The no-copy alternative: switch the settings and let
the 90 d TTL empty `root.site1`. Then ranges before the switch are blank in the UI, exports and replay for up to
90 days (still readable in the CLI under the old path), and the old database is deleted afterwards.

### 10.2 What changes

| # | What | Where | Picks it up automatically? |
|---|---|---|---|
| 1 | Writer of raw samples | ams-api env `IotDb__LoopRootPrefix=root.hdpe.cpm` (`migration/deploy/docker-compose.marun.yml` ams-api block, `infra/docker/docker-compose.yml`) | Yes, after container recreate |
| 2 | KPI writer, replay/reconstruction device, asset overrides | cplm-api env `IotDb__LoopRootPrefix=root.hdpe.cpm` (same two compose files) | Yes, after recreate. Replay gets `--iotdb-device` from this setting, so the Flink jar needs no change |
| 3 | All CPM trend/raw/export pages | `VITE_LOOP_ROOT_PREFIX` is **baked in at build time** and is **not** a build arg today: add `ARG`/`ENV VITE_LOOP_ROOT_PREFIX` to `infra/docker/frontend/Dockerfile` + `args:` in compose | **No.** Needs a new ams-frontend image |
| 4 | Database + 90 d TTL | iotdb-init env `LOOP_DB=root.hdpe.cpm`, `LOOP_CPM_PREFIX=root.hdpe.cpm` (not passed today, add to compose) | On re-run of `iotdb-init`; or run the two statements by hand (10.3) |
| 5 | Asset-model overrides (Designer/binding-resolver history for loop signals) | `POST /api/v1/cpm/loops/bulk-republish-evidence` after cplm-api restarts | **No.** Stored rows keep `root.site1.cpm.*` until re-projected |
| 6 | Operator scripts and docs | `scripts/verify-ot-loop-flow.ps1:134-189` (hardcoded), `migration/MARUN-CONTEXT.md:240-252`, `MARUN-DAILY-CHECK.md`, `prod_decision.md:96-98`, `ams-sims` | No, edit them |
| — | historian-bff, binding-resolver, Flink engine jobs, ingestion-service | none | Not affected (historian-bff takes the series from the caller) |

### 10.3 Production runbook (Marun)

**Pre-checks (read-only)**
1. `show databases`: `root.hdpe` must **not** already be a database, because databases cannot nest.
   `show all ttl`, `count devices root.site1.cpm.*`.
2. `du -sb` of `ams-cpa_iotdb-data` and `df -h /`. Free disk must be ≥ the loop tree size plus 5 GB, because the copy
   duplicates the data until the old database is deleted (estimate 4.6 GB for 90 d, section 9.2).
3. Rehearse steps 4-9 on the lab with the same script and measure the copy duration.

**Release contents:** new ams-frontend image (build arg). ams-api and cplm-api images are unchanged; their compose and
`.env` change. Also the copy script `migration/iotdb-move-loop-tree.sh` (to be written: per loop, per day,
resumable, `--dry-run`, logs counts).

**Steps**
4. `CREATE DATABASE root.hdpe.cpm;` then `SET TTL TO root.hdpe.cpm 7776000000;` (90 d).
5. **Bulk copy while the old writer still runs**, per loop and per day, up to T_copy:
   `SELECT * INTO root.hdpe.cpm.<L>(::) FROM root.site1.cpm.<L> WHERE time >= <d> AND time < <d+1>;`
   `*` matches only the device's own measurements (pv, sp, op, vp, mode), not the unread `kpi.*` subtree.
   Verify the syntax on the lab first.
6. **Switch (short window):** set the env in `migration/.env`/compose and deploy the new frontend image, then
   `docker compose up -d ams-api cplm-api ams-frontend`. Record T_flip. Kafka offsets carry over, so no sample is lost.
7. **Delta copy** `[T_copy − 10 min, T_flip + 5 min]`. The overlap is harmless: same (device, timestamp) overwrites.
8. `bulk-republish-evidence` to rewrite the asset overrides.
9. **Verify:**
   - `select count(pv)` per loop for one past day: old = new.
   - `select last pv from root.hdpe.cpm.<L>` advances, and the old tree's last timestamp stays at T_flip.
   - `/api/hist/last?series=root.hdpe.cpm.<L>` answers.
   - CPM Explorer/Historical shows 12 h, 24 h and older ranges with no gap at T_flip.
   - One reconstruction (replay) succeeds.
   - Lag of group `traverse-cpa-iotdb-raw-loop` is back near 0.
10. **Soak 7 days, then** `DELETE DATABASE root.site1;`. That frees the old copy.

**Rollback** (before step 10): revert the env and the frontend image and recreate the containers. Then copy
`[T_flip, now]` back from the new tree to the old one. Data written in between lives only in the new tree.

**Records:** CHG number (reserve it first), `changes_tracker.md` (services: ams-frontend image; ams-api, cplm-api,
iotdb-init config; script), `prod_decision.md` (path grammar, database `root.hdpe.cpm`, TTL 90 d, cut-over date;
supersedes line 96).

### 10.4 Zero-data-loss rules (user requirement 2026-11-03)

Only the copy route (10.3) meets "no data loss". These rules make each risk explicit:

| Risk | Rule that removes it |
|---|---|
| Old data deleted too early | Nothing is deleted until the end. `root.site1` stays untouched (and is the backup) through copy, switch and a 7-day check. `DELETE DATABASE root.site1` only after the final count comparison passes |
| Copy incomplete or wrong | Per loop, per day, per measurement: `count()` old = new, and first/last timestamps equal. A mismatch re-copies that day (idempotent: same timestamp overwrites). The script stops on any error and resumes where it stopped |
| Samples lost during the switch | ams-api resumes from its committed Kafka offset, so samples that arrive while it restarts are written after it starts. The samples topic keeps **12 h** (`migration/kafka/topics.txt:25`): the switch must finish well inside that (it takes minutes); abort and roll back if it cannot |
| Gap between last copy and switch | Delta copy `[T_copy − 10 min, T_flip + 5 min]`. Overlap is harmless |
| Disk fills during copy | Pre-check free ≥ tree size + 5 GB. The script pauses below a free-space floor. If IoTDB still refuses writes, ams-api stalls and **holds** offsets instead of dropping rows (CHG-020), so nothing is lost while space is freed within the 12 h Kafka window |
| Copied data expires early | Copied rows keep their original timestamps and the new database gets the same 90 d TTL, so they age exactly as before. Never set a shorter TTL on the new database |
| KPI subtree | Copied too (small), so no stored series is dropped, even unread ones |
| Reconstruction/replay running during the switch | No replays from the workbench during the window |
| Wrong settings after switch | Rollback = revert env + frontend image, then copy `[T_flip, now]` back to the old tree. Possible until the old database is deleted |
