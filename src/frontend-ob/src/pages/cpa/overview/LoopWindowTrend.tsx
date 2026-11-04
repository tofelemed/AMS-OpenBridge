/**
 * The small aligned trend in the inspector. Its interval is the evaluated window behind the verdict
 * shown, not the header range and not a rolling window: the old panel drew 8 rolling hours under a
 * 12 h verdict, with no word about it (RD3, A3, R10).
 */
import React, { useMemo } from 'react';
import type { CpmLoop } from '../../../api/cpmApi';
import { useCpmTrend } from '../../../hooks/useCpm';
import { TrendPanel, trendPointsToPane, type TrendState } from '../../../ui/trend';
import { loopSeries } from '../../../utils/loopSeries';
import { windowBounds, windowPhrase } from './overviewFormat';

const PANE_HEIGHT = 120;
const WIDTH_POINTS = 240;

const rangeOf = (min?: number | null, max?: number | null) => (min != null && max != null ? { min, max } : null);

export const LoopWindowTrend: React.FC<{
  loopId: string;
  windowKind: string;
  windowEnd: string | null;
  loop: CpmLoop | undefined;
  zoneId: string;
}> = ({ loopId, windowKind, windowEnd, loop, zoneId }) => {
  const bounds = useMemo(() => windowBounds(windowEnd, windowKind), [windowEnd, windowKind]);
  const from = useMemo(() => new Date(bounds?.from ?? 0), [bounds]);
  const to = useMemo(() => new Date(bounds?.to ?? 0), [bounds]);
  const trend = useCpmTrend(loopSeries(loopId), from, to, WIDTH_POINTS, 'pv,sp,op', !!bounds);

  const engineering = loop?.engineering;
  const panes = useMemo(() => [trendPointsToPane(trend.data?.points ?? [], {
    pvUnit: engineering?.pvUnit,
    pvRange: rangeOf(engineering?.pvMin, engineering?.pvMax),
    outputRange: rangeOf(engineering?.opMin, engineering?.opMax),
    height: PANE_HEIGHT,
  })], [trend.data, engineering]);

  const state: TrendState | undefined = !bounds
    ? { kind: 'empty', message: 'No evaluated window for this loop yet.' }
    : trend.isLoading ? { kind: 'loading' }
      : trend.isError ? { kind: 'error', message: trend.error instanceof Error ? trend.error.message : undefined }
        : undefined;

  return (
    <TrendPanel
      compact
      headingLevel={3}
      heading="Evaluated window"
      zone={zoneId}
      panes={panes}
      plotWindow={bounds ?? undefined}
      source="Historian"
      aggregation="average per point, band is min to max"
      state={state}
      context={bounds ? windowPhrase(windowKind, windowEnd, zoneId) : undefined}
    />
  );
};
