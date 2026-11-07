// Task 15 fix: "no gate on it carries a verdict" was said of every INSUFFICIENT* window, including
// INSUFFICIENT_EVIDENCE, which is a verdict (no fault reached the evidence threshold). It is said only of a window
// the engine did not judge: too few samples, or an exclusion.
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
      <ExplainWhy gate="G15" name="Decision" run={run} manifest={undefined} status="INSUFFICIENT_EVIDENCE" reason={null} eligibilityDetail={null} />
    </QueryClientProvider>,
  );
};

describe('ExplainWhy, the whole-window sentence', () => {
  it('does not say a no-fault window carries no verdict', () => {
    show('INSUFFICIENT_EVIDENCE');
    expect(screen.queryByText(/no gate on it carries a verdict/)).toBeNull();
    expect(screen.queryByText(/The whole window/)).toBeNull();
  });

  it('still says it of a window with too few samples', () => {
    show('INSUFFICIENT_DATA');
    expect(screen.getByText(/The whole window: .* — no gate on it carries a verdict/)).toBeTruthy();
  });

  it('still says it of an excluded window, with its real reason', () => {
    show('EXCLUDED_MODE');
    expect(screen.getByText(/The whole window: excluded: loop not in automatic — no gate on it carries a verdict/)).toBeTruthy();
  });
});
