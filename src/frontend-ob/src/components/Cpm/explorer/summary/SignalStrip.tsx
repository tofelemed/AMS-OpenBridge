'use client';

/**
 * PV, SP, OP and Mode as one joined row of readings, with the signal quality beside them. The row is the one place the
 * redesign changes a size; it reads live values first, then the newest trend bucket, then the last stored value,
 * which is the only plane with no time bound. A value is live or old, never both (CHG-078). CHG-158 (owner review):
 * each reading says where it came from under it (live, last received …, from historian, last stored …), and the
 * unit sits beside the number. With no publisher and no stored value the row is one honest empty state, not four
 * dashes that read like measured zeros.
 *
 * `SignalStrip` is the loop now, on Loop Explorer Summary. `SignalStripAt` is the same row at one moment, on Investigation:
 * a page about an evaluated window must not show today's values beside it, so it reads only the bucket it is given.
 */
import React from 'react';
import type { CpmLoop } from '../../../../api/cpmApi';
import type { CpmTrendPoint } from '../../../../api/cpm/kpis';
import { modeLabel } from '../../../../utils/modeVocabulary';
import { FacetPill } from '../../FacetPill';
import { EmptyState } from '../../shared';
import { registryHref } from '../../cpaHref';
import { bucketValue, liveSource, useSignalValues } from './useSignalValues';

export { liveSource };

const Signal: React.FC<{ caption: string; value: string; unit?: string; sub?: string }> = ({ caption, value, unit, sub }) => (
  <div className="cpm-signal">
    <span className="cpm-signal__caption">{caption}</span>
    <span className="cpm-signal__reading">
      <span className="cpm-signal__value">{value}</span>
      {unit ? <span className="cpm-signal__unit">{unit}</span> : null}
    </span>
    {sub ? <span className="cpm-signal__sub">{sub}</span> : null}
  </div>
);

export const SignalStrip: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const v = useSignalValues(loop);

  if (v.noData) {
    return (
      <EmptyState
        level={2}
        title="No operating data"
        copy={`Nothing is publishing live values for this loop, and no samples were stored in ${v.rolling ? 'the last 8 hours' : 'this period'}. Check its signal mapping in the Loop Registry, or pick another period. (Historian series: ${v.series})`}
        next={[{ label: 'Signal mapping in the Loop Registry', to: registryHref(loop.loopId) }]}
      />
    );
  }

  return (
    <div className="cpm-signal-strip" role="group" aria-label="Operating signals">
      <div className="cpm-signal-group">
        {v.signals.map(s => (
          <Signal key={s.role} caption={s.role} value={s.value ?? '—'} unit={s.value != null ? s.unit : ''} sub={s.note} />
        ))}
        <Signal caption="MODE" value={v.mode.label} sub={v.modeNote} />
      </div>
      <p className="cpm-signal-strip__quality">
        <FacetPill facet="signal" tone={v.quality.tone}>{v.quality.text}</FacetPill>
      </p>
    </div>
  );
};

/** `at` names the bucket's own time when it is not the window's last one (a stalled feed); otherwise the strip reads "at window end". */
export const SignalStripAt: React.FC<{ point: CpmTrendPoint; at?: string }> = ({ point, at }) => {
  const mode = modeLabel(point.mode);
  return (
    <div className="cpm-signal-strip" role="group" aria-label="Signals at the window end">
      <div className="cpm-signal-group">
        {(['pv', 'sp', 'op'] as const).map(m => {
          const value = bucketValue(point, m);
          return <Signal key={m} caption={m.toUpperCase()} value={value?.toFixed(2) ?? '—'} unit={m === 'op' && value != null ? '%' : undefined} />;
        })}
        <Signal caption="MODE" value={mode.label} sub={mode.tone === 'warn' || mode.tone === 'bad' ? mode.note : undefined} />
      </div>
      <p className="cpm-signal-strip__quality"><span className="cpm-signal-strip__age">{at ? `last values at ${at}` : 'at window end'}</span></p>
    </div>
  );
};

export default SignalStrip;
