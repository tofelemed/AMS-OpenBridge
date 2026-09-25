/**
 * Loop Events — the shelf as its own lifecycle (CHG-032; ISA-18.2 §12).
 *
 * The API stores `shelf_state` (NONE | SHELVED | EXPIRED) beside `ack_state`
 * (UNACKNOWLEDGED | ACKNOWLEDGED): shelving never reviews an episode and
 * acknowledging never ends an active shelf. The sweeper flips SHELVED to EXPIRED
 * once a minute; ACTIVE / EXPIRED are still judged against the clock here so the
 * screen is right in the minute before the sweep, and so a row the conversion
 * script has not reached yet (`ack_state = 'SHELVED'`) reads the same way.
 */
import type { CpmEventAction, CpmEventFrame } from '../../../api/cpmApi';
import type { CpmTone } from '../shared';
import { conditionOf } from './eventsState';

export type ShelfState = 'ACTIVE' | 'EXPIRED';

type ShelfFields = Pick<CpmEventFrame, 'ack_state' | 'shelve_until'> & Partial<Pick<CpmEventFrame, 'shelf_state'>>;

export function shelfState(e: ShelfFields, now: number): ShelfState | null {
  const state = e.shelf_state ?? (e.ack_state === 'SHELVED' ? 'SHELVED' : 'NONE');
  if (state === 'EXPIRED') return 'EXPIRED';
  if (state !== 'SHELVED') return null;
  const until = e.shelve_until ? Date.parse(e.shelve_until) : NaN;
  if (!Number.isFinite(until)) return 'EXPIRED';
  return until > now ? 'ACTIVE' : 'EXPIRED';
}

export const isAcknowledged = (e: Pick<CpmEventFrame, 'ack_state'>) => e.ack_state === 'ACKNOWLEDGED';

export const SHELVE_PRESETS = [
  { label: '1 hour', hours: 1 },
  { label: '8 hours', hours: 8 },
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 168 },
];

/** The presets a site limit allows (the limit rides on the events read as `shelvePolicy.maxHours`). */
export const presetsWithin = (maxHours: number) => SHELVE_PRESETS.filter(p => p.hours <= maxHours);

/** "expires in 3 h" / "expired 2 d ago" — coarse on purpose. */
export function shelfCountdown(shelveUntil: string | null, now: number): string {
  const until = shelveUntil ? Date.parse(shelveUntil) : NaN;
  if (!Number.isFinite(until)) return 'no expiry recorded';
  const ms = until - now;
  const abs = Math.abs(ms);
  const text = abs < 3_600_000 ? `${Math.max(1, Math.round(abs / 60_000))} min`
    : abs < 48 * 3_600_000 ? `${(abs / 3_600_000).toFixed(1)} h`
      : `${(abs / 86_400_000).toFixed(1)} d`;
  return ms > 0 ? `expires in ${text}` : `expired ${text} ago`;
}

export interface StateView { label: string; tone: CpmTone }

/**
 * The State column: condition first (a closed episode reads as closed), then the
 * shelf with its expiry, then the acknowledgement.
 */
export function stateView(e: CpmEventFrame, now: number): StateView {
  const acked = isAcknowledged(e);
  if (conditionOf(e) === 'CLOSED') {
    return acked ? { label: 'Closed', tone: 'muted' } : { label: 'Closed · unacked', tone: 'warn' };
  }
  const shelf = shelfState(e, now);
  if (shelf === 'ACTIVE') return { label: `Shelved · ${shelfCountdown(e.shelve_until, now)}`, tone: 'muted' };
  if (shelf === 'EXPIRED') return acked ? { label: 'Shelf expired', tone: 'muted' } : { label: 'Shelf expired · unreviewed', tone: 'warn' };
  if (acked) return { label: 'Acknowledged', tone: 'good' };
  return { label: 'Unacknowledged', tone: 'warn' };
}

export type EventFilterKey = 'all' | 'open' | 'unobservable' | 'unacknowledged' | 'acknowledged' | 'shelved' | 'shelfExpired' | 'closed';

export const EVENT_FILTERS: { key: EventFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'unobservable', label: 'Open · unobservable' },
  { key: 'unacknowledged', label: 'Unacknowledged' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'shelved', label: 'Shelved' },
  { key: 'shelfExpired', label: 'Shelf expired' },
  { key: 'closed', label: 'Closed' },
];

export const isEventFilterKey = (v: string | null): v is EventFilterKey =>
  EVENT_FILTERS.some(f => f.key === v);

/**
 * Unacknowledged = open, not reviewed and not suppressed: an active shelf hides the
 * episode from that queue; an expired shelf puts it straight back (nobody reviewed it).
 */
export function matchesEventFilter(e: CpmEventFrame, f: EventFilterKey, now: number): boolean {
  const shelf = shelfState(e, now);
  switch (f) {
    case 'open': return conditionOf(e) === 'OPEN';
    case 'unobservable': return conditionOf(e) === 'OPEN' && e.availability_state === 'UNOBSERVABLE';
    case 'unacknowledged': return conditionOf(e) === 'OPEN' && !isAcknowledged(e) && shelf !== 'ACTIVE';
    case 'acknowledged': return isAcknowledged(e);
    case 'shelved': return shelf === 'ACTIVE';
    case 'shelfExpired': return shelf === 'EXPIRED';
    case 'closed': return conditionOf(e) === 'CLOSED';
    default: return true;
  }
}

/** History rows read as sentences: what happened, by whom, and the expiry when there is one. */
export const ACTION_VIEW: Record<CpmEventAction['action'], { label: string; tone: CpmTone }> = {
  ACKNOWLEDGED: { label: 'Acknowledged', tone: 'good' },
  SHELVED: { label: 'Shelved', tone: 'muted' },
  SHELVE_UPDATED: { label: 'Shelf updated', tone: 'muted' },
  UNSHELVED: { label: 'Unshelved', tone: 'good' },
  SHELVE_EXPIRED: { label: 'Shelf expired', tone: 'warn' },
};
