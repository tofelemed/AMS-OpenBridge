# Owner production review 2026-11-14: build plan

> For agentic workers: one implementer per task, in order, in worktree `D:\HMI_Project_Usama\AMS-open-redesign`
> (branch `feat/cpa-redesign`). Commit at the end of your task; never push.

**Goal:** Ship the owner's 18 review points (items 0–17) as one frontend release.

**Spec:** `docs/theme/redesign/owner-review-2026-11-14.md`. Its "Owner decisions (2026-11-15)" section overrides the
items above it. Screenshots of today and the owner's designs are in `docs/theme/redesign/owner-review-2026-11-14/`.
`08-*-DESIGN.webp` and `13-/14-*DESIGN*.png` are designs to follow. `17-buttons-SAMPLE.png` is the approved button and
dialog look; its source is `docs/theme/redesign/samples/buttons-standard.html`.

**Tech:** React 18 + TS + Vite, vitest + Testing Library, react-query, OpenBridge React wrappers, Traverse tokens.

## Global constraints (every task)

- Read the `traverse-design-system` and `openbridge` skills before UI work. Colours come only from `--traverse-*` tokens
  (`src/frontend-ob/src/styles/traverse-tokens.css`). `color-mix()` of two tokens is allowed; hex, rgb and px font
  sizes are not. Import OpenBridge per path from `@oicl/openbridge-webcomponents-react`; icons are `obi-*` only.
- **Do not change any time or time zone display** (owner Q5: done separately later). Where the spec says "plant time",
  leave the time exactly as it is today.
- **Keep the app's sizes:** button height (40 px painted), fonts, paddings and sidebar stay. Only what the spec names
  moves or changes.
- **No repetitive text:** each fact once per screen, no explanatory sentence where a label + ? tip does.
- Every KPI keeps its drill-down. No `.tsx` file over 400 lines; split by responsibility if one grows past it.
- Tests: update the tests that assert changed text or structure, and add a test for every new behaviour (a test that
  fails without your change). Run, from `src/frontend-ob`:
  `npx vitest run <the folders you touched>`, then `npx tsc --noEmit -p tsconfig.json`, `npm run lint`,
  `npm run lint:theme`. All must pass. If the full `npx vitest run` shows a failure you did not cause, name it in your
  report.
- Record every visible text change in `docs/theme/redesign/text-changes.md`, as a table under a `## CHG-<n>` heading
  (old → new), as earlier CHGs did.
- Do not edit `changes_tracker.md`, `prod_decision.md` or anything outside `src/frontend-ob` and `docs/` (the controller
  writes the release records). No docker, and no writes to the lab.
- Commit message: `feat(cpa): CHG-<n> <summary>`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Report: write the full report to `docs/superpowers/plans/owner-review-reports/task-<N>.md` (create the folder).
  Cover what changed per file, decisions you made, what you could not do, and test output tails. Return only status,
  commit id, a one-line test summary and concerns.

---

### Task 1 (CHG-183): button standard + dialog header (spec items 2, 7, 17)

Approved look: `17-buttons-SAMPLE.png`, Look 1 (Secondary A buttons, solid cyan dialog header).

- **Buttons, globally, in `styles/openbridge-bridge.css`** (OpenBridge button families are styled by CSS variables
  there):
  - `raised` = Primary, as today.
  - `normal` and `flat` = **Secondary A**:
    - enabled: background `surface.raised`, border `border.strong`, text `text.primary`;
    - hover: border and text `action.primary`;
    - pressed: background `surface.selected`, border `action.active`, text `action.active`;
    - disabled: background `surface.raised`, border `border.subtle`, text `text.muted`;
    - focus ring unchanged.
  - Two opt-out classes on the `ObcButton` host. First check that the React wrapper forwards `className`; if it does
    not, use a wrapping element and a descendant selector.
    - `ui-ghost`: today's transparent flat look, for icon-only buttons and dialog close buttons.
    - `ui-link`: link look for buttons that open another page (label ends in "↗"). Text `action.primary`, underlined,
      no border or background, focus ring kept.
  - Apply `ui-link` to every `ObcButton` whose label ends in "↗" (about 34; owner Q4: ↗ links stay links).
    Apply `ui-ghost` to icon-only buttons.
  - Labels ending in "→" are in-page actions and stay buttons.
- **`ui/Button.tsx`:** variants `primary | secondary | destructive | ghost | link`, mapped to the above
  (destructive = `status.danger.fg` fill with `action.on` text, as in the sample). Keep its disabled-reason behaviour.
  Update its tests.
- **Plain `<button>` actions:** find plain `<button>` elements that are actions shown as bare text, not cards, tabs,
  chips, table rows or list items. Give them the Secondary A look through a shared class (`ui-btn ui-btn--secondary`
  in `ui/components.css`). List each one you changed in the report.
- **Dialog header:**
  - `ui/Dialog.tsx` `.ui-dialog__head`: background `action.primary`, title and subtitle `action.on`, close icon
    `action.on`.
  - The close button's focus ring must show on the cyan band: outline `action.on` inside the header.
  - Optional subtitle prop (`subtitle?: string`) rendered under the title, as in the sample.
  - Apply the same header to `components/shared/Modal.tsx` (10 users) and `ui/Inspector.tsx` if it has a header.
  - `blocks/GateDialog` already uses `ui/Dialog`.
- Check Day and Night. Take Playwright screenshots of one dialog and one toolbar from the built app
  (`npm run build`, then the preview server already running on http://localhost:4173, read-only, credentials from the
  environment as in `docs/theme/tools/lib/session.mjs`). Save them to `docs/theme/redesign/evidence/chg183/`.

### Task 2 (CHG-184): removals (spec items 0, 1, Q6, 11.3 Identity/Configuration, 9 run id, 15 run UUID, 12 "unit not set")

- **Item 0 sweep, every CPA page and dialog, including Pipeline Health and Administration (Q1 yes):**
  - Remove ids, versions, hashes, Flink job ids, run ids, bundle ids, method versions ("v3.0.0"), metric codes shown
    as labels (CPLM-0xx), and build or capability wording ("not installed in this build").
  - Keep human names that are the subject of a page (a job's readable name on Pipeline Health, a user's name in
    Administration).
  - Write `docs/theme/redesign/owner-review-2026-11-14/item0-sweep.md`: page · what was removed · what was kept and why.
- **"Record details" everywhere (Q6):** remove the button from Loop Events `events/EventDetail.tsx`, Window Inspector
  `windows/SelectedWindow.tsx` (DETAILS grid), Calculations `calc/CalcPanel.tsx` and any other panel.
  Delete each record dialog nothing else opens. Governance audit record dialogs are the audit content itself:
  keep them and list them in the sweep file.
- **Identity & raw tab removed** (`evidence/tabs/IdentityTab.tsx` and its tab entry). A URL with `tab=identity` lands on
  Proof. Remove "Identity & raw ↗" links elsewhere (Calculations panel).
- **Rules & parameters:** remove the CONFIGURATION section completely (bundle id, copy button,
  "Configuration used by this run ↗", `tabs/RulesTab.tsx` ~line 85).
- **Workbench header:** remove the run id and copy button (`evidence/RunSummaryBar.tsx`, `CopyableId`). Delete
  `CopyableId` if unused.
- **Reconstruct dialog:** remove the Run UUID row (`evidence/ReconstructDialog.tsx`).
- **"unit not set":** `pvAxisName` in `trend/trendOption.ts` returns "PV / SP" when there is no unit. Check every place
  that prints "unit not set".

### Task 3 (CHG-185): Loop Explorer (spec items 4, 5, 6; Q2 one grid, Q3 colours)

- **Item 4:** `explorer/summary/LoopKpiCards.tsx`.
  - One grid of all 9 cards, wrapping by width. The group name becomes a small line on each card.
  - Card: title at top, then value. The explanation moves to a hover / focus / tap tip (reuse `ui/Toggletip`).
  - Same card style as Overview (`overview/OperatingPicture.tsx`, `cpm-kpicards`). The drill-down
    (`LoopKpiDialog`) stays.
- **Item 5:** `explorer/summary/SignalStrip.tsx`.
  - More space between PV, SP, OP and Mode.
  - State colour, live values only:
    - PV outside the good band of SP → amber + "Off setpoint";
    - OP at a registered range limit → amber + "At limit";
    - Mode not a normal mode → amber + its name;
    - otherwise neutral;
    - SP always neutral.
  - Stale or historian values: no state colour.
  - Use status tokens (`status.warning.*`); the labels keep `--signal-*`. No green, no red.
  - Find where the good band, OP range and normal modes come from (the G3 / "Time at an OP limit" / "Time in normal
    mode" calculations and the loop registry). If one is not on the page, leave that reading neutral and say so in
    the report. Do not invent a threshold.
- **Item 6:** redesign `explorer/HistoryTab.tsx` (+ `historyQuery.ts`) per the spec.
  - Compact list: Period · Finding · Episodes · Peak score · Review state · one "Open in Loop Events" button per row.
  - Episodes open inline as sub-rows showing only period and score.
  - Review state as the normal status badge in sentence case.
  - No repeated parent text, no "window(s)".
  - Every fact on today's tab still shown.

### Task 4 (CHG-186): Investigation, five tabs (spec item 8)

Follow `08-result-tab-DESIGN.webp` for Result, then the same language for Evidence, Windows, Hypotheses and Review.
- The Windows pager (‹ Newer · 1–5 of 100+ · Older ›) goes top right on the heading line (`08-windows-pager-DESIGN.webp`).
- Map every fact on today's Result tab to the design. A fact the design has no place for goes in a "More" disclosure
  at the bottom of that tab, listed in the report (never dropped silently).
- "Persisting": use the episode's open-since if it exists. If not, leave the tile out and say so.
- The trend stays as it is. Files: `investigation/*`.

### Task 5 (CHG-187): Evidence Workbench, gate results (spec items 9, 11)

- **Item 9:** labels instead of sentences (table in the spec).
  - Window selector text not cut.
  - G14 on one line in the gate list.
  - Compact one-line footer: window · samples · rate. Leave the times as they are.
- **11 header:** one retention label with a ? tip.
- **11.1:** Proof table in `ui/DataTable` style (Measure · Value with unit). "Measured vs required" + "What remains open"
  (`ExplainWhy.tsx`) move from the bottom of every gate into a "Measured vs required" button in the gate header that
  opens a dialog (table: measure · measured · required · pass / fail). State-only gates show a "State check" label and
  no button.
- **11.2:** each fact once.
  - Remove the sentence (`views/headlines.ts`) where tiles repeat it; keep real limits as a small flag.
  - Tiles become KPI cards (as Task 3's card).
  - G8: the measure tile instead of method / bicoherence / capability tiles; no `XCORR_ASYMMETRY_V1` pill; plain
    legend names.
  - G5: plain chart caption and axis name.
  - G14 / G15: decision as KPI cards; hypotheses as a table (rank · hypothesis · status badge · score · from); no
    repeated cause / case / condition rows.
  - No caps eyebrow labels.
  - Check every gate G0–G15 against the lab data on :4173.
- **11.3:** Rules & parameters: plain "Needs"; drop method version, Tier, caps role; profile shown by its name.
  Signal context: only the footer line changes.

### Task 6 (CHG-188): Evaluate a window + Reconstruct progress (spec items 10, 15)

- **Evaluate a window** (`evidence/EvaluateWindow.tsx`) becomes a dialog (Task 1 header).
  - Length as a 12h / 24h segmented control.
  - End time with "Now" as default; the window it will evaluate shown before you click.
  - Primary button: Evaluate.
  - After Evaluate, the dialog shows the run's states from the status API (`evaluationState.ts`: use only the states
    it really reports, no fake percent): Queued → Running (spinner + elapsed) → Done.
  - On Done it closes by itself, the page shows the evaluated window, and the form is closed.
  - Failure or timeout: it stays open with the reason and Retry.
- **The result note** (`evidenceBasis.ts`) becomes one "Re-evaluated" label with a ? tip (when it ran, from the
  historian, kept 3 days). No "artifact(s) rebuilt".
- **Reconstruct evidence** (`evidence/ReconstructDialog.tsx`):
  - one line of text;
  - rows Loop, Gate, Window;
  - Reconstruct as primary, Cancel as secondary;
  - the same Running → Done → auto-close progress, and Retry on failure.

### Task 7 (CHG-189): Evidence Replay (spec item 12)

- PV / SP axis name not cut (check `replay/ReplayChart.tsx` against the CHG-181 fix in `trend/trendOption.ts`).
- **Evidence check card:** more space per field; the verdict as a headline; even rows.
- **Loop notes:** a "Loop notes (n)" button under the Evidence check card opens a dialog with the form and the note list
  as cards. Edit an existing note through an Edit action. No "RECORD IT", and "1 note" rather than "1 note(s)".
  - Reuse the same notes dialog on the Investigation Review tab (`investigation/ReviewStep.tsx`).
  - Loop Events (`events/EpisodeActivity.tsx`) already shows notes in its "Full history" dialog: leave it.
- **Evidence package:** after the zip downloads, the package dialog says "Downloaded <file>.zip", plus any part not read.
- **Cursor readout:** styled as the Loop Explorer readings (value + unit), Mode as its word (Auto), and
  "Sample 8,639 of 8,639". The time stays as it is today.
- **Footer:** the same compact footer as Task 5.

### Task 8 (CHG-190): Window Inspector + Calculations (spec items 13, 14, Q7)

- **Window Inspector:** bring the toolbar and window list to the look of the selected-window panel (the reference
  design).
  - "Same loop, every short granularity" (`windows/CompareAcrossKinds.tsx`) moves into a wide dialog, opened by a
    "Compare window sizes" button in the page toolbar.
  - Historical ↗ / Trend ↗ stay links.
- **Calculations panel** (`calc/CalcPanel.tsx`), in the reference design:
  - title with a ? tip, and the metric code moved into the tip;
  - Value + unit as one row;
  - Gate row;
  - Method as the formula only, with its explanation in a tip;
  - a DETAILS grid of buttons (Rules & parameters, Method);
  - "Open G0 proof →" as the full-width primary button.

### Task 9 (CHG-191): Performance gate dialog (spec item 3)

- Wider, two columns.
- One window line instead of Assessment + Window from + Window to; no "Gate role" row; no caps labels.
- Actions grouped: Prev / Next together, then the "↗" links, then the Review primary.
- The body (`EvidenceBody` in `GateEvidencePanel.tsx`) is shared with `explorer/summary/SummaryGateDetail.tsx`: check
  both.

### Task 10 (CHG-192): every remaining dialog (spec item 16)

- Inventory every dialog (`ui/Dialog`, `shared/Modal`, `role="dialog"`) not already redone by Tasks 1–9.
- For each one, apply: header subtitle where useful, label / value rows, no caps labels, no repeated or explanatory
  sentences, one primary action.
- Write `docs/theme/redesign/owner-review-2026-11-14/item16-dialogs.md`: dialog · page · what changed.

### After Task 10 (controller)

Whole-branch review → lab preview check in Day and Night at 1440 / 1000 / 768 / 390 → `changes_tracker.md`,
`prod_decision.md`, push.
