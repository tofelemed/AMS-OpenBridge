'use client';

/**
 * CPLM Phase 7 — U2 Explorer. Shell only: the page's URL contract, the loop
 * band, the loop list and the workspace routing. The list, the workspace and
 * each tab own their own files under ./explorer.
 *
 * The plant scope is set in the application header, not on this page. It writes
 * `?site=&area=&unit=` and travels with you to every other CPM screen; this page
 * only reads it.
 *
 * One way to pick a loop at a time: with no loop in the URL the page opens on
 * the list. Once the URL names a loop — a pick from the list, a deep link,
 * Back/Forward — the list is not drawn, so the workspace gets the width, and
 * the loop band's control opens the same list. Clearing the loop brings it back.
 */
import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyState, QueryError, WorkspaceHeader } from './shared';
import { LoopBand } from './context/LoopBand';
import { loopTabOf } from './explorer/loopTabOf';
import { useCpmScope } from './plantScope';
import LoopSummaryRow from './explorer/summary/LoopSummaryRow';
import LoopTree from './explorer/LoopTree';
import LoopWorkspace, { TABS } from './explorer/LoopWorkspace';
import type { ExplorerTab } from './explorer/readinessCauses';
import { useCpmLoops } from '../../hooks/useCpm';
import WindowKindToggle from './explorer/summary/WindowKindToggle';
import { WINDOW_KINDS, windowKindOf } from './useWindowKind';

export const CpmExplorer: React.FC<{
  /** Inside the Loop destination `tab` belongs to the host, so this page uses `sub`. */
  /** Set when the Loop page's tab row chooses the tab. This page's own tab row is then not drawn (UI-062). */
  hostTab?: ExplorerTab;
}> = ({ hostTab }) => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  // Validate rather than cast: `?tab=Foo` used to satisfy the cast, match none
  // of the render branches, and leave an empty workspace with no explanation —
  // which is what a stale bookmark from a renamed tab produces.
  const rawTab = params.get('tab');
  const tab: ExplorerTab = hostTab ?? (TABS.includes(rawTab as ExplorerTab) ? (rawTab as ExplorerTab) : 'Summary');

  // The fused window kind every tab evaluates; same name and default as Performance (`?window=`), so a hand-off between
  // the two keeps the window. CHG-089: 12h by default, chosen at the top of the page; a gate picked on the other window
  // does not carry over.
  const windowKind = windowKindOf(params.get('window'));
  const setWindowKind = (k: string) =>
    setParams(p => { p.set('window', k); p.delete('gate'); return p; }, { replace: true });

  const scope = useCpmScope();

  const { data, isLoading, isError, error, refetch } = useCpmLoops();
  const loops = useMemo(() => data?.loops ?? [], [data]);
  const inScope = useMemo(() => loops.filter(l => scope.matches(l)), [loops, scope]);

  // Case-insensitive, like every loop lookup in cplm-api (`lower(loop_id) =
  // lower($1)`) — a deep link whose case differs from the registry's should
  // resolve, not fall through to "not found".
  const requestedId = params.get('loop');
  // No default: `inScope[0]` is registry order, i.e. an arbitrary loop shown as
  // though it were chosen. The list is right there to choose from.
  const loop = requestedId
    ? loops.find(l => l.loopId.toLowerCase() === requestedId.toLowerCase())
    : undefined;
  // A ?loop= that names nothing must SAY so. Falling back to the first loop
  // showed a different loop's data under a URL naming the missing one.
  const missingLoop = !!requestedId && !loop && !isLoading && !isError && loops.length > 0;

  const selectLoop = (loopId: string) =>
    // replace: selecting a loop is in-page selection in a master-detail view,
    // not a page visit — browsing eight loops left eight history entries
    // between the operator and Back, while the URL stays just as shareable.
    // A gate selected on the previous loop's Summary does not carry over.
    setParams(p => { p.set('loop', loopId); p.delete('gate'); return p; }, { replace: true });

  const openRegistry = () => navigate('/cpm/registry');

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        page="/cpm/explorer"
        title="Loop explorer"
        actions={<WindowKindToggle value={windowKind} kinds={WINDOW_KINDS} onChange={setWindowKind} />}
      />
      {/* CHG-128: the one loop control. With no loop named the page opens on the list instead, so it is not offered twice. */}
      {requestedId && (
        <LoopBand loopId={loop?.loopId ?? requestedId} onLoop={selectLoop}
          onClear={() => setParams(p => { p.delete('loop'); p.delete('gate'); return p; }, { replace: true })}>
          {loop && hostTab === 'Summary' && (
            <LoopSummaryRow loop={loop} windowKind={windowKind}
              onTab={t => setParams(p => { p.set('tab', loopTabOf(t)); return p; }, { replace: true })} />
          )}
        </LoopBand>
      )}

      <div className={`cpm-explorer-layout${requestedId ? ' cpm-explorer-layout--rail-closed' : ''}`}>
        {!requestedId && (
          <aside aria-label="Loops" className="cpm-surface cpm-rail">
            <div className="cpm-rail__head"><span className="cpm-eyebrow">Loops</span></div>
            <LoopTree
              loops={inScope}
              selectedLoopId={undefined}
              onSelect={selectLoop}
              isLoading={isLoading}
              isError={isError}
              error={error}
              retry={() => void refetch()}
              onOpenRegistry={openRegistry}
              totalLoops={loops.length}
            />
          </aside>
        )}

        {loop ? (
          <LoopWorkspace
            loop={loop}
            tab={tab}
            windowKind={windowKind}
            hosted={!!hostTab}
            onTab={t => setParams(p => { p.set('tab', hostTab ? loopTabOf(t) : t); return p; }, { replace: true })}
          />
        ) : requestedId && isError ? (
          <section className="cpm-surface"><QueryError title="Loop registry unavailable" error={error} retry={() => void refetch()} /></section>
        ) : requestedId && isLoading ? (
          <section className="cpm-surface"><EmptyState level={2} title="Loading…" /></section>
        ) : missingLoop ? (
          <section className="cpm-surface">
            <EmptyState
              level={2}
              title={`Loop "${requestedId}" is not in the registry`}
              copy="This link points at a loop that has been renamed, removed, or never onboarded. Pick a loop from the list, or check the Loop Registry."
              action={{ label: 'Open Loop Registry', onClick: openRegistry }}
            />
          </section>
        ) : (
          <section className="cpm-surface">
            <EmptyState
              level={2}
              title={scope.active ? 'No loops in this scope' : 'Select a loop'}
              // CHG-098 (SME review 2 #29): say where to pick a loop.
              copy={scope.active
                ? 'Widen the plant scope in the header to see loops.'
                : 'Pick a loop in the list to open its summary, signals, calculations and history.'}
            />
          </section>
        )}
      </div>
    </div>
  );
};

export default CpmExplorer;
