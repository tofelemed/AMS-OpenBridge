# Task 1 (CHG-183): button standard and dialog header

Commit: `feat(cpa): CHG-183 button standard and dialog header` on `feat/cpa-redesign` (not pushed).
Spec: owner review 2026-11-14 items 2, 7, 17 and the owner decisions of 2026-11-15 (Secondary A buttons, solid
cyan dialog header = Look 1 of `17-buttons-SAMPLE.png`; Q4 "↗" links stay links).

## What changed, per file

### The standard (shared CSS)

| File | Change |
|---|---|
| `src/styles/openbridge-bridge.css` | The `obc-button` host rule now sets **Secondary A** for both the `normal` and `flat` families: enabled `surface.raised` / `border.strong` / `text.primary`; hover border and text `action.primary`; pressed `surface.selected` / `action.active` / `action.active`; disabled `surface.raised` / `border.subtle` / `text.muted`. `raised` (Primary) is unchanged, the focus ring is unchanged, the 40 px painted size is unchanged. The values sit on the host, not on `:root`, so the other users of the `--flat-*` / `--normal-*` variables (row hovers in `cpm-evidence.css`, `cpm-tables.css`, Login, the connectivity banner) keep theirs. OpenBridge has no hover or pressed text variable, so `obc-button:hover` and `obc-button:active` re-point the active text variable. A toggle that is on (`aria-pressed="true"`) keeps the pressed look, so the toggles that used to swap `flat` ↔ `normal` to show "on" still show it. Two opt-out host classes: `.ui-ghost` (the earlier transparent flat look) and `.ui-link` (action colour, underline through `::part(wrapper)`, no box; hover `action.hover`, pressed `action.active`; a disabled link drops its underline through `::part(wrapper):disabled`; focus ring kept). |
| `src/ui/components.css` | **Dialog band**: `.ui-dialog__head` is a solid `action.primary` band (top corners follow the panel radius), title and new `.ui-dialog__subtitle` in `action.on`, close button `action.on` with hover `action.hover`, pressed `action.active`, and a focus outline in `action.on` (by Day `focus` = `action.primary`, 1.00:1 on the band). Body gets 16 px under the band; the description keeps its place under it. The modal Inspector drawer (below 1280 px) wears the same band, and a state pill in its head keeps a panel background so it reads as everywhere else. **Destructive** now mixes with `text.primary` (as the sample's `.dan`), no `black` keyword. Removed the `accent` look. New **`.ui-btn` / `.ui-btn--secondary`**: Secondary A for a plain `<button>` action, same size (40 px, 16 px sides, weight 600), hover, pressed, `aria-expanded`, disabled and focus. |
| `src/ui/ui.css` | `.ui-link` (plain link-button) and its focus rule are scoped with `:where(:not(obc-button))`, specificity unchanged, so the class on an ObcButton host does not pick up `align-self`, `padding: 0` or a second focus outline. |
| `src/styles/hmi-dialogs.css` | Legacy `Modal` band (already `action.primary` through the bridge): the subtitle was a fixed light grey (`rgba(255,255,255,.8)`, unreadable on Night's light band), now the band's label colour per variant. The dead close-button rules (`--obc-button-*` variables OpenBridge never reads) are replaced by working ones: the ghost close icon, hover and focus ring take the band's label colour (`--dialog-head-on`, per variant). |
| `src/styles/cpm-historical.css` | `.cpm-compact .ui-btn` stays 32 px with 12 px sides, as the compact pages' ObcButtons do (Historical's Export trigger). |
| `src/styles/cpm.css` | `.cpm-causes__action` keeps only `white-space: nowrap`; the look comes from `ui-btn ui-btn--secondary`. |

### Components

| File | Change |
|---|---|
| `src/ui/Button.tsx` | Variants `primary | secondary | destructive | ghost | link` (default `secondary`). primary → raised, secondary → normal, destructive → raised in `.ui-button--destructive`, ghost → flat + host `ui-ghost`, link → flat + host `ui-link`. The disabled-reason behaviour is unchanged. |
| `src/ui/Dialog.tsx` | Optional `subtitle?: string`, rendered under the title on the band (`.ui-dialog__heading` wraps title and subtitle). |
| `src/components/shared/Modal.tsx` | Close button gets `className="ui-ghost"` (it would otherwise turn Secondary A on the band). |
| `src/components/Cpm/ReasonedButton.tsx` | New optional `className`, forwarded to the ObcButton host (used for `ui-link`). |
| `src/ui/trend/TrendPanel.tsx` | "Zoom area" toggle gets `aria-pressed={box.selecting}`, as `ChartZoomBar` already had, so its "on" state keeps a distinct look now that flat and normal look the same. |
| `src/components/AlarmConsole/AlarmDetailPanel.tsx` | The `✕` close button gets `ui-ghost` (a close button). Legacy module, file was already 438 lines; one attribute added, no growth. |
| `src/pages/cpa/ComponentGallery.tsx` | Gallery (dev build only, `VITE_CPA_COMPONENT_GALLERY=1`) shows the new levels: Primary, Secondary, Ghost, Destructive, Link, a plain `ui-btn`, and the dialog with a subtitle; Cancel is Secondary. |

`@lit/react` forwards `className` to the `obc-button` element (checked in its `createComponent` and already relied on by `PriorityQueue`'s `cpm-queue-row__loop`), so no wrapping element was needed.

### "↗" links (owner Q4): 59 buttons get `ui-link`

55 found by label (static text or a template ending in ↗), added mechanically; 4 with a computed label, added by hand.

- Administration: `Administration.tsx` (Audit log), `aliases/AliasPanel.tsx` (Plant model), `roles/RolePanel.tsx` (Users with this role, Permissions by role), `users/UserPanel.tsx` (Permissions).
- Cpm pages: `CpmCalculations.tsx` (Investigation), `CpmHistorical.tsx` (Loop Explorer), `CpmPerformance.tsx` (Window Inspector, Pipeline Health), `CpmReplay.tsx` (Workbench, ReasonedButton), `CpmWindows.tsx` (Pipeline Health), `GateEvidencePanel.tsx` (Loop), `GateMatrixChecks.tsx` (Review).
- `calc/CalcPanel.tsx` (Rules & parameters, Identity & raw); `config/GateConfigurationWorkspace.tsx` (Open loop); `events/ConditionDetail.tsx` (Workbench, Window Inspector); `events/EventDetail.tsx` (Historical, Loop).
- `evidence/ExplainWhy.tsx` (Hypotheses); `evidence/GateEvidenceWorkspace.tsx` (Evidence Replay, ReasonedButton; and the back link "System Response / Investigation / Window Inspector ↗", computed); `evidence/RunSummaryBar.tsx` ("Reconstruct evidence ↗", computed, see concerns).
- `explorer/CalculationsTab.tsx` (Short windows); `explorer/HistoryTab.tsx` (Loop Events ×2); `explorer/LoopModelCard.tsx` (System Response); `explorer/SignalsTab.tsx` (Show in trend, Open signals in Trend); `explorer/summary/LoopTrendPanel.tsx` (Historical, Trend); `explorer/summary/SummaryGateDetail.tsx` (Window Inspector); `explorer/summary/LoopKpiDialog.tsx` (the proof link: Calculation proof / Window Inspector / Historical ↗, computed).
- `governance/ApprovalPanel.tsx` (`<loop> ↗`); `governance/AuditEventPanel.tsx` (`<label> ↗`).
- `historical/RangeToolbar.tsx` (Open in Trend); `historical/SelectedWindowPanel.tsx` (Replay; Evidence package, ReasonedButton).
- `investigation/GateProofDialog.tsx` (Replay; Workbench, ReasonedButton); `investigation/InvestigationDialogs.tsx` (Historical); `investigation/ReviewStep.tsx` (Related events); `investigation/WhyResult.tsx` (`<gate> proof`, Calculation proof); `investigation/WindowTrend.tsx` (Evidence Replay); `investigation/NextChecksPanel.tsx` (every next-check link, computed, all end in ↗).
- `performance/PerformanceGateDialog.tsx` (Window Inspector); `registry/LoopPanel.tsx` (Workbench, Effective rules, Plant tree); `replay/RerunDialog.tsx` (Open the new run); `response/ResponseSteps.tsx` (Event states explained); `response/ResponseWorkspace.tsx` (Workbench, ReasonedButton; Open loop); `windows/SelectedWindow.tsx` (Historical, Trend).
- `Designer/TrendPage.tsx` (Loop Explorer, Historical) — the live Trend page.

The plan estimated about 34; the source has 59 (the plan counted only flat ObcButtons; ReasonedButtons, `normal` variants and computed labels add the rest). Labels ending in "→" were left as buttons (Secondary A, or Primary where raised).

### Plain `<button>` actions converted to `ui-btn ui-btn--secondary`

| File | Button | Was |
|---|---|---|
| `components/Cpm/evidence/EvidenceToolbar.tsx` | "Go to date" (Workbench band, opens the date popover) | `ui-control ui-control--ghost`: bare grey text |
| `components/Cpm/evidence/EvidenceToolbar.tsx` | "More ▾" (window options popover) | `ui-control ui-control--ghost`: bare grey text |
| `components/Cpm/explorer/ReadinessBar.tsx` | each cause's "<target> →" (opens the tab or page that fixes it) | `cpm-causes__action`: bold cyan text, no box |
| `components/Cpm/historical/RangeToolbar.tsx` | "Export ▾" (Historical toolbar) | `ui-control`: transparent outline; converted so the toolbar has one look beside its Secondary A ObcButtons (32 px kept on the compact page) |

Reviewed and left as they are (not bare-text actions, or not actions): row/list/table buttons (`cpm-admin-rowlink`, `cpm-config-rowbtn`, `cpm-event-row__select`, `cpm-matrix__loop-btn`, `cpm-matrix__result-btn`, `cpm-audit-open`, `cpm-episode__*`, `cpm-queue-row__preview`, `cpm-explorer-gates__name`, `cpm-inv-gate__head`, sort headers), cards and tiles (`cpm-kpicard--link`, `cpm-kpi`, `cpm-gate-tile`, `cpm-window-tile`, `cpm-rail__gate`, gate chips and counts, pen chips, `cpm-pill`), tabs and segmented options, icon controls (`ui-control--icon`: close, copy, theme, menu, pagination), shell controls (plant selector, search, user menu, sidebar "Collapse": owner keeps the sidebar), the range text that opens the date picker (`cpm-hist-stepper__text`), `PlantSelector` "Reset to all sites" and other existing `ui-link` buttons (already a link look), `ErrorBoundary` Reload / Go back (deliberately library-free, already outlined), `ConnectivityBanner` "Retry now" (already outlined), Login (own page styling), and legacy hidden modules (`NotificationsConfig`, `AlarmRulesConfig`, `LiveEventStream`).

### Flat buttons deliberately left ghost (`ui-ghost`)

| Button | Why |
|---|---|
| `components/shared/Modal.tsx` close (icon only) | Dialog close button on the band (plan: ghost for close buttons). The only icon-only ObcButton in the source. |
| `components/AlarmConsole/AlarmDetailPanel.tsx` "✕" close | A close button (glyph only), legacy Alarm Console. |

No other flat ObcButton was left ghost. The "‹" / "›" steppers are Secondary A, as in the sample's toolbar.

## Decisions

- **Host-scoped variables, not `:root`.** Changing `--flat-hover-background-color` at the root would have changed row hovers that borrow it; on the host only buttons change.
- **Inspector: the band only on the modal drawer.** The plan asked for the header on `ui/Inspector.tsx` "if it has a header". It has one, but at 1280 px and wider the Inspector is a persistent page panel (`<aside>`, not a dialog) on 18 pages, including Window Inspector, which the owner named as the reference design. Item 2 is about dialogs, so the band is applied where the Inspector *is* a dialog: the modal drawer below 1280 px. Extending it to the persistent panel is one selector (`.ui-inspector .ui-inspector__head`) if the owner wants it.
- **Subtitle size**: `type.body` (14 px) with no opacity (the sample used 13 px at 90 % opacity; there is no 13 px token and opacity lowers contrast).
- **Toggles**: buttons that showed "on" by swapping `flat` → `normal` (Zoom area in ChartZoomBar and TrendPanel) keep a distinct "on" look through `aria-pressed` (pressed look). "Show / Hide value table" changes its label, so it needs no pressed look.
- **"Reconstruct evidence ↗"** (`RunSummaryBar`) opens the Reconstruct dialog, not another page, but its label ends in ↗, so it follows the label rule (link). Task 6 (CHG-188, Reconstruct) is the place to correct the label or the look.
- **Design notes**: `docs/theme/redesign/components.md` §6.15 and §6.11 now state the standard (spec item 17: "add the rule to the design notes").
- **Visible text**: no production text changed, so no `## CHG-183` table in `text-changes.md`. Only the dev-only gallery's sample labels changed.

## Contrast (computed from `src/styles/traverse-tokens.css`)

| Pairing | Day | Night |
|---|---|---|
| Secondary A text: `text.primary` on `surface.raised` | 13.64 | 13.38 |
| Secondary A hover text: `action.primary` on `surface.raised` | 5.24 | 8.82 |
| Secondary A pressed text: `action.active` on `surface.selected` | 8.79 | 5.60 |
| Secondary A boundary: `border.strong` on `surface.raised` (≥ 3) | 3.15 | 3.97 |
| Link: `action.primary` / `action.hover` / `action.active` on `surface.panel` | 6.12 / 8.15 / 10.12 | 9.89 / 11.62 / 7.35 |
| Destructive: `action.on` on `status.danger.fg` (hover, pressed mixes) | 6.51 (7.77, 9.05) | 7.47 (8.32, 9.15) |
| Band title and close: `action.on` on `action.primary` | 6.12 | 10.84 |
| Band close hover: `action.on` on `action.hover` | 8.15 | 12.74 |
| Band focus ring `action.on` vs band (≥ 3) | 6.12 | 10.84 |
| (why) `focus` vs band | 1.00 | 1.21 |

## Browser check (production build on the preview server, read-only)

`npm run build`, then http://localhost:4173 against the lab API, Playwright with every non-GET `/api/` request aborted
except `/auth/login` and `/auth/refresh` (one `POST /api/v1/cpm/method-runs/evidence/batch` was blocked, so the
Workbench Proof panel by Day shows "Loading the evidence…"; it does not affect the buttons). Screenshots in
`docs/theme/redesign/evidence/chg183/` (left untracked, as earlier evidence folders):

- `toolbar-workbench-day.png`, `toolbar-workbench-night.png`: Workbench band (‹ › Newest, Go to date, Evaluate a window: Secondary A, two disabled) with the "Investigation ↗", "Evidence Replay ↗" and "Reconstruct evidence ↗" links (disabled by Day: muted, no underline).
- `page-explorer-day.png`, `page-explorer-night.png`: Loop Explorer toolbar (‹ › Live, "Historical ↗", "Trend ↗", "Show evaluated period →", "Review evidence →", "Open details").
- `dialog-day.png`, `dialog-night.png`: a KPI dialog (shared `ui/Dialog`) with the cyan band, keyboard focus on the close button (the `action.on` ring shows), footer link + Primary.
- `inspector-drawer-day.png`, `inspector-drawer-night.png`: Loop Registry at 1200 px, the modal Inspector drawer with the band.
- `page-overview-day.png`, `page-overview-night.png`: Overview ("How to read", "View all →", "All events →").
- `chg183-measure.json`: painted styles read through the shadow roots. Day rest `rgb(232,238,245)` / `rgb(117,135,156)` / `rgb(21,34,56)`; hover border and text `rgb(0,107,131)`; pressed `rgb(221,243,246)` / `rgb(0,72,90)`; link underline `underline`, disabled link `none`; band `rgb(0,107,131)` with `rgb(255,255,255)` title, close outline `solid rgb(255,255,255)`; Night band `rgb(84,214,232)` with `rgb(11,18,32)`. All match the tokens.

## Tests

New: `src/ui/Button.test.tsx` (each level's family and host class, default secondary, disabled reason),
`src/ui/Dialog.test.tsx` (subtitle under the title on the band, none when absent),
`src/styles/buttonStandard.test.ts` (Secondary A tokens for both families, hover / pressed / toggle rules, ghost and
link opt-outs, the `ui.css` scoping, `ui-btn--secondary`, the band and its focus colour, and a source scan that fails
if any ObcButton / ReasonedButton whose label ends in ↗ lacks `ui-link`; it finds 55 static ones). Each fails without
this change. No existing test asserted the changed classes, so none needed updating.

```
npx vitest run src/ui src/styles
 Test Files  21 passed (21)
      Tests  468 passed (468)

npx vitest run            (full suite)
 Test Files  326 passed (326)
      Tests  2646 passed (2646)
   Duration  270.66s

npx tsc --noEmit -p tsconfig.json     -> exit 0
npm run lint                          -> clean (--max-warnings 0)
npm run lint:theme                    -> lint:theme phase 3: 638 live files, gates T1 T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T13, matches 0
node scripts/theme/bridge-coverage.mjs -> components 20, shadow-root variables read 279, colour variables 132, unbridged 0
npm run build                         -> built in 43.74s
```

## Could not do / for the controller

- The persistent Inspector panel keeps its plain header (see Decisions); one selector extends the band if wanted.
- `Modal` (legacy pages: Alarm Console, Designer, Live Events, hidden Notifications) was changed in CSS but not screenshot: those modules are outside the CPA slice on the lab build.
- Disabled ObcButtons still say nothing on screen unless the call site uses `ReasonedButton` / `Button reason` (unchanged; not in this task).
