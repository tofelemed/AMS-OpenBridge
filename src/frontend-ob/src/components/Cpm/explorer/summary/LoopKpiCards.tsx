/**
 * This loop's KPIs on the Loop Explorer summary — the same compact cards as the Overview, for one loop and its newest window of the
 * chosen kind: value, the change since the window 24 h earlier, and for coverage its bar. A card opens a dialog with its meaning, the
 * gate that judges it (Inspect Gn →) and where the number is proven, so every KPI keeps its drill-down. "Not measured in this
 * window" is said once, for the whole row of cards, not on each card.
 */
import { pipelineStep, usePipelineAccess } from '../../access';
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CpmLoop } from '../../../../api/cpmApi';
import { EmptyState, PanelHead, QueryError } from '../../shared';
import { calculationsHref, historicalHref, pipelineHref, windowsHref } from '../../cpaHref';
import { KpiCard } from '../../kpi/KpiCard';
import { LOOP_KPI_GROUPS, loopKpiCards, type LoopKpiCardModel } from '../../kpi/loopKpiView';
import LoopKpiDialog from './LoopKpiDialog';
import { useLoopKpis } from './useLoopKpis';

/** CHG-097 (SME review 2 #26): the signals each trend-proven KPI is read from (Historical shows these, the window shaded). */
const SIGNALS_OF: Record<string, string> = {
  service: 'pv,sp,op', variability: 'pv,sp', saturation: 'op,vp', sp: 'sp,pv',
};

export const LoopKpiCards: React.FC<{ loop: CpmLoop; windowKind?: string; gateKeys?: string[] }> = ({ loop, windowKind = '12h', gateKeys }) => {
  const canPipeline = usePipelineAccess();
  const q = useLoopKpis(loop.loopId, windowKind);
  const [, setParams] = useSearchParams();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const k = q.data;
  const end = k?.current?.windowEnd ?? null;
  // CHG-092 (SME 2 #9): the trend covers THIS window (12 h or 24 h); Calculations opens the card's metric
  const hours = windowKind === '24h' ? 24 : 12;
  const from = end ? new Date(Date.parse(end) - hours * 3600_000).toISOString() : null;
  const proofOf = (c: LoopKpiCardModel) =>
    c.proof === 'calculations' ? { label: 'Calculation proof ↗', href: calculationsHref(loop.loopId, { kind: windowKind, metric: c.metric }) }
      : c.proof === 'windows' ? { label: 'Window Inspector ↗', href: windowsHref(loop.loopId, { profile: windowKind, window: end }) }
        : { label: 'Historical ↗', href: historicalHref(loop.loopId, { from, to: end, kind: windowKind, window: end, signals: SIGNALS_OF[c.key] ?? null, focus: c.label }) };
  const cards = k?.current ? loopKpiCards(k) : [];
  const selected = cards.find(c => c.key === openKey);
  const inspect = (gate: string) => {
    setOpenKey(null);
    setParams(p => { p.set('gate', gate); return p; }, { replace: true });
  };

  return (
    <section className="cpm-summary-section" aria-label="Loop KPIs">
      <PanelHead title="Loop KPIs"
        right={cards.some(c => c.value === '—') ? <span className="cpm-op__muted">— not measured in this window</span> : undefined} />
      {q.isError && <QueryError title="Loop KPIs unavailable" error={q.error} retry={() => void q.refetch()} />}
      {/* CHG-098 (SME review 2 #29): what to try while there is no window. */}
      {k && !k.current && <EmptyState title="No evaluated window yet"
        copy="The KPIs appear once this loop completes an evaluation window. Switch 12 h / 24 h at the top of the page, or check Pipeline Health if a result is overdue."
        next={pipelineStep(canPipeline, pipelineHref())} />}
      {/* CHG-092 (SME review 2 #22): grouped by what they tell the engineer; the cards that bear on the finding are outlined */}
      {LOOP_KPI_GROUPS.map(gr => {
        const inGroup = cards.filter(c => c.group === gr.id);
        if (!inGroup.length) return null;
        return (
          <div key={gr.id} className="cpm-kpigroup" role="group" aria-label={gr.title}>
            <h3 className="cpm-kpigroup__title">{gr.title}</h3>
            <div className="cpm-kpicards cpm-kpicards--loop">
              {inGroup.map(c => (
                <KpiCard key={c.key} Icon={c.Icon} value={c.value} label={c.label} sub={c.sub} tone={c.tone}
                  relevant={c.relevant} bar={c.bar} title={c.title} onOpen={() => setOpenKey(c.key)} />
              ))}
            </div>
          </div>
        );
      })}
      {selected && <LoopKpiDialog card={selected} proof={proofOf(selected)} gateKeys={gateKeys} onInspect={inspect} onClose={() => setOpenKey(null)} />}
    </section>
  );
};

export default LoopKpiCards;
