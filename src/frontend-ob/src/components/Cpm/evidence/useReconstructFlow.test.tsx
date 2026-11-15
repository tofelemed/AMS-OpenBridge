// @vitest-environment jsdom
// CHG-193 (final review M2, M3, M4): Reconstruct after the time limit, the end of polling, and the switch to the rebuilt view.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { EvidenceManifest } from '../../../api/cpm/evidence';
import { RECONSTRUCT_POLL_CAP_MS, RECONSTRUCT_TIMEOUT_MS } from './runPhase';

const mutation = { isPending: false, isSuccess: false, isError: false, error: null as unknown, data: undefined as unknown, mutate: vi.fn(), reset: vi.fn() };
let manifest: EvidenceManifest | undefined;
vi.mock('./useEvidence', () => ({
  useReconstruct: vi.fn(() => mutation),
  useAnalysisRunState: vi.fn(() => ({ data: { state: 'SUBMITTED' } })),
  useEvidenceManifest: vi.fn(() => ({ data: manifest, refetch: vi.fn() })),
}));

import { useAnalysisRunState, useEvidenceManifest } from './useEvidence';
import { RECONSTRUCTION_POLL_MS, useReconstructFlow } from './useReconstructFlow';

const RUN = 'run-1';
const T0 = Date.parse('2026-11-15T08:00:00Z');
const base: EvidenceManifest = {
  methodRunId: RUN, etag: '', readiness: 'NONE', count: 0, reconstructable: true,
  reconstruct: { purpose: 'EVIDENCE_RECONSTRUCTION', methodRunId: RUN, endpoint: '' }, artifacts: [], reconstructions: [],
};
// the retained proof is complete, so the rebuild is switched to (not shown by itself)
const art = { readiness: 'COMPLETE' } as unknown as EvidenceManifest['artifacts'][number];
const rebuilt: EvidenceManifest = { ...base, readiness: 'COMPLETE', artifacts: [art], reconstructions: [{ analysisRunId: 'ar-1', state: 'FINISHED',
  createdAt: '2026-11-15T08:00:20Z', source: 'iotdb', differing: 1, identical: 1, readiness: 'COMPLETE', sourceCommit: null, jarSha256: null, artifacts: [art] }] };

/** The POST was accepted: the reconstruction ar-1 of RUN. */
const accept = () => Object.assign(mutation, { isSuccess: true, data: { analysisRunId: 'ar-1', reconstructs: RUN } });
const lastManifestPoll = () => vi.mocked(useEvidenceManifest).mock.calls.at(-1)?.[1];
const lastRunStatePoll = () => vi.mocked(useAnalysisRunState).mock.calls.at(-1)?.[1];

describe('useReconstructFlow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    Object.assign(mutation, { isPending: false, isSuccess: false, isError: false, error: null, data: undefined });
    mutation.mutate.mockReset(); mutation.reset.mockReset();
    manifest = base;
    vi.mocked(useEvidenceManifest).mockClear(); vi.mocked(useAnalysisRunState).mockClear();
  });
  afterEach(() => { vi.useRealTimers(); });

  const start = (onView = vi.fn()) => {
    const hook = renderHook(() => useReconstructFlow(RUN, onView));
    act(() => { hook.result.current.ask(); });
    act(() => { hook.result.current.confirm(); });
    accept();
    hook.rerender();
    return { hook, onView };
  };

  it('after 5 minutes Keep waiting runs the wait again and posts nothing new', () => {
    const { hook } = start();
    expect(hook.result.current.phase.step).toBe('RUNNING');
    act(() => { vi.advanceTimersByTime(RECONSTRUCT_TIMEOUT_MS + 1_000); });
    expect(hook.result.current.phase).toMatchObject({ step: 'FAILED', keepWaiting: true });
    act(() => { hook.result.current.keepWaiting(); });
    expect(hook.result.current.phase.step).toBe('RUNNING');
    expect(hook.result.current.startedAt).toBe(T0);   // the time shown still counts from the click
    expect(mutation.mutate).toHaveBeenCalledTimes(1);
  });

  it('stops reading the manifest and the run state 30 minutes after the click', () => {
    const { hook } = start();
    expect(lastManifestPoll()).toBe(RECONSTRUCTION_POLL_MS);
    expect(lastRunStatePoll()).toBe(RECONSTRUCTION_POLL_MS);
    for (let m = 5; m < 30; m += 5) {
      act(() => { vi.advanceTimersByTime(RECONSTRUCT_TIMEOUT_MS + 1_000); });
      act(() => { hook.result.current.keepWaiting(); });
    }
    expect(lastManifestPoll()).toBe(RECONSTRUCTION_POLL_MS);
    act(() => { vi.advanceTimersByTime(RECONSTRUCT_POLL_CAP_MS); });
    expect(lastManifestPoll()).toBeUndefined();
    expect(lastRunStatePoll()).toBeUndefined();
    expect(hook.result.current.phase.reason).toMatch(/^No result after 30 minutes\. It may still finish/);
    expect(hook.result.current.phase.keepWaiting).toBeUndefined();
  });

  it('switches to the rebuilt view even when the dialog is closed inside the Done delay', () => {
    const { hook, onView } = start();
    manifest = rebuilt;
    hook.rerender();
    expect(hook.result.current.phase.step).toBe('DONE');
    act(() => { vi.advanceTimersByTime(300); });
    act(() => { hook.result.current.close(); });
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(onView).toHaveBeenCalledWith('ar-1');
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it('closes the dialog by itself after Done', () => {
    const { hook, onView } = start();
    manifest = rebuilt;
    hook.rerender();
    expect(hook.result.current.open).toBe(true);
    act(() => { vi.advanceTimersByTime(1_300); });
    expect(hook.result.current.open).toBe(false);
    expect(onView).toHaveBeenCalledTimes(1);
  });
});
