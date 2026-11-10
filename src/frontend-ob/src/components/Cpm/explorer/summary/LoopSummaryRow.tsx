/**
 * The loop's assessment in the band, on the Summary tab only: the result with the age and any blocking count on one line, so a
 * stale or blocked loop cannot look fine without a click, and one fact line under it. CHG-158 (owner review): the window end is
 * said once — its age when old (the time on hover), else its time — and not with the window kind the page switch shows.
 * Review evidence → is the next step (the Evidence Workbench); Open details holds the full card, next check, readiness and
 * limitations. The dialog does not repeat who the loop is: the band names it, Loop model & setup holds its type and criticality.
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../../api/cpmApi';
import { useCpmEvents, useCpmReadiness, useLatestGates } from '../../../../hooks/useCpm';
import { Dialog } from '../../../../ui/Dialog';
import { evidenceScoreText } from '../../evidenceScore';
import { hasVerdict } from '../../metricAvailability';
import { persistingText } from '../../overview/priorityReason';
import { fmtWhen } from '../../blocks/whenText';
import { HISTORY_QUERY } from '../historyQuery';
import { loopHealthSummary } from '../../health/TransmitterHealthPanel';
import { useInstrumentHealth } from '../../health/useInstrumentHealth';
import ReadinessBar, { readinessLine } from '../ReadinessBar';
import { isNoVerdictYet } from '../LoopWorkspace';
import { readinessCauses, type ExplorerTab } from '../readinessCauses';
import LoopSummaryCard, { workbenchExit } from './LoopSummaryCard';
import { useLoopKpis } from './useLoopKpis';
import { conditionOf, windowAgeOf } from './summaryText';

export const LoopSummaryRow: React.FC<{
  loop: CpmLoop;
  windowKind: string;
  onTab: (t: ExplorerTab) => void;
}> = ({ loop, windowKind, onTab }) => {
  const navigate = useNavigate();
  const gates = useLatestGates(loop.loopId, windowKind);
  // The same queries as the tabs and the KPI cards, so the band costs no request of its own.
  const events = useCpmEvents({ loopId: loop.loopId, ...HISTORY_QUERY });
  const kpis = useLoopKpis(loop.loopId, windowKind);
  const readiness = useCpmReadiness(loop.loopId);
  const instrumentHealth = useInstrumentHealth(loop.loopId);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const failed = gates.isError && !isNoVerdictYet(gates.error);
  const condition = conditionOf(gates.data?.diagnosis ?? 'NOT_EVALUATED');
  const result = gates.isLoading ? 'Loading…' : failed ? 'Verdict unavailable' : condition.label;
  const age = gates.data ? windowAgeOf(gates.data, windowKind) : null;
  const summary = readinessCauses(readiness.data, loop.loopId);
  const readinessInCard = !!gates.data && !!summary && summary.blocking === 0;
  const health = loopHealthSummary(instrumentHealth.data);
  const inBand = kpis.data?.current?.values.good_error_pct;
  const openEpisode = events.data?.events.find(e => e.window_kind === windowKind && !e.closed_at);
  const persisting = persistingText(openEpisode?.opened_at ?? null, Date.now());
  const score = gates.data && hasVerdict(gates.data.diagnosis) ? evidenceScoreText(gates.data.confidence) : '';
  const ended = gates.data?.windowEnd ? fmtWhen(gates.data.windowEnd) : '';
  // Missing facts are left out, never shown as zero. A recent window says when it ended here; an old one says its age above.
  const fact = [
    !age && ended ? `window ended ${ended}` : '',
    inBand != null ? `${Math.round(inBand * 100)} % in band` : '', persisting !== '—' ? persisting : '', score,
  ].filter(Boolean).join(' · ');

  return (
    <>
      <div className="cpm-band__result cpm-band__result--stack">
        <p className="cpm-band__headline">
          <strong>{result}</strong>
          {age && <span className="cpm-band__tag" title={`The latest ${windowKind} window ended ${ended}`}>window ended {age}</span>}
          {!!summary?.blocking && <span className="cpm-band__tag">{summary.blocking} blocking</span>}
        </p>
        {fact && <p className="cpm-band__facts">{fact}</p>}
      </div>
      <div className="cpm-band__end">
        <ObcButton variant="normal" onClick={() => navigate(workbenchExit(loop.loopId, gates.data, windowKind).href)}>Review evidence →</ObcButton>
        <ObcButton variant="normal" onClick={() => setOpen(true)}>Open details</ObcButton>
      </div>

      {createPortal(
        <Dialog open={open} onClose={close} size="wide" title="Loop summary">
          {gates.data && (
            <LoopSummaryCard loop={loop} matrix={gates.data} windowKind={windowKind} healthLabel={health.label} onLeave={close}
              more={readinessInCard && summary ? <ReadinessBar summary={summary} onTab={t => { close(); onTab(t); }} /> : undefined}
              moreLine={readinessInCard && summary ? readinessLine(summary) : undefined}
              readiness={summary && !readinessInCard ? <ReadinessBar summary={summary} onTab={t => { close(); onTab(t); }} /> : undefined} />
          )}
          {!gates.data && summary && <ReadinessBar summary={summary} onTab={t => { close(); onTab(t); }} />}
        </Dialog>,
        document.body,
      )}
    </>
  );
};

export default LoopSummaryRow;
