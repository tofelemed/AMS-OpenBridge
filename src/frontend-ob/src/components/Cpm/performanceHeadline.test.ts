// CHG-093 (SME review 2 #10, #11): the Performance headline counts every assessed loop in scope and states its basis and
// exclusions, with error as % of PV span, never a raw-unit median across loops. Task 7: the tile is short; the basis is
// the dialog's lines.
import { describe, expect, it } from 'vitest';
import type { FleetPerformance } from '../../api/cpm/fleetKpis';
import { basisLines, headlineTiles, capabilityTile } from './performanceHeadline';

const P = (over: Partial<FleetPerformance> = {}): FleetPerformance => ({
  monitored: 175, assessed: 120,
  excluded: { notAssessable: 40, stale: 10, neverEvaluated: 5 },
  goodError: { meanPct: 71.25, medianPct: 75, counted: 118, notMeasured: 2 },
  errorOfSpan: { medianPct: 1.84, counted: 100, noSpan: 18, notMeasured: 2 },
  periodic: { count: 12, of: 120 },
  ...over,
});

describe('Performance headline basis (SME review 2 #10/#11)', () => {
  it('counts every assessed loop and names what was left out, in separate lines', () => {
    expect(basisLines(P(), 120)).toEqual([
      '120 of 120 assessed loops contribute', 'Not assessed: 40 not assessable, 10 stale, 5 never evaluated']);
    expect(basisLines(P({ excluded: { notAssessable: 0, stale: 0, neverEvaluated: 0 } }), 118, ['2 not measured']))
      .toEqual(['118 of 120 assessed loops contribute', 'Not counted: 2 not measured']);
  });

  it('gives error as % of PV span and says which loops had no span', () => {
    const [good, err, periodic] = headlineTiles(P());
    expect(good.value).toBe('71.3 %');
    expect(good.drill).toBe('assessed');
    expect(basisLines(P(), good.counted, good.notCounted)[0]).toBe('118 of 120 assessed loops contribute');
    expect(err.caption).toBe('Median error');
    expect(err.value).toBe('1.8 %');
    expect(err.notCounted).toEqual(['18 without a PV span', '2 not measured']);
    expect(periodic.caption).toBe('Periodic diagnosis');
    expect(periodic.value).toBe('12');
    expect(periodic.drill).toBe('periodic');
  });

  it('pins the four sub-lines to the reference', () => {
    const [good, err, periodic] = headlineTiles(P());
    expect([good.sub, err.sub, periodic.sub]).toEqual([
      'Mean · 118 assessed loops', 'MAE ÷ PV span · 100 assessed', 'Oscillation / valve nonlinearity']);
    expect(capabilityTile(72, { loopsCappedByMissingVp: 4, loopsWithoutDisturbanceContext: 0 }).sub).toBe('Expected VP not mapped');
  });

  it('uses the singular for one assessed loop', () => {
    const one = P({ assessed: 1, goodError: { meanPct: 71, medianPct: 71, counted: 1, notMeasured: 0 } });
    expect(headlineTiles(one)[0].sub).toBe('Mean · 1 assessed loop');
    expect(basisLines(one, 1)[0]).toBe('1 of 1 assessed loop contributes');
  });

  it('keeps the tile text short: the sentence goes in the dialog', () => {
    for (const t of headlineTiles(P())) expect(t.sub.length).toBeLessThan(40);
    expect(headlineTiles(P())[1].title).toMatch(/pvMax − pvMin/);
  });

  it('an empty basis shows no figure, never 0', () => {
    const [good, err] = headlineTiles(P({ assessed: 0, goodError: { meanPct: null, medianPct: null, counted: 0, notMeasured: 0 },
      errorOfSpan: { medianPct: null, counted: 0, noSpan: 0, notMeasured: 0 } }));
    expect(good.value).toBe('—');
    expect(err.sub).toBe('no assessed loop');
  });

  it('the capability tile is a short count and the sentence behind it stays for the dialog', () => {
    const t = capabilityTile(72, { loopsCappedByMissingVp: 4, loopsWithoutDisturbanceContext: 0 });
    expect(t.value).toBe('68/72');
    expect(t.sub).toBe('Expected VP not mapped');
    expect(t.title).toMatch(/approved test record to be confirmed/);
    expect(capabilityTile(72, { loopsCappedByMissingVp: 0, loopsWithoutDisturbanceContext: 0 }).sub).toBe('all valve loops mapped');
    expect(capabilityTile(null, undefined).value).toBe('—');
  });
});
