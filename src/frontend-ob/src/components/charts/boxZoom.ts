/**
 * Rectangle ("box") zoom for every ECharts trend (docs/cpa-ui-fix-plan.md Phase 5).
 *
 * Mechanism: ECharts' own toolbox dataZoom feature draws the selection rectangle
 * and zooms the axes it is given. Two facts drive the shape of this module, both
 * verified against echarts 5.6 in the lab:
 * - the feature only exists while the toolbox is SHOWN (a hidden toolbox builds
 *   no features), so the toolbox is shown but placed off-canvas; the controls the
 *   operator sees are OpenBridge buttons (ChartZoomBar), never ECharts icons;
 * - the feature writes its zoom into dataZoom components that control the same
 *   axes, so each chart carries two `inside` components with fixed ids whose
 *   start/end live in React state — a re-applied option (`notMerge`, live ticks)
 *   keeps the zoom instead of discarding it.
 *
 * Pure: option fragments and readers only; the hook (useBoxZoom) owns the state.
 */
export interface ZoomRange { start: number; end: number }
export interface ZoomState { x: ZoomRange; y: ZoomRange }

export const FULL_RANGE: ZoomRange = { start: 0, end: 100 };
export const FULL_ZOOM: ZoomState = { x: FULL_RANGE, y: FULL_RANGE };
export const BOX_X = 'bz-x';
export const BOX_Y = 'bz-y';

const EPS = 0.05;
const sameRange = (a: ZoomRange, b: ZoomRange) => Math.abs(a.start - b.start) < EPS && Math.abs(a.end - b.end) < EPS;
export const sameZoom = (a: ZoomState, b: ZoomState) => sameRange(a.x, b.x) && sameRange(a.y, b.y);
export const isZoomed = (z: ZoomState) => !sameZoom(z, FULL_ZOOM);

export interface BoxZoomAxes {
  xAxisIndex: number | number[];
  /** Omit for x-only zoom (categorical lanes, charts whose y is a fixed band). */
  yAxisIndex?: number | number[];
  /** The x component also zooms on the mouse wheel (default true) and pans on drag when not selecting (default false). */
  wheel?: boolean;
  panOnDrag?: boolean;
}

/** The option fragment a chart spreads into its option: the off-canvas toolbox and the two box components. */
export function boxZoomOption(axes: BoxZoomAxes, zoom: ZoomState) {
  const hasY = axes.yAxisIndex != null;
  return {
    toolbox: {
      show: true, top: -1000, left: -1000, showTitle: false, itemSize: 0,
      feature: { dataZoom: { xAxisIndex: axes.xAxisIndex, yAxisIndex: hasY ? axes.yAxisIndex : 'none', filterMode: 'none' as const, icon: { zoom: 'path://', back: 'path://' } } },
    },
    dataZoom: [
      {
        id: BOX_X, type: 'inside' as const, xAxisIndex: axes.xAxisIndex, filterMode: 'none' as const,
        start: zoom.x.start, end: zoom.x.end,
        zoomOnMouseWheel: axes.wheel ?? true, moveOnMouseMove: axes.panOnDrag ?? false, moveOnMouseWheel: false,
      },
      ...(hasY ? [{
        id: BOX_Y, type: 'inside' as const, yAxisIndex: axes.yAxisIndex, filterMode: 'none' as const,
        start: zoom.y.start, end: zoom.y.end,
        zoomOnMouseWheel: false, moveOnMouseMove: false, moveOnMouseWheel: false,
      }] : []),
    ],
  };
}

interface DataZoomLike { id?: string; start?: number; end?: number }

/** The box components' current ranges from `chart.getOption()`; a missing component reads as full. */
export function readZoom(option: { dataZoom?: DataZoomLike[] | DataZoomLike } | undefined): ZoomState {
  const list = option?.dataZoom == null ? [] : Array.isArray(option.dataZoom) ? option.dataZoom : [option.dataZoom];
  const range = (id: string): ZoomRange => {
    const z = list.find(d => d.id === id);
    return z && typeof z.start === 'number' && typeof z.end === 'number' ? { start: z.start, end: z.end } : FULL_RANGE;
  };
  return { x: range(BOX_X), y: range(BOX_Y) };
}

/** The `dataZoom` action batch that applies a state to the box components a chart has. */
export function zoomBatch(zoom: ZoomState, hasY: boolean) {
  return [
    { dataZoomId: BOX_X, start: zoom.x.start, end: zoom.x.end },
    ...(hasY ? [{ dataZoomId: BOX_Y, start: zoom.y.start, end: zoom.y.end }] : []),
  ];
}
