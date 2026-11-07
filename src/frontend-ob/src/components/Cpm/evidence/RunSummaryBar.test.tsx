// Task 15: the run bar. Retained proof and sufficiency are two different facts and are stated apart:
// "Proof retained" is whether the arrays are held; "Loop result" is what the engine concluded. The run is
// pinned, which is not the controller's mode. Reconstruct is disabled with its reason, never silently.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { RunSummaryBar } from './RunSummaryBar';
import type { MethodRun } from '../../../api/cpm/evidence';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
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
const selection = { loopId: 'FIC10405', methodRunId: run.methodRunId, gate: 'G5', mode: 'FIXED' as const };
const Probe: React.FC = () => { const l = useLocation(); return <div data-testid="loc">{l.pathname + l.search}</div>; };

const bar = (over: Partial<React.ComponentProps<typeof RunSummaryBar>> = {}) => render(
  <MemoryRouter initialEntries={['/cpm/evidence']}>
    <Routes><Route path="*" element={<>
      <RunSummaryBar run={run} selection={selection} readiness="COMPLETE" loopResult="No fault identified" onReconstruct={() => {}} {...over} />
      <Probe />
    </>} /></Routes>
  </MemoryRouter>,
);

describe('RunSummaryBar', () => {
  it('states proof retained apart from the loop result, and the run as pinned', () => {
    bar();
    const text = screen.getByRole('list', { name: 'Run summary' }).textContent!;
    expect(text).toMatch(/Proof retained · COMPLETE/);
    expect(text).toMatch(/Loop result.*No fault identified/);
    expect(text).toMatch(/12h pinned run/);
    expect(text).toMatch(/1,977 samples/);
    expect(text).not.toMatch(/3535c78aa45a|Calc version/);
    expect(text).not.toMatch(/MODE|FIXED|Mode/);
    expect(screen.getByTitle(run.methodRunId)).toBeTruthy();
  });

  it('leaves the retention fact to the panel when nothing is held', () => {
    bar({ readiness: 'NONE' });
    expect(screen.getByRole('list', { name: 'Run summary' }).textContent).not.toMatch(/Proof retained|NONE/i);
  });

  it('names a non-live purpose and opens the run by its link', () => {
    bar({ run: { ...run, identity: { ...run.identity, purpose: 'SHADOW' } } });
    expect(screen.getByText('SHADOW')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Run id/ }));
    expect(screen.getByTestId('loc').textContent).toBe(`/cpm/evidence?loop=FIC10405&methodRun=${run.methodRunId}&gate=G5&mode=FIXED&sub=identity`);
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

  it('shows the request while it is in flight', () => {
    bar({ reconstructPending: true });
    const b = screen.getByRole('button', { name: /Reconstruction requested/ }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
  });
});

describe('RunSummaryBar versions', () => {
  it('reads the versions as Replay does and keeps the build hash off the bar', () => {
    bar({ versions: 'Calculation v3.0.0 · profile v2.0.0' });
    const text = screen.getByRole('list', { name: 'Run summary' }).textContent!;
    expect(text).toContain('Calculation v3.0.0 · profile v2.0.0');
    expect(text).not.toMatch(/3535c78aa45a|CALC VERSION|Calc version/i);
  });
});
