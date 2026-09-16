// v2.5 Task 2E.1 (spec §3.3): an artifact's chunks reassemble bit-exact, every checksum is verified
// before a byte is trusted, the gzip stream decodes to named f64 columns with units and legends -
// and a corrupt chunk fails loudly instead of rendering a wrong curve.
import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { createHash, webcrypto } from 'node:crypto';
import { decodeArtifact, splitChunks, type ArtifactMeta, type CodecPorts } from './artifactCodec';

const ports: CodecPorts = {
  inflate: async (b) => new Uint8Array(await import('node:zlib').then(z => z.gunzipSync(b))),
  sha256: async (b) => createHash('sha256').update(b).digest('hex'),
  subtle: webcrypto.subtle as unknown as SubtleCrypto,
};

function f64le(values: number[]): Uint8Array {
  const buf = new ArrayBuffer(values.length * 8);
  const view = new DataView(buf);
  values.forEach((v, i) => view.setFloat64(i * 8, v, true));
  return new Uint8Array(buf);
}

function artifact(columns: string[], data: number[][], chunkBytes = 64) {
  const n = data[0].length;
  const raw = f64le(columns.flatMap((_, c) => data[c]));
  const encoded = new Uint8Array(gzipSync(raw));
  const chunks = splitChunks(encoded, chunkBytes);
  const meta: ArtifactMeta = {
    artifactId: 'e1', methodRunId: 'r1', gate: 'G3', kind: 'objective_error', roleOrPath: 'ERROR',
    x: { quantity: 'sample_time', unit: 'ms_epoch' }, y: { quantity: 'error', unit: 'EU' },
    columns, calculationSamples: n, displayPoints: n, chunkCount: chunks.length, totalBytes: encoded.length,
    checksum: createHash('sha256').update(encoded).digest('hex'),
    chunkChecksums: chunks.map(c => createHash('sha256').update(c).digest('hex')),
    readiness: 'COMPLETE', readinessReason: null, encoding: 'f64le+gzip', dataType: 'f64',
    provenance: { column_units: JSON.stringify({ x: 'ms_epoch', y: 'EU', mask: 'boolean', cumulative_iae: 'EU*s' }), legends: JSON.stringify({ quality: '0=GOOD;1=BAD' }), window_kind: '60m' },
  };
  return { meta, chunks };
}

describe('artifactCodec', () => {
  it('reassembles, verifies and decodes named columns with units and legends', async () => {
    const t = [1, 2, 3, 4, 5], y = [0.5, -0.25, 0, 1e-3, 7], mask = [1, 1, 0, 1, 1], iae = [0.5, 0.75, 0.75, 0.751, 7.751];
    const { meta, chunks } = artifact(['x', 'y', 'mask', 'cumulative_iae'], [t, y, mask, iae], 40);
    expect(chunks.length).toBeGreaterThan(1);
    const d = await decodeArtifact(meta, chunks, ports);
    expect(d.n).toBe(5);
    expect(Array.from(d.columns.x)).toEqual(t);
    expect(Array.from(d.columns.y)).toEqual(y);
    expect(Array.from(d.columns.cumulative_iae)).toEqual(iae);
    expect(d.mask).toEqual([true, true, false, true, true]);
    expect(d.units.cumulative_iae).toBe('EU*s');
    expect(d.legends.quality).toEqual(['GOOD', 'BAD']);
  });

  it('fails loudly on a corrupt chunk and on a wrong total checksum', async () => {
    const { meta, chunks } = artifact(['x', 'y'], [[1, 2, 3], [4, 5, 6]], 32);
    const bad = chunks.map(c => new Uint8Array(c));
    bad[0][3] ^= 0xff;
    await expect(decodeArtifact(meta, bad, ports)).rejects.toThrow(/CHUNK_CHECKSUM_MISMATCH:0/);
    const meta2 = { ...meta, checksum: 'deadbeef' };
    await expect(decodeArtifact(meta2, chunks, ports)).rejects.toThrow(/TOTAL_CHECKSUM_MISMATCH/);
  });

  it('refuses a payload whose length does not match samples x columns', async () => {
    const { meta, chunks } = artifact(['x', 'y'], [[1, 2, 3], [4, 5, 6]]);
    const meta2 = { ...meta, calculationSamples: 4 };
    await expect(decodeArtifact(meta2, chunks, ports)).rejects.toThrow(/PAYLOAD_LENGTH/);
  });
});
