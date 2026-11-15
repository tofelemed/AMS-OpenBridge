/**
 * CHG-197 (owner Q10, the approved sample docs/theme/redesign/samples/19-response-curve-SAMPLE-*.png): the marks a response
 * trend draws over its curves, in plain words: the step line, guides at a level, spans between two times (arrows both ends),
 * brackets between two levels, measured points as dots, shaded bands, free segments (a slope and its rise over run) and
 * labels. Marks are declared here and turned into ECharts series by CpmChart with its own palette (CpmChart `annotate`), so
 * they follow the theme: annotation text in the secondary text colour, values in the primary text colour at weight 600.
 * CHG-200: each trend's value axis is fixed to its curves and its marks' levels (trendSupport.trendYRange), and the labels are
 * placed by labelLayout against it.
 */
import type { ChartPalette } from '../../../../charts/chartTheme';
import type { Annotations, ChartPlot, CpmSeries } from '../../evidence/CpmChart';
import { layoutLabels } from './labelLayout';

/** A label: words, then the value in the value style ("Dead time" + "34 s"). */
export interface MarkLabel { text: string; value?: string }
type Side = 'top' | 'bottom' | 'left' | 'right';

/** Times are epoch milliseconds; levels are in the trend's value unit. */
export type Mark =
  | { kind: 'step'; x: number; label: string }
  | { kind: 'vguide'; x: number }
  | { kind: 'guide'; y: number; label?: MarkLabel; from?: number; to?: number; dotted?: boolean }
  | { kind: 'span'; x1: number; x2: number; y: number; label: MarkLabel; /** a span too short to hold its label: the label follows it */ short?: boolean }
  | { kind: 'bracket'; x: number; y1: number; y2: number; label?: MarkLabel; side?: Side }
  | { kind: 'dot'; x: number; y: number; label?: MarkLabel; side?: Side }
  | { kind: 'band'; x1: number; x2: number; y1: number; y2: number; label?: MarkLabel }
  | { kind: 'segment'; x1: number; y1: number; x2: number; y2: number; dashed?: boolean }
  | { kind: 'text'; x: number; y: number; label: MarkLabel; side?: Side };

const formatter = (l: MarkLabel) => (l.value ? `${l.text} {v|${l.value}}` : l.text);

/** The lowest and highest level the marks use (an axis must reach them for them to show). */
export function markLevels(marks: Mark[]): number[] {
  const ys: number[] = [];
  for (const m of marks) {
    if ('y' in m) ys.push(m.y);
    if ('y1' in m) ys.push(m.y1, m.y2);
  }
  return ys.length > 0 ? [Math.min(...ys), Math.max(...ys)] : [];
}

/** CHG-200: what the labels are placed against: the trend's curves, its time range and its fixed value range. */
export interface MarkFrame { series: CpmSeries[]; xRange: [number, number]; yRange: { min: number; max: number } }

/**
 * The CpmChart `annotate` callback for these marks, all on the value axis of `unit`. CHG-200 (final test #2, #4, #15; C2): the
 * labels are placed by labelLayout so none sits on a drawn line or another label; the ones with no free place (and, on a narrow
 * chart, the ones with a value) come back as notes, listed under the chart.
 */
export function drawMarks(marks: Mark[], unit: string, frame: MarkFrame) {
  return (p: ChartPalette, axisOf: (u: string) => number, plot: ChartPlot): Annotations => {
    if (marks.length === 0) return { series: [], notes: [] };
    const yAxisIndex = axisOf(unit);
    const rich = { v: { color: p.text, fontWeight: 600 } };
    const ink = (type: 'solid' | 'dashed' | 'dotted') => ({ color: p.tick, width: 1, type });
    const lines: unknown[] = [], areas: unknown[] = [], dots: unknown[] = [];
    const layout = layoutLabels(marks, frame.series, { width: plot.width, height: plot.height, x: frame.xRange, y: [frame.yRange.min, frame.yRange.max], narrow: plot.narrow });
    // a label only (no symbol), its top-left corner at the place the layout chose
    const labels = layout.placed.map(l => ({
      coord: l.at, symbol: 'circle', symbolSize: 0,
      label: { show: true, position: [0, 0], align: 'left', verticalAlign: 'top', color: p.tick, formatter: formatter(l.label), rich },
    }));
    for (const m of marks) {
      switch (m.kind) {
        case 'step':
          lines.push({ xAxis: m.x, lineStyle: ink('dashed'), label: { show: true, position: 'end', color: p.tick, formatter: m.label } });
          break;
        case 'vguide':
          lines.push({ xAxis: m.x, lineStyle: ink('dotted'), label: { show: false } });
          break;
        case 'guide':
          if (m.from == null || m.to == null) lines.push({ yAxis: m.y, lineStyle: ink(m.dotted ? 'dotted' : 'dashed'), label: { show: false } });
          else lines.push([{ coord: [m.from, m.y], lineStyle: ink(m.dotted ? 'dotted' : 'dashed'), label: { show: false } }, { coord: [m.to, m.y] }]);
          break;
        case 'span':
          lines.push([{ coord: [m.x1, m.y], symbol: 'arrow', symbolSize: 7, lineStyle: ink('solid'), label: { show: false } }, { coord: [m.x2, m.y], symbol: 'arrow', symbolSize: 7 }]);
          break;
        case 'bracket':
          lines.push([{ coord: [m.x, m.y1], symbol: 'arrow', symbolSize: 7, lineStyle: ink('solid'), label: { show: false } }, { coord: [m.x, m.y2], symbol: 'arrow', symbolSize: 7 }]);
          break;
        case 'dot':
          dots.push({ value: [m.x, m.y], label: { show: false } });
          break;
        case 'band':
          areas.push([{ coord: [m.x1, m.y1], label: { show: false } }, { coord: [m.x2, m.y2] }]);
          break;
        case 'segment':
          lines.push([{ coord: [m.x1, m.y1], lineStyle: ink(m.dashed ? 'dashed' : 'solid'), label: { show: false } }, { coord: [m.x2, m.y2] }]);
          break;
        case 'text':
          break;
      }
    }
    const series: Array<Record<string, unknown>> = [{
      id: 'marks', type: 'line', data: [], yAxisIndex, silent: true, z: 5, showSymbol: false, symbol: 'none', lineStyle: { opacity: 0 },
      markLine: { silent: true, animation: false, symbol: ['none', 'none'], data: lines },
      markArea: { silent: true, animation: false, itemStyle: { color: p.cursor, opacity: 0.5 }, data: areas },
      markPoint: { silent: true, animation: false, data: labels },
    }];
    if (dots.length > 0) series.push({ id: 'marks-dots', type: 'scatter', yAxisIndex, silent: true, z: 6, symbolSize: 8, itemStyle: { color: p.text }, data: dots });
    return { series, notes: layout.notes };
  };
}
