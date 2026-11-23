/**
 * 2026-09-18 Gate Configuration redesign: the configuration a loop actually runs under, READ rather than
 * dumped. The layer stack (FACTORY → PROFILE → SITE → LOOP) says what each layer sets and where it comes
 * from; the gate dropdown says how many of each gate's properties a layer above FACTORY sets; one gate's
 * table shows at a time; a search crosses gates; the workers fold to one line with a tone. CHG-184: no hash,
 * jar or run bundle (the Workbench's "Configuration used by this run" went).
 * Read-only: every value is the server's resolution.
 * CHG-220 (gap 2): a part that runs another version than the one named here (a deployment stopped half way) says which.
 * CHG-224: plain words - a setting by name (the code only in its title), "From" as Factory / Loop type / Plant / This loop, a dash for no value.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, KvRow, PanelHead, TonePill } from '../shared';
import type { CatalogueEntry, EffectiveConfig, ScopeKind } from '../../../api/cpm/config';
import { layerStack, overridesByGate, runsElsewhere, valueText } from './configSupport';
import { levelWord, stateWord, versionLabel } from './levelWords';
import { settingName, sourceWord } from './configWords';
import { Toggletip } from '../../../ui/Toggletip';
import { EffectivePropertyDialog, classTone } from './EffectivePropertyDialog';

const GATE_ORDER = ['G0', 'G1', 'G2', 'G2r', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14', 'G15'];
/** A part in plain words: the engines by what they do, any other by its name without the product prefixes. */
const PART: Array<[RegExp, string]> = [[/short feature/i, 'Short checks'], [/long feature/i, 'Long checks'], [/fusion/i, 'Verdicts'], [/response/i, 'System response']];
export const partName = (job: string): string => PART.find(([re]) => re.test(job))?.[1] ?? (job.replace(/^AMS - /, '').replace(/^CPLM /, '') || job);

const gateRank = (g: string) => { const i = GATE_ORDER.indexOf(g); return i < 0 ? 99 : i; };

export interface EffectiveViewProps {
  eff: EffectiveConfig;
  /** The catalogue, when loaded: adds the change class per row. */
  catalogue?: Map<string, CatalogueEntry>;
  /** A drawer inside another page: no layer stack, the table only. */
  compact?: boolean;
  /** Opens the worker acknowledgements (the Worker alignment tile leads here). */
  openWorkersSignal?: number;
}

export const EffectiveView: React.FC<EffectiveViewProps> = ({ eff, catalogue, compact, openWorkersSignal }) => {
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState<string | null>(null);
  const workersBox = useRef<HTMLDetailsElement>(null);
  // every tile click opens it, whatever state the user left it in; its own toggle stays the user's
  useEffect(() => { if (openWorkersSignal && workersBox.current) workersBox.current.open = true; }, [openWorkersSignal]);
  const gates = useMemo(() => overridesByGate(eff), [eff]);
  const gateKeys = useMemo(() => Object.keys(gates).sort((a, b) => gateRank(a) - gateRank(b)), [gates]);
  const [picked, setPicked] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const matching = useMemo(() => Object.keys(eff.properties).filter(k => !q || k.toLowerCase().includes(q) || settingName(k).toLowerCase().includes(q)).sort(), [eff.properties, q]);
  const visibleGates = q ? gateKeys.filter(g => matching.some(k => k.startsWith(`${g}.`))) : gateKeys;
  const gate = q ? null : (picked && gates[picked] ? picked : gateKeys[0] ?? null);
  const rows = (gate ? matching.filter(k => k.startsWith(`${gate}.`)) : matching);
  const stack = useMemo(() => layerStack(eff), [eff]);

  return (
    <div className="cpm-config-effective" data-testid="effective-config">
      {!compact && (
        <>
          <PanelHead title="Where each value comes from"
            help={<Toggletip variant="how-to" label="How the layers combine"><p>A layer above sets a property, or leaves the one below.</p></Toggletip>} />
          <ol className="cpm-config-layers" aria-label="Layers">
            {stack.map(l => (
              <li key={l.kind} className={`cpm-config-layer${l.present ? '' : ' cpm-config-layer--absent'}`} data-layer={l.kind}>
                <span className="cpm-config-layer__kind">{levelWord(l.kind)}</span>
                <span className="cpm-config-layer__ref cpm-mono">{l.ref}</span>
                <span className="cpm-config-layer__count">{l.kind === 'FACTORY' ? `${l.count} properties` : l.present ? `${l.count} override${l.count === 1 ? '' : 's'}` : '—'}</span>
                <span className="cpm-event-row__sub">{l.origin}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="cpm-config-effective__bar">
        <select className="cpm-select" aria-label="Gate" value={gate ?? ''}
          onChange={e => { if (e.target.value) { setQuery(''); setPicked(e.target.value); } }}>
          {q && <option value="">All matching gates</option>}
          {visibleGates.map(g => (
            <option key={g} value={g}>{g}{gates[g].overridden > 0 ? ` · ${gates[g].overridden} set above factory` : ''}</option>
          ))}
        </select>
        <input type="search" className="cpm-input" aria-label="Find a setting" placeholder="Find a setting" value={query} onChange={e => setQuery(e.target.value)} />
      </div>

      {rows.length === 0 ? <EmptyState title="No setting matches" copy={q ? `Nothing in this loop's configuration matches "${query}".` : 'The effective block is empty for this gate.'} /> : (
        <table className="cpm-table cpm-config-table" aria-label="Effective properties">
          <thead><tr><th>Setting</th><th>Value</th><th>From</th></tr></thead>
          <tbody>
            {rows.map(k => {
              const src = eff.sources[k] ?? '—';
              const entry = catalogue?.get(k);
              return (
                <tr key={k} data-source={src}>
                  <td>
                    <button type="button" className="ui-link" aria-haspopup="dialog" title={k} onClick={() => setOpened(k)}>{settingName(k)}</button>
                    {entry ? <span className="cpm-config-property__meta cpm-config-table__from"><TonePill tone={classTone(entry.changeClass)}>{entry.changeClass}</TonePill></span> : null}
                  </td>
                  <td className="cpm-mono">{valueText(eff.properties[k])}</td>
                  <td className={eff.sources[k] && eff.sources[k] !== 'NO_VALUE' ? undefined : 'cpm-muted'}>{sourceWord(src)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {runsElsewhere(eff) && <p className="cpm-field__error" role="status">Some parts run another version: {runsElsewhere(eff)!.text}</p>}
      <details className="cpm-config-workers" id="config-workers" ref={workersBox}>
        <summary>Where it runs</summary>
        <table className="cpm-table" data-table="effective-workers">
          <thead><tr><th>Part</th><th>applied</th></tr></thead>
          <tbody>
            {eff.workers.map(w => (
              <tr key={w.jobName}>
                <td>{partName(w.jobName)}{w.runs && w.runs.bundleId !== eff.bundle?.bundleId && w.required !== false ? <div className="cpm-event-row__sub">runs {versionLabel(w.runs as { scopeKind: ScopeKind; version: number })}</div> : null}</td>
                <td>{w.required === false ? <span className="cpm-muted">Reads no setting</span> : w.ack ? <><TonePill tone={w.ack.status === 'ACK' ? 'good' : 'bad'}>{w.ack.status === 'ACK' ? 'Ready' : 'Refused'}</TonePill>{eff.bundle && w.ack.bundleHash !== eff.bundle.contentHash ? ' for another version' : ''}</> : eff.bundle ? <TonePill tone="muted">Not confirmed yet</TonePill> : <span className="cpm-copy">Factory settings</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {eff.bundle && <KvRow label="Version">{versionLabel(eff.bundle)} · {stateWord(eff.state)}</KvRow>}
      </details>
      {opened && eff.properties[opened] !== undefined && (
        <EffectivePropertyDialog property={opened} value={eff.properties[opened]} source={eff.sources[opened] ?? '—'} entry={catalogue?.get(opened)} onClose={() => setOpened(null)} />
      )}
    </div>
  );
};
