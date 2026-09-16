/**
 * v2.5 Task 1E.2 — the Investigation page's analysis-case vocabulary.
 *
 * It used to be derived by string-matching free-text diagnoses ("includes FINAL_ELEMENT",
 * "includes TUNING"…). The engine now serves the fusion v2 leading hypothesis on every ranked
 * loop; the case is that served enum. Only rows written before v2.5 (no leading hypothesis)
 * fall back to the diagnosis label family, whose suffix IS the family since v2.5.
 */
import type { CpmRankedLoop } from '../../../api/cpmApi';

export const CASE_LABEL: Record<string, string> = {
  STICTION: 'Valve / final element',
  OSCILLATION_TUNING: 'Oscillation — tuning',
  EXTERNAL_DISTURBANCE: 'External disturbance',
  EXCESSIVE_EFFORT: 'Actuator effort',
  ACTUATOR_LIMIT: 'Actuator at limit',
  SENSOR: 'Sensor / measurement',
  NOT_EVALUABLE: 'Not evaluable',
  HEALTHY: 'Healthy',
  OTHER: 'Other',
};

/** Case id for a ranked loop: the served leading hypothesis, else the diagnosis label family. */
export function caseIdFor(row: Pick<CpmRankedLoop, 'diagnosis' | 'leadingHypothesis'>): string {
  const d = (row.diagnosis ?? '').toUpperCase();
  if (d.startsWith('EXCLUDED') || d.startsWith('INSUFFICIENT') || d === 'NO_CALL' || d === 'NOT_EVALUATED') return 'NOT_EVALUABLE';
  if (d === 'NORMAL' || d === 'NONE') return 'HEALTHY';
  const lh = row.leadingHypothesis;
  if (lh && lh !== 'NONE' && CASE_LABEL[lh]) return lh;
  // Pre-v2.5 rows: the label family is the trailing token(s) after the band prefix.
  if (d.endsWith('FINAL_ELEMENT_NONLINEARITY')) return 'STICTION';
  if (d.endsWith('_OSCILLATION')) return 'OSCILLATION_TUNING';
  if (d.endsWith('_EXCESSIVE_EFFORT')) return 'EXCESSIVE_EFFORT';
  return 'OTHER';
}

export const caseLabelFor = (row: Pick<CpmRankedLoop, 'diagnosis' | 'leadingHypothesis'>): string =>
  CASE_LABEL[caseIdFor(row)] ?? CASE_LABEL.OTHER;

/** Chip counts, most frequent first. */
export function caseCounts(rows: Pick<CpmRankedLoop, 'diagnosis' | 'leadingHypothesis'>[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const id = caseIdFor(r);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
