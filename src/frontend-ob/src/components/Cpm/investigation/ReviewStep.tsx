/**
 * CHG-160 (owner review): the Review step: the next checks, led by the result's own next check, with Related events in their
 * head. The notes need no verdict, so the page shows them without the tabs too.
 * CHG-189 (owner review item 12): the place to record the review is the shared "Loop notes (n)" button and dialog (as on Evidence
 * Replay), in the Next checks head beside Related events; the inline form and list are gone, so the step is one column.
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
  /** Under the dialog title: the loop's tag · name. */
  subtitle?: string;
}> = ({ loopId, matrix, windowKind, openFrame, subtitle }) => (
  <LoopNotes loopId={loopId} openFrame={openFrame} subtitle={subtitle}
    window={matrix ? { methodRunId: matrix.methodRunIds?.G15 ?? null, label: windowLabel({ windowKind, windowEnd: matrix.windowEnd }) } : null} />
);

export const ReviewStep: React.FC<{
  loopId: string;
  matrix: CpmGateMatrix;
  windowKind: string;
  openFrame: CpmEventFrame | null;
  /** The episode open at this window, for Related events. */
  episodeId: number | undefined;
  /** Under the notes dialog title: the loop's tag · name. */
  notesSubtitle?: string;
  onSignals: () => void;
  onGate: (gate: string) => void;
  onDialog: (dialog: InvestigationDialog) => void;
}> = ({ loopId, matrix, windowKind, openFrame, episodeId, notesSubtitle, onSignals, onGate, onDialog }) => {
  const navigate = useNavigate();
  return (
    <div className="cpm-inv-review-step">
      <NextChecks matrix={matrix} loopId={loopId} windowKind={windowKind} lead={heroNextCheck(matrix)}
        right={<>
          <ReviewNotes loopId={loopId} matrix={matrix} windowKind={windowKind} openFrame={openFrame} subtitle={notesSubtitle} />
          <ObcButton className="ui-link" variant="flat" onClick={() => navigate(eventsHref({ loop: loopId, event: episodeId, filter: 'all' }))}>Related events ↗</ObcButton>
        </>}
        onSignals={onSignals} onGate={onGate} onDialog={onDialog} />
    </div>
  );
};

export default ReviewStep;
