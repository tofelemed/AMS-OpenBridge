/**
 * v2.5 Task 2E.5 (spec §2.8): the loop's system models as-of now. Each parameter is drawn as
 * markers at the model's creation instant with its ± uncertainty as separate markers - never a
 * line joining models (no trajectory was estimated). The table carries state, revision, review.
 * CHG-165 (owner review): the Models tab: the parameter trends, the table, Export models CSV.
 * CHG-195 (owner review item 19): the trends one per row at full width (Process gain, Dead time, Time constant), each with its
 * heading, legend, zoom tools and its own Export CSV in its head; the hover readout stays inside the chart (the shared
 * tooltip chrome). The models in the standard table (ui/DataTable) with the Candidate / Other group rows and Review as a
 * secondary button; no estimator column (owner Q8), the CSV keeps it.
 */
import React, { useId } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ReasonedButton } from '../ReasonedButton';
import { Toggletip } from '../../../ui/Toggletip';
import { DataTable, type Column } from '../../../ui/DataTable';
import { PanelHead, TonePill } from '../shared';
import type { SystemModel } from '../../../api/cpm/response';
import { CpmChart, type CpmSeries } from '../evidence/CpmChart';
import { formatInZone } from '../evidence/timezone';
import { MODEL_PARAMS, displayUnit, fmt, paramLabel, paramPoints, stateTone, uncertaintyMeaning } from './responseSupport';
import { codeLabel } from '../vocabulary';
import { downloadTextFile } from '../../../utils/csv';
import { pathLabel } from './responseLabels';

const GROUPS: Array<[string, string[]]> = [['Candidate', ['CANDIDATE']], ['Validated', ['VALIDATED']], ['Baseline', ['ACTIVE_BASELINE']]];
/** Candidate, validated and baseline; any other state (rejected, expired, superseded) follows as Other. */
function groupModels(models: SystemModel[]): Array<[string, SystemModel[]]> {
  const known = new Set(GROUPS.flatMap(([, s]) => s));
  const out: Array<[string, SystemModel[]]> = GROUPS.map(([name, states]) => [name, models.filter(m => states.includes(m.modelState))]);
  out.push(['Other', models.filter(m => !known.has(m.modelState))]);
  return out.filter(([, list]) => list.length > 0);
}
const REVIEW_NEEDS_PERMISSION = 'Model review needs the cpm.model.review permission.';

const cell = (v: unknown): string => { const t = v == null ? '' : String(v); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

/** CHG-165: the models table as CSV, the values as the kernel stored them, one column pair per parameter any model reports. */
export function modelsCsv(models: SystemModel[]): string {
  const params = MODEL_PARAMS.filter(p => models.some(m => m.parameters?.[p]?.value != null));
  const head = ['created_utc', 'family', 'path', 'estimator', 'state', 'revision', 'reviewed_by', ...params.flatMap(p => [p, `${p}_uncertainty`]), 'model_id'];
  const rows = models.map(m => [m.createdAt, m.family, m.pathId, m.estimator, m.modelState, m.revision, m.reviewedBy,
    ...params.flatMap(p => [m.parameters?.[p]?.value, m.parameters?.[p]?.uncertainty]), m.modelId].map(cell).join(','));
  return [head.join(','), ...rows].join('\n');
}

const exportModels = (models: SystemModel[]) =>
  downloadTextFile(`${models[0]?.loopId ?? 'loop'}-models-${new Date().toISOString().slice(0, 16).replace(':', '')}.csv`, modelsCsv(models));

interface GroupedModel { model: SystemModel; group: string }

export const ModelHistoryBody: React.FC<{
  models: SystemModel[]; timeZone: string; canReview: boolean; onReview: (m: SystemModel) => void;
  /** The loop's registered PV unit (registry engineering.pvUnit), for the kernel's PV_EU placeholder. */
  pvUnit?: string | null;
}> = ({ models, timeZone, canReview, onReview, pvUnit }) => {
  const noteId = useId();
  if (models.length === 0) return null;  // the summary tile says there is no model
  const charts = MODEL_PARAMS.map(p => ({ param: p, points: paramPoints(models, p) })).filter(c => c.points.length > 0);
  const rows: GroupedModel[] = groupModels(models).flatMap(([group, list]) => list.map(model => ({ model, group: `${group} (${list.length})` })));
  const columns: Array<Column<GroupedModel>> = [
    { key: 'created', header: 'Created', mono: true, cell: ({ model: m }) => formatInZone(Date.parse(m.createdAt), timeZone) },
    { key: 'family', header: 'Family', cell: ({ model: m }) => m.family },
    { key: 'path', header: 'Path', cell: ({ model: m }) => <span className="cpm-nowrap">{pathLabel(m.pathId)}</span> },
    { key: 'state', header: 'State', cell: ({ model: m }) => <TonePill tone={stateTone(m.modelState)}>{codeLabel(m.modelState)}</TonePill> },
    { key: 'revision', header: 'Revision', mono: true, cell: ({ model: m }) => m.revision },
    { key: 'reviewed', header: 'Reviewed by', cell: ({ model: m }) => (m.reviewedBy ? `${m.reviewedBy}${m.reviewNote ? ` — ${m.reviewNote}` : ''}` : '—') },
    {
      key: 'review', header: <span className="ui-sr">Review</span>, label: 'Review',
      // CHG-098 (SME review 2 #29): a disabled Review says why on screen: the missing permission, or the superseded model.
      cell: ({ model: m }) => (canReview
        ? <ReasonedButton variant="flat" disabled={m.modelState === 'SUPERSEDED'} onClick={() => onReview(m)}
          reason={m.modelState === 'SUPERSEDED' ? 'Superseded: review the current revision' : null}>Review</ReasonedButton>
        : <ObcButton variant="flat" disabled aria-describedby={noteId}>Review</ObcButton>),
    },
  ];
  return (
    <section id="response-models" tabIndex={-1} className="cpm-surface">
      <PanelHead eyebrow="Models" title="Model history (as-of now)"
        right={<ObcButton variant="flat" onClick={() => exportModels(models)}>Export models CSV</ObcButton>}
        help={(
          <Toggletip variant="how-to" label="How to read the model history">
            <p>Markers, not a line: each model is an estimate from its own event.</p>
            <p>The grey bars above and below each estimate mark its interval: ± 1 standard error of the fit; for a dead time the fit could not pin down, ± half the range of delays that fit equally well.</p>
            <p>Units are the loop's PV unit and the input the model was identified from (% OP or % VP).</p>
            <p>A baseline is chosen by review, never by recency.</p>
          </Toggletip>
        )} />
      <div className="cpm-response-trend-rows">
      {charts.map(({ param, points }) => {
        // CHG-097 (SME review 2 #15): engineering name and the loop's units; the interval as caps above and below each
        // estimate, named for what it is (1 standard error, or the delay grid's resolution for dead time)
        const x = points.map(p => p.tMs);
        const unit = displayUnit(points[0].unit, points[0].pathId, pvUnit);
        const label = paramLabel(param);
        const meaning = uncertaintyMeaning(param);
        const series: CpmSeries[] = [
          { id: param, label, unit, x, y: points.map(p => p.value), pen: 'overlay', markers: true,
            // CHG-195: the readout names the model by its state, not its id
            meta: i => [`${codeLabel(points[i].state)} model`,
              points[i].upper != null ? `interval ${fmt(points[i].lower!)} … ${fmt(points[i].upper!)} (${meaning})` : 'no uncertainty reported'] },
          // CHG-165: the caps above and below each estimate are one entry, so the legend says the meaning once and fits a narrow chart
          { id: `${param}_interval`, label: 'Interval', bandMeaning: meaning, unit, x: points.flatMap(p => [p.tMs, p.tMs]),
            y: points.flatMap(p => [p.upper, p.lower]), pen: 'neutral', markers: true, symbol: 'rect' },
        ];
        return <CpmChart key={param} title={unit ? `${label} (${unit})` : label} headingLevel={3} exportInHead series={series} xKind="time" timeZone={timeZone} height={240} />;
      })}
      </div>
      {!canReview && <p id={noteId} className="cpm-copy">{REVIEW_NEEDS_PERMISSION}</p>}
      <DataTable caption="System models of this loop" columns={columns} rows={rows} rowKey={r => r.model.modelId} groupOf={r => r.group} />
    </section>
  );
};
