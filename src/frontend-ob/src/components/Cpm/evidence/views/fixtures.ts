// v2.5 Task 2E.4 test fixtures: decoded artifacts built directly (the codec has its own tests).
import type { DecodedArtifact } from '../artifactCodec';
import type { EvidenceArtifactMeta } from '../../../../api/cpm/evidence';

export function decoded(over: {
  gate: string; kind: string; role?: string | null; x: number[]; y: number[]; xQuantity?: string; xUnit?: string; yQuantity?: string; yUnit?: string;
  mask?: boolean[]; columns?: Record<string, number[]>; units?: Record<string, string>; legends?: Record<string, string[]>; provenance?: Record<string, string>;
}): DecodedArtifact {
  const columns: Record<string, Float64Array> = { x: Float64Array.from(over.x), y: Float64Array.from(over.y) };
  if (over.mask) columns.mask = Float64Array.from(over.mask.map(m => (m ? 1 : 0)));
  for (const [k, v] of Object.entries(over.columns ?? {})) columns[k] = Float64Array.from(v);
  const meta: EvidenceArtifactMeta = {
    artifactId: `${over.gate}-${over.kind}-${over.role ?? ''}`, methodRunId: 'run', gate: over.gate, kind: over.kind, roleOrPath: over.role ?? null,
    x: { quantity: over.xQuantity ?? 'sample_time', unit: over.xUnit ?? 'ms_epoch' }, y: { quantity: over.yQuantity ?? 'y', unit: over.yUnit ?? 'EU' },
    dataType: 'f64', columns: Object.keys(columns), encoding: 'f64le+gzip', calculationSamples: over.x.length, displayPoints: over.x.length, chunkCount: 1, totalBytes: 0,
    checksum: 'c', chunkChecksums: ['c'], chunksUrl: '', readiness: 'COMPLETE', readinessReason: null, provenance: over.provenance ?? {}, retentionClass: 'STANDARD', pinned: false, createdAt: '', completedAt: null,
  };
  return { meta, n: over.x.length, columns, mask: over.mask ?? null, units: { x: meta.x.unit!, y: meta.y.unit!, ...(over.units ?? {}) }, legends: over.legends ?? {} };
}

export const T0 = Date.UTC(2026, 8, 16, 12, 0, 0);
export const times = (n: number, stepMs = 5000) => Array.from({ length: n }, (_, i) => T0 + i * stepMs);
