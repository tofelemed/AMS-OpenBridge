'use client';

/**
 * Explorer › Calculations on a short window (CHG-158, owner review): the newest stored window of that size, its G0–G4 and
 * G2r checks in the gate table's words, and its metrics. Fusion never runs on short windows, so there is no gate dialog;
 * the window's history is in Window Inspector (Short windows ↗ in the foot).
 */
import React from 'react';
import type { CpmLoop } from '../../../api/cpmApi';
import type { CpmGateCell } from '../../../api/cpm/gates';
import { useCpmKpis } from '../../../hooks/useCpm';
import { EmptyState, QueryError } from '../shared';
import { pipelineHref } from '../cpaHref';
import { gateName } from '../gateStatus';
import { fmtWhen } from '../blocks/whenText';
import { SHORT_GATES, WindowResults, isDeclined } from '../windows/WindowResults';
import { flagStatus } from '../windows/WindowDialogs';
import CalculationsGateTable from './CalculationsGateTable';

export const ShortWindowCalculations: React.FC<{ loop: CpmLoop; kind: string }> = ({ loop, kind }) => {
  const kpis = useCpmKpis(loop.loopId, kind, 1);
  const row = kpis.data?.samples?.[0];
  if (kpis.isLoading) return <EmptyState level={2} title="Loading…" />;
  if (kpis.isError) return <QueryError title="Window results unavailable" error={kpis.error} retry={() => void kpis.refetch()} />;
  if (!row) {
    return (
      <EmptyState level={2} title={`No ${kind} windows stored yet`}
        copy="Rows appear once the analysis engine has evaluated a window of this size. Check Pipeline Health if they are overdue."
        next={[{ label: 'Pipeline Health', to: pipelineHref() }]} />
    );
  }
  const declined = isDeclined(row, 'short');
  const cells = SHORT_GATES.map(g => ({ key: g.key, name: gateName(g.key), status: flagStatus(row, g.key, g.field, declined) })) as unknown as CpmGateCell[];
  return (
    <>
      <p className="cpm-copy">window ending {fmtWhen(row.window_end)}</p>
      <CalculationsGateTable cells={cells} />
      <WindowResults row={row} tier="short" />
    </>
  );
};

export default ShortWindowCalculations;
