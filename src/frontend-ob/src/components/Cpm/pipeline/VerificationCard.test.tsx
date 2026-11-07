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
      analysisRunId="run-77" elapsedS={34} />);
    expect(screen.getByText('VERIFIED')).toBeTruthy();
    expect(screen.getByText('run-77')).toBeTruthy();
    expect(screen.getByText(/34 s/)).toBeTruthy();
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
});
