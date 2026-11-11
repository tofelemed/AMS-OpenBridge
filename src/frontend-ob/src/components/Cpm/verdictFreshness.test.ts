// CHG-170 (owner answer 2): one verdict age, one rule. GET fleet/kpis carries `newestResultAt` (the newest 12 h result across
// the scope); it is Stale once older than basis.freshSeconds (60 min), the Overview's Stale KPI rule. Overview, Performance and
// Pipeline Health read it the same way. An older cplm-api without the field answers undefined, so a page keeps its old read.
import { describe, expect, it } from 'vitest';
import { ageText, fleetFreshness } from './verdictFreshness';

const NOW = Date.parse('2026-11-11T12:00:00Z');
const basis = { freshSeconds: 3600 };

describe('fleetFreshness', () => {
  it('reads the newest result and calls it stale above the Overview threshold', () => {
    const f = fleetFreshness({ basis, newestResultAt: '2026-11-07T11:45:00Z' }, NOW)!;
    expect(f.at).toBe(Date.parse('2026-11-07T11:45:00Z'));
    expect(f.ageMs).toBe(NOW - Date.parse('2026-11-07T11:45:00Z'));
    expect(f.stale).toBe(true);
    expect(f.freshMs).toBe(3_600_000);
  });

  it('is fresh at exactly the threshold and stale one minute past it', () => {
    expect(fleetFreshness({ basis, newestResultAt: '2026-11-11T11:00:00Z' }, NOW)!.stale).toBe(false);
    expect(fleetFreshness({ basis, newestResultAt: '2026-11-11T10:59:00Z' }, NOW)!.stale).toBe(true);
  });

  it('follows a configured threshold', () => {
    expect(fleetFreshness({ basis: { freshSeconds: 7200 }, newestResultAt: '2026-11-11T10:30:00Z' }, NOW)!.stale).toBe(false);
  });

  it('says no result when the scope has none, and is not stale', () => {
    expect(fleetFreshness({ basis, newestResultAt: null }, NOW)).toEqual({ at: null, ageMs: null, stale: false, freshMs: 3_600_000 });
  });

  it('is undefined when the answer predates the field or has not arrived', () => {
    expect(fleetFreshness({ basis }, NOW)).toBeUndefined();
    expect(fleetFreshness(undefined, NOW)).toBeUndefined();
  });
});

describe('ageText', () => {
  it('says minutes up to two hours, then hours, and never 0 min', () => {
    expect(ageText(20_000)).toBe('under 1 min');
    expect(ageText(60_000)).toBe('1 min');
    expect(ageText(18 * 60_000)).toBe('18 min');
    expect(ageText(119 * 60_000)).toBe('119 min');
    expect(ageText(96.3 * 3_600_000)).toBe('96 h');
  });
});
