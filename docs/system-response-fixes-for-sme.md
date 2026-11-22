# System Response: proposed engine fixes for SME approval

17 Nov 2026, updated 22 Nov 2026 with the owner's decisions on items 1 and 4. Seven gaps in the System Response
engine, each with the plant's own figures, our recommended fix and the points we need you to confirm. The figures come from read-only checks run on the plant on 17 Nov.
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
| 1 | Models come only from the controller's own output moves; real bump tests are missed | Owner, 22 Nov: Auto only. No capture in Manual; the Auto output moves stay; events are captured in AUT only (Cascade is the next phase) | **Decided**; AUT only built |
| 2 | Model type is chosen from the tag name, not the loop's declared process behaviour | Use the declared behaviour, and declare it for the loops where the tag name is wrong | Built; **needs your list of loops** |
| 3 | Step size and the settle test use fixed units, the same on a 0–2.5 loop and a 0–100,000 loop | Scale both with each loop's PV range | Built (defaults below) |
| 4 | Frequency analysis and tuning advice never run: no controller tuning reaches the engine | Owner, 22 Nov: P, I and D come over MQTT with PV, SP and OP; the engine reads them | **Decided**; engine work planned; **your decision** on λ |
| 5 | No setpoint step has ever got a model | Put the samples on an even time grid; add a method for integrating loops | Even grid built; integrating loops later |
| 6 | Three interruption rules are never applied (output at limit, PV out of region, tuning changed) | Apply them | Valve at limit built; region built, **needs regions set**; tuning changed comes with P, I and D (item 4) |
| 7 | Decay ratio is unreliable on noisy data; no prediction band on the model check | Stricter peak rule; add a 95 % prediction band | Built (defaults below) |

"Built" means the change is coded and tested on our side and goes to the plant with the next engine release. It is
not running at the plant yet.

## What we need from you

Items 1 and 4's data source were decided by the owner on 22 Nov (see those sections). Still open with you:

| # | Decision | Our recommendation | Section |
|---|---|---|---|
| 2 | Which loops other than level loops are integrating, and any level loop that is self-regulating | Your list; we declare them in the loop settings | 2 |
| 6 | Whether to set operating regions, and the values for the main loops | Set them on the main loops | 6 |
| 4 | How λ (closed-loop time constant for the tuning advice) is approved, and which loops are averaging | A rule (λ = dead time for tight loops, larger for averaging loops) with per-loop overrides; your list of averaging loops | 4 |
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
| Capture modes | AUT only. A loop leaving AUT (to CAS or MAN) during an event censors it | 1 |

## Controller tuning (questions for I&C)

Frequency analysis (gain margin, phase margin, Bode plot) and the "controller tuning changed" rule need each loop's
PID tuning. Owner decision, 22 Nov: the plant publishes each loop's P (proportional band, %), I (integral time, s)
and D (derivative time, s) on MQTT, in the same payload and with the same rules as PV, SP, OP and MODE. Nobody
enters tuning by hand, and no "Controller tuning" section is added to the loop settings.

Still to ask I&C:
- The exact MQTT field names (we expect P, I and D).
- Whether P, I and D are sent when they change or periodically.
- Which control algorithm the loops use: PID, PI-D or I-PD. Only the setpoint-response prediction and the tuning
  advice need this; the gain and phase margins do not, because the feedback path is the same in all three.

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
line fit this. The volume (about 600 models a day on the current loops) is more than anyone can review.

**Decision (owner, 22 Nov).**
- **Auto only, no Manual.** No bump-test capture in Manual, so nothing is built for it.
- **The Auto output moves stay.** They are the plant's only source of models today. Events keep their current name.
- **Capture in AUT only.** Cascade (CAS) no longer counts as Auto for System Response. A loop that leaves AUT for CAS
  while an event is open censors it ("Controller changed mode"), the same as AUT to MAN. The Overview "in auto mode"
  KPI still counts Cascade as automatic control; only System Response changes.
- **Cascade and master/slave analysis are the next phase**, with their own event type and pair analysis. Before it, a
  read-only plant check lists the loops that run mostly in CAS; those loops get no System Response events until then.

Built for the next engine release: the capture modes are a job setting, AUT by default, so adding Cascade later is a
setting change and a resubmit, not a new engine build.

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

**Decision (owner, 22 Nov).** P, I and D arrive over MQTT in the same payload and with the same rules as PV, SP, OP
and MODE. A retune is then picked up with its time, item 6's "tuning changed" rule comes with it, and nobody enters
tuning by hand.
- Ingestion already accepts P, I and D (no change needed if the gateway names them so).
- To build in the engine: read P, I and D; build the controller tuning from them (CENTUM: gain = 100 / proportional
  band, in % of span, scaled by the PV and output ranges; I and D in seconds); apply "tuning changed". Then the
  frequency analysis and the tuning advice run.
- To decide on our side: whether the historian keeps P, I and D, or a log of tuning changes is kept instead.
- **λ for the advice:** approved by the control engineer. No advice is shown without it.

**Please confirm.**
- How λ is approved: per loop, or a rule (for example λ = dead time for tight loops, larger for averaging loops),
  and which loops are averaging.
- The control algorithm in use (PID, PI-D or I-PD) comes from I&C (questions above). It changes the setpoint
  response, not the margins.

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
| Controller tuning changed | P, I or D changes during the event (needs P, I and D over MQTT, item 4) |

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
| Next engine release | 1 (capture in AUT only), 2, 3, 5a, 6 (valve at limit, PV left region), 7a, 7b | Built with the defaults above. Items 2 and 6 (region) take effect as behaviours and regions are declared |
| Next | 4, 6 (tuning changed) | P, I and D over MQTT; the engine reads them. Turns on frequency analysis; tuning advice also needs λ |
| Next phase | Cascade and master/slave analysis | Own event type and pair analysis; after a plant check of the loops that run mostly in CAS |
| Later | 5b | Setpoint-step models for integrating loops; method chosen by the engine owner |

Nothing changes in the page layout: the existing Response, Fit quality, Frequency and Models tabs fill in.

## Approval

| Decision | Approve / Change / Reject | Comments and values |
|---|---|---|
| 2. Integrating loops other than level loops; self-regulating level loops | | List: |
| 4. How λ is approved; averaging loops | | List: |
| 5b. Method for integrating setpoint steps (optional) | | |
| 6. Operating regions on the main loops | | Loops and values: |
| Defaults now built in (items 3, 6, 7) | | Changes: |

Reviewed by: ____________________ Date: ____________

---

<details>
<summary>For the development team: where each change lands</summary>

| # | Code |
|---|---|
| 1 | Built: `ResponseCapture` detects only when `ResponseJobConfig.capturesIn(mode)` (job argument `--response-capture-modes`, default `AUT`; part of the settings hash); leaving a capture mode censors `MODE_TRANSFER`. `CplmNormalizedSample.isAutoMode()` is unchanged (short features, authority, Overview KPI count CAS). Cascade phase: add `CAS` plus its own event type |
| 2 | `CplmResponseAnalysisJob.familyFor()` → `resolvedProfile.dynamicClass.integrating()`; plant registry has `dynamic_class` null on every active loop |
| 3 | `ResponseJobConfig`: `fallbackSpanEu`, `stableBandEu`, `minResponseEu`, `absSettlingBandEu`, `targetBandEu`, `noiseFloorEu`, `rampMinSlopeEuPerS` → fractions of the profile PV span; `ResponseCapture.settled()` (tail range ≤ `stableBandEu`), `detectorSettings()` / `supersedeOnChange()`; PV range from the registry `engineering` JSON (`pvMin`, `pvMax`) carried with the profile |
| 4 | Ingestion done (`LoopIngestConfig.DefaultParamRoles` P/I/D → p/i/d, `LoopJoiner` extra fields on `traverse.cpa.loop.samples.v1`). To build: `CplmNormalizedSample` p, i, d; `ControllerSnapshot` from them in `CplmResponseAnalysisJob` (today `unknown()`); `CONTEXT_CHANGED` on a tuning change. Historian `cpm_raw` has no p, i, d (add measurements or a Postgres tuning-change log) |
| 5 | 5a: `ClosedLoopPemEstimator.estimate()` rejects any `abs(Δt − ts) > 1e-6·ts` (`NON_UNIFORM_GRID`); resample the `EventDataset` first. 5b: `EstimatorRegistry` (`PEM_NOT_INSTALLED_FOR_INTEGRATING`) |
| 6 | censor reasons `ACTUATOR_CONSTRAINT` (on OP: no VP mapped at the plant), `REGION_EXIT` (profile `regionPvMin/Max`; no gate-config bundles at the plant), `CONTEXT_CHANGED` |
| 7 | `metrics/Overshoot.decayRatio()`; `prediction_interval` artifact (never produced); `validation/ModelValidator` Ljung-Box p ≤ 0.05 → `RESIDUALS_NOT_WHITE` note on VALIDATED |

</details>
