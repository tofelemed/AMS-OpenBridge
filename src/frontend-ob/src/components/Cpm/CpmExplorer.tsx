'use client';

/**
 * CPLM Phase 7 — U2 Explorer.
 * CPA-prototype IA parity: asset tree (site → loops, with a search that
 * actually filters — the prototype's was inert) + object workspace with the
 * five inner tabs (Summary / Signals / Calculations / Relationships / History),
 * all deep-linked via ?loop= and ?tab=.
 */
import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, KvRow, PanelHead, TonePill, WorkspaceHeader, toneFor,
  fmtDateTime,
} from './shared';
import {
  useCpmEvents, useCpmLoops, useCpmReadiness, useCpmTrend, useLatestGates,
} from '../../hooks/useCpm';
import { useLoopLive, qualityLabel } from '../../hooks/useLoopLive';
import type { CpmLoop } from '../../api/cpmApi';
import { loopSeries } from '../../utils/loopSeries';
import { useObcTheme } from '../../hooks/useObcTheme';

const TABS = ['Summary', 'Signals', 'Calculations', 'Relationships', 'History'] as const;
type Tab = typeof TABS[number];

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const SIGNAL_MEANINGS: Record<string, string> = {
  PV: 'Process variable',
  SP: 'Setpoint',
  OP: 'Controller output',
  MODE: 'Controller mode',
  VP: 'Valve position feedback',
  QUALITY: 'Source quality',
  UPSTREAM: 'Upstream context signal',
  STATUS: 'Status signal',
  UTILITY: 'Utility signal',
};

export const CpmExplorer: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = (params.get('tab') as Tab) ?? 'Summary';
  const [search, setSearch] = React.useState('');

  const { data, isLoading } = useCpmLoops();
  const loops = useMemo(() => data?.loops ?? [], [data]);
  const selectedId = params.get('loop') ?? loops[0]?.loopId;
  const loop = loops.find(l => l.loopId === selectedId) ?? loops[0];

  // site → loops tree, filtered by a search that actually works.
  const tree = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = q
      ? loops.filter(l => l.loopId.toLowerCase().includes(q)
          || l.displayName.toLowerCase().includes(q))
      : loops;
    const bySite = new Map<string, CpmLoop[]>();
    for (const l of visible) {
      const key = l.site || 'unassigned';
      if (!bySite.has(key)) bySite.set(key, []);
      bySite.get(key)!.push(l);
    }
    return [...bySite.entries()];
  }, [loops, search]);

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Asset-centric operational context"
        title="Explorer"
        copy="Move from the site hierarchy to a loop, its signals, calculations, lineage, and history."
      />
      <div className="cpm-explorer-layout">
        <aside className="cpm-surface">
          <input
            className="cpm-input"
            style={{ width: '100%', marginBottom: 10 }}
            placeholder="Find a loop"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {isLoading && <EmptyState title="Loading…" />}
          {!isLoading && tree.length === 0 && (
            <EmptyState title="No loops"
              copy={search ? 'Nothing matches the search.' : 'Onboard loops in the Loop Registry.'}
              action={search ? undefined : { label: 'Open Loop Registry', onClick: () => navigate('/cpm/registry') }} />
          )}
          {tree.map(([site, siteLoops]) => (
            <div key={site} style={{ marginBottom: 10 }}>
              <span className="cpm-eyebrow">{site}</span>
              {siteLoops.map(l => (
                <button
                  key={l.loopId}
                  type="button"
                  className={`cpm-tree-item${loop?.loopId === l.loopId ? ' cpm-tree-item--active' : ''}`}
                  onClick={() => setParams(p => { p.set('loop', l.loopId); return p; })}
                >
                  <strong>{l.loopId}</strong>
                  <span className="cpm-event-row__sub">{l.displayName}</span>
                </button>
              ))}
            </div>
          ))}
        </aside>

        {loop
          ? <LoopWorkspace loop={loop} tab={tab}
              onTab={t => setParams(p => { p.set('tab', t); return p; })} />
          : <section className="cpm-surface"><EmptyState title="Select a loop" /></section>}
      </div>
    </div>
  );
};

// ── object workspace ───────────────────────────────────────────────────────

const LoopWorkspace: React.FC<{
  loop: CpmLoop;
  tab: Tab;
  onTab: (t: Tab) => void;
}> = ({ loop, tab, onTab }) => {
  const gates = useLatestGates(loop.loopId, '24h');
  const diagnosis = gates.data?.diagnosis ?? 'NOT_EVALUATED';

  return (
    <section className="cpm-surface">
      <PanelHead
        eyebrow={`Control loop · ${loop.site.toUpperCase()}`}
        title={loop.loopId}
        right={<TonePill tone={toneFor(diagnosis)}>{diagnosis.replace(/_/g, ' ')}</TonePill>}
      />
      <p className="cpm-copy">{loop.displayName} · {[loop.area, loop.unit].filter(Boolean).join(' / ') || loop.site}</p>

      <div className="cpm-filter-row" style={{ margin: '12px 0' }}>
        {TABS.map(t => (
          <ObcButton key={t} variant={tab === t ? 'raised' : 'normal'} onClick={() => onTab(t)}>
            {t}
          </ObcButton>
        ))}
      </div>

      {tab === 'Summary' && <SummaryTab loop={loop} />}
      {tab === 'Signals' && <SignalsTab loop={loop} />}
      {tab === 'Calculations' && <CalculationsTab loop={loop} />}
      {tab === 'Relationships' && <RelationshipsTab loop={loop} />}
      {tab === 'History' && <HistoryTab loop={loop} />}
    </section>
  );
};

// ── Summary ────────────────────────────────────────────────────────────────

const SummaryTab: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const gates = useLatestGates(loop.loopId, '24h');
  // F0.5 — live plane (RBE + snapshot-on-open); historian values remain the fallback.
  const live = useLoopLive(loop.loopId);
  const series = loopSeries(loop.loopId);
  const { start, end } = useMemo(() => {
    const now = new Date();
    return { start: new Date(now.getTime() - 8 * 3600_000), end: now };
  }, [loop.loopId]); // eslint-disable-line react-hooks/exhaustive-deps -- window anchors per loop
  const trend = useCpmTrend(series, start, end, 240);
  const points = useMemo(() => trend.data?.points ?? [], [trend.data]);
  const last = points.length ? points[points.length - 1] : undefined;
  const num = (v: unknown) => (typeof v === 'number' ? v : null);

  const obcTheme = useObcTheme(); // C: re-derive chart colors on theme switch
  const option = useMemo(() => {
    const good = cssVar('--instrument-enhanced-secondary-color', '#41be95');
    const amber = cssVar('--alert-caution-color', '#d79a40');
    const grey = cssVar('--on-container-neutral-color', '#9aa6af');
    return {
      animation: false,
      grid: { left: 42, right: 12, top: 14, bottom: 24 },
      xAxis: {
        type: 'category',
        data: points.map(p => new Date(p.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })),
        axisLabel: { color: grey }, axisLine: { lineStyle: { color: grey } },
      },
      yAxis: { type: 'value', scale: true, axisLabel: { color: grey }, splitLine: { lineStyle: { opacity: 0.2 } } },
      series: [
        { name: 'pv-min', type: 'line', stack: 'band', silent: true, symbol: 'none',
          lineStyle: { width: 0 }, data: points.map(p => num(p.pv_min)) },
        { name: 'pv-band', type: 'line', stack: 'band', silent: true, symbol: 'none',
          lineStyle: { width: 0 }, areaStyle: { color: good, opacity: 0.18 },
          data: points.map(p => {
            const lo = num(p.pv_min); const hi = num(p.pv_max);
            return lo != null && hi != null ? hi - lo : null;
          }) },
        { name: 'PV', type: 'line', symbol: 'none', lineStyle: { color: good, width: 2 },
          data: points.map(p => num(p.pv_avg) ?? num(p.pv)) },
        { name: 'SP', type: 'line', symbol: 'none', lineStyle: { color: grey, width: 1, type: 'dashed' },
          data: points.map(p => num(p.sp)) },
        { name: 'OP', type: 'line', symbol: 'none', lineStyle: { color: amber, width: 1.5 },
          data: points.map(p => num(p.op_avg) ?? num(p.op)) },
      ],
    };
  }, [points, obcTheme]);

  return (
    <div className="cpm-grid-2">
      <div>
        <PanelHead eyebrow={live.hasData ? 'Live operating state' : 'Last stored samples'}
          title="Operating state"
          right={<TonePill tone={qualityLabel(live.quality ?? live.pv).tone}>
            {live.hasData ? qualityLabel(live.quality ?? live.pv).label : 'NO LIVE PUBLISHER'}
          </TonePill>} />
        <div className="cpm-kpi-row" style={{ marginBottom: 12 }}>
          {(['pv', 'sp', 'op'] as const).map(m => {
            const lv = live[m];
            const liveVal = lv && typeof lv.value === 'number' ? lv.value.toFixed(2) : null;
            return (
              <div key={m} className="cpm-kpi">
                <span className="cpm-kpi__caption">{m.toUpperCase()}</span>
                <span className="cpm-kpi__value">
                  {liveVal
                    ?? (last && num(last[`${m}_avg`]) != null
                      ? (num(last[`${m}_avg`])!).toFixed(2)
                      : last && num(last[m]) != null ? (num(last[m])!).toFixed(2) : '—')}
                </span>
                <span className="cpm-kpi__sub">
                  {m === 'op' ? '%' : 'EU'} · {liveVal ? 'live (RBE)' : 'from historian'}
                </span>
              </div>
            );
          })}
        </div>
        {trend.isLoading && <EmptyState title="Loading trend…" />}
        {!trend.isLoading && points.length === 0 && (
          <EmptyState title="No historian data" copy={`No samples stored at ${series} in the last 8 hours.`} />
        )}
        {points.length > 0 && <ReactECharts option={option} style={{ height: 240 }} notMerge />}
      </div>
      <div>
        <PanelHead eyebrow="Context" title="Configuration" />
        <KvRow label="Loop type">{loop.loopType}</KvRow>
        <KvRow label="Criticality">{loop.criticality}</KvRow>
        <KvRow label="Gate profile">{loop.thresholdProfileId ?? 'default'}</KvRow>
        <KvRow label="Dynamics class">{gates.data?.metadata.dynamicsClass ?? 'resolved from loop type'}</KvRow>
        <KvRow label="Profile source">{gates.data?.metadata.profileSource ?? '—'}</KvRow>
        <KvRow label="Calculation version">{gates.data?.metadata.calculationVersion ?? '—'}</KvRow>
        <KvRow label="Historian device">{series}</KvRow>
      </div>
    </div>
  );
};

// ── Signals ────────────────────────────────────────────────────────────────

const SignalsTab: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const readiness = useCpmReadiness(loop.loopId);
  const provenance = readiness.data?.checks.find(c => c.id === 'binding_provenance');
  const roles = Object.entries(loop.tags);

  return (
    <div>
      {provenance && !provenance.ok && (
        <div className="cpm-banner" style={{ marginBottom: 12 }}>
          <strong>Binding provenance.</strong>&nbsp;{provenance.message}
        </div>
      )}
      {roles.length === 0 && <EmptyState title="No signal mappings" />}
      {roles.map(([role, path]) => (
        <div key={role} className="cpm-event-row" style={{ gridTemplateColumns: '0.5fr 1fr 1.6fr 0.6fr', cursor: 'default' }}>
          <strong>{role}</strong>
          <span className="cpm-event-row__sub">{SIGNAL_MEANINGS[role] ?? role}</span>
          <span className="cpm-mono">{path}</span>
          {/* P2-10: these registry paths are configuration metadata - nothing
              resolves data through them today (the historian reads
              root.site1.cpm.<loop> regardless), so labelling them RESOLVED
              claimed a binding that does not exist. */}
          <TonePill tone={provenance?.ok === false ? 'warn' : 'muted'}>
            {provenance?.ok === false ? 'CHECK' : 'CONFIGURED'}
          </TonePill>
        </div>
      ))}
      {!loop.tags['VP'] && (
        <p className="cpm-copy" style={{ marginTop: 10 }}>
          No VP mapping — G14 caps confidence at 0.89, so no diagnosis can reach CONFIRMED.
        </p>
      )}
    </div>
  );
};

// ── Calculations (summary; full catalogue lives in U9) ─────────────────────

const CalculationsTab: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const navigate = useNavigate();
  const gates = useLatestGates(loop.loopId, '24h');
  return (
    <div>
      <PanelHead eyebrow="Latest fused window" title="Gate outcomes"
        right={<ObcButton variant="raised"
          onClick={() => navigate(`/cpm/calculations?loop=${encodeURIComponent(loop.loopId)}`)}>
          Full catalogue ›
        </ObcButton>} />
      {gates.isLoading && <EmptyState title="Loading…" />}
      {!gates.isLoading && !gates.data && (
        <EmptyState title="No fused verdict yet"
          copy="Gate outcomes appear once a 12h window of samples has been evaluated." />
      )}
      {(gates.data?.gates ?? []).map(g => (
        <KvRow key={g.key} label={`${g.key} · ${g.name}`}>
          <TonePill tone={toneFor(g.status)}>{g.status.replace(/_/g, ' ')}</TonePill>
        </KvRow>
      ))}
    </div>
  );
};

// ── Relationships ──────────────────────────────────────────────────────────

const RelationshipsTab: React.FC<{ loop: CpmLoop }> = ({ loop }) => (
  <div>
    <PanelHead eyebrow="Lineage" title="Source → loop → calculations → outputs" />
    <div className="cpm-lineage">
      {[
        { title: 'UNS signals', sub: Object.keys(loop.tags).join(' · ') || 'none mapped' },
        { title: loop.loopId, sub: 'Control loop' },
        { title: 'CPLM pack', sub: '17 gates · Flink event time' },
        { title: 'Evidence', sub: 'Gate results · event frames · KPI series' },
      ].map((n, i, arr) => (
        <React.Fragment key={n.title}>
          <div className="cpm-lineage__node">
            <strong>{n.title}</strong>
            <span className="cpm-event-row__sub">{n.sub}</span>
          </div>
          {i < arr.length - 1 && <span className="cpm-lineage__arrow">→</span>}
        </React.Fragment>
      ))}
    </div>
    <PanelHead eyebrow="Peer topology (G13)" title="Loop links" />
    {loop.links.length === 0 && (
      <EmptyState title="No peer links"
        copy="Without peer links G13 stays NOT_EVALUATED and stiction cannot be distinguished from an upstream disturbance. Create asset relationships, then republish evidence from the Loop Registry." />
    )}
    {loop.links.map(l => (
      <KvRow key={`${l.relType}-${l.toLoopId}`} label={l.relType}>
        {l.toLoopId} <span className="cpm-event-row__sub">({l.origin})</span>
      </KvRow>
    ))}
  </div>
);

// ── History ────────────────────────────────────────────────────────────────

const HistoryTab: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const events = useCpmEvents({ loopId: loop.loopId, openOnly: false, includeShelved: true, limit: 50 });
  const rows = events.data?.events ?? [];
  return (
    <div>
      {events.isLoading && <EmptyState title="Loading history…" />}
      {!events.isLoading && rows.length === 0 && (
        <EmptyState title="No diagnosis episodes recorded for this loop" />
      )}
      {rows.map(e => (
        <div key={e.id} className="cpm-event-row" style={{ gridTemplateColumns: '0.9fr 1.6fr 0.8fr', cursor: 'default' }}>
          <span className="cpm-event-row__sub">
            {fmtDateTime(e.opened_at)}
            {e.closed_at ? ` → ${fmtDateTime(e.closed_at)}` : ' · open'}
          </span>
          <span>
            <span className="cpm-event-row__title">{e.peak_diagnosis.replace(/_/g, ' ')}</span>
            <div className="cpm-event-row__sub">{e.window_count} window(s) · peak {(e.peak_confidence * 100).toFixed(0)}%</div>
          </span>
          <TonePill tone={e.closed_at ? 'muted' : 'warn'}>{e.ack_state}</TonePill>
        </div>
      ))}
    </div>
  );
};

export default CpmExplorer;
