/**
 * Task 19: the selected window, in the right column beside the list (it was a separate view). Counts first, then
 * what the window is and when it was stored, then the one next step and the related looks (Historical and Trend open this window's range).
 * CHG-164 (owner review): the samples read as one row; the dialogs are short buttons without ↗, apart from the two pages.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmKpiRow, CpmLoop, CpmWindowSpec } from '../../../api/cpmApi';
import { Inspector } from '../../../ui/Inspector';
import { Toggletip } from '../../../ui/Toggletip';
import { KvRow, TonePill } from '../shared';
import { fmtInstant } from '../context/LoopContextBar';
import { windowSize } from '../windowLabel';
import { historicalHref, trendHref } from '../cpaHref';
import { loopPens } from '../../Designer/trend/loopPens';
import { SampleDensityDialog } from './SampleDensityDialog';
import { EngineTimingDialog, FeatureFlagsDialog, RecordDetailsDialog } from './WindowDialogs';
import { isDeclined } from './WindowResults';
import { countCheck, fmtCount, nominalOf } from './windowMath';
import { inspectTarget, windowRef } from './windowNav';

type Dialogs = 'flags' | 'record' | 'engine' | 'density' | null;

export const SelectedWindow: React.FC<{
  row: CpmKpiRow;
  loopId: string;
  loop: CpmLoop | undefined;
  kind: string;
  spec: CpmWindowSpec | undefined;
  isLong: boolean;
  timeZone: string;
  /** Below 1280 px the panel is a drawer that shows only while open. */
  open: boolean;
  onClose: () => void;
}> = ({ row, loopId, loop, kind, spec, isLong, timeZone, open, onClose }) => {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const tier = isLong ? 'long' : 'short';
  const declined = isDeclined(row, tier);
  const received = typeof row.sample_count === 'number' ? row.sample_count : null;
  const nominal = nominalOf(row);
  const check = received != null && nominal ? countCheck(received, nominal.value) : null;
  const close = () => setDialog(null);
  // Historical opens on this window's range; /trend reads the loop's PV, SP, OP and VP pens itself, pinned to the window.
  const trend = loop && loopPens(loop).length > 0 && row.window_start && row.window_end
    ? trendHref(loopId, { from: new Date(row.window_start).toISOString(), to: new Date(row.window_end).toISOString() }) : null;
  const link = (label: string, to: Dialogs) => (
    <ObcButton variant="flat" onClick={() => setDialog(to)}>{label}</ObcButton>
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
        <KvRow label="Samples">
          <span className="cpm-mono">{`${fmtCount(received)} of ${nominal ? fmtCount(nominal.value) : 'not reported'}${check ? ` · ${(check.ratio * 100).toFixed(0)}%` : ''}`}</span>
          {nominal?.derived && <span className="cpm-event-row__sub"> derived</span>}
          {check && <TonePill tone={check.tone}>{check.label}</TonePill>}
        </KvRow>
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
          {link('Record details', 'record')}
          {!isLong && link('Feature flags', 'flags')}
          {link('Sample density', 'density')}
          {link('Engine & timing', 'engine')}
        </div>
        <div className="cpm-master-detail__links">
          <ObcButton variant="flat" onClick={() => navigate(historicalHref(loopId, { from: row.window_start, to: row.window_end, window: row.window_end }))}>Historical {'↗'}</ObcButton>
          {trend && <ObcButton variant="flat" onClick={() => navigate(trend)}>Trend {'↗'}</ObcButton>}
        </div>
      </Inspector>
      <FeatureFlagsDialog open={dialog === 'flags'} onClose={close} row={row} declined={declined} />
      <RecordDetailsDialog open={dialog === 'record'} onClose={close} row={row} tier={tier} timeZone={timeZone} />
      <SampleDensityDialog open={dialog === 'density'} onClose={close} row={row} loopId={loopId} />
      <EngineTimingDialog open={dialog === 'engine'} onClose={close} spec={spec} kind={kind} />
    </>
  );
};

export default SelectedWindow;
