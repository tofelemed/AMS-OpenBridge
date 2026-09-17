# v2.5 frontend audit — 2026-09-17

**Question asked:** is everything v2.5 built actually reachable and shown with a proper flow in the
frontend, and are the new pages (Evidence Workbench, System Response, Gate Configuration) fit for
use? **Method:** (1) static wiring check of every v2.5 UI deliverable against routes, navigation,
permissions and the APIs they call; (2) a rendered audit of every Loop Performance page on the lab
with a real browser (`scripts/validation/ui-v25-audit.mjs`, `ui-v25-probe.mjs`, `ui-v25-gates.mjs`:
login as admin, walk each page, screenshot, collect console errors / failed requests / headings /
empty states, and drive the three flows Performance → cell → workbench, Response → event, Config →
bundle; then every one of the 17 gate views of one fused window). Lab state: images from
`1cc8a8b4`, jar `4ea1da78`, OT sim on the pilot loops. Screenshots are in the session scratchpad
(`ui-audit-tall/`); the scripts are committed so the run can be repeated.

## 1. Verdict

- **Every page renders with zero console errors and zero failed API calls** (18 pages, 3 flows).
- **Three real defects hid or broke the new work**, all found by rendering, none by the unit or E2E
  suites (they test APIs and components, not the assembled chrome):
  1. The three v2.5 pages were **missing from the sidebar and the command palette** — the Marun
     product-slice whitelist (`productSlice.ts` `SLICE_NAV`) was never extended; the routes worked
     only by typed URL. **Fixed** (+ `productSlice.test.ts` pins every nav path).
  2. **"Overview" was highlighted on every `/cpm/*` page** (two active entries): the active-path
     test matched the group root by prefix. **Fixed** (longest matching path wins).
  3. **The G7 waveform view crashed the whole workbench** ("Something went wrong on this page —
     id duplicates: y") on any window with more than one accepted cycle: twelve overlay series
     shared the echarts id `y`. **Fixed** (+ test with three accepted cycles).
- **The main entry into the workbench is dead on the lab**: Performance → any cell → *Open in
  workbench* is disabled for the whole fleet, because the page's "latest 24h window" is the newest
  row **with a real verdict** (a 2 September, pre-v2.5 row without run ids) while the actual newest
  windows (today, `INSUFFICIENT_DATA`, with run ids) are not offered. This is a data-flow decision,
  not a bug in one line (§3, F4).
- The three new pages are **functionally complete but not yet usable as designed products**:
  raw identifiers, unformatted numbers, empty centre columns while loading, dead-end landing
  states, misleading state copy, overflowing panels. §4 is the redesign proposal.

## 2. What is wired and reachable (static check)

| Deliverable | Route / place | Reachable from nav or a link | Data path verified |
|---|---|---|---|
| Governance: build identity, approvals queue | `/cpm/governance` | nav | `/capabilities`, `/configuration/drafts` — renders |
| Transmitter health pill + drawer | Loop Explorer header | nav → loop | `/instrument-health` — `HEALTH NOT CONFIGURED` shown for an unbound loop |
| Fleet health filter chips | Performance | nav | `?health=` server-side — chips render |
| Events: condition + availability pills | `/cpm/events` | nav | renders |
| Evidence Workbench (17 views) | `/cpm/evidence?loop&methodRun&gate` | **was hidden** → fixed; launcher from Performance cell (disabled on legacy rows), Investigation, Response (G12) | manifest + chunks; 12 of 17 views draw; G7 crashed → fixed; G0/G2r "pending" (policy), G1–G4 `NOT_EVALUATED` on a 24h row (§3 F8) |
| System Response | `/cpm/response?loop&event` | **was hidden** → fixed; from the G12 view | events, detail, manifest, 12 artifacts — charts render after ~6–10 s with no loading state (F5) |
| Gate Configuration | `/cpm/config` | **was hidden** → fixed; perm `cpm.config.read` | bundles, properties, lifecycle, deployments, ACK matrix render |
| Effective configuration drawer | Gate Configuration "Show effective"; workbench Method trace | yes | renders |
| Registry Classification step | Loop Registry → Add loop | nav | renders (registry list shows the classification source) |
| Historical: two axes, provenance tooltip, health lane | `/cpm/historical` | nav | renders |
| Investigation: server hypotheses, contradictions | `/cpm/investigation` | nav | renders; says "not served (pre-v2.5 result)" on legacy rows |

API-only (no page, stated in `WHATS-NEW-v2.5.md`): fast conditions, instrument bindings,
controller snapshots, investigation references, analysis-run creation, evidence pinning.

## 3. Findings (ranked)

**Fixed in this audit (commit follows):**

| # | Finding | Where | Fix |
|---|---|---|---|
| F1 | v2.5 pages absent from sidebar + palette | `productSlice.ts` | added to `SLICE_NAV`; `productSlice.test.ts` |
| F2 | two active nav entries on every `/cpm/*` page | `App.tsx` `Sidebar` | longest matching path is the one active entry |
| F3 | G7 view crashes the page (`id duplicates: y`) | `evidence/views/LongViews.tsx` | one series id per cycle; test |

**Need a design decision (proposed in §4):**

| # | Finding | Evidence | Proposal |
|---|---|---|---|
| F4 | "Latest 24h window" is the newest row **with a verdict**; when a loop's recent windows are `INSUFFICIENT_DATA`/`EXCLUDED` the page shows a stale verdict as current (lab: 2 Sept shown on 17 Sept, "emitted 09/09") and the workbench launcher is disabled because that row predates v2.5. On the plant the same happens after any data outage. | `FleetLatestSql.cs`, `GateReadSql.cs` ("newest REAL verdict, else newest row"); `flow-inspector.png` | the fleet/latest reads return **both** the last verdict and the newest evaluated window; the matrix shows the newest window's state with the verdict's **age** ("verdict 15 d old · newest window 08:00 INSUFFICIENT_SAMPLES"); *Open in workbench* opens the newest window's run (it has ids), with "last verdict's run" as the second option when it has one |
| F5 | System Response centre column is blank for 6–10 s after selecting an event (manifest + 12 chunk fetches + gzip decode) with no loading state; the first screenshot of the audit was an empty page | `flow-response-event.png` vs `probe-response.png` | skeleton panels with the artifact names being fetched; progressive reveal (chart appears when its artifact decodes) |
| F6 | Workbench landing from the nav is a dead end: "No selection — ?loop=&methodRun=&gate=" | `evidence-empty.png` | landing = loop picker → that loop's evaluated windows (newest first, with state) → gate; same pattern as the Response landing |
| F7 | Signal context lanes (PV/SP, OP/VP, mode, health) read "G0 evidence NONE for this window" on long-tier runs: the live path keeps artifacts only for windows with a finding, so most 24h rows have no G0 arrays | `evidence.png` | when the G0 artifact is absent, draw the lanes from the historian slice for the window (`/api/hist`, already used by Historical) labelled "historian (not the run's own qualification)"; keep the run's arrays when present |
| F8 | On a 24h fused row the short-tier gates G1–G4 open as "NOT_EVALUATED — the engine looked and declined — no reason recorded — this is a verdict, not missing data": contradictory copy; the real reason is that those gates live on the 1m–60m windows | `ui-v25-gates.mjs` output | the fused row's cell for a short-tier gate links to the newest short window's run in the same period; the state panel names the tier ("evaluated on 1m–60m windows") |
| F9 | "EVIDENCE PENDING — no evidence retained for this run" for G0/G2r on the same row: nothing is pending, retention policy skipped it | same | state `NOT_RETAINED` with the policy sentence and the Reconstruct action; `PENDING` only while a manifest is PENDING/PARTIAL |
| F10 | Overview "Live Flink runtime" and Pipeline Health list 4 CPLM jobs; the three v2.5 engines (Condition, Instrument Context, Response) are not supervised there | `CpmReadinessController.RequiredJobs`; `/pipeline-metrics` returns 10 jobs | add the three jobs (roles `cplm`) — a cplm-api change + the readiness tests |
| F11 | Overview KPI cards still speak v1: "Confidence-capped (no VP) 224 — cannot reach CONFIRMED", "Without disturbance context — no peer links (G13)"; Performance "Diagnostic capability 6/230 — 224 loops without VP — final-element faults cannot be CONFIRMED there" | `overview.png`, `performance.png` | reword to v2 semantics: "no positive confirmation evidence (VP tracking or approved test)"; G13 "no aligned peer analysis / UNAVAILABLE"; counts from the v2 `confirmation` / `interaction` fields |
| F12 | Loop Explorer "Configuration" panel shows loop type / gate profile / calculation version only — none of the 2G loop-model dimensions (service family, dynamic class, objective, topology, command path, acquisition, classification source); no links to the workbench, response page or effective configuration for that loop | `explorer.png`, `explorer/SummaryTab.tsx:228-234` | a "Loop model" card + three action links; drop "calculation version" (R26: a version string identifies nothing) in favour of the build/bundle facts |
| F13 | Workbench header: three oversized state pills with tiny text; the meta grid overlaps ("Configuration profile:ffa30188e0775f1**Build** 3535c78aa45a · jar…"); hashes and run ids shown raw | `evidence.png` | one compact fact strip (window · tier · state · evidence) with copyable short ids and full ids on hover |
| F14 | Unformatted values everywhere new: `period 290.23199999999997 s`, `gain=-76.55206322791764`, `cond=141.19070994149413`; raw dotted keys (`acf_series.period_s`) in "Parameters used"; raw enums in event cards (`RESPONSE_CHARACTERISED · model CANDIDATE · eligibility ELIGIBLE`) | `evidence.png`, `probe-response.png` | one `fmtQuantity(value, unit)` (significant digits by unit: s → 0.1 s, fractions → 3 d.p., pp → 0.1) and a label map for method/enums; raw on hover/copy |
| F15 | Gate list (left column) shows each gate's **role** pill (BLOCKING / PRIMARY / SUPPORTING…), not its **status** for this window; the pill text overflows ("PERFORMANC"); the selected cell's status is a footnote | `evidence.png` | status glyph + reason per gate, grouped by tier, role as a secondary tag; selected state in the header |
| F16 | "Why / why not: BANDWIDTH", "Next valid action: Read the artifacts; every value is the run's own." — cryptic / filler copy in the Method trace | `evidence.png` | plain-language explanation block generated from the catalogue entry + the cell's reason (reason → sentence map already exists for the state panels) |
| F17 | `crossing_times` drawn as a chart (all points on y = 0) — meaningless | `evidence.png` | render crossings as markers on the preprocessed signal, and as a small table |
| F18 | Gate Configuration: the right column overflows (approval table and ACTIVE_VERIFIED pills bleed past the panel); the properties list is one long wall (every property expanded with all rows); two deployment cards repeat 6-row ACK matrices | `flow-config-bundle.png` | property **table** (name · effective · source · class · flags) with one expanded editor; deployments as a timeline with one ACK matrix (workers × PREPARE/APPLY) collapsed by default; fix the overflow with `minmax(0, …)` + wrapping |
| F19 | System Response: the event list repeats two identical-looking pills (COMPLETE / EVALUATED) and a raw sentence per event; the right column is dominated by the 52-row quantities table where most rows are "not applicable (…)"; the Output chart legend collides with the axis title | `probe-response.png` | event rows = time · type · state glyph · one-line finding; quantities = "key results" card (gain, τ, θ, settle, overshoot, error integrals) + collapsed "all 52" table with the not-applicable rows greyed; legend below the plot |
| F20 | Response events on loops with no step (FIC10405, TIC10101 under the plain OT sim) exist as `INPUT_TEST · CENSORED` — candidates triggered by the sim's random walk | `response_event` rows | not a UI matter: check `G12.step_min_*` / noise multiplier defaults against the sim's noise; a censored candidate is correct behaviour, but the list should group/hide censored candidates by default |
| F21 | The effective-configuration drawer is linked from the workbench and the config page but not from the Loop Registry (the plan said both) | grep | add the link on the registry row |
| F22 | Fast conditions (`/conditions`) have no view; on the lab a freeze on FIC10301 is visible only through the API and the next fused window | — | a "Conditions" tab in Loop Events (open limit-dwell / freeze conditions with start, duration, gate) — small, high value |

## 4. Redesign proposal — the three new pages

Principles applied throughout (ISA-101 / OpenBridge conventions already in the app):
**answer first** (one sentence: what this run says and why), **progressive disclosure** (summary →
evidence → raw), **one status vocabulary** (the matrix glyphs + reason everywhere; role is
secondary), **formatted quantities with units**, **human labels, raw ids on hover/copy**, **every
panel has loading / empty / error states**, **no dead ends** (every page opened from the nav offers
a picker), and **the columns carry meaning** (navigate · read · explain), not just space.

### 4.1 Evidence Workbench

```
┌ header strip: FIC10405 · Hexane feed flow │ G5 Oscillation │ 24h window 16 Sep 07:45 → 17 Sep 07:45 UTC │ WARN · BANDWIDTH │ evidence ✓ │ run 4ccaf304 ⧉ │ [Go to newest run] ┐
├─ gates (nav, 220px) ─┬─ reading (fluid) ───────────────────────────────┬─ explain (300px) ───────────┤
│ ELIGIBILITY          │ ▌Verdict: WARN — oscillation with period 290 s, │ What this gate asks          │
│  G0 ✓ Data quality   │  regularity 1.00, 33 cycles; limited by the 5 s │ Method G5.ACF_OSCILLATION 3.0 │
│  G1 ✓ Mode           │  grid (BANDWIDTH).                              │ Role PRIMARY · preconditions │
│  G2 ✓ SP activity    │ ▌Signal context  (run's arrays | historian)     │ Why this result (sentences)  │
│ PERFORMANCE          │  PV/SP ─── OP/VP ─── mode ─── health lanes      │ Parameters used (formatted)  │
│  G3 ! Base perf.     │ ▌Evidence                                       │ Configuration this run used ›│
│  G4 ✓ Effort         │  chart 1 … chart n  (data table / CSV per chart)│ Identity (build · bundle ·   │
│ DIAGNOSTIC …         │ ▌Flags on this window                           │   dataset · commit) ⧉        │
└──────────────────────┴─────────────────────────────────────────────────┴──────────────────────────────┘
```

- Left: gates grouped by tier with **status glyph + short reason**, role as a small tag; a
  short-tier gate on a long row links to its own window (F8).
- Centre: a **verdict card** first (status, one sentence, key numbers), then the context lanes with
  the historian fallback (F7), then the gate's charts, each with its data table collapsed; state
  panels use the corrected vocabulary (F9).
- Right: "explain" — what the gate asks, why this result (generated sentences), parameters with
  labels and formatted values, the configuration link, identity block with copy buttons.
- Landing without a selection = loop → window → gate picker (F6). Number formatting (F14),
  header strip (F13), crossings as markers (F17).

### 4.2 System Response

- Landing: loop picker with each loop's event count and last complete event.
- Event list: compact rows (time · type · path · state glyph · finding in words), censored
  candidates collapsed under "n censored" (F20).
- Centre, when an event is selected: **result card** (model family, gain, τ, θ with ± and units,
  validation verdict, one sentence on identifiability), then output/input charts (legend below the
  plot), residuals, candidate models (formatted), Bode when present — each with a skeleton while
  its artifact loads (F5).
- Right: subgates A–H as a stepper (state + reason), then key quantities, "all 52" collapsed.

### 4.3 Gate Configuration

- Left unchanged (scope → bundle list) but with the bundle state timeline (draft → validated →
  shadow → approved → deployed → active) as the panel head.
- Centre: property **table** per gate (name · effective value · from layer · change class · flags),
  click to expand one editor (definition, bounds, inherited, read-by, reset). Diff & impact and
  shadow comparison as tabs above the table, not appended below.
- Right: lifecycle actions in order (Validate · Shadow · Approve · Deploy · Roll back) with the
  blocking reason under a disabled action; deployment history as a timeline with one collapsible
  ACK matrix; overflow fixed (F18).

### 4.4 Entry points and platform fixes

F4 (latest semantics) and F10 (supervise the three jobs) are cplm-api changes with UI follow-up;
F11, F12, F21, F22 are small UI changes on existing pages.

## 4.5 Done — the Evidence Workbench redesign (same day)

Approved and implemented as 13 test-first commits (`87858877` … `4e62b25a`): F5 (skeletons; `aria-busy`), F6
(landing = scope filter + loop search + window kind + evaluated window, newest window with run identity
auto-selected), F7 (historian fallback lanes, labelled), F8 (SHORT_TIER state with a link to the short windows),
F9 (NOT_RETAINED), F13 (one fact row, copyable ids), F14 (`fmtQuantity`, provenance labels), F15 (gate strip with
statuses), F16 (plain "why this result"), F17 (crossings as markers + table), plus the performance budget:
`projection=summary` picker rows, batch manifests, one bundle per run, LTTB sampling, disclosure for data
tables. Measured on the lab: 17/17 gate views, 12–13 requests per cold gate open (G9 was ~50), first chart
0.9–2.6 s. Still open from this list: F4 (fleet "latest" semantics), F10–F12, F18–F22.

## 5. Suggested order (each a commit with tests; lab re-audit with the scripts at the end)

1. F4 latest semantics (API + matrix + launcher) — unblocks the workbench for the whole fleet.
2. Workbench: landing picker, header strip, gate list with status, verdict card, number/label
   formatting, historian fallback lanes, state vocabulary, crossings (F6, F7, F8, F9, F13–F17).
3. System Response: skeletons, result card, list rows, quantities split, legend (F5, F19, F20).
4. Gate Configuration: table + editor, lifecycle column, overflow (F18).
5. F10, F11, F12, F21, F22 on the existing pages.
6. Re-run `ui-v25-audit.mjs` + `ui-v25-gates.mjs`; screenshots into the acceptance evidence.
