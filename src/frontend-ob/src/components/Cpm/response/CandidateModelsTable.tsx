/**
 * v2.5 Task 2E.5 (spec §2.5-2.6): the candidate models as the estimator ranked them, the
 * delay-objective curve of the best candidate (flat curve = unidentifiable delay), the parameter
 * standard errors, and every rejection reason. Rows are the kernel's text; nothing is refit.
 * CHG-165 (owner review): on the Fit quality tab the candidates go with the delay curve of the best one. CHG-195 (owner rule
 * 15 Nov 2026): one trend per row: the delay curve at full width, then the candidates table at full width.
 * CHG-193 (owner decision 15 Nov 2026): the identifiability flags and the delay uncertainty in words.
 * CHG-197 (owner rule: no technical text): the model families, paths, parameters, states, units and rejection reasons in words,
 * the two tables in the standard table; the CSV keeps its column names.
 * CHG-200 (final test #5; C6, C9): no step codes or method pill, the path in words where the writer put "fit", the condition number
 * rounded, the fit error's unit after a comma, every parameter named; a gap before each section that follows the table.
 */
import React from 'react';
import { EmptyState, KvRow, PanelHead, TonePill } from '../shared';
import { DataTable, type Column } from '../../../ui/DataTable';
import type { DecodedArtifact } from '../evidence/artifactCodec';
import { CpmChart } from '../evidence/CpmChart';
import { ArtifactSkeleton } from '../evidence/views/viewSupport';
import { codeLabel } from '../vocabulary';
import { plainNumber } from '../evidence/format';
import { candidateRows, displayUnit, fmt, paramLabel, prov, provList, typographicUnit, type CandidateRow } from './responseSupport';
import { candidateParamText, familyLabel, pathLabel, reasonText } from './responseLabels';

interface Ranked { row: CandidateRow; rank: number; objective: number | undefined }
interface Interval { name: string; se: number }

export const CandidateModelsTable: React.FC<{ table: DecodedArtifact | undefined; delayCurve: DecodedArtifact | undefined; intervals: DecodedArtifact | undefined; rejections: DecodedArtifact | undefined; loading?: boolean;
  /** CHG-105: the event's charts are not stored (the Response panel above says why); never claim "no model was estimated". */
  notStored?: boolean; pvUnit?: string | null }> = ({ table, delayCurve, intervals, rejections, loading, notStored, pvUnit }) => {
  if (!table && !rejections && loading) return <ArtifactSkeleton kinds={['candidate_models', 'rejection_reasons']} />;
  if (!table && !rejections && notStored) return <EmptyState title="Candidate models not stored" />;
  const rows = candidateRows(prov(table, 'rows'));
  const objective = table?.columns.y;
  const names = provList(intervals, 'parameters');
  const reasons = provList(rejections, 'reasons');
  if (!table && reasons.length === 0) {
    return <EmptyState title="No candidate models" copy="No model was estimated for this event. Steps & data says where it stopped and why." />;
  }
  // "PV_EU^2" reads "(m3/h)²": the square belongs to the whole unit
  const squared = (u: string | undefined) => displayUnit(typographicUnit(u ?? 'PV_EU^2'), table?.meta.roleOrPath, pvUnit);
  // CHG-200 (final test #5): the writer puts "fit" where the path goes ("FOPDT(fit: …)"); the path is the artifact's own
  const pathOf = (row: CandidateRow) => (row.path && row.path.toLowerCase() !== 'fit' ? row.path : table?.meta.roleOrPath ?? '');
  const errorUnit = squared(table?.units.y);
  const ranked: Ranked[] = rows.map((row, i) => ({ row, rank: i + 1, objective: objective && Number.isFinite(objective[i]) ? objective[i] : undefined }));
  const columns: Array<Column<Ranked>> = [
    { key: 'rank', header: 'Rank', cell: r => (r.rank === 1 ? '1 (best)' : String(r.rank)) },
    { key: 'model', header: 'Model', cell: r => familyLabel(r.row.family) },
    { key: 'path', header: 'Path', cell: r => (pathOf(r.row) ? pathLabel(pathOf(r.row)) : '—') },
    { key: 'parameters', header: 'Parameters', cell: r => r.row.parameters.map(([k, v]) => candidateParamText(k, v)).join(' · ') },
    { key: 'error', header: `Fit error, ${errorUnit}`, cell: r => (r.objective != null ? fmt(r.objective) : '—'), align: 'end' },
    { key: 'identifiability', header: 'Identifiability', cell: r => (
      <>
        {r.row.flatDelay && <TonePill tone="warn">Flat delay</TonePill>}{' '}
        {r.row.boundsHit && <TonePill tone="warn">Bounds hit</TonePill>}{' '}
        {r.row.signUncertain && <TonePill tone="warn">Sign uncertain</TonePill>}{' '}
        {r.row.cond && <span>Condition number {Number.isFinite(Number(r.row.cond)) ? plainNumber(Number(r.row.cond)) : r.row.cond}</span>}
      </>
    ) },
  ];
  const errors: Interval[] = intervals ? Array.from(intervals.columns.y, (se, i) => ({ name: names[i] ?? `Parameter ${i + 1}`, se })) : [];
  const intervalColumns: Array<Column<Interval>> = [
    { key: 'parameter', header: 'Parameter', cell: r => paramLabel(r.name) },
    { key: 'se', header: 'Standard error', cell: r => (Number.isFinite(r.se) ? fmt(r.se) : 'not available'), align: 'end' },
  ];
  return (
    <section className="cpm-surface cpm-response-candidates">
      <PanelHead title="Candidate models" right={table ? <TonePill tone={prov(table, 'state') === 'ESTIMATED' ? 'good' : 'warn'}>{codeLabel(prov(table, 'state'))}</TonePill> : undefined} />
      <div className="cpm-response-trend-rows">
      {delayCurve && delayCurve.n > 0 && (
        <CpmChart title="Delay search (best candidate)" xKind="value" xLabel="Dead time" csvXLabel={delayCurve.meta.x.quantity ?? 'dead_time'} xUnit={delayCurve.units.x ?? 's'} height={200} exportInHead
          series={[{ id: 'objective', label: 'Fit error', csvLabel: 'objective J(θ)', unit: squared(delayCurve.units.y), x: delayCurve.columns.x, y: Array.from(delayCurve.columns.y), pen: 'overlay', markers: true }]} />
      )}
      {delayCurve && delayCurve.n === 0 && <p className="cpm-copy">No delay search was recorded for the best candidate.</p>}
      {ranked.length > 0 && <DataTable caption="Candidate models of this event" columns={columns} rows={ranked} rowKey={r => String(r.rank)} />}
      </div>
      {intervals && (
        <>
          <PanelHead title="Parameter uncertainty" />
          <DataTable caption="Parameter uncertainty of the best candidate" columns={intervalColumns} rows={errors} rowKey={r => r.name} />
          <KvRow label="Delay uncertainty">{prov(intervals, 'theta_uncertainty_s') ?? '—'} s (delay grid resolution bound)</KvRow>
        </>
      )}
      <PanelHead title="Rejection reasons" />
      {reasons.length === 0 ? <p className="cpm-copy">No candidate was rejected.</p> : (
        <ul className="cpm-ranked" data-list="rejections" aria-label="Rejection reasons">{reasons.map((r, i) => <li key={i}>{reasonText(r)}</li>)}</ul>
      )}
    </section>
  );
};
