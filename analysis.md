# CPLM/CPM read-path audit, enhancements and refinements

Audit date: 2026-09-12.

Scope: static inspection of the implementation and configuration. The original audit did not execute the stack, install dependencies, or change application code. This Markdown file records the findings and proposed work; its creation was subsequently requested by the user. No proposed enhancement has been implemented as part of this report.

Evidence notation: **[OBSERVED]** identifies code/configuration facts; **[INFERRED]** identifies deductions, conditional cost formulas, proposed changes and engineering assessments. File references are repository-relative and include source line ranges. Runtime-dependent conclusions use “not determinable from static analysis” and identify the required measurement. Benchmarks have external primary-source references rather than repository line references.

## 1. Executive summary

[OBSERVED] The registry list fetches every loop and then performs two sequential hydration queries per loop. Frontend pagination only slices the downloaded dataset. This affects registry-dependent pages rather than just the Registry screen. Evidence: `src/services/cplm-api/Services/CpmLoopRegistryService.cs:224–279`; `src/frontend-ob/src/components/Cpm/LoopRegistry.tsx:33–53`.

[OBSERVED] Fleet summary, rankings and heatmap repeatedly find the latest verdict across historical results without a time restriction. Rankings and heatmap limit results after latest-per-loop selection. Performance mounts separate rankings queries for limits 50 and 12. Evidence: `src/services/cplm-api/Controllers/CpmFleetController.cs:46–72,142–171,223–243`; `src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:106–112`.

[OBSERVED] Pipeline metrics performs serial Flink overview/checkpoint/job/vertex requests. Windows and Pipeline poll it every 20 seconds. Evidence: `src/services/cplm-api/Controllers/CpmReadinessController.cs:251–388`; `src/frontend-ob/src/hooks/useCpm.ts:294–300`.

[OBSERVED] Effective measures include bounded historian width, cursor-based raw reads, generally stable React Query keys, and scoped live DDATA subscriptions. However, MQTT connection also requests wildcard snapshots. Snapshot Redis is a separate 256 MB `noeviction` instance; the 512 MB `volatile-lru` instance is the cache tier. Evidence: `src/services/historian-bff/Program.cs:114–118,167–208`; `src/frontend-ob/src/store/mqttStore.ts:300–311,393–440`; `infra/docker/docker-compose.yml:119–176,858–875`.

[INFERRED] Highest-priority work is registry batching/projection, repeated fleet-history work, diagnostic fan-out and broad snapshot acquisition. Actual latency, monetary savings, frequency-weighted ranking and first saturation point are **not determinable from static analysis**. Measure page mix, dwell, query plans, response bytes, dependency timing and resource saturation before making numerical performance claims. Evidence for the work multipliers appears in Sections 4–6.

## 2. Read path and architectural constraints

[OBSERVED] The browser loads nginx's SPA, restores authentication, then sends API calls through nginx → gateway → owning service. Gateway validates JWTs; services authorize gateway-injected headers. CPLM reads registry, gate/feature results and event frames from `traverse_cplm`. Historian BFF reads IoTDB REST v2 and Redis snapshots. Asset-model supplies metadata; binding-resolver resolves paths through asset-model. Evidence: `src/frontend-ob/nginx.conf:13–58`; `src/frontend-ob/src/App.tsx:216–218,309`; `src/services/_shared/TraverseAuth.cs:89–135`; `src/services/cplm-api/Controllers/CpmAnalyticsController.cs:126–165`; `src/services/historian-bff/Program.cs:88–122,266–346`.

[OBSERVED] CPM currently constructs IoTDB paths and live topics from loop IDs. Readiness probes bindings, but those results do not supply the frontend transports. Evidence: `src/frontend-ob/src/utils/loopSeries.ts:17–33`; `src/frontend-ob/src/hooks/useLoopLive.ts:17–58`; `src/services/cplm-api/Controllers/CpmReadinessController.cs:468–525`.

[OBSERVED] Future changes must preserve configuration-only displays, UNS path-and-role binding, Flink-owned analysis, separate service databases and single-member CPLM consumer groups. Actual frames group derives from `ConsumerGroupId + "-frames"`. Evidence: `CLAUDE.md:90–105`; `src/services/cplm-api/BackgroundServices/CplmResultConsumerService.cs:558–561`; `src/services/cplm-api/BackgroundServices/CplmEventFrameService.cs:66–68`.

### 2.1 Constraint register for proposed work

| Rule | Evidence | Implication for enhancement design |
|---|---|---|
| [OBSERVED] Edge-only authentication | `CLAUDE.md:90–92` | [INFERRED] Preserve gateway validation and downstream authorization; do not reintroduce per-service JWKS validation as a performance fix. |
| [OBSERVED] CQRS for displays | `CLAUDE.md:98` | [INFERRED] Do not cache live process values inside display/template configuration. |
| [OBSERVED] Bind through UNS | `CLAUDE.md:99` | [INFERRED] Obtain live/history transports from path-and-role resolution; avoid additional loop-ID transport conventions. |
| [OBSERVED] Flink-only compute | `CLAUDE.md:100` | [INFERRED] New analytical rollups belong in Flink, not a new .NET analysis task. Existing read-query aggregation is not evidence of an exception to the rule. |
| [OBSERVED] One logical DB per service on shared infrastructure | `CLAUDE.md:101` | [INFERRED] Preserve data ownership when batching queries or adding read projections. |
| [OBSERVED] CPLM ownership and one member per consumer group | `CLAUDE.md:102` | [INFERRED] Do not horizontally replicate consumer-enabled CPLM processes as a routine read-scaling change. |
| [OBSERVED] Quality on reopen | `CLAUDE.md:105` | [INFERRED] Snapshot/fallback changes must preserve age, source and quality semantics. |

## 3. Endpoint and frontend inventory

### 3.1 CPM API surface

[OBSERVED] Route suffixes below are relative to `/api/v1/cpm`. A = `analytics.view`; M = `cpm.manage`. Event mutations combine the controller's A policy with M. “Unbounded result” concerns collection cardinality, not arbitrary string length or rows scanned. Evidence: `src/services/cplm-api/Controllers/CpmAnalyticsController.cs:18–19`; `src/services/cplm-api/Controllers/CpmLoopsController.cs:19–20,44–67`; `src/services/cplm-api/Controllers/CpmEventsController.cs:18,98–121`.

| Route | Verb | Handler file and lines | Store/dependency | Auth | Pagination | Response shape | Unbounded result |
|---|---|---|---|---|---|---|---|
| [OBSERVED] `/loops` | GET | `src/services/cplm-api/Controllers/CpmLoopsController.cs:44–50` | Registry, tag map, links | A | None | `{loops,count}` | Y |
| [OBSERVED] `/loops/{loopId}` | GET | `src/services/cplm-api/Controllers/CpmLoopsController.cs:53–59` | Same | A | One parent; uncapped children | Loop DTO, tags, links | Y, children |
| [OBSERVED] `/loops/referencing` | GET | `src/services/cplm-api/Controllers/CpmLoopsController.cs:108–116` | Registry/tag map | A | Count | `{count}` | N |
| [OBSERVED] `/loops/{loopId}/gates/latest` | GET | `src/services/cplm-api/Controllers/CpmAnalyticsController.cs:121–140` | Gate results | A | LIMIT 1 | Gate matrix | N |
| [OBSERVED] `/loops/{loopId}/gates` | GET | `src/services/cplm-api/Controllers/CpmAnalyticsController.cs:143–169` | Gate results | A | Default 100, cap 500; optional dates; no cursor | `{loopId,windowKind,count,windows}` | N |
| [OBSERVED] `/loops/{loopId}/kpis` | GET | `src/services/cplm-api/Controllers/CpmAnalyticsController.cs:176–275` | Short/long features | A | Default 200, cap 500; optional `before` and dates | `{loopId,resolution,tier,count,nextBefore,samples}` | N |
| [OBSERVED] `/resolutions` | GET | `src/services/cplm-api/Controllers/CpmAnalyticsController.cs:284–314` | Constants | A | N/A | Window/gate/fusion specifications | N |
| [OBSERVED] `/registry-contract` | GET | `src/services/cplm-api/Controllers/CpmLoopsController.cs:264–278` | Constants | A | N/A | Roles/types/notes | N |
| [OBSERVED] `/fleet/summary` | GET | `src/services/cplm-api/Controllers/CpmFleetController.cs:33–96` | Registry/gates | A | Aggregates | Loop/capability counts, diagnoses | N |
| [OBSERVED] `/fleet/rankings` | GET | `src/services/cplm-api/Controllers/CpmFleetController.cs:102–202` | Registry/gates | A | Default 50, cap 200; no cursor | Scope/order/count/loops | N |
| [OBSERVED] `/fleet/heatmap` | GET | `src/services/cplm-api/Controllers/CpmFleetController.cs:208–264` | Registry/gates | A | Default 100, cap 300; no cursor | Gate keys and loop cells | N |
| [OBSERVED] `/events` | GET | `src/services/cplm-api/Controllers/CpmEventsController.cs:52–95` | Event frames | A | Default 100, cap 500; no cursor | `{count,openOnly,sort,events}` | N |
| [OBSERVED] `/calculations` | GET | `src/services/cplm-api/Controllers/CpmEventsController.cs:151–235` | Gate JSON/constants | A | Discovery caps generated keys at 2,000 | Catalogue/observed gates/versions | N |
| [OBSERVED] `/loops/{loopId}/readiness` | GET | `src/services/cplm-api/Controllers/CpmReadinessController.cs:89–213` | Registry, links, results, resolver, Flink | A | Fixed checks/counts | Readiness/checks/evidence | N |
| [OBSERVED] `/pipeline-status` | GET | `src/services/cplm-api/Controllers/CpmReadinessController.cs:219–243` | Flink/cache | A | Required names fixed; unexpected names uncapped | Jobs/flags/unexpected jobs | Y |
| [OBSERVED] `/pipeline-metrics` | GET | `src/services/cplm-api/Controllers/CpmReadinessController.cs:251–404` | Flink | A | At most ten required job names | Collected time/jobs/unavailable fields | N; dependency work also depends on vertices |
| [OBSERVED] `/replays/{replayId}` | GET | `src/services/cplm-api/Controllers/CpmLoopsController.cs:252–261` | Flink/Postgres | A | One replay | Job state/result count | N |
| [OBSERVED] `/loops/activate` | POST | `src/services/cplm-api/Controllers/CpmLoopsController.cs:66–100` | Registry service; write internals excluded | M | One input | Loop DTO | Y, nested collections |
| [OBSERVED] `/loops/bulk-activate` | POST | `src/services/cplm-api/Controllers/CpmLoopsController.cs:123–143` | Registry service; write internals excluded | M | Cap 5,000 inputs | Counts/item results/warning | N |
| [OBSERVED] `/loops/bulk-delete` | POST | `src/services/cplm-api/Controllers/CpmLoopsController.cs:149–169` | Registry service; write internals excluded | M | Cap 5,000 inputs | Counts/missing IDs/assets released | N |
| [OBSERVED] `/loops/{loopId}/republish-evidence` | POST | `src/services/cplm-api/Controllers/CpmLoopsController.cs:175–192` | Registry/projection service; write internals excluded | M | One loop | Republished/projected status and counts | N |
| [OBSERVED] `/loops/{loopId}` | DELETE | `src/services/cplm-api/Controllers/CpmLoopsController.cs:198–209` | Registry service; write internals excluded | M | One loop | Deleted status | N |
| [OBSERVED] `/loops/{loopId}/recompute` | POST | `src/services/cplm-api/Controllers/CpmLoopsController.cs:216–249` | Registry/Flink submission; write internals excluded | M | One loop | 202/replay ID/job ID/status URL | N |
| [OBSERVED] `/events/{id:long}/acknowledge` | POST | `src/services/cplm-api/Controllers/CpmEventsController.cs:98–114` | Event frames | A+M | One event | `{id,ackState}` | N |
| [OBSERVED] `/events/{id:long}/shelve` | POST | `src/services/cplm-api/Controllers/CpmEventsController.cs:120–139` | Event frames | A+M | One event | `{id,ackState,shelveUntil}` | N |

[OBSERVED] Registry backing-query and DTO evidence: `src/services/cplm-api/Services/CpmLoopRegistryService.cs:101–152,224–279,1521–1552`. Replay backing-query evidence: `src/services/cplm-api/Services/CplmRecomputeService.cs:126–172`.

### 3.2 CPM pages and read hooks

[OBSERVED] All twelve routes require `analytics.view`. F below means the location-filter requests: `/api/assets/filters/sites`, plus `/areas` and `/units` when site is selected. LIVE means `spBv1.0/{group}/DDATA/{edge}/{device}`, default group `ams_site1`, edge `ams_edge1`, loop-derived device. Global alarm/SignalR initialization is disabled by `CPA_SLICE_ONLY=true`. Evidence: `src/frontend-ob/src/App.tsx:278–307,447–458`; `src/frontend-ob/src/productSlice.ts:6`; `src/frontend-ob/src/components/Cpm/plantLocation.tsx:83–107`; `src/frontend-ob/src/hooks/useLoopLive.ts:17–58`.

| Page / component evidence | Hooks and mount endpoints | Interaction endpoints | Recurrence / live |
|---|---|---|---|
| [OBSERVED] `/cpm`; `src/frontend-ob/src/components/Cpm/CpmOverview.tsx:29–48,78–96` | F; fleet summary/rankings50; events3; child pipeline-status/resolutions; selected trend/snapshots | Selected loop trend/snapshot; drawer latest gates | Fleet/events60s, pipeline15s, trend60s; LIVE |
| [OBSERVED] `/cpm/performance`; `src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:101–112` | F; resolutions; summary; rankings50 and12; heatmap | Scope/window/order; gate selection latest/catalogue | Four fleet reads60s; no live |
| [OBSERVED] `/cpm/explorer`; `src/frontend-ob/src/components/Cpm/CpmExplorer.tsx:40–75` | F/loops; selected workspace latest/readiness/events; Summary trend/live | Loop/tab; Calculations resolutions and selected result kind; Relationships catalogue | Events30s; Summary trend60s; LIVE on Summary |
| [OBSERVED] `/cpm/calculations`; `src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:47–68` | F/loops/catalogue/resolutions; selected registered loop latest gate and KPI1 at60m/24h | Loop changes; drawer events10 | Drawer events30s; no live |
| [OBSERVED] `/cpm/historical`; `src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:58–112` | F/loops; selected trend300, mode96, KPI range500, gates100 | Range/signals/KPI/window URL; export local | No polling/live |
| [OBSERVED] `/cpm/windows`; `src/frontend-ob/src/components/Cpm/CpmWindows.tsx:55–98,454–456` | F/loops/resolutions/pipeline-metrics; selected KPI page24, raw PV5000, six comparator KPI12 reads | Profile/window; load older; comparator metric local | Metrics20s; no live |
| [OBSERVED] `/cpm/replay`; `src/frontend-ob/src/components/Cpm/CpmReplay.tsx:75–128` | F/loops/catalogue; selected history → raw and KPI range10 | Window; cursor/gate local; recompute/status | Status5s while active; no live |
| [OBSERVED] `/cpm/investigation`; `src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:99–174,234` | F/loops/rankings200; selected latest/history/events5 → trend280 | Loop/profile/mode/window; VP mapping can change measurements | Rankings/events60s; no MQTT even in “live” mode |
| [OBSERVED] `/cpm/pipeline`; `src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:47–53` | Pipeline-status/metrics, rankings200, loops | Recompute/status | Status15s, metrics20s, rankings60s; no live |
| [OBSERVED] `/cpm/governance`; `src/frontend-ob/src/components/Cpm/CpmGovernance.tsx:64–91` | Catalogue/loops; permission-dependent audit/roles/per-role permissions | Audit entity filter; verification POST | Audit30s; no live |
| [OBSERVED] `/cpm/registry`; `src/frontend-ob/src/components/Cpm/LoopRegistry.tsx:25–53,75` | F/loops | Search/selection/pagination local; authoring excluded | No polling/live |
| [OBSERVED] `/cpm/events`; `src/frontend-ob/src/components/Cpm/CpmEvents.tsx:97–114` | F/loops/events200 | Server sort; local filters/page; acknowledge/shelve invalidates events | Events30s; no live |

[OBSERVED] Child hook evidence: `src/frontend-ob/src/components/Cpm/overview/PipelinePanel.tsx:35–42`; `src/frontend-ob/src/components/Cpm/overview/LoopFocus.tsx:29–34`; `src/frontend-ob/src/components/Cpm/explorer/LoopWorkspace.tsx:47–51`; `src/frontend-ob/src/components/Cpm/explorer/SummaryTab.tsx:28–35`; `src/frontend-ob/src/components/Cpm/explorer/CalculationsTab.tsx:78–115`; `src/frontend-ob/src/components/Cpm/GateEvidencePanel.tsx:63–65`; `src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:58`; `src/frontend-ob/src/components/Cpm/windows/CompareAcrossKinds.tsx:29–44`; `src/frontend-ob/src/components/Cpm/useRoleMatrix.ts:33–51`.

## 4. Request waterfalls, duplication and caching

### 4.1 Counting assumptions

[OBSERVED] Successful cold bootstrap with no in-memory user refreshes the token then fetches the user before app readiness. A 401 can cause refresh/replay; React Query default retry is two. Evidence: `src/frontend-ob/src/store/authStore.ts:167–216`; `src/frontend-ob/src/api/authApi.ts:30–31,53–56`; `src/frontend-ob/src/api/apiFetch.ts:27–46`; `src/frontend-ob/src/App.tsx:172–194,309`.

[INFERRED] Counts below are successful logical API requests, excluding bundles/fonts/images, retries, periodic polls and WebSocket upgrades. A cold document adds two authentication requests. “Warm” means existing-SPA navigation with identical fresh query keys, not reload. Complete network counts are **not determinable from static analysis**; collect HAR initiators, responses, retries and cache states. Evidence: bootstrap and query implementations above.

[OBSERVED] A selected site adds two requests for areas/units, which can run in parallel from the selected site value. Evidence: `src/frontend-ob/src/components/Cpm/plantLocation.tsx:83–107`.

[INFERRED] S denotes 1–2 snapshot requests for a new live connection: wildcard seed plus a potentially overlapping scoped seed. Existing connection and five-second seed recency can reduce this. A new connection separately adds a WebSocket upgrade. Evidence: `src/frontend-ob/src/store/mqttStore.ts:246–254,289–311,464–515`.

| Page | Cold page API requests | With cold auth | Fresh warm navigation | Serial dependencies / panel data readiness |
|---|---:|---:|---|---|
| [INFERRED] Overview |6 without focus; 7+S with focus|8; 9+S|Usually0; seed/minute rollover may add work|Rankings → focus → trend/snapshot. Other initial reads parallel. `src/frontend-ob/src/components/Cpm/CpmOverview.tsx:29–48,96`; `src/frontend-ob/src/components/Cpm/overview/LoopFocus.tsx:29–34` |
| [INFERRED] Performance |6|8|0|Initial reads parallel. `src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:106–112`; `src/frontend-ob/src/components/Cpm/plantLocation.tsx:83–107` |
| [INFERRED] Explorer |2; selected Summary6+S|4; selected8+S|0 query reads; seed may recur|Registry → workspace; gates/readiness/events/trend then parallel. `src/frontend-ob/src/components/Cpm/CpmExplorer.tsx:42–54`; `src/frontend-ob/src/components/Cpm/explorer/LoopWorkspace.tsx:47–51`; `src/frontend-ob/src/components/Cpm/explorer/SummaryTab.tsx:28–35` |
| [INFERRED] Calculations |4; selected7|6; selected9|0|Registry → resolved selected loop → three result reads. `src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:47–68` |
| [INFERRED] Historical |2; selected6|4; selected8|0 explicit same bounds; up to4 with recreated implicit bounds|URL loop enables four data reads without waiting for registry. `src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:69–112` |
| [INFERRED] Windows |4; selected12|6; selected14|0|KPI page → window → raw; resolutions → six comparator reads. `src/frontend-ob/src/components/Cpm/CpmWindows.tsx:55–98,454–456`; `src/frontend-ob/src/components/Cpm/windows/CompareAcrossKinds.tsx:29–44` |
| [INFERRED] Replay |3; selected6|5; selected8|0|History → selected window → parallel raw/KPI. `src/frontend-ob/src/components/Cpm/CpmReplay.tsx:75–128` |
| [INFERRED] Investigation |3; selected7, possibly8|5; selected9, possibly10|0 identical keys|Verdict → trend; late VP mapping may change measurement key and trigger another trend. `src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:99–174,234` |
| [INFERRED] Pipeline |4|6|0|Four independent reads; metrics dependency chain is serial inside API. `src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:47–53`; `src/services/cplm-api/Controllers/CpmReadinessController.cs:262–388` |
| [INFERRED] Governance |2+A+B(1+R)|4+A+B(1+R)|0|A/B indicate audit/RBAC permission; roles list → R parallel permission reads. `src/frontend-ob/src/components/Cpm/CpmGovernance.tsx:64–91`; `src/frontend-ob/src/components/Cpm/useRoleMatrix.ts:33–51` |
| [INFERRED] Registry |2|4|0|List waits for backend hydration. `src/frontend-ob/src/components/Cpm/LoopRegistry.tsx:33–53`; `src/services/cplm-api/Services/CpmLoopRegistryService.cs:224–279` |
| [INFERRED] Events |3|5|0|Loops/events/filter reads parallel. `src/frontend-ob/src/components/Cpm/CpmEvents.tsx:97–114` |

[OBSERVED] Authentication readiness blocks the application shell. Page components render loading states while queries run, so populated-panel readiness is distinct from first browser paint. Evidence: `src/frontend-ob/src/App.tsx:309`; `src/frontend-ob/src/components/Cpm/CpmOverview.tsx:80–108`; `src/frontend-ob/src/components/Cpm/LoopRegistry.tsx:96–103`.

### 4.2 N+1 and duplicate-fetch checks

- [OBSERVED] Backend registry N+1 is one query plus two sequential queries per loop on the same connection. Evidence: `src/services/cplm-api/Services/CpmLoopRegistryService.cs:224–279`.
- [OBSERVED] Readiness uses up to five parallel GET `/resolve` probes, not POST `/resolve/batch`. Resolver batch exists with maximum100 requests but still invokes per-path resolution. Asset-model also has POST `/assets/by-paths`, maximum2000. Evidence: `src/services/cplm-api/Controllers/CpmReadinessController.cs:468–525`; `src/services/binding-resolver/Program.cs:71–121`; `src/services/asset-model/Program.cs:264–278`.
- [OBSERVED] The CPM matrix locally pages fetched rows and renders cells; it does not resolve each grid row. Evidence: `src/frontend-ob/src/components/Cpm/GateMatrix.tsx:70–77,192–268`.
- [OBSERVED] Windows performs six per-kind KPI reads; Governance performs one permissions query per returned role. Evidence: `src/frontend-ob/src/components/Cpm/windows/CompareAcrossKinds.tsx:29–44`; `src/frontend-ob/src/components/Cpm/useRoleMatrix.ts:36–51`.
- [OBSERVED] Performance rankings50/rankings12 use distinct keys because limit is included. Explorer latest-gates and shared History events reuse the same keys. Evidence: `src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:108–112`; `src/frontend-ob/src/hooks/useCpm.ts:13–22,114–125,157–166`; `src/frontend-ob/src/components/Cpm/explorer/LoopWorkspace.tsx:47–51`; `src/frontend-ob/src/components/Cpm/explorer/SummaryTab.tsx:28`.
- [OBSERVED] Registry selects `tags::text` but hydration rebuilds tags from `loop_tag_map`. Rankings reads full payload for observability flags; heatmap parses full payload for gate cells. Evidence: `src/services/cplm-api/Services/CpmLoopRegistryService.cs:229–279`; `src/services/cplm-api/Controllers/CpmFleetController.cs:142–196,223–261`.
- [OBSERVED] Overview requests all numeric envelope columns but does not render SP min/max/avg or OP min/max: five unused values per bucket. Evidence: `src/services/historian-bff/IoTDbClient.cs:105–122`; `src/frontend-ob/src/components/Cpm/overview/LoopFocus.tsx:74–90`.

### 4.3 Cache behaviour

[OBSERVED] The shared QueryClient has staleTime30s, retry2 and refetchOnWindowFocus=false. Installed TanStack defaults inactive browser-query GC to five minutes and hashes object keys in stable sorted order. Inline objects alone do not defeat caching. Evidence: `src/frontend-ob/src/App.tsx:172–194`; `src/frontend-ob/node_modules/@tanstack/query-core/src/removable.ts:25–29`; `src/frontend-ob/node_modules/@tanstack/query-core/src/utils.ts:232–240`.

| Query family | Staleness / recurrence | Key behaviour / evidence |
|---|---|---|
| [OBSERVED] Loops, single loop, readiness, latest gates, gate history, fleet, events, pipeline |30s default; recurrence in page table|IDs/scope/kind/options are included. `src/frontend-ob/src/hooks/useCpm.ts:13–49,84–174,223–231` |
| [OBSERVED] Trend, mode and KPI variants |60s; rolling trend creates minute keys|Times/resolution/width/measurements included. `src/frontend-ob/src/hooks/useCpm.ts:184–278`; `src/frontend-ob/src/components/Cpm/shared.tsx:74–89` |
| [OBSERVED] Catalogue/raw |5min|Raw key omits maxCount although request uses it. `src/frontend-ob/src/hooks/useCpm.ts:176–182,282–292` |
| [OBSERVED] Resolutions/registry contract |Infinity; inactive GC still applies|Stable deployment constants. `src/frontend-ob/src/hooks/useCpm.ts:36–41,259–265`; `src/frontend-ob/node_modules/@tanstack/query-core/src/removable.ts:25–29` |
| [OBSERVED] Roles/permissions |5min|Role-name keys. `src/frontend-ob/src/components/Cpm/useRoleMatrix.ts:36–51` |

[INFERRED] Raw requests differing only in maxCount can collide, but the inspected Windows and Replay calls use different measurements, so their collision is not established. Evidence: `src/frontend-ob/src/hooks/useCpm.ts:282–292`; `src/frontend-ob/src/components/Cpm/CpmWindows.tsx:98`; `src/frontend-ob/src/components/Cpm/CpmReplay.tsx:127`.

[OBSERVED] Historical recreates implicit dates when search parameters change; window/KPI/signal changes can therefore mint new range-dependent keys. Evidence: `src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:78–112`.

[OBSERVED] Gateway caches asset GETs60s, binding GETs30s, historian trend/summary10s; CPM GETs are excluded. Cache identity includes user, permissions and URL. This implementation does not establish an ETag/Cache-Control contract for browser reuse. Evidence: `src/services/gateway/Caching/ResponseCacheMiddleware.cs:45–54,88–108,129–178,207–216`.

## 5. Per-source data volume

### 5.1 IoTDB queries, transport and payloads

[OBSERVED] Historian uses REST v2 at8181 through a factory-managed typed HttpClient. It serialises SQL JSON and parses response JSON. No IoTDB session-API read or session pool is used by this client. Evidence: `src/services/historian-bff/Program.cs:14–16`; `src/services/historian-bff/IoTDbClient.cs:14–66`.

[INFERRED] A fresh TCP connection per query cannot be inferred from REST use: managed HTTP handlers can reuse connections. Connection setup frequency/cost is **not determinable from static analysis**; inspect connection traces and handler metrics at the cited client.

| Surface | SQL/operation | Bounds and fan-out |
|---|---|---|
| [OBSERVED] `/trend` |Numeric min/max/avg/last; mode last; time GROUP BY|Concrete device, valid range, width10–2000; no measurement-count cap or independent LIMIT. `src/services/historian-bff/Program.cs:88–122`; `src/services/historian-bff/IoTDbClient.cs:73–123` |
| [OBSERVED] `/raw` |Selected measurements WHERE time range ORDER BY time DESC LIMIT/OFFSET|Handler clamps requested maxCount1–500; offset has no upper bound. These are required scalar parameters, not a demonstrated500 default. `src/services/historian-bff/Program.cs:126–160`; `src/services/historian-bff/IoTDbClient.cs:139–154` |
| [OBSERVED] `/raw/cursor` |Time ASC; lower bound advanced beyond cursor; LIMIT|Nonpositive supplied maxCount normalizes to1000; default configured ceiling9999. CPM calls this route. `src/services/historian-bff/Program.cs:167–208`; `src/services/historian-bff/IoTDbClient.cs:33–34,165–183`; `src/frontend-ob/src/api/cpmApi.ts:560–575` |
| [OBSERVED] `/summary` |min/max/avg/sum/count over bounded time|Fixed aggregate output; scan depends on range; not in CPM hooks. `src/services/historian-bff/Program.cs:213–250`; `src/services/historian-bff/IoTDbClient.cs:129–136`; `src/frontend-ob/src/hooks/useCpm.ts:184–292` |
| [OBSERVED] `/series` |SHOW TIMESERIES path|Wildcard allowed, no LIMIT, IoTDB JSON returned; not normal CPM mount. `src/services/historian-bff/Program.cs:350–370` |
| [OBSERVED] `/snapshot` |Redis only|No IoTDB query. `src/services/historian-bff/Program.cs:266–346` |
| [OBSERVED] Warm-up |SELECT count(*) FROM root.** GROUP BY five-minute range|Global measurement fan-out; every60s; standing background cost. `src/services/historian-bff/IoTDbWarmupService.cs:22–40` |
| [OBSERVED] Health |SHOW VERSION|Metadata. `src/services/historian-bff/Program.cs:45–56` |
| [OBSERVED] CPLM IoTDB client |REST v2 nonQuery|Writer, not a CPM GET historian client. `src/services/cplm-api/Services/IotDbWriteClient.cs:110–139`; `src/services/cplm-api/Controllers/CpmAnalyticsController.cs:121–275` |

[OBSERVED] CPM uses constant widths240/280/300/96 rather than measuring the chart container. Evidence: `src/frontend-ob/src/components/Cpm/overview/LoopFocus.tsx:31`; `src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:174`; `src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:109–110`.

[INFERRED] With duration Δ milliseconds and clamped width W, interval = max(1,floor(Δ/W)); potential buckets = ceil(Δ/interval). Thus the source comment “always ≤ width” is not exact: arithmetic example Δ479ms/W240 yields479 one-millisecond buckets. Width is still bounded, and bucket count does not grow indefinitely with duration at fixed measurement count. Source scan work does grow with the requested historical data. Evidence: `src/services/historian-bff/IoTDbClient.cs:86–122`.

[INFERRED] Offset scans can require skipping preceding matches, whereas CPM's cursor bounds avoid expressing that work. Actual IoTDB scan complexity and pages examined are **not determinable from static analysis**; compare query traces at increasing offsets and equivalent cursor positions. Evidence: `src/services/historian-bff/IoTDbClient.cs:139–183`; `src/frontend-ob/src/api/cpmApi.ts:560–575`.

[OBSERVED] The response mapper converts columnar JSON to per-point dictionaries and keeps named missing cells. Evidence: `src/services/historian-bff/IoTDbClient.cs:195–229,247–253`.

[INFERRED] For compact JSON, timestamp digit length d_i, ASCII key length k_j, serialized value bytes v_ij (including quotes/escaping), P points and envelope E excluding the points array:

```text
rowBytes(i) = 7 + d_i + sum_j(k_j + 4 + v_ij)
responseBytes = E + 2 + max(P - 1, 0) + sum_i(rowBytes(i))
```

[INFERRED] These formulas describe the actual dictionary serialization shape, not measured byte sizes. For nonempty arrays and13-digit timestamps:

| Visual | Conditional byte formula | Evidence |
|---|---|---|
| [INFERRED] Three-signal envelope,12 numeric fields, average serialized value length v |E+1+P(129+12v); at240 points: E+30,961+2,880v|`src/services/historian-bff/IoTDbClient.cs:105–122,219–227`; `src/frontend-ob/src/components/Cpm/overview/LoopFocus.tsx:29–31` |
| [INFERRED] Windows PV raw |E+1+P(27+v); at5000 points: E+135,001+5000v|`src/frontend-ob/src/components/Cpm/CpmWindows.tsx:98`; `src/services/historian-bff/IoTDbClient.cs:219–227` |
| [INFERRED] Replay PV/SP/OP raw |E+1+P(39+vPV+vSP+vOP); at9999 points: E+389,962+9999(vPV+vSP+vOP)|`src/frontend-ob/src/components/Cpm/CpmReplay.tsx:127`; `src/services/historian-bff/IoTDbClient.cs:33–34,219–227` |

[INFERRED] Actual point counts, value lengths, escaping and compressed bytes are **not determinable from static analysis**. Capture bodies, encodedBodySize/decodedBodySize, Content-Encoding and headers. No universal byte-budget benchmark is asserted.

### 5.2 Postgres query and index inventory

[OBSERVED] CPM reads use Dapper/Npgsql. A LIMIT bounds output, not necessarily examined rows. Evidence: `src/services/cplm-api/Controllers/CpmAnalyticsController.cs:126–165,198–259`; `src/services/cplm-api/Services/CpmLoopRegistryService.cs:224–279`.

| Query | Tables / predicates / joins | ORDER BY / LIMIT | Evidence |
|---|---|---|---|
| [OBSERVED] Registry list |cpm.loop_registry, no filter|loop_id; no LIMIT|`src/services/cplm-api/Services/CpmLoopRegistryService.cs:224–237` |
| [OBSERVED] Registry one |Exact unique loop_id|No SQL LIMIT; unique parent|`src/services/cplm-api/Services/CpmLoopRegistryService.cs:240–250` |
| [OBSERVED] Hydrate tags |loop_tag_map, loop_id and active|No ordering/LIMIT|`src/services/cplm-api/Services/CpmLoopRegistryService.cs:256–259` |
| [OBSERVED] Hydrate links |loop_link forward UNION reverse PEER|UNION dedup; no LIMIT|`src/services/cplm-api/Services/CpmLoopRegistryService.cs:261–267` |
| [OBSERVED] Referencing |Registry LEFT JOIN active tags; scope OR uns_path equality/prefix|COUNT DISTINCT; no input cap|`src/services/cplm-api/Services/CpmLoopRegistryService.cs:1527–1551` |
| [OBSERVED] Latest gate |Gate results, lower(loop_id), window_kind|Real-verdict expression, end DESC NULLS LAST, created DESC; LIMIT1|`src/services/cplm-api/Controllers/CpmAnalyticsController.cs:127–134` |
| [OBSERVED] Gate history |Same; optional end bounds; insufficient-data filter|end DESC/created DESC; cap500|`src/services/cplm-api/Controllers/CpmAnalyticsController.cs:155–165` |
| [OBSERVED] Short KPI |Short features, lower loop, kind, optional range and before|end DESC NULLS LAST; cap500|`src/services/cplm-api/Controllers/CpmAnalyticsController.cs:228–255` |
| [OBSERVED] Long KPI |Long features, equivalent predicates|Same|`src/services/cplm-api/Controllers/CpmAnalyticsController.cs:198–225` |
| [OBSERVED] Fleet registry counts |Registry optional site/area/unit; JSON filters for counts|Aggregates; no input LIMIT|`src/services/cplm-api/Controllers/CpmFleetController.cs:46–55` |
| [OBSERVED] Fleet diagnosis counts |Gates JOIN registry lower-loop; kind, real verdict, scope|DISTINCT ON loop/end/created then diagnosis grouping; no time bound|`src/services/cplm-api/Controllers/CpmFleetController.cs:58–72` |
| [OBSERVED] Rankings |Latest gate CTE LEFT JOIN registry; scope/monitoring|Verdict/ranking expression/loop; outer cap200|`src/services/cplm-api/Controllers/CpmFleetController.cs:124–171` |
| [OBSERVED] Heatmap |Latest gate CTE LEFT JOIN registry; scope/monitoring|Registry loop; outer cap300|`src/services/cplm-api/Controllers/CpmFleetController.cs:223–243` |
| [OBSERVED] Events |Event frames; optional lower loop/from/open/shelving conditions|Recent opened DESC,id DESC; triage open-expression/confidence/opened; cap500|`src/services/cplm-api/Controllers/CpmEventsController.cs:62–89` |
| [OBSERVED] Catalogue gates |Gate JSON exists predicate; jsonb_object_keys|Inner cap2000 generated keys; outer DISTINCT|`src/services/cplm-api/Controllers/CpmEventsController.cs:161–168` |
| [OBSERVED] Catalogue versions |Gate JSON key-existence OR|created DESC LIMIT1|`src/services/cplm-api/Controllers/CpmEventsController.cs:174–180` |
| [OBSERVED] Readiness registry |Unique lower(loop_id)|No SQL LIMIT|`src/services/cplm-api/Controllers/CpmReadinessController.cs:94–98` |
| [OBSERVED] Readiness links |Forward link OR reverse PEER|COUNT|`src/services/cplm-api/Controllers/CpmReadinessController.cs:162–165` |
| [OBSERVED] Readiness evidence |Three scalar counts: short/long/gates; lower loop; real verdict|No time restriction/input cap|`src/services/cplm-api/Controllers/CpmReadinessController.cs:179–185` |
| [OBSERVED] Replay status |Gate payload->>'replay_id' equality|COUNT; no time predicate|`src/services/cplm-api/Services/CplmRecomputeService.cs:155–163` |

[OBSERVED] Declared index support and gaps:

- Registry has loop primary key, unique lower-loop, asset, site and enabled-expression indexes. Tag map has loop-leading primary key and loop index. Links have both direction indexes. No area/unit or standalone uns_path index is declared there. Evidence: `database/scripts/32_cpm_loop_registry.sql:19,50–81,151–156`.
- Gate/short/long tables have lower-loop expression indexes and raw-loop/kind/end composites. These are not one combined lower-loop/kind/end index and do not match the full real-verdict ordering expression. Evidence: `database/scripts/30_cplm_analytics_schema.sql:70–77,114–121,159–166`.
- Those declarations contain no payload GIN, replay-ID expression or full global ranking-expression indexes. Version discovery also lacks a matching global created-time/payload predicate index. Evidence: `database/scripts/30_cplm_analytics_schema.sql:70–77,114–121,159–166`; `src/services/cplm-api/Controllers/CpmEventsController.cs:174–180`.
- Event frames have raw-loop/time, partial-open and later lower-loop/lower-loop-opened indexes. No complete triage order, global recent order including id, or shelving-time index is declared in those scripts. Evidence: `database/scripts/34_cplm_event_frames.sql:57–64`; `database/scripts/42_cplm_event_frames_indexes.sql:25–30`; `src/services/cplm-api/Controllers/CpmEventsController.cs:62–89`.
- Referencing uses COALESCE(area,'') and OR-connected path/scope predicates. Evidence: `src/services/cplm-api/Services/CpmLoopRegistryService.cs:1527–1541`.

[INFERRED] Do not call every lower-loop predicate non-sargable: matching functional indexes exist. Optional-parameter ORs and expression sorts need real query plans to establish selectivity and scan/sort work. Declared-index gaps do not prove sequential scans. Evidence: query/index inventory immediately above.

[OBSERVED] Script39 converts gate/short/long results to window_end hypertables with seven-day chunks, compression after30 days and retention policies. Event frames remain a conventional lifecycle table. Latest-result views are ordinary views, not continuous aggregates. Evidence: `database/scripts/39_timescale_policies.sql:123–172`; `database/scripts/34_cplm_event_frames.sql:19–64`; `database/scripts/30_cplm_analytics_schema.sql:83–89,129–134,169–172`.

[INFERRED] Time-bounded history/KPIs can permit chunk exclusion. Fleet latest, catalogue, readiness and replay-ID counts lack partition-time restrictions. They recompute selection/count work per uncached request while reusing stored Flink feature results. Evidence: `src/services/cplm-api/Controllers/CpmAnalyticsController.cs:155–255`; `src/services/cplm-api/Controllers/CpmFleetController.cs:58–72,142–171`; `src/services/cplm-api/Controllers/CpmReadinessController.cs:179–185`.

[OBSERVED] Script42 ends with literal `</content>` and `</invoke>` after CREATE INDEX statements. Evidence: `database/scripts/42_cplm_event_frames_indexes.sql:25–32`.

[INFERRED] The complete script is invalid SQL. Whether the preceding indexes committed or later initialization continued is **not determinable from static analysis**; inspect initialization logs, migration execution mode and pg_indexes before concluding indexes are absent.

[OBSERVED] CPLM uses a singleton NpgsqlDataSource; its supplied connection configuration does not explicitly set maximum pool size. Readiness keeps a DB connection open while awaiting binding/Flink. The cited Dapper calls do not pass cancellation through CommandDefinition although connection opening uses cancellation. Evidence: `src/services/cplm-api/Program.cs:20–29`; `infra/docker/docker-compose.yml:1355`; `src/services/cplm-api/Controllers/CpmReadinessController.cs:92–194`; `src/services/cplm-api/Services/CpmLoopRegistryService.cs:224–267`.

[INFERRED] Pool demand depends on arrival rate multiplied by connection-hold time. Effective pool settings, waiting requests and expected concurrency are **not determinable from static analysis**; measure pool busy/idle/waiters and acquisition/hold duration.

[OBSERVED] Asset-model by-path materializes a tracked EF entity; its context has no global no-tracking setting. Location projections select path/name; child filters first query the parent then children. The inspected read implementations do not show lazy loading. Evidence: `src/services/asset-model/Program.cs:183–187,619–646,1037–1052`; `src/services/asset-model/Data/AssetDbContext.cs:15–48`. Contextual-path, parent and type indexes are declared in `src/services/asset-model/Data/AssetDbContext.cs:46–48`.

### 5.3 Redis contract and work

| Read pattern | Writer / TTL | Read-path work |
|---|---|---|
| [OBSERVED] snapshot:devices |Sparkplug SADD; no expiry|Wildcard SMEMBERS and full sort before pagination. `src/services/sparkplug-edge-node/src/main/java/com/ams/sparkplug/AlarmMetricPublisher.java:461–475`; `src/services/historian-bff/Program.cs:295–307` |
| [OBSERVED] snapshot:index:{device} |Sparkplug SADD; no expiry|One SMEMBERS per device. `src/services/sparkplug-edge-node/src/main/java/com/ams/sparkplug/AlarmMetricPublisher.java:470–471`; `src/services/historian-bff/Program.cs:310–313` |
| [OBSERVED] snapshot:metric:{group}:{edge}:{device}:{metric} |Sparkplug SETEX; configured3600s|One MGET per device, value parsing, lazy stale-index cleanup. `src/services/sparkplug-edge-node/src/main/java/com/ams/sparkplug/AlarmMetricPublisher.java:461–475`; `infra/docker/docker-compose.yml:846–849`; `src/services/historian-bff/Program.cs:313–339` |

[OBSERVED] Snapshot code uses neither KEYS nor SCAN. It already uses MGET across metrics, but awaits each device's SMEMBERS/MGET serially. Default device cap500, maximum2000; metric count within a device is uncapped. Response memory cache lasts2s and is scoped by query/site. Frontend wildcard loading fetches one page. Evidence: `src/services/historian-bff/Program.cs:283–344`; `src/frontend-ob/src/store/mqttStore.ts:499–515`.

[INFERRED] An uncached wildcard read uses approximately1+2D Redis commands, excluding stale cleanup. Noeviction saturation can reject writes; this is not volatile-lru snapshot eviction. Persistent device names can remain after metric expiry. Measure command latency, set cardinality, stale ratio, memory and rejected writes. Evidence: `src/services/historian-bff/Program.cs:295–339`; `infra/docker/docker-compose.yml:152–176`.

[OBSERVED] RBE emits changed values only; loop snapshot writes follow those records. Overview renders missing live values as absent. Explorer explicitly falls back to its stored trend bucket for PV/SP/OP/mode and labels source. Evidence: `src/flink/src/main/java/com/ams/flink/cplm/LoopLiveRbeJob.java:186–223`; `src/services/sparkplug-edge-node/src/main/java/com/ams/sparkplug/AlarmMetricPublisher.java:341–382`; `src/frontend-ob/src/components/Cpm/overview/LoopFocus.tsx:34–37,103–106`; `src/frontend-ob/src/components/Cpm/explorer/SummaryTab.tsx:110–163`.

[INFERRED] An unchanged metric can outlive its snapshot TTL without renewal on this inspected path. Neither UI fallback recreates the Redis snapshot. Actual reopen behaviour after one hour is **not determinable from static analysis**; observe TTL expiry, RBE output, reconnect/birth messages and both faceplates. Evidence: snapshot writer/RBE/UI implementations above.

### 5.4 Cross-service calls, client reuse and auth

| Request | Dependency calls | Reuse / evidence |
|---|---|---|
| [OBSERVED] Ordinary registry/results |Zero service-to-service HTTP; SQL as listed|Shared data source. `src/services/cplm-api/Services/CpmLoopRegistryService.cs:224–279`; `src/services/cplm-api/Controllers/CpmAnalyticsController.cs:126–165` |
| [OBSERVED] Readiness |Up to5 parallel resolver GETs → up to5 asset GETs, plus0/1 Flink overview|Role/resolver clients5s; job states cached5s. `src/services/cplm-api/Controllers/CpmReadinessController.cs:417–525`; `src/services/binding-resolver/Program.cs:20–30` |
| [OBSERVED] Resolver single/batch |One asset by-path call per resolution, before fallback|Factory-managed client; no path-result cache in resolver implementation. Batch still resolves each path. `src/services/binding-resolver/Services/PathResolver.cs:33–59,77–102`; `src/services/binding-resolver/Program.cs:97–121` |
| [OBSERVED] Pipeline status |0/1 overview|5s cache; no single-flight shown. `src/services/cplm-api/Controllers/CpmReadinessController.cs:417–455` |
| [INFERRED] Pipeline metrics |Successful full traversal1+2J+V calls|J≤10 required names; V matching window vertices; serial,10s HttpClient timeout. `src/services/cplm-api/Controllers/CpmReadinessController.cs:251–388` |
| [OBSERVED] Replay status |Flink job read then PG count|Sequential. `src/services/cplm-api/Services/CplmRecomputeService.cs:126–172` |
| [OBSERVED] Historian |One IoTDB REST call per data query|Typed HttpClient, standard resilience. `src/services/historian-bff/Program.cs:14–16`; `src/services/historian-bff/IoTDbClient.cs:37–66` |

[OBSERVED] JWT signature, issuer, audience and lifetime validation is at gateway. JWKS refresh occurs for empty/unknown-kid cache, with30s minimum refresh interval; existing known keys have no periodic expiry in that cache. A miss synchronously waits on refresh. Revocation is cached and polled every5s. Evidence: `src/services/gateway/Program.cs:62–78,234–255`; `src/services/gateway/Auth/JwksKeyCache.cs:18–59`; `src/services/gateway/Auth/RevocationCache.cs:37–44,60–89`.

[OBSERVED] Shared downstream authentication checks the service key and builds claims from X-Auth headers, rather than fetching JWKS or validating the same JWT signature at every hop. Evidence: `src/services/_shared/TraverseAuth.cs:89–135,161–174`; `src/services/cplm-api/Program.cs:127,156`.

[OBSERVED] Allowed gateway requests normally make two sequential Redis rate-limit increments; a new counter also receives expiry. This runs before response caching. Evidence: `src/services/gateway/Program.cs:265–325`; `src/services/gateway/RateLimit/RedisRateLimiter.cs:58–82`.

[INFERRED] Frontend retries, token replay and outbound resilience can amplify failure traffic. Exact attempt counts/latency ceilings are **not determinable from the inspected configuration alone**; trace logical requests, attempt numbers, cancellations and timeouts. Evidence: `src/frontend-ob/src/api/apiFetch.ts:27–46`; `src/frontend-ob/src/App.tsx:172–194`; `src/services/cplm-api/Program.cs:39–55`; `src/services/binding-resolver/Program.cs:18–24`.

## 6. Cost model and benchmarks

### 6.1 Benchmarks used

[OBSERVED — benchmark] Web Vitals guidance: navigation TTFB≤0.8s is a rough good target, LCP≤2.5s and INP≤200ms at the75th percentile. TTFB is not a Core Web Vital. Sources: [TTFB](https://web.dev/articles/ttfb), [LCP](https://web.dev/articles/lcp), [INP](https://web.dev/articles/inp).

[INFERRED — benchmark application] Measure operator call-up as navigation-to-required-data-visible, loop-selection-to-visible-update and source-event-to-paint. Neither document TTFB nor an API duration alone proves acceptable HMI behaviour. No numeric ISA-101 call-up threshold is established here; obtain the plant's HMI acceptance targets. Source: [ISA-101 standards](https://www.isa.org/standards-and-publications/isa-standards/isa-101-standards). Implementation evidence: `src/frontend-ob/src/App.tsx:309`; `src/frontend-ob/src/hooks/useLoopLive.ts:54–68`.

[INFERRED — benchmark application] Assess time behaviour/resource utilisation/capacity against [ISO/IEC25010](https://www.iso.org/standard/78176.html), latency/traffic/errors/saturation against [Google SRE golden signals](https://sre.google/sre-book/monitoring-distributed-systems/), services with [RED](https://grafana.com/files/grafanacon_eu_2018/Tom_Wilkie_GrafanaCon_EU_2018.pdf), and resources with [USE](https://www.brendangregg.com/usemethod.html). These do not provide a universal JSON byte cap or establish a measured SLA breach from source.

### 6.2 Endpoint cost units

[INFERRED] Let B_e be actual uncompressed response bytes, L registry loops, G qualifying history rows, P points, C columns and D snapshot devices. Multiply endpoint units below by actual request frequencies. For1000 identical calls, multiply by1000. No millisecond or currency estimate is embedded in these symbols.

| Endpoint family | Transfer | Compute | Infrastructure / evidence |
|---|---|---|---|
| [INFERRED] /loops |B_loops, unbounded DTO collection|1+2L SQL commands; hydration/JSON|CPLM/PG/browser. `src/services/cplm-api/Services/CpmLoopRegistryService.cs:224–279` |
| [INFERRED] /loops/{id} |One parent with uncapped children|Up to3 SQL commands|CPLM/PG. `src/services/cplm-api/Services/CpmLoopRegistryService.cs:240–279` |
| [INFERRED] /loops/referencing |Count object|Join/filter/distinct|CPLM/PG. `src/services/cplm-api/Services/CpmLoopRegistryService.cs:1527–1551` |
| [INFERRED] Gates latest/history |1/≤500 matrices|One query; payload parse/build per row|CPLM/PG/browser. `src/services/cplm-api/Controllers/CpmAnalyticsController.cs:121–169,324–383` |
| [INFERRED] KPIs |≤500 feature rows|One query/materialization/JSON|CPLM/PG/browser. `src/services/cplm-api/Controllers/CpmAnalyticsController.cs:198–275` |
| [INFERRED] Fleet summary |Counts|2 queries; latest history selection|CPLM/PG. `src/services/cplm-api/Controllers/CpmFleetController.cs:46–72` |
| [INFERRED] Rankings/heatmap |≤200/≤300 rows|Latest selection across G, join/sort/JSON extraction|CPLM/PG/browser. `src/services/cplm-api/Controllers/CpmFleetController.cs:142–196,223–261` |
| [INFERRED] Events |≤500 objects|Filtered/sorted query|CPLM/PG/browser. `src/services/cplm-api/Controllers/CpmEventsController.cs:62–94` |
| [INFERRED] Calculations |Catalogue/versions|2 queries; JSON key extraction/distinct|CPLM/PG. `src/services/cplm-api/Controllers/CpmEventsController.cs:161–180` |
| [INFERRED] Readiness |Fixed checks/counts|3 DB commands, ≤10 resolver/asset calls,0/1 Flink|CPLM/resolver/asset/PG/Flink. `src/services/cplm-api/Controllers/CpmReadinessController.cs:94–194,468–525` |
| [INFERRED] Pipeline status |Required/unexpected jobs|Cached or overview parse|CPLM/Flink. `src/services/cplm-api/Controllers/CpmReadinessController.cs:219–243,417–455` |
| [INFERRED] Pipeline metrics |≤10 job summaries|1+2J+V HTTP calls/JSON parses|CPLM/Flink JobManager. `src/services/cplm-api/Controllers/CpmReadinessController.cs:262–388` |
| [INFERRED] Replay status |Status object|Flink read + historical JSON-predicate count|CPLM/Flink/PG. `src/services/cplm-api/Services/CplmRecomputeService.cs:126–172` |
| [INFERRED] Resolutions/registry contract |Constants|Object creation/JSON|CPLM. `src/services/cplm-api/Controllers/CpmAnalyticsController.cs:284–314`; `src/services/cplm-api/Controllers/CpmLoopsController.cs:264–278` |
| [INFERRED] Historian trend |Section5 point formula|Range aggregation; JSON parse → column lists → dictionaries → JSON|IoTDB/BFF/browser. `src/services/historian-bff/IoTDbClient.cs:92–123,195–229` |
| [INFERRED] Raw/cursor |O(P×C) response|Raw query; OFFSET only on legacy route; mapping|IoTDB/BFF/browser. `src/services/historian-bff/IoTDbClient.cs:139–229` |
| [INFERRED] Summary |Fixed aggregate object|Five aggregates/result extraction|IoTDB/BFF. `src/services/historian-bff/Program.cs:213–250` |
| [INFERRED] Series |Unbounded metadata|JSON parse/re-serialize without useful projection|IoTDB/BFF. `src/services/historian-bff/Program.cs:350–370` |
| [INFERRED] Snapshot |Selected metric payloads|Cache miss: wildcard index +2D commands +parsing|Contract Redis/BFF/browser. `src/services/historian-bff/Program.cs:283–344` |
| [INFERRED] Asset filters/resolution |Path/name or asset/binding DTO|Site query; parent→children queries; one asset lookup per resolution|Asset DB/services. `src/services/asset-model/Program.cs:183–187,619–646,1037–1052`; `src/services/binding-resolver/Services/PathResolver.cs:77–102` |

[OBSERVED] Gateway response caching buffers/copies the body and converts it to a string; it does not parse it as JSON. Historian points/snapshots undergo actual transformation; series is the clearer parse/re-serialize pass-through. Evidence: `src/services/gateway/Caching/ResponseCacheMiddleware.cs:129–178`; `src/services/historian-bff/IoTDbClient.cs:195–229`; `src/services/historian-bff/Program.cs:350–370`.

[INFERRED] Uncached API traffic traverses three HTTP legs: browser→nginx→gateway→service. A gateway cache hit avoids the last leg but retains auth/rate checks. Store commands/dependency calls add round trips. Actual RTT/TCP setup is **not determinable from static analysis**; capture traces. Evidence: `src/frontend-ob/nginx.conf:28–35`; `src/services/gateway/Program.cs:265–327`; `src/services/gateway/Caching/ResponseCacheMiddleware.cs:129–139`.

### 6.3 Per-page and per-1000-view model

[INFERRED] For page p and foreground dwell t:

```text
API transfer(p,t) = sum_e(requestCount(p,e,t) * B_e)
backendWork(p,t) = sum_e(requestCount(p,e,t) * missProbability(p,e) * work_e)
1000-view cost(p,t) = 1000 * cost(p,t)
```

[INFERRED] Initial multiplicities and periodic additions are supplied per page in Sections3.2/4.1; combine them with Section6.2 to obtain each page's transfer, compute and infrastructure allocation. This includes0 periodic reads for Registry/Historical, conditional recompute status for Replay, and permission-conditional audit/RBAC for Governance. Polling activity under visibility changes, cache miss probabilities and user dwell are **not determinable from static analysis**; measure them at the hook call sites. Evidence: `src/frontend-ob/src/hooks/useCpm.ts:84–94,137–174,294–314`; `src/frontend-ob/src/components/Cpm/shared.tsx:74–89`; `src/frontend-ob/src/components/Cpm/useRoleMatrix.ts:33–51`.

[INFERRED] Code-supported operation arithmetic:

- 1000 registry calls →1000+2000L SQL commands, excluding one-time schema initialization. Evidence: `src/services/cplm-api/Services/CpmLoopRegistryService.cs:224–279,1799–1882`.
- 1000 pipeline-metrics calls →1000(1+2J+V) Flink requests on a successful full traversal. Evidence: `src/services/cplm-api/Controllers/CpmReadinessController.cs:262–388`.
- 1000 uncached wildcard snapshots →approximately1000(1+2D) Redis commands plus stale cleanup. Evidence: `src/services/historian-bff/Program.cs:295–339`.
- 1000 successful gateway requests →normally2000 rate-limit increments, plus expiry commands for new counters. Evidence: `src/services/gateway/Program.cs:301–305`; `src/services/gateway/RateLimit/RedisRateLimiter.cs:79–82`.

### 6.4 Infrastructure and compression

| Component | [OBSERVED] Configuration / evidence | [INFERRED] Attribution limit |
|---|---|---|
| nginx |Listener80; API upstream HTTP1.1; no gzip/Brotli/proxy-cache/HTTP2/upstream keepalive pool declared; buffering not explicit. `src/frontend-ob/nginx.conf:13–69` |Effective inherited compression/buffering requires nginx -T and headers; do not assign a guessed ratio. |
| Postgres |Shared Timescale/Postgres service; no CPU/memory cap in block. `infra/docker/docker-compose.yml:42–68` |Separate logical DBs still compete for host resources. |
| IoTDB |REST8181;3G heap/1G direct-memory startup settings; no container cap in block. `infra/docker/docker-compose.yml:74–110`; `infra/docker/iotdb/datanode-env.sh:228–230,276–278` |JVM settings are not measured use or total process cap. |
| Cache Redis |512MB volatile-lru. `infra/docker/docker-compose.yml:119–144` |Cache eviction increases backend work. |
| Contract Redis |256MB noeviction. `infra/docker/docker-compose.yml:152–176` |Saturation can reject snapshot writes. |
| Flink |JM1024m; TM2048m,16 slots. `infra/docker/docker-compose.yml:509–611` |Diagnostics load JobManager; slots are not REST concurrency. Standing compute requires separate allocation. |
| BFF/resolver/asset/CPLM |No per-service CPU/memory caps in examined blocks. `infra/docker/docker-compose.yml:858–940,1100–1139,1342–1399` |No defensible service saturation ceiling supplied. |

[INFERRED] First saturation is **not determinable from static analysis**. Registry-heavy traffic could constrain PG round trips/pool occupancy; pipeline dwell JobManager; long-range reads IoTDB; Replay interactions browser CPU. Run a measured workload mix with simultaneous RED/USE/RUM instrumentation to establish ordering. Evidence: endpoint work and allocations above.

[INFERRED — FinOps application] Allocate exclusive service resources directly and shared PG/IoTDB/Redis/Flink using measured CPU/I/O, stored bytes, command work and standing capacity. Cost per1000 views requires rates, utilisation, page mix, dwell/cache hit rates and a marginal-versus-standing policy. Source: [FinOps allocation](https://framework.finops.org/framework/capabilities/allocation/). Configuration evidence: `infra/docker/docker-compose.yml:42–176,509–611`.

### 6.5 Top ten cost drivers by exposure

[INFERRED] Actual frequency×unit-cost ranking is **not determinable from static analysis**. This provisional order prioritizes broad mount exposure and recurring work over rare interactions; it is not a measured cost ranking. Validate against page/endpoint frequencies before implementation prioritisation.

| Rank | Driver | Frequency × unit-work basis / evidence |
|---:|---|---|
|1|[INFERRED] Full registry hydration|Registry cache misses across ten page types ×(1+2L). `src/services/cplm-api/Services/CpmLoopRegistryService.cs:224–279`; page inventory in Section3.2 |
|2|[INFERRED] Fleet latest-history work|Four page types' mounts/60s polls ×history selection/join/sort. `src/services/cplm-api/Controllers/CpmFleetController.cs:58–72,142–171,223–243`; `src/frontend-ob/src/hooks/useCpm.ts:137–174` |
|3|[INFERRED] Pipeline diagnostics|Windows/Pipeline mounts/20s polls ×(1+2J+V). `src/services/cplm-api/Controllers/CpmReadinessController.cs:262–388`; `src/frontend-ob/src/hooks/useCpm.ts:294–300` |
|4|[INFERRED] Edge Redis rate checks|All successful requests ×two increments. `src/services/gateway/Program.cs:301–325`; `src/services/gateway/RateLimit/RedisRateLimiter.cs:79–82` |
|5|[INFERRED] Broad snapshot bootstrap|New/reconnected live sessions ×index read/serial devices. `src/frontend-ob/src/store/mqttStore.ts:300–311,499–515`; `src/services/historian-bff/Program.cs:295–339` |
|6|[INFERRED] Recurring historian envelopes|Open Overview/Explorer minutes +history interactions ×range scan and P×C mapping. `src/frontend-ob/src/components/Cpm/shared.tsx:74–89`; `src/services/historian-bff/IoTDbClient.cs:92–123,195–229` |
|7|[INFERRED] Readiness fan-out/counts|Selected Explorer loop misses ×role probes/asset queries/history counts. `src/services/cplm-api/Controllers/CpmReadinessController.cs:162–194,468–525` |
|8|[INFERRED] Window density/comparator|Window visits/selections ×5000-point cap +six KPI reads. `src/frontend-ob/src/components/Cpm/CpmWindows.tsx:94–129,454–456`; `src/frontend-ob/src/components/Cpm/windows/CompareAcrossKinds.tsx:29–44` |
|9|[INFERRED] Replay raw arrays|Replay visits ×raw transfer; cursor interactions ×whole-array mapping. `src/frontend-ob/src/components/Cpm/CpmReplay.tsx:117–172` |
|10|[INFERRED] Avoidable query overlap/key changes|Historical URL interactions and Performance polls ×repeated queries. `src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:85–112`; `src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:108–112` |

## 7. Existing optimisation verification

| Measure | Status | Evidence and qualification |
|---|---|---|
| [OBSERVED] Live RBE |PRESENT-AND-EFFECTIVE on selected-loop live path|Changed records reach Sparkplug/useLoopLive; reduction ratio requires measurement. `src/flink/src/main/java/com/ams/flink/cplm/LoopLiveRbeJob.java:186–223`; `src/services/sparkplug-edge-node/src/main/java/com/ams/sparkplug/AlarmMetricPublisher.java:341–382`; `src/frontend-ob/src/components/Cpm/overview/LoopFocus.tsx:29–34` |
| [OBSERVED] Snapshot paint-on-open |PRESENT-AND-EFFECTIVE when keys exist|Broad seeding/TTL gaps remain; Explorer stored-value fallback exists. `src/frontend-ob/src/store/mqttStore.ts:464–515`; `src/frontend-ob/src/components/Cpm/explorer/SummaryTab.tsx:110–163` |
| [OBSERVED] Historian decimation |PRESENT-AND-EFFECTIVE for width-bounded output|Width clamp works; measurement/range work remains; rounding caveat. `src/services/historian-bff/Program.cs:114–118`; `src/services/historian-bff/IoTDbClient.cs:81–123` |
| [OBSERVED] React Query |PRESENT-AND-EFFECTIVE generally|Focus refetch disabled; stable keys; specific implicit-date/raw-key gaps. `src/frontend-ob/src/App.tsx:172–194`; `src/frontend-ob/src/hooks/useCpm.ts:184–292` |
| [OBSERVED] AG Grid virtualisation/transactions |ABSENT on inspected CPM grids|Local25-row slices/native tables; fetched data remains in memory. `src/frontend-ob/src/components/Cpm/LoopRegistry.tsx:48–53,105–130`; `src/frontend-ob/src/components/Cpm/GateMatrix.tsx:33,70–77,192–268` |
| [OBSERVED] ECharts reduction |PRESENT-AND-EFFECTIVE for trends; ABSENT for Replay raw arrays|Decimated responses versus full raw mapping/cursor arrays. `src/frontend-ob/src/components/Cpm/overview/LoopFocus.tsx:31–90`; `src/frontend-ob/src/components/Cpm/CpmReplay.tsx:127–172` |
| [OBSERVED] MQTT DDATA scope |PRESENT-AND-EFFECTIVE|Exact device topics and cleanup; birth wildcards remain; snapshot bootstrap broad. `src/frontend-ob/src/hooks/useLoopLive.ts:54–58`; `src/frontend-ob/src/store/mqttStore.ts:300–311,393–440` |
| [OBSERVED] nginx compression |ABSENT from supplied config|No JSON compression directive; inherited behaviour requires deployment inspection. `src/frontend-ob/nginx.conf:13–69` |
| [OBSERVED] nginx upstream keepalive / HTTP2 |ABSENT from supplied config|HTTP1.1 explicit, pool/HTTP2 listener absent. `src/frontend-ob/nginx.conf:13–58` |
| [OBSERVED] nginx buffering optimisation |No explicit setting to verify|Effective inherited behaviour not determinable from file alone. `src/frontend-ob/nginx.conf:28–58` |

## 8. Findings, enhancements and refinements

### 8.1 Findings register

[INFERRED] Order follows provisional exposure, not measured impact. Effects are risks; effort/risk are assessments. Gains count avoided work where code permits; millisecond gains require measurement.

| ID | Finding / evidence | Layer / category | User-visible effect | Expected gain | Effort / risk | Constraint |
|---|---|---|---|---|---|---|
|F01|[OBSERVED] Full registry +serial hydration. `src/services/cplm-api/Services/CpmLoopRegistryService.cs:224–279`|API/DB; N+1/unbounded|[INFERRED] Registry-dependent panels wait for entire fleet|[INFERRED]1+2L queries →small constant with batching; latency requires measurement|M; DTO/order compatibility|`CLAUDE.md:101–102` |
|F02|[OBSERVED] Repeated fleet history selection. `src/services/cplm-api/Controllers/CpmFleetController.cs:58–72,142–171,223–243`|DB; unbounded scan/missing index coverage|[INFERRED] Growing retained history can slow data readiness|Requires measurement|M/L; real-verdict semantics|`CLAUDE.md:100–102` |
|F03|[OBSERVED] Serial diagnostics without response cache. `src/services/cplm-api/Controllers/CpmReadinessController.cs:251–388`|Services; waterfall|[INFERRED] Slow diagnostics/repeated JM work|[INFERRED]Share collection across callers; current unit1+2J+V|S/M; freshness/cancellation|`CLAUDE.md:100,102` |
|F04|[OBSERVED] Serial edge rate checks. `src/services/gateway/Program.cs:301–305`; `src/services/gateway/RateLimit/RedisRateLimiter.cs:79–82`|Gateway/Redis; waterfall|[INFERRED] Dependency latency also on cache hits|Requires measurement; combined evaluation may reduce round trips|M; enforcement/failure semantics|`CLAUDE.md:90–92,101` |
|F05|[OBSERVED] Wildcard seed/serial devices. `src/frontend-ob/src/store/mqttStore.ts:300–311,499–515`; `src/services/historian-bff/Program.cs:295–339`|UI/BFF/Redis; over-fetch|[INFERRED] Reopen reads unrelated snapshots|[INFERRED]Work proportional to displayed devices instead of broad seed|S/M; birth/alias/reopen contract|`CLAUDE.md:98–99` |
|F06|[OBSERVED] Changed-only snapshot renewal and finite TTL. `src/flink/src/main/java/com/ams/flink/cplm/LoopLiveRbeJob.java:186–223`; `src/services/sparkplug-edge-node/src/main/java/com/ams/sparkplug/AlarmMetricPublisher.java:461–475`|Live store; config/cache contract|[INFERRED] Missing values on reopen after stable periods|Correctness; requires expiry/reopen measurement|M/L; source-age semantics|`CLAUDE.md:98–100,105` |
|F07|[OBSERVED] Readiness holds connection across probes/counts. `src/services/cplm-api/Controllers/CpmReadinessController.cs:92–194,468–525`|API/DB; waterfall/N+1|[INFERRED] Switching loops consumes pools while waiting|Requires measurement; ≤5 resolver +≤5 asset calls per miss|M; provenance freshness/count compatibility|`CLAUDE.md:99–102` |
|F08|[OBSERVED] Raw5000→24 density buckets; Replay whole arrays. `src/frontend-ob/src/components/Cpm/CpmWindows.tsx:94–129`; `src/frontend-ob/src/components/Cpm/CpmReplay.tsx:127–172`|UI/historian; over-fetch|[INFERRED] Transfer and interaction CPU|[INFERRED]Bounded visual contract could replace raw density payload|M/L; evidence/extrema fidelity|`CLAUDE.md:99–100` |
|F09|[OBSERVED] No explicit compression/keepalive pool. `src/frontend-ob/nginx.conf:13–69`|Front door; transport/config|[INFERRED] Transfer/setup overhead if inherited config also lacks them|Requires measurement|S; CPU/bandwidth/proxy tradeoff|`CLAUDE.md:90–92,101` |
|F10|[OBSERVED] Implicit-date keys/rankings overlap. `src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:85–112`; `src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:108–112`|UI; cache defeat/duplicate fetch|[INFERRED] Refetches after presentation interactions|[INFERRED]Up to4 historical reads; one overlapping ranking when order matches|S; selection/order semantics|`CLAUDE.md:98–100` |
|F11|[OBSERVED] Partial index coverage; invalid script tail. `database/scripts/30_cplm_analytics_schema.sql:70–77,114–121,159–166`; `database/scripts/42_cplm_event_frames_indexes.sql:25–32`|Schema; missing index/config|[INFERRED] Sort work/uncertain deployed indexes|Requires catalog/plans|S/M; migration/write/storage cost|`CLAUDE.md:101–102` |
|F12|[OBSERVED] Frontend transport derivation. `src/frontend-ob/src/utils/loopSeries.ts:17–33`; `src/frontend-ob/src/hooks/useLoopLive.ts:17–58`|Boundary; config|[INFERRED] Transport changes require coordinated reader configuration|Correctness/maintainability; latency requires measurement|L; added resolution waterfall unless batched|`CLAUDE.md:98–99` |
|F13|[OBSERVED] Unbounded series/measurement cardinality. `src/services/historian-bff/Program.cs:350–370`; `src/services/historian-bff/IoTDbClient.cs:81–83`|Historian; unbounded query|[INFERRED] Large requests consume shared capacity; not normal CPM mount|Requires traffic/size measurement|M; API compatibility|`CLAUDE.md:99–101` |

### 8.2 Quick wins: no required API contract change

[INFERRED] These are proposals, not implemented changes. Validate against the cited code and preserve the associated rules.

| Enhancement | Implementation boundary | Validation / acceptance criterion | Evidence / rule |
|---|---|---|---|
|[INFERRED] Stabilise implicit historical dates|CpmHistorical.tsx: anchor defaults independently of unrelated URL state|Changing selected window alone preserves trend/mode/KPI/history range keys; explicit range change still refreshes required data|`src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:85–112`; `CLAUDE.md:98–99` |
|[INFERRED] Include maxCount in raw key|useCpm.ts|Equal series/range/measurements with different limits have distinct cache entries; identical requests deduplicate|`src/frontend-ob/src/hooks/useCpm.ts:282–292`; `CLAUDE.md:99` |
|[INFERRED] Cache/single-flight pipeline metrics|CpmReadinessController.cs|Concurrent callers share collection; collectedAt remains source-collection time; failures/timeouts do not indefinitely retain stale success|`src/services/cplm-api/Controllers/CpmReadinessController.cs:251–404`; `CLAUDE.md:100,102` |
|[INFERRED] Remove unused registry tags projection|Registry service list/single hydration|DTO parity for mappings/flags/links; reduced PG→service bytes; no mutation path changes|`src/services/cplm-api/Services/CpmLoopRegistryService.cs:229–279`; `CLAUDE.md:101–102` |
|[INFERRED] Correct script42 trailing tokens|SQL script only; deployment verification separate|Complete SQL parses; deployed indexes checked rather than assumed|`database/scripts/42_cplm_event_frames_indexes.sql:25–32`; `CLAUDE.md:101–102` |
|[INFERRED] Explicit JSON compression/upstream reuse|nginx configuration, after effective-config inspection|JSON Content-Encoding/bytes verified; CPU measured; connection reuse observed; MQTT/SignalR upgrades still succeed|`src/frontend-ob/nginx.conf:13–58`; `CLAUDE.md:90–92` |
|[INFERRED] Reuse compatible rankings data|Performance component where scope/kind/order are identical|Top12 equals slice of same ordered top50; retain independent request when chosen order differs|`src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:108–112`; `src/frontend-ob/src/hooks/useCpm.ts:157–166`; `CLAUDE.md:100–102` |

### 8.3 Structural enhancements

| Enhancement | Proposed refinement and acceptance criterion | Architectural assessment / evidence |
|---|---|---|
|[INFERRED] Registry batching first, pagination/projection second|Batch tag/link reads for the selected parent set; preserve reverse PEER union and missing-role behaviour. Then define stable server paging and selector projection so client slicing does not hide unbounded transfer.|Preserves CPLM ownership/DB; do not embed live values. `src/services/cplm-api/Services/CpmLoopRegistryService.cs:224–279`; `CLAUDE.md:98,101–102` |
|[INFERRED] Latest-verdict projection or query/index redesign|First obtain plans. Preserve real-verdict preference, NULL handling, case semantics, scope, late/out-of-order results and historical access. Do not add arbitrary recent-time cutoffs that hide valid old verdicts.|New analytical computation must stay in Flink; presentation read projection remains CPLM-owned. `src/services/cplm-api/Controllers/CpmFleetController.cs:142–171`; `CLAUDE.md:100–102` |
|[INFERRED] Batch binding provenance and consume resolved transports|Connect existing batch interfaces so resolving five roles does not merely move five downstream calls into another service. Test role/path failures independently and cache with explicit mapping freshness.|Aligns current frontend with UNS/CQRS; avoid a new serial phase for every row. `src/services/binding-resolver/Program.cs:97–121`; `src/services/asset-model/Program.cs:264–278`; `src/frontend-ob/src/utils/loopSeries.ts:17–33`; `CLAUDE.md:98–99` |
|[INFERRED] Scoped snapshot acquisition/renewal contract|Seed only requested resolved devices while retaining alias/birth metadata. Define recovery for constant values and bounded retry/fallback; keep source event time separate from cache refresh time. Test >TTL unchanged values and noeviction saturation.|Preserves paint-on-open/quality. Merely deleting wildcard bootstrap without recovery is insufficient. `src/frontend-ob/src/store/mqttStore.ts:300–311,464–515`; `src/services/sparkplug-edge-node/src/main/java/com/ams/sparkplug/AlarmMetricPublisher.java:461–475`; `CLAUDE.md:98–100,105` |
|[INFERRED] Separate bounded visual output from raw evidence|Density needs24 counts, which one existing summary object does not provide. Define an explicit representation/producer; retain raw evidence and honest truncation. Replay preview reduction must preserve diagnostically important extrema/trajectory.|No new .NET analytical aggregation. `src/frontend-ob/src/components/Cpm/CpmWindows.tsx:94–129`; `src/frontend-ob/src/components/Cpm/CpmReplay.tsx:117–172`; `src/services/historian-bff/IoTDbClient.cs:129–136`; `CLAUDE.md:99–100` |
|[INFERRED] Reduce readiness connection occupancy|Perform DB work in bounded connection scopes, await independent remote work outside DB holding periods where semantics permit, and propagate cancellation. Preserve exact evidence counts if response consumers require them.|Preserves service/DB ownership; do not silently replace contract counts with booleans. `src/services/cplm-api/Controllers/CpmReadinessController.cs:92–213`; `CLAUDE.md:99–102` |
|[INFERRED] Combined rate-limit operation|Use an atomic design preserving route/global limits, new-counter expiry and fail-open/fail-closed semantics; measure whether this materially affects cache-hit latency.|Preserves edge-only policy point. `src/services/gateway/Program.cs:265–325`; `src/services/gateway/RateLimit/RedisRateLimiter.cs:58–94`; `CLAUDE.md:90–92` |
|[INFERRED] Read-serving scale design|Only consider read/consumer separation after measurement; deploy with explicit consumer disabling/ownership and prove one member per CPLM group.|Replicating the current consumer-enabled process without separation violates the single-member rule. `infra/docker/docker-compose.yml:1342–1399`; `CLAUDE.md:102` |

### 8.4 Refinements to avoid incorrect optimisation claims

- [OBSERVED] Code takes precedence over stale routing descriptions: nginx forwards dynamic paths to gateway. Evidence: `src/frontend-ob/nginx.conf:28–58`.
- [OBSERVED] Snapshot Redis is noeviction, not the volatile-lru cache tier. Evidence: `infra/docker/docker-compose.yml:119–176,858–875`.
- [OBSERVED] CPM uses raw cursor pagination; do not report the legacy OFFSET endpoint as the CPM UI path. Evidence: `src/frontend-ob/src/api/cpmApi.ts:560–575`.
- [OBSERVED] Width is clamped; do not describe it as arbitrarily client-overridable. The separate concerns are integer rounding, fixed UI width constants, unbounded measurement count and scan work. Evidence: `src/services/historian-bff/Program.cs:114–118`; `src/services/historian-bff/IoTDbClient.cs:81–123`.
- [OBSERVED] Lower-loop indexes exist; absence of complete composite ordering coverage is the supported finding. Evidence: `database/scripts/30_cplm_analytics_schema.sql:70–77,114–121,159–166`.
- [OBSERVED] HTTP REST does not imply fresh connections; clients are factory-managed. Evidence: `src/services/historian-bff/Program.cs:14–16`.
- [OBSERVED] Downstream services use header trust; repeated JWT signature validation per hop is not the implemented path. Evidence: `src/services/_shared/TraverseAuth.cs:89–135`.
- [OBSERVED] Explorer has an explicit historian fallback; Overview's live pills differ. Do not generalize a missing fallback across all pages. Evidence: `src/frontend-ob/src/components/Cpm/explorer/SummaryTab.tsx:110–163`; `src/frontend-ob/src/components/Cpm/overview/LoopFocus.tsx:34–37,103–106`.
- [INFERRED] SQL LIMIT, local table pagination and chart downsampling address different costs. Preserve output completeness/diagnostic semantics while reducing the relevant layer's work. Evidence: `src/services/cplm-api/Controllers/CpmFleetController.cs:142–171`; `src/frontend-ob/src/components/Cpm/LoopRegistry.tsx:48–53`; `src/services/historian-bff/IoTDbClient.cs:92–123`.
- [INFERRED] New batch APIs, schemas, metrics and policy changes in this report are proposals unless explicitly identified as already present. No improvement percentage, latency reduction or currency saving should be accepted without the measurements below.

### 8.5 Measurement gaps: RED, USE and golden signals

[OBSERVED] Gateway/CPLM/historian expose HTTP metrics and have Prometheus scrape configuration. Existing rules cover availability, Kafka/Flink conditions, Redis memory and PG connections. This does not establish page-level payload, freshness or waterfall costs. Evidence: `src/services/gateway/Program.cs:201–215`; `src/services/cplm-api/Program.cs:158–159`; `src/services/historian-bff/Program.cs:40–41`; `infra/docker/prometheus.yml:34–38,86–108`; `infra/docker/prometheus-rules.yml:1–74`.

[INFERRED] The following names are **proposed instrumentation**, not claims of existing spans/metrics. Use normalized routes/query fingerprints; avoid unrestricted loop/path labels in Prometheus.

| Signal / method | Proposed spans or metrics / location | Question resolved |
|---|---|---|
|Latency / RED / RUM|`cpm.page.load`, `cpm.panel.ready`, `cpm_page_ready_duration_seconds`, Web Vitals at SPA/page transitions|Call-up, LCP, INP and required-data readiness |
|Traffic / RED|`cpm_page_views_total{route}`, foreground dwell histogram, interaction counts, endpoint requests/cache outcomes|Actual frequency weights and1000-view model |
|Latency / RED|`cpm.registry.list`, `cpm.registry.hydrate`, `cpm.readiness`, `cpm.pipeline.collect` with DB/HTTP child spans|Hydration, probe and Flink waterfall timing |
|Work / USE|`cpm_db_rows_returned`, query fingerprint; sampled EXPLAIN ANALYZE BUFFERS in separately authorized runtime work|Scanned rows/chunks, index choices, spills |
|Saturation / USE|Pool busy/idle/waiters, acquire/hold duration; DB connections|Concurrency ceiling and connections held across dependencies |
|Latency/traffic / RED|`historian.query`, `historian.map_points`, `historian.serialize`; points/columns/range attributes|IoTDB versus JSON work |
|Transfer|`http_response_body_bytes`, Resource Timing encoded/decoded sizes, Content-Encoding/cache result|Actual payload and compression costs |
|Errors / RED|Logical request IDs, dependency attempt numbers, timeout/cancellation counters|Retry amplification and work after abandonment |
|Errors/freshness|`cpm_snapshot_missing_total`, `cpm_snapshot_age_seconds`, `cpm_snapshot_write_failures_total` in BFF/edge/live UI|Stable-value expiry, failed seed, noeviction failures |
|Saturation / USE|Redis memory/rejected writes/command latency/set cardinality; BFF device/metric counts|Wildcard/index cost and contract capacity |
|Saturation / USE|Host/container CPU/memory/throttling/disk queue; JVM GC; browser long tasks/heap|First bottleneck under real page mix |
|Auth / RED|`auth.jwks.resolve`, `auth.jwks.refresh`, `auth.revocation.check`, `gateway.rate_limit`|Cold-key blocking and warm edge overhead |

[INFERRED] Emit these at the observed call sites: `src/services/cplm-api/Services/CpmLoopRegistryService.cs:224–279`; `src/services/cplm-api/Controllers/CpmReadinessController.cs:89–194,251–388`; `src/services/historian-bff/IoTDbClient.cs:37–66,195–229`; `src/services/historian-bff/Program.cs:283–344`; `src/services/gateway/Auth/JwksKeyCache.cs:27–59`; `src/services/gateway/RateLimit/RedisRateLimiter.cs:58–82`; `src/frontend-ob/src/store/mqttStore.ts:464–515`.

## 9. Appendix: examined sources and unanswered questions

### 9.1 Source manifest

The audit examined the code/configuration cited above, including the following implementation groups. This manifest records audit coverage rather than asserting runtime behaviour.

- `src/frontend-ob/src/App.tsx`, `productSlice.ts`, `api/cpmApi.ts`, `api/apiFetch.ts`, auth/roles/audit clients, auth/MQTT stores, `hooks/useCpm.ts`, `hooks/useLoopLive.ts`, `utils/loopSeries.ts`.
- All twelve CPM page components named in Section3.2; location/scope filters; GateMatrix/GateEvidencePanel/CalcDrawer; Overview LoopFocus/PipelinePanel/FocusedLoopDrawer; Explorer workspace and Summary/Signals/Relationships/History/Calculations tabs; Windows comparison/results; historical chart/toolbar/time-range helpers; shared primitives.
- Installed TanStack Query `src/removable.ts` and `src/utils.ts`.
- `src/frontend-ob/nginx.conf` and frontend Dockerfile.
- `src/services/cplm-api/Controllers/CpmAnalyticsController.cs`, `CpmEventsController.cs`, `CpmFleetController.cs`, `CpmLoopsController.cs`, `CpmReadinessController.cs`.
- `src/services/cplm-api/Services/CpmLoopRegistryService.cs`, `CplmRecomputeService.cs`, `IotDbWriteClient.cs`; Program/config/auth; narrow result-consumer/frame-consumer group configuration.
- `src/services/historian-bff/Program.cs`, `IoTDbClient.cs`, `IoTDbWarmupService.cs`, auth module.
- `src/services/binding-resolver/Program.cs`, `Services/PathResolver.cs`, auth module.
- `src/services/asset-model/Program.cs`, `Data/AssetDbContext.cs`, auth module.
- `src/services/_shared/TraverseAuth.cs`; gateway Program/config, `Auth/JwksKeyCache.cs`, `Auth/RevocationCache.cs`, `Caching/ResponseCacheMiddleware.cs`, `RateLimit/RedisRateLimiter.cs`, forwarder-client configuration.
- `database/scripts/29_traverse_cplm_db.sql`, `30_cplm_analytics_schema.sql`, `32_cpm_loop_registry.sql`, `33_cpm_permissions.sql`, `34_cplm_event_frames.sql`, `39_timescale_policies.sql`, `42_cplm_event_frames_indexes.sql`, `44_cpm_signal_asset_ledger.sql`.
- `infra/docker/docker-compose.yml`, `iotdb/datanode-env.sh`, `prometheus.yml`, `prometheus-rules.yml`.
- Narrow live-output/snapshot-contract sections of `src/flink/src/main/java/com/ams/flink/cplm/LoopLiveRbeJob.java` and `src/services/sparkplug-edge-node/src/main/java/com/ams/sparkplug/AlarmMetricPublisher.java`, `SparkplugConfig.java`.

Phase0 context was read in the requested order: `CLAUDE.md`; then `docs/architecture-review/00-INDEX.md`, `01-system-overview.md`, `03-microservices-catalog.md`, `04-data-flows.md`, `06-iotdb-historian.md`, `09-databases.md`, `02-docker-compose-services.md`, `07-mqtt-sparkplug-live.md`. Following the instruction to check code rather than docs, these descriptive architecture-review files are not used to prove implemented performance behaviour. Architectural constraints are cited to `CLAUDE.md:90–105`.

### 9.2 Explicit runtime questions

[INFERRED] Each answer below is **not determinable from static analysis**:

1. Which page/endpoint costs most overall? Measure page mix, dwell, interactions, cache hits and endpoint CPU/I/O/time.
2. Does operator call-up/update meet requirements? Supply plant HMI targets; measure data-ready latency, LCP, INP and source-to-paint age.
3. Which indexes/hypertables are actually installed? Inspect database catalogs and initialization/migration logs, especially script42.
4. Which queries scan/sort most? Collect representative plans, buffers, chunks, sort spills and row counts at the Section5.2 SQL call sites.
5. What is actual transfer cost? Capture body sizes before/after compression, headers and network/TLS overhead at nginx/gateway/browser.
6. Does nginx effectively compress/buffer/reuse connections? Inspect effective configuration, headers and socket traces.
7. What is pool/concurrency capacity? Measure effective pool settings, waiters, acquisition/hold times and database headroom.
8. What happens after>1h without value change? Observe metric expiry, RBE output, reconnect/birth traffic and reopening of Overview/Explorer.
9. How costly are retained birth subscriptions? Measure MQTT bytes/messages by topic class and active subscription set across navigation.
10. Which resource saturates first? Exercise the observed workload mix with simultaneous RED/USE/RUM metrics.
11. What is cost per1000 page views? Supply rates, standing/shared allocation policy and measured units from Section6.
12. How much work survives cancellation/retries? Trace logical request IDs, attempts, cancel propagation and eventual query completion.

[INFERRED] No measured latency, throughput, compression ratio, saturation threshold or monetary saving is claimed. Enhancement acceptance criteria require separate implementation and runtime validation; this report does not imply that those steps have occurred.
