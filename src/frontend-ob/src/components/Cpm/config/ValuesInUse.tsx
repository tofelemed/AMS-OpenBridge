/**
 * Values in use (Gate Configuration journey, Task 6): the settings a scope runs under - Setting, Value, From - one gate at a
 * time, or every gate when the person searches. The property code is only in the row's title.
 * CHG-224 (owner decisions D1-D6): only what can be changed here is listed. A loop page reads the server's `entries` (EDITABLE and
 * DECISION); a type or plant page has no entries and keeps the catalogue's `editable` properties. A value worked out by the
 * system reads "Worked out automatically" with its basis on hover; a decision reads "Not decided" and "Needs a decision".
 */
import React, { useMemo, useState } from 'react';
import { EmptyState } from '../shared';
import { gateName } from '../gateStatus';
import type { CatalogueEntry, EffectiveConfig, EffectiveEntry } from '../../../api/cpm/config';
import { runsElsewhere, valueText } from './configSupport';
import { GATES } from './configLists';
import { enumWords, numberText, pvScaledBasis, settingName, sourceWord } from './configWords';

/** A value for the table: a dash when there is none, a fraction property reads as a percent, a unit follows a number. */
export function displayValue(property: string, v: unknown, unit?: string | null): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number' && property.endsWith('_fraction')) return `${numberText(v * 100)} %`;
  if (typeof v === 'number') return unit ? `${numberText(v)} ${unit}` : numberText(v);
  return typeof v === 'string' ? enumWords(valueText(v)) : valueText(v);
}

const gateRank = (g: string) => { const i = GATES.indexOf(g); return i < 0 ? GATES.length : i; };

interface Row { key: string; value: string; from: string; basis: string | null; muted: boolean; valueBasis?: string | null }

/** A row from the server's entry (loop page). */
function entryRow(e: EffectiveEntry): Row {
  if (e.kind === 'DECISION' && e.configured == null) {
    return { key: e.property, value: (e.basis ?? 'Not decided').replace(' - ', ' — '), from: 'Needs a decision', basis: null, muted: false };
  }
  const worked = e.configured == null;
  return {
    key: e.property, value: e.value == null && e.basis ? e.basis : displayValue(e.property, e.value, e.unit),
    from: worked ? sourceWord(null) : sourceWord(e.level), basis: e.basis ?? null, muted: worked,
  };
}

/** A row from the resolved values (type and plant pages). */
const resolvedRow = (key: string, eff: Pick<EffectiveConfig, 'properties' | 'sources'>): Row =>
  ({ key, value: displayValue(key, eff.properties[key]), from: sourceWord(eff.sources[key]), basis: null, muted: !eff.sources[key], valueBasis: pvScaledBasis(key, eff.properties[key]) });

export const ValuesInUse: React.FC<{
  eff: Pick<EffectiveConfig, 'properties' | 'sources'> & Partial<Pick<EffectiveConfig, 'entries' | 'workers' | 'bundle'>>;
  catalogue?: Map<string, CatalogueEntry>;
  gate: string | null;
  onGate: (gate: string) => void;
}> = ({ eff, catalogue, gate, onGate }) => {
  const [query, setQuery] = useState('');
  const elsewhere = useMemo(() => (eff.workers ? runsElsewhere({ ...eff, workers: eff.workers, bundle: eff.bundle ?? null } as EffectiveConfig) : null), [eff]);
  // catalogue order (the Map keeps it); a property the catalogue lacks goes last
  const all = useMemo<Row[]>(() => {
    const rank = new Map([...(catalogue?.keys() ?? [])].map((k, i) => [k, i]));
    const byOrder = (a: Row, b: Row) => (rank.get(a.key) ?? 1e9) - (rank.get(b.key) ?? 1e9);
    if (eff.entries) return eff.entries.filter(e => e.editable).map(entryRow).sort(byOrder);
    return Object.keys(eff.properties).filter(k => catalogue?.get(k)?.editable !== false).map(k => resolvedRow(k, eff)).sort(byOrder);
  }, [eff, catalogue]);
  const gates = useMemo(() => [...new Set(all.map(r => r.key.split('.')[0]))].sort((a, b) => gateRank(a) - gateRank(b) || a.localeCompare(b)), [all]);
  const q = query.trim().toLowerCase();
  const openGate = gate && gates.includes(gate) ? gate : gates[0] ?? null;
  const rows = q ? all.filter(r => r.key.toLowerCase().includes(q) || settingName(r.key).toLowerCase().includes(q)) : all.filter(r => r.key.startsWith(`${openGate}.`));
  const matchingGates = q ? new Set(rows.map(r => r.key.split('.')[0])) : null;

  return (
    <div className="cpm-config-values">
      {elsewhere && <p className="cpm-copy">Some parts run another version: {elsewhere.text}</p>}
      <div className="cpm-compact cpm-config-filters" role="group" aria-label="Setting filters">
        <select className="cpm-select" aria-label="Gate" value={q ? '' : openGate ?? ''}
          onChange={e => { if (e.target.value) { setQuery(''); onGate(e.target.value); } }}>
          {q && <option value="">All matching gates</option>}
          {gates.filter(g => !matchingGates || matchingGates.has(g)).map(g => <option key={g} value={g}>{gateName(g)}</option>)}
        </select>
        <input type="search" className="cpm-input" aria-label="Find a setting" placeholder="Find a setting" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      {rows.length === 0 ? (
        q ? <EmptyState title={`No setting matches “${query.trim()}”`} action={{ label: 'Clear search', onClick: () => setQuery('') }} />
          : <EmptyState title="No settings here" />
      ) : (
        <table className="cpm-table" aria-label="Values in use">
          <thead><tr><th>Setting</th><th>Value</th><th>From</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} title={r.key}>
                <td>{settingName(r.key)}</td>
                <td title={r.valueBasis ?? undefined}>{r.value}</td>
                <td className={r.muted ? 'cpm-muted' : undefined} title={r.basis ?? undefined}>{r.from}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ValuesInUse;
