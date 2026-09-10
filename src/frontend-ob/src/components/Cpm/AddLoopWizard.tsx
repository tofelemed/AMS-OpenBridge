'use client';

/**
 * Add / edit a control loop — five steps mapping 1:1 onto
 * POST /cpm/loops/activate.
 */
'use client';

/**
 * CPLM Phase 7 — U10 Loop Registry.
 * CPA-prototype IA parity: registry table + profile detail aside + 5-step
 * add-loop wizard + bulk CSV import, wired to the real onboarding API.
 * The prototype's "draft" concept maps to our immediate activate + readiness
 * report (the wizard shows readiness as its post-save validation step).
 */
import React, { useMemo, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { KvRow, PanelHead, TonePill, fmtDuration, fmtWindowShape, windowSpecsOf } from './shared';
import { useActivateLoop, useCpmReadiness, useCpmRegistryContract, useCpmResolutions } from '../../hooks/useCpm';
import type { CpmActivateRequest, CpmLoop, CpmTagMapEntry } from '../../api/cpmApi';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { PlantLocationPicker, SIGNAL_ROLES, deriveSignalPath, historianNode, isResolvablePath, loopIdProblem } from './plantLocation';
import type { PlantLocation } from './plantLocation';


// ── add-loop wizard (5 steps, maps 1:1 onto POST /cpm/loops/activate) ──────

const STEPS = ['Identity', 'Classification', 'Signal mappings', 'Windows & profile', 'Review'] as const;

interface WizardState {
  loopId: string; displayName: string; site: string; area: string; unit: string;
  loopType: string; criticality: string;
  pv: string; sp: string; op: string; mode: string; vp: string;
  thresholdProfileId: string; enableMonitoring: boolean;
  // Engineering ranges, held as strings so "not declared" stays distinguishable
  // from 0 — the API treats an omitted bound as undeclared and a 0 as a real one.
  pvMin: string; pvMax: string; opMin: string; opMax: string;
}

/** Blank stays blank: an undeclared bound must not round-trip as "0". */
const numText = (v: number | null | undefined): string =>
  v === null || v === undefined ? '' : String(v);

/** Blank -> undefined (undeclared); unparseable -> null (a validation error). */
function parseBound(text: string): number | null | undefined {
  const t = text.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Only declared bounds are sent, so an omitted one stays omitted server-side. */
function engineeringOf(f: { pvMin: string; pvMax: string; opMin: string; opMax: string }) {
  const range: Record<string, number> = {};
  for (const k of ['pvMin', 'pvMax', 'opMin', 'opMax'] as const) {
    const v = parseBound(f[k]);
    if (typeof v === 'number') range[k] = v;
  }
  return Object.keys(range).length > 0 ? range : null;
}

/**
 * Signal paths follow site/[area/]unit/<loopid>.<role>, so they are a pure
 * function of the location + loop tag. Re-derive any path the user has not
 * hand-edited (empty, or still equal to what the previous inputs derived) —
 * that is what stops five long paths being retyped per loop, and stops the
 * dotted IoTDB form being copied out of a placeholder. VP is opt-in: it is only
 * refreshed once it holds a value, since most loops have no position feedback.
 */
function withDerivedPaths(prev: WizardState, next: WizardState): WizardState {
  const prevLoc: PlantLocation = { site: prev.site, area: prev.area, unit: prev.unit };
  const nextLoc: PlantLocation = { site: next.site, area: next.area, unit: next.unit };
  const out = { ...next };
  for (const role of SIGNAL_ROLES) {
    const current = (prev[role] ?? '').trim();
    if (role === 'vp' && current === '') continue;
    if (current === '' || current === deriveSignalPath(prevLoc, prev.loopId, role))
      out[role] = deriveSignalPath(nextLoc, next.loopId, role);
  }
  return out;
}

export const AddLoopWizard: React.FC<{ existing: CpmLoop[]; editLoop?: CpmLoop; onClose: () => void }> = ({ existing, editLoop, onClose }) => {
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose);
  const contract = useCpmRegistryContract();
  const activate = useActivateLoop();
  // Step 3 shows the deployed window contract. Served, not restated — see the
  // comment at that step.
  const resolutions = useCpmResolutions();
  // Names-only fallback when the API predates the contract (see windowSpecsOf).
  const windowSpecs = useMemo(() => windowSpecsOf(resolutions.data, () => 0), [resolutions.data]);
  const shortWindowSummary = useMemo(
    () => windowSpecs
      .filter(w => w.tier === 'short')
      // Shape when the API served it, bare kind when it didn't.
      .map(w => fmtWindowShape(w) || w.kind)
      .join(' · '),
    [windowSpecs]);
  const longWindowSummary = useMemo(() => {
    const long = windowSpecs.filter(w => w.tier === 'long');
    if (!long.length) return '';
    // Same cadence across the long tier, so name it once rather than per slice.
    const cadence = long[0].cadenceMs;
    return `${long.map(w => w.kind).join(' / ')} slices${cadence ? ` · ${fmtDuration(cadence)} cadence` : ''}`;
  }, [windowSpecs]);
  const minSamplesFloor = useMemo(
    () => windowSpecs.find(w => w.minSamples != null)?.minSamples ?? null,
    [windowSpecs]);
  const isEdit = !!editLoop;
  const [step, setStep] = useState(0);
  const [savedLoopId, setSavedLoopId] = useState<string | null>(null);
  const [form, setForm] = useState<WizardState>(() => editLoop ? {
    // Edit mode: prefill from the existing loop. Activate is an upsert, so saving
    // with the same loopId updates it.
    loopId: editLoop.loopId, displayName: editLoop.displayName, site: editLoop.site,
    area: editLoop.area ?? '', unit: editLoop.unit ?? '',
    loopType: editLoop.loopType, criticality: editLoop.criticality,
    pv: editLoop.tags['PV'] ?? '', sp: editLoop.tags['SP'] ?? '', op: editLoop.tags['OP'] ?? '',
    mode: editLoop.tags['MODE'] ?? '', vp: editLoop.tags['VP'] ?? '',
    thresholdProfileId: editLoop.thresholdProfileId ?? '', enableMonitoring: editLoop.monitoringEnabled,
    pvMin: numText(editLoop.engineering?.pvMin), pvMax: numText(editLoop.engineering?.pvMax),
    opMin: numText(editLoop.engineering?.opMin), opMax: numText(editLoop.engineering?.opMax),
  } : {
    // site starts EMPTY: the old 'site1' placeholder was a site that exists in
    // no asset model, and activation now rejects unmodelled locations (G-07) —
    // a default that steers every new loop into a 422 is worse than forcing a
    // pick from the cascade.
    loopId: '', displayName: '', site: '', area: '', unit: '',
    loopType: 'FIC', criticality: 'medium',
    pv: '', sp: '', op: '', mode: '', vp: '',
    thresholdProfileId: '', enableMonitoring: true,
    pvMin: '', pvMax: '', opMin: '', opMax: '',
  });
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
  const identityValid = form.loopId.trim() !== '' && !loopIdIssue && !nodeClash
    && form.displayName.trim() !== '' && form.site.trim() !== '' && !duplicate;
  const signalsValid = !form.enableMonitoring
    || (form.pv.trim() !== '' && form.sp.trim() !== '' && form.op.trim() !== '' && form.mode.trim() !== '');
  const rangeIssue = (['pvMin', 'pvMax', 'opMin', 'opMax'] as const)
    .some(k => parseBound(form[k]) === null) ? 'Engineering ranges must be numbers' : null;
  // Half a range is worse than none: the API defaults the missing bound (0 / 100),
  // which silently invents a span nobody declared.
  const halfRange = ([['pvMin', 'pvMax', 'PV'], ['opMin', 'opMax', 'OP']] as const)
    .filter(([lo, hi]) => (form[lo].trim() === '') !== (form[hi].trim() === ''))
    .map(([, , label]) => label);
  const canContinue = step === 0 ? identityValid
    : step === 1 ? rangeIssue === null
    : step === 2 ? signalsValid : true;

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
            <p className="cpm-copy" style={{ marginTop: 12 }}>
              The dynamics class is resolved from the loop type ({form.loopType}). Selecting
              UNKNOWN disables geometry-based diagnosis (prior 0.0) until reclassified.
            </p>

            <div className="cpm-field__label" style={{ marginTop: 18 }}>Engineering ranges</div>
            <p className="cpm-copy" style={{ marginBottom: 10 }}>
              Optional, and neither is cosmetic. <strong>PV range</strong> scales the good-error
              band G3 and OCE use — undeclared, that band is a fixed ±0.5&nbsp;EU, which no
              temperature or flow loop in engineering units can meet. <strong>OP range</strong>
              normalises the output to 0–100 before saturation (G10) and operating-region (G2r)
              maths. Leave both blank to keep today's behaviour.
            </p>
            <div className="cpm-wizard-grid">
              {([['pvMin', 'PV minimum'], ['pvMax', 'PV maximum'],
                 ['opMin', 'OP minimum'], ['opMax', 'OP maximum']] as const).map(([k, label]) => (
                <label key={k} className="cpm-field">
                  <span className="cpm-field__label">{label}</span>
                  <input
                    className={`cpm-input${parseBound(form[k]) === null ? ' cpm-input--error' : ''}`}
                    value={form[k]} onChange={set(k)} inputMode="decimal"
                    placeholder={k.startsWith('pv') ? 'e.g. 0 / 250' : 'e.g. 0 / 100'} />
                </label>
              ))}
            </div>
            {rangeIssue && <span className="cpm-field__error">{rangeIssue}</span>}
            {halfRange.length > 0 && (
              <span className="cpm-field__error">
                {halfRange.join(' and ')} range is half-declared — the missing bound defaults
                (min 0, max 100), inventing a span. Give both bounds or neither.
              </span>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <p className="cpm-copy" style={{ marginBottom: 12 }}>
              Derived from the location and loop tag as
              <code> site/[area/]unit/&lt;loop&gt;.&lt;role&gt;</code> — edit any path to override it.
            </p>
            <div className="cpm-wizard-grid">
              {([['pv', 'PV · Process variable *'], ['sp', 'SP · Setpoint *'],
                 ['op', 'OP · Controller output *'], ['mode', 'MODE · Controller mode *'],
                 ['vp', 'VP · Valve position · optional']] as const).map(([k, label]) => {
                const derived = deriveSignalPath(
                  { site: form.site, area: form.area, unit: form.unit }, form.loopId, k);
                const shaped = form[k].trim() === '' || isResolvablePath(form[k]);
                return (
                  <label key={k} className="cpm-field">
                    <span className="cpm-field__label">{label}</span>
                    <input className={`cpm-input cpm-mono${shaped ? '' : ' cpm-input--error'}`}
                      value={form[k]} onChange={set(k)} placeholder={derived || 'site/unit/loop.role'} />
                    {!shaped && (
                      <span className="cpm-field__error">
                        Not a UNS contextual path. Use slashes (site/unit/loop.{k}), not the dotted
                        root.… historian form — the binding resolver cannot resolve it.
                      </span>
                    )}
                    {k === 'vp' && form.vp.trim() === '' && derived && (
                      <button type="button" className="cpm-pill cpm-pill--muted"
                        style={{ cursor: 'pointer', marginTop: 4, alignSelf: 'flex-start' }}
                        onClick={() => setForm(f => ({ ...f, vp: derived }))}>
                        + add VP as {derived}
                      </button>
                    )}
                  </label>
                );
              })}
            </div>
            <p className="cpm-copy" style={{ marginTop: 12 }}>
              Paths resolve through the binding resolver; the readiness report flags any
              signal that falls back to path-pattern resolution instead of the asset model.
              Without VP, confidence is capped at 0.89 and no diagnosis can reach CONFIRMED.
            </p>
          </>
        )}

        {step === 3 && (
          <>
            {/* Read from the served window contract rather than restating it: this
                was the third hardcoded copy of the same facts, and the other two
                had drifted into claiming every short window was tumbling. */}
            <KvRow label="Short features (G0–G4)">
              {shortWindowSummary || '—'}
            </KvRow>
            <KvRow label="Long diagnostics (G5–G11)">
              {longWindowSummary || '—'}
            </KvRow>
            <KvRow label="Fusion (G12–G15)">
              {resolutions.data?.fusion
                ? `Fires on ${resolutions.data.fusion.firesOn.join(' and ')} long records`
                : '—'}
            </KvRow>
            <p className="cpm-copy" style={{ marginTop: 12 }}>
              Windows are fixed by the deployed pipeline; they are shown here so the reviewer
              knows what cadence to expect. First fused verdict needs ≥ 12 h of samples
              {minSamplesFloor != null ? `, and any slice with fewer than ${minSamplesFloor} samples is not evaluated at all` : ''}.
            </p>
          </>
        )}

        {step === 4 && !savedLoopId && (
          <>
            <PanelHead eyebrow="New control loop" title={form.loopId || '—'} right={<TonePill tone="warn">READY TO SAVE</TonePill>} />
            <KvRow label="Service">{form.displayName}</KvRow>
            <KvRow label="Location">{[form.site, form.area, form.unit].filter(Boolean).join(' / ')}</KvRow>
            <KvRow label="Type / criticality">{form.loopType} · {form.criticality}</KvRow>
            <KvRow label="Signals">{['pv', 'sp', 'op', 'mode', 'vp'].filter(k => form[k as keyof WizardState]).map(k => k.toUpperCase()).join(' · ') || 'none'}</KvRow>
            <KvRow label="Engineering ranges">
              {[form.pvMin || form.pvMax ? `PV ${form.pvMin || '0'}–${form.pvMax || '100'}` : null,
                form.opMin || form.opMax ? `OP ${form.opMin || '0'}–${form.opMax || '100'}` : null]
                .filter(Boolean).join(' · ') || 'not declared (PV band stays ±0.5 EU)'}
            </KvRow>
            <KvRow label="Monitoring">{form.enableMonitoring ? 'Enabled on save' : 'Registered only'}</KvRow>
            {activate.isError && (
              <p className="cpm-field__error" style={{ marginTop: 8 }}>
                {/* ApiError carries the server's problem detail (422 validation,
                    409 case-collision) — String() prefixed it with "Error:". */}
                {activate.error instanceof Error ? activate.error.message : String(activate.error)}
              </p>
            )}
          </>
        )}

        {step === 4 && savedLoopId && (
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
                <TonePill tone={c.ok ? 'good' : 'warn'}>{c.ok ? 'OK' : c.message ?? 'Check'}</TonePill>
              </KvRow>
            ))}
          </>
        )}

        <div className="cpm-wizard-footer">
          <ObcButton variant="normal" onClick={savedLoopId ? onClose : (step === 0 ? onClose : () => setStep(s => s - 1))}>
            {savedLoopId ? 'Close' : step === 0 ? 'Cancel' : 'Back'}
          </ObcButton>
          <span className="cpm-copy">Step {Math.min(step + 1, 5)} of 5</span>
          {!savedLoopId && (step < 4
            ? <ObcButton variant="raised" disabled={!canContinue} onClick={() => setStep(s => s + 1)}>Continue ›</ObcButton>
            : <ObcButton variant="raised" disabled={activate.isPending} onClick={save}>
                {activate.isPending ? (isEdit ? 'Updating…' : 'Activating…') : (isEdit ? 'Update loop' : 'Activate loop')}
              </ObcButton>)}
        </div>
      </div>
    </div>
  );
};

export default AddLoopWizard;
