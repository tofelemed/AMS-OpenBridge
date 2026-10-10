/**
 * CHG-082 / CHG-085: /cpm/kpi?kpi=&reason=&site=&area=&unit= — the proof of one Overview KPI.
 *
 * 1. Four summary cards: the number (with its change since 24 h ago), the threshold, the window basis, when it was computed.
 * 2. "How this number is calculated": the rule, the formula, why the KPI exists and its reference.
 * 3. The loops behind it — exactly the loops the card counted (server `total` = the card's count) — each with its measured
 *    value against the rule, the verdict, the window and the links to the evidence.
 * The URL is the whole selection (shareable); the KPI picker and the reason filter rewrite it.
 */
import React, { useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObiChevronLeftGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-left-google';
import { ObiDatabase } from '@oicl/openbridge-webcomponents-react/icons/icon-database';
import { ObiTime } from '@oicl/openbridge-webcomponents-react/icons/icon-time';
import { ObiLimitsAttention } from '@oicl/openbridge-webcomponents-react/icons/icon-limits-attention';
import { ObiHelp } from '@oicl/openbridge-webcomponents-react/icons/icon-help';
import type { FleetKpiKey } from '../../api/cpm/fleetKpis';
import { EmptyState, PanelHead, QueryError, TonePill, WorkspaceHeader, fmtDateTime } from './shared';
import { ListPager } from '../shared/ListPager';
import { PlantScopeFilter, useCpmScope } from './plantScope';
import { overviewHref } from './cpaHref';
import { useFleetKpiLoops, useFleetKpis } from './kpi/useFleetKpis';
import { KPI_GROUPS, kpiTone, pct, reasonLabel } from './kpi/fleetKpiView';
import { KPI_WHY } from './kpi/kpiProof';
import { KPI_META, basisShort, kpiDelta } from './kpi/kpiMeta';
import { KpiCard } from './kpi/KpiCard';
import { KpiRowsTable } from './kpi/KpiRowsTable';

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
  const kpi = (params.get('kpi') ?? 'acceptable') as FleetKpiKey;
  const reason = params.get('reason');
  const scope = useCpmScope();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const kpis = useFleetKpis(scope.params);
  const list = useFleetKpiLoops({ kpi, reason, q: search.trim() || undefined, page: page + 1, pageSize: PAGE, ...scope.params });

  const k = kpis.data;
  const figure = k?.kpis.find(f => f.key === kpi) ?? list.data?.figure ?? null;
  const meta = KPI_META[kpi];
  const options = useMemo(() => [
    ...KPI_GROUPS.flatMap(g => g.keys).map(key => ({ key, label: k?.kpis.find(f => f.key === key)?.label ?? key })),
    ...DRILL_ONLY,
  ], [k]);
  const go = (next: Record<string, string | null>) => {
    setPage(0);
    setParams(p => { for (const [key, v] of Object.entries(next)) { if (v) p.set(key, v); else p.delete(key); } return p; });
  };
  const label = figure?.label ?? options.find(o => o.key === kpi)?.label ?? 'KPI';
  const total = list.data?.total;

  return (
    <div className="cpm-screen">
      <RouterLink className="cpm-link cpm-kpi-back" to={overviewHref(scope.params)}>
        <span className="cpm-kpi-back__icon" aria-hidden><ObiChevronLeftGoogle /></span>Operations overview
      </RouterLink>
      <WorkspaceHeader page="/cpm/kpi" title={label}
        actions={<label className="cpm-field cpm-kpi-proof__pick">
          <span className="cpm-field__label">Show another KPI</span>
          <select className="cpm-select" value={kpi} onChange={e => go({ kpi: e.target.value, reason: null })}>
            {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>} />
      <PlantScopeFilter scope={scope} summary={k ? `${k.monitored} monitored loop(s) in scope` : null} />

      {kpis.isError && <QueryError title="KPI unavailable" error={kpis.error} retry={() => void kpis.refetch()} />}
      {k && (
        <div className="cpm-kpicards cpm-kpicards--4" aria-label="This KPI at a glance">
          {figure && meta
            ? <KpiCard size="large" Icon={meta.Icon} value={<>{figure.count}<span className="cpm-kpicard__of"> / {figure.denominator}</span></>}
                label={`${pct(figure.count, figure.denominator)} % of ${figure.denominatorLabel}`} tone={kpiTone(figure)}
                delta={kpiDelta(figure, k)} title={figure.rule} />
            : <KpiCard size="large" Icon={meta?.Icon ?? ObiHelp} value={total ?? '…'} label="loop(s) in this list" />}
          <KpiCard Icon={ObiLimitsAttention} value={<span className="cpm-kpicard__text">{meta ? meta.threshold(k.basis) : 'As listed'}</span>}
            label="Threshold" />
          <KpiCard Icon={ObiDatabase} value={<span className="cpm-kpicard__text">{basisShort(k.basis)}</span>} label="Basis" />
          <KpiCard Icon={ObiTime} value={<span className="cpm-kpicard__text">{fmtDateTime(k.computedAt)}</span>}
            label="Computed" sub="the change compares with 24 h earlier" />
        </div>
      )}

      <section className="cpm-surface cpm-kpi-proof" aria-label="How this number is calculated">
        <PanelHead eyebrow="Proof" title="How this number is calculated" />
        <dl className="cpm-kpi-proof__grid">
          {figure && <><dt>Rule</dt><dd>{figure.rule}.</dd></>}
          {meta && <><dt>Formula</dt><dd><code className="cpm-kpi-proof__formula">{meta.formula}</code></dd></>}
          {KPI_WHY[kpi] && <><dt>Why this KPI</dt><dd>{KPI_WHY[kpi]}</dd></>}
          <dt>Full logic</dt><dd>kpi_calculation_logic/KPI-LOGIC.md: formulas, thresholds, sources and the lab evidence.</dd>
        </dl>
      </section>

      <section className="cpm-surface" aria-label="Loops behind this KPI">
        <PanelHead eyebrow="The loops behind the number"
          title={total != null ? `${total} loop(s)${reason ? ` · ${reasonLabel(reason)}` : ''}` : 'Loading…'}
          right={total != null && figure && !reason && total === figure.count ? <TonePill tone="good">matches the card</TonePill> : undefined} />
        <div className="cpm-kpi-proof__tools">
          <label className="cpm-field cpm-kpi-proof__search">
            <span className="cpm-field__label">Search loops</span>
            <input className="cpm-input" type="search" value={search} placeholder="Loop tag or name"
              onChange={e => { setSearch(e.target.value); setPage(0); }} />
          </label>
          {kpi === 'not-assessable' && (k?.notAssessableByReason.length ?? 0) > 0 && (
            <div className="cpm-kpi-proof__reasons" role="group" aria-label="Narrow by reason">
              <ObcButton variant={!reason ? 'normal' : 'flat'} aria-pressed={!reason} onClick={() => go({ reason: null })}>
                All reasons {k!.states.notAssessable}
              </ObcButton>
              {k!.notAssessableByReason.map(r => (
                <ObcButton key={r.reason} variant={reason === r.reason ? 'normal' : 'flat'} aria-pressed={reason === r.reason}
                  onClick={() => go({ reason: r.reason })}>{reasonLabel(r.reason)} {r.count}</ObcButton>
              ))}
            </div>
          )}
        </div>
        {list.isError && <QueryError title="The loop list is unavailable" error={list.error} retry={() => void list.refetch()} />}
        {list.data && list.data.rows.length === 0 && (
          <EmptyState title={search ? 'No loop matches the search' : 'No loop is in this KPI'}
            copy={search ? 'Clear the search to see every loop behind the number.' : 'The count for this KPI is 0 in this scope.'} />
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
