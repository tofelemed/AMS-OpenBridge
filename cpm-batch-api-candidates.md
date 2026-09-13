# CPM module — where batch APIs pay off, and where they would not

Date: 2026-09-13. Baseline: the v6 read path (CHG-023). Every call site below was read in code;
timings are from the lab with the gate table at plant scale (367k rows).

## TL;DR

- After CHG-023 the **fleet pages need no batching**: one call already returns the whole fleet
(heatmap = every loop × 17 gates), and each call is 20–100 ms. A "page bundle" endpoint would
couple contracts and defeat React Query's per-resource polling for no measurable gain.
- The remaining fan-outs are **per-loop and per-item**, not per-page. Five are worth doing, in this
order: **(1)** readiness → resolver batch, **(2)** resolver batch → asset-model `by-paths`,
**(3)** bulk `republish-evidence` (operations), **(4)** Windows comparator 6 KPI reads → 1,
**(5)** Governance role permissions R → 1. One more (Historical trend + mode track → one
historian query) is possible but changes a visible semantic slightly.
- Reliability comes from the patterns the repo already has: bounded input, **per-item results
aligned by index or key**, per-item fallback, same authorization policy, single-item endpoints
kept for interactive use. Both batch endpoints needed by (1) and (2) **already exist**; the work
is connecting them.

---



## 1. What is already batched (leave alone)


| Surface                            | Mechanism                                                                               | Evidence                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Fleet summary / rankings / heatmap | one response for the whole fleet; per-loop index probes; 15 s single-flight cache       | `CpmFleetController.cs`, `Data/FleetLatestSql.cs`, `FleetReadCache.cs` |
| Gate matrix / attention list rows  | client-side joins over the heatmap payload, no per-row fetch                            | `GateMatrix.tsx`, `AttentionList.tsx`                                  |
| Registry list                      | tag map + links read once each, grouped in memory (CHG-023)                             | `Services/CpmLoopRegistryReads.cs`                                     |
| Live snapshots on open             | 50 ms micro-batch of device ids into one `GET /snapshot?assets=a,b,c`, 5 s dedupe       | `store/mqttStore.ts` (`loadSnapshot`)                                  |
| Last stored values                 | one call for `pv,sp,op,mode`                                                            | `useLoopLastValues` → `/api/hist/last`                                 |
| Designer bindings                  | one `POST /resolve/batch` per display (H10)                                             | `hooks/useBindingResolver.ts:46–68,155`                                |
| Bulk onboarding                    | `bulk-activate` / `bulk-delete` (≤ 5,000 items, per-item results, one gateway mutation) | `CpmLoopsController.cs:123–169`                                        |
| Same resource on two components    | React Query key dedupe (e.g. readiness in `LoopWorkspace` and `SignalsTab`)             | `hooks/useCpm.ts`                                                      |


---



## 2. Candidates, ranked



### 2.1 Readiness: five resolver probes → one `POST /resolve/batch` — **do first**

**Today** (`CpmReadinessController.CheckBindingProvenanceAsync` / `ProbeRoleAsync`): for each mapped
role (pv, sp, op, vp, mode) one `GET /resolve?path=…&roles=live` to binding-resolver, 5 s timeout
each, X-Auth headers forwarded, results joined in probe order. Explorer's Signals tab and workspace
run this on every loop click. Measured: readiness **1.26–1.79 s cold**, 56–106 ms warm.

**Batch**: the resolver's `POST /resolve/batch` (≤ 100 bindings, response aligned by index,
out-of-scope paths returned unresolved) already exists. Send the ≤ 5 (path, roles=live) pairs in
one request and read `provenance` per index.


|             |                                                                                                                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gain        | 5 HTTP round trips → 1 per readiness call (the resolver still fans out internally until 2.2)                                                                                                                                                                                                                 |
| Reliability | High. Same `provenance` field, same per-role labels (map by index). One difference to decide: today one role timing out reports only that role as "(unreachable)"; with a batch a failed request marks all roles unreachable — acceptable for a diagnostic, and the batch has one 5 s budget instead of five |
| Pages       | Explorer (Signals, workspace)                                                                                                                                                                                                                                                                                |
| Effort      | S — one method in the controller; keep the single-probe code path out                                                                                                                                                                                                                                        |




### 2.2 binding-resolver `/resolve/batch`: N asset-model GETs → one `POST /assets/by-paths`

**Today** (`binding-resolver/Program.cs:97–121`, `Services/PathResolver.cs`): the batch endpoint
does `Task.WhenAll(resolver.ResolveAsync(path))`, and each `ResolveAsync` calls
`GET /assets/by-path/{path}` on asset-model (one EF query each), falling back to path-derived
bindings stamped `provenance = "fallback"` when the asset is missing or the service is down.

**Batch**: asset-model's `POST /assets/by-paths` (≤ 2,000 paths, missing paths absent) already
exists. Add `ResolveManyAsync(paths, roles)` that fetches all assets in one call, then builds each
binding with the existing `BuildBindingFromAsset` / `BuildBindingFromPath` per path.


|             |                                                                                                                                                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gain        | N → 1 asset-model round trips and N EF queries → one `WHERE path IN (…)`; benefits readiness (2.1), the **HMI designer runtime** (H10 already uses the batch route) and anything else that resolves a screen                              |
| Reliability | High if the per-path contract is kept: absent from the response → fallback binding for that path only; asset-model unreachable → every path falls back (today's behaviour); scope check stays per path; `ResolveAsync` (single) unchanged |
| Effort      | S/M — one new method + the batch endpoint switches to it; unit-test with a stub asset-model handler (pattern: `PipelineMetricsTests`)                                                                                                     |




### 2.3 Operations: `POST /loops/republish-evidence/bulk` — **highest operational value**

**Today** (`CpmLoopsController.cs:175–192`): republish is one POST per loop — registry read,
link projection, signal-asset projection (asset-model calls), Kafka evidence publish, audit. The
v3 data load ran it **175 times from a shell with** `sleep 0.5` to stay under the mutation rate
class (120/min, fail-closed); `validate-loops.sh` tells operators to run it per loop.

**Batch**: the `bulk-activate` shape — `{ loopIds: [...] }` (≤ 5,000), processed sequentially
server-side, per-item result (`republished | notFound | failed: reason`), one audit event with
counts, one gateway mutation.


|             |                                                                                                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gain        | 175 mutations / ≥ 90 s / 429 risk → one call; the step becomes scriptable in `VM-STEPS.md`                                                                                                |
| Reliability | High: each loop's steps are independent and idempotent today; sequential processing keeps asset-model and Kafka load identical to the shell loop; partial failure is reported, not hidden |
| Effort      | S/M — service method loops over `RepublishEvidence`'s body; controller + `cpmApi` + a `[FromBody]` cap                                                                                    |




### 2.4 Windows comparator: six KPI reads → one

**Today** (`windows/CompareAcrossKinds.tsx:37`): `KindRow` renders one row per short window kind
(1m, 5m, 10m, 15m, 30m, 60m) and each row calls `useCpmKpis(loopId, kind, 12)` → six
`GET /loops/{id}/kpis?resolution=K&limit=12`, re-fired on every loop change; the page mount is
12 requests in total.

**Batch**: `GET /loops/{id}/kpis/latest?resolutions=1m,5m,10m,15m,30m,60m&limit=12` → `{ byResolution: { "1m": [...], ... } }`.
Server side either six indexed queries on one connection or one query:
`WHERE lower(loop_id) = lower(@id) AND window_kind = ANY(@kinds)` with
`row_number() OVER (PARTITION BY window_kind ORDER BY window_end DESC NULLS LAST) <= @limit`
— each partition is one range scan on `idx_cplm_short_loop_kind_end`.


|             |                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| Gain        | 6 → 1 gateway round trips and rate-limit counters per loop selection; DB work unchanged (already indexed, ~10–40 ms each) |
| Reliability | High — same rows per kind; keep the row-level completeness filter (`isDeclined`) client-side as now                       |
| Pages       | Windows only                                                                                                              |
| Effort      | S/M — endpoint + hook `useCpmKpisByResolution`; the six `KindRow`s read from one query result                             |




### 2.5 Governance: one permissions request per role → one

**Today** (`useRoleMatrix.ts:43–51`): `GET /api/auth/roles` then `useQueries` with one
`GET /roles/{role}/permissions` per role (the comment says so: "the API has no bulk endpoint").
auth-service is the Node service (`routes/auth.routes.ts:187,206`).

**Batch**: `GET /api/auth/roles?include=permissions` (or `GET /api/auth/roles/permissions`)
returning `{ role_name, permissions[] }[]`.


|             |                                                                            |
| ----------- | -------------------------------------------------------------------------- |
| Gain        | 1 + R → 1 (R ≈ 6–10 roles); admin page only, 5-min cache — small but clean |
| Reliability | High; additive query parameter, existing per-role route kept for edits     |
| Effort      | S (auth-service controller + `rolesApi.ts` + hook)                         |




```
2.6 Historical: trend + mode track → one historian query (possible, with a caveat)
```

**Today** (`CpmHistorical.tsx:109–110`): `useCpmTrend(series, from, to, 300, signals)` and
`useCpmModeTrack(series, from, to, 96)` — two IoTDB `GROUP BY` queries over the same series and
range. The BFF already emits `last_value(mode)` next to the numeric envelope when `mode` is in
the measurements list (`IoTDbClient.BuildTrendSql`), and Explorer's `SummaryTab` already asks
for `pv,sp,op,mode` in one call.

**Batch**: one `/trend` call with `mode` appended; derive the 96-bucket ribbon from the 300-bucket
result client-side.


|             |                                                                                                                                                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gain        | one IoTDB GROUP BY and one gateway call fewer per Historical load and per range change                                                                                                                                                                                              |
| Reliability | **Medium**: 300 sub-buckets do not align with 96 ribbon buckets, so "last value in bucket" can differ at bucket edges. Acceptable only if the ribbon is redefined as 300 buckets (it then matches the chart's x-axis exactly, which is arguably better). Decide before implementing |
| Effort      | S                                                                                                                                                                                                                                                                                   |


---



## 3. Where batching would not help, or would hurt


| Idea                                                                            | Why not                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page bundles (`/fleet/overview`, `/fleet/performance`, `/loops/{id}/workspace`) | After CHG-023 each call is 20–100 ms and cached; a bundle couples three contracts, breaks per-resource polling (events 30 s, fleet 60 s, trend per minute) and React Query's cache keys, and makes one slow dependency block the whole page |
| Overview → Explorer per-loop reads (gates/latest, readiness, events, trend)     | distinct resources with different cadences; readiness dominates and is fixed by 2.1/2.2                                                                                                                                                     |
| Consumer writes (one upsert per Kafka message)                                  | 0.4 rows/s at plant size; batching adds failure-handling complexity for nothing                                                                                                                                                             |
| Events acknowledge / shelve                                                     | per-event by design (each is an audited operator action); a bulk ack is a UX decision, not a performance one                                                                                                                                |
| Gateway rate-limit counters (two INCRs → one Lua call)                          | ~1 ms per request (deferred P3-8)                                                                                                                                                                                                           |
| `/loops` single-loop reads per grid row                                         | none exist — the grids already page a single list                                                                                                                                                                                           |


---



## 4. Rules for any new batch endpoint (what made the existing ones reliable)

1. **Bounded input** with an explicit cap and a 422 above it (`bulk-activate` 5,000; resolver 100; by-paths 2,000).
2. **Per-item results**, aligned by index (resolver) or keyed by id (bulk-activate); a read batch is never all-or-nothing.
3. **Per-item fallback**: a missing dependency result degrades that item only (absent path → fallback binding).
4. **Same policy as the single endpoint** (`analytics.view` / `cpm.manage`), scope checks per item.
5. **Keep the single-item endpoint** for interactive use; the batch is additive.
6. **Cache key = sorted item list** when fronting with `FleetReadCache`; never cache a failed batch.
7. **Mutations stay sequential server-side** (republish) so downstream load matches today's shell loop.



## 5. Suggested order and expected effect


| Order | Candidate                      | Requests before → after | Latency effect                                               | Pages                                |
| ----- | ------------------------------ | ----------------------- | ------------------------------------------------------------ | ------------------------------------ |
| 1     | 2.1 readiness → resolver batch | 5 → 1 (per loop click)  | readiness cold 1.3–1.8 s → roughly 0.5 s once 2.2 also lands | Explorer                             |
| 2     | 2.2 resolver batch → by-paths  | N → 1 asset-model calls | same call; also speeds designer screen open                  | Explorer, HMI designer               |
| 3     | 2.3 bulk republish-evidence    | 175 → 1 (ops)           | minutes of shell loop → one call, no 429                     | plant operations                     |
| 4     | 2.4 Windows comparator         | 6 → 1                   | mount 12 → 7 requests                                        | Windows                              |
| 5     | 2.5 Governance roles           | 1 + R → 1               | small                                                        | Governance                           |
| 6     | 2.6 Historical trend + mode    | 2 → 1 IoTDB queries     | one GROUP BY fewer                                           | Historical (semantic decision first) |

---

## 6. Status (2026-09-13, CHG-024)

| Candidate | Status | Measured (lab) |
|---|---|---|
| 2.1 readiness → resolver batch | **built + tested** | cold per loop 3.22 / 0.70 / 0.24 s → 1.81 / 0.38 / 0.18 s |
| 2.2 resolver batch → by-paths | **built + tested** (new `tests/binding-resolver.Tests`) | 20 paths via the gateway 0.17–0.93 s → 0.06–0.13 s |
| 2.3 bulk republish-evidence | **built + tested** | 3 loops: three calls 1.7–6.2 s → one call 0.21 s, per-item results |
| 2.4 Windows comparator | **built + tested** | six calls 1.14–1.60 s → one call 0.34–0.38 s |
| 2.5 Governance roles | **built + tested** (frontend); auth-service query verified end to end | five calls 0.79–0.83 s → one call 18–43 ms |
| 2.6 Historical trend + mode | **not built** — needs the mode-ribbon decision | — |

Tracker entry: CHG-024. Not yet in a release manifest; services to rebuild: cplm-api,
binding-resolver, traverse-auth-service, ams-frontend.

