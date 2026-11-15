/**
 * CHG-200 (final test #16, C3, C8): a value axis range with a fixed step, rounded out to whole steps of 1, 2, 3 or 5 × 10ⁿ (the
 * step ECharts itself picks). A caller that fixes its axis this way knows exactly where every value is drawn (the System Response
 * trends place their labels against it), a short chart asks for fewer steps so its numbers never touch, and values with little
 * spread (one model) keep a readable step instead of six decimals.
 */
export interface NiceRange { min: number; max: number; interval: number }

const niceStep = (raw: number): number => {
  const e = Math.floor(Math.log10(raw));
  const f = raw / 10 ** e;
  return (f < 1.5 ? 1 : f < 2.5 ? 2 : f < 4 ? 3 : f < 7 ? 5 : 10) * 10 ** e;
};

/** The 1-2-3-5 step after this one (2 after 1, 3 after 2, 5 after 3, 10 after 5). */
const nextStep = (step: number): number => {
  const e = Math.floor(Math.log10(step) + 1e-9);
  const n = Math.round(step / 10 ** e);
  return (n < 2 ? 2 : n < 3 ? 3 : n < 5 ? 5 : 10) * 10 ** e;
};

/**
 * The range from `lo` to `hi` in about `splits` steps, rounded out to whole steps; a single value opens 5 % either side. With
 * `maxSteps`, a larger step is taken until the rounded range holds no more steps than that (a short chart's room).
 */
export function niceRange(lo: number, hi: number, splits = 5, maxSteps?: number): NiceRange {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 1, interval: 0.2 };
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi - lo <= 1e-12 * Math.max(1, Math.abs(hi))) {
    const pad = Math.abs(hi) * 0.05 || 1;
    lo -= pad; hi += pad;
  }
  let interval = niceStep((hi - lo) / Math.max(1, splits));
  const rounded = (step: number) => [Math.floor(lo / step + 1e-9) * step, Math.ceil(hi / step - 1e-9) * step];
  while (maxSteps != null && maxSteps >= 1) {
    const [a, b] = rounded(interval);
    if (Math.round((b - a) / interval) <= maxSteps) break;
    interval = nextStep(interval);
  }
  const digits = Math.min(20, Math.max(0, 1 - Math.floor(Math.log10(interval))));
  const round = (v: number) => Number(v.toFixed(digits)) + 0;   // + 0 turns -0 into 0
  const [min, max] = rounded(interval);
  return { min: round(min), max: round(max), interval: round(interval) };
}

/** As niceRange, but at least a tenth of the values' size wide, so values with little spread (one model) keep few decimals. */
export function paddedRange(lo: number, hi: number, splits = 5): NiceRange {
  const span = Math.abs(hi - lo);
  const wanted = Math.max(span, Math.abs((lo + hi) / 2) * 0.1);
  const pad = (wanted - span) / 2;
  return niceRange(Math.min(lo, hi) - pad, Math.max(lo, hi) + pad, splits);
}
