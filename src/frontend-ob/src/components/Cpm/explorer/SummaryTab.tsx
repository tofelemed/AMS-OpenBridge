'use client';

/**
 * Explorer › Summary: the PV, SP, OP and Mode row and the trend (./summary/OperatingState), then this loop's KPIs, then the Gate
 * results of the latest fused window, fed from the gates/latest row the workspace already holds (no request). The loop model is
 * a dialog from "Loop model & setup →". A KPI card or a gate tile (`?gate=`, replace) opens its dialog; the gate's evidence is
 * fetched lazily, only then. The result, its window and Review evidence → are in the band above the tabs.
 */
import { pipelineStep, usePipelineAccess } from '../access';
import React, { Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../api/cpmApi';
import { ApiError } from '../../../api/apiFetch';
import { useLatestGates } from '../../../hooks/useCpm';
import { EmptyState, PanelHead, QueryError } from '../shared';
import { pipelineHref } from '../cpaHref';
import { buildTierGroups } from '../gateStatus';
import { effectiveInputFlags } from '../inputLimits';
import { inputContextOf } from '../optionalInputs';
import { LoopModelLink } from './LoopModelCard';
import OperatingState from './summary/OperatingState';
import SummaryGateStrip from './summary/SummaryGateStrip';
import { LoopKpiCards } from './summary/LoopKpiCards';
import type { ExplorerTab } from './readinessCauses';

const SummaryGateDetail = React.lazy(() => import('./summary/SummaryGateDetail'));

const isNoVerdictYet = (e: unknown) => e instanceof ApiError && e.status === 404;

/** `windowKind` is `?window=` as the Explorer reads it; the strip and the workspace verdict pill share its query key. */
export const SummaryTab: React.FC<{ loop: CpmLoop; windowKind: string; onTab: (t: ExplorerTab) => void }> = ({ loop, windowKind, onTab }) => {
  const canPipeline = usePipelineAccess();
  const [params, setParams] = useSearchParams();
  const gates = useLatestGates(loop.loopId, windowKind);
  const matrix = gates.data;
  const cells = matrix?.gates ?? [];
  const noVerdictYet = gates.isError && isNoVerdictYet(gates.error);
  const failed = gates.isError && !noVerdictYet;
  const flags = effectiveInputFlags(matrix?.observabilityFlags, inputContextOf(loop));

  // The selected gate lives in the URL (replace: an in-page selection). A gate the served row does not carry is ignored.
  const requestedGate = params.get('gate');
  const selectedGate = requestedGate && cells.some(c => c.key === requestedGate) ? requestedGate : null;
  const selectGate = (gate: string | null) => setParams(p => {
    if (gate) p.set('gate', gate); else p.delete('gate');
    return p;
  }, { replace: true });

  return (
    <div>
      <div className="cpm-explorer-tools"><LoopModelLink loop={loop} /></div>
      <OperatingState loop={loop} />

      {/* KPI Phase 4: this loop's KPIs, judged by the engine's gates, with the change since yesterday */}
      <LoopKpiCards loop={loop} windowKind={windowKind} />

      <section className="cpm-summary-section" aria-label="Gate results">
        <PanelHead title="Gate results"
          right={<ObcButton variant="flat" onClick={() => onTab('Calculations')}>All calculations →</ObcButton>} />
        {gates.isLoading && <EmptyState title="Loading the latest fused result…" />}
        {failed && <QueryError title="Gate outcomes unavailable" error={gates.error} retry={() => void gates.refetch()} />}
        {noVerdictYet && (
          // CHG-098 (SME review 2 #29): what to try while there is no verdict.
          <EmptyState title="No fused verdict yet"
            copy="Gate outcomes appear once this loop completes an evaluation window. Switch 12 h / 24 h at the top of the page, or check Pipeline Health if a result is overdue."
            next={pipelineStep(canPipeline, pipelineHref())} />
        )}
        {cells.length > 0 && (
          <SummaryGateStrip cells={cells} inputFlags={flags} selected={selectedGate} onSelect={selectGate} />
        )}
        {selectedGate && matrix && (
          <Suspense fallback={null}>
            <SummaryGateDetail loop={loop} gate={selectedGate} matrix={matrix} windowKind={windowKind} flags={flags}
              gateKeys={buildTierGroups(cells.map(c => c.key)).flatMap(g => g.keys)}
              onSelectGate={selectGate} onClose={() => selectGate(null)} />
          </Suspense>
        )}
      </section>
    </div>
  );
};

export default SummaryTab;
