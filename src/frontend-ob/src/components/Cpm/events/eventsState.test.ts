// v2.5 Task 1F.2 — condition and availability are read separately; an open-but-unobservable
// episode is neither "closed" nor "healthy", and a pre-v2.5 row is not assumed observed.
import { describe, it, expect } from 'vitest';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { availabilityCopy, availabilityOf, availabilityPill, conditionOf, matchesEventFilter, supportCopy } from './eventsState';

const frame = (over: Partial<CpmEventFrame>): CpmEventFrame => ({
  id: 1, loop_id: 'FIC101', window_kind: '24h', family: 'OSCILLATION', opened_at: '2026-09-15T00:00:00Z',
  closed_at: null, peak_diagnosis: 'SUSPECTED_OSCILLATION', peak_confidence: 0.8, last_diagnosis: 'SUSPECTED_OSCILLATION',
  last_confidence: 0.8, severity: 'HIGH', window_count: 2, ack_state: 'UNACKNOWLEDGED', acked_by: null, acked_at: null,
  shelve_until: null, note: null, calculation_version: '3.0.0', dynamics_profile_version: '2.0.0',
  availability_state: 'OBSERVED', condition_state: 'OPEN', result_revision: 1, qualified_support_ms: 2 * 86_400_000,
  close_reason: null, ...over,
});

describe('eventsState', () => {
  it('keeps an open-but-unobservable episode OPEN and flags it', () => {
    const e = frame({ availability_state: 'UNOBSERVABLE', last_diagnosis: 'EXCLUDED_DATA_QUALITY' });
    expect(conditionOf(e)).toBe('OPEN');
    expect(availabilityOf(e)).toBe('UNOBSERVABLE');
    expect(availabilityPill(e)).toEqual({ label: 'Unobservable', tone: 'warn' });
    expect(availabilityCopy(e)).toContain('NOT recovered');
    expect(matchesEventFilter(e, 'open')).toBe(true);
    expect(matchesEventFilter(e, 'unobservable')).toBe(true);
    expect(matchesEventFilter(e, 'closed')).toBe(false);
  });

  it('reads a closed frame from either the condition column or closed_at', () => {
    expect(conditionOf(frame({ condition_state: 'CLOSED', closed_at: '2026-09-16T00:00:00Z' }))).toBe('CLOSED');
    expect(conditionOf(frame({ condition_state: 'OPEN', closed_at: '2026-09-16T00:00:00Z' }))).toBe('CLOSED');
    expect(availabilityCopy(frame({ condition_state: 'CLOSED', closed_at: '2026-09-16T00:00:00Z', close_reason: 'RECOVERED' })))
      .toContain('fault-free result');
  });

  it('does not assume a pre-v2.5 row was observed', () => {
    const legacy = frame({ availability_state: undefined as unknown as string, condition_state: undefined as unknown as string });
    expect(availabilityOf(legacy)).toBe('LEGACY');
    expect(availabilityPill(legacy)).toEqual({ label: 'Availability unknown', tone: 'muted' });
    expect(availabilityCopy(legacy)).toContain('before v2.5');
    expect(matchesEventFilter(legacy, 'unobservable')).toBe(false);
  });

  it('describes the support as non-overlapping windows plus qualified hours', () => {
    expect(supportCopy(frame({}))).toBe('2 non-overlapping window(s) · 2.0 d of qualified support');
    expect(supportCopy(frame({ qualified_support_ms: 5 * 3_600_000, window_count: 1 }))).toBe('1 non-overlapping window(s) · 5.0 h of qualified support');
    expect(supportCopy(frame({ qualified_support_ms: 0, window_count: 3 }))).toBe('3 evaluation window(s)');
  });
});
