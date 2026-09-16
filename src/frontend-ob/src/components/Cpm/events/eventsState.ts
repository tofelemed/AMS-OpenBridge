/**
 * v2.5 Task 1F.2 (spec v6 R10; NR-030) — how an event frame's two states read on screen.
 *
 * CONDITION says whether the episode is still standing (OPEN / CLOSED). AVAILABILITY says
 * whether the newest result could judge the loop at all (OBSERVED / UNOBSERVABLE). They are
 * independent: a loop whose data went bad has an OPEN condition that is UNOBSERVABLE — it has
 * not recovered, we just cannot see it. Rows written before v2.5 carry neither column and are
 * shown as LEGACY availability rather than assumed observed.
 */
import type { CpmEventFrame } from '../../../api/cpmApi';
import type { CpmTone } from '../shared';

export type ConditionState = 'OPEN' | 'CLOSED';
export type AvailabilityState = 'OBSERVED' | 'UNOBSERVABLE' | 'LEGACY';

export function conditionOf(e: Pick<CpmEventFrame, 'closed_at' | 'condition_state'>): ConditionState {
  if (e.condition_state === 'CLOSED' || e.closed_at !== null) return 'CLOSED';
  return 'OPEN';
}

export function availabilityOf(e: Pick<CpmEventFrame, 'availability_state'>): AvailabilityState {
  if (e.availability_state === 'UNOBSERVABLE') return 'UNOBSERVABLE';
  if (e.availability_state === 'OBSERVED') return 'OBSERVED';
  return 'LEGACY';
}

/** Pill for the availability state; OBSERVED on an open frame needs no pill of its own. */
export function availabilityPill(e: Pick<CpmEventFrame, 'availability_state' | 'closed_at' | 'condition_state'>): { label: string; tone: CpmTone } | null {
  const a = availabilityOf(e);
  if (a === 'UNOBSERVABLE') return { label: 'Unobservable', tone: 'warn' };
  if (a === 'LEGACY') return { label: 'Availability unknown', tone: 'muted' };
  return null;
}

/** One line for the detail aside: what the two states mean together. */
export function availabilityCopy(e: CpmEventFrame): string {
  const a = availabilityOf(e);
  const c = conditionOf(e);
  if (a === 'LEGACY') return 'Recorded before v2.5: availability was not tracked separately from the condition.';
  if (c === 'CLOSED') {
    return e.close_reason === 'RECOVERED'
      ? 'Closed by an evaluable, fault-free result with enough qualified support.'
      : e.close_reason === 'FAMILY_CHANGED'
        ? 'Closed because a different fault family took over the loop.'
        : 'Closed.';
  }
  return a === 'UNOBSERVABLE'
    ? 'Still open: the newest window could not be judged (excluded or insufficient data), so the condition has NOT recovered.'
    : 'Open and observed: the newest window still carries the finding.';
}

export function supportCopy(e: Pick<CpmEventFrame, 'qualified_support_ms' | 'window_count'>): string {
  const ms = e.qualified_support_ms ?? 0;
  if (ms <= 0) return `${e.window_count} evaluation window(s)`;
  const h = ms / 3_600_000;
  return `${e.window_count} non-overlapping window(s) · ${h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`} of qualified support`;
}

export type EventFilterKey = 'all' | 'open' | 'unobservable' | 'unacknowledged' | 'acknowledged' | 'closed';

export const EVENT_FILTERS: { key: EventFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'unobservable', label: 'Open · unobservable' },
  { key: 'unacknowledged', label: 'Unacknowledged' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'closed', label: 'Closed' },
];

export const isEventFilterKey = (v: string | null): v is EventFilterKey =>
  EVENT_FILTERS.some(f => f.key === v);

export function matchesEventFilter(e: CpmEventFrame, f: EventFilterKey): boolean {
  switch (f) {
    case 'open': return conditionOf(e) === 'OPEN';
    case 'unobservable': return conditionOf(e) === 'OPEN' && availabilityOf(e) === 'UNOBSERVABLE';
    case 'unacknowledged': return e.ack_state === 'UNACKNOWLEDGED' && conditionOf(e) === 'OPEN';
    case 'acknowledged': return e.ack_state === 'ACKNOWLEDGED';
    case 'closed': return conditionOf(e) === 'CLOSED';
    default: return true;
  }
}
