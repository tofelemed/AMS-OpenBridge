/**
 * 2026-09-18 Gate Configuration redesign: the configuration a loop actually runs under, READ rather than
 * dumped. The layer stack (FACTORY → PROFILE → SITE → LOOP) says what each layer sets and where it comes
 * from; the gate strip carries a badge with the properties a layer above FACTORY overrides; one gate's
 * table shows at a time; a search crosses gates; the workers fold to one line with a tone. Opened from a
 * gate result it names the bundle THAT run carried and says plainly when it is not the one active today.
 * Read-only: every value is the server's resolution.
 */
import React, { useMemo, useState } from 'react';
import { EmptyState, KvRow, PanelHead, TonePill, fmtDateTime } from '../shared';
import type { CatalogueEntry, EffectiveConfig } from '../../../api/cpm/config';
import { bundleLabel, isLayerSource, layerStack, overridesByGate, shortHash, valueText, workersSummary } from './configSupport';

const GATE_ORDER = ['G0', 'G1', 'G2', 'G2r', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14', 'G15'];
const gateRank = (g: string) => { const i = GATE_ORDER.indexOf(g); return i < 0 ? 99 : i; };
const classTone = (c: string | undefined) => (c === 'DEPLOYMENT' ? 'bad' : c === 'STATE_BOUNDARY' ? 'warn' : 'muted');

export interface EffectiveViewProps {
  eff: EffectiveConfig;
  /** From a gate result: the bundle that run carried; a mismatch with today's is an alert. */
  runBundleHash?: string | null;
  /** Open on this gate (a G-key) instead of the first one. */
  initialGate?: string;
  /** The catalogue, when loaded: adds the change class per row. */
  catalogue?: Map<string, CatalogueEntry>;
  /** A drawer inside another page: no layer stack, the table only. */
  compact?: boolean;
}

export const EffectiveView: React.FC<EffectiveViewProps> = ({ eff, runBundleHash, initialGate, catalogue, compact }) => {
  const [query, setQuery] = useState('');
  const gates = useMemo(() => overridesByGate(eff), [eff]);
  const gateKeys = useMemo(() => Object.keys(gates).sort((a, b) => gateRank(a) - gateRank(b)), [gates]);
  const [picked, setPicked] = useState<string | null>(initialGate && gates[initialGate] ? initialGate : null);
  const q = query.trim().toLowerCase();
  const matching = useMemo(() => Object.keys(eff.properties).filter(k => !q || k.toLowerCase().includes(q)).sort(), [eff.properties, q]);
  const visibleGates = q ? gateKeys.filter(g => matching.some(k => k.startsWith(`${g}.`))) : gateKeys;
  const gate = q ? null : (picked && gates[picked] ? picked : gateKeys[0] ?? null);
  const rows = (gate ? matching.filter(k => k.startsWith(`${gate}.`)) : matching);
  const stack = useMemo(() => layerStack(eff), [eff]);
  const workers = workersSummary(eff);
  const runDiffers = !!runBundleHash && (eff.bundle ? eff.bundle.contentHash !== runBundleHash : !runBundleHash.startsWith('profile:') && runBundleHash !== 'legacy');

  return (
    <div className="cpm-config-effective" data-testid="effective-config">
      {runBundleHash && (
        <p className={runDiffers ? 'cpm-field__error' : 'cpm-copy'} role={runDiffers ? 'alert' : undefined} data-testid="run-bundle-note">
          {runDiffers
            ? `The selected result was computed under bundle ${shortHash(runBundleHash, 16)}, which is NOT the configuration active for this loop today; the values below are what runs now, not what that result used.`
            : `The selected result was computed under this configuration (${shortHash(runBundleHash, 16)}).`}
        </p>
      )}
      {!eff.bundle && eff.note && <p className="cpm-copy">{eff.note}</p>}

      {!compact && (
        <>
          <PanelHead eyebrow="How the values resolve" title="Layer stack" right={<span className="cpm-copy">a layer above sets a property, or leaves the one below</span>} />
          <ol className="cpm-config-layers" aria-label="Layers">
            {stack.map(l => (
              <li key={l.kind} className={`cpm-config-layer${l.present ? '' : ' cpm-config-layer--absent'}`} data-layer={l.kind}>
                <span className="cpm-config-layer__kind">{l.kind}</span>
                <span className="cpm-config-layer__ref cpm-mono">{l.ref}</span>
                <span className="cpm-config-layer__count">{l.kind === 'FACTORY' ? `${l.count} properties` : l.present ? `${l.count} override${l.count === 1 ? '' : 's'}` : '—'}</span>
                <span className="cpm-event-row__sub">{l.origin}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="cpm-config-effective__bar">
        <div className="cpm-config-gates" role="tablist" aria-label="Gate">
          {visibleGates.map(g => (
            <button key={g} type="button" role="tab" aria-selected={g === gate} className={`cpm-config-gate${g === gate ? ' cpm-config-gate--selected' : ''}`} onClick={() => { setQuery(''); setPicked(g); }}>
              {g}{gates[g].overridden > 0 && <span className="cpm-config-gate__badge" title={`${gates[g].overridden} of ${gates[g].total} set above the factory layer`}> {gates[g].overridden}</span>}
            </button>
          ))}
        </div>
        <label className="cpm-field cpm-field--compact">
          <span className="cpm-field__label">Find a property</span>
          <input type="search" className="cpm-input" aria-label="Find a property" placeholder="e.g. noise, coverage" value={query} onChange={e => setQuery(e.target.value)} />
        </label>
      </div>

      {rows.length === 0 ? <EmptyState title="No property matches" copy={q ? `Nothing in this loop's configuration matches "${query}".` : 'The effective block is empty for this gate.'} /> : (
        <table className="cpm-table cpm-config-table" aria-label="Effective properties">
          <thead><tr><th>property</th><th>value</th><th>from</th><th>class</th></tr></thead>
          <tbody>
            {rows.map(k => {
              const src = eff.sources[k] ?? '—';
              const entry = catalogue?.get(k);
              return (
                <tr key={k} data-source={src}>
                  <td><span className="cpm-mono">{k}</span>{entry ? <span className="cpm-config-property__meta cpm-config-table__from">{entry.id} · {entry.unit || entry.type}</span> : null}</td>
                  <td className="cpm-mono">{valueText(eff.properties[k])}</td>
                  <td>{isLayerSource(src) ? <TonePill tone={src === 'FACTORY' ? 'muted' : 'good'}>{src}</TonePill> : <span className="cpm-muted">unset</span>}</td>
                  <td>{entry ? <TonePill tone={classTone(entry.changeClass)}>{entry.changeClass}</TonePill> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <details className="cpm-config-workers">
        <summary><TonePill tone={workers.tone}>{workers.text}</TonePill> <span className="cpm-event-row__sub">APPLY acknowledgements</span></summary>
        <table className="cpm-table" data-table="effective-workers">
          <thead><tr><th>job</th><th>jar</th><th>catalogue</th><th>applied</th></tr></thead>
          <tbody>
            {eff.workers.map(w => (
              <tr key={w.jobName}>
                <td>{w.jobName}</td><td className="cpm-mono">{shortHash(w.jarSha256, 8)}</td><td className="cpm-mono">{shortHash(w.catalogueHash, 8)}</td>
                <td>{w.required === false ? <span className="cpm-muted">observer · reads no property</span> : w.ack ? <><TonePill tone={w.ack.status === 'ACK' ? 'good' : 'bad'}>{w.ack.status}</TonePill> <span className="cpm-mono">{shortHash(w.ack.bundleHash, 8)}</span></> : eff.bundle ? <TonePill tone="muted">no ACK recorded</TonePill> : <span className="cpm-copy">factory layer</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {eff.bundle && <KvRow label="bundle">{bundleLabel(eff.bundle)} · {eff.bundle.changeClass} · effective {eff.bundle.effectiveFrom ? fmtDateTime(eff.bundle.effectiveFrom) : '—'}</KvRow>}
      </details>
    </div>
  );
};
