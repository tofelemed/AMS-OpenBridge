'use client';

/**
 * Explorer › Summary. Live/last-stored operating state, an 8h rolling trend and
 * the loop's configuration.
 *
 * One change from the previous version: when there is no live publisher AND no
 * historian data, it no longer renders three empty PV/SP/OP tiles above an empty
 * chart region. Three tiles reading "—" look like measurements that happen to be
 * zero; one honest empty state says what is actually true.
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { CpmLoop } from '../../../api/cpmApi';
import { useCpmTrend, useLatestGates } from '../../../hooks/useCpm';
import { useLoopLive, qualityLabel } from '../../../hooks/useLoopLive';
import { useObcTheme } from '../../../hooks/useObcTheme';
import { loopSeries } from '../../../utils/loopSeries';
import {
  EmptyState, KvRow, PanelHead, QueryError, TonePill,
  cpmChartColors, fmtDateTime, useRollingWindow, TREND_SPAN_MS, TREND_TICK_MS,
} from '../shared';

const num = (v: unknown) => (typeof v === 'number' ? v : null);

export const SummaryTab: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const gates = useLatestGates(loop.loopId, '24h');
  // Live plane (RBE + snapshot-on-open); historian values remain the fallback.
  const live = useLoopLive(loop.loopId);
  const series = loopSeries(loop.loopId);
  const { start, end } = useRollingWindow(TREND_SPAN_MS, TREND_TICK_MS);
  // pollDriven: the window advances on a timer, not because the operator asked.
  const trend = useCpmTrend(series, start, end, 240, 'pv,sp,op', true, true);
  const points = useMemo(() => trend.data?.points ?? [], [trend.data]);
  const last = points.length ? points[points.length - 1] : undefined;

  const obcTheme = useObcTheme(); // re-derive chart colors on theme switch
  const option = useMemo(() => {
    const { good, amber, grey } = cpmChartColors();
    return {
      animation: false,
      grid: { left: 42, right: 12, top: 30, bottom: 24 },
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
        { name: 'PV', type: 'line', symbol: 'none', lineStyle: { color: good, width: 2 },
          data: points.map(p => num(p.pv_avg) ?? num(p.pv)) },
        { name: 'SP', type: 'line', symbol: 'none', lineStyle: { color: grey, width: 1, type: 'dashed' },
          data: points.map(p => num(p.sp)) },
        { name: 'OP', type: 'line', symbol: 'none', lineStyle: { color: amber, width: 1.5 },
          data: points.map(p => num(p.op_avg) ?? num(p.op)) },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- obcTheme is a recompute trigger: chart colors are read from CSS vars that change with the theme.
  }, [points, obcTheme]);

  const noData = !live.hasData && !trend.isLoading && !trend.isError && points.length === 0;

  return (
    <div className="cpm-grid-2">
      <div>
        <PanelHead
          eyebrow={live.hasData ? 'Live operating state' : 'Last stored samples'}
          title="Operating state"
        />

        {/* Neither plane has anything: say that once instead of rendering three
            "—" tiles that read like measured zeros. */}
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
                return (
                  <div key={m} className="cpm-kpi">
                    <span className="cpm-kpi__caption">{m.toUpperCase()}</span>
                    <span className="cpm-kpi__value">
                      {liveVal ?? (stored != null ? stored.toFixed(2) : '—')}
                    </span>
                    {/* OP is a percentage of span by definition in this engine.
                        PV/SP carry no engineering unit in the registry. */}
                    <span className="cpm-kpi__sub">
                      {m === 'op' ? '% · ' : ''}{liveVal ? 'live (RBE)' : 'from historian'}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Source quality belongs with the values it describes, not in the
                panel head where it read as a loop verdict. */}
            <p className="cpm-copy cpm-source-line">
              <TonePill tone={live.hasData ? qualityLabel(live.quality ?? live.pv).tone : 'muted'}>
                {live.hasData ? qualityLabel(live.quality ?? live.pv).label : 'NO LIVE PUBLISHER'}
              </TonePill>
              {' '}Window {fmtDateTime(start.getTime())} → {fmtDateTime(end.getTime())}
            </p>
          </>
        )}

        {trend.isLoading && <EmptyState title="Loading trend…" />}
        {/* A historian 403/500 is not an empty historian. */}
        {trend.isError && (
          <QueryError title="Trend unavailable" error={trend.error} retry={() => void trend.refetch()} />
        )}
        {points.length > 0 && <ReactECharts option={option} style={{ height: 240 }} notMerge />}
      </div>

      <div>
        <PanelHead eyebrow="Context" title="Configuration" />
        <KvRow label="Loop type">{loop.loopType}</KvRow>
        <KvRow label="Criticality">{loop.criticality}</KvRow>
        <KvRow label="Gate profile">{loop.thresholdProfileId ?? 'default'}</KvRow>
        <KvRow label="Dynamics class">{gates.data?.metadata.dynamicsClass ?? 'resolved from loop type'}</KvRow>
        <KvRow label="Profile source">{gates.data?.metadata.profileSource ?? '—'}</KvRow>
        <KvRow label="Calculation version">{gates.data?.metadata.calculationVersion ?? '—'}</KvRow>
        <KvRow label="Historian device">{series}</KvRow>
      </div>
    </div>
  );
};

export default SummaryTab;
