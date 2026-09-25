'use client';

/**
 * Explorer › Summary › operating state: live / last-stored PV-SP-OP-MODE tiles
 * and the 8 h rolling trend. Moved out of SummaryTab (cpa-ui-fix-plan Phase 3)
 * so the Summary can carry the gate strip and calculations as well; Phase 5
 * adds rectangle zoom on the loaded window (held across the rolling refetch).
 *
 * When there is no live publisher AND no historian data it renders one honest
 * empty state instead of three "—" tiles that read like measured zeros.
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { CpmLoop } from '../../../../api/cpmApi';
import { useCpmTrend, useLoopLastValues } from '../../../../hooks/useCpm';
import { useLoopLive, qualityLabel } from '../../../../hooks/useLoopLive';
import { useObcTheme } from '../../../../hooks/useObcTheme';
import { loopSeries } from '../../../../utils/loopSeries';
import { modeLabel } from '../../../../utils/modeVocabulary';
import {
  EmptyState, PanelHead, QueryError, TonePill,
  cpmChartColors, fmtDateTime, useRollingWindow, TREND_SPAN_MS, TREND_TICK_MS,
} from '../../shared';
import { boxZoomOption } from '../../../charts/boxZoom';
import { useBoxZoom, useKeepSelecting } from '../../../charts/useBoxZoom';
import ChartZoomBar from '../../../charts/ChartZoomBar';

const num = (v: unknown) => (typeof v === 'number' ? v : null);

/** "live (RBE)" while the feed is current; "live · 4h ago" once it has stalled. */
const liveSource = (ts: number | undefined): string =>
  ts && Date.now() - ts > STALE_LIVE_MS ? `live · ${ageLabel(ts)}` : 'live (RBE)';

/**
 * Beyond this, a "live" value is shown with its age. The RBE job heartbeats
 * every known signal every 300 s, so a key never expires; two heartbeat
 * intervals is comfortably past normal jitter while still catching an outage
 * within ~10 minutes.
 */
const STALE_LIVE_MS = 10 * 60 * 1000;

/** Age of a stored value, coarse on purpose: the point is "not live", not precision. */
const ageLabel = (ts: number | undefined): string => {
  if (!ts) return 'earlier';
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

export const OperatingState: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  // Live plane (RBE + snapshot-on-open); historian values remain the fallback.
  const live = useLoopLive(loop.loopId);
  const series = loopSeries(loop.loopId);
  const { start, end } = useRollingWindow(TREND_SPAN_MS, TREND_TICK_MS);
  // pollDriven: the window advances on a timer, not because the operator asked.
  const trend = useCpmTrend(series, start, end, 240, 'pv,sp,op,mode', true, true);
  // Third plane. live -> trend bucket -> last stored value, which is the only one
  // with no time bound: a setpoint held for a month and a loop parked in AUT are
  // invisible to the other two.
  const lastStored = useLoopLastValues(series);
  const points = useMemo(() => trend.data?.points ?? [], [trend.data]);
  const last = points.length ? points[points.length - 1] : undefined;

  const box = useBoxZoom({ hasY: true });
  const obcTheme = useObcTheme(); // re-derive chart colors on theme switch
  const option = useMemo(() => {
    const { good, amber, grey } = cpmChartColors();
    return {
      animation: false,
      grid: { left: 42, right: 12, top: 30, bottom: 24 },
      ...boxZoomOption({ xAxisIndex: 0, yAxisIndex: 0 }, box.zoom),
      legend: {
        data: ['PV', 'SP', 'OP'], top: 0, right: 0,
        textStyle: { color: grey }, inactiveColor: grey,
      },
      tooltip: {
        trigger: 'axis',
        // 'pv-min'/'pv-band' are stacked helper series that draw the envelope;
        // their STACKED values are not readable quantities, so they are filtered
        // out and the bucket's real min–max is reported instead.
        formatter: (params: Array<{ seriesName: string; marker: string; value: number | null; dataIndex: number }>) => {
          if (!params.length) return '';
          const p = points[params[0].dataIndex];
          const rows = params
            .filter(x => x.seriesName !== 'pv-min' && x.seriesName !== 'pv-band')
            .map(x => `${x.marker} ${x.seriesName}: ${x.value == null ? '—' : Number(x.value).toFixed(2)}`);
          const lo = num(p?.pv_min); const hi = num(p?.pv_max);
          if (lo != null && hi != null) rows.push(`PV range: ${lo.toFixed(2)} – ${hi.toFixed(2)}`);
          return [`<strong>${fmtDateTime(p?.ts)}</strong>`, ...rows].join('<br/>');
        },
      },
      xAxis: {
        type: 'category',
        data: points.map(p => new Date(p.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })),
        axisLabel: { color: grey }, axisLine: { lineStyle: { color: grey } },
      },
      yAxis: { type: 'value', scale: true, axisLabel: { color: grey }, splitLine: { lineStyle: { opacity: 0.2 } } },
      series: [
        { name: 'pv-min', type: 'line', stack: 'band', silent: true, symbol: 'none',
          lineStyle: { width: 0 }, data: points.map(p => num(p.pv_min)) },
        { name: 'pv-band', type: 'line', stack: 'band', silent: true, symbol: 'none',
          lineStyle: { width: 0 }, areaStyle: { color: good, opacity: 0.18 },
          data: points.map(p => {
            const lo = num(p.pv_min); const hi = num(p.pv_max);
            return lo != null && hi != null ? hi - lo : null;
          }) },
        { name: 'PV', type: 'line', symbol: 'none', color: good, lineStyle: { color: good, width: 2 },
          data: points.map(p => num(p.pv_avg) ?? num(p.pv)) },
        { name: 'SP', type: 'line', symbol: 'none', color: grey, lineStyle: { color: grey, width: 1, type: 'dashed' },
          data: points.map(p => num(p.sp)) },
        { name: 'OP', type: 'line', symbol: 'none', color: amber, lineStyle: { color: amber, width: 1.5 },
          data: points.map(p => num(p.op_avg) ?? num(p.op)) },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- obcTheme is a recompute trigger: chart colors are read from CSS vars that change with the theme.
  }, [points, obcTheme, box.zoom]);
  useKeepSelecting(box, option);

  // The third plane counts: a loop whose only evidence is a last stored value must
  // render its tiles, not the "nothing here" state this guard exists for.
  const hasStored = Object.keys(lastStored.data?.values ?? {}).length > 0;
  const noData = !live.hasData && !trend.isLoading && !trend.isError && points.length === 0
                 && !lastStored.isLoading && !hasStored;

  return (
    <div>
      <PanelHead
        eyebrow={live.hasData ? 'Live operating state' : 'Last stored samples'}
        title="Operating state"
      />

      {noData ? (
        <EmptyState
          title="No operating data"
          copy={`No live publisher, and no samples stored at ${series} in the last 8 hours.`}
        />
      ) : (
        <>
          <div className="cpm-kpi-row" style={{ marginBottom: 12 }}>
            {(['pv', 'sp', 'op'] as const).map(m => {
              const lv = live[m];
              const liveVal = lv && typeof lv.value === 'number' ? lv.value.toFixed(2) : null;
              // Read the SAME aggregate the chart pen draws: PV/OP from the
              // bucket average, SP from last_value.
              const stored = m === 'sp'
                ? num(last?.[m])
                : num(last?.[`${m}_avg`]) ?? num(last?.[m]);
              const held = num(lastStored.data?.values?.[m]?.value);
              const shown = liveVal ?? (stored != null ? stored.toFixed(2)
                                      : held != null ? held.toFixed(2) : null);
              const heldTs = stored == null && held != null
                ? lastStored.data?.values?.[m]?.ts : undefined;
              return (
                <div key={m} className="cpm-kpi">
                  <span className="cpm-kpi__caption">{m.toUpperCase()}</span>
                  <span className="cpm-kpi__value">{shown ?? '—'}</span>
                  {/* OP is a percentage of span by definition in this engine.
                      PV/SP carry no engineering unit in the registry. */}
                  <span className="cpm-kpi__sub">
                    {m === 'op' ? '% · ' : ''}
                    {liveVal ? liveSource(lv?.ts)
                     : stored != null ? 'from historian'
                     : heldTs ? `last stored ${ageLabel(heldTs)}`
                     : 'no value'}
                  </span>
                </div>
              );
            })}

            {/* MODE completes the picture: a loop in manual is excluded at Gate 1,
                so every verdict on this page was computed WITHOUT it. */}
            {(() => {
              const liveMode = live.mode?.value;
              const storedMode = last?.mode;
              const heldMode = lastStored.data?.values?.mode;
              const value = liveMode ?? storedMode ?? heldMode?.value;
              const m = modeLabel(value);
              const src = liveMode != null ? liveSource(live.mode?.ts)
                        : storedMode != null ? 'from historian'
                        : heldMode?.value != null ? `last stored ${ageLabel(heldMode.ts)}`
                        : null;
              return (
                <div className="cpm-kpi">
                  <span className="cpm-kpi__caption">MODE</span>
                  <span className="cpm-kpi__value">{m.label}</span>
                  <span className="cpm-kpi__sub">{src ? `${m.note} · ${src}` : m.note}</span>
                </div>
              );
            })()}
          </div>
          {/* "Trend range", not "Window": this is the rolling historian envelope,
              not an engine evaluation window (the gate strip below names its
              evaluated window separately). */}
          <p className="cpm-copy cpm-source-line">
            <TonePill tone={live.hasData ? qualityLabel(live.quality ?? live.pv).tone : 'muted'}>
              {live.hasData ? qualityLabel(live.quality ?? live.pv).label : 'NO LIVE PUBLISHER'}
            </TonePill>
            {' '}Trend range {fmtDateTime(start.getTime())} → {fmtDateTime(end.getTime())} · rolling 8 h, not an evaluated window
          </p>
        </>
      )}

      {trend.isLoading && <EmptyState title="Loading trend…" />}
      {/* A historian 403/500 is not an empty historian. */}
      {trend.isError && (
        <QueryError title="Trend unavailable" error={trend.error} retry={() => void trend.refetch()} />
      )}
      {points.length > 0 && (
        <>
          <ReactECharts option={option} style={{ height: 240 }} notMerge
            onChartReady={box.onChartReady} onEvents={{ datazoom: box.onDataZoom }} />
          <ChartZoomBar box={box} hasData live />
        </>
      )}
    </div>
  );
};

export default OperatingState;
