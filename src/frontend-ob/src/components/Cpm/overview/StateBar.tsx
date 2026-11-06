/**
 * CHG-127: every monitored loop in exactly one state, in the owner's layout. A segment and its legend entry open that state's
 * loops, so each count can be checked. Colour is never alone: the legend names every state with its count and share. The bar is
 * a pointer shortcut; keyboard and screen-reader users have the same links in the legend, so it stays out of the tab order.
 */
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type { FleetKpis, FleetKpiScope } from '../../../api/cpm/fleetKpis';
import { Toggletip } from '../../../ui/Toggletip';
import { kpiHref } from '../cpaHref';
import { stateSegments } from '../kpi/fleetKpiView';
import '../../../styles/cpm-state-bar.css';

const share = (n: number, of: number) => (of > 0 ? ((n / of) * 100).toFixed(1) : '0.0');

export const StateBar: React.FC<{ k: FleetKpis; scope?: FleetKpiScope }> = ({ k, scope }) => {
  const segments = stateSegments(k);
  return (
    <div className="cpm-state">
      <div className="cpm-state__head">
        <span className="cpm-state__title">
          Loop state breakdown
          <Toggletip variant="how-to" label="How the states are decided">
            <p>A loop can count on more than one card above. Here it counts once, in the first state that applies: never evaluated or stale, a finding, manual, saturated, not assessable, then performing or needs review.</p>
          </Toggletip>
        </span>
      </div>
      <div className="cpm-state__bar" aria-hidden="true">
        {segments.map(s => (
          <RouterLink key={s.key} className={`cpm-state__seg cpm-state__seg--${s.key}`} style={{ flexGrow: s.count }} tabIndex={-1}
            to={kpiHref(s.drill, scope)} title={`${s.label}: ${s.count} of ${k.monitored} (${share(s.count, k.monitored)} %)`} />
        ))}
      </div>
      <ul className="cpm-state__legend">
        {segments.map(s => (
          <li key={s.key}>
            <RouterLink to={kpiHref(s.drill, scope)} title={`List these ${s.count} loop(s)`}>
              <span className={`cpm-state__dot cpm-state__dot--${s.key}`} aria-hidden="true" />
              <span>{s.label}</span>{' '}
              <strong>{s.count}</strong>{' '}
              <span className="cpm-state__pct">({share(s.count, k.monitored)} %)</span>
            </RouterLink>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default StateBar;
