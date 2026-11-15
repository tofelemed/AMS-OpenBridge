# Task 14 — CHG-197: System Response as separate trends with the response times drawn on them (owner Q10)

Branch `feat/cpa-redesign` after CHG-196 (`74e2f71a`). Frontend only. Brief:
`.superpowers/sdd/2026-11-15-owner-prod-review/chg197-brief.md`; sample `docs/theme/redesign/samples/19-response-curve-SAMPLE-*.png`.
One commit (this report rides in it). Not pushed. No docker, no subagents, no engine change. Text changes:
`docs/theme/redesign/text-changes.md` `## CHG-197`.

## Structure

- `components/Cpm/response/trends/` (every file under 150 lines): `responseFacts.ts` (what the trends read: the event's G12
  arrays and quantities only, no new request; plus the two reproductions below), `annotations.ts` (the shared mark helper:
  step line, guides, spans, brackets, dots, bands, segments, labels), `trendSupport.ts`, one file per trend
  (`measuredTrend`, `inputTrend`, `deadTimeTrend`, `riseSettleTrend`, `overshootTrend`, `slopeTrend`, `errorTrend`,
  `modelFitTrend`), `responseTrendSpecs.ts` (page order, censored rule), `ResponseTrends.tsx` (renders them).
- `ResponseChart.tsx` and its test retired (no other user); its still-valid assertions (quantityText, candidateRows) moved to
  `responseSupport.test.ts`, the band-meaning rule lives on in the model-fit trend; `afterT0Ms` (only that chart used it) removed.
- `evidence/CpmChart.tsx` extended with optional props only (a chart without them is built exactly as before; the 14 existing
  CpmChart tests unchanged and green): `xRange` (fixed shared time range), `zoomY={false}` (time-only rectangle zoom, so linked
  charts stay aligned), `annotate` (extra series built from the chart's own palette, so marks follow Day / Night; kept out of
  the legend and the hover readout), `dashDot` pen, `help` (the "?" beside the heading), `connectGroup` (joins
  `ui/trend/trendGroup.joinTrendGroup`, the existing ECharts connect helper; released on unmount).
- `EventPanes.tsx`: Response = result row, the trends (inside the existing `RequireKinds` loading / error wrapper), then
  "Reported quantities"; a censored event with its charts held gets the CHG-195 note "This event was interrupted before the
  response finished, so no model was fitted." above its two trends. Health exclusions line kept under the trends.

## The trends (top to bottom, one per row, 320 px; Input 180 px as the old panes; time axis format unchanged)

All share one time range (first sample to event end), one connect group (cursor and zoom aligned; Reset on one resets all),
and each has its heading (h2), a "?" tip saying how the engine measures it, Zoom area / Undo / Reset and Export CSV in its head.
Labels: words + value in the value style (text-primary, weight 600), annotation text in text-secondary (`chart-tick`);
pens: PV `--signal-pv` solid, setpoint `--signal-sp` dashed and labelled, OP `--signal-op`, model fit `overlay` dash-dot.

| # | Trend | Draws | Shows when |
|---|---|---|---|
| 1 | Measured response | PV (rejected samples as gaps), step, Baseline (baseline_pv), Final value (endpoint_pv), Setpoint (target array, setpoint step only), PV change bracket (endpoint − baseline), Wrong-way move guide (undershoot % of the change) and its dot on the matching sample | every event with accepted samples |
| 2 | Input | OP applied (held), step, OP change bracket (input_step), "Gain (model)" (process_gain, labelled as the fitted value) | the input array exists |
| 3 | Dead time and time constant | PV, step, Dead time span from the step, 63 % of the change guide, Time constant span after the dead time (second order: slower and faster time constants), Measured 63 % dot (t63) | not censored, not a slope response, process_gain + dead_time + a time constant reported |
| 4 | Rise time and settling | PV, step, 10 / 50 / 90 % crossing dots, Rise time span, Settling band + Settled point, on a setpoint step Setpoint band + At setpoint point (settle_target) | not censored, not a slope response, baseline + final value + any of those times |
| 5 | Overshoot | PV, final value guide, Peak at (peak_time, peak_pv), Overshoot bracket (%), Error left from the setpoint (steady_error, setpoint step) | not censored, not a slope response, overshoot > 0 with a qualified peak |
| 6 | Slope | PV, step, Dead time span, slope line from the end of dead time with a rise-over-run triangle, Slope (post_slope), Integrating gain (model) | not censored, post_slope reported (integrating family or ramp tracking) |
| 7 | Error from the setpoint | error = setpoint − PV held per sample from the step, area shaded, "No error" guide, IAE / ISE / ITAE with units | not censored and the stored arrays reproduce the engine's three integrals |
| 8 | Model fit | PV, Model fit (training) dash-dot, Holdout prediction and the prediction band (named with its meaning) where they fall inside the window | not censored, y_fit exists |

A censored event shows 1 and 2 only. A level (IPDT) event shows 1, 2, 6, 8 (7 when reproduced), never 3 / 4 / 5. Decay ratio is
never drawn; `overshootTrend.ts` says why in a code comment. Every value is the engine's; an unavailable quantity draws nothing.

### Two marks drawn only after reproducing the engine from the stored arrays

- **Settling bands**: the band is not stored. `responseFacts.responseBand` takes the engine rule (Settling.responseBand with the
  factory 0.1 PV unit / 2 % of the change / 0.05, centred on endpoint_pv) and redoes Settling.settle on the accepted samples
  (60 s gap rule); the band is drawn only if that gives the engine's settle_response exactly. Same for the setpoint band
  (0.5 PV unit, settle_target). A bundle that changed `G12.settling_relative_band` / `settling_abs_band_pv_eu` gives another
  time and the band is left out (the settled point, a stored sample, is still drawn).
- **Error trend**: ErrorIntegrals uses the per-sample setpoint, which is not stored. `errorIntervals` redoes the integrals with
  the setpoint before the step (target − sp_step) for the straddling sample and the target after it, and draws only if IAE, ISE
  and ITAE all match the engine (relative 1e-6). Where the setpoint moved inside the event (ramp tracking, a Manual input test
  with SP tracking PV), nothing is drawn and the values stay in the quantities table.

## Fit quality — technical text removed (CSV keys unchanged)

Residual panel: "Subgate E" → "Step E"; rows and values in words (State Validated, Verdict Pass, Free-run error (RMSE) …);
"Residual (PV − model)" in the loop's unit; "Autocorrelation", "Lag (samples)". Candidate models: "Step D", pill in words,
"Delay search (best candidate)", curve "Fit error" in "(m3/h)²"; the candidates and parameter-uncertainty tables are the
standard table with heads and cells in words (model family names, "OP → PV", "Gain 3 · Dead time 4 s · Time constant 20 s",
"Condition number 10.5", "Process gain", "Covariance"); rejection reasons "Estimation · Not estimated · No excitation", no
"Kernel" eyebrow. Every change is listed in text-changes.md. New helpers in `responseLabels.ts`: `familyLabel`,
`candidateParamText`, `reasonText`, `validationLabel`.

## Engine findings (recorded, engine not changed)

1. **Model family by loop type only**: `CplmResponseAnalysisJob.familyFor` → loop type `LIC*` = integrating with dead time
   (IPDT), every other loop = first order with dead time (FOPDT). Second order, underdamped and integrating-with-lag are never
   fitted live, so trend 3's second-order variant does not appear on live data.
2. **Event types produced live**: only Servo step, Ramp tracking and Input test (found while sampling).
3. **Decay ratio is wrong on noisy data**: `Overshoot.decayRatio` takes any local maximum more than the settling band past the
   final value as a peak, so a noise wiggle on the tail becomes the "second peak". Not drawn; stays in the table.
4. **Holdout prediction lies on the previous event's times**: `ResponseEvaluator` writes `y_predict` on `priorHoldout.t`, so it
   cannot share this event's time axis or be compared with its PV; it is drawn only where inside the window (in practice
   never) and the tip says the check is on Fit quality. The live engine writes **no prediction band** (`predLo` / `predHi` passed
   null: no noise model).
5. The settling band and the per-sample setpoint are not stored (see the two reproductions above); the `baseline` array falls
   back to the first sample when baseline_pv is unavailable, so the trends read the baseline_pv quantity only; post_slope has no
   intercept, so the slope line starts at the baseline at the end of the dead time.

### Engine quantities with a time meaning that no trend draws

- `pre_slope` (drift rate before the step) — pre-event, not a response time.
- `natural_frequency`, `damping_ratio` (second order underdamped) — never fitted live (finding 1); no span meaning.
- `zero_time_constant`, `constraint_duration` (and `process_gain_normalized`) — never produced by the live job (always
  unavailable).
- `controller_ti`, `controller_td`, `controller_scan` — configured controller settings, not measured response times.
- `mae_time`, `rmse_time`, `valid_coverage` — time averages / coverage of the same error integrals; in the table.
- `gain_crossover`, `phase_crossover`, `closed_loop_bandwidth` — frequency quantities, on the Frequency tab.
- `servo_gain` (PV change ÷ setpoint change, setpoint steps) — no time meaning; in the table.

## Tests and checks

TDD: each new test was run and seen failing first (missing module / wrong output), then passing.
- `evidence/CpmChartLinked.test.tsx` (5): shared range, annotations out of legend and readout, time-only zoom, dash-dot, help tip
  in the head and one connect group.
- `trends/trendSpecs.test.ts` (17): which trends show for self-regulating / setpoint-step / level / censored events, an
  unavailable quantity draws nothing, decay ratio never drawn, labels with the engine values and units per trend, band and error
  shown only when reproduced (a 1 % IAE change or another settled time removes them).
- `trends/ResponseTrends.test.tsx` (6): one trend per row with tip and zoom tools, one connect group, censored = 2 trends, level =
  measured / input / slope / model fit, health exclusions kept, and the marks really render (ECharts SSR to SVG contains the labels).
- `EventPanes.test.tsx` (+2), `CandidateModelsTable.test.tsx` (+1), new `ResidualPanel.test.tsx` (1), `trendRows.test.tsx`
  (title updated), `responseSupport.test.ts` (+2 moved).

Before the commit: `npx vitest run` 347 files / 2908 tests passed; `npx tsc --noEmit` clean; `npm run lint` clean;
`npm run lint:theme` 0 matches; `npm run build` built. I looked at my own layout once (ECharts SSR of the fixture events rendered
in the scratchpad, Day palette) and moved three labels off the curves; no screenshot evidence was produced (owner rule).

## Concerns

1. Not seen in a browser with live data: label placement is tuned on fixtures; a noisy plant curve may push a label onto the
   PV line. The controller's end-of-batch browser pass should look at one FOPDT input test, one setpoint step and one LIC event
   in Day and Night at 1440 / 390 px.
2. The error trend and the settling bands will often be absent on live data by design (setpoint moving inside the event, or a
   bundle band); the values stay in the quantities table.
3. Export CSV per trend replaces the old two CSVs (Output / Input); column keys kept, units now in the loop's units.
