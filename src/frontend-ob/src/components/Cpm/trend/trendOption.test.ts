import { describe, expect, it } from 'vitest';
import { chartPalette } from '../../../charts/chartTheme';
import { BAND_LABEL, axisBounds, hasPvRange, hasSignalValues, pvAxisName, signalTrendOption } from './trendOption';

const palette = { ...chartPalette(), pv: 'g', op: 'a' };
// FIC10401-like: PV around 800, OP around 29 — the SME's case.
const points = [
  { ts: 1000, pv_avg: 801, pv_min: 790, pv_max: 812, sp: 800, op_avg: 29.4 },
  { ts: 2000, pv_avg: 795, pv_min: 785, pv_max: 806, sp: 800, op_avg: 28.7 },
];

describe('signalTrendOption', () => {
  const opt = signalTrendOption({ points, palette, pvUnit: 'kg/h', scale: 'fit', zoom: {} });

  it('puts PV and SP on a named left axis and OP on a named right axis', () => {
    expect(opt.yAxis[0]).toMatchObject({ name: 'PV / SP (kg/h)', position: 'left' });
    expect(opt.yAxis[1]).toMatchObject({ name: 'OP (%)', position: 'right' });
    const axisOf = (n: string) => opt.series.find(s => s.name === n)?.yAxisIndex;
    expect([axisOf('PV'), axisOf('SP'), axisOf(BAND_LABEL), axisOf('OP')]).toEqual([0, 0, 0, 1]);
  });

  it('draws each axis in its signal\'s pen colour', () => {
    expect(opt.yAxis[0].axisLine.lineStyle.color).toBe('g');
    expect(opt.yAxis[1].axisLine.lineStyle.color).toBe('a');
  });

  it('gives the band a legend entry and plots on a time axis', () => {
    expect(opt.legend.data).toEqual(['PV', BAND_LABEL, 'SP', 'OP']);
    expect(opt.xAxis.type).toBe('time');
  });

  it('adds VP to the right axis when the loop maps one', () => {
    const v = signalTrendOption({ points, palette, hasVp: true, scale: 'fit', zoom: {} });
    expect(v.yAxis[1].name).toBe('OP / VP (%)');
    expect(v.series.find(s => s.name === 'VP')?.yAxisIndex).toBe(1);
  });

  it('prints units in the tooltip', () => {
    const html = opt.tooltip.formatter([
      { seriesName: 'PV', marker: '', value: [1000, 801] },
      { seriesName: 'OP', marker: '', value: [1000, 29.4] },
    ]);
    expect(html).toContain('PV: 801 kg/h');
    expect(html).toContain('OP: 29.4 %');
    expect(html).toContain(`${BAND_LABEL}: 790 kg/h – 812 kg/h`);
  });
});

describe('scale modes', () => {
  const range = { pvMin: 0, pvMax: 1200, opMin: 0, opMax: 100 };

  it('fits to the data by default', () => {
    expect(axisBounds('fit', range)).toEqual({ pv: { scale: true }, op: { scale: true } });
  });

  it('uses the engineering range when asked and one exists', () => {
    expect(axisBounds('range', range)).toEqual({
      pv: { min: 0, max: 1200, scale: false }, op: { min: 0, max: 100, scale: false },
    });
  });

  it('falls back to fit without a usable PV range, and OP to 0–100 %', () => {
    expect(axisBounds('range', { pvMin: 5, pvMax: 5 })).toEqual({ pv: { scale: true }, op: { scale: true } });
    expect(axisBounds('range', { pvMin: 0, pvMax: 10 }).op).toEqual({ min: 0, max: 100, scale: false });
    expect(hasPvRange(null)).toBe(false);
  });
});

describe('pvAxisName', () => {
  it('says when the unit is not set rather than inventing one', () => {
    expect(pvAxisName(null)).toBe('PV / SP (unit not set)');
    expect(pvAxisName(' ')).toBe('PV / SP (unit not set)');
    expect(pvAxisName('°C')).toBe('PV / SP (°C)');
  });
});

describe('hasSignalValues', () => {
  it('is false for a stalled feed (buckets of nulls), true once any value exists', () => {
    expect(hasSignalValues([{ ts: 1, pv: null, op: null }, { ts: 2 }])).toBe(false);
    expect(hasSignalValues([{ ts: 1, pv: null }, { ts: 2, op_avg: 30 }])).toBe(true);
  });
});

describe('tooltip safety', () => {
  it('escapes a hostile unit in the tooltip HTML (the unit is user input)', () => {
    const o = signalTrendOption({ points, palette, pvUnit: '<img src=x onerror=alert(1)>', scale: 'fit', zoom: {} });
    const html = o.tooltip.formatter([{ seriesName: 'PV', marker: '', value: [1000, 801] }]);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('axis names and legend never clip (CHG-181)', () => {
  // 12 px canvas text, 7 px a character: wider than the real glyphs, so a pass here is a pass on screen.
  const est = (s: string) => s.length * 7;
  type Media = { query?: { maxWidth: number }; option: { grid: { bottom: number } } };
  /** grid.bottom ECharts applies at a chart width: the matching query, else the query-less default. */
  const bottomAt = (o: { media: Media[] }, width: number) =>
    (o.media.find(m => m.query && width <= m.query.maxWidth) ?? o.media.find(m => !m.query))!.option.grid.bottom;

  it('keeps "PV / SP (unit not set)" whole on the 459 px Overview panel and at 390 px', () => {
    const o = signalTrendOption({ points, palette, pvUnit: null, scale: 'fit', zoom: {} });
    const [pvAxis, opAxis] = o.yAxis;
    expect(pvAxis.name).toBe('PV / SP (unit not set)');
    // Each name starts (left) or ends (right) at its own axis line, so it reads into the plot instead of
    // centring on the line and spilling past the chart edge ("V / SP (unit not set)").
    expect(pvAxis.nameTextStyle).toMatchObject({ align: 'left' });
    expect(opAxis.nameTextStyle).toMatchObject({ align: 'right' });
    for (const width of [459, 390]) {
      const pvEnd = o.grid.left + est(pvAxis.name);
      const opStart = width - o.grid.right - est(opAxis.name);
      expect(o.grid.left).toBeGreaterThanOrEqual(0);
      expect(pvEnd).toBeLessThan(opStart);
    }
  });

  it('keeps the pen colour and size on the names', () => {
    const o = signalTrendOption({ points, palette, scale: 'fit', zoom: {} });
    expect(o.yAxis[0].nameTextStyle).toMatchObject({ color: 'g', fontSize: 12 });
    expect(o.yAxis[1].nameTextStyle).toMatchObject({ color: 'a', fontSize: 12 });
  });

  it('gives the legend a second row under the time labels at 390 px, and none on a wide chart', () => {
    // The legend's real one-row width (Arial 12 px, ECharts' icon, gaps and padding): 328 px, 384 px with VP.
    // A 390 px screen leaves the chart about 326 px (16 px gutters, 16 px panel padding), so it wraps there.
    for (const [hasVp, wraps] of [[false, 328], [true, 384]] as const) {
      const o = signalTrendOption({ points, palette, hasVp, scale: 'fit', zoom: {} });
      expect(o.grid.bottom).toBe(56);
      expect(bottomAt(o, 1200)).toBe(56);
      // ECharts' legend: 14 px rows 10 px apart; a wrapped legend is one row taller.
      expect(bottomAt(o, wraps)).toBe(56 + 14 + 10);
      expect(bottomAt(o, 326)).toBe(56 + 14 + 10);
    }
    // The Overview's 459 px panel draws its legend in one row: its layout is unchanged.
    expect(bottomAt(signalTrendOption({ points, palette, scale: 'fit', zoom: {} }), 459 - 32)).toBe(56);
  });
});

describe('evaluated window and compare (CHG-067)', () => {
  it('draws the evaluated window as a labelled band on the PV series and spans the plotted range', () => {
    const o = signalTrendOption({ points, palette, scale: 'fit', zoom: {},
      xRange: { fromMs: 0, toMs: 5000 }, evaluated: { startMs: 1000, endMs: 2000, label: 'Evaluated 24h window' } });
    const pv = o.series.find(s => s.name === 'PV') as { markArea?: { data: unknown; label: { formatter: string } } };
    expect(pv.markArea?.data).toEqual([[{ xAxis: 1000 }, { xAxis: 2000 }]]);
    expect(pv.markArea?.label.formatter).toBe('Evaluated 24h window');
    expect(o.xAxis).toMatchObject({ min: 0, max: 5000 });
  });

  it('uses shared y-bounds when fitting, and the engineering range wins over them', () => {
    const yBounds = { pv: { min: 60, max: 90 }, op: { min: 20, max: 45 } };
    const fit = signalTrendOption({ points, palette, scale: 'fit', zoom: {}, yBounds });
    expect(fit.yAxis[0]).toMatchObject({ min: 60, max: 90, scale: false });
    expect(fit.yAxis[1]).toMatchObject({ min: 20, max: 45, scale: false });
    const ranged = signalTrendOption({ points, palette, scale: 'range', zoom: {}, yBounds, range: { pvMin: 0, pvMax: 2500 } });
    expect(ranged.yAxis[0]).toMatchObject({ min: 0, max: 2500 });
  });
});
