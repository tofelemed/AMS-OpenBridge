'use client';

/**
 * CHG-139: the selected window, beside the list of evaluated windows. Result, period, four KPIs, then Review this window →
 * (the Evidence Workbench on this window's run), Replay, Fit to this window, Evidence package, and the evidence score with
 * its ?. Samples and the calculation version sit behind Technical details. A KPI the window never stored reads
 * "Not stored", never 0; a window without a run says why it cannot be reviewed.
 */
import { conditionOf, isJudged } from '../explorer/summary/summaryText';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ReasonedButton } from '../ReasonedButton';
import { EmptyState, KvRow, PanelHead, TonePill, diagnosisBand } from '../shared';
import { workbenchHref } from '../evidence/selection';
import { fmtWhen } from '../blocks/whenText';
import { EVIDENCE_SCORE_HELP, evidenceScore } from '../evidenceScore';
import { Toggletip } from '../../../ui/Toggletip';
import { TechnicalDetails } from '../../../ui/TechnicalDetails';
import { NotStored, pctOf } from './EvaluatedWindows';
import { packageReason, type HistoryWindow } from './useWindowKpis';

/** The run to open for a window: its fused verdict (G15), else the first gate that carries one. */
export function windowRun(win: Pick<HistoryWindow, 'methodRunIds' | 'gates'>): { methodRunId: string; gate: string } | null {
  const ids = win.methodRunIds ?? {};
  if (ids.G15) return { methodRunId: ids.G15, gate: 'G15' };
  const g15 = win.gates.find(g => g.key === 'G15' && g.methodRunId);
  if (g15?.methodRunId) return { methodRunId: g15.methodRunId, gate: 'G15' };
  const any = win.gates.find(g => g.methodRunId);
  if (any?.methodRunId) return { methodRunId: any.methodRunId, gate: any.key };
  const [gate, id] = Object.entries(ids)[0] ?? [];
  return gate && id ? { methodRunId: id, gate } : null;
}

const Kpi: React.FC<{ caption: string; value: string | null }> = ({ caption, value }) => (
  <div className="cpm-kpi">
    <span className="cpm-kpi__caption">{caption}</span>
    <span className="cpm-kpi__value">{value ?? <NotStored />}</span>
  </div>
);

const maeText = (v: number | undefined) => (v != null && Number.isFinite(v) ? String(Number(v.toPrecision(3))) : null);

export const SelectedWindowPanel: React.FC<{
  loopId: string | undefined;
  window: HistoryWindow | undefined;
  /** True when the ?window= deep link named a window outside the applied range. */
  fellBack: boolean;
  /** No windows at all in range — a different problem from "none selected". */
  noWindows: boolean;
  onWiden: () => void;
  /** Sets the chart range to this window, keeping it selected. */
  onFit: () => void;
  onReplay: (windowEnd: string) => void;
  onPackage: () => void;
  /** False for a window older than the full rows: it has a summary, not an evidence package. */
  packageReady: boolean;
}> = ({ loopId, window: win, fellBack, noWindows, onWiden, onFit, onReplay, onPackage, packageReady }) => {
  const navigate = useNavigate();
  const run = win ? windowRun(win) : null;
  const band = win ? diagnosisBand(win.diagnosis) : null;
  const score = win && isJudged(conditionOf(win.diagnosis).kind) ? evidenceScore(win.confidence) : null;
  return (
    <section className="cpm-surface cpm-hist-selected">
      <PanelHead title="Selected window" />

      {!win && noWindows && (
        <EmptyState
          title="This loop completed no evaluated windows in this range"
          copy="Fused verdicts exist only where a full evaluation window closed."
          action={{ label: 'Widen to 30 days', onClick: onWiden }}
        />
      )}
      {!win && !noWindows && !fellBack && <EmptyState title="No window selected" copy="Choose one in the list or on the Result lane." />}

      {fellBack && (
        <p className="cpm-copy" role="status">
          The window this link pointed at is not in the current range, so none is selected. Choose one in the list, or widen the range.
        </p>
      )}

      {win && band && (
        <>
          <div className="cpm-hist-selected__result">
            <TonePill tone={band.tone}>{band.label}</TonePill>
            <span>{win.windowStart ? `${fmtWhen(win.windowStart)} to ${fmtWhen(win.windowEnd)}` : `Ending ${fmtWhen(win.windowEnd)}`}</span>
          </div>

          <div className="cpm-kpi-row cpm-hist-kpis">
            <Kpi caption="In band" value={pctOf(win.metrics?.good_error_pct)} />
            <Kpi caption="Time in normal mode" value={pctOf(win.metrics?.auto_pct)} />
            <Kpi caption="MAE" value={maeText(win.metrics?.mae)} />
            <Kpi caption="Saturation" value={pctOf(win.metrics?.saturation_pct)} />
          </div>

          {win.insufficientEvidenceReason && <p className="cpm-copy">{win.insufficientEvidenceReason}</p>}

          <div className="cpm-hist-selected__actions">
            <span title={run && loopId ? `Open the ${run.gate} run ${run.methodRunId} of this window in the Evidence Workbench` : undefined}>
              <ReasonedButton variant="raised" disabled={!run || !loopId}
                reason="Stored before analysis runs were kept (before v2.5), so there is no run to open — use Replay"
                onClick={() => { if (run && loopId) navigate(workbenchHref(loopId, run.methodRunId, run.gate)); }}>
                Review this window →
              </ReasonedButton>
            </span>
            <div className="cpm-hist-selected__links">
              <ObcButton variant="flat" onClick={() => onReplay(win.windowEnd)}>Replay ↗</ObcButton>
              <ObcButton variant="flat" onClick={onFit}>Fit to this window</ObcButton>
              <ReasonedButton variant="flat" disabled={!packageReady} onClick={onPackage}
                reason={packageReason(win.windowEnd)}>
                Evidence package ↗
              </ReasonedButton>
            </div>
          </div>

          <KvRow label="Evidence score">
            {score != null ? score : <span className="cpm-hist-missing">{isJudged(conditionOf(win.diagnosis).kind) ? 'Not stored' : 'No verdict in this window'}</span>}
            <Toggletip variant="how-to" label="About score"><p>{EVIDENCE_SCORE_HELP}</p></Toggletip>
          </KvRow>

          <TechnicalDetails items={[
            { label: 'Samples', value: win.sampleCount, mono: false },
            { label: 'Calculation', value: win.calculation ?? null, mono: false },
          ]} />
        </>
      )}
    </section>
  );
};

export default SelectedWindowPanel;
