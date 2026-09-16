// v2.5 Task 2E.1 (spec §3.1 axes; NR-033, NR-035): one y axis per unit group, never a filled line
// across unsupported gaps, held series step, times in the site zone with the zone in the axis name.
import { describe, it, expect } from 'vitest';
import { buildCpmChartOption, toCsv, type CpmSeries } from './CpmChart';

const pens = { good: '#0f0', amber: '#fa0', grey: '#888', accent: '#00f', pink: '#f0f', bad: '#f00' };

describe('buildCpmChartOption', () => {
  const pv: CpmSeries = { id: 'pv', label: 'PV', unit: '°C', x: [0, 60_000, 120_000], y: [400, null, 402], pen: 'good' };
  const op: CpmSeries = { id: 'op', label: 'OP', unit: 'pp', x: [0, 60_000, 120_000], y: [40, 41, 42], pen: 'amber', held: true };
  const band: CpmSeries = { id: 'band', label: 'Tolerance band', unit: '°C', x: [0, 120_000], y: [401, 401], pen: 'grey', bandMeaning: 'good-error band: |error| <= 0.5 EU' };

  it('gives each unit group its own axis and puts the unit in the axis name', () => {
    const o = buildCpmChartOption({ series: [pv, op], xKind: 'time', timeZone: 'Asia/Dubai', pens });
    expect(o.yAxis).toHaveLength(2);
    expect(o.yAxis.map(a => a.name)).toEqual(['°C', 'pp']);
    expect(o.series[0].yAxisIndex).toBe(0);
    expect(o.series[1].yAxisIndex).toBe(1);
    expect(o.xAxis.name).toContain('Asia/Dubai');
  });
  it('never connects nulls and steps held series', () => {
    const o = buildCpmChartOption({ series: [pv, op], xKind: 'time', timeZone: 'UTC', pens });
    expect(o.series.every(s => s.connectNulls === false)).toBe(true);
    expect(o.series[1].step).toBe('end');
    expect(o.series[0].step).toBeUndefined();
  });
  it('labels a band with its meaning, never a bare line', () => {
    const o = buildCpmChartOption({ series: [pv, band], xKind: 'time', timeZone: 'UTC', pens });
    expect(o.series[1].name).toBe('Tolerance band — good-error band: |error| <= 0.5 EU');
  });
  it('value axes keep the x quantity and unit', () => {
    const acf: CpmSeries = { id: 'acf', label: 'ACF', unit: '1', x: [0, 5, 10], y: [1, 0.8, 0.5], pen: 'accent' };
    const o = buildCpmChartOption({ series: [acf], xKind: 'value', xLabel: 'lag', xUnit: 's', pens });
    expect(o.xAxis.type).toBe('value');
    expect(o.xAxis.name).toBe('lag (s)');
  });
  it('exports the same values as CSV', () => {
    expect(toCsv([pv])).toBe('x,PV (°C)\n0,400\n60000,\n120000,402');
  });
});
