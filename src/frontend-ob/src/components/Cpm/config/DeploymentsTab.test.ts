// CHG-220 (Gate Configuration check): gap 2 - a deployment waiting for a later effective time says when it takes effect;
// minor - an Effective from that is not a date and time is caught before it is sent (it read "request failed (HTTP 400)").
import { describe, expect, it } from 'vitest';
import { scheduleProblem, takesEffect } from './DeploymentsTab';

describe('takesEffect', () => {
  const now = Date.parse('2026-11-23T10:00:00Z');
  it('only while a deployment waits for a later time', () => {
    expect(takesEffect({ state: 'PROBING', scheduledFor: '2026-11-24T06:00:00Z' }, now)).toMatch(/^takes effect /);
    expect(takesEffect({ state: 'PROBING', scheduledFor: '2026-11-23T09:00:00Z' }, now)).toBeNull();
    expect(takesEffect({ state: 'ACTIVE_VERIFIED', scheduledFor: '2026-11-24T06:00:00Z' }, now)).toBeNull();
    expect(takesEffect({ state: 'APPLYING', scheduledFor: null }, now)).toBeNull();
  });
});

describe('scheduleProblem', () => {
  it('empty is now; a date and time passes; anything else is said', () => {
    expect(scheduleProblem('')).toBeNull();
    expect(scheduleProblem('2026-11-24T06:00')).toBeNull();
    expect(scheduleProblem('2026-11-24T06:00:00Z')).toBeNull();
    expect(scheduleProblem('tomorrow 6')).toBe('Not a date and time, e.g. 2026-11-24T06:00');
    expect(scheduleProblem('2026-11-24 06:00')).toBe('Not a date and time, e.g. 2026-11-24T06:00');   // the server needs the T
    expect(scheduleProblem('2026-13-40')).toBe('Not a date and time, e.g. 2026-11-24T06:00');
  });
});
