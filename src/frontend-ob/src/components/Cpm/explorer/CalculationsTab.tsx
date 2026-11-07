'use client';

/**
 * Explorer › Calculations. The latest fused window's gates with Inspect → (the shared gate dialog), then the long
 * metrics that used to sit on Summary. The window is the page's own (12 h unless 24 h was chosen at the top), so
 * this tab has no window select of its own: the short windows are one link away in Window Inspector.
 *
 * Gate words come from `GateBadge`, the same as the Summary tiles. The tab used to colour and word the same gate
 * from `codeLabel`, so a seen symptom read "Warning" here and "Symptom seen" there.
 */
import React, { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../api/cpmApi';
import { ApiError } from '../../../api/apiFetch';
import { useCpmResolutions, useLatestGates } from '../../../hooks/useCpm';
import { EmptyState, QueryError } from '../shared';
import { calculationsHref, pipelineHref, windowsHref } from '../cpaHref';
import { effectiveInputFlags } from '../inputLimits';
import { inputContextOf } from '../optionalInputs';
import { buildTierGroups } from '../gateStatus';
import { fmtWhen } from '../blocks/whenText';
import CalculationsGateTable from './CalculationsGateTable';
import CalculationsMetrics from './CalculationsMetrics';

const SummaryGateDetail = React.lazy(() => import('./summary/SummaryGateDetail'));

const isNoVerdictYet = (e: unknown) => e instanceof ApiError && e.status === 404;

/** `pageWindowKind`: the Explorer's fused window (CHG-089, 12h default); used when the engine serves it. */
export const CalculationsTab: React.FC<{ loop: CpmLoop; pageWindowKind?: string }> = ({ loop, pageWindowKind = '12h' }) => {
  const navigate = useNavigate();
  const resolutions = useCpmResolutions();
  const firesOn = resolutions.data?.fusion.firesOn ?? ['12h', '24h'];
  const active = firesOn.includes(pageWindowKind) ? pageWindowKind : firesOn[0] ?? '12h';
  const gates = useLatestGates(loop.loopId, active);
  const matrix = gates.data;
  const cells = matrix?.gates ?? [];
  const [selected, setSelected] = React.useState<string | null>(null);
  const flags = effectiveInputFlags(matrix?.observabilityFlags, inputContextOf(loop));

  return (
    <div>
      {gates.isLoading && <EmptyState level={2} title="Loading…" />}
      {gates.isError && !isNoVerdictYet(gates.error) && (
        <QueryError title="Gate results unavailable"
          error={gates.error} retry={() => void gates.refetch()} />
      )}
      {!gates.isLoading && !matrix && (!gates.isError || isNoVerdictYet(gates.error)) && (
        // CHG-098 (SME review 2 #29): the next step when the verdict is overdue.
        <EmptyState level={2} title="No fused verdict yet"
          copy={`Fusion fires on ${firesOn.join(' / ')} windows; results appear once one has been evaluated. Switch 12 h / 24 h at the top of the page, or check Pipeline Health if a result is overdue.`}
          next={[{ label: 'Pipeline Health', to: pipelineHref() }]} />
      )}

      {matrix && (
        <>
          <p className="cpm-copy">{active} window ending {fmtWhen(matrix.windowEnd)}</p>
          <CalculationsGateTable cells={cells} flags={flags} onInspect={setSelected} />
          <CalculationsMetrics matrix={matrix} />
        </>
      )}

      {selected && matrix && cells.some(c => c.key === selected) && (
        <Suspense fallback={null}>
          <SummaryGateDetail loop={loop} gate={selected} matrix={matrix} windowKind={active} flags={flags}
            gateKeys={buildTierGroups(cells.map(c => c.key)).flatMap(g => g.keys)}
            onSelectGate={setSelected} onClose={() => setSelected(null)} />
        </Suspense>
      )}

      <div className="cpm-explorer-foot">
        <span className="cpm-explorer-foot__links">
          <ObcButton variant="flat" onClick={() => navigate(windowsHref(loop.loopId))}>
            Short windows ↗
          </ObcButton>
          <ObcButton variant="flat" onClick={() => navigate(calculationsHref(loop.loopId))}>
            Full catalogue →
          </ObcButton>
        </span>
      </div>
    </div>
  );
};

export default CalculationsTab;
