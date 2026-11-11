/**
 * Task 20: the facts the old drawer's Definition, Validation and Coverage tabs held. Each reads Not reported when the served
 * payloads do not carry it. There is no per-metric history: there was none. CHG-166 (owner review): shown in the Record details
 * dialog; Engine (not reported), Emitted (Run details' Computed), Catalogue note (the fused score's Method) and Kind (the page's
 * name, or the category) are gone, and the evidence-score band is a row only on the fused score, the one metric on that scale.
 */
import type { CpmCalculations, CpmKpiRow } from '../../../api/cpmApi';
import type { MetricDef } from '../calcCatalogue';

export const NOT_REPORTED = 'Not reported';

const STORED_IN: Record<MetricDef['source'], string> = {
  short: 'cplm_long_feature_results (short-tier metric over the fused window)',
  long: 'cplm_long_feature_results',
  gate: 'cplm_gate_results',
};

export function recordRows(
  metric: MetricDef, value: number | null,
  ctx: { row: CpmKpiRow | undefined; catalogue: CpmCalculations | undefined },
): Array<[label: string, value: string]> {
  const { row, catalogue } = ctx;
  const fused = metric.source === 'gate';
  const qualified = !fused && typeof row?.long_metrics_qualified === 'boolean' ? row.long_metrics_qualified : null;
  const gateDef = catalogue?.gates.find(g => g.key === metric.gate);
  const band = fused && value != null
    ? [...(catalogue?.bands ?? [])].sort((a, b) => a.maxConfidence - b.maxConfidence).find(b => value <= b.maxConfidence)
    : undefined;
  const bandRow: Array<[string, string]> = fused
    ? [['Evidence-score band', band ? `${band.band} (evidence score ≤ ${(band.maxConfidence * 100).toFixed(0)})` : NOT_REPORTED]]
    : [];
  return [
    ['Window qualification', qualified == null ? NOT_REPORTED : qualified ? 'Qualified' : 'Unqualified'],
    ...bandRow,
    [`Gate ${metric.gate} in stored results`, gateDef ? (gateDef.observedInResults ? 'Observed' : 'Never observed') : NOT_REPORTED],
    ['Stored in', STORED_IN[metric.source]],
  ];
}
