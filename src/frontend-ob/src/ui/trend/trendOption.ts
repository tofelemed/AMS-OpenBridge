/**
 * The one option builder (CD12, CD14): one echarts instance, one grid per pane or lane, every x axis
 * pinned to the same domain and linked to one cursor. Pure, so it is tested without a canvas.
 *
 * `useUTC` keeps ECharts away from the browser zone when it places time ticks. The labels on those
 * ticks, the tooltip and the plotted label are all formatted in the site zone. The default tick and
 * pointer texts are replaced or off, so no browser-local time can reach the screen.
 */
import { axisChrome, chartFontFamily, onStatusInk, plainOption, tooltipChrome, type ChartPalette } from '../../charts/chartTheme';
import { FULL_ZOOM, boxZoomOption, type ZoomState } from '../../components/charts/boxZoom';
import { escapeHtml } from '../../utils/escapeHtml';
import { axisName, xFormat } from './trendFormat';
import { laneColors, laneSeries } from './trendLanes';
import { snapToPoint, snapshotAt, type CursorSnapshot, type TrendModel } from './trendModel';
import { bandSeries, hatchFill, hatchSeries, lineSeries, markSeries } from './trendSeries';
import type { Interval, TrendAxis, TrendMark } from './trendTypes';

export interface TrendOptionInput {
  model: TrendModel;
  zone: string;
  palette: ChartPalette;
  /** The window on screen, in axis units. */
  plotted: Interval | null;
  zoom?: ZoomState;
  /** The chart in words, for the ECharts `aria` option. */
  description: string;
  marks?: TrendMark[];
  scale?: 'fit' | 'range';
  selectedBandId?: string | null;
}

/** Fixed bounds win; the declared range applies on `scale="range"`; otherwise the axis fits the data. */
export function axisBounds(axis: TrendAxis, scale: 'fit' | 'range') {
  if (axis.bounds) return { ...axis.bounds, scale: axis.bounds.min == null || axis.bounds.max == null };
  if (scale === 'range' && axis.range) return { min: axis.range.min, max: axis.range.max, scale: false };
  return { scale: true };
}

/** The value axes that a dragged rectangle zooms: the first pane's only. Lanes and lower panes keep their y. */
export const yZoomAxes = (model: TrendModel) => model.axes.filter(a => a.gridIndex === 0).map(a => a.index);

export function tooltipHtml(s: CursorSnapshot): string {
  return [
    `<strong>${escapeHtml(s.xText)}</strong>`,
    ...s.values.flatMap(v => [`${escapeHtml(v.label)}: ${escapeHtml(v.text)}`, ...v.meta.map(line => `&nbsp;&nbsp;${escapeHtml(line)}`)]),
    ...s.bands.map(b => `${escapeHtml(b.label)}: ${escapeHtml(b.text)}`),
    ...s.lanes.map(l => `${escapeHtml(l.label)}: ${escapeHtml(l.text)}`),
  ].join('<br/>');
}

interface AxisTipParam {
  axisValue?: number | string;
}

export function buildTrendOption(input: TrendOptionInput) {
  const { model, zone, palette, plotted, description, marks, selectedBandId } = input;
  const zoom = input.zoom ?? FULL_ZOOM;
  const scale = input.scale ?? 'fit';
  const base = plainOption(palette);
  const axis = axisChrome(palette);
  const font = chartFontFamily();
  const format = xFormat(model.x, zone);
  const { grids, lanes: laneRects } = model.layout;
  const last = grids.length - 1;
  const span = plotted ? plotted.to - plotted.from : 0;
  const hatch = hatchFill(palette);
  const colors = laneColors(palette, onStatusInk());
  const laneAxisStart = model.axes.length;
  const laneGridStart = model.panes.length;

  const xAxis = grids.map((_, gridIndex) => {
    const shown = gridIndex === last;
    return {
      ...axis,
      type: model.x.kind === 'time' ? ('time' as const) : ('value' as const),
      gridIndex,
      ...(model.domain ? { min: model.domain.from, max: model.domain.to } : {}),
      ...(shown && plotted ? { name: format.name(plotted), nameLocation: 'middle' as const, nameGap: 28 } : {}),
      axisLabel: { ...axis.axisLabel, show: shown, hideOverlap: true, formatter: format.tick(span) },
      axisLine: { ...axis.axisLine, show: shown },
      axisTick: { ...axis.axisTick, show: shown },
      splitLine: { show: false },
      axisPointer: { ...axis.axisPointer, label: { ...axis.axisPointer.label, show: false } },
    };
  });

  const yAxis = [
    ...model.axes.map(a => ({
      ...axis,
      type: a.axis.log ? ('log' as const) : ('value' as const),
      gridIndex: a.gridIndex,
      position: a.side,
      offset: a.offset,
      name: axisName(a.axis),
      nameGap: 8 + a.row * 14,
      nameTextStyle: { ...axis.nameTextStyle, fontSize: 12, align: a.side },
      ...axisBounds(a.axis, scale),
      axisPointer: { show: false },
      splitLine: { show: a.side === 'left' && a.row === 0, lineStyle: { ...axis.splitLine.lineStyle, opacity: 0.2 } },
    })),
    ...laneRects.map((_, i) => ({ type: 'value' as const, gridIndex: laneGridStart + i, min: 0, max: 1, show: false })),
  ];

  const yZoom = yZoomAxes(model);
  const box = boxZoomOption({ xAxisIndex: grids.map((_, i) => i), yAxisIndex: yZoom.length ? yZoom : undefined, panOnDrag: true }, zoom);

  const series = [
    ...markSeries(model.panes[0], marks, palette, font),
    ...model.panes.flatMap(pane => [
      ...hatchSeries(pane, plotted, hatch, palette, font),
      ...pane.bands.flatMap(b => bandSeries(b, palette)),
      ...pane.series.flatMap((s, slot) => lineSeries(s, slot, plotted, palette, font)),
    ]),
    ...model.lanes.map((lane, i) => laneSeries(lane, laneGridStart + i, laneAxisStart + i, colors, font, selectedBandId)),
  ];

  return {
    ...base,
    textStyle: { ...base.textStyle, fontFamily: font },
    animation: false,
    useUTC: true,
    aria: { enabled: true, label: { enabled: true, description }, decal: { show: false } },
    grid: grids.map(g => ({ left: g.left, right: g.right, top: g.top, height: g.height })),
    axisPointer: { link: [{ xAxisIndex: 'all' as const }], snap: false },
    graphic: model.lanes.map((lane, i) => ({
      type: 'text' as const,
      left: 8,
      top: laneRects[i].top + 6,
      silent: true,
      style: { text: lane.label, fill: palette.tick, font: `12px ${font}` },
    })),
    tooltip: {
      ...tooltipChrome(palette),
      trigger: 'axis' as const,
      confine: true,
      formatter: (params: AxisTipParam | AxisTipParam[]) => {
        const at = Number((Array.isArray(params) ? params[0] : params)?.axisValue);
        return Number.isFinite(at) ? tooltipHtml(snapshotAt(model, snapToPoint(model, plotted, at), zone)) : '';
      },
    },
    toolbox: box.toolbox,
    dataZoom: box.dataZoom,
    xAxis,
    yAxis,
    series,
  };
}
