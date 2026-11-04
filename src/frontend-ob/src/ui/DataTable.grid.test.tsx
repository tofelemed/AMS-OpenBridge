import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DataTable, type Column } from './DataTable';
import { fillPlaceholders } from './Toggletip';
import { useGridFocus } from './useGridFocus';

afterEach(cleanup);

interface Row { id: string; cells: string[] }

const ROWS: Row[] = [
  { id: 'A', cells: ['A1', 'A2', 'A3'] },
  { id: 'B', cells: ['B1'] },
  { id: 'C', cells: ['C1', 'C2'] },
];

const Grid: React.FC<{ rows?: Row[]; rowCount?: number; firstRow?: number; resetKey?: string }> = ({ rows = ROWS, rowCount = rows.length, firstRow = 0, resetKey = '' }) => {
  const focus = useGridFocus<HTMLTableSectionElement>(rows.length, resetKey);
  const columns: Array<Column<Row>> = [
    { key: 'id', header: 'Tag', sticky: true, cell: row => row.id },
    {
      key: 'cells', header: 'Cells', group: 'Group one',
      cell: (row, r) => row.cells.map((text, c) => <button key={text} type="button" {...focus.cellProps(r, c, row.cells.length)}>{text}</button>),
    },
    { key: 'second', header: 'Second', group: 'Group one', cell: () => 'x' },
    { key: 'third', header: 'Third', group: 'Group two', cell: () => 'y' },
  ];
  return <DataTable caption="Sample" columns={columns} rows={rows} rowKey={r => r.id} grid={{ focus, rowCount, firstRow }} />;
};

const name = (n: string) => screen.getByRole('button', { name: n });
const press = (key: string) => fireEvent.keyDown(document.activeElement as Element, { key });

describe('DataTable grouped headings', () => {
  it('spans adjacent columns of a group and leaves an ungrouped heading over both rows', () => {
    render(<Grid />);
    const one = screen.getByRole('columnheader', { name: 'Group one' });
    expect(one.getAttribute('colspan')).toBe('2');
    expect(one.getAttribute('scope')).toBe('colgroup');
    expect(screen.getByRole('columnheader', { name: 'Group two' }).getAttribute('colspan')).toBe('1');
    expect(screen.getByRole('columnheader', { name: 'Tag' }).getAttribute('rowspan')).toBe('2');
    expect(screen.getByRole('columnheader', { name: 'Second' })).toBeTruthy();
  });

  it('marks where a group starts, on the heading and on the body cell', () => {
    render(<Grid />);
    expect(screen.getByRole('columnheader', { name: 'Cells' }).className).toContain('ui-table__cell--group');
    expect(screen.getByRole('columnheader', { name: 'Second' }).className).not.toContain('ui-table__cell--group');
    expect(screen.getByRole('columnheader', { name: 'Third' }).className).toContain('ui-table__cell--group');
  });

  it('keeps one heading row, and no spans, when no column is grouped', () => {
    const columns: Array<Column<Row>> = [{ key: 'id', header: 'Tag', cell: r => r.id }];
    const { container } = render(<DataTable caption="Plain" columns={columns} rows={ROWS} rowKey={r => r.id} />);
    expect(container.querySelectorAll('thead tr')).toHaveLength(1);
    expect(screen.getByRole('columnheader', { name: 'Tag' }).getAttribute('rowspan')).toBeNull();
  });
});

describe('DataTable as a grid', () => {
  it('is an ARIA grid with the whole row set in its count', () => {
    render(<Grid rowCount={40} firstRow={25} />);
    const grid = screen.getByRole('grid', { name: 'Sample' });
    expect(grid.getAttribute('aria-rowcount')).toBe('42');
    const rows = within(grid).getAllByRole('row');
    expect(rows[2].getAttribute('aria-rowindex')).toBe('28');
    expect(within(rows[2]).getByRole('rowheader').textContent).toBe('A');
    expect(within(rows[2]).getAllByRole('gridcell').length).toBeGreaterThan(0);
  });

  it('does not make the rows tab stops, even with onSelect', () => {
    const Selectable: React.FC = () => {
      const focus = useGridFocus<HTMLTableSectionElement>(1, '');
      const columns: Array<Column<Row>> = [{ key: 'id', header: 'Tag', cell: r => r.id }];
      return <DataTable caption="S" columns={columns} rows={ROWS} rowKey={r => r.id} onSelect={() => undefined} grid={{ focus, rowCount: 3, firstRow: 0 }} />;
    };
    const { container } = render(<Selectable />);
    expect(container.querySelector('tbody tr[tabindex]')).toBeNull();
  });
});

describe('useGridFocus', () => {
  it('keeps one tab stop across the grid', () => {
    const { container } = render(<Grid />);
    expect(container.querySelectorAll('tbody button[tabindex="0"]')).toHaveLength(1);
    expect(name('A1').getAttribute('tabindex')).toBe('0');
  });

  it('moves with the arrows and moves the tab stop with it', () => {
    render(<Grid />);
    name('A1').focus();
    press('ArrowRight');
    expect(document.activeElement).toBe(name('A2'));
    expect(name('A2').getAttribute('tabindex')).toBe('0');
    expect(name('A1').getAttribute('tabindex')).toBe('-1');
    press('ArrowLeft');
    expect(document.activeElement).toBe(name('A1'));
  });

  it('goes to the row ends with Home and End', () => {
    render(<Grid />);
    name('A1').focus();
    press('End');
    expect(document.activeElement).toBe(name('A3'));
    press('Home');
    expect(document.activeElement).toBe(name('A1'));
  });

  it('lands on the last control of a shorter row', () => {
    render(<Grid />);
    name('A3').focus();
    press('ArrowDown');
    expect(document.activeElement).toBe(name('B1'));
    press('ArrowDown');
    expect(document.activeElement).toBe(name('C1'));
  });

  it('stays put at the edges', () => {
    render(<Grid />);
    name('A1').focus();
    press('ArrowUp');
    press('ArrowLeft');
    expect(document.activeElement).toBe(name('A1'));
  });

  it('leaves other keys to the browser, so Enter still activates the control', () => {
    render(<Grid />);
    const down = fireEvent.keyDown(name('A1'), { key: 'Enter' });
    expect(down).toBe(true);
  });

  it('keeps a tab stop when a poll shortens the rows under the cursor', () => {
    const { container, rerender } = render(<Grid />);
    name('C2').focus();
    rerender(<Grid rows={ROWS.slice(0, 1)} />);
    expect(container.querySelectorAll('tbody button[tabindex="0"]')).toHaveLength(1);
  });

  it('keeps a tab stop when the cursor sits past the end of a shorter row', () => {
    const { container, rerender } = render(<Grid />);
    name('A3').focus();
    rerender(<Grid rows={[{ id: 'A', cells: ['A1'] }]} />);
    expect(name('A1').getAttribute('tabindex')).toBe('0');
    expect(container.querySelectorAll('tbody button[tabindex="0"]')).toHaveLength(1);
  });

  it('returns to the start when the row set changes', () => {
    const { rerender } = render(<Grid resetKey="one" />);
    name('C2').focus();
    rerender(<Grid resetKey="two" />);
    expect(name('A1').getAttribute('tabindex')).toBe('0');
  });

  it('can take focus back after an inspector closes', () => {
    const Back: React.FC = () => {
      const focus = useGridFocus<HTMLDivElement>(1, '');
      return (
        <>
          <div {...focus.containerProps}><button type="button" {...focus.cellProps(0, 0, 1)}>Cell</button></div>
          <button type="button" onClick={focus.focusCurrent}>Back</button>
        </>
      );
    };
    render(<Back />);
    fireEvent.click(name('Back'));
    expect(document.activeElement).toBe(name('Cell'));
  });
});

describe('fillPlaceholders', () => {
  it('fills what it has and leaves the rest as written', () => {
    expect(fillPlaceholders('{n} loops, median {x}', { n: 0 })).toBe('0 loops, median {x}');
  });

  it('leaves text unchanged with no values', () => {
    expect(fillPlaceholders('{n} loops')).toBe('{n} loops');
  });

  it('copes with a key that names a field', () => {
    expect(fillPlaceholders('band · {G3 status}.', { 'G3 status': 'pass' })).toBe('band · pass.');
  });
});

describe('DataTable empty states', () => {
  const columns: Array<Column<Row>> = [{ key: 'id', header: 'Tag', cell: r => r.id }];

  it('gives a filtered-empty table its own title when one is set', () => {
    render(<DataTable caption="T" columns={columns} rows={[]} rowKey={r => r.id} filtered filteredTitle="No loop needs attention" onResetFilters={() => undefined} />);
    expect(screen.getByText('No loop needs attention')).toBeTruthy();
  });

  it('does not show the unfiltered title on a filtered list', () => {
    render(<DataTable caption="T" columns={columns} rows={[]} rowKey={r => r.id} filtered emptyTitle="No loops registered" onResetFilters={() => undefined} />);
    expect(screen.queryByText('No loops registered')).toBeNull();
  });

  it('offers the recovery action on an unfiltered empty table', () => {
    const open = vi.fn();
    render(<DataTable caption="T" columns={columns} rows={[]} rowKey={r => r.id} emptyAction={<button type="button" onClick={open}>Add</button>} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(open).toHaveBeenCalled();
  });
});
