// Task 15: Reconstruct evidence asks first. The dialog names the loop, gate, window and run it will rebuild; the
// request is sent only on confirm, and the dialog shows the real request state - requesting, or the refusal.
// It never says "accepted": that line belongs to the page, after the service acknowledged.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ReconstructDialog } from './ReconstructDialog';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

const base = { open: true, loopId: 'FIC10405', gate: 'G5 Oscillation (ACF)', windowText: '12h · 2026-09-16 07:45 → 2026-09-17 07:45 · GST', runId: '4ccaf304-0e8d-54df-94ef-83f4130ee28d' };

describe('ReconstructDialog', () => {
  it('states what will be rebuilt and sends nothing until confirmed', () => {
    const onConfirm = vi.fn();
    render(<ReconstructDialog {...base} state="idle" onConfirm={onConfirm} onClose={() => {}} />);
    const d = screen.getByRole('dialog', { name: 'Reconstruct evidence' });
    for (const t of [base.loopId, base.gate, base.windowText, base.runId]) expect(within(d).getByText(t)).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(within(d).getByRole('button', { name: 'Reconstruct' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels without a request', () => {
    const onConfirm = vi.fn(); const onClose = vi.fn();
    render(<ReconstructDialog {...base} state="idle" onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows the request in flight and cannot be confirmed twice', () => {
    const onConfirm = vi.fn();
    render(<ReconstructDialog {...base} state="pending" onConfirm={onConfirm} onClose={() => {}} />);
    const b = screen.getByRole('button', { name: /Requesting/ }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(screen.queryByText(/accepted/i)).toBeNull();
  });

  it('shows the refusal the service gave', () => {
    render(<ReconstructDialog {...base} state="error" error="403 Forbidden" onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('alert').textContent).toMatch(/Reconstruction refused: 403 Forbidden/);
    expect((screen.getByRole('button', { name: 'Reconstruct' }) as HTMLButtonElement).disabled).toBe(false);   // may try again
  });

  it('renders nothing when closed', () => {
    render(<ReconstructDialog {...base} open={false} state="idle" onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
