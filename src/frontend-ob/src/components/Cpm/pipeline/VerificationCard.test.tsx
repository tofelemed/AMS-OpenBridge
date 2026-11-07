import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import VerificationCard from './VerificationCard';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('../context/LoopBand', () => ({ LoopBand: (p: { loopId?: string | null }) => <div>loop control {p.loopId}</div> }));
afterEach(cleanup);

const base = {
  loopId: 'FIC101', onLoop: () => {}, canManage: true, busy: false, error: null,
  runLoopId: null, started: false, onRecheck: () => {},
  status: null, analysisRunId: null, elapsedS: null, onRun: () => {},
};

describe('VerificationCard', () => {
  it('opens a setup dialog with the loop control, then starts the run', () => {
    const onRun = vi.fn();
    render(<VerificationCard {...base} onRun={onRun} />);
    fireEvent.click(screen.getByText('Run end-to-end verification'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/loop control FIC101/)).toBeTruthy();
    fireEvent.click(screen.getByText('Start verification'));
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('reports the real run id and states from verification', () => {
    render(<VerificationCard {...base}
      status={{ replayId: 'rp-1', jobId: 'job-9', state: 'FINISHED', finished: true, succeeded: true }}
      analysisRunId="run-77" elapsedS={34} started runLoopId="FIC200" loopId="FIC999" />);
    expect(screen.getByText('VERIFIED')).toBeTruthy();
    expect(screen.getByText('run-77')).toBeTruthy();
    expect(screen.getByText(/34 s/)).toBeTruthy();
    expect(screen.getByText('FIC200')).toBeTruthy();
    expect(screen.queryByText('FIC999')).toBeNull();
  });

  it('shows a failed run with its engine state', () => {
    render(<VerificationCard {...base}
      status={{ replayId: 'rp-1', jobId: 'job-9', state: 'FAILED', finished: true, succeeded: false }} analysisRunId="run-77" elapsedS={5} />);
    expect(screen.getByText('FAILED (FAILED)')).toBeTruthy();
  });

  it('says why the action is unavailable without cpm.manage', () => {
    render(<VerificationCard {...base} canManage={false} />);
    expect(screen.getByText('Needs the cpm.manage permission')).toBeTruthy();
  });

  it('keeps a started run visible, with Check again, when its state cannot be read', () => {
    const onRecheck = vi.fn();
    render(<VerificationCard {...base} started busy analysisRunId="run-77" runLoopId="FIC101" onRecheck={onRecheck} />);
    expect(screen.getByText('run-77')).toBeTruthy();
    expect(screen.getByText(/Could not read the run state/)).toBeTruthy();
    fireEvent.click(screen.getByText('Check again'));
    expect(onRecheck).toHaveBeenCalledTimes(1);
    expect((screen.getByText('Verifying…') as HTMLButtonElement).closest('button')?.disabled).toBe(true);
  });

  it('says so when the run id was not returned', () => {
    render(<VerificationCard {...base} started status={{ replayId: 'r', jobId: 'j', state: 'RUNNING', finished: false, succeeded: false }} />);
    expect(screen.getByText('Run id not returned')).toBeTruthy();
  });
});
