// @vitest-environment jsdom
// Task 8: one list, two views. A toggle switches them; the matrix head carries codes only; a result is one link.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CpmHeatmapLoop } from '../../api/cpmApi';
import { GateMatrix, type GateMatrixProps } from './GateMatrix';
import { buildTierGroups, gateName } from './gateStatus';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
}));
afterEach(cleanup);

const KEYS = ['G0', 'G1', 'G3', 'G5', 'G7', 'G14', 'G15'];
const row = (loopId: string, diagnosis: string, confidence: number | null, gates: Record<string, string>): CpmHeatmapLoop =>
  ({ loopId, displayName: `${loopId} loop`, loopType: 'flow', windowEnd: null, diagnosis, confidence, gates }) as CpmHeatmapLoop;
const LOOPS = [
  row('FIC-1', 'CONFIRMED_OSCILLATION', 0.9, { G0: 'PASS', G1: 'PASS', G3: 'FAIL', G5: 'WARN', G7: 'PASS', G14: 'PASS', G15: 'CONFIRMED' }),
  row('LIC-2', 'NOT_EVALUATED', null, { G0: 'PASS', G15: 'NOT_EVALUATED' }),
  row('PIC-3', 'SUSPECTED_STICTION', 0.5, { G0: 'PASS', G7: 'STRONG', G15: 'SUSPECTED' }),
];

const Where = () => { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; };
const show = (over: Partial<GateMatrixProps> = {}) => {
  const props: GateMatrixProps = {
    loops: LOOPS, orderedGateKeys: KEYS, tierGroups: buildTierGroups(KEYS),
    filter: { mode: 'all', gate: null }, onFilterChange: vi.fn(), page: 1, onPageChange: vi.fn(),
    selectedLoopId: null, onSelectLoop: vi.fn(), onOpenLoop: vi.fn(), onOpenGate: vi.fn(),
    view: 'checks', onViewChange: vi.fn(), sort: 'tag', onSortChange: vi.fn(), windowKind: '12h', ...over,
  };
  render(<MemoryRouter initialEntries={['/cpm/performance']}><GateMatrix {...props} /><Where /></MemoryRouter>);
  return props;
};

describe('GateMatrix', () => {
  it('switches between Findings and Gate matrix with one toggle', () => {
    const props = show();
    const toggle = screen.getByRole('group', { name: 'Performance list view' });
    expect(within(toggle).getByRole('button', { name: 'Findings' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(toggle).getByRole('button', { name: 'Gate matrix' }));
    expect(props.onViewChange).toHaveBeenCalledWith('matrix');
    expect(screen.queryByRole('combobox', { name: 'Matrix view' })).toBeNull();
  });

  it('shows only G codes in the matrix head, tier headings above them, and no name', () => {
    show({ view: 'matrix' });
    const grid = screen.getByRole('grid', { name: 'Gates by loop' });
    const head = within(grid).getAllByRole('columnheader').map(h => h.textContent);
    for (const k of KEYS) expect(head).toContain(k);
    for (const k of KEYS) expect(grid.querySelector('thead')?.textContent).not.toContain(gateName(k));
    expect(head).toContain('Diagnostic evidence');
    expect(grid.querySelector('.cpm-matrix-scroll, tbody')).toBeTruthy();
  });

  it('gives each matrix row a one-line result link to Investigation', () => {
    show({ view: 'matrix' });
    fireEvent.click(screen.getByRole('button', { name: 'Oscillation confirmed' }));
    expect(screen.getByTestId('where').textContent).toMatch(/^\/cpm\/investigation\?loop=FIC-1&profile=12h/);
  });

  it('opens a gate from a matrix cell', () => {
    const props = show({ view: 'matrix' });
    fireEvent.click(screen.getByRole('button', { name: /^FIC-1, gate G5/ }));
    expect(props.onSelectLoop).toHaveBeenCalledWith('FIC-1');
    expect(props.onOpenGate).toHaveBeenCalledWith('FIC-1', 'G5');
  });

  it('lists Loop, Result, Checks, Evidence and Review in Findings, with the checks named', () => {
    show();
    const heads = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(heads).toEqual(['Loop', 'Result', 'Checks behind the result', 'Evidence', 'Review']);
    expect(screen.getByRole('button', { name: /^G5 Symptom seen/ })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Review ↗' })[0]);
    expect(screen.getByTestId('where').textContent).toMatch(/^\/cpm\/investigation\?loop=FIC-1/);
  });

  it('orders rows by the chosen sort and offers every sort in one dropdown', () => {
    show({ sort: 'tag' });
    const sort = screen.getByRole('combobox', { name: 'Sort' }) as HTMLSelectElement;
    expect([...sort.options].map(o => o.value)).toEqual(['evidence', 'tag', 'result', 'error', 'priority']);
    const loops = screen.getAllByRole('button', { name: /^Open .*in the Loop Explorer/ }).map(b => b.getAttribute('aria-label')?.split(',')[0]);
    expect(loops).toEqual(['Open FIC-1', 'Open LIC-2', 'Open PIC-3']);
  });

  it('filters by result with a new Any result dropdown', () => {
    show();
    const any = screen.getByRole('combobox', { name: 'Result' }) as HTMLSelectElement;
    expect([...any.options].map(o => o.text)).toContain('Any result');
    fireEvent.change(any, { target: { value: 'SUSPECTED' } });
    expect(screen.queryByRole('button', { name: /Open FIC-1/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Open PIC-3/ })).toBeTruthy();
  });

  it('puts the selected-loop band above the table only when one is given', () => {
    show({ band: <div data-testid="band">band</div> });
    const band = screen.getByTestId('band');
    const table = document.querySelector('table')!;
    expect(band.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('pages 15 rows at a time', () => {
    const many = Array.from({ length: 31 }, (_, i) => row(`L-${String(i).padStart(2, '0')}`, 'DETECTED_BACKLASH', 0.5, { G15: 'DETECTED' }));
    show({ loops: many });
    expect(screen.getAllByRole('button', { name: /^Open L-/ })).toHaveLength(15);
  });
});
