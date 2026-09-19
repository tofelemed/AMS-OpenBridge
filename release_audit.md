# v2.5 release audit — implementation, runtime, performance and design

**Audit date:** 17 September 2026, approximately 22:30–22:55 Asia/Dubai.  
**Source reviewed:** `df2a51d5c040d77ae78ffa974bf1e303713f35ed`.  
**Inputs:** `checklist.md`, `WHATS-NEW-v2.5.md`, the master implementation plan, acceptance evidence, implementation and tests.  
**Decision:** **Not ready for unconditional release sign-off.** Substantial functionality is implemented and the tested read paths work, but release gates remain open and this audit found additional correctness, verification and usability gaps.

## 1. What this audit establishes

The new pages are real implementations, not placeholders. The lab serves the 17-gate catalogue, 165-property configuration catalogue, response events with 52 quantities, instrument health, conditions, immutable method-run evidence and recorded deployment acknowledgements. Frontend tests, selected safe backend tests, static checks and the production frontend build pass.

That does **not** establish that every claimed feature is fully functional under every condition. In particular, fresh ingestion, model review, drafting, shadow execution, approval, deployment, rollback, reconstruction, failure recovery and sustained target load cannot all be exercised without changing application state. Those transitions were inspected in code and compared with historical evidence, rather than rerun against the lab.

The main conclusions are:

1. Keep the existing release hold for replay/reconstruction metaspace and complete the missing release proofs.
2. Correct configuration history, concurrent editing, shadow-read side effects and approval renewal before relying on the governance workflow.
3. Redesign Gate Configuration around a searchable overview and a spacious bundle detail page with task-specific tabs/subpages. The congestion is confirmed by rendered measurements.
4. Improve data selection before adding more frontend optimizations: fetch loop summaries, bundle summaries and selected details; paginate growing histories on the server.
5. The sampled lab is generally responsive, but this audit cannot attribute a performance regression to v2.5 without a comparable pre-release baseline and target-load run.

### Read-only boundary

No application source, configuration, database schema, deployment, simulator feed or release checklist was changed. No process was restarted, paused or killed. No business-data mutation or lifecycle action was intentionally submitted. The one repository deliverable is this file.

Browser/API access used ordinary login and refresh sessions; these naturally produce authentication records, logs and cache/rate-limit activity. Temporary screenshots, measurements and build output were written under `%TEMP%/ams-release-audit-20260917`. These are diagnostic artifacts, not application changes.

The shadow-comparison GET was deliberately avoided after source inspection showed that it can write to the bundle. Database integration suites and the mutation/fault-injection E2E scripts were not run. In particular, `ConfigLifecycleTests` deletes/replaces worker capability records, and other integration tests insert/delete lab rows.

### Evidence terminology

- **Fresh runtime:** observed through the running application/API in this audit.
- **Fresh test:** executed during this audit; scope stated explicitly.
- **Source verified:** implementation inspected; the transition itself was not exercised live.
- **Historical:** recorded by an earlier run; not independently repeated here.
- **Unverified:** evidence is missing or this read-only audit cannot establish the claim.

## 2. Fresh verification results

| Check | Result | What it proves / limitation |
|---|---|---|
| Frontend Vitest, current source, cache disabled | **234/234**, 54 files | Mocked/pure UI behavior, not all live service interactions |
| TypeScript `tsc --noEmit` | **Pass** | Current frontend type checking |
| ESLint, zero-warning threshold | **Pass** | Current frontend lint rules |
| Vite production build, output redirected to temp | **Pass**, 37.33 s | Current frontend bundles successfully; large-chunk warnings remain |
| Gateway unit assembly | **17/17** | Existing compiled tests; simulated Redis behavior, no live outage |
| Ingestion unit assembly, `Category!=Integration` | **211/211** | Existing compiled tests; excluded MQTT-publishing integration test |
| CPLM pure-library test selection | **27/27** | Existing compiled `ConfigLibraryTests`, `PropertyCatalogueTests`, `EvidenceAssemblyTests`, `CapabilityManifestTests` |
| Instrumental simulator schema tests | **17/17** | Schema/scenario validation without publishing |
| Property catalogue `--check` | **Pass**, 165 properties | Generated copies agree; hash starts `8bbcbbbb7da04ddc` |
| Existing rendered UI audit | 18 routes visited, 0 recorded console errors, 0 recorded HTTP failures | One Governance capture was only the startup spinner; route visitation is not itself a pass assertion |
| Performance → G5 cell → inspector → evidence | **Pass**, four flow checks | URL carries selected method-run identity |
| Response → event | **Pass**, two flow checks | Existing event opens via explicit event ID |
| Configuration → recorded active bundle | **Pass**, two flow checks | Recorded bundle and property panels render |
| All 17 gate views | **17/17 rendered**, no page errors or document overflow | Includes explicit missing/not-evaluated states; not 17 successful numerical analyses |
| Additional configuration navigation | **Pass** for single expanded editor, Diff tab, Back restoration, effective view | No save/validate/approve/deploy actions |
| Additional Governance navigation | Heading appeared in **250 / 348 / 489 ms** | Initial spinner was transient; these timings do not prove all inner panels finished |
| Anonymous configuration catalogue read | **401** | Endpoint is not anonymously readable; full role/site isolation matrix remains untested |
| Unknown loop result / nonexistent bundle | **404 / 404** | Sampled missing-resource behavior |
| Evidence manifest conditional read | **200 then 304** | Sampled ETag behavior works |
| Response pagination, limit 1 → next cursor | Two different expected events | Basic pagination works on current data; tied timestamps remain a source-level issue |

The .NET tests were run through `dotnet vstest` against existing assemblies to avoid rebuilding services or touching the lab database. They are **not** a fresh full backend build of HEAD. Flink's Maven suite and the complete database/API integration suite remain historical evidence. The frontend production build was fresh, but was not deployed.

Test output included a duplicate React key warning in the `ConditionsPanel` fixture, Lit development-mode notices, React Router future notices and a Python `RefResolver` deprecation. These did not fail the suites; none should be confused with a production browser crash. The duplicate-key fixture should be corrected and the production identity assumption checked.

### Runtime identity and pipeline snapshot

- Running CPLM API reports source commit **`59f62caa…`**, not audited HEAD `df2a51d5…`.
- Six configuration-announcing engines report one JAR, **`4ea1da78…`**, and matching catalogue hashes. Instrument Context is an observer with zero readable properties; five jobs read configuration.
- The engines report source identity **`3535c78a…-dirty`**. This is a provenance/reproducibility gap, not evidence that the six jobs are running different JARs.
- The live capability response reports **165 catalogue entries, 70 readable property IDs and 78 explicitly unsupported/not-read entries**. Do not advertise this as 165 hot-editable runtime controls; these collections are not an exhaustive simple partition.
- Flink had all six CPLM engines plus Loop Live RBE running, with no duplicate of those job names in the snapshot. Other standing alarm/analysis jobs were also running.
- All seven sampled jobs had a completed latest checkpoint. Latest completion durations ranged **21–620 ms**. Their counters also showed **12–13 restores** and historical failed checkpoints on several jobs. A healthy snapshot does not establish uninterrupted reliability.
- The sampled latest FIC10405 fused window ended at **14:45 UTC**, roughly four hours before the audit, and was `INSUFFICIENT_DATA`. The health example was retained `OFFLINE/LIMITED`, not a newly injected NE107 transition. Existing data is sufficient for read-path testing, not a fresh source-to-verdict latency proof.

## 3. Release-claim reconciliation

| Claim / checklist area | Assessment | Evidence and remaining qualification |
|---|---|---|
| Phase 0: build identity, capabilities, gate catalogue | **Implemented, read path verified; provenance incomplete** | Runtime capability endpoint and 17 catalogue entries work. Dirty engine source identity and differing source/deployment revisions prevent “everything built cleanly from this HEAD” certification |
| 1A–1C: schema 1.1, quality decoding, UNKNOWN semantics, per-role clocks/RBE | **Implemented; fresh unit evidence, historical pipeline proof** | Ingestion tests pass; capability tuple schema is 1.1. No new MQTT samples published, so end-to-end source timing was not reproduced |
| 1D–1F: short/long gates, conditions, fusion v2, availability versus condition | **Implemented; existing results readable** | Conditions and latest gate result read successfully; Events and Investigation render. Fresh detection and recovery transitions were not injected |
| 1G: identity, evidence, replay isolation, retention/reconstruction | **Read side verified; operational release blocker remains** | Immutable workbench flow, artifact views and ETag work. Replay/reconstruction metaspace blocker remains explicitly open; expiry/rebuild/pinning not rerun |
| 1H: Instrumental NE107 | **Implemented; stored health read verified** | Health API returns bound PV and unconfigured VP with distinct semantics; schema tests pass. No fresh F/C/S/M transition or real external publisher validation |
| 2A–2B: G12 analysis and response workspace | **Implemented; existing complete event verified** | Seven non-censored example events and nine censored candidates counted; selected event exposes 52 quantities. A retained VALIDATED event exists. No new hold-out experiment or live model review |
| 2C–2E: exact evidence workbench, historical charts, 17 views | **Implemented; sampled read flow verified** | 17 views render. In the fused sample G0/G2r show NOT RETAINED, G1–G4 SHORT TIER, G12/G13 NOT EVALUATED. Those are valid UI states, not evidence that each method produced complete artifacts in this run |
| 2D: investigations and evidence pins | **Source/historical only for creation** | Investigation page read works; reference creation, outcome changes and pin retention were not executed |
| 2F: G13 interaction | **Implementation present; numerical live claim not re-proven** | G13 view loads but sampled run is NOT EVALUATED; historical 19/19 slice proof cannot be substituted with this rendering result |
| 2G: loop model classification | **Implemented; frontend tests and registry read pass** | No live create/edit to prove propagation of a newly changed model through the engines |
| 3A: generated catalogue and capability checks | **Verified with limitations** | 165 entries/copy parity, six matching workers and 70 readable IDs verified; explicit unsupported capabilities must remain visible |
| 3B–3C: governed lifecycle / PREPARE / APPLY / probe / rollback | **Implementation and retained proof present; new gaps found** | Active bundle has recorded 5/5 PREPARE and 5/5 APPLY ACKs. No fresh lifecycle run; concurrency, read side effects and renewal mismatch below require attention |
| 3D: Gate Configuration UI and effective history | **Partially meets claim** | Table, tabs, typed editor and ACK disclosure exist. Severe congestion persists; “configuration this run used” does not retrieve a past bundle's values |
| 4.1: release manifest and runbook | **Present, not executed** | `migration/deploy/releases/v2.5.txt` contains seven service entries, including gateway. Docs and additive upgrade steps exist |
| 4.2: clean full verification, reliability and load | **Incomplete / inconsistent evidence** | Checklist leaves reliability/load pending; acceptance table states some of those proofs passed; referenced load report is missing |
| 4.2c–g: UI fixes, response speed, gateway resilience | **Many changes confirmed; historical fault proofs not repeated** | Current frontend 234 tests, gateway 17 tests, render measurements support implementation. Redis pause/stop and 40-concurrent outage numbers remain historical |
| 4.3: final bundle and tag | **Still pending per checklist** | No bundle built or release tag created in this audit |

The phrase “all 22 findings closed” describes the prior audit's tracking, not proof that every release behavior is complete. The issues below are additional findings or remaining limitations discovered independently.

## 4. Findings and priorities

Priority **P1** means address before unconditional release sign-off. **P2** means an important functionality, usability or scaling issue. Static findings are explicitly distinguished from runtime reproductions.

### RA-01 — P1: existing replay/reconstruction memory blocker is unresolved

`checklist.md` and `WHATS-NEW-v2.5.md` explicitly retain the TaskManager metaspace blocker: bounded REST-submitted jobs accumulate classloader/metaspace usage, with a prior failure on the second submission at 256 MiB. Raising the limit to 512 MiB is mitigation, not proof of a fix.

Fresh observation: metaspace used **258,216,680 bytes (~246 MiB)** of **512 MiB**; heap used ~409 MiB of 768 MiB. No replay was submitted here, so this snapshot neither reproduces nor clears the leak.

**Recommended exit criterion:** identify/contain the classloader retention and prove repeated replay, shadow and reconstruction jobs at the required workload without monotonic memory accumulation or impact on standing jobs. If isolation is the chosen containment, use a separately budgeted bounded-job pool with enforced concurrency/queue limits and an explicit lifecycle policy. Do not treat a larger memory limit or manual restart as full closure.

### RA-02 — P1: release evidence claims exceed the available proof

`docs/next-release/03-acceptance-evidence.md:76` marks NR-061 as measured and refers to `04-load-report.md`; that file is absent. Rows NR-052 and NR-058 also refer to a reliability run while the checklist says it is pending. The verification table contains older 164/191 totals alongside later 176/234 claims, and an old Phase 2E “not yet on the lab” note survives later deployment statements.

**Recommended action:** reconcile one acceptance record with commit, image/JAR identity, command, timestamp, raw artifact and explicit pass/pending/not-exercised status. Keep the full load and failure gates pending until their artifacts exist. The read-only browser timing in this report is not a replacement for NR-061.

### RA-03 — P1: effective configuration does not honor historical time

**Runtime reproduced:**

`GET /api/v1/cpm/configuration/effective?loopId=FIC10302&at=2000-01-01T00:00:00Z`

returned 200 and the current bundle `717e65b0-0c96-4817-b91c-8296ca788c4d`, effective from **2026-09-17T16:34:12Z**. The requested 2000 timestamp is echoed but does not constrain selection.

Source: `CpmConfigurationController.cs:59` onward calls `ActiveForLoopAsync` without `at`/`regime`; `ConfigStore.cs:61` consults current active pointers. In addition, `EffectiveConfigDrawer.tsx` always loads current effective configuration. When the run hash differs, it correctly warns that the values below are current, but the launching button in `ExplainPanel.tsx` says “Configuration this run used”. It does not retrieve the old bundle's property values.

**Recommended action:** separate “Effective now” from “Used by this run”. Resolve historical values using the immutable run bundle identity; implement genuine effective-time history, or reject unsupported `at`/regime queries clearly. Preserve the existing mismatch warning. Acceptance must include an old run after activation and after rollback, and an instant before the first bundle.

### RA-04 — P1: GET shadow comparison can mutate the bundle

**Source confirmed; endpoint deliberately not exercised.** `CpmConfigurationController.ShadowReport` calls `ShadowComparison.CompareAsync`. At `ShadowComparison.cs:79–85`, changed comparison counts call `SetStateAsync`. `ConfigStore.cs:239–243` writes state/shadow, ETag and updated time.

A user with read permission can therefore cause a persistent update by opening a panel. It can invalidate an editor's ETag. Because the comparison passes the previously read state back into `SetStateAsync`, concurrent lifecycle changes also deserve explicit race protection.

**Recommended action:** compute and persist comparison progress in the run-completion/background workflow with conditional updates; make the GET a pure read. Add a test that repeated reads leave the bundle, revision and timestamps unchanged, including a read overlapping approval/deployment.

### RA-05 — P1: configuration ETag check is not an atomic concurrency guard

**Source confirmed; simultaneous writes were not attempted.** `ConfigStore.PatchAsync` reads a bundle, compares its ETag in application code (`:130`), then updates with `WHERE bundle_id = @id` only (`:165–167`). Two writers can both pass the initial check and the later write can lose the first edit. There is no transaction/row lock spanning the check and update in this method. State checking has the same race shape.

**Recommended action:** conditional database write using expected ETag and allowed state, check affected-row count and return 409 on conflict; coordinate validation/approval/deployment with the same revision discipline. Test two parallel edits from the same revision and an edit racing activation. An ordinary sequential stale-ETag test cannot establish this guarantee.

### RA-06 — P2: approval renewal offered by the UI is rejected by the server

**Source confirmed.** `config/lifecycle.ts` enables Approve for an `APPROVED` bundle whose approval expired, and for `EXPIRED`. `ConfigStore.ApproveAsync` accepts only `VALIDATED` or `SHADOW_EVALUATED` (`:203–204`). The proposed renewal will therefore conflict instead of recovering the workflow.

**Recommended action:** define and share an explicit renewal transition, retaining independent approver and current-hash checks. Test approval expiry → renew → activate through both API and UI. Also align the Shadow action: lifecycle navigation currently enables it for APPROVED, while the shadow form/server allow only validated/shadow-evaluated states.

### RA-07 — P2: bundle lifecycle display can remain stale after deployment advances

**Source-level functional risk.** `useConfig.ts` polls deployment records while in flight, but the bundle/list/effective queries are invalidated when the initial mutation settles, not when asynchronous deployment reaches a terminal state. `staleTime: 10_000` does not schedule a bundle refetch.

An open page can show newer deployment progress beside an older bundle lifecycle/action state until focus, remount or another invalidation refreshes it.

**Recommended action:** when the active deployment changes state/revision, invalidate the associated bundle, scoped list and effective configuration. Keep polling only while needed and on the visible page. Verify a full activation without navigating away or refreshing manually.

### RA-08 — P2: Gate Configuration is congested at real working sizes

**Rendered and measured.** Source: `GateConfigurationWorkspace.tsx`, `PropertyTable.tsx`, `styles/cpm-evidence.css:268–276`.

| Viewport | Property-column width | Observed consequence |
|---|---:|---|
| 1920×1080 | 819 px | G12 centre remains ~1,959 px tall; lifecycle/deployments remain a second long reading track |
| 1600×1000 | 656 px | Long names wrap, minor inner-cell overflow; centre ~2,092 px tall |
| 1366×768 | **546 px** | Actual property table ~512 px wide, internal horizontal overflow, heavily wrapped flags/names; centre ~2,284 px tall |
| 1280×800 | 1,016 px, stacked | Properties start at **y=827**, below the initial viewport; lifecycle begins around y=2,767 |
| 1024×768 | 760 px, stacked | Properties again begin at y=827, below the initial viewport |

At 1366 px, “Show effective” rendered **165 rows** in a **228 px-wide**, **~6,103 px-tall** section below the scope controls. It behaves as an extra sidebar document, not a usable detail drawer.

The chosen site offers approximately 182 loops in an ordinary select (183 options including the placeholder). There is no typed loop search, property search, modified-only filter, commissioning filter or bundle search. All 17 gate buttons compete with the property table. Their `role=tab` buttons do not implement arrow-key tab navigation: ArrowRight from G0 left focus on G0 in the fresh test.

**Recommended action:** implement the page/subpage proposal in §6. No need to reduce font size or shrink controls; those would worsen the operator experience.

### RA-09 — P2: configuration histories use caps, not complete pagination

`ConfigStore.ListAsync` returns full bundle objects, including resolved values/layers/validation/shadow, with **`LIMIT 200`** and no cursor or truncation indicator. The UI renders the returned length as the number of versions. `ConfigApprovalQueue.tsx` fetches this capped, unfiltered list per site and then filters approval states in the browser. Older awaiting-approval work can disappear behind 200 newer unrelated bundles.

Deployment history similarly requests the newest 20 without an older-page control. `ConfigDeploymentService.ListAsync:267` fetches IDs then calls `GetAsync` serially for each, producing database fan-out and returning full ACK detail for collapsed entries.

**Recommended action:** server-side state/scope/search filters, summary projections and stable cursor pagination; filter the approval queue **before** applying its limit. Fetch full bundle/ACK content only for selected records. Batch deployment summary reads. Explain counts as total versus loaded, never equate a cap with completeness.

### RA-10 — P2: response history cursor can skip tied timestamps; model history is capped

`CpmResponseController.List` orders only by `t0_ms DESC` and advances with `t0_ms < cursor`. If multiple events share the timestamp at a page boundary, unreturned peers are excluded from the next page. Basic paging passed on the lab's distinct timestamps; this boundary case was not injected.

`CpmModelsController.List` defaults to 50 models without a next cursor, while the UI presents “Model history”. Its `at` filter constrains creation time but does not reconstruct earlier review state or exclude models superseded before that instant, despite the as-of comment.

**Recommended action:** use a stable composite event cursor such as `(t0_ms,event_id)` and deterministic ordering; paginate model history and either implement revision/effective-interval history or clearly limit the as-of claim. Test same-time events and before/after review/supersession. PostgreSQL explicitly requires predictable unique ordering for reliable limited result sets: [LIMIT and OFFSET](https://www.postgresql.org/docs/17/queries-limit.html).

### RA-11 — P2: evidence polling and expensive panels need more precise lifecycle handling

`useEvidence.ts:28` polls every non-COMPLETE manifest when polling is enabled. The Response workspace passes 15 seconds, so terminal non-complete states can keep polling. The workbench explicitly supplies no interval and provides Refresh instead. Neither is a universal “all pending evidence updates automatically” guarantee.

`useGateArtifacts.ts` decodes every complete artifact of the selected gate immediately. Response renders residuals, candidate models, Bode and model history together; the landing with a selected loop already draws model-history canvases before an event is selected. `chunkSource.ts` usefully bounds its run cache to 24 entries, but not by bytes.

**Recommended action:** poll PENDING/PARTIAL only, with a deadline/backoff and visible-page check; stop on terminal states and invalidate after reconstruction. Mount/fetch/decode expensive sections when selected or visible. Add byte budgets to decoded/binary caches. Preserve checksum verification and exact export data.

### RA-12 — P2: current UI audit scripts can report a successful visit without a ready page

Fresh evidence: the existing audit recorded Governance with **zero headings** and a “Connecting to AMS…” screenshot, but no failed response or console error. It did not assert expected page readiness. `ui-v25-audit.mjs` also catches a fatal error and writes a report without setting a failing exit code; the initial sandbox-blocked browser launch exited 0 with a fatal report. `ui-v25-gates.mjs` calls its metric `firstChartMs` but accepts **either a canvas or a state panel**. A loop without evidence can therefore satisfy its timing selector.

**Recommended action:** assert authenticated route, expected heading, loading completion, and the specific content state; fail the process on missing prerequisites/fatal errors; report chart-ready and empty-state-ready separately. Gate numerical/transition proofs must be separate from render smoke tests. Recheck Governance's inner content, not just its heading, in the final acceptance run.

### RA-13 — P2: historical deployment success is labelled as current activity

Fresh deployment-list response for the active bundle contained three historical deployments, all with `active:true`. `CpmConfigDeploymentsController.Shape` sets this solely from `d.State == "ACTIVE_VERIFIED"`, rather than checking the current active deployment pointer. A successfully verified historical activation is not necessarily the deployment currently governing the scope.

**Recommended action:** expose separate `verified` and `isCurrentDeployment` fields, compare against `cpm.config_active`, and use current activity for action eligibility. Preserve historical ACK/probe success in the timeline. This observation does not imply multiple engine bundles were simultaneously active.

## 5. Performance assessment

### 5.1 Measured browser reads

Existing `ui-v25-pages-perf.mjs`, Chromium, 1600×1400, local lab, existing data. Each step was a fresh document navigation with services/browser caches warmed by the audit. “Ready” means the script's selector appeared, **not** LCP, INP or every chart finishing. API sizes are the script's content-length/body-byte measure, not total compressed transfer including JS/fonts. Each idle observation was **15 seconds**, not a sustained idle-minute or load test.

| Page / state | Ready | API requests | API payload | Idle requests in sampled 15 s |
|---|---:|---:|---:|---:|
| Response landing | 1,088 ms | 5 | 183 KiB | 0 |
| Response loop / events | 971 ms | 6 | 196 KiB | 0 |
| Response event | 1,439 ms | 9 | 239 KiB | 0 |
| Configuration landing | 258 ms | 5 | 340 KiB | 0 |
| Configuration loop scope | 473 ms | 5 | 323 KiB | 0 |
| Configuration active bundle, G0 | 972 ms | 7 | 370 KiB | 0 |
| Configuration active bundle, G12 | 399 ms | 7 | 370 KiB | 0 |

Gate-view probe: **12–13 distinct API method/URL pairs per gate**, readiness **394–2,458 ms**. The chart-bearing G5–G11/G14/G15 views ranged **919–2,458 ms**. G12's 394 ms represented a NOT EVALUATED state, not a completed response chart.

The configuration bundle's API payload included:

| Read | Body bytes | Why it matters |
|---|---:|---|
| Entire loop registry | 181,903 | 230 full loop records for selection/scoping |
| Three bundle versions | 73,468 | Full layers/resolved content for unselected versions |
| Configuration catalogue | 72,664 | Reasonable once per catalogue identity, not per navigation |
| Selected bundle | 24,791 | Much of this was already present in the version list |
| Deployment history | 23,845 | Includes detail for collapsed entries |

Five additional sequential warm GET samples:

- Loop registry: **28–69 ms**, median 56 ms; an earlier read was 988 ms.
- Configuration catalogue: **23–36 ms**, median 30 ms.
- Capabilities: **1,014–1,257 ms**, median 1,058 ms; first sample was 2,325 ms.

Capabilities is the clearest repeatedly slow sampled read. `CpmCapabilitiesController` queries observed engine identities on every call; `GateReadSql.ObservedEngines` extracts/group-bys JSON from the newest 2,000 qualifying rows. This is a source-supported optimization candidate, **not** a measured SQL execution-plan diagnosis. Measure with a read-only plan and service tracing before selecting an index or materialized summary.

### 5.2 Runtime resource pressure

A single `docker stats --no-stream` sample showed:

| Component | CPU sample | Memory sample |
|---|---:|---:|
| Flink job supervisor | 176% | ~140 MiB |
| Flink TaskManager | 168% | ~1.55 GiB |
| Flink JobManager | 20% | ~729 MiB |
| IoTDB | 90% | ~3.56 GiB |
| CPLM API | 2.3% | ~254 MiB |
| Gateway | 0.2% | ~154 MiB |

CPU percentages can exceed 100% because they span cores. This is one instantaneous sample, not a p95 or proof of a new regression.

The supervisor is worth investigating: `infra/docker/flink-job-supervisor.sh:57` launches the Flink Java CLI to list jobs **for each job check**, and `ensure_all` now checks 13 standing jobs. A proposed improvement is one bounded JobManager REST inventory per supervision cycle, reused for all checks, with backoff on errors. Preserve the existing protection against resubmitting jobs that are initializing/restarting and against duplicates. Measure CPU before/after across several cycles.

One initial localhost checkpoint request timed out; bounded retries through 127.0.0.1 succeeded for all seven jobs. Record this as an observation requiring latency tracking, not as a persistent outage.

### 5.3 Optimizations already present — retain them

- Route-level `React.lazy` in `App.tsx`, including all three new workspaces.
- Named vendor chunks; the new build's HTML preloads React, not ECharts/AG Grid/MQTT.
- Evidence manifest batching and per-run binary bundles, with checksum verification.
- Immutable artifact cache keys and a 24-run binary cache cap.
- Window history load-more and Response event server cursor paging.
- Conditional fetching after loop/run/bundle selection in many hooks.
- Shared query caches and cancellation signals on the newer configuration/evidence paths.
- Folded chart data tables/CSV and folded deployment ACK detail.
- ECharts LTTB drawing above 5,000 points; full values retained for export.
- Deployment polling restricted to in-flight states.
- Method-run lookup/reconcile index improvements already present in the source.

The new production build still warns about large chunks: ECharts ~1,052 kB minified / 350 kB gzip, AG Grid ~1,036 / 265 kB, and Designer catalogue renderer ~1,509 / 324 kB. These are lazy/shared assets, not proof they all load on login. ECharts modular imports and lazy heavy panels deserve measurement; increasing the warning threshold is not an optimization.

### 5.4 Recommended optimization order

| Order | Strategy | Concrete proposal | How to verify |
|---|---|---|---|
| 1 | Reduce selection payloads | Site/area/unit facets plus searchable paged loop summaries; fetch full loop only after selection | Selector route never downloads 230 full records; response cancels on changed search/scope |
| 2 | Summary/detail APIs | Bundle list metadata only; one full selected bundle; deployment summaries with ACK detail on demand | Selected configuration page avoids duplicate full-version payloads |
| 3 | Server pagination | 25–50 bundle/event/history records with stable composite cursor and server filters | Page-boundary ties, changing data, Back and direct links do not lose/duplicate records |
| 4 | Fetch by active tab | Load parent only for Diff; shadow only on Shadow; ACKs only on selected deployment; effective properties only on effective view | Network log shows no inactive-tab detail requests |
| 5 | Cache by actual mutability | Static catalogue keyed by hash; capabilities short cache plus worker-change invalidation; mutable bundle revisions invalidated by lifecycle transitions | Current state stays correct while redundant requests fall |
| 6 | Lazy render/decode | Result card/primary chart first, residuals/Bode/history when selected or near viewport | Lower chart count, decode time and long tasks before first useful content |
| 7 | Bound memory | Cache by bytes as well as run count; cap retained infinite-query pages with reversible navigation | Memory stabilizes after navigating many large runs |
| 8 | Fix pathological polling | Pending-only evidence, terminal stop, hidden-tab pause, sensible retry/backoff | Stable COMPLETE/EXPIRED/FAILED screens do not keep querying |
| 9 | Optimize proven backend cost | Trace capabilities; batch deployment queries; one supervisor REST inventory | Compare service p50/p95 and supervisor CPU under same workload |
| 10 | Prove plant capacity | Declared-loop/rate soak, response-event rate, replay concurrency, checkpoint/consumer lag and memory | Publish reproducible NR-061 report at the actual target load |

Do not paginate every small table indiscriminately. A 165-property metadata catalogue is small enough to cache and search locally; most gates have 6–11 properties and G12 has 28. Filtering, a wider table and one editor at a time are more useful there. Server pagination is essential for growing loops, bundles, deployments, events, audit and model history. Virtualization reduces rendered rows; it does not reduce an oversized API response by itself.

Conditional query execution and deferred component loading are separate controls: use both where appropriate. Reference: [TanStack Query enabled queries](https://tanstack.dev/query/v5/docs/framework/react/guides/disabling-queries), [React lazy](https://react.dev/reference/react/lazy). Bound retained history with deliberate forward/back navigation rather than simply accumulating every loaded page: [TanStack infinite queries](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries).

### 5.5 Proposed performance acceptance budget

These are **proposed targets**, not results established by this audit. Agree the test device, network, data volume and concurrency first.

- Warm summary/configuration reads: p95 ≤500 ms; exceptional heavy diagnostics separately budgeted.
- Useful configuration content: p95 ≤1 s warm; first useful evidence/response chart ≤2.5 s on the agreed control-room device.
- Landing/selector API payload: aim below 100 KiB using summaries; measure separately from scripts/fonts.
- Stable read screen: no page-owned periodic calls over a 60-second window unless freshness is explicitly required; authentication refresh is separate.
- No invisible charts/ACK tables fetched merely because their parent page opened.
- No unbounded growth after 100 run/event selections; quantify a browser memory budget with representative evidence sizes.
- Repeat under cold cache, CPU/network throttling and declared plant load; report p50/p95/p99 with sample counts, not only a fastest screenshot.

## 6. Gate Configuration redesign proposal

### 6.1 Design basis

Reviewed the repository's `.claude/skills/uiuxpromax/SKILL.md` and `.claude/skills/openbridge/SKILL.md`. The UI/UX skill's referenced search dataset/script/reference files were not present in that skill folder, so no claim is made that a generated design-system search was completed. Recommendations use the available guidance, the actual React/OpenBridge stack, existing page patterns and measured rendering.

Keep OpenBridge wrappers, icons, typography, semantic colors, day/bright/night themes and appropriate control targets. Reuse `PlantScopeFilter`, `LoopCombobox`, shared headers, query errors and paging conventions. Avoid a new UI library or reducing text/target size to fit more content. New reusable component APIs must be verified in the installed OpenBridge manifest before implementation.

### 6.2 Information architecture

Keep **one primary sidebar entry: Gate Configuration**. Split tasks within that workspace rather than adding many global navigation items.

| Proposed location | Main task | Initial fetch | On-demand content |
|---|---|---|---|
| `/cpm/config` | Find a scope/bundle, see active version and work needing attention | Scope facets + first page of bundle summaries | Loop search results, further pages |
| `/cpm/config/bundles/:id/properties` | Read/edit one version | Bundle + cached catalogue | One property editor |
| `/cpm/config/bundles/:id/diff` | Review changes and affected scope | Selected bundle + parent/diff | Detailed dependency explanation |
| `/cpm/config/bundles/:id/shadow` | Inspect/start isolated comparison | Read-only shadow summary after RA-04 is fixed | Paged changed windows and a separate run action |
| `/cpm/config/bundles/:id/review` | Validate, approve and schedule activation | Validation/approval/current deployment summary | Action dialog and relevant detail |
| `/cpm/config/bundles/:id/deployments` | Follow progress or investigate an attempt | Paged deployment summaries | Selected deployment ACK matrix/probe/errors |
| `/cpm/config/effective?loop=…` | Inspect effective-now configuration | One loop's active identity + selected property group | Full catalogue search and worker detail |
| `/cpm/config/used-by-run/:runId` | Inspect immutable historical configuration | Run identity + exact bundle snapshot | Selected gate's values and provenance |

These can be nested routes or URL-backed tabs; the important change is one primary reading task at a time. Preserve legacy `?site=&scope=&ref=&bundle=&gate=&tab=` deep links through mapping/redirects. Browser Back must restore scope, filters, page/cursor and selected gate.

### 6.3 Overview page

Top toolbar, consistent with other CPM pages:

**Site → Area → Unit | Scope: Site / Profile / Loop | searchable loop/profile picker**

Below it: **Search versions/notes/author | State | Change class | Created date | Clear filters**.

Use a paged bundle table: version, scope, human-readable note, state, author, updated time and current-active marker. Show an explicit total/loaded count. Separate a compact “Active for this scope” summary from the version history. “New draft” opens a focused creation dialog, rather than leaving a permanent note field/button at the bottom of the sidebar.

Do not request all loop bundles when scope=LOOP but no loop has been selected unless the user explicitly chooses an all-loops overview. The current landing does that broad read implicitly.

### 6.4 Bundle detail page

```text
Gate Configuration / HDPE / Loop FIC10302 / Version 4
Draft · 3 changes · 1 validation issue     [Compare] [Next allowed action]

Properties | Diff & impact | Shadow | Review & activation | Deployments

Gate: [G12 — System response v]  Search properties [                 ]
Filters: [Modified] [Needs commissioning] [Invalid] [Readable by build]

Property                 Effective value / unit     Source       Status
Noise multiplier         3                          Factory      Inherited
Capture maximum          600 s                      Loop         Modified
...

Click one row → focused editor beside/over the table, with Save / Cancel
```

Use almost the full workspace width for the properties table. Gate selection can be a searchable dropdown, or a compact collapsible navigator on very wide screens. Do not make 17 wrapped tabs a prerequisite to reading the table. Include gate names, not only G-numbers.

Keep the existing one-expanded-editor behavior, type/unit validation and inheritance semantics. Show a friendly label first with the exact property key accessible for engineers/copying. Filters must display counts and clearly state when unsupported properties are hidden. Unknown/unsupported/commissioning states must remain distinguishable from healthy defaults.

Use one compact lifecycle summary and the next permitted action in the header. Put full approval history, expiry reasons, worker ACKs and deployment timeline in their relevant tabs. Always keep the selected scope, bundle/version, hash, editability and permission blockers visible. Hide future action forms until they are relevant, without hiding why a requested action is blocked.

### 6.5 Responsive and accessible behavior

- At 1366×768, target a main property reading width of roughly 800–1,000 px by removing permanent left/right content columns, subject to actual available space.
- Below the wide layout, use compact scope controls and tabs, not a full scope/history document stacked above the editor.
- Effective configuration opens as a wide detail page/panel. It must not place all 165 rows inside the scope sidebar.
- Implement proper arrow/Home/End/focus behavior if a control declares itself a tablist; otherwise use ordinary navigation semantics.
- Preserve visible labels, keyboard focus and non-color state labels. Audit light/night contrast and 200% zoom explicitly; this audit did not certify WCAG conformance.
- Maintain loading/error/empty states per panel. A slow lifecycle read should not blank a usable property table.
- Preserve unsaved local edits across view changes or require a clear discard decision. Never auto-apply a filter or route change as a save.

### 6.6 Other new pages

**System Response:** retain scope/loop search and the result-first card. Offer event filters for date, event type, path and evaluation/model state. Keep censored candidates counted and opt-in. Use URL-backed sections such as Summary, Diagnostics and Models; fetch model history only when requested, or lazily below the main result. Make the event list collapsible when width is constrained.

**Evidence Workbench:** retain immutable run URLs, the gate strip, clear missing-evidence vocabulary, signal provenance and collapsible explanation. Load offscreen heavy plots/decode on demand. Keep full-resolution CSV separate from sampled drawing. Make “configuration used by this run” resolve exact historical values rather than opening current values under that label.

**Governance:** use a dedicated server-filtered, paged approval queue. Separate initial loading from “nothing awaiting approval”; do not show the empty conclusion before the requests complete. Use the same bundle-detail route for review instead of a second editor.

## 7. Work required before final sign-off

### Release-critical correctness and evidence

- Close RA-01 with repeatable memory/replay evidence.
- Reconcile NR-052/058/061 and publish missing raw evidence/report; refresh stale checklist notes and counts.
- Build final service/JAR artifacts from the selected clean revision and record checksums/image digests; eliminate ambiguous `-dirty` release provenance.
- Correct RA-03 historical configuration, RA-04 GET mutation and RA-05 atomic concurrent editing.
- Resolve approval renewal and asynchronous lifecycle display gaps; exercise them as complete workflows in an isolated writable test environment.
- Complete release packaging/tagging only after those gates pass.

### UX and performance work

- Implement configuration overview/detail routing and the effective-configuration view; reuse existing OpenBridge patterns.
- Add searchable selectors and server-side summary pagination for growing histories.
- Remove unnecessary parent/model/ACK fetches from inactive sections.
- Fix cursor ties and approval-queue filtering before truncation.
- Add state-specific polling, chart/decode/cache budgets and capabilities/supervisor measurements.

### Required writable E2E run, outside this audit

Use an isolated environment or an explicitly authorized lab test window. The next run should cover new OT samples and quality-only changes through Kafka/Flink/API/UI; F/C/S/M and source-loss recovery; a qualifying G12 step followed by a hold-out validation event; qualified G13 peer interaction; two-user configuration draft/validate/shadow/approve/activate/rollback; concurrent edit conflicts; expired approval renewal; missing/NACK/mixed-worker behavior; replay isolation; evidence expiration/reconstruction/pinning; and service/Redis/Postgres/job failures at the declared plant load.

Run the existing slice scripts as appropriate, but assert the content/state of each result, not just HTTP success. Preserve snapshot identities, source-to-result latency, checkpoint/consumer lag, memory/CPU and browser performance. Explicitly distinguish PASS, FAIL and NOT EXERCISED. Do not count an unavailable scenario as a passing E2E test.

## 8. Reproduction and evidence locations

Safe checks executed:

```text
src/frontend-ob: node node_modules/vitest/vitest.mjs run --no-cache --maxWorkers=2 --minWorkers=1
src/frontend-ob: node node_modules/typescript/bin/tsc --noEmit
src/frontend-ob: node node_modules/eslint/bin/eslint.js src --ext ts,tsx --report-unused-disable-directives --max-warnings 0
src/frontend-ob: node node_modules/vite/bin/vite.js build --outDir <TEMP audit directory>/build
python -B scripts/gen-property-catalogue.py --check
python -B -m pytest -q -p no:cacheprovider scripts/sim/test_instrumental_health_sim.py
dotnet vstest <existing gateway unit assembly>
dotnet vstest <existing ingestion unit assembly> --TestCaseFilter:Category!=Integration
dotnet vstest <existing CPLM assembly> --TestCaseFilter:<four pure test classes listed above>
node scripts/validation/ui-v25-audit.mjs                 (OUT_DIR redirected to temp)
node scripts/validation/ui-v25-pages-perf.mjs <temp>      (IDLE_S=15)
node scripts/validation/ui-v25-gates.mjs FIC10405 <run-ids.json> <temp>
docker ps / docker stats --no-stream                    (read-only)
```

Temporary evidence root: `C:/Users/Admin/AppData/Local/Temp/ams-release-audit-20260917/`.

| Artifact | Contents |
|---|---|
| `ui/report.json` and screenshots | 18-route smoke audit and three drill-down flows |
| `perf/pages-perf.json` | Page requests, body sizes, selector-ready timing and idle samples |
| `gates/gates-report.json` | 17 gate states, readiness timings and method-run URLs |
| `api-reads.json`, `api-deep.json` | Sanitized read-response measurements, identity, historical-time reproduction, ACKs, pagination, 304/401/404 checks; no tokens saved |
| `flink-jobs.json`, `flink-tms.json`, `flink-checkpoints.json` | Job and checkpoint snapshots |
| `deep-ui.json`, `config-1366.png`, `config-1280.png`, `effective-1366.png` | Layout dimensions and focused navigation checks |
| `build.log`, `build/` | Fresh production frontend build, not deployed |

The deeper browser probe blocked mutation requests and the shadow-comparison GET; no blocked request was attempted. Its one 401 was the initial unauthenticated refresh before login, not a post-login failure. Temporary evidence may be cleared by the OS; the measured results and limitations are preserved in this report.

**Final assessment:** the release has substantial working functionality and good existing foundations for lazy loading, caching and evidence transport. The current evidence supports a functioning read experience on a small existing lab dataset. It does not justify “everything fully functional, no performance regression, ready to ship.” Correct the identified configuration gaps, finish the release proofs, and use the proposed scope → list → detail navigation to make the new pages usable at normal workstation sizes.
