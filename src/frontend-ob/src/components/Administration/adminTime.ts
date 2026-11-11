/**
 * CHG-172 (owner review): dates on Administration read "10 Oct 2026" (a day) or "25 Sep 19:45" (a time) in the site zone, the
 * zone named once where the time is shown. They read "10/10/2026" and "25/09/2026, 19:45:25" in the browser's own format.
 */
import { siteZone } from '../../cpa/siteTime';

export { stamp, zoneTag } from '../Cpm/events/eventTime';

/** "10 Oct 2026" in the site zone; a missing or broken date reads "—". */
export function dayStamp(ts: string | number | null | undefined): string {
  if (ts == null || ts === '') return '—';
  const when = new Date(ts);
  if (Number.isNaN(when.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: siteZone() }).format(when);
}
