/**
 * Task 16: the Workbench's Rules & parameters tab. What the gate asks, the method that ran, the parameters this run used
 * (its own artifacts' provenance), the thresholds it ran under. The run is pinned: nothing here is today's configuration, and
 * the one note says so. CHG-184 (owner review items 0, 11.3): no Configuration section (bundle id, copy, "Configuration used by
 * this run"), no method version, Tier or capability row, no bundle version, no build wording.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EvidenceManifest, MethodRun } from '../../../../api/cpm/evidence';
import type { GateCatalogueEntry } from '../../../../api/cpm/catalogue';
import { getEffectiveConfig } from '../../../../api/cpm/config';
import { useAuthStore } from '../../../../store/authStore';
import { KvRow } from '../../shared';
import { fmtInstant } from '../../context/LoopContextBar';
import { methodLabel } from '../../vocabulary';
import { parametersOf } from '../gateFacts';

export const RulesTab: React.FC<{
  gate: string;
  run: MethodRun | undefined;
  entry: GateCatalogueEntry | undefined;
  /** The retained manifest, never a reconstruction's: this block says what the run ran under. */
  manifest: EvidenceManifest | undefined;
  manifestLoading?: boolean;
  manifestError?: unknown;
  timeZone: string;
}> = ({ gate, run, entry, manifest, manifestLoading, manifestError, timeZone }) => {
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
        <p className="cpm-copy">{entry?.definition ?? 'No definition for this gate.'}</p>
        {entry?.preconditions && <KvRow label="Needs">{entry.preconditions}</KvRow>}
        <KvRow label="Role">{entry?.role ?? '—'}</KvRow>
      </section>

      <section className="cpm-surface">
        <h3 className="cpm-eyebrow">Method</h3>
        <KvRow label="Method">{entry ? methodLabel(entry.method.id) : '—'}</KvRow>
      </section>

      <section className="cpm-surface">
        <h3 className="cpm-eyebrow">Parameters used</h3>
        {!manifest && manifestError != null ? (
          <p className="cpm-field__error" role="alert">Parameters could not be read: {manifestError instanceof Error ? manifestError.message : String(manifestError)}</p>
        ) : !manifest ? (
          <p className="cpm-copy" role="status" aria-busy={manifestLoading}>Loading the parameters…</p>
        ) : params.length === 0 ? (
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
          <p className="cpm-why__source">Thresholds: {cfg.data.profileId} profile, as in force at {fmtInstant(run?.support.toMs, timeZone)}.</p>
        )}
        <p className="cpm-copy">This run is pinned: these are the parameters and configuration it ran under, not those in force now.</p>
      </section>
    </div>
  );
};

export default RulesTab;
