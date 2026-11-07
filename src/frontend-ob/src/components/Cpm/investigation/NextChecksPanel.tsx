/**
 * CHG-141: what to look at next on this window. Links only: a tick could not be saved. `nextChecks.ts` chooses them by
 * what the window is; this runs them.
 */
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
}> = ({ matrix, loopId, windowKind, onSignals, onGate, onDialog }) => {
  const navigate = useNavigate();
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
      <PanelHead title="Next checks" />
      <ul className="cpm-inv-checks">
        {nextChecks(matrix, { loopId, windowKind }).map(c => (
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
