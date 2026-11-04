/**
 * SPEC §5.2 primary panel: the gate matrix on DataTable, in its two views. The row set, paging and
 * filters are shared, so switching views never changes which loops are shown.
 */
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { CpmHeatmapLoop } from '../../../api/cpmApi';
import { cpaHref } from '../../../components/Cpm/cpaHref';
import { DataTable } from '../../../ui/DataTable';
import { Pagination } from '../../../ui/forms/Pagination';
import type { GridFocus } from '../../../ui/useGridFocus';
import { checksColumns, matrixColumns, type Selection } from './gateColumns';
import { sameLoop } from './performanceModel';
import type { GateRows } from './useGateRows';
import type { PerformanceData } from './usePerformanceData';
import type { PerformanceUrl } from './usePerformanceUrl';

const rowKey = (row: CpmHeatmapLoop) => row.loopId;

/** Why the filtered rows are empty, and what would widen them. */
function emptyReason(url: PerformanceUrl, q: string, data: PerformanceData): string | undefined {
  const { loops, total } = data;
  if (q && total != null && total > loops.length) {
    return `No match among the ${loops.length} loops loaded. The matrix shows the first ${loops.length} of ${total} in scope, so this loop may be beyond them. Narrow the plant scope.`;
  }
  if (url.heldBy || q) return 'Clear the gate or text filter to widen the view.';
  if (url.health) return 'No loop in this plant scope matches the quick filter.';
  return url.rows === 'attention' ? 'Every evaluated loop passed its gates in this window.' : undefined;
}

export const GateTable: React.FC<{
  url: PerformanceUrl;
  data: PerformanceData;
  table: GateRows;
  kind: string;
  selection: Selection | null;
  focus: GridFocus<HTMLTableSectionElement>;
  q: string;
  onQuery: (next: string) => void;
}> = ({ url, data, table, kind, selection, focus, q, onQuery }) => {
  const { heatmap, rankings, rankOf, inputFlagsOf, tierGroups, gateKeys } = data;

  const columns = useMemo(() => {
    const ctx = {
      search: url.search, kind, sort: url.sort, ranked: !!rankings.data, rankOf, selection, focus, inputFlagsOf, onSelectCell: url.selectCell,
    };
    return url.view === 'matrix' ? matrixColumns(ctx, tierGroups) : checksColumns(ctx, gateKeys);
  }, [url.search, kind, url.sort, rankings.data, rankOf, selection, focus, inputFlagsOf, url.selectCell, url.view, tierGroups, gateKeys]);

  const noLoops = data.loops.length === 0;
  const selectedKey = table.rows.find(r => sameLoop(r.loopId, selection?.loopId))?.loopId ?? null;

  return (
    <div className="perf-table" data-view={url.view}>
      <DataTable
        caption={url.view === 'matrix' ? 'Gate results by loop' : "Checks behind each loop's result"}
        columns={columns}
        rows={table.visible}
        rowKey={rowKey}
        selectedKey={selectedKey}
        density={url.view === 'matrix' ? 'compact' : 'default'}
        loading={heatmap.isLoading}
        error={heatmap.isError && !heatmap.data ? heatmap.error : undefined}
        onRetry={() => { void heatmap.refetch(); }}
        emptyTitle="No monitored loops"
        emptyReason={noLoops && !url.health ? 'No loop in this plant scope is monitored.' : emptyReason(url, q, data)}
        emptyAction={<Link className="ui-link" to={cpaHref('/cpm/setup', url.search, { tab: 'loops' })}>Loops in Setup</Link>}
        filtered={!noLoops || !!url.health}
        filteredTitle={url.rows === 'attention' && !url.heldBy && !q && !url.health ? 'No loop needs attention' : 'No loops match'}
        onResetFilters={() => { onQuery(''); url.resetFilters(); }}
        grid={{ focus, rowCount: table.rows.length, firstRow: table.start }}
        footer={table.pageCount > 1 ? <Pagination page={table.page} pageCount={table.pageCount} onChange={url.setPage} /> : undefined}
      />
    </div>
  );
};
