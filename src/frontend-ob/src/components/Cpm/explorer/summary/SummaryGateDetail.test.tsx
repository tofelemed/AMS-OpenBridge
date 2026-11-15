// @vitest-environment jsdom
/**
 * A gate tile opens a dialog: status, loop result, window, then Evidence Workbench → and Window Inspector ↗ with the loop, run
 * and window kept. CHG-191: the shared body renders here too, in the same wide two-column dialog as Performance.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CpmLoop } from '../../../../api/cpmApi';
import type { CpmGateMatrix } from '../../../../api/cpm/gates';
import { fmtDateTime } from '../../shared';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick, disabled, variant, className }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: string; className?: string }) =>
    <button type="button" onClick={onClick} disabled={disabled} data-variant={variant} className={className}>{children}</button>,
}));
vi.mock('../../../../hooks/useCpm', () => ({
  useGateCatalogue: () => ({ isLoading: false, data: { gates: [{ gate: 'G3', role: 'PRIMARY', definition: 'Is the loop holding its setpoint?' }] } }),
  useLatestGates: () => ({
    isLoading: false, isError: false, error: null,
    data: {
      loopId: 'FIC10301', windowKind: '12h', windowStart: '2026-11-07T00:00:00Z', windowEnd: '2026-11-07T12:00:00Z', sampleCount: 100,
      observabilityFlags: ['INSTRUMENT_HEALTH_NOT_CONFIGURED'],
      gates: [{ key: 'G3', status: 'WARN', reason: 'GOOD_ERROR_LOW', methodRunId: 'run-7' }, { key: 'G4', status: 'PASS', reason: null, methodRunId: null }],
    },
  }),
  useCpmCalculations: () => ({ data: { gates: [{ key: 'G3', question: 'How large is the control error?', observedInResults: true }] } }),
  useCpmLoop: () => ({ data: undefined }),
}));

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
  it('opens as a dialog with the status, the loop result and the window on one line', () => {
    show();
    const d = screen.getByRole('dialog', { name: 'FIC10301 · G3' });
    expect(within(d).getByRole('heading', { name: 'Base performance' })).toBeTruthy();
    expect(d.textContent).toMatch(/Check status/);
    expect(d.textContent).toMatch(/Oscillation suspected/);
    expect(within(d).getByText(`12h window · ${fmtDateTime(MATRIX.windowStart)} → ${fmtDateTime(MATRIX.windowEnd)}`)).toBeTruthy();
    for (const gone of ['Assessment', 'Window from', 'Window to', 'Gate role']) expect(within(d).queryByText(gone)).toBeNull();
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
    expect(screen.getByRole('dialog').textContent).toMatch(/Stored before analysis runs were kept/);
    expect(screen.getByRole('dialog').textContent).not.toMatch(/v2\.5/);   // CHG-184: no version
  });

  it('offers the Workbench once: the primary at the foot, not again among the links (CHG-157)', () => {
    show();
    expect(screen.getAllByRole('button', { name: /workbench/i }).map(b => b.textContent)).toEqual(['Evidence Workbench →']);
  });

  it('walks to the next gate', () => {
    const p = show();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(p.onSelectGate).toHaveBeenCalledWith('G4');
  });

  it('CHG-191: still renders the shared body, in the second column of a wide dialog, with nothing behind a disclosure', () => {
    show();
    const d = screen.getByRole('dialog');
    expect(d.className).toContain('ui-dialog--wide');
    expect(d.querySelector('details')).toBeNull();
    const cols = d.querySelectorAll<HTMLElement>('.cpm-gate-dialog__cols > .cpm-gate-dialog__col');
    expect(cols).toHaveLength(2);
    for (const fact of ['Check status', 'Loop result', 'Reason', 'Samples', '100']) expect(cols[0].textContent).toContain(fact);
    expect(within(cols[1]).getAllByRole('heading').map(h => h.textContent)).toEqual(['What this gate asks', 'Effect on the verdict', 'Flags on this window']);
    expect(cols[1].textContent).toContain('How large is the control error?');
    expect(cols[1].textContent).toContain('Contributes primary evidence to family qualification.');
  });

  it('CHG-191: says "What this gate asks" once, with the catalogue definition under the question', () => {
    show();
    const d = screen.getByRole('dialog');
    expect(within(d).getAllByText('What this gate asks')).toHaveLength(1);
    expect(within(d).getByText('Is the loop holding its setpoint?')).toBeTruthy();
    expect(d.querySelector('.cpm-eyebrow')).toBeNull();
  });

  it('CHG-191: groups the foot: Next, then the "↗" links, then the one primary', () => {
    show();
    const foot = screen.getByRole('dialog').querySelector('.ui-dialog__foot') as HTMLElement;
    expect(within(foot).getAllByRole('button').map(b => b.textContent))
      .toEqual(['Next', 'Replay ↗', 'Loop ↗', 'Window Inspector ↗', 'Evidence Workbench →']);
    expect(within(foot).getAllByRole('button').filter(b => b.getAttribute('data-variant') === 'raised')).toHaveLength(1);
  });
});
