'use client';

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
import { getAuthToken } from '../../api/auth';
import { useMqttStore, type TrendPoint } from '../../store/mqttStore';

/* Design tokens (shared with Dashboard / Admin) */
const T = {
  blue: '#31598F', blueLight: '#EAF2FF', blueMuted: '#C4D8F0',
  bg: '#F6F8FB', card: '#FFFFFF', border: '#DDE3EA', borderLight: '#EEF2F7',
  textPrimary: '#1F2937', textSecondary: '#6B7280', textMuted: '#9CA3AF',
  success: '#2E8B57', successBg: '#ECFDF5',
  critical: '#D64545', criticalBg: '#FEF2F2',
  radius: '12px', radiusSm: '8px',
  shadow: '0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)',
} as const;

interface HistoricalQueryParams {
  fromEpochMs: number; toEpochMs: number;
  priority?: string; source?: string;
  limit: number; offset: number;
}

const fetchHistoricalAlarms = async (params: HistoricalQueryParams) => {
  const res = await axios.get('/api/v1/alarms/historical', {
    params: {
      from: new Date(params.fromEpochMs).toISOString(),
      to:   new Date(params.toEpochMs).toISOString(),
      priority: params.priority && params.priority !== 'All' ? params.priority : undefined,
      sourceNameContains: params.source || undefined,
      pageNumber: Math.floor(params.offset / params.limit) + 1,
      pageSize:   params.limit,
      sortBy: 'EventTime', sortDescending: true,
    },
    headers: { Authorization: `Bearer ${getAuthToken()}` },
  });
  return res.data;
};

const HistoricalViewer: React.FC = () => {
  const gridRef = useRef<AgGridReact>(null);

  // Tab state — 'alarms' (existing Postgres view) | 'trend' (IoTDB via BFF)
  const [activeTab, setActiveTab] = useState<'alarms' | 'trend'>('alarms');

  const [dateRange,     setDateRange]     = useState<[Date | null, Date | null]>([
    new Date(Date.now() - 24 * 60 * 60 * 1000), new Date()
  ]);
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sourceFilter,   setSourceFilter]   = useState('');
  const [page,           setPage]           = useState(0);
  const pageSize = 500;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['historicalAlarms', dateRange, priorityFilter, sourceFilter, page],
    queryFn: () => fetchHistoricalAlarms({
      fromEpochMs: dateRange[0]?.getTime() ?? 0,
      toEpochMs:   dateRange[1]?.getTime() ?? Date.now(),
      priority: priorityFilter || undefined,
      source:   sourceFilter   || undefined,
      limit: pageSize, offset: page * pageSize,
    }),
    enabled: !!dateRange[0] && !!dateRange[1],
  });

  const rowData = useMemo(
    () => (data?.items ?? []).map((row: Record<string, unknown>) => mapHistoricalAlarmRow(row)),
    [data?.items],
  );

  const columnDefs = useMemo<ColDef[]>(() => [
    { headerName: 'Event Time',  field: 'eventTimeEpochMs', width: 185, pinned: 'left',
      cellRenderer: (p: { value: number }) => <span className="timestamp">{formatTimestampMs(p.value)}</span> },
    { headerName: 'Priority',    field: 'priority',   width: 100,
      cellRenderer: (p: { value: string }) => <PriorityBadge priority={p.value} /> },
    { headerName: 'State',       field: 'state',       width: 100 },
    { headerName: 'Source',      field: 'sourceName',  flex: 1, minWidth: 200,
      cellStyle: { fontFamily: "'Noto Sans Mono', monospace" } },
    { headerName: 'Condition',   field: 'conditionName', width: 160 },
    { headerName: 'Message',     field: 'message',     flex: 1.5, minWidth: 250, tooltipField: 'message' },
    { headerName: 'Category',    field: 'category',    width: 120 },
    { headerName: 'Ack Time',    field: 'ackTimeEpochMs', width: 185,
      cellRenderer: (p: { value: number }) => p.value
        ? <span className="timestamp">{formatTimestampMs(p.value)}</span> : '' },
    { headerName: 'Ack By',      field: 'ackedByUsername', width: 120 },
  ], []);

  const onGridReady = useCallback((e: GridReadyEvent) => { e.api.sizeColumnsToFit(); }, []);

  const handleExport = () => {
    const from = dateRange[0]?.toISOString() ?? new Date(Date.now() - 86400000).toISOString();
    const to   = dateRange[1]?.toISOString() ?? new Date().toISOString();
    window.open(`/api/v1/alarms/historical/stream?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, '_blank');
  };

  const handleExportTransitions = () => {
    const from = dateRange[0]?.toISOString() ?? new Date(Date.now() - 86400000).toISOString();
    const to   = dateRange[1]?.toISOString() ?? new Date().toISOString();
    window.open(`/api/v1/alarms/transitions/stream?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, '_blank');
  };

  const totalCount = data?.totalCount ?? 0;
  const hasNext    = !!data?.items && data.items.length >= pageSize;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px', padding: '4px 0' }}>

      {/* ── Page header ──────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 600, margin: 0, color: T.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            Historical Alarm Viewer
          </h1>
          <p style={{ color: T.textSecondary, fontSize: '13.5px', margin: '5px 0 0' }}>
            Query, filter, and export historical alarm events and state transitions
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
          <ExportBtn onClick={handleExport}>↓ Export Alarms NDJSON</ExportBtn>
          <ExportBtn onClick={handleExportTransitions}>↓ Export Transitions NDJSON</ExportBtn>
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────── */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: `2px solid ${T.border}`, paddingBottom: '0' }}>
        {(['alarms', 'trend'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '8px 20px', fontSize: '13px', fontWeight: 600,
            border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
            color: activeTab === tab ? T.blue : T.textSecondary,
            borderBottom: activeTab === tab ? `2px solid ${T.blue}` : '2px solid transparent',
            marginBottom: '-2px', transition: 'color 130ms ease',
          }}>
            {tab === 'alarms' ? '⏱ Alarm Records (PostgreSQL)' : '📈 IoTDB Trend (historian-bff)'}
          </button>
        ))}
      </div>

      {/* ── IoTDB Trend tab ──────────────────────── */}
      {activeTab === 'trend' && (
        <IoTDBTrendPanel dateRange={dateRange} setDateRange={setDateRange} />
      )}

      {/* ── Query toolbar (Alarm Records tab only) ── */}
      {activeTab === 'alarms' && (
      <>
      {/* ── Query toolbar ────────────────────────── */}
      <div style={{
        background: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius,
        padding: '18px 20px',
        boxShadow: T.shadow,
        display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap',
      }}>

        <FilterField label="Time Range">
          <DatePicker
            selectsRange={true}
            startDate={dateRange[0]}
            endDate={dateRange[1]}
            onChange={(update) => setDateRange(update)}
            showTimeSelect
            timeFormat="HH:mm"
            timeIntervals={15}
            dateFormat="yyyy-MM-dd HH:mm"
            className="ob-input"
            wrapperClassName="date-picker-wrapper"
          />
        </FilterField>

        <FilterField label="Priority">
          <select
            className="ob-input"
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            style={{ width: '130px' }}
          >
            <option value="">All Priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </FilterField>

        <FilterField label="Source / Tag">
          <input
            type="text" className="ob-input"
            placeholder="e.g. Unit1.*"
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            style={{ width: '160px' }}
          />
        </FilterField>

        <button
          onClick={() => void refetch()}
          disabled={isLoading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            background: T.blue, color: '#fff',
            border: 'none', borderRadius: T.radiusSm,
            padding: '9px 22px', fontSize: '13px', fontWeight: 600,
            cursor: isLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            opacity: isLoading ? 0.7 : 1, transition: 'opacity 140ms ease',
            alignSelf: 'flex-end',
          }}
          onMouseEnter={e => !isLoading && (e.currentTarget.style.background = '#4069A5')}
          onMouseLeave={e => (e.currentTarget.style.background = T.blue)}
        >
          {isLoading ? (
            <>
              <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              Querying…
            </>
          ) : (
            <>▶ Run Query</>
          )}
        </button>

        {/* Result count badge */}
        {totalCount > 0 && (
          <div style={{
            marginLeft: 'auto', alignSelf: 'flex-end',
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '7px 14px',
            background: T.blueLight, border: `1px solid ${T.blueMuted}`,
            borderRadius: T.radiusSm,
          }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Results</span>
            <span style={{ fontSize: '18px', fontWeight: 700, color: T.blue, fontVariantNumeric: 'tabular-nums' }}>
              {totalCount.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* ── AG Grid ──────────────────────────────── */}
      <div style={{
        flex: 1,
        background: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius,
        overflow: 'hidden',
        boxShadow: T.shadow,
      }}>
        <div className="ag-theme-openbridge" style={{ height: '100%', width: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={rowData}
            columnDefs={columnDefs}
            onGridReady={onGridReady}
            rowSelection="multiple"
            tooltipShowDelay={500}
            overlayLoadingTemplate={'<span style="padding:20px;color:#6B7280">Executing query…</span>'}
            overlayNoRowsTemplate={'<span style="padding:20px;color:#6B7280">No historical alarms found in this range.</span>'}
          />
        </div>
      </div>

      {/* ── Pagination ───────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: T.card, border: `1px solid ${T.border}`,
        borderRadius: T.radius, padding: '12px 20px',
        boxShadow: T.shadow,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: T.textMuted }}>Showing page</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: '28px', height: '28px', padding: '0 8px',
            background: T.blueLight, border: `1.5px solid ${T.blueMuted}`,
            borderRadius: '6px', fontSize: '13px', fontWeight: 700, color: T.blue,
          }}>
            {page + 1}
          </span>
          <span style={{ fontSize: '12px', color: T.textMuted }}>
            · {totalCount.toLocaleString()} total records
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <PaginationBtn onClick={() => setPage(p => p - 1)} disabled={page === 0}>← Previous</PaginationBtn>
          <PaginationBtn onClick={() => setPage(p => p + 1)} disabled={!hasNext}>Next →</PaginationBtn>
        </div>
      </div>
      </>
      )}
    </div>
  );
};

/* ── Local helper components ─────────────────────────── */

const FilterField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    <span style={{ fontSize: '11px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {label}
    </span>
    {children}
  </label>
);

const ExportBtn: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      background: T.card, color: T.blue,
      border: `1.5px solid ${T.blueMuted}`, borderRadius: T.radiusSm,
      padding: '8px 16px', fontSize: '12.5px', fontWeight: 600,
      cursor: 'pointer', fontFamily: 'inherit', transition: 'background 130ms ease',
    }}
    onMouseEnter={e => (e.currentTarget.style.background = T.blueLight)}
    onMouseLeave={e => (e.currentTarget.style.background = T.card)}
  >
    {children}
  </button>
);

const PaginationBtn: React.FC<{ onClick: () => void; disabled: boolean; children: React.ReactNode }> = ({ onClick, disabled, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      padding: '7px 18px', fontSize: '13px', fontWeight: 600,
      borderRadius: T.radiusSm, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
      border: `1.5px solid ${disabled ? T.borderLight : T.border}`,
      background: disabled ? T.bg : T.card,
      color: disabled ? T.textMuted : T.textSecondary,
      transition: 'all 130ms ease',
    }}
    onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = T.blueLight; e.currentTarget.style.color = T.blue; e.currentTarget.style.borderColor = T.blueMuted; } }}
    onMouseLeave={e => { if (!disabled) { e.currentTarget.style.background = T.card; e.currentTarget.style.color = T.textSecondary; e.currentTarget.style.borderColor = T.border; } }}
  >
    {children}
  </button>
);

/* ═══════════════════════════════════════════════════════
   Phase 5 — IoTDB TREND PANEL
   Calls historian-bff /trend → renders a simple SVG
   sparkline + table of decimated points.
   ═══════════════════════════════════════════════════════ */
const IoTDBTrendPanel: React.FC<{
  dateRange:    [Date | null, Date | null];
  setDateRange: (r: [Date | null, Date | null]) => void;
}> = ({ dateRange, setDateRange }) => {
  const fetchTrend = useMqttStore(s => s.fetchTrend);
  const [series,  setSeries]  = useState('root.ams.site1.alarms.*');
  const [loading, setLoading] = useState(false);
  const [points,  setPoints]  = useState<TrendPoint[]>([]);
  const [error,   setError]   = useState<string | null>(null);

  const runQuery = useCallback(async () => {
    const start = dateRange[0];
    const end   = dateRange[1];
    if (!start || !end || !series.trim()) return;
    setLoading(true); setError(null);
    try {
      const pts = await fetchTrend(series.trim(), start, end, 400);
      setPoints(pts);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [dateRange, series, fetchTrend]);

  // SVG sparkline from severity values
  const sparkline = useMemo(() => {
    const severities = points
      .map(p => typeof p.severity === 'number' ? p.severity : Number(p.severity) || 0)
      .filter(v => v > 0);
    if (severities.length < 2) return null;
    const W = 700, H = 60;
    const max = Math.max(...severities, 1);
    const xs = severities.map((_, i) => (i / (severities.length - 1)) * W);
    const ys = severities.map(v => H - (v / max) * H);
    return <polyline points={xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')}
      fill="none" stroke={T.blue} strokeWidth="1.5" />;
  }, [points]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Toolbar */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`,
        borderRadius: T.radius, padding: '18px 20px', boxShadow: T.shadow,
        display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap',
      }}>
        <FilterField label="IoTDB Series (path)">
          <input type="text" className="ob-input"
            value={series} onChange={e => setSeries(e.target.value)}
            placeholder="root.ams.site1.alarms.*"
            style={{ width: '320px' }}
          />
        </FilterField>
        <FilterField label="Time Range">
          <DatePicker selectsRange startDate={dateRange[0]} endDate={dateRange[1]}
            onChange={setDateRange} showTimeSelect timeFormat="HH:mm" timeIntervals={15}
            dateFormat="yyyy-MM-dd HH:mm" className="ob-input" wrapperClassName="date-picker-wrapper"
          />
        </FilterField>
        <button onClick={() => void runQuery()} disabled={loading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            background: T.blue, color: '#fff', border: 'none', borderRadius: T.radiusSm,
            padding: '9px 22px', fontSize: '13px', fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            opacity: loading ? 0.7 : 1, alignSelf: 'flex-end',
          }}>
          {loading ? 'Querying…' : '▶ Fetch Trend'}
        </button>
        {points.length > 0 && (
          <span style={{
            marginLeft: 'auto', alignSelf: 'flex-end',
            padding: '7px 14px', background: T.blueLight, border: `1px solid ${T.blueMuted}`,
            borderRadius: T.radiusSm, fontSize: '12px', fontWeight: 700, color: T.blue,
          }}>
            {points.length} points
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: T.radiusSm, color: T.critical, fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Sparkline */}
      {sparkline && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: '16px 20px', boxShadow: T.shadow }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
            Severity over time (decimated — avg per interval)
          </div>
          <svg width="100%" viewBox="0 0 700 60" preserveAspectRatio="none" style={{ display: 'block', height: '60px' }}>
            {sparkline}
          </svg>
        </div>
      )}

      {/* Point table */}
      {points.length > 0 && (
        <div style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: T.radius, overflow: 'hidden', boxShadow: T.shadow,
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                  {['Timestamp', ...Object.keys(points[0] ?? {}).filter(k => k !== 'ts')].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '11px', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {points.slice(0, 200).map((pt, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${T.borderLight}`, background: i % 2 === 0 ? T.card : T.bg }}>
                    <td style={{ padding: '8px 14px', color: T.textSecondary, fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      {new Date(pt.ts).toLocaleString('en-GB')}
                    </td>
                    {Object.entries(pt).filter(([k]) => k !== 'ts').map(([k, v]) => (
                      <td key={k} style={{ padding: '8px 14px', color: T.textPrimary }}>
                        {v === null || v === undefined ? <span style={{ color: T.textMuted }}>—</span> : String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {points.length > 200 && (
            <div style={{ padding: '10px 14px', fontSize: '12px', color: T.textMuted, borderTop: `1px solid ${T.border}` }}>
              Showing first 200 of {points.length} points
            </div>
          )}
        </div>
      )}

      {points.length === 0 && !loading && !error && (
        <div style={{ padding: '40px', textAlign: 'center', color: T.textMuted, fontSize: '13px' }}>
          <div style={{ fontSize: '28px', marginBottom: '10px', opacity: 0.4 }}>📈</div>
          Enter an IoTDB series path and click Fetch Trend to query the historian.
        </div>
      )}
    </div>
  );
};

export default HistoricalViewer;
