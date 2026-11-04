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

| Set | Pass | Fail | Not assessable | Scored | Of which re-measure | Not addressed (not counted) |
|---|---|---|---|---|---|---|
| G01-G12, 32 routes | 62 | 220 | 42 | 324 | 69 | 60 |
| CPA requirements, 40 rows | 50 | 112 | 4 | 166 | 47 | 1114 |
| **All** | **112** | **332** | **46** | **490** | **116** | **1174** |

CPA does not yet pass as a Traverse module. The shell, tokens and keyboard checks fail on every route, and neither concept page exists as one page: CPA01 lacks a ranked table with coverage, and CPA02 is split across Loop Explorer and Historical. Strong parts already exist and should be kept: the KPI drill-down, the evidence workbench, the event review lifecycle and the governed configuration.

G11 accounts for 32 of the not-assessable cells, because CPA has no AI output to judge. Section 2.6 lists every cell the populated crawl should update.

## How to read this

- **Pass** means the written requirement is met. **Fail** means it is not. The guide's pass conditions have no partial state, so every Baseline "Partial" scores as fail, and the evidence says which part is missing.
- **Not assessable** means the evidence available cannot decide the cell. `*` means **re-measure**: the first analysis had no populated data for this cell, so the verdict comes from source and should be updated from the new crawl.
- **`·`** means the requirement does not address this route, for example G10 where nothing is saved. These 1174 cells are not counted.
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

| Code | Route | Capture slug | Widths captured |
|---|---|---|---|
| LOG | `/login` | login | 1440 |
| OV | `/cpm` | overview | 1440, 1366, 1920 |
| PF | `/cpm/performance` | performance | 1440, 1366, 1920 |
| EV | `/cpm/events` | events | 1440 |
| EX | `/cpm/explorer (Summary)` | explorer | 1440, 1366, 1920 |
| ES | `/cpm/explorer?tab=Signals` | explorer-signals | 1440 |
| EC | `/cpm/explorer?tab=Calculations` | explorer-calculations | 1440 |
| ER | `/cpm/explorer?tab=Relationships` | explorer-relationships | 1440 |
| EH | `/cpm/explorer?tab=History` | explorer-history | 1440 |
| HI | `/cpm/historical` | historical | 1440, 1366, 1920 |
| IN | `/cpm/investigation` | investigation | 1440 |
| WB | `/cpm/evidence` | evidence | 1440 |
| RP | `/cpm/replay` | replay | 1440 |
| WI | `/cpm/windows` | windows | 1440 |
| CA | `/cpm/calculations` | calculations | 1440 |
| SR | `/cpm/response` | response | 1440 |
| RG | `/cpm/registry` | registry | 1440 |
| CF | `/cpm/config (overview)` | config | 1440 |
| CE | `/cpm/config?view=effective` | config-effective | 1440 |
| CB | `/cpm/config?view=bundles` | config-bundles | 1440 |
| CD | `/cpm/config?view=editor` | not captured | none |
| KP | `/cpm/kpi` | kpi | 1440, 1366, 1920 |
| PL | `/cpm/pipeline` | pipeline | 1440 |
| GV | `/cpm/governance` | governance | 1440 |
| TR | `/trend` | trend | 1440 |
| AU | `/admin/users` | admin-users | 1440 |
| AR | `/admin/roles` | admin-roles | 1440 |
| AD | `/admin/data-sources` | admin-data-sources | 1440 |
| AP | `/admin/plant-model` | admin-plant-model | 1440 |
| AA | `/admin/aliases` | admin-aliases | 1440 |
| AL | `/admin/audit` | admin-audit | 1440 |
| AS | `/admin/system` | admin-system | 1440 |

### 2.2 G01-G12 grid

P pass, F fail, N not assessable, `*` re-measure, `·` not addressed. Evidence for every cell is in 2.3.

| Route | G01 | G02 | G03 | G04 | G05 | G06 | G07 | G08 | G09 | G10 | G11 | G12 | P | F | N |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| LOG | P | F | F | F* | P | · | P | · | · | · | N | N* | 3 | 3 | 2 |
| OV | F* | F | F | F | F* | F | F | F | P* | · | N | F | 1 | 9 | 1 |
| PF | P | F | F | F | F | F | F | F | P* | · | N | F | 2 | 8 | 1 |
| EV | P | F | F | F | P | F | F | N* | P | P | N | F* | 4 | 6 | 2 |
| EX | F* | F | F | F | F* | F | F | F | P* | · | N | F | 1 | 9 | 1 |
| ES | P | F | F | F | P | F | F | · | P | · | N | F* | 3 | 6 | 1 |
| EC | P | F | F | F | P | F | F | N* | N* | · | N | F* | 2 | 6 | 3 |
| ER | P | F | F | F | P | F | F | · | P | · | N | F* | 3 | 6 | 1 |
| EH | P | F | F | F | P | F | F | · | P | · | N | F* | 3 | 6 | 1 |
| HI | F | F | F | F | F | F | F | F | P* | · | N | F | 1 | 9 | 1 |
| IN | F* | F | F | F | F* | F | F | F | F | F | N | F* | 0 | 11 | 1 |
| WB | F* | F | F | F | F* | F | F | F | P | · | N | F* | 1 | 9 | 1 |
| RP | F* | F | F | F | F* | F | F | F | F | F | N | F* | 0 | 11 | 1 |
| WI | P* | F | F | F | P* | F | F | F | P* | · | N | F* | 3 | 7 | 1 |
| CA | P | F | F | F | P | F | F | P* | P* | · | N | F* | 4 | 6 | 1 |
| SR | F* | F | F | F | F* | F | F | N* | P* | P* | N | F* | 2 | 8 | 2 |
| RG | P | F | F | F | P | F | F | · | P | F | N | F* | 3 | 7 | 1 |
| CF | P | F | F | F | P | F | P | · | · | · | N | F* | 3 | 5 | 1 |
| CE | P | F | F | F | P | F | P | · | · | · | N | F* | 3 | 5 | 1 |
| CB | P | F | F | F | P | F | P | · | · | P | N | F* | 4 | 5 | 1 |
| CD | N* | F | F | F* | N* | F | P | N* | · | P* | N | F* | 2 | 5 | 4 |
| KP | F* | F | F | F | F* | F | F | P* | P* | · | N | F | 2 | 8 | 1 |
| PL | F* | F | F | F | F* | F | · | F | · | · | N | F* | 0 | 8 | 1 |
| GV | P | F | F | F | P | F | · | · | · | · | N | F* | 2 | 5 | 1 |
| TR | F* | F | F | F | F | F | F | F | F | · | N | F* | 0 | 10 | 1 |
| AU | P | F | F | F | P | F | · | · | · | F | N | F* | 2 | 6 | 1 |
| AR | F | F | F | F | P | F | · | · | · | F | N | F* | 1 | 7 | 1 |
| AD | P | F | F | F | P | F | · | · | · | F | N | F* | 2 | 6 | 1 |
| AP | F | F | F | F | P | F | · | · | N* | F | N | F* | 1 | 7 | 2 |
| AA | P | F | F | F | P | F | · | · | N* | F | N | F* | 2 | 6 | 2 |
| AL | F | F | F | F | P | F | · | · | · | · | N | F* | 1 | 6 | 1 |
| AS | P | F | F | F | · | · | · | · | · | · | N | F* | 1 | 4 | 1 |
| **Pass** | 18 | 0 | 0 | 0 | 19 | 0 | 5 | 2 | 14 | 4 | 0 | 0 | 62 |  |  |
| **Fail** | 13 | 32 | 32 | 32 | 11 | 30 | 18 | 10 | 3 | 8 | 0 | 31 |  | 220 |  |
| **Not assessable** | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 4 | 3 | 0 | 32 | 1 |  |  | 42 |

### 2.3 G01-G12 evidence

Each cell in 2.2 appears in exactly one row. The p.28 shared-shell correction is scored under G03 and not counted again.

| Check | Routes | Verdict | Evidence | Cite |
|---|---|---|---|---|
| G01 | LOG, PF, EV, ES, EC, ER, EH, CA, RG, CF, CE, CB, GV, AU, AD, AA, AS | pass | Captured in Day and Night at 1440 × 1024 with the same labels, URL and selection. No canvas chart on the route, and Night adds no contrast failure (colour-contrast nodes Day to Night: PF 6 to 3, AU 22 to 13, AD 44 to 35, AS 7 to 4, AA 0 to 0). | p.27 G01; manifest.json |
| G01 | WI | pass, re-measure | List view as above. The density bar renders only on a populated window detail, where its Sparse bucket is 1.03:1 in Day and 4.26:1 in Night (Baseline §5.6). | p.27 G01; Baseline §5.6 |
| G01 | HI | fail | Chart tooltip stays white at Night, and the default grid colour is never themed. Seen at runtime: night/states/historical--chart-tooltip.png. | p.27 G01; skill §6 chart chrome; Baseline §5.2 |
| G01 | OV, EX, RP, KP, PL, TR | fail, re-measure | The chart rebuilds on a theme change, but its tooltip keeps the ECharts default (white, #666 text) at Night (Baseline §5.2). | p.27 G01; skill §6 chart chrome |
| G01 | IN, WB, SR | fail, re-measure | C4, C5, C6, C7 and C8 have no theme subscription, so they keep the old theme until the next re-render (inferred from source, Baseline §5.1). | p.27 G01; skill §1 |
| G01 | AR, AP, AL | fail | Night adds contrast failures that Day does not have: AR 6 to 10, AP 6 to 19, AL 19 to 36 colour-contrast nodes. | p.5; WCAG 2.1 SC 1.4.3; manifest.json |
| G01 | CD | not assessable, re-measure | Editor view was not captured; it needs a bundle id in the URL. | p.27 visual review conditions |
| G02 | All 32 | fail | `--traverse-*` has 0 hits in src/frontend-ob/src. Colours resolve from OpenBridge and app tokens, with 46 literal declarations and 124 literal fallbacks in live code; 109 of 130 hex values sit in Designer.css, which /trend loads on every session. | p.27 G02; skill §2, §11; Baseline §4.1 |
| G03 | All except LOG | fail | Text brand only, no approved mark. No module list, plant selector, search field, time range or environment indicator. Selected nav is rgb(221,221,221) with rgb(31,31,31) text, not surface.selected with action.primary. Page title is 19.6 px on CPM pages, 28 px on /admin, and /trend has no h1 (axe page-has-heading-one). | p.6; p.27 G03; p.28 shared shell; WCAG 2.1 SC 3.2.3; Baseline §9.3 |
| G03 | LOG | fail | Outside the shell. The page names the product Traverse Edge where the shell says Traverse CPA, and shows no mark. | p.6; p.28 shared shell; manifest.json text |
| G04 | OV, PF, EV, EX, ES, EC, ER, EH, HI, IN, WB, RP, WI, CA, SR, RG, CF, CE, CB, KP, PL, GV, TR, AU, AR, AD, AP, AA, AL, AS | fail | 0 table rows and 0 charts are focusable (table below). Measured focus styles are 2 px at 1 px offset, 2 px at 2 px, 1 px at 0 to 1 px, and a box-shadow with no outline; none is 2 px with a 3 px gap. Blank-named shell buttons show no detected ring (lower bound, shadow DOM). | p.5; p.27 G04; WCAG 2.1 SC 2.1.1, 2.4.7, 4.1.2; ISO 9241-110 controllability |
| G04 | CD | fail, re-measure | Same shell and same row and chart pattern. The view itself was not in the keyboard crawl. | p.5; p.27 G04; WCAG 2.1 SC 2.1.1, 2.4.7, 4.1.2; ISO 9241-110 controllability |
| G04 | LOG | fail, re-measure | Not in the keyboard crawl. Input focus is a 2 px ring at 30 % alpha with no gap (Login/Login.css:335-337), and the reveal button outline sits inside at -2 px (:369-371). axe reports 0 issues. | p.5; p.27 G04; WCAG 2.1 SC 2.1.1, 2.4.7, 4.1.2; ISO 9241-110 controllability |
| G05 | LOG, EV, ES, EC, ER, EH, CA, RG, CF, CE, CB, GV, AU, AR, AD, AP, AA, AL | pass | Every status has a text label beside its tone (Baseline §4.5). Selected rows add a 3 or 4 px edge as well as a tint (styles/cpm-tables.css:45, styles/cpm.css:194). | p.27 G05; WCAG 2.1 SC 1.4.1 |
| G05 | WI | pass, re-measure | Density bars carry height as well as colour, and the page text states the coding (windows/WindowDetail.tsx:237-254). | p.27 G05; WCAG 2.1 SC 1.4.1 |
| G05 | PF | fail | The legend shows check OK and OK on available data with the same tick and the same ink, so the two differ only in title and aria text (gateStatus.ts:65,67; styles/cpm.css:361,363). DISABLED shares the n/a glyph and is missing from the legend. Seen in day/1366x768/performance.png. | p.27 G05; p.4 meaning stays explicit; Baseline §9.7 |
| G05 | HI | fail | The mode lane is colour only; its text appears only in the tooltip (historical/chartOption.ts:102-106,228). The fifth lane has no label (:187-190). | p.5; p.27 G05; WCAG 2.1 SC 1.4.1; Baseline §5.3 |
| G05 | TR | fail | All three pens are solid with no direct label, and PV draws in the alarm colour. Seen in day/1440x1024/trend.png. | p.5 series rules; p.27 G05; ISA-101.01 colour reservation |
| G05 | OV, EX, IN, RP | fail, re-measure | PV and OP are both solid (2 and 1.5 px) and no series has a direct label; dashed SP is legend-only (trend/trendOption.ts:144-149; `endLabel` and `markPoint` have 0 hits). | p.5 series rules; p.27 G05 |
| G05 | WB | fail, re-measure | SP is solid in the evidence lanes (evidence/SignalContextLanes.tsx:21-30, evidence/HistorianLanes.tsx:19-24). | p.5 setpoint rule; Baseline §5.3 |
| G05 | SR | fail, re-measure | Model fit and holdout prediction are solid lines; predicted values need a distinct labelled pattern (response/ResponseChart.tsx:35-38). | p.5 predicted rule |
| G05 | KP | fail, re-measure | On the KPI trend the selected day differs by colour only (kpi/KpiTrendChart.tsx:53-54), and no-data days say so only in the tooltip. | p.27 G05; WCAG 2.1 SC 1.4.1 |
| G05 | PL | fail, re-measure | Two solid telemetry lines differ only by colour and 0.5 px of width (CpmPipeline.tsx). | p.5 series rules |
| G05 | CD | not assessable, re-measure | Editor view was not captured. | p.27 G05 |
| G05 | AS | does not apply | Static form with no status, selection or chart meaning. | n/a |
| G06 | OV | fail | Loading is text only. Age shown without the word Stale. Readiness failure is silent (overview/ReadinessStrip.tsx:16). | p.7; p.27 G06; skill §9; Baseline §9.8 |
| G06 | PF | fail | Loading is text only. The fleet tile has no retry (CpmPerformance.tsx:228). Source quality reachable only through G0 wording. | p.7; p.27 G06; skill §9; Baseline §9.8 |
| G06 | EV | fail | Loading is text only, with no skeleton or progress. | p.7; p.27 G06; skill §9; Baseline §9.8 |
| G06 | EX, ES, EC, ER, EH | fail | With ?loop= the page shows Select a loop while the registry loads (CpmExplorer.tsx:140-143). Age shown without the word Stale (FacetPill.tsx:56). | p.7; p.27 G06; skill §9; Baseline §9.8 |
| G06 | HI | fail | Select a loop shows during load and for an unknown loop (CpmHistorical.tsx:323). No bad-quality presentation found. | p.7; p.27 G06; skill §9; Baseline §9.8 |
| G06 | IN | fail | Loading is text only, no Stale word, no bad-quality presentation. | p.7; p.27 G06; skill §9; Baseline §9.8 |
| G06 | WB | fail | Empty state explains but offers no reset (evidence/GateEvidenceWorkspace.tsx:182-183). No Stale word. No client permission gate on actions. | p.7; p.27 G06; skill §9; Baseline §9.8 |
| G06 | RP | fail | Loading is text only, empty state has no reset (CpmReplay.tsx:267), no bad-quality presentation, no client permission gate. | p.7; p.27 G06; skill §9; Baseline §9.8 |
| G06 | WI | fail | Header stays CHECKING RUNTIME on failure (CpmWindows.tsx:89,97). Empty state has no reset. Quality reachable only through G0 wording. | p.7; p.27 G06; skill §9; Baseline §9.8 |
| G06 | CA | fail | Select a loop shows during load. VERDICT UNAVAILABLE has no retry (CpmCalculations.tsx:244). | p.7; p.27 G06; skill §9; Baseline §9.8 |
| G06 | SR | fail | Empty state has no reset (response/ResponseWorkspace.tsx:140). Quality shown in part. | p.7; p.27 G06; skill §9; Baseline §9.8 |
| G06 | RG | fail | A filtered-out list says No loops registered, offers Add loop and no reset (LoopRegistry.tsx:99-104). No client permission gate. | p.7; p.27 G06; skill §9; Baseline §9.8 |
| G06 | CF, CE, CB, CD | fail | Users holding analytics.view are redirected to /cpm with no message (App.tsx:808). The other states pass in source. | p.7; p.27 G06; skill §9; Baseline §9.8 |
| G06 | KP | fail | Loading is text only. Age shown without the word Stale (kpi/KpiRowsTable.tsx:63). | p.7; p.27 G06; skill §9; Baseline §9.8 |
| G06 | PL | fail | Silent redirect when restricted. The status tile drops to a dash with no last value or retry (CpmPipeline.tsx:156-157). | p.7; p.27 G06; skill §9; Baseline §9.8 |
| G06 | GV | fail | Search with no match says No governance events recorded yet, with no reset (CpmGovernance.tsx:160-163). Silent redirect when restricted. | p.7; p.27 G06; skill §9; Baseline §9.8 |
| G06 | TR | fail | No tags gives a blank chart. Resolver error is dropped (Designer/TrendCore.tsx:75), unresolved pens return nothing (:188), and failed pens have no retry (:325). | p.7; p.27 G06; skill §9; Baseline §9.8 |
| G06 | AU, AR, AD, AP, AL | fail | Loading is text only, empty text has no filter reset (Administration/UserManagementConfig.tsx:241), and a missing permission redirects to the first allowed tab with no message. | p.7; p.27 G06; skill §9; Baseline §9.8 |
| G06 | AA | fail | No loading state exists (Administration/AliasConfig.tsx), and restricted access redirects silently. | p.7; p.27 G06; skill §9; Baseline §9.8 |
| G06 | LOG, AS | does not apply | Neither page fetches a dataset. /login shows sign-in errors in a role=alert block; /admin/system states it is not connected. | n/a |
| G07 | LOG | pass | Sign-in returns to the requested path with its query string (App.tsx:778; productSlice.ts postLoginPath). | p.7 preserve context |
| G07 | CF, CE, CB, CD | pass | Plant, loop, view, bundle and gate live in the URL, and the menu carries loop and plant (nav/cpmTasks.ts). No interval applies to these views. | p.7 preserve context |
| G07 | OV, PF, KP | fail | explorerHref and performanceHref drop the plant scope (cpaHref.ts:34-40; kpi/kpiProof.ts:108). The menu resets plant, loop and window on fleet pages by design (nav/cpmTasks.ts:57-61). The Overview event trail ignores scope and window (CpmOverview.tsx:52). | p.7; p.27 G07; Baseline §9.4d |
| G07 | EV, ES, ER, EH, CA, SR, WI | fail | The menu carries loop and plant but not the interval. Time zone is neither selectable nor in the URL. Local search, page or sort state is lost on return (CpmEvents.tsx:70-74, CpmCalculations.tsx:54-58). | p.7; p.27 G07; ISO 9241-110 controllability |
| G07 | EX, HI | fail | Period travels only between these two pages. Runtime zones disagree on one page: the context bar says GST and the tooltip says UTC (night/states/historical--chart-tooltip.png). | p.7 time contract; p.27 G07; Baseline §9.4d |
| G07 | EC | fail | Gate outcome buttons open Replay with loop and gate only, so the window and its kind are lost (explorer/CalculationsTab.tsx:69). | p.7; p.27 G07 |
| G07 | IN | fail | Open in Evidence Replay sends the window end without its kind (CpmInvestigation.tsx:323-327). On a 24h profile Replay reads 12h windows and falls back to the newest one. | p.7; p.12 retain period; p.27 G07 |
| G07 | WB, RP | fail | Times use the site zone here and the browser zone elsewhere: UTC on /cpm/evidence and GST on /cpm in one session (night/1440x1024/evidence.png; day/1440x1024/overview.png). | p.7 time contract; p.27 G07 |
| G07 | RG | fail | Search and page are local state, lost on return (LoopRegistry.tsx:29,50). | p.7 restore filters |
| G07 | TR | fail | Tags and range are in the URL, but the page carries no loop identity and its zone is unlabelled (Designer/TrendCore.tsx:117-119). | p.7; p.27 G07 |
| G07 | PL, GV, AU, AR, AD, AP, AA, AL, AS | does not apply | No plant, loop or interval context on these pages. | n/a |
| G08 | OV | fail | Three population figures with no stated relation: 243 in scope, 241 monitored, and 6/242 on Performance (day/1440x1024/overview.png, performance.png). The trend beside a 12h page rolls 8 h (overview/LoopFocus.tsx:31). Stale means 60 min on tiles and window length in the queue. | p.5 chart behaviour; p.13; p.27 G08; Baseline §9.4a |
| G08 | PF | fail | Capability reads 6/242 beside 241 monitored. By control error sorts good_error_pct (cplm-api CpmFleetController.cs:175). Stale here means 3 h (CpmPerformance.tsx:57). | p.27 G08; Baseline §9.4 row 3 |
| G08 | EX | fail | The card hardcodes 0.95 while G1 passes at 0.90, so 90-95 % shows amber beside G1 pass (kpi/loopKpiView.ts:40,132). OP % is hardcoded though OP is identity-scaled unless a range is declared. | p.13; p.27 G08; Baseline §9.4a |
| G08 | HI | fail | Tick, tooltip and context bar disagree on zone. The KPI overlay and mode lane bridge gaps while the signal lane breaks them (historical/chartOption.ts:157; CpmHistorical.tsx:146). | p.5; p.27 G08; Baseline §5.4, §5.5 |
| G08 | IN | fail | Case chips count at most 200 ranked loops (CpmInvestigation.tsx:74) while the lab holds 243, so the counts can undercount the fleet. | p.27 G08 |
| G08 | WB | fail | HistorianLanes hardcodes EU and pp as units (evidence/HistorianLanes.tsx:72-73). | p.5 units; p.27 G08 |
| G08 | RP | fail | Ticks use the browser zone, the tooltip the site zone, the cursor the browser zone (replay/ReplayChart.tsx:66,69,112). Labels it In AUTO, a fifth name for one field. | p.27 G08; Baseline §9.4a |
| G08 | WI | fail | Completeness bands are local (CpmWindows.tsx:188), and the page opens on 15m (:43) while the rest of CPA opens on 12h. | p.13 same window; p.27 G08 |
| G08 | PL | fail | Chart zero-fills missing checkpoint values (CpmPipeline.tsx:88,90) while the tiles show a dash for the same gap. | p.5 no zero-fill; p.27 G08 |
| G08 | TR | fail | Chart joins gaps (Designer/TrendCore.tsx:195), and units are guessed from the tag name (Designer/trend/trendSupport.ts:71-83). | p.5; p.27 G08 |
| G08 | CA | pass, re-measure | Every value reads the fused row of the verdict's own window (CpmCalculations.tsx:76-79). | p.13 same window; p.27 G08 |
| G08 | KP | pass, re-measure | Card, rows and trend share one server classification, and a matches the card pill compares them (CpmKpiDrilldown.tsx:146-148). | p.27 G08 |
| G08 | EV, EC, SR | not assessable, re-measure | No contradiction in source, but tab counts against rows, tab metrics and a populated model were not cross-checked. | p.27 G08 |
| G08 | CD | not assessable, re-measure | Editor view was not captured. | p.27 G08 |
| G08 | LOG, ES, ER, EH, RG, CF, CE, CB, GV, AU, AR, AD, AP, AA, AL, AS | does not apply | No computed metric, card or chart on this route. | n/a |
| G09 | EV | pass | Rows, Episode period and history resolve to real records; a missing id says so (CpmEvents.tsx:200-205). | p.27 G09 |
| G09 | EX | pass, re-measure | Calculation proof opens the exact fused run when the row has one (explorer/summary/LoopSummaryCard.tsx:49-54). Readiness bar names missing inputs. | p.27 G09 |
| G09 | ES | pass | Binding state is explicit: RESOLVED, PATH FALLBACK or UNCHECKED. Capture shows UNCHECKED while /readiness answered 500 (day/1440x1024/explorer-signals.png). | p.27 G09; manifest.json |
| G09 | ER, EH | pass | No peer links is stated with an action; episodes open their own span, and impossible spans are flagged END BEFORE START. | p.27 G09 |
| G09 | WB | pass | Reads one immutable run; not-retained evidence and reconstructions are stated (evidence/GateEvidenceWorkspace.tsx). | p.27 G09; p.26 EvidencePanel |
| G09 | RG | pass | Missing mappings and flags are listed per loop (ProfileAside.tsx). | p.27 G09 |
| G09 | OV, PF, KP, HI, WI, CA, SR | pass, re-measure | Links resolve to loops, runs and windows in source. Too few evaluated rows existed in capture to walk them. | p.27 G09 |
| G09 | IN, RP | fail | A saved note's evaluated window link opens the loop landing, not the pinned run (investigation/LoopNotes.tsx:127 uses evidenceHref(loopId) with no run id). | p.27 G09; p.26 SourceLink; p.13 evidence link |
| G09 | TR | fail | Unresolved pens return nothing and the resolver error is dropped, so a broken binding is not explicit (Designer/TrendCore.tsx:75,188). | p.27 G09 |
| G09 | EC, AP, AA | not assessable, re-measure | Links and binding states exist but were not walked in capture. | p.27 G09 |
| G09 | LOG, CF, CE, CB, CD, PL, GV, AU, AR, AD, AL, AS | does not apply | No evidence action or source binding on this route. | n/a |
| G10 | EV | pass | Shelve needs a reason and a capped expiry. Reviewer and time are shown. Each action writes history and audit. A second acknowledge is refused with 409 (cplm-api EventShelvingRules.cs, CpmEventActionsController.cs). | p.7; p.27 G10; ISA-18.2 shelving |
| G10 | CB | pass | Draft creation is server-validated and the server owns state (config/GateConfigurationWorkspace.tsx). | p.7; p.27 G10 |
| G10 | CD | pass, re-measure | If-Match with ETag, 428 if absent, 409 if stale. Approval is bound to the content hash and expires (cplm-api CpmConfigurationController.cs:186; config/LifecyclePanel.tsx). | p.7; p.27 G10 |
| G10 | SR | pass, re-measure | Decision bound to model id and revision by If-Match; a stale revision is 409 with a reload message (response/ModelReviewDialog.tsx; cplm-api CpmModelsController.cs:83-89). Dialog not reachable in capture. | p.7; p.27 G10 |
| G10 | IN, RP | fail | Notes validate and record the actor, but changing an outcome overwrites the row with no revision check and no audit event (cplm-api InvestigationStore.cs:66-67; no audit call in CpmInvestigationsController.cs). | p.7; p.13 record review; p.27 G10 |
| G10 | RG | fail | Activate validates (422) and audits, but re-onboarding carries no revision, so two editors overwrite silently (cplm-api CpmLoopsController.cs:67-100). | p.7; p.27 G10 |
| G10 | AU, AR, AD, AP, AA | fail | Forms validate and show a result, but no concurrency token exists: If-Match has 0 hits in Administration, and no check was found in auth-service, asset-model or ingestion-service source. asset-model shows no audit emitter. | p.7 concurrency; p.27 G10 |
| G10 | LOG, OV, PF, EX, ES, EC, ER, EH, HI, WB, WI, CA, CF, CE, KP, PL, GV, TR, AL, AS | does not apply | No review or record edit is saved on this route. | n/a |
| G11 | All 32 | not assessable | No AI output exists: 0 hits for AI-assisted, AI brief or AI hypothesis in src/frontend-ob/src, and the hypothesis panel is engine output (investigation/HypothesisPanel.tsx). The check cannot run until an AI layer exists. Violet on non-AI chart series is a separate p.4 failure (Baseline §9.7). | p.7 actions and AI; p.27 G11; skill §8 |
| G12 | OV, PF, EX, KP | fail | Captured at 1366 × 768 and 1920 × 1080. The sidebar is 200 px at 1366 (styles/app.css:1548). No 64 px rail below 1280 and no navigation drawer below 1024. At 768 px or less the sidebar is display:none and no control reopens it (App.tsx:697-723), so navigation survives only through Ctrl+K. Zoom and reflow at 200 % not measured. | p.6 responsive layout; p.27 G12; WCAG 2.1 SC 1.4.10, 1.4.4 |
| G12 | HI | fail | Same shell failure. At 1440 the Signal samples (CSV) label overflows its button (day/1440x1024/historical.png). | p.6; p.27 G12; WCAG 2.1 SC 1.4.10 |
| G12 | EV, ES, EC, ER, EH, IN, WB, RP, WI, CA, SR, RG, CF, CE, CB, CD, PL, GV, TR, AU, AR, AD, AP, AA, AL, AS | fail, re-measure | Same shell failure. Route content was not captured at 1366 or 1920. | p.6; p.27 G12 |
| G12 | LOG | not assessable, re-measure | Own layout with breakpoints at 900 px wide and 840 and 700 px tall (Login/Login.css:166,456,478,501); not captured at other widths. | p.27 G12 |

**G04 measurements by route** (`manifest.json`, Day). The ring count is a lower bound, and the walk stops at about 45 tab stops, so a high count does not prove the whole page.

| Route | Pointer-only / click targets | Table rows (0 focusable) | Canvases in capture (0 focusable) | Tab stops with a detected ring | axe critical nodes, Day |
|---|---|---|---|---|---|
| OV | 0 / 13 | 0 | 0 | 34 / 45 | 0 |
| PF | 0 / 180 | 25 | 0 | 32 / 45 | 11 |
| EV | 8 / 80 | 50 | 0 | 20 / 45 | 0 |
| EX | 2 / 29 | 0 | 0 | 24 / 44 | 0 |
| ES | 2 / 3 | 4 | 0 | 37 / 44 | 0 |
| EC | 2 / 21 | 0 | 0 | 37 / 44 | 0 |
| ER | 2 / 4 | 0 | 0 | 37 / 44 | 0 |
| EH | 2 / 8 | 0 | 0 | 38 / 44 | 0 |
| HI | 4 / 9 | 0 | 1 | 25 / 44 | 0 |
| IN | 0 / 6 | 0 | 0 | 40 / 44 | 0 |
| WB | 4 / 21 | 0 | 0 | 37 / 44 | 0 |
| RP | 9 / 10 | 0 | 0 | 33 / 44 | 0 |
| WI | 4 / 28 | 0 | 0 | 41 / 44 | 0 |
| CA | 0 / 16 | 0 | 0 | 40 / 44 | 2 |
| SR | 4 / 6 | 0 | 0 | 33 / 43 | 0 |
| RG | 0 / 27 | 0 | 0 | 43 / 45 | 0 |
| CF | 2 / 23 | 21 | 0 | 44 / 45 | 0 |
| CE | 4 / 22 | 17 | 0 | 44 / 44 | 0 |
| CB | 4 / 4 | 0 | 0 | 37 / 44 | 0 |
| KP | 0 / 1 | 0 | 0 | 31 / 43 | 0 |
| PL | 0 / 0 | 0 | 0 | 41 / 44 | 0 |
| GV | 55 / 55 | 6 | 0 | 30 / 43 | 0 |
| TR | 0 / 12 | 0 | 1 | 43 / 45 | 0 |
| AU | 0 / 9 | 20 | 0 | 10 / 45 | 2 |
| AR | 38 / 63 | 0 | 0 | 13 / 45 | 0 |
| AD | 0 / 7 | 0 | 0 | 4 / 44 | 0 |
| AP | 0 / 10 | 0 | 0 | 33 / 44 | 0 |
| AA | 0 / 7 | 500 | 0 | 32 / 45 | 0 |
| AL | 0 / 8 | 25 | 0 | 39 / 43 | 0 |
| AS | 0 / 10 | 0 | 0 | 44 / 44 | 0 |

### 2.4 CPA requirements grid

Requirements are broken into single testable rows. A1-A5 are CPA01, B1-B6 are CPA02, R1-R24 are p.13, C1-C5 are p.28. Columns are the 17 routes these rules address. The other 15 routes (`/login`, the Calculations and Relationships tabs, the four Gate Configuration views, `/cpm/governance` and the seven admin tabs) have no cell, because the rules speak of the overview and of loop detail. Their obligations are in G01-G12.

| ID | Page | Requirement | OV | PF | KP | EV | EX | ES | EH | HI | IN | WB | RP | WI | CA | SR | RG | TR | PL |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 | p.11 | Show the assessed population and a clear queue of loops to investigate | F* | P* | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| A2 | p.11 | Filter by plant, area, time window and review condition | F | P | P | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| A3 | p.11 | Selecting a loop updates its explanation and opens CPA02 with the same interval | F | P | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| A4 | p.11 | Show population size, assessment coverage and metric definitions | F | F | P* | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| A5 | p.11 | Keep rows with unavailable metrics visible with a reason; never rank missing data as good | F | P | P* | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| B1 | p.12 | Aligned PV, SP, controller output and operating-mode context | · | · | · | · | F | · | · | P* | F | F | F | · | · | · | · | · | · |
| B2 | p.12 | Synchronise cursor and selected interval across charts | · | · | · | · | F | · | · | P* | F | F | · | · | · | · | · | · | · |
| B3 | p.12 | Selecting a review period updates the detail panel and evidence links | · | · | · | P | F | · | F | P* | P* | · | P* | · | · | · | · | · | · |
| B4 | p.12 | Related instrument and alarm links retain loop and period | · | · | · | F | F | · | · | F | F | · | · | · | · | · | · | · | · |
| B5 | p.12 | Use the CPA service definition for every metric and threshold | F | F | F | · | F | · | · | F | · | P | · | F | F | · | · | · | · |
| B6 | p.12 | Label output as Controller output unless measured valve position is available | F | · | F | · | F | P | · | F | F | F | F | · | F | · | · | F | · |
| R1 | p.13 | Overview presents assessed loops, loops needing review and data coverage | F | F | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| R2 | p.13 | Ranked table: tag, parent asset, metric value and unit, state, coverage, last evaluation time | F* | F | F* | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| R3 | p.13 | Clicking a column heading sorts eligible rows by a documented rule | F | F | F | P | · | · | · | · | · | · | · | · | P | · | · | · | · |
| R4 | p.13 | Explanation states which metric or rule selected the loop | F | P* | P* | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| R5 | p.13 | Keep Unassessed distinct from Meets criterion | P | P | P* | · | · | · | · | · | · | · | · | · | P | · | · | · | · |
| R6 | p.13 | Do not combine different engineering units into one unexplained ranking | P | P | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| R7 | p.13 | PV, SP, controller output and actual mode history on aligned time axes | · | · | · | · | F | · | · | P* | F | F | F | · | · | · | · | · | · |
| R8 | p.13 | Valve position is a separate measurement when available | · | · | · | · | F | · | · | P | P* | P* | P* | · | · | · | · | · | · |
| R9 | p.13 | Keep mode changes, manual periods, saturation and bad quality as context | · | · | · | · | F | · | · | F | F | F | F | · | · | · | · | · | · |
| R10 | p.13 | Same definition, window and denominator in overview and detail; label plot zoom separately | F | · | F | · | F | · | · | F | · | · | · | · | P* | · | · | · | · |
| R11 | p.13 | Show unit, eligibility, coverage and baseline | F | · | F | · | F | · | · | · | · | · | · | · | F | · | · | · | · |
| R12 | p.13 | Oscillation, stiction and tuning claims name their method and evidence | F | · | F | · | F | · | · | · | F | P | · | · | · | · | · | · | · |
| R13 | p.13 | Loop identity: canonical ID, tag, controlled property, related asset | · | · | · | · | F | · | · | · | · | · | · | · | · | · | F | · | · |
| R14 | p.13 | Time series: timestamped PV, SP, output, mode and quality for one interval | · | · | · | · | · | · | · | F | · | P* | F | · | · | · | · | · | · |
| R15 | p.13 | Metric result: name, value, unit, definition version, coverage, assessment time | F | · | F | · | F | · | · | · | · | · | · | · | F | · | · | · | · |
| R16 | p.13 | Review rule: threshold or baseline, eligible mode, evaluation window | · | · | F | · | F | · | · | · | · | P* | · | · | F | · | · | · | · |
| R17 | p.13 | Evidence link: source record, instrument relation, alarm context or case | · | · | P* | P | P | · | · | P* | F | · | F | · | · | · | · | · | · |
| R18 | p.13 | Record review captures period, metric snapshot, reviewer and note | · | · | · | F | · | · | · | · | P* | · | P* | · | · | · | · | · | · |
| R19 | p.13 | Opening an RCA links evidence without promoting a suspected issue to verified cause | · | · | · | N | N | · | · | · | N | · | · | · | · | · | · | · | · |
| R20 | p.13 | Source refreshes do not overwrite saved review evidence without versioning | · | · | · | · | · | · | · | · | P | P | · | · | · | · | · | · | · |
| R21 | p.13 | Demonstrate overview to PV vs SP, mode history, diagnostics and alarms | F | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| R22 | p.13 | Define the denominators behind assessed loops, coverage and time in AUTO | F | · | F | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| R23 | p.13 | A loop labelled Stable (or equivalent) has an explicit review reason | P* | · | P* | · | P* | · | · | · | · | · | · | · | · | · | · | · | · |
| R24 | p.13 | Named statistic, and percentage of span needs a valid configured span | F | P | · | · | F | · | · | F | · | · | · | · | · | · | · | · | · |
| C1 | p.28 | Acceptance: open a loop from the ranked overview, align signals, expose definition and coverage | F* | · | · | · | F | · | · | F* | · | · | · | · | · | · | · | · | · |
| C2 | p.28 | Show the actual plotted zoom window | F* | · | · | · | F* | · | · | F | F* | F* | F* | · | · | · | · | F | F* |
| C3 | p.28 | Reconcile overview mode compliance and detail time in AUTO to their defined windows | F | · | F | · | F | · | · | · | · | · | F | F | · | · | · | · | · |
| C4 | p.28 | Legible chart tokens for essential histogram marks | F* | F | F* | · | · | · | · | · | F* | · | · | F* | · | · | · | · | · |
| C5 | p.28 | Rebuild charts from data and preserve exact units and dates | P* | · | P* | · | P* | · | · | F | P* | F | F* | · | · | N* | · | F | F* |

### 2.5 CPA requirements evidence

| ID | Routes | Verdict | Evidence | Cite |
|---|---|---|---|---|
| A1 | OV | fail, re-measure | Population heading exists, but there is no assessed or needing-review figure, and the queue slices to 6 rows (overview/PriorityQueue.tsx:25,65). Queue empty in capture. | p.11; Baseline §9.4b |
| A1 | PF | pass, re-measure | Row tabs state Needs attention 165, Evaluated 165, Not evaluated 76, All 241 (day/1366x768/performance.png). | p.11 |
| A2 | OV | fail | Plant scope and 12h/24h exist, but no review-condition filter on this page. | p.11 |
| A2 | PF | pass | Plant scope, window, row filter, gate filter and health filter (CpmPerformance.tsx:71-75,208-222). | p.11 |
| A2 | KP | pass | Plant scope, window, KPI picker and reason filter (CpmKpiDrilldown.tsx:84-94,155-165). | p.11 |
| A3 | OV | fail | Row selection fills LoopFocus with live values and a rolling 8 h trend under a 12h page, with no explanation (overview/LoopFocus.tsx:31,33). Open loop does carry the window kind. | p.11; p.7 selections |
| A3 | PF | pass | Selection writes ?loop, shows the row summary and docked evidence; Open loop carries the window (CpmPerformance.tsx:108-110,319-344). | p.11; p.7 selections |
| A4 | OV, PF | fail | Definitions live in title tooltips, which are mouse-only (Performance alone holds 980 tooltip words), and there is no coverage percentage. | p.11; p.6 accessible help; WCAG 2.1 SC 1.4.13, 2.1.1; Baseline §8.1 |
| A4 | KP | pass, re-measure | Rule, formula, reason and denominator are visible on the page (CpmKpiDrilldown.tsx:98-119). No definition version: see R15. | p.11 |
| A5 | OV | fail | Unassessed loops are excluded from the queue (cplm-api FleetPrioritySql.cs:53-54); they appear only as tile counts and drill-down rows. | p.11 |
| A5 | PF | pass | The matrix lists all 241 with Not evaluated: not enough data, and the attention list states the unrankable count. | p.11 |
| A5 | KP | pass, re-measure | Not-assessable list gives its reasons, and filters by reason. 0 rows in capture. | p.11 |
| B1 | EX | fail | Mode is a tile, not a lane; the trend fetches mode but does not draw it (explorer/summary/OperatingState.tsx:48,126). | p.12; Baseline §5.3 |
| B1 | IN, RP | fail | Trend carries PV, SP, OP and VP with no mode (CpmInvestigation.tsx:138; CpmReplay.tsx:118). | p.12; Baseline §9.5 |
| B1 | WB | fail | Signals split across three charts in a collapsed section. | p.12; Baseline §9.5 |
| B1 | HI | pass, re-measure | PV, SP, OP, overlay, mode, verdict and health share one time axis (historical/chartOption.ts:160-170). Only a sliver of data in capture. | p.12 |
| B2 | EX | fail | Compare mode draws two unlinked charts; `echarts.connect` and `group` have 0 hits. | p.12; p.5 chart behaviour; Baseline §5.4 |
| B2 | IN, WB | fail | Health lane or lanes are separate charts with no shared cursor. | p.12; Baseline §5.4 |
| B2 | HI | pass, re-measure | Cursor links every lane within one chart and the selected window shades them (historical/chartOption.ts:186). No value table, which p.5 also asks for. | p.12; p.5 |
| B3 | EX, EH | fail | History rows leave for /cpm/historical; no review-period list updates a panel in place. | p.12; p.7 selections |
| B3 | EV | pass | Selecting an episode updates the aside and its links (CpmEvents.tsx:97-99). | p.12 |
| B3 | HI, IN, RP | pass, re-measure | Selecting a window updates the panel, verdict or replay (historical/SelectedWindowPanel.tsx, investigation/WindowBrowser.tsx). 0 windows in capture; on HI the band click is pointer only. | p.12 |
| B4 | EX, HI, IN, EV | fail | Instrument health stays on the loop, but no alarm link exists: 0 hits for /alarms in components/Cpm, and the slice redirects that route to /cpm. | p.12; productSlice.ts; ISA-18.2 alarm context |
| B5 | OV, KP | fail | Rule text is served, but the formula is a client copy that misstates the engine: window time vs samples present (kpi/kpiMeta.ts:36,40; ShortFeatureCalculator.java:193). | p.12; p.13; Baseline §9.4a |
| B5 | PF | fail | Stale limit of 3 h is local (CpmPerformance.tsx:57). | p.12 |
| B5 | EX | fail | 0.95 is hardcoded while the tile limit is server-configured and G1 uses 0.90 (kpi/loopKpiView.ts:40,132). | p.12; Baseline §9.4a |
| B5 | HI | fail | Overlay list and resolutions are client literals (CpmHistorical.tsx:49-55). | p.12 |
| B5 | WI | fail | Completeness bands are local (CpmWindows.tsx:188). | p.12 |
| B5 | CA | fail | Catalogue of 19 metrics is client-side and omits three KPIs shown on the loop page (calcCatalogue.ts:24-47). | p.12; Baseline §9.4c |
| B5 | WB | pass | Gate name, method and capability come from the served catalogue and the immutable run. | p.12 |
| B6 | OV, EX, HI, IN, WB, RP, TR | fail | Charts and tiles say OP or the tag name; no chart label says Controller output (Baseline §5.3). | p.12; p.28 |
| B6 | KP, CA | fail | Valve wording on OP: OP fully open or closed, valve wear, actuator travel (kpi/loopKpiView.ts:147-155; calcCatalogue.ts:34). | p.12; Baseline §9.4 row 7 |
| B6 | ES | pass | Role table reads Controller output and lists VP separately (explorer/SignalsTab.tsx:24-26). | p.12 |
| R1 | OV, PF | fail | Assessed and needing-review figures are partial, and no coverage percentage exists. | p.13; Baseline §9.4b |
| R2 | OV | fail, re-measure | Div rows with no headers; no coverage column; last evaluation time is not rendered though the payload holds it. | p.13; Baseline §9.4b |
| R2 | PF | fail | Matrix columns are Loop, Checks behind the result, Result; no coverage or metric column. | p.13 |
| R2 | KP | fail, re-measure | Has tag, location, measured value, verdict and window time; no coverage column. 0 rows in capture. | p.13 |
| R3 | OV, PF, KP | fail | Headers are static or absent; sortable headings exist only on Calculations and Events. | p.13; Baseline §9.4 row 3 |
| R3 | EV, CA | pass | SortHeader states the active order, and the server or catalogue sort is documented (SortHeader.tsx; calcSort.ts). | p.13 |
| R4 | OV | fail | Reason line gives criticality, severity and persistence, not the selecting metric. Copy says confirmed or suspected while the queue also admits DETECTED and CLASSIFIED (cplm-api FleetPrioritySql.cs:54). | p.13; Baseline §9.4 row 4 |
| R4 | PF, KP | pass, re-measure | Rows name the driving gates or the deciding value (AttentionList.tsx; kpi/kpiProof.ts). Few or no findings in capture. | p.13 |
| R5 | OV, PF, CA | pass | Not assessable, Stale, Never evaluated and Not evaluated are separate states with their own words. | p.13; p.4 |
| R5 | KP | pass, re-measure | Separate verdict text per state. 0 rows in capture. | p.13 |
| R6 | OV, PF | pass | Ranks use criticality, severity, percent in band and score, with the order stated; no-span loops are excluded and counted (performanceHeadline.ts:39-43). | p.13 |
| R7 | EX, IN, RP, WB | fail | As B1: mode history is absent or split. | p.13 |
| R7 | HI | pass, re-measure | As B1, with the mode lane on the shared axis. | p.13 |
| R8 | EX | fail | VP is not drawn even when mapped (OperatingState fetches pv, sp, op, mode only). | p.13 |
| R8 | HI | pass | VP is its own chip and reads unmapped when absent (day/1440x1024/historical.png). | p.13 |
| R8 | IN, RP, WB | pass, re-measure | VP has its own pen or lane when mapped (CpmInvestigation.tsx:131; evidence/SignalContextLanes.tsx). | p.13 |
| R9 | EX, HI, IN, RP, WB | fail | No trend shows saturation or bad-quality intervals. Null modes are bridged on HI (CpmHistorical.tsx:140,146). | p.13; NAMUR NE 107 quality separation; Baseline §5.4, §9.8 |
| R10 | OV, EX, KP | fail | Same stored field and window, but the stated denominator is wrong and one field has five names. | p.13; Baseline §9.4a |
| R10 | HI | fail | Zoom note gives no times: Zoomed view only (CpmHistorical.tsx:346). | p.13; Baseline §9.5 |
| R10 | CA | pass, re-measure | All values share the verdict's window, and a stale-version check is in the drawer (CalcDrawer.tsx). | p.13 |
| R11 | OV, EX, KP, CA | fail | No baseline beyond a 24 h delta, and coverage is not stated per metric. Definitions are hover-only on tiles. | p.13; Baseline §9.4 row 1 |
| R12 | OV, KP | fail | Tile names the evidence band only; drill-down gives period and regularity, not the method (kpi/kpiProof.ts:61-63). | p.13; Baseline §9.4 row 9 |
| R12 | EX | fail | Method is one or more clicks away. | p.13; Baseline §9.4 row 9 |
| R12 | IN | fail | Observations table names methods, but the case chip claims Controller tuning for every OSCILLATION_TUNING or _OSCILLATION row (investigation/cases.ts:13,32). | p.13; Baseline §9.4 row 9 |
| R12 | WB | pass | Each gate shows its method and the run's artifacts. | p.13 |
| R13 | EX, RG | fail | The loop id doubles as tag; `assetId` exists in the API type (api/cpmApi.ts:31) with 0 uses in components/Cpm, so no related asset is shown. | p.13 |
| R14 | HI, RP | fail | No quality series on the chart. | p.13; NAMUR NE 107 quality separation |
| R14 | WB | pass, re-measure | Mode and source quality exist in the lanes and short views (evidence/HistorianLanes.tsx:38; evidence/views/ShortViews.tsx:36). | p.13 |
| R15 | OV, KP, EX, CA | fail | Definition version is missing on tiles (`RuleVersion` exists server-side, 0 frontend hits). Calculations shows it only in the drawer, with no per-metric coverage. | p.13; Baseline §9.4c |
| R16 | KP | fail | Threshold and basis are shown; eligible mode only on some KPIs. | p.13 |
| R16 | EX | fail | Rule sits in a hover title on the card. | p.13; p.6 |
| R16 | CA | fail | The drawer's Definition tab has no threshold or eligible mode (CalcDrawer.tsx). | p.13 |
| R16 | WB | pass, re-measure | Explain panel shows measured vs required (night/1440x1024/evidence.png). | p.13 |
| R17 | EX, EV | pass | Source run, instrument drawer or episode period are linked. | p.13 |
| R17 | HI, KP | pass, re-measure | Replay, window, calculation and trend links exist in source. Not walked in capture. | p.13 |
| R17 | IN, RP | fail | A note's window link does not reach its pinned run (G09). | p.13 |
| R18 | EV | fail | Acknowledge records reviewer, time and an optional note, but no metric snapshot. | p.13 |
| R18 | IN, RP | pass, re-measure | Note pins the window's run and artifacts with reviewer and outcome, when attach stays ticked (investigation/LoopNotes.tsx:51-56). | p.13 |
| R19 | EX, IN, EV | not assessable | No RCA module or case entity in this slice; Investigation states full cases are DG-7 (CpmInvestigation.tsx:161). | p.13; p.29 case decision |
| R20 | IN, WB | pass | Notes pin evidence against retention, and a reconstruction is stored beside the retained proof, never over it. | p.13 |
| R21 | OV | fail | The path reaches PV, SP, mode and diagnostics, but no alarm route exists in the slice. | p.13; productSlice.ts |
| R22 | OV, KP | fail | Tile denominators are named, but coverage has no definition and AUTO says window time while the engine uses samples present. | p.13; Baseline §9.4a; Q7 |
| R23 | OV, EX, KP | pass, re-measure | Performing acceptably states its rule; No problem found has a Basis disclosure. No such loop in capture. | p.13 |
| R24 | PF | pass | Median error (% of span) excludes no-span loops and counts them. | p.13 |
| R24 | OV | fail | Fallback reads MAE x with no unit (overview/GoodErrorBar.tsx:14). | p.13; p.6 units |
| R24 | EX, HI | fail | PV span is checked, but OP % is hardcoded (OperatingState.tsx:99-102; historical/chartOption.ts:246). | p.13; Baseline §9.4 row 8 |
| C1 | OV | fail, re-measure | Open works, but the queue was empty in capture and row definitions are hover-only. | p.28 CPA scenario |
| C1 | EX | fail | No mode on the trend. | p.28 CPA scenario |
| C1 | HI | fail, re-measure | Signals align, but definition and coverage of each metric are not exposed on the page. | p.28 CPA scenario |
| C2 | EX, OV, IN, WB, RP, PL | fail, re-measure | ChartZoomBar shows buttons and no range; useBoxZoom holds percentages only (charts/boxZoom.ts:17-18). | p.28; p.13; Baseline §9.5 |
| C2 | HI, TR | fail | HI says Zoomed view only with no times; TR clocks show the unzoomed window. | p.28; Baseline §9.5 |
| C3 | OV, EX, KP, WI, RP | fail | One field has five names: In auto mode, Time in normal mode, Automatic-mode fraction, In AUTO, Service factor. Thresholds and staleness conflict. | p.28; Baseline §9.4a |
| C4 | OV | fail, re-measure | No frequency histogram exists. State-bar segments read 1.03 Day and 2.05 Night, or 2.36 and 2.83, against 3:1. | p.28; p.5; WCAG 2.1 SC 1.4.11; Baseline §5.6 |
| C4 | PF | fail | Gate roll-up warn bars read 1.03:1 on the Day panel. | p.28; WCAG 2.1 SC 1.4.11; Baseline §5.6 |
| C4 | WI, KP, IN | fail, re-measure | Sparse density and score fills read 1.03 Day; unselected KPI bars 2.36 and 2.83. | p.28; WCAG 2.1 SC 1.4.11; Baseline §5.6 |
| C5 | OV, EX, IN, KP | pass, re-measure | Series come from served points, and gaps stay as nulls (trend/trendOption.ts:90,146). | p.28; p.5 |
| C5 | HI | fail | Overlay and mode bridge gaps; runtime zone differs between bar and tooltip. | p.28; p.5 |
| C5 | WB | fail | EU and pp are hardcoded. | p.28; p.5 units |
| C5 | TR | fail | Gaps are joined, and units are guessed from the tag name. | p.28; p.5 |
| C5 | RP, PL | fail, re-measure | RP mixes zones on one chart; PL zero-fills. | p.28; p.5 |
| C5 | SR | not assessable, re-measure | No populated response event in capture. | p.28 |

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

| Check | Cells |
|---|---|
| G01 | OV, EX, IN, WB, RP, WI, SR, CD, KP, PL, TR |
| G04 | LOG, CD |
| G05 | OV, EX, IN, WB, RP, WI, SR, CD, KP, PL |
| G08 | EV, EC, CA, SR, CD, KP |
| G09 | OV, PF, EX, EC, HI, WI, CA, SR, KP, AP, AA |
| G10 | SR, CD |
| G12 | LOG, EV, ES, EC, ER, EH, IN, WB, RP, WI, CA, SR, RG, CF, CE, CB, CD, PL, GV, TR, AU, AR, AD, AP, AA, AL, AS |
| A1 | OV, PF |
| A4 | KP |
| A5 | KP |
| B1 | HI |
| B2 | HI |
| B3 | HI, IN, RP |
| R2 | OV, KP |
| R4 | PF, KP |
| R5 | KP |
| R7 | HI |
| R8 | IN, WB, RP |
| R10 | CA |
| R14 | WB |
| R16 | WB |
| R17 | HI, KP |
| R18 | IN, RP |
| R23 | OV, EX, KP |
| C1 | OV, HI |
| C2 | OV, EX, IN, WB, RP, PL |
| C4 | OV, IN, WI, KP |
| C5 | OV, EX, IN, RP, SR, KP, PL |

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
| 1 | No shared shell: no module list, plant selector, search, time range or environment indicator | G03: 32 fail | Every page header and the global time rule depend on it (Q4, Q5) |
| 2 | No Traverse tokens: `--traverse-*` has 0 uses | G02: 32 fail | Decides the bridge approach and affects every surface (Q1, Q2) |
| 3 | CPA01 has no ranked table, coverage figure or sortable headings | R1, R2, R3, A4 | Rebuilds the Overview hierarchy around a queue table and inspector |
| 4 | CPA02 is split: no page aligns PV, SP, controller output and mode with an inspector and review periods | B1, B6, R7, R9 | Merges Explorer and Historical into one loop page |
| 5 | Keyboard: 0 rows and 0 charts focusable, and four focus styles, none to the guide | G04: 32 fail | Forces a shared DataTable and TrendPanel with a keyboard path (p.26) |
| 6 | Context loss: interval and time zone do not travel, and two zones show on one page | G07: 18 fail | Needs one ContextLink and one zone rule (p.7, Q8) |

Next in line are chart standards (G05, C2, C5), metric reconciliation (R10, C3, R22), and the shared data-state components (G06: 30 fail).

## 5. Limits

- No lab call was made for this part. Verdicts reuse the Baseline's capture and a fresh source reading.
- Keyboard ring detection is a lower bound, and tab position inside `main` was not measured reliably (Baseline §9.9).
- Inspector widths outside 1440 are calculated, not measured.
- Claims marked *inferred* in the Baseline stay inferred here, notably stale chart colours after a theme switch.
- ISA-101.01, ISA-18.2, ISO 9241-110 and NAMUR NE 107 are cited by topic, not clause.
- Passing here does not establish WCAG conformance; the guide says the same (p.27).
