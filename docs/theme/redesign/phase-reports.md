# CPA redesign phase reports

Format from PRM-004 §8. Checkpoints R0 to R7 are reported here and do not pause the work (UI-007).

## Phase 1 — Foundation

Files changed: 64
Destinations / components delivered: Traverse tokens, OpenBridge bridge, Day and Night, blocking theme script, one chart theme on 11 charts
Redirects switched on: none
Functions verified (SPEC §8): no function moved in this phase
Gates: tsc ✓ (0) | lint ✓ | test ✓ (583) | build ✓ | lint:theme ✓ (T1 T2 T3 T4 T6 T7, 0 matches) | contrast ✓ (121/126, min text 4.587) | obc-probe ✓ (9/9) | redirects n/a | a11y n/a | geometry n/a
Evidence: `evidence/phase-1/` (24 routes, Day and Night, 1440 × 1024; `proof.json`: 0 bright frames with the script, 37 without; storage migration 7 of 7; shadow-root styles match in both themes; chart switch without reload)
Label register: none
Text touching safety context: none
Deferred / C3: box-zoom selection rectangle keeps the ECharts default colour
Change tracker: CHG-111
Commit: dab4c59c redesign(phase-1): CHG-111 Traverse tokens, Day and Night, one chart theme
Pushed: origin/feat/cpa-redesign at dab4c59c (verified with git ls-remote)

## Phase 2 — Shell, navigation, context and routing

Files changed: see the phase commit
Destinations / components delivered: AppShell, PlantSelector, TimeRangeControl, UserMenu, Popover, SegmentedControl, Tabs, DataState (restricted); routes `/cpm/loop`, `/cpm/setup`, `/cpm/system`, Evidence tabs; `cpaHref`, `useCpaContext`, redirect table
Redirects switched on: none. All rows are defined and tested, and each turns on with its destination (PRM-004 Phase 2 step 3)
Functions verified (SPEC §8): no function moved; old pages render inside the hosts
Gates: tsc ✓ (0) | lint ✓ | test ✓ (675) | build ✓ | lint:theme ✓ (T1 T2 T3 T4 T6 T7 T11, 0 matches) | contrast ✓ | obc-probe ✓ | redirects ✓ (18 routes, 24 cases, 0 on) | a11y n/a (from Phase 4) | geometry ✓ (14 of 14)
Evidence: `evidence/phase-2/` (shell at 1440, 1280, 1024 and 200 % in Day and Night; open controls; drawer; `geometry.json`; `context-walks.json`; `restricted.json`)
G07: 24 tasks, 29 click hops, 0 lost. 3 steps not walked because the lab has no findings to click (OP1, EN3, RE6)
Restricted state: 6 of 6 refused routes, **simulated role**. **The check with a real viewer account is pending** (UI-027)
Label register: 6 rows
Text touching safety context: none
Deferred / C3: header range inert on old pages (UI-020); 23 browser-zone calls in old pages (UI-022); two rows of tabs on Loop until Phase 5 (UI-023); no logo file (UI-016)
Change tracker: CHG-112

## Phase 3 — Shared components and replacements

Files changed: see the phase commit
Destinations / components delivered: SPEC §6.2 to §6.16, documented in `components.md`; help registry (145 entries); component gallery behind `VITE_CPA_COMPONENT_GALLERY=1`
Redirects switched on: none
Replacements: 45 uses in 19 files (the documented 46 included one already removed in Phase 0, UI-036)
Functions verified (SPEC §8): no function moved. Behaviour differences are listed in CHG-113
Gates: tsc ✓ (0) | lint ✓ | test ✓ | build ✓ | lint:theme ✓ (T1 to T11, 0 matches) | contrast ✓ (121/126) | obc-probe ✓ (9/9) | redirects ✓ | a11y ✓ (axe on the gallery, 0 in both themes) | geometry ✓
Evidence: `evidence/phase-3/proof.json` (59 checks, keyboard and contract), per-component images in Day and Night, TrendPanel behaviour images, replaced pages
Label register: 3 rows
Text touching safety context: none. Definitions are verbatim (RD10)
Deferred / C3: UI-037 (metric link mapping, raw placeholders, definition length, implementation terms, normalised tooltip, zoom slider)
Change tracker: CHG-113

## Phase 4 — Overview, Performance, Episodes

Files changed: see the phase commits
Destinations / components delivered: Overview, Performance, Episodes; `GateBadge`, `GateKey`, `useGridFocus`; DataTable grouped headings and grid
Redirects switched on: `/cpm/kpi` → `/cpm?review=`
Functions verified (SPEC §8): fleet KPIs, KPI drill-down and proof, KPI daily trend with day pick, priority queue, loop focus, readiness, event trail; gate roll-up, matrix, checks, guide; episode ledger, detail, history, conditions, notes; acknowledge, shelve, unshelve and note by unit test only, because the guard blocks writes on the shared lab
Gates: tsc ✓ (0) | lint ✓ | test ✓ | build ✓ | lint:theme ✓ (T1 to T11, T13, 0 matches) | contrast ✓ (121/126) | obc-probe ✓ (9/9) | redirects ✓ | a11y ✓ (12 scans, 0 critical or serious) | geometry ✓ | signals ✓
Evidence: `evidence/phase-4/` (`proof.json` 45 of 45, `axe.json`, `context-walks.json`, `geometry.json`; three pages in Day and Night at 1440, 1280 and 1024)
Walks: OP1, OP4, OP6, EN2, RE1, RE4 all reached their destination by clicks. All 24 tasks: 0 context lost
CPA01: strip, ranked table, stated basis and condition filter pass. Unassessed loops are listed with their reason. Sortable headings are partial: KPI lists sort only when they fit one page (UI-048). A2 to A5 cannot be fully judged on this lab, which has 0 current findings
Label register: 19 rows
Text touching safety context: none. Definitions verbatim (RD10)
**Not met:** the header range does not filter Episodes (UI-043)
Deferred / C3: UI-048
Change tracker: CHG-114

## Phase 4 withdrawn (UI-049)

The owner directed that the core page design stays and only colours change. Overview, Performance and Episodes returned to their Phase 3 design in CHG-115. The figures in the Phase 4 report describe the withdrawn pages. Phases 5 to 8 of PRM-004 are stopped until the owner decides what remains.

## Page plan, step 1: Loop (CHG-120)

Loop has one row of seven tabs. Nothing inside a page changed.
Gates: tsc ✓ (0) | lint ✓ | test ✓ (1,145) | build ✓ | lint:theme ✓ (0 matches) | contrast ✓ | geometry ✓ (14) | redirects ✓ (24 cases) | a11y ✗ (10 serious, none from this change)
Evidence: `evidence/phase-5/` (`loop-parity.json` 502 items in 14 tab states, nothing lost or added; `axe.json`). Tool: `docs/theme/tools/tab-parity.mjs`, proven by a planted wrong pair.
Walks: 37 browser checks passed, and two real readiness links opened the right tab. 56 views with no overflow. Blocked 0.
Not met: a11y. The Calculations gate buttons and the Historical pen note fail the same way on their old pages. Performance and Episodes findings came back with the old design in CHG-115 (UI-069).

## Page plan, step 2: Overview, and the open issues (CHG-121)

KPI drill-down in place. Nothing inside the page changed. All gate findings fixed, and the phone header and two clipped layouts.
Gates: tsc ✓ (0) | lint ✓ | test ✓ (1,147) | build ✓ | lint:theme ✓ (0 matches) | contrast ✓ | geometry ✓ (14) | redirects ✓ (24 cases) | a11y ✓ (34 scans, 0 of any level)
Evidence: `evidence/phase-5/` (`kpi-parity.json` 165 items, `loop-parity.json` 505 items, nothing lost or added; `axe.json`).
Walks: Overview 24 of 24, Loop 37 of 37, control-edge 24 views with 0 off the screen. Blocked 0.
Simulated: a Calculations readiness link and not-assessable reasons, one answer each, because the lab has neither.
Not run: role-edit sign-out, real viewer account, control-engineer review.

## Page plan, step 3: Evidence (CHG-122)

Tabs share the loop and the window correctly, and a selection stays on its tab. Nothing inside a page changed. Defects fixed: one loop's evidence under another's name, a gate silently filtering Calculations, and Replay's 24h switch, which never worked.
Gates: tsc ✓ (0) | lint ✓ | test ✓ (1,155) | build ✓ | lint:theme ✓ (0 matches) | contrast ✓ | geometry ✓ (14) | redirects ✓ (24 cases) | a11y ✓ (50 scans, 0 of any level)
Evidence: `evidence/phase-5/` (`evidence-parity.json` 269 items, `loop-parity.json` 505, `kpi-parity.json` 165, nothing lost or added; `axe.json`).
Walks: Evidence 31 of 31, Overview 24 of 24, Loop 37 of 37, control-edge 32 views with 0 off the screen. Blocked 0.
Not met: nothing in this step. Open for the owner: the Replay fix at the plant, role-edit sign-out, viewer account, control-engineer review, page headings.

## Page plan, step 4, first half: Administration into tabs (CHG-123)

Plant model, Data sources and Tag aliases are tabs of Setup. Users, Roles, Audit log and Settings are tabs of System. Nothing inside a page changed. The one audit trail waits for the owner to agree `samples/audit-trail.html`.
Gates: tsc ✓ (0) | lint ✓ | test ✓ (1,163) | build ✓ | lint:theme ✓ (0 matches) | contrast ✓ | geometry ✓ (14) | redirects ✓ (24 cases) | a11y ✓ (72 scans, 0 of any level)
Evidence: `evidence/phase-5/` (`admin-parity.json` 307 items, `evidence-parity.json` 269, `loop-parity.json` 505, `kpi-parity.json` 165; `axe.json`).
Walks: Setup and System 28 of 28, Evidence 31 of 31, Overview 24 of 24, Loop 37 of 37, control-edge 54 views with 0 off the screen. Blocked 0.
Not proven: permissions with real accounts. Unit tests cover seven kinds of role.

## Page plan, step 4, second half: one audit trail (CHG-124)

Governance events and Audit log are one view on System › Governance, with everything from both. The Event type filter returned nothing for any option and now lists real types.
Gates: tsc ✓ (0) | lint ✓ | test ✓ (1,174) | build ✓ | lint:theme ✓ (0 matches) | contrast ✓ | geometry ✓ (14) | redirects ✓ (24 cases) | a11y ✓ (70 scans, 0 of any level)
Evidence: `evidence/phase-5/` (`trail-parity.json`, `admin-parity.json`, `evidence-parity.json`, `loop-parity.json`, `kpi-parity.json`; `axe.json`).
Walks: trail 22 of 22, Setup and System 26 of 26, Evidence 31 of 31, Overview 24 of 24, Loop 37 of 37, control-edge 52 views with 0 off the screen. Blocked 0.
Simulated: Verify's two answers. Not proven: permissions with real accounts.
Next: step 5, the old addresses.

## Page plan, step 5: old addresses (CHG-125)

Every old address opens its tab. The page plan is built.
Gates: tsc ✓ (0) | lint ✓ | test ✓ (1,187) | build ✓ | lint:theme ✓ (0 matches) | contrast ✓ | geometry ✓ (14) | redirects ✓ (32 cases, 27 opened in a browser) | a11y ✓ (70 scans, 0 of any level)
Evidence: `evidence/phase-5/` (`link-walk.json` 82 links on 28 pages, 0 problems; `axe.json`).
Walks: Audit trail 22 of 22, Setup and System 31 of 31, Evidence 31 of 31, Overview 24 of 24, Loop 37 of 37, control-edge 52 views with 0 off the screen. Blocked 0.
Not proven: permissions and role landings with real accounts. Not run: role-edit sign-out, Verify against audit-service.
Before release: control-engineer review of `text-changes.md`.

## Owner's review: each filter once, each fact once (CHG-126 to CHG-131)

Built from the approved sample `samples/one-filter-place.html`, on the real pages.
Gates: tsc 0, lint 0, 1,221 tests in 153 files, build OK, lint:theme 0, cplm-api logic 63 of 63.
Evidence: `evidence/phase-6/axe.json`; approved sample `samples/one-filter-place.html`.
Walks: 59 of 59 on lab data, 0 server errors, 0 blocked. `check-a11y` 70 scans with 0 findings of any level, `check-redirects` 27 of 27, `check-geometry` 14 of 14, `control-edge` 52 views with 0 off the screen, link walk 75 links on 28 pages with 0 problems. Not proven: `segments` on a running server, the 12 database tests, real restricted roles.
Proven by unit tests: the state bar's classification (`FleetKpiBarTests`), its colours, the loop control, the service name.
Not proven: the bar on real data end to end, because the lab's cplm-api predates `segments` and the walk used simulated counts. The 12 database tests of `tests/cplm-api.Tests` were not run, because they write probe rows into the lab. Permissions and role landings with real accounts stay open from step 5.
KPI drill-down (CHG-132): tsc 0, lint 0, all tests in 155 files passed, build OK, lint:theme 0, `check-a11y` 70 scans with 0 findings of any level, `check-redirects` 27 of 27, `check-geometry` 14 of 14. A walk of the page on lab data passed: first loop row at 498 px (was 988), `?` holds all seven facts and stays on screen, range dropdown, clicking a day and Back to now, another KPI, empty search, nothing off the side at 1000, 768 and 390 px, 0 server errors, 0 blocked. **Not proven in a browser:** the reason dropdown, because the lab has no not-assessable loops; it is covered by unit tests. `control-edge` 52 views with 0 off the screen, link walk 75 links on 28 pages with 0 problems, walk 59 of 59 with 0 blocked, and 4 HTTP 500s from a lab slowdown on endpoints outside this page.
Lab rebuild, 2026-11-06: both services at `7e5caf19`. The bar on real data from the running server is now proven end to end: `segments` sum to 241 of 241, and each state's list equals its count. The 12 database tests and real restricted roles stay unproven.
Before release: control-engineer review of `text-changes.md`, tell the SME about UI-101, and deploy `cplm-api` with `ams-frontend`.
