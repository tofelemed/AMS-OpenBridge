/**
 * The review filters (SPEC §5.1). `review=` holds the filter and replaces `/cpm/kpi?kpi=`, so every
 * key that page accepted still opens. The default, Needing review, is the server's priority queue
 * and is not written to the URL. Counts are the server's: a count it does not give stays null.
 */
import type { FleetKpiKey, FleetKpis, FleetKpiTrend } from '../../../api/cpm/fleetKpis';
import { diagnosisTone, type BadgeTone } from '../../../ui/statusTones';

export const NEEDING = 'needing';
export type ReviewKey = typeof NEEDING | FleetKpiKey;

export interface ReviewFilter {
  key: ReviewKey;
  label: string;
  /** Its registry entry. */
  metric: string;
  /** The calculation that proves it, when one is named (CHG-092). */
  calculation?: string;
}

export const REVIEW_FILTERS: readonly ReviewFilter[] = [
  { key: NEEDING, label: 'Needing review', metric: 'M-027' },
  { key: 'oscillating', label: 'Oscillating', metric: 'M-009', calculation: 'CPLM-030' },
  { key: 'valve', label: 'Suspected valve problem', metric: 'M-010', calculation: 'CPLM-050' },
  { key: 'effort', label: 'Excessive actuator effort', metric: 'M-011', calculation: 'CPLM-020' },
  { key: 'saturated', label: 'Saturated / at limit', metric: 'M-012' },
  { key: 'manual-mode', label: 'In manual', metric: 'M-008', calculation: 'CPLM-003' },
  { key: 'out-of-mode', label: 'Out of normal mode', metric: 'M-007', calculation: 'CPLM-003' },
  { key: 'acceptable', label: 'Performing acceptably', metric: 'M-005', calculation: 'CPLM-014' },
  { key: 'not-assessable', label: 'Not assessable', metric: 'M-013', calculation: 'CPLM-001' },
  { key: 'stale', label: 'Stale', metric: 'M-015' },
  { key: 'never-evaluated', label: 'Never evaluated', metric: 'M-016' },
];

/** Reached from the distribution legend, the strip or an old link. Offered only while active. */
export const EXTRA_FILTERS: readonly ReviewFilter[] = [
  { key: 'finding', label: 'With a finding', metric: 'M-017' },
  { key: 'symptom', label: 'Symptom only', metric: 'M-018' },
  { key: 'no-fault-limited', label: 'No fault, but out of mode or at limit', metric: 'M-019', calculation: 'CPLM-003' },
  { key: 'normal-mode', label: 'In auto mode', metric: 'M-006', calculation: 'CPLM-003' },
  { key: 'assessed', label: 'Assessed', metric: 'M-003' },
  { key: 'all', label: 'All monitored loops', metric: 'M-001' },
];

const ALL_FILTERS = [...REVIEW_FILTERS, ...EXTRA_FILTERS];

export const filterOf = (key: ReviewKey): ReviewFilter => ALL_FILTERS.find(f => f.key === key) ?? REVIEW_FILTERS[0];

/** An unknown value falls back to the default rather than asking the server for a list it refuses. */
export const readReview = (value: string | null): ReviewKey => ALL_FILTERS.find(f => f.key === value)?.key ?? NEEDING;

export const reviewParam = (key: ReviewKey): string | null => (key === NEEDING ? null : key);

export interface CountSources {
  kpis?: FleetKpis;
  queueCount: number | null;
  outOfMode: number | null;
}

export function reviewCount(key: ReviewKey, s: CountSources): number | null {
  if (key === NEEDING) return s.queueCount;
  if (key === 'out-of-mode') return s.outOfMode; // the server gives no figure for it (M-007)
  const k = s.kpis;
  if (!k) return null;
  const figure = k.kpis.find(f => f.key === key);
  if (figure) return figure.count;
  if (key === 'finding') return k.assessed.finding;
  if (key === 'symptom') return k.assessed.symptomOnly;
  if (key === 'no-fault-limited') return k.assessed.noFaultLimited;
  if (key === 'assessed') return k.states.assessed;
  return key === 'all' ? k.monitored : null;
}

/** The series a filter's daily trend reads. Out of normal mode is drawn as its served mirror, In auto mode. */
export function trendKeyFor(key: ReviewKey): FleetKpiKey | null {
  if (key === NEEDING) return null;
  return key === 'out-of-mode' ? 'normal-mode' : key;
}

/** False when the daily record does not keep this figure, which is not the same as a day with no data. */
export const trendCarries = (trend: FleetKpiTrend | undefined, key: FleetKpiKey | null): boolean =>
  !!key && !!trend?.points.some(p => p.kpis.some(f => f.key === key));

export type BandTone = BadgeTone | 'normal';

export interface BandSegment {
  key: string;
  label: string;
  count: number;
  tone: BandTone;
  /** The filter its legend item opens. Null where the server has no list for it. */
  filter: FleetKpiKey | null;
}

/**
 * Every monitored loop in exactly one state, so the counts sum to `monitored`. The old bar left out
 * `assessed.unrecognised`, which would break that sum whenever the server counted one (M-004).
 */
export function distribution(k: FleetKpis): BandSegment[] {
  const finding = diagnosisTone('CONFIRMED').tone;
  const symptom = diagnosisTone('DETECTED').tone;
  const segments: BandSegment[] = [
    { key: 'finding', label: 'With a finding', count: k.assessed.finding, tone: finding, filter: 'finding' },
    { key: 'symptom', label: 'Symptom only', count: k.assessed.symptomOnly, tone: symptom, filter: 'symptom' },
    { key: 'acceptable', label: 'Performing acceptably', count: k.assessed.acceptable, tone: 'normal', filter: 'acceptable' },
    { key: 'limited', label: 'No fault, but limited', count: k.assessed.noFaultLimited, tone: 'neutral', filter: 'no-fault-limited' },
    { key: 'unrecognised', label: 'Result not recognised', count: k.assessed.unrecognised, tone: 'unknown', filter: null },
    { key: 'not-assessable', label: 'Not assessable', count: k.states.notAssessable, tone: 'unknown', filter: 'not-assessable' },
    { key: 'stale', label: 'Stale', count: k.states.stale, tone: 'warning', filter: 'stale' },
    { key: 'never', label: 'Never evaluated', count: k.states.neverEvaluated, tone: 'unknown', filter: 'never-evaluated' },
  ];
  return segments.filter(s => s.count > 0);
}
