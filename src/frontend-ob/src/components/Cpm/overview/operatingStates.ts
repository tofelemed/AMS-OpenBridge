/**
 * SME review #5/#6 (CHG-043): the Overview's operating picture — every monitored
 * loop in exactly one state, from the fleet summary's `statuses` block (cplm-api
 * `FleetLatestSql.SummaryByStatus`). Pure, so the order, words and tones are
 * unit-tested.
 *
 * Order is the SME's: healthy, poor performance, excluded, stale, not evaluated —
 * left to right in the bar and the tiles alike. Excluded and not-evaluated are both
 * neutral (neither is a performance verdict), so the bar tells them apart by fill
 * pattern as well as by label, never by colour alone.
 */
import type { CpmFleetStatuses } from '../../../api/cpmApi';
import type { CpmTone } from '../shared';
import type { RowFilter } from '../gateStatus';

export type OperatingStateKey = 'healthy' | 'poor' | 'excluded' | 'stale' | 'notEvaluated';

export interface OperatingState {
  key: OperatingStateKey;
  label: string;
  count: number;
  /** What the count means, in one line. */
  sub: string;
  tone: CpmTone;
  /** The Performance row filter that lists these loops, when one exists. */
  rows?: RowFilter;
}

const hours = (s: number) => (s % 3600 === 0 ? `${s / 3600} h` : `${Math.round(s / 60)} min`);

export function operatingStates(s: CpmFleetStatuses): OperatingState[] {
  const notEvaluated = s.insufficientData + s.noResult + s.unclassified;
  const notEvalParts = [
    s.insufficientData > 0 ? `insufficient data ${s.insufficientData}` : null,
    s.noResult > 0 ? `no result yet ${s.noResult}` : null,
    s.unclassified > 0 ? `unclassified ${s.unclassified}` : null,
  ].filter(Boolean);
  return [
    { key: 'healthy', label: 'Healthy', count: s.healthy, tone: 'good', sub: 'no problem found' },
    { key: 'poor', label: 'Poor performance', count: s.poor, tone: 'bad', rows: 'attention',
      sub: 'confirmed or suspected finding' },
    { key: 'excluded', label: 'Excluded', count: s.excluded, tone: 'muted',
      sub: 'not in automatic: not assessed' },
    { key: 'stale', label: 'Stale', count: s.stale, tone: 'warn',
      sub: `no verdict in the last ${hours(s.staleAfterSeconds)}` },
    { key: 'notEvaluated', label: 'Not evaluated', count: notEvaluated, tone: 'muted', rows: 'notEvaluated',
      sub: notEvalParts.length ? notEvalParts.join(' · ') : 'every loop has a verdict' },
  ];
}

/** "161 of 230 (70%)" — the share of the monitored fleet. */
export function shareText(count: number, total: number): string {
  if (total <= 0) return `${count}`;
  return `${count} of ${total} (${Math.round((count / total) * 100)}%)`;
}
