/** CHG-185 (owner review item 5, Q3): a live reading's state colour, from thresholds the page holds; never invented. */
import { describe, expect, it } from 'vitest';
import { modeNeedsLook, modeReadingState, opReadingState } from './readingState';

const RANGE = { opMin: 0, opMax: 100 };

describe('opReadingState', () => {
  it('says At limit for a live OP at or beyond a registered bound, as shown to two decimals', () => {
    expect(opReadingState(100, true, RANGE)).toBe('At limit');
    expect(opReadingState(0, true, RANGE)).toBe('At limit');
    expect(opReadingState(-2, true, RANGE)).toBe('At limit');
    expect(opReadingState(99.999, true, RANGE)).toBe('At limit');
    expect(opReadingState(80, true, { opMin: 10, opMax: 80 })).toBe('At limit');
  });

  it('stays neutral inside the range, and invents no band near a bound', () => {
    expect(opReadingState(48.2, true, RANGE)).toBeNull();
    expect(opReadingState(99.9, true, RANGE)).toBeNull();
    expect(opReadingState(0.01, true, RANGE)).toBeNull();
  });

  it('stays neutral when the value is not live or the loop registers no usable range', () => {
    expect(opReadingState(100, false, RANGE)).toBeNull();
    expect(opReadingState(100, true, null)).toBeNull();
    expect(opReadingState(100, true, { opMin: 0 })).toBeNull();
    expect(opReadingState(100, true, { opMin: 100, opMax: 100 })).toBeNull();
    expect(opReadingState(null, true, RANGE)).toBeNull();
  });
});

describe('modeNeedsLook', () => {
  it('flags a live mode the engine does not count as normal', () => {
    expect(modeNeedsLook('MAN', true)).toBe(true);
    expect(modeNeedsLook('UNKNOWN', true)).toBe(true);
    expect(modeNeedsLook('XYZ', true)).toBe(true);
  });

  it('leaves a normal mode, a stored mode or no mode neutral', () => {
    expect(modeNeedsLook('AUT', true)).toBe(false);
    expect(modeNeedsLook('CAS', true)).toBe(false);
    expect(modeNeedsLook('MAN', false)).toBe(false);
    expect(modeNeedsLook(null, true)).toBe(false);
  });
});

// CHG-193 (final review M6): the word beside the amber mode box, as OP has At limit
describe('modeReadingState', () => {
  it('says Not normal for a live mode the engine does not count as normal, and nothing otherwise', () => {
    expect(modeReadingState('MAN', true)).toBe('Not normal');
    expect(modeReadingState('XYZ', true)).toBe('Not normal');
    expect(modeReadingState('AUT', true)).toBeNull();
    expect(modeReadingState('MAN', false)).toBeNull();
    expect(modeReadingState(undefined, true)).toBeNull();
  });
});
