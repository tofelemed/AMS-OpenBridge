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

export const EVENTS_ID = 'response-events';
export const MODELS_ID = 'response-models';

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

const jump = (id: string) => (ev: React.MouseEvent) => {
  const el = document.getElementById(id);
  if (!el) return;
  ev.preventDefault();
  el.scrollIntoView?.({ block: 'start' });
  el.focus();
};

const Tile: React.FC<{ caption: string; value: string; sub?: string; to?: string }> = ({ caption, value, sub, to }) => {
  const body = (
    <>
      <span className="cpm-kpi__caption">{caption}</span><span className="cpm-kpi__value">{value}</span>
      {sub && <span className="cpm-kpi__sub">{sub}</span>}
    </>
  );
  return to
    ? <a className="cpm-kpi cpm-response-tile" href={`#${to}`} onClick={jump(to)}>{body}</a>
    : <div className="cpm-kpi">{body}</div>;
};

export const ResponseTiles: React.FC<{
  events: ResponseEventSummary[]; hasMore: boolean; models: SystemModel[] | undefined; modelsStatus?: ModelsStatus;
  /** Censored candidates the list leaves out: the counts say what they exclude. */
  censoredHidden?: number;
}> = ({ events, hasMore, models, modelsStatus = 'ready', censoredHidden = 0 }) => {
  const f = responseFacts(events, hasMore, models ?? [], modelsStatus);
  const basis = censoredHidden > 0 ? `${censoredHidden} censored not counted` : undefined;
  const eventsTo = events.length > 0 ? EVENTS_ID : undefined;
  return (
    <div className="cpm-kpi-row cpm-response-tiles">
      <Tile caption="Response events" value={f.events} sub={basis} to={eventsTo} />
      <Tile caption="Accepted events" value={f.accepted} to={eventsTo} />
      <Tile caption="System model" value={f.model} to={(models ?? []).length > 0 ? MODELS_ID : undefined} />
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
