'use client';

/**
 * The selected 24h window, full width.
 *
 * It used to share a two-column row with a "Maintenance correlation" panel whose
 * only content was "No CMMS integration configured" — half a row, permanently,
 * for an unimplemented feature, while the window's own five key/value rows were
 * squeezed into the other half. The CMMS copy is honest and worth keeping, so it
 * became a caption instead of a panel.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpmApi';
import { EmptyState, KvRow, PanelHead, TonePill, fmtDateTime, toneFor } from '../shared';

export const SelectedWindowPanel: React.FC<{
  window: CpmGateMatrix | undefined;
  /** True when the ?window= deep link named a window outside the applied range. */
  fellBack: boolean;
  /** No windows at all in range — a different problem from "none selected". */
  noWindows: boolean;
  onWiden: () => void;
  onReplay: (windowEnd: string | null) => void;
}> = ({ window: win, fellBack, noWindows, onWiden, onReplay }) => (
  <section className="cpm-surface">
    <PanelHead
      eyebrow="Selected period"
      title={win?.windowEnd
        ? `24h window ending ${fmtDateTime(win.windowEnd)}`
        : noWindows ? 'Nothing to inspect in this range' : 'No window selected'}
    />

    {/* "Click a diagnosis band above" was an instruction you could not follow
        when there were no bands. Separate the two states and give the empty one
        a way out. */}
    {!win && noWindows && (
      <EmptyState
        title="This loop completed no 24h windows in this range"
        copy="Fused verdicts exist only where a full evaluation window closed."
        action={{ label: 'Widen to 30 days', onClick: onWiden }}
      />
    )}
    {!win && !noWindows && <EmptyState title="Click a verdict band in the chart above" />}

    {fellBack && (
      <p className="cpm-copy" role="status">
        The window this link pointed at is not in the current range — showing the
        newest evaluated window instead.
      </p>
    )}

    {win && (
      <>
        <div className="cpm-window-grid">
          <div>
            <KvRow label="Verdict">
              <TonePill tone={toneFor(win.diagnosis)}>
                {(win.diagnosis ?? 'NONE').replace(/_/g, ' ')}
              </TonePill>
            </KvRow>
            <KvRow label="Confidence">
              {win.confidence != null ? `${(win.confidence * 100).toFixed(0)}%` : '—'}
            </KvRow>
            <KvRow label="Samples">{win.sampleCount ?? '—'}</KvRow>
          </div>
          <div>
            <KvRow label="Window from">
              {win.windowStart ? fmtDateTime(win.windowStart) : '—'}
            </KvRow>
            <KvRow label="Window to">
              {win.windowEnd ? fmtDateTime(win.windowEnd) : '—'}
            </KvRow>
            <KvRow label="Calculation">
              v{win.metadata.calculationVersion ?? '—'} · profile v
              {win.metadata.dynamicsProfileVersion ?? '—'}
            </KvRow>
          </div>
        </div>

        {win.insufficientEvidenceReason && (
          <p className="cpm-copy">{win.insufficientEvidenceReason}</p>
        )}

        <div className="cpm-window-actions">
          <ObcButton variant="raised" onClick={() => onReplay(win.windowEnd)}>
            Replay this period ›
          </ObcButton>
          <span className="cpm-copy cpm-hist-note">
            No CMMS integration configured, so no work orders are correlated here.
            Nothing is shown because nothing is known — not because nothing happened.
          </span>
        </div>
      </>
    )}
  </section>
);

export default SelectedWindowPanel;
