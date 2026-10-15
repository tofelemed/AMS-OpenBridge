'use client';

/**
 * CPLM Phase 7 — U10 Loop Registry: add / edit a control loop, mapping 1:1
 * onto POST /cpm/loops/activate.
 * CPA-prototype IA parity: registry table + profile detail aside + add-loop
 * wizard + bulk CSV import, wired to the real onboarding API.
 * The prototype's "draft" concept maps to our immediate activate + readiness
 * report (the wizard shows readiness as its post-save validation step).
 *
 * CHG-098 (SME review 2 #28): four steps, not five — the fixed pipeline windows
 * moved under a help toggle on the review step. Every step blocks Continue with
 * the reason beside the field and beside the button; signal paths use the full
 * row with Copy; the review lists the paths and, for an edit, only what changed
 * with its expected effect. Form model and rules live in registry/wizard/.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { PanelHead, TonePill, KvRow } from './shared';
import { useActivateLoop, useCpmReadiness, useCpmRegistryContract } from '../../hooks/useCpm';
import type { CpmActivateRequest, CpmLoop, CpmTagMapEntry } from '../../api/cpmApi';
import { ClassificationStep, isExplicit, modelOf } from './registry/wizard/ClassificationStep';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { PlantLocationPicker, deriveSignalPath, historianNode, loopIdProblem } from './plantLocation';
import type { PlantLocation } from './plantLocation';
import { NO_VP_COPY } from './investigation/confirmationCopy';
import { OptionalInputFields, hasVpChecked } from './OptionalInputFields';
import { factStateLabel } from './optionalInputs';
import { ReasonedButton } from './ReasonedButton';
import { engineeringOf, firstProblem, initialForm, rangeChecks, signalChecks, withDerivedPaths, type WizardState } from './registry/wizard/wizardForm';
import { SignalPathField } from './registry/wizard/SignalPathField';
import { ReviewStep } from './registry/wizard/ReviewStep';

const STEPS = ['Identity', 'Classification', 'Signal mappings', 'Review'] as const;
const REVIEW = STEPS.length - 1;

const RANGE_LABELS: Record<string, string> = { pvMin: 'PV minimum', pvMax: 'PV maximum', opMin: 'OP minimum', opMax: 'OP maximum', pvUnit: 'PV unit' };
const PATH_FIELDS = [['pv', 'PV · Process variable *'], ['sp', 'SP · Setpoint *'],
  ['op', 'OP · Controller output *'], ['mode', 'MODE · Controller mode *'],
  ['vp', 'VP · Valve position · optional']] as const;
const PATH_LABELS: Record<string, string> = { pv: 'PV path', sp: 'SP path', op: 'OP path', mode: 'MODE path', vp: 'VP path' };

export const AddLoopWizard: React.FC<{ existing: CpmLoop[]; editLoop?: CpmLoop; onClose: () => void }> = ({ existing, editLoop, onClose }) => {
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose);
  const contract = useCpmRegistryContract();
  const activate = useActivateLoop();
  const isEdit = !!editLoop;
  const [step, setStep] = useState(0);
  const [savedLoopId, setSavedLoopId] = useState<string | null>(null);
  // Edit mode: prefill from the existing loop. Activate is an upsert, so saving with the same loopId updates it.
  // CHG-098 (SME review 2 #28): the prefilled form is kept as the "before" side of the review diff.
  const [original] = useState<WizardState | undefined>(() => editLoop ? initialForm(editLoop) : undefined);
  const [form, setForm] = useState<WizardState>(() => original ?? initialForm());
  const readiness = useCpmReadiness(savedLoopId ?? undefined);
  // P5.3: manual location entry (or an empty asset model) means the location is
  // unchecked client-side; the server enforces G-07, so the activate request
  // must carry the explicit override in that case.
  const [manualLoc, setManualLoc] = useState(false);

  const set = (k: keyof WizardState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => {
      const next = { ...f, [k]: k === 'loopId' ? e.target.value.toUpperCase() : e.target.value };
      return k === 'loopId' ? withDerivedPaths(f, next) : next;
    });

  const setLocation = (loc: PlantLocation) =>
    setForm(f => withDerivedPaths(f, { ...f, ...loc }));

  // In edit mode the loopId is fixed (it's the identity we're updating), so it is
  // never a "duplicate" of itself.
  const duplicate = !isEdit && existing.some(l => l.loopId.toUpperCase() === form.loopId.toUpperCase());
  // Plant tags keep their punctuation (45FIC-109); only characters that break a
  // URL segment or a job argument are refused — mirrors the server.
  const loopIdIssue = loopIdProblem(form.loopId);
  // The real hazard behind the old charset ban: two ids differing only in
  // punctuation sanitise to ONE historian device and merge their PV/SP/OP.
  const nodeClash = !isEdit && form.loopId.trim() !== '' && !duplicate
    ? existing.find(l => historianNode(l.loopId) === historianNode(form.loopId))?.loopId ?? null
    : null;
  const identityProblem = !form.loopId.trim() ? 'Loop tag is required'
    : duplicate ? 'Loop tag: this tag already exists'
    : loopIdIssue ? `Loop tag: ${loopIdIssue}`
    : nodeClash ? `Loop tag collides with “${nodeClash}” in the historian`
    : !form.displayName.trim() ? 'Service / description is required'
    : !form.site.trim() ? 'Site is required' : null;
  const ranges = rangeChecks(form);
  const modelIssue = isExplicit(form.model) && modelOf(form.model) === null;
  const classificationProblem = firstProblem(ranges, RANGE_LABELS)
    ?? (modelIssue ? 'Loop model: complete or clear the explicit classification' : null);
  const paths = signalChecks(form, original);
  const signalProblem = firstProblem(Object.fromEntries(PATH_FIELDS.map(([k]) => [k, paths[k].error])), PATH_LABELS);
  const stepProblem = step === 0 ? identityProblem : step === 1 ? classificationProblem : step === 2 ? signalProblem : null;

  const buildRequest = (): CpmActivateRequest => {
    const tags: CpmTagMapEntry[] = [];
    const add = (role: string, path: string) => {
      if (path.trim()) tags.push({ signalRole: role, unsPath: path.trim() });
    };
    add('PV', form.pv); add('SP', form.sp); add('OP', form.op);
    add('MODE', form.mode); add('VP', form.vp);
    return {
      loopId: form.loopId.trim(),
      displayName: form.displayName.trim(),
      site: form.site.trim(),
      area: form.area.trim() || null,
      unit: form.unit.trim() || null,
      loopType: form.loopType,
      criticality: form.criticality,
      tags,
      thresholdProfileId: form.thresholdProfileId.trim() || null,
      enableMonitoring: form.enableMonitoring,
      engineering: engineeringOf(form),
      allowUnmodelledLocation: manualLoc,
      // v2.5 (2G.1): only an explicit declaration is sent; omitted keeps a stored EXPLICIT model or takes the preset
      model: modelOf(form.model),
    };
  };

  const save = () => {
    activate.mutate(buildRequest(), { onSuccess: (loop) => setSavedLoopId(loop.loopId) });
  };

  const loopTypes = contract.data?.loopTypes ?? ['FIC', 'PIC', 'PIC_GAS', 'PIC_VAPOUR', 'LIC', 'TIC', 'UNKNOWN'];

  return (
    <div className="cpm-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !activate.isPending) onClose(); }}>
      <div ref={dialogRef} className="cpm-modal" role="dialog" aria-modal="true" tabIndex={-1} aria-label={isEdit ? 'Edit control loop' : 'Add control loop'}>
        <PanelHead eyebrow="Governed registry workflow" title={isEdit ? `Edit loop ${editLoop!.loopId}` : 'Add control loop'} />
        <div className="cpm-wizard-steps">
          {STEPS.map((s, i) => (
            <button
              key={s}
              className={`cpm-wizard-step${i === step ? ' cpm-wizard-step--active' : ''}${i < step ? ' cpm-wizard-step--done' : ''}`}
              onClick={() => { if (i < step) setStep(i); }}
              type="button"
            >
              {i < step ? '✓ ' : ''}{s}
            </button>
          ))}
        </div>

        {step === 0 && (
          <div className="cpm-wizard-grid">
            <label className="cpm-field">
              <span className="cpm-field__label">Loop tag *</span>
              <input className={`cpm-input${duplicate || loopIdIssue || nodeClash ? ' cpm-input--error' : ''}`} value={form.loopId} onChange={set('loopId')} placeholder="45FIC-109" disabled={isEdit} title={isEdit ? 'Loop ID is the identity and cannot be changed' : undefined} />
              {duplicate && <span className="cpm-field__error">This tag already exists</span>}
              {loopIdIssue && <span className="cpm-field__error">{loopIdIssue}</span>}
              {nodeClash && (
                <span className="cpm-field__error">
                  Collides with “{nodeClash}” in the historian — both become device{' '}
                  <span className="cpm-mono">{historianNode(form.loopId)}</span>, so their trends
                  would merge. Use an id that differs by more than punctuation.
                </span>
              )}
            </label>
            <label className="cpm-field">
              <span className="cpm-field__label">Service / description *</span>
              <input className="cpm-input" value={form.displayName} onChange={set('displayName')} placeholder="Natural gas feed flow" />
            </label>
            <PlantLocationPicker
              value={{ site: form.site, area: form.area, unit: form.unit }}
              onChange={setLocation}
              onManualModeChange={setManualLoc}
            />
            <label className="cpm-field">
              <span className="cpm-field__label">Loop type *</span>
              <select className="cpm-select" value={form.loopType} onChange={set('loopType')}>
                {loopTypes.map(t => <option key={t}>{t}</option>)}
              </select>
            </label>
          </div>
        )}

        {step === 1 && (
          <>
            <div className="cpm-wizard-grid">
              <label className="cpm-field">
                <span className="cpm-field__label">Criticality</span>
                <select className="cpm-select" value={form.criticality} onChange={set('criticality')}>
                  {['low', 'medium', 'high', 'critical'].map(c => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="cpm-field">
                <span className="cpm-field__label">Gate profile</span>
                <input className="cpm-input" value={form.thresholdProfileId} onChange={set('thresholdProfileId')} placeholder="default" />
              </label>
            </div>
            <ClassificationStep loopType={form.loopType} contract={contract.data?.model} form={form.model} onChange={m => setForm(f => ({ ...f, model: m }))} />

            <div className="cpm-field__label" style={{ marginTop: 18 }}>Engineering ranges</div>
            <p className="cpm-copy" style={{ marginBottom: 10 }}>
              Optional, and neither is cosmetic. <strong>PV range</strong> scales the good-error
              band G3 and OCE use — undeclared, that band is a fixed ±0.5&nbsp;EU, which no
              temperature or flow loop in engineering units can meet. <strong>OP range</strong>
              normalises the output to 0–100 before saturation (G10) and operating-region (G2r)
              maths. Give both bounds of a range or neither; leave both blank to keep today's behaviour.
            </p>
            <div className="cpm-wizard-grid">
              {([['pvMin', 'PV minimum'], ['pvMax', 'PV maximum'],
                 ['opMin', 'OP minimum'], ['opMax', 'OP maximum']] as const).map(([k, label]) => (
                <label key={k} className="cpm-field">
                  <span className="cpm-field__label">{label}</span>
                  <input
                    className={`cpm-input${ranges[k] ? ' cpm-input--error' : ''}`}
                    value={form[k]} onChange={set(k)} inputMode="decimal" aria-invalid={ranges[k] ? true : undefined}
                    placeholder={k.startsWith('pv') ? 'e.g. 0 / 250' : 'e.g. 0 / 100'} />
                  {ranges[k] && <span className="cpm-field__error">{ranges[k]}</span>}
                </label>
              ))}
              <label className="cpm-field">
                <span className="cpm-field__label">PV unit</span>
                <input className={`cpm-input${ranges.pvUnit ? ' cpm-input--error' : ''}`}
                  value={form.pvUnit} onChange={set('pvUnit')} maxLength={24} placeholder="e.g. kg/h, °C, barg" />
                {ranges.pvUnit && <span className="cpm-field__error">{ranges.pvUnit}</span>}
              </label>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="cpm-copy" style={{ marginBottom: 12 }}>
              Derived from the location and loop tag as
              <code> site/[area/]unit/&lt;loop&gt;.&lt;role&gt;</code> — edit any path to override it.
            </p>
            <div className="cpm-path-list">
              {PATH_FIELDS.map(([k, label]) => {
                const derived = deriveSignalPath(
                  { site: form.site, area: form.area, unit: form.unit }, form.loopId, k);
                return (
                  <SignalPathField key={k} id={`cpm-wizard-path-${k}`} label={label} value={form[k]}
                    placeholder={derived || 'site/unit/loop.role'} check={paths[k]} onChange={set(k)}>
                    {k === 'vp' && form.vp.trim() === '' && derived && (
                      <button type="button" className="cpm-pill cpm-pill--muted"
                        style={{ cursor: 'pointer', marginTop: 4, alignSelf: 'flex-start' }}
                        onClick={() => setForm(f => ({ ...f, vp: derived }))}>
                        + add VP as {derived}
                      </button>
                    )}
                  </SignalPathField>
                );
              })}
            </div>
            <OptionalInputFields form={form} onChange={set}
              onVpChange={v => setForm(f => ({ ...f, vpApplicability: v }))} />
            {/* CHG-077: the G14 note only where it is true - a VP is declared and none is mapped */}
            {hasVpChecked(form.vpApplicability) && !form.vp.trim() && (
              <p className="cpm-copy" style={{ marginTop: 12 }}>{NO_VP_COPY}</p>
            )}
          </>
        )}

        {step === REVIEW && !savedLoopId && (
          <ReviewStep form={form} original={original}
            // ApiError carries the server's problem detail (422 validation, 409 case-collision) — String() prefixed it with "Error:".
            error={activate.isError ? (activate.error instanceof Error ? activate.error.message : String(activate.error)) : null} />
        )}

        {step === REVIEW && savedLoopId && (
          <>
            <PanelHead
              eyebrow="Activation result"
              title={savedLoopId}
              right={readiness.data
                ? <TonePill tone={readiness.data.ready ? (readiness.data.degraded ? 'warn' : 'good') : 'bad'}>
                    {readiness.data.ready ? (readiness.data.degraded ? 'READY · DEGRADED' : 'READY') : 'BLOCKED'}
                  </TonePill>
                : <TonePill tone="muted">CHECKING…</TonePill>}
            />
            {(readiness.data?.checks ?? []).map(c => (
              <KvRow key={c.id} label={c.label}>
                {c.ok && factStateLabel(c.state)
                  ? <TonePill tone="muted">{factStateLabel(c.state)}</TonePill>
                  : <TonePill tone={c.ok ? 'good' : 'warn'}>{c.ok ? 'OK' : c.message ?? 'Check'}</TonePill>}
              </KvRow>
            ))}
          </>
        )}

        <div className="cpm-wizard-footer">
          <ObcButton variant="normal" onClick={savedLoopId ? onClose : (step === 0 ? onClose : () => setStep(s => s - 1))}>
            {savedLoopId ? 'Close' : step === 0 ? 'Cancel' : 'Back'}
          </ObcButton>
          <span className="cpm-copy">Step {step + 1} of {STEPS.length}</span>
          {!savedLoopId && (step < REVIEW
            ? <ReasonedButton variant="raised" disabled={stepProblem !== null} reason={stepProblem} onClick={() => setStep(s => s + 1)}>Continue ›</ReasonedButton>
            : <ObcButton variant="raised" disabled={activate.isPending} onClick={save}>
                {activate.isPending ? (isEdit ? 'Updating…' : 'Activating…') : (isEdit ? 'Update loop' : 'Activate loop')}
              </ObcButton>)}
        </div>
      </div>
    </div>
  );
};

export default AddLoopWizard;
