'use client';

/**
 * CPLM Phase 7 — U2 Explorer.
 * CPA-prototype IA parity: asset tree (site → loops, with a search that
 * actually filters — the prototype's was inert) + object workspace with the
 * five inner tabs (Summary / Signals / Calculations / Relationships / History),
 * all deep-linked via ?loop= and ?tab=.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, KvRow, PanelHead, QueryError, TonePill, WorkspaceHeader, WorkspaceTabs, toneFor,
  fmtDateTime, cpmChartColors, loopTrendHref, useRollingWindow, TREND_SPAN_MS, TREND_TICK_MS,
} from './shared';
import { PlantScopeFilter, useCpmScope, loopMatchesQuery } from './plantScope';
import {
  useCpmCalculations, useCpmEvents, useCpmLoops, useCpmReadiness, useCpmTrend,
  useLatestGates,
} from '../../hooks/useCpm';
import { useLoopLive, qualityLabel } from '../../hooks/useLoopLive';
import { ApiError } from '../../api/apiFetch';
import type { CpmEventFrame, CpmLoop } from '../../api/cpmApi';
import { loopSeries } from '../../utils/loopSeries';
import { useObcTheme } from '../../hooks/useObcTheme';
import { usePagedSlice } from '../shared/ListPager';

/**
 * gates/latest answers 404 when a loop has no fused window yet — that is a
 * legitimate "nothing to show", not a failure. Every other status is a failure
 * and must not be rendered as emptiness. Keeping the two apart is the whole
 * point of QueryError (see shared.tsx).
 */
const isNoVerdictYet = (e: unknown) => e instanceof ApiError && e.status === 404;

// The rolling 8h trend window now lives in shared.tsx — the Overview loop-focus
// panel had the same frozen-window defect and needed the same fix.

const TABS = ['Summary', 'Signals', 'Calculations', 'Relationships', 'History'] as const;
type Tab = typeof TABS[number];

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

/**
 * Display order for signal roles: the four required roles first, then the
 * optional ones — the same order the registry contract lists them in
 * (CpmLoopRegistryService.RequiredRoles / OptionalRoles). The tab used to render
 * Object.entries(tags) order, i.e. whatever order the rows came back in, so the
 * list reshuffled between loops and PV was not reliably first.
 */
const SIGNAL_ORDER = ['PV', 'SP', 'OP', 'MODE', 'VP', 'STATUS', 'QUALITY', 'UPSTREAM', 'UTILITY'];

export const CpmExplorer: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  // Validate rather than cast: `?tab=Foo` used to satisfy the cast, match none of
  // the four render branches, and leave an empty workspace with no explanation —
  // which is what a stale bookmark from a renamed tab produces.
  const rawTab = params.get('tab');
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : 'Summary';
  const [search, setSearch] = React.useState('');
  const scope = useCpmScope();

  const { data, isLoading, isError, error, refetch } = useCpmLoops();
  const loops = useMemo(() => data?.loops ?? [], [data]);
  // Case-insensitive, like every loop lookup in cplm-api (`lower(loop_id) =
  // lower($1)`) — a deep link whose case differs from the registry's should
  // resolve, not fall through to "not found".
  const requestedId = params.get('loop');
  const loop = requestedId
    ? loops.find(l => l.loopId.toLowerCase() === requestedId.toLowerCase())
    : loops[0];
  // A ?loop= that names nothing must SAY so. Falling back to loops[0] showed a
  // different loop's data under a URL naming the missing one — so a shared link
  // to a decommissioned loop silently read as its neighbour's.
  const missingLoop = !!requestedId && !loop && !isLoading && !isError && loops.length > 0;

  // site → area → unit → loops (A3.1). The tree used to collapse everything to
  // site → loops, which hid the two levels an operator actually navigates by;
  // search now matches area, unit and loop type too, not just id + name (A3.2).
  const tree = useMemo(() => {
    const visible = loops
      .filter(l => scope.matches(l))
      .filter(l => loopMatchesQuery(l, search));
    const byLocation = new Map<string, CpmLoop[]>();
    for (const l of visible) {
      const key = [l.site || 'unassigned', l.area, l.unit].filter(Boolean).join(' / ');
      if (!byLocation.has(key)) byLocation.set(key, []);
      byLocation.get(key)!.push(l);
    }
    return [...byLocation.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [loops, search, scope]);

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Asset-centric operational context"
        title="Explorer"
        copy="Move from the site hierarchy to a loop, its signals, calculations, lineage, and history."
      />
      <div className="cpm-explorer-layout">
        <aside className="cpm-surface">
          <PlantScopeFilter scope={scope} />
          <input
            className="cpm-input"
            style={{ width: '100%', marginBottom: 10 }}
            placeholder="Find by loop, service, area, unit or type"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {isLoading && <EmptyState title="Loading…" />}
          {isError && (
            <QueryError title="Loop registry unavailable" error={error} retry={() => void refetch()} />
          )}
          {!isLoading && !isError && tree.length === 0 && (
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
                  // replace: selecting a loop is in-page navigation in a
                  // master-detail view, not a page visit. Pushing it meant
                  // browsing eight loops left eight history entries between the
                  // operator and Back — while the URL stays just as shareable.
                  onClick={() => setParams(p => { p.set('loop', l.loopId); return p; }, { replace: true })}
                >
                  <strong>{l.loopId}</strong>
                  <span className="cpm-event-row__sub">{l.displayName}</span>
                </button>
              ))}
            </div>
          ))}
        </aside>

        {loop ? (
          <LoopWorkspace loop={loop} tab={tab}
            onTab={t => setParams(p => { p.set('tab', t); return p; }, { replace: true })} />
        ) : missingLoop ? (
          <section className="cpm-surface">
            <EmptyState
              title={`Loop "${requestedId}" is not in the registry`}
              copy="This link points at a loop that has been renamed, removed, or never onboarded. Pick a loop from the tree, or check the Loop Registry."
              action={{ label: 'Open Loop Registry', onClick: () => navigate('/cpm/registry') }} />
          </section>
        ) : (
          <section className="cpm-surface"><EmptyState title="Select a loop" /></section>
        )}
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
  // Same query key as SignalsTab's — react-query serves both from one fetch.
  const readiness = useCpmReadiness(loop.loopId);
  // A failed fetch is not a verdict: showing NOT_EVALUATED for a 500 told the
  // operator the engine had declined to judge this loop, when in fact nobody
  // asked it. 404 does mean "no fused window yet", so that keeps NOT_EVALUATED.
  const gatesFailed = gates.isError && !isNoVerdictYet(gates.error);
  const diagnosis = gatesFailed ? 'VERDICT UNAVAILABLE' : gates.data?.diagnosis ?? 'NOT_EVALUATED';

  return (
    <section className="cpm-surface">
      <PanelHead
        eyebrow={`Control loop · ${loop.site.toUpperCase()}`}
        title={loop.loopId}
        right={<TonePill tone={gatesFailed ? 'warn' : toneFor(diagnosis)}>{diagnosis.replace(/_/g, ' ')}</TonePill>}
      />
      <p className="cpm-copy">{loop.displayName} · {[loop.area, loop.unit].filter(Boolean).join(' / ') || loop.site}</p>

      {/* Readiness was already fetched for one provenance string and the rest
          discarded — so a loop that produces NO verdict at all sat here looking
          merely un-evaluated, with the reason a tab away. Blockers explain the
          absence; warnings explain a capped confidence. */}
      {readiness.data && !readiness.data.ready && readiness.data.blockers.length > 0 && (
        <div className="cpm-banner" style={{ marginTop: 10 }}>
          <strong>Not producing verdicts.</strong>&nbsp;{readiness.data.blockers.join(' ')}
        </div>
      )}
      {readiness.data?.degraded && readiness.data.warnings.length > 0 && (
        <div className="cpm-banner" style={{ marginTop: 10 }}>
          <strong>Degraded evidence.</strong>&nbsp;{readiness.data.warnings.join(' ')}
        </div>
      )}

      {/* B3: same tab idiom as Investigation/Historical — this pane already had
          URL-persisted tabs, it just looked different from the other two. */}
      <WorkspaceTabs
        tabs={TABS.map(t => ({ key: t, label: t }))}
        active={tab}
        onChange={t => onTab(t as Tab)}
        ariaLabel="Loop detail sections"
      />

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
  const { start, end } = useRollingWindow(TREND_SPAN_MS, TREND_TICK_MS);
  // pollDriven: the window advances on a timer, not because the operator asked.
  const trend = useCpmTrend(series, start, end, 240, 'pv,sp,op', true, true);
  const points = useMemo(() => trend.data?.points ?? [], [trend.data]);
  const last = points.length ? points[points.length - 1] : undefined;
  const num = (v: unknown) => (typeof v === 'number' ? v : null);

  const obcTheme = useObcTheme(); // C: re-derive chart colors on theme switch
  const option = useMemo(() => {
    const { good, amber, grey } = cpmChartColors();
    return {
      animation: false,
      grid: { left: 42, right: 12, top: 30, bottom: 24 },
      // The chart carried no tooltip and no legend, so the operator could see the
      // shape of an oscillation but could not read a single value off it — on the
      // one screen whose job is to justify a diagnosis with evidence.
      legend: {
        data: ['PV', 'SP', 'OP'], top: 0, right: 0,
        textStyle: { color: grey }, inactiveColor: grey,
      },
      tooltip: {
        trigger: 'axis',
        // 'pv-min'/'pv-band' are the two stacked helper series that draw the
        // envelope; their STACKED values are not readable quantities, so they are
        // filtered out and the bucket's real min–max is reported instead.
        formatter: (params: Array<{ seriesName: string; marker: string; value: number | null; dataIndex: number }>) => {
          if (!params.length) return '';
          const p = points[params[0].dataIndex];
          const rows = params
            .filter(x => x.seriesName !== 'pv-min' && x.seriesName !== 'pv-band')
            .map(x => `${x.marker} ${x.seriesName}: ${x.value == null ? '—' : Number(x.value).toFixed(2)}`);
          const lo = num(p?.pv_min); const hi = num(p?.pv_max);
          if (lo != null && hi != null) rows.push(`PV range: ${lo.toFixed(2)} – ${hi.toFixed(2)}`);
          return [`<strong>${fmtDateTime(p?.ts)}</strong>`, ...rows].join('<br/>');
        },
      },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- obcTheme is a recompute trigger: chart colors are read from CSS vars that change with the theme.
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
            // Read the SAME aggregate the chart pen draws: PV/OP from the bucket
            // average, SP from last_value. The tile used to prefer sp_avg while
            // the SP line used sp, so a loop whose setpoint had just stepped
            // showed two different numbers both labelled "SP".
            const stored = m === 'sp'
              ? num(last?.[m])
              : num(last?.[`${m}_avg`]) ?? num(last?.[m]);
            return (
              <div key={m} className="cpm-kpi">
                <span className="cpm-kpi__caption">{m.toUpperCase()}</span>
                <span className="cpm-kpi__value">
                  {liveVal ?? (stored != null ? stored.toFixed(2) : '—')}
                </span>
                {/* OP is a percentage of span by definition in this engine. PV/SP
                    carry no engineering unit anywhere in the registry, so the old
                    'EU' label was decoration that read like a real unit. */}
                <span className="cpm-kpi__sub">
                  {m === 'op' ? '% · ' : ''}{liveVal ? 'live (RBE)' : 'from historian'}
                </span>
              </div>
            );
          })}
        </div>
        {/* The window this chart covers, stated. It rolls on a timer, and a
            rolling window that has silently stopped advancing (tab suspended,
            fetch failing) is indistinguishable from a live one without this. */}
        <p className="cpm-copy" style={{ marginTop: 0 }}>
          Window {fmtDateTime(start.getTime())} → {fmtDateTime(end.getTime())}
        </p>
        {trend.isLoading && <EmptyState title="Loading trend…" />}
        {/* A historian 403/500 is not an empty historian. Claiming "no samples
            stored" for a failed read sent operators to debug the IoTDB sink when
            the actual fault was their permissions or a down service. */}
        {trend.isError && (
          <QueryError title="Trend unavailable" error={trend.error} retry={() => void trend.refetch()} />
        )}
        {!trend.isLoading && !trend.isError && points.length === 0 && (
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
  const navigate = useNavigate();
  const readiness = useCpmReadiness(loop.loopId);
  const provenance = readiness.data?.checks.find(c => c.id === 'binding_provenance');
  const roles = useMemo(() => {
    const rank = (r: string) => {
      const i = SIGNAL_ORDER.indexOf(r);
      return i === -1 ? SIGNAL_ORDER.length : i; // unknown roles last, then A-Z
    };
    return Object.entries(loop.tags)
      .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
  }, [loop.tags]);

  return (
    <div>
      {/* Readiness is what tells this tab whether a binding actually resolves.
          If the check itself failed, say so — silence here reads as "all clear". */}
      {readiness.isError && (
        <QueryError title="Binding provenance check unavailable"
          error={readiness.error} retry={() => void readiness.refetch()} />
      )}
      {provenance && !provenance.ok && (
        <div className="cpm-banner" style={{ marginBottom: 12 }}>
          <strong>Binding provenance.</strong>&nbsp;{provenance.message}
        </div>
      )}
      {roles.length === 0 && <EmptyState title="No signal mappings" />}
      {roles.length > 0 && (() => {
        const href = loopTrendHref(loop.tags);
        return href && (
          <div className="cpm-filter-row" style={{ marginBottom: 8 }}>
            {/* The workflow endpoint of the signal-asset projection: these paths
                now resolve through the UNS to the loop's real data, so the
                standard Trend page can draw them — history and live tail. */}
            <ObcButton variant="raised" onClick={() => navigate(href)}>
              Open signals in Trend ›
            </ObcButton>
          </div>
        );
      })()}
      {roles.map(([role, path]) => (
        <div key={role} className="cpm-event-row" style={{ gridTemplateColumns: '0.5fr 1fr 1.6fr 0.6fr', cursor: 'default' }}>
          <strong>{role}</strong>
          <span className="cpm-event-row__sub">{SIGNAL_MEANINGS[role] ?? role}</span>
          <span className="cpm-mono">{path}</span>
          {/* Since the signal-asset projection, these paths CAN genuinely resolve
              through the asset model — and the provenance check verifies it. So
              the pill now reports the checked truth: RESOLVED when provenance
              passed, CHECK when it failed, CONFIGURED while unknown. (P2-10's
              old complaint — RESOLVED claimed with no binding behind it — is
              exactly what the projection fixed.) */}
          <TonePill tone={provenance?.ok === true ? 'good' : provenance?.ok === false ? 'warn' : 'muted'}>
            {provenance?.ok === true ? 'RESOLVED' : provenance?.ok === false ? 'CHECK' : 'CONFIGURED'}
          </TonePill>
        </div>
      ))}
      {/* The G14 confidence cap only matters if this loop is being evaluated at
          all. On a monitoring-disabled loop the note pointed at a consequence
          that cannot occur, next to the bigger fact that nothing is computed. */}
      {!loop.tags['VP'] && loop.monitoringEnabled && (
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
      {gates.isError && !isNoVerdictYet(gates.error) && (
        <QueryError title="Gate outcomes unavailable"
          error={gates.error} retry={() => void gates.refetch()} />
      )}
      {!gates.isLoading && !gates.data && (!gates.isError || isNoVerdictYet(gates.error)) && (
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

const RelationshipsTab: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  // The gate count was hardcoded as "17 gates". The catalogue endpoint reports
  // what the engine actually computes (and which gates have been observed in
  // stored results), so a pack change can no longer leave this text lying.
  const calc = useCpmCalculations();
  const gates = calc.data?.gates ?? [];
  const observed = gates.filter(g => g.observedInResults).length;
  const gatesSub = gates.length
    ? `${gates.length} gates (${observed} observed) · ${calc.data?.engine ?? 'Flink'}`
    : 'gate catalogue unavailable';

  // Evidence node: name the stores this loop's evidence actually lands in, and
  // the calculation version that produced the latest verdict, rather than a
  // static caption that was identical for every loop in the plant.
  const latest = useLatestGates(loop.loopId, '24h');
  const version = latest.data?.metadata.calculationVersion;

  return (
    <div>
      <PanelHead eyebrow="Lineage" title="Source → loop → calculations → outputs" />
      <div className="cpm-lineage">
        {[
          { title: 'UNS signals', sub: Object.keys(loop.tags).join(' · ') || 'none mapped' },
          { title: loop.loopId, sub: [loop.loopType, loop.criticality].filter(Boolean).join(' · ') || 'Control loop' },
          { title: 'CPLM pack', sub: gatesSub },
          {
            title: 'Evidence',
            sub: version
              ? `Gate results · event frames · KPI series · calc ${version}`
              : 'Gate results · event frames · KPI series',
          },
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
};

// ── History ────────────────────────────────────────────────────────────────

// The API window the tab pulls. sort:'recent' is load-bearing, not a preference:
// the endpoint's default order is triage (open first, then peak confidence), so
// under the default this LIMIT kept the highest-CONFIDENCE frames while this tab
// rendered them as a timeline and the pager called them "latest". A loop with
// more than FETCH_WINDOW episodes then hid its recent ones behind old strong
// ones. 'recent' makes the truncation mean what the UI says it means.
const HISTORY_FETCH_WINDOW = 50;
const HISTORY_PAGE_SIZE = 10;

const HistoryTab: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const events = useCpmEvents({
    loopId: loop.loopId, openOnly: false, includeShelved: true,
    limit: HISTORY_FETCH_WINDOW, sort: 'recent',
  });
  const rows = useMemo(() => events.data?.events ?? [], [events.data]);

  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  // Switching loops must not leave the operator on page 4 of the previous loop.
  useEffect(() => { setPage(0); }, [loop.loopId]);

  // Episodes were a dead end here, while every sibling screen routes its evidence
  // somewhere. Historical bounds its trend, KPI overlay and gate history to
  // ?from/?to, so an episode's own span is exactly the right window to hand it.
  const openEpisode = (e: CpmEventFrame) => {
    const q = new URLSearchParams({
      loop: loop.loopId,
      from: new Date(e.opened_at).toISOString(),
      // An open episode has no end — bound it at now rather than omitting `to`
      // and letting Historical fall back to its own default window.
      to: new Date(e.closed_at ?? Date.now()).toISOString(),
    });
    navigate(`/cpm/historical?${q.toString()}`);
  };
  // Paging LOGIC comes from the shared helper (same clamp-and-slice the alarm and
  // SOE lists use). The .cpm-pager MARKUP stays: ListPager's own chrome is a
  // space-between footer with a background fill, which would restyle the CPM
  // surfaces rather than just de-duplicate them.
  const { pageCount, safePage, pageItems: pagedRows } =
    usePagedSlice(rows, page, HISTORY_PAGE_SIZE);

  return (
    <div>
      {events.isLoading && <EmptyState title="Loading history…" />}
      {events.isError && (
        <QueryError title="Episode history unavailable"
          error={events.error} retry={() => void events.refetch()} />
      )}
      {!events.isLoading && !events.isError && rows.length === 0 && (
        <EmptyState title="No diagnosis episodes recorded for this loop" />
      )}
      {pagedRows.map(e => (
        <div
          key={e.id}
          className="cpm-event-row"
          style={{ gridTemplateColumns: '0.9fr 1.6fr 0.8fr' }}
          role="button"
          tabIndex={0}
          title="Open this episode's span in the Historical explorer"
          onClick={() => openEpisode(e)}
          onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openEpisode(e); } }}
        >
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
      {pageCount > 1 && (
        <div className="cpm-pager">
          <ObcButton variant="flat" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}>← Prev</ObcButton>
          <span className="cpm-event-row__sub">
            {safePage * HISTORY_PAGE_SIZE + 1}–{Math.min((safePage + 1) * HISTORY_PAGE_SIZE, rows.length)} of {rows.length}
            {rows.length >= HISTORY_FETCH_WINDOW ? ` (newest ${HISTORY_FETCH_WINDOW}; older episodes not fetched)` : ''}
            {' '}· Page {safePage + 1} of {pageCount}
          </span>
          <ObcButton variant="flat" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}>Next →</ObcButton>
        </div>
      )}
    </div>
  );
};

export default CpmExplorer;
