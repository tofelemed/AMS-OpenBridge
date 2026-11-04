/**
 * What the inspector says about one loop, from the row the table shows, so the two cannot disagree.
 * Every value is the row's own: a value the row lacks reads "Not measured". Gate results are not
 * words here: `gateFacts` hands them to GateBadge.
 */
import { contextText, decidingText, LIMIT_WORD, stateText } from '../../../components/Cpm/kpi/kpiProof';
import { reasonLabel } from '../../../components/Cpm/kpi/fleetKpiView';
import type { FleetKpiKey } from '../../../api/cpm/fleetKpis';
import { priorityReasons } from '../../../components/Cpm/overview/priorityReason';
import { nameGates } from './helpFill';
import { fractionText } from './overviewFormat';
import { NEEDING, type ReviewKey } from './reviewFilters';
import type { ReviewRow } from './reviewRows';

const FAMILY_KPI: Record<string, FleetKpiKey> = {
  OSCILLATION: 'oscillating', FINAL_ELEMENT_NONLINEARITY: 'valve', EXCESSIVE_EFFORT: 'effort',
};

/** The metric or rule that selected the loop (p.13 R4). */
export function whyLines(row: ReviewRow, review: ReviewKey, now: number): string[] {
  if (review === NEEDING) {
    if (row.rank) return [priorityReasons(row.rank, now).join(' · ')];
    return row.kpi ? ['Not in the review queue', stateText(row.kpi)] : ['Not in the review queue'];
  }
  if (!row.kpi) return [row.condition.label];
  const lines = [decidingText(row.kpi)];
  if (row.kpi.limitedBy?.length) lines.push(`Limited by ${row.kpi.limitedBy.map(l => LIMIT_WORD[l] ?? l.toLowerCase().replace(/_/g, ' ')).join(', ')}`);
  if (row.kpi.reason && row.kpi.state === 'NotAssessable') lines.push(`Reason: ${reasonLabel(row.kpi.reason)}`);
  return lines.map(nameGates);
}

export interface LoopStat { key: string; label: string; value: string | null; metric: string; extra?: Record<string, string> }

function limitBasis(source: string | null | undefined): string {
  if (source === 'FALLBACK_0_100') return '0–100 % fallback';
  return source ? 'registered OP range' : 'not reported';
}

/** Named statistics for the evaluated window. */
export function loopStatistics(row: ReviewRow): LoopStat[] {
  const inputs = row.kpi?.inputs;
  const confidence = row.rank?.confidence;
  const evidence = row.kpi?.evidenceScore ?? (confidence == null ? null : Math.round(confidence * 100));
  const samples = inputs?.sampleCount != null && inputs.expectedSampleCount != null
    ? ` (${Math.round(inputs.sampleCount)} of ${Math.round(inputs.expectedSampleCount)} samples)` : '';
  const coverage = fractionText(row.coverage);
  return [
    { key: 'evidence', label: 'Evidence score', value: evidence == null ? null : String(evidence), metric: 'M-066' },
    { key: 'good-error', label: 'Good-error share', value: fractionText(row.goodError), metric: 'M-080' },
    { key: 'normal-mode', label: 'Time in normal mode', value: fractionText(inputs?.autoPct), metric: 'M-078' },
    {
      key: 'op-limit', label: 'Time at an OP limit', value: fractionText(inputs?.saturationPct), metric: 'M-088',
      extra: { basis: limitBasis(inputs?.limitSource) },
    },
    { key: 'coverage', label: 'Data coverage', value: coverage && `${coverage}${samples}`, metric: 'M-093' },
  ];
}

/** The gate results behind this row's place in the list, for GateBadge. */
export function gateFacts(row: ReviewRow, review: ReviewKey): Array<{ gate: string; status: string }> {
  const i = row.kpi?.inputs;
  if (!i) return [];
  const valve = review === 'valve' || row.kpi?.family === 'FINAL_ELEMENT_NONLINEARITY';
  return [
    { gate: 'G3', status: i.g3Status },
    { gate: 'G4', status: i.g4Status },
    ...(valve ? [{ gate: 'G14', status: i.g14State }] : []),
  ].filter((g): g is { gate: string; status: string } => !!g.status);
}

/**
 * The inputs a reviewer checks next. Gate parts of the old line are left out, because a gate result
 * is shown only through GateBadge (UI-039). A loop-specific line, so the raw list is not repeated.
 */
export function alsoCheck(row: ReviewRow, review: ReviewKey): string | null {
  if (!row.kpi) return null;
  const family = row.kpi.family ? FAMILY_KPI[row.kpi.family] : undefined;
  const key: FleetKpiKey = review === NEEDING ? family ?? 'all' : review;
  const parts = contextText(row.kpi, key).split(' · ').filter(p => p && !/^(limited by|G\d)/.test(p));
  return parts.length ? parts.join(' · ') : null;
}
