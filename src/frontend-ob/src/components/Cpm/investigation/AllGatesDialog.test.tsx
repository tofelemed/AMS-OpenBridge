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
    render(<AllGatesDialog loopId="FIC10401" matrix={matrix} onGate={() => {}} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'All gate results · FIC10401' });
    expect(within(dialog).getAllByRole('button', { name: /^G\d/ })).toHaveLength(17);
    expect(within(within(dialog).getByRole('group', { name: 'Diagnostic evidence' })).getByText('Strong symptom')).toBeTruthy();
    expect(within(dialog).getByRole('group', { name: 'Fusion' })).toBeTruthy();
  });

  it('opens the proof of the gate that was clicked', () => {
    const onGate = vi.fn();
    render(<AllGatesDialog loopId="FIC10401" matrix={matrix} onGate={onGate} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^G7 · Stiction shape/ }));
    expect(onGate).toHaveBeenCalledWith('G7');
  });

  it('keeps a gate the catalogue does not know, under Other', () => {
    const extra = row('2026-11-05T10:15:00Z', { gates: [...gates, { key: 'G16', name: 'New', tier: 'short', status: 'PASS', reason: null }] });
    render(<AllGatesDialog loopId="FIC10401" matrix={extra} onGate={() => {}} onClose={() => {}} />);
    expect(within(screen.getByRole('group', { name: 'Other' })).getByRole('button', { name: /^G16/ })).toBeTruthy();
  });
});
