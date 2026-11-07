// Task 20: the catalogue places every metric in a category, and says the engine's CPLM-020 (std(OP) / std(PV)).
import { describe, expect, it } from 'vitest';
import { CATEGORIES, METRICS } from './calcCatalogue';

describe('calculation catalogue', () => {
  it('places all 19 metrics in a category', () => {
    expect(METRICS).toHaveLength(19);
    expect(METRICS.every(m => m.category)).toBe(true);
    expect(new Set(METRICS.map(m => m.category))).toEqual(new Set(CATEGORIES));
  });

  it('groups the metrics by what they measure', () => {
    const of = (c: string) => METRICS.filter(m => m.category === c).map(m => m.id);
    expect(of('Data & mode')).toEqual(['CPLM-001', 'CPLM-002', 'CPLM-003']);
    expect(of('Control error')).toEqual(['CPLM-010', 'CPLM-011', 'CPLM-012', 'CPLM-013', 'CPLM-014']);
    expect(of('Actuator')).toEqual(['CPLM-020', 'CPLM-021', 'CPLM-022']);
    expect(of('Decision')).toEqual(['CPLM-090']);
  });

  it('describes CPLM-020 as the engine computes it', () => {
    const m = METRICS.find(x => x.id === 'CPLM-020')!;
    expect(m.description).toMatch(/std\(OP\)/);
    expect(m.description).not.toMatch(/relative to the error/i);
  });

  it('describes CPLM-003 and CPLM-014 as sample fractions', () => {
    for (const id of ['CPLM-003', 'CPLM-014']) {
      expect(METRICS.find(x => x.id === id)!.description).toMatch(/samples/i);
    }
  });
});
