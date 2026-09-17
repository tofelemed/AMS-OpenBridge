/**
 * v2.5 Task 3D.1 (spec §5.7, §3.3): the configuration a loop actually runs under - the active
 * bundle of its most specific scope (or the factory layer when none is active), every property
 * with the layer it came from, and the workers' APPLY acknowledgements. Read-only. Opened from a
 * gate result it names the bundle THAT run carried and says plainly when it is not the one active
 * today: the editor's values are never shown as what a past result used.
 */
import React, { useMemo, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, KvRow, PanelHead, QueryError, TonePill, fmtDateTime } from '../shared';
import { useEffectiveConfig } from './useConfig';
import { bundleStateTone, shortHash, valueText } from './configSupport';

export const EffectiveConfigDrawer: React.FC<{ loopId: string; runBundleHash?: string | null; onClose?: () => void; gateFilter?: string }> = ({ loopId, runBundleHash, onClose, gateFilter }) => {
  const q = useEffectiveConfig(loopId);
  const [gate, setGate] = useState<string>(gateFilter ?? '');
  const eff = q.data;
  const rows = useMemo(() => {
    if (!eff) return [];
    return Object.entries(eff.properties).filter(([k]) => !gate || k.startsWith(`${gate}.`)).sort(([a], [b]) => a.localeCompare(b));
  }, [eff, gate]);
  const gates = useMemo(() => eff ? [...new Set(Object.keys(eff.properties).map(k => k.split('.')[0]))].sort() : [], [eff]);
  const runDiffers = !!runBundleHash && !!eff && (eff.bundle ? eff.bundle.contentHash !== runBundleHash : !runBundleHash.startsWith('profile:') && runBundleHash !== 'legacy');
  return (
    <section className="cpm-surface cpm-config-effective" data-testid="effective-config">
      <PanelHead eyebrow="Effective configuration" title={loopId} right={onClose ? <ObcButton variant="flat" onClick={onClose}>Close</ObcButton> : undefined} />
      {q.isError && <QueryError error={q.error} retry={() => void q.refetch()} />}
      {eff && (
        <>
          {runBundleHash && (
            <p className={runDiffers ? 'cpm-field__error' : 'cpm-copy'} role={runDiffers ? 'alert' : undefined} data-testid="run-bundle-note">
              {runDiffers
                ? `The selected result was computed under bundle ${shortHash(runBundleHash, 16)}, which is NOT the configuration active for this loop today; the values below are what runs now, not what that result used.`
                : `The selected result was computed under this configuration (${shortHash(runBundleHash, 16)}).`}
            </p>
          )}
          <KvRow label="state"><TonePill tone={bundleStateTone(eff.state)}>{eff.state}</TonePill></KvRow>
          {eff.bundle ? (
            <>
              <KvRow label="bundle">{eff.bundle.scopeKind}{eff.bundle.scopeRef ? ` ${eff.bundle.scopeRef}` : ''} · v{eff.bundle.version} · <span className="cpm-mono">{shortHash(eff.bundle.contentHash, 16)}</span></KvRow>
              <KvRow label="change class / effective from">{eff.bundle.changeClass} / {eff.bundle.effectiveFrom ? fmtDateTime(eff.bundle.effectiveFrom) : '—'}</KvRow>
            </>
          ) : (
            <p className="cpm-copy">{eff.note}</p>
          )}
          <KvRow label="profile">{eff.profileId}</KvRow>
          <PanelHead eyebrow="Workers" title="APPLY acknowledgements" />
          <table className="cpm-table" data-table="effective-workers">
            <thead><tr><th>job</th><th>jar</th><th>catalogue</th><th>applied</th></tr></thead>
            <tbody>
              {eff.workers.map(w => (
                <tr key={w.jobName}>
                  <td>{w.jobName}</td><td className="cpm-mono">{shortHash(w.jarSha256, 8)}</td><td className="cpm-mono">{shortHash(w.catalogueHash, 8)}</td>
                  <td>{w.ack ? <><TonePill tone={w.ack.status === 'ACK' ? 'good' : 'bad'}>{w.ack.status}</TonePill> <span className="cpm-mono">{shortHash(w.ack.bundleHash, 8)}</span></> : eff.bundle ? <TonePill tone="muted">no ACK recorded</TonePill> : <span className="cpm-copy">factory layer</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cpm-config-effective__filter">
            <label className="cpm-field cpm-field--compact"><span className="cpm-field__label">Gate</span>
              <select className="cpm-select" value={gate} onChange={e => setGate(e.target.value)}><option value="">all</option>{gates.map(g => <option key={g} value={g}>{g}</option>)}</select>
            </label>
          </div>
          {rows.length === 0 ? <EmptyState title="No properties" copy="The effective block is empty for this gate." /> : (
            <table className="cpm-table" data-table="effective-properties">
              <thead><tr><th>property</th><th>value</th><th>from</th></tr></thead>
              <tbody>{rows.map(([k, v]) => <tr key={k}><td className="cpm-mono">{k}</td><td className="cpm-mono">{valueText(v)}</td><td>{eff.sources[k] ?? '—'}</td></tr>)}</tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
};
