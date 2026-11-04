/**
 * Episodes (SPEC §5.3), at `/cpm/events`. A server-paged ledger of diagnosis episodes with a persistent
 * inspector that reviews, acknowledges and shelves them. Filter, order, loop and the selected episode
 * are in the URL, so a view is shareable.
 *
 * RD3 wants the header range to filter this list. `GET /events/page` takes no time range, so the list
 * covers all retained episodes and the identity line says so. Filtering one fetched page here would
 * make the rows disagree with the server's counts.
 */
import React, { useState } from 'react';
import type { Receipt } from '../../../components/Cpm/ActionReceipt';
import type { CpmScope } from '../../../components/Cpm/plantScope';
import { locationLabel } from '../../../components/Cpm/vocabulary';
import { siteDateTime } from '../../../cpa/siteTime';
import { RANGE_OPTIONS, useCpaContext, type CpaRange } from '../../../cpa/useCpaContext';
import { useAuthStore } from '../../../store/authStore';
import { ContextHeader } from '../../../ui/ContextHeader';
import { WithInspector } from '../../../ui/Inspector';
import { EpisodeFilters } from './EpisodeFilters';
import { EpisodeInspector } from './EpisodeInspector';
import { EpisodeLedger } from './EpisodeLedger';
import { EpisodesSummary } from './EpisodesSummary';
import { FastConditions } from './FastConditions';
import { useEpisodeList } from './useEpisodeList';
import './episodes.css';

const scopeText = (s: CpmScope) => [
  s.site && locationLabel(s.site, { site: true }), s.area && locationLabel(s.area), s.unit && locationLabel(s.unit),
].filter(Boolean).join(' › ') || 'All plant areas';

const rangeText = (r: CpaRange, tz: string) => (r.key === 'custom' && r.from && r.to
  ? `${siteDateTime(r.from, tz)} to ${siteDateTime(r.to, tz)}`
  : RANGE_OPTIONS.find(o => o.key === r.key)?.label ?? r.key);

const reasonOf = (error: unknown) =>
  (error instanceof Error && error.message.trim() ? error.message : 'The service did not respond.');

const EpisodesPage: React.FC = () => {
  const { scope, range, zone } = useCpaContext();
  const canManage = useAuthStore(s => s.hasPermission('cpm.manage'));
  const list = useEpisodeList();
  const data = list.data;
  // Held here so it outlives the inspector when a write moves the episode off this filter.
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(() => list.selection.state !== 'none');

  const select = (id: number) => {
    list.select(id);
    setDrawerOpen(true);
  };

  return (
    <div className="episodes">
      <ContextHeader
        title="Episodes"
        identity={`${scopeText(scope)} · All retained episodes. The ${rangeText(range, zone.id)} range does not filter this list.`}
      />
      <EpisodesSummary
        counts={data?.counts}
        loading={list.list.isLoading}
        failure={list.list.isError && !data ? reasonOf(list.list.error) : null}
      />
      <EpisodeFilters
        filter={list.filter}
        onFilter={list.setFilter}
        counts={data?.counts}
        sort={list.sort}
        onSort={list.setSort}
        search={list.search}
        onSearch={list.setSearch}
        loop={list.loop}
        onClearLoop={list.clearLoop}
      />
      <WithInspector>
        <EpisodeLedger state={list} onSelect={select} />
        <EpisodeInspector
          selection={list.selection}
          canManage={canManage}
          policy={data?.shelvePolicy}
          receipt={receipt}
          onReceipt={setReceipt}
          onClearSelection={list.clearSelection}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      </WithInspector>
      <FastConditions />
    </div>
  );
};

export default EpisodesPage;
