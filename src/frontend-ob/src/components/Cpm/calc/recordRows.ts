/**
 * Task 20: the facts the old drawer's Definition, Validation and Coverage tabs held, now one closed "Record details" under the
 * panel. Each reads Not reported when the served payloads do not carry it. There is no per-metric history: there was none.
 */
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import type { CpmCalculations, CpmKpiRow } from '../../../api/cpmApi';
import type { MetricDef } from '../calcCatalogue';
import { fmtDateTime } from '../shared';

export const NOT_REPORTED = 'Not reported';

const STORED_IN: Record<MetricDef['source'], string> = {
  short: 'cplm_long_feature_results (short-tier metric over the fused window)',
  long: 'cplm_long_feature_results',
  gate: 'cplm_gate_results',
};

export function recordRows(
  metric: MetricDef, value: number | null,
  ctx: { row: CpmKpiRow | undefined; matrix: CpmGateMatrix | undefined; catalogue: CpmCalculations | undefined },
): Array<[label: string, value: string]> {
  const { row, matrix, catalogue } = ctx;
  const qualified = metric.source !== 'gate' && typeof row?.long_metrics_qualified === 'boolean' ? row.long_metrics_qualified : null;
  const gateDef = catalogue?.gates.find(g => g.key === metric.gate);
  // only the fused evidence score sits on the band scale
  const band = metric.source === 'gate' && value != null
    ? [...(catalogue?.bands ?? [])].sort((a, b) => a.maxConfidence - b.maxConfidence).find(b => value <= b.maxConfidence)
    : undefined;
  const created = typeof row?.created_at === 'string' ? row.created_at : null;
  return [
    ['Window qualification', qualified == null ? NOT_REPORTED : qualified ? 'Qualified' : 'Unqualified'],
    ['Evidence-score band', band ? `${band.band} (evidence score ≤ ${(band.maxConfidence * 100).toFixed(0)})` : NOT_REPORTED],
    [`Gate ${metric.gate} in stored results`, gateDef ? (gateDef.observedInResults ? 'Observed' : 'Never observed') : NOT_REPORTED],
    ['Catalogue note', catalogue?.note || NOT_REPORTED],
    ['Engine', matrix?.metadata.calculationSource || NOT_REPORTED],
    ['Emitted', created ? fmtDateTime(created) : NOT_REPORTED],
    ['Stored in', STORED_IN[metric.source]],
    ['Kind', metric.source === 'gate' ? 'Decision' : 'Calculation'],
  ];
}
