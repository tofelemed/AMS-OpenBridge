/**
 * SME review #20 (CHG-056): the meaning of the evidence score, stated once beside the result it qualifies —
 * plus why it stops where it does when an engine cap applies.
 */
import React from 'react';
import { EVIDENCE_SCORE_HELP, evidenceScoreCap } from './evidenceScore';

export const EvidenceScoreNote: React.FC<{ statusReason?: string | null; score?: number | null }> = ({ statusReason, score }) => {
  const cap = evidenceScoreCap(statusReason, score);
  return (
    <p className="cpm-score-note" data-testid="evidence-score-note">
      {EVIDENCE_SCORE_HELP}{cap ? <> <strong>This score is {cap}.</strong></> : null}
    </p>
  );
};

export default EvidenceScoreNote;
