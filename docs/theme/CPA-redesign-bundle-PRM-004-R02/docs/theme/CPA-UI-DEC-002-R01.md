# CPA — Deep Analysis Review and Redesign Decisions

| Field | Value |
|---|---|
| Document ID | CPA-UI-DEC-002 |
| Revision | R01 |
| Date | 2026-11-04 |
| Application | CPA — Control Loop Performance Management (Traverse Edge), `src/frontend-ob/` |
| Input reviewed | `docs/theme/deep/` (CPA-UI-PRM-003 R01 output): `cpa-deep-analysis.md` and the ten companion reports, 702 images. Production image built after commit `0b081f4d`, bundle prefix `root.hdpev2.cpm` |
| Builds on | CPA-UI-DEC-001 R01. Its decisions stand except where §3 amends or supersedes them |
| Governs | CPA-UI-SPEC-001 R01 (redesign specification) and CPA-UI-PRM-004 R02 (redesign prompt) |
| Owner | Tofel |

---

## 1. Review of the deep analysis

The analysis is accepted as the basis for the redesign. Its strongest parts are:
- the source-against-runtime surface reconciliation (70 source overlays, every unreached one given a reason);
- the metric lineage register (145 concepts, 2,795 citations machine-checked);
- the component-fit probe, measured in the browser against OpenBridge's own bundle;
- the task walks, which give the information-architecture options a measured basis.

I checked two claims against the captures. Both hold:
- **Historical:** the chart starts at about 780 px at 1440 × 1024, below the scope, loop, range and view blocks.
- **Explorer:** loop identity is repeated three times (context bar, location line, breadcrumb).

Seven qualifications apply:

| # | Qualification | Consequence |
|---|---|---|
| Q-A | **The fitness gate failed and was waived.** 10 of 243 loops were live, there was no current finding, and no healthy or cascade loop existed. Table density, the ranked queue and populated KPI states were not measured. | Development may proceed. **Acceptance may not:** PRM-004's final phase must run on a populated lab that meets the PRM-003 fitness rule, or acceptance is recorded as conditional. |
| Q-B | **The decision record, PRM-002 and skill R1.2 were not on disk.** The analysis therefore lists Q1, Q2 and Q6 as open, though they were decided in CPA-UI-DEC-001 (CD1, CD2, CD8). It also derived its own Internal-class patterns. | §2 closes these items. PRM-004 Phase 0 must verify that every governing document is present before any work, and stop if one is missing. |
| Q-C | **One account type (superadmin).** Role differences come from source, and no genuine restricted state was seen. | PRM-004 acceptance includes a viewer-level account. |
| Q-D | **Crawl depth 2, not 3.** 25 overlays are data-dependent or beyond the limit; chart hover tooltips were not captured because the charts sit below the fold. | The specification's function-preservation matrix (SPEC §8) covers these from source. Chart tooltips are verified in PRM-004 on the new TrendPanel. |
| Q-E | **Parts D, G and H were produced by review agents and spot-checked.** Lineage citations were machine-checked to exist, not all read. | Treat individual citations as leads. The four discrepancies re-read in source (D-08, D-14, D-15, D-17) are confirmed. |
| Q-F | **Correction to CPA-UI-PRM-001:** `ObcButton` paints at **34 px**; 48 px is its hit area. It reaches 40 px painted with a 6 px radius through variables alone, with no call-site changes. | This resolves Q13 (RD9). |
| Q-G | **The 49 discrepancies are mostly definition questions (Q7), but four are display defects** that the redesign must not carry forward: D-08, D-15, D-20 and D-39. | RD11. |

## 2. Status of the questions the analysis lists as open

| Analysis item | Status | Where decided |
|---|---|---|
| Q1 OpenBridge rule in `CLAUDE.md` | **Decided**, then amended here | CD1 → RD2 |
| Q2 Graphite or achromatic Night | **Decided: Graphite and Cyan** | CD2 |
| Q3 Bright | **Decided: removed, migrated to Day** | CD3 |
| Q4 Module navigation | **Decided here** | RD4 |
| Q5 Header time range | **Decided here: global range, pinned verdicts** | RD3 |
| Q6 Status colour mapping | **Decided**, except the colour of a confirmed finding | CD8 (confirmed = warning, pending control engineering) |
| Q7 Metric definitions and eligible periods | **Open**, owned by control engineering. Not issued | RD10 governs the redesign meanwhile |
| Q8 Plant time zone and reporting-day boundary | **Partly decided**: one zone per page, the site zone, always labelled (RD5). The reporting-day boundary stays open | RD5 |
| Q12 Alarm priority colours | **Open**; priority stays neutral until a site alarm philosophy exists | CD8 |
| Q13 40 vs 48 px controls | **Decided here** | RD9 |
| New: 3 px focus gap | **Decided: no waiver (B2)** | RD2 |
| New: Reliability role | **Decided: no new role** | RD7 |
| New: free multi-tag trend | **Decided: kept as a tool** | RD6 |

## 3. Redesign decisions

Status: **A** = approved by the owner on 2026-11-04; **R** = ruled from the guide, the brief or DEC-001 (stands unless the owner objects); **P** = proposed, awaiting the named party.

| # | Decision | Status |
|---|---|---|
| RD1 | **Information architecture: seven destinations.** The analysis's Consolidate option is adopted, with Performance kept as its own page: **Overview, Performance, Episodes, Loop, Evidence, Setup, System.** Overview implements CPA01 and Loop implements CPA02 as single pages (guide pp.11–13). Removed as pages, with every function kept: KPI drill-down, Explorer, Historical, Investigation, System Response, Replay, Window Inspector, Calculations, Registry, Gate Configuration, Pipeline Health, Governance. Old URLs redirect with their parameters. Page contents are fixed in CPA-UI-SPEC-001 §5, and every current function has a stated home in SPEC §8. Basis: analysis §10 (Consolidate: 1.42 pages per task, 10 of 24 tasks multi-page, against 1.83 and 18 today); guide p.29 suite pattern; ISO 9241-110 suitability for the task. | A |
| RD2 | **CD1 amended to option B2.** OpenBridge remains for `ObcButton` and the passive parts, behind the colour bridge plus geometry variables and the two `::part` rules. The 9 OpenBridge types rated Replace (46 uses in 19 files) are replaced with native or CPA-owned components that meet the contracts: segmented control (K-03), text input (K-04), tab row (K-05), filter chip (K-06), accordion (K-07), checkbox (K-08), dropdown button (K-09), pagination (K-10) and input chip (K-11). **There is no 3 px focus-gap waiver.** The CPA custom types rated Replace (priority-queue rows, attention list, record lists, top bar, theme switch) are rebuilt on the shared components (SPEC §6). Pin `@oicl/openbridge-webcomponents` to exactly `1.0.1`, and run `docs/theme/tools/obc-fit-probe.mjs` in CI, because the adapter relies on undocumented variables and parts. The CPA `CLAUDE.md` rule reads: "OpenBridge `ObcButton` and passive components behind the Traverse bridge; all other controls are CPA components built to the Traverse contracts; all colour values from the Traverse design system (CPA-UI-DEC-002 RD2)." | A |
| RD3 | **Time model: a global range with pinned verdicts.** The header time range (`range`, `from`, `to` in the URL) is global. It filters trends, episode lists, window lists, review-period tables and audit lists on every page. A verdict, KPI or gate result is never recomputed for a free range. Each one states the evaluated window it comes from, for example "12 h window ending 4 Nov 13:15 GST". The window kind (12 h or 24 h) is a page-level segmented control on Overview, Performance and Evidence (`window` in the URL). Basis: guide p.6 (header time range), p.7 (event pages keep their pinned window), p.28 (the window shown equals the data drawn). | A |
| RD4 | **Navigation.** The suite module order is kept in the sidebar: Overview, Truss, CPA, Instrumental, PLC, Downtime, RCA (guide p.6). Modules not deployed in this installation are **hidden**, not disabled, so that the list never offers an unavailable product. CPA's seven destinations form its second-level navigation; Setup and System appear only for holders of their permissions, so an operator sees five. The task-group labels ("Find problems" and the others) are removed. The 64 px rail and the drawer below 1024 px follow guide p.6. | R (hidden modules: P, product owner) |
| RD5 | **Context continuity (G07).** Plant scope (`site`, `area`, `unit`), loop (`loop`), time range and window kind live in the URL and travel on every link through one helper (`cpaHref`, extended). The page displays one time zone: the site's zone (`loop.timezone`, otherwise the site default), with the abbreviation shown on every timestamp and axis. The browser zone is not used. The reporting-day boundary for daily aggregates stays with Q8. | R |
| RD6 | **Tag trend tool.** The free multi-tag trend stays at its current path `/trend` (permission `historian.view`). It is not in the sidebar. It is reached from the Loop TrendPanel ("Add tags"), from the command palette and by URL. It is rebuilt on TrendPanel, so PV is no longer drawn in the alarm colour. | R |
| RD7 | **No new role.** Reliability tasks are served by Overview review filters (suspected valve problem, excessive actuator effort, saturated) and by the instrument-health detail on Loop. RBAC is unchanged. | R |
| RD8 | **Supersedes PRM-002.** Its foundation work becomes PRM-004 Phase 1: tokens, the OpenBridge bridge, the theme mechanism, Bright removal, the first-paint script, `chartTheme.ts`, and the `ObcButton` geometry variables. Its login hotfix becomes PRM-004 Phase 0. Its page-level colour sweep is dropped, because 12 of the current pages are rebuilt. CD6 ("colour only") no longer applies: the redesign applies guide geometry and typography. | R |
| RD9 | **Geometry and type (resolves Q13).** Guide p.6 baselines apply: sidebar 220 px with a 64 px rail; header 64 px; content padding 24 px; panel gap 16 px; panel radius 12 px and padding 20 px; controls at least 40 px painted with a 6 px radius; table rows 44 px (40 px compact); inspector 320–400 px; type 14 (body), 16 (key), 18 (section), 24 (page title) and 12 (metadata); tabular numerals for values and monospace for tags. Painted controls are 40 px. Hit areas stay at least 40 px, and `ObcButton` keeps 48. This exceeds WCAG 2.5.8 (24 px). | R |
| RD10 | **Metric text until Q7 is issued.** The redesign changes no calculation, threshold or definition. Where a merged page would show two labels for one concept, it uses the label of the concept's primary surface in the lineage register and records the choice in `docs/theme/redesign/label-register.md`. Definitions move into toggletips **verbatim from today's sources** (the help-registry draft, "as implemented"). No definition text is rewritten. After Q7, a separate content change applies the approved definitions and one name per concept. | R |
| RD11 | **Four display defects fixed in the redesign**, because each misstates data, not a definition: **D-08** (G4 STRONG renders grey: it becomes a warning tone per CD8); **D-15** (every `EXCLUDED_*` code reads "loop not in automatic": each code shows its own label from the vocabulary); **D-20** (users without `cpm.config.read` see "no threshold configured": they see "Thresholds not visible to your role"); **D-39** ("0 % of 0": an empty denominator shows "No loops in scope"). All other discrepancies go to control engineering, unchanged (`discrepancies.md`). | R |
| RD12 | **Live defects fixed first**, independent of the redesign: Modal footer buttons unreachable by Tab (`Modal.tsx:57`); drawers that do not trap focus and lose it on close (`useDialogA11y.ts:15-27`, `Modal.tsx:86`); every role permission announced as "Checkbox item" (`RolesConfig.tsx:264`); the IEC 62443 login claim and "Secure sign in" (CD20); `/admin/system` hidden (CD21). | R (CD21: P) |
| RD13 | **Permission guard mismatches** (analysis `hidden-surfaces.md`): `asset.view` alone cannot open Plant Model or Aliases; `/admin/audit` and `/admin/system` have no check of their own; `ingestion.view` opens `/admin/*` with no menu entry; a refused route redirects silently to `/cpm`. The redesign keeps the permission model unchanged, but every refused route shows a "Not available for your role" state instead of a silent redirect (G06 restricted). The guard corrections themselves need the product owner's confirmation before they change behaviour. | P (product owner) |
| RD14 | **One product identity.** The header shows the Traverse logo and module name "CPA". "Lean Automation" and the alternate product names are removed from the shell and login (CD23). | R |
| RD15 | **Deployment out of scope.** No release plan, site flag, image build or deployment is part of this redesign package (owner, 2026-11-04). The work is delivered on a branch with its evidence. | A |

## 4. Decisions inherited from CPA-UI-DEC-001

| DEC-001 | State |
|---|---|
| CD1 | Amended by RD2 |
| CD2, CD3, CD4, CD5 | Stand |
| CD6 | Superseded by RD8 and RD9 |
| CD7–CD11 | Stand. Status tones are applied through the StatusBadge component (SPEC §6) |
| CD12–CD14 | Stand. The TrendPanel implements CD12; the CD14 behaviour defects are fixed in TrendPanel, because the redesign rebuilds every trend (SPEC §6.4) |
| CD15 | Stands (skill R1.3 echarts section, for the Lead) |
| CD16–CD18 | Stand. The toggletip and the help registry are built in this package |
| CD19 | Superseded: content is applied in the redesign, within RD10 |
| CD20, CD21 | Stand; now RD12 |
| CD22 | Stands. SuperAdmin pages are rebuilt within System |
| CD23 | Stands; now RD14 |

## 5. Open items

| # | Item | Owner | Effect on the redesign |
|---|---|---|---|
| Q7 | Metric definitions, eligible periods and the 49 discrepancies | Control engineering, CPA owner | Text stays as implemented (RD10). Checkpoint R5 includes a control-engineer review of the Loop page |
| CD8 | Colour of a confirmed finding (proposed: warning) | Control engineering | Implemented as warning; one-line change if overruled |
| Q8 | Reporting-day boundary for daily aggregates | Operations, data owner | The KPI daily trend keeps today's boundary and states it |
| Q12 | Site alarm philosophy | Alarm management | Priority stays neutral |
| RD4 | Hidden or disabled absent modules | Product owner | Implemented as hidden |
| RD13 | Permission guard corrections | Product owner | Restricted states are shown; the guard logic is unchanged until confirmed |
| CD15 | Skill R1.3 echarts section | Lead | None |
| — | Lead's tokens package (guide p.30) | Lead | None; values are unchanged |
