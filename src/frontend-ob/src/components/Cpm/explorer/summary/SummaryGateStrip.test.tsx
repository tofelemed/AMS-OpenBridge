// @vitest-environment jsdom
/** Gate results: tiles under their tier, the mark over the key and the word in the spoken label; no key under them. */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CpmGateCell } from '../../../../api/cpm/gates';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { type: 'button', onClick: p.onClick }, p.children),
}));

import { SummaryGateStrip } from './SummaryGateStrip';

const cell = (key: string, status: string, name = key): CpmGateCell => ({ key, name, status, reason: null } as unknown as CpmGateCell);
const CELLS = [cell('G0', 'PASS'), cell('G1', 'PASS'), cell('G3', 'WARN'), cell('G4', 'FAIL'), cell('G7', 'PASS'), cell('G15', 'SUSPECTED')];
afterEach(cleanup);

describe('SummaryGateStrip', () => {
  it('shows every served gate once, under its tier heading', () => {
    render(<SummaryGateStrip cells={CELLS} selected={null} onSelect={() => {}} />);
    expect(screen.getAllByRole('heading').map(h => h.textContent)).toEqual(['Eligibility', 'Performance', 'Diagnostic evidence', 'Fusion']);
    expect(screen.getAllByRole('button').filter(b => b.hasAttribute('data-gate'))).toHaveLength(6);
  });

  it('puts the mark over the key and the word in the spoken label, not on the tile', () => {
    render(<SummaryGateStrip cells={CELLS} selected={null} onSelect={() => {}} />);
    const g3 = screen.getByRole('button', { name: 'G3 Base performance: Attention' });
    expect(g3.textContent).toBe('!G3');
    expect(g3.getAttribute('data-mark')).toBe('attention');
    // a pass on a diagnostic gate is "not seen", never a pass
    expect(screen.getByRole('button', { name: 'G7 Stiction shape: Not seen' }).textContent).toBe('◯G7');
  });

  it('selects a gate on click', () => {
    const onSelect = vi.fn();
    render(<SummaryGateStrip cells={CELLS} selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /^G4 / }));
    expect(onSelect).toHaveBeenCalledWith('G4');
  });

  it('walks the gates with the arrow keys', () => {
    render(<SummaryGateStrip cells={CELLS} selected="G0" onSelect={() => {}} />);
    const first = screen.getByRole('button', { name: /^G0 / });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement?.getAttribute('data-gate')).toBe('G1');
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement?.getAttribute('data-gate')).toBe('G15');
  });

  // CHG-158: the key is not printed under the tiles; the Gate key button in the panel head opens it
  it('prints no key under the tiles', () => {
    render(<SummaryGateStrip cells={CELLS} selected={null} onSelect={() => {}} />);
    expect(screen.queryByRole('note', { name: 'Gate symbols' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Full key' })).toBeNull();
  });
});
