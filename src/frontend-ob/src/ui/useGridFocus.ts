/**
 * Roving focus over a grid of native controls: one tab stop, arrows move, Home and End go to the ends
 * of the row. Rows may differ in length, so Up and Down land on the same position or the last control
 * of that row. The controls stay native: Enter and Space activate them with no extra code.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';

const ROW_ATTR = 'data-r';

export interface GridCellProps {
  'data-r': number;
  'data-c': number;
  tabIndex: 0 | -1;
}

export interface GridFocus<E extends HTMLElement = HTMLElement> {
  /** Spread on the element that holds the controls. */
  containerProps: {
    ref: React.RefObject<E>;
    onKeyDown: (e: React.KeyboardEvent<E>) => void;
    onFocus: (e: React.FocusEvent<E>) => void;
  };
  /** Spread on each control. `rowLength` is how many controls that row holds. */
  cellProps: (row: number, col: number, rowLength: number) => GridCellProps;
  /** Returns focus to the grid, for example after an inspector closes. */
  focusCurrent: () => void;
}

const position = (el: HTMLElement) => ({ r: Number(el.dataset.r), c: Number(el.dataset.c) });

export function useGridFocus<E extends HTMLElement = HTMLElement>(rowCount: number, resetKey: unknown): GridFocus<E> {
  const ref = useRef<E>(null);
  const [cursor, setCursor] = useState({ r: 0, c: 0 });
  useEffect(() => setCursor({ r: 0, c: 0 }), [resetKey]);

  // A poll can shorten the rows under the cursor: the grid must keep a tab stop.
  const row = Math.max(0, Math.min(cursor.r, rowCount - 1));

  const inRow = useCallback((r: number) => (
    Array.from(ref.current?.querySelectorAll<HTMLElement>(`[${ROW_ATTR}="${r}"]`) ?? [])
  ), []);

  const onKeyDown = useCallback((e: React.KeyboardEvent<E>) => {
    const at = (e.target as HTMLElement).closest<HTMLElement>(`[${ROW_ATTR}]`);
    if (!at) return;
    const { r, c } = position(at);
    const current = inRow(r);
    const vertical = (step: number) => {
      const next = inRow(r + step);
      return next[Math.min(c, next.length - 1)];
    };
    const moves: Record<string, () => HTMLElement | undefined> = {
      ArrowLeft: () => current[c - 1],
      ArrowRight: () => current[c + 1],
      ArrowUp: () => vertical(-1),
      ArrowDown: () => vertical(1),
      Home: () => current[0],
      End: () => current[current.length - 1],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    move()?.focus();
  }, [inRow]);

  const onFocus = useCallback((e: React.FocusEvent<E>) => {
    const at = (e.target as HTMLElement).closest<HTMLElement>(`[${ROW_ATTR}]`);
    if (at) setCursor(position(at));
  }, []);

  const cellProps = useCallback((r: number, c: number, rowLength: number): GridCellProps => ({
    'data-r': r,
    'data-c': c,
    tabIndex: r === row && c === Math.min(cursor.c, rowLength - 1) ? 0 : -1,
  }), [row, cursor.c]);

  const focusCurrent = useCallback(() => {
    const cells = inRow(row);
    cells[Math.min(cursor.c, cells.length - 1)]?.focus();
  }, [inRow, row, cursor.c]);

  return useMemo(() => ({
    containerProps: { ref, onKeyDown, onFocus },
    cellProps,
    focusCurrent,
  }), [onKeyDown, onFocus, cellProps, focusCurrent]);
}
