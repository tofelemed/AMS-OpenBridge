// @vitest-environment jsdom
/** A gate tile opens a dialog: status, loop result, window, then Evidence Workbench → and Window Inspector ↗ with the loop, run and window kept. */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CpmLoop } from '../../../../api/cpmApi';
import type { CpmGateMatrix } from '../../../../api/cpm/gates';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick, disabled }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
}));
vi.mock('../../../../hooks/useCpm', () => ({
  useGateCatalogue: () => ({ isLoading: false, data: { gates: [{ gate: 'G3', definition: 'Is the loop holding its setpoint?' }] } }),
}));
vi.mock('../../GateEvidencePanel', () => ({ EvidenceBody: () => <p>evidence body</p> }));

import { SummaryGateDetail } from './SummaryGateDetail';

afterEach(cleanup);

const LOOP = { loopId: 'FIC10301' } as CpmLoop;
const MATRIX = {
  loopId: 'FIC10301', windowKind: '12h', windowStart: '2026-11-07T00:00:00Z', windowEnd: '2026-11-07T12:00:00Z',
  diagnosis: 'SUSPECTED_OSCILLATION', confidence: 0.8, sampleCount: 100,
  gates: [{ key: 'G3', name: 'Base performance', status: 'WARN', reason: 'GOOD_ERROR_LOW', methodRunId: 'run-7' },
    { key: 'G4', name: 'Actuator effort', status: 'PASS', reason: null, methodRunId: null }],
  methodRunIds: { G3: 'run-7' },
} as unknown as CpmGateMatrix;
const Where = () => { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; };
const show = (gate = 'G3', over: Partial<React.ComponentProps<typeof SummaryGateDetail>> = {}) => {
  const props = { loop: LOOP, gate, matrix: MATRIX, windowKind: '12h', gateKeys: ['G3', 'G4'], onSelectGate: vi.fn(), onClose: vi.fn(), ...over };
  render(<MemoryRouter initialEntries={['/cpm/explorer?loop=FIC10301']}><SummaryGateDetail {...props} /><Where /></MemoryRouter>);
  return props;
};

describe('SummaryGateDetail', () => {
  it('opens as a dialog with the status, the loop result and the window', () => {
    show();
    const d = screen.getByRole('dialog', { name: 'FIC10301 · G3' });
    expect(d.textContent).toContain('Base performance');
    expect(d.textContent).toMatch(/Check status/);
    expect(d.textContent).toMatch(/Oscillation suspected/);
    expect(d.textContent).toMatch(/Latest 12h window/);
    expect(d.textContent).toContain('Is the loop holding its setpoint?');
  });

  it('opens the Evidence Workbench on this gate\'s run, and the Window Inspector on this window', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Evidence Workbench →' }));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/evidence?loop=FIC10301&methodRun=run-7&gate=G3&mode=FIXED');
    fireEvent.click(screen.getByRole('button', { name: 'Window Inspector ↗' }));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/windows?loop=FIC10301&profile=12h&window=2026-11-07T12%3A00%3A00Z');
  });

  it('says why the Workbench is unavailable when the row carries no run', () => {
    show('G4');
    expect((screen.getByRole('button', { name: 'Evidence Workbench →' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('dialog').textContent).toMatch(/before v2\.5/);
  });

  it('walks to the next gate and keeps the rest of the evidence one disclosure away', () => {
    const p = show();
    fireEvent.click(screen.getByRole('button', { name: 'Next gate G4' }));
    expect(p.onSelectGate).toHaveBeenCalledWith('G4');
    expect(screen.getByText('More about this gate')).toBeTruthy();
  });
});
