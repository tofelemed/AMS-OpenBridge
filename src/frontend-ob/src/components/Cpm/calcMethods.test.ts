// Task 20: a method for every metric, written from the engine (src/flink cplm/engine), not from the prototype.
import { describe, expect, it } from 'vitest';
import { METRICS } from './calcCatalogue';
import { calcMethod } from './calcMethods';

describe('calcMethod', () => {
  it('has a method for every metric', () => {
    for (const m of METRICS) {
      const method = calcMethod(m.id);
      expect(method.formula, m.id).not.toBe('');
      expect(method.text, m.id).not.toBe('');
    }
  });

  it('writes CPLM-020 as std(OP) ÷ std(PV)', () => {
    expect(calcMethod('CPLM-020').formula).toBe('std(OP) ÷ std(PV)');
  });

  it('counts samples, not time, for CPLM-003 and CPLM-014', () => {
    expect(calcMethod('CPLM-003').formula).toBe('samples in AUTO ÷ samples');
    expect(calcMethod('CPLM-014').formula).toBe('samples inside the band ÷ samples');
  });

  it('does not clamp completeness to 1', () => {
    expect(calcMethod('CPLM-001').text).toMatch(/above 1/);
  });

  it('answers an id it does not know with empty text', () => {
    expect(calcMethod('CPLM-999')).toEqual({ formula: '', text: '' });
  });
});
