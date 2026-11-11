/**
 * Separation of duties, as the permission model enforces it: read from auth-service's RBAC API (roles and their permissions),
 * never a hand-written literal (it was one, and kept asserting the old model after a role changed).
 *
 * CHG-174 (owner review, badge 11, answer 1): full width, every role in view, the permission column kept in place when the
 * matrix scrolls sideways (it was half the page wide, two roles in view, the names scrolling away); the gate-configuration keys
 * that four eyes separates (cpm.config.draft, approve, activate) and admin.users.edit added; one description per permission,
 * the catalog's words as Administration › Roles shows them (they were Governance's own, e.g. "Pipeline and OPC mutations").
 * "5 role(s) · live" went (the columns show the roles); "When a permission change applies" moved to How to read.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPermissionCatalog } from '../../../api/rolesApi';
import { EmptyState, QueryError } from '../shared';
import { useRoleMatrix } from '../useRoleMatrix';

/** The permissions this page calls out, so the matrix shows which roles hold each instead of describing them in prose. */
export const DUTY_KEYS: readonly string[] = [
  'cpm.manage', 'system.manage', 'admin.audit.view', 'analytics.view', 'rbac.manage', 'display.edit',
  'cpm.config.draft', 'cpm.config.approve', 'cpm.config.activate', 'admin.users.edit',
];

export const DutiesTab: React.FC = () => {
  const matrix = useRoleMatrix();
  const catalog = useQuery({ queryKey: ['rbac', 'permission-catalog'], queryFn: getPermissionCatalog, enabled: matrix.canRead, staleTime: 5 * 60_000 });
  const described = new Map((catalog.data ?? []).map(p => [p.permission_key, p.description ?? '']));

  return (
    <section className="cpm-surface cpm-gov-duties-card" aria-label="Separation of duties">
      {!matrix.canRead && (
        <EmptyState title="The live role matrix needs the rbac.manage permission"
          copy="Your session can read the audit trail but not the RBAC model, so this panel will not describe a permission model it cannot verify." />
      )}
      {matrix.canRead && matrix.isLoading && <EmptyState title="Reading roles…" />}
      {matrix.canRead && matrix.isError && <QueryError title="RBAC model unavailable" error={matrix.error} retry={() => void matrix.refetch()} />}
      {matrix.canRead && matrix.data && (
        <div className="cpm-gov-duties" role="region" aria-label="Permissions by role" tabIndex={0}>
          <table className="cpm-matrix cpm-rbac">
            <thead>
              <tr>
                <th scope="col" className="cpm-gov-duties__key">Permission</th>
                {matrix.data.roles.map(r => <th key={r.role_name} scope="col">{r.role_name}</th>)}
              </tr>
            </thead>
            <tbody>
              {DUTY_KEYS.map(key => (
                <tr key={key}>
                  <th scope="row" className="cpm-gov-duties__key">
                    <span className="cpm-mono">{key}</span>
                    {described.get(key) && <span className="cpm-event-row__sub">{described.get(key)}</span>}
                  </th>
                  {matrix.data!.roles.map(r => {
                    const held = matrix.data!.holders[r.role_name]?.has(key) ?? false;
                    return (
                      <td key={r.role_name}>
                        <span role="img" className={`cpm-matrix__cell cpm-matrix__cell--${held ? 'good' : 'muted'}`}
                          aria-label={`${r.role_name} ${held ? 'holds' : 'does not hold'} ${key}`}>
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
  );
};

export default DutiesTab;
