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
  EmptyState, KvRow, LoopSelect, PanelHead, TonePill, WorkspaceHeader, toneFor,
} from './shared';
import {
  useCpmCalculations, useCpmEvents, useCpmKpis, useCpmLoops, useLatestGates,
} from '../../hooks/useCpm';

interface MetricDef {
  id: string;
  field: string;          // column in the feature/gate rows
  name: string;
  gate: string;
  kind: 'Calculation' | 'Parameter' | 'Decision';
  unit: string;
  source: 'short' | 'long' | 'gate';
  description: string;
}

/** Metrics our analytics tables actually store — the honest catalogue. */
const METRICS: MetricDef[] = [
  { id: 'CPLM-001', field: 'completeness', name: 'Sample completeness', gate: 'G0', kind: 'Calculation', unit: 'ratio', source: 'short', description: 'Fraction of expected samples present in the window.' },
  { id: 'CPLM-002', field: 'sample_count', name: 'Sample count', gate: 'G0', kind: 'Calculation', unit: 'count', source: 'short', description: 'Samples evaluated in the window.' },
  { id: 'CPLM-003', field: 'auto_pct', name: 'Automatic-mode fraction', gate: 'G1', kind: 'Calculation', unit: 'ratio', source: 'short', description: 'Time fraction the controller spent in AUTO.' },
  { id: 'CPLM-010', field: 'mae', name: 'Mean absolute error', gate: 'G3', kind: 'Calculation', unit: 'EU', source: 'short', description: 'Mean |PV − SP| over the window.' },
  { id: 'CPLM-011', field: 'rmse', name: 'Root-mean-square error', gate: 'G3', kind: 'Calculation', unit: 'EU', source: 'short', description: 'RMS control error.' },
  { id: 'CPLM-012', field: 'iae', name: 'Integral absolute error', gate: 'G3', kind: 'Calculation', unit: 'EU·s', source: 'short', description: 'Accumulated absolute error.' },
  { id: 'CPLM-013', field: 'ise', name: 'Integral squared error', gate: 'G3', kind: 'Calculation', unit: 'EU²·s', source: 'short', description: 'Accumulated squared error.' },
  { id: 'CPLM-014', field: 'good_error_pct', name: 'Good-error time', gate: 'G3', kind: 'Calculation', unit: '%', source: 'short', description: 'Time fraction the error stayed inside the good band.' },
  { id: 'CPLM-020', field: 'effort_ratio', name: 'Actuator effort ratio', gate: 'G4', kind: 'Calculation', unit: 'ratio', source: 'short', description: 'OP travel relative to the error it corrects.' },
  { id: 'CPLM-021', field: 'travel_per_day', name: 'OP travel per day', gate: 'G4', kind: 'Calculation', unit: '%/day', source: 'long', description: 'Total actuator travel extrapolated to a day.' },
  { id: 'CPLM-022', field: 'reversals_per_hour', name: 'OP reversals per hour', gate: 'G4', kind: 'Calculation', unit: 'per h', source: 'long', description: 'Direction changes of the actuator.' },
  { id: 'CPLM-030', field: 'acf_period_s', name: 'Oscillation period (ACF)', gate: 'G5', kind: 'Calculation', unit: 's', source: 'long', description: 'Dominant period from the autocorrelation.' },
  { id: 'CPLM-031', field: 'acf_regularity', name: 'Oscillation regularity', gate: 'G5', kind: 'Calculation', unit: 'ratio', source: 'long', description: 'How regular the oscillation is (0–1).' },
  { id: 'CPLM-040', field: 'harmonic_amplitude_ratio', name: 'Harmonic amplitude ratio', gate: 'G6', kind: 'Calculation', unit: 'ratio', source: 'long', description: 'Harmonics vs fundamental amplitude.' },
  { id: 'CPLM-041', field: 'harmonic_energy_ratio', name: 'Harmonic energy ratio', gate: 'G6', kind: 'Calculation', unit: 'ratio', source: 'long', description: 'Spectral energy in harmonics.' },
  { id: 'CPLM-050', field: 'triangularity', name: 'OP triangularity', gate: 'G7', kind: 'Calculation', unit: 'score', source: 'long', description: 'Triangular-wave similarity of the actuator trace (stiction shape).' },
  { id: 'CPLM-060', field: 'horch_oddness', name: 'Horch oddness', gate: 'G8', kind: 'Calculation', unit: 'score', source: 'long', description: 'Odd-symmetry of the PV–OP cross-correlation.' },
  { id: 'CPLM-070', field: 'corner_score', name: 'Phase-portrait corner score', gate: 'G9', kind: 'Calculation', unit: 'score', source: 'long', description: 'Sharp-corner evidence in the PV–OP phase plot.' },
  { id: 'CPLM-090', field: 'confidence', name: 'Fused confidence', gate: 'G15', kind: 'Decision', unit: 'ratio', source: 'gate', description: 'Final banded confidence of the selected family.' },
];

export const CpmCalculations: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  // ?gate= deep link (command palette lands here pre-filtered to one gate).
  const [gateFilter, setGateFilter] = useState(() => params.get('gate') ?? 'all');
  const [kindFilter, setKindFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [drawer, setDrawer] = useState<MetricDef | null>(null);
  const PAGE = 12;

  const { data: loopData } = useCpmLoops();
  const loops = useMemo(() => loopData?.loops ?? [], [loopData]);
  const loopId = params.get('loop') ?? loops[0]?.loopId;
  const loop = loops.find(l => l.loopId === loopId) ?? loops[0];

  const gates = useLatestGates(loop?.loopId, '24h');
  const shortKpis = useCpmKpis(loop?.loopId, '60m', 1);
  const longKpis = useCpmKpis(loop?.loopId, '24h', 1);
  const catalogue = useCpmCalculations();

  const latestShort = shortKpis.data?.samples[0];
  const latestLong = longKpis.data?.samples[0];

  const valueOf = (m: MetricDef): number | null => {
    if (m.source === 'gate') return gates.data?.confidence ?? null;
    const row = m.source === 'short' ? latestShort : latestLong;
    const v = row?.[m.field];
    return typeof v === 'number' ? v : null;
  };

  const statusOf = (m: MetricDef): { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' } => {
    const cell = gates.data?.gates.find(g => g.key === m.gate);
    if (!cell || cell.status === 'NOT_EVALUATED') return { label: 'Not evaluated', tone: 'muted' };
    const t = toneFor(cell.status);
    return { label: t === 'good' ? 'Acceptable' : t === 'warn' ? 'Review' : 'Outside', tone: t };
  };

  const gateKeys = useMemo(
    () => ['all', ...new Set(METRICS.map(m => m.gate))], []);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return METRICS.filter(m =>
      (gateFilter === 'all' || m.gate === gateFilter)
      && (kindFilter === 'all' || m.kind === kindFilter)
      && (!q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)));
  }, [search, gateFilter, kindFilter]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const rows = filtered.slice(page * PAGE, page * PAGE + PAGE);

  const observed = METRICS.filter(m => valueOf(m) != null).length;
  const review = METRICS.filter(m => statusOf(m).tone === 'warn' || statusOf(m).tone === 'bad').length;

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Loop-specific calculation evidence"
        title="Calculations & parameters"
        copy="Select a loop to inspect its stored metric outputs against the latest gate assessments."
      />

      <section className="cpm-surface">
        <PanelHead eyebrow="1 · Select the loop" title="Which loop do you want to evaluate?" />
        <div className="cpm-toolbar">
          <LoopSelect loops={loops} value={loop?.loopId ?? ''}
            onChange={id => { setParams(p => { p.set('loop', id); return p; }); setPage(0); }} />
          {loop && (
            <>
              <TonePill tone={toneFor(gates.data?.diagnosis)}>
                {(gates.data?.diagnosis ?? 'NOT_EVALUATED').replace(/_/g, ' ')}
              </TonePill>
              <span className="cpm-copy">
                {loop.loopType} · profile {loop.thresholdProfileId ?? 'default'}
                {gates.data?.windowEnd ? ` · latest window ${new Date(gates.data.windowEnd).toLocaleString()}` : ''}
              </span>
            </>
          )}
        </div>
      </section>

      <div className="cpm-kpi-row">
        <StatTile caption={`Metrics stored for ${loop?.loopId ?? '—'}`} value={observed} />
        <StatTile caption="Evidence gates (incl. G2r)" value={catalogue.data?.gates.length ?? 17} />
        <StatTile caption="Acceptable" value={METRICS.filter(m => statusOf(m).tone === 'good').length} tone="good" />
        <StatTile caption="Require review" value={review} tone={review > 0 ? 'warn' : 'good'} />
        <StatTile caption="Not evaluated" value={METRICS.filter(m => statusOf(m).tone === 'muted').length} tone="muted" />
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
          <select className="cpm-select" value={kindFilter}
            onChange={e => { setKindFilter(e.target.value); setPage(0); }}>
            {['all', 'Calculation', 'Parameter', 'Decision'].map(k =>
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
          return (
            <div key={m.id} className="cpm-event-row"
              style={{ gridTemplateColumns: '0.7fr 1.8fr 0.4fr 0.7fr 0.9fr 0.8fr' }}
              onClick={() => setDrawer(m)} role="button" tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter') setDrawer(m); }}>
              <span className="cpm-mono">{m.id}</span>
              <span>
                <span className="cpm-event-row__title">{m.name}</span>
                <div className="cpm-event-row__sub">{m.description}</div>
              </span>
              <span>{m.gate}</span>
              <span>{v != null ? `${v.toFixed(3)} ${m.unit}` : '—'}</span>
              <span className="cpm-event-row__sub">{m.source === 'short' ? '60m short' : m.source === 'long' ? '24h long' : '24h fused'}</span>
              <TonePill tone={st.tone}>{st.label}</TonePill>
            </div>
          );
        })}
        {rows.length === 0 && <EmptyState title="No matching metrics" />}

        <div className="cpm-wizard-footer">
          <ObcButton variant="normal" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</ObcButton>
          <span className="cpm-copy">Page {page + 1} of {pages}</span>
          <ObcButton variant="normal" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Next</ObcButton>
        </div>
      </section>

      {drawer && loop && (
        <CalcDrawer metric={drawer} loopId={loop.loopId}
          value={valueOf(drawer)} status={statusOf(drawer)}
          versions={{
            calc: gates.data?.metadata.calculationVersion ?? catalogue.data?.calculationVersion ?? null,
            profile: gates.data?.metadata.dynamicsProfileVersion ?? catalogue.data?.dynamicsProfileVersion ?? null,
          }}
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

// ── calculation drawer ─────────────────────────────────────────────────────

const DRAWER_TABS = ['Definition', 'Validation', 'History'] as const;

const CalcDrawer: React.FC<{
  metric: MetricDef;
  loopId: string;
  value: number | null;
  status: { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' };
  versions: { calc: string | null; profile: string | null };
  onClose: () => void;
}> = ({ metric, loopId, value, status, versions, onClose }) => {
  const [tab, setTab] = useState<typeof DRAWER_TABS[number]>('Definition');
  const events = useCpmEvents({ loopId, openOnly: false, limit: 10 });

  return (
    <>
      <div className="cpm-modal-backdrop" onClick={onClose} />
      <div className="cpm-drawer" role="dialog" aria-label={`${metric.id} definition`}>
        <PanelHead eyebrow={`${loopId} · ${metric.id}`} title={metric.name}
          right={<ObcButton variant="normal" onClick={onClose}>Close</ObcButton>} />
        <div className="cpm-kpi-row" style={{ margin: '12px 0' }}>
          <div className={`cpm-kpi cpm-kpi--${status.tone}`}>
            <span className="cpm-kpi__caption">Latest value</span>
            <span className="cpm-kpi__value">{value != null ? `${value.toFixed(3)} ${metric.unit}` : '—'}</span>
            <span className="cpm-kpi__sub">{status.label}</span>
          </div>
        </div>

        <div className="cpm-filter-row" style={{ marginBottom: 12 }}>
          {DRAWER_TABS.map(t => (
            <ObcButton key={t} variant={tab === t ? 'raised' : 'normal'} onClick={() => setTab(t)}>{t}</ObcButton>
          ))}
        </div>

        {tab === 'Definition' && (
          <>
            <p className="cpm-copy">{metric.description}</p>
            <PanelHead eyebrow="Runtime configuration" title="Contract" />
            <KvRow label="Loop">{loopId}</KvRow>
            <KvRow label="Gate">{metric.gate}</KvRow>
            <KvRow label="Kind">{metric.kind}</KvRow>
            <KvRow label="Stored in">{metric.source === 'short' ? 'cplm_short_feature_results' : metric.source === 'long' ? 'cplm_long_feature_results' : 'cplm_gate_results'}</KvRow>
            <KvRow label="Output unit">{metric.unit}</KvRow>
            <KvRow label="Execution">Apache Flink · event time</KvRow>
            <KvRow label="Calculation version">{versions.calc ?? '—'}</KvRow>
            <KvRow label="Dynamics profile">{versions.profile ?? '—'}</KvRow>
          </>
        )}

        {tab === 'Validation' && (
          <>
            <PanelHead eyebrow="Provenance" title="How this value is trusted" />
            <KvRow label="Golden-loop regression">
              <TonePill tone="good">CI-gated (Cplm*Test, 30 assertions)</TonePill>
            </KvRow>
            <KvRow label="Version stamped per window">
              <TonePill tone={versions.calc ? 'good' : 'muted'}>{versions.calc ? 'Yes' : 'Not on this row'}</TonePill>
            </KvRow>
            <KvRow label="Idempotent storage">
              <TonePill tone="good">Upsert on (loop, window, source)</TonePill>
            </KvRow>
            <p className="cpm-copy" style={{ marginTop: 8 }}>
              Values are produced by the same fusion engine the golden reference test pins;
              a change in the math fails CI before it can reach this screen.
            </p>
          </>
        )}

        {tab === 'History' && (
          <>
            <PanelHead eyebrow="Loop episodes" title="Recent diagnosis history" />
            {(events.data?.events ?? []).length === 0 && <EmptyState title="No episodes recorded" />}
            {(events.data?.events ?? []).map(e => (
              <KvRow key={e.id} label={new Date(e.opened_at).toLocaleString()}>
                {e.peak_diagnosis.replace(/_/g, ' ')} · {(e.peak_confidence * 100).toFixed(0)}%
              </KvRow>
            ))}
          </>
        )}
      </div>
    </>
  );
};

export default CpmCalculations;
