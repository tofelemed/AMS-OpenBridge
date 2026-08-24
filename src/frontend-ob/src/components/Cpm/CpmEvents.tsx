'use client';

/**
 * CPLM Phase 7 — U4 Events.
 * CPA-prototype IA parity: filter bar + event list + detail aside with
 * acknowledge/shelve, wired to the real event-frame API. Severity/state
 * rendering uses the shared tone mapping (OpenBridge alert tokens), and a
 * shelve REQUIRES an expiry — the API rejects unbounded shelves because that
 * is how diagnoses get forgotten.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, KvRow, PanelHead, QueryError, TonePill, WorkspaceHeader, toneFor,
  fmtDateTime,
} from './shared';
import { PlantScopeFilter, useCpmScope } from './plantScope';
import { usePagedSlice } from '../shared/ListPager';
import { useAcknowledgeEvent, useCpmEvents, useCpmLoops, useShelveEvent } from '../../hooks/useCpm';
import type { CpmEventFrame, CpmLoop } from '../../api/cpmApi';

type FilterKey = 'all' | 'open' | 'unacknowledged' | 'acknowledged' | 'closed';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'unacknowledged', label: 'Unacknowledged' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'closed', label: 'Closed' },
];

function matches(e: CpmEventFrame, f: FilterKey): boolean {
  switch (f) {
    case 'open': return e.closed_at === null;
    case 'unacknowledged': return e.ack_state === 'UNACKNOWLEDGED' && e.closed_at === null;
    case 'acknowledged': return e.ack_state === 'ACKNOWLEDGED';
    case 'closed': return e.closed_at !== null;
    default: return true;
  }
}

/** peak confidence → CPA's severity vocabulary. */
function severityOf(e: CpmEventFrame): { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' } {
  if (e.severity) return { label: e.severity, tone: toneFor(e.severity) };
  if (e.peak_confidence >= 0.9) return { label: 'High', tone: 'bad' };
  if (e.peak_confidence >= 0.55) return { label: 'Warning', tone: 'warn' };
  return { label: 'Advisory', tone: 'muted' };
}

function stateLabel(e: CpmEventFrame): string {
  if (e.closed_at !== null) return 'Closed';
  if (e.ack_state === 'SHELVED') return 'Shelved';
  if (e.ack_state === 'ACKNOWLEDGED') return 'Acknowledged';
  return 'Unacknowledged';
}

// E2 (P2-13): the page's local formatter carried no zone label — and this page
// owns operator ack timestamps, the exact case the shared formatter exists for.
const fmt = (iso: string | null) => (iso ? fmtDateTime(iso) : '—');

/** The fetch cap; at the cap, client-side filter counts describe a slice. */
const FETCH_LIMIT = 200;

export const CpmEvents: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const filter = (params.get('filter') as FilterKey) ?? 'all';
  const selectedId = params.get('event');
  // E1: both orders are legitimate here — triage (worst first) is the right
  // default for a response queue, but "what happened lately" needs opened_at.
  // The rows were confidence-ordered under an "Opened" column with no hint.
  const sort = params.get('sort') === 'recent' ? 'recent' as const : 'triage' as const;

  // Fetch broadly (open + closed + shelved), filter client-side so tab switches
  // are instant; 30 s background refetch keeps the list current.
  const [search, setSearch] = useState('');
  const loopData = useCpmLoops().data;
  const { data, isLoading, isError, error, refetch } =
    useCpmEvents({ openOnly: false, includeShelved: true, limit: FETCH_LIMIT, sort });
  // A6.4: an event list is where people hunt, so status tabs alone were not
  // enough — scope narrows to a section/unit (event frames carry only loop_id,
  // so the loop registry supplies the location) and free text matches the loop,
  // family and diagnosis.
  const scope = useCpmScope();
  const loopIndex = useMemo(() => {
    const m = new Map<string, CpmLoop>();
    for (const l of loopData?.loops ?? []) m.set(l.loopId.toLowerCase(), l);
    return m;
  }, [loopData]);
  const events = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.events ?? [])
      .filter(e => matches(e, filter))
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
  }, [data, filter, scope, loopIndex, search]);
  // E3: at the cap the filters are counting a slice, not the fleet.
  const truncated = (data?.events.length ?? 0) >= FETCH_LIMIT;

  // E4: selection resolves against the FULL list, not the filtered one — a deep
  // link to an acknowledged event, opened while the "Unacknowledged" filter is
  // active, used to silently show a different event under that URL.
  const selected = (data?.events ?? []).find(e => String(e.id) === selectedId) ?? events[0];
  const selectionHiddenByFilter =
    !!selected && !events.some(e => e.id === selected.id);

  // Page the (filtered) event list so it isn't a 200-row scroll.
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [filter, sort]);
  const { pageCount, safePage, pageItems: pagedEvents } = usePagedSlice(events, page, PAGE_SIZE);

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Conditions, notifications, and cases"
        title="Events"
        copy="Investigate diagnosis episodes with operating context and a traceable response history. One row is one episode of one fault family — confidence changes extend it rather than duplicating it."
      />
      <PlantScopeFilter scope={scope}
        summary={
          <input className="cpm-input" style={{ minWidth: 240 }}
            placeholder="Find by loop, service, family or diagnosis"
            value={search} onChange={e => setSearch(e.target.value)} />
        } />

      <div className="cpm-filter-row">
        {FILTERS.map(f => (
          <ObcButton
            key={f.key}
            variant={filter === f.key ? 'raised' : 'normal'}
            onClick={() => setParams(p => { p.set('filter', f.key); return p; }, { replace: true })}
          >
            {f.label}
          </ObcButton>
        ))}
        <span className="cpm-field__label" style={{ alignSelf: 'center', marginLeft: 8 }}>Order</span>
        {([['triage', 'Triage (worst first)'], ['recent', 'Newest first']] as const).map(([k, label]) => (
          <ObcButton key={k} variant={sort === k ? 'raised' : 'normal'}
            onClick={() => setParams(p => { if (k === 'triage') p.delete('sort'); else p.set('sort', k); return p; }, { replace: true })}>
            {label}
          </ObcButton>
        ))}
        <span className="cpm-filter-count">
          {events.length} event(s)
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
              copy="Diagnosis episodes appear here when the gate engine reports a fault family."
            />
          )}
          {selectionHiddenByFilter && (
            <p className="cpm-copy" role="status" style={{ padding: '8px 12px' }}>
              The selected event is hidden by the current filter — its detail stays open on the right.
            </p>
          )}
          {pagedEvents.map(e => {
            const sev = severityOf(e);
            return (
              <div
                key={e.id}
                className={`cpm-event-row${selected?.id === e.id ? ' cpm-event-row--selected' : ''}`}
                onClick={() => setParams(p => { p.set('event', String(e.id)); return p; }, { replace: true })}
                role="button"
                tabIndex={0}
                aria-pressed={selected?.id === e.id}
                onKeyDown={ev => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    setParams(p => { p.set('event', String(e.id)); return p; }, { replace: true });
                  }
                }}
              >
                <span>
                  <span className="cpm-event-row__title">{e.peak_diagnosis.replace(/_/g, ' ')}</span>
                  <div className="cpm-event-row__sub">EVT-{e.id} · {e.loop_id} · {e.window_kind}</div>
                </span>
                <TonePill tone={sev.tone}>{sev.label}</TonePill>
                <span>{stateLabel(e)}</span>
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
          ? <EventDetail key={selected.id} event={selected} />
          : <section className="cpm-surface"><EmptyState title="Select an event" /></section>}
      </div>
    </div>
  );
};

// ── detail aside ───────────────────────────────────────────────────────────

const SHELVE_CHOICES = [
  { label: '1 hour', hours: 1 },
  { label: '8 hours', hours: 8 },
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 168 },
];

const EventDetail: React.FC<{ event: CpmEventFrame }> = ({ event }) => {
  const ack = useAcknowledgeEvent();
  const shelve = useShelveEvent();
  const [shelveOpen, setShelveOpen] = useState(false);
  const [note, setNote] = useState('');
  const sev = severityOf(event);
  const open = event.closed_at === null;

  const doShelve = (hours: number) => {
    const until = new Date(Date.now() + hours * 3600_000).toISOString();
    shelve.mutate({ id: event.id, until, note: note || undefined },
      { onSuccess: () => setShelveOpen(false) });
  };

  return (
    <aside className="cpm-surface">
      <PanelHead
        eyebrow={`EVT-${event.id}`}
        title={event.peak_diagnosis.replace(/_/g, ' ')}
        right={<TonePill tone={sev.tone}>{sev.label}</TonePill>}
      />
      <p className="cpm-copy">
        {event.loop_id} · opened {fmt(event.opened_at)}
        {event.closed_at ? ` · closed ${fmt(event.closed_at)}` : ' · still open'}
      </p>

      <PanelHead eyebrow="What happened" title="Episode" />
      <p className="cpm-copy">
        The {event.family.replace(/_/g, ' ').toLowerCase()} family was reported across{' '}
        {event.window_count} evaluation window(s), peaking at{' '}
        {(event.peak_confidence * 100).toFixed(0)}% confidence
        {event.last_diagnosis && event.last_diagnosis !== event.peak_diagnosis
          ? `; the latest window reports ${event.last_diagnosis.replace(/_/g, ' ')}.`
          : '.'}
      </p>

      <PanelHead eyebrow="Evidence" title="Provenance" />
      <KvRow label="Fault family">{event.family}</KvRow>
      <KvRow label="Peak confidence">{(event.peak_confidence * 100).toFixed(0)}%</KvRow>
      <KvRow label="Resolution">{event.window_kind}</KvRow>
      <KvRow label="Calculation version">{event.calculation_version ?? '—'}</KvRow>
      <KvRow label="Dynamics profile">{event.dynamics_profile_version ?? '—'}</KvRow>
      {event.acked_by && <KvRow label="Handled by">{event.acked_by} · {fmt(event.acked_at)}</KvRow>}
      {event.ack_state === 'SHELVED' && (
        <KvRow label="Shelved until">{fmt(event.shelve_until)}</KvRow>
      )}
      {event.note && <KvRow label="Note">{event.note}</KvRow>}

      {open && (
        <>
          <label className="cpm-field" style={{ marginTop: 12, minWidth: 0 }}>
            <span className="cpm-field__label">Note (optional)</span>
            <input className="cpm-input" value={note} onChange={e => setNote(e.target.value)}
              placeholder="Why this was acknowledged or shelved" />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <ObcButton variant="normal" disabled={shelve.isPending}
              onClick={() => setShelveOpen(s => !s)}>
              Shelve…
            </ObcButton>
            <ObcButton variant="raised" disabled={ack.isPending || event.ack_state === 'ACKNOWLEDGED'}
              onClick={() => ack.mutate({ id: event.id, note: note || undefined }, { onSuccess: () => setNote('') })}>
              {ack.isPending ? 'Acknowledging…' : 'Acknowledge'}
            </ObcButton>
          </div>
          {shelveOpen && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {SHELVE_CHOICES.map(c => (
                <ObcButton key={c.hours} variant="normal" disabled={shelve.isPending}
                  onClick={() => doShelve(c.hours)}>
                  {c.label}
                </ObcButton>
              ))}
              <span className="cpm-copy">A shelve always expires; the episode returns to the list afterwards.</span>
            </div>
          )}
          {(ack.isError || shelve.isError) && (
            <p className="cpm-field__error">{String(ack.error ?? shelve.error)}</p>
          )}
        </>
      )}
    </aside>
  );
};

export default CpmEvents;
