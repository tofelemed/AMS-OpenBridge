/**
 * Task 16: the Workbench's Rules & parameters tab. What the gate asks, the method that ran, the parameters this run used
 * (its own artifacts' provenance), the thresholds and configuration it ran under. The run is pinned: nothing here is
 * today's configuration, and the one note says so.
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { EvidenceManifest, MethodRun } from '../../../../api/cpm/evidence';
import type { GateCatalogueEntry } from '../../../../api/cpm/catalogue';
import { getEffectiveConfig } from '../../../../api/cpm/config';
import { useAuthStore } from '../../../../store/authStore';
import { KvRow } from '../../shared';
import { EffectiveConfigDrawer } from '../../config/EffectiveConfigDrawer';
import { fmtInstant } from '../../context/LoopContextBar';
import { methodLabel } from '../../vocabulary';
import { CopyableId } from '../CopyableId';
import { parametersOf } from '../gateFacts';

export const RulesTab: React.FC<{
  gate: string;
  run: MethodRun | undefined;
  entry: GateCatalogueEntry | undefined;
  manifest: EvidenceManifest | undefined;
  timeZone: string;
}> = ({ gate, run, entry, manifest, timeZone }) => {
  const [showConfig, setShowConfig] = useState(false);
  const canReadConfig = useAuthStore(s => s.hasPermission('cpm.config.read'));
  const endIso = run ? new Date(run.support.toMs).toISOString() : undefined;
  // the query ExplainWhy used for the thresholds: only for whoever may read the configuration (CHG-081)
  const cfg = useQuery({
    queryKey: ['cpm', 'why-config', run?.loopId, endIso],
    queryFn: ({ signal }) => getEffectiveConfig(run!.loopId, endIso, signal),
    enabled: !!run && canReadConfig, staleTime: 5 * 60_000,
  });
  const params = parametersOf(manifest, gate);
  return (
    <div className="cpm-workbench__tab">
      <section className="cpm-surface">
        <h3 className="cpm-eyebrow">What this gate asks</h3>
        <p className="cpm-copy">{entry?.definition ?? 'No catalogue definition for this gate in this build.'}</p>
        {entry?.preconditions && <KvRow label="Needs">{entry.preconditions}</KvRow>}
        <KvRow label="Role">{entry?.role ?? '—'}</KvRow>
      </section>

      <section className="cpm-surface">
        <h3 className="cpm-eyebrow">Method</h3>
        <KvRow label="Method">{entry ? <span title={entry.method.id}>{`${methodLabel(entry.method.id)} v${entry.method.version}`}</span> : '—'}</KvRow>
        <KvRow label="Tier">{run?.tier ?? entry?.tier ?? '—'}</KvRow>
        {entry && entry.capabilityState !== 'INSTALLED' && <KvRow label="Capability">{entry.capabilityState}{entry.capabilityReason ? ` · ${entry.capabilityReason}` : ''}</KvRow>}
      </section>

      <section className="cpm-surface">
        <h3 className="cpm-eyebrow">Parameters used</h3>
        {params.length === 0 ? (
          <p className="cpm-copy">No parameter was retained for this run.</p>
        ) : (
          <dl className="cpm-workbench__params">
            {params.map(p => (
              <React.Fragment key={p.key}>
                <dt title={p.key}>{p.label}</dt>
                <dd title={p.raw}>{p.text}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
        {cfg.data && (
          <p className="cpm-why__source">Thresholds: {cfg.data.profileId} profile{cfg.data.bundle ? ` · bundle v${cfg.data.bundle.version}` : ' · factory / profile layers'}, as in force at {fmtInstant(run?.support.toMs, timeZone)}.</p>
        )}
        <p className="cpm-copy">This run is pinned: these are the parameters and configuration it ran under, not those in force now.</p>
      </section>

      <section className="cpm-surface">
        <h3 className="cpm-eyebrow">Configuration</h3>
        {run ? (
          <>
            <KvRow label="Bundle"><CopyableId label="Bundle hash" value={run.identity.bundleHash} chars={16} /></KvRow>
            {canReadConfig && <ObcButton variant="flat" onClick={() => setShowConfig(v => !v)}>{showConfig ? 'Hide configuration used' : 'Configuration used by this run ↗'}</ObcButton>}
            {canReadConfig && showConfig && <EffectiveConfigDrawer loopId={run.loopId} at={endIso} runBundleHash={run.identity.bundleHash} gateFilter={gate} onClose={() => setShowConfig(false)} />}
          </>
        ) : <p className="cpm-copy">—</p>}
      </section>
    </div>
  );
};

export default RulesTab;
