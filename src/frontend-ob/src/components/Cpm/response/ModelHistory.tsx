/**
 * v2.5 Task 2E.5 (spec §2.8): the loop's system models as-of now. Each parameter is drawn as
 * markers at the model's creation instant with its ± uncertainty as separate markers - never a
 * line joining models (no trajectory was estimated). The table carries state, revision, review.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, PanelHead, TonePill } from '../shared';
import type { SystemModel } from '../../../api/cpm/response';
import { CpmChart, type CpmSeries } from '../evidence/CpmChart';
import { formatInZone } from '../evidence/timezone';
import { MODEL_PARAMS, paramPoints, stateTone } from './responseSupport';
import { codeLabel } from '../vocabulary';

export const ModelHistoryBody: React.FC<{ models: SystemModel[]; timeZone: string; canReview: boolean; onReview: (m: SystemModel) => void }> = ({ models, timeZone, canReview, onReview }) => {
  if (models.length === 0) {
    return <EmptyState title="No system model for this loop" copy="A model is estimated from an accepted response event (a qualifying setpoint or output step); this loop has none yet. Once one exists, its candidate, validated and baseline models are reviewed here." />;
  }
  const charts = MODEL_PARAMS.map(p => ({ param: p, points: paramPoints(models, p) })).filter(c => c.points.length > 0);
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="Models" title="Model history (as-of now)" />
      {charts.map(({ param, points }) => {
        const x = points.map(p => p.tMs);
        const series: CpmSeries[] = [
          { id: param, label: param, unit: points[0].unit, x, y: points.map(p => p.value), pen: 'accent', markers: true, meta: i => [`model ${points[i].modelId.slice(0, 8)} · ${codeLabel(points[i].state)}`] },
          { id: `${param}_upper`, label: `${param} upper (value + uncertainty)`, unit: points[0].unit, x, y: points.map(p => p.upper), pen: 'grey', markers: true },
          { id: `${param}_lower`, label: `${param} lower (value − uncertainty)`, unit: points[0].unit, x, y: points.map(p => p.lower), pen: 'grey', markers: true },
        ];
        return <CpmChart key={param} title={param} series={series} xKind="time" timeZone={timeZone} height={280} />;
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
                <ObcButton variant="flat" disabled={!canReview || m.modelState === 'SUPERSEDED'} onClick={() => onReview(m)}>Review</ObcButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="cpm-copy">Markers, not a line: each model is an estimate from its own event; the interval is value ± the kernel's uncertainty. A baseline is chosen by review, never by recency.</p>
    </section>
  );
};
