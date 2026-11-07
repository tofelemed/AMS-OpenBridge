/**
 * Task 20: the selected calculation, in the right column beside the list (it was a modal drawer with three tabs). Name,
 * id, value, unit, how it is computed, and the gate that judges it, then the one next step and the related looks. The
 * gate's own result and the verdict of the whole window are told apart, because a metric sits under a gate, not under
 * the verdict.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { GateBadge } from '../../../ui/GateBadge';
import { Inspector } from '../../../ui/Inspector';
import { Toggletip } from '../../../ui/Toggletip';
import { calcMethod } from '../calcMethods';
import { gateName } from '../gateStatus';
import ReasonedButton from '../ReasonedButton';
import { KvRow } from '../shared';
import { workbenchHref } from '../evidence/selection';
import { valueText, type MetricView } from './calcView';

export const CalcPanel: React.FC<{
  view: MetricView;
  loopId: string;
  /** The method run of the metric's gate on this window; absent on a window with no immutable run. */
  runId: string | undefined;
  /** The loop's PV engineering unit; null when none is set. */
  pvUnit: string | null;
  /** The window's verdict in words; null when the window has none. */
  verdict: string | null;
  /** Calculation version stamped on the value, and the one deployed now. */
  stamped: string | null;
  deployed: string | null;
  /** Below 1280 px the panel is a drawer that shows only while open. */
  open: boolean;
  onClose: () => void;
}> = ({ view, loopId, runId, pvUnit, verdict, stamped, deployed, open, onClose }) => {
  const navigate = useNavigate();
  const { metric, value, na, status } = view;
  const method = calcMethod(metric.id);
  const gate = metric.gate;
  const go = (sub?: 'identity' | 'rules') => { if (runId) navigate(workbenchHref(loopId, runId, gate, { sub })); };
  const stale = !!stamped && !!deployed && stamped !== deployed;
  const noRun = `No run is stored for ${gate} on this window.`;
  return (
    <Inspector title={metric.name} open={open} onClose={onClose}
      primaryAction={
        <ReasonedButton variant="raised" disabled={!runId} reason={noRun} onClick={() => go()}>
          Open {gate} proof {'→'}
        </ReasonedButton>
      }>
      <KvRow label="Id"><span className="cpm-mono">{metric.id}</span></KvRow>
      <KvRow label="Value">
        {na ? (
          <>
            <span className="cpm-metric-na">{na.short}</span>
            {na.reason && <div className="cpm-event-row__sub">{na.reason}</div>}
          </>
        ) : value != null ? <span className="cpm-mono">{valueText(metric, value, false)}</span> : null}
      </KvRow>
      <KvRow label="Unit">{metric.unit}</KvRow>
      <KvRow label="Method">
        <span className="cpm-mono">{method.formula}</span>
        <div className="cpm-copy">{method.text}</div>
      </KvRow>
      <KvRow label="Related gate">
        {gate} {'·'} {gateName(gate)}{' '}
        <GateBadge status={status.code} gate={gate} />
      </KvRow>
      {/PV/.test(metric.unit) && <KvRow label="Signal engineering unit">{pvUnit ?? 'Not set on this loop'}</KvRow>}
      {verdict && (
        <p className="cpm-copy">{gate} is the gate’s own result. The window’s verdict is {verdict}.</p>
      )}
      {stale && (
        <p className="cpm-field__error">
          This value was written by v{stamped}; the calculation deployed now is v{deployed}. Recompute the window before citing it.
        </p>
      )}
      <div className="cpm-master-detail__links">
        <ObcButton variant="flat" disabled={!runId} onClick={() => go('identity')}>Retained value & identity {'↗'}</ObcButton>
      </div>
      <div className="cpm-master-detail__section cpm-title-row">
        <span>Original configuration</span>
        <Toggletip variant="how-to" label="Original configuration"><p>Rules and thresholds belong to the selected run.</p></Toggletip>
      </div>
      <div className="cpm-master-detail__links">
        <ObcButton variant="flat" disabled={!runId} onClick={() => go('rules')}>Inspect parameters {'↗'}</ObcButton>
      </div>
    </Inspector>
  );
};

export default CalcPanel;
