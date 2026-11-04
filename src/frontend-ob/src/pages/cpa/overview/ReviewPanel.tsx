/**
 * SPEC §5.1 primary panel. The ranking basis sits above the table rather than in the Priority
 * heading: a sort heading is a button, and a button cannot hold the ⓘ button (WCAG 4.1.2).
 * Selecting a row updates the inspector; Enter opens the loop, Space selects, as the SPEC sets it.
 */
import React from 'react';
import type { FleetKpiBasis, FleetKpis } from '../../../api/cpm/fleetKpis';
import { reasonLabel } from '../../../components/Cpm/kpi/fleetKpiView';
import { siteDateTime } from '../../../cpa/siteTime';
import { Button } from '../../../ui/Button';
import { DataTable } from '../../../ui/DataTable';
import { FilterChip } from '../../../ui/forms/FilterChip';
import { Pagination } from '../../../ui/forms/Pagination';
import { MetricHelp } from './MetricHelp';
import { sentence } from './overviewFormat';
import { reviewColumns } from './ReviewColumns';
import { filterOf, NEEDING, type ReviewKey } from './reviewFilters';
import { SORT_NAME, type ReviewRow } from './reviewRows';
import type { ReviewList } from './useReviewList';

const ORDER: Partial<Record<ReviewKey, string>> = {
  'normal-mode': 'Lowest time in normal mode first',
  'out-of-mode': 'Lowest time in normal mode first',
  acceptable: 'Lowest time in normal mode first',
  'no-fault-limited': 'Lowest time in normal mode first',
  saturated: 'Most time at an OP limit first',
  'manual-mode': 'Most time in manual first',
  oscillating: 'Highest evidence score first',
  valve: 'Highest evidence score first',
  effort: 'Highest evidence score first',
  finding: 'Highest evidence score first',
  symptom: 'Highest evidence score first',
  'not-assessable': 'Lowest sample completeness first',
  stale: 'Oldest result first',
};

const OrderLine: React.FC<{ list: ReviewList; review: ReviewKey; basis?: FleetKpiBasis }> = ({ list, review, basis }) => {
  if (list.sort) {
    const direction = list.sort.dir === 'asc' ? 'ascending' : 'descending';
    return (
      <span>
        Sorted by {SORT_NAME[list.sort.key]}, {direction}.{' '}
        <button type="button" className="ui-link" onClick={list.resetSort}>{review === NEEDING ? 'Back to ranked order' : 'Back to server order'}</button>
      </span>
    );
  }
  if (review === NEEDING) return <span>Ranked by priority <MetricHelp metric="M-026" label="Ranked by priority" basis={basis} /></span>;
  const order = ORDER[review] ?? 'By loop tag';
  return <span>{list.sortable ? order : `${order}. The server pages this list, so headings do not re-sort it.`}</span>;
};

export const ReviewPanel: React.FC<{
  list: ReviewList;
  review: ReviewKey;
  reason: string | null;
  day: string | null;
  kpis: FleetKpis | undefined;
  zoneId: string;
  selectedLoop: string;
  shelved: number;
  /** The queue reached the server's limit, so it may hold more than it shows. */
  queueCut: boolean;
  /** Below 1280 px the inspector is a drawer, so its proof needs a way in. */
  onShowProof?: () => void;
  onSelect: (row: ReviewRow) => void;
  onOpen: (row: ReviewRow) => void;
  onResetFilter: () => void;
  onReason: (reason: string | null) => void;
  onBackToNow: () => void;
  emptyAction: React.ReactNode;
}> = ({
  list, review, reason, day, kpis, zoneId, selectedLoop, shelved, queueCut, onShowProof, onSelect, onOpen, onResetFilter, onReason, onBackToNow, emptyAction,
}) => {
  const label = filterOf(review).label;
  const now = Date.now();
  const columns = reviewColumns({ review, zoneId, now, sortable: list.sortable, basis: kpis?.basis });
  const selected = selectedLoop ? list.rows.find(r => r.loopId.toLowerCase() === selectedLoop.toLowerCase())?.loopId : undefined;
  const reasons = review === 'not-assessable' ? kpis?.notAssessableByReason ?? [] : [];

  const emptyState = (() => {
    if (list.searching) {
      return { title: 'No loop matches the search', reason: undefined, action: <Button onClick={() => list.setSearch('')}>Clear search</Button> };
    }
    if (review === NEEDING) {
      return {
        title: 'No current findings',
        reason: shelved > 0 ? `Every current finding is shelved (${shelved}).` : undefined,
        action: emptyAction,
      };
    }
    return { title: `No loops match ${label} in this scope`, reason: undefined, action: <Button onClick={onResetFilter}>Reset filter</Button> };
  })();

  // DataTable selects on Enter. Here Enter opens the loop, so it is taken before the row sees it.
  const openOnEnter = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (e.key !== 'Enter' || target.tagName !== 'TR') return;
    const row = list.rows[Array.from(target.parentElement?.children ?? []).indexOf(target)];
    if (!row) return;
    e.preventDefault();
    e.stopPropagation();
    onOpen(row);
  };

  return (
    <section className="ov-panel" aria-label="Review table">
      <div className="ov-panel__meta">
        <OrderLine list={list} review={review} basis={kpis?.basis} />
        {review !== NEEDING && <span>Priority <MetricHelp metric="M-026" label="Priority" basis={kpis?.basis} /></span>}
        <span>Good-error share <MetricHelp metric="M-080" label="Good-error share" basis={kpis?.basis} /></span>
        <span>Coverage <MetricHelp metric="M-093" label="Coverage" basis={kpis?.basis} /></span>
        {onShowProof && <button type="button" className="ui-link" onClick={onShowProof}>How this filter is counted</button>}
      </div>

      {reasons.length > 0 && (
        <div className="ov-panel__chips" role="group" aria-label="Narrow by reason">
          <FilterChip label={`All reasons ${kpis?.states.notAssessable ?? ''}`.trim()} selected={!reason} onToggle={() => onReason(null)} />
          {reasons.map(r => (
            <FilterChip key={r.reason} label={`${sentence(reasonLabel(r.reason))} ${r.count}`} selected={reason === r.reason}
              onToggle={() => onReason(reason === r.reason ? null : r.reason)} />
          ))}
        </div>
      )}

      {day && (
        <p className="ov-panel__meta" role="status">
          <span>As of {siteDateTime(day, zoneId)}</span>
          <button type="button" className="ui-link" onClick={onBackToNow}>Back to now</button>
        </p>
      )}

      <div onKeyDownCapture={openOnEnter}>
        <DataTable
          caption={`${label}: loops`}
          columns={columns}
          rows={list.rows}
          rowKey={r => r.loopId}
          sort={list.sort}
          onSort={list.onSort}
          selectedKey={selected}
          onSelect={onSelect}
          loading={list.loading}
          error={list.error}
          onRetry={list.retry}
          emptyTitle={emptyState.title}
          emptyReason={emptyState.reason}
          emptyAction={emptyState.action}
          footer={list.pageCount > 1 || list.searching || queueCut ? (
            <div className="ov-panel__footer">
              {list.searching && <span className="ui-meta">{list.matched} of {list.total} match the search</span>}
              {queueCut && !list.searching && <span className="ui-meta">The first {list.total} by priority. The queue may hold more.</span>}
              {list.pageCount > 1 && <Pagination page={list.page} pageCount={list.pageCount} onChange={list.setPage} label="Review table pages" />}
            </div>
          ) : undefined}
        />
      </div>
    </section>
  );
};
