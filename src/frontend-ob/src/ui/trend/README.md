# TrendPanel

The one trend chart (SPEC §6.4, CD12 to CD14). One echarts instance per panel, any number of grids
on one time axis, lanes that carry their own text, and gaps that stay gaps.

```tsx
import { TrendPanel, trendPointsToPane } from '../../ui/trend';

const panes = useMemo(() => [trendPointsToPane(points, { pvUnit, outputRange })], [points, pvUnit, outputRange]);
const lanes = useMemo(() => [
  { id: 'mode', label: 'Mode', kind: 'mode', segments: modeSegments },
  { id: 'verdict', label: 'Verdict', kind: 'verdict', segments: verdictSegments },
], [modeSegments, verdictSegments]);

<TrendPanel
  heading="Signals"
  zone={siteZone}
  panes={panes}
  lanes={lanes}
  plotWindow={{ from: fromMs, to: toMs }}
  gapStepMs={60_000}
  source="Historian, root.hdpe.cpm"
  aggregation="1 min average, PV band is min to max per point"
  state={isLoading ? { kind: 'loading' } : error ? { kind: 'error', message: error.message } : undefined}
  context={<>FIC10401, reactor feed</>}
  toolbar={<SeriesToggles />}
  selectedBandId={windowId}
  onSelectBand={band => setWindowId(band?.id ?? null)}
/>
```

Memoize `panes`, `lanes` and `plotWindow`. A new identity rebuilds the model and re-applies the
option. Remount with a `key` when the range changes, so an old zoom does not carry over: the zoom is
held as a percentage of the window, and the label stays true either way.

## Props

| Prop | Meaning |
|---|---|
| `heading` | Panel name. Not `title`, which lint gate T8 rejects on pages. `headingLevel` sets the element (default 2). |
| `zone` | **Required.** IANA site zone. The browser zone is never read. An invalid zone shows UTC and says so. |
| `panes` | Grids of value axes. Each has `axes`, `series`, optional `bands` and `height`. |
| `lanes` | Optional text bands under the panes. `kind: 'verdict'` segments are selectable. Ignored on a value axis. |
| `plotWindow` | The requested span. The axis is pinned to it, so a partial feed reads as a gap. Defaults to the data. |
| `x` | `{ kind: 'time' }` (default) or `{ kind: 'value', label, unit }` for lag, frequency and phase plane. |
| `gapStepMs` | Spacing beyond which a line breaks. A number, `'auto'` (default: 3 × median step, never on a held series) or `null` (only the nulls in the data). |
| `noSample` | Known no-sample intervals. Computed from the data when absent. |
| `marks` | Labelled shaded areas on the first pane (evaluated window, trajectory bounds). |
| `scale` | `'fit'` (default) or `'range'`, the declared range of each axis. |
| `source`, `aggregation` | **Required.** The line under the chart. |
| `state` | See below. |
| `context` | The selected context. Visible in every state. |
| `toolbar` | Page controls, placed before the zoom buttons. The panel has no series toggles or export of its own. |
| `group` | Panels with the same group share a cursor through `echarts.connect`. Give them the same window. |
| `selectedBandId`, `onSelectBand` | The selected verdict band. Called with `(band, lane)`, or `(null, null)` when cleared. |
| `cursorAt`, `onCursorChange` | A controlled cursor (the replay slider). Leave `cursorAt` undefined for the panel to own it. |

**Axes.** `{ id, label, unit, output, range, bounds, log }`. The unit is appended to the label, and a
blank unit prints "unit not set". An `output` axis says "%" only when `range` is declared. A series
naming an axis its pane lacks throws, because reading in the wrong unit is worse than an error.

**Series.** `{ id, label, role, axis, x, y, ... }`. `x` and `y` are array-likes, so typed arrays pass
through. Null and NaN are gaps. `role` picks the look: `pv` solid, `sp` dashed, `op`, `vp` with
triangles, `overlay`, `neutral`, `danger`, or `pen` with `penIndex`. `estimated` gives a dash-dot
pattern and "(estimated)" in the label. Also `held` (step, read back as the held value), `markers`,
`markerSymbol`, `dashed`, `area`, `meta(i)` (extra tooltip lines). Violet is not reachable from any role.

**Adapters.** `trendPointsToPane` (C1, C2, C3), `cpmSeriesToPane` (C4, C8), `pensToPane` (C11).
`Segment` and `LaneInterval` already fit `TrendSegment`. Trajectory and phase-plane pairs are a series
on a value axis: the line follows sample order.

## States

| `state.kind` | Shows |
|---|---|
| `ready` (default) | The chart. With no sample at all it shows the empty text by itself, so a stalled feed cannot look like a blank chart. |
| `loading` | "Loading" with `message`, `role="status"`. |
| `empty` | "No samples" with `message` and `action`. |
| `error` | "Could not load the trend" with `message` and `action`, `role="alert"`. |
| `stale` | The chart stays, under "Stale since 4 Nov 2026, 13:15:20 GST". `since` is required. |

Heading, `context` and the source line stay in every state. Without a chart the window reads
"Requested: …", never "Plotted: …". The zoom and table buttons appear only with a chart.

## Keyboard

The canvas sits in `role="img"`, so the focus targets are sliders laid over the grids. A slider is
what makes a screen reader pass arrow keys through.

| Focus | Key | Effect |
|---|---|---|
| Plot | Left, Right, Up, Down | Move one sample point. |
| Plot | Shift with an arrow | Move ten points. |
| Plot | Home, End | First or last point in the plotted window. |
| Plot | Enter | Select the verdict band at the cursor. |
| Lane | Arrows, Home, End | Move one segment, because a day of points is too many key presses. |
| Lane | Enter | Select the segment, on a verdict lane. |
| Either | Esc | Clear the cursor and the selection. With nothing to clear, Esc passes on to the drawer or dialog around the panel. |

Each keyboard move states the reading in an `aria-live="polite"` region. A mouse never does. A click on
the plot places the cursor, and a click on a verdict band selects it.

## Behaviour worth knowing

- **Zoom** is buttons: Zoom in, Zoom area (drag a rectangle), Undo zoom, Reset. The plotted label, the
  ticks, the direct labels and the table all follow it. Zoom in halves the span around the cursor,
  and shares its history with a dragged rectangle.
- **No-sample hatch** covers a stretch only where every measured series in the pane is silent. A
  held setpoint does not fill a PV outage. The line still breaks for one silent series among several.
  `decal` does not reach `markArea` in ECharts 5.6, so the hatch is a canvas tile. A band narrower
  than 8 % of the window has no room for its label; the tooltip and the table still say "No sample".
- **One reading, one source.** The tooltip, the live region and the value table all read
  `snapshotAt`. Inside a gap the pointer stays put and the reading says "No sample".
- **Sampling.** Above 5 000 rows a line is drawn through LTTB, which keeps nulls. The source line
  says so, and the table lists every point.
- **Zone.** `useUTC` keeps ECharts off the browser zone when placing ticks, and every label is
  formatted in `zone`. In a zone with a half-hour offset the ticks fall on the half hour, which is correct.

## Tests

`npx vitest run src/ui/trend`. `trendRender.test.ts` runs real ECharts to SVG with no browser, so it
proves what is drawn: broken paths, dash arrays, lane text, the hatch pattern. The other files cover
the pure builders, and the panel with `echarts-for-react` mocked.
