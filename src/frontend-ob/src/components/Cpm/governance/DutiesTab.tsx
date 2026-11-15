/**
 * Separation of duties, as the permission model enforces it: read from auth-service's RBAC API (roles and their permissions),
 * never a hand-written literal (it was one, and kept asserting the old model after a role changed).
 *
 * CHG-174 (owner review, badge 11, answer 1): full width, every role in view, the permission column kept in place when the
 * matrix scrolls sideways (it was half the page wide, two roles in view, the names scrolling away); the gate-configuration keys
 * that four eyes separates (cpm.config.draft, approve, activate) and admin.users.edit added; one description per permission,
 * the catalog's words as Administration › Roles shows them (they were Governance's own, e.g. "Pipeline and OPC mutations").
 * "5 role(s) · live" went (the columns show the roles); "When a permission change applies" moved to How to read.
 *
 * CHG-202 (owner, 15 Nov 2026: no ids or backend text): a permission reads by its description only, never its key; a trailing
 * internal acronym ("(CPLM)") is dropped; when the catalog cannot be read or lacks a description the catalog's own words
 * (auth-service permission-catalog.ts) stand in, so a key never shows. The empty and failed states say so in words.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPermissionCatalog } from '../../../api/rolesApi';
import { EmptyState } from '../shared';
import { useRoleMatrix } from '../useRoleMatrix';
import { ReadFailed } from './ReadFailed';

/** The permissions this page calls out, so the matrix shows which roles hold each instead of describing them in prose. */
export const DUTY_KEYS: readonly string[] = [
  'cpm.manage', 'system.manage', 'admin.audit.view', 'analytics.view', 'rbac.manage', 'display.edit',
  'cpm.config.draft', 'cpm.config.approve', 'cpm.config.activate', 'admin.users.edit',
];

/** The catalog's descriptions of DUTY_KEYS, for when the catalog does not answer. */
const CATALOG_WORDS: Readonly<Record<string, string>> = {
  'cpm.manage': 'Onboard and configure control loops',
  'system.manage': 'Manage pipeline jobs and OPC connections; view Pipeline Health and Governance',
  'admin.audit.view': 'View the audit log',
  'analytics.view': 'View analytics / KPIs',
  'rbac.manage': 'Manage roles and their permissions',
  'display.edit': 'Create/edit controlled displays',
  'cpm.config.draft': 'Create and edit gate-configuration drafts',
  'cpm.config.approve': 'Approve a validated gate-configuration bundle',
  'cpm.config.activate': 'Activate an approved gate-configuration bundle',
  'admin.users.edit': 'Create/edit/delete users',
};

/** A permission in words: the catalog's description without a trailing internal acronym, else the catalog's own words. */
export const dutyName = (key: string, description?: string | null): string =>
  description?.replace(/\s*\([A-Z0-9]{2,}\)\s*$/, '').trim() || CATALOG_WORDS[key] || 'Unnamed permission';

export const DutiesTab: React.FC = () => {
  const matrix = useRoleMatrix();
  const catalog = useQuery({ queryKey: ['rbac', 'permission-catalog'], queryFn: getPermissionCatalog, enabled: matrix.canRead, staleTime: 5 * 60_000 });
  const described = new Map((catalog.data ?? []).map(p => [p.permission_key, p.description ?? '']));

  return (
    <section className="cpm-surface cpm-gov-duties-card" aria-label="Separation of duties">
      {!matrix.canRead && (
        <EmptyState title="You do not have permission to view roles" copy="Separation of duties is shown to people who can manage roles." />
      )}
      {matrix.canRead && matrix.isLoading && <EmptyState title="Reading roles…" />}
      {matrix.canRead && matrix.isError && <ReadFailed title="Roles could not be read" retry={() => void matrix.refetch()} />}
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
              {DUTY_KEYS.map(key => {
                const name = dutyName(key, described.get(key));
                return (
                  <tr key={key}>
                    <th scope="row" className="cpm-gov-duties__key">{name}</th>
                    {matrix.data!.roles.map(r => {
                      const held = matrix.data!.holders[r.role_name]?.has(key) ?? false;
                      return (
                        <td key={r.role_name}>
                          <span role="img" className={`cpm-matrix__cell cpm-matrix__cell--${held ? 'good' : 'muted'}`}
                            aria-label={`${r.role_name}: ${name}, ${held ? 'held' : 'not held'}`}>
                            <span aria-hidden>{held ? '✓' : '—'}</span>
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default DutiesTab;
