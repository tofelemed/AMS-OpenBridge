// CHG-170 (owner answer 1): one list grouped Alarm · CPLM · Platform in the supervisor's order; a missing job says "Not listed by
// the engine" once on its row; ◐ Starting for the transitional states; the jobs off the required list as their own group with
// their state (answer 3d). A row selects its job; the foot opens Engine details (today's Technical details, without "JobManager
// answering": the tile says it).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import JobList from './JobList';
import type { JobRow } from './mergeJobs';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
afterEach(cleanup);

const job = (name: string, role: JobRow['role'], state: string, over: Partial<JobRow> = {}): JobRow => ({
  name, role, state, running: state === 'RUNNING', required: role != null, jid: state === 'MISSING' ? null : 'jid', startTime: null,
  uptimeSec: state === 'RUNNING' ? 4560 : null,
  checkpoint: state === 'RUNNING' ? { completed: 25, failed: 0, lastDurationMs: 16_200, lastSizeBytes: 1, lastCompletedAgeSec: 126 } : null,
  ...over,
});
const rows = [
  job('AMS - Alarm State Machine', 'alarm', 'MISSING'),
  job('AMS - CPLM Short Feature Engine', 'cplm', 'RUNNING'),
  job('AMS - CPLM Gate Fusion Engine', 'cplm', 'RESTARTING', { uptimeSec: 30 }),
  job('AMS - Analysis Execution Engine', 'platform', 'MISSING'),
  job('AMS - CPLM On-Demand Evaluation', null, 'RUNNING', { checkpoint: null, uptimeSec: null }),
];
const engine = { jobManagerUrl: 'http://flink-jobmanager:8081', unexpectedJobs: ['AMS - CPLM On-Demand Evaluation'] };
const mount = (props: Partial<React.ComponentProps<typeof JobList>> = {}) =>
  render(<JobList rows={rows} selected="AMS - CPLM Short Feature Engine" onSelect={() => {}} showRows engine={engine} {...props} />);

describe('JobList', () => {
  it('groups the jobs Alarm, CPLM, Platform and the jobs off the list, in order', () => {
    const { container } = mount();
    expect([...container.querySelectorAll('.cpm-pipeline-group')].map(g => g.textContent))
      .toEqual(['Alarm', 'CPLM', 'Platform', 'Not on the required list']);
    expect(within(screen.getByRole('group', { name: 'CPLM' })).getAllByRole('listitem').map(i => i.querySelector('.cpm-event-row__title')?.textContent))
      .toEqual(['CPLM Short Feature Engine', 'CPLM Gate Fusion Engine']);
    expect([...container.querySelectorAll('.cpm-event-head span')].map(s => s.textContent))
      .toEqual(['Job', 'State', 'Uptime', 'Checkpoint age', 'OK / failed']);
  });

  it('shows states in words with their glyphs and a missing job once as not listed', () => {
    mount();
    const missing = screen.getByText('Alarm State Machine').closest('.cpm-event-row') as HTMLElement;
    expect(missing.textContent).toBe('Alarm State Machine✕MissingNot listed by the engine');
    const running = screen.getByText('CPLM Short Feature Engine').closest('.cpm-event-row') as HTMLElement;
    expect(running.textContent).toBe('CPLM Short Feature Engine✓Running1h 16m2.1 min25 / 0');
    const starting = screen.getByText('CPLM Gate Fusion Engine').closest('.cpm-event-row') as HTMLElement;
    expect(within(starting).getByText('Starting').closest('.cpm-pill')?.className).toContain('cpm-pill--warn');
    expect(screen.queryByText(/RUNNING|MISSING|Not exposed/)).toBeNull();
  });

  it('lists a job off the list with its state and its numbers not read, not selectable', () => {
    const onSelect = vi.fn();
    mount({ onSelect });
    const other = screen.getByText('CPLM On-Demand Evaluation').closest('.cpm-event-row') as HTMLElement;
    expect(other.textContent).toBe('CPLM On-Demand Evaluation✓Running———');
    expect(other.getAttribute('role')).toBeNull();
    fireEvent.click(other);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selects a job with a click or the keyboard and marks the selected row', () => {
    const onSelect = vi.fn();
    mount({ onSelect });
    const selected = screen.getByText('CPLM Short Feature Engine').closest('.cpm-event-row') as HTMLElement;
    expect(selected.className).toContain('cpm-event-row--selected');
    expect(selected.getAttribute('aria-current')).toBe('true');
    fireEvent.click(screen.getByText('Alarm State Machine'));
    expect(onSelect).toHaveBeenLastCalledWith('AMS - Alarm State Machine');
    fireEvent.keyDown(screen.getByText('Analysis Execution Engine').closest('.cpm-event-row') as HTMLElement, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith('AMS - Analysis Execution Engine');
  });

  it('opens Engine details from its foot: the address and the jobs off the list, no answering row', () => {
    mount();
    fireEvent.click(screen.getByText('Engine details'));
    const dialog = screen.getByRole('dialog', { name: 'Engine details' });
    expect(within(dialog).getByText('JobManager address')).toBeTruthy();
    expect(within(dialog).getByText('http://flink-jobmanager:8081')).toBeTruthy();
    expect(within(dialog).getByText('Jobs the engine runs that are not required')).toBeTruthy();
    expect(within(dialog).getByText('AMS - CPLM On-Demand Evaluation')).toBeTruthy();
    expect(within(dialog).queryByText(/JobManager answering/)).toBeNull();
  });

  it('shows its notice in place of the rows and hides the header with them', () => {
    const { container } = mount({ showRows: false, notices: <p>The analysis engine did not answer</p> });
    expect(screen.getByText('The analysis engine did not answer')).toBeTruthy();
    expect(container.querySelector('.cpm-event-head')).toBeNull();
    expect(screen.queryByText('CPLM Short Feature Engine')).toBeNull();
    expect(screen.getByText('Engine details')).toBeTruthy();
  });
});
