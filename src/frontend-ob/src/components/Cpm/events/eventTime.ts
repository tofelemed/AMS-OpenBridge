/**
 * CHG-167 (owner review, Loop Events): a time on this page reads "5 Oct 07:45" in the site zone; the zone is said once, in the
 * column heading ("Opened · UTC") or beside the time where nothing else names it.
 */
import { siteZone, zoneAbbr } from '../../../cpa/siteTime';

/** "5 Oct 07:45" in the site zone. A missing or broken time reads "—". */
export function stamp(ts: string | number | null | undefined): string {
  if (ts == null || ts === '') return '—';
  const when = new Date(ts);
  if (Number.isNaN(when.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: siteZone(),
  }).formatToParts(when);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${part('day')} ${part('month')} ${part('hour')}:${part('minute')}`;
}

/** The site zone's short name ("UTC", "GST"), for a heading or beside a time. */
export const zoneTag = (ms: number = Date.now()): string => zoneAbbr(siteZone(), ms);
