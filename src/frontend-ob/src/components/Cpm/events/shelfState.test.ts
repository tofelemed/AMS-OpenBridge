// CHG-032: the shelf is its own lifecycle. An expired shelf is an unreviewed finding, never
// "Shelved"; an acknowledged episode can still be shelved; unshelving keeps the ack.
import { describe, it, expect } from 'vitest';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { matchesEventFilter, presetsWithin, shelfCountdown, shelfState, stateView } from './shelfState';

const NOW = Date.parse('2026-09-20T09:00:00Z');
const frame = (over: Partial<CpmEventFrame>): CpmEventFrame => ({
  id: 833, loop_id: 'FIC10301', window_kind: '24h', family: 'FINAL_ELEMENT_NONLINEARITY',
  opened_at: '2026-09-02T07:30:00Z', closed_at: null, peak_diagnosis: 'SUSPECTED_FINAL_ELEMENT_NONLINEARITY',
  peak_confidence: 0.89, last_diagnosis: null, last_confidence: null, severity: null, window_count: 40,
  ack_state: 'UNACKNOWLEDGED', acked_by: null, acked_at: null, shelve_until: null, note: null,
  calculation_version: null, dynamics_profile_version: null, availability_state: 'UNOBSERVABLE',
  condition_state: 'OPEN', result_revision: null, qualified_support_ms: null, close_reason: null,
  shelf_state: 'NONE', shelved_by: null, shelved_at: null, shelve_reason: null,
  ...over,
});
const active = (over: Partial<CpmEventFrame> = {}) => frame({ shelf_state: 'SHELVED', shelve_until: '2026-09-20T12:00:00Z', shelved_by: 'eng.a', ...over });
const lapsed = (over: Partial<CpmEventFrame> = {}) => frame({ shelf_state: 'SHELVED', shelve_until: '2026-09-17T08:22:35Z', ...over });

describe('shelfState', () => {
  it('derives ACTIVE / EXPIRED from the shelf column and the clock, and nothing for an unshelved frame', () => {
    expect(shelfState(frame({}), NOW)).toBeNull();
    expect(shelfState(active(), NOW)).toBe('ACTIVE');
    expect(shelfState(lapsed(), NOW)).toBe('EXPIRED');   // past the expiry, sweeper not yet run
    expect(shelfState(frame({ shelf_state: 'EXPIRED', shelve_until: '2026-09-17T08:22:35Z' }), NOW)).toBe('EXPIRED');
    expect(shelfState(frame({ shelf_state: 'SHELVED', shelve_until: null }), NOW)).toBe('EXPIRED');
    // a row the conversion script has not reached, and an API that predates the column
    expect(shelfState(frame({ shelf_state: null, ack_state: 'SHELVED', shelve_until: '2026-09-20T12:00:00Z' }), NOW)).toBe('ACTIVE');
    expect(shelfState(frame({ shelf_state: null, ack_state: 'SHELVED', shelve_until: '2026-09-17T08:22:35Z' }), NOW)).toBe('EXPIRED');
    expect(shelfState(frame({ shelf_state: null }), NOW)).toBeNull();
  });

  it('labels the State column: closed first, then the shelf with its expiry, then the ack', () => {
    expect(stateView(lapsed(), NOW)).toEqual({ label: 'Shelf expired · unreviewed', tone: 'warn' });
    expect(stateView(active(), NOW)).toEqual({ label: 'Shelved · expires in 3.0 h', tone: 'muted' });
    expect(stateView(active({ ack_state: 'ACKNOWLEDGED' }), NOW).label).toBe('Shelved · expires in 3.0 h');
    expect(stateView(frame({ shelf_state: 'EXPIRED', ack_state: 'ACKNOWLEDGED' }), NOW)).toEqual({ label: 'Shelf expired', tone: 'muted' });
    expect(stateView(frame({ ack_state: 'ACKNOWLEDGED' }), NOW).label).toBe('Acknowledged');
    expect(stateView(frame({ closed_at: '2026-09-10T00:00:00Z' }), NOW).label).toBe('Closed · unacked');
  });

  it('filters: an active shelf leaves the unacknowledged queue, an expired one comes straight back', () => {
    expect(matchesEventFilter(lapsed(), 'shelved', NOW)).toBe(false);
    expect(matchesEventFilter(lapsed(), 'shelfExpired', NOW)).toBe(true);
    expect(matchesEventFilter(lapsed(), 'unacknowledged', NOW)).toBe(true);
    expect(matchesEventFilter(active(), 'shelved', NOW)).toBe(true);
    expect(matchesEventFilter(active(), 'unacknowledged', NOW)).toBe(false);
    expect(matchesEventFilter(active(), 'all', NOW)).toBe(true);
    // review and shelf are independent: an acknowledged, shelved episode is in both views
    const both = active({ ack_state: 'ACKNOWLEDGED' });
    expect(matchesEventFilter(both, 'acknowledged', NOW)).toBe(true);
    expect(matchesEventFilter(both, 'shelved', NOW)).toBe(true);
    expect(matchesEventFilter(both, 'unacknowledged', NOW)).toBe(false);
  });

  it('says how long a shelf has left, or how long ago it lapsed', () => {
    expect(shelfCountdown('2026-09-20T12:00:00Z', NOW)).toBe('expires in 3.0 h');
    expect(shelfCountdown('2026-09-17T09:00:00Z', NOW)).toBe('expired 3.0 d ago');
    expect(shelfCountdown(null, NOW)).toBe('no expiry recorded');
  });

  it('offers only the presets the site limit allows', () => {
    expect(presetsWithin(168).map(p => p.hours)).toEqual([1, 8, 24, 168]);
    expect(presetsWithin(24).map(p => p.hours)).toEqual([1, 8, 24]);
  });
});
