'use client';

/**
 * CPLM Phase 7 — U1 Overview.
 * CPA-prototype IA parity: KPI row, live pipeline panel, priority queue,
 * loop-focus panel with an 8-hour envelope trend, focused-loop drawer with the
 * real evidence path, insight card, and event trail. The prototype's fabricated
 * live numbers (events/s, watermark lag) are replaced by what we can actually
 * measure — job states — with the rest stated as unavailable rather than faked.
 */
import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, KpiTile, KvRow, PanelHead, TonePill, WorkspaceHeader, toneFor, fmtDateTime, QueryError } from './shared';
import { PlantScopeFilter, useCpmScope } from './plantScope';
import { useCpmEvents, useFleetRankings, useFleetSummary } from '../../hooks/useCpm';
import GoodErrorBar from './overview/GoodErrorBar';
import PipelinePanel from './overview/PipelinePanel';
import LoopFocus from './overview/LoopFocus';
import FocusedLoopDrawer from './overview/FocusedLoopDrawer';

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

  // Position in the ranked queue, so the drawer's prev/next walk it in order.
  const drawerIndex = drawerLoop
    ? loops.findIndex(l => l.loopId === drawerLoop) : -1;

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
        <KpiTile caption="Loops monitored"
          tone={summary.data && summary.data.loops.monitored === 0 ? 'warn' : 'good'}
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
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setParams(p => { p.set('loop', l.loopId); return p; }, { replace: true });
                }
              }}>
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
          <PanelHead eyebrow="Highest-confidence finding" title={
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
          {events.isLoading && <EmptyState title="Loading events…" />}
          {!events.isLoading && !events.isError && (events.data?.events ?? []).length === 0 && (
            <EmptyState title="No recent events" />
          )}
          {(events.data?.events ?? []).map(e => (
            <KvRow key={e.id} label={fmtDateTime(e.opened_at)}>
              {e.loop_id} · {e.peak_diagnosis.replace(/_/g, ' ')}
            </KvRow>
          ))}
        </section>
      </div>

      {drawerLoop && (
        <FocusedLoopDrawer
          loopId={drawerLoop}
          onClose={() => setDrawerLoop(null)}
          onPrev={drawerIndex > 0 ? () => setDrawerLoop(loops[drawerIndex - 1].loopId) : undefined}
          onNext={drawerIndex >= 0 && drawerIndex < loops.length - 1
            ? () => setDrawerLoop(loops[drawerIndex + 1].loopId) : undefined}
          onExplore={() => { setDrawerLoop(null); navigate(`/cpm/performance?loop=${encodeURIComponent(drawerLoop)}`); }} />
      )}
    </div>
  );
};

export default CpmOverview;
