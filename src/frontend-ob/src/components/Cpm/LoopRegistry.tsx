'use client';

/**
 * CPLM Phase 7 — U10 Loop Registry.
 * CPA-prototype IA parity: registry table + profile detail aside + 5-step
 * add-loop wizard + bulk CSV import, wired to the real onboarding API.
 * The prototype's "draft" concept maps to our immediate activate + readiness
 * report (the wizard shows readiness as its post-save validation step).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcProgressBar } from '@oicl/openbridge-webcomponents-react/components/progress-bar/progress-bar';
import {
  EmptyState, KvRow, PanelHead, QueryError, TonePill, WorkspaceHeader, fmtDuration,
  fmtWindowShape, windowSpecsOf,
} from './shared';
import {
  useActivateLoop, useCpmLoops, useCpmReadiness, useCpmRegistryContract,
  useCpmResolutions, useRepublishEvidence,
} from '../../hooks/useCpm';
import { bulkActivateLoops } from '../../api/cpmApi';
import { ApiError } from '../../api/apiFetch';
import type { CpmActivateRequest, CpmLoop, CpmTagMapEntry } from '../../api/cpmApi';
import { useQueryClient } from '@tanstack/react-query';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import {
  PlantLocationPicker, SIGNAL_ROLES, areasOf, deriveSignalPath, historianNode,
  isResolvablePath, loopIdProblem, unitsOf, usePlantLocations,
} from './plantLocation';
import type { PlantLocation, SignalRole } from './plantLocation';

// ── helpers ────────────────────────────────────────────────────────────────

/** CPA derivation kept for display: dynamic class from loop type. */
function dynamicClassOf(loop: CpmLoop): string {
  switch (loop.loopType) {
    case 'LIC': return 'INTEGRATING';
    case 'TIC': return 'SLOW_SELF_REG';
    default: return 'FAST_SELF_REG';
  }
}

function stateOf(loop: CpmLoop): { label: string; tone: 'good' | 'warn' | 'muted' } {
  if (!loop.isActive) return { label: 'Inactive', tone: 'muted' };
  if (!loop.monitoringEnabled) return { label: 'Registered', tone: 'muted' };
  if (loop.observabilityFlags.includes('NO_UPSTREAM_LINKS')
      || loop.observabilityFlags.includes('NO_VP'))
    return { label: 'Degraded', tone: 'warn' };
  return { label: 'Active', tone: 'good' };
}

// ── screen ─────────────────────────────────────────────────────────────────

export const LoopRegistry: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('loop') ?? '';
  const [search, setSearch] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editLoop, setEditLoop] = useState<CpmLoop | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useCpmLoops();
  const loops = useMemo(() => data?.loops ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return loops;
    return loops.filter(l =>
      l.loopId.toLowerCase().includes(q)
      || l.displayName.toLowerCase().includes(q)
      || (l.area ?? '').toLowerCase().includes(q));
  }, [loops, search]);

  // Case-insensitive, like every loop lookup in cplm-api.
  const selected = loops.find(l => l.loopId.toLowerCase() === selectedId.toLowerCase()) ?? filtered[0];

  // Page the registry list so a large fleet isn't one long scroll. Selection still
  // resolves against the full list so the detail aside works across pages.
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedLoops = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Governed engineering configuration"
        title="Loop registry"
        copy="Add individual loops or validate a bulk registry import. Onboarded loops are evaluated immediately; the readiness report is the activation gate."
        actions={
          <>
            <ObcButton variant="normal" onClick={() => setImportOpen(true)}>Bulk import</ObcButton>
            <ObcButton variant="raised" onClick={() => setWizardOpen(true)}>Add loop</ObcButton>
          </>
        }
      />

      <div className="cpm-banner">
        <strong>Readiness-gated configuration.</strong>&nbsp;A loop is only as good as its
        signal mappings: missing VP caps confidence at 0.89, and missing peer links leaves
        G13 unevaluated. The readiness report after save lists exactly what is degraded.
      </div>

      <div className="cpm-grid-2">
        <section className="cpm-surface">
          <PanelHead
            eyebrow="Registered assets"
            title={`${filtered.length} control-loop records`}
            right={
              <input
                className="cpm-input"
                placeholder="Find loop or service"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            }
          />
          <div className="cpm-reg-head">
            <span>Loop / service</span><span>Dynamic class</span><span>Type</span>
            <span>VP</span><span>Profile</span><span>State</span>
          </div>
          {isLoading && <EmptyState title="Loading registry…" />}
          {isError && <QueryError title="Registry unavailable" error={error} retry={() => void refetch()} />}
          {!isLoading && !isError && filtered.length === 0 && (
            <EmptyState
              title="No loops registered"
              copy="Onboard the first loop to start producing diagnoses."
              action={{ label: 'Add loop', onClick: () => setWizardOpen(true) }}
            />
          )}
          {pagedLoops.map(loop => {
            const st = stateOf(loop);
            return (
              <div
                key={loop.loopId}
                className={`cpm-reg-row${selected?.loopId === loop.loopId ? ' cpm-reg-row--selected' : ''}`}
                onClick={() => setParams(p => { p.set('loop', loop.loopId); return p; }, { replace: true })}
                role="button"
                tabIndex={0}
                aria-pressed={selected?.loopId === loop.loopId}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setParams(p => { p.set('loop', loop.loopId); return p; }, { replace: true });
                  }
                }}
              >
                <span>
                  <strong>{loop.loopId}</strong>
                  <div className="cpm-event-row__sub">{loop.displayName} · {loop.area ?? loop.site}</div>
                </span>
                <span>{dynamicClassOf(loop)}</span>
                <span>{loop.loopType}</span>
                <span>{loop.tags['VP'] ? 'AVAILABLE' : 'NOT MAPPED'}</span>
                <span>{loop.thresholdProfileId ?? '—'}</span>
                <TonePill tone={st.tone}>{st.label}</TonePill>
              </div>
            );
          })}
          {pageCount > 1 && (
            <div className="cpm-pager">
              <ObcButton variant="flat" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}>← Prev</ObcButton>
              <span className="cpm-event-row__sub">Page {safePage + 1} of {pageCount}</span>
              <ObcButton variant="flat" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}>Next →</ObcButton>
            </div>
          )}
        </section>

        {selected
          ? <ProfileAside loop={selected} onEdit={() => setEditLoop(selected)} />
          : <section className="cpm-surface"><EmptyState title="Select a loop" /></section>}
      </div>

      {wizardOpen && <AddLoopWizard existing={loops} onClose={() => setWizardOpen(false)} />}
      {editLoop && <AddLoopWizard existing={loops} editLoop={editLoop} onClose={() => setEditLoop(null)} />}
      {importOpen && <BulkImportDialog existing={loops} onClose={() => setImportOpen(false)} />}
    </div>
  );
};

// ── profile detail aside ───────────────────────────────────────────────────

const GATE_ROLE_POLICY: [string, string][] = [
  ['BLOCKING', 'G0 · G1 · G11'],
  ['ELIGIBILITY', 'G2 · G2r'],
  ['PERFORMANCE', 'G3 · G4'],
  ['PRIMARY', 'G5 · G6 · G10'],
  ['SUPPORTING', 'G7 · G8 · G9'],
  ['CONTEXT', 'G12 · G13'],
  ['CONFIRMATION', 'G14'],
  ['FUSION', 'G15'],
];

const ProfileAside: React.FC<{ loop: CpmLoop; onEdit: () => void }> = ({ loop, onEdit }) => {
  const republish = useRepublishEvidence();
  const st = stateOf(loop);
  return (
    <aside className="cpm-surface">
      <PanelHead
        eyebrow="Assigned profile"
        title={`${loop.loopId} · ${dynamicClassOf(loop)}`}
        right={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <TonePill tone={st.tone}>{st.label.toUpperCase()}</TonePill>
            <ObcButton variant="normal" onClick={onEdit}>Edit loop</ObcButton>
          </span>
        }
      />
      <KvRow label="Loop type">{loop.loopType}</KvRow>
      <KvRow label="Site / area / unit">
        {[loop.site, loop.area, loop.unit].filter(Boolean).join(' / ')}
        {/* Reverse hop of the tree's CPM badge — the projection puts this loop's
            Device + signal assets under its unit. Only rendered for users who
            can actually reach Administration (asset.edit gates /admin). */}
        {useAuthStore.getState().hasPermission('asset.edit') && (
          <>
            {' '}
            <RouterLink
              to={`/admin/plant-model?search=${encodeURIComponent(loop.loopId.toLowerCase())}`}
              className="cpm-pill cpm-pill--muted"
              style={{ textDecoration: 'none', marginLeft: 6 }}
              title="Open this loop's device and signal assets in the plant model tree"
            >
              View in plant tree ↗
            </RouterLink>
          </>
        )}
      </KvRow>
      <KvRow label="Criticality">{loop.criticality}</KvRow>
      <KvRow label="Valve position">{loop.tags['VP'] ?? 'Not mapped — confidence capped at 0.89'}</KvRow>
      <KvRow label="Peer links">
        {loop.links.length > 0
          ? loop.links.map(l => `${l.relType} → ${l.toLoopId}`).join(', ')
          : 'None — G13 not evaluated'}
      </KvRow>
      <KvRow label="Gate profile">{loop.thresholdProfileId ?? 'default'}</KvRow>
      <KvRow label="Observability">
        {loop.observabilityFlags.length > 0
          ? loop.observabilityFlags.map(f => <TonePill key={f} tone="warn">{f}</TonePill>)
          : <TonePill tone="good">CLEAR</TonePill>}
      </KvRow>

      <PanelHead eyebrow="Gate role policy" title="Roles per gate" />
      {GATE_ROLE_POLICY.map(([role, gates]) => (
        <KvRow key={role} label={role}>{gates}</KvRow>
      ))}
      <p className="cpm-copy" style={{ marginTop: 8 }}>
        G9 geometry is supporting-only. It cannot create a stiction suspect without
        qualified independent evidence.
      </p>

      <div style={{ marginTop: 12 }}>
        <ObcButton
          variant="normal"
          disabled={republish.isPending}
          onClick={() => republish.mutate(loop.loopId)}
        >
          {republish.isPending ? 'Republishing…' : 'Re-project links & republish evidence'}
        </ObcButton>
        {republish.isSuccess && (
          <p className="cpm-copy">
            Republished — {republish.data.links} link(s) live on the broadcast
            {typeof republish.data.signalAssets === 'number'
              ? `, ${republish.data.signalAssets} signal asset(s) projected into the UNS`
              : ''}.
          </p>
        )}
      </div>
    </aside>
  );
};

// ── add-loop wizard (5 steps, maps 1:1 onto POST /cpm/loops/activate) ──────

const STEPS = ['Identity', 'Classification', 'Signal mappings', 'Windows & profile', 'Review'] as const;

interface WizardState {
  loopId: string; displayName: string; site: string; area: string; unit: string;
  loopType: string; criticality: string;
  pv: string; sp: string; op: string; mode: string; vp: string;
  thresholdProfileId: string; enableMonitoring: boolean;
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

const AddLoopWizard: React.FC<{ existing: CpmLoop[]; editLoop?: CpmLoop; onClose: () => void }> = ({ existing, editLoop, onClose }) => {
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
  } : {
    // site starts EMPTY: the old 'site1' placeholder was a site that exists in
    // no asset model, and activation now rejects unmodelled locations (G-07) —
    // a default that steers every new loop into a 422 is worse than forcing a
    // pick from the cascade.
    loopId: '', displayName: '', site: '', area: '', unit: '',
    loopType: 'FIC', criticality: 'medium',
    pv: '', sp: '', op: '', mode: '', vp: '',
    thresholdProfileId: '', enableMonitoring: true,
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
  const canContinue = step === 0 ? identityValid : step === 2 ? signalsValid : true;

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

// ── bulk CSV import ────────────────────────────────────────────────────────

const CSV_HEADERS = [
  'tag', 'service', 'site', 'area', 'unit', 'loop_type', 'criticality',
  'pv_tag', 'sp_tag', 'op_tag', 'mode_tag', 'vp_tag', 'profile',
] as const;

/**
 * Only these columns must be present. The signal-path columns are optional
 * because a blank one is DERIVED from site/[area/]unit + tag — hand-typing four
 * long paths per row was the single largest source of import errors, and a
 * mistyped one silently onboards a loop pointed at nothing.
 */
const REQUIRED_COLUMNS = ['tag', 'service', 'site', 'loop_type'] as const;

/** Uploaded-file ceiling — 2 MB is roughly 20 000 rows, far past a sane batch. */
const MAX_CSV_BYTES = 2 * 1024 * 1024;
/** Rows rendered in the preview; past this the table itself is the slow part. */
const PREVIEW_LIMIT = 100;

/** Source → Review → Activate. Validation is entirely client-side, so review is
 *  a real gate rather than a formality: nothing is sent until the last step. */
const IMPORT_STEPS = [
  { title: 'Import file' },
  { title: 'Review & validate' },
  { title: 'Activate' },
] as const;
/**
 * Server-side ceiling for one bulk import (cplm-api MaxBulkLoops). The whole file
 * goes in ONE request, so the gateway's 120-mutations-per-minute window no longer
 * caps a batch — the bound is request size and the gateway's 120s timeout.
 */
const MAX_BULK_LOOPS = 5000;

const ROLE_COLUMN: Record<SignalRole, string> = {
  pv: 'pv_tag', sp: 'sp_tag', op: 'op_tag', mode: 'mode_tag', vp: 'vp_tag',
};

interface CsvRow {
  values: Record<string, string>;
  tag: string;
  location: PlantLocation;
  loopType: string;
  criticality: string;
  paths: Record<SignalRole, { path: string; derived: boolean }>;
  problems: string[];
  warnings: string[];
  existing: boolean;
}

/**
 * LR1 — split one CSV line respecting double quotes (RFC-4180 style: quoted
 * cells may contain commas, "" escapes a quote). The old naive split(',')
 * meant a service description like "Reactor 1, feed flow" shifted every
 * following column — and because the shifted row could still pass the
 * required-fields check, it ACTIVATED a loop with wrong tag paths.
 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur.trim()); cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

type KnownLocations = ReturnType<typeof usePlantLocations>['data'];

/** Non-blocking: a location outside the asset model still onboards, but its
 *  signal assets land outside the plant hierarchy. Worth seeing before import. */
function locationWarnings(known: KnownLocations, loc: PlantLocation): string[] {
  if (!known || known.sites.length === 0 || !loc.site) return [];
  const sites = known.sites.map(s => s.contextualPath.split('/')[0]);
  if (!sites.includes(loc.site)) return [`site "${loc.site}" is not in the asset model`];
  const out: string[] = [];
  if (loc.area && !areasOf(known.areas, loc.site).includes(loc.area))
    out.push(`area "${loc.area}" is not under site "${loc.site}"`);
  if (loc.unit && !unitsOf(known.units, loc.site, loc.area).includes(loc.unit))
    out.push(`unit "${loc.unit}" is not under ${[loc.site, loc.area].filter(Boolean).join('/')}`);
  return out;
}

function parseCsv(
  text: string, existingLoops: CpmLoop[], known: KnownLocations, loopTypes: string[],
): { missing: string[]; unknownColumns: string[]; rows: CsvRow[] } {
  const existingTags = new Set(existingLoops.map(l => l.loopId.toUpperCase()));
  // Historian device node → the loop that already owns it (see the wizard's
  // nodeClash): punctuation-only differences merge two loops onto one series.
  const existingNodes = new Map(existingLoops.map(l => [historianNode(l.loopId), l.loopId]));
  const seenNodes = new Map<string, string>();
  // '#' starts a comment line: templates and generated fixtures annotate
  // themselves, and '#' can never begin a real tag (it is a forbidden character).
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (lines.length === 0) return { missing: [...REQUIRED_COLUMNS], unknownColumns: [], rows: [] };
  const headers = splitCsvLine(lines[0]).map(h => h.toLowerCase());
  const missing = REQUIRED_COLUMNS.filter(h => !headers.includes(h));
  // A misspelled header would otherwise be read as "column absent" and its
  // values silently dropped.
  const unknownColumns = headers.filter(h => h && !CSV_HEADERS.includes(h as typeof CSV_HEADERS[number]));
  const seen = new Set<string>();
  const rows: CsvRow[] = lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const values: Record<string, string> = {};
    headers.forEach((h, i) => { values[h] = (cells[i] ?? '').trim(); });
    const problems: string[] = [];
    const warnings: string[] = [];
    // A mis-shaped row means every cell after the fault is in the wrong column —
    // never let it through on the strength of accidentally-non-empty cells.
    if (cells.length !== headers.length)
      problems.push(`${cells.length} cell(s) for ${headers.length} column(s) — quote any value containing a comma`);

    const tag = (values['tag'] ?? '').toUpperCase();
    for (const req of REQUIRED_COLUMNS) if (!values[req]) problems.push(`missing ${req}`);
    const idIssue = loopIdProblem(tag);
    if (idIssue) problems.push(`loop tag "${tag}": ${idIssue}`);
    const isDuplicate = !!tag && seen.has(tag);
    if (isDuplicate) problems.push('duplicate tag in file');
    seen.add(tag);
    // A duplicate necessarily collides with itself in the historian; reporting
    // both would just be noise on the same row.
    if (tag && !idIssue && !isDuplicate) {
      const node = historianNode(tag);
      const priorInFile = seenNodes.get(node);
      const priorInRegistry = existingNodes.get(node);
      if (priorInFile)
        problems.push(`historian collision with "${priorInFile}" in this file — both become device ${node}`);
      else if (priorInRegistry && priorInRegistry.toUpperCase() !== tag)
        problems.push(`historian collision with registered loop "${priorInRegistry}" — both become device ${node}`);
      seenNodes.set(node, tag);
    }

    const loopType = (values['loop_type'] ?? '').toUpperCase();
    if (loopType && loopTypes.length && !loopTypes.includes(loopType))
      problems.push(`loop_type "${loopType}" is not one of ${loopTypes.join(', ')}`);
    // The server only accepts lowercase criticality; normalising is unambiguous
    // so it is fixed rather than rejected.
    const criticality = (values['criticality'] ?? '').toLowerCase();
    if (criticality && !['low', 'medium', 'high', 'critical'].includes(criticality))
      problems.push(`criticality "${values['criticality']}" must be low, medium, high or critical`);

    const location: PlantLocation = {
      site: values['site'] ?? '', area: values['area'] ?? '', unit: values['unit'] ?? '',
    };
    warnings.push(...locationWarnings(known, location));

    const paths = {} as CsvRow['paths'];
    for (const role of SIGNAL_ROLES) {
      const given = values[ROLE_COLUMN[role]] ?? '';
      if (given && !isResolvablePath(given))
        problems.push(`${ROLE_COLUMN[role]} "${given}" is not a UNS contextual path (site/[area/]unit/loop.${role})`);
      // VP is opt-in — deriving it for every loop would map a position signal
      // most loops do not have.
      const path = given || (role === 'vp' ? '' : deriveSignalPath(location, tag, role));
      if (!path && role !== 'vp') problems.push(`cannot derive ${role} path — give ${ROLE_COLUMN[role]} or a site`);
      paths[role] = { path, derived: !given && !!path };
    }
    if (Object.values(paths).some(p => p.derived)) warnings.push('signal paths derived from location');

    return { values, tag, location, loopType, criticality, paths, problems, warnings, existing: existingTags.has(tag) };
  });
  return { missing, unknownColumns, rows };
}

const BulkImportDialog: React.FC<{ existing: CpmLoop[]; onClose: () => void }> = ({ existing, onClose }) => {
  const dialogRef2 = useDialogA11y<HTMLDivElement>(onClose);
  const [text, setText] = useState('');
  const [results, setResults] = useState<{ tag: string; ok: boolean; message?: string }[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  // G-07: the server rejects site/area/unit chains that are not in the asset
  // model; this dialog-level override forwards allowUnmodelledLocation on every
  // row — an explicit choice, defaulting to the safe refusal.
  const [allowUnmodelled, setAllowUnmodelled] = useState(false);
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const [importStats, setImportStats] = useState<{ activated: number; failed: number; elapsedMs: number } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const locations = usePlantLocations();
  const contract = useCpmRegistryContract();
  const loopTypes = useMemo(() => contract.data?.loopTypes ?? [], [contract.data]);

  /** Read a dropped/chosen file into the textarea, which stays the single source
   *  of truth so an uploaded file can still be corrected in place. */
  const loadFile = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setFileError(`"${file.name}" is not a .csv file`);
      return;
    }
    if (file.size > MAX_CSV_BYTES) {
      setFileError(
        `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — larger than the ${MAX_CSV_BYTES / 1024 / 1024} MB limit. Split it into smaller batches.`);
      return;
    }
    try {
      const content = await file.text();
      setText(content);
      setFileName(file.name);
      setResults(null);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Could not read the file');
    }
  };

  const parsed = useMemo(
    () => parseCsv(text, existing, locations.data, loopTypes),
    [text, existing, locations.data, loopTypes]);
  const valid = parsed.rows.filter(r => r.problems.length === 0);

  const downloadTemplate = () => {
    // Two rows on purpose: the first leaves the signal columns blank (paths are
    // derived from site/area/unit + tag), the second overrides them explicitly.
    const sample = [
      CSV_HEADERS.join(','),
      '45FIC-109,Hydrogen recycle flow,houston,,crude1,FIC,high,,,,,,',
      'TIC20501,Reactor bed temperature,houston,,crude1,TIC,medium,houston/crude1/tic20501.pv,houston/crude1/tic20501.sp,houston/crude1/tic20501.op,houston/crude1/tic20501.mode,houston/crude1/tic20501.vp,',
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cplm-loop-registry-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const runImport = async () => {
    // ONE request for the whole file. Two reasons it is not N calls: the gateway
    // counts a mutation per request (120/minute/user), so a per-row import
    // stalled at 120 loops; and the server can only batch its own reads, writes
    // and asset projection when it receives the whole set — measured at ~8 ms per
    // loop for 1000, against ~33 ms row-by-row.
    setImporting(true);
    setResults(null);
    setImportWarning(null);
    setImportStats(null);
    setImportProgress({ done: 0, total: valid.length });

    const loops = valid.map(row => ({
      loopId: row.tag,
      displayName: row.values['service'],
      site: row.location.site,
      area: row.location.area || null,
      unit: row.location.unit || null,
      loopType: row.loopType,
      criticality: row.criticality || null,
      tags: SIGNAL_ROLES
        .filter(role => row.paths[role].path)
        .map(role => ({ signalRole: role.toUpperCase(), unsPath: row.paths[role].path })) as CpmTagMapEntry[],
      thresholdProfileId: row.values['profile'] || null,
      enableMonitoring: true,
      allowUnmodelledLocation: allowUnmodelled,
    }));

    try {
      const result = await bulkActivateLoops(loops);
      setResults(result.results.map(r => ({
        tag: r.loopId,
        ok: r.ok,
        message: r.ok ? undefined : (r.error ?? r.code ?? 'Failed'),
      })));
      setImportWarning(result.warning ?? null);
      setImportStats({ activated: result.activated, failed: result.failed, elapsedMs: result.elapsedMs });
    } catch (err) {
      // A whole-batch failure (transport, timeout, 413) is reported against every
      // row rather than silently leaving the dialog blank.
      const message = err instanceof ApiError
        ? `${err.message}${err.status === 413 ? ' — split the file into smaller batches.' : ''}`
        : err instanceof Error ? err.message : String(err);
      setResults(valid.map(row => ({ tag: row.tag, ok: false, message })));
      setImportStats(null);
    } finally {
      void qc.invalidateQueries({ queryKey: ['cpm', 'loops'] });
      setImportProgress(null);
      setImporting(false);
    }
  };

  const sourceReady = text.trim() !== '' && parsed.missing.length === 0 && parsed.rows.length > 0;
  const tooMany = valid.length > MAX_BULK_LOOPS;
  const failedRows = results?.filter(r => !r.ok) ?? [];

  return (
    <div className="cpm-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !importing) onClose(); }}>
      <div ref={dialogRef2} className="cpm-modal" role="dialog" aria-modal="true" tabIndex={-1} aria-label="Import loops from CSV">
        <PanelHead
          eyebrow="Bulk registry workflow"
          title={`Import loops from CSV — ${IMPORT_STEPS[step].title}`}
          right={step === 0
            ? <ObcButton variant="normal" onClick={downloadTemplate}>Download template</ObcButton>
            : undefined} />

        <div className="cpm-wizard-steps">
          {IMPORT_STEPS.map((s, i) => (
            <button
              key={s.title}
              type="button"
              className={`cpm-wizard-step${i === step ? ' cpm-wizard-step--active' : ''}${i < step ? ' cpm-wizard-step--done' : ''}`}
              // Only backwards, and never while the import is in flight.
              onClick={() => { if (i < step && !importing && !results) setStep(i); }}
            >
              {i < step ? '✓ ' : `${i + 1}. `}{s.title}
            </button>
          ))}
        </div>

        {/* ── Step 1 · Source ─────────────────────────────────────────── */}
        {step === 0 && (
          <>
            <p className="cpm-copy">
              Upload the registry export or paste it below. Required columns:{' '}
              <span className="cpm-mono">{REQUIRED_COLUMNS.join(', ')}</span>. Leave the signal
              columns blank to derive{' '}
              <span className="cpm-mono">site/[area/]unit/&lt;tag&gt;.&lt;role&gt;</span> — VP is only
              mapped when given explicitly.
            </p>

            <div
              className={`cpm-csv-drop${dragging ? ' cpm-csv-drop--over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                void loadFile(e.dataTransfer.files?.[0]);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                style={{ display: 'none' }}
                onChange={e => { void loadFile(e.target.files?.[0]); e.target.value = ''; }}
              />
              <ObcButton variant="raised" onClick={() => fileInputRef.current?.click()}>
                Choose CSV file
              </ObcButton>
              <span className="cpm-copy">or drop a .csv here — or paste below</span>
              {fileName && (
                <span className="cpm-pill cpm-pill--good" title={fileName}>
                  {fileName} · {parsed.rows.length} row(s)
                </span>
              )}
            </div>
            {fileError && <p className="cpm-field__error">{fileError}</p>}

            <label className="cpm-field" style={{ minWidth: 0 }}>
              <span className="cpm-field__label">
                CSV content{fileName ? ` (loaded from ${fileName}, editable)` : ''}
              </span>
              <textarea
                className="cpm-textarea cpm-mono"
                rows={10}
                value={text}
                onChange={e => { setText(e.target.value); setResults(null); setFileName(null); }}
                placeholder={CSV_HEADERS.join(',')}
              />
            </label>

            {text && parsed.missing.length > 0 && (
              <p className="cpm-field__error">Missing required columns: {parsed.missing.join(', ')}</p>
            )}
            {text && parsed.unknownColumns.length > 0 && (
              <p className="cpm-field__error">
                Unrecognised column(s): {parsed.unknownColumns.join(', ')} — values in them are ignored.
              </p>
            )}
            {text.trim() !== '' && parsed.missing.length === 0 && parsed.rows.length === 0 && (
              <p className="cpm-field__error">The file has a header row but no data rows.</p>
            )}
          </>
        )}

        {/* ── Step 2 · Review ─────────────────────────────────────────── */}
        {step === 1 && (
          <>
            <div className="cpm-csv-summary">
              <KpiSummary caption="Rows detected" value={parsed.rows.length} />
              <KpiSummary caption="Ready" value={valid.length} tone="good" />
              <KpiSummary caption="Need correction" value={parsed.rows.length - valid.length}
                tone={parsed.rows.length - valid.length > 0 ? 'bad' : 'good'} />
              <KpiSummary caption="Existing (will update)" value={parsed.rows.filter(r => r.existing).length} tone="warn" />
            </div>

            {tooMany && (
              <p className="cpm-field__error">
                {valid.length} rows exceeds the {MAX_BULK_LOOPS.toLocaleString()}-per-import limit —
                split the file.
              </p>
            )}
            {valid.length === 0 && (
              <p className="cpm-field__error">
                No row can be imported yet. Fix the problems listed below, then go back and paste
                or upload the corrected file.
              </p>
            )}
            {parsed.rows.length > valid.length && valid.length > 0 && (
              <p className="cpm-copy cpm-tone-warn">
                {parsed.rows.length - valid.length} row(s) will be skipped. Only the {valid.length} ready
                row(s) are imported.
              </p>
            )}

            {/* Exactly what WILL be sent — derived paths included — so a wrong
                location is caught here rather than after N loops are activated. */}
            <div className="cpm-csv-preview">
              <table>
                <thead>
                  <tr>
                    <th>Loop</th><th>Location</th><th>Type</th><th>PV / SP / OP / MODE / VP</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, PREVIEW_LIMIT).map((r, i) => (
                    <tr key={`${r.tag}-${i}`} className={r.problems.length ? 'is-bad' : undefined}>
                      <td className="cpm-mono">{r.tag || '—'}</td>
                      <td>{[r.location.site, r.location.area, r.location.unit].filter(Boolean).join(' / ') || '—'}</td>
                      <td>{r.loopType || '—'}</td>
                      <td className="cpm-mono">
                        {SIGNAL_ROLES.map(role => r.paths[role].path).filter(Boolean).join('  ·  ') || '—'}
                      </td>
                      <td>
                        {r.problems.length > 0
                          ? <TonePill tone="bad">{r.problems.join('; ')}</TonePill>
                          : <TonePill tone={r.existing ? 'warn' : 'good'}>
                              {r.existing ? 'Updates existing' : 'Ready'}
                            </TonePill>}
                        {r.problems.length === 0 && r.warnings.length > 0 && (
                          <div className="cpm-copy cpm-tone-warn">{r.warnings.join('; ')}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {parsed.rows.length > PREVIEW_LIMIT && (
                    <tr>
                      <td colSpan={5} className="cpm-copy">
                        … and {parsed.rows.length - PREVIEW_LIMIT} more row(s) not shown. All rows are
                        still validated and imported — the counters above cover the whole file.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Step 3 · Activate ───────────────────────────────────────── */}
        {step === 2 && (
          <>
            {!results && !importing && (
              <>
                <p className="cpm-copy">
                  Ready to onboard <strong>{valid.length}</strong> loop(s) into the registry. Each one
                  gets its role mappings and a UNS signal asset per stored role, so its PV/SP/OP
                  resolve and trend immediately.
                </p>
                <div className="cpm-csv-summary">
                  <KpiSummary caption="To activate" value={valid.length} tone="good" />
                  <KpiSummary caption="New" value={valid.filter(r => !r.existing).length} />
                  <KpiSummary caption="Updating existing" value={valid.filter(r => r.existing).length} tone="warn" />
                  <KpiSummary caption="Skipped" value={parsed.rows.length - valid.length}
                    tone={parsed.rows.length - valid.length > 0 ? 'bad' : 'good'} />
                </div>
                <label className="cpm-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <input type="checkbox" checked={allowUnmodelled}
                    onChange={e => setAllowUnmodelled(e.target.checked)} />
                  <span className="cpm-copy">
                    Allow locations that are not in the asset model. Rows whose site/area/unit is
                    unmodelled are otherwise rejected (their signals would sit outside the plant
                    tree and resolve against nothing).
                  </span>
                </label>
              </>
            )}

            {importing && (
              <div style={{ margin: '18px 0' }}>
                {/* The whole file goes in ONE request, so there is no per-row
                    signal to report — an indeterminate bar is the honest shape. */}
                <ObcProgressBar type="linear" mode="indeterminate" style={{ width: '100%' }} />
                <p className="cpm-copy" style={{ marginTop: 10 }} role="status">
                  Activating {importProgress?.total ?? valid.length} loop(s)… this is a single
                  request; leaving the dialog open until it finishes.
                </p>
              </div>
            )}

            {results && (
              <>
                <div
                  role="status"
                  className={`cpm-banner${failedRows.length === 0 ? ' cpm-banner--good' : ' cpm-banner--bad'}`}
                >
                  <span style={{ fontSize: '1.2rem' }}>{failedRows.length === 0 ? '✓' : '✗'}</span>
                  <div>
                    <strong>
                      {failedRows.length === 0
                        ? `All ${importStats?.activated ?? results.length} loop(s) activated`
                        : `${importStats?.activated ?? 0} activated, ${failedRows.length} failed`}
                    </strong>
                    {importStats && (
                      <div className="cpm-copy">
                        Completed in {(importStats.elapsedMs / 1000).toFixed(1)}s.
                      </div>
                    )}
                  </div>
                </div>

                {importWarning && <p className="cpm-field__error">{importWarning}</p>}

                {/* Failures first and in full; successes are collapsed to a count
                    so a 1000-row success does not bury the three that failed. */}
                {failedRows.length > 0 && (
                  <div className="cpm-csv-preview">
                    <table>
                      <thead><tr><th>Loop</th><th>Why it failed</th></tr></thead>
                      <tbody>
                        {failedRows.map(r => (
                          <tr key={r.tag} className="is-bad">
                            <td className="cpm-mono">{r.tag}</td>
                            <td>{r.message ?? 'Failed'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Footer navigation ───────────────────────────────────────── */}
        <div className="cpm-wizard-footer">
          <ObcButton variant="normal" onClick={onClose} disabled={importing}>
            {results ? 'Close' : 'Cancel'}
          </ObcButton>

          {!results && step > 0 && (
            <ObcButton variant="normal" disabled={importing} onClick={() => setStep(step - 1)}>
              ← Back
            </ObcButton>
          )}

          <span className="cpm-copy">
            {step === 0 && (parsed.rows.length > 0 ? `${parsed.rows.length} row(s) detected` : '')}
            {step === 1 && `${valid.length} of ${parsed.rows.length} row(s) ready`}
            {step === 2 && !results && !importing && `${valid.length} row(s) will be activated`}
          </span>

          {step < 2 && (
            <ObcButton
              variant="raised"
              disabled={step === 0 ? !sourceReady : valid.length === 0 || tooMany}
              onClick={() => setStep(step + 1)}
            >
              Next →
            </ObcButton>
          )}
          {step === 2 && !results && (
            <ObcButton variant="raised" disabled={valid.length === 0 || tooMany || importing} onClick={runImport}>
              {importing ? 'Activating…' : `Submit & activate ${valid.length} loop(s)`}
            </ObcButton>
          )}
          {step === 2 && results && failedRows.length > 0 && (
            <ObcButton variant="normal" onClick={() => { setResults(null); setImportStats(null); setImportWarning(null); setStep(0); }}>
              Fix and re-import
            </ObcButton>
          )}
        </div>
      </div>
    </div>
  );
};

const KpiSummary: React.FC<{ caption: string; value: number; tone?: 'good' | 'warn' | 'bad' }> = ({ caption, value, tone }) => (
  <div className={`cpm-kpi${tone ? ` cpm-kpi--${tone}` : ''}`}>
    <span className="cpm-kpi__caption">{caption}</span>
    <span className="cpm-kpi__value">{value}</span>
  </div>
);

export default LoopRegistry;
