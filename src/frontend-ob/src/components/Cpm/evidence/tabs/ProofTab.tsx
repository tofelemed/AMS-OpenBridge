/**
 * Task 16: the Workbench's Proof tab. The window the run covers, the inputs the gate was computed from (metric id, value,
 * unit), the run's own artifacts or the state that says why there are none, and why the result is what it is: measured
 * against required, the cause breakdown, what remains open. The two links go on to Rules & parameters and Signal context.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { EvidenceManifest, MethodRun } from '../../../../api/cpm/evidence';
import { EvidenceArtifactRenderer } from '../EvidenceArtifactRenderer';
import { ExplainWhy } from '../ExplainWhy';
import { GateResultStatePanel, type GateState } from '../GateResultState';
import { useFusedRow } from '../useFusedRow';
import { formatInZone, zoneLabel } from '../timezone';
import type { InputContext } from '../../optionalInputs';
import { nominalSamples, proofRows, samplePeriodOf } from './proofRows';

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
  onRules: () => void;
  onSignal: () => void;
}

export const ProofTab: React.FC<ProofTabProps> = ({
  gate, run, manifest, state, eligibilityDetail, timeZone, timeFmt, inputs, onRetry, onGoToLatest, onNavigateGate, onRules, onSignal,
}) => {
  const { row } = useFusedRow(run?.loopId, run);
  const rows = run ? proofRows(gate, run, row) : [];
  const period = run ? samplePeriodOf(run, row) : null;
  const nominal = run ? nominalSamples(run, period) : null;
  return (
    <div className="cpm-workbench__tab" aria-busy={state.kind === 'LOADING'}>
      {run && (
        <p className="cpm-copy">
          {formatInZone(run.support.fromMs, timeZone)} → {formatInZone(run.support.toMs, timeZone)} · {zoneLabel(timeZone, run.support.fromMs)}
          {nominal != null && ` · Nominal ${nominal.toLocaleString('en-GB')} samples at ${period} s`}
        </p>
      )}
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
        <div className="cpm-surface cpm-skeleton cpm-skeleton--evidence" aria-hidden />
      ) : (
        <GateResultStatePanel state={state} onRetry={onRetry} onGoToLatest={onGoToLatest} />
      )}
      <ExplainWhy gate={gate} run={run} manifest={manifest} eligibilityDetail={eligibilityDetail} inputs={inputs} />
      <div className="cpm-workbench__links">
        <ObcButton variant="flat" onClick={onRules}>See rules &amp; parameters →</ObcButton>
        <ObcButton variant="flat" onClick={onSignal}>View signal context →</ObcButton>
      </div>
    </div>
  );
};

export default ProofTab;
