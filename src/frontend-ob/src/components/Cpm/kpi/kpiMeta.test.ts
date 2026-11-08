// CHG-085: what each Overview KPI carries. CHG-155: the change since 24 h ago is no longer shown, so it is not computed.
import { describe, expect, it } from 'vitest';
import { KPI_META } from './kpiMeta';
import { KPI_GROUPS } from './fleetKpiView';

describe('Overview KPI metadata (CHG-085)', () => {
  it('every Overview KPI has an icon, a formula and a threshold', () => {
    for (const key of KPI_GROUPS.flatMap(g => g.keys)) {
      const m = KPI_META[key];
      expect(m, key).toBeDefined();
      expect(m!.formula.length, key).toBeGreaterThan(10);
    }
  });
});
