/**
 * CHG-162 (owner review): the Workbench's gate panel head: the gate's name and its mark on the left; the run's actions (evidence
 * kept, measured vs required, Reconstruct, Evaluate a window) on the right. It replaces the run bar and the verdict card's own
 * heading, which said the loop's result, the window and the versions again. CHG-187 (owner review 11.2): no caps tier eyebrow;
 * the gate list beside it groups the gates by tier already.
 */
import React from 'react';
import { GateBadge } from '../../../ui/GateBadge';

export const WorkbenchHead: React.FC<{
  gate: string;
  name: string;
  status: string | null;
  inputFlags?: readonly string[] | null;
  /** The run's actions, at the end of the row. */
  actions: React.ReactNode;
}> = ({ gate, name, status, inputFlags, actions }) => (
  <div className="cpm-workbench__head">
    <div className="cpm-workbench__gate">
      <div className="cpm-title-row">
        <h2 className="cpm-panel-title">{gate} · {name}</h2>
        {status && <GateBadge status={status} gate={gate} inputFlags={inputFlags} />}
      </div>
    </div>
    {actions}
  </div>
);

export default WorkbenchHead;
