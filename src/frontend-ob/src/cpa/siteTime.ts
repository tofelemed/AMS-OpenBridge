/**
 * Times in the site zone, with the abbreviation always shown (DEC-002 RD5). The browser zone is
 * never used. The zone arithmetic lives in the evidence module and is reused here.
 */
import { formatInZone, isValidZone } from '../components/Cpm/evidence/timezone';

const zoneOr = (tz: string) => (isValidZone(tz) ? tz : 'UTC');

/** "GST", or "GMT+3:30" where the zone has no common short name. */
export function zoneAbbr(tz: string, ms = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zoneOr(tz), timeZoneName: 'short' }).formatToParts(ms);
  return parts.find(p => p.type === 'timeZoneName')?.value ?? 'UTC';
}

/** "4 Nov 2026, 13:15 GST". A missing value reads as a dash, never as a time. */
export function siteDateTime(value: string | number | null | undefined, tz: string): string {
  if (value == null || value === '') return '—';
  const ms = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return '—';
  const text = new Intl.DateTimeFormat('en-GB', {
    timeZone: zoneOr(tz), day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(ms);
  return `${text} ${zoneAbbr(tz, ms)}`;
}

/** Minutes the zone is ahead of UTC at that instant. */
function offsetMs(tz: string, ms: number): number {
  const s = formatInZone(ms, zoneOr(tz)); // YYYY-MM-DD HH:mm:ss
  const wall = Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16), +s.slice(17, 19));
  return wall - Math.floor(ms / 1000) * 1000;
}

/** ISO instant to the `YYYY-MM-DDTHH:mm` a datetime-local input shows, in the site zone. */
export function isoToZoneInput(iso: string | null | undefined, tz: string): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return '';
  return formatInZone(ms, zoneOr(tz)).slice(0, 16).replace(' ', 'T');
}

/** A datetime-local value read as site wall-clock time, to an ISO instant. Null when invalid. */
export function zoneInputToIso(value: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Twice, so an instant next to a daylight-saving change uses the offset that applies to it.
  const first = wall - offsetMs(tz, wall);
  return new Date(wall - offsetMs(tz, first)).toISOString();
}
