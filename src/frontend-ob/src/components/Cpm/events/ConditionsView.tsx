/**
 * Loop Events › Fast conditions (2026-09-17 audit F22; CHG-136 a view of its own, `?view=conditions&condition=`). CHG-167 (owner
 * review, answer 4): one filter row inside the list card, a search (loop or description) first, then All / Open / Closed with
 * the counts (counts stay only inside the state dropdown); pages of ten with the shared pager. `GET /conditions` returns every
 * row, open first, with no search or paging of its own, so both are done here. A linked condition opens on its page.
 * The conditions are read only while this view is open: the toggle no longer carries their count.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CpmConditionScope } from '../../../api/cpm/conditions';
import { Pagination } from '../../../ui/forms/Pagination';
import { EmptyState, QueryError } from '../shared';
import { conditionRows, filterConditions, type ConditionFilter } from './conditionRows';
import { ConditionList } from './ConditionList';
import { ConditionDetail } from './ConditionDetail';
import { useCpmConditions } from './useConditions';

const PAGE_SIZE = 10;
/** Every condition in scope, not the 200 the list once showed: the state counts are the plant's. */
const CONDITION_LIMIT = 2000;
const STATES: ReadonlyArray<{ value: ConditionFilter; label: string }> = [
  { value: 'all', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' },
];

export const ConditionsView: React.FC<{ scope: CpmConditionScope }> = ({ scope }) => {
  const [params, setParams] = useSearchParams();
  const conditions = useCpmConditions(scope, false, CONDITION_LIMIT);
  const rows = conditionRows(conditions.data?.conditions ?? [], Date.now());
  const [search, setSearch] = useState('');
  const [state, setState] = useState<ConditionFilter>('all');
  const [page, setPage] = useState(1);
  const visible = filterConditions(rows, search, state);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const key = params.get('condition');

  // A linked condition opens on the page that holds it, once the rows have arrived.
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current || rows.length === 0) return;
    placed.current = true;
    const at = visible.findIndex(r => r.key === key);
    if (at >= 0) setPage(Math.floor(at / PAGE_SIZE) + 1);
  }, [rows.length, visible, key]);

  // Below 1280 px the panel is a drawer: a link that names a condition opens it, and so does a row.
  const [drawer, setDrawer] = useState(() => params.has('condition'));
  const selected = visible.find(r => r.key === key) ?? pageRows[0];
  const pick = (k: string) => { setParams(p => { p.set('condition', k); return p; }, { replace: true }); setDrawer(true); };
  const count = (s: ConditionFilter) => (s === 'all' ? rows.length : rows.filter(r => r.open === (s === 'open')).length);
  const loaded = !!conditions.data;

  return (
    <div className="cpm-master-detail">
      <section className="cpm-surface cpm-events-list" aria-label="Fast conditions list">
        <div className="cpm-events-filters">
          <input className="cpm-input" type="search" aria-label="Find a condition" placeholder="Loop or description"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          <select className="cpm-select" aria-label="Condition state" value={state}
            onChange={e => { setState(e.target.value as ConditionFilter); setPage(1); }}>
            {STATES.map(s => <option key={s.value} value={s.value}>{loaded ? `${s.label} ${count(s.value)}` : s.label}</option>)}
          </select>
        </div>
        <ConditionList rows={pageRows} selectedKey={selected?.key} onSelect={pick} notices={<>
          {conditions.isLoading && <EmptyState title="Loading the fast conditions…" />}
          {conditions.isError && <QueryError title="Conditions unavailable" error={conditions.error} retry={() => void conditions.refetch()} />}
          {loaded && rows.length === 0 && (
            <EmptyState title="No fast conditions in scope" copy="Nothing to act on: no loop in scope is held at a limit or frozen right now. Such a condition appears here within minutes of the analysis engine seeing it." />
          )}
          {rows.length > 0 && visible.length === 0 && <EmptyState title="No condition matches" />}
        </>} />
        {pageCount > 1 && (
          <div className="cpm-events-pager">
            <Pagination page={current} pageCount={pageCount} onChange={setPage} label="Fast condition pages" />
          </div>
        )}
      </section>
      {selected && <ConditionDetail row={selected} open={drawer} onClose={() => setDrawer(false)} />}
    </div>
  );
};

export default ConditionsView;
