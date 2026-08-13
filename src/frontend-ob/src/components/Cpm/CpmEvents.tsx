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
  EmptyState, KvRow, PanelHead, TonePill, WorkspaceHeader, toneFor,
} from './shared';
import { useAcknowledgeEvent, useCpmEvents, useShelveEvent } from '../../hooks/useCpm';
import type { CpmEventFrame } from '../../api/cpmApi';

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

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const CpmEvents: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const filter = (params.get('filter') as FilterKey) ?? 'all';
  const selectedId = params.get('event');

  // Fetch broadly (open + closed + shelved), filter client-side so tab switches
  // are instant; 30 s background refetch keeps the list current.
  const { data, isLoading, error } = useCpmEvents({ openOnly: false, includeShelved: true, limit: 200 });
  const events = useMemo(
    () => (data?.events ?? []).filter(e => matches(e, filter)),
    [data, filter]);

  const selected = events.find(e => String(e.id) === selectedId) ?? events[0];

  // Page the (filtered) event list so it isn't a 200-row scroll. Selection still
  // resolves against the full list, so the detail pane works across pages.
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [filter]);
  const pageCount = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedEvents = events.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Conditions, notifications, and cases"
        title="Events"
        copy="Investigate diagnosis episodes with operating context and a traceable response history. One row is one episode of one fault family — confidence changes extend it rather than duplicating it."
      />

      <div className="cpm-filter-row">
        {FILTERS.map(f => (
          <ObcButton
            key={f.key}
            variant={filter === f.key ? 'raised' : 'normal'}
            onClick={() => setParams(p => { p.set('filter', f.key); return p; })}
          >
            {f.label}
          </ObcButton>
        ))}
        <span className="cpm-filter-count">{events.length} event(s)</span>
      </div>

      <div className="cpm-grid-2">
        <section className="cpm-surface" style={{ padding: 0 }}>
          <div className="cpm-event-head">
            <span>Event</span><span>Severity</span><span>State</span><span>Opened</span>
          </div>
          {isLoading && <EmptyState title="Loading events…" />}
          {error != null && <EmptyState title="Events unavailable" copy={String(error)} />}
          {!isLoading && events.length === 0 && (
            <EmptyState
              title="No events in this view"
              copy="Diagnosis episodes appear here when the gate engine reports a fault family."
            />
          )}
          {pagedEvents.map(e => {
            const sev = severityOf(e);
            return (
              <div
                key={e.id}
                className={`cpm-event-row${selected?.id === e.id ? ' cpm-event-row--selected' : ''}`}
                onClick={() => setParams(p => { p.set('event', String(e.id)); return p; })}
                role="button"
                tabIndex={0}
                onKeyDown={ev => { if (ev.key === 'Enter') setParams(p => { p.set('event', String(e.id)); return p; }); }}
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
