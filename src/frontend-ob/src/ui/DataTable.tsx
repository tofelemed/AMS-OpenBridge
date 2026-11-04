/**
 * SPEC §6.5: a native table in its own scroll region. Sortable headings report `aria-sort`, rows
 * take focus, Enter selects, arrows move. Sorting and paging belong to the page, which holds the
 * data and may page on the server. Data states render inside the table region.
 */
import React, { useRef } from 'react';
import { DataState } from './DataState';
import './data-table.css';

export interface Column<R> {
  key: string;
  header: React.ReactNode;
  /** Accessible name of a heading whose content is not plain text. */
  label?: string;
  cell: (row: R) => React.ReactNode;
  sortable?: boolean;
  align?: 'start' | 'end';
  /** Technical identifiers: monospace. */
  mono?: boolean;
  /** Keeps the identifying column visible while the table scrolls sideways. */
  sticky?: boolean;
}

export type SortState = { key: string; dir: 'asc' | 'desc' } | null;

const ariaSort = (active: boolean, dir?: 'asc' | 'desc') => {
  if (!active) return 'none' as const;
  return dir === 'asc' ? ('ascending' as const) : ('descending' as const);
};

export function DataTable<R>({
  caption, columns, rows, rowKey, sort, onSort, selectedKey, onSelect, density = 'default',
  loading, error, onRetry, emptyTitle, emptyReason, filtered, onResetFilters, toolbar, footer,
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
  /** True when filters are applied, so an empty result offers Reset. */
  filtered?: boolean;
  onResetFilters?: () => void;
  toolbar?: React.ReactNode;
  /** Paging controls. */
  footer?: React.ReactNode;
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
    if (filtered) return <DataState kind="filtered-empty" onReset={onResetFilters} reason={emptyReason} />;
    return <DataState kind="empty" title={emptyTitle} reason={emptyReason} />;
  })();

  return (
    <div className={`ui-table ui-table--${density}`}>
      {toolbar && <div className="ui-table__toolbar">{toolbar}</div>}
      {state ?? (
        <div className="ui-table__scroll" role="region" aria-label={caption} tabIndex={0}>
          <table>
            <caption className="ui-sr">{caption}</caption>
            <thead>
              <tr>
                {columns.map(c => {
                  const active = sort?.key === c.key;
                  const align = c.align === 'end' ? ' ui-table__cell--end' : '';
                  const stick = c.sticky ? ' ui-table__cell--sticky' : '';
                  return (
                    <th key={c.key} scope="col" className={`${align}${stick}`.trim() || undefined} aria-sort={c.sortable ? ariaSort(active, sort?.dir) : undefined}>
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
                })}
              </tr>
            </thead>
            <tbody ref={bodyRef}>
              {rows.map(row => {
                const key = rowKey(row);
                const selected = key === selectedKey;
                return (
                  <tr
                    key={key}
                    tabIndex={onSelect ? 0 : undefined}
                    aria-current={selected ? 'true' : undefined}
                    data-selected={selected || undefined}
                    onClick={onSelect ? () => onSelect(row) : undefined}
                    onKeyDown={onSelect ? e => moveFocus(e, row) : undefined}
                  >
                    {columns.map(c => (
                      <td key={c.key} className={[c.align === 'end' && 'ui-table__cell--end', c.mono && 'ui-table__cell--mono', c.sticky && 'ui-table__cell--sticky'].filter(Boolean).join(' ') || undefined}>
                        {c.cell(row)}
                      </td>
                    ))}
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
