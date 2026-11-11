'use client';

/**
 * CHG-172 (owner review, the approved sample, badge 6): Add user / Edit user in two titled parts, Account and Access; the panel
 * behind says who is edited, so the title does not. The password hint is behind ?. Every field, check and message is kept word
 * for word. On your own account Role and Active account are disabled with the reason on screen (the server refuses both).
 * Add user sends Active account (3a); Edit user sends only what changed and closes without a request when nothing did (3b);
 * a refusal shows as the server words it (3c).
 */
import React, { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { toast } from 'react-toastify';
import { Dialog } from '../../../ui/Dialog';
import { Toggletip } from '../../../ui/Toggletip';
import { Field, Grid, Part } from '../../Cpm/registry/wizard/editorParts';
import { createUser, extractApiError, updateUser, type AdminUser } from '../../../api/usersApi';
import { EMPTY_FORM, changedFields, createPayload, formOf, validateForm, type UserForm } from './userForm';

export const OWN_ROLE_OR_STATUS = 'You cannot change your own role or status.';

export const UserEditorDialog: React.FC<{
  /** The user edited; null adds one. */
  user: AdminUser | null;
  isSelf: boolean;
  roles: string[];
  onClose: () => void;
}> = ({ user, isSelf, roles, onClose }) => {
  const id = useId();
  const qc = useQueryClient();
  const editing = !!user;
  const [form, setForm] = useState<UserForm>(() => (user ? formOf(user) : EMPTY_FORM));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof UserForm>(k: K, v: UserForm[K]) => setForm(f => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => (user ? updateUser(user.user_id, changedFields(user, form)) : createUser(createPayload(form))),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(editing ? 'User updated' : 'User created');
      onClose();
    },
    onError: e => setError(extractApiError(e)),
  });

  const handleSave = () => {
    const problem = validateForm(form, editing);
    if (problem) { setError(problem); return; }
    if (user && Object.keys(changedFields(user, form)).length === 0) { onClose(); return; }
    setError(null);
    save.mutate();
  };

  const busy = save.isPending;
  return (
    <Dialog open title={editing ? 'Edit user' : 'Add user'} onClose={() => { if (!busy) onClose(); }}
      footer={<>
        <ObcButton variant="flat" disabled={busy} onClick={onClose}>Cancel</ObcButton>
        <ObcButton variant="raised" disabled={busy} onClick={handleSave}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create user'}
        </ObcButton>
      </>}>
      {/*
        A real <form> boundary is required here: without one, the browser's password-manager autofill isn't scoped to this
        dialog. As soon as the `type="password"` field below mounts, Chrome/Edge search the WHOLE page for the nearest preceding
        text input to autofill as "username" — which was the user-search box above the table, silently overwriting it with a
        saved credential and filtering the list. autoComplete="off"/"new-password" plus this <form> boundary stops that.
      */}
      <form autoComplete="off" onSubmit={e => { e.preventDefault(); handleSave(); }}>
        <Part title="Account">
          <Grid>
            {!editing && (
              <Field id={`${id}-user`} label="Username *">
                <input id={`${id}-user`} className="cpm-input" autoComplete="off" value={form.username} placeholder="john_doe"
                  onChange={e => set('username', e.target.value)} />
              </Field>
            )}
            <Field id={`${id}-mail`} label="Email *">
              <input id={`${id}-mail`} className="cpm-input" type="email" autoComplete="off" value={form.email} placeholder="john.doe@example.com"
                onChange={e => set('email', e.target.value)} />
            </Field>
            <Field id={`${id}-name`} label="Full name">
              <input id={`${id}-name`} className="cpm-input" autoComplete="off" value={form.full_name} placeholder="John Doe"
                onChange={e => set('full_name', e.target.value)} />
            </Field>
            {!editing && (
              <Field id={`${id}-pw`} label="Password *"
                help={<Toggletip variant="how-to" label="Password"><p>8+ chars with upper, lower, and a number</p></Toggletip>}>
                <input id={`${id}-pw`} className="cpm-input" type="password" autoComplete="new-password" value={form.password}
                  onChange={e => set('password', e.target.value)} />
              </Field>
            )}
          </Grid>
        </Part>
        <Part title="Access">
          <Grid>
            <Field id={`${id}-role`} label="Role *" note={isSelf ? <span className="cpm-copy">{OWN_ROLE_OR_STATUS}</span> : undefined}>
              <select id={`${id}-role`} className="cpm-select" value={form.role} disabled={isSelf} onChange={e => set('role', e.target.value)}>
                {roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <div className="cpm-field cpm-reg-field">
              <span className="ui-field__label">Status</span>
              <label className="cpm-reg-check cpm-admin-check">
                <input type="checkbox" checked={form.is_active} disabled={isSelf} onChange={e => set('is_active', e.target.checked)} />
                Active account
              </label>
            </div>
          </Grid>
        </Part>
        {error && <p className="cpm-field__error" role="alert">{error}</p>}
        {/* Submit via Enter; the visible Save/Cancel buttons live in the dialog's footer, outside this form. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  );
};

export default UserEditorDialog;
