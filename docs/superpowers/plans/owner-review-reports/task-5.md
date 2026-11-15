# Task 5 (CHG-187): Evidence Workbench, gate results — report

Owner review 2026-11-14 items 9 and 11 (11.1, 11.2, 11.3), with the owner decisions of 2026-11-15 (Q4: "↗" links stay links;
Q5: no time display changes). Builds on CHG-183 (button standard, `ui-link`, cyan `ui/Dialog` with `subtitle`), CHG-184
(removals) and CHG-185/186 (`KpiCard` headed mode and plain tile with `tip`). Every visible text change is in
`docs/theme/redesign/text-changes.md` under `## CHG-187`. "Reconstruct evidence ↗" and "Evaluate a window" are untouched
(Task 6). Signal context is untouched except the shared foot strip. The G15 engine trace stays, closed.

## What changed, per file (all under `src/frontend-ob/src/`)

### Gate head (items 9, 11 header, 11.1)
- `components/Cpm/evidence/WorkbenchHead.tsx`: no caps tier eyebrow ("ELIGIBILITY" …); the gate list groups by tier already.
- `components/Cpm/evidence/retention.ts` (new, pure): `retentionLabel(readiness, basis, state)` → one label + tip lines:
  "Evidence kept" (info), "Evidence not kept" (unknown; the tip is the not-retained state's policy + "The verdict and every
  value of this run stand."), "Evidence arriving" (info), "Reconstruction failed" / "Reconstruction expired" (as before); null
  while unknown and for a rebuilt / reconstructed basis (the evidence-basis line names those).
- `components/Cpm/evidence/RunSummaryBar.tsx`: the label as a `ui/StatusBadge` (tone + glyph + word) with a `Toggletip` `?`;
  new `check` slot before Reconstruct. "PROOF RETAINED · COMPLETE" is gone.
- `components/Cpm/evidence/MeasuredCheck.tsx` (new): the head control. Gates with measured rows get the "Measured vs required"
  button (Secondary A) opening `ui/Dialog` (cyan head; subtitle "FIC10401 · G5 Oscillation (ACF)"; size wide). State-only gates
  show "State check" + `?` ("This gate reports a state, not a measured value against a threshold.") and no measured button.
  Nothing renders while the thresholds load.
- `components/Cpm/evidence/ExplainWhy.tsx`: refactored into `useWhy()` (the rows, open limits, G15 causes; same queries and
  rules as before) and the dialog body: a `ui/DataTable` Measure · Measured · Required · Pass / fail ("✓ Pass" success badge,
  "! Fail" warning badge, a detection row's position in words, "—" otherwise), then "Evidence behind it" (G15, with
  "Hypotheses ↗") and "What remains open" only when non-empty. No "Nothing open" line (spec: "or no section when empty").
  `requiredText()` drops the word "required" under the Required heading.
- `components/Cpm/evidence/whyRules.ts`: a detection row's position is its own field (`position`), so the table can put it in
  the result column. `investigation/gateProof.ts` re-joins it so Investigation's text is unchanged.
- `components/Cpm/evidence/EvidenceBasisBar.tsx`: renders nothing for retained proof without a reconstruction; beside a
  reconstruction it names only the reconstruction and the switch (the "Retained proof · The live engine's own arrays…" line went).

### Gate facts (11.2)
- `components/Cpm/evidence/VerdictCard.tsx`: rewritten. The sentence is gone; the gate's tiles are `KpiCard` headed plain tiles
  (title, value with unit, `?` tip; a word value at `cpm-kpicard__text` size, the app's rule); a limit on the claim is a small
  neutral `StatusBadge` flag. The unused full-card branch went (only the Workbench used VerdictCard, in `noHead` mode).
- `components/Cpm/evidence/verdictCopy.ts`: `limitFlags()` — the reason phrase capitalised ("Limited by the 5 s acquisition
  grid"), "No verdict recorded for this run" when there is no status; nothing when the state panel names the reason (not
  evaluated, disabled, short tier, method missing, loading). The Workspace also drops it when a "Reason" card exists (G14).
- `components/Cpm/evidence/views/headlines.ts`: every tile has a tip (`views/tileTips.ts`, new) and, when it is a stored
  calculation, its metric `field`. G5 period/regularity fall back to the run's own calculation (`acf_period_s`,
  `acf_regularity`) when no artifact is held; G8 is "Horch oddness" from `horch_oddness` (no method / bicoherence / capability
  tiles); G14 adds Reason; G15 adds Qualified support. Fixed: G6, G10, G11, G13 counted "0" peak bins / dwell / freeze / peers
  when no artifact was held (the old sentence said "Peers 0", "Dwell events 0" on not-retained runs).
- `components/Cpm/evidence/GateEvidenceWorkspace.tsx` (338 lines): wires the label, `MeasuredCheck`, flags and tiles; passes the
  tiles' fields to the Proof tab; the foot strip is one line "12 h window · … UTC · 8,307 of 8,624 samples · every 5 s" in its
  own class (`cpm-workbench__foot-facts`, nowrap with the full text as title; `.cpm-copy`'s 64ch cap made it wrap).

### Proof tab (11.1, 11.2)
- `components/Cpm/evidence/tabs/ProofTab.tsx`: `ui/DataTable` Measure · Value (unit beside the number, right-aligned; a count
  without "count"); each row's `?` holds the calculation's description and "Calculation CPLM-0xx". Rows a KPI card shows are
  left out. No `ExplainWhy` at the foot. For "Evidence not kept" the tab adds no note; when it would be empty it says "No inputs
  are stored for this gate, and its evidence was not kept." (no inputs at all) or "No charts for this run." (every input is a
  card above, e.g. G5 on a not-kept window) — the data-state rule: an empty state is stated. Its charts leave out
  "N points, drawn sampled" (`ChartSampleNote` context, new in `CpmChart.tsx`; default unchanged everywhere else).
- `tabs/proofRows.ts`: rows carry their metric `field`.
- `components/Cpm/evidence/GateResultState.tsx`: no pill for NOT_EVALUATED / DISABLED (the head's mark said it; the panel title
  says it again in words).

### Gate views (11.2)
- All views: no `PanelHead` eyebrows ("G5", "G0 ROLE RIBBON", "PEER", …); lane and episode titles are sentence-case headings
  (`IntervalLane` gains `heading`, used only on the Proof tab — Signal context keeps its caps lanes; `TimelineTable` always a
  heading).
- `views/ShortViews.tsx` (G0–G4): rows that repeated a card removed (G1 selector/selected/tracking, G2 trigger threshold, G2r
  regime, G3 eligible duration/objective, G4 command variation/σ/baseline); their notes are the cards' tips. G0 title "PV" not
  "PV — PV".
- `views/LongViews.tsx` (G5–G11): G5 pill removed, caption `g5SignalCaption()` "Signal with its linear trend and mean removed,
  and its zero crossings", axis `G5_SIGNAL_AXIS` "Deviation (EU)", legends "Signal", "Zero crossings", "Autocorrelation", "Pairs
  per lag", x axis "Lag"; "Regularity method" without its `_V1`. G6 Δf out of the pill, ordinate row removed. G7, G9, G10 pills
  removed. G8: no pill, legends `G8_LEGEND` (below), no sentence, no bicoherence row. G11 quantisation row removed.
- `views/G15Decision.tsx` (new, split from FusionViews): decision rows removed (they are the cards); "Hypotheses ?" (score note
  and score semantics in the tip) over a `DataTable` Rank · Hypothesis · Status (`StatusBadge`; colour only on the leading one:
  info, warning if confirmed) · Score · From (symptoms in words); "Symptoms observed" and "Which gate supplied each symptom" as
  `DataTable`s; the engine trace kept, closed.
- `views/FusionViews.tsx`: G14 panel "Confirmation evidence" keeps Source validity, Confirmed at, the evidence table and Step test
  / review record (State, Claim, Reason, Scope, Non-following dwell are cards). Re-exports G15.
- `views/G13Interaction.tsx`: no state pill (card), no method row, no relationship revision, "Reason" in words; section
  headings with `?` tips; the not-analysed state says "This run holds only whether peer links are configured (…), not the
  aligned peer analysis." (no capability code, no "legacy" or "long tier" wording).

### Rules & parameters (11.3)
- `tabs/RulesTab.tsx`: `PanelHead` sentence-case headings; Method is a row of "What this gate asks" (its own section held one
  row named "Method" again); Role via `codeLabel` ("Blocking"); profile via `codeLabel` ("Flow, fast self-regulating"; an
  unknown code is humanised, never caps-mono); the pinned paragraph is the label "Pinned to the run's settings" + `?` in the
  Parameters head.
- `tabs/rulesText.ts` (new): `plainNeeds(gate, served)` — 17 plain rewrites, each applied only when the service sends exactly
  the text it was written from (so an engine change shows as served, never a stale rewrite).

### Layout (item 9)
- `styles/cpm-workbench.css`: the rail column is `minmax(180px, max-content)` and gate names `nowrap` (+ ellipsis guard): "G14
  Final-element confirmation" is one line. Window dropdown on compact pages (Workbench, Investigation, Replay — the shared
  `EvidenceWindowSelect`): `width: auto` (as wide as its longest option) instead of `max-width: 250px`; the compact band's
  column gap 12 → 8 px so the band still holds one line at 1440 (measured: content 1140 px; with the full label and 12 px gaps
  it overflowed by 2 px and "Investigation ↗" wrapped). Foot strip `nowrap`, wrapping below 1280 px. Gate head: when it wraps,
  the actions stay right-aligned. New classes for the label, the check, the flags, the dialog sections, the pinned label, the
  hypothesis table.
- `components/Cpm/evidence/format.ts`: "limit_dwell_warn_s" reads "Limit dwell attention" (was "Limit dwell warn s").
- `components/Cpm/vocabulary.ts`: "psd" added to the acronyms (G6 card read "Psd").

## Decisions
1. **State-only gate with open limits**: the spec gives such a gate no button, but "What remains open" must not be dropped.
   It shows "State check" and a "What remains open" button opening the same dialog (no table). Lab: G12, G13, G14.
2. **G14 note dropped**: "Evidence scores rank the explanations; they are not probabilities." was pushed into G14's open list on
   every run, though G14 shows no score; it is not a limit and is gone.
3. **G8 legend names**: `phi_positive` → "At positive lag", `phi_negative` → "At negative lag" (the PV–OP cross-correlation
   at +τ and at −τ, both drawn over |τ|); `odd_contribution` / `even_contribution` → "Odd part" / "Even part". Chart titles
   "PV–OP cross-correlation at positive and negative lag", "Odd and even parts".
4. **G5 axis**: "Deviation (EU)" (the detrended, mean-removed signal). Caption built from the preprocessing steps.
5. **"N points, drawn sampled"**: removed on all Proof-tab charts (the foot strip gives the window's samples; the CSV note is
   moot), kept everywhere else (Signal context, System Response) via a context default.
6. **Tones**: "Evidence kept" / "arriving" info, "not kept" unknown (Traverse: available vs unavailable; no green). Pass =
   success, Fail = warning (a requirement not met is incomplete evidence, not an alarm). Limit flags neutral.
7. **Tile tips** are new text drawn from the notes the views already printed and the calculation catalogue; all in
   `views/tileTips.ts`.
8. **Window dropdown**: widened (to content) rather than shortened, plus the 4 px gap trim to keep the band on one line.

## Each gate on lab data (FIC10401, 12h window ending 6 Nov 20:00, retained proof for G5, G6, G8, G10, G14, G15)

Before = today's build on the same window; after = this change. Header for every gate: no caps tier eyebrow; the retention
label replaces "PROOF RETAINED · COMPLETE" / the "Evidence not retained…" note; the foot strip is one line.

| Gate | Showed | Shows now |
|---|---|---|
| G0 Data quality | Input/Value/Unit table (completeness 0.96 ratio, count 8307); "Evidence not retained for this run ? The verdict…"; MEASURED VS REQUIRED "This gate reports a state…"; WHAT REMAINS OPEN "Nothing this window flags…" | head "– Evidence not kept ?", "State check ?"; Measure/Value table "Sample completeness ? 0.96 ratio", "Sample count ? 8307" |
| G1 Mode / service | table (automatic-mode fraction); the same three sentences | head label + "State check"; table only |
| G2 SP activity | no table; the three sentences | head label + "State check"; "No inputs are stored for this gate, and its evidence was not kept." |
| G2r Operating region | as G2 | as G2 |
| G3 Base performance | 5-row table; not-retained note; MEASURED VS REQUIRED "Time within the error band 100.0 %"; "Nothing…" | head label + "Measured vs required" (dialog: Time within the error band · 100.0 % · — · —); 5-row table |
| G4 Actuator effort | 3-row table; note; "Actuator activity … 60.26 — above the high level / attention at 3 · high at 8" | head + button (dialog: 61.77 · attention at 3 · high at 8 · Above the high level); table |
| G5 Oscillation (ACF) | "Retained proof · The live engine's…"; sentence "…ACF period 280.5 s, regularity 1.00, accepted cycles 71; limited by the 5 s acquisition grid."; tiles; table period + regularity; chart pill "period 280.5 s · regularity 1.00"; caption "preprocessed signal (LINEAR_DETREND · SUBTRACT_MEAN)…"; "8,379 points, drawn sampled"; "Accepted cycles / regularity method 71 / ACF_PEAK_REGULARITY_V1 — …"; MEASURED VS REQUIRED 4 rows | "i Evidence kept ?", "Measured vs required" (dialog: Accepted cycles 71 ≥ 5 ✓ Pass; Regularity 1 ≥ 0.1 ✓ Pass; Oscillation period 4.7 min 10 s – 15 min resolvable ✓ Pass; Sampling … ≥ 8 samples per period ! Fail); flag "· Limited by the 5 s acquisition grid"; cards ACF period 280.5 s ?, Regularity 1.00 ?, Accepted cycles 71 ?; no table (both rows are cards); "Signal with its linear trend and mean removed, and its zero crossings", axis "Deviation (EU)"; "Regularity method ACF peak regularity" |
| G6 Spectral (PSD) | sentence "…Peak bins 0; limited by…" (0 from no artifact on the 22:45 window); tiles; pill "HANN · fft 1024 · Δf … Hz"; ordinate row | flag; cards Ordinate PSD, Frequency resolution, Peak bins, Noise reference; table (harmonic ratios); pill "HANN · fft 1024"; dialog Spectral peak vs background 105× ≥ 3× ✓ Pass |
| G7 Stiction shape | table (triangularity); note; MEASURED rows | head label + button (Valid cycles 148 ≥ 5 Pass; Triangular OP waveform 0.39 · high at 0.8 · Below the attention level); table |
| G8 Lag asymmetry | sentence with "bicoherence Not installed, capability reason bispectral estimator not installed in this build"; tiles METHOD / BICOHERENCE / CAPABILITY REASON; table Horch oddness 0.5201; pill XCORR_ASYMMETRY_V1; "phi_positive / phi_negative"; odd-harmonic sentence; bicoherence row; "This gate reports a state" | "i Evidence kept ?", "State check ?"; one card "Horch oddness 0.52 score ?" (the odd-harmonic note in its tip); no table; charts with "At positive lag" / "At negative lag", "Odd part" / "Even part"; no pill, no build wording |
| G9 Phase geometry | table (corner score); note; state sentence | head label + "State check"; table |
| G10 Actuator limits | sentence "…Dwell events 0"; tiles; pill "limit source: …"; caps lanes; MEASURED 2 rows; WHAT REMAINS OPEN VP not mapped | "Evidence kept", button (Time at an output limit 0 ms · No threshold configured; Saturated samples 0.0 %; then What remains open: VP not mapped); cards Limit source, Dwell events, Limit dwell attention; headings "Active limits", "Dwell episodes" |
| G11 Measurement health | sentence "…Freeze events 0" (no artifact); note; PV freeze row; open: health not configured | head label + button (PV freeze 0 ms; What remains open: instrument health not configured); "No inputs are stored…" |
| G12 System response | sentence "…limited by the 5 s acquisition grid"; state panel with pill; "This gate reports a state"; open: no step test | head label + "State check" + "What remains open" (No approved step test …); state panel without the repeated pill; Reconstruct reason unchanged (Task 6) |
| G13 Interaction | sentence "…Peers 0; no peer links are configured."; pill + panel; open: no peer links | head label + "State check" + "What remains open"; panel "Not evaluated: the engine looked and declined / Reason: no peer links configured." (no pill). Analysed-record and not-analysed views are covered by tests (lab has no peers) |
| G14 Final-element confirmation | sentence "…State Not applicable, claim …, non-following dwell 0 s; the claim is not about the final element."; 4 tiles; panel with state pill + Claim/Scope/Reason/Source validity/Confirmed at/Non-following dwell rows; closing sentence; open list incl. the score note | "Evidence kept", "State check", "What remains open" (VP not mapped); cards State, Claim, Reason, Scope, Non-following dwell (no flag: the Reason card says it); "Confirmation evidence": Source validity, Confirmed at, evidence table, Step test / review record. On a not-kept window the flag "· The claim is not about the final element" |
| G15 Decision | "Retained proof" line; sentence "Possible cause …, case …, open condition …"; 4 tiles; panel pill "Evidence score (uncalibrated…)", rows Possible cause/Case/Open condition/Availability/Qualified support; HYPOTHESES one sentence each; OBSERVATIONS; WHY; closing sentence; engine trace; MEASURED + EVIDENCE BEHIND IT + WHAT REMAINS OPEN | "Evidence kept", "Measured vs required" (Evidence score 100 of 100; Agreeing windows 2 ≥ 3 to persist ! Fail; Evidence behind it + Hypotheses ↗; What remains open, 4 lines); 5 cards incl. Qualified support 11.6 h; "Hypotheses ?" table (1 Controller tuning Leading · i Qualified · 1.00 · Sustained oscillation …); "Symptoms observed"; "Which gate supplied each symptom"; engine trace closed |

Rules & parameters (G0): "What this gate asks" with Needs "Samples in the window, with each signal's quality read from its
source.", Role "Blocking", Method "Data qualification"; "Parameters used" with "Pinned to the run's settings ?" and "Thresholds:
Flow, fast self-regulating profile, as in force at 6 Nov 20:00 UTC." Signal context: unchanged but the foot strip.

## Screenshots (`docs/theme/redesign/evidence/chg187/`, untracked)
Day 1440: `proof-G0`, `proof-G5`, `proof-G8`, `proof-G13`, `proof-G15` (`-day-1440.png`), the dialog `proof-G5-dialog-day-1440.png`
(and G13, G15 dialogs), `rules-G0-rules-day-1440.png`, `signal-G5-signal-day-1440.png`. Night 1440: `night-G5-night-1440.png`,
`night-G15-night-1440.png` (+ their dialogs). 768: `narrow-G15-day-768.png`. Built with `npm run build`, captured on
http://localhost:4173 with a read-only route filter (GET plus the evidence batch POST and auth only; nothing blocked).

## What I could not do / notes
- The lab has no window with G13 peers; the G13 analysed record and the not-analysed state are checked by unit tests only.
- The workbench head now wraps its actions under the title at 1440 on most gates (the extra "Measured vs required" button and
  the wider rail); they stay right-aligned. On short titles (G8, G0) it is one line.
- Not touched, flagged for a later pass: the raw keys still printed on some charts and rows (G0–G4, G6, G7, G9–G11 chart
  legends such as `u_applied`, `d_sp_dt`, `delta_pv`; rows such as `supply_pressure / actuator_pressure NOT_MAPPED`, the G13
  peer state pill `PEER_UNOBSERVED`, the G7 table headings `cycle_id`, `sse_sine`). The spec named G5 and G8 for plain chart
  words; changing legends also changes the CSV column names.
- The "seen while reviewing" sample-count disagreement (8,307 of 8,624 here) is not addressed (not this task).
- `GateResultStatePanel`'s NOT_RETAINED branch is no longer reached from the Proof tab; left in place.
- `verdictSentence` is now used only by its tests (left; pure).

## Checks (from `src/frontend-ob`)
- `npx vitest run src/components/Cpm/evidence src/components/Cpm/investigation src/styles`: Test Files 57 passed (57), Tests 416 passed (416).
- `npx vitest run` (full): Test Files 329 passed (329), Tests 2704 passed (2704). No failure seen, none pre-existing.
- `npx tsc --noEmit -p tsconfig.json`: clean (exit 0).
- `npm run lint`: clean (`--max-warnings 0`).
- `npm run lint:theme`: "lint:theme phase 3: 639 live files, gates T1 … T13, matches 0".
- New tests: `evidence/retention.test.ts`, `styles/workbenchLayout.test.ts` (rail one line, dropdown to content, foot one line),
  `limitFlags` in `verdictCopy.test.ts`, the measured-vs-required / state-check / what-remains-open dialog in
  `ExplainWhy.test.tsx`, the head label and foot strip in `GateEvidenceWorkspace.test.tsx`, the label and `check` slot in
  `RunSummaryBar.test.tsx`, the DataTable, card dedupe and empty states in `tabs/ProofTab.test.tsx`, headings / role / profile /
  plain Needs / pinned label in `tabs/RulesTab.test.tsx`, G5 caption and axis, G8 legend, G13 wording, G14 cards and the G15
  table in `views/views.test.tsx`, tips / fields / G8 measure / no-0 in `views/headlines.test.ts`, retained-proof silence in
  `EvidenceBasisBar.test.tsx`, cards and flags in `VerdictCard.test.tsx`.
