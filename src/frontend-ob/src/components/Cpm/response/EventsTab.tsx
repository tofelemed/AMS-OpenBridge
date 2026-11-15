/**
 * CHG-165 (owner review): the Events tab. The three counts once, then the loop's response events, newest first, as a table:
 * time, type, path, one state, the finding, and the model the event produced (from the loop's models already loaded, so no
 * request per row). Censored candidates stay out until asked for (audit F20); the choice carries their count. Choosing an
 * event is explicit, never "latest", and opens it on the Response tab. CHG-178: the time reads "7 Oct 05:43" in the loop's
 * site zone, as the band's options do; the zone is named once, in the heading ("Time · UTC").
 * CHG-195 (owner review item 19): the counts are KPI cards and the events the standard table (ui/DataTable): same columns,
 * same order, the censored choice; a row (click or Enter) opens its event; a censored row is muted.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { PanelHead, TonePill } from '../shared';
import { DataTable, type Column } from '../../../ui/DataTable';
import type { ResponseEventSummary, SystemModel } from '../../../api/cpm/response';
import { zoneAbbr } from '../../../cpa/siteTime';
import { fmtInstantBare } from '../context/LoopContextBar';
import { codeLabel } from '../vocabulary';
import { eventRowView } from './responseCopy';
import { modelBrief, modelOfEvent, pathLabel, typeLabel } from './responseLabels';
import { ResponseTiles, type ModelsStatus } from './ResponseSummary';

export interface EventsTabProps {
  events: ResponseEventSummary[];
  selectedId: string | undefined;
  timeZone: string;
  loading: boolean;
  hasMore: boolean;
  models: SystemModel[] | undefined;
  modelsStatus: ModelsStatus;
  censoredCount: number;
  showCensored: boolean;
  onToggleCensored: (show: boolean) => void;
  onMore: () => void;
  onSelect: (e: ResponseEventSummary) => void;
  onModels: () => void;
}

/** The section the two event cards move to (CHG-195): scrolled into view and focused. */
const EVENTS_ID = 'response-events';
const toEvents = () => {
  const el = document.getElementById(EVENTS_ID);
  el?.scrollIntoView?.({ block: 'start' });
  el?.focus();
};

export const EventsTab: React.FC<EventsTabProps> = ({
  events, selectedId, timeZone, loading, hasMore, models, modelsStatus, censoredCount, showCensored, onToggleCensored, onMore, onSelect, onModels,
}) => {
  const columns: Array<Column<ResponseEventSummary>> = [
    { key: 'time', header: `Time · ${events.length > 0 ? zoneAbbr(timeZone, events[0].t0Ms) : ''}`, mono: true, cell: e => <span className="cpm-nowrap">{fmtInstantBare(e.t0Ms, timeZone)}</span> },
    { key: 'type', header: 'Type', cell: e => typeLabel(e.eventType) },
    { key: 'path', header: 'Path', cell: e => <span className="cpm-nowrap">{pathLabel(e.pathId)}</span> },
    { key: 'state', header: 'State', cell: e => { const v = eventRowView(e); return <TonePill tone={v.tone}>{codeLabel(v.state)}</TonePill>; } },
    { key: 'finding', header: 'Finding', cell: e => eventRowView(e).reason },
    { key: 'model', header: 'Model', cell: e => { const m = modelOfEvent(models, e.eventId); return m ? modelBrief(m) : '—'; } },
  ];
  return (
    <>
      <ResponseTiles events={events} hasMore={hasMore} models={models} modelsStatus={modelsStatus}
        censoredHidden={showCensored ? 0 : censoredCount} onEvents={toEvents} onModels={onModels} />
      <section id={EVENTS_ID} tabIndex={-1} className="cpm-surface cpm-response-sub" aria-label="Response events" aria-busy={loading || undefined}>
        <PanelHead title="Events" right={censoredCount > 0 && (
            <select className="cpm-select" aria-label="Censored events" value={showCensored ? 'show' : 'hide'}
              onChange={e => onToggleCensored(e.target.value === 'show')}>
              <option value="hide">Hide censored ({censoredCount})</option>
              <option value="show">Show censored ({censoredCount})</option>
            </select>
          )} />
        {events.length === 0 ? (
          <p className="cpm-copy">{loading ? 'Loading events…' : 'No response event recorded for this loop.'}</p>
        ) : (
          <DataTable caption="Response events, newest first" columns={columns} rows={events} rowKey={e => e.eventId}
            selectedKey={selectedId ?? null} onSelect={onSelect} rowClassName={e => (eventRowView(e).censored ? 'cpm-row--muted' : undefined)} />
        )}
        {hasMore && (
          <div className="cpm-windows-more">
            <ObcButton variant="flat" disabled={loading} onClick={onMore}>{loading ? 'Loading…' : 'Older events'}</ObcButton>
          </div>
        )}
      </section>
    </>
  );
};

export default EventsTab;
