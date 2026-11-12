/**
 * CHG-165 (owner review): the Events tab. The three counts once, then the loop's response events, newest first, as a table:
 * time, type, path, one state, the finding, and the model the event produced (from the loop's models already loaded, so no
 * request per row). Censored candidates stay out until asked for (audit F20); the choice carries their count. Choosing an
 * event is explicit, never "latest", and opens it on the Response tab. CHG-178: the time reads "7 Oct 05:43" in the loop's
 * site zone, as the band's options do; the zone is named once, in the heading ("Time · UTC").
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { PanelHead, TonePill } from '../shared';
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

export const EventsTab: React.FC<EventsTabProps> = ({
  events, selectedId, timeZone, loading, hasMore, models, modelsStatus, censoredCount, showCensored, onToggleCensored, onMore, onSelect, onModels,
}) => (
  <>
    <ResponseTiles events={events} hasMore={hasMore} models={models} modelsStatus={modelsStatus}
      censoredHidden={showCensored ? 0 : censoredCount} onModels={onModels} />
    <section className="cpm-surface cpm-response-sub" aria-label="Response events" aria-busy={loading || undefined}>
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
        <div className="cpm-table-wrap">
          <table className="cpm-table" data-table="response-events">
            <thead><tr><th>Time · {zoneAbbr(timeZone, events[0].t0Ms)}</th><th>Type</th><th>Path</th><th>State</th><th>Finding</th><th>Model</th></tr></thead>
            <tbody>
              {events.map(e => {
                const v = eventRowView(e);
                const m = modelOfEvent(models, e.eventId);
                const selected = e.eventId === selectedId;
                return (
                  <tr key={e.eventId} className={`${selected ? 'cpm-row--selected' : ''}${v.censored ? ' cpm-row--muted' : ''}`.trim() || undefined}>
                    <td className="cpm-nowrap">
                      <button type="button" className="ui-link cpm-mono" aria-current={selected ? 'true' : undefined} onClick={() => onSelect(e)}>
                        {fmtInstantBare(e.t0Ms, timeZone)}
                      </button>
                    </td>
                    <td>{typeLabel(e.eventType)}</td>
                    <td className="cpm-nowrap">{pathLabel(e.pathId)}</td>
                    <td><TonePill tone={v.tone}>{codeLabel(v.state)}</TonePill></td>
                    <td>{v.reason}</td>
                    <td>{m ? modelBrief(m) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {hasMore && (
        <div className="cpm-windows-more">
          <ObcButton variant="flat" disabled={loading} onClick={onMore}>{loading ? 'Loading…' : 'Older events'}</ObcButton>
        </div>
      )}
    </section>
  </>
);

export default EventsTab;
