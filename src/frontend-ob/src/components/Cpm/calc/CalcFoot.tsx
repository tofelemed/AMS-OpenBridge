/**
 * CHG-166 (owner review): the list panel's foot strip, as on Evidence Replay. The window, its samples and the run (original or
 * re-run) are said once here (the window was in the band), then Run details: a dialog, so no ↗; it holds the gate tally, the
 * runs, the bundle, the versions (they were in the band as well), the engine build and when the run was computed.
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { RunDetailsDialog } from '../replay/RunDetailsDialog';
import { windowSpan } from '../windowLabel';

export const CalcFoot: React.FC<{ matrix: CpmGateMatrix; timeZone: string }> = ({ matrix, timeZone }) => {
  const [open, setOpen] = useState(false);
  const samples = matrix.sampleCount != null ? `${matrix.sampleCount.toLocaleString('en-GB')} samples` : 'samples not reported';
  const run = matrix.metadata.replayId ? `Re-run ${matrix.metadata.replayId}` : 'Original run';
  return (
    <div className="cpm-calc-foot">
      <span className="cpm-copy">{`${windowSpan(matrix, timeZone)} · ${samples} · ${run}`}</span>
      <ObcButton variant="flat" onClick={() => setOpen(true)}>Run details</ObcButton>
      {open && createPortal(<RunDetailsDialog open onClose={() => setOpen(false)} row={matrix} timeZone={timeZone} />, document.body)}
    </div>
  );
};

export default CalcFoot;
