import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import JobDialog from './JobDialog';
import type { JobRow } from './mergeJobs';

vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
afterEach(cleanup);

const row = (over: Partial<JobRow> = {}): JobRow => ({
  name: 'AMS - CPLM Gate Fusion Engine', role: 'cplm', state: 'RUNNING', running: true, required: true, jid: 'abc123',
  startTime: '2026-11-07T00:00:00Z', uptimeSec: 7200,
  checkpoint: { completed: 40, failed: 2, lastDurationMs: 1500, lastSizeBytes: 3_145_728, lastCompletedAgeSec: 12 }, ...over,
});

describe('JobDialog', () => {
  it('opens a job in a read-only dialog', () => {
    render(<JobDialog job={row()} onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('3.0 MB')).toBeTruthy();
    expect(screen.getByText('1.5 s')).toBeTruthy();
    expect(screen.getByText('2h 0m')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('shows Not exposed, never an estimate', () => {
    render(<JobDialog job={row({ checkpoint: null, uptimeSec: null, jid: null, state: 'MISSING', running: false })} onClose={() => {}} />);
    expect(screen.getAllByText('Not exposed').length).toBeGreaterThanOrEqual(4);
  });

  it('keeps the engine job id in Technical details', () => {
    render(<JobDialog job={row()} onClose={() => {}} />);
    expect(screen.getByText('Technical details')).toBeTruthy();
    expect(screen.getByText('abc123')).toBeTruthy();
  });
});
