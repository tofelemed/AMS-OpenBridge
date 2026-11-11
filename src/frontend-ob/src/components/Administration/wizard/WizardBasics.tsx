/**
 * CHG-172 (owner review, the approved sample, badge 14): the editor's first three tabs, Profile, Name and Connection, in short
 * titled parts. Every field, default and word is as before; the help that sat under each field is behind ?. "Data routing" names
 * the Advanced tab (it said "step 4"). The password note under the field went: its placeholder says the same.
 */
import React, { useId } from 'react';
import { Toggletip } from '../../../ui/Toggletip';
import { Field, Grid, Part } from '../../Cpm/registry/wizard/editorParts';
import type { ProfileInfo } from '../dataSourcesApi';
import type { WizardForm } from './wizardForm';

type Set = <K extends keyof WizardForm>(key: K, value: WizardForm[K]) => void;
const help = (label: string, text: string) => <Toggletip variant="how-to" label={label}><p>{text}</p></Toggletip>;

export const ProfilePane: React.FC<{ form: WizardForm; profiles: ProfileInfo[]; profile?: ProfileInfo; onProfile: (t: string) => void }> = ({ form, profiles, profile, onProfile }) => {
  const id = useId();
  return (
    <>
      <Part title="Profile" help={help('Profile', 'What is this configuration for? The profile decides which module the data feeds and which pipeline it lands on.')}>
        <div className="cpm-admin-stack">
        <Field id={`${id}-p`} label="Data Source Profile *" note={profile && <span className="cpm-copy">{profile.description}</span>}>
          <select id={`${id}-p`} className="cpm-select" value={form.profileType} onChange={e => onProfile(e.target.value)}>
            {profiles.map(p => <option key={p.profileType} value={p.profileType}>{p.displayName} — {p.module}</option>)}
          </select>
        </Field>
        <Grid>
          <Field id={`${id}-t`} label="Transport Type" help={help('Transport Type', 'Determined by profile selection')}>
            <input id={`${id}-t`} type="text" className="cpm-input" value={profile?.transport ?? 'MQTT'} disabled />
          </Field>
        </Grid>
        </div>
      </Part>
      {profile && (
        <Part title="Data routing">
          <p className="cpm-copy">
            MQTT topics (Advanced, suggested <code>{profile.defaultTopics.join(', ')}</code>)
            {' → '}<strong>{profile.displayName}</strong> parser
            {' → '}<code>{profile.destination}</code>
            {' → '}<strong>{profile.module}</strong>
          </p>
        </Part>
      )}
    </>
  );
};

export const NamePane: React.FC<{ form: WizardForm; set: Set }> = ({ form, set }) => {
  const id = useId();
  return (
    <Part title="Name">
      <div className="cpm-admin-stack">
      <Field id={`${id}-n`} label="Name *">
        <input id={`${id}-n`} type="text" className="cpm-input" value={form.name} placeholder="e.g., OT Gateway PRM upload"
          onChange={e => set('name', e.target.value)} />
      </Field>
      <Field id={`${id}-d`} label="Description">
        <textarea id={`${id}-d`} className="cpm-textarea" rows={3} value={form.description}
          placeholder="Optional: Describe this data source configuration" onChange={e => set('description', e.target.value)} />
      </Field>
      </div>
    </Part>
  );
};

export const ConnectionPane: React.FC<{ form: WizardForm; set: Set; isEdit: boolean }> = ({ form, set, isEdit }) => {
  const id = useId();
  return (
    <>
      <Part title="Broker">
        <Field id={`${id}-u`} label="Broker URL *"
          note={<span className="cpm-copy">Include the scheme and port. Use <code>mqtts://</code> for TLS (8883) or <code>mqtt://</code> for plaintext (1883).</span>}>
          <input id={`${id}-u`} type="text" className="cpm-input cpm-mono" value={form.connectionUrl} placeholder="mqtts://192.168.190.91:8883"
            onChange={e => set('connectionUrl', e.target.value)} />
        </Field>
      </Part>
      <Part title="Sign-in">
        <div className="cpm-reg-form-grid cpm-reg-form-grid--two">
          <Field id={`${id}-n`} label="Username *">
            <input id={`${id}-n`} type="text" className="cpm-input" value={form.username} autoComplete="off" onChange={e => set('username', e.target.value)} />
          </Field>
          <Field id={`${id}-w`} label={isEdit ? 'Password' : 'Password *'}>
            <input id={`${id}-w`} type="password" className="cpm-input" value={form.password} autoComplete="new-password"
              placeholder={isEdit ? 'Leave blank to keep current password' : ''} onChange={e => set('password', e.target.value)} />
          </Field>
        </div>
      </Part>
    </>
  );
};
