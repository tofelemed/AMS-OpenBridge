/**
 * The loop's assessment as one row in the band, on the Summary tab only: the latest window, the result and one fact line, with
 * the age and any blocking count so a stale or blocked loop cannot look fine without a click. Review evidence → is the next step
 * (the Evidence Workbench); everything else opens in Open details: the full card, next check, limitations, readiness,
 * instrument health and location.
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
import { fmtLocation } from '../../context/LoopContextBar';
import { FacetPill, instrumentHealthText } from '../../FacetPill';
import { TransmitterHealthPanel, loopHealthSummary } from '../../health/TransmitterHealthPanel';
import { useInstrumentHealth } from '../../health/useInstrumentHealth';
import { serviceName } from '../../loopName';
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
  const [healthOpen, setHealthOpen] = useState(false);
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
  // Missing facts are left out, never shown as zero.
  const fact = [inBand != null ? `${Math.round(inBand * 100)} % in band` : '', persisting !== '—' ? persisting : '', score].filter(Boolean).join(' · ');
  const facts = [serviceName(loop), loop.loopType, loop.criticality && `criticality ${loop.criticality}`, fmtLocation(loop)].filter(Boolean).join(' · ');

  return (
    <>
      <div className="cpm-band__result">
        {gates.data?.windowEnd && <span className="cpm-band__meta">Latest {windowKind} · {fmtWhen(gates.data.windowEnd)}</span>}
        <strong>{result}</strong>
        {fact && <span className="cpm-band__meta">{fact}</span>}
        {age && <span className="cpm-band__tag">window ended {age}</span>}
        {!!summary?.blocking && <span className="cpm-band__tag">{summary.blocking} blocking</span>}
      </div>
      <div className="cpm-band__end">
        <ObcButton variant="flat" onClick={() => navigate(workbenchExit(loop.loopId, gates.data, windowKind).href)}>Review evidence →</ObcButton>
        <ObcButton variant="flat" onClick={() => setOpen(true)}>Open details</ObcButton>
      </div>

      {createPortal(
        <Dialog open={open} onClose={close} size="wide" title={`Loop summary · ${loop.loopId}`}>
          <p className="cpm-copy">{facts}</p>
          <button type="button" className="cpm-pill-button" aria-expanded={healthOpen} title="Transmitter health (Instrumental NE107)"
            onClick={() => setHealthOpen(v => !v)}>
            <FacetPill facet="health" tone={health.tone}>{instrumentHealthText(health.label)}</FacetPill>
          </button>
          {healthOpen && (
            <div className="cpm-health-drawer">
              <TransmitterHealthPanel health={instrumentHealth.data} loading={instrumentHealth.isLoading} error={instrumentHealth.error} />
            </div>
          )}
          {gates.data && (
            <LoopSummaryCard loop={loop} matrix={gates.data} windowKind={windowKind} healthLabel={health.label} onLeave={close}
              more={readinessInCard && summary ? <ReadinessBar summary={summary} onTab={t => { close(); onTab(t); }} /> : undefined}
              moreLine={readinessInCard && summary ? readinessLine(summary) : undefined} />
          )}
          {summary && !readinessInCard && <ReadinessBar summary={summary} onTab={t => { close(); onTab(t); }} />}
        </Dialog>,
        document.body,
      )}
    </>
  );
};

export default LoopSummaryRow;
