/**
 * v2.5 Task 2E.3 (spec §3.1-3.2, R13; NR-031): the gate evidence workbench. Its props are an
 * IMMUTABLE selection from the URL (loop, method run, gate, mode); it never asks for "latest" -
 * "Go to the latest run" is an explicit navigation to a new selection. Three columns: the gates of
 * the same window (left), the signal context lanes and the gate's artifacts (centre), the method
 * trace (right). Every non-READY state is stated with its reason and next action.
 */
import React, { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, PanelHead, TonePill } from '../shared';
import { gateTone } from '../gateStatus';
import { useCpmLoops, useGateCatalogue } from '../../../hooks/useCpm';
import { getLatestGates } from '../../../api/cpm/gates';
import { GateEvidenceHeader } from './GateEvidenceHeader';
import { SignalContextLanes } from './SignalContextLanes';
import { MethodTracePanel } from './MethodTracePanel';
import { EvidenceArtifactRenderer } from './EvidenceArtifactRenderer';
import { GateResultStatePanel, classifyGateResult } from './GateResultState';
import { parseSelection, workbenchHref } from './selection';
import { useEvidenceManifest, useMethodRun, useReconstruct } from './useEvidence';
import { formatInZone, siteZoneOf } from './timezone';

const GATE_ORDER = ['G0', 'G1', 'G2', 'G2r', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14', 'G15'];

export const GateEvidenceWorkspace: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const selection = useMemo(() => parseSelection(params), [params]);

  const run = useMethodRun(selection?.methodRunId);
  const manifest = useEvidenceManifest(selection?.methodRunId);
  const catalogue = useGateCatalogue();
  const loops = useCpmLoops();
  const reconstruct = useReconstruct(selection?.methodRunId);

  const loop = loops.data?.loops.find(l => l.loopId.toLowerCase() === (selection?.loopId ?? '').toLowerCase());
  const timeZone = siteZoneOf(loop);
  const timeFmt = useCallback((ms: number) => formatInZone(ms, timeZone), [timeZone]);
  const entry = catalogue.data?.gates.find(g => g.gate === selection?.gate);

  const state = classifyGateResult({
    loading: run.isLoading || manifest.isLoading,
    error: run.error ?? manifest.error ?? null,
    cell: run.data?.cell ? { key: run.data.cell.key, status: run.data.cell.status, reason: run.data.cell.reason } : run.data ? { key: selection!.gate, status: 'EVALUATED', reason: null } : null,
    catalogue: entry ? { capabilityState: entry.capabilityState, capabilityReason: entry.capabilityReason, method: entry.method } : null,
    manifest: manifest.data ? { readiness: manifest.data.readiness, count: manifest.data.count } : null,
    methodRun: run.data ? { purpose: run.data.identity.purpose } : null,
  });

  const goToLatest = async () => {
    if (!selection) return;
    // an explicit navigation: fetch the newest fused window ONCE, on request, and open ITS run
    const latest = await getLatestGates(selection.loopId, run.data?.windowKind && ['4h', '12h', '24h'].includes(run.data.windowKind) ? run.data.windowKind : '24h');
    const cell = latest.gates.find(g => g.key === selection.gate) as { methodRunId?: string | null } | undefined;
    if (cell?.methodRunId) navigate(workbenchHref(selection.loopId, cell.methodRunId, selection.gate));
  };

  if (!selection) {
    return (
      <div className="cpm-screen">
        <EmptyState title="No selection" copy="The workbench opens one immutable method run: ?loop=&methodRun=&gate=. Open a gate cell from Performance, Investigation or the Explorer." />
      </div>
    );
  }

  const siblings = run.data?.methodRunIds ?? {};
  const gateList = GATE_ORDER.filter(g => siblings[g]).map(g => ({
    gate: g,
    methodRunId: siblings[g],
    name: catalogue.data?.gates.find(e => e.gate === g)?.name ?? g,
    role: catalogue.data?.gates.find(e => e.gate === g)?.role ?? '—',
  }));

  return (
    <div className="cpm-screen cpm-evidence-workspace">
      <GateEvidenceHeader selection={selection} run={run.data} entry={entry} loopName={loop?.displayName} timeZone={timeZone}
        readiness={manifest.data?.readiness} onGoToLatest={() => void goToLatest()} />
      <div className="cpm-evidence-columns">
        <aside className="cpm-surface cpm-evidence-gates">
          <PanelHead eyebrow="Same window" title="Gates" />
          {gateList.length === 0 && <p className="cpm-copy">{run.data ? 'This row names no sibling runs.' : 'Loading the run…'}</p>}
          <ul className="cpm-evidence-gates__list">
            {gateList.map(g => (
              <li key={g.gate}>
                <button type="button" className={`cpm-evidence-gate${g.gate === selection.gate ? ' cpm-evidence-gate--selected' : ''}`}
                  aria-current={g.gate === selection.gate ? 'true' : undefined}
                  onClick={() => navigate(workbenchHref(selection.loopId, g.methodRunId, g.gate, selection.mode))}>
                  <span className="cpm-mono">{g.gate}</span>
                  <span>{g.name}</span>
                  <TonePill tone="muted">{g.role}</TonePill>
                </button>
              </li>
            ))}
          </ul>
          {run.data?.cell && <p className="cpm-copy">Selected cell: <TonePill tone={gateTone(run.data.cell.status)}>{run.data.cell.status}</TonePill></p>}
        </aside>

        <main className="cpm-evidence-centre">
          {run.data && (
            <SignalContextLanes methodRunIds={siblings} fromMs={run.data.support.fromMs} toMs={run.data.support.toMs} timeZone={timeZone} timeFmt={timeFmt} />
          )}
          {state.kind === 'READY' && manifest.data ? (
            <EvidenceArtifactRenderer gate={selection.gate} manifest={manifest.data} timeZone={timeZone} timeFmt={timeFmt}
              onNavigateGate={g => siblings[g] && navigate(workbenchHref(selection.loopId, siblings[g], g, selection.mode))} />
          ) : (
            <GateResultStatePanel state={state} busy={reconstruct.isPending}
              onReconstruct={run.data?.reconstruction.supported ? () => reconstruct.mutate() : undefined}
              onRetry={() => { void run.refetch(); void manifest.refetch(); }}
              onGoToLatest={() => void goToLatest()} />
          )}
          {reconstruct.isSuccess && (
            <p className="cpm-copy" role="status">
              Reconstruction accepted (run {reconstruct.data.analysisRunId}); the manifest refreshes when the artifacts arrive.
              <ObcButton variant="flat" onClick={() => void manifest.refetch()}>Refresh</ObcButton>
            </p>
          )}
          {reconstruct.isError && <p className="cpm-field__error" role="alert">Reconstruction refused: {(reconstruct.error as Error).message}</p>}
        </main>

        <MethodTracePanel gate={selection.gate} run={run.data} entry={entry} manifest={manifest.data} state={state} />
      </div>
    </div>
  );
};

export default GateEvidenceWorkspace;
