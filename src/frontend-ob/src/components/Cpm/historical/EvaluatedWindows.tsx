'use client';

/**
 * CHG-139: the evaluated windows of the range, newest first, beside the selected window. Choosing a row writes the same
 * `?window=` (the window END) as clicking its mark in the Result lane, so the list, the chart and the panel stay one
 * selection. A value the window never stored reads "Not stored", never 0.
 */
import { instantMs, sameInstant } from '../evidence/useWindowAt';
import React, { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../../../ui/DataTable';
import { Pagination } from '../../../ui/forms/Pagination';
import { TonePill, diagnosisBand } from '../shared';
import { fmtWhen } from '../blocks/whenText';
import type { HistoryWindow } from './useWindowKpis';

const PAGE_SIZE = 8;

export const NOT_STORED = 'This window did not store a value for it';

/** A stored 0..1 fraction as a percentage; null when it was never stored. */
export const pctOf = (v: number | undefined): string | null => (v != null && Number.isFinite(v) ? `${Math.round(v * 100)} %` : null);

export const NotStored: React.FC = () => <span className="cpm-hist-missing" title={NOT_STORED}>Not stored</span>;

export const EvaluatedWindows: React.FC<{
  windows: HistoryWindow[];
  selectedEnd: string | null;
  onSelect: (windowEnd: string) => void;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  pageSize?: number;
}> = ({ windows, selectedEnd, onSelect, loading, error, onRetry, pageSize = PAGE_SIZE }) => {
  const rows = useMemo(() => [...windows].sort((a, b) => (instantMs(b.windowEnd) || 0) - (instantMs(a.windowEnd) || 0)), [windows]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageOf = (end: string | null) => {
    const at = end ? rows.findIndex(r => sameInstant(r.windowEnd, end)) : -1;
    return at < 0 ? 1 : Math.floor(at / pageSize) + 1;
  };
  const [page, setPage] = useState(() => pageOf(selectedEnd));
  // A window chosen on the chart can sit on another page: follow it.
  useEffect(() => { setPage(pageOf(selectedEnd)); }, [selectedEnd]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = Math.min(page, pageCount);
  const shown = rows.slice((current - 1) * pageSize, current * pageSize);

  const columns: Array<Column<HistoryWindow>> = [
    { key: 'end', header: 'Window ending', cell: w => fmtWhen(w.windowEnd) },
    { key: 'result', header: 'Result', cell: w => { const b = diagnosisBand(w.diagnosis); return <TonePill tone={b.tone}>{b.label}</TonePill>; } },
    { key: 'mode', header: 'Mode', cell: w => { const a = pctOf(w.metrics?.auto_pct); return a ? `${a} auto` : <NotStored />; } },
    { key: 'band', header: 'In band', align: 'end', cell: w => pctOf(w.metrics?.good_error_pct) ?? <NotStored /> },
  ];

  return (
    <DataTable
      caption="Evaluated windows"
      columns={columns}
      rows={shown}
      rowKey={w => w.windowEnd}
      selectedKey={selectedEnd}
      onSelect={w => onSelect(w.windowEnd)}
      loading={loading}
      error={error}
      onRetry={onRetry}
      emptyTitle="No evaluated windows in this range"
      emptyReason="A window is evaluated only where a full evaluation window closed."
      footer={rows.length > pageSize
        ? <Pagination label="Evaluated windows pages" page={current} pageCount={pageCount} onChange={setPage} />
        : undefined}
    />
  );
};

export default EvaluatedWindows;
