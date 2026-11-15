# Task 15 — CHG-198: redraw an event's trends from the historian when its stored charts are gone (owner, 15 Nov 2026)

Branch `feat/cpa-redesign` after CHG-197 (`efd6c6a5`). Frontend only. Brief:
`.superpowers/sdd/2026-11-15-owner-prod-review/chg198-brief.md`. One commit (this report rides in it). Not pushed. No docker, no
subagents, no engine or API change. Text changes: `docs/theme/redesign/text-changes.md` `## CHG-198`.

## Structure

New folder `components/Cpm/response/redraw/` (every file under 120 lines):

- `historianRead.ts`: the window (`redrawWindow`), the historian's keep (`HISTORIAN_KEEP_DAYS = 90`, comment naming
  prod_decision.md "Loop historian namespace" TTL 90 d: no setting or API serves it), the paged read (`readHistorian`, the
  existing `getRawCursor` / `/api/hist/raw/cursor`, 9,000 rows a page as Evidence Replay, every page until `hasMore` is false; a
  cursor that does not move on stops the walk) and the failure words.
- `redrawArtifacts.ts`: the historian points as the arrays the CHG-197 trends read (`accepted_samples`, `input_reconstruction`,
  `response_event`, `target` on a reproduced setpoint step) plus `historian_sp` (the setpoint of every sample, which the stored
  arrays never carry); `plannedTrends` names the trends a redraw makes before anything is read (the CHG-197 builders run on the
  event's window with no sample yet, so the names follow exactly the same rules).
- `useRedraw.ts`: `useRedrawn(eventId)` (react-query cache key `['cpm','response-redraw',eventId]`, `skipToken`, kept 30 min after
  the last screen showing it; nothing on the server) and `useRedrawRun` (Reading with points so far → Drawing → Done / Failed;
  AbortController aborted on Cancel, on close and on unmount).
- `RedrawDialog.tsx` (the Evaluate pattern: `ui/Dialog` with subtitle, `.cpm-run-form` rows Window / Signals / Trends, Cancel
  normal + Redraw raised, `RunProgress` in place, `useTick` / `useAfterDone` from `useRunClock`, Retry on failure),
  `RedrawAction.tsx` (the `ReasonedButton` in the note, the dialog in a portal), `RedrawnTrends.tsx` (label + the CHG-197
  `ResponseTrends` + the Model fit line; `NotRedrawn` for the other tabs), `redrawWords.ts` (every new sentence once).

Existing files, optional additions only (callers without them behave exactly as before):
- `trends/responseFacts.ts`: optional `sp` (from `historian_sp`); `errorIntervals` uses each sample's own setpoint when it is
  there, with the same "all three integrals reproduce (relative 1e-6)" rule. `trends/errorTrend.ts` exports its title.
- `trends/ResponseTrends.tsx`: optional `lead` / `foot` nodes. `ResponseNotes.tsx`: `ArraysNote` takes children (the button).
- `evidence/RunProgress.tsx`: optional `word` replacing the in-flight state word (Evaluate / Reconstruct unchanged).
- `EventPanes.tsx`: `redrawn` and `eventName` props; `ResponseWorkspace.tsx` reads `useRedrawn` and passes both (the event as
  `eventPick` names it in the selector).
- `styles/cpm-response.css`: two spacing rules (label above the trends, Model fit line after them) with the rows' token gap.

## Behaviour

- **When**: the Response note of an event whose G12 charts are gone: NOT_KEPT ("Charts are not available for this event.") or
  EXPIRED ("removed by retention", which the chart cap also produces). Never while stored charts exist; a redraw held in the page
  is ignored as soon as stored charts are present. FAILED (charts failed verification) is not offered: not in the brief's list.
- **Disabled**: when the first sample the redraw needs (step − pre-support) is older than 90 days; the reason under the button
  and as its `aria-describedby`.
- **Read**: `pv,sp,op` (`pv,sp,vp` on a VP_TO_PV path: the engine's input there is VP, `ResponseCapture` `vpMapped ? vp : op`),
  from step − 120 s to the event end + 1 ms (the historian's end is exclusive; the engine keeps the sample at the end).
- **Trends**: the CHG-197 builders unchanged, so each trend shows only when it applies, with its heading, "?" tip, linked axis,
  zoom and Export CSV. Model fit is never built (no `y_fit`). Every number is the engine's stored quantity. Marks that need the
  engine's own number are drawn only when the historian samples reproduce it, otherwise left out with the value in the table:
  the setpoint (r1 − r0 of the samples must give `sp_step`), the settling and setpoint bands (as CHG-197), the wrong-way dot (as
  CHG-197), and the Error trend (now from the per-sample setpoint, so a setpoint moving inside the event can be reproduced).
- **Label**: "Redrawn from the historian. The values are the engine's; samples the engine left out are not marked." once above
  the trends. Model fit line (event with a fitted gain), Fit quality and Frequency (margin reported) lines after a redraw.
- A censored event redrawn: the CHG-195 "interrupted" note, then Measured response and Input only (as with stored charts).

## Tests and checks

TDD: each new test was run and seen failing first (missing module, then the behaviour; the per-sample error test was also seen
failing with the `sp` use switched off).
- `redraw/historianRead.test.ts` (7): window from step − 120 s to end + 1 ms, VP path, no window without an end, the 90-day keep,
  every page read with each cursor and the progress counts, a stuck cursor stops, plain failure words.
- `redraw/redrawArtifacts.test.ts` (8): points → arrays (window, duplicate instants, missing PV masked), no PV → nothing; the
  redrawn trends of the three fixtures with the engine's labels; setpoint drawn only when reproduced; error from per-sample SP
  (a ramping setpoint that CHG-197 could not draw); error left out on a 1 % IAE difference; `plannedTrends` per event kind.
- `redraw/RedrawDialog.test.tsx` (5): band and rows, Cancel / Redraw variants; Reading → "· 200 points" → Drawing → Done with
  elapsed → auto-close at 1.3 s with the cache filled; failure → reason + Close / Retry, Retry reads again; no samples; Cancel
  aborts the read's signal and keeps nothing.
- `redraw/RedrawOnPanes.test.tsx` (7): button in the note for EXPIRED and NONE (secondary), never with stored charts or on
  another tab, disabled past the keep with its description, opens the dialog with the subtitle, redrawn trends under one label
  with the Model fit line and the quantities after, a censored redraw, the Fit quality / Frequency lines.
- Updated: `EventPanes.test.tsx` (the note's line is read from its span: the note now also holds the button);
  `ResponseWorkspace.test.tsx` (wrapped in a QueryClientProvider: the page reads the redraw cache); `trends/trendFixtures.ts`
  (the setpoint-step and level fixtures' result now carries the same event end as their marker; CHG-197 tests unchanged, green).

Before the commit: `npx vitest run` 351 files / 2935 tests passed (was 347 / 2908); `npx tsc --noEmit` clean; `npm run lint`
clean; `npm run lint:theme` 0 matches; `npm run build` built. No screenshot round (owner rule).

## Concerns

1. **Pre-support 120 s, not 60 s.** The brief names "the engine default 60 s used for the baseline median". That 60 s is only
   `ResponseMetricCalculator.Settings`' field default; the live job overwrites it with `ResponseJobConfig.preSupportS = 120`
   (`ResponseEvaluator.metricSettings`), the factory layer says `G12.pre_support_s: 120`, and the stored `accepted_samples` start at
   step − 120 s. The event and its quantities carry no pre-support (every quantity's support is the step to the event end), so the
   constant `PRE_SUPPORT_S = 120` is used with a comment. It only sets how much PV before the step is drawn; no value depends on it.
2. **VP path reads VP**, not OP (the engine's input there); the dialog says "PV, SP, VP" on such an event.
3. **The Error trend and the bands may be left out where the historian's values are not bit-identical to what the engine saw**
   (the lab's simulator writes doubles that the v2 layout stores as FLOAT; the plant's values are 32-bit, so they reproduce) or
   where the engine dropped samples (not in Auto, bad quality). The dialog's Trends row names Error when the engine reported its
   three integrals; if the samples then do not reproduce them, Error is left out and its values stay in the table.
4. The CHG-197 "?" tips of the Measured response and Error trends still say rejected samples are gaps / left out; on a redraw no
   sample is known to be rejected, which the one label says. The tips were kept as the brief asks (no fork).
5. Not seen in a browser with live data (owner rule: the controller's end-of-batch pass). Worth looking at: one EXPIRED accepted
   event (redraw, the label, Model fit line), one older than 90 days (disabled + reason), Day and Night at 1440 / 390 px.
