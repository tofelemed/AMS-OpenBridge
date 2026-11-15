# Task 12 — second batch: CHG-194 (sidebar and header) and CHG-195 (System Response)

Branch `feat/cpa-redesign` from `ff6c3bd6`. Frontend only (`src/frontend-ob`), plus `docs/theme/redesign/text-changes.md`
(`## CHG-194`, `## CHG-195`). Brief: `.superpowers/sdd/2026-11-15-owner-prod-review/batch2-brief.md`; spec items 18, 19 and
Q8 of `docs/theme/redesign/owner-review-2026-11-14.md`. Two coordinator corrections during the task were applied: the
"Charts not kept" premise (the owner's event is censored) and the owner rule "one trend per row on every System Response tab".

Commits: `1dea1d4f` CHG-194; the CHG-195 commit carries this report. Not pushed. No docker, no subagents, no cplm-api or
engine change.

## CHG-194 — item 18, sidebar and header

| Bullet | Done |
|---|---|
| No "CPA" above the headings (expanded) | `ShellNav.tsx`: the module name renders on the rail only (aria-hidden there); the module wrapper is `role="group" aria-label="CPA"`, so a screen reader still hears the module. Rail unchanged. |
| Headings bold | `shell.css` `.shell-nav__group-name` `font-weight: 700` (the brand's weight). |
| Engineering before Set up | `destinations.ts`: Trend moved before Loop Registry; `NavGroup` order updated. Headings and the Ctrl K palette follow the list. |
| Plant selector at the sidebar edge, narrower controls | `.shell:not(.shell--rail):not(.shell--drawer) .shell__brand { flex: 0 0 calc(var(--traverse-size-sidebar-expanded) - var(--traverse-space-4) - var(--traverse-space-2)); margin-inline-end: 0 }` (header padding + brand + gap = sidebar width). Plant selector max 240 px (was 380; 300 below 1280), search max 320 px (was 420). With the rail and in the drawer the selector follows the brand. |

Measured on the preview (read-only, guard on, 0 blocked calls): plant selector x = 220 = sidebar right edge at 1440, 1366
and 1280; at 1024 (rail) it follows the brand (x = 151); at 768 and 390 the icon controls fit; no header or page sideways
scroll at any of the six widths. The plant selector is content-sized (207 px for "All sites · 243 loops"); the 240 px cap only
truncates a longer scope path.

Tests: `ShellNav.test.tsx` (heading order; no module name and a named group; rail keeps the name), `cpa/context.test.ts`
(destination and path order), new `ui/shell/shellLayout.test.ts` (bold headings, brand calc, narrower caps). Each failed first.

## CHG-195 — item 19, System Response

**All tabs.** The foot line is gone: `ResponseTabs` has no `foot` prop, `eventFoot` deleted from `responseLabels.ts` (no
other user), the caller and `footEvent` removed from `ResponseWorkspace.tsx`; the foot holds only "Next: … →" (right
aligned). Every action is an `ObcButton` in the standard: Next / Older events / Export CSV / Zoom area / Undo / Reset /
Review / the outputs button / Close are Secondary (`normal` / `flat`), Record decision the one Primary (`raised`); no plain
`<button>` action is left in `components/Cpm/response/`.

**Events.** `ResponseTiles` now renders three headed `KpiCard`s (Overview layout, icons `ObiRecordEvent`, `ObiCheckGoogle`,
`ObiTrend`, neutral tone) in a `role="list"` "Response counts". Drill-down kept and completed (owner KPI rule): Response
events and Accepted events move to the events table (scroll + focus), System model opens Models; a card with nothing behind
it is a plain tile; "N censored not counted" is the card's small line. New optional `KpiCard` prop `opensDialog` (default
true) drops `aria-haspopup` for these openers. The events table is a `ui/DataTable`: same columns and order, the censored
choice unchanged, the row (click or Enter) opens the event, the selected row marked, a censored row muted.

**Response.** `ResultCard`: model name with its state pill beside it; per parameter a value block (label, value + unit,
then "± …" on a quieter line). `resultSummary` now returns `value` and `spread` per parameter (same `fmt`, same units).
"Reported quantities" is a `DataTable` (Quantity · Value), "n of m reported" in its head. Charts unchanged.

**Fit quality / "Charts not kept".** See the root cause section. Frontend: the note is one plain line ("Charts are not
available for this event." / "Charts for this event were removed by retention." / "Charts for this event failed
verification."), no retention sentence; the `retention` prop chain (Workspace → EventPanes → ArraysNote) removed (the API
field stays). A censored event's Fit quality says "This event was interrupted before the response finished, so no model was
fitted." whatever charts are held; censored is read from `capture_state` or `evaluation_state` (the event detail carries only
the latter). Layout (owner rule 15 Nov): Residuals, then Residual autocorrelation, then the Delay objective curve, each full
width; the candidate models table full width after them.

**Frequency.** Margins as a `DataTable` (Margin · Value; "not claimed" kept, never 0); magnitude then phase, one per row.

**Steps & data.** The eight cards keep name, pill, reason line; "n outputs" is a flat `ObcButton` opening a `ui/Dialog`
(title = step name, subtitle "FIC10302 · Step A") with `KvRow` label / value rows. New `outputLabel` / `outputValue` in
`responseLabels.ts`: `path_id` → Path, `sample_grid_s` → Sample interval (s), `u_applied_available` → Applied OP available,
other keys humanised (sentence case, unit suffix in brackets); values: path → "OP → PV", codes via `codeLabel`, booleans
Yes / No, numbers via `readable`. Event panel removed. "All quantities" full width as a `DataTable` without Method (Q8);
the multi-path Path column in words; no id on hover. No CSV on this tab.

**Models.** Trends one per row, full width, in `MODEL_PARAMS` order (Process gain, Dead time, Time constant); new optional
`CpmChart` props `headingLevel` (title as an `h3`) and `exportInHead` (Export CSV after Zoom area / Undo / Reset in the
chart's head); "Export models CSV" stays on top. The readout says "Validated model" instead of "model a7065b37 · Validated".
The table is a `DataTable` with group rows (new optional `groupOf`) and no estimator column; CSV unchanged (keeps
`estimator`). Review dialog: rows Process gain / Dead time / Time constant (`paramLabel`) in the loop's units (`pvUnit` now
passed), no Estimator / uncertainty row, state as the pill word, subtitle path in words; decision form, revision, 409 / 403
untouched.

**Shared additions (all optional, defaults unchanged):** `DataTable` `rowClassName` and `groupOf` (group heading rows,
never focusable or selectable, not for grids; CSS in `data-table.css`); `KpiCard` `opensDialog`; `CpmChart` `headingLevel`
and `exportInHead`. Dead CSS removed (old tiles, side-by-side pairs, trio, step disclosure, Event aside, group rows).
At 390 px the events table pushed the tab past the panel: `.cpm-response-tabs .cpm-tabpanel > * { min-width: 0 }`.

## Hover readout: charts fixed

`charts/chartTheme.ts` `tooltipChrome` now carries `confine: true`; every chart that spreads it (directly or through
`plainOption` / `baseOption`) is confined. Checked and covered:
1. `evidence/CpmChart` — every evidence chart (System Response chart, residuals, ACF, delay curve, Bode, Models trends, Workbench / Calculations views).
2. `evidence/views/primitives/IntervalLane`. 3. `evidence/views/primitives/Trajectory`. 4. `health/HealthLane`.
5. `historical/chartOption` (Historical). 6. `kpi/KpiTrendChart`. 7. `pipeline/CheckpointHistory`.
8. `replay/ReplayChart` (both options). 9. `trend/trendOption` (SignalTrend: Loop Explorer, Investigation, Overview focus).
10. `ui/trend/trendOption` (Trend page) — already had `confine: true`.
11. `evidence/views/G13Interaction` — tooltip hidden (`show: false`), nothing to fix.
Not CPA: the Designer trend uses the same helper and is confined too; legacy `Analytics.tsx` has its own tooltip, unchanged.
Measured on the preview: hovering the Models chart 70 px from its left edge put the readout at x 458–1027, the sidebar ends
at 220. Guard test `charts/chartTheme.test.ts` fails if any CPA chart defines a tooltip without the shared chrome.

## "Charts not kept": root cause, with evidence

1. **Same source on both tabs (frontend).** `ResponseWorkspace.tsx`: `methodRunId = selected?.methodRunId ??
   result.method_run_id` → `useEvidenceManifest(methodRunId)` → `useGateArtifacts(manifest, 'G12')`; `EventPanes.tsx` gates
   the Response chart and the Fit quality panels on the same `arraysState(manifest.data)`. The Response tab cannot draw a
   chart while Fit quality says "Charts not kept" for the same event. The owner's `19-response-tab.png` is cropped right at
   the note: the info bar with the start-edge line under the result row is that note, so the Response tab showed it too.
2. **The event's own run.** cplm-api `CpmResponseController.cs:45/61` (list) and `:85` (detail) serve
   `analytics.response_event.method_run_id`; the engine writes the G12 artifacts under that id
   (`response/ResponseEvaluator.java:88` `g.methodRunId = RunIdentity.methodRunId(…)`, `:287`
   `ResponseEvidenceWriter.artifacts(g.methodRunId, …)`). Lab: 25 of 25 accepted events had model run = event run.
3. **What each tab needs.** Response needs `accepted_samples` (always written); Fit quality needs `residuals`,
   `residual_acf`, `candidate_models`, `delay_objective_curve`, written only when a model was fitted
   (`ResponseEvidenceWriter` `CONDITIONAL_KINDS`). The note itself only fires when the run holds no G12 artifact at all and
   readiness is NONE; cplm-api `EvidenceManifestReader.ReadAsync` returns NONE when the run has no `evidence_manifest` row.
4. **Retention by design.** `ResponseEvidenceRetention.PromoteSql` moves G12 manifests to class RESPONSE only for
   `e.capture_state <> 'CENSORED'`; censored candidates stay TRANSIENT and the same sweep deletes them after 6 h
   (`EvidenceRetentionSweeper.SweepOnceAsync`, steps 1b then 2).
5. **The owner's event is censored.** `19-steps-data.png`: window 15:39 → 19:39 (support 14401 s), finding "capture reached
   its maximum length" (censor reason CAPTURE_MAX), D and E not evaluated, "no model". Its charts were TRANSIENT and it never
   has a fit. The "Evaluated · candidate" result is a different event (Input test 14:51 → 15:10).
6. **Lab data (read-only GETs through the gateway, 2026-11-15).** Newest response event in the lab: 2026-11-07 11:48 UTC;
   the 483 newest events over 243 loops are all censored (SUPERSEDED_BY_EVENT), readiness NONE, 0 G12 artifacts. Newest
   accepted events: 2026-10-07; 24 of 25 sampled have readiness NONE (pre-CHG-105, purged as TRANSIENT); one (FIC10302,
   2026-09-25) is COMPLETE with 14 G12 artifacts, class STANDARD. Event detail JSON: no `capture_state` key; a censored event
   reads `evaluation_state: CENSORED`.
   - Coordinator check (1), an accepted event older than 6 h with class RESPONSE: **not provable on lab data** (no accepted
     event since the CHG-105 sweeper). Plant read-only query to settle it:
     `SELECT m.retention_class, count(*) FROM analytics.evidence_manifest m JOIN analytics.response_event e USING (method_run_id) WHERE m.gate_id = 'G12' AND e.capture_state <> 'CENSORED' AND m.created_at < now() - interval '7 hours' GROUP BY 1;`
   - If an accepted plant event has no charts, the likely cause is that it is older than the v2.9.0 cplm-api start minus 6 h
     (`cpm-21` header: "the charts of the last 6 h are moved too, nothing older exists"); the deploy time is not recorded in
     `prod_decision.md`.
7. **Where it is ours:** the wording (technical retention sentence, "Charts not kept" for an event that never had a fit),
   fixed. Nothing to change in cplm-api or the engine for this item; keeping censored charts longer is an owner decision
   (cplm-api), not done.

## Tests

New: `ui/DataTable.rows.test.tsx`, `charts/chartTheme.test.ts`, `response/EventPanes.test.tsx`, `response/trendRows.test.tsx`,
`ui/shell/shellLayout.test.ts`. Changed: `KpiCard.headed`, `ResponseTabs`, `responseLabels` (foot gone, outputs in words),
`ResponseWorkspace`, `ResponseSummary`, `EventsTab`, `ResultCard`, `ResponseNotes`, `BodePanel`, `StepsDataTab`,
`ModelHistory`, `ModelReviewDialog`, `ShellNav`, `cpa/context`. Each behaviour test was run and seen failing before the code.
Final run (after the last code change): `npx vitest run` 344 files / 2875 tests passed; `npx tsc --noEmit` clean;
`npm run lint` clean; `npm run lint:theme` 0 matches; `npm run build` built. No failing test.

## Left, and why

- `ResponseWorkspace.tsx` deep-link effect tests `detail.data?.result.capture_state === 'CENSORED'`, which the event detail
  never carries (it has `evaluation_state`), so a deep link to a censored candidate does not switch on "Show censored".
  Found during the investigation; not asked, not fixed (one-line fix).
- Fit quality still shows technical text in panels this item did not name (validation keys "state" / "verdict", EVALUATED,
  PV_EU units, COVARIANCE, raw candidate parameters, `cond=`); the Response chart's pill "OP_TO_PV" and axis "PV_EU" stay
  (charts unchanged; the Response chart split is CHG-197).
- The Frequency tab with a drawn Bode could not be seen on lab data (no event has one); covered by unit tests only.
- No screenshot evidence round (owner: testing once at the end); the preview was opened only to check my own layout.
