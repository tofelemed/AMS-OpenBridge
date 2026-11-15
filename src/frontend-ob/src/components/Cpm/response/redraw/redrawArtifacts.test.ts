// CHG-198 (owner, 2026-11-15): the historian's samples become the arrays the CHG-197 trends read, so the same trends draw again.
// Curves come from the samples; every number from the event's stored quantities. A mark that needs the engine's own number
// (the setpoint, the settling bands, the error) is drawn only when the samples reproduce it; Model fit is never redrawn.
import { describe, expect, it } from 'vitest';
import type { Mark } from '../trends/annotations';
import { buildFacts } from '../trends/responseFacts';
import { responseTrendSpecs } from '../trends/responseTrendSpecs';
import type { TrendSpec } from '../trends/trendSupport';
import { integrals, levelLoop, q, result, selfRegulating, setpointStep, T0S, type EventFixture } from '../trends/trendFixtures';
import { redrawWindow } from './historianRead';
import { plannedTrends, redrawArtifacts } from './redrawArtifacts';
import { historianPoints } from './redrawFixtures';

const w = redrawWindow(result(), 0)!;
const wFor = (e: EventFixture) => redrawWindow(e.result, 0)!;
const redrawn = (e: EventFixture, sp: (tS: number) => number, metrics = e.metrics) => {
  const byKind = redrawArtifacts(historianPoints(e, sp), wFor(e), 'OP_TO_PV', metrics)!;
  return responseTrendSpecs(buildFacts({ byKind, metrics, result: e.result, t0Ms: T0S * 1000, pvUnit: 'm3/h' })!);
};
const ids = (list: TrendSpec[]) => list.map(s => s.id);
const labels = (s: TrendSpec | undefined) => (s?.marks ?? []).flatMap((m: Mark) => ('label' in m && m.label ? [typeof m.label === 'string' ? m.label : `${m.label.text}${m.label.value ? ` ${m.label.value}` : ''}`] : []));
const trend = (list: TrendSpec[], id: string) => list.find(s => s.id === id);

describe('redrawArtifacts', () => {
  it('turns the historian points into samples, input and setpoint on one time base, and the step marker', () => {
    const points = [
      { ts: (T0S - 200) * 1000, pv: 9, sp: 9, op: 9 },            // before the support: left out
      { ts: (T0S - 10) * 1000, pv: 1, sp: 5, op: 40 },
      { ts: (T0S - 10) * 1000, pv: 7, sp: 7, op: 7 },              // the same instant again: left out, as the engine's closer does
      { ts: T0S * 1000, pv: null, sp: 6, op: 44 },
      { ts: (T0S + 4) * 1000, pv: '2.5', sp: 6, op: 44 },
    ];
    const byKind = redrawArtifacts(points, w, 'OP_TO_PV', [])!;
    const pv = byKind.accepted_samples[0];
    expect([...pv.columns.x]).toEqual([T0S - 10, T0S, T0S + 4]);
    expect([...pv.columns.y].map(v => (Number.isFinite(v) ? v : null))).toEqual([1, null, 2.5]);
    expect(pv.mask).toEqual([true, false, true]);
    expect([...byKind.input_reconstruction[0].columns.y]).toEqual([40, 44, 44]);
    expect([...byKind.historian_sp[0].columns.y]).toEqual([5, 6, 6]);
    expect([...byKind.response_event[0].columns.x]).toEqual([T0S, T0S + 600]);
    expect(byKind.target).toBeUndefined();   // not a setpoint step
  });

  it('has nothing to draw when the historian holds no PV sample in the window', () => {
    expect(redrawArtifacts([], w, 'OP_TO_PV', [])).toBeNull();
    expect(redrawArtifacts([{ ts: T0S * 1000, pv: null, sp: 1, op: 1 }], w, 'OP_TO_PV', [])).toBeNull();
  });
});

describe('the redrawn trends', () => {
  it('a self-regulating event draws the trends that apply with the engine\'s values, and never Model fit', () => {
    const list = redrawn(selfRegulating(), () => 130);
    expect(ids(list)).toEqual(['measured', 'input', 'dead-time', 'rise-settle', 'error']);
    expect(labels(trend(list, 'dead-time'))).toEqual(expect.arrayContaining(['Dead time 34 s', 'Time constant 120 s', 'Measured 63 % 154 s']));
    expect(labels(trend(list, 'rise-settle'))).toEqual(expect.arrayContaining(['Rise time 250 s', 'Settling band ±0.292 m3/h', 'Settled 410 s']));
    expect(labels(trend(list, 'measured'))).toEqual(expect.arrayContaining(['Baseline 120', 'Final value 134.6', 'PV change 14.6 m3/h']));
    expect(labels(trend(list, 'error'))).toEqual(expect.arrayContaining([expect.stringMatching(/^IAE /), expect.stringMatching(/^ISE /), expect.stringMatching(/^ITAE /)]));
  });

  it('a setpoint step draws the setpoint the historian held when it gives the engine\'s setpoint change', () => {
    const list = redrawn(setpointStep(), tS => (tS < T0S ? 50 : 60));
    expect(ids(list)).toEqual(['measured', 'input', 'rise-settle', 'overshoot', 'error']);
    expect(labels(trend(list, 'measured'))).toContain('Setpoint 60');
    expect(labels(trend(list, 'overshoot'))).toEqual(expect.arrayContaining(['Peak at 95 s', 'Overshoot 18 %', 'Error left from the setpoint 0.4 m3/h']));
  });

  it('leaves the setpoint out when the historian\'s setpoint change differs from the engine\'s', () => {
    const list = redrawn(setpointStep(), tS => (tS < T0S ? 50 : 61));
    expect(labels(trend(list, 'measured')).some(l => l.startsWith('Setpoint'))).toBe(false);
    expect(trend(list, 'measured')!.series.map(s => s.id)).toEqual(['pv']);
    expect(labels(trend(list, 'overshoot')).some(l => l.startsWith('Error left'))).toBe(false);
  });

  it('draws the error from each sample\'s setpoint, so a setpoint that moved inside the event is reproduced', () => {
    const e = setpointStep();
    const ramp = (tS: number) => (tS < T0S ? 50 : 60 + Math.min(4, (tS - T0S) / 60));
    const pv = e.byKind.accepted_samples[0];
    const t = [...pv.columns.x], y = [...pv.columns.y];
    let iae = 0, ise = 0, itae = 0;
    for (let i = 0; i < t.length; i++) {
      const a = Math.max(t[i], T0S), b = Math.min(i + 1 < t.length ? t[i + 1] : T0S + 480, T0S + 480);
      if (b <= a) continue;
      const err = ramp(t[i]) - y[i];
      iae += Math.abs(err) * (b - a); ise += err * err * (b - a); itae += 0.5 * Math.abs(err) * ((b - T0S) ** 2 - (a - T0S) ** 2);
    }
    const metrics = e.metrics.map(m => (m.quantityId === 'iae' ? q('iae', iae, 'PV_EU*s') : m.quantityId === 'ise' ? q('ise', ise, 'PV_EU^2*s') : m.quantityId === 'itae' ? q('itae', itae, 'PV_EU*s^2') : m));
    expect(ids(redrawn(e, ramp, metrics))).toContain('error');
    // the stored charts carry no setpoint per sample: CHG-197 could not draw this one
    expect(ids(responseTrendSpecs(buildFacts({ byKind: e.byKind, metrics, result: e.result, t0Ms: T0S * 1000, pvUnit: 'm3/h' })!))).not.toContain('error');
  });

  it('leaves the error out when the samples do not give the engine\'s integrals', () => {
    const e = selfRegulating();
    const pv = e.byKind.accepted_samples[0];
    const off = integrals([...pv.columns.x], [...pv.columns.y], 130, 130, T0S + 600);
    const metrics = e.metrics.map(m => (m.quantityId === 'iae' ? q('iae', off.iae * 1.01, 'PV_EU*s') : m));
    expect(ids(redrawn(e, () => 130, metrics))).not.toContain('error');
  });
});

describe('plannedTrends', () => {
  it('names the trends a redraw makes for the event, from its quantities, before anything is read', () => {
    const e = selfRegulating();
    expect(plannedTrends(wFor(e), e.result, e.metrics, 'm3/h'))
      .toEqual(['Measured response', 'Input', 'Dead time and time constant', 'Rise time and settling', 'Error from the setpoint']);
    const s = setpointStep();
    expect(plannedTrends(wFor(s), s.result, s.metrics, 'm3/h')).toEqual(['Measured response', 'Input', 'Rise time and settling', 'Overshoot', 'Error from the setpoint']);
    const l = levelLoop();
    expect(plannedTrends(wFor(l), l.result, l.metrics, 'm3/h')).toEqual(['Measured response', 'Input', 'Slope']);
    expect(plannedTrends(wFor(e), result({ evaluation_state: 'CENSORED' }), e.metrics, 'm3/h')).toEqual(['Measured response', 'Input']);
  });
});
