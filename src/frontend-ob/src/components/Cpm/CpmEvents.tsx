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
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcInputChip } from '@oicl/openbridge-webcomponents-react/components/input-chip/input-chip';
import { ObcToggleButtonGroup } from '@oicl/openbridge-webcomponents-react/components/toggle-button-group/toggle-button-group';
import { ObcToggleButtonOption } from '@oicl/openbridge-webcomponents-react/components/toggle-button-option/toggle-button-option';
import { EmptyState, QueryError, TonePill, WorkspaceHeader, fmtDateTime } from './shared';
import { PlantScopeFilter, useCpmScope } from './plantScope';
import { usePagedSlice } from '../shared/ListPager';
import { useCpmEvents, useCpmLoops } from '../../hooks/useCpm';
import { useAuthStore } from '../../store/authStore';
import type { CpmLoop } from '../../api/cpmApi';
import { availabilityPill } from './events/eventsState';
import {
  EVENT_FILTERS as FILTERS, isEventFilterKey as isFilterKey, matchesEventFilter as matches, stateView,
  type EventFilterKey as FilterKey,
} from './events/shelfState';
import { ConditionsPanel } from './events/ConditionsPanel';
import { useCpmConditions } from './events/useConditions';
import EventDetail, { severityOf } from './events/EventDetail';
import { explorerHref } from './cpaHref';

// E2 (P2-13): the page's local formatter carried no zone label — and this page
// owns operator ack timestamps, the exact case the shared formatter exists for.
const fmt = (iso: string | null) => (iso ? fmtDateTime(iso) : '—');

/** The fetch cap; at the cap, client-side filter counts describe a slice. */
const FETCH_LIMIT = 200;

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

  // Fetch broadly (open + closed + shelved), filter client-side so tab switches
  // are instant; 30 s background refetch keeps the list current.
  const [search, setSearch] = useState('');
  const loopData = useCpmLoops().data;
  const { data, isLoading, isError, error, refetch } =
    useCpmEvents({ loopId: loopParam, openOnly: false, includeShelved: true, limit: FETCH_LIMIT, sort });
  // A6.4: an event list is where people hunt, so status tabs alone were not
  // enough — scope narrows to a section/unit (event frames carry only loop_id,
  // so the loop registry supplies the location) and free text matches the loop,
  // family and diagnosis.
  const scope = useCpmScope();
  const conditions = useCpmConditions(scope.params, false);
  const loopIndex = useMemo(() => {
    const m = new Map<string, CpmLoop>();
    for (const l of loopData?.loops ?? []) m.set(l.loopId.toLowerCase(), l);
    return m;
  }, [loopData]);
  // The clock the shelf states are judged against; the 30 s refetch re-renders often enough.
  const now = Date.now();
  const events = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.events ?? [])
      .filter(e => matches(e, filter, now))
      .filter(e => {
        if (!scope.active) return true;
        const l = loopIndex.get(e.loop_id.toLowerCase());
        // An event whose loop is not in the registry cannot be placed; hide it
        // under a scope rather than pretend it belongs to the selected unit.
        return l ? scope.matches(l) : false;
      })
      .filter(e => !q
        || e.loop_id.toLowerCase().includes(q)
        || (e.family ?? '').toLowerCase().includes(q)
        || (e.peak_diagnosis ?? '').toLowerCase().includes(q)
        || (loopIndex.get(e.loop_id.toLowerCase())?.displayName ?? '').toLowerCase().includes(q));
  }, [data, filter, scope, loopIndex, search, now]);
  // E3: at the cap the filters are counting a slice, not the fleet.
  const truncated = (data?.events.length ?? 0) >= FETCH_LIMIT;

  // E4: selection resolves against the FULL list, not the filtered one — a deep
  // link to an acknowledged event, opened while the "Unacknowledged" filter is
  // active, used to silently show a different event under that URL.
  const selected = (data?.events ?? []).find(e => String(e.id) === selectedId) ?? events[0];
  const selectionHiddenByFilter =
    !!selected && !events.some(e => e.id === selected.id);
  // Every sibling screen says when a deep link fell back; this one silently
  // showed a different episode under a URL naming a missing one.
  const selectionFellBack = !!selectedId && !!selected
    && String(selected.id) !== selectedId;

  // Page the (filtered) event list so it isn't a 200-row scroll.
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [filter, sort, loopParam]);
  const { pageCount, safePage, pageItems: pagedEvents } = usePagedSlice(events, page, PAGE_SIZE);

  const select = (id: number) =>
    // replace: picking a row is in-page selection, not a page visit.
    setParams(p => { p.set('event', String(id)); return p; }, { replace: true });
  const openLoop = (loopId: string) => navigate(explorerHref(loopId, { tab: 'Summary' }));

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        page="/cpm/events"
        title="Loop events"
        copy="Investigate diagnosis episodes with operating context and a traceable response history. One row is one episode of one fault family — confidence changes extend it rather than duplicating it."
      />
      <PlantScopeFilter scope={scope}
        summary={scope.active ? `${events.length} matching event(s)` : null} />

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
            <ObcToggleButtonOption key={f.key} value={f.key}>{f.label}</ObcToggleButtonOption>
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
          {events.length} event(s){loopParam ? ` for ${loopParam}` : ''}
          {truncated ? ` · showing the ${sort === 'recent' ? 'newest' : 'highest-priority'} ${FETCH_LIMIT} — counts describe this slice, not the fleet` : ''}
        </span>
      </div>

      <div className="cpm-grid-2">
        <section className="cpm-surface" style={{ padding: 0 }}>
          <div className="cpm-event-head">
            <span>Event</span><span>Severity</span><span>State</span><span>Opened</span>
          </div>
          {isLoading && <EmptyState title="Loading events…" />}
          {isError && <QueryError title="Events unavailable" error={error} retry={() => void refetch()} />}
          {!isLoading && !isError && events.length === 0 && (
            <EmptyState
              title="No events in this view"
              copy={loopParam
                ? `No episode of ${loopParam} matches this filter.`
                : 'Diagnosis episodes appear here when the gate engine reports a fault family.'}
            />
          )}
          {selectionFellBack && (
            <p className="cpm-copy" role="status" style={{ padding: '8px 12px' }}>
              Event {selectedId} is not in the fetched set — showing the first event in this
              view instead.
            </p>
          )}
          {selectionHiddenByFilter && (
            <p className="cpm-copy" role="status" style={{ padding: '8px 12px' }}>
              The selected event is hidden by the current filter — its detail stays open on the right.
            </p>
          )}
          {pagedEvents.map(e => {
            const sev = severityOf(e);
            const st = stateView(e, now);
            const isSelected = selected?.id === e.id;
            return (
              // Two controls, siblings: the episode selects (in-page), the loop id routes.
              <div key={e.id} className={`cpm-event-row${isSelected ? ' cpm-event-row--selected' : ''}`}>
                <div className="cpm-event-row__main">
                  <button type="button" className="cpm-event-row__select" aria-pressed={isSelected}
                    aria-label={`Show episode EVT-${e.id}, ${e.peak_diagnosis.replace(/_/g, ' ')}`}
                    onClick={() => select(e.id)}>
                    <span className="cpm-event-row__title">{e.peak_diagnosis.replace(/_/g, ' ')}</span>
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
            <div className="cpm-pager">
              <ObcButton variant="flat" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}>← Prev</ObcButton>
              <span className="cpm-event-row__sub">Page {safePage + 1} of {pageCount}</span>
              <ObcButton variant="flat" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}>Next →</ObcButton>
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
