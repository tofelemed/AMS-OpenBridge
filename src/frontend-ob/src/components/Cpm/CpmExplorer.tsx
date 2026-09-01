'use client';

/**
 * CPLM Phase 7 — U2 Explorer. Shell only: the page's URL contract, the
 * full-width plant scope, the loop rail and the workspace routing. The rail,
 * the workspace and each tab own their own files under ./explorer.
 *
 * Layout change: the plant-scope filter is no longer inside the rail. It writes
 * `?site=&area=&unit=` and travels with you to every other CPM screen, so it is
 * PAGE scope; nesting it in the rail claimed it filtered the list, and it cost
 * the only scrollable column ~300px — four loops above the fold. It now sits
 * full-width under the header, exactly as it does on Performance.
 *
 * The rail also collapses: once a loop is selected the picker is not what you
 * are looking at, and both the trend chart and the episode list want the width.
 */
import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObiChevronLeftGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-left-google';
import { ObiChevronRightGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-right-google';
import { CpmIconButton, EmptyState, WorkspaceHeader } from './shared';
import { PlantScopeFilter, useCpmScope } from './plantScope';
import LoopTree from './explorer/LoopTree';
import LoopWorkspace, { TABS } from './explorer/LoopWorkspace';
import type { ExplorerTab } from './explorer/readinessCauses';
import { useCpmLoops } from '../../hooks/useCpm';

export const CpmExplorer: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  // Validate rather than cast: `?tab=Foo` used to satisfy the cast, match none
  // of the render branches, and leave an empty workspace with no explanation —
  // which is what a stale bookmark from a renamed tab produces.
  const rawTab = params.get('tab');
  const tab: ExplorerTab = TABS.includes(rawTab as ExplorerTab)
    ? (rawTab as ExplorerTab) : 'Summary';

  const [railOpen, setRailOpen] = React.useState(true);
  const scope = useCpmScope();

  const { data, isLoading, isError, error, refetch } = useCpmLoops();
  const loops = useMemo(() => data?.loops ?? [], [data]);
  const inScope = useMemo(() => loops.filter(l => scope.matches(l)), [loops, scope]);

  // Case-insensitive, like every loop lookup in cplm-api (`lower(loop_id) =
  // lower($1)`) — a deep link whose case differs from the registry's should
  // resolve, not fall through to "not found".
  const requestedId = params.get('loop');
  // No default: `inScope[0]` is registry order, i.e. an arbitrary loop shown as
  // though it were chosen. The rail is right there to choose from.
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
    setParams(p => { p.set('loop', loopId); return p; }, { replace: true });

  const openRegistry = () => navigate('/cpm/registry');

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Asset-centric operational context"
        title="Explorer"
      />
      <PlantScopeFilter
        scope={scope}
        summary={loops.length ? `${inScope.length} of ${loops.length} loop(s) in scope` : null}
      />

      <div className={`cpm-explorer-layout${railOpen ? '' : ' cpm-explorer-layout--rail-closed'}`}>
        <aside className={`cpm-surface cpm-rail${railOpen ? '' : ' cpm-rail--collapsed'}`}>
          <div className="cpm-rail__head">
            {railOpen && <span className="cpm-eyebrow">Loops</span>}
            <CpmIconButton
              label={railOpen ? 'Collapse loop list' : 'Expand loop list'}
              onClick={() => setRailOpen(v => !v)}
            >
              {railOpen ? <ObiChevronLeftGoogle /> : <ObiChevronRightGoogle />}
            </CpmIconButton>
          </div>
          {railOpen && (
            <LoopTree
              loops={inScope}
              selectedLoopId={loop?.loopId}
              onSelect={selectLoop}
              isLoading={isLoading}
              isError={isError}
              error={error}
              retry={() => void refetch()}
              onOpenRegistry={openRegistry}
              totalLoops={loops.length}
            />
          )}
        </aside>

        {loop ? (
          <LoopWorkspace
            loop={loop}
            tab={tab}
            onTab={t => setParams(p => { p.set('tab', t); return p; }, { replace: true })}
          />
        ) : missingLoop ? (
          <section className="cpm-surface">
            <EmptyState
              title={`Loop "${requestedId}" is not in the registry`}
              copy="This link points at a loop that has been renamed, removed, or never onboarded. Pick a loop from the list, or check the Loop Registry."
              action={{ label: 'Open Loop Registry', onClick: openRegistry }}
            />
          </section>
        ) : (
          <section className="cpm-surface">
            <EmptyState
              title={scope.active ? 'No loops in this scope' : 'Select a loop'}
              copy={scope.active
                ? 'Widen the site, area or unit filter to see loops.'
                : undefined}
            />
          </section>
        )}
      </div>
    </div>
  );
};

export default CpmExplorer;
