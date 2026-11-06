# CPA reference redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the 17 CPA pages back on their own addresses and sections, and take the reference's structure, flow, navigation and placement of information, keeping our look, sizes, filters and Traverse colours.

**Architecture:** A presentation and navigation change on branch `feat/cpa-redesign`. Pages return to their own routes and sidebar entries, the same addresses the plant uses today. Shared blocks come first (gate dialog, gate tile row, page foot, compact dates, link helpers), then each page changes on top of them, section by section, with a lab rebuild and an owner check after each section. Four small cplm-api additions support Retire, two KPI drill-downs, event filters and values on older windows.

**Tech Stack:** React 18, TypeScript, Vite, react-query, echarts, vitest with testing-library, plain CSS on `--traverse-*` tokens, .NET 8 `cplm-api`, xUnit.

**Spec:** `docs/superpowers/specs/2026-11-06-cpa-structure-and-flow-design.md`, approved by the owner 2026-11-06. **It wins wherever this plan differs.** Reference: `docs/theme/redesign/reference/CPA_Final_Design.html` and `CPA_Implementation_Brief.md` (Task 1 copies them in), for structure and flow only, never for look.

Paths beginning `api/`, `app/`, `components/`, `cpa/`, `hooks/`, `pages/`, `styles/` or `ui/` are under `src/frontend-ob/src/`. Page folders and files with no such prefix (`overview/`, `events/`, `explorer/`, `evidence/`, `CpmReplay.tsx`) are under `src/frontend-ob/src/components/Cpm/`. `scripts/redesign/` is under `src/frontend-ob/`. Paths beginning `src/`, `docs/` or `tests/` start at the repository root. A bare file name that follows a path in the same list sits in that path's folder.

## Owner's decisions (2026-11-06)

| Question | Answer |
|---|---|
| Loop Registry Delete | **Retire, keep history.** Stops monitoring, hides the loop from Overview and Performance, keeps everything browsable, can be undone. The existing hard delete gets no button. |
| Backend scope | **Small cplm-api additions only.** Retire, the Periodic and Capability drill-downs, severity filter and EVT search, values on older windows. Everything else shows an honest "Not available". |
| Review pace | **Section by section.** Lab rebuild and owner check after each section. Corrections carry into the next section. |
| "Device info" | **Build and engine details** (jar and commit ids, worker ids, catalogue hashes, JobManager names) go into a closed `ui/TechnicalDetails.tsx` section. Data source connection fields stay as they are. |
| Lab engine | **Restore it first**, as a separate task, so the owner can judge Overview and Performance with real findings. Task 0. |
| Replay playback | **Left out.** No Play, step or speed. Keep our cursor and add the PV, SP, OP and Mode readout at the cursor. |
| Re-run this window | **Sends the exact window** as a new run and keeps the original. Task 18. |
| Scope of a page the owner called good | Overview and Window Inspector keep their layout and functions; text, links and placement only. Trend gets a loop selector and nothing else. No new function that the spec does not name. |

## Owner's requirements and where they land

| Requirement | Task |
|---|---|
| Sidebar as before: Find problems, Check a loop, Understand the cause, Set up, Engineering, System | 2, 3 |
| Same routing as the SME's HTML, for user flow | 4, Navigation map, 30 |
| Overview: remove extra text; bottom has a clickable top-priority finding and simple recent events | 6 |
| Performance: no extra text; Findings / Gate matrix toggle; clean matrix; a gate opens a dialog, not a side column | 7, 8 |
| Episodes: same columns, details panel and buttons as the reference | 9 |
| Explorer Summary: no loop context; PV, SP, OP, Mode in one row; bigger trend; KPIs then gate results; link to all calculations | 10 |
| Signals, Calculations and History stay in Loop Explorer with a new design | 11 |
| Historical is its own page again; its filters stay; evaluated windows with their info on the right | 12 |
| Investigation returns to Understand the cause: latest result, Why this result, trend, links, proof dialogs | 13, 14 |
| Evidence Workbench: our loop selector, four tabs, all links, styles and dialogs | 15, 16 |
| Evidence Replay: well designed, free of useless text, links in place | 17, 18 |
| Window Inspector: keep ours, remove repetitive text, make it consistent | 19 |
| Calculations: categorised, gate under the name, selected calculation on the right with links | 20 |
| Loop Registry: loop name, VP, loop type; click opens a detail page; edit and delete | 22, 23, 24 |
| Gate Configuration: remove useless text | 25 |
| Trend: loop selector | 26 |
| Pipeline, Governance, Users and the rest: remove useless text and device info, proper links | 27, 28, 29 |
| Colours follow Traverse throughout | Global Constraints, 30 |

## Global Constraints

- Sizes stay exactly as today: font sizes, control heights, row heights, card padding and chart heights. The one exception is the PV, SP, OP, Mode row on Summary, which the owner asked for. New CSS may place things; it may not set a new size. Build from the app's real classes (`.cpm-surface`, `.cpm-kpi`, `.cpm-kpicard`, `.cpm-table`, `obc-button`). The size check in the Section check enforces this.
- Links: one quiet style everywhere, built on `ObcButton` flat, with `→` for the next step in the journey and `↗` for something related. `›` goes.
- Filters stay ours: Site, Area and Unit in the header only, dropdown selects, the `LoopBand` loop control. Never copy the reference's in-page Site, Area and Unit or its chip filters.
- View switches (Findings / Gate matrix, Episodes / Fast conditions, Calculations categories) use `ui/SegmentedControl.tsx`.
- Colours come from `--traverse-*` only, Day and Night. Literal colours stay in `styles/signal-colours.css` and `styles/state-colours.css`. Never take the reference's palette, font or Bright theme.
- Trend pens stay `--signal-*`, exactly as today.
- Gate marks and words come only from `gateMark` and `GATE_LEGEND` in `components/Cpm/gateStatus.ts`; gate names only from `gateName()`.
- Each fact appears once. Explanations go behind a `?` (`ui/Toggletip.tsx`, `variant="how-to"`). Warnings, failure reasons and data states stay on screen.
- No function may be lost, and no prototype limit may be copied: all 19 metrics, all 17 gates, complete lists and paging stay.
- Every KPI keeps a drill-down showing the loops and values behind it.
- Every dialog uses `ui/Dialog.tsx`, with `createPortal` when opened from the sticky band.
- Evidence stays honest: a score is not a probability; retained proof is not sufficiency; missing is never 0; a ratio above 100 % is never "full coverage"; a short window never becomes a 12h verdict; a re-run never replaces the original; signal quality is not instrument health; a review never overwrites the engine's diagnosis.
- Drop everything prototype-only: Design preview footers, Preview data, Evidence basis, "local draft" wording, Reset preview actions, Clear preview reviews, the Contributing check ◇, the "not shown" ·, sample counts.
- Files stay under 400-500 lines. New CSS goes in new files (`styles/cpm.css` is 1,388 lines). Add nothing to `components/Cpm/shared.tsx` (420), `hooks/useCpm.ts` (439) or `api/cpmApi.ts` (611).
- Every view passes with no page overflow at 320, 390, 736, 1024 and 1440 px, in Day and Night.
- Never deploy to the plant. Never `--force`, `--no-verify`, or `reset --hard` on pushed commits. Backup branches and tags stay. Credentials reach a script only as process environment at run time. Every browser walk runs with `docs/theme/tools/lib/guard.mjs`. A manual write on the shared lab needs the owner's approval each time.
- Records: `changes_tracker.md` (next CHG-133), `docs/theme/redesign/decision-ui.md` (next UI-120), `docs/theme/redesign/text-changes.md` for every text cut, `prod_decision.md` when a production setting changes.

## Decisions taken while planning (say if any is wrong)

1. Pages use the plant's addresses (`/cpm/explorer`, `/cpm/historical`, and so on). `/cpm/loop`, `/cpm/setup`, `/cpm/system` and `/cpm/evidence?tab=` never reached the plant, so they only redirect on the lab, and their host pages are removed.
2. "Review" on Overview, Performance and Loop Events opens Investigation. "Review evidence" on Explorer and "Review this window" on Historical open the Workbench. This follows the SME's code.
3. Overview KPI cards keep their drill-down instead of the reference's Performance link: the owner's standing rule.
4. Readiness ("236 valve position expected but not mapped") leaves Overview for Loop Registry, with a "Configuration & coverage →" link, as the brief says.
5. On Loop Explorer the band goes above the tabs, the reference's order. The summary stays on the Summary tab only.
6. Loop detail is its own view at `/cpm/registry?loop=X`, as the owner wrote, not the reference's side panel.
7. Audit log stays one trail on Governance, the owner's earlier decision. The Administration tab holds one line and "Open Governance →".
8. Plant model, Data sources and Tag aliases return to Administration, as the reference has them. This reverses CHG-123.
9. Gate words follow the reference, because the owner said "all style as it shown like pass": Pass, Symptom seen, Strong symptom, Insufficient evidence. The change is in `gateMark` only, and the control engineer reviews it.
10. Our ◇ Ruled out stays. The reference's ◇ Contributing check has no data behind it.
11. Method text follows our engine, not the reference. The reference describes CPLM-020 as "OP travel / corrected error"; the engine computes `stdOp / stdPv`.
12. Next checks are links without tick boxes, because a tick could not be saved.
13. Defaults: Loop Events opens on Open, Historical on 24h, Performance shows 15 rows a page, Loop Events 10.
14. System Settings stops showing invented values and reads "Not connected".

## Staying "Not available" (no backend in this plan)

Audit before/after values, full audit paging, and audit-chain range, count and algorithm; recorded signal quality in Replay (reads "Not recorded", because the historian stores pv, sp, op, vp and mode only); emitted time on windows (shows "Stored", the database write time); a settings service; re-run with current configuration; a reason on loop edits; review outcomes beyond Inconclusive, Work completed and Performance restored.

## Known lab limit

The lab's analysis engine was down on 2026-11-06: JobManager answers "leader election", 0 of 13 jobs, TaskManager 611 restarts, ZooKeeper healthy. Task 0 restores it. Until then new verdicts are not produced: layout, links and stored windows can be proven on lab data, while `LIVE`, a populated Pipeline job list and fresh findings can only be proven with mocked data in unit tests, and the proof must say so.

## Review Focus

1. A link to a window older than the newest 100 rows must open that exact window or say it cannot, never the newest one instead. Test in Task 13.
2. A loop whose newest window is excluded or not evaluated must show that result, with any last verdict labelled as last, never as current. Test in Task 14.
3. A role without a permission sees no entry for that page, gets a disabled button with its reason, and a deep link shows the restricted state. Tests in Tasks 2 and 24.
4. A deep link to a retired or unknown loop must show what it is and keep its history reachable, never a blank page. Test in Task 24.
5. Inspect on a 15m or 4h window never opens Replay, which only knows 12h and 24h. Test in Task 19.

## Navigation map (from the SME's code, every control clicked)

"Context" lists what the link must carry. Dialogs the reference uses as placeholders ("In the final app this opens...") become real navigation.

| From | Action | Goes to | Context |
|---|---|---|---|
| Overview | KPI card | KPI drill-down `/cpm?review=` | scope, 12h/24h |
| Overview | State bar segment | KPI drill-down | scope, 12h/24h |
| Overview | Loop tag, Review X →, Top-priority finding | Investigation | loop, 12h/24h |
| Overview | View all → | Performance, priority order | scope, sort |
| Overview | Event row | Investigation at the event window | loop, window end |
| Overview | All events → | Loop Events | scope |
| Overview | Configuration & coverage → | Loop Registry | none |
| Overview | Calculation basis | Dialog | none |
| Performance | Review ↗, Review X →, matrix result ↗ | Investigation | loop, 12h/24h |
| Performance | Gate chip, matrix cell | Gate dialog, then Review X → or Window Inspector ↗ | loop, 12h/24h, gate |
| Performance | Gate summary tile | Filters the list in place | `fg` |
| Performance | KPI tile | Dialog, then "Show the loops" | scope |
| Performance | How to read →, Calculation basis | Dialogs | none |
| Loop Events | Review X → | Investigation | loop, kind, window end |
| Loop Events | Episode period ↗ | Historical | loop, from, to |
| Loop Events | Shelve…, Full history ↗ | Dialogs | event |
| Fast conditions | Review X → | Loop Explorer Summary | loop, gate |
| Fast conditions | Window Inspector ↗ | Window Inspector | loop, 15m |
| Loop Explorer | Review evidence → | Evidence Workbench | loop, run, window |
| Loop Explorer | Loop model & setup → | Dialog, then Loop Registry →, System Response ↗ | loop |
| Loop Explorer | Historical ↗ | Historical | loop, from, to, kind |
| Loop Explorer | KPI card | Dialog, then Inspect Gn → | loop, gate |
| Loop Explorer | Gate tile | Gate dialog, then Evidence Workbench →, Window Inspector ↗ | loop, run, gate, window |
| Loop Explorer | All calculations → | Calculations tab | loop |
| Signals | Show in trend ↗ | Trend | loop, role |
| Signals | Signal bindings → | Loop Registry detail | loop |
| Calculations tab | Inspect → | Gate dialog | loop, gate |
| Calculations tab | Short windows ↗ | Window Inspector | loop |
| Relationships | Open Loop Registry → | Loop Registry detail | loop |
| History | Open Historical →, row | Historical | loop, from, to, kind |
| Historical | Loop Explorer ↗ | Loop Explorer | loop, from, to, kind |
| Historical | Open in Trend ↗ | Trend | loop, from, to |
| Historical | Review this window → | Evidence Workbench | loop, run, window |
| Historical | Evidence package ↗, Export | Real downloads | loop, range |
| Investigation | Compare windows | Dialog, then Open → | loop, window end |
| Investigation | All 17 gate results → | Dialog, then gate proof | loop, window, gate |
| Investigation | Calculation proof ↗, Open retained proof ↗, Gn proof ↗ | Gate proof dialog, then Evidence Workbench →, Evidence Replay ↗ | loop, run, gate, window |
| Investigation | Evidence Replay ↗ | Evidence Replay | loop, gate, window, kind |
| Investigation | Historical ↗ | Historical | loop, window |
| Investigation | Related events ↗ | Loop Events | loop, event |
| Investigation | Hypothesis comparison ↗, View all measures → | Dialogs | loop, window |
| Evidence Workbench | Back to Investigation ↗ | Investigation | loop, gate, window |
| Evidence Workbench | Evidence Replay ↗ | Evidence Replay | loop, gate, window |
| Evidence Workbench | Reconstruct evidence ↗ | Dialog with the real request | loop, gate, run |
| Evidence Workbench | Run id ↗ | Identity & raw tab | run |
| Evidence Replay | Evidence Workbench ↗, Open retained proof ↗ | Evidence Workbench | loop, run, gate, window |
| Evidence Replay | Run details ↗, Evidence package, Review re-run setup → | Dialogs | loop, window |
| Window Inspector | Pipeline Health ↗ | Pipeline Health | none |
| Window Inspector | Inspect this window → | 12h/24h: Replay. 15m/4h: its own run in the Workbench. No run: Historical | loop, exact bounds |
| Calculations | Back to Investigation ↗ | Investigation | loop, gate, window |
| Calculations | Open Gn proof → | Evidence Workbench | loop, run, gate |
| System Response | Open loop ↗ | Loop Explorer | loop |
| System Response | Review setpoint changes → | Historical | loop |
| System Response | Check G12 settings | Gate Configuration | loop, gate G12 |
| Loop Registry | Row | Loop detail | loop |
| Loop detail | Effective rules ↗ | Gate Configuration | loop |
| Gate Configuration | Open loop ↗ | Loop Explorer | loop |
| Trend | Open loop ↗ | Loop Explorer | loop, from, to |
| Administration | Open Governance → | Governance | none |

## Standard checks

Run from `src/frontend-ob`. All must pass before any commit.

```bash
npx tsc --noEmit        # no output
npm run lint            # exit 0
npx vitest run          # every file passes
npm run build           # "built in"
npm run lint:theme      # "matches 0"
```

## Section check (end of every section)

Run the browser gates with the guard, from `src/frontend-ob` unless shown otherwise, against a local build served by `docs/theme/tools/evidence-preview.mjs`:

```bash
THEME_PHASE=6 node scripts/redesign/check-a11y.mjs        # 0 findings
THEME_PHASE=6 node scripts/redesign/check-redirects.mjs   # 0 failures
THEME_PHASE=6 node scripts/redesign/check-geometry.mjs    # 0 failing
node ../../docs/theme/tools/control-edge.mjs              # 0 off the screen
node ../../docs/theme/tools/link-walk.mjs <out.json>      # 0 problems
node ../../docs/theme/tools/size-check.mjs                # 0 differences from the Task 1 baseline
node ../../docs/theme/tools/control-check.mjs             # every baseline control has a place, or is listed in text-changes.md
```

Then push, tag the running images `pre-s<N>`, build the changed images from the worktree (`docker build -t docker-ams-frontend:redesign-<sha> -f infra/docker/frontend/Dockerfile --build-arg VITE_LOOP_ROOT_PREFIX=root.hdpev2.cpm --build-arg VITE_ENV_LABEL=Lab src/frontend-ob`; for cplm-api `docker build -t docker-cplm-api:redesign-<sha> --build-arg SOURCE_COMMIT=<sha> src/services/cplm-api`), tag them `latest`, and run `docker compose -p docker up -d --no-deps --no-build --force-recreate <services>` in `AMS-open/infra/docker`. Confirm each CPLM consumer group still has one member. Stop for the owner's check. Do not start the next section until the owner has answered.

---

## Before Section 0: lab engine

### Task 0: Restore the lab analysis engine

A lab operation, not a code change. Separate from the redesign and never touches the plant.

- [ ] **Step 1: Find the cause.** Read `docker logs ams-flink-jobmanager` and the TaskManager log. Save the JobManager log to the scratchpad first. Compare with the 2026-10-07 wedged-JobManager case in the memory note `flink-lab-deploy-traps`.
- [ ] **Step 2: Apply the smallest fix for that cause.** For the wedged case: recreate only the JobManager with `docker compose -p docker -f D:\HMI_Project_Usama\AMS-open\infra\docker\docker-compose.yml up -d --no-deps --force-recreate flink-jobmanager`, from PowerShell.
- [ ] **Step 3: Verify.** `curl http://127.0.0.1:8082/jobs/overview` lists 13 RUNNING jobs, TaskManager restart count stops rising, and Overview on `:3000` shows fresh results within a window cycle. Report what the lab cannot show if results stay stale. Do not touch the plant. Do not rebuild the Flink jar.

---

## Section 0: Navigation and shared blocks (CHG-133)

### Task 1: Bring the reference into the repository, and record today's baseline

**Files:**
- Create: `docs/theme/redesign/reference/` holding `CPA_Final_Design.html`, `CPA_Implementation_Brief.md`, `CPA_Design_Manifest.json`, `START_HERE.md` from the owner's package
- Create: `docs/theme/tools/size-check.mjs`, `docs/theme/tools/control-check.mjs`, `docs/theme/redesign/baseline/sizes.json`, `docs/theme/redesign/baseline/controls.json`

**Interfaces:**
- Produces: `node docs/theme/tools/size-check.mjs --capture` writes `sizes.json`; without the flag it compares and exits 1 on a difference. It reads computed `font-size`, `height`, `padding` for `.cpm-surface`, `.cpm-kpi`, `.cpm-kpicard`, `.cpm-table td`, `obc-button` and the page heading on the running app, read-only under `lib/guard.mjs`.
- `control-check.mjs` lists each page's buttons, links, tabs, selects and table heads from `controls.json`, and fails on any that no page now has unless `text-changes.md` names it.

- [ ] **Step 1: Copy the four files** from `C:\Users\Admin\.claude\uploads\474f2c3f-c14a-4911-bf8f-770b6ccad608\344cc1a7-CPA_Final_Package.zip`.
- [ ] **Step 2: Verify.** `sha256sum docs/theme/redesign/reference/CPA_Final_Design.html`. Expected: `c79911b6e3ca8b0fcb981c8b12036a8185ccb60209da6e2bc914a754f8bd1fea`.
- [ ] **Step 3: Capture the baseline from the running build before any page changes.** Credentials only as process environment. Expected: both JSON files hold every page in the Spec's section 3, with `superadmin` for Setup and System.
- [ ] **Step 4: Commit.** `git add docs/theme/redesign/reference docs/theme/redesign/baseline docs/theme/tools && git commit -m "docs(redesign): add the SME reference and today's size and control baseline"`

### Task 2: Sidebar with six groups and 17 entries

**Files:**
- Modify: `cpa/destinations.ts`, `ui/shell/ShellNav.tsx`, `ui/shell/shell.css`, `docs/theme/CPA-UI-SPEC-001-R01.md` (§2.1)
- Test: `cpa/context.test.ts`, create `ui/shell/ShellNav.test.tsx`

**Interfaces:**
- Produces: `type NavGroup = 'Find problems' | 'Check a loop' | 'Understand the cause' | 'Set up' | 'Engineering' | 'System'`; `Destination` gains `group: NavGroup`, `kindParam?: KindParam`, `windowIsEnd?: boolean`. `DESTINATIONS` holds these ids in this order, with these paths: overview `/cpm`, performance `/cpm/performance`, events `/cpm/events`, explorer `/cpm/explorer`, historical `/cpm/historical`, investigation `/cpm/investigation`, workbench `/cpm/evidence`, replay `/cpm/replay`, windows `/cpm/windows`, calculations `/cpm/calculations`, response `/cpm/response`, registry `/cpm/registry`, config `/cpm/config`, trend `/trend`, pipeline `/cpm/pipeline`, administration `/admin`, governance `/cpm/governance`.

- [ ] **Step 1: Write the failing tests.**

```ts
it('lists 17 entries under six headings in the reference order', () => {
  expect(DESTINATIONS.map(d => d.label).slice(0, 5)).toEqual(['Overview', 'Performance', 'Loop Events', 'Loop Explorer', 'Historical']);
  expect([...new Set(DESTINATIONS.map(d => d.group))]).toEqual(['Find problems', 'Check a loop', 'Understand the cause', 'Set up', 'Engineering', 'System']);
  expect(DESTINATIONS).toHaveLength(17);
});
it('hides an entry from a role without its permission', () => {
  const has = (p: string) => p === 'analytics.view';
  expect(visibleDestinations(has).map(d => d.id)).not.toContain('pipeline');
});
it('marks the owning entry for a deep link', () => {
  expect(destinationFor('/admin/users')?.id).toBe('administration');
  expect(destinationFor('/cpm/kpi')?.id).toBe('overview');
});
```

- [ ] **Step 2: Run them.** `npx vitest run src/cpa/context.test.ts src/ui/shell/ShellNav.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Build it.** Each entry's `showTo` equals its route guard in `app/AppRoutes.tsx`. Registry has `carriesLoop: false`, so the sidebar opens the list and not a loop's detail. `ShellNav` renders a group heading before each group, hides headings in rail mode, and gives every entry an `obi-*` icon and the existing tooltip. Update the "seven destinations" text in SPEC §2.1.
- [ ] **Step 4: Run the standard checks.** Expected: all pass, apart from tests Task 3 changes; fix those in Task 3.
- [ ] **Step 5: Commit.** `git commit -m "feat(cpa): sidebar groups and 17 entries from the SME reference"`

### Task 3: Pages stand alone again

**Files:**
- Modify: `cpa/redirects.ts`, `app/AppRoutes.tsx`, `components/Cpm/shared.tsx` (`WorkspaceHeader` loses the hosted branch), `components/Cpm/explorer/LoopWorkspace.tsx` (`OwnPage` becomes the only path), `scripts/redesign/check-redirects.mjs`, `scripts/redesign/check-a11y.mjs`, `scripts/redesign/check-geometry.mjs`, `docs/theme/CPA-UI-SPEC-001-R01.md` (§2.3, which `check-redirects` reads)
- Delete: `pages/cpa/LoopPage.tsx`, `EvidencePage.tsx`, `SetupPage.tsx`, `SystemPage.tsx`, `DestinationHost.tsx` and its test, `AdminTab.tsx`, `cpa/tabEnd.tsx`
- Test: `cpa/context.test.ts`, `pages/cpa/access.test.tsx`, `components/Administration/Administration.landing.test.tsx`

**Interfaces:**
- Produces: `REDIRECTS` keeps `/cpm/kpi`, and adds lab-only rows for `/cpm/loop`, `/cpm/setup`, `/cpm/system` and `/cpm/evidence?tab=` to the own pages. `/admin/audit` keeps redirecting to `/cpm/governance`.

- [ ] **Step 1: Write the failing tests** in `cpa/context.test.ts`.

```ts
it.each([
  ['/cpm/loop', 'tab=historical&loop=A&site=s', '/cpm/historical?loop=A&site=s'],
  ['/cpm/loop', 'tab=diagnosis&loop=A', '/cpm/investigation?loop=A'],
  ['/cpm/loop', 'tab=model&loop=A', '/cpm/response?loop=A'],
  ['/cpm/loop', 'tab=signals&loop=A', '/cpm/explorer?loop=A&tab=Signals'],
  ['/cpm/evidence', 'tab=replay&loop=A', '/cpm/replay?loop=A'],
  ['/cpm/evidence', 'tab=gates&loop=A', '/cpm/evidence?loop=A'],
  ['/cpm/setup', 'tab=configuration&sub=Effective&loop=A', '/cpm/config?loop=A&tab=Effective'],
  ['/cpm/setup', 'tab=tag-aliases', '/admin/aliases'],
  ['/cpm/system', 'tab=settings', '/admin/system'],
])('%s?%s lands on its own page', (path, search, to) => {
  expect(resolveRedirect(path, search)).toBe(to);
});
it('keeps own pages at their address', () => {
  for (const p of ['/cpm/explorer', '/cpm/historical', '/cpm/investigation', '/cpm/replay', '/cpm/windows', '/cpm/calculations', '/cpm/response', '/cpm/registry', '/cpm/config', '/cpm/pipeline', '/cpm/governance', '/admin/users'])
    expect(resolveRedirect(p, 'loop=A')).toBeNull();
});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.** Remove `SHIPPED_PHASE` and the special `/cpm/evidence` default tab. Route `/cpm/loop`, `/cpm/setup` and `/cpm/system` through `LegacyRoute` alone. Governance's route uses the rule of its System tab (`anyOf: ['system.manage', ...ADMIN_PERMISSIONS]`), and its panels keep their own rules. `WorkspaceHeader` always shows eyebrow, title and actions. Update the URLs and counts in the three gate scripts and in SPEC §2.3.
- [ ] **Step 4: Run the standard checks.** Expected: all pass.
- [ ] **Step 5: Commit.** `git commit -m "feat(cpa): every page has its own route and sidebar entry again"`

### Task 4: One set of links that carry the context

**Files:**
- Modify: `components/Cpm/cpaHref.ts`, `components/Cpm/evidence/selection.ts`, `cpa/useContextCarry.ts`, `cpa/tabKind.ts`, `components/Cpm/useWindowKind.ts`, `components/Cpm/CpmCalculations.tsx` (reads `kind` and a window END)
- Test: `components/Cpm/cpaHref.test.ts`, `cpa/context.test.ts`

**Interfaces:**
- Produces, with these exact signatures:

```ts
investigationHref(loop: string, opts?: { kind?: string | null; window?: string | null; gate?: string | null }): string
calculationsHref(loop: string, opts?: { metric?: string | null; kind?: string | null; window?: string | null }): string
historicalHref(loop: string, opts?: { from?: string | null; to?: string | null; kind?: string | null; window?: string | null; focus?: string | null }): string
explorerHref(loop: string, opts?: { tab?: ExplorerTab; gate?: string | null; kind?: string | null; from?: string | null; to?: string | null }): string
workbenchHref(loop: string, run: string, gate?: string | null, opts?: { analysisRun?: string | null }): string
trendHref(loop: string, opts?: { roles?: string[]; from?: string | null; to?: string | null }): string
registryHref(loop?: string | null): string
configHref(opts?: { loop?: string | null; view?: string | null; bundle?: string | null; gate?: string | null }): string
adminHref(section: 'users' | 'roles' | 'data-sources' | 'plant-model' | 'aliases' | 'system'): string
governanceHref(): string
```

- 12h/24h uses `window` on Overview, Performance and Explorer; `kind` on Historical, Replay, Workbench and Calculations; `profile` on Investigation. A window END uses `window` on Historical, Investigation, Replay, Windows and Calculations.

- [ ] **Step 1: Write the failing tests.**

```ts
it('names the window kind in the way each page reads it', () => {
  expect(investigationHref('A', { kind: '24h', window: 'T' })).toBe('/cpm/investigation?loop=A&profile=24h&window=T');
  expect(historicalHref('A', { kind: '24h', window: 'T' })).toBe('/cpm/historical?loop=A&kind=24h&window=T');
  expect(calculationsHref('A', { kind: '24h', window: 'T' })).toBe('/cpm/calculations?loop=A&kind=24h&window=T');
});
it('moving from the sidebar turns one page\'s kind into the next page\'s', () => {
  expect(carriedSearch('/cpm/investigation', '?loop=A&window=24h', '/cpm/explorer')).toContain('profile=24h');
});
it('reads an old ?window=12h on Calculations as a kind, never as a window end', () => {
  expect(chosenKind(new URLSearchParams('window=12h'), 'kind')).toBe('12h');
});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.** Replace the ten literal `/cpm/registry` links and every other hand-built CPA link with these helpers. `useContextCarry` reads `kindParam` and `windowIsEnd` from `Destination`. A window END never travels through the sidebar, only through in-page links. `configHref` moves here from `GateConfigurationWorkspace.tsx`. `loopTrendHref` in `shared.tsx` becomes a re-export of `trendHref`.
- [ ] **Step 4: Run the standard checks.** Expected: all pass.
- [ ] **Step 5: Commit.** `git commit -m "feat(cpa): link helpers carry loop, window, gate and kind"`

### Task 5: Shared blocks and the reference's gate words

**Files:**
- Modify: `components/Cpm/gateStatus.ts`, `components/Cpm/GateLegend.tsx` (add `compact`), `docs/theme/redesign/label-register.md`
- Create: `components/Cpm/blocks/GateTierRow.tsx`, `blocks/GateDialog.tsx`, `blocks/PageFoot.tsx`, `blocks/whenText.ts`, `styles/cpm-blocks.css`
- Test: `components/Cpm/gateStatus.test.ts`, `blocks/GateTierRow.test.tsx`, `blocks/GateDialog.test.tsx`, `blocks/whenText.test.ts`

**Interfaces:**
- Produces:

```ts
fmtWhen(ts: string | number | null | undefined): string           // "5 Nov · 13:45" in the site zone, "—" when empty
GateTierRow: React.FC<{ gates: string[]; tile: (gate: string) => React.ReactNode }>   // one heading per TIER_GROUPS tier
GateDialog: React.FC<{ open: boolean; onClose: () => void; loop: string; gate: string; status: string; flags?: unknown;
  loopResult: string; assessment: string; rows?: Array<{ label: string; value: React.ReactNode }>; actions: React.ReactNode }>
PageFoot: React.FC<{ children: React.ReactNode }>                 // quiet right-aligned links under a page
```

- [ ] **Step 1: Write the failing tests.**

```ts
it('uses the reference words in one place', () => {
  expect(gateMark('PASS').word).toBe('Pass');
  expect(gateMark('SEEN').word).toBe('Symptom seen');
  expect(gateMark('STRONG').word).toBe('Strong symptom');
  expect(gateMark('INSUFFICIENT_EVIDENCE').word).toBe('Insufficient evidence');
});
it('prints a time once, short', () => { expect(fmtWhen('2026-11-05T10:15:00Z')).toMatch(/5 Nov · \d\d:\d\d/); expect(fmtWhen(null)).toBe('—'); });
it('groups gates under their tiers', () => { /* five headings: Eligibility, Performance, Diagnostic evidence, Confirmation, Fusion */ });
it('titles the dialog with loop and gate, and shows status, result and assessment', () => { /* "FIC10301 · G5", "Oscillation (ACF)", "Symptom seen" */ });
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.** Check the status keys above against `gateMark`'s real input before fixing the test values. `GateDialog` uses `ui/Dialog.tsx` in a portal. Tiles and dialogs read `gateName()`, so `Horch oddness` never shows as `Lag asymmetry`. Log the word changes in `text-changes.md` as a control-engineer item.
- [ ] **Step 4: Run the standard checks.** Expected: all pass; update the unit tests that pin the old words.
- [ ] **Step 5: Commit, and run the Section check.** `git commit -m "feat(cpa): CHG-133 gate dialog, tier row, compact dates, reference gate words"`. Owner checks: the sidebar, every page opening at its own address.

---

## Section 1: Find problems (CHG-134 to CHG-136)

### Task 6: Overview

The owner said this page is good. The priority queue and the selected-loop preview keep their design; only their link targets and text change.

**Files:**
- Modify: `components/Cpm/CpmOverview.tsx`, `overview/PriorityQueue.tsx` (link targets only), `overview/LoopFocus.tsx` (link target and label only), `overview/OperatingPicture.tsx`, `overview/StateBar.tsx`
- Create: `overview/TopFinding.tsx`, `overview/RecentEvents.tsx`, `styles/cpm-overview.css`
- Test: `overview/TopFinding.test.tsx`, `overview/RecentEvents.test.tsx`

**Interfaces:**
- Consumes: `investigationHref`, `eventsHref`, `registryHref`, `fmtWhen`, `PageFoot`; `useEventPage` from `events/useEventPage.ts`.

- [ ] **Step 1: Write the failing tests.**

```ts
it('sends the queue tag and Review to Investigation', () => { /* href /cpm/investigation?loop=LIC10501&profile=12h */ });
it('makes the whole top finding one link to Investigation', () => {
  expect(screen.getByRole('link', { name: /LIC10501 · Oscillation confirmed/ }).getAttribute('href')).toBe('/cpm/investigation?loop=LIC10501&profile=12h');
});
it('asks for three recent events in the header scope', () => {
  expect(useEventPage).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 3, sort: 'recent', site: 'hdpe' }), 60_000);
});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.**
  - Keep the title, 12h/24h, ten KPI cards, state bar, priority queue and preview as built. Rename "Every monitored loop, one state each" to "Loop state breakdown". Queue tag and the preview's main button go to Investigation, labelled `Review X →`.
  - Bottom row: top-priority finding as one link; "Recent events" as three plain rows of time, tag, event, and "All events →". `useEventPage` replaces `useCpmEvents`, which ignores the plant scope.
  - Remove: "Operating picture", "Click a segment to filter the loop list", "Priority queue", "· top-priority loop", "Recent context", "heads the queue: …". Behind a `?`: "updated <time>" and the "Medium-criticality loop · High severity…" line.
  - Foot: "Calculation basis" dialog from `basisText(k)`, "Configuration & coverage →". `ReadinessStrip` moves in Task 23.
- [ ] **Step 4: Run the standard checks.** Expected: all pass.
- [ ] **Step 5: Log and commit.** `git commit -m "feat(cpa): CHG-134 Overview, clickable top finding and simple recent events"`

### Task 7: Performance, KPI tiles and gate summary (with two cplm-api keys)

**Files:**
- Modify: `src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs`, `api/cpm/fleetKpis.ts`, `components/Cpm/kpi/kpiMeta.ts`, `kpi/kpiProof.ts`, `kpi/fleetKpiView.ts`, `components/Cpm/GateRollup.tsx`, `components/Cpm/CpmPerformance.tsx`, `performanceHeadline.ts`
- Create: `components/Cpm/performance/PerformanceKpis.tsx`, `styles/cpm-performance.css`
- Test: `tests/cplm-api.Tests/FleetKpiPerformanceKeysTests.cs`, `performance/PerformanceKpis.test.tsx`, `GateRollup.test.tsx`

**Interfaces:**
- Produces: new fleet KPI keys `periodic` and `capability`, listed through `GET fleet/kpis/loops`. `contextText` prints `goodErrorPct` and `errorPctOfSpan` for `kpi = 'assessed'`.

- [ ] **Step 1: Write the failing tests.**

```csharp
[Fact] public void Periodic_counts_oscillation_and_valve_findings_at_detected_or_stronger() { /* matches the "Periodic diagnosis" tile */ }
[Fact] public void Capability_lists_valve_loops_with_vp_expected_but_not_mapped() { /* matches the capability tile */ }
```

```ts
it('opens a tile as a dialog with its basis and the way to its loops', () => { /* "72 of 72 assessed loops contribute", link to /cpm?review=assessed */ });
it('filters the list from a gate tile and keeps the count split in its name', () => { /* click G5 → fg=G5; aria-label holds failed and attention */ });
```

- [ ] **Step 2: Run them.** `dotnet test tests/cplm-api.Tests --filter "FullyQualifiedName~FleetKpiPerformanceKeys"` and the vitest files. Expected: FAIL.
- [ ] **Step 3: Build it.**
  - Tiles read as the reference: Good-error time, Median error, Periodic diagnosis, Diagnostic capability, with its short sub-lines. Each tile opens a dialog, with "Show the loops" to the drill-down.
  - `GateRollup` becomes 17 tiles through `GateTierRow`: count, code, tone from `gateFailureCounts`. A click keeps `?fg=`.
  - Move into tile dialogs: "excluded: 165 stale, 76 never evaluated", "· whole scope, health filter not applied", "valve faults there need an approved test record to be confirmed".
  - Keep the stale line only when data is stale, with its timestamp and Pipeline Health link.
  - Remove: "Calculation pathway", "Gate status by loop". Shorten: "Loops with periodic diagnosis" to "Periodic diagnosis", "Median error (% of span)" to "Median error", "How to read this" to "How to read". `GateGuidePanel` moves into the How to read dialog with `GateLegend`.
- [ ] **Step 4: Run the standard checks, and `dotnet test tests/cplm-api.Tests --filter "Category!=Integration"`.** Expected: all pass. The 12 database tests stay unrun unless the owner agrees, because they insert probe rows in the lab.
- [ ] **Step 5: Log and commit.** `git commit -m "feat(cpa): CHG-135 Performance tiles and gate summary, every KPI has its loops"`

### Task 8: Performance, Findings and Gate matrix

**Files:**
- Modify: `components/Cpm/CpmPerformance.tsx`, `GateMatrix.tsx`, `GateMatrixChecks.tsx`, `GateEvidencePanel.tsx`, `cpaHref.ts` (`performanceHref` gains `sort`)
- Create: `components/Cpm/performance/SelectedLoopBand.tsx`, `performance/MatrixToolbar.tsx`, `performance/loopSort.ts`, `performance/PerformanceGateDialog.tsx`
- Delete: `components/Cpm/AttentionList.tsx`, `useBadActors.ts` and its test
- Test: `GateMatrixChecks.test.tsx`, `GateMatrix.test.tsx`, `performance/loopSort.test.ts`, `performance/PerformanceGateDialog.test.tsx`

**Interfaces:**
- Produces: `type LoopSort = 'evidence' | 'tag' | 'result' | 'error' | 'priority'`; `sortLoops(rows, sort, rank?)`; URL `?sort=`, `?view=` unchanged, `?gate=` opens the dialog.

- [ ] **Step 1: Write the failing tests.**

```ts
it('switches between Findings and Gate matrix with one toggle', () => { /* SegmentedControl, ?view=matrix */ });
it('shows only G codes in the matrix head and a one-line result link', () => { /* no "Data quality" in the head; link to /cpm/investigation */ });
it('opens a gate in a dialog, not a side column', () => { /* click cell: role=dialog named "FIC10301 · G5"; .cpm-matrix-layout--split absent */ });
it('offers Review and Window Inspector in the dialog', () => { /* hrefs carry loop and profile */ });
it('builds check status from gateMark so it agrees with the cell', () => { /* cell word === dialog word */ });
it('keeps every ranking of the old panel in one sort', () => { /* evidence, tag, result, error, priority all order rows */ });
it('labels a last verdict as last, not current', () => { /* "last verdict …" appears only in the band and dialog */ });
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.**
  - Toolbar, one row: Needs attention dropdown, new Any result dropdown from `bandOf(row.diagnosis)`, Any condition, search, sort. Findings / Gate matrix toggle at the head's end.
  - Selected band, above the table: tag, result, evidence score, `Review X →`, "Open loop". With no `?loop=` it shows row 1's result only after a selection, otherwise it stays hidden.
  - Findings: Loop, Result, Checks behind the result ("G5 Symptom seen"), Evidence (`row.confidence`), Review ↗.
  - Matrix: codes only, tier headings, mark cells, one-line result link, no `max-height`. Keep `GateLegend`.
  - Gate dialog: "LOOP · Gn", tier, name, Check status, Loop result, Assessment, `cell.reason`, Review, Window Inspector. The rest of `EvidenceBody` sits under a disclosure; previous and next stay.
  - Delete `ModalEvidence`, `docked`, `DOCK_QUERY`, `.cpm-matrix-layout--split`.
  - Sort `error` and `priority` use `useFleetRankings(scope, kind, sort, 200, true, health)`. Past 200, loops follow by tag.
  - 15 rows a page. Remove: "Opportunity ranking", "Loops needing attention", "driven by", "no gate flagged", "no other check moved this result", "Selected row · latest fused result", "Final diagnosis", "{n} further loop(s) returned by the ranking…".
- [ ] **Step 4: Run the standard checks.** Expected: all pass.
- [ ] **Step 5: Log and commit.** `git commit -m "feat(cpa): CHG-135 Performance toggle, clean matrix, gate opens a dialog"`

### Task 9: Loop Events (with event filters in cplm-api)

**Files:**
- Modify: `src/services/cplm-api/Data/EventPageSql.cs`, `src/services/cplm-api/Controllers/CpmEventPageController.cs`, `api/cpm/eventPage.ts`, `components/Cpm/CpmEvents.tsx`, `events/EventDetail.tsx`, `events/ConditionsPanel.tsx`, `events/EpisodeNotes.tsx`, `events/shelfState.ts`
- Create: `events/EpisodeList.tsx`, `events/EpisodeActivity.tsx`, `events/ConditionDetail.tsx`, `styles/cpm-episodes.css`
- Test: `tests/cplm-api.Tests/EventPageFilterTests.cs`, `CpmEvents.page.test.tsx`, `events/EventDetail.test.tsx`, `events/ConditionsPanel.test.tsx`

**Interfaces:**
- Produces: `GET /api/v1/cpm/events/page` accepts `severity`, searches EVT ids, and returns `support_until`.
- Consumes: `investigationHref` with `window`, `historicalHref`, `useCreateLoopNote`.

- [ ] **Step 1: Write the failing tests.**

```csharp
[Fact] public void Severity_filter_returns_only_that_severity() { }
[Fact] public void Search_matches_an_event_id() { /* "EVT-16905" and "16905" */ }
```

```ts
it('shows Loop / peak diagnosis, Severity, Review and Opened', () => { /* column headers exactly, tag first in the row */ });
it('opens on Open episodes', () => { /* default filter open, heading "Open episodes" */ });
it('sends Review to Investigation at the episode window', () => { /* href has loop, profile, window=<opened_at> */ });
it('shows peak evidence, qualified support and non-overlap windows as one strip', () => { /* 100, 9.9 h, 1 */ });
it('prints — for qualified support on a pre-v2.5 row', () => { /* 0 → '—' */ });
it('switches to Fast conditions by toggle, and selects a condition', () => { /* ?view=conditions&condition= */ });
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.**
  - Header: Episodes | Fast conditions toggle, with counts. `/conditions` asks for `limit=2000`, so "N open" is not capped at 200.
  - Filters stay ours, one row: state dropdown with counts, new All severity dropdown, Triage / Newest, Find.
  - List: Loop / peak diagnosis (tag, diagnosis, EVT · 12h), Severity, Review (ack pill and "Open · Unobservable"), Opened (time, date). 10 rows. `SortHeader` goes as a second copy of the order dropdown.
  - Detail: "EVT-n · Episode details", tag, severity, "Peak · …", latest diagnosis when it differs, full-width `Review X →`; Condition, Availability, Review, Shelf grid; the strip; period row with Episode period ↗; note, Acknowledge, Shelve…, Save note; Unshelve appears only with a shelf; Activity & notes timeline with Full history ↗ dialog; Technical details through `ui/TechnicalDetails.tsx`.
  - Fast conditions: list and `ConditionDetail` with Review and Window Inspector ↗.
  - Remove: "What happened", "Episode", "Evidence", "Provenance", "Operator state", "Review and shelf", "Loop notes", "Notes on EVT-n", "No loop note is linked to this episode.", "The {family} family was reported across…", "Fast conditions · G10 limit dwell / G11 freeze". Behind a `?`: "Still open: the newest window could not be judged…", "This episode has closed but was never acknowledged…".
  - Review opens the episode's opening window (`opened_at`). When that window has aged out, Investigation says so and offers the newest (Task 13). Overview event rows do the same.
  - Deep links use `eventsHref({ event, filter: 'all' })`. Filter logic lives only in `shelfState`; do not use the older copy in `eventsState.ts`.
- [ ] **Step 4: Run the standard checks and the cplm-api logic tests.** Expected: all pass.
- [ ] **Step 5: Log, commit, and run the Section check.** `git commit -m "feat(cpa): CHG-136 Loop Events as the reference, severity filter and EVT search"`. Services: `ams-frontend`, `cplm-api`. Owner checks Overview, Performance and Loop Events.

---

## Section 2: Check a loop (CHG-137 to CHG-139)

### Task 10: Loop Explorer shell and Summary

**Files:**
- Modify: `components/Cpm/CpmExplorer.tsx`, `explorer/LoopWorkspace.tsx`, `explorer/SummaryTab.tsx`, `explorer/summary/LoopSummaryRow.tsx`, `explorer/summary/OperatingState.tsx`, `explorer/summary/LoopTrendPanel.tsx`, `explorer/summary/LoopKpiCards.tsx`, `explorer/summary/SummaryGateStrip.tsx`, `explorer/summary/SummaryGateDetail.tsx`, `explorer/LoopModelCard.tsx`, `kpi/KpiCard.tsx`, `kpi/loopKpiView.ts`
- Create: `explorer/summary/SignalStrip.tsx`, `explorer/summary/LoopKpiDialog.tsx`, `styles/cpm-explorer.css`
- Test: `explorer/summary/LoopSummaryRow.test.tsx`, `explorer/summary/SignalStrip.test.tsx`, `explorer/summary/LoopKpiDialog.test.tsx`, `explorer/summary/SummaryGateStrip.test.tsx`

**Interfaces:**
- Consumes: `LoopBand`, `GateTierRow`, `GateDialog`, `workbenchExit`, `windowsHref`, `historicalHref`.
- Produces: `SignalStrip: React.FC<{ loop: CpmLoop }>`, used again by Task 14; `persistingText(openedAt: string | null, now: number): string` in `overview/priorityReason.ts`, used again by Task 14; `kpi/loopKpiView.ts` card objects gain `gate: string`.

- [ ] **Step 1: Write the failing tests.**

```ts
it('shows — when no episode of this window kind is open', () => { /* persistingText(null, now) → '—', never 0 */ });
it('shows the assessment in the band on Summary only', () => { /* result, "13 % in band · persisting 11 h · evidence score 100", Review evidence →, Open details */ });
it('keeps age and blocking count in the band', () => { /* a stale or blocked loop cannot look fine */ });
it('shows PV, SP, OP and Mode in one row with signal quality', () => { /* one row, no four cards */ });
it('opens a KPI as a dialog with its meaning and Inspect Gn →', () => { /* Good-error time → Inspect G3 */ });
it('opens a gate tile as a dialog with Evidence Workbench → and Window Inspector ↗', () => { /* hrefs keep loop, run, window */ });
it('has no Loop model column on Summary', () => { /* Loop model & setup → opens a dialog */ });
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.**
  - Order: header (Check a loop, Loop Explorer, 12h/24h), `LoopBand`, tabs, content.
  - Band on Summary: loop control, `Latest 12h · <window end>`, bold result, the fact line, age and blocking tags, `Review evidence →`, quiet `Open details`.
  - `SignalStrip` from `OperatingState` values above the trend, as small cards in one row. This is the only size change. Keep `No live publisher` and one stored age.
  - Trend: the same chart, height and controls as today. It gains width only, because `cpm-grid-2` goes. `Open in Historical ›` reads `Historical ↗`.
  - Loop KPIs: nine cards in three groups; a card click opens `LoopKpiDialog`; the coverage card gains its bar; `not measured in this window` appears once, not on each card.
  - Gate results: `GateTierRow` tiles, mark over key, word in `aria-label`; short key plus Full key dialog; "All calculations →" switches tab.
  - Loop model moves to a dialog from "Loop model & setup →", with Loop Registry → and System Response ↗; its Workbench button goes as a copy of Review evidence.
  - Remove: `Operating state`, `from historian`, `closed loop · analysed`, `Not an evaluated window`, the three `cpm-eval-note` sentences, `How this loop performs`, `rule ≥ 95 %`, `G3 not evaluated`, `Long and short windows`, `Show calculations ›`, `Context`, `PRESET`.
- [ ] **Step 4: Run the standard checks.** Expected: all pass.
- [ ] **Step 5: Log and commit.** `git commit -m "feat(cpa): CHG-137 Loop Explorer Summary, one signal row, bigger trend"`

### Task 11: Loop Explorer tabs

**Files:**
- Modify: `explorer/SignalsTab.tsx`, `explorer/CalculationsTab.tsx`, `explorer/RelationshipsTab.tsx`, `explorer/HistoryTab.tsx`, `explorer/LoopWorkspace.tsx`, `explorer/loopTabOf.ts`
- Test: `explorer/SignalsTab.test.tsx`, `explorer/CalculationsTab.test.tsx`, `explorer/HistoryTab.test.tsx`

**Interfaces:**
- Consumes: `trendHref`, `registryHref`, `windowsHref`, `calculationsHref`, `eventsHref`, `historicalHref`, `GateDialog`.

- [ ] **Step 1: Write the failing tests.**

```ts
it('lists tabs Summary, Signals, Calculations, Relationships, History', () => {});
it('shows signal, value, unit and Show in trend ↗', () => { /* UNS path stays as a second line */ });
it('uses gateMark words on the gate table, the same as the Summary tiles', () => { /* no "Warning" for a seen symptom */ });
it('opens a gate from Inspect → in the gate dialog, keeping loop and window', () => {});
it('lists episodes with period, finding, windows, peak score and state, with links', () => { /* row → Historical, event → Loop Events */ });
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.**
  - Relationships becomes its own tab with a count. Each linked loop opens that loop's Relationships tab. Lineage goes in a closed disclosure.
  - Signals: table with value and unit from the `SignalStrip` hook; keep binding state and extra roles; foot with signal quality, Signal bindings →, Open signals in Trend ›.
  - Calculations: gate table with Inspect →; the long metrics move here from `SummaryCalculations`; Short windows ↗; Full catalogue →. The short-window select goes as a copy of Window Inspector.
  - History: keep run grouping, `END BEFORE START` and the pager; add links.
  - Remove: `Signal mappings`, `4 role(s) mapped`, `Latest fused window`, `Gate outcomes`, `Short features (G0–G4)`. Behind a `?`: `Peer topology (G13)`, `Create asset relationships, then republish evidence — G13 cannot evaluate without them.`
- [ ] **Step 4: Run the standard checks.** Expected: all pass.
- [ ] **Step 5: Log and commit.** `git commit -m "feat(cpa): CHG-138 Explorer Signals, Calculations, Relationships, History"`

### Task 12: Historical (with older-window values in cplm-api)

**Files:**
- Modify: `src/services/cplm-api/Data/GateMatrixProjection.cs`, `api/cpm/gates.ts` (`getWindowSummaries` gains a `from` option), `components/Cpm/CpmHistorical.tsx`, `historical/chartOption.ts`, `historical/RangeToolbar.tsx`, `historical/SelectedWindowPanel.tsx`
- Create: `historical/EvaluatedWindows.tsx`, `historical/lanes.ts`, `historical/useWindowKpis.ts`, `styles/cpm-historical.css`
- Test: `tests/cplm-api.Tests/GateMatrixSummaryTests.cs`, `historical/lanes.test.ts`, `historical/EvaluatedWindows.test.tsx`, `historical/SelectedWindowPanel.test.tsx`

**Interfaces:**
- Produces: window summaries keep `good_error_pct`, `auto_pct`, `mae`, `saturation_pct`; `resultMarkers(rows, range)` in `lanes.ts` places a marker at the window END and returns the selected window's span.

- [ ] **Step 1: Write the failing tests.**

```csharp
[Fact] public void Summary_keeps_the_four_window_metrics() { }
```

```ts
it('marks a result at its window end, not across its whole window', () => { /* 15-minute rows do not overlap */ });
it('selects the same window from the list and the Result lane', () => { /* both write ?window= */ });
it('shows Window ending, Result, Mode and In band', () => {});
it('shows four KPIs, Review this window → and Fit to this window on the right', () => { /* Fit keeps ?window= */ });
it('labels a missing in-band value, never 0', () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.**
  - Header and band filters stay: range dropdown, dates button, Export; default 24h. Add Loop Explorer ↗ in the band's end.
  - Pens, Normalise, Overlay, Open in Trend stay in `RangeToolbar`. VP note uses `inputContextOf`, so not mapped and not applicable differ.
  - Chart: labels `Mode` and `Result`, text in mode bands, selected window shaded by default. No-fault is green in this lane only. Health lane stays.
  - Foot: zoom, Undo, Reset, "96 results · 12h rolling windows", Result key dialog. `Apply zoom to range ›` stays.
  - Evaluated windows on the left and the selected window on the right, with `ui/DataTable.tsx` and `ui/forms/Pagination.tsx`.
  - Right panel: result, period, four KPIs, Review this window →, Replay, Fit to this window, Evidence package ↗, Evidence score, About score. Samples and Calculation go in `ui/TechnicalDetails.tsx`.
  - `useGateHistory` requests up to 500 windows. Log the fact that full rows live 14 days, and that summaries now reach older ranges.
  - Remove: `One time axis`, `Signals, overlay, mode and verdict`, `historian series at …`, `(Historian series: …)`, `Selected period`, `Click a verdict band…`, `No CMMS integration configured…`, `Zoomed view only…`. Failure captions stay visible.
  - `CpmHistorical.tsx` is 408 lines: lanes, list and captions move out so it shrinks.
- [ ] **Step 4: Run the standard checks and the cplm-api logic tests.** Expected: all pass.
- [ ] **Step 5: Log, commit, and run the Section check.** `git commit -m "feat(cpa): CHG-139 Historical, evaluated windows and selected window panel"`. Tell the SME the Result lane now marks window ends. Services: `ams-frontend`, `cplm-api`.

---

## Section 3: Understand the cause (CHG-140 to CHG-145)

### Task 13: One window on every page

**Files:**
- Create: `components/Cpm/evidence/useFusedRow.ts`, `components/Cpm/evidence/useWindowAt.ts`
- Modify: `components/Cpm/CpmInvestigation.tsx`, `CpmReplay.tsx`, `evidence/ExplainWhy.tsx`, `config/EffectiveConfigDrawer.tsx`
- Test: `evidence/useWindowAt.test.tsx`, `evidence/useFusedRow.test.tsx`

**Interfaces:**
- Produces: `useWindowAt(loop: string, kind: string, end: string | null)` returns the exact row by comparing instants, reading by `from` and `to` when it is outside the loaded list, or `{ notFound: true }`; `useFusedRow(loop, run)` matches on `analysisRun`.

- [ ] **Step 1: Write the failing tests.**

```ts
it('finds a window older than the newest 100', () => { /* reads by from/to, returns that row */ });
it('compares instants, not strings', () => { /* 2026-10-05T12:30:00Z equals 2026-10-05T12:30:00.000Z */ });
it('says not found and never returns the newest', () => {});
it('prefers the original over a re-run with the same end', () => { /* rows with metadata.replayId come second and are labelled */ });
it('reads the row of the pinned run, not the live row', () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.** Lists use `useEvidenceWindows`, so Gates, Replay and Investigation agree. `EffectiveConfigDrawer` passes `at` from the run's window, so "Configuration this run used" stops showing today's values.
- [ ] **Step 4: Run the standard checks.** Expected: all pass.
- [ ] **Step 5: Commit.** `git commit -m "fix(cpa): CHG-140 every evidence page reads the same exact window"`

### Task 14: Investigation

**Files:**
- Modify: `components/Cpm/CpmInvestigation.tsx`, `investigation/LoopNotes.tsx`, `investigation/WindowBrowser.tsx`, `investigation/CaseTriage.tsx`, `investigation/KeyFactsPanel.tsx`, `investigation/HypothesisPanel.tsx`
- Create: `investigation/InvestigationHero.tsx`, `investigation/heroFacts.ts`, `investigation/WhyResult.tsx`, `investigation/gateGroups.ts`, `investigation/NextChecks.tsx`, `investigation/nextChecks.ts`, `investigation/GateProofDialog.tsx`, `investigation/AllGatesDialog.tsx`, `styles/cpm-investigation.css`
- Test: `investigation/heroFacts.test.ts`, `investigation/gateGroups.test.ts`, `investigation/GateProofDialog.test.tsx`, `investigation/nextChecks.test.ts`

**Interfaces:**
- Consumes: `useWindowAt`, `SignalStrip`, `persistingText`, `nextCheckOf`, `conditionOf`, `leadingCauseOf`, `workbenchHref`, `replayHref`, `historicalHref`, `eventsHref`.
- Produces: `heroFacts(matrix, episode): Array<{ value: string; label: string }>`; `gateGroups(matrix): Array<{ tier: string; summary: string; gates: string[] }>`.

- [ ] **Step 1: Write the failing tests.**

```ts
it('shows good-error time, persisting and evidence score for a finding', () => { /* '13 %', '11 h', '100' */ });
it('shows normal-mode, time at OP limit and data coverage for an excluded window', () => { /* reads auto_pct, saturation_pct, completeness directly */ });
it('shows No open episode, never 0', () => {});
it('never shows a last verdict as the current result', () => { /* not-evaluated window: title stays "Not evaluated: not enough data" */ });
it('summarises each tier for Why this result', () => { /* 'G1 · Excluded', 'G3 attention · G4 pass', 'G10 limit symptom' */ });
it('opens Calculation proof as a dialog with values and two buttons', () => { /* Evidence Workbench →, Evidence Replay ↗, loop, window, status */ });
it('disables Workbench with its reason when a row has no run id', () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.**
  - Header: Understand the cause, Investigation, Compare windows, 12h/24h. Band: loop control, `EvidenceWindowSelect`; Case goes under More; window choice replaces Live / Historical.
  - Hero: window label, title, Cause, Engine severity, three facts; "Next check" bar from `narrative.recommendation` with `nextCheckOf()` as fallback, and Start with evidence ↓.
  - Why this result: five cards; the selected card fills the right panel with its gates (expand for detail), Calculation proof ↗, and a limits box ("Limits on this conclusion" or "What is still unconfirmed").
  - Left: `SignalStrip` values at window end, trend, Undo, Full window, Engineering range, Evidence Replay ↗. `HealthLane` sits beneath.
  - Next checks (links only, chosen by condition) and Numeric evidence (one headline value, View all measures → dialog with `KeyFacts`).
  - Record your review: `LoopNotes` with title and button props, keeping attach, acknowledge and the note list; side links Hypothesis comparison ↗, Related events ↗.
  - Technical details & engine trace: `EngineTrace`, family, disqualifiers, G14, reason rows.
  - Dialogs: `GateProofDialog`, `AllGatesDialog`, Compare windows (wraps `WindowBrowser`'s comparison), Hypothesis comparison, Numeric evidence, Mode context.
  - Remove: "FINAL CONCLUSION", "KEY FACTS", "EVIDENCE", "WINDOW BROWSER", "RECORD IT", the "no verdict" pill, "Reason —", "Eligibility → Evidence → Fusion · fused cleanly". Behind a `?`: the evidence-score paragraph, "(NE107: missing diagnostics are not OK)".
- [ ] **Step 4: Run the standard checks.** Expected: all pass.
- [ ] **Step 5: Log and commit.** `git commit -m "feat(cpa): CHG-141 Investigation, latest result, why, proof dialogs"`

### Task 15: Evidence Workbench, rail and run bar

**Files:**
- Modify: `evidence/GateEvidenceWorkspace.tsx`, `evidence/GateChipStrip.tsx`, `evidence/verdictCopy.ts`, `components/Cpm/context/LoopBand.tsx` usage
- Create: `evidence/GateRail.tsx`, `evidence/RunSummaryBar.tsx`, `evidence/ReconstructDialog.tsx`, `styles/cpm-workbench.css`
- Delete: `evidence/EvidenceHeaderStrip.tsx`
- Test: `evidence/GateRail.test.tsx`, `evidence/RunSummaryBar.test.tsx`, `evidence/ReconstructDialog.test.tsx`, `evidence/GateEvidenceWorkspace.test.tsx`

**Interfaces:**
- Consumes: `chipsOf`, `buildTierGroups`, `gateMark`, `workbenchHref`, `investigationHref`, `replayHref`.
- Produces: `GateRail: React.FC<{ chips: GateChip[]; selected: string; onSelect: (gate: string) => void }>`.

- [ ] **Step 1: Write the failing tests.**

```ts
it('lists gates by tier with code, name and mark', () => { /* G3 Base performance ! */ });
it('moves with Up and Down, and shows a native picker on a narrow screen', () => {});
it('states proof retained separately from sufficiency', () => { /* "Proof retained · COMPLETE", "Pinned run" */ });
it('asks in a dialog before reconstructing, then shows the real request state', () => { /* loop, gate, window, run; POST only on confirm */ });
it('disables Reconstruct with a reason without cpm.analysis.create', () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.**
  - Header: Understand the cause, Evidence Workbench, Back to Investigation ↗. Band: loop control, `EvidenceWindowSelect`, Newest, older and newer; kind, jump and Evaluate stay under `EvidenceMore`.
  - `RunSummaryBar`: Proof retained state, `12h pinned run`, samples, Calc version, Loop result, Run id ↗, Reconstruct evidence ↗.
  - Left rail `GateRail` with Key dialog; a native `select` with optgroups below 850 px. Replaces `GateMenu`.
  - Right: tier, "Gn · Name", question, status with `ui/GateBadge.tsx`, one callout sentence.
  - Foot: Evidence Replay ↗.
  - Remove: "MODE FIXED" (reads "Pinned run"), three of the four not-retained statements ("EVIDENCE NONE", "No arrays held", "Not retained"), the "EXPLAIN" head, "Read the evidence below… named on the right". Behind a `?`: "The live path keeps the arrays…".
- [ ] **Step 4: Run the standard checks.** Expected: all pass.
- [ ] **Step 5: Log and commit.** `git commit -m "feat(cpa): CHG-142 Workbench gate rail and run summary"`

### Task 16: Evidence Workbench, four tabs

**Files:**
- Modify: `evidence/GateEvidenceWorkspace.tsx`, `evidence/ExplainWhy.tsx`
- Create: `evidence/tabs/ProofTab.tsx`, `evidence/tabs/proofRows.ts`, `evidence/tabs/RulesTab.tsx`, `evidence/tabs/SignalTab.tsx`, `evidence/tabs/IdentityTab.tsx`
- Delete: `evidence/ExplainPanel.tsx`
- Test: `evidence/tabs/proofRows.test.ts`, `evidence/tabs/ProofTab.test.tsx`, `evidence/tabs/RulesTab.test.tsx`, `evidence/tabs/IdentityTab.test.tsx`

**Interfaces:**
- Consumes: `useFusedRow`, `whyRows`, `metricAvailability`, `EvidenceArtifactRenderer`, `SignalContextLanes`, `identityOf`, `parametersOf`, `CopyableId`, `EffectiveConfigDrawer`.
- Produces: `proofRows(gate, run): Array<{ name: string; id?: string; value: string; unit: string }>`; `?sub=proof|rules|signal|identity`, kept by `goTo` across gate changes.

- [ ] **Step 1: Write the failing tests.**

```ts
it('shows measured input, value and unit with the metric id', () => { /* Mean absolute error, CPLM-010, 0.7103, PV units */ });
it('shows the reason for a missing value, never 0', () => {});
it('keeps the chosen tab when the gate changes', () => { /* ?sub=rules survives */ });
it('uses the run\'s own parameters and says when none were retained', () => {});
it('labels Signal context as not retained proof', () => {});
it('copies the run id and identity record', () => {});
it('labels a rebuilt array as rebuilt', () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.**
  - Proof: window line, input table or `GateResultStatePanel` with `EvidenceArtifactRenderer`, "What remains open", `CauseBreakdownRows`; See rules & parameters →, View signal context →.
  - Rules & parameters: gate definition, Method, Parameters used, thresholds line, Configuration used by this run ↗, pinned-proof note.
  - Signal context: `SignalContextLanes` under "Signal context, not retained gate proof."
  - Identity & raw: `identityOf` fields, `WindowFlags`, manifest list, raw JSON, Copy identity record, Copy run ID.
  - Expected count is not served, so label window ÷ `sample_period_sec` as nominal.
- [ ] **Step 4: Run the standard checks.** Expected: all pass.
- [ ] **Step 5: Log and commit.** `git commit -m "feat(cpa): CHG-142 Workbench Proof, Rules, Signal and Identity tabs"`

### Task 17: Evidence Replay, stages and cursor readout

No playback, by the owner's decision: no Play, step or speed. Our chart and cursor stay.

**Files:**
- Modify: `components/Cpm/CpmReplay.tsx`
- Create: `replay/ReplayStages.tsx`, `replay/CursorReadout.tsx`, `replay/WindowVerdictCard.tsx`, `styles/cpm-replay.css`
- Delete: `replay/TransformationStepper.tsx`, `replay/LineageStrip.tsx` (`stageLabels` moves, because a test pins it)
- Test: `replay/CursorReadout.test.tsx`, `replay/WindowVerdictCard.test.tsx`

**Interfaces:**
- Consumes: `useRawSlice` with `mode` added to the measurements, `useWindowAt`, `workbenchHref`.

- [ ] **Step 1: Write the failing tests.**

```ts
it('reads PV, SP, OP and mode at the cursor', () => { /* sample 8,639 of 8,639 */ });
it('reads Not recorded for a blank mode, and for quality', () => { /* never AUT, never Good */ });
it('never changes the saved verdict while seeking', () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.**
  - Header: Understand the cause, Evidence Replay, Evidence Workbench ↗, Evidence package. Band: loop control, `EvidenceWindowSelect`, 12h/24h. Identity line: Original run · pinned (only when `metadata.replayId` is empty), samples, versions, Run details ↗.
  - Five stage tabs with one info line: Raw historian, Normalize, Features, Gate checks, Fusion. Read `metrics.sample_period_sec` first.
  - Chart and its controls stay as built. The phase plane stays for G7 to G10.
  - `CursorReadout` under our cursor: PV, SP, OP, Mode at the cursor, "Sample n / N", site-zone time.
  - `WindowVerdictCard`: verdict, reason box, Evidence check dropdown, Selected check, Controller mode, Open retained proof ↗. `GATE_METRICS` values stay in a disclosure.
  - Remove: "SUMMARY", "INPUT LINEAGE", "Where this evidence came from", "— (not in this window's result)". Behind a `?`: "How confident is the final verdict?". Keep the truncated-slice warning.
- [ ] **Step 4: Run the standard checks.** Expected: all pass. Check the readout in the browser on a stored window.
- [ ] **Step 5: Log and commit.** `git commit -m "feat(cpa): CHG-143 Replay stages and cursor readout"`

### Task 18: Evidence Replay, re-run and evidence package

**Files:**
- Modify: `components/Cpm/CpmReplay.tsx`, `investigation/LoopNotes.tsx`, `components/Cpm/CpmPipeline.tsx` (keeps its reference-loop recompute)
- Create: `replay/RerunCard.tsx`, `replay/RerunDialog.tsx`, `replay/PackageDialog.tsx`, `replay/RunDetailsDialog.tsx`
- Test: `replay/RerunDialog.test.tsx`, `replay/PackageDialog.test.tsx`

**Interfaces:**
- Consumes: `postEvaluation(loop, kind, endMs)` from `api/cpm/evaluation.ts`, `evaluationState.ts`, `evidencePackage()`, `jszip`, `identityOf`.

- [ ] **Step 1: Write the failing tests.**

```ts
it('submits the exact window as a new run and keeps the original', () => { /* postEvaluation('A', '12h', endMs); original run id unchanged */ });
it('shows queued, running, finished and failed', () => {});
it('offers a comparison with the original when finished', () => {});
it('disables Current configuration with its reason', () => {});
it('does not promise exact reproduction', () => { /* uses the window\'s governed bundle, today\'s engine build */ });
it('opens the run already made for this window, and says so', () => { /* the service returns an existing run; 3-day retention stated */ });
it('disables Re-run with its reason without cpm.analysis.create', () => {});
it('builds a package with a manifest and real artefacts', () => { /* zip holds manifest.json */ });
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.** Replace the window-blind `/recompute` on this page, which replays Kafka in 24 h windows, with `postEvaluation`. The re-run card reads "Check the configuration before creating a new run." and "Original evidence stays unchanged." The note link "evaluated window ›" becomes `workbenchHref(loopId, n.methodRunId, 'G15')`. Run details says complete retention is not sufficiency. Remove "Recompute this loop from history" and "Submits the A8 historical replay job…".
- [ ] **Step 4: Run the standard checks.** Expected: all pass.
- [ ] **Step 5: Log and commit.** `git commit -m "fix(cpa): CHG-143 re-run uses the exact window, real evidence package"`

### Task 19: Window Inspector

The owner said this page is good. It keeps every function. Only text, the flags and the place of the selected window change. No alignment diagram, no sample-density chart.

**Files:**
- Modify: `components/Cpm/CpmWindows.tsx`, `windowLabel.ts`, `windows/WindowResults.tsx`, `windows/windowMath.ts`, `windows/windowNav.ts`, `windows/CompareAcrossKinds.tsx`, `evidence/selection.ts`
- Create: `windows/WindowList.tsx`, `windows/SelectedWindow.tsx`, `windows/WindowDialogs.tsx`, `styles/cpm-master-detail.css`
- Delete: `windows/WindowDetail.tsx`
- Test: `windows/windowMath.test.ts`, `windows/SelectedWindow.test.tsx`, `CpmWindows.page.test.tsx`

**Interfaces:**
- Produces: `countCheck(received: number, nominal: number): { ratio: number; diff: number; label: string }`; `inspectTarget(row, loop, kind): string` in `windows/windowNav.ts`.

- [ ] **Step 1: Write the failing tests.**

```ts
it('labels counts honestly', () => {
  expect(countCheck(180, 180).label).toBe('Matches');
  expect(countCheck(181, 180).label).toBe('+1 sample');
  expect(countCheck(179, 180).label).toBe('−1 sample');
});
it('never calls 181 of 180 full', () => { /* no "% full" on the page */ });
it('sends 15m and 4h to their own run, never to Replay', () => {
  expect(inspectTarget({ runId: 'r' }, 'A', '15m')).toContain('/cpm/evidence');
  expect(inspectTarget({ runId: 'r' }, 'A', '12h')).toContain('/cpm/replay');
  expect(inspectTarget({ runId: null }, 'A', '15m')).toContain('/cpm/historical');
});
it('selects the newest row by default and keeps an exact ?window=', () => {});
it('reads Not evaluated for G2r on a declined window', () => { /* not the lone ✓ */ });
it('labels created_at as Stored, not emitted', () => {});
it('does not fetch raw data on a row click', () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.**
  - Keep our page's content and order, and make it consistent: header, band with loop control and profile select ("15 min · 5 min slide"), Pipeline Health ↗ for `system.manage`.
  - List: Window (13:35 → 13:50, date once in a section head), Samples / nominal with ratio, Count check; Declined stays in Count check. Sample count dropdown, "n matching / m loaded", Previous, Next.
  - Right panel in `ui/Inspector`: bounds, Received, Nominal, ratio, difference, message, Short features or Long diagnostics tag, Stored time, Inspect this window →, View record details ↗, Feature flags ↗, Engine & timing ↗.
  - Feature flags names G0, G1, G2, G2r, G3, G4 from `SHORT_GATES`. The tick column goes.
  - Nominal is `expected_sample_count`; on historian rows use `round(sample_count / completeness)`, marked derived. Never use `sample_period_sec`.
  - Remove: "from {date}", "emitted {date}", "{n} samples", "{n}% full", "UNKNOWN", "Latest results", "‹ All 15m windows", "Window 3 of 24 loaded · 15m · {loop}", "What the selected window carried", "Contract for the selected window", "— (DG-4: not recorded by the jobs)". Behind a `?`: "What happens at each boundary", the compare paragraph, "The engine declined to evaluate this window…".
- [ ] **Step 4: Run the standard checks.** Expected: all pass.
- [ ] **Step 5: Log and commit.** `git commit -m "feat(cpa): CHG-144 Window Inspector, selected window beside the list"`

### Task 20: Calculations

**Files:**
- Modify: `components/Cpm/CpmCalculations.tsx`, `calcCatalogue.ts`, `calcSort.ts`, `evidence/format.ts`
- Create: `calcMethods.ts`, `calc/useCalcValues.ts`, `calc/CalcPanel.tsx`, `calc/CalcDialogs.tsx`, `styles/cpm-calculations.css`
- Delete: `components/Cpm/CalcDrawer.tsx`
- Test: `calcCatalogue.test.ts`, `calcMethods.test.ts`, `calc/CalcPanel.test.tsx`, `CpmCalculations.page.test.tsx`

**Interfaces:**
- Produces: `category: 'Data & mode' | 'Control error' | 'Actuator' | 'Oscillation' | 'Decision'` on each `METRICS` entry; `calcMethod(id: string): { formula: string; text: string }`; `?metric=` is two-way.

- [ ] **Step 1: Write the failing tests.**

```ts
it('places all 19 metrics in a category', () => { expect(METRICS).toHaveLength(19); expect(METRICS.every(m => m.category)).toBe(true); });
it('has a method for every metric, written from the engine', () => {
  expect(calcMethod('CPLM-020').formula).toBe('std(OP) ÷ std(PV)');
});
it('shows the gate under the name, not in its own column', () => { /* "CPLM-010 · G3"; no Gate column */ });
it('keeps Not calculated distinct from 0', () => {});
it('selects the first visible row and keeps ?metric=', () => {});
it('opens the proof of the exact run', () => { /* cpaHref('/cpm/evidence', …, { methodRun, gate }); disabled with a reason when absent */ });
it('shows a past window\'s values for ?window=', () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.**
  - Band: loop control, evaluated window, verdict chip, versions, Run details ↗. Back to Investigation ↗ in the header.
  - Filters stay ours: Find calculation, Gate, Gate result dropdowns. Category toggle: All, Control error, Actuator, Data & mode, Oscillation, Decision. "All types" goes. The Gate dropdown narrows to the chosen category.
  - List: Calculation (name, `CPLM-010 · G3`), Value / unit, Gate result; "n shown / 19 available", Clear filters. Paging and row descriptions go; sorting keeps id, name and status.
  - `CalcPanel` in `ui/Inspector`: name, id, value, unit, method summary, Related gate, Signal engineering unit, gate-versus-verdict note, Open Gn proof →, Retained value & identity ↗, Inspect parameters ↗, Original configuration.
  - Method texts: 12 from the reference, corrected to the engine; 7 from `docs/cpm-calculation-reference.md`. Fix CPLM-020 in `calcCatalogue.ts` too. CPLM-003 and CPLM-014 are sample fractions.
  - Remove: "Metrics stored", "Evidence gates in the pack", "Gates acceptable", "Gates needing review", "Gates not evaluated", "All types", "19 result(s)", "FIC · profile default", "Page 1 of 2", "What produced this value", "Is this value current?", "Has this been produced before?". Rename "Not measured" to "Not calculated", with its reason as the second line. The gate tally moves to Run details.
- [ ] **Step 4: Run the standard checks.** Expected: all pass.
- [ ] **Step 5: Log and commit.** `git commit -m "feat(cpa): CHG-145 Calculations by category with the selected metric beside the list"`

### Task 21: System Response

**Files:**
- Modify: `response/ResponseWorkspace.tsx`, `response/ModelHistory.tsx`, `evidence/views/FusionViews.tsx`
- Create: `response/ResponseSummary.tsx`, `response/ResponseSteps.tsx`
- Test: `response/ResponseSummary.test.tsx`, `response/ResponseWorkspace.test.tsx`

- [ ] **Step 1: Write the failing tests.**

```ts
it('counts events, accepted events and the model state', () => { /* "50+" past one page */ });
it('merges the empty states and offers Historical and G12 settings', () => { /* configHref with gate G12, shown with cpm.config.read */ });
it('shows no model without an accepted event', () => {});
it('groups models as candidate, validated and baseline', () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.** Header, band with Open loop ↗, three tiles, the no-qualifying-event panel, the four-step strip (empty state only), Event states explained ↗ dialog. The with-data layout keeps its three columns. An event click uses `setParams`, because the page no longer passes through a redirect. Remove: "Events are captured from qualifying setpoint or output changes; none qualified…", "Step-test settings (Gate Configuration › G12)", "Setpoint changes in Historical", "No system model for this loop…". "Model review needs the cpm.model.review permission." stays on the disabled button.
- [ ] **Step 4: Run the standard checks.** Expected: all pass.
- [ ] **Step 5: Log, commit, and run the Section check.** `git commit -m "feat(cpa): CHG-145 System Response summary and steps"`. Control-engineer items: evidence honesty text, method summaries. Owner checks all six pages.

---

## Section 4: Set up and Trend (CHG-146 to CHG-149)

### Task 22: Retire and restore a loop (cplm-api)

**Files:**
- Modify: `src/services/cplm-api/Controllers/CpmLoopsController.cs`, `src/services/cplm-api/Services/CpmLoopRegistryService.cs`
- Create: `api/cpm/loopRetire.ts` (`api/cpmApi.ts` must not grow), `hooks/useLoopRetire.ts`, `tests/cplm-api.Tests/LoopRetireTests.cs`

**Interfaces:**
- Produces: `POST /api/v1/cpm/loops/{loopId}/retire` with body `{ "reason": string }`, returns `{ loopId, retired: true }`; `POST /api/v1/cpm/loops/{loopId}/restore`, returns `{ loopId, retired: false }`. Both need `cpm.manage`. Audit events `CPM_LOOP_RETIRED` and `CPM_LOOP_RESTORED` carry the reason. `useRetireLoop()`, `useRestoreLoop()`.

- [ ] **Step 1: Write the failing tests.**

```csharp
[Fact] public void Retire_sets_is_active_false_and_monitoring_disabled() { }
[Fact] public void Retire_keeps_tags_links_bindings_and_history() { }
[Fact] public void Restore_sets_both_back() { }
[Fact] public void Retire_needs_a_reason() { /* 400 */ }
[Fact] public void Loop_read_still_answers_for_a_retired_loop() { }
[Fact] public void Retired_loop_leaves_fleet_kpis_and_rankings() { }
```

- [ ] **Step 2: Run them.** `dotnet test tests/cplm-api.Tests --filter "FullyQualifiedName~LoopRetire"`. Expected: FAIL.
- [ ] **Step 3: Build it.** Set both `is_active` and `monitoring.enabled`, because ingestion reads the first and fleet SQL reads the second. Follow what activate does for the registry broadcast, so engines stop treating the loop as active. Invalidate the fleet caches. An open episode gets a recorded closing state or stays visible with "Loop retired"; read `EventFrameLifecycle` first and record the choice in `decision-ui.md`. Add the facts to `prod_decision.md`. The existing `DELETE` endpoint stays and gets no button.
- [ ] **Step 4: Run `dotnet test tests/cplm-api.Tests --filter "Category!=Integration"` and the standard checks.** Expected: all pass.
- [ ] **Step 5: Commit.** `git commit -m "feat(cplm-api): CHG-146 retire and restore a loop, history kept"`

### Task 23: Loop Registry list

**Files:**
- Modify: `components/Cpm/LoopRegistry.tsx`, `overview/ReadinessStrip.tsx` (moved here)
- Create: `styles/cpm-registry.css`
- Test: `LoopRegistry.test.tsx`

**Interfaces:**
- Consumes: `vpCellLabel`, `loopMatchesQuery`, `useCpmReadiness`, `ReasonedButton`, `registryHref`.

- [ ] **Step 1: Write the failing tests.**

```ts
it('shows Loop, Loop type and VP only', () => { /* no Model, Profile, State, hierarchy columns */ });
it('opens detail from a row and keeps search and page for Back', () => { /* /cpm/registry?loop=A&search=x&page=2 */ });
it('disables Add loop and Bulk import with a reason without cpm.manage', () => {});
it('shows configuration limits as a compact line', () => { /* 236 valve positions, 241 peer links */ });
it('marks a retired loop and can show them', () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.** Header: Set up, Loop Registry, Bulk import, Add loop. Loop assets card with count and Find loop. Full-width table; Site, Area and Unit stay in the header. The side panel goes. Remove "Registered assets" and "Pick a loop in the registry list to see its profile, signal mapping and readiness, and to edit it.", and merge the two `?` buttons.
- [ ] **Step 4: Run the standard checks.** Expected: all pass.
- [ ] **Step 5: Log and commit.** `git commit -m "feat(cpa): CHG-147 Loop Registry list, name, type and VP"`

### Task 24: Loop detail page, edit and retire

**Files:**
- Modify: `components/Cpm/LoopRegistry.tsx`, `components/Cpm/AddLoopWizard.tsx`
- Create: `registry/LoopDetail.tsx`, `registry/RetireLoopDialog.tsx`, `registry/loopDetailFacts.ts`
- Delete: `components/Cpm/ProfileAside.tsx`
- Test: `registry/LoopDetail.test.tsx`, `registry/RetireLoopDialog.test.tsx`, `AddLoopWizard.test.tsx`

**Interfaces:**
- Consumes: `CpmLoop` from `useCpmLoops()` resolved case-insensitively, `useCpmReadiness`, `useRetireLoop`, `useRestoreLoop`, `configHref`, `explorerHref`, `evidenceHref`, `adminHref`, `stateOf`.

- [ ] **Step 1: Write the failing tests.**

```ts
it('shows tag, service, state and only useful facts', () => { /* Criticality, Gate profile, Acquisition, VP, Peer links, plant path */ });
it('lists readiness as specific missing fields', () => {});
it('keeps VP states apart', () => { /* Applicable · mapped, Expected · not mapped, Not applicable */ });
it('offers Edit and Retire to cpm.manage only, with the reason on the disabled button', () => {});
it('needs a reason to retire, then shows Restore', () => {});
it('shows a retired loop with its history links', () => {});
it('shows a clear state for an unknown loop, with the way back to the list', () => {});
it('keeps assetId, stepTestApproved and source tags through an edit', () => { /* buildRequest preserves them */ });
it('keeps NOT_INSTALLED through an edit', () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.** `/cpm/registry?loop=X` renders `LoopDetail`, with "‹ Loop Registry" back. Sections: facts, signal mapping table with Copy, readiness, loop model, actions (Edit configuration, Retire, Open loop, Evidence, Effective rules ↗, Re-project links & republish evidence with its `ActionReceipt`). Plant tree link is gated by that tab's rule, not `asset.edit`. Move "G9 geometry is supporting-only…" and "(preset from loop type)" behind a `?`. Remove "Assigned profile". Gate role policy moves in Task 25.
- [ ] **Step 4: Run the standard checks.** Expected: all pass.
- [ ] **Step 5: Log and commit.** `git commit -m "feat(cpa): CHG-147 loop detail page with edit and retire"`

### Task 25: Gate Configuration

**Files:**
- Modify: `config/GateConfigurationWorkspace.tsx`, `config/LoopConfigHeader.tsx`, `config/EffectiveView.tsx`, `config/BundlesView.tsx`
- Create: `config/EffectivePropertyDialog.tsx`, `config/DraftBundleDialog.tsx`, `config/GateRolePolicy.tsx`
- Test: `config/LoopConfigHeader.test.tsx`, `config/EffectiveView.test.tsx`, `config/DraftBundleDialog.test.tsx`

- [ ] **Step 1: Write the failing tests.**

```ts
it('shows Effective layer, Profile and Worker alignment as three tiles', () => {});
it('keeps "a worker runs ANOTHER catalogue" visible', () => {});
it('shows Property, Value and Source, with class under the name', () => { /* CFG id and unit move to the row dialog */ });
it('opens a property in a dialog', () => {});
it('offers LOOP, PROFILE and SITE when drafting, and picks the right parent version', () => {});
it('hides build identifiers in Technical details', () => { /* catalogue and bundle hash */ });
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.** Header: Set up, Gate Configuration. Band with loop control and Open loop ↗. Three tiles. Effective and Bundles tabs. "Where each value comes from" replaces "Layer stack". The gate dropdown stays. Bundles: callout, Draft, Review, Publish strip, Prepare bundle draft dialog; editor, landing lists and versions stay. Gate role policy lands here, because it is the same for every loop. Behind a `?`: "What each loop runs under, the bundles in progress, and the editor for one of them.", "What this loop runs under today…", "the most specific active level wins", the three `LEVEL_COPY` lines. In a disclosure: "APPLY acknowledgements", `d.semantics`.
- [ ] **Step 4: Run the standard checks.** Expected: all pass.
- [ ] **Step 5: Log and commit.** `git commit -m "feat(cpa): CHG-148 Gate Configuration, tiles, clean property table"`

### Task 26: Trend with a loop selector

The owner asked for a loop selector, so a user can pick a loop here and see its trend without going through other pages. Everything else on this page stays: time controls, range chips, From and To, tag pens.

**Files:**
- Modify: `components/Designer/TrendPage.tsx`, `components/Cpm/cpaHref.ts` (`trendToolHref`), `cpa/useContextCarry.ts`
- Create: `components/Designer/trend/loopPens.ts`
- Test: `components/Designer/trend/loopPens.test.ts`, `components/Designer/TrendPage.test.tsx`

**Interfaces:**
- Produces: `loopPens(loop: CpmLoop): Array<{ tag: string; role: string }>`, reading `loop.tags`.

- [ ] **Step 1: Write the failing tests.**

```ts
it('loads PV, SP, OP and VP pens from the chosen loop', () => {});
it('opens with ?loop= when no tags are set', () => {});
it('colours pens by role, not position', () => { /* SP uses --signal-sp */ });
it('hides the selector without analytics.view', () => { /* /trend needs only historian.view */ });
it('shows Choose a loop on an empty chart', () => {});
it('shows LIVE only while samples arrive', () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.** Header: Engineering, Trend. `LoopBand` inside `.cpm-screen`, with Open loop ↗ in `end`. A chosen loop replaces the pens; tag pens still work. Remove `0 pens`, `No tags selected`. `trendToolHref` and `carriedSearch` carry `loop`, which reverses UI-106; record it.
- [ ] **Step 4: Run the standard checks.** Expected: all pass.
- [ ] **Step 5: Log, commit, and run the Section check.** `git commit -m "feat(cpa): CHG-149 Trend opens from a loop selector"`. Services: `ams-frontend`, `cplm-api`. Owner checks Registry, loop detail, Gate Configuration and Trend.

---

## Section 5: System (CHG-150 to CHG-152)

### Task 27: Pipeline Health

**Files:**
- Modify: `components/Cpm/CpmPipeline.tsx`, `hooks/useCpm.ts` (`useRecompute` returns `analysisRunId`, no growth)
- Create: `pipeline/JobDialog.tsx`, `pipeline/VerificationCard.tsx`, `pipeline/TelemetryCard.tsx`, `pipeline/mergeJobs.ts`, `styles/cpm-pipeline.css`
- Test: `pipeline/mergeJobs.test.ts`, `pipeline/VerificationCard.test.tsx`, `pipeline/JobDialog.test.tsx`

**Interfaces:**
- Produces: `mergeJobs(metricsJobs, statusJobs)`, so rows equal the required total, with state MISSING for a job Flink does not list.

- [ ] **Step 1: Write the failing tests.**

```ts
it('lists every required job, including missing ones', () => { /* rows === 13 */ });
it('opens a job in a read-only dialog', () => { /* duration, state size */ });
it('shows Not exposed, never an estimate', () => {});
it('reports the real run id and states from verification', () => {});
it('says the chart holds only what was collected while the page is open', () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.** Three tiles. Observed jobs: Job (state, uptime), Checkpoint age, OK / failed. Telemetry availability card. End-to-end verification opens a setup dialog with our loop control, then real states and run identity. Checkpoint chart in a disclosure. Replace "Runtime internals", "One row per supervised job", "Prove the pipeline with a real round trip", "Where a sample becomes a verdict". "not exposed by the metrics proxy" becomes "Not exposed". Behind a `?`: "The Flink/Kafka runtime that produces every verdict…", "Submits an A8 recompute on…". `(JobManager)` and build identifiers go in Technical details.
- [ ] **Step 4: Run the standard checks.** Expected: all pass. The lab shows 0/13, so the unit tests carry the job-row proof.
- [ ] **Step 5: Log and commit.** `git commit -m "feat(cpa): CHG-150 Pipeline Health, all jobs listed, real verification states"`

### Task 28: Administration

**Files:**
- Modify: `components/Administration/Administration.tsx`, `UserManagementConfig.tsx`, `RolesConfig.tsx`, `DataSourcesConfig.tsx`, `PlantModelConfig.tsx`, `AliasConfig.tsx`, `SystemSettingsConfig.tsx`
- Create: `components/Administration/DataSourceDetail.tsx`, `components/Administration/AuditLogLink.tsx`, `styles/cpm-administration.css`
- Test: `Administration.landing.test.tsx`, `UserManagementConfig.test.tsx`, `SystemSettingsConfig.test.tsx`

- [ ] **Step 1: Write the failing tests.**

```ts
it('offers Users, Roles & permissions, Data sources, Plant model, Tag aliases, Audit log, System settings', () => {});
it('keeps each tab\'s permission', () => { /* Users admin.users.edit, Roles rbac.manage, Data sources ingestion.view */ });
it('shows User, Role and Status, with the rest in the row dialog', () => {});
it('never paints a role in alarm colours', () => { /* ROLE_STYLE removed, SuperAdmin styled */ });
it('shows Not connected and no invented values on System settings', () => { /* no /mnt/backups/ams, no 30, no 365 */ });
it('opens Governance from Audit log', () => {});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.** The inline header and tab strip go; `WorkspaceHeader` (System, Administration) and `ui/Tabs.tsx` replace them, with tabs still path-based under `/admin/*`. Users: three columns; Email, Created, Edit and Delete move to the row dialog; Bulk import and the role and status dropdowns stay. Data sources: searchable list and row detail, keeping Test, Edit, On/Off, Delete and MODE map; connection fields stay in the detail. Plant model and Tag aliases: text cuts only; the five-stage strip moves behind a `?`. Audit log: one line and Open Governance →. Replace "User Management", "Source Configuration", "Global System Settings" with the reference's tab names. Remove the emoji icons and "Industrial Dark".
- [ ] **Step 4: Run the standard checks.** Expected: all pass. `PlantModelConfig.tsx` is 449 lines and must not grow. `DataSourceWizard.tsx` is already 605: leave it untouched and report it.
- [ ] **Step 5: Log and commit.** `git commit -m "feat(cpa): CHG-151 Administration tabs in the reference's order, honest settings"`

### Task 29: Governance

**Files:**
- Modify: `components/Cpm/CpmGovernance.tsx`, `governance/AuditTrail.tsx`
- Create: `governance/AuditEventDialog.tsx`, `governance/VerifyDialog.tsx`, `governance/ChangeTraceability.tsx`
- Test: `governance/AuditEventDialog.test.tsx`, `governance/VerifyDialog.test.tsx`, `governance/AuditTrail.test.tsx`

- [ ] **Step 1: Write the failing tests.**

```ts
it('shows When / actor, Action and Entity', () => { /* hash and correlation move to the dialog */ });
it('opens an event with the facts served, and says what is not served', () => { /* before/after: Not available */ });
it('links a loop event to loop detail, and says when a loop is not in the registry', () => {});
it('never claims integrity from a button click', () => { /* shows the service\'s sentence, states that range and count are not served */ });
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build it.** Header: System, Governance, Verify audit chain. Filters: Entity, Find event, User, Event type. Foot line names the zone and "newest 200 of 4825". Change traceability card with real versions. Audit integrity card. Version provenance, approvals and the permission matrix stay under `system.manage`; engine builds and jar ids go in Technical details. Remove "Immutable audit trail", "Change control". Behind a `?`: "Who changed what, under which calculation versions…", "Entries are hash-chained by audit-service…". Never expose `/audit/rechain`.
- [ ] **Step 4: Run the standard checks.** Expected: all pass.
- [ ] **Step 5: Log, commit, and run the Section check.** `git commit -m "feat(cpa): CHG-152 Governance, event dialog and honest verification"`. Owner checks all three pages.

---

## Section 6: Whole journey proof and records (CHG-153)

### Task 30: Prove the journey and close the records

**Files:**
- Create: `docs/theme/tools/journey-walk.mjs`, `docs/theme/redesign/acceptance.md`
- Modify: `changes_tracker.md`, `prod_decision.md`, `docs/theme/redesign/decision-ui.md`, `page-plan.md`, `phase-reports.md`, `text-changes.md`, `label-register.md`, `components.md`

- [ ] **Step 1: Write `journey-walk.mjs`**, read-only and with the guard on. It clicks every row of the Navigation map on lab data and asserts the destination path and each context parameter. A dialog test asserts a `role=dialog` with its title and that Esc closes it.
- [ ] **Step 2: Run the journey.** Credentials reach it only as process environment. Expected: every row passes; report any step with no such control as untested, not passed.
- [ ] **Step 3: Run the brief's acceptance A1 to A10** and record Pass or Fail in `acceptance.md`, each with route, selected context and evidence. A1 is judged on hierarchy and structure only, because the look stays ours. A8 keeps the widths in the Global Constraints. The items in the Spec's "Not in this release" table are recorded as that, never as a pass, for the owner's sign-off. A9 and A10 writes on the shared lab need the owner's approval first.
- [ ] **Step 4: Check Day and Night at 320, 390, 736, 1024 and 1440 px** with `control-edge.mjs` and `check-geometry.mjs`. Expected: 0 off the screen, 0 failing.
- [ ] **Step 5: Run an independent code review** of the whole branch and fix what would lose a function.
- [ ] **Step 6: Close the records.** Name in `changes_tracker.md`: updated services `ams-frontend`, `cplm-api`, no migration, the script to run, and the release note. Send the control engineer `text-changes.md`: gate words, method summaries, evidence text. Tell the SME what differs from the reference: filters, colours, Result lane, Next checks, Retire, no playback, and the "Not in this release" table.
- [ ] **Step 7: Commit, push, rebuild the lab, and report.** `git commit -m "docs(redesign): CHG-153 acceptance and records for the reference redesign"`
