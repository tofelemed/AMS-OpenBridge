/**
 * CHG-198 (owner, approved 2026-11-15): "Redraw from historian" in the charts note of an event whose stored charts are gone, a
 * secondary button (CHG-193 button standard) that opens the redraw dialog. Once the first sample the redraw needs is older than
 * the historian keeps loop samples, the button is disabled and says why, on screen and as its description (ReasonedButton).
 * CHG-200 (final test #1): the button and the dialog are two parts. The note that holds the button goes the moment the redraw
 * lands in the page, so the page holds the dialog's open state and renders the dialog outside the note: Done stays on screen
 * until the dialog closes itself.
 */
import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { ResponseEventDetail, ResponseQuantity } from '../../../../api/cpm/response';
import { ReasonedButton } from '../../ReasonedButton';
import { fmtInstantBare } from '../../context/LoopContextBar';
import { pathLabel } from '../responseLabels';
import { pastHistorianKeep, redrawWindow } from './historianRead';
import { RedrawDialog } from './RedrawDialog';
import { PAST_KEEP, REDRAW_TITLE } from './redrawWords';

interface RedrawEvent { result: ResponseEventDetail['result']; t0Ms: number }

/** The button in the charts note; disabled with its reason past the historian's keep. */
export const RedrawButton: React.FC<RedrawEvent & { onOpen: () => void }> = ({ result, t0Ms, onOpen }) => {
  const w = useMemo(() => redrawWindow(result, t0Ms), [result, t0Ms]);
  if (!w) return null;
  const past = pastHistorianKeep(w, Date.now());
  return <ReasonedButton variant="normal" disabled={past} reason={past ? PAST_KEEP : null} onClick={onOpen}>{REDRAW_TITLE}</ReasonedButton>;
};

/** The redraw dialog, in a portal; it stays while open, whatever the page shows behind it. */
export const RedrawDialogHost: React.FC<RedrawEvent & {
  metrics: ResponseQuantity[] | undefined;
  pvUnit?: string | null;
  timeZone: string;
  /** The event as the event selector names it; an event not in the list is named by its time and path. */
  eventName?: string;
  onClose: () => void;
}> = ({ result, t0Ms, metrics, pvUnit, timeZone, eventName, onClose }) => {
  const w = useMemo(() => redrawWindow(result, t0Ms), [result, t0Ms]);
  if (!w) return null;
  return createPortal(
    <RedrawDialog loopId={result.loop_id} eventId={result.event_id} eventName={eventName ?? `${fmtInstantBare(w.t0Ms, timeZone)} · ${pathLabel(result.path_id)}`}
      result={result} metrics={metrics} window={w} pvUnit={pvUnit} timeZone={timeZone} onClose={onClose} />,
    document.body,
  );
};
