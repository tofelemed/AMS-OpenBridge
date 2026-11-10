/**
 * CHG-160 (owner review): the Review step: the next checks, led by the result's own next check, with Related events in their
 * head, beside the place to record the review. The notes need no verdict, so the page shows them without the tabs too.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { eventsHref } from '../cpaHref';
import { windowLabel } from '../windowLabel';
import { heroNextCheck } from './heroFacts';
import type { InvestigationDialog } from './InvestigationDialogs';
import { LoopNotes } from './LoopNotes';
import { NextChecks } from './NextChecksPanel';

export const ReviewNotes: React.FC<{
  loopId: string;
  matrix: CpmGateMatrix | undefined;
  windowKind: string;
  openFrame: CpmEventFrame | null;
}> = ({ loopId, matrix, windowKind, openFrame }) => (
  <LoopNotes loopId={loopId} openFrame={openFrame} title="Record your review" saveLabel="Save review"
    window={matrix ? { methodRunId: matrix.methodRunIds?.G15 ?? null, label: windowLabel({ windowKind, windowEnd: matrix.windowEnd }) } : null} />
);

export const ReviewStep: React.FC<{
  loopId: string;
  matrix: CpmGateMatrix;
  windowKind: string;
  openFrame: CpmEventFrame | null;
  /** The episode open at this window, for Related events. */
  episodeId: number | undefined;
  onSignals: () => void;
  onGate: (gate: string) => void;
  onDialog: (dialog: InvestigationDialog) => void;
}> = ({ loopId, matrix, windowKind, openFrame, episodeId, onSignals, onGate, onDialog }) => {
  const navigate = useNavigate();
  return (
    <div className="cpm-inv-review-step">
      <NextChecks matrix={matrix} loopId={loopId} windowKind={windowKind} lead={heroNextCheck(matrix)}
        right={<ObcButton variant="flat" onClick={() => navigate(eventsHref({ loop: loopId, event: episodeId, filter: 'all' }))}>Related events ↗</ObcButton>}
        onSignals={onSignals} onGate={onGate} onDialog={onDialog} />
      <ReviewNotes loopId={loopId} matrix={matrix} windowKind={windowKind} openFrame={openFrame} />
    </div>
  );
};

export default ReviewStep;
