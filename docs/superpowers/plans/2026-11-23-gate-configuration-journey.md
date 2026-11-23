# Gate Configuration journey (CHG-221) and shadow run fixes (CHG-222) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three-toggle Gate Configuration page with a start page, loop / type / plant pages, a stepped change page,
an Operating regions page and three dialogs, and make "Try on past data" produce a before / after.

**Architecture:** New route shells under `/cpm/config/*` reuse today's hooks (`useConfig.ts`, `useConfigRegions.ts`), API
(`api/cpm/config.ts`, `api/cpm/configRegions.ts`) and step bodies (PropertiesTab, DiffImpactPanel, ShadowComparison,
ApprovalTab, DeploymentsTab), regrouped and cleaned of explanatory text. CHG-222 changes one cplm-api action
(`CpmConfigurationController.Shadow`) plus a pure window planner.

**Tech Stack:** React 18 + TypeScript + Vite, react-router 6, @tanstack/react-query, OpenBridge React wrappers (`ObcButton`),
vitest + Testing Library; .NET 8 cplm-api, xUnit + FluentAssertions, Dapper/Npgsql (lab DB tests via `CPLM_TEST_DB`).

**Spec:** `docs/superpowers/specs/2026-11-23-gate-configuration-journey-design.md` (sample:
`docs/theme/redesign/samples/gate-configuration-journey.html`).

## Global Constraints

- Worktree `D:\HMI_Project_Usama\AMS-open-sr-mine`, branch `feat/sr-mine` (base 10cdee4b). Nothing pushed. A commit only with the owner's OK.
- Files ≤ 400–500 lines. `npm run lint` (`--max-warnings 0`) and `npm run build` clean after every frontend task.
- Every action is an `ObcButton` (or `ReasonedButton` when it can be disabled with a reason); secondary = `variant="normal"`, one `variant="raised"` primary; dialogs use `ui/Dialog` with footer Cancel · primary on the right.
- Tokens / existing `cpm-*` classes only; no raw colours, no new UI library; keep current sizes.
- Text: each fact once; no eyebrow on sub-pages; title never repeats the back link; no generic "Flow controller · FCS0101" lines; no property codes, "verified", workers, PREPARE/APPLY, hashes, ISO on screen; a `?` (`ui/Toggletip`) only beside the heading or step it explains, never between buttons. Level words: `Own settings` (LOOP), `Type settings` (PROFILE), `Plant settings` (SITE), `Factory`.
- Each removed or reworded on-screen text gets a line in `docs/theme/redesign/text-changes.md` (CHG-221).
- Tests against the lab DB: `CPLM_TEST_DB="Host=127.0.0.1;Port=5436;Database=traverse_cplm;Username=ams_user;Password=<POSTGRES_PASSWORD from D:\HMI_Project_Usama\AMS-open\infra\docker\.env>;Timeout=60;Command Timeout=120"`, run `dotnet test` from PowerShell (the Bash tool cannot reach the port); never print the password.
- Frontend tests need `node_modules`: junction `src/frontend-ob/node_modules` → `D:\HMI_Project_Usama\AMS-open-redesign\src\frontend-ob\node_modules` (`cmd /c mklink /J`), remove with `cmd /c rmdir` at the end.
- Do not touch `ConfigStore`, `LoopSettingsService`, `RegionBulkService`, `EffectiveSummary` (CHG-223, cpa updates).

## Review Focus

- A loop with no own settings (runs type or plant settings): loop page shows "Type settings v1" (or "Plant settings" / "Factory"), Versions has no own versions, Change settings still works — test in Task 6.
- Header scope "All sites" with several sites: the Whole plant card and Operating regions ask for a plant instead of guessing one — test in Task 5 and Task 9.
- An old bookmark `/cpm/config?loop=FIC10302&view=editor&bundle=b6&tab=deployments` lands on `/cpm/config/changes/b6?step=deploy` — test in Task 3.
- A settled version (ACTIVE_VERIFIED / SUPERSEDED / ROLLED_BACK) opened from Versions: every step ✓, nothing editable, one reason line — test in Task 8.
- A reader without draft / approve / activate rights: buttons disabled with their reason, no dialog opens — test in Task 6 and Task 8.

---

### Task 1: CHG-222 (a) a shadow run is always linked to its change

**Files:**
- Modify: `src/services/cplm-api/Controllers/CpmConfigurationController.cs:225-252` (`Shadow`)
- Test: `tests/cplm-api.Tests/ShadowRunTests.cs` (new, `[Collection("instrument-bindings-lab")]`, site `e2e-shadow-site`)

**Interfaces:**
- Produces: `ShadowRecomputeStub : DispatchProxy` in the test file (records `StartShadowAsync` args `(loopId, bundleHash, windowOffsetMs, support)`; an optional `Action OnStart`; returns `CplmRecomputeHandle("r1","job1",loopId,Guid,"SHADOW")`; `GetWindowOffsetMsAsync` returns 0).

- [ ] **Step 1: Write the failing test** `A_client_that_gives_up_during_the_submit_still_gets_the_run_linked`: create + validate a LOOP draft (ConfigStore, as `GateDeploymentGapsTests` does), RegistryStub with the loop, `CancellationTokenSource cts`; stub `OnStart = cts.Cancel`; call `controller.Shadow(id, new ShadowRequest(...), cts.Token)`; assert result is `AcceptedResult` and `(await store.GetAsync(id)).Shadow` has `analysisRunId` equal to the stub's handle id and state `SHADOW_EVALUATED`.
- [ ] **Step 2: Run it** — `dotnet test tests/cplm-api.Tests --filter "FullyQualifiedName~ShadowRunTests"` (PowerShell). Expected: FAIL (`OperationCanceledException` / shadow not linked).
- [ ] **Step 3: Implement** in `Shadow`: reads before the submit keep `ct`; `StartShadowAsync`, `SetStateAsync` and the audit use `CancellationToken.None` (comment: the run exists once requested; a client giving up must not orphan it).
- [ ] **Step 4: Run it** — Expected: PASS.

### Task 2: CHG-222 (b) shadow windows end where LIVE windows end

**Files:**
- Create: `src/services/cplm-api/Services/Config/ShadowWindow.cs`
- Modify: `src/services/cplm-api/Services/Config/ShadowComparison.cs` (add the newest-end read), `Controllers/CpmConfigurationController.cs` (`Shadow` uses the plan)
- Test: `tests/cplm-api.Tests/ShadowWindowTests.cs` (pure), `tests/cplm-api.Tests/ShadowRunTests.cs` (+1)
- Records: `changes_tracker.md` (CHG-222 section at the end), `prod_decision.md` (row "Shadow run window" in the Gate Configuration deployments table)

**Interfaces:**
- Produces: `public static ShadowWindow.Plan Plan(DateTimeOffset? newestLiveEnd, DateTimeOffset now, int hours)` with `public sealed record Plan(long FromMs, long ToMs, long OffsetMs, int Days)`; `ShadowComparison.NewestLive24hEndAsync(string loopId, CancellationToken ct) : Task<DateTimeOffset?>`.

- [ ] **Step 1: Write the failing pure tests** in `ShadowWindowTests`:
  - `The_run_ends_on_the_newest_live_end`: newest 2026-11-23T06:00Z, hours 2 → `ToMs` = 06:00, `FromMs` = 22 Nov 06:00, `Days` 1, `OffsetMs` = 6 h in ms.
  - `Hours_round_up_to_whole_days_capped_at_seven`: hours 25 → `Days` 2; hours 500 → `Days` 7.
  - `Without_a_live_end_now_is_floored_to_the_quarter_hour`: newest null, now 06:53:20Z → `ToMs` = 06:45, `OffsetMs` = 6 h 45 m.
  - `The_offset_is_always_inside_a_day`: `0 <= OffsetMs < 86_400_000` for ends at 00:00 and 23:45.
- [ ] **Step 2: Run** `--filter "FullyQualifiedName~ShadowWindowTests"`. Expected: FAIL (type missing).
- [ ] **Step 3: Implement `ShadowWindow.Plan`**: `days = clamp(ceil(hours/24), 1, 7)`; `to = newestLiveEnd ?? floor(now, 15 min)`; `from = to − days·24 h`; `offset = to.ToUnixTimeMilliseconds() mod 86 400 000` (non-negative).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Write the failing lab test** `The_shadow_run_is_planned_on_the_newest_live_24h_window` (ShadowRunTests): insert two LIVE `24h` rows for a unique loop (window_end now−1 d 06:00 and now−0 d 06:00, distinct `bundle_hash`), run `Shadow` with hours 2; assert the stub saw `windowOffsetMs` = 6 h and `support.ToMs` = the newer end, `support.FromMs` = newer end − 24 h. Clean the rows up after.
- [ ] **Step 6: Implement** `NewestLive24hEndAsync`: `SELECT max(window_end) FROM analytics.cplm_gate_results WHERE loop_id = @loopId AND window_kind = '24h' AND purpose = 'LIVE' AND window_end > now() - interval '8 days'` inside a transaction with `SET LOCAL jit = off` (EXPLAIN it on the lab first: must stay well under 1 s). `Shadow` calls it, then `ShadowWindow.Plan(newest, UtcNow, req.Hours ?? 24)`, and passes `plan.OffsetMs` and `new ReplaySupport("iotdb", plan.FromMs, plan.ToMs, ...)`; the stored shadow JSON keeps `fromMs` / `toMs` from the plan. `GetWindowOffsetMsAsync` is no longer called here.
- [ ] **Step 7: Run** `--filter "FullyQualifiedName~ShadowRunTests|FullyQualifiedName~ShadowWindowTests|FullyQualifiedName~GateDeploymentGapsTests"`. Expected: all PASS.
- [ ] **Step 8: Records** — CHG-222 section (why, change, services: cplm-api, no migration, tests) and the prod_decision row ("Shadow run window: ends on the loop's newest LIVE 24 h window end, whole days, at most 7").
- [ ] **Step 9: Commit (owner OK)** — `fix(cplm): CHG-222 shadow runs always linked and aligned to the live 24h windows`.

### Task 3: routes, links and old addresses

**Files:**
- Create: `src/frontend-ob/src/components/Cpm/config/configRoutes.ts`, `configRoutes.test.ts`
- Modify: `src/frontend-ob/src/components/Cpm/cpaHref.ts:130-142` (`configHref`), its test if present (`cpaHref.test.ts`)

**Interfaces:**
- Produces: `CONFIG_BASE = '/cpm/config'`; `loopPath(loopId)`, `typePath(profileId)`, `plantPath(site)`, `regionsPath()`, `changePath(bundleId, step?: ChangeStep)`; `type ChangeStep = 'edit' | 'check' | 'try' | 'approve' | 'deploy'`; `STEP_OF_TAB: Record<ConfigTab, ChangeStep>` (properties→edit, diff→check, shadow→try, approval→approve, deployments→deploy); `legacyTarget(search: URLSearchParams): string | null`; `configHref(...)` keeps its signature and returns the new routes (`bundle` → `changePath`, `loop` → `loopPath`, `scope: 'PROFILE', ref` → `typePath`, `scope: 'SITE'` + `site` → `plantPath`, else `CONFIG_BASE`).

- [ ] **Step 1: Write failing tests**: `legacyTarget(new URLSearchParams('loop=FIC10302&view=editor&bundle=b6&tab=deployments'))` → `/cpm/config/changes/b6?step=deploy`; `'loop=FIC10302&view=bundles'` → `/cpm/config/loops/FIC10302?tab=versions`; `'view=per-loop&batch=x1'` → `/cpm/config/regions?batch=x1`; `''` → `null`; `configHref({ loop: 'FIC10302' })` → `/cpm/config/loops/FIC10302`; `configHref({ bundle: 'b6', tab: 'approval' })` → `/cpm/config/changes/b6?step=approve`; ids are URI-encoded.
- [ ] **Step 2: Run** `npx vitest run src/components/Cpm/config/configRoutes.test.ts` — FAIL.
- [ ] **Step 3: Implement** the builders and `legacyTarget`; rewrite `configHref` on top of them.
- [ ] **Step 4: Run** the test plus `npx vitest run src/components/Cpm/governance src/components/Cpm/registry src/components/Cpm/response` (callers of `configHref`) — PASS (update their expected hrefs where they assert the old shape).

### Task 4: shared pieces — sub-page head, step bar, level words

**Files:**
- Create: `config/SubPageHead.tsx`, `config/StepBar.tsx`, `config/levelWords.ts`, `config/levelWords.test.ts`, `config/StepBar.test.tsx`
- Modify: `src/frontend-ob/src/styles/` CSS file that holds `cpm-config-*` rules (find with `grep -rl "cpm-config-" src/styles`) — add `cpm-config-steps`, `cpm-config-step(--done|--current)`.

**Interfaces:**
- Produces:
  - `SubPageHead: React.FC<{ backHref: string; backLabel: string; title: string; lead?: string | null; pills?: React.ReactNode; actions?: React.ReactNode }>` (layout = `DetailHeader` of `registry/detail`: back link, `h1.cpm-title`, lead, pills row, actions right; no eyebrow).
  - `StepBar: React.FC<{ current: ChangeStep; marks: Record<ChangeStep, 'done' | 'current' | null>; onStep: (s: ChangeStep) => void; help?: Partial<Record<ChangeStep, React.ReactNode>> }>` — labels `Edit`, `Check`, `Try on past data` (+ small "optional"), `Approve`, `Deploy`; a `help[step]` renders a `Toggletip` right after that step's label.
  - `stepMarks(state: string): Record<ChangeStep, 'done'|'current'|null>` (from `tabMarks` via `STEP_OF_TAB`).
  - `levelWord(kind: ScopeKind | 'FACTORY'): string`; `versionLabel(b: { scopeKind: ScopeKind; version: number }): string` → `"Own settings v12"`; `scopeTitle(kind, ref, names): string` → loop id / profile in words (`codeLabel`) / "Whole plant".

- [ ] **Step 1: Write failing tests**: `versionLabel({scopeKind:'LOOP',version:12})` = `Own settings v12`, PROFILE → `Type settings v1`, SITE → `Plant settings v1`; `stepMarks('SHADOW_EVALUATED')` = edit done, check done, try current, approve null, deploy null; `stepMarks('ACTIVE_VERIFIED')` all done; StepBar renders five buttons in order and calls `onStep('approve')` on the fourth; a `help.approve` node renders after "Approve" and not inside the action area.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; `npm run lint`.

### Task 5: start page `/cpm/config`

**Files:**
- Create: `config/ConfigStartPage.tsx`, `config/startPageData.ts`, `config/startPageData.test.ts`, `config/ConfigStartPage.test.tsx`
- Modify: `src/frontend-ob/src/app/AppRoutes.tsx:85` (`/cpm/config` → `ConfigStartPage`, lazy)

**Interfaces:**
- Consumes: `useBundleSummaries` / `listBundleSummaries` (per site, as the old workspace's `progress` did), `useEffectiveSummary`, `useStaleLoops` + `useRegionActions().restack` (useConfigRegions), `useRegions`, `LoopCombobox` (`context/LoopCombobox.tsx`), `legacyTarget`, path builders, `versionLabel`.
- Produces: `changesInProgress(bundles: BundleSummary[]): InProgressRow[]` (states DRAFT, VALIDATED, SHADOW_EVALUATED, REJECTED, APPROVED, EXPIRED, SCHEDULED, PREPARED; newest first; `{ bundle, nextStep: ChangeStep, done: number }`); `runningNow(bundles: BundleSummary[], loops: EffectiveSummaryLoop[]): RunningRow[]` (ACTIVE_VERIFIED, one per scope; SITE first, then PROFILE, then LOOP by id; `loopCount` from the summary).

- [ ] **Step 1: Write failing data tests**: `changesInProgress` drops ACTIVE_VERIFIED / SUPERSEDED / ROLLED_BACK, maps SHADOW_EVALUATED → `nextStep 'approve'`, `done 3`, DRAFT → `'check'`, `done 1`, APPROVED → `'deploy'`; `runningNow` orders SITE, PROFILE, LOOP and counts 47 loops for a profile with 47 summary loops.
- [ ] **Step 2: Write failing page tests** (MemoryRouter at `/cpm/config`, mocked `apiJson` as `PerLoopSettings.test.tsx` does): header has one loop search and "How to read"; picking FIC10302 navigates to `/cpm/config/loops/FIC10302`; four cards; "Continue" on a row goes to `/cpm/config/changes/<id>?step=approve`; the stale notice reads "2 loops don't have the latest plant settings yet" with "Update them"; arriving at `/cpm/config?loop=FIC10302&view=bundles` replaces to `/cpm/config/loops/FIC10302?tab=versions`; with two sites and no header site, "Whole plant" opens a plant choice instead of a page; no element shows "Flow controller".
- [ ] **Step 3: Run** — FAIL. **Step 4: Implement** (cards: title + `Toggletip` + one status line + one normal button; tables in `cpm-surface` cards). **Step 5: Run** — PASS; lint.

### Task 6: loop, type and plant pages

**Files:**
- Create: `config/ConfigScopePage.tsx` (route shell for `/cpm/config/loops/:loopId`, `/types/:profileId`, `/plant/:site`), `config/ValuesInUse.tsx`, `config/VersionsTab.tsx`, `config/RegionTab.tsx`, `config/ConfigScopePage.test.tsx`
- Modify: `AppRoutes.tsx` (three routes), `config/configWords.ts` (friendly setting names: `settingName(property, catalogue)` from the catalogue's label/description, falling back to the code)

**Interfaces:**
- Consumes: `useEffectiveConfig(loopId)` (loop), `useBundleSummaries(site, kind, ref)`, `useConfigCatalogue`, `SubPageHead`, `versionLabel`, `RollbackDialog`, path builders; `EditRegionDialog` and `StartChangeDialog` from Tasks 7 and 9 (render nothing until those exist — wire them in those tasks).
- Produces: `?tab=values|region|versions` (default values; region only on a loop page); `ValuesInUse: React.FC<{ eff: EffectiveConfig; catalogue?: Map<string, CatalogueEntry>; gate: string | null; onGate: (g: string) => void }>` (gate dropdown + find a setting; columns Setting · Value · From; code in `title`); `VersionsTab: React.FC<{ site: string; kind: ScopeKind; ref: string | null; activeBundleId?: string; onOpen: (bundleId: string) => void }>`.

- [ ] **Step 1: Write failing tests**: loop page title `FIC10302`, lead `Reactor feed flow · U1001`, pill `Own settings v12`, pill "v13 waiting for approval" links to `/cpm/config/changes/<v13>`; buttons Open loop ↗, Edit region, Change settings in that order; no "SET UP" eyebrow and no layer strip; a loop running type settings shows pill `Type settings v1` and an empty own-versions list; Versions row click → `changePath(id)`; type page title "Flow, fast self-regulating", no Region tab; reader without `cpm.config.draft` sees Change settings disabled with its reason.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (ValuesInUse = `EffectiveView` without the layer strip, workers box and class pills; `LoopEffective`'s data use kept). **Step 4: Run** — PASS; lint.

### Task 7: start a change dialog

**Files:**
- Create: `config/StartChangeDialog.tsx`, `config/StartChangeDialog.test.tsx`
- Modify: `ConfigScopePage.tsx` (Change settings opens it), delete `DraftBundleDialog.tsx` + its test once nothing imports it (its `startsFrom` / `draftRequest` logic moves here)

**Interfaces:**
- Consumes: `useConfigActions(site).create`, level summaries for LOOP / PROFILE / SITE, `changePath`.
- Produces: `StartChangeDialog: React.FC<{ open: boolean; site: string; loopId?: string; profileId?: string; counts: { type: number; plant: number }; onClose: () => void }>` — options "This loop only" (loop pages), "Every <type> loop", "The whole plant" with loop counts; "Reason" required (Start disabled while empty); Start creates the draft from the version running at the chosen level (parent = its active bundle) and navigates to `changePath(newId, 'edit')`.

- [ ] **Step 1: Failing tests**: three options with counts `1 loop / 47 loops / 177 loops`; Start disabled until a reason is typed; Start posts `createDraft({ site, scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: <active LOOP v12>, note })` and lands on `/cpm/config/changes/<new>?step=edit`; a server refusal shows its message in the dialog.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; lint.

### Task 8: change page with the step bar

**Files:**
- Create: `config/ConfigChangePage.tsx` (route `/cpm/config/changes/:bundleId`), `config/ConfigChangePage.test.tsx`
- Modify: `AppRoutes.tsx`; step bodies cleaned: `DiffImpactPanel.tsx`, `ShadowComparison.tsx`, `ApprovalTab.tsx`, `DeploymentsTab.tsx`, `DeploymentStatus.tsx`, `PropertiesTab.tsx`, `lifecycle.ts` (`ackSummary` → words), `api/cpm/config.ts` (`shadowDraft` with a 120 s timeout); delete `EditorView.tsx` when nothing imports it.

**Interfaces:**
- Consumes: `useBundle`, `useDeployments`, `useConfigActions`, `lifecycleActions`, `bundleApproveRule`, `stepMarks`, `StepBar`, `SubPageHead`, `STEP_OF_TAB`.
- Produces: `?step=` (default = the step the state is on); back link: LOOP → `loopPath(ref)` labelled with the loop id, PROFILE → `typePath`, SITE → `plantPath`; title `versionLabel(b)`; lead `note · author · when`; one state pill (`bundleStateWord`); footer `‹ Back` · `Next` (normal / raised).
- Text changes inside the steps (each logged in text-changes.md): Check shows the change table (Setting · Now · New) and `✓ Valid` / the errors, `Loops n`; Try on past data says "Starting… (about 30 s)" while the POST runs, "Waiting for free capacity" while the run is SUBMITTED for more than 2 min, and "No matching live results to compare" instead of "the loop had no live results over the interval"; Approve shows Change / Applies to / Past 24 h, Note (optional), the rule's label as the primary button, Send back; the approval rule text moves into `StepBar` `help.approve`; Deploy shows one state with "takes effect at <time zone-named>", a `datetime-local` input labelled with the plant zone instead of ISO text, rows "5 of 5 ready" instead of PREPARE/APPLY counts, and Roll back naming the version that will run.

- [ ] **Step 1: Failing tests**: `/cpm/config/changes/v13` for a SHADOW_EVALUATED LOOP bundle shows back link "FIC10302" → `/cpm/config/loops/FIC10302`, title `Own settings v13`, no "SET UP", step bar Edit ✓ Check ✓ Try ✓ Approve current; Next on Check goes to `?step=try`; an ACTIVE_VERIFIED bundle shows every step done, no edit control, one reason line; a viewer without approve rights sees Approve disabled with the reason; the approval rule is inside the step bar's help, not between the buttons; the deploy rows read "ready", never "PREPARE"; a shadow POST in flight shows "Starting".
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; lint; `npx vitest run src/components/Cpm/config`.

### Task 9: operating regions page and the region dialogs

**Files:**
- Create: `config/ConfigRegionsPage.tsx` (route `/cpm/config/regions`), `config/EditRegionDialog.tsx`, `config/EditRegionsDialog.tsx`, tests `ConfigRegionsPage.test.tsx`, `EditRegionDialog.test.tsx`
- Modify: `AppRoutes.tsx`; `ConfigScopePage.tsx` / `RegionTab.tsx` (Edit region opens `EditRegionDialog`); `RegionBatchPanel.tsx` (restyle, words); `regionEdit.ts` (`outsideRange` message "Above the PV range" / "Below the PV range"); delete `PerLoopSettings.tsx` + test when nothing imports it.

**Interfaces:**
- Consumes: `useRegions`, `useBatch`, `useRegionActions` (create / approve / deploy), `approveAction`, `deployAction`, `parseDraft`.
- Produces: `EditRegionsDialog: React.FC<{ open: boolean; site: string; loops: LoopRegion[]; onClose: () => void; onSaved: (batchId: string) => void }>` (columns Loop · PV range · Now · Minimum · Maximum; Reason required; Save posts one batch); `EditRegionDialog` = the same for one loop with the region bar; after Save the regions page shows the batch panel (`?batch=`), the loop page opens the batch's change.

- [ ] **Step 1: Failing tests**: table columns Loop · Type · PV range · Region · From, no generic description lines; selecting two rows enables "Edit regions (2)"; a maximum of 150 on a 0–140 loop shows "Above the PV range" and Save stays enabled only when every row parses; Save posts `{ regions: [...], note }` and the page shows the batch with Approve / Deploy; with two sites and no header site the page asks for a plant; the single-loop dialog shows "Now 90 – 120 · PV range 0 – 200".
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; lint.

### Task 10: remove the old workspace, finish texts, full checks

**Files:**
- Delete: `GateConfigurationWorkspace.tsx`, `EffectiveLoops.tsx`, `BundlesView.tsx`, `BundleVersionPanel.tsx`, `LoopEffective.tsx` and their tests, after `grep -rn` shows no importer outside `config/` (keep `EffectiveConfigDrawer` / `EffectiveView` if other pages use them)
- Modify: `ConfigHowToRead.tsx` (the journey in five short lines), `docs/theme/redesign/text-changes.md`, `changes_tracker.md` (CHG-221 section: services ams-frontend, no migration, tests), `prod_decision.md` (UI rule row only if a setting changed — none expected)

- [ ] **Step 1:** `grep -rn "GateConfigurationWorkspace\|EffectiveLoops\|BundlesView\|PerLoopSettings\|EditorView\|DraftBundleDialog" src/frontend-ob/src` → only the files being deleted.
- [ ] **Step 2:** delete; `npm run lint` → 0 warnings; `npm run build` → success; `npx vitest run` → all pass (report counts).
- [ ] **Step 3:** records + text-changes entries.
- [ ] **Step 4: Commit (owner OK)** — `feat(cpa): CHG-221 Gate Configuration as a guided journey`.
- [ ] **Step 5: Browser round** (owner rule: one round, changed pages only) on the Vite dev server 5174 against the lab gateway: start page, a loop page, start a change, each step, regions page and both dialogs, day and night, widths 1440 / 1000 / 768. `/cpm/config` needs the lab `superadmin`: ask the owner before using that login. Hand the merge to cpa updates (single lab deployer).
