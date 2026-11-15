// CHG-188 (owner review 10.2, 15): a run dialog shows only the states the status APIs report, never a percent; Reconstruct is
// Running from the click until the manifest lists the rebuild settled, then Done; a refusal, a failed job, an empty rebuild or no
// result in 5 minutes is a failure with its reason.
import { describe, expect, it } from 'vitest';
import type { EvidenceManifest, EvidenceReconstruction } from '../../../api/cpm/evidence';
import { RECONSTRUCT_POLL_CAP_MS, RECONSTRUCT_TIMEOUT_MS, formatElapsed, inFlight, reconstructionPhase } from './runPhase';

const recon = (over: Partial<EvidenceReconstruction> = {}): EvidenceReconstruction => ({
  analysisRunId: 'ar1', state: 'FINISHED', createdAt: '2026-11-15T08:00:00Z', source: 'iotdb', differing: 2, identical: 1,
  readiness: 'COMPLETE', sourceCommit: null, jarSha256: null, artifacts: [], ...over,
});
const manifest = (reconstructions: EvidenceReconstruction[]): EvidenceManifest => ({
  methodRunId: 'run', etag: '', readiness: 'COMPLETE', count: 0, reconstructable: true,
  reconstruct: { purpose: 'EVIDENCE_RECONSTRUCTION', methodRunId: 'run', endpoint: '' }, artifacts: [], reconstructions,
});
const T0 = Date.parse('2026-11-15T08:00:00Z');
const base = { pending: false, analysisRunId: 'ar1', startedAt: T0, nowMs: T0 + 5_000 };

describe('formatElapsed', () => {
  it('writes the time since the click as m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(7_900)).toBe('0:07');
    expect(formatElapsed(90_000)).toBe('1:30');
    expect(formatElapsed(725_000)).toBe('12:05');
    expect(formatElapsed(-50)).toBe('0:00');
  });
});

describe('reconstructionPhase', () => {
  it('asks first, then is Running while the request is in flight and while the job runs', () => {
    expect(reconstructionPhase({ pending: false, nowMs: T0 })).toEqual({ step: 'IDLE' });
    expect(reconstructionPhase({ pending: true, nowMs: T0 })).toEqual({ step: 'RUNNING' });
    expect(reconstructionPhase({ ...base, runState: { state: 'SUBMITTED' }, manifest: manifest([recon({ readiness: 'PENDING', state: 'SUBMITTED' })]) }))
      .toEqual({ step: 'RUNNING' });
    // the job finished but the manifest has not listed the rebuild yet: still Running, never Done early
    expect(reconstructionPhase({ ...base, runState: { state: 'FINISHED' }, manifest: manifest([]) }).step).toBe('RUNNING');
    expect(inFlight({ step: 'RUNNING' })).toBe(true);
    expect(inFlight({ step: 'DONE' })).toBe(false);
  });

  it('is Done once the manifest lists the rebuild with a final readiness', () => {
    for (const readiness of ['COMPLETE', 'IDENTICAL', 'IDENTITY_CHANGED', 'SUPERSEDED'] as const)
      expect(reconstructionPhase({ ...base, manifest: manifest([recon({ readiness })]) })).toEqual({ step: 'DONE' });
  });

  it('fails with the reason: refused, job failed or cancelled, rebuild failed or empty', () => {
    expect(reconstructionPhase({ ...base, error: new Error('503 engine busy') })).toEqual({ step: 'FAILED', reason: 'Reconstruction refused: 503 engine busy' });
    expect(reconstructionPhase({ ...base, runState: { state: 'FAILED', error: 'out of memory' } }).reason).toBe('The reconstruction job failed: out of memory');
    expect(reconstructionPhase({ ...base, runState: { state: 'SUBMIT_FAILED' } }).reason).toBe('The reconstruction job failed.');
    expect(reconstructionPhase({ ...base, runState: { state: 'CANCELED' } }).reason).toBe('The reconstruction job was cancelled.');
    expect(reconstructionPhase({ ...base, manifest: manifest([recon({ readiness: 'FAILED' })]) }).reason).toBe('The reconstruction failed.');
    expect(reconstructionPhase({ ...base, manifest: manifest([recon({ readiness: 'NONE' })]) }).reason).toBe('It produced no evidence for this run.');
  });

  it('gives up after 5 minutes without a result, saying it may still arrive', () => {
    const late = reconstructionPhase({ ...base, nowMs: T0 + RECONSTRUCT_TIMEOUT_MS + 1, runState: { state: 'SUBMITTED' } });
    expect(late.step).toBe('FAILED');
    expect(late.reason).toMatch(/No result after 5 minutes/);
    expect(reconstructionPhase({ ...base, nowMs: T0 + RECONSTRUCT_TIMEOUT_MS - 1 }).step).toBe('RUNNING');
  });

  // CHG-193 (final review M2, M3): after 5 minutes Keep waiting is offered (a Retry would post a second job), and it counts the
  // next 5 minutes from itself; 30 minutes after the click the page stops asking, with no Keep waiting
  it('offers Keep waiting after 5 minutes, counting the next wait from the last Keep waiting', () => {
    expect(reconstructionPhase({ ...base, nowMs: T0 + RECONSTRUCT_TIMEOUT_MS + 1 })).toMatchObject({ step: 'FAILED', keepWaiting: true });
    const waitFrom = T0 + 6 * 60_000;
    expect(reconstructionPhase({ ...base, waitFrom, nowMs: waitFrom + RECONSTRUCT_TIMEOUT_MS - 1 }).step).toBe('RUNNING');
    expect(reconstructionPhase({ ...base, waitFrom, nowMs: waitFrom + RECONSTRUCT_TIMEOUT_MS + 1 })).toMatchObject({ step: 'FAILED', keepWaiting: true });
    // other failures offer no Keep waiting
    expect(reconstructionPhase({ ...base, runState: { state: 'FAILED' } }).keepWaiting).toBeUndefined();
  });

  it('stops 30 minutes after the click, whatever Keep waiting did, saying it may still finish', () => {
    const end = reconstructionPhase({ ...base, waitFrom: T0 + 29 * 60_000, nowMs: T0 + RECONSTRUCT_POLL_CAP_MS + 1 });
    expect(end.step).toBe('FAILED');
    expect(end.keepWaiting).toBeUndefined();
    expect(end.reason).toMatch(/^No result after 30 minutes[.] It may still finish/);
    // a rebuild listed in time is still Done
    expect(reconstructionPhase({ ...base, nowMs: T0 + RECONSTRUCT_POLL_CAP_MS + 1, manifest: manifest([recon()]) }).step).toBe('DONE');
  });
});
