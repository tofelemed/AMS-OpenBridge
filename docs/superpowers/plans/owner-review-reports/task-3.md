# Task 3 (CHG-185): Loop Explorer — Loop KPIs, readings, History — report

Owner review 2026-11-14 items 4, 5 and 6, with decisions Q2 (one grid, the group as a small line on each card), Q3 (neutral when
normal, amber + word for a problem, no green, no red), Q4 (a link to another page stays a link) and Q5 (no time display
changes). Every visible text change is in `docs/theme/redesign/text-changes.md` under `## CHG-185`. Builds on CHG-183
(`ui-link`, Secondary A) and CHG-184.

## What changed, per file

### Item 4: Loop KPIs (one grid, Overview card, ? tip)
- `components/Cpm/kpi/KpiCard.tsx`: a new mode for `headed` + `onOpen` (the loop KPIs). Same classes as the Overview card
  (`cpm-kpicard--headed`: title at top, icon top right, then the value). The title is the dialog button; its click area covers
  the whole card (a `::after` overlay), so a click or tap anywhere on the card still opens `LoopKpiDialog`. The explanation
  (`sub`, bold, then `title`) moves into a `ui/Toggletip` "?" beside the title, named "About <title>", which opens on hover,
  keyboard focus or tap and sits above the overlay, so tapping the ? opens the tip, not the dialog. New `group` prop (the small
  last line) and the coverage `bar` in this layout. The Overview's link card and the compact card are unchanged. 107 lines.
- `components/Cpm/explorer/summary/LoopKpiCards.tsx`: the three `cpm-kpigroup` blocks with their caps headings → one
  `cpm-kpicards--loop` grid (`role="list"`) of all nine cards, wrapping by width (auto-fill, 190 px minimum, as before),
  sorted stably by group so the order is the old reading order. Each card gets its group title as `group`. Icon colour
  follows the Overview's rule (`kpiMeta`): blue (`mode`) for Time in normal mode, amber when the card's tone is warn, slate
  otherwise; never green. The drill-down (`LoopKpiDialog`, Inspect Gn →, proof link) is untouched. 81 lines.
- CSS: `styles/cpm-explorer.css` (title/opener/overlay/tip/group line, focus ring on the card through
  `:has(.cpm-kpicard__opener:focus-visible)`); `styles/cpm-loop-summary.css` (the `cpm-kpigroup*` rules removed).

### Item 5: PV / SP / OP / Mode readings
- `styles/cpm-explorer.css`: the joined 1 px-divider group → four separate boxes with `--traverse-space-3` between them
  (box padding unchanged). `.cpm-signal--warning` = `--traverse-status-warning-bg` + a `--traverse-status-warning-fg`
  border; the word in `--traverse-status-warning-fg` beside the caption with a `!` glyph (G05: never colour alone).
- `explorer/summary/readingState.ts` (new, pure, 38 lines): `opReadingState` and `modeNeedsLook`; the source of each
  threshold is in its header.
- `explorer/summary/useSignalValues.ts`: each signal also carries `num` (the shown number) and `live` (the value is live
  and its feed current, i.e. the note under it reads "live"); `modeLive` and `modeToken` for the mode. The values shown and
  their notes are unchanged.
- `explorer/summary/SignalStrip.tsx`: `Signal` takes `warn` and `state`; OP gets `opReadingState(...)` with
  `loop.engineering`; MODE gets `modeNeedsLook(...)`. PV and SP never get a state. `SignalStripAt` (Investigation, stored
  values) never gets one; it shares the new spacing.

### Item 6: History tab
- `explorer/historyQuery.ts`: now holds the tab's data model too (moved out of the tab): `spanOf`, `toRuns` (unchanged
  logic), `runPeriod` / `episodePeriod` (the same text as before), `windowsText` ("1 × 24h window", "4 × 12h windows",
  "136 windows of 12h and 24h") and `episodeWindowsDiffer`. 97 lines.
- `explorer/HistoryTab.tsx` (241 → 206 lines): one table on the shared table look (`ui/data-table.css`, imported here
  because DataTable's sheet only loads with DataTable): PERIOD · FINDING · EPISODES · PEAK SCORE (? tip with the evidence
  score note) · REVIEW STATE · one "Open in Loop Events ↗" (`ObcButton` `ui-link`, the run's newest episode). The Episodes
  cell is the toggle ("▸ 12", named "Show the 12 episodes", `aria-expanded`) over the windows text. Episodes open as
  indented lines showing only the period, the windows when they differ inside the run, and the score. Review state is
  `reviewView` from Loop Events (`TonePill` with glyph, sentence case). The period is a button to Historical (title "Show
  in Historical") and the row click still opens Historical, as the old row did. Pager says runs / episodes without "(s)".
  Dates/times untouched (`fmtWhen`, Q5).
- CSS: `styles/cpm-explorer-tabs.css` (the History table, and under 1100 px each run becomes a block of labelled cells that
  flow in columns; episode lines keep the run's columns without repeating the names); the old `.cpm-episode*` rules
  removed from `styles/cpm.css`, `.cpm-episode-links` from `cpm-explorer-tabs.css` (nothing else used them).

### Every fact of today's History tab, and where it is now
| Today | Now |
|---|---|
| Run period (start → end / · open) | PERIOD cell, same text |
| Diagnosis | FINDING |
| "N episodes" | EPISODES: the toggle's number |
| "N × 12h/24h window(s)" | EPISODES: second line ("12 windows of 12h and 24h", "2 × 24h windows") |
| "peak evidence score N" | PEAK SCORE column; "evidence score" named in its ? tip |
| UNACKNOWLEDGED / SHELVED / ACKNOWLEDGED | REVIEW STATE, Loop Events' pill (adds the shelf expiry Loop Events shows) |
| END BEFORE START | "End before start" pill in the period cell |
| Row → Historical over the span | the period button and the row |
| Loop Events ↗ (run) | Open in Loop Events ↗ (one per run) |
| Episode period / end before start / open | episode line, period cell |
| Episode "1 × 24h window(s)" | episode line, EPISODES cell, shown only where the run's episodes differ (otherwise the run's "N × 24h windows" with N episodes already says it) |
| Episode "peak evidence score N" | episode line, PEAK SCORE cell |
| Episode → Historical | episode period button and row |
| Episode "Loop Events ↗" | removed (owner: one link per row, not per line); Loop Events lists every episode of the loop |
| Open Historical →, pager, empty/error/loading states | unchanged (pager without "(s)") |

## Decisions
- **Which readings can be coloured (item 5).**
  - **OP: yes**, from the loop's registered OP range (`loop.engineering.opMin/opMax`, on the page via the loop registry;
    the range "Time at an OP limit" normalises OP to). Amber + "At limit" when a live OP, as shown to two decimals, is at
    or beyond a registered bound. Neutral with no registered range (no 0–100 assumption), or when the value is not live.
    The engine's KPI also counts a tolerance band inside each bound (`limitTolerancePp`, 5 pp by default, a gate setting
    read only through `/configuration/effective`, which needs `cpm.config.read`); the reading does not use it, so it flags
    only at the registered bound itself, never more than the registry says.
  - **Mode: yes**, from the engine's normal-mode vocabulary (`utils/modeVocabulary.classifyMode`, the mirror of Flink's
    `isAutoMode()`, the same test as "Time in normal mode"; the plant's `mode_value_map` is applied at ingestion, so the
    live value is already the token). Amber for a live MAN / UNKNOWN / unrecognised token; the words are the mode's name
    and its existing note ("manual · excluded at G1 · live"). No extra badge, so the name is not said twice.
  - **PV: no.** The G3 good band is `G3.error_band_span_fraction` × PV span (`CplmLoopDynamicsProfile.goodErrorBand()`,
    0.005 by default, 0.5 EU without a span). The span is on the page, the fraction is not: it is a governed per-loop
    configuration value served only by `/configuration/effective` under `cpm.config.read` (SuperAdmin). Colouring PV from
    the 0.005 default would invent the threshold for any loop whose bundle changes it, so PV stays neutral. To colour it,
    `GET /loops/{id}/kpi-summary` (cplm-api, outside this task's scope) could serve the effective band in EU next to `span`.
  - **SP: never** (spec).
  - Lab: no live publisher on FIC10401 (values "last stored 11 days ago"), so no real amber state could be shown with lab
    data. `evidence/chg185/readings-amber-css-preview-*.png` are a CSS preview only: the class was added to the OP and
    MODE boxes in the browser to check the colours in Day and Night. The behaviour is covered by tests.
- **KPI tip mechanism.** The plan says reuse `ui/Toggletip` (hover, focus, tap), so the explanation is a ? beside the
  title, not the Overview's whole-card hover tip (which has no tap). On a narrow card a two-line title keeps its ? after
  the last word ("Time in normal mode ?").
- **KPI card tones.** The left-edge tones (green on a pass with no finding, red on a gate FAIL) are the existing card rule
  and were left as they are; Q3 is about the readings. The icon never turns green.
- **The ? tip holds the sub line and the meaning** (e.g. "8641 of 8640 samples · G0 pass" and "Samples received ÷ samples
  expected … (G0)"), so nothing left the screen; the dialog still shows Value, Judged by and Meaning. "no PV span
  registered" (the reason for a "—" error/variability card) is now in that card's tip.
- **History link text** "Open in Loop Events ↗": the owner's words with the app's ↗ link convention (CHG-183, Q4).
- **Signal captions** (PV/SP/OP/MODE) are `--traverse-text-secondary` today, not `--signal-*`; they were left as they
  are and no status colour touches them.

## Not done / for the controller
- PV "Off setpoint" (above): needs the good band served to the page.
- `SignalStripAt` on Investigation shares the new spacing (same component and CSS); Task 4 may want to look at it.
- The sample-count question in the spec's "Seen while reviewing" (8641 of 8640) was not touched.
- `src/frontend-ob/src/components/Cpm/_body.txt` was already untracked before this task; left alone, not committed.

## Visual check (preview :4173, lab data, read-only)
Built with `npm run build`; captured with `docs/theme/tools/lib/session.mjs` (login, client-side goto, tabs by role),
every non-GET `/api/` request aborted except `/auth/login` and `/auth/refresh` — **0 blocked**; one console 401 is the
pre-login refresh, also in the before capture. Screens in `docs/theme/redesign/evidence/chg185/` (untracked):
`summary-{day,night}-1440`, `summary-day-768`, `kpi-tip-{day,night}-1440`, `kpi-tip-day-768`, `history{,-expanded}-{day,night}-1440`,
`history{,-expanded}-day-768`, `readings-amber-css-preview-{day,night}`, and `before-summary-day-1440`,
`before-history-expanded-day-1440`. Also checked at 1000 and 390 (not kept): no horizontal scroll; under 1100 px the
History rows become labelled blocks.

## Tests
New or changed:
- `explorer/summary/LoopKpiCards.test.tsx`: one grid in group order with the group line on each card, no group headings;
  title before value, no explanation on the card, tip opens with the sub line and meaning without opening the dialog;
  coverage sample count in its tip; icon colours (no green); dialog + Inspect G3; "not measured" once; coverage bar.
- `explorer/summary/readingState.unit.test.ts` (new): At limit at/beyond bounds, no invented band, neutral when not live
  or without a usable range; mode flags for MAN / UNKNOWN / unknown token, not for AUT / CAS / stored / missing.
- `explorer/summary/SignalStrip.test.tsx`: OP amber + "At limit" when live at a registered bound; neutral inside, without
  a range, or stale; mode MAN amber with its name and note; stored values, PV and SP never coloured, nothing green.
- `explorer/HistoryTab.test.tsx`: the six columns; review state in sentence case as Loop Events; no "window(s)" and the
  windows wording; period → Historical and one link → Loop Events (newest episode); Open Historical →; episodes inline with
  only period and score, one link per run, End before start; per-episode windows when they differ.

Output tails: see the end of this file.

## Output tails (run from `src/frontend-ob`)
```
npx vitest run src/components/Cpm/explorer src/components/Cpm/kpi src/components/Cpm/overview
 Test Files  34 passed (34)
      Tests  221 passed (221)

npx vitest run            (full suite)
 Test Files  326 passed (326)
      Tests  2654 passed (2654)

npx tsc --noEmit -p tsconfig.json      exit 0, no output
npm run lint                           exit 0 (eslint --max-warnings 0)
npm run lint:theme                     lint:theme phase 3: 634 live files, gates T1 T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T13, matches 0
npm run build                          ✓ built (the usual >500 kB chunk warning only)
```
