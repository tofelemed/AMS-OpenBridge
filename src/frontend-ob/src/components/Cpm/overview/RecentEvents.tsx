/**
 * Task 6: the three latest loop events in the header's plant scope, as plain rows (time, tag, event). A row opens
 * Investigation at the event's opening window; with no opening time it opens the loop's Investigation.
 * useEventPage, not useCpmEvents: only the paged list honours the plant scope.
 *
 * CHG-177 (owner review, Overview v2, answer 4): last on the page, full width. Only the page window's episodes, client side
 * (every episode exists as a 12h and a 24h copy, so the 12h page listed PIC40102 twice): the newest twelve are read and the
 * first three of the page's window are listed; an episode with no window kind recorded counts as the page's. "Opened · UTC"
 * is said once, as the column heading, and a time reads "5 Oct 07:45" (Loop Events' words, CHG-167).
 */
import React from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, PanelHead, QueryError } from '../shared';
import { diagnosisLabel } from '../vocabulary';
import { stamp, zoneTag } from '../events/eventTime';
import { eventsHref, investigationHref } from '../cpaHref';
import { useEventPage } from '../events/useEventPage';

/** Read this many of the newest episodes, so three of the page's window are found among them. */
const READ = 12;
const SHOWN = 3;

export const RecentEvents: React.FC<{
  scope?: { site?: string; area?: string; unit?: string };
  windowKind?: string;
  /** The loop the operator chose (not the top-ranked default): "All events" narrows to it. */
  loop?: string;
}> = ({ scope, windowKind, loop }) => {
  const navigate = useNavigate();
  const events = useEventPage({ state: 'all', sort: 'recent', page: 1, pageSize: READ, ...scope }, 60_000);
  const rows = (events.data?.events ?? [])
    .filter(e => !windowKind || e.window_kind == null || e.window_kind === windowKind)
    .slice(0, SHOWN);
  return (
    <section className="cpm-surface cpm-ov-events" aria-label="Recent events">
      <PanelHead title="Recent events"
        right={<ObcButton variant="flat" onClick={() => navigate(eventsHref({ loop, filter: 'all' }))}>All events →</ObcButton>} />
      {events.isError && <QueryError title="Recent events unavailable" error={events.error} retry={() => void events.refetch()} />}
      {events.isLoading && <EmptyState title="Loading events…" />}
      {!events.isLoading && !events.isError && rows.length === 0 && (
        <EmptyState title="No recent events" copy="No diagnosis episode has opened or closed on the monitored loops recently." />
      )}
      {rows.length > 0 && (
        <div className="cpm-event-head cpm-ov-events__grid">
          <span>Opened · {zoneTag()}</span><span>Loop</span><span>Event</span>
        </div>
      )}
      {rows.map(e => (
        <RouterLink key={e.id} className="cpm-recent-row cpm-ov-events__grid"
          to={investigationHref(e.loop_id, { kind: e.window_kind ?? windowKind, window: e.opened_at })}>
          <span className="cpm-event-row__sub">{stamp(e.opened_at)}</span>
          <span>{e.loop_id}</span>
          <span>{diagnosisLabel(e.peak_diagnosis)}</span>
        </RouterLink>
      ))}
    </section>
  );
};

export default RecentEvents;
