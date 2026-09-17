/**
 * v2.5 workbench batching: where an artifact's chunks come from. A run's bundle (every COMPLETE
 * artifact in one response) is requested ONCE per run and shared by every artifact of that run;
 * the per-chunk route is the fallback - a bundle that fails, or an artifact the bundle does not
 * carry (PENDING when it was cut), costs the caller nothing but the old request pattern.
 */
import { fetchBundle as fetchBundleApi, fetchChunk as fetchChunkApi } from '../../../api/cpm/evidence';
import { parseBundle } from './artifactCodec';

export type ChunkFetcher = (evidenceId: string, n: number, signal?: AbortSignal) => Promise<Uint8Array>;

export interface ChunkSourcePorts {
  fetchBundle: (methodRunId: string, signal?: AbortSignal) => Promise<Uint8Array>;
  fetchChunk: ChunkFetcher;
}

const defaultPorts: ChunkSourcePorts = { fetchBundle: fetchBundleApi, fetchChunk: fetchChunkApi };

/** One in-flight / resolved bundle per run; a failed request is dropped so the next caller may retry. */
const bundles = new Map<string, Promise<Map<string, Uint8Array[]> | null>>();
const MAX_CACHED_RUNS = 24;

function bundleOf(methodRunId: string, ports: ChunkSourcePorts, signal?: AbortSignal): Promise<Map<string, Uint8Array[]> | null> {
  const cached = bundles.get(methodRunId);
  if (cached) return cached;
  const p = ports.fetchBundle(methodRunId, signal)
    .then(bytes => parseBundle(bytes))
    .catch(() => { bundles.delete(methodRunId); return null; });
  bundles.set(methodRunId, p);
  if (bundles.size > MAX_CACHED_RUNS) {
    const oldest = bundles.keys().next().value;
    if (oldest !== undefined && oldest !== methodRunId) bundles.delete(oldest);
  }
  return p;
}

/** A `fetchChunk`-compatible function that serves the run's bundle first. */
export function bundledChunkFetcher(methodRunId: string, ports: ChunkSourcePorts = defaultPorts): ChunkFetcher {
  return async (evidenceId, n, signal) => {
    const bundle = await bundleOf(methodRunId, ports, signal);
    const chunks = bundle?.get(evidenceId);
    const chunk = chunks?.[n];
    if (chunk) return chunk;
    return ports.fetchChunk(evidenceId, n, signal);
  };
}

export function resetBundleCache(): void {
  bundles.clear();
}
