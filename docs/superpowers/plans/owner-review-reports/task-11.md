# Task 11 — CHG-193 fix pass: quieter secondary buttons, technical text removed, final review fixes

Branch `feat/cpa-redesign` from `de86e0b1`. Frontend only (`src/frontend-ob`), plus the design note
(`docs/theme/redesign/components.md` §6.11 / §6.15) and `docs/theme/redesign/text-changes.md` (`## CHG-193`).
Brief: `.superpowers/sdd/2026-11-15-owner-prod-review/fix-pass-brief.md`.

Browser evidence: the coordinator stopped screenshots part-way (owner decision: one browser round at the very end, after all
batches). What was taken is in `docs/theme/redesign/evidence/chg193/` (not committed); everything else is listed under
"Moved to the final test round". Paths below are relative to that folder.

## A. Owner decisions of 15 Nov 2026

### A1. Quieter Secondary buttons (+ M10 file split)
- **Weight.** OpenBridge reads one variable (`--global-typography-ui-button-font-weight`) for every variant and keeps the
  variant as a class inside the shadow root, and the React wrapper sets `variant` as a property, so a stylesheet could not
  tell raised from normal. New `ui/obcButtonVariant.ts` (imported first in `main.tsx`) marks Lit's `variant` property as
  reflected, so every host carries `variant="raised|normal|flat"`. `styles/button-standard.css` then sets
  `--global-typography-ui-button-font-weight: var(--font-weight-regular)` on `[variant='normal']` and `[variant='flat']`
  only (the OpenBridge token, 370); raised (Primary) keeps the OpenBridge semibold. If an OpenBridge upgrade breaks the
  reflection, `ui/obcButtonVariant.test.ts` fails and every label falls back to semibold, which is the old look.
- **Border.** Enabled normal / flat border `--traverse-border-subtle` (was `border-strong`); the `surface-raised` tint stays;
  hover (cyan border and text), pressed and disabled unchanged; height and padding unchanged.
- **Plain buttons.** `ui-btn--secondary` (ui/components.css): subtle border, `font-weight: var(--font-weight-regular)`.
- **M10.** The button standard moved out of `styles/openbridge-bridge.css` (410 → 284 lines) into
  `styles/button-standard.css` (149 lines), imported right after the bridge; same rules, same order. The bridge keeps the
  RD9 sizes and the pre-CHG-183 values (see B2).
- **Design note.** components.md §6.15 (the new Secondary A look, Primary semibold, the weight mechanism, the display-content
  rule) and §6.11 (subtitle joins the description).
- **Tests.** `styles/buttonStandard.test.ts` (Secondary A rule reads `border-subtle`; "labels normal and flat buttons in the
  regular weight; raised (Primary) keeps the OpenBridge semibold"; "lives in its own file, loaded right after the bridge,
  and both stay under 400 lines (M10)"; plain `<button>` look); `ui/obcButtonVariant.test.ts` (3 tests on the real
  `obc-button` element: property → attribute, default `normal`, a change follows).
- **Screenshots.** `buttons/after-workbench-{day,night}.png`, `buttons/after-dialog-foot-{day,night}.png`; before:
  `buttons/before-workbench-{day,night}.png`, `buttons/before-dialog-foot-{day,night}.png` (copied from the final sweep, head
  `de86e0b1`).

### A2. Technical text removed
- **Governance.** `VerifyDialog.tsx`: "The audit log answered:", "The audit log could not be reached, so the chain was not
  checked.", "Audit log not reached", the 500 sentence names the audit log, not "a 500". `AuditTrail.tsx`: "The audit log
  refused the read" (no "(403)"), "Your sign-in was accepted by the app but not by the audit log…", "Audit log not reached".
  `GovernanceHowToRead.tsx`: the chain sentence without "hash-chained by audit-service". `ChangeTraceability.tsx`: row
  "Service build" (was "cplm-api build"). Tests: `VerifyDialog.test.tsx` (3 updated), `AuditTrail.test.tsx` ("the audit log
  refusing or not answering", 2 new), `CpmGovernance.test.tsx`, `ChangeTraceability.test.tsx` (updated).
- **Window Inspector band** (`CpmWindows.tsx`): the chip is "Calculation running" (neutral, Q3) or "Calculation not running"
  (red); no engine name, state code or checkpoint age. Test: `CpmWindows.page.test.tsx` "says Calculation running or not
  running in the band, without the engine name, its state or a checkpoint". Screenshots: `windows/band-{day,night}.png`
  (pipeline-metrics read mocked so the chip shows; the lab read returned no job).
- **Workbench views** (`evidence/views/ShortViews.tsx`, `LongViews.tsx`): every chart title, axis name, legend name, row label
  and table head in words (PV / SP / OP / VP, "Applied input", "Requested input", "Not mapped", G7 and G9 heads, "Out of
  region", "High dwell"); units unchanged. G7 `accepted` reads Yes / No and the reject reason goes through `codeLabel`; the
  G10 pressures go through `codeLabel` ("Not mapped"). **CSV columns unchanged:** `CpmSeries.csvLabel` and
  `CpmChart`'s `csvXLabel` keep the exported column names (`u_applied (pp)`, `frequency_hz (Hz)` …) while the legend and axis
  read words. `response/ResponseChart.tsx` already spoke words (only its series ids are keys); nothing to change.
  `response/CandidateModelsTable.tsx`: "Flat delay", "Bounds hit", "Sign uncertain", "Delay uncertainty", axis "Dead time"
  (CSV x column keeps the quantity). Tests: `views/views.words.test.tsx` (6 new: G1, G2 + G2r, G3 + G4, G6 + G7 + G9,
  G10 + G11 — each scans the page text, legends and x axes for snake_case and shouted codes — and "keeps the CSV column names
  the views exported before", which reads the exported file), `CpmChartCsv.test.tsx` ("keeps the series key as the CSV
  column when the legend name is in words"), `response/CandidateModelsTable.test.tsx` (new), `views/views.test.tsx` (4
  expectations moved to the new words). Screenshots: `workbench/g4-control-activity.png`, `workbench/g10-actuator-limits.png`
  (evidence mocked: method run, manifest and gzipped f64 chunks, checksum-verified by the page's own codec).
- **Other scan fixes.** `CpmPerformance.tsx` tip "Whether the analysis is running and up to date"; Pipeline Health checkpoint
  axes "Checkpoint age (s)" / "Checkpoint duration (ms)" (`CheckpointHistory.test.tsx` updated); Gate Configuration
  "Active bundle on this worker", and the Diff & impact class sentences without `STATE_BOUNDARY` / `WAITING` /
  `DEPLOYMENT-class` (`DiffImpactPanel.test.tsx` "says what a state-boundary and a deployment-class change do in words",
  watched failing against the old file first).
- **The scan** (TypeScript AST over `components/Cpm`, `pages/cpa`, `components/Administration`: JSX text, display attributes
  — title, aria-label, label, placeholder, copy, empty … — and string children; snake_case, SCREAMING_CASE, and Flink, Kafka,
  cplm-api, audit-service, job, checkpoint, ckpt), plus a grep for those service names in string literals. 48 hits; what was
  left and why:
  - False positives (identifiers inside template expressions; the rendered value is data or a word): `event.loop_id`,
    `r.role_name`, `opened_at`, `keepalive_seconds`, `grid_seconds`, `registry_refresh_seconds`, `SOURCE_TAG`,
    `CASE_LABEL`, `TYPE_NAMES`, `HEALTH_FILTERS`, `FACET_HINT`, G13's `P(xcorr, 'lag_sign_convention')`.
  - **"job" / "checkpoint" on Pipeline Health** (JobList, JobPanel, PipelineTiles, CheckpointHistory, CpmPipeline empty
    states) and **"Job" in Gate Configuration › Workers, the effective-configuration workers table and Diff & impact's
    "read by no running job"**: kept by the CHG-184 ruling (item0-sweep rows for Pipeline Health and Gate Configuration:
    "the job's readable name, the page's subject" and "each job and what it applied"). "ckpt" abbreviations were spelled out.
  - **Gate Configuration deployment matrix** (PREPARE / APPLY heads, ACK / NACK pills, the server's `semantics` text, the
    observers' engine names): kept by the same ruling ("ACK matrix … server-served reason codes and semantics text").
  - **Data values from the evidence artifacts** (G0 quality / hold-kind code counts and native quality, G1 mode codes,
    G11 eligibility codes, G13 `PEER_UNOBSERVED`, the G15 engine trace's hypothesis codes, `EXPIRED (RETENTION)` on a
    missing artifact): values as recorded, not labels; the G15 engine trace is the SME-kept raw section (item0-sweep owner
    question 5).
  - **Owner questions still open in item0-sweep**: Change traceability's version rows and build values (Q2), Engine &
    timing (Q4), help-registry tips (Q6), the historian device path (Q8), System Response Steps & data estimator codes (Q9),
    server-served engine wording such as "CPLM Flink jobs running" (Q10). Only the "cplm-api build" label was changed.
  - **Evaluate failure messages** naming "the evaluation job" / the "CPLM On-Demand Evaluation" job and Reconstruct's "The
    reconstruction job failed / was cancelled": the item0-sweep ruling replaced Flink / Kafka with the job's readable name;
    "job" here is plain English for the run.
  - **Administration** import formats (`legacy_path,canonical_path,source_system`, `username, email, full_name, …`), the
    example slugs (`section_100`, `hdpe/section_100/…`) and the `john_doe` placeholder: the file format and examples an admin
    must type. `AlarmFeedConfig.tsx` (Kafka / Flink): not reachable (hidden from the slice, `check-tokens` HIDDEN list).
  - Permission keys shown to an admin (`admin.audit.view`, `cpm.analysis.create`): the key an admin must grant.

## B. Final review findings

- **B1 (I1).** `windows/SelectedWindow.tsx`: "Calculated values" is the first DETAILS item; `windows/WindowDialogs.tsx`
  `CalculatedValuesDialog` (ui/Dialog, wide, subtitle "FIC10401 · Flow controller · 15 min window", a Window row exactly as
  the panel prints it, then `WindowResults`). Never "Record details". Tests (`SelectedWindow.test.tsx`): "opens the window's
  calculated values from the Details grid, with the window line", "shows the long metrics for a long window", plus the grid
  order and subtitle tests updated. Screenshots: `windows/calculated-values-{day,night}.png`, `windows/page-day.png`.
- **B2 (I2).** Every Secondary A rule in `styles/button-standard.css` is scoped
  `obc-button:not(:where(.designer-canvas__stage *, .display-viewer__stage *))` (`:where` keeps the old specificity, so the
  precedence among the rules is unchanged); the bridge keeps the pre-CHG-183 host values (`--normal-enabled-background-color:
  transparent`, the flat hover text), so a button symbol on the Designer canvas or the runtime view looks as before CHG-183,
  including the semibold label. Alarm Console and the user menu's Sign out are outside the stages, so they keep the app
  standard. Test: buttonStandard "leaves the Designer canvas and the runtime view on the earlier look: every Secondary A rule
  excludes them". Screenshots: `b2/user-menu-{day,night}.png`; `b2/stage-buttons-after-{day,night}.png` and
  `b2/stage-buttons-before-simulated-{day,night}.png` — see Deviations for why these are a rendered fixture.
- **B3 (M1).** `evidence/EvaluateWindow.tsx`: the window end is taken once at the click (`sentEnd` state) and shown while the
  run exists; the idle form re-renders at each whole minute (`useMinuteTick` in `useRunClock.ts`; quarter-hour boundaries
  are whole minutes). Tests: "keeps showing the window it sent while the run crosses a quarter-hour" (watched failing),
  "refreshes Now on the idle form at the minute, and sends the window it shows" (passed before the change too: something else
  re-rendered the dialog in jsdom; kept as a guard).
- **B4 (M2).** `runPhase.ts`: the 5-minute failure carries `keepWaiting: true`; `ReconstructDialog.tsx` then shows Close,
  Retry (secondary), Keep waiting (primary, last); `useReconstructFlow.ts` `keepWaiting()` restarts the wait (`waitFrom`)
  with no new request, while the time shown still counts from the click. Tests: `runPhase.test.ts` "offers Keep waiting after
  5 minutes, counting the next wait from the last Keep waiting"; `ReconstructDialog.test.tsx` "after the time limit offers
  Keep waiting as the primary and Retry as secondary"; `useReconstructFlow.test.tsx` (new) "after 5 minutes Keep waiting runs
  the wait again and posts nothing new".
- **B5 (M3).** `RECONSTRUCT_POLL_CAP_MS` = 30 min from the click: `useDeadline` flips at that moment, the manifest and the
  run-state polls stop (`useAnalysisRunState` takes `undefined` = no polling), and the phase reads "No result after 30
  minutes. It may still finish; open this window again later to see it." with no Keep waiting. Tests: `runPhase.test.ts`
  "stops 30 minutes after the click, whatever Keep waiting did, saying it may still finish"; `useReconstructFlow.test.tsx`
  "stops reading the manifest and the run state 30 minutes after the click".
- **B6 (M4).** `useReconstructFlow.ts`: the rebuilt view is switched to when Done is reached with the dialog open; the 1.2 s
  delay only closes the dialog. Tests: `useReconstructFlow.test.tsx` "switches to the rebuilt view even when the dialog is
  closed inside the Done delay", "closes the dialog by itself after Done".
- **B7 (M5).** `ui/Dialog.tsx`: the subtitle has an id and joins `aria-describedby` (subtitle first, then the description).
  Tests (`ui/Dialog.test.tsx`): "joins the subtitle to aria-describedby", "keeps the description id beside the subtitle id,
  subtitle first", "has no aria-describedby with neither a subtitle nor a description".
- **B8 (M6).** `explorer/summary/readingState.ts` `modeReadingState` → "Not normal"; `SignalStrip.tsx` passes it as the
  reading's `state`, in the place and style of OP's "At limit". Tests: `readingState.unit.test.ts` "says Not normal for a
  live mode the engine does not count as normal, and nothing otherwise"; `SignalStrip.test.tsx` "marks a live mode that is
  not a normal mode amber, with the words Not normal, its name and note". Screenshots:
  `explorer/readings-mode-not-normal-{day,night}.png`, `explorer/summary-{day,night}.png` (the snapshot read mocked with a
  live MAN mode; the lab has no live publisher).
- **B9 (M8).** `config/DeploymentStatus.tsx`: row "Rollback" Yes / No (from `kind === 'ROLLBACK'` or `rollbackOf`), never the
  id. Test: `DeploymentStatus.test.tsx` "says whether the deployment is a rollback, as Yes or No, with no id".
- **B10 (M11).** `styles/cpm-workbench.css`: from 1280 px the head does not wrap; the gate title takes the room left and may
  wrap inside its own column; the run bar's actions stay on one line. Below 1280 px unchanged. Screenshots:
  `workbench/gate-head-1440-lab-{day,night}.png`, `workbench/gate-head-1440-g4-control-activity.png`,
  `workbench/gate-head-1440-g10-actuator-limits.png` (actions on the title line).

## C. Sweep findings

- **C1.** `styles/cpm-blocks.css`: the gate dialog foot is a container (`.ui-dialog__foot:has(> .cpm-gate-actions)`); below
  760 px of foot width a grid puts Prev / Next and the primary on the first row and the "↗" links on their own row,
  left-aligned with an even gap. DOM order (so keyboard order) unchanged. CSS only. Screenshots moved to the final round
  (the 760 px threshold is estimated from the 1440 one-line foot and must be checked at 768).
- **C2.** `events/EventDetail.tsx`: "Investigation →" is `variant="normal"` (secondary); Acknowledge stays the one primary.
  The same component is the 1440 side panel and the < 1280 drawer. Test: `EventDetail.test.tsx` "draws Investigation → as a
  secondary button, the same in the side panel and the drawer".
- **C3.** Changed to neutral (they mean "normal"): the Loop Explorer gate tile pass mark (`.cpm-gate-tile--good`, now
  `text-secondary` like `.cpm-matrix__cell--good` on Performance), the Loop KPI card's good bar (the default neutral bar),
  `summaryText` "healthy", the Window Inspector count check "Matches" (`windowMath`), the Workbench window picker's
  all-pass / nothing-found tone (`useEvidenceWindows`), the G0 all-accepted pill, the G2r "In region" lane, Pipeline Health's
  job "Running" (`jobState`). Tests: `summaryText.test.ts`, `jobState.test.ts`, `windowMath.test.ts`,
  `useEvidenceWindows.test.ts` ("draws a window whose gates all pass neutral, never green") — each watched failing.
  Screenshot: `explorer/summary-{day,night}.png` (G2r ✓ neutral at the foot; the dedicated gate-strip crop moved to the final
  round). **Left as success, with the reason:**
  - recorded verified / completed outcomes (design system): Acknowledged, Saved, Approved, Valid, ACTIVE_VERIFIED, ACK ✓,
    shadow FINISHED, Verified (Pipeline verification), All loops activated, evidence COMPLETE / Ready, Evaluated, model
    ESTIMATED, note outcome "Performance restored", Done in the run progress, success toasts;
  - colour-only lane keys where neutral already means "no result / other": Historical's Result lane (No fault green, SME
    review 2 #12) and Mode lane (Automatic, cascade) with their ChartFoot key, the Workbench historian / signal-context mode
    lanes, G1's mode lane and G11's eligibility lanes — painting normal neutral there would merge two facts in a lane that
    has no words;
  - owner-approved coloured KPI icons on Overview / Performance (`cpm-kpicard__icon--good`, owner review 2026-11-06) and the
    Overview control-performance bar (Overview left as is, owner ruling);
  - NE107 signal quality "Good" (FacetPill) and instrument health "OK": NE107 diagnostic colours of the design system;
  - configuration lifecycle words in Loop Registry and Administration ("Active", "Ready", "OK", "Nothing missing",
    "Explicit"): states of a configuration record, not plant state; not reviewed on screen in this pass — a candidate for
    the owner's next round.
- **C4.** `windows/CompareAcrossKinds.tsx`: the inline `overflowX` wrapper became `.cpm-scroll-x` (styles/cpm-master-detail.css):
  the panel-coloured covers travel with the content and a shadow stays on the edge that has more (CSS only, tokens only).
  Screenshots moved to the final round.
- **C5.** `evidence/EvaluateWindow.tsx`: each timestamp is a `.cpm-run-form__stamp` span with `white-space: nowrap`; the arrow
  may wrap. Format unchanged (Q5). Test: `EvaluateWindow.test.tsx` "keeps each timestamp of the window unbroken".
  Screenshots moved to the final round.
- **C6.** `utils/modeVocabulary.ts` `modeLabel` returns `modeWord` ("Auto", "Manual", "Cascade"; any other token as stored), so
  Loop Explorer, Investigation's readings and the Signals tab use Replay's word. No "?" tip held the raw value, so none was
  added. Tests: `SignalStrip.test.tsx` (values "Auto", "Manual").
- **C7.** `styles/cpm-explorer.css`: the quality chip caption in the readings strip is sentence case (scoped to the strip, so
  the Overview queue's hidden caption is untouched). Screenshot: `explorer/readings-mode-not-normal-{day,night}.png`.
- **C8.** `investigation/NoteList.tsx` + `styles/cpm-evidence-layout.css`: "No notes on this loop yet." gets the list's own
  separation (`space-4` gap and the subtle divider). Screenshot moved to the final round.
- **C9.** `blocks/GateDialog.tsx` + `styles/cpm-blocks.css`: the Loop result value is a right-aligned column, the pill first,
  each secondary line under it; no text change. Screenshot moved to the final round.

## Verification

- `npx vitest run` (full, one run): 339 files, 2848 tests; **1 failed**:
  `src/components/Cpm/CpmInvestigation.test.tsx > CpmInvestigation > shows the values at the window end, from the same trend`.
  It expected the stored token "MAN" in Investigation's readings; C6 deliberately makes those readings use the shared mode word
  ("Manual"). The expectation was updated (comment CHG-193) and the file re-run alone: 29 / 29 pass. So the suite stands at
  2848 / 2848 with that file re-run; the full suite was not run a second time (coordinator: one run). The
  `Designer/TrendCore.trust.test.tsx` flake did not appear.
- `npx tsc --noEmit`: exit 0. `npm run lint`: exit 0 (0 warnings). `npm run lint:theme`: phase 3, 652 live files, 0 matches.
  `npm run build`: exit 0 (the usual chunk-size notice only).
- Files: all changed files are under 400 lines (largest: `ui/components.css` 377, `GateEvidenceWorkspace.tsx` 334,
  `openbridge-bridge.css` 284, `button-standard.css` 149).

## Deviations

1. **The weight needed a host attribute.** The brief assumed the weight variable could be set "for normal / flat only"; the
   OpenBridge button gives a stylesheet no way to tell the variant. Smallest change: reflect Lit's `variant` property to an
   attribute (`ui/obcButtonVariant.ts`, one line of effect, proven on the real element by a test), instead of touching 77
   raised call sites.
2. **B2 screenshots are a rendered fixture.** In this build `CPA_SLICE_ONLY = true`: `/alarms`, `/designer/:id` and
   `/display/:id` redirect to `/cpm`, so the Alarm Console, the canvas and the runtime view cannot be opened on the preview
   server. The user menu was captured. For the symbols, the same `obc-button` element (normal "Command", flat "Alarms",
   normal "Navigate →", raised "Primary", as SymbolRenderer draws them) was placed outside a stage, under
   `.display-viewer__stage` and under `.designer-canvas__stage` on a live page with the shipped stylesheets
   (`b2/stage-buttons-after-*`); `b2/stage-buttons-before-simulated-*` adds the CHG-183 values to all three rows to show the
   look the stages would otherwise have had. The fixture also confirmed the reflected attributes
   (`normal,flat,normal,raised` per row).
3. **B5 wording.** After the 30-minute cap the page no longer polls, so "this page lists it when it arrives" would be untrue;
   the cap message keeps "It may still finish" and ends "open this window again later to see it." The 5-minute message is
   unchanged.
4. **B3 idle refresh** re-renders at each whole minute (not every 60 s from opening), so a quarter-hour boundary shows within
   a second of the clock; still at most once a minute.
5. **Window Inspector chip** became "Calculation running / not running" (a plain restatement of the job state the page already
   read), neutral when running (Q3).

## Moved to the final test round (not taken)

Owner decision of 15 Nov: browser testing happens once, after all batches. Not taken here:
- Governance verify dialog (answered and not-reached variants; the POST is to be mocked).
- Evaluate running at 1440 (POST and status mocked) and the idle form at 390 Day + Night (C5).
- Reconstruct timeout state with Keep waiting (mocked job, page clock moved 5 min).
- Gate Configuration › Deployments with a rollback (deployments read mocked) (B9).
- Performance gate dialog at 1440 / 768 / 390 Day, 390 Night, its foot and the Loop result row (C1, C9).
- Loop Events episode panel at 1440 and drawer at 390 (C2).
- Compare window sizes at 390 Day + Night (C4).
- Loop notes dialog with no notes (C8).
- Loop Explorer gate-results crop Day + Night (C3; the full Summary shot shows it).
- Alarm Console, designer canvas and runtime view (not routable in this build, see Deviation 2).
The capture script for all of these is kept in the scratchpad (`chg193/capture.mjs`, `lib.mjs`, `evidenceMock.mjs`, `run.sh`;
sections `governance`, `evaluate`, `reconstruct`, `config`, `gatedialog`, `events`, `compare`, `notes`).

## Left, and why

- Pipeline Health / Gate Configuration "job" and "checkpoint" vocabulary, deployment matrix codes, artifact data codes and
  the open item0-sweep owner questions — see A2.
- The listed-pending reconstruction poll in `GateEvidenceWorkspace` (a rebuild asked earlier or by someone else) reads only
  the run state and stops at its terminal state; it is not the click flow M3 named, so it was not capped.
- `Designer/TrendCore` and other Designer chrome follow the app standard (they are app chrome, not display content).

Blocked-request log for the captures taken. First run (buttons, windows, explorer, b2): 0 blocked non-GET calls, 3 mocked
reads (pipeline metrics, the live snapshot). Second run (workbench section completed, then stopped on the coordinator's
instruction): it only opened pages, with the evidence reads mocked (method runs, manifests including the read-only batch
POST, chunks, a 404 for the run bundle); its log file was not written because the run was stopped, and no write control was
clicked. Credentials were read from `infra/docker/.env` at run time and never printed or written.
