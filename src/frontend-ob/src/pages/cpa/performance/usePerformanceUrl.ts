/**
 * The page's own URL parameters, unchanged from the old page: `rows`, `fg`, `page`, `view`, `health`,
 * `gate`. `sort` is new and appears only when it is not the default. Plant scope, window kind and the
 * loop come from useCpaContext. Every write replaces the history entry, as the old page did.
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CpmHealthFilter } from '../../../api/cpmApi';
import { isRowFilter, matrixViewOf, type MatrixView, type RowFilter } from '../../../components/Cpm/gateStatus';
import { sortKeyOf, type SortKey } from './performanceModel';

const HEALTH: readonly CpmHealthFilter[] = ['missing-binding', 'stale-collection', 'active-affected'];
const healthOf = (v: string | null) => HEALTH.find(h => h === v);

export interface PerformanceUrl {
  search: URLSearchParams;
  rows: RowFilter;
  /** The gate the table is filtered to (`fg`). */
  heldBy: string | null;
  /** Null when the URL names no page, so a deep link can open the selected loop's page. */
  page: number | null;
  view: MatrixView;
  health: CpmHealthFilter | undefined;
  sort: SortKey;
  /** The selected gate (`gate`). */
  gate: string | null;
  setRows: (rows: RowFilter) => void;
  setHeldBy: (gate: string | null) => void;
  setPage: (page: number) => void;
  setView: (view: MatrixView) => void;
  setHealth: (health: CpmHealthFilter | undefined) => void;
  setSort: (sort: SortKey) => void;
  setWindow: (kind: string) => void;
  selectCell: (loopId: string, gate: string) => void;
  clearSelection: () => void;
  /** The widest row set: every filter off. */
  resetFilters: () => void;
}

export function usePerformanceUrl(): PerformanceUrl {
  const [search, setSearch] = useSearchParams();

  const write = useCallback((mutate: (p: URLSearchParams) => void) => {
    setSearch(p => { mutate(p); return p; }, { replace: true });
  }, [setSearch]);

  const setters = useMemo(() => ({
    setRows: (rows: RowFilter) => write(p => { p.set('rows', rows); p.delete('page'); }),
    setHeldBy: (gate: string | null) => write(p => {
      if (gate) p.set('fg', gate); else p.delete('fg');
      p.delete('page'); // a new row set invalidates the page number
    }),
    setPage: (page: number) => write(p => { if (page <= 1) p.delete('page'); else p.set('page', String(page)); }),
    setView: (view: MatrixView) => write(p => { if (view === 'matrix') p.set('view', view); else p.delete('view'); }),
    setHealth: (health: CpmHealthFilter | undefined) => write(p => {
      if (health) p.set('health', health); else p.delete('health');
      p.delete('page');
    }),
    setSort: (sort: SortKey) => write(p => {
      if (sort === 'error') p.set('sort', sort); else p.delete('sort');
      p.delete('page');
    }),
    setWindow: (kind: string) => write(p => p.set('window', kind)),
    selectCell: (loopId: string, gate: string) => write(p => { p.set('loop', loopId); p.set('gate', gate); }),
    clearSelection: () => write(p => { p.delete('loop'); p.delete('gate'); }),
    resetFilters: () => write(p => { p.set('rows', 'all'); p.delete('fg'); p.delete('health'); p.delete('page'); }),
  }), [write]);

  const rowsParam = search.get('rows');
  const pageParam = search.get('page');
  return {
    ...setters,
    search,
    rows: isRowFilter(rowsParam) ? rowsParam : 'attention',
    heldBy: search.get('fg'),
    page: pageParam == null ? null : Math.max(1, Number(pageParam) || 1),
    view: matrixViewOf(search.get('view')),
    health: healthOf(search.get('health')),
    sort: sortKeyOf(search.get('sort')),
    gate: search.get('gate')?.trim() || null,
  };
}
