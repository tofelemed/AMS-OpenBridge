// @vitest-environment jsdom
// CHG-141: Calculation proof is a dialog: the gate, its window, its values, and the two ways on.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CpmGateCell, CpmGateMatrix } from '../../../api/cpm/gates';
import { row } from '../evidence/windowFixtures';
import { windowSpan } from '../windowLabel';
import { GateProofDialog } from './GateProofDialog';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

const END = '2026-11-05T10:15:00Z';
const START = '2026-11-04T22:15:00Z';
const cell = (over: Partial<CpmGateCell> = {}): CpmGateCell => ({ key: 'G5', name: 'Oscillation', tier: 'long', status: 'WARN', reason: null, methodRunId: 'run-g5', ...over });
const matrix = (over: Partial<CpmGateMatrix> = {}) => row(END, {
  windowStart: START, diagnosis: 'CONFIRMED_OSCILLATION', confidence: 1, gates: [cell()], metrics: { acf_regularity: 0.82 }, ...over,
});

const Where: React.FC = () => { const l = useLocation(); return <output data-testid="where">{l.pathname}{l.search}</output>; };
const open = (m: CpmGateMatrix, gate = 'G5') => render(
  <MemoryRouter><GateProofDialog loopId="FIC10401" gate={gate} matrix={m} windowKind="12h" timeZone="UTC" onClose={() => {}} /><Where /></MemoryRouter>);

describe('GateProofDialog', () => {
  it('opens Calculation proof as a dialog with values and two buttons', () => {
    const m = matrix();
    open(m);
    const dialog = screen.getByRole('dialog', { name: 'FIC10401 · G5' });
    expect(within(dialog).getByText('Symptom seen')).toBeTruthy();
    expect(within(dialog).getByText(windowSpan({ ...m, windowKind: '12h' }, 'UTC'))).toBeTruthy();
    expect(within(dialog).getByText('Oscillation regularity')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Evidence Workbench →' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Evidence Replay ↗' })).toBeTruthy();
  });

  it('shows the loop result beside the gate, because the two can differ', () => {
    open(matrix());
    expect(within(screen.getByRole('dialog')).getByText('Oscillation confirmed')).toBeTruthy();
  });

  it('opens this gate\'s own run in the Workbench', () => {
    open(matrix());
    fireEvent.click(screen.getByRole('button', { name: 'Evidence Workbench →' }));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/evidence?loop=FIC10401&methodRun=run-g5&gate=G5&mode=FIXED');
  });

  it('takes the run from the row when the cell has none', () => {
    open(matrix({ gates: [cell({ methodRunId: null })], methodRunIds: { G5: 'row-run' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Evidence Workbench →' }));
    expect(screen.getByTestId('where').textContent).toContain('methodRun=row-run');
  });

  it('opens Replay on the same loop, window, kind and gate', () => {
    open(matrix());
    fireEvent.click(screen.getByRole('button', { name: 'Evidence Replay ↗' }));
    const q = new URLSearchParams(screen.getByTestId('where').textContent!.split('?')[1]);
    expect([q.get('loop'), q.get('gate'), q.get('window'), q.get('kind')]).toEqual(['FIC10401', 'G5', END, '12h']);
  });

  it('disables Workbench with its reason when a row has no run id', () => {
    open(matrix({ gates: [cell({ methodRunId: null })], methodRunIds: {} }));
    expect((screen.getByRole('button', { name: 'Evidence Workbench →' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Stored before analysis runs were kept (before v2.5), so there is no run to open')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Evidence Replay ↗' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('says so when a gate reports a state rather than a value', () => {
    open(matrix({ gates: [cell({ key: 'G2', status: 'PASS' })], metrics: {} }), 'G2');
    expect(screen.getByText('This gate reports a state, not a measured value.')).toBeTruthy();
  });

  it('gives the reason in words, not the code', () => {
    open(matrix({ gates: [cell({ key: 'G12', status: 'NOT_EVALUATED', reason: 'NO_STEP_TEST' })] }), 'G12');
    expect(screen.getByText('No approved step test is on record.')).toBeTruthy();
    expect(screen.queryByText('NO_STEP_TEST')).toBeNull();
  });
});
