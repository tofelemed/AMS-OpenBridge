/**
 * CHG-172 (owner review, the approved sample, badges 10 and 11): Add custom role as a small dialog (it was an inline form under a
 * button that turned into Cancel), and Delete role picking the role its users move to from a list (it was free text, where a
 * typo was refused by the server). The words are kept; each dialog ends with the button that names its action.
 */
import React, { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { ReasonedButton } from '../../Cpm/ReasonedButton';
import { Field, Part } from '../../Cpm/registry/wizard/editorParts';
import type { Role } from '../../../api/rolesApi';

/** The built-in roles from the least to the most privileged: the safest move comes first. */
const LEAST_FIRST = ['Viewer', 'Operator', 'Engineer', 'Admin', 'SuperAdmin'];

/** The roles a deleted role's users can move to: every other role, built-in ones from the least privileged, then the rest by name. */
export function reassignTargets(roles: Role[], deleting: string): string[] {
  const names = roles.map(r => r.role_name).filter(n => n !== deleting);
  const builtIn = LEAST_FIRST.filter(n => names.includes(n));
  return [...builtIn, ...names.filter(n => !builtIn.includes(n)).sort((a, b) => a.localeCompare(b))];
}

export const AddRoleDialog: React.FC<{
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onCreate: (name: string, description: string) => void;
}> = ({ busy, error, onCancel, onCreate }) => {
  const id = useId();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  return createPortal(
    <Dialog open title="Add custom role" onClose={() => { if (!busy) onCancel(); }}
      footer={<>
        <ObcButton variant="flat" disabled={busy} onClick={onCancel}>Cancel</ObcButton>
        <ReasonedButton variant="raised" disabled={busy || !name.trim()} reason={!name.trim() ? 'Write a role name first' : null}
          onClick={() => onCreate(name.trim(), desc.trim())}>Create</ReasonedButton>
      </>}>
      <Part title="Role">
        <div className="cpm-admin-stack">
        <Field id={`${id}-name`} label="Role name">
          <input id={`${id}-name`} className="cpm-input" value={name} placeholder="e.g. ShiftSupervisor" onChange={e => setName(e.target.value)} />
        </Field>
        <Field id={`${id}-desc`} label="Description">
          <input id={`${id}-desc`} className="cpm-input" value={desc} placeholder="What this role is for" onChange={e => setDesc(e.target.value)} />
        </Field>
        </div>
      </Part>
      {error && <p className="cpm-field__error" role="alert">{error}</p>}
    </Dialog>, document.body);
};

export const DeleteRoleDialog: React.FC<{
  role: string;
  roles: Role[];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onDelete: (reassignTo: string) => void;
}> = ({ role, roles, busy, error, onCancel, onDelete }) => {
  const id = useId();
  const targets = reassignTargets(roles, role);
  const [target, setTarget] = useState(targets.includes('Viewer') ? 'Viewer' : targets[0] ?? '');
  return createPortal(
    <Dialog open title={`Delete role "${role}"`} onClose={() => { if (!busy) onCancel(); }}
      footer={<>
        <ObcButton variant="flat" disabled={busy} onClick={onCancel}>Cancel</ObcButton>
        <ObcButton variant="raised" disabled={busy} onClick={() => onDelete(target)}>Delete role</ObcButton>
      </>}>
      <div className="cpm-admin-confirm">
        <p className="cpm-copy">If any users hold this role, enter a role to reassign them to (leave blank to cancel if there are users).</p>
        <Field id={`${id}-to`} label="Reassign users to">
          <select id={`${id}-to`} className="cpm-select" value={target} onChange={e => setTarget(e.target.value)}>
            {targets.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        {error && <p className="cpm-field__error" role="alert">{error}</p>}
      </div>
    </Dialog>, document.body);
};
