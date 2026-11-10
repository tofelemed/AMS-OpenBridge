// Task 17: the Window verdict card shows the stored result of the open window and never changes it.
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WindowVerdictCard } from './WindowVerdictCard';
import { row } from '../evidence/windowFixtures';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

const open = row('2026-10-05T12:30:00Z', {
  diagnosis: 'NO_CALL',
  gates: [{ key: 'G3', name: 'Control error', status: 'PASS', reason: null } as never],
  methodRunIds: { G15: 'run-15', G3: 'run-3' },
  metrics: { mae: 0.4 },
});
const base = { row: open, gateKey: 'G3', gateOptions: [{ key: 'G3', name: 'Control error' }, { key: 'G15', name: 'Fusion' }], kpiRow: undefined, onGate: () => {}, loopId: 'FIC10401', question: 'Is the control error small?' };
const view = (p: Partial<React.ComponentProps<typeof WindowVerdictCard>> = {}) => render(<MemoryRouter><WindowVerdictCard {...base} {...p} /></MemoryRouter>);

describe('WindowVerdictCard', () => {
  // CHG-163 (owner review): the window dropdown names the window's result, so the panel is the evidence check
  it("is the evidence check, and leaves the window's result to the window dropdown", () => {
    view();
    expect(screen.getByRole('heading', { level: 2, name: 'Evidence check' })).toBeTruthy();
    expect(screen.queryByText('No fault identified')).toBeNull();
    expect(screen.queryByText(/not judged/i)).toBeNull();
  });
  it('offers the evidence check dropdown and writes the chosen gate', () => {
    const onGate = vi.fn();
    view({ onGate });
    fireEvent.change(screen.getByLabelText('Evidence check'), { target: { value: 'G15' } });
    expect(onGate).toHaveBeenCalledWith('G15');
  });
  it('reads Time in AUTO as Not reported when the window stored none', () => {
    view();
    expect(screen.getByText('Time in AUTO').nextSibling?.textContent).toBe('Not reported');
  });
  it('a metric the window did not store reads Not reported, behind the disclosure', () => {
    view({ gateKey: 'G3' });
    expect(screen.getByText('MAE').nextSibling?.textContent).toBe('0.4');
    expect(screen.getByText('IAE').nextSibling?.textContent).toBe('Not reported');
    expect(screen.queryByText(/not in this window/i)).toBeNull();
  });
  // CHG-163: the band's Workbench ↗ opens the chosen check's run, so the panel has no proof link of its own; Re-run sits in it
  it('has no proof link of its own, holds what the page puts under it, and never edits the row', () => {
    const frozen = Object.freeze({ ...open });
    view({ row: frozen, children: <button type="button">Re-run this window</button> });
    expect(screen.queryByText('Open retained proof ↗')).toBeNull();
    expect(screen.getByRole('button', { name: 'Re-run this window' })).toBeTruthy();
  });
});
