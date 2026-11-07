/**
 * Task 19: the selected window, in the right column beside the list (it was a separate view). Counts first, then
 * what the window is and when it was stored, then the one next step and the three related looks.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmKpiRow, CpmWindowSpec } from '../../../api/cpmApi';
import { Inspector } from '../../../ui/Inspector';
import { Toggletip } from '../../../ui/Toggletip';
import { KvRow, TonePill } from '../shared';
import { fmtInstant } from '../context/LoopContextBar';
import { windowSize } from '../windowLabel';
import { EngineTimingDialog, FeatureFlagsDialog, RecordDetailsDialog } from './WindowDialogs';
import { isDeclined } from './WindowResults';
import { countCheck, fmtCount, nominalOf } from './windowMath';
import { inspectTarget, windowRef } from './windowNav';

type Dialogs = 'flags' | 'record' | 'engine' | null;

export const SelectedWindow: React.FC<{
  row: CpmKpiRow;
  loopId: string;
  kind: string;
  spec: CpmWindowSpec | undefined;
  isLong: boolean;
  timeZone: string;
  /** Below 1280 px the panel is a drawer that shows only while open. */
  open: boolean;
  onClose: () => void;
}> = ({ row, loopId, kind, spec, isLong, timeZone, open, onClose }) => {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const tier = isLong ? 'long' : 'short';
  const declined = isDeclined(row, tier);
  const received = typeof row.sample_count === 'number' ? row.sample_count : null;
  const nominal = nominalOf(row);
  const check = received != null && nominal ? countCheck(received, nominal.value) : null;
  const close = () => setDialog(null);
  const link = (label: string, to: Dialogs) => (
    <ObcButton variant="flat" onClick={() => setDialog(to)}>{label} {'↗'}</ObcButton>
  );
  return (
    <>
      <Inspector title={`${windowSize({ windowKind: kind })} window`} open={open} onClose={onClose}
        primaryAction={
          <ObcButton variant="raised" onClick={() => navigate(inspectTarget(windowRef(row), loopId, kind))}>
            Inspect this window {'→'}
          </ObcButton>
        }>
        <KvRow label="Window">{fmtInstant(row.window_start, timeZone)} {'→'} {fmtInstant(row.window_end, timeZone)}</KvRow>
        <KvRow label="Received"><span className="cpm-mono">{fmtCount(received)}</span></KvRow>
        <KvRow label="Nominal">
          <span className="cpm-mono">{nominal ? fmtCount(nominal.value) : 'Not reported'}</span>
          {nominal?.derived && <span className="cpm-event-row__sub"> derived</span>}
        </KvRow>
        {check && <KvRow label="Ratio"><span className="cpm-mono">{`${(check.ratio * 100).toFixed(0)}%`}</span></KvRow>}
        {check && <KvRow label="Difference"><TonePill tone={check.tone}>{check.label}</TonePill></KvRow>}
        {declined && (
          <KvRow label="Message">
            <TonePill tone="bad">Declined</TonePill>
            <Toggletip variant="how-to" label="Declined window">
              <p>The engine declined to evaluate this window
                {isLong
                  ? ' fully (its aligned short slice failed G0). The values are the exclusion’s decision inputs, not performance measurements.'
                  : ' (G0 failed or fewer than 10 samples). Metric fields are “not computed”, not zero.'}</p>
            </Toggletip>
          </KvRow>
        )}
        <KvRow label="Tag"><TonePill tone="muted">{isLong ? 'Long diagnostics' : 'Short features'}</TonePill></KvRow>
        <KvRow label="Stored">{fmtInstant(row.created_at, timeZone)}</KvRow>
        <div className="cpm-master-detail__links">
          {link('View record details', 'record')}
          {!isLong && link('Feature flags', 'flags')}
          {link('Engine & timing', 'engine')}
        </div>
      </Inspector>
      <FeatureFlagsDialog open={dialog === 'flags'} onClose={close} row={row} declined={declined} />
      <RecordDetailsDialog open={dialog === 'record'} onClose={close} row={row} loopId={loopId} tier={tier} timeZone={timeZone} />
      <EngineTimingDialog open={dialog === 'engine'} onClose={close} spec={spec} kind={kind} />
    </>
  );
};

export default SelectedWindow;
