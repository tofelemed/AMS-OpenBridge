/**
 * Times in the site zone, with the abbreviation always shown (DEC-002 RD5). The browser zone is
 * never used. The zone arithmetic lives in the evidence module and is reused here.
 */
import { formatInZone, isValidZone } from '../components/Cpm/evidence/timezone';
import { activeZone } from './activeZone';

const zoneOr = (tz: string) => (isValidZone(tz) ? tz : 'UTC');

/**
 * cplm-api names a fixed offset "UTC+03:30" (PLANT_TIME_ZONE=local on a mounted /etc/localtime, or +03:30). Browsers
 * refuse that name and accept "+03:30": without this, such a plant would silently read as UTC.
 */
export const browserZoneName = (id: string | null | undefined): string | null | undefined =>
  id?.replace(/^UTC(?=[+-]\d{2}:\d{2}$)/, '');

/** The zone the header names. Before the shell has resolved one, the browser's. */
export const siteZone = (): string => activeZone() ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

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

/** An instant as a datetime-local value, in the zone the header names. */
export const toSiteInput = (ms: number): string => isoToZoneInput(new Date(ms).toISOString(), siteZone());

/** A datetime-local value, read in the zone the header names, as epoch ms. NaN when invalid. */
export function fromSiteInput(value: string): number {
  const iso = zoneInputToIso(value, siteZone());
  return iso ? Date.parse(iso) : NaN;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A time-axis label in the zone the header names: "5 Oct" at a day boundary, otherwise the clock time, with the date
 * too on a span of days, because ECharts places ticks by the browser's midnight, which need not be the site's.
 */
export function siteAxisTick(spanMs: number): (ms: number) => string {
  return zoneAxisTick(spanMs);
}

/** CHG-175: the same tick in a zone the caller names (the Designer's trend keeps its display zone); none, the site's. */
export function zoneAxisTick(spanMs: number, zone?: string): (ms: number) => string {
  const short = spanMs < 600_000;
  return ms => {
    const s = formatInZone(ms, zone ?? siteZone());
    const day = `${+s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1]}`;
    if (!short && s.slice(11, 16) === '00:00') return day;
    const clock = s.slice(11, short ? 19 : 16);
    return spanMs >= 2 * 86_400_000 ? `${day} ${clock}` : clock;
  };
}
