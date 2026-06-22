import React, { useState, useMemo, useRef, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridReadyEvent } from 'ag-grid-community';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { PriorityBadge } from '../shared/PriorityBadge';
import { formatTimestampMs } from '../../utils/time';
import { mapHistoricalAlarmRow } from '../../api/alarmMappers';

// ---- API Call ----
interface HistoricalQueryParams {
  fromEpochMs: number;
  toEpochMs: number;
  priority?: string;
  source?: string;
  limit: number;
  offset: number;
}

const fetchHistoricalAlarms = async (params: HistoricalQueryParams) => {
  const { getAuthToken } = await import('../../api/auth');
  const res = await axios.get('/api/v1/alarms/historical', {
    params: {
      from: new Date(params.fromEpochMs).toISOString(),
      to: new Date(params.toEpochMs).toISOString(),
      priority: params.priority && params.priority !== 'All' ? params.priority : undefined,
      sourceNameContains: params.source || undefined,
      pageNumber: Math.floor(params.offset / params.limit) + 1,
      pageSize: params.limit,
      sortBy: 'EventTime',
      sortDescending: true,
    },
    headers: { Authorization: `Bearer ${getAuthToken()}` },
  });
  return res.data;
};

// ============================================================
// Historical Viewer — TimescaleDB Query Interface
// ============================================================

const HistoricalViewer: React.FC = () => {
  const gridRef = useRef<AgGridReact>(null);
  
  // State
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
    new Date()
  ]);
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  
  // Pagination
  const [page, setPage] = useState(0);
  const pageSize = 500;

  // React Query
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['historicalAlarms', dateRange, priorityFilter, sourceFilter, page],
    queryFn: () => fetchHistoricalAlarms({
      fromEpochMs: dateRange[0]?.getTime() ?? 0,
      toEpochMs: dateRange[1]?.getTime() ?? Date.now(),
      priority: priorityFilter || undefined,
      source: sourceFilter || undefined,
      limit: pageSize,
      offset: page * pageSize
    }),
    enabled: !!dateRange[0] && !!dateRange[1],
  });

  const rowData = useMemo(
    () => (data?.items ?? []).map((row: Record<string, unknown>) => mapHistoricalAlarmRow(row)),
    [data?.items],
  );

  // ---- Columns ----
  const columnDefs = useMemo<ColDef[]>(() => [
    {
      headerName: 'Event Time', field: 'eventTimeEpochMs', width: 185, pinned: 'left',
      cellRenderer: (p: any) => <span className="timestamp timestamp--ms">{formatTimestampMs(p.value)}</span>,
    },
    {
      headerName: 'Priority', field: 'priority', width: 100,
      cellRenderer: (p: any) => <PriorityBadge priority={p.value} />,
    },
    { headerName: 'State', field: 'state', width: 100 },
    { headerName: 'Source', field: 'sourceName', flex: 1, minWidth: 200, cellClass: 'font-mono-sm' },
    { headerName: 'Condition', field: 'conditionName', width: 160 },
    { headerName: 'Message', field: 'message', flex: 1.5, minWidth: 250, tooltipField: 'message' },
    { headerName: 'Category', field: 'category', width: 120 },
    { headerName: 'Ack Time', field: 'ackTimeEpochMs', width: 185, 
      cellRenderer: (p: any) => p.value ? <span className="timestamp timestamp--ms">{formatTimestampMs(p.value)}</span> : ''
    },
    { headerName: 'Ack By', field: 'ackedByUsername', width: 120 },
  ], []);

  const onGridReady = useCallback((e: GridReadyEvent) => {
    e.api.sizeColumnsToFit();
  }, []);

  const handleExport = () => {
    const from = dateRange[0]?.toISOString() ?? new Date(Date.now() - 86400000).toISOString();
    const to = dateRange[1]?.toISOString() ?? new Date().toISOString();
    window.open(`/api/v1/alarms/historical/stream?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, '_blank');
  };

  const handleExportTransitions = () => {
    const from = dateRange[0]?.toISOString() ?? new Date(Date.now() - 86400000).toISOString();
    const to = dateRange[1]?.toISOString() ?? new Date().toISOString();
    window.open(`/api/v1/alarms/transitions/stream?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, '_blank');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 'var(--space-4)', gap: 'var(--space-4)' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', background: 'var(--color-bg-card)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', alignItems: 'flex-end' }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time Range</label>
          <DatePicker
            selectsRange={true}
            startDate={dateRange[0]}
            endDate={dateRange[1]}
            onChange={(update) => setDateRange(update)}
            showTimeSelect
            timeFormat="HH:mm"
            timeIntervals={15}
            dateFormat="yyyy-MM-dd HH:mm"
            className="input-field"
            wrapperClassName="date-picker-wrapper"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Priority</label>
          <select className="input-field" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} style={{ width: '120px' }}>
            <option value="">All</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source/Tag</label>
          <input 
            type="text" 
            className="input-field" 
            placeholder="e.g. Unit1*" 
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
          />
        </div>

        <button className="btn btn--primary" onClick={() => refetch()} disabled={isLoading}>
          {isLoading ? 'Querying...' : 'Run Query'}
        </button>

        <button className="btn btn--ghost" onClick={handleExport} style={{ marginLeft: 'auto' }}>
          Export Alarms NDJSON
        </button>
        <button className="btn btn--ghost" onClick={handleExportTransitions}>
          Export Transitions NDJSON
        </button>
      </div>

      {/* Grid */}
      <div className="ag-theme-industrial" style={{ flex: 1 }}>
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          onGridReady={onGridReady}
          rowSelection="multiple"
          tooltipShowDelay={500}
          overlayLoadingTemplate={'<span class="ag-overlay-loading-center">Executing query...</span>'}
          overlayNoRowsTemplate={'<span class="ag-overlay-no-rows-center">No historical alarms found in this range.</span>'}
        />
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 var(--space-2)' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          Total Results: {data?.totalCount ?? 0}
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button className="btn btn--ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span style={{ display: 'flex', alignItems: 'center', padding: '0 var(--space-3)', color: 'var(--text-primary)', fontSize: '13px' }}>Page {page + 1}</span>
          <button className="btn btn--ghost" disabled={!data?.items || data.items.length < pageSize} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </div>

    </div>
  );
};

export default HistoricalViewer;
