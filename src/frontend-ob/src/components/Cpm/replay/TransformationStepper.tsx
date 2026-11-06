/**
 * v2.5 Task 2E.2: what the replay chart shows, split out of CpmReplay. CHG-130: labels, not controls, so they sit behind a ? with
 * the normalise grid. Stages are the pipeline's fixed shape; a STORED verdict has completed every stage, no verdict claims none
 * (R3). The grid comes from the engine's own sample period when the KPI row carries one.
 */
import React from 'react';
import { Toggletip } from '../../../ui/Toggletip';

export const stageLabels = (gridS: number | null) => [
  'Raw historian',
  // CHG-065: a missing or zero grid is "not reported", never "0 s" (or a silently assumed 5 s)
  gridS != null && gridS > 0 ? `Normalize (${gridS % 1 === 0 ? gridS : gridS.toFixed(1)} s grid)` : 'Normalize (grid not reported)',
  'Feature windows',
  'Gate evaluation',
  'Fusion (G15)',
];

export const TransformationStepper: React.FC<{ gridS: number | null; hasVerdict: boolean; phasePlane: boolean }> = ({ gridS, hasVerdict, phasePlane }) => (
  <Toggletip variant="how-to" label="About this chart">
    <p>
      The chart shows the raw historian slice this window drew from{phasePlane ? ' as a PV–OP phase plane (the shape this gate scores)' : ''}.
    </p>
    <p>{hasVerdict ? 'This stored verdict completed every stage' : 'No verdict, so no stage is claimed'}: {stageLabels(gridS).map((s, i) => `${i + 1}. ${s}`).join(', ')}.</p>
  </Toggletip>
);
