// Test-only: a minimal method run and manifest for the Workbench tab tests.
import type { EvidenceArtifactMeta, EvidenceManifest, MethodRun } from '../../../../api/cpm/evidence';

export const RUN_ID = '4ccaf304-0e8d-54df-94ef-83f4130ee28d';

export const methodRun = (over: Partial<MethodRun> = {}): MethodRun => ({
  methodRunId: RUN_ID, tier: 'short', gate: 'G3', loopId: 'FIC10405', site: 'hdpe', windowKind: '12h', gateResultId: 1,
  support: { fromMs: 1789586400000, toMs: 1789629600000, sampleCount: 1977 },
  identity: { bundleHash: 'profile:ffa30188e0775f18', contextRevision: 0, resultRevision: 1, purpose: 'LIVE', analysisRunId: null, sourceCommit: '3535c78aa45a', jarSha256: '4ea1da78ead8', datasetHash: 'ds-1', source: 'flink' },
  cell: null, verdictV2: null, result: { mae: 0.7103, gate3_status: 'WARN' }, methodRunIds: {},
  reconstruction: { supported: true, reason: '' }, computedAt: '2026-09-17T08:00:00Z', ...over,
});

export const artifact = (over: Partial<EvidenceArtifactMeta> = {}): EvidenceArtifactMeta => ({
  artifactId: 'a1', methodRunId: RUN_ID, gate: 'G3', kind: 'error_series', roleOrPath: null, x: { quantity: null, unit: null }, y: { quantity: null, unit: null },
  dataType: 'f64', columns: [], encoding: 'raw', calculationSamples: 10, displayPoints: 10, chunkCount: 1, totalBytes: 1, checksum: 'c', chunkChecksums: [], chunksUrl: '',
  readiness: 'COMPLETE', readinessReason: null, provenance: {}, retentionClass: 'A', pinned: false, createdAt: '2026-09-17T08:00:00Z', completedAt: null, ...over,
});

export const manifest = (artifacts: EvidenceArtifactMeta[] = []): EvidenceManifest => ({
  methodRunId: RUN_ID, etag: '"e"', readiness: artifacts.length ? 'COMPLETE' : 'NONE', count: artifacts.length, reconstructable: true,
  reconstruct: { purpose: 'EVIDENCE_RECONSTRUCTION', methodRunId: RUN_ID, endpoint: '/api/v1/cpm/analysis-runs' }, artifacts,
});
