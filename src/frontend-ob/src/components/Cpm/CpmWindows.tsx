'use client';

/**
 * Window Inspector (/cpm/windows?loop=&profile=&window=). The windows the engine stored for one loop and profile,
 * newest first, with the selected one beside the list in the right column (Task 19; it was a separate view).
 * The newest loaded window is selected when none is named; a named window that is not loaded selects nothing and says so. A row click reads nothing more: the
 * counts are on the row, and the window opens in Replay or the Workbench from "Inspect this window".
 * Compare across window sizes sits under the list.
 */
import { sameInstant } from './evidence/useWindowAt';
import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, TonePill, WorkspaceHeader, QueryError, windowSpecsOf } from './shared';
import { LoopBand } from './context/LoopBand';
import { pipelineHref } from './cpaHref';
import { useAuthStore } from '../../store/authStore';
import { useCpmKpisPaged, useCpmLoops, useCpmResolutions, usePipelineMetrics } from '../../hooks/useCpm';
import WindowList, { WindowListBar, countFilterOf, type CountFilter } from './windows/WindowList';
import SelectedWindow from './windows/SelectedWindow';
import CompareAcrossKinds from './windows/CompareAcrossKinds';
import { resolveWindowView } from './windows/windowNav';
import { PROFILE_SECONDS } from './windows/windowMath';
import { profileLabel } from './windowLabel';

export const CpmWindows: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canManage = useAuthStore(s => s.hasPermission('system.manage'));
  const loopsQuery = useCpmLoops();
  const loops = useMemo(() => loopsQuery.data?.loops ?? [], [loopsQuery.data]);
  // No default loop: registry order is arbitrary, so `loops[0]` would be a CHOICE presented as a default.
  const loopId = params.get('loop') ?? undefined;
  const profile = params.get('profile') ?? '15m';
  const [filter, setFilter] = useState<CountFilter>('all');
  // Below 1280 px the panel is a drawer: a link that names a window opens it.
  const [drawer, setDrawer] = useState(() => params.has('window'));

  const resolutions = useCpmResolutions();
  const metrics = usePipelineMetrics();
  // Keyset-paged (audit.md B-7): Load older walks the cursor.
  const kpis = useCpmKpisPaged(loopId, profile, 24);

  // The served window contract is the authority on assigner, slide and lateness.
  const specs = useMemo(
    () => windowSpecsOf(resolutions.data, k => (PROFILE_SECONDS[k] ?? 0) * 1000),
    [resolutions.data]);
  const shortSpecs = useMemo(() => specs.filter(w => w.tier === 'short'), [specs]);
  const longSpecs = useMemo(() => specs.filter(w => w.tier === 'long'), [specs]);
  const spec = specs.find(w => w.kind === profile);
  const isLong = spec ? spec.tier === 'long'
    : (resolutions.data?.longWindows ?? ['4h', '12h', '24h']).includes(profile);
  const tier = isLong ? 'long' : 'short';
  const loop = loops.find(l => l.loopId === loopId);
  const timeZone = loop?.timezone || 'UTC';

  const rows = useMemo(() => kpis.data?.pages.flatMap(p => p.samples) ?? [], [kpis.data]);
  const shown = useMemo(
    () => (filter === 'all' ? rows : rows.filter(r => countFilterOf(r, tier) === filter)),
    [rows, filter, tier]);
  const named = params.get('window');
  const view = resolveWindowView(shown, named);
  // A named window that is not selected is either hidden by the filter or not loaded yet: say which, select nothing.
  const missing = named && !view && rows.length > 0 ? (rows.some(r => sameInstant(r.window_end, named)) ? 'filtered' : 'unloaded') : null;
  const passes = (r: typeof rows[number]) => filter === 'all' || countFilterOf(r, tier) === filter;
  const selectWindow = (windowEnd: string) => {
    setParams(p => { p.set('window', windowEnd); return p; }, { replace: true });
    setDrawer(true);
  };
  const setProfile = (kind: string) =>
    setParams(p => { p.set('profile', kind); p.delete('window'); return p; }, { replace: true });

  // Job state and checkpoint age: watermark lag itself is unavailable from the metrics proxy, so the chip reports what is real.
  const cplmJob = metrics.data?.jobs.find(j => j.role === 'cplm' && j.name.toLowerCase().includes(isLong ? 'long' : 'short'));
  const anyCplm = cplmJob ?? metrics.data?.jobs.find(j => j.role === 'cplm');

  const optionsOf = (list: typeof specs) => list.map(w => <option key={w.kind} value={w.kind}>{profileLabel(w)}</option>);
  const goTo = (end: string | null | undefined) => { if (end) selectWindow(end); };
  // Older at the last loaded row loads the next page, then moves to the window after this one.
  const older = async () => {
    if (view?.older) return goTo(view.older.window_end);
    if (!view || !kpis.hasNextPage) return;
    const next = await kpis.fetchNextPage();
    const all = (next.data?.pages.flatMap(p => p.samples) ?? []).filter(passes);
    const at = all.findIndex(r => sameInstant(r.window_end, view.selected.window_end));
    goTo(all[at + 1]?.window_end);
  };
  const clearWindow = () => setParams(p => { p.delete('window'); return p; }, { replace: true });

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        page="/cpm/windows"
        title="Window Inspector"
        actions={<>
          {anyCplm && (
            <TonePill tone={anyCplm.state === 'RUNNING' ? 'good' : 'bad'}>
              {anyCplm.name.replace('AMS - ', '')} {'·'} {anyCplm.state}
              {anyCplm.checkpoint?.lastCompletedAgeSec != null ? ` · ckpt ${anyCplm.checkpoint.lastCompletedAgeSec}s ago` : ''}
            </TonePill>
          )}
          {canManage && <ObcButton variant="flat" onClick={() => navigate(pipelineHref())}>Pipeline Health {'↗'}</ObcButton>}
        </>}
      />
      <LoopBand loopId={loopId}
        onLoop={id => setParams(p => { p.set('loop', id); p.delete('window'); return p; }, { replace: true })}>
        <select className="cpm-select" aria-label="Window profile" value={profile} onChange={e => setProfile(e.target.value)}>
          <optgroup label="Short features (G0–G4)">{optionsOf(shortSpecs)}</optgroup>
          <optgroup label="Long diagnostics (G5–G11)">{optionsOf(longSpecs)}</optgroup>
        </select>
      </LoopBand>

      {!loopId && (
        <section className="cpm-surface">
          <EmptyState level={2} title="Select a loop"
            copy="Pick a control loop above to inspect the windows the engine stored for it." />
        </section>
      )}
      {loopId && (
        <div className="cpm-master-detail">
          <section className="cpm-surface">
            {kpis.isLoading && <EmptyState title="Loading windows…" />}
            {kpis.isError && <QueryError title="Window data unavailable" error={kpis.error} retry={() => void kpis.refetch()} />}
            {!kpis.isLoading && !kpis.isError && rows.length === 0 && (
              <EmptyState title={`No ${profile} windows stored for this loop`}
                copy="Rows appear once the analysis engine has evaluated a window of this size. Choose another profile above."
                next={canManage ? [{ label: 'Pipeline Health', to: pipelineHref() }] : undefined} />
            )}
            {rows.length > 0 && (<>
              <WindowListBar filter={filter} onFilter={setFilter} matching={shown.length} loaded={rows.length}
                hasNewer={!!view?.newer} hasOlder={!!view?.older || (!!view && !!kpis.hasNextPage)}
                onNewer={() => goTo(view?.newer?.window_end)} onOlder={() => void older()} />
              {missing && (
                <EmptyState title={missing === 'filtered' ? 'This window is hidden by the Sample count filter.' : 'This window is not in the loaded list.'}
                  copy={missing === 'filtered' ? undefined : 'Load older windows to reach it.'}
                  action={missing === 'filtered' ? { label: 'Clear filter', onClick: () => setFilter('all') } : { label: 'Show the newest window', onClick: clearWindow }} />
              )}
              {!missing && shown.length === 0 && (
                <EmptyState title="No window matches this filter." action={{ label: 'Clear filter', onClick: () => setFilter('all') }} />
              )}
              <WindowList rows={shown} selectedEnd={view?.selected.window_end ?? null} tier={tier}
                timeZone={timeZone} onSelect={selectWindow} />
              {kpis.hasNextPage && (
                <div className="cpm-filter-row">
                  <ObcButton variant="normal" disabled={kpis.isFetchingNextPage} onClick={() => void kpis.fetchNextPage()}>
                    {kpis.isFetchingNextPage ? 'Loading…' : 'Load older windows'}
                  </ObcButton>
                </div>
              )}
            </>)}
          </section>
          {view && (
            <SelectedWindow row={view.selected} loopId={loopId} loop={loop} kind={profile} spec={spec} isLong={isLong}
              timeZone={timeZone} open={drawer} onClose={() => setDrawer(false)} />
          )}
        </div>
      )}

      {loopId && shortSpecs.length > 0 && (
        <CompareAcrossKinds loopId={loopId} shortSpecs={shortSpecs} activeKind={profile} onPickKind={setProfile} />
      )}
    </div>
  );
};

export default CpmWindows;
