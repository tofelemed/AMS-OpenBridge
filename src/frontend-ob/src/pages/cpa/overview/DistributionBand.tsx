/**
 * SPEC §5.1 distribution band (C14): every monitored loop in one state, from the server's counts.
 * Each legend item filters the table. The normal segment is `surface.raised` with a strong edge (CD13).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import type { FleetKpis } from '../../../api/cpm/fleetKpis';
import { MetricHelp } from './MetricHelp';
import { distribution, type ReviewKey } from './reviewFilters';

export const DistributionBand: React.FC<{
  kpis: FleetKpis;
  review: ReviewKey;
  hrefOf: (key: ReviewKey) => string;
}> = ({ kpis, review, hrefOf }) => {
  const segments = distribution(kpis);
  return (
    <section className="ov-band" aria-label="Monitored loops by state">
      <div className="ov-band__bar" role="img"
        aria-label={`Monitored loops by state: ${segments.map(s => `${s.label} ${s.count}`).join(', ')}`}>
        {segments.map(s => <span key={s.key} className="ov-band__segment" data-tone={s.tone} style={{ flexGrow: s.count }} />)}
      </div>
      <ul className="ov-band__legend">
        {segments.map(s => (
          <li key={s.key}>
            <span className="ov-band__swatch" data-tone={s.tone} aria-hidden="true" />
            {s.filter
              ? <Link to={hrefOf(s.filter)} aria-current={review === s.filter ? 'true' : undefined}>{s.label} <strong>{s.count}</strong></Link>
              : <span>{s.label} <strong>{s.count}</strong></span>}
          </li>
        ))}
        <li><MetricHelp metric="M-004" label="Monitored loops by state" basis={kpis.basis} /></li>
      </ul>
    </section>
  );
};
