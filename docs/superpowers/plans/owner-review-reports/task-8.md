# Task 8 (CHG-190): Window Inspector and Calculations in the reference panel design — report

Owner review 2026-11-14 items 13 and 14, with the owner decisions of 2026-11-15 (Q4: "↗" links stay links; Q5: no time display
change; Q6: no Record details; Q7: "Compare window sizes" button + wide dialog). Builds on CHG-183 (Secondary A / primary buttons,
cyan `ui/Dialog` with `subtitle` and `size="wide"`, `ui-link`), CHG-184 (Record details and Identity & raw already gone) and the
CHG-187/189 "button opens a dialog" pattern. Every visible text change is in `docs/theme/redesign/text-changes.md` under `## CHG-190`.

## The reference design is not today's panel (read this first)

The brief said to keep `windows/SelectedWindow.tsx` as it is because it already is the reference. It is not: the owner's image
`13-window-inspector-DESIGN.png` (= `14-DESIGN-window-panel.png`) has the links top right beside the title, even rows with no rules,
a caps "DETAILS" head over a two-column grid of bordered buttons with "›", and a full-width primary on a tinted foot. Today's panel
(`before-windows-day-1440.png`) stacks the three dialog buttons and the two links in columns under the rows and has a text-width
primary. No version of `SelectedWindow.tsx` in git ever had a DETAILS grid (checked CHG-144, CHG-154, CHG-164, CHG-184; the image
still shows Record details, so it is a mock-up drawn before CHG-184). There was therefore no DETAILS component to reuse for the
Calculations panel either. I built the reference design once, as a shared opt-in (`Inspector variant="reference"` + `ui/DetailsGrid`),
and applied it to both panels, so the Window Inspector panel now matches the image the owner calls the reference, and the
Calculations panel matches it too. SelectedWindow's content (rows, dialogs, links, primary) is unchanged; only where the parts sit.
If the controller wants SelectedWindow left exactly as it was, revert `windows/SelectedWindow.tsx` alone: the shared parts stay
opt-in and the Calculations panel is unaffected.

## What changed, per file (all under `src/frontend-ob/src/`)

### Shared panel parts
- `ui/Inspector.tsx` (94 lines): new opt-in props `variant="reference"` (adds `ui-inspector--reference`), `titleTip` (a ? beside the
  title, in a `ui-inspector__title-row`), `actions` (links top right of the head; in the drawer below 1280 px they open the body,
  because the head is the cyan band and action-coloured links would vanish on it) and `details` (a slot between the rows and the
  foot, so the Details part's rule runs edge to edge). An Inspector without these props renders exactly as before (tested).
- `ui/DetailsGrid.tsx` (new, 37 lines): caps head "Details" (an `h3`, uppercase by CSS) labelling a region, then two columns of
  Secondary A buttons (`ui-btn ui-btn--secondary`, the CHG-183 standard), each label + "›" (`aria-hidden`); `dialog` sets
  `aria-haspopup="dialog"`; `disabled` supported (the panel says why on screen, under its primary). No `title` tooltips (T8).
- `ui/inspector-reference.css` (new, tokens only): title row; actions (their last text ends on the rows' edge, as CHG-159 did for
  Historical's links); Details part (`border.subtle` rule, metadata-size caps head, `repeat(2, minmax(0, 1fr))`, labels wrap inside
  the button rather than overflow); reference foot on `surface.page` with no second rule under Details and a full-width `obc-button`.

### Window Inspector (item 13, Q7)
- `components/Cpm/windows/SelectedWindow.tsx`: `variant="reference"`; Historical ↗ / Trend ↗ moved to `actions` (still `ui-link`
  ObcButtons, Q4); Feature flags (short tier only), Sample density, Engine & timing moved to the Details grid (same dialogs);
  Inspect this window → is `fullWidth`. No Record details (Q6, verified). Times unchanged (Q5).
- `components/Cpm/windows/CompareAcrossKinds.tsx`: the old bottom section is now `CompareAcrossKinds` (the dialog body: Metric
  select + its ? over the table) and `CompareWindowSizes` (a Secondary "Compare window sizes" button with `aria-haspopup="dialog"`
  that opens a wide `ui/Dialog`, portalled to the body because the band is sticky; footer "Close"). Same query
  (`useCpmKpisByResolution(loop, kinds, 12)`), same statistics, same row-click behaviour (it sets the page's profile); the click now
  also closes the dialog so the user sees that size. The rows are read only while the dialog is open (before: on every page load).
  Labels tidied (each fact once): first column "Size" with the profile list's name ("15 min · 5 min slide") instead of the
  monospace "15m" over "15 min / 5 min slide"; "(last 12)" said once, on "Windows (last 12)", not on Median and Range; tip says
  "size" for "kind" / "granularity".
- `components/Cpm/CpmWindows.tsx` (175 lines): the button sits in the band's end after "Pipeline Health ↗" (as Replay puts
  "Evidence package" after "Workbench ↗"), shown with a loop and short sizes as the section was; subtitle
  "FIC10401 · Flow controller (FCS0101) · 15 min window" (tag · `serviceName` · the window size as the panel title prints it). The
  section under the list is gone. The list section is `cpm-windows-list`, labelled by its new title.
- `components/Cpm/windows/WindowList.tsx`: `WindowListBar` is the panel head: title "Windows" (section-title size, as the panel's
  title), the "All windows" filter top right (only when there are rows to filter, as before). No column, filter or control removed.
- `styles/cpm-master-detail.css`: list panel radius = the inspector's (`radius.panel`); list head; even rows in a reference panel
  (`align-items: center`, `min-height: size.row-compact` = 40 px, no rule between rows — today's rows were 36–38 px, so a panel
  grows by a few px); full-width `ReasonedButton` in the reference foot; Compare dialog bar; Method dialog text. Removed the
  now-unused `.cpm-master-detail__bar` and `.cpm-master-detail__links` rules.

### Calculations panel (item 14)
- `components/Cpm/calc/CalcPanel.tsx` (121 lines): `variant="reference"`.
  - Title = the name; its ? (label = the name) holds the catalogue description and "Calculation CPLM-001" (the ProofTab wording
    from CHG-187).
  - Value + unit one row: "1.00 ratio", "0.7103 kg/h", "0.42 score". The number keeps its monospace, the unit plain. The list
    (and `valueText`) leave a ratio / fraction bare, so the panel adds the catalogue word for those (the old Unit row's fact); a
    count reads bare ("8,639", the Proof table's rule) and the 0–100 evidence score keeps "73 / 100". The PV-unit line ("the loop's
    PV unit (PV units)" / "no PV unit is set on this loop") stays, under the value. The Unit row is gone.
  - Gate row unchanged ("G0 · Data quality" + the existing badge + its ?).
  - Method row = the formula only; "Method ?" (tip label "How it is computed", so it does not share a name with the Method button)
    holds the explanation.
  - Details grid: "Rules & parameters ›" (opens the Workbench's Rules tab of the run, as the ↗ link did; disabled with no run) and
    "Method ›" (opens the new Method dialog). "Identity & raw" was already gone (verified; no "↗" left in the panel).
  - "Open G0 proof →" (gate-specific as before) is the full-width primary; the no-run reason still shows under it.
  - The stale-value warning is unchanged.
- `components/Cpm/calc/MethodDialog.tsx` (new, 31 lines): small `ui/Dialog` "Method", subtitle the name; rows "Formula", "Unit"
  (in the loop's unit), then the explanation; footer "Close". The Unit row here also keeps the unit reachable when the value is
  "Not calculated" (no number to carry it on the Value row).

## Decisions
1. Built the reference design as a shared opt-in and applied it to SelectedWindow too (see the first section).
2. Rules & parameters became a Details button (spec 14 and the brief), so it lost its "↗" (a "↗" label must be a link, Q4); it still
   navigates to the Workbench Rules tab. Its chevron is "›" like the others.
3. Method explanation appears both behind the Method row's ? and in the Method dialog, as the brief asked; the dialog adds the
   unit. The title tip holds the description + code, so the three never say the same sentence.
4. Compare dialog subtitle uses the selected window size ("15 min window"), not the selected window's time range: the table's
   statistics come from each size's latest 12 windows, not from the selected window, so a range would mislead.
5. Window list title "Windows" (the brief asks for a title row with the actions top right; the filter is the list's action).
6. The Compare button sits at the band's end, beside the other link/action, as on Replay and Historical.
7. Details buttons keep the page's compact 32 px (CHG-164 `cpm-compact`); the primary keeps its height; only widths change.
8. In the drawer, the links sit at the top of the body, right-aligned (the head band is the action colour).

## What I could not do / notes
- **Lab data:** FIC10401's calculations on the lab are "Insufficient data" / "Not calculated" for the newest window, so the browser
  shows no "1.00 ratio"; the value + unit row is covered by tests (ratio, PV unit, no PV unit, other unit, count, 0).
- The before captures show the lab's "The API is returning errors" banner (lab state at 06:2x); the Calculations before capture
  caught the window list still loading. The after captures had no banner. Both were read-only.
- Spec "plant time" bullets left as instructed (Q5). No other page uses `variant="reference"` yet (other detail panels are out of
  this task's scope).

## Screenshots (`docs/theme/redesign/evidence/chg190/`, untracked)
Built with `npm run build`, captured on http://localhost:4173 (Playwright, `docs/theme/tools/lib/session.mjs`) with a route filter
that let through GET/HEAD/OPTIONS, `/auth/login`, `/auth/refresh` and the read POST `/api/v1/cpm/method-runs/evidence/batch`; it
blocked every other `/api/` request: none were attempted (`blocked: []` in each facts file). Loop FIC10401, profile 15m.
- Before (Day 1440): `before-windows-day-1440.png` (full page), `before-calc-day-1440.png`, `before-calc-panel-day-1440.png`.
- After (Day 1440): `after-windows-day-1440.png` (full page), `after-calc-day-1440.png`, `after-calc-panel-day-1440.png`,
  `after-compare-dialog-day-1440.png` (720 px wide, 6 sizes, heads Size · Latest MAE · Median · Range · Windows (last 12)),
  `after-calc-title-tip-day-1440.png` ("Fraction of expected samples present in the window." / "Calculation CPLM-001"),
  `after-calc-method-dialog-day-1440.png`.
- Night 1440: `after-windows-night-1440.png`, `after-calc-night-1440.png`, `after-calc-panel-night-1440.png`.
- Day 768: `after-windows-day-768.png` (no horizontal scroll), `after-windows-drawer-day-768.png` (links under the band),
  `after-calc-day-768.png`, `after-calc-panel-day-768.png` (drawer).
- Facts: `before-facts.json`, `after-facts.json` (dialog title/subtitle/width/heads, panel rows, Details labels, primary 332 px of a
  372 px foot = full width inside the 20 px padding, no "Identity", no "Record details", no bottom section), `after-drawer-facts.json`.

## Tests
New or changed (each new one fails without this change: run against the stashed old source, 18 tests failed and
`ui/Inspector.reference.test.tsx` could not load):
- `ui/Inspector.reference.test.tsx` (new, 7): title row with ? and links in the head on wide screens; links in the body in the
  drawer; Details between rows and foot, `aria-haspopup`, Secondary A, disabled; a plain Inspector unchanged; CSS rules (two
  columns, rule above Details, tinted foot, full-width primary, even rows, no colour literals).
- `components/Cpm/calc/CalcPanel.test.tsx`: code only in the title ? (with the description); Value / Gate / Method with no Unit row;
  "1.00 ratio"; PV unit, no PV unit, other unit, a bare count; Method formula only with the explanation behind its ?; Details grid
  [Rules & parameters, Method], outside the body, Method dialog (name, formula, unit, explanation); full-width primary in the foot;
  Rules & parameters as a button (disabled with no run); no "Identity & raw", no "↗".
- `components/Cpm/windows/SelectedWindow.test.tsx`: links in the head's actions with `ui-link`; Details grid of three dialog
  buttons outside the body; full-width primary in the foot.
- `components/Cpm/CpmWindows.page.test.tsx`: no comparison section and no read of it on the page; Compare window sizes opens the
  wide dialog with the subtitle, the heads, the size names, the range and the query (loop, kinds, 12); Metric switch; a picked size
  sets `profile=` and closes the dialog; the list region "Windows" with the Sample count filter in its head.

Checks (from `src/frontend-ob`):
```
npx vitest run src/components/Cpm/windows src/components/Cpm/calc src/components/Cpm/CpmWindows.page.test.tsx \
  src/components/Cpm/CpmCalculations.page.test.tsx src/components/Cpm/CpmCalculations.band.test.tsx src/ui src/styles
 Test Files  37 passed (37)
      Tests  613 passed (613)

npx vitest run
 Test Files  333 passed (333)
      Tests  2774 passed (2774)        (TrendCore.trust did not flake in this run)

npx tsc --noEmit -p tsconfig.json      (no output)
npm run lint                            (eslint, --max-warnings 0: clean)
npm run lint:theme
lint:theme phase 3: 650 live files, gates T1 T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T13, matches 0
```
