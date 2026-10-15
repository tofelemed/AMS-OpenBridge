// CHG-099 (SME review 2 #18): the workbench says which evidence it shows — the retained proof, arrays rebuilt because the
// original was no longer held, or a reconstruction viewed beside the retained proof — and never mixes the two silently.
import { describe, expect, it } from 'vitest';
import type { EvidenceArtifactMeta, EvidenceManifest, EvidenceReconstruction } from '../../../api/cpm/evidence';
import { basisOf, reconstructRefusal, reconstructionSettled, reconstructionSummary, viewedManifest } from './evidenceBasis';

const art = (id: string, kind: string, over: Partial<EvidenceArtifactMeta> = {}): EvidenceArtifactMeta => ({
  artifactId: id, methodRunId: 'run', gate: 'G5', kind, roleOrPath: null, x: { quantity: null, unit: null }, y: { quantity: null, unit: null },
  dataType: 'f64', columns: ['x', 'y'], encoding: 'f64le+gzip', calculationSamples: null, displayPoints: null, chunkCount: 1, totalBytes: 1,
  checksum: id, chunkChecksums: [id], chunksUrl: '', readiness: 'COMPLETE', readinessReason: null, provenance: {}, retentionClass: 'TRANSIENT',
  pinned: false, createdAt: '', completedAt: null, basis: 'RETAINED', ...over,
});
const recon = (over: Partial<EvidenceReconstruction> = {}): EvidenceReconstruction => ({
  analysisRunId: 'ar1', state: 'FINISHED', createdAt: '2026-10-15T08:00:00Z', source: 'iotdb', differing: 1, identical: 2,
  readiness: 'COMPLETE', sourceCommit: 'abcdef123456', jarSha256: null,
  artifacts: [art('r1', 'cycle_scores', { basis: 'RECONSTRUCTED', reconstructionOf: 'o1', analysisRunId: 'ar1' })], ...over,
});
const M = (over: Partial<EvidenceManifest> = {}): EvidenceManifest => ({
  methodRunId: 'run', etag: '', readiness: 'COMPLETE', count: 2, reconstructable: true,
  reconstruct: { purpose: 'EVIDENCE_RECONSTRUCTION', methodRunId: 'run', endpoint: '' },
  artifacts: [art('o1', 'cycle_scores'), art('o2', 'acf')], reconstructions: [recon()], ...over,
});

describe('evidence basis (SME review 2 #18)', () => {
  it('the retained proof by default, the reconstruction only when asked for', () => {
    expect(basisOf(M(), null, 'UTC')).toMatchObject({ kind: 'RETAINED', label: 'Retained proof' });
    const b = basisOf(M(), 'ar1', 'UTC');
    expect(b).toMatchObject({ kind: 'RECONSTRUCTION', label: 'Reconstructed evidence', tone: 'warn' });
    expect(b.detail).toMatch(/2026-10-15 08:00:00 from the historian · 1 artifact\(s\) differ from the retained proof · 2 identical/);
    expect(b.detail).toMatch(/commit abcdef12; the retained proof is unchanged/);
  });

  it('rebuilt arrays of a lost original say so', () => {
    const m = M({ artifacts: [art('o1', 'cycle_scores', { basis: 'RECONSTRUCTED', analysisRunId: 'ar0' })], reconstructions: [] });
    expect(basisOf(m, null, 'UTC').kind).toBe('REBUILT_LOST');
  });

  it('a reconstruction view replaces only the differing artifacts', () => {
    const v = viewedManifest(M(), 'ar1')!;
    expect(v.artifacts.map(a => a.artifactId)).toEqual(['r1', 'o2']);
    expect(viewedManifest(M(), null)!.artifacts.map(a => a.artifactId)).toEqual(['o1', 'o2']);
    expect(viewedManifest(M(), 'unknown')!.artifacts.map(a => a.artifactId)).toEqual(['o1', 'o2']);
  });

  it('a pending reconstruction is polled until it settles; identical counts as settled', () => {
    expect(reconstructionSettled(M({ reconstructions: [] }), 'ar1')).toBe(false);
    expect(reconstructionSettled(M({ reconstructions: [recon({ readiness: 'PENDING' })] }), 'ar1')).toBe(false);
    expect(reconstructionSettled(M({ reconstructions: [recon({ readiness: 'IDENTICAL', differing: 0, artifacts: [] })] }), 'ar1')).toBe(true);
    expect(reconstructionSummary(recon({ readiness: 'IDENTICAL', differing: 0, identical: 3, artifacts: [] }), 'UTC')).toMatch(/· 3 identical$/);
  });

  it('a refused reconstruction names why', () => {
    expect(reconstructRefusal('NOT_RECONSTRUCTABLE_EVENT_KEYED')).toMatch(/System Response workspace/);
  });
});

describe('nothing retained: the rebuild is shown, labelled (CHG-099)', () => {
  it('shows the newest reconstruction by default when no original is complete', () => {
    const m = M({ artifacts: [art('o1', 'cycle_scores', { readiness: 'EXPIRED' })], readiness: 'EXPIRED' });
    expect(basisOf(m, null, 'UTC')).toMatchObject({ kind: 'REBUILT_LOST', label: 'Rebuilt evidence' });
    const v = viewedManifest(m, null)!;
    expect(v.artifacts.map(a => a.artifactId)).toEqual(['r1']);
    expect(v.readiness).toBe('COMPLETE');
  });
});

describe('lab pass 2026-10-15 (CHG-099)', () => {
  it('a run never followed to its end reads as not recorded, never as still running', () => {
    const s = reconstructionSummary(recon({ state: 'UNTRACKED', readiness: 'NONE', differing: 0, identical: 0, artifacts: [], source: null }), 'UTC');
    expect(s).toMatch(/its outcome was not recorded$/);
    expect(s).toMatch(/a source not recorded \(run before CHG-099\)/);
    expect(s).not.toMatch(/still running/);
  });
  it('rows rebuilt in place by the earlier version are labelled as rebuilt over the originals', () => {
    const m = M({ artifacts: [art('o1', 'cycle_scores', { basis: 'RECONSTRUCTED' })], reconstructions: [] });
    expect(basisOf(m, null, 'UTC')).toMatchObject({ kind: 'REBUILT_LOST', label: 'Rebuilt evidence' });
    expect(basisOf(m, null, 'UTC').detail).toMatch(/wrote them over the run's original arrays/);
  });
});

describe('a rebuild under a new run identity (lab pass 2026-10-15)', () => {
  it('names the identity change, and with nothing retained says "rebuilt", not "differ"', () => {
    expect(reconstructionSummary(recon({ readiness: 'IDENTITY_CHANGED', differing: 0, identical: 0, artifacts: [], rebuiltAs: 'run-2' }), 'UTC'))
      .toMatch(/rebuilt under a new run identity — the configuration changed since this run$/);
    const m = M({ artifacts: [], readiness: 'NONE', reconstructions: [recon({ differing: 97, identical: 0 })] });
    const b = basisOf(m, null, 'UTC');
    expect(b.kind).toBe('REBUILT_LOST');
    expect(b.detail).toMatch(/97 artifact\(s\) rebuilt/);
    expect(b.detail).not.toMatch(/differ from the retained proof/);
    expect(b.detail).toMatch(/a rebuild re-creates the arrays, not the verdict/);
  });
});
