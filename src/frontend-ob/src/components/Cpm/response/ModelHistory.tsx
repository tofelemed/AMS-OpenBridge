/**
 * v2.5 Task 2E.5 (spec §2.8): the loop's system models as-of now. Each parameter is drawn as
 * markers at the model's creation instant with its ± uncertainty as separate markers - never a
 * line joining models (no trajectory was estimated). The table carries state, revision, review.
 */
import React from 'react';
import { ReasonedButton } from '../ReasonedButton';
import { EmptyState, PanelHead, TonePill } from '../shared';
import type { SystemModel } from '../../../api/cpm/response';
import { CpmChart, type CpmSeries } from '../evidence/CpmChart';
import { formatInZone } from '../evidence/timezone';
import { MODEL_PARAMS, displayUnit, fmt, paramLabel, paramPoints, stateTone, uncertaintyMeaning } from './responseSupport';
import { codeLabel } from '../vocabulary';

export const ModelHistoryBody: React.FC<{
  models: SystemModel[]; timeZone: string; canReview: boolean; onReview: (m: SystemModel) => void;
  /** The loop's registered PV unit (registry engineering.pvUnit), for the kernel's PV_EU placeholder. */
  pvUnit?: string | null;
}> = ({ models, timeZone, canReview, onReview, pvUnit }) => {
  if (models.length === 0) {
    return <EmptyState title="No system model for this loop" copy="A model is estimated from an accepted response event (a qualifying setpoint or output step); this loop has none yet. Once one exists, its candidate, validated and baseline models are reviewed here." />;
  }
  const charts = MODEL_PARAMS.map(p => ({ param: p, points: paramPoints(models, p) })).filter(c => c.points.length > 0);
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="Models" title="Model history (as-of now)" />
      {charts.map(({ param, points }) => {
        // CHG-097 (SME review 2 #15): engineering name and the loop's units; the interval as caps above and below each
        // estimate, named for what it is (1 standard error, or the delay grid's resolution for dead time)
        const x = points.map(p => p.tMs);
        const unit = displayUnit(points[0].unit, points[0].pathId, pvUnit);
        const label = paramLabel(param);
        const meaning = uncertaintyMeaning(param);
        const series: CpmSeries[] = [
          { id: param, label, unit, x, y: points.map(p => p.value), pen: 'accent', markers: true,
            meta: i => [`model ${points[i].modelId.slice(0, 8)} · ${codeLabel(points[i].state)}`,
              points[i].upper != null ? `interval ${fmt(points[i].lower!)} … ${fmt(points[i].upper!)} (${meaning})` : 'no uncertainty reported'] },
          { id: `${param}_upper`, label: 'Interval upper', bandMeaning: meaning, unit, x, y: points.map(p => p.upper), pen: 'grey', markers: true, symbol: 'rect' },
          { id: `${param}_lower`, label: 'Interval lower', bandMeaning: meaning, unit, x, y: points.map(p => p.lower), pen: 'grey', markers: true, symbol: 'rect' },
        ];
        return <CpmChart key={param} title={unit ? `${label} (${unit})` : label} series={series} xKind="time" timeZone={timeZone} height={280} />;
      })}
      <div className="cpm-matrix-scroll">
      <table className="cpm-table" data-table="models">
        <thead><tr><th>created</th><th>family</th><th>path</th><th>estimator</th><th>state</th><th>rev</th><th>review</th><th /></tr></thead>
        <tbody>
          {models.map(m => (
            <tr key={m.modelId}>
              <td className="cpm-mono">{formatInZone(Date.parse(m.createdAt), timeZone)}</td>
              <td>{m.family}</td>
              <td className="cpm-mono">{m.pathId}</td>
              <td className="cpm-mono">{m.estimator || '—'}</td>
              <td><TonePill tone={stateTone(m.modelState)}>{codeLabel(m.modelState)}</TonePill></td>
              <td className="cpm-mono">{m.revision}</td>
              <td>{m.reviewedBy ? `${m.reviewedBy}${m.reviewNote ? ` — ${m.reviewNote}` : ''}` : '—'}</td>
              <td>
                {/* CHG-098 (SME review 2 #29): a disabled Review says why — the permission on hover (the page states it once
                    below the table), a superseded model on screen in its row. */}
                <span title={!canReview ? 'Reviewing a model needs the cpm.model.review permission'
                  : m.modelState === 'SUPERSEDED' ? 'A newer revision replaced this model; review the current one instead' : undefined}>
                  <ReasonedButton variant="flat" disabled={!canReview || m.modelState === 'SUPERSEDED'} onClick={() => onReview(m)}
                    reason={canReview && m.modelState === 'SUPERSEDED' ? 'Superseded: review the current revision' : null}>Review</ReasonedButton>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="cpm-copy">Markers, not a line: each model is an estimate from its own event. The grey bars above and below each estimate mark its interval: ± 1 standard error of the fit; for a dead time the fit could not pin down, ± half the range of delays that fit equally well. Units are the loop's PV unit and the input the model was identified from (% OP or % VP). A baseline is chosen by review, never by recency.</p>
    </section>
  );
};
