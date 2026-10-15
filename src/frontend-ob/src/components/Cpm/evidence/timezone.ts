/**
 * v2.5 Task 2E.1 (spec §3.1 axes: "UTC/site-time x"): every time on an evidence view is shown in
 * the SITE zone with the zone visible, DST-safe through Intl. The site zone comes from the loop
 * registry (`timezone`), UTC when it declares none or an invalid one - never the browser's zone.
 */

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = FORMATTERS.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    FORMATTERS.set(tz, f);
  }
  return f;
}

export function isValidZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return true; } catch { return false; }
}

/** `YYYY-MM-DD HH:mm:ss` in the zone. */
export function formatInZone(ms: number, tz: string): string {
  const parts = formatter(isValidZone(tz) ? tz : 'UTC').formatToParts(new Date(ms));
  const p = (t: Intl.DateTimeFormatPartTypes) => parts.find(x => x.type === t)?.value ?? '';
  return `${p('year')}-${p('month')}-${p('day')} ${p('hour')}:${p('minute')}:${p('second')}`;
}

/** `HH:mm:ss` in the zone (axis ticks). */
export function formatTimeInZone(ms: number, tz: string): string {
  return formatInZone(ms, tz).slice(11);
}

/**
 * CHG-097 (SME review 2 #15): an axis tick fitted to the span the chart covers — seconds for a short event, minutes for
 * a window, the DATE with the time once the span reaches a day (a model history across days repeated "12:00:00").
 */
export function axisTimeFormatter(spanMs: number, tz: string): (ms: number) => string {
  if (spanMs >= 20 * 3_600_000) return ms => { const s = formatInZone(ms, tz); return `${s.slice(5, 10)} ${s.slice(11, 16)}`; };
  if (spanMs >= 2 * 3_600_000) return ms => formatInZone(ms, tz).slice(11, 16);
  return ms => formatTimeInZone(ms, tz);
}

/** The zone's offset at that instant, e.g. "UTC+02:00". */
export function offsetAt(tz: string, ms: number): string {
  const zone = isValidZone(tz) ? tz : 'UTC';
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'longOffset' });
  const name = f.formatToParts(new Date(ms)).find(p => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /^(?:GMT|UTC)([+-]\d{2}:\d{2})?$/.exec(name);
  return m ? `UTC${m[1] ?? '+00:00'}` : name;
}

/** "Europe/Oslo (UTC+02:00)" - the label an axis or header shows next to any time. */
export function zoneLabel(tz: string, ms: number): string {
  const zone = isValidZone(tz) ? tz : 'UTC';
  return `${zone} (${offsetAt(zone, ms)})`;
}

/** The registry's site zone, or UTC when it declares none or an invalid one. */
export function siteZoneOf(loop: { timezone?: string | null } | null | undefined): string {
  return isValidZone(loop?.timezone) ? loop!.timezone! : 'UTC';
}
