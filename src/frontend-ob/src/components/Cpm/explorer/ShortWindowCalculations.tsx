'use client';

/**
 * Explorer › Calculations on a short window (CHG-158, the owner's image): "Latest 5m short window · ended …" over
 * "Per-window features", the G0–G4 and G2r checks as small labels in one row (the shared gate marks), then the window's
 * metrics. Fusion never runs on short windows, so there is no gate dialog; the window's history is in Window Inspector
 * (Short windows ↗ in the foot). `tools` is the page's Window dropdown and Full catalogue →, kept in the head in every state.
 */
import React from 'react';
import type { CpmLoop } from '../../../api/cpmApi';
import { useCpmKpis } from '../../../hooks/useCpm';
import { GateBadge } from '../../../ui/GateBadge';
import { EmptyState, PanelHead, QueryError } from '../shared';
import { pipelineHref } from '../cpaHref';
import { gateName } from '../gateStatus';
import { fmtWhen } from '../blocks/whenText';
import { SHORT_GATES, WindowResults, isDeclined } from '../windows/WindowResults';
import { flagStatus } from '../windows/WindowDialogs';

export const ShortWindowCalculations: React.FC<{ loop: CpmLoop; kind: string; tools: React.ReactNode }> = ({ loop, kind, tools }) => {
  const kpis = useCpmKpis(loop.loopId, kind, 1);
  const row = kpis.data?.samples?.[0];
  const declined = row ? isDeclined(row, 'short') : false;
  return (
    <>
      <PanelHead eyebrow={`Latest ${kind} short window${row ? ` · ended ${fmtWhen(row.window_end)}` : ''}`} title="Per-window features" right={tools} />
      {kpis.isLoading && <EmptyState level={2} title="Loading…" />}
      {kpis.isError && <QueryError title="Window results unavailable" error={kpis.error} retry={() => void kpis.refetch()} />}
      {!kpis.isLoading && !kpis.isError && !row && (
        <EmptyState level={2} title={`No ${kind} windows stored yet`}
          copy="Rows appear once the analysis engine has evaluated a window of this size. Check Pipeline Health if they are overdue."
          next={[{ label: 'Pipeline Health', to: pipelineHref() }]} />
      )}
      {row && (
        <>
          <ul className="cpm-short-gates" aria-label="Short-window checks">
            {SHORT_GATES.map(g => (
              <li key={g.key} className="cpm-short-gate" title={gateName(g.key)}>
                <strong>{g.key}</strong>
                <GateBadge status={flagStatus(row, g.key, g.field, declined)} gate={g.key} />
              </li>
            ))}
          </ul>
          <WindowResults row={row} tier="short" />
        </>
      )}
    </>
  );
};

export default ShortWindowCalculations;
