// Task 15: Reconstruct evidence asks first. The dialog names the loop, gate and window it will rebuild (CHG-184: no run id); the
// request is sent only on confirm. CHG-188 (owner review 15): one line of text, rows Loop / Gate / Window, Reconstruct primary and
// Cancel secondary; then the run's progress (Running with the time since the click, Done), or Failed with the reason and Retry.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ReconstructDialog } from './ReconstructDialog';
import type { RunPhase } from './runPhase';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: string }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled, 'data-variant': p.variant }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/building-blocks/circular-progress/circular-progress', () => ({
  ObcCircularProgress: () => React.createElement('span', { 'data-testid': 'spinner' }),
}));
afterEach(() => { cleanup(); vi.useRealTimers(); });

const base = { open: true, loopId: 'FIC10405', gate: 'G5 Oscillation (ACF)', windowText: '12h · 2026-09-16 07:45 → 2026-09-17 07:45 · GST', startedAt: null };
const IDLE: RunPhase = { step: 'IDLE' };

describe('ReconstructDialog', () => {
  it('states what will be rebuilt in one line and three rows, and sends nothing until confirmed', () => {
    const onConfirm = vi.fn();
    render(<ReconstructDialog {...base} phase={IDLE} onConfirm={onConfirm} onClose={() => {}} />);
    const d = screen.getByRole('dialog', { name: 'Reconstruct evidence' });
    expect(d.querySelector('.ui-dialog__description')?.textContent).toBe("Rebuilds this gate's charts from its window. The kept proof is not changed.");
    expect([...d.querySelectorAll('dt')].map(t => t.textContent)).toEqual(['Loop', 'Gate', 'Window']);
    for (const t of [base.loopId, base.gate, base.windowText]) expect(within(d).getByText(t)).toBeTruthy();
    expect(within(d).queryByText('Run')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(within(d).getByRole('button', { name: 'Reconstruct' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('has Reconstruct as the primary action and Cancel as secondary, primary last', () => {
    render(<ReconstructDialog {...base} phase={IDLE} onConfirm={() => {}} onClose={() => {}} />);
    const foot = document.querySelector('.ui-dialog__foot')!;
    const buttons = [...foot.querySelectorAll('button')];
    expect(buttons.map(b => [b.textContent, b.getAttribute('data-variant')])).toEqual([['Cancel', 'normal'], ['Reconstruct', 'raised']]);
  });

  it('cancels without a request', () => {
    const onConfirm = vi.fn(); const onClose = vi.fn();
    render(<ReconstructDialog {...base} phase={IDLE} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows the run in flight with a spinner and the time since the click, and cannot be confirmed twice', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-11-15T08:00:12Z'));
    render(<ReconstructDialog {...base} startedAt={Date.parse('2026-11-15T08:00:00Z')} phase={{ step: 'RUNNING' }} onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('Running');
    expect(screen.getByTestId('spinner')).toBeTruthy();
    expect(screen.getByText('0:12')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reconstruct' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(screen.queryByText(/%|accepted/i)).toBeNull();
  });

  it('says Done, without a spinner', () => {
    render(<ReconstructDialog {...base} startedAt={Date.now()} phase={{ step: 'DONE' }} onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('status').textContent).toMatch(/Done/);
    expect(screen.queryByTestId('spinner')).toBeNull();
  });

  it('shows the failure with its reason and offers Retry and Close', () => {
    const onConfirm = vi.fn();
    render(<ReconstructDialog {...base} startedAt={Date.now()} phase={{ step: 'FAILED', reason: 'Reconstruction refused: 403 Forbidden' }} onConfirm={onConfirm} onClose={() => {}} />);
    expect(screen.getByRole('alert').textContent).toMatch(/Failed.*Reconstruction refused: 403 Forbidden/);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('renders nothing when closed', () => {
    render(<ReconstructDialog {...base} open={false} phase={IDLE} onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
