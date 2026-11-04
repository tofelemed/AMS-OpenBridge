#### admin-data-sources: 531 → 511 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |
| `p @284px` | Configure OT data sources — MQTT broker connections consumed by the ingestion service | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the page title s… |

#### explorer: 503 → 432 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Check a loop | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | One loop's current condition, trend and gate results. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: Explorer shows t… |
| `span.cpm-eyebrow @443px` | Loop summary · latest 12h evaluated window | Shorten | Latest 12h window | Window label stays; repeats "Loop" |
| `p.cpm-loop-summary__next-text @553px` | Check that the loop’s signals are arriving: the Window Inspector shows the samples each w… | Shorten | Check signal arrival in Window Inspector | Keep the next step |
| `p.cpm-copy @1012px` | Classification derived from the tag type; declare it in the registry to make it explicit. | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `obc-button @1220px` | Open in Historical › | Shorten | In Historical › | Link label repeats the row label |
| `span @1276px` | The shaded band is the evaluated 12h window behind the diagnosis. | Shorten | Shaded: evaluated 12h window | Reading aid for the chart stays |
| `p.cpm-copy @2393px` | Select a gate to read its verdict, window and evidence here; the Evidence Workbench holds… | Shorten | Select a gate | Prompt 6.2: "Click to view" affordance on a clickable item |

#### events: 490 → 445 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Find problems | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | Investigate diagnosis episodes with operating context and a traceable response history. O… | Move to help | Sidebar tooltip | Prompt 6.2: repeats text already on the page or in navigation |
| `p.cpm-copy @892px` | Still open: the newest window could not be judged (excluded or insufficient data), so the… | Shorten | Still open: newest window not judged | Keep state |

#### evidence: 435 → 325 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @250px` | Understand the cause · Evidence workbench | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p @1087px` | The live path keeps the arrays for windows with a finding, at most once an hour per loop … | Move to help | Info button on "Evidence not retained" | Guide p.6: metric definitions go in an accessible help or detail view |
| `p.cpm-gate-state__valid @1224px` | The verdict and every scalar of this run are valid; only the arrays were not kept. | Shorten | Verdict and scalars valid; arrays not kept | Keep state |
| `li @1284px` | The whole window: not evaluated: not enough data — no gate on it carries a verdict. | Shorten | Whole window not evaluated: not enough data | Keep state |
| `p.cpm-collapsible__summary @1312px` | PV / SP and OP / VP from the historian over this run's window — context, not the run's ow… | Shorten | Historian context, not qualification data | Source stays |
| `li @1347px` | Valve position expected but not mapped: map its tag so a valve (stiction) cause can be co… | Shorten | Valve position not mapped | Data-state label stays; the action is the link |
| `p.cpm-copy @1526px` | Reconstruct the evidence to rebuild the arrays from the run's window; they are labelled a… | Shorten | Rebuilt arrays are labelled as rebuilt | Keep the label promise |
| `p.cpm-collapsible__summary @1658px` | Observations, hypotheses and the leading hypothesis by ranked selection (argmax, not an a… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |

#### performance: 431 → 386 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Find problems | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | Compare every loop gate by gate and see where the plant is failing. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `p.cpm-copy @188px` | Verdicts fuse on 12h / 24h rolling windows (recomputed every 15 min) · per-window 1m–60m … | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `span.cpm-kpi__sub @524px` | 236 valve loop(s) with VP expected but not mapped — valve faults there need an approved t… | Shorten | 236 loops need a test record to confirm a valve fault | Coverage stays |

#### investigation: 410 → 353 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Understand the cause | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | Start here: the conclusion, the evidence behind it and what to check next. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `li @413px` | Valve position expected but not mapped: map its tag so a valve (stiction) cause can be co… | Shorten | Valve position not mapped | Data-state label stays; the action is the link |
| `span.cpm-copy @1552px` | newest first · pick one to make it CURRENT | Shorten | Newest first | Prompt 6.2: "Click to view" affordance on a clickable item |
| `p.cpm-copy @1783px` | Only one evaluated window stored — no PREVIOUS to compare against yet. | Shorten | No previous window to compare | Keep state |
| `p.cpm-copy @2114px` | A note stays on the loop. Saving it never acknowledges an episode unless you tick that bo… | Shorten | Saving does not acknowledge an episode. | Keep the consequence, drop the explanation |

#### governance: 406 → 381 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p @2439px` | Validated drafts appear here for an independent approver; approved bundles until they are… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `p.cpm-copy @2453px` | Permission changes take effect when the session's token is next issued (re-login, or the … | Shorten | Applies at next sign-in or token refresh | Keep the consequence |

#### registry: 397 → 316 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Set up | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | Add individual loops or validate a bulk registry import. Onboarded loops are evaluated im… | Move to help | Sidebar tooltip | Prompt 6.2: repeats text already on the page or in navigation |
| `div.cpm-banner @221px` | A loop is only as good as its signal mappings: on a loop that has a valve position but no… | Move to help | Info button beside the value | Prompt 6.2: slogan plus threshold note |
| `p.cpm-copy @1252px` | G9 geometry is supporting-only. It cannot create a stiction suspect without qualified ind… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |

#### calculations: 378 → 239 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Understand the cause | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | Every calculated metric for a loop, with its latest value and method. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `div.cpm-event-row__sub @689px` | Fraction of expected samples present in the window. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `span @798px` | Not measured — not in this window's result (written by an engine version without this met… (×7) | Shorten | Not measured: older engine | Data-state label stays; the reason moves to help |
| `div.cpm-event-row__sub @850px` | Time fraction the controller spent in AUTO. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `div.cpm-event-row__sub @968px` | Mean /PV − SP/ over the window. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `div.cpm-event-row__sub @1440px` | Time fraction (0-1) the error stayed inside the good band. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `div.cpm-event-row__sub @1558px` | OP travel relative to the error it corrects. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `div.cpm-event-row__sub @1651px` | Total actuator travel extrapolated to a day. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `div.cpm-event-row__sub @1788px` | Dominant period from the autocorrelation. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |

#### overview: 308 → 192 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Find problems | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | Which loops need attention first, and why. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `p.cpm-op__basis @673px` | Each monitored loop counted once from its newest 12h result, at most 60 min old · normal … | Shorten | Keep the counting rule in help; drop this sentence | Prompt 6.2: "Click to view" affordance on a clickable item |
| `p.cpm-queue-rule @822px` | Ordered by priority (loop criticality × finding severity), then time outside the good-err… | Shorten | Ranked by priority | Guide p.13 needs a stated ranking basis; full rule in the info button |
| `p @825px` | Pick a loop in the priority queue to see its live signals and trend here. | Shorten | Select a loop | Prompt 6.2: "Click to view" affordance on a clickable item |
| `p @932px` | No loop has a current confirmed or suspected finding. The operating picture above shows t… | Shorten | No current findings | Heading above says this; empty state stays short |
| `p.cpm-copy @1167px` | No loop has a current finding. Verdicts appear once a loop completes an evaluation window. | Shorten | No current findings | Heading above says this; empty state stays short |
| `li @1602px` | 236 valve position expected but not mapped · map the VP tag so non-following evidence can… | Shorten | 236 loops: VP not mapped (G14) | Coverage stays; repeats the sibling line |
| `li @1628px` | 241 peer links expected but missing · interaction analysis unavailable (G13) until peers … | Shorten | 241 peer links missing (G13) | Coverage stays |

#### replay: 270 → 192 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Understand the cause | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | Replay the raw samples behind a verdict and re-run the calculation. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `p.cpm-copy @514px` | Stages are the pipeline's fixed shape; the chart below shows the raw historian slice this… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `p.cpm-copy @826px` | Submits the A8 historical replay job with this loop's current evidence flags and window a… | Move to help | Button tooltip with accessible description | Guide p.7: a disabled or heavy action explains itself accessibly; not on every … |
| `span.cpm-kv__value @831px` | How confident is the final verdict? | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `p.cpm-copy @1511px` | A note stays on the loop. Saving it never acknowledges an episode unless you tick that bo… | Shorten | Saving does not acknowledge an episode. | Keep the consequence, drop the explanation |

#### kpi: 263 → 96 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @136px` | Find problems | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @190px` | The loops behind one Overview number, and the value that put each one there. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span.cpm-kpicard__text @375px` | No fault · AUTO ≥ 95 % · at limit ≤ 10 % · good-error share ≥ floor (G3) · effort not str… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `dd @550px` | No fault identified (NO_CALL / INSUFFICIENT_EVIDENCE), in normal mode ≥ 95 %, not at an O… | Move to help | Collapsed "How this is counted" on /cpm/kpi | Guide p.6: metric definitions go in an accessible help or detail view |
| `dd @605px` | count(no fault identified ∧ AUTO ≥ normal-mode limit ∧ time at OP limit ≤ saturation limi… | Move to help | Collapsed "How this is counted" on /cpm/kpi | Guide p.6: metric definitions go in an accessible help or detail view |
| `dd @636px` | The headline of control-loop monitoring: loops judged with no fault, on qualified data, i… | Move to help | Collapsed "How this is counted" on /cpm/kpi | Guide p.6: metric definitions go in an accessible help or detail view |
| `p.cpm-op__basis @988px` | Between 0 % and 0 % over the days with data. Click a day to list the loops it counted. Da… | Shorten | Days with nothing kept read "no data", not 0 %. | Prompt 6.2: "Click to view" affordance on a clickable item |
| `p @1253px` | The count for this KPI is 0 in this scope — nothing to verify here. Back on the Overview,… | Shorten | No loops in this scope | Keep state |

#### windows: 257 → 226 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Understand the cause | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | Which windows were evaluated and whether they had enough data. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `p.cpm-hist-note @408px` | Watermark lag: — (not exposed by the metrics proxy; job state and checkpoint age in the h… | Shorten | Watermark lag: unavailable | Data-state label stays |
| `span.cpm-copy @449px` | 24 loaded · newest first · select a window to open it | Shorten | 24 loaded · newest first | Prompt 6.2: "Click to view" affordance on a clickable item |

#### pipeline: 248 → 189 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p.cpm-copy @151px` | The Flink/Kafka runtime that produces every verdict. This view is read-only; job lifecycl… | Move to help | Sidebar tooltip | Prompt 6.2: repeats text already on the page or in navigation |
| `span.cpm-copy @365px` | Latency / backpressure / parallelism are not exposed by the proxy — shown as “—”, not est… | Shorten | Not exposed: latency, backpressure, parallelism | Data-state label stays |
| `p.cpm-copy @716px` | There is no server-side history for these metrics; the chart accumulates live snapshots f… | Shorten | Live snapshots since this page opened | Source stays |
| `p @842px` | The chart needs at least two readings; it draws on its own as they arrive — keep this pag… | Shorten | Needs two readings; keep this page open | Keep state |

#### explorer-calculations: 201 → 174 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Check a loop | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | One loop's current condition, trend and gate results. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: Explorer shows t… |
| `span.cpm-eyebrow @443px` | Loop summary · latest 12h evaluated window | Shorten | Latest 12h window | Window label stays; repeats "Loop" |
| `p.cpm-loop-summary__next-text @553px` | Check that the loop’s signals are arriving: the Window Inspector shows the samples each w… | Shorten | Check signal arrival in Window Inspector | Keep the next step |

#### response: 187 → 99 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Understand the cause | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | Site zone UTC. Every event is listed with its state and reason; the selection is explicit… | Shorten | Site zone UTC | Time zone stays; the rest is method |
| `p @555px` | Events are captured from qualifying setpoint or output changes; none qualified in the ret… | Shorten | No qualifying event in the retained period. 294 candidates censored. | Guide p.7: empty state explains and offers a reset; the method moves to help |
| `p.cpm-copy @612px` | No complete response event yet - the 294 captured candidates were censored (superseded by… | Shorten | No complete response event: 294 candidates censored. | Guide p.7: keep the state, drop the method |
| `a.cpm-link @676px` | Setpoint changes in Historical › | Shorten | In Historical › | Link label repeats the row label |
| `p @808px` | A model is estimated from an accepted response event (a qualifying setpoint or output ste… | Shorten | No model yet: needs an accepted response event. | Guide p.7: empty state explains; the method moves to help |

#### explorer-relationships: 178 → 145 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Check a loop | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | One loop's current condition, trend and gate results. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: Explorer shows t… |
| `span.cpm-eyebrow @443px` | Loop summary · latest 12h evaluated window | Shorten | Latest 12h window | Window label stays; repeats "Loop" |
| `p.cpm-loop-summary__next-text @553px` | Check that the loop’s signals are arriving: the Window Inspector shows the samples each w… | Shorten | Check signal arrival in Window Inspector | Keep the next step |
| `p @1066px` | Create asset relationships, then republish evidence — G13 cannot evaluate without them. | Shorten | Needs asset relationships (G13). | Keep the action, drop the sequence |

#### historical: 172 → 145 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Check a loop | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | A loop's signals, KPIs, mode and verdicts over a past period. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span.cpm-hist-note @861px` | 0 evaluated window(s) · click a verdict band to inspect | Shorten | 0 evaluated windows | Prompt 6.2: "Click to view" affordance on a clickable item |
| `p @1607px` | Fused verdicts exist only where a full evaluation window closed. | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |

#### explorer-history: 155 → 128 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Check a loop | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | One loop's current condition, trend and gate results. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: Explorer shows t… |
| `span.cpm-eyebrow @443px` | Loop summary · latest 12h evaluated window | Shorten | Latest 12h window | Window label stays; repeats "Loop" |
| `p.cpm-loop-summary__next-text @553px` | Check that the loop’s signals are arriving: the Window Inspector shows the samples each w… | Shorten | Check signal arrival in Window Inspector | Keep the next step |

#### config-bundles: 144 → 124 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Set up · Gate configuration | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | What this loop runs under today, the bundles at its three levels, and the editor for one … | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the view tabs na… |

#### explorer-signals: 142 → 115 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Check a loop | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | One loop's current condition, trend and gate results. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: Explorer shows t… |
| `span.cpm-eyebrow @443px` | Loop summary · latest 12h evaluated window | Shorten | Latest 12h window | Window label stays; repeats "Loop" |
| `p.cpm-loop-summary__next-text @553px` | Check that the loop’s signals are arriving: the Window Inspector shows the samples each w… | Shorten | Check signal arrival in Window Inspector | Keep the next step |

#### config-effective: 142 → 111 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Set up · Gate configuration | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | What this loop runs under today, the bundles at its three levels, and the editor for one … | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the view tabs na… |
| `span.cpm-copy @678px` | a layer above sets a property, or leaves the one below | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |

#### admin-roles: 131 → 107 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |
| `p @287px` | Assign permissions to roles. Editing a role takes effect for its users on their next requ… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |

#### admin-system: 114 → 87 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |
| `p @349px` | Configure infrastructure retention, UI defaults, and backend logging. | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the page title s… |
| `div @433px` | Configure how long alarms and audit records are kept before archiving. | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |

#### admin-plant-model: 110 → 68 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |
| `p @284px` | The UNS asset tree — the source of truth every binding, trend, filter and loop location r… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `span @394px` | The onboarding order — each stage feeds the next (docs/plant-model/production-onboarding-… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |

#### config: 88 → 72 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Set up | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | What each loop runs under, the bundles in progress, and the editor for one of them. 165 p… | Shorten | 165 properties · 6 workers announced | Prompt 6.2: repeats text already on the page or in navigation |

#### admin-audit: 79 → 54 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |
| `p @284px` | Immutable cryptographically-chained record of all operator and system actions. | Shorten | Chained audit record | Prompt 6.2: claim without a documented basis: "all actions" not established; fa… |
| `span @439px` | Entries are hash-chained by audit-service. Run a verification to confirm integrity now — … | Shorten | Hash-chained. Run a verification to confirm integrity. | Keep the honest qualifier; it contradicts the "Immutable" line above it |

#### admin-aliases: 67 → 35 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |
| `p @284px` | OT/legacy tag → canonical UNS path. Ingestion resolves incoming tag names through this ta… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |

#### login: 47 → 28 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p.login__subtitle @321px` | Control Loop Performance Management | Shorten | Traverse CPA | Guide p.28: one product identity across the shell |
| `p.login__notice @382px` | Authorized use notice: Access is restricted to authorized operators. All sessions, includ… | Shorten | Authorized use only. Access is restricted to authorized operators. | Prompt 6.2: claim without a documented basis: no IEC 62443 assessment found. Th… |
| `obc-button.login__submit @670px` | Secure sign in | Shorten | Sign in | Prompt 6.2: claim without a documented basis: TLS depends on deployment |
| `span.login__visual-system @957px` | Traverse control-loop performance | Shorten | Traverse CPA | Guide p.28: one product identity across the shell |

#### admin-users: 40 → 32 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |

