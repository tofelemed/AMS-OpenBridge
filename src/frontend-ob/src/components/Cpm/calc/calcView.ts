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
  status: { label: string; tone: Tone; code: string };
}

/** The gate has no result of its own for this window. */
const NOT_JUDGED = new Set(['NOT_EVALUATED', 'PENDING', 'NOT_APPLICABLE', 'DISABLED']);

export function isGateJudged(cell: Pick<CpmGateCell, 'key' | 'status'> | undefined, diagnosis?: string | null): boolean {
  if (!cell) return false;
  if (cell.key === 'G15') return isJudged(conditionOf(diagnosis).kind);
  return !NOT_JUDGED.has(cell.status.toUpperCase());
}

/** The value as the list and the panel write it; a 0 reads 0. The panel shows the unit on its own row, so it asks for none here. */
export function valueText(metric: MetricDef, value: number, withUnit = true): string {
  if (metric.field === 'confidence') return `${evidenceScore(value)} / 100`;
  const full = fmtQuantity(value, metric.unit);
  const suffix = ` ${metric.unit}`;
  return !withUnit && full.endsWith(suffix) ? full.slice(0, -suffix.length) : full;
}

/**
 * The gate's own result for the metric: its mark word, and the status the mark is drawn from. A gate that was not judged
 * reads Not evaluated. The verdict belongs to the gate, so a missing value never turns the gate's result green or red.
 */
export function statusOf(cell: Pick<CpmGateCell, 'key' | 'status'> | undefined, diagnosis?: string | null): MetricView['status'] {
  const code = cell && isGateJudged(cell, diagnosis) ? cell.status : 'NOT_EVALUATED';
  const mark = gateMark(code, cell?.key);
  return { label: mark.word, tone: mark.tone, code };
}

/** How many of a window's gates need review and how many were not judged; the list no longer carries tiles. */
export function gateTally(gates: readonly Pick<CpmGateCell, 'key' | 'status'>[], diagnosis?: string | null) {
  let review = 0;
  let notJudged = 0;
  for (const g of gates) {
    if (!isGateJudged(g, diagnosis)) notJudged++;
    else {
      const tone = gateMark(g.status, g.key).tone;
      if (tone === 'warn' || tone === 'bad') review++;
    }
  }
  return { total: gates.length, review, notJudged };
}
