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

## Section 1 check

| Control | Now on |
|---|---|
| Gate names in the matrix head (G0 Data quality …) | The cell's title and the gate dialog |
| "Open Gn evidence for <loop>" on matrix cells | A click on the cell, opening the gate dialog |
| Opened sort header (Loop Events) | The order dropdown |
| Close reason (Fast conditions) | Fast condition detail |

## Loop Explorer Summary (CHG-137, Task 10)

| Was | Now | Where |
|---|---|---|
| Eyebrow "Loop summary" before the result | removed; the band reads "Latest 12h · <window end>", the result, then the fact line | Band |
| (new) | "13 % in band · persisting 11 h · evidence score 100"; persistence left out when no episode of this window kind is open | Band |
| "Open details" as a raised button | flat button; "Review evidence →" beside it | Band |
| Heading "Operating state" and eyebrow "Live" / "Last stored 13 days ago" / "Last stored samples" | removed; the stored age is said once, beside the signal quality | Summary |
| "from historian" on PV, SP, OP, Mode | removed | Signal row |
| "live" under each live value | removed; a stalled live value still says "last received …" | Signal row |
| "closed loop · analysed" under Mode | removed; a mode that excludes the loop at G1 keeps its warning | Signal row |
| "Not an evaluated window" and "Trend range … → …" under the cards | removed; the trend bar states the period and the band states the window | Summary |
| "{window} is outside this trend range — the diagnosis is about that window, not this one." | hover title of "Show evaluated period ›" | Trend |
| "This trend is the evaluated window the diagnosis is about." | removed; the two Compare buttons stay | Trend |
| "The shaded band is the evaluated window behind the diagnosis." | hover title of "Show only that window ›" | Trend |
| "Open in Historical ›" | "Historical ↗" | Trend |
| Column "Context" with heading "Loop model", pill EXPLICIT / PRESET | removed from Summary; "Classification: Declared / From tag type" with its ? inside the dialog | Loop model dialog |
| Rows "Gate profile", "Historian device" under the loop model on Summary | rows in the dialog "Loop model & setup" | Loop model dialog |
| "Evidence workbench ›" in the loop model | removed; "Review evidence →" in the band is the one way there | Loop model dialog |
| "System response ›", "Effective configuration ›" | "System Response ↗" and "Loop Registry →" in the dialog footer; "Show effective configuration" / "Hide effective configuration" | Loop model dialog |
| Heading "How this loop performs" and eyebrow "Loop KPIs · window ending …" | heading "Loop KPIs"; the window is in the band | Loop KPIs |
| "change vs the window 24 h earlier" beside the heading | on each change's hover title | Loop KPIs |
| "Open to see where this number comes from" on every card | removed; a card opens a dialog with its meaning, Inspect Gn → and the proof link | Loop KPIs |
| "rule ≥ 95 %", "rule ≤ 10 %" in a card's line | in the card's meaning, shown in its dialog | Loop KPIs |
| "G3 not evaluated" and the like in a card's line | removed; the line carries the gate result only when there is one | Loop KPIs |
| "not measured in this window" on each card | once, beside the heading | Loop KPIs |
| Coverage card without a bar | coverage bar; no bar for a ratio above 100 % | Loop KPIs |
| Eyebrow "Evaluated window · ending …", heading "Gates", ? "How to read the gates" | heading "Gate results" | Gate results |
| Chips "✓ G0 Pass" with the word beside | tiles with the mark over the key; the word is in the spoken label | Gate results |
| Full gate key under the strip | short key with "Full key" opening the rest | Gate results |
| "Show this window on the trend ›" under the gates | removed; the trend bar offers Show evaluated period and Show only that window | Gate results |
| Inline gate panel: eyebrow "Evaluated window", Close, rows Window from, Window to, Samples, Gate role, Preconditions, Method, verdict sentence | gate dialog: status, Loop result, Assessment, Reason, What this gate asks, More about this gate | Gate dialog |
| "Open in Evidence Workbench ›" | "Evidence Workbench →" | Gate dialog |
| "Evidence Replay ›", "Gate on Performance ›" in the gate panel | removed; Replay is one step on from the Workbench, and Performance opens the same dialog | Gate dialog |
| Section "Long and short windows" / "Calculations" with "Show calculations ›" | removed; "All calculations →" in the Gate results heading switches to the Calculations tab | Summary |
| KPI card as a link to its proof page | KPI card opens a dialog; "Calculation proof ↗", "Historical ↗" or "Window Inspector ↗" for the proof | Loop KPIs |

| Control | Now on |
|---|---|
| Open details | Band, flat |
| Evidence workbench (loop model) | Review evidence → in the band |
| Loop model column | Dialog from Loop model & setup → |
| Show calculations / Hide calculations | All calculations → (Calculations tab) |
| KPI card link to its proof | Inside the KPI dialog |
| Close (gate panel) | The dialog's close control |
| Evidence Replay, Gate on Performance (gate panel) | Evidence Workbench, Performance |

## Loop Explorer Signals, Calculations, Relationships, History (CHG-138, Task 11)

| Was | Now | Where |
|---|---|---|
| Eyebrow "Signal mappings" and heading "N role(s) mapped" | removed; the table and the tab count say it | Signals |
| Columns Role, Meaning, UNS path | columns Signal, Value, Unit; the meaning follows the role and the UNS path is the second line | Signals |
| "Open signals in Trend ›" raised button above the table | "Open signals in Trend ↗", flat, in the foot | Signals |
| Binding pill in the heading's right side | in the foot beside the signal quality, unchanged words | Signals |
| Eyebrow "Latest fused window" / "Latest short window" and heading "Gate outcomes" / "Per-window features" | removed; one line "12h window ending 5 Nov · 14:15" | Calculations |
| Select "Window" with "Fused verdict (fires on …)" and "Short features (G0–G4)" groups | removed; the window is the page's 12 h / 24 h switch, and the short windows are in Window Inspector | Calculations |
| Gate rows worded by `codeLabel` ("Warning", raw status) | the Summary words from `GateBadge` ("Symptom seen", "Pass") | Calculations |
| Click the status to open Evidence Replay | "Inspect →" opens the gate dialog (Evidence Workbench →, Window Inspector ↗) | Calculations |
| "Window history in Inspector ›" (short windows) | "Short windows ↗" | Calculations |
| "Full catalogue ›" raised button | "Full catalogue →", flat | Calculations |
| Summary Calculations block (counts line, "Window history ›", "Full catalogue ›", window kind control) | the long metrics under a "Long-window metrics" label; the counts line is not repeated (Summary shows the same gates) | Calculations |
| Eyebrow "Lineage" and heading "Source → loop → calculations → outputs" | summary "Lineage" of a closed disclosure | Relationships |
| Eyebrow "Peer topology (G13)" | behind the ? beside "Loop links" | Relationships |
| "Create asset relationships, then republish evidence — G13 cannot evaluate without them." | behind the same ? | Relationships |
| Heading "N loop link(s)" | "Loop links"; the count is on the tab | Relationships |
| "Open in Loop Registry" (normal button) | "Loop Registry →", flat | Relationships |
| Date and time with zone name (`fmtDateTime`) | `fmtWhen`, e.g. "5 Nov · 14:15" | History, Calculations |

| Control | Now on |
|---|---|
| Window select (Calculations) | Window Inspector (short windows) and the page's 12 h / 24 h switch |
| Status button to Evidence Replay (Calculations) | Inspect → opens the gate dialog; Replay is one step on from the Workbench |
| Open signals in Trend (Signals) | Foot, flat, ↗ |
| Linked loop (Relationships) | Opens that loop's Relationships tab |
| Loop Events ↗ (History) | New link on each run and each expanded episode |
| Open Historical → (History) | Foot of the list |

## Historical (CHG-139, Task 12)

| Was | Now | Where |
|---|---|---|
| Eyebrow "One time axis" and heading "Signals, overlay, mode and verdict" | removed; the chart has no heading | Chart |
| ? "How to use this chart": "Click a verdict band to inspect." | removed; the list and the Result lane both select | Chart |
| "N evaluated window(s) · capped at 100" in the heading's right side | foot: "N results · 12h rolling windows", with "· newest 500 read" when capped | Chart foot |
| Caption "historian series at {series} · PV keeps its min-max envelope" | removed | Under the chart |
| Empty state ending "(Historian series: {series})" | removed | Chart |
| Empty state "…KPI overlay and verdicts." | "…KPI overlay and results." | Chart |
| Lane labels MODE and VERDICT | Mode and Result | Chart |
| Tooltip "Verdict: {band} · {finding}" | "Result: {band} · {finding}" | Chart |
| "Zoomed view only — the overlay and verdict feeds are still loaded for the applied range." | removed | Chart foot |
| Eyebrow "Selected period", heading "Window ending {date and time with zone}" | heading "Selected window"; the period is one line, `fmtWhen` to `fmtWhen` | Selected window |
| "Click a verdict band in the chart above" / "That window's verdict and gates appear here, with a route to replay its evidence." | "No window selected" / "Choose one in the list or on the Result lane." | Selected window |
| Rows Verdict, Evidence score, Samples, Window from, Window to, Calculation | result pill and period, four KPIs (In band, Time in normal mode, MAE, Saturation), Evidence score; Samples and Calculation behind Technical details | Selected window |
| Evidence score hover text only | ? "About score" | Selected window |
| "Replay this period ›" (raised) | "Replay ↗", flat | Selected window |
| "Evidence Workbench ›" | "Review this window →" (raised, full width) | Selected window |
| "No CMMS integration configured, so no work orders are correlated here. Nothing is shown because nothing is known — not because nothing happened." | removed | Selected window |
| "Open in Trend ›" (normal) | "Open in Trend ↗", flat | Toolbar |
| VP chip note "unmapped" for every loop without a VP tag | "unmapped" only where VP is expected; "not applicable" / "not installed" where the loop is declared without one | Toolbar |
| Export hints "Select an evaluated window on the verdict lane first" / "Click a verdict band to export that window's evidence package." | "Choose an evaluated window first" / "Choose an evaluated window to export its evidence package." | Export menu |
| Date and time with zone name (`fmtDateTime`) in the export label and the truncation caption | `fmtWhen` | Export menu, captions |

| Control | Now on |
|---|---|
| Evaluated windows list | New: under the chart, left (Window ending, Result, Mode, In band; paged) |
| Selected window | Under the chart, right (was full width) |
| Fit to this window | New: sets the range to the window and keeps `?window=` |
| Evidence package ↗ | New button in the selected window; the Export menu entry stays |
| Result key | New dialog from the chart foot |
| Loop Explorer ↗ | New: end of the band, before Export |

## Task 13 (CHG-140): one window on every page

| Was | Now | Where |
|---|---|---|
| "Only one evaluated window stored — no PREVIOUS to compare against yet." (shown beside a list of 100) | "No earlier evaluated window is stored, so there is nothing to compare against." only when none exists; otherwise "Loading the previous window…", "The previous window (ends {date}) has no full stored result to compare against.", "The previous window could not be read." | Investigation, window browser |
| "The window this link pointed at is not among the fetched results — showing the newest evaluated window instead." | Empty state "That window is not stored": "The service holds no result for the {kind} window ending {date}. Full gate results are kept for a limited time, so a window this old, or one never evaluated, cannot be opened." with "Open the newest window"; the newest is no longer shown in its place | Investigation |
| "The window this link pointed at is not among the fetched results — replaying the newest evaluated window instead." | Empty state "That window is not stored": "The service holds no result for the {kind} window ending {date}, so it cannot be replayed. Full gate results are kept for a limited time." with "Replay the newest window" | Evidence Replay |
| Window browser count "1–5 of 100" | "1–5 of 100+" while older windows remain; "Older ›" loads them | Investigation, window browser |
| Window row "{start} → {end}" | adds " · re-run (no original stored)" when only a re-run holds that end | Investigation |
| "· replay {id}" in Calculation | "· re-run {id}" | Evidence Replay, Summary |
| Eyebrow "Effective configuration" in the drawer opened from a run | "Configuration this run used" (read at the run's window end) | Why this result drawer |

| Control | Now on |
|---|---|
| Source select, Live | also clears `?window=` |

## Task 13 fix round 1 (CHG-140)

| Was | Now | Where |
|---|---|---|
| "The window this link pointed at is not in the current range — showing the newest evaluated window instead." | "The window this link pointed at is not in the current range, so none is selected. Choose one in the list, or widen the range." (no window is shown in its place; the "No window selected" empty state is not repeated beside it) | Historical, Selected window |
| Window browser tooltip "Already showing the oldest loaded windows" | "Already showing the oldest stored windows" | Investigation, window browser |

| Control | Now on |
|---|---|
| Result of this window (Original result / Re-run {id}) | New select in the Replay band, only when a window holds more than one result; writes `?rerun=` |

## Task 14 (CHG-141): Investigation

For the control engineer: the status words all come from `gateMark`. The one new status phrase is "limit symptom", on the Diagnostic evidence card only, for G10. Please review it, and the Next checks wording below.

### Removed or reworded

| Was | Now | Where |
|---|---|---|
| Eyebrow "Final conclusion" | Removed. The card opens with the window: "Latest evaluated window · 12 h · ends {date}" or "Earlier window · …" | Result card |
| Strip label "Final conclusion" | "Result" | Strip that keeps the result in view |
| Pill "no verdict" | Removed. A window with no verdict shows Time in normal mode, Time at an OP limit and Data coverage instead | Result card |
| Pill "evidence score {n}" | Fact "Evidence score" | Result card |
| "Severity" | "Engine severity" | Result card |
| Eyebrow "Next-best action", heading "Engine recommendation" | Bar "Next check" with Start with evidence ↓. With no recommendation on a finding: "Compare PV, SP and OP over this window." (the old fallback sent the reader to this page) | Result card |
| "Basis" row | One line under "Why this result": "Confirmed from …" | Why this result |
| "Not checked" and "Limitations" rows | One list, "What is still unconfirmed" (a judged window) or "Limits on this conclusion" (a window not judged) | Beside the gates |
| "Reason" row on a window not judged | First line of "Limits on this conclusion", so it stays on screen | Beside the gates |
| "Reason —" row, "see Advanced below", "see Advanced on the conclusion card", "none — verdict fused cleanly" | Removed. A reason in words sits under Technical details; an engine string stays in the trace | Technical details |
| Collapsible "Reasoning chain — how the engine got there", "Eligibility → Evidence → Fusion · fused cleanly", the stage questions ("Is the window evaluable at all?" and the rest), the GOOD / WARN / BAD pill per stage | Removed. Five cards with a summary each, and the gates of the chosen card with their marks | Why this result |
| Summary "Leading: {cause} · {state}" on the closed Hypothesis comparison | Removed. Cause is on the result card, G14 under Technical details | Investigation |
| Eyebrow "Hypothesis comparison" above "Mechanisms and the evidence for each" and above "Family and detector scores" | Removed: the dialog title says it | Hypothesis comparison dialog |
| Eyebrow "Evidence", heading "Signals over the evaluated window" | Removed. The values and trend need no heading | Investigation |
| Eyebrow "Key facts", heading "Numeric evidence on this window" | "Numeric evidence", behind ?: "The measures stored on this window. A value the engine did not qualify shows why, never 0." | Numeric evidence |
| Eyebrow "Window browser", heading "Recent windows", ? "Newest first; pick one to make it CURRENT." | Removed. Dialog title "Compare recent {kind} windows" | Compare windows dialog |
| Eyebrow "Record it", heading "Loop notes", button "Save note" | "Record your review", "Save review". Replay keeps its words until its task | Investigation |
| ? "A note stays on the loop. Saving it never acknowledges…" | "A note stays on the loop and never changes the engine's result. Saving it never acknowledges…" | Loop notes, both pages |
| "evaluated window ›", "EVT-{id} ›" | "evaluated window ↗", "EVT-{id} ↗" | Loop notes, both pages |
| "Open in Evidence Replay ›" | "Evidence Replay ↗" | Trend foot |
| "Calculation proof ›" (to Calculations) | "Calculation proof →" in the Numeric evidence dialog, now with the window end | Numeric evidence dialog |
| "Reset" | "Full window" | Investigation trend; other trends keep Reset |
| "Pick a loop above — or a case, then a loop — to follow its evidence from raw signals to the fused conclusion." | "Pick a loop above, or a case under More and then a loop, to follow its evidence from raw signals to the fused result." | No loop chosen |

### Moved behind a ?

| Text | Now behind |
|---|---|
| The evidence-score paragraph ("Evidence score: how fully the observed symptoms match…"). A cap on this window's score stays on screen in the limits list: "Evidence score capped at 54: …" | ? on Evidence score |
| "(NE107: missing diagnostics are not OK)" | ? beside "No health data for this window — not checked" |

### New text

| Text | Where |
|---|---|
| Cause: "Not established", "Not qualified", "· not confirmed". ? "The title names what was observed. A valve, controller, process or instrument cause is a separate claim, shown here only when the engine qualified one." | Result card |
| "Last verdict {diagnosis} · {age}" (was the Last verdict row; same words) | Under the title, never as the title |
| Card summaries, built from `gateMark`: "All pass", "G1 · Excluded", "G3 attention · G4 pass", "G5 / G9 symptom seen", "Not seen", "Not seen on available data", "Not evaluated", "G12 / G13 not evaluated · G14 n/a", "G15 · Confirmed". Own words: "limit symptom", "Not applicable to this excluded case" | Why this result |
| "at window end" | Values above the trend |
| Finding: "Compare PV, SP and OP over the same window", "Inspect the checks contributing to this diagnosis", "Review evidence for the physical cause" | Next checks |
| Mode exclusion: "Confirm whether manual operation was intended", "Review how this loop entered manual mode", "Review the open output-limit condition" (only when G10 spoke). Other exclusions: "Review why this window was excluded", "Review this period" | Next checks |
| Short of data: "See the samples each window received", "Check the signal mapping", "Review when the data stopped". Not evaluated: "Check what the loop is still missing", "Check that the analysis engine is running". Healthy: "Review earlier windows" | Next checks |
| "Calculated values", "This gate reports a state, not a measured value." | Calculation proof dialog |
| "No other measure on this window." | Numeric evidence |
| "If manual operation was intended, the exclusion needs no change to the controller. If it was not, review the operator or logic change that took the loop out of automatic or cascade." | Mode context dialog |
| "No evaluated window is open", "Choose a loop first" (why Compare windows is off) | Header |

| Control | Now on |
|---|---|
| Source select (Live / Historical) | Removed. The window select replaces it: the newest window is the first option |
| Profile select (12h fused / 24h fused) | 12h / 24h toggle in the header, still `?profile=` |
| Evaluated window select | Always in the band (was only under Historical); pre-v2.5 and history-only windows are listed but not selectable there, and stay reachable in Compare windows |
| Analysis case | Under More in the band |
| Load older windows | Under More, and Older › in Compare windows |
| Window tiles and the Previous / Current table | Compare windows dialog, from the header |
| Hypothesis comparison | Dialog: from Record your review, and from Next checks on a finding. Holds the Observed, Possible cause, Evidence against and Not assessed rows |
| Key facts tiles | Numeric evidence dialog, View all measures → |
| Instrument health lane | Under the trend |
| Window span, Selected family, G14 confirmation, Reason, Disqualifiers, engine trace | Technical details & engine trace, closed; the trace opens with it |
| New: Calculation proof ↗, {gate} proof ↗, All 17 gate results →, Start with evidence ↓, Related events ↗, Mode context | Investigation |
| Chosen card and open gate | In the address, `?tier=` and `?gate=`; `?gate=` from Performance and Calculations now opens that gate |

## Task 14 fix round 1 (CHG-141): one vocabulary for a window's result

For the control engineer. `conditionOf` (`explorer/summary/summaryText.ts`) now takes its words from `diagnosisLabel` and agrees with CHG-092: NO_CALL and INSUFFICIENT_EVIDENCE are verdicts, the engine's only no-fault results. They have their own kind, `no-fault`: not "not evaluated", and not "healthy", because no fault identified is a diagnostic statement, not a performance one, so it stays grey. These words change on every page that reads `conditionOf`: Loop Explorer band, Summary card, gate dialog and trend band; Overview queue and top finding.

Two choices need your ruling. Each is built as stated and is a small change either way:
1. **The three facts on a no-fault window:** Good-error time, Time in normal mode, Data coverage. No evidence score, because `hasVerdict` forbids one there. No Persisting.
2. **Cause on a no-fault window:** "None identified", even when NO_CALL keeps a mechanism that fell short. That mechanism stays in Hypothesis comparison.

### Words on every page

| Diagnosis | Was | Now |
|---|---|---|
| NO_CALL | Not evaluated yet | No fault identified |
| INSUFFICIENT_EVIDENCE | Not evaluated: not enough data | No fault identified |
| EXCLUDED_* other than EXCLUDED_MODE | Excluded: loop not in automatic | Its real reason, for example "Excluded: outside operating region". EXCLUDED_MODE keeps "Excluded: loop not in automatic" |
| INSUFFICIENT_DATA, NOT_EVALUATED, findings | Unchanged | Unchanged |

| Was | Now | Where |
|---|---|---|
| Next check fallback on NO_CALL: "Wait for the next evaluation window, or check the loop's readiness if none arrives." On INSUFFICIENT_EVIDENCE: "Check that the loop's signals are arriving: the Window Inspector shows the samples each window received." | "No fault reached the evidence threshold; review the signals if the loop still performs poorly." | Explorer Summary, Investigation result card. Only when the engine wrote no recommendation |
| Next check fallback on a non-mode exclusion: "Nothing to assess while the loop is out of automatic; Historical shows when it ran in AUT or CASCADE." | "Nothing to assess on an excluded window; Historical shows what the loop was doing." EXCLUDED_MODE keeps its sentence | Explorer Summary, Investigation result card |
| Summary action on INSUFFICIENT_EVIDENCE: "Open Window Inspector ›" | "Why and what to do › Investigation" | Explorer Summary |
| Any measure on an INSUFFICIENT_EVIDENCE window: "Insufficient data" (too few qualified samples in the window) | The stored value, through the usual checks. INSUFFICIENT_DATA keeps "Insufficient data" | Every page reading `metricAvailability` |

### On Investigation

| Was | Now | Where |
|---|---|---|
| No-fault window: "See the samples each window received", "Check the signal mapping", "Review when the data stopped"; or "Check what the loop is still missing", "Check that the analysis engine is running" | "Compare PV, SP and OP over the same window" (Signals ↗), "Review earlier windows" (Compare windows ↗) | Next checks |
| No-fault window: Time in normal mode, Time at an OP limit, Data coverage | Good-error time, Time in normal mode, Data coverage | Result card |
| No-fault window: "{mechanism} · not confirmed" or "Not qualified" | Cause: "None identified" | Result card |
| No-fault window: "Limits on this conclusion" | "What is still unconfirmed", with the reason first | Beside the gates |
| "{which} window excluded (loop not in automatic)", "{which} window had insufficient data" | "{which} window {result in lower case}", for example "Current window excluded: outside operating region". Only for an exclusion or not enough data, no longer for a no-fault window | Compare windows dialog |
| No-fault loops counted under "Not evaluable" | Their own case, "No fault identified · {n}" | Case, under More |
| "Latest evaluated window" | "Latest window": it may be one that was not evaluated | Result card |
| "No open episode" while the episodes were unread or the request failed | "—". "No open episode" only when the list was read | Result card |

| Control | Now on |
|---|---|
| A no-fault window opens its card on | Diagnostic evidence (was Eligibility) |
| Related events ↗ | Carries the episode open at this window's end, `?event=`; with none, the loop only |
| Window select, picking the newest window | Drops `?window=`, so the page follows the newest again |

## Task 15 (CHG-142): Evidence Workbench, gate rail and run bar

### Removed or reworded

| Was | Now | Where |
|---|---|---|
| Header: eyebrow "Understand the cause · Evidence workbench", title "{loop} · {name} — {gate} {gate name}" | Eyebrow "Understand the cause", title "Evidence Workbench". The loop is in the band, the gate in the rail and the verdict card | Workbench header |
| Fact "Mode" with the pill FIXED (or FROZEN, REPLAY, COMPARE) | "{kind} pinned run", for example "12h pinned run". A pinned run is the run fixed in the URL, not the controller's mode | Run bar |
| Fact "Evidence" with the pill NONE ("EVIDENCE NONE") | Removed when nothing is held. When arrays are held: "Proof retained · COMPLETE" | Run bar |
| Evidence basis bar "No arrays held" | Removed. The bar speaks only of arrays that exist | Workbench |
| Pill "Not retained" above the state panel | Removed. The panel's heading "Evidence not retained for this run" says it once | State panel |
| Fact "Age: computed 20 min ago" | Removed from the bar (not in the reference's run bar) | Run bar |
| Fact "Coverage: 1,977 samples" | "1,977 samples" | Run bar |
| Fact "Run" with the copy button | "Run id ↗" (opens this exact run) and the copy button | Run bar |
| "EXPLAIN" heading of the right column | Removed. The column keeps its Hide and Show control, and its name for assistive technology | Explain column |
| "Read the evidence below; every value is this run's own, computed under the configuration named on the right." | Removed | Why this result |
| "The whole window: {result} — no gate on it carries a verdict." on a no-fault window (NO_CALL, INSUFFICIENT_EVIDENCE) | Not said. A no-fault window is judged; the sentence stays for too few samples and for an exclusion | Why this result |
| Reconstruct evidence: clicking it sent the request at once | A dialog first names the loop, gate, window and run; the request is sent on Reconstruct only | Workbench |
| "Reconstruction running…" in More | "Reconstruction requested…" on the run bar button, until the service acknowledges | Run bar |
| Verdict card eyebrow "Verdict" and a status pill | Eyebrow is the gate's tier; the status is a `GateBadge`; under the title, what the gate asks | Verdict card |

### Moved behind a ?

| Was | Now | Where |
|---|---|---|
| "The live path keeps the arrays for windows with a finding, at most once an hour per loop and window; Reconstruct rebuilds them from the run's window, labelled as rebuilt." | Behind the ? beside the heading "Evidence not retained for this run" | State panel |

### New text

| Text | Where |
|---|---|
| "Back to Investigation ↗" | Header |
| "Proof retained", "Loop result", "Calc version" | Run bar facts |
| "Reconstructing evidence needs the cpm.analysis.create permission" | Run bar and state panel, when the user lacks the permission |
| "Key" (opens "Gate status key") | Rail |
| "Evidence Replay ↗" | Foot |
| Dialog "Reconstruct evidence": Loop, Gate, Window, Run, Cancel, Reconstruct, Requesting…, "Reconstruction refused: {message}" | Dialog |

| Control | Now on |
|---|---|
| Gate dropdown (`GateMenu`) | Left rail, all 17 gates by tier with code, name and mark; a native select below 850 px |
| Gate key under the strip | Key button in the rail, opening a dialog |
| Reconstruct evidence (was under More) | Run bar |
| Newest, window kind, jump and Evaluate | Still under More |

## Task 16 (CHG-142): Evidence Workbench, four tabs

### Removed or reworded

| Was | Now | Where |
|---|---|---|
| The right "Explain" column, collapsed or open, with Hide explain and Show explain | Removed. Its content sits on the four tabs | Workbench |
| Strip "Verdict · G3 · {status} · {sentence} · Back to conclusion" under the run bar | Removed. The rail, the run bar and the verdict card already say it | Workbench |
| What the gate asks, under the verdict card title and again in the Explain column | Said once, on Rules & parameters | Verdict card, Rules & parameters |
| "Why this result" result sentence, repeated from the verdict card | Not repeated. The verdict card says it; on a loop with no valve position it says "this loop has no valve position, so it does not apply" | Proof |
| Next-action paragraphs under "Why this result" | Not repeated. The state panel under the inputs gives the next action once | Proof |
| "Evidence behind it" followed by "{n} samples of this run's window, {k} retained artifact(s) shown in the evidence section" | Removed. The run bar has the samples, the artifacts are on the page. "Evidence behind it" stays for the decision gate, with the cause breakdown | Proof |
| "The whole window: {result} — no gate on it carries a verdict." (too few samples) | "The whole window: {result} — not enough to reach a diagnosis." The gates of such a window read Insufficient evidence, which is a verdict word | Proof, What remains open |
| "The whole window: {result} — no gate on it carries a verdict." (exclusion) | "The whole window: {result} — no diagnosis was reached." | Proof, What remains open |
| Section "Evidence for G3 · name" with the line "The run's own artifacts for this gate: what it computed, and from what." | Removed. The artifacts follow the inputs table | Proof |
| Section "Signal context" with the line "PV / SP and OP / VP from the historian over this run's window - context, not the run's own qualification." | "Signal context, not retained gate proof." on its own tab | Signal context |
| "Configuration this run used ›" | "Configuration used by this run ↗" | Rules & parameters |
| "No retained artifact declares parameters for this gate{ yet}." | "No parameter was retained for this run." | Rules & parameters |
| Sections "Configuration": "The governed bundle this run ran under." and "Identity": "Run, bundle and source ids - copyable." | Removed. The headings say it | Rules & parameters, Identity & raw |
| Run id ↗ opened the run it was already on | Opens Identity & raw (`?sub=identity`) | Run bar |

### Moved behind a ?

None.

### New text

| Text | Where |
|---|---|
| Tabs "Proof", "Rules & parameters", "Signal context", "Identity & raw" | Tab row |
| "See rules & parameters →", "View signal context →" | Proof |
| Input table columns Input, Metric, Value, Unit; "{n} samples nominal at {p} s" | Proof |
| "This run is pinned: these are the parameters and configuration it ran under, not those in force now." | Rules & parameters |
| "Copy run ID", "Copy identity record", "Artifacts", Basis "Retained" or "Rebuilt", "Raw record", "No artifact is held for this run." | Identity & raw |

| Control | Now on |
|---|---|
| Hide explain, Show explain | Gone with the column |
| Configuration this run used | Rules & parameters, "Configuration used by this run ↗" |
| Bundle hash, Identity ids | Rules & parameters (bundle), Identity & raw (all ids) |
| Window flags card | Identity & raw |
| Signal context lanes | Signal context tab |
| Copy run id (icon beside Run id ↗) | Still on the run bar; "Copy run ID" also on Identity & raw |

## Task 17 (CHG-143): Evidence Replay, stages and cursor readout

### Removed or reworded

| Was | Now |
|---|---|
| Eyebrow "Summary" over the gate name | Removed. The card is headed Window verdict |
| "Input lineage" / "Where this evidence came from" and the four lineage boxes | Removed. The five stage tabs carry each stage's one info line |
| "— (not in this window's result)" for a metric the window did not store | "Not reported", inside the metric disclosure |
| "Recompute this loop from history" heading | "Re-run" |
| Title "Evidence replay" with the page task as eyebrow | "Evidence Replay" under "Understand the cause" |
| "Export package" | "Evidence package" (same export, same place) |
| Role pill, gate result pill and the "About this chart" ? in the loop band | Removed. Role is on the Gate checks tab, the result on the verdict card, the stage list is the tabs |
| Rows Window, Samples, Calculation in the Summary card | One identity line under the band: Original run · pinned (or Re-run id), samples, versions |
| Replay cursor time beside the slider | Removed. The readout under the chart gives the site-zone time once |
| Question row (what the gate asks, incl. "How confident is the final verdict?" for G15) | Behind a ? beside Selected check |

### Moved behind a ?

| Text | Now |
|---|---|
| What the selected check asks | ? beside Selected check |
| What a re-run does | ? beside Re-run (unchanged) |

### New text

| Text | Where |
|---|---|
| Tabs Raw historian, Normalize, Features, Gate checks, Fusion, with one info line | Above the chart |
| Readout PV, SP, OP, Mode, "Sample n / N", site time. Mode reads "Not recorded" when the slice stored none | Under the chart |
| Window verdict, Evidence check, Selected check, Time in AUTO (the window's G1 share, e.g. 60 %, else Not reported), Open retained proof ↗ | Right column |
| Evidence Workbench ↗, Run details ↗ (opens the Workbench Identity & raw tab) | Header, identity line |

| Control | Now on |
|---|---|
| Window select (native) | `EvidenceWindowSelect` in the band, with More (load older, jump) |
| 12h / 24h toggle | Band, far end (was header) |
| Gate select | Window verdict card, "Evidence check" |
| Gate catalogue retry | Top of the right column |
| Re-run this window | Right column (decision 3 and Task 18 change what it does) |
| Window start to end row | Removed; the band's window select names the window |

### Fix round 1

| Was | Now |
|---|---|
| Readout row Quality (never requested, always Not recorded) | Removed |
| Controller mode: In AUTO x % | Time in AUTO: x % (it is the window's share, not a mode) |

## Task 18 (CHG-143): Evidence Replay, re-run, evidence package, run details

### Removed or reworded

| Was | Now |
|---|---|
| Re-run `?`: "Submits the A8 historical replay job with this loop's current evidence flags and window alignment (~90 s round trip)…" | Removed. The card says "Check the configuration before creating a new run." and "Original evidence stays unchanged." |
| Button "Recomputing…" / "Recompute failed to start: …" | "Running…" in the dialog; a refusal reads "Not started" with the Evaluate wording |
| Re-run pill FINISHED / FAILED (state) | The run's state (QUEUED, RUNNING, FINISHED, FAILED) with the Evaluate status line in the dialog |
| Note link "evaluated window ↗" opened the loop's newest window | Opens that note's own window in the Workbench (`workbenchHref(loop, run, 'G15')`) |
| Evidence package: a loose JSON with the raw slice | One zip: manifest.json and evidence-package.json (the Historical page's package) |
| Run details ↗: Workbench Identity tab | Run details dialog |

### New text

| Where | Text |
|---|---|
| Re-run dialog | "It uses the window's governed bundle and today's engine build, so the result can differ from the original." |
| Re-run dialog | "Current configuration" disabled: "Not available in this release." |
| Re-run dialog, a run already made | "A run was already made for this window, so it was opened instead of a new one. Evidence is held 3 days." |
| Re-run button, disabled | "Needs the cpm.analysis.create permission"; "Only 4h, 12h and 24h windows can be re-run" |
| Run details | "Complete retention shows the proof was kept, not that it was sufficient." |
| manifest.json note | "This package records what was retained for the window. Retained evidence is not proof that it was sufficient." |

| Control | Now on |
|---|---|
| Re-run this window | Right column card; opens the Re-run dialog (Create run) |
| Open the new run ↗ | Re-run dialog footer, when the run has its stored result; opens it in the Workbench with `analysisRun`. The original stays on Replay |
| Evidence package | Header; opens the Evidence package dialog (Download package) |
| Run details ↗ | Identity line; opens the Run details dialog |

### Fix round 1

| Was | Now |
|---|---|
| Compare with the original ↗ (set `?rerun=`) | Open the new run ↗ (Workbench) |
| "It uses the window's governed bundle and today's engine build…" | "It uses the settings the window ran under, or the engine default if none are held, and today's engine build. The result can differ from the original." |
| Radio "Governed bundle of this window" | "Settings of this window" |
| Cached: status line and a second sentence | One sentence |
| Package dialog file list under the description | Removed |
| New: "Still running. Check again in a minute."; "The run ended without a stored result yet."; Check again; "Downloaded, but not complete: …" | Honest states |

## Task 19 (CHG-144): Window Inspector

### Removed or reworded

| Was | Now | Where |
|---|---|---|
| "Latest results", eyebrow "Emitted windows", "{n} loaded · newest first" | Removed; "{n} matching / {m} loaded" in the list bar | List |
| "from {date}" under each row; the end date on every row | Time of day "13:35 → 13:50"; the date once in a section head | List |
| "{n} samples"; "{n}% full"; "UNKNOWN" | Samples / nominal "181 / 180" with the ratio under it; Count check "Matches", "+1 sample", "−1 sample", "Declined", "Not reported" | List |
| "emitted {date}" | Stored (in the right column) | Selected window |
| Tick string per row (GateStrip) | Feature flags ↗ dialog naming G0, G1, G2, G2r, G3, G4 | Selected window |
| "‹ All 15m windows"; "Window 3 of 24 loaded · 15m · {loop}"; heading with the date and emitted line | Removed; the window is selected in the list and Previous / Next walk it | Detail |
| Section "Window results" / "What the selected window carried" | Record details ↗ dialog | Selected window |
| "Contract for the selected window"; Late events / Out-of-order events "— (DG-4: not recorded by the jobs)" | Engine & timing ↗ dialog (size / slide, lateness, minimum samples); the two DG-4 rows removed | Detail |
| "Window contract / What happens at each boundary" (On open, While open, On close) | Behind a ? in Engine & timing | Detail |
| "The engine declined to evaluate this window…" | Behind a ? beside the Declined tag | Detail |
| "Statistics are per window kind over its latest 12 emitted windows…" and eyebrow "Across window sizes" | Behind a ? in the heading; eyebrow removed | Compare |
| Sections "Sample density" and "Raw historian coverage across the window" | Sample density ↗ dialog; the raw slice is read only when it opens; "Bad-quality exclusion counts live in the G0 result…" removed | Detail |
| "Open range in Historical ›", "Open in Trend ›" | "Open range in Historical ↗", "Open in Trend ↗" in the Record details footer | Detail |
| "Rows appear once… or check Pipeline Health if they are overdue" | "…Choose another profile above."; the Pipeline Health link only for system.manage | Empty state |
| "CHECKING RUNTIME…" chip | Removed while metrics load; the runtime chip stays | Header |
| Profile options "15m — 15 min / 5 min slide" | "15 min · 5 min slide"; "1 min · tumbling"; "12 h · 15 min cadence" | Band |
| Title "Window inspector" | "Window Inspector" | Header |

### Moved controls

| Control | Now on |
|---|---|
| Newer / Older window buttons | Newer / Older in the list bar (Older loads the next page at the last loaded row) |
| Open range in Historical, Open in Trend | Record details dialog footer |
| Compare across window sizes | Under the list and the right column |
| Load older windows | Under the list |

### New text

| Where | Text |
|---|---|
| List bar | "Sample count" filter: All, Matches, Over nominal, Under nominal, Declined |
| Right column | Window, Received, Nominal ("derived" when not served), Ratio, Difference, Message (declined only), Tag (Short features, Long diagnostics), Stored; Inspect this window →; View record details ↗; Feature flags ↗ (short only); Engine & timing ↗ |

### Fix round 1

| Was | Now |
|---|---|
| Row "14:00 → 14:00" for a window that starts the day before | "3 Nov 14:00 → 14:00": the start date shows when it differs from the end date |
| A `?window=` not loaded, or hidden by the filter, selected the newest row | Selects nothing: "This window is not in the loaded list." (Load older windows, Show the newest window) or "This window is hidden by the Sample count filter." (Clear filter) |
| Filter with no match: bare header | "No window matches this filter." with Clear filter; Load older stays |
| Previous / Next | Newer / Older |
| Derived nominal marked only in the right column | "· derived" under the ratio in the list too |
| New: Sample density ↗ (dialog), Open in Trend ↗ built from the loop's tags | |

## Task 20 (CHG-145): Calculations

### Removed or reworded

| Was | Now | Where |
|---|---|---|
| Tiles "Metrics stored", "Evidence gates in the pack", "Gates acceptable", "Gates needing review", "Gates not evaluated" | Removed. "{n} gates · {r} need review · {m} not judged" in Run details ↗ | Page, Run details |
| "All types" filter (Calculation / Decision) | Category toggle: All, Control error, Actuator, Data & mode, Oscillation, Decision | Filters |
| "{n} result(s)" | "{n} shown / 19 available", and Clear filters when a filter is on | Filters |
| "Search {loop} calculations"; "Filter by gate"; "Filter by type" | Find calculation (placeholder "Name, ID or unit"); Gate; Gate result. The Gate list holds the gates of the chosen category | Filters |
| "{loop type} · profile {id}" (for example "FIC · profile default") | Removed. The loop control names the loop; the versions are in the band | Band |
| "Latest results · 12h fused window · start – end" | "12 h window · start → end" (`windowSpan`) | Band |
| Verdict pill beside the count | Verdict chip in the band, from `conditionOf` | Band |
| Columns ID and Gate; row descriptions; Window column | "CPLM-010 · G3" under the name; descriptions removed (the method is in the right column); the Window column went because the band names the one window every row belongs to | List |
| "Not measured", with its reason on hover | "Not calculated", with its reason as the second line | List, right column |
| "Not evaluated" for an INSUFFICIENT_EVIDENCE gate | "Insufficient evidence": it is a verdict (`gateMark`). The decision gate (G15) is judged by its window's diagnosis (`conditionOf` / `isJudged`) | List |
| "G3 pass · this value not measured" in the Gate result pill | With a value: the gate's own mark. With no value: a muted "{word} on other inputs", never a pass for a number that does not exist | List, right column |
| "Page 1 of 2", Previous, Next | Removed: all 19 on one list | List |
| `?` on Value: "Not measured: the engine version that wrote this window has no such metric…" | Removed: each row now says why it is Not calculated | List |
| Drawer tab "Definition": description, Contract (Loop, Gate, Kind, Stored in, Output unit, Engine, Calculation version, Dynamics profile) | Right column: name, id, value, unit, method, related gate. Loop is the band; calculation and profile versions are in the band and Run details; Kind, Stored in and Engine are in Record details | Right column |
| Drawer tab "Validation": "What produced this value" (Engine, Emitted, Window, Samples in window) | Window in the band; samples, run, bundle, engine build and computed time in Run details ↗; Engine (`calculationSource`) and Emitted (the feature row's `created_at`) in Record details | Run details, right column |
| "Is this value current?" (Stamped on this value, Deployed now, and the recompute sentence) | A warning in the right column only when the value's calculation version differs from the deployed one: "This value was written by v{a}; the calculation deployed now is v{b}. Recompute the window before citing it." The "No calculation version is stored on this row" sentence removed | Right column |
| "Has this been produced before?" (Gate observed in stored results; Window qualification; Evidence-score band; the catalogue note) | One closed "Record details" at the end of the right column, each row Not reported when absent. A value from a window that did not qualify also reads as its availability word ("N/A", "Insufficient data") with the engine's reason | Right column |
| Drawer tab "History": "Recent diagnosis history" (10 episodes) | Removed from this page; verdicts over time are in Historical | n/a |
| Modal drawer with Previous / Next calculation and Close | `ui/Inspector`: right column at 1280 px and up, a drawer below | Right column |
| "Select a loop … lists every stored metric…" | "Pick a loop above. The list then shows each calculation with this loop's latest value and the gate that judges it." | Empty state |
| "KPI rows unavailable — values below are missing, not absent" | "Window values unavailable — the values below are missing, not absent" | Error |
| Method text | New, one formula and one sentence per metric, written from the engine (`calcMethods.ts`). CPLM-020 is std(OP) ÷ std(PV). CPLM-003 and CPLM-014 count samples, not time. The catalogue descriptions of those three are corrected the same way | Right column |

### Moved controls

| Control | Now on |
|---|---|
| Window kind toggle (12h, 24h) | Header, with Back to Investigation ↗ |
| Gate result sort | The Gate result heading. The Calculation heading walks id, name A to Z, name Z to A, so id stays reachable; the Gate sort went with the Gate column |
| Open in the drawer: previous / next calculation | The list: click or arrow to another row |
| Run details | Band: Run details ↗ (dialog, in the body) |

### New text

| Where | Text |
|---|---|
| Header | Back to Investigation ↗ |
| Right column | Id, Value, Unit, Method (formula, sentence), Related gate, Signal engineering unit (metrics in PV units), the gate-versus-verdict sentence "{Gn} is the gate's own result. The window's verdict is {verdict}."; Open Gn proof → (disabled with "No run is stored for Gn on this window."), Retained value & identity ↗, Original configuration with `?` "Rules and thresholds belong to the selected run.", Inspect parameters ↗; Record details (closed): Window qualification, Evidence-score band, Gate in stored results, Catalogue note, Engine, Emitted, Stored in, Kind |
| Band | "Verdict unavailable" when the newest verdict could not be read |
| Values not stored | "The values for the window above are not stored, so every value below reads Not calculated." |
| Not stored | "That window is not stored" for a `?window=` the service holds no result for; Show the newest window |
| Run details | Gates row |

## Task 21 (CHG-145): System Response summary, empty state and event steps

### Removed or reworded

| Was | Now |
|---|---|
| "Events are captured from qualifying setpoint or output changes; none qualified in the retained period. A system model needs at least one accepted event." (two copies: full width and centre) | One panel "No qualifying response event": "A qualifying setpoint or output step is needed before a model can be estimated." Censored candidates are stated in one line when there are any |
| "Step-test settings (Gate Configuration › G12)" | "Check G12 settings" (button, only with cpm.config.read, opens that loop's Effective view at G12) |
| "Setpoint changes in Historical" | "Review setpoint changes →" |
| "No system model for this loop. A model is estimated from an accepted response event…" (Model history empty state) | The System model tile reads None (no accepted event) or Not estimated; the Model history panel is absent with no models |
| "Model review needs the cpm.model.review permission." (paragraph under the page) | The same sentence as the reason shown with each disabled Review button |
| G12 evidence view: "G12 is event-keyed: its evidence (...) belongs to a response event, not a window. Open the response workspace for the event; the artifacts of this run are listed below by the generic renderer." | Behind a ? on the panel head. Button "Open in System Response →" (was ›, and a full page reload) |

### Moved or new

| Control | Now on |
|---|---|
| Open loop ↗ | System Response band, after the loop control |
| Event row click | Sets `event` in the address (no navigation away) |
| Model history rows | Grouped under Candidate, Validated, Baseline, Other |

| Where | Text |
|---|---|
| Tiles | Response events; Accepted events (each with "loaded", plus "n censored not counted" when the list hides them; "None loaded" past one page with no accepted event); System model. Each tile links to the list or Model history |
| Empty panel | Response analysis; four steps (1 · Capture, 2 · Qualify, 3 · Estimate, 4 · Review) |
| Dialog | Event states explained ↗: Accepted, Rejected, Ineligible, Censored; "Every event shows its rule and reason. No model is created without an accepted event." |

## CHG-145 section 3 page polish, each fact once

### Removed, reworded or moved

| Page | Was | Now |
|---|---|---|
| Calculations | "computed on a window that failed data qualification" under the value on every one of 19 rows | Said once, in one line above the list, when every Insufficient data row gives the same reason (two or more rows). Rows show "Insufficient data" or "Not calculated". A reason that belongs to one metric stays on its row |
| Calculations | "Not usable on other inputs", "Symptom seen on other inputs" (the long pill overflowed the panel edge) | "Not usable", "Symptom seen", muted. Only Pass keeps the phrase: "Pass on other inputs" |
| System Response | "n censored" said four times: two tile notes, the Events card paragraph, the analysis panel | Once: the Response events tile note "n censored not counted", only when n is above 0. The Accepted events tile has no note |
| System Response | Tile note "loaded" | Removed (the "n+" count already says a page limit) |
| System Response | Events card: "No complete response event yet - the n captured candidates were censored (superseded by a later change, or a source gap). Show them to read each reason." | Removed. The Show n censored candidates button stays |
| System Response | Analysis panel: "n captured candidates were censored. Show them in the list to read why." | Removed. "A qualifying setpoint or output step is needed before a model can be estimated." stays |
| Evidence Workbench | Proof window line: "8,619 samples nominal at 5.012 s" | "Nominal 8,619 samples at 5.012 s" (omitted when no sample period is served, as before) |
| Evidence Workbench | Run bar fact "Calc version" with the 40-character build hash | "Calculation v3.0.0 · profile v2.0.0", the words Replay and Calculations use. Omitted when the window's row is not read. The hash stays on Identity & raw as Build commit |
| Evidence Workbench | "Evidence not retained for this run" with the ? alone on the next line | The ? beside the heading |
| Evidence Replay | Verdict card row "Selected check" showing the check name again beside its mark | Row "Check result" showing the mark only; the name is in the dropdown above |
| Evidence Replay | Raw historian stage line: "series · n samples" | The series path only (the identity line has the sample count) |

### Moved or new

| Control | Now on |
|---|---|
| Run details ↗ (Calculations) | Stays inline after the band's facts; the facts wrap among themselves |
| Run details ↗ (Replay) | Stays on the identity line (the 64-character line limit no longer applies there) |
| Count check pill (Window Inspector) | Fits its content; the selected row's pill has the same outline as the others |

## Task 23 (CHG-147): Loop Registry list

### Removed, reworded or moved

| Page | Was | Now |
|---|---|---|
| Loop Registry | Title "Loop registry" with the sentence "Add individual loops or validate a bulk registry import. Onboarded loops are evaluated immediately; the readiness report is the activation gate." behind the first ? | "Loop Registry"; the one ? holds the readiness-gating fact (G14 needs a VP tag, G13 needs peers) |
| Loop Registry | A second ? "About readiness-gated configuration" (two paragraphs) | Merged into the one ? beside the title |
| Loop Registry | Eyebrow "Registered assets" over "{n} control-loop records" | Heading "Loop assets" with "{n} loops" |
| Loop Registry | Find box "Find by loop, service, area, unit or type" | "Find loop" (it still matches loop, service, area, unit and type) |
| Loop Registry | Columns Loop / service, Loop model (registry), Type, VP, Profile, State | Loop (service under it), Loop type, VP. Model, Profile and State leave the list; they stay in the loop's page |
| Loop Registry | Empty panel "Select a loop - Pick a loop in the registry list to see its profile, signal mapping and readiness, and to edit it." | Removed. Until Loop Detail lands, `?loop=` shows the profile panel full width under "← Loop Registry" |
| Loop Registry | The "Inactive" state pill on every inactive loop | Inactive loops are retired loops: hidden by default, "Retired" pill when Show retired is on |
| Loop Registry | Configuration limits section on Overview (heading, eyebrow "Readiness", Open Loop Registry button, bullet list, plant-facts paragraph) | One line on this page: "{n} valve positions expected but not mapped", "{n} peer links expected but missing"; what each means and the plant facts sit behind a ? |

### Moved or new

| Control | Now on |
|---|---|
| Configuration limits (ReadinessStrip) | Loop Registry, above the list (it was not mounted on Overview any more) |
| Show retired | Loop assets heading, beside Find loop (URL `retired=1`) |
| Search and page | The URL (`search`, `page`), so Back from a loop returns to the same list |
| Add loop, Bulk import | Header; disabled with "Needs the cpm.manage permission" under the button without that permission (they were always enabled in the UI before) |

### Task 23 fix round 1

| Page | Was | Now |
|---|---|---|
| Loop Registry | Configuration limit counts as plain text | Each count is a link: `?gap=vp`, `?gap=peers` list only the loops behind it, with one line "Loops with {gap}." and Clear |
| Loop Registry | "{n} loops" under the heading | "{n} loops" beside Show retired, with " · {k} retired hidden" when any are hidden |
| Loop Registry | No state shown | One pill beside the loop name only when abnormal: Degraded, Not monitored, Retired |
| Loop Registry | A read failure removed the limits line | "Configuration limits unavailable" with Retry |

### Task 24 Loop Detail, edit and retire

| Page | Was | Now |
|---|---|---|
| Loop Detail | "Assigned profile" eyebrow, loop id as title | Loop id as the page title; no eyebrow |
| Loop Detail | "(declared)" / "(preset from loop type)" beside Loop model | Behind a ? beside Model: "Declared by a person in the registry." / "Set from the loop type; declare it in the registry to make it explicit." |
| Loop Detail | "G9 geometry is supporting-only. It cannot create a stiction suspect without qualified independent evidence." under the role list | Behind the ? on the Gate role policy heading, same words |
| Loop Detail | Site / area / unit | Plant path |
| Loop Detail | Valve position: free text ("None on this loop — G14 does not apply") | Applicable · mapped, Expected · not mapped, Not installed, Not applicable |
| Loop Detail | Peer links: "None — expected; G13 not evaluated" | "None · expected" or "Not applicable" |
| Loop Detail | Acquisition: "· grid undeclared" | Same words; "Not served" when the registry sends no model |
| Loop Detail | Observability: CLEAR pill or flag pills | Same, on the Facts section |
| Loop Detail | Readiness was not on the aside (only in the wizard after saving) | Readiness section: each check not met by name with its message, or "Nothing missing" |
| Loop Detail | Objective / topology / command | Same row in Loop model |
| Retire | No such control | Dialog: "The loop stops being monitored. Its history stays, and Restore brings it back." Restore: "The loop is monitored again as it was before it was retired." |
| Retired loop | Inactive | "Loop retired" pill in Facts; "Open episode" row with "Loop retired" when an episode is still open |

| Control | Now on |
|---|---|
| Edit loop | Loop Detail header, as Edit configuration (needs cpm.manage, reason under the button) |
| Evidence workbench › | Loop Detail, Evidence → |
| Effective configuration › / Hide effective configuration | Loop Detail, Effective rules ↗ (opens Gate Configuration for the loop; the inline drawer is not on this page) |
| View in plant tree ↗ | Loop Detail Plant path row, Plant tree ↗ (asset.view) |
| Re-project links & republish evidence, with its receipt | Loop Detail, Loop model section (receipt under the header) |
| Gate role policy rows | Loop Detail, last section (`config/GateRolePolicy.tsx`) |
| Add loop, Bulk import | Loop Registry list only (the header carries them there) |
| Open loop | Loop Detail, Open loop → |
| Retire, Restore | Loop Detail header |

### Task 25 Gate Configuration

#### Removed, reworded or moved

| Was | Now |
|---|---|
| Eyebrow "Set up · Gate configuration" over the loop's name; title "Gate configuration" or the loop name | Eyebrow "Set up", title "Gate Configuration" on the overview and on a loop (the loop is in the band) |
| Overview header sentence "What each loop runs under, the bundles in progress, and the editor for one of them." plus the catalogue line ("n properties · n worker(s) announced") | The sentence is behind the ?. The counts are in Technical details. "a worker runs ANOTHER catalogue" stays on screen as a status line |
| Loop header sentence "What this loop runs under today, the bundles at its three levels, and the editor for one of them." | Behind the ? |
| Fact row: runs under, profile, workers, catalogue (with the copyable bundle hash and catalogue hash) | Three tiles: Effective layer, Profile, Worker alignment. Bundle hash, catalogue hash, property count, workers announced and worker jars are in a closed Technical details |
| Worker text "n of m applied · one jar 4ea1da78 · catalogue matches" | "n of m applied" with "one jar · catalogue matches" under it; the jar id moved to Technical details |
| Eyebrow "How the values resolve" over "Layer stack" | "Where each value comes from" (no eyebrow). The ? sentence stays |
| Property table columns property, value, from, class; the CFG id and unit under the name | Property, Value, Source. The class sits under the name. The id, unit, type, factory default, what it does and not-read-by-build are in a dialog that opens from the property name |
| Bundles heading: eyebrow "Bundles", title "The three levels of this loop", "the most specific active level wins" | Title "Bundles". "The most specific active level wins" and the three level lines ("Overrides the profile for this loop only.", and the PROFILE and SITE lines) are behind the ? |
| Per-level draft note box with New draft / New version, and the "Drafting a bundle needs cpm.config.draft." line on each level | One Prepare bundle draft button with a dialog (level, note). Disabled without cpm.config.draft with the reason beside it |
| New text | Callout "Nothing changes for a loop until a bundle is published." and the strip Draft → Review → Publish |
| Deployment `semantics` line under each deployment | Inside the deployment's worker-acknowledgement disclosure |
| Gate role policy on Loop Detail | Gate Configuration (overview and loop pages, never the editor), unchanged |

#### Moved or new

| Control | Now on |
|---|---|
| New draft / New version (per level) | Prepare bundle draft dialog on Bundles; the parent is still the newest version of the chosen level |
| Open loop ↗ | The loop band's end, Gate Configuration |
| Effective layer and Profile tiles | Link to the loop's Bundles view |
| Worker alignment tile | Opens the APPLY acknowledgements disclosure on Effective |
| Gate role policy | Gate Configuration |

### Task 26: Trend (CHG-149)

#### Removed or reworded

| Was | Now |
|---|---|
| `0 pens`, `1 pen` beside the mode label | Removed |
| `No tags selected` in the legend | Removed; an empty chart says Choose a loop (Choose a loop is hidden without analytics.view) |
| `LIVE` on a chart with no pens | LIVE shows only while the chart has pens; PINNED WINDOW is unchanged |
| Page title `Trend` in its own bar | Header: eyebrow Engineering, title Trend |
| New: `{loop} has no signal tags mapped.` | Shown when a chosen loop has no PV, SP, OP or VP tag |

#### Moved or new

| Control | Now on |
|---|---|
| From, To, Apply window, Live ›, pinned and live label | Inside the loop band, after the loop control (a plain row without analytics.view) |
| Loop selector | The loop band, Trend (needs analytics.view) |
| Open loop ↗ | The loop band's end, Trend, once a loop is chosen |

### Task 27: Pipeline Health

#### Removed, moved behind a `?`, or reworded

| Was | Now |
|---|---|
| Eyebrow `Runtime internals` | Removed |
| `The Flink/Kafka runtime that produces every verdict. This view is read-only…` | Unchanged text, behind the title `?` |
| `One row per supervised job` (eyebrow `Required jobs`) | Observed jobs |
| `Latency / backpressure / parallelism are not exposed by the proxy — shown as "—", not estimated.` | Behind the Observed jobs `?`, with the MISSING rule; the cells read Not exposed |
| `—` for a value the page does not have | Not exposed |
| `not exposed by the metrics proxy` (Watermark lag, Kafka consumer lag tiles) | Telemetry card rows, value Not exposed (with Latency, Backpressure, Parallelism) |
| `analysis engine answering (JobManager)` | `analysis engine answering`; `(JobManager)`, its address and the unexpected-job list in Technical details |
| `Checkpoint success` tile (%) and `Managed state` tile | Checkpoint age and Checkpoints ok / failed tiles; state size is in the job dialog |
| `Prove the pipeline with a real round trip` | End-to-end verification |
| `Submits an A8 recompute on {loop} (first monitored loop) and waits…` | Behind the verification `?`; the loop is chosen in the setup dialog |
| `Round trip: Completed in Ns · replay {id}` | Round trip, Analysis run (the real run id); replay id and engine job id in Technical details |
| `Where a sample becomes a verdict` and its Source / Compute / Store boxes | Behind the Telemetry `?`; Last fused verdict stays a row |
| `Checkpoint behaviour while this page is open`, `Where this history comes from`, `N sample(s) · 20 s cadence` | Checkpoint history disclosure (closed): `Held only while this page is open` |
| `REQUIRED JOBS RUNNING` header pill | Removed; the Required jobs tile says it |
| Role, Last ckpt duration and State size columns | In the job dialog |
| `(Flink JobManager did not answer.)` and `(No required job matched the Flink job overview.)` | Removed from the empty states |

#### Moved or new

| Control | Now on |
|---|---|
| Run E2E verification | Run end-to-end verification, opens a setup dialog (loop control, Start verification); still needs cpm.manage |
| A job row | Job name opens a read-only dialog |
| Checkpoint chart | Closed disclosure on the Telemetry card |


### Task 28: Administration

#### Removed, moved behind a ?, or reworded

| Was | Now |
|---|---|
| `System Administration` page heading and the inline tab strip with icons | WorkspaceHeader (System, Administration) and `ui/Tabs`; no tab icons |
| Tab labels `User Management`, `Roles & Permissions`, `Data Sources`, `Plant Model`, `Tag Aliases`, `Audit Log`, `System Settings` | `Users`, `Roles & permissions`, `Data sources`, `Plant model`, `Tag aliases`, `Audit log`, `System settings`; `Alarm Feed`, `Alarm Rules` become sentence case |
| `User Management` heading and `Manage user accounts and roles` | Removed; the count line `n users · n active · n inactive` stays |
| Users columns `Username`, `Full name`, `Email`, `Role`, `Status`, `Created` | `User` (username over full name), `Role`, `Status`; Email and Created in the row dialog |
| Role badges in red, amber and blue (`ROLE_STYLE`; SuperAdmin fell back to Viewer) | One neutral badge for every role |
| `Source Configuration` heading | Removed; the tab names it |
| `Configure OT data sources - MQTT broker connections consumed by the ingestion service` | Behind a ? beside the search |
| One card per data source | Searchable list and the selected source's detail |
| Plant model heading `Plant Model` and `The UNS asset tree - the source of truth every binding, trend, filter and loop location resolves against. Path segments are permanent identity; names are labels.` | Removed; the tab names it |
| Plant model five-stage strip, always shown, and `The onboarding order - each stage feeds the next (docs/plant-model/production-onboarding-flow.md)` | The strip is behind a ? and loads on open; the sentence is `Each stage feeds the next.` |
| `Tag Aliases` heading | Removed; its ? stays |
| `Roles & Permissions` heading | Removed; its ? stays |
| `Global System Settings` heading and `Not functional yet - these settings are not connected to the backend and cannot be saved. Values shown are illustrative defaults, not the running configuration.` | Removed; each value reads Not connected and the disabled Save settings says why |
| Card titles `Data Retention`, `Infrastructure & Export`, `UI & Diagnostics` with emoji icons and descriptions | `Data retention`, `Backup and export`, `Interface and diagnostics`; no icons, no descriptions |
| Invented values 30, 365, `/mnt/backups/ams`, nightly export on, `Industrial Dark`, `Information` and their inputs | Not connected |
| `Save unavailable` | `Save settings`, disabled, reason on screen |
| Audit Log tab (AuditExplorer, unreachable behind the Governance redirect) | `The audit log is on Governance.` and Open Governance → |

#### Moved or new

| Control | Now on |
|---|---|
| Edit user, Delete user | The user row dialog (opened from the name); Delete keeps its confirmation |
| Email, Created | The user row dialog |
| Data source Test, Edit, On/Off, Delete, connection fields, MODE map | The selected source's detail |
| Configuration id, client id, version | Technical details in the source detail |
| Plant model onboarding strip | Behind a ? on Plant model |
| Open Governance → | Audit log tab (`admin.audit.view`) |

## CHG-149 section 4 page polish

### Removed, reworded or moved

| Page | Was | Now |
|---|---|---|
| Loop Registry | "Degraded" pill on nearly every row | Removed. Rows keep Not monitored and Retired only |
| Loop Registry | Limits line with two counts | A third count "{n} degraded" linking to `?gap=degraded`; the list filter reads "Loops with a readiness gap (degraded)" with Clear, as the other two |
| Gate Configuration | Pill under the table: "5 workers on one jar dabe1862 · factory layer (nothing to acknowledge)" beside "APPLY acknowledgements" | The summary reads "APPLY acknowledgements" only. The workers and their jar ids are in the disclosure's table. The Worker alignment tile still opens it |
| Trend | "LIVE" in the page controls and in the time bar | One LIVE, in the time bar, only with fresh samples. No pens: nothing. Pens but no new samples: "NO NEW SAMPLES". PAUSED, HISTORICAL and PINNED WINDOW unchanged. Chart and dialog bars keep today's rule |

## Task 29: Governance (CHG-152)

#### Removed, moved behind a ?, or reworded

| Was | Now |
|---|---|
| `Change control` eyebrow | `System` |
| `Immutable audit trail` eyebrow and `Governance events` panel heading | Removed; the page heading says it |
| `Immutable cryptographically-chained record of all operator and system actions.` | Removed |
| `Entries are hash-chained by audit-service. Run a verification to confirm integrity now. This page makes no standing claim.` | Behind the ? on Audit integrity: `Entries are hash-chained by audit-service. Verify audit chain asks the service to walk the chain and shows its answer.`; on screen `Not verified in this session.` |
| `CHAIN OK` pill and `Chain verified just now.` after a click | Removed: the dialog shows audit-service's own sentence and `The chain range, entry count and algorithm are not served, so this answer cannot be checked here.` |
| `Find by user, action or entity` | `Find event` |
| `{n} total · showing {m}` beside the filters, and the paging statement | One foot line: `newest 200 of 4825, older entries are not fetched` (numbers from the response) or `{n} events`, then `times in {zone}` |
| Columns Timestamp, Event type, User, Entity, Hash signature, Correlation | When / actor, Action, Entity |
| `Version provenance` / `What is producing today's verdicts` | `Change traceability` |
| `Engine builds observed` row | Engine build rows under Technical details |

#### Controls that moved

| Control | Now on |
|---|---|
| Verify cryptographic chain | Governance header as Verify audit chain, opens a dialog |
| Hash signature, Correlation | The audit event dialog (row opens it) |
| Loop link from a loop event | Open loop ↗ in the event dialog |

## CHG-152 page titles read as the sidebar

| Page | Was | Now |
|---|---|---|
| Pipeline Health | Pipeline health (no eyebrow) | Pipeline Health, eyebrow System |
| System Response | System response | System Response |
| Overview | Operations overview | Overview |
| Loop Events | Loop events | Loop Events |
| Loop Explorer | Loop explorer | Loop Explorer |

## CHG-153 final review fixes

| Where | Was | Now |
|---|---|---|
| Evidence Workbench, link for a 15m, 5m, 1m or 4h run | Back to Investigation ↗ (opened a 12h window) | Back to Window Inspector ↗ (opens that kind and end) |
| Evidence Workbench, Evidence Replay for a 15m, 5m, 1m or 4h run | Evidence Replay ↗ (opened a 12h window) | Evidence Replay ↗ disabled, reason: Replay holds 12 h and 24 h windows |
| Evidence Replay, address names a kind other than 12h or 24h | showed the 12h window | Title: Replay holds 12 h and 24 h windows. Copy: Replay cannot open a {kind} window. Open it in the Window Inspector, or replay a 12 h or 24 h window. Actions: Replay 12 h windows; Window Inspector |
| Loop band, loop picker | no mark for a retired loop | Retired pill beside the loop and beside it in the list |
| Historical, Selected window, Evidence score of a no-fault window | No verdict in this window | Not stored |

| Control | Now on |
|---|---|
| Pipeline Health links (Investigation, Replay, Performance, Explorer Summary, Calculations, Loop KPIs, Readiness causes, Overview loop focus, Next checks, Case triage) | shown only with system.manage |
| Plant tree ↗ (Loop Registry detail) | shown only with asset.view and an administration permission |

## CHG-153 second pass

| Where | Was | Now |
|---|---|---|
| Evidence Workbench, link for a response (G12) run | Back to Window Inspector ↗ (profile event) | Back to System Response ↗ |
| Historical, Evidence score of a no-fault window that has a score | Not stored | the score |
| Evidence Replay refusal, Window Inspector link | no window | carries the window end |

## CHG-154 open small items, batch A

| Where | Was | Now |
|---|---|---|
| Overview queue loop tag | accessible name "X →" | visible text unchanged; accessible name "Review X" |
| Performance headline, good-error sub-line and basis line, one loop | Mean · 1 assessed loops / 1 of 1 assessed loops contribute | Mean · 1 assessed loop / 1 of 1 assessed loop contributes |
| KPI drill-down, capability list of a picked day | No loop is in this KPI | Not stored for that day |
| Performance matrix, Result cell | tooltip "last verdict …" | no tooltip (the band and the dialog say it) |
| Loop KPI dialog, Inspect Gn → when the served row has no Gn | opened nothing | disabled, reason "No Gn result in this window" |
| Loop Explorer, Loop Registry link in the tree | Loop Registry › | Loop Registry ↗ |
| Readiness bar causes, Loop summary Show on trend, Loop trend panel (Show evaluated period, Show only that window), Evidence basis (Open the rebuilt run), Long and Short views (G5, G7, G10, G12 links), Gate result state (Open the 15m windows), Gate Configuration queue (Open), System Response (Open in Evidence Workbench), Overview/Explorer primary action (Open Window Inspector, Open Historical, Why and what to do → Investigation), Calculation proof → Workbench, the Toggletip Full calculation link, the page next-step links | › | → |
| KPI rows table links (Loop, Window, Trend), Effective configuration drawer (Open in Gate Configuration) | › | ↗ |

| Control | Now on |
|---|---|
| Result link of each Performance matrix row | the row's arrow-key model (End reaches it), not a tab stop of its own |

## CHG-154 open small items, batch B

| Where | Was | Now |
|---|---|---|
| Historical, Evidence package disabled reason, window inside 14 days but past the newest 500 | Only windows from the last 14 days keep every gate and metric; this one has a summary | Only the newest 500 windows of a range keep every gate and metric; this one has a summary. Narrow the range to reach it (the 14-day wording stays for an older window) |
| Historical, Apply zoom to range | Apply zoom to range › | Apply zoom to range → |
| Loop Registry, count line, one loop | 1 loops | 1 loop |
| Investigation, signal strip when a stalled feed ends the window on empty buckets | at window end | last values at <time> |
| Investigation, Compare windows, previous window could not be read | The previous window (ends …) has no full stored result to compare against | The previous window could not be read. |
| Investigation, Compare windows, history-only tile | looked and acted as selectable | disabled, dashed border, title "History only: no full stored result to open here. Use Evaluate a window." |
| Evidence Workbench run bar, failed or expired retention | Proof retained · FAILED / Proof retained · EXPIRED | Reconstruction failed / Reconstruction expired |
| Replay, cursor readout on a truncated slice | Sample 5 / 200,000 | Sample 5 / 200,000 loaded |
| Replay, cursor readout, numeric mode | Not recorded | the stored value |
| Replay, re-run refused with 409 | The request matched a run that cannot be reused. Try again. | This window matched a run of another loop, so it cannot be used. Trying again will not help: report it to an administrator. |

| Control | Now on |
|---|---|
| Open range in Historical, Open in Trend (Window Inspector) | the selected-window panel's links; removed from Record details |

## CHG-154 small items follow-up

| Where | Was | Now |
|---|---|---|
| Historical, Export menu, selected window has only a summary | Choose an evaluated window first | the reason the Evidence package button gives (newest 500 / last 14 days) |
| Investigation, Compare windows, history-only tile | reason only in the hover title | also a visible line "History only: use Evaluate a window" |

## CHG-155 owner review: Overview and KPI drill-down

Removed on the owner's instruction (8 Nov): the change since 24 h ago on every KPI card, in the drill-down band, in the number's `?` ("Since 24 h ago") and in the loop KPI dialog ("Change"); the Loop state breakdown bar with its legend links (Stale ( ), Never evaluated ( ), Not assessable ( ), Oscillating ( ) and the rest) and its `?` "How the states are decided"; the `?` "Last updated" beside the monitored count; the "matches the KPI" and "matches that day" pills; the loop description and section in the drill-down's loop column.

| Where | Was | Now |
|---|---|---|
| Overview, count above the cards | 241 loop(s) monitored (a panel heading, with a `?`) | 241 loops monitored (a small note, no `?`) |
| KPI drill-down band | 165 / 241 monitored loops 68 % | 165 of 241 monitored loops · 68 % |
| KPI drill-down, measure heading when every row shares the limit | Age of the newest result | Age of the newest result · above 60 min |
| KPI drill-down, measured value in a row with a shared limit | 86 days — above 60 min | 86 days |
| KPI drill-down, Window column | 13/08/2026, 19:30:00 UTC | 13 Aug · 19:30 |
| KPI drill-down, Verdict column on Stale and Never evaluated | Stale / No result yet in every row | Gone; the KPI's name says it |
| KPI drill-down, Also check column when no row has anything | — in every row | Gone |

## CHG-156 owner review: Performance

Removed on the owner's instruction (8 Nov): the `?` on the Performance title; the symbol row above the gate matrix with its Full key button (How to read holds the key); the count line "Showing 1–15 of 165"; in the gate dialog's More about this gate, the "Calculation v3.0.0 · profile v2.0.0" line, the "Contract" label and the Source and Emitted rows.

| Where | Was | Now |
|---|---|---|
| Performance, list toolbar | Needs attention, Any result, Any condition, search, sort | search, Needs attention, Any result, Any condition, sort |
| Performance, Findings / Gate matrix toggle | at the end of the toolbar | top right of the Gate summary panel, beside How to read |
| Performance, list larger than the matrix serves | Showing 1–15 of 165 · matrix serves the first 500 of 620 loops in scope | The matrix serves the first 500 of 620 loops in scope. |
| How to read | a key and three steps with no headings | two parts, "Gate symbols" (the key in two aligned columns) and "Using this page"; the peer-link note set apart |
| Gate dialog, foot | Previous gate G0 / Next gate G2 | Prev / Next (the gate is named on hover) |
| Gate dialog, foot (Performance) | Review PIC10201 → | Review → (the loop is in the title) |
| Gate dialog and selected-loop band, result whose last verdict is the same | Oscillation confirmed evidence score 100 last verdict Oscillation confirmed · evidence score 100 · 43 days ago | Oscillation confirmed evidence score 100 (the band adds · 43 days ago; the dialog's Assessment row has the date) |
| Pager, every page | 40 px buttons | 32 px buttons |

## CHG-157 owner review: Overview title, More about this gate

Removed on the owner's instruction (8 Nov): the `?` on the Overview title; in the Loop Explorer gate dialog, the second workbench button under More about this gate (its foot keeps Evidence Workbench →).

| Where | Was | Now |
|---|---|---|
| Gate dialog, More about this gate | Open in workbench → / Open in Evidence Replay → / Open full loop ↗ (raised and outlined buttons) | Workbench → / Replay → / Loop ↗ (flat links under a line) |
| Gate dialog, More about this gate | parts touching each other | space above each part |

## CHG-158 owner review: Loop Explorer

Removed on the owner's instruction (10 Nov): the `?` on the Loop Explorer title; the site / area / unit groups in the loop list (the header scope sets them); "Latest 12h ·" in the band (the page switch says the window, and the window end is said once); the gate key printed under the gate tiles (Gate key opens it); in the Loop summary dialog, the loop name, type, criticality, location and instrument health line, "The newest window has no verdict.", the age after the last verdict's window, "loop criticality …" beside the severity, and the age repeated in the Data row.

| Where | Was | Now |
|---|---|---|
| Loop Explorer title | Loop Explorer `?` | Loop Explorer |
| Band, result | Latest 12h · 7 Nov · 11:45 · Not evaluated: not enough data · persisting 36 days · window ended 3 days ago | Not evaluated: not enough data · window ended 3 days ago (time on hover), then persisting 36 days on the line under it; a recent window: window ended 10 Nov · 11:45 on that line |
| Band, buttons | Review evidence → / Open details (flat) | Review evidence → / Open details (outlined) |
| Summary tab | Loop model & setup → on a row of its own | Loop model & setup → at the end of the tab row |
| PV, SP, OP, Mode | value, then "%" under OP; "last stored 3 days ago" once beside the signal quality | value with its unit beside it; under each value: live / last received … / from historian / last stored … |
| Trend toolbar | Historical ↗ at the end; Show evaluated period →, Compare with previous window, Compare with now on rows under it | Historical ↗ and Trend ↗ after Live; the evaluated-window buttons at the end of the toolbar |
| Gate results | key under the tiles with Full key | Gate key button in the panel head |
| Loop summary dialog, title | Loop summary · FIC10401 | Loop summary |
| Loop summary dialog, last verdict | The newest window has no verdict. Last verdict: X, window ending … (3 days ago). | Last verdict: X · window ending … |
| Not producing verdicts | n to fix · n blocking (text) | n blocking, n to fix (marked counts); each cause's kind as a marked word; opens closed |
| Basis and limitations | its summary line under the closed box | its summary line inside the box, under the label |
| Loop Explorer, no loop chosen | the Loops list on the left; "Pick a loop in the list to open its summary, signals, calculations and history." | the loop control in the band at the top ("Choose a loop"); "Choose a loop above to open its summary, signals, calculations and history." |
| Loop not in the registry | … Pick a loop from the list, or check the Loop Registry. | … Choose another loop above, or check the Loop Registry. |
| Signals tab | second line: the UNS path; foot: signal quality, "Asset-model binding RESOLVED" | second line: what the signal is ("The flow currently measured on this loop."), the path on its hover; foot: Signal bindings → and Open signals in Trend ↗ only |
| Calculations tab | "12h window ending …"; no window choice; Inspect → on every gate; foot: Short windows ↗ and Full catalogue → | head "Latest fused 12h window · ended …" / Gate outcomes (short: "Latest 5m short window · ended …" / Per-window features) with the Window dropdown (Fused verdict 12h / 24h; Short features 1m … 60m) and Full catalogue → at its right; compact gate rows, the gate name opens it; a short window's checks as small labels; foot: Short windows ↗ |
| Calculations, no fused verdict | … Switch 12 h / 24 h at the top of the page, or check Pipeline Health … | … Choose another window, or check Pipeline Health … |
| Signals tab, value | Value and Unit columns (35.10 · %) | one Value column (35.10 %) |

## CHG-159 owner review: Historical

Removed on the owner's instruction (10 Nov): the `?` on the Historical title, and the historian path (root.site1.cpm.…) from the empty-signal line on Historical and the empty PV / SP lane line on the Evidence pages; the loop's tag names it.

| Where | Was | Now |
|---|---|---|
| Historical title | Historical `?` | Historical |
| Historical, empty signal lane | No values stored at root.site1.cpm.FIC10401 for PV, SP, OP in this range — the signal lane is empty, but the other lanes below it are not. | No PV, SP, OP values stored for FIC10401 in this range — the signal lane is empty, but the other lanes below it are not. |
| Evidence pages, empty PV / SP lane | PV / SP lane: no historian samples for this window at root.site1.cpm.FIC10401. | PV / SP lane: no historian samples for FIC10401 in this window. |
| Historical, chart | Zoom area, Undo, Reset in the box under the chart, with the results count and Result key | Zoom area, Undo, Reset in the head row before Open in Trend ↗; the foot holds the results count and Result key |


## CHG-160 owner review: Investigation

Changed on the owner's instruction (10–11 Nov): the loop control is a search field on every loop page; Investigation is five step tabs; More, Technical details & engine trace, the Numeric evidence panel and three dialogs are gone; the window options are the end and the state alone; repeated words removed.

| Where | Was | Now |
|---|---|---|
| Loop control (every loop page) | Choose a loop button, then a Find loop box, "243 of 243 loop(s)", the list, Loop Registry ↗, Clear loop | Search field "Search loops"; typing lists the matches, the arrow lists every loop; one list |
| Investigation title | Investigation `?` | Investigation |
| Window options (Investigation, Replay, Evidence Workbench) | 12 h · ends 18 Aug 06:45 UTC · Not evaluated: not enough data · 85 days ago · no run identity (pre-v2.5) | 18 Aug 06:45 · Not evaluated (a pre-v2.5 window is left out; a history-only one ends "· history only") |
| Investigation sections | one long page | tabs Result, Evidence, Windows, Hypotheses, Review; each ends with Next: … → |
| Result | Latest window · 12 h · ends 7 Nov 11:45 UTC (eyebrow); NEXT CHECK row; Start with evidence ↓ | an Earlier window pill only when it is one; the next check leads Review; no button |
| Evidence | Why this result · All 17 gate results → | Gates by stage · All 17 gates → |
| Windows | Compare windows button, dialog "Compare recent 12h windows"; tiles "Ends 6 Nov 23:15 UTC · 12 h · Not evaluated: not enough data" | Windows tab "Recent 12h windows"; tiles "Ends 6 Nov 23:15 · Not evaluated"; the table shows even with no previous window |
| Numeric evidence | panel and "Numeric evidence · FIC10401" dialog | removed: the Windows table's Current column holds the same measures |
| Hypotheses | Hypothesis comparison ↗ and its dialog; Observed / Possible cause / Not assessed / Not seen list above the cards | Hypotheses tab; the list is gone; a qualified cause's card says "A tuning review or an approved step test would confirm it." |
| Hypotheses note | Scores are uncalibrated evidence scores, not probabilities: they rank the mechanisms, they do not measure certainty. | Scores rank the mechanisms; they are not probabilities. |
| Observations head | Observations / What was seen, and by which method | Observations |
| Gate proof dialog | FIC10401 · G5; Loop result; Assessment; Evidence Replay ↗, Evidence Workbench → | G5 · Oscillation (ACF); no loop result or window rows; Replay ↗, Workbench ↗ |
| All gates dialog | All gate results · FIC10401 | All 17 gates |
| N/A gate mark (everywhere) | n/a N/A | ∅ N/A |
| More (Investigation) | More ▾: Case, Load older windows, Retry | Case in the band, no label ("All cases"); older windows by Older › on Windows; Retry beside the window dropdown when the list fails |
| Record your review | 0 note(s); Attach to this evaluated window (12 h · ends 6 Nov 22:45 UTC) — its evidence is kept; Hypothesis comparison ↗, Related events ↗ beside the notes | the count only when there are notes; Attach to this window — its evidence is kept (the window on hover); Related events ↗ in the Next checks head |
| Result strip | Result · … · Back to conclusion ↑ (sticky) | removed: the window dropdown names the result on every tab |
| Evidence, empty trend | … in the Loop Registry. (Historian series: root.site1.cpm.FIC10401) | … in the Loop Registry. |
| Technical details & engine trace | disclosure at the foot of the page | removed |

## CHG-162 owner review: Evidence Workbench

Changed on the approved sample `samples/workbench-proposal.html` (11 Nov).

| Where | Was | Now |
|---|---|---|
| Band | More ▾: Window kind, Load older windows, Jump to date + Go, Newest, Evaluate a window; ‹ Newer · Older ›; Back to Investigation ↗ in the header | Window kind dropdown ("12h fused"), ‹ ›, Newest, Go to date (opens the date), Investigation ↗ outlined at the band's end; Older › past the loaded list loads older windows; Evaluate a window in the gate head |
| Run bar | 12h pinned run · 8,221 samples · Calculation v3.0.0 · profile v2.0.0 · LOOP RESULT Oscillation confirmed · Run id ↗ · copy · Reconstruct evidence ↗ | gate head row: FUSION / G15 · Decision ▲ Confirmed … Run 8fb7519a (copy) · Reconstruct evidence ↗ · Evaluate a window |
| Proof, under the tabs | 2026-11-06 10:45:00 → 2026-11-06 22:45:00 · UTC (UTC+00:00) · Nominal 8,624 samples at 5.009 s | foot strip: 12 h window · 6 Nov 10:45 → 6 Nov 22:45 UTC · 8,221 of 8,624 samples at 5 s · Evidence Replay ↗ |
| Not retained | Evidence not retained for this run (a heading) ? — The verdict and every scalar of this run are valid; only the arrays were not kept. | one line: Evidence not retained for this run ? The verdict and every value of this run stand. |
| Loading | an unlabelled 360 px box | a 200 px box: Loading the evidence… |
| Evidence behind it (G15) | Observed / Possible cause / Not assessed — input missing / Not seen in this window, each a long list | Observed: … · Possible cause: … (leading) · Hypotheses ↗ (Investigation's Hypotheses tab) |
| What remains open (G15) | … · Evidence scores rank the explanations; they are not probabilities. | the note once, on the evidence-score row |
| Proof links | See rules & parameters → · View signal context → | removed: the tabs above |
| Versions | in the run bar | Identity & raw: Calculation |

## CHG-163 owner review: Evidence Replay

The pattern of Historical, Investigation and the Workbench, applied while the owner was away ("follow the same thing for next 2 pages and build them, I will review it after").

| Where | Was | Now |
|---|---|---|
| Header | Evidence Workbench ↗ · Evidence package | 12h / 24h (moved from the band) |
| Band | loop · window · result … 12h / 24h · More ▾ (Load older windows, Retry) | a card: loop · window · result · ‹ › … Workbench ↗ (outlined, opens the chosen check's run) · Evidence package; › past the loaded list loads older windows; Retry beside the window when the list fails |
| Run facts | Original run · pinned · 8,221 samples · Calculation v3.0.0 · profile v2.0.0 · Run details ↗ (above the chart) | the chart panel's foot strip: 12 h window · 6 Nov 10:45 → 6 Nov 22:45 UTC · 8,221 samples · Original run · pinned · Run details (versions in Run details) |
| Raw historian stage | root.site1.cpm.FIC10401 | Raw historian samples of the window |
| No raw data | … or pick another window. (Historian series: root.site1.cpm.FIC10401) | … or pick another window. |
| Right column | Window verdict ● Oscillation confirmed; EVIDENCE CHECK ▾; …; Open retained proof ↗; a Re-run card: Check the configuration before creating a new run. Original evidence stays unchanged. Re-run this window | Evidence check ▾; …; Re-run this window ? (About re-runs: A new run of the exact window. Check the configuration first; the original evidence stays unchanged.) at its foot; the result is in the window dropdown, the proof link is the band's Workbench ↗ |

## CHG-164 owner review: Window Inspector

The pattern of Historical, Investigation and the Workbench, applied while the owner was away (reviewed with CHG-163).

| Where | Was | Now |
|---|---|---|
| Title | Window Inspector `?` | Window Inspector |
| Header | CPLM Short Feature Engine · RUNNING · ckpt 129s ago · Pipeline Health ↗ | moved to the band's end (Pipeline Health ↗ outlined) |
| List bar | SAMPLE COUNT [All] · 24 matching / 24 loaded · Newer · Older | [All windows] (named by its options); no count line; ‹ › in the band step the selected window |
| Load older windows | under the list, left | under the list, centred |
| Selected window | Received 146 · Nominal 180 · Ratio 81% · Difference −34 samples | Samples 146 of 180 · 81% −34 samples |
| Selected window links | View record details ↗ · Feature flags ↗ · Sample density ↗ · Engine & timing ↗ · Open range in Historical ↗ · Open in Trend ↗ | Record details · Feature flags · Sample density · Engine & timing (dialogs, no ↗) · then Historical ↗ · Trend ↗ |
| Compare across sizes | METRIC label over the dropdown | the dropdown in the head row, named by its options |

## CHG-165 owner review: System Response

Built on the approved sample `samples/system-response-proposal.html` (owner: "System response proposal accepted", 11 Nov).

| Where | Was | Now |
|---|---|---|
| Header | Site zone UTC. Every event is listed with its state and reason; the selection is explicit and never "latest". | removed (the zone is named on the times) |
| Layout | three columns: event list · result, charts, model history · event details | the band (loop, Response event, ‹ ›, Workbench ↗, Open loop ↗) and six tabs: Events, Response, Fit quality, Frequency, Steps & data, Models; Next: X → in the foot |
| Event list | Response events (36) · Show 35 censored candidates · rows of time, state, INPUT_TEST · OP_TO_PV, finding · model candidate | Events tab: table Time · Type · Path · State · Finding · Model ("Input test", "OP → PV", "FOPDT · K 0.21 · θ 0.00 s · τ 0.50 s"); censored choice "Hide censored (35)" / "Show censored (35)" |
| Tiles | above the columns, linked to the list and the model history | on Events only; System model opens the Models tab |
| Event choice | a row in the left list | the band's "Response event" (7 Oct 05:43 · Input test · OP → PV · Candidate) and ‹ ›, or a row on Events |
| Result | RESULT · FOPDT model · candidate · EVALUATED, tiles, Validation: …, Estimated by … the candidate table below carries … | one row: FOPDT model · Validation: Waiting · no independent event yet · K, θ, τ · Candidate (once) |
| Units | 0.21 PV_EU/input_EU | 0.21 m3/h/% OP (the loop's PV unit and the input, as on the model history; "PV unit" when none is registered) |
| No arrays | four "nothing to draw" panels | one note per tab: Arrays not kept for this run · The result and every value stand. · Reconstruct in the Workbench ↗ |
| Key results | 16 rows in the right column, most "not applicable" | Response: Reported quantities (the ones the result row does not say) · 12 of 52 reported |
| Catalogue | All 52 quantities › (12 reported) → a card in the centre | Steps & data: All quantities with "Reported (12)" / "All (52)", reported first |
| Frequency | Frequency response not available panel; seven rows "not applicable (model domain unavailable)" | Frequency response not drawn · Model domain unavailable. It needs … · margins "not claimed" |
| Steps | Subgates · Steps A–H list in the right column | Steps & data: A–H as cards |
| Event identity | Window from / Window to / Duration · run · bundle · purpose | Steps & data: Event · Window 7 Oct 05:43 → 7 Oct 05:47 UTC · Run · Bundle · Purpose |
| Workbench exit | Open in Evidence Workbench → (right column) | Workbench ↗ in the band |
| Model history | charts one under another; legend Interval upper — … · Interval lower — … | Models tab: trends side by side; one legend entry Interval — …; Export models CSV; path OP → PV |

## CHG-166 owner review: Calculations

Built on the approved sample `samples/calculations-proposal.html` (+ `calculations-steps.html`) and the owner's four answers of 11 Nov: the window list in the band, the loop's own units, Run details trimmed on Calculations and Replay, Record details as a dialog.

| Where | Was | Now |
|---|---|---|
| Title | Calculations `?` (Every calculated metric for a loop, with its latest value and method.) | Calculations |
| Header | 12h / 24h · Back to Investigation ↗ | removed: the band holds both |
| Band | a strip: loop · 12 h window · 6 Nov 10:45 → 6 Nov 22:45 UTC · ● Oscillation confirmed · Calculation v3.0.0 · profile v2.0.0 · Run details ↗ | a card: loop · 12h fused ▾ · 6 Nov 22:45 · Oscillation confirmed ▾ · ‹ › … Investigation ↗ (outlined); › past the loaded list loads older windows; "Verdict unavailable" when the verdict cannot be read |
| Verdict | a pill in the band | in the window dropdown, as on the Workbench and Replay |
| List head | FIND CALCULATION [Name, ID or unit] · GATE [All gates] · GATE RESULT [All results], then All · Control error · Actuator · Data & mode · Oscillation · Decision, then 19 shown / 19 available | one row, named by its options: [Name, ID or unit] · [All categories] · [All gates] · [All results] · Clear filters; no count |
| Gate options | G5 | G5 · Oscillation (ACF) |
| Values | 1.988 PV units · 85,666 PV·s · 250,412 PV²·s | 1.988 kg/h · 85,666 kg/h·s · 250,412 (kg/h)²·s (the loop's PV unit; PV units when none is registered) |
| Foot of the list | (none) | 12 h window · 6 Nov 10:45 → 6 Nov 22:45 UTC · 8,221 samples · Original run · Run details |
| Panel head | Mean absolute error, then an Id row CPLM-010 | Mean absolute error … CPLM-010 |
| Panel rows | Id · Value · Unit PV units · Method · Related gate · Signal engineering unit kg/h | Value · Unit kg/h (the loop’s PV unit (PV units)) · Gate `?` · Method |
| Gate and verdict | G3 is the gate’s own result. The window’s verdict is Oscillation confirmed. | Gate `?` (Gate result and window verdict: The gate’s own result on this window. The window’s verdict is in the band.) |
| Panel links | Retained value & identity ↗ · Original configuration `?` (Rules and thresholds belong to the selected run.) · Inspect parameters ↗ · ▸ Record details | Record details (a dialog) · Rules & parameters ↗ · Identity & raw ↗ (the Workbench tabs they open) |
| Record details | 8 rows under the panel: Window qualification, Evidence-score band, Gate G3 in stored results, Catalogue note, Engine, Emitted, Stored in, Kind | a dialog: Window qualification, Evidence-score band (the fused score only), Gate G3 in stored results, Stored in |
| Run details (Calculations and Replay) | Window · Result · Samples · Gates · Decision run (G15) · Bundle · Calculation · Engine build · Computed 2026-11-06T22:48:20.195929Z · Proof retained | Gates · Decision run (G15) · Bundle · Calculation · Engine build · Computed 6 Nov 22:48 UTC · Proof retained (the foot says the window, the run and the samples) |
| No loop | Pick a loop above. The list then shows each calculation with this loop's latest value and the gate that judges it. | Choose a loop above to see its calculations. |

## CHG-167 owner review: Loop Events

Built on the approved sample `samples/loop-events-proposal.html` (+ `loop-events-steps.html`) and the owner's answers of 11 Nov: the layout as drawn; Investigation → and Loop Explorer → in the panel feet (the Review column keeps its name); no counts on the toggle; a search, All / Open / Closed and the pager on Fast conditions. Not built, as the owner answered: the All windows / 12h / 24h filter, any change to the unshelve sentence for an expired shelf, the evidence-strip drill-down.

| Where | Was | Now |
|---|---|---|
| Header | Loop Events `?` (Investigate diagnosis episodes with operating context and a traceable response history. One row is one episode of one fault family …) · Episodes · 325 open \| Fast conditions · 26 open | Loop Events · Episodes \| Fast conditions (no counts) · How to read |
| How to read | (none: the title `?`, About availability `?`, About fast conditions `?`, the stale hover text) | a dialog in four titled parts, each a key in two aligned columns: Review, Condition, Rows, Fast conditions |
| Filter row | above the list: Open 325 · All severity · Triage · [loop, EVT number, family or diagnosis] · 325 event(s) (… for FIC10401, … matching “zzz”) | inside the list card, search first: [Loop, EVT, family or diagnosis] · Open 325 · All severities · Triage (· Loop FIC10401 ×); no count note |
| List | title Open episodes; heading OPENED; 5 Oct · 07:45; review pills with a dot | no title; Opened · UTC; 5 Oct 07:45; ! Unacknowledged, ✓ Acknowledged, ◐ Shelved · expires in 3.0 h, ! Shelf expired · unreviewed (the severity keeps its dot) |
| Pager | ← Prev · 1–10 of 325 · page 1 of 33 · Next → | « ‹ 1 2 3 … 33 Page 1 of 33 › » (the shared pager, 32 px, centred) |
| No match | No events in this view / No episode matches “zzz” under this filter. · Select an event / Pick an episode in the list to read its evidence, history and actions here. | No episode matches “zzz” · Show all events; no panel beside an empty list |
| Deep links | EVT-829 is not on this page of the list (filter, search or rank) — its detail is open on the right. / Event 999999 does not exist (it may have been removed by retention) — showing the first event on this page instead. | EVT-829 is not in this list; its details are open. / EVT-999999 does not exist (retention may have removed it). Showing the first episode. |
| Panel head | EVT-2231 · Episode details · PIC40102 ↗ ● High · Peak · Oscillation confirmed · Latest · … · Review PIC40102 → | Oscillation confirmed … ● High |
| Panel rows | Condition OPEN · Availability Unobservable `?` · Review Not yet reviewed / Acknowledged superadmin · 15 Oct · 07:05 · Review note · Shelf Shelved by … · until … · expires in … / Returned shelf by admin expired 50.7 d ago · Shelf reason | Latest (only when it differs) · Condition ⊘ Open · Unobservable · Review ! Unacknowledged / ✓ Acknowledged · Shelf ◐ Shelved until 11 Nov 21:30 · expires in 8.0 h / ! Returned expired 21 Sept 12:24 · 50.8 d ago · Period 5 Oct 07:45 → now; who, when and why are in Activity (an episode with no action record of that kind keeps them on the rows) |
| Panel links | PIC40102 ↗ · Opened 5 Oct · 07:45 · still open · Episode period ↗ · ▸ Technical details (Fault family OSCILLATION, Resolution 24h, Calculation version 3.0.0, Dynamics profile 2.0.0, Support until 2026-10-06T10:00:00Z) | Record details (a dialog: Fault family Oscillation, Calculation v3.0.0 · profile v2.0.0, Support until 6 Oct 10:00 UTC, each with its copy button) · Historical ↗ · Loop ↗ |
| Note | NOTE over [Optional] | [Note (optional)] |
| Shelve | a panel under the buttons: the sentence, Shelve for, Reason (required), Shelved until 11/11/2026, 21:30:00 UTC (expires in 8.0 h)., Shelve · Cancel | a dialog Shelve / Update shelf: the sentence (word for word), For, Reason, Shelved until 11 Nov 21:30 UTC · expires in 8.0 h, Cancel · Shelve |
| Unshelve | a panel under the buttons: the sentence, Reason (optional) [valve overhauled · …], Unshelve · Cancel | a dialog Unshelve: both sentences word for word (the expired-shelf one unchanged, owner answer 5), Reason [Optional: valve overhauled · …], Cancel · Unshelve |
| Activity | Activity & notes · Full history ↗ · 15 Oct · 07:05 Acknowledged · superadmin | Activity & notes · Full history · 20 Sept 12:24 Shelved · admin · until 21 Sept 12:24 (— reason when given) |
| Full history | dialog EVT-829 · Full history: 20/09/2026, 12:24:27 UTC · Shelved admin · until 21/09/2026, 12:24:25 UTC · No operator action yet · Link a loop note [— choose a note —] Link to this episode | dialog Full history: Actions, a table Time · UTC, Action, By, Until, Reason (20 Sept 12:24 · ◐ Shelved · admin · 21 Sept 12:24 · —; No action recorded yet.); Notes (No loop note is linked to this episode.; [Link a loop note…] Link) |
| Panel foot | (none) | PIC40102 · EVT-2231 · 24h … Investigation → |
| Fast conditions list | Conditions · 26 open `?` (Detected within a minute, before the next fused window.); 300 rows in one scroll box | [Loop or description] · All 300 / Open 26 / Closed 274; pages of 10 with the shared pager |
| Fast condition rows | OPEN stale · last update 4 days ago · TIC20607 (a Workbench link) Temperature controller (FCS0102) · G10 Limit high · Since 4 days ago | ◌ Open · stale · TIC20607 over Temperature controller (FCS0102) · Limit high over G10 · Valve / saturation · Started · UTC 7 Nov 10:24; the row only selects |
| Fast condition panel | TIC20607 · G10 Limit high · OPEN · Review TIC20607 → · Condition G10 Limit high · Started 4 days ago · Duration · Last update 4 days ago · Open on record but not updated — the engine restarted or the loop's samples stopped. · Window Inspector ↗ | Limit high … ◌ Open · stale; Gate G10 · Valve / saturation · Started 7 Nov 10:24 · Duration 1.5 h · Last update 7 Nov 11:51 (not updated for 10 min or more) · Close reason (closed only); Workbench ↗ · Window Inspector ↗; foot TIC20607 · Temperature controller (FCS0102) … Loop Explorer → |
| Below 1280 px | the panel under the list | a drawer a row opens (also a link that names an episode or a condition) |

## CHG-168 owner review: Loop Registry

Built on the approved sample `samples/loop-registry-proposal.html` (+ `loop-registry-steps.html`) and the owner's answers of 11 Nov: the layout as drawn; with no loop in the address the panel says Choose a loop and reads nothing; added a Monitored switch, three valve-position choices and Export CSV (frontend only).

| Where | Was | Now |
|---|---|---|
| Header | Set up · Loop Registry `?` (A loop is only as good as its signal mappings. The readiness report after save lists exactly what is degraded: …) · Bulk import · Add loop | Set up · Loop Registry · How to read · Bulk import · Add loop |
| How to read | (none: the title `?` and the configuration limits `?`) | a dialog in three titled parts, each a key in two aligned columns: State (✓ Active, ! Degraded, ○ Not monitored, ⊘ Retired), VP (Mapped, Not mapped, No VP), Readiness (A loop is only as good as its signal mappings · VP expected, not mapped · Peer links expected, missing · Plant facts, nothing to fix) |
| Configuration limits | a line above the list: 234 valve positions expected but not mapped · 239 peer links expected but missing · 241 degraded `?`; chosen: Loops with a valve position expected but not mapped. Clear | options of the one dropdown: VP expected, not mapped 234 · Peer links expected, missing 239 · Degraded 241 (Not retired clears); "Configuration limits unavailable · Retry" beside the dropdown |
| List head | Loop assets · 243 loops · 2 retired hidden · ☐ Show retired · [Find loop] | inside the list card, search first: [Loop, service, unit or type] · Not retired 243 / With retired 243 / … · Export CSV (32 px) |
| Row pills | ● Not monitored, ● Retired | ○ Not monitored, ⊘ Retired |
| Pager | ← Prev · Page 1 of 10 · Next → | « ‹ 1 2 3 … 10 Page 1 of 10 › » (the shared pager, 32 px, centred) |
| No match | No loops registered · Onboard the first loop to start producing diagnoses. · Add loop | No loop matches “zzz” · Show all loops ("No loops registered" with Add loop only when the registry is empty) |
| Selected loop | the loop's own page in place of the list: ‹ Loop Registry · FIC10401 · Edit configuration · Retire · Open loop → · Evidence → · Effective rules ↗ | a panel beside the list (a drawer below 1280 px); with no loop: Choose a loop |
| Panel head | Facts ● Degraded / Registered (for the loop the list calls Not monitored); Service row | FIC10401 · Flow controller (FCS0101) under it · ! Degraded (✓ Active, ○ Not monitored, ⊘ Retired: the list's word) |
| Panel rows | Facts: Service, Loop type, Criticality, Gate profile, Acquisition, Valve position, Peer links, Plant path (Plant tree ↗ inside), Observability; Loop model: Model `?`, Objective / topology / command | Plant path · Loop type · Criticality · Gate profile · Model |
| Record details | (rows of the page and the Model `?`: Set from the loop type; declare it in the registry to make it explicit.) | a dialog: Objective · topology · command, Acquisition, Model set by The loop type (Declare it in Edit configuration to make it explicit.) |
| Readiness | Valve position Expected · not mapped: G14 cannot confirm a final-element fault; Peer links None · expected: G13 not evaluated; Observability NO_VP NO_UPSTREAM_LINKS pills; Readiness: Signal VP (valve position, G14) · A valve position (VP) is expected here: …; Peer / upstream links (G13) · Add the loop's … | Valve position (G14) ! Expected · not mapped `?` (the server's advice); ! Mapped · no samples `?`; — Not applicable / Not installed; Peer links (G13) ! None · expected `?` or PEER → G13_LOOP_B; Observability only for any other flag; every other unmet check by name with its message; ✓ Nothing missing |
| Signals | Signal mapping table Role · UNS path hdpe/section_600/u6002_pellet_homogenization_ii_silo_4_5/fic10401.pv; No signal is mapped. | Signals `?` (Paths sit under the plant path; the whole path is on hover and in Copy.): the role with its pen, …/fic10401.pv, Copy; a required role ! Not mapped `?` (the server's advice) |
| Actions | Edit configuration and Retire in the page header; Re-project links & republish evidence under Loop model | one row: Edit configuration · Retire / Restore · Re-project links & republish evidence (word for word), the receipt under them |
| Links | Open loop → · Evidence → · Effective rules ↗ · Plant tree ↗ (in the Plant path row) | Record details · Workbench ↗ · Effective rules ↗ · Plant tree ↗; foot: Loop Explorer → |
| Editor title | Governed registry workflow · Edit loop FIC10401 / Add control loop | Edit configuration / Add loop |
| Editor steps | ✓ Identity · Classification · Signal mappings · Review pills · Step 1 of 4 · Continue › | tabs Identity · Classification · Signals · Review (a tab ahead is reached only by Next) · Cancel · Back · Next: Classification → (the reason under a disabled Next) |
| Editor labels | LOOP TAG *, … one grid per step | Loop tag *, …; titled parts: Loop, Plant location · Ranking, Loop model, Acquisition · Signal paths, Ranges, Optional inputs · Changes, All settings |
| Identity | Loop tag (hover: Loop ID is the identity and cannot be changed); Picked from the UNS asset model, so the loop’s signal paths resolve against real assets. [Enter manually] | Loop tag * · The identity; it cannot change (edit); Plant location `?` (Picked from …) · Enter manually |
| Add loop, no site yet | Area — no areas modelled —, Unit — no units modelled — | Area and Unit — choose a site first — |
| Classification | Criticality, Gate profile; Loop model PRESET FROM LOOP TYPE; The tag type only suggests a model. Preset for FIC: FLOW · FAST_SELF_REG · TIGHT · SINGLE · OP_TO_VALVE. Explicit values override …; Acquisition contract `?`; placeholders "the sample interval the source delive…"; Classification source PRESET_FROM_LOOP_TYPE — derived from the tag type …; Engineering ranges with a paragraph ("OP rangenormalises") | Ranking: Criticality, Gate profile, Monitoring ☑ Monitored (new); Loop model ◌ Preset from loop type `?` (The tag type only suggests a model. Explicit values override …); selects "preset (FLOW)"; Acquisition `?` (the contract sentence and the four hints) with placeholders "undeclared"; no source row |
| Signals tab | Derived from the location and loop tag as site/[area/]unit/<loop>.<role> — edit any path to override it.; VP · Valve position · optional with the derived path as a grey placeholder; ☑ This loop has a valve position (positioner feedback) + paragraph; Interacting loops (G13) Derive (expected) / Expected / Not installed / Not applicable + Not applicable: a stand-alone loop … | Signal paths `?`; each role's pen beside its label, the label over the full-width path; VP · Valve position placeholder "Not mapped" and + add VP as …/fic10401.vp; Ranges `?` (Optional, and neither is cosmetic … OP range normalises …): PV range [min] – [max] [unit: kg/h, °C, barg], OP range [min] – [max]; Valve position Expected / Not installed / Not applicable `?`; Interacting loops (G13) Derive (expected) / Expected / Not applicable `?` (Not installed only when the loop has it); the VP warning stays |
| Review | eyebrow, the tag, READY TO SAVE / NO CHANGES; Changes (1); ▸ All settings after saving; How this loop is evaluated (a button and panel) | Changes (an edit only; "Nothing has changed. Saving re-submits the loop as it is."); All settings `?` (How this loop is evaluated: the pipeline windows) open in two columns, paths as …/fic10401.pv; Valve position expected / not installed / not applicable (was yes / none on this loop) |
| After saving | Activation result · FIC10401 · READY · DEGRADED; rows with the message inside a pill | Readiness ! Ready · degraded (✓ Ready, ✕ Blocked, Checking…); rows ✓ OK, — Not applicable / Not installed, ! Missing `?` (the message) |
| Bulk import title | Bulk registry workflow · Import loops from CSV — Review & validate · 1. Import file · 2. Review & validate · 3. Activate | Bulk import · tabs File · Review · Activate · Next: Review → |
| File | the source paragraph (required columns, derivation); Download template top right; FIC.csv · 3 row(s); footer 3 row(s) detected | Source `?` (the rules and every column) · Download template; Choose CSV file · or drop a .csv here, or paste below · 3 rows (once) |
| Review | four tiles (Rows detected 3, Ready 2, Need correction 1, Existing (will update) 1); 1 row(s) will be skipped. Only the 2 ready row(s) are imported.; table Loop · Location · Type · PV / SP / OP / MODE / VP · Status (cut off at 1440 px); footer 2 of 3 row(s) ready | one line: 3 rows: ✓ 2 ready (1 updates an existing loop) · ✕ 1 needs correction. Rows that need correction are skipped.; table Loop · Location · Type · Status (✓ Ready / ↻ Updates existing / ✕ Needs correction, the reason under it) · …/fic10499 .pv .sp .op .mode |
| Activate | Ready to onboard 2 loop(s) into the registry. Each one gets …; four tiles; three-line checkbox label; footer 2 row(s) will be activated; Submit & activate 2 loop(s) | 2 loops to activate: 1 new, 1 updates an existing loop · 1 row skipped `?`; Allow locations that are not in the asset model `?`; Activate 2 loops |
| Import result | banner ✗ 1 activated, 1 failed · Completed in 1.2s. | ! 1 activated, 1 failed · Completed in 1.2 s.; failures first; Fix and re-import · Close |
| Template | its two sample rows had 17 cells for 20 columns, so the template failed its own import | a cell per column |
| Retire | Retire FIC10401 · REASON (REQUIRED) · Retire loop (disabled, nothing said) | Retire loop · Reason (required) · 0 / 500 · Retire loop, "Write a reason first" under it while disabled; Restore loop the same |
| Export | (none) | Export CSV in the filter row: the loops the list holds, every page, in the bulk-import columns (cplm-loop-registry-2026-11-11.csv) |

CHG-168 follow-up (owner, 11 Nov):

| Where | Was | Now |
|---|---|---|
| Bulk import › Review | (nothing) | Monitoring turns back on for 1 loop that is not monitored now: FIC10401. (only when the file holds such loops) |

## CHG-169 owner review: Gate Configuration

Built on the approved sample `samples/gate-configuration-proposal.html` (+ `gate-configuration-steps.html`) and the owner's answers of 11 Nov: the layout as drawn; added a confirmation before Roll back, "Starts from" with the draft starting from the level's active version, the governed dropdown, and Diff & impact against the layers below (frontend only); the found-on-the-way bugs fixed.

| Where | Was | Now |
|---|---|---|
| Header | Set up · Gate Configuration `?` (What each loop runs under, the bundles in progress, and the editor for one of them. / What this loop runs under today, the bundles at its three levels, and the editor for one of them.) | Set up · Gate Configuration; top right Effective \| Bundles (no counts) · How to read |
| Views | no loop: an overview page (Overview · Configuration by loop, Lifecycle · Bundles in progress); a loop: tabs Effective \| Bundles \| Editor | Effective \| Bundles in the header; no loop: every loop / the bundles in progress; a loop: its values / its levels; a bundle opens under Bundles (Editor tab gone, `?view=editor&bundle=` kept) |
| How to read | (none: the title `?`, "How the layers combine", "The three levels", "What this list holds", "Gate role policy" and the Gate role policy card under every view) | a dialog in five titled parts: Levels (A layer above sets a property, or leaves the one below. The most specific active level wins. · FACTORY Shipped defaults. · PROFILE The class pack. A PROFILE bundle covers every loop of this class pack that has no LOOP bundle. · SITE … · LOOP … · Unset No layer sets it.), Change class (Policy, ◆ State boundary, ✕ Deployment), Flags (commissioning, unread by build, invalid), Bundle state (Bundles in progress: drafts, validated, shadowed, approved or failed - active and superseded ones live on their loop's page. · ○ Draft … ↺ Rolled back ⊘ Superseded), Gate roles (the build's catalogue and the G9 sentence) |
| Band | Search loops · Open loop ↗; in the editor a panel head "LOOP FIC10302 · V6 / Properties · G0 / ACTIVE_VERIFIED / ‹ Bundles" and "hash / etag f9153b00aaf3ba1a · 6c8eae20025f98e6" | loop · (in a bundle) LOOP v6 ✓ Active (verified) · Record details … Open loop ↗ |
| Record details | (the hash / etag row; created / updated / note in the lifecycle column) | a dialog: Content hash f9153b00 ⧉, Etag, Created e2e_cfg_engineer_a733d49f · 25 Sept 18:36 UTC, Updated, Note, Catalogue hash 8bbcbbbb ⧉ |
| Every loop | FIND A LOOP [loop, service, profile or unit] · 243 loop(s); "1 of 243 loops run a governed bundle; the rest run the factory layer"; columns loop · profile · runs under · effective from; FIC10302 (underlined) / Reactor feed flow · U1001 …; Active (verified) / LOOP v6 · f9153b00; factory layer; 25/09/2026, 18:37:18 UTC; ← Prev · Page 1 of 13 · Next → | [Loop, service, profile or unit] · All loops 243 / Governed bundle 1 / Factory layer 242 (a dropdown); Loop · Profile · Runs under · Effective from · UTC; FIC10302 / Reactor feed flow · U1001 …; ✓ Active (verified) / LOOP v6; ○ Factory layer; 25 Sept 18:37; the shared pager (32 px); a row opens the loop |
| No loop matches | No loop matches · Nothing in scope matches "zzz". | No loop matches “zzz” · Show all loops |
| Build details | Technical details (catalogue hash in full, 165, 6) | Build details in the list foot: a dialog, Catalogue hash 8bbcbbbb ⧉ · Catalogue properties 165 · Workers announced 6 |
| One loop's values | tiles LOOP v6 Effective layer ACTIVE_VERIFIED · FLOW_FAST_SELF_REG Profile · 5 of 5 applied Worker alignment; Technical details; "Where each value comes from `?`" with four cards (FACTORY shipped 57 properties shipped defaults …) | one strip: FACTORY Shipped defaults 57 properties · PROFILE Flow, fast self-regulating 47 overrides · SITE hdpe no bundle · LOOP v6 ✓ Active (verified) 1 override |
| Property list | gate dropdown "G0 · 2 set above factory", then Find a property; rows G0.bad_fraction_max with a POLICY pill; NO_VALUE; unset; FACTORY / PROFILE pills; alphabetical | [Property] first, then "G0 · Data quality · 2 set above factory" ("All matching gates" while searching); rows bad_fraction_max over Policy / ◆ State boundary (the full key in search results, on hover, in the panel); No value; values with units (3600 s, 0.5 pp); LOOP v6 / PROFILE / FACTORY / Unset as words; catalogue order |
| `?gate=` | ignored: the page opened on G0 | opens that gate (System Response's Check G12 settings lands on G12) |
| Property | a dialog: Value, Source, Class, Id, Unit, Type, Factory default, What it does, Not read by this build | the panel beside the list (a drawer below 1280 px), the id in its heading; Source LOOP · bundle v6 / PROFILE · Flow, fast self-regulating / FACTORY · shipped default / Unset · no layer sets it; Class `?` (Policy and State boundary are explained in How to read.) |
| No property matches | No property matches · Nothing in this loop's configuration matches "zzz". | No property matches “zzz” · Clear search |
| Workers | Worker alignment tile "5 of 5 applied · one jar · catalogue matches"; APPLY acknowledgements disclosure (job · jar · catalogue · applied "ACK f9153b00"); the loop's Technical details | foot "Workers ✓ 5 of 5 applied · one jar · catalogue matches · Workers"; a dialog: APPLY acknowledgements (Job · Applied; a Jar or Catalogue column only when a worker differs; the hash only when it is another one), Build (Bundle LOOP v6 · Policy · effective 25 Sept 18:37 UTC, Bundle hash, Catalogue hash, Catalogue properties, Workers announced, Worker jar, short and copyable) |
| Bundles | "Bundles `?`"; Nothing changes for a loop until a bundle is published.; Draft → Review → Publish; three boxes of buttons "v7 · 337ddfe7 ● ROLLED_BACK POLICY · 25/09/2026, 18:37:18 UTC · e2e_cfg_engineer_a733d49f · slice-3 e2e v2" (a button opened the editor) | one list grouped LOOP / PROFILE · Flow, fast self-regulating / SITE · hdpe: Version (note under it) · By · Updated · UTC · State (↺ Rolled back); Prepare bundle draft at its head; a row selects; the strip went |
| Selected version | (none) | a panel: LOOP v6 ✓ Active (verified) · Change class Policy · Created 25 Sept 18:36 UTC · Effective from · Validation errors 0 · Content hash f9153b00 ⧉ · Open v6 → |
| Bundles in progress | Lifecycle · Bundles in progress `?`; scope · version · state · class · updated (hash, author) | Bundles with no loop: Bundles in progress · Scope · Version · State · Updated · UTC · By; class and hash in the panel |
| Prepare bundle draft | three radios LOOP FIC10302 · PROFILE FLOW_FAST_SELF_REG · SITE hdpe; [draft note]; Create draft (disabled, nothing said); "Loading the LOOP versions…" / "The LOOP versions could not be read, so a draft cannot start from the right one." as paragraphs | Nothing changes for a loop until a bundle is activated.; Level `?` (the three level lines): Level · Starts from: LOOP FIC10302 v6 ✓ Active (verified) · PROFILE Flow, fast self-regulating First version at this level · SITE hdpe First version at this level; Note [Draft note]; Create draft, the reason under it while disabled (the two sentences stay; new: "The PROFILE reference is not known yet.") |
| Draft parent | the newest version of the level (FIC10302: v7, rolled back) | the active version of the level when it has one (FIC10302: v6), else the newest |
| One bundle | tabs Properties \| Diff & impact \| Shadow (and "Properties · 2 invalid"); a lifecycle column: v6 · f9153b00aaf3 ACTIVE_VERIFIED, Draft · Validated · Shadow · Approved · Deploying · Active, created / updated / note, ACTIONS In order (Validate · Shadow · Approve · Activate · Roll back) | five tabs Properties ✓ · Diff & impact ✓ · Shadow ✓ · Approval ✓ · Deployments ✓ (✓ done · ● current) with Next: Diff & impact → … at each foot; each action on its step's tab; the invalid count in the gate options ("· 1 invalid") |
| Frozen | "This version is ACTIVE_VERIFIED: create a new version to change it." and "This version is ACTIVE_VERIFIED - create a new version to change it." under each disabled action | once, under the tabs: "This version is Active (verified) - create a new version to change it." |
| Properties | 17 gate chips; property · effective · from · class · flags; the row expanded into the editor (name, CFG-077 · number · dimensionless, effective, inherited, catalogue start NO_VALUE, bounds, depends on, read by, Set, Reset to inherited with the reasons on hover) | [Property] · "G4 · Actuator effort"; Property · Value · from · Flags; the panel: Policy (+ flags), what it does, Effective 4.5 from LOOP, Inherited 3 from PROFILE, Catalogue start No value, Bounds, Depends on, Read by, Type · unit, the field, Set and Reset to inherited with "Enter or choose a value first" / "Already inherited: this level sets no value of its own" under them |
| Diff & impact | eyebrow DIFF & IMPACT; "36 properties differ from the factory layer" (v6, and the empty draft FIC10301 v1); affects / rollout; VALIDATION No errors ● VALID; Validate in the lifecycle column | "1 property differs from the layers below" (v6: G4.activity_warn_ratio 3 → 4.5; the empty draft: 0 properties differ; a version with a parent still "… from v5"); Affects / Rollout; Validation ✓ Valid · No errors.; Validate under it |
| Shadow | SHADOW EVALUATION not run; the Actions' Shadow button (it only switched tabs); "Validate the bundle first — only a validated bundle can be shadow-run" on an active version; window · diagnosis before → after · gates changed | Shadow evaluation ○ Not run `?`; Run shadow only; a frozen version says nothing under it (the reason is said once); Window · UTC · Diagnosis before → after · Gates changed; Support 6 Nov 10:45 → 7 Nov 10:45 UTC |
| Approval | APPROVAL approved by admin (expired); ● APPROVED admin (Admin) f9153b00 expires 25/09/2026, 20:37:01 UTC · slice-3 e2e review; note and Valid for (h) only while Approve is enabled | Approved by admin ○ Expired (muted once the version was activated; ✕ Expired while it still waits); Decision · Approver · Content · Expires · UTC · Note; Approve `?` (An approval is bound to the content hash and expires. A self-approval, an expired approval or a stale hash is refused by the server.); Approval note, Valid for (h), Approve (the fields shown, disabled with it) |
| Deployments | Activate (Effective from (optional, ISO)) and Roll back in the column; DEPLOYMENTS 2 of this version, newest first; cards Rollback · 25/09/2026 …, the state text, ACTIVE_VERIFIED pill, bundle hash f9153b00aaf3ba1a, effective immediately · epoch — · by admin, rolls back 617f2e13-2ef, the matrix disclosure, probe, "Roll back to the previous bundle" | Effective from (optional, ISO) · Activate · Roll back once at the head; Deployment · UTC · State: Rollback / 25 Sept 18:37 · 5 of 5 PREPARE · 5 of 5 APPLY · ✓ Active (verified); the panel: the state text, Effective · by, Epoch, Rolls back 617f2e13 ⧉, Probe, the matrix (Required worker · PREPARE · APPLY · jar dabe1862; jars per cell and "Active bundle on this job" only when they differ), the semantics, the observers; bundle hash went (Record details) |
| Roll back | acted on the first click | a dialog "Roll back to the previous bundle": Rolls back The activation of v6, 25 Sept 18:37 UTC · Active again v4 ⊘ Superseded / The bundle that ran before it · Cancel · Roll back |
| Missing bundle | Could not load this data · bundle … not found · Retry | Bundle not found · The bundle in the address does not exist (any more). Go back to the levels. · ‹ Bundles |

## CHG-170 owner review: Pipeline Health

Built on the approved sample `samples/pipeline-health-proposal.html` (+ `pipeline-health-steps.html`) and the owner's answers of 11 Nov: the layout as drawn; Last fused verdict by the Overview's rule from one new field (also read by Performance's stale line); added Verified only when the run wrote results, the newest-verdict loop as the default, Stale and Never evaluated links under the verdict tile, and the jobs off the required list as rows; the audit's bugs fixed.

| Where | Was | Now |
|---|---|---|
| Header | System · Pipeline Health `?` (The Flink/Kafka runtime that produces every verdict. This view is read-only; job lifecycle is owned by the supervisor.) | System · Pipeline Health; top right Jobs \| Checkpoint history (no counts) · How to read |
| How to read | (none: four `?` - the title, "What this table leaves out", "Where a sample becomes a verdict", "What the verification does" - and five Telemetry rows reading Not exposed) | a dialog in five titled parts: Job state (✓ Running RUNNING: the engine runs the job. · ◐ Starting INITIALIZING, CREATED, RESTARTING, RECONCILING: the engine is bringing the job up. · ✕ Missing A required job the engine does not list. · ✕ Failed Failed, Failing, Cancelled, Cancelling, Finished, Suspended: the job has stopped or is stopping.), Numbers (Uptime Since the engine started the job. · Checkpoint age Since the job's last completed checkpoint; the tile shows the oldest. · OK / failed Checkpoints since the job started. · Last fused verdict The newest 12h result across the monitored loops, the Overview's rule: ◐ Stale once it is older than 60 min. · — Not read: the engine did not answer, the job is not running, or it is not on the required list. Never an estimate, never 0.), Not exposed (Watermark lag · Kafka consumer lag · Latency · Backpressure · Parallelism: The engine's metrics read does not carry these, and they are not estimated.), Where a sample becomes a verdict (DCS / edge to Kafka, then Flink compute, then Postgres and IoTDB. Job lifecycle is owned by the supervisor; this page never starts or stops a job. Run end-to-end verification does write: it submits a recompute.), End-to-end verification (Submits a recompute on the chosen loop and waits for the batch verdict: historian read, normalise, gates, fused result in Postgres. ✓ Verified only when the run wrote results.) |
| Tiles | REQUIRED JOBS 7/13 analysis engine answering · CHECKPOINT AGE 3.8 min oldest: CPLM Instrument Context Engine · CHECKPOINTS OK / FAILED 247 / 0 since job start (all text underlined in link blue; each scrolled to the table) | Required jobs 7/13 ✕ 6 missing · analysis engine answering · Last fused verdict 96 h window ended 7 Nov 11:45 UTC, ◐ Stale · 165 loops ↗ · Never evaluated 76 ↗ · Checkpoint age 3.8 min oldest: CPLM Instrument Context Engine · Checkpoints ok / failed 247 / 0 ✓ none failed · since job start; each selects the job behind it (the first not running, the oldest checkpoint, the most failures) |
| Tiles, engine down | 0/13 analysis engine not answering · Not exposed · Not exposed | 0/13 ✕ analysis engine not answering · — not read · — not read (the verdict tile still reads) |
| Jobs | Observed jobs `?`; Job · State · Uptime · Checkpoint age · OK / failed (the first row under the header); RUNNING / MISSING; Not exposed three times on a missing row | ALARM · CPLM · PLATFORM · NOT ON THE REQUIRED LIST groups under Job · State · Uptime · Checkpoint age · OK / failed (the first row below the header); ✓ Running / ◐ Starting / ✕ Missing / ✕ Failed …; "Not listed by the engine" once on a missing row; CPLM On-Demand Evaluation ✓ Running — — — |
| Engine details | Technical details under the table: JobManager address, JobManager answering Yes, Jobs the engine runs that are not required | Engine details in the list foot: a dialog, JobManager address ⧉ · Jobs the engine runs that are not required ("JobManager answering" went: the tile says it) |
| Selected job | a dialog: State RUNNING, Role cplm, Uptime, Checkpoints ok / failed, Last checkpoint age, Last checkpoint duration, State size, Technical details (Engine job name, Engine job id, Started 11/11/2026, 10:35:48 UTC); a missing job read Not exposed five times | the panel beside the list (a drawer below 1280 px): CPLM · CPLM Gate Fusion Engine ✓ Running; Uptime, Checkpoints ok / failed, Last checkpoint age, Last checkpoint duration, State size; Record details (Engine job name, Engine job id 0f5aa1b5 ⧉, Started · UTC 11 Nov 10:36); a missing job: The engine does not list this required job, so it has no numbers. If it stays missing, ask the system administrator to check the analysis engine. |
| Telemetry | Telemetry `?`: Watermark lag, Kafka consumer lag, Latency, Backpressure, Parallelism - Not exposed; Last fused verdict · window ended 108 h ago; Checkpoint history · Held only while this page is open · N reading(s) | gone: the five rows in How to read, the verdict a tile, the chart a view |
| Checkpoint history | a closed disclosure; "ckpt age (s)" / "ckpt dur (ms)" cut under the legend | the view `?view=history`: Checkpoint history · CPLM jobs · held only while this page is open · 4 readings; the same chart and tools, the axis names under the legend |
| Verification | End-to-end verification `?`; Run end-to-end verification; VERIFIED / FAILED (FAILED) / STATE UNKNOWN; Loop FIC10301; Analysis run 7c1e…; Round trip; Technical details (Replay id, Engine job id) | under the job panel: End-to-end verification ○ Not run / ◐ Running / ✓ Verified / ✕ Not verified / ✕ Failed / ✕ Cancelled / ? Unknown; Loop FIC10301 Flow controller (FCS0101) · Round trip Completed in 41 s · Results 2 written / None written: no verdict reached the database; foot Record details (Analysis run 7c1e04a2 ⧉ or Run id not returned · Replay id ⧉ · Engine job id ⧉) · Run end-to-end verification |
| Verification, disabled | No loop has a verdict to use as the reference yet | Finding the loop with the newest verdict… (while the ranking is read, about 6 s on the lab) / Reading the loops… / No loop is registered yet (Needs the cpm.manage permission kept) |
| Setup dialog | the loop field alone, AIC30601 by default | Loop (the loop control; the loop with the newest verdict by default, FIC10301 on the lab) · What it does (Submits a recompute on this loop and waits for the batch verdict: historian read, normalise, gates, fused result in Postgres.) · Cancel · Start verification |
| Metrics read failed | Analysis engine metrics unavailable · Retry, above RUNNING rows; tiles Not exposed | ◐ Engine metrics could not be read · the numbers are from 11:52 UTC, 3 min ago · Retry; the last numbers kept (a first read that fails keeps "Analysis engine metrics unavailable") |
| Engine down | 13 MISSING rows, 39 Not exposed | The analysis engine did not answer · Its job list could not be read, so no job can be shown and new verdicts may be late. Retry; if it stays down, ask the system administrator to check the analysis engine. · Retry |
| Performance › stale line | shown when the heatmap's newest window is older than 3 h | shown when the fleet's newest 12 h result is older than 60 min (the field the Last fused verdict tile reads); the words unchanged |

## CHG-172 owner review: Administration

Built on the approved sample `samples/administration-proposal.html` (+ `administration-steps.html`) and the owner's answers of 11 Nov: the layout as drawn with its client-only additions; System settings hidden (answer 2); fixes 3a–3f. Lab values are those read on 11 Nov (read-only); names in the sample were invented.

| Where | Was | Now |
|---|---|---|
| Header | System · Administration; each tab's actions in a bar inside its card: Bulk import · Add user / + New custom role / + New Configuration / Import CSV · + Add Site / Import CSV · + Add Alias | System · Administration (no `?`); top right How to read and the open tab's actions: Bulk import · Add user / Add custom role / Add data source / Import CSV · Add site / Import CSV · Add alias (shown, as before, only with the tab's write permission) |
| Tab row | Users · Roles & permissions · Data sources · Plant model · Tag aliases · Audit log · System settings | Users · Roles & permissions · Data sources · Plant model · Tag aliases, then Audit log ↗ (a link to Governance, shown with admin.audit.view); System settings hidden until a settings service exists |
| Audit log tab page | The audit log is on Governance. · Open Governance → (with "Your role does not include the audit log." when off; it never rendered, the tab redirected) | gone: the link at the end of the tab row |
| System settings | Data retention / Backup and export / Interface and diagnostics, each setting "Not connected"; Save settings with "No settings service is connected, so nothing can be saved." | hidden (tab, route and component removed); /admin/system opens the first tab the role may see; the old /cpm/system?tab=settings opens Governance, as any other unnamed System tab |
| Sidebar tooltip | Users, roles, data sources, plant model, tag aliases and settings | Users, roles, data sources, plant model and tag aliases |
| How to read | four `?`: About roles and permissions (Assign permissions to roles. Everyone with this role is signed out within a few seconds, …), About data sources (OT data sources: MQTT broker connections consumed by the ingestion service.), Onboarding stages (Path segments are permanent identity; names are labels. + the strip), About tag aliases | a dialog for the open tab: Users — Status (✓ Active The account can sign in. · ⊘ Inactive The account cannot sign in.), Role (One role per user. What a role allows is on Roles & permissions.); Roles — Type (System Protected: cannot be renamed or deleted; its permissions can be edited, and Reset to default restores them. · Custom Made here. Delete role moves its users to another role.), Permissions (Permissions are fixed by the product: a role is given some of them, none can be invented.); Data sources — Data sources (the sentence kept), State (✓ Active The ingestion service subscribes to it. · ○ Off Kept, not subscribed.), MODE map (counts as AUTO AUT, CAS · counts as MANUAL MAN, IMAN · NOT RECOGNISED The engine treats it as manual.); Plant model — Levels (Site → Area → Unit → Device → Measurement. Path segments are permanent identity; names are labels.), Marks (CPM Managed by the CPM Loop Registry: the panel opens the loop.); Tag aliases — the sentence kept. "Assign permissions to roles." went; the sign-out sentence stands beside Save permissions |
| Users › counts and filters | 20 users · 20 active · 0 inactive above the filters; Search name or email…; All roles; All statuses | one 32 px row: User name, name or email (the search finds user names since CHG-172) · All roles 20, then each role with its count · All statuses 20 / Active 20 / Inactive 0 (the counts of the users the search finds) |
| Users › rows | the role as a neutral badge "· Engineer"; ✓ Active / · Inactive | Engineer (a word); ✓ Active / ⊘ Inactive; the columns keep their widths whatever the search finds |
| Users › pager | Page 1 of 2 · 60 users · ‹ Prev · Next › | the shared pager, centred (Page 1 of 2 inside it) |
| Users › selected user | a dialog titled with the user name: Email, Created 10/10/2026, Delete, Edit | the panel beside the list (a drawer below 1280 px): superadmin ✓ Active, Super Administrator under the name; Email, Role SuperAdmin Permissions ↗ (role managers), Created 10 Oct 2026; Delete and Edit in the foot |
| Users › own account | Delete answered with the toast "You cannot delete your own account." | Delete disabled, "You cannot delete your own account." under it (the server refuses too) |
| Add user / Edit user | Add user · Create a new account / Edit superadmin · Update role, status, or profile; the password hint under the field; your own role and Active account editable | Add user / Edit user; parts Account and Access; the password hint behind `?`; on your own account Role and Active account disabled with "You cannot change your own role or status."; Edit sends only what changed; every check word for word |
| Users › refusals | "Admin access required." for every 403 | the server's words (Missing required permission: admin.users.edit · Assigning the role 'SuperAdmin' needs the rbac.manage permission, because the role has permissions you do not hold. · CHG-171's 409s); "Admin access required." only when the server sends none |
| Delete user | the shared modal, "Delete user "x"? This cannot be undone." · Cancel · Delete | a dialog, the same words, Cancel · Delete; a refusal stays in the dialog |
| Bulk import users | subtitle Upload a CSV to create or update accounts; "Columns: username, …. Roles: Admin, Engineer, Operator, Viewer." in a blue box; five count boxes; status chips | tabs File · Preview · Result; Columns (Download template) with the column line and "Roles: Admin, Engineer, Operator, Viewer."; File: the drop zone with ".csv · up to 5000 rows"; the counts in one line (4 Total 2 Valid 1 Warnings 0 Duplicates 1 Errors); Options; Rows with ✓ valid / ! warning / = duplicate / ✕ error; Import users off with "Every row has an error." when nothing can be imported |
| Roles › add | + New custom role opening an inline form (the button turned into Cancel) | Add custom role: a dialog, part Role (Role name, Description), Create (off with "Write a role name first"); the notice after it unchanged |
| Roles › list | the name, SYSTEM / CUSTOM | Role / Type: the name with its description under it, System / Custom |
| Roles › selected role | "Engineer system role — protected, permissions editable"; a hidden-label "Role description" field; the keys, what each allows only on hover; "25 selected • unsaved" | eyebrow System role / Custom role, Engineer; Description; Users with this role ↗ (user administrators) · Permissions by role ↗; Permissions: each key with what it allows under it, All / Clear per group; "22 of 38 · unsaved changes" |
| Roles › save | Save permissions; the notice "Saved N permissions for X. Everyone with this role is signed out within a few seconds, and gets the new permissions when they sign in again." | the sign-out sentence once, beside Save permissions (off with "Tick or clear a permission first"); the notice "Saved N permissions for X." |
| Reset to default | acted at once | asks first: Reset to default · "The role gets its default permission set back; changes made on this page are lost." · the sign-out sentence · Cancel · Reset to default; the notice unchanged |
| Delete role | a prompt: "If any users hold this role, enter a role to reassign them to (leave blank to cancel if there are users)." with a free-text field filled with Viewer | a dialog with the same sentence (as drawn) and "Reassign users to" as a list of the other roles (Viewer first), Cancel · Delete role |
| Data sources › list | Search data sources…; each source with "MQTT" under it and an Active / Off pill | Name, type or broker URL (it also matches the profile shown); the profile under the name; ✓ Active / ○ Off |
| Data sources › empty | No data sources configured yet. Click "New Configuration" to connect the OT gateway broker. | No data sources configured yet. Click "Add data source" to connect the OT gateway broker. |
| Data sources › selected source | the name with three pills (MQTT, profile, first topic), no state; Test · Edit · On · Delete; CONNECTION URL … LAST CONNECTION TEST ✓ 25/09/2026, 19:45:25; inline "Delete "x" and its stored credentials?" strip; Technical details | eyebrow Control-Loop Signals (CPA), the name, ✓ Active / ○ Off; Connection URL · Username · Topic filter(s) (every one) · Feeds · QoS · keepalive QoS 1 · 60 s · Timeout 15 s · Last connection test · UTC ✓ 25 Sep 19:45 · Last data received · UTC 6 Oct 19:55; Loop ingest; Test · Edit · Turn off / Turn on · Delete (a dialog, the same question, Cancel · Delete); Record details (Configuration id ⧉, Client id ⧉, Version) |
| Loop ingest | MODE MAP · 4 VALUES (coloured outline); UPPERCASE facts; Edit MODE map editing inside the panel, "Remove" buttons | ✓ MODE map · 4 values / ✕ NO MODE MAP; the facts as rows; Edit MODE map opens a dialog with the same rows, Remove as an icon, Add value, Use Yokogawa CENTUM preset, Cancel · Save MODE map; both warnings word for word |
| Data-source editor | a full-page wizard: New Data Source Configuration / Edit Configuration — name, "Step 4 of 4: Polling and timeouts", a stepper, ← Back to list, Next →, 💾 Create Configuration / 💾 Save Changes; "Name is required" before anything was typed | a dialog Add data source / Edit data source with tabs Profile · Name · Connection · Advanced; Cancel / ← Back · Next: Name → … · Create data source / Save changes; a tab's problem shows once something on it was typed or Next was pressed |
| Editor › words | "Data routing … MQTT topics (step 4, suggested …)"; help under every field; "Leave blank to keep the current password." under the password; 🗑; + Add topic; 🛡 Broker certificate (TLS); Timeout "Used by the connection test (and the subscriber connect attempt in a later phase)."; Next steps after saving: 1. … 2. The ingestion runtime arrives in a later phase — active configurations take effect when it ships 3. Every OT tag … | "MQTT topics (Advanced, suggested …)"; help behind `?` (profile, transport, topic filters, QoS, client ID, keepalive, TLS servername, timeout), the warnings in view (session expiry, clean session, CA path, no CA loaded, Do not verify); the placeholder alone; a Remove topic icon; Add topic; Broker certificate (TLS); "Used by the connection test and the subscriber's connect attempt."; Next steps after saving: 1. … 2. Every OT tag … |
| Plant model › strip | behind the Onboarding stages `?`, with "Each stage feeds the next.", counts read only when it opened ("…" first) | above the tree, read with the page; 1 · Hierarchy 3 / 8 / 29 → … → 5 · Ingestion sources 8; the sentence went (the arrows say it) |
| Plant model › tree | Search by name or path (min. 2 characters)…; + Add Site; each row: + Area / + Unit … · Edit · Delete, the path beside the name, the template chip, [unit], CPM · FC10711 ↗ on the device and each of its signals; Expand / Collapse | Name or path, 2 characters or more; Add site (header); each row: level, the name with its path under it, CPM on the loop's device only; Expand <name> / Collapse <name> |
| Plant model › selected node | (none) | the panel: Device · FC10711; Path ⧉, Description, Template, Managed by CPM Loop Registry, a measurement's Engineering unit and Limits; Add <child level> · Edit · Delete; Loop Registry → (a CPM node) |
| Plant model › editor | Add Area under Dallas Terminal, subtitle "The path segment is permanent identity — the display name can change later."; hint "Letters, digits, _ and - only. Full path: dallas/"; Edit Site HDPE Plant (subtitle the path) | Add Area / Edit Site; Place (Under: HDPE Plant · hdpe, Full path / Path); Names (Display name *, Path segment * with the rule behind `?` and the identity sentence under it, Description); Type (Template, Engineering unit, Low limit, High limit; hints behind `?`); Create Area off with "Display name is required" or the segment error |
| Plant model › delete | the shared modal ending in Confirm | Delete Device: the same question, Cancel · Delete |
| Plant CSV import | subtitle "Source → Review → Import. Nothing is written until the last step."; "Columns: … Download template" | tabs Source · Review · Import with "Nothing is written until the last step." beside them; Columns (Download template); File contents; Validate → off with "Paste the file contents first"; the rest as before |
| Tag aliases › list | Search by tag or path…; Legacy / OT tag · Canonical UNS path · Source · Active (active on every row) · Delete on every row; "Showing 500 of 703 — narrow with search." | Tag or path · All sources 703 / instrumental-pro … / ot-gateway … (a dropdown with counts); Tag → UNS path (the path under the tag) · Source; ⊘ Inactive only on an inactive row; the shared pager, 100 a page; the search ignores case (server, CHG-172) |
| Tag aliases › selected alias | (none) | the panel: Tag alias · FCS0102.PIC30102.PV ✓ Active; Canonical UNS path, Source; Plant model ↗ (the tree searched by the path); Delete in the foot |
| Add tag alias | subtitle "Maps an OT/legacy tag name to its canonical UNS path."; hints under the fields; Create alias off without a reason | part Mapping; hints behind `?`; Create alias off with "Enter the tag and its UNS path first" |
| Import tag aliases | subtitle "Columns: legacy_path, canonical_path, source_system"; the rule sentence with Download template beside it | Columns (Download template): "legacy_path, canonical_path, source_system. Duplicate (legacy_path, source_system) pairs are reported per row, not fatal."; File contents; Import off with "Paste the file contents first" |
| Delete alias | the shared modal ending in Confirm | Delete alias: the same question, Cancel · Delete |

## CHG-174 owner review: Governance

Built on the approved sample `samples/governance-proposal.html` (+ `governance-steps.html`) and the owner's answers of 11 Nov: the layout as drawn; added only a time range, server paging and one access rule (answer 2); not built: Export CSV, Full history, filters in the address, before / after values, expired approvals shown apart (answer 3); the audit findings that need no new capability fixed (answer 4). Lab values are those read on 11 Nov (read-only); names in the sample were invented.

| Where | Was | Now |
|---|---|---|
| Header | System · Governance with a `?` ("Who changed what, under which calculation versions, and which duties are separated by the permission model."); Verify audit chain top right | System · Governance (no `?`, no sentence); top right How to read and, on the Audit trail tab, Verify audit chain with one line under it: "Not verified in this session." / "Walking the full chain…" / "Last run 11 Nov 14:18 UTC" / "✕ Verify failed · 11 Nov 14:18 UTC" / "✕ audit-service not reached · 11 Nov 14:18 UTC" |
| Page | one long scroll: the trail, Audit integrity, then Change traceability (with "APPROVALS · Gate configuration awaiting approval") beside "Separation of duties · As enforced by the permission model" for system.manage holders | four tabs in `?tab=`, without counts: Audit trail · Approvals · Separation of duties · Change traceability; a user without system.manage sees the Audit trail alone, with no tab row |
| How to read | five `?`: the title, How these filters differ ("User and Event type ask the server, so they reach older records. Find searches only the rows fetched."), About the audit chain, Why versions are stored ("… in its payload (A13), so …"), When a permission change applies | a dialog for the open tab: Audit trail — Actor (a user name / System / Not recorded by name), Action (✓ Activated, acknowledged, approved, verified. · ◐ Shelved. · ✕ Deleted or rejected. · Any other change.), Filters ("Entity, User, Event type and the time range ask the server, so they reach older records. Find searches only the rows fetched. User matches the exact user name, in any case."), Audit chain (the sentence kept); Approvals — State (◐ Validated, Shadow evaluated: Waits for an independent approver. · ◐ Approved: Waits for activation. · ✕ Activation failed, Partially acknowledged: NOT active: activate again once the fleet is fixed.), Rules (Approve: "Needs cpm.config.approve (by someone other than the author)." · Approval: "An approval is bound to the content hash and expires. A self-approval, an expired approval or a stale hash is refused by the server." · Site-wide change: "a site-wide or objective / test-permission change needs an approver with the ControlAuthority role", cplm-api's own words, stated nowhere before); Separation of duties — Marks, When a permission change applies (the sentence kept); Change traceability — Why versions are stored (without "(A13)"). The title's sentence went |
| Audit trail › filters | four labelled 40 px fields ENTITY (All entities, CPM loops, CPM events, HMI displays), FIND EVENT ("Searches the rows fetched"), USER ("Exact user name"), EVENT TYPE (the types seen in the rows fetched) and a lone `?` "How these filters differ" | one 32 px row: Find event "Actor, action, entity" (it also matches the words shown) · User "Exact user name" (the server now ignores case: "Superadmin" finds superadmin) · All entities (every type the services record: CPM loops, CPM events, Gate configuration bundles, Configuration deployments, Data sources, HMI displays, Roles, Role permissions, Users, System models, Audit chain) · All events (every event type the emitters write, grouped by entity; with an entity chosen, only its own) · All time / Last 24 hours / Last 7 days / Last 30 days / Custom range (From, To) — added, answer 2 |
| Audit trail › columns | When / actor (a grey bordered button "04/11/2026, 13:04:11 UTC", the actor under it: a user name, "system" or a user id) · Action (a pill with a dot: "Config draft approved", "CPM evidence republished bulk", "Ingestion datasource tested", "RBAC role permissions reset") · Entity (the type over its raw id: "CPM loop · bulk:20", a GUID) | When · UTC "4 Nov 13:04" · Actor (user name, System, or Not recorded by name for an old event recorded by user id) · Action in words with tone and glyph ("✓ Draft approved", "Evidence republished (bulk)", "Data source tested", "Role permissions reset", "✕ Loop deleted"; a bulk activation of 0 loops without the good tone; a deployment reads "Rollback scheduled" / "Activation scheduled" with its bundle when the page can read it, else "Deployment scheduled") · Entity by short name ("FIC10503", "20 loops", "EVT-2230", "FIC10302 · v7", "Engineer", a raw id cut to 8 characters) with its type under it |
| Audit trail › pager | "1–25 of 200 fetched · page 1 of 8 · newest 200 of 4825, older entries are not fetched · times in UTC" between ← Prev and Next → | the shared pager over every event on the server (25 a page), centred, "4,825 events" at its end; with an older audit-service that does not page: the newest 200 paged here and "Newest 200 of 4,825"; no pager and no count under "No audit events match" |
| Audit trail › empty | "No audit events match · The trail records logins, display changes and CPM governance actions." / "No governance events recorded yet · CPM onboarding, ack/shelve, recompute and display changes emit here from now on." | "No audit events match · The trail records display, CPM, gate-configuration, data-source, role and user changes." / "No governance events recorded yet · Display, CPM, gate-configuration, data-source, role and user changes are recorded here as they happen." (no service records logins) |
| Audit trail › selected event | a dialog from the row's date, titled with the action: When, Actor ("Not recorded" when empty), Action (the pill again), Entity, Correlation, Hash (64 characters) with a grey Copy, Before and after values: Not available, Technical details (Event id, Entity type, Timestamp (as recorded)); Open loop ↗ for a single loop only | the panel beside the list (a drawer below 1280 px), opening on the newest event: the entity type as eyebrow, the action once; Actor (for an id-only event: "Recorded by user id only; the id is in Record details."), When · UTC "4 Nov 2026 13:04:11", Entity ("TIC20104 is not in the loop registry." kept), Before and after values: Not available (kept); one flat link where one exists and the user may open it: FIC10503 ↗ (Loop Registry), FIC10302 · v7 ↗ (Gate Configuration on the Approval / Shadow / Properties tab; a deployment on Deployments), Engineer ↗ (Administration › Roles, rbac.manage), Users ↗ (Administration › Users, admin.users.edit); an HMI display has none in the CPA build; Record details in the foot |
| Audit trail › Record details | Correlation, Hash and Copy in the dialog body; Technical details | a dialog in parts: Event (Event id ⧉, Event type, Recorded at), Actor (User name, or User id ⧉ for an old id-only event), Entity (Entity type, Entity id ⧉), Chain (Hash "3fa9c2d81e07…" ⧉ copying it whole, Correlation "Not recorded" or ⧉) |
| Audit integrity | a card: "Not verified in this session." / "audit-service answered the last verification. Open Verify audit chain for its words." / "VERIFY FAILED The last verification failed." and the not-served sentence | gone: its line sits under Verify audit chain, its `?` in How to read |
| Verify audit chain dialog | "Run at 11/11/2026, 14:17:06 UTC"; "VERIFY FAILED Failed to fetch" and "A 500 here means …" when the request never left the browser; the not-served sentence twice | parts Answer ("audit-service answered:" and its sentence; "✕ Verify failed" with the service's words, "A 500 here means the service reported possible tampering or could not complete the walk." on a 500 only; "audit-service could not be reached, so the chain was not checked." when it was not reached) · Run at "11 Nov 14:18 UTC" · Not served (the sentence once); Run again · Close |
| Approvals | "APPROVALS · Gate configuration awaiting approval" under the versions; site · scope · version · state · class · author · updated · Open → (raw codes APPROVED, POLICY; "v7 · 337ddfe7"); Open → landing on Properties; without cpm.config.read the raw 403 message | its own tab, "Waiting for approval or activation": Bundle ("FIC10301 · v2", "Loop · v2" under it, the site where sites differ, ◆ State boundary when not Policy) · State (◐ Validated / ◐ Shadow evaluated / ◐ Approved / ✕ Activation failed / ✕ Partially acknowledged) · Author · Updated · UTC; the selected bundle in a panel: Site, Scope, Change class, Author, Updated · UTC, Waits for (Approval / Activation / A new activation (NOT active)), FIC10301 ↗, Record details (Bundle id ⧉, Content hash ⧉) and Open approval → / Open deployments → on that Gate Configuration tab; read from the summary projection; the two empty sentences kept; without cpm.config.read "The approval queue needs the cpm.config.read permission · Gate-configuration bundles are read with it; approving and activating stay on Gate Configuration." |
| Separation of duties | "Separation of duties · As enforced by the permission model", "5 role(s) · live", half width (Admin and Engineer in view, the permission names scrolling away); six permissions with Governance's own texts (cpm.manage · Loop onboarding, event ack/shelve, recompute; system.manage · Pipeline and OPC mutations; admin.audit.view · Audit trail reads; analytics.view · Every CPM read; rbac.manage · Role and permission changes; display.edit · Authoring HMI displays); "… cannot verify. The enforcement points below are route guards in this build." | its own tab, full width, every role in view, the permission column kept in place when the matrix scrolls; ten permissions (cpm.config.draft, cpm.config.approve, cpm.config.activate and admin.users.edit added) with one description each, the catalog's words as Administration › Roles shows them (e.g. "Manage pipeline jobs and OPC connections; view Pipeline Health and Governance"); the count went; "… so this panel will not describe a permission model it cannot verify." (the route-guard sentence went: nothing was below it) |
| Change traceability | Calculation engine "v3.0.0 · CplmGateFusionEngine (Flink)", Dynamics profile, cplm-api build, Registered loops 243, Threshold profiles in use, Technical details ("Engine build 1 · calc 3.0.0 · commit 072bb0de…(40 characters)-dirty · jar …"); "v— · —" when the read failed | its own tab: "Producing today's verdicts" · Calculation engine, Dynamics profile, Threshold profiles in use ("—" while the loops are not read); Build details (a dialog: Service — cplm-api build; Engine builds observed — "calc 3.0.0 · commit 072bb0de1234-dirty · jar …", each ⧉); a failed read: "Calculation versions could not be read" with the service's words and Retry (Build details: "Build details could not be read" with Retry). Registered loops went (the top bar shows "243 loops") |
| Who opens Governance | the sidebar for system.manage only; the route and the palette for system.manage or any administration key (admin.users.edit, admin.audit.view, rbac.manage, ingestion.view, ingestion.manage) | system.manage or admin.audit.view in all three; the tabs other than the trail still need system.manage (answer 2; no server check changed) |

## CHG-175 owner review: Trend

Built on the approved sample `samples/trend-proposal.html` (+ `trend-steps.html`) and the owner's answers of 11 Nov: the layout as drawn (the Historical CHG-159 pattern); the fixes, the chart-reading fixes and the four additions approved; not built: units on the pens and the axes (the legend stays "PV 77.87"), any export, any change to links that carry tags. Added on 12 Nov by the owner: a loop pen whose binding the resolver only derived from the path reads as not read. Lab values are those read on 11 and 12 Nov (read-only).

| Where | Was | Now |
|---|---|---|
| Header | Engineering · Trend, no `?` | the same |
| Band | a grey strip: the loop field, From and To always shown ("dd/mm/yyyy --:-- --" while live, 12-hour "06/11/2026 10:45 AM", the first digit cut at 1440 px), Apply window (still highlighted once applied), then Live › and PINNED WINDOW, and Open loop ↗ on a second row at 1440 px | a card with 32 px controls: the loop field · the range drop-down · the stepper "‹ 6 Nov 10:45 → 22:45 ›" · Pause · Now; Loop Explorer ↗ (outlined) and Historical ↗ (flat, Historical on the same loop and period) at the far end, only for a loop in the registry. Without analytics.view the same card without the loop field |
| Range | five buttons in the time bar under the chart, 15m 1h 8h 1d 1w, gone while a window was applied | one drop-down named by its options: 15m · 1h · 8h · 24h · 7d · Custom, live and fixed; a fixed period whose span is a range reads that range, else Custom; old links with `range=1d` / `range=1w` open 24h / 7d |
| Steps | ◀ "Step back" and ▶▶ "Step forward" (half a period; ▶▶ stepped into the future: three steps from 7 d drew 11 → 18 Nov, empty); none on a pinned window | ‹ "Half a period earlier" and › "Half a period later" on the stepper, for a live, paused or fixed period; › stops at now and is disabled when the period ends now (always while live) |
| Pause | ⏸ / ▶ "Play/Pause" | Pause, Resume while paused; disabled once stepped away from now, absent on Custom |
| Back to live | Now "Jump to live" in the time bar and Live › in the band (the same action twice) | Now in the band (outlined): back to the live range, the zoom reset |
| Custom | From, To and Apply window always in the band | Custom, or a click on the dates, opens From · To · Apply in the band (site zone, nothing cut at 1440 px); "Enter both dates." and '"To" must be after "From".' unchanged |
| Head row | the legend alone above the plot; Zoom area · Undo · Reset in the time bar (live) or in a zoom bar between two clocks "06/11, 14:45:00" (pinned) | one row: the legend exactly as before (swatch, name, value at the cursor, × removes, a click hides), Signals ▾, then Zoom area · Undo · Reset at the right end, live and fixed; the clocks went |
| Signals ▾ | none: a removed pen came back only by choosing the same loop again | lists PV, SP, OP and VP with their pen's swatch, ticked while drawn; ticking brings a removed pen back (the same `roles=` the × writes); a role the registry has not mapped reads "unmapped" (VP "not applicable" / "not installed" as on Historical's chip) and cannot be ticked; not offered for tags from a link |
| State | LIVE / PAUSED / HISTORICAL / NO NEW SAMPLES in green capitals at the end of the time bar; PINNED WINDOW in grey capitals in the band | a foot strip: "● Live" (success tone), "◐ No new samples" (caution tone), "‖ Paused", "○ Fixed period" (a stepped or pinned period), then "· times in UTC" (the site zone's short name), once |
| Notes | "live · viewport held while zoomed, Reset to follow" beside the zoom tools; "1 pen(s) failed to load: OP - values shown may be incomplete" above the plot | at the foot's right end: "Zoomed · Reset to follow live" (live and zoomed); "◐ OP not read · the values shown may be incomplete" (several: "◐ PV, SP not read · …"). Loop pens: a fallback binding reads as not read (nothing is read from the path-derived series) |
| Times | the From / To inputs in the site zone; the clocks, the axis and the tooltip in the browser zone; ticks "15:00:00", seven "00:00:00" on 1w; the tooltip "2026-11-06 20:32:41" | every time in the site zone; ticks "11:00" (seconds only under ten minutes on screen) and "5 Nov" where a day starts; a tick label that would overlap its neighbour is left out (they ran together at 390 px); the cursor's time "6 Nov 20:32"; the band "6 Nov 10:45 → 22:45" |
| Cursor tooltip | shown about 30 ms after the pointer stopped, gone by 630 ms | stays while the pointer rests, also after a live tick re-draws the chart; the look unchanged |
| Gaps | a straight line across time with nothing stored (5 Nov 08:00 → 6 Nov 07:30 on 7 d) | the line breaks where nothing was stored for more than five of the series' own sample periods |
| Empty page | empty axes, slider and time bar, nothing said | "Select a loop" where the plot would be, no foot; without analytics.view and no tags: "No tags selected" |
| Loop not in the registry | "Loop not found" in the chart under the band's "FIC99999 is not in the loop registry." | the band's line only; no Loop Explorer ↗ or Historical ↗ |
| Address | a range or a step never written; a `?range=` link opened on the page ignored until a reload | a range choice and Now write `?range=`; a step and Custom write `?from=` / `?to=`; a `?range=` link applies at once; Back and Forward reopen what was drawn |
| Designer's trend dialog and canvas symbol (same engine) | ticks "15:00:00", the tooltip time in the browser zone, gaps drawn as lines, the tooltip gone after 30 ms | the same fixes in their display zone ("local" = the browser's): ticks without seconds and a date where a day starts (an overlapping label left out), the cursor time in that zone, gaps broken, the tooltip kept; their time bar (15m 1h 8h 1d 1w, the clocks, LIVE) unchanged |


## CHG-177 owner review: Overview

Built on the approved sample `samples/overview-v2-proposal.html` (+ `overview-v2-steps.html`) and the owner's answers of 12 Nov: approved as drawn, plus (1) the "2 shelved ↗" link removed ("remove shelve link"), (2) Top-priority finding removed, (3) Calculation basis and the chart's `?` moved into How to read, (4) Recent events of the page's window only (client side), (5) the one-line empty trend on every page that draws it, and no "—" pills when nothing live arrives. Lab values are those read on 12 Nov (read-only).

Removed on the owner's instruction (12 Nov): Calculation basis (page foot; its sentence is in How to read); Configuration & coverage → (page foot; the Loop Registry is in the sidebar under Set up); "2 shelved ↗" in the head of Loops requiring review (answer 1; How to read says shelved loops are listed in Loop Events); Zoom area, Undo and Reset under the Overview's trend (Loop Explorer, Investigation, Historical and Trend keep them); Top-priority finding (answer 2: the card link "FIC10301 · Oscillation confirmed" and its empty sentence); the queue title's `?` How this is ordered and the trend's `?` How to read this trend on the Overview (answer 3: both in How to read); the empty Select a loop panel with All loops in Performance →, View all loops and Review shelved loops in the empty queue, and Open Performance under a missing loop (the sample: View all → opens the same page; one line instead of a block).

| Where | Was | Now |
|---|---|---|
| Header | Find problems · Overview, 12h \| 24h top right | the same, How to read before 12h \| 24h |
| How to read | (none: the page-foot Calculation basis dialog with one sentence, "Each monitored loop counted once from its newest 12h result, at most 60 min old · normal mode ≥ 95 % · at limit > 10 % · findings = suspected or confirmed"; the queue title's `?` How this is ordered; the trend's `?` How to read this trend) | a dialog in three titled parts: The cards (Each monitored loop: "Counted once, from its newest 12h result, at most 60 min old." · In auto mode: "AUTO / CASCADE ≥ 95 % of the window." · Saturated / at limit: "OP fully open or closed > 10 % of the window." · Findings: "Suspected or confirmed."; the thresholds as served); Loops requiring review (Order: "Priority (loop criticality × finding severity), then time outside the good-error band, then how long the condition has persisted, then evidence score." · Shelved loops: "Left out; listed in Loop Events."); The trend (Shaded band: "The lowest-to-highest PV inside each plotted point. Each point averages many samples; the band shows the swing the average hides.") |
| Cards | a card around the ten cards with "241 loops monitored" inside; four to a row at 1000 px (Stale and Never evaluated alone on a third row) | no card around them: "241 loops monitored" once, the small note; the ten cards in today's order with their icons on the page's five-column grid, the panels' columns; five to a row down to 960 px, two to a row below |
| Loops requiring review › head | Loops requiring review `?` · 2 shelved ↗ · View all → (outlined) | Loops requiring review · View all → (flat, like All events →) |
| Loops requiring review › empty | a 271 px block: "No current findings · No loop has a current confirmed or suspected finding. The operating picture above shows the rest of the fleet." View all loops; all shelved: "Every current finding is shelved (2). Shelved loops are reviewed in Loop Events." Review shelved loops; a Loading… block | one 74 px line: "Loops requiring review · No current findings · View all →"; all shelved: "… Every current finding is shelved · View all →"; "… Loading… · View all →" |
| Loops requiring review › rows | two lines per row: "High priority", "FIC10301 →", "Acknowledged" (grey dot), "DIAGNOSIS \| Oscillation confirmed", `?`; under them "Flow controller (FCS0101) · Section 400" and the bar "41% in band" | a heading line PRIORITY · LOOP · DIAGNOSIS · IN BAND, then one line per row: "High", "FIC10301 →", "✓ Acknowledged" (success tone, Loop Events' words; a shelf that ran out, back in the queue: "! Shelf expired · unreviewed"), "● Oscillation confirmed", the bar "41%", `?` Why FIC10301 is here; the name and section went; at 600 px and under the heading hides and "priority", "Diagnosis" and "in band" come back on the row |
| Chosen loop | eyebrow "FLOW CONTROLLER FIC10301 (FCS0101)", title "FIC10301", Review FIC10301 →; PV — · SP — · OP — · MODE — · SIGNAL QUALITY No signal; "no live publisher for this loop · envelope 12/11/2026, 1:16:00 UTC → 12/11/2026, 9:16:00 UTC" (live: "live · source … · feed … · envelope …"); the trend's `?`, Fit to data \| Engineering range, the chart, Zoom area · Undo · Reset; beside the queue, 1.4 : 0.7 | "FIC10301" and Review → on one line; while nothing live arrives "SIGNAL QUALITY No signal" alone (PV, SP, OP and MODE come back with the first value); no time line; Fit to data \| Engineering range and the chart (pens, colours, axes, legend, 260 px) without the `?` and the zoom tools; columns 4–5 beside the rows; with no rows and `?loop=`, the full width under the queue's line |
| Chosen loop › nothing stored | "No historian data for this loop · No PV / SP / OP samples were stored for this loop in the last 8 h. Check its signal mapping in the Loop Registry; if every loop is empty, check Pipeline Health. (Historian series: root.…)" Signal mapping in the Loop Registry → · Pipeline Health → | one line: "No PV, SP or OP samples stored in the last 8 h · Signal mapping ↗ · Pipeline Health ↗" (Pipeline Health for system.manage, as before) |
| Chosen loop › no values | "no signal values in this trend range · The historian returned the time range but no PV, SP or OP samples in it — the feed may have stopped. The live values above show when the last sample arrived." | one line: "No PV, SP or OP values in the last 8 h" |
| Chosen loop › loading | "Loading trend…" block | "Loading trend…" one line |
| Select a loop | a 271 px panel: "Select a loop · Pick a loop in the priority queue to see its live signals and trend here." All loops in Performance → | not drawn (with rows the top row is chosen by default) |
| Missing loop (`?loop=ZZZ999`) | "Loop "ZZZ999" is not in the ranking · It may be unmonitored, not yet evaluated, or no longer registered. Pick a loop from the priority queue, or search the full list in Performance." Open Performance | one line: "No loop ZZZ999" |
| Top-priority finding | a 175 px panel: one link "FIC10301 · Oscillation confirmed  Flow controller (FCS0101)  ● High priority →"; empty: "No loop has a current finding. Verdicts appear once a loop completes an evaluation window." | removed: the queue's first row is the top-priority finding, highlighted and shown beside it |
| Recent events | a 385 px column beside Top-priority finding; "5 Oct · 07:45  PIC40102  Oscillation confirmed" twice (its 12h and 24h episodes); the three newest of either window | last, full width; heading OPENED · UTC · LOOP · EVENT; "5 Oct 07:45  PIC40102  Oscillation confirmed"; the twelve newest read and the first three of the page's window listed (an episode with no window kind recorded counts as the page's); All events → unchanged |
| Page foot | Calculation basis · Configuration & coverage → | removed |
| Loop Explorer and Investigation trend › no values (shared trend, answer 5) | "Trend: no signal values in this trend range · The historian returned the time range but no PV, SP or OP samples in it — the feed may have stopped. The live values above show when the last sample arrived." | one line: "Trend: no PV, SP or OP values in this range" (each chart's caption in front, as before; with none, "No PV, SP or OP values in this range"); their zoom tools and `?` unchanged |
| Chosen loop › signal row (owner, 12 Nov, after the build) | nothing live: "Signal quality · No signal" alone; pills only once a value arrived | PV · SP · OP · MODE pills always (— until a value arrives); no Signal quality pill on the Overview (Loop Explorer keeps it) |

## CHG-180 Session-ended dialog

| Where | Was | Now |
|---|---|---|
| Session ended (idle) | warning modal (amber bar and icon) "Signed out due to inactivity" · "Your session ended because there was no activity for the configured idle period. Sign in again to continue." · OK | Traverse dialog "Signed out" · "No activity for the idle period. Sign in to continue." · Sign in |
| Session ended (time limit) | warning modal "Session length limit reached" · "Your session reached its maximum allowed duration and was closed. Sign in again to continue." · OK | Traverse dialog "Session ended" · "The session reached its time limit. Sign in to continue." · Sign in |
