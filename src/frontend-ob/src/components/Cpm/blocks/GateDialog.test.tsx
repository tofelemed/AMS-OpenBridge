// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { GateDialog } from './GateDialog';

afterEach(cleanup);

const base = { open: true, onClose: () => {}, loop: 'FIC10301', gate: 'G5', status: 'WARN', loopResult: 'Oscillation confirmed', assessment: 'Latest 12h', actions: <button>Review FIC10301 →</button> };

describe('GateDialog', () => {
  it('titles the dialog with loop and gate, and shows status, result and assessment', () => {
    render(<GateDialog {...base} />);
    const dialog = screen.getByRole('dialog', { name: 'FIC10301 · G5' });
    expect(within(dialog).getByText('Diagnostic evidence')).toBeTruthy();
    expect(within(dialog).getByText('Oscillation (ACF)')).toBeTruthy();
    expect(within(dialog).getByText('Symptom seen')).toBeTruthy();
    expect(within(dialog).getByText('Oscillation confirmed')).toBeTruthy();
    expect(within(dialog).getByText('Latest 12h')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Review FIC10301 →' })).toBeTruthy();
  });

  it('uses the same word as the cell, through gateMark', () => {
    render(<GateDialog {...base} gate="G5" status="PASS" />);
    expect(screen.getByText('Not seen')).toBeTruthy();
  });

  it('says what was missing on a pass judged without an input', () => {
    render(<GateDialog {...base} gate="G4" status="PASS" rows={[{ label: 'Reason', value: 'No OP limits' }]} />);
    expect(screen.getByText('Reason')).toBeTruthy();
    expect(screen.getByText('No OP limits')).toBeTruthy();
  });

  it('renders nothing while closed', () => {
    render(<GateDialog {...base} open={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<GateDialog {...base} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('sits outside the page, so a sticky band cannot clip it', () => {
    const { container } = render(<div><GateDialog {...base} /></div>);
    expect(container.querySelector('[role=dialog]')).toBeNull();
    expect(document.body.querySelector('[role=dialog]')).toBeTruthy();
  });
});
