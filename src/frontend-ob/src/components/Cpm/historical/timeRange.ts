/**
 * Range presets for the Historical explorer.
 *
 * Why they exist: the page's primary task is "look at a period", and the only
 * way to pick one was to fill two `datetime-local` fields and press Apply —
 * every visit, including "the last day". Presets make the common case one click
 * and keep the two fields for the case that actually needs them.
 *
 * The URL still carries ABSOLUTE from/to. A preset resolves to an absolute pair
 * at the moment it is clicked, so a shared link means the same window tomorrow
 * as it does today; `Now` re-snaps a stale one.
 */

export interface RangePreset { key: string; label: string; ms: number }

export const RANGE_PRESETS: RangePreset[] = [
  { key: '24h', label: '24h', ms: 24 * 3_600_000 },
  { key: '7d', label: '7d', ms: 7 * 86_400_000 },
  { key: '30d', label: '30d', ms: 30 * 86_400_000 },
  { key: '90d', label: '90d', ms: 90 * 86_400_000 },
];

/** A range counts as "live" while its end is within this of now. */
const LIVE_TOLERANCE_MS = 5 * 60_000;
/** Span match tolerance, so a preset survives second-level drift. */
const SPAN_TOLERANCE_MS = 60_000;

/**
 * Which preset (if any) the applied range corresponds to. A range that is the
 * right LENGTH but ends three days ago is not "24h" — it is a custom window, and
 * highlighting the 24h chip for it would misdescribe what is plotted.
 */
export function activePreset(from: Date, to: Date, nowMs = Date.now()): string {
  if (Math.abs(nowMs - to.getTime()) > LIVE_TOLERANCE_MS) return 'custom';
  const span = to.getTime() - from.getTime();
  const hit = RANGE_PRESETS.find(p => Math.abs(p.ms - span) <= SPAN_TOLERANCE_MS);
  return hit?.key ?? 'custom';
}

export const spanOf = (from: Date, to: Date) => to.getTime() - from.getTime();

/** Preset → an absolute pair ending now. */
export function presetRange(ms: number, nowMs = Date.now()): { from: Date; to: Date } {
  return { from: new Date(nowMs - ms), to: new Date(nowMs) };
}

/** Step the whole window one span earlier (-1) or later (+1). */
export function stepRange(from: Date, to: Date, direction: -1 | 1): { from: Date; to: Date } {
  const span = spanOf(from, to);
  return {
    from: new Date(from.getTime() + direction * span),
    to: new Date(to.getTime() + direction * span),
  };
}

/** `datetime-local` wants local wall time with no zone suffix. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Compact range label for the toolbar: "22 Aug 11:34 → 25 Aug 11:34". */
export function fmtRange(from: Date, to: Date): string {
  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  };
  return `${from.toLocaleString(undefined, opts)} → ${to.toLocaleString(undefined, opts)}`;
}
