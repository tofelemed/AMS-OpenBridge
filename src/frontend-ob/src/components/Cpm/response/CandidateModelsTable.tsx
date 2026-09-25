/**
 * v2.5 Task 2E.5 (spec §2.5-2.6): the candidate models as the estimator ranked them, the
 * delay-objective curve of the best candidate (flat curve = unidentifiable delay), the parameter
 * standard errors, and every rejection reason. Rows are the kernel's text; nothing is refit.
 */
import React from 'react';
import { EmptyState, KvRow, PanelHead, TonePill } from '../shared';
import type { DecodedArtifact } from '../evidence/artifactCodec';
import { CpmChart } from '../evidence/CpmChart';
import { ArtifactSkeleton } from '../evidence/views/viewSupport';
import { candidateRows, fmt, prov, provList } from './responseSupport';

export const CandidateModelsTable: React.FC<{ table: DecodedArtifact | undefined; delayCurve: DecodedArtifact | undefined; intervals: DecodedArtifact | undefined; rejections: DecodedArtifact | undefined; loading?: boolean }> = ({ table, delayCurve, intervals, rejections, loading }) => {
  if (!table && !rejections && loading) return <ArtifactSkeleton kinds={['candidate_models', 'rejection_reasons']} />;
  const rows = candidateRows(prov(table, 'rows'));
  const objective = table?.columns.y;
  const names = provList(intervals, 'parameters');
  const reasons = provList(rejections, 'reasons');
  if (!table && reasons.length === 0) {
    return <EmptyState title="No candidate models" copy="Estimation did not run for this event (see the subgate states); reasons the kernel recorded are listed when it did." />;
  }
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="Subgate D" title="Candidate models" right={table ? <TonePill tone={prov(table, 'state') === 'ESTIMATED' ? 'good' : 'warn'}>{prov(table, 'state') ?? '—'}</TonePill> : undefined} />
      {rows.length > 0 && (
        <div className="cpm-table-wrap"><table className="cpm-table" data-table="candidates">
          <thead><tr><th>#</th><th>family</th><th>path</th><th>parameters</th><th>objective ({table?.units.y ?? 'PV_EU^2'})</th><th>identifiability</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} data-best={i === 0}>
                <td className="cpm-mono">{i}{i === 0 ? ' (best)' : ''}</td>
                <td>{r.family}</td>
                <td className="cpm-mono">{r.path}</td>
                <td className="cpm-mono">{r.parameters.map(([k, v]) => `${k}=${v}`).join(', ')}</td>
                <td className="cpm-mono">{objective && Number.isFinite(objective[i]) ? fmt(objective[i]) : '—'}</td>
                <td>
                  {r.flatDelay && <TonePill tone="warn">FLAT_DELAY</TonePill>}{' '}
                  {r.boundsHit && <TonePill tone="warn">BOUNDS_HIT</TonePill>}{' '}
                  {r.signUncertain && <TonePill tone="warn">SIGN_UNCERTAIN</TonePill>}{' '}
                  <span className="cpm-mono">cond={r.cond}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {delayCurve && delayCurve.n > 0 && (
        <CpmChart title="Delay objective curve (best candidate)" xKind="value" xLabel={delayCurve.meta.x.quantity ?? 'dead_time'} xUnit={delayCurve.units.x ?? 's'} height={200}
          series={[{ id: 'objective', label: 'objective J(θ)', unit: delayCurve.units.y ?? 'PV_EU^2', x: delayCurve.columns.x, y: Array.from(delayCurve.columns.y), pen: 'accent', markers: true }]} />
      )}
      {delayCurve && delayCurve.n === 0 && <p className="cpm-copy">No delay profile was recorded for the best candidate.</p>}
      {intervals && (
        <>
          <PanelHead eyebrow="Subgate D" title="Parameter uncertainty" right={<TonePill tone="muted">{prov(intervals, 'method') ?? '—'}</TonePill>} />
          <div className="cpm-table-wrap"><table className="cpm-table" data-table="parameter-intervals">
            <thead><tr><th>parameter</th><th>std. error ({intervals.units.y ?? 'parameter units'})</th></tr></thead>
            <tbody>
              {Array.from(intervals.columns.y, (se, i) => (
                <tr key={i}><td className="cpm-mono">{names[i] ?? `p${i}`}</td><td className="cpm-mono">{Number.isFinite(se) ? fmt(se) : 'not available'}</td></tr>
              ))}
            </tbody>
          </table></div>
          <KvRow label="theta_uncertainty_s">{prov(intervals, 'theta_uncertainty_s') ?? '—'} s (delay grid resolution bound)</KvRow>
        </>
      )}
      <PanelHead eyebrow="Kernel" title="Rejection reasons" />
      {reasons.length === 0 ? <p className="cpm-copy">No candidate was rejected.</p> : (
        <ul className="cpm-ranked" data-list="rejections">{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      )}
    </section>
  );
};
