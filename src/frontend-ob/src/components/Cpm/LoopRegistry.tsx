'use client';

/**
 * CPLM Phase 7 — U10 Loop Registry.
 * CPA-prototype IA parity: registry table + profile detail aside + 5-step
 * add-loop wizard + bulk CSV import, wired to the real onboarding API.
 * The prototype's "draft" concept maps to our immediate activate + readiness
 * report (the wizard shows readiness as its post-save validation step).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, KvRow, PanelHead, TonePill, WorkspaceHeader,
} from './shared';
import {
  useActivateLoop, useCpmLoops, useCpmReadiness, useCpmRegistryContract,
  useRepublishEvidence,
} from '../../hooks/useCpm';
import { activateLoop as activateLoopApi } from '../../api/cpmApi';
import type { CpmActivateRequest, CpmLoop, CpmTagMapEntry } from '../../api/cpmApi';
import { useQueryClient } from '@tanstack/react-query';
import { useDialogA11y } from '../../hooks/useDialogA11y';

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

  const { data, isLoading, error } = useCpmLoops();
  const loops = useMemo(() => data?.loops ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return loops;
    return loops.filter(l =>
      l.loopId.toLowerCase().includes(q)
      || l.displayName.toLowerCase().includes(q)
      || (l.area ?? '').toLowerCase().includes(q));
  }, [loops, search]);

  const selected = loops.find(l => l.loopId === selectedId) ?? filtered[0];

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
          {error != null && <EmptyState title="Registry unavailable" copy={String(error)} />}
          {!isLoading && filtered.length === 0 && (
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
                onClick={() => setParams(p => { p.set('loop', loop.loopId); return p; })}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') setParams(p => { p.set('loop', loop.loopId); return p; }); }}
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
      <KvRow label="Site / area / unit">{[loop.site, loop.area, loop.unit].filter(Boolean).join(' / ')}</KvRow>
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
            Republished — {republish.data.links} link(s) live on the broadcast.
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

const AddLoopWizard: React.FC<{ existing: CpmLoop[]; editLoop?: CpmLoop; onClose: () => void }> = ({ existing, editLoop, onClose }) => {
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose);
  const contract = useCpmRegistryContract();
  const activate = useActivateLoop();
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
    loopId: '', displayName: '', site: 'site1', area: '', unit: '',
    loopType: 'FIC', criticality: 'medium',
    pv: '', sp: '', op: '', mode: '', vp: '',
    thresholdProfileId: '', enableMonitoring: true,
  });
  const readiness = useCpmReadiness(savedLoopId ?? undefined);

  const set = (k: keyof WizardState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: k === 'loopId' ? e.target.value.toUpperCase() : e.target.value }));

  // In edit mode the loopId is fixed (it's the identity we're updating), so it is
  // never a "duplicate" of itself.
  const duplicate = !isEdit && existing.some(l => l.loopId.toUpperCase() === form.loopId.toUpperCase());
  const identityValid = form.loopId.trim() !== '' && form.displayName.trim() !== ''
    && form.site.trim() !== '' && !duplicate;
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
              <input className={`cpm-input${duplicate ? ' cpm-input--error' : ''}`} value={form.loopId} onChange={set('loopId')} placeholder="FIC-10409" disabled={isEdit} title={isEdit ? 'Loop ID is the identity and cannot be changed' : undefined} />
              {duplicate && <span className="cpm-field__error">This tag already exists</span>}
            </label>
            <label className="cpm-field">
              <span className="cpm-field__label">Service / description *</span>
              <input className="cpm-input" value={form.displayName} onChange={set('displayName')} placeholder="Natural gas feed flow" />
            </label>
            <label className="cpm-field">
              <span className="cpm-field__label">Site *</span>
              <input className="cpm-input" value={form.site} onChange={set('site')} />
            </label>
            <label className="cpm-field">
              <span className="cpm-field__label">Area / unit</span>
              <input className="cpm-input" value={form.area} onChange={set('area')} placeholder="Primary reformer" />
            </label>
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
            <div className="cpm-wizard-grid">
              {([['pv', 'PV · Process variable *'], ['sp', 'SP · Setpoint *'],
                 ['op', 'OP · Controller output *'], ['mode', 'MODE · Controller mode *'],
                 ['vp', 'VP · Valve position · optional']] as const).map(([k, label]) => (
                <label key={k} className="cpm-field">
                  <span className="cpm-field__label">{label}</span>
                  <input className="cpm-input" value={form[k]} onChange={set(k)}
                    placeholder={`root.${form.site || 'site1'}.unit1.${form.loopId || 'LOOP'}.${k.toLowerCase()}`} />
                </label>
              ))}
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
            <KvRow label="Short features (G0–G4)">1m · 5m/1m · 10m/2m · 15m/5m · 30m/5m · 60m/5m</KvRow>
            <KvRow label="Long diagnostics (G5–G11)">4h / 12h / 24h slices · 15 min cadence</KvRow>
            <KvRow label="Fusion (G12–G15)">Fires on 12h and 24h long records</KvRow>
            <p className="cpm-copy" style={{ marginTop: 12 }}>
              Windows are fixed by the deployed pipeline; they are shown here so the reviewer
              knows what cadence to expect. First fused verdict needs ≥ 12 h of samples.
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
              <p className="cpm-field__error" style={{ marginTop: 8 }}>{String(activate.error)}</p>
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
  'tag', 'service', 'site', 'area', 'loop_type', 'criticality',
  'pv_tag', 'sp_tag', 'op_tag', 'mode_tag', 'vp_tag', 'profile',
] as const;

interface CsvRow {
  values: Record<string, string>;
  problems: string[];
  existing: boolean;
}

function parseCsv(text: string, existingTags: Set<string>): { missing: string[]; rows: CsvRow[] } {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { missing: [...CSV_HEADERS], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const missing = CSV_HEADERS.filter(h => !headers.includes(h));
  const seen = new Set<string>();
  const rows: CsvRow[] = lines.slice(1).map(line => {
    const cells = line.split(',').map(c => c.trim());
    const values: Record<string, string> = {};
    headers.forEach((h, i) => { values[h] = cells[i] ?? ''; });
    const problems: string[] = [];
    const tag = (values['tag'] ?? '').toUpperCase();
    for (const req of ['tag', 'service', 'site', 'loop_type', 'pv_tag', 'sp_tag', 'op_tag', 'mode_tag'])
      if (!values[req]) problems.push(`missing ${req}`);
    if (tag && seen.has(tag)) problems.push('duplicate tag in file');
    seen.add(tag);
    return { values, problems, existing: existingTags.has(tag) };
  });
  return { missing, rows };
}

const BulkImportDialog: React.FC<{ existing: CpmLoop[]; onClose: () => void }> = ({ existing, onClose }) => {
  const dialogRef2 = useDialogA11y<HTMLDivElement>(onClose);
  const [text, setText] = useState('');
  const [results, setResults] = useState<{ tag: string; ok: boolean; message?: string }[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const qc = useQueryClient();

  const existingTags = useMemo(
    () => new Set(existing.map(l => l.loopId.toUpperCase())), [existing]);
  const parsed = useMemo(() => parseCsv(text, existingTags), [text, existingTags]);
  const valid = parsed.rows.filter(r => r.problems.length === 0);

  const downloadTemplate = () => {
    const sample = [
      CSV_HEADERS.join(','),
      'FIC-80101,Hydrogen recycle flow,site1,reformer,FIC,high,site1/reformer/FIC-80101.pv,site1/reformer/FIC-80101.sp,site1/reformer/FIC-80101.op,site1/reformer/FIC-80101.mode,,',
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cplm-loop-registry-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const runImport = async () => {
    // H: was N strictly-sequential mutateAsync calls, each invalidating the loops
    // query while the list behind the modal was mounted → ~2N serial requests and
    // no progress. Now: bounded concurrency, a live "k of N" counter, and a SINGLE
    // invalidation at the end (the per-call mutation invalidation is bypassed by
    // calling the API directly).
    setImporting(true);
    setResults(null);
    setImportProgress({ done: 0, total: valid.length });
    const outcome: { tag: string; ok: boolean; message?: string }[] = new Array(valid.length);
    let cursor = 0;
    let done = 0;
    const CONCURRENCY = 4;

    const worker = async () => {
      // Work-stealing: each worker atomically grabs the next row via cursor++ and
      // stops when the list is exhausted (bounded-concurrency bulk import).
      for (let idx = cursor++; idx < valid.length; idx = cursor++) {
        const v = valid[idx].values;
        const tags: CpmTagMapEntry[] = [];
        const add = (role: string, key: string) => { if (v[key]) tags.push({ signalRole: role, unsPath: v[key] }); };
        add('PV', 'pv_tag'); add('SP', 'sp_tag'); add('OP', 'op_tag'); add('MODE', 'mode_tag'); add('VP', 'vp_tag');
        try {
          await activateLoopApi({
            loopId: v['tag'].toUpperCase(),
            displayName: v['service'],
            site: v['site'],
            area: v['area'] || null,
            loopType: v['loop_type'].toUpperCase(),
            criticality: v['criticality'] || null,
            tags,
            thresholdProfileId: v['profile'] || null,
            enableMonitoring: true,
          });
          outcome[idx] = { tag: v['tag'], ok: true };
        } catch (err) {
          outcome[idx] = { tag: v['tag'], ok: false, message: err instanceof Error ? err.message : String(err) };
        }
        done++;
        setImportProgress({ done, total: valid.length });
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, valid.length) }, () => worker()));
    void qc.invalidateQueries({ queryKey: ['cpm', 'loops'] }); // one refresh, not N
    setResults(outcome);
    setImportProgress(null);
    setImporting(false);
  };

  return (
    <div className="cpm-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !importing) onClose(); }}>
      <div ref={dialogRef2} className="cpm-modal" role="dialog" aria-modal="true" tabIndex={-1} aria-label="Import loops from CSV">
        <PanelHead eyebrow="Bulk registry workflow" title="Import loops from CSV"
          right={<ObcButton variant="normal" onClick={downloadTemplate}>Download template</ObcButton>} />

        <label className="cpm-field" style={{ minWidth: 0 }}>
          <span className="cpm-field__label">CSV content</span>
          <textarea
            className="cpm-textarea cpm-mono"
            rows={8}
            value={text}
            onChange={e => { setText(e.target.value); setResults(null); }}
            placeholder={CSV_HEADERS.join(',')}
          />
        </label>

        {text && parsed.missing.length > 0 && (
          <p className="cpm-field__error">Missing required columns: {parsed.missing.join(', ')}</p>
        )}

        {text && parsed.missing.length === 0 && (
          <div className="cpm-csv-summary">
            <KpiSummary caption="Rows detected" value={parsed.rows.length} />
            <KpiSummary caption="Ready" value={valid.length} tone="good" />
            <KpiSummary caption="Need correction" value={parsed.rows.length - valid.length}
              tone={parsed.rows.length - valid.length > 0 ? 'bad' : 'good'} />
            <KpiSummary caption="Existing (will update)" value={parsed.rows.filter(r => r.existing).length} tone="warn" />
          </div>
        )}

        {results && (
          <div style={{ margin: '8px 0' }}>
            {results.map(r => (
              <KvRow key={r.tag} label={r.tag}>
                <TonePill tone={r.ok ? 'good' : 'bad'}>{r.ok ? 'Activated' : r.message ?? 'Failed'}</TonePill>
              </KvRow>
            ))}
          </div>
        )}

        <div className="cpm-wizard-footer">
          <ObcButton variant="normal" onClick={onClose}>Close</ObcButton>
          <span className="cpm-copy">{valid.length} valid row(s)</span>
          <ObcButton
            variant="raised"
            disabled={valid.length === 0 || parsed.missing.length > 0 || importing}
            onClick={runImport}
          >
            {importing ? `Importing… ${importProgress?.done ?? 0} of ${importProgress?.total ?? valid.length}` : 'Import & activate'}
          </ObcButton>
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
