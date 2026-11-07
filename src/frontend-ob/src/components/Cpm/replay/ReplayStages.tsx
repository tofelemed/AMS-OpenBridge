/**
 * Task 17: the five stages the evidence passed through, as tabs with one info line each (they replace the lineage strip).
 * A stage names where the evidence is read from; it never claims a stage ran when the window has no verdict.
 */
import React, { useState } from 'react';
import { Tabs, tabPanelProps } from '../../../ui/Tabs';
import { diagnosisLabel } from '../vocabulary';
import { STAGE_TABS, gridText, type Stage } from './stageLabels';

export const ReplayStages: React.FC<{
  series: string | undefined;
  samples: number | null | undefined;
  gridS: number | null;
  gateKey: string;
  role: string;
  hasVerdict: boolean;
  diagnosis: string | null | undefined;
  phasePlane: boolean;
}> = ({ series, samples, gridS, gateKey, role, hasVerdict, diagnosis, phasePlane }) => {
  const [stage, setStage] = useState<Stage>('raw');
  const line: Record<Stage, string> = {
    raw: `${series ?? '—'}${samples != null ? ` · ${samples.toLocaleString('en-US')} samples` : ''}${phasePlane ? ' · shown as a PV–OP phase plane' : ''}`,
    normalize: `${gridText(gridS) ?? 'Grid not reported'} · traverse.cpa.loop.samples.v1`,
    features: 'Short features (G0–G4) and long diagnostics (G5–G11) cut from the normalised samples',
    gates: `${gateKey} · ${role}`,
    fusion: hasVerdict ? `Fused verdict (G15): ${diagnosisLabel(diagnosis)}` : 'No verdict stored for this window',
  };
  return (
    <div className="cpm-replay-stages">
      <Tabs idBase="replay-stage" label="Evidence stages" options={STAGE_TABS} value={stage} onChange={setStage} />
      <p className="cpm-copy" {...tabPanelProps('replay-stage', stage)}>{line[stage]}</p>
    </div>
  );
};
