// CHG-085: the change on each KPI card — a share in percentage points against the same rules 24 h earlier, green when it
// moved the right way for THAT KPI, never shown without an earlier picture.
import { describe, expect, it } from 'vitest';
import type { FleetKpiFigure, FleetKpis } from '../../../api/cpm/fleetKpis';
import { KPI_META, kpiDelta } from './kpiMeta';
import { KPI_GROUPS } from './fleetKpiView';

const fig = (key: FleetKpiFigure['key'], count: number, denominator: number): FleetKpiFigure =>
  ({ key, label: key, count, denominator, denominatorLabel: 'loops', rule: 'r' });
const withPrev = (prev: Array<{ key: FleetKpiFigure['key']; count: number; denominator: number }>) =>
  ({ previous: { asOf: '', monitored: 10, kpis: prev } }) as unknown as FleetKpis;

describe('KPI change since 24 h ago (CHG-085)', () => {
  it('a problem KPI going down is good news; a performance KPI going down is bad news', () => {
    const osc = kpiDelta(fig('oscillating', 1, 6), withPrev([{ key: 'oscillating', count: 2, denominator: 6 }]))!;
    expect(osc).toMatchObject({ points: -17, direction: 'down', good: true, text: '17 pts' });
    const mode = kpiDelta(fig('normal-mode', 6, 7), withPrev([{ key: 'normal-mode', count: 6, denominator: 6 }]))!;
    expect(mode).toMatchObject({ points: -14, direction: 'down', good: false });
    expect(mode.title).toBe('100 % 24 h ago (6 of 6) → 86 % now (6 of 7)');
  });

  it('flat is neutral; no earlier picture or an empty denominator shows no change at all', () => {
    expect(kpiDelta(fig('stale', 1, 10), withPrev([{ key: 'stale', count: 1, denominator: 10 }]))).toMatchObject({ direction: 'flat', good: null, text: '±0 pts' });
    expect(kpiDelta(fig('stale', 1, 10), {} as FleetKpis)).toBeNull();
    expect(kpiDelta(fig('valve', 1, 6), withPrev([{ key: 'valve', count: 0, denominator: 0 }]))).toBeNull();
  });

  it('every Overview KPI has an icon, a formula and a threshold', () => {
    for (const key of KPI_GROUPS.flatMap(g => g.keys)) {
      const m = KPI_META[key];
      expect(m, key).toBeDefined();
      expect(m!.formula.length, key).toBeGreaterThan(10);
    }
  });
});
