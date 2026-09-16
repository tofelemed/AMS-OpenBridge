/**
 * v2.5 Task 2E.3 (spec §3.2 right column): the method trace of THE SELECTED RUN - what the gate
 * measures, the method and version that ran, the parameters and thresholds it used (from the
 * artifacts' provenance and the run's result, never today's editor values), why / why not, the
 * exclusions, and the next valid action. Roles and preconditions come from the build's catalogue.
 */
import React from 'react';
import type { MethodRun, EvidenceManifest } from '../../../api/cpm/evidence';
import type { GateCatalogueEntry } from '../../../api/cpm/catalogue';
import { KvRow, PanelHead, TonePill } from '../shared';
import { gateTone } from '../gateStatus';
import type { GateState } from './GateResultState';

/** Provenance keys that are parameters / thresholds rather than window identity. */
const IDENTITY_KEYS = new Set(['loop_id', 'window_kind', 'window_start_ms', 'window_end_ms', 'bundle_hash', 'dataset_hash', 'column_units', 'legends', 'mask', 'analysis_run_id', 'purpose', 'reconstructs', 'result_revision']);

export function parametersOf(manifest: EvidenceManifest | undefined, gate: string): Array<[string, string]> {
  const out = new Map<string, string>();
  for (const a of manifest?.artifacts ?? []) {
    if (a.gate !== gate) continue;
    for (const [k, v] of Object.entries(a.provenance ?? {})) if (!IDENTITY_KEYS.has(k)) out.set(`${a.kind}.${k}`, String(v));
  }
  return Array.from(out.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

export const MethodTracePanel: React.FC<{
  gate: string;
  run: MethodRun | undefined;
  entry: GateCatalogueEntry | undefined;
  manifest: EvidenceManifest | undefined;
  state: GateState;
  acceptedSummary?: { accepted: number; total: number; reasons: Record<string, number> } | null;
}> = ({ gate, run, entry, manifest, state, acceptedSummary }) => {
  const cell = run?.cell;
  const status = cell?.status ?? (run?.result as Record<string, unknown> | null)?.[`gate${gate.replace('G', '').toLowerCase()}_status`] as string | undefined;
  const reason = cell?.reason ?? ((run?.result as Record<string, unknown> | null)?.[`gate${gate.replace('G', '')}_reason`] as string | undefined) ?? null;
  const params = parametersOf(manifest, gate);
  return (
    <section className="cpm-surface cpm-method-trace">
      <PanelHead eyebrow="Method trace" title={entry ? `${gate} · ${entry.name}` : gate}
        right={status ? <TonePill tone={gateTone(status)}>{status.replace(/_/g, ' ')}</TonePill> : undefined} />
      <KvRow label="Role">{entry?.role ?? '—'}</KvRow>
      <KvRow label="Measures">{entry?.definition ?? '—'}</KvRow>
      <KvRow label="Preconditions">{entry?.preconditions ?? '—'}</KvRow>
      <KvRow label="Method">{entry ? `${entry.method.id} v${entry.method.version}` : '—'}</KvRow>
      <KvRow label="Why / why not">{reason ? reason : status ? `${status} with no recorded reason` : 'no verdict cell for this tier'}</KvRow>
      {acceptedSummary && (
        <KvRow label="Exclusions">
          {acceptedSummary.total - acceptedSummary.accepted} of {acceptedSummary.total} samples excluded
          {Object.keys(acceptedSummary.reasons).length > 0 && ` (${Object.entries(acceptedSummary.reasons).map(([k, v]) => `${k}: ${v}`).join(', ')})`}
        </KvRow>
      )}
      <KvRow label="Next valid action">
        {state.kind === 'READY' ? 'Read the artifacts; every value is the run\'s own.' : `${state.title}. ${state.stillValid}`}
      </KvRow>
      <PanelHead eyebrow="Parameters used" title="From the run's artifacts" />
      {params.length === 0 ? (
        <p className="cpm-copy">No retained artifact declares parameters for this gate{manifest ? '' : ' yet'}.</p>
      ) : (
        <dl className="cpm-method-trace__params">
          {params.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className="cpm-mono">{k}</dt>
              <dd>{v.length > 160 ? `${v.slice(0, 160)}…` : v}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
      {run && (
        <p className="cpm-copy cpm-mono">
          bundle {run.identity.bundleHash} · dataset {(run.identity.datasetHash ?? '—').slice(0, 16)} · {run.identity.source}
        </p>
      )}
    </section>
  );
};
