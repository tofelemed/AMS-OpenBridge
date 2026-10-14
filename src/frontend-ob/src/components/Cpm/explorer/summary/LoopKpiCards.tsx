/**
 * KPI Phase 4: this loop's KPIs on the Loop Explorer summary — the same compact cards as the Overview, for one loop and its
 * newest 24 h window: value, the engine gate (or fleet rule) that judges it, the change since the window 24 h earlier, and a
 * card link to where the number is proven (Calculations, the trend over that window, or the Window Inspector).
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CpmLoop } from '../../../../api/cpmApi';
import { getLoopKpis } from '../../../../api/cpm/loopKpis';
import { EmptyState, PanelHead, QueryError, fmtDateTime } from '../../shared';
import { calculationsHref, historicalHref, windowsHref } from '../../cpaHref';
import { KpiCard } from '../../kpi/KpiCard';
import { LOOP_KPI_GROUPS, loopKpiCards, type LoopKpiCardModel } from '../../kpi/loopKpiView';

export const LoopKpiCards: React.FC<{ loop: CpmLoop; windowKind?: string }> = ({ loop, windowKind = '12h' }) => {
  const q = useQuery({
    queryKey: ['cpm', 'loop-kpis', loop.loopId, windowKind],
    queryFn: ({ signal }) => getLoopKpis(loop.loopId, windowKind, signal),
    refetchInterval: 5 * 60_000,
  });
  const k = q.data;
  const end = k?.current?.windowEnd ?? null;
  // CHG-092 (SME 2 #9): the trend covers THIS window (12 h or 24 h), not always 24 h; Calculations opens the card's metric
  const hours = windowKind === '24h' ? 24 : 12;
  const from = end ? new Date(Date.parse(end) - hours * 3600_000).toISOString() : null;
  const hrefOf = (c: LoopKpiCardModel) =>
    c.proof === 'calculations' ? calculationsHref(loop.loopId, { kind: windowKind, metric: c.metric })
      : c.proof === 'windows' ? windowsHref(loop.loopId, { profile: windowKind, window: end })
        : historicalHref(loop.loopId, { from, to: end });

  return (
    <section className="cpm-summary-section" aria-label="Loop KPIs">
      <PanelHead eyebrow={`Loop KPIs · ${windowKind} window${end ? ` ending ${fmtDateTime(end)}` : ''}`}
        title="How this loop performs"
        right={k?.previous ? <span className="cpm-op__muted">change vs the window 24 h earlier</span> : undefined} />
      {q.isError && <QueryError title="Loop KPIs unavailable" error={q.error} retry={() => void q.refetch()} />}
      {k && !k.current && <EmptyState title={`No ${windowKind} window yet`} copy="The KPIs appear once this loop completes an evaluation window." />}
      {/* CHG-092 (SME review 2 #22): grouped by what they tell the engineer; the cards that bear on the finding are outlined */}
      {k?.current && LOOP_KPI_GROUPS.map(gr => {
        const cards = loopKpiCards(k).filter(c => c.group === gr.id);
        if (!cards.length) return null;
        return (
          <div key={gr.id} className="cpm-kpigroup" role="group" aria-label={gr.title}>
            <h4 className="cpm-kpigroup__title">{gr.title}</h4>
            <div className="cpm-kpicards cpm-kpicards--loop">
              {cards.map(c => (
                <KpiCard key={c.key} Icon={c.Icon} value={c.value} label={c.label} sub={c.sub} tone={c.tone} delta={c.delta}
                  relevant={c.relevant}
                  title={`${c.title}${c.relevant ? " Bears on this loop's current finding." : ''} Open to see where this number comes from.`}
                  to={hrefOf(c)} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
};

export default LoopKpiCards;
