'use client';

/**
 * Gate evidence panel (replaces GateEvidenceDrawer).
 *
 * Why it is no longer a modal drawer: the task on this screen is comparative —
 * "G1 failed, G4 and G10 need attention, what happened across this row?" The old
 * panel was `aria-modal` with a backdrop, so it dimmed and blocked the very
 * matrix you need to keep reading, and it was pinned to top:0 where the app
 * chrome could occlude its own title and Close button.
 *
 * It is now a NON-MODAL panel docked beside the matrix on a wide workspace: the
 * matrix stays live, the panel header sticks (Close can never scroll away), and
 * prev/next walk G0..G15 without going back to the grid. Below 1200px there is
 * no room for a second column, so it becomes a real modal dialog — the one place
 * a dialog is the right call.
 *
 * When no gate is selected the docked column is not wasted: it carries the
 * "how to read this" guidance that used to occupy a permanent card on a screen
 * engineers visit daily.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObiCloseGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-close-google';
import { ObiChevronLeftGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-left-google';
import { ObiChevronRightGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-right-google';
import { ApiError } from '../../api/apiFetch';
import type { CpmFleetSummary } from '../../api/cpmApi';
import { useCpmCalculations, useGateCatalogue, useLatestGates } from '../../hooks/useCpm';
import { staleVerdictLine } from './verdictAge';
import { gateRole } from '../../api/cpm/catalogue';
import { workbenchHref } from './evidence/selection';
import { explorerHref, replayHref, windowsHref } from './cpaHref';
import { confirmationProse, noVpFleetCopy } from './investigation/confirmationCopy';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { CpmIconButton, KvRow, PanelHead, TonePill, fmtDateTime } from './shared';
import { gateTone } from './gateStatus';
import { codeLabel } from './vocabulary';
import { CodeLabel } from './CodeLabel';

/** Role per gate — the same static policy the registry aside shows. */
export interface GateEvidencePanelProps {
  loopId: string;
  gateKey: string;
  windowKind: string;
  /** Ordered gate keys, so prev/next walk the pathway in tier order. */
  gateKeys: string[];
  onSelectGate: (gate: string) => void;
  onClose: () => void;
  /** True when there is room to dock beside the matrix (>= 1200px). */
  docked: boolean;
}

/** The evidence itself — identical in both placements. */
const EvidenceBody: React.FC<{ loopId: string; gateKey: string; windowKind: string }> = ({
  loopId, gateKey, windowKind,
}) => {
  const navigate = useNavigate();
  const gates = useLatestGates(loopId, windowKind);
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
  const status = gates.isLoading ? 'LOADING'
    : fetchFailed ? 'UNAVAILABLE'
      : noWindowYet ? 'NO WINDOW YET'
        : cell?.status ?? 'NOT_EVALUATED';

  return (
    <>
      <p className="cpm-copy">
        {def?.name ?? cell?.name ?? gateKey} · latest {windowKind} fused result
        {matrix?.metadata.calculationVersion
          ? ` · calculation v${matrix.metadata.calculationVersion}` : ''}
        {matrix?.metadata.dynamicsProfileVersion
          ? ` · profile v${matrix.metadata.dynamicsProfileVersion}` : ''}
      </p>

      <div className={`cpm-kpi cpm-kpi--${fetchFailed ? 'warn' : gateTone(status, gateKey)}`}
        style={{ margin: '12px 0' }}>
        <span className="cpm-kpi__caption">Result</span>
        <span className="cpm-kpi__value">{codeLabel(status)}</span>
        {fetchFailed && (
          <span className="cpm-kpi__sub">
            {gates.error instanceof Error ? gates.error.message : 'The service is unavailable.'}
          </span>
        )}
        {noWindowYet && (
          <span className="cpm-kpi__sub">
            This loop has not completed a {windowKind} evaluation window.
          </span>
        )}
        {!fetchFailed && !noWindowYet && cell?.reason && (
          <span className="cpm-kpi__sub">{cell.reason}</span>
        )}
      </div>

      <PanelHead eyebrow="Contract" title="Window & attribution" />
      {/* Split across two rows: one line carrying both bounds plus a zone label
          overflowed the panel and read as a cropped value. */}
      <KvRow label="Window from">{matrix?.windowStart ? fmtDateTime(matrix.windowStart) : '—'}</KvRow>
      <KvRow label="Window to">{matrix?.windowEnd ? fmtDateTime(matrix.windowEnd) : '—'}</KvRow>
      {/* audit F4: this is the loop's newest window; an older verdict is stated as older, with its age */}
      {matrix?.lastVerdict && (
        <KvRow label="Last verdict"><span title={matrix.lastVerdict.windowEnd ?? undefined}>{staleVerdictLine(matrix.lastVerdict)?.replace(/^last verdict /, '')}</span></KvRow>
      )}
      <KvRow label="Gate role">{role}</KvRow>
      <KvRow label="Samples">{matrix?.sampleCount ?? '—'}</KvRow>
      <KvRow label="Source">{matrix?.metadata.calculationSource ?? 'flink'}</KvRow>
      <KvRow label="Emitted">
        {matrix?.metadata.computedAt ? fmtDateTime(matrix.metadata.computedAt) : '—'}
      </KvRow>

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
        {gateKey === 'G14' && confirmationProse(matrix?.verdictV2?.confirmation, matrix?.verdictV2?.legacy ?? true)}
        {gateKey !== 'G13' && gateKey !== 'G14' && (
          role === 'BLOCKING'
            ? 'A failure here excludes the whole window before any diagnosis is attempted.'
            : role === 'FUSION'
              ? 'Combines all qualified evidence into the final banded verdict.'
              : `Contributes ${role.toLowerCase()} evidence to family qualification.`)}
      </p>

      {matrix && matrix.observabilityFlags.length > 0 && (
        <>
          <PanelHead eyebrow="Observability" title="Flags on this window" />
          <div className="cpm-flag-row">
            {matrix.observabilityFlags.map(f => (
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
                  ? { disabled: true, title: 'This row predates run identity (v2.5); open Evidence Replay or the Window Inspector instead' }
                  : { disabled: false, title: `Open method run ${runId}` };
        const replayPrimary = workbench.disabled && !gates.isLoading && !fetchFailed && !noWindowYet;
        const replay = replayHref(loopId, { gate: gateKey, window: matrix?.windowEnd, kind: windowKind });
        return (
          <div className="cpm-inspector__actions">
            <ObcButton variant={replayPrimary ? 'normal' : 'raised'} disabled={workbench.disabled} title={workbench.title}
              onClick={() => { if (runId) navigate(workbenchHref(loopId, runId, gateKey)); }}>
              Open in workbench ›
            </ObcButton>
            <ObcButton variant={replayPrimary ? 'raised' : 'normal'}
              title={matrix?.windowEnd ? `Replay the ${windowKind} window ending ${fmtDateTime(matrix.windowEnd)}` : `Replay this loop's newest ${windowKind} window`}
              onClick={() => navigate(replay)}>
              Open in Evidence Replay ›
            </ObcButton>
            <ObcButton variant="normal" title={`Per-window results for ${loopId} in the Window Inspector`}
              onClick={() => navigate(windowsHref(loopId, { profile: windowKind }))}>
              Window Inspector ›
            </ObcButton>
            <ObcButton variant="normal" title={`Open ${loopId} in the Loop Explorer, Calculations tab`}
              onClick={() => navigate(explorerHref(loopId, { tab: 'Calculations' }))}>
              Open full loop ›
            </ObcButton>
          </div>
        );
      })()}
    </>
  );
};

export const GateEvidencePanel: React.FC<GateEvidencePanelProps> = ({
  loopId, gateKey, windowKind, gateKeys, onSelectGate, onClose, docked,
}) => {
  const idx = gateKeys.indexOf(gateKey);
  const prev = idx > 0 ? gateKeys[idx - 1] : null;
  const next = idx >= 0 && idx < gateKeys.length - 1 ? gateKeys[idx + 1] : null;
  const catalogue = useGateCatalogue();
  const role = gateRole(catalogue.data, gateKey);

  const head = (
    <div className="cpm-inspector__head">
      <div className="cpm-inspector__title">
        <span className="cpm-eyebrow">{loopId} · {role}</span>
        <h2 className="cpm-panel-title">Gate {gateKey} evidence</h2>
      </div>
      <div className="cpm-inspector__nav">
        <CpmIconButton
          label={prev ? `Previous gate, ${prev}` : 'Previous gate'}
          disabled={!prev}
          onClick={() => { if (prev) onSelectGate(prev); }}
        >
          <ObiChevronLeftGoogle />
        </CpmIconButton>
        <CpmIconButton
          label={next ? `Next gate, ${next}` : 'Next gate'}
          disabled={!next}
          onClick={() => { if (next) onSelectGate(next); }}
        >
          <ObiChevronRightGoogle />
        </CpmIconButton>
        <CpmIconButton label="Close evidence panel" onClick={onClose}>
          <ObiCloseGoogle />
        </CpmIconButton>
      </div>
    </div>
  );

  // Docked: non-modal, in the page flow. No backdrop, no focus trap — the matrix
  // stays operable, which is the entire point of not making this a dialog.
  if (docked) {
    return (
      <aside
        className="cpm-inspector"
        aria-label={`${gateKey} evidence for ${loopId}`}
        onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      >
        {head}
        <div className="cpm-inspector__body">
          <EvidenceBody loopId={loopId} gateKey={gateKey} windowKind={windowKind} />
        </div>
      </aside>
    );
  }

  return <ModalEvidence head={head} loopId={loopId} gateKey={gateKey}
    windowKind={windowKind} onClose={onClose} />;
};

/** Narrow-viewport placement: a genuine modal dialog, with the trap and restore. */
const ModalEvidence: React.FC<{
  head: React.ReactNode;
  loopId: string;
  gateKey: string;
  windowKind: string;
  onClose: () => void;
}> = ({ head, loopId, gateKey, windowKind, onClose }) => {
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose);
  return (
    <>
      <div className="cpm-modal-backdrop" onClick={onClose} />
      <div
        ref={dialogRef}
        className="cpm-inspector cpm-inspector--modal"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label={`${gateKey} evidence for ${loopId}`}
      >
        {head}
        <div className="cpm-inspector__body">
          <EvidenceBody loopId={loopId} gateKey={gateKey} windowKind={windowKind} />
        </div>
      </div>
    </>
  );
};

/**
 * "How to read this view", opened on demand from the pathway header.
 *
 * It is not resident. A three-step tutorial that occupies a column of a screen
 * engineers use daily is chrome, not help — so the column stays empty (and the
 * matrix full width) until someone asks for it, and it yields that column back
 * to evidence the moment a gate is opened.
 */
export const GateGuidePanel: React.FC<{
  summary?: CpmFleetSummary;
  onClose: () => void;
}> = ({ summary, onClose }) => (
  <aside
    id="cpm-gate-guide"
    className="cpm-inspector cpm-inspector--guide"
    aria-label="How to read the gate matrix"
    onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
  >
    <div className="cpm-inspector__head">
      <div className="cpm-inspector__title">
        <span className="cpm-eyebrow">How to read this view</span>
        <h2 className="cpm-panel-title">Gates tell you why.</h2>
      </div>
      <div className="cpm-inspector__nav">
        <CpmIconButton label="Close guidance" onClick={onClose}>
          <ObiCloseGoogle />
        </CpmIconButton>
      </div>
    </div>
    <div className="cpm-inspector__body">
      <ol className="cpm-copy cpm-guide-steps">
        <li>Pick a gate in the roll-up to see which loops it is holding back.</li>
        <li>Click any cell in the matrix to open the evidence behind that gate here.</li>
        <li>The result column is the fused verdict those gates produced.</li>
      </ol>
      {summary && (
        <>
          <PanelHead eyebrow="Diagnostic capability" title="What this fleet cannot yet decide" />
          <p className="cpm-copy cpm-guide-note">
            {noVpFleetCopy(summary.capability.loopsCappedByMissingVp)}{' '}
            {summary.capability.loopsWithoutDisturbanceContext} have no peer links, so
            stiction cannot be distinguished from an upstream disturbance.
          </p>
        </>
      )}
    </div>
  </aside>
);

export default GateEvidencePanel;
