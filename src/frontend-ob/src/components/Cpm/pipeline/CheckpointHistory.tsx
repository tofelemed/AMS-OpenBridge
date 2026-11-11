/**
 * CHG-170 (owner review, Pipeline Health): Checkpoint history, the page's second view (`?view=history`; it was a closed
 * disclosure at the foot of the Telemetry card). The same chart: max checkpoint age and max checkpoint duration of the CPLM
 * jobs on two axes, gaps where nothing was read, the zoom tools. The plot starts lower so the axis names sit under the legend
 * instead of being cut by it; the view says once that it covers the CPLM jobs (the tiles cover every job). There is no
 * server-side history for these metrics: the page takes a reading from each metrics answer whichever view shows
 * (useCheckpointSamples), up to 120, held only while it is open.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { EmptyState, fmtDateTime } from '../shared';
import { axisChrome, baseOption, chartPalette, useChartTheme } from '../../../charts/chartTheme';
import { boxZoomOption } from '../../charts/boxZoom';
import { useBoxZoom, useKeepSelecting } from '../../charts/useBoxZoom';
import ChartZoomBar from '../../charts/ChartZoomBar';
import { siteAxisTick } from '../../../cpa/siteTime';
import type { CpmJobMetrics } from '../../../api/cpmApi';

export interface Sample { t: number; ckptAgeSec: number | null; ckptDurMs: number | null }

/** The largest value read; null when none was read, so the chart shows a gap, not 0. */
const maxOf = (xs: Array<number | null | undefined>) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.max(...v) : null;
};

/** One reading per metrics answer (a new collectedAt): the CPLM jobs' largest checkpoint age and duration. */
export function useCheckpointSamples(metrics: { collectedAt: string; jobs: CpmJobMetrics[] } | undefined): Sample[] {
  const [samples, setSamples] = useState<Sample[]>([]);
  const lastCollected = useRef<string | null>(null);
  useEffect(() => {
    if (!metrics || metrics.collectedAt === lastCollected.current) return;
    lastCollected.current = metrics.collectedAt;
    const cplm = metrics.jobs.filter(j => j.role === 'cplm' && j.checkpoint);
    const age = cplm.length ? maxOf(cplm.map(j => j.checkpoint!.lastCompletedAgeSec)) : null;
    const dur = cplm.length ? maxOf(cplm.map(j => j.checkpoint!.lastDurationMs)) : null;
    setSamples(prev => [...prev.slice(-119), { t: new Date(metrics.collectedAt).getTime(), ckptAgeSec: age, ckptDurMs: dur }]);
  }, [metrics]);
  return samples;
}

/** The legend's band at the top, and the axis names under it (an axis name sits nameGap above the plot). */
const LEGEND_TOP = 0;
const NAME_GAP = 15;
const PLOT_TOP = 48;

export const CheckpointHistory: React.FC<{ samples: Sample[] }> = ({ samples }) => {
  const box = useBoxZoom({ hasY: true });
  const theme = useChartTheme();
  const option = useMemo(() => {
    const palette = chartPalette();
    const { pv, op } = palette;
    const base = baseOption(palette);
    const axis = axisChrome(palette);
    return {
      ...base,
      animation: false,
      grid: { left: 48, right: 48, top: PLOT_TOP, bottom: 24 },
      ...boxZoomOption({ xAxisIndex: 0, yAxisIndex: [0, 1] }, box.zoom),
      tooltip: {
        ...base.tooltip, trigger: 'axis',
        formatter: (rows: Array<{ marker: string; seriesName: string; value: [number, number] }>) => rows.length
          ? [`<strong>${fmtDateTime(rows[0].value[0])}</strong>`, ...rows.map(x => `${x.marker} ${x.seriesName}: ${x.value[1]}`)].join('<br/>')
          : '',
      },
      legend: { ...base.legend, top: LEGEND_TOP },
      xAxis: { ...axis, type: 'time', axisLabel: { ...axis.axisLabel, hideOverlap: true,
        formatter: siteAxisTick(samples.length > 1 ? samples[samples.length - 1].t - samples[0].t : 3_600_000) } },
      yAxis: [
        { ...axis, type: 'value', name: 'ckpt age (s)', nameGap: NAME_GAP, splitLine: { lineStyle: { ...axis.splitLine.lineStyle, opacity: 0.2 } } },
        { ...axis, type: 'value', name: 'ckpt dur (ms)', nameGap: NAME_GAP, splitLine: { show: false } },
      ],
      series: [
        { name: 'Max checkpoint age', type: 'line', symbol: 'none', color: pv, lineStyle: { color: pv, width: 2 }, data: samples.map(s => [s.t, s.ckptAgeSec]) },
        { name: 'Max checkpoint duration', type: 'line', symbol: 'none', yAxisIndex: 1, color: op, lineStyle: { color: op, width: 1.5 }, data: samples.map(s => [s.t, s.ckptDurMs]) },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- theme is a recompute trigger: the palette is read from CSS variables that change with it.
  }, [samples, theme, box.zoom]);
  useKeepSelecting(box, option);

  return (
    <section className="cpm-surface cpm-pipeline-history" aria-labelledby="pipeline-history-title">
      <div className="cpm-pipeline-history__head">
        <h2 id="pipeline-history-title" className="cpm-panel-title">Checkpoint history</h2>
        <span className="cpm-copy">{`CPLM jobs · held only while this page is open · ${samples.length} ${samples.length === 1 ? 'reading' : 'readings'}`}</span>
      </div>
      {samples.length < 2
        ? <EmptyState title="Collecting…" copy="The chart needs two readings; keep this page open." />
        : (
          <>
            <ReactECharts option={option} style={{ height: 220 }} notMerge
              onChartReady={box.onChartReady} onEvents={{ datazoom: box.onDataZoom }} />
            <ChartZoomBar box={box} hasData live />
          </>
        )}
    </section>
  );
};

export default CheckpointHistory;
