'use client';

/**
 * Historical: the lines under the chart that say why a lane is empty or a feed failed. Failures and data states stay on
 * screen; the "historian series at …" line is gone (CHG-139). A lane with no data is empty, never zero.
 */
import React from 'react';
import { QueryError } from '../shared';
import { fmtWhen } from '../blocks/whenText';

export interface ChartCaptionsProps {
  series: string | undefined;
  signals: string[];
  hasAnyLane: boolean;
  hasPlottableSignal: boolean;
  overlay: { label: string; resolution: string };
  kpi: { isError: boolean; isLoading: boolean; error: unknown; refetch: () => void; empty: boolean; truncatedFrom: string | null; cap: number };
  mode: { isError: boolean; empty: boolean };
  history: { isError: boolean; error: unknown; refetch: () => void };
}

export const ChartCaptions: React.FC<ChartCaptionsProps> = ({ series, signals, hasAnyLane, hasPlottableSignal, overlay, kpi, mode, history }) => (
  <div className="cpm-hist-captions">
    {!hasPlottableSignal && hasAnyLane && (
      <p className="cpm-hist-note">
        No values stored at {series} for{' '}
        {signals.map(x => x.toUpperCase()).join(', ')} in this range — the signal lane
        is empty, but the other lanes below it are not.
      </p>
    )}
    {kpi.isError && hasAnyLane && (
      <QueryError title="KPI overlay unavailable" error={kpi.error} retry={kpi.refetch} />
    )}
    {kpi.empty && !kpi.isLoading && !kpi.isError && hasAnyLane && (
      <p className="cpm-hist-note">
        No {overlay.label.toLowerCase()} rows at {overlay.resolution} in this range —
        the overlay lane is empty, not zero.
      </p>
    )}
    {kpi.truncatedFrom && (
      <p className="cpm-hist-note">
        Overlay truncated: this range holds more than {kpi.cap} {overlay.resolution}{' '}
        windows, so the overlay covers only {fmtWhen(kpi.truncatedFrom)} onward — the
        earlier part is cut, not uncomputed.
      </p>
    )}
    {mode.isError && <p className="cpm-hist-note">Mode lane unavailable — the historian read failed.</p>}
    {mode.empty && !mode.isError && hasAnyLane && (
      <p className="cpm-hist-note">No controller-mode samples stored in this range, so the mode lane is empty.</p>
    )}
    {history.isError && (
      <QueryError title="Diagnosis windows unavailable" error={history.error} retry={history.refetch} />
    )}
  </div>
);

export default ChartCaptions;
