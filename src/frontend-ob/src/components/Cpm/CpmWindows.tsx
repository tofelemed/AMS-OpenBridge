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
import { useSearchParams } from 'react-router-dom';
import {
  EmptyState, KvRow, LoopSelect, PanelHead, TonePill, WorkspaceHeader,
  fmtDateTime,
} from './shared';
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
  const [params, setParams] = useSearchParams();
  const loopsQuery = useCpmLoops();
  const loops = useMemo(() => loopsQuery.data?.loops ?? [], [loopsQuery.data]);
  const loopId = params.get('loop') ?? loops[0]?.loopId;
  const profile = params.get('profile') ?? '15m';
  const profileS = PROFILE_SECONDS[profile] ?? 900;

  const resolutions = useCpmResolutions();
  const metrics = usePipelineMetrics();
  const kpis = useCpmKpis(loopId, profile, 5);

  const rows = useMemo(() => kpis.data?.samples ?? [], [kpis.data]);
  const selectedEnd = params.get('window');
  const selected = rows.find(r => r.window_end === selectedEnd) ?? rows[0];

  // Sample density across the selected window from the raw historian slice.
  const series = loopId ? loopSeries(loopId) : undefined;
  const winStart = selected?.window_start ? new Date(selected.window_start) : undefined;
  const winEnd = selected?.window_end ? new Date(selected.window_end) : undefined;
  const raw = useRawWindow(series, winStart, winEnd, 'pv', 5000);

  const BUCKETS = 24;
  const density = useMemo(() => {
    if (!winStart || !winEnd) return [];
    const span = winEnd.getTime() - winStart.getTime();
    if (span <= 0) return [];
    const counts = new Array<number>(BUCKETS).fill(0);
    for (const p of raw.data?.points ?? []) {
      const i = Math.min(BUCKETS - 1, Math.floor(((p.ts - winStart.getTime()) / span) * BUCKETS));
      if (i >= 0) counts[i] += 1;
    }
    const expectedPerBucket = span / 1000 / SAMPLE_PERIOD_S / BUCKETS;
    return counts.map(c => ({ count: c, ratio: expectedPerBucket > 0 ? c / expectedPerBucket : 0 }));
  }, [raw.data, winStart?.getTime(), winEnd?.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps -- Date identity is unstable; time values are the real deps

  const rawCapped = raw.data?.hasMore === true;
  const expectedSamples = Math.round(profileS / SAMPLE_PERIOD_S);
  const isLong = (resolutions.data?.longWindows ?? ['4h', '12h', '24h']).includes(profile);

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
        <div className="cpm-toolbar">
          <LoopSelect loops={loops} value={loopId ?? ''}
            onChange={id => setParams(p => { p.set('loop', id); p.delete('window'); return p; })} />
          <label className="cpm-field">
            <span className="cpm-field__label">Window profile</span>
            <select className="cpm-select" value={profile}
              onChange={e => setParams(p => { p.set('profile', e.target.value); p.delete('window'); return p; })}>
              <optgroup label="Short features (G0–G4)">
                {(resolutions.data?.shortWindows ?? ['1m', '5m', '10m', '15m', '30m', '60m']).map(w =>
                  <option key={w} value={w}>{w} tumbling</option>)}
              </optgroup>
              <optgroup label="Long diagnostics (G5–G11)">
                {(resolutions.data?.longWindows ?? ['4h', '12h', '24h']).map(w =>
                  <option key={w} value={w}>{w} slice</option>)}
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
        {!kpis.isLoading && rows.length === 0 && (
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
              onClick={() => setParams(p => { if (r.window_end) p.set('window', r.window_end); return p; })}
              onKeyDown={e => { if (e.key === 'Enter' && r.window_end) setParams(p => { p.set('window', r.window_end!); return p; }); }}>
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
              <span className="cpm-event-row__sub">
                emitted {new Date(r.created_at).toLocaleTimeString()}
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
              <KvRow label="Size / slide">{profile} / {profile} (tumbling — no overlap)</KvRow>
              <KvRow label="Expected samples">{expectedSamples.toLocaleString()} (5 s grid)</KvRow>
              <KvRow label="Actual samples">
                {fmtBytesless(typeof selected.sample_count === 'number' ? selected.sample_count : null)}
              </KvRow>
              <KvRow label="Completeness">
                {(() => { const c = completenessOf(selected, profileS); return c != null ? `${(c * 100).toFixed(1)}%` : '—'; })()}
              </KvRow>
              <KvRow label="Allowed lateness">
                {isLong ? '15 min event-time timers (long tier cadence)' : 'watermark-bounded (short tier)'}
              </KvRow>
              <KvRow label="Late events">— (DG-4: not recorded by the jobs)</KvRow>
              <KvRow label="Out-of-order events">— (DG-4: not recorded by the jobs)</KvRow>
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
                    className={`cpm-density__bucket${b.count === 0 ? ' cpm-density__bucket--empty' : b.ratio < 0.6 ? ' cpm-density__bucket--sparse' : ''}`}
                    style={{ height: `${Math.max(4, Math.min(100, b.ratio * 100))}%` }}
                    title={`${b.count} sample(s) · ${(b.ratio * 100).toFixed(0)}% of the 5 s-grid expectation`} />
                ))}
              </div>
              <p className="cpm-copy">
                {BUCKETS} buckets · full-height = 100% of the 5 s-grid budget · amber = sparse ·
                grey = empty.{rawCapped ? ' Density reflects the first raw page only; long windows exceed one page.' : ''}
                {' '}Bad-quality exclusion counts live in the G0 result, not the historian, and are not double-counted here.
              </p>
            </>
          )}

          <PanelHead eyebrow="Window contract" title="What happens at each boundary" />
          <div className="cpm-window-rows">
            <div className="cpm-window-row">
              <strong>On open</strong>
              <span className="cpm-event-row__sub">all prior samples dropped (tumbling)</span>
              <span className="cpm-event-row__sub">→ empty accumulator</span>
            </div>
            <div className="cpm-window-row">
              <strong>While open</strong>
              <span className="cpm-event-row__sub">samples on the 5 s grid accumulate</span>
              <span className="cpm-event-row__sub">→ up to {expectedSamples.toLocaleString()} added</span>
            </div>
            <div className="cpm-window-row">
              <strong>On close</strong>
              <span className="cpm-event-row__sub">{isLong ? 'event-time timer fires (≤15 min after watermark passes end)' : 'watermark passes window end'}</span>
              <span className="cpm-event-row__sub">→ one result emitted, nothing retained</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CpmWindows;
