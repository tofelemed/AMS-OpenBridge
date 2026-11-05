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
- The loop-note acknowledgement sentence.
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
