// Task 25 fix round 1: an empty worker list is never read as aligned.
import { describe, expect, it } from 'vitest';
import { runsElsewhere, workerAlignment } from './configSupport';
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
  // CHG-184 (owner review item 0): the line names no jar; workers on two builds read as different software releases
  it('names no jar: one release reads "catalogue matches", two read as different software releases', () => {
    const ack = { status: 'ACK', bundleHash: 'h', jarSha256: 'j', receivedAt: 't' } as const;
    expect(workerAlignment({ ...base, workers: [{ jobName: 'a', jarSha256: 'j', catalogueHash: 'c', ack }] }).sub).toBe('catalogue matches');
    const two = workerAlignment({ ...base, workers: [{ jobName: 'a', jarSha256: 'j1', catalogueHash: 'c', ack }, { jobName: 'b', jarSha256: 'j2', catalogueHash: 'c', ack }] });
    expect(two.sub).toBe('2 different software releases');
    expect(two.tone).toBe('bad');
  });
});

// CHG-220 (Gate Configuration check, gap 2): a deployment that stopped half way leaves the workers that applied it on the new
// version while the page names the old one; the tile and the line say so.
describe('workers that run another version (CHG-220)', () => {
  const ack = { status: 'ACK', bundleHash: 'h', jarSha256: 'j', receivedAt: 't' } as const;
  const w = (jobName: string, runs: { bundleId: string; version: number; scopeKind: string } | null, required = true) => ({ jobName, jarSha256: 'j', catalogueHash: 'c', ack, runs, required });
  it('names the version and how many run it; observers and matching workers are not counted', () => {
    const eff = { ...base, workers: [w('a', { bundleId: 'b8', version: 8, scopeKind: 'LOOP' }), w('b', { bundleId: 'b8', version: 8, scopeKind: 'LOOP' }), w('c', { bundleId: 'b', version: 1, scopeKind: 'LOOP' }),
      w('obs', { bundleId: 'b9', version: 9, scopeKind: 'LOOP' }, false)] } as unknown as EffectiveConfig;
    expect(runsElsewhere({ ...eff, workers: [w('z', { bundleId: 'b7', version: 7, scopeKind: 'LOOP' })] } as unknown as EffectiveConfig)?.text).toBe('Own settings v7 on 1 part');
    expect(runsElsewhere(eff)).toEqual({ count: 2, text: 'Own settings v8 on 2 parts' });
    expect(workerAlignment(eff)).toEqual({ value: '2 of 3 run another version', sub: 'Own settings v8 on 2 parts', tone: 'bad' });
  });
  it('nothing to say when every worker runs the version named, or the server sends no runs', () => {
    expect(runsElsewhere({ ...base, workers: [w('a', { bundleId: 'b', version: 1, scopeKind: 'LOOP' }), w('b', null)] } as unknown as EffectiveConfig)).toBeNull();
  });
});
