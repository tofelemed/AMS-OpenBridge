/**
 * SPEC §6.5: a native table in its own scroll region. Sortable headings report `aria-sort`, rows
 * take focus, Enter selects, arrows move. Sorting and paging belong to the page, which holds the
 * data and may page on the server. Data states render inside the table region.
 *
 * Two optional additions, for a table read cell by cell. `Column.group` draws a spanning heading over
 * adjacent columns. `grid` makes the table an ARIA grid with one tab stop: rows stop being focus
 * targets, and the page's controls take roving focus through `useGridFocus`.
 */
import React, { useRef } from 'react';
import { DataState } from './DataState';
import type { GridFocus } from './useGridFocus';
import './data-table.css';

export interface Column<R> {
  key: string;
  header: React.ReactNode;
  /** Accessible name of a heading whose content is not plain text. */
  label?: string;
  /** `rowIndex` counts the rows handed in, for roving focus. */
  cell: (row: R, rowIndex: number) => React.ReactNode;
  sortable?: boolean;
  align?: 'start' | 'end';
  /** Technical identifiers: monospace. */
  mono?: boolean;
  /** Keeps the identifying column visible while the table scrolls sideways. */
  sticky?: boolean;
  /** Spanning heading. Adjacent columns with the same group share one. */
  group?: string;
}

export type SortState = { key: string; dir: 'asc' | 'desc' } | null;

/** The table as an ARIA grid. `rowCount` and `firstRow` place a page of rows within the whole set. */
export interface DataTableGrid {
  focus: GridFocus<HTMLTableSectionElement>;
  rowCount: number;
  firstRow: number;
}

const ariaSort = (active: boolean, dir?: 'asc' | 'desc') => {
  if (!active) return 'none' as const;
  return dir === 'asc' ? ('ascending' as const) : ('descending' as const);
};

/** Adjacent columns of one group, or one ungrouped column. */
function headingRuns<R>(columns: Array<Column<R>>): Array<{ group?: string; columns: Array<Column<R>> }> {
  const runs: Array<{ group?: string; columns: Array<Column<R>> }> = [];
  for (const column of columns) {
    const last = runs[runs.length - 1];
    if (column.group && last?.group === column.group) last.columns.push(column);
    else runs.push({ group: column.group, columns: [column] });
  }
  return runs;
}

export function DataTable<R>({
  caption, columns, rows, rowKey, sort, onSort, selectedKey, onSelect, density = 'default',
  loading, error, onRetry, emptyTitle, emptyReason, emptyAction, filtered, filteredTitle, onResetFilters, toolbar, footer, grid,
}: {
  /** Names the table for assistive technology. */
  caption: string;
  columns: Array<Column<R>>;
  rows: R[];
  rowKey: (row: R) => string;
  sort?: SortState;
  onSort?: (key: string) => void;
  selectedKey?: string | null;
  onSelect?: (row: R) => void;
  density?: 'default' | 'compact';
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyReason?: string;
  /** One recovery action for an unfiltered empty table. */
  emptyAction?: React.ReactNode;
  /** True when filters are applied, so an empty result offers Reset. */
  filtered?: boolean;
  /** Replaces the default filtered-empty title. */
  filteredTitle?: string;
  onResetFilters?: () => void;
  toolbar?: React.ReactNode;
  /** Paging controls. */
  footer?: React.ReactNode;
  /** Read cell by cell, with one tab stop. */
  grid?: DataTableGrid;
}): React.ReactElement {
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const moveFocus = (e: React.KeyboardEvent<HTMLTableRowElement>, row: R) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(row);
      return;
    }
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const all = bodyRef.current?.querySelectorAll<HTMLTableRowElement>('tr[tabindex]');
    if (!all) return;
    const at = [...all].indexOf(e.currentTarget);
    all[at + step]?.focus();
  };

  const state = (() => {
    if (error) return <DataState kind="error" error={error} onRetry={onRetry} />;
    if (loading) return <DataState kind="loading" label={`Loading ${caption}`} rows={6} />;
    if (rows.length > 0) return null;
    if (filtered) return <DataState kind="filtered-empty" title={filteredTitle} onReset={onResetFilters} reason={emptyReason} />;
    return <DataState kind="empty" title={emptyTitle} reason={emptyReason} action={emptyAction} />;
  })();

  const grouped = columns.some(c => c.group);
  const headingRows = grouped ? 2 : 1;

  const startsGroup = (c: Column<R>) => !!c.group && columns[columns.indexOf(c) - 1]?.group !== c.group;

  const heading = (c: Column<R>, rowSpan?: number) => {
    const active = sort?.key === c.key;
    const align = c.align === 'end' ? ' ui-table__cell--end' : '';
    const stick = c.sticky ? ' ui-table__cell--sticky' : '';
    const edge = startsGroup(c) ? ' ui-table__cell--group' : '';
    return (
      <th key={c.key} scope="col" rowSpan={rowSpan} className={`${align}${stick}${edge}`.trim() || undefined} aria-sort={c.sortable ? ariaSort(active, sort?.dir) : undefined}>
        {c.sortable && onSort
          ? (
            <button type="button" className="ui-table__sort" onClick={() => onSort(c.key)} aria-label={c.label}>
              {c.header}
              <span aria-hidden="true" className="ui-table__arrow">{active ? (sort?.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
            </button>
          )
          : c.header}
      </th>
    );
  };

  return (
    <div className={`ui-table ui-table--${density}`}>
      {toolbar && <div className="ui-table__toolbar">{toolbar}</div>}
      {state ?? (
        <div className="ui-table__scroll" role="region" aria-label={caption} tabIndex={0}>
          <table role={grid ? 'grid' : undefined} aria-rowcount={grid ? grid.rowCount + headingRows : undefined}>
            <caption className="ui-sr">{caption}</caption>
            <thead>
              {grouped
                ? (
                  <>
                    <tr>
                      {headingRuns(columns).map(run => (run.group
                        ? <th key={run.group} scope="colgroup" colSpan={run.columns.length} className="ui-table__group">{run.group}</th>
                        : heading(run.columns[0], 2)))}
                    </tr>
                    <tr>{columns.filter(c => c.group).map(c => heading(c))}</tr>
                  </>
                )
                : <tr>{columns.map(c => heading(c))}</tr>}
            </thead>
            <tbody ref={bodyRef} {...grid?.focus.containerProps}>
              {rows.map((row, rowIndex) => {
                const key = rowKey(row);
                const selected = key === selectedKey;
                const selectable = !grid && onSelect;
                return (
                  <tr
                    key={key}
                    tabIndex={selectable ? 0 : undefined}
                    aria-current={selected ? 'true' : undefined}
                    aria-rowindex={grid ? grid.firstRow + rowIndex + headingRows + 1 : undefined}
                    data-selected={selected || undefined}
                    onClick={selectable ? () => onSelect(row) : undefined}
                    onKeyDown={selectable ? e => moveFocus(e, row) : undefined}
                  >
                    {columns.map(c => {
                      const cellRole = c.sticky ? 'rowheader' : 'gridcell';
                      return (
                        <td
                          key={c.key}
                          role={grid ? cellRole : undefined}
                          className={[c.align === 'end' && 'ui-table__cell--end', c.mono && 'ui-table__cell--mono', c.sticky && 'ui-table__cell--sticky', startsGroup(c) && 'ui-table__cell--group'].filter(Boolean).join(' ') || undefined}
                        >
                          {c.cell(row, rowIndex)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {footer && <div className="ui-table__footer">{footer}</div>}
    </div>
  );
}
