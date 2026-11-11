/**
 * CHG-169 (owner review, the approved sample): a bundle's Properties tab. Search first ("Property", it crosses gates), then ONE
 * gate dropdown in place of the 17 gate chips ("G4 · Actuator effort", "· 1 invalid" in its option); the gate's properties in
 * catalogue order; the selected property's editor in the panel beside the list (a drawer below 1280 px) - it was the row that
 * expanded. Every edit is the same PATCH as before (one op, the bundle's etag), sent by the editor's owner.
 */
import React, { useMemo, useState } from 'react';
import { EmptyState } from '../shared';
import { Inspector } from '../../../ui/Inspector';
import type { Bundle, CatalogueEntry, PatchOp } from '../../../api/cpm/config';
import { PropertyTable } from './PropertyTable';
import { PropertyForm } from './PropertyForm';
import { bundleGateOptions, errorsFor, invalidByGate } from './configLists';

export interface PropertiesTabProps {
  bundle: Bundle;
  /** The catalogue's properties, in catalogue order. */
  entries: CatalogueEntry[];
  gate: string;
  onGate: (gate: string) => void;
  editable: boolean;
  pending: boolean;
  onOp: (op: PatchOp) => void;
  /** Under the list: the tab's Next. */
  foot?: React.ReactNode;
}

export const PropertiesTab: React.FC<PropertiesTabProps> = ({ bundle, entries, gate, onGate, editable, pending, onOp, foot }) => {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const errors = useMemo(() => bundle.validation?.errors ?? [], [bundle.validation]);
  const options = useMemo(() => bundleGateOptions(invalidByGate(entries, errors)), [entries, errors]);
  const q = query.trim().toLowerCase();
  const rows = useMemo(() => (q ? entries.filter(e => e.property.toLowerCase().includes(q)) : entries.filter(e => e.gate === gate)), [entries, gate, q]);
  const matchingGates = q ? new Set(rows.map(r => r.gate)) : null;
  const selected = rows.find(r => r.property === chosen) ?? rows[0];
  const select = (property: string) => { setChosen(property); setDrawer(true); };

  return (
    <div className="cpm-master-detail">
      <section className="cpm-surface cpm-config-list" aria-label="Properties">
        <div className="cpm-compact cpm-config-filters" role="group" aria-label="Property filters">
          <input type="search" className="cpm-input" aria-label="Find a property" placeholder="Property" value={query} onChange={e => setQuery(e.target.value)} />
          <select className="cpm-select" aria-label="Gate" value={q ? '' : gate} onChange={e => { if (e.target.value) { setQuery(''); onGate(e.target.value); } }}>
            {q && <option value="">All matching gates</option>}
            {options.filter(o => !matchingGates || matchingGates.has(o.value)).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {rows.length > 0 && <PropertyTable entries={rows} bundle={bundle} selected={selected?.property ?? null} fullKeys={!!q} onSelect={select} />}
        {rows.length === 0 && (q
          ? <EmptyState title={`No property matches “${query.trim()}”`} action={{ label: 'Clear search', onClick: () => setQuery('') }} />
          : <p className="cpm-copy">The catalogue has no property for this gate.</p>)}
        {foot}
      </section>
      {selected && (
        <Inspector title={selected.property} meta={<span className="cpm-mono">{selected.id}</span>} open={drawer} onClose={() => setDrawer(false)}>
          <PropertyForm key={selected.property} entry={selected} layers={bundle.layers} scopeKind={bundle.scopeKind}
            effective={bundle.resolved.properties[selected.property]} source={bundle.resolved.sources[selected.property]}
            errors={errorsFor(errors, selected.property)} editable={editable} pending={pending} onOp={onOp} />
        </Inspector>
      )}
    </div>
  );
};

export default PropertiesTab;
