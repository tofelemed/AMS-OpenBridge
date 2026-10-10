/**
 * CHG-082 / CHG-085: the loops behind one KPI. Each row proves one loop's place in the number: the measured value next to
 * a small bar with the threshold marked (so "above / below the limit" is seen, not only read), the window it was judged on,
 * the verdict, the inputs to check next and the links to the evidence. A table on wide screens; each row becomes a labelled
 * card below 760 px (CSS), so nothing scrolls sideways on a phone.
 */
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type { FleetKpiDeciding, FleetKpiKey, FleetKpiRow } from '../../../api/cpm/fleetKpis';
import { TonePill, fmtDateTime, type CpmTone } from '../shared';
import { ageText } from '../verdictAge';
import { contextText, decidingText, proofLinks, verdictText } from './kpiProof';

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

export const KpiRowsTable: React.FC<{ rows: FleetKpiRow[]; kpi: FleetKpiKey }> = ({ rows, kpi }) => (
  <table className="cpm-table cpm-kpi-table" aria-label="Loops behind this KPI">
    <thead>
      <tr>
        <th scope="col">Loop</th>
        <th scope="col">Measured against the rule</th>
        <th scope="col">Verdict</th>
        <th scope="col">Window judged</th>
        <th scope="col">Also check</th>
        <th scope="col">Proof</th>
      </tr>
    </thead>
    <tbody>
      {rows.map(r => (
        <tr key={r.loopId}>
          <td data-label="Loop">
            <strong className="cpm-kpi-table__tag">{r.loopId}</strong>
            <span className="cpm-kpi-table__sub">{r.displayName && r.displayName !== r.loopId ? r.displayName : ''}</span>
            <span className="cpm-kpi-table__sub">{[r.site, r.area, r.unit].filter(Boolean).join(' › ')}</span>
          </td>
          <td data-label="Measured against the rule">
            <span className="cpm-kpi-table__measured">{decidingText(r)}</span>
            <Meter d={r.deciding} />
          </td>
          <td data-label="Verdict"><TonePill tone={verdictTone(r)}>{verdictText(r)}</TonePill></td>
          <td data-label="Window judged">
            {r.windowEnd ? <>{fmtDateTime(r.windowEnd)}
              <span className="cpm-kpi-table__sub">{r.windowKind} window · {r.ageSeconds != null ? ageText(r.ageSeconds * 1000) : ''}</span></> : 'none yet'}
          </td>
          <td data-label="Also check" className="cpm-kpi-table__context">{contextText(r, kpi) || '—'}</td>
          <td data-label="Proof">
            <span className="cpm-kpi-table__links">
              {proofLinks(r).map(l => (
                <RouterLink key={l.label} className="cpm-link" to={l.href} title={l.title}>{l.label} ›</RouterLink>
              ))}
            </span>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

export default KpiRowsTable;
