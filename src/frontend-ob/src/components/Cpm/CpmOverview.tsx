'use client';

/**
 * CPLM Phase 7 — U1 Overview.
 * CPA-prototype IA parity: KPI row, priority queue, loop-focus panel with an
 * 8-hour envelope trend and the event trail. The prototype's fabricated live numbers are
 * not reproduced; what cannot be measured is stated as unavailable.
 *
 * 2026-09-20 (docs/cpa-ui-fix-plan.md, Phase 1): the "Live Flink runtime"
 * panel left this screen — its job states live on Pipeline Health, and on a
 * triage surface it cost two requests plus a 15 s poll. Every loop named here
 * is a route, and the fleet exits carry the operator's explicit ?loop= selection.
 *
 * CHG-134 (reference redesign, Task 6): the queue tag and the preview's button open Investigation.
 *
 * CHG-177 (owner review, Overview v2: the approved sample docs/theme/redesign/samples/overview-v2-proposal.html and the
 * answers of 12 Nov 2026): one five-column grid. Header: eyebrow and title, How to read (it took the page-foot Calculation
 * basis, the queue title's ? and the chart's ?) beside 12h | 24h. "241 loops monitored" once, then the ten cards with no card
 * around them. Loops requiring review in columns 1–3, the chosen loop in columns 4–5; with no rows the queue is one line and a
 * loop chosen in the address takes the full width under it; the empty "Select a loop" panel went, a loop that does not exist
 * is one line. Recent events last, full width. Gone: Top-priority finding (the queue's first row), the page foot (Calculation
 * basis → How to read; Configuration & coverage →, the Loop Registry is in the sidebar).
 */
import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { WorkspaceHeader } from './shared';
import { useCpmScope } from './plantScope';
import { useCpmLoop, useFleetRankings } from '../../hooks/useCpm';
import PriorityQueue from './overview/PriorityQueue';
import OperatingPicture from './overview/OperatingPicture';
import LoopFocus from './overview/LoopFocus';
import RecentEvents from './overview/RecentEvents';
import { OverviewHowToRead } from './overview/OverviewHowToRead';
import { useFleetKpis } from './kpi/useFleetKpis';
import { performanceHref } from './cpaHref';
import WindowKindToggle from './explorer/summary/WindowKindToggle';
import { WINDOW_KINDS, useWindowKind } from './useWindowKind';

export const CpmOverview: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // Guidance is ephemeral and personal: it does not belong in a shareable URL.
  const [guide, setGuide] = useState(false);

  // Plant scope (A6.2): a unit operator's priority queue should show their
  // unit, not the whole plant.
  const scope = useCpmScope();
  // CHG-089: one fused window for the whole page (12h default, 24h on request),
  // kept in ?window= and carried by its links
  const [windowKind, setWindowKind] = useWindowKind('window');
  // The same read the cards make (one cached query): How to read states its basis.
  const kpis = useFleetKpis({ ...scope.params, windowKind });
  // CHG-045 (SME #7): the queue is the priority order — current findings, criticality × severity.
  const rankings = useFleetRankings(scope.params, windowKind, 'priority');

  const loops = rankings.data?.loops ?? [];
  // Case-insensitive, like every loop lookup in cplm-api; and a ?loop= that names
  // nothing must not silently show a different loop's data under that URL.
  const requestedId = params.get('loop');
  // Unlike the toolbar-driven screens, `loops[0]` here is NOT arbitrary: this
  // list is the priority order, so the default is the top finding — the right
  // focus for a triage surface; its row is highlighted.
  const queued = requestedId
    ? loops.find(l => l.loopId.toLowerCase() === requestedId.toLowerCase())
    : loops[0];
  // The queue holds current findings only; a chosen loop outside it (healthy, excluded, not yet
  // evaluated) is looked up on its own — one request, and only in that case.
  const outside = useCpmLoop(requestedId && !queued && !rankings.isLoading ? requestedId : undefined);
  const selected: string | undefined = queued?.loopId ?? outside.data?.loopId;
  const missingLoop = !!requestedId && !selected && !rankings.isLoading && !outside.isLoading;
  // The loop the operator CHOSE, as opposed to the top-ranked default. The fleet
  // exits ("View all", "All events") carry only an explicit choice: scoping the
  // fleet to a loop nobody picked would read as a filter they never set.
  const explicitLoop = requestedId && selected ? selected : undefined;
  // With rows the chosen loop sits beside them; with none the queue is one line and the loop (from ?loop=) goes under it.
  const hasRows = !rankings.isLoading && !rankings.isError && loops.length > 0;

  // replace: previewing a row in the focus panel is in-page selection, not a
  // page visit. Opening a loop IS a visit (push), so Back returns here with
  // the selection intact.
  const preview = (loopId: string) =>
    setParams(p => { p.set('loop', loopId); return p; }, { replace: true });

  return (
    <div className="cpm-screen cpm-ov">
      <WorkspaceHeader
        page="/cpm"
        title="Overview"
        // CHG-157 (owner review): no ? on the title
        copy=""
        actions={<>
          <ObcButton variant="flat" onClick={() => setGuide(true)}>How to read</ObcButton>
          <WindowKindToggle value={windowKind} kinds={WINDOW_KINDS} onChange={setWindowKind} />
        </>}
      />

      {/* CHG-082: every monitored loop in one state, KPI cards with a drill-down each (kpi_calculation_logic/KPI-LOGIC.md). */}
      <OperatingPicture scope={scope.params} windowKind={windowKind} />

      <div className={`cpm-ov-work${hasRows ? '' : ' cpm-ov-work--solo'}`}>
        <PriorityQueue loops={loops} loading={rankings.isLoading} error={rankings.isError ? rankings.error : null}
          retry={() => void rankings.refetch()} shelvedCount={rankings.data?.shelvedCount ?? 0}
          selectedId={selected} onPreview={preview} windowKind={windowKind}
          onViewAll={() => navigate(performanceHref({ rows: 'attention', loop: explicitLoop, kind: windowKind }))} />
        {selected ? <LoopFocus loopId={selected} windowKind={windowKind} />
          : missingLoop && (
            <section className="cpm-surface cpm-ov-focus" aria-label="Chosen loop">
              <p className="cpm-empty-line"><strong>No loop {requestedId}</strong></p>
            </section>
          )}
      </div>

      <RecentEvents scope={scope.params} windowKind={windowKind} loop={explicitLoop} />

      <OverviewHowToRead open={guide} onClose={() => setGuide(false)} kpis={kpis.data} />
    </div>
  );
};

export default CpmOverview;
