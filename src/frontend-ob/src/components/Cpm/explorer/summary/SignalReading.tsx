/**
 * One PV, SP, OP or Mode reading: its caption, the value with its unit beside it, and an optional line under it. Split out of
 * SignalStrip (CHG-189) so Evidence Replay's cursor readout reads exactly like the Loop Explorer readings.
 * `warn` paints the box amber; `state` is the word beside the caption (G05: never colour alone).
 */
import React from 'react';

export const SignalReading: React.FC<{ caption: string; value: string; unit?: string; sub?: string; warn?: boolean; state?: string | null }> = ({
  caption, value, unit, sub, warn = false, state,
}) => (
  <div className={`cpm-signal${warn ? ' cpm-signal--warning' : ''}`}>
    <span className="cpm-signal__head">
      <span className="cpm-signal__caption">{caption}</span>
      {state ? <span className="cpm-signal__state"><span aria-hidden="true">!</span>{state}</span> : null}
    </span>
    <span className="cpm-signal__reading">
      <span className="cpm-signal__value">{value}</span>
      {unit ? <span className="cpm-signal__unit">{unit}</span> : null}
    </span>
    {sub ? <span className="cpm-signal__sub">{sub}</span> : null}
  </div>
);

export default SignalReading;
