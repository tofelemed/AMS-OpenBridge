/**
 * SME review #18 (CHG-054): one way to name an evaluated window wherever a user picks one — its size and
 * its end, in the loop context bar's format ("24 h · ends 6 Oct 14:00 GST"), the full span on hover
 * ("24 h window · 5 Oct 14:00 → 6 Oct 14:00 GST"). Before, the Investigation buttons showed a 24 h window
 * by its date only, so five sliding windows read "Aug 10 · Excluded" alike.
 */
import { fmtInstant, fmtPeriod } from './context/LoopContextBar';

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
