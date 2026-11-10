/**
 * CHG-141: what to look at next on this window. Links only: a tick could not be saved. `nextChecks.ts` chooses them by
 * what the window is; this runs them. CHG-160 (owner review): on the Review tab, led by the result's own next check, with
 * whatever the page puts in the head (Related events).
 */
import { usePipelineAccess } from '../access';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { PanelHead } from '../shared';
import type { InvestigationDialog } from './InvestigationDialogs';
import { nextChecks, type CheckAction } from './nextChecks';

export const NextChecks: React.FC<{
  matrix: CpmGateMatrix;
  loopId: string;
  windowKind: string;
  onSignals: () => void;
  onGate: (gate: string) => void;
  onDialog: (dialog: InvestigationDialog) => void;
  /** The result's next check, said first. */
  lead?: string;
  /** At the end of the head. */
  right?: React.ReactNode;
}> = ({ matrix, loopId, windowKind, onSignals, onGate, onDialog, lead, right }) => {
  const navigate = useNavigate();
  const canPipeline = usePipelineAccess();
  const run = (action: CheckAction) => {
    switch (action.kind) {
      case 'link': navigate(action.to); break;
      case 'signals': onSignals(); break;
      case 'gate': onGate(action.gate); break;
      default: onDialog(action);
    }
  };
  return (
    <section className="cpm-surface" aria-label="Next checks">
      <PanelHead title="Next checks" right={right} />
      {lead && <p className="cpm-inv-checks__lead"><strong>{lead}</strong></p>}
      <ul className="cpm-inv-checks">
        {nextChecks(matrix, { loopId, windowKind, canPipeline }).map(c => (
          <li key={c.label}>
            <span>{c.label}</span>
            <ObcButton variant="flat" onClick={() => run(c.action)}>{c.link}</ObcButton>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default NextChecks;
