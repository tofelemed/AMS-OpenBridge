/**
 * What the engine's metrics carry and what they do not, then the checkpoint chart in a closed disclosure.
 * There is no server-side history for these metrics: the chart holds only the readings taken while this page is open.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { KvRow, PanelHead, EmptyState, fmtDateTime } from '../shared';
import { Toggletip } from '../../../ui/Toggletip';
import { axisChrome, baseOption, chartPalette, useChartTheme } from '../../../charts/chartTheme';
import { boxZoomOption } from '../../charts/boxZoom';
import { useBoxZoom, useKeepSelecting } from '../../charts/useBoxZoom';
import ChartZoomBar from '../../charts/ChartZoomBar';
import { siteAxisTick } from '../../../cpa/siteTime';
import type { CpmJobMetrics } from '../../../api/cpmApi';
import { NOT_EXPOSED } from './mergeJobs';

interface Sample { t: number; ckptAgeSec: number | null; ckptDurMs: number | null }

const NOT_CARRIED = ['Watermark lag', 'Kafka consumer lag', 'Latency', 'Backpressure', 'Parallelism'];

export const TelemetryCard: React.FC<{
  metrics: { collectedAt: string; jobs: CpmJobMetrics[] } | undefined;
  lastVerdictAgeMin: number | null;
}> = ({ metrics, lastVerdictAgeMin }) => {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [open, setOpen] = useState(false);
  const lastCollected = useRef<string | null>(null);
  useEffect(() => {
    if (!metrics || metrics.collectedAt === lastCollected.current) return;
    lastCollected.current = metrics.collectedAt;
    const cplm = metrics.jobs.filter(j => j.role === 'cplm' && j.checkpoint);
    const age = cplm.length ? Math.max(...cplm.map(j => j.checkpoint!.lastCompletedAgeSec ?? 0)) : null;
    const dur = cplm.length ? Math.max(...cplm.map(j => j.checkpoint!.lastDurationMs ?? 0)) : null;
    setSamples(prev => [...prev.slice(-119), { t: new Date(metrics.collectedAt).getTime(), ckptAgeSec: age, ckptDurMs: dur }]);
  }, [metrics]);

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
      grid: { left: 48, right: 48, top: 24, bottom: 24 },
      ...boxZoomOption({ xAxisIndex: 0, yAxisIndex: [0, 1] }, box.zoom),
      tooltip: {
        ...base.tooltip, trigger: 'axis',
        formatter: (rows: Array<{ marker: string; seriesName: string; value: [number, number] }>) => rows.length
          ? [`<strong>${fmtDateTime(rows[0].value[0])}</strong>`, ...rows.map(x => `${x.marker} ${x.seriesName}: ${x.value[1]}`)].join('<br/>')
          : '',
      },
      legend: { ...base.legend, top: 0 },
      xAxis: { ...axis, type: 'time', axisLabel: { ...axis.axisLabel, hideOverlap: true,
        formatter: siteAxisTick(samples.length > 1 ? samples[samples.length - 1].t - samples[0].t : 3_600_000) } },
      yAxis: [
        { ...axis, type: 'value', name: 'ckpt age (s)', splitLine: { lineStyle: { ...axis.splitLine.lineStyle, opacity: 0.2 } } },
        { ...axis, type: 'value', name: 'ckpt dur (ms)', splitLine: { show: false } },
      ],
      series: [
        { name: 'Max checkpoint age', type: 'line', symbol: 'none', color: pv, lineStyle: { color: pv, width: 2 }, data: samples.map(s => [s.t, s.ckptAgeSec]) },
        { name: 'Max checkpoint duration', type: 'line', symbol: 'none', yAxisIndex: 1, color: op, lineStyle: { color: op, width: 1.5 }, data: samples.map(s => [s.t, s.ckptDurMs]) },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- theme is a recompute trigger: the palette is read from CSS variables that change with it.
  }, [samples, theme, box.zoom]);
  useKeepSelecting(box, option);

  const verdictAge = lastVerdictAgeMin == null ? 'none stored yet'
    : `window ended ${lastVerdictAgeMin < 120 ? `${lastVerdictAgeMin} min` : `${Math.round(lastVerdictAgeMin / 60)} h`} ago`;

  return (
    <section className="cpm-surface">
      <PanelHead title="Telemetry"
        help={<Toggletip variant="how-to" label="Where a sample becomes a verdict">
          <p>DCS / edge to Kafka, then Flink compute, then Postgres and IoTDB. The last fused verdict is the newest window end across the fleet.</p>
        </Toggletip>} />
      {NOT_CARRIED.map(label => <KvRow key={label} label={label}>{NOT_EXPOSED}</KvRow>)}
      <KvRow label="Last fused verdict">{verdictAge}</KvRow>
      <details className="cpm-pipeline-history" onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary>Checkpoint history · {samples.length} reading(s)</summary>
        <p className="cpm-copy">Held only while this page is open</p>
        {open && (samples.length < 2
          ? <EmptyState title="Collecting…" copy="The chart needs two readings; keep this page open." />
          : (
            <>
              <ReactECharts option={option} style={{ height: 220 }} notMerge
                onChartReady={box.onChartReady} onEvents={{ datazoom: box.onDataZoom }} />
              <ChartZoomBar box={box} hasData live />
            </>
          ))}
      </details>
    </section>
  );
};

export default TelemetryCard;
