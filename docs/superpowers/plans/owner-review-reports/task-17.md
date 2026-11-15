# Task 17 — CHG-200: fixes from the final browser test of the owner-review batch

Branch `feat/cpa-redesign` after CHG-199 (`a21c64d5`). Frontend only (`src/frontend-ob`). Brief:
`.superpowers/sdd/2026-11-15-owner-prod-review/fix-pass-2-brief.md`; findings: `final-test.md` #1-#32; controller items C1-C9.
One commit (this report rides in it). Not pushed. No docker, no subagents. Text changes: `docs/theme/redesign/text-changes.md`
`## CHG-200`. Re-shots (PNG, device scale 1, not committed) under `docs/theme/redesign/evidence/final-2026-11-15-fixes/`; the
paths below are relative to that folder. Re-shot tooling: scratchpad `final-test/reshoot.mjs` (the final test's guard and mocks;
0 blocked calls).

## The main pieces

- **Trend labels never on a line or another label (#2, #4, #15, C2).** New `response/trends/labelLayout.ts`. Each trend's value
  axis is now fixed (`trendSupport.trendYRange`, rounded out with the new `evidence/niceRange.ts`; CpmChart's new optional
  `yRange`), so every mark's pixel place is known before ECharts draws it. Each label tries its old place first, then the free
  places around what it names (the other side, above / below, further out), clamped to the plot; it is drawn at the chosen
  corner (`annotations.drawMarks`, one markPoint per label). A label that fits nowhere, and below a 600 px chart every label that
  carries a value, is listed in one line under the chart (CpmChart `annotate` may now return `{ series, notes }`; it receives the
  plot size). An ECharts SSR test checks that each label is drawn exactly where the layout put it.
- **Redraw Done (#1).** `RedrawAction` is now two parts: `RedrawButton` in the note and `RedrawDialogHost`, whose open state lives in
  `EventPanes` and which renders outside the note, so it survives the moment the redraw lands. Pane-level test
  (`redraw/RedrawDone.test.tsx`): the page reads the cache as ResponseWorkspace does; Done shows with the trends behind it, then the
  dialog closes by itself. Seen on the real FIC10502 redraw: Done, then closed.
- **One number form (C7, #7).** `evidence/format.plainNumber` (no exponent: `readable` from 0.0001, "< 0.0001" below; the space does
  not break); `responseSupport.fmt` keeps its two decimals but groups from 1,000 and never writes an exponent; `typographicUnit`
  ("PV_EU^2*s" → "(PV_EU)²·s", unit words fraction / dimensionless / 1 dropped) is the one unit helper of the tables, the result card
  and the trends (`responseFacts.unitOf` uses it); the ± is joined by no-break spaces. Every System Response label uses
  `plainNumber`.

## Per finding

| # | Fixed | What was done | Re-shot |
|---|---|---|---|
| 1 | yes | dialog lifted out of the note (above) | `response/redraw-real/fic10502-dialog-done-1440-day.png`, `…-redrawn-1440-day.png` |
| 2 | yes | label layout; below 600 px the values are listed under each chart; labels clamped to the plot | `response/real-response-390-day.png` |
| 3 | yes | at ≤ 600 px the dialog's facts stack (label above value), the form is one column, the input has no 14 rem minimum, the decision choices wrap; the facts grid never exceeds its box (`minmax(min(260px, 100%), 1fr)`) | `response/model-review-dialog-390-night.png`, `-390-day.png` (body scrollWidth = clientWidth = 356) |
| 4 | yes | the two band labels are placed one above the other (layout) | `response/mocked/b-setpoint-step-response-1440-day.png` |
| 5 | yes | path from the artifact where the writer put "fit"; condition number rounded; "Baseline"; "Fit error, (PV unit)²"; a gap before each section after the table | `response/real-fit-1440-night.png` |
| 6 | yes | no eyebrow; "Loop gain" / "Loop phase" titles and legends (CSV columns kept); no "dimensionless"; one sentence; log frequency axis (CpmChart `logX`) | `response/mocked/a-flow-input-test-frequency-1440-day.png` |
| 7 | yes | plain numbers and typographic units (above); "63 % time" | `response/real-response-1440-day.png`, `response/real-steps-1440-day.png`, `response/steps-outputs-dialog-1440-day.png`, `response/mocked/c-level-input-test-response-1440-night.png` |
| 8 | yes, with a limit | below 600 px the title (and its "?") takes the head's first row, the tools sit in rows under it, no button wraps its text. At 390 the four tools need two rows (sizes kept), so a head is ~100 px | `response/real-response-390-day.png` |
| 9 | yes | one rule for every tab strip (`ui/ui.css`): at ≤ 600 px the tabs wrap onto further rows; the Explorer row's end link wraps under them | `explorer/summary-390-day.png`, `explorer/history-390-day.png`, `governance/page-390-day.png`, `config/bundles-390-day.png`, `response/real-response-390-day.png` |
| 10 | yes | below 600 px the findings read as one card per loop (head row kept for screen readers, each value names its column via `data-label`) | `performance/page-390-day.png` |
| 11 | yes | from 1280 px the gate title and its pills keep their full width; the actions wrap under them when the row cannot hold both | `evidence/page-1440-day.png`, `-night.png` |
| 12 | yes | "The decision record is not stored for this run" / "Reconstruct the evidence to see it."; a declared kind "PSD: Expired (Retention)" | `evidence/artifact-not-available-mocked-1440-day.png` |
| 13 | yes | normal modes neutral, manual / not recognised amber (`classifyMode`), the word ("Auto") on the bar and in the readout | `historical/widened-30d-1440-day.png`, `-night.png` |
| 14 | yes | the error class name dropped; "Read so far: …" while it builds (`evidencePackage` reports each part as its read settles) | `replay/package-building-1440-day.png`, `replay/package-message-1440-day.png` |
| 15 | yes | layout (as #2) | `response/mocked/a-flow-input-test-response-1440-day.png`, `response/redraw-real/fic10502-redrawn-1440-day.png` |
| 16 | yes | a chart of 200 px or less asks for three value steps; the Input trend's fixed axis holds three steps at most (four numbers) | `response/real-fit-1440-night.png`, `response/real-response-1440-day.png` |
| 17 | yes | Export CSV in the head on Residuals, Autocorrelation, Delay search, Loop gain, Loop phase | `response/real-fit-1440-night.png`, `response/mocked/a-flow-input-test-frequency-1440-day.png` |
| 18 | yes (with C1) | the dialog no longer promises Error from the setpoint; it appears when it reproduces | `response/redraw-real/fic10502-dialog-form-1440-day.png` |
| 19 | yes | a linked chart (connect group) clears its undo when the group returns to the whole range (`useBoxZoom` `linked`) | `response/mocked/zoom-linked-after-reset-1440-day.png` (every Undo disabled after Reset) |
| 20 | partly | family in words (Models table, Review subtitle); axis padded with a readable step (C8); created stamp on one line. Not done: the date at day changes on the time axis (owner Q5: no time format change) | `response/real-models-1440-night.png` |
| 21 | partly | gate dialogs: title "G8 · <gate name>", the loop as subtitle, the gate name said once; Reconstruct: subtitle "<loop> · <gate>" (rows Loop / Gate dropped, each fact once); Evidence package: subtitle "<loop>"; Measured vs required: Close in the foot. Not done: the Governance Verify dialog (it has no loop or gate to name; its title says what it verifies) | `performance/gate-dialog-1440-day.png`, `evidence/measured-vs-required-1440-night.png`, `replay/package-message-1440-day.png` |
| 22 | partly | "Done" (run dialogs, redraw) and "Downloaded" in the neutral badge. Not done: the "Validated" / "Estimated" dots, the Signal quality "Good" dot and the "✓ Acknowledged" / "Active (verified)" checks: they are the shared good tone (`--tone-success`) on many pages; the Day / Night difference is the token's own value (#16724A vs #56D6A1), not a code path. Owner decision | `response/redraw-real/fic10502-dialog-done-1440-day.png` |
| 23 | yes | ReasonedButton: "Select a loop in the list first." under the link | `performance/page-1440-day.png` |
| 24 | no | Calculations: the duplicate sentence and the two pill styles come from two components and the panel; not a small change in this pass | — |
| 25 | no | Historical empty range: one empty state with one button needs the chart foot, the captions and the panel reworked together; not small | — |
| 26 | partly | "Severity", "Timing" (button and dialog), "Time in Auto", "In Auto", "Unknown type", "e.g. Normal operation". Not done: Governance entity ids and "Recorded by user id only…" (record data), Gate Configuration codes and Admin permission keys (owner to confirm they are accepted terms) | `investigation/result-1440-day.png`, `windows/page-1440-day.png`, `replay/page-1440-day.png`, `registry/page-1440-day.png`, `response/model-review-dialog-1440-day.png` |
| 27 | yes | placeholder "User name" | `governance/page-1440-day.png`, `governance/page-390-day.png` |
| 28 | yes | Registry, Gate Configuration and Governance table heads take the standard head (upper case, 12 px, weight 600) | `registry/page-1440-day.png`, `governance/page-1440-day.png` |
| 29 | yes | the case select has one width (12 rem) on every tab | `investigation/result-1440-day.png`, `investigation/evidence-1440-day.png` |
| 30 | yes | after 5 minutes the badge says "… Still running" (neutral) with Keep waiting | unit test (the 5-minute mock was not re-run) |
| 31 | yes | "0 evaluated · 12 declined" | `windows/compare-window-sizes-1440-day.png` |
| 32 | yes | "Non-overlap" kept whole, the label wraps as two lines like its neighbours | `events/episode-panel-1440-day.png` |

## Controller items

| Item | Fixed | What was done |
|---|---|---|
| C1 | yes | `plannedTrends` names only the trends that draw for sure; Error from the setpoint is never promised |
| C2 | yes | label layout (above); FIC10502: "Dead time 0 s" after the step line, "Gain (model)" off the OP line, "Final value" off the PV line; setpoint step: "90 %" / "Measured 63 %" off the PV line, the band labels stacked |
| C3 | yes | the Input trend's axis holds three steps at most (four numbers); other charts of 200 px or less ask for three |
| C4 | yes | once redrawn, the charts note goes; the one redrawn line says it |
| C5 | yes | `exportInHead` on every Fit quality and Frequency chart |
| C6 | yes | no step codes; Loop gain / Loop phase; no Covariance pill; no "dimensionless"; quantity rows in the trends' words; "Mean absolute error", "RMS error", "Prediction RMS error", "Fit improvement" (no "fraction"); one safety sentence; CSV keys unchanged |
| C7 | yes | one number form and one unit helper (above) across the result card, tables, labels and the Review dialog |
| C8 | yes | `niceRange.paddedRange`: a model trend's axis is at least a tenth of the value wide, with a readable step |
| C9 | yes | gap before the next section; validation facts one per line; Support in tabular figures, not monospace |

## Tests and checks

TDD: every behaviour test was run and seen failing first. New: `evidence/niceRange.test.ts`, `evidence/CpmChartLayout.test.tsx`,
`response/trends/labelLayout.test.ts`, `response/redraw/RedrawDone.test.tsx`, `response/plainNumbers.test.tsx`,
`charts/useBoxZoom.test.ts`, `evidence/MeasuredCheck.test.tsx`, `registry/RegistryList.test.tsx`, `windows/CompareAcrossKinds.test.tsx`;
added cases in `ResponseTrends`, `ModelHistory`, `GateMatrixChecks`, `PackageDialog`, `ReconstructDialog`, `views`, `lanes`,
`CpmPerformance`, `redrawArtifacts`, `RedrawDialog`. Changed expectations for the new words and number forms (no exponent, grouped
thousands, no-break ±, gate dialog titles, Timing / Severity / Time in Auto).

Before the commit (after the last code change): `npx vitest run` 360 files / 2984 tests passed (was 351 / 2941); `npx tsc --noEmit`
clean; `npm run lint` clean; `npm run lint:theme` 0 matches; `npm run build` built (the preview dist with
`VITE_LOOP_ROOT_PREFIX=root.hdpev2.cpm`). Two earlier full runs under load each had one timing failure that passed alone and in the
next full run: `Designer/TrendCore.trust.test.tsx` (the known flake) and the first case of `config/GateConfigurationWrites.test.tsx`
(`findByRole` timed out at ~2 s; no config code changed). Re-shots: 0 blocked calls, 0 errors.

## Concerns

1. #8 at 390: the four chart tools take two rows under the title (sizes kept); a single "Chart tools" menu would be a new control.
2. The label layout estimates text width (no canvas measuring in tests); a very long label on a crowded narrow chart goes to the
   line under the chart rather than risk an overlap.
3. #22, #24, #25 and parts of #20 / #21 / #26 are left (reasons above).
4. Shared pieces reach past System Response by design: the three-step hint applies to every CpmChart of 200 px or less (the
   Workbench views too); the tab wrap is every `ui/Tabs` strip; the gate dialog title / subtitle is every page's gate dialog; the
   standard table head covers every Gate Configuration table. Each was checked in the re-shots named above, not on every page.
5. The live lab still serves no accepted event newer than 7 Oct and the job manager is down (as in the final test); the mocked
   events (`g12mock.mjs`) carry the setpoint-step, level and Bode cases.
