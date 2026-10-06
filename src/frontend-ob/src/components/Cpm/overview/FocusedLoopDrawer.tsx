'use client';

/**
 * Focused-loop analysis panel — the latest fused verdict and its gate path.
 *
 * 2026-09-20 (docs/cpa-ui-fix-plan.md, Phase 1): the actions moved out of the
 * scrolling body into a footer that is always visible (the only button used to
 * sit below seventeen gate rows, off-screen on a 647 px viewport), the primary
 * action opens the LOOP (Explorer) rather than the fleet matrix, and each gate
 * row is a route to that gate's evidence on Performance.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { CpmIconButton, EmptyState, KvRow, PanelHead, TonePill, toneFor, QueryError } from '../shared';
import { buildTierGroups, gateTone } from '../gateStatus';
import { ObiChevronLeftGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-left-google';
import { ObiChevronRightGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-right-google';
import { ObiCloseGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-close-google';
import { useLatestGates } from '../../../hooks/useCpm';
import { ApiError } from '../../../api/apiFetch';
import { useDialogA11y } from '../../../hooks/useDialogA11y';
import { diagnosisLabel, codeLabel } from '../vocabulary';
import { hasVerdict } from '../metricAvailability';
import { evidenceScoreText } from '../evidenceScore';

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—';

// ── focused-loop drawer (real evidence path) ───────────────────────────────

export const FocusedLoopDrawer: React.FC<{
  loopId: string;
  onClose: () => void;
  /** Primary: the loop hub (Explorer › Summary). */
  onOpenLoop: () => void;
  /** Secondary: this loop's row in the fleet matrix. */
  onOpenMatrix: () => void;
  /** A gate row: that gate's evidence panel on Performance. */
  onOpenGate: (gate: string) => void;
  /** Walk the priority queue without closing; undefined at the ends. */
  onPrev?: () => void;
  onNext?: () => void;
}> = ({ loopId, onClose, onOpenLoop, onOpenMatrix, onOpenGate, onPrev, onNext }) => {
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose);
  const gates = useLatestGates(loopId, '24h');
  const { data: matrix, isLoading } = gates;
  // 404 means "no fused window yet" — a real answer. Anything else is a failure
  // and must not be presented as an absence of evidence.
  const fetchFailed = gates.isError
    && !(gates.error instanceof ApiError && gates.error.status === 404);

  const tiers = React.useMemo(() => {
    const cells = matrix?.gates ?? [];
    const byKey = new Map(cells.map(c => [c.key, c]));
    return buildTierGroups(cells.map(c => c.key))
      .map(g => ({ label: g.label, cells: g.keys.map(k => byKey.get(k)!).filter(Boolean) }))
      .filter(g => g.cells.length > 0);
  }, [matrix]);
  return (
    <>
      <div className="cpm-modal-backdrop" onClick={onClose} />
      {/*
        Shared inspector shell: sticky header, scrolling body, fixed footer, and
        prev/next so the priority queue can be walked in place. The layer is the
        app dialog layer (cpm.css) — the top bar is a grid item with z-index 100
        and used to paint over this panel.
      */}
      <div
        ref={dialogRef}
        className="cpm-inspector cpm-inspector--modal cpm-inspector--wide"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label={`Focused analysis for ${loopId}`}
      >
        <div className="cpm-inspector__head">
          <div className="cpm-inspector__title">
            <span className="cpm-eyebrow">Focused loop analysis</span>
            <h2 className="cpm-panel-title">{loopId}</h2>
          </div>
          <div className="cpm-inspector__nav">
            <CpmIconButton label="Previous loop in the queue" disabled={!onPrev}
              onClick={() => onPrev?.()}>
              <ObiChevronLeftGoogle />
            </CpmIconButton>
            <CpmIconButton label="Next loop in the queue" disabled={!onNext}
              onClick={() => onNext?.()}>
              <ObiChevronRightGoogle />
            </CpmIconButton>
            <CpmIconButton label="Close focused analysis" onClick={onClose}>
              <ObiCloseGoogle />
            </CpmIconButton>
          </div>
        </div>
        <div className="cpm-inspector__body">
          {isLoading && <EmptyState title="Loading latest verdict…" />}
          {fetchFailed && (
            <QueryError title="Verdict unavailable"
              error={gates.error} retry={() => void gates.refetch()} />
          )}
          {!isLoading && !matrix && !fetchFailed && (
            <EmptyState title="No fused verdict yet"
              copy="This loop has not completed a 12h/24h evaluation window." />
          )}
          {matrix && (
            <>
              <div className={`cpm-kpi cpm-kpi--${toneFor(matrix.diagnosis)}`} style={{ margin: '12px 0' }}>
                <span className="cpm-kpi__caption">Primary diagnosis</span>
                <span className="cpm-kpi__value">{diagnosisLabel(matrix.diagnosis)}</span>
                <span className="cpm-kpi__sub">
                  {matrix.confidence != null && hasVerdict(matrix.diagnosis) ? `${evidenceScoreText(matrix.confidence)} · ` : ''}
                  {matrix.windowKind} window ending {fmtTime(matrix.windowEnd)}
                </span>
              </div>
              <PanelHead eyebrow="Evidence path" title="Gate statuses on this window" />
              {/* Grouped by tier with the same helper the Performance matrix and
                  the Explorer use. Each status is a route to that gate's evidence
                  panel (same loop, same window kind, cached gates/latest). */}
              {tiers.map(tier => (
                <section key={tier.label} className="cpm-gate-tier">
                  <h3 className="cpm-gate-tier__label">{tier.label}</h3>
                  {tier.cells.map(g => (
                    <KvRow key={g.key} label={`${g.key} · ${g.name}`}>
                      <ObcButton variant="flat" className="cpm-gate-link"
                        title={`Open ${g.key} evidence for ${loopId} on Performance`}
                        onClick={() => onOpenGate(g.key)}>
                        <TonePill tone={gateTone(g.status, g.key)}>{codeLabel(g.status)}</TonePill>
                      </ObcButton>
                    </KvRow>
                  ))}
                </section>
              ))}
              {matrix.insufficientEvidenceReason && (
                <p className="cpm-copy" style={{ marginTop: 8 }}>
                  {matrix.insufficientEvidenceReason}
                </p>
              )}
            </>
          )}
        </div>
        <div className="cpm-inspector__foot">
          <ObcButton variant="raised" title={`Open ${loopId} in the Loop Explorer`} onClick={onOpenLoop}>
            Open loop ›
          </ObcButton>
          <ObcButton variant="normal" title={`Select ${loopId} in the Performance matrix`} onClick={onOpenMatrix}>
            Fleet matrix ›
          </ObcButton>
        </div>
      </div>
    </>
  );
};

export default FocusedLoopDrawer;
