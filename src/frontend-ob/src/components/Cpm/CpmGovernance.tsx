'use client';

/**
 * CPLM Phase 7 — U12 Governance (/cpm/governance).
 * Stage 1 (DG-8): a read-only governance view — the one audit trail (fed by the A15 emitter +
 * display-service events, chained by audit-service), version provenance from stored results, and
 * the separation-of-duties model as the permission system actually enforces it. There is no
 * server-side approval workflow yet; the approval queue says so instead of simulating one.
 */
import React from 'react';
import {
  EmptyState, KvRow, PanelHead, WorkspaceHeader,
  QueryError,
} from './shared';
import { ConfigApprovalQueue } from './config/ConfigApprovalQueue';
import { AuditTrail } from './governance/AuditTrail';
import { useCpmCalculations, useCpmCapabilities, useCpmLoops } from '../../hooks/useCpm';
import { shortIdentity } from '../../api/cpm/capabilities';
import { useAuthStore } from '../../store/authStore';
import { useRoleMatrix } from './useRoleMatrix';
import { Toggletip } from '../../ui/Toggletip';

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

/** What produces the verdicts, approvals and the duties. Only holders of system.manage opened this page before. */
const GovernancePanels: React.FC = () => {
  const matrix = useRoleMatrix();
  const calc = useCpmCalculations();
  const caps = useCpmCapabilities();
  const loops = useCpmLoops();

  return (
      <div className="cpm-grid-2">
        <section className="cpm-surface">
          <PanelHead eyebrow="Version provenance" title="What is producing today's verdicts"
            help={<Toggletip variant="how-to" label="Why versions are stored">
              <p>
                Every stored window carries these versions in its payload (A13), so any historical
                verdict can be attributed to the formula that produced it.
              </p>
            </Toggletip>} />
          <KvRow label="Calculation engine">
            v{calc.data?.calculationVersion ?? '—'} · {calc.data?.engine ?? '—'}
          </KvRow>
          <KvRow label="Dynamics profile">v{calc.data?.dynamicsProfileVersion ?? '—'}</KvRow>
          <KvRow label="cplm-api build">
            {caps.data ? `${caps.data.service.version} · ${shortIdentity(caps.data.service.sourceCommit)}` : '—'}
          </KvRow>
          <KvRow label="Engine builds observed">
            {caps.data
              ? caps.data.engine.observed.length === 0
                ? 'none stored yet'
                : caps.data.engine.observed.map(e =>
                    `calc ${e.calculationVersion ?? '?'} · commit ${shortIdentity(e.sourceCommit)} · jar ${shortIdentity(e.jarSha256)}`,
                  ).join(' | ')
              : '—'}
          </KvRow>
          <KvRow label="Registered loops">{loops.data?.count ?? '—'}</KvRow>
          <KvRow label="Threshold profiles in use">
            {(() => {
              const ids = new Set((loops.data?.loops ?? [])
                .map(l => l.thresholdProfileId).filter((x): x is string => !!x));
              return ids.size > 0 ? [...ids].join(', ') : 'defaults only';
            })()}
          </KvRow>

          <PanelHead eyebrow="Approvals" title="Gate configuration awaiting approval" />
          <ConfigApprovalQueue />
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
            // A role edit revokes its users' tokens and refresh tokens (permission.service.ts), and the gateway
            // sees that within seconds (RevocationCache.cs), so they are signed out. Same sentence as Roles.
            help={<Toggletip variant="how-to" label="When a permission change applies">
              <p>Everyone with this role is signed out within a few seconds, and gets the new permissions when they sign in again.</p>
            </Toggletip>}
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
            <QueryError title="RBAC model unavailable" error={matrix.error} retry={() => void matrix.refetch()} />
          )}

          {matrix.canRead && matrix.data && (
            <div className="cpm-matrix-scroll" role="region" aria-label="Permissions by role" tabIndex={0}>
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
                              role="img"
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
        </section>
      </div>
  );
};

export const CpmGovernance: React.FC = () => {
  const canGovern = useAuthStore(s => s.hasPermission('system.manage'));
  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Change control"
        title="Governance"
        copy="Who changed what, under which calculation versions, and which duties are separated by the permission model."
      />
      <AuditTrail />
      {canGovern && <GovernancePanels />}
    </div>
  );
};

export default CpmGovernance;
