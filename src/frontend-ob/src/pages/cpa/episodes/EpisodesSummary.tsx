/**
 * The summary strip, from the server's counts. The paged endpoint counts all retained episodes and
 * takes no time range, so "Closed in range" reads Unavailable and the all-time count is named as such.
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { CpmEventPage } from '../../../api/cpm/eventPage';
import { DataState } from '../../../ui/DataState';
import { MetricSummary, type Metric } from '../../../ui/MetricSummary';
import { Toggletip } from '../../../ui/Toggletip';
import { filterHref } from './episodeView';

const COVERS = 'All retained episodes';
const NO_RANGE = 'This count has no time filter.';

export const EpisodesSummary: React.FC<{
  counts?: CpmEventPage['counts'];
  loading: boolean;
  /** Why the counts are missing, when they are. */
  failure: string | null;
}> = ({ counts, loading, failure }) => {
  const { search } = useLocation();
  if (loading) return <DataState kind="loading" label="Loading episode counts" rows={2} />;

  const show = (filter: string, label: string) => (
    <Link className="ui-link" to={filterHref(search, filter)}>{label}</Link>
  );
  const count = (key: keyof CpmEventPage['counts']) => counts?.[key] ?? null;
  const missing = (value: number | null) => (value == null ? failure ?? undefined : undefined);

  const open = count('open');
  const unacknowledged = count('unacknowledged');
  const shelved = count('shelved');
  const expired = count('shelfExpired');
  const closed = count('closed');

  const metrics: Metric[] = [
    {
      key: 'open', label: 'Open', value: open, window: COVERS, note: missing(open),
      help: <Toggletip metric="M-120" label="Open" />,
      to: show('open', 'Show open'),
    },
    {
      key: 'unacknowledged', label: 'Unacknowledged', value: unacknowledged, window: COVERS, note: missing(unacknowledged),
      help: <Toggletip metric="M-120" label="Unacknowledged" />,
      to: show('unacknowledged', 'Show unacknowledged'),
    },
    {
      key: 'shelved', label: 'Shelved', value: shelved, window: COVERS,
      note: missing(shelved) ?? (expired == null ? 'Shelf expired: Unavailable' : `${expired} shelf expired`),
      help: <Toggletip metric="M-031" label="Shelved" />,
      to: <>{show('shelved', 'Show shelved')} · {show('shelfExpired', 'Show shelf expired')}</>,
    },
    {
      key: 'closed', label: 'Closed in range', value: null, state: 'unavailable',
      note: closed == null ? failure ?? NO_RANGE : `${NO_RANGE} ${closed} closed in all retained episodes.`,
      help: <Toggletip metric="M-120" label="Closed in range" />,
      to: show('closed', 'Show closed'),
    },
  ];

  return <MetricSummary label="Episode summary" metrics={metrics} />;
};
