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
  /** Opens another method run in the workbench (a rebuild that landed under a new run identity). */
  onOpenRun?: (methodRunId: string) => void;
}> = ({ manifest, view, timeZone, onView, onOpenRun }) => {
  if (!manifest) return null;
  const basis = basisOf(manifest, view, timeZone);
  const newest = manifest.reconstructions?.[0];
  // nothing to switch to when the rebuild is all there is (REBUILT_LOST)
  const viewable = newest && newest.differing > 0 && basis.kind !== 'REBUILT_LOST';
  return (
    <div className="cpm-eval-note cpm-evidence-basis" role="group" aria-label="Evidence basis">
      <TonePill tone={basis.tone}>{basis.label}</TonePill>
      <span>{basis.detail}</span>
      {/* lab pass 2026-10-15: the newest reconstruction is named on every basis, not only beside retained proof */}
      {/* not repeated when the basis text already carries it (the rebuild shown by default) */}
      {newest && basis.kind !== 'RECONSTRUCTION' && !basis.detail.includes(reconstructionSummary(newest, timeZone, false)) && (
        <span className="cpm-event-row__sub">{reconstructionSummary(newest, timeZone)}</span>
      )}
      {newest?.rebuiltAs && onOpenRun && (
        <ObcButton variant="normal" onClick={() => onOpenRun(newest.rebuiltAs!)}>Open the rebuilt run ›</ObcButton>
      )}
      {viewable && (basis.kind === 'RECONSTRUCTION'
        ? <ObcButton variant="normal" onClick={() => onView(null)}>Show the retained proof</ObcButton>
        : <ObcButton variant="normal" onClick={() => onView(newest.analysisRunId)}>Show the reconstruction</ObcButton>)}
    </div>
  );
};

export default EvidenceBasisBar;
