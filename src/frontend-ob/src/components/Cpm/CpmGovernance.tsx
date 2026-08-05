'use client';

/**
 * CPLM Phase 7 — U12 Governance (/cpm/governance).
 * Stage 1 (DG-8): a read-only governance view — the real audit stream (fed by
 * the A15 emitter + display-service events, chained by audit-service), version
 * provenance from stored results, and the separation-of-duties model as the
 * permission system actually enforces it. There is no server-side approval
 * workflow yet; the approval queue says so instead of simulating one.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, KvRow, PanelHead, TonePill, WorkspaceHeader,
} from './shared';
import { useAuditEvents, useVerifyAuditChain } from '../../hooks/useAudit';
import { useCpmCalculations, useCpmLoops } from '../../hooks/useCpm';
import { useAuthStore } from '../../store/authStore';

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

/** The real role → permission mapping this deployment enforces. */
const DUTIES: { role: string; can: string; cannot: string }[] = [
  { role: 'Admin', can: 'Everything, including user management and audit reads', cannot: '— (catch-all grant)' },
  { role: 'Engineer', can: 'Onboard/configure loops (cpm.manage), view analytics, author displays', cannot: 'Manage users, read the audit trail' },
  { role: 'Operator', can: 'View analytics, acknowledge/shelve where granted', cannot: 'Onboard loops, change pipeline or users' },
  { role: 'Viewer', can: 'Read-only analytics and displays', cannot: 'Any mutation' },
];

export const CpmGovernance: React.FC = () => {
  const hasPermission = useAuthStore(s => s.hasPermission);
  const canReadAudit = hasPermission('admin.audit.view');

  const [entityType, setEntityType] = useState('');
  const audit = useAuditEvents(
    { entityType: entityType || undefined, take: 100 },
    30_000,
    canReadAudit,
  );
  const verify = useVerifyAuditChain();
  const calc = useCpmCalculations();
  const loops = useCpmLoops();

  const auditForbidden = audit.isError && String((audit.error as Error)?.message ?? '').includes('403');

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
          {audit.data && <span className="cpm-filter-count">{audit.data.total} total · showing {audit.data.count}</span>}
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
        {canReadAudit && audit.data && audit.data.events.length === 0 && (
          <EmptyState title="No governance events recorded yet"
            copy="CPM onboarding, ack/shelve, recompute and display changes emit here from now on." />
        )}
        {(audit.data?.events ?? []).map(e => (
          <div key={e.eventId} className="cpm-event-row" style={{ gridTemplateColumns: '1fr 1.2fr 0.9fr 1fr' }}>
            <span>
              <span className="cpm-event-row__title">{new Date(e.timestampUtc).toLocaleString()}</span>
              <div className="cpm-event-row__sub cpm-mono">{e.currentHash.slice(0, 16)}…</div>
            </span>
            <TonePill tone={EVENT_TONE(e.eventType)}>{e.eventType.replace(/_/g, ' ')}</TonePill>
            <span className="cpm-event-row__sub">{e.userId || 'system'}</span>
            <span className="cpm-event-row__sub">{e.entityType} · {e.entityId}</span>
          </div>
        ))}
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
          <PanelHead eyebrow="Separation of duties" title="As enforced by the permission model" />
          {DUTIES.map(d => (
            <div key={d.role} className="cpm-window-row">
              <strong>{d.role}</strong>
              <span className="cpm-event-row__sub">Can: {d.can}</span>
              <span className="cpm-event-row__sub">Cannot: {d.cannot}</span>
            </div>
          ))}
          <p className="cpm-copy">
            Enforcement points: <span className="cpm-mono">cpm.manage</span> guards loop
            onboarding, event ack/shelve and recompute; <span className="cpm-mono">system.manage</span>{' '}
            guards pipeline and OPC mutations; <span className="cpm-mono">admin.audit.view</span>{' '}
            guards audit reads; <span className="cpm-mono">analytics.view</span> guards every CPM read.
            New claims require re-login (15-minute token lifetime).
          </p>
        </section>
      </div>
    </div>
  );
};

export default CpmGovernance;
