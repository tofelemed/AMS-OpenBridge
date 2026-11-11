/**
 * CHG-175: the Trend page's period. Its live ranges (in Historical's words: 24h and 7d, where the time bar said 1d and
 * 1w), the half-period step that never passes now, a fixed period read from the address, and the band's one line of
 * dates ("6 Nov 10:45 → 22:45"). Pure.
 */
import { dayAndClock } from './trendTime';

export interface TrendRange { key: string; ms: number }
export interface Period { start: number; end: number }

const MIN = 60_000;
const HOUR = 60 * MIN;

export const TREND_RANGES: TrendRange[] = [
  { key: '15m', ms: 15 * MIN },
  { key: '1h', ms: HOUR },
  { key: '8h', ms: 8 * HOUR },
  { key: '24h', ms: 24 * HOUR },
  { key: '7d', ms: 7 * 24 * HOUR },
];
export const DEFAULT_RANGE = TREND_RANGES[0];

/** Links written before CHG-175 (and the Designer's time bar) say 1d and 1w. */
const OLD_WORDS: Record<string, string> = { '1d': '24h', '1w': '7d' };

/** The range a `?range=` names; none or an unknown one is the default 15m. */
export function rangeOf(param: string | null | undefined): TrendRange {
  const key = param ? (OLD_WORDS[param] ?? param) : '';
  return TREND_RANGES.find(r => r.key === key) ?? DEFAULT_RANGE;
}

/** The range whose span a fixed period has (within a minute), or null: the band then reads Custom. */
export function rangeForSpan(spanMs: number): TrendRange | null {
  return TREND_RANGES.find(r => Math.abs(r.ms - spanMs) <= MIN) ?? null;
}

/** `?from=&to=` (ISO) as a period; null when either is missing or unreadable, or the period runs backwards. */
export function fixedPeriodOf(params: URLSearchParams): Period | null {
  const start = Date.parse(params.get('from') ?? '');
  const end = Date.parse(params.get('to') ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}

/** A period ending within a minute of now: › has nowhere to go. */
export const endsAtNow = (end: number, now: number): boolean => end >= now - MIN;

/** Half a period earlier (-1) or later (+1), as the time bar stepped; the end never passes now and the span stays. */
export function stepPeriod(p: Period, dir: -1 | 1, now: number): Period {
  const span = p.end - p.start;
  const end = Math.min(p.end + (dir * span) / 2, now);
  return { start: end - span, end };
}

/** "6 Nov 10:45 → 22:45", or "4 Nov 17:48 → 11 Nov 17:48" when the days differ, in the zone given. */
export function periodText(start: number, end: number, zone: string): string {
  const a = dayAndClock(start, zone);
  const b = dayAndClock(end, zone);
  return `${a.day} ${a.clock} → ${a.day === b.day ? '' : `${b.day} `}${b.clock}`;
}
