/**
 * Task 16: the inputs the Proof tab tabulates for a gate. Each stored calculation of the gate (the honest catalogue) with its
 * metric id, its value and its unit, read from the run's own payload, else from the fused row of its window. A value the
 * engine did not measure shows its state and reason (metricAvailability), never a 0; a calculation the run does not carry
 * is left out, as the Calculation proof dialog does.
 */
import type { MethodRun } from '../../../../api/cpm/evidence';
import type { CpmGateMatrix } from '../../../../api/cpm/gates';
import { METRICS } from '../../calcCatalogue';
import { metricAvailability, type MetricContext } from '../../metricAvailability';
import { fmtQuantity } from '../format';
import { gateStatusOf } from '../gateFacts';

export interface ProofRow { name: string; id?: string; value: string; unit: string }

/** The fused decision's score is the verdict card's own fact, so it is not an input row. */
const catalogueOf = (gate: string) => METRICS.filter(m => m.gate === gate && m.field !== 'confidence');

const contextOf = (run: MethodRun, row: CpmGateMatrix | undefined): MetricContext => ({
  diagnosis: row?.diagnosis ?? null,
  status: g => gateStatusOf(run, g) ?? row?.gates.find(c => c.key === g)?.status ?? null,
  flags: row?.observabilityFlags ?? [],
  disqualifiers: row?.familyDisqualifiers ?? [],
  declined: null,
  field: k => { const v = run.result?.[k]; return typeof v === 'string' || typeof v === 'boolean' ? v : null; },
});

export function proofRows(gate: string, run: MethodRun, row?: CpmGateMatrix): ProofRow[] {
  const context = contextOf(run, row);
  return catalogueOf(gate).flatMap((m): ProofRow[] => {
    const raw = run.result?.[m.field] ?? row?.metrics?.[m.field] ?? (m.field === 'sample_count' ? run.support.sampleCount ?? undefined : undefined);
    const a = metricAvailability(context, m.field, raw);
    if (a.state === 'not-calculated' && a.reason === 'not in this result') return [];
    if (a.state !== 'measured') return [{ name: m.name, id: m.id, value: a.reason ? `${a.short} (${a.reason})` : a.short, unit: '' }];
    const text = fmtQuantity(raw as number, m.unit);
    return [{ name: m.name, id: m.id, value: text.endsWith(` ${m.unit}`) ? text.slice(0, -m.unit.length - 1) : text, unit: m.unit }];
  });
}

/** The samples the window would hold at its sample period. The expected count is not served, so this is nominal. */
export function nominalSamples(run: MethodRun, periodS: number | null | undefined): number | null {
  if (!periodS || periodS <= 0) return null;
  const n = Math.round((run.support.toMs - run.support.fromMs) / 1000 / periodS);
  return n > 0 ? n : null;
}

/** The sample period the run or its fused row states, in seconds. */
export function samplePeriodOf(run: MethodRun, row: CpmGateMatrix | undefined): number | null {
  const v = run.result?.sample_period_sec ?? row?.metrics?.sample_period_sec;
  return typeof v === 'number' && v > 0 ? v : null;
}
