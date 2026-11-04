/**
 * The canvas and its keyboard surface. The canvas sits in a `role="img"` container, which hides its
 * children from assistive technology, so the focus targets are siblings laid over the grids. They
 * are sliders because that role is what puts a screen reader into a mode that passes arrow keys on.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import type { ECharts } from 'echarts';
import { LANE_SERIES_PREFIX } from './trendLanes';
import { segmentAt, visibleSegments, type TrendModel } from './trendModel';
import type { GridRect } from './trendLayout';
import { applyCursor, type CursorChart, type TrendCursor } from './useTrendCursor';
import type { Interval, TrendLane } from './trendTypes';

/** Where the plot's focus ring goes: around every pane, from the top of the first to the foot of the last. */
function panesRect(panes: GridRect[]): GridRect {
  const end = panes[panes.length - 1];
  return { ...panes[0], height: end.top + end.height - panes[0].top };
}

const PLOT_HELP = 'Arrow keys move the cursor one point, Shift with an arrow moves ten, Home and End go to the ends. Enter selects the verdict band at the cursor. Escape clears.';
const LANE_HELP = 'Arrow keys move one segment. Enter selects a verdict band. Escape clears.';

interface ChartClick {
  seriesId?: string;
  dataIndex?: number;
}

export const TrendPlot: React.FC<{
  id: string;
  heading: string;
  description: string;
  option: Record<string, unknown>;
  model: TrendModel;
  plotted: Interval | null;
  cursor: TrendCursor;
  chart: ECharts | null;
  onChart: (chart: ECharts) => void;
  onDataZoom: () => void;
}> = ({ id, heading, description, option, model, plotted, cursor, chart, onChart, onDataZoom }) => {
  const { layout, lanes } = model;
  const style = useMemo(() => ({ height: layout.height }), [layout.height]);

  // The handlers outlive a render (ZRender keeps the first one), so they read the latest values here.
  const latest = useRef({ cursor, lanes, grids: layout.grids.map((_, i) => i) });
  latest.current = { cursor, lanes, grids: layout.grids.map((_, i) => i) };

  const onReady = (instance: ECharts) => {
    onChart(instance);
    instance.getZr().on('click', e => {
      const point = [e.offsetX, e.offsetY];
      if (!instance.containPixel({ gridIndex: latest.current.grids }, point)) return;
      const at = instance.convertFromPixel({ xAxisIndex: 0 }, e.offsetX);
      if (Number.isFinite(at)) latest.current.cursor.placeNear(at);
    });
  };

  const onEvents = useMemo(() => ({
    datazoom: onDataZoom,
    click: (e: ChartClick) => {
      if (!e.seriesId?.startsWith(LANE_SERIES_PREFIX) || e.dataIndex == null) return;
      const lane = latest.current.lanes.find(l => `${LANE_SERIES_PREFIX}${l.id}` === e.seriesId);
      const band = lane?.segments[e.dataIndex];
      if (lane?.kind === 'verdict' && band) latest.current.cursor.selectBand(band, lane);
    },
  }), [onDataZoom]);

  // After the option is applied: `notMerge` drops the tooltip, so it is shown again.
  const shown = useRef(false);
  const at = cursor.at;
  const anchorY = layout.grids.length ? layout.grids[0].top + layout.grids[0].height / 2 : 0;
  useEffect(() => {
    if (!chart || chart.isDisposed()) return;
    if (at == null && !shown.current) return;
    shown.current = at != null;
    applyCursor(chart as unknown as CursorChart, at, anchorY);
  }, [chart, at, anchorY, option]);

  const laneSlider = (lane: TrendLane, index: number) => {
    const segments = plotted ? visibleSegments(lane, plotted) : lane.segments;
    const here = at == null ? null : segmentAt(lane, at);
    const position = here ? Math.max(0, segments.indexOf(here)) : 0;
    return (
      <div key={lane.id} className="trend__focus" style={layout.lanes[index]} tabIndex={0} role="slider"
        aria-label={`${lane.label} lane`} aria-orientation="horizontal" aria-describedby={`${id}-lane-help`}
        aria-valuemin={0} aria-valuemax={Math.max(0, segments.length - 1)} aria-valuenow={position}
        aria-valuetext={here ? here.label : `${segments.length} ${segments.length === 1 ? 'segment' : 'segments'}`}
        onKeyDown={e => cursor.onLaneKey(lane, e)} />
    );
  };

  return (
    <div className="trend__plot" style={style}>
      <div className="trend__canvas" role="img" aria-label={description}>
        <ReactECharts option={option} notMerge style={style} onChartReady={onReady} onEvents={onEvents} />
      </div>
      {layout.panes.length > 0 && cursor.points.length > 0 && (
        <div className="trend__focus" style={panesRect(layout.panes)}
          tabIndex={0} role="slider" aria-label={`${heading} cursor`} aria-orientation="horizontal" aria-describedby={`${id}-plot-help`}
          aria-valuemin={0} aria-valuemax={cursor.points.length - 1} aria-valuenow={cursor.index ?? 0}
          aria-valuetext={at == null ? 'No cursor placed' : `Point ${(cursor.index ?? 0) + 1} of ${cursor.points.length}`}
          onKeyDown={cursor.onPlotKey} />
      )}
      {lanes.map(laneSlider)}
      <span id={`${id}-plot-help`} className="trend__sr">{PLOT_HELP}</span>
      <span id={`${id}-lane-help`} className="trend__sr">{LANE_HELP}</span>
    </div>
  );
};
