/**
 * CHG-082 / KPI Phase 3: the loops behind one KPI, each with the value that put it there (against the threshold), the window
 * it was judged on, its verdict, the inputs to check next and the links that prove it. A table on wide screens; each row
 * becomes a card below 760 px (CSS), so nothing scrolls sideways on a phone.
 */
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type { FleetKpiKey, FleetKpiRow } from '../../../api/cpm/fleetKpis';
import { fmtDateTime } from '../shared';
import { ageText } from '../verdictAge';
import { contextText, decidingText, proofLinks, verdictText } from './kpiProof';

export const KpiRowsTable: React.FC<{ rows: FleetKpiRow[]; kpi: FleetKpiKey }> = ({ rows, kpi }) => (
  <table className="cpm-table cpm-kpi-table" aria-label="Loops behind this KPI">
    <thead>
      <tr>
        <th scope="col">Loop</th>
        <th scope="col">Why it is here</th>
        <th scope="col">Window judged</th>
        <th scope="col">Verdict</th>
        <th scope="col">Also check</th>
        <th scope="col">Proof</th>
      </tr>
    </thead>
    <tbody>
      {rows.map(r => {
        const context = contextText(r, kpi);
        return (
          <tr key={r.loopId}>
            <td data-label="Loop">
              <strong>{r.loopId}</strong>
              <span className="cpm-kpi-table__sub">{[r.displayName !== r.loopId ? r.displayName : null, [r.site, r.area, r.unit].filter(Boolean).join(' › ')].filter(Boolean).join(' · ')}</span>
            </td>
            <td data-label="Why it is here">{decidingText(r)}</td>
            <td data-label="Window judged">
              {r.windowEnd ? <>{r.windowKind} ending {fmtDateTime(r.windowEnd)}
                <span className="cpm-kpi-table__sub">{r.ageSeconds != null ? ageText(r.ageSeconds * 1000) : ''}</span></> : 'none yet'}
            </td>
            <td data-label="Verdict">{verdictText(r)}</td>
            <td data-label="Also check">{context || '—'}</td>
            <td data-label="Proof">
              <span className="cpm-kpi-table__links">
                {proofLinks(r).map(l => (
                  <RouterLink key={l.label} className="cpm-link" to={l.href} title={l.title}>{l.label} ›</RouterLink>
                ))}
              </span>
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

export default KpiRowsTable;
