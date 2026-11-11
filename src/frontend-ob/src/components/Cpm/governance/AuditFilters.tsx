/**
 * CHG-174 (owner review, badge 3, and answers 1, 2, 4): the trail's one 32 px filter row inside the card: Find first, then the
 * exact user name, All entities, All events and the time range (added, answer 2; Custom range shows From and To). The dropdowns
 * are named by their options (labels for screen readers); they were four labelled 40 px fields and a lone ?. Entity and Event
 * type offer every type the services record; with an entity chosen, Event type offers only that entity's events.
 */
import React from 'react';
import { ENTITIES, eventsFor } from './auditCatalog';
import { RANGES, type RangeKey } from './auditTime';

export interface FilterState {
  search: string; user: string; entityType: string; eventType: string; range: RangeKey; fromDay: string; toDay: string;
}

export const NO_FILTERS: FilterState = { search: '', user: '', entityType: '', eventType: '', range: 'all', fromDay: '', toDay: '' };

const entityMany = new Map(ENTITIES.map(e => [e.code, e.many]));

export const AuditFilters: React.FC<{ value: FilterState; onChange: (next: Partial<FilterState>) => void }> = ({ value: f, onChange }) => {
  const events = eventsFor(f.entityType);
  const groups = f.entityType ? [[f.entityType, events] as const] : ENTITIES.map(e => [e.code, eventsFor(e.code)] as const);
  return (
    <div className="cpm-compact cpm-admin-filters cpm-gov-filters" role="group" aria-label="Audit filters">
      <input className="cpm-input cpm-gov-filters__find" type="search" autoComplete="off" aria-label="Find event" placeholder="Actor, action, entity"
        value={f.search} onChange={e => onChange({ search: e.target.value })} />
      <input className="cpm-input cpm-gov-filters__user" autoComplete="off" aria-label="User" placeholder="Exact user name"
        value={f.user} onChange={e => onChange({ user: e.target.value })} />
      <select className="cpm-select cpm-gov-filters__select" aria-label="Entity" value={f.entityType}
        onChange={e => {
          const entityType = e.target.value;
          const keep = !entityType || eventsFor(entityType).some(x => x.code === f.eventType);
          onChange({ entityType, ...(keep ? {} : { eventType: '' }) });
        }}>
        <option value="">All entities</option>
        {ENTITIES.map(e => <option key={e.code} value={e.code}>{e.many}</option>)}
      </select>
      <select className="cpm-select cpm-gov-filters__select" aria-label="Event type" value={f.eventType} onChange={e => onChange({ eventType: e.target.value })}>
        <option value="">All events</option>
        {groups.map(([entity, list]) => (
          <optgroup key={entity} label={entityMany.get(entity) ?? entity}>
            {list.map(x => <option key={x.code} value={x.code}>{x.label}</option>)}
          </optgroup>
        ))}
      </select>
      <select className="cpm-select cpm-gov-filters__range" aria-label="Time range" value={f.range} onChange={e => onChange({ range: e.target.value as RangeKey })}>
        {RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
      </select>
      {f.range === 'custom' && (
        <span className="cpm-gov-filters__days">
          <input className="cpm-input" type="date" aria-label="From" value={f.fromDay} max={f.toDay || undefined} onChange={e => onChange({ fromDay: e.target.value })} />
          <span aria-hidden>–</span>
          <input className="cpm-input" type="date" aria-label="To" value={f.toDay} min={f.fromDay || undefined} onChange={e => onChange({ toDay: e.target.value })} />
        </span>
      )}
    </div>
  );
};

export default AuditFilters;
