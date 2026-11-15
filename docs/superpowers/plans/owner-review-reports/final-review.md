# Final whole-branch review: owner production review (CHG-183..CHG-192)

Range `bc31edff..de86e0b1`, branch `feat/cpa-redesign`. Read-only review, 2026-11-15.

## How this was reviewed

The 1.7 MB package was reviewed in passes, not line by line:

- **Read in full (current file and old version):** `useReconstructFlow`, `useRunClock`, `runPhase`, `RunProgress`,
  `EvaluateWindow`, `ReconstructDialog`, `evaluationState`, `GateEvidenceWorkspace`, `useEvidence`, `ui/Dialog`,
  `ui/Button`, `ui/DetailsGrid`, `kpi/KpiCard`, `HistoryTab` + `historyQuery`, `LoopNotes` / `NoteList` / `NoteForm`,
  `useDialogA11y`, `modeVocabulary`, the button and dialog CSS.
- **Read as changed lines only (every added and removed code line, comments skipped):** Administration, calc, config,
  events, the rest of evidence (tabs, ExplainWhy, VerdictCard, RunSummaryBar, retention, evidenceBasis), Loop Explorer
  summary, Investigation, performance, pipeline, registry, replay, response, windows, `ui/Inspector`, trend.
- **Skimmed only:** the per-gate proof views (`views/FusionViews`, `LongViews`, `ShortViews`, `G13Interaction`,
  `G15Decision`, `headlines`, `tileTips`), the remaining CSS, and the test diff (test names read, bodies sampled).
- **Greps over the whole diff:** date and time formatters, write calls, API and hook folders, raw colours and px
  fonts, file sizes.
- **Run by me:** `npx tsc --noEmit` (exit 0), `npm run lint` (clean), `npx vitest run` on the touched folders
  (129 files, 1241 tests, all pass). The full suite and `lint:theme` were not run by me.
- **Not done:** no browser pass. Every layout statement below comes from code, not from a screen.

## Strengths

- **Owner Q5 holds.** No date or time formatter, zone or wording changed. The gate dialog's one window line reuses
  `fmtDateTime`; History keeps `fmtWhen`; the Evaluate form, cursor readout and foot strips keep `formatInZone`.
- **No new writes.** `src/api` and `src/hooks` are untouched. Every mutation in the diff existed before
  (evaluation POST, reconstruction POST, note create / link / outcome, acknowledge). Nothing outside
  `src/frontend-ob/src` and `docs/` changed.
- **Tokens only.** No hex, rgb or px font size in any added CSS line. The one `fontSize: 12` is an existing ECharts
  axis option.
- **Run flows are sound.** Timers are cleared on unmount (`useTick`, `useAfterDone`). A run survives closing the
  dialog. A loop change resets the Evaluate run. Reopening a Reconstruct run in flight shows its progress and
  cannot send a second request. A failed evaluation is not reused by the server, so Retry starts a new run.
- **The dialog keeps its focus trap, Escape and focus return.** `RunProgress` takes focus when the button that
  started the run disappears. The KPI card opener is one card-wide button named by the title and described by the
  value; the `?` tip is a separate tab stop.
- **Tests assert behaviour.** The Evaluate and Workbench tests drive Queued → Running → Done → auto-close, failure
  with Retry, and close mid-run. `runPhase` is pure and unit-tested. The two deleted tests covered removed code only.
- **Drill-downs and filters are kept.** Loop KPI cards still open `LoopKpiDialog`; History rows still open Historical
  and Loop Events; the Window Inspector sample filter and the Compare metric selector are still there; the gate
  dialog keeps Samples, Reason and all three ways on.

## Issues

### Critical (must fix)

None found.

### Important (should fix)

**I1. Window Inspector no longer shows a window's calculated values.**
`src/frontend-ob/src/components/Cpm/windows/SelectedWindow.tsx:49-51` (the DETAILS items),
`windows/WindowDialogs.tsx` (`RecordDetailsDialog` deleted).

- What is wrong: "Record details" on this page was not an id dialog. It held `WindowResults`, the table of every
  short or long metric of the selected window. The panel itself shows only Window, Samples, Message, Tag and Stored.
  Q6 removed the button, and the values went with it.
- Effect: an engineer who selects a window can no longer read its numbers on the page whose job is to inspect a
  window. For a short window (1m, 5m) the only way left is the Workbench, one gate at a time; a 5m run has no Replay.
  This breaks the owner rules "nothing removed inside a page" and "every KPI keeps a drill-down with its values".
- Reporting gap: task-2.md names this loss, but the ledger's list of lost facts relayed to the owner
  (Calculations, Loop Events, Pipeline) does not include it.
- Suggested fix: add a "Values" item to the DETAILS grid that opens `WindowResults` in a dialog (subtitle = loop ·
  window), without the "Record details" name. Otherwise get the owner's explicit yes to this specific loss.

**I2. The button restyle is global and reaches pages nobody checked.**
`src/frontend-ob/src/styles/openbridge-bridge.css:254` (`obc-button { … }` sets Secondary A for every `normal` and
`flat` button in the app).

- What is wrong: about 30 `flat` / `normal` buttons outside CPA and Administration now get a tinted box with a
  border, and only one of them was reviewed (`AlarmDetailPanel` close → `ui-ghost`). They include the Alarm Console
  toolbar (`AlarmConsole.tsx:756-808`), the user menu's Sign out (`ui/shell/UserMenu.tsx:49`), the Designer display
  list, and the Designer's button symbols (`Designer/SymbolRenderer.tsx:520, 625, 635`), which are content drawn on
  operator displays, not application chrome.
- Effect: operator HMI displays that carry a button symbol, and the alarm toolbar, change look at the plant without
  a screenshot. The chg183 evidence covers CPA pages only. I did not open these pages, so the visual result is
  unverified, not proven wrong.
- Suggested fix: screenshot Alarm Console, the shell user menu and one display with button symbols in Day and Night
  before shipping. If the symbols must keep their look, exclude the Designer canvas from the host rule (for example
  `obc-button:not(.designer-symbol *)`, or reset the variables under the canvas root).

### Minor (nice to have)

**M1. Evaluate dialog: the "Window" row is not frozen at the click.**
`evidence/EvaluateWindow.tsx:111` and `:132` (`endMs = requestedEnd(end, Date.now())` on every render), `:102`
(the request computes its own `Date.now()`).
With "Now", the row re-computes each second during a run, so across a quarter-hour it shows a window 15 minutes
later than the one being evaluated. Before the click the dialog does not tick, so a dialog opened at 10:14 and
confirmed at 10:16 shows "… → 10:00" and sends 10:15. The opened result shows the true times, so the harm is brief
confusion. Fix: compute `endMs` once in `evaluate()`, keep it in state, and show that value while the run exists;
tick the idle form once a minute.

**M2. Reconstruct: Retry after the 5-minute limit starts a second job.**
`evidence/runPhase.ts:64-66`, `useReconstructFlow.ts:59`. The message says the first job "may still finish", and
Retry then posts a new reconstruction beside it. Fix: after a timeout offer "Keep waiting" (reset `startedAt`)
instead of, or before, Retry.

**M3. Reconstruct: polling has no end for a job that never settles.**
`useReconstructFlow.ts:26-28`, `useEvidence.ts:52-58`. After the timeout the manifest and run-state reads continue
every 10 s for as long as the Workbench stays on that run (the ledger's Flink-archived case). It is deliberate
("this page lists it when it arrives") and cheap, but unbounded. Fix: stop after a longer cap, for example 30 min.

**M4. Closing the Reconstruct dialog during the 1.2 s "Done" drops the switch to the rebuilt view.**
`useReconstructFlow.ts:38-42` (`DONE && open`). The rebuild is still listed in the evidence bar, so nothing is
lost. Fix: call `onView` when Done is reached, and use the delay only for closing.

**M5. The dialog subtitle is not part of the dialog's accessible name or description.**
`ui/Dialog.tsx:23-24`. CHG-192 moved the object out of the title on destructive confirms ("Delete role" + subtitle,
Retire loop, Reset to default). A screen-reader user now hears "Delete role, dialog" without the role. Fix: give the
subtitle an id and add it to `aria-describedby`.

**M6. Mode reading: amber without a state word.**
`explorer/summary/SignalStrip.tsx:52`. OP gets "! At limit"; Mode gets only the amber box, with the mode name as the
value. Q3 asks for amber plus a word. The value is a word, so this is close; a "Not normal" state line would match
OP exactly.

**M7. Evaluate lost two things the old panel had.**
`evidence/EvaluateWindow.tsx:37` (4h dropped, ledger ruling) and the finished line ("Evaluated (8,640 samples,
2.3 s)" / "Evaluated earlier - the stored result is shown"). The "Re-evaluated" tip gives the time, so a stored
result can still be told apart. Worth one line to the owner with the 4h ruling.

**M8. Small facts dropped with the technical details, not in the relayed list.**
`config/DeploymentStatus.tsx` ("Rolls back" row: the fact that a deployment is a rollback went with its id);
`config/PropertyForm.tsx` ("Read by" jobs); `evidence/ExplainWhy.tsx` (G14 "scores are not probabilities" now only
on the Hypotheses tab). All fall under item 0 / Q1; listed so the owner list is complete.

**M9. Layout tests read stylesheet text.**
`styles/buttonStandard.test.ts`, `dialogStandard.test.ts`, `replayLayout.test.ts`, `workbenchLayout.test.ts` assert
strings in CSS files. They catch an edit to the rule, not a broken layout. Missing behaviour tests: close inside
the Done delay (M4), the frozen window (M1), a loop change during a run, a rebuild arriving after the timeout.

**M10. File size.**
`styles/openbridge-bridge.css` grew to 410 lines in this range (plan limit 400). `styles/hmi-dialogs.css` (1213) and
`styles/cpm.css` (1040) were over 500 before and were touched; `AlarmConsole/AlarmDetailPanel.tsx` is 438 (one
attribute added). No `.tsx` grew past the limit in this range.

**M11. Open minors already in the ledger, still open.**
Gate head actions wrap under the title at 1440; raw keys in other gates' chart legends and rows (`u_applied`,
`d_sp_dt`, `NOT_MAPPED`, G7 headings); Governance names "audit-service"; the Window Inspector band shows
"CPLM Short Feature Engine · RUNNING · ckpt 12s ago".

### Executor rulings: my read

- Global button look through bridge variables instead of moving 300 call sites: sound for CPA; its reach is I2.
- State-only gates keep a "What remains open" button: agree, the open limits would otherwise vanish.
- EVALUATE runs shown like any run: reasonable, unverified with real evaluation evidence (see below).
- 12h / 24h only: follows spec 10.1; see M7.
- 5-minute reconstruct limit: agree; see M2 and M3.
- `SelectedWindow.tsx` changed despite "keep it": acceptable, but it is the file where I1 sits.
- Wide dialog 880 px for all wide dialogs: agree, one size.
- No per-task reviewer: the cost named in the ruling is what I1 and I2 are.

## Declined to judge

- Visual result in Day and Night at 1440 / 1000 / 768 / 390: no browser pass was in my scope.
- Contrast of Secondary A, the cyan band and the amber reading boxes: needs rendered colours.
- Whether each gate G0–G15 shows every fact exactly once with plant data: needs plant data; proof views only skimmed.
- EVALUATE-purpose runs rendering their evidence like a live run: the lab has no real evaluation evidence (ledger).
- PV "Off setpoint" not built (item 5): a declared limit that needs a cplm-api field; the plan allowed it.
- The sample-count disagreement noted in the spec ("8641 of 8640" vs "of 10,725"): not touched in this range.
- Replay chart axis name no longer cut: a rendering question; the lab had no raw samples for the loop.
- Whether the non-portaled dialogs (Evaluate, Measured vs required, Loop notes) are ever clipped: I found no
  transform or container ancestor in CSS, and Reconstruct already sat there un-portaled, but I did not see it drawn.
- Wording of the 312 text changes: owner taste, not checked string by string.
- `lint:theme`, the full vitest suite and the build: reported green by the implementers, not re-run by me.
- `changes_tracker.md` and `prod_decision.md`: the controller writes them after this review; not in the range.

## Verdict

**Ready after fixes.** No critical defect: types, lint and the touched tests are green, no time display changed, no
new write call exists, and the new run flows clean up after themselves. Before the plant gets it, restore the
window's values on the Window Inspector (I1) or get the owner's explicit yes, and look at the pages the global
button rule reaches (I2). M1, M2 and M5 are small, cheap and worth taking in the same pass.
