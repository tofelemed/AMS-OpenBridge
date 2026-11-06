/**
 * CHG-082 / CHG-085: /cpm?review=&reason=&site=&area=&unit= — the proof of one Overview KPI, in place on
 * Overview's own address (CHG-121). The old /cpm/kpi?kpi= opens it too, until the redirects are on.
 *
 * CHG-132: the number in the band, its trend, then the loops behind it: exactly the loops the KPI counted (server `total` =
 * its count), each with its measured value, verdict, window and links to the evidence. The calculation sits behind the
 * number's ?. The URL is the whole selection (shareable); the KPI, reason and range dropdowns rewrite it.
 */
import React, { useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObiChevronLeftGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-left-google';
import { KPI_TREND_RANGES, type FleetKpiKey } from '../../api/cpm/fleetKpis';
import { EmptyState, PanelHead, QueryError, TonePill, fmtDateTime } from './shared';
import { Toggletip } from '../../ui/Toggletip';
import { ListPager } from '../shared/ListPager';
import { useCpmScope } from './plantScope';
import { overviewHref } from './cpaHref';
import { useFleetKpiLoops, useFleetKpiTrend, useFleetKpis } from './kpi/useFleetKpis';
import { KpiTrendChart } from './kpi/KpiTrendChart';
import { kpiSeries, plantDayLabel, pointLabel, seriesRange } from './kpi/kpiTrend';
import { KPI_GROUPS, pct, reasonLabel } from './kpi/fleetKpiView';
import { KPI_WHY } from './kpi/kpiProof';
import { KPI_META, kpiDelta, kpiIconTone } from './kpi/kpiMeta';
import { KpiChange } from './kpi/KpiCard';
import { KpiCalculation } from './kpi/KpiCalculation';
import { KpiRowsTable } from './kpi/KpiRowsTable';
import { useStickyOffset } from './context/LoopContextBar';
import WindowKindToggle from './explorer/summary/WindowKindToggle';
import { WINDOW_KINDS, useWindowKind } from './useWindowKind';

const PAGE = 25;
const DRILL_ONLY: Array<{ key: FleetKpiKey; label: string }> = [
  { key: 'out-of-mode', label: 'Out of normal mode' },
  { key: 'finding', label: 'With a finding' },
  { key: 'symptom', label: 'Symptom only' },
  { key: 'no-fault-limited', label: 'No fault, but out of mode or at limit' },
  { key: 'all', label: 'All monitored loops' },
];

export const CpmKpiDrilldown: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const bandRef = useStickyOffset();
  const kpiParam = params.has('review') ? 'review' : 'kpi';
  const kpi = (params.get(kpiParam) ?? 'acceptable') as FleetKpiKey;
  const reason = params.get('reason');
  // KPI Phase 5: a picked trend day (its exact as-of instant); absent = now
  const day = params.get('day');
  const scope = useCpmScope();
  // CHG-089: the same fused window as the Overview card that opened this page (?window=, 12h default)
  const [windowKind, setWindowKind] = useWindowKind('window');
  const kscope = { ...scope.params, windowKind };
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const kpis = useFleetKpis(kscope);
  const list = useFleetKpiLoops({ kpi, reason, q: search.trim() || undefined, page: page + 1, pageSize: PAGE, asOf: day, ...kscope });
  // CHG-102: the trend range (?range= days; 14 by default) — up to the 3 years the daily KPI table keeps
  const rangeDays = KPI_TREND_RANGES.find(r => String(r.days) === params.get('range'))?.days ?? 14;
  const rangeLabel = KPI_TREND_RANGES.find(r => r.days === rangeDays)?.label ?? `${rangeDays} d`;
  const trend = useFleetKpiTrend(kscope, rangeDays);
  const trendDays = kpiSeries(trend.data, kpi);
  const pickedDay = day ? trendDays.find(d => d.asOf === day) : undefined;
  const range = seriesRange(trendDays);

  const k = kpis.data;
  const figure = k?.kpis.find(f => f.key === kpi) ?? list.data?.figure ?? null;
  // CHG-127: a bar state has no trend of its own, and is explained by the card it comes from
  const isBarState = kpi.startsWith('bar-');
  const measureKey = (list.data?.rows[0]?.rowKey ?? kpi) as FleetKpiKey;
  const meta = KPI_META[measureKey];
  const delta = k && figure && !isBarState ? kpiDelta(figure, k) : null;
  const options = useMemo(() => [
    ...KPI_GROUPS.flatMap(g => g.keys).map(key => ({ key, label: k?.kpis.find(f => f.key === key)?.label ?? key })),
    ...DRILL_ONLY,
    // CHG-127: a state of the Overview bar, so a segment's list can say which state it shows
    ...(k?.segments ?? []).map(s => ({ key: s.key, label: `State: ${s.label}` })),
  ], [k]);
  const go = (next: Record<string, string | null>) => {
    setPage(0);
    setParams(p => { for (const [key, v] of Object.entries(next)) { if (v) p.set(key, v); else p.delete(key); } return p; });
  };
  const label = figure?.label ?? options.find(o => o.key === kpi)?.label ?? 'KPI';
  const total = list.data?.total;
  const showReasons = kpi === 'not-assessable' && (k?.notAssessableByReason.length ?? 0) > 0;
  const loopsTitle = total == null ? 'Loading…' : [
    `${total} ${total === 1 ? 'loop' : 'loops'}`,
    reason && !showReasons ? reasonLabel(reason) : null,
    day ? (pickedDay?.day ? `${pointLabel(pickedDay, true)} (${plantDayLabel(trend.data)})` : `as of ${fmtDateTime(day)}`) : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="cpm-screen">
      {/* The dropdown shows the KPI's name, so the heading is for screen readers only. */}
      <h1 className="cpm-sr-only">{label}</h1>
      <div ref={bandRef} className="cpm-loop-context cpm-band" role="region" aria-label="KPI and its controls">
        <div className="cpm-band__row">
          <RouterLink className="cpm-link cpm-kpi-back" to={overviewHref(kscope)}>
            <span className="cpm-kpi-back__icon" aria-hidden><ObiChevronLeftGoogle /></span>Overview
          </RouterLink>
          <select className="cpm-select" aria-label="Show another KPI" value={kpi}
            onChange={e => go({ [kpiParam]: e.target.value, reason: null })}>
            {!options.some(o => o.key === kpi) && <option value={kpi}>{label}</option>}
            {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          {figure && (
            <span className="cpm-kpi-figure">
              {meta && <span className={`cpm-kpi-figure__icon cpm-kpicard__icon cpm-kpicard__icon--${kpiIconTone({ key: measureKey, count: figure.count })}`} aria-hidden><meta.Icon /></span>}
              <span className="cpm-kpicard__value">{figure.count}</span>
              <span className="cpm-kpicard__of">/ {figure.denominator} {figure.denominatorLabel}</span>
              <strong className="cpm-kpi-figure__share">{pct(figure.count, figure.denominator)} %</strong>
              {delta && delta.direction !== 'flat' && <KpiChange delta={delta} />}
            </span>
          )}
          {k && <KpiCalculation figure={figure} meta={meta} why={KPI_WHY[measureKey]} kpis={k} delta={delta} />}
          <div className="cpm-band__end">
            <WindowKindToggle value={windowKind} kinds={WINDOW_KINDS} onChange={k2 => { setPage(0); setWindowKind(k2); }} />
          </div>
        </div>
      </div>

      {kpis.isError && <QueryError title="KPI unavailable" error={kpis.error} retry={() => void kpis.refetch()} />}

      {!isBarState && (
      <section className="cpm-surface cpm-kpi-trend" aria-label={`Trend, last ${rangeLabel}`}>
        <PanelHead title="Trend"
          help={<Toggletip variant="how-to" label="How to read this trend">
            <p>Each bar is one {plantDayLabel(trend.data)} at its end, under the same rules.</p>
            <p>Click a day to list the loops it counted. Days with nothing kept read "no data", not 0 %.</p>
            {range && <p>Between {range.min} % and {range.max} % over the days with data.</p>}
          </Toggletip>}
          right={<>
            {day && <ObcButton variant="flat" onClick={() => go({ day: null })}>Back to now</ObcButton>}
            <select className="cpm-select cpm-kpi-range" aria-label="Trend range" value={rangeDays}
              onChange={e => go({ range: Number(e.target.value) === 14 ? null : e.target.value })}>
              {KPI_TREND_RANGES.map(r => <option key={r.days} value={r.days}>{r.label}</option>)}
            </select>
          </>} />
        {trend.isError && <QueryError title="The trend is unavailable" error={trend.error} retry={() => void trend.refetch()} />}
        {!trend.data && !trend.isError && <EmptyState title={`Loading the last ${rangeLabel}…`} />}
        {trend.data && (
          <>
            <KpiTrendChart trend={trend.data} kpi={kpi} selected={day} onPick={asOf => go({ day: asOf })} />
            {!range && <p className="cpm-op__basis">No day had anything to judge.</p>}
          </>
        )}
      </section>
      )}

      <section className="cpm-surface" aria-label="Loops behind this KPI">
        <div className="cpm-kpi-loops__head">
          <div className="cpm-title-row">
            <h2 className="cpm-panel-title">{loopsTitle}</h2>
            {total != null && !reason && (day
              ? pickedDay && total === pickedDay.count && <TonePill tone="good">matches that day</TonePill>
              : figure && total === figure.count && <TonePill tone="good">matches the KPI</TonePill>)}
          </div>
          <div className="cpm-kpi-loops__tools">
            {showReasons && (
              <select className="cpm-select" aria-label="Narrow by reason" value={reason ?? ''}
                onChange={e => go({ reason: e.target.value || null })}>
                <option value="">{`All reasons · ${k!.states.notAssessable}`}</option>
                {reason && !k!.notAssessableByReason.some(r => r.reason === reason)
                  && <option value={reason}>{`${reasonLabel(reason)} · 0`}</option>}
                {k!.notAssessableByReason.map(r => (
                  <option key={r.reason} value={r.reason}>{`${reasonLabel(r.reason)} · ${r.count}`}</option>
                ))}
              </select>
            )}
            <input className="cpm-input" type="search" value={search} aria-label="Search loops" placeholder="Search loop tag or name"
              onChange={e => { setSearch(e.target.value); setPage(0); }} />
          </div>
        </div>
        {list.isError && <QueryError title="The loop list is unavailable" error={list.error} retry={() => void list.refetch()} />}
        {list.data && list.data.rows.length === 0 && (
          <EmptyState title={search ? 'No loop matches the search' : 'No loop is in this KPI'}
            // CHG-098 (SME review 2 #29): the way out is a button, not only an instruction.
            action={search ? { label: 'Clear search', onClick: () => { setSearch(''); setPage(0); } } : undefined} />
        )}
        {list.data && list.data.rows.length > 0 && (
          <>
            <KpiRowsTable rows={list.data.rows} kpi={kpi} />
            <ListPager page={page} pageSize={PAGE} total={list.data.matched}
              pageCount={Math.max(1, Math.ceil(list.data.matched / PAGE))} onPageChange={setPage}
              note={search ? `${list.data.matched} of ${list.data.total} match the search` : undefined} />
          </>
        )}
      </section>
    </div>
  );
};

export default CpmKpiDrilldown;
