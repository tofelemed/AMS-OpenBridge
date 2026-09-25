'use client';

/**
 * CPLM Phase 7 — U1 Overview.
 * CPA-prototype IA parity: KPI row, priority queue, loop-focus panel with an
 * 8-hour envelope trend, focused-loop drawer with the real evidence path,
 * insight card, and event trail. The prototype's fabricated live numbers are
 * not reproduced; what cannot be measured is stated as unavailable.
 *
 * 2026-09-20 (docs/cpa-ui-fix-plan.md, Phase 1): the "Live Flink runtime"
 * panel left this screen — its job states live on Pipeline Health, and on a
 * triage surface it cost two requests plus a 15 s poll. Every loop named here
 * is now a route: queue rows and the event trail open the loop in the
 * Explorer, the drawer opens the loop or the fleet matrix, and the fleet exits
 * carry the operator's explicit ?loop= selection.
 */
import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, KpiTile, PanelHead, TonePill, WorkspaceHeader, toneFor, fmtDateTime, QueryError } from './shared';
import { PlantScopeFilter, useCpmScope } from './plantScope';
import { useCpmEvents, useFleetRankings, useFleetSummary } from '../../hooks/useCpm';
import GoodErrorBar from './overview/GoodErrorBar';
import { peersCopy, positionerCopy } from './overview/capabilityCopy';
import LoopFocus from './overview/LoopFocus';
import FocusedLoopDrawer from './overview/FocusedLoopDrawer';
import { eventsHref, explorerHref, performanceHref } from './cpaHref';

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
  // Unlike the toolbar-driven screens, `loops[0]` here is NOT arbitrary: this
  // list is the confidence-ordered ranking, so the default is the top finding —
  // the right focus for a triage surface. It is labelled below so it does not
  // read as the operator's own selection.
  const selected = requestedId
    ? loops.find(l => l.loopId.toLowerCase() === requestedId.toLowerCase())
    : loops[0];
  const showingTopRanked = !requestedId && !!selected;
  const missingLoop = !!requestedId && !selected
    && !rankings.isLoading && !rankings.isError && loops.length > 0;
  // The loop the operator CHOSE, as opposed to the top-ranked default. The fleet
  // exits ("View all", "All events", "Show in Performance") carry only an
  // explicit choice: scoping the fleet to a loop nobody picked would read as a
  // filter they never set.
  const explicitLoop = requestedId && selected ? selected.loopId : undefined;

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

  // replace: previewing a row in the focus panel is in-page selection, not a
  // page visit. Opening a loop IS a visit (push), so Back returns here with
  // the selection intact.
  const preview = (loopId: string) =>
    setParams(p => { p.set('loop', loopId); return p; }, { replace: true });
  const openLoop = (loopId: string) => navigate(explorerHref(loopId, { tab: 'Summary' }));

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
          sub={summary.data ? `${fleetEvaluated} loop(s) evaluated` : undefined}
          action={
            <ObcButton variant="flat" disabled={!summary.data}
              title={summary.data ? 'The loops behind this count, in the Performance matrix' : 'Waiting for the fleet summary'}
              onClick={() => navigate(performanceHref({ rows: 'attention', loop: explicitLoop }))}>
              Show loops ›
            </ObcButton>
          } />
        {/* v2.5 (audit F11): the registry counts are the same; what they mean under fusion v2 is said (capabilityCopy) */}
        <KpiTile caption={positionerCopy(summary.data?.capability.loopsCappedByMissingVp ?? 0).caption} tone={summary.data && summary.data.capability.loopsCappedByMissingVp > 0 ? 'warn' : 'good'}
          value={summary.data?.capability.loopsCappedByMissingVp ?? '…'}
          sub={summary.data ? positionerCopy(summary.data.capability.loopsCappedByMissingVp).sub : undefined} />
        <KpiTile caption={peersCopy(summary.data?.capability.loopsWithoutDisturbanceContext ?? 0).caption} tone={summary.data && summary.data.capability.loopsWithoutDisturbanceContext > 0 ? 'warn' : 'good'}
          value={summary.data?.capability.loopsWithoutDisturbanceContext ?? '…'}
          sub={summary.data ? peersCopy(summary.data.capability.loopsWithoutDisturbanceContext).sub : undefined} />
      </div>

      <div className="cpm-grid-2">
        <section className="cpm-surface">
          <PanelHead eyebrow="Priority queue" title="Loops requiring review"
            right={
              <ObcButton variant="normal" onClick={() => navigate(performanceHref({ loop: explicitLoop }))}>
                View all ›
              </ObcButton>
            } />
          {rankings.isLoading && <EmptyState title="Loading…" />}
          {rankings.isError && <QueryError title="Rankings unavailable" error={rankings.error} retry={() => void rankings.refetch()} />}
          {!rankings.isLoading && !rankings.isError && loops.length === 0 && (
            <EmptyState title="No monitored loops"
              copy="Onboard loops in the Loop Registry to populate this queue."
              action={{ label: 'Open Loop Registry', onClick: () => navigate('/cpm/registry') }} />
          )}
          {loops.slice(0, 6).map(l => {
            const isSelected = selected?.loopId === l.loopId;
            return (
              // Two controls, two jobs: the loop id opens the loop (a route); the
              // description previews it in the focus panel (a selection). They
              // are siblings, not nested, so neither is a button inside a button.
              <div key={l.loopId}
                className={`cpm-event-row cpm-queue-row${isSelected ? ' cpm-event-row--selected' : ''}`}>
                <div className="cpm-queue-row__main">
                  <ObcButton variant="flat" className="cpm-queue-row__loop"
                    title={`Open ${l.loopId} in the Loop Explorer`}
                    onClick={() => openLoop(l.loopId)}>
                    {l.loopId} ›
                  </ObcButton>
                  <button type="button" className="cpm-queue-row__preview"
                    aria-pressed={isSelected}
                    aria-label={`Preview ${l.loopId} in the focus panel`}
                    onClick={() => preview(l.loopId)}>
                    <span className="cpm-event-row__sub">{l.displayName} · {l.area ?? l.site}</span>
                    <GoodErrorBar pct={l.metrics.goodErrorPct} mae={l.metrics.mae} />
                  </button>
                </div>
                <span className="cpm-event-row__sub">
                  {l.confidence != null ? `${(l.confidence * 100).toFixed(0)}% conf` : '—'}
                </span>
                <TonePill tone={toneFor(l.diagnosis)}>{l.diagnosis.replace(/_/g, ' ')}</TonePill>
              </div>
            );
          })}
        </section>

        {selected ? (
          <LoopFocus loopId={selected.loopId}
            displayName={showingTopRanked
              ? `${selected.displayName} · top-ranked loop`
              : selected.displayName}
            onOpenAnalysis={() => setDrawerLoop(selected.loopId)} />
        ) : missingLoop ? (
          <section className="cpm-surface">
            <EmptyState
              title={`Loop "${requestedId}" is not in the ranking`}
              copy="It may be unmonitored, not yet evaluated, or no longer registered. Pick a loop from the priority queue, or search the full list in Performance."
              action={{ label: 'Open Performance', onClick: () => navigate(performanceHref()) }} />
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
              <div className="cpm-filter-row">
                <ObcButton variant="raised" onClick={() => setDrawerLoop(topFinding.loopId)}>
                  Review evidence ›
                </ObcButton>
                <ObcButton variant="normal" title={`Open ${topFinding.loopId} in the Loop Explorer`}
                  onClick={() => openLoop(topFinding.loopId)}>
                  Open {topFinding.loopId} ›
                </ObcButton>
              </div>
            </>
          ) : (
            <p className="cpm-copy">Verdicts appear once a loop accumulates a 12h window of samples.</p>
          )}
        </section>

        <section className="cpm-surface">
          <PanelHead eyebrow="Recent context" title="Event trail"
            right={
              <ObcButton variant="normal" onClick={() => navigate(eventsHref({ loop: explicitLoop }))}>
                All events ›
              </ObcButton>
            } />
          {events.isError && (
            <QueryError title="Event trail unavailable"
              error={events.error} retry={() => void events.refetch()} />
          )}
          {events.isLoading && <EmptyState title="Loading events…" />}
          {!events.isLoading && !events.isError && (events.data?.events ?? []).length === 0 && (
            <EmptyState title="No recent events" />
          )}
          {(events.data?.events ?? []).map(e => (
            <div key={e.id} className="cpm-trail-row">
              <span className="cpm-event-row__sub">{fmtDateTime(e.opened_at)}</span>
              <span className="cpm-trail-row__what">
                <ObcButton variant="flat" title={`Open ${e.loop_id} in the Loop Explorer`}
                  onClick={() => openLoop(e.loop_id)}>
                  {e.loop_id} ›
                </ObcButton>
                <span>{e.peak_diagnosis.replace(/_/g, ' ')}</span>
              </span>
              <ObcButton variant="flat" title={`Open episode EVT-${e.id} in Loop Events`}
                onClick={() => navigate(eventsHref({ event: e.id, loop: e.loop_id }))}>
                Episode ›
              </ObcButton>
            </div>
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
          onOpenLoop={() => { setDrawerLoop(null); openLoop(drawerLoop); }}
          onOpenMatrix={() => { setDrawerLoop(null); navigate(performanceHref({ loop: drawerLoop })); }}
          onOpenGate={gate => { setDrawerLoop(null); navigate(performanceHref({ loop: drawerLoop, gate })); }} />
      )}
    </div>
  );
};

export default CpmOverview;
