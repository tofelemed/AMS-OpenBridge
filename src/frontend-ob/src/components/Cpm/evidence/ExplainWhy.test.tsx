// Task 15 fix + Task 16: the whole-window sentence is said only of a window the engine did not judge (too few samples, or an
// exclusion), never of INSUFFICIENT_EVIDENCE, which is a verdict. It never says "no verdict": the gates of a short window
// read Insufficient evidence (gateMark), which is one. CHG-187 (owner review 9, 11.1): the facts live in the gate head's
// "Measured vs required" dialog (MeasuredCheck): a table of measure · measured · required · pass / fail, then what remains
// open only when something does; a state-only gate shows "State check" and no measured button.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MeasuredCheck } from './MeasuredCheck';
import { requiredText } from './ExplainWhy';
import type { MethodRun } from '../../../api/cpm/evidence';

const useFusedRowMock = vi.hoisted(() => vi.fn());
vi.mock('./useFusedRow', () => ({ useFusedRow: useFusedRowMock }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
afterEach(cleanup);

const run = { loopId: 'FIC10405', support: { fromMs: 0, toMs: 1, sampleCount: 10 }, identity: { analysisRunId: null } } as unknown as MethodRun;
const rowWith = (over: Record<string, unknown>) =>
  useFusedRowMock.mockReturnValue({ row: { diagnosis: 'CONFIRMED_OSCILLATION', observabilityFlags: [], verdictV2: null, metrics: {}, gates: [], ...over }, isLoading: false, isError: false });
const check = (gate: string, onHypotheses?: () => void) => render(
  <QueryClientProvider client={new QueryClient()}>
    <MeasuredCheck gate={gate} run={run} manifest={undefined} eligibilityDetail={null} subtitle={`FIC10405 · ${gate}`} onHypotheses={onHypotheses} />
  </QueryClientProvider>,
);
const openDialog = (name = 'Measured vs required') => { fireEvent.click(screen.getByRole('button', { name })); return screen.getByRole('dialog'); };

describe('MeasuredCheck, the whole-window sentence', () => {
  it('does not say a no-fault window carries no verdict', () => {
    rowWith({ diagnosis: 'INSUFFICIENT_EVIDENCE' });
    check('G15');
    expect(screen.queryByText(/no diagnosis|not enough to reach/)).toBeNull();
    expect(screen.queryByText(/The whole window/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'What remains open' })).toBeNull();
  });

  it('still says it of a window with too few samples', () => {
    rowWith({ diagnosis: 'INSUFFICIENT_DATA' });
    check('G15');
    const d = openDialog('What remains open');
    expect(within(d).getByText(/^The whole window: not evaluated: not enough data\.$/)).toBeTruthy();
    expect(within(d).queryByText(/carries a verdict/)).toBeNull();   // its gates read Insufficient evidence, which is a verdict word
  });

  it('still says it of an excluded window, with its real reason', () => {
    rowWith({ diagnosis: 'EXCLUDED_MODE' });
    check('G15');
    expect(within(openDialog('What remains open')).getByText(/^The whole window: excluded: loop not in automatic\.$/)).toBeTruthy();
  });
});

describe('MeasuredCheck, the gate head control', () => {
  it('opens a dialog with the cyan head, loop · gate, and a measure · measured · required · pass / fail table', () => {
    rowWith({ metrics: { persistence_agree_count: 2, persistence_windows_required: 3 } });
    check('G15');
    const d = openDialog();
    expect(d.textContent).toContain('FIC10405 · G15');
    expect(within(d).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Measure', 'Measured', 'Required', 'Pass / fail']);
    const r = within(d).getByRole('row', { name: /Agreeing windows/ });
    expect(r.textContent).toContain('≥ 3 to persist');
    expect(r.textContent).toContain('Fail');
    expect(within(d).queryByText(/What remains open/)).toBeNull();          // nothing open: no section, no "Nothing open" line
    expect(within(d).queryByText(/Nothing this window flags/)).toBeNull();
  });

  it('shows "State check" and no measured button for a gate that reports only a state', () => {
    rowWith({});
    check('G8');
    expect(screen.getByText('State check')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'State check' })).toBeTruthy();   // its ? holds the sentence
    expect(screen.queryByRole('button', { name: 'Measured vs required' })).toBeNull();
    expect(screen.queryByText(/This gate reports a state/)).toBeNull();
  });

  it('keeps a state-only gate\'s open limits behind "What remains open", never drops them', () => {
    rowWith({ observabilityFlags: ['INSUFFICIENT_SAMPLES'] });
    check('G8');
    const d = openDialog('What remains open');
    expect(within(d).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(within(d).getAllByRole('heading', { name: 'What remains open' })).toHaveLength(1);   // the dialog's title says it, once
  });

  // CHG-162: the decision's evidence is two lines and a way to the hypotheses; the probability note is said once
  it('names what was observed and the possible causes, offers the hypotheses, and lists nothing not seen', () => {
    const onHypotheses = vi.fn();
    const v2 = {
      legacy: false, observations: { OSCILLATION: { present: true, score: 1, methodId: 'G5.ACF', role: 'PRIMARY', basis: 'G5=WARN' } },
      hypotheses: { OSCILLATION_TUNING: { score: 1, state: 'QUALIFIED', evidenceGroups: ['OSCILLATION'], contradictions: [], disqualifiers: [] },
        STICTION: { score: 0, state: 'NO_EVIDENCE', evidenceGroups: [], contradictions: [], disqualifiers: [] } },
      leadingHypothesis: 'OSCILLATION_TUNING', confirmation: { claimType: 'X', state: 'NOT_APPLICABLE', reason: null, positiveEvidenceIds: [], contradictions: [], scope: null },
      resultRevision: 1,
    };
    rowWith({ verdictV2: v2, metrics: { persistence_agree_count: 3, persistence_windows_required: 3 } });
    check('G15', onHypotheses);
    const d = openDialog();
    expect(within(d).getByText('Possible cause').nextElementSibling?.textContent).toMatch(/Controller tuning \(leading\)/);
    expect(within(d).queryByText(/Not seen in this window|Valve stiction/)).toBeNull();
    within(d).getByRole('button', { name: 'Hypotheses ↗' }).click();
    expect(onHypotheses).toHaveBeenCalledTimes(1);
    expect(within(d).queryByText('Evidence scores rank the explanations; they are not probabilities.')).toBeNull();
  });

  it('does not repeat "required" under the Required heading', () => {
    expect(requiredText('≥ 5 required')).toBe('≥ 5');
    expect(requiredText('≥ 3 required to persist')).toBe('≥ 3 to persist');
    expect(requiredText('no threshold configured for this profile')).toBe('No threshold configured');
    expect(requiredText('')).toBe('—');
  });
});
