/**
 * 2026-09-17 audit F5/F19: the answer first. The result card opens the centre column with the model
 * the kernel estimated (family from the metric method), its parameters with ± and units, the
 * validation verdict and one sentence on identifiability - and reserves its height with a skeleton
 * while the event loads, so the centre is never blank.
 */
import React from 'react';
import { KpiTile, PanelHead, TonePill } from '../shared';
import type { ResponseEventDetail, ResponseQuantity } from '../../../api/cpm/response';
import { resultSummary } from './responseCopy';
import { stateTone } from './responseSupport';

export const ResultCard: React.FC<{ result: ResponseEventDetail['result'] | undefined; metrics: ResponseQuantity[] | undefined; loading: boolean }> = ({ result, metrics, loading }) => {
  if (!result) {
    return (
      <section className={`cpm-surface cpm-verdict${loading ? ' cpm-skeleton cpm-skeleton--result' : ''}`} role="region" aria-label="Result" aria-busy={loading || undefined}>
        {loading ? <span className="cpm-sr-only">Loading the event…</span> : <p className="cpm-copy">The event's result is not available.</p>}
      </section>
    );
  }
  const s = resultSummary(result, metrics);
  const tone = s.family ? stateTone(s.modelState) : 'muted';
  return (
    <section className={`cpm-surface cpm-verdict cpm-tone-${tone}`} role="region" aria-label="Result">
      <PanelHead eyebrow="Result" title={s.headline} right={<TonePill tone={stateTone(result.evaluation_state)}>{result.evaluation_state}</TonePill>} />
      {s.parameters.length > 0 && (
        <div className="cpm-verdict__tiles">
          {s.parameters.map(p => <KpiTile key={p.label} caption={p.label} value={p.text} tone={tone} />)}
        </div>
      )}
      <p className="cpm-verdict__sentence">
        <strong>Validation:</strong> {s.validation.text}.
      </p>
      <p className="cpm-copy cpm-verdict__state">{s.identifiability}</p>
    </section>
  );
};
