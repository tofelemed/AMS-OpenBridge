/**
 * v2.5 Task 2E.1 (spec §3.1 axes; NR-033, NR-035): the ONE echarts wrapper the evidence views use.
 * One y axis per unit group (never mixed units on an axis), `connectNulls: false` always (no filled
 * line across unsupported gaps), `step: 'end'` for held series, times in the site zone with the zone
 * in the axis name, bands labelled with their meaning, and a data-table / CSV companion that shows
 * the same values the chart draws. Colours come from the CPM pens (OpenBridge tokens), never literals.
 */
import React, { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { cpmChartColors } from '../shared';
import { formatInZone, formatTimeInZone, zoneLabel } from './timezone';

export type Pen = 'good' | 'amber' | 'grey' | 'accent' | 'pink' | 'bad';
export type Pens = Record<Pen, string>;

export interface CpmSeries {
  id: string;
  label: string;
  unit: string;
  x: ArrayLike<number>;
  y: ArrayLike<number | null>;
  pen: Pen;
  /** A held / hold_kind series renders as a step (the value persists until the next sample). */
  held?: boolean;
  /** A band's meaning is part of its name (NR-035). */
  bandMeaning?: string;
  /** Marker points instead of a line (events, crossings, peaks). */
  markers?: boolean;
  /** Per-point extra tooltip lines (quality, hold kind, sample vs verified time). */
  meta?: (i: number) => string[];
  dashed?: boolean;
  area?: boolean;
}

export interface CpmChartInput {
  series: CpmSeries[];
  xKind: 'time' | 'value';
  timeZone?: string;
  xLabel?: string;
  xUnit?: string;
  pens: Pens;
  height?: number;
  logY?: boolean;
}

const nan = (v: number | null | undefined) => v == null || !Number.isFinite(v) ? null : v;

/** Pure option builder (tested): one axis per unit group, no null bridging, stepped holds, labelled bands. */
export function buildCpmChartOption(input: CpmChartInput) {
  const { series, xKind, timeZone = 'UTC', pens } = input;
  const units: string[] = [];
  for (const s of series) if (!units.includes(s.unit)) units.push(s.unit);
  const firstX = series.find(s => s.x.length > 0)?.x[0] ?? Date.now();
  const xAxis = xKind === 'time'
    ? { type: 'time' as const, name: `time — ${zoneLabel(timeZone, firstX)}`, nameLocation: 'middle' as const, nameGap: 28,
        axisLabel: { color: pens.grey, formatter: (v: number) => formatTimeInZone(v, timeZone) }, axisLine: { lineStyle: { color: pens.grey } }, splitLine: { show: false } }
    : { type: 'value' as const, name: input.xUnit ? `${input.xLabel ?? 'x'} (${input.xUnit})` : (input.xLabel ?? 'x'), nameLocation: 'middle' as const, nameGap: 28,
        axisLabel: { color: pens.grey }, axisLine: { lineStyle: { color: pens.grey } }, splitLine: { show: false }, scale: true };
  const yAxis = units.map((u, i) => ({
    type: (input.logY ? 'log' : 'value') as 'log' | 'value', name: u, position: i % 2 === 0 ? 'left' : 'right', offset: Math.floor(i / 2) * 48,
    scale: true, axisLabel: { color: pens.grey }, nameTextStyle: { color: pens.grey }, splitLine: { show: i === 0, lineStyle: { opacity: 0.2 } },
  }));
  const echartsSeries = series.map(s => {
    const data: Array<[number, number | null]> = [];
    for (let i = 0; i < s.x.length; i++) data.push([s.x[i], nan(s.y[i])]);
    return {
      id: s.id,
      name: s.bandMeaning ? `${s.label} — ${s.bandMeaning}` : s.label,
      type: 'line' as const,
      yAxisIndex: units.indexOf(s.unit),
      connectNulls: false,
      showSymbol: !!s.markers,
      symbol: s.markers ? 'circle' : 'none',
      symbolSize: s.markers ? 7 : 4,
      lineStyle: { color: pens[s.pen], width: s.markers ? 0 : s.bandMeaning ? 1 : 1.5, type: s.dashed || s.bandMeaning ? ('dashed' as const) : ('solid' as const) },
      itemStyle: { color: pens[s.pen] },
      areaStyle: s.area ? { color: pens[s.pen], opacity: 0.12 } : undefined,
      ...(s.held ? { step: 'end' as const } : {}),
      data,
      __meta: s.meta,
      __unit: s.unit,
    };
  });
  return {
    animation: false,
    grid: { left: 64, right: 24 + Math.max(0, units.length - 2) * 48, top: 24, bottom: 56 },
    xAxis,
    yAxis,
    legend: { top: 0, textStyle: { color: pens.grey } },
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: unknown) => {
        const items = (Array.isArray(params) ? params : [params]) as Array<{ seriesId: string; seriesName: string; value: [number, number | null]; dataIndex: number }>;
        if (items.length === 0) return '';
        const x = items[0].value[0];
        const head = xKind === 'time' ? `${formatInZone(x, timeZone)} (${zoneLabel(timeZone, x)})` : `${input.xLabel ?? 'x'} = ${x}${input.xUnit ? ' ' + input.xUnit : ''}`;
        const lines = items.map(it => {
          const s = echartsSeries.find(e => e.id === it.seriesId);
          const v = it.value[1];
          const extra = s?.__meta ? s.__meta(it.dataIndex).map(l => `<br/>&nbsp;&nbsp;${l}`).join('') : '';
          return `${it.seriesName}: ${v == null ? 'no value (unsupported)' : `${v} ${s?.__unit ?? ''}`}${extra}`;
        });
        return [head, ...lines].join('<br/>');
      },
    },
    series: echartsSeries,
  };
}

/** The chart's values as CSV - the same numbers the chart draws, nothing recomputed. */
export function toCsv(series: CpmSeries[]): string {
  const xs = new Set<number>();
  for (const s of series) for (let i = 0; i < s.x.length; i++) xs.add(s.x[i]);
  const sorted = Array.from(xs).sort((a, b) => a - b);
  const index = series.map(s => { const m = new Map<number, number | null>(); for (let i = 0; i < s.x.length; i++) m.set(s.x[i], nan(s.y[i])); return m; });
  const head = ['x', ...series.map(s => `${s.label} (${s.unit})`)].join(',');
  const rows = sorted.map(x => [x, ...index.map(m => { const v = m.get(x); return v == null ? '' : String(v); })].join(','));
  return [head, ...rows].join('\n');
}

export const CpmChart: React.FC<Omit<CpmChartInput, 'pens'> & { title?: string; onClick?: (seriesId: string, index: number) => void }> = (props) => {
  const pens: Pens = cpmChartColors();
  const option = useMemo(() => buildCpmChartOption({ ...props, pens }), [props, pens]);
  const [table, setTable] = useState(false);
  const onEvents = useMemo(() => ({ click: (e: { seriesId?: string; dataIndex?: number }) => { if (props.onClick && e.seriesId != null && e.dataIndex != null) props.onClick(e.seriesId, e.dataIndex); } }), [props]);
  const csv = () => {
    const blob = new Blob([toCsv(props.series)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${props.title ?? 'evidence'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="cpm-chart">
      <div className="cpm-chart__bar">
        {props.title && <span className="cpm-chart__title">{props.title}</span>}
        <ObcButton variant="flat" onClick={() => setTable(t => !t)}>{table ? 'Chart' : 'Data table'}</ObcButton>
        <ObcButton variant="flat" onClick={csv}>Export CSV</ObcButton>
      </div>
      {table ? (
        <pre className="cpm-chart__table" data-testid="cpm-chart-table">{toCsv(props.series)}</pre>
      ) : (
        <ReactECharts option={option} notMerge style={{ height: props.height ?? 320 }} onEvents={onEvents} />
      )}
    </div>
  );
};
