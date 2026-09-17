/**
 * v2.5 workbench: the facts of one run that several panels read - the gate's status and reason
 * (the fused row's cell, else the tier row's payload), the parameters the run used (its artifacts'
 * provenance, labelled and formatted; raw kept), and the identity block. Pure; no derivation.
 */
import type { EvidenceManifest, MethodRun } from '../../../api/cpm/evidence';
import { fmtQuantity, labelForKey, unitForKey } from './format';

export const GATE_ORDER = ['G0', 'G1', 'G2', 'G2r', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14', 'G15'];

/** gateN_status / gateN_reason key of the tier payloads (G2r spells gate2r). */
const payloadKey = (gate: string, suffix: 'status' | 'reason') => `gate${gate.replace(/^G/, '').toLowerCase()}_${suffix}`;

export function gateStatusOf(run: MethodRun | undefined, gate: string): string | null {
  if (!run) return null;
  if (run.cell && run.cell.key === gate) return run.cell.status ?? null;
  const v = run.result?.[payloadKey(gate, 'status')];
  return typeof v === 'string' && v ? v : null;
}

export function gateReasonOf(run: MethodRun | undefined, gate: string): string | null {
  if (!run) return null;
  if (run.cell && run.cell.key === gate) return run.cell.reason ?? null;
  const v = run.result?.[payloadKey(gate, 'reason')];
  return typeof v === 'string' && v ? v : null;
}

/** Provenance keys that are window identity or transport, never a parameter the reader wants. */
const IDENTITY_KEYS = new Set([
  'loop_id', 'window_kind', 'window_start_ms', 'window_end_ms', 'bundle_hash', 'dataset_hash', 'column_units', 'legends', 'mask',
  'analysis_run_id', 'purpose', 'reconstructs', 'result_revision', 'context_revision', 'source_commit', 'jar_sha256', 'role', 'accepted_mask',
]);

export interface RunParameter { key: string; kind: string; raw: string; label: string; text: string }

export function parametersOf(manifest: EvidenceManifest | undefined, gate: string): RunParameter[] {
  const out = new Map<string, RunParameter>();
  const own = (manifest?.artifacts ?? []).filter(a => a.gate === gate);
  // a kind that appears many times (cycle_fit x N, cycle_polygon x N) carries per-item RESULTS, not the
  // parameters the run used; only singleton artifacts' provenance is a parameter (lab: G9 showed "Cycle 9, Area 19.58")
  const kindCount = new Map<string, number>();
  for (const a of own) kindCount.set(a.kind, (kindCount.get(a.kind) ?? 0) + 1);
  for (const a of own) {
    if ((kindCount.get(a.kind) ?? 0) > 1) continue;
    for (const [k, v] of Object.entries(a.provenance ?? {})) {
      if (IDENTITY_KEYS.has(k)) continue;
      const raw = String(v);
      if (raw.length > 400) continue;                                  // arrays / JSON blobs are the views' business
      const key = `${a.kind}.${k}`;
      out.set(key, { key, kind: a.kind, raw, label: labelForKey(k), text: fmtQuantity(raw, unitForKey(k), k) });
    }
  }
  return Array.from(out.values()).sort((x, y) => x.kind.localeCompare(y.kind) || x.label.localeCompare(y.label));
}

export function identityOf(run: MethodRun): Array<{ label: string; value: string | null }> {
  const id = run.identity;
  return [
    { label: 'Run', value: run.methodRunId },
    { label: 'Build commit', value: id.sourceCommit },
    { label: 'Jar', value: id.jarSha256 },
    { label: 'Bundle', value: id.bundleHash },
    { label: 'Dataset', value: id.datasetHash },
    { label: 'Source', value: id.source },
    { label: 'Purpose', value: id.purpose },
    { label: 'Revisions', value: `context r${id.contextRevision} · result r${id.resultRevision}` },
  ];
}
