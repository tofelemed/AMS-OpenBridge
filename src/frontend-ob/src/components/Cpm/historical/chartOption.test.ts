// v2.5 Task 2E.2 (spec R14; NR-033): a 400 °C PV and a 0-100 pp OP never share one axis - the
// signals grid carries an EU axis (PV/SP) and a percentage-point axis (OP/VP), both legible;
// the tooltip names every value's unit and shows the sample time in the site zone; an explicit
// Normalise toggle puts everything on "fraction of own span" and SAYS so.
import { describe, it, expect } from 'vitest';
import { buildChartOption, type ChartInput } from './chartOption';

const pens = { good: '#0f0', amber: '#fa0', grey: '#888', accent: '#00f', pink: '#f0f', bad: '#f00' };
const tones = { good: '#0f0', warn: '#ff0', bad: '#f00', muted: '#888' };

function input(over: Partial<ChartInput> = {}): ChartInput {
  const t0 = Date.UTC(2026, 8, 16, 12, 0, 0);
  return {
    points: [0, 1, 2].map(i => ({ ts: t0 + i * 60_000, pv: 400 + i, pv_avg: 400 + i, sp: 401, op: 40 + i, op_avg: 40 + i, vp: 39 + i })),
    kpiRows: [], overlay: { key: 'iae', label: 'IAE', unit: 'EU·s' }, signals: ['pv', 'sp', 'op', 'vp'],
    modeSegments: [], verdictSegments: [], from: new Date(t0), to: new Date(t0 + 180_000), pens, tones,
    pvUnit: '°C', timeZone: 'Asia/Dubai',
    ...over,
  };
}

function seriesByName(o: ReturnType<typeof buildChartOption>, name: string) {
  return (o.series as Array<{ name: string; yAxisIndex?: number; connectNulls?: boolean }>).find(s => s.name === name)!;
}

describe('historical chart axes (R14)', () => {
  it('gives PV/SP the EU axis and OP/VP a separate percentage-point axis', () => {
    const o = buildChartOption(input());
    const yAxis = o.yAxis as Array<{ gridIndex: number; name?: string; position?: string }>;
    const signalsAxes = yAxis.filter(a => a.gridIndex === 0);
    expect(signalsAxes).toHaveLength(2);
    expect(signalsAxes.map(a => a.name)).toEqual(['°C', 'pp']);
    const pvAxis = yAxis.findIndex(a => a.gridIndex === 0 && a.name === '°C');
    const ppAxis = yAxis.findIndex(a => a.gridIndex === 0 && a.name === 'pp');
    expect(seriesByName(o, 'PV').yAxisIndex).toBe(pvAxis);
    expect(seriesByName(o, 'SP').yAxisIndex).toBe(pvAxis);
    expect(seriesByName(o, 'OP').yAxisIndex).toBe(ppAxis);
    expect(seriesByName(o, 'VP').yAxisIndex).toBe(ppAxis);
    expect(yAxis[ppAxis].position).toBe('right');
  });

  it('never bridges a missing sample', () => {
    const o = buildChartOption(input());
    for (const s of o.series as Array<{ type: string; connectNulls?: boolean }>) if (s.type === 'line') expect(s.connectNulls ?? false).toBe(false);
  });

  it('Normalise puts every signal on one "fraction of own span" axis and labels the conversion', () => {
    const o = buildChartOption(input({ normalize: true }));
    const yAxis = o.yAxis as Array<{ gridIndex: number; name?: string }>;
    expect(yAxis.filter(a => a.gridIndex === 0).map(a => a.name)).toEqual(['fraction of own span (normalised)']);
    expect(seriesByName(o, 'PV (÷ own span)')).toBeTruthy();
    const pv = seriesByName(o, 'PV (÷ own span)') as unknown as { data: Array<[number, number | null]> };
    expect(pv.data.map(d => d[1])).toEqual([0, 0.5, 1]);
  });

  it('the tooltip shows units, the site-zone time and the original value even when normalised', () => {
    const o = buildChartOption(input({ normalize: true }));
    const t0 = Date.UTC(2026, 8, 16, 12, 0, 0);
    const fmt = (o.tooltip as { formatter: (p: unknown) => string }).formatter;
    const html = fmt([
      { seriesName: 'PV (÷ own span)', marker: '', value: [t0 + 60_000, 0.5] },
      { seriesName: 'OP (÷ own span)', marker: '', value: [t0 + 60_000, 0.5] },
    ]);
    expect(html).toContain('16:01:00');                 // 12:01Z in Asia/Dubai (UTC+04:00)
    expect(html).toContain('Asia/Dubai');
    expect(html).toContain('PV: 401.00 °C');
    expect(html).toContain('OP: 41.00 pp');
  });
});
