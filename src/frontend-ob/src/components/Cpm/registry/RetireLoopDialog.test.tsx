// Task 24: Retire needs a reason, shows a failure inside the dialog without losing the reason, and reports a no-op.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CpmLoop } from '../../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
type Opts = { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void };
const retire = vi.fn((_v: unknown, _o?: Opts) => {});
const restore = vi.fn((_v: unknown, _o?: Opts) => {});
vi.mock('../../../hooks/useLoopRetire', () => ({
  useRetireLoop: () => ({ mutate: retire, isPending: false }),
  useRestoreLoop: () => ({ mutate: restore, isPending: false }),
}));

import { RetireLoopDialog } from './RetireLoopDialog';

const loop = { loopId: 'FIC1', isActive: true } as CpmLoop;
const onClose = vi.fn();
const onDone = vi.fn();
const open = (mode: 'retire' | 'restore' = 'retire') =>
  render(<MemoryRouter><RetireLoopDialog loop={loop} mode={mode} onClose={onClose} onDone={onDone} /></MemoryRouter>);
const reasonBox = () => screen.getByLabelText(/Reason/) as HTMLTextAreaElement;
const confirm = () => screen.getByRole('button', { name: /^(Retire|Restore) loop$/ }) as HTMLButtonElement;

beforeEach(() => { retire.mockReset(); restore.mockReset(); onClose.mockReset(); onDone.mockReset(); });
afterEach(cleanup);

describe('RetireLoopDialog', () => {
  it('needs a reason to retire and sends it trimmed', () => {
    open();
    expect(confirm().disabled).toBe(true);
    fireEvent.change(reasonBox(), { target: { value: '   ' } });
    expect(confirm().disabled).toBe(true);
    fireEvent.change(reasonBox(), { target: { value: ' Transmitter removed ' } });
    fireEvent.click(confirm());
    expect(retire).toHaveBeenCalledWith({ loopId: 'FIC1', reason: 'Transmitter removed' }, expect.anything());
  });

  it('caps the reason at 500 characters and counts them', () => {
    open();
    expect(reasonBox().maxLength).toBe(500);
    fireEvent.change(reasonBox(), { target: { value: 'x'.repeat(120) } });
    expect(screen.getByText('120 / 500')).toBeTruthy();
  });

  it('shows a failure in the dialog, stays open and keeps the reason', () => {
    retire.mockImplementation((_v, o) => o?.onError?.(new Error('Loop is locked by another change')));
    open();
    fireEvent.change(reasonBox(), { target: { value: 'Unit shut down' } });
    fireEvent.click(confirm());
    expect(screen.getByRole('alert').textContent).toMatch(/Loop is locked by another change/);
    expect(reasonBox().value).toBe('Unit shut down');
    expect(onClose).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('hands the result on when it succeeds', () => {
    const result = { loopId: 'FIC1', retired: true, changed: true, note: null };
    retire.mockImplementation((_v, o) => o?.onSuccess?.(result));
    open();
    fireEvent.change(reasonBox(), { target: { value: 'Unit shut down' } });
    fireEvent.click(confirm());
    expect(onDone).toHaveBeenCalledWith(result);
  });

  it('restores with an optional reason', () => {
    open('restore');
    expect(confirm().disabled).toBe(false);
    fireEvent.click(confirm());
    expect(restore).toHaveBeenCalledWith({ loopId: 'FIC1', reason: undefined }, expect.anything());
  });
});
