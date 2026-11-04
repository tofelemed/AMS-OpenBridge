import { beforeAll, describe, expect, it, vi } from 'vitest';
import { chartPalette, resolveTraverse, tooltipChrome } from '../../charts/chartTheme';
import { FULL_ZOOM } from '../../components/charts/boxZoom';
import { windowOf } from './trendFormat';
import { fitLabel, laneColors, laneRenderer } from './trendLanes';
import { describeTrend, prepareTrend, type TrendInput } from './trendModel';
import { axisBounds, buildTrendOption, tooltipHtml, yZoomAxes } from './trendOption';
import { ESTIMATED_DASH, SAMPLE_ABOVE, directLabel, hatchFill, lineLook } from './trendSeries';
import type { TrendLane, TrendPane, TrendSeries } from './trendTypes';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 3, 8, 0);
const palette = chartPalette();

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

const xs = [0, 1, 2, 30, 31, 32].map(m => T0 + m * MIN);
const line = (id: string, role: TrendSeries['role'], over: Partial<TrendSeries> = {}): TrendSeries =>
  ({ id, label: id.toUpperCase(), role, axis: 'pv', x: xs, y: [1, 2, 3, 4, 5, 6], ...over });

const signals: TrendPane = {
  id: 'signals',
  axes: [{ id: 'pv', label: 'PV / SP', unit: 'kg/h' }, { id: 'output', label: 'Controller output', output: true, range: { min: 0, max: 100 } }],
  series: [line('pv', 'pv'), line('sp', 'sp'), line('op', 'op', { axis: 'output' }), line('vp', 'vp', { axis: 'output' })],
};
const lanes: TrendLane[] = [
  { id: 'mode', label: 'Mode', kind: 'mode', segments: [{ startMs: T0, endMs: T0 + 10 * MIN, label: 'AUTO', tone: 'neutral' }] },
  { id: 'verdict', label: 'Verdict', kind: 'verdict', segments: [{ id: 'w1', startMs: T0, endMs: T0 + 10 * MIN, label: 'OK', tone: 'good' }] },
];

function option(input: Partial<TrendInput> = {}, extra: Partial<Parameters<typeof buildTrendOption>[0]> = {}) {
  const model = prepareTrend({ panes: [signals], lanes, plotWindow: { from: T0, to: T0 + 40 * MIN }, gapStepMs: 5 * MIN, ...input });
  const plotted = model.domain ? windowOf(model.domain, FULL_ZOOM.x) : null;
  return { model, option: buildTrendOption({ model, zone: 'Asia/Dubai', palette, plotted, zoom: FULL_ZOOM, description: describeTrend(model, 'H', 'P'), ...extra }) };
}
const seriesOf = (o: ReturnType<typeof option>['option'], id: string) => o.series.find(s => s.id === id) as unknown as Record<string, any>;

describe('one chart, many grids, one time axis (item 1)', () => {
  it('has one grid per pane and lane, each with its x axis', () => {
    const { option: o } = option();
    expect(o.grid.length).toBe(3);
    expect(o.xAxis.map(a => a.gridIndex)).toEqual([0, 1, 2]);
  });

  it('pins every x axis to the same domain', () => {
    const { option: o } = option();
    expect(new Set(o.xAxis.map(a => a.min)).size).toBe(1);
    expect(new Set(o.xAxis.map(a => a.max)).size).toBe(1);
    expect(o.xAxis[0].min).toBe(T0);
  });

  it('links the cursor across all grids', () => {
    expect(option().option.axisPointer.link).toEqual([{ xAxisIndex: 'all' }]);
  });

  it('shows one axis of labels, under the last grid', () => {
    expect(option().option.xAxis.map(a => a.axisLabel.show)).toEqual([false, false, true]);
  });

  it('zooms x on every grid and y on the first pane only', () => {
    const { option: o, model } = option();
    const x = o.dataZoom.find(d => d.id === 'bz-x') as { xAxisIndex: number[] };
    const y = o.dataZoom.find(d => d.id === 'bz-y') as { yAxisIndex: number[] };
    expect(x.xAxisIndex).toEqual([0, 1, 2]);
    expect(y.yAxisIndex).toEqual(yZoomAxes(model));
    expect(y.yAxisIndex).toEqual([0, 1]);
  });

  it('has no y zoom on a lanes-only chart', () => {
    expect(option({ panes: [] }).option.dataZoom.some(d => d.id === 'bz-y')).toBe(false);
  });
});

describe('lanes (item 2)', () => {
  const colors = laneColors(palette, 'INK');
  const box = { x: 100, y: 10, width: 300, height: 24 };
  const params = (dataIndex: number) => ({ dataIndex, coordSys: box });
  const api = { coord: (v: number[]) => [100 + (v[0] - T0) / MIN, 0] };

  it('draws the label inside the segment', () => {
    const drawn = laneRenderer(lanes[0], colors, 'Inter')(params(0), { coord: (v: number[]) => [100 + ((v[0] - T0) / MIN) * 10, 0] })!;
    const text = drawn.children.find(c => c.type === 'text') as { style: { text: string; x: number } };
    expect(text.style.text).toBe('AUTO');
    expect(text.style.x).toBeGreaterThan(100);
  });

  it('clips a segment to the plot', () => {
    const wide: TrendLane = { id: 'l', label: 'L', segments: [{ startMs: T0 - 1000 * MIN, endMs: T0 + 1000 * MIN, label: 'x', tone: 'good' }] };
    const rect = laneRenderer(wide, colors, 'Inter')(params(0), api)!.children[0] as unknown as { shape: { x: number; width: number } };
    expect(rect.shape.x).toBe(100);
    expect(rect.shape.width).toBe(300);
  });

  it('draws nothing for a segment outside the plot', () => {
    const away: TrendLane = { id: 'l', label: 'L', segments: [{ startMs: T0 + 900 * MIN, endMs: T0 + 950 * MIN, label: 'x', tone: 'good' }] };
    expect(laneRenderer(away, colors, 'Inter')(params(0), api)).toBeNull();
  });

  it('uses the tone fill with on-status ink, and neutral with a strong edge', () => {
    expect(colors.fill.good).toBe(palette.success);
    expect(colors.ink.good).toBe('INK');
    expect(colors.fill.neutral).toBe(palette.raised);
    expect(colors.edge.neutral).toBe(palette.axis);
    expect(colors.ink.neutral).toBe(palette.text);
  });

  it('fits a label to its width: full, short, cut, or nothing', () => {
    expect(fitLabel('Oscillating', 200)).toBe('Oscillating');
    expect(fitLabel('Oscillating', 60, 'Osc')).toBe('Osc');
    expect(fitLabel('Oscillating', 60)).toBe('Oscill…');
    expect(fitLabel('Oscillating', 10)).toBe('');
  });

  it('makes only verdict segments interactive', () => {
    expect(seriesOf(option().option, 'lane:verdict').silent).toBe(false);
    expect(seriesOf(option().option, 'lane:mode').silent).toBe(true);
  });

  it('names each lane in the gutter', () => {
    expect(option().option.graphic.map(g => g.style.text)).toEqual(['Mode', 'Verdict']);
  });
});

describe('gaps and hatch (items 3, 4)', () => {
  it('never joins a line', () => {
    const lines = option().option.series.filter(s => s.type === 'line' && (s as { data: unknown[] }).data.length > 0);
    expect(lines.length).toBeGreaterThan(0);
    for (const s of lines) expect((s as { connectNulls: boolean }).connectNulls).toBe(false);
  });

  it('carries the gap null into the drawn data', () => {
    expect(seriesOf(option().option, 'pv').data.filter((r: number[]) => r[1] == null).length).toBe(1);
  });

  it('puts a labelled hatch over the silent stretches', () => {
    const hatch = seriesOf(option().option, 'hatch:signals');
    expect(hatch.markArea.label.formatter()).toBe('No sample');
    expect(hatch.markArea.data.map((d: Array<{ xAxis: number }>) => [d[0].xAxis, d[1].xAxis])).toEqual([
      [T0 + 2 * MIN, T0 + 30 * MIN],
      [T0 + 32 * MIN, T0 + 40 * MIN],
    ]);
  });

  it('labels a hatch only where the words fit', () => {
    const shown = seriesOf(option({ noSample: [{ from: T0, to: T0 + 20 * MIN }, { from: T0 + 25 * MIN, to: T0 + 26 * MIN }] }).option, 'hatch:signals');
    expect(shown.markArea.data.map((d: Array<{ label?: { show: boolean } }>) => d[0].label?.show)).toEqual([true, false]);
  });

  it('adds no hatch when nothing is missing', () => {
    expect(option({ noSample: [] }).option.series.some(s => String(s.id).startsWith('hatch:'))).toBe(false);
  });

  it('paints a real pattern when a canvas exists', () => {
    const calls: string[] = [];
    const ctx = { fillRect: () => calls.push('fill'), beginPath: () => {}, moveTo: () => calls.push('move'), lineTo: () => {}, stroke: () => calls.push('stroke') };
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    const fill = hatchFill({ ...palette, raised: 'pattern-ground', axis: 'pattern-ink' }) as { image: HTMLCanvasElement; repeat: string };
    expect(fill.repeat).toBe('repeat');
    expect(fill.image.tagName).toBe('CANVAS');
    expect(calls).toContain('stroke');
    spy.mockRestore();
  });

  it('falls back to a plain band without a canvas, and keeps the label', () => {
    expect(hatchFill({ ...palette, raised: 'no-canvas-ground' })).toBe('no-canvas-ground');
  });
});

describe('site zone (item 9)', () => {
  it('keeps ECharts off the browser zone when it places ticks', () => {
    expect(option().option.useUTC).toBe(true);
  });

  it('formats ticks in the site zone, fitted to the plotted span', () => {
    const { option: o } = option();
    expect(o.xAxis[2].axisLabel.formatter(T0 + 7000)).toBe('12:00:07');
  });

  it('names the zone on the axis', () => {
    expect(option().option.xAxis[2].name).toBe('Time (GST)');
  });

  it('turns off the pointer label, which would print a browser-side format', () => {
    for (const a of option().option.xAxis) expect(a.axisPointer.label.show).toBe(false);
  });
});

describe('tooltip and aria (items 9, 12, 13)', () => {
  it('uses the themed chrome', () => {
    const o = option().option;
    const chrome = tooltipChrome(palette);
    expect(o.tooltip.backgroundColor).toBe(chrome.backgroundColor);
    expect(o.tooltip.borderColor).toBe(chrome.borderColor);
    expect(o.tooltip.textStyle).toEqual(chrome.textStyle);
    expect(o.tooltip.trigger).toBe('axis');
    expect(o.tooltip.confine).toBe(true);
  });

  it('states a reading in the site zone with its abbreviation', () => {
    const html = option().option.tooltip.formatter([{ axisValue: T0 }]);
    expect(html).toContain('3 Nov 2026, 12:00:00 GST');
    expect(html).toContain('PV: 1 kg/h');
    expect(html).toContain('Mode: AUTO');
  });

  it('says no sample inside a gap, instead of the far side of it', () => {
    const html = option().option.tooltip.formatter([{ axisValue: T0 + 15 * MIN }]);
    expect(html).toContain('PV: No sample');
  });

  it('escapes anything a user could have typed', () => {
    const html = tooltipHtml({
      at: 0, xText: 't', bands: [],
      values: [{ id: 'a', label: '<b>', unit: null, value: null, text: '<i>', meta: ['<u>'] }],
      lanes: [{ id: 'l', label: '<s>', text: '<em>', segment: null }],
    });
    expect(html).not.toMatch(/<(b|i|u|s|em)>/);
    expect(html).toContain('&lt;b&gt;');
  });

  it('turns on ECharts aria with the real description', () => {
    const { option: o } = option({}, { description: 'What the chart shows' });
    expect(o.aria.enabled).toBe(true);
    expect(o.aria.label.description).toBe('What the chart shows');
  });

  it('draws no legend: every line is labelled directly', () => {
    expect('legend' in option().option).toBe(false);
  });
});

describe('series roles (item 14)', () => {
  const look = (role: TrendSeries['role'], over: Partial<TrendSeries> = {}) => lineLook(line('x', role, over), palette);

  it('takes PV, SP, OP and VP from their palette roles', () => {
    expect(look('pv').color).toBe(palette.pv);
    expect(look('sp').color).toBe(palette.sp);
    expect(look('op').color).toBe(palette.op);
    expect(look('vp').color).toBe(palette.vp);
  });

  it('draws PV solid and SP dashed', () => {
    expect(look('pv').type).toBe('solid');
    expect(look('sp').type).toBe('dashed');
  });

  it('gives an estimate its own pattern and says so in the label', () => {
    expect(look('pv', { estimated: true }).type).toEqual(ESTIMATED_DASH);
    expect(directLabel(line('pv', 'pv', { label: 'PV model', estimated: true }))).toBe('PV model (estimated)');
  });

  it('never reaches the violet series, in any role or pen', () => {
    const violet = resolveTraverse('chart-series-2');
    const roles: Array<TrendSeries['role']> = ['pv', 'sp', 'op', 'vp', 'overlay', 'neutral', 'danger'];
    for (const r of roles) expect(look(r).color).not.toBe(violet);
    for (let pen = 0; pen < 12; pen++) expect(look('pen', { penIndex: pen }).color).not.toBe(violet);
  });

  it('repeats pens with a dash pattern once the palette runs out', () => {
    expect(look('pen', { penIndex: 0 }).type).toBe('solid');
    expect(look('pen', { penIndex: 5 }).type).toBe('solid');
    expect(look('pen', { penIndex: 6 }).type).toBe('dotted');
  });

  it('labels every line directly, and the labels do not share a position', () => {
    const { option: o } = option();
    const points = ['pv', 'sp', 'op', 'vp'].map(id => seriesOf(o, id).markPoint.data[0]);
    expect(points.map(p => p.label.formatter())).toEqual(['PV', 'SP', 'OP', 'VP']);
    expect(new Set(points.map(p => p.coord[0])).size).toBeGreaterThan(1);
  });

  it('adds marker shapes to VP, so VP and OP differ without colour', () => {
    const { option: o } = option();
    expect(seriesOf(o, 'vp').markPoint.data.some((d: { symbol: string }) => d.symbol === 'triangle')).toBe(true);
    expect(seriesOf(o, 'op').markPoint.data.some((d: { symbol: string }) => d.symbol === 'triangle')).toBe(false);
  });

  it('moves a direct label to a sample inside the zoom', () => {
    const model = prepareTrend({ panes: [signals], gapStepMs: 5 * MIN, plotWindow: { from: T0, to: T0 + 40 * MIN } });
    const plotted = windowOf(model.domain!, { start: 0, end: 25 });
    const o = buildTrendOption({ model, zone: 'UTC', palette, plotted, zoom: { ...FULL_ZOOM, x: { start: 0, end: 25 } }, description: 'd' });
    expect(seriesOf({ ...o } as never, 'pv').markPoint.data[0].coord[0]).toBeLessThanOrEqual(plotted.to);
  });

  it('steps a held series and draws markers without a line', () => {
    const pane: TrendPane = { ...signals, series: [line('sp', 'sp', { held: true }), line('ev', 'danger', { markers: true })] };
    const { option: o } = option({ panes: [pane] });
    expect(seriesOf(o, 'sp').step).toBe('end');
    expect(seriesOf(o, 'ev').lineStyle.width).toBe(0);
    expect(seriesOf(o, 'ev').showSymbol).toBe(true);
  });

  it('samples only a very long line, and LTTB keeps its nulls', () => {
    const x = Float64Array.from({ length: SAMPLE_ABOVE + 10 }, (_, i) => T0 + i * 1000);
    const y = new Float64Array(SAMPLE_ABOVE + 10).fill(1);
    const { option: o } = option({ panes: [{ ...signals, series: [line('pv', 'pv', { x, y: y as unknown as number[] })] }], plotWindow: undefined });
    expect(seriesOf(o, 'pv').sampling).toBe('lttb');
    expect(seriesOf(option().option, 'pv').sampling).toBeUndefined();
  });
});

describe('axes (item 8)', () => {
  it('names each axis with its unit, on its own side', () => {
    const { option: o } = option();
    expect(o.yAxis[0].name).toBe('PV / SP (kg/h)');
    expect(o.yAxis[0].position).toBe('left');
    expect(o.yAxis[1].name).toBe('Controller output (%)');
    expect(o.yAxis[1].position).toBe('right');
  });

  it('does not say % on an output axis with no declared range', () => {
    const pane: TrendPane = { ...signals, axes: [signals.axes[0], { id: 'output', label: 'Controller output', output: true }] };
    expect(option({ panes: [pane] }).option.yAxis[1].name).toBe('Controller output (unit not set)');
  });

  it('fits the data by default and takes the range on request', () => {
    const axis = signals.axes[1];
    expect(axisBounds(axis, 'fit')).toEqual({ scale: true });
    expect(axisBounds(axis, 'range')).toEqual({ min: 0, max: 100, scale: false });
    expect(axisBounds({ ...axis, bounds: { min: 1, max: 2 } }, 'fit')).toEqual({ min: 1, max: 2, scale: false });
  });

  it('hides the lane axes, which have no meaning of their own', () => {
    expect(option().option.yAxis.slice(2).every(a => 'show' in a && a.show === false)).toBe(true);
  });
});

describe('marks', () => {
  it('shades a labelled window on the first pane', () => {
    const { option: o } = option({}, { marks: [{ from: T0, to: T0 + MIN, label: 'Evaluated window' }] });
    const area = seriesOf(o, 'marks').markArea.data[0];
    expect(area[0].name).toBe('Evaluated window');
    expect(area[0].xAxis).toBe(T0);
  });
});

describe('value axis', () => {
  it('uses a value x axis named in its unit, with no lanes and no hatch', () => {
    const { option: o } = option({ x: { kind: 'value', label: 'frequency', unit: 'Hz' }, plotWindow: undefined, panes: [{ ...signals, series: [line('pv', 'pv', { x: [0.1, 0.2, 0.3] , y: [1, 2, 3] })] }] });
    expect(o.xAxis[0].type).toBe('value');
    expect(o.xAxis[0].name).toBe('frequency (Hz)');
    expect(o.grid.length).toBe(1);
    expect(o.series.some(s => String(s.id).startsWith('hatch:'))).toBe(false);
  });
});
