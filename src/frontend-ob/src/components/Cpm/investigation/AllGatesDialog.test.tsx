// @vitest-environment jsdom
// CHG-141: all 17 gates in one dialog, under their tiers, each opening its proof.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { CpmGateCell } from '../../../api/cpm/gates';
import { TIER_GROUPS } from '../gateStatus';
import { row } from '../evidence/windowFixtures';
import { AllGatesDialog } from './AllGatesDialog';

afterEach(cleanup);

const keys = TIER_GROUPS.flatMap(t => t.keys);
const gates = keys.map((key): CpmGateCell => ({ key, name: key, tier: 'short', status: key === 'G7' ? 'STRONG' : 'PASS', reason: null }));
const matrix = row('2026-11-05T10:15:00Z', { gates });

describe('AllGatesDialog', () => {
  it('lists every gate under its tier with its mark', () => {
    render(<AllGatesDialog matrix={matrix} onGate={() => {}} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'All 17 gates' });   // CHG-160: not the loop
    expect(within(dialog).getAllByRole('button', { name: /^G\d/ })).toHaveLength(17);
    expect(within(within(dialog).getByRole('group', { name: 'Diagnostic evidence' })).getByText('Strong symptom')).toBeTruthy();
    expect(within(dialog).getByRole('group', { name: 'Fusion' })).toBeTruthy();
  });

  // CHG-160: the N/A mark printed its glyph and its word, "n/a N/A"
  it('says N/A once on a gate that does not apply', () => {
    render(<AllGatesDialog matrix={row('2026-11-05T10:15:00Z', { gates: gates.map(g => (g.key === 'G14' ? { ...g, status: 'NOT_APPLICABLE' } : g)) })} onGate={() => {}} onClose={() => {}} />);
    const g14 = within(screen.getByRole('dialog')).getByRole('button', { name: /^G14/ });
    expect([...g14.querySelectorAll('[aria-hidden="true"]')].map(e => e.textContent).join(' ')).toBe('∅ N/A');
  });

  it('opens the proof of the gate that was clicked', () => {
    const onGate = vi.fn();
    render(<AllGatesDialog matrix={matrix} onGate={onGate} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^G7 · Stiction shape/ }));
    expect(onGate).toHaveBeenCalledWith('G7');
  });

  it('keeps a gate the catalogue does not know, under Other', () => {
    const extra = row('2026-11-05T10:15:00Z', { gates: [...gates, { key: 'G16', name: 'New', tier: 'short', status: 'PASS', reason: null }] });
    render(<AllGatesDialog matrix={extra} onGate={() => {}} onClose={() => {}} />);
    expect(within(screen.getByRole('group', { name: 'Other' })).getByRole('button', { name: /^G16/ })).toBeTruthy();
  });
});
