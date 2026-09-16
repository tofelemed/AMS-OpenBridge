/**
 * v2.5 Task 2E.5 (spec §2.2): every response event of the loop, newest first - COMPLETE, CENSORED
 * and REJECTED alike, each with its reason - cursor-paged (older on request). Selecting one is an
 * explicit navigation; the list never picks "latest" for the reader.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { PanelHead, TonePill } from '../shared';
import type { ResponseEventSummary } from '../../../api/cpm/response';
import { formatInZone } from '../evidence/timezone';
import { stateTone } from './responseSupport';

export const EventList: React.FC<{
  events: ResponseEventSummary[]; selectedId: string | undefined; timeZone: string; loading: boolean; hasMore: boolean; onMore: () => void; onSelect: (e: ResponseEventSummary) => void;
}> = ({ events, selectedId, timeZone, loading, hasMore, onMore, onSelect }) => (
  <aside className="cpm-surface cpm-response-events">
    <PanelHead eyebrow="Events" title={`Response events (${events.length}${hasMore ? '+' : ''})`} />
    {events.length === 0 && <p className="cpm-copy">{loading ? 'Loading events…' : 'No response event recorded for this loop. Events appear when a qualifying SP or input change is captured; rejected and censored ones are listed too.'}</p>}
    <ul className="cpm-response-events__list">
      {events.map(e => (
        <li key={e.eventId}>
          <button type="button" className={`cpm-response-event${e.eventId === selectedId ? ' cpm-response-event--selected' : ''}`} aria-current={e.eventId === selectedId ? 'true' : undefined} onClick={() => onSelect(e)}>
            <span className="cpm-mono">{formatInZone(e.t0Ms, timeZone)}</span>
            <span>{e.eventType} · {e.pathId}</span>
            <span>
              <TonePill tone={stateTone(e.captureState)}>{e.captureState}</TonePill>{' '}
              {e.evaluationState && <TonePill tone={stateTone(e.evaluationState)}>{e.evaluationState}</TonePill>}
            </span>
            {e.censorReason && <span className="cpm-copy">{e.censorReason.replace(/_/g, ' ').toLowerCase()}</span>}
            <span className="cpm-copy">finding {e.finding || '—'} · model {e.modelState || '—'} · eligibility {e.eligibility || '—'}</span>
          </button>
        </li>
      ))}
    </ul>
    {hasMore && <ObcButton variant="flat" disabled={loading} onClick={onMore}>{loading ? 'Loading…' : 'Older events'}</ObcButton>}
  </aside>
);
