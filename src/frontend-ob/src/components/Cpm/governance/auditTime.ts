/**
 * CHG-174 (owner review, Governance): a time in a list reads "4 Nov 13:04" in the site zone, the zone once in the column heading
 * ("When · UTC"); the selected event's panel adds the seconds and the year ("4 Nov 2026 13:04:11"), since a draft's create,
 * edit, validate and approve share one minute. They read "04/11/2026, 13:04:11 UTC" in the browser's own format on every row.
 */
import { siteZone, zoneInputToIso } from '../../../cpa/siteTime';

export { stamp, zoneTag } from '../events/eventTime';

/** "4 Nov 2026 13:04:11" in the site zone. A missing or broken time reads "—". */
export function stampSeconds(ts: string | number | null | undefined): string {
  if (ts == null || ts === '') return '—';
  const when = new Date(ts);
  if (Number.isNaN(when.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: siteZone(),
  }).formatToParts(when);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${part('day')} ${part('month')} ${part('year')} ${part('hour')}:${part('minute')}:${part('second')}`;
}

/** The time range on the trail (answer 2): a span back from now, or two days in the site zone. */
export type RangeKey = 'all' | '24h' | '7d' | '30d' | 'custom';

export const RANGES: ReadonlyArray<{ key: RangeKey; label: string; ms?: number }> = [
  { key: 'all', label: 'All time' },
  { key: '24h', label: 'Last 24 hours', ms: 24 * 3600_000 },
  { key: '7d', label: 'Last 7 days', ms: 7 * 24 * 3600_000 },
  { key: '30d', label: 'Last 30 days', ms: 30 * 24 * 3600_000 },
  { key: 'custom', label: 'Custom range' },
];

/** The first instant of a day ("2026-11-04") in the site zone, as ISO; null for an empty or broken day. */
export function dayStartIso(day: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? zoneInputToIso(`${day}T00:00`, siteZone()) : null;
}

/** The last instant of a day in the site zone, as ISO (the service's `to` includes it). */
export function dayEndIso(day: string): string | null {
  const start = dayStartIso(day);
  if (!start) return null;
  const next = zoneInputToIso(`${new Date(Date.parse(`${day}T12:00:00Z`) + 24 * 3600_000).toISOString().slice(0, 10)}T00:00`, siteZone());
  return next ? new Date(Date.parse(next) - 1).toISOString() : null;
}

/** `from` / `to` for the service: a span back from `now`, or the chosen days; empty for All time. */
export function rangeQuery(key: RangeKey, now: number, fromDay: string, toDay: string): { from?: string; to?: string } {
  const span = RANGES.find(r => r.key === key)?.ms;
  if (span) return { from: new Date(now - span).toISOString() };
  if (key !== 'custom') return {};
  const from = dayStartIso(fromDay) ?? undefined;
  const to = dayEndIso(toDay) ?? undefined;
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}
