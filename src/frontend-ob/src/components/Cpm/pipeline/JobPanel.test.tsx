// CHG-170 (owner answer 1): the selected job in a panel beside the list (today's job dialog; a drawer below 1280 px): the role as
// eyebrow, the job once, its state; the five numbers; a missing job says why it has no numbers. The engine's name, id and start
// time sit in Record details ("Started · UTC" over "7 Nov 00:00").
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { setActiveZone } from '../../../cpa/activeZone';
import JobPanel from './JobPanel';
import type { JobRow } from './mergeJobs';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
beforeAll(() => setActiveZone('UTC'));
afterEach(cleanup);

const row = (over: Partial<JobRow> = {}): JobRow => ({
  name: 'AMS - CPLM Gate Fusion Engine', role: 'cplm', state: 'RUNNING', running: true, required: true, jid: '0f5aa1b5c8efc8b4656824250891c564',
  startTime: '2026-11-07T00:00:00Z', uptimeSec: 7200,
  checkpoint: { completed: 40, failed: 2, lastDurationMs: 1500, lastSizeBytes: 3_145_728, lastCompletedAgeSec: 12 }, ...over,
});

describe('JobPanel', () => {
  it('heads the panel with the role, the job once and its state, then the five numbers', () => {
    const { container } = render(<JobPanel job={row()} open onClose={() => {}} />);
    const panel = container.querySelector('.ui-inspector') as HTMLElement;
    expect(within(panel).getByText('CPLM').className).toContain('ui-inspector__eyebrow');
    expect(within(panel).getByRole('heading', { level: 2, name: 'CPLM Gate Fusion Engine' })).toBeTruthy();
    expect(within(panel).getByText('Running')).toBeTruthy();
    const rows = [...panel.querySelectorAll('.cpm-kv')].map(k => [k.querySelector('.cpm-kv__label')?.textContent, k.querySelector('.cpm-kv__value')?.textContent]);
    expect(rows).toEqual([
      ['Uptime', '2h 0m'], ['Checkpoints ok / failed', '40 / 2'], ['Last checkpoint age', '12 s'],
      ['Last checkpoint duration', '1.5 s'], ['State size', '3.0 MB'],
    ]);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('says why a missing job has no numbers, once, and offers no Record details', () => {
    render(<JobPanel job={row({ state: 'MISSING', running: false, jid: null, startTime: null, uptimeSec: null, checkpoint: null })} open onClose={() => {}} />);
    expect(screen.getByText('The engine does not list this required job, so it has no numbers. If it stays missing, ask the system administrator to check the analysis engine.')).toBeTruthy();
    expect(screen.getByText('Missing')).toBeTruthy();
    expect(screen.queryByText('—')).toBeNull();
    expect(screen.queryByText('Record details')).toBeNull();
  });

  it('keeps the engine name, id and start time in Record details', () => {
    render(<JobPanel job={row()} open onClose={() => {}} />);
    fireEvent.click(screen.getByText('Record details'));
    const dialog = screen.getByRole('dialog', { name: 'Record details' });
    expect(within(dialog).getByText('AMS - CPLM Gate Fusion Engine')).toBeTruthy();
    expect(within(dialog).getByText('0f5aa1b5')).toBeTruthy();
    expect(within(dialog).getByText('Started · UTC')).toBeTruthy();
    expect(within(dialog).getByText('7 Nov 00:00')).toBeTruthy();
  });
});
