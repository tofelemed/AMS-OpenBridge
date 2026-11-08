/**
 * CHG-082 / CHG-085: the loops behind one KPI. Each row proves one loop's place in the number: the measured value next to
 * a small bar with the threshold marked (so "above / below the limit" is seen, not only read), the window it was judged on,
 * the verdict, the inputs to check next and the links to the evidence. A table on wide screens; each row becomes a labelled
 * card below 900 px (CSS), so nothing scrolls sideways on a phone.
 * CHG-132: each fact once in a row. A measure every row shares is named in the column heading, and the column goes when
 * the verdict already says all it would.
 * CHG-155 (owner review): the loop column holds the tag only; a limit every row shares joins the heading; the verdict column
 * goes for a KPI whose rule fixes it (Stale, Never evaluated); "Also check" goes when no row has anything; times are short.
 */
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type { FleetKpiDeciding, FleetKpiKey, FleetKpiRow } from '../../../api/cpm/fleetKpis';
import { TonePill, type CpmTone } from '../shared';
import { fmtWhen } from '../blocks/whenText';
import { ageText } from '../verdictAge';
import { commonLimit, commonMeasure, contextText, decidingNumber, decidingText, decidingValue, proofLinks, verdictText } from './kpiProof';

/** KPIs whose rule fixes every row's verdict: the KPI's own name already says it. */
const SAME_VERDICT = new Set<FleetKpiKey>(['stale', 'never-evaluated', 'bar-stale', 'bar-never-evaluated']);

/** Value and threshold on one 0–100 scale (fractions and scores); null when there is no scale to draw. */
export function meterOf(d: FleetKpiDeciding): { value: number; threshold: number } | null {
  if (!d.measured || d.value == null || d.threshold == null) return null;
  if (d.unit === 'fraction') return { value: Math.min(100, Math.max(0, d.value * 100)), threshold: d.threshold * 100 };
  if (d.unit === 'score') return { value: Math.min(100, Math.max(0, d.value)), threshold: d.threshold };
  return null;
}

const verdictTone = (r: FleetKpiRow): CpmTone =>
  r.state !== 'Assessed' ? 'muted' : r.outcome === 'Finding' ? 'bad' : r.outcome === 'Acceptable' ? 'good' : r.outcome === 'SymptomOnly' ? 'warn' : 'muted';

const Meter: React.FC<{ d: FleetKpiDeciding }> = ({ d }) => {
  const m = meterOf(d);
  if (!m) return null;
  return (
    <span className="cpm-kpimeter" aria-hidden>
      <span className="cpm-kpimeter__fill" style={{ width: `${m.value}%` }} />
      <span className="cpm-kpimeter__mark" style={{ left: `${m.threshold}%` }} />
    </span>
  );
};

export const KpiRowsTable: React.FC<{ rows: FleetKpiRow[]; kpi: FleetKpiKey }> = ({ rows, kpi }) => {
  const measure = commonMeasure(rows);
  const limit = measure ? commonLimit(rows) : null;
  const measuredHead = measure ? (limit ? `${measure} · ${limit}` : measure) : 'Measured';
  const showMeasured = rows.some(r => decidingText(r) !== verdictText(r));
  const showVerdict = !SAME_VERDICT.has(kpi);
  const context = rows.map(r => contextText(r, r.rowKey ?? kpi));
  const showContext = context.some(Boolean);
  const measured = (r: FleetKpiRow) => (!measure ? decidingText(r) : limit ? decidingNumber(r) ?? decidingValue(r) : decidingValue(r));
  return (
    <table className="cpm-table cpm-kpi-table" aria-label="Loops behind this KPI">
      <thead>
        <tr>
          <th scope="col">Loop</th>
          {showMeasured && <th scope="col">{measuredHead}</th>}
          {showVerdict && <th scope="col">Verdict</th>}
          <th scope="col">Window</th>
          {showContext && <th scope="col">Also check</th>}
          <th scope="col">Proof</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.loopId}>
            <td data-label="Loop"><strong>{r.loopId}</strong></td>
            {showMeasured && (
              <td data-label={measuredHead}>
                <span className={`cpm-kpi-table__measured${measure ? ' cpm-kpi-table__when' : ''}`}>{measured(r)}</span>
                <Meter d={r.deciding} />
              </td>
            )}
            {showVerdict && <td data-label="Verdict"><TonePill tone={verdictTone(r)}>{verdictText(r)}</TonePill></td>}
            <td data-label="Window">
              {r.windowEnd ? <><span className="cpm-kpi-table__when">{fmtWhen(r.windowEnd)}</span>
                {r.ageSeconds != null && r.deciding.unit !== 'seconds' && <span className="cpm-kpi-table__sub">{ageText(r.ageSeconds * 1000)}</span>}</> : 'none yet'}
            </td>
            {showContext && <td data-label="Also check" className="cpm-kpi-table__context">{context[i] || '—'}</td>}
            <td data-label="Proof">
              <span className="cpm-kpi-table__links">
                {proofLinks(r, r.rowKey ?? kpi).map(l => (
                  <RouterLink key={l.label} className="cpm-link" to={l.href} title={l.title}>{l.label} ↗</RouterLink>
                ))}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default KpiRowsTable;
