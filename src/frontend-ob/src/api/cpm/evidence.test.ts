// 2026-10-03 (user decision): a reconstruction rebuilds from the historian (IoTDB), the durable
// store, never from the Kafka samples topic whose retention at the plant is 12 h.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fetchMod from '../apiFetch';
import { postReconstruction } from './evidence';

vi.mock('../apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../apiFetch')>();
  return { ...actual, apiJson: vi.fn() };
});

const apiJson = fetchMod.apiJson as unknown as ReturnType<typeof vi.fn>;

describe('postReconstruction', () => {
  beforeEach(() => { apiJson.mockReset(); apiJson.mockResolvedValue({ analysisRunId: 'r', jobId: 'j', source: 'iotdb' }); });

  it('asks the historian for the support of the run it rebuilds', async () => {
    await postReconstruction('a7cbbd46-9453-5b03-a9d3-1204e5313d81');
    expect(apiJson.mock.calls[0][0]).toBe('/api/v1/cpm/analysis-runs');
    const body = JSON.parse((apiJson.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ purpose: 'EVIDENCE_RECONSTRUCTION', methodRunId: 'a7cbbd46-9453-5b03-a9d3-1204e5313d81', source: 'iotdb' });
  });
});
