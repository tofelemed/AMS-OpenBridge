## admin-data-sources (Admin: Data Sources)

531 visible words, projected 511.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `h1 @81px` | System Administration | Keep | - | Section or page title |
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |
| `a @177px` | User Management | Keep | - | Control label |
| `a @177px` | Roles & Permissions | Keep | - | Control label |
| `a @177px` | Data Sources | Keep | - | Source or version (constraint) |
| `a @177px` | Plant Model | Keep | - | Control label |
| `a @177px` | Tag Aliases | Keep | - | Control label |
| `a @177px` | Audit Log | Keep | - | Control label |
| `a @177px` | System Settings | Keep | - | Control label |
| `h3 @257px` | Source Configuration | Keep | - | Source or version (constraint) |
| `obc-button @269px` | + New Configuration | Keep | - | Control label |
| `p @284px` | Configure OT data sources — MQTT broker connections consumed by the ingestion service | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the page title s… |
| `obc-button @354px` | Test (×8) | Keep | - | Control label |
| `obc-button @354px` | Edit (×8) | Keep | - | Control label |
| `obc-button @354px` | On (×6) | Keep | - | Control label |
| `obc-button @354px` | Delete (×8) | Keep | - | Control label |
| `span @355px` | E2E OT Gateway (mosquitto-test) (×6) | Keep | - | Short label or value |
| `span @357px` | Off (×6) | Keep | - | Short label or value |
| `span @357px` | MQTT (×8) | Keep | - | Short label or value |
| `span @357px` | Control-Loop Signals (CPA) (×7) | Keep | - | Short label or value |
| `span @357px` | OT/+/+/+/+/PIDParams/+ (×7) | Keep | - | Short label or value |
| `div @403px` | Connection URL (×8) | Keep | - | Short label or value |
| `div @403px` | Username (×8) | Keep | - | Short label or value |
| `div @403px` | Feeds (×8) | Keep | - | Short label or value |
| `div @403px` | QoS / Keepalive (×8) | Keep | - | Short label or value |
| `div @422px` | mqtt://mosquitto-test:1883 (×8) | Keep | - | Short label or value |
| `div @422px` | ams_ingest (×8) | Keep | - | Short label or value |
| `div @422px` | Loop Performance (CPM) · traverse.cpa.loop.samples.v1 (×7) | Keep | - | Source or version (constraint) |
| `div @422px` | QoS 1 · 60s (×8) | Keep | - | Short label or value |
| `div @471px` | Timeout (×8) | Keep | - | Short label or value |
| `div @471px` | Last Connection Test (×8) | Keep | - | Short label or value |
| `div @471px` | Last Data Received (×8) | Keep | - | Short label or value |
| `obc-button @549px` | Edit MODE map (×7) | Keep | - | Control label |
| `span @550px` | Loop ingest (×7) | Keep | - | Short label or value |
| `span @552px` | MODE map · 4 values (×7) | Keep | - | Short label or value |
| `div @594px` | MODE value map (×7) | Keep | - | Short label or value |
| `div @594px` | Grid (×7) | Keep | - | Short label or value |
| `div @594px` | Registry refresh (×7) | Keep | - | Short label or value |
| `div @594px` | Quality protocol (×7) | Keep | - | Short label or value |
| `div @613px` | 1→AUT 2→MAN 3→CAS 4→IMAN (×7) | Keep | - | State or row content |
| `div @613px` | 5 s (×14) | Keep | - | Short label or value |
| `div @613px` | STRING_ENUM (default) (×7) | Keep | - | Short label or value |
| `div @642px` | Topic template (×7) | Keep | - | Short label or value |
| `div @642px` | Param roles overlay (×7) | Keep | - | Short label or value |
| `div @661px` | {ns}/{site}/{fcs}/{class}/{loop}/{group}/{param} (×7) | Keep | - | Short label or value |
| `div @661px` | POS→vp (×6) | Keep | - | Short label or value |
| `obc-button @1180px` | Off (×2) | Keep | - | Control label |
| `span @1183px` | Active (×2) | Keep | - | Short label or value |
| `span @2820px` | Lab Instrumental NE107 (mosquitto-test) | Keep | - | Short label or value |
| `span @2822px` | Transmitter Health (Instrumental NE107) | Keep | - | State or row content |
| `span @2822px` | traverse/instrumental/v1/default/hdpe/devices/+/state | Keep | - | Source or version (constraint) |
| `div @2932px` | Loop Performance (CPM) · traverse.cpa.instrument.health.v1 | Keep | - | Source or version (constraint) |
| `span @3087px` | OT Gateway (lab soak) | Keep | - | State or row content |
| `div @3393px` | none — built-in roles apply (PV, SP, OP, MODE, VP, …) | Keep | - | State or row content |

## explorer (Loop Explorer: Summary)

503 visible words, projected 432.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Check a loop | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `h1.cpm-title @117px` | Loop explorer | Keep | - | Section or page title |
| `p.cpm-copy @151px` | One loop's current condition, trend and gate results. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | Flow controller FIC10401 (FCS0101) (×2) | Keep | - | Short label or value |
| `span.cpm-loop-context__muted @187px` | FIC · criticality medium | Keep | - | Short label or value |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: Explorer shows t… |
| `span.cpm-loop-context__label @188px` | Loop | Keep | - | Control label |
| `span.cpm-loop-context__label @188px` | Location | Keep | - | Control label |
| `span @210px` | Gates: latest 12h fused window · trend: last 8 h | Keep | - | State or row content |
| `span.cpm-loop-context__label @211px` | Period | Keep | - | Control label |
| `span.cpm-field__label @255px` | Site | Keep | - | Control label |
| `span.cpm-field__label @255px` | Area | Keep | - | Control label |
| `span.cpm-field__label @255px` | Unit | Keep | - | Control label |
| `span.cpm-copy @292px` | 243 of 243 loop(s) in scope | Keep | - | Population or coverage (constraint) |
| `span @349px` | HDPE | Keep | - | Short label or value |
| `span @349px` | Section 600 | Keep | - | Short label or value |
| `span @349px` | U6002 pellet homogenization II silo 4/5 | Keep | - | State or row content |
| `span.cpm-sr-only @376px` | Expand loop list | Keep | - | Control label |
| `span.cpm-head-pills @393px` | Not configured · not checked | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-facet__caption @394px` | Instrument health | Keep | - | Control label |
| `span.cpm-eyebrow @443px` | Loop summary · latest 12h evaluated window | Shorten | Latest 12h window | Window label stays; repeats "Loop" |
| `h2.cpm-loop-summary__condition @464px` | Not evaluated: not enough data | Keep | - | Data-state label or error text (constraint) |
| `p.cpm-loop-summary__note @504px` | The newest window has no verdict. Last verdict: Oscillation confirmed , window ending 6 O… | Keep | - | Timestamp, time zone or age (constraint) |
| `p.cpm-loop-summary__next-text @553px` | Check that the loop’s signals are arriving: the Window Inspector shows the samples each w… | Shorten | Check signal arrival in Window Inspector | Keep the next step |
| `obc-button @562px` | Open Window Inspector › | Keep | - | Control label |
| `obc-button @562px` | Show on trend › | Keep | - | Control label |
| `obc-button @562px` | Calculation proof › Workbench | Keep | - | Control label |
| `span.cpm-loop-summary__label @564px` | Next check | Keep | - | Control label |
| `div.title @618px` | Basis and limitations | Keep | - | Section or page title |
| `p.cpm-collapsible__summary @653px` | 3 limitation(s) · 1,574 samples | Keep | - | Short label or value |
| `div.title @710px` | Summary | Keep | - | Section or page title |
| `div.title @710px` | Signals | Keep | - | Section or page title |
| `div.title @710px` | Calculations (×2) | Keep | - | Section or page title |
| `div.title @710px` | Relationships | Keep | - | Section or page title |
| `div.title @710px` | History | Keep | - | Section or page title |
| `span.cpm-eyebrow @761px` | Last stored samples | Keep | - | Short label or value |
| `span.cpm-eyebrow @761px` | Context | Keep | - | Short label or value |
| `span.cpm-pill @781px` | PRESET | Keep | - | Short label or value |
| `h2.cpm-panel-title @783px` | Operating state | Keep | - | Section or page title |
| `h2.cpm-panel-title @783px` | Loop model | Keep | - | Section or page title |
| `span.cpm-kv__label @822px` | Service family | Keep | - | Control label |
| `span.cpm-kv__value @822px` | FLOW | Keep | - | Short label or value |
| `span.cpm-kpi__caption @831px` | PV | Keep | - | Short label or value |
| `span.cpm-kpi__caption @831px` | SP | Keep | - | Short label or value |
| `span.cpm-kpi__caption @831px` | OP | Keep | - | Short label or value |
| `span.cpm-kv__label @854px` | Dynamic class | Keep | - | Control label |
| `span.cpm-kv__value @854px` | Fast self-regulating | Keep | - | Short label or value |
| `span.cpm-kpi__sub @884px` | last stored 23 h ago (×2) | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-kpi__sub @884px` | % · last stored 23 h ago | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-kv__label @887px` | Objective | Keep | - | Control label |
| `span.cpm-kv__value @887px` | TIGHT | Keep | - | Short label or value |
| `span.cpm-kv__label @919px` | Topology | Keep | - | Control label |
| `span.cpm-kv__value @919px` | SINGLE | Keep | - | Short label or value |
| `span.cpm-kpi__caption @946px` | MODE | Keep | - | Short label or value |
| `span.cpm-kv__label @952px` | Command path | Keep | - | Control label |
| `span.cpm-kv__value @952px` | Output drives a valve | Keep | - | State or row content |
| `span.cpm-kpi__value @967px` | AUT | Keep | - | Short label or value |
| `span.cpm-kv__label @984px` | Acquisition | Keep | - | Control label |
| `span.cpm-kv__value @984px` | PERIODIC | Keep | - | Short label or value |
| `span.cpm-kpi__sub @1000px` | closed loop · analysed · last stored 23 h ago | Keep | - | Timestamp, time zone or age (constraint) |
| `p.cpm-copy @1012px` | Classification derived from the tag type; declare it in the registry to make it explicit. | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `span.cpm-kv__label @1059px` | Loop type | Keep | - | Control label |
| `span.cpm-kv__value @1059px` | FIC | Keep | - | Short label or value |
| `span.cpm-facet__caption @1069px` | Signal quality | Keep | - | Short label or value |
| `span.cpm-pill @1069px` | No live publisher | Keep | - | Short label or value |
| `span.cpm-kv__label @1091px` | Criticality | Keep | - | Control label |
| `span.cpm-kv__value @1091px` | medium | Keep | - | Short label or value |
| `p.cpm-copy @1100px` | Trend range 04/11/2026, 6:32:00 GST → 04/11/2026, 14:32:00 GST · rolling 8 h , not an eva… | Keep | - | Timestamp, time zone or age (constraint) |
| `obc-button @1139px` | Evidence workbench › | Keep | - | Control label |
| `obc-toggle-button-option @1163px` | Custom | Keep | - | Short label or value |
| `span.cpm-hist-stepper__text @1165px` | 04 Nov, 06:32 → 04 Nov, 14:32 · live | Keep | - | Short label or value |
| `obc-button @1199px` | System response › | Keep | - | Control label |
| `obc-button @1220px` | Live | Keep | - | Control label |
| `obc-button @1220px` | Open in Historical › | Shorten | In Historical › | Link label repeats the row label |
| `span.cpm-kv__label @1240px` | Gate profile | Keep | - | Control label |
| `span.cpm-kv__value @1240px` | default | Keep | - | Short label or value |
| `span.cpm-kv__label @1272px` | Historian device | Keep | - | Source or version (constraint) |
| `span.cpm-kv__value @1272px` | root.site1.cpm.FIC10401 | Keep | - | Source or version (constraint) |
| `obc-button @1274px` | Show only that window › | Keep | - | Control label |
| `span @1276px` | The shaded band is the evaluated 12h window behind the diagnosis. | Shorten | Shaded: evaluated 12h window | Reading aid for the chart stays |
| `h3 @1348px` | Trend · live 8 h: no signal values in this trend range | Keep | - | Section or page title |
| `p @1379px` | The historian returned the time range but no PV, SP or OP samples in it — the feed may ha… | Keep | - | Source or version (constraint) |
| `span.cpm-eyebrow @1481px` | Loop KPIs · 12h window ending 04/11/2026, 13:15:00 GST | Keep | - | Timestamp, time zone or age (constraint) |
| `h2.cpm-panel-title @1502px` | How this loop performs | Keep | - | Section or page title |
| `span.cpm-op__muted @1504px` | change vs the window 24 h earlier | Keep | - | State or row content |
| `h4.cpm-kpigroup__title @1535px` | Control performance | Keep | - | Section or page title |
| `span.cpm-kpicard__label @1641px` | Time in normal mode | Keep | - | Control label |
| `span.cpm-kpicard__label @1641px` | Good-error time | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-kpicard__label @1641px` | Control error (MAE) | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-kpicard__label @1641px` | PV variability (2σ) | Keep | - | Control label |
| `span.cpm-kpicard__label @1641px` | Setpoint changes | Keep | - | Control label |
| `span.cpm-kpicard__sub @1662px` | not measured in this window (×8) | Keep | - | Data-state label or error text (constraint) |
| `h4.cpm-kpigroup__title @1705px` | Actuator activity | Keep | - | Section or page title |
| `span.cpm-kpicard__label @1811px` | Time at an OP limit | Keep | - | Control label |
| `span.cpm-kpicard__label @1811px` | OP travel | Keep | - | Control label |
| `span.cpm-kpicard__label @1811px` | OP reversals | Keep | - | Control label |
| `h4.cpm-kpigroup__title @1875px` | Evidence quality | Keep | - | Section or page title |
| `span.cpm-kpicard__delta @1919px` | +16 pp | Keep | - | Control label |
| `span.cpm-visually-hidden @1928px` | up | Keep | - | Control label |
| `span.cpm-kpicard__label @1981px` | Data coverage | Keep | - | Population or coverage (constraint) |
| `span.cpm-kpicard__sub @2002px` | 1574 of 8640 samples · G0 fail | Keep | - | Population or coverage (constraint) |
| `span.cpm-eyebrow @2081px` | Evaluated 12h window · ending 04/11/2026, 13:15:00 GST | Keep | - | Timestamp, time zone or age (constraint) |
| `h2.cpm-panel-title @2102px` | Gates on the latest fused result | Keep | - | Section or page title |
| `span.cpm-gate-strip__tier-label @2139px` | Eligibility | Keep | - | Short label or value |
| `span.cpm-gate-strip__tier-label @2139px` | Performance | Keep | - | Short label or value |
| `span.cpm-gate-chip__word @2168px` | Not usable | Keep | - | Control label |
| `span.cpm-gate-chip__word @2168px` | Not evaluated (×6) | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-mono @2168px` | G2r | Keep | - | Control label |
| `span.cpm-gate-chip__word @2168px` | OK | Keep | - | Control label |
| `span.cpm-gate-strip__tier-label @2202px` | Diagnostic evidence | Keep | - | Short label or value |
| `span.cpm-gate-chip__word @2230px` | Seen (×2) | Keep | - | Control label |
| `span.cpm-gate-chip__word @2230px` | Not seen (×3) | Keep | - | Control label |
| `span.cpm-gate-chip__word @2230px` | Not seen on available data (×2) | Keep | - | Control label |
| `span.cpm-gate-strip__tier-label @2264px` | Confirmation | Keep | - | Short label or value |
| `span.cpm-gate-strip__tier-label @2264px` | Fusion | Keep | - | Short label or value |
| `span.cpm-gate-chip__word @2293px` | Insufficient (×2) | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-gate-legend__group-label @2328px` | Checks | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @2328px` | check OK | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @2328px` | OK on available data (an input missing) | Keep | - | State or row content |
| `span.cpm-gate-legend__item @2328px` | check needs attention | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @2328px` | check failed | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-gate-legend__group-label @2351px` | Window | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @2351px` | window not usable | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @2351px` | excluded on purpose (mode / region) | Keep | - | Population or coverage (constraint) |
| `span.cpm-gate-legend__group-label @2351px` | Symptoms | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @2351px` | symptom not seen | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @2351px` | symptom seen | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @2351px` | strong symptom | Keep | - | Short label or value |
| `span.cpm-gate-legend__group-label @2373px` | Result | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @2373px` | detected / classified / suspected | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @2373px` | confirmed | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @2373px` | ruled out | Keep | - | Short label or value |
| `span.cpm-gate-legend__group-label @2373px` | No result | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @2373px` | not evaluated | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-gate-legend__glyph @2373px` | n/a | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @2373px` | not applicable | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @2373px` | pending | Keep | - | Short label or value |
| `p.cpm-copy @2393px` | Select a gate to read its verdict, window and evidence here; the Evidence Workbench holds… | Shorten | Select a gate | Prompt 6.2: "Click to view" affordance on a clickable item |
| `span.cpm-eyebrow @2516px` | Long and short windows | Keep | - | State or row content |
| `obc-button @2524px` | Show calculations › | Keep | - | Control label |

## events (Loop Events)

490 visible words, projected 445.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Find problems | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `h1.cpm-title @117px` | Loop events | Keep | - | Section or page title |
| `p.cpm-copy @151px` | Investigate diagnosis episodes with operating context and a traceable response history. O… | Move to help | Sidebar tooltip | Prompt 6.2: repeats text already on the page or in navigation |
| `span.cpm-field__label @229px` | Site | Keep | - | Control label |
| `span.cpm-field__label @229px` | Area | Keep | - | Control label |
| `span.cpm-field__label @229px` | Unit | Keep | - | Control label |
| `obc-toggle-button-option @319px` | All | Keep | - | Short label or value |
| `obc-toggle-button-option @319px` | Open (×2) | Keep | - | Short label or value |
| `obc-toggle-button-option @319px` | Unobservable (×22) | Keep | - | Short label or value |
| `obc-toggle-button-option @319px` | Unacknowledged (×21) | Keep | - | Short label or value |
| `obc-toggle-button-option @319px` | Acknowledged (×2) | Keep | - | Short label or value |
| `obc-toggle-button-option @319px` | Shelved | Keep | - | Short label or value |
| `obc-toggle-button-option @319px` | Shelf expired | Keep | - | Short label or value |
| `obc-toggle-button-option @319px` | Closed | Keep | - | Short label or value |
| `span.cpm-field__label @362px` | Order | Keep | - | Control label |
| `span.cpm-field__label @367px` | Find | Keep | - | Control label |
| `span.cpm-filter-count @388px` | 500 event(s) · open first, highest evidence score first | Keep | - | State or row content |
| `obc-toggle-button-option @398px` | Triage | Keep | - | Control label |
| `obc-toggle-button-option @398px` | Newest | Keep | - | Control label |
| `span @456px` | Event | Keep | - | Short label or value |
| `span @456px` | Severity | Keep | - | Control label |
| `span @456px` | State | Keep | - | Short label or value |
| `span @456px` | Opened | Keep | - | Control label |
| `span.cpm-event-row__title @488px` | Peak: Oscillation confirmed (×21) | Keep | - | Section or page title |
| `span.cpm-pill @493px` | Now: Not evaluated: not enough data (×21) | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-event-row__sub @510px` | EVT- 2231 · 24h (×20) | Keep | - | Control label |
| `span.cpm-event-row__sub @514px` | 05/10/2026, 11:45:00 GST (×20) | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-pill @523px` | HIGH (×21) | Keep | - | Short label or value |
| `obc-button @604px` | Episode period › | Keep | - | Control label |
| `p.cpm-copy @648px` | opened 05/10/2026, 11:45:00 GST · still open | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-eyebrow @676px` | What happened | Keep | - | Short label or value |
| `h2.cpm-panel-title @697px` | Episode | Keep | - | Section or page title |
| `p.cpm-copy @731px` | The sustained oscillation family was reported across 1 non-overlapping window(s) · 2.1 d … | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-kv__label @820px` | Condition | Keep | - | Control label |
| `span.cpm-kv__label @859px` | Availability | Keep | - | Control label |
| `p.cpm-copy @892px` | Still open: the newest window could not be judged (excluded or insufficient data), so the… | Shorten | Still open: newest window not judged | Keep state |
| `span.cpm-eyebrow @954px` | Evidence | Keep | - | Short label or value |
| `h2.cpm-panel-title @976px` | Provenance | Keep | - | Section or page title |
| `span.cpm-kv__label @1015px` | Fault family | Keep | - | Control label |
| `span.cpm-kv__value @1015px` | Sustained oscillation | Keep | - | Short label or value |
| `span.cpm-kv__label @1047px` | Peak evidence score | Keep | - | Control label |
| `span.cpm-kv__label @1080px` | Resolution | Keep | - | Control label |
| `span.cpm-kv__label @1112px` | Calculation version | Keep | - | Source or version (constraint) |
| `span.cpm-kv__label @1145px` | Dynamics profile | Keep | - | Control label |
| `span.cpm-eyebrow @1171px` | Operator state | Keep | - | Short label or value |
| `h2.cpm-panel-title @1193px` | Review and shelf | Keep | - | Section or page title |
| `span.cpm-kv__label @1232px` | Acknowledgement | Keep | - | Control label |
| `span.cpm-kv__value @1235px` | Not yet reviewed | Keep | - | Short label or value |
| `span.cpm-kv__label @1270px` | Shelf | Keep | - | Control label |
| `span.cpm-kv__value @1271px` | Not shelved | Keep | - | Short label or value |
| `span.cpm-field__label @1309px` | Review note (optional) | Keep | - | Control label |
| `obc-button @1399px` | Acknowledge | Keep | - | Control label |
| `obc-button @1399px` | Shelve… | Keep | - | Control label |
| `obc-button @1455px` | Unshelve… | Keep | - | Control label |
| `obc-button @1455px` | History › | Keep | - | Control label |
| `span.cpm-reasoned__why @1492px` | The episode is not shelved | Keep | - | State or row content |
| `span.cpm-eyebrow @1523px` | Loop notes | Keep | - | Short label or value |
| `h2.cpm-panel-title @1544px` | Notes on EVT-2231 | Keep | - | Section or page title |
| `p.cpm-metric-na @1578px` | No loop note is linked to this episode. | Keep | - | State or row content |
| `span @2592px` | ← Prev | Keep | - | Control label |
| `span @2592px` | Next → | Keep | - | Control label |
| `span.cpm-event-row__sub @2594px` | 1 – 20 of 500 · page 1 of 25 | Keep | - | Population or coverage (constraint) |
| `span.cpm-eyebrow @2671px` | Fast conditions · G10 limit dwell / G11 freeze | Keep | - | State or row content |
| `h2.cpm-panel-title @2693px` | Conditions · 17 open | Keep | - | Section or page title |
| `span.cpm-copy @2694px` | detected within a minute, before the next fused window | Keep | - | State or row content |
| `th @2733px` | State | Keep | - | Column label |
| `th @2733px` | Loop | Keep | - | Column label |
| `th @2733px` | Condition | Keep | - | Column label |
| `th @2733px` | Since | Keep | - | Column label |
| `th @2733px` | Duration | Keep | - | Column label |
| `th @2733px` | Close reason | Keep | - | Column label |

## evidence (Evidence Workbench)

435 visible words, projected 325.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span @96px` | Flow controller FIC10401 (FCS0101) | Keep | - | Short label or value |
| `span.cpm-loop-context__muted @96px` | FIC · criticality medium | Keep | - | Short label or value |
| `span @96px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Keep | - | Loop identity: the only location on this page (guide p.13) |
| `span.cpm-loop-context__label @97px` | Loop | Keep | - | Control label |
| `span.cpm-loop-context__label @97px` | Location | Keep | - | Control label |
| `span @120px` | 12h window · 3 Nov 21:15 → 4 Nov 09:15 UTC | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-loop-context__label @121px` | Period | Keep | - | Control label |
| `obc-button @196px` | Change ▾ | Keep | - | Control label |
| `span.cpm-eyebrow @198px` | Showing | Keep | - | Short label or value |
| `span.cpm-selection__text @198px` | FIC10401 · 12 h · ends 4 Nov 09:15 UTC · Not evaluated: not enough data · 2 h ago | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-eyebrow @250px` | Understand the cause · Evidence workbench | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `h1.cpm-title @271px` | FIC10401 · Flow controller FIC10401 (FCS0101) — G15 Decision | Keep | - | Section or page title |
| `span.cpm-fact__label @332px` | Window | Keep | - | Control label |
| `span.cpm-fact__value @332px` | 12h · 2026-11-03 21:15:00 → 2026-11-04 09:15:00 · UTC (UTC+00:00) · 1,574 samples | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-fact__label @332px` | Mode | Keep | - | Control label |
| `span.cpm-pill @332px` | FIXED | Keep | - | Short label or value |
| `span.cpm-fact__label @332px` | Evidence | Keep | - | Control label |
| `span.cpm-pill @332px` | NONE | Keep | - | Short label or value |
| `span.cpm-fact__label @332px` | Age | Keep | - | Control label |
| `span.cpm-fact__value @332px` | computed 43.9 min ago | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-fact__label @375px` | Run | Keep | - | Control label |
| `span.cpm-sr-only @395px` | Copy run id | Keep | - | Control label |
| `span @429px` | ‹ Newer | Keep | - | Control label |
| `span @429px` | Older › | Keep | - | Control label |
| `span @429px` | Newest | Keep | - | Control label |
| `span @429px` | Reconstruct evidence (×2) | Keep | - | Control label |
| `span.cpm-pill @498px` | No arrays held | Keep | - | Short label or value |
| `span @498px` | Neither retained proof nor a reconstruction is stored for this run. | Keep | - | Data-state message |
| `span.cpm-gate-strip__tier-label @547px` | Eligibility | Keep | - | Short label or value |
| `span.cpm-gate-strip__tier-label @547px` | Performance | Keep | - | Short label or value |
| `span.cpm-gate-chip__word @575px` | Not usable | Keep | - | Control label |
| `span.cpm-gate-chip__word @575px` | Not evaluated (×6) | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-mono @575px` | G2r | Keep | - | Control label |
| `span.cpm-gate-chip__word @575px` | OK | Keep | - | Control label |
| `span.cpm-gate-strip__tier-label @609px` | Diagnostic evidence | Keep | - | Short label or value |
| `span.cpm-gate-chip__word @638px` | Seen (×2) | Keep | - | Control label |
| `span.cpm-gate-chip__word @638px` | Not seen (×3) | Keep | - | Control label |
| `span.cpm-gate-chip__word @638px` | Not seen on available data (×2) | Keep | - | Control label |
| `span.cpm-gate-strip__tier-label @672px` | Confirmation | Keep | - | Short label or value |
| `span.cpm-gate-strip__tier-label @672px` | Fusion | Keep | - | Short label or value |
| `span.cpm-gate-chip__word @700px` | Insufficient (×2) | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-gate-legend__group-label @752px` | Checks | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @752px` | check OK | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @752px` | OK on available data (an input missing) | Keep | - | State or row content |
| `span.cpm-gate-legend__item @752px` | check needs attention | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @752px` | check failed | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-gate-legend__group-label @752px` | Window | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @752px` | window not usable | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @752px` | excluded on purpose (mode / region) | Keep | - | Population or coverage (constraint) |
| `span.cpm-gate-legend__group-label @774px` | Symptoms | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @774px` | symptom not seen | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @774px` | symptom seen | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @774px` | strong symptom | Keep | - | Short label or value |
| `span.cpm-gate-legend__group-label @774px` | Result | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @774px` | detected / classified / suspected | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @774px` | confirmed | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @774px` | ruled out | Keep | - | Short label or value |
| `span.cpm-gate-legend__group-label @797px` | No result | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @797px` | not evaluated | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-gate-legend__glyph @797px` | n/a | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @797px` | not applicable | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @797px` | pending | Keep | - | Short label or value |
| `span.cpm-eyebrow @848px` | Verdict | Keep | - | Short label or value |
| `span.cpm-eyebrow @863px` | Explain | Keep | - | Short label or value |
| `span.cpm-pill @868px` | Insufficient evidence (×2) | Keep | - | Data-state label or error text (constraint) |
| `h2.cpm-panel-title @869px` | G15 · Decision | Keep | - | Section or page title |
| `span.cpm-sr-only @883px` | Hide explain | Keep | - | Control label |
| `p.cpm-verdict__sentence @904px` | G15 Decision: Insufficient evidence. (×2) | Keep | - | Data-state label or error text (constraint) |
| `div.title @921px` | Why this result | Keep | - | Section or page title |
| `p.cpm-copy @937px` | Evidence not retained for this run | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-pill @993px` | Not retained | Keep | - | Data-state label or error text (constraint) |
| `h4.cpm-eyebrow @995px` | Measured vs required | Keep | - | Section or page title |
| `dt @1019px` | Agreeing windows (persistence) | Keep | - | Short label or value |
| `h3 @1056px` | Evidence not retained for this run | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-why__against @1066px` | ≥ 3 required to persist | Keep | - | Short label or value |
| `p @1087px` | The live path keeps the arrays for windows with a finding, at most once an hour per loop … | Move to help | Info button on "Evidence not retained" | Guide p.6: metric definitions go in an accessible help or detail view |
| `h4.cpm-eyebrow @1105px` | Evidence behind it | Keep | - | Section or page title |
| `dt.cpm-cause__label @1138px` | Observed | Keep | - | Control label |
| `dd.cpm-cause__items @1160px` | no symptom present | Keep | - | Short label or value |
| `dt.cpm-cause__label @1188px` | Possible cause | Keep | - | Control label |
| `dd.cpm-cause__items @1211px` | no mechanism qualified | Keep | - | Short label or value |
| `p.cpm-gate-state__valid @1224px` | The verdict and every scalar of this run are valid; only the arrays were not kept. | Shorten | Verdict and scalars valid; arrays not kept | Keep state |
| `h4.cpm-eyebrow @1259px` | What remains open | Keep | - | Section or page title |
| `div.title @1277px` | Signal context | Keep | - | Section or page title |
| `li @1284px` | The whole window: not evaluated: not enough data — no gate on it carries a verdict. | Shorten | Whole window not evaluated: not enough data | Keep state |
| `p.cpm-collapsible__summary @1312px` | PV / SP and OP / VP from the historian over this run's window — context, not the run's ow… | Shorten | Historian context, not qualification data | Source stays |
| `li @1347px` | Valve position expected but not mapped: map its tag so a valve (stiction) cause can be co… | Shorten | Valve position not mapped | Data-state label stays; the action is the link |
| `span.cpm-eyebrow @1378px` | Observability | Keep | - | Short label or value |
| `h2.cpm-panel-title @1399px` | Flags on this window | Keep | - | Section or page title |
| `li @1410px` | Instrument health not configured: transmitter faults are not checked | Keep | - | Data-state label or error text (constraint) |
| `span @1435px` | No valve position mapped | Keep | - | State or row content |
| `span @1435px` | Instrument health not configured | Keep | - | Data-state label or error text (constraint) |
| `span @1435px` | Too few samples | Keep | - | Data-state label or error text (constraint) |
| `li @1452px` | Too few samples in the window | Keep | - | Data-state label or error text (constraint) |
| `li @1473px` | Evidence scores rank the explanations; they are not probabilities. | Keep | - | Needed to read the value correctly |
| `p.cpm-copy @1526px` | Reconstruct the evidence to rebuild the arrays from the run's window; they are labelled a… | Shorten | Rebuilt arrays are labelled as rebuilt | Keep the label promise |
| `div.title @1623px` | What this gate asks | Keep | - | Section or page title |
| `p.cpm-collapsible__summary @1658px` | Observations, hypotheses and the leading hypothesis by ranked selection (argmax, not an a… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `div.title @1730px` | Method | Keep | - | Section or page title |
| `p.cpm-collapsible__summary @1765px` | Evidence fusion v3.0.0 · fusion tier | Keep | - | Source or version (constraint) |
| `div.title @1817px` | Parameters used | Keep | - | Section or page title |
| `p.cpm-collapsible__summary @1852px` | None declared by the retained artifacts | Keep | - | State or row content |
| `div.title @1905px` | Configuration | Keep | - | Section or page title |
| `p.cpm-collapsible__summary @1940px` | The governed bundle this run ran under. | Keep | - | State or row content |
| `div.title @1992px` | Identity | Keep | - | Section or page title |
| `p.cpm-collapsible__summary @2027px` | Run, bundle and source ids — copyable. | Keep | - | Source or version (constraint) |

## performance (Performance (ranking))

431 visible words, projected 386.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Find problems | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `h1.cpm-title @117px` | Performance | Keep | - | Section or page title |
| `p.cpm-copy @151px` | Compare every loop gate by gate and see where the plant is failing. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `p.cpm-copy @188px` | Verdicts fuse on 12h / 24h rolling windows (recomputed every 15 min) · per-window 1m–60m … | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `span.cpm-field__label @314px` | Site | Keep | - | Control label |
| `span.cpm-field__label @314px` | Area | Keep | - | Control label |
| `span.cpm-field__label @314px` | Unit | Keep | - | Control label |
| `span.cpm-copy @351px` | 241 monitored loop(s) in scope | Keep | - | Population or coverage (constraint) |
| `span.chip-label @404px` | Missing binding | Keep | - | Control label |
| `span.chip-label @404px` | Stale collection | Keep | - | Data-state label or error text (constraint) |
| `span.chip-label @404px` | Active affected-device condition | Keep | - | Control label |
| `span.cpm-kpi__caption @470px` | Good-error time | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-kpi__caption @470px` | Median error (% of span) | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-kpi__caption @470px` | Loops with periodic diagnosis | Keep | - | State or row content |
| `span.cpm-kpi__caption @470px` | Diagnostic capability | Keep | - | Short label or value |
| `span.cpm-kpi__sub @524px` | no assessed loop · 0 of 0 assessed loop(s) · excluded: 165 stale, 76 never evaluated (×2) | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-kpi__sub @524px` | oscillation or valve nonlinearity, detected or stronger · 0 of 0 assessed loop(s) · exclu… | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-kpi__sub @524px` | 236 valve loop(s) with VP expected but not mapped — valve faults there need an approved t… | Shorten | 236 loops need a test record to confirm a valve fault | Coverage stays |
| `span.cpm-eyebrow @650px` | Calculation pathway | Keep | - | Short label or value |
| `button.cpm-help-toggle @668px` | How to read this | Keep | - | Control label |
| `h2.cpm-panel-title @671px` | Gate status by loop · latest 12h window | Keep | - | Section or page title |
| `obc-button @718px` | Pipeline Health › | Keep | - | Control label |
| `p.cpm-freshness @719px` | Newest fused window emitted 1.3 h ago (04/11/2026, 13:15:00 GST) | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-rollup__key @834px` | G2r | Keep | - | Control label |
| `span.cpm-rollup__tier-label @863px` | Eligibility | Keep | - | Short label or value |
| `span.cpm-rollup__tier-label @863px` | Performance | Keep | - | Short label or value |
| `span.cpm-rollup__tier-label @863px` | Diagnostic evidence | Keep | - | Short label or value |
| `span.cpm-rollup__tier-label @863px` | Confirmation | Keep | - | Short label or value |
| `span.cpm-rollup__tier-label @863px` | Fusion | Keep | - | Short label or value |
| `obc-toggle-button-option @913px` | Checks behind the result | Keep | - | State or row content |
| `obc-toggle-button-option @913px` | Full G0–G15 matrix | Keep | - | Short label or value |
| `obc-toggle-button-option @913px` | Needs attention 165 | Keep | - | Short label or value |
| `obc-toggle-button-option @913px` | Evaluated 165 | Keep | - | Short label or value |
| `obc-toggle-button-option @913px` | Not evaluated 76 | Keep | - | Data-state label or error text (constraint) |
| `obc-toggle-button-option @913px` | All 241 | Keep | - | Short label or value |
| `span.label-text @963px` | Filter | Keep | - | Control label |
| `span.cpm-matrix-toolbar__count @980px` | Showing 1–25 of 165 | Keep | - | Population or coverage (constraint) |
| `span.cpm-gate-legend__group-label @1030px` | Checks | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @1030px` | check OK | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @1030px` | OK on available data (an input missing) | Keep | - | State or row content |
| `span.cpm-gate-legend__item @1030px` | check needs attention | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @1030px` | check failed | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-gate-legend__group-label @1052px` | Window | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @1052px` | window not usable | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @1052px` | excluded on purpose (mode / region) | Keep | - | Population or coverage (constraint) |
| `span.cpm-gate-legend__group-label @1052px` | Symptoms | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @1052px` | symptom not seen | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @1052px` | symptom seen | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @1052px` | strong symptom | Keep | - | Short label or value |
| `span.cpm-gate-legend__group-label @1074px` | Result | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @1074px` | detected / classified / suspected | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @1074px` | confirmed | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @1074px` | ruled out | Keep | - | Short label or value |
| `span.cpm-gate-legend__group-label @1074px` | No result | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @1074px` | not evaluated | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-gate-legend__glyph @1074px` | n/a | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @1074px` | not applicable | Keep | - | Short label or value |
| `span.cpm-gate-legend__item @1074px` | pending | Keep | - | Short label or value |
| `th.cpm-matrix__loop @1105px` | Loop | Keep | - | Column label |
| `th.cpm-checks__head @1105px` | Checks behind the result | Keep | - | Column label |
| `th.cpm-matrix__result @1105px` | Result | Keep | - | Column label |
| `span.cpm-event-row__sub @1164px` | B2 027 Pressure Control | Keep | - | Column label |
| `span.cpm-event-row__sub @1229px` | Flow controller FIC00701 (FCS0102) (×20) | Keep | - | Column label |
| `span.cpm-event-row__sub @1393px` | Reactor feed flow | Keep | - | Column label |
| `span.cpm-event-row__sub @1460px` | Flow controller FIC10303A (FCS0101) | Keep | - | Column label |
| `span.cpm-event-row__sub @1537px` | Flow controller FIC10303B (FCS0101) | Keep | - | Column label |
| `span @1775px` | Page 1 of 7 | Keep | - | Population or coverage (constraint) |
| `span.cpm-eyebrow @1831px` | Opportunity ranking | Keep | - | Short label or value |
| `div.label @1838px` | By evidence score | Keep | - | Short label or value |
| `h2.cpm-panel-title @1852px` | Loops needing attention | Keep | - | Section or page title |
| `obc-button @1904px` | Open loop › (×12) | Keep | - | Control label |
| `span.cpm-pill @1905px` | Oscillation confirmed (×12) | Keep | - | Short label or value |
| `span.cpm-attention__metric @1905px` | evidence score 100 (×12) | Keep | - | Short label or value |
| `span.cpm-attention__metric @1905px` | driven by (×12) | Keep | - | Short label or value |
| `span.cpm-event-row__sub @1916px` | Flow controller FIC00701 (FCS0102) (×8) | Keep | - | Control label |
| `span.cpm-event-row__sub @1932px` | Hexane feed flow | Keep | - | Column label |
| `span.cpm-event-row__sub @2040px` | Reactor feed flow | Keep | - | Control label |
| `span.cpm-event-row__sub @2102px` | Flow controller FIC10303A (FCS0101) | Keep | - | Control label |
| `span.cpm-event-row__sub @2164px` | Flow controller FIC10303B (FCS0101) | Keep | - | Control label |
| `span.cpm-event-row__sub @2474px` | Hexane feed flow | Keep | - | Control label |

## investigation (Investigation)

410 visible words, projected 353.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Understand the cause | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `h1.cpm-title @117px` | Investigation | Keep | - | Section or page title |
| `p.cpm-copy @151px` | Start here: the conclusion, the evidence behind it and what to check next. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | Flow controller FIC10401 (FCS0101) | Keep | - | Short label or value |
| `span.cpm-loop-context__muted @187px` | FIC · criticality medium | Keep | - | Short label or value |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Keep | - | Loop identity: the only location on this page (guide p.13) |
| `span.cpm-loop-context__label @188px` | Loop | Keep | - | Control label |
| `span.cpm-loop-context__label @188px` | Location | Keep | - | Control label |
| `span @210px` | 12h fused window (latest) · 4 Nov 01:15 → 4 Nov 13:15 GST | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-loop-context__label @211px` | Period | Keep | - | Control label |
| `obc-button @287px` | Change ▾ | Keep | - | Control label |
| `span.cpm-selection__text @288px` | FIC10401 · 12 h fused window · ends 4 Nov 13:15 GST (latest) | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-eyebrow @289px` | Showing | Keep | - | Short label or value |
| `span.cpm-eyebrow @358px` | Final conclusion | Keep | - | Short label or value |
| `span.cpm-eyebrow @358px` | Key facts | Keep | - | Short label or value |
| `span @378px` | no verdict | Keep | - | Short label or value |
| `h2.cpm-panel-title @379px` | Not evaluated: not enough data | Keep | - | Data-state label or error text (constraint) |
| `h2.cpm-panel-title @379px` | Numeric evidence on this window | Keep | - | Section or page title |
| `dt.cpm-cause__label @412px` | Limitations | Keep | - | Control label |
| `li @413px` | Valve position expected but not mapped: map its tag so a valve (stiction) cause can be co… | Shorten | Valve position not mapped | Data-state label stays; the action is the link |
| `obc-button @425px` | Calculation proof › | Keep | - | Control label |
| `li @457px` | Instrument health not configured: transmitter faults are not checked | Keep | - | Data-state label or error text (constraint) |
| `li @480px` | Too few samples in the window | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-kpi__caption @487px` | Stiction score | Keep | - | Short label or value |
| `span.cpm-kv__label @514px` | Window | Keep | - | Control label |
| `span.cpm-kv__value @514px` | 04/11/2026, 1:15:00 GST → 04/11/2026, 13:15:00 GST ( 12h ) | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-kpi__value @516px` | Insufficient data (×6) | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-kpi__sub @541px` | too few qualified samples in the window (×6) | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-kv__label @547px` | Last verdict | Keep | - | Control label |
| `span.cpm-kv__value @547px` | Oscillation confirmed · evidence score 100 · 29 days ago | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-kv__label @579px` | Instrument health | Keep | - | Control label |
| `span.cpm-kv__value @579px` | No health data for this window — not checked (NE107: missing diagnostics are not OK) | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-kpi__caption @603px` | Effort ratio | Keep | - | Short label or value |
| `span.cpm-kv__label @612px` | Severity | Keep | - | Control label |
| `span.cpm-kv__value @612px` | Low | Keep | - | Short label or value |
| `span.cpm-kv__label @644px` | Selected family | Keep | - | Control label |
| `span.cpm-kv__value @644px` | None (×3) | Keep | - | Short label or value |
| `dt.cpm-cause__label @679px` | Observed | Keep | - | Control label |
| `dd.cpm-cause__items @680px` | no symptom present | Keep | - | Short label or value |
| `dt.cpm-cause__label @708px` | Possible cause | Keep | - | Control label |
| `dd.cpm-cause__items @709px` | no mechanism qualified | Keep | - | Short label or value |
| `span.cpm-kpi__caption @718px` | OP triangularity | Keep | - | Short label or value |
| `span.cpm-kv__label @743px` | G14 confirmation | Keep | - | Control label |
| `span.cpm-kv__value @746px` | Not applicable | Keep | - | Short label or value |
| `span.cpm-kv__label @781px` | Reason | Keep | - | Control label |
| `summary @812px` | Advanced — engine trace (raw codes) | Keep | - | State or row content |
| `span.cpm-kpi__caption @833px` | Oscillation period | Keep | - | Short label or value |
| `dt.cpm-mono @835px` | diagnosis | Keep | - | Short label or value |
| `dd.cpm-mono @855px` | INSUFFICIENT_DATA | Keep | - | Data-state label or error text (constraint) |
| `dt.cpm-mono @874px` | leading_hypothesis | Keep | - | Short label or value |
| `dt.cpm-mono @913px` | confirmation | Keep | - | Short label or value |
| `dd.cpm-mono @933px` | NOT_APPLICABLE | Keep | - | Short label or value |
| `span.cpm-kpi__caption @949px` | Freeze index | Keep | - | Short label or value |
| `dt.cpm-mono @952px` | selected_family | Keep | - | Short label or value |
| `span.cpm-kpi__caption @1064px` | Good-error time | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-eyebrow @1208px` | Evidence | Keep | - | Short label or value |
| `obc-button @1216px` | Open in Evidence Replay › | Keep | - | Control label |
| `h2.cpm-panel-title @1230px` | Signals over the evaluated window | Keep | - | Section or page title |
| `h3 @1296px` | no signal values in this trend range | Keep | - | Section or page title |
| `p @1326px` | The historian returned the time range but no PV, SP or OP samples in it — the feed may ha… | Keep | - | Source or version (constraint) |
| `div.title @1429px` | Reasoning chain — how the engine got there | Keep | - | Section or page title |
| `div.title @1429px` | Hypothesis comparison | Keep | - | Section or page title |
| `p.cpm-collapsible__summary @1464px` | Eligibility → Evidence → Fusion · fused cleanly | Keep | - | State or row content |
| `p.cpm-collapsible__summary @1464px` | Leading: No mechanism qualified · Not applicable | Keep | - | State or row content |
| `span.cpm-eyebrow @1530px` | Window browser | Keep | - | Short label or value |
| `h2.cpm-panel-title @1551px` | Recent 12h windows | Keep | - | Section or page title |
| `span.cpm-copy @1552px` | newest first · pick one to make it CURRENT | Shorten | Newest first | Prompt 6.2: "Click to view" affordance on a clickable item |
| `span.cpm-window-tile__end @1595px` | Ends 6 Oct 23:15 GST (×5) | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-window-tile__tag @1595px` | Latest | Keep | - | Control label |
| `span.cpm-window-tile__sub @1619px` | 12 h · Oscillation confirmed (×5) | Keep | - | Control label |
| `span @1739px` | ‹ Newer | Keep | - | Control label |
| `span @1739px` | Older › | Keep | - | Control label |
| `span.cpm-copy @1741px` | 1 – 5 of 100 | Keep | - | Population or coverage (constraint) |
| `p.cpm-copy @1783px` | Only one evaluated window stored — no PREVIOUS to compare against yet. | Shorten | No previous window to compare | Keep state |
| `span.cpm-eyebrow @1853px` | Record it | Keep | - | Short label or value |
| `h2.cpm-panel-title @1875px` | Loop notes | Keep | - | Section or page title |
| `span.cpm-copy @1876px` | 0 on FIC10401 | Keep | - | Short label or value |
| `span.cpm-field__label @1997px` | Outcome | Keep | - | Control label |
| `label.cpm-check @2019px` | Attach to this evaluated window ( 12 h · ends 4 Nov 13:15 GST ) — its evidence is kept | Keep | - | Timestamp, time zone or age (constraint) |
| `label.cpm-check @2039px` | Also acknowledge the open episode EVT- 1970 and link the note to it | Keep | - | Control label |
| `obc-button @2079px` | Save note | Keep | - | Control label |
| `p.cpm-copy @2114px` | A note stays on the loop. Saving it never acknowledges an episode unless you tick that bo… | Shorten | Saving does not acknowledge an episode. | Keep the consequence, drop the explanation |
| `p.cpm-metric-na @2154px` | No notes on this loop yet. | Keep | - | State or row content |

## governance (Governance)

406 visible words, projected 381.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Change control | Keep | - | Short label or value |
| `h1.cpm-title @117px` | Governance | Keep | - | Section or page title |
| `p.cpm-copy @151px` | Who changed what, under which calculation versions, and which duties are separated by the… | Keep | - | Source or version (constraint) |
| `span.cpm-eyebrow @230px` | Immutable audit trail | Keep | - | Short label or value |
| `obc-button @238px` | Verify cryptographic chain | Keep | - | Control label |
| `h2.cpm-panel-title @252px` | Governance events | Keep | - | Section or page title |
| `obc-button @298px` | All entities | Keep | - | Control label |
| `obc-button @298px` | CPM loops | Keep | - | Control label |
| `obc-button @298px` | CPM events | Keep | - | Control label |
| `obc-button @298px` | HMI displays | Keep | - | Control label |
| `span.cpm-filter-count @299px` | 4811 total · showing 200 | Keep | - | Short label or value |
| `span @347px` | When / hash | Keep | - | Short label or value |
| `span @347px` | Action | Keep | - | Short label or value |
| `span @347px` | Actor | Keep | - | Short label or value |
| `span @347px` | Entity | Keep | - | Short label or value |
| `span @383px` | 04/11/2026, 11:09:14 GST (×25) | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-event-row__sub @384px` | data-source-config · 043f185b-d2c5-4a01-bffc-cd06ef02c51b (×2) | Keep | - | Source or version (constraint) |
| `span.cpm-pill @393px` | ingestion.datasource.tested (×2) | Keep | - | Source or version (constraint) |
| `span.cpm-event-row__sub @393px` | superadmin (×23) | Keep | - | Short label or value |
| `div.cpm-event-row__sub @403px` | e7ba35f0414071aa … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @465px` | 7d8e6641a4883160 … | Keep | - | Short label or value |
| `span.cpm-pill @516px` | Cpm event shelf expired (×2) | Keep | - | State or row content |
| `span.cpm-event-row__sub @516px` | system (×2) | Keep | - | Short label or value |
| `span.cpm-event-row__sub @516px` | Cpmeventframe · 3189 (×3) | Keep | - | Short label or value |
| `div.cpm-event-row__sub @526px` | 5d7fcaa77cc6619a … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @588px` | 21da7662f72ffb01 … | Keep | - | Short label or value |
| `span.cpm-pill @639px` | Cpm evidence republished bulk (×20) | Keep | - | State or row content |
| `span.cpm-event-row__sub @639px` | Cpmloop · bulk:3 (×20) | Keep | - | Short label or value |
| `div.cpm-event-row__sub @649px` | f5a7b550178486bf … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @711px` | 57d0c335e90e96e0 … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @772px` | ab4a2ef9c58979c0 … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @834px` | ba2d2d54f904bfa0 … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @895px` | e59c01564cafcd61 … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @957px` | 3ae2c4e0d992aff4 … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @1018px` | 348d52147724b76a … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @1080px` | e22c8d6b8d4e4462 … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @1141px` | 19ad72dab892c704 … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @1203px` | 622a46000282f639 … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @1264px` | 4be3716cbc8bd6e2 … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @1326px` | d1bd40a57914728e … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @1387px` | 6f81ba4bd8da8121 … | Keep | - | Short label or value |
| `span.cpm-pill @1438px` | Cpm event acknowledged | Keep | - | Short label or value |
| `div.cpm-event-row__sub @1449px` | e6104242b4535df0 … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @1510px` | bb45772a9782e2b0 … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @1572px` | 53da4b98bc1ca173 … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @1633px` | 7eedc8d1bb2c1451 … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @1695px` | 516144666bb7ec99 … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @1756px` | 8f72a6049762d78b … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @1818px` | 8ea1ad67eb1e38bf … | Keep | - | Short label or value |
| `div.cpm-event-row__sub @1880px` | 50daad4247ed7cfb … | Keep | - | Short label or value |
| `span @1934px` | ← Prev | Keep | - | Control label |
| `span @1934px` | Next → | Keep | - | Control label |
| `span.cpm-event-row__sub @1936px` | 1 – 25 of 200 fetched · page 1 of 8 · newest 200 of 4811 — older entries are not fetched | Keep | - | Population or coverage (constraint) |
| `span.cpm-eyebrow @2029px` | Version provenance | Keep | - | Source or version (constraint) |
| `span.cpm-eyebrow @2029px` | Separation of duties | Keep | - | Short label or value |
| `h2.cpm-panel-title @2050px` | What is producing today's verdicts | Keep | - | Section or page title |
| `h2.cpm-panel-title @2050px` | As enforced by the permission model | Keep | - | Section or page title |
| `span.cpm-hist-note @2083px` | 5 role(s) · live | Keep | - | Short label or value |
| `span.cpm-kv__label @2089px` | Calculation engine | Keep | - | Control label |
| `span.cpm-kv__value @2089px` | v — · — | Keep | - | Short label or value |
| `span.cpm-kv__label @2122px` | Dynamics profile | Keep | - | Control label |
| `span.cpm-kv__value @2122px` | v — | Keep | - | Short label or value |
| `th @2144px` | Permission | Keep | - | Column label |
| `th @2144px` | Admin | Keep | - | Column label |
| `th @2144px` | Engineer | Keep | - | Column label |
| `th @2144px` | Operator | Keep | - | Column label |
| `th @2144px` | SuperAdmin | Keep | - | Column label |
| `th @2144px` | Viewer | Keep | - | Column label |
| `span.cpm-mono @2144px` | cpm.manage | Keep | - | Column label |
| `span.cpm-kv__label @2154px` | cplm-api build | Keep | - | Control label |
| `span.cpm-event-row__sub @2166px` | Loop onboarding, event ack/shelve, recompute | Keep | - | Column label |
| `span.cpm-kv__label @2187px` | Engine builds observed | Keep | - | Control label |
| `span.cpm-mono @2210px` | system.manage | Keep | - | Column label |
| `span.cpm-kv__label @2220px` | Registered loops | Keep | - | Control label |
| `span.cpm-event-row__sub @2231px` | Pipeline and OPC mutations | Keep | - | Column label |
| `span.cpm-kv__label @2252px` | Threshold profiles in use | Keep | - | Control label |
| `span.cpm-kv__value @2252px` | defaults only | Keep | - | Short label or value |
| `span.cpm-mono @2257px` | admin.audit.view | Keep | - | Column label |
| `span.cpm-event-row__sub @2278px` | Audit trail reads | Keep | - | Column label |
| `p.cpm-copy @2280px` | Every stored window carries these versions in its payload (A13), so any historical verdic… | Keep | - | Source or version (constraint) |
| `span.cpm-mono @2303px` | analytics.view | Keep | - | Column label |
| `span.cpm-eyebrow @2321px` | Approvals | Keep | - | Short label or value |
| `span.cpm-event-row__sub @2325px` | Every CPM read | Keep | - | Column label |
| `h2.cpm-panel-title @2342px` | Gate configuration awaiting approval | Keep | - | Section or page title |
| `span.cpm-mono @2350px` | rbac.manage | Keep | - | Column label |
| `span.cpm-event-row__sub @2372px` | Role and permission changes | Keep | - | Column label |
| `span.cpm-mono @2397px` | display.edit | Keep | - | Column label |
| `h3 @2408px` | Nothing awaiting approval or activation | Keep | - | Section or page title |
| `span.cpm-event-row__sub @2419px` | Authoring HMI displays | Keep | - | Column label |
| `p @2439px` | Validated drafts appear here for an independent approver; approved bundles until they are… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `p.cpm-copy @2453px` | Permission changes take effect when the session's token is next issued (re-login, or the … | Shorten | Applies at next sign-in or token refresh | Keep the consequence |

## registry (Loop Registry)

397 visible words, projected 316.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Set up | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `obc-button @109px` | Bulk import | Keep | - | Control label |
| `obc-button @109px` | Add loop | Keep | - | Control label |
| `h1.cpm-title @117px` | Loop registry | Keep | - | Section or page title |
| `p.cpm-copy @151px` | Add individual loops or validate a bulk registry import. Onboarded loops are evaluated im… | Move to help | Sidebar tooltip | Prompt 6.2: repeats text already on the page or in navigation |
| `strong @221px` | Readiness-gated configuration. | Keep | - | Short label or value |
| `div.cpm-banner @221px` | A loop is only as good as its signal mappings: on a loop that has a valve position but no… | Move to help | Info button beside the value | Prompt 6.2: slogan plus threshold note |
| `span.cpm-field__label @289px` | Site | Keep | - | Control label |
| `span.cpm-field__label @289px` | Area | Keep | - | Control label |
| `span.cpm-field__label @289px` | Unit | Keep | - | Control label |
| `span.cpm-eyebrow @383px` | Registered assets | Keep | - | Short label or value |
| `span.cpm-eyebrow @383px` | Assigned profile | Keep | - | Short label or value |
| `h2.cpm-panel-title @405px` | 243 control-loop records | Keep | - | Section or page title |
| `span @446px` | Loop model (registry) | Keep | - | Short label or value |
| `obc-button @451px` | Edit loop | Keep | - | Control label |
| `span.cpm-pill @452px` | DEGRADED | Keep | - | Short label or value |
| `span @455px` | Loop / service | Keep | - | Short label or value |
| `span @455px` | Type | Keep | - | Short label or value |
| `span @455px` | VP | Keep | - | Short label or value |
| `span @455px` | Profile | Keep | - | Short label or value |
| `span @455px` | State | Keep | - | Short label or value |
| `span.cpm-kv__label @504px` | Loop model | Keep | - | Control label |
| `span.cpm-kv__value @504px` | — · — ( preset from loop type ) | Keep | - | State or row content |
| `span @508px` | Not mapped (×25) | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-pill @518px` | Degraded (×25) | Keep | - | Control label |
| `span @519px` | UNKNOWN | Keep | - | Control label |
| `div.cpm-event-row__sub @520px` | Analyser controller AIC30601 · B2 | Keep | - | Control label |
| `span.cpm-kv__label @536px` | Objective / topology / command | Keep | - | Control label |
| `span.cpm-kv__value @536px` | UNSET · UNKNOWN · UNKNOWN | Keep | - | Short label or value |
| `span @586px` | PIC | Keep | - | Control label |
| `span.cpm-kv__label @588px` | Acquisition | Keep | - | Control label |
| `span.cpm-kv__value @588px` | PERIODIC · grid undeclared | Keep | - | Short label or value |
| `div.cpm-event-row__sub @596px` | B2 027 Pressure Control · B2 | Keep | - | Control label |
| `span.cpm-kv__label @621px` | Loop type | Keep | - | Control label |
| `span.cpm-kv__value @621px` | UNKNOWN | Keep | - | Short label or value |
| `span @645px` | FIC (×14) | Keep | - | Control label |
| `span.cpm-kv__label @653px` | Site / area / unit | Keep | - | Control label |
| `div.cpm-event-row__sub @655px` | Unmodelled location · narnia | Keep | - | Control label |
| `span.cpm-kv__value @656px` | site1 / B2 / B2 View in plant tree ↗ | Keep | - | State or row content |
| `span.cpm-kv__label @692px` | Criticality | Keep | - | Control label |
| `span.cpm-kv__value @692px` | medium | Keep | - | Short label or value |
| `div.cpm-event-row__sub @714px` | Feed flow control · houston (×3) | Keep | - | Control label |
| `span.cpm-kv__label @724px` | Valve position | Keep | - | Control label |
| `span.cpm-kv__value @724px` | Expected but not mapped — G14 cannot confirm a final-element fault | Keep | - | Data-state label or error text (constraint) |
| `div.cpm-event-row__sub @773px` | Bed inlet temperature · houston (×3) | Keep | - | Control label |
| `span.cpm-kv__label @776px` | Peer links | Keep | - | Control label |
| `span.cpm-kv__value @776px` | None — expected; G13 not evaluated | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-kv__label @809px` | Gate profile | Keep | - | Control label |
| `span.cpm-kv__value @809px` | default | Keep | - | Short label or value |
| `div.cpm-event-row__sub @831px` | Recycle compressor suction pressure · houston (×3) | Keep | - | Control label |
| `span.cpm-kv__label @841px` | Observability | Keep | - | Control label |
| `span @844px` | No valve position mapped | Keep | - | State or row content |
| `span @870px` | No peer links configured | Keep | - | State or row content |
| `div.cpm-event-row__sub @907px` | Reboiler steam flow · houston (×2) | Keep | - | Control label |
| `a.cpm-link @908px` | Evidence workbench › | Keep | - | Control label |
| `span.cpm-eyebrow @928px` | Gate role policy | Keep | - | Short label or value |
| `h2.cpm-panel-title @950px` | Roles per gate | Keep | - | Section or page title |
| `div.cpm-event-row__sub @965px` | Separator interface level · houston | Keep | - | Control label |
| `span.cpm-kv__label @989px` | BLOCKING | Keep | - | Control label |
| `span.cpm-kv__label @1021px` | ELIGIBILITY | Keep | - | Control label |
| `span.cpm-kv__value @1021px` | G2 · G2r | Keep | - | Short label or value |
| `div.cpm-event-row__sub @1040px` | Column overhead pressure, train 2 · houston | Keep | - | Control label |
| `span.cpm-kv__label @1054px` | PERFORMANCE | Keep | - | Control label |
| `span.cpm-kv__label @1086px` | PRIMARY | Keep | - | Control label |
| `div.cpm-event-row__sub @1116px` | Fuel gas pressure · houston | Keep | - | Control label |
| `span.cpm-kv__label @1119px` | SUPPORTING | Keep | - | Control label |
| `span.cpm-kv__label @1151px` | CONTEXT | Keep | - | Control label |
| `div.cpm-event-row__sub @1175px` | Reflux drum level · houston (×2) | Keep | - | Control label |
| `span.cpm-kv__label @1184px` | CONFIRMATION | Keep | - | Control label |
| `span.cpm-kv__label @1216px` | FUSION | Keep | - | Control label |
| `div.cpm-event-row__sub @1232px` | Condenser outlet temperature · houston (×2) | Keep | - | Control label |
| `p.cpm-copy @1252px` | G9 geometry is supporting-only. It cannot create a stiction suspect without qualified ind… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `div @1339px` | Re-project links & republish evidence | Keep | - | Control label |
| `div.cpm-event-row__sub @1500px` | Reboiler steam flow, train 2 · houston | Keep | - | Control label |
| `span @1573px` | LIC (×9) | Keep | - | Control label |
| `div.cpm-event-row__sub @1575px` | Column overhead pressure · houston | Keep | - | Control label |
| `div.cpm-event-row__sub @1649px` | Fuel gas pressure, train 2 · houston | Keep | - | Control label |
| `div.cpm-event-row__sub @2110px` | Separator interface level, train 2 · houston | Keep | - | Control label |
| `span @2179px` | ← Prev | Keep | - | Control label |
| `span @2179px` | Next → | Keep | - | Control label |
| `span.cpm-event-row__sub @2181px` | Page 1 of 10 | Keep | - | Population or coverage (constraint) |

## calculations (Calculations)

378 visible words, projected 239.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Understand the cause | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `h1.cpm-title @117px` | Calculations | Keep | - | Section or page title |
| `p.cpm-copy @151px` | Every calculated metric for a loop, with its latest value and method. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | Flow controller FIC10401 (FCS0101) | Keep | - | Short label or value |
| `span.cpm-loop-context__muted @187px` | FIC · criticality medium | Keep | - | Short label or value |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Keep | - | Loop identity: the only location on this page (guide p.13) |
| `span.cpm-loop-context__label @188px` | Loop | Keep | - | Control label |
| `span.cpm-loop-context__label @188px` | Location | Keep | - | Control label |
| `span @210px` | Latest results · 12h fused window · 4 Nov 01:15 → 4 Nov 13:15 GST | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-loop-context__label @211px` | Period | Keep | - | Control label |
| `span.cpm-eyebrow @272px` | 1 · Loop | Keep | - | Short label or value |
| `h2.cpm-panel-title @293px` | FIC10401 · Flow controller FIC10401 (FCS0101) | Keep | - | Section or page title |
| `obc-button @342px` | Change ▾ | Keep | - | Control label |
| `span.cpm-eyebrow @344px` | Showing | Keep | - | Short label or value |
| `span.cpm-selection__text @344px` | FIC10401 — pick another loop or plant scope | Keep | - | State or row content |
| `span.cpm-pill @383px` | Not evaluated: not enough data | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-copy @386px` | FIC · profile default · latest window 04/11/2026, 13:15:00 GST | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-kpi__caption @454px` | Metrics stored for FIC10401 | Keep | - | Short label or value |
| `span.cpm-kpi__caption @454px` | Evidence gates in the pack | Keep | - | State or row content |
| `span.cpm-kpi__caption @454px` | Gates acceptable | Keep | - | Short label or value |
| `span.cpm-kpi__caption @454px` | Gates needing review | Keep | - | Short label or value |
| `span.cpm-kpi__caption @454px` | Gates not evaluated | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-filter-count @591px` | 19 result(s) | Keep | - | Short label or value |
| `span @629px` | ID | Keep | - | Control label |
| `span @629px` | Calculation / parameter | Keep | - | Control label |
| `span @629px` | Gate | Keep | - | Control label |
| `span @629px` | Value | Keep | - | Short label or value |
| `span @629px` | Window | Keep | - | Short label or value |
| `span @629px` | Gate result | Keep | - | Control label |
| `span.cpm-event-row__sub @660px` | 12h window · 04/11/2026, 1:15:00 GST – 04/11/2026, 13:15:00 GST (12 h) (×12) | Keep | - | Timestamp, time zone or age (constraint) |
| `span @669px` | Sample completeness | Keep | - | Section or page title |
| `span @678px` | Insufficient data (×5) | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-pill @678px` | Not usable (×2) | Keep | - | Control label |
| `div.cpm-event-row__sub @689px` | Fraction of expected samples present in the window. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `span @737px` | Sample count | Keep | - | Section or page title |
| `div.cpm-event-row__sub @757px` | Samples evaluated in the window. | Keep | - | Control label |
| `span @798px` | Not measured — not in this window's result (written by an engine version without this met… (×7) | Shorten | Not measured: older engine | Data-state label stays; the reason moves to help |
| `span @830px` | Automatic-mode fraction | Keep | - | Section or page title |
| `span.cpm-pill @839px` | Not evaluated (×9) | Keep | - | Data-state label or error text (constraint) |
| `div.cpm-event-row__sub @850px` | Time fraction the controller spent in AUTO. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `span @948px` | Mean absolute error | Keep | - | Data-state label or error text (constraint) |
| `div.cpm-event-row__sub @968px` | Mean /PV − SP/ over the window. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `span @1066px` | Root-mean-square error | Keep | - | Data-state label or error text (constraint) |
| `div.cpm-event-row__sub @1086px` | RMS control error. | Keep | - | Data-state label or error text (constraint) |
| `span @1184px` | Integral absolute error | Keep | - | Data-state label or error text (constraint) |
| `div.cpm-event-row__sub @1204px` | Accumulated absolute error. | Keep | - | Data-state label or error text (constraint) |
| `span @1302px` | Integral squared error | Keep | - | Data-state label or error text (constraint) |
| `div.cpm-event-row__sub @1322px` | Accumulated squared error. | Keep | - | Data-state label or error text (constraint) |
| `span @1420px` | Good-error time | Keep | - | Data-state label or error text (constraint) |
| `div.cpm-event-row__sub @1440px` | Time fraction (0-1) the error stayed inside the good band. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `span @1538px` | Actuator effort ratio | Keep | - | Section or page title |
| `div.cpm-event-row__sub @1558px` | OP travel relative to the error it corrects. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `span @1631px` | OP travel per day | Keep | - | Section or page title |
| `div.cpm-event-row__sub @1651px` | Total actuator travel extrapolated to a day. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `span @1700px` | OP reversals per hour | Keep | - | Section or page title |
| `div.cpm-event-row__sub @1720px` | Direction changes of the actuator. | Keep | - | Control label |
| `span @1768px` | Oscillation period (ACF) | Keep | - | Section or page title |
| `span.cpm-pill @1777px` | Seen | Keep | - | Control label |
| `div.cpm-event-row__sub @1788px` | Dominant period from the autocorrelation. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `span @1850px` | Previous | Keep | - | Control label |
| `span @1850px` | Next | Keep | - | Control label |
| `span.cpm-copy @1851px` | Page 1 of 2 | Keep | - | Population or coverage (constraint) |

## overview (Overview)

308 visible words, projected 192.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Find problems | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `h1.cpm-title @117px` | Operations overview | Keep | - | Section or page title |
| `p.cpm-copy @151px` | Which loops need attention first, and why. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span.cpm-field__label @187px` | Site | Keep | - | Control label |
| `span.cpm-field__label @187px` | Area | Keep | - | Control label |
| `span.cpm-field__label @187px` | Unit | Keep | - | Control label |
| `span.cpm-copy @224px` | 243 loop(s) in scope | Keep | - | Population or coverage (constraint) |
| `span.cpm-eyebrow @281px` | Operating picture · latest 12h results | Keep | - | State or row content |
| `h2.cpm-panel-title @303px` | 241 loop(s) monitored | Keep | - | Population or coverage (constraint) |
| `span.cpm-op__muted @304px` | updated 04/11/2026, 14:31:36 GST · change vs 24 h ago | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-kpicard__delta @365px` | ±0 pp (×2) | Keep | - | Control label |
| `span.cpm-visually-hidden @374px` | unchanged (×2) | Keep | - | Control label |
| `span.cpm-kpicard__label @426px` | Performing acceptably | Keep | - | Control label |
| `span.cpm-kpicard__label @426px` | In auto mode | Keep | - | Control label |
| `span.cpm-kpicard__label @426px` | In manual mode | Keep | - | Control label |
| `span.cpm-kpicard__label @426px` | Oscillating | Keep | - | Control label |
| `span.cpm-kpicard__label @426px` | Suspected valve problem | Keep | - | Control label |
| `span.cpm-kpicard__label @426px` | Excessive actuator effort | Keep | - | Control label |
| `span.cpm-kpicard__label @426px` | Saturated / at limit | Keep | - | Control label |
| `span.cpm-kpicard__sub @448px` | 0 % of 0 loops with a measured mode | Keep | - | Population or coverage (constraint) |
| `span.cpm-kpicard__sub @448px` | 0 % of 0 loops with a measured manual share | Keep | - | Population or coverage (constraint) |
| `span.cpm-kpicard__sub @448px` | 0 % of 0 assessed loops (×3) | Keep | - | Population or coverage (constraint) |
| `span.cpm-kpicard__sub @448px` | 0 % of 0 loops with a measured OP | Keep | - | Population or coverage (constraint) |
| `span.cpm-kpicard__sub @467px` | 0 % of 241 monitored loops | Keep | - | Population or coverage (constraint) |
| `span.cpm-kpicard__label @542px` | Every monitored loop, one state each | Keep | - | Population or coverage (constraint) |
| `span.cpm-kpicard__delta @546px` | −1 pp | Keep | - | Control label |
| `span.cpm-kpicard__delta @546px` | +1 pp | Keep | - | Control label |
| `span.cpm-visually-hidden @556px` | down | Keep | - | Control label |
| `span.cpm-visually-hidden @556px` | up | Keep | - | Control label |
| `a.cpm-link @590px` | Stale 165 | Keep | - | Data-state label or error text (constraint) |
| `a.cpm-link @590px` | Never evaluated 76 | Keep | - | Control label |
| `span.cpm-kpicard__label @608px` | Not assessable | Keep | - | Control label |
| `span.cpm-kpicard__label @608px` | Stale | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-kpicard__label @608px` | Never evaluated | Keep | - | Control label |
| `span.cpm-kpicard__sub @629px` | 0 % of monitored (×3) | Keep | - | Population or coverage (constraint) |
| `p.cpm-op__basis @673px` | Each monitored loop counted once from its newest 12h result, at most 60 min old · normal … | Shorten | Keep the counting rule in help; drop this sentence | Prompt 6.2: "Click to view" affordance on a clickable item |
| `span.cpm-eyebrow @767px` | Priority queue | Keep | - | Short label or value |
| `obc-button @775px` | View all › | Keep | - | Control label |
| `h2.cpm-panel-title @789px` | Loops requiring review | Keep | - | Section or page title |
| `h3 @795px` | Select a loop | Keep | - | Section or page title |
| `p.cpm-queue-rule @822px` | Ordered by priority (loop criticality × finding severity), then time outside the good-err… | Shorten | Ranked by priority | Guide p.13 needs a stated ranking basis; full rule in the info button |
| `p @825px` | Pick a loop in the priority queue to see its live signals and trend here. | Shorten | Select a loop | Prompt 6.2: "Click to view" affordance on a clickable item |
| `a.cpm-link @875px` | All loops in Performance › | Keep | - | Control label |
| `h3 @902px` | No current findings | Keep | - | Section or page title |
| `p @932px` | No loop has a current confirmed or suspected finding. The operating picture above shows t… | Shorten | No current findings | Heading above says this; empty state stays short |
| `obc-button @994px` | View all loops | Keep | - | Control label |
| `span.cpm-eyebrow @1111px` | Top-priority finding | Keep | - | Short label or value |
| `span.cpm-eyebrow @1117px` | Recent context | Keep | - | Short label or value |
| `obc-button @1124px` | All events › | Keep | - | Control label |
| `h2.cpm-panel-title @1133px` | No evaluated findings yet | Keep | - | Section or page title |
| `h2.cpm-panel-title @1138px` | Event trail | Keep | - | Section or page title |
| `p.cpm-copy @1167px` | No loop has a current finding. Verdicts appear once a loop completes an evaluation window. | Shorten | No current findings | Heading above says this; empty state stays short |
| `obc-button @1213px` | Episode › (×3) | Keep | - | Control label |
| `span.cpm-event-row__sub @1215px` | 05/10/2026, 11:45:00 GST (×3) | Keep | - | Timestamp, time zone or age (constraint) |
| `span @1232px` | Oscillation confirmed (×3) | Keep | - | Short label or value |
| `span.cpm-eyebrow @1547px` | Readiness | Keep | - | Short label or value |
| `obc-button @1554px` | Open Loop Registry › | Keep | - | Control label |
| `h2.cpm-panel-title @1568px` | Configuration limits | Keep | - | Section or page title |
| `li @1602px` | 236 valve position expected but not mapped · map the VP tag so non-following evidence can… | Shorten | 236 loops: VP not mapped (G14) | Coverage stays; repeats the sibling line |
| `li @1628px` | 241 peer links expected but missing · interaction analysis unavailable (G13) until peers … | Shorten | 241 peer links missing (G13) | Coverage stays |
| `p.cpm-op__muted @1663px` | Plant facts, nothing to fix: 1 without a valve (valve diagnosis does not apply). | Keep | - | State or row content |

## replay (Evidence Replay)

270 visible words, projected 192.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Understand the cause | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `obc-button @109px` | Export package | Keep | - | Control label |
| `h1.cpm-title @117px` | Evidence replay | Keep | - | Section or page title |
| `p.cpm-copy @151px` | Replay the raw samples behind a verdict and re-run the calculation. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | Flow controller FIC10401 (FCS0101) | Keep | - | Short label or value |
| `span.cpm-loop-context__muted @187px` | FIC · criticality medium | Keep | - | Short label or value |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Keep | - | Loop identity: the only location on this page (guide p.13) |
| `span.cpm-loop-context__label @188px` | Loop | Keep | - | Control label |
| `span.cpm-loop-context__label @188px` | Location | Keep | - | Control label |
| `span @210px` | 12h fused window · 4 Nov 00:00 → 4 Nov 12:00 GST | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-loop-context__label @211px` | Period | Keep | - | Control label |
| `span.cpm-field__label @272px` | Site | Keep | - | Control label |
| `span.cpm-field__label @272px` | Area | Keep | - | Control label |
| `span.cpm-field__label @272px` | Unit | Keep | - | Control label |
| `label.cpm-field__label @333px` | Control loop | Keep | - | Control label |
| `span.cpm-field__label @365px` | Evaluated window ( 12h ) | Keep | - | Control label |
| `span.cpm-field__label @365px` | Gate | Keep | - | Control label |
| `span.cpm-sr-only @391px` | Clear the selected loop | Keep | - | Control label |
| `span.cpm-sr-only @391px` | Open the loop list | Keep | - | Control label |
| `span.cpm-pill @403px` | FUSION | Keep | - | Short label or value |
| `span.cpm-combo__hint @408px` | 243 loop(s) in scope | Keep | - | Population or coverage (constraint) |
| `span.cpm-pill @441px` | △ Detected (×2) | Keep | - | Short label or value |
| `span.cpm-wizard-step @470px` | 1 . Raw historian | Keep | - | Source or version (constraint) |
| `span.cpm-wizard-step @470px` | 2 . Normalize (5.0 s grid) | Keep | - | Short label or value |
| `span.cpm-wizard-step @470px` | 3 . Feature windows | Keep | - | Short label or value |
| `span.cpm-wizard-step @470px` | 4 . Gate evaluation | Keep | - | Short label or value |
| `span.cpm-wizard-step @470px` | 5 . Fusion (G15) | Keep | - | Short label or value |
| `p.cpm-copy @514px` | Stages are the pipeline's fixed shape; the chart below shows the raw historian slice this… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `h3 @588px` | No raw historian data for this window | Keep | - | Source or version (constraint) |
| `p @619px` | No raw samples were stored for this loop between the window's start and end. Check its si… | Keep | - | Source or version (constraint) |
| `a.cpm-link @669px` | Signal mapping in the Loop Registry › | Keep | - | Control label |
| `span.cpm-eyebrow @771px` | Summary | Keep | - | Short label or value |
| `span.cpm-eyebrow @771px` | Re-run | Keep | - | Short label or value |
| `h2.cpm-panel-title @792px` | G15 · Diagnosis band | Keep | - | Section or page title |
| `h2.cpm-panel-title @792px` | Recompute this loop from history | Keep | - | Section or page title |
| `p.cpm-copy @826px` | Submits the A8 historical replay job with this loop's current evidence flags and window a… | Move to help | Button tooltip with accessible description | Guide p.7: a disabled or heavy action explains itself accessibly; not on every … |
| `span.cpm-kv__label @831px` | Question | Keep | - | Control label |
| `span.cpm-kv__value @831px` | How confident is the final verdict? | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `span.cpm-kv__label @863px` | Result | Keep | - | Control label |
| `span.cpm-kv__label @902px` | Window | Keep | - | Control label |
| `span.cpm-kv__value @902px` | 04/11/2026, 0:00:00 GST → 04/11/2026, 12:00:00 GST | Keep | - | Timestamp, time zone or age (constraint) |
| `obc-button @922px` | Re-run this window | Keep | - | Control label |
| `span.cpm-kv__label @934px` | Samples | Keep | - | Control label |
| `span.cpm-kv__label @967px` | Calculation | Keep | - | Control label |
| `span.cpm-kv__value @967px` | v 3.0.0 · profile v 2.0.0 · replay e896b5d4-d1e5-4baa-b237-6c45a046b708 | Keep | - | State or row content |
| `span.cpm-eyebrow @994px` | Input lineage | Keep | - | Short label or value |
| `h2.cpm-panel-title @1015px` | Where this evidence came from | Keep | - | Section or page title |
| `span.cpm-eyebrow @1059px` | Normalize | Keep | - | Short label or value |
| `span.cpm-eyebrow @1059px` | Gate tier | Keep | - | Short label or value |
| `span.cpm-eyebrow @1060px` | IoTDB raw | Keep | - | Short label or value |
| `span.cpm-mono @1080px` | root.site1.cpm.FIC10401 | Keep | - | Source or version (constraint) |
| `span @1080px` | 5.0 s grid · traverse.cpa.loop.samples.v1 | Keep | - | Source or version (constraint) |
| `span @1080px` | G15 · FUSION | Keep | - | Short label or value |
| `span.cpm-eyebrow @1132px` | Fused verdict | Keep | - | Short label or value |
| `span @1154px` | Oscillation detected | Keep | - | Short label or value |
| `span.cpm-eyebrow @1251px` | Record it | Keep | - | Short label or value |
| `h2.cpm-panel-title @1272px` | Loop notes | Keep | - | Section or page title |
| `span.cpm-copy @1273px` | 0 on FIC10401 | Keep | - | Short label or value |
| `span.cpm-field__label @1394px` | Outcome | Keep | - | Control label |
| `label.cpm-check @1416px` | Attach to this evaluated window ( 12 h · ends 4 Nov 12:00 GST ) — its evidence is kept | Keep | - | Timestamp, time zone or age (constraint) |
| `label.cpm-check @1436px` | Also acknowledge the open episode EVT- 1970 and link the note to it | Keep | - | Control label |
| `obc-button @1476px` | Save note | Keep | - | Control label |
| `p.cpm-copy @1511px` | A note stays on the loop. Saving it never acknowledges an episode unless you tick that bo… | Shorten | Saving does not acknowledge an episode. | Keep the consequence, drop the explanation |
| `p.cpm-metric-na @1552px` | No notes on this loop yet. | Keep | - | State or row content |

## kpi (KPI drill-down (report))

263 visible words, projected 96.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `a.cpm-link @96px` | Operations overview | Keep | - | Control label |
| `span.cpm-eyebrow @136px` | Find problems | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `span.cpm-field__label @136px` | Show another KPI | Keep | - | Control label |
| `h1.cpm-title @157px` | Performing acceptably | Keep | - | Section or page title |
| `p.cpm-copy @190px` | The loops behind one Overview number, and the value that put each one there. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span.cpm-field__label @247px` | Site | Keep | - | Control label |
| `span.cpm-field__label @247px` | Area | Keep | - | Control label |
| `span.cpm-field__label @247px` | Unit | Keep | - | Control label |
| `span.cpm-copy @285px` | 241 monitored loop(s) in scope | Keep | - | Population or coverage (constraint) |
| `span.cpm-kpicard__delta @342px` | ±0 pp | Keep | - | Short label or value |
| `span.cpm-visually-hidden @351px` | unchanged | Keep | - | Short label or value |
| `span.cpm-kpicard__text @375px` | No fault · AUTO ≥ 95 % · at limit ≤ 10 % · good-error share ≥ floor (G3) · effort not str… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `span.cpm-kpicard__text @375px` | 12h window · newest 12h result ≤ 60 min old | Keep | - | State or row content |
| `span.cpm-kpicard__text @375px` | 04/11/2026, 14:35:39 GST | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-kpicard__label @395px` | Computed | Keep | - | Control label |
| `span.cpm-kpicard__label @410px` | 0 % of monitored loops | Keep | - | Population or coverage (constraint) |
| `span.cpm-kpicard__label @412px` | Basis | Keep | - | Control label |
| `span.cpm-kpicard__sub @416px` | the change compares with 24 h earlier | Keep | - | State or row content |
| `span.cpm-kpicard__label @430px` | Threshold | Keep | - | Control label |
| `span.cpm-eyebrow @495px` | Proof | Keep | - | Short label or value |
| `h2.cpm-panel-title @516px` | How this number is calculated | Keep | - | Section or page title |
| `dd @550px` | No fault identified (NO_CALL / INSUFFICIENT_EVIDENCE), in normal mode ≥ 95 %, not at an O… | Move to help | Collapsed "How this is counted" on /cpm/kpi | Guide p.6: metric definitions go in an accessible help or detail view |
| `dt @551px` | Rule | Keep | - | Short label or value |
| `dt @601px` | Formula | Keep | - | Short label or value |
| `dd @605px` | count(no fault identified ∧ AUTO ≥ normal-mode limit ∧ time at OP limit ≤ saturation limi… | Move to help | Collapsed "How this is counted" on /cpm/kpi | Guide p.6: metric definitions go in an accessible help or detail view |
| `dd @636px` | The headline of control-loop monitoring: loops judged with no fault, on qualified data, i… | Move to help | Collapsed "How this is counted" on /cpm/kpi | Guide p.6: metric definitions go in an accessible help or detail view |
| `dt @637px` | Why this KPI | Keep | - | Short label or value |
| `span.cpm-eyebrow @754px` | Last 14 d · each UTC+04:00 day at its end, same rules | Keep | - | Timestamp, time zone or age (constraint) |
| `obc-button @761px` | 14 d (×2) | Keep | - | Control label |
| `obc-button @761px` | 1 y (×2) | Keep | - | Control label |
| `h2.cpm-panel-title @775px` | How this number has moved | Keep | - | Section or page title |
| `p.cpm-op__basis @988px` | Between 0 % and 0 % over the days with data. Click a day to list the loops it counted. Da… | Shorten | Days with nothing kept read "no data", not 0 %. | Prompt 6.2: "Click to view" affordance on a clickable item |
| `span.cpm-eyebrow @1057px` | The loops behind the number | Keep | - | State or row content |
| `span.cpm-pill @1077px` | matches the card | Keep | - | Short label or value |
| `h2.cpm-panel-title @1079px` | 0 loop(s) | Keep | - | Section or page title |
| `span.cpm-field__label @1112px` | Search loops | Keep | - | Control label |
| `h3 @1222px` | No loop is in this KPI | Keep | - | Section or page title |
| `p @1253px` | The count for this KPI is 0 in this scope — nothing to verify here. Back on the Overview,… | Shorten | No loops in this scope | Keep state |

## windows (Window Inspector)

257 visible words, projected 226.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Understand the cause | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `span.cpm-pill @99px` | CPLM jobs not visible | Keep | - | State or row content |
| `h1.cpm-title @117px` | Window inspector | Keep | - | Section or page title |
| `p.cpm-copy @151px` | Which windows were evaluated and whether they had enough data. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | Flow controller FIC10401 (FCS0101) | Keep | - | Short label or value |
| `span.cpm-loop-context__muted @187px` | FIC · criticality medium | Keep | - | Short label or value |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Keep | - | Loop identity: the only location on this page (guide p.13) |
| `span @187px` | 15m windows (list) | Keep | - | Short label or value |
| `span.cpm-loop-context__label @188px` | Loop | Keep | - | Control label |
| `span.cpm-loop-context__label @188px` | Location | Keep | - | Control label |
| `span.cpm-loop-context__label @188px` | Period | Keep | - | Control label |
| `span.cpm-field__label @248px` | Site | Keep | - | Control label |
| `span.cpm-field__label @248px` | Area | Keep | - | Control label |
| `span.cpm-field__label @248px` | Unit | Keep | - | Control label |
| `label.cpm-field__label @310px` | Control loop | Keep | - | Control label |
| `span.cpm-field__label @341px` | Window profile | Keep | - | Control label |
| `span.cpm-sr-only @367px` | Clear the selected loop | Keep | - | Control label |
| `span.cpm-sr-only @367px` | Open the loop list | Keep | - | Control label |
| `span.cpm-combo__hint @384px` | 243 loop(s) in scope | Keep | - | Population or coverage (constraint) |
| `p.cpm-hist-note @408px` | Watermark lag: — (not exposed by the metrics proxy; job state and checkpoint age in the h… | Shorten | Watermark lag: unavailable | Data-state label stays |
| `span.cpm-eyebrow @427px` | Emitted windows | Keep | - | Short label or value |
| `h2.cpm-panel-title @448px` | Latest 15m results for FIC10401 | Keep | - | Section or page title |
| `span.cpm-copy @449px` | 24 loaded · newest first · select a window to open it | Shorten | 24 loaded · newest first | Prompt 6.2: "Click to view" affordance on a clickable item |
| `span @492px` | 04/11/2026, 14:00:00 GST (×24) | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-pill @501px` | 95% full (×14) | Keep | - | Control label |
| `span.cpm-event-row__sub @502px` | 171 samples (×24) | Keep | - | Control label |
| `span.cpm-event-row__sub @502px` | emitted 04/11/2026, 14:04:29 GST (×24) | Keep | - | Timestamp, time zone or age (constraint) |
| `div.cpm-event-row__sub @512px` | from 04/11/2026, 13:45:00 GST (×24) | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-pill @562px` | DECLINED (×10) | Keep | - | Control label |
| `obc-button @1951px` | Load older windows | Keep | - | Control label |

## pipeline (Pipeline)

248 visible words, projected 189.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Runtime internals | Keep | - | Short label or value |
| `span.cpm-pill @99px` | 0 / 13 REQUIRED JOBS RUNNING | Keep | - | Short label or value |
| `h1.cpm-title @117px` | Pipeline health | Keep | - | Section or page title |
| `p.cpm-copy @151px` | The Flink/Kafka runtime that produces every verdict. This view is read-only; job lifecycl… | Move to help | Sidebar tooltip | Prompt 6.2: repeats text already on the page or in navigation |
| `span.cpm-kpi__caption @223px` | Required jobs (×2) | Keep | - | Short label or value |
| `span.cpm-kpi__caption @223px` | Checkpoint success | Keep | - | Short label or value |
| `span.cpm-kpi__caption @223px` | Managed state | Keep | - | Short label or value |
| `span.cpm-kpi__caption @223px` | Watermark lag | Keep | - | Short label or value |
| `span.cpm-kpi__caption @223px` | Kafka consumer lag | Keep | - | Short label or value |
| `span.cpm-kpi__sub @277px` | analysis engine not answering (JobManager) | Keep | - | State or row content |
| `span.cpm-kpi__sub @277px` | 0 ok · 0 failed (since job start) | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-kpi__sub @277px` | sum of last completed checkpoints | Keep | - | State or row content |
| `span.cpm-kpi__sub @277px` | not exposed by the metrics proxy (×2) | Keep | - | State or row content |
| `span.cpm-copy @365px` | Latency / backpressure / parallelism are not exposed by the proxy — shown as “—”, not est… | Shorten | Not exposed: latency, backpressure, parallelism | Data-state label stays |
| `h2.cpm-panel-title @385px` | One row per supervised job | Keep | - | Section or page title |
| `h3 @451px` | The analysis engine did not answer | Keep | - | Section or page title |
| `p @482px` | Its job list could not be read, so no job can be shown and new verdicts may be late. Retr… | Keep | - | Error text (constraint) |
| `obc-button @544px` | Retry | Keep | - | Error text (constraint) |
| `span.cpm-eyebrow @661px` | Runtime telemetry | Keep | - | Short label or value |
| `span.cpm-eyebrow @661px` | End-to-end verification | Keep | - | Short label or value |
| `h2.cpm-panel-title @682px` | Checkpoint behaviour while this page is open | Keep | - | Section or page title |
| `h2.cpm-panel-title @682px` | Prove the pipeline with a real round trip | Keep | - | Section or page title |
| `span.cpm-copy @683px` | 1 sample(s) · 20 s cadence | Keep | - | Short label or value |
| `p.cpm-copy @716px` | There is no server-side history for these metrics; the chart accumulates live snapshots f… | Shorten | Live snapshots since this page opened | Source stays |
| `p.cpm-copy @716px` | Submits an A8 recompute on AIC30601 (first monitored loop) and waits for the batch verdic… | Keep | - | Population or coverage (constraint) |
| `h3 @811px` | Collecting… | Keep | - | Section or page title |
| `obc-button @812px` | Run E2E verification | Keep | - | Control label |
| `p @842px` | The chart needs at least two readings; it draws on its own as they arrive — keep this pag… | Shorten | Needs two readings; keep this page open | Keep state |
| `span.cpm-eyebrow @847px` | Result delivery path | Keep | - | Short label or value |
| `h2.cpm-panel-title @868px` | Where a sample becomes a verdict | Keep | - | Section or page title |
| `span.cpm-eyebrow @913px` | Source | Keep | - | Source or version (constraint) |
| `span @934px` | DCS / edge → Kafka | Keep | - | Short label or value |
| `span.cpm-eyebrow @986px` | Compute | Keep | - | Short label or value |
| `span @1007px` | Flink · 0 CPLM job(s) running | Keep | - | State or row content |
| `span.cpm-eyebrow @1059px` | Store | Keep | - | Short label or value |
| `span @1081px` | Postgres + IoTDB | Keep | - | Short label or value |
| `span.cpm-eyebrow @1133px` | Last fused verdict | Keep | - | Short label or value |
| `span @1154px` | window ended 687 h ago | Keep | - | Timestamp, time zone or age (constraint) |

## explorer-calculations (Loop Explorer: Calculations)

201 visible words, projected 174.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Check a loop | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `h1.cpm-title @117px` | Loop explorer | Keep | - | Section or page title |
| `p.cpm-copy @151px` | One loop's current condition, trend and gate results. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | Flow controller FIC10401 (FCS0101) (×2) | Keep | - | Short label or value |
| `span.cpm-loop-context__muted @187px` | FIC · criticality medium | Keep | - | Short label or value |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: Explorer shows t… |
| `span.cpm-loop-context__label @188px` | Loop | Keep | - | Control label |
| `span.cpm-loop-context__label @188px` | Location | Keep | - | Control label |
| `span @210px` | Gates: latest 12h fused window · trend: last 8 h | Keep | - | State or row content |
| `span.cpm-loop-context__label @211px` | Period | Keep | - | Control label |
| `span.cpm-field__label @255px` | Site | Keep | - | Control label |
| `span.cpm-field__label @255px` | Area | Keep | - | Control label |
| `span.cpm-field__label @255px` | Unit | Keep | - | Control label |
| `span.cpm-copy @292px` | 243 of 243 loop(s) in scope | Keep | - | Population or coverage (constraint) |
| `span @349px` | HDPE | Keep | - | Short label or value |
| `span @349px` | Section 600 | Keep | - | Short label or value |
| `span @349px` | U6002 pellet homogenization II silo 4/5 | Keep | - | State or row content |
| `span.cpm-sr-only @376px` | Expand loop list | Keep | - | Control label |
| `span.cpm-head-pills @393px` | Not configured · not checked | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-facet__caption @394px` | Instrument health | Keep | - | Control label |
| `span.cpm-eyebrow @443px` | Loop summary · latest 12h evaluated window | Shorten | Latest 12h window | Window label stays; repeats "Loop" |
| `h2.cpm-loop-summary__condition @464px` | Not evaluated: not enough data | Keep | - | Data-state label or error text (constraint) |
| `p.cpm-loop-summary__note @504px` | The newest window has no verdict. Last verdict: Oscillation confirmed , window ending 6 O… | Keep | - | Timestamp, time zone or age (constraint) |
| `p.cpm-loop-summary__next-text @553px` | Check that the loop’s signals are arriving: the Window Inspector shows the samples each w… | Shorten | Check signal arrival in Window Inspector | Keep the next step |
| `obc-button @562px` | Open Window Inspector › | Keep | - | Control label |
| `obc-button @562px` | Show on trend › | Keep | - | Control label |
| `obc-button @562px` | Calculation proof › Workbench | Keep | - | Control label |
| `span.cpm-loop-summary__label @564px` | Next check | Keep | - | Control label |
| `div.title @618px` | Basis and limitations | Keep | - | Section or page title |
| `p.cpm-collapsible__summary @653px` | 3 limitation(s) · 1,574 samples | Keep | - | Short label or value |
| `strong @707px` | Not producing verdicts | Keep | - | Control label |
| `span.cpm-event-row__sub @709px` | 3 to fix · 1 blocking | Keep | - | Control label |
| `div.title @764px` | Summary | Keep | - | Section or page title |
| `div.title @764px` | Signals | Keep | - | Section or page title |
| `div.title @764px` | Calculations | Keep | - | Section or page title |
| `div.title @764px` | Relationships | Keep | - | Section or page title |
| `div.title @764px` | History | Keep | - | Section or page title |
| `span.cpm-field__label @815px` | Window | Keep | - | Control label |
| `span.cpm-eyebrow @833px` | Latest fused 12h window | Keep | - | Short label or value |
| `obc-button @834px` | Full catalogue › | Keep | - | Control label |
| `h2.cpm-panel-title @855px` | Gate outcomes | Keep | - | Section or page title |
| `h3.cpm-gate-tier__label @888px` | Eligibility | Keep | - | Section or page title |
| `span.cpm-kv__label @911px` | G0 · Data quality | Keep | - | Control label |
| `span.cpm-kv__value @911px` | Fail | Keep | - | Control label |
| `span.cpm-kv__label @938px` | G1 · Mode / service | Keep | - | Control label |
| `span.cpm-kv__value @938px` | Not evaluated (×6) | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-kv__label @964px` | G2 · SP activity | Keep | - | Control label |
| `span.cpm-kv__label @991px` | G2r · Operating region | Keep | - | Control label |
| `span.cpm-kv__value @991px` | Pass (×6) | Keep | - | Control label |
| `h3.cpm-gate-tier__label @1027px` | Performance | Keep | - | Section or page title |
| `span.cpm-kv__label @1051px` | G3 · Base performance | Keep | - | Control label |
| `span.cpm-kv__label @1077px` | G4 · Actuator effort | Keep | - | Control label |
| `h3.cpm-gate-tier__label @1114px` | Diagnostic evidence | Keep | - | Section or page title |
| `span.cpm-kv__label @1137px` | G5 · Oscillation (ACF) | Keep | - | Control label |
| `span.cpm-kv__value @1137px` | Warning (×2) | Keep | - | Control label |
| `span.cpm-kv__label @1164px` | G6 · Spectral (PSD) | Keep | - | Control label |
| `span.cpm-kv__label @1190px` | G7 · Stiction shape | Keep | - | Control label |
| `span.cpm-kv__label @1217px` | G8 · Lag asymmetry | Keep | - | Control label |
| `span.cpm-kv__label @1243px` | G9 · Phase geometry | Keep | - | Control label |
| `span.cpm-kv__label @1270px` | G10 · Actuator limits | Keep | - | Control label |
| `span.cpm-kv__label @1296px` | G11 · Measurement health | Keep | - | Control label |
| `h3.cpm-gate-tier__label @1333px` | Confirmation | Keep | - | Section or page title |
| `span.cpm-kv__label @1356px` | G12 · System response | Keep | - | Control label |
| `span.cpm-kv__label @1383px` | G13 · Interaction | Keep | - | Control label |
| `span.cpm-kv__label @1409px` | G14 · Final-element confirmation | Keep | - | Control label |
| `span.cpm-kv__value @1409px` | Insufficient evidence (×2) | Keep | - | Data-state label or error text (constraint) |
| `h3.cpm-gate-tier__label @1446px` | Fusion | Keep | - | Section or page title |
| `span.cpm-kv__label @1469px` | G15 · Decision | Keep | - | Control label |

## response (System Response)

187 visible words, projected 99.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Understand the cause | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `obc-button @109px` | Open loop › | Keep | - | Control label |
| `obc-button @109px` | Change loop | Keep | - | Control label |
| `h1.cpm-title @117px` | System response — Flow controller FIC10401 (FCS0101) | Keep | - | Section or page title |
| `p.cpm-copy @151px` | Site zone UTC. Every event is listed with its state and reason; the selection is explicit… | Shorten | Site zone UTC | Time zone stays; the rest is method |
| `span @208px` | Flow controller FIC10401 (FCS0101) | Keep | - | Short label or value |
| `span.cpm-loop-context__muted @208px` | FIC · criticality medium | Keep | - | Short label or value |
| `span @208px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Keep | - | Loop identity: the only location on this page (guide p.13) |
| `span.cpm-loop-context__label @209px` | Loop | Keep | - | Control label |
| `span.cpm-loop-context__label @209px` | Location | Keep | - | Control label |
| `span @231px` | No response event selected | Keep | - | State or row content |
| `span.cpm-loop-context__label @232px` | Period | Keep | - | Control label |
| `span.cpm-field__label @293px` | Site | Keep | - | Control label |
| `span.cpm-field__label @293px` | Area | Keep | - | Control label |
| `span.cpm-field__label @293px` | Unit | Keep | - | Control label |
| `label.cpm-field__label @366px` | Control loop | Keep | - | Control label |
| `span.cpm-sr-only @424px` | Clear the selected loop | Keep | - | Control label |
| `span.cpm-sr-only @424px` | Open the loop list | Keep | - | Control label |
| `span.cpm-combo__hint @441px` | 243 loop(s) in scope | Keep | - | Population or coverage (constraint) |
| `span.cpm-eyebrow @509px` | Events | Keep | - | Short label or value |
| `h3 @525px` | No response events for this loop | Keep | - | Section or page title |
| `h2.cpm-panel-title @530px` | Response events (0) | Keep | - | Section or page title |
| `p @555px` | Events are captured from qualifying setpoint or output changes; none qualified in the ret… | Shorten | No qualifying event in the retained period. 294 candidates censored. | Guide p.7: empty state explains and offers a reset; the method moves to help |
| `aside.cpm-surface @564px` | Show 294 censored candidate s | Keep | - | Control label |
| `p.cpm-copy @612px` | No complete response event yet - the 294 captured candidates were censored (superseded by… | Shorten | No complete response event: 294 candidates censored. | Guide p.7: keep the state, drop the method |
| `a.cpm-link @647px` | Step-test settings (Gate Configuration › G12) › | Keep | - | Control label |
| `a.cpm-link @676px` | Setpoint changes in Historical › | Shorten | In Historical › | Link label repeats the row label |
| `h3 @777px` | No system model for this loop | Keep | - | Section or page title |
| `p @808px` | A model is estimated from an accepted response event (a qualifying setpoint or output ste… | Shorten | No model yet: needs an accepted response event. | Guide p.7: empty state explains; the method moves to help |

## explorer-relationships (Loop Explorer: Relationships)

178 visible words, projected 145.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Check a loop | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `h1.cpm-title @117px` | Loop explorer | Keep | - | Section or page title |
| `p.cpm-copy @151px` | One loop's current condition, trend and gate results. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | Flow controller FIC10401 (FCS0101) (×2) | Keep | - | Short label or value |
| `span.cpm-loop-context__muted @187px` | FIC · criticality medium | Keep | - | Short label or value |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: Explorer shows t… |
| `span.cpm-loop-context__label @188px` | Loop | Keep | - | Control label |
| `span.cpm-loop-context__label @188px` | Location | Keep | - | Control label |
| `span @210px` | Gates: latest 12h fused window · trend: last 8 h | Keep | - | State or row content |
| `span.cpm-loop-context__label @211px` | Period | Keep | - | Control label |
| `span.cpm-field__label @255px` | Site | Keep | - | Control label |
| `span.cpm-field__label @255px` | Area | Keep | - | Control label |
| `span.cpm-field__label @255px` | Unit | Keep | - | Control label |
| `span.cpm-copy @292px` | 243 of 243 loop(s) in scope | Keep | - | Population or coverage (constraint) |
| `span @349px` | HDPE | Keep | - | Short label or value |
| `span @349px` | Section 600 | Keep | - | Short label or value |
| `span @349px` | U6002 pellet homogenization II silo 4/5 | Keep | - | State or row content |
| `span.cpm-sr-only @376px` | Expand loop list | Keep | - | Control label |
| `span.cpm-head-pills @393px` | Not configured · not checked | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-facet__caption @394px` | Instrument health | Keep | - | Control label |
| `span.cpm-eyebrow @443px` | Loop summary · latest 12h evaluated window | Shorten | Latest 12h window | Window label stays; repeats "Loop" |
| `h2.cpm-loop-summary__condition @464px` | Not evaluated: not enough data | Keep | - | Data-state label or error text (constraint) |
| `p.cpm-loop-summary__note @504px` | The newest window has no verdict. Last verdict: Oscillation confirmed , window ending 6 O… | Keep | - | Timestamp, time zone or age (constraint) |
| `p.cpm-loop-summary__next-text @553px` | Check that the loop’s signals are arriving: the Window Inspector shows the samples each w… | Shorten | Check signal arrival in Window Inspector | Keep the next step |
| `obc-button @562px` | Open Window Inspector › | Keep | - | Control label |
| `obc-button @562px` | Show on trend › | Keep | - | Control label |
| `obc-button @562px` | Calculation proof › Workbench | Keep | - | Control label |
| `span.cpm-loop-summary__label @564px` | Next check | Keep | - | Control label |
| `div.title @618px` | Basis and limitations | Keep | - | Section or page title |
| `p.cpm-collapsible__summary @653px` | 3 limitation(s) · 1,574 samples | Keep | - | Short label or value |
| `strong @707px` | Not producing verdicts | Keep | - | Control label |
| `span.cpm-event-row__sub @709px` | 3 to fix · 1 blocking | Keep | - | Control label |
| `div.title @764px` | Summary | Keep | - | Section or page title |
| `div.title @764px` | Signals | Keep | - | Section or page title |
| `div.title @764px` | Calculations | Keep | - | Section or page title |
| `div.title @764px` | Relationships | Keep | - | Section or page title |
| `div.title @764px` | History | Keep | - | Section or page title |
| `span.cpm-eyebrow @815px` | Lineage | Keep | - | Short label or value |
| `h2.cpm-panel-title @836px` | Source → loop → calculations → outputs | Keep | - | Source or version (constraint) |
| `strong @881px` | UNS signals | Keep | - | Short label or value |
| `strong @881px` | CPLM pack | Keep | - | Short label or value |
| `strong @881px` | Evidence | Keep | - | Short label or value |
| `span.cpm-event-row__sub @903px` | PV · SP · OP · MODE | Keep | - | State or row content |
| `span.cpm-event-row__sub @903px` | FIC · medium | Keep | - | Short label or value |
| `span.cpm-event-row__sub @903px` | 17 gates (17 observed) · CplmGateFusionEngine (Flink) | Keep | - | State or row content |
| `span.cpm-event-row__sub @903px` | Gate results · event frames · KPI series · calc 3.0.0 | Keep | - | Source or version (constraint) |
| `span.cpm-eyebrow @948px` | Peer topology (G13) | Keep | - | Short label or value |
| `h2.cpm-panel-title @970px` | Loop links | Keep | - | Section or page title |
| `h3 @1036px` | No peer links | Keep | - | Section or page title |
| `p @1066px` | Create asset relationships, then republish evidence — G13 cannot evaluate without them. | Shorten | Needs asset relationships (G13). | Keep the action, drop the sequence |
| `obc-button @1107px` | Open in Loop Registry | Keep | - | Control label |

## historical (Historical)

172 visible words, projected 145.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Check a loop | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `h1.cpm-title @117px` | Historical | Keep | - | Section or page title |
| `p.cpm-copy @151px` | A loop's signals, KPIs, mode and verdicts over a past period. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | Flow controller FIC10401 (FCS0101) | Keep | - | Short label or value |
| `span.cpm-loop-context__muted @187px` | FIC · criticality medium | Keep | - | Short label or value |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Keep | - | Loop identity: the only location on this page (guide p.13) |
| `span.cpm-loop-context__label @188px` | Loop (×2) | Keep | - | Control label |
| `span.cpm-loop-context__label @188px` | Location | Keep | - | Control label |
| `span @210px` | Historical range · 1 Nov 14:34 → 4 Nov 14:34 GST | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-loop-context__label @211px` | Period | Keep | - | Control label |
| `span.cpm-field__label @285px` | Site | Keep | - | Control label |
| `span.cpm-field__label @285px` | Area | Keep | - | Control label |
| `span.cpm-field__label @285px` | Unit | Keep | - | Control label |
| `span.cpm-hist-row__label @306px` | Scope | Keep | - | Control label |
| `span.cpm-copy @322px` | 243 of 243 loops | Keep | - | Population or coverage (constraint) |
| `label.cpm-field__label @371px` | Control loop | Keep | - | Control label |
| `span.cpm-sr-only @429px` | Clear the selected loop | Keep | - | Control label |
| `span.cpm-sr-only @429px` | Open the loop list | Keep | - | Control label |
| `span.cpm-combo__hint @446px` | 243 loop(s) in scope | Keep | - | Population or coverage (constraint) |
| `span @467px` | Signal samples (CSV) | Keep | - | Control label |
| `span @479px` | Evaluated windows (CSV) | Keep | - | Control label |
| `span @479px` | Windows (JSON) | Keep | - | Control label |
| `span @479px` | Evidence package (selected window) | Keep | - | Control label |
| `span.cpm-hist-note @484px` | No evaluated windows in this range: widen the range to export windows or a package. | Keep | - | State or row content |
| `obc-toggle-button-option @573px` | Custom | Keep | - | Short label or value |
| `obc-button @573px` | Now | Keep | - | Control label |
| `span.cpm-hist-stepper__text @574px` | 01 Nov, 14:34 → 04 Nov, 14:34 | Keep | - | Short label or value |
| `span.cpm-hist-row__label @608px` | Range | Keep | - | Control label |
| `span.cpm-field__label @617px` | From | Keep | - | Control label |
| `span.cpm-field__label @617px` | To | Keep | - | Control label |
| `obc-button @645px` | Apply | Keep | - | Control label |
| `span.cpm-field__label @709px` | KPI overlay | Keep | - | Control label |
| `span.cpm-hist-row__label @731px` | View | Keep | - | Control label |
| `obc-button @736px` | Open in Trend › | Keep | - | Control label |
| `span.cpm-pen-chip__label @745px` | PV | Keep | - | Control label |
| `span.cpm-pen-chip__label @745px` | SP | Keep | - | Control label |
| `span.cpm-pen-chip__label @745px` | OP | Keep | - | Control label |
| `span.cpm-pen-chip__label @745px` | VP | Keep | - | Control label |
| `span.cpm-pen-chip__note @745px` | unmapped | Keep | - | Control label |
| `span.cpm-pen-chip__label @745px` | Normalise | Keep | - | Control label |
| `span.cpm-sr-only @754px` | Process variable | Keep | - | Control label |
| `span.cpm-sr-only @754px` | Setpoint | Keep | - | Control label |
| `span.cpm-sr-only @754px` | Controller output | Keep | - | Control label |
| `span.cpm-sr-only @754px` | Valve position , not mapped in the registry | Keep | - | Data-state label or error text (constraint) |
| `p.cpm-hist-note @792px` | historian series at root.site1.cpm.FIC10401 · PV keeps its min–max envelope | Keep | - | Source or version (constraint) |
| `span.cpm-eyebrow @837px` | One time axis | Keep | - | Short label or value |
| `h2.cpm-panel-title @858px` | Signals, overlay, mode and verdict | Keep | - | Section or page title |
| `span.cpm-hist-note @861px` | 0 evaluated window(s) · click a verdict band to inspect | Shorten | 0 evaluated windows | Prompt 6.2: "Click to view" affordance on a clickable item |
| `obc-button @1385px` | Zoom area | Keep | - | Control label |
| `obc-button @1385px` | Undo | Keep | - | Control label |
| `obc-button @1385px` | Reset | Keep | - | Control label |
| `span.cpm-eyebrow @1489px` | Selected period | Keep | - | Short label or value |
| `h2.cpm-panel-title @1511px` | Nothing to inspect in this range | Keep | - | Section or page title |
| `h3 @1577px` | This loop completed no 12h windows in this range | Keep | - | Section or page title |
| `p @1607px` | Fused verdicts exist only where a full evaluation window closed. | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `obc-button @1648px` | Widen to 30 days | Keep | - | Control label |

## explorer-history (Loop Explorer: History)

155 visible words, projected 128.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Check a loop | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `h1.cpm-title @117px` | Loop explorer | Keep | - | Section or page title |
| `p.cpm-copy @151px` | One loop's current condition, trend and gate results. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | Flow controller FIC10401 (FCS0101) (×2) | Keep | - | Short label or value |
| `span.cpm-loop-context__muted @187px` | FIC · criticality medium | Keep | - | Short label or value |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: Explorer shows t… |
| `span.cpm-loop-context__label @188px` | Loop | Keep | - | Control label |
| `span.cpm-loop-context__label @188px` | Location | Keep | - | Control label |
| `span @210px` | Gates: latest 12h fused window · trend: last 8 h | Keep | - | State or row content |
| `span.cpm-loop-context__label @211px` | Period | Keep | - | Control label |
| `span.cpm-field__label @255px` | Site | Keep | - | Control label |
| `span.cpm-field__label @255px` | Area | Keep | - | Control label |
| `span.cpm-field__label @255px` | Unit | Keep | - | Control label |
| `span.cpm-copy @292px` | 243 of 243 loop(s) in scope | Keep | - | Population or coverage (constraint) |
| `span @349px` | HDPE | Keep | - | Short label or value |
| `span @349px` | Section 600 | Keep | - | Short label or value |
| `span @349px` | U6002 pellet homogenization II silo 4/5 | Keep | - | State or row content |
| `span.cpm-sr-only @376px` | Expand loop list | Keep | - | Control label |
| `span.cpm-head-pills @393px` | Not configured · not checked | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-facet__caption @394px` | Instrument health | Keep | - | Control label |
| `span.cpm-eyebrow @443px` | Loop summary · latest 12h evaluated window | Shorten | Latest 12h window | Window label stays; repeats "Loop" |
| `h2.cpm-loop-summary__condition @464px` | Not evaluated: not enough data | Keep | - | Data-state label or error text (constraint) |
| `p.cpm-loop-summary__note @504px` | The newest window has no verdict. Last verdict: Oscillation confirmed , window ending 6 O… | Keep | - | Timestamp, time zone or age (constraint) |
| `p.cpm-loop-summary__next-text @553px` | Check that the loop’s signals are arriving: the Window Inspector shows the samples each w… | Shorten | Check signal arrival in Window Inspector | Keep the next step |
| `obc-button @562px` | Open Window Inspector › | Keep | - | Control label |
| `obc-button @562px` | Show on trend › | Keep | - | Control label |
| `obc-button @562px` | Calculation proof › Workbench | Keep | - | Control label |
| `span.cpm-loop-summary__label @564px` | Next check | Keep | - | Control label |
| `div.title @618px` | Basis and limitations | Keep | - | Section or page title |
| `p.cpm-collapsible__summary @653px` | 3 limitation(s) · 1,574 samples | Keep | - | Short label or value |
| `strong @707px` | Not producing verdicts | Keep | - | Control label |
| `span.cpm-event-row__sub @709px` | 3 to fix · 1 blocking | Keep | - | Control label |
| `div.title @764px` | Summary | Keep | - | Section or page title |
| `div.title @764px` | Signals | Keep | - | Section or page title |
| `div.title @764px` | Calculations | Keep | - | Section or page title |
| `div.title @764px` | Relationships | Keep | - | Section or page title |
| `div.title @764px` | History | Keep | - | Section or page title |
| `span.cpm-event-row__title @826px` | Oscillation confirmed | Keep | - | Section or page title |
| `span.cpm-pill @835px` | UNACKNOWLEDGED | Keep | - | Control label |
| `span.cpm-event-row__sub @836px` | 05/10/2026, 11:45:00 GST · open | Keep | - | Timestamp, time zone or age (constraint) |
| `span.cpm-event-row__sub @848px` | 2 episodes · 3 × 12h/24h window(s) · peak evidence score 100 (×2) | Keep | - | Control label |
| `div.cpm-episode @877px` | ▸ 2 episodes (×2) | Keep | - | Control label |
| `span.cpm-event-row__title @915px` | Valve nonlinearity (stiction) suspected | Keep | - | Section or page title |
| `span.cpm-pill @925px` | ACKNOWLEDGED | Keep | - | Control label |
| `span.cpm-event-row__sub @926px` | 01/09/2026, 4:15:00 GST → 05/10/2026, 11:30:00 GST | Keep | - | Timestamp, time zone or age (constraint) |

## config-bundles (Engineering: Bundles)

144 visible words, projected 124.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Set up · Gate configuration | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `h1.cpm-title @117px` | FIC10401 · Flow controller FIC10401 (FCS0101) | Keep | - | Section or page title |
| `p.cpm-copy @151px` | What this loop runs under today, the bundles at its three levels, and the editor for one … | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the view tabs na… |
| `span.cpm-fact__label @220px` | runs under | Keep | - | Control label |
| `span.cpm-pill @220px` | NO_ACTIVE_BUNDLE · factory layer | Keep | - | Short label or value |
| `span.cpm-fact__label @220px` | profile | Keep | - | Control label |
| `span.cpm-fact__value @220px` | FLOW_FAST_SELF_REG (×2) | Keep | - | Short label or value |
| `span.cpm-fact__label @220px` | workers | Keep | - | Control label |
| `span.cpm-pill @220px` | 5 workers on one jar dabe1862 · factory layer (nothing to acknowledge) | Keep | - | State or row content |
| `span.cpm-fact__value @248px` | 8bbcbbbb | Keep | - | Short label or value |
| `span.cpm-fact__label @249px` | catalogue | Keep | - | Control label |
| `span.cpm-field__label @310px` | Site | Keep | - | Control label |
| `span.cpm-field__label @310px` | Area | Keep | - | Control label |
| `span.cpm-field__label @310px` | Unit | Keep | - | Control label |
| `label.cpm-field__label @383px` | Control loop | Keep | - | Control label |
| `span.cpm-sr-only @441px` | Clear the selected loop | Keep | - | Control label |
| `span.cpm-sr-only @441px` | Open the loop list | Keep | - | Control label |
| `span.cpm-combo__hint @458px` | 243 loop(s) in scope | Keep | - | Population or coverage (constraint) |
| `div.title @534px` | Effective | Keep | - | Section or page title |
| `div.title @534px` | Bundles | Keep | - | Section or page title |
| `span.cpm-eyebrow @606px` | Bundles | Keep | - | Short label or value |
| `h2.cpm-panel-title @627px` | The three levels of this loop | Keep | - | Section or page title |
| `span.cpm-copy @628px` | the most specific active level wins | Keep | - | State or row content |
| `span.cpm-config-level__kind @672px` | LOOP | Keep | - | Short label or value |
| `span.cpm-event-row__sub @672px` | Overrides the profile for this loop only. | Keep | - | State or row content |
| `p.cpm-copy @700px` | no bundle at this level - the layer below applies (×3) | Keep | - | State or row content |
| `obc-button @741px` | New draft (×3) | Keep | - | Control label |
| `span.cpm-config-level__kind @811px` | PROFILE | Keep | - | Short label or value |
| `span.cpm-event-row__sub @811px` | Every loop of this class pack that has no LOOP bundle. | Keep | - | State or row content |
| `span.cpm-mono @948px` | hdpe | Keep | - | Short label or value |
| `span.cpm-config-level__kind @949px` | SITE | Keep | - | Short label or value |
| `span.cpm-event-row__sub @949px` | Every loop of the site without a PROFILE or LOOP bundle. | Keep | - | State or row content |

## explorer-signals (Loop Explorer: Signals)

142 visible words, projected 115.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Check a loop | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `h1.cpm-title @117px` | Loop explorer | Keep | - | Section or page title |
| `p.cpm-copy @151px` | One loop's current condition, trend and gate results. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | Flow controller FIC10401 (FCS0101) (×2) | Keep | - | Short label or value |
| `span.cpm-loop-context__muted @187px` | FIC · criticality medium | Keep | - | Short label or value |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: Explorer shows t… |
| `span.cpm-loop-context__label @188px` | Loop | Keep | - | Control label |
| `span.cpm-loop-context__label @188px` | Location | Keep | - | Control label |
| `span @210px` | Gates: latest 12h fused window · trend: last 8 h | Keep | - | State or row content |
| `span.cpm-loop-context__label @211px` | Period | Keep | - | Control label |
| `span.cpm-field__label @255px` | Site | Keep | - | Control label |
| `span.cpm-field__label @255px` | Area | Keep | - | Control label |
| `span.cpm-field__label @255px` | Unit | Keep | - | Control label |
| `span.cpm-copy @292px` | 243 of 243 loop(s) in scope | Keep | - | Population or coverage (constraint) |
| `span @349px` | HDPE | Keep | - | Short label or value |
| `span @349px` | Section 600 | Keep | - | Short label or value |
| `span @349px` | U6002 pellet homogenization II silo 4/5 | Keep | - | State or row content |
| `span.cpm-sr-only @376px` | Expand loop list | Keep | - | Control label |
| `span.cpm-head-pills @393px` | Not configured · not checked | Keep | - | Data-state label or error text (constraint) |
| `span.cpm-facet__caption @394px` | Instrument health | Keep | - | Control label |
| `span.cpm-eyebrow @443px` | Loop summary · latest 12h evaluated window | Shorten | Latest 12h window | Window label stays; repeats "Loop" |
| `h2.cpm-loop-summary__condition @464px` | Not evaluated: not enough data | Keep | - | Data-state label or error text (constraint) |
| `p.cpm-loop-summary__note @504px` | The newest window has no verdict. Last verdict: Oscillation confirmed , window ending 6 O… | Keep | - | Timestamp, time zone or age (constraint) |
| `p.cpm-loop-summary__next-text @553px` | Check that the loop’s signals are arriving: the Window Inspector shows the samples each w… | Shorten | Check signal arrival in Window Inspector | Keep the next step |
| `obc-button @562px` | Open Window Inspector › | Keep | - | Control label |
| `obc-button @562px` | Show on trend › | Keep | - | Control label |
| `obc-button @562px` | Calculation proof › Workbench | Keep | - | Control label |
| `span.cpm-loop-summary__label @564px` | Next check | Keep | - | Control label |
| `div.title @618px` | Basis and limitations | Keep | - | Section or page title |
| `p.cpm-collapsible__summary @653px` | 3 limitation(s) · 1,574 samples | Keep | - | Short label or value |
| `div.title @710px` | Summary | Keep | - | Section or page title |
| `div.title @710px` | Signals | Keep | - | Section or page title |
| `div.title @710px` | Calculations | Keep | - | Section or page title |
| `div.title @710px` | Relationships | Keep | - | Section or page title |
| `div.title @710px` | History | Keep | - | Section or page title |
| `span.cpm-eyebrow @761px` | Signal mappings | Keep | - | Short label or value |
| `span.cpm-copy @781px` | Asset-model binding | Keep | - | Short label or value |
| `span.cpm-pill @781px` | UNCHECKED | Keep | - | Short label or value |
| `h2.cpm-panel-title @783px` | 4 role(s) mapped | Keep | - | Section or page title |
| `obc-button @829px` | Open signals in Trend › | Keep | - | Control label |
| `th @879px` | Role | Keep | - | Column label |
| `th @879px` | Meaning | Keep | - | Column label |
| `th @879px` | UNS path | Keep | - | Column label |
| `th @912px` | PV | Keep | - | Column label |
| `th @946px` | SP | Keep | - | Column label |
| `th @981px` | OP | Keep | - | Column label |
| `th @1016px` | MODE | Keep | - | Column label |

## config-effective (Engineering: Effective)

142 visible words, projected 111.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Set up · Gate configuration | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `h1.cpm-title @117px` | FIC10401 · Flow controller FIC10401 (FCS0101) | Keep | - | Section or page title |
| `p.cpm-copy @151px` | What this loop runs under today, the bundles at its three levels, and the editor for one … | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the view tabs na… |
| `span.cpm-fact__label @220px` | runs under | Keep | - | Control label |
| `span.cpm-pill @220px` | NO_ACTIVE_BUNDLE · factory layer | Keep | - | Short label or value |
| `span.cpm-fact__label @220px` | profile | Keep | - | Control label |
| `span.cpm-fact__value @220px` | FLOW_FAST_SELF_REG (×2) | Keep | - | Short label or value |
| `span.cpm-fact__label @220px` | workers | Keep | - | Control label |
| `span.cpm-pill @220px` | 5 workers on one jar dabe1862 · factory layer (nothing to acknowledge) (×2) | Keep | - | State or row content |
| `span.cpm-fact__value @248px` | 8bbcbbbb | Keep | - | Short label or value |
| `span.cpm-fact__label @249px` | catalogue | Keep | - | Control label |
| `span.cpm-field__label @310px` | Site | Keep | - | Control label |
| `span.cpm-field__label @310px` | Area | Keep | - | Control label |
| `span.cpm-field__label @310px` | Unit | Keep | - | Control label |
| `label.cpm-field__label @383px` | Control loop | Keep | - | Control label |
| `span.cpm-sr-only @441px` | Clear the selected loop | Keep | - | Control label |
| `span.cpm-sr-only @441px` | Open the loop list | Keep | - | Control label |
| `span.cpm-combo__hint @458px` | 243 loop(s) in scope | Keep | - | Population or coverage (constraint) |
| `div.title @534px` | Effective | Keep | - | Section or page title |
| `div.title @534px` | Bundles | Keep | - | Section or page title |
| `p.cpm-copy @607px` | no governed bundle is active for this loop: the engine runs the factory layer (class pack… | Keep | - | Source or version (constraint) |
| `span.cpm-eyebrow @656px` | How the values resolve | Keep | - | State or row content |
| `h2.cpm-panel-title @677px` | Layer stack | Keep | - | Section or page title |
| `span.cpm-copy @678px` | a layer above sets a property, or leaves the one below | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `span.cpm-config-layer__kind @727px` | FACTORY | Keep | - | Short label or value |
| `span.cpm-config-layer__kind @727px` | PROFILE | Keep | - | Short label or value |
| `span.cpm-config-layer__kind @727px` | SITE | Keep | - | Short label or value |
| `span.cpm-config-layer__kind @727px` | LOOP | Keep | - | Short label or value |
| `span.cpm-config-layer__ref @748px` | shipped | Keep | - | Short label or value |
| `span.cpm-config-layer__ref @748px` | hdpe | Keep | - | Short label or value |
| `span.cpm-config-layer__count @769px` | 57 properties | Keep | - | Short label or value |
| `span.cpm-config-layer__count @769px` | 48 overrides | Keep | - | Short label or value |
| `span.cpm-event-row__sub @790px` | shipped defaults | Keep | - | Short label or value |
| `span.cpm-event-row__sub @790px` | class pack | Keep | - | Short label or value |
| `span.cpm-event-row__sub @790px` | no bundle (×2) | Keep | - | Short label or value |
| `button.cpm-config-gate @836px` | G2r 2 | Keep | - | Control label |
| `span.cpm-field__label @904px` | Find a property | Keep | - | Control label |
| `th @979px` | property | Keep | - | Column label |
| `th @979px` | value | Keep | - | Column label |
| `th @979px` | from | Keep | - | Column label |
| `th @979px` | class | Keep | - | Column label |
| `span.cpm-event-row__sub @1596px` | APPLY acknowledgements | Keep | - | Short label or value |
| `th @1630px` | job | Keep | - | Column label |
| `th @1630px` | jar | Keep | - | Column label |
| `th @1630px` | catalogue | Keep | - | Column label |
| `th @1630px` | applied | Keep | - | Column label |

## admin-roles (Admin: Roles)

131 visible words, projected 107.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `h1 @81px` | System Administration | Keep | - | Section or page title |
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |
| `a @177px` | User Management | Keep | - | Control label |
| `a @177px` | Roles & Permissions | Keep | - | Control label |
| `a @177px` | Data Sources | Keep | - | Source or version (constraint) |
| `a @177px` | Plant Model | Keep | - | Control label |
| `a @177px` | Tag Aliases | Keep | - | Control label |
| `a @177px` | Audit Log | Keep | - | Control label |
| `a @177px` | System Settings | Keep | - | Control label |
| `h2 @257px` | Roles & Permissions | Keep | - | Section or page title |
| `obc-button @270px` | + New custom role | Keep | - | Control label |
| `p @287px` | Assign permissions to roles. Editing a role takes effect for its users on their next requ… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `button @331px` | Admin | Keep | - | Control label |
| `span @333px` | SYSTEM (×5) | Keep | - | Control label |
| `div @337px` | 25 selected | Keep | - | Short label or value |
| `div @338px` | Admin system role — protected, permissions editable | Keep | - | State or row content |
| `button @367px` | Engineer | Keep | - | Control label |
| `button @403px` | Operator | Keep | - | Control label |
| `button @439px` | SuperAdmin | Keep | - | Control label |
| `span @439px` | admin | Keep | - | Short label or value |
| `span @439px` | alarm | Keep | - | Short label or value |
| `button @442px` | All (×4) | Keep | - | Control label |
| `button @442px` | Clear (×9) | Keep | - | Control label |
| `button @475px` | Viewer | Keep | - | Control label |
| `span @484px` | admin.audit.view | Keep | - | Control label |
| `span @484px` | alarm.acknowledge | Keep | - | Control label |
| `span @542px` | admin.users.edit | Keep | - | Control label |
| `span @542px` | alarm.acknowledge_batch | Keep | - | Control label |
| `span @600px` | rbac.manage | Keep | - | Control label |
| `span @600px` | alarm.export | Keep | - | Control label |
| `span @658px` | alarm.shelve | Keep | - | Control label |
| `span @716px` | alarm.suppress | Keep | - | Control label |
| `span @774px` | alarm.unshelve | Keep | - | Control label |
| `span @832px` | alarm.view | Keep | - | Control label |
| `span @911px` | analysis | Keep | - | Short label or value |
| `span @911px` | analytics | Keep | - | Short label or value |
| `span @956px` | analysis.edit | Keep | - | Control label |
| `span @956px` | analytics.view | Keep | - | Control label |
| `span @1014px` | analysis.view | Keep | - | Control label |
| `span @1093px` | asset | Keep | - | Short label or value |
| `span @1093px` | binding | Keep | - | Short label or value |
| `span @1138px` | asset.edit | Keep | - | Control label |
| `span @1138px` | binding.resolve | Keep | - | Control label |
| `span @1196px` | asset.view | Keep | - | Control label |
| `span @1275px` | cpm | Keep | - | Short label or value |
| `span @1275px` | display | Keep | - | Short label or value |
| `span @1320px` | cpm.analysis.create | Keep | - | Control label |
| `span @1320px` | display.edit | Keep | - | Control label |
| `span @1378px` | cpm.config.activate | Keep | - | Control label |
| `span @1378px` | display.publish | Keep | - | Control label |
| `span @1436px` | cpm.config.approve | Keep | - | Control label |
| `span @1436px` | display.view | Keep | - | Control label |
| `span @1494px` | cpm.config.draft | Keep | - | Control label |
| `span @1552px` | cpm.config.read | Keep | - | Control label |
| `span @1610px` | cpm.config.rollback | Keep | - | Control label |
| `span @1668px` | cpm.config.shadow | Keep | - | Control label |
| `span @1726px` | cpm.config.validate | Keep | - | Control label |
| `span @1784px` | cpm.context.manage | Keep | - | Control label |
| `span @1842px` | cpm.manage | Keep | - | Control label |
| `span @1900px` | cpm.model.review | Keep | - | Control label |
| `span @1979px` | historian | Keep | - | Source or version (constraint) |
| `span @1979px` | ingestion | Keep | - | Short label or value |
| `span @2024px` | historian.view | Keep | - | Source or version (constraint) |
| `span @2024px` | ingestion.manage | Keep | - | Control label |
| `span @2082px` | ingestion.view | Keep | - | Control label |
| `span @2161px` | soe | Keep | - | Short label or value |
| `span @2161px` | system | Keep | - | Short label or value |
| `span @2206px` | soe.view | Keep | - | Control label |
| `span @2206px` | system.manage | Keep | - | Control label |
| `span @2285px` | template | Keep | - | Short label or value |
| `span @2330px` | template.edit | Keep | - | Control label |
| `span @2388px` | template.publish | Keep | - | Control label |
| `span @2446px` | template.view | Keep | - | Control label |
| `obc-button @2542px` | Save permissions | Keep | - | Control label |
| `obc-button @2542px` | Reset to default | Keep | - | Control label |

## admin-system (Admin: System Settings)

114 visible words, projected 87.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `h1 @81px` | System Administration | Keep | - | Section or page title |
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |
| `a @177px` | User Management | Keep | - | Control label |
| `a @177px` | Roles & Permissions | Keep | - | Control label |
| `a @177px` | Data Sources | Keep | - | Source or version (constraint) |
| `a @177px` | Plant Model | Keep | - | Control label |
| `a @177px` | Tag Aliases | Keep | - | Control label |
| `a @177px` | Audit Log | Keep | - | Control label |
| `a @177px` | System Settings | Keep | - | Control label |
| `div @269px` | Not functional yet — these settings are not connected to the backend and cannot be saved.… | Keep | - | Honest notice. The page behind it is the finding, see 8.5 |
| `h3 @322px` | Global System Settings | Keep | - | Section or page title |
| `button @329px` | Save unavailable | Keep | - | Data-state label or error text (constraint) |
| `p @349px` | Configure infrastructure retention, UI defaults, and backend logging. | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the page title s… |
| `div @411px` | Data Retention | Keep | - | Short label or value |
| `div @411px` | Infrastructure & Export | Keep | - | Short label or value |
| `div @411px` | UI & Diagnostics | Keep | - | Short label or value |
| `div @433px` | Configure how long alarms and audit records are kept before archiving. | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `div @433px` | Backup path and automated export configuration. | Keep | - | State or row content |
| `div @433px` | Global theme and backend diagnostic log level. | Keep | - | State or row content |
| `span @467px` | Backup Path Volume | Keep | - | Control label |
| `span @467px` | Global Default Theme | Keep | - | Control label |
| `span @485px` | Active Alarm TTL (Days) | Keep | - | Control label |
| `span @538px` | Backend Log Level | Keep | - | Control label |
| `label @553px` | Enable nightly Audit Trail CSV export | Keep | - | Control label |
| `span @556px` | Historical Log Retention (Days) | Keep | - | Control label |

## admin-plant-model (Admin: Plant Model)

110 visible words, projected 68.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `h1 @81px` | System Administration | Keep | - | Section or page title |
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |
| `a @177px` | User Management | Keep | - | Control label |
| `a @177px` | Roles & Permissions | Keep | - | Control label |
| `a @177px` | Data Sources | Keep | - | Source or version (constraint) |
| `a @177px` | Plant Model | Keep | - | Control label |
| `a @177px` | Tag Aliases | Keep | - | Control label |
| `a @177px` | Audit Log | Keep | - | Control label |
| `a @177px` | System Settings | Keep | - | Control label |
| `h3 @257px` | Plant Model | Keep | - | Section or page title |
| `p @284px` | The UNS asset tree — the source of truth every binding, trend, filter and loop location r… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `obc-button @328px` | Import CSV | Keep | - | Control label |
| `obc-button @328px` | + Add Site | Keep | - | Control label |
| `span @390px` | 1 · Hierarchy | Keep | - | Short label or value |
| `span @390px` | 2 · Instruments & tags | Keep | - | Short label or value |
| `span @390px` | 3 · OT aliases | Keep | - | Short label or value |
| `span @390px` | 4 · Control loops | Keep | - | Short label or value |
| `span @390px` | 5 · Ingestion sources | Keep | - | Source or version (constraint) |
| `span @394px` | The onboarding order — each stage feeds the next (docs/plant-model/production-onboarding-… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `span @408px` | 243 (241 monitored) | Keep | - | Population or coverage (constraint) |
| `span @430px` | sites / areas / units | Keep | - | Short label or value |
| `span @430px` | devices / measurements | Keep | - | Short label or value |
| `span @430px` | DCS tag → UNS path | Keep | - | State or row content |
| `span @430px` | CPM → Loop Registry | Keep | - | Short label or value |
| `span @430px` | Administration → Data Sources | Keep | - | Source or version (constraint) |
| `obc-button @546px` | + Area (×3) | Keep | - | Control label |
| `obc-button @546px` | Edit (×3) | Keep | - | Control label |
| `obc-button @546px` | Delete (×3) | Keep | - | Control label |
| `span @547px` | Dallas Terminal | Keep | - | Short label or value |
| `span @549px` | Site (×3) | Keep | - | Short label or value |
| `span @550px` | dallas | Keep | - | Short label or value |
| `span @608px` | HDPE Plant | Keep | - | Short label or value |
| `span @611px` | hdpe | Keep | - | Short label or value |
| `span @669px` | Houston Refinery | Keep | - | Short label or value |
| `span @672px` | houston | Keep | - | Short label or value |

## config (Engineering: overview)

88 visible words, projected 72.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Set up | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `h1.cpm-title @117px` | Gate configuration | Keep | - | Section or page title |
| `p.cpm-copy @151px` | What each loop runs under, the bundles in progress, and the editor for one of them. 165 p… | Shorten | 165 properties · 6 workers announced | Prompt 6.2: repeats text already on the page or in navigation |
| `span.cpm-field__label @225px` | Site | Keep | - | Control label |
| `span.cpm-field__label @225px` | Area | Keep | - | Control label |
| `span.cpm-field__label @225px` | Unit | Keep | - | Control label |
| `label.cpm-field__label @298px` | Control loop | Keep | - | Control label |
| `span.cpm-sr-only @356px` | Open the loop list | Keep | - | Control label |
| `span.cpm-combo__hint @373px` | 243 loop(s) available | Keep | - | Short label or value |
| `span.cpm-eyebrow @441px` | Overview | Keep | - | Short label or value |
| `h2.cpm-panel-title @462px` | Configuration by loop | Keep | - | Section or page title |
| `span.cpm-copy @463px` | 1 of 243 loops run a governed bundle; the rest run the factory layer | Keep | - | Population or coverage (constraint) |
| `span.cpm-field__label @495px` | Find a loop | Keep | - | Control label |
| `span.cpm-filter-count @537px` | 243 loop(s) | Keep | - | Short label or value |
| `th @563px` | loop | Keep | - | Column label |
| `th @563px` | profile | Keep | - | Column label |
| `th @563px` | runs under | Keep | - | Column label |
| `th @563px` | effective from | Keep | - | Column label |
| `span @1660px` | ← Prev | Keep | - | Control label |
| `span @1660px` | Next → | Keep | - | Control label |
| `span.cpm-event-row__sub @1662px` | Page 1 of 13 | Keep | - | Population or coverage (constraint) |
| `span.cpm-eyebrow @1755px` | Lifecycle | Keep | - | Short label or value |
| `span.cpm-copy @1756px` | drafts, validated, shadowed, approved or failed - active and superseded ones live on thei… | Keep | - | Data-state label or error text (constraint) |
| `h2.cpm-panel-title @1776px` | Bundles in progress | Keep | - | Section or page title |
| `th @1815px` | scope | Keep | - | Column label |
| `th @1815px` | version | Keep | - | Source or version (constraint) |
| `th @1815px` | state | Keep | - | Column label |
| `th @1815px` | class | Keep | - | Column label |
| `th @1815px` | updated | Keep | - | Timestamp, time zone or age (constraint) |

## admin-audit (Admin: Audit Log)

79 visible words, projected 54.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `h1 @81px` | System Administration | Keep | - | Section or page title |
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |
| `a @177px` | User Management | Keep | - | Control label |
| `a @177px` | Roles & Permissions | Keep | - | Control label |
| `a @177px` | Data Sources | Keep | - | Source or version (constraint) |
| `a @177px` | Plant Model | Keep | - | Control label |
| `a @177px` | Tag Aliases | Keep | - | Control label |
| `a @177px` | Audit Log | Keep | - | Control label |
| `a @177px` | System Settings | Keep | - | Control label |
| `h3 @257px` | Operational Audit Log | Keep | - | Section or page title |
| `p @284px` | Immutable cryptographically-chained record of all operator and system actions. | Shorten | Chained audit record | Prompt 6.2: claim without a documented basis: "all actions" not established; fa… |
| `span @336px` | Filter by User | Keep | - | Control label |
| `span @336px` | Event Type | Keep | - | Control label |
| `div @358px` | ✓ Verify Cryptographic Chain | Keep | - | Control label |
| `span @439px` | Entries are hash-chained by audit-service. Run a verification to confirm integrity now — … | Shorten | Hash-chained. Run a verification to confirm integrity. | Keep the honest qualifier; it contradicts the "Immutable" line above it |
| `th @501px` | Timestamp | Keep | - | Column label |
| `th @501px` | Event Type | Keep | - | Column label |
| `th @501px` | User | Keep | - | Column label |
| `th @501px` | Entity | Keep | - | Column label |
| `th @501px` | Hash Signature | Keep | - | Column label |
| `th @501px` | Correlation | Keep | - | Column label |
| `obc-button @2154px` | ← Previous | Keep | - | Control label |
| `obc-button @2154px` | Next → | Keep | - | Control label |
| `div @2156px` | Showing 1–25 of 200 (latest) · total records: 4811 | Keep | - | Population or coverage (constraint) |
| `span @2156px` | Page 1 of 8 | Keep | - | Population or coverage (constraint) |

## admin-aliases (Admin: Tag Aliases)

67 visible words, projected 35.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `h1 @81px` | System Administration | Keep | - | Section or page title |
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |
| `a @177px` | User Management | Keep | - | Control label |
| `a @177px` | Roles & Permissions | Keep | - | Control label |
| `a @177px` | Data Sources | Keep | - | Source or version (constraint) |
| `a @177px` | Plant Model | Keep | - | Control label |
| `a @177px` | Tag Aliases | Keep | - | Control label |
| `a @177px` | Audit Log | Keep | - | Control label |
| `a @177px` | System Settings | Keep | - | Control label |
| `h3 @257px` | Tag Aliases | Keep | - | Section or page title |
| `p @284px` | OT/legacy tag → canonical UNS path. Ingestion resolves incoming tag names through this ta… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `obc-button @328px` | Import CSV | Keep | - | Control label |
| `obc-button @328px` | + Add Alias | Keep | - | Control label |
| `th @440px` | Legacy / OT tag | Keep | - | Column label |
| `th @440px` | Canonical UNS path | Keep | - | Column label |
| `th @440px` | Source | Keep | - | Source or version (constraint) |
| `th @440px` | Active | Keep | - | Column label |
| `p @31437px` | Showing 500 of 703 — narrow with search. | Keep | - | Population or coverage (constraint) |

## login (Login)

47 visible words, projected 28.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `h1.login__title @262px` | Traverse Edge | Keep | - | Section or page title |
| `p.login__subtitle @321px` | Control Loop Performance Management | Shorten | Traverse CPA | Guide p.28: one product identity across the shell |
| `p.login__notice @382px` | Authorized use notice: Access is restricted to authorized operators. All sessions, includ… | Shorten | Authorized use only. Access is restricted to authorized operators. | Prompt 6.2: claim without a documented basis: no IEC 62443 assessment found. Th… |
| `label.login__label @475px` | Operator ID | Keep | - | Control label |
| `button.login__submit-fallback @483px` | Sign in | Keep | - | Control label |
| `label.login__label @564px` | Password | Keep | - | Control label |
| `obc-button.login__submit @670px` | Secure sign in | Shorten | Sign in | Prompt 6.2: claim without a documented basis: TLS depends on deployment |
| `span.login__visual-site @906px` | Plant Operations | Keep | - | Short label or value |
| `span.login__visual-system @957px` | Traverse control-loop performance | Shorten | Traverse CPA | Guide p.28: one product identity across the shell |
| `span.login__meta @988px` | Build 1.0.0 | Keep | - | Short label or value |
| `span.login__meta @988px` | Network online | Keep | - | Short label or value |
| `span.login__meta @988px` | 2026-11-04 / 10:31:27 UTC | Keep | - | Timestamp, time zone or age (constraint) |

## admin-users (Admin: Users)

40 visible words, projected 32.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `h1 @81px` | System Administration | Keep | - | Section or page title |
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |
| `a @177px` | User Management | Keep | - | Control label |
| `a @177px` | Roles & Permissions | Keep | - | Control label |
| `a @177px` | Data Sources | Keep | - | Source or version (constraint) |
| `a @177px` | Plant Model | Keep | - | Control label |
| `a @177px` | Tag Aliases | Keep | - | Control label |
| `a @177px` | Audit Log | Keep | - | Control label |
| `a @177px` | System Settings | Keep | - | Control label |
| `h2 @257px` | User Management | Keep | - | Section or page title |
| `obc-button @269px` | Bulk import | Keep | - | Control label |
| `obc-button @269px` | Add user | Keep | - | Control label |
| `p @287px` | 20 users · 20 active · 0 inactive | Keep | - | Short label or value |
| `th @380px` | Username | Keep | - | Column label |
| `th @380px` | Full name | Keep | - | Column label |
| `th @380px` | Email | Keep | - | Column label |
| `th @380px` | Role | Keep | - | Column label |
| `th @380px` | Status | Keep | - | Column label |
| `th @380px` | Created | Keep | - | Column label |

## trend (Trend)

17 visible words, projected 17.

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `obc-button @105px` | Apply window | Keep | - | Control label |
| `span.trend-page__title @106px` | Trend | Keep | - | Section or page title |
| `span @107px` | From | Keep | - | Control label |
| `span @107px` | To | Keep | - | Control label |
| `span.trend-core__clock @109px` | LIVE (×2) | Keep | - | Short label or value |
| `span.trend-core__clock @109px` | 3 pen s | Keep | - | Short label or value |
| `span.trend-core__pen-label @154px` | fic10401.pv | Keep | - | Short label or value |
| `span.trend-core__pen-label @154px` | fic10401.sp | Keep | - | Short label or value |
| `span.trend-core__pen-label @154px` | fic10401.op | Keep | - | Short label or value |
| `obc-button @956px` | Zoom area | Keep | - | Control label |
| `obc-button @956px` | Undo | Keep | - | Control label |
| `obc-button @956px` | Reset | Keep | - | Control label |
| `button.trend-core__rbtn @961px` | Now | Keep | - | Control label |

