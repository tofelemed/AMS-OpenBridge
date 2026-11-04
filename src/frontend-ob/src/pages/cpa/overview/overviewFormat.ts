/**
 * Overview's words for numbers and times. Pure. Counts are the server's: this only arranges them, a
 * missing value stays missing, and a denominator of 0 never prints "0 % of 0" (RD11, D-39).
 */
import { ageText } from '../../../components/Cpm/verdictAge';
import { zoneAbbr } from '../../../cpa/siteTime';
import type { CpaRange, RangeKey } from '../../../cpa/useCpaContext';

const HOUR_MS = 3_600_000;
const RANGE_HOURS: Record<Exclude<RangeKey, 'custom'>, number> = { '8h': 8, '24h': 24, '7d': 168, '30d': 720 };

export const NO_LOOPS = 'No loops in scope';
export const NOTHING_TO_JUDGE = 'Nothing to judge';

/** A rounded share, or null when there is nothing to divide by. A real 0 of something stays 0. */
export const percentOf = (count: number, denominator: number): number | null =>
  (denominator > 0 ? Math.round((count / denominator) * 100) : null);

/** "67 % of 241 monitored", or the plain statement that there is nothing to judge. */
export function shareText(count: number, denominator: number, noun: string, empty = NOTHING_TO_JUDGE): string {
  const share = percentOf(count, denominator);
  return share == null ? empty : `${share} % of ${denominator} ${noun}`;
}

/** A 0..1 fraction as "42 %". Missing stays null, so the caller can say so. */
export const fractionText = (value: number | null | undefined): string | null =>
  (value == null || !Number.isFinite(value) ? null : `${Math.round(value * 100)} %`);

export const sentence = (text: string): string => (text ? text[0].toUpperCase() + text.slice(1) : text);

export const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

const toMs = (value: string | number | null | undefined): number | null => {
  if (value == null || value === '') return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

/** "4 Nov 13:15 GST". A missing value reads as a dash, never as a time. */
export function shortStamp(value: string | number | null | undefined, tz: string): string {
  const ms = toMs(value);
  if (ms == null) return '—';
  const text = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(ms);
  return `${text.replace(',', '')} ${zoneAbbr(tz, ms)}`;
}

/** "14:31 GST". */
export function clockStamp(value: string | number | null | undefined, tz: string): string {
  const ms = toMs(value);
  if (ms == null) return '—';
  const text = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
  return `${text} ${zoneAbbr(tz, ms)}`;
}

/** "3 h", "2 days": an age without the "ago". */
export const ageWords = (ms: number): string => ageText(ms).replace(/ ago$/, '');

export const kindWords = (kind: string): string => kind.replace(/^(\d+)h$/, '$1 h');

/** "12 h window ending 4 Nov 13:15 GST". */
export const windowPhrase = (kind: string, end: string | number | null | undefined, tz: string): string =>
  `${kindWords(kind)} window ending ${shortStamp(end, tz)}`;

export interface Bounds { from: number; to: number }

/** The evaluated window: half-open [end − size, end) (M-003). Null when the loop has no window. */
export function windowBounds(end: string | null | undefined, kind: string): Bounds | null {
  const to = toMs(end);
  const hours = Number(/^(\d+)h$/.exec(kind)?.[1]);
  return to == null || !hours ? null : { from: to - hours * HOUR_MS, to };
}

/** The header range as instants. Null for a custom range that does not parse. */
export function rangeBounds(range: CpaRange, now: number): Bounds | null {
  if (range.key === 'custom') {
    const from = toMs(range.from);
    const to = toMs(range.to);
    return from == null || to == null ? null : { from, to };
  }
  return { from: now - RANGE_HOURS[range.key] * HOUR_MS, to: now };
}
