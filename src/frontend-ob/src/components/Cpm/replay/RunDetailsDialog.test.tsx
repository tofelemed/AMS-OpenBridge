// Task 18: Run details names the run, the bundle and the engine build, and does not equate retention with sufficiency.
// CHG-166 (owner review, question 3): shared by Replay and Calculations; each page's foot strip says the window, the result
// and the samples, so the dialog does not, and Computed reads as a time with its zone named.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { row } from '../evidence/windowFixtures';
import { RunDetailsDialog } from './RunDetailsDialog';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('../evidence/useEvidence', () => ({ useEvidenceManifest: () => ({ data: { readiness: 'COMPLETE' } }) }));
afterEach(cleanup);

const mount = (r: ReturnType<typeof row>, timeZone = 'UTC') =>
  render(<QueryClientProvider client={new QueryClient()}><RunDetailsDialog open onClose={() => {}} row={r} timeZone={timeZone} /></QueryClientProvider>);

describe('RunDetailsDialog', () => {
  it('shows the run identity, and says complete retention is not sufficiency', () => {
    mount(row('2026-10-05T12:30:00Z', { bundleHash: 'abcdef0123456789', methodRunIds: { G15: 'run-g15' }, replayId: 'aaaabbbbcccc' }));
    expect(screen.getByText('run-g15')).toBeTruthy();
    expect(screen.getByText('abcdef012345')).toBeTruthy();
    expect(screen.getByText('COMPLETE')).toBeTruthy();
    expect(screen.getByText(/not that it was sufficient/)).toBeTruthy();
  });

  it('leaves the window, the result and the samples to the page foot', () => {
    mount(row('2026-10-05T12:30:00Z', { replayId: 'aaaabbbbcccc', sampleCount: 8221 }));
    for (const label of ['Window', 'Result', 'Samples']) expect(screen.queryByText(label)).toBeNull();
    expect(screen.queryByText('Re-run aaaabbbbcccc')).toBeNull();
    expect(screen.queryByText(/8,221|8221/)).toBeNull();
  });

  it('reads Computed as a time with its zone named, not an ISO string', () => {
    const r = row('2026-11-06T22:45:00Z');
    r.metadata = { ...r.metadata, computedAt: '2026-11-06T22:48:20.195929Z' };
    mount(r);
    expect(screen.getByText('Computed').nextSibling?.textContent).toBe('6 Nov 22:48 UTC');
    expect(screen.queryByText(/2026-11-06T22:48/)).toBeNull();
  });

  it('says Not reported when no compute time is stored', () => {
    const r = row('2026-11-06T22:45:00Z');
    r.metadata = { ...r.metadata, computedAt: null as unknown as string };
    mount(r);
    expect(screen.getByText('Computed').nextSibling?.textContent).toBe('Not reported');
  });
});
