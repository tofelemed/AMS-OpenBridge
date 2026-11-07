/**
 * CHG-141: the page's dialogs, one open at a time, so All gates can hand over to one gate's proof. Each sits on the page
 * body, clear of the sticky band. Compare windows reads the previous window only while it is open.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { Dialog } from '../../../ui/Dialog';
import { CauseBreakdownRows } from '../CauseBreakdown';
import { calculationsHref, historicalHref } from '../cpaHref';
import type { EvidenceWindows } from '../evidence/useEvidenceWindows';
import { usePreviousEnd, useWindowAt } from '../evidence/useWindowAt';
import type { InputContext } from '../optionalInputs';
import { vpAbsent } from '../optionalInputs';
import { KvRow } from '../shared';
import { AllGatesDialog } from './AllGatesDialog';
import type { Comparison } from './comparisonNote';
import { GateProofDialog } from './GateProofDialog';
import { HypothesisPanel } from './HypothesisPanel';
import { KeyFacts } from './KeyFactsPanel';
import { WindowBrowser } from './WindowBrowser';

export type InvestigationDialog =
  | { kind: 'proof'; gate: string } | { kind: 'all' } | { kind: 'compare' } | { kind: 'hypotheses' } | { kind: 'numeric' } | { kind: 'mode' } | null;

const CompareWindows: React.FC<{
  loopId: string; matrix: CpmGateMatrix; windowKind: string; list: EvidenceWindows; onWindow: (end: string) => void; onClose: () => void;
}> = ({ loopId, matrix, windowKind, list, onWindow, onClose }) => {
  // The PREVIOUS window is the next older one in the same list, read at its own end; never the current window against itself.
  const prevEnd = usePreviousEnd(loopId, windowKind, matrix.windowEnd);
  const prevRow = useWindowAt(prevEnd.end ? loopId : undefined, windowKind, prevEnd.end);
  const comparison: Comparison = prevEnd.isError ? { state: 'unavailable' }
    : prevEnd.isLoading ? { state: 'loading' }
      : !prevEnd.end ? { state: 'none' }
        : prevRow.row ? { state: 'ready' }
          : prevRow.isLoading ? { state: 'loading' } : { state: 'missing', end: prevEnd.end };
  return (
    <Dialog open size="wide" title={`Compare recent ${windowKind} windows`} onClose={onClose}>
      <WindowBrowser windows={list.options} hasMore={list.hasMore} isLoadingMore={list.isLoadingMore} loadMore={list.loadMore}
        matrix={matrix} previous={prevRow.row} comparison={comparison} windowKind={windowKind} onWindow={end => { onWindow(end); onClose(); }} />
    </Dialog>
  );
};

export const InvestigationDialogs: React.FC<{
  dialog: InvestigationDialog;
  onDialog: (dialog: InvestigationDialog) => void;
  loopId: string;
  matrix: CpmGateMatrix;
  windowKind: string;
  /** The window's effective input flags. */
  flags: readonly string[];
  inputs?: InputContext;
  timeZone?: string;
  list: EvidenceWindows;
  onWindow: (end: string) => void;
}> = ({ dialog, onDialog, loopId, matrix, windowKind, flags, inputs, timeZone, list, onWindow }) => {
  const navigate = useNavigate();
  const close = () => onDialog(null);
  const verdict = matrix.verdictV2;
  switch (dialog?.kind) {
    case 'proof':
      return <GateProofDialog loopId={loopId} gate={dialog.gate} matrix={matrix} windowKind={windowKind} flags={flags} timeZone={timeZone} onClose={close} />;
    case 'all':
      return <AllGatesDialog loopId={loopId} matrix={matrix} flags={flags} onGate={gate => onDialog({ kind: 'proof', gate })} onClose={close} />;
    case 'compare':
      return createPortal(<CompareWindows loopId={loopId} matrix={matrix} windowKind={windowKind} list={list} onWindow={onWindow} onClose={close} />, document.body);
    case 'hypotheses':
      return createPortal(
        <Dialog open size="wide" title="Hypothesis comparison" onClose={close}>
          {/* SME #19 (CHG-055): the confirmed SYMPTOM apart from the possible CAUSE */}
          {verdict && !verdict.legacy
            ? <CauseBreakdownRows verdict={verdict} flags={matrix.observabilityFlags} inputs={inputs} cells={matrix.gates} />
            : <KvRow label="Possible cause">not served (pre-v2.5 result)</KvRow>}
          <HypothesisPanel verdict={verdict} metrics={matrix.metrics ?? {}} vpAbsentOnLoop={vpAbsent(inputs)} />
        </Dialog>,
        document.body,
      );
    case 'numeric':
      return createPortal(
        <Dialog open size="wide" title={`Numeric evidence · ${loopId}`} onClose={close}
          footer={<ObcButton variant="raised" onClick={() => navigate(calculationsHref(loopId, { kind: windowKind, window: matrix.windowEnd }))}>Calculation proof →</ObcButton>}>
          <KeyFacts matrix={matrix} metrics={matrix.metrics ?? {}} />
        </Dialog>,
        document.body,
      );
    case 'mode':
      return createPortal(
        <Dialog open title="Mode context" onClose={close}
          footer={<ObcButton variant="flat" onClick={() => navigate(historicalHref(loopId, { from: matrix.windowStart, to: matrix.windowEnd, window: matrix.windowEnd, kind: windowKind }))}>Historical ↗</ObcButton>}>
          <p className="cpm-copy">If manual operation was intended, the exclusion needs no change to the controller. If it was not, review the operator or logic change that took the loop out of automatic or cascade.</p>
        </Dialog>,
        document.body,
      );
    default:
      return null;
  }
};

export default InvestigationDialogs;
