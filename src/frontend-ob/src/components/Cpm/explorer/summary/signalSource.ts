/**
 * CHG-227 (owner, 24 Nov 2026: PV, SP and OP on Loop Explorer only changed on refresh): which plane a shown value comes
 * from. A live value wins while its feed is current (the live job repeats every signal every 300 s, so past two repeats,
 * STALE_LIVE_MS, the feed has stopped). A live value that stopped arriving gives way to a newer historian bucket, which the
 * page re-reads every minute. Before, any live value won however old, so a stalled live feed (or a browser that lost its
 * live connection) froze the values at the snapshot loaded when the page opened, until the page was reloaded.
 * The value is still from one plane only, with its note (CHG-078: live or old, never both).
 */
import { STALE_LIVE_MS } from '../../FacetPill';

export type ValueSource = 'live' | 'trend' | 'held';

/** One plane's value and the instant it was taken (a trend bucket's start, a sample's source time). */
export interface Plane<T> { value: T | null | undefined; ts?: number }

const has = <T,>(p: Plane<T>) => p.value != null;

/** The plane to show: live, the newest trend bucket, the last stored value, or null when none has a value. */
export function pickSource<T>(live: Plane<T>, trend: Plane<T>, held: Plane<T>, now = Date.now()): ValueSource | null {
  if (has(live)) {
    const current = live.ts != null && now - live.ts <= STALE_LIVE_MS;
    const newerTrend = has(trend) && trend.ts != null && (live.ts == null || trend.ts > live.ts);
    if (current || !newerTrend) return 'live';
  }
  if (has(trend)) return 'trend';
  if (has(held)) return 'held';
  return null;
}
