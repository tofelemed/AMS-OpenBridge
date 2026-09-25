'use client';

/**
 * CPLM Phase 7 — U7 Window inspector (/cpm/windows?loop=&profile=&window=).
 * CPA-prototype IA parity: profile toolbar with a live runtime chip and the
 * emitted-window list. Selecting a window opens its own sub-page (CHG-025:
 * windows/WindowDetail.tsx — results, metadata grid with boundary semantics and
 * expected-vs-actual samples, the sample-density bar from real raw historian
 * counts, the window contract strip and the across-window-sizes comparison).
 * The list is hidden while a window is open; Back returns to it and Newer/Older
 * walk the loaded windows. Late/out-of-order counts are DG-4 — the jobs do not
 * record them today, so they render as "—".
 */
import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, PanelHead, TonePill, WorkspaceHeader,
  fmtDateTime, fmtWindowShape, windowSpecsOf, QueryError } from './shared';
import { PlantScopeFilter, useCpmScope } from './plantScope';
import LoopCombobox from './LoopCombobox';
import {
  useCpmKpisPaged, useCpmLoops, useCpmResolutions, usePipelineMetrics,
} from '../../hooks/useCpm';
import { GateStrip, isDeclined } from './windows/WindowResults';
import WindowDetail from './windows/WindowDetail';
import { resolveWindowView } from './windows/windowNav';
import { PROFILE_SECONDS, completenessOf, fmtBytesless } from './windows/windowMath';

export const CpmWindows: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const loopsQuery = useCpmLoops();
  const loops = useMemo(() => loopsQuery.data?.loops ?? [], [loopsQuery.data]);
  // Plant scope (CPM-UX A1): narrows the loop picker to a section/unit.
  const scope = useCpmScope();
  // No default selection: registry order is arbitrary, so `loops[0]` is a
  // CHOICE presented as a default — the same lie the ?loop=-names-nothing
  // fallback was fixed for, minus the URL. It also fired this page's whole
  // query set for a loop nobody asked for.
  const loopId = params.get('loop') ?? undefined;
  const profile = params.get('profile') ?? '15m';

  const resolutions = useCpmResolutions();
  const metrics = usePipelineMetrics();
  // Keyset-paged (audit.md B-7): the old fixed limit of 12 made 12 minutes of
  // 1m history the most this page could ever show. Load-older walks the cursor.
  const kpis = useCpmKpisPaged(loopId, profile, 24);

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

  const rows = useMemo(() => kpis.data?.pages.flatMap(p => p.samples) ?? [], [kpis.data]);
  // CHG-025: the ?window= parameter opens that window's sub-page; a value that names
  // no LOADED row falls back to the list rather than opening a different window.
  const view = resolveWindowView(rows, params.get('window'));
  const selectWindow = (windowEnd: string) =>
    setParams(p => { p.set('window', windowEnd); return p; }, { replace: true });
  const backToList = () => setParams(p => { p.delete('window'); return p; }, { replace: true });

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
          <LoopCombobox scope={scope} loops={loops} value={loopId ?? ''}
            onChange={id => setParams(p => { p.set('loop', id); p.delete('window'); return p; }, { replace: true })}
            onClear={() => setParams(p => { p.delete('loop'); p.delete('window'); return p; }, { replace: true })} />
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
        </div>
        <p className="cpm-hist-note" style={{ marginTop: 6 }}>
          Watermark lag: — (not exposed by the metrics proxy; job state and checkpoint
          age in the header are live)
        </p>

        {!loopId && (
          <EmptyState title="Select a loop"
            copy="Pick a control loop above to inspect the windows the engine emitted for it." />
        )}
        {loopId && view.view === 'list' && (<>
        <PanelHead eyebrow="Emitted windows" title={`Latest ${profile} results for ${loopId}`}
          right={<span className="cpm-copy">{rows.length} loaded · newest first · select a window to open it</span>} />
        {kpis.isLoading && <EmptyState title="Loading windows…" />}
        {kpis.isError && <QueryError title="Window data unavailable" error={kpis.error} retry={() => void kpis.refetch()} />}
        {!kpis.isLoading && !kpis.isError && rows.length === 0 && (
          <EmptyState title={`No ${profile} windows stored for this loop`}
            copy="Rows appear as the corresponding Flink tier emits results for this resolution." />
        )}
        {rows.map(r => {
          const comp = completenessOf(r, profileS);
          const declined = isDeclined(r, isLong ? 'long' : 'short');
          return (
            <div key={r.window_end ?? r.created_at}
              className="cpm-event-row"
              style={{ gridTemplateColumns: isLong ? '1.6fr 1fr 1fr 0.8fr' : '1.6fr 0.8fr 0.9fr 1fr 0.9fr' }}
              role="button" tabIndex={0}
              onClick={() => { if (r.window_end) selectWindow(r.window_end); }}
              onKeyDown={e => {
                if ((e.key === 'Enter' || e.key === ' ') && r.window_end) {
                  e.preventDefault();
                  selectWindow(r.window_end);
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
              {/* Per-window gate verdicts (audit.md B-1): served since Phase A;
                  fusion never fires on short windows so this is the only place
                  G0–G4/G2r can be seen at these granularities. */}
              {!isLong && <GateStrip row={r} />}
              {/* P2-13: every CPM timestamp names its zone — this was the one
                  bare toLocaleTimeString left on the page. */}
              <span className="cpm-event-row__sub">
                emitted {fmtDateTime(r.created_at)}
              </span>
              {declined
                ? <TonePill tone="bad">DECLINED</TonePill>
                : (
                  <TonePill tone={comp == null ? 'muted' : comp >= 0.9 ? 'good' : comp >= 0.5 ? 'warn' : 'bad'}>
                    {comp != null ? `${(comp * 100).toFixed(0)}% full` : 'UNKNOWN'}
                  </TonePill>
                )}
            </div>
          );
        })}
        {rows.length > 0 && kpis.hasNextPage && (
          <div className="cpm-filter-row" style={{ marginTop: 8 }}>
            <ObcButton variant="normal" disabled={kpis.isFetchingNextPage}
              onClick={() => void kpis.fetchNextPage()}>
              {kpis.isFetchingNextPage ? 'Loading…' : 'Load older windows'}
            </ObcButton>
          </div>
        )}
        </>)}
      </section>

      {loopId && view.view === 'detail' && (
        <WindowDetail
          loopId={loopId}
          loop={loops.find(l => l.loopId === loopId)}
          profile={profile}
          spec={spec}
          isLong={isLong}
          profileS={profileS}
          selected={view.selected}
          index={view.index}
          loaded={rows.length}
          newer={view.newer}
          older={view.older}
          shortSpecs={shortSpecs}
          onBack={backToList}
          onSelect={selectWindow}
          onPickKind={k => setParams(p => { p.set('profile', k); p.delete('window'); return p; }, { replace: true })}
        />
      )}
    </div>
  );
};

export default CpmWindows;
