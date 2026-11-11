/**
 * CHG-098 (SME review 2 #28): the fixed pipeline windows used to be a wizard step of their own ("Windows &
 * profile") with nothing to edit. The content is unchanged: read from the served window contract rather than restated, since
 * the hardcoded copies had drifted into claiming every short window was tumbling.
 * CHG-168 (owner review): they sit behind the ? of the review's All settings ("How this loop is evaluated"); a Toggletip renders
 * its content only while open, so the window contract is still fetched only when someone asks for it.
 */
import React, { useMemo } from 'react';
import { Toggletip } from '../../../../ui/Toggletip';
import { KvRow, fmtDuration, fmtWindowShape, windowSpecsOf } from '../../shared';
import { useCpmResolutions } from '../../../../hooks/useCpm';
import './wizard.css';

const PipelineFacts: React.FC = () => {
  const resolutions = useCpmResolutions();
  // Names-only fallback when the API predates the contract (see windowSpecsOf).
  const windowSpecs = useMemo(() => windowSpecsOf(resolutions.data, () => 0), [resolutions.data]);
  // Shape when the API served it, bare kind when it didn't.
  const shortSummary = windowSpecs.filter(w => w.tier === 'short').map(w => fmtWindowShape(w) || w.kind).join(' · ');
  const long = windowSpecs.filter(w => w.tier === 'long');
  // Same cadence across the long tier, so name it once rather than per slice.
  const cadence = long[0]?.cadenceMs;
  const longSummary = long.length ? `${long.map(w => w.kind).join(' / ')} slices${cadence ? ` · ${fmtDuration(cadence)} cadence` : ''}` : '';
  const minSamples = windowSpecs.find(w => w.minSamples != null)?.minSamples ?? null;
  return (
    <>
      <KvRow label="Short features (G0–G4)">{shortSummary || '—'}</KvRow>
      <KvRow label="Long diagnostics (G5–G11)">{longSummary || '—'}</KvRow>
      <KvRow label="Fusion (G12–G15)">
        {resolutions.data?.fusion ? `Fires on ${resolutions.data.fusion.firesOn.join(' and ')} long records` : '—'}
      </KvRow>
      <p>
        Windows are fixed by the deployed pipeline and are not set per loop. First fused verdict needs ≥ 12 h of samples
        {minSamples != null ? `, and any slice with fewer than ${minSamples} samples is not evaluated at all` : ''}.
        Paths resolve through the binding resolver; the readiness report after saving flags any signal that falls
        back to path-pattern resolution instead of the asset model.
      </p>
    </>
  );
};

export const PipelineHelp: React.FC = () => (
  <Toggletip variant="how-to" label="How this loop is evaluated"><PipelineFacts /></Toggletip>
);

export default PipelineHelp;
