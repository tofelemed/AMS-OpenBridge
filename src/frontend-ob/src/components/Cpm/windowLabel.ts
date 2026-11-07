/**
 * SME review #18 (CHG-054): one way to name an evaluated window wherever a user picks one — its size and
 * its end, in the shared CPM time format ("24 h · ends 6 Oct 14:00 GST"), the full span on hover
 * ("24 h window · 5 Oct 14:00 → 6 Oct 14:00 GST"). Before, the Investigation buttons showed a 24 h window
 * by its date only, so five sliding windows read "Aug 10 · Excluded" alike.
 */
import type { CpmWindowSpec } from '../../api/cpmApi';
import { fmtInstant, fmtPeriod } from './context/LoopContextBar';
import { fmtDuration } from './shared';

export interface WindowLike {
  windowKind?: string | null;
  windowStart?: string | number | null;
  windowEnd?: string | number | null;
}

const UNIT: Record<string, string> = { s: 's', m: 'min', h: 'h', d: 'd' };

/** "24h" → "24 h", "15m" → "15 min"; without a kind, from the span. */
export function windowSize(w: WindowLike): string {
  const k = (w.windowKind ?? '').trim().match(/^(\d+)\s*([smhd])$/i);
  if (k) return `${k[1]} ${UNIT[k[2].toLowerCase()]}`;
  const s = typeof w.windowStart === 'number' ? w.windowStart : Date.parse(String(w.windowStart ?? ''));
  const e = typeof w.windowEnd === 'number' ? w.windowEnd : Date.parse(String(w.windowEnd ?? ''));
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return '';
  const min = Math.round((e - s) / 60_000);
  return min % 60 === 0 ? `${min / 60} h` : `${min} min`;
}

/** "ends 6 Oct 14:00 GST". */
export const windowEnds = (w: WindowLike, timeZone?: string): string => `ends ${fmtInstant(w.windowEnd ?? null, timeZone)}`;

/** "24 h · ends 6 Oct 14:00 GST" — the name of a window in a list or a picker. */
export function windowLabel(w: WindowLike, timeZone?: string): string {
  const size = windowSize(w);
  return `${size ? `${size} · ` : ''}${windowEnds(w, timeZone)}`;
}

/** "24 h window · 5 Oct 14:00 → 6 Oct 14:00 GST" — the hover / spoken form. */
export function windowSpan(w: WindowLike, timeZone?: string): string {
  const size = windowSize(w);
  return fmtPeriod({ label: `${size ? `${size} ` : ''}window`, start: w.windowStart ?? null, end: w.windowEnd ?? null }, timeZone);
}

/** "15 min · 5 min slide", "1 min · tumbling", "12 h · 15 min cadence": a profile by its size and how it moves. */
export function profileLabel(spec: CpmWindowSpec): string {
  const size = windowSize({ windowKind: spec.kind }) || spec.kind;
  const move = spec.assigner === 'sliding' && spec.slideMs != null ? `${fmtDuration(spec.slideMs)} slide`
    : spec.assigner === 'rolling-buffer' ? (spec.cadenceMs ? `${fmtDuration(spec.cadenceMs)} cadence` : 'slice')
      : spec.assigner === 'tumbling' ? 'tumbling' : '';
  return move ? `${size} · ${move}` : size;
}

const zoneOrUndefined = (tz: string | undefined): string | undefined => {
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return tz; } catch { return undefined; }
};

const partsOf = (v: string | number | null | undefined, tz: string | undefined, o: Intl.DateTimeFormatOptions) => {
  const ms = typeof v === 'number' ? v : Date.parse(String(v ?? ''));
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('en-GB', { ...o, timeZone: zoneOrUndefined(tz) }).formatToParts(ms);
};

/** "13:35": the time of day in the zone. The date is said once, in the list's section head. */
export function clockOf(v: string | number | null | undefined, tz?: string): string {
  const parts = partsOf(v, tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  if (!parts) return '—';
  const p = (t: Intl.DateTimeFormatPartTypes) => parts.find(x => x.type === t)?.value ?? '';
  return `${p('hour')}:${p('minute')}`;
}

/** "4 Nov": the date in the zone. */
export function dayOf(v: string | number | null | undefined, tz?: string): string {
  const parts = partsOf(v, tz, { day: 'numeric', month: 'short' });
  if (!parts) return '—';
  const p = (t: Intl.DateTimeFormatPartTypes) => parts.find(x => x.type === t)?.value ?? '';
  return `${p('day')} ${p('month')}`;
}

/** "13:35 → 13:50" within one day; "3 Nov 23:50 → 00:05" when the window starts the day before its end (the list's section head is the end date). */
export function rangeOf(start: string | number | null | undefined, end: string | number | null | undefined, tz?: string): string {
  const from = dayOf(start, tz) !== dayOf(end, tz) && start != null ? `${dayOf(start, tz)} ` : '';
  return `${from}${clockOf(start, tz)} → ${clockOf(end, tz)}`;
}
