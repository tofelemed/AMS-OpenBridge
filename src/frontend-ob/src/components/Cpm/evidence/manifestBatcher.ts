/**
 * v2.5 workbench batching: manifest reads issued within one short window are coalesced into a
 * single POST /method-runs/evidence/batch (the selected gate and its G0 / G1 / G11 context-lane
 * siblings arrive as four hook calls in the same render). Each caller gets its own manifest; a
 * null (unknown run, nothing retained) is served as an empty NONE manifest - the same thing the
 * single route says - and a failing batch route falls back to the single reads.
 */
import { getEvidenceBatch, getEvidenceManifest, type EvidenceManifest } from '../../../api/cpm/evidence';

export interface ManifestBatcherPorts {
  batch: (ids: string[], signal?: AbortSignal) => Promise<{ count: number; manifests: Record<string, EvidenceManifest | null> }>;
  single: (id: string, signal?: AbortSignal) => Promise<EvidenceManifest>;
  windowMs?: number;
  limit?: number;
}

interface Pending { id: string; resolve: (m: EvidenceManifest) => void; reject: (e: unknown) => void }

export function emptyManifest(methodRunId: string): EvidenceManifest {
  return {
    methodRunId, etag: '"none"', readiness: 'NONE', count: 0, reconstructable: true,
    reconstruct: { purpose: 'EVIDENCE_RECONSTRUCTION', methodRunId, endpoint: '/api/v1/cpm/analysis-runs' },
    artifacts: [],
  };
}

export function createManifestBatcher(ports: ManifestBatcherPorts): (id: string, signal?: AbortSignal) => Promise<EvidenceManifest> {
  const windowMs = ports.windowMs ?? 10;
  const limit = ports.limit ?? 20;
  let queue: Pending[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    timer = null;
    const batch = queue;
    queue = [];
    for (let i = 0; i < batch.length; i += limit) {
      const slice = batch.slice(i, i + limit);
      const ids = [...new Set(slice.map(p => p.id))];
      try {
        const res = await ports.batch(ids);
        for (const p of slice) p.resolve(res.manifests[p.id] ?? emptyManifest(p.id));
      } catch {
        // an older cplm-api without the batch route: the single reads still work
        await Promise.all(slice.map(p => ports.single(p.id).then(p.resolve, p.reject)));
      }
    }
  };

  return (id) => new Promise<EvidenceManifest>((resolve, reject) => {
    queue.push({ id, resolve, reject });
    if (!timer) timer = setTimeout(() => { void flush(); }, windowMs);
  });
}

/** The app-wide batcher over the real API. */
export const loadManifest = createManifestBatcher({ batch: getEvidenceBatch, single: getEvidenceManifest });
