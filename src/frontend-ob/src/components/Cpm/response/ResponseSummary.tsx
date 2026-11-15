/**
 * Task 21: the System Response summary. Three counts (events, accepted events, the model state), each opening what is
 * behind it (CHG-195: as KPI cards), and, when a loop has no event to show, one panel that says why and where to go.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObiCheckGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-check-google';
import { ObiRecordEvent } from '@oicl/openbridge-webcomponents-react/icons/icon-record-event';
import { ObiTrend } from '@oicl/openbridge-webcomponents-react/icons/icon-trend';
import { PanelHead } from '../shared';
import { KpiCard } from '../kpi/KpiCard';
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

/**
 * CHG-195 (owner review item 19): the three counts as the Overview's KPI cards (label and icon on top, then the value). Each
 * opens what is behind it: the two event counts move to the events table, the model card opens the Models tab. A card with
 * nothing behind it stays a plain tile. What the event counts leave out (censored candidates) is the small line under the value.
 */
export const ResponseTiles: React.FC<{
  events: ResponseEventSummary[]; hasMore: boolean; models: SystemModel[] | undefined; modelsStatus?: ModelsStatus;
  /** Censored candidates the list leaves out: the counts say what they exclude. */
  censoredHidden?: number;
  onEvents?: () => void;
  onModels?: () => void;
}> = ({ events, hasMore, models, modelsStatus = 'ready', censoredHidden = 0, onEvents, onModels }) => {
  const f = responseFacts(events, hasMore, models ?? [], modelsStatus);
  const basis = censoredHidden > 0 ? `${censoredHidden} censored not counted` : undefined;
  const toEvents = events.length > 0 ? onEvents : undefined;
  return (
    <div className="cpm-kpicards cpm-response-tiles" role="list" aria-label="Response counts">
      <div role="listitem">
        <KpiCard headed Icon={ObiRecordEvent} value={f.events} label="Response events" group={basis} onOpen={toEvents} opensDialog={false} />
      </div>
      <div role="listitem">
        <KpiCard headed Icon={ObiCheckGoogle} value={f.accepted} label="Accepted events" onOpen={toEvents} opensDialog={false} />
      </div>
      <div role="listitem">
        <KpiCard headed Icon={ObiTrend} value={f.model} label="System model" onOpen={(models ?? []).length > 0 ? onModels : undefined} opensDialog={false} />
      </div>
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
