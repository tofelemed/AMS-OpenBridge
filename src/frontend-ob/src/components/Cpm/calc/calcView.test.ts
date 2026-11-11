// CHG-166 (owner review, question 2): a PV-unit calculation reads in the loop's own unit, as System Response does; the
// placeholder stays when the loop has none. The number is formatted from the catalogue unit, so a unit never changes it.
import { describe, expect, it } from 'vitest';
import { METRICS } from '../calcCatalogue';
import { loopUnit, valueText } from './calcView';

const metric = (id: string) => METRICS.find(m => m.id === id)!;

describe('loopUnit', () => {
  it('puts the loop PV unit in place of the placeholder', () => {
    expect(loopUnit('PV units', 'kg/h')).toBe('kg/h');
    expect(loopUnit('PV·s', 'kg/h')).toBe('kg/h·s');
    expect(loopUnit('PV²·s', 'kg/h')).toBe('(kg/h)²·s');
  });

  it('squares a one-word unit without brackets', () => {
    expect(loopUnit('PV²·s', '°C')).toBe('°C²·s');
    expect(loopUnit('PV²·s', 'bar')).toBe('bar²·s');
  });

  it('keeps the placeholder when the loop has no PV unit, and leaves other units alone', () => {
    expect(loopUnit('PV units', null)).toBe('PV units');
    expect(loopUnit('PV·s', '  ')).toBe('PV·s');
    expect(loopUnit('ratio', 'kg/h')).toBe('ratio');
    expect(loopUnit('%/day', 'kg/h')).toBe('%/day');
  });
});

describe('valueText', () => {
  it('writes a PV-unit value in the loop unit', () => {
    expect(valueText(metric('CPLM-010'), 1.988, { pvUnit: 'kg/h' })).toBe('1.988 kg/h');
    expect(valueText(metric('CPLM-012'), 85666, { pvUnit: 'kg/h' })).toBe('85,666 kg/h·s');
    expect(valueText(metric('CPLM-013'), 250412, { pvUnit: 'kg/h' })).toBe('250,412 (kg/h)²·s');
  });

  it('keeps the number as the catalogue unit formats it, whatever the loop unit', () => {
    expect(valueText(metric('CPLM-010'), 1.988, { pvUnit: '%' })).toBe('1.988 %');
  });

  it('reads PV units with no loop unit, and no unit when asked for none', () => {
    expect(valueText(metric('CPLM-010'), 1.988)).toBe('1.988 PV units');
    expect(valueText(metric('CPLM-010'), 1.988, { pvUnit: 'kg/h', withUnit: false })).toBe('1.988');
    expect(valueText(metric('CPLM-030'), 280.5, { withUnit: false })).toBe('280.5');
  });

  it('leaves ratios, counts and the evidence score as they were', () => {
    expect(valueText(metric('CPLM-001'), 0.95, { pvUnit: 'kg/h' })).toBe('0.95');
    expect(valueText(metric('CPLM-002'), 8221, { pvUnit: 'kg/h' })).toBe('8221');
    expect(valueText(metric('CPLM-090'), 1, { pvUnit: 'kg/h' })).toBe('100 / 100');
  });
});
