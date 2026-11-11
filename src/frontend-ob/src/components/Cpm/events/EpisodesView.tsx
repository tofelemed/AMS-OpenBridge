/**
 * Loop Events › Episodes. CHG-063: the list is filtered, searched and paged on the SERVER (`/events/page`); a deep-linked
 * episode that is not on the current page is read by id (`/events/{id}`). Phase 6: `?loop=` scopes the request. CHG-167 (owner
 * review, the approved sample): the filter row inside the list card (EpisodeFilters), no "n event(s)" note and no list title,
 * the shared pager centred under the rows, the selected episode in the panel beside the list (a drawer below 1280 px, opened by
 * a row or a link that names an episode). No panel while the list is empty.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../../../api/apiFetch';
import type { CpmConditionScope } from '../../../api/cpm/conditions';
import { Pagination } from '../../../ui/forms/Pagination';
import type { Receipt } from '../ActionReceipt';
import { EmptyState, QueryError } from '../shared';
import { performanceHref } from '../cpaHref';
import EventDetail from './EventDetail';
import { EpisodeFilters, type EventSort } from './EpisodeFilters';
import { EpisodeList } from './EpisodeList';
import { SEVERITY_FILTERS, isEventFilterKey, type EventFilterKey } from './shelfState';
import { useDebounced, useEventById, useEventPage } from './useEventPage';

const PAGE_SIZE = 10;

export const EpisodesView: React.FC<{ scope: CpmConditionScope; canManage: boolean }> = ({ scope, canManage }) => {
  const [params, setParams] = useSearchParams();
  const edit = (change: (p: URLSearchParams) => void) => setParams(p => { change(p); return p; }, { replace: true });
  // Validated, not cast: `?filter=bogus` falls back to the default rather than leaving no control looking active.
  const filterParam = params.get('filter');
  const filter: EventFilterKey = isEventFilterKey(filterParam) ? filterParam : 'open';
  const severity = SEVERITY_FILTERS.find(s => s.value === params.get('severity'))?.value;
  // E1: triage (worst first) is the right default for a response queue, but "what happened lately" needs opened_at.
  const sort: EventSort = params.get('sort') === 'recent' ? 'recent' : 'triage';
  const loopParam = params.get('loop')?.trim() || undefined;
  const selectedId = params.get('event');

  // CHG-063: every filter is a request parameter; typing is debounced into one request.
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [filter, severity, sort, loopParam, q, scope.site, scope.area, scope.unit]);
  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useEventPage({
    state: filter, severity, loopId: loopParam, q: q || undefined, ...scope, sort, page, pageSize: PAGE_SIZE,
  });
  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const pageCount = data?.pageCount ?? 1;
  // The clock the shelf states are judged against; the 30 s refetch re-renders often enough.
  const now = Date.now();

  // A deep link resolves on the page first, then by id: an episode outside this page (another filter, a search, or simply
  // ranked below it) still opens under its own URL — never a different episode in its place.
  const selectedNum = selectedId && /^\d+$/.test(selectedId) ? Number(selectedId) : null;
  const onPage = selectedNum !== null ? events.find(e => e.id === selectedNum) : undefined;
  const lookup = useEventById(selectedNum, !!data && !onPage);
  const missing = !!selectedId && (selectedNum === null || (lookup.error instanceof ApiError && lookup.error.status === 404));
  const selected = onPage ?? lookup.data ?? (selectedNum !== null && lookup.isLoading ? undefined : events[0]);
  const offPage = !onPage && !!lookup.data;

  // CHG-098 (SME review 2 #27): the last action's receipt, held here so it survives the detail remounting when the action
  // moves the episode off this list; shown only beside the episode it belongs to.
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  // Below 1280 px the panel is a drawer: a link that names an episode opens it, once per episode named (Close stays closed).
  const [drawer, setDrawer] = useState(() => params.has('event'));
  const seen = useRef(selectedId);
  useEffect(() => {
    if (selectedId && selectedId !== seen.current) { seen.current = selectedId; setDrawer(true); }
  }, [selectedId]);
  // replace: picking a row is in-page selection, not a page visit.
  const select = (id: number) => { edit(p => p.set('event', String(id))); setDrawer(true); };
  const showAll = () => { setSearch(''); edit(p => { p.set('filter', 'all'); p.delete('severity'); p.delete('loop'); }); };
  const narrowed = !!q || !!loopParam || !!severity || filter !== 'all';

  return (
    <div className="cpm-master-detail">
      <section className="cpm-surface cpm-events-list cpm-episodes" aria-label="Episodes">
        <EpisodeFilters search={search} onSearch={setSearch} filter={filter} onFilter={f => edit(p => p.set('filter', f))}
          counts={data?.counts} severity={severity}
          onSeverity={s => edit(p => { if (s) p.set('severity', s); else p.delete('severity'); })}
          sort={sort} onSort={v => edit(p => { if (v === 'triage') p.delete('sort'); else p.set('sort', v); })}
          loop={loopParam} onClearLoop={() => edit(p => p.delete('loop'))} />
        <EpisodeList events={events} selectedId={selected?.id} now={now} onSelect={select} notices={<>
          {isLoading && <EmptyState title="Loading events…" />}
          {isError && <QueryError title="Events unavailable" error={error} retry={() => void refetch()} />}
          {!isLoading && !isError && total === 0 && (
            <EmptyState
              title={q ? `No episode matches “${q}”`
                : loopParam ? `No episode of ${loopParam} matches this filter` : 'No episode matches this filter and plant scope'}
              // CHG-098 (SME review 2 #29): a way out — clear what narrows the list, or see every loop's current result.
              action={narrowed ? { label: 'Show all events', onClick: showAll } : undefined}
              next={!narrowed ? [{ label: 'Current results in Performance', to: performanceHref() }] : undefined} />
          )}
          {missing && (
            <p className="cpm-copy cpm-events-notice" role="status">
              {selectedNum !== null ? `EVT-${selectedNum}` : `Event ${selectedId}`} does not exist (retention may have removed it). Showing the first episode.
            </p>
          )}
          {offPage && selected && (
            <p className="cpm-copy cpm-events-notice" role="status">EVT-{selected.id} is not in this list; its details are open.</p>
          )}
        </>} />
        {pageCount > 1 && (
          <div className="cpm-events-pager" aria-busy={isPlaceholderData}>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} label="Episode pages" />
          </div>
        )}
      </section>
      {selected && (
        <EventDetail key={selected.id} event={selected} canManage={canManage} policy={data?.shelvePolicy}
          receipt={receipt?.key === selected.id ? receipt : null} onReceipt={setReceipt}
          open={drawer} onClose={() => setDrawer(false)} />
      )}
    </div>
  );
};

export default EpisodesView;
