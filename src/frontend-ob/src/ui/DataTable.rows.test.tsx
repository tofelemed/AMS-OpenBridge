// CHG-195 (owner review item 19): two small additions to the standard table, for System Response. `rowClassName` marks a
// row (a censored event, a quantity that does not apply, drawn muted); `groupOf` puts a group heading row above the first row
// of each group (the models table's Candidate / Other groups). Rows arrive already in group order.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DataTable, type Column } from './DataTable';

afterEach(cleanup);

interface Row { id: string; group: string; muted?: boolean }
const ROWS: Row[] = [{ id: 'a', group: 'Candidate (2)' }, { id: 'b', group: 'Candidate (2)', muted: true }, { id: 'c', group: 'Other (1)' }];
const COLUMNS: Array<Column<Row>> = [{ key: 'id', header: 'Id', cell: r => r.id }, { key: 'g', header: 'Group', cell: r => r.group }];

describe('DataTable row classes and groups', () => {
  it('gives a row the class the page asks for', () => {
    render(<DataTable caption="Rows" columns={COLUMNS} rows={ROWS} rowKey={r => r.id} rowClassName={r => (r.muted ? 'cpm-row--muted' : undefined)} />);
    const body = [...document.querySelectorAll('tbody tr')];
    expect(body.map(tr => tr.className)).toEqual(['', 'cpm-row--muted', '']);
  });

  it('puts one heading row above each group, spanning the columns, never focusable or selectable', () => {
    const onSelect = vi.fn();
    render(<DataTable caption="Rows" columns={COLUMNS} rows={ROWS} rowKey={r => r.id} groupOf={r => r.group} onSelect={onSelect} />);
    const heads = [...document.querySelectorAll('tbody tr.ui-table__group-row')];
    expect(heads.map(tr => tr.textContent)).toEqual(['Candidate (2)', 'Other (1)']);
    const cell = heads[0].querySelector('th')!;
    expect(cell.getAttribute('colspan')).toBe('2');
    expect(cell.getAttribute('scope')).toBe('colgroup');
    expect(heads[0].hasAttribute('tabindex')).toBe(false);
    fireEvent.click(heads[0]);
    expect(onSelect).not.toHaveBeenCalled();
    expect([...document.querySelectorAll('tbody tr')].map(tr => tr.textContent)).toEqual(['Candidate (2)', 'aCandidate (2)', 'bCandidate (2)', 'Other (1)', 'cOther (1)']);
    fireEvent.click(screen.getByText('c'));
    expect(onSelect).toHaveBeenCalledWith(ROWS[2]);
  });
});
