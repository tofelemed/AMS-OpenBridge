# Task 6 (CHG-188): Evaluate a window and Reconstruct evidence as dialogs with progress — report

Owner review 2026-11-14 items 10 (10.1, 10.2, 10.3) and 15, with the owner decisions of 2026-11-15 (Q4: "↗" links stay links;
Q5: no time display change). Builds on CHG-183 (cyan `ui/Dialog` with `subtitle`, Secondary A / primary buttons) and CHG-187
(gate head with the retention label). Every visible text change is in `docs/theme/redesign/text-changes.md` under `## CHG-188`.

## What changed, per file (all under `src/frontend-ob/src/`)

### Progress model (new, pure)
- `components/Cpm/evidence/runPhase.ts` (new): `RunPhase` (`IDLE | STARTING | QUEUED | RUNNING | DONE | FAILED` + reason),
  `inFlight()`, `formatElapsed()` ("0:07", a duration), `DONE_CLOSE_MS` = 1200, `RECONSTRUCT_TIMEOUT_MS` = 5 min, and
  `reconstructionPhase()`: Running from the click until the manifest lists the rebuild with a final readiness (COMPLETE,
  IDENTICAL, IDENTITY_CHANGED, SUPERSEDED → Done); Failed for a refused POST, a FAILED / CANCELED / SUBMIT_FAILED job, a rebuild
  that FAILED or produced nothing (NONE / UNTRACKED), or no result after 5 minutes.
- `components/Cpm/evidence/evaluationState.ts`: `evaluationPhase()` from the states the status API reports (QUEUED, RUNNING,
  FINISHED, FAILED). FINISHED is Done only once its verdict row is stored (`openableVerdict`), so the page can open the window;
  before that it is still Running; when the row never comes (the existing 60 s `VERDICT_WAIT_MS`) it is Failed ("The evaluation
  finished, but its result did not arrive within a minute."). A refused POST and an unreadable status are Failed with the
  existing plain-word reasons. `evaluationStatus` / `evaluationRefusal` are unchanged (Evidence Replay's re-run still uses them).
- `components/Cpm/evidence/useRunClock.ts` (new): `useTick(active)` re-renders each second while a run is in flight (elapsed
  time, the reconstruct time limit); `useAfterDone(done, cb)` fires once 1.2 s after Done.

### Dialogs
- `components/Cpm/evidence/RunProgress.tsx` (new): the progress line under a run dialog's rows. In flight: OpenBridge
  `ObcCircularProgress` (building-blocks, default mode indeterminate; found in the manifest as `obc-circular-progress`; the app
  already imports it in the Designer) + the state word + elapsed; Done = success `StatusBadge` "Done"; Failed = danger
  `StatusBadge` "Failed" + the reason (`role="alert"`). The state word is the `role="status"` region (the ticking time is outside
  it, so a screen reader is not told every second). It takes focus when a run starts, so focus stays in the modal when the
  button that started it goes.
- `components/Cpm/evidence/EvaluateWindow.tsx` (rewritten, 138 lines): a `ui/Dialog` "Evaluate a window", subtitle
  "FIC10401 · Flow controller (FCS0101)" (`serviceName`, so the tag is not repeated). Rows: Length = `ui/SegmentedControl` 12h /
  24h; Ending at = a field reading "Now" (picking a time opens a datetime field pre-filled with now, so the browser never shows
  "mm/dd/yyyy --:-- --", plus a "Now" button back); Window = the same text as before. Footer: Cancel (secondary) + Evaluate
  (primary, `raised`); while running only Close; after a failure Close + Retry (primary). Fields are disabled while running.
  On Done the page opens the window (as before, through `onOpen`) and the dialog closes 1.2 s later; the next opening is the form.
  The POST's answer is written to the status query's cache (`setQueryData`): a retry answered with the same run (the server
  returns the run in flight or the stored one) shows that answer, not the state read before it (with the app's 30 s staleTime
  the old state would otherwise stay — found in the browser check; test added, proven to fail without it).
- `components/Cpm/evidence/ReconstructDialog.tsx` (rewritten): one line "Rebuilds this gate's charts from its window. The kept
  proof is not changed.", rows Loop / Gate / Window (window text unchanged, Q5), footer Cancel (secondary) + Reconstruct
  (primary); the same progress line; Close while running; Close + Retry after a failure. Takes `phase` + `startedAt`.
- `components/Cpm/evidence/useReconstructFlow.ts` (new): the workbench's reconstruct flow, moved out of the workspace with the
  manifest / run-state polling it owns (unchanged: 10 s, only while a reconstruction of the run on screen is pending). New:
  when the job's state turns terminal the manifest is read at once (Done follows the job by seconds, not up to 10 s); Done
  closes the dialog after 1.2 s and opens the rebuild's view (`?view=`) when the run has retained proof, so the rebuilt charts
  show (with nothing retained the page already shows the rebuild by itself). The head's button reopens a run in flight
  instead of resetting it (before, a second click dropped the pending run and its polling).

### Workbench
- `components/Cpm/evidence/GateEvidenceWorkspace.tsx` (334 lines): uses the flow hook; the Evaluate dialog host is drawn at the
  same child position in both layouts (no run open / run open), so a run survives the page moving to the opened window. The
  head button is "Evaluate a window" (Secondary A, `aria-haspopup="dialog"`, no "Hide…" toggle); with no run open the same
  button sits in the band (the inline panel is gone). The "Reconstruction accepted · …" line shows only while a run goes on with
  the dialog closed. An EVALUATE run's head label is `reEvaluatedLabel(...)`.
- `components/Cpm/evidence/RunSummaryBar.tsx`: "Reconstruct evidence" is a secondary `ObcButton` (`variant="normal"`,
  `aria-haspopup="dialog"`), no "↗", no `ui-link`, no "Reconstruction requested…"; no EVALUATE pill (the label says it).
- `components/Cpm/evidence/retention.ts`: `reEvaluatedLabel(ranAtMs, tz)` → "Re-evaluated" (info) with the tip "Evaluated on
  request {time}, from the historian, with the engine the live verdicts use." / "Kept 3 days." The time is `formatInZone`, the
  formatter the old note used (Q5). `retentionLabel` returns nothing for the new `EVALUATED` basis.
- `components/Cpm/evidence/evidenceBasis.ts`: basis kind `EVALUATED` (label "Re-evaluated", no detail) replaces the
  "Evaluated from the historian" note with its "Reconstructed … · N artifact(s) rebuilt"; `evaluatedAt()` (the evaluation's
  rebuild time, else the run's `computedAt`); `viewAfterRebuild()`.
- `components/Cpm/evidence/EvidenceBasisBar.tsx`: nothing for an evaluated window whose only rebuild is the evaluation itself.
- `components/Cpm/evidence/GateResultState.tsx`: an EVALUATE run is no longer classified as a shadow run. See Decisions.
- `styles/cpm-workbench.css`: `.cpm-run-form` (the sample's label / value grid), `.cpm-run-progress*` (separator line, spinner box
  with the arc in `--traverse-action-primary` on a `--traverse-border-subtle` track, tabular elapsed). Tokens only.
- `styles/cpm-evidence.css`: the unused `.cpm-evaluate-window*` rules removed.

## Decisions
- **States shown are only those reported.** Evaluate: Queued / Running / Done from the run's `state` (Done = FINISHED with the
  verdict row stored). While the POST is on its way (no state reported yet) the line shows the spinner and the time with no
  word. Reconstruct has no queue: cplm-api hands the job to Flink before it answers the POST (CREATED → SUBMITTED inside the
  request), so it is Running from the click; Done is the manifest listing the rebuild settled. No percent anywhere.
- **Timeouts.** Evaluate: the server already fails a request the job picked up too late or never answered (REQUEST_EXPIRED,
  NO_RESPONSE_FROM_EVALUATION_JOB); the client adds only the existing 60 s wait for the verdict row. Reconstruct: 5 minutes
  (plant ~20 s); a job Flink archived without a result never turns terminal in cplm-api, so without this limit the spinner
  would never stop. The message says it may still arrive and the page lists it then.
- **Retry** re-sends the same request. For Evaluate the server returns the run already in flight or stored for that window
  (`EvaluationService` InFlight / Cached), so Retry never starts a second run; changing a field after a failure returns to the
  form ("Evaluate"). For Reconstruct it starts a new reconstruction (the newest supersedes).
- **Closing mid-run.** Evaluate: the run lives in `EvaluateWindow` (not in the dialog), so it keeps polling; when it is done the
  page opens the evaluated window just as with the dialog open (what the page did before for a run it could see); reopening
  the dialog shows the run's progress. Reconstruct: the run keeps going and the manifest keeps being polled; the page shows
  "Reconstruction accepted · submitted. … [Refresh]" while it runs and the evidence-basis line names the rebuild when it lands;
  the head button reopens the progress. A refusal seen with the dialog closed keeps the page's "Reconstruction refused: …" line.
- **Length 12h / 24h only** (owner's design). The API still accepts 4h; the dialog no longer offers it. The toolbar's kind is the
  first choice only when it is 24h (it was 4h / 12h / 24h).
- **Evaluated windows were shown as shadow runs** (`GateResultState`, v2.5 rule "purpose ≠ LIVE → SHADOW", older than CHG-102):
  after "Done" the Proof tab showed "Shadow · EVALUATE evaluation · This run was produced by a bounded evaluation…" in place of
  the window's cards and charts — a raw caps id (item 0), a second result note beside "Re-evaluated" (10.3), and no evidence,
  although CHG-102's own note said "the verdict and the arrays shown are that evaluation's". EVALUATE now goes through the
  normal states; other non-live purposes keep the shadow state. One line + a test. Flagged below because it changes more than text.
- **Button looks:** dialog footers use `ObcButton` `normal` (Secondary A) and `raised` (primary), as `ui/Button` maps them.
  The "Ending at" "Now" back button is a plain `ui-btn ui-btn--secondary`.
- **No dialog description for Evaluate** (the approved sample has none); its old hint's facts are in the "Re-evaluated" tip.

## What I could not do
- No real Evaluate or Reconstruct ran (read-only lab). The progress states, Done → auto-close → the opened window, and the
  "Re-evaluated" label were captured with the Evaluate / Reconstruct POSTs and their status GETs fulfilled in the browser, and the
  evaluated window shown as the real 6 Nov 20:00 G5 run re-read with `purpose` set to EVALUATE. So the evaluated window in the
  screenshots shows the live run's own evidence, not an evaluation's; how a real evaluation's evidence renders now that it is not
  a shadow run is not verified in the lab.
- Reconstruct Done / Failed were not captured in the browser (the list asked for form + Running); they are covered by unit
  tests (dialog states) and a workspace test (Running → Done → closes by itself).

## Tests
New / changed: `runPhase.test.ts` (new, 5), `EvaluateWindow.test.tsx` (new, 8: dialog + band subtitle, 12h/24h segments, Now
default + window preview + 24h preview, pick-a-time from now and back, Queued → Running → Done with spinner/elapsed + onOpen +
auto-close with fake timers, stored result Done at once, failure stays with Close + Retry and Retry re-sends, refused request,
same-run retry shows the new answer, closing mid-run keeps the run and still opens the window), `ReconstructDialog.test.tsx`
(rewritten, 7: one line, rows Loop/Gate/Window, Reconstruct primary / Cancel secondary, Running with spinner + 0:12, Done,
Failed + Retry), `RunSummaryBar.test.tsx` (Reconstruct is a secondary dialog button without ↗ or `ui-link`; Re-evaluated
label, no EVALUATE pill), `retention.test.ts` (reEvaluatedLabel), `evidenceBasis.test.ts` (EVALUATED basis, evaluatedAt,
viewAfterRebuild), `evaluationState.test.ts` (evaluationPhase), `classifyGateResult.test.ts` (EVALUATE not shadow),
`GateEvidenceWorkspace.test.tsx` (dialog shows Running and stays; closed mid-run the page line shows and the button reopens
without a second POST; Done → closes by itself with no accepted line; Evaluate opens from the head; Re-evaluated in the head).

```
npx vitest run src/components/Cpm/evidence src/styles src/ui
 Test Files  62 passed (62)
      Tests  745 passed (745)
npx vitest run
 Test Files  331 passed (331)
      Tests  2730 passed (2730)
npx tsc --noEmit -p tsconfig.json   (no output, exit 0)
npm run lint                         (clean, --max-warnings 0)
npm run lint:theme
 lint:theme phase 3: 643 live files, gates T1 T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T13, matches 0
npm run build                        built (chunk-size warnings only, as before)
```

## Browser check (preview :4173 on the lab API, read-only)
Route filter: every non-GET `/api/` request aborted except `/api/auth/login`, `/api/auth/refresh` and POST
`/api/v1/cpm/method-runs/evidence/batch`; `POST /api/v1/cpm/analysis-runs` (EVALUATE and EVIDENCE_RECONSTRUCTION) and
`GET /analysis-runs/<mock id>` fulfilled locally. Result: blocked = none, passed non-GET = auth login/refresh + evidence batch
only. Loop FIC10401, 12h window ending 6 Nov 20:00, gate G5. Script: session scratchpad `chg188/cap188.mjs`.

Screenshots in `docs/theme/redesign/evidence/chg188/` (untracked):
- `chg188-evaluate-form-day-1440.png`, `chg188-evaluate-form-night-1440.png`, `chg188-evaluate-form-day-768.png`
- `chg188-evaluate-queued-day-1440.png`, `chg188-evaluate-running-day-1440.png` (spinner, "Running 0:03")
- `chg188-evaluate-done-day-1440.png` ("✓ Done"; the dialog was gone 1.8 s later: `closedAfterDone: true`)
- `chg188-evaluate-failed-day-1440.png` ("✕ Failed · The historian holds no samples for this loop in that window." + Close / Retry)
- `chg188-re-evaluated-label-day-1440.png`, `chg188-re-evaluated-tip-day-1440.png` (tip: "Evaluated on request 2026-11-06
  20:03:22, from the historian, with the engine the live verdicts use." / "Kept 3 days.")
- `chg188-reconstruct-form-day-1440.png`, `chg188-reconstruct-running-day-1440.png`
- `chg188-workbench-head-day-1440.png` (the head with the new buttons), `chg188-texts.json` (the dialogs' text)
