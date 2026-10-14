// CHG-093 (SME review 2 #10, #11): the Performance headline states its basis (every assessed loop in scope) and its
// exclusions, and gives error as % of PV span — never a raw-unit median across loops.
import { describe, expect, it } from 'vitest';
import type { FleetPerformance } from '../../api/cpm/fleetKpis';
import { basisText, headlineTiles } from './performanceHeadline';

const P = (over: Partial<FleetPerformance> = {}): FleetPerformance => ({
  monitored: 175, assessed: 120,
  excluded: { notAssessable: 40, stale: 10, neverEvaluated: 5 },
  goodError: { meanPct: 71.25, medianPct: 75, counted: 118, notMeasured: 2 },
  errorOfSpan: { medianPct: 1.84, counted: 100, noSpan: 18, notMeasured: 2 },
  periodic: { count: 12, of: 120 },
  ...over,
});

describe('Performance headline basis (SME review 2 #10/#11)', () => {
  it('counts every assessed loop and names the exclusions', () => {
    expect(basisText(P(), 120)).toBe('120 of 120 assessed loop(s) · excluded: 40 not assessable, 10 stale, 5 never evaluated');
    expect(basisText(P({ excluded: { notAssessable: 0, stale: 0, neverEvaluated: 0 } }), 120)).toBe('120 of 120 assessed loop(s)');
  });
  it('gives error as % of PV span and says which loops had no span', () => {
    const [good, err, periodic] = headlineTiles(P());
    expect(good.value).toBe('71.3 %');
    expect(good.sub).toMatch(/^mean · 118 of 120 assessed loop\(s\) · excluded: 2 not measured, 40 not assessable/);
    expect(err.caption).toBe('Median error (% of span)');
    expect(err.value).toBe('1.8 %');
    expect(err.sub).toMatch(/^MAE ÷ PV span · 100 of 120 assessed loop\(s\) · excluded: 18 without a PV span, 2 not measured/);
    expect(periodic.value).toBe('12');
  });
  it('an empty basis shows no figure, never 0', () => {
    const [good, err] = headlineTiles(P({ assessed: 0, goodError: { meanPct: null, medianPct: null, counted: 0, notMeasured: 0 },
      errorOfSpan: { medianPct: null, counted: 0, noSpan: 0, notMeasured: 0 } }));
    expect(good.value).toBe('—');
    expect(err.sub).toBe('no assessed loops yet');
  });
});
