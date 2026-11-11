'use client';

/**
 * Add data source / Edit data source. CHG-172 (owner review, the approved sample docs/theme/redesign/samples/administration-
 * proposal.html, badge 14): a dialog with tabs Profile · Name · Connection · Advanced (it was a four-step wizard that replaced
 * the whole tab, with a stepper, "Step 4 of 4" and "← Back to list"). Forward through "Next: X →", back any time; the footer's
 * first button is Cancel on Profile and "← Back" after it; the last names the action (Create data source / Save changes).
 * A tab's problem shows once something on it was typed or Next was pressed on it, so "Name is required" never greets an empty
 * form; Next on a tab with a problem stays and shows it. Save checks every tab. The request, the checks and the CA file rules
 * are as before (wizard/wizardForm.ts).
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../ui/Dialog';
import { Tabs, tabPanelProps } from '../../ui/Tabs';
import { createDataSource, extractApiError, updateDataSource, type DataSourceDto, type ProfileInfo } from './dataSourcesApi';
import { WIZARD_TABS, buildBody, formFrom, stepProblem, type TlsMode, type WizardForm } from './wizard/wizardForm';
import { ConnectionPane, NamePane, ProfilePane } from './wizard/WizardBasics';
import { AdvancedPane } from './wizard/WizardAdvanced';

export const DataSourceWizard: React.FC<{
  profiles: ProfileInfo[];
  existing?: DataSourceDto;
  onDone: (saved: DataSourceDto) => void;
  onCancel: () => void;
}> = ({ profiles, existing, onDone, onCancel }) => {
  const isEdit = !!existing;
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [tried, setTried] = useState<boolean[]>([false, false, false, false]);
  const [form, setForm] = useState<WizardForm>(() => formFrom(profiles, existing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caError, setCaError] = useState<string | null>(null);

  const markTried = (s: number) => setTried(t => t.map((v, i) => (i === s ? true : v)));
  const set = <K extends keyof WizardForm>(key: K, value: WizardForm[K]) => {
    markTried(step);
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const profile = profiles.find(p => p.profileType === form.profileType);
  const problemOf = (s: number) => stepProblem(s, form, { profileKnown: !!profile, isEdit, caError });
  const shownProblem = tried[step] ? problemOf(step) : null;

  /** Picking a module adopts its suggested topic filters (create mode only: an edit never touches the configured topics). */
  const onProfileChange = (profileType: string) => {
    const next = profiles.find(p => p.profileType === profileType);
    markTried(0);
    setForm(prev => ({ ...prev, profileType, topics: !isEdit && next?.defaultTopics?.length ? [...next.defaultTopics] : prev.topics }));
  };

  /** Switching trust modes clears the other modes' state (the saved config can never disagree with what the form shows). */
  const switchTlsMode = (mode: TlsMode) => {
    setCaError(null);
    set('tlsMode', mode);
    setForm(prev => ({ ...prev, tlsMode: mode, caCertPem: '', caCertFileName: '', caCertPath: '' }));
  };

  const onCaFile = (file: File | undefined) => {
    setCaError(null);
    markTried(3);
    if (!file) return;
    if (file.size > 64 * 1024) { setCaError('File is larger than 64 KB — a CA certificate is a few KB; wrong file?'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '').trim();
      if (!text.includes('-----BEGIN CERTIFICATE-----')) { setCaError('Not a PEM certificate (missing BEGIN CERTIFICATE)'); return; }
      if (text.includes('PRIVATE KEY')) { setCaError('This file contains a private key — upload the CA certificate, never a key'); return; }
      setForm(prev => ({ ...prev, caCertPem: text, caCertFileName: file.name }));
    };
    reader.readAsText(file);
  };

  const goNext = () => {
    if (problemOf(step)) { markTried(step); return; }
    setStep(step + 1);
    setReached(r => Math.max(r, step + 1));
  };

  const save = async () => {
    const bad = [0, 1, 2, 3].find(s => problemOf(s));
    if (bad !== undefined) { markTried(bad); setStep(bad); return; }
    setSaving(true);
    setError(null);
    try {
      const body = buildBody(form, existing);
      onDone(isEdit ? await updateDataSource(existing!.configId, body) : await createDataSource(body));
    } catch (err) {
      const { message, field } = extractApiError(err);
      setError(field ? `${message} (${field})` : message);
    } finally {
      setSaving(false);
    }
  };

  const last = step === WIZARD_TABS.length - 1;
  const tab = WIZARD_TABS[step].value;
  const title = isEdit ? 'Edit data source' : 'Add data source';
  const footer = (
    <>
      <ObcButton variant="flat" disabled={saving} onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}>
        {step === 0 ? 'Cancel' : '← Back'}
      </ObcButton>
      {last
        ? <ObcButton variant="raised" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create data source'}</ObcButton>
        : <ObcButton variant="raised" onClick={goNext}>Next: {WIZARD_TABS[step + 1].label} {'→'}</ObcButton>}
    </>
  );

  return (
    <Dialog open size="wide" title={title} onClose={() => { if (!saving) onCancel(); }} footer={footer}>
      <div className="cpm-reg-editor">
        <Tabs idBase="admin-source" label={title} value={tab}
          options={WIZARD_TABS.map((t, i) => ({ value: t.value, label: t.label, disabled: i > reached }))}
          onChange={v => setStep(WIZARD_TABS.findIndex(t => t.value === v))} />
        <div className="cpm-reg-editor__panel" {...tabPanelProps('admin-source', tab)}>
          {step === 0 && <ProfilePane form={form} profiles={profiles} profile={profile} onProfile={onProfileChange} />}
          {step === 1 && <NamePane form={form} set={set} />}
          {step === 2 && <ConnectionPane form={form} set={set} isEdit={isEdit} />}
          {step === 3 && (
            <AdvancedPane form={form} set={set} profile={profile} clientIdPlaceholder={existing?.effectiveClientId ?? 'ingestion-<config-id>'}
              caError={caError} onTlsMode={switchTlsMode} onCaFile={onCaFile}
              onRemoveCa={() => { setCaError(null); set('caCertPem', ''); setForm(prev => ({ ...prev, caCertPem: '', caCertFileName: '' })); }} />
          )}
          {(shownProblem || error) && <p className="cpm-field__error" role="alert">{error ?? shownProblem}</p>}
        </div>
      </div>
    </Dialog>
  );
};

export default DataSourceWizard;
