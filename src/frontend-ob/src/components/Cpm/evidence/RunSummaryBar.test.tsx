// Task 15: the run bar. Retained evidence and sufficiency are two different facts and are stated apart: the retention label
// says whether the arrays are held; "Loop result" is what the engine concluded. Reconstruct is disabled with its reason, never
// silently. CHG-187 (owner review 9, 11): the retention fact is ONE label ("Evidence kept" / "Evidence not kept") with a ? tip.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { RunSummaryBar } from './RunSummaryBar';
import { reEvaluatedLabel, retentionLabel } from './retention';
import type { GateState } from './GateResultState';
import type { MethodRun } from '../../../api/cpm/evidence';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string; variant?: string; 'aria-haspopup'?: string }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled, 'data-class': p.className ?? '', 'data-variant': p.variant, 'aria-haspopup': p['aria-haspopup'] }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
afterEach(cleanup);

const run: MethodRun = {
  methodRunId: '4ccaf304-0e8d-54df-94ef-83f4130ee28d', tier: 'fusion', gate: 'G5', loopId: 'FIC10405', site: 'hdpe', windowKind: '12h', gateResultId: 1,
  support: { fromMs: 0, toMs: 1, sampleCount: 1977 },
  identity: { bundleHash: 'profile:ffa30188e0775f18', contextRevision: 0, resultRevision: 1, purpose: 'LIVE', analysisRunId: null, sourceCommit: '3535c78aa45a', jarSha256: '4ea1da78ead8', datasetHash: 'ds', source: 'flink' },
  cell: { key: 'G5', name: 'Oscillation (ACF)', tier: 'long', status: 'WARN', reason: 'BANDWIDTH' }, verdictV2: null, result: null, methodRunIds: {},
  reconstruction: { supported: true, reason: '' }, computedAt: '2026-09-17T08:00:00Z',
};
const Probe: React.FC = () => { const l = useLocation(); return <div data-testid="loc">{l.pathname + l.search}</div>; };

const READY: GateState = { kind: 'READY', title: 'Ready', detail: '', stillValid: '', action: 'NONE', tone: 'good' };
const NOT_RETAINED: GateState = { kind: 'NOT_RETAINED', title: 'Evidence not retained for this run', detail: 'The live path keeps the arrays for windows with a finding.',
  stillValid: 'The verdict and every value of this run stand.', action: 'RECONSTRUCT', tone: 'muted' };
const bar = ({ readiness = 'COMPLETE', state = READY, ...over }: Partial<React.ComponentProps<typeof RunSummaryBar>> & { readiness?: string; state?: GateState } = {}) => render(
  <MemoryRouter initialEntries={['/cpm/evidence']}>
    <Routes><Route path="*" element={<>
      <RunSummaryBar run={run} retention={retentionLabel(readiness, 'RETAINED', state)} onReconstruct={() => {}} {...over} />
      <Probe />
    </>} /></Routes>
  </MemoryRouter>,
);

describe('RunSummaryBar', () => {
  it('states the evidence as kept, apart from the loop result, with its detail behind the ?', () => {
    bar();
    const text = screen.getByRole('list', { name: 'Run summary' }).textContent!;
    expect(text).toMatch(/Evidence kept/);
    expect(text).not.toMatch(/Proof retained|COMPLETE/);
    expect(screen.getByRole('button', { name: 'Evidence kept' })).toBeTruthy();
    expect(screen.queryByText(/kept by the retention policy/)).toBeNull();
    // CHG-162: the window and its samples are in the foot strip, the loop's result in the window dropdown
    expect(text).not.toMatch(/Loop result|pinned run|samples/);
    expect(text).not.toMatch(/3535c78aa45a|Calc version/);
    expect(text).not.toMatch(/MODE|FIXED|Mode/);
    // CHG-184 (owner review item 9): no run id and no copy button
    expect(screen.queryByTitle(run.methodRunId)).toBeNull();
    expect(screen.queryByRole('button', { name: /Copy run id/ })).toBeNull();
  });

  it('words a failed or expired proof as the reconstruction state, not as "Proof retained" (B6)', () => {
    bar({ readiness: 'FAILED' });
    let text = screen.getByRole('list', { name: 'Run summary' }).textContent!;
    expect(text).toMatch(/Reconstruction failed/);
    expect(text).not.toMatch(/Proof retained|Evidence kept/);
    cleanup();
    bar({ readiness: 'EXPIRED' });
    text = screen.getByRole('list', { name: 'Run summary' }).textContent!;
    expect(text).toMatch(/Reconstruction expired/);
    expect(text).not.toMatch(/Proof retained|FAILED|EXPIRED/);
  });

  it('says "Evidence not kept" when nothing is held, the policy and what still stands behind the ?', () => {
    bar({ readiness: 'NONE', state: NOT_RETAINED });
    const text = screen.getByRole('list', { name: 'Run summary' }).textContent!;
    expect(text).toMatch(/Evidence not kept/);
    expect(text).not.toMatch(/Proof retained|NONE|The verdict and every value/);
    expect(screen.getByRole('button', { name: 'Evidence not kept' })).toBeTruthy();
  });

  it('draws the measured-vs-required control before Reconstruct', () => {
    bar({ check: <button type="button">Measured vs required</button> });
    const names = screen.getAllByRole('button').map(b => b.textContent);
    expect(names.indexOf('Measured vs required')).toBeLessThan(names.findIndex(n => /Reconstruct evidence/.test(n ?? '')));
  });

  it('names a non-live purpose, and has no Run id link', () => {
    bar({ run: { ...run, identity: { ...run.identity, purpose: 'SHADOW' } } });
    expect(screen.getByText('SHADOW')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Run id/ })).toBeNull();
  });

  it('asks to reconstruct through its handler', () => {
    const onReconstruct = vi.fn();
    bar({ onReconstruct });
    fireEvent.click(screen.getByRole('button', { name: /Reconstruct evidence/ }));
    expect(onReconstruct).toHaveBeenCalledTimes(1);
  });

  it('disables Reconstruct with the reason on hover and in text', () => {
    const onReconstruct = vi.fn();
    bar({ onReconstruct, reconstructReason: 'Needs the cpm.analysis.create permission' });
    const b = screen.getByRole('button', { name: /Reconstruct evidence/ }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.parentElement!.getAttribute('title')).toBe('Needs the cpm.analysis.create permission');
    expect(screen.getByText('Needs the cpm.analysis.create permission')).toBeTruthy();
    fireEvent.click(b);
    expect(onReconstruct).not.toHaveBeenCalled();
  });

  // CHG-188 (owner review 15, Q4): Reconstruct opens a dialog, so it is an action button, not a "↗" link
  it('offers Reconstruct as a secondary button that opens a dialog, without ↗ or the link look', () => {
    bar();
    const b = screen.getByRole('button', { name: 'Reconstruct evidence' });
    expect(b.textContent).not.toMatch(/↗/);
    expect(b.getAttribute('data-class')).not.toMatch(/ui-link/);
    expect(b.getAttribute('data-variant')).toBe('normal');
    expect(b.getAttribute('aria-haspopup')).toBe('dialog');
    expect(screen.queryByText(/Reconstruction requested/)).toBeNull();
  });

  // CHG-188 (owner review 10.3): an evaluated window is one "Re-evaluated" label, not an EVALUATE pill beside it
  it('names an evaluated window "Re-evaluated" with its ?, and no EVALUATE pill', () => {
    bar({ run: { ...run, identity: { ...run.identity, purpose: 'EVALUATE' } }, retention: reEvaluatedLabel(Date.parse('2026-11-14T19:45:00Z'), 'UTC') });
    const text = screen.getByRole('list', { name: 'Run summary' }).textContent!;
    expect(text).toMatch(/Re-evaluated/);
    expect(text).not.toMatch(/EVALUATE|Evaluated from the historian|artifact/);
    expect(screen.queryByText('EVALUATE')).toBeNull();
    expect(screen.getByRole('button', { name: 'Re-evaluated' })).toBeTruthy();
    expect(screen.queryByText(/Kept 3 days/)).toBeNull();   // behind the ?
  });
});

describe('RunSummaryBar versions', () => {
  it('shows no versions', () => {
    const text = bar().container.textContent ?? '';
    expect(text).not.toMatch(/Calculation v|3535c78aa45a/);
  });
});
