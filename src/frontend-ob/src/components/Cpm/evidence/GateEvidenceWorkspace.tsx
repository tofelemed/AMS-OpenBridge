/**
 * v2.5 Task 2E.3 (spec §3.1-3.2, R13; NR-031) + the 2026-09-17 redesign: the gate evidence
 * workbench. It opens like every CPM page - scope filter, loop search, window kind, evaluated
 * window - and reads one IMMUTABLE method run named in the URL; "Newest" is an explicit navigation
 * within the loaded window list, never a "latest" read. Layout: toolbar → header facts → gate strip
 * → reading column (verdict, signal context, evidence, flags) + collapsible explain column.
 */
import React, { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, QueryError, fmtWindowShape, windowSpecsOf } from '../shared';
import { LoopContextBar } from '../context/LoopContextBar';
import { useCpmLoops, useCpmResolutions, useGateCatalogue } from '../../../hooks/useCpm';
import { useCpmScope } from '../plantScope';
import { PROFILE_SECONDS } from '../windows/windowMath';
import { EvidenceToolbar, type WindowKindOption } from './EvidenceToolbar';
import { EvidenceHeaderStrip } from './EvidenceHeaderStrip';
import { GateChipStrip, chipsOf } from './GateChipStrip';
import { VerdictCard, WindowFlags } from './VerdictCard';
import { ExplainPanel, useExplainCollapsed } from './ExplainPanel';
import { SignalContextLanes } from './SignalContextLanes';
import { EvidenceArtifactRenderer } from './EvidenceArtifactRenderer';
import { GateResultStatePanel, classifyGateResult } from './GateResultState';
import { parseSelection } from './selection';
import { useEvidenceManifest, useMethodRun, useReconstruct } from './useEvidence';

/** Manifest poll interval while a reconstruction is pending (plant: artifacts land in ~20 s). */
const RECONSTRUCTION_POLL_MS = 10_000;
import { useGateArtifacts } from './useGateArtifacts';
import { findOptionOfRun, neighbours, resolveLanding, runInWindow, useEvidenceWindows, type WindowOption, type WindowTier } from './useEvidenceWindows';
import { gateReasonOf, gateStatusOf } from './gateFacts';
import { verdictSentence } from './verdictCopy';
import { headlineOf } from './views/headlines';
import { formatInZone, siteZoneOf } from './timezone';

const DEFAULT_KIND = '24h';

export const GateEvidenceWorkspace: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const selection = useMemo(() => parseSelection(params), [params]);
  const loopId = selection?.loopId ?? params.get('loop')?.trim() ?? undefined;
  const wantedGate = params.get('gate')?.trim() || null;
  const before = params.get('before') ?? undefined;

  const scope = useCpmScope();
  const loops = useCpmLoops();
  const resolutions = useCpmResolutions();
  const catalogue = useGateCatalogue();
  const run = useMethodRun(selection?.methodRunId);
  const reconstruct = useReconstruct(selection?.methodRunId);
  // A reconstruction lands in ~20 s at the plant; poll while one is pending so the charts appear by themselves
  // (the hook stops polling once readiness is COMPLETE). Without a pending request the manifest is not polled.
  const manifest = useEvidenceManifest(selection?.methodRunId, reconstruct.isSuccess ? RECONSTRUCTION_POLL_MS : undefined);
  const [explainCollapsed, toggleExplain] = useExplainCollapsed();

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
  const goTo = useCallback((methodRunId: string, gate: string, replace = false) => {
    const p = new URLSearchParams(params);
    p.set('loop', loopId ?? ''); p.set('methodRun', methodRunId); p.set('gate', gate); p.set('mode', selection?.mode ?? 'FIXED');
    if (kindParam) p.set('kind', kindParam);
    navigate(`?${p.toString()}`, { replace });
  }, [params, loopId, selection?.mode, kindParam, navigate]);

  // landing: a loop without a run opens its newest window that carries run identity
  useEffect(() => {
    if (selection || !loopId || windows.isLoading || windows.options.length === 0) return;
    const target = resolveLanding(windows.options, wantedGate);
    if (target) goTo(target.methodRunId, target.gate, true);
  }, [selection, loopId, windows.isLoading, windows.options, wantedGate, goTo]);

  const optionIndex = findOptionOfRun(windows.options, selection?.methodRunId);
  const currentOption: WindowOption | undefined = optionIndex >= 0 ? windows.options[optionIndex] : undefined;
  const nav = neighbours(windows.options, optionIndex);
  const openWindow = (w: WindowOption | null) => {
    if (!w || !selection) return;
    const t = runInWindow(w, selection.gate);
    if (t) goTo(t.methodRunId, t.gate);
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
  const sentence = selection ? verdictSentence({ gate: selection.gate, name: entry?.name ?? selection.gate, status, reason, headline, eligibilityDetail }) : '';
  const chips = useMemo(() => chipsOf({
    siblings: run.data?.methodRunIds ?? {},
    cells: currentOption?.gates ?? (run.data?.cell ? [{ key: run.data.cell.key, status: run.data.cell.status, reason: run.data.cell.reason }] : undefined),
    result: run.data?.result ?? null, catalogue: catalogue.data,
  }), [run.data, currentOption, catalogue.data]);

  const toolbar = (
    <EvidenceToolbar scope={scope} loops={loops.data?.loops ?? []} loopId={loopId} kind={kind} kinds={kinds}
      windows={windows.options} windowsLoading={windows.isLoading} windowsError={windows.error} onRetryWindows={windows.refetch}
      currentMethodRunId={selection?.methodRunId} hasMore={windows.hasMore} onLoadMore={windows.loadMore} loadingMore={windows.isLoadingMore}
      onLoop={id => setParams(p => { p.set('loop', id); for (const k of ['methodRun', 'gate', 'mode', 'kind', 'before']) p.delete(k); return p; }, { replace: true })}
      onClearLoop={() => setParams(p => { for (const k of ['loop', 'methodRun', 'gate', 'mode', 'kind', 'before']) p.delete(k); return p; }, { replace: true })}
      onKind={k => setParams(p => { p.set('kind', k); p.delete('before'); return p; }, { replace: true })}
      onWindow={openWindow}
      onJump={iso => setParams(p => { p.set('before', iso); return p; }, { replace: true })} />
  );

  if (!selection) {
    return (
      <div className="cpm-screen cpm-evidence-workspace">
        <LoopContextBar loopId={loopId} timeZone={timeZone} period={{ label: `${kind} windows (none opened)` }} />
        {toolbar}
        {!loopId && <EmptyState title="Pick a loop" copy="Its evaluated windows and gates appear here. A gate cell on Performance, Investigation or System Response opens the workbench on that run directly." />}
        {loopId && windows.isLoading && <EmptyState title="Listing the evaluated windows…" />}
        {loopId && windows.error != null && <QueryError error={windows.error} retry={windows.refetch} />}
        {loopId && !windows.isLoading && windows.error == null && windows.options.length === 0 && (
          <EmptyState title={`No ${kind} windows for ${loopId} yet`} copy="Choose another window kind, or wait for the next evaluation." />
        )}
        {loopId && !windows.isLoading && windows.options.length > 0 && !windows.options.some(w => w.hasRunIds) && (
          <EmptyState title="No window of this loop carries run identity" copy="The listed windows predate v2.5; they cannot be opened in the workbench. Load older windows or pick another kind." />
        )}
      </div>
    );
  }

  return (
    <div className="cpm-screen cpm-evidence-workspace">
      <LoopContextBar loopId={loopId} timeZone={timeZone} period={run.data ? { label: `${run.data.windowKind} window`, start: run.data.support.fromMs, end: run.data.support.toMs } : null} />
      {toolbar}
      <EvidenceHeaderStrip selection={selection} run={run.data} entry={entry} loopName={loop?.displayName} timeZone={timeZone}
        readiness={manifest.data?.readiness}
        nav={{ newer: nav.newer ? () => openWindow(nav.newer) : null, older: nav.older ? () => openWindow(nav.older) : null,
          newest: windows.options[0] ? () => openWindow(windows.options[0]) : null, atNewest: optionIndex === 0, inList: optionIndex >= 0 }}
        reconstruct={state.action === 'RECONSTRUCT' && run.data?.reconstruction.supported ? { onClick: () => reconstruct.mutate(), busy: reconstruct.isPending } : undefined} />
      {run.data && <GateChipStrip chips={chips} selected={selection.gate} onOpen={(g, id) => goTo(id, g)} />}
      <div className={`cpm-evidence-body${explainCollapsed ? ' cpm-evidence-body--explain-closed' : ''}`}>
        <main className="cpm-evidence-centre" aria-busy={run.isLoading || manifest.isLoading}>
          <VerdictCard gate={selection.gate} name={entry?.name ?? selection.gate} status={status} reason={reason} state={state} sentence={sentence} headline={headline} />
          {run.data ? (
            <SignalContextLanes loopId={run.data.loopId} methodRunIds={run.data.methodRunIds} fromMs={run.data.support.fromMs} toMs={run.data.support.toMs} timeZone={timeZone} timeFmt={timeFmt} />
          ) : <div className="cpm-surface cpm-skeleton cpm-skeleton--lanes" aria-hidden />}
          {state.kind === 'READY' && manifest.data ? (
            <EvidenceArtifactRenderer gate={selection.gate} manifest={manifest.data} timeZone={timeZone} timeFmt={timeFmt}
              onNavigateGate={g => { const id = run.data?.methodRunIds[g]; if (id) goTo(id, g); }} />
          ) : state.kind === 'LOADING' ? (
            <div className="cpm-surface cpm-skeleton cpm-skeleton--evidence" aria-hidden />
          ) : (
            <GateResultStatePanel state={state} busy={reconstruct.isPending}
              onReconstruct={run.data?.reconstruction.supported ? () => reconstruct.mutate() : undefined}
              onRetry={() => { void run.refetch(); void manifest.refetch(); }}
              onGoToLatest={windows.options[0] ? () => openWindow(windows.options[0]) : undefined} />
          )}
          {reconstruct.isSuccess && (
            <p className="cpm-copy" role="status">
              Reconstruction accepted (run {reconstruct.data.analysisRunId}); the manifest refreshes when the artifacts arrive.
              <ObcButton variant="flat" onClick={() => void manifest.refetch()}>Refresh</ObcButton>
            </p>
          )}
          {reconstruct.isError && <p className="cpm-field__error" role="alert">Reconstruction refused: {(reconstruct.error as Error).message}</p>}
          <WindowFlags row={currentOption?.flags} />
        </main>
        <ExplainPanel gate={selection.gate} run={run.data} entry={entry} manifest={manifest.data} state={state} status={status} reason={reason}
          eligibilityDetail={eligibilityDetail} collapsed={explainCollapsed} onToggle={toggleExplain} />
      </div>
    </div>
  );
};

export default GateEvidenceWorkspace;
