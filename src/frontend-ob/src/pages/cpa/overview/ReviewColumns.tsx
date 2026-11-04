/**
 * The review table's columns (SPEC §5.1). A value no source gives reads as a dash, never as 0.
 * Bars are neutral with the value beside them: nothing here is "lower is greener" (CD8).
 */
import React from 'react';
import type { FleetKpiBasis } from '../../../api/cpm/fleetKpis';
import { reasonLabel } from '../../../components/Cpm/kpi/fleetKpiView';
import type { Column } from '../../../ui/DataTable';
import { StatusBadge } from '../../../ui/StatusBadge';
import { NEUTRAL } from '../../../ui/statusTones';
import { MetricHelp } from './MetricHelp';
import { fractionText, sentence, shortStamp } from './overviewFormat';
import { NEEDING, type ReviewKey } from './reviewFilters';
import { ackBadge, persistenceText, priorityWord, type ReviewRow } from './reviewRows';

const DASH = '—';

const ReviewMetric: React.FC<{ value: number | null }> = ({ value }) => {
  const text = fractionText(value);
  if (!text || value == null) return <>{DASH}<span className="ui-sr"> Good-error share not measured</span></>;
  return (
    <span className="ov-metric">
      <span className="ov-metric__value">{text}</span>
      <span className="ov-metric__meter" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
      </span>
      <span className="ov-metric__name">Good-error share</span>
    </span>
  );
};

export function reviewColumns(o: {
  review: ReviewKey;
  zoneId: string;
  now: number;
  /** False when the server pages the list: a re-sorted page ranks only itself. */
  sortable: boolean;
  basis?: FleetKpiBasis;
}): Array<Column<ReviewRow>> {
  const { review, zoneId, now, sortable, basis } = o;
  const columns: Array<Column<ReviewRow>> = [
    { key: 'loop', header: 'Loop', cell: r => r.loopId, mono: true, sticky: true, sortable },
    { key: 'asset', header: 'Parent asset', cell: r => <span className="ov-asset">{r.asset || DASH}</span>, sortable },
    {
      key: 'condition', header: 'Condition', sortable,
      cell: r => <StatusBadge tone={r.condition.tone}>{r.condition.label}</StatusBadge>,
    },
    { key: 'metric', header: 'Review metric', cell: r => <ReviewMetric value={r.goodError} />, sortable },
  ];
  if (review !== NEEDING) {
    columns.push({
      key: 'deciding',
      header: <>Deciding value <MetricHelp metric="M-023" label="Deciding value" basis={basis} /></>,
      cell: r => <span className="ov-deciding">{r.deciding ?? DASH}</span>,
    });
  }
  if (review === 'not-assessable') {
    columns.push({
      key: 'reason',
      header: <>Reason <MetricHelp metric="M-014" label="Reason" basis={basis} /></>,
      cell: r => (r.reason ? sentence(reasonLabel(r.reason)) : DASH),
    });
  }
  columns.push(
    {
      key: 'priority', header: 'Priority', sortable,
      cell: r => {
        const word = priorityWord(r.priority);
        return word ? <StatusBadge tone={NEUTRAL.tone}>{word}</StatusBadge> : DASH;
      },
    },
    { key: 'persistence', header: 'Persistence', cell: r => persistenceText(r, now) ?? DASH, sortable },
    { key: 'coverage', header: 'Coverage', cell: r => fractionText(r.coverage) ?? DASH, align: 'end', sortable },
    { key: 'evaluated', header: 'Last evaluation', cell: r => <span className="ov-stamp">{shortStamp(r.windowEnd, zoneId)}</span>, sortable },
    {
      key: 'ack', header: 'Acknowledgement',
      cell: r => {
        const badge = ackBadge(r.ack);
        return badge ? <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge> : DASH;
      },
    },
  );
  return columns;
}
