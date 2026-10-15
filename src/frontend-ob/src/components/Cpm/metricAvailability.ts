/**
 * SME review #17 (CHG-053): is this number a measurement? The engine stores a 0 where a method did not
 * qualify (the oscillation period is 0 on every fused row whose period was rejected, triangularity 0 when the
 * shape gate never ran) and keeps computing metrics on excluded-mode windows (loop not in automatic: "good-
 * error time 100 %"). Shown as numbers, those read as results. OPC UA's rule applies: a value without good
 * status is shown by its status, not as a value.
 *
 * The decision uses only what the row already carries: the window's diagnosis, its gate statuses, its flags
 * and disqualifiers — plus the `period_status` / `*_qualified` fields when a raw KPI row has them.
 */
import { gateMeaning, isNoResult } from './gateStatus';
import { METRICS } from './calcCatalogue';
import { disqualifierLabel, lowerFirst, phrase } from './vocabulary';
import type { CpmGateMatrix } from '../../api/cpm/gates';
import type { CpmKpiRow } from '../../api/cpm/kpis';

export type MetricState = 'measured' | 'not-applicable' | 'insufficient' | 'not-calculated';

export interface MetricAvailability {
  state: MetricState;
  /** What the cell shows instead of a number ("Not calculated"); empty when measured. */
  short: string;
  /** Why, in words ("no clean oscillation cycle"); null when measured. */
  reason: string | null;
}

/** What a row tells about its own metrics, whatever its shape (fused matrix or raw KPI row). */
export interface MetricContext {
  diagnosis: string | null;
  status: (gate: string) => string | null;
  flags: string[];
  disqualifiers: string[];
  /** A window-level decline the row states itself (short: sufficient_data=false; long: long_metrics_qualified=false). */
  declined: string | null;
  /** A raw string / boolean field when the row carries one (period_status, effort_qualified, …). */
  field: (name: string) => string | boolean | null;
}

/** The gate whose method produces each metric (the calculation catalogue, plus the fused-only fields). */
const GATE_OF: Record<string, string> = {
  ...Object.fromEntries(METRICS.filter(m => m.gate.startsWith('G')).map(m => [m.field, m.gate])),
  stiction_score: 'G7', freeze_index_s: 'G11', freeze_fraction: 'G11', validated_period_s: 'G5',
  phase_area_norm_per_cycle: 'G9', fft_peak_period_s: 'G6',
};
/** A period of 0 s is never a measurement: no period was found (regularity 0 is a real "not regular"). */
const PERIOD_FIELDS = new Set(['acf_period_s', 'validated_period_s', 'fft_peak_period_s']);
const QUALIFIED_FLAG: Record<string, string> = {
  effort_ratio: 'effort_qualified', stiction_score: 'stiction_qualified', corner_score: 'geometry_qualified',
  acf_period_s: 'oscillation_qualified', acf_regularity: 'oscillation_qualified',
};

/** A window carries a verdict (and so a confidence) only when it was judged — not excluded, not short of data. */
export function hasVerdict(diagnosis: string | null | undefined): boolean {
  const d = (diagnosis ?? '').toUpperCase();
  return !!d && !d.startsWith('EXCLUDED') && !d.startsWith('INSUFFICIENT') && d !== 'NOT_EVALUATED' && d !== 'NO_CALL';
}

const MEASURED: MetricAvailability = { state: 'measured', short: '', reason: null };

export function metricAvailability(ctx: MetricContext, field: string, value: unknown): MetricAvailability {
  const d = (ctx.diagnosis ?? '').toUpperCase();
  if (d.startsWith('EXCLUDED'))
    return { state: 'not-applicable', short: 'N/A', reason: 'loop not in automatic — the window was excluded' };
  if (d.startsWith('INSUFFICIENT') || ctx.declined)
    return { state: 'insufficient', short: 'Insufficient data', reason: ctx.declined ?? 'too few qualified samples in the window' };
  const gate = GATE_OF[field];
  const g0 = gateMeaning(ctx.status('G0'), 'G0');
  // CHG-098 (SME 2 #24): an EXCLUDED G0 has its own mark now, but the window is still not usable for a metric
  if (gate !== 'G0' && (g0 === 'unusable' || g0 === 'excluded'))
    return { state: 'insufficient', short: 'Insufficient data', reason: 'the window failed data qualification' };
  if (typeof value !== 'number' || !Number.isFinite(value))
    return { state: 'not-calculated', short: 'Not calculated', reason: 'not in this result' };

  if (field === 'stiction_score') {
    const dq = ctx.disqualifiers.find(x => x.toLowerCase().startsWith('stiction:'));
    if (dq) return { state: 'not-calculated', short: 'Not scored', reason: lowerFirst(disqualifierLabel(dq)) };
  }
  if (PERIOD_FIELDS.has(field)) {
    const ps = ctx.field('period_status');
    const noCycle = ctx.flags.includes('NO_VALID_CYCLE') || (typeof ps === 'string' && ps !== 'VALID');
    if (value <= 0)
      return { state: 'not-calculated', short: 'Not calculated', reason: noCycle ? 'no clean oscillation cycle' : 'no oscillation period found' };
  }
  const q = QUALIFIED_FLAG[field] ? ctx.field(QUALIFIED_FLAG[field]) : null;
  if (q === false || q === 'false')
    return value === 0
      ? { state: 'not-calculated', short: 'Not calculated', reason: 'the method did not qualify on this window' }
      : { state: 'not-calculated', short: 'Not qualified', reason: 'computed, but the engine did not qualify it on this window' };
  if (gate) {
    const st = ctx.status(gate);
    if (st != null && isNoResult(gateMeaning(st, gate)))
      return value === 0
        ? { state: 'not-calculated', short: 'Not calculated', reason: `${gate} ${phrase(st)}` }
        : { state: 'not-calculated', short: 'Not qualified', reason: `${gate} ${phrase(st)} — the value is not a result` };
  }
  return MEASURED;
}

export function contextOfMatrix(m: Pick<CpmGateMatrix, 'diagnosis' | 'gates' | 'observabilityFlags' | 'familyDisqualifiers'>): MetricContext {
  return {
    diagnosis: m.diagnosis,
    status: g => m.gates.find(c => c.key.toLowerCase() === g.toLowerCase())?.status ?? null,
    flags: m.observabilityFlags ?? [],
    disqualifiers: m.familyDisqualifiers ?? [],
    declined: null,
    field: () => null,
  };
}

const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? v.split(/[;,]/).map(s => s.trim()).filter(Boolean) : [];

export function contextOfRow(row: CpmKpiRow, tier: 'short' | 'long'): MetricContext {
  const str = (k: string) => (typeof row[k] === 'string' ? (row[k] as string) : null);
  return {
    diagnosis: str('diagnosis'),
    status: g => str(`gate${g.slice(1).toLowerCase()}_status`),
    flags: list(row.observability_flags),
    disqualifiers: list(row.family_disqualifiers),
    declined: tier === 'short'
      ? (row.sufficient_data === false ? 'the engine declined the window (too few samples or G0 failed)' : null)
      : (row.long_metrics_qualified === false ? 'computed on a window that failed data qualification' : null),
    field: k => (typeof row[k] === 'string' || typeof row[k] === 'boolean' ? (row[k] as string | boolean) : null),
  };
}
