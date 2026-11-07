import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PipelineTiles, { JOBS_ID } from './PipelineTiles';
import type { JobRow } from './mergeJobs';

vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
afterEach(cleanup);

const row = (name: string, age: number | null, required = true): JobRow => ({
  name, role: 'cplm', state: 'RUNNING', running: true, required, jid: 'j', startTime: null, uptimeSec: 60,
  checkpoint: age == null ? null : { completed: 5, failed: 0, lastDurationMs: 10, lastSizeBytes: 1, lastCompletedAgeSec: age },
});

describe('PipelineTiles', () => {
  const rows = [row('AMS - Fast', 5), row('AMS - Slow', 90), row('AMS - Extra', 400, false)];
  const props = { rows, statusLoaded: true, statusError: false, engineAnswering: true, allRequiredRunning: true };

  it('names the job behind the oldest checkpoint age and counts only required jobs', () => {
    render(<PipelineTiles {...props} />);
    expect(screen.getByText('oldest: Extra')).toBeTruthy();
    expect(screen.getByText('2/2')).toBeTruthy();
  });

  it('leads to the jobs table and gives it focus', () => {
    render(<><PipelineTiles {...props} /><section id={JOBS_ID} tabIndex={-1} /></>);
    fireEvent.click(screen.getByText('Required jobs'));
    expect(document.activeElement?.id).toBe(JOBS_ID);
  });
});
