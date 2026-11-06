# CPA — Redesign Specification

| Field | Value |
|---|---|
| Document ID | CPA-UI-SPEC-001 |
| Revision | R01 |
| Date | 2026-11-04 |
| Application | CPA — Control Loop Performance Management (Traverse Edge), `src/frontend-ob/` |
| Authority | Guide R01 (pp.3–7, 11–13, 26–29) → skill R1.2 → TRV-UI-BRF-001 → CPA-UI-DEC-001 → CPA-UI-DEC-002. Where this specification and a higher document disagree, the higher document wins; report the conflict |
| Evidence | `docs/theme/deep/` (CPA-UI-PRM-003). IDs `R-`, `V-`, `P-`, `O-`, `K-`, `M-`, `D-` refer to that analysis |
| Implemented by | CPA-UI-PRM-004 R02 |

This specification says **what each page contains, where each current function goes, and which shared components carry it**. It does not set pixel layouts. Geometry comes from guide p.6 (DEC-002 RD9), and hierarchy and density come from the concept images on pp.11–12, used for hierarchy only.

---

## 1. Principles

1. **Data leads.** The primary panel of every page (a table or a trend) starts above the fold at 1440 × 1024. Scope, loop and time controls live in the header or in one compact context header, never in stacked page blocks (Historical today starts its chart at about 780 px).
2. **One place per function.** Each function has one home. PV, SP and controller output are plotted by one TrendPanel; one loop picker exists; gate results use one vocabulary (glyph + name + code).
3. **Overview → detail → evidence.** The suite pattern applies (guide p.29): a title block, a summary strip, a primary panel, a persistent inspector with one primary action, and a ledger at the foot.
4. **Definitions on demand.** Every value has an ⓘ toggletip that opens its definition (CD16). Visible text is limited to labels, units, windows, states, coverage, source and errors.
5. **Operators do not see implementation.** Engine and pipeline terms, raw codes, run IDs and historian paths are translated or collapsed into "Technical details" (CD17). The System pages may show pipeline terms.
6. **Meaning is preserved.** No calculation, threshold or definition changes (DEC-002 RD10). The status tones follow CD8.

## 2. Information architecture

### 2.1 Destinations

Superseded 2026-11-06 by `docs/superpowers/specs/2026-11-06-cpa-structure-and-flow-design.md`: 17 pages under six headings, on the addresses the plant uses. The list is `src/frontend-ob/src/cpa/destinations.ts`.

| Heading | Page | Path | Permission |
|---|---|---|---|
| Find problems | Overview | `/cpm` | `analytics.view` |
| | Performance | `/cpm/performance` | `analytics.view` |
| | Loop Events | `/cpm/events` | `analytics.view` |
| Check a loop | Loop Explorer | `/cpm/explorer` | `analytics.view` |
| | Historical | `/cpm/historical` | `analytics.view` |
| Understand the cause | Investigation | `/cpm/investigation` | `analytics.view` |
| | Evidence Workbench | `/cpm/evidence` | `analytics.view` |
| | Evidence Replay | `/cpm/replay` | `analytics.view` |
| | Window Inspector | `/cpm/windows` | `analytics.view` |
| | Calculations | `/cpm/calculations` | `analytics.view` |
| | System Response | `/cpm/response` | `analytics.view` |
| Set up | Loop Registry | `/cpm/registry` | `analytics.view` |
| | Gate Configuration | `/cpm/config` | `cpm.config.read` |
| Engineering | Trend | `/trend` | `historian.view` |
| System | Pipeline Health | `/cpm/pipeline` | `system.manage` |
| | Administration | `/admin/*` | any Administration permission |
| | Governance | `/cpm/governance` | `system.manage` or any Administration permission |

Command palette: Ctrl+K, with a visible hint in the header search field.

### 2.2 Global URL context (RD3, RD5)

| Parameter | Meaning | Set by | Carried to |
|---|---|---|---|
| `site`, `area`, `unit` | Plant scope | Header plant selector | Every CPA link |
| `range` (`8h`, `24h`, `7d`, `30d`, `custom`), `from`, `to` | Global time range | Header time range | Every CPA link |
| `window` (`12h`, `24h`) | Evaluated window kind | Page segmented control (Overview, Performance, Evidence) | Overview, Performance, Episodes, Loop, Evidence |
| `loop` | Selected loop | Tables, loop picker | Loop, Evidence, Episodes (filter), Setup |
| `tab` | Page tab | Tabs | Same page |
| Page-specific (`review`, `gate`, `metric`, `event`, `case`, `methodRun`, `windowId`, `view`) | Selection inside a page | Page | Same page or the destination's deep link |

The site time zone is shown once in the header ("Times in GST") and as the abbreviation on every timestamp and axis. A link built without `cpaHref` is a defect.

### 2.3 Route map and redirects

Every page keeps the address the plant uses (design 2026-11-06). These old addresses redirect with `replace`. Unlisted parameters are carried unchanged. The table lives in `src/frontend-ob/src/cpa/redirects.ts`.

| Old route and parameters | New route and parameters |
|---|---|
| `/cpm/kpi?kpi=K` | `/cpm?review=K` |
| `/admin/audit` | `/cpm/governance` |
| `/cpm/loop?tab=summary`, or none | `/cpm/explorer` |
| `/cpm/loop?tab=signals`, `history`, `calculations` | `/cpm/explorer?tab=Signals`, `History`, `Calculations` |
| `/cpm/loop?tab=historical`, `diagnosis`, `model` | `/cpm/historical`, `/cpm/investigation`, `/cpm/response` |
| `/cpm/evidence?tab=gates` | `/cpm/evidence` |
| `/cpm/evidence?tab=replay`, `windows`, `calculations` | `/cpm/replay`, `/cpm/windows`, `/cpm/calculations` |
| `/cpm/setup?tab=loops`, or none | `/cpm/registry` |
| `/cpm/setup?tab=configuration&sub=T` | `/cpm/config?tab=T` |
| `/cpm/setup?tab=plant-model`, `data-sources`, `tag-aliases` | `/admin/plant-model`, `/admin/data-sources`, `/admin/aliases` |
| `/cpm/system?tab=pipeline`, `governance`, or none | `/cpm/pipeline`, `/cpm/governance` |
| `/cpm/system?tab=users`, `roles`, `settings` | `/admin/users`, `/admin/roles`, `/admin/system` |

## 3. Page anatomy (all destinations)

| Region | Content | Rules |
|---|---|---|
| **Header** (AppShell, 64 px) | Traverse logo and "CPA"; plant selector; search ("Search loops, tags and records", opens the palette); time range with zone; environment indicator (accent outline); Day/Night switch; user menu with Sign out (ghost) | One instance for the whole app (SPEC §6.1) |
| **Title block** | Breadcrumb "CPA / <page>"; page title (24 px); one identity or scope line; right side: page controls (window kind) and the page's primary action, if any | No purpose sentence. The page purpose sits in the sidebar item's description and in the ? help |
| **Summary strip** | 3–5 figures (MetricSummary), each with unit, window and ⓘ | No nested cards |
| **Primary panel** | One DataTable or one TrendPanel | Starts above the fold at 1440 × 1024 |
| **Inspector** | 320–400 px, persistent at ≥ 1280 px, drawer below; selection detail and **one** primary action | Selection updates the main view and inspector together (p.7) |
| **Ledger / tabs** | Full-width secondary tables or tabs below the primary panel | |

## 4. Content rules (applied on every page)

| Text kind | Treatment |
|---|---|
| Page purpose sentences, eyebrow task names ("FIND PROBLEMS") | Removed (breadcrumb replaces the eyebrow) |
| Metric definitions, counting rules, thresholds, method notes | ⓘ toggletip from the help registry, verbatim as implemented (RD10) |
| Raw enums (`NO_CALL`, `UNSET`, `PERIODIC`, `EXCLUDED_*` …) | Display labels from the vocabulary; each `EXCLUDED_*` code gets its own label (RD11, D-15) |
| Run, bundle, source and method IDs, engine versions, historian paths, topic names | "Technical details" disclosure, keyboard reachable, copyable |
| Pipeline terms (Flink, Kafka, watermark, proxy, A8, arrays, scalars) | Not on Overview, Performance, Episodes, Loop or Evidence. Allowed on System, inside Technical details |
| Gate references | Name first, code secondary: "Data quality · G0" (CD18) |
| "Click to …" affordances, repeated section descriptions | Removed |
| Empty, error, stale, partial and restricted text | Short state title plus reason plus one recovery action (G06) |
| Units, data-state labels, coverage, time zone, source, errors | Never removed |
| Product identity | Traverse logo and "CPA" (RD14) |

The per-block wording is in `docs/theme/deep/content-audit-v2.md` (classes and proposals). That file is the starting list; RD10 limits it to non-definition text.

---

## 5. Page specifications

Each page lists, by region, what it contains and **where that content comes from today** (component or route), followed by its actions, states and acceptance criteria. Component names in *italics* are existing CPA components re-hosted on the shared components of §6.

### 5.1 Overview — `/cpm` (CPA01)

**Replaces:** `/cpm` (R-01, V-01, O-001), `/cpm/kpi` (R-14, V-10).

| Region | Contains | From today |
|---|---|---|
| Title block | "CPA / Overview"; title "Overview"; scope line "243 loops in scope · 241 monitored"; window kind 12h / 24h; "Results from the newest 12 h window ending 4 Nov 13:15 GST · updated 14:31" | *WorkspaceHeader*; *OperatingPicture* header line; 12h/24h toggle |
| Summary strip (3 figures + 1) | **Assessed** (n of monitored, %); **Needing review** (n); **Data coverage** (% assessable, with the breakdown into not assessable, stale and never evaluated in its ⓘ); **Performing acceptably** (n, % of assessed). Each figure shows the change against 24 h earlier where it exists today | *OperatingPicture*, *KpiCard* (M-001…M-025); the three coverage cards collapse into Data coverage |
| Distribution band | One stacked bar: every monitored loop, one state each (finding, symptom only, acceptable, not assessable, stale, never evaluated), with counts. Each legend item filters the table. Normal segment = `surface.raised` with a `border.strong` edge | *OperatingPicture* state bar (C14) |
| Review filters | Segmented filter set with counts: **Needing review** (default), Oscillating, Suspected valve problem, Excessive actuator effort, Saturated / at limit, In manual, Out of normal mode, Performing acceptably, Not assessable, Stale, Never evaluated. URL `review=` | The seven KPI tiles and three coverage tiles; `/cpm/kpi?kpi=` |
| **Primary: review table** | DataTable, one row per loop. Columns: Loop (tag, mono) · Parent asset (site › area › unit) · Condition (StatusBadge) · Review metric (value + unit, the metric that selected the loop, for example "good-error share 42 %") · Priority (neutral badge) · Persistence (time outside the good-error band, or episode age) · Coverage (%) · Last evaluation (time + zone) · Acknowledgement. Sortable headings; the default order is the priority rule, stated in the column ⓘ ("Ranked by priority") (p.13 R2, R3). When a filter other than Needing review is active, a **Deciding value** column shows the value that put the loop in that set, against its rule. For Not assessable, a Reason column shows the specific reason (A5) | *PriorityQueue* (K-53), *KpiRowsTable*, *priorityReason.ts*, `windowEnd` from the payload (currently unused), *GoodErrorBar* (as a cell bar with value) |
| **Inspector** | **No selection:** "Select a loop" plus the active filter's KPI proof (rule, threshold, population, computed time) and the KPI daily trend for the filter (C9, 30 days, "no data" days shown as gaps). **Loop selected:** identity (tag, service, asset, criticality); condition badge; **Why this loop** (the metric or rule that selected it, with value and window; p.13 R4); named statistics for the evaluated window; a small aligned PV / SP / Controller output trend **for the same evaluated window** (A3, R10); episode state; **primary action "Open loop"** (→ Loop with `loop`, `window`, range = the evaluated window); secondary "Open episode" | *LoopFocus*, *FocusedLoopDrawer* (O-001), the top-priority finding card (`CpmOverview.tsx:136-160`), *CpmKpiDrilldown* proof, *KpiTrendChart* (C9) |
| Ledger | **Recent episodes**: the 10 most recent in scope and range, with a link to Episodes carrying the filter (fixes the trail ignoring plant scope). **Configuration limits**: "VP not mapped on 236 loops (valve confirmation unavailable)" and "Peer links missing on 241 loops (interaction analysis unavailable)", each linking to Setup › Loops filtered | Event trail (`CpmOverview.tsx:162-194`), *ReadinessStrip* |
| Removed | Purpose sentence; Site/Area/Unit selects (moved to the header); "Each monitored loop counted once…" sentence (→ Assessed ⓘ); "Ordered by priority…" sentence (→ column ⓘ); "Pick a loop…" (→ inspector empty state) | Content audit top 30 #2, #4, #5, #8, #13, #16 |

**Actions:** none that write. Selecting a row updates the inspector; Enter opens Loop.
**States:** loading skeleton per region; empty filter ("No loops match Oscillating in this scope", Reset filter); error with retry, never with empty text; stale banner ("Newest results are 3 h old", with last update time) over retained values; partial (the KPI service failed while the table loaded: the summary strip shows "Unavailable" with retry).
**Acceptance:**
- CPA01 rules R1–R5 and A2–A5 pass: one strip with assessed, needing review and coverage; a ranked table with tag, parent asset, value and unit, state, coverage and last evaluation; sortable headings with a stated basis; a review-condition filter; unassessed loops listed with their reason.
- The table starts above 600 px at 1440 × 1024.
- Every figure reaches its definition by keyboard.
- The inspector trend interval equals the evaluated window.

### 5.2 Performance — `/cpm/performance` (kept, DEC-002 RD1)

**Replaces:** R-02, V-02, P-001, P-002.

| Region | Contains | From today |
|---|---|---|
| Title block | "CPA / Performance"; window kind 12h / 24h; "Newest evaluated window ending 4 Nov 13:15 GST" | *WorkspaceHeader*; the "Newest fused window emitted…" line, reworded (no "fused") |
| Summary strip | Good-error time (fleet median, %); Median error (% of span); Loops with periodic diagnosis (n of assessed); Diagnostic capability (n of N loops able to confirm a valve fault, with the coverage reason in its ⓘ) | *KpiTile* ×4 (`CpmPerformance.tsx`) |
| Gate roll-up | Column chart of loops held back per gate, grouped as Eligibility (G0–G2r), Performance (G3–G4), Diagnostic evidence (G5–G11), Confirmation (G12–G14), Fusion (G15). Labels show names first ("Data quality", code below). Selecting a column filters the table to that gate | *GateRollup* (C13) |
| Filters | Rows: Needs attention / Evaluated / Not evaluated / All (with counts); quick filters: Missing binding, Stale collection, Active affected-device condition; view: **Checks behind the result** / **Full gate matrix**; sort: By evidence score / By control error, with the basis stated in the sort control's ⓘ (D-23) | *AttentionList* controls, the filter chips (K-06 → replaced), the segmented view toggle (K-03 → replaced) |
| **Primary: gate matrix** | DataTable with grouped column headers: one row per loop (tag, mono; service); one cell per gate showing glyph + short state ("✓ Pass", "! Needs attention", "✕ Failed", "— Not evaluated", "n/a"), with `ok-limited` and DISABLED given distinct glyphs and a legend (CD8). Roving keyboard focus across cells is kept | *GateMatrix*, *GateMatrixChecks*, *ResultCell*, *AttentionList* (K-54 → DataTable) |
| **Inspector** | **Cell selected:** gate name and code; the result for that loop and window; the deciding values against their thresholds; the effect on the verdict; **primary "Open evidence"** (→ Evidence › Gates with `loop`, `gate`, `window`). **Nothing selected:** the "How to read this view" content | *GateEvidencePanel*, *EvidenceBody*, *GateGuidePanel* (P-001, P-002) |
| Removed | "Compare every loop gate by gate…" sentence; "Verdicts fuse on 12h / 24h…" note (→ window ⓘ); "(select a loop in the matrix first)" | Content audit #29 |

**Acceptance:**
- Every cell can be reached by keyboard and is labelled with loop, gate and state.
- Selection is never shown by colour alone (G05).
- The ranking basis is stated.
- "Open evidence" carries loop, gate and window.

### 5.3 Episodes — `/cpm/events`

**Replaces:** R-03 (label "Loop Events" → "Episodes").

| Region | Contains | From today |
|---|---|---|
| Title block | "CPA / Episodes"; scope and range line ("Episodes active in the selected range") | *WorkspaceHeader* |
| Summary strip | Open; Unacknowledged; Shelved (with shelf expired); Closed in range | The state filter counts |
| Filters | State: All, Open, Unobservable, Unacknowledged, Acknowledged, Shelved, Shelf expired, Closed (with counts); Order: Triage / Newest, with the triage rule in its ⓘ ("open first, highest evidence score first"); Find (loop, family or diagnosis) | *CpmEvents* filters |
| **Primary: episode ledger** | DataTable: Episode (fault family and peak, for example "Oscillation, peak confirmed") · Loop (tag, mono) · Severity now and Peak, in separate columns (D-37) · Current verdict ("Not evaluated: not enough data") · Acknowledgement · Availability · Opened (time + zone) · Duration · Shelf | *CpmEvents* rows (K-55 → DataTable) |
| **Inspector** | Episode identity and badges; **What happened** (one-paragraph summary, as implemented); Condition and Availability as separate fields; Persistence (windows, qualified support); Provenance → Technical details; **History** (state changes, acknowledgements, shelving, notes) | *EventDetail*, *EventHistory*, *ConditionsPanel*, *EpisodeNotes*, *ActionReceipt* |
| Inspector actions | **Primary: Acknowledge** (when unacknowledged); outline: Shelve / Unshelve (with duration and reason), Add note, Open loop (→ Loop › Diagnosis with the episode period as the range), Open evidence (→ Evidence for the peak window) | `useAcknowledgeEvent`, `useShelveEvent`, `useUnshelveEvent`, `useLinkLoopNote`; *ShelvePanel*, *UnshelvePanel* |

**Rules:**
- Shelving follows ISA-18.2 semantics: shelved is neutral, shelf expired and unreviewed is warning, acknowledged is info (CD8).
- "Saving a note never acknowledges an episode unless that box is ticked" is shortened to "Saving does not acknowledge the episode." beside the checkbox.

**Acceptance:**
- The ledger is keyboard operable (rows focusable; Enter selects).
- Each write action shows a receipt and keeps the selection.
- The header range filters the ledger.

### 5.4 Loop — `/cpm/loop?loop=…&tab=…` (CPA02)

**Replaces:** Explorer (R-04, V-03…V-06, V-11, V-17, V-23, V-24, P-003…P-013, O-002…O-006), Historical (R-05, V-12, V-18, O-007, O-008, P-014), Investigation (R-06, V-13, V-19, P-015…P-018), System Response (R-11, O-016, O-017, P-027). The Overview loop focus becomes a link here.

**No loop selected:** a loop picker (AssetPicker), with recently opened loops and the Overview needing-review list as suggestions.

| Region | Contains | From today |
|---|---|---|
| **Context header** | Loop picker (one, replacing the ten per-page pickers and their scope blocks); tag (mono) and service description; class; criticality (neutral); location breadcrumb, **once**; instrument health pill (NE107 code + label, Unknown separate) | *LoopContextBar*, *LoopCombobox*, *LoopTree*, *PlantScopeFilter* (removed from page), the instrument health pill |
| **Status strip** | Mode (text, neutral; "Out of design mode" as warning only against the configured threshold); PV; SP; Controller output (with units: "unit not set" where the registry has none); last stored time, or "Stale since T"; evaluated window ("12 h window ending 13:15 GST"); verdict badge | *OperatingState* tiles, the signal-quality line, the verdict from *LoopSummaryCard* |
| Readiness | When the loop does not produce verdicts: one collapsed bar, "Not producing verdicts · 3 to fix · 1 blocking", expanding to the list with links to Setup | *ReadinessBar* (P-004) |
| **Primary: TrendPanel** | One time axis for: PV (solid), SP (dashed, labelled), Controller output (own axis; "%" only when a range is declared), VP (when mapped); a **mode lane** with text per segment; a **verdict lane** of evaluated windows (keyboard selectable); context lanes for at-limit or saturation, bad quality and no sample (hatch); and the instrument-health lane. Range = the header range (default 24 h). Panel toolbar: series toggles; Fit to data / Engineering range; Normalise; KPI overlay (select); zoom with the **plotted window label** ("Plotted 4 Nov 07:11 – 15:11 GST"); Undo; Reset; **Value table** toggle; Export menu (signal samples CSV, evaluated windows CSV/JSON, evidence package for the selected window); Add tags (→ `/trend` with this loop's tags) | *SignalTrend* (C1), *CpmHistorical* chart (C2) and *RangeToolbar*, *LoopTrendPanel*, *TimeRangeBar*, *HealthLane* (C7); exports from P-014 |
| **Inspector: Performance review** | Current verdict and pattern (as implemented); review state; named statistics for the window; **Next check** (shortened: "Check signal arrival in Window Inspector" → "Check signal arrival", with a link to Evidence › Windows); **primary "Open evidence"** (→ Evidence with `loop`, window). **When a verdict band or review period is selected**, the inspector shows that window: verdict, gate summary, coverage, calculation version, with "Open evidence" for that window | *LoopSummaryCard*, *SelectedWindowPanel*, *ConclusionStrip* |
| **Tabs** (below the trend) | **Performance** · **Diagnosis** · **Model** · **Signals** | Explorer tabs, Investigation, Response |

**Tab: Performance** (default)

| Section | Contains | From today |
|---|---|---|
| Loop KPIs | MetricSummary groups with value, unit, window, change against the previous window and ⓘ: **Control performance:** Time in normal mode, Good-error time, Control error (MAE), PV variability (2σ), Setpoint changes. **Actuator activity:** Time at an OP limit, OP travel, OP reversals. **Evidence quality:** Data coverage (samples present of expected, with the G0 result). G4 STRONG renders as warning (RD11, D-08) | *LoopKpiCards*, *KpiCard* (M-078…M-093) |
| Review periods | DataTable of evaluated windows in the range: window (start–end, kind), verdict, review state, coverage, calculation version, "Open evidence" link (CPA02 B3) | Verdict lane (pointer only today), Explorer History, the Investigation window list |
| Latest gate results | Gate strip, names first, grouped (Eligibility, Performance, Diagnostic evidence, Confirmation, Fusion), with the legend; selecting a gate shows its detail in the inspector, with "Open evidence" | *SummaryGateStrip*, *SummaryGateDetail*, *FusedGates*, *FusedResult* |

**Tab: Diagnosis** (replaces Investigation and Explorer History)

| Section | Contains | From today |
|---|---|---|
| Conclusion | The conclusion, the evidence behind it and what to check next; evidence score with "Ranks explanations; not a probability" in its ⓘ | *ConclusionStrip*, *CaseTriage*, *EvidenceScoreNote* |
| Reasoning | Reasoning chain (stages with state), cause breakdown, hypotheses (observed, qualified, leading); score bars use a neutral fill (CD8) | *ReasoningChain*, *CauseBreakdownRows*, *HypothesisPanel* |
| Windows compared | Current against previous evaluated window ("No previous window to compare" when there is only one) | *WindowBrowser* |
| Instrument health | NE107 detail for the loop's transmitters (fixed fills; code + label; Unknown separate) | *TransmitterHealthPanel*, health drawer (O-002…O-006) → inspector content |
| Episodes for this loop | DataTable of this loop's episodes in range, linking to the Episodes inspector | *HistoryTab* (P-011…P-013) |
| Notes | Loop notes: list, create, link to an episode, set outcome | *LoopNotes*, `useCreateLoopNote`, `useLinkLoopNote`, `useSetLoopNoteOutcome` |
| Technical details | "Advanced — engine trace (raw codes)" | P-016 |

**Tab: Model** (replaces System Response)

| Section | Contains | From today |
|---|---|---|
| Response events | DataTable of setpoint and output steps in range: state and reason; censored candidates behind "Show 324 censored candidates" | *EventList*, *EventAside*, P-027 |
| Process model | Accepted model card, candidate models, uncertainty and margins, Bode and residual panels, model history | *ResultCard*, *CandidateModelsTable*, *BodePanel*, *ResidualPanel*, *ModelHistoryBody* |
| Actions | "Review model" (dialog; `useReviewModel`) | *ModelReviewDialog* |
| Empty | "No model yet: needs an accepted response event." | Content audit, response |

**Tab: Signals** (replaces Explorer Signals and Relationships)

| Section | Contains | From today |
|---|---|---|
| Signal bindings | PV, SP, OP, VP and mode tags: binding state, source, last value, unit, quality | *SignalsTab* |
| Loop model | Service family, dynamic class, objective, topology, command path, acquisition, loop type, criticality, gate profile (values translated from enums, CD17); the historian path in Technical details | *LoopModelCard*, *RoleCard* |
| Relationships | Peer links and their state; "Needs asset relationships for interaction analysis (G13)" with a link to Setup | *RelationshipsTab* |

**Removed from the loop pages:** the three repeated location lines; the eight-block scope, loop, range and view stack on Historical; "One loop's current condition…"; "The shaded band is…" (→ lane legend); the separate Explorer and Historical trend builders; "Open in Historical ›" and "Show on trend ›" buttons (one page now).

**Acceptance:**
- CPA02 B1–B6, R7, R9, R11 and C2 pass: PV, SP, controller output and mode on one aligned axis; "Controller output" labelled; SP dashed and labelled; mode, saturation, manual and bad-quality context present; the plotted window is shown; a value table exists; the cursor is synchronised across lanes; review periods are listed with source links.
- The trend starts above 450 px at 1440 × 1024.
- Every function listed in SPEC §8 for Explorer, Historical, Investigation and Response is reachable within this page.

### 5.5 Evidence — `/cpm/evidence?loop=…&tab=…`

**Replaces:** Evidence Workbench (R-07, V-14, V-20, P-019, P-020), Replay (R-08, O-009, O-010, P-021), Window Inspector (R-09, V-15, V-21, O-011, O-012), Calculations (R-10, V-16, V-22, O-013…O-015, P-022…P-026), and the Explorer Calculations tab (V-04).

| Region | Contains | From today |
|---|---|---|
| Context header | Loop (picker, shared with Loop); **pinned evaluated window** (kind, start–end, zone), with a window picker and previous/next; evidence basis ("Complete", "Rebuilt", "Retained"; Rebuilt labelled); verdict for the window; method run, bundle and source IDs in Technical details | *EvidenceHeaderStrip*, *EvidenceBasisBar*, *EvidenceToolbar*, *CopyableId* |
| Tabs | **Gates** · **Replay** · **Windows** · **Calculations** | Four routes today |
| Inspector | The selected gate, metric or window in detail; the thresholds this window ran under ("Thresholds not visible to your role" for users without `cpm.config.read`, RD11 D-20); one primary action per tab | *ExplainPanel*, *ExplainWhy*, *EffectiveConfigDrawer*, *CalcDrawer* |

**Tab: Gates.**
- The gate list by group, names first, each with its result state.
- The decision (G15) at the top.
- One body per gate (G1 mode authority … G15 decision, as implemented), with its charts on TrendPanel / `chartTheme` (C4, C5, C6, C8): signal context lanes, historian lanes, interval lanes, trajectory, G13 peer panes.
- An evidence artifacts list with CSV export.
- Actions (outline, each with its consequence stated): **Reconstruct evidence** (`useReconstruct`; "Rebuilds the arrays from the run's window; rebuilt arrays are labelled Rebuilt") and **Evaluate window** (`EvaluateWindow`).
- From today: *GateEvidenceWorkspace*, *GateResultStatePanel*, *VerdictCard*, *G1ModeAuthority*…*G15Decision*, *SignalContextLanes*, *HistorianLanes*, *IntervalLane*, *Trajectory*, *G13Interaction*, *ArtifactCard*, *TimelineTable*, *WindowFlags*.

**Tab: Replay.**
- Pipeline stages for the window (fixed shape, ⓘ).
- The raw historian slice on TrendPanel (time view and phase plane).
- The truncation note, if any.
- **Run historical replay** (`useRecompute`; the label drops "A8"; the consequence is stated); loop notes.
- From today: *CpmReplay*, *ReplayChart* (C3), *LoopNotes*.

**Tab: Windows.**
- DataTable of evaluated windows: kind, start, emitted, sample completeness with its density bar (C12, with Sparse and Empty marks legible), state.
- Compare across kinds.
- Runtime status reduced to "Producing verdicts" / "Not producing verdicts", with a link to System › Pipeline (job and watermark detail in Technical details).
- From today: *CpmWindows*, *WindowResultsPanel*, *WindowDetail*, *KindRow*, *CompareAcrossKinds* (row keyboard path added).

**Tab: Calculations.**
- Strip: metrics stored, evidence gates in the pack, gates acceptable, needing review, not evaluated.
- DataTable catalogue: ID (mono), calculation (name; the one-line definition moves to ⓘ), gate (name · code), value + unit, window, gate result; search, gate and type filters, sortable headings.
- Selecting a row opens the calculation detail in the inspector: definition, formula, window, eligibility, "Calculation version, stamped on this value". **This is the "Full calculation ›" target of every ⓘ in CPA.**
- From today: *CpmCalculations*, *SortHeader*, *CalcDrawer* (O-013…O-015); "Not measured — not in this window's result (written by an engine version without this metric)" → "Not measured (older engine)".

**Acceptance:**
- The window is pinned and shown on every tab.
- No pipeline term appears outside Technical details.
- Every gate is named first.
- Every chart passes the TrendPanel contract.
- `?metric=` opens the inspector on that metric.

### 5.6 Setup — `/cpm/setup?tab=loops|configuration`

**Replaces:** Loop Registry (R-12, V-07, O-018, O-019) and Gate Configuration (R-13, V-08, V-09, O-020…O-025, P-028…P-030).

**Tab: Loops.**

| Region | Contains | From today |
|---|---|---|
| Summary strip | Registered; Onboarded and evaluated; Degraded; VP not mapped; Peer links missing | Registry header and readiness counts |
| Primary | DataTable of loops: tag, service, site, class, signal mapping state ("Not mapped" as unknown), readiness (state), gate profile, criticality; filters with Reset (fixes "No loops registered" on a filtered-empty list) | *LoopRegistry* list |
| Inspector | Readiness for the loop (what is degraded and why); observability; gate role policy and roles per gate; effective configuration; links to Loop and Evidence | *ProfileAside*, *EffectiveConfigDrawer*, *AllSettings* |
| Actions | **Primary: Add loop** (dialog wizard: Identity, Classification, Signal mappings, Review; the Continue button carries its reason when disabled); Bulk import (dialog); Activate (`useActivateLoop`); Re-project links and republish evidence (`useRepublishEvidence`, consequence stated) | *AddLoopWizard*, *ClassificationStep*, *SignalPathField*, *PlantLocationPicker*, *ReviewStep*, *BulkImportDialog* |
| Help | "A loop is only as good as its signal mappings…" (banner) → ⓘ on Readiness; "G9 geometry is supporting-only…" → ⓘ | Content audit #6 |

**Tab: Configuration.**

| View | Contains | From today |
|---|---|---|
| Overview | Properties and workers announced; bundles in progress | *ConfigOverview* |
| Effective | What one loop runs under: layered values (site, profile, loop) with the layer that sets each; per-gate properties | *EffectiveView*, *PropertyTable* (P-029, P-030) |
| Bundles | The bundles at each of the three levels; "No bundle at this level; the layer below applies" | *BundlesView* |
| Editor | Draft → Validate → Shadow → Approve → Deploy → Rollback, with the lifecycle panel, diff impact, shadow comparison and deployment status. Each step's button states its consequence; Approve requires an independent approver (as implemented) | *EditorView*, *PropertyForm*, *LifecyclePanel*, *DiffImpactPanel*, *ShadowComparison*, *DeploymentStatus*, `useConfigActions` ×7 |

Change classes (DEPLOYMENT, STATE_BOUNDARY) render as neutral badges with translated labels (CD8).
**Acceptance:**
- Every write button names its consequence and, when disabled, its reason.
- The wizard is fully keyboard operable, with its footer reachable (RD12).

### 5.7 System — `/cpm/system?tab=pipeline|governance`

**Replaces:** Pipeline Health (R-15, P-031) and Governance (R-16, P-032, P-033). Administration is linked from here.

| Tab | Contains | From today |
|---|---|---|
| **Pipeline** | Status strip: required jobs (running / expected), last completed age, checkpoint age, recompute state, with "—" replaced by "Not exposed" plus its reason in ⓘ (no zero-fill: C10 gaps break); live metrics chart since the page opened ("Live snapshots since this page opened; needs two readings"); **Recompute** (`useRecompute`, consequence stated). Pipeline terms (Flink, Kafka, watermark) are allowed here, in Technical details | *CpmPipeline* (C10), *KpiTile* |
| **Governance** | Approval queue (validated drafts awaiting an independent approver); audit events (CPM loops, CPM events) as a DataTable with search and reset (fixes "No governance events recorded yet" on a filtered-empty list); versions carried in each stored window; **Verify audit chain** (`useVerifyAuditChain`, "Hash-chained; run a verification to confirm integrity") | *CpmGovernance*, *ConfigApprovalQueue* |
| **Administration** (link list) | Users, Roles and permissions, Data sources, Plant model, Tag aliases, Audit log → `/admin/*` (System settings hidden, CD21) | `/admin/*` |

**Administration pages** (`/admin/*`, routes unchanged) are rebuilt inside the shell with the shared components:
- Users: DataTable plus user dialog (add, edit, delete).
- Roles: permission checkboxes named, RD12; description saved with an explicit Save instead of PUT on change, which needs product-owner confirmation (RD13).
- Data sources: their record lists become DataTables (531 words today, mostly row content).
- Plant model.
- Tag aliases: a DataTable with paging (fixes the 1,505 px sideways scroll).
- Audit log: "Immutable cryptographically-chained record of all operator and system actions" is replaced by "Chained audit record" (CD20 basis).

### 5.8 Tag trend — `/trend` (tool)

- Multi-tag trend on TrendPanel: pens on `chart.series` per CD12 (no alarm colour on PV), SP dashed when the pen is a setpoint role, a y-axis per unit, the plotted window label, the value table and live/pause.
- Empty: "No tags selected" with an Add tags action. A resolver error is shown, never dropped (G06; first analysis §9.8 note 13).
- Reached from the Loop TrendPanel ("Add tags"), the command palette and URL.

### 5.9 Login

The split-screen layout per IAMS-UI-PRM-002 (brief §2), with the existing authentication contract unchanged:
- Traverse logo and "CPA";
- "Sign in";
- "Authorized use only. Access is restricted to authorized operators.";
- build version and real status values only.

There is no compliance claim (CD20).

---

## 6. Shared components

Each component is built once in `src/frontend-ob/src/ui/` (new folder), on Traverse tokens, and documented in `docs/theme/redesign/components.md` with its states and keyboard model. Contracts come from skill R1.2 `references/components.md` and guide pp.5–7 and 26–27.

| # | Component | Contract summary | Replaces (analysis K-IDs) |
|---|---|---|---|
| 6.1 | **AppShell** | Header 64 px with logo + module, plant selector, search, time range + zone, environment indicator, theme switch (two-state icon, `aria-pressed`), user menu; sidebar 220 px / 64 px rail / drawer below 1024 px; suite module order; CPA sub-navigation with the selected rule (surface.selected, action.primary text, 3 px start edge); skip link; landmark structure (one `main`) | K-60, K-61 (top bar), K-62 (theme switch), K-56, K-57 (per-page scope) |
| 6.2 | **ContextHeader** | Breadcrumb, title, identity or scope line, page controls, primary action | *WorkspaceHeader*, *LoopContextBar* |
| 6.3 | **MetricSummary** | 3–5 figures; value (tabular, key size), unit, label, window, change, ⓘ; Unavailable / Stale states; no nesting | *KpiCard*, *KpiTile* (K-31, K-32) |
| 6.4 | **TrendPanel** | One echarts instance per panel on `chartTheme.ts` (CD12); multiple grids on one time axis; synchronised cursor across grids (`echarts.connect`); lanes with text labels; nulls kept for gaps (never joined or zero-filled); no-sample hatch (`markArea`); plotted window label; zoom, undo, reset; value table (accessible table of the plotted points at the cursor or over the window, paged); units per axis; site zone on axis and tooltip; source and aggregation line; keyboard path (focusable lanes, arrow keys move the cursor, Enter selects a verdict band); ECharts `aria` enabled; themed tooltip | C1, C2, C3, C4, C5, C6, C7, C8, C10, C11 (K-67, K-81) |
| 6.5 | **DataTable** | Native `<table>` semantics; header 12 px uppercase `text.secondary`; rows 44 / 40 px; sortable headings with `aria-sort`; row focus and Enter to select; selection = surface.selected + 3 px start edge; tabular numerals; mono identifiers; filters with Reset; paging or virtualisation; own scroll region; empty, loading, error states | K-21, K-50, K-51, K-53, K-54, K-55, K-49, K-10 (pagination) |
| 6.6 | **Inspector** | 320–400 px; persistent at ≥ 1280 px; drawer below (edge-anchored, focus-trapped, Esc, focus returns to trigger); one primary action at its foot | K-44, K-46, K-47 |
| 6.7 | **Toggletip** + help registry | A button (ⓘ or ?) with `aria-expanded` and `aria-controls`; opens on click, Enter or Space; hover after 300 ms as an enhancement; stays while hovered or focused; Esc closes and returns focus; one open at a time (WCAG 1.4.13, 2.1.1, 4.1.2). Content from `src/frontend-ob/src/help/registry.ts`, keyed by `M-###`, seeded verbatim from `help-registry-draft.md` (RD10), template: what it measures · formula · window and eligibility · unit · source and version · "Full calculation ›" (Evidence › Calculations `?metric=`) | `title` on definitions (567 attributes in 134 files); K-76 |
| 6.8 | **StatusBadge** | Tone by field per CD8 (danger, warning, success, info, unknown, neutral); glyph + text always; 6 px radius, 12 px; NE107 variant with fixed `diag` fills, code + label | K-25…K-28, *FacetPill*, `toneFor` |
| 6.9 | **SegmentedControl** and **Tabs** | Native buttons; `aria-pressed` or `role="tablist"` with `aria-selected`; arrow keys; selected state not by colour alone | K-03, K-05 (Replace) |
| 6.10 | **Form controls** | Text input, select, checkbox, accordion (native `details`), filter chip, input chip, dropdown menu: 40 px, 6 px radius, `border.strong`, focus 2 px + 3 px gap, invalid state with message, disabled with reason | K-04, K-06, K-07, K-08, K-09, K-11 (Replace); K-17…K-23 (Extend) |
| 6.11 | **Dialog** | Focus starts inside, is trapped (including buttons in shadow roots), Esc closes, focus returns to the trigger (works with `ObcButton` triggers), named close; footer reachable by Tab | K-42, K-45, K-48, *Modal*, *useDialogA11y* (RD12) |
| 6.12 | **DataState** | Loading (skeleton matching the region), empty (reason + reset), filtered-empty, partial, stale ("No data since T" over the retained value, unknown hatch), bad quality, unavailable, error (reason + retry; never with empty text), restricted ("Not available for your role") | K-33, K-36, K-38, K-39, *EmptyState*, *QueryError* |
| 6.13 | **TechnicalDetails** | A disclosure ("Technical details") listing copyable IDs, versions and paths; keyboard reachable; collapsed by default | *CopyableId*, *CodeLabel* |
| 6.14 | **AssetPicker** | One loop picker: search by tag or description, scoped by the header plant selection, recent loops, keyboard listbox | *LoopCombobox*, *LoopTree*, K-09 |
| 6.15 | **Buttons** | `ObcButton` kept: 40 px painted via variables, 6 px radius, focus gap via `::part`; variants primary, outline, ghost, destructive, accent outline, link (M-14); one primary per region | K-01, K-02, K-17, K-40, K-41 |
| 6.16 | **Toast** | react-toastify themed through its 41 variables; 3 px start-edge status bar; accessible name | K-72 |

## 7. Visual system

- Tokens: skill R1.2 `tokens.css`, the OpenBridge bridge, Day and Night (CD2–CD5).
- Geometry and type: DEC-002 RD9. The 28 rendered font sizes reduce to the five guide sizes plus 13 px only where a guide size would truncate a data value, recorded as a deviation.
- Status: CD8, through StatusBadge only. No colour on card borders or row containers.
- Charts: CD12, CD13, through TrendPanel only.
- Icons: the existing `Obi*` icons; one icon per concept.

## 8. Function preservation matrix

Every current function has a home. PRM-004 acceptance requires every row to be verified on the new build (reachable, same data, same permission).

### 8.1 Write actions (all 23 mutations)

| Mutation | Endpoint | Today on | New home |
|---|---|---|---|
| `useActivateLoop` | `POST /cpm/loops/activate` | Registry | Setup › Loops |
| `useDeleteLoop` | `DELETE /cpm/loops/{id}` | not wired | Not exposed (unchanged) |
| `useRepublishEvidence` | `POST …/republish-evidence` | Registry | Setup › Loops |
| `useAcknowledgeEvent` | `POST /cpm/events/{id}/acknowledge` | Events, Investigation, Replay | Episodes inspector; Loop › Diagnosis; Evidence › Replay |
| `useShelveEvent`, `useUnshelveEvent` | `POST …/shelve`, `…/unshelve` | Events | Episodes inspector |
| `useRecompute` | `POST …/recompute` | Pipeline, Replay | System › Pipeline; Evidence › Replay |
| `useConfigActions` (7: draft create, patch, validate, shadow, approve, deploy, rollback) | `/cpm/configuration/*` | Config | Setup › Configuration › Editor |
| `useCreateLoopNote`, `useLinkLoopNote`, `useSetLoopNoteOutcome` | `/cpm/investigations*` | Investigation, Replay, Events | Loop › Diagnosis › Notes; Evidence › Replay; Episodes inspector (link) |
| `useReconstruct`, `EvaluateWindow` | `POST /cpm/analysis-runs` | Evidence | Evidence › Gates |
| `useReviewModel` | `POST /cpm/models/{id}/review` | Response | Loop › Model |
| `useVerifyAuditChain` | `POST /api/audit/verify` | Admin audit, Governance | System › Governance; `/admin/audit` |
| `UserManagementConfig` (create, update, delete) | `/api/auth/users*` | Admin users | `/admin/users` |

### 8.2 Read functions

| Function (analysis) | New home |
|---|---|
| Fleet KPIs and change vs 24 h (M-005…M-025) | Overview strip, filters, inspector |
| KPI drill-down rows and proof (R-14) | Overview table with `review=`; inspector |
| KPI daily trend (C9) | Overview inspector |
| Priority queue and rule (K-53) | Overview table |
| Loop focus and drawer (V-01, O-001) | Overview inspector |
| Readiness strip | Overview ledger; Setup › Loops strip |
| Event trail | Overview ledger |
| Gate roll-up, matrix, checks, guide (R-02, V-02, P-001, P-002) | Performance |
| Episode ledger, detail, history, conditions, notes (R-03) | Episodes |
| Loop summary, next check, readiness bar (R-04, P-004) | Loop status strip and inspector |
| Operating state tiles, signal quality | Loop status strip |
| Signal trend 8h/24h/7d/30d/custom, live (C1, `TimeRangeBar`) | Loop TrendPanel (header range) |
| Historical aligned chart, overlays, normalise, KPI overlay, verdict and health lanes, exports (R-05, P-014) | Loop TrendPanel |
| Selected window panel | Loop inspector |
| Loop KPI cards (M-078…M-093) | Loop › Performance |
| Gate strip and detail (*SummaryGateStrip*) | Loop › Performance; Evidence › Gates |
| Explorer Calculations tab (V-04) | Evidence › Calculations |
| Explorer Signals, loop model card (V-03) | Loop › Signals |
| Explorer Relationships (V-05) | Loop › Signals |
| Explorer History (V-06, P-011…P-013) | Loop › Diagnosis › Episodes |
| Instrument health drawer (O-002…O-006) | Loop context-header pill → inspector; Loop › Diagnosis |
| Investigation: triage, conclusion, chain, hypotheses, window browser, engine trace (R-06, P-015…P-018) | Loop › Diagnosis |
| Response: events, censored candidates, models, Bode, residual, history (R-11, P-027) | Loop › Model |
| Evidence workspace, gate bodies G1–G15, explain, artifacts, effective config (R-07, P-019, P-020) | Evidence › Gates and inspector |
| Replay stages and chart, phase plane, zoom (R-08, P-021) | Evidence › Replay |
| Window list, detail, density, compare across kinds, runtime header (R-09) | Evidence › Windows |
| Calculation catalogue, search, sorting, paging, drawer (R-10, P-022…P-026, O-013…O-015) | Evidence › Calculations |
| Registry list, profile aside, wizard, bulk import (R-12, V-07, O-018, O-019) | Setup › Loops |
| Configuration overview, effective, bundles, editor, deployments, shadow (R-13, V-08, V-09) | Setup › Configuration |
| Pipeline status, metrics, retry (R-15, P-031) | System › Pipeline |
| Governance approvals, audit lists (R-16, P-032, P-033) | System › Governance |
| Multi-tag trend (R-17, P-034…P-037) | `/trend` tool |
| Administration (R-18…R-23) | `/admin/*` in the shell |
| `/admin/system` (R-24) | Hidden (CD21) |
| Command palette | Header search |
| Session expiry, confirm and forbidden overlays (shell) | AppShell, Dialog, DataState restricted |

Overlays that the analysis could not reach (`surface-inventory.md` "Source overlays not reached", 48 items) are mapped from source in PRM-004 Phase 0 into this table. Any that has no home is a C3.

## 9. Acceptance summary

| Check | Target |
|---|---|
| G01–G12 (skill `acceptance.md`) | Pass on every destination, at 1440, 1366, 1920, 1280, 1024 and 200 % zoom, in Day and Night, on a populated lab (DEC-002 Q-A) |
| CPA01 (Overview) and CPA02 (Loop) | All written rules on pp.11–13 and the p.28 corrections pass |
| Task walks | The 24 PRM-003 tasks re-run with `task-walk.mjs`: average pages per task ≤ 1.5; multi-page tasks ≤ 11; 0 dead ends; 0 context losses |
| Keyboard | Every overlay: focus starts inside, is trapped, Esc closes, focus returns. Every table row and chart lane reachable |
| axe-core | 0 critical and 0 serious nodes on every destination and overlay, in both themes |
| Content | 0 Internal-class text on Overview, Performance, Episodes, Loop or Evidence outside Technical details; every value reaches its definition by keyboard |
| Function preservation | Every row of §8 verified |
| Redirects | Every row of §2.3 verified with its parameters |
| Meaning | No calculation, threshold or definition changed; label choices recorded (RD10); RD11 defects fixed |
