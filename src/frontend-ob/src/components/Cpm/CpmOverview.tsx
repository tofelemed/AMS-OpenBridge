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
 *
 * CHG-134 (reference redesign, Task 6): the queue tag and the preview's button open Investigation; the bottom row is
 * the clickable top finding and three recent events; the readiness strip moves to Loop Registry (Task 23).
 */
import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, WorkspaceHeader } from './shared';
import { useCpmScope } from './plantScope';
import { useCpmLoop, useFleetRankings } from '../../hooks/useCpm';
import PriorityQueue from './overview/PriorityQueue';
import OperatingPicture from './overview/OperatingPicture';
import LoopFocus from './overview/LoopFocus';
import TopFinding from './overview/TopFinding';
import RecentEvents from './overview/RecentEvents';
import PageFoot from './blocks/PageFoot';
import { Dialog } from '../../ui/Dialog';
import { useFleetKpis } from './kpi/useFleetKpis';
import { basisText } from './kpi/fleetKpiView';
import { eventsHref, performanceHref, registryHref } from './cpaHref';
import WindowKindToggle from './explorer/summary/WindowKindToggle';
import { WINDOW_KINDS, useWindowKind } from './useWindowKind';

export const CpmOverview: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [basisOpen, setBasisOpen] = useState(false);

  // Plant scope (A6.2): a unit operator's priority queue should show their
  // unit, not the whole plant.
  const scope = useCpmScope();
  // CHG-089: one fused window for the whole page (12h default, 24h on request), kept in ?window= and carried by its links
  const [windowKind, setWindowKind] = useWindowKind('window');
  const kpis = useFleetKpis({ ...scope.params, windowKind });
  // CHG-045 (SME #7): the queue is the priority order — current findings, criticality × severity.
  const rankings = useFleetRankings(scope.params, windowKind, 'priority');

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
  const missingLoop = !!requestedId && !selected && !rankings.isLoading && !outside.isLoading;
  // The loop the operator CHOSE, as opposed to the top-ranked default. The fleet
  // exits ("View all", "All events", "Show in Performance") carry only an
  // explicit choice: scoping the fleet to a loop nobody picked would read as a
  // filter they never set.
  const explicitLoop = requestedId && selected ? selected.loopId : undefined;

  // The queue is current findings in priority order, so its head IS the top-priority finding.
  const topFinding = loops[0];

  // replace: previewing a row in the focus panel is in-page selection, not a
  // page visit. Opening a loop IS a visit (push), so Back returns here with
  // the selection intact.
  const preview = (loopId: string) =>
    setParams(p => { p.set('loop', loopId); return p; }, { replace: true });

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        page="/cpm"
        title="Operations overview"
        actions={<WindowKindToggle value={windowKind} kinds={WINDOW_KINDS} onChange={setWindowKind} />}
      />

      {/* CHG-082: every monitored loop in one state, KPI tiles with a drill-down each (kpi_calculation_logic/KPI-LOGIC.md);
          configuration limits sit in Readiness below. */}
      <OperatingPicture scope={scope.params} windowKind={windowKind} />

      <div className="cpm-grid-2">
        <PriorityQueue loops={loops} loading={rankings.isLoading} error={rankings.isError ? rankings.error : null}
          retry={() => void rankings.refetch()} shelvedCount={rankings.data?.shelvedCount ?? 0}
          selectedId={selected?.loopId} onPreview={preview} windowKind={windowKind}
          onViewAll={() => navigate(performanceHref({ rows: 'attention', loop: explicitLoop, kind: windowKind }))}
          onShelved={() => navigate(eventsHref({ filter: 'shelved' }))} />

        {selected ? (
          <LoopFocus loopId={selected.loopId}
            displayName={selected.displayName} windowKind={windowKind} />
        ) : missingLoop ? (
          <section className="cpm-surface">
            <EmptyState
              title={`Loop "${requestedId}" is not in the ranking`}
              copy="It may be unmonitored, not yet evaluated, or no longer registered. Pick a loop from the priority queue, or search the full list in Performance."
              action={{ label: 'Open Performance', onClick: () => navigate(performanceHref()) }} />
          </section>
        ) : (
          <section className="cpm-surface">
            {/* CHG-098 (SME review 2 #29): say what fills this panel and where to pick a loop. */}
            <EmptyState title="Select a loop"
              copy="Pick a loop in the priority queue to see its live signals and trend here."
              next={[{ label: 'All loops in Performance', to: performanceHref({ kind: windowKind }) }]} />
          </section>
        )}
      </div>

      <div className="cpm-grid-2">
        <TopFinding finding={topFinding} windowKind={windowKind} />
        <RecentEvents scope={scope.params} windowKind={windowKind} loop={explicitLoop} />
      </div>

      <PageFoot>
        <ObcButton variant="flat" onClick={() => setBasisOpen(true)}>Calculation basis</ObcButton>
        <ObcButton variant="flat" onClick={() => navigate(registryHref())}>Configuration & coverage →</ObcButton>
      </PageFoot>
      <Dialog open={basisOpen} title="Calculation basis" onClose={() => setBasisOpen(false)}>
        <p className="cpm-copy">{kpis.data ? basisText(kpis.data) : 'The basis appears once the figures load.'}</p>
      </Dialog>

    </div>
  );
};

export default CpmOverview;
