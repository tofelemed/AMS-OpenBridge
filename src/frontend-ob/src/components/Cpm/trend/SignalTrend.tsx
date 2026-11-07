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
import { SegmentedControl } from '../../../ui/SegmentedControl';
import { Toggletip } from '../../../ui/Toggletip';
import type { CpmTrendPoint } from '../../../api/cpm/kpis';
import { chartPalette, useChartTheme } from '../../../charts/chartTheme';
import { useCpmLoops } from '../../../hooks/useCpm';
import { boxZoomOption } from '../../charts/boxZoom';
import { useBoxZoom, useKeepSelecting } from '../../charts/useBoxZoom';
import ChartZoomBar from '../../charts/ChartZoomBar';
import { EmptyState } from '../shared';
import { BAND_NOTE, hasPvRange, hasSignalValues, signalTrendOption, type TrendScale } from './trendOption';

const NO_RANGE = 'No PV engineering range is registered for this loop (Loop Registry)';

export const SignalTrend: React.FC<{
  loopId: string;
  points: CpmTrendPoint[];
  hasVp?: boolean;
  height?: number;
  /** A rolling / polling chart: the zoom bar says the viewport is held while zoomed. */
  live?: boolean;
  /** CHG-067: what this chart shows, e.g. "Evaluated window (diagnosis)" / "Now (live 8 h)". */
  caption?: string;
  /** How to read this particular chart, added to the trend's ? after the band note. */
  help?: string;
  /** CHG-067: the plotted range, the evaluated-window band, and a y-scale shared with another trend. */
  xRange?: { fromMs: number; toMs: number } | null;
  evaluated?: { startMs: number; endMs: number; label: string } | null;
  yBounds?: { pv: { min: number; max: number } | null; op: { min: number; max: number } | null } | null;
  /** The zoom bar's Reset word, and links that belong in that row. */
  resetLabel?: string;
  foot?: React.ReactNode;
}> = ({ loopId, points, hasVp, height = 240, live = false, caption, help, xRange, evaluated, yBounds, resetLabel, foot }) => {
  const loops = useCpmLoops();
  const loop = loops.data?.loops.find(l => l.loopId.toLowerCase() === loopId.toLowerCase());
  const range = loop?.engineering ?? null;
  const pvUnit = loop?.engineering?.pvUnit ?? null;
  const rangeUsable = hasPvRange(range);
  const [chosen, setChosen] = useState<TrendScale>('fit');
  const scale: TrendScale = rangeUsable ? chosen : 'fit';

  const box = useBoxZoom({ hasY: true });
  const theme = useChartTheme();
  const option = useMemo(
    () => signalTrendOption({
      points, palette: chartPalette(), hasVp, pvUnit, scale, range, xRange, evaluated, yBounds,
      zoom: boxZoomOption({ xAxisIndex: 0, yAxisIndex: [0, 1] }, box.zoom),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- theme is a recompute trigger: the palette is read from CSS variables that change with it.
    [points, hasVp, pvUnit, scale, range, xRange, evaluated, yBounds, theme, box.zoom],
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
        <span className="cpm-title-row cpm-signal-trend__caption">
          {caption && <span className="cpm-eyebrow">{caption}</span>}
          <Toggletip variant="how-to" label="How to read this trend">
            <p>{BAND_NOTE}</p>
            {help && <p>{help}</p>}
          </Toggletip>
        </span>
        <SegmentedControl label="Trend scale" ignoreReselect value={scale} onChange={setChosen}
          options={[
            { value: 'fit', label: <span title="Scale each axis to the plotted data: shows the shape of the signals">Fit to data</span> },
            {
              value: 'range',
              label: <span title={rangeUsable ? 'Scale to the registered engineering range: shows where the loop sits in its span' : NO_RANGE}>Engineering range</span>,
              disabled: !rangeUsable,
              reason: NO_RANGE,
            },
          ]} />
      </div>
      <ReactECharts option={option} style={{ height }} notMerge
        onChartReady={box.onChartReady} onEvents={{ datazoom: box.onDataZoom }} />
      <ChartZoomBar box={box} hasData={points.length > 0} live={live} resetLabel={resetLabel}>{foot}</ChartZoomBar>
    </div>
  );
};

export default SignalTrend;
