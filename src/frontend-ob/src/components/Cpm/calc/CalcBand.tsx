/**
 * Task 20: what the Calculations band says after the loop control: the evaluated window, its verdict, the versions that
 * wrote it, and Run details. The gate tally and the run identity live in Run details, not in tiles on the page.
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { TonePill } from '../shared';
import { conditionOf } from '../explorer/summary/summaryText';
import { RunDetailsDialog } from '../replay/RunDetailsDialog';
import { windowSpan } from '../windowLabel';

export const CalcBand: React.FC<{
  matrix: CpmGateMatrix | undefined;
  timeZone: string;
  /** The newest verdict could not be read: say so instead of showing none. */
  verdictFailed: boolean;
}> = ({ matrix, timeZone, verdictFailed }) => {
  const [details, setDetails] = useState(false);
  const verdict = conditionOf(matrix?.diagnosis);
  return (
    <>
      {matrix && <span className="cpm-band__meta">{windowSpan(matrix, timeZone)}</span>}
      {verdictFailed
        ? <TonePill tone="warn">Verdict unavailable</TonePill>
        : matrix && <TonePill tone={verdict.tone}>{verdict.label}</TonePill>}
      {matrix && (
        <span className="cpm-band__meta">
          Calculation v{matrix.metadata.calculationVersion ?? '—'} {'·'} profile v{matrix.metadata.dynamicsProfileVersion ?? '—'}
        </span>
      )}
      <ObcButton variant="flat" disabled={!matrix} onClick={() => setDetails(true)}>Run details {'↗'}</ObcButton>
      {/* the band is sticky: the dialog goes to the body so it is not clipped or stacked under it */}
      {matrix && details && createPortal(<RunDetailsDialog open onClose={() => setDetails(false)} row={matrix} timeZone={timeZone} />, document.body)}
    </>
  );
};

export default CalcBand;
