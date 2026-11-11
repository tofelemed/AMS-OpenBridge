'use client';

/**
 * CPLM Phase 7 — U10 Loop Registry: add / edit a control loop, mapping 1:1 onto POST /cpm/loops/activate (an upsert, so saving
 * an edit with the same loopId updates it); the readiness after saving is the post-save validation (CHG-098: every step blocks
 * Next with the reason beside the field and beside the button; the review shows an edit's changes with their effect).
 *
 * CHG-168 (owner review, the approved sample docs/theme/redesign/samples/loop-registry-proposal.html and the answers of 11 Nov):
 * a dialog titled after the button that opens it, "Add loop" / "Edit configuration", with tabs Identity · Classification ·
 * Signals · Review and "Next: X →" (forward only through Next, back any time; no "Step 1 of 4", no eyebrow, the tag the first
 * field); fields under short titled parts, the help behind ?; the ranges on the Signals tab beside the paths they scale; the
 * review open; a Monitored switch (owner answer 3a) and three valve-position choices (3b). Every field, rule and request stays.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../ui/Dialog';
import { Tabs, tabPanelProps } from '../../ui/Tabs';
import { useActivateLoop, useCpmReadiness, useCpmRegistryContract } from '../../hooks/useCpm';
import type { CpmLoop } from '../../api/cpmApi';
import { isExplicit, modelOf } from './registry/wizard/ClassificationStep';
import { historianNode, loopIdProblem, type PlantLocation } from './plantLocation';
import { ReasonedButton } from './ReasonedButton';
import { activateRequestOf, firstProblem, initialForm, rangeChecks, signalChecks, withDerivedPaths, type WizardState } from './registry/wizard/wizardForm';
import { IdentityTab } from './registry/wizard/IdentityTab';
import { ClassificationTab } from './registry/wizard/ClassificationTab';
import { PATH_FIELDS, SignalsTab } from './registry/wizard/SignalsTab';
import { ReviewStep } from './registry/wizard/ReviewStep';
import { SavedReadiness } from './registry/wizard/SavedReadiness';

const TABS = [
  { value: 'identity', label: 'Identity' },
  { value: 'classification', label: 'Classification' },
  { value: 'signals', label: 'Signals' },
  { value: 'review', label: 'Review' },
] as const;
type Tab = (typeof TABS)[number]['value'];
const REVIEW = TABS.length - 1;

const RANGE_LABELS: Record<string, string> = { pvMin: 'PV minimum', pvMax: 'PV maximum', opMin: 'OP minimum', opMax: 'OP maximum', pvUnit: 'PV unit' };
const PATH_LABELS: Record<string, string> = { pv: 'PV path', sp: 'SP path', op: 'OP path', mode: 'MODE path', vp: 'VP path' };
const FALLBACK_TYPES = ['FIC', 'PIC', 'PIC_GAS', 'PIC_VAPOUR', 'LIC', 'TIC', 'UNKNOWN'];

export const AddLoopWizard: React.FC<{ existing: CpmLoop[]; editLoop?: CpmLoop; onClose: () => void }> = ({ existing, editLoop, onClose }) => {
  const contract = useCpmRegistryContract();
  const activate = useActivateLoop();
  const isEdit = !!editLoop;
  const [step, setStep] = useState(0);
  const [savedLoopId, setSavedLoopId] = useState<string | null>(null);
  // CHG-098 (SME review 2 #28): the prefilled form is kept as the "before" side of the review diff.
  const [original] = useState<WizardState | undefined>(() => editLoop ? initialForm(editLoop) : undefined);
  const [form, setForm] = useState<WizardState>(() => original ?? initialForm());
  const readiness = useCpmReadiness(savedLoopId ?? undefined);
  // P5.3: manual location entry (or an empty asset model) means the location is unchecked client-side; the server enforces
  // G-07, so the activate request must carry the explicit override in that case.
  const [manualLoc, setManualLoc] = useState(false);

  const set = (k: keyof WizardState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => {
      const next = { ...f, [k]: k === 'loopId' ? e.target.value.toUpperCase() : e.target.value };
      return k === 'loopId' ? withDerivedPaths(f, next) : next;
    });
  const setLocation = (loc: PlantLocation) => setForm(f => withDerivedPaths(f, { ...f, ...loc }));

  // In edit mode the loopId is the identity being updated, so it is never a "duplicate" of itself.
  const duplicate = !isEdit && existing.some(l => l.loopId.toUpperCase() === form.loopId.toUpperCase());
  // Plant tags keep their punctuation (45FIC-109); only characters that break a URL segment or a job argument are refused.
  const loopIdIssue = loopIdProblem(form.loopId);
  // Two ids differing only in punctuation sanitise to ONE historian device and merge their PV/SP/OP.
  const nodeClash = !isEdit && form.loopId.trim() !== '' && !duplicate
    ? existing.find(l => historianNode(l.loopId) === historianNode(form.loopId))?.loopId ?? null
    : null;
  const identityProblem = !form.loopId.trim() ? 'Loop tag is required'
    : duplicate ? 'Loop tag: this tag already exists'
    : loopIdIssue ? `Loop tag: ${loopIdIssue}`
    : nodeClash ? `Loop tag collides with “${nodeClash}” in the historian`
    : !form.displayName.trim() ? 'Service / description is required'
    : !form.site.trim() ? 'Site is required' : null;
  const modelIssue = isExplicit(form.model) && modelOf(form.model) === null;
  const classificationProblem = modelIssue ? 'Loop model: complete or clear the explicit classification' : null;
  const ranges = rangeChecks(form);
  const paths = signalChecks(form, original);
  const signalProblem = firstProblem(Object.fromEntries(PATH_FIELDS.map(([k]) => [k, paths[k].error])), PATH_LABELS)
    ?? firstProblem(ranges, RANGE_LABELS);
  const stepProblem = step === 0 ? identityProblem : step === 1 ? classificationProblem : step === 2 ? signalProblem : null;

  const save = () => activate.mutate(activateRequestOf(form, editLoop, manualLoc), { onSuccess: (loop) => setSavedLoopId(loop.loopId) });
  const close = () => { if (!activate.isPending) onClose(); };
  const next = TABS[step + 1];
  const tab: Tab = TABS[step].value;

  const footer = savedLoopId
    ? <ObcButton variant="raised" onClick={onClose}>Close</ObcButton>
    : (
      <>
        <ObcButton variant="flat" disabled={activate.isPending} onClick={onClose}>Cancel</ObcButton>
        {step > 0 && <ObcButton variant="normal" disabled={activate.isPending} onClick={() => setStep(s => s - 1)}>Back</ObcButton>}
        {next
          ? <ReasonedButton variant="raised" disabled={stepProblem !== null} reason={stepProblem} onClick={() => setStep(s => s + 1)}>Next: {next.label} {'→'}</ReasonedButton>
          : (
            <ObcButton variant="raised" disabled={activate.isPending} onClick={save}>
              {activate.isPending ? (isEdit ? 'Updating…' : 'Activating…') : (isEdit ? 'Update loop' : 'Activate loop')}
            </ObcButton>
          )}
      </>
    );

  return (
    <Dialog open size="wide" title={isEdit ? 'Edit configuration' : 'Add loop'} onClose={close} footer={footer}>
      {savedLoopId ? <SavedReadiness readiness={readiness.data} /> : (
        <div className="cpm-reg-editor">
          <Tabs idBase="cpm-loop-editor" label={isEdit ? 'Edit configuration' : 'Add loop'} value={tab}
            options={TABS.map((t, i) => ({ value: t.value, label: t.label, disabled: i > step }))}
            onChange={v => setStep(TABS.findIndex(t => t.value === v))} />
          <div className="cpm-reg-editor__panel" {...tabPanelProps('cpm-loop-editor', tab)}>
            {step === 0 && (
              <IdentityTab form={form} isEdit={isEdit} issues={{ duplicate, loopIdIssue, nodeClash }} set={set}
                loopTypes={contract.data?.loopTypes ?? FALLBACK_TYPES} onLocation={setLocation} onManualMode={setManualLoc} />
            )}
            {step === 1 && <ClassificationTab form={form} contract={contract.data?.model} set={set} onForm={setForm} />}
            {step === 2 && <SignalsTab form={form} original={original} paths={paths} ranges={ranges} set={set} onForm={setForm} />}
            {step === REVIEW && (
              <ReviewStep form={form} original={original}
                // ApiError carries the server's problem detail (422 validation, 409 case-collision) — String() prefixed it with "Error:".
                error={activate.isError ? (activate.error instanceof Error ? activate.error.message : String(activate.error)) : null} />
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
};

export default AddLoopWizard;
