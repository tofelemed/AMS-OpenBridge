// @vitest-environment jsdom
// Task 8: one list, two views; the matrix head carries codes only; a result is one link. CHG-156: the view toggle sits in
// the panel head, the count line and the symbol row are gone, and the search leads the toolbar.
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
const base = (): GateMatrixProps => ({
  loops: LOOPS, orderedGateKeys: KEYS, tierGroups: buildTierGroups(KEYS),
  filter: { mode: 'all', gate: null }, onFilterChange: vi.fn(), page: 1, onPageChange: vi.fn(),
  selectedLoopId: null, onSelectLoop: vi.fn(), onOpenLoop: vi.fn(), onOpenGate: vi.fn(),
  view: 'checks', sort: 'tag', onSortChange: vi.fn(), windowKind: '12h',
});
const show = (over: Partial<GateMatrixProps> = {}) => {
  const props: GateMatrixProps = { ...base(), ...over };
  render(<MemoryRouter initialEntries={['/cpm/performance']}><GateMatrix {...props} /><Where /></MemoryRouter>);
  return props;
};

describe('GateMatrix', () => {
  it('holds no view toggle, count line or symbol row of its own: the panel head and How to read have them (CHG-156)', () => {
    const { container } = render(<MemoryRouter><GateMatrix {...base()} view="matrix" /></MemoryRouter>);
    expect(screen.queryByRole('group', { name: 'Performance list view' })).toBeNull();
    expect(screen.queryByText(/^Showing/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Full key' })).toBeNull();
    expect(container.querySelector('.cpm-gate-legend')).toBeNull();
  });

  it('puts the loop search first, then the filters and the sort (CHG-156)', () => {
    show();
    const order = Array.from(document.querySelectorAll('.cpm-matrix-toolbar input, .cpm-matrix-toolbar select'))
      .map(e => e.getAttribute('aria-label') ?? (e as HTMLInputElement).placeholder);
    expect(order).toEqual(['loop id or description', 'Row filter', 'Result', 'Sort']);
  });

  it('names the shortfall when the matrix serves fewer loops than the scope holds', () => {
    show({ fleetTotal: 10 });
    expect(screen.getByText('The matrix serves the first 3 of 10 loops in scope.')).toBeTruthy();
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
    const btns = Array.from(document.querySelectorAll('.cpm-matrix__loop-btn'));
    expect(btns.map(b => b.querySelector('strong')?.textContent)).toEqual(['FIC-1', 'LIC-2', 'PIC-3']);
    // the name is the visible tag and description; "Open ..." rides on the title (axe label-content-name-mismatch)
    btns.forEach(b => {
      expect(b.getAttribute('aria-label')).toBeNull();
      expect(b.getAttribute('title')).toBe('Open in the Loop Explorer');
    });
  });

  it('filters by result with a new Any result dropdown', () => {
    show();
    const any = screen.getByRole('combobox', { name: 'Result' }) as HTMLSelectElement;
    expect([...any.options].map(o => o.text)).toContain('Any result');
    fireEvent.change(any, { target: { value: 'SUSPECTED' } });
    const tags = () => Array.from(document.querySelectorAll('.cpm-matrix__loop-btn strong')).map(n => n.textContent);
    expect(tags()).not.toContain('FIC-1');
    expect(tags()).toContain('PIC-3');
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
    expect(document.querySelectorAll('.cpm-matrix__loop-btn')).toHaveLength(15);
  });

  it('drops the Result filter when a scope change removes that band from the list', () => {
    const props = base();
    const tree = (loops: CpmHeatmapLoop[]) => <MemoryRouter><GateMatrix {...props} loops={loops} /></MemoryRouter>;
    const { rerender } = render(tree(LOOPS));
    const select = () => screen.getByRole('combobox', { name: 'Result' }) as HTMLSelectElement;
    fireEvent.change(select(), { target: { value: 'CONFIRMED' } });
    expect(select().value).toBe('CONFIRMED');
    rerender(tree(LOOPS.filter(l => l.diagnosis !== 'CONFIRMED_OSCILLATION')));
    expect(select().value).toBe('');
    expect(screen.getByText('LIC-2')).toBeTruthy();
  });
});
