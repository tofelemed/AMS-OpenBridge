// KPI Phase 4: per-loop KPI cards — values as stored (fractions as %, error and variability as % of PV span), judged by the
// engine's gate or the fleet rule, "not measured" never 0, and the change since the window 24 h earlier.
import { describe, expect, it } from 'vitest';
import type { LoopKpis } from '../../../api/cpm/loopKpis';
import { loopKpiCards } from './loopKpiView';

const K = (over: Partial<LoopKpis> = {}): LoopKpis => ({
  loopId: 'FIC1', windowKind: '24h', computedAt: '', reference: '',
  span: { pvMin: 0, pvMax: 200, pvUnit: 'm3/h' },
  current: { windowEnd: '2026-10-10T12:00:00Z', diagnosis: 'NO_CALL', limitSource: 'REGISTRY',
    values: { auto_pct: 0.98, good_error_pct: 0.72, mae: 4, pv_std: 3, saturation_pct: 0.01, travel_per_day: 850, reversals_per_hour: 12.5,
      sp_changes_per_h: 0, completeness: 0.99, sample_count: 17100, expected_sample_count: 17280 },
    gates: { G0: 'PASS', G1: 'PASS', G3: 'WARN', G4: 'FAIL' } },
  previous: { windowEnd: '2026-10-09T12:00:00Z', diagnosis: 'NO_CALL', values: { auto_pct: 0.9, mae: 6, travel_per_day: 850 }, gates: {} },
  ...over,
});
const byKey = (k: LoopKpis) => Object.fromEntries(loopKpiCards(k).map(c => [c.key, c]));

describe('per-loop KPI cards (KPI Phase 4)', () => {
  it('shows values in engineering terms and judges them by the engine gate or the fleet rule', () => {
    const c = byKey(K());
    expect(c.service).toMatchObject({ value: '98 %', tone: 'good' });
    expect(c['good-error']).toMatchObject({ value: '72 %', tone: 'warn' });          // G3 WARN
    expect(c.error.value).toBe('2 %');                                                // 4 / 200 of span
    expect(c.error.sub).toMatch(/^of PV span · 4.00 m3\/h · G3 warn$/);
    expect(c.variability.value).toBe('3 %');                                          // 2σ = 6 / 200
    expect(c.travel).toMatchObject({ value: '850 %/day', tone: 'bad' });              // G4 FAIL
    expect(c.coverage.sub).toBe('17100 of 17280 samples · G0 pass');
  });

  it('a value the engine did not store is "not measured", never 0; no span means no % of span', () => {
    const c = byKey(K({ current: { ...K().current!, values: { auto_pct: 1 } } }));
    expect(c['good-error']).toMatchObject({ value: '—', tone: 'muted', sub: 'not measured in this window' });
    const noSpan = byKey(K({ span: null }));
    expect(noSpan.error).toMatchObject({ value: '—', sub: 'no PV span registered' });
  });

  it('the change compares with the window 24 h earlier, in the direction that is better for that KPI', () => {
    const c = byKey(K());
    expect(c.service.delta).toMatchObject({ direction: 'up', good: true, text: '+8 pp' });   // SME 2 #13      // 90 → 98 %
    expect(c.error.delta).toMatchObject({ direction: 'down', good: true });                     // 3 → 2 % of span
    expect(c.travel.delta).toMatchObject({ direction: 'flat', good: null });
    expect(c.sp.delta).toBeNull();                                                              // not stored 24 h earlier
  });
});

describe('green only where it means acceptable control (CHG-092, SME review 2 #22)', () => {
  it('coverage and saturation within limits are context, not green; incomplete data is amber', () => {
    const c = byKey(K());
    expect(c.coverage.tone).toBe('muted');
    expect(c.saturation.tone).toBe('muted');
    const thin = byKey(K({ current: { ...K().current!, values: { ...K().current!.values, completeness: 0.5 } } }));
    expect(thin.coverage.tone).toBe('warn');
  });

  it('a gate PASS beside a finding is context, and the cards that bear on the finding are marked', () => {
    const cur = { ...K().current!, diagnosis: 'SUSPECTED_OSCILLATION', gates: { G0: 'PASS', G3: 'PASS', G4: 'PASS' } };
    const c = byKey(K({ current: cur }));
    expect(c['good-error'].tone).toBe('muted');
    expect(c.travel.tone).toBe('muted');
    expect(c.error.relevant).toBe(true);
    expect(c.variability.relevant).toBe(true);
    expect(c.travel.relevant).toBe(false);
    const ok = byKey(K({ current: { ...cur, diagnosis: 'NO_CALL' } }));
    expect(ok['good-error'].tone).toBe('good');
    expect(ok.error.relevant).toBe(false);
  });

  it('every card sits in one of the three groups', () => {
    const groups = new Set(loopKpiCards(K()).map(c => c.group));
    expect([...groups].sort()).toEqual(['actuator', 'control', 'evidence']);
  });
});
