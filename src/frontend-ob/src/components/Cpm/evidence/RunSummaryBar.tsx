/**
 * Task 15: the run's actions in the Evidence Workbench. Whether the evidence is kept, a run that is not live, and Reconstruct,
 * then what the page adds (Evaluate a window). CHG-162 (owner review): it sits at the end of the gate's head row; the window and
 * its samples moved to the foot strip, the loop's result to the window dropdown. CHG-184 (owner review item 9): no run id and no
 * copy button. CHG-187 (owner review 9, 11): one retention label with a ? tip ("Evidence kept" / "Evidence not kept"), and the
 * gate's "Measured vs required" (or "State check") before Reconstruct.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { MethodRun } from '../../../api/cpm/evidence';
import { TonePill } from '../shared';
import { StatusBadge } from '../../../ui/StatusBadge';
import { Toggletip } from '../../../ui/Toggletip';
import type { RetentionLabel } from './retention';

export interface RunSummaryBarProps {
  run: MethodRun | undefined;
  /** Whether this run's evidence is kept (retentionLabel); nothing while unknown or when the evidence-basis line names it. */
  retention: RetentionLabel | null;
  /** Why Reconstruct is not offered (permission, or the run cannot be rebuilt); absent when it is. */
  reconstructReason?: string;
  reconstructPending?: boolean;
  onReconstruct: () => void;
  /** The gate's measured-vs-required control, before Reconstruct. */
  check?: React.ReactNode;
  /** More actions, after Reconstruct (Evaluate a window). */
  children?: React.ReactNode;
}

export const RunSummaryBar: React.FC<RunSummaryBarProps> = ({ run, retention, reconstructReason, reconstructPending, onReconstruct, check, children }) => {
  const disabled = !!reconstructReason || !!reconstructPending || !run;
  return (
    <div className="cpm-fact-row cpm-run-bar">
      <div className="cpm-fact-row__facts" role="list" aria-label="Run summary">
        {retention && (
          <span className="cpm-fact cpm-run-bar__retention" role="listitem">
            <StatusBadge tone={retention.tone}>{retention.text}</StatusBadge>
            {retention.tip.length > 0 && <Toggletip variant="how-to" label={retention.text}>{retention.tip.map(t => <p key={t}>{t}</p>)}</Toggletip>}
          </span>
        )}
        {run && run.identity.purpose !== 'LIVE' && <span className="cpm-fact" role="listitem"><TonePill tone="warn">{run.identity.purpose}</TonePill></span>}
      </div>
      <div className="cpm-run-bar__actions">
        {check}
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
