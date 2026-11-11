/**
 * CHG-175: the shared trend engine's option (Trend page, Designer dialog, canvas symbol): times in one zone, dates on the
 * axis, the cursor time in the same zone and format, and a broken line where nothing was stored. The look is unchanged.
 */
import { describe, expect, it } from 'vitest';
import { chartPalette } from '../../../charts/chartTheme';
import { FULL_ZOOM } from '../../charts/boxZoom';
import { buildTrendOption, type TrendOptionInput } from './trendOption';
import { browserZone } from './trendTime';
import type { Pen, TrendPoint } from './trendSupport';

const H = 3_600_000;
const T = (iso: string) => Date.parse(iso);
const pen = (path: string, label: string): Pen => ({ path, label, unit: '' });
const palette = chartPalette();

const input = (over: Partial<TrendOptionInput> = {}): TrendOptionInput => ({
  pens: [pen('a.pv', 'PV')],
  penData: [[{ ts: T('2026-11-06T11:00:00Z'), value: 1 }, { ts: T('2026-11-06T11:01:00Z'), value: 2 }]],
  hiddenPens: new Set(),
  penColor: () => 'green',
  palette,
  perAxis: false,
  manualScale: null,
  windowStart: T('2026-11-06T10:45:00Z'),
  windowEnd: T('2026-11-06T22:45:00Z'),
  zone: 'UTC',
  zoom: FULL_ZOOM,
  ...over,
});
type Fmt = (v: number) => string;
const tick = (o: ReturnType<typeof buildTrendOption>) => o.xAxis.axisLabel.formatter as Fmt;

describe('the time axis', () => {
  it('reads ticks without seconds, and a date where a day starts', () => {
    const o = buildTrendOption(input());
    expect(tick(o)(T('2026-11-06T15:00:00Z'))).toBe('15:00');
    expect(tick(o)(T('2026-11-07T00:00:00Z'))).toBe('7 Nov');
  });

  it('drops a tick label that would overlap its neighbour on a narrow chart', () => {
    expect(buildTrendOption(input()).xAxis.axisLabel.hideOverlap).toBe(true);
  });

  it('reads days on a 7-day window, never seven times 00:00:00', () => {
    const o = buildTrendOption(input({ windowStart: T('2026-11-04T17:48:00Z'), windowEnd: T('2026-11-11T17:48:00Z') }));
    expect([5, 6, 7].map(d => tick(o)(Date.UTC(2026, 10, d)))).toEqual(['5 Nov', '6 Nov', '7 Nov']);
  });

  it('follows the zoom: a few hours of the 7 days read clock times', () => {
    const o = buildTrendOption(input({
      windowStart: T('2026-11-04T17:48:00Z'), windowEnd: T('2026-11-11T17:48:00Z'),
      zoom: { x: { start: 40, end: 45 }, y: { start: 0, end: 100 } },
    }));
    expect(tick(o)(T('2026-11-07T11:00:00Z'))).toBe('11:00');
  });

  it('reads in the zone it is given', () => {
    expect(tick(buildTrendOption(input({ zone: 'Asia/Dubai' })))(T('2026-11-06T15:00:00Z'))).toBe('19:00');
  });

  it('places ticks on UTC when the zone is not the browser zone', () => {
    const other = browserZone() === 'UTC' ? 'Asia/Dubai' : 'UTC';
    expect(buildTrendOption(input({ zone: other })).useUTC).toBe(true);
    expect(buildTrendOption(input({ zone: browserZone() })).useUTC).toBe(false);
  });
});

describe('the cursor', () => {
  it('names its time in the same zone and format, through the x pointer label (the tooltip head)', () => {
    const o = buildTrendOption(input());
    const label = o.xAxis.axisPointer.label.formatter as (p: { value: number }) => string;
    expect(label({ value: T('2026-11-06T20:32:41Z') })).toBe('6 Nov 20:32');
    expect((buildTrendOption(input({ zone: 'Asia/Dubai' })).xAxis.axisPointer.label.formatter as typeof label)({ value: T('2026-11-06T20:32:41Z') }))
      .toBe('7 Nov 00:32');
  });

  it('keeps the tooltip as it looked: axis trigger, cross pointer, two decimals, no replaced content', () => {
    const o = buildTrendOption(input());
    expect(o.tooltip).toMatchObject({ trigger: 'axis', axisPointer: { type: 'cross' } });
    expect(o.tooltip.valueFormatter(77.871)).toBe('77.87');
    expect((o.tooltip as Record<string, unknown>).formatter).toBeUndefined();
  });
});

describe('the lines', () => {
  it('break where nothing was stored', () => {
    const data: TrendPoint[] = [0, 10, 20, 30, 40, 400, 410, 420].map((m, i) => ({ ts: T('2026-11-06T11:00:00Z') + m * 60_000, value: i }));
    const o = buildTrendOption(input({ penData: [data] }));
    const series = o.series[0].data as Array<[number, number | null]>;
    expect(series.filter(p => p[1] === null)).toHaveLength(1);
    expect(series).toHaveLength(data.length + 1);
  });

  it('draw nothing for a hidden pen, as before', () => {
    const o = buildTrendOption(input({ hiddenPens: new Set(['a.pv']) }));
    expect(o.series[0].data).toEqual([]);
  });

  it('keep the window as the axis bounds', () => {
    const o = buildTrendOption(input());
    expect([o.xAxis.min, o.xAxis.max]).toEqual([T('2026-11-06T10:45:00Z'), T('2026-11-06T22:45:00Z')]);
    expect(12 * H).toBe(o.xAxis.max - o.xAxis.min);
  });
});
