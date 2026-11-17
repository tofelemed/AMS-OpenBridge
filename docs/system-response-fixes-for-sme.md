# System Response: proposed engine fixes for SME approval

17 Nov 2026. Seven gaps in the System Response engine, each with the plant's own figures, our recommended fix
and the points we need you to confirm. The figures come from read-only checks run on the plant on 17 Nov.
The plant's loop list changed on 16 Nov (old loops retired, the real loops added), so per-loop figures cover the
current loops in the 16 hours after that change, unless stated. The engine's current rules are described in
`system-response-concepts.md`.

Terms used: **FOPDT** = first order plus dead time (self-regulating process). **IPDT** = integrating plus dead time
(for example a level). **Event** = one captured step and the PV's response to it. **Censored** = the event was
interrupted before the PV settled, so it gets measurements but no model. **Bump test** = the operator puts the loop
in Manual and steps the output by hand. Modes as the DCS reports them: AUT (Auto), CAS (Cascade), MAN (Manual),
IMAN (initialization manual: the output follows another block).

## What the plant checks showed

- 3,499 events on 28 loops in 16 hours, every one an output move in Auto; no setpoint step and no ramp. 88 % were
  censored because the controller moved the output again before the PV settled.
- Accepted events do get models: of 414, 33 % Validated and 41 % Rejected (predicted worse than a flat line), the
  same pattern as all 23,443 accepted events stored since September (37 % and 45 %). No model has ever been reviewed.
- No setpoint step has ever got a model (44 accepted since September).
- 25 current loops were in Manual after the change, 24 of them at a fixed output (18 at 0 %). Over the last week
  only about 7 current loops had the output moved by hand in Manual.
- 28 current loops sat with the output at 0–1 % or 99–100 % practically the whole 16 hours.
- Three inputs the engine needs are not recorded at the plant: the declared process behaviour (item 2), the
  controller tuning (item 4) and the operating regions (item 6).

## Summary

| # | Gap | Recommended fix | Status (17 Nov) |
|---|---|---|---|
| 1 | Models come only from the controller's own output moves; real bump tests are missed | Also capture output steps made in Manual; label which kind of event each model came from | **Needs your decision** |
| 2 | Model type is chosen from the tag name, not the loop's declared process behaviour | Use the declared behaviour, and declare it for the loops where the tag name is wrong | Built; **needs your list of loops** |
| 3 | Step size and the settle test use fixed units, the same on a 0–2.5 loop and a 0–100,000 loop | Scale both with each loop's PV range | Built (defaults below) |
| 4 | Frequency analysis and tuning advice never run: no controller tuning reaches the engine | Read the PID tuning from the DCS (or enter it in the loop settings) | **Needs I&C** (tuning tags) and **your decision** on λ |
| 5 | No setpoint step has ever got a model | Put the samples on an even time grid; add a method for integrating loops | Even grid built; integrating loops later |
| 6 | Three interruption rules are never applied (output at limit, PV out of region, tuning changed) | Apply them | Valve at limit built; region built, **needs regions set**; tuning changed waits for the tuning tags |
| 7 | Decay ratio is unreliable on noisy data; no prediction band on the model check | Stricter peak rule; add a 95 % prediction band | Built (defaults below) |

"Built" means the change is coded and tested on our side and goes to the plant with the next engine release. It is
not running at the plant yet.

## What we need from you

| # | Decision | Our recommendation | Section |
|---|---|---|---|
| 1 | Capture bump tests made in Manual (this changes the design rule "capture only in Auto") | Yes, in MAN only (not IMAN) | 1 |
| 1 | Keep or stop the events from the controller's own output moves in Auto | Keep them for now, labelled "Output move (Auto)"; decide after a month of bump-test data | 1 |
| 2 | Which loops other than level loops are integrating, and any level loop that is self-regulating | Your list; we declare them in the loop settings | 2 |
| 6 | Whether to set operating regions, and the values for the main loops | Set them on the main loops | 6 |
| 4 | How λ (closed-loop time constant for the tuning advice) is approved | A rule (λ = dead time for tight loops, larger for averaging loops) with per-loop overrides | 4 |
| — | The defaults below | Confirm or give other values | Next table |

## Defaults now built in (please confirm or change)

| Setting | Default | Item |
|---|---|---|
| Setpoint step | At least 1 % of the PV range and 4 × the noise of the 2 minutes before | 3 |
| Ramp | At least 0.02 % of the PV range per second for 2 minutes | 3 |
| Settled | PV within 0.5 % of its range for 2 minutes, or within its normal noise band (measured before the first step) if that is wider | 3 |
| Smallest PV move for rise time and settling | 0.5 % of the PV range | 3 |
| Loops without a recorded PV range | Today's fixed values | 3 |
| Valve at its limit | Output (or valve position, where mapped) within 1 % of either end for 10 s or more during the event: the event is censored | 6 |
| PV left its operating region | Outside the region set for the loop for 10 s or more: the event is censored | 6 |
| Decay ratio | A second peak counts only after the PV crosses back through its final value; both peaks above 4 × the noise; otherwise "not applicable" | 7a |
| Prediction band | 95 %, from the parameter uncertainty (gain, time constant, dead time, baseline) and the fit's noise | 7b |
| "Residuals not white" | Stays a note on a Validated model, never a rejection | 7b |

## Tuning tags (question for I&C)

Frequency analysis (gain margin, phase margin, Bode plot) and the "controller tuning changed" rule need each loop's
PID tuning. The DCS is Yokogawa CENTUM; the gateway reads `FCS0101.<loop>.PV`, `.SV`, `.MV` and `.MODE` today.

- Can the OPC server read each PID block's P (proportional band, %), I (integral time, s) and D (derivative time, s)
  items, for example `FCS0101.PIC80105.P`, `.I` and `.D`?
- Which control algorithm do the loops use: PID, PI-D or I-PD?
- Are bump tests in Manual a planned practice on this plant, and how often?

If the tags can be read, the tuning comes from the DCS with its time, and nobody enters it by hand. If not, a
"Controller tuning" section is added to the loop settings instead.

---

## 1. Models come only from the controller's own moves; bump tests are missed

**Today.** Events are looked for only while the loop is in Auto (Cascade counts as Auto). An "input test" opens
each time the output steps while the setpoint holds; in Auto that is the controller correcting the process. When
the operator puts the loop in Manual and steps the output, the mode change censors any open event, and nothing is
looked for in Manual.

**At the plant.**

| | Current loops, 16 hours after the loop change |
|---|---|
| Events | 3,499 on 28 loops, all output moves in Auto; no setpoint steps, no ramps |
| Censored | 3,085 (88 %); 3,080 of them because the output moved again before the PV settled |
| Accepted | 414 (12 %) on 18 loops |
| Models from those 414 | Validated 137 (33 %) · Rejected 169 (41 %) · Candidate 87 (21 %) · no model 21 (5 %) |
| Since September, all loops | 23,443 accepted events: Validated 37 % · Rejected 45 % · Candidate 13 % · no model 5 % |
| Reviewed | No model ever (0 of 22,179) |
| In Manual since the change | 25 loops: 24 at a fixed output (18 at 0 %, 3 at 99–100 %, 3 in between), and PIC20317, moved by hand between 19 and 27 % |

**Why it matters.** A model fitted to the controller's own corrections is biased: the output is driven by the PV
through feedback, not independent of it. The 41–45 % of models that predict the previous event worse than a flat
line fit this. Bump tests in Manual give clean open-loop data, and today they are thrown away. The volume (about
600 models a day on the current loops) is more than anyone can review.

**Recommended fix.**
- Capture output steps made **in MAN** as input tests and fit them with the open-loop method. IMAN is excluded
  (the output follows another block, not the operator).
- The event is accepted when the PV settles while the loop is still in Manual. Returning to Auto before the PV
  settles censors it ("Controller changed mode").
- Step size as today: at least 1 % of output and 4 × the noise of the 2 minutes before, held 30 s.
- **Keep the Auto output moves for now**: today they give the plant's only validated models. The Events list names
  each one "Bump test (Manual)" or "Output move (Auto)" instead of "Input test", so a reviewer can prefer bump-test
  models.
- After about a month of bump-test data, compare the two kinds and decide whether to stop the Auto output moves.

**Alternative.** Stop creating events for Auto output moves now (our first proposal). Since the loop change every
event has been such a move, so the plant would have almost no events or models until bump tests come in.

**Manual use on the current loops.** Over the last 7 days, 7 current loops had the output moved by hand in Manual:
PIC20317 (6.3 days, 19–27 %), FIC20209 (1.7 days, 29–35 %), LIC20202 (3.5 h, 10–33 %), FIC10303B (51 min,
32–55 %), LIC30608 (41 min, 19–73 %), LIC20401 (34 min, 5–66 %) and FIC10301 (26 min, 25–36 %). In the 16 hours
after the change, only PIC20317.

A bump test needs at least about 5 minutes in Manual (2 minutes of calm data, then at least 3 minutes of response).
Bump-test capture would therefore add clean models on a handful of loops, not replace the Auto moves. Whether those
manual moves are clean steps or many small nudges, only the capture itself will show. Still to ask I&C: are bump
tests a planned practice?

**Please confirm.**
- Capture bump tests in Manual (this changes the design rule "capture only in Auto").
- Keep the Auto output moves, labelled, for now; or stop them.

## 2. Model type comes from the tag name

**Today.** The engine fits an IPDT model when the tag starts with "LIC" and an FOPDT model for every other loop.
The process behaviour declared for the loop in its settings (self-regulating, integrating, near-integrating,
integrating with lag…) is available to the engine but not used here.

**At the plant.** None of the 111 active loops has a declared behaviour (25 flow, 21 level, 30 pressure,
15 temperature, 20 of unknown type). The fix alone therefore changes nothing; it takes effect loop by loop as
behaviours are declared in the loop settings.

**Why it matters.** An integrating loop that is not a level loop (for example gas pressure on a closed vessel) gets
an FOPDT model; a level loop that is self-regulating gets an IPDT model. Either way the model and its parameters
are wrong for the process.

**Recommended fix.**
- Integrating, near-integrating and integrating with lag → IPDT.
- All other declared behaviours → FOPDT.
- No declaration → today's rule from the tag name.
- Declare the behaviour for the loops where the tag-name rule is wrong (the list comes from you).

**Please confirm.** The mapping above, and which loops other than level loops are integrating (and any level loop
that is self-regulating). A second-order model for underdamped processes is not proposed here.

## 3. Step size and the settle test use fixed units

**Today.** A setpoint step must be larger than 1.0 unit, 1 % of a span fixed at 100 for every loop (so again 1.0
unit), and 4 × the noise. A ramp must reach 0.02 units/s for 2 minutes. An event counts as settled when the PV
stays within 0.5 units for 2 minutes, and rise time and settling need the PV to move at least 0.5 units. "Units"
are the loop's engineering units, whatever its range.

**At the plant.** Every active loop has a PV range recorded, from 0–2.5 to 0–100,000.

| Loops | Range | Effect of the fixed units |
|---|---|---|
| 12 (11 pressure, 1 flow) | Span under 20, for example PIC10704 0–2.5, PIC00551 0–6 | The smallest setpoint step is 7–40 % of the range; "settled" lets the PV wander 4–20 % of the range |
| 13 flow | Span over 1,000, up to 100,000 | A 0.5-unit settle band is smaller than the noise, so an event can hardly ever settle |

Since September (old and current loop lists), 29 of the 23,443 accepted events are on flow loops, against 15,190
on pressure loops; mode explains part of that, as many flow loops sit in Manual at 0 %. Since the loop change no
setpoint step and no ramp has been seen, so the settle rule matters more than the trigger.

**Recommended fix.** Use each loop's PV range. The values below equal today's on a 0–100 range.

| Rule | Today | Proposed |
|---|---|---|
| Setpoint step | 1.0 unit and 4 × noise | 1 % of range and 4 × noise |
| Ramp | 0.02 units/s for 2 min | 0.02 % of range per second for 2 min |
| Settled | PV within 0.5 units for 2 min | PV within 0.5 % of range for 2 min, or within its normal noise band (measured before the step) if that is wider |
| Smallest PV move for rise time and settling | 0.5 units | 0.5 % of range |

The other fixed tolerances (settling band floor 0.1 units, target band ±0.5 units) scale the same way. Output steps
are unchanged (the output is already in %). Loops without a recorded range keep today's rule.

**Please confirm.** The percentages, and "or its normal noise band if wider" for the settle test.

## 4. Frequency analysis and tuning advice never run

**Today.** Gain margin, phase margin and the Bode plot need a validated model **and** the controller tuning. The
tuning advice (SIMC rule, never applied automatically) also needs an approved closed-loop time constant (λ). The
engine can use tuning in ideal and parallel form, but no tuning is stored anywhere, so both features are always
empty.

**At the plant.** The DCS is Yokogawa CENTUM (tags such as `FCS0101.PIC80105.PV`, `.SV`, `.MV`, `.MODE`). Only PV,
setpoint, output and mode are mapped, and no model has controller tuning (0 of 22,179). On CENTUM the PID block's
tuning is normally available as its P (proportional band, %), I (integral time, s) and D (derivative time, s)
items, for example `FCS0101.PIC80105.P`. I&C must confirm that the OPC server exposes them.

**Recommended fix.**
- **If I&C confirms the items:** read P, I and D from the DCS for each loop, as three more tags on the same
  gateway. A retune is then picked up with its time, item 6's "tuning changed" rule comes with it, and nobody has
  to enter tuning by hand.
- **Otherwise:** add a "Controller tuning" section to the loop settings (proportional band, integral time,
  derivative time, direct or reverse action, the date it applies from), and read it from the DCS later.
- The proportional band is converted to gain (100 / band), scaled by the PV and output ranges.
- **λ for the advice:** approved per loop by the control engineer. No advice is shown without it.

**Please confirm.**
- The PID form and control algorithm in use (PID, PI-D or I-PD). The algorithm changes the setpoint response, not
  the margins.
- How λ is approved: per loop, or a rule (for example λ = dead time for tight loops, larger for averaging loops).

## 5. No setpoint step has ever got a model

**Today.** Setpoint steps are identified with a closed-loop method (prediction error, with the setpoint as the
independent excitation). That method accepts only self-regulating models, and it needs the samples exactly evenly
spaced in time.

**At the plant.** 44 setpoint steps have been accepted since September, and none got a model:
- 33 on flow, pressure and temperature loops were refused because the samples are not evenly spaced. The historian
  gives a sample every 4–6 s (4.7 s on average), so the method can never run on plant data.
- 11 on level loops: there is no method for integrating loops.

Setpoint steps are rare (none on the current loops since the change), but they are the only events in Auto with an
independent excitation.

**Recommended fix.**
- **5a.** Put each event's samples on an even time grid (the event's typical spacing, values interpolated between
  samples) before the closed-loop method. A small change that needs no new data.
- **5b.** For integrating loops, apply the same method to the **rate of change of the PV** instead of the PV. The
  integrating process then behaves as a self-regulating one, and the gain of that model divided by the sample time
  is the integrating gain. Excitation must still come from the setpoint.

**Alternative for 5b.** The indirect method: identify the closed loop from setpoint to PV, then remove the known
controller. It needs the tuning from item 4, so it can only come later.

**Note.** Once behaviours are declared (item 2), more loops become integrating. Until 5b is in, those loops get no
model from setpoint steps.

**Please confirm.** Interpolation onto an even grid (5a), and the rate-of-change method (5b).

## 6. Three interruption rules are never applied

**Today.** These rules exist in the design but nothing triggers them, so an event can be accepted, and a model
fitted, from data that should not be used.

**At the plant.**
- No valve position is mapped for any loop, so the limit rule has to use the controller output.
- In the 16 hours after the loop change, 36 of the 77 current loops with data had the output at 0–1 % or 99–100 %.
  28 sat there practically the whole time: 21 parked in Manual, and 7 not in Manual with the output saturated (for
  example LIC10601, which produced 664 events in an earlier 3-day count, none accepted).
- 8 more spent 9–79 % of the time at a limit, among them four of the busiest event producers (PIC00551, TIC30603,
  PIC20120, TIC10704). On these loops the rule decides which events can be modelled.
- No loop has an operating region set, so the region rule does nothing until regions are set.

**Recommended fix.** Censor the event when:

| Rule (shown as) | When |
|---|---|
| Valve at its limit | The controller output (or the valve position, where mapped) is within 1 % of 0 % or 100 % for 10 s or more during the event |
| PV left its operating region | The PV leaves the operating region set for the loop (only loops with a region set) |
| Controller tuning changed | The tuning changes during the event (needs the DCS read from item 4) |

**Please confirm.** The 1 % / 10 s limit; censoring (no model) rather than keeping the event with a warning; and
whether operating regions should be set for the main loops.

## 7. Decay ratio and prediction band

**7a. Decay ratio.** Today a peak is any local maximum above the final value by more than the settling band. On a
noisy response, the wiggles on the first overshoot count as a second peak.
**At the plant:** 55 decay ratios stored. 37 are 1 or above (up to 2.97) and 12 are between 0.86 and 1. A ratio
above 1 means a growing oscillation, which cannot happen in a response that settled, so these come from noise.
**Fix:** a second peak counts only after the PV has crossed back through its final value (a full oscillation), and
both peaks must exceed 4 × the noise. Otherwise the decay ratio shows "not applicable".

**7b. Prediction band.** The model is checked by predicting the loop's previous accepted event, but no uncertainty
band is drawn, so a reviewer cannot see whether the miss is within what the model's own uncertainty allows.
**At the plant:** 8,417 of the 8,631 Validated models carry the note "residuals not white" (122 of 137 on the
current loops). On plant data the
prediction error nearly always contains slow disturbances, so we do not propose making that note a rejection rule.
**Fix:** draw a 95 % prediction band on the model check, from the parameter uncertainty already computed and the
fit's residual noise.

**Please confirm.** The peak rule; 95 % for the band; "residuals not white" stays a note.

---

## Proposed order

| Release | Items | Status |
|---|---|---|
| Next engine release | 2, 3, 5a, 6 (valve at limit, PV left region), 7a, 7b | Built with the defaults above. Items 2 and 6 (region) take effect as behaviours and regions are declared |
| After your decision | 1 | Needs your approval of the Manual rule and the I&C answer on bump tests; adds clean models on about 7 loops |
| After I&C confirms the tuning tags | 4, 6 (tuning changed) | Turns on frequency analysis; tuning advice also needs λ |
| Later | 5b | Setpoint-step models for integrating loops; method chosen by the engine owner |

Nothing changes in the page layout: the existing Response, Fit quality, Frequency and Models tabs fill in, and the
Events list shows the new event names from item 1.

## Approval

| Decision | Approve / Change / Reject | Comments and values |
|---|---|---|
| 1. Capture bump tests in Manual | | |
| 1. Keep the Auto output moves (labelled) for now | | |
| 2. Integrating loops other than level loops; self-regulating level loops | | List: |
| 4. How λ is approved | | |
| 5b. Method for integrating setpoint steps (optional) | | |
| 6. Operating regions on the main loops | | Loops and values: |
| Defaults now built in (items 3, 6, 7) | | Changes: |

Reviewed by: ____________________ Date: ____________

---

<details>
<summary>For the development team: where each change lands</summary>

| # | Code |
|---|---|
| 1 | `cplm/response/ResponseCapture.java` (detection only when `auto && good`, `auto` = `CplmNormalizedSample.isAutoMode()`: CAS is auto, IMAN/ROUT manual; mode-transfer censor). MAN-only capture needs the raw mode token, not the boolean |
| 2 | `CplmResponseAnalysisJob.familyFor()` → `resolvedProfile.dynamicClass.integrating()`; plant registry has `dynamic_class` null on every active loop |
| 3 | `ResponseJobConfig`: `fallbackSpanEu`, `stableBandEu`, `minResponseEu`, `absSettlingBandEu`, `targetBandEu`, `noiseFloorEu`, `rampMinSlopeEuPerS` → fractions of the profile PV span; `ResponseCapture.settled()` (tail range ≤ `stableBandEu`), `detectorSettings()` / `supersedeOnChange()`; PV range from the registry `engineering` JSON (`pvMin`, `pvMax`) carried with the profile |
| 4 | `controller/ControllerSnapshot` (job passes `unknown()`); tag-map roles for P/I/D + ingest, or registry schema + cplm-api + Edit loop |
| 5 | 5a: `ClosedLoopPemEstimator.estimate()` rejects any `abs(Δt − ts) > 1e-6·ts` (`NON_UNIFORM_GRID`); resample the `EventDataset` first. 5b: `EstimatorRegistry` (`PEM_NOT_INSTALLED_FOR_INTEGRATING`) |
| 6 | censor reasons `ACTUATOR_CONSTRAINT` (on OP: no VP mapped at the plant), `REGION_EXIT` (profile `regionPvMin/Max`; no gate-config bundles at the plant), `CONTEXT_CHANGED` |
| 7 | `metrics/Overshoot.decayRatio()`; `prediction_interval` artifact (never produced); `validation/ModelValidator` Ljung-Box p ≤ 0.05 → `RESIDUALS_NOT_WHITE` note on VALIDATED |

</details>
