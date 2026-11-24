/**
 * CHG-227 (owner, 24 Nov 2026: PV, SP and OP on Loop Explorer only changed on refresh): a live value wins while its feed is
 * current; a live value that stopped arriving gives way to a newer historian bucket, which the page re-reads every minute.
 * Before, any live value won however old, so a stalled live feed froze the values until the page was reloaded.
 */
import { describe, expect, it } from 'vitest';
import { pickSource } from './signalSource';

const NOW = Date.parse('2026-11-24T10:00:00Z');
const MIN = 60_000;
const ago = (m: number) => NOW - m * MIN;

describe('pickSource (CHG-227)', () => {
  it('a current live value wins, even over a newer historian bucket', () => {
    expect(pickSource({ value: 12, ts: ago(4) }, { value: 13, ts: ago(2) }, { value: 11, ts: ago(60) }, NOW)).toBe('live');
  });

  it('a live value that stopped arriving gives way to a newer historian bucket', () => {
    expect(pickSource({ value: 12, ts: ago(11) }, { value: 13, ts: ago(2) }, { value: 11, ts: ago(60) }, NOW)).toBe('trend');
  });

  it('a stalled live value still wins over an older bucket, or when there is no bucket', () => {
    expect(pickSource({ value: 12, ts: ago(30) }, { value: 13, ts: ago(40) }, { value: null }, NOW)).toBe('live');
    expect(pickSource({ value: 12, ts: ago(30) }, { value: null }, { value: 11, ts: ago(60) }, NOW)).toBe('live');
  });

  it('without a live value: the bucket, then the last stored value, else nothing', () => {
    expect(pickSource({ value: null }, { value: 13, ts: ago(2) }, { value: 11, ts: ago(60) }, NOW)).toBe('trend');
    expect(pickSource({ value: undefined }, { value: null }, { value: 11, ts: ago(60) }, NOW)).toBe('held');
    expect(pickSource({ value: null }, { value: null }, { value: null }, NOW)).toBeNull();
  });

  it('works for the text Mode too', () => {
    expect(pickSource<string>({ value: 'AUT', ts: ago(20) }, { value: 'MAN', ts: ago(1) }, { value: null }, NOW)).toBe('trend');
  });
});
