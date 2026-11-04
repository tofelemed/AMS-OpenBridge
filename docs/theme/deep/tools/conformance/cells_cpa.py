"""Part H: verdict cells for the CPA requirements (guide pp.11-13 and p.28).

Same conventions as cells_g.py. A route absent from a requirement's groups is
not addressed by that requirement and is shown as a dot, not counted.
"""
from cells_g import g

CPA_COLUMNS = "OV PF KP EV EX ES EH HI IN WB RP WI CA SR RG TR PL".split()

CPA_REQS = [
    # CPA01, p.11
    ("A1", "p.11", "Show the assessed population and a clear queue of loops to investigate"),
    ("A2", "p.11", "Filter by plant, area, time window and review condition"),
    ("A3", "p.11", "Selecting a loop updates its explanation and opens CPA02 with the same interval"),
    ("A4", "p.11", "Show population size, assessment coverage and metric definitions"),
    ("A5", "p.11", "Keep rows with unavailable metrics visible with a reason; never rank missing data as good"),
    # CPA02, p.12
    ("B1", "p.12", "Aligned PV, SP, controller output and operating-mode context"),
    ("B2", "p.12", "Synchronise cursor and selected interval across charts"),
    ("B3", "p.12", "Selecting a review period updates the detail panel and evidence links"),
    ("B4", "p.12", "Related instrument and alarm links retain loop and period"),
    ("B5", "p.12", "Use the CPA service definition for every metric and threshold"),
    ("B6", "p.12", "Label output as Controller output unless measured valve position is available"),
    # Requirements, p.13
    ("R1", "p.13", "Overview presents assessed loops, loops needing review and data coverage"),
    ("R2", "p.13", "Ranked table: tag, parent asset, metric value and unit, state, coverage, last evaluation time"),
    ("R3", "p.13", "Clicking a column heading sorts eligible rows by a documented rule"),
    ("R4", "p.13", "Explanation states which metric or rule selected the loop"),
    ("R5", "p.13", "Keep Unassessed distinct from Meets criterion"),
    ("R6", "p.13", "Do not combine different engineering units into one unexplained ranking"),
    ("R7", "p.13", "PV, SP, controller output and actual mode history on aligned time axes"),
    ("R8", "p.13", "Valve position is a separate measurement when available"),
    ("R9", "p.13", "Keep mode changes, manual periods, saturation and bad quality as context"),
    ("R10", "p.13", "Same definition, window and denominator in overview and detail; label plot zoom separately"),
    ("R11", "p.13", "Show unit, eligibility, coverage and baseline"),
    ("R12", "p.13", "Oscillation, stiction and tuning claims name their method and evidence"),
    ("R13", "p.13", "Loop identity: canonical ID, tag, controlled property, related asset"),
    ("R14", "p.13", "Time series: timestamped PV, SP, output, mode and quality for one interval"),
    ("R15", "p.13", "Metric result: name, value, unit, definition version, coverage, assessment time"),
    ("R16", "p.13", "Review rule: threshold or baseline, eligible mode, evaluation window"),
    ("R17", "p.13", "Evidence link: source record, instrument relation, alarm context or case"),
    ("R18", "p.13", "Record review captures period, metric snapshot, reviewer and note"),
    ("R19", "p.13", "Opening an RCA links evidence without promoting a suspected issue to verified cause"),
    ("R20", "p.13", "Source refreshes do not overwrite saved review evidence without versioning"),
    ("R21", "p.13", "Demonstrate overview to PV vs SP, mode history, diagnostics and alarms"),
    ("R22", "p.13", "Define the denominators behind assessed loops, coverage and time in AUTO"),
    ("R23", "p.13", "A loop labelled Stable (or equivalent) has an explicit review reason"),
    ("R24", "p.13", "Named statistic, and percentage of span needs a valid configured span"),
    # Corrections and module check, p.28
    ("C1", "p.28", "Acceptance: open a loop from the ranked overview, align signals, expose definition and coverage"),
    ("C2", "p.28", "Show the actual plotted zoom window"),
    ("C3", "p.28", "Reconcile overview mode compliance and detail time in AUTO to their defined windows"),
    ("C4", "p.28", "Legible chart tokens for essential histogram marks"),
    ("C5", "p.28", "Rebuild charts from data and preserve exact units and dates"),
]

CPA_CELLS = {
    "A1": [
        g("F", "OV", "Population heading exists, but there is no assessed or needing-review figure, and the queue slices to 6 rows (overview/PriorityQueue.tsx:25,65). Queue empty in capture.", "p.11; Baseline §9.4b", rm=True),
        g("P", "PF", "Row tabs state Needs attention 165, Evaluated 165, Not evaluated 76, All 241 (day/1366x768/performance.png).", "p.11", rm=True),
    ],
    "A2": [
        g("F", "OV", "Plant scope and 12h/24h exist, but no review-condition filter on this page.", "p.11"),
        g("P", "PF", "Plant scope, window, row filter, gate filter and health filter (CpmPerformance.tsx:71-75,208-222).", "p.11"),
        g("P", "KP", "Plant scope, window, KPI picker and reason filter (CpmKpiDrilldown.tsx:84-94,155-165).", "p.11"),
    ],
    "A3": [
        g("F", "OV", "Row selection fills LoopFocus with live values and a rolling 8 h trend under a 12h page, with no explanation (overview/LoopFocus.tsx:31,33). Open loop does carry the window kind.", "p.11; p.7 selections"),
        g("P", "PF", "Selection writes ?loop, shows the row summary and docked evidence; Open loop carries the window (CpmPerformance.tsx:108-110,319-344).", "p.11; p.7 selections"),
    ],
    "A4": [
        g("F", "OV PF", "Definitions live in title tooltips, which are mouse-only (Performance alone holds 980 tooltip words), and there is no coverage percentage.", "p.11; p.6 accessible help; WCAG 2.1 SC 1.4.13, 2.1.1; Baseline §8.1"),
        g("P", "KP", "Rule, formula, reason and denominator are visible on the page (CpmKpiDrilldown.tsx:98-119). No definition version: see R15.", "p.11", rm=True),
    ],
    "A5": [
        g("F", "OV", "Unassessed loops are excluded from the queue (cplm-api FleetPrioritySql.cs:53-54); they appear only as tile counts and drill-down rows.", "p.11"),
        g("P", "PF", "The matrix lists all 241 with Not evaluated: not enough data, and the attention list states the unrankable count.", "p.11"),
        g("P", "KP", "Not-assessable list gives its reasons, and filters by reason. 0 rows in capture.", "p.11", rm=True),
    ],
    "B1": [
        g("F", "EX", "Mode is a tile, not a lane; the trend fetches mode but does not draw it (explorer/summary/OperatingState.tsx:48,126).", "p.12; Baseline §5.3"),
        g("F", "IN RP", "Trend carries PV, SP, OP and VP with no mode (CpmInvestigation.tsx:138; CpmReplay.tsx:118).", "p.12; Baseline §9.5"),
        g("F", "WB", "Signals split across three charts in a collapsed section.", "p.12; Baseline §9.5"),
        g("P", "HI", "PV, SP, OP, overlay, mode, verdict and health share one time axis (historical/chartOption.ts:160-170). Only a sliver of data in capture.", "p.12", rm=True),
    ],
    "B2": [
        g("F", "EX", "Compare mode draws two unlinked charts; `echarts.connect` and `group` have 0 hits.", "p.12; p.5 chart behaviour; Baseline §5.4"),
        g("F", "IN WB", "Health lane or lanes are separate charts with no shared cursor.", "p.12; Baseline §5.4"),
        g("P", "HI", "Cursor links every lane within one chart and the selected window shades them (historical/chartOption.ts:186). No value table, which p.5 also asks for.", "p.12; p.5", rm=True),
    ],
    "B3": [
        g("F", "EX EH", "History rows leave for /cpm/historical; no review-period list updates a panel in place.", "p.12; p.7 selections"),
        g("P", "EV", "Selecting an episode updates the aside and its links (CpmEvents.tsx:97-99).", "p.12"),
        g("P", "HI IN RP", "Selecting a window updates the panel, verdict or replay (historical/SelectedWindowPanel.tsx, investigation/WindowBrowser.tsx). 0 windows in capture; on HI the band click is pointer only.", "p.12", rm=True),
    ],
    "B4": [
        g("F", "EX HI IN EV", "Instrument health stays on the loop, but no alarm link exists: 0 hits for /alarms in components/Cpm, and the slice redirects that route to /cpm.", "p.12; productSlice.ts; ISA-18.2 alarm context"),
    ],
    "B5": [
        g("F", "OV KP", "Rule text is served, but the formula is a client copy that misstates the engine: window time vs samples present (kpi/kpiMeta.ts:36,40; ShortFeatureCalculator.java:193).", "p.12; p.13; Baseline §9.4a"),
        g("F", "PF", "Stale limit of 3 h is local (CpmPerformance.tsx:57).", "p.12"),
        g("F", "EX", "0.95 is hardcoded while the tile limit is server-configured and G1 uses 0.90 (kpi/loopKpiView.ts:40,132).", "p.12; Baseline §9.4a"),
        g("F", "HI", "Overlay list and resolutions are client literals (CpmHistorical.tsx:49-55).", "p.12"),
        g("F", "WI", "Completeness bands are local (CpmWindows.tsx:188).", "p.12"),
        g("F", "CA", "Catalogue of 19 metrics is client-side and omits three KPIs shown on the loop page (calcCatalogue.ts:24-47).", "p.12; Baseline §9.4c"),
        g("P", "WB", "Gate name, method and capability come from the served catalogue and the immutable run.", "p.12"),
    ],
    "B6": [
        g("F", "OV EX HI IN WB RP TR", "Charts and tiles say OP or the tag name; no chart label says Controller output (Baseline §5.3).", "p.12; p.28"),
        g("F", "KP CA", "Valve wording on OP: OP fully open or closed, valve wear, actuator travel (kpi/loopKpiView.ts:147-155; calcCatalogue.ts:34).", "p.12; Baseline §9.4 row 7"),
        g("P", "ES", "Role table reads Controller output and lists VP separately (explorer/SignalsTab.tsx:24-26).", "p.12"),
    ],
    "R1": [g("F", "OV PF", "Assessed and needing-review figures are partial, and no coverage percentage exists.", "p.13; Baseline §9.4b")],
    "R2": [
        g("F", "OV", "Div rows with no headers; no coverage column; last evaluation time is not rendered though the payload holds it.", "p.13; Baseline §9.4b", rm=True),
        g("F", "PF", "Matrix columns are Loop, Checks behind the result, Result; no coverage or metric column.", "p.13"),
        g("F", "KP", "Has tag, location, measured value, verdict and window time; no coverage column. 0 rows in capture.", "p.13", rm=True),
    ],
    "R3": [
        g("F", "OV PF KP", "Headers are static or absent; sortable headings exist only on Calculations and Events.", "p.13; Baseline §9.4 row 3"),
        g("P", "EV CA", "SortHeader states the active order, and the server or catalogue sort is documented (SortHeader.tsx; calcSort.ts).", "p.13"),
    ],
    "R4": [
        g("F", "OV", "Reason line gives criticality, severity and persistence, not the selecting metric. Copy says confirmed or suspected while the queue also admits DETECTED and CLASSIFIED (cplm-api FleetPrioritySql.cs:54).", "p.13; Baseline §9.4 row 4"),
        g("P", "PF KP", "Rows name the driving gates or the deciding value (AttentionList.tsx; kpi/kpiProof.ts). Few or no findings in capture.", "p.13", rm=True),
    ],
    "R5": [
        g("P", "OV PF CA", "Not assessable, Stale, Never evaluated and Not evaluated are separate states with their own words.", "p.13; p.4"),
        g("P", "KP", "Separate verdict text per state. 0 rows in capture.", "p.13", rm=True),
    ],
    "R6": [g("P", "OV PF", "Ranks use criticality, severity, percent in band and score, with the order stated; no-span loops are excluded and counted (performanceHeadline.ts:39-43).", "p.13")],
    "R7": [
        g("F", "EX IN RP WB", "As B1: mode history is absent or split.", "p.13"),
        g("P", "HI", "As B1, with the mode lane on the shared axis.", "p.13", rm=True),
    ],
    "R8": [
        g("F", "EX", "VP is not drawn even when mapped (OperatingState fetches pv, sp, op, mode only).", "p.13"),
        g("P", "HI", "VP is its own chip and reads unmapped when absent (day/1440x1024/historical.png).", "p.13"),
        g("P", "IN RP WB", "VP has its own pen or lane when mapped (CpmInvestigation.tsx:131; evidence/SignalContextLanes.tsx).", "p.13", rm=True),
    ],
    "R9": [g("F", "EX HI IN RP WB", "No trend shows saturation or bad-quality intervals. Null modes are bridged on HI (CpmHistorical.tsx:140,146).", "p.13; NAMUR NE 107 quality separation; Baseline §5.4, §9.8")],
    "R10": [
        g("F", "OV EX KP", "Same stored field and window, but the stated denominator is wrong and one field has five names.", "p.13; Baseline §9.4a"),
        g("F", "HI", "Zoom note gives no times: Zoomed view only (CpmHistorical.tsx:346).", "p.13; Baseline §9.5"),
        g("P", "CA", "All values share the verdict's window, and a stale-version check is in the drawer (CalcDrawer.tsx).", "p.13", rm=True),
    ],
    "R11": [g("F", "OV EX KP CA", "No baseline beyond a 24 h delta, and coverage is not stated per metric. Definitions are hover-only on tiles.", "p.13; Baseline §9.4 row 1")],
    "R12": [
        g("F", "OV KP", "Tile names the evidence band only; drill-down gives period and regularity, not the method (kpi/kpiProof.ts:61-63).", "p.13; Baseline §9.4 row 9"),
        g("F", "EX", "Method is one or more clicks away.", "p.13; Baseline §9.4 row 9"),
        g("F", "IN", "Observations table names methods, but the case chip claims Controller tuning for every OSCILLATION_TUNING or _OSCILLATION row (investigation/cases.ts:13,32).", "p.13; Baseline §9.4 row 9"),
        g("P", "WB", "Each gate shows its method and the run's artifacts.", "p.13"),
    ],
    "R13": [g("F", "EX RG", "The loop id doubles as tag; `assetId` exists in the API type (api/cpmApi.ts:31) with 0 uses in components/Cpm, so no related asset is shown.", "p.13")],
    "R14": [
        g("F", "HI RP", "No quality series on the chart.", "p.13; NAMUR NE 107 quality separation"),
        g("P", "WB", "Mode and source quality exist in the lanes and short views (evidence/HistorianLanes.tsx:38; evidence/views/ShortViews.tsx:36).", "p.13", rm=True),
    ],
    "R15": [g("F", "OV KP EX CA", "Definition version is missing on tiles (`RuleVersion` exists server-side, 0 frontend hits). Calculations shows it only in the drawer, with no per-metric coverage.", "p.13; Baseline §9.4c")],
    "R16": [
        g("F", "KP", "Threshold and basis are shown; eligible mode only on some KPIs.", "p.13"),
        g("F", "EX", "Rule sits in a hover title on the card.", "p.13; p.6"),
        g("F", "CA", "The drawer's Definition tab has no threshold or eligible mode (CalcDrawer.tsx).", "p.13"),
        g("P", "WB", "Explain panel shows measured vs required (night/1440x1024/evidence.png).", "p.13", rm=True),
    ],
    "R17": [
        g("P", "EX EV", "Source run, instrument drawer or episode period are linked.", "p.13"),
        g("P", "HI KP", "Replay, window, calculation and trend links exist in source. Not walked in capture.", "p.13", rm=True),
        g("F", "IN RP", "A note's window link does not reach its pinned run (G09).", "p.13"),
    ],
    "R18": [
        g("F", "EV", "Acknowledge records reviewer, time and an optional note, but no metric snapshot.", "p.13"),
        g("P", "IN RP", "Note pins the window's run and artifacts with reviewer and outcome, when attach stays ticked (investigation/LoopNotes.tsx:51-56).", "p.13", rm=True),
    ],
    "R19": [g("N", "EX IN EV", "No RCA module or case entity in this slice; Investigation states full cases are DG-7 (CpmInvestigation.tsx:161).", "p.13; p.29 case decision")],
    "R20": [g("P", "IN WB", "Notes pin evidence against retention, and a reconstruction is stored beside the retained proof, never over it.", "p.13")],
    "R21": [g("F", "OV", "The path reaches PV, SP, mode and diagnostics, but no alarm route exists in the slice.", "p.13; productSlice.ts")],
    "R22": [g("F", "OV KP", "Tile denominators are named, but coverage has no definition and AUTO says window time while the engine uses samples present.", "p.13; Baseline §9.4a; Q7")],
    "R23": [g("P", "OV EX KP", "Performing acceptably states its rule; No problem found has a Basis disclosure. No such loop in capture.", "p.13", rm=True)],
    "R24": [
        g("P", "PF", "Median error (% of span) excludes no-span loops and counts them.", "p.13"),
        g("F", "OV", "Fallback reads MAE x with no unit (overview/GoodErrorBar.tsx:14).", "p.13; p.6 units"),
        g("F", "EX HI", "PV span is checked, but OP % is hardcoded (OperatingState.tsx:99-102; historical/chartOption.ts:246).", "p.13; Baseline §9.4 row 8"),
    ],
    "C1": [
        g("F", "OV", "Open works, but the queue was empty in capture and row definitions are hover-only.", "p.28 CPA scenario", rm=True),
        g("F", "EX", "No mode on the trend.", "p.28 CPA scenario"),
        g("F", "HI", "Signals align, but definition and coverage of each metric are not exposed on the page.", "p.28 CPA scenario", rm=True),
    ],
    "C2": [
        g("F", "EX OV IN WB RP PL", "ChartZoomBar shows buttons and no range; useBoxZoom holds percentages only (charts/boxZoom.ts:17-18).", "p.28; p.13; Baseline §9.5", rm=True),
        g("F", "HI TR", "HI says Zoomed view only with no times; TR clocks show the unzoomed window.", "p.28; Baseline §9.5"),
    ],
    "C3": [g("F", "OV EX KP WI RP", "One field has five names: In auto mode, Time in normal mode, Automatic-mode fraction, In AUTO, Service factor. Thresholds and staleness conflict.", "p.28; Baseline §9.4a")],
    "C4": [
        g("F", "OV", "No frequency histogram exists. State-bar segments read 1.03 Day and 2.05 Night, or 2.36 and 2.83, against 3:1.", "p.28; p.5; WCAG 2.1 SC 1.4.11; Baseline §5.6", rm=True),
        g("F", "PF", "Gate roll-up warn bars read 1.03:1 on the Day panel.", "p.28; WCAG 2.1 SC 1.4.11; Baseline §5.6"),
        g("F", "WI KP IN", "Sparse density and score fills read 1.03 Day; unselected KPI bars 2.36 and 2.83.", "p.28; WCAG 2.1 SC 1.4.11; Baseline §5.6", rm=True),
    ],
    "C5": [
        g("P", "OV EX IN KP", "Series come from served points, and gaps stay as nulls (trend/trendOption.ts:90,146).", "p.28; p.5", rm=True),
        g("F", "HI", "Overlay and mode bridge gaps; runtime zone differs between bar and tooltip.", "p.28; p.5"),
        g("F", "WB", "EU and pp are hardcoded.", "p.28; p.5 units"),
        g("F", "TR", "Gaps are joined, and units are guessed from the tag name.", "p.28; p.5"),
        g("F", "RP PL", "RP mixes zones on one chart; PL zero-fills.", "p.28; p.5", rm=True),
        g("N", "SR", "No populated response event in capture.", "p.28", rm=True),
    ],
}
