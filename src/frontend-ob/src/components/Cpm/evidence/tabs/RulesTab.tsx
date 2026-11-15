/**
 * Task 16: the Workbench's Rules & parameters tab. What the gate asks, the method that ran, the parameters this run used
 * (its own artifacts' provenance), the thresholds it ran under. The run is pinned: nothing here is today's configuration.
 * CHG-184 (owner review items 0, 11.3): no Configuration section, no method version, Tier or capability row, no bundle
 * version, no build wording. CHG-187 (owner review 11.3): one sentence-case heading per section; "Needs" in plain words; the
 * role as a word ("Blocking"); the method a row of the first section; the profile by its name; the pinned paragraph became
 * the label "Pinned to the run's settings" with its ? tip.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EvidenceManifest, MethodRun } from '../../../../api/cpm/evidence';
import type { GateCatalogueEntry } from '../../../../api/cpm/catalogue';
import { getEffectiveConfig } from '../../../../api/cpm/config';
import { useAuthStore } from '../../../../store/authStore';
import { Toggletip } from '../../../../ui/Toggletip';
import { KvRow, PanelHead } from '../../shared';
import { fmtInstant } from '../../context/LoopContextBar';
import { codeLabel, methodLabel } from '../../vocabulary';
import { parametersOf } from '../gateFacts';
import { plainNeeds } from './rulesText';

const Pinned: React.FC = () => (
  <span className="cpm-rules__pinned">
    Pinned to the run&apos;s settings
    <Toggletip variant="how-to" label="Pinned to the run's settings">
      <p>These are the parameters and configuration this run ran under, not those in force now.</p>
    </Toggletip>
  </span>
);

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
  // the query the measured-vs-required dialog uses for the thresholds: only for whoever may read the configuration (CHG-081)
  const cfg = useQuery({
    queryKey: ['cpm', 'why-config', run?.loopId, endIso],
    queryFn: ({ signal }) => getEffectiveConfig(run!.loopId, endIso, signal),
    enabled: !!run && canReadConfig, staleTime: 5 * 60_000,
  });
  const params = parametersOf(manifest, gate);
  return (
    <div className="cpm-workbench__tab">
      <section className="cpm-surface">
        <PanelHead title="What this gate asks" />
        <p className="cpm-copy">{entry?.definition ?? 'No definition for this gate.'}</p>
        {entry?.preconditions && <KvRow label="Needs">{plainNeeds(gate, entry.preconditions)}</KvRow>}
        <KvRow label="Role">{entry ? codeLabel(entry.role) : '—'}</KvRow>
        <KvRow label="Method">{entry ? methodLabel(entry.method.id) : '—'}</KvRow>
      </section>

      <section className="cpm-surface">
        <PanelHead title="Parameters used" right={run ? <Pinned /> : undefined} />
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
          <p className="cpm-why__source">Thresholds: {codeLabel(cfg.data.profileId)} profile, as in force at {fmtInstant(run?.support.toMs, timeZone)}.</p>
        )}
      </section>
    </div>
  );
};

export default RulesTab;
