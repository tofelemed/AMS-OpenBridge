/**
 * CHG-197 (owner Q10, the approved sample docs/theme/redesign/samples/19-response-curve-SAMPLE-*.png): the marks a response
 * trend draws over its curves, in plain words: the step line, guides at a level, spans between two times (arrows both ends),
 * brackets between two levels, measured points as dots, shaded bands, free segments (a slope and its rise over run) and
 * labels. Marks are declared here and turned into ECharts series by CpmChart with its own palette (CpmChart `annotate`), so
 * they follow the theme: annotation text in the secondary text colour, values in the primary text colour at weight 600.
 * ECharts does not widen an axis for a mark, so the marks' own lowest and highest levels (with room for their labels) ride on an
 * invisible pair of points.
 */
import type { ChartPalette } from '../../../../charts/chartTheme';

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

/** The CpmChart `annotate` callback for these marks, all on the value axis of `unit`. */
export function drawMarks(marks: Mark[], unit: string) {
  return (p: ChartPalette, axisOf: (u: string) => number): Array<Record<string, unknown>> => {
    if (marks.length === 0) return [];
    const yAxisIndex = axisOf(unit);
    const rich = { v: { color: p.text, fontWeight: 600 } };
    const text = (l: MarkLabel | undefined, position: string) =>
      (l ? { show: true, position, color: p.tick, formatter: formatter(l), rich } : { show: false });
    const ink = (type: 'solid' | 'dashed' | 'dotted') => ({ color: p.tick, width: 1, type });
    const lines: unknown[] = [], areas: unknown[] = [], labels: unknown[] = [], dots: unknown[] = [];
    const say = (x: number, y: number, l: MarkLabel, side: Side) =>
      labels.push({ coord: [x, y], symbol: 'circle', symbolSize: 0, label: text(l, side) });   // a label only: no symbol
    for (const m of marks) {
      switch (m.kind) {
        case 'step':
          lines.push({ xAxis: m.x, lineStyle: ink('dashed'), label: { show: true, position: 'end', color: p.tick, formatter: m.label } });
          break;
        case 'vguide':
          lines.push({ xAxis: m.x, lineStyle: ink('dotted'), label: { show: false } });
          break;
        case 'guide':
          if (m.from == null || m.to == null) lines.push({ yAxis: m.y, lineStyle: ink(m.dotted ? 'dotted' : 'dashed'), label: text(m.label, 'insideStartTop') });
          else lines.push([{ coord: [m.from, m.y], lineStyle: ink(m.dotted ? 'dotted' : 'dashed'), label: text(m.label, 'insideStartTop') }, { coord: [m.to, m.y] }]);
          break;
        case 'span':
          lines.push([{ coord: [m.x1, m.y], symbol: 'arrow', symbolSize: 7, lineStyle: ink('solid'), label: text(m.label, m.short ? 'end' : 'insideMiddleTop') },
            { coord: [m.x2, m.y], symbol: 'arrow', symbolSize: 7 }]);
          break;
        case 'bracket':
          lines.push([{ coord: [m.x, m.y1], symbol: 'arrow', symbolSize: 7, lineStyle: ink('solid'), label: { show: false } },
            { coord: [m.x, m.y2], symbol: 'arrow', symbolSize: 7 }]);
          if (m.label) say(m.x, (m.y1 + m.y2) / 2, m.label, m.side ?? 'left');
          break;
        case 'dot':
          dots.push({ value: [m.x, m.y], label: text(m.label, m.side ?? 'top') });
          break;
        case 'band':
          areas.push([{ coord: [m.x1, m.y1], label: text(m.label, 'insideTopRight') }, { coord: [m.x2, m.y2] }]);
          break;
        case 'segment':
          lines.push([{ coord: [m.x1, m.y1], lineStyle: ink(m.dashed ? 'dashed' : 'solid'), label: { show: false } }, { coord: [m.x2, m.y2] }]);
          break;
        case 'text':
          say(m.x, m.y, m.label, m.side ?? 'right');
          break;
      }
    }
    const x0 = marks.map(m => ('x' in m ? m.x : 'x1' in m ? m.x1 : NaN)).find(Number.isFinite) ?? 0;
    const levels = markLevels(marks);
    const pad = levels.length > 0 ? Math.max((levels[1] - levels[0]) * 0.12, Math.abs(levels[1]) * 1e-3, 1e-6) : 0;
    const out: Array<Record<string, unknown>> = [{
      id: 'marks', type: 'line', data: levels.length > 0 ? [[x0, levels[0] - pad], [x0, levels[1] + pad]] : [], yAxisIndex, silent: true, z: 5,
      showSymbol: false, symbol: 'none', lineStyle: { opacity: 0 },
      markLine: { silent: true, animation: false, symbol: ['none', 'none'], data: lines },
      markArea: { silent: true, animation: false, itemStyle: { color: p.cursor, opacity: 0.5 }, data: areas },
      markPoint: { silent: true, animation: false, data: labels },
    }];
    if (dots.length > 0) {
      out.push({ id: 'marks-dots', type: 'scatter', yAxisIndex, silent: true, z: 6, symbolSize: 8, itemStyle: { color: p.text }, data: dots });
    }
    return out;
  };
}
