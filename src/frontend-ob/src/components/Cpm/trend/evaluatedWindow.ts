/**
 * SME review #12 (CHG-049): the engine's evaluated window against the plotted trend range.
 *
 * The Explorer trend is a historian range (live 8 h, or a pinned period); the diagnosis is about one
 * evaluated window. These helpers say whether the two overlap, whether the trend IS the evaluated
 * window, and give two trends one y-scale so "evaluated window vs now" compares like with like.
 */
import type { CpmTrendPoint } from '../../../api/cpm/kpis';

export interface EvaluatedWindow { startMs: number; endMs: number; label: string }

/** A window from the served gate row (ISO bounds); null unless both ends parse. */
export function evaluatedWindowOf(start: string | null | undefined, end: string | null | undefined, label: string): EvaluatedWindow | null {
  const s = start ? Date.parse(start) : NaN; const e = end ? Date.parse(end) : NaN;
  return Number.isFinite(s) && Number.isFinite(e) && e > s ? { startMs: s, endMs: e, label } : null;
}

/** True when any part of the window lies inside the plotted range. */
export const overlaps = (w: EvaluatedWindow, fromMs: number, toMs: number): boolean => w.startMs < toMs && w.endMs > fromMs;

/** True when the plotted range IS the window (within a minute — the URL rounds nothing, a hand edit might). */
export const isWindowRange = (w: EvaluatedWindow, fromMs: number, toMs: number): boolean =>
  Math.abs(w.startMs - fromMs) < 60_000 && Math.abs(w.endMs - toMs) < 60_000;

export interface AxisBounds { min: number; max: number }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function extent(sets: CpmTrendPoint[][], keys: string[]): AxisBounds | null {
  let min = Infinity; let max = -Infinity;
  for (const pts of sets) for (const p of pts) for (const k of keys) {
    const v = num(p[k]);
    if (v != null) { if (v < min) min = v; if (v > max) max = v; }
  }
  if (!Number.isFinite(min)) return null;
  const pad = (max - min) * 0.05 || Math.abs(max) * 0.05 || 1;
  // Snap outward to a clean step so the axis ends read "72" / "80", never "72.565761".
  const step = niceStep((max - min + 2 * pad) / 5);
  return { min: Math.floor((min - pad) / step) * step, max: Math.ceil((max + pad) / step) * step };
}

/** 1, 2 or 5 × 10^n — the step a person would choose for about five ticks. */
function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const f = raw / 10 ** exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * 10 ** exp;
}

/**
 * One y-scale for several trends (PV / SP on the left, OP / VP on the right), so two charts side by side
 * are comparable: each autoscaling alone would make a 2-unit swing and a 20-unit swing look the same.
 */
export function sharedBounds(sets: CpmTrendPoint[][]): { pv: AxisBounds | null; op: AxisBounds | null } {
  return {
    pv: extent(sets, ['pv_min', 'pv_max', 'pv_avg', 'pv', 'sp']),
    op: extent(sets, ['op_avg', 'op', 'vp_avg', 'vp']),
  };
}

/**
 * The diagnosis → its period (SME #12): pin the Explorer trend to the evaluated window, switch
 * "compare with now" on and show the Summary tab. Writes into `p` (a setSearchParams updater's copy).
 */
export function pinEvaluated(p: URLSearchParams, startIso: string, endIso: string): URLSearchParams {
  p.set('from', new Date(startIso).toISOString());
  p.set('to', new Date(endIso).toISOString());
  p.set('compare', '1');
  p.set('tab', 'Summary');
  return p;
}

/** Brings the loop trend into view after a diagnosis click far above it (header, summary card). */
export const revealTrend = () =>
  window.setTimeout(() => document.getElementById('cpm-loop-trend')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
