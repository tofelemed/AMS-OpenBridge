# Final browser test: CPA owner-review batch CHG-183..199 (feat/cpa-redesign, head a21c64d5)

Date: 2026-11-15. This was a read-only test on the preview server http://localhost:4173, serving a dist built from a21c64d5,
against the lab gateway :8081. No code was changed; no git, docker or subagents were used.

- **Screenshots** (PNG, device scale 1, not committed): `docs/theme/redesign/evidence/final-2026-11-15/<page>/<view>-<width>-<theme>.png`.
  The paths in this report are relative to that folder. A mocked state has `mocked` in its file name.
- **Tooling** (scratchpad `final-test/`):
  - `pages.mjs` + `scope.mjs`: the page sweep, adapted from final-sweep.
  - `states.mjs`: dialogs and states.
  - `redraw-real.mjs` and `redraw-phases.mjs`: the redraw run against the real historian.
  - `g12mock.mjs` + `sr-mock.mjs`: the mocked G12 events.
  - `extra.mjs`: the remaining captures.
- I opened and looked at every screenshot classified below. A finding is only what I saw; the code is cited only to explain a cause.

**Build note (test environment, not a finding).** `npm run build` with no environment bakes in the default
`VITE_LOOP_ROOT_PREFIX=root.site1.cpm`. The lab historian is at `root.hdpev2.cpm`.
- So the first real redraw read 0 points and failed with "The historian has no samples for this window." plus Retry. The
  retry also read 0 points (`response/redraw-real/fic10401-censored-dialog-failed-1440-{day,night}-site1prefix.png`).
- I rebuilt dist with `VITE_LOOP_ROOT_PREFIX=root.hdpev2.cpm`, the same way the lab :3000 image is built. Every other
  capture uses that build.
- The plant build still needs `--build-arg VITE_LOOP_ROOT_PREFIX=root.hdpe.cpm`, as before.

## Findings

Severity: high = broken or unreadable in a state the owner will hit; medium = visible defect or rule breach on a changed
screen; low = polish or rule nit.

| # | Sev | Page | View | Width | Theme | Screenshot | What is wrong | Suggested fix |
|---|---|---|---|---|---|---|---|---|
| 1 | high | System Response | Redraw from historian: dialog | 1440 | Day / Night | `response/redraw-real/fic10401-censored-at-done-dialog-already-gone-1440-day.png`, scratchpad `final-test/phases-*.json` | "Done" is never shown and the 1.2 s auto-close never happens. On all 4 real events the dialog disappeared 93–117 ms after "Drawing", before any "Done" frame was observed. A photo taken at Done shows only the redrawn page. Cause: `EventPanes` renders `RedrawAction` only while `redrawable` (`… && !redrawn`), and the dialog is a portal child of `RedrawAction`. The moment `useRedrawRun` puts the redraw in the cache, the action and its dialog unmount. `RedrawDialog.test.tsx` tests the dialog alone, so it misses this. | Keep the dialog mounted while it is open: hold the open state above the `redrawable` switch (in `EventPanes` / `ResponseWorkspace`), or keep `RedrawAction` mounted and hide only its button once redrawn. Add a pane-level test: Done shows, then the dialog closes. |
| 2 | high | System Response | Response trends (real FIC10302 event) | 390 | Day / Night | `response/real-response-390-day.png` | The trend labels overprint and run off the chart. On Input, "OP change 5 %" and "Gain (model) 3 PV unit/% OP" print on top of each other and the text runs past the right edge ("PV u…"). On Rise time and settling, the Settling band label sits on top of "Settled 85 s". On Error from the setpoint, the IAE / ISE / ITAE block is cut at the right. | Below ~600 px, move value labels into a line under each chart (or keep only the step and the span labels), and clamp label x to the plot area. |
| 3 | high | System Response | Models › Review system model dialog | 390 | Day / Night | `response/model-review-dialog-390-night.png` (768 is fine: `response/model-review-dialog-768-day.png`) | The dialog content is wider than the dialog and opens scrolled sideways (the focused "Approved regime" field pulls it right). The facts labels are cut at the left ("ss gain", "ping ratio", "rating gain"); the Decision control ("Active baseline" cut), the regime field and the Note field are cut at the right. | At narrow widths, stack the facts as one column (label above value) and let the Decision control wrap; no fixed min-width inside the dialog body. |
| 4 | medium | System Response | Response › Rise time and settling (mocked setpoint step) | 1440 | Day / Night | `response/mocked/b-setpoint-step-response-1440-day.png` | "Setpoint band ±0.5 PV unit" and "Settling band ±0.1946 PV unit" are drawn on top of each other at the right edge, so neither can be read. | Offset the second band label (stack it above or below), or put the setpoint band label at the left end. |
| 5 | medium | System Response | Fit quality › Candidate models (real FIC10302 event) | 1440, 390 | Day / Night | `response/real-fit-1440-night.png` | The Path column reads "FIT": the row parser takes the `fit` token of "FOPDT(fit: …)" as the path. "Condition number 11.775364368273369" is not rounded. Parameter uncertainty lists "baseline" in raw lower case. The header "Fit error ((PV unit)²)" has double brackets. The table touches the next "STEP D" heading. | Use the artifact's `roleOrPath` (OP → PV) when the token is `fit`; round the condition number with `readable()`; add `baseline` to `paramLabel`; header "Fit error, (PV unit)²"; put the row gap before the next head. |
| 6 | medium | System Response | Frequency (mocked flow input test with a Bode) | 1440 | Day / Night | `response/mocked/a-flow-input-test-frequency-1440-day.png` | Technical text is left on this tab: eyebrow "SUBGATE F" (Fit quality says "STEP E"), titles "\|L(jω)\|" and "∠L(jω)", legend "\|L\| = \|C·G\|" and "phase", unit "dimensionless". The pill "model-domain estimate" is followed by a sentence that says "not a safety guarantee" twice. The ω axis is linear (0–1 rad/s), so the response is squeezed into the left edge. | "Step F"; titles "Loop gain" / "Loop phase"; drop "dimensionless"; one sentence; log ω axis. |
| 7 | medium | System Response (also the result card, Steps & data, Review dialog) | Reported quantities, All quantities, result card | 1440, 390 | Day / Night | `response/real-response-1440-day.png`, `response/redraw-real/fic10401-censored-redrawn-1440-day.png`, `response/mocked/c-level-input-test-response-1440-night.png`, `response/steps-outputs-dialog-1440-day.png` | Raw unit and number notation: "kg/h^2*s", "PV unit*s^2", "8.312e+6 kg/h^2*s", "2.366e+7", "± 5.101e-6" (it breaks across lines as "5.101e-" / "6" in the Review dialog), "3.980e-3 PV unit/(% OP*s)", "1.00 fraction". The quantity "t63" shows its id. The trends on the same tab already write "(kg/h)²·s". | Reuse the trends' `unitOf` (², ·) and `readable()` in these tables, the result card and the Review dialog; label t63 "Time to 63 %". |
| 8 | medium | System Response | Response trend heads | 390 | Day / Night | `response/real-response-390-day.png` | Zoom area, Undo and Reset stack vertically and Export CSV wraps onto two lines beside a title squeezed into 2–4 lines, so each head is ~110 px. | Below ~600 px, put the tools in one row under the title (or behind one "Chart tools" menu). |
| 9 | medium | Loop Explorer; System Response; Governance; Gate Configuration | Tab strips | 390 | Day / Night | `explorer/summary-390-day.png`, `explorer/history-390-day.png`, `response/real-response-390-day.png`, `governance/page-390-day.png`, `config/deployment-rollback-mocked-390-night.png` | On Explorer Summary only "Summary" is visible; Signals, Calculations, Relationships and History are off-screen with no cue. On History the strip is scrolled and shows "s 17" cut at the left. System Response's six tabs end in "Fr". Governance's tabs end in "Separation of dutie". Gate Configuration's bundle steps start at "pproval ✓". | Wrap the tabs, show a select below ~600 px, or add a fade and arrow cue. |
| 10 | medium | Performance | Findings table | 390 | Day / Night | `performance/page-390-day.png` | The Result column is cut at the panel edge ("Oscillation confirme", "Not evaluated: not enoug"), and Checks / Evidence / Review are not reachable by eye. The table's end shows no scrollbar and the cut shows no fade or other cue. | Use card rows below ~600 px (as Loop Events does), or show a visible horizontal scroll cue. |
| 11 | medium | Evidence Workbench | Gate head | 1440 | Day / Night | `evidence/page-1440-day.png`, `evidence/measured-vs-required-1440-night.png` | At the reference width the result pill is clipped to "— Insufficient evide" and the title wraps to "G15 · / Decision", because the three buttons take the row. At 1000 the head wraps and reads fine (`evidence/page-1000-day.png`). | Let the buttons wrap under the title before the pill is squeezed (`flex-wrap`, `min-width: max-content` on the pills). |
| 12 | medium | Evidence Workbench | A run that holds no artifact of the gate's kind (mocked G10 run viewed on G15) | 1440 | Day / Night | `evidence/artifact-not-available-mocked-1440-day.png` (also behind `evidence/evaluate-done-mocked-1440-day.png`) | The title reads "Artifact not available: decision_record", a snake_case kind name. This is `viewSupport.RequireKinds`, the path every real run lacking a kind takes. Its line "The verdict stands; reconstruct the evidence to see the arrays" sits under the chip "No verdict recorded for this run". | Name the chart in words ("The decision record is not stored for this run"); keep the kind only in the CSV / record. |
| 13 | medium | Historical | Mode lane (widened to 30 days) | 1440 | Day / Night | `historical/widened-30d-1440-day.png` | The Mode lane draws Auto as a solid green bar labelled "AUT": green for the normal mode, plus a code. | Neutral fill for normal modes (amber only for modes that need a look, as the Explorer mode box does), with the word "Auto". |
| 14 | medium | Evidence Replay | Evidence package, done message | 1440 | Day / Night | `replay/package-message-1440-day.png` | The not-read line shows "evidence manifests (ApiError: The service is currently unavailable. Try again shortly.)", with the error class name. On the loaded lab the build took 125 s showing only "Building…" (at 1000, 768 and 390 it was still "Building…" after 30 s). | Drop the "ApiError:" prefix (say "could not be read: the service did not answer"); show the parts read so far while it builds. |
| 15 | low | System Response | Labels on curves | 1440 | Day / Night | `response/real-response-1440-day.png`, `response/mocked/a-flow-input-test-response-1440-day.png`, `response/redraw-real/fic10502-accepted-oct07-redrawn-1440-day.png` | "90 %" and "Measured 63 %" sit on the PV line. On the FIC10502 redraw (dead time 0 s, time constant 0.5 s): "Dead time 0 s" is crossed by the step line, "Time constant 0.5 s" overlaps the PV, "Gain (model)" sits on the OP line and "Final value" on the PV line. | Nudge labels off the series; when a span is under ~2 % of the axis, put its label outside the plot. |
| 16 | low | System Response | Input trend; Fit quality and Frequency charts | all | Day / Night | `response/real-response-1440-day.png`, `response/real-fit-1440-night.png` | The y-axis labels touch: Input at 180 px ("45 44 43 42 41 40"), Residuals at 200 px ("0.0005 … −0.0002"), Delay search, ACF. | Fewer y splits (`splitNumber: 3`) on short charts. |
| 17 | low | System Response | Fit quality / Frequency | 1440 | Day / Night | `response/real-fit-1440-night.png` | Export CSV sits under each chart there but in the head on the Response trends and Models. | Use one place: in the head. |
| 18 | low | System Response | Redraw (real FIC10502 accepted event) | 1440 | Day / Night | `response/redraw-real/fic10502-accepted-oct07-dialog-form-1440-day.png`, `…-redrawn-1440-day.png` | The dialog's Trends row promises "Error from the setpoint", but the page leaves it out without a word: the lab historian samples did not reproduce IAE / ISE / ITAE (task-15 concern 3). | One plain line where the trend would be ("Error from the setpoint could not be redrawn from the historian; its values are in the table"). |
| 19 | low | System Response | Linked zoom (mocked setpoint step) | 1440 | Day | `response/mocked/zoom-linked-after-reset-1440-day.png` | After Reset on the first trend all charts reset, but Undo stays enabled on the other trends. | Reset the undo stack of every chart in the group. |
| 20 | low | System Response | Models tab | 1440 | Day / Night | `response/real-models-1440-night.png` | The time axis spans 2 days with times only (no date). Family "FOPDT" where Fit quality says "First order with dead time". The y ticks have 6 decimals ("2.999988"). At 768 the created stamp wraps into three lines. | Add the date at day changes; use `familyLabel`; fewer decimals. |
| 21 | low | several | Dialogs without a subtitle | 1440–390 | Day / Night | `performance/gate-dialog-1440-day.png`, `governance/verify-dialog-mocked-1440-day.png`, `evidence/reconstruct-keep-waiting-mocked-1440-night.png`, `replay/package-message-1440-day.png` | The dialog standard is a cyan band with a subtitle. These four have the title only (the gate dialog's title is "FIC10401 · G8"). The Measured vs required dialog has no footer Close (✕ only). | Add the loop / gate subtitle as the other dialogs do; add a Close footer. |
| 22 | low | several | Green for "normal" / done | 1440–390 | Day / Night | `evidence/evaluate-done-mocked-1440-day.png`, `events/table-768-night.png`, `response/events-1440-day.png`, `explorer/readings-not-normal-at-limit-mocked-1440-day.png` | Green appears on: "✓ Done" (Evaluate, Redraw, package "✓ Downloaded"), the "Validated" dot, the Signal quality "Good" dot, and "✓ Acknowledged" / "✓ Active (verified)", whose check is green in Night but neutral in Day (a parity break). | Neutral tone for done / good / acknowledged, as the owner rule says; at least make Day and Night agree. |
| 23 | low | Performance | Header | 1440–390 | Day / Night | `performance/page-1440-day.png` | "Window Inspector ↗" is greyed until a loop is chosen, and the reason is only in a hover title (CHG-098 says a disabled control says why on screen). | Show the reason as the line under the button (ReasonedButton). |
| 24 | low | Calculations | Page | 1440 | Day / Night | `calculations/page-1440-day.png` | "Computed on a window that failed data qualification" is said twice (above the table and in the panel value). The Gate result column mixes bordered pills and filled grey "— Not evaluated" chips. | Say it once; one pill style. |
| 25 | low | Historical | Empty range | 1440–390 | Day / Night | `historical/page-1440-day.png` | One fact is said three times ("Nothing recorded in this range", "No evaluated windows in this range", "This loop completed no evaluated windows in this range"), with two "Widen to 30 days" buttons. With data, the PV axis "73" touches the lane label "ratio" (`historical/widened-30d-1440-day.png`). | One empty state with one button; lane label gap. |
| 26 | low | several | Technical words left | 1440 | Day / Night | `investigation/result-1440-day.png`, `windows/page-1440-day.png`, `replay/page-1440-day.png`, `registry/page-1440-day.png`, `governance/page-1440-day.png`, `response/model-review-dialog-1440-day.png`, `config/effective-1440-day.png`, `admin/roles-1440-day.png`, `admin/data-sources-1440-day.png` | Investigation: "Engine severity". Window Inspector: "Engine & timing". Replay: "Time in AUTO". Registry: loop type "UNKNOWN". Governance: entity "043f185b…" and "Recorded by user id only; the id is in Record details". Review dialog: "e.g. DEFAULT". Gate Configuration Effective: "DIAGNOSTIC_MODE_NOT_GOVERNED_IN_BUILD: every gate runs OPERATIONAL; OBSERVE_ONLY / SHADOW …" and "REQUIRED_CONTEXT", which may be accepted terms there. Admin Roles: permission keys ("alarm.acknowledge_batch"). Data sources: "ams_ingest", "STRING_ENUM (default)". | Words for each ("Severity", "Timing", "Time in Auto", "Unknown type", the data source name). Owner to confirm whether the Gate Configuration codes and the Admin keys count as accepted terms. |
| 27 | low | Governance | Audit trail filters | 1440 | Day / Night | `governance/page-1440-day.png` | The placeholder "Exact user name" is clipped ("Exact user nam"). | Shorter placeholder ("User name") or a wider field. |
| 28 | low | Registry / Gate Configuration / Governance | Table heads | 1440 | Day / Night | `registry/page-1440-day.png` | The heads are sentence case, not the upper-case heads of the other tables (Loop Events, Performance, SR). | One head style (the standard table). |
| 29 | low | Investigation | Band | 1440 | Day / Night | `investigation/result-1440-day.png`, `investigation/evidence-1440-day.png` | The "All cases" select changes width between the Result and Evidence tabs, so the band shifts. | Fixed select width. |
| 30 | low | Evidence Workbench | Reconstruct, "Keep waiting" state (mocked) | 1440–390 | Day / Night | `evidence/reconstruct-keep-waiting-mocked-1440-night.png` | The badge says "✕ Failed" over a message saying it may still finish. | Badge "Still running" (neutral) with Keep waiting. |
| 31 | low | Window Inspector | Compare window sizes | 1440 | Day / Night | `windows/compare-window-sizes-1440-day.png` | The Windows column reads "0 ● 12 declined": a bare "0" with nothing to say what it counts. | "0 evaluated · 12 declined". |
| 32 | low | Loop Events | Episode panel | 1440, 768 | Day / Night | `events/episode-panel-1440-day.png` | "Non-overlap windows" hyphen-breaks over three lines in its tile. | Shorter label or a wider tile. |
Not findings (checked):
- No horizontal page scroll at any width.
- axe colour contrast reported no violation on the 1440 page sweep (Day and Night).
- Focus is visible on the sidebar and on dialog fields (`shell/focus-visible-1440-*.png`, `windows/compare-window-sizes-1440-night.png`).
- "↗" items are underlined links, or are disabled with an on-screen reason (except #23).
- Every dialog has the cyan band.
- Times keep their existing formats (owner Q5); no format change was seen.
- One primary per part holds everywhere I looked.
- Lab conditions seen in shots, not code findings:
  - Explorer, Historical (12h) and Investigation show no samples after 7 Nov, because the lab feed stopped.
  - Pipeline Health shows "The analysis engine did not answer": the lab job manager is down.
  - The Performance gate dialog's "What this gate asks" shows "Loading…" while `/api/v1/cpm/calculations` returns 500 under load.

## Real-historian redraw (no mock of `/api/hist/raw/cursor`)

Read-only GETs against the lab historian; dist built with `root.hdpev2.cpm`. Every read was 1 page, `hasMore=false`, HTTP 200,
taking 0.39–0.46 s. Phase times are in-page (MutationObserver, from the dialog's first progress word).

| Event | Window (UTC; read from step − 120 s to end + 1 ms) | Points | Signals read | Reading → Drawing → dialog gone | Trends drawn | Left out |
|---|---|---|---|---|---|---|
| FIC10401 censored aa735faf | 7 Nov 11:39:25 → 11:46:35 | 86 | PV, SP, OP all 86 | 0 → 398 ms → 511 ms (no Done) | Measured response, Input (real PV and OP) | Setpoint (not a setpoint step); the rest by design (censored) |
| FIC10302 censored, VP path 8fd9aa14 | 7 Nov 11:44:05 → 11:46:40 | 43 | PV, SP, VP (no OP: VP read as designed) | 0 → 440 → 533 ms | Measured response, Input | as above |
| LIC10401 censored b31024cb | 7 Nov 11:30:34 → 11:33:36 | 36 | PV, SP, OP | 0 → 443 → 560 ms | Measured response, Input | as above |
| FIC10502 accepted (candidate) d913a025, 7 Oct | 7 Oct 06:17:19 → 06:20:24 | 47 | PV, SP, OP | 0 → 395 → 501 ms | Measured response, Input, Dead time and time constant; Model fit line shown | Error from the setpoint (planned in the dialog; the samples did not reproduce the engine's integrals) |

- The 7 Oct data **is** in the historian under `root.hdpev2.cpm` after the 4 Nov tree move.
- The earlier build (`root.site1.cpm`) read 0 points: failure "The historian has no samples for this window." with Retry.
- Screenshots: `response/redraw-real/` (note, form, Reading, redrawn, Day + Night).

## Coverage actually captured

- **Page sweep**: 121 page views × Day / Night. Full-page shots were taken; overflow, text and clipping facts were collected at
  every width, and axe contrast at 1440.
  - At 1440 / 1000 / 768 / 390:
    - Overview, which carries the sidebar and header: rail-less at 1000 and below, where the menu button replaces the sidebar.
    - Performance, Loop Events, Explorer Summary and History, Historical, Investigation (all five tabs).
    - Workbench, Replay, Window Inspector, Calculations.
    - System Response (Events, and Response / Fit quality / Frequency / Steps & data / Models on the real FIC10302 event).
    - Registry, Gate Configuration overview, Pipeline Health, Admin Users and Data sources, Governance.
  - At 1440 / 390 only: SR censored Response and Fit quality, Gate Configuration Effective and Bundles, Admin Roles and Aliases.
  - At 1440 only: Trend.
- **Dialogs and states**, each shot in Day and Night:
  - At 1440 / 1000 / 768 / 390 unless noted:
    - Performance gate dialog, with its foot and Loop result row cropped at 1440.
    - Loop Events: episode panel (1440) or drawer (1000 / 768 / 390), Full history, Shelve (opened, never submitted).
    - Workbench: gate results; Measured vs required; Evaluate form, Running and Done (mocked); Reconstruct form, Running and
      5-min Keep waiting (mocked).
    - Replay: cursor readout, evidence check, Loop notes, package form; the package message at 1440.
    - Window Inspector: band, Calculated values, Compare window sizes; the selected-window drawer at 1000 / 768 / 390.
    - Calculations: Method dialog; the panel drawer below 1280.
    - SR: Steps & data outputs dialog, Models hover, Review dialog (opened, never submitted).
    - Registry: panel and Retire dialog (opened only).
    - Gate Configuration, on FIC10302 (the only lab loop with a bundle): Workers dialog, property detail (side panel at
      1440, drawer below), and deployment status with a rollback row (mocked).
    - Governance: audit event and Verify dialog (mocked answer).
    - The user menu open.
    - Explorer readings with "Not normal" and "At limit" (mocked) and the gate tiles.
  - Keyboard focus at 1440.
- **System Response mocked (G12)**, 1440 Day / Night, full page:
  - Response, Fit quality and Frequency for (a) the flow-loop input test (FOPDT), (b) the setpoint step with overshoot and
    (c) the LIC level loop (IPDT).
  - Linked zoom and Reset, a "?" tip, hover at both chart edges.
  - Redraw on a mocked 40-day accepted event:
    - The "no longer kept" note.
    - The form, Reading 0 and "Reading the historian · 181 points" over two pages.
    - The redrawn trends with the one label, the Model fit line, and the Fit quality and Frequency lines.
  - Historian 500 → failure and Retry.
  - A 100-day event → disabled button with the 90-day reason.
- **Trends shown**, against the brief's expected lists:
  - (a) 1, 2, 3, 4, 7, 8: as expected.
  - (b) 1, 2, 3, 4, 5, 7, 8: trend 3 shows because the mocked servo step carries a fitted gain, dead time and time constant;
    trend 7 shows because the integrals reproduce.
  - (c) 1, 2, 6, 7, 8: trend 7 reproduced.
  - The real FIC10302 event (stored charts, 1440 and 390) shows 1, 2, 3, 4, 7, 8.
- **Not covered, or partly covered**:
  - The Workbench "Artifact not available" state was shot at 1440 only (mocked run).
  - The Evidence package message was shot at 1440 only; at 1000 / 768 it stayed "Building…" for the 30 s the run allowed, and at
    390 the Evidence package button was disabled when the tool reached it.
  - The Models hover readout near the sidebar edge cannot be judged: the lab loop has one model (one point in the middle).
  - Explorer Summary had no trend data: the lab feed stopped on 7 Nov.
  - Administration dialogs were not opened (no dialog is named in the brief).
  - Designer, KPI drill-down and Alarm Console are out of scope.

## What was mocked

All mocks were `page.route().fulfill()` inside the test browser; nothing was written to the lab.
- **G12 events** (`g12mock.mjs`): the event list, event detail, method-run manifest and artifact chunks (bundle answered 404,
  so the page used the chunk route) for FIC10401 (a), TIC10403 (b) and LIC10401 (c).
  - Built on the real FIC10302 event: its result keys, its 52 quantities' units and methods, and its 14 artifact kinds,
    columns and provenance.
  - Quantities are computed from the curves with the page's own reproduction rules.
  - Plus a Bode for (a), and a holdout prediction on the previous day's times, as the live engine writes it.
  - The list retention was mocked as `{acceptedDays 90, acceptedChartDays 30, censoredDays 3}`. The real lab cplm-api sends no
    `acceptedChartDays` key at all (older image), so AGED_OUT cannot appear on real data.
- **Redraw**: a 40-day and a 100-day copy of event (a) with readiness NONE. `/api/hist/raw/cursor` was mocked with two pages
  (page 2 delayed 3.5 s, to photograph Reading), and with HTTP 500 for the failure. Separately, the real historian was used
  unmocked (table above).
- **Workbench**:
  - Evaluate: POST `/analysis-runs` → QUEUED, then RUNNING ×3, then FINISHED with a verdict.
  - Reconstruct: POST → `ar-mock-1`, which stays RUNNING; the page clock was moved 5 min 10 s.
  - Evidence of a G4 / G10 run: chg193 `evidenceMock.mjs`.
  - For the Done photo only, the page's 1.2 s auto-close timer was stretched to 9 s.
- **Explorer**: `/api/hist/snapshot` with OP 100 (the registered max) and mode MAN.
- **Window Inspector**: `/pipeline-metrics`, so the band chip shows.
- **Governance**: POST `/api/audit/verify` answered "Chain intact: 18,204 entries walked."
- **Gate Configuration**: GET deployments with one ROLLBACK, ACTIVE_VERIFIED deployment, all three workers ACK, on
  FIC10302's real bundle.
- **Workbench, missing kind**: chg193's mocked G10 run viewed on G15.
- **Not mocked, real lab**: every page view; the package build (a real 125 s build with one part not read); Measured vs
  required; Shelve, Retire and Review opened only.

## Blocked-call log

Empty. The guard aborts every non-GET `/api/` call except `/api/auth/login`, `/api/auth/refresh` and READ_POSTS.
- No call was blocked in any run: page sweep (334 API calls) and its retake, all states runs, sr-mock, redraw-real,
  redraw-phases, extra, calcprobe.
- Writes were answered by mocks (179 + 6 + 6 + 4 mocked calls in the states runs, 86 in sr-mock) and never reached the lab.
- HTTP errors seen were lab-side:
  - 401 on `/api/auth/refresh` at login.
  - 500 on `/api/v1/cpm/calculations`, `/fleet/rankings`, `/loops`, `/gate-catalogue`, `/api/assets/filters/sites` and, once,
    `/response-events/8bda8c01…`. These are Postgres read timeouts under load. The affected views were retaken
    (SR Response at 390, Window Inspector at 1000 / 390); the retake loaded.
  - One 504 on `/api/auth/login`, retried by the tool.
