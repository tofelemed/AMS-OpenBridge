# Task 10 (CHG-192): every remaining dialog in the owner's dialog standard — report

Owner review 2026-11-14, item 16 (with items 0 and 17), and the owner decisions of 2026-11-15 (Q1, Q4 "↗" links stay links,
Q5 no time display change, Q6 no Record details). The look is the approved sample `17-buttons-SAMPLE.png`, Look 1. Builds on
CHG-183 (band and subtitle on `ui/Dialog`, `ui/Button` variants incl. `destructive`) and on CHG-184 … CHG-191. The full
inventory (changed · already done · no change needed and why · not a dialog · outside the CPA slice) is
`docs/theme/redesign/owner-review-2026-11-14/item16-dialogs.md`. Every visible text change is in
`docs/theme/redesign/text-changes.md` under `## CHG-192`.

## What changed, per file (all under `src/frontend-ob/src/`)

### Dialogs (item 16)
- `components/Administration/AdminConfirmDialog.tsx`: the confirm button is `ui/Button` `destructive` (every Administration
  delete and Reset to default), Cancel `normal`; new optional `subtitle` prop.
- `components/Administration/RolesConfig.tsx`: Reset to default passes the role as the subtitle.
- `components/Administration/roles/RoleDialogs.tsx`: Delete role titled "Delete role", the role as subtitle, destructive button.
- `components/Administration/users/UserEditorDialog.tsx`: Edit user has the username as subtitle.
- `components/Administration/DataSourceWizard.tsx`: Edit data source has the source name as subtitle.
- `components/Administration/ModeMapDialog.tsx`: the source name as subtitle; the explanatory paragraph became a `Part` heading
  "Source MODE value → engine token" with the token rule behind its ? ("MODE map").
- `components/Cpm/AddLoopWizard.tsx`: Edit configuration has "loop · service name" as subtitle (none on Add loop).
- `components/Cpm/registry/RetireLoopDialog.tsx`: "loop · service name" as subtitle; Retire loop is `ui/Button` destructive
  (its "Write a reason first" kept, via `Button reason`), Restore loop stays the primary `ReasonedButton`.
- `components/Cpm/explorer/LoopModelCard.tsx`: title "Loop model & setup", the loop as subtitle.
- `components/Cpm/performance/PerformanceKpis.tsx` (+ `styles/cpm-perf-list.css`): the fleet tile dialog is a `cpm-run-form`
  list of rows Basis / Meaning / Scope (same words); "Show the loops" is the raised primary.
- `components/Cpm/config/DraftBundleDialog.tsx`: "Nothing changes for a loop until a bundle is activated." moved into the Level ?.
- `components/Cpm/config/DetailsDialog.tsx`: optional `subtitle`. `config/WorkersDialog.tsx`: the loop as subtitle; the caps
  heading "APPLY acknowledgements" removed (the section keeps an aria-label).
- `components/Cpm/events/eventsState.ts`: new `episodeSubtitle(event)` ("loop · finding", the finding only when the episode has
  a peak). Used by `ShelveDialog.tsx`, `UnshelveDialog.tsx`, `EpisodeActivity.tsx` (Full history).
- `components/Cpm/replay/RerunDialog.tsx`: the Configuration legend uses the row label class (sentence case).
- `components/Cpm/replay/RunDetailsDialog.tsx`: the retention sentence (`RETENTION_NOTE`) sits behind a ? beside Proof retained.
- `components/Cpm/windows/SelectedWindow.tsx`, `WindowDialogs.tsx`, `SampleDensityDialog.tsx`: Feature flags, Sample density and
  Engine & timing take "loop · service name · <size> window" as subtitle (as Compare window sizes); the raw count is a row.
- `components/Cpm/response/ModelReviewDialog.tsx` (+ `styles/cpm-response.css`): the page-local overlay is now the shared
  `ui/Dialog` in a portal (band, focus trap, Escape, `size="wide"`; the overlay was `min(860px, 92vw)`): title "Review system
  model", "family · path" subtitle, rows State / Revision / Estimator / uncertainty / parameters, the form as `cpm-run-form`
  rows with real `<label for>`s, Cancel then Record decision. Same request (modelId, revision, decision, note, domain), same
  409 / 403 / error messages. `styles/cpm.css`: the dead `.cpm-modal`, `.cpm-modal-backdrop` and `.cpm-modal .cpm-wizard-footer`
  rules removed (nothing else used them).
- `styles/cpm-loop-summary.css`: `.cpm-loop-summary__label` (the Loop summary dialog's row labels) no longer uppercase.
- `styles/cpm-evidence-layout.css`: the gate key's group names (`.cpm-gate-legend--key`, only ever rendered in a dialog) no
  longer uppercase.

### Carried fixes
1. **Loop notes, one primary**: `components/Cpm/investigation/NoteList.tsx`: a card's Save in Edit is `normal` (was `raised`).
2. **Details grid never wraps a label**: `ui/DetailsGrid.tsx` measures each button's one-line width (a hidden copy at
   `max-content`, re-measured when the web fonts are ready) and sets `--ui-details-fit` on the grid; `ui/inspector-reference.css`
   uses `repeat(auto-fit, minmax(min(100%, max(var(--ui-details-fit), calc((100% - var(--traverse-space-2)) / 2))), 1fr))`:
   two columns while two buttons of the widest one-line width fit, else one, never more than two. Button height and font
   unchanged. A fixed `<fit>` could not serve both panels at 1440: both grids are 332 px (162 px columns); Calculations needs
   181 px for "Rules & parameters", Window Inspector 156 px for "Engine & timing". Measured result at 1440: Calculations one
   column (fit 173 px), labels one line (21 px), buttons 32 px; Window Inspector two columns (fit 148 px), buttons 32 px.
3. **Wide dialog 880 px**: `ui/components.css` `.ui-dialog--wide { width: 880px; }` (was 720). Measured need of the
   Performance gate foot: 138 (Prev, Next) + 470 (four links) + 99 (Review →) + 2 × 16 gaps + 2 × 20 padding = 781 px; 880 leaves
   ~12 % for font differences. At 1440 the foot is one line (40 px; was 80 px, two lines). The panel's existing
   `max-width: 100%` keeps it inside the screen (736 px at 768, where the foot wraps to two lines as before). Checked the other
   wide users at 880: Compare window sizes, Measured vs required, How to read, Prepare bundle draft, Shelve, Full history,
   Loop notes, Loop summary, Edit data source, Edit configuration, Review system model.
4. **Hypotheses "revision N" pill** removed: `components/Cpm/investigation/HypothesisPanel.tsx`.
5. **"CALCULATED VALUES"**: `components/Cpm/investigation/GateProofDialog.tsx` uses the dialogs' section heading class
   (`cpm-howto__title`) instead of `cpm-eyebrow`.
6. **"?" on the title's last line**: `components/Cpm/kpi/KpiCard.tsx` (+ `styles/cpm-explorer.css`). On a card that opens a
   dialog, the opener is now an empty card-wide `<button>` named by `aria-label` (it was the title's own button, laid out as
   one inline-block box, so the "?" could only go after the whole box), and the title is plain text whose last word and the
   "?" share `.cpm-kpicard__tail { white-space: nowrap }`. Tab order is unchanged (opener, then ?), the click area is the whole
   card as before, the focus ring stays on the card. At 1440 "Time in normal mode" reads "Time in normal / mode ?" (title 43 px,
   card 119 px: the same as before). Plain tiles (Workbench, Investigation, Pipeline Health) keep their title as one text with
   the ? beside it, so their `getByText(title)` lookups stay valid.

## Decisions
- **Where a subtitle goes**: dialogs that act on one object whose title does not name it (edit dialogs, Reset to default,
  Retire/Restore, Shelve/Unshelve/Full history, Workers, the Window Inspector dialogs, Loop model, Model review). Not where the
  question already names the object (the Administration delete questions: each fact once), not on create dialogs, and not on
  the Investigation dialogs and the Loop summary (owner's CHG-160 / CHG-158 rulings: the band names the loop).
- **Owner-ruled sentences kept**: Shelve / Unshelve (word for word, CHG-167), Delete role ("Users who hold this role move…",
  owner 12 Nov), Run end-to-end verification "What it does" (CHG-170 approved parts; it says what the write does), Retire /
  Restore consequence lines and the Re-run caveat (they are the confirmation, not an explanation).
- **Destructive**: deletes, Retire loop and Reset to default (it loses the page's changes). Roll back is not destructive (the
  sample keeps destructive for delete / retire).
- **Read-only dialogs** keep closing from the band (and a Close where they had one); no Close was added.
- **Cancel** in the dialogs I touched is `normal` (the `ui/Button` secondary mapping); `flat` elsewhere looks the same
  (Secondary A since CHG-183), so the rest were not churned.
- **The KPI tail is scoped to cards with a dialog**: splitting the title for plain tiles broke `getByText('<title>')` across the
  Workbench, Investigation and Pipeline tests and gains nothing the owner asked for.
- **Governance "audit-service"** and the **Window Inspector band's job name and checkpoint age**: left as they are, listed as
  owner questions in `item16-dialogs.md` (not dialogs, or not in the item0-sweep list, and changing only the dialog would make
  Governance inconsistent).

## What I could not do / notes
- **Before-shots**: only the KPI card (`carried6-kpi-before-day-1440.png`); the other befores are measurements in
  `before-facts.json` (the preview serves one build).
- **Model review** has no candidate model on the lab: its screenshots use a GET mock of `/loops/FIC10401/models` (one
  CANDIDATE model). **Loop notes in Edit** used a GET mock of `/loops/FIC10401/investigations` (one note). No write was sent:
  the route filter aborted every non-GET `/api/` request except login/refresh/evidence-batch, and `blocked` stayed empty in
  every run (nothing was even attempted).
- **Unshelve** was not shown: the lab's FIC10401 episode is not shelved (covered by `EpisodeActions.test.tsx`).
- **Designer** dialogs (shared `Modal`) and the legacy Alarm Console / Live Events / Notifications dialogs were not reviewed
  (header from CHG-183), as briefed.

## Browser check (preview :4173, lab data, read-only)
`npm run build`, then Playwright (`docs/theme/tools/lib/session.mjs`, credentials from the environment only). Screenshots in
`docs/theme/redesign/evidence/chg192/` (untracked):
- Day 1440, changed dialogs: `edit-user`, `delete-user`, `reset-role`, `edit-source`, `mode-map`, `edit-loop`, `retire-loop`,
  `loop-model`, `loop-summary`, `gate-key`, `perf-kpi`, `perf-howto`, `workers`, `draft-bundle`, `shelve`, `full-history`, `rerun`,
  `run-details`, `window-flags`, `window-density`, `window-engine`, `model-review` (each `-day-1440.png`).
- Carried fixes: `carried1-notes-edit-day-1440.png` (card in Edit: Cancel and Save secondary, "Save note" the one raised),
  `carried2-calc-panel-day-1440.png` (one column, one-line labels), `carried2-windows-panel-day-1440.png` (two columns),
  `perf-gate-G5-day-1440.png` / `perf-gate-G8-day-1440.png` (880 px, foot on one line), `carried4-hypotheses-day-1440.png`
  (no revision pill), `carried5-proof-day-1440.png` ("Calculated values"), `carried6-kpi-before-day-1440.png` /
  `carried6-kpi-after-day-1440.png`; `probe-kpi-optionB.png` is the rejected flex-title variant (the ? at the box's end).
- Wide-size users at 880: `compare-sizes`, `measured`, `perf-howto`, `draft-bundle`, `shelve`, `full-history`, `edit-source`,
  `edit-loop`, `model-review`.
- Night 1440 and Day 768: `perf-gate-G5/G8`, `retire-loop`, `edit-loop`, `model-review` (`-night-1440.png`, `-day-768.png`).
- Facts: `facts-day-1440.json`, `facts-day-1440-explorer_investigation.json`, `facts-night-1440-…json`, `facts-day-768-…json`
  (per dialog: title, subtitle, width, raised primaries, destructive buttons, foot height, caps labels found, horizontal scroll).
  Every dialog: at most one primary, `caps: []`, no horizontal scroll; the destructive confirms report their button under
  `destructive`.

## Tests
New or changed (each new assertion fails without its change):
- `styles/dialogStandard.test.ts` (new): wide size ≥ the measured 781 px (880); the gate key group names and the Loop summary
  labels not uppercase; no file under `components/Cpm` or `components/Administration` that draws a `Dialog` / `GateDialog` /
  `DetailsDialog` uses `cpm-eyebrow`, `cpm-field__label` or `eyebrow=`.
- `ui/Inspector.reference.test.tsx`: the grid's auto-fit rule; DetailsGrid sets `--ui-details-fit` from the widest one-line
  button (181 px) and leaves no measuring copy behind.
- `kpi/KpiCard.headed.test.tsx`: empty card-wide opener named by the title, last word and ? in one tail, tab order; the tail CSS.
- `explorer/summary/LoopKpiCards.test.tsx`: the card titles read from the openers' names.
- `investigation/LoopNotes.test.tsx`: one raised button ("Save note") while a card is in Edit; the card's Save is `normal`.
- `investigation/HypothesisPanel.test.tsx`: no "revision" text. `investigation/GateProofDialog.test.tsx`: "Calculated values"
  heading with the section class, no `.cpm-eyebrow`.
- `Administration/RolesConfig.test.tsx` (Delete role title/subtitle/destructive; Reset to default subtitle/destructive),
  `UserManagementConfig.test.tsx` (Delete destructive; Edit user subtitle), `DataSourceWizard.test.tsx` (Edit subtitle),
  `LoopIngestPanel.test.tsx` (Mode map subtitle, heading, rule behind the ?).
- `registry/RetireLoopDialog.test.tsx`, `registry/wizard/AddLoopWizard.test.tsx`, `explorer/LoopModelCard.test.tsx`,
  `events/EpisodeActions.test.tsx`, `events/EpisodeActivity.test.tsx`, `config/GateConfigurationWorkspace.test.tsx`,
  `config/DraftBundleDialog.test.tsx`, `performance/PerformanceKpis.test.tsx`, `replay/RerunDialog.test.tsx`,
  `replay/RunDetailsDialog.test.tsx`, `windows/SelectedWindow.test.tsx`, `response/ModelReviewDialog.test.tsx`.

## Output tails (run from `src/frontend-ob`)

```
npx vitest run src/ui src/styles src/components/Administration src/components/Cpm/{kpi,explorer,investigation,events,config,
  registry,replay,windows,response,performance}
 Test Files  152 passed (152)
      Tests  1399 passed (1399)

npx vitest run            (full suite)
 Test Files  335 passed (335)
      Tests  2811 passed (2811)
   Duration  184.39s
 (the known Designer/TrendCore.trust.test.tsx flake did not occur)

npx tsc --noEmit -p tsconfig.json   -> exit 0
npm run lint                        -> clean (--max-warnings 0)
npm run lint:theme                  -> lint:theme phase 3: 650 live files, gates T1 T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T13, matches 0
npm run build                       -> built in 17.45s
```
