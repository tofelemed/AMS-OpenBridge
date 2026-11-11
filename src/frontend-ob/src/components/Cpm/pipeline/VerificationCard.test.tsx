// CHG-170 (owner answers 1, 3a, 3b): the end-to-end verification card under the job panel - its state once in the head (○ Not run
// / ◐ Running / ✓ Verified / ✕ Failed, in words), then Loop and Round trip, Record details and Run in the foot; the setup dialog
// in titled parts (Loop, What it does). Verified only when the run wrote results. Start / Cancel and the cpm.manage rule unchanged.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import VerificationCard from './VerificationCard';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
vi.mock('../context/LoopBand', () => ({ LoopBand: (p: { loopId?: string | null }) => <div>loop control {p.loopId}</div> }));
afterEach(cleanup);

const base = {
  loopId: 'FIC101', loopReason: null, onLoop: () => {}, canManage: true, busy: false, pending: false, error: null,
  runLoopId: null, started: false, onRecheck: () => {}, nameOf: (id: string) => (id === 'FIC200' ? 'Flow controller (FCS0101)' : ''),
  status: null, analysisRunId: null, elapsedS: null, onRun: () => {},
};
const head = (c: HTMLElement) => c.querySelector('.ui-inspector__head') as HTMLElement;
const done = (over: object) => ({ replayId: 'rp-1', jobId: 'job-9', state: 'FINISHED', finished: true, succeeded: true, ...over });

describe('VerificationCard', () => {
  it('reads Not run in its head and runs from its foot through the setup dialog in titled parts', () => {
    const onRun = vi.fn();
    const { container } = render(<VerificationCard {...base} onRun={onRun} />);
    expect(within(head(container)).getByRole('heading', { name: 'End-to-end verification' })).toBeTruthy();
    expect(head(container).textContent).toContain('○Not run');
    fireEvent.click(screen.getByText('Run end-to-end verification'));
    const dialog = screen.getByRole('dialog', { name: 'Run end-to-end verification' });
    expect([...dialog.querySelectorAll('h3')].map(h => h.textContent)).toEqual(['Loop', 'What it does']);
    expect(within(dialog).getByText(/loop control FIC101/)).toBeTruthy();
    expect(within(dialog).getByText('Submits a recompute on this loop and waits for the batch verdict: historian read, normalise, gates, fused result in Postgres.')).toBeTruthy();
    expect(dialog.textContent).not.toMatch(/A8/);
    fireEvent.click(within(dialog).getByText('Start verification'));
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Cancel closes the setup dialog without starting', () => {
    const onRun = vi.fn();
    render(<VerificationCard {...base} onRun={onRun} />);
    fireEvent.click(screen.getByText('Run end-to-end verification'));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Cancel'));
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says Verified only when the finished run wrote results, with the loop of the run and its round trip', () => {
    const { container } = render(<VerificationCard {...base} status={done({ gateResults: 2 })}
      analysisRunId="7c1e04a2-9b3d-4e5f" elapsedS={41} started runLoopId="FIC200" loopId="FIC999" />);
    expect(head(container).textContent).toContain('✓Verified');
    const kv = [...container.querySelectorAll('.cpm-kv')].map(k => k.textContent);
    expect(kv).toEqual(['LoopFIC200 Flow controller (FCS0101)', 'Round tripCompleted in 41 s', 'Results2 written']);
    expect(screen.queryByText('FIC999')).toBeNull();
    expect(screen.queryByText(/VERIFIED/)).toBeNull();
  });

  it('reads a finished run that wrote nothing as not verified, and says why', () => {
    const { container } = render(<VerificationCard {...base} status={done({ gateResults: 0 })} analysisRunId="run-77" elapsedS={30} started runLoopId="FIC101" />);
    expect(head(container).textContent).toContain('✕Not verified');
    expect(head(container).textContent).not.toContain('Verified ');
    expect(screen.getByText('None written: no verdict reached the database')).toBeTruthy();
  });

  it('words a failed run without the engine code', () => {
    const { container } = render(<VerificationCard {...base} status={done({ state: 'FAILED', succeeded: false, gateResults: 0 })} analysisRunId="run-77" elapsedS={5} started runLoopId="FIC101" />);
    expect(head(container).textContent).toContain('✕Failed');
    expect(screen.getByText('Failed in 5 s')).toBeTruthy();
    expect(screen.queryByText(/FAILED/)).toBeNull();
  });

  it('keeps the run ids in Record details, and says when the run id was not returned', () => {
    render(<VerificationCard {...base} status={done({ gateResults: 1 })} analysisRunId="7c1e04a2-9b3d-4e5f" elapsedS={41} started runLoopId="FIC101" />);
    fireEvent.click(screen.getByText('Record details'));
    const dialog = screen.getByRole('dialog', { name: 'Record details' });
    expect(within(dialog).getByText('Analysis run')).toBeTruthy();
    expect(within(dialog).getByText('7c1e04a2')).toBeTruthy();
    expect(within(dialog).getByText('Replay id')).toBeTruthy();
    expect(within(dialog).getByText('rp-1')).toBeTruthy();
    expect(within(dialog).getByText('Engine job id')).toBeTruthy();
    cleanup();
    render(<VerificationCard {...base} started status={{ replayId: 'r', jobId: 'j', state: 'RUNNING', finished: false, succeeded: false }} />);
    fireEvent.click(screen.getByText('Record details'));
    expect(within(screen.getByRole('dialog', { name: 'Record details' })).getByText('Run id not returned')).toBeTruthy();
  });

  it('says why the action is unavailable without cpm.manage, and when there is no loop to run', () => {
    render(<VerificationCard {...base} canManage={false} />);
    expect(screen.getByText('Needs the cpm.manage permission')).toBeTruthy();
    expect((screen.getByText('Run end-to-end verification') as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    render(<VerificationCard {...base} loopId={undefined} loopReason="No loop is registered yet" />);
    expect(screen.getByText('No loop is registered yet')).toBeTruthy();
    expect(screen.queryByText(/verdict to use as the reference/)).toBeNull();
  });

  it('keeps a started run visible, with Check again, when its state cannot be read', () => {
    const onRecheck = vi.fn();
    const { container } = render(<VerificationCard {...base} started busy analysisRunId="run-77" runLoopId="FIC101" onRecheck={onRecheck} />);
    expect(head(container).textContent).toContain('?Unknown');
    expect(screen.getByText(/Could not read the run state. The run may still be going./)).toBeTruthy();
    fireEvent.click(screen.getByText('Check again'));
    expect(onRecheck).toHaveBeenCalledTimes(1);
    expect((screen.getByText('Verifying…') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a failure to start in the card', () => {
    render(<VerificationCard {...base} error="503 recompute is turned off" />);
    expect(screen.getByText('Failed to start: 503 recompute is turned off')).toBeTruthy();
  });
});
