/**
 * Task 16: the Workbench's Proof tab. The inputs the gate was computed from (metric id, value, unit), the run's own artifacts or
 * the state that says why there are none, and why the result is what it is: measured against required, the evidence behind it,
 * what remains open. CHG-162 (owner review): the window and its samples are in the page's foot strip, and the two links that
 * repeated the tabs above went.
 */
import React from 'react';
import type { EvidenceManifest, MethodRun } from '../../../../api/cpm/evidence';
import { EvidenceArtifactRenderer } from '../EvidenceArtifactRenderer';
import { ExplainWhy } from '../ExplainWhy';
import { GateResultStatePanel, type GateState } from '../GateResultState';
import { useFusedRow } from '../useFusedRow';
import type { InputContext } from '../../optionalInputs';
import { proofRows } from './proofRows';

export interface ProofTabProps {
  gate: string;
  run: MethodRun | undefined;
  manifest: EvidenceManifest | undefined;
  state: GateState;
  eligibilityDetail: string | null;
  timeZone: string;
  timeFmt: (ms: number) => string;
  inputs?: InputContext;
  onRetry: () => void;
  onGoToLatest?: () => void;
  onNavigateGate: (gate: string) => void;
  /** Opens the loop's hypotheses on Investigation (the decision gate only). */
  onHypotheses?: () => void;
}

export const ProofTab: React.FC<ProofTabProps> = ({
  gate, run, manifest, state, eligibilityDetail, timeZone, timeFmt, inputs, onRetry, onGoToLatest, onNavigateGate, onHypotheses,
}) => {
  const { row } = useFusedRow(run?.loopId, run);
  const rows = run ? proofRows(gate, run, row) : [];
  return (
    <div className="cpm-workbench__tab" aria-busy={state.kind === 'LOADING'}>
      {rows.length > 0 && (
        <table className="cpm-table" aria-label={`Inputs of ${gate}`}>
          <thead><tr><th>Input</th><th>Metric</th><th>Value</th><th>Unit</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id ?? r.name}>
                <td>{r.name}</td><td className="cpm-mono">{r.id ?? '—'}</td><td>{r.value}</td><td>{r.unit || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {state.kind === 'READY' && manifest ? (
        <EvidenceArtifactRenderer gate={gate} manifest={manifest} timeZone={timeZone} timeFmt={timeFmt} onNavigateGate={onNavigateGate} />
      ) : state.kind === 'LOADING' ? (
        <div className="cpm-skeleton cpm-skeleton--evidence"><span className="cpm-skeleton__label">Loading the evidence…</span></div>
      ) : (
        <GateResultStatePanel state={state} onRetry={onRetry} onGoToLatest={onGoToLatest} />
      )}
      <ExplainWhy gate={gate} run={run} manifest={manifest} eligibilityDetail={eligibilityDetail} inputs={inputs} onHypotheses={onHypotheses} />
    </div>
  );
};

export default ProofTab;
