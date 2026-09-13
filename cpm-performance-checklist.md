# CPM Overview / Performance — slow read path: audit verdict and fix checklist

Date: 2026-09-13. Branch `feat/ot-loop-ingestion`. Prod = Marun (v3 + v2.3 deployed 2026-09-10/12).
Input audited: `analysis.md` (static read-path audit, 2026-09-12).
Symptom: `/cpm` (Overview) and `/cpm/performance` take many seconds to show data on the plant.

## TL;DR

- **Root cause (verified in code, measured):** the three fleet endpoints in
  `src/services/cplm-api/Controllers/CpmFleetController.cs` compute "latest verdict per loop" by
  sorting the **entire** `analytics.cplm_gate_results` table on every call, and two of them drag the
  3.3 KB JSONB payload of every row through that sort. Performance fires four of these per mount and
  again every 60 s; Overview fires two. The gateway cache excludes CPM, so every open console repeats
  the work against Postgres.
- **Measured on a prod-scale copy** (171 loops, 11 days of rows, plain table like prod):
  rankings **9.8–17.6 s**, heatmap **22.6 s**, summary 0.5 s. With the rewrite + two indexes:
  rankings **19 ms**, heatmap **20 ms**, summary **1.8 ms**, identical rows returned (parity diff = 0).
- **Two fixes clear the symptom** (P0-1 backend query rewrite + indexes, P0-2 frontend duplicate
  request). Everything else in this list is load protection, capacity, or hygiene.
- **Correction to analysis.md:** prod's `traverse_cplm` has **no hypertable, no compression, no
  retention** (`migration/schema/03-traverse_cplm.sql` never carried script 39). The gate table grows
  ~33k rows/day with no ceiling, so the old queries get slower every day.

---

## 1. What was checked, and how

| Step | Done |
|---|---|
| Every file/line cited by analysis.md for Overview, Performance, fleet controller, hooks, gateway cache, rate limiter, nginx, schema scripts, migration pack | Read and confirmed (or corrected below) |
| Prod schema path | `migration/02-apply-schemas.sh` applies `migration/schema/03-traverse_cplm.sql` and **skips** a DB whose sentinel table exists — so prod's indexes are exactly script 30's four, and any new DDL reaches prod only through the consumer's `EnsureSchemaAsync` self-heal or an ops SQL |
| Row growth | `CpmAnalyticsController.WindowSpecs`: long tier recomputes every **15 min**; fusion fires on **12h and 24h** → 2 × 96 = 192 gate rows/loop/day → **~33k rows/day** for 171 loops |
| Measurement | Lab Postgres started alone (`ams-postgres`, then stopped again). Lab had only 5.6k gate rows (31 loops), so a prod-scale copy was built in a scratch schema: 361k rows, real lab payloads (avg 3,303 B), plain table, the same four indexes prod has. `EXPLAIN (ANALYZE, BUFFERS)` of the controller's verbatim SQL vs the proposed rewrite; scratch schema dropped afterwards |
| Not measured | Absolute plant numbers (shared Instrumental PG: unknown `shared_buffers`, disk). Section 7 gives the probe to record them before and after. The **shape and ratio** of the result do not depend on the host |

Lab PG settings during measurement: `shared_buffers=128MB`, `work_mem=4MB` (compose defaults; plant values unknown).

---

## 2. Verdict on analysis.md

| analysis.md claim | Verified? | Relevant to the two slow pages? | Note |
|---|---|---|---|
| Fleet summary/rankings/heatmap find the latest verdict across all history, no time bound, index doesn't match the ordering (F02) | **Yes** | **Yes — this is the root cause** | analysis ranked it #2 "by exposure" and said "requires measurement". Measured: 10–23 s per call at today's prod size |
| Performance mounts rankings for limit 50 **and** 12 (F10) | Yes | Yes | Same order when rankBy = confidence → top-12 is a slice of top-50 |
| Registry list is 1 + 2L queries (F01, ranked #1) | Yes | **No** — neither page calls `/loops` | Valid for Explorer/Registry/Calculations/Historical/Windows/Replay/Pipeline/Events/Governance. Deferred (section 5) |
| Pipeline-metrics serial Flink fan-out (F03) | Yes | **No** — Overview's PipelinePanel uses `pipeline-status` (Flink overview cached 5 s in-memory) | Windows/Pipeline pages only |
| Gateway response cache excludes CPM | Yes | Yes (no cross-console coalescing) | Adding CPM to the gateway allow-list would **not** help: keys are per user, and the 60 s poll is longer than any sane TTL |
| Gate tables are hypertables with 7-day chunks, compression after 30 d, retention (§5.2) | **Lab only** | Yes, inversely | **Prod is a plain table.** No chunk exclusion to rely on; no retention → unbounded growth (see P1-4) |
| `42_cplm_event_frames_indexes.sql` ends with literal `</content></invoke>` (F11) | Yes (bytes confirmed) | No | Lab-only impact: a fresh `postgres-data` volume aborts init at script 42 (`ON_ERROR_STOP`), so 43–51 never run. Prod uses `migration/schema/*`, unaffected |
| nginx has no gzip / keepalive (F09) | Yes | Marginal | Heatmap ≈ 100 KB/poll uncompressed; irrelevant on plant LAN, noticeable over VPN |
| Rate limiter does 2 serial Redis INCR per request (F04) | Yes | No | ~1 ms per request |
| Wildcard snapshot seed on MQTT connect; BFF awaits each device serially (F05) | Yes | Overview only, small | ~2 Redis round trips per device, once per connect. See P2-6 |
| Overview event trail (`events?limit=3&sort=recent`) | Not flagged | Measured 0.14 ms on lab | Fine |
| Trend for the focused loop (8 h envelope) | Not flagged as slow | Serial **after** rankings | Overview's chart waits for the 10–18 s rankings call before it can even start |

**Missing from analysis.md, and material:**

1. **The payload detoast.** `payload::text` is evaluated *before* the sort, so rankings/heatmap read every
   row's TOASTed 3.3 KB payload: 741k buffer reads and an 822 MB on-disk sort for one heatmap call.
   That is what turns the 0.5 s summary-shaped scan into 10–23 s.
2. **Ordering divergence.** The consumer's self-healed `analytics.cplm_gate_latest` view orders
   *recency first* (its "P1-3" fix), while `CpmFleetController` and `gates/latest` order
   *real-verdict first*. The rewrite below keeps the controllers' current order (no behaviour change);
   whether to align them is a product decision, not a performance one.
3. **No retention in prod** (above).

---

## 3. Root cause — mechanics and measurement

Current shape (all three endpoints):

```sql
WITH latest AS (
  SELECT DISTINCT ON (g.loop_id) ..., g.payload::text
  FROM analytics.cplm_gate_results g
  WHERE g.window_kind = @windowKind                       -- half the table
  ORDER BY g.loop_id, (real-verdict expr) DESC, g.window_end DESC NULLS LAST, g.created_at DESC
)                                                          -- full sort, no matching index
SELECT ... FROM cpm.loop_registry r LEFT JOIN latest l ON lower(l.loop_id) = lower(r.loop_id) ... LIMIT @limit
```

Existing index `(loop_id, window_kind, window_end DESC)` cannot serve an ORDER BY whose second key
is a boolean expression, so Postgres seq-scans, detoasts every payload, and external-merge-sorts.
Cost grows linearly with retained rows; prod retains everything.

Measured, prod-scale copy (361k rows, 74 MB heap + 956 MB TOAST):

| Query | Now | After rewrite | Detail |
|---|---:|---:|---|
| `fleet/rankings` (limit 50) | **9,816 ms** run 1, **17,630 ms** run 2 | **18.8 ms** | old: parallel seq scan, 276 MB external sort ×3 workers, 741k buffers; new: 342 index probes, 2,760 buffers |
| `fleet/heatmap` (limit 100) | **22,638 ms** | **19.8 ms** | old: 822 MB external sort (payload text in every sort tuple) |
| `fleet/summary` | **532 ms** | **1.8 ms** | old has no payload; still a full scan + 8 MB spill |
| Parity (old vs new latest row per loop, 171 loops) | — | **diff = 0** | same `(loop_id, window_end, diagnosis, confidence)` set |
| New index build | — | 1.6 s + 2.1 s | 15 MB + 17 MB on 361k rows |

Per page, today vs after (query time only; add network/JSON ≈ 50–200 ms):

| Page | Mount requests hitting the gate table | Data-ready now (parallel, disk-contended) | After P0-1 + P0-2 |
|---|---|---:|---:|
| Performance | summary + rankings50 + rankings12 + heatmap | **~20–40 s** | **< 0.3 s** |
| Overview | summary + rankings50, then trend waits on rankings | **~10–20 s** + trend | **< 0.3 s** + trend (IoTDB, 0.1–1 s) |

Both pages repeat the full set every 60 s per open console; with the fix the repeat is negligible.

---

## 4. Fix checklist

Priority: **P0** = ships the symptom fix · **P1** = protects it / capacity · **P2** = hygiene · **P3** = optional.

| ID | Fix | Pri | Pages | Cost now → after | Effort | Risk | Files |
|---|---|---|---|---|---|---|---|
| **P0-1** | Rewrite fleet "latest verdict" as per-loop LATERAL probes + 2 indexes; project only the payload fragments used | **P0** | both | rankings 10–18 s → 19 ms; heatmap 23 s → 20 ms; summary 0.5 s → 2 ms (measured) | M (½–1 day incl. proof) | Low — same rows (parity proven); additive indexes | `CpmFleetController.cs`, `CplmResultConsumerService.cs` (EnsureSchema), `migration/schema/03-traverse_cplm.sql`, new `database/scripts/52_…sql`, new `scripts/cpm-04-fleet-latest-indexes.sql`, `build-release.py` OPS_FILES |
| **P0-2** | Performance: derive the 12 bad actors from the 50-row ranking when rankBy = confidence; keep the separate call only for rankBy = error | **P0** | Performance | 4 → 3 heavy calls per mount and per 60 s poll (−25 %) | S (1 h) | None — server ORDER BY is deterministic (`real DESC, confidence DESC, loop_id`) | `CpmPerformance.tsx` |
| **P1-3** | In-service 15 s memory cache + single-flight for the three fleet reads, keyed by scope/kind/order/limit | P1 | both | N consoles × 4 queries/min → ≤ 4 queries per 15 s in total | S/M (2–3 h) | Low — ≤ 15 s staleness against a 15-min fusion cadence | `CpmFleetController.cs` (IMemoryCache is already registered) |
| **P1-4** | Retention for `cplm_gate_results` / feature tables on the plant (no hypertable exists there) | P1 | capacity | table +~110 MB/day incl. TOAST, unbounded → bounded | M | Medium — shared Instrumental PG; needs the timescaledb extension check or a plain delete job | plant ops + `migration/schema/03`, consumer self-heal |
| **P2-5** | Remove the `</content></invoke>` tail from `42_cplm_event_frames_indexes.sql` | P2 | lab only | fresh lab volumes stop applying scripts at 42 → all 51 apply | trivial | None | `database/scripts/42_cplm_event_frames_indexes.sql` |
| **P2-6** | Snapshot fan-out: BFF issues the per-device SMEMBERS/MGET concurrently; CPA slice skips the wildcard seed on connect | P2 | Overview (first paint of live pills) | ~2 RTT × device count serial (est. 0.2–0.5 s) → tens of ms; one request per connect | S/M | Low/Med — keep birth/alias semantics (analysis F05) | `historian-bff/Program.cs` snapshot handler, `mqttStore.ts` connect handler |
| **P3-7** | nginx `gzip on` for JSON | P3 | both | heatmap ≈ 100 KB → ≈ 10 KB per poll; latency gain only off-LAN | S | Low | `src/frontend-ob/nginx.conf` (baked into the frontend image) |
| **P3-8** | Rate limiter: one Lua/MULTI round trip instead of two serial INCRs | P3 | all | ~1 ms/request | S | Low — preserve fail-open/closed | `RedisRateLimiter.cs`, gateway `Program.cs` |

### P0-1 — detail

**Query shape** (rankings; heatmap identical with `payload->'gates'`; summary is the first probe only):

```sql
SELECT r.loop_id, r.display_name, r.site, r.area, r.unit, r.loop_type, r.criticality,
       l.window_end, l.diagnosis, l.severity, l.confidence, l.effort_ratio, l.triangularity,
       l.horch_oddness, l.acf_period_s, l.good_error_pct, l.mae, l.flags
FROM cpm.loop_registry r
LEFT JOIN LATERAL (
    SELECT u.* FROM (
        (SELECT g.window_end, g.diagnosis, g.severity, g.confidence, g.effort_ratio, g.triangularity,
                g.horch_oddness, g.acf_period_s, g.good_error_pct, g.mae,
                g.payload->'observability_flags' AS flags, TRUE AS real_verdict
         FROM analytics.cplm_gate_results g
         WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = @windowKind
           AND g.diagnosis IS NOT NULL AND g.diagnosis <> 'INSUFFICIENT_DATA'
         ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC LIMIT 1)
        UNION ALL
        (SELECT g.window_end, g.diagnosis, g.severity, g.confidence, g.effort_ratio, g.triangularity,
                g.horch_oddness, g.acf_period_s, g.good_error_pct, g.mae,
                g.payload->'observability_flags', FALSE
         FROM analytics.cplm_gate_results g
         WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = @windowKind
         ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC LIMIT 1)
    ) u ORDER BY u.real_verdict DESC LIMIT 1
) l ON TRUE
WHERE (@site::text IS NULL OR r.site = @site) AND (@area::text IS NULL OR r.area = @area)
  AND (@unit::text IS NULL OR r.unit = @unit)
  AND COALESCE((r.monitoring->>'enabled')::boolean, FALSE)
ORDER BY (l.diagnosis IS NOT NULL AND l.diagnosis <> 'INSUFFICIENT_DATA') DESC, {rankExpr}, r.loop_id
LIMIT @limit;
```

**Indexes** (additive; `IF NOT EXISTS` in the self-heal and schema files; `CONCURRENTLY` in the plant ops file):

```sql
CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_latest_real
    ON analytics.cplm_gate_results (lower(loop_id), window_kind, window_end DESC NULLS LAST, created_at DESC)
    WHERE diagnosis IS NOT NULL AND diagnosis <> 'INSUFFICIENT_DATA';
CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_latest_any
    ON analytics.cplm_gate_results (lower(loop_id), window_kind, window_end DESC NULLS LAST, created_at DESC);
```

**Rules to keep:**
- Keep `lower()` on both sides — loop ids arrive from DCS exports / registry / URLs with mixed case.
- Keep real-verdict-first ordering (current controller behaviour). `PENDING` counts as "real" today; unchanged.
- Summary: the old predicate `diagnosis IS DISTINCT FROM 'INSUFFICIENT_DATA'` also admits NULL; the new
  one excludes NULL so the partial index applies. Equivalent in practice — Flink's `CplmGateResult`
  always serialises a diagnosis string (default `"PENDING"`). Confirm on the plant:
  `SELECT count(*) FROM analytics.cplm_gate_results WHERE diagnosis IS NULL;` → expect 0.
- Select `payload->'observability_flags'` / `payload->'gates'` only; drop `payload::text` and the
  per-row `JsonDocument.Parse` of the whole message.
- The controller is 295 lines; put the three SQL strings in a `FleetLatestSql.cs` helper to stay under
  the 400-line rule.
- The consumer's `EnsureSchemaAsync` is how an **existing** prod DB gets DDL. Plain `CREATE INDEX`
  there takes a share lock (blocks writes only) for a few seconds; the consumer is not consuming yet
  at that point, so it is safe. On the plant, run the ops file first so the self-heal is a no-op.

**Acceptance:** for `?windowKind=24h` (and `12h`) with and without scope, old and new endpoints return
the same `loops[]` (order and content); `EXPLAIN` shows `Index Scan using idx_cplm_gate_results_latest_*`,
no `Seq Scan on cplm_gate_results`; each endpoint < 100 ms on the plant.

### P0-2 — detail

In `CpmPerformance.tsx`: when `rankBy === 'confidence'`, `badActors` = `rankings.data.loops.slice(0, 12)`
with rankings' loading/error state; only when `rankBy === 'error'` call `useFleetRankings(scope, windowKind, 'error', 12)`
(pass `enabled` through, or key the hook so the confidence variant is not fetched).

### P1-3 — detail

`IMemoryCache` entry per `(endpoint, site, area, unit, windowKind, orderBy, limit)`, TTL 15 s, with a
`Lazy<Task<T>>` (or `SemaphoreSlim`) so concurrent misses share one query. Do not cache errors.
Add `X-Cpm-Cache: HIT|MISS` header for the plant proof. Note: only one cplm-api process exists
(single-member consumer rule), so an in-process cache is complete.

### P1-4 — detail

Decide one of:
1. Timescale policies on the plant (script 39 semantics: hypertable on `window_end`, compress > 30 d,
   retain 730 d) — only if `SELECT * FROM pg_available_extensions WHERE name='timescaledb'` shows the
   extension on Instrumental's Postgres, and only with `migrate_data => TRUE` on a quiet window.
2. Otherwise a nightly delete (`DELETE … WHERE window_end < now() - interval '730 days'`) as a cron
   in the cplm-api host or a `pg_cron` job, plus `VACUUM`.
Not needed for the latency fix; needed before the host "fills for the fourth time".

---

## 5. Deferred — valid in analysis.md, not the cause here

| Finding | Pages it does hit | Suggested batch |
|---|---|---|
| F01 registry N+1 (`/loops`: 1 query + 2 per loop, sequential) | Explorer, Registry, Calculations, Historical, Windows, Replay, Pipeline, Events, Governance | next release: batch tag/link hydration in `CpmLoopRegistryService.cs:224–279` |
| F03 pipeline-metrics serial Flink calls (1 + 2J + V), polled every 20 s | Windows, Pipeline | cache/single-flight like `GetJobStatesAsync` |
| F07 readiness holds a DB connection across resolver/Flink calls | Explorer | scope the connection |
| F08 raw 5,000-point density fetch; Replay whole-array mapping | Windows, Replay | bounded visual contract |
| F06 snapshot TTL vs report-by-exception (correctness on reopen) | Overview/Explorer live pills | separate correctness item |

---

## 6. Release plan (proposed **v6**; confirm the number — manifests exist up to `v5.txt`)

**Updated services (build these, nothing else):**

| Compose service | Image | Carries |
|---|---|---|
| `cplm-api` | `ams-cpa-cplm-api` | P0-1 (queries + self-heal indexes), P1-3 |
| `ams-frontend` | `ams-cpa-ams-frontend` | P0-2 (+ P3-7 if taken) |
| `historian-bff` *(only if P2-6 is taken)* | `ams-cpa-historian-bff` | P2-6 |

Unchanged: gateway, auth, asset-model, binding-resolver, audit-service, sparkplug-edge-node, ams-api,
Flink (no jar change, **no job resubmission**).

**Schema:** additive indexes only. Three copies, one purpose each:
- `scripts/cpm-04-fleet-latest-indexes.sql` — **plant**, run before the image swap
  (`CREATE INDEX CONCURRENTLY IF NOT EXISTS …`; add to `OPS_FILES` in `migration/deploy/build-release.py`).
- `CplmResultConsumerService.EnsureSchemaAsync` — self-heal for any DB that missed the ops step.
- `migration/schema/03-traverse_cplm.sql` + `database/scripts/52_cplm_fleet_latest_indexes.sql` — fresh installs / lab.

**Scripts to run — build box:**

```powershell
git status --short                                             # must be empty (bundles ship git archive HEAD)
cd src/frontend-ob; npm run lint; npm run build; cd ../..      # P0-2
dotnet build src/services/cplm-api/cplm-api.csproj             # P0-1 / P1-3
.\run-all.ps1 -SkipGoldenVerify                                # lab proof: parity query + curl timings (section 7)
python migration/deploy/build-release.py --release v6 --dry-run
python migration/deploy/build-release.py --release v6          # → release-out/v6-<date>/
```

**Scripts to run — plant VM (in order):**

```bash
cd /tmp/v6 && sha256sum -c SHA256SUMS.txt
docker images --no-trunc --format '{{.ID}} {{.Repository}}:{{.Tag}}' > /tmp/pre-v6-images.txt   # rollback point
# 1. BEFORE numbers (section 7) — keep the output
# 2. indexes first, online, no write lock (seconds on ~400k rows)
docker exec -i instrumental-postgres psql -U ams_user -d traverse_cplm -f - < ops/cpm-04-fleet-latest-indexes.sql
# 3. images
for f in *.tar.gz; do gunzip -c "$f" | docker load; done
cd /opt/AMS-open && bash migration/deploy/deploy.sh --prod 2>&1 | tail -8
# 4. consumer-group rule still holds (exactly one member each)
docker exec instrumental-kafka-1 kafka-consumer-groups --bootstrap-server kafka-1:9092 --describe --group traverse-cpa-cplm-results
docker exec instrumental-kafka-1 kafka-consumer-groups --bootstrap-server kafka-1:9092 --describe --group traverse-cpa-cplm-results-frames
# 5. AFTER numbers (section 7); users hard-refresh (Ctrl+F5)
```

**Post-deploy proof:** each fleet endpoint < 100 ms via the gateway; Performance shows the matrix within
1 s of navigation; `EXPLAIN` on the plant shows the two new indexes and no seq scan.

**Rollback:** indexes are additive and can stay. Reverting the `cplm-api` image restores the old
queries (slow but correct). Frontend revert is independent.

**changes_tracker.md entry (template):** `## CHG-023 ✅ CPM fleet reads: latest verdict per loop is
now an index probe, not a whole-table sort` — services: `cplm-api`, `ams-frontend`; ops SQL:
`cpm-04-fleet-latest-indexes.sql`; no Flink change; measured before/after from section 7.

---

## 7. Plant measurement — run before and after

```sql
-- size, growth, and the NULL-diagnosis assumption (expect 0)
SELECT count(*) AS rows, min(window_end), max(window_end),
       pg_size_pretty(pg_total_relation_size('analytics.cplm_gate_results')) AS total_size,
       count(*) FILTER (WHERE diagnosis IS NULL) AS null_diag
FROM analytics.cplm_gate_results;
SELECT window_kind, count(*) FROM analytics.cplm_gate_results GROUP BY 1;
SHOW shared_buffers; SHOW work_mem;
SELECT indexname FROM pg_indexes WHERE schemaname='analytics' AND tablename='cplm_gate_results';
-- the current rankings query, verbatim shape (paste from CpmFleetController.GetRankings, windowKind='24h', limit 50)
EXPLAIN (ANALYZE, BUFFERS) <query>;
```

```bash
# end-to-end via the gateway (token from /api/auth/login)
for p in "fleet/summary" "fleet/rankings?limit=50" "fleet/rankings?limit=12" "fleet/heatmap"; do
  curl -s -o /dev/null -w "$p  %{time_total}s  %{size_download}B\n" \
       -H "Authorization: Bearer $TOKEN" "http://localhost:8081/api/v1/cpm/$p"
done
```

Prometheus (cplm-api is scraped; `prometheus-net` labels by controller/action):

```promql
histogram_quantile(0.95, sum by (le, action)
  (rate(http_request_duration_seconds_bucket{job="cplm-api", controller="CpmFleet"}[5m])))
```

Record the BEFORE set once; the AFTER set is the acceptance evidence for CHG-023.

---

## 8. Implementation status and measured results (2026-09-13, CHG-023, release v6)

Everything below was built, tested and measured on the lab stack with the gate table inflated
to plant scale (361,494 synthetic rows tagged `source = 'perf-synthetic'`, 367k total, 1.85 GB).
BEFORE = the old cplm-api image on that data; AFTER = the final v6 images. Tests: 28 (cplm-api),
4 (historian-bff), 13 (frontend) — all green; lint clean; production build passes.

| ID | Status | Before → after (lab, plant-scale data) |
|---|---|---|
| P0-1 fleet latest-verdict rewrite + indexes | **done** | rankings **HTTP 500 at 30 s** (18 s when it finished) → 57–95 ms miss / 17–31 ms hit; heatmap 500 / 30 s → 67–128 / 32–36 ms; summary 0.8–7.4 s → 18 / 24 ms; Performance mount burst **34.8 s → 0.14 s** |
| P0-2 Performance duplicate rankings request | **done** | 4 → 3 heavy calls per mount and per minute (`useBadActors`, 2 tests) |
| P1-3 single-flight cache | **done** | `FleetReadCache`, 15 s, `X-Cpm-Cache` header, 6 tests; also fronts pipeline-metrics (10 s) |
| P1-4 retention | **prepared, plant decision pending** | `scripts/cpm-05-gate-results-retention-check.sql` (read-only facts) |
| P2-5 script 42 tail | **done** | lab fresh volumes apply all 51 scripts again |
| P2-6 snapshot fan-out | **done** | `?assets=*` 0.37–1.26 s → 37–84 ms; 1,992 dead device names pruned from the lab's `snapshot:devices` (3,282 → 1,290); 4 tests |
| P3-7 nginx gzip | **done** | heatmap 112,059 B → 6,230 B on the wire |
| P3-8 rate limiter Lua | **deferred** | ~1 ms/request; not worth the fail-open/closed risk in this release |

**Found by the other-pages sweep and fixed in the same release:**

| Read (pages) | Before | After |
|---|---:|---:|
| `/calculations` (Calculations, Explorer Relationships, Governance, Replay) — version lookup detoasted every payload | **HTTP 500 at 30 s** (2 of 3), 31 s | 0.37–0.56 s (`created_at` index; observed gates now sampled from the newest 2,000 rows, not the oldest) |
| `/loops` (nine pages) — 1 + 2 queries per loop | 0.44–0.52 s (230 loops) | 0.07–0.18 s (3 queries) |
| `/loops/{id}/gates/latest` (drawer, evidence panel, Explorer, Calculations) | 0.15–0.34 s | 14–143 ms (same two-probe shape) |
| `/pipeline-metrics` (Windows, Pipeline; 20 s poll) — serial Flink walk | 8.65 s cold | 2.19 s cold, 14–24 ms cached |

Fine as they are (measured): events list 20–80 ms, KPI reads 12–120 ms, gate history 44–230 ms
(444 KB, now gzipped), readiness 1.3 s cold then ~0.1 s (F07, Explorer only, deferred),
historian trend 0.7 s cold then 23–70 ms via the gateway cache, asset filters 11–104 ms.

**Deploy:** [migration/V6-DEPLOY.md](migration/V6-DEPLOY.md); tracker entry CHG-023.
