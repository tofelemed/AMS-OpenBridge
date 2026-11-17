# System Response: how it works

Checked against the code on `feat/cpa-redesign` (engine `src/flink/.../cplm/response`, page `components/Cpm/response`),
16 Nov 2026. "Units" means the loop's PV engineering units.

## 1. In one paragraph

The engine watches every loop. When the setpoint or the valve signal makes a clear step, it records how the PV
responds (an **event**). When the PV settles, the engine measures the response (rise time, settling, overshoot...),
tries to fit a model (gain, dead time, time constant) and checks that model against the loop's previous event.
If something interrupts the event before the PV settles, the event is **censored**: it keeps its measurements and two
charts, but gets no model.

## 2. When an event starts

All of these must be true:

| Condition | Value |
|---|---|
| Loop in Auto, data good, PV instrument healthy | — |
| Calm data before the step | 120 s |
| Step size bigger than the largest of | 1.0 unit · 1 % of span · 4 × the noise of the 120 s before |
| New level holds | 30 s |

Today the span is fixed at 100 for every loop, so the 1 % rule always means 1.0 unit.

What starts the event decides its type:

| What moved | Event type |
|---|---|
| Setpoint steps | **Servo step** |
| Setpoint ramps (at least 0.02 units/s for 120 s) | **Ramp tracking** |
| No setpoint change, but the valve signal steps (VP if connected and fresh, else OP) | **Input test** |

The engine produces only these three types today. Cascade setpoint step, load response, disturbance response and
routine identification exist in the design but are never produced.

## 3. How an event ends

| Outcome | When |
|---|---|
| **Accepted** (settled) | At least 180 s after the step, the PV stays within 0.5 units for the last 120 s, and inside the settling band for 120 s. Settling band = the largest of 0.1 units, 2 % of the PV change, 0.05 units. |
| **Censored** | Something stopped the event before the PV settled (table below). |
| **Rejected** | Capture shorter than 180 s. In practice this never happens, because the settle rule already waits 180 s. |

### Why an event is censored

| Reason on screen | What happened |
|---|---|
| Capture reached its maximum length | The PV did not settle within 4 hours. |
| Superseded by a later event | The same signal stepped again (and held 30 s) before the PV settled. The first event is censored, and the new event carries both steps. |
| Controller changed mode | The loop left Auto. |
| Source gap | No sample for more than 60 s, or the input switched between VP and OP (VP went stale or came back). |
| Instrument health made the window ineligible | The PV instrument became ineligible. |
| Budget exceeded | The PV settled, but the model fit took longer than 20 s. No model is kept; the event is shown as censored. |

Three more reasons exist in the code but are never raised today: context changed, region exit, actuator constraint.

At the plant, on the current loops in the 16 hours after the 16 Nov loop change: 3,499 events on 28 loops, all input
tests; 88 % censored as superseded by the next output move; 414 accepted. On the lab (3–7 Nov) none of 36,047 was
accepted.

## 4. What an accepted event gets, step by step

**Step 1: Measure (every event, censored ones too).** These are the "Reported quantities":
baseline, final value, setpoint step, input step, 10/50/63/90 % times, rise time 10–90 %, settling (response band),
settling (target band, ±0.5 units), overshoot, undershoot, peak time, steady-state error, decay ratio, IAE, ISE,
ITAE, mean and RMS error, data coverage.
Rise time, settling and overshoot need the PV to reach a steady new level and to move at least 0.5 units. Otherwise
they show "not applicable". On a censored event they are usually "not applicable".

**Step 2: Fit a model (accepted events only).** The model type is chosen by loop type only:

| Loop | Model | Input test / Ramp tracking | Servo step |
|---|---|---|---|
| LIC (level) | Integrating + dead time | Fitted | **No model** (not built for level loops) |
| All others | First order + dead time | Fitted | Fitted by a closed-loop method. Needs evenly spaced samples and enough setpoint movement, else "not estimated". |

The fit gives process gain (or integrating gain for level loops), dead time and time constant, each with ±.

**Step 3: Validate (the model state).** The new model is tested by predicting the loop's **previous accepted event**:

| Model state | When |
|---|---|
| **Candidate** | No earlier accepted event to test against yet, **or** the prediction error or bias is too large |
| **Validated** | Prediction beats a flat line, error ≤ the larger of 0.15 units and 10 % of the flat line's error, bias ≤ the larger of 0.05 units and 2 % of the flat line's error |
| **Rejected** | The model predicts no better than a flat line |

Each accepted event becomes the "previous event" for the next one.

**Step 4: Frequency (gain margin, phase margin, Bode).** This needs a **Validated** model **and** the controller's
tuning (gain, Ti, Td). The live engine is not given the controller tuning, so **this step never runs today**.

**Step 5: Tuning advice.** This needs a Validated model, the controller tuning and an approved closed-loop time. It
never runs today, for the same reason.

**Step 6: Human review (Models tab).** An engineer marks a model as Validated, Active baseline, Rejected or Expired.
Models nobody reviews are deleted after 90 days.

## 5. What each tab shows, and when

| Tab | Shows | Empty when |
|---|---|---|
| **Events** | Every event, one state per row: censored + reason, rejected, or the model state (Candidate / Validated / Rejected) | — |
| **Response** | Result card, the trends below (one per row), reported quantities | Charts no longer stored (see section 6): the Redraw button appears |
| **Fit quality** | Residuals over time, residual autocorrelation, candidate models, dead-time search curve, parameter ± table, rejection reasons | Censored event: "This event was interrupted before the response finished, so no model was fitted." |
| **Frequency** | Bode plot, gain and phase margins | Always today (step 4 never runs) |
| **Steps & data** | The 8 checks in order (eligibility, event capture, measured, estimation, validation, controller/frequency, model comparison, advisory), each with its state and why | — |
| **Models** | Model history: each parameter's trend over time, one per row, and the Review action | No model yet for the loop |

On Fit quality, residuals need a fitted model. Residual autocorrelation also needs the check against a previous event
(step 3).

### Response tab trends (each one only when it applies)

| # | Trend | Shown when |
|---|---|---|
| 1 | Measured response | Charts exist (censored events too) |
| 2 | Input | Charts exist (censored events too) |
| 3 | Dead time and time constant | A model with gain, dead time and time constant. Never for level loops or ramps. |
| 4 | Rise time and settling | The PV reached a new level and at least one time was measured. Never for level loops or ramps. |
| 5 | Overshoot | Overshoot measured and above 0 |
| 6 | Slope | Level loops and ramps, when the engine measured the slope after the step |
| 7 | Error from the setpoint | The stored samples give exactly the engine's IAE, ISE and ITAE |
| 8 | Model fit | A model was fitted |

A censored event shows only trends 1 and 2, plus the note that no model was fitted.

## 6. How long things are kept

| What | Kept | Then |
|---|---|---|
| Accepted event: record and quantities | 90 days | Deleted |
| Accepted event: charts | 30 days | **Redraw from historian** button (works up to 90 days) |
| Censored event: record, quantities and charts | 3 days | Deleted |
| All stored charts together | 2 GiB cap | Oldest charts go first; their events and quantities stay |
| Historian loop samples | 90 days | Gone; a redraw says "this event is older" |
| Models nobody reviewed | 90 days | Deleted |

**Redraw from historian** rebuilds trends 1–7 (Measured response, Input, Dead time and time constant, Rise time and
settling, Overshoot, Slope, Error from the setpoint) from historian samples, using the values the engine stored.
It never rebuilds Model fit, Fit quality or Frequency, because those need the engine's own stored arrays.

**At the plant until v2.9.1 is deployed (v2.9.0):** accepted events keep their record and charts 30 days and there is
no redraw; models nobody reviewed go after 30 days; censored events keep their record 3 days but their charts only
6 hours.

## 7. Known engine limits (for the engine owner, not changed)

- The model type comes from the loop type only (LIC = integrating, everything else = first order).
- The controller tuning never reaches the engine, so Frequency and tuning advice are always empty.
- Servo steps on level loops never get a model.
- The trigger uses a fixed span of 100, not the loop's own range; the settle test (0.5 units) and the smallest PV
  move (0.5 units) are fixed units too.
- The closed-loop method for servo steps needs exactly evenly spaced samples. The plant historian's are 4–6 s
  apart, so no servo step gets a model there.
- Decay ratio is unreliable on noisy data.
- The validation prediction is computed on the previous event's times, and no prediction band is computed.
