/**
 * Task 15: the run's actions in the Evidence Workbench. Whether the proof is retained, a run that is not live, and Reconstruct,
 * then what the page adds (Evaluate a window). CHG-162 (owner review): it sits at the end of the gate's head row; the window and
 * its samples moved to the foot strip, the loop's result to the window dropdown. CHG-184 (owner review item 9): no run id and no
 * copy button. When nothing is held the panel below says so once, so this stays silent.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { MethodRun } from '../../../api/cpm/evidence';
import { TonePill } from '../shared';

export interface RunSummaryBarProps {
  run: MethodRun | undefined;
  /** The manifest's readiness (COMPLETE, PENDING, FAILED, EXPIRED, NONE). */
  readiness: string | undefined;
  /** Why Reconstruct is not offered (permission, or the run cannot be rebuilt); absent when it is. */
  reconstructReason?: string;
  reconstructPending?: boolean;
  onReconstruct: () => void;
  /** More actions, after Reconstruct (Evaluate a window). */
  children?: React.ReactNode;
}

const Fact: React.FC<{ label?: string; children: React.ReactNode }> = ({ label, children }) => (
  <span className="cpm-fact" role="listitem">
    {label && <span className="cpm-fact__label">{label}</span>}
    <span className="cpm-fact__value">{children}</span>
  </span>
);

const readinessTone = (r: string) => r === 'COMPLETE' ? 'good' : r === 'FAILED' ? 'bad' : 'muted';

export const RunSummaryBar: React.FC<RunSummaryBarProps> = ({ run, readiness, reconstructReason, reconstructPending, onReconstruct, children }) => {
  const held = readiness && readiness !== 'NONE';
  const disabled = !!reconstructReason || !!reconstructPending || !run;
  return (
    <div className="cpm-fact-row cpm-run-bar">
      <div className="cpm-fact-row__facts" role="list" aria-label="Run summary">
        {/* A failed or expired reconstruction is not "proof retained · FAILED": it names the reconstruction state itself. */}
        {held && (readiness === 'FAILED' || readiness === 'EXPIRED')
          && <Fact><TonePill tone={readinessTone(readiness)}>{readiness === 'FAILED' ? 'Reconstruction failed' : 'Reconstruction expired'}</TonePill></Fact>}
        {held && readiness !== 'FAILED' && readiness !== 'EXPIRED'
          && <Fact label="Proof retained"><span className="ui-sr"> · </span><TonePill tone={readinessTone(readiness)}>{readiness}</TonePill></Fact>}
        {run && run.identity.purpose !== 'LIVE' && <Fact><TonePill tone="warn">{run.identity.purpose}</TonePill></Fact>}
      </div>
      <div className="cpm-run-bar__actions">
        {/* the reason rides on a wrapping span: ObcButton takes no title */}
        <span title={reconstructReason}>
          <ObcButton className="ui-link" variant="flat" disabled={disabled} onClick={onReconstruct}>
            {reconstructPending ? 'Reconstruction requested…' : 'Reconstruct evidence ↗'}
          </ObcButton>
        </span>
        {reconstructReason && <span className="cpm-run-bar__reason">{reconstructReason}</span>}
        {children}
      </div>
    </div>
  );
};

export default RunSummaryBar;
