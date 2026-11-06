# CPA structure, flow and navigation: analysis and plan

Date: 2026-11-06. Status: **approved by the owner 2026-11-06, with the recommendations in section 12.**
Branch: `feat/cpa-redesign`, worktree `AMS-open-redesign`. Build recipe: `docs/superpowers/plans/2026-11-06-cpa-reference-redesign.md` (30 tasks), changed as section 9 says.

## 1. Result in short

- The reference is a guide for **structure, flow, navigation and where information sits**. It is not a guide for look. Colours, icons, fonts, sizes, cards, trends and filters stay ours.
- Today 24 screens sit behind 8 sidebar entries (Loop 7 tabs, Evidence 4, Setup 5, System 5). The target is **17 pages under 6 headings**, each on the address the plant already uses.
- The reference follows five placement rules (section 4). Applying them to our pages removes most of the congestion without changing any size.
- Most of the earlier 30-task plan still fits. Six tasks went further than this brief and are cut back (section 9).
- The owner's three decisions are in section 12.

## 2. What was inspected

| Source | How | Coverage |
|---|---|---|
| Reference package | Read `START_HERE`, the brief, the manifest; hash matches the earlier plan (`c79911b6...`) | All files |
| Reference HTML | Opened in a browser, every distinct control clicked and recorded as page, dialog or in-place | 17 pages, their sub-tabs, Gate matrix, gate dialog |
| Reference code | Host navigation and the proof link read from source | Context model, Open Gn proof |
| Live app, `localhost:3000` | Read-only walk with writes blocked (0 write attempts). `admin` for the main pages, `superadmin` for Setup and System | 26 screens at 1440 px, full-page images |
| Our code | Routes, sidebar, redirects, window lists, re-run, file sizes | Files named below |

Running build: commit `7e5caf19`.

**Limits.**
- The lab engine is down (section 6, item 7), so every loop is Stale (165) or Never evaluated (76). Real findings, the priority queue and a current verdict could not be seen live. Those pages were judged from code, stored windows and the empty states shown.
- Walked at 1440 px in Day only. Other widths and Night are covered in section 11.

## 3. Structure: today and target

| Heading | Page | Address | Today it is |
|---|---|---|---|
| Find problems | Overview | `/cpm` | Same |
| | Performance | `/cpm/performance` | Same |
| | Loop Events | `/cpm/events` | Sidebar "Episodes" |
| Check a loop | Loop Explorer | `/cpm/explorer` | Loop > Summary, Signals, History, Calculations |
| | Historical | `/cpm/historical` | Loop > Historical |
| Understand the cause | Investigation | `/cpm/investigation` | Loop > Diagnosis |
| | Evidence Workbench | `/cpm/evidence` | Evidence > Gates |
| | Evidence Replay | `/cpm/replay` | Evidence > Replay |
| | Window Inspector | `/cpm/windows` | Evidence > Windows |
| | Calculations | `/cpm/calculations` | Evidence > Calculations |
| | System Response | `/cpm/response` | Loop > Model |
| Set up | Loop Registry | `/cpm/registry` | Setup > Loops |
| | Gate Configuration | `/cpm/config` | Setup > Configuration |
| Engineering | Trend | `/trend` | Same |
| System | Pipeline Health | `/cpm/pipeline` | System > Pipeline |
| | Administration | `/admin/*` | System > Users, Roles, Settings; Setup > Plant model, Data sources, Tag aliases |
| | Governance | `/cpm/governance` | System > Governance |

Tabs remain only where a page really has views of one thing: Explorer 5, Workbench 4, Gate Configuration 2, Administration 7.

The old pages still exist in the code behind redirects, so this is mostly switching them back on. The host pages `/cpm/loop`, `/cpm/setup`, `/cpm/system` were never at the plant; on the lab they become redirects to the pages above.

## 4. How the reference moves a user

The reference keeps one shared context: loop, window end, gate, range. A page reads it on opening and a link updates it, so the user never picks the loop again. Our app does the same through the address (`?loop=`, `window`, `kind`, `gate`, `site`, `area`, `unit`), because Back and shared links must work.

Five placement rules, confirmed by clicking:

| What the user is doing | Where it goes | Examples |
|---|---|---|
| Next step in the journey | `→` link or button to another page, carrying the context | Review X →, Review evidence →, Review this window →, Inspect this window → |
| A related look | `↗` link to a related page or dialog | Historical ↗, Window Inspector ↗, Calculation proof ↗ |
| Detail on one small item | Dialog with one or two onward buttons | Gate, KPI, calculation proof, job, audit event |
| Picking an item from a list | Right column on the same page | Episode, evaluated window, calculation, short window |
| Another view of the same thing | Toggle or sub-tab | Findings / Gate matrix, Episodes / Fast conditions, Workbench tabs |

Main journey:

```text
Overview / Performance / Loop Events
   -> Review -> Investigation -> Calculation proof (dialog) -> Evidence Workbench <-> Evidence Replay
   -> Back to Investigation -> Record your review
Loop Explorer -> Review evidence      -> Evidence Workbench
Historical    -> Review this window   -> Evidence Workbench
Calculations  -> Open Gn proof        -> Evidence Workbench (that gate)
Window Inspector -> Inspect this window -> Evidence Replay
```

Some reference dialogs are placeholders for a demo. In the real app these become real navigation: an event row opens Investigation at that window; a KPI card keeps our drill-down (your rule that every KPI shows its loops).

## 5. Page by page

Filters stay ours everywhere: Site, Area and Unit in the header, our loop control, dropdowns. Text removed goes to `text-changes.md` for the control engineer. Any explanation worth keeping moves behind our `?`.

### 1.1 Overview, keep the page, tidy it

| | |
|---|---|
| Keep | Title, 12h/24h, all KPI cards with their drill-downs, state bar, our priority queue, selected-loop preview |
| Remove | Eyebrows "Operating picture", "Priority queue", "Recent context", "Readiness"; "Click a segment to filter the loop list"; "updated ..." moves behind `?` |
| Move | Bottom row: **Top-priority finding** (left, whole card clickable) and **Recent events** (right). "Configuration limits" moves to Loop Registry |
| Dialog | Calculation basis |
| Links | Review X →, Top finding → Investigation; Event row → Investigation at that window; All events →; View all →; Configuration & coverage → Registry |

Today each recent event wraps onto four lines and the top-finding card stretches to fill the row. Both go.

### 1.2 Performance, one list with a toggle

| | |
|---|---|
| Keep | Four KPI tiles with drill-down, gate counts, every filter, search, paging, all 17 gates, evidence score, the two rankings |
| Remove | "Calculation pathway", "Gate status by loop", "Opportunity ranking", "Loops needing attention", "driven by", long tile sentences; "0 of 0 assessed..." moves into the tile dialog |
| Move | The "Opportunity ranking" list repeats the same loops, so its two orders join the sort dropdown. Gate bars become count tiles by tier; a click still filters |
| Toggle | **Findings / Gate matrix** at the head of the list, replacing the dropdown |
| Matrix | Gate codes only in the head, tier headings above, one mark per cell, one-line result link, selected-loop band above |
| Dialog | Gate click opens "LOOP · Gn": tier, gate name, Check status, Loop result, Assessment, reason. Previous and next stay. The right column is removed |
| Links | Review ↗ and result link → Investigation; dialog: Review X →, Window Inspector ↗ |

### 1.3 Loop Events (Episodes), close to the reference

| | |
|---|---|
| Keep | Our dropdown filters in one row, Acknowledge, Shelve, Unshelve, notes, history, paging, peak versus latest |
| Add | Severity dropdown, search by EVT number (small `cplm-api` addition) |
| Columns | Loop / peak diagnosis, Severity, Review, Opened. Three pills per row become one |
| Right column | EVT · details, tag, severity, peak, full-width Review X →, Condition / Availability / Review / Shelf, one strip (peak evidence, qualified support, windows), period, note and actions, Activity & notes, closed Technical details |
| Toggle | **Episodes / Fast conditions** in the header, so conditions stop sitting under the list |
| Remove | "What happened", "Episode", "Evidence", "Provenance", "Operator state", "Review and shelf", "Loop notes" and the repeated family sentence |
| Links | Review X → Investigation at the episode window; Episode period ↗ → Historical; dialogs Shelve, Full history; Fast condition: Review, Window Inspector ↗ |

### 2.1 Loop Explorer

Order: heading, loop band, tabs, content. Tabs: Summary, Signals, Calculations, Relationships, History.

**Summary**

| | |
|---|---|
| Keep | Our trend exactly: same chart, same height, same controls. It gains width because the side column goes. Nine KPIs. All 17 gates |
| Remove | The Loop Context column; "Operating state", "from historian", "closed loop · analysed", "Not an evaluated window", "How this loop performs", "Long and short windows", "PRESET" |
| Move | Loop context into a dialog from **Loop model & setup →**. The result and Review evidence → stay in the loop band, Summary only. Age and blocking count stay visible there |
| One row | PV, SP, OP, Mode and signal quality as small cards in one row above the trend. This is the one size change, and you asked for it |
| Order | Trend, then Loop KPIs, then Gate results |
| Dialog | KPI card: meaning and Inspect Gn →. Gate tile: Evidence Workbench →, Window Inspector ↗ |
| Links | Review evidence →, Historical ↗, All calculations → |

**Other tabs**

| Tab | Change |
|---|---|
| Signals | Table of signal, value, unit, Show in trend ↗; Signal bindings → Registry; UNS path stays as a second line |
| Calculations | Gate table with Inspect → (gate dialog), Short windows ↗, long metrics move here from Summary. Same gate words as Summary |
| Relationships | Own tab with a count, taken out of Signals, as the reference has it |
| History | Episodes with period, finding, windows, peak and state; Open Historical →, rows link to Historical and Loop Events |

### 2.2 Historical, its own page

| | |
|---|---|
| Keep | Every current filter unchanged: range, dates, Now, Export, pens, Normalise, overlay. Chart and lanes |
| Add | **Evaluated windows** list under the chart on the left, **selected window** on the right |
| Right column | Result, period, four KPIs, Review this window →, Fit to this window, Evidence package ↗, Evidence score, About score. Calculation details closed |
| Remove | "One time axis", "Signals, overlay, mode and verdict", "historian series at ...", "Selected period", "Click a verdict band..." Failure messages stay |
| Dialog | Result key |
| Links | Loop Explorer ↗ in the band, Open in Trend ↗, Review this window → Workbench |

The list and the chart select the same window. Older windows need a small `cplm-api` addition to show their values.

### 3. Investigation, back under Understand the cause

| | |
|---|---|
| Layout | Latest result: window, title, Cause, Engine severity, three facts, Next check bar. **Why this result**: five cards (Eligibility, Performance, Diagnostic evidence, Confirmation, Fusion). Left: values and trend. Right: gates of the chosen card and what is still unconfirmed. Then Next checks, Numeric evidence, Record your review |
| Keep | Our loop control, notes with attach and acknowledge, window choice, all reasons and limits, engine trace (closed) |
| Dialogs | Calculation proof (values, Evidence Workbench →, Evidence Replay ↗), All 17 gate results, Compare windows, Hypothesis comparison, Numeric evidence |
| Remove | "FINAL CONCLUSION", "KEY FACTS", "EVIDENCE", "WINDOW BROWSER", "RECORD IT", "no verdict" pill, "Reason —" |
| Links | Evidence Replay ↗, Related events ↗, Start with evidence ↓, trend links carry the same loop and window |

The title never shows an old verdict as current.

### 4. Evidence Workbench, four tabs instead of one long page

| | |
|---|---|
| Keep | Loop selector as it is, window selector, Newer, Older, More |
| Run bar | Proof state, pinned run, samples, version, loop result, Run id ↗, Reconstruct evidence ↗ |
| Left rail | All gates by tier with code, name and mark, replacing the gate dropdown. A native picker on narrow screens |
| Tabs | **Proof, Rules & parameters, Signal context, Identity & raw**. These are the reference's four. Your list reads Identity and Raw as two; the reference has them together |
| Moves | The right "Explain" column goes. Why this result → Proof. What this gate asks, Method, Parameters, Configuration → Rules & parameters. Identity and flags → Identity & raw |
| Remove | "No arrays held", "Not retained", "EVIDENCE NONE" and the panel repeat one fact: one statement stays |
| Dialogs | Key, Reconstruct evidence |
| Links | Back to Investigation ↗, Evidence Replay ↗, See rules & parameters →, View signal context → |

Status words follow one rule everywhere, such as Pass (section 10).

### 5. Evidence Replay

| | |
|---|---|
| Layout | One identity line in the band; five stage tabs replacing the lineage strip; chart and cursor with a PV, SP, OP, Mode readout at the cursor; right column with Window verdict and Re-run; notes at the bottom |
| Keep | Our chart, our cursor, window and gate choice, notes, the warning for a cut-off slice. No Play, step or speed |
| Remove | "SUMMARY", "INPUT LINEAGE", "Where this evidence came from", "Recompute this loop from history" heading, "How confident is the final verdict?" moves behind `?` |
| Dialogs | Run details, Evidence package |
| Links | Evidence Workbench ↗, Open retained proof ↗ |

Re-run: see section 12, decision 3.

### 6. Window Inspector, keep ours

| | |
|---|---|
| Keep | Every function: profiles, list, load older, compare, all data |
| Remove | Repeated full dates, "from", "emitted", "Latest results", "% full" |
| Change | Date once per group. Count check reads Matches, +1 sample, −1 sample, never "100 % full". The unexplained tick string becomes a named Feature flags dialog |
| Move | Selected window opens in the right column instead of a separate view, as on Calculations |
| Links | Inspect this window → (12h/24h Replay; 15m/4h that run in the Workbench), View record details ↗, Pipeline Health ↗ |

### 7. Calculations

| | |
|---|---|
| Band | Loop, window, verdict, versions, Run details ↗. Back to Investigation ↗ in the header |
| Filters | Find, Gate, Gate result, and a category toggle: All, Control error, Actuator, Data & mode, Oscillation, Decision |
| List | Calculation (name, then `CPLM-010 · G3` under it), Value / unit, Gate result. ID and Gate columns go. All 19 stay, no paging |
| Right column | Name, id, value, unit, method, related gate, unit note, Open Gn proof →, Retained value & identity ↗, Inspect parameters ↗ |
| Remove | The five tiles, row descriptions, "All types", "19 result(s)", "Page 1 of 2". The gate tally moves to Run details |

Method text comes from our engine, not the reference. Its CPLM-020 text is wrong for our calculation (`stdOp / stdPv`).

### System Response

Not in your list, but Loop > Model has to go somewhere and the reference has it here. Own page, with text cuts and the links Open loop ↗, Review setpoint changes →, Check G12 settings.

### 8.1 Loop Registry

| | |
|---|---|
| List | Loop name (service under it), Loop type, VP. Find loop, Bulk import, Add loop. Full width, side panel gone |
| Loop Detail page | `/cpm/registry?loop=X`: useful facts, signal mapping, readiness as named missing fields, loop model. Buttons: Edit, Delete, Open loop, Evidence, Effective rules ↗, Re-project |
| Delete | Your earlier answer stands: Delete retires the loop and keeps its history, can be undone, and needs a reason. Button wording is Retire unless you prefer Delete |
| Move | Gate role policy to Gate Configuration |

### 8.2 Gate Configuration

Three tiles (Effective layer, Profile, Worker alignment), tabs Effective and Bundles, "Where each value comes from", and a property table of Property, Value, Source. A row opens a dialog with the rest. Bundles shows Draft, Review, Publish. Jar and catalogue ids move to a closed Technical details. The two stacked tab rows go because the page stands alone.

### 8.3 Trend

Add our loop selector. Choosing a loop loads its PV, SP, OP and VP pens straight away. Add Open loop ↗. Links from other pages carry the loop. Nothing else on the page changes.

### 9. System

| Page | Change |
|---|---|
| Pipeline Health | Tiles; job list with state and checkpoint age, a job opens a read-only dialog; verification in a dialog with real run states; text cuts |
| Administration | One row of tabs: Users, Roles & permissions, Data sources, Plant model, Tag aliases, Audit log, System settings. Users: User, Role, Status, the rest in a row dialog. Data sources: list and detail. Settings shows "Not connected" instead of sample values |
| Governance | Filters, list of When / actor, Action, Entity. A row opens the audit event with hash and correlation. Change traceability and Audit integrity cards. Engine builds and jar ids go to Technical details |

"Device information" here means those build and engine identifiers. Data source connection fields stay where they are.

## 6. Problems found on the way

| # | Found | Evidence | Handled in |
|---|---|---|---|
| 1 | Three pages show three different "latest" windows for one loop | FIC10401: Gates 4 Nov 12:15, Replay 4 Nov 08:00, Investigation list 6 Oct 19:15, while its own conclusion says 4 Nov 12:15. They read `useEvidenceWindows`, `useGateHistory` ANY and `useGateHistory` LIVE | Task 13 |
| 2 | "Re-run this window" does not send the window | `recomputeLoop(loopId)` posts the loop id only | Task 18 |
| 3 | Calculations contradicts itself | "Metrics stored 12", "19 result(s)", "Page 1 of 2" on one screen | Task 20 |
| 4 | Investigation says "Only one evaluated window stored" beside "1–5 of 100" | Seen on screen | Task 13 |
| 5 | Trend shows LIVE on an empty chart | "LIVE · 0 pens" | Task 26 |
| 6 | Settings shows sample values under a warning banner | `/mnt/backups/ams`, 30, 365 | Task 28 |
| 7 | Lab analysis engine is down | JobManager answers "leader election", 0 of 13 jobs, TaskManager 611 restarts, ZooKeeper healthy. Cause not traced | Task 0 |

## 7. Implementation plan

1. **Page restructuring.** Sidebar with 6 headings and 17 entries. Every page back on its own address. Host pages removed. Tasks 2, 3.
2. **Navigation and routing.** One set of link helpers that carry loop, window, kind and gate. Hand-built links replaced. Tasks 4, 30.
3. **UI/UX improvements.** Page changes in section 5, using today's components at today's sizes. Tasks 6 to 12, 14 to 21, 23 to 29.
4. **Information hierarchy and content reduction.** Section 5 "Remove" rows. Each fact once. Warnings, failures and data states always stay on screen.
5. **Dialogs and sub-tabs.** Shared gate dialog and tier row first, then the others from section 5. Task 5.
6. **Cross-page journey.** Section 4 map, carrying the exact window. Task 13 makes every page read the same window first.
7. **Design consistency.** Section 10.
8. **Testing and validation.** Section 11.

## 8. Build order

You review on `:3000` after each section. Corrections carry forward, and the next section waits for your word. There are no separate mock-ups: you see real pages.

| Section | Pages | Tasks | Services |
|---|---|---|---|
| 0 Navigation and shared blocks | Sidebar, routes, links, gate dialog | 1 to 5 | ams-frontend |
| 1 Find problems | Overview, Performance, Loop Events | 6 to 9 | ams-frontend, cplm-api |
| 2 Check a loop | Loop Explorer, Historical | 10 to 12 | ams-frontend, cplm-api |
| 3 Understand the cause | Investigation, Workbench, Replay, Windows, Calculations, Response | 13 to 21 | ams-frontend |
| 4 Set up and Trend | Registry, Loop Detail, Gate Configuration, Trend | 22 to 26 | ams-frontend, cplm-api |
| 5 System | Pipeline, Administration, Governance | 27 to 29 | ams-frontend |
| 6 Whole journey and records | Proof, `changes_tracker.md`, `prod_decision.md` | 30 | none |

`cplm-api` additions stay small, as you agreed: two KPI drill-downs, severity filter and EVT search, values on older windows, retire and restore. No database migration is expected. Nothing goes to the plant from this plan.

## 9. Changes to the earlier 30-task plan

| Task | Change | Why |
|---|---|---|
| 6 Overview | Priority queue and preview stay as built; no table rebuild | "Our existing overview page is good" |
| 10 Explorer | Remove "about 320 px", the extra 12h range and the Live to Latest rename | "Trend will be same as in our base design" |
| 17 Replay | No playback; our cursor plus a readout | Decision 2 |
| 18 Replay | Re-run sends the exact window | Decision 3 |
| 19 Window Inspector | No alignment diagram, no sample-density chart; text, flags and right column only | "Our existing Window Inspector is good" |
| 20 Calculations | No new CSV export | Not requested |
| 26 Trend | Selector, pens and Open loop only; no role chips, Mode lane or time-control changes | You asked for a loop selector |
| 29 Governance | No new time filter | Not requested |
| All | The size rule in section 10 becomes a check | Earlier congestion complaint |

Everything else stays, including its failing-test-first steps.

## 10. Rules that hold throughout

- **Sizes:** font sizes, control heights, row heights, card padding and chart heights stay as today. The only exception is the PV, SP, OP, Mode row you asked for. New CSS may place things; it may not set a new size.
- **Look:** Traverse colours, Day and Night only. No Bright theme, no reference palette or font. Trend pens stay `--signal-*`. Status marks stay `gateMark`, shape and meaning unchanged.
- **Status words:** one set everywhere, from one place: Pass, Symptom seen, Strong symptom, Insufficient evidence. The control engineer reviews these.
- **Links:** same quiet style and the same `→` and `↗` meaning everywhere, built on our `ObcButton` flat style, replacing today's mix of `›` and outlined buttons.
- **Help:** our `?` circle, never the reference's `i`.
- **Nothing lost:** all 19 metrics, 17 gates, complete lists, paging, permissions, every KPI drill-down.
- **Evidence honesty:** a score is not a probability; missing is never 0; a short window never becomes a 12h verdict; a review never overwrites the engine result.
- **Prototype text never ships:** "Design preview", "Preview data", "Evidence basis", "local draft", "Reset preview actions".
- **Files:** 500 lines at most. `styles/cpm.css` (1,388), `CpmHistorical.tsx` (408), `CpmPerformance.tsx` (397) must not grow; new CSS goes in new files.

## 11. Testing and validation

| Check | When | Pass means |
|---|---|---|
| Type check, lint, unit tests, build, theme lint | Every commit | All clean |
| Browser gates: accessibility, redirects, geometry, control edge, link walk | End of each section | 0 findings, at 320, 390, 736, 1024, 1440 px, Day and Night |
| Size check | End of each section | Same computed sizes as today on the same components |
| Function parity | End of each section | Every control on the old page has a place on the new one; a removal is listed |
| Journey walk | Section 6 | Every link in section 4 opens the right page with the same loop, window and gate; Back returns |
| Permissions | Sections 0, 4, 5 | A role without access sees no entry, a disabled button with a reason, a clear restricted page |
| Exact window | Section 3 | A link to an older window opens that window or says it cannot, never the newest |
| Brief checks A1 to A10 | Section 6 | Recorded Pass, Fail, or Not in this release. A1 is judged on hierarchy and structure only, because the look stays ours. Section 12 lists what is not in this release; the owner signs it off and the SME is told |
| Control engineer | Before release | `text-changes.md` reviewed: status words, method text, evidence text |

A step with no such control on the lab is reported as untested, not passed. Writes on the shared lab need your approval each time.

## 12. Decisions

Decided by the owner, 2026-11-06:

1. **Lab engine: restore it first, as a separate task** (plan Task 0). Overview and Performance need it to show findings, and Re-run and Reconstruct evidence need it to run at all.
2. **Replay playback: left out.** No Play, step or speed. Our cursor stays, with a PV, SP, OP and Mode readout at the cursor. The SME brief lists playback on a locked page, so this is a declared difference and the SME is told.
3. **Re-run this window: sends the exact window as a new run and keeps the original.**

What decision 3 means in practice, confirmed in code:

- It uses the existing Evaluate request, the same one as the Workbench's Evaluate control. It re-evaluates that window from the historian with the settings the window ran under. It confirms a stored result; it does not test a changed setting.
- A repeat request for the same window opens the run already made, while its evidence is held (3 days). The page says so.
- It needs `cpm.analysis.create`, not `cpm.manage`, so the list of people who can press it changes. Anyone without it sees a disabled button with the reason.
- `/recompute` stays on Pipeline Health for its verification.

Not in this release, recorded in the acceptance sheet as such, not as a pass:

| Item | Why |
|---|---|
| Replay playback | Decision 2 |
| Calculations export | Not requested; section 9 |
| Re-run with current configuration | Needs backend work beyond the agreed small additions |
| Audit before and after values | Not served today |
| Audit chain range, count and algorithm | Not served today; audit-service is outside this plan |

Calls I made, tell me if any is wrong:

- An episode's Review opens the episode's **opening window**. If that window has aged out (gate rows are kept 14 days at the plant), Investigation says so and offers the newest window. Event rows on Overview do the same.

- Trend sits under an **Engineering** heading, as in the reference and your earlier sidebar list. Your new brief lists it under Setup; moving it is a one-line change.
- "Configuration limits" leaves Overview for Loop Registry, with a link.
- Relationships becomes its own Explorer tab, as in the reference.
- Plant model, Data sources and Tag aliases go to Administration, as in the reference. This reverses CHG-123.
- The sidebar says Loop Events, as in the reference; the page keeps the Episodes view.
- Audit log stays one trail on Governance; its Administration tab is one line with Open Governance →.
- Loop Detail is its own view, as you wrote, not the reference's side panel.
