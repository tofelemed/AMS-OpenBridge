/**
 * SME review #9/#10 (CHG-047): the loop signal trend — PV/SP on a left axis in the PV unit, OP/VP
 * on a right axis in %, the band explained, and a scale switch as on DCS / PI trends:
 *  - "Fit to data"        autorange to what is plotted — the shape (an oscillation fills the height);
 *  - "Engineering range"  the registered PV range and OP range — where the loop sits in its span.
 * Fit is the default on these analysis trends; the range option is disabled, with its reason, when
 * the registry holds no usable PV range.
 *
 * The loop's unit and range come from the registry list every CPM page already loads
 * (`useCpmLoops`, one cached query). The chart keeps the rectangle zoom of every CPM trend.
 */
import React, { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { ObcToggleButtonGroup } from '@oicl/openbridge-webcomponents-react/components/toggle-button-group/toggle-button-group';
import { ObcToggleButtonOption } from '@oicl/openbridge-webcomponents-react/components/toggle-button-option/toggle-button-option';
import type { CpmTrendPoint } from '../../../api/cpm/kpis';
import { useCpmLoops } from '../../../hooks/useCpm';
import { useObcTheme } from '../../../hooks/useObcTheme';
import { boxZoomOption } from '../../charts/boxZoom';
import { useBoxZoom, useKeepSelecting } from '../../charts/useBoxZoom';
import ChartZoomBar from '../../charts/ChartZoomBar';
import { EmptyState, cpmChartColors } from '../shared';
import { BAND_NOTE, hasPvRange, hasSignalValues, signalTrendOption, type TrendScale } from './trendOption';

export const SignalTrend: React.FC<{
  loopId: string;
  points: CpmTrendPoint[];
  hasVp?: boolean;
  height?: number;
  /** A rolling / polling chart: the zoom bar says the viewport is held while zoomed. */
  live?: boolean;
  /** CHG-067: what this chart shows, e.g. "Evaluated window (diagnosis)" / "Now (live 8 h)". */
  caption?: string;
  /** CHG-067: the plotted range, the evaluated-window band, and a y-scale shared with another trend. */
  xRange?: { fromMs: number; toMs: number } | null;
  evaluated?: { startMs: number; endMs: number; label: string } | null;
  yBounds?: { pv: { min: number; max: number } | null; op: { min: number; max: number } | null } | null;
}> = ({ loopId, points, hasVp, height = 240, live = false, caption, xRange, evaluated, yBounds }) => {
  const loops = useCpmLoops();
  const loop = loops.data?.loops.find(l => l.loopId.toLowerCase() === loopId.toLowerCase());
  const range = loop?.engineering ?? null;
  const pvUnit = loop?.engineering?.pvUnit ?? null;
  const rangeUsable = hasPvRange(range);
  const [chosen, setChosen] = useState<TrendScale>('fit');
  const scale: TrendScale = rangeUsable ? chosen : 'fit';

  const box = useBoxZoom({ hasY: true });
  const obcTheme = useObcTheme(); // re-derive chart colours on a theme switch
  const option = useMemo(
    () => signalTrendOption({
      points, pens: cpmChartColors(), hasVp, pvUnit, scale, range, xRange, evaluated, yBounds,
      zoom: boxZoomOption({ xAxisIndex: 0, yAxisIndex: [0, 1] }, box.zoom),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- obcTheme is a recompute trigger: pen colours are read from CSS vars that change with the theme.
    [points, hasVp, pvUnit, scale, range, xRange, evaluated, yBounds, obcTheme, box.zoom],
  );
  useKeepSelecting(box, option);

  // A stalled feed answers with time buckets that hold no values: an empty frame explains nothing.
  if (!hasSignalValues(points)) {
    return (
      <EmptyState title={`${caption ? `${caption}: ` : ''}no signal values in this trend range`}
        copy="The historian returned the time range but no PV, SP or OP samples in it — the feed may have stopped. The live values above show when the last sample arrived." />
    );
  }

  return (
    <div className="cpm-signal-trend">
      <div className="cpm-signal-trend__bar">
        {caption && <span className="cpm-eyebrow cpm-signal-trend__caption">{caption}</span>}
        <ObcToggleButtonGroup value={scale} aria-label="Trend scale"
          onValue={(e: CustomEvent<{ value: string }>) => {
            const v = e.detail.value;
            if (v === 'fit' || (v === 'range' && rangeUsable)) setChosen(v);
          }}>
          <ObcToggleButtonOption value="fit" title="Scale each axis to the plotted data: shows the shape of the signals">
            Fit to data
          </ObcToggleButtonOption>
          <ObcToggleButtonOption value="range" disabled={!rangeUsable}
            title={rangeUsable
              ? 'Scale to the registered engineering range: shows where the loop sits in its span'
              : 'No PV engineering range is registered for this loop (Loop Registry)'}>
            Engineering range
          </ObcToggleButtonOption>
        </ObcToggleButtonGroup>
      </div>
      <ReactECharts option={option} style={{ height }} notMerge
        onChartReady={box.onChartReady} onEvents={{ datazoom: box.onDataZoom }} />
      <ChartZoomBar box={box} hasData={points.length > 0} live={live} />
      <p className="cpm-signal-trend__note">{BAND_NOTE}</p>
    </div>
  );
};

export default SignalTrend;
