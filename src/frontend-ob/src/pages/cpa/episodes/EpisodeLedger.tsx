/**
 * The episode ledger (SPEC §5.3). Paged, sorted and counted by the server. Only the two orders the
 * server pages by can sort: sorting one fetched page by anything else would mislead. Triage ranks by
 * peak evidence, so it sits on Peak (D-37). Rows hold no links: Enter on a row selects it.
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { cpaHref } from '../../../components/Cpm/cpaHref';
import { evidenceScore } from '../../../components/Cpm/evidenceScore';
import { siteDateTime } from '../../../cpa/siteTime';
import { useCpaContext } from '../../../cpa/useCpaContext';
import { DataState } from '../../../ui/DataState';
import { DataTable, type Column, type SortState } from '../../../ui/DataTable';
import { Pagination } from '../../../ui/forms/Pagination';
import { Toggletip } from '../../../ui/Toggletip';
import { Badge, BadgeOrDash, Dash } from './EpisodeBits';
import {
  acknowledgementView, availabilityView, durationText, episodeTitle, peakView, severityView, shelfView, verdictView,
} from './episodeView';
import { PAGE_SIZE, useEpisodeList } from './useEpisodeList';

const Head: React.FC<{ label: string; metric: string }> = ({ label, metric }) => (
  <span className="episodes__head">{label}<Toggletip metric={metric} label={label} /></span>
);

const Peak: React.FC<{ event: CpmEventFrame }> = ({ event }) => {
  const score = evidenceScore(event.peak_confidence);
  return (
    <span className="episodes__peak">
      <Badge view={peakView(event)} />
      <span>{score ?? <Dash label="No evidence score" />}</span>
    </span>
  );
};

const columns = (now: number, zoneId: string): Array<Column<CpmEventFrame>> => [
  {
    key: 'episode',
    header: 'Episode',
    sticky: true,
    cell: e => (
      <span className="episodes__episode">
        <span>{episodeTitle(e)}</span>
        <span className="ui-meta">EVT-{e.id} · {e.window_kind}</span>
      </span>
    ),
  },
  { key: 'loop', header: 'Loop', mono: true, cell: e => e.loop_id },
  { key: 'severity', header: <Head label="Severity now" metric="M-028" />, cell: e => <BadgeOrDash view={severityView(e)} /> },
  { key: 'peak', header: 'Peak', sortable: true, cell: e => <Peak event={e} /> },
  { key: 'verdict', header: <Head label="Current verdict" metric="M-121" />, cell: e => <BadgeOrDash view={verdictView(e)} /> },
  { key: 'acknowledgement', header: <Head label="Acknowledgement" metric="M-125" />, cell: e => <Badge view={acknowledgementView(e)} /> },
  { key: 'availability', header: <Head label="Availability" metric="M-124" />, cell: e => <Badge view={availabilityView(e)} /> },
  { key: 'opened', header: 'Opened', sortable: true, cell: e => siteDateTime(e.opened_at, zoneId) },
  { key: 'duration', header: 'Duration', cell: e => durationText(e, now) },
  {
    key: 'shelf',
    header: <Head label="Shelf" metric="M-125" />,
    cell: e => {
      const shelf = shelfView(e, now);
      if (!shelf) return <Dash label="Not shelved" />;
      return <span className="episodes__peak"><Badge view={shelf} /><span className="ui-meta">{shelf.detail}</span></span>;
    },
  },
];

const countLine = (total: number, loop: string, q: string, sort: 'triage' | 'recent') => [
  `${total} ${total === 1 ? 'episode' : 'episodes'}${loop ? ` for ${loop}` : ''}${q ? ` matching “${q}”` : ''}`,
  sort === 'recent' ? 'newest first' : 'open first, highest evidence score first',
].join(' · ');

const emptyReason = (narrowed: boolean, scoped: boolean) => {
  if (narrowed) return 'No episode matches this view. Find covers loop tag, loop name, family and diagnosis.';
  return scoped ? 'Choose a wider plant scope in the header.' : 'An episode appears when a fault family is reported on a loop.';
};

export const EpisodeLedger: React.FC<{
  state: ReturnType<typeof useEpisodeList>;
  onSelect: (id: number) => void;
}> = ({ state, onSelect }) => {
  const { zone, scope } = useCpaContext();
  const { search } = useLocation();
  const { list, data, events, sort, loop, q, page, setPage, narrowed, selection } = state;
  const now = Date.now();
  const total = data?.total ?? 0;
  const failedRefresh = list.isError && !!data;
  const selectedKey = selection.state === 'ready' ? String(selection.event.id) : null;
  const sortState: SortState = { key: sort === 'recent' ? 'opened' : 'peak', dir: 'desc' };

  const table = (
    <DataTable
      caption="Episode ledger"
      columns={columns(now, zone.id)}
      rows={events}
      rowKey={e => String(e.id)}
      selectedKey={selectedKey}
      onSelect={e => onSelect(e.id)}
      sort={sortState}
      onSort={key => state.setSort(key === 'opened' ? 'recent' : 'triage')}
      loading={list.isLoading}
      error={list.isError && !data ? list.error : undefined}
      onRetry={() => void list.refetch()}
      filtered={narrowed}
      onResetFilters={state.resetFilters}
      emptyTitle={scope.active ? 'No episodes in this plant scope' : 'No episodes recorded'}
      emptyReason={emptyReason(narrowed, scope.active)}
      emptyAction={scope.active ? undefined : (
        <Link className="ui-link" to={cpaHref('/cpm/performance', search)}>Current results in Performance</Link>
      )}
      toolbar={data ? (
        <p className="ui-meta" aria-busy={list.isPlaceholderData}>{countLine(total, loop, q, sort)}</p>
      ) : undefined}
      footer={data && data.pageCount > 1 ? (
        <div className="episodes__pager">
          <span className="ui-meta">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <Pagination page={page} pageCount={data.pageCount} onChange={setPage} label="Episode pages" />
        </div>
      ) : undefined}
    />
  );

  return (
    <section className="episodes__panel episodes__ledger" aria-label="Episode ledger">
      {failedRefresh ? (
        <DataState
          kind="stale"
          title="Could not refresh"
          reason={`Showing the list from ${siteDateTime(list.dataUpdatedAt, zone.id)}.`}
          onRetry={() => void list.refetch()}
        >
          {table}
        </DataState>
      ) : table}
    </section>
  );
};
