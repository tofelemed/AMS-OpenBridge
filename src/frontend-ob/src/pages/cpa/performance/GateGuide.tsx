/** SPEC §5.2 inspector, nothing selected: "How to read this view", with what the fleet cannot yet decide. */
import React from 'react';
import type { CpmFleetSummary } from '../../../api/cpmApi';
import { noVpFleetCopy } from '../../../components/Cpm/investigation/confirmationCopy';
import { Inspector } from '../../../ui/Inspector';

export const GateGuide: React.FC<{ summary: CpmFleetSummary | undefined; open: boolean; onClose: () => void }> = ({ summary, open, onClose }) => (
  <Inspector title="How to read this view" open={open} onClose={onClose}>
    <div className="perf-inspector">
      <ol className="perf-inspector__steps">
        <li>Select a gate in the roll-up to list the loops it holds back.</li>
        <li>Each row lists only the checks behind its result. Select one to read it here. Full gate matrix shows every gate.</li>
        <li>Result is the verdict those gates produced.</li>
      </ol>
      {summary && (
        <section className="perf-inspector__section">
          <h3 className="perf-inspector__heading">What this fleet cannot yet decide</h3>
          <p className="perf-inspector__text">
            {noVpFleetCopy(summary.capability.loopsCappedByMissingVp)}{' '}
            {summary.capability.loopsWithoutDisturbanceContext} have no peer links, so stiction cannot be distinguished from an upstream disturbance.
          </p>
        </section>
      )}
    </div>
  </Inspector>
);
