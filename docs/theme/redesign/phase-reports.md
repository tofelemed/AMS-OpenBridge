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
