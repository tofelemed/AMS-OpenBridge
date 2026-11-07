/**
 * Task 15: the run bar of the Evidence Workbench. What the reader is looking at, as one row of labelled facts: whether the
 * proof is retained, the pinned run, its samples, the calculation and profile versions, the loop's result, the run id, and Reconstruct.
 * "Proof retained" and "Loop result" are two facts: arrays being held says nothing about whether the evidence suffices,
 * and a no-fault result says nothing about whether the arrays were kept. "Pinned run" is the run being fixed in the
 * URL; it is not the controller's mode. When nothing is held the panel below says so once, so the bar stays silent.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { MethodRun } from '../../../api/cpm/evidence';
import { TonePill } from '../shared';
import { CopyableId } from './CopyableId';
import { workbenchHref, type EvidenceSelection } from './selection';

export interface RunSummaryBarProps {
  run: MethodRun | undefined;
  selection: EvidenceSelection;
  /** The manifest's readiness (COMPLETE, PENDING, FAILED, EXPIRED, NONE). */
  readiness: string | undefined;
  /** The fused window's result, in the shared words (conditionOf). */
  loopResult: string | null;
  /** "Calculation v3.0.0 · profile v2.0.0", as Replay and Calculations write it; absent when the window's row is not read. The build commit is on the Identity & raw tab. */
  versions?: string | null;
  /** The EVALUATE or re-run the page is reading, kept on the run link. */
  analysisRun?: string;
  /** Why Reconstruct is not offered (permission, or the run cannot be rebuilt); absent when it is. */
  reconstructReason?: string;
  reconstructPending?: boolean;
  onReconstruct: () => void;
}

const Fact: React.FC<{ label?: string; children: React.ReactNode }> = ({ label, children }) => (
  <span className="cpm-fact" role="listitem">
    {label && <span className="cpm-fact__label">{label}</span>}
    <span className="cpm-fact__value">{children}</span>
  </span>
);

const readinessTone = (r: string) => r === 'COMPLETE' ? 'good' : r === 'FAILED' ? 'bad' : 'muted';

export const RunSummaryBar: React.FC<RunSummaryBarProps> = ({ run, selection, readiness, loopResult, versions, analysisRun, reconstructReason, reconstructPending, onReconstruct }) => {
  const navigate = useNavigate();
  const held = readiness && readiness !== 'NONE';
  const disabled = !!reconstructReason || !!reconstructPending || !run;
  return (
    <div className="cpm-fact-row cpm-run-bar">
      <div className="cpm-fact-row__facts" role="list" aria-label="Run summary">
        {held && <Fact label="Proof retained"><span className="ui-sr"> · </span><TonePill tone={readinessTone(readiness)}>{readiness}</TonePill></Fact>}
        <Fact>{run ? `${run.windowKind} pinned run` : '—'}{run && run.identity.purpose !== 'LIVE' && <TonePill tone="warn">{run.identity.purpose}</TonePill>}</Fact>
        {run?.support.sampleCount != null && <Fact>{`${run.support.sampleCount.toLocaleString('en-GB')} samples`}</Fact>}
        {versions && <Fact>{versions}</Fact>}
        <Fact label="Loop result">{loopResult ?? '—'}</Fact>
      </div>
      <div className="cpm-run-bar__actions">
        <ObcButton variant="flat"
          onClick={() => navigate(workbenchHref(selection.loopId, selection.methodRunId, selection.gate, { mode: selection.mode, analysisRun, sub: 'identity' }))}>
          Run id ↗
        </ObcButton>
        <CopyableId label="run id" value={selection.methodRunId} />
        {/* the reason rides on a wrapping span: ObcButton takes no title */}
        <span title={reconstructReason}>
          <ObcButton variant="flat" disabled={disabled} onClick={onReconstruct}>
            {reconstructPending ? 'Reconstruction requested…' : 'Reconstruct evidence ↗'}
          </ObcButton>
        </span>
        {reconstructReason && <span className="cpm-run-bar__reason">{reconstructReason}</span>}
      </div>
    </div>
  );
};

export default RunSummaryBar;
