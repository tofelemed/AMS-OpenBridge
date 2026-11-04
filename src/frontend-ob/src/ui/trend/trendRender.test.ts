// Real ECharts, no mock: the option is rendered to SVG (no browser, no canvas), so these tests prove
// what is drawn, not only what the option says.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as echarts from 'echarts';
import { chartPalette } from '../../charts/chartTheme';
import { FULL_ZOOM, type ZoomState } from '../../components/charts/boxZoom';
import { windowOf } from './trendFormat';
import { describeTrend, prepareTrend, type TrendInput } from './trendModel';
import { buildTrendOption } from './trendOption';
import type { TrendLane, TrendPane } from './trendTypes';
import { applyCursor, type CursorChart } from './useTrendCursor';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 3, 8, 0); // 3 Nov 12:00 GST
const ZONE = 'Asia/Dubai';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

const open: echarts.ECharts[] = [];
afterEach(() => {
  open.splice(0).forEach(c => c.dispose());
});

function draw(input: TrendInput, zone = ZONE, zoom: ZoomState = FULL_ZOOM, selectedBandId?: string, palette = chartPalette()) {
  const model = prepareTrend(input);
  const plotted = model.domain ? windowOf(model.domain, zoom.x) : null;
  const option = buildTrendOption({
    model, zone, palette, plotted, zoom, selectedBandId, description: describeTrend(model, 'Test', 'Plotted: test'),
  });
  const chart = echarts.init(null as never, undefined, { renderer: 'svg', ssr: true, width: 900, height: model.layout.height });
  open.push(chart);
  chart.setOption(option as never);
  return { chart, model, option, svg: chart.renderToSVGString() };
}

const minutes = (...m: number[]) => m.map(n => T0 + n * MIN);

const signals = (over: Partial<TrendPane> = {}): TrendPane => ({
  id: 'signals',
  axes: [{ id: 'pv', label: 'PV / SP', unit: 'kg/h' }, { id: 'output', label: 'Controller output', output: true }],
  series: [
    { id: 'pv', label: 'PV', role: 'pv', axis: 'pv', x: minutes(0, 1, 2, 30, 31, 32), y: [10, 11, 12, 13, 12, 11] },
    { id: 'sp', label: 'SP', role: 'sp', axis: 'pv', x: minutes(0, 1, 2, 30, 31, 32), y: [12, 12, 12, 12, 12, 12] },
    { id: 'op', label: 'OP', role: 'op', axis: 'output', x: minutes(0, 1, 2, 30, 31, 32), y: [40, 41, 42, 43, 42, 41] },
  ],
  ...over,
});

const lanes: TrendLane[] = [
  { id: 'mode', label: 'Mode', kind: 'mode', segments: [{ startMs: T0, endMs: T0 + 40 * MIN, label: 'AUTO', tone: 'neutral' }] },
  { id: 'verdict', label: 'Verdict', kind: 'verdict', segments: [{ id: 'w1', startMs: T0, endMs: T0 + 40 * MIN, label: 'Oscillating', tone: 'warn' }] },
];

const strokePaths = (svg: string, colour: string) =>
  (svg.match(/<path\b[^>]*>/g) ?? []).filter(p => p.includes(`stroke="${colour}"`) && /\bd="M/.test(p));

describe('what ECharts really draws', () => {
  it('breaks the line across a gap instead of joining it', () => {
    const { svg, option } = draw({ panes: [signals()], plotWindow: { from: T0, to: T0 + 40 * MIN }, gapStepMs: 5 * MIN });
    const colour = (option.series.find(s => s.id === 'pv') as { color: string }).color;
    const line = strokePaths(svg, colour).find(p => /d="M[^"]*M/.test(p));
    expect(line).toBeTruthy();
    const moves = (/d="([^"]*)"/.exec(line!)![1].match(/M/g) ?? []).length;
    expect(moves).toBe(2);
  });

  it('never draws a zero for a null: the y axis stays on the data', () => {
    const { chart } = draw({ panes: [signals()], plotWindow: { from: T0, to: T0 + 40 * MIN }, gapStepMs: 5 * MIN });
    const data = (chart as unknown as { getModel(): { getSeriesByIndex(i: number): { id: string; getData(): { getStore(): unknown; count(): number; get(d: string, i: number): number } } } })
      .getModel().getSeriesByIndex(1);
    const values = Array.from({ length: data.getData().count() }, (_, i) => data.getData().get('y', i));
    expect(values.filter(v => v === 0)).toEqual([]);
    expect(values.filter(v => Number.isNaN(v)).length).toBe(1);
  });

  it('writes a text label inside each lane segment and the lane name in the gutter', () => {
    const { svg } = draw({ panes: [signals()], lanes });
    expect(svg).toContain('AUTO');
    expect(svg).toContain('Oscillating');
    expect(svg).toContain('>Mode<');
    expect(svg).toContain('>Verdict<');
  });

  it('marks a selected band in text as well as with an edge', () => {
    const { svg } = draw({ panes: [signals()], lanes }, ZONE, FULL_ZOOM, 'w1');
    expect(svg).toContain('Selected: Oscillating');
  });

  it('draws the hatch with its "No sample" label over a silent stretch', () => {
    const { svg } = draw({ panes: [signals()], plotWindow: { from: T0, to: T0 + 40 * MIN }, gapStepMs: 5 * MIN });
    expect(svg).toContain('No sample');
  });

  it('paints the hatch as a pattern, with its label on top', () => {
    // ECharts drops a `decal` on markArea, so this proves the canvas tile really fills the band.
    const ctx = { fillRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {} };
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    const toUrl = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
    const { svg } = draw({ panes: [signals()], plotWindow: { from: T0, to: T0 + 40 * MIN }, gapStepMs: 5 * MIN }, ZONE, FULL_ZOOM, undefined, { ...chartPalette(), raised: 'hatch-ground' });
    context.mockRestore();
    toUrl.mockRestore();
    expect(svg).toContain('<pattern');
    expect(svg).toContain('fill="url(#');
    expect(svg).toContain('No sample');
  });

  it('shows the direct labels and the output axis without a percent sign', () => {
    const { svg } = draw({ panes: [signals()] });
    for (const text of ['>PV<', '>SP<', '>OP<', 'PV / SP (kg/h)', 'Controller output (unit not set)']) expect(svg).toContain(text);
    expect(svg).not.toContain('Controller output (%)');
  });

  it('dashes SP and leaves PV solid', () => {
    const { svg, option } = draw({ panes: [signals()] });
    const colourOf = (id: string) => (option.series.find(s => s.id === id) as { color: string }).color;
    expect(strokePaths(svg, colourOf('sp')).some(p => p.includes('stroke-dasharray'))).toBe(true);
    expect(strokePaths(svg, colourOf('pv')).some(p => p.includes('stroke-dasharray'))).toBe(false);
  });

  it('labels the ticks in the site zone, not the browser zone', () => {
    const at = (zone: string) => {
      const { svg } = draw({ panes: [signals()], plotWindow: { from: T0, to: T0 + 12 * 60 * MIN } }, zone);
      return (svg.match(/>(\d\d:\d\d)</g) ?? []).map(t => t.slice(1, 6));
    };
    const dubai = at('Asia/Dubai');
    const utc = at('UTC');
    expect(dubai.length).toBeGreaterThan(1);
    const hour = (t: string) => Number(t.slice(0, 2));
    expect((hour(dubai[0]) - hour(utc[0]) + 24) % 24).toBe(4);
  });

  it('agrees with ECharts on what a zoom plots', () => {
    const window = { from: T0, to: T0 + 40 * MIN };
    const zoom: ZoomState = { ...FULL_ZOOM, x: { start: 25, end: 75 } };
    const { chart, model } = draw({ panes: [signals()], lanes, plotWindow: window }, ZONE, zoom);
    const ours = windowOf(model.domain!, zoom.x);
    const theirs = (chart.getOption() as unknown as { dataZoom: Array<{ id: string; startValue: number; endValue: number }> }).dataZoom.find(d => d.id === 'bz-x')!;
    expect(ours.from).toBe(theirs.startValue);
    expect(ours.to).toBe(theirs.endValue);
  });

  it('keeps every grid on one domain while zoomed, lanes included', () => {
    const { chart } = draw({ panes: [signals(), signals({ id: 'second', series: [] })], lanes, plotWindow: { from: T0, to: T0 + 40 * MIN } }, ZONE, { ...FULL_ZOOM, x: { start: 10, end: 60 } });
    const x = (chart.getOption() as unknown as { xAxis: unknown[] }).xAxis;
    expect(x.length).toBe(4);
    const model = (chart as unknown as { getModel(): { getComponent(m: string, i: number): { axis: { scale: { getExtent(): number[] } } } } }).getModel();
    const extents = x.map((_, i) => model.getComponent('xAxis', i).axis.scale.getExtent());
    for (const e of extents) expect(e).toEqual(extents[0]);
  });

  it('keeps a stacked band in place when the PV is negative', () => {
    const x = minutes(0, 1, 2, 3);
    const { chart } = draw({ panes: [{
      id: 'cold', axes: [{ id: 'pv', label: 'PV', unit: '°C' }],
      series: [{ id: 'pv', label: 'PV', role: 'pv', x, y: [-4, -3, -3, -4] }],
      bands: [{ id: 'band', label: 'PV min to max', x, lo: [-5, -4, -4, -5], hi: [-3, -2, -2, -3] }],
    }] });
    const model = (chart as unknown as { getModel(): { eachSeries(cb: (s: { id: string; getData(): { getCalculationInfo(k: string): string; get(d: string, i: number): number } }) => void): void } }).getModel();
    let top: number | undefined;
    model.eachSeries(s => {
      if (s.id === 'band') top = s.getData().get(s.getData().getCalculationInfo('stackResultDimension'), 0);
    });
    expect(top).toBe(-3);
  });

  it('keeps a lone reading between two gaps visible', () => {
    const x = minutes(0, 1, 2, 20, 40, 41, 42);
    const { option, svg } = draw({ panes: [{
      id: 'p', axes: [{ id: 'a', label: 'PV', unit: 'bar' }],
      series: [{ id: 'pv', label: 'PV', role: 'pv', x, y: [1, 2, 3, 4, 5, 6, 7] }],
    }], gapStepMs: 5 * MIN });
    const lone = option.series.find(s => s.id === 'pv:isolated') as unknown as { data: number[][] };
    expect(lone.data).toEqual([[T0 + 20 * MIN, 4]]);
    expect(svg.length).toBeGreaterThan(0);
  });

  it('accepts the cursor on a real chart: the pixel lands inside the plot', () => {
    const { chart, model } = draw({ panes: [signals()], lanes, plotWindow: { from: T0, to: T0 + 40 * MIN } });
    const x = chart.convertToPixel({ xAxisIndex: 0 }, T0 + 20 * MIN) as number;
    const rect = model.layout.panes[0];
    expect(x).toBeGreaterThan(rect.left);
    expect(x).toBeLessThan(900 - rect.right);
    expect(chart.containPixel({ gridIndex: [0, 1, 2] }, [x, rect.top + 10])).toBe(true);
    expect(() => applyCursor(chart as unknown as CursorChart, T0 + 20 * MIN, rect.top + 10)).not.toThrow();
  });

  it('draws a value axis for a phase plane, in sample order', () => {
    const { svg, model } = draw({
      x: { kind: 'value', label: 'OP', unit: '%' },
      panes: [{ id: 'plane', axes: [{ id: 'pv', label: 'PV', unit: 'bar' }], series: [{ id: 't', label: 'Trajectory', role: 'neutral', x: [40, 42, 41, 39], y: [1, 2, 3, 2] }] }],
    });
    expect(model.series[0].data.map(r => r[0])).toEqual([40, 42, 41, 39]);
    expect(svg).toContain('OP (%)');
  });
});
