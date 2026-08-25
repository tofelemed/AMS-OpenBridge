'use client';

/**
 * Focused-loop analysis panel — the latest fused verdict and its gate path.
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


/** echarts renders to canvas and cannot consume var(); resolve tokens once per render. */
const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—';

/**
 * Compact good-error% micro-bar for a priority-queue row (data already in the
 * rankings payload — no new endpoint). Good-error% is share of samples inside the
 * acceptable band (higher = better); MAE is the fallback text when % is absent.
 */

// ── focused-loop drawer (real evidence path) ───────────────────────────────

export const FocusedLoopDrawer: React.FC<{
  loopId: string;
  onClose: () => void;
  onExplore: () => void;
  /** Walk the priority queue without closing; undefined at the ends. */
  onPrev?: () => void;
  onNext?: () => void;
}> = ({ loopId, onClose, onExplore, onPrev, onNext }) => {
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
        This was the last `.cpm-drawer` on the product — fixed to top:0/right:0,
        which is where the app top bar and the live-events rail sit, so the
        panel's own title and Close button were occluded; and with the whole
        panel as one scroll box, Close scrolled away once you read past the
        fold. It now uses the shared inspector shell: sticky header, scrolling
        body, and prev/next so the priority queue can be walked in place.
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
              <span className="cpm-kpi__value">{(matrix.diagnosis ?? 'NONE').replace(/_/g, ' ')}</span>
              <span className="cpm-kpi__sub">
                {matrix.confidence != null ? `${(matrix.confidence * 100).toFixed(0)}% confidence · ` : ''}
                {matrix.windowKind} window ending {fmtTime(matrix.windowEnd)}
              </span>
            </div>
            <PanelHead eyebrow="Evidence path" title="Gate statuses on this window" />
            {/* Grouped by tier with the same helper the Performance matrix and
                the Explorer use — 17 flat rows here while the same gates were
                tiered two screens over was a structure difference with no
                reason behind it. */}
            {tiers.map(tier => (
              <section key={tier.label} className="cpm-gate-tier">
                <h3 className="cpm-gate-tier__label">{tier.label}</h3>
                {tier.cells.map(g => (
                  <KvRow key={g.key} label={`${g.key} · ${g.name}`}>
                    <TonePill tone={gateTone(g.status)}>{g.status.replace(/_/g, ' ')}</TonePill>
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
        <div className="cpm-inspector__actions">
          <ObcButton variant="raised" onClick={onExplore}>Continue in Performance →</ObcButton>
        </div>
        </div>
      </div>
    </>
  );
};


export default FocusedLoopDrawer;
