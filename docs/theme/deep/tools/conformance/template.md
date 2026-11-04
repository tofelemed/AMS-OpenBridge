# CPA conformance matrix (Part H)

| Field | Value |
|---|---|
| Document | Part H of the CPA redesign analysis. Read-only: no application file changed |
| Date | 2026-11-04 |
| Measures | Every live CPA route against CPA01, CPA02, the requirements on pp.11-13, the p.28 corrections and G01-G12 |
| Baseline | [cpa-currenttheme.md](../cpa-currenttheme.md) (called Baseline below), commit `16184182` |
| Rules | `Traverse_UI_Design_and_Development_Guide_R01.pdf`, `.claude/skills/traverse-design-system/` (skill R1.1) |
| Rebuild | `python -B docs/theme/deep/tools/conformance/build.py`. Totals are computed from the cells |

## Summary

{{TOTALS}}

CPA does not yet pass as a Traverse module. The shell, tokens and keyboard checks fail on every route, and neither concept page exists as one page: CPA01 lacks a ranked table with coverage, and CPA02 is split across Loop Explorer and Historical. Strong parts already exist and should be kept: the KPI drill-down, the evidence workbench, the event review lifecycle and the governed configuration.

G11 accounts for 32 of the not-assessable cells, because CPA has no AI output to judge. Section 2.6 lists every cell the populated crawl should update.

## How to read this

- **Pass** means the written requirement is met. **Fail** means it is not. The guide's pass conditions have no partial state, so every Baseline "Partial" scores as fail, and the evidence says which part is missing.
- **Not assessable** means the evidence available cannot decide the cell. `*` means **re-measure**: the first analysis had no populated data for this cell, so the verdict comes from source and should be updated from the new crawl.
- **`·`** means the requirement does not address this route, for example G10 where nothing is saved. These {{N_DOTS}} cells are not counted.
- Precedence follows the skill: tokens and shared rules first, then each page's written requirements and the corrections list, then the concept images for hierarchy and density only.
- Paths are under `src/frontend-ob/src/components/Cpm` unless they start with another folder. `cplm-api` paths are under `src/services/cplm-api`. Screenshot paths are under `docs/theme/screenshots/current/`.

**Two changes from the Baseline.**

1. Baseline §9.1 fails G01 for the whole product, partly because Night is achromatic instead of Graphite and Cyan. That decision is still open (Q2), and G02 already scores the token gap. So G01 here fails a route only for a defect on that route: a chart that keeps old colours, an unthemed tooltip, or contrast failures that Night adds.
2. Since `16184182` only `evidence/useEvidenceWindows.ts`, its test and `api/cpm/gates.ts` changed in the front end. No cell is affected.

**Lab state.** Baseline §7.4 applies: 165 of 243 loops were stale, 76 never evaluated, and the dev server read an old historian prefix. Most `*` cells trace to that.

## 1. Suite patterns

Every module uses the same page skeleton. CPA should follow it (G03; p.29 "add a module-specific layout only when its task requires it").

**The pattern in one line:** title block with module breadcrumb and period, one summary strip, a primary work panel, a persistent right inspector with one primary action, and a full-width ledger below.

| Module | Overview page | Detail page | Evidence step | Inspector | Title block |
|---|---|---|---|---|---|
| Truss | TRS01 p.8: spatial or relationship view; observations band at foot | TRS02 p.9: relationship graph; Related records table under it | Connected evidence list opens PI, APM, Alarms, Instrumental; links keep asset and time (p.8) | Asset identity, state badges, evidence list, AI brief, primary Inspect asset | Module label, title, plant path, period and zone at right |
| CPA | CPA01 p.11: three-figure strip, distribution, filter bar, review queue | CPA02 p.12: Mode, PV, SP, Window strip; PV and SP over output; Review periods table | Open evidence; source link per review period; Compare and Export | Why this loop or Performance review: identity, reason, named statistics, primary action | `CPA / CONTROL PERFORMANCE`, title, plant and area, period in header |
| Instrumental | INS01 p.14: F, C, S, M, Unknown counters, diagnostic queue | INS02 p.15: identity card left, state history and PV centre, checks right; Diagnostic log at foot | Open device; log with source column | Device, status chip, latest diagnostic, primary Open device | Title, plant line; no breadcrumb on INS01 |
| PLC | PLC01 p.17: Plan, Actual, gap strip; cumulative chart; context lane; Source basis table | PLC02 p.18: ledger left, record and trend right; Audit history strip | Investigate record; Open related event needs a real link (p.18) | Context to review list, primary Investigate record | `PLC / PROVISIONAL WORKFLOW CONCEPT`, title, period |
| Downtime | DWT01 p.20: minutes, events, awaiting strip; timeline; Event ledger | DWT02 p.21: time, duration, state strip; chart and evidence timeline; Audit trail | Timeline, ledger and inspector share one selection (p.20) | Event identity, badges, AI label, Review event and Open RCA; reconcile form on DWT02 | `DOWNTIME / SHIFT EVENT TIMELINE`, title, plant path, period and zone at right |
| RCA | RCA01 p.23: Evidence list, hypothesis map; Event chronology at foot | RCA02 p.24: lifecycle rail, before and after, criteria table | Evidence opens its source record and interval (p.23) | Compare explanations or Closure decision, primary Review evidence or Record review | `RCA / INVESTIGATION WORKSPACE`, title, case id, period and zone at right |

Rules behind the pattern: inspector 320 to 400 px, persistent on wide layouts, drawer on smaller ones (p.6). Selections update the main view and inspector together (p.7). The shared parts are ContextHeader, MetricSummary and DataTable, TrendPanel, EvidencePanel and ReviewForm (p.26).

**CPA today against the pattern.**

| Part | Suite pattern | CPA today | Evidence |
|---|---|---|---|
| Title block | Module breadcrumb, title, identity line, period and zone at right | Task-group eyebrow (FIND PROBLEMS), 19.6 px title and a purpose sentence. The right side holds the 12h/24h toggle, with no period or zone | `day/1440x1024/overview.png`; Baseline §6 |
| Summary strip | One row of 3 to 5 figures or context values | `/cpm` has 10 cards plus a state bar. Loop pages have a context bar with Loop, Location and Period, and no live values | `overview/OperatingPicture.tsx`; `context/LoopContextBar.tsx` |
| Primary panel | One dominant chart or list | On `/cpm` the queue starts about 770 px down at 1440 × 1024, below the KPI panel | `day/1440x1024/overview.png` |
| Inspector | One persistent right column of 320 to 400 px | No shared inspector. `.cpm-grid-2` gives a fluid right third, 380 px at 1440 (measured on the screenshot) and about 540 px at 1920 (calculated). Docked evidence is a fixed 420 px and appears only on selection. `/cpm/explorer` and `/cpm/historical` have no inspector, and `/cpm` opens a modal for analysis | `styles/cpm.css:53,499`; `overview/FocusedLoopDrawer.tsx` |
| Primary action | One at the foot of the inspector | Several raised actions per page, spread through the content | `explorer/summary/LoopSummaryCard.tsx`; `CpmOverview.tsx:148-153` |
| Ledger | Full-width table or timeline at the foot | No review-period ledger. `/cpm` ends with Event trail and Readiness; `/cpm/historical` ends with a selected-window panel | `CpmOverview.tsx:162-197`; `historical/SelectedWindowPanel.tsx` |
| Overview to detail | One hop to the detail page, one to evidence | One hop to Explorer, then a choice of seven pages under Understand the cause and Check a loop | `components/nav/navItems.ts:62-74` |

## 2. Matrix

### 2.1 Routes

The 32 routes are the 31 captured in the Baseline plus the Gate Configuration editor view, which needs a bundle id and was not captured.

{{ROUTE_KEY}}

### 2.2 G01-G12 grid

P pass, F fail, N not assessable, `*` re-measure, `·` not addressed. Evidence for every cell is in 2.3.

{{G_GRID}}

### 2.3 G01-G12 evidence

Each cell in 2.2 appears in exactly one row. The p.28 shared-shell correction is scored under G03 and not counted again.

{{G_EVIDENCE}}

**G04 measurements by route** (`manifest.json`, Day). The ring count is a lower bound, and the walk stops at about 45 tab stops, so a high count does not prove the whole page.

{{KEYBOARD}}

### 2.4 CPA requirements grid

Requirements are broken into single testable rows. A1-A5 are CPA01, B1-B6 are CPA02, R1-R24 are p.13, C1-C5 are p.28. Columns are the 17 routes these rules address. The other 15 routes (`/login`, the Calculations and Relationships tabs, the four Gate Configuration views, `/cpm/governance` and the seven admin tabs) have no cell, because the rules speak of the overview and of loop detail. Their obligations are in G01-G12.

{{CPA_GRID}}

### 2.5 CPA requirements evidence

{{CPA_EVIDENCE}}

### 2.6 Cells to re-measure

The crawl should capture these conditions, then the cells below should be updated in `tools/conformance/cells_*.py`:

| Condition | Why it matters |
|---|---|
| A populated priority queue, with a selected loop and an open focus trend | A1, A3, R2, C1, G05 and G09 on OV |
| A loop with evaluated windows and historian data at the correct prefix | B1, B2, B3, R7 to R9, C2 and C5 on EX, HI, IN, RP and WB |
| `/cpm/kpi` with rows, including not-assessable reasons | A4, A5, R2, R5, G05, G08 on KP |
| Window detail with a density bar | C4, G01, G05 on WI |
| A populated system response event and the review dialog | G01, G05, G08, G10, C5 on SR |
| The Gate Configuration editor view | G01, G04, G05, G08, G10 on CD |
| Chart tooltip, axis and zoom-label state at Night | G01 and C2 on every chart route |
| 1366 and 1920 widths, 200 % zoom and narrow widths for all routes | G12 |

{{REMEASURE}}

## 3. Page anatomy gap

Written rules come first. Items marked *image* come from the concept and set hierarchy only; p.28 says example shapes and numbers are not specifications.

### 3.1 CPA01 against `/cpm`

**The concept shows, CPA lacks.**

| Element | Source | CPA today | Requirement |
|---|---|---|---|
| Assessed, needing review and data coverage as one strip | p.13; *image* p.11 | Denominators only; queue has no total; no coverage % | R1, A4 |
| Ranked table: tag, parent asset, value and unit, state, coverage, last evaluation time | p.13 | Six div rows, no headers, no coverage, no last evaluation time | R2 |
| Sortable headings with a documented rule | p.13 | None. The rule is a sentence over the queue | R3 |
| Review condition filter | p.11 | Only on `/cpm/performance` | A2 |
| Explanation naming the metric or rule that selected the loop | p.13; *image* Why this loop? | LoopFocus shows live values and a trend. Only the queue head gets a sentence, in a separate card | R4, A3 |
| Same interval from overview to detail | p.11 | Page says 12h, focus trend rolls 8 h | A3, R10 |
| Definitions reachable by keyboard | p.11, p.6 | `title` hover on tiles; full proof one click away on `/cpm/kpi` | A4 |
| Rows for unassessed loops with a reason | p.11 | Counted in tiles, not listed in the queue | A5 |
| Distribution of the review metric, with a selected band | *image* p.11; p.28 token rule | No frequency histogram exists anywhere in CPA | C4 |
| Per-row trend mark | *image* p.11 | None | Hierarchy only |
| Compare prior period | *image* p.11 | Explorer only, on an evaluated window | Hierarchy only |
| Plant selector, search, time range and environment indicator in the header | p.6 | Site, Area and Unit selects in the page; Ctrl+K palette; 12h/24h toggle; none in the header | G03 |

**CPA shows, the concept does not.**

| Element | Where | Disposition against the rules |
|---|---|---|
| Seven performance KPI cards and three coverage cards with drill-down and 24 h change | `overview/OperatingPicture.tsx` | Keep the drill-down: the learned rule in `CLAUDE.md` requires it, and `/cpm/kpi` is the strongest proof page. Their density competes with the strip and the queue for first position |
| State bar, one state per loop | `overview/OperatingPicture.tsx:67-85` | Compatible with p.13 coverage. Fix marks under C4 |
| Top-priority finding card | `CpmOverview.tsx:136-160` | Duplicates the queue head; belongs in the inspector |
| Event trail | `CpmOverview.tsx:162-194` | Fits the ledger band; needs plant and window scope (G07) |
| Readiness, configuration limits | `overview/ReadinessStrip.tsx` | Not in the concept. Keep, lower in the page: it limits what can be confirmed |
| Priority badge, shelved count, acknowledged pill | `overview/PriorityQueue.tsx` | ISA-18.2 shelving semantics are correct. Loop priority colours need a decision (p.29, Q12) |
| 12h/24h fused window toggle | Page header | The concept has one global range; Q5 must define the relation |

### 3.2 CPA02 against `/cpm/explorer` and `/cpm/historical`

CPA02 maps to two routes today. Explorer has the summary and tabs, Historical has the aligned trend, and neither has the concept's inspector or review-period table.

**The concept shows, CPA lacks.**

| Element | Source | CPA today | Requirement |
|---|---|---|---|
| PV, SP, controller output and mode on one axis, on the loop's main page | p.12, p.13 | Aligned only on Historical. Explorer shows mode as a tile | B1, R7 |
| Cursor and selected interval synchronised across charts | p.12, p.5 | Within one chart on Historical; none across charts; no value table | B2 |
| Output labelled Controller output | p.12, p.28 | OP on every chart and tile | B6 |
| Mode, saturation, manual and bad-quality periods as context | p.13 | Mode lane on Historical with gaps bridged; no saturation or quality interval | R9 |
| Performance review inspector: pattern, review state, named statistics, evidence action | p.12; *image* | Loop summary above the tabs, KPI cards below the trend, no inspector | B3, R11 |
| Metric contract: unit, eligibility, coverage, baseline, definition version | p.13 | Hover titles; version only in the Calculations drawer and Historical window panel | R11, R15, R16 |
| Review periods table with state and source link | p.12; *image* | Verdict lane (pointer only), History tab that navigates away, Investigation window browser | B3 |
| Related alarm link keeping loop and period | p.12 | Instrument health works in place; no alarm route in the slice | B4, R21 |
| Plotted zoom window shown | p.28 | Buttons with no range | C2 |
| Mode, PV, SP, Window strip with source label | *image* p.12 | Live tiles and a context bar; source not named | Hierarchy only |
| AI hypothesis block | *image* p.12 | None. Do not add one without an AI service (p.7, G11) | Not a gap today |

**CPA shows, the concept does not.**

| Element | Where | Disposition against the rules |
|---|---|---|
| Readiness bar, not producing verdicts | `explorer/ReadinessBar.tsx` | Keep: it explains missing metrics, which p.11 asks for |
| Loop model card, gate profile, historian device | `explorer/LoopModelCard.tsx` | Keep; belongs in an inspector or Signals tab |
| Gate strip G0-G15 with detail | `explorer/summary/SummaryGateStrip.tsx` | Keep as the CPA-specific evidence layer (p.29 allows a module layout where the task needs it) |
| Five tabs: Summary, Signals, Calculations, Relationships, History | `explorer/LoopWorkspace.tsx` | Signals meets B6 and is the nearest thing to the binding view on p.10 |
| Fit to data and Engineering range scale | `trend/SignalTrend.tsx` | Keep; it supports p.13 percentage-of-span honesty |
| KPI overlay, verdict and health lanes, Normalise | `CpmHistorical.tsx` | Extra lanes need labels (G05). More than the concept, within its purpose |
| Loop rail and plant scope on the page | `CpmExplorer.tsx` | Plant moves to the header under p.6; the loop picker becomes the AssetPicker of p.26 |
| Instrument health pill with NE107 detail | `explorer/LoopWorkspace.tsx` | Keep, and fix the chips: fills differ from p.4 and C draws green (NAMUR NE 107; Baseline §4.5). Unknown stays separate |

## 4. Failures that most drive redesign

| Rank | Failure | Cells | Why it shapes the redesign |
|---|---|---|---|
| 1 | No shared shell: no module list, plant selector, search, time range or environment indicator | G03: {{F:G03}} fail | Every page header and the global time rule depend on it (Q4, Q5) |
| 2 | No Traverse tokens: `--traverse-*` has 0 uses | G02: {{F:G02}} fail | Decides the bridge approach and affects every surface (Q1, Q2) |
| 3 | CPA01 has no ranked table, coverage figure or sortable headings | R1, R2, R3, A4 | Rebuilds the Overview hierarchy around a queue table and inspector |
| 4 | CPA02 is split: no page aligns PV, SP, controller output and mode with an inspector and review periods | B1, B6, R7, R9 | Merges Explorer and Historical into one loop page |
| 5 | Keyboard: 0 rows and 0 charts focusable, and four focus styles, none to the guide | G04: {{F:G04}} fail | Forces a shared DataTable and TrendPanel with a keyboard path (p.26) |
| 6 | Context loss: interval and time zone do not travel, and two zones show on one page | G07: {{F:G07}} fail | Needs one ContextLink and one zone rule (p.7, Q8) |

Next in line are chart standards (G05, C2, C5), metric reconciliation (R10, C3, R22), and the shared data-state components (G06: {{F:G06}} fail).

## 5. Limits

- No lab call was made for this part. Verdicts reuse the Baseline's capture and a fresh source reading.
- Keyboard ring detection is a lower bound, and tab position inside `main` was not measured reliably (Baseline §9.9).
- Inspector widths outside 1440 are calculated, not measured.
- Claims marked *inferred* in the Baseline stay inferred here, notably stale chart colours after a theme switch.
- ISA-101.01, ISA-18.2, ISO 9241-110 and NAMUR NE 107 are cited by topic, not clause.
- Passing here does not establish WCAG conformance; the guide says the same (p.27).
