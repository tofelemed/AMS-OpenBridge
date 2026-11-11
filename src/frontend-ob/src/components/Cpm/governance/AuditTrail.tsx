'use client';

/**
 * The one audit trail (page-plan.md, decision 4): Governance and the Administration Audit log read the same
 * records from audit-service. A row opens its event, where the hash and correlation id are.
 *
 * Entity, user and event type ask the server, which matches them exactly, so they reach older records.
 * Find searches only the rows fetched. The event types come from the records: the old list named
 * ALARM_ACKNOWLEDGED, ALARM_SHELVED, SECURITY and SYSTEM, which no record uses, so each returned nothing.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ApiError } from '../../../api/apiFetch';
import type { AuditEventRow } from '../../../api/auditApi';
import { useAuditEvents } from '../../../hooks/useAudit';
import { useCpmLoops } from '../../../hooks/useCpm';
import { useDebounce } from '../../../hooks/useDebounce';
import { useAuthStore } from '../../../store/authStore';
import '../../../styles/cpm-audit.css';
import { Toggletip } from '../../../ui/Toggletip';
import { usePagedSlice } from '../../shared/ListPager';
import { activeZone } from '../../../cpa/activeZone';
import { EmptyState, QueryError, TonePill, fmtDateTime } from '../shared';
import { AuditEventDialog } from './AuditEventDialog';
import { auditLabel, entityLabel, eventTone, isSingleLoop } from './auditLabels';

export { auditLabel };

/** Rows fetched per request, and rows rendered per page of that fetch. */
const AUDIT_TAKE = 200;
const AUDIT_PAGE_SIZE = 25;

const ENTITY_FILTERS = [
  { key: '', label: 'All entities' },
  { key: 'CpmLoop', label: 'CPM loops' },
  { key: 'CpmEventFrame', label: 'CPM events' },
  { key: 'Display', label: 'HMI displays' },
];

/** Only a loop event needs the registry, so only its dialog asks for it. */
const OpenedEvent: React.FC<{ event: AuditEventRow; onClose: () => void }> = ({ event, onClose }) => {
  const loops = useCpmLoops();
  return <AuditEventDialog event={event} onClose={onClose} loopIds={loops.data?.loops.map(l => l.loopId)} />;
};

/** The zone every time on this page is shown in. */
const zoneName = () => activeZone() ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

export const AuditTrail: React.FC = () => {
  const hasPermission = useAuthStore(s => s.hasPermission);
  const canRead = hasPermission('admin.audit.view');

  const [entityType, setEntityType] = useState('');
  const [eventType, setEventType] = useState('');
  const [user, setUser] = useState('');
  const userId = useDebounce(user.trim(), 400);
  const [search, setSearch] = useState('');
  const audit = useAuditEvents(
    { entityType: entityType || undefined, eventType: eventType || undefined, userId: userId || undefined, take: AUDIT_TAKE },
    30_000, canRead,
  );
  const [opened, setOpened] = useState<AuditEventRow | null>(null);

  // Every type seen so far: a narrowed answer holds one type, and the others must stay on offer.
  const [types, setTypes] = useState<string[]>([]);
  useEffect(() => {
    const seen = audit.data?.events.map(e => e.eventType) ?? [];
    setTypes(known => (seen.every(t => known.includes(t)) ? known : [...new Set([...known, ...seen])].sort()));
  }, [audit.data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const events = audit.data?.events ?? [];
    if (!q) return events;
    return events.filter(e => [e.userId, e.eventType, e.entityType, e.entityId].some(v => (v ?? '').toLowerCase().includes(q)));
  }, [audit.data, search]);

  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [entityType, eventType, userId, search]);
  const { pageCount, safePage, pageItems } = usePagedSlice(rows, page, AUDIT_PAGE_SIZE);

  // Typed check: a message that embeds the request URL must not read as a 403 because the URL holds "403".
  const forbidden = audit.isError && audit.error instanceof ApiError && audit.error.status === 403;
  const truncated = (audit.data?.total ?? 0) > (audit.data?.events.length ?? 0);
  const filtered = !!(entityType || eventType || userId || search.trim());

  return (
    <section className="cpm-surface" aria-label="Audit events">
      <div className="cpm-toolbar cpm-audit__row">
        <label className="cpm-field">
          <span className="cpm-field__label">Entity</span>
          <select className="cpm-select" value={entityType} onChange={e => setEntityType(e.target.value)}>
            {ENTITY_FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>
        <label className="cpm-field cpm-audit__find">
          <span className="cpm-field__label">Find event</span>
          <input className="cpm-input" type="search" placeholder="Searches the rows fetched"
            value={search} onChange={e => setSearch(e.target.value)} />
        </label>
        <label className="cpm-field cpm-audit__user">
          <span className="cpm-field__label">User</span>
          <input className="cpm-input" placeholder="Exact user name" value={user} onChange={e => setUser(e.target.value)} />
        </label>
        <label className="cpm-field cpm-audit__type">
          <span className="cpm-field__label">Event type</span>
          <select className="cpm-select" value={eventType} onChange={e => setEventType(e.target.value)}>
            <option value="">All events</option>
            {types.map(t => <option key={t} value={t}>{auditLabel(t)}</option>)}
          </select>
        </label>
        <Toggletip variant="how-to" label="How these filters differ">
          <p>User and Event type ask the server, so they reach older records. Find searches only the rows fetched.</p>
        </Toggletip>
      </div>

      {!canRead && (
        <EmptyState title="Audit reads require the admin.audit.view permission"
          copy="Your session does not carry it; the trail itself keeps recording regardless." />
      )}
      {canRead && audit.isLoading && <EmptyState title="Loading audit trail…" />}
      {canRead && forbidden && (
        <EmptyState title="Audit service refused the read (403)"
          copy="The token was accepted by the app but not by audit-service. Sign in again to refresh your permissions." />
      )}
      {canRead && audit.isError && !forbidden && (
        <QueryError title="Audit service unreachable" error={audit.error} retry={() => void audit.refetch()} />
      )}
      {canRead && audit.data && rows.length === 0 && (filtered
        ? <EmptyState title="No audit events match" copy="The trail records logins, display changes and CPM governance actions." />
        : <EmptyState title="No governance events recorded yet" copy="CPM onboarding, ack/shelve, recompute and display changes emit here from now on." />
      )}

      {rows.length > 0 && (
        <div className="cpm-audit__scroll" role="region" aria-label="Audit records" tabIndex={0}>
          <table className="cpm-signal-table cpm-audit__table">
            <thead>
              <tr>{['When / actor', 'Action', 'Entity'].map(h => <th key={h} scope="col">{h}</th>)}</tr>
            </thead>
            <tbody>
              {pageItems.map(e => (
                <tr key={e.eventId}>
                  <td title={e.timestampUtc}>
                    <button type="button" className="cpm-audit-open" onClick={() => setOpened(e)}>{fmtDateTime(e.timestampUtc)}</button>
                    <div className="cpm-event-row__sub">{e.userId || 'system'}</div>
                  </td>
                  <td><span title={e.eventType}><TonePill tone={eventTone(e.eventType)}>{auditLabel(e.eventType)}</TonePill></span></td>
                  <td><span title={e.entityType}>{entityLabel(e.entityType)}</span><div className="cpm-event-row__sub cpm-mono">{e.entityId}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {audit.data && audit.data.events.length > 0 && (
        <div className="cpm-pager">
          {pageCount > 1 && (
            <span title={safePage === 0 ? 'Already on the first page' : undefined}>
              <ObcButton variant="flat" disabled={safePage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>← Prev</ObcButton>
            </span>
          )}
          <span className="cpm-event-row__sub">
            {pageCount > 1 && `${safePage * AUDIT_PAGE_SIZE + 1}–${Math.min((safePage + 1) * AUDIT_PAGE_SIZE, rows.length)} of ${rows.length} fetched · page ${safePage + 1} of ${pageCount} · `}
            {search.trim() ? `${rows.length} matching “${search.trim()}” · ` : ''}
            {truncated
              ? `newest ${audit.data.events.length} of ${audit.data.total}, older entries are not fetched`
              : `${audit.data.total} events`}
            {` · times in ${zoneName()}`}
          </span>
          {pageCount > 1 && (
            <span title={safePage >= pageCount - 1 ? 'Already on the last page' : undefined}>
              <ObcButton variant="flat" disabled={safePage >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}>Next →</ObcButton>
            </span>
          )}
        </div>
      )}
      {opened && (isSingleLoop(opened.entityType, opened.entityId)
        ? <OpenedEvent event={opened} onClose={() => setOpened(null)} />
        : <AuditEventDialog event={opened} loopIds={undefined} onClose={() => setOpened(null)} />)}
    </section>
  );
};

export default AuditTrail;
