# CPA text changes (CHG-117)

Redundant text removed at the owner's direction. Page layouts are unchanged. Text marked **moved** went word for word into a `?` beside its heading, so it is still in the product.

## Rules used

- A window kind repeated below the control that selects it is removed.
- A long explanation under a heading moves to a `?`.
- Kept on screen: units, states, coverage, source, zone, errors, empty-state reasons and recovery actions.
- Kept on screen: a window that differs from the selection, or a specific time.

## Changes by page

| Page | Before | After | Change |
|---|---|---|---|
| All pages | Sentence under the page title | `?` beside the title | Moved |
| Overview | Operating picture · latest 12h results | Operating picture | Removed |
| Overview | Each monitored loop counted once… | `?` How this is counted | Moved |
| Overview | Ordered by priority… | `?` How this is ordered | Moved |
| Overview drawer | 12h window ending 13:15 | window ending 13:15 | Removed |
| KPI drill-down | Basis: 12h window · newest 12h result ≤ 60 min old | Newest result ≤ 60 min old | Removed |
| KPI drill-down | Last 14 d · each UTC day at its end, same rules | Each UTC day at its end, same rules | Removed |
| KPI drill-down | Click a day… Days with nothing kept read "no data"… | `?` How to read this trend | Moved |
| KPI rows | 12h window · 5 min ago | 5 min ago | Removed |
| Performance | Verdicts fuse on 12h / 24h rolling windows… | `?` About these windows | Moved |
| Performance | Gate status by loop · latest 24h window | Gate status by loop | Removed |
| Performance | latest 12h fused result | latest fused result | Removed |
| Loop Events | · newest first | None, repeats the Newest control | Removed |
| Loop Events | detected within a minute, before the next fused window | `?` About fast conditions | Moved |
| Explorer | Gates: latest 12h fused window · trend: last 8 h | Gates: latest window · trend: last 8 h | Removed |
| Explorer | Loop summary · latest 12h evaluated window · ended 14 h ago | Loop summary · window ended 14 h ago | Removed |
| Explorer | Location breadcrumb row (plain text) | None, the context bar states it | Removed |
| Explorer | Loop KPIs · 12h window ending X | Loop KPIs · window ending X | Removed |
| Explorer | Live operating state; · rolling 8 h; Trend · live 8 h | Live; none; Trend | Removed |
| Explorer | Select-a-gate hint, trend band note, compare note, classification sentence | `?` | Moved |
| Explorer, Historical, Investigation | Window kind in empty states | Kind dropped | Removed; reasons and recovery kept |
| Historical | Evaluated 12h window; 12h window ending X | Evaluated window; Window ending X | Removed |
| Historical | · click a verdict band to inspect | `?` | Moved |
| Investigation | 12h fused window (latest) · start → end | Latest window · start → end | Removed |
| Investigation | Window … (12h); Recent 12h windows | Window …; Recent windows | Removed |
| Investigation | newest first · pick one to make it CURRENT | `?` | Moved |
| System Response | System response — loop name | System response | Removed |
| System Response | Chart, residual and model-history notes | `?` | Moved |
| Replay | 12h fused window · …; Evaluated window (12h) | Evaluated window · …; Evaluated window | Removed |
| Replay | Re-run description; Stages are the pipeline's fixed shape | `?` | Moved |
| Window Inspector | Latest 15m results for FIC…; select a window to open it | Latest results | Removed |
| Calculations | 12h window · start – end (12 h); Latest results · 12h fused window | start – end; Latest results | Removed; duration stays in the drawer |
| Calculation drawer | Closing caveat paragraph | `?` on the Coverage heading | Moved |
| Evidence Workbench | Repeated state title; this run's 12h window; 12h windows (none opened) | Title in the panel below; this run's window; Windows (none opened) | Removed; start, end and run stay |
| Loop Registry | Long banner | Banner heading, report pointer and `?` | Moved |
| Gate Configuration | Layer, in-progress and shadow notes; permission sentences | `?` on each heading | Moved |
| Pipeline Health, Governance | Notes under headings | `?` on headings | Moved |
| Administration | Header and System Settings subtitles | None | Removed |
| Administration | Six page sentences | `?` | Moved |

## Safety-relevant sentences, for the control-engineer review

**Still visible, window kind removed**
- "…is outside this trend range — the diagnosis is about that window, not this one."
- "This trend is the evaluated window the diagnosis is about."
- "The shaded band is the evaluated window behind the diagnosis."

**Moved word for word to a `?`. None of these is the warning itself: the warning stays on screen.**
- "Shelved loops are listed in Loop Events." The `N shelved` button still warns.
- The 60-minute freshness rule. The Stale card and state bar still warn.
- "Days with nothing kept read 'no data'." The chart tooltip still says it.
- "Rejected samples are gaps, never bridged…"
- "Free-run and one-step prediction errors…"
- "Markers, not a line… A baseline is chosen by review, never by recency."
- Both classification sentences on Explorer.
- The registry G14/G13 sentence. The per-loop warning remains in the profile panel and the readiness report.
- Shadow run "no episode, no operational result".
- Acquisition grid and report-by-exception limits.
- "A tag without an alias parks as unknown."
- "Path segments are permanent identity."
- Both permission-timing sentences. **Replaced by CHG-119** with one sentence, below.

**Deliberately left on screen**
- Bode "not a safety guarantee".
- "Scores are uncalibrated…"
- The loop-note acknowledgement sentence. **Moved to a `?` by the owner's review of 6 November**, below.
- The CMMS note.
- The unacknowledged-episode and shelf sentences.

## Open, found during this pass

- Explorer's source line, the range bar's zone and the permission sentences: **all fixed in CHG-119**, below.
- Calculations row descriptions stay on screen, because they are definitions.
- CSS left unused: `.cpm-queue-rule`, `.cpm-crumbs`, `.cpm-signal-trend__note`, `.cpm-verdict__state`.

## CHG-119 changes

| Page | Before | After |
|---|---|---|
| Header | Time range control | Times in {zone} |
| Overview cards | Icon box, number, label, share | Label and icon, number, share and change, View loops |
| Explorer, trend pinned to an evaluated window | Trend range A → B, not an evaluated window | Evaluated window A → B |
| Roles, notice after saving | Users with this role re-authorize on their next request. | Everyone with this role is signed out within a few seconds, and gets the new permissions when they sign in again. |
| Roles `?` | Editing a role takes effect for its users on their next request. | Same new sentence |
| Governance `?` | Permission changes take effect when the session's token is next issued (re-login, or the automatic refresh). | Same new sentence |
| Performance | (select a loop in the matrix first) | Select a loop in the matrix for [Window Inspector] |

**For the control-engineer review:** the permission sentence is new, and worth saying to users before a role is edited on a running shift, because it signs people out. Typed times now mean site time: Shelve until, Evaluate a window and Jump to date.

## CHG-121 changes

Visible text does not change, except that the phone header shows "CPA" without "Traverse" below 480 px. These names are read by screen readers and voice control only. None changes a meaning.

| Where | Before | After |
|---|---|---|
| Performance, gate bar | G0 Data quality: … | {count} G0 Data quality: … |
| Performance, gate chip | {loop}, G0 Data quality: {meaning}. Open the evidence. | G0 Data quality · {word}: {meaning}. {loop}. Open the evidence. |
| Episodes, row | Show episode EVT-1, peak {diagnosis} | Peak: {diagnosis}. EVT-1 · {window}. Show this episode |
| Loop › Calculations, gate result | Open G0 evidence in Evidence Replay | {status}: open G0 evidence in Evidence Replay |
| Diagnosis, window tile | {span}: {diagnosis}, latest | The tile's own text. The span stays as its tooltip |

## CHG-122 changes

Visible text does not change. These names are read by screen readers and voice control only.

| Where | Before | After |
|---|---|---|
| Evidence › Gates, gate chip | G0 Data quality: {meaning} | G0 {word}: Data quality, {meaning} |
| Evidence › Calculations, two filter lists | No name | Filter by gate, Filter by type |
| Evidence › Gates, no run open | No page title | Evidence workbench (not shown on screen) |

## CHG-123 changes

Visible text does not change. These names are read by screen readers only.

| Where | Before | After |
|---|---|---|
| Users, two filter lists | No name | Filter by role, Filter by status |
| Users and Tag aliases, last column | Empty heading | Actions |
| Governance, permission table | Unnamed scroll area | Permissions by role |
| Each Administration tab | "System Administration" | The tab's own name, not shown on screen |

## CHG-124 changes

| Where | Before | After |
|---|---|---|
| Trail, columns | When / hash, Action, Actor, Entity; Timestamp, Event Type, User, Entity, Hash Signature, Correlation | Timestamp, Event type, User, Entity, Hash signature, Correlation |
| Trail, event type list | All Events, Acknowledgements, Shelving, Security / Logins, System Events | All events, then each type the records hold |
| Trail, User | Filter by User; "Username…" | User; "Exact user name" |
| Trail, Find | "Find by user, action or entity" as a placeholder | The same words as its label; "Searches the rows fetched" as the placeholder |
| Trail, filters `?` | None | New: "User and Event type ask the server, so they reach older records. Find searches only the rows fetched." |
| Trail, verification | "Verification failed.", "— the service could not confirm chain integrity." | VERIFY FAILED pill, and Governance's sentence on what a 500 means |
| Trail, 403 | "re-login to refresh claims" | "Sign in again to refresh your permissions" |
| Entity and event labels | Cpmloop, Rolepermissions, Rbac role permissions reset | CPM loop, Role permissions, RBAC role permissions reset. The code stays on hover |

**For the control-engineer review:** the verification and tampering sentence is safety-relevant. It keeps Governance's wording.

## Owner's review of 6 November 2026 (CHG-126 to CHG-131)

The owner asked to remove repeated text, loop information and explanations that add nothing. The rules at the top of this file still hold.

### Loop name and loop information

| Page | Before | After |
|---|---|---|
| Band, loop list, Open details, Performance, Overview queue | FIC00701 · Flow controller FIC00701 (FCS0102) | FIC00701 · Flow controller (FCS0102). Display only: the registry keeps the full name |
| Loop tabs | Service name and loop ID as a heading above the summary | Removed. The band states them |
| Evidence › Gates | FIC00701 · Flow controller FIC00701 (FCS0102), then G15 Decision | Not shown on screen. The Gate dropdown and the verdict card state it. Screen readers keep it as the page title |
| Evidence › Calculations | 1 · Loop panel, and "FIC00701, pick another loop or plant scope" | Removed. Its state pill and profile move beside the result count |
| Band on every tab | Location, Period, FIC · criticality medium | Removed from the band. Location, type and criticality are in Open details and Summary › Loop model |
| Loop notes | 0 on FIC00701 | 0 note(s) |

### The same fact twice

| Page | Before | After |
|---|---|---|
| Evidence › Calculations | Window column with the same dates on every row | The column shows only when rows differ. The band has the dates |
| Evidence › Calculations | "Not measured", then "engine version without this metric", on 7 rows | "Not measured". The reason stays on hover, and a `?` on Value explains it |
| Diagnosis | Six tiles, each "Insufficient data, too few qualified samples in the window" | One line naming the six. Tiles return as soon as any value differs |
| Evidence › Gates | 12h · 2026-10-10 17:00:00 → 2026-10-11 05:00:00 · UTC · 190 samples | Coverage 190 samples. The window dropdown has the window |
| Evidence › Gates | "G15 Decision: Insufficient evidence." twice, beside the same result in a pill | Heading and pill. The sentence stays whenever it adds a reason or a number |
| Loop Summary | Trend range 05/11/2026 23:35 → 06/11/2026 07:35, not an evaluated window | Not an evaluated window. The range control has the dates |
| Loop Summary | "last stored 26 days ago" on every card | Once, in the heading. Stays on each card when the ages differ |
| Performance | "0 of 0 assessed loop(s) · excluded: 165 stale, 76 never evaluated" on 3 tiles | Once, under the tiles, when nothing could be counted. A tile with a figure keeps its own basis, because each counts different loops |
| Episodes | 500 event(s) · open first, highest evidence score first | 500 event(s). The Order control says it |
| Loop › Model | Three explanations that no response event exists | One, with the same two links |

**Corrected from the sample:** the Diagnosis Window row stays. The sample removed it because the band then named the window. The band no longer does.

### Explanation that moves to the `?` or goes

| Page | Before | After |
|---|---|---|
| Overview | "0 % of 241 monitored loops", "View loops" on each card, "change vs 24 h ago" | On hover and keyboard focus. The change shows on the card only when it moved |
| Performance | Three-line symbol key between the data and the table | Behind How to read this. Same key, same icons |
| Evidence › Gates | Three-line symbol key under the gates | Inside the gate list, where the marks are |
| Performance | Select a loop in the matrix for | Removed. The button still says why on hover |
| Replay | The chart below shows the raw historian slice this window drew from. | Moved to a `?`, reworded as "The chart shows the raw historian slice this window drew from." |
| Replay | Pipeline steps, 1 Raw historian to 5 Fusion | Moved to the same `?` as one sentence, with the normalise grid. They were labels, not controls |
| Evidence › Windows | Watermark lag, not exposed by the metrics proxy | Removed. Pipeline has its own Watermark lag tile |
| Setup › Loops | Readiness-gated configuration banner | Moved to the `?` |
| Setup › Configuration | no governed bundle is active for this loop: the engine runs the factory layer… | Removed. "Runs under: NO_ACTIVE_BUNDLE · factory layer" says it |
| Evidence › Gates | Neither retained proof nor a reconstruction is stored for this run. | Removed. The "No arrays held" pill stays, and the panel below gives the reason |
| Notes, on Diagnosis and Replay | A note stays on the loop. Saving it never acknowledges an episode… | Moved to a `?` beside Loop notes |

### New text

| Where | Text |
|---|---|
| Overview bar, title | Every monitored loop, one state each |
| Overview bar, hint | Click a segment to filter the loop list |
| Overview bar, `?` | A loop can count on more than one card above. Here it counts once, in the first state that applies: never evaluated or stale, a finding, manual, saturated, not assessable, then performing or needs review. |
| Overview bar, state | Needs review: a weak symptom, or no fault but a performance criterion is not met |
| Evidence › Calculations, `?` on Value | Not measured: the engine version that wrote this window has no such metric, or the window gave it nothing to work from. Open the row for its reason. |
| Band, loop outside the scope | {loop} is outside the plant scope in the header. It stays selected until you pick another. |

### For the control-engineer review

**Moved off the screen by this review**
- "A note stays on the loop. Saving it never acknowledges an episode unless you tick that box; link it to an episode now or later." Now in a `?`, because it concerns acknowledgement. It was on the "Deliberately left on screen" list above.
- The loop summary's next check, limitations and readiness are one click away, behind Open details. The row keeps the result, the window age and the blocking count.
- On Signals, History and Calculations the summary is gone, which reverses SME #4.
- The 17 gate results are one click away, in the gate list.
- A KPI's share and rule are on hover.
- The reason for "Not measured" is on hover and in the drawer.

**Still on screen on purpose**
- Limitations on Diagnosis.
- "Still open: the newest window could not be judged (excluded or insufficient data), so the condition has NOT recovered."
- "No health data for this window", with its NE107 note that missing diagnostics are not OK.
- "…is outside this trend range", with the rest of that sentence.
- Units, every empty-state reason and recovery link, and row values that are that row's own, such as Unobservable, Degraded or Not mapped.

## KPI drill-down (CHG-132)

**Moved word for word to the number's `?`:** Rule, Formula, Threshold, Basis, Why this KPI, Computed. "Change since 24 h ago" now reads "Since 24 h ago", and "the change compares with 24 h earlier" went because that line says it.

**Moved to the trend's `?`:** "Each … day at its end, same rules" and "Between x % and y % over the days with data." "No day had anything to judge." stays on screen, because it explains an empty chart.

| Was | Now |
|---|---|
| Find problems, then the KPI's name as a heading | The KPI dropdown |
| Operations overview (link) | Overview |
| Show another KPI (label) | Screen readers only |
| Proof / How this number is calculated | Behind the `?`, under that same title |
| How this number has moved | Trend |
| The loops behind the number | Gone. The count heads the list |
| 165 loop(s) | 165 loops |
| matches the card | matches the KPI |
| Search loops (label) | The box reads "Search loop tag or name" |
| Measured against the rule | The measure's own name when every row shares it, otherwise Measured |
| Window judged | Window |
| "Age of the newest result 85 days — above 60 min" in each row | "85 days — above 60 min", under the heading "Age of the newest result" |
| Newest result 85 days ago (verdict of a stale loop) | Stale |
| "The count for this KPI is 0 in this scope — nothing to verify here. Back on the Overview, the other figures list their loops." | Gone. The title says it: No loop is in this KPI |
| "Clear the search to see every loop behind the number." | Gone. The Clear search button stays |

**Removed from each row:** the Site › Area › Unit line, at the owner's request.

**For the control-engineer review:** a stale loop's verdict is now the word Stale, with its age in the Measured column.

## Reference redesign, Section 0 (CHG-133)

For the control engineer: gate status words change in one place, `gateMark`. Marks, colours and meanings do not change. A pass on a diagnostic gate still reads "Not seen", never "Pass".

| Was | Now | Where |
|---|---|---|
| OK | Pass | Every gate surface |
| OK on available data | Pass on available data | Every gate surface |
| Seen | Symptom seen | Every gate surface |
| Strong | Strong symptom | Every gate surface |
| Insufficient | Insufficient evidence | Every gate surface |
| check OK | check passed | Gate key |

Controls that changed place in this section, not removed:

| Control | Now on |
|---|---|
| Tab rows Summary, Historical, Diagnosis, Model, Signals, History, Calculations | Sidebar pages and Loop Explorer tabs |
| Tab rows Gates, Replay, Windows, Calculations | Sidebar pages |
| Tab rows Loops, Configuration, Plant model, Data sources, Tag aliases | Sidebar pages and Administration tabs |
| Tab rows Pipeline, Governance, Users, Roles, Settings | Sidebar pages and Administration tabs |
| Relationships under Signals, with Open in Loop Registry | Loop Explorer, Relationships tab |

## Overview (CHG-134, Task 6)

| Was | Now | Where |
|---|---|---|
| Eyebrow "Operating picture" | removed | KPI panel head |
| "updated <time>" beside the title | behind a ? ("Last updated") | KPI panel head |
| ? "How this is counted" with the basis sentence | "Calculation basis" dialog in the page foot | KPI panel head |
| "Every monitored loop, one state each" | "Loop state breakdown" | State bar |
| "Click a segment to filter the loop list" | removed | State bar |
| Eyebrow "Priority queue" | removed | Queue head |
| "Medium-criticality loop · High severity · ..." under each queue row | behind a ? beside the diagnosis pill | Queue rows |
| "X ›" (queue tag), "shelved ›", "View all ›" | "X →", "shelved ↗", "View all →" | Queue |
| "<name> · top-priority loop" | "<name>" | Preview eyebrow |
| "Open analysis ›" | "Review X →" | Preview button |
| Eyebrow "Top-priority finding" over the title "<Condition> on X" | title "Top-priority finding"; card is one link "X · <Condition>" | Bottom row |
| "X (name) heads the queue: ..." | removed | Top finding |
| "Review evidence ›", "Open X ›" | the whole card is the link | Top finding |
| Eyebrow "Recent context", title "Event trail" | "Recent events" | Bottom row |
| "All events ›", row links "X ›" and "Episode ›" | "All events →"; the row is one link to Investigation | Recent events |
| "Event trail unavailable" | "Recent events unavailable" | Recent events |
| Readiness strip (configuration limits) | Loop Registry (Task 23) | Page foot link "Configuration & coverage →" |

| Control | Now on |
|---|---|
| Open analysis (focused analysis drawer) | Investigation, through Review X → |
| Calculation basis | Dialog from the page foot |

## Performance, KPI tiles and gate summary (CHG-135, Task 7)

| Was | Now | Where |
|---|---|---|
| Tile "Median error (% of span)" | "Median error"; line "of PV span" | KPI tile |
| Tile "Loops with periodic diagnosis" | "Periodic diagnosis"; line "of N assessed" | KPI tile |
| Tile lines "mean · 118 of 120 assessed loop(s) · excluded: ...", "MAE ÷ PV span · ...", "oscillation or valve nonlinearity, detected or stronger · ..." | one short line; the basis is in the tile dialog ("72 of 72 assessed loops contribute", "Not counted: ...", "Not assessed: 165 stale, 76 never evaluated") | KPI tile, tile dialog |
| "· whole scope, health filter not applied" on each tile | "The health filter does not narrow this figure: it counts the whole scope." | Tile dialog, only when the filter is on |
| Diagnostic capability line "4 valve loop(s) with VP expected but not mapped — valve faults there need an approved test record to be confirmed" | line "4 without a mapped VP"; the full sentence is in the tile dialog | KPI tile, tile dialog |
| Paragraph under the tiles "0 of 0 assessed loop(s), excluded: ..." | "0 of 0 assessed loops contribute" in the tile dialog | Tile dialog |
| Eyebrow "Calculation pathway", title "Gate status by loop" | removed | Gate summary head |
| "How to read this" (docked column, with its own heading "How to read this view" / "Gates tell you why.") | "How to read" dialog | Gate summary |
| Step "Pick a gate in the roll-up to see which loops it is holding back." | "Pick a gate tile to see which loops it is holding back." | How to read |
| Step "... Click one to open its evidence here; ..." | "... Click one to open its evidence; ..." | How to read |
| Heading "What this fleet cannot yet decide" with the no-VP sentence and the peer sentence | the peer sentence only ("N loops have no peer links, ..."); the VP sentence is the capability tile's | How to read |
| "Newest fused window emitted 12 min ago (time)" on every visit | shown only when stale: "Stale · Newest fused window emitted N ago (time)" | Above the gate tiles |
| "Pipeline Health ›" | "Pipeline Health ↗" | Stale line |
| Gate bars with a stacked height, count and code, then tier names below | count tiles (count and code) under their tier headings; the failed and attention split is in each tile's name | Gate summary |
| Drill-down list for a tile | new lists "Assessed loops", "Periodic diagnosis", "Valve position expected but not mapped" in the KPI page's dropdown | KPI drill-down |

| Control | Now on |
|---|---|
| How to read (toggle for the docked guide) | Button above the gate tiles, opens a dialog |
| Show the loops | Footer of each tile dialog, to the KPI drill-down |

## Performance list, toggle, matrix and gate dialog (CHG-135, Task 8)

| Was | Now | Where |
|---|---|---|
| Dropdown "Matrix view": "Checks behind the result" / "Full G0–G15 matrix" | Toggle "Findings" / "Gate matrix" at the end of the toolbar | List toolbar |
| Eyebrow "Opportunity ranking", title "Loops needing attention", its own dropdown "By evidence score" / "By control error" | removed; both orders are in the Sort dropdown ("Evidence score", "Control error", with "Tag", "Result", "Priority") | List |
| Second list of the same loops, with "#n", "driven by", "no gate flagged", "+n" | removed; the list's Checks column names the gates | List |
| "no other check moved this result" under a loop | nothing | Findings |
| "{n} further loop(s) returned by the ranking have no verdict yet and are not listed." | removed | List |
| Findings columns Loop, Checks behind the result, Result | Loop, Result, Checks behind the result, Evidence, Review | Findings |
| Check chip "G5 Oscillation (ACF) · Symptom seen" | "G5 Symptom seen" (gate name in its tooltip and the dialog) | Findings |
| Matrix head: code and gate name under each code | code only (name in the tooltip) | Gate matrix |
| Matrix result: pill, plus "last verdict ..." under it on every row | result as a one-line link to Investigation; "last verdict ..." only in the selected-loop band and the gate dialog, row tooltip | Gate matrix, Findings |
| Loop cell "FIC10301 ›" | "FIC10301" | Both views |
| Table label "Gate status by loop" / "Checks behind each loop's result" | "Gates by loop" / "Findings by loop" | Table names |
| Strip "FIC10301 · title / Selected row · latest fused result · time / Final diagnosis X · evidence score N / Open fused evidence › / Open loop ›" | Band: tag, result pill, evidence score, last verdict when older, "Review X →", "Open loop"; shown only once a loop is selected | Above the list |
| "Window Inspector ›" (header) | "Window Inspector ↗" | Header action |
| Tooltip "Select a loop in the matrix to open its per-window results" | "Select a loop in the list to open its per-window results" | Header action |
| Right-hand panel "Gate G5 evidence", "FIC10301 · BLOCKING", Close, previous and next icons; "{G} · latest fused result"; Result tile; "Last verdict" row | Dialog "FIC10301 · G5": tier, name, Check status, Loop result, Assessment, Reason; "Previous gate G4", "Next gate G6"; the rest under "More about this gate" | Gate dialog |
| Panel buttons "Open in workbench ›", "Open in Evidence Replay ›", "Open full loop ›", "Window Inspector ›" | "Open in workbench →", "Open in Evidence Replay →", "Open full loop ↗" (under "More about this gate"); footer "Window Inspector ↗", "Review X →" | Gate dialog |
| Unavailable-read states shown in the Result tile (UNAVAILABLE, NO WINDOW YET) | a line under "More about this gate"; a failed read also shows as Reason | Gate dialog |
| Tooltip "This gate in the fleet matrix, with the docked evidence panel" | "This gate in the fleet matrix, opened in its dialog" | Loop Explorer, gate detail |

| Control | Now on |
|---|---|
| Any result (new dropdown, from the diagnosis band) | List toolbar, after Needs attention |
| Sort (evidence score, tag, result, control error, priority; `?sort=`) | List toolbar |
| Review ↗ | Last column of Findings |
| Result link | Last column of the gate matrix |
| Previous and next gate | Gate dialog footer |
| Gate key (compact, with Full key) | Above the gate matrix |


## Loop Events (CHG-136, Task 9)

| Was | Now | Where |
|---|---|---|
| Columns Event, Severity, State, Opened (sortable headings) | Loop / peak diagnosis, Severity, Review, Opened (plain headings; the order is the Order dropdown) | List |
| Row: "Peak: X" title, "EVT-n · 24h", the loop as "FIC10301 ›", severity pill, up to three state pills (Now:, state, availability), date and time | Row: tag, peak diagnosis, "EVT-n · 12h"; one severity word; one Review pill with one state line ("Open", "Open · Unobservable", "Closed"); "5 Nov · 13:45" | List |
| Nothing above the list | Heading "Open episodes" (the state filter's name + "episodes") | List |
| Empty search: "No episode matches “q” under this filter — search covers loop tag, loop name, family and diagnosis." | "No episode matches “q” under this filter." | Empty state |
| Empty filter: "No episode matches this state filter and plant scope." / "No diagnosis episode is recorded yet. Episodes appear here when…" | "No episode matches this filter and plant scope." | Empty state |
| Find placeholder "loop, service, family or diagnosis" | "loop, EVT number, family or diagnosis" | Filter row |
| Fast conditions panel under the list, eyebrow "Fast conditions · G10 limit dwell / G11 freeze" | toggle "Fast conditions · n open" in the header; its own view and detail; eyebrow removed | Header, conditions view |
| Detail header "EVT-n" / "Peak: X", pills Severity, Now:, State | "EVT-n · Episode details", tag ↗, severity pill, "Peak · X", "Latest · Y" only when it differs | Detail |
| "FIC10301 ›" and "Episode period ›" | "FIC10301 ↗" and "Episode period ↗" | Detail |
| "What happened / Episode" and "The {family} family was reported across … peaking at … ; the latest window reports …" | removed (peak, latest, windows and support are in the lines and the strip) | Detail |
| "Evidence / Provenance": Fault family, Peak evidence score, Resolution, Calculation version, Dynamics profile | Peak evidence in the strip; the rest under Technical details | Detail |
| "Operator state / Review and shelf", rows Acknowledgement, Review note, Shelf, Shelf reason | rows Review, Review note, Shelf, Shelf reason | Detail |
| Availability sentence under the rows ("Still open: the newest window could not be judged…", "Open and observed: …", "Closed by…") | behind the ? on the Availability row | Detail |
| "This episode has closed but was never acknowledged — …" under the actions | behind a ? on the Review row (closed, unreviewed episodes only) | Detail |
| "Review note (optional)" field, hidden once acknowledged, placeholder "Why this was acknowledged" | "Note", placeholder "Optional", always shown; feeds Acknowledge and Save note | Detail |
| "History ›" under the actions, History list inline | "Full history ↗" in Activity & notes, opening a dialog "EVT-n · Full history" | Detail |
| "Loop notes / Notes on EVT-n", "No loop note is linked to this episode.", "Loading notes…" | removed; notes are in the Activity & notes timeline and in the Full history dialog | Detail |
| Qualified support in the family sentence ("n non-overlap window(s) · 9.9 h of qualified support"; "n evaluation window(s)" without support) | strip "Peak evidence 100 · Qualified support 9.9 h · Non-overlap windows 1"; "—" when no support is recorded | Detail |
| Dates "15/10/2026, 10:32 CEST" in the detail | "15 Oct · 10:32" (fmtWhen) | Detail |
| Deep links to an episode opened on All events only through `?filter=all` set by the caller | `eventsHref({ event, filter: 'all' })` from loop notes; Recent events "All events →" carries `filter=all` | Links |

| Control | Now on |
|---|---|
| Episodes \| Fast conditions toggle with open counts | Page header |
| Severity dropdown "All severity / High / Medium / Low" (`?severity=`) | Filter row |
| Review {tag} → (full width) | Detail, under the peak |
| Save note | Detail actions |
| Unshelve… | Detail actions, only while the episode has a shelf (was always there, disabled) |
| Full history ↗ | Activity & notes heading |
| Review {tag} →, Window Inspector ↗ | Fast condition detail |
| Technical details | Detail, last |
