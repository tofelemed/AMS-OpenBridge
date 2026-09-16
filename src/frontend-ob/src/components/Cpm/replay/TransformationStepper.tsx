/**
 * v2.5 Task 2E.2: the replay's transformation stepper, split out of CpmReplay. Stages are the
 * pipeline's fixed shape; a STORED verdict has completed every stage, no verdict claims none
 * (R3). The normalise grid comes from the engine's own sample period when the KPI row carries one.
 */
import React from 'react';

export const stageLabels = (gridS: number | null) => [
  'Raw historian',
  `Normalize (${gridS != null ? `${gridS % 1 === 0 ? gridS : gridS.toFixed(1)} s` : '5 s'} grid)`,
  'Feature windows',
  'Gate evaluation',
  'Fusion (G15)',
];

export const TransformationStepper: React.FC<{ gridS: number | null; hasVerdict: boolean; phasePlane: boolean }> = ({ gridS, hasVerdict, phasePlane }) => (
  <>
    <div className="cpm-wizard-steps" aria-label="Transformation stages">
      {stageLabels(gridS).map((s, i) => (
        <span key={s} className={`cpm-wizard-step${hasVerdict ? ' cpm-wizard-step--done' : ''}`}>
          {i + 1}. {s}
        </span>
      ))}
    </div>
    <p className="cpm-copy">
      Stages are the pipeline's fixed shape; the chart below shows the raw historian slice this window drew from
      {phasePlane ? ' as a PV–OP phase plane (the shape this gate scores)' : ''}.
    </p>
  </>
);
