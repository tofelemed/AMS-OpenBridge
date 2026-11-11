'use client';

/**
 * The one audit trail (page-plan.md, decision 4): Governance reads the records audit-service chains; Administration's Audit log ↗
 * opens it.
 *
 * CHG-174 (owner review, the approved sample docs/theme/redesign/samples/governance-proposal.html, badges 3-7, and the owner's
 * answers of 11 Nov 2026): one list with a 32 px filter row (Find, the exact user name, All entities, All events, the time range),
 * When · UTC ("4 Nov 13:04", the zone once in the heading) · Actor (user name, System, or Not recorded by name) · Action (words,
 * tone and glyph) · Entity (a short name, its type under it), and the shared pager over every event on the server (25 a page; it
 * paged the newest 200 in the browser). The selected event is in a panel beside the list (a drawer below 1280 px); the page
 * opens on the newest. Entity, user, event type and the time range ask the server; Find searches only the rows fetched.
 */
import React, { useState } from 'react';
import { ApiError } from '../../../api/apiFetch';
import type { AuditEventRow } from '../../../api/auditApi';
import { useCpmLoops } from '../../../hooks/useCpm';
import { useDebounce } from '../../../hooks/useDebounce';
import { useAuthStore } from '../../../store/authStore';
import { Pagination } from '../../../ui/forms/Pagination';
import { EmptyState, QueryError } from '../shared';
import { actionView, actorView, entityKind, entityName } from './auditCatalog';
import { bundleOf } from './auditLinks';
import { rangeQuery, stamp, zoneTag } from './auditTime';
import { AuditEventPanel } from './AuditEventPanel';
import { AuditFilters, NO_FILTERS, type FilterState } from './AuditFilters';
import { useAuditTrail } from './useAuditTrail';
import { useConfigNames, type ConfigNames } from './useConfigNames';

const count = (n: number) => n.toLocaleString('en-GB');

const Action: React.FC<{ e: AuditEventRow; names: ConfigNames }> = ({ e, names }) => {
  const a = actionView(e, e.entityType === 'config_deployment' ? names.deployment(e.entityId) : undefined);
  return (
    <span className={`cpm-gov-act${a.tone ? ` cpm-pill--${a.tone}` : ''}`}>
      <span className="cpm-pill__glyph cpm-gov-act__glyph" aria-hidden>{a.glyph ?? ''}</span>
      <span>{a.label}</span>
    </span>
  );
};

export const AuditTrail: React.FC = () => {
  const has = useAuthStore(s => s.hasPermission);
  const canRead = has('admin.audit.view');
  const [f, setF] = useState<FilterState>(NO_FILTERS);
  const [anchor, setAnchor] = useState(() => Date.now());
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const user = useDebounce(f.user.trim(), 400);
  const range = rangeQuery(f.range, anchor, f.fromDay, f.toDay);
  const t = useAuditTrail({ entityType: f.entityType, eventType: f.eventType, user, ...range }, f.search, page, canRead);
  const loops = useCpmLoops();
  const names = useConfigNames(
    t.rows.some(e => e.entityType === 'gate_config_bundle' || e.entityType === 'config_deployment'),
    t.rows.some(e => e.entityType === 'config_deployment'),
  );

  const change = (next: Partial<FilterState>) => {
    if (next.range && next.range !== f.range) setAnchor(Date.now());
    setF(prev => ({ ...prev, ...next }));
    setPage(1);
  };
  const pick = (e: AuditEventRow) => { setSelectedId(e.eventId); setDrawer(true); };

  const { audit } = t;
  // Typed check: a message that embeds the request URL must not read as a 403 because the URL holds "403".
  const forbidden = audit.isError && audit.error instanceof ApiError && audit.error.status === 403;
  const filtered = !!(f.entityType || f.eventType || user || f.search.trim() || f.range !== 'all');
  const selected = t.rows.find(e => e.eventId === selectedId) ?? t.rows[0];
  const cover = t.legacy && t.total > t.fetched ? `Newest ${count(t.fetched)} of ${count(t.total)}` : `${count(t.total)} ${t.total === 1 ? 'event' : 'events'}`;

  return (
    <div className="cpm-master-detail cpm-gov-md">
      <section className="cpm-surface cpm-admin-list" aria-label="Audit events">
        <AuditFilters value={f} onChange={change} />
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
        {canRead && audit.data && !audit.isError && t.rows.length === 0 && (filtered
          ? <EmptyState title="No audit events match" copy="The trail records display, CPM, gate-configuration, data-source, role and user changes." />
          : <EmptyState title="No governance events recorded yet" copy="Display, CPM, gate-configuration, data-source, role and user changes are recorded here as they happen." />
        )}

        {t.rows.length > 0 && (
          <>
            <table className="cpm-table cpm-reg-table cpm-admin-table cpm-gov-table cpm-gov-table--trail">
              <thead><tr><th>When · {zoneTag()}</th><th>Actor</th><th>Action</th><th>Entity</th></tr></thead>
              <tbody>
                {t.rows.map(e => {
                  const on = e.eventId === selected?.eventId;
                  const actor = actorView(e.userId);
                  return (
                    <tr key={e.eventId} className={`cpm-reg-row${on ? ' cpm-reg-row--selected' : ''}`} aria-current={on ? 'true' : undefined}
                      onClick={() => pick(e)}>
                      <td title={e.timestampUtc}>
                        <button type="button" className="cpm-audit-open" onClick={ev => { ev.stopPropagation(); pick(e); }}>{stamp(e.timestampUtc)}</button>
                      </td>
                      <td className={actor.byName ? undefined : 'cpm-gov-muted'}>{actor.text}</td>
                      <td><Action e={e} names={names} /></td>
                      <td>
                        <span className="cpm-gov-entity">{entityName(e, bundleOf(e, names)?.name)}</span>
                        <span className="cpm-event-row__sub">{entityKind(e)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="cpm-events-pager cpm-gov-pager">
              {t.pageCount > 1 && <Pagination page={Math.min(page, t.pageCount)} pageCount={t.pageCount} onChange={setPage} label="Audit pages" />}
              <span className="cpm-gov-pager__cover">{cover}</span>
            </div>
          </>
        )}
      </section>
      {selected && (
        <AuditEventPanel event={selected} names={names} has={has} loopIds={loops.data?.loops.map(l => l.loopId)}
          open={drawer} onClose={() => setDrawer(false)} />
      )}
    </div>
  );
};

export default AuditTrail;
