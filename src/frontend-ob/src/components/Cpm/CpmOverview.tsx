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
import { EmptyState, PanelHead, WorkspaceHeader, fmtDateTime, QueryError } from './shared';
import { PlantScopeFilter, useCpmScope } from './plantScope';
import { useCpmEvents, useCpmLoop, useFleetRankings, useFleetSummary } from '../../hooks/useCpm';
import PriorityQueue from './overview/PriorityQueue';
import { priorityBadge, priorityReasons } from './overview/priorityReason';
import { conditionOf } from './explorer/summary/summaryText';
import OperatingPicture from './overview/OperatingPicture';
import ReadinessStrip from './overview/ReadinessStrip';
import LoopFocus from './overview/LoopFocus';
import FocusedLoopDrawer from './overview/FocusedLoopDrawer';
import { eventsHref, explorerHref, performanceHref } from './cpaHref';
import { diagnosisLabel } from './vocabulary';

export const CpmOverview: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [drawerLoop, setDrawerLoop] = useState<string | null>(null);

  // Plant scope (A6.2): a unit operator's priority queue should show their
  // unit, not the whole plant.
  const scope = useCpmScope();
  const summary = useFleetSummary(scope.params);
  // CHG-045 (SME #7): the queue is the priority order — current findings, criticality × severity.
  const rankings = useFleetRankings(scope.params, '24h', 'priority');
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
  const queued = requestedId
    ? loops.find(l => l.loopId.toLowerCase() === requestedId.toLowerCase())
    : loops[0];
  // The queue holds current findings only; a chosen loop outside it (healthy, excluded, not yet
  // evaluated) is looked up on its own — one request, and only in that case.
  const outside = useCpmLoop(requestedId && !queued && !rankings.isLoading ? requestedId : undefined);
  const selected: { loopId: string; displayName: string } | undefined = queued
    ?? (outside.data ? { loopId: outside.data.loopId, displayName: outside.data.displayName } : undefined);
  const showingTopRanked = !requestedId && !!selected;
  const missingLoop = !!requestedId && !selected && !rankings.isLoading && !outside.isLoading;
  // The loop the operator CHOSE, as opposed to the top-ranked default. The fleet
  // exits ("View all", "All events", "Show in Performance") carry only an
  // explicit choice: scoping the fleet to a loop nobody picked would read as a
  // filter they never set.
  const explicitLoop = requestedId && selected ? selected.loopId : undefined;

  // Position in the ranked queue, so the drawer's prev/next walk it in order.
  const drawerIndex = drawerLoop
    ? loops.findIndex(l => l.loopId === drawerLoop) : -1;

  // The queue is current findings in priority order, so its head IS the top-priority finding.
  const topFinding = loops[0];

  // replace: previewing a row in the focus panel is in-page selection, not a
  // page visit. Opening a loop IS a visit (push), so Back returns here with
  // the selection intact.
  const preview = (loopId: string) =>
    setParams(p => { p.set('loop', loopId); return p; }, { replace: true });
  const openLoop = (loopId: string) => navigate(explorerHref(loopId, { tab: 'Summary' }));

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        page="/cpm"
        title="Operations overview"
      />
      <PlantScopeFilter scope={scope} summary={summary.data ? `${summary.data.loops.total} loop(s) in scope` : null} />

      {/* SME #5/#6 (CHG-043): every monitored loop in one state; configuration limits sit in Readiness below. */}
      <OperatingPicture summary={summary.data} explicitLoop={explicitLoop} />

      <div className="cpm-grid-2">
        <PriorityQueue loops={loops} loading={rankings.isLoading} error={rankings.isError ? rankings.error : null}
          retry={() => void rankings.refetch()} shelvedCount={rankings.data?.shelvedCount ?? 0}
          selectedId={selected?.loopId} onPreview={preview} onOpenLoop={openLoop}
          onViewAll={() => navigate(performanceHref({ rows: 'attention', loop: explicitLoop }))}
          onShelved={() => navigate(eventsHref({ filter: 'shelved' }))} />

        {selected ? (
          <LoopFocus loopId={selected.loopId}
            displayName={showingTopRanked
              ? `${selected.displayName} · top-priority loop`
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
          <PanelHead eyebrow="Top-priority finding" title={
            topFinding
              ? `${conditionOf(topFinding.diagnosis).label} on ${topFinding.loopId}`
              : 'No evaluated findings yet'} />
          {topFinding ? (
            <>
              <p className="cpm-copy">
                {topFinding.loopId} ({topFinding.displayName}) heads the queue: {priorityBadge(topFinding.priority).label.toLowerCase()}
                {' — '}{priorityReasons(topFinding).join(', ')}.
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
            <p className="cpm-copy">No loop has a current finding. Verdicts appear once a loop completes an evaluation window.</p>
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
                <span>{diagnosisLabel(e.peak_diagnosis)}</span>
              </span>
              <ObcButton variant="flat" title={`Open episode EVT-${e.id} in Loop Events`}
                onClick={() => navigate(eventsHref({ event: e.id, loop: e.loop_id }))}>
                Episode ›
              </ObcButton>
            </div>
          ))}
        </section>
      </div>

      <ReadinessStrip summary={summary.data} />

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
