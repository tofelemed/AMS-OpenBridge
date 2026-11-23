// CHG-169 (owner review): the Shadow tab. Run shadow is the one control (the lifecycle's Shadow button only switched tabs);
// it sends the same request as before (the loop only for a bundle that is not a LOOP bundle, hours default 24). A version
// that is frozen no longer says "Validate the bundle first" (it is validated, it is frozen: the reason is said once above).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../../api/apiFetch';
import { ShadowComparison } from './ShadowComparison';
import type { Bundle } from '../../../api/cpm/config';

vi.mock('../../../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/apiFetch')>();
  return { ...actual, apiJson: vi.fn() };
});
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);
beforeEach(() => { vi.mocked(fetchMod.apiJson).mockReset(); });

const bundle = (over: Partial<Bundle>): Bundle => ({
  bundleId: 'b1', version: 1, contentHash: 'h', site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10301', state: 'VALIDATED', shadow: null, layers: [], resolved: { properties: {}, sources: {} }, ...over,
} as unknown as Bundle);
const view = (b: Bundle, extra: Partial<React.ComponentProps<typeof ShadowComparison>> = {}) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ShadowComparison bundle={b} defaultLoopId="FIC10301" canShadow pending={false} error={null} onStart={() => {}} {...extra} />
  </QueryClientProvider>);

describe('ShadowComparison', () => {
  it('a validated LOOP bundle runs over its own loop: the request carries no loop, the hours typed', () => {
    const onStart = vi.fn();
    view(bundle({}), { onStart });
    expect(screen.getByText('Shadow evaluation')).toBeTruthy();
    expect(screen.getByText('Not run')).toBeTruthy();
    expect((screen.getByLabelText('Loop') as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run shadow' }));
    expect(onStart).toHaveBeenCalledWith({ loopId: undefined, hours: 12 });
  });

  it('a SITE bundle names the loop to run over; a blank hours field sends 24', () => {
    const onStart = vi.fn();
    view(bundle({ scopeKind: 'SITE', scopeRef: null }), { onStart, defaultLoopId: undefined });
    fireEvent.change(screen.getByLabelText('Loop'), { target: { value: 'FIC10401' } });
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run shadow' }));
    expect(onStart).toHaveBeenCalledWith({ loopId: 'FIC10401', hours: 24 });
  });

  it('a draft says to validate first; a frozen version says nothing under the button; no permission says so', () => {
    view(bundle({ state: 'DRAFT' }));
    expect(screen.getByText('Validate the bundle first — only a validated bundle can be shadow-run')).toBeTruthy();
    cleanup();
    view(bundle({ state: 'ACTIVE_VERIFIED' }));
    expect((screen.getByRole('button', { name: 'Run shadow' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/Validate the bundle first/)).toBeNull();
    cleanup();
    view(bundle({}), { canShadow: false });
    expect(screen.getByText('Needs the cpm.config.shadow permission')).toBeTruthy();
  });

  it('while starting it says Starting…; a refusal is shown', () => {
    view(bundle({}), { pending: true, error: new Error('validate the draft first (state DRAFT)') });
    expect((screen.getByRole('button', { name: 'Starting…' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toMatch(/validate the draft first/);
  });

  it('names the loop a shadow run used, never the run id (CHG-184)', () => {
    vi.mocked(fetchMod.apiJson).mockImplementation(() => new Promise(() => {}));
    view(bundle({ shadow: { analysisRunId: '7c1e04a2-9b3d-4e5f-a1b2-c3d4e5f60718', loopId: 'FIC10301' } }));
    expect(screen.getByText('Run on')).toBeTruthy();
    expect(screen.queryByText(/7c1e04a2/)).toBeNull();
  });
});

// CHG-220 (Gate Configuration check, gap 7): the comparison stopped at "Submitted" (only "Running" was read again), Run again
// showed the previous run, and an edited draft showed the comparison of its old content.
describe('ShadowComparison keeps to the current run and content (CHG-220)', () => {
  const report = (over: Record<string, unknown>) => ({ bundleId: 'b1', analysisRunId: 'r1', runState: 'FINISHED', loopId: 'FIC10301', fromMs: 0, toMs: 1, shadowRows: 3,
    comparedWindows: 3, symptomsRemoved: 1, symptomsAdded: 0, reclassification: null, comparedAt: 't', windows: [], ...over });

  it('a submitted run reads as in progress and is read again until it ends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(fetchMod.apiJson).mockResolvedValueOnce(report({ runState: 'SUBMITTED', shadowRows: 0, comparedWindows: 0, symptomsRemoved: 0 }) as never)
        .mockResolvedValue(report({}) as never);
      view(bundle({ state: 'SHADOW_EVALUATED', shadow: { analysisRunId: 'r1', loopId: 'FIC10301', contentHash: 'h' } as never }));
      expect(await screen.findByText('Submitted')).toBeTruthy();
      await vi.advanceTimersByTimeAsync(10_500);
      expect(await screen.findByText('Finished')).toBeTruthy();
      expect(screen.getByText(/1 removed · 0 added/)).toBeTruthy();
    } finally { vi.useRealTimers(); }
  });

  it('a run of content the draft no longer has is not its comparison', async () => {
    vi.mocked(fetchMod.apiJson).mockResolvedValue(report({}) as never);
    view(bundle({ contentHash: 'h2', shadow: { analysisRunId: 'r1', loopId: 'FIC10301', contentHash: 'h1' } as never }));
    expect(screen.getByText('The draft changed after the last run.')).toBeTruthy();
    expect(screen.getByText('Not run')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Run again' })).toBeTruthy();
    expect(screen.queryByText(/removed ·/)).toBeNull();
    expect(fetchMod.apiJson).not.toHaveBeenCalled();
  });
});
