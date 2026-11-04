/**
 * SPEC §6.3: three to five figures in one strip, with no nested cards. A missing value never reads
 * as zero: it says Unavailable with the reason. A stale value keeps its number and says Stale with
 * its time (skill §9).
 */
import React from 'react';

export interface Metric {
  key: string;
  label: string;
  /** Formatted by the page, with the page's own precision. Null means there is no value. */
  value: string | number | null | undefined;
  unit?: string;
  /** The evaluated window or period the figure comes from (RD3). */
  window?: string;
  /** For example "±0 pp vs 24 h ago". */
  change?: string;
  state?: 'current' | 'stale' | 'unavailable';
  /** When stale: since when. When unavailable: why. */
  note?: string;
  /** A Toggletip with the definition (SPEC principle 4). */
  help?: React.ReactNode;
  /** Opens the loops behind the number (project rule: every KPI has a drill-down). */
  to?: React.ReactNode;
}

const Figure: React.FC<{ m: Metric }> = ({ m }) => {
  const missing = m.value == null || m.value === '';
  const state = m.state ?? (missing ? 'unavailable' : 'current');
  const showValue = state !== 'unavailable' && !missing;
  return (
    <div className="ui-metric" data-state={state}>
      <dt className="ui-metric__label">
        <span>{m.label}</span>
        {m.help}
      </dt>
      <dd className="ui-metric__body">
        {showValue
          ? <span className="ui-metric__value">{m.value}{m.unit && <span className="ui-metric__unit"> {m.unit}</span>}</span>
          : <span className="ui-metric__missing">Unavailable</span>}
        {state === 'stale' && <span className="ui-metric__flag">Stale</span>}
      </dd>
      {m.note && <dd className="ui-metric__note">{m.note}</dd>}
      {m.window && <dd className="ui-metric__window">{m.window}</dd>}
      {m.change && <dd className="ui-metric__window">{m.change}</dd>}
      {m.to && <dd className="ui-metric__link">{m.to}</dd>}
    </div>
  );
};

export const MetricSummary: React.FC<{ label: string; metrics: Metric[] }> = ({ label, metrics }) => (
  <dl className="ui-metrics" aria-label={label} style={{ '--ui-metric-count': metrics.length } as React.CSSProperties}>
    {metrics.map(m => <Figure key={m.key} m={m} />)}
  </dl>
);
