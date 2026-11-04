/**
 * The rows in view: filtered, in the server's ranking order, and paged. A deep link with no `page`
 * opens on the linked loop's page: that page is written to the URL once, when the ranking has
 * settled. From then on the URL decides, so a poll that reorders the ranking, or a selection on
 * another row, cannot move the table under the reader.
 */
import { useEffect, useMemo, useRef } from 'react';
import { filterCounts, filterRows } from '../../../components/Cpm/gateStatus';
import { PAGE_SIZE, orderRows, pageOfLoop } from './performanceModel';
import type { PerformanceData } from './usePerformanceData';
import type { PerformanceUrl } from './usePerformanceUrl';

export function useGateRows(data: PerformanceData, url: PerformanceUrl, q: string, loop: string) {
  const { loops, gateKeys, ranked } = data;
  const counts = useMemo(() => filterCounts(loops, gateKeys), [loops, gateKeys]);
  const rows = useMemo(
    () => orderRows(filterRows(loops, gateKeys, { mode: url.rows, gate: url.heldBy, q }), ranked),
    [loops, gateKeys, url.rows, url.heldBy, q, ranked],
  );

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(url.page ?? 1, pageCount);
  const start = (page - 1) * PAGE_SIZE;

  const { page: urlPage, setPage } = url;
  useEffect(() => {
    if (urlPage != null && urlPage !== page) setPage(page);
  }, [urlPage, page, setPage]);

  const linked = useRef<string | null>(loop || null);
  const settled = rows.length > 0 && !data.rankings.isLoading;
  useEffect(() => {
    if (!settled || !linked.current) return;
    const at = pageOfLoop(rows, linked.current);
    linked.current = null;
    if (urlPage == null && at != null && at > 1) setPage(at);
  }, [settled, rows, urlPage, setPage]);

  return {
    counts,
    rows,
    visible: useMemo(() => rows.slice(start, start + PAGE_SIZE), [rows, start]),
    page,
    pageCount,
    start,
  };
}

export type GateRows = ReturnType<typeof useGateRows>;
