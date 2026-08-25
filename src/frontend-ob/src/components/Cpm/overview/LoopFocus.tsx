'use client';

/**
 * Loop focus panel: the live signal row and an 8h rolling PV/SP/OP envelope
 * for the selected loop.
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, PanelHead, TonePill, fmtDateTime, QueryError, cpmChartColors, useRollingWindow, TREND_SPAN_MS, TREND_TICK_MS } from '../shared';
import { useCpmTrend } from '../../../hooks/useCpm';
import { useLoopLive, qualityLabel } from '../../../hooks/useLoopLive';
import { loopSeries } from '../../../utils/loopSeries';
import { useObcTheme } from '../../../hooks/useObcTheme';


// ── loop focus panel (signal row + envelope trend) ─────────────────────────

export const LoopFocus: React.FC<{
  loopId: string;
  displayName: string;
  onOpenAnalysis: () => void;
}> = ({ loopId, displayName, onOpenAnalysis }) => {
  // The historian device for a loop follows the Phase 3 convention.
  const series = loopSeries(loopId);
  // Rolling, not anchored-at-mount: this panel sits on an overview screen that is
  // routinely left open, and a window frozen at click time is indistinguishable
  // from a live one. pollDriven keeps the timer refetches off the session clock.
  const { start, end } = useRollingWindow(TREND_SPAN_MS, TREND_TICK_MS);

  const trend = useCpmTrend(series, start, end, 240, 'pv,sp,op', true, true);
  const points = useMemo(() => trend.data?.points ?? [], [trend.data]);
  // F0.5 — live plane: RBE deltas + snapshot-on-open for this loop's device.
  const live = useLoopLive(loopId);
  const q = qualityLabel(live.quality ?? live.pv);
  const fmtLive = (m: { value: number | string | boolean } | undefined, digits = 1) =>
    m == null ? '—' : typeof m.value === 'number' ? m.value.toFixed(digits) : String(m.value);

  const obcTheme = useObcTheme(); // C: re-derive chart colors on theme switch
  const option = useMemo(() => {
    const { good, amber, grey } = cpmChartColors();
    const ts = points.map(p => p.ts);
    const num = (v: unknown) => (typeof v === 'number' ? v : null);
    return {
      animation: false,
      grid: { left: 42, right: 12, top: 30, bottom: 24 },
      // No tooltip and no legend meant the shape of an oscillation was visible but
      // not a single value readable off it.
      legend: {
        data: ['PV', 'SP', 'OP'], top: 0, right: 0,
        textStyle: { color: grey }, inactiveColor: grey,
      },
      tooltip: {
        trigger: 'axis',
        // 'pv-min'/'pv-band' are stacked helpers that draw the envelope; their
        // stacked values are not readable quantities, so report the real min–max.
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
        data: ts.map(t => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })),
        axisLabel: { color: grey }, axisLine: { lineStyle: { color: grey } },
      },
      yAxis: { type: 'value', scale: true, axisLabel: { color: grey }, splitLine: { lineStyle: { opacity: 0.2 } } },
      series: [
        // PV envelope band: min as invisible base, (max−min) stacked & filled —
        // the honest rendering of oscillation inside each decimation bucket.
        { name: 'pv-min', type: 'line', stack: 'pv-band', silent: true, symbol: 'none',
          lineStyle: { width: 0 }, data: points.map(p => num(p.pv_min)) },
        { name: 'pv-band', type: 'line', stack: 'pv-band', silent: true, symbol: 'none',
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

  return (
    <section className="cpm-surface">
      <PanelHead eyebrow={displayName} title={loopId}
        right={<ObcButton variant="raised" onClick={onOpenAnalysis}>Open analysis →</ObcButton>} />
      <div className="cpm-filter-row" style={{ marginBottom: 8 }}>
        {/* Live signal row (F0.5): RBE means "no update" ≠ 0 — absent renders as —.
            PV pill tone follows the signal QUALITY so a bad-quality PV reads bad. */}
        <TonePill tone={q.tone}>PV {fmtLive(live.pv)}</TonePill>
        <TonePill tone="muted">SP {fmtLive(live.sp)}</TonePill>
        <TonePill tone="warn">OP {fmtLive(live.op)}</TonePill>
        <TonePill tone="muted">MODE {fmtLive(live.mode)}</TonePill>
        <TonePill tone={q.tone}>{q.label}</TonePill>
        <span className="cpm-filter-count">
          {live.hasData && live.lastTs
            ? `live · last change ${new Date(live.lastTs).toLocaleTimeString()}`
            : 'no live publisher for this loop'}
          {/* State the window: it rolls, and a rolling window that has silently
              stopped advancing looks identical to a live one otherwise. */}
          {' · '}envelope {fmtDateTime(start.getTime())} → {fmtDateTime(end.getTime())}
        </span>
      </div>
      {trend.isLoading && <EmptyState title="Loading trend…" />}
      {/* A 403/500 from the historian is not an empty historian — claiming "no
          samples stored" for a failed read sends the reader to debug IoTDB. */}
      {trend.isError && (
        <QueryError title="Trend unavailable" error={trend.error} retry={() => void trend.refetch()} />
      )}
      {!trend.isLoading && !trend.isError && points.length === 0 && (
        <EmptyState title="No historian data for this loop"
          copy={`No samples stored at ${series} in this window.`} />
      )}
      {points.length > 0 && (
        <ReactECharts option={option} style={{ height: 260 }} notMerge />
      )}
    </section>
  );
};

export default LoopFocus;
