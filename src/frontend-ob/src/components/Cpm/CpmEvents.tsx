'use client';

/**
 * CPLM Phase 7 — U4 Events. Loop Events, the Episodes view of the reference (CHG-136).
 *
 * CHG-136: a toggle in the header, Episodes | Fast conditions, with the open counts, replaces the conditions that
 * sat under the list (`?view=conditions&condition=`). The list reads Loop / peak diagnosis, Severity, Review, Opened
 * (events/EpisodeList) and opens on Open episodes; the filters stay our dropdowns in one row, with a severity
 * dropdown and a search that also takes an EVT number. Both are asked of the server.
 *
 * CHG-063: the list is filtered, searched and paged on the SERVER (`/events/page`). A deep-linked episode that is not
 * on the current page is read by id (`/events/{id}`). Phase 6: `?loop=` scopes the request. A shelf is shown with its
 * real expiry state (events/shelfState); a shelve REQUIRES an expiry — the API rejects unbounded shelves.
 */
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { InputChip } from '../../ui/forms/InputChip';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { EmptyState, QueryError, WorkspaceHeader } from './shared';
import { useCpmScope } from './plantScope';
import { useAuthStore } from '../../store/authStore';
import {
  EVENT_FILTERS as FILTERS, SEVERITY_FILTERS, isEventFilterKey as isFilterKey,
  type EventFilterKey as FilterKey,
} from './events/shelfState';
import { ConditionsPanel, conditionRows } from './events/ConditionsPanel';
import { ConditionDetail } from './events/ConditionDetail';
import { EpisodeList } from './events/EpisodeList';
import { useCpmConditions } from './events/useConditions';
import EventDetail from './events/EventDetail';
import { useDebounced, useEventById, useEventPage } from './events/useEventPage';
import { ApiError } from '../../api/apiFetch';
import type { Receipt } from './ActionReceipt';

const PAGE_SIZE = 10;
/** The toggle's open count is the fleet's, so the conditions read is not capped at the 200 the list used to show. */
const CONDITION_LIMIT = 2000;
const SORT_OPTIONS = [{ value: 'triage', label: 'Triage' }, { value: 'recent', label: 'Newest' }] as const;
type View = 'episodes' | 'conditions';

export const CpmEvents: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const edit = (change: (p: URLSearchParams) => void) => setParams(p => { change(p); return p; }, { replace: true });
  // Validated, not cast: `?filter=bogus` falls back to the default rather than leaving no control looking active.
  const filterParam = params.get('filter');
  const filter: FilterKey = isFilterKey(filterParam) ? filterParam : 'open';
  const severityParam = params.get('severity');
  const severity = SEVERITY_FILTERS.find(s => s.value === severityParam)?.value;
  const view: View = params.get('view') === 'conditions' ? 'conditions' : 'episodes';
  const selectedId = params.get('event');
  // E1: triage (worst first) is the right default for a response queue, but "what happened lately" needs opened_at.
  const sort = params.get('sort') === 'recent' ? 'recent' as const : 'triage' as const;
  // Phase 6: a loop in the URL scopes the REQUEST (the API filters by loopId).
  const loopParam = params.get('loop')?.trim() || undefined;
  const canManage = useAuthStore(s => s.hasPermission('cpm.manage'));

  // CHG-063: every filter is a request parameter; typing is debounced into one request.
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const scope = useCpmScope();
  const conditions = useCpmConditions(scope.params, false, CONDITION_LIMIT);
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [filter, severity, sort, loopParam, q, scope.site, scope.area, scope.unit]);
  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useEventPage({
    state: filter, severity, loopId: loopParam, q: q || undefined, ...scope.params, sort, page: page + 1, pageSize: PAGE_SIZE,
  });
  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const pageCount = data?.pageCount ?? 1;
  // The clock the shelf states are judged against; the 30 s refetch re-renders often enough.
  const now = Date.now();

  // A deep link resolves on the page first, then by id: an episode outside this page (another filter, a search,
  // or simply ranked below it) still opens under its own URL — never a different episode in its place.
  const selectedNum = selectedId && /^\d+$/.test(selectedId) ? Number(selectedId) : null;
  const onPage = selectedNum !== null ? events.find(e => e.id === selectedNum) : undefined;
  const lookup = useEventById(selectedNum, !!data && !onPage);
  const missing = !!selectedId && (selectedNum === null || (lookup.error instanceof ApiError && lookup.error.status === 404));
  const selected = onPage ?? lookup.data ?? (selectedNum !== null && lookup.isLoading ? undefined : events[0]);
  const offPage = !onPage && !!lookup.data;

  // CHG-098 (SME review 2 #27): the last action's receipt, held here so it survives the detail remounting when the
  // action moves the episode off this tab; shown only beside the episode it belongs to.
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  // replace: picking a row is in-page selection, not a page visit.
  const select = (id: number) => edit(p => p.set('event', String(id)));
  const setSort = (v: 'triage' | 'recent') => edit(p => { if (v === 'triage') p.delete('sort'); else p.set('sort', v); });
  const showAll = () => { setSearch(''); edit(p => { p.set('filter', 'all'); p.delete('severity'); p.delete('loop'); }); };

  const conditionList = conditions.data?.conditions ?? [];
  const rows = conditionRows(conditionList, now);
  const openConditions = rows.filter(r => r.open).length;
  const selectedCondition = rows.find(r => r.key === params.get('condition')) ?? rows[0];
  const listTitle = `${FILTERS.find(f => f.key === filter)?.label ?? 'All'} episodes`;

  const toggle = (
    <SegmentedControl<View> label="Loop events view" ignoreReselect value={view}
      onChange={v => edit(p => { if (v === 'conditions') p.set('view', v); else p.delete('view'); p.delete('condition'); })}
      options={[
        { value: 'episodes', label: data ? `Episodes · ${data.counts.open ?? 0} open` : 'Episodes' },
        { value: 'conditions', label: conditions.data ? `Fast conditions · ${openConditions} open` : 'Fast conditions' },
      ]} />
  );

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        page="/cpm/events"
        title="Loop events"
        copy="Investigate diagnosis episodes with operating context and a traceable response history. One row is one episode of one fault family — a change in its evidence score extends it rather than duplicating it."
        actions={toggle}
      />
      {view === 'conditions' ? (
        <div className="cpm-grid-2">
          <ConditionsPanel conditions={conditionList} isLoading={conditions.isLoading} now={now}
            error={conditions.isError ? conditions.error : null} onRetry={() => void conditions.refetch()}
            selectedKey={selectedCondition?.key} onSelect={key => edit(p => p.set('condition', key))} />
          {selectedCondition && <ConditionDetail row={selectedCondition} />}
        </div>
      ) : (
        <>
          <div className="cpm-filter-row">
            {/* CHG-131: one row. The state dropdown keeps each state's count. */}
            <select className="cpm-select" aria-label="Event state" value={filter}
              onChange={e => edit(p => p.set('filter', e.target.value))}>
              {FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}{data ? ` ${data.counts[f.key] ?? 0}` : ''}</option>)}
            </select>
            <select className="cpm-select" aria-label="Severity" value={severity ?? ''}
              onChange={e => edit(p => { if (e.target.value) p.set('severity', e.target.value); else p.delete('severity'); })}>
              <option value="">All severity</option>
              {SEVERITY_FILTERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select className="cpm-select" aria-label="Order" value={sort} onChange={e => setSort(e.target.value as typeof sort)}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input className="cpm-input cpm-filter-find" aria-label="Find" placeholder="loop, EVT number, family or diagnosis"
              value={search} onChange={e => setSearch(e.target.value)} />

            {loopParam && <InputChip label={`Loop ${loopParam}`} onRemove={() => edit(p => p.delete('loop'))} />}

            <span className="cpm-filter-count">
              {data && <>
                {total} event(s){loopParam ? ` for ${loopParam}` : ''}{q ? ` matching “${q}”` : ''}
              </>}
            </span>
          </div>

          <div className="cpm-grid-2">
            <EpisodeList title={listTitle} events={events} selectedId={selected?.id} now={now} onSelect={select}
              notices={<>
                {isLoading && <EmptyState title="Loading events…" />}
                {isError && <QueryError title="Events unavailable" error={error} retry={() => void refetch()} />}
                {!isLoading && !isError && total === 0 && (
                  <EmptyState
                    title="No events in this view"
                    copy={q
                      ? `No episode matches “${q}” under this filter.`
                      : loopParam
                        ? `No episode of ${loopParam} matches this filter.`
                        : 'No episode matches this filter and plant scope.'}
                    // CHG-098 (SME review 2 #29): a way out — clear what narrows the list, or see every loop's current result.
                    action={q || loopParam || severity || filter !== 'all' ? { label: 'Show all events', onClick: showAll } : undefined}
                    next={!q && !loopParam && !severity && filter === 'all' ? [{ label: 'Current results in Performance', to: '/cpm/performance' }] : undefined}
                  />
                )}
                {missing && (
                  <p className="cpm-copy" role="status" style={{ padding: '8px 12px' }}>
                    Event {selectedId} does not exist (it may have been removed by retention) — showing the first event on
                    this page instead.
                  </p>
                )}
                {offPage && selected && (
                  <p className="cpm-copy" role="status" style={{ padding: '8px 12px' }}>
                    EVT-{selected.id} is not on this page of the list (filter, search or rank) — its detail is open on the right.
                  </p>
                )}
              </>}
              footer={pageCount > 1 && (
                <div className="cpm-pager" aria-busy={isPlaceholderData}>
                  <span title={page === 0 ? 'Already on the first page' : undefined}><ObcButton variant="flat" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>← Prev</ObcButton></span>
                  <span className="cpm-event-row__sub">
                    {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} · page {page + 1} of {pageCount}
                  </span>
                  <span title={page >= pageCount - 1 ? 'Already on the last page' : undefined}><ObcButton variant="flat" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}>Next →</ObcButton></span>
                </div>
              )} />

            {selected
              ? <EventDetail key={selected.id} event={selected} canManage={canManage} policy={data?.shelvePolicy}
                  receipt={receipt?.key === selected.id ? receipt : null} onReceipt={setReceipt} />
              : <section className="cpm-surface"><EmptyState title="Select an event"
                  copy="Pick an episode in the list to read its evidence, history and actions here." /></section>}
          </div>
        </>
      )}
    </div>
  );
};

export default CpmEvents;
