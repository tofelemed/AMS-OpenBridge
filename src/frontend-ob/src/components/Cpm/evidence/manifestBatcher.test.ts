// v2.5 workbench batching: the workbench asks for four manifests at once (the selected gate and the
// G0 / G1 / G11 context-lane siblings). The batcher coalesces the manifest reads issued within one
// tick into a single POST /method-runs/evidence/batch, resolves each caller with its own manifest,
// and falls back to the single GET when the batch route is unavailable (an older cplm-api).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createManifestBatcher } from './manifestBatcher';

const manifest = (id: string) => ({ methodRunId: id, etag: `"${id}"`, readiness: 'COMPLETE', count: 1, reconstructable: true, reconstruct: { purpose: 'EVIDENCE_RECONSTRUCTION' as const, methodRunId: id, endpoint: '' }, artifacts: [] });

describe('manifest batcher', () => {
  let batch: ReturnType<typeof vi.fn>;
  let single: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    batch = vi.fn(async (ids: string[]) => ({ count: ids.length, manifests: Object.fromEntries(ids.map(id => [id, id === 'missing' ? null : manifest(id)])) }));
    single = vi.fn(async (id: string) => manifest(id));
  });

  it('coalesces the reads of one tick into one batch call and resolves each with its own manifest', async () => {
    const load = createManifestBatcher({ batch, single, windowMs: 5 });
    const [a, b, c] = await Promise.all([load('a'), load('b'), load('c')]);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toEqual(['a', 'b', 'c']);
    expect([a.methodRunId, b.methodRunId, c.methodRunId]).toEqual(['a', 'b', 'c']);
    expect(single).not.toHaveBeenCalled();
  });

  it('serves a null manifest as an empty NONE manifest (nothing retained), not an error', async () => {
    const load = createManifestBatcher({ batch, single, windowMs: 5 });
    const m = await load('missing');
    expect(m.readiness).toBe('NONE');
    expect(m.count).toBe(0);
    expect(m.reconstructable).toBe(true);
  });

  it('falls back to single reads when the batch route fails', async () => {
    batch = vi.fn(async () => { throw new Error('HTTP 404'); });
    const load = createManifestBatcher({ batch, single, windowMs: 5 });
    const [a, b] = await Promise.all([load('a'), load('b')]);
    expect(single).toHaveBeenCalledTimes(2);
    expect([a.methodRunId, b.methodRunId]).toEqual(['a', 'b']);
  });

  it('splits more than the batch limit into several calls', async () => {
    const load = createManifestBatcher({ batch, single, windowMs: 5, limit: 2 });
    await Promise.all(['a', 'b', 'c'].map(load));
    expect(batch).toHaveBeenCalledTimes(2);
  });
});
