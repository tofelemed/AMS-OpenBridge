import { describe, expect, it } from 'vitest';
import { BAND_LABEL, axisBounds, hasPvRange, hasSignalValues, pvAxisName, signalTrendOption } from './trendOption';

const pens = { good: 'g', amber: 'a', grey: 'x', pink: 'p' };
// FIC10401-like: PV around 800, OP around 29 — the SME's case.
const points = [
  { ts: 1000, pv_avg: 801, pv_min: 790, pv_max: 812, sp: 800, op_avg: 29.4 },
  { ts: 2000, pv_avg: 795, pv_min: 785, pv_max: 806, sp: 800, op_avg: 28.7 },
];

describe('signalTrendOption', () => {
  const opt = signalTrendOption({ points, pens, pvUnit: 'kg/h', scale: 'fit', zoom: {} });

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
    const v = signalTrendOption({ points, pens, hasVp: true, scale: 'fit', zoom: {} });
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
