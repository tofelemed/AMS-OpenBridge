/**
 * Task 20: what the Calculations list and panel say about one metric, as plain functions. A gate's status is judged
 * unless the engine says it was not evaluated or is pending; INSUFFICIENT_EVIDENCE is a verdict (CHG-092), not "not
 * judged". The decision gate (G15) is judged by its window's diagnosis, through `conditionOf` / `isJudged`.
 */
import type { CpmGateCell } from '../../../api/cpm/gates';
import type { MetricDef } from '../calcCatalogue';
import type { Tone } from '../calcSort';
import { conditionOf, isJudged } from '../explorer/summary/summaryText';
import { evidenceScore } from '../evidenceScore';
import { fmtQuantity } from '../evidence/format';
import { gateMark } from '../gateStatus';

export interface MetricView {
  metric: MetricDef;
  value: number | null;
  /** Why there is no number to show: the engine's reason, never a bare dash. */
  na: { short: string; reason: string } | null;
  /** code: the status the mark is drawn from; NOT_EVALUATED when the gate was not judged. */
  status: { label: string; tone: Tone; code: string; /** the metric has no value: the gate result is not this metric's result */ partial: boolean };
}

/**
 * The most frequent reason among the rows with no value, whatever their short word, when at least two rows give it: it is
 * the window's, so the list says it once above the rows. A reason that belongs to one metric stays on its row.
 */
export function windowWideReason(rows: readonly Pick<MetricView, 'na'>[]): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) if (r.na?.reason) counts.set(r.na.reason, (counts.get(r.na.reason) ?? 0) + 1);
  let best: string | null = null;
  let most = 1;
  for (const [reason, n] of counts) if (n > most) { best = reason; most = n; }
  return best;
}

/** The gate has no result of its own for this window. */
const NOT_JUDGED = new Set(['NOT_EVALUATED', 'PENDING', 'NOT_APPLICABLE', 'DISABLED']);

export function isGateJudged(cell: Pick<CpmGateCell, 'key' | 'status'> | undefined, diagnosis?: string | null): boolean {
  if (!cell) return false;
  if (cell.key === 'G15') return isJudged(conditionOf(diagnosis).kind);
  return !NOT_JUDGED.has(cell.status.toUpperCase());
}

/** The catalogue's PV-unit placeholders: the loop's PV unit, its integral over time, and the integral of its square. */
const PV_PLACEHOLDERS: Partial<Record<string, (pv: string) => string>> = {
  'PV units': pv => pv,
  'PV·s': pv => `${pv}·s`,
  'PV²·s': pv => `${/^°?[A-Za-z]+$/.test(pv) ? pv : `(${pv})`}²·s`,
};

/** The catalogue unit is one of the PV-unit placeholders. */
export const isPvUnit = (unit: string): boolean => unit in PV_PLACEHOLDERS;

/**
 * CHG-166 (owner review, question 2): a PV-unit calculation in the loop's own unit, as System Response writes its quantities
 * (`displayUnit`); the placeholder stays when the loop has no PV unit. Any other unit is the catalogue's.
 */
export function loopUnit(unit: string, pvUnit: string | null | undefined): string {
  const pv = pvUnit?.trim();
  const swap = PV_PLACEHOLDERS[unit];
  return swap && pv ? swap(pv) : unit;
}

/**
 * The value as the list and the panel write it; a 0 reads 0. The number is formatted from the catalogue unit, so the loop's
 * unit never changes it. The panel shows the unit on its own row, so it asks for none.
 */
export function valueText(metric: MetricDef, value: number, opts: { pvUnit?: string | null; withUnit?: boolean } = {}): string {
  if (metric.field === 'confidence') return `${evidenceScore(value)} / 100`;
  const full = fmtQuantity(value, metric.unit);
  const suffix = ` ${metric.unit}`;
  if (!full.endsWith(suffix)) return full;
  const bare = full.slice(0, -suffix.length);
  return opts.withUnit === false ? bare : `${bare} ${loopUnit(metric.unit, opts.pvUnit)}`;
}

/**
 * The gate's own result for the metric: its mark word, and the status the mark is drawn from. A gate that was not judged
 * reads Not evaluated. The verdict belongs to the gate: with no value the result is marked partial and muted, never a pass for a number that does not exist.
 */
export function statusOf(
  cell: Pick<CpmGateCell, 'key' | 'status'> | undefined, diagnosis?: string | null, hasValue = true,
): MetricView['status'] {
  const code = cell && isGateJudged(cell, diagnosis) ? cell.status : 'NOT_EVALUATED';
  const mark = gateMark(code, cell?.key);
  const partial = !hasValue && code !== 'NOT_EVALUATED';
  return { label: mark.word, tone: partial ? 'muted' : mark.tone, code, partial };
}

/** How many of a window's gates need review and how many were not judged; the list no longer carries tiles. */
export function gateTally(gates: readonly Pick<CpmGateCell, 'key' | 'status'>[], diagnosis?: string | null) {
  let review = 0;
  let notJudged = 0;
  for (const g of gates) {
    const s = statusOf(g, diagnosis);
    if (s.code === 'NOT_EVALUATED') notJudged++;
    else if (s.tone === 'warn' || s.tone === 'bad') review++;
  }
  return { total: gates.length, review, notJudged };
}
