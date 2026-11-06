'use client';

/**
 * The one audit trail (page-plan.md, decision 4). Governance events and the Audit log read the same
 * records from audit-service, so this view keeps everything from both: entity buttons and free text,
 * user and event type, all six columns, the integrity line and the paging statements.
 *
 * Entity, user and event type ask the server, which matches them exactly, so they reach older records.
 * Find searches only the rows fetched. The event types come from the records: the old list named
 * ALARM_ACKNOWLEDGED, ALARM_SHELVED, SECURITY and SYSTEM, which no record uses, so each returned nothing.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ApiError } from '../../../api/apiFetch';
import { useAuditEvents, useVerifyAuditChain } from '../../../hooks/useAudit';
import { useDebounce } from '../../../hooks/useDebounce';
import { useAuthStore } from '../../../store/authStore';
import '../../../styles/cpm-audit.css';
import { Toggletip } from '../../../ui/Toggletip';
import { usePagedSlice } from '../../shared/ListPager';
import { ReasonedButton } from '../ReasonedButton';
import { EmptyState, PanelHead, QueryError, TonePill, fmtDateTime } from '../shared';
import { codeLabel } from '../vocabulary';

/** Rows fetched per request, and rows rendered per page of that fetch. */
const AUDIT_TAKE = 200;
const AUDIT_PAGE_SIZE = 25;

const ENTITY_FILTERS = [
  { key: '', label: 'All entities' },
  { key: 'CpmLoop', label: 'CPM loops' },
  { key: 'CpmEventFrame', label: 'CPM events' },
  { key: 'Display', label: 'HMI displays' },
];

/** Audit records name things in code. The code itself stays on hover. */
const ENTITY_LABEL: Readonly<Record<string, string>> = {
  CpmLoop: 'CPM loop', CpmEventFrame: 'CPM event', Display: 'HMI display', RolePermissions: 'Role permissions',
  'data-source-config': 'Data source', gate_config_bundle: 'Gate configuration bundle', config_deployment: 'Configuration deployment',
};

/** Acronyms stay upper case, and a dotted code reads as words. */
export const auditLabel = (code: string | null | undefined): string => {
  const text = code?.includes('.') ? code.replace(/\./g, ' ').replace(/^./, c => c.toUpperCase()) : codeLabel(code);
  return text.replace(/\bCpm\b/g, 'CPM').replace(/\bRbac\b/g, 'RBAC');
};

const eventTone = (t: string): 'good' | 'warn' | 'bad' | 'muted' => {
  if (t.includes('DELETED')) return 'bad';
  if (t.includes('SHELVED')) return 'warn';
  if (t.includes('ACTIVATED') || t.includes('ACKNOWLEDGED')) return 'good';
  return 'muted';
};

/** The result of the last verification actually run: this page makes no standing claim. */
const Integrity: React.FC<{ verify: ReturnType<typeof useVerifyAuditChain> }> = ({ verify }) => (
  <p className="cpm-audit__integrity" role="status">
    {verify.isIdle && 'Entries are hash-chained by audit-service. Run a verification to confirm integrity now. This page makes no standing claim.'}
    {verify.isPending && 'Walking the full chain…'}
    {verify.isSuccess && <><TonePill tone="good">CHAIN OK</TonePill> Chain verified just now. {String(verify.data)}</>}
    {verify.isError && (
      <>
        <TonePill tone="bad">VERIFY FAILED</TonePill> {(verify.error as Error)?.message ?? 'unknown error'}. A 500 here means
        the service reported possible tampering or could not complete the walk.
      </>
    )}
  </p>
);

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
  const verify = useVerifyAuditChain();

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
  const filtered = !!(entityType || eventType || userId || search.trim());

  return (
    <section className="cpm-surface" aria-label="Governance events">
      <PanelHead eyebrow="Immutable audit trail" title="Governance events"
        help={<Toggletip variant="how-to" label="About the audit trail">
          <p>Immutable cryptographically-chained record of all operator and system actions.</p>
        </Toggletip>}
        right={
          <ReasonedButton variant="normal" disabled={!canRead || verify.isPending}
            reason={!canRead ? 'Needs the admin.audit.view permission' : null} onClick={() => verify.mutate()}>
            {verify.isPending ? 'Verifying chain…' : 'Verify cryptographic chain'}
          </ReasonedButton>
        } />
      <Integrity verify={verify} />

      <div className="cpm-toolbar cpm-audit__row">
        <label className="cpm-field">
          <span className="cpm-field__label">Entity</span>
          <select className="cpm-select" value={entityType} onChange={e => setEntityType(e.target.value)}>
            {ENTITY_FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>
        <label className="cpm-field cpm-audit__find">
          <span className="cpm-field__label">Find by user, action or entity</span>
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
        {audit.data && (
          <span className="cpm-filter-count">
            {audit.data.total} total · showing {rows.length}{search ? ` matching “${search}”` : ''}
          </span>
        )}
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
              <tr>
                {['Timestamp', 'Event type', 'User', 'Entity', 'Hash signature', 'Correlation'].map(h => <th key={h} scope="col">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {pageItems.map(e => (
                <tr key={e.eventId}>
                  <td title={e.timestampUtc}>{fmtDateTime(e.timestampUtc)}</td>
                  <td><span title={e.eventType}><TonePill tone={eventTone(e.eventType)}>{auditLabel(e.eventType)}</TonePill></span></td>
                  <td>{e.userId || 'system'}</td>
                  <td><span title={e.entityType}>{ENTITY_LABEL[e.entityType] ?? auditLabel(e.entityType)}</span><div className="cpm-event-row__sub cpm-mono">{e.entityId}</div></td>
                  <td className="cpm-mono" title="Hash recorded. Run Verify to check the chain.">{e.currentHash.slice(0, 16)}…</td>
                  <td className="cpm-mono">{e.correlationId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pageCount > 1 && (
        <div className="cpm-pager">
          <span title={safePage === 0 ? 'Already on the first page' : undefined}>
            <ObcButton variant="flat" disabled={safePage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>← Prev</ObcButton>
          </span>
          <span className="cpm-event-row__sub">
            {safePage * AUDIT_PAGE_SIZE + 1}–{Math.min((safePage + 1) * AUDIT_PAGE_SIZE, rows.length)} of {rows.length} fetched
            {' '}· page {safePage + 1} of {pageCount}
            {(audit.data?.total ?? 0) > (audit.data?.events.length ?? 0)
              ? ` · newest ${AUDIT_TAKE} of ${audit.data!.total}, older entries are not fetched` : ''}
          </span>
          <span title={safePage >= pageCount - 1 ? 'Already on the last page' : undefined}>
            <ObcButton variant="flat" disabled={safePage >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}>Next →</ObcButton>
          </span>
        </div>
      )}
    </section>
  );
};

export default AuditTrail;
