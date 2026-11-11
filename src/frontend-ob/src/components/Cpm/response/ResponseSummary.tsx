/**
 * Task 21: the System Response summary. Three tiles (events, accepted events, the model state), each a link to what is
 * behind it, and, when a loop has no event to show, one panel that says why and where to go.
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

export interface ResponseFacts { events: string; accepted: string; model: string }
export type ModelsStatus = 'loading' | 'error' | 'ready';

const NOT_ACCEPTED = new Set(['CENSORED', 'INELIGIBLE', 'REJECTED']);
const PENDING = new Set(['PENDING', 'WAITING', 'CAPTURING']);
const MODEL_RANK = ['ACTIVE_BASELINE', 'VALIDATED', 'CANDIDATE'];

const isAccepted = (e: ResponseEventSummary): boolean => {
  const state = eventRowView(e).state.toUpperCase();
  return !NOT_ACCEPTED.has(state) && ![state, e.captureState, e.evaluationState].some(x => PENDING.has((x ?? '').toUpperCase()));
};

/**
 * Counts are of the events loaded: past one page they are a lower bound, so they read "50+". The model tile is the best
 * state held (baseline, then validated, then candidate), whatever the events say.
 */
export function responseFacts(events: ResponseEventSummary[], hasMore: boolean, models: SystemModel[], status: ModelsStatus = 'ready'): ResponseFacts {
  const plus = hasMore ? '+' : '';
  const accepted = events.filter(isAccepted).length;
  const best = MODEL_RANK.find(s => models.some(m => m.modelState === s));
  return {
    events: `${events.length}${plus}`,
    accepted: accepted === 0 && hasMore ? 'None loaded' : `${accepted}${plus}`,
    model: status === 'loading' ? 'Loading' : status === 'error' ? 'Not available' : best ? codeLabel(best) : 'None',
  };
}

/** CHG-165: the event tiles sit above their table on the Events tab; the model tile opens the Models tab. */
const Tile: React.FC<{ caption: string; value: string; sub?: string; onOpen?: () => void }> = ({ caption, value, sub, onOpen }) => {
  const body = (
    <>
      <span className="cpm-kpi__caption">{caption}</span><span className="cpm-kpi__value">{value}</span>
      {sub && <span className="cpm-kpi__sub">{sub}</span>}
    </>
  );
  return onOpen
    ? <button type="button" className="cpm-kpi cpm-response-tile" onClick={onOpen}>{body}</button>
    : <div className="cpm-kpi">{body}</div>;
};

export const ResponseTiles: React.FC<{
  events: ResponseEventSummary[]; hasMore: boolean; models: SystemModel[] | undefined; modelsStatus?: ModelsStatus;
  /** Censored candidates the list leaves out: the counts say what they exclude. */
  censoredHidden?: number;
  onModels?: () => void;
}> = ({ events, hasMore, models, modelsStatus = 'ready', censoredHidden = 0, onModels }) => {
  const f = responseFacts(events, hasMore, models ?? [], modelsStatus);
  const basis = censoredHidden > 0 ? `${censoredHidden} censored not counted` : undefined;
  return (
    <div className="cpm-kpi-row cpm-response-tiles">
      <Tile caption="Response events" value={f.events} sub={basis} />
      <Tile caption="Accepted events" value={f.accepted} />
      <Tile caption="System model" value={f.model} onOpen={(models ?? []).length > 0 ? onModels : undefined} />
    </div>
  );
};

export const ResponseEmpty: React.FC<{ loopId: string; canConfig: boolean }> = ({ loopId, canConfig }) => {
  const navigate = useNavigate();
  return (
    <section className="cpm-surface cpm-response-empty">
      <PanelHead eyebrow="Response analysis" title="No qualifying response event" />
      <p className="cpm-copy">A qualifying setpoint or output step is needed before a model can be estimated.</p>
      <div className="cpm-response-empty__actions">
        <ObcButton variant="flat" onClick={() => navigate(historicalHref(loopId))}>Review setpoint changes {'→'}</ObcButton>
        {canConfig && <ObcButton variant="flat" onClick={() => navigate(configHref({ loop: loopId, gate: 'G12' }))}>Check G12 settings</ObcButton>}
      </div>
      <ResponseSteps />
    </section>
  );
};
