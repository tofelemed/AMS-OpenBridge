'use client';

/**
 * Explorer › Summary — composition (cpa-ui-fix-plan Phase 3).
 *
 * Top: the operating state and 8 h trend (./summary/OperatingState) beside the
 * loop model (the loop summary heads the workspace, above the tabs). Then the gates of the latest fused window as a strip fed from the
 * gates/latest row the workspace already holds (no request); selecting a gate
 * (`?gate=`, replace) opens its detail and evidence below, lazily. Then the
 * calculations at any served window kind, lazily on request.
 *
 * The rolling trend is captioned as a trend range and the gate strip as an
 * evaluated window, so the two are never read as the same thing.
 */
import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../api/cpmApi';
import { ApiError } from '../../../api/apiFetch';
import { useLatestGates } from '../../../hooks/useCpm';
import { loopSeries } from '../../../utils/loopSeries';
import { EmptyState, KvRow, PanelHead, QueryError, fmtDateTime } from '../shared';
import { pipelineHref } from '../cpaHref';
import { LoopModelCard } from './LoopModelCard';
import OperatingState from './summary/OperatingState';
import SummaryGateStrip from './summary/SummaryGateStrip';
import { pinEvaluated, revealTrend } from '../trend/evaluatedWindow';
import { workbenchExit } from './summary/LoopSummaryCard';
import { effectiveInputFlags } from '../inputLimits';
import { inputContextOf } from '../optionalInputs';
import { LoopKpiCards } from './summary/LoopKpiCards';

const SummaryGateDetail = React.lazy(() => import('./summary/SummaryGateDetail'));
const SummaryCalculations = React.lazy(() => import('./summary/SummaryCalculations'));

const isNoVerdictYet = (e: unknown) => e instanceof ApiError && e.status === 404;

/** `windowKind` is `?window=` as the Explorer reads it; the strip and the workspace verdict pill share its query key. */
export const SummaryTab: React.FC<{ loop: CpmLoop; windowKind: string }> = ({ loop, windowKind }) => {
  const [params, setParams] = useSearchParams();
  const gates = useLatestGates(loop.loopId, windowKind);
  const matrix = gates.data;
  const cells = matrix?.gates ?? [];
  const noVerdictYet = gates.isError && isNoVerdictYet(gates.error);
  const failed = gates.isError && !noVerdictYet;

  // The selected gate lives in the URL (replace: an in-page selection). A gate
  // the served row does not carry is ignored rather than shown empty.
  const requestedGate = params.get('gate');
  const selectedGate = requestedGate && cells.some(c => c.key === requestedGate) ? requestedGate : null;
  const selectGate = (gate: string | null) => setParams(p => {
    if (gate && gate !== p.get('gate')) p.set('gate', gate); else p.delete('gate');
    return p;
  }, { replace: true });

  const [calcOpen, setCalcOpen] = useState(false);

  const workbench = workbenchExit(loop.loopId, matrix, windowKind);

  return (
    <div>
      <div className="cpm-grid-2">
        <OperatingState loop={loop} />
        {/* v2.5 (audit F12): the loop model the engines run on, with the ways into its evidence */}
        <div>
          <LoopModelCard loop={loop} workbenchHref={workbench.href} workbenchTitle={workbench.title} />
          <KvRow label="Gate profile">{loop.thresholdProfileId ?? 'default'}</KvRow>
          <KvRow label="Historian device">{loopSeries(loop.loopId)}</KvRow>
        </div>
      </div>

      {/* KPI Phase 4: this loop's KPIs, judged by the engine's gates, with the change since yesterday and a proof link each */}
      <LoopKpiCards loop={loop} windowKind={windowKind} />

      <section className="cpm-summary-section" aria-label="Gates on the latest fused window">
        <PanelHead
          eyebrow={`Evaluated ${windowKind} window${matrix?.windowEnd ? ` · ending ${fmtDateTime(matrix.windowEnd)}` : ''}`}
          title="Gates on the latest fused result"
          // CHG-089: the 12h / 24h switch moved to the top of the Explorer (one window for every tab)
          // CHG-098 (SME review 2 #20): no diagnosis pill here — the loop summary above states it once
        />
        {gates.isLoading && <EmptyState title="Loading the latest fused result…" />}
        {failed && <QueryError title="Gate outcomes unavailable" error={gates.error} retry={() => void gates.refetch()} />}
        {noVerdictYet && (
          // CHG-098 (SME review 2 #29): what to try while there is no verdict.
          <EmptyState title={`No fused ${windowKind} verdict yet`}
            copy="Gate outcomes appear once this loop completes an evaluation window. Switch 12 h / 24 h at the top of the page, or check Pipeline Health if a result is overdue."
            next={[{ label: 'Pipeline Health', to: pipelineHref() }]} />
        )}
        {cells.length > 0 && (
          <>
            <SummaryGateStrip cells={cells} inputFlags={effectiveInputFlags(matrix?.observabilityFlags, inputContextOf(loop))} selected={selectedGate} onSelect={g => selectGate(g === selectedGate ? null : g)} />
            {selectedGate && matrix ? (
              <Suspense fallback={<EmptyState title={`Loading ${selectedGate}…`} />}>
                <SummaryGateDetail loop={loop} gate={selectedGate} matrix={matrix} windowKind={windowKind}
                  onClose={() => selectGate(null)} />
              </Suspense>
            ) : (
              <p className="cpm-copy cpm-summary-hint">
                Select a gate to read its verdict, window and evidence here; the Evidence Workbench holds the full run.
                {matrix?.windowStart && matrix.windowEnd && (
                  <ObcButton variant="flat" title="Show the window these gates were evaluated on, on the trend above"
                    onClick={() => { setParams(p => pinEvaluated(p, matrix.windowStart!, matrix.windowEnd!), { replace: true }); revealTrend(); }}>
                    Show this window on the trend ›
                  </ObcButton>
                )}
              </p>
            )}
          </>
        )}
      </section>

      <section className="cpm-summary-section" aria-label="Calculations">
        <PanelHead eyebrow="Long and short windows" title="Calculations"
          right={
            <ObcButton variant="flat" title={calcOpen ? 'Collapse the calculations' : 'Newest result at every served window kind'}
              onClick={() => setCalcOpen(v => !v)}>
              {calcOpen ? 'Hide calculations' : 'Show calculations ›'}
            </ObcButton>
          } />
        {calcOpen && (
          <Suspense fallback={<EmptyState title="Loading calculations…" />}>
            <SummaryCalculations loop={loop} defaultKind={windowKind} />
          </Suspense>
        )}
      </section>
    </div>
  );
};

export default SummaryTab;
