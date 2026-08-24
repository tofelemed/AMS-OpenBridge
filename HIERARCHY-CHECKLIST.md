# Plant → Area → Unit Hierarchy — Implementation Checklist

Tracks the gap tasks from [assetmodel.md](assetmodel.md) Part 9. Decisions locked 2026-08-24:
**Option B** (areas are path segments; derivation fixed), **every unit under an area**,
**loops = Device-level nodes (ISA-88 control module) under their Unit**, origin IDs kept
resolvable via `alias_mapping` with the slug/label split (§8.3).

Legend: `[ ]` todo · `[x]` done · `[~]` in progress · `[-]` deferred (with reason)

## P0 — Decision record
- [x] P0.1 Recorded as MIGRATION_LOG.md decision **#17** (Option B + unit-under-area + ISA-88 loop attachment + slug/label/alias convention)

## P1 — Hierarchy integrity (asset-model) — G-01, G-02, G-03, G-04, G-09, G-11
- [x] P1.1 Path grammar validation on create (single + bulk) — `HierarchyRules.GrammarError`; verified live (400 on bad charset / wrong level shape); pre-checked that all 377 live rows pass
- [x] P1.2 Level-adjacency + path↔parent consistency (`parent.Type < child.Type`, parent must be the path's natural prefix)
- [x] P1.3 Parent derivation when `parentId` omitted — DB **and** in-batch; verified live (device→unit, measurement→device)
- [x] P1.4 `ParentId` patchable via bulk updates (validated re-parent; used by backfill)
- [x] P1.5 Delete guard: 409 + `references.children` — verified live
- [x] P1.6 Cross-DB delete guard via cplm-api `GET /api/v1/cpm/loops/referencing` (fail closed) — verified live (409 `references.loops` on a loop-mapped measurement)
- [x] P1.7 Startup self-heal parity for the 5 transport-override columns
- [x] P1.8 Purge job (`DeletedAssetPurgeService`, `Maintenance:PurgeDeletedAfterDays` default 30, parent-referenced rows survive)
- [x] P1.9 G-01: binding-resolver fallback aligned to asset-model's ≥4 rule — verified live (3-seg → bare `nonexist99`, 4-seg → `u1001_…_nonexist88`)
- [x] P1.10 Builds clean (asset-model, binding-resolver)
- [x] P1.11 **(found during validation)** parent_id self-FK mapped in EF (`HasOne().WithMany()`) — without it same-batch parent+child inserts ordered by random GUID and tripped `assets_parent_id_fkey` non-deterministically (masked by a Polly retry); 5 activate/retire cycles now clean, 0 retries

## P2 — Filter/cascade API — G-05
- [x] P2.1 `GET /assets/filters/sites` — verified live (3 sites incl. `hdpe`)
- [x] P2.2 `GET /assets/filters/areas?site=` — 400 without site ✓; returns the 8 HDPE areas ✓
- [x] P2.3 `GET /assets/filters/units?site=&area=` — area given → area's units ✓; omitted → legacy flat units (houston) ✓
- [x] P2.4 `GET /assets/filters/devices?site=&unit=[&area=]`
- [x] P2.5 Gateway `AssetCacheInvalidator` subscribes `asset-events` → busts `cache:assets:*` — verified live (MISS→HIT→write→MISS within ~1 s)
- [x] P2.6 Gateway builds clean

## P3 — Master Data admin UI — G-06
- [x] P3.1 `Administration → Plant Model` tab (`/admin/plant-model`), tab visible on `asset.view`, writes need `asset.edit`; `/admin/*` route anyOf widened with `asset.edit`
- [x] P3.2 Tree browser (Site→Area→Unit→Device→Measurement) with search ([PlantModelConfig.tsx](src/frontend-ob/src/components/Administration/PlantModelConfig.tsx))
- [x] P3.3 Create/edit dialogs; parent = the node clicked (never free text); segment auto-slugged from name (`u` prefix on leading digit), editable, create-only
- [x] P3.4 Measurement dialog: engineering_unit, lo/hi limits; Device/Measurement: template
- [x] P3.5 Delete surfaces the server's 409 `error` text verbatim
- [x] P3.6 Mutations invalidate `plant-model`, `assets`, `cpm/filters`, `cpm/plant-locations` query keys

## P4 — Bulk import — G-06, G-08
- [x] P4.1 Hierarchy+tags CSV importer (Source→Review→Import; one by-paths preload; name-or-slug cell matching; hierarchy auto-create is an explicit opt-in listing exactly what it will create; `ot_tag` → alias rows)
- [x] P4.2 Alias endpoints: `GET /aliases` (list/search/page), `PUT /aliases/{id}` (canonicalPath/isActive only — identity immutable), `DELETE /aliases/{id}`, `POST /aliases/bulk`; single POST now 409s on duplicates — verified live
- [x] P4.3 `Administration → Tag Aliases` tab: list + add + delete + CSV import ([AliasConfig.tsx](src/frontend-ob/src/components/Administration/AliasConfig.tsx))

## P5 — Loop-registry hole — G-07, G-12
- [x] P5.1 cplm-api validates site/area/unit against asset-model on activate + bulk-activate (batch = one by-paths call; types checked Site/Area/Unit) — verified live: bogus site → 422 `LOCATION_NOT_IN_UNS`; asset-model-down also refuses unless overridden
- [x] P5.2 Projection creates the loop **Device** (`CpmLoop`, ledger role `DEVICE`) when the unit exists; signals parent under it; ledgered orphans re-parent on republish — verified live (device under unit, 4 signals under device); retirement releases all of it ✓; dotted loop tags / missing units skip device creation (documented degradation)
- [x] P5.3 UI: picker reports manual mode → wizard sends `allowUnmodelledLocation`; bulk-import dialog has the explicit override checkbox
- [x] P5.4 `plantLocation.tsx` picker reads the `/assets/filters` cascade (names displayed, segments submitted); whole-tree pull kept ONLY for the CSV validator
- [x] P5.5 Backfill: republish-evidence over all 54 loops — **orphaned measurements 219 → 6** (the 6 = `narnia/*` loops at a never-modelled site + 2 `houston/derived` outputs, both expected); 50 `CpmLoop` devices created

## P6 — Real HDPE tree
- [x] P6.1 [48_hdpe_plant_hierarchy.sql](database/scripts/48_hdpe_plant_hierarchy.sql) — generated from hirarichy.csv: `hdpe` + 7 sections + Unassigned area/unit + 25 units + 59 `instrumental-pro` aliases
- [x] P6.2 Applied to the running DB (1+8+26 nodes, all parented; alias resolve `Section 100` → `hdpe/section_100` verified via API)
- [x] P6.3 Compose: `Services__CplmApi` on asset-model; cplm-api `Auth__ServicePermissions: "analytics.view"`

## Validation & test
- [x] V.1 asset-model, binding-resolver, gateway, cplm-api rebuilt + redeployed, all healthy
- [x] V.2 Live API: grammar 400s, parent derivation, delete guards (children + loops + fail-closed path), filter cascade + 400s, alias CRUD/resolve, cache invalidation
- [x] V.3 CPM E2E: HDPE activation → device+signals projected+parented; bogus location → 422; retire → full release; 5 repeat cycles clean
- [-] V.4 `dotnet test tests/integration` — **cannot run against the current stack (pre-existing)**: the tests hard-code direct host ports 5001/5002 that the Plan 04 lockdown removed (services publish no host ports), so their `WaitForService` loop hangs by construction. They compile clean (`dotnet build tests/integration` ✓). The same surface (by-path resolve, fallback provenance/device rule, filters, guards) was verified live through the gateway in V.2/V.3. Reviving them means porting to the gateway + a token — noted as follow-up, out of this scope
- [x] V.5 Frontend: `tsc --noEmit` ✓, `npm run lint` 0 warnings ✓, `npm run build` ✓
- [x] V.6 Checklist + memory updated

## Audit & E2E round 2 (2026-08-24, post-review)
- [x] A.1 **Bug fixed** — alias mutations (POST/PUT/DELETE/bulk) never published `asset-events`, so the gateway's 60 s `/api/aliases` cache stayed stale for other users; they now publish (`PublishAliasEvent`, same channel) — verified live (alias write → cached list MISS)
- [x] A.2 **Bug fixed** — write-vs-sweep race: a mutation's own immediate refetch could still HIT a pre-write cache entry (the pub/sub sweep coalesces on a 1 s tick). `ResponseCacheMiddleware` now sweeps the class **synchronously** when a mutation traverses a cached route family — verified live (prime HIT → POST → immediate GET MISS, both assets and aliases)
- [x] A.3 **Latent bug fixed** — `loop_tag_map`'s PK allows several paths per role; the batch projection would then emit two ledger rows for one `(loop_id, signal_role)` key and Postgres rejects the whole multi-row upsert ("ON CONFLICT DO UPDATE cannot affect row a second time"). Now deduped to first-path-per-role, matching the old single-loop behaviour
- [x] A.4 **UX fix** — the loop wizard's default `site: 'site1'` (a site in no asset model) would steer every new loop into a 422; it now starts empty, forcing a pick from the cascade
- [x] A.5 Audit sweep of all other changes (bulk two-pass wiring, delete guards, filters, purge, invalidator, cplm validate/projection/referencing, frontend files, SQL, compose) — no further defects found; noted non-issues: shared-device retirement is protected by the child guard; editing a `narnia`-located loop needs the manual-mode override (by design)
- [x] E.1 `ams-frontend` image rebuilt **after** all fixes and redeployed (healthy); shipped bundle verified to contain Plant Model, Tag Aliases, `allowUnmodelledLocation`, the filters cascade, and no stale `site1` default
- [x] E.2 **Playwright UI E2E** ([scripts/validation/ui-hierarchy-smoke.mjs](scripts/validation/ui-hierarchy-smoke.mjs), chromium, against :3000): login → Plant Model tree renders HDPE → expand loads Sections → search finds units → Tag Aliases renders 59 rows → Loop Registry wizard cascade site→area→unit — **9/9, two consecutive runs**; only pre-existing noise (pre-login `/api/auth/refresh` 401, navigation-aborted SignalR negotiate) observed, whitelisted with rationale
- [x] E.3 API regression on final images: grammar 400 ✓, bogus location 422 ✓, 2× activate→parented-signals→retire cycles ✓, 0 DbUpdateExceptions, 0 Polly retries

## Deferred
- [-] G-10 asset-scope filtering on reads — separate security workstream (must align with historian-bff `assetScope`)
- [-] `is_active` lifecycle column — revisit after the purge has run
- [-] `POST /assets/{id}/move` re-parenting — needs its own design (path = transport address)
- [-] Retire houston/dallas demo data — kept: the lab sims publish against it
- [-] `narnia` loops relocation — moving them changes their signal paths (destructive); new occurrences are blocked by P5.1, existing ones stay visible via the readiness flags
