/**
 * Task 20: the selected calculation, in the right column beside the list (it was a modal drawer with three tabs). CHG-166 (owner
 * review, the approved sample calculations-proposal.html): Value, Unit (in the loop's own unit, the signal engineering unit merged
 * into it), Gate with its result and a ? that tells the gate's own result from the window verdict (the band says the verdict),
 * Method; the stale-value warning; then the Workbench tab of the same run, named after the tab it opens. Open G3 proof stays the
 * one primary action. CHG-184 (owner review items 0, 14, Q6): no metric code beside the title, no versions in the warning, no
 * Record details and no Identity & raw link.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Inspector } from '../../../ui/Inspector';
import { Toggletip } from '../../../ui/Toggletip';
import { calcMethod } from '../calcMethods';
import { gateName } from '../gateStatus';
import ReasonedButton from '../ReasonedButton';
import { KvRow } from '../shared';
import { workbenchHref } from '../evidence/selection';
import { isPvUnit, loopUnit, valueText, type MetricView } from './calcView';
import GateResult from './GateResult';

export const CalcPanel: React.FC<{
  view: MetricView;
  loopId: string;
  /** The method run of the metric's gate on this window; absent on a window with no immutable run. */
  runId: string | undefined;
  /** The loop's PV engineering unit; null when none is set. */
  pvUnit: string | null;
  /** Calculation version stamped on the value, and the one deployed now: when they differ the value is stale (never shown). */
  stamped: string | null;
  deployed: string | null;
  /** Below 1280 px the panel is a drawer that shows only while open. */
  open: boolean;
  onClose: () => void;
}> = ({ view, loopId, runId, pvUnit, stamped, deployed, open, onClose }) => {
  const navigate = useNavigate();
  const { metric, value, na, status } = view;
  const method = calcMethod(metric.id);
  const gate = metric.gate;
  const go = (sub?: 'rules') => { if (runId) navigate(workbenchHref(loopId, runId, gate, { sub })); };
  const stale = !!stamped && !!deployed && stamped !== deployed;
  const noRun = `No run is stored for ${gate} on this window.`;
  const hasPv = !!pvUnit?.trim();
  return (
    <Inspector title={metric.name} open={open} onClose={onClose}
      primaryAction={
        <ReasonedButton variant="raised" disabled={!runId} reason={noRun} onClick={() => go()}>
          Open {gate} proof {'→'}
        </ReasonedButton>
      }>
      <KvRow label="Value">
        {na ? (
          <>
            <span className="cpm-metric-na">{na.short}</span>
            {na.reason && <div className="cpm-event-row__sub">{na.reason}</div>}
          </>
        ) : value != null ? <span className="cpm-mono">{valueText(metric, value, { withUnit: false })}</span> : null}
      </KvRow>
      <KvRow label="Unit">
        {loopUnit(metric.unit, pvUnit)}
        {isPvUnit(metric.unit) && (
          <div className="cpm-event-row__sub">{hasPv ? `the loop’s PV unit (${metric.unit})` : 'no PV unit is set on this loop'}</div>
        )}
      </KvRow>
      <div className="cpm-kv">
        <span className="cpm-kv__label cpm-title-row">
          Gate
          <Toggletip variant="how-to" label="Gate result and window verdict">
            <p>The gate’s own result on this window. The window’s verdict is in the band.</p>
          </Toggletip>
        </span>
        <span className="cpm-kv__value">
          {gate} {'·'} {gateName(gate)}{' '}
          <GateResult gate={gate} status={status} />
        </span>
      </div>
      <KvRow label="Method">
        <span className="cpm-mono">{method.formula}</span>
        <div className="cpm-copy">{method.text}</div>
      </KvRow>
      {stale && (
        <p className="cpm-field__error">
          This value was written by an earlier calculation. Recompute the window before citing it.
        </p>
      )}
      <div className="cpm-master-detail__links">
        <ObcButton className="ui-link" variant="flat" disabled={!runId} onClick={() => go('rules')}>Rules & parameters {'↗'}</ObcButton>
      </div>
    </Inspector>
  );
};

export default CalcPanel;
