/**
 * v2.5 Task 2E.3 (spec §3.1-3.2, R13; NR-031) + the 2026-09-17 redesign: the gate evidence
 * workbench. It opens like every loop page - the loop band, here with its evaluated window - and reads one
 * IMMUTABLE method run named in the URL; "Newest" is an explicit navigation within the loaded window list, never a
 * "latest" read. CHG-162 (owner review, approved sample workbench-proposal.html): header → band card (loop, window kind,
 * window, ‹ ›, Newest, Go to date … the way back) → [gate rail | one panel: gate head with the run's actions → evidence basis →
 * four tabs (Proof, Rules & parameters, Signal context, Identity & raw; ?sub=, kept by goTo) → foot strip with the window, its
 * samples and Evidence Replay]. There is no right column, and no More.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, QueryError, WorkspaceHeader, fmtWindowShape, windowSpecsOf } from '../shared';
import { LoopBand } from '../context/LoopBand';
import { useCpmLoops, useCpmResolutions, useGateCatalogue } from '../../../hooks/useCpm';
import { PROFILE_SECONDS } from '../windows/windowMath';
import { DateJump, EvidenceWindowSelect, WindowKindSelect, type WindowKindOption } from './EvidenceToolbar';
import { EvaluateWindow } from './EvaluateWindow';
import { GateRail } from './GateRail';
import { RunSummaryBar } from './RunSummaryBar';
import { WorkbenchHead } from './WorkbenchHead';
import { nominalSamples, samplePeriodOf } from './tabs/proofRows';
import { investigationHref } from '../cpaHref';
import { windowSpan } from '../windowLabel';
import { ReconstructDialog } from './ReconstructDialog';
import { useFusedRow } from './useFusedRow';
import { chipsOf } from './GateChipStrip';
import { VerdictCard } from './VerdictCard';
import { classifyGateResult } from './GateResultState';
import { parseSelection, tabOf, type WorkbenchTab } from './selection';
import { ProofTab } from './tabs/ProofTab';
import { RulesTab } from './tabs/RulesTab';
import { SignalTab } from './tabs/SignalTab';
import { IdentityTab } from './tabs/IdentityTab';
import { Tabs, tabPanelProps, type TabOption } from '../../../ui/Tabs';
import { useAnalysisRunState, useEvidenceManifest, useMethodRun, useReconstruct } from './useEvidence';
import { EvidenceBasisBar } from './EvidenceBasisBar';
import type { EvidenceManifest } from '../../../api/cpm/evidence';
import { TERMINAL_RUN_STATES, reconstructRefusal, reconstructionSettled, viewedManifest } from './evidenceBasis';

/** Manifest poll interval while a reconstruction is pending (plant: artifacts land in ~20 s). */
const RECONSTRUCTION_POLL_MS = 10_000;
import { useGateArtifacts } from './useGateArtifacts';
import { findOptionOfRun, neighbours, resolveLanding, runInWindow, useEvidenceWindows, type WindowOption, type WindowTier } from './useEvidenceWindows';
import { chipCells, gateReasonOf, gateStatusOf } from './gateFacts';
import { verdictSentence } from './verdictCopy';
import { headlineOf } from './views/headlines';
import { formatInZone, siteZoneOf, zoneLabel } from './timezone';
import { buildTierGroups } from '../gateStatus';
import { ReasonedButton } from '../ReasonedButton';
import { backLink, replayLink } from './runLinks';
import { useAuthStore } from '../../../store/authStore';
import { inputContextOf, vpAbsent } from '../optionalInputs';
import { effectiveInputFlags } from '../inputLimits';

const DEFAULT_KIND = '12h';   // CHG-089
const TABS: Array<TabOption<WorkbenchTab>> = [
  { value: 'proof', label: 'Proof' }, { value: 'rules', label: 'Rules & parameters' },
  { value: 'signal', label: 'Signal context' }, { value: 'identity', label: 'Identity & raw' },
];

export const GateEvidenceWorkspace: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [evaluateOpen, setEvaluateOpen] = useState(false);
  const [reconOpen, setReconOpen] = useState(false);
  const selection = useMemo(() => parseSelection(params), [params]);
  const loopId = selection?.loopId ?? params.get('loop')?.trim() ?? undefined;
  const wantedGate = params.get('gate')?.trim() || null;
  const before = params.get('before') ?? undefined;

  const loops = useCpmLoops();
  const resolutions = useCpmResolutions();
  const catalogue = useGateCatalogue();
  // CHG-102 5c: ?analysisRun= names the EVALUATE run the window was opened from (its own verdict, not the live row)
  const analysisRunParam = params.get('analysisRun')?.trim() || undefined;
  const run = useMethodRun(selection?.methodRunId, analysisRunParam);
  const reconstruct = useReconstruct(selection?.methodRunId);
  // A reconstruction lands in ~20 s at the plant; poll while one is pending so the charts appear by themselves
  // (the hook stops polling once readiness is COMPLETE). Without a pending request the manifest is not polled.
  // CHG-099: a reconstruction is stored beside the retained proof, so the poll stops when THAT reconstruction settles —
  // and only for the run it was asked for (navigating to another window drops it)
  const pendingRun = reconstruct.isSuccess && reconstruct.data.reconstructs === selection?.methodRunId
    ? reconstruct.data.analysisRunId : undefined;
  const runState = useAnalysisRunState(pendingRun, RECONSTRUCTION_POLL_MS);
  const settled = useCallback((m: EvidenceManifest) => reconstructionSettled(m, pendingRun), [pendingRun]);
  const rawManifest = useEvidenceManifest(selection?.methodRunId, pendingRun ? RECONSTRUCTION_POLL_MS : undefined, pendingRun ? settled : undefined);
  // a reconstruction listed as still running (asked for earlier, or by someone else): reading its state refreshes it from
  // Flink; once it ends, the manifest is read again so the evidence-basis bar shows the outcome
  const listedPending = !pendingRun ? rawManifest.data?.reconstructions?.find(r => r.readiness === 'PENDING')?.analysisRunId : undefined;
  const listedState = useAnalysisRunState(listedPending, RECONSTRUCTION_POLL_MS);
  const listedEnded = !!listedState.data && TERMINAL_RUN_STATES.has(listedState.data.state);
  useEffect(() => { if (listedEnded) void rawManifest.refetch(); }, [listedEnded]);   // eslint-disable-line react-hooks/exhaustive-deps
  // CHG-099 (SME review 2 #18): ?view=<analysisRunId> shows a reconstruction in place of the differing originals
  const view = params.get('view');
  const manifest = { ...rawManifest, data: viewedManifest(rawManifest.data, view) };
  const setView = (v: string | null) => setParams(p => { if (v) p.set('view', v); else p.delete('view'); return p; }, { replace: true });
  const tab = tabOf(params.get('sub'));
  const setTab = (t: WorkbenchTab) => setParams(p => { if (t === 'proof') p.delete('sub'); else p.set('sub', t); return p; }, { replace: true });
  const canReconstruct = useAuthStore(s => s.hasPermission('cpm.analysis.create'));
  // the dialog closes by itself once the service has acknowledged; the page then states the accepted request
  useEffect(() => { if (reconstruct.isSuccess) setReconOpen(false); }, [reconstruct.isSuccess]);

  const loop = loops.data?.loops.find(l => l.loopId.toLowerCase() === (loopId ?? '').toLowerCase());
  const timeZone = siteZoneOf(loop);
  const timeFmt = useCallback((ms: number) => formatInZone(ms, timeZone), [timeZone]);

  // the window kinds this build serves: fused verdicts, short features, long diagnostics (not also fused)
  const kinds = useMemo<WindowKindOption[]>(() => {
    const fused = resolutions.data?.fusion.firesOn ?? ['12h', '24h'];
    const specs = windowSpecsOf(resolutions.data, k => (PROFILE_SECONDS[k] ?? 0) * 1000);
    return [
      ...fused.map(k => ({ kind: k, tier: 'fused' as WindowTier, label: `${k} — fused verdict` })),
      ...specs.filter(w => w.tier === 'short').map(w => ({ kind: w.kind, tier: 'short' as WindowTier, label: `${w.kind} — ${fmtWindowShape(w) || 'short features'}` })),
      ...specs.filter(w => w.tier === 'long' && !fused.includes(w.kind)).map(w => ({ kind: w.kind, tier: 'long' as WindowTier, label: `${w.kind} — ${fmtWindowShape(w) || 'long diagnostics'}` })),
    ];
  }, [resolutions.data]);
  const kindParam = params.get('kind');
  const kind = kindParam && kinds.some(k => k.kind === kindParam) ? kindParam
    : run.data && kinds.some(k => k.kind === run.data!.windowKind) ? run.data.windowKind : DEFAULT_KIND;
  const tier: WindowTier = kinds.find(k => k.kind === kind)?.tier ?? 'fused';
  const windows = useEvidenceWindows(loopId, kind, tier, timeZone, before);

  /** Navigate to a run, keeping the scope / kind / before params (push = a history entry; replace = the automatic landing). */
  const goTo = useCallback((methodRunId: string, gate: string, replace = false, analysisRun?: string | null) => {
    const p = new URLSearchParams(params);
    p.set('loop', loopId ?? ''); p.set('methodRun', methodRunId); p.set('gate', gate); p.set('mode', selection?.mode ?? 'FIXED');
    if (kindParam) p.set('kind', kindParam);
    if (analysisRun === null) p.delete('analysisRun'); else if (analysisRun) p.set('analysisRun', analysisRun);   // undefined = keep (same window)
    navigate(`?${p.toString()}`, { replace });
  }, [params, loopId, selection?.mode, kindParam, navigate]);

  // landing: a loop without a run opens its newest window that carries run identity
  useEffect(() => {
    if (selection || !loopId || windows.isLoading || windows.options.length === 0) return;
    const target = resolveLanding(windows.options, wantedGate);
    if (target) goTo(target.methodRunId, target.gate, true, null);
  }, [selection, loopId, windows.isLoading, windows.options, wantedGate, goTo]);

  const optionIndex = findOptionOfRun(windows.options, selection?.methodRunId);
  const currentOption: WindowOption | undefined = optionIndex >= 0 ? windows.options[optionIndex] : undefined;
  const nav = neighbours(windows.options, optionIndex);
  // CHG-102 5c: an evaluated window opens on the gate being looked at (its run of that window), else on the fused G15
  const openEvaluated = useCallback((verdict: string, ids: Record<string, string>, analysisRunId: string) => {
    const gate = selection?.gate && ids[selection.gate] ? selection.gate : 'G15';
    goTo(ids[gate] ?? verdict, gate, false, analysisRunId);
  }, [selection?.gate, goTo]);

  const openWindow = (w: WindowOption | null) => {
    if (!w || !selection) return;
    const t = runInWindow(w, selection.gate);
    if (t) goTo(t.methodRunId, t.gate, false, null);
  };

  const entry = catalogue.data?.gates.find(g => g.gate === selection?.gate);
  const status = gateStatusOf(run.data, selection?.gate ?? '');
  const reason = gateReasonOf(run.data, selection?.gate ?? '');
  const state = classifyGateResult({
    loading: run.isLoading || manifest.isLoading,
    error: run.error ?? manifest.error ?? null,
    cell: run.data ? { key: selection!.gate, status: status ?? 'EVALUATED', reason } : null,
    catalogue: entry ? { capabilityState: entry.capabilityState, capabilityReason: entry.capabilityReason, method: entry.method } : null,
    manifest: manifest.data ? { readiness: manifest.data.readiness, count: manifest.data.count } : null,
    methodRun: run.data ? { purpose: run.data.identity.purpose } : null,
    tier: run.data?.tier ?? null, gate: selection?.gate, loopId,
  });
  const arts = useGateArtifacts(state.kind === 'READY' ? manifest.data : undefined, selection?.gate ?? '');
  const eligibilityDetail = currentOption?.methodEligibility?.[selection?.gate ?? '']?.detail ?? null;
  const headline = useMemo(() => (selection ? headlineOf(selection.gate, arts) : []), [selection, arts]);
  // CHG-077: G14's NO_VP on a loop without a valve position is the plant fact, not "not mapped"
  const sentenceReason = reason === 'NO_VP' && vpAbsent(inputContextOf(loop)) ? 'VP_NOT_APPLICABLE' : reason;
  const sentence = selection ? verdictSentence({ gate: selection.gate, name: entry?.name ?? selection.gate, status, reason: sentenceReason, headline, eligibilityDetail }) : '';
  const inputFlags = useMemo(() => effectiveInputFlags(currentOption?.flags?.observabilityFlags, inputContextOf(loop)), [currentOption, loop]);
  // CHG-162: while a run loads (a gate's own run can be slow) the list keeps the window's gates and their runs
  const chips = useMemo(() => chipsOf({
    siblings: run.data?.methodRunIds ?? currentOption?.methodRunIds ?? {},
    cells: chipCells(currentOption?.gates, run.data, analysisRunParam),
    result: run.data?.result ?? null, catalogue: catalogue.data,
    inputFlags,
  }), [run.data, currentOption, catalogue.data, inputFlags, analysisRunParam]);

  const fusedRow = useFusedRow(run.data?.loopId, run.data);
  const md = fusedRow.row?.metadata;
  const versions = md ? `Calculation v${md.calculationVersion ?? '—'} · profile v${md.dynamicsProfileVersion ?? '—'}` : null;
  const reconstructReason = !run.data ? undefined
    : !canReconstruct ? 'Reconstructing evidence needs the cpm.analysis.create permission'
    : !run.data.reconstruction.supported ? reconstructRefusal(run.data.reconstruction.reason) : undefined;
  const gateTier = selection ? buildTierGroups([selection.gate])[0]?.label : undefined;
  const runWindowText = run.data
    ? `${run.data.windowKind} · ${formatInZone(run.data.support.fromMs, timeZone)} → ${formatInZone(run.data.support.toMs, timeZone)} · ${zoneLabel(timeZone, run.data.support.fromMs)}`
    : '';
  // CHG-162: the window and its samples, said once, in the foot strip
  const period = run.data ? samplePeriodOf(run.data, fusedRow.row) : null;
  const nominal = run.data ? nominalSamples(run.data, period) : null;
  const count = run.data?.support.sampleCount;
  const samplesText = count == null ? '' : nominal != null && period != null
    ? ` · ${count.toLocaleString('en-GB')} of ${nominal.toLocaleString('en-GB')} samples at ${Number(period.toFixed(1))} s` : ` · ${count.toLocaleString('en-GB')} samples`;
  const footText = run.data
    ? `${windowSpan({ windowKind: run.data.windowKind, windowStart: run.data.support.fromMs, windowEnd: run.data.support.toMs }, timeZone)}${samplesText}`
    : '';
  const askReconstruct = () => { reconstruct.reset(); setReconOpen(true); };
  // CHG-102 5c: any window the historian holds, evaluated on demand; the result opens on its fused (G15) run
  const evaluate = loopId ? <EvaluateWindow loopId={loopId} timeZone={timeZone} kindHint={kind} onOpen={openEvaluated} /> : null;
  const LOOP_KEYS = ['methodRun', 'gate', 'mode', 'kind', 'before'];
  const support = run.data?.support;
  const runWindow = optionIndex < 0 && support?.fromMs != null && support.toMs != null
    ? `${run.data?.windowKind} · ${formatInZone(support.fromMs, timeZone)} → ${formatInZone(support.toMs, timeZone)} · ${zoneLabel(timeZone, support.fromMs)}`
    : null;
  const atNewest = optionIndex === 0;
  const notListed = "This run's window is not in the listed windows of the chosen kind";
  const toKind = (k: string) => setParams(p => { p.set('kind', k); p.delete('before'); return p; }, { replace: true });
  const toDate = (iso: string) => setParams(p => { p.set('before', iso); return p; }, { replace: true });
  // Older › past the loaded list asks for the next page of windows (Load older windows was under More)
  const older = () => { if (nav.older) openWindow(nav.older); else if (windows.hasMore) windows.loadMore(); };
  const backButton = selection ? (() => { const back = backLink({ loopId: selection.loopId, gate: selection.gate, methodRunId: selection.methodRunId, kind: run.data?.windowKind ?? kind, toMs: run.data?.support.toMs, listedEnd: currentOption?.windowEnd });
    return <ObcButton variant="normal" onClick={() => navigate(back.href)}>{back.label.replace(/^Back to /, '')}</ObcButton>; })() : undefined;
  const band = (
    // CHG-162 (owner review): a card, as on Historical and Investigation; More's controls sit in it
    <LoopBand card loopId={loopId}
      onLoop={id => setParams(p => { p.set('loop', id); for (const k of LOOP_KEYS) p.delete(k); return p; }, { replace: true })}
      end={backButton}>
      <WindowKindSelect kind={kind} kinds={kinds} onKind={toKind} />
      <EvidenceWindowSelect loopId={loopId} kind={kind} windows={windows.options} windowsLoading={windows.isLoading} windowsError={windows.error}
        currentMethodRunId={selection?.methodRunId} currentEnd={currentOption?.windowEnd} onWindow={openWindow} runWindow={runWindow} />
      {windows.error ? <ObcButton variant="flat" onClick={windows.refetch}>Retry</ObcButton> : null}
      {selection && (
        <>
          {/* the reason a stepper is disabled rides on a wrapping span: ObcButton takes no title */}
          <span className="cpm-step-pair">
            <span title={optionIndex < 0 ? notListed : atNewest ? 'Already the newest window' : 'Newer window'}>
              <ObcButton variant="flat" disabled={!nav.newer} onClick={() => { if (nav.newer) openWindow(nav.newer); }}>‹</ObcButton>
            </span>
            <span title={optionIndex < 0 ? notListed : 'Older window'}>
              <ObcButton variant="flat" disabled={!nav.older && !windows.hasMore} onClick={older}>›</ObcButton>
            </span>
          </span>
          <span title={atNewest ? 'Already the newest window' : undefined}>
            <ObcButton variant="flat" disabled={!windows.options[0] || atNewest} onClick={() => openWindow(windows.options[0])}>Newest</ObcButton>
          </span>
        </>
      )}
      {loopId && <DateJump onJump={toDate} />}
    </LoopBand>
  );

  if (!selection) {
    return (
      <div className="cpm-screen cpm-evidence-workspace">
        {/* No run open means no header strip, and so no page title for a screen reader. */}
        <h1 className="cpm-sr-only">Evidence workbench</h1>
        {band}
        {evaluate}
        {!loopId && <EmptyState level={2} title="Pick a loop" copy="Its evaluated windows and gates appear here. A gate cell on Performance, Investigation or System Response opens the workbench on that run directly." />}
        {loopId && windows.isLoading && <EmptyState level={2} title="Listing the evaluated windows…" />}
        {loopId && windows.error != null && <QueryError error={windows.error} retry={windows.refetch} />}
        {loopId && !windows.isLoading && windows.error == null && windows.options.length === 0 && (
          <EmptyState level={2} title={`No ${kind} windows for ${loopId} yet`} copy="Choose another window kind, or wait for the next evaluation." />
        )}
        {loopId && !windows.isLoading && windows.options.length > 0 && !windows.options.some(w => w.hasRunIds) && (
          <EmptyState level={2} title="No window of this loop carries run identity" copy="The listed windows predate v2.5; they cannot be opened in the workbench. Load older windows or pick another kind." />
        )}
      </div>
    );
  }

  const runRef = { loopId: selection.loopId, gate: selection.gate, methodRunId: selection.methodRunId, kind: run.data?.windowKind ?? kind, toMs: run.data?.support.toMs, listedEnd: currentOption?.windowEnd };
  const replay = replayLink(runRef);
  const toHypotheses = () => navigate(investigationHref(selection.loopId, { kind: run.data?.windowKind ?? kind, window: currentOption?.windowEnd, tab: 'Hypotheses' }));

  return (
    // CHG-162: buttons and fields are 32 px, as on Historical and Investigation (cpm-compact)
    <div className="cpm-screen cpm-evidence-workspace cpm-compact">
      <WorkspaceHeader eyebrow="Understand the cause" title="Evidence Workbench" />
      {band}
      {/* Here, not in the More panel: a run must survive a click elsewhere, which closes the panel */}
      {evaluateOpen && evaluate}
      <div className="cpm-workbench">
      {run.data || currentOption
        ? <GateRail chips={chips} selected={selection.gate} onSelect={g => { const id = chips.find(c => c.gate === g)?.methodRunId; if (id) goTo(id, g); }} />
        : <div className="cpm-rail" aria-hidden />}
      <section className="cpm-surface cpm-workbench__main">
      <WorkbenchHead gate={selection.gate} name={entry?.name ?? selection.gate} tier={gateTier} status={status} inputFlags={inputFlags}
        actions={(
          <RunSummaryBar run={run.data} selection={selection} readiness={manifest.data?.readiness}
            reconstructReason={reconstructReason} reconstructPending={reconstruct.isPending} onReconstruct={askReconstruct}>
            {evaluate && <ObcButton variant="flat" aria-expanded={evaluateOpen} onClick={() => setEvaluateOpen(v => !v)}>{evaluateOpen ? 'Hide Evaluate a window' : 'Evaluate a window'}</ObcButton>}
          </RunSummaryBar>
        )} />
      <EvidenceBasisBar manifest={rawManifest.data} view={view} timeZone={timeZone} onView={setView}
        evaluated={run.data?.identity.purpose === 'EVALUATE'} onOpenRun={id => goTo(id, selection.gate)} />
      <div aria-busy={run.isLoading || manifest.isLoading}>
        <VerdictCard gate={selection.gate} name={entry?.name ?? selection.gate} status={status} reason={reason} state={state} sentence={sentence} headline={headline}
          tier={gateTier} inputFlags={inputFlags} noHead />
      </div>
      {reconstruct.isSuccess && (
        <p className="cpm-copy" role="status">
          Reconstruction accepted (run {reconstruct.data.analysisRunId}){runState.data ? ` · ${runState.data.state.toLowerCase()}` : ''}.
          It is stored beside the retained proof, never over it; this page lists it above when it arrives.
          <ObcButton variant="flat" onClick={() => void rawManifest.refetch()}>Refresh</ObcButton>
        </p>
      )}
      {reconstruct.isError && !reconOpen && <p className="cpm-field__error" role="alert">Reconstruction refused: {(reconstruct.error as Error).message}</p>}
      <Tabs idBase="workbench" label="Evidence Workbench views" options={TABS} value={tab} onChange={setTab} />
      <div {...tabPanelProps('workbench', tab)}>
        {tab === 'proof' && (
          <ProofTab gate={selection.gate} run={run.data} manifest={manifest.data} state={state} eligibilityDetail={eligibilityDetail}
            timeZone={timeZone} timeFmt={timeFmt} inputs={inputContextOf(loop)}
            onRetry={() => { void run.refetch(); void rawManifest.refetch(); }}
            onGoToLatest={windows.options[0] ? () => openWindow(windows.options[0]) : undefined}
            onNavigateGate={g => { const id = run.data?.methodRunIds[g]; if (id) goTo(id, g); }}
            onHypotheses={selection.gate === 'G15' ? toHypotheses : undefined} />
        )}
        {tab === 'rules' && <RulesTab gate={selection.gate} run={run.data} entry={entry} manifest={rawManifest.data} manifestLoading={rawManifest.isLoading} manifestError={rawManifest.error} timeZone={timeZone} />}
        {tab === 'signal' && <SignalTab run={run.data} timeZone={timeZone} timeFmt={timeFmt} />}
        {tab === 'identity' && <IdentityTab run={run.data} manifest={manifest.data} flags={currentOption?.flags} inputs={inputContextOf(loop)} versions={versions} />}
      </div>
      {run.data && (
        <div className="cpm-workbench__foot">
          <span className="cpm-copy">{footText}</span>
          <ReasonedButton variant="flat" disabled={replay.href == null} reason={replay.href == null ? replay.reason : null}
            onClick={() => { if (replay.href) navigate(replay.href); }}>Evidence Replay ↗</ReasonedButton>
        </div>
      )}
      </section>
      </div>
      <ReconstructDialog open={reconOpen} loopId={selection.loopId} gate={`${selection.gate} ${entry?.name ?? ''}`.trim()} windowText={runWindowText} runId={selection.methodRunId}
        state={reconstruct.isPending ? 'pending' : reconstruct.isError ? 'error' : 'idle'} error={reconstruct.isError ? (reconstruct.error as Error).message : undefined}
        onConfirm={() => reconstruct.mutate()} onClose={() => setReconOpen(false)} />
    </div>
  );
};

export default GateEvidenceWorkspace;
