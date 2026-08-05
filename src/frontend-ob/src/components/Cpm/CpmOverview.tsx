'use client';

/**
 * CPLM Phase 7 — U1 Overview.
 * CPA-prototype IA parity: KPI row, live pipeline panel, priority queue,
 * loop-focus panel with an 8-hour envelope trend, focused-loop drawer with the
 * real evidence path, insight card, and event trail. The prototype's fabricated
 * live numbers (events/s, watermark lag) are replaced by what we can actually
 * measure — job states — with the rest stated as unavailable rather than faked.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, KpiTile, KvRow, PanelHead, TonePill, WorkspaceHeader, toneFor,
} from './shared';
import {
  useCpmEvents, useCpmPipelineStatus, useCpmTrend, useFleetRankings,
  useFleetSummary, useLatestGates,
} from '../../hooks/useCpm';
import { useLoopLive, qualityLabel } from '../../hooks/useLoopLive';

/** echarts renders to canvas and cannot consume var(); resolve tokens once per render. */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—';

export const CpmOverview: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [drawerLoop, setDrawerLoop] = useState<string | null>(null);

  const summary = useFleetSummary();
  const rankings = useFleetRankings();
  const events = useCpmEvents({ openOnly: false, limit: 3 }, 60_000);

  const loops = rankings.data?.loops ?? [];
  const selectedId = params.get('loop') ?? loops[0]?.loopId;
  const selected = loops.find(l => l.loopId === selectedId) ?? loops[0];

  const evaluated = loops.filter(l => l.diagnosis !== 'NOT_EVALUATED');
  const needAttention = evaluated.filter(l => toneFor(l.diagnosis) !== 'good').length;
  const topFinding = evaluated[0];

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Live operating view"
        title="Operations overview"
        copy="Control performance across the plant, prioritised by operational impact."
      />

      <div className="cpm-kpi-row">
        <KpiTile caption="Loops monitored" tone="good"
          value={summary.data ? `${summary.data.loops.monitored}` : '…'}
          sub={summary.data ? `of ${summary.data.loops.total} registered` : undefined} />
        <KpiTile caption="Need attention" tone={needAttention > 0 ? 'warn' : 'good'}
          value={needAttention}
          sub={`${evaluated.length} loop(s) evaluated`} />
        <KpiTile caption="Confidence-capped (no VP)" tone={summary.data && summary.data.capability.loopsCappedByMissingVp > 0 ? 'warn' : 'good'}
          value={summary.data?.capability.loopsCappedByMissingVp ?? '…'}
          sub="cannot reach CONFIRMED" />
        <KpiTile caption="Without disturbance context" tone={summary.data && summary.data.capability.loopsWithoutDisturbanceContext > 0 ? 'warn' : 'good'}
          value={summary.data?.capability.loopsWithoutDisturbanceContext ?? '…'}
          sub="no peer links (G13)" />
      </div>

      <PipelinePanel />

      <div className="cpm-grid-2">
        <section className="cpm-surface">
          <PanelHead eyebrow="Priority queue" title="Loops requiring review"
            right={<ObcButton variant="normal" onClick={() => navigate('/cpm/performance')}>View all ›</ObcButton>} />
          {rankings.isLoading && <EmptyState title="Loading…" />}
          {!rankings.isLoading && loops.length === 0 && (
            <EmptyState title="No monitored loops"
              copy="Onboard loops in the Loop Registry to populate this queue."
              action={{ label: 'Open Loop Registry', onClick: () => navigate('/cpm/registry') }} />
          )}
          {loops.slice(0, 6).map(l => (
            <div key={l.loopId}
              className={`cpm-event-row${selected?.loopId === l.loopId ? ' cpm-event-row--selected' : ''}`}
              style={{ gridTemplateColumns: '1.4fr 0.8fr 1fr' }}
              onClick={() => setParams(p => { p.set('loop', l.loopId); return p; })}
              role="button" tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter') setParams(p => { p.set('loop', l.loopId); return p; }); }}>
              <span>
                <span className="cpm-event-row__title">{l.loopId}</span>
                <div className="cpm-event-row__sub">{l.displayName} · {l.area ?? l.site}</div>
              </span>
              <span className="cpm-event-row__sub">
                {l.confidence != null ? `${(l.confidence * 100).toFixed(0)}% conf` : '—'}
              </span>
              <TonePill tone={toneFor(l.diagnosis)}>{l.diagnosis.replace(/_/g, ' ')}</TonePill>
            </div>
          ))}
        </section>

        {selected
          ? <LoopFocus loopId={selected.loopId} displayName={selected.displayName}
              onOpenAnalysis={() => setDrawerLoop(selected.loopId)} />
          : <section className="cpm-surface"><EmptyState title="Select a loop" /></section>}
      </div>

      <div className="cpm-grid-2">
        <section className="cpm-surface">
          <PanelHead eyebrow="Highest-impact finding" title={
            topFinding
              ? `${topFinding.diagnosis.replace(/_/g, ' ')} on ${topFinding.loopId}`
              : 'No evaluated findings yet'} />
          {topFinding ? (
            <>
              <p className="cpm-copy">
                The fused evidence points to {topFinding.diagnosis.replace(/_/g, ' ').toLowerCase()} on{' '}
                {topFinding.loopId} ({topFinding.displayName}) at{' '}
                {topFinding.confidence != null ? `${(topFinding.confidence * 100).toFixed(0)}%` : 'unknown'} confidence.
              </p>
              <ObcButton variant="raised" onClick={() => setDrawerLoop(topFinding.loopId)}>
                Review evidence ›
              </ObcButton>
            </>
          ) : (
            <p className="cpm-copy">Verdicts appear once a loop accumulates a 12h window of samples.</p>
          )}
        </section>

        <section className="cpm-surface">
          <PanelHead eyebrow="Recent context" title="Event trail"
            right={<ObcButton variant="normal" onClick={() => navigate('/cpm/events')}>All events ›</ObcButton>} />
          {(events.data?.events ?? []).length === 0 && <EmptyState title="No recent events" />}
          {(events.data?.events ?? []).map(e => (
            <KvRow key={e.id} label={new Date(e.opened_at).toLocaleString()}>
              {e.loop_id} · {e.peak_diagnosis.replace(/_/g, ' ')}
            </KvRow>
          ))}
        </section>
      </div>

      {drawerLoop && (
        <FocusedLoopDrawer loopId={drawerLoop} onClose={() => setDrawerLoop(null)}
          onExplore={() => { setDrawerLoop(null); navigate(`/cpm/performance?loop=${encodeURIComponent(drawerLoop)}`); }} />
      )}
    </div>
  );
};

// ── live pipeline panel ────────────────────────────────────────────────────

const WINDOW_ROWS = [
  { label: 'Immediate quality', kind: '1 min tumbling', output: 'G0–G4 short result' },
  { label: 'Moving behaviour', kind: '5 min / 1 min slide', output: 'Tracking & effort features' },
  { label: 'Loop diagnosis', kind: '4h/12h/24h slices · 15 min cadence', output: 'Oscillation / stiction evidence' },
  { label: 'Fused verdict', kind: 'fires on 12h & 24h records', output: 'G0–G15 diagnosis' },
];

const PipelinePanel: React.FC = () => {
  const pipeline = useCpmPipelineStatus();
  const jobs = pipeline.data?.jobs ?? [];
  const cplmJobs = jobs.filter(j => j.role === 'cplm');

  return (
    <section className="cpm-surface">
      <PanelHead
        eyebrow="Live Flink runtime"
        title="How the current result is being produced"
        right={pipeline.data
          ? <TonePill tone={pipeline.data.cplmRunning ? 'good' : 'bad'}>
              {pipeline.data.cplmRunning ? 'CPLM PIPELINE RUNNING' : 'CPLM PIPELINE DEGRADED'}
            </TonePill>
          : <TonePill tone="muted">CHECKING…</TonePill>}
      />
      <p className="cpm-copy">
        A continuously running event-time pipeline — there is no report schedule or “run” button.
        Watermark and throughput metrics await the Flink metrics proxy; job states below are live.
      </p>
      <div className="cpm-kpi-row" style={{ margin: '12px 0' }}>
        {cplmJobs.map(j => (
          <KpiTile key={j.name} caption={j.name.replace('AMS - ', '')}
            tone={j.running ? 'good' : 'bad'}
            value={j.state} />
        ))}
      </div>
      <div className="cpm-window-rows">
        {WINDOW_ROWS.map(w => (
          <div key={w.label} className="cpm-window-row">
            <strong>{w.label}</strong>
            <span className="cpm-event-row__sub">{w.kind}</span>
            <span className="cpm-event-row__sub">→ {w.output}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

// ── loop focus panel (signal row + envelope trend) ─────────────────────────

const LoopFocus: React.FC<{
  loopId: string;
  displayName: string;
  onOpenAnalysis: () => void;
}> = ({ loopId, displayName, onOpenAnalysis }) => {
  // The historian device for a loop follows the Phase 3 convention.
  const series = `root.site1.cpm.${loopId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const { start, end } = useMemo(() => {
    const now = new Date();
    return { start: new Date(now.getTime() - 8 * 3600_000), end: now };
  }, [loopId]); // eslint-disable-line react-hooks/exhaustive-deps -- window anchors when the loop changes

  const trend = useCpmTrend(series, start, end, 240);
  const points = useMemo(() => trend.data?.points ?? [], [trend.data]);
  // F0.5 — live plane: RBE deltas + snapshot-on-open for this loop's device.
  const live = useLoopLive(loopId);
  const q = qualityLabel(live.quality ?? live.pv);
  const fmtLive = (m: { value: number | string | boolean } | undefined, digits = 1) =>
    m == null ? '—' : typeof m.value === 'number' ? m.value.toFixed(digits) : String(m.value);

  const option = useMemo(() => {
    const good = cssVar('--instrument-enhanced-secondary-color', '#41be95');
    const amber = cssVar('--alert-caution-color', '#d79a40');
    const grey = cssVar('--on-container-neutral-color', '#9aa6af');
    const ts = points.map(p => p.ts);
    const num = (v: unknown) => (typeof v === 'number' ? v : null);
    return {
      animation: false,
      grid: { left: 42, right: 12, top: 18, bottom: 24 },
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
  }, [points]);

  return (
    <section className="cpm-surface">
      <PanelHead eyebrow={displayName} title={loopId}
        right={<ObcButton variant="raised" onClick={onOpenAnalysis}>Open analysis →</ObcButton>} />
      <div className="cpm-filter-row" style={{ marginBottom: 8 }}>
        {/* Live signal row (F0.5): RBE means "no update" ≠ 0 — absent renders as —. */}
        <TonePill tone="good">PV {fmtLive(live.pv)}</TonePill>
        <TonePill tone="muted">SP {fmtLive(live.sp)}</TonePill>
        <TonePill tone="warn">OP {fmtLive(live.op)}</TonePill>
        <TonePill tone="muted">MODE {fmtLive(live.mode)}</TonePill>
        <TonePill tone={q.tone}>{q.label}</TonePill>
        <span className="cpm-filter-count">
          {live.hasData && live.lastTs
            ? `live · last change ${new Date(live.lastTs).toLocaleTimeString()}`
            : 'no live publisher for this loop'}
          {' · '}8 h envelope trend below
        </span>
      </div>
      {trend.isLoading && <EmptyState title="Loading trend…" />}
      {!trend.isLoading && points.length === 0 && (
        <EmptyState title="No historian data for this loop"
          copy={`No samples stored at ${series} in the last 8 hours.`} />
      )}
      {points.length > 0 && (
        <ReactECharts option={option} style={{ height: 260 }} notMerge />
      )}
    </section>
  );
};

// ── focused-loop drawer (real evidence path) ───────────────────────────────

const FocusedLoopDrawer: React.FC<{
  loopId: string;
  onClose: () => void;
  onExplore: () => void;
}> = ({ loopId, onClose, onExplore }) => {
  const { data: matrix, isLoading } = useLatestGates(loopId, '24h');
  return (
    <>
      <div className="cpm-modal-backdrop" onClick={onClose} />
      <div className="cpm-drawer" role="dialog" aria-label="Focused loop analysis">
        <PanelHead eyebrow="Focused loop analysis" title={loopId}
          right={<ObcButton variant="normal" onClick={onClose}>Close</ObcButton>} />
        {isLoading && <EmptyState title="Loading latest verdict…" />}
        {!isLoading && !matrix && (
          <EmptyState title="No fused verdict yet"
            copy="This loop has not completed a 12h/24h evaluation window." />
        )}
        {matrix && (
          <>
            <div className={`cpm-kpi cpm-kpi--${toneFor(matrix.diagnosis)}`} style={{ margin: '12px 0' }}>
              <span className="cpm-kpi__caption">Primary diagnosis</span>
              <span className="cpm-kpi__value">{(matrix.diagnosis ?? 'NONE').replace(/_/g, ' ')}</span>
              <span className="cpm-kpi__sub">
                {matrix.confidence != null ? `${(matrix.confidence * 100).toFixed(0)}% confidence · ` : ''}
                {matrix.windowKind} window ending {fmtTime(matrix.windowEnd)}
              </span>
            </div>
            <PanelHead eyebrow="Evidence path" title="Gate statuses on this window" />
            {matrix.gates.map(g => (
              <KvRow key={g.key} label={`${g.key} ${g.name}`}>
                <TonePill tone={toneFor(g.status)}>{g.status.replace(/_/g, ' ')}</TonePill>
              </KvRow>
            ))}
            {matrix.insufficientEvidenceReason && (
              <p className="cpm-copy" style={{ marginTop: 8 }}>
                {matrix.insufficientEvidenceReason}
              </p>
            )}
          </>
        )}
        <div style={{ marginTop: 16 }}>
          <ObcButton variant="raised" onClick={onExplore}>Continue in Performance →</ObcButton>
        </div>
      </div>
    </>
  );
};

export default CpmOverview;
