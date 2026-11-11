/**
 * CHG-165 (owner review): the event control in the band, as the window control on the other loop pages: one drop-down of the
 * loaded events, newest first (censored ones only when the Events tab shows them), and ‹ › to step newer / older; past the
 * oldest loaded, › loads older events. Nothing is chosen for the reader: without a choice the control says so.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { ResponseEventSummary } from '../../../api/cpm/response';
import { eventPick } from './responseLabels';

export const EventSelect: React.FC<{
  events: ResponseEventSummary[];
  selectedId: string | undefined;
  timeZone: string;
  hasMore: boolean;
  loading: boolean;
  onSelect: (e: ResponseEventSummary) => void;
  onMore: () => void;
}> = ({ events, selectedId, timeZone, hasMore, loading, onSelect, onMore }) => {
  const index = events.findIndex(e => e.eventId === selectedId);
  const newer = index > 0 ? events[index - 1] : undefined;
  const older = index >= 0 ? events[index + 1] : undefined;
  return (
    <>
      <select className="cpm-select cpm-response-event-select" aria-label="Response event" value={selectedId ?? ''}
        onChange={ev => { const e = events.find(x => x.eventId === ev.target.value); if (e) onSelect(e); }}>
        {!selectedId && <option value="" disabled>{loading ? 'Loading events…' : 'Choose an event'}</option>}
        {selectedId && index < 0 && <option value={selectedId}>Selected event (not in the list)</option>}
        {events.map(e => <option key={e.eventId} value={e.eventId}>{eventPick(e, timeZone)}</option>)}
      </select>
      {/* the reason a stepper is disabled rides on a wrapping span: ObcButton takes no title */}
      <span className="cpm-step-pair">
        <span title={index < 0 ? 'Choose an event first' : newer ? 'Newer event' : 'Already the newest event'}>
          <ObcButton variant="flat" disabled={!newer} onClick={() => { if (newer) onSelect(newer); }}>‹</ObcButton>
        </span>
        <span title={index < 0 ? 'Choose an event first' : older ? 'Older event' : hasMore ? 'Load older events' : 'Already the oldest event'}>
          <ObcButton variant="flat" disabled={index < 0 || (!older && !hasMore) || loading}
            onClick={() => { if (older) onSelect(older); else if (hasMore) onMore(); }}>›</ObcButton>
        </span>
      </span>
    </>
  );
};

export default EventSelect;
