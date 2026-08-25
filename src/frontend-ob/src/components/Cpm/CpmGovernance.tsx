'use client';

/**
 * CPLM Phase 7 — U12 Governance (/cpm/governance).
 * Stage 1 (DG-8): a read-only governance view — the real audit stream (fed by
 * the A15 emitter + display-service events, chained by audit-service), version
 * provenance from stored results, and the separation-of-duties model as the
 * permission system actually enforces it. There is no server-side approval
 * workflow yet; the approval queue says so instead of simulating one.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../api/apiFetch';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, KvRow, PanelHead, TonePill, WorkspaceHeader,
  fmtDateTime,
} from './shared';
import { usePagedSlice } from '../shared/ListPager';
import { useAuditEvents, useVerifyAuditChain } from '../../hooks/useAudit';
import { useCpmCalculations, useCpmLoops } from '../../hooks/useCpm';
import { useAuthStore } from '../../store/authStore';
import { useRoleMatrix } from './useRoleMatrix';

/** Rows fetched per request, and rows rendered per page of that fetch. */
const AUDIT_TAKE = 200;
const AUDIT_PAGE_SIZE = 25;

const ENTITY_FILTERS = [
  { key: '', label: 'All entities' },
  { key: 'CpmLoop', label: 'CPM loops' },
  { key: 'CpmEventFrame', label: 'CPM events' },
  { key: 'Display', label: 'HMI displays' },
];

const EVENT_TONE = (t: string): 'good' | 'warn' | 'bad' | 'muted' => {
  if (t.includes('DELETED')) return 'bad';
  if (t.includes('SHELVED')) return 'warn';
  if (t.includes('ACTIVATED') || t.includes('ACKNOWLEDGED')) return 'good';
  return 'muted';
};

/**
 * Permissions this page calls out by name, so the live matrix can show which
 * roles actually hold each one instead of describing them in prose.
 */
const WATCHED_PERMISSIONS: { key: string; guards: string }[] = [
  { key: 'cpm.manage', guards: 'Loop onboarding, event ack/shelve, recompute' },
  { key: 'system.manage', guards: 'Pipeline and OPC mutations' },
  { key: 'admin.audit.view', guards: 'Audit trail reads' },
  { key: 'analytics.view', guards: 'Every CPM read' },
  { key: 'rbac.manage', guards: 'Role and permission changes' },
  { key: 'display.edit', guards: 'Authoring HMI displays' },
];

export const CpmGovernance: React.FC = () => {
  const hasPermission = useAuthStore(s => s.hasPermission);
  const canReadAudit = hasPermission('admin.audit.view');

  const [entityType, setEntityType] = useState('');
  // A7.1: free text over actor / action / entity — location filtering is not
  // useful here (audit rows are actions, not loops), but 'who touched FIC-109'
  // is exactly what an audit trail gets asked.
  const [search, setSearch] = useState('');
  const audit = useAuditEvents(
    { entityType: entityType || undefined, take: AUDIT_TAKE },
    30_000,
    canReadAudit,
  );
  const auditRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = audit.data?.events ?? [];
    if (!q) return rows;
    return rows.filter(e =>
      (e.userId ?? '').toLowerCase().includes(q)
      || e.eventType.toLowerCase().includes(q)
      || (e.entityType ?? '').toLowerCase().includes(q)
      || (e.entityId ?? '').toLowerCase().includes(q));
  }, [audit.data, search]);

  const matrix = useRoleMatrix();
  // The endpoint is asked for `take` rows; paging walks what was fetched and
  // the footer states the shortfall rather than leaving "3,412 total · showing
  // 100" as a dead end.
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [entityType, search]);
  const { pageCount, safePage, pageItems: pagedAudit } =
    usePagedSlice(auditRows, page, AUDIT_PAGE_SIZE);

  const verify = useVerifyAuditChain();
  const calc = useCpmCalculations();
  const loops = useCpmLoops();

  // Typed check — the old version substring-matched '403' in a message that
  // embeds the request URL, so any URL containing '403' misclassified.
  const auditForbidden = audit.isError && audit.error instanceof ApiError && audit.error.status === 403;

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Change control"
        title="Governance"
        copy="Who changed what, under which calculation versions, and which duties are separated by the permission model."
      />

      <section className="cpm-surface">
        <PanelHead eyebrow="Immutable audit trail" title="Governance events"
          right={
            <div className="cpm-filter-row">
              <ObcButton variant="normal" disabled={!canReadAudit || verify.isPending}
                onClick={() => verify.mutate()}>
                {verify.isPending ? 'Verifying chain…' : 'Verify cryptographic chain'}
              </ObcButton>
            </div>
          } />
        {verify.isSuccess && <p className="cpm-copy"><TonePill tone="good">CHAIN OK</TonePill>&nbsp;{String(verify.data)}</p>}
        {verify.isError && (
          <p className="cpm-copy">
            <TonePill tone="bad">VERIFY FAILED</TonePill>&nbsp;
            {(verify.error as Error)?.message ?? 'unknown error'} — a 500 here means the service
            reported possible tampering or could not complete the walk.
          </p>
        )}

        <div className="cpm-filter-row" style={{ marginBottom: 8 }}>
          {ENTITY_FILTERS.map(f => (
            <ObcButton key={f.key} variant={entityType === f.key ? 'raised' : 'normal'}
              onClick={() => setEntityType(f.key)}>
              {f.label}
            </ObcButton>
          ))}
          <input className="cpm-input" style={{ minWidth: 220 }}
            placeholder="Find by user, action or entity"
            value={search} onChange={e => setSearch(e.target.value)} />
          {audit.data && (
            <span className="cpm-filter-count">
              {audit.data.total} total · showing {auditRows.length}
              {search ? ` matching “${search}”` : ''}
            </span>
          )}
        </div>

        {!canReadAudit && (
          <EmptyState title="Audit reads require the admin.audit.view permission"
            copy="Your session does not carry it; the trail itself keeps recording regardless." />
        )}
        {canReadAudit && audit.isLoading && <EmptyState title="Loading audit trail…" />}
        {canReadAudit && auditForbidden && (
          <EmptyState title="Audit service refused the read (403)"
            copy="The token was accepted by the app but not by audit-service — re-login to refresh claims." />
        )}
        {canReadAudit && audit.isError && !auditForbidden && (
          <EmptyState title="Audit service unreachable"
            copy={(audit.error as Error)?.message ?? 'unknown error'} />
        )}
        {canReadAudit && audit.data && auditRows.length === 0 && (
          <EmptyState title="No governance events recorded yet"
            copy="CPM onboarding, ack/shelve, recompute and display changes emit here from now on." />
        )}
        {/* Four unlabelled columns — the Events list has a head row and this
            one did not, so the last column read as an unexplained string. */}
        {auditRows.length > 0 && (
          <div className="cpm-event-head" style={{ gridTemplateColumns: '1fr 1.2fr 0.9fr 1fr' }}>
            <span>When / hash</span><span>Action</span><span>Actor</span><span>Entity</span>
          </div>
        )}
        {pagedAudit.map(e => (
          <div key={e.eventId} className="cpm-event-row" style={{ gridTemplateColumns: '1fr 1.2fr 0.9fr 1fr' }}>
            <span>
              <span className="cpm-event-row__title">{fmtDateTime(e.timestampUtc)}</span>
              <div className="cpm-event-row__sub cpm-mono">{e.currentHash.slice(0, 16)}…</div>
            </span>
            <TonePill tone={EVENT_TONE(e.eventType)}>{e.eventType.replace(/_/g, ' ')}</TonePill>
            <span className="cpm-event-row__sub">{e.userId || 'system'}</span>
            <span className="cpm-event-row__sub">{e.entityType} · {e.entityId}</span>
          </div>
        ))}
        {pageCount > 1 && (
          <div className="cpm-pager">
            <ObcButton variant="flat" disabled={safePage === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}>← Prev</ObcButton>
            <span className="cpm-event-row__sub">
              {safePage * AUDIT_PAGE_SIZE + 1}–
              {Math.min((safePage + 1) * AUDIT_PAGE_SIZE, auditRows.length)} of{' '}
              {auditRows.length} fetched · page {safePage + 1} of {pageCount}
              {(audit.data?.total ?? 0) > (audit.data?.events.length ?? 0)
                ? ` · newest ${AUDIT_TAKE} of ${audit.data!.total} — older entries are not fetched`
                : ''}
            </span>
            <ObcButton variant="flat" disabled={safePage >= pageCount - 1}
              onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}>Next →</ObcButton>
          </div>
        )}
      </section>

      <div className="cpm-grid-2">
        <section className="cpm-surface">
          <PanelHead eyebrow="Version provenance" title="What is producing today's verdicts" />
          <KvRow label="Calculation engine">
            v{calc.data?.calculationVersion ?? '—'} · {calc.data?.engine ?? '—'}
          </KvRow>
          <KvRow label="Dynamics profile">v{calc.data?.dynamicsProfileVersion ?? '—'}</KvRow>
          <KvRow label="Registered loops">{loops.data?.count ?? '—'}</KvRow>
          <KvRow label="Threshold profiles in use">
            {(() => {
              const ids = new Set((loops.data?.loops ?? [])
                .map(l => l.thresholdProfileId).filter((x): x is string => !!x));
              return ids.size > 0 ? [...ids].join(', ') : 'defaults only';
            })()}
          </KvRow>
          <p className="cpm-copy">
            Every stored window carries these versions in its payload (A13), so any historical
            verdict can be attributed to the formula that produced it.
          </p>

          <PanelHead eyebrow="Approvals" title="Change approval queue" />
          <EmptyState title="No approval workflow configured"
            copy="Stage 1 governance is observe-and-attribute (this page). A server-side draft/approve flow is data-gap DG-8; loops activate directly under cpm.manage today, and every activation is audited above." />
        </section>

        <section className="cpm-surface">
          {/*
            This panel used to be a four-row literal — Admin/Engineer/Operator/
            Viewer with hand-written "can" and "cannot" prose — under a heading
            claiming it was "as enforced by the permission model". It was not:
            add a role or regrant a permission and the page kept asserting the
            old model, on the one screen whose whole purpose is attribution.
            It is now read from auth-service's RBAC API (roles + per-role
            permissions), which is the thing that actually enforces.
          */}
          <PanelHead
            eyebrow="Separation of duties"
            title="As enforced by the permission model"
            right={matrix.canRead && matrix.data
              ? <span className="cpm-hist-note">{matrix.data.roles.length} role(s) · live</span>
              : null}
          />

          {!matrix.canRead && (
            <EmptyState
              title="The live role matrix needs the rbac.manage permission"
              copy="Your session can read the audit trail but not the RBAC model, so this panel will not describe a permission model it cannot verify. The enforcement points below are route guards in this build."
            />
          )}
          {matrix.canRead && matrix.isLoading && <EmptyState title="Reading roles…" />}
          {matrix.canRead && matrix.isError && (
            <EmptyState title="RBAC model unavailable"
              copy={(matrix.error as Error)?.message ?? 'auth-service did not answer.'} />
          )}

          {matrix.canRead && matrix.data && (
            <div className="cpm-matrix-scroll">
              <table className="cpm-matrix cpm-rbac">
                <thead>
                  <tr>
                    <th scope="col" style={{ textAlign: 'left' }}>Permission</th>
                    {matrix.data.roles.map(r => (
                      <th key={r.role_name} scope="col">{r.role_name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {WATCHED_PERMISSIONS.map(p => (
                    <tr key={p.key}>
                      <th scope="row" style={{ textAlign: 'left' }}>
                        <span className="cpm-mono">{p.key}</span>
                        <span className="cpm-event-row__sub">{p.guards}</span>
                      </th>
                      {matrix.data!.roles.map(r => {
                        const held = matrix.data!.holders[r.role_name]?.has(p.key) ?? false;
                        return (
                          <td key={r.role_name}>
                            <span
                              className={`cpm-matrix__cell cpm-matrix__cell--${held ? 'good' : 'muted'}`}
                              aria-label={`${r.role_name} ${held ? 'holds' : 'does not hold'} ${p.key}`}
                            >
                              <span aria-hidden>{held ? '✓' : '—'}</span>
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="cpm-copy" style={{ marginTop: 10 }}>
            {/* No hard-coded TTL: permission claims are read from the access token,
                so they refresh on re-login/token refresh — the previous text
                asserted a "15-minute token lifetime" this page cannot know. */}
            Permission changes take effect when the session's token is next issued
            (re-login, or the automatic refresh).
          </p>
        </section>
      </div>
    </div>
  );
};

export default CpmGovernance;
