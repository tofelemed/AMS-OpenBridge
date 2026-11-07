'use client';

/**
 * Calculations (/cpm/calculations?loop=&metric=&window=&kind=&gate=). The 19 stored metrics for one loop, by category, with
 * the selected one in the right column (Task 20; it was a paged table and a modal drawer). Every value belongs to the window
 * the verdict judges: the newest fused window, or the exact window `?window=` names. A metric the engine did not calculate
 * says so and why; it is never 0. The first visible row is selected when the URL names none, and `?metric=` follows the choice.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import WindowKindToggle from './explorer/summary/WindowKindToggle';
import { WINDOW_KINDS, useWindowKind } from './useWindowKind';
import { EmptyState, QueryError, WorkspaceHeader } from './shared';
import { LoopBand } from './context/LoopBand';
import { fmtInstant } from './context/LoopContextBar';
import { investigationHref } from './cpaHref';
import { conditionOf } from './explorer/summary/summaryText';
import { METRICS } from './calcCatalogue';
import { DEFAULT_CALC_SORT, calcOrderText, nextCalcSort, sortMetrics, type CalcSort, type CalcSortKey } from './calcSort';
import SortHeader from './SortHeader';
import CalcBand from './calc/CalcBand';
import CalcFilters, { type CategoryChoice } from './calc/CalcFilters';
import CalcPanel from './calc/CalcPanel';
import CalcList from './calc/CalcList';
import { useCalcValues } from './calc/useCalcValues';
import { recordRows } from './calc/recordRows';

export const CpmCalculations: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // CHG-089: the fused window kind (12h default). ?window= here is an evaluated END, as calculationsHref writes it.
  const [windowKind, setWindowKind] = useWindowKind('kind');
  const endParam = params.get('window');
  const windowEnd = endParam && !(WINDOW_KINDS as readonly string[]).includes(endParam) ? endParam : null;
  const loopId = params.get('loop') ?? undefined;
  const metricParam = params.get('metric');
  // The gate filter lives in the URL: the command palette's ?gate=G7 works on a mounted page and a view can be shared.
  const gateParam = params.get('gate') ?? 'all';
  const [search, setSearch] = useState('');
  const [result, setResult] = useState('all');
  const [category, setCategory] = useState<CategoryChoice>('All');
  const [sort, setSort] = useState<CalcSort>(DEFAULT_CALC_SORT);
  // Below 1280 px the panel is a drawer: a link that names a metric opens it, once per metric named (Close stays closed).
  const [drawer, setDrawer] = useState(() => params.has('metric'));
  const seen = useRef(metricParam);
  useEffect(() => {
    if (metricParam && metricParam !== seen.current) { seen.current = metricParam; setDrawer(true); }
  }, [metricParam]);

  const v = useCalcValues(loopId, windowKind, windowEnd);
  const loop = v.loop;
  const timeZone = loop?.timezone || 'UTC';

  const inCategory = useMemo(() => METRICS.filter(m => category === 'All' || m.category === category), [category]);
  const gates = useMemo(() => ['all', ...new Set(inCategory.map(m => m.gate))], [inCategory]);
  const gate = gates.includes(gateParam) ? gateParam : 'all';
  const views = useMemo(() => METRICS.map(v.viewOf), [v.viewOf]);
  const results = useMemo(() => [...new Set(views.map(x => x.status.label))], [views]);

  const q = search.trim().toLowerCase();
  const filtered = views.filter(x =>
    (category === 'All' || x.metric.category === category)
    && (gate === 'all' || x.metric.gate === gate)
    && (result === 'all' || x.status.label === result)
    && (!q || [x.metric.name, x.metric.id, x.metric.unit].some(t => t.toLowerCase().includes(q))));
  const tone = new Map(views.map(x => [x.metric.id, x.status.tone]));
  const ordered = sortMetrics(filtered.map(x => x.metric), sort, m => tone.get(m.id) ?? 'muted');
  const byId = new Map(views.map(x => [x.metric.id, x]));
  const visible = ordered.map(m => byId.get(m.id)!);

  const named = metricParam
    ? visible.find(x => x.metric.id.toLowerCase() === metricParam.toLowerCase() || x.metric.field === metricParam)
    : undefined;
  const selected = named ?? visible[0];
  const selectedId = selected?.metric.id;
  // With no metric named the URL names the first visible row. A named one that a filter hides stays in the URL: the panel shows
  // the first visible row meanwhile, and the address changes only when the user picks a row.
  useEffect(() => {
    if (loop && selectedId && !metricParam) {
      seen.current = selectedId;
      setParams(p => { p.set('metric', selectedId); return p; }, { replace: true });
    }
  }, [loop, selectedId, metricParam, setParams]);

  const setGate = (g: string) => setParams(p => { if (g === 'all') p.delete('gate'); else p.set('gate', g); return p; }, { replace: true });
  const pick = (id: string) => { seen.current = id; setParams(p => { p.set('metric', id); return p; }, { replace: true }); setDrawer(true); };
  const clearFilters = () => { setSearch(''); setResult('all'); setCategory('All'); setGate('all'); };
  // The Calculation heading walks id, then name ascending, then name descending, so every order stays reachable.
  const sortBy = (key: CalcSortKey) => setSort(s => {
    if (key !== 'name') return nextCalcSort(s, key);
    if (s.key === 'id') return s.dir === 'asc' ? { key: 'name', dir: 'asc' } : { key: 'id', dir: 'asc' };
    return s.key === 'name' && s.dir === 'asc' ? { key: 'name', dir: 'desc' } : DEFAULT_CALC_SORT;
  });
  const head = (key: CalcSortKey, label: string, title?: string) => (
    <SortHeader label={label} title={title} onSort={() => sortBy(key)}
      active={(key === 'name' ? sort.key === 'id' || sort.key === 'name' : sort.key === key) ? sort.dir : null}
      orderText={key === 'name' ? (sort.key === 'id' ? 'by ID' : sort.dir === 'asc' ? 'by name, A to Z' : 'by name, Z to A') : calcOrderText(sort)} />
  );
  const noWindow = (p: URLSearchParams) => { p.delete('window'); p.delete('metric'); };

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        page="/cpm/calculations"
        title="Calculations"
        actions={<>
          <WindowKindToggle value={windowKind} kinds={WINDOW_KINDS} onChange={setWindowKind} />
          <ObcButton variant="flat" disabled={!loopId}
            onClick={() => { if (loopId) navigate(investigationHref(loopId, { kind: windowKind, window: v.matrix?.windowEnd ?? windowEnd })); }}>
            Back to Investigation {'↗'}
          </ObcButton>
        </>}
      />
      <LoopBand loopId={loop?.loopId ?? loopId}
        onLoop={id => setParams(p => { p.set('loop', id); noWindow(p); return p; }, { replace: true })}
        onClear={() => setParams(p => { p.delete('loop'); noWindow(p); return p; }, { replace: true })}>
        {loop && <CalcBand matrix={v.matrix} timeZone={timeZone} verdictFailed={v.verdictFailed} />}
      </LoopBand>
      {v.kpiError != null && (
        <QueryError title="Window values unavailable — the values below are missing, not absent" error={v.kpiError} retry={v.retryKpis} />
      )}
      {loop && v.rowMissing && (
        <p className="cpm-field__error" role="status">The values for the window above are not stored, so every value below reads Not calculated.</p>
      )}
      {v.windowError != null && <QueryError title="Window unavailable" error={v.windowError} retry={v.retryWindow} />}

      {!loop && (
        <section className="cpm-surface">
          <EmptyState level={2} title="Select a loop"
            copy="Pick a loop above. The list then shows each calculation with this loop's latest value and the gate that judges it." />
        </section>
      )}
      {loop && v.notStored && (
        <section className="cpm-surface">
          <EmptyState title="That window is not stored"
            copy={`The service holds no result for the ${windowKind} window ending ${fmtInstant(windowEnd, timeZone)}. Full gate results are kept for a limited time.`}
            action={{ label: 'Show the newest window', onClick: () => setParams(p => { noWindow(p); return p; }, { replace: true }) }} />
        </section>
      )}

      {loop && !v.notStored && (
        <div className="cpm-master-detail">
          <section className="cpm-surface">
            <CalcFilters search={search} onSearch={setSearch} gate={gate} gates={gates} onGate={setGate}
              result={result} results={results} onResult={setResult} category={category}
              onCategory={c => { setCategory(c); if (gateParam !== 'all' && !METRICS.some(m => (c === 'All' || m.category === c) && m.gate === gateParam)) setGate('all'); }}
              shown={visible.length} available={METRICS.length}
              filtered={!!q || result !== 'all' || category !== 'All' || gate !== 'all'} onClear={clearFilters} />
            <CalcList rows={visible} selectedId={selectedId} onSelect={pick} head={head} />
            {visible.length === 0 && (
              <EmptyState title="No calculation matches the filters" />
            )}
          </section>
          {selected && (
            <CalcPanel view={selected} loopId={loop.loopId} runId={v.runIdOf(selected.metric.gate)}
              pvUnit={loop.engineering?.pvUnit ?? null}
              verdict={v.matrix?.diagnosis ? conditionOf(v.matrix.diagnosis).label : null}
              stamped={v.stamped} deployed={v.deployed}
              record={recordRows(selected.metric, selected.value, { row: v.row, matrix: v.matrix, catalogue: v.catalogue })} open={drawer} onClose={() => setDrawer(false)} />
          )}
        </div>
      )}
    </div>
  );
};

export default CpmCalculations;
