'use client';

/**
 * The rest of a gate's evidence, shown under a disclosure in the gate dialog (PerformanceGateDialog): the window it
 * was judged on, what the gate asks, its effect on the verdict, the observability flags and the onward actions.
 * The status, the loop result, the assessment and the reason are the dialog's own, so they are not repeated here.
 *
 * It was a panel docked beside the matrix (CHG-135 removed it): reading a gate is one task, and a dialog serves it
 * without taking a column from the list.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ReasonedButton } from './ReasonedButton';
import { ApiError } from '../../api/apiFetch';
import { useCpmCalculations, useCpmLoop, useGateCatalogue, useLatestGates } from '../../hooks/useCpm';
import { gateRole } from '../../api/cpm/catalogue';
import { workbenchHref } from './evidence/selection';
import { explorerHref, replayHref } from './cpaHref';
import { confirmationProse } from './investigation/confirmationCopy';
import { KvRow, PanelHead, TonePill, fmtDateTime } from './shared';
import { CodeLabel } from './CodeLabel';
import { flagsForLoop, inputContextOf, vpAbsent } from './optionalInputs';

export const EvidenceBody: React.FC<{
  loopId: string; gateKey: string; windowKind: string;
  /** False where the dialog's own foot already opens the Workbench (CHG-157), so it is offered once. */
  withWorkbench?: boolean;
}> = ({ loopId, gateKey, windowKind, withWorkbench = true }) => {
  const navigate = useNavigate();
  const gates = useLatestGates(loopId, windowKind);
  // CHG-077: the loop's declared inputs, so a loop without a valve position shows no NO_VP gap
  const inputs = inputContextOf(useCpmLoop(loopId).data);
  const { data: matrix } = gates;
  const { data: calc } = useCpmCalculations();

  const def = calc?.gates.find(g => g.key === gateKey);
  const cell = matrix?.gates.find(g => g.key === gateKey);
  const catalogue = useGateCatalogue();
  const role = gateRole(catalogue.data, gateKey);                    // the build's catalogue (2D.1), never a client-side table

  // NOT_EVALUATED is a VERDICT — the engine looked and declined. It must not also
  // stand in for "still loading", "no window yet" (404) or "the request failed".
  const noWindowYet = gates.isError && gates.error instanceof ApiError && gates.error.status === 404;
  const fetchFailed = gates.isError && !noWindowYet;

  return (
    <>
      {/* The status, reason and result are the dialog's; what stays here is a failed or missing read, never silent */}
      {fetchFailed && (
        <p className="cpm-copy" role="status">{gates.error instanceof Error ? gates.error.message : 'The service is unavailable.'}</p>
      )}
      {noWindowYet && <p className="cpm-copy" role="status">This loop has not completed a {windowKind} evaluation window.</p>}
      {/* CHG-156 (owner review): no calculation or profile version, contract label, source or emitted time here */}
      <PanelHead title="Window & attribution" />
      {/* Split across two rows: one line carrying both bounds plus a zone label
          overflowed the panel and read as a cropped value. */}
      <KvRow label="Window from">{matrix?.windowStart ? fmtDateTime(matrix.windowStart) : '—'}</KvRow>
      <KvRow label="Window to">{matrix?.windowEnd ? fmtDateTime(matrix.windowEnd) : '—'}</KvRow>
      <KvRow label="Gate role">{role}</KvRow>
      <KvRow label="Samples">{matrix?.sampleCount ?? '—'}</KvRow>

      <PanelHead eyebrow="Purpose" title="What this gate asks" />
      <p className="cpm-copy">{def?.question ?? 'Definition unavailable.'}</p>
      {def && !def.observedInResults && (
        <p className="cpm-copy">
          <TonePill tone="warn">NOT YET OBSERVED</TonePill>&nbsp;No stored result has
          carried a status for this gate yet.
        </p>
      )}

      <PanelHead eyebrow="Fusion behaviour" title="Effect on the verdict" />
      <p className="cpm-copy">
        {gateKey === 'G13' && (matrix?.hasPeerLinks
          ? 'Peer links exist: oscillation without actuator stress disqualifies the stiction family as DISTURBANCE_CONTEXT.'
          : 'No peer links: G13 cannot evaluate, and stiction cannot be distinguished from an upstream disturbance.')}
        {gateKey === 'G14' && confirmationProse(matrix?.verdictV2?.confirmation, matrix?.verdictV2?.legacy ?? true, vpAbsent(inputs))}
        {gateKey !== 'G13' && gateKey !== 'G14' && (
          role === 'BLOCKING'
            ? 'A failure here excludes the whole window before any diagnosis is attempted.'
            : role === 'FUSION'
              ? 'Combines all qualified evidence into the final banded verdict.'
              : `Contributes ${role.toLowerCase()} evidence to family qualification.`)}
      </p>

      {matrix && flagsForLoop(matrix.observabilityFlags, inputs).length > 0 && (
        <>
          <PanelHead eyebrow="Observability" title="Flags on this window" />
          <div className="cpm-flag-row">
            {flagsForLoop(matrix.observabilityFlags, inputs).map(f => (
              <TonePill key={f} tone={f.startsWith('HAS_') ? 'good' : 'warn'}><CodeLabel code={f} /></TonePill>
            ))}
          </div>
        </>
      )}

      {/* v2.5 (2E.3, R13): the workbench opens THIS cell's immutable method run - never "latest".
          2026-09-20 (cpa-ui-fix-plan Phase 2): the five reasons the run cannot be opened are
          different states and are named as such - "still loading" was reading as "legacy row".
          Without a run there is nothing immutable to open, so Replay becomes the primary exit. */}
      {(() => {
        const runId = cell?.methodRunId ?? null;
        const workbench = gates.isLoading
          ? { disabled: true, title: 'Loading the latest result…' }
          : fetchFailed
            ? { disabled: true, title: 'The latest result could not be loaded; retry above' }
            : noWindowYet
              ? { disabled: true, title: `No ${windowKind} window has been evaluated for this loop yet` }
              : !cell
                ? { disabled: true, title: `${gateKey} is not part of this loop's latest ${windowKind} result` }
                : !runId
                  ? { disabled: true, title: 'This result was stored before analysis runs were kept (before v2.5); use Replay or the Window Inspector instead' }
                  : { disabled: false, title: `Open method run ${runId}` };
        const replay = replayHref(loopId, { gate: gateKey, window: matrix?.windowEnd, kind: windowKind });
        // CHG-157 (owner review): the ways on are the app's flat links with short names, like the dialog's foot
        return (
          <div className="cpm-gate-more__actions">
            {withWorkbench && (
              <span title={workbench.title}>
                {/* CHG-098 (SME review 2 #29): why the workbench is unavailable shows on screen, not only on hover */}
                <ReasonedButton variant="flat" disabled={workbench.disabled}
                  reason={workbench.disabled && !gates.isLoading ? workbench.title : null}
                  onClick={() => { if (runId) navigate(workbenchHref(loopId, runId, gateKey)); }}>
                  Workbench →
                </ReasonedButton>
              </span>
            )}
            <ObcButton variant="flat"
              title={matrix?.windowEnd ? `Replay the ${windowKind} window ending ${fmtDateTime(matrix.windowEnd)}` : `Replay this loop's newest ${windowKind} window`}
              onClick={() => navigate(replay)}>
              Replay →
            </ObcButton>
            <ObcButton variant="flat" title={`Open ${loopId} in the Loop Explorer, Calculations tab`}
              onClick={() => navigate(explorerHref(loopId, { tab: 'Calculations' }))}>
              Loop ↗
            </ObcButton>
          </div>
        );
      })()}
    </>
  );
};

export default EvidenceBody;
