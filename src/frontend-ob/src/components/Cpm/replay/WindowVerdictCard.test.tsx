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
  it('names a no-fault window as a result, never as not judged', () => {
    view();
    expect(screen.getByText('No fault identified')).toBeTruthy();
    expect(screen.queryByText(/not judged/i)).toBeNull();
  });
  it('offers the evidence check dropdown and writes the chosen gate', () => {
    const onGate = vi.fn();
    view({ onGate });
    fireEvent.change(screen.getByLabelText('Evidence check'), { target: { value: 'G15' } });
    expect(onGate).toHaveBeenCalledWith('G15');
  });
  it('reads the controller mode as Not recorded when the window stored none', () => {
    view();
    expect(screen.getByText('Controller mode').nextSibling?.textContent).toBe('Not recorded');
  });
  it('a metric the window did not store reads Not reported, behind the disclosure', () => {
    view({ gateKey: 'G3' });
    expect(screen.getByText('MAE').nextSibling?.textContent).toBe('0.4');
    expect(screen.getByText('IAE').nextSibling?.textContent).toBe('Not reported');
    expect(screen.queryByText(/not in this window/i)).toBeNull();
  });
  it('opens the retained proof only when the check has a run, and never edits the row', () => {
    const frozen = Object.freeze({ ...open });
    view({ row: frozen });
    expect(screen.getByText('Open retained proof ↗')).toBeTruthy();
    cleanup();
    view({ row: { ...open, methodRunIds: {} } });
    expect((screen.getByText('Open retained proof ↗') as HTMLButtonElement).disabled).toBe(true);
  });
});
