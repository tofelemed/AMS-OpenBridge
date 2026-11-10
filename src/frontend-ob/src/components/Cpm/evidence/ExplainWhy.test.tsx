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
const useFusedRowMock = vi.hoisted(() => vi.fn());
vi.mock('./useFusedRow', () => ({ useFusedRow: useFusedRowMock }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
afterEach(cleanup);

const run = { loopId: 'FIC10405', support: { fromMs: 0, toMs: 1, sampleCount: 10 }, identity: { analysisRunId: null } } as unknown as MethodRun;
const show = (diagnosis: string) => {
  fused.diagnosis = diagnosis;
  useFusedRowMock.mockReturnValue({ row: { diagnosis: fused.diagnosis, observabilityFlags: [], verdictV2: null }, isLoading: false, isError: false });
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

// CHG-162 (owner review): the decision's evidence is two lines and a way to the hypotheses; the probability note is said once
describe('ExplainWhy, the decision gate', () => {
  const v2 = {
    legacy: false, observations: { OSCILLATION: { present: true, score: 1, methodId: 'G5.ACF', role: 'PRIMARY', basis: 'G5=WARN' } },
    hypotheses: { OSCILLATION_TUNING: { score: 1, state: 'QUALIFIED', evidenceGroups: ['OSCILLATION'], contradictions: [], disqualifiers: [] },
      STICTION: { score: 0, state: 'NO_EVIDENCE', evidenceGroups: [], contradictions: [], disqualifiers: [] } },
    leadingHypothesis: 'OSCILLATION_TUNING', confirmation: { claimType: 'X', state: 'NOT_APPLICABLE', reason: null, positiveEvidenceIds: [], contradictions: [], scope: null },
    resultRevision: 1,
  };
  it('names what was observed and the possible causes, offers the hypotheses, and lists nothing not seen', () => {
    const onHypotheses = vi.fn();
    vi.mocked(useFusedRowMock).mockReturnValue({ row: { diagnosis: 'CONFIRMED_OSCILLATION', observabilityFlags: [], verdictV2: v2 }, isLoading: false, isError: false });
    render(<QueryClientProvider client={new QueryClient()}><ExplainWhy gate="G15" run={run} manifest={undefined} eligibilityDetail={null} onHypotheses={onHypotheses} /></QueryClientProvider>);
    expect(screen.getByText('Possible cause').nextElementSibling?.textContent).toMatch(/Controller tuning \(leading\)/);
    expect(screen.queryByText(/Not seen in this window|Valve stiction/)).toBeNull();
    screen.getByRole('button', { name: 'Hypotheses ↗' }).click();
    expect(onHypotheses).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Evidence scores rank the explanations; they are not probabilities.')).toBeNull();
  });
});
