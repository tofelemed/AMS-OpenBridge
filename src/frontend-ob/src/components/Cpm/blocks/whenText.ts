import { siteZone } from '../../../cpa/siteTime';

/** A time, once and short: "5 Nov · 13:45" in the site zone. A missing or broken time reads "—". */
export function fmtWhen(ts: string | number | null | undefined): string {
  if (ts == null || ts === '') return '—';
  const when = new Date(ts);
  if (Number.isNaN(when.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: siteZone(),
  }).formatToParts(when);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${part('day')} ${part('month')} · ${part('hour')}:${part('minute')}`;
}
