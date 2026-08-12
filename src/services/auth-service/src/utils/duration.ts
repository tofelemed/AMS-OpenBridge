/**
 * Parse a human duration string ("500ms", "45s", "30m", "12h", "7d") to
 * milliseconds. A bare number is treated as milliseconds. Returns the
 * fallback on anything unparseable — session policy must never come up
 * zero because of a typo in an env var.
 */
const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export function parseDuration(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?\s*$/i.exec(value);
  if (!m) return fallbackMs;
  const amount = parseFloat(m[1]);
  const unit = (m[2] || 'ms').toLowerCase();
  const ms = amount * UNIT_MS[unit];
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms) : fallbackMs;
}
