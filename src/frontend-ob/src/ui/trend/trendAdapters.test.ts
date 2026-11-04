import { describe, expect, it } from 'vitest';
import type { CpmTrendPoint } from '../../api/cpm/kpis';
import type { CpmSeries } from '../../components/Cpm/evidence/CpmChart';
import { cpmSeriesToPane, pensToPane, trendPointsToPane } from './trendAdapters';
import { prepareTrend } from './trendModel';
import { axisName } from './trendFormat';

const T0 = Date.UTC(2026, 10, 3, 8);
const points = [
  { ts: T0, pv: 10, pv_avg: 10.5, pv_min: 9, pv_max: 12, sp: 11, op: 40, vp: null },
  { ts: T0 + 60_000, pv: null, pv_avg: null, pv_min: null, pv_max: null, sp: 11, op: 41, vp: null },
] as unknown as CpmTrendPoint[];

describe('trendPointsToPane', () => {
  it('prefers the bucket average, and keeps a null as a gap', () => {
    const pane = trendPointsToPane(points, { pvUnit: 'kg/h' });
    expect(pane.series.find(s => s.id === 'pv')!.y).toEqual([10.5, null]);
  });

  it('puts PV and SP on the unit axis and OP on the output axis', () => {
    const pane = trendPointsToPane(points, { pvUnit: 'kg/h' });
    expect(pane.series.map(s => [s.id, s.axis, s.role])).toEqual([['pv', 'pv', 'pv'], ['sp', 'pv', 'sp'], ['op', 'output', 'op']]);
    expect(axisName(pane.axes[0])).toBe('PV / SP (kg/h)');
  });

  it('says % only with a declared range', () => {
    expect(axisName(trendPointsToPane(points).axes[1])).toBe('Controller output (unit not set)');
    expect(axisName(trendPointsToPane(points, { outputRange: { min: 0, max: 100 } }).axes[1])).toBe('Controller output (%)');
  });

  it('adds VP only when mapped', () => {
    expect(trendPointsToPane(points).series.some(s => s.id === 'vp')).toBe(false);
    const withVp = [{ ...points[0], vp: 39 }] as unknown as CpmTrendPoint[];
    expect(trendPointsToPane(withVp).series.some(s => s.id === 'vp')).toBe(true);
  });

  it('carries the PV band, and drops it when the historian has none', () => {
    expect(trendPointsToPane(points).bands![0].hi).toEqual([12, null]);
    const flat = [{ ts: T0, pv: 1, sp: 1, op: 1 }] as unknown as CpmTrendPoint[];
    expect(trendPointsToPane(flat).bands).toEqual([]);
  });

  it('prepares without error', () => {
    expect(prepareTrend({ panes: [trendPointsToPane(points)] }).hasData).toBe(true);
  });
});

describe('cpmSeriesToPane', () => {
  const series: CpmSeries[] = [
    { id: 'a', label: 'PV', unit: 'EU', x: new Float64Array([T0, T0 + 1000]), y: new Float64Array([1, NaN]), pen: 'pv' },
    { id: 'b', label: 'Limit', unit: 'EU', x: [T0], y: [2], pen: 'neutral', bandMeaning: 'noise band' },
    { id: 'c', label: 'Age', unit: 's', x: [T0], y: [3], pen: 'overlay', held: true, markers: true, symbol: 'rect', area: true },
  ];

  it('makes one axis per unit, in first-seen order', () => {
    expect(cpmSeriesToPane('p', series).axes.map(a => a.id)).toEqual(['EU', 's']);
  });

  it('keeps typed arrays as they are', () => {
    expect(cpmSeriesToPane('p', series).series[0].x).toBe(series[0].x);
  });

  it('names a band with its meaning and dashes it', () => {
    const band = cpmSeriesToPane('p', series).series[1];
    expect(band.label).toBe('Limit: noise band');
    expect(band.dashed).toBe(true);
  });

  it('keeps the drawing hints', () => {
    const age = cpmSeriesToPane('p', series).series[2];
    expect([age.held, age.markers, age.markerSymbol, age.area, age.role]).toEqual([true, true, 'rect', true, 'overlay']);
  });

  it('prepares, with NaN read as a gap', () => {
    const model = prepareTrend({ panes: [cpmSeriesToPane('p', series)], gapStepMs: null });
    expect(model.series[0].data).toEqual([[T0, 1], [T0 + 1000, null]]);
  });
});

describe('pensToPane', () => {
  const pens = [
    { id: 'a', label: 'FIC101.PV', unit: 'kg/h', points: [{ ts: T0, value: 1 }] },
    { id: 'b', label: 'FIC101.SP', unit: 'kg/h', points: [{ ts: T0, value: 2 }], setpoint: true },
    { id: 'c', label: 'TI201', points: [{ ts: T0, value: 3 }], stepped: true },
  ];

  it('gives one axis per unit, and never guesses a unit', () => {
    const pane = pensToPane('p', pens);
    expect(pane.axes.map(a => a.unit)).toEqual(['kg/h', null]);
    expect(axisName(pane.axes[1])).toBe('Value (unit not set)');
  });

  it('dashes a setpoint pen and numbers the others in palette order', () => {
    const pane = pensToPane('p', pens);
    expect(pane.series.map(s => s.role)).toEqual(['pen', 'sp', 'pen']);
    expect(pane.series.map(s => s.penIndex)).toEqual([0, undefined, 1]);
  });

  it('prepares without error', () => {
    expect(prepareTrend({ panes: [pensToPane('p', pens)] }).hasData).toBe(true);
  });
});
