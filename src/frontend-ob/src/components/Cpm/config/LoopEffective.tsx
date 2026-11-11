/**
 * Effective with a loop: where each value of this loop comes from (2026-09-18: the resolved configuration, READ rather than
 * dumped; every value is the server's resolution).
 * CHG-169 (owner review, the approved sample docs/theme/redesign/samples/gate-configuration-proposal.html): one layer strip
 * (FACTORY · PROFILE · SITE · LOOP, the bundle's version and state in its own cell) in place of the three tiles and the four
 * layer cards; search first ("Property", it crosses gates), then the gate dropdown ("G4 · Actuator effort · 3 set above
 * factory"); rows of the name over its class, the value with its unit, the source in words, in catalogue order (they were
 * alphabetical while the editor kept catalogue order). The selected property opens in the panel beside the list (a drawer below
 * 1280 px), in place of the property dialog. The foot says the workers in one line and opens Workers. `?gate=` opens that gate.
 */
import React, { useMemo, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, KvRow, TonePill, type CpmTone } from '../shared';
import { Inspector } from '../../../ui/Inspector';
import { Toggletip } from '../../../ui/Toggletip';
import { codeLabel } from '../vocabulary';
import type { CatalogueEntry, ConfigCatalogue, EffectiveConfig } from '../../../api/cpm/config';
import { layerStack, workerAlignment } from './configSupport';
import { sourceFull, sourceShort, valueWithUnit, valueWords } from './configWords';
import { catalogueOrder, effectiveGateOptions } from './configLists';
import { BundleStatePill, Breakable, ClassWord } from './configBits';
import { shortKey } from './PropertyTable';
import { WorkersDialog } from './WorkersDialog';

const TONE_GLYPH: Record<CpmTone, string> = { good: '✓', warn: '!', bad: '✕', muted: '○' };

/** The layers bottom-up, each once: what it is, and what it sets. */
const LayerStrip: React.FC<{ eff: EffectiveConfig }> = ({ eff }) => (
  <ol className="cpm-config-strip" aria-label="Layers">
    {layerStack(eff).map(l => {
      const bundleHere = eff.bundle && eff.bundle.scopeKind === l.kind ? eff.bundle : null;
      const what = l.kind === 'FACTORY' ? 'Shipped defaults'
        : bundleHere ? <span className="cpm-config-inline"><span>v{bundleHere.version}</span><BundleStatePill state={eff.state} /></span>
        : l.kind === 'LOOP' ? 'no bundle' : l.kind === 'PROFILE' ? codeLabel(l.ref) : l.ref;
      const count = l.kind === 'FACTORY' ? `${l.count} properties` : l.present ? `${l.count} override${l.count === 1 ? '' : 's'}` : l.kind === 'SITE' ? 'no bundle' : '—';
      return (
        <li key={l.kind} className={`cpm-config-strip__layer${l.present ? '' : ' cpm-config-strip__layer--absent'}`} data-layer={l.kind}>
          <span className="cpm-config-strip__kind">{l.kind}</span>
          <span className="cpm-config-strip__what">{what}</span>
          <span className="cpm-event-row__sub">{count}</span>
        </li>
      );
    })}
  </ol>
);

const PropertyPanel: React.FC<{ eff: EffectiveConfig; property: string; entry: CatalogueEntry | undefined; open: boolean; onClose: () => void }> = ({ eff, property, entry, open, onClose }) => (
  <Inspector title={property} meta={entry ? <span className="cpm-mono">{entry.id}</span> : undefined} open={open} onClose={onClose}>
    <KvRow label="Value"><span className="cpm-mono">{entry ? valueWithUnit(eff.properties[property], entry.unit) : valueWords(eff.properties[property])}</span></KvRow>
    <KvRow label="Source">{sourceFull(eff.sources[property], eff.bundle, eff.profileId)}</KvRow>
    {!entry && <p className="cpm-copy">The catalogue is not loaded, so class, id and unit are not shown.</p>}
    {entry && (
      <>
        <div className="cpm-kv">
          <span className="cpm-kv__label cpm-title-row">Class<Toggletip variant="how-to" label="Change class"><p>Policy and State boundary are explained in How to read.</p></Toggletip></span>
          <span className="cpm-kv__value"><ClassWord changeClass={entry.changeClass} /></span>
        </div>
        <KvRow label="Unit">{entry.unit || '—'}</KvRow>
        <KvRow label="Type">{entry.type}</KvRow>
        <KvRow label="Factory default"><span className="cpm-mono">{valueWithUnit(entry.default, entry.unit)}</span></KvRow>
        {entry.effect && <KvRow label="What it does">{entry.effect}</KvRow>}
        {entry.notReadByBuild && <KvRow label="Not read by this build">{entry.notReadByBuild}</KvRow>}
      </>
    )}
  </Inspector>
);

export const LoopEffective: React.FC<{
  eff: EffectiveConfig;
  catalogue: ConfigCatalogue | undefined;
  /** `?gate=`: the gate to open on; the first gate when absent or not in this loop's configuration. */
  gate: string | null;
  onGate: (gate: string) => void;
}> = ({ eff, catalogue, gate, onGate }) => {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [workersOpen, setWorkersOpen] = useState(false);
  const entries = catalogue?.properties;
  const byKey = useMemo(() => new Map((entries ?? []).map(e => [e.property, e])), [entries]);
  const options = useMemo(() => effectiveGateOptions(eff), [eff]);
  const ordered = useMemo(() => catalogueOrder(Object.keys(eff.properties), entries), [eff.properties, entries]);
  const q = query.trim().toLowerCase();
  const openGate = gate && options.some(o => o.value === gate) ? gate : options[0]?.value ?? null;
  const rows = q ? ordered.filter(k => k.toLowerCase().includes(q)) : ordered.filter(k => k.startsWith(`${openGate}.`));
  const matchingGates = q ? new Set(rows.map(k => k.split('.')[0])) : null;
  const selected = rows.find(k => k === chosen) ?? rows[0];
  const select = (k: string) => { setChosen(k); setDrawer(true); };
  const workers = workerAlignment(eff);

  return (
    <div className="cpm-master-detail">
      <section className="cpm-surface cpm-config-list cpm-config-list--foot" aria-label="Effective properties">
        <LayerStrip eff={eff} />
        <div className="cpm-compact cpm-config-filters" role="group" aria-label="Property filters">
          <input type="search" className="cpm-input" aria-label="Find a property" placeholder="Property" value={query} onChange={e => setQuery(e.target.value)} />
          <select className="cpm-select" aria-label="Gate" value={q ? '' : openGate ?? ''} onChange={e => { if (e.target.value) { setQuery(''); onGate(e.target.value); } }}>
            {q && <option value="">All matching gates</option>}
            {options.filter(o => !matchingGates || matchingGates.has(o.value)).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {rows.length > 0 && (
          <table className="cpm-table cpm-config-rows" aria-label="Effective properties">
            <thead><tr><th>Property</th><th>Value</th><th>Source</th></tr></thead>
            <tbody>
              {rows.map(k => {
                const entry = byKey.get(k);
                const isSelected = k === selected;
                const src = sourceShort(eff.sources[k], eff.bundle);
                return (
                  <tr key={k} data-source={eff.sources[k] ?? '—'} className={`cpm-reg-row${isSelected ? ' cpm-reg-row--selected' : ''}`} aria-current={isSelected ? 'true' : undefined} onClick={() => select(k)}>
                    <td>
                      <button type="button" className="cpm-config-rowbtn cpm-mono" aria-label={q ? k : shortKey(k)} title={k} onClick={e => { e.stopPropagation(); select(k); }}>
                        <Breakable name={q ? k : shortKey(k)} />
                      </button>
                      {entry && <div className="cpm-event-row__sub"><ClassWord changeClass={entry.changeClass} /></div>}
                    </td>
                    <td>{entry ? valueWithUnit(eff.properties[k], entry.unit) : valueWords(eff.properties[k])}</td>
                    <td className={src === 'Unset' ? 'cpm-muted' : undefined}>{src}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {rows.length === 0 && (q
          ? <EmptyState title={`No property matches “${query.trim()}”`} action={{ label: 'Clear search', onClick: () => setQuery('') }} />
          : <EmptyState title="No property matches" copy="The effective block is empty for this gate." />)}
        <div className="cpm-config-foot">
          <span className="cpm-config-inline">
            <span>Workers</span>
            <TonePill tone={workers.tone} glyph={TONE_GLYPH[workers.tone]}>{workers.value}</TonePill>
            <span className="cpm-copy">· {workers.sub}</span>
          </span>
          <ObcButton variant="flat" onClick={() => setWorkersOpen(true)}>Workers</ObcButton>
        </div>
      </section>
      {selected && <PropertyPanel eff={eff} property={selected} entry={byKey.get(selected)} open={drawer} onClose={() => setDrawer(false)} />}
      <WorkersDialog eff={eff} catalogue={catalogue} open={workersOpen} onClose={() => setWorkersOpen(false)} />
    </div>
  );
};

export default LoopEffective;
