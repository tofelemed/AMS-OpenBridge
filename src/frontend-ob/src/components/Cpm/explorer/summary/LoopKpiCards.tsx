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
import { loopKpiCards, type LoopKpiCardModel } from '../../kpi/loopKpiView';

export const LoopKpiCards: React.FC<{ loop: CpmLoop; windowKind?: string }> = ({ loop, windowKind = '12h' }) => {
  const q = useQuery({
    queryKey: ['cpm', 'loop-kpis', loop.loopId, windowKind],
    queryFn: ({ signal }) => getLoopKpis(loop.loopId, windowKind, signal),
    refetchInterval: 5 * 60_000,
  });
  const k = q.data;
  const end = k?.current?.windowEnd ?? null;
  const from = end ? new Date(Date.parse(end) - 24 * 3600_000).toISOString() : null;
  const hrefOf = (c: LoopKpiCardModel) =>
    c.proof === 'calculations' ? calculationsHref(loop.loopId)
      : c.proof === 'windows' ? windowsHref(loop.loopId, { profile: windowKind, window: end })
        : historicalHref(loop.loopId, { from, to: end });

  return (
    <section className="cpm-summary-section" aria-label="Loop KPIs">
      <PanelHead eyebrow={`Loop KPIs · ${windowKind} window${end ? ` ending ${fmtDateTime(end)}` : ''}`}
        title="How this loop performs"
        right={k?.previous ? <span className="cpm-op__muted">change vs the window 24 h earlier</span> : undefined} />
      {q.isError && <QueryError title="Loop KPIs unavailable" error={q.error} retry={() => void q.refetch()} />}
      {k && !k.current && <EmptyState title={`No ${windowKind} window yet`} copy="The KPIs appear once this loop completes an evaluation window." />}
      {k?.current && (
        <div className="cpm-kpicards cpm-kpicards--loop">
          {loopKpiCards(k).map(c => (
            <KpiCard key={c.key} Icon={c.Icon} value={c.value} label={c.label} sub={c.sub} tone={c.tone} delta={c.delta}
              title={`${c.title} Open to see where this number comes from.`} to={hrefOf(c)} />
          ))}
        </div>
      )}
    </section>
  );
};

export default LoopKpiCards;
