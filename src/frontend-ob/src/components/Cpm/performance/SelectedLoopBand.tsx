/**
 * The selected loop, above the list and only once one is selected: its tag, result, evidence score and the two ways
 * on. An older verdict is named as last, never as current.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { TonePill, toneFor } from '../shared';
import { investigationHref } from '../cpaHref';
import { ageText, isSameVerdict, staleVerdictLine } from '../verdictAge';
import { diagnosisLabel } from '../vocabulary';
import { evidenceScoreText } from '../evidenceScore';
import { hasVerdict } from '../metricAvailability';
import type { CpmHeatmapLoop } from '../../../api/cpmApi';

export const SelectedLoopBand: React.FC<{
  row: CpmHeatmapLoop;
  windowKind: string;
  onOpenLoop: (loopId: string) => void;
}> = ({ row, windowKind, onOpenLoop }) => {
  const navigate = useNavigate();
  // CHG-156: the same verdict is said once, with its age beside the score
  const same = isSameVerdict(row, row.lastVerdict);
  const older = same ? null : staleVerdictLine(row.lastVerdict);
  const score = [hasVerdict(row.diagnosis) ? evidenceScoreText(row.confidence) : '', same ? ageText(row.lastVerdict!.ageMs) : '']
    .filter(Boolean).join(' · ');
  return (
    <div className="cpm-selected-band" role="region" aria-label="Selected loop">
      <strong>{row.loopId}</strong>
      <TonePill tone={toneFor(row.diagnosis)}>{diagnosisLabel(row.diagnosis)}</TonePill>
      {score && <span className="cpm-copy">{score}</span>}
      {older && <span className="cpm-event-row__sub">{older}</span>}
      <span className="cpm-selected-band__links">
        <ObcButton variant="flat" onClick={() => navigate(investigationHref(row.loopId, { kind: windowKind }))}>
          Review {row.loopId} →
        </ObcButton>
        <ObcButton variant="flat" title={`Open ${row.loopId} in the Loop Explorer`} onClick={() => onOpenLoop(row.loopId)}>
          Open loop
        </ObcButton>
      </span>
    </div>
  );
};

export default SelectedLoopBand;
