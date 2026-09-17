/**
 * v2.5 workbench (audit F7): the signal context when the sibling G0 run kept no arrays (retention
 * keeps them only for windows with a finding). The lanes come from the historian's BUCKETED trend
 * - one request per window, ≤ ~1k buckets per role with min/max envelope, the Historical page's
 * path - and say so in every title. Unqualified raw history is never presented as the run's own.
 */
import React, { useMemo } from 'react';
import type { CpmTrendPoint } from '../../../api/cpmApi';
import { useCpmModeTrack, useCpmTrend } from '../../../hooks/useCpm';
import { classifyMode, QueryError } from '../shared';
import { loopSeries } from '../../../utils/loopSeries';
import { CpmChart, type CpmSeries } from './CpmChart';
import { IntervalLane, type LaneInterval } from './views/primitives/IntervalLane';

const PENS = { pv: 'good', sp: 'grey', op: 'amber', vp: 'pink' } as const;
const SOURCE_TAG = 'historian (not the run\'s own qualification)';

/** One role of the bucketed trend as a series; null when the role has no value at all (e.g. VP not mapped). */
export function trendRoleSeries(points: CpmTrendPoint[], key: 'pv' | 'sp' | 'op' | 'vp', unit: string, timeFmt: (ms: number) => string): CpmSeries | null {
  const rows = points as unknown as Array<Record<string, number | string | null | undefined>>;
  const y = rows.map(p => (typeof p[key] === 'number' && Number.isFinite(p[key] as number) ? (p[key] as number) : null));
  if (!y.some(v => v != null)) return null;
  return {
    id: `hist-${key}`, label: `${key.toUpperCase()} (historian)`, unit, x: rows.map(p => p.ts as number), y, pen: PENS[key],
    meta: i => {
      const lo = rows[i][`${key}_min`], hi = rows[i][`${key}_max`];
      return [typeof lo === 'number' && typeof hi === 'number' ? `bucket min ${lo} · max ${hi}` : 'bucket average', `bucket ${timeFmt(rows[i].ts as number)}`];
    },
  };
}

/** Run-length intervals over the mode track (the engine's vocabulary through classifyMode). */
export function modeIntervalsFromTrend(points: CpmTrendPoint[], toMs: number): LaneInterval[] {
  const pts = points.map(p => ({ ts: p.ts, mode: typeof p.mode === 'string' ? p.mode : null })).filter(p => p.mode != null);
  const out: LaneInterval[] = [];
  for (let i = 0; i < pts.length; i++) {
    const cls = classifyMode(pts[i].mode);
    const tone = cls === 'auto' ? 'good' : cls === 'manual' ? 'warn' : 'muted';
    const endMs = pts[i + 1]?.ts ?? toMs;
    const head = out[out.length - 1];
    if (head && head.label === pts[i].mode) { head.endMs = endMs; continue; }
    out.push({ startMs: pts[i].ts, endMs, label: pts[i].mode ?? '', tone });
  }
  return out;
}

/** The lane source: the run's arrays when the G0 sibling declares a COMPLETE role_qualification, else the historian. */
export function laneSource(g0: { isLoading: boolean; data: { artifacts: Array<{ kind: string; readiness: string }> } | undefined }, hasG0Run: boolean): 'loading' | 'run' | 'historian' {
  if (hasG0Run && g0.isLoading) return 'loading';
  const complete = g0.data?.artifacts.some(a => a.kind === 'role_qualification' && a.readiness === 'COMPLETE');
  return complete ? 'run' : 'historian';
}

export const HistorianLanes: React.FC<{
  loopId: string;
  fromMs: number;
  toMs: number;
  timeZone: string;
  timeFmt: (ms: number) => string;
  /** The G11 health lane is the run's own evidence and rides along unchanged. */
  healthLane: React.ReactNode;
}> = ({ loopId, fromMs, toMs, timeZone, timeFmt, healthLane }) => {
  const series = loopSeries(loopId);
  const from = useMemo(() => new Date(fromMs), [fromMs]);
  const to = useMemo(() => new Date(toMs), [toMs]);
  const trend = useCpmTrend(series, from, to, 1000, 'pv,sp,op,vp');
  const modes = useCpmModeTrack(series, from, to, 400);
  const points = trend.data?.points ?? [];
  const eu = useMemo(() => [trendRoleSeries(points, 'pv', 'EU', timeFmt), trendRoleSeries(points, 'sp', 'EU', timeFmt)].filter((s): s is CpmSeries => !!s), [points, timeFmt]);
  const pp = useMemo(() => [trendRoleSeries(points, 'op', 'pp', timeFmt), trendRoleSeries(points, 'vp', 'pp', timeFmt)].filter((s): s is CpmSeries => !!s), [points, timeFmt]);
  const modeIntervals = useMemo(() => modeIntervalsFromTrend(modes.data?.points ?? [], toMs), [modes.data, toMs]);

  if (trend.isLoading) return <div className="cpm-context-lanes" aria-busy><p className="cpm-copy">Fetching the historian slice for this window…</p></div>;
  if (trend.error) return <QueryError title="Historian slice unavailable" error={trend.error} />;
  return (
    <div className="cpm-context-lanes">
      {eu.length > 0
        ? <CpmChart title={`PV / SP — ${SOURCE_TAG}`} series={eu} xKind="time" timeZone={timeZone} height={200} />
        : <p className="cpm-copy" data-lane="PV/SP">PV / SP lane: no historian samples for this window at {series}.</p>}
      {pp.length > 0
        ? <CpmChart title={`OP / VP — ${SOURCE_TAG}`} series={pp} xKind="time" timeZone={timeZone} height={160} />
        : <p className="cpm-copy" data-lane="OP/VP">OP / VP lane: no historian samples for this window.</p>}
      <IntervalLane title={`MODE — ${SOURCE_TAG}`} intervals={modeIntervals} fromMs={fromMs} toMs={toMs} timeZone={timeZone}
        empty={modes.isLoading ? 'fetching the mode track…' : 'no mode samples in the historian for this window'} />
      {healthLane}
    </div>
  );
};
