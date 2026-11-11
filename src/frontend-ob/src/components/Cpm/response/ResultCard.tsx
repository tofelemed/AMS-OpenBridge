/**
 * 2026-09-17 audit F5/F19: the answer first. CHG-165 (owner review): the result is one row on the Response tab: the model
 * the kernel estimated (family from the metric method), its parameters with ± and units, the validation verdict, and its
 * state once, as the pill. Without a model, the row says why. It keeps its height as a skeleton while the event loads.
 */
import React from 'react';
import { TonePill } from '../shared';
import type { ResponseEventDetail, ResponseQuantity } from '../../../api/cpm/response';
import { codeLabel } from '../vocabulary';
import { resultSummary } from './responseCopy';
import { displayUnit, stateTone } from './responseSupport';

export const ResultCard: React.FC<{
  result: ResponseEventDetail['result'] | undefined; metrics: ResponseQuantity[] | undefined; loading: boolean;
  /** The loop's registered PV unit, for the kernel's PV_EU placeholder (as on the Models tab, CHG-097). */
  pvUnit?: string | null;
}> = ({ result, metrics, loading, pvUnit }) => {
  if (!result) {
    return (
      <section className={`cpm-surface cpm-response-result${loading ? ' cpm-skeleton cpm-skeleton--result' : ''}`} role="region" aria-label="Result" aria-busy={loading || undefined}>
        {loading ? <span className="cpm-sr-only">Loading the event…</span> : <p className="cpm-copy">The event's result is not available.</p>}
      </section>
    );
  }
  const s = resultSummary(result, metrics);
  const state = s.family ? s.modelState : result.evaluation_state;
  return (
    <section className={`cpm-surface cpm-response-result cpm-tone-${s.family ? stateTone(s.modelState) : 'muted'}`} role="region" aria-label="Result">
      <div className="cpm-response-result__head">
        <span className="cpm-eyebrow">Result</span>
        <h2 className="cpm-panel-title">{s.headline}</h2>
        <span className="cpm-copy">{s.family ? `Validation: ${s.validation.text}` : s.identifiability}</span>
      </div>
      {s.parameters.map(p => (
        <div key={p.label} className="cpm-response-param">
          <span className="cpm-kpi__caption">{p.label}</span>
          <span className="cpm-kpi__value">{displayUnit(p.text, result.path_id, pvUnit)}</span>
        </div>
      ))}
      <span className="cpm-response-result__state"><TonePill tone={stateTone(state)}>{codeLabel(state)}</TonePill></span>
    </section>
  );
};
