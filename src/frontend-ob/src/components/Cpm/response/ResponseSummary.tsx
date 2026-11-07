/**
 * Task 21: the System Response summary. Three tiles (events, accepted events, the model state) and, when a loop has
 * no event to show, one panel that says why and where to go. A model is never claimed without an accepted event.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { PanelHead } from '../shared';
import type { ResponseEventSummary, SystemModel } from '../../../api/cpm/response';
import { configHref, historicalHref } from '../cpaHref';
import { codeLabel } from '../vocabulary';
import { eventRowView } from './responseCopy';
import { ResponseSteps } from './ResponseSteps';

export interface ResponseFacts { events: string; accepted: string; model: string; modelNote: string | null }

const NOT_ACCEPTED = new Set(['CENSORED', 'INELIGIBLE', 'REJECTED']);
const MODEL_RANK = ['ACTIVE_BASELINE', 'VALIDATED', 'CANDIDATE'];

/** Counts are of the events loaded: past one page they are a lower bound, so they read "50+". */
export function responseFacts(events: ResponseEventSummary[], hasMore: boolean, models: SystemModel[]): ResponseFacts {
  const plus = hasMore ? '+' : '';
  const accepted = events.filter(e => !NOT_ACCEPTED.has(eventRowView(e).state)).length;
  if (accepted === 0) return { events: `${events.length}${plus}`, accepted: `0${plus}`, model: 'None', modelNote: 'No accepted event' };
  const best = MODEL_RANK.find(s => models.some(m => m.modelState === s));
  return { events: `${events.length}${plus}`, accepted: `${accepted}${plus}`, model: best ? codeLabel(best) : 'Not estimated', modelNote: null };
}

export const ResponseTiles: React.FC<{ events: ResponseEventSummary[]; hasMore: boolean; models: SystemModel[] }> = ({ events, hasMore, models }) => {
  const f = responseFacts(events, hasMore, models);
  return (
    <div className="cpm-kpi-row cpm-response-tiles">
      <div className="cpm-kpi"><span className="cpm-kpi__caption">Response events</span><span className="cpm-kpi__value">{f.events}</span></div>
      <div className="cpm-kpi"><span className="cpm-kpi__caption">Accepted events</span><span className="cpm-kpi__value">{f.accepted}</span></div>
      <div className="cpm-kpi">
        <span className="cpm-kpi__caption">System model</span><span className="cpm-kpi__value">{f.model}</span>
        {f.modelNote && <span className="cpm-kpi__sub">{f.modelNote}</span>}
      </div>
    </div>
  );
};

export const ResponseEmpty: React.FC<{ loopId: string; canConfig: boolean; censoredCount: number }> = ({ loopId, canConfig, censoredCount }) => {
  const navigate = useNavigate();
  return (
    <section className="cpm-surface cpm-response-empty">
      <PanelHead eyebrow="Response analysis" title="No qualifying response event" />
      <p className="cpm-copy">A qualifying setpoint or output step is needed before a model can be estimated.</p>
      {censoredCount > 0 && (
        <p className="cpm-copy" role="status">
          {censoredCount} captured candidate{censoredCount === 1 ? ' was' : 's were'} censored. Show them in the list to read why.
        </p>
      )}
      <div className="cpm-response-empty__actions">
        <ObcButton variant="flat" onClick={() => navigate(historicalHref(loopId))}>Review setpoint changes {'→'}</ObcButton>
        {canConfig && <ObcButton variant="flat" onClick={() => navigate(configHref({ loop: loopId, gate: 'G12' }))}>Check G12 settings</ObcButton>}
      </div>
      <ResponseSteps />
    </section>
  );
};
