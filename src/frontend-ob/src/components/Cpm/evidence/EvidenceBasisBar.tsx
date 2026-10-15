/**
 * CHG-099 (SME review 2 #18): "what am I looking at" — the evidence basis of the workbench (retained proof, rebuilt
 * because the original was no longer held, or a reconstruction viewed beside the retained proof) and the switch between
 * the retained proof and the newest reconstruction. The choice lives in the URL (?view=<analysisRunId>).
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { EvidenceManifest } from '../../../api/cpm/evidence';
import { TonePill } from '../shared';
import { basisOf, reconstructionSummary } from './evidenceBasis';

export const EvidenceBasisBar: React.FC<{
  manifest: EvidenceManifest | undefined;
  view: string | null;
  timeZone: string;
  onView: (analysisRunId: string | null) => void;
}> = ({ manifest, view, timeZone, onView }) => {
  if (!manifest) return null;
  const basis = basisOf(manifest, view, timeZone);
  const newest = manifest.reconstructions?.[0];
  // nothing to switch to when the rebuild is all there is (REBUILT_LOST)
  const viewable = newest && newest.differing > 0 && basis.kind !== 'REBUILT_LOST';
  return (
    <div className="cpm-eval-note cpm-evidence-basis" role="group" aria-label="Evidence basis">
      <TonePill tone={basis.tone}>{basis.label}</TonePill>
      <span>{basis.detail}</span>
      {newest && basis.kind === 'RETAINED' && (
        <span className="cpm-event-row__sub">{reconstructionSummary(newest, timeZone)}</span>
      )}
      {viewable && (basis.kind === 'RECONSTRUCTION'
        ? <ObcButton variant="normal" onClick={() => onView(null)}>Show the retained proof</ObcButton>
        : <ObcButton variant="normal" onClick={() => onView(newest.analysisRunId)}>Show the reconstruction</ObcButton>)}
    </div>
  );
};

export default EvidenceBasisBar;
