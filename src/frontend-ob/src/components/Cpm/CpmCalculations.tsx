'use client';

/**
 * CPLM Phase 7 — U9 Calculations & parameters.
 * CPA-prototype IA parity: loop selector + stat tiles + filterable, paginated
 * catalogue + calculation drawer. The catalogue lists only metrics our result
 * tables actually carry (one row per stored metric, grouped by gate), with
 * latest values read from the real short/long feature rows — honest coverage,
 * not the prototype's generated 143-row fixture.
 */
import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, PanelHead, TonePill, WorkspaceHeader, toneFor, fmtDateTime,
  fmtWindowShape, windowSpecsOf,
} from './shared';
import { gateTone } from './gateStatus';
import { PlantScopeFilter, useCpmScope } from './plantScope';
import LoopCombobox from './LoopCombobox';
import {
  useCpmCalculations, useCpmKpis, useCpmLoops, useCpmResolutions, useLatestGates,
} from '../../hooks/useCpm';
import { ApiError } from '../../api/apiFetch';
import CalcDrawer from './CalcDrawer';
import { METRICS, type MetricDef } from './calcCatalogue';

/** gates/latest 404 = "no fused window yet" — an answer, not a failure. */
const isNoVerdict = (e: unknown) => e instanceof ApiError && e.status === 404;


export const CpmCalculations: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  // C5 — the gate filter LIVES in the URL, not in state seeded from it once.
  // The old useState initializer meant the command palette's ?gate=G7 did
  // nothing if this page was already mounted (params changed, state didn't),
  // and changing the filter never updated the URL, so the view wasn't shareable.
  const gateFilter = params.get('gate') ?? 'all';
  const setGateFilter = (g: string) =>
    setParams(p => { if (g === 'all') p.delete('gate'); else p.set('gate', g); return p; }, { replace: true });
  const [kindFilter, setKindFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [drawer, setDrawer] = useState<MetricDef | null>(null);
  const PAGE = 12;

  const { data: loopData } = useCpmLoops();
  const loops = useMemo(() => loopData?.loops ?? [], [loopData]);
  // Plant scope (CPM-UX A1): narrows the loop picker to a section/unit.
  const scope = useCpmScope();
  // Case-insensitive, like every loop lookup in cplm-api.
  // No default selection: registry order is arbitrary, so `loops[0]` is a
  // CHOICE presented as a default — the same lie the ?loop=-names-nothing
  // fallback was fixed for, minus the URL. It also fired this page's whole
  // query set for a loop nobody asked for.
  const loopId = params.get('loop') ?? undefined;
  const loop = loopId
    ? loops.find(l => l.loopId.toLowerCase() === loopId.toLowerCase())
    : undefined;

  const gates = useLatestGates(loop?.loopId, '24h');
  const shortKpis = useCpmKpis(loop?.loopId, '60m', 1);
  const longKpis = useCpmKpis(loop?.loopId, '24h', 1);
  const catalogue = useCpmCalculations();
  // Honest window labels (audit.md §4.5): "60m" alone read as a tumbling
  // minute-hour; it is a sliding window. The shape comes from the served
  // contract, same source as the Window Inspector's selector.
  const resolutions = useCpmResolutions();
  const windowShapeOf = (kind: string): string => {
    const s = windowSpecsOf(resolutions.data, () => 0).find(w => w.kind === kind);
    const shape = s ? fmtWindowShape(s) : '';
    return shape ? `${kind} — ${shape}` : kind;
  };

  const latestShort = shortKpis.data?.samples[0];
  const latestLong = longKpis.data?.samples[0];

  const valueOf = (m: MetricDef): number | null => {
    if (m.source === 'gate') return gates.data?.confidence ?? null;
    const row = m.source === 'short' ? latestShort : latestLong;
    const v = row?.[m.field];
    return typeof v === 'number' ? v : null;
  };

  /**
   * C1 — the engine's qualification flags (P1-9/P1-10). A short row with
   * sufficient_data=false carries ZEROED mae/rmse/iae because the engine
   * DECLINED the window; a long row with long_metrics_qualified=false was
   * computed on a window that failed G0. The API ships both flags precisely so
   * a UI never renders those values as clean measurements — and this page did.
   */
  const disqualificationOf = (m: MetricDef): string | null => {
    if (m.source === 'short' && latestShort?.sufficient_data === false)
      return 'window declined (insufficient data) — stored values are zeroed placeholders';
    if (m.source === 'long' && latestLong?.long_metrics_qualified === false)
      return 'metrics unqualified — computed on a window that failed G0';
    return null;
  };

  /** C2 — WHEN the "latest" value is from; a 4-day-old number without a
   * timestamp reads as current. */
  const windowEndOf = (m: MetricDef): string | null => {
    if (m.source === 'gate') return gates.data?.windowEnd ?? null;
    const row = m.source === 'short' ? latestShort : latestLong;
    return typeof row?.window_end === 'string' ? row.window_end : null;
  };

  const statusOf = (m: MetricDef): { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' } => {
    const cell = gates.data?.gates.find(g => g.key === m.gate);
    // P2-12: PENDING and INSUFFICIENT_EVIDENCE also mean "not judged" - they
    // previously fell through to the else branch and were labelled "Outside"
    // (i.e. out of spec), which is a verdict the engine never issued.
    if (!cell || ['NOT_EVALUATED', 'PENDING', 'INSUFFICIENT_EVIDENCE'].includes(cell.status))
      return { label: 'Not evaluated', tone: 'muted' };
    const t = gateTone(cell.status);
    if (t === 'muted') return { label: cell.status.replace(/_/g, ' '), tone: t };
    return { label: t === 'good' ? 'Acceptable' : t === 'warn' ? 'Review' : 'Outside', tone: t };
  };

  const gateKeys = useMemo(
    () => ['all', ...new Set(METRICS.map(m => m.gate))], []);
  const kindKeys = useMemo(
    () => ['all', ...new Set(METRICS.map(m => m.kind))], []);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return METRICS.filter(m =>
      (gateFilter === 'all' || m.gate === gateFilter)
      && (kindFilter === 'all' || m.kind === kindFilter)
      && (!q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)));
  }, [search, gateFilter, kindFilter]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  // Clamped: a URL-driven filter change (command palette) shrinks `filtered`
  // without the selects' setPage(0) running.
  const safePage = Math.min(page, pages - 1);
  const rows = filtered.slice(safePage * PAGE, safePage * PAGE + PAGE);

  // Position in the CURRENT result set, so prev/next walk what you filtered to.
  const drawerIndex = drawer ? filtered.findIndex(m => m.id === drawer.id) : -1;

  const observed = METRICS.filter(m => valueOf(m) != null).length;
  /**
   * The assessment is a GATE verdict, replicated onto each metric that gate
   * covers — so counting metrics said "5 require review" when the truth was
   * "one gate needs review and it happens to carry five metrics". Count the
   * distinct gates, which is the unit actually being assessed.
   */
  const gateTally = useMemo(() => {
    const byGate = new Map<string, 'good' | 'warn' | 'bad' | 'muted'>();
    for (const m of METRICS) if (!byGate.has(m.gate)) byGate.set(m.gate, statusOf(m).tone);
    const tones = [...byGate.values()];
    return {
      good: tones.filter(t => t === 'good').length,
      review: tones.filter(t => t === 'warn' || t === 'bad').length,
      muted: tones.filter(t => t === 'muted').length,
      total: tones.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- statusOf closes over the gates query; the data identity below is the real dep.
  }, [gates.data]);

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Loop-specific calculation evidence"
        title="Calculations & parameters"
        copy="Select a loop to inspect its stored metric outputs against the latest gate assessments."
      />

      <section className="cpm-surface">
        <PanelHead eyebrow="1 · Select the loop" title="Which loop do you want to evaluate?" />
        <PlantScopeFilter scope={scope} />
        <div className="cpm-toolbar">
          <LoopCombobox scope={scope} loops={loops} value={loop?.loopId ?? ''}
            onChange={id => { setParams(p => { p.set('loop', id); return p; }, { replace: true }); setPage(0); }}
            onClear={() => { setParams(p => { p.delete('loop'); return p; }, { replace: true }); setPage(0); }} />
          {loop && (
            <>
              {/* C4: a FAILED gates fetch is not a NOT_EVALUATED verdict — the
                  404 "no fused window yet" is, and keeps the muted pill. */}
              {gates.isError && !isNoVerdict(gates.error) ? (
                <TonePill tone="warn">VERDICT UNAVAILABLE</TonePill>
              ) : (
                <TonePill tone={toneFor(gates.data?.diagnosis)}>
                  {(gates.data?.diagnosis ?? 'NOT_EVALUATED').replace(/_/g, ' ')}
                </TonePill>
              )}
              <span className="cpm-copy">
                {loop.loopType} · profile {loop.thresholdProfileId ?? 'default'}
                {gates.data?.windowEnd ? ` · latest window ${fmtDateTime(gates.data.windowEnd)}` : ''}
              </span>
            </>
          )}
          {(shortKpis.isError || longKpis.isError) && (
            <span className="cpm-field__error">
              KPI rows unavailable — latest values below may be missing, not absent.
            </span>
          )}
        </div>
      </section>

      {!loop && (
        <section className="cpm-surface">
          <EmptyState title="Select a loop"
            copy="The catalogue lists every stored metric with this loop's latest value and the gate that judges it." />
        </section>
      )}

      {loop && (<>
      <div className="cpm-kpi-row">
        <StatTile caption={`Metrics stored for ${loop.loopId}`} value={observed} />
        {/* The hardcoded 17 fallback is the exact claim the Relationships tab
            stopped making — say nothing rather than assert a pack size. */}
        <StatTile caption="Evidence gates in the pack" value={catalogue.data?.gates.length ?? '—'} />
        <StatTile caption="Gates acceptable" value={`${gateTally.good}/${gateTally.total}`} tone="good" />
        <StatTile caption="Gates needing review" value={gateTally.review}
          tone={gateTally.review > 0 ? 'warn' : 'good'} />
        <StatTile caption="Gates not evaluated" value={gateTally.muted} tone="muted" />
      </div>

      <section className="cpm-surface">
        <div className="cpm-toolbar" style={{ marginBottom: 12 }}>
          <input className="cpm-input" style={{ flex: 1, minWidth: 220 }}
            placeholder={`Search ${loop?.loopId ?? ''} calculations`}
            value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
          <select className="cpm-select" value={gateFilter}
            onChange={e => { setGateFilter(e.target.value); setPage(0); }}>
            {gateKeys.map(g => <option key={g} value={g}>{g === 'all' ? 'All gates' : g}</option>)}
          </select>
          {/* The list was hardcoded and offered "Parameter", which no metric in
              METRICS carries — a filter option that could only ever return zero
              results. Derived from the catalogue instead. */}
          <select className="cpm-select" value={kindFilter}
            onChange={e => { setKindFilter(e.target.value); setPage(0); }}>
            {kindKeys.map(k =>
              <option key={k} value={k}>{k === 'all' ? 'All types' : k}</option>)}
          </select>
          <span className="cpm-filter-count">{filtered.length} result(s)</span>
        </div>

        <div className="cpm-event-head" style={{ gridTemplateColumns: '0.7fr 1.8fr 0.4fr 0.7fr 0.9fr 0.8fr' }}>
          <span>ID</span><span>Calculation / parameter</span><span>Gate</span>
          <span>Latest value</span><span>Window</span><span>Assessment</span>
        </div>
        {rows.map(m => {
          const v = valueOf(m);
          const st = statusOf(m);
          const disq = disqualificationOf(m);
          const wEnd = windowEndOf(m);
          return (
            <div key={m.id} className="cpm-event-row"
              style={{ gridTemplateColumns: '0.7fr 1.8fr 0.4fr 0.7fr 0.9fr 0.8fr' }}
              onClick={() => setDrawer(m)} role="button" tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDrawer(m); } }}>
              <span className="cpm-mono">{m.id}</span>
              <span>
                <span className="cpm-event-row__title">{m.name}</span>
                <div className="cpm-event-row__sub">{m.description}</div>
              </span>
              <span>{m.gate}</span>
              {/* C1: a value from a DECLINED window is a zeroed placeholder the
                  engine told us not to trust — never render it as a measurement. */}
              <span title={disq ?? undefined}>
                {disq ? '— (declined)' : v != null ? `${v.toFixed(3)} ${m.unit}` : '—'}
              </span>
              {/* C2: WHEN, not just which resolution — "latest" without a
                  timestamp reads as current on a stale historian. */}
              <span className="cpm-event-row__sub">
                {m.source === 'short' ? windowShapeOf('60m')
                  : m.source === 'long' ? windowShapeOf('24h') : '24h fused'}
                {wEnd ? ` · ends ${fmtDateTime(wEnd)}` : ''}
              </span>
              <TonePill tone={st.tone}>{st.label}</TonePill>
            </div>
          );
        })}
        {rows.length === 0 && <EmptyState title="No matching metrics" />}

        <div className="cpm-wizard-footer">
          <ObcButton variant="normal" disabled={safePage === 0} onClick={() => setPage(Math.max(0, safePage - 1))}>Previous</ObcButton>
          <span className="cpm-copy">Page {safePage + 1} of {pages}</span>
          <ObcButton variant="normal" disabled={safePage >= pages - 1} onClick={() => setPage(Math.min(pages - 1, safePage + 1))}>Next</ObcButton>
        </div>
      </section>

      </>)}

      {drawer && loop && (
        <CalcDrawer metric={drawer} loopId={loop.loopId}
          onPrev={drawerIndex > 0 ? () => setDrawer(filtered[drawerIndex - 1]) : undefined}
          onNext={drawerIndex >= 0 && drawerIndex < filtered.length - 1
            ? () => setDrawer(filtered[drawerIndex + 1]) : undefined}
          value={valueOf(drawer)} status={statusOf(drawer)}
          disqualification={disqualificationOf(drawer)}
          windowEnd={windowEndOf(drawer)}
          catalogue={catalogue.data}
          gateMatrix={gates.data}
          row={drawer.source === 'short' ? latestShort
            : drawer.source === 'long' ? latestLong : undefined}
          onClose={() => setDrawer(null)} />
      )}
    </div>
  );
};

const StatTile: React.FC<{ caption: string; value: React.ReactNode; tone?: 'good' | 'warn' | 'bad' | 'muted' }> =
  ({ caption, value, tone }) => (
    <div className={`cpm-kpi${tone ? ` cpm-kpi--${tone}` : ''}`}>
      <span className="cpm-kpi__caption">{caption}</span>
      <span className="cpm-kpi__value">{value}</span>
    </div>
  );

export default CpmCalculations;
