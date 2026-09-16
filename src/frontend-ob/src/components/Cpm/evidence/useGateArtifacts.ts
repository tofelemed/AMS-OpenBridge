/**
 * v2.5 Task 2E.4: every COMPLETE artifact of one gate, decoded, grouped by kind (in manifest order).
 * A view renders from these and nothing else; a kind it needs that is absent is a stated state.
 */
import { useQueries } from '@tanstack/react-query';
import type { EvidenceManifest } from '../../../api/cpm/evidence';
import { fetchChunk } from '../../../api/cpm/evidence';
import { loadArtifact, type DecodedArtifact } from './artifactCodec';

export interface GateArtifacts {
  byKind: Record<string, DecodedArtifact[]>;
  loading: boolean;
  errors: Array<{ kind: string; roleOrPath: string | null; message: string }>;
  /** Kinds the manifest declares for the gate that are not COMPLETE (with their readiness). */
  unavailable: Array<{ kind: string; roleOrPath: string | null; readiness: string; reason: string | null }>;
}

export function useGateArtifacts(manifest: EvidenceManifest | undefined, gate: string): GateArtifacts {
  const own = (manifest?.artifacts ?? []).filter(a => a.gate === gate);
  const complete = own.filter(a => a.readiness === 'COMPLETE');
  const results = useQueries({
    queries: complete.map(meta => ({
      queryKey: ['cpm', 'artifact', meta.artifactId, meta.checksum],
      queryFn: ({ signal }: { signal?: AbortSignal }) => loadArtifact(meta, fetchChunk, signal),
      staleTime: Infinity,
      retry: false,
    })),
  });
  const byKind: Record<string, DecodedArtifact[]> = {};
  const errors: GateArtifacts['errors'] = [];
  results.forEach((r, i) => {
    const meta = complete[i];
    if (r.data) (byKind[meta.kind] ??= []).push(r.data);
    if (r.error) errors.push({ kind: meta.kind, roleOrPath: meta.roleOrPath, message: (r.error as Error).message });
  });
  return {
    byKind,
    loading: results.some(r => r.isLoading),
    errors,
    unavailable: own.filter(a => a.readiness !== 'COMPLETE').map(a => ({ kind: a.kind, roleOrPath: a.roleOrPath, readiness: a.readiness, reason: a.readinessReason })),
  };
}
