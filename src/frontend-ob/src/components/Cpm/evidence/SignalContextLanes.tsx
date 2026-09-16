/**
 * v2.5 Task 2E.3 (spec §3.2 centre column): the signal context of the SAME window - PV / SP pane
 * (EU), OP / VP pane (pp), mode lane, health lane - drawn from the sibling G0 / G1 / G11 runs'
 * artifacts (the row's method_run_ids). Held samples step; excluded samples are visible as gaps;
 * nothing here is re-derived. When a sibling's evidence is not retained the lane says so.
 */
import React, { useMemo } from 'react';
import type { EvidenceManifest } from '../../../api/cpm/evidence';
import { CpmChart, type CpmSeries } from './CpmChart';
import { labelsOf, type DecodedArtifact } from './artifactCodec';
import { useArtifact, useEvidenceManifest } from './useEvidence';
import { IntervalLane, type LaneInterval } from './views/primitives/IntervalLane';
import type { CpmTone } from '../shared';

const ROLE_PENS = { PV: 'good', SP: 'grey', OP: 'amber', VP: 'pink' } as const;

/** One G0 role artifact as a chart series: excluded samples become gaps, held values step, the tooltip states quality / hold / times. */
export function roleSeries(d: DecodedArtifact, role: 'PV' | 'SP' | 'OP' | 'VP', timeFmt: (ms: number) => string): CpmSeries {
  const quality = labelsOf(d, 'quality_normalized');
  const hold = labelsOf(d, 'hold_kind');
  const excl = labelsOf(d, 'exclusion_reason');
  const y: Array<number | null> = Array.from(d.columns.y, (v, i) => (d.mask ? d.mask[i] : true) ? v : null);
  const heldAny = hold.some(h => h !== 'NONE');
  return {
    id: role.toLowerCase(), label: role, unit: d.units.y ?? (role === 'OP' || role === 'VP' ? 'pp' : 'EU'), x: d.columns.x, y,
    pen: ROLE_PENS[role], held: heldAny,
    meta: i => [
      `quality ${quality[i] ?? '—'} · hold ${hold[i] ?? '—'}${excl[i] && excl[i] !== 'NONE' ? ` · excluded: ${excl[i]}` : ''}`,
      `sample ${timeFmt(d.columns.x[i])} · verified ${d.columns.verified_time ? timeFmt(d.columns.verified_time[i]) : '—'}`,
    ],
  };
}

export function intervalsFromArtifact(d: DecodedArtifact, labelColumn: string, toneOf: (label: string) => CpmTone): LaneInterval[] {
  const labels = labelsOf(d, labelColumn);
  const out: LaneInterval[] = [];
  for (let i = 0; i < d.n; i++) {
    const start = d.columns.x[i];
    const dur = d.columns.y[i];
    if (!Number.isFinite(start) || !Number.isFinite(dur)) continue;
    out.push({ startMs: start, endMs: start + dur * 1000, label: labels[i] ?? '—', tone: toneOf(labels[i] ?? '') });
  }
  return out;
}

const RoleArtifact: React.FC<{ manifest: EvidenceManifest | undefined; role: 'PV' | 'SP' | 'OP' | 'VP'; onSeries: (role: string, s: CpmSeries | null) => void; timeFmt: (ms: number) => string }> =
  ({ manifest, role, onSeries, timeFmt }) => {
    const meta = manifest?.artifacts.find(a => a.kind === 'role_qualification' && a.roleOrPath === role);
    const art = useArtifact(meta);
    React.useEffect(() => { onSeries(role, art.data ? roleSeries(art.data, role, timeFmt) : null); }, [art.data, role, onSeries, timeFmt]);
    return null;
  };

export const SignalContextLanes: React.FC<{
  methodRunIds: Record<string, string>;
  fromMs: number;
  toMs: number;
  timeZone: string;
  timeFmt: (ms: number) => string;
}> = ({ methodRunIds, fromMs, toMs, timeZone, timeFmt }) => {
  const g0 = useEvidenceManifest(methodRunIds.G0);
  const g1 = useEvidenceManifest(methodRunIds.G1);
  const g11 = useEvidenceManifest(methodRunIds.G11);
  const [series, setSeries] = React.useState<Record<string, CpmSeries | null>>({});
  const onSeries = React.useCallback((role: string, s: CpmSeries | null) => setSeries(prev => (prev[role] === s ? prev : { ...prev, [role]: s })), []);
  const stateMeta = g1.data?.artifacts.find(a => a.kind === 'state_intervals');
  const states = useArtifact(stateMeta);
  const healthMeta = g11.data?.artifacts.find(a => a.kind === 'eligibility_intervals');
  const health = useArtifact(healthMeta);

  const euSeries = useMemo(() => [series.PV, series.SP].filter((s): s is CpmSeries => !!s), [series]);
  const ppSeries = useMemo(() => [series.OP, series.VP].filter((s): s is CpmSeries => !!s), [series]);
  const modeIntervals = useMemo(() => states.data ? intervalsFromArtifact(states.data, 'state', l => (l === 'AUT' || l === 'CAS' ? 'good' : l === 'MAN' ? 'warn' : 'muted')) : [], [states.data]);
  const healthIntervals = useMemo(() => health.data ? intervalsFromArtifact(health.data, 'eligibility', l => (l === 'ELIGIBLE' ? 'good' : l === 'LIMITED' ? 'warn' : l === 'INELIGIBLE' ? 'bad' : 'muted')) : [], [health.data]);
  const g0Readiness = g0.data?.readiness;

  return (
    <div className="cpm-context-lanes">
      {(['PV', 'SP', 'OP', 'VP'] as const).map(r => <RoleArtifact key={r} manifest={g0.data} role={r} onSeries={onSeries} timeFmt={timeFmt} />)}
      {euSeries.length > 0
        ? <CpmChart title="PV / SP" series={euSeries} xKind="time" timeZone={timeZone} height={200} />
        : <p className="cpm-copy" data-lane="PV/SP">PV / SP lane: {methodRunIds.G0 ? `G0 evidence ${g0Readiness ?? 'loading'} for this window` : 'no G0 run on this row'}.</p>}
      {ppSeries.length > 0
        ? <CpmChart title="OP / VP" series={ppSeries} xKind="time" timeZone={timeZone} height={160} />
        : <p className="cpm-copy" data-lane="OP/VP">OP / VP lane: {methodRunIds.G0 ? `G0 evidence ${g0Readiness ?? 'loading'}` : 'no G0 run on this row'}.</p>}
      <IntervalLane title="MODE" intervals={modeIntervals} fromMs={fromMs} toMs={toMs} timeZone={timeZone}
        empty={methodRunIds.G1 ? `G1 state intervals ${g1.data?.readiness ?? 'loading'}` : 'no G1 run on this row'} />
      <IntervalLane title="HEALTH" intervals={healthIntervals} fromMs={fromMs} toMs={toMs} timeZone={timeZone}
        empty={methodRunIds.G11 ? `G11 eligibility intervals ${g11.data?.readiness ?? 'loading'} — absence of health is not OK` : 'no G11 run on this row — health not configured'} />
    </div>
  );
};
