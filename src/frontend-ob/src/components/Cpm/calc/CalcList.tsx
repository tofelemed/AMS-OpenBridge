/**
 * Task 20: the calculation list. Calculation (name, then `CPLM-010 · G3` under it), Value / unit, Gate result. The ID and
 * Gate columns went: the id and gate are under the name. All 19 stay, with no paging. A row only selects: what it shows
 * is in the right column.
 */
import React from 'react';
import { GateBadge } from '../../../ui/GateBadge';
import type { CalcSortKey } from '../calcSort';
import { valueText, type MetricView } from './calcView';

export const CalcList: React.FC<{
  rows: MetricView[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  /** The sortable heading for a key. */
  head: (key: CalcSortKey, label: string, title?: string) => React.ReactNode;
}> = ({ rows, selectedId, onSelect, head }) => (
  <>
    <div className="cpm-event-head cpm-calc-list__row cpm-table-head--sticky">
      <span className="cpm-calc-list__heads">{head('name', 'Calculation')}{head('id', 'ID')}</span>
      <span>Value / unit</span>
      {head('status', 'Gate result', 'The result of the gate that judges this calculation, on the same window. Sorts needing attention first.')}
    </div>
    <div role="list" aria-label="Calculations">
      {rows.map(({ metric, value, na, status }) => {
        const selected = metric.id === selectedId;
        const pick = () => onSelect(metric.id);
        return (
          <div key={metric.id} role="listitem">
            <div className={`cpm-event-row cpm-event-row--dense cpm-calc-list__row${selected ? ' cpm-event-row--selected' : ''}`}
              role="button" tabIndex={0} aria-current={selected ? 'true' : undefined}
              onClick={pick}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}>
              <span>
                <span className="cpm-event-row__title">{metric.name}</span>
                <div className="cpm-event-row__sub">{`${metric.id} · ${metric.gate}`}</div>
              </span>
              <span>
                {na ? (
                  <>
                    <span className="cpm-metric-na">{na.short}</span>
                    {na.reason && <div className="cpm-event-row__sub">{na.reason}</div>}
                  </>
                ) : value != null ? valueText(metric, value) : null}
              </span>
              <span><GateBadge status={status.code} gate={metric.gate} /></span>
            </div>
          </div>
        );
      })}
    </div>
  </>
);

export default CalcList;
