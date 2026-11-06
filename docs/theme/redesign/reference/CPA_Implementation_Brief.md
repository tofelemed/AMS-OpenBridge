# Traverse CPA — final UI implementation brief

Design baseline: 6 November 2026. Companion: `CPA_Final_Design.html`.

## Decision and scope

Implement the supplied design in the existing CPA application. This is a presentation and interaction correction, not a new application or a new diagnostic engine. Preserve the existing routes, supported functions, real calculations, permissions and engineering identities. Do not reduce the actual metric catalogue to the records embedded in this prototype.

The user approved and locked these ten views individually: Overview, Performance, Loop Events, Loop Explorer, Historical, Investigation, Evidence Workbench, Evidence Replay, Window Inspector and Calculations. Preserve their layout, information hierarchy, terminology and interaction structure. Seven supporting views were completed under the user's instruction to finish the remaining scope: System Response, Loop Registry, Gate Configuration, Trend, Pipeline Health, Administration and Governance. They follow the same design system; they were not separately reviewed and approved.

The aim is that a person can identify an issue, select a loop, inspect its history, investigate evidence and record an action without repeatedly selecting the loop or reading long explanatory paragraphs.

Data staleness is outside this design review and its acceptance criteria. Do not turn this implementation into a data-freshness project.

## How to use the reference

1. Open `CPA_Final_Design.html` in a browser. Use the application sidebar. On a narrow screen, use the Page selector above the view.
2. Start at Overview, review LIC10501, then open its evidence. Use FIC30502 for the source-backed detailed calculation, replay, window and configuration examples.
3. Treat the visible page designs as the visual authority. The source snapshots in `approved-sources` are the original locked fragments; `completed-sources` contains the additional seven views.
4. Implement this design using existing application components and services. Do not deploy the prototype's iframe packaging, host bridge, sample fixtures or browser-local storage as the production architecture.
5. Use `CPA_Design_Manifest.json` to identify source snapshots and their hashes. Integration adapters in the combined copy connect navigation; they do not alter the archived locked source files.

### Prototype limits — do not copy these into production

- The file is an offline UI reference, not a connected CPA client. No accounts, plant configuration, audit records or calculation jobs are changed.
- Signal arrays and example earlier windows are illustrative. Source-backed values and unsupported states are identified in the views. They are not independently recomputed proof.
- Detailed examples mainly cover FIC30502 and LIC10501. A context-preserving unavailable screen appears for unsupported combinations. Production must load the actual selected loop and window through its existing services.
- The Calculations screen supplied 12 visible rows and reported 19 stored metrics. All 19 actual metrics must remain available in the real app. The other seven have not been invented in the reference.
- Pipeline Health reports 7/13 required jobs running; six individual rows were visible. Do not turn the six-row reference into the production job catalogue.
- Registry reports 175 assets; the reference includes five example rows. Governance reports 494 events; only visible example summaries are reproduced. Preserve complete lists, paging and filtering.
- Administration's additional tab layouts are proposed interaction patterns. Unknown source settings, permissions and aliases are left unknown. Viewer/Analyst roles in the user draft are illustrative, not a claim about deployed roles.
- Download behavior, full audit-chain verification, backend persistence, full role enforcement and real calculation execution require production integration and validation.

## Fixed design rules

### Application identity and layout

- Keep Traverse CPA / Lean Automation branding and the established navigation groups. Keep Day, Bright and Night appearance choices.
- Use the reference's Segoe UI typography, navy text, restrained blue selection, neutral panels, thin dividers and compact rounded controls. Do not replace this with a different dashboard theme.
- Use a shared application shell. At desktop width, retain a narrow left navigation and a wide main workspace. Stack secondary panels when they no longer fit. All pages must work from 320 to 1440 pixels without page-level horizontal overflow.
- Match the comfortable spacing in the reference. Use approximately 12–14 px for normal product text and at least 11 px for supporting information. Do not make dense information readable only by zooming the browser.
- Use colour to support a named state. Always show the state in text. A green signal-quality badge is not proof of instrument health or acceptable control performance.
- Show one selected loop and one evaluated-window context near the top of a loop page. Do not repeat full dates and descriptions on every metric row when they are shared.
- Keep main actions visible. Put supplementary definitions, mathematical detail, jargon and long explanations in accessible hover help, expandable details or a clearly named secondary view. Essential reasons and failures must never depend on hover.
- Keep source tag, service, area and unit identities available. Do not invent or rename engineering tags.

### Interaction and feedback

- Preserve loop, site/area/unit, evaluated window, event/run identity, relevant gate and historical trend range between linked pages. An intentional change must be visible.
- Use real navigation for primary review actions. Do not leave production buttons opening destination-description dialogs from the prototype.
- Search, filters and selection must agree. When a filter removes a selection, select a valid visible result or show a clear no-selection state; do not show unrelated details.
- Preserve Back behavior and a shareable URL containing sufficient selected context. Separate an evaluated window from the wider trend viewport.
- Give explicit loading, success, validation, failure and empty states. Keep the last usable view while a request is pending where appropriate. Do not report success before a service acknowledges a write.
- Use restrained transitions for changed selections and real interaction feedback. Do not add decorative animation, blinking counters or invented activity to make the app look alive.
- Provide native keyboard access, visible focus, labelled inputs, modal focus containment and Escape-to-close. Tooltips must work with focus and touch as well as hover.

## Shared state and data semantics

Use one consistent navigation context, adapted to the application's existing architecture:

```ts
type ReviewContext = {
  loopId?: string;
  siteId?: string;
  areaId?: string;
  unitId?: string;
  eventId?: string;
  runId?: string;
  windowProfile?: string;
  windowStartUtc?: string;
  windowEndUtc?: string;
  gateId?: string;
  trendStartUtc?: string;
  trendEndUtc?: string;
  calculationVersion?: string;
  profileVersion?: string;
};
```

This is a conceptual contract, not a prescribed new API. Resolve authoritative values using existing services. Store timestamps in UTC and display the explicitly selected plant timezone consistently. Source examples use UTC+03:30; the user's computer timezone is not a reason to silently reinterpret these records.

Keep these meanings separate:

| Item | Required meaning |
|---|---|
| Loop verdict | Overall result for a specific evaluated window |
| Gate result | Outcome of one evidence check; can differ from the overall verdict |
| Evidence score | Engine evidence strength; never label it a probability of a physical fault without calibration |
| Confirmed oscillation | Confirmed symptom under the engine's rules; not automatically a confirmed physical cause |
| Proof retained / complete | Storage completeness of evidence artefacts, not diagnostic sufficiency |
| Signal quality | Recorded quality of the signal, not instrument health |
| Missing value | Null/unavailable/not calculated/not evaluated with a reason; never replace with zero |
| Sample-count ratio | Received count divided by nominal count; not proof of unique, valid, continuous coverage |
| Persisting condition | Elapsed episode duration; not qualified evidence-support duration |
| Review outcome | Human review record; must not overwrite engine diagnosis |
| VP not applicable | Equipment genuinely has no VP; distinct from expected VP not mapped |

Gate groups must remain accessible: G0, G1, G2 and G2r eligibility; G3 and G4 performance; G5–G11 diagnostic evidence; G12–G14 confirmation; G15 fusion. This is not a requirement to execute all gates as a strict serial chain. Preserve actual configured execution and role policies.

## Page requirements and completion checks

### 1. Overview — locked

Keep the complete approved KPI set: acceptable performance, auto, manual, oscillating, suspected valve problem, excessive actuator effort and saturated/at-limit. Keep assessment-state coverage and the priority list. Each KPI shows its own denominator; overlapping conditions must not be presented as a partition of all loops.

The priority list shows tag, meaningful finding, in-band percentage and persistence. Selecting a row updates the compact signal preview; Review opens Investigation for the same loop and evaluated window. Retain recent events and the direct top-priority finding action. Setup readiness belongs in Registry/Pipeline Health rather than dominating the operating overview.

**Pass:** KPI values reconcile with their stated denominator; queue order follows the existing priority policy; selecting/reviewing a loop carries its exact context.

### 2. Performance — locked

Retain the approved findings view, gate matrix, scope choices, search, filtering, sort and pagination. Keep loop-level verdict, severity/priority and evidence score distinct. Display a useful selected-loop summary and direct evidence/review actions.

**Pass:** filters and row counts reconcile; every gate remains inspectable; opening a row preserves loop and assessed window.

### 3. Loop Events — locked

Keep episode and fast-condition views, condition state, availability, review status and the event trail. Preserve the distinction between historic peak and latest result. Acknowledging a condition does not close it. Shelving needs an explicit reason and expiry/scope where supported; unshelving restores visibility without rewriting the diagnostic history.

**Pass:** event selection synchronizes details; notes and acknowledgement persist through existing services; review navigation uses the selected event window rather than an unrelated newest result.

### 4. Loop Explorer — locked

Retain the five approved sections, nine KPI measures and all 17 gate outcomes. Use a usable signal trend with past ranges, custom dates, series selection, aligned cursor values, zoom, undo and reset. Do not couple historical browsing to the newest evaluation by accident.

**Pass:** changing sections preserves loop/range; the assessment shortcut selects its exact window; missing values and unconfigured diagnostics remain explicit.

### 5. Historical — locked

Keep the signal timeline, evaluation-window list, selected-window detail, resolution choice and KPI/normalisation overlays. The list and timeline select the same evaluation. Support prior periods and custom date ranges. Export actual selected data and evidence identities through the existing backend.

**Pass:** moving to the past retrieves and plots that interval; selected evaluation and wider viewport remain distinct; export contents match loop, range, units and timezone.

### 6. Investigation — locked

Keep the selected verdict, supporting checks, qualification limits, evidence groups and clear next action. Support both the oscillation-confirmed example and the excluded-mode example. Reviewers must see why a result is qualified, limited or excluded without opening many unrelated pages.

Retain the evidence path, expandable checks, signal context, comparison, reviewer checklist and notes. Separate symptom confirmation, physical-cause evidence and evidence score. All proof links must carry the same loop/window/gate.

**Pass:** a reviewer can follow one finding to its proof and record a conclusion without reselecting the loop; human conclusions never alter the original engine result.

### 7. Evidence Workbench — locked

Retain the grouped 17-gate rail/native narrow-screen picker and Proof, Rules & parameters, Signal context, Identity & raw sections. Pin the exact run and version. Distinguish run pinning from controller operating mode.

Show measured inputs, retained rule/threshold and result together when available. Use the original parameter snapshot to explain a saved result; do not silently use current settings. Keep reconstruction/re-run preparation separate from original evidence.

**Pass:** gate/run selection survives section changes; no missing proof becomes a zero; original identity and parameters remain traceable.

### 8. Evidence Replay — locked

Keep raw signals, replay timestamp, sample position, PV/SP/OP/mode/quality at cursor, play/pause, stepping and speed. Show historian, normalization, features, gate evaluation and fusion as useful processing stages. Playback is a sample-viewing operation and must not recalculate the verdict at every cursor position.

Re-run setup must identify original versus current configuration. Submit a new run with a separate identity, show queued/running/completed/failed states, and offer comparison after completion. Never silently replace the pinned original. Export packages must include the actual artefacts and a manifest.

**Pass:** seeking changes the sample readout but not the original verdict; a real replay job is identified separately; notes can attach to loop or exact window.

### 9. Window Inspector — locked

Retain the compact emitted-window list, selected detail, overlap diagram, profile choices and count filters. Preserve exact start/end and reported emission times. Distinguish short-feature windows from long diagnostics/fused verdicts.

The source displays 179/180, 180/180 and 181/180 samples. A value above 100% must not be called “full valid coverage.” Show count ratio/difference and inspect timestamps for boundary handling or duplication before assigning a cause. Name feature flags using real records; do not leave an unexplained string of tick symbols.

**Pass:** selecting a short window opens that exact short interval; it never silently becomes a 12h verdict. Clarify the meaning of source “emitted” times that precede the displayed window end before reporting processing delay.

### 10. Calculations — locked

Keep search, category/gate/result filters, compact metric list and selected method detail. Show the evaluated window once at the top. Preserve all actual calculation IDs, numeric precision, units and gate outcomes, including metrics not reproduced in the prototype.

Retain raw-unit values and distinguish them from span-normalised dashboard measures. Explain MAE/RMSE/IAE/ISE, actuator metrics and unavailable periods in details. Use exact retained engine method and parameters for proof; the reference's method summaries are explanatory.

**Pass:** every actual stored metric is discoverable; ID/unit/value survive filtering and export; Not calculated remains distinct from zero; proof opens the right gate/run.

### 11. System Response — completed supporting view

Keep events and models together. When no event qualifies, show a concise explanation and direct actions to Historical and G12 settings instead of a large blank page. With data, list accepted/rejected/censored events and their actual reasons; selecting an event reveals the source signals, model fit and qualification checks. Separate candidate, validated and baseline models.

**Pass:** no model is claimed without an accepted event; every event/model action preserves exact event identity and interval; reasons are inspectable.

### 12. Loop Registry — completed supporting view

Keep searchable full asset list and selected-loop configuration side by side. Retain individual add/edit, bulk import, hierarchy, criticality, profile, acquisition, signal mapping and peer links. Move explanatory paragraphs into help.

Support VP states explicitly: applicable/mapped, applicable/expected-but-unmapped, and genuinely not applicable. A reason and equipment scope accompany an applicability change. Preview imports and validation failures before committing; show readiness issues as specific missing fields rather than one unexplained degraded label.

**Pass:** no-VP equipment is representable without pretending a signal exists; expected-but-missing mapping is a different state; save/import feedback is tied to server acknowledgement and audit.

### 13. Gate Configuration — completed supporting view

Keep Effective and Bundles views. Show Factory → Profile → Site → Loop resolution, effective value, source layer and classification. Retain complete gate/property search and selection. The source's example has no active governed bundle and still runs factory/class-pack values; do not describe that as no configuration.

Use a draft → difference/review → publish → worker-acknowledgement flow with scope, reason, author, version and rollback identity. Saved results continue referencing the parameters they actually used.

**Pass:** reviewers can explain any effective value's origin; publishing shows actual worker acknowledgements; an old run is not reinterpreted using a newer profile.

### 14. Trend — completed supporting view

Open with the selected loop's useful signals, rather than an unexplained blank chart with zero pens. Retain a visible signal selector, time presets, earlier/reference controls and custom range validation. Provide correctly labelled engineering axes, series visibility and aligned cursor readings. In production, support the existing tag/pen capabilities; do not reduce the engineering workspace to three hardcoded fixture signals.

**Pass:** selected range actually changes the plotted samples; unit scales are correct; signals can be added/removed and empty selection has a clear action. Do not claim Live mode unless it is receiving updates.

### 15. Pipeline Health — completed supporting view

Keep required job state, checkpoint counts/durations/age, managed state and available runtime metrics. Put job details behind row selection. Unknown watermark/consumer lag, latency, backpressure or parallelism remains unknown and must never be estimated for visual effect.

Keep this read-only for lifecycle control unless the existing permission model explicitly provides operational actions. End-to-end verification must identify the target loop/window and create a real traceable verification run. Telemetry history must clearly distinguish retained history from measurements collected only while the page is open.

**Pass:** all actual required jobs are listed or correctly paginated; totals reconcile; verification reports a real job/run and service outcome, not a success animation.

### 16. Administration — completed supporting view

Retain Users, Roles & permissions, Data sources, Plant model, Tag aliases, Audit log and System settings. Use compact searchable lists, selected detail and scoped forms. Keep role, access status and identity together. Retain actual supported user-management/import functions, source tests and hierarchy/tag management.

Apply existing server-side permissions. Show validation and before/after information for changes. Do not expose secrets in details or exports. Require a concrete confirmation for destructive operations; protect account and dependency constraints enforced by the system.

**Pass:** each supported tab is populated from its service; edit/validation/error flows work; unauthorized actions are rejected server-side and successful changes are audited.

### 17. Governance — completed supporting view

Keep entity filters, search, time, actor, action and affected entity in the main list. Open full event detail for before/after payload, reason, versions and hash identity. Preserve actual complete events and pagination; do not treat visible example rows as the whole trail.

Audit-chain verification must use the full required records and report checked range, count, algorithm, verification time and any broken link. Never infer cryptographic integrity from a truncated hash prefix or a button click.

**Pass:** an engineer can trace a configuration/evidence change to actor, scope, versions and values; verification results are backed by the real verification service.

## Final acceptance — one finite implementation scope

These are the release checks for this agreed redesign. Do not add a new cosmetic wish list at each review. Subsequent findings should be recorded only as a failed requirement below, a regression, a newly evidenced functional defect or a separately agreed scope change.

| Check | Required outcome |
|---|---|
| A1 Visual fidelity | All ten locked pages match the reference hierarchy and styling; the seven supporting pages use the same system. |
| A2 Functional parity | Existing real KPIs, metric catalogue, configuration fields, lists and supported actions remain accessible; no prototype fixture limits are copied. |
| A3 End-to-end loop journey | Overview/Performance/Event → Investigation → Workbench/Replay/Calculations/History opens the same loop and exact relevant window. Back retains context. |
| A4 Historical interaction | Past ranges, custom dates, series selection, zoom and cursor show correct aligned source samples and units. |
| A5 Evidence integrity | Scores, symptoms, causes, missing data, gate outcomes, original run and new replay are correctly distinguished. |
| A6 Configuration correctness | VP applicability, mapping, inheritance and versioned changes are explicit, validated and traceable. |
| A7 Feedback | Loading, empty, invalid-input, unavailable-service and failed-write paths are clear. No premature success or silent substitution. |
| A8 Responsive/accessibility | Review at 320, 390, 736, 1024 and 1440 px, Day/Night, keyboard-only and touch. No clipped controls or page overflow. |
| A9 Persistence/security | Notes, reviews and configuration changes persist through real services, obey permissions and create appropriate audit evidence. |
| A10 Exports/runtime | Actual exports match selected data; replay/verification and audit-chain checks return genuine service outcomes and identities. |

Record each check as Pass/Fail with a route, selected context and concise evidence. A failed item must name the actual requirement and observed mismatch. Once A1–A10 pass with the page-specific checks, this UI redesign review is complete. This does not certify the numerical diagnostic algorithms or plant operational acceptance; those need their separate engineering validation.

## Package validation performed

The accompanying `CPA_Validation_Report.json` records local prototype checks and their results. They cover file integrity, rendering, page navigation and interactive examples. They do not prove deployed backend behavior. Original locked fragment hashes are preserved in the design manifest.
