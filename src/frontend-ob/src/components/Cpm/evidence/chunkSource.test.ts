// v2.5 workbench batching: one gate open used to be one request per chunk (G9 averages 48 artifacts
// on the lab). The run bundle serves every COMPLETE artifact of a run in one framed body; the chunk
// source hands `loadArtifact` the chunks out of that bundle, requests a run's bundle ONCE however many
// artifacts ask, and falls back to the per-chunk route when the bundle is unavailable or does not
// carry the artifact (PENDING at bundle time).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { frameBundle, parseBundle } from './artifactCodec';
import { bundledChunkFetcher, resetBundleCache } from './chunkSource';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const RUN = 'run-1';

describe('bundle framing', () => {
  it('round-trips artifacts and their chunks in order', () => {
    const bytes = frameBundle([
      { artifactId: A, chunks: [new Uint8Array([1, 2, 3]), new Uint8Array([4])] },
      { artifactId: B, chunks: [new Uint8Array([9, 9])] },
    ]);
    const parsed = parseBundle(bytes);
    expect([...parsed.keys()]).toEqual([A, B]);
    expect(parsed.get(A)!.map(c => [...c])).toEqual([[1, 2, 3], [4]]);
    expect(parsed.get(B)!.map(c => [...c])).toEqual([[9, 9]]);
  });

  it('refuses a truncated frame instead of returning partial chunks', () => {
    const bytes = frameBundle([{ artifactId: A, chunks: [new Uint8Array([1, 2, 3])] }]);
    expect(() => parseBundle(bytes.slice(0, bytes.length - 1))).toThrow(/BUNDLE_TRUNCATED/);
  });
});

describe('bundledChunkFetcher', () => {
  beforeEach(() => resetBundleCache());

  it('requests the run bundle once for every artifact of the run and never the per-chunk route', async () => {
    const fetchBundle = vi.fn(async () => frameBundle([
      { artifactId: A, chunks: [new Uint8Array([1]), new Uint8Array([2])] },
      { artifactId: B, chunks: [new Uint8Array([3])] },
    ]));
    const fetchChunk = vi.fn(async () => new Uint8Array([0]));
    const fetch = bundledChunkFetcher(RUN, { fetchBundle, fetchChunk });
    const [a0, a1, b0] = await Promise.all([fetch(A, 0), fetch(A, 1), fetch(B, 0)]);
    expect([...a0, ...a1, ...b0]).toEqual([1, 2, 3]);
    expect(fetchBundle).toHaveBeenCalledTimes(1);
    expect(fetchChunk).not.toHaveBeenCalled();
  });

  it('falls back to the per-chunk route when the bundle request fails, and does not poison later calls', async () => {
    let fail = true;
    const fetchBundle = vi.fn(async () => { if (fail) throw new Error('HTTP 503'); return frameBundle([{ artifactId: A, chunks: [new Uint8Array([7])] }]); });
    const fetchChunk = vi.fn(async (_id: string, n: number) => new Uint8Array([100 + n]));
    const fetch = bundledChunkFetcher(RUN, { fetchBundle, fetchChunk });
    expect([...(await fetch(A, 0))]).toEqual([100]);
    expect(fetchChunk).toHaveBeenCalledTimes(1);
    fail = false;
    resetBundleCache();
    expect([...(await bundledChunkFetcher(RUN, { fetchBundle, fetchChunk })(A, 0))]).toEqual([7]);
  });

  it('falls back per chunk for an artifact the bundle does not carry (pending at bundle time)', async () => {
    const fetchBundle = vi.fn(async () => frameBundle([{ artifactId: A, chunks: [new Uint8Array([1])] }]));
    const fetchChunk = vi.fn(async () => new Uint8Array([42]));
    const fetch = bundledChunkFetcher(RUN, { fetchBundle, fetchChunk });
    expect([...(await fetch(B, 0))]).toEqual([42]);
    expect(fetchChunk).toHaveBeenCalledWith(B, 0, undefined);
  });
});
