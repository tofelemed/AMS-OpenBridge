/**
 * CHG-218 (System Response plan Phase 4): the review shortlist, shown when no loop is chosen. About 600 models arrive a day
 * and none was ever reviewed; this lists one row per loop and path instead - the newest validated model nobody reviewed, the
 * baseline it would replace, how many more of that loop wait - loops without a baseline first, then the oldest. A row opens the
 * loop's Models tab, where the review itself happens (unchanged). Filtered by the header's plant scope.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { EmptyState, PanelHead, QueryError } from '../shared';
import { Pagination } from '../../../ui/forms/Pagination';
import { serviceName } from '../loopName';
import { stamp, zoneTag } from '../events/eventTime';
import { plainNumber } from '../evidence/format';
import type { ReviewModelSummary, ReviewQueueRow } from '../../../api/cpm/reviewQueue';
import { familyLabel, pathLabel } from './responseLabels';

const PAGE = 20;

/** "gain 2.1 · time constant 30 s · dead time 10 s": the parameters the model has, in words. */
export function modelNumbers(m: ReviewModelSummary): string {
  const parts: string[] = [];
  if (m.gain != null) parts.push(`gain ${plainNumber(m.gain)}`);
  if (m.timeConstant != null) parts.push(`time constant ${plainNumber(m.timeConstant)} s`);
  if (m.deadTime != null) parts.push(`dead time ${plainNumber(m.deadTime)} s`);
  return parts.join(' · ');
}

const ModelCell: React.FC<{ m: ReviewModelSummary }> = ({ m }) => (
  <>{familyLabel(m.family)}{modelNumbers(m) && <div className="cpm-event-row__sub">{modelNumbers(m)}</div>}</>
);

export interface ReviewShortlistProps {
  rows: ReviewQueueRow[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onOpen: (loopId: string) => void;
}

const matches = (r: ReviewQueueRow, q: string) => !q || r.loopId.toLowerCase().includes(q) || (r.displayName ?? '').toLowerCase().includes(q);

export const ReviewShortlist: React.FC<ReviewShortlistProps> = ({ rows, loading, error, onRetry, onOpen }) => {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [query]);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => rows.filter(r => matches(r, q)), [rows, q]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pageCount);
  const shown = filtered.slice((current - 1) * PAGE, current * PAGE);

  return (
    <section className="cpm-surface cpm-review-shortlist" aria-label="Models to review">
      <PanelHead title={rows.length ? `Models to review · ${rows.length}` : 'Models to review'} />
      {rows.length > PAGE && (
        <div className="cpm-compact cpm-config-filters" role="group" aria-label="Review filters">
          <input type="search" className="cpm-input" aria-label="Find a loop" placeholder="Loop or service" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      )}
      {loading && <div className="cpm-skeleton cpm-skeleton--result" role="status" aria-busy="true"><span className="cpm-skeleton__label">Loading the models to review…</span></div>}
      {error != null && <QueryError title="Models to review unavailable" error={error} retry={onRetry} />}
      {!loading && error == null && rows.length === 0 && <EmptyState title="No model waiting for review" />}
      {shown.length > 0 && (
        <table className="cpm-table cpm-config-rows">
          <thead><tr><th>Loop</th><th>Path</th><th>New model</th><th>Baseline</th><th>Waiting</th><th>Since · {zoneTag()}</th></tr></thead>
          <tbody>
            {shown.map(r => (
              <tr key={`${r.loopId}|${r.pathId}`} className="cpm-reg-row" onClick={() => onOpen(r.loopId)}>
                <td>
                  <button type="button" className="cpm-config-rowbtn" onClick={e => { e.stopPropagation(); onOpen(r.loopId); }}><strong>{r.loopId}</strong></button>
                  <div className="cpm-event-row__sub">{serviceName({ loopId: r.loopId, displayName: r.displayName })}</div>
                </td>
                <td>{pathLabel(r.pathId)}</td>
                <td><ModelCell m={r.candidate} /></td>
                <td>{r.baseline ? <ModelCell m={r.baseline} /> : 'None yet'}</td>
                <td className="cpm-num">{r.pendingCount}</td>
                <td>{stamp(r.candidate.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && rows.length > 0 && filtered.length === 0 && (
        <EmptyState title={`No loop matches “${query.trim()}”`} action={{ label: 'Show all loops', onClick: () => setQuery('') }} />
      )}
      {pageCount > 1 && <div className="cpm-events-pager"><Pagination page={current} pageCount={pageCount} onChange={setPage} label="Review pages" /></div>}
    </section>
  );
};

export default ReviewShortlist;
