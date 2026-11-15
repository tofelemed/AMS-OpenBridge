# Owner review 2026-11-14 — production UI (v2.9.0 + redesign, plant data)

Working list only. Nothing is built until the owner has sent every point and says start.
Ships as the next release from `feat/cpa-redesign`. CHG numbers start at 183. Each item gets its
`changes_tracker.md` entry; `prod_decision.md` gets any setting that changes.
Every item is checked in day and night themes at 1440 / 1000 / 768 / 390 px.

## 0. Remove technical details users do not need (ids, versions, Flink, job names)

- [ ] Sweep every CPA page and dialog. List each id, version, Flink or job detail with its page.
      First hits: `config/BundlesView`, `config/DeploymentsTab`, `config/DeploymentStatus`,
      `config/DraftBundleDialog`, `evidence/RunSummaryBar`, `health/TransmitterHealthPanel`,
      `pipeline/VerificationCard`, `response/StepsDataTab`, `historical/SelectedWindowPanel` (Technical details).
- [ ] Show the owner the list before anything is removed (Q1).
- [ ] Remove the approved items. Keep any value another page or an export needs.

## 1. Loop Events: event detail

- [ ] Remove the "Record details" button (`events/EventDetail.tsx:95`).
- [ ] Remove `events/EventRecordDialog.tsx` if nothing else opens it. Check it holds nothing the detail panel lacks.

## 2. Dialogs get a designed header

- [ ] List every dialog type: `ui/Dialog.tsx` (52 users), `blocks/GateDialog`, plus any page-local overlays.
- [ ] Design one header: Traverse-token coloured band, title, optional subtitle (loop · gate), close button.
      Read the `traverse-design-system` skill first. Tokens only, no hex.
- [ ] Sample in day and night, owner approves it.
- [ ] Apply it in the shared components so every dialog changes together. Then fix any local overlays.

## 3. Performance: gate dialog (FIC10401 · G8)

Today the dialog says the window three times (Assessment, Window from, Window to) and the role twice
(Gate role SUPPORTING, Effect on the verdict). Every section has a small caps label and a heading. It has seven
navigation buttons.

- [ ] Remove the repeated window: one line, "12h window · 07:00–19:00 14 Nov", in plant time, not UTC.
- [ ] Remove the repeated role: keep "Effect on the verdict" and drop "Gate role".
- [ ] One heading per section; drop the caps labels (DIAGNOSTIC EVIDENCE, PURPOSE, FUSION BEHAVIOUR, OBSERVABILITY).
- [ ] Make it wider. Two columns: result on the left; purpose, effect and flags on the right.
- [ ] Group the actions: Prev / Next together, then open-in-page links, then the Review button.
- [ ] The body (`EvidenceBody` in `GateEvidencePanel.tsx`) is also used by Loop Explorer Summary
      (`SummaryGateDetail.tsx`). Both change together. Check both.
- [ ] Sample first, owner approves it.

## 4. Loop Explorer: Loop KPIs

- [ ] Use the Overview card layout (`cpm-kpicards` in `overview/OperatingPicture.tsx`): title at top, then value.
- [ ] Move the explanation ("|PV − SP| inside the good band · G3 pass") to a hover / focus tip.
      It must also work on touch and keyboard.
- [ ] Fix the layout: today it is three rows (Control performance 5, Actuator activity 3, Evidence quality 1). See Q2.
- [ ] Keep each card's drill-down (`LoopKpiDialog`).
- [ ] Files: `explorer/summary/LoopKpiCards.tsx` and its CSS.

## 5. Loop Explorer: PV / SP / OP / Mode readings

- [ ] More space between the four readings (`explorer/summary/SignalStrip.tsx`).
- [ ] State colour on each reading box, live values only. A stale or historian value shows no state colour, only
      its "last received" line.

**What the standards say (answer to "can we do that?").** ISA-101 and the High Performance HMI practice behind it
(ASM Consortium, EEMUA 201) reserve colour for abnormal conditions. A normal state is shown neutral (grey), not
green. If every healthy loop is green, the colour carries no news, and amber or red stands out less. Colour is
never the only cue: a word or icon goes with it, because about 1 in 12 men cannot tell red from green.

So yes, we can do it, in this form:

| Reading | Neutral (normal) | Caution (amber + word) | Data we already have |
|---|---|---|---|
| PV | within the good band of SP | outside the good band ("Off setpoint") | the good band G3 already uses: check it reaches the page |
| OP | inside the registered OP range | at a limit ("At limit") | registered OP range, as in "Time at an OP limit" |
| Mode | a normal mode for this loop | any other mode ("Manual", …) | the mode map that drives "Time in normal mode" |
| SP | always neutral | — | — |

- [ ] Red only if the plant gives us real alarm limits; the CPA is not the alarm system (Q3).
- [ ] The PV / SP / OP labels keep their signal colours (`--signal-*`). State colours come from status tokens.
- [ ] Confirm the good band, OP range and mode map reach the page. If not, a small cplm-api read.

## 6. Loop Explorer: History tab redesign

Today the columns are very far apart, "Loop Events ↗" repeats on every row and episode, and every row shows
UNACKNOWLEDGED in capitals. Episode lines repeat the parent's text ("1 × 24h window(s) · peak evidence score 50"),
and "12h/24h window(s)" reads badly.

- [ ] Sample first (owner rule): one compact list or table. Columns: Period · Finding · Episodes · Peak score · Review
      state · one action.
- [ ] Episodes open inline as sub-rows that show only what differs: period and score.
- [ ] One "Open in Loop Events" button per row, not per line.
- [ ] Review state as the normal status badge (sentence case), matching Loop Events.
- [ ] Use the same date format as the rest of the app, with the plant zone.
- [ ] Nothing is lost: every fact in today's tab is still there after the redesign.
- [ ] Files: `explorer/HistoryTab.tsx` (241 lines) and `historyQuery.ts`.

## 7. Buttons look like buttons (the full standard is item 17)

- [ ] Flat buttons (`ObcButton variant="flat"`, 217 uses) get a light tinted background from our palette,
      with hover, pressed and focus states. Set it once in shared CSS, not at each of the 217 places.
- [ ] The primary action (filled, e.g. "Review →") stays as it is. A dialog has one primary at most.
- [ ] Contrast check day and night (text ≥ 4.5:1 on the tint).
- [ ] Links that open another page ("Loop ↗", "Window Inspector ↗"): see Q4.

## 8. Investigation: all five tabs in the owner's design

Design: `owner-review-2026-11-14/08-result-tab-DESIGN.webp` and `08-windows-pager-DESIGN.webp`.

- [ ] **Result**, as in the design:
  - left: the verdict headline with its dot;
  - "Confirmed from" chips: a check, the reason, and the gate code (G5, G8, …);
  - a Cause card ("not confirmed" tag, ? tip) next to an Engine severity card;
  - right: three tiles, Good-error time (with bar), Persisting, Evidence score (with ? tip);
  - below: "What is still unconfirmed" with a count, as cards (title + one-line reason);
  - footer: "Next: Evidence →" as the primary button.
- [ ] Map every fact on today's Result tab to its place in the design. Any fact the design has no place for goes to the owner, not to the bin.
- [ ] Check "Persisting 3 days" has a source (episode open since). If not, say so before building.
- [ ] **Evidence**: the same cards, tiles and footer. The trend stays as it is.
- [ ] **Windows**: move ‹ Newer · 1–5 of 100+ · Older › to the top right, on the "Recent 12h windows" heading line (`investigation/WindowBrowser.tsx`).
- [ ] **Hypotheses** and **Review**: the same design language.
- [ ] Files: `investigation/` (InvestigationHero, WhyResult, heroFacts, keyFacts, NextChecksPanel, WindowsStep, WindowBrowser, HypothesisPanel, ReviewStep). Keep each under 400 lines.
- [ ] Sample first (Result + Evidence), owner approves it, then build all five.

## 9. Evidence Workbench: labels, not sentences

- [ ] Remove the run id and its copy button (`evidence/RunSummaryBar.tsx`, `CopyableId`). Identity & raw keeps the ids for now (item 0 sweep, Q1).
- [ ] Replace sentences with a short label and a ? tip for the detail:

  | Today | Becomes |
  |---|---|
  | "Evidence not retained for this run · The verdict and every value of this run stand." | label "Evidence not kept" + ? tip |
  | MEASURED VS REQUIRED · "This gate reports a state, not a measured value against a threshold." | label "State check" |
  | WHAT REMAINS OPEN · "Nothing this window flags limits this gate's claim." | label "Nothing open", or no section when empty |
  | footer "12 h window · 14 Nov 07:30 → 14 Nov 19:30 UTC · 8,641 of 10,725 samples at 4 s" | compact facts: window (plant time) · samples · rate |

- [ ] Window selector cuts its text ("…Oscillation confirme"). Make it wider or the label shorter.
- [ ] Gate list: "G14 Final-element confirmation" breaks onto two lines. One line, same as the others.
- [ ] Toolbar and header text buttons (Newest, Go to date, ‹ ›, Reconstruct evidence ↗, Evaluate a window) get the item 7 look.
- [ ] Use `09-workbench.webp` and the item 8 design for the look.

## 10. Evaluate a window (IMPORTANT)

Today: the panel opens inline with misaligned labels (LENGTH and ENDING AT on different lines) and a browser-format
date field ("mm/dd/yyyy --:-- --"). The range shows as ISO in UTC and the state as "FINISHED" in capitals, and you
have to click "Open the result" as text. Afterwards a three-sentence note explains the evaluation.

- [ ] **10.1 Form.** One tidy form, in a dialog with the item 2 header. Length as 12h / 24h segments, end time in
      plant time with "Now" as default. The window it will evaluate shown in plant time. Evaluate as the primary
      button.
- [ ] **10.2 Progress.** After Evaluate the dialog shows the run: Queued → Running (spinner, elapsed time) → Done.
      On Done it closes by itself, the page shows the evaluated window, and the form is closed.
      On failure or timeout it stays open with the reason and a Retry button.
- [ ] **10.3 Result note.** Replace the "Evaluated from the historian" note with one label on the window,
      "Re-evaluated". Its ? tip holds when, from the historian, and kept 3 days.
      Drop "3 artifact(s) rebuilt" (`evidence/evidenceBasis.ts`).
- [ ] "Reconstruct evidence" gets the same progress pattern: item 15.
- [ ] Check which states the status API gives (QUEUED / RUNNING / FINISHED / FAILED). Use only those; no fake percent.
- [ ] Files: `evidence/EvaluateWindow.tsx` (88 lines), `evidenceBasis.ts`, `ReconstructDialog.tsx`.

## 11. Evidence Workbench: gate results (Proof, Rules, Signal context, Identity)

Screens: `owner-review-2026-11-14/11-*.webp|png`. Files: `evidence/GateEvidenceWorkspace.tsx`, `gateFacts.ts` (tiles),
`views/headlines.ts` (the sentence), `views/ShortViews.tsx` (G0–G4), `views/LongViews.tsx` (G5–G11),
`views/G13Interaction.tsx`, `views/FusionViews.tsx` (G14, G15), `ExplainWhy.tsx`, `tabs/*`.

The same fact is shown three or four times. On G5 the period and regularity appear in the sentence, the tiles, the
Proof table and the chart pill. On G15 cause, case, open condition and availability appear in the sentence, the
tiles and the table. The header says "PROOF RETAINED · COMPLETE", and the line under it says "Retained proof · kept
by the retention policy" again.

- [ ] **Header:** one retention label ("Evidence kept" / "Evidence not kept", ? tip). No run id (item 9).

**11.1 Proof tab, G0–G4 table, and Measured vs required**
- [ ] Style the Proof table with the shared `ui/DataTable`: Measure · Value (unit beside the number, right-aligned).
      The metric code (CPLM-001) moves into the row's ? tip (my call, see item 0).
- [ ] Move MEASURED VS REQUIRED and WHAT REMAINS OPEN (`ExplainWhy.tsx`) off the bottom of every gate.
      Add a "Measured vs required" button in the gate header instead.
- [ ] The button opens a designed dialog (item 2 header) with a table: measure · measured · required · pass / fail,
      then "What remains open" when there is something.
- [ ] A gate that reports only a state has no button, just the "State check" label (item 9).

**11.2 Proof tab, G5 onwards (each gate has its own tiles and charts)**
- [ ] Remove the sentence above the tiles (`headlines.ts`) where the tiles say the same.
      A real limit ("limited by the 4 s acquisition grid") stays as a small flag.
- [ ] Tiles become proper KPI cards: title, value with unit, ? tip. Same card as item 4.
- [ ] Show each fact once: drop table rows and chart pills that repeat a tile.
- [ ] G8: replace the METHOD / BICOHERENCE "Not installed" / CAPABILITY REASON tiles with the actual measure
      (Horch oddness 0.81). Build and capability wording goes (item 0). Remove the chart pill `XCORR_ASYMMETRY_V1`.
      Plain legend names, not `phi_positive / phi_negative`.
- [ ] G5 chart: plain caption instead of "LINEAR_DETREND · SUBTRACT_MEAN"; plain axis name instead of `EU_centred`.
- [ ] G14 and G15: the decision as KPI cards. The hypotheses become a table: rank · hypothesis · status badge · score ·
      from which symptoms. Today each is one long sentence. Remove the repeated cause / case / condition rows.
- [ ] One heading per section, no caps labels (HYPOTHESES, OBSERVATIONS), as in item 3.
- [ ] Go through every gate G0–G15 with plant data; list what each shows today and what stays. Sample G5, G8 and G15
      first, then the owner approves them.

**11.3 Rules & parameters, Signal context, Identity & raw**
- [ ] Rules & parameters: list every row and mark keep or remove, and show the owner. Likely removals: the method version
      ("Data qualification v3.0.0"), Tier "fusion", "Role BLOCKING" in capitals, and the "pinned" paragraph.
      Rewrite "Needs" in plain words. Show the profile name, not `FLOW_FAST_SELF_REG`.
- [ ] Remove the CONFIGURATION section completely (bundle id, copy button, "Configuration used by this run ↗",
      `tabs/RulesTab.tsx:85`).
- [ ] Signal context: leave as is, except the bottom line ("12 h window · … UTC · 8,641 of 10,725 samples at 4 s"),
      which breaks onto two lines. One line, compact facts, plant time. This is the same footer as item 9.
- [ ] Remove the Identity & raw tab completely (`tabs/IdentityTab.tsx` and its tab entry). Old links that open
      `tab=identity` land on Proof.

## 12. Evidence Replay

Screens: `owner-review-2026-11-14/12-*`. Files: `CpmReplay.tsx` (267 lines), `replay/ReplayChart.tsx`,
`replay/WindowVerdictCard.tsx`, `replay/RerunCard.tsx`, `replay/PackageDialog.tsx`, `investigation/LoopNotes.tsx`.

- [ ] **Chart cut on the left:** the "PV / SP" axis name loses its first letter under the sidebar. The CHG-181 fix is
      in `trendOption.ts`; check whether `ReplayChart` uses it or has its own grid, and fix it there.
- [ ] **"unit not set":** drop it. With no unit the axis says just "PV / SP" (`pvAxisName` in `trendOption.ts`, so every
      trend changes). The plant registry has no PV unit for these loops; that is a data gap for the plant model.
- [ ] **Evidence check card:**
  - more space above and below each field;
  - the verdict line ("Stiction ruled out…") as a headline, not a box that looks like an input;
  - the gate selector, then result, reason, time in AUTO, metric values as even rows;
  - "Re-run this window" in our button style (item 7).
- [ ] **Loop notes become a button + dialog:**
  - on Replay, a "Loop notes (1)" button under the Evidence check card;
  - the dialog (item 2 header) holds the new-note form (text, outcome, attach to window, acknowledge episode) and the
    note list as tidy cards;
  - an existing note's episode and outcome are changed through an Edit action, not selects that are always open;
  - no "RECORD IT" caps label, and "1 note" rather than "1 note(s)".
- [ ] Other pages with notes: Investigation Review tab (`ReviewStep.tsx`) and Loop Events episode (`EpisodeActivity.tsx`,
      already a "Full history" dialog). Propose to the owner where the same button fits before changing them.
- [ ] **Evidence package (zip):** after the download, a success message: "Downloaded <file>.zip", plus any part
      that could not be read. Use the app's existing message style in the package dialog; no custom toast.
- [ ] **Cursor readout under the trend** (PV 785.73 · SP 800.00 · OP 27.81 · MODE AUT · Sample 8,639 / 8,639 ·
      2026-11-14 19:59:54 UTC):
  - styled as the Loop Explorer readings (item 5): value with unit;
  - Mode as "Auto", not "AUT";
  - "Sample 8,639 of 8,639";
  - time short and in plant time (Q5);
  - no monospace raw text.
- [ ] Footer ("12 h window · … UTC · 8,639 samples", "Original run · pinned", "Run details"): the same compact
      footer as items 9 and 11.

## 13. Window Inspector

Screen: `owner-review-2026-11-14/13-window-inspector-DESIGN.png`. That image is today's selected-window panel
(`windows/SelectedWindow.tsx`). Item 14 confirms it is the owner's reference design for detail panels:
- a title with its links top right;
- even label / value rows;
- a DETAILS grid of buttons that open dialogs;
- one full-width primary action.

Files: `CpmWindows.tsx`, `windows/*`.

- [ ] Bring the rest of the page (toolbar, window list) to the same look as that panel.
- [ ] The panel still has "Record details". Remove it, as on Loop Events (item 1)? See Q6.
- [ ] **"Same loop, every short granularity"** (`windows/CompareAcrossKinds.tsx`) sits at the very bottom, after a long
      scroll. Proposal: a "Compare window sizes" button in the page toolbar that opens it in a wide dialog. This
      matches the notes and measured-vs-required pattern, and nothing below the fold. Alternative: a second tab beside
      the window list (Q7).
- [ ] Times in plant time (Q5). Historical ↗ / Trend ↗ links get the item 7 look.

## 14. Calculations: selected calculation panel in the reference design

Screens: `14-calculation-panel.png` (today), `14-DESIGN-window-panel.png` (the design). Files: `calc/CalcPanel.tsx`,
`calc/CalcRecordDialog.tsx`.

- [ ] Title "Sample completeness" with its ? tip. The code CPLM-001 moves into the tip (item 0).
- [ ] Rows:
  - Value with its unit in one row ("1.00 ratio"), not two;
  - Gate "G0 · Data quality ✓ Pass";
  - Method as the formula only, with its explanation in a ? tip or a Method detail button.
- [ ] DETAILS grid of buttons, as in the design: Rules & parameters, Method. "Identity & raw ↗" goes (that tab goes,
      item 11). "Record details" goes or stays as Q6 decides.
- [ ] "Open G0 proof →" as the full-width primary button at the bottom, as "Inspect this window →".

## 15. Evidence Workbench: Reconstruct evidence

Screen: `15-reconstruct-dialog.png`. Files: `evidence/ReconstructDialog.tsx`, `evaluationState.ts`.

- [ ] Shorter dialog text: one line ("Rebuilds this gate's charts from its window. The kept proof is not changed.").
- [ ] Rows: Loop, Gate, Window (short, plant time). Remove the Run UUID row (item 0).
- [ ] Item 2 header; Reconstruct as the primary button, Cancel as secondary.
- [ ] After Reconstruct, the same progress as Evaluate (10.2): Running → Done, then it closes by itself and the
      rebuilt evidence shows. On failure it stays open with the reason and Retry.

## 16. Every dialog: review, reorder, trim

- [ ] Inventory every dialog: 57 files use `ui/Dialog`, `blocks/GateDialog` or `role="dialog"`. For each, note its page,
      what it shows, the repeated or extra text, and ids or versions (item 0).
- [ ] For each dialog, propose its new order and text to the owner (one table: dialog · today · after). Then apply
      the item 2 header, the item 17 buttons, and the reference look (item 13): label / value rows, sections without
      caps labels, one primary action.
- [ ] Dialogs already listed: Full history (Loop Events), gate dialog (3), Evaluate a window (10), Measured vs
      required (11.1), Loop notes (12), Evidence package (12), Compare window sizes (13), Reconstruct (15).

## 17. One button standard for the whole app (extends item 7)

Today: `ObcButton` flat 211, normal 51, raised 44, no variant 13, plus 303 plain `<button>` (many are cards, tabs and
rows, not actions). `ui/Button.tsx` already names the Traverse variants (primary, outline, ghost, destructive, accent)
but nothing uses it.

- [ ] Define the standard. Every action looks like a button:

  | Level | Look | Use |
  |---|---|---|
  | Primary | filled cyan | the one main action of a page part or dialog (Evaluate, Save note, Inspect this window) |
  | Secondary | light tint of our palette with a border | every other action (Cancel, Zoom area, Reset, Newest, Re-run) |
  | Destructive | red outline, filled when confirming | delete / retire / remove |
  | Link | text, underlined on hover | only inside a sentence; see Q4 for "↗" links |

- [ ] Hover, pressed, focus and disabled states for each level, day and night, contrast ≥ 4.5:1.
- [ ] Use `ui/Button` everywhere: move each `ObcButton` to its level, and turn plain `<button>` actions into `ui/Button`.
      Cards, tabs, chips and table rows stay as they are.
- [ ] Add the rule to the design notes so new screens follow it.
- [ ] Sample sheet of all levels and states first, then the owner approves it.

## Second batch (owner, 2026-11-15): items 18-19

Sent after CHG-183..192 were built. These are not started yet; they wait for the owner to say go, as the first batch did.
The Q1-Q7 decisions and the 15 Nov rulings (Secondary buttons, technical text removed) apply here too.

## 18. Sidebar and header

Screen: `18-header-sidebar.png`. Files: `ui/shell/ShellNav.tsx`, `ui/shell/shell.css`, `cpa/destinations.ts`.

- [ ] Sidebar: remove the "CPA" module name above the section headings.
- [ ] Section headings (Find problems, Check a loop, Understand the cause, Engineering, Set up, System) in bold.
- [ ] Order: Engineering comes before Set up.
- [ ] Header: the plant selector and the search are narrower, and the plant selector starts exactly at the
      sidebar's edge (220 px). "Traverse CPA" stays in the header above the sidebar.
- [ ] When the sidebar is the 64 px rail, and below 1024 px, the header still fits: the selector then follows the brand.

## 19. System Response page

Screens: `19-response-tab.png`, `19-steps-data.png`, `19-models-tab.png`. Files: `components/Cpm/response/`.

All tabs
- [ ] Remove the line at the bottom of every tab ("Input test · 13 Nov 07:20 → 13 Nov 07:24 UTC · OP → PV · run
      0e7f95f0"): `ResponseTabs.tsx` `foot`, `responseLabels.ts` `eventFoot`. The event selector at the top already
      names the event. "Next →" stays.
- [ ] Every button in the button standard (item 17 and the 15 Nov Secondary look): Next, Export CSV, Zoom area,
      Undo, Reset, Review.

Events tab (`EventsTab.tsx`, `ResponseSummary.tsx`)
- [ ] Redesign as the other redesigned pages: the three counts as KPI cards in the Overview style (each still opens
      what is behind it), the events table in the standard table look.

Response tab (`ResultCard.tsx`, `ResponseNotes.tsx`)
- [ ] Design the result row: the model and its state pill, then Process gain, Dead time and Time constant as value
      blocks, each with its ± on a quieter second line.
- [ ] "Reported quantities" as a designed table (Quantity · Value) instead of the loose three-column list.
- [ ] Charts and trends stay as they are.

Fit quality tab
- [ ] "Charts not kept": find why and fix it. The note shows when the server holds no charts for the chosen event.
      This event is accepted (eligible, candidate model), and since CHG-105 (in the plant build) accepted events
      keep their charts 30 days, so it should have them. Check on plant data: were the charts written for this
      event, is the event older than the v2.9.0 deploy, does the Response tab draw from another source. If an event
      truly has no charts, one plain line without the retention sentence (technical text rule).

Frequency tab (`BodePanel.tsx`)
- [ ] The margins table in the standard table look.

Steps & data tab (`StepsDataTab.tsx`): redesign
- [ ] The eight step cards A-H stay as cards: name, state pill, one plain reason line.
- [ ] "n outputs" opens a dialog (item 2 header, subtitle loop · step) with the outputs as label / value rows,
      instead of opening inside the card. Plain words, not codes (`path_id`, `OP_TO_PV`, `NOT_ASSESSED`,
      `u_applied_available`).
- [ ] Remove the Event panel (Window, Eligibility, Method, Run, Bundle, Purpose) from this tab.
- [ ] "All quantities" then takes the full width, in the standard table look. The Reported / All choice stays.
- [ ] Remove the "Method" column (Q8); the CSV export keeps it.

Models tab (`ModelHistory.tsx`): IMPORTANT
- [ ] The three trends (Process gain, Dead time, Time constant) one per row, full width, each with its own heading,
      legend and zoom buttons.
- [ ] The hover readout stays inside the chart and never hides under the sidebar. Check the other CPA charts for the
      same fault.
- [ ] Each "Export CSV" goes in its own chart's head. Today the three sit loose above the table columns.
- [ ] The models table in the standard table look: Candidate / Other group rows, Review as a button.
- [ ] Remove the "estimator" column (Q8); the CSV export keeps it.
- [ ] Review dialog (`ModelReviewDialog.tsx`), owner: "it should also be fixed". CHG-192 already gave it the dialog
      standard (not yet at the plant). Still to fix: the parameter rows show raw keys (`process_gain`, `dead_time`) →
      Process gain, Dead time, Time constant; remove the "Estimator / uncertainty" row (Q8); the state as its pill word.

## Seen while reviewing (not asked, check before release)

- [ ] Sample counts disagree for the same 12 h window: the Loop KPI card says "8641 of 8640 samples"
      (`04-loop-kpis.png`), the Workbench says "8,641 of 10,725 samples at 4 s" (`09-workbench.webp`).
      Find which expected count is right before either page is touched.

## Owner decisions (2026-11-15) — these override the items above

- Q1 **yes**: remove technical details on Pipeline Health and Administration too.
- Q2 **one grid**: the 9 Loop KPI cards in one grid, the group name as a small line on each card.
- Q3 **yes**: neutral when normal, amber + word when off-setpoint / at limit / not a normal mode; no green; red only with plant alarm limits.
- Q4 **no**: "↗" links stay links (link style: action colour, underlined), not buttons.
- Q5 **separate**: time zone is NOT in this batch (owner researching). Leave every time as it is today; ignore the "plant time" bullets above.
- Q6 **remove**: "Record details" goes everywhere (Loop Events, Window Inspector, Calculations, any other panel).
- Q7 **recommended**: "Compare window sizes" button + wide dialog.
- Buttons: **Secondary A** (neutral tint + border). Dialogs: **solid cyan header** (Look 1). Sample: `17-buttons-SAMPLE.png`.
- "start building": no further sample round; each phase is shown to the owner when it is built.

## Questions for the owner (answered above)

- **Q1 (item 0):** Pipeline Health and Administration are for engineers. Remove the technical details there too,
  or keep them inside a closed "Technical details" section on those two pages only?
- **Q2 (item 4):** Show the 9 KPI cards in one grid that wraps by screen width, with the group name as a small line
  on each card? Or keep the three group titles, with the cards flowing on one line where they fit?
- **Q3 (item 5):** Is neutral for normal and amber for off-setpoint, at-limit or wrong-mode right? No green, per
  ISA-101. Red only if the plant supplies alarm limits.
- **Q4 (item 7):** Should the "↗" links that open another page also get the button look, or stay as links?
- **Q5 (items 3, 9, 10, 11):** Several screens show UTC (gate dialog, Workbench footer, Evaluate form, chart axes).
  Should all times be plant time (Iran), as Loop Events already does?
- **Q6 (items 13, 14):** The Window Inspector panel is the reference design, and its DETAILS grid has a "Record details"
  button. Keep "Record details" in these panels (Window Inspector, Calculations), or remove it everywhere, as on Loop
  Events (item 1)?
- **Q7 (item 13):** "Every short granularity": open it from a "Compare window sizes" button as a dialog (my
  recommendation), or as a tab beside the window list?

## Questions for the owner (second batch)

- **Q8 (item 19):** The Steps & data "Method" column (HELD_INTERVAL_INTEGRALS_V1, THEIL_SEN) and the Models
  "estimator" column (OE_LM_DELAY_PROFILE) show engine method codes. Remove the column from the page, keeping it in
  the CSV export (my recommendation)? Or show a plain name for each method?
  **Answer (2026-11-15): remove them.**
