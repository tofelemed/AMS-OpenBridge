'use client';

/**
 * Explorer › Summary — composition (cpa-ui-fix-plan Phase 3).
 *
 * Top: the operating state and 8 h trend (./summary/OperatingState) beside the
 * loop model. Then the gates of the latest fused window as a strip fed from the
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
import { EmptyState, KvRow, PanelHead, QueryError, TonePill, fmtDateTime, toneFor } from '../shared';
import { evidenceHref } from '../cpaHref';
import { workbenchHref } from '../evidence/selection';
import { LoopModelCard } from './LoopModelCard';
import OperatingState from './summary/OperatingState';
import SummaryGateStrip from './summary/SummaryGateStrip';

const SummaryGateDetail = React.lazy(() => import('./summary/SummaryGateDetail'));
const SummaryCalculations = React.lazy(() => import('./summary/SummaryCalculations'));

/** The fused kind the workspace verdict pill and this strip read; same query key as LoopWorkspace. */
const WINDOW_KIND = '24h';

const isNoVerdictYet = (e: unknown) => e instanceof ApiError && e.status === 404;

export const SummaryTab: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const [params, setParams] = useSearchParams();
  const gates = useLatestGates(loop.loopId, WINDOW_KIND);
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

  // The Workbench exit opens the exact fused run when the row carries one, else
  // the loop-level landing (its newest window with run identity).
  const g15 = matrix?.methodRunIds?.G15 ?? matrix?.gates.find(g => g.key === 'G15')?.methodRunId ?? null;
  const workbench = g15
    ? { href: workbenchHref(loop.loopId, g15, 'G15'), title: `Open the fused ${WINDOW_KIND} run ${g15} in the Evidence Workbench` }
    : { href: evidenceHref(loop.loopId, { kind: WINDOW_KIND }), title: 'Open the newest window with run identity in the Evidence Workbench' };

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

      <section className="cpm-summary-section" aria-label="Gates on the latest fused window">
        <PanelHead
          eyebrow={`Evaluated ${WINDOW_KIND} window${matrix?.windowEnd ? ` · ending ${fmtDateTime(matrix.windowEnd)}` : ''}`}
          title="Gates on the latest fused result"
          right={matrix ? (
            <TonePill tone={toneFor(matrix.diagnosis)}>
              {(matrix.diagnosis ?? 'NONE').replace(/_/g, ' ')}
              {matrix.confidence != null ? ` · ${(matrix.confidence * 100).toFixed(0)}%` : ''}
            </TonePill>
          ) : undefined}
        />
        {gates.isLoading && <EmptyState title="Loading the latest fused result…" />}
        {failed && <QueryError title="Gate outcomes unavailable" error={gates.error} retry={() => void gates.refetch()} />}
        {noVerdictYet && (
          <EmptyState title={`No fused ${WINDOW_KIND} verdict yet`}
            copy="Gate outcomes appear once this loop completes an evaluation window." />
        )}
        {cells.length > 0 && (
          <>
            <SummaryGateStrip cells={cells} selected={selectedGate} onSelect={g => selectGate(g === selectedGate ? null : g)} />
            {selectedGate && matrix ? (
              <Suspense fallback={<EmptyState title={`Loading ${selectedGate}…`} />}>
                <SummaryGateDetail loop={loop} gate={selectedGate} matrix={matrix} windowKind={WINDOW_KIND}
                  onClose={() => selectGate(null)} />
              </Suspense>
            ) : (
              <p className="cpm-copy cpm-summary-hint">
                Select a gate to read its verdict, window and evidence here; the Evidence Workbench holds the full run.
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
            <SummaryCalculations loop={loop} defaultKind={WINDOW_KIND} />
          </Suspense>
        )}
      </section>
    </div>
  );
};

export default SummaryTab;
