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
  fmtDateTime, fmtDuration, fmtWindowLateness, fmtWindowShape, QueryError, cpmChartColors,
  useRollingWindow, windowSpecsOf, TREND_SPAN_MS, TREND_TICK_MS } from './shared';
import { PlantScopeFilter, useCpmScope } from './plantScope';
import {
  useCpmEvents, useCpmPipelineStatus, useCpmResolutions, useCpmTrend, useFleetRankings,
  useFleetSummary, useLatestGates,
} from '../../hooks/useCpm';
import { useLoopLive, qualityLabel } from '../../hooks/useLoopLive';
import { ApiError } from '../../api/apiFetch';
import { loopSeries } from '../../utils/loopSeries';
import { useObcTheme } from '../../hooks/useObcTheme';
import { useDialogA11y } from '../../hooks/useDialogA11y';

/** echarts renders to canvas and cannot consume var(); resolve tokens once per render. */
const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—';

/**
 * Compact good-error% micro-bar for a priority-queue row (data already in the
 * rankings payload — no new endpoint). Good-error% is share of samples inside the
 * acceptable band (higher = better); MAE is the fallback text when % is absent.
 */
const GoodErrorBar: React.FC<{ pct: number | null; mae: number | null }> = ({ pct, mae }) => {
  if (pct == null && mae == null) return null;
  if (pct == null) {
    return <div className="cpm-event-row__sub" style={{ fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>MAE {mae!.toFixed(2)}</div>;
  }
  // goodErrorPct is a 0..1 FRACTION despite the name (see CpmRankedLoop.metrics).
  // This component consumed it as if it were already 0..100, so a healthy loop at
  // 0.88 drew a 0.88%-wide bar labelled "good 1%" — and since the thresholds
  // below are 80/50, EVERY loop in the priority queue rendered red.
  const scaled = pct * 100;
  const clamped = Math.max(0, Math.min(100, scaled));
  const color = scaled >= 80 ? 'var(--alert-running-color)' : scaled >= 50 ? 'var(--alert-caution-color)' : 'var(--alert-alarm-color)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, maxWidth: 220 }}
      title={`Good-error ${scaled.toFixed(0)}%${mae != null ? ` · MAE ${mae.toFixed(2)}` : ''}`}>
      <span style={{ position: 'relative', flex: 1, height: 4, borderRadius: 2, background: 'var(--container-section-color)', overflow: 'hidden', minWidth: 48 }}>
        <span style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${clamped}%`, background: color, borderRadius: 2 }} />
      </span>
      <span className="cpm-event-row__sub" style={{ fontVariantNumeric: 'tabular-nums', minWidth: 46, textAlign: 'right' }}>
        good {scaled.toFixed(0)}%
      </span>
    </div>
  );
};

export const CpmOverview: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [drawerLoop, setDrawerLoop] = useState<string | null>(null);

  // Plant scope (A6.2): a unit operator's priority queue should show their
  // unit, not the whole plant.
  const scope = useCpmScope();
  const summary = useFleetSummary(scope.params);
  const rankings = useFleetRankings(scope.params);
  // sort:'recent' — the panel below is titled "Recent context" and stamps each row
  // with opened_at, but the endpoint's default order is triage (open first, then
  // peak confidence), so with limit:3 it was showing the three HIGHEST-CONFIDENCE
  // frames as though they were the three latest.
  const events = useCpmEvents({ openOnly: false, limit: 3, sort: 'recent' }, 60_000);

  const loops = rankings.data?.loops ?? [];
  // Case-insensitive, like every loop lookup in cplm-api; and a ?loop= that names
  // nothing must not silently show a different loop's data under that URL.
  const requestedId = params.get('loop');
  const selected = requestedId
    ? loops.find(l => l.loopId.toLowerCase() === requestedId.toLowerCase())
    : loops[0];
  const missingLoop = !!requestedId && !selected
    && !rankings.isLoading && !rankings.isError && loops.length > 0;

  const evaluated = loops.filter(l => l.diagnosis !== 'NOT_EVALUATED');
  const topFinding = evaluated[0];

  // Counted from the fleet summary, NOT from `loops`. The rankings call is capped
  // (limit=50, server clamps at 200), so deriving these from it produced a count
  // over an arbitrary top-50 slice displayed beside a genuine fleet-wide
  // "of N registered" — silently understating a plant with more than 50 loops.
  // summary.diagnoses is one row per loop (DISTINCT ON loop_id) with no cap.
  const fleetDiagnoses = summary.data?.diagnoses ?? [];
  const fleetEvaluated = fleetDiagnoses.reduce((n, d) => n + d.count, 0);
  const needAttention = fleetDiagnoses
    .filter(d => toneFor(d.diagnosis) !== 'good')
    .reduce((n, d) => n + d.count, 0);

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Live operating view"
        title="Operations overview"
        copy="Control performance across the plant, prioritised by operational impact."
      />
      <PlantScopeFilter scope={scope} summary={summary.data ? `${summary.data.loops.total} loop(s) in scope` : null} />

      <div className="cpm-kpi-row">
        <KpiTile caption="Loops monitored" tone="good"
          value={summary.data ? `${summary.data.loops.monitored}` : '…'}
          sub={summary.data ? `of ${summary.data.loops.total} registered` : undefined} />
        <KpiTile caption="Need attention" tone={needAttention > 0 ? 'warn' : 'good'}
          value={summary.data ? needAttention : '…'}
          sub={summary.data ? `${fleetEvaluated} loop(s) evaluated` : undefined} />
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
          {rankings.isError && <QueryError title="Rankings unavailable" error={rankings.error} retry={() => void rankings.refetch()} />}
          {!rankings.isLoading && !rankings.isError && loops.length === 0 && (
            <EmptyState title="No monitored loops"
              copy="Onboard loops in the Loop Registry to populate this queue."
              action={{ label: 'Open Loop Registry', onClick: () => navigate('/cpm/registry') }} />
          )}
          {loops.slice(0, 6).map(l => (
            <div key={l.loopId}
              className={`cpm-event-row${selected?.loopId === l.loopId ? ' cpm-event-row--selected' : ''}`}
              style={{ gridTemplateColumns: '1.4fr 0.8fr 1fr' }}
              // replace: picking a row is in-page selection, not a page visit.
              onClick={() => setParams(p => { p.set('loop', l.loopId); return p; }, { replace: true })}
              role="button" tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter') setParams(p => { p.set('loop', l.loopId); return p; }, { replace: true }); }}>
              <span>
                <span className="cpm-event-row__title">{l.loopId}</span>
                <div className="cpm-event-row__sub">{l.displayName} · {l.area ?? l.site}</div>
                <GoodErrorBar pct={l.metrics.goodErrorPct} mae={l.metrics.mae} />
              </span>
              <span className="cpm-event-row__sub">
                {l.confidence != null ? `${(l.confidence * 100).toFixed(0)}% conf` : '—'}
              </span>
              <TonePill tone={toneFor(l.diagnosis)}>{l.diagnosis.replace(/_/g, ' ')}</TonePill>
            </div>
          ))}
        </section>

        {selected ? (
          <LoopFocus loopId={selected.loopId} displayName={selected.displayName}
            onOpenAnalysis={() => setDrawerLoop(selected.loopId)} />
        ) : missingLoop ? (
          <section className="cpm-surface">
            <EmptyState
              title={`Loop "${requestedId}" is not in the ranking`}
              copy="It may be unmonitored, not yet evaluated, or no longer registered. Pick a loop from the priority queue, or search the full list in Performance."
              action={{ label: 'Open Performance', onClick: () => navigate('/cpm/performance') }} />
          </section>
        ) : (
          <section className="cpm-surface"><EmptyState title="Select a loop" /></section>
        )}
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
          {events.isError && (
            <QueryError title="Event trail unavailable"
              error={events.error} retry={() => void events.refetch()} />
          )}
          {!events.isError && (events.data?.events ?? []).length === 0 && <EmptyState title="No recent events" />}
          {(events.data?.events ?? []).map(e => (
            <KvRow key={e.id} label={fmtDateTime(e.opened_at)}>
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

/**
 * Position of a window size on the ladder's shared axis. Log-scaled because the
 * tiers span 1 minute to 24 hours: on a linear axis every short window would be an
 * invisible sliver against 24h, which is the opposite of showing the range.
 */
const LADDER_MIN_MS = 60_000;
const LADDER_MAX_MS = 24 * 3_600_000;
const spanPct = (ms: number): number => {
  if (!(ms > 0)) return 0;
  const clamped = Math.min(Math.max(ms, LADDER_MIN_MS), LADDER_MAX_MS);
  const pct = (Math.log(clamped / LADDER_MIN_MS) / Math.log(LADDER_MAX_MS / LADDER_MIN_MS)) * 100;
  return Math.max(3, Math.min(100, pct)); // floor so the 1m bar is still visible
};

/** Human tier titles; anything unexpected from the API falls back to its own key. */
const TIER_TITLES: Record<string, string> = {
  short: 'Short features · G0–G4',
  long: 'Long diagnostics · G5–G11',
};

const PipelinePanel: React.FC = () => {
  const pipeline = useCpmPipelineStatus();
  const jobs = pipeline.data?.jobs ?? [];
  const cplmJobs = jobs.filter(j => j.role === 'cplm');
  // The ladder was four hardcoded rows that named ONE of the five sliding short
  // windows ("5 min / 1 min slide") and omitted 10m/2m, 15m/5m, 30m/5m, 60m/5m —
  // so it read as though the short tier had two windows when it has six, all six
  // of which produce stored rows. It now renders the served contract.
  const resolutions = useCpmResolutions();
  // Names-only fallback if the API predates the contract, so the ladder still
  // lists every window kind instead of collapsing to nothing.
  const windows = windowSpecsOf(resolutions.data, () => 0);
  const fusion = resolutions.data?.fusion;

  // Group by tier and hoist whatever every row in the tier shares into its head.
  // Computed, not hardcoded: if the server later gives 12h a different cadence,
  // the caption drops back onto the rows instead of quietly becoming wrong.
  const tiers = useMemo(() => {
    const order = ['short', 'long'];
    const keys = [...new Set(windows.map(w => w.tier))]
      .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    return keys.map(key => {
      const rows = windows.filter(w => w.tier === key);
      const uniq = <T,>(vals: T[]) => [...new Set(vals)];
      const feeds = uniq(rows.map(r => r.feeds).filter(Boolean));
      const cadences = uniq(rows.map(r => r.cadenceMs).filter((v): v is number => v != null));
      const minSamples = uniq(rows.map(r => r.minSamples).filter((v): v is number => v != null));
      // What got hoisted, so the rows can suppress exactly those facts.
      const hoisted = {
        cadence: cadences.length === 1 && rows.every(r => r.cadenceMs != null),
        minSamples: minSamples.length === 1 && rows.every(r => r.minSamples != null),
      };
      const shared = [
        hoisted.cadence ? `${fmtDuration(cadences[0])} cadence` : null,
        hoisted.minSamples ? `needs ≥ ${minSamples[0]} samples` : null,
        feeds.length === 1 ? `→ ${feeds[0]}` : null,
      ].filter(Boolean).join(' · ');
      return { key, title: TIER_TITLES[key] ?? key, rows, shared, hoisted };
    });
  }, [windows]);

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
      {/* The old copy said these metrics "await the Flink metrics proxy". The proxy
          shipped (/pipeline-metrics) and deliberately reports watermark lag,
          events/s and backpressure as unavailable rather than estimating them — so
          the promise was of something that had been decided against. */}
      <p className="cpm-copy">
        A continuously running event-time pipeline — there is no report schedule or “run” button.
        Job states below are live; checkpoint health is on Pipeline Health. Watermark lag,
        events/s and backpressure are not reported — Flink does not expose them cheaply per
        record, and an estimate would read as a measurement.
      </p>
      <div className="cpm-kpi-row" style={{ margin: '12px 0' }}>
        {cplmJobs.map(j => (
          <KpiTile key={j.name} caption={j.name.replace('AMS - ', '')}
            tone={j.running ? 'good' : 'bad'}
            value={j.state} />
        ))}
      </div>
      {/* Reference material — collapsed by default so the live job states above
          stay the focus. */}
      <details className="cpm-window-disclosure">
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: 'var(--element-active-color)', padding: '4px 0' }}>
          How the analysis windows work
        </summary>
        <div className="cpm-window-rows" style={{ marginTop: 8 }}>
          {resolutions.isError && (
            <QueryError title="Window contract unavailable"
              error={resolutions.error} retry={() => void resolutions.refetch()} />
          )}
          {tiers.map(tier => (
            <div key={tier.key} className="cpm-window-tier">
              <div className="cpm-window-tier__head">
                <span className="cpm-eyebrow">{tier.title}</span>
                {/* Facts shared by every row in this tier, stated once instead of
                    repeated down the column. */}
                {tier.shared && <span className="cpm-event-row__sub">{tier.shared}</span>}
              </div>
              <div className="cpm-window-tier__rows">
                {tier.rows.map(w => {
                  // Anything hoisted into the tier head is suppressed here — the
                  // first cut printed cadence and the min-sample floor in BOTH
                  // places, which is the repetition the grouping existed to remove.
                  const shape = fmtWindowShape(w, { omitCadence: tier.hoisted.cadence });
                  const qualifier = w.allowedLatenessMs != null
                    ? `${fmtDuration(w.allowedLatenessMs)} allowed lateness`
                    : tier.hoisted.minSamples ? '' : fmtWindowLateness(w) ?? '';
                  return (
                    <div key={w.kind} className="cpm-window-lrow">
                      <strong className="cpm-window-lrow__kind">{w.kind}</strong>
                      <span className="cpm-window-scale" aria-hidden="true"
                        title={`${w.kind} span`}>
                        <span className="cpm-window-scale__fill"
                          style={{ width: `${spanPct(w.sizeMs)}%` }} />
                        {w.slideMs != null && (
                          <span className="cpm-window-scale__slide"
                            style={{ width: `${spanPct(w.slideMs)}%` }} />
                        )}
                      </span>
                      <span className="cpm-event-row__sub">
                        {shape || 'shape not reported by this API version'}
                        {/* Overlap belongs beside the shape that causes it, and
                            must not displace the lateness column. */}
                        {w.slideMs != null ? ` · ${fmtDuration(w.sizeMs - w.slideMs)} overlap` : ''}
                      </span>
                      <span className="cpm-event-row__sub">{qualifier}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {fusion && (
            <div className="cpm-window-tier">
              <div className="cpm-window-tier__head">
                <span className="cpm-eyebrow">Fused verdict · G12–G15</span>
                <span className="cpm-event-row__sub">{fusion.produces}</span>
              </div>
              <div className="cpm-window-tier__rows">
                <div className="cpm-window-lrow cpm-window-lrow--fusion">
                  <strong className="cpm-window-lrow__kind">fusion</strong>
                  <span className="cpm-window-scale" aria-hidden="true">
                    <span className="cpm-window-scale__fill" style={{ width: '100%' }} />
                  </span>
                  <span className="cpm-event-row__sub">
                    fires on {fusion.firesOn.join(' & ')} records
                  </span>
                  <span className="cpm-event-row__sub">no window of its own</span>
                </div>
              </div>
            </div>
          )}
        </div>
        {/* The min-sample floor is the usual answer to "why is there no verdict?",
            and no screen stated it before. */}
        {fusion && <p className="cpm-copy" style={{ marginTop: 8 }}>{fusion.note}</p>}
      </details>
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

// ── focused-loop drawer (real evidence path) ───────────────────────────────

const FocusedLoopDrawer: React.FC<{
  loopId: string;
  onClose: () => void;
  onExplore: () => void;
}> = ({ loopId, onClose, onExplore }) => {
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose);
  const gates = useLatestGates(loopId, '24h');
  const { data: matrix, isLoading } = gates;
  // 404 means "no fused window yet" — a real answer. Anything else is a failure
  // and must not be presented as an absence of evidence.
  const fetchFailed = gates.isError
    && !(gates.error instanceof ApiError && gates.error.status === 404);
  return (
    <>
      <div className="cpm-modal-backdrop" onClick={onClose} />
      <div ref={dialogRef} className="cpm-drawer" role="dialog" aria-modal="true" tabIndex={-1} aria-label="Focused loop analysis">
        <PanelHead eyebrow="Focused loop analysis" title={loopId}
          right={<ObcButton variant="normal" onClick={onClose}>Close</ObcButton>} />
        {isLoading && <EmptyState title="Loading latest verdict…" />}
        {fetchFailed && (
          <QueryError title="Verdict unavailable"
            error={gates.error} retry={() => void gates.refetch()} />
        )}
        {!isLoading && !matrix && !fetchFailed && (
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
