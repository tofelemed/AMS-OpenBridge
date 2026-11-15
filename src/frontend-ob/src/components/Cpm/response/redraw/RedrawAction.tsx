/**
 * CHG-198 (owner, approved 2026-11-15): "Redraw from historian" in the charts note of an event whose stored charts are gone, a
 * secondary button (CHG-193 button standard) that opens the redraw dialog. Once the first sample the redraw needs is older than
 * the historian keeps loop samples, the button is disabled and says why, on screen and as its description (ReasonedButton).
 */
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ResponseEventDetail, ResponseQuantity } from '../../../../api/cpm/response';
import { ReasonedButton } from '../../ReasonedButton';
import { fmtInstantBare } from '../../context/LoopContextBar';
import { pathLabel } from '../responseLabels';
import { pastHistorianKeep, redrawWindow } from './historianRead';
import { RedrawDialog } from './RedrawDialog';
import { PAST_KEEP, REDRAW_TITLE } from './redrawWords';

export const RedrawAction: React.FC<{
  result: ResponseEventDetail['result'];
  metrics: ResponseQuantity[] | undefined;
  t0Ms: number;
  pvUnit?: string | null;
  timeZone: string;
  /** The event as the event selector names it; an event not in the list is named by its time and path. */
  eventName?: string;
}> = ({ result, metrics, t0Ms, pvUnit, timeZone, eventName }) => {
  const [open, setOpen] = useState(false);
  const w = useMemo(() => redrawWindow(result, t0Ms), [result, t0Ms]);
  if (!w) return null;
  const past = pastHistorianKeep(w, Date.now());
  return (
    <>
      <ReasonedButton variant="normal" disabled={past} reason={past ? PAST_KEEP : null} onClick={() => setOpen(true)}>{REDRAW_TITLE}</ReasonedButton>
      {open && createPortal(
        <RedrawDialog loopId={result.loop_id} eventId={result.event_id} eventName={eventName ?? `${fmtInstantBare(w.t0Ms, timeZone)} · ${pathLabel(result.path_id)}`}
          result={result} metrics={metrics} window={w} pvUnit={pvUnit} timeZone={timeZone} onClose={() => setOpen(false)} />,
        document.body,
      )}
    </>
  );
};

export default RedrawAction;
