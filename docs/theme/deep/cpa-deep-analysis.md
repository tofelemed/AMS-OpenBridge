# CPA: Deep Functional, UX and Content Analysis for Redesign

| Field | Value |
|---|---|
| Document ID | CPA-UI-PRM-003 |
| Revision | R01 |
| Date | 2026-11-04 |
| Application | CPA, Control Loop Performance Management (Traverse Edge) |
| Type | Analysis only. No application source, configuration or data changed |
| Build | Production image `docker-ams-frontend:latest`, port 3000, built after commit `0b081f4d`; bundle prefix `root.hdpev2.cpm` |
| Precedes | CPA-UI-PRM-004 (redesign prompt) |

Companion files: [surface-inventory.md](surface-inventory.md) · [metric-lineage.md](metric-lineage.md) · [help-registry-draft.md](help-registry-draft.md) · [discrepancies.md](discrepancies.md) · [content-audit-v2.md](content-audit-v2.md) · [task-flows.md](task-flows.md) · [component-fit.md](component-fit.md) · [conformance-matrix.md](conformance-matrix.md) · [behaviour.md](behaviour.md) · [data-states.md](data-states.md)

## 1. Reading record

| Source | Read | Note |
|---|---|---|
| Guide R01 | Pages 1-30 | All pages, across this analysis and the first |
| Skill `SKILL.md`, `components.md`, `acceptance.md` | All | **File says R1.1; the brief names R1.2.** R1.2 is not on disk |
| `cpa-currenttheme.md`, text audit, `data/` | All | Baseline. One correction in §8 |
| `CPA-UI-DEC-001-R01.md`, `CPA-UI-PRM-002-R01.md` | **Not available** | Not on disk. CD decisions are known only by the names in the brief |
| `KPI-LOGIC.md`, `KPI-AND-APPLICATION-LOGIC.md` | All | Part D |
| Router and navigation source | All | Part B |

## 2. Environment and representative set (D0)

**The fitness gate failed and was waived by the owner.** The owner's instruction on 2026-11-04: this analysis is about the UI, colour and redesign, not loop logic, so proceed. Findings on populated surfaces carry the limits in §16.

| Fitness rule | Required | Measured | Result |
|---|---|---|---|
| Loops evaluated within their window | At least 50 % | 10 of 243 (4 %) | Failed, waived |
| Loops with a current finding | At least 1 | 0 on the newest window; 4 loops hold a DETECTED verdict from earlier the same day | Failed, waived |
| Historian returns data for the representative loop | PV, SP, OP | PV, SP and OP plotted live on `FIC10302` and `FIC10401` | Pass |

Other facts: 155 stale, 78 never evaluated, 325 episodes open, 7 acknowledged, 1 shelved of 500; 3,286 response events; VP mapped on 6 loops; 2 peer links. Cause: 10 loops are feeding, and 151 last reported on 11 October. Figures come from read-only database and historian queries.

| Role in the set | Loop | State |
|---|---|---|
| Primary, suspected stand-in, VP mapped | `FIC10302` | DETECTED on 2026-11-04, live data |
| Confirmed finding | `FIC10301` | CONFIRMED_OSCILLATION, last in October |
| Suspected, peer links | `G13_LOOP_A` | SUSPECTED, last in August |
| Live with known tags | `FIC10401` | Live, insufficient data |
| Not evaluable | `DEMO-FIC-001` | Never evaluated |
| Stale | `FIC00701` | Stale since October |
| Healthy | **None in the lab** | No no-fault verdict exists |
| Cascade | **None in the registry** | |

**Read-only proof.** The guard aborted a synthetic POST before it left the browser (aborted: TypeError). **Blocked writes across all passes: 0. HTTP 429 responses: 0.** 633 crawl API calls. All passes ran as one `superadmin` session type, supplied by the owner; the password was held in the process environment only.

## 3. Executive summary

1. **24 routes, 24 views, 10 overlay types and 45 expandable panels were captured**, with 1,268 controls recorded and 597 deny-listed controls left untouched. Source shows 48 routes, 355 click handlers and 179 tooltips.
2. **Metric meaning is the deepest problem.** Of 145 concepts, 28 are consistent. 48 are definition conflicts, 27 are engine-UI conflicts, 23 differ in label only, and 19 are undocumented. There are 49 discrepancies.
3. **The same no-fault verdict reads "Not evaluated yet" on Explorer and counts as "Performing acceptably" on Overview** (D-14). Every exclusion, including sensor freeze, reads "loop not in automatic" (D-15).
4. **Conformance: 490 cells scored, 112 pass, 332 fail, 46 not assessable.** Shell, tokens and keyboard fail on every route. Neither CPA01 nor CPA02 exists as one page.
5. **CPA02 is scattered.** One loop's detail spreads over Explorer, Historical, Investigation, Evidence, Replay, Windows, Calculations and Response. PV, SP and OP are plotted in 8 places on 5 chart builders, and only Historical aligns mode.
6. **Controls crowd out data.** On Historical at 1440 × 1024 the chart starts near 880 px, below the fold. On Performance the gate table starts near 1,000 px. Each is read from the capture.
7. **Tasks.** 18 of 24 walked tasks need more than one page, 4 hit a dead end, and the landing page averages 524 words. Self-descriptiveness fails on 11 tasks because of internal terms.
8. **Content.** Route pages hold 6,359 visible words, projected 5,156 (−19 %). 223 blocks are Internal. `title` tooltips on those route pages hold 5,202 more words, which a keyboard cannot reach.
9. **Components.** Of 94 types, 19 are Adapter-fit, 61 Extend and 14 Replace. **CD1 should be amended, not reversed.** Replacing 46 uses in 19 files passes the contract; wholesale replacement touches 303 uses in 102 files with no conformance gain.
10. **A correction to the first analysis.** `ObcButton` paints at 34 px, not 48. 48 px is its hit area. It reaches 40 px and a 6 px radius through variables alone, with no call-site changes.
11. **Keyboard.** Focus starts inside 8 of 31 overlay captures and stays trapped in 6. Esc closes 26. No table row or chart is focusable. Modal footers cannot be reached by Tab.
12. **Accessibility and reflow.** axe finds 46 critical and 494 serious nodes in Day across all surfaces. Sideways scroll: 2 of 29 routes scroll sideways at 1024x768, 2 of 29 routes scroll sideways at 200 % zoom. The sidebar stays at 200 px at 1024 wide, where the guide asks for a navigation drawer.

**Recommended structure.** Consolidate today's 18 destinations into six: Overview, Episodes, Loop, Evidence, Setup and System. This is the suite's own overview, detail, evidence pattern, so it matches G03. It takes average task length from 1.83 pages to 1.42, and tasks needing more than one page from 18 to 10.

**Decisions needed:** the OpenBridge rule (Q1), Night (Q2), module navigation (Q4), the header time range (Q5), status mapping (Q6) and metric definitions (Q7). See §15.

## 4. Surface inventory summary

| Type | Count |
|---|---|
| Routes | 24 |
| URL-driven and representative views | 24 |
| Panels listed on entry | 114 |
| Panels opened by a control | 45 |
| Overlay captures | 31 |
| Overlay types | 10 |
| Controls recorded | 1,268 |
| Deny-listed controls seen | 597 |
| Entries that failed | 0 |

Source against runtime for the 70 source overlays: 22 reached; 7 event-driven or shared shell (session expiry, confirm, forbidden); 25 data-dependent or beyond the crawl limit; 10 chart hover: sampled on Explorer and Historical only; 6 trigger on the deny-list. Full tree: [surface-inventory.md](surface-inventory.md). Hidden and unreachable surfaces: [data/hidden-surfaces.md](data/hidden-surfaces.md).

Notable from source: `/cpm/kpi` is the only menu-less route; 8 components are dead in the live graph; `asset.view` alone cannot open Plant Model or Aliases, because the `/admin/*` guard omits it; `/admin/audit` and `/admin/system` have no check of their own; and a role description saves by PUT on `onChange`, with no Save button (`RolesConfig.tsx:240`).

## 5. Metric lineage summary

| Status | Concepts |
|---|---|
| Consistent | 28 |
| Label only | 23 |
| Definition conflict | 48 |
| Engine-UI conflict | 27 |
| Undocumented | 19 |
| **Total** | **145** |

2,795 register citations and 419 discrepancy citations were machine-checked to exist. I re-read four of the most serious against source (D-14, D-15, D-17, D-08), and all held.

Most serious:

| ID | Discrepancy |
|---|---|
| D-14 | One no-fault verdict: "Not evaluated yet" on Explorer, "Performing acceptably" on Overview |
| D-15 | Every `EXCLUDED_*` code, including sensor freeze, reads "loop not in automatic" |
| D-07, D-09 | OP travel, reversals and MAE say "judged by" a gate that does not read them. The Effort KPI decides on σ(OP)/σ(PV) |
| D-08 | G4 STRONG renders grey on loop cards |
| D-21 | Severity is only the evidence band, so priority "urgency" carries no process impact |
| D-11 | "Stiction confirmed" exceeds G14's non-following scope; the UI's approved-test route has no engine path |
| D-17 | The 0.5 pp reversal deadband is documented and governed, but the engine uses `1e-9` |
| D-20 | Users without `cpm.config.read` see "no threshold configured" for configured thresholds |
| D-01, D-02 | "Time" share is a sample share, and manual share counts unknown mode |
| D-04 | 0.95, 0.90 and 0.70 are all used for one share |

All 49 with evidence: [discrepancies.md](discrepancies.md). Help text for every concept, marked as implemented and pending approval: [help-registry-draft.md](help-registry-draft.md). How often these cases occur at the plant was not determined.

## 6. Content summary

| Class | Blocks |
|---|---|
| Keep | 4,463 |
| Shorten | 132 |
| Move to help | 74 |
| Remove | 11 |
| Internal | 223 (Translate 86, Collapse 24, Remove from operator pages 1) |

Constraint check, Remove touching units, data-state labels, coverage, time zone, source or errors: **0**.

Top 30, per-surface measures, words by audience and every change: [content-audit-v2.md](content-audit-v2.md). Annotated images of the five busiest surfaces: [annotated/](annotated/). Internal patterns were derived from crawled text because CPA-UI-DEC-001 R2 is not on disk.

## 7. Roles and tasks

Full tables: [task-flows.md](task-flows.md).

- Four roles, described from the guide, the navigation and permissions. CPA has no Reliability role.
- Rule-based ISO 9241-110 failures out of 24 tasks: suitability 12, self-descriptiveness 11, conformity 2, controllability 5.
- Dead ends: OP1, EN2, EN3, RE6. Context lost: OP6:plant, EN5:loop.
- ISA-101: no true level 2 unit view exists, and level 3 loop detail is split across three pages. Investigation mixes levels 3 and 4.

Function overlap, the driver for consolidation:

| Function | Places |
|---|---|
| PV, SP, OP trend | 8, on 5 chart builders |
| Loop picker with scope filters | 10 |
| Gate results | 6 |
| Loop KPIs | 6 |
| Verdict explanation | 3 |

## 8. Component fit

Full ratings: [component-fit.md](component-fit.md).

| Family | Adapter-fit | Extend | Replace |
|---|---|---|---|
| OpenBridge | 5 | 2 | 9 |
| Native HTML | 1 | 7 | 0 |
| CPA custom | 9 | 39 | 5 |
| Charts C1-C17 | 4 | 13 | 0 |
| **All** | **19** | **61** | **14** |

**CD1 re-test: amend, do not reverse.**

| Option | JSX uses | Files | Result |
|---|---|---|---|
| A. Keep all, adapter only | 0 | 0 | Cannot pass. WCAG 4.1.2 Level A failures stay |
| B1. Replace hard failures | 37 | 15 | Passes if the 3 px focus gap is waived |
| **B2. Replace hard and gap-only** | **46** | **19** | **Passes. Recommended** |
| C. Replace wholesale | 303 | 102 | Passes, for 6.6 times B2's edits and no conformance gain |

The colour bridge works as CD1 assumed, with one gap (Ghost hover text). It is not enough alone: geometry, focus and semantics need more. Only `ObcButton` is used at scale, so CPA is already mostly native and custom.

**Correction to the first analysis:** `cpa-currenttheme.md` §2 and §6 give `ObcButton` as 48 px. That is the hit area; the painted button is 34 px.

**Live defects, independent of redesign:** Tab cannot reach Modal footers; drawers do not trap focus; focus is lost on `ObcButton` triggers; every permission in `RolesConfig` reads "Checkbox item".

**Missing guide components:** header plant selector, search, time range and environment indicator; value table; DataTable; inspector; toggletip; chart frame; data-state overlay; 64 px rail; Traverse logo.

## 9. Conformance, behaviour and data states

Full results: [conformance-matrix.md](conformance-matrix.md), [behaviour.md](behaviour.md), [data-states.md](data-states.md).

| Rank | Failure that drives redesign | Cells |
|---|---|---|
| 1 | No shared shell | G03: 32 fail |
| 2 | No Traverse tokens | G02: 32 fail |
| 3 | CPA01 has no ranked table, coverage figure or sortable headings | R1-R3, A4 |
| 4 | CPA02 is split across pages | B1, B6, R7, R9 |
| 5 | 0 rows and 0 charts focusable; four focus styles | G04: 32 fail |
| 6 | Interval and time zone lost; two zones on one page | G07: 18 fail |

**Re-checked on live data.**

| Finding | On the populated build |
|---|---|
| Gaps broken on Historical signals | Confirmed: PV and OP break at the sampling gap ([image](screenshots/day/1440x1024/R-05--historical--full.png)) |
| Mode lane on Historical | Drawn as a solid green lane, colour only, no text |
| SP dashed | Confirmed on Historical; legend only, no direct label |
| Overlay in violet on a non-AI series | Confirmed: actuator effort ratio |
| Unit | "PV / SP (unit not set)" on a loop with no registered unit |
| No zoom-window label | Confirmed: "Zoom area", "Undo", "Reset" with no times |
| Tooltip stays white at night | **Not verified at runtime.** The chart was below the fold, so the hover missed it. Source only |
| Export button text | "Signal samples (CSV)" wraps and overflows its button on Historical |

The conformance matrix marks 116 cells "re-measure". The table above covers the chart items; the rest stay marked, with new evidence in the crawl manifest.

**Data states.** 156 state images across 21 routes in Day and Night, with 0 blocked writes. Text matching found 1 error page(s) that also show empty text (G06). Bad quality and genuine restricted states were not reproduced.

## 10. Information architecture options

| | **Keep** | **Consolidate** (recommended) | **Restructure** |
|---|---|---|---|
| Destinations | 18: 16 CPM pages, Trend, Administration | 6 | 6 by ISA-101 level |
| Average pages per task | 1.83 | **1.42** | 1.63 |
| Tasks needing 2+ pages, of 24 | 18 | **10** | 15 |
| Content | −19 % from wording | About 200 more words, from removing 8 repeated headers and scope filters | Same as Consolidate |
| Components | B2 | B2 plus DataTable, inspector, TrendPanel | B2 plus those, plus a new unit view |
| Operator retraining | None | Moderate: names move, loop detail merges | High: every path changes |
| Loss of function | None | None intended; deep links redirect | Possible |
| Risk at Marun | Low | Medium; ship behind a flag | High |
| Estimate, engineer-days | 42-66 (first analysis) | **75-110** | 110-150 |

### Consolidate: target pages

| Destination | Holds | From today |
|---|---|---|
| **Overview** (CPA01) | Summary strip, ranked review table, inspector. KPI list as a filtered table state | `/cpm`, `/cpm/performance`, `/cpm/kpi` |
| **Episodes** | Ledger of episodes with an inspector | `/cpm/events` |
| **Loop** (CPA02) | Identity and mode strip; one aligned PV, SP, output and mode trend; review periods. Tabs: Performance, Diagnosis, Model | `/cpm/explorer`, `/cpm/historical`, `/cpm/investigation`, `/cpm/response`, `/trend` for one loop |
| **Evidence** | One evaluated window. Tabs: Gates, Replay, Windows, Calculations | `/cpm/evidence`, `/cpm/replay`, `/cpm/windows`, `/cpm/calculations` |
| **Setup** | Loops and configuration | `/cpm/registry`, `/cpm/config` |
| **System** | Pipeline, governance, administration | `/cpm/pipeline`, `/cpm/governance`, `/admin/*` |

Removed as pages, with their functions kept: Performance, KPI drill-down, Historical, Investigation, System Response, Replay, Windows, Calculations and free `/trend`. A multi-tag trend for arbitrary tags stays as a tool under Loop (owner to confirm). Old URLs redirect, so links keep working.

**Navigation (Q4 evidence).** Under the suite order Overview, Truss, CPA, Instrumental, PLC, Downtime, RCA, CPA becomes one module with the six destinations as its sub-navigation. Whether absent modules show, hide or disable stays with the owner. Setup and System are role-gated, so an operator sees four.

**Time range (Q5 evidence).** Options for the owner, in order of least change: the header shows the evaluated window on Overview, Episodes and Evidence, and a free range only on Loop trends; or the header is free everywhere and verdict surfaces show their pinned window, which guide p.7 already requires for event pages. A free range cannot recompute a fused verdict.

### Why Consolidate

Restructure adds a level 2 unit view that neither the guide nor any walked task needs, and it scores worse because diagnosis sits a level away from the loop. Keep leaves CPA02 scattered, so CPA01 and CPA02 cannot pass and the 8 trends and 10 pickers remain. Consolidate is the only option that makes both concept pages real, and it follows the pattern every other module already uses.

## 11. Component strategy for the recommended option

| Action | Components |
|---|---|
| Keep behind variables | `ObcButton` and passive OpenBridge parts |
| Replace (B2, 46 uses, 19 files) | Toggle group, tab row, filter and input chips, pagination, dropdown and icon buttons, text input, per [component-fit.md](component-fit.md) §4 |
| Build, one each | AppShell header, DataTable, Inspector, TrendPanel on one echarts theme builder, Toggletip, StatusBadge, data-state wrapper |
| Retire | Eight record lists on `<div>` rows; four duplicated loop-picker and scope blocks per page; the fifth-plus trend builders |
| Fix first | Modal and hook focus, 12 lost ARIA attributes, `RolesConfig` names |

Pin `@oicl/openbridge-webcomponents` and re-run `docs/theme/tools/obc-fit-probe.mjs` before any upgrade: the adapter depends on undocumented variables and parts.

## 12. Content strategy

- **Help registry.** One keyboard-reachable toggletip beside every value, fed from [help-registry-draft.md](help-registry-draft.md). It replaces `title` for definitions (CD16).
- **Internal text.** Translate raw enums, collapse pipeline terms into "Technical details", and remove file paths from operator pages (CD17).
- **Gate naming.** Name first, code in brackets (CD18).
- **Identity.** One product name; drop "Lean Automation", and settle "Traverse CPA" against the other three names in use (CD23).
- **Metric labels.** One name per concept, and only after Q7. Rewording before Q7 risks encoding the conflicts in §5.

## 13. Redesign and CPA-UI-PRM-002

**Recommendation: split it.** PRM-002 itself was not available, so this assumes it is the colour migration described in the first analysis §11.

| Ships first, independent of page structure | Folds into the redesign |
|---|---|
| Token layer, OpenBridge bridge, `data-theme`, first-paint script, Bright removal | Page-level literals and 361 inline colour properties, on pages that will be rebuilt |
| One echarts theme builder, which fixes 5 charts that ignore a theme change | Status remap per surface, after Q6 and Q7 |
| Shared geometry variables | Type scale per page |

Evidence: the bridge re-themes 1,827 declarations with no call-site edits, while 8 of 14 pages merge, so per-page colour work there would be thrown away.

## 14. Inputs for CPA-UI-PRM-004

**Decisions the prompt needs:** Q1, Q2, Q4, Q5, Q6, Q7, plus CD1 amended to B1 or B2, and the IA option.

| Phase | Scope | Acceptance |
|---|---|---|
| 0 | Fix live defects; remove the IEC 62443 claim; decide `/admin/system` | Tab reaches Modal footers; drawers trap focus; axe critical nodes on those surfaces at 0 |
| 1 | Foundation from §13; shell tokens | G02 passes; Day and Night switch every chart with no reload |
| 2 | AppShell header and module navigation | G03 passes on all routes; G07 keeps plant, loop, interval and zone across every hop |
| 3 | DataTable, Inspector, TrendPanel, Toggletip, StatusBadge, data states | G04, G05 and G06 pass on the shared components; a value table exists for every trend |
| 4 | Overview and Episodes | CPA01 rules pass: population, coverage, ranked table, sortable headings, stated basis, Unassessed distinct from Meets criterion |
| 5 | Loop | CPA02 rules pass: one aligned trend with mode, dashed labelled SP, "Controller output", plotted zoom window shown |
| 6 | Evidence, Setup, System | All 24 walks re-run; no walk needs more pages than the Consolidate figure; overlays pass the focus checks |
| 7 | Content, after Q7 | Every metric reaches its definition from the value; no Internal class on operator surfaces |
| 8 | Acceptance | G01-G12 at 1440, 1366, 1920, 1280, 1024 and 200 % zoom in both themes, on a populated lab |

**Proposed checkpoints:** after Phase 1 (theme parity), Phase 3 (components against contracts), Phase 5 (control-engineer review of the Loop page) and Phase 8.

## 15. Open decisions by owner

| Q | Decision | Owner | Evidence here |
|---|---|---|---|
| Q1 | Amend the OpenBridge rule in `CLAUDE.md` | Product owner, Lead | §8: B2 needs native replacements and undocumented variables |
| Q2 | Graphite Night against achromatic Night | Product owner, operations | First analysis §12; CD2 not on disk |
| Q4 | Module navigation | Product owner, Lead | §10 |
| Q5 | Header time range | CPA owner | §10 |
| Q6 | Status mapping | Control engineering, CPA owner | First analysis §4.5; CD8 not on disk |
| **Q7** | **Metric definitions and eligible periods** | **Control engineering, CPA owner** | **§5: 49 discrepancies** |
| Q8 | Plant time zone and reporting day | Operations, data owner | §9 |
| Q12 | Alarm priority and symbols | Alarm management | First analysis |
| Q13 | Control size | Lead, operations | §8: 40 px is reachable by variables |
| New | Waive the 3 px focus gap (B1 or B2) | Lead | §8 |
| New | Is a Reliability role needed? | Product owner | §7 |
| New | Keep a free multi-tag trend page? | CPA owner | §10 |
| New | Provide DEC-001, PRM-002 and skill R1.2 | Lead | §1 |

## 16. Risks and limits

**Limits of this analysis:**

- **The fitness gate was waived.** With 10 live loops and no current finding, the ranked queue is empty, and most KPIs and gates show no value. Densities on those pages are understated, and populated table density was not measured. No healthy or cascade loop exists.
- **Decisions not read.** DEC-001 and PRM-002 are not on disk, so CD references rest on their names in the brief, and I could not test them beyond CD1. The Internal class patterns are mine, not R2's.
- **One account.** Every pass ran as `superadmin`, so role differences come from source. No genuine restricted state was seen.
- **Crawl depth.** Depth 2, not the 3 requested, with at most 24 controls per entry and 3 per repeated row type, for time. Other representative loops were captured at entry level only. Overlays were captured at 1440 × 1024 only.
- **Chart hover.** The four chart-tooltip state images show no tooltip, because the charts sit below the fold. Chart tooltips are source-only.
- **Timings.** Request pacing and concurrent capture inflate them. Task durations are not reported.
- **Task walks** are shortest scripted routes, so they are a best case.
- **Rule-based ratings.** ISO scores use stated thresholds; they are not a usability test with users.
- **Stated by agents, spot-checked by me.** Parts D, G and H were produced by review agents. I re-read a sample of the highest-stakes claims. Citations in the lineage were machine-checked to exist, not all read.
- **Effort estimates** are rough, from occurrence counts.
- **Shared lab.** Another session was moving the historian during this work.

**Risks to the redesign:** operator retraining on a live plant; ship behind a flag. Adapter breakage on an OpenBridge upgrade. Rewording metrics before Q7. A control engineer should review every text change that touches safety context.

## 17. Method appendix

Run from the repository root with `CPA_BASE_URL`, `CPA_USER` and `CPA_PASSWORD` set. Nothing writes them to disk.

```powershell
node docs/theme/tools/crawl-surfaces.mjs                 # Parts B, C, E, I; pace 35/min
$env:CPA_OUT_DIR='docs/theme/deep/screenshots'; $env:CPA_LOOP='FIC10302'
$env:CPA_READ_POSTS='/api/v1/cpm/method-runs/evidence/batch,/api/bindings/resolve/batch'
node docs/theme/tools/capture-states.mjs                 # Part J
node docs/theme/tools/capture-states.mjs --super         # Part J, SuperAdmin pages
node docs/theme/tools/task-walk.mjs                      # Part F; $env:CPA_RATE sets the pace
node docs/theme/tools/reflow-capture.mjs                 # Parts C.2, I
node docs/theme/tools/source-surfaces.mjs                # Part B, source AST; also writes the deny-list
node docs/theme/tools/component-inventory.mjs            # Part G
node docs/theme/tools/lineage.mjs                        # Part D citation check
node docs/theme/tools/surface-report.mjs                 # inventory, behaviour, data states
node docs/theme/tools/task-report.mjs                    # task flows and option scores
node docs/theme/tools/text-audit-v2.mjs                  # Part E
node docs/theme/tools/annotate-v2.mjs <slugs>            # Part E.6
```

**Read-only controls:** `lib/guard.mjs` aborts non-GET API calls outside two POSTs proved to be reads in the first analysis (`CpmMethodRunsController.cs:109`, `binding-resolver/Program.cs:97`). Deny-list: 84 labels from source plus the built-in list, `deep/data/deny-list.json`. Keyboard presses are Tab and Escape only.

**Crawl configuration:** depth 2; 24 controls per entry; 3 per repeated type; 170 s per entry; token bucket with a burst of 30.

**Definitions:** word rules, stable state and text blocks are as in `cpa-currenttheme.md` §13. Reach is the share of the 24 walked tasks that visit a surface. Option hops replay each walk against a page map in `task-report.mjs`, counting a hop only when the destination changes.

**Manual readings:** the chart and table positions in §3 and the live-data checks in §9 were read from screenshots.
