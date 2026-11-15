// CHG-197 (owner Q10): the Response tab as separate trends, one per row, each shown only when the engine produced what it draws,
// with the engine's values and units on its labels. An unavailable quantity draws nothing; decay ratio is never drawn; a
// censored event shows the measured response and the input only; a level event shows measured, input, slope, error (when the
// stored arrays reproduce the engine's integrals) and model fit, never dead time / time constant or rise / settling.
import { describe, expect, it } from 'vitest';
import type { Mark } from './annotations';
import { buildFacts, errorIntervals, responseBand } from './responseFacts';
import { responseTrendSpecs } from './responseTrendSpecs';
import { levelLoop, q, result, selfRegulating, setpointStep, T0S, type EventFixture } from './trendFixtures';
import type { TrendSpec } from './trendSupport';

const facts = (e: EventFixture, over: Partial<EventFixture> = {}) =>
  buildFacts({ byKind: over.byKind ?? e.byKind, metrics: over.metrics ?? e.metrics, result: over.result ?? e.result, t0Ms: T0S * 1000, pvUnit: 'm3/h' })!;
const specs = (e: EventFixture, over: Partial<EventFixture> = {}) => responseTrendSpecs(facts(e, over));
const ids = (list: TrendSpec[]) => list.map(s => s.id);
const labels = (s: TrendSpec | undefined) => (s?.marks ?? []).flatMap((m: Mark) => ('label' in m && m.label ? [typeof m.label === 'string' ? m.label : `${m.label.text}${m.label.value ? ` ${m.label.value}` : ''}`] : []));
const trend = (list: TrendSpec[], id: string) => list.find(s => s.id === id);
const without = (e: EventFixture, id: string) => e.metrics.map(m => (m.quantityId === id ? q(id, null, m.unit) : m));

describe('Response trends: which show', () => {
  it('a self-regulating input test shows every trend that applies, one per row, in the page order', () => {
    expect(ids(specs(selfRegulating()))).toEqual(['measured', 'input', 'dead-time', 'rise-settle', 'error', 'model-fit']);
  });

  it('a setpoint step that overshoots shows the overshoot trend; no model, so no dead time and no model fit', () => {
    expect(ids(specs(setpointStep()))).toEqual(['measured', 'input', 'rise-settle', 'overshoot', 'error']);
  });

  it('a level event shows measured, input, slope, model fit and never dead time / time constant or rise / settling', () => {
    const list = ids(specs(levelLoop()));
    expect(list).toEqual(['measured', 'input', 'slope', 'model-fit']);
    expect(list).not.toContain('dead-time');
    expect(list).not.toContain('rise-settle');
  });

  it('a censored event shows the measured response and the input only', () => {
    const e = selfRegulating();
    expect(ids(specs(e, { result: result({ evaluation_state: 'CENSORED', model_state: 'NONE' }) }))).toEqual(['measured', 'input']);
  });

  it('an unavailable quantity draws nothing: no dead time = no dead-time trend; no 50 % crossing = no 50 % dot', () => {
    const e = selfRegulating();
    expect(ids(specs(e, { metrics: without(e, 'dead_time') }))).not.toContain('dead-time');
    const rise = trend(specs(e, { metrics: without(e, 't50') }), 'rise-settle');
    expect(labels(rise)).toContain('10 %');
    expect(labels(rise)).not.toContain('50 %');
  });

  it('never draws the decay ratio, which stays in the quantities table', () => {
    for (const e of [selfRegulating(), setpointStep()]) {
      for (const s of specs(e)) {
        expect(s.title).not.toMatch(/decay/i);
        expect(labels(s).join(' ')).not.toMatch(/decay/i);
        expect(s.help.join(' ')).not.toMatch(/decay ratio/i);
      }
    }
  });
});

describe('Response trends: labels carry the engine values with units', () => {
  it('measured response: baseline, final value and the PV change', () => {
    const l = labels(trend(specs(selfRegulating()), 'measured'));
    expect(l).toEqual(expect.arrayContaining(['Step', 'Baseline 120', 'Final value 134.6', 'PV change 14.6 m3/h']));
  });

  it('measured response: the wrong-way move only when the engine reported one', () => {
    const e = selfRegulating();
    expect(labels(trend(specs(e), 'measured')).join(' ')).not.toMatch(/Wrong-way/);
    const metrics = e.metrics.map(m => (m.quantityId === 'undershoot' ? q('undershoot', 2, m.unit) : m));
    expect(labels(trend(specs(e, { metrics }), 'measured'))).toContain('Wrong-way move 2 % of the change');
  });

  it('input: the measured OP change and the gain named as the model value', () => {
    const l = labels(trend(specs(selfRegulating()), 'input'));
    expect(l).toEqual(expect.arrayContaining(['OP change 4 %', 'Gain (model) 3.65 m3/h/% OP']));
  });

  it('dead time and time constant from the model, in words, and the measured 63 % crossing as a dot', () => {
    const s = trend(specs(selfRegulating()), 'dead-time')!;
    expect(labels(s)).toEqual(expect.arrayContaining(['Dead time 34 s', 'Time constant 120 s', '63 % of the change', 'Measured 63 % 154 s']));
    expect(s.marks.some(m => m.kind === 'dot')).toBe(true);
    expect(labels(s).join(' ')).not.toMatch(/θ|τ|t63/);
  });

  it('rise time and settling: the crossings, the rise time, the band reproduced from the engine and the settled point', () => {
    const f = facts(selfRegulating());
    expect(responseBand(f)).toBeCloseTo(0.292, 6);
    const l = labels(trend(responseTrendSpecs(f), 'rise-settle'));
    expect(l).toEqual(expect.arrayContaining(['10 %', '50 %', '90 %', 'Rise time 250 s', 'Settling band ±0.292 m3/h', 'Settled 410 s']));
  });

  it('a band the engine did not use is not drawn; the settled point still is', () => {
    const e = selfRegulating();
    const metrics = e.metrics.map(m => (m.quantityId === 'settle_response' ? q('settle_response', 300, 's') : m));
    expect(responseBand(facts(e, { metrics }))).toBeNull();
    const l = labels(trend(specs(e, { metrics }), 'rise-settle'));
    expect(l.some(t => t.startsWith('Settling band'))).toBe(false);
    expect(l).toContain('Settled 300 s');
  });

  it('overshoot: the peak, the overshoot and the error left from the setpoint', () => {
    const l = labels(trend(specs(setpointStep()), 'overshoot'));
    expect(l).toEqual(expect.arrayContaining(['Peak at 95 s', 'Overshoot 18 %', 'Error left from the setpoint 0.4 m3/h']));
  });

  it('slope: the slope from the end of dead time with its rise over run, and the integrating gain named as the model value', () => {
    const s = trend(specs(levelLoop()), 'slope')!;
    const l = labels(s);
    expect(l).toEqual(expect.arrayContaining(['Dead time 30 s', 'Slope 0.02 m3/h/s', 'Integrating gain (model) 0.004 m3/h/(% OP·s)']));
    expect(l.some(t => /^\+[\d.]+ m3\/h$/.test(t))).toBe(true);
    expect(l.some(t => /^\d+ s$/.test(t))).toBe(true);
    expect(l.join(' ')).not.toMatch(/Time constant|Settl/);
  });

  it('error: drawn only when the stored arrays reproduce the engine integrals, with IAE, ISE and ITAE in units', () => {
    const e = selfRegulating();
    expect(errorIntervals(facts(e))).not.toBeNull();
    expect(labels(trend(specs(e), 'error')).join(' ')).toMatch(/IAE [\d,.]+ m3\/h·s.*ISE [\d,.]+ \(m3\/h\)²·s.*ITAE [\d,.]+ m3\/h·s²/);
    const off = e.metrics.map(m => (m.quantityId === 'iae' ? q('iae', m.value! * 1.01, m.unit) : m));
    expect(errorIntervals(facts(e, { metrics: off }))).toBeNull();
    expect(ids(specs(e, { metrics: off }))).not.toContain('error');
  });

  it('model fit: PV against the model fit as a labelled dash-dot line', () => {
    const s = trend(specs(selfRegulating()), 'model-fit')!;
    const fit = s.series.find(x => x.id === 'y_fit')!;
    expect(fit.label).toBe('Model fit (training)');
    expect(fit.dashDot).toBe(true);
    expect(s.series[0].label).toBe('PV');
  });

  it('every trend has a heading in words and a tip saying how the engine measures it', () => {
    for (const s of specs(selfRegulating())) {
      expect(s.title).toMatch(/^[A-Z][a-z]/);
      expect(s.help.length).toBeGreaterThan(0);
    }
    expect(trend(specs(selfRegulating()), 'rise-settle')!.help.join(' ')).toMatch(/2 % of the change or 0\.1 m3\/h, whichever is larger/);
  });
});
