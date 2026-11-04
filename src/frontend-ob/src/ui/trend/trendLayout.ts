/**
 * Grid geometry in px. Panes stack first, lanes under them, and the one visible time axis under
 * the last grid. The focus overlays reuse the same rectangles, so they sit exactly on the lanes.
 */
export interface GridRect {
  top: number;
  height: number;
  left: number;
  right: number;
}

export interface TrendLayout {
  panes: GridRect[];
  lanes: GridRect[];
  /** Every grid in echarts order: panes, then lanes. */
  grids: GridRect[];
  height: number;
}

const GUTTER_MIN = 64;
const GUTTER_MAX = 140;
const END_MARGIN = 24;
/** Width of one extra value axis on a side. */
export const AXIS_STEP = 56;
/** Height of one row of axis names above a pane. */
export const NAME_ROW = 14;
const NAME_ROOM = 12;
const LANE_HEIGHT = 24;
const LANE_GAP = 4;
const BOTTOM = 48;
/** Average width of a 12 px label character, for fitting text without a canvas. */
export const CHAR_PX = 7;

export const defaultPaneHeight = (index: number) => (index === 0 ? 240 : 120);

/** The side, offset and name row of the nth value axis of a pane: left, right, left, right. */
export function axisSlot(index: number): { side: 'left' | 'right'; offset: number; row: number } {
  const row = Math.floor(index / 2);
  return { side: index % 2 === 0 ? 'left' : 'right', offset: row * AXIS_STEP, row };
}

export function trendLayout(panes: Array<{ height?: number; axisCount: number }>, laneLabels: string[]): TrendLayout {
  const longest = laneLabels.reduce((n, l) => Math.max(n, l.length), 0);
  const gutter = Math.max(GUTTER_MIN, Math.min(GUTTER_MAX, 16 + longest * CHAR_PX));
  const axes = Math.max(1, ...panes.map(p => p.axisCount));
  const leftAxes = Math.ceil(axes / 2);
  const rightAxes = Math.floor(axes / 2);
  const left = gutter + (leftAxes - 1) * AXIS_STEP;
  const right = rightAxes ? GUTTER_MIN + (rightAxes - 1) * AXIS_STEP : END_MARGIN;

  let cursor = 0;
  const paneRects = panes.map((pane, i) => {
    cursor += NAME_ROOM + Math.ceil(Math.max(1, pane.axisCount) / 2) * NAME_ROW;
    const rect = { top: cursor, height: pane.height ?? defaultPaneHeight(i), left, right };
    cursor += rect.height;
    return rect;
  });
  if (panes.length) cursor += LANE_GAP * 2;
  const laneRects = laneLabels.map(() => {
    const rect = { top: cursor, height: LANE_HEIGHT, left, right };
    cursor += LANE_HEIGHT + LANE_GAP;
    return rect;
  });
  return { panes: paneRects, lanes: laneRects, grids: [...paneRects, ...laneRects], height: cursor + BOTTOM };
}
