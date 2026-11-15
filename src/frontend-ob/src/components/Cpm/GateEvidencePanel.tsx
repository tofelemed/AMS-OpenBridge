'use client';

/**
 * The rest of a gate's evidence in the shared gate dialog (Performance and Loop Explorer › Summary / Calculations). It reads
 * the loop's latest result once (`useGateEvidence`) and gives each part to the place it belongs:
 * - `EvidenceState`: a failed or missing read, in the result column, never silent;
 * - `EvidenceAbout`: what the gate asks, its effect on the verdict and the window's flags, the dialog's second column;
 * - `EvidenceLinks`: the ways on (Workbench, Replay, Loop), links in the dialog's foot.
 * The status, the loop result, the window and the reason are the dialog's own, so they are not repeated here.
 *
 * CHG-191 (owner review 2026-11-14, item 3): one heading per part, no caps labels; the window is one line in the dialog,
 * so "Window from", "Window to" and "Gate role" are gone (the role still words "Effect on the verdict"). Nothing sits
 * behind a disclosure any more: the dialog is wide enough for two columns.
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
import { TonePill, fmtDateTime } from './shared';
import { CodeLabel } from './CodeLabel';
import { flagsForLoop, inputContextOf, vpAbsent } from './optionalInputs';

export function useGateEvidence(loopId: string, gateKey: string, windowKind: string) {
  const gates = useLatestGates(loopId, windowKind);
  // CHG-077: the loop's declared inputs, so a loop without a valve position shows no NO_VP gap
  const inputs = inputContextOf(useCpmLoop(loopId).data);
  const calculations = useCpmCalculations();
  const catalogue = useGateCatalogue();
  const matrix = gates.data;
  // NOT_EVALUATED is a VERDICT — the engine looked and declined. It must not also
  // stand in for "still loading", "no window yet" (404) or "the request failed".
  const noWindowYet = gates.isError && gates.error instanceof ApiError && gates.error.status === 404;
  return {
    gates,
    matrix,
    inputs,
    cell: matrix?.gates.find(g => g.key === gateKey),
    def: calculations.data?.gates.find(g => g.key === gateKey),
    /** The definitions are still on their way: say so, not "unavailable" (the question is the dialog's first line now). */
    defLoading: calculations.isLoading,
    role: gateRole(catalogue.data, gateKey),                      // the build's catalogue (2D.1), never a client-side table
    noWindowYet,
    fetchFailed: gates.isError && !noWindowYet,
  };
}

export type GateEvidence = ReturnType<typeof useGateEvidence>;

/** A failed or missing read says so in the result column. */
export const EvidenceState: React.FC<{ ev: GateEvidence; windowKind: string }> = ({ ev, windowKind }) => (
  <>
    {ev.fetchFailed && (
      <p className="cpm-copy" role="status">{ev.gates.error instanceof Error ? ev.gates.error.message : 'The service is unavailable.'}</p>
    )}
    {ev.noWindowYet && <p className="cpm-copy" role="status">This loop has not completed a {windowKind} evaluation window.</p>}
  </>
);

/** One part of the second column: one normal heading, no caps label above it. */
export const GatePart: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="cpm-gate-dialog__part">
    <h3 className="cpm-panel-title cpm-gate-dialog__heading">{title}</h3>
    {children}
  </section>
);

/** The dialog's second column. `definition` is the catalogue's method text, where the page shows it (Summary). */
export const EvidenceAbout: React.FC<{ ev: GateEvidence; gateKey: string; definition?: string | null }> = ({ ev, gateKey, definition }) => {
  const { matrix, def, defLoading, role, inputs } = ev;
  const flags = matrix ? flagsForLoop(matrix.observabilityFlags, inputs) : [];
  return (
    <>
      <GatePart title="What this gate asks">
        <p className="cpm-copy">{def?.question ?? (defLoading ? 'Loading…' : 'Definition unavailable.')}</p>
        {definition && <p className="cpm-copy">{definition}</p>}
        {def && !def.observedInResults && (
          <p className="cpm-copy">
            <TonePill tone="warn">NOT YET OBSERVED</TonePill>&nbsp;No stored result has
            carried a status for this gate yet.
          </p>
        )}
      </GatePart>

      <GatePart title="Effect on the verdict">
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
      </GatePart>

      {flags.length > 0 && (
        <GatePart title="Flags on this window">
          <div className="cpm-flag-row">
            {flags.map(f => (
              <TonePill key={f} tone={f.startsWith('HAS_') ? 'good' : 'warn'}><CodeLabel code={f} /></TonePill>
            ))}
          </div>
        </GatePart>
      )}
    </>
  );
};

/**
 * The ways on, as links in the dialog's foot: each opens another page, so each ends in "↗" (owner Q4).
 * v2.5 (2E.3, R13): the workbench opens THIS cell's immutable method run - never "latest".
 * 2026-09-20 (cpa-ui-fix-plan Phase 2): the five reasons the run cannot be opened are different states and are named
 * as such - "still loading" was reading as "legacy row".
 */
export const EvidenceLinks: React.FC<{
  ev: GateEvidence; loopId: string; gateKey: string; windowKind: string;
  /** False where the dialog's primary already opens the Workbench (CHG-157), so it is offered once. */
  withWorkbench?: boolean;
}> = ({ ev, loopId, gateKey, windowKind, withWorkbench = true }) => {
  const navigate = useNavigate();
  const { gates, matrix, cell, fetchFailed, noWindowYet } = ev;
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
            ? { disabled: true, title: 'This result was stored before analysis runs were kept; use Replay or the Window Inspector instead' }
            : { disabled: false, title: `Open the ${gateKey} run of this window in the Evidence Workbench` };   // CHG-184: no run id
  const replay = replayHref(loopId, { gate: gateKey, window: matrix?.windowEnd, kind: windowKind });
  return (
    <>
      {withWorkbench && (
        <span title={workbench.title}>
          {/* CHG-098 (SME review 2 #29): why the workbench is unavailable shows on screen, not only on hover */}
          <ReasonedButton className="ui-link" variant="flat" disabled={workbench.disabled}
            reason={workbench.disabled && !gates.isLoading ? workbench.title : null}
            onClick={() => { if (runId) navigate(workbenchHref(loopId, runId, gateKey)); }}>
            Workbench ↗
          </ReasonedButton>
        </span>
      )}
      <ObcButton className="ui-link" variant="flat"
        title={matrix?.windowEnd ? `Replay the ${windowKind} window ending ${fmtDateTime(matrix.windowEnd)}` : `Replay this loop's newest ${windowKind} window`}
        onClick={() => navigate(replay)}>
        Replay ↗
      </ObcButton>
      <ObcButton className="ui-link" variant="flat" title={`Open ${loopId} in the Loop Explorer, Calculations tab`}
        onClick={() => navigate(explorerHref(loopId, { tab: 'Calculations' }))}>
        Loop ↗
      </ObcButton>
    </>
  );
};
