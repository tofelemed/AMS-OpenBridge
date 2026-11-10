'use client';

/**
 * Explorer › Calculations. One Window dropdown for every window the engine serves, with Full catalogue → beside it
 * (CHG-158, owner review). A fused window (12h / 24h) is the page's own: choosing one here moves the 12h / 24h switch at
 * the top, so the two never disagree; it shows the gates with Inspect → (the shared gate dialog) and the long metrics.
 * A short window (`?calcWindow=`) shows its newest stored window's G0–G4 checks and metrics (ShortWindowCalculations).
 *
 * Gate words come from `GateBadge`, the same as the Summary tiles. The tab used to colour and word the same gate
 * from `codeLabel`, so a seen symptom read "Warning" here and "Symptom seen" there.
 */
import { pipelineStep, usePipelineAccess } from '../access';
import React, { Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../api/cpmApi';
import { ApiError } from '../../../api/apiFetch';
import { useCpmResolutions, useLatestGates } from '../../../hooks/useCpm';
import { EmptyState, QueryError, fmtWindowShape, windowSpecsOf } from '../shared';
import { Select } from '../../../ui/forms/Select';
import { calculationsHref, pipelineHref, windowsHref } from '../cpaHref';
import { effectiveInputFlags } from '../inputLimits';
import { inputContextOf } from '../optionalInputs';
import { buildTierGroups } from '../gateStatus';
import { fmtWhen } from '../blocks/whenText';
import CalculationsGateTable from './CalculationsGateTable';
import CalculationsMetrics from './CalculationsMetrics';
import ShortWindowCalculations from './ShortWindowCalculations';

const SummaryGateDetail = React.lazy(() => import('./summary/SummaryGateDetail'));

const isNoVerdictYet = (e: unknown) => e instanceof ApiError && e.status === 404;

/** `pageWindowKind`: the Explorer's fused window (CHG-089, 12h default); used when the engine serves it. */
export const CalculationsTab: React.FC<{ loop: CpmLoop; pageWindowKind?: string }> = ({ loop, pageWindowKind = '12h' }) => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canPipeline = usePipelineAccess();
  const resolutions = useCpmResolutions();
  const firesOn = resolutions.data?.fusion.firesOn ?? ['12h', '24h'];
  const shortSpecs = windowSpecsOf(resolutions.data, () => 0).filter(w => w.tier === 'short');
  const fused = firesOn.includes(pageWindowKind) ? pageWindowKind : firesOn[0] ?? '12h';
  const requestedShort = params.get('calcWindow');
  const short = requestedShort && shortSpecs.some(w => w.kind === requestedShort) ? requestedShort : null;
  const chosen = short ?? fused;
  const choose = (kind: string) => setParams(p => {
    if (firesOn.includes(kind)) { p.set('window', kind); p.delete('calcWindow'); p.delete('gate'); } else p.set('calcWindow', kind);
    return p;
  }, { replace: true });
  const gates = useLatestGates(loop.loopId, fused);
  const matrix = gates.data;
  const cells = matrix?.gates ?? [];
  const [selected, setSelected] = React.useState<string | null>(null);
  const flags = effectiveInputFlags(matrix?.observabilityFlags, inputContextOf(loop));

  return (
    <div>
      <div className="cpm-calc-toolbar">
        <Select label="Window" value={chosen} onChange={choose} options={[]}
          groups={[
            { label: `Fused verdict (fires on ${firesOn.join(' / ')})`, options: firesOn.map(k => ({ value: k, label: `${k} — fused G0–G15` })) },
            ...(shortSpecs.length > 0 ? [{
              label: 'Short features (G0–G4)',
              options: shortSpecs.map(w => { const shape = fmtWindowShape(w); return { value: w.kind, label: shape ? `${w.kind} — ${shape}` : w.kind }; }),
            }] : []),
          ]} />
        <span className="cpm-calc-toolbar__end">
          <ObcButton variant="normal" onClick={() => navigate(calculationsHref(loop.loopId, { kind: chosen }))}>Full catalogue →</ObcButton>
        </span>
      </div>

      {short ? <ShortWindowCalculations loop={loop} kind={short} /> : (
        <>
          {gates.isLoading && <EmptyState level={2} title="Loading…" />}
          {gates.isError && !isNoVerdictYet(gates.error) && (
            <QueryError title="Gate results unavailable"
              error={gates.error} retry={() => void gates.refetch()} />
          )}
          {!gates.isLoading && !matrix && (!gates.isError || isNoVerdictYet(gates.error)) && (
            // CHG-098 (SME review 2 #29): the next step when the verdict is overdue.
            <EmptyState level={2} title="No fused verdict yet"
              copy={`Fusion fires on ${firesOn.join(' / ')} windows; results appear once one has been evaluated. Choose another window, or check Pipeline Health if a result is overdue.`}
              next={pipelineStep(canPipeline, pipelineHref())} />
          )}
          {matrix && (
            <>
              {/* the dropdown names the window; this line says when it ended */}
              <p className="cpm-copy">window ending {fmtWhen(matrix.windowEnd)}</p>
              <CalculationsGateTable cells={cells} flags={flags} onInspect={setSelected} />
              <CalculationsMetrics matrix={matrix} />
            </>
          )}
        </>
      )}

      {!short && selected && matrix && cells.some(c => c.key === selected) && (
        <Suspense fallback={null}>
          <SummaryGateDetail loop={loop} gate={selected} matrix={matrix} windowKind={fused} flags={flags}
            gateKeys={buildTierGroups(cells.map(c => c.key)).flatMap(g => g.keys)}
            onSelectGate={setSelected} onClose={() => setSelected(null)} />
        </Suspense>
      )}

      <div className="cpm-explorer-foot">
        <span className="cpm-explorer-foot__links">
          <ObcButton variant="flat" onClick={() => navigate(windowsHref(loop.loopId, { profile: short }))}>
            Short windows ↗
          </ObcButton>
        </span>
      </div>
    </div>
  );
};

export default CalculationsTab;
