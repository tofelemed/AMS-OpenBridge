/**
 * CHG-175: every time the trend engine prints is in ONE zone and one format. Ticks read "11:00" (seconds only under ten
 * minutes on screen) and "5 Nov" where a day starts, as the CPA pages' axes do (`zoneAxisTick`); the cursor reads
 * "6 Nov 20:32". The Trend page hands the engine the site zone; the Designer keeps its display zone, where "local" is
 * the browser's. Pure.
 */
import { formatInZone, isValidZone } from '../../Cpm/evidence/timezone';
import { zoneAxisTick } from '../../../cpa/siteTime';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Under this much time on screen, ticks and the cursor carry seconds (the rule of `zoneAxisTick`). */
const SECONDS_BELOW_MS = 600_000;

export const browserZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The display store's "local" (or nothing) is the browser zone; an unknown name reads as UTC, never as a guess. */
export function zoneOf(tz?: string | null): string {
  if (!tz || tz === 'local') return browserZone();
  return isValidZone(tz) ? tz : 'UTC';
}

/** "6 Nov" and "20:32" (or "20:32:41") in the zone. */
export function dayAndClock(ms: number, zone: string, seconds = false): { day: string; clock: string } {
  const s = formatInZone(ms, zone); // YYYY-MM-DD HH:mm:ss
  return { day: `${+s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1]}`, clock: s.slice(11, seconds ? 19 : 16) };
}

/** The axis tick for the span on screen, in the zone. */
export const axisTickIn = (spanMs: number, zone: string): ((ms: number) => string) => zoneAxisTick(spanMs, zone);

/** The time at the cursor: "6 Nov 20:32", with seconds when the axis shows them. */
export function cursorTime(ms: number, spanMs: number, zone: string): string {
  const { day, clock } = dayAndClock(ms, zone, spanMs < SECONDS_BELOW_MS);
  return `${day} ${clock}`;
}

/**
 * ECharts places time ticks on the browser's clock unless the option says `useUTC`. In the browser's own zone that is
 * right (round hours and midnights, as before). In any other zone the ticks go on UTC's round hours, which are the
 * site's round hours (and its midnights, where the site runs on UTC), never a third zone's.
 */
export const ticksInUtc = (zone: string): boolean => zone !== browserZone();
