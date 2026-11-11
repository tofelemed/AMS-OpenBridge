/**
 * CHG-172 (owner review, the approved sample, badge 9): the selected role in the panel beside the list (a drawer below 1280 px).
 * The kind as eyebrow (System role / Custom role), the role once, "22 of 38" with "unsaved changes"; the Description field (saved
 * when the field is left); Users with this role ↗ and Permissions by role ↗; every permission with what it allows on screen,
 * grouped as before with All / Clear; in the foot Reset to default or Delete role, Discard changes, and the sign-out sentence once,
 * beside Save permissions. The notice after an action keeps its words.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Inspector } from '../../../ui/Inspector';
import { TextInput } from '../../../ui/forms/TextInput';
import { ReasonedButton } from '../../Cpm/ReasonedButton';
import { adminHref, governanceHref } from '../../Cpm/cpaHref';
import type { PermissionDef, Role } from '../../../api/rolesApi';
import PermissionCheckbox from '../PermissionCheckbox';

export const SIGN_OUT = 'Everyone with this role is signed out within a few seconds, and gets the new permissions when they sign in again.';

export const RolePanel: React.FC<{
  role: Role;
  groups: Array<[string, PermissionDef[]]>;
  total: number;
  selected: Set<string>;
  dirty: boolean;
  busy: boolean;
  notice: string | null;
  error: string | null;
  canUsers: boolean;
  description: string;
  onDescription: (v: string) => void;
  onCommitDescription: (v: string) => void;
  onToggle: (key: string) => void;
  onToggleGroup: (keys: string[], allOn: boolean) => void;
  onSave: () => void;
  onDiscard: () => void;
  onReset: () => void;
  onDelete: () => void;
  open: boolean;
  onClose: () => void;
}> = p => {
  const navigate = useNavigate();
  const { role } = p;
  return (
    <Inspector eyebrow={role.is_system_role ? 'System role' : 'Custom role'} title={role.role_name} open={p.open} onClose={p.onClose}
      meta={<span className="cpm-admin-count">{`${p.selected.size} of ${p.total}`}{p.dirty && <> · <strong>unsaved changes</strong></>}</span>}
      primaryAction={
        <div className="cpm-admin-foot cpm-admin-foot--roles">
          {role.is_system_role
            ? <ObcButton variant="normal" disabled={p.busy} onClick={p.onReset}>Reset to default</ObcButton>
            : <ObcButton variant="flat" disabled={p.busy} onClick={p.onDelete}>Delete role</ObcButton>}
          {p.dirty && <ObcButton variant="flat" disabled={p.busy} onClick={p.onDiscard}>Discard changes</ObcButton>}
          <span className="cpm-admin-foot__note">{SIGN_OUT}</span>
          <ReasonedButton variant="raised" disabled={p.busy || !p.dirty} reason={!p.dirty ? 'Tick or clear a permission first' : null}
            onClick={p.onSave}>Save permissions</ReasonedButton>
        </div>
      }>
      {p.error && <p className="cpm-field__error" role="alert">{p.error}</p>}
      {p.notice && <p className="cpm-copy cpm-admin-notice" aria-live="polite">{p.notice}</p>}
      <TextInput label="Description" value={p.description} placeholder="Role description" onChange={p.onDescription} onCommit={p.onCommitDescription} />
      <div className="cpm-events-links">
        {p.canUsers && (
          <ObcButton variant="flat" onClick={() => navigate(`${adminHref('users')}?role=${encodeURIComponent(role.role_name)}`)}>
            Users with this role {'↗'}
          </ObcButton>
        )}
        <ObcButton variant="flat" onClick={() => navigate(governanceHref())}>Permissions by role {'↗'}</ObcButton>
      </div>
      <section className="cpm-admin-perms" aria-label="Permissions">
        <h3 className="cpm-reg-part__title">Permissions</h3>
        <div className="cpm-admin-perms__cols">
          {p.groups.map(([category, perms]) => {
            const keys = perms.map(x => x.permission_key);
            const allOn = keys.every(k => p.selected.has(k));
            return (
              <div key={category} role="group" aria-label={category} className="cpm-admin-pblock">
                <div className="cpm-admin-pblock__head">
                  <span>{category}</span>
                  <ObcButton variant="flat" onClick={() => p.onToggleGroup(keys, allOn)}>{allOn ? 'Clear' : 'All'}</ObcButton>
                </div>
                {perms.map(x => (
                  <PermissionCheckbox key={x.permission_key} permissionKey={x.permission_key} description={x.description}
                    checked={p.selected.has(x.permission_key)} onToggle={() => p.onToggle(x.permission_key)} />
                ))}
              </div>
            );
          })}
        </div>
      </section>
    </Inspector>
  );
};

export default RolePanel;
