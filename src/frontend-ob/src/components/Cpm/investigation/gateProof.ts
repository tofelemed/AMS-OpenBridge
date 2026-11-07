/**
 * CHG-141: what Calculation proof shows for a gate, and the line under an opened gate. The values come from the honest
 * catalogue (`calcCatalogue`), read through `metricAvailability`, so a placeholder shows its state and never a number;
 * the same format as the Calculations page. G10, G11 and G15 hold quantities the catalogue does not list, and read them
 * through `whyRows`. Thresholds stay in the Workbench: this page has not read the configuration, so it must not say
 * that none is configured.
 */
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { METRICS } from '../calcCatalogue';
import { fmtQuantity } from '../evidence/format';
import { reasonSentence } from '../evidence/verdictCopy';
import { NO_THRESHOLD, whyRows } from '../evidence/whyRules';
import { gateMark } from '../gateStatus';
import { contextOfMatrix, metricAvailability } from '../metricAvailability';
import { confirmationProse } from './confirmationCopy';

export interface GateValue { label: string; value: string; title?: string }

/** The decision's score is the page's own fact: it is read from the row, not from the metrics. */
const catalogueOf = (gate: string) => METRICS.filter(m => m.gate === gate && m.field !== 'confidence');

export function gateValues(gate: string, matrix: CpmGateMatrix): GateValue[] {
  const defs = catalogueOf(gate);
  if (defs.length === 0) {
    return whyRows(gate, { prov: () => undefined, cfg: () => undefined, row: matrix })
      .map(r => ({ label: r.label, value: r.against && r.against !== NO_THRESHOLD ? `${r.value} · ${r.against}` : r.value }));
  }
  const context = contextOfMatrix(matrix);
  return defs.flatMap((m): GateValue[] => {
    const raw = matrix.metrics?.[m.field] ?? (m.field === 'sample_count' ? matrix.sampleCount ?? undefined : undefined);
    const a = metricAvailability(context, m.field, raw);
    if (a.state === 'not-calculated' && a.reason === 'not in this result') return [];
    return [{ label: m.name, value: a.state === 'measured' ? fmtQuantity(raw as number, m.unit) : a.short, title: m.description }];
  });
}

export const sentence = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;

/** The reason in words; G14 says what its confirmation means; otherwise what the mark means, with what a pass lacked. */
export function gateDetail(gate: string, matrix: CpmGateMatrix, opts: { flags?: readonly string[] | null; vpAbsentOnLoop?: boolean } = {}): string {
  const cell = matrix.gates.find(c => c.key === gate);
  if (gate === 'G14' && matrix.verdictV2?.confirmation) return confirmationProse(matrix.verdictV2.confirmation, matrix.verdictV2.legacy, opts.vpAbsentOnLoop);
  const reason = reasonSentence(cell?.reason ?? null, { gate, eligibilityDetail: matrix.methodEligibility?.[gate]?.detail });
  return sentence(reason ?? gateMark(cell?.status, gate, opts.flags).label);
}
