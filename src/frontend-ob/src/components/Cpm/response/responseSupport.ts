/**
 * v2.5 Task 2E.5: pure re-shaping of what the G12 kernel reported - quantities as text with their
 * unit and uncertainty (or their null reason), the kernel's epoch-second time base as chart time,
 * ";"-joined provenance lists, the candidate-model rows. Nothing here derives a number.
 */
import type { ResponseQuantity, SystemModel } from '../../../api/cpm/response';
import type { DecodedArtifact } from '../evidence/artifactCodec';

/** A null quantity is stated with its reason ("not applicable (integrating)"), never shown as 0. */
export function quantityText(q: ResponseQuantity | undefined): string {
  if (!q) return 'not reported';
  if (q.value == null) return `not applicable (${(q.reasonIfNull || 'NO_REASON').toLowerCase().replace(/_/g, ' ')})`;
  const v = fmt(q.value);
  const unc = q.uncertainty != null ? ` ± ${fmt(q.uncertainty)}` : '';
  return `${v}${q.unit ? ` ${q.unit}` : ''}${unc}`;
}

export function fmt(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a < 0.01 || a >= 1e6)) return v.toExponential(3);
  return v.toFixed(2);
}

export const metricOf = (metrics: ResponseQuantity[] | undefined, id: string) => metrics?.find(m => m.quantityId === id);

/** The kernel's x is epoch seconds; the chart's time axis is epoch milliseconds (a unit change, not a derivation). */
export function epochMs(d: DecodedArtifact): Float64Array {
  const out = new Float64Array(d.n);
  for (let i = 0; i < d.n; i++) out[i] = d.columns.x[i] * 1000;
  return out;
}

/** Seconds after t0 placed on the event's time axis. */
export function afterT0Ms(d: DecodedArtifact, t0Ms: number): Float64Array {
  const out = new Float64Array(d.n);
  for (let i = 0; i < d.n; i++) out[i] = t0Ms + d.columns.x[i] * 1000;
  return out;
}

export const prov = (d: DecodedArtifact | undefined, key: string): string | undefined => d?.meta.provenance?.[key];
export const provList = (d: DecodedArtifact | undefined, key: string): string[] => (prov(d, key) ?? '').split(';').map(s => s.trim()).filter(Boolean);

export interface CandidateRow {
  family: string; path: string; parameters: Array<[string, string]>; boundsHit: boolean; flatDelay: boolean; signUncertain: boolean; cond: string; raw: string;
}

const ROW = /^(\w+)\((\w+): (.*)\) bounds_hit=(\w+) flat_delay=(\w+) sign_uncertain=(\w+) cond=(\S+)$/;

/** The candidate-model rows as the writer joined them: "FAMILY(path: k=v, ...) bounds_hit=.. flat_delay=.. sign_uncertain=.. cond=..;...". */
export function candidateRows(joined: string | undefined): CandidateRow[] {
  return (joined ?? '').split(';').map(s => s.trim()).filter(Boolean).map(raw => {
    const m = ROW.exec(raw);
    if (!m) return { family: raw, path: '', parameters: [], boundsHit: false, flatDelay: false, signUncertain: false, cond: '', raw };
    const parameters = m[3].split(',').map(kv => kv.trim().split('=') as [string, string]).filter(([, v]) => v !== undefined && v !== 'NaN');
    return { family: m[1], path: m[2], parameters, boundsHit: m[4] === 'true', flatDelay: m[5] === 'true', signUncertain: m[6] === 'true', cond: m[7], raw };
  });
}

export const BAND_MEANINGS: Record<string, string> = {
  PREDICTION_INTERVAL_OF_OUTPUT_NOT_PARAMETER_CONFIDENCE: 'prediction interval of the output, not parameter confidence',
  CONFIDENCE_INTERVAL_OF_FIT: 'confidence interval of the fitted output',
};
export const bandMeaningText = (code: string | undefined) => (code ? BAND_MEANINGS[code] ?? code.toLowerCase().replace(/_/g, ' ') : 'band (meaning not declared)');

export const MODEL_PARAMS = ['process_gain', 'integrating_gain', 'dead_time', 'time_constant', 'time_constant_1', 'time_constant_2', 'damping_ratio', 'natural_frequency'] as const;

export interface ParamPoint { tMs: number; value: number; lower: number | null; upper: number | null; modelId: string; state: string; unit: string }

/** One point per model that reports the parameter; the interval is value ± uncertainty as the kernel gave it. */
export function paramPoints(models: SystemModel[], param: string): ParamPoint[] {
  const out: ParamPoint[] = [];
  for (const m of models) {
    const p = m.parameters?.[param];
    if (!p || p.value == null) continue;
    out.push({ tMs: Date.parse(m.createdAt), value: p.value, lower: p.uncertainty != null ? p.value - p.uncertainty : null, upper: p.uncertainty != null ? p.value + p.uncertainty : null, modelId: m.modelId, state: m.modelState, unit: p.unit });
  }
  return out.sort((a, b) => a.tMs - b.tMs);
}

export const stateTone = (s: string | null | undefined): 'good' | 'warn' | 'bad' | 'muted' => {
  switch ((s ?? '').toUpperCase()) {
    case 'COMPLETE': case 'VALIDATED': case 'ACTIVE_BASELINE': case 'ELIGIBLE': return 'good';
    case 'CENSORED': case 'CANDIDATE': case 'LIMITED': case 'WAITING': return 'warn';
    case 'REJECTED': case 'INELIGIBLE': case 'FAILED': return 'bad';
    default: return 'muted';
  }
};
