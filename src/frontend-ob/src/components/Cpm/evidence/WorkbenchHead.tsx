/**
 * CHG-162 (owner review): the Workbench's gate panel head: the gate's tier, its name and its mark on the left; the run's actions
 * (proof retained, the run id to copy, Reconstruct, Evaluate a window) on the right. It replaces the run bar and the verdict
 * card's own heading, which said the loop's result, the window and the versions again.
 */
import React from 'react';
import { GateBadge } from '../../../ui/GateBadge';

export const WorkbenchHead: React.FC<{
  gate: string;
  name: string;
  /** The gate's tier ("Diagnostic evidence"). */
  tier?: string;
  status: string | null;
  inputFlags?: readonly string[] | null;
  /** The run's actions, at the end of the row. */
  actions: React.ReactNode;
}> = ({ gate, name, tier, status, inputFlags, actions }) => (
  <div className="cpm-workbench__head">
    <div className="cpm-workbench__gate">
      {tier && <span className="cpm-eyebrow">{tier}</span>}
      <div className="cpm-title-row">
        <h2 className="cpm-panel-title">{gate} · {name}</h2>
        {status && <GateBadge status={status} gate={gate} inputFlags={inputFlags} />}
      </div>
    </div>
    {actions}
  </div>
);

export default WorkbenchHead;
