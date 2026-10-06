'use client';

/**
 * CPLM Phase 7 — U4 Events.
 * CPA-prototype IA parity: filter bar + event list + detail aside with
 * acknowledge/shelve, wired to the real event-frame API. Severity/state
 * rendering uses the shared tone mapping (OpenBridge alert tokens), and a
 * shelve REQUIRES an expiry — the API rejects unbounded shelves because that
 * is how diagnoses get forgotten.
 *
 * 2026-09-20 (cpa-ui-fix-plan Phase 6): the page reads `?loop=` and asks the
 * API for that loop's episodes (one request either way, never an extra one);
 * every loop id is a route to the loop hub; a shelf is shown with its real
 * expiry state (events/shelfState) and the list can be filtered to active or
 * expired shelves; the detail aside and the shelve panel own their own files.
 *
 * CHG-063: the list is filtered, searched and paged on the SERVER (`/events/page`). It used to fetch one 200-row
 * "worst first" slice and filter that in the browser, so tabs, search, plant scope and `?event=` links only reached
 * the slice. A deep-linked episode that is not on the current page is read by id (`/events/{id}`).
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcInputChip } from '@oicl/openbridge-webcomponents-react/components/input-chip/input-chip';
import { ObcToggleButtonGroup } from '@oicl/openbridge-webcomponents-react/components/toggle-button-group/toggle-button-group';
import { ObcToggleButtonOption } from '@oicl/openbridge-webcomponents-react/components/toggle-button-option/toggle-button-option';
import { EmptyState, QueryError, TonePill, WorkspaceHeader, fmtDateTime } from './shared';
import { LoopContextBar } from './context/LoopContextBar';
import { PlantScopeFilter, useCpmScope } from './plantScope';
import { useAuthStore } from '../../store/authStore';
import { availabilityPill } from './events/eventsState';
import {
  EVENT_FILTERS as FILTERS, isEventFilterKey as isFilterKey, stateView,
  type EventFilterKey as FilterKey,
} from './events/shelfState';
import { ConditionsPanel } from './events/ConditionsPanel';
import { useCpmConditions } from './events/useConditions';
import EventDetail, { severityOf } from './events/EventDetail';
import { explorerHref } from './cpaHref';
import { diagnosisLabel } from './vocabulary';
import { useDebounced, useEventById, useEventPage } from './events/useEventPage';
import { ApiError } from '../../api/apiFetch';

// E2 (P2-13): the page's local formatter carried no zone label — and this page
// owns operator ack timestamps, the exact case the shared formatter exists for.
const fmt = (iso: string | null) => (iso ? fmtDateTime(iso) : '—');

const PAGE_SIZE = 20;

export const CpmEvents: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // Validated, not cast: `?filter=bogus` satisfied the cast, fell through
  // `matches` to "show everything", and left no chip looking active — the list
  // said one thing and the controls said another.
  const filterParam = params.get('filter');
  const filter: FilterKey = isFilterKey(filterParam) ? filterParam : 'all';
  const selectedId = params.get('event');
  // E1: both orders are legitimate here — triage (worst first) is the right
  // default for a response queue, but "what happened lately" needs opened_at.
  const sort = params.get('sort') === 'recent' ? 'recent' as const : 'triage' as const;
  // Phase 6: a loop in the URL scopes the REQUEST (the API filters by loopId),
  // so arriving from a loop page costs the same single call as the fleet view.
  const loopParam = params.get('loop')?.trim() || undefined;
  const canManage = useAuthStore(s => s.hasPermission('cpm.manage'));

  // CHG-063: every filter is a request parameter; typing is debounced into one request.
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const scope = useCpmScope();
  const conditions = useCpmConditions(scope.params, false);
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [filter, sort, loopParam, q, scope.site, scope.area, scope.unit]);
  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useEventPage({
    state: filter, loopId: loopParam, q: q || undefined, ...scope.params, sort, page: page + 1, pageSize: PAGE_SIZE,
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

  const select = (id: number) =>
    // replace: picking a row is in-page selection, not a page visit.
    setParams(p => { p.set('event', String(id)); return p; }, { replace: true });
  const openLoop = (loopId: string) => navigate(explorerHref(loopId, { tab: 'Summary' }));

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        page="/cpm/events"
        title="Loop events"
        copy="Investigate diagnosis episodes with operating context and a traceable response history. One row is one episode of one fault family — a change in its evidence score extends it rather than duplicating it."
      />
      <LoopContextBar loopId={loopParam} period={{ label: 'All episodes of this loop' }} />
      <PlantScopeFilter scope={scope}
        summary={scope.active ? `${total} matching event(s)` : null} />

      <div className="cpm-filter-row">
        <ObcToggleButtonGroup
          value={filter}
          aria-label="Event state"
          onValue={(e: CustomEvent<{ value: string }>) => {
            // Same empty-first-emit guard as the other segmented groups.
            if (isFilterKey(e.detail.value)) {
              const v = e.detail.value;
              setParams(p => { p.set('filter', v); return p; }, { replace: true });
            }
          }}
        >
          {FILTERS.map(f => (
            <ObcToggleButtonOption key={f.key} value={f.key}>
              {f.label}{data ? ` (${data.counts[f.key] ?? 0})` : ''}
            </ObcToggleButtonOption>
          ))}
        </ObcToggleButtonGroup>

        <label className="cpm-field cpm-field--compact">
          <span className="cpm-field__label">Order</span>
          <ObcToggleButtonGroup
            value={sort}
            onValue={(e: CustomEvent<{ value: string }>) => {
              const v = e.detail.value;
              if (v !== 'triage' && v !== 'recent') return;
              setParams(p => {
                if (v === 'triage') p.delete('sort'); else p.set('sort', v);
                return p;
              }, { replace: true });
            }}
          >
            <ObcToggleButtonOption value="triage">Triage</ObcToggleButtonOption>
            <ObcToggleButtonOption value="recent">Newest</ObcToggleButtonOption>
          </ObcToggleButtonGroup>
        </label>

        <label className="cpm-field cpm-field--compact">
          <span className="cpm-field__label">Find</span>
          <input className="cpm-input" style={{ minWidth: 240 }}
            placeholder="loop, service, family or diagnosis"
            value={search} onChange={e => setSearch(e.target.value)} />
        </label>

        {loopParam && (
          <ObcInputChip label={`Loop ${loopParam}`} showIcon
            onRemoveChip={() => setParams(p => { p.delete('loop'); return p; }, { replace: true })} />
        )}

        <span className="cpm-filter-count">
          {total} event(s){loopParam ? ` for ${loopParam}` : ''}{q ? ` matching “${q}”` : ''}
          {sort === 'recent' ? ' · newest first' : ' · open first, highest evidence score first'}
        </span>
      </div>

      <div className="cpm-grid-2">
        <section className="cpm-surface" style={{ padding: 0 }}>
          <div className="cpm-event-head">
            <span>Event</span><span>Severity</span><span>State</span><span>Opened</span>
          </div>
          {isLoading && <EmptyState title="Loading events…" />}
          {isError && <QueryError title="Events unavailable" error={error} retry={() => void refetch()} />}
          {!isLoading && !isError && total === 0 && (
            <EmptyState
              title="No events in this view"
              copy={q
                ? `No episode matches “${q}” under this filter — search covers loop tag, loop name, family and diagnosis.`
                : loopParam
                  ? `No episode of ${loopParam} matches this filter.`
                  : 'Diagnosis episodes appear here when the gate engine reports a fault family.'}
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
          {events.map(e => {
            const sev = severityOf(e);
            const st = stateView(e, now);
            const isSelected = selected?.id === e.id;
            return (
              // Two controls, siblings: the episode selects (in-page), the loop id routes.
              <div key={e.id} className={`cpm-event-row${isSelected ? ' cpm-event-row--selected' : ''}`}>
                <div className="cpm-event-row__main">
                  <button type="button" className="cpm-event-row__select" aria-pressed={isSelected}
                    aria-label={`Show episode EVT-${e.id}, ${diagnosisLabel(e.peak_diagnosis)}`}
                    onClick={() => select(e.id)}>
                    <span className="cpm-event-row__title">{diagnosisLabel(e.peak_diagnosis)}</span>
                    <span className="cpm-event-row__sub">EVT-{e.id} · {e.window_kind}</span>
                  </button>
                  <ObcButton variant="flat" title={`Open ${e.loop_id} in the Loop Explorer`}
                    onClick={() => openLoop(e.loop_id)}>
                    {e.loop_id} ›
                  </ObcButton>
                </div>
                <TonePill tone={sev.tone}>{sev.label}</TonePill>
                <span className="cpm-event-row__states">
                  <TonePill tone={st.tone}>{st.label}</TonePill>
                  {(() => { const a = availabilityPill(e); return a ? <TonePill tone={a.tone}>{a.label}</TonePill> : null; })()}
                </span>
                <span className="cpm-event-row__sub">{fmt(e.opened_at)}</span>
              </div>
            );
          })}
          {pageCount > 1 && (
            <div className="cpm-pager" aria-busy={isPlaceholderData}>
              <ObcButton variant="flat" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>← Prev</ObcButton>
              <span className="cpm-event-row__sub">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} · page {page + 1} of {pageCount}
              </span>
              <ObcButton variant="flat" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}>Next →</ObcButton>
            </div>
          )}
        </section>

        {selected
          ? <EventDetail key={selected.id} event={selected} canManage={canManage} policy={data?.shelvePolicy} />
          : <section className="cpm-surface"><EmptyState title="Select an event" /></section>}
      </div>

      {/* audit F22: the fast G10/G11 conditions (minutes) beside the fused episodes (hours) */}
      <ConditionsPanel conditions={conditions.data?.conditions ?? []} isLoading={conditions.isLoading}
        error={conditions.isError ? conditions.error : null} onRetry={() => void conditions.refetch()} />
    </div>
  );
};

export default CpmEvents;
