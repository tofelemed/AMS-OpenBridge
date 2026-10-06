/**
 * v2.5 Task 2E.5 (spec §2.2): every response event of the loop, newest first, cursor-paged (older on
 * request). Selecting one is an explicit navigation; the list never picks "latest" for the reader.
 * 2026-09-17 audit F19/F20: one row is time · type · path · ONE state · a one-line finding; the
 * censored candidates (superseded / source gap - most of the table) stay out until asked for, and
 * the list always says how many there are.
 * 2026-09-20 (cpa-ui-fix-plan Phase 7): the timestamp stays on one line and the censored toggle is
 * a full-width button, so the narrow column no longer wraps them into three lines each.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { PanelHead, TonePill } from '../shared';
import type { ResponseEventSummary } from '../../../api/cpm/response';
import { formatInZone } from '../evidence/timezone';
import { eventRowView } from './responseCopy';
import { codeLabel } from '../vocabulary';

export interface EventListProps {
  events: ResponseEventSummary[];
  selectedId: string | undefined;
  timeZone: string;
  loading: boolean;
  hasMore: boolean;
  censoredCount: number;
  showCensored: boolean;
  onToggleCensored: (show: boolean) => void;
  onMore: () => void;
  onSelect: (e: ResponseEventSummary) => void;
}

export const EventList: React.FC<EventListProps> = ({ events, selectedId, timeZone, loading, hasMore, censoredCount, showCensored, onToggleCensored, onMore, onSelect }) => (
  <aside className="cpm-surface cpm-response-events" aria-busy={loading || undefined}>
    <PanelHead eyebrow="Events" title={`Response events (${events.length}${hasMore ? '+' : ''})`} />
    {censoredCount > 0 && (
      <ObcButton variant="flat" fullWidth className="cpm-response-events__censored"
        title={showCensored ? 'Hide the censored candidates' : 'Censored candidates were superseded by a later change or hit a source gap'}
        onClick={() => onToggleCensored(!showCensored)}>
        {showCensored ? 'Hide' : 'Show'} {censoredCount} censored candidate{censoredCount === 1 ? '' : 's'}
      </ObcButton>
    )}
    {events.length === 0 && (
      <p className="cpm-copy">
        {loading ? 'Loading events…'
          : censoredCount > 0 && !showCensored ? `No complete response event yet - the ${censoredCount} captured candidate${censoredCount === 1 ? ' was' : 's were'} censored (superseded by a later change, or a source gap). Show them to read each reason.`
          : 'No response event recorded for this loop. Events appear when a qualifying SP or input change is captured; rejected and censored ones are listed too.'}
      </p>
    )}
    <ul className="cpm-response-events__list">
      {events.map(e => {
        const v = eventRowView(e);
        const selected = e.eventId === selectedId;
        return (
          <li key={e.eventId}>
            <button type="button" className={`cpm-response-event${selected ? ' cpm-response-event--selected' : ''}${v.censored ? ' cpm-response-event--censored' : ''}`}
              aria-current={selected ? 'true' : undefined} onClick={() => onSelect(e)}>
              <span className="cpm-response-event__head">
                <span className="cpm-mono cpm-response-event__time">{formatInZone(e.t0Ms, timeZone)}</span>
                <TonePill tone={v.tone}>{codeLabel(v.state)}</TonePill>
              </span>
              <span className="cpm-response-event__what">{e.eventType} · {e.pathId}</span>
              <span className="cpm-event-row__sub">{v.finding}</span>
            </button>
          </li>
        );
      })}
    </ul>
    {hasMore && <ObcButton variant="flat" fullWidth disabled={loading} onClick={onMore}>{loading ? 'Loading…' : 'Older events'}</ObcButton>}
  </aside>
);
