/**
 * CHG-082 / KPI Phase 3: /cpm/kpi?kpi=&reason=&site=&area=&unit= — the proof of one Overview KPI. The header states the
 * rule, the threshold, the window basis and why the KPI exists (with its reference); the list holds exactly the loops the
 * tile counted (server `total` = the tile's count), each with the value that put it there and links to the evidence.
 * The URL is the whole selection (shareable).
 */
import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FleetKpiKey } from '../../api/cpm/fleetKpis';
import { EmptyState, PanelHead, QueryError, TonePill, WorkspaceHeader, fmtDateTime } from './shared';
import { ListPager } from '../shared/ListPager';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { PlantScopeFilter, useCpmScope } from './plantScope';
import { useFleetKpiLoops, useFleetKpis } from './kpi/useFleetKpis';
import { KPI_GROUPS, basisText, denominatorText, pct, reasonLabel } from './kpi/fleetKpiView';
import { KPI_WHY } from './kpi/kpiProof';
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

  const figure = kpis.data?.kpis.find(f => f.key === kpi) ?? list.data?.figure ?? null;
  const options = useMemo(() => [
    ...KPI_GROUPS.flatMap(g => g.keys).map(k => ({ key: k, label: kpis.data?.kpis.find(f => f.key === k)?.label ?? k })),
    ...DRILL_ONLY,
  ], [kpis.data]);
  const go = (next: Record<string, string | null>) => {
    setPage(0);
    setParams(p => { for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k); } return p; });
  };
  const title = figure?.label ?? options.find(o => o.key === kpi)?.label ?? 'KPI';
  const total = list.data?.total;

  return (
    <div className="cpm-screen">
      <WorkspaceHeader page="/cpm/kpi" title={title} />
      <PlantScopeFilter scope={scope} summary={kpis.data ? `${kpis.data.monitored} monitored loop(s) in scope` : null} />

      <section className="cpm-surface cpm-kpi-proof" aria-label="How this number is calculated">
        <PanelHead eyebrow="How this number is calculated" title={figure
          ? `${figure.count} ${denominatorText(figure)} (${pct(figure.count, figure.denominator)} %)`
          : total != null ? `${total} loop(s)` : 'Loading…'}
          right={<label className="cpm-field cpm-kpi-proof__pick">
            <span className="cpm-field__label">KPI</span>
            <select className="cpm-select" value={kpi} onChange={e => go({ kpi: e.target.value, reason: null })}>
              {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>} />
        {figure && <p className="cpm-copy"><strong>Rule:</strong> {figure.rule}.</p>}
        {KPI_WHY[kpi] && <p className="cpm-copy"><strong>Why this KPI:</strong> {KPI_WHY[kpi]}</p>}
        {kpis.data && <p className="cpm-copy cpm-op__basis">{basisText(kpis.data)}. Computed {fmtDateTime(kpis.data.computedAt)}.</p>}
        {kpi === 'not-assessable' && (kpis.data?.notAssessableByReason.length ?? 0) > 0 && (
          <div className="cpm-flag-row" role="group" aria-label="Narrow by reason">
            <ObcButton variant={!reason ? 'normal' : 'flat'} aria-pressed={!reason} onClick={() => go({ reason: null })}>
              All reasons {kpis.data!.states.notAssessable}
            </ObcButton>
            {kpis.data!.notAssessableByReason.map(r => (
              <ObcButton key={r.reason} variant={reason === r.reason ? 'normal' : 'flat'} aria-pressed={reason === r.reason}
                onClick={() => go({ reason: r.reason })}>{reasonLabel(r.reason)} {r.count}</ObcButton>
            ))}
          </div>
        )}
      </section>

      <section className="cpm-surface" aria-label="Loops behind this KPI">
        <PanelHead eyebrow="The loops behind the number" title={total != null
          ? `${total} loop(s)${reason ? ` · ${reasonLabel(reason)}` : ''}` : 'Loading…'}
          right={total != null && figure && !reason && total === figure.count
            ? <TonePill tone="good">matches the tile</TonePill> : undefined} />
        <label className="cpm-field cpm-kpi-proof__search">
          <span className="cpm-field__label">Search loops</span>
          <input className="cpm-input" type="search" value={search} placeholder="Loop tag or name"
            onChange={e => { setSearch(e.target.value); setPage(0); }} />
        </label>
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
