// v2.5 workbench: every number the workbench prints goes through one formatter (the audit found
// `period 290.23199999999997 s` and `gain=-76.55206322791764` on the page) and every raw provenance
// key gets a label the reader understands (`acf_series.period_s` -> ACF period), the raw key on hover.
import { describe, expect, it } from 'vitest';
import { fmtQuantity, labelForKey, shortId, unitForKey } from './format';

describe('fmtQuantity', () => {
  it('rounds by unit: seconds to a tenth, fractions to three places, pp to a tenth, counts to integers', () => {
    expect(fmtQuantity(290.23199999999997, 's')).toBe('290.2 s');
    expect(fmtQuantity(0.99999, '1')).toBe('1.000');
    expect(fmtQuantity(0.4321, 'fraction')).toBe('0.432');
    expect(fmtQuantity(12.345, 'pp')).toBe('12.3 pp');
    expect(fmtQuantity(33, 'count')).toBe('33');
    expect(fmtQuantity(33.0, undefined, 'accepted_cycles')).toBe('33');
  });

  it('infers the rule from the key when the unit is missing', () => {
    expect(fmtQuantity(290.23199999999997, undefined, 'period_s')).toBe('290.2 s');
    expect(fmtQuantity(0.987654, undefined, 'regularity')).toBe('0.988');
    expect(fmtQuantity(0.0123456, 'Hz')).toBe('0.01235 Hz');
  });

  it('keeps engineering values to four significant digits with their unit', () => {
    expect(fmtQuantity(-76.55206322791764, 'PV_EU')).toBe('-76.55 PV_EU');
    expect(fmtQuantity(2253.4911219816613, 'EU')).toBe('2253 EU');
    expect(fmtQuantity(141.19070994149413)).toBe('141.2');
  });

  it('never prints NaN, null or undefined as a number', () => {
    expect(fmtQuantity(NaN, 's')).toBe('—');
    expect(fmtQuantity(null, 's')).toBe('—');
    expect(fmtQuantity(undefined)).toBe('—');
    expect(fmtQuantity(Infinity, 's')).toBe('—');
  });

  it('passes strings through, joining ; lists and truncating the very long', () => {
    expect(fmtQuantity('LINEAR_DETREND;SUBTRACT_MEAN')).toBe('Linear detrend · Subtract mean');
    expect(fmtQuantity('true')).toBe('true');
    expect(fmtQuantity('x'.repeat(200)).length).toBeLessThanOrEqual(163);
    expect(fmtQuantity('42.5', 's')).toBe('42.5 s');
  });
});

describe('labelForKey / unitForKey / shortId', () => {
  it('maps known provenance keys to labels, stripping the artifact prefix', () => {
    expect(labelForKey('acf_series.period_s')).toBe('ACF period');
    expect(labelForKey('accepted_cycles')).toBe('Accepted cycles');
    expect(labelForKey('psd.resolution_hz')).toBe('Frequency resolution');
  });
  it('humanises an unknown key instead of printing it raw', () => {
    expect(labelForKey('psd.segment_samples_used')).toBe('Segment samples used');
  });
  it('infers a unit from the key suffix', () => {
    expect(unitForKey('period_s')).toBe('s');
    expect(unitForKey('resolution_hz')).toBe('Hz');
    expect(unitForKey('sigma_u_norm')).toBe('1');
    expect(unitForKey('cycle_id')).toBeUndefined();
  });
  it('shortens ids for display and never fabricates one', () => {
    expect(shortId('4ccaf304-0e8d-54df-94ef-83f4130ee28d')).toBe('4ccaf304');
    expect(shortId('profile:ffa30188e0775f18', 16)).toBe('profile:ffa30188');
    expect(shortId(null)).toBe('—');
  });
});
