# CPA label register

One row per concept whose label a redesigned page chooses (DEC-002 RD10). The chosen label is the concept's primary-surface label in the lineage register. No definition text changes here.

| Concept | Labels in use today | Chosen | Page | Phase |
|---|---|---|---|---|
| M-078 | In auto mode; Time in normal mode; Automatic-mode fraction; In AUTO; Service factor | Time in normal mode | Loop | 5 |
| M-078 (fleet count) | In auto mode | In auto mode | Overview filters | 4 |
| Destination | Loop Events; Episodes | Episodes | Sidebar | 2 |
| Destination | Loop Explorer; Historical; Investigation; System Response | Loop | Sidebar | 2 |
| Destination | Evidence Workbench; Evidence Replay; Window Inspector; Calculations | Evidence | Sidebar | 2 |
| Destination | Loop Registry; Gate Configuration | Setup | Sidebar | 2 |
| Destination | Pipeline Health; Governance | System | Sidebar | 2 |
| Refused route | Not authorized; silent redirect | Not available for your role | Everywhere | 2 |
| Accessible name | None | Matrix view; Row filter; Bundle editor; Views | Performance, Setup | 3 |
| Accessible name | None | Opportunity ranking | Performance | 3 |
| Accessible name | None | Role description | Administration | 3 |
| Page | Loop events; Events | Episodes | Episodes | 4 |
| Current band | Severity pill | Severity now | Episodes | 4 |
| Highest band | Peak: X | Peak | Episodes | 4 |
| Newest result | Now: X; latest window | Current verdict | Episodes | 4 |
| Unreviewed | Not yet reviewed; unacked; Unacknowledged | Unacknowledged | Episodes | 4 |
| Expired shelf | Returned; Shelf expired · unreviewed | Shelf expired, unreviewed | Episodes | 4 |
| Condition | OPEN; CLOSED | Open; Closed | Episodes | 4 |
| Family | Oscillation; Sustained oscillation | Sustained oscillation | Episodes | 4 |
| Quick conditions | Conditions; Fast conditions | Fast conditions | Episodes | 4 |
| M-008 | In manual mode | In manual | Overview | 4 |
| M-080 | Good-error share; Good-error time; in band | Good-error share | Overview | 4 |
| M-019 | No fault, but out of mode or at limit | No fault, but limited (legend); full label as a filter | Overview | 4 |
| M-027 / M-026 | Priority queue; Loops requiring review | Needing review; Priority | Overview | 4 |
| Fleet coverage | Three separate cards | Data coverage | Overview | 4 |
| Good-error headline | Mean (old tile); median (SPEC) | Median value, mean in the note | Performance | 4 |
| Newest window | Newest fused window emitted | Newest evaluated window ending | Performance | 4 |
| View | Full G0–G15 matrix | Full gate matrix | Performance | 4 |
| Gate filter chip | Failing G1 | Held back by Mode / service · G1 | Performance | 4 |
| Evidence action | Open in workbench; Open fused evidence | Open evidence | Performance | 4 |
| Page group | Episodes; Loop; Evidence; Setup; System | Loop Events; Loop Explorer; Historical; Investigation; Evidence Workbench; Evidence Replay; Window Inspector; Calculations; System Response; Loop Registry; Gate Configuration; Pipeline Health; Administration; Governance | Sidebar | Reference |
| Check passed | OK | Pass | Every gate surface | Reference |
| Check passed, input missing | OK on available data | Pass on available data | Every gate surface | Reference |
| Symptom | Seen | Symptom seen | Every gate surface | Reference |
| Strong symptom | Strong | Strong symptom | Every gate surface | Reference |
| No verdict | Insufficient | Insufficient evidence | Every gate surface | Reference |
| State breakdown | Every monitored loop, one state each | Loop state breakdown | Overview | Reference |
| Recent loop events | Recent context; Event trail | Recent events | Overview | Reference |
| Median error | Median error (% of span) | Median error | Performance tiles | Reference |
| Periodic diagnosis | Loops with periodic diagnosis | Periodic diagnosis | Performance tiles | Reference |
| Performance key to the gate marks | How to read this | How to read | Performance gate summary | Reference |
| Tile drill-down | (new) | Show the loops | Performance tile dialog | Reference |
| Findings / Gate matrix toggle | Checks behind the result / Full G0–G15 matrix | Findings; Gate matrix | Performance list toolbar | Reference |
| Any result | (new) | Any result | Performance list toolbar | Reference |
| Sort | By evidence score / By control error | Sort: Evidence score, Tag, Result, Control error, Priority | Performance list toolbar | Reference |
| Gate dialog disclosure | (new) | More about this gate | Performance gate dialog | Reference |

| Episodes / Fast conditions toggle | (new) | Episodes · n open; Fast conditions · n open | Loop Events header | Reference |
| Severity dropdown | (new) | All severity, High, Medium, Low | Loop Events filter row | Reference |
| Review (column) | State | Review | Loop Events list | Reference |
| Activity & notes | History ›, Loop notes | Activity & notes, Full history ↗ | Loop Events detail | Reference |
| Next step to the Workbench | Evidence workbench ›, Open in Evidence Workbench › | Review evidence → (band), Evidence Workbench → (gate dialog) | Loop Explorer Summary | Reference |
| Loop model | Loop model, Context | Loop model & setup → | Loop Explorer Summary | Reference |
| Gate area | Gates, Evaluated window | Gate results | Loop Explorer Summary | Reference |
| Loop KPI area | How this loop performs | Loop KPIs | Loop Explorer Summary | Reference |
| Trend to Historical | Open in Historical › | Historical ↗ | Loop Explorer Summary | Reference |
| Long diagnostics metrics on Calculations | Calculations (Summary block), no label | Long-window metrics | Loop Explorer Calculations | Reference |
| Loop's peer links | Peer topology (G13), N loop link(s) | Loop links (G13 behind ?) | Loop Explorer Relationships | Reference |
| Trend link per signal | none | Show in trend ↗ | Loop Explorer Signals | Reference |
| Chart lanes | MODE, VERDICT | Mode, Result | Historical | 12 |
| M-078 (window KPI) | In AUTO; Time in normal mode | Time in normal mode | Historical selected window | 12 |
| Window list result | Verdict | Result | Historical | 12 |
| Window not stored | none (new state) | That window is not stored; Open the newest window / Replay the newest window | Investigation, Evidence Replay | 13 |
| Result of a window, where the strip keeps it in view | Final conclusion; Verdict | Result (Workbench keeps Verdict until its task) | Investigation | 14 |
| Severity on the result card | Severity | Engine severity | Investigation | 14 |
| Leading mechanism on the result card | Possible cause; Main reason | Cause, with "· not confirmed" until G14 confirms it | Investigation | 14 |
| Cause when no mechanism qualified | no mechanism qualified; No mechanism qualified | Not established (a finding); Not qualified (a window not judged) | Investigation | 14 |
| Engine recommendation | Next-best action; Engine recommendation | Next check | Investigation | 14 |
| Section under the result | Reasoning chain | Why this result | Investigation | 14 |
| Time at the output limit on G10 | Symptom seen | limit symptom (the card summary only; the gate itself keeps Symptom seen) | Investigation | 14 |
| Numeric evidence section | Key facts; Numeric evidence on this window | Numeric evidence | Investigation | 14 |
| Loop note section | Loop notes | Record your review (Replay keeps Loop notes until its task) | Investigation | 14 |
| Save button | Save note | Save review (Replay keeps Save note until its task) | Investigation | 14 |
| Trend zoom reset | Reset | Full window | Investigation | 14 |
| Values in a gate's proof | Measured vs required | Calculated values | Investigation | 14 |
| Judged window with no fault (NO_CALL, INSUFFICIENT_EVIDENCE), in `conditionOf` | Not evaluated yet; Not evaluated: not enough data; No fault identified | No fault identified | All pages | 14 fix |
| Exclusion other than mode, in `conditionOf` | Excluded: loop not in automatic | Excluded: {real reason} | All pages | 14 fix |
| Cause on a no-fault window | {mechanism} · not confirmed; Not qualified | None identified | Investigation | 14 fix |
| Case for a no-fault loop | Not evaluable | No fault identified | Investigation | 14 fix |
| Window heading on the result card | Latest evaluated window | Latest window | Investigation | 14 fix |
| Run fixed in the URL | Mode FIXED; Selection mode | Pinned run | Evidence Workbench | 15 |
| Arrays held for the run | Evidence NONE; No arrays held; Not retained; Evidence not retained | Proof retained (when held); "Evidence not retained for this run" (when not) | Evidence Workbench | 15 |
| Engine result of the window | Verdict; Diagnosis | Loop result | Evidence Workbench | 15 |
| Version of the calculation | Build commit; Source commit | Calc version | Evidence Workbench | 15 |
| Gate question, method, parameters, configuration | What this gate asks; Method; Parameters used; Configuration | Rules & parameters | Evidence Workbench | 16 |
| Window's result of the run's own artifacts | Evidence for G3; Why this result; Measured vs required | Proof | Evidence Workbench | 16 |
| Identity, flags and raw record of a run | Identity; Flags on this window | Identity & raw | Evidence Workbench | 16 |
| Samples a window would hold | Expected samples | "{n} samples nominal at {p} s" (the expected count is not served) | Evidence Workbench | 16 |
| Page title | Evidence replay; Evidence Replay | Evidence Replay | Evidence Replay | 17 |
| Gate dropdown | Gate | Evidence check | Evidence Replay | 17 |
| Export | Export package | Evidence package | Evidence Replay | 17 |
| Controller mode at the cursor | Mode; MODE | Mode | Evidence Replay | 17 |
| Window's AUTO share (G1 auto_pct) | Controller mode; In AUTO (%) | Time in AUTO | Evidence Replay verdict card | 17 |
| Re-run dialog confirm | Create run | Create run | Evidence Replay | 18 |
| Re-run comparison | Open the new run ↗ | Open the new run ↗ | Evidence Replay | 18 |
| Package download | Download package | Download package | Evidence Replay | 18 |
| Run details | Run details ↗ | Run details | Evidence Replay | 18 |
| Window count check | Completeness; Actual samples; % full; UNKNOWN | Count check (Matches, +n sample) | Window Inspector | 19 |
| Expected samples | Expected samples; Nominal | Nominal | Window Inspector | 19 |
| Window flags | Gate tick string | Feature flags | Window Inspector | 19 |
| Window created_at | emitted | Stored | Window Inspector | 19 |
| Window list walk | Newer window / Older window; Previous / Next | Newer / Older | Window Inspector | 19 |
| Window sample coverage | Sample density | Sample density | Window Inspector | 19 |
| Calculation category | All types; Calculation; Decision | Category: All, Control error, Actuator, Data & mode, Oscillation, Decision | Calculations | 20 |
| Not measured | Not measured; N/A | Not calculated (the availability word when the engine says why) | Calculations | 20 |
| Calculation list count | {n} result(s) | {n} shown / 19 available | Calculations | 20 |
| Response counts | Response events (n); Events | Response events; Accepted events; System model (tiles). "n+" past one page | System Response | 21 |
| Event qualification words | Candidate censored; Ineligible; Rejected | Accepted / Rejected / Ineligible / Censored, in Event states explained | System Response | 21 |
| Model groups | Models by state | Candidate; Validated; Baseline; Other (rejected, expired, superseded) | System Response | 21 |
| Calculation and profile versions | Calc version (build hash) | "Calculation v{x} · profile v{y}" | Evidence Workbench run bar | CHG-145 s3 |
| Verdict card check row | Selected check | Check result | Evidence Replay | CHG-145 s3 |
| Samples a window would hold | {n} samples nominal at {p} s | Nominal {n} samples at {p} s | Evidence Workbench | CHG-145 s3 |
| Registry list heading | Registered assets; control-loop records | Loop assets, "{n} loops" | Loop Registry | 23 |
| Retired loop | Inactive | Retired (pill; hidden unless Show retired) | Loop Registry | 23 |
| Configuration limits counts | Valve position expected but not mapped; Peer links expected but missing | "{n} valve positions expected but not mapped"; "{n} peer links expected but missing" | Loop Registry | 23 |
| Retire a loop | Delete; Inactive | Retire (Restore to undo); state "Loop retired" | Loop Detail | 24 |
| Loop configuration entry | Edit loop | Edit configuration | Loop Detail | 24 |
| VP applicability | None on this loop; Expected but not mapped | Applicable · mapped; Expected · not mapped; Not installed; Not applicable | Loop Detail | 24 |
| Gate configuration page | Gate configuration; Set up · Gate configuration | Gate Configuration (eyebrow Set up) | Gate Configuration | 25 |
| Effective values | Layer stack; from | Where each value comes from; Source | Gate Configuration | 25 |
| New bundle | New draft; New version | Prepare bundle draft | Gate Configuration | 25 |
| Trend loop control | Loop; Choose a loop | Choose a loop (empty), the loop id and name (chosen) | Trend | 26 |
| Pipeline Health jobs | Observed jobs; State; Checkpoint age; OK / failed; Not exposed | Observed jobs | Pipeline Health | 27 |
| Pipeline Health verification | Run end-to-end verification; Start verification; Analysis run | End-to-end verification | Pipeline Health | 27 |
| Administration tabs | User Management; Roles & Permissions; Data Sources; Plant Model; Tag Aliases; Audit Log; System Settings | Users; Roles & permissions; Data sources; Plant model; Tag aliases; Audit log; System settings | Administration | 28 |
| Setting with no source | illustrative default values | Not connected | System settings | 28 |
| Save on System settings | Save unavailable | Save settings (disabled, reason on screen) | System settings | 28 |
| Loops with a readiness gap | Degraded (row pill) | "{n} degraded" count and filter | Loop Registry | CHG-149 |
| Trend mode with pens and stale samples | LIVE | NO NEW SAMPLES | Trend | CHG-149 |
| Audit event columns | Timestamp, Event type, User, Entity, Hash signature, Correlation | When / actor, Action, Entity | Governance | CHG-152 |
| Governance verify action | Verify cryptographic chain | Verify audit chain | Governance | CHG-152 |
| Audit event before and after | none | Before and after values: Not available | Audit event dialog | CHG-152 |
| Page title | Pipeline health; System response; Operations overview; Loop events; Loop explorer | The sidebar label: Pipeline Health; System Response; Overview; Loop Events; Loop Explorer | Five pages | CHG-152 |
