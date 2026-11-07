/**
 * Task 6: the three latest loop events in the header's plant scope, as plain rows (time, tag, event). A row opens
 * Investigation at the event's opening window; with no opening time it opens the loop's Investigation.
 * useEventPage, not useCpmEvents: only the paged list honours the plant scope.
 */
import React from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, PanelHead, QueryError } from '../shared';
import { diagnosisLabel } from '../vocabulary';
import { fmtWhen } from '../blocks/whenText';
import { eventsHref, investigationHref } from '../cpaHref';
import { useEventPage } from '../events/useEventPage';

export const RecentEvents: React.FC<{
  scope?: { site?: string; area?: string; unit?: string };
  windowKind?: string;
  /** The loop the operator chose (not the top-ranked default): "All events" narrows to it. */
  loop?: string;
}> = ({ scope, windowKind, loop }) => {
  const navigate = useNavigate();
  const events = useEventPage({ state: 'all', sort: 'recent', page: 1, pageSize: 3, ...scope }, 60_000);
  const rows = events.data?.events ?? [];
  return (
    <section className="cpm-surface">
      <PanelHead title="Recent events"
        right={<ObcButton variant="flat" onClick={() => navigate(eventsHref({ loop, filter: 'all' }))}>All events →</ObcButton>} />
      {events.isError && <QueryError title="Recent events unavailable" error={events.error} retry={() => void events.refetch()} />}
      {events.isLoading && <EmptyState title="Loading events…" />}
      {!events.isLoading && !events.isError && rows.length === 0 && (
        <EmptyState title="No recent events" copy="No diagnosis episode has opened or closed on the monitored loops recently." />
      )}
      {rows.map(e => (
        <RouterLink key={e.id} className="cpm-recent-row"
          to={investigationHref(e.loop_id, { kind: e.window_kind ?? windowKind, window: e.opened_at })}>
          <span className="cpm-event-row__sub">{fmtWhen(e.opened_at)}</span>
          <span>{e.loop_id}</span>
          <span>{diagnosisLabel(e.peak_diagnosis)}</span>
        </RouterLink>
      ))}
    </section>
  );
};

export default RecentEvents;
