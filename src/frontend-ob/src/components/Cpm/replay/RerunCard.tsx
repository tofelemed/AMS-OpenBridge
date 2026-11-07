/**
 * Task 18: the Re-run card in Replay's right column. It owns the run (so its state survives closing the dialog) and
 * refreshes the page's window reads when the run has its stored result. The finished run opens in the Workbench, the way
 * the Evaluate control opens it; the original stays on this page.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EVALUATION_KINDS, type EvaluationKind } from '../../../api/cpm/evaluation';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { useAuthStore } from '../../../store/authStore';
import { PanelHead, TonePill } from '../shared';
import { ReasonedButton } from '../ReasonedButton';
import { windowLabel } from '../windowLabel';
import { workbenchHref } from '../evidence/selection';
import { RerunDialog } from './RerunDialog';
import { useRerun } from './useRerun';
import { useRefreshOnRerun } from './useRefreshOnRerun';

export const RerunCard: React.FC<{ loopId: string; row: CpmGateMatrix; timeZone: string }> = ({ loopId, row, timeZone }) => {
  const navigate = useNavigate();
  const canCreate = useAuthStore(s => s.hasPermission('cpm.analysis.create'));
  const [open, setOpen] = useState(false);
  const endMs = row.windowEnd ? Date.parse(row.windowEnd) : NaN;
  const kind = row.windowKind as EvaluationKind;
  const supported = (EVALUATION_KINDS as readonly string[]).includes(row.windowKind) && Number.isFinite(endMs);
  const state = useRerun(loopId, `${row.windowKind}|${row.windowEnd}`);
  useRefreshOnRerun(!!state.verdictRunId);

  const reason = !canCreate ? 'Needs the cpm.analysis.create permission'
    : !supported ? 'Only 4h, 12h and 24h windows can be re-run' : null;
  const { run, status } = state;
  return (
    <section className="cpm-surface">
      <PanelHead title="Re-run"
        right={run && status && <TonePill tone={status.tone}>{run.state}</TonePill>} />
      <p className="cpm-copy">Check the configuration before creating a new run.</p>
      <p className="cpm-copy">Original evidence stays unchanged.</p>
      <div className="cpm-filter-row">
        <ReasonedButton variant="raised" disabled={!!reason} reason={reason} onClick={() => setOpen(true)}>Re-run this window</ReasonedButton>
      </div>
      <RerunDialog open={open} onClose={() => setOpen(false)} windowText={windowLabel(row, timeZone)} state={state}
        onCreate={() => state.submit(kind, endMs)}
        onOpenRun={() => {
          if (!run || !state.verdictRunId) return;
          navigate(workbenchHref(loopId, state.verdictRunId, 'G15', { analysisRun: run.analysisRunId }));
        }} />
    </section>
  );
};
