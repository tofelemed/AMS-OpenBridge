'use client';

/**
 * CPLM Phase 7 — U7 Window inspector (/cpm/windows?loop=&profile=).
 * CPA-prototype IA parity: profile toolbar with a live runtime chip, the
 * emitted-window list, the window metadata grid with boundary semantics and
 * expected-vs-actual samples, a sample-density bar built from real raw
 * historian counts, and the window contract strip. Late/out-of-order counts
 * are DG-4 — the jobs do not record them today, so they render as "—".
 */
import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, KvRow, PanelHead, TonePill, WorkspaceHeader,
  fmtDateTime, fmtDuration, fmtWindowShape, loopTrendHref, windowSpecsOf, QueryError } from './shared';
import { LoopPicker, PlantScopeFilter, useCpmScope } from './plantScope';
import type { CpmKpiRow } from '../../api/cpmApi';
import {
  useCpmKpis, useCpmLoops, useCpmResolutions, usePipelineMetrics, useRawWindow,
} from '../../hooks/useCpm';
import { loopSeries } from '../../utils/loopSeries';

/** The engine normalizes samples onto a 5 s grid; expectations derive from it. */
const SAMPLE_PERIOD_S = 5; // fallback only - rows carry sample_period_sec since P2-11

const PROFILE_SECONDS: Record<string, number> = {
  '1m': 60, '5m': 300, '10m': 600, '15m': 900, '30m': 1800, '60m': 3600,
  '4h': 4 * 3600, '12h': 12 * 3600, '24h': 24 * 3600,
};

const fmtBytesless = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString());

function completenessOf(row: CpmKpiRow, profileS: number): number | null {
  const direct = row.completeness;
  if (typeof direct === 'number') return direct;
  if (typeof row.sample_count === 'number') {
    // P2-11: prefer the engine's own per-window contract; a 1s loop was
    // previously billed against the hardcoded 5s and read 20% complete.
    const period = typeof row.sample_period_sec === 'number' && row.sample_period_sec > 0
      ? row.sample_period_sec : SAMPLE_PERIOD_S;
    const expected = typeof row.expected_sample_count === 'number' && row.expected_sample_count > 0
      ? row.expected_sample_count : profileS / period;
    return row.sample_count / expected;
  }
  return null;
}

export const CpmWindows: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const loopsQuery = useCpmLoops();
  const loops = useMemo(() => loopsQuery.data?.loops ?? [], [loopsQuery.data]);
  // Plant scope (CPM-UX A1): narrows the loop picker to a section/unit.
  const scope = useCpmScope();
  const loopId = params.get('loop') ?? loops[0]?.loopId;
  const profile = params.get('profile') ?? '15m';

  const resolutions = useCpmResolutions();
  const metrics = usePipelineMetrics();
  // 12 windows: 5 was too thin for inspection (a single hour of 5m windows).
  const kpis = useCpmKpis(loopId, profile, 12);

  // The served window contract — the authority on assigner/slide/lateness. This
  // page previously asserted its own version and got two facts wrong. windowSpecsOf
  // keeps the selector populated (names only) if the API predates `windows`.
  const specs = useMemo(
    () => windowSpecsOf(resolutions.data, k => (PROFILE_SECONDS[k] ?? 0) * 1000),
    [resolutions.data]);
  const shortSpecs = useMemo(() => specs.filter(w => w.tier === 'short'), [specs]);
  const longSpecs = useMemo(() => specs.filter(w => w.tier === 'long'), [specs]);
  const spec = specs.find(w => w.kind === profile);
  const isLong = spec ? spec.tier === 'long'
    : (resolutions.data?.longWindows ?? ['4h', '12h', '24h']).includes(profile);
  // W4: window length prefers the SERVED contract; the local map is only the
  // fallback. With `?? 900` alone, a window kind this map has never heard of
  // silently billed its expectations against 15 minutes.
  const profileS = spec?.sizeMs != null
    ? spec.sizeMs / 1000
    : PROFILE_SECONDS[profile] ?? 900;

  const rows = useMemo(() => kpis.data?.samples ?? [], [kpis.data]);
  const selectedEnd = params.get('window');
  const selected = rows.find(r => r.window_end === selectedEnd) ?? rows[0];

  // Sample density across the selected window from the raw historian slice.
  const series = loopId ? loopSeries(loopId) : undefined;
  const winStart = selected?.window_start ? new Date(selected.window_start) : undefined;
  const winEnd = selected?.window_end ? new Date(selected.window_end) : undefined;
  const raw = useRawWindow(series, winStart, winEnd, 'pv', 5000);

  // W1: the density expectation uses the ENGINE'S per-window sample period when
  // the selected row carries one — the metadata panel one column over already
  // does (P2-11), but this strip kept billing every loop against the hardcoded
  // 5s grid, so a 1s loop read ~500% and a 10s loop read "sparse" at perfect
  // coverage.
  const gridPeriodS = typeof selected?.sample_period_sec === 'number' && selected.sample_period_sec > 0
    ? selected.sample_period_sec : SAMPLE_PERIOD_S;
  const gridIsServed = typeof selected?.sample_period_sec === 'number' && selected.sample_period_sec > 0;

  const BUCKETS = 24;
  const density = useMemo(() => {
    if (!winStart || !winEnd) return [];
    const span = winEnd.getTime() - winStart.getTime();
    if (span <= 0) return [];
    const counts = new Array<number>(BUCKETS).fill(0);
    let lastTs = winStart.getTime();
    for (const p of raw.data?.points ?? []) {
      const i = Math.min(BUCKETS - 1, Math.floor(((p.ts - winStart.getTime()) / span) * BUCKETS));
      if (i >= 0) counts[i] += 1;
      if (p.ts > lastTs) lastTs = p.ts;
    }
    // W2: when the raw page is CAPPED (hasMore), samples past the last fetched
    // timestamp were never read — those buckets are UNKNOWN, not empty. Painting
    // them grey made the back two-thirds of a 24h window look like a storage gap
    // while the legend swore grey meant "no stored samples".
    const capped = raw.data?.hasMore === true;
    const fetchedUpTo = capped
      ? Math.min(BUCKETS - 1, Math.floor(((lastTs - winStart.getTime()) / span) * BUCKETS))
      : BUCKETS - 1;
    const expectedPerBucket = span / 1000 / gridPeriodS / BUCKETS;
    return counts.map((c, i) => ({
      count: c,
      ratio: expectedPerBucket > 0 ? c / expectedPerBucket : 0,
      fetched: i <= fetchedUpTo,
    }));
  }, [raw.data, gridPeriodS, winStart?.getTime(), winEnd?.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps -- Date identity is unstable; time values are the real deps

  const rawCapped = raw.data?.hasMore === true;
  const expectedSamples = Math.round(profileS / gridPeriodS);

  // Watermark chip: DG-1 gives job state + checkpoint age; watermark lag itself
  // is listed unavailable by the proxy, so the chip reports what is real.
  const cplmJob = metrics.data?.jobs.find(j =>
    j.role === 'cplm' && j.name.toLowerCase().includes(isLong ? 'long' : 'short'));
  const anyCplm = cplmJob ?? metrics.data?.jobs.find(j => j.role === 'cplm');

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Windowing internals"
        title="Window inspector"
        copy="How the engine slices time for this loop: emitted windows, their sample budgets, and what each one carried."
        actions={
          metrics.data ? (
            <TonePill tone={anyCplm?.state === 'RUNNING' ? 'good' : anyCplm ? 'bad' : 'muted'}>
              {anyCplm
                ? `${anyCplm.name.replace('AMS - ', '')} · ${anyCplm.state}`
                  + (anyCplm.checkpoint?.lastCompletedAgeSec != null
                    ? ` · ckpt ${anyCplm.checkpoint.lastCompletedAgeSec}s ago` : '')
                : 'CPLM jobs not visible'}
            </TonePill>
          ) : <TonePill tone="muted">CHECKING RUNTIME…</TonePill>
        }
      />

      <section className="cpm-surface">
        <PlantScopeFilter scope={scope} />
        <div className="cpm-toolbar">
          <LoopPicker scope={scope} loops={loops} value={loopId ?? ''}
            onChange={id => setParams(p => { p.set('loop', id); p.delete('window'); return p; }, { replace: true })} />
          <label className="cpm-field">
            <span className="cpm-field__label">Window profile</span>
            <select className="cpm-select" value={profile}
              onChange={e => setParams(p => { p.set('profile', e.target.value); p.delete('window'); return p; }, { replace: true })}>
              {/* Labels come from the served window contract. They used to be
                  hardcoded as "{w} tumbling" for every short kind — true only of
                  1m; 5m/10m/15m/30m/60m are SLIDING windows with overlap. */}
              <optgroup label="Short features (G0–G4)">
                {shortSpecs.map(w => {
                  const shape = fmtWindowShape(w);
                  return <option key={w.kind} value={w.kind}>{w.kind}{shape ? ` — ${shape}` : ''}</option>;
                })}
              </optgroup>
              <optgroup label="Long diagnostics (G5–G11)">
                {longSpecs.map(w => {
                  const shape = fmtWindowShape(w);
                  return <option key={w.kind} value={w.kind}>{w.kind}{shape ? ` — ${shape}` : ''}</option>;
                })}
              </optgroup>
            </select>
          </label>
          <span className="cpm-filter-count">
            Watermark lag: — (not exposed by the metrics proxy; job state and checkpoint age above are live)
          </span>
        </div>

        <PanelHead eyebrow="Emitted windows" title={`Latest ${profile} results for ${loopId ?? '—'}`}
          right={<span className="cpm-copy">{rows.length} recent · newest first</span>} />
        {kpis.isLoading && <EmptyState title="Loading windows…" />}
        {kpis.isError && <QueryError title="Window data unavailable" error={kpis.error} retry={() => void kpis.refetch()} />}
        {!kpis.isLoading && !kpis.isError && rows.length === 0 && (
          <EmptyState title={`No ${profile} windows stored for this loop`}
            copy="Rows appear as the corresponding Flink tier emits results for this resolution." />
        )}
        {rows.map(r => {
          const comp = completenessOf(r, profileS);
          const isSel = selected?.window_end === r.window_end;
          return (
            <div key={r.window_end ?? r.created_at}
              className={`cpm-event-row${isSel ? ' cpm-event-row--selected' : ''}`}
              style={{ gridTemplateColumns: '1.6fr 1fr 1fr 0.8fr' }}
              role="button" tabIndex={0}
              aria-pressed={isSel}
              onClick={() => setParams(p => { if (r.window_end) p.set('window', r.window_end); return p; }, { replace: true })}
              onKeyDown={e => {
                if ((e.key === 'Enter' || e.key === ' ') && r.window_end) {
                  e.preventDefault();
                  setParams(p => { p.set('window', r.window_end!); return p; }, { replace: true });
                }
              }}>
              <span>
                <span className="cpm-event-row__title">
                  {r.window_end ? fmtDateTime(r.window_end) : '—'}
                </span>
                <div className="cpm-event-row__sub">
                  {r.window_start ? `from ${fmtDateTime(r.window_start)}` : ''}
                </div>
              </span>
              <span className="cpm-event-row__sub">
                {fmtBytesless(typeof r.sample_count === 'number' ? r.sample_count : null)} samples
              </span>
              {/* P2-13: every CPM timestamp names its zone — this was the one
                  bare toLocaleTimeString left on the page. */}
              <span className="cpm-event-row__sub">
                emitted {fmtDateTime(r.created_at)}
              </span>
              <TonePill tone={comp == null ? 'muted' : comp >= 0.9 ? 'good' : comp >= 0.5 ? 'warn' : 'bad'}>
                {comp != null ? `${Math.min(100, comp * 100).toFixed(0)}% full` : 'UNKNOWN'}
              </TonePill>
            </div>
          );
        })}
      </section>

      <div className="cpm-grid-2">
        <section className="cpm-surface">
          <PanelHead eyebrow="Window metadata" title="Contract for the selected window" />
          {!selected && <EmptyState title="Select an emitted window above" />}
          {selected && (
            <>
              <KvRow label="Boundaries">
                <span className="cpm-mono">
                  [{selected.window_start ? fmtDateTime(selected.window_start) : '—'},{' '}
                  {selected.window_end ? fmtDateTime(selected.window_end) : '—'})
                </span>
              </KvRow>
              {/* Size/slide and lateness now come from the served contract. The
                  hardcoded text claimed every window was "tumbling — no overlap"
                  (true only of 1m — the other five short kinds are sliding) and
                  that short-tier lateness was "watermark-bounded" (each branch
                  sets an explicit 30s/60s/90s/2min/2min/3min). */}
              <KvRow label="Size / slide">
                {spec
                  ? `${fmtWindowShape(spec)}${spec.overlapping ? ' — overlapping' : ' — no overlap'}`
                  : '—'}
              </KvRow>
              <KvRow label="Expected samples">
                {(() => {
                  // The engine publishes the real per-window sample period; this
                  // panel used to assume a 5 s grid for every loop.
                  const served = typeof selected.expected_sample_count === 'number'
                    ? selected.expected_sample_count : null;
                  const period = typeof selected.sample_period_sec === 'number'
                    ? selected.sample_period_sec : null;
                  if (served != null) {
                    return `${served.toLocaleString()}${period ? ` (${period} s grid)` : ''}`;
                  }
                  return `${expectedSamples.toLocaleString()} (assumed ${SAMPLE_PERIOD_S} s grid — engine did not report one)`;
                })()}
              </KvRow>
              <KvRow label="Actual samples">
                {fmtBytesless(typeof selected.sample_count === 'number' ? selected.sample_count : null)}
              </KvRow>
              <KvRow label="Completeness">
                {(() => { const c = completenessOf(selected, profileS); return c != null ? `${(c * 100).toFixed(1)}%` : '—'; })()}
              </KvRow>
              <KvRow label="Allowed lateness">
                {spec?.allowedLatenessMs != null
                  ? `${fmtDuration(spec.allowedLatenessMs)} (event-time)`
                  : spec?.cadenceMs != null
                    ? `n/a — recomputed every ${fmtDuration(spec.cadenceMs)} from a retained buffer`
                    : '—'}
              </KvRow>
              {spec?.minSamples != null && (
                <KvRow label="Minimum samples">
                  {spec.minSamples} — a slice below this is not emitted at all
                </KvRow>
              )}
              <KvRow label="Late events">— (DG-4: not recorded by the jobs)</KvRow>
              <KvRow label="Out-of-order events">— (DG-4: not recorded by the jobs)</KvRow>
              {/* W6: the inspector was a dead end — an incomplete window found
                  here could go nowhere. Both targets take the window's own
                  bounds: Historical for KPI/diagnosis context, Trend PINNED to
                  the exact range for signal-level scrutiny. */}
              {winStart && winEnd && (
                <div className="cpm-filter-row" style={{ marginTop: 12 }}>
                  <ObcButton variant="raised" onClick={() => {
                    const q = new URLSearchParams({
                      loop: loopId ?? '',
                      from: winStart.toISOString(),
                      to: winEnd.toISOString(),
                    });
                    navigate(`/cpm/historical?${q.toString()}`);
                  }}>
                    Open range in Historical ›
                  </ObcButton>
                  {(() => {
                    const loop = loops.find(l => l.loopId === loopId);
                    const href = loop
                      ? loopTrendHref(loop.tags, '8h', { from: winStart, to: winEnd })
                      : null;
                    return href && (
                      <ObcButton variant="normal" onClick={() => navigate(href)}>
                        Open in Trend ›
                      </ObcButton>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </section>

        <section className="cpm-surface">
          <PanelHead eyebrow="Sample density" title="Raw historian coverage across the window"
            right={raw.data ? <span className="cpm-copy">{raw.data.count.toLocaleString()} raw points{rawCapped ? ' (first page)' : ''}</span> : undefined} />
          {raw.isLoading && <EmptyState title="Counting raw samples…" />}
          {!raw.isLoading && density.length === 0 && (
            <EmptyState title="No raw slice available"
              copy="Select a window with stored historian data to see its per-bucket sample density." />
          )}
          {density.length > 0 && (
            <>
              <div className="cpm-density" aria-label="Sample density">
                {density.map((b, i) => (
                  <div key={i}
                    className={`cpm-density__bucket${
                      !b.fetched ? ' cpm-density__bucket--unfetched'
                        : b.count === 0 ? ' cpm-density__bucket--empty'
                        : b.ratio < 0.6 ? ' cpm-density__bucket--sparse' : ''}`}
                    style={{ height: !b.fetched ? '100%' : `${Math.max(4, Math.min(100, b.ratio * 100))}%` }}
                    title={!b.fetched
                      ? 'not fetched — beyond the raw page cap, unknown coverage'
                      : `${b.count} sample(s) · ${(b.ratio * 100).toFixed(0)}% of the ${gridPeriodS} s-grid expectation`} />
                ))}
              </div>
              <p className="cpm-copy">
                {BUCKETS} buckets · full-height = 100% of the {gridPeriodS} s-grid budget
                {gridIsServed ? ' (engine-reported)' : ' (assumed)'} · amber = sparse · grey = empty
                {rawCapped ? ' · hatched = not fetched (raw page cap) — unknown, not missing' : ''}.
                {' '}Bad-quality exclusion counts live in the G0 result, not the historian, and are not double-counted here.
              </p>
            </>
          )}

          {/* Boundary behaviour differs per assigner, and this block described the
              tumbling case for all of them. A sliding window does NOT start empty
              — it shares samples with its neighbours — and the long tier is not a
              Flink window at all but a retained buffer resliced on a timer. */}
          <PanelHead eyebrow="Window contract" title="What happens at each boundary" />
          <div className="cpm-window-rows">
            <div className="cpm-window-row">
              <strong>On open</strong>
              <span className="cpm-event-row__sub">
                {spec?.assigner === 'sliding'
                  ? `overlaps the previous window by ${fmtDuration(spec.sizeMs - (spec.slideMs ?? 0))} — samples are shared, not dropped`
                  : spec?.assigner === 'rolling-buffer'
                    ? 'no open/close — a slice is taken from the retained buffer'
                    : 'all prior samples dropped (tumbling)'}
              </span>
              <span className="cpm-event-row__sub">
                {spec?.assigner === 'tumbling' ? '→ empty accumulator' : '→ shared history'}
              </span>
            </div>
            <div className="cpm-window-row">
              <strong>While open</strong>
              <span className="cpm-event-row__sub">samples accumulate at the loop's publish rate</span>
              <span className="cpm-event-row__sub">→ up to {expectedSamples.toLocaleString()} added</span>
            </div>
            <div className="cpm-window-row">
              <strong>On close</strong>
              <span className="cpm-event-row__sub">
                {spec?.cadenceMs != null
                  ? `event-time timer fires every ${fmtDuration(spec.cadenceMs)}`
                  : spec?.allowedLatenessMs != null
                    ? `watermark passes window end, then ${fmtDuration(spec.allowedLatenessMs)} of lateness is still accepted`
                    : 'watermark passes window end'}
              </span>
              <span className="cpm-event-row__sub">
                {spec?.minSamples != null
                  ? `→ one result if ≥ ${spec.minSamples} samples, else nothing`
                  : '→ one result emitted, nothing retained'}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CpmWindows;
