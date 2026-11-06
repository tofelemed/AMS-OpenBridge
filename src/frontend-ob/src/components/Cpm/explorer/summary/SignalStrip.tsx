'use client';

/**
 * PV, SP, OP and Mode as small cards in one row, with the signal quality beside them. The row is the one place the
 * redesign changes a size; it reads live values first, then the newest trend bucket, then the last stored value,
 * which is the only plane with no time bound. A value is live or old, never both (CHG-078), and when every stored
 * value has the same age the age is said once, beside the quality. With no publisher and no stored value the row
 * is one honest empty state, not four dashes that read like measured zeros.
 *
 * Used on Loop Explorer Summary and again on Investigation, so it takes the loop and nothing else.
 */
import React from 'react';
import type { CpmLoop } from '../../../../api/cpmApi';
import { FacetPill } from '../../FacetPill';
import { EmptyState } from '../../shared';
import { registryHref } from '../../cpaHref';
import { liveSource, useSignalValues } from './useSignalValues';

export { liveSource };

const Signal: React.FC<{ caption: string; value: string; sub?: string }> = ({ caption, value, sub }) => (
  <div className="cpm-signal">
    <span className="cpm-signal__caption">{caption}</span>
    <span className="cpm-signal__value">{value}</span>
    {sub ? <span className="cpm-signal__sub">{sub}</span> : null}
  </div>
);

export const SignalStrip: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const v = useSignalValues(loop);

  if (v.noData) {
    return (
      <EmptyState
        title="No operating data"
        copy={`Nothing is publishing live values for this loop, and no samples were stored in ${v.rolling ? 'the last 8 hours' : 'this period'}. Check its signal mapping in the Loop Registry, or pick another period. (Historian series: ${v.series})`}
        next={[{ label: 'Signal mapping in the Loop Registry', to: registryHref(loop.loopId) }]}
      />
    );
  }

  return (
    <div className="cpm-signal-strip" role="group" aria-label="Operating signals">
      {v.signals.map(s => (
        <Signal key={s.role} caption={s.role} value={s.value ?? '—'} sub={[s.unit, s.note].filter(Boolean).join(' · ')} />
      ))}
      <Signal caption="MODE" value={v.mode.label} sub={v.modeNote} />
      <p className="cpm-signal-strip__quality">
        <FacetPill facet="signal" tone={v.quality.tone}>{v.quality.text}</FacetPill>
        {v.oneAge && <span className="cpm-signal-strip__age">last stored {v.oneAge}</span>}
      </p>
    </div>
  );
};

export default SignalStrip;
