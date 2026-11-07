// Task 25 fix round 1: an empty worker list is never read as aligned.
import { describe, expect, it } from 'vitest';
import { workerAlignment } from './configSupport';
import type { EffectiveConfig } from '../../../api/cpm/config';

const base = {
  loopId: 'L', site: 's', profileId: 'P', state: 'ACTIVE_VERIFIED', properties: {}, sources: {},
  bundle: { bundleId: 'b', version: 1, contentHash: 'h', scopeKind: 'LOOP', scopeRef: 'L', changeClass: 'POLICY', effectiveFrom: null, catalogueHash: 'c' },
} as unknown as EffectiveConfig;

describe('workerAlignment', () => {
  it('no worker has reported: neutral, never good', () => {
    const a = workerAlignment({ ...base, workers: [] });
    expect(a.value).toBe('No worker has reported');
    expect(a.tone).toBe('muted');
    expect(workerAlignment({ ...base, bundle: null, workers: [] }).value).toBe('No worker has reported');
  });
  it('all applied is good', () => {
    const a = workerAlignment({ ...base, workers: [{ jobName: 'a', jarSha256: 'j', catalogueHash: 'c', ack: { status: 'ACK', bundleHash: 'h', jarSha256: 'j', receivedAt: 't' } }] });
    expect(a.value).toBe('1 of 1 applied');
    expect(a.tone).toBe('good');
  });
});
