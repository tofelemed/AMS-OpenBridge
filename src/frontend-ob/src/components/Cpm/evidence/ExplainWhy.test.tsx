// Task 15 fix + Task 16: the whole-window sentence is said only of a window the engine did not judge (too few samples, or an
// exclusion), never of INSUFFICIENT_EVIDENCE, which is a verdict. It never says "no verdict": the gates of a short window
// read Insufficient evidence (gateMark), which is one.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExplainWhy } from './ExplainWhy';
import type { MethodRun } from '../../../api/cpm/evidence';

const fused = vi.hoisted(() => ({ diagnosis: 'INSUFFICIENT_EVIDENCE' as string }));
vi.mock('./useFusedRow', () => ({
  useFusedRow: () => ({ row: { diagnosis: fused.diagnosis, observabilityFlags: [], verdictV2: null }, isLoading: false, isError: false }),
}));
vi.mock('../CauseBreakdown', () => ({ CauseBreakdownRows: () => null }));
afterEach(cleanup);

const run = { loopId: 'FIC10405', support: { fromMs: 0, toMs: 1, sampleCount: 10 }, identity: { analysisRunId: null } } as unknown as MethodRun;
const show = (diagnosis: string) => {
  fused.diagnosis = diagnosis;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ExplainWhy gate="G15" run={run} manifest={undefined} eligibilityDetail={null} />
    </QueryClientProvider>,
  );
};

describe('ExplainWhy, the whole-window sentence', () => {
  it('does not say a no-fault window carries no verdict', () => {
    show('INSUFFICIENT_EVIDENCE');
    expect(screen.queryByText(/no diagnosis|not enough to reach/)).toBeNull();
    expect(screen.queryByText(/The whole window/)).toBeNull();
  });

  it('still says it of a window with too few samples', () => {
    show('INSUFFICIENT_DATA');
    expect(screen.getByText(/^The whole window: not evaluated: not enough data\.$/)).toBeTruthy();
    expect(screen.queryByText(/carries a verdict/)).toBeNull();   // its gates read Insufficient evidence, which is a verdict word
  });

  it('still says it of an excluded window, with its real reason', () => {
    show('EXCLUDED_MODE');
    expect(screen.getByText(/^The whole window: excluded: loop not in automatic\.$/)).toBeTruthy();
  });
});
