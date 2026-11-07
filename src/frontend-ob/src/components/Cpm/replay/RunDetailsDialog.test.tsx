// Task 18: Run details names the run, the bundle and the engine build, and does not equate retention with sufficiency.
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

describe('RunDetailsDialog', () => {
  it('shows the run identity, and says complete retention is not sufficiency', () => {
    const r = row('2026-10-05T12:30:00Z', { bundleHash: 'abcdef0123456789', methodRunIds: { G15: 'run-g15' }, replayId: 'aaaabbbbcccc' });
    render(<QueryClientProvider client={new QueryClient()}><RunDetailsDialog open onClose={() => {}} row={r} timeZone="UTC" /></QueryClientProvider>);
    expect(screen.getByText('Re-run aaaabbbbcccc')).toBeTruthy();
    expect(screen.getByText('run-g15')).toBeTruthy();
    expect(screen.getByText('abcdef012345')).toBeTruthy();
    expect(screen.getByText('COMPLETE')).toBeTruthy();
    expect(screen.getByText(/not that it was sufficient/)).toBeTruthy();
  });
});
