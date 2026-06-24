'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  GridReadyEvent,
  CellContextMenuEvent,
  RowClassParams,
  GetRowIdParams,
  RowDoubleClickedEvent,
  SelectionChangedEvent,
} from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
// OpenBridge theme layer for AG Grid + page chrome. Order matters: Alpine first,
// then the OpenBridge override layer, then page styling.
import './ag-theme-openbridge.css';
import './alarm-console.css';
import { toast } from 'react-toastify';
import { useHotkeys } from 'react-hotkeys-hook';

import { useAlarmStore, type ActiveAlarm } from '../../store/alarmStore';
import { formatTimestampMs } from '../../utils/time';
import { alarmMatchesConnectedOpcServer, isDisplayableOpcAlarm, sortAlarmsForConsole } from '../../utils/opcAlarmFilter';
import { isOpcAckWriteable, opcAckSkipReason } from '../../utils/opcAckWriteable';
import {
  acknowledgeAlarmsBatch,
  shelveAlarm as shelveAlarmApi,
  suppressAlarm as suppressAlarmApi,
  setAlarmOutOfService as setAlarmOutOfServiceApi,
} from '../../api/alarmApi';

// Sub-components
import { AlarmContextMenu } from './AlarmContextMenu';
import { AcknowledgeDialog } from './AcknowledgeDialog';
import { ShelveDialog } from './ShelveDialog';
import { SuppressDialog, OutOfServiceDialog } from './SuppressDialog';
import { AlarmDetailPanel } from './AlarmDetailPanel';
import { FloodAlertBanner } from '../shared/FloodAlertBanner';
import { PriorityBadge } from '../shared/PriorityBadge';
import { AlarmStateIcon } from '../shared/AlarmStateIcon';
import { useLiveEventsPanel } from '../../context/LiveEventsContext';

// OpenBridge Components
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

const AlarmConsole: React.FC = () => {
  const gridRef = useRef<AgGridReact<ActiveAlarm>>(null);
  const sortStateRef = useRef<Array<{ colId: string; sort: 'asc' | 'desc'; sortIndex?: number }>>([]);
  const alarmSnapshotRef = useRef<Map<string, ActiveAlarm>>(new Map());

  const alarms = useAlarmStore(s => s.alarms);
  const connectedOpcServerIds = useAlarmStore(s => s.connectedOpcServerIds);
  const stats = useAlarmStore(s => s.stats);
  const floodAlert = useAlarmStore(s => s.floodAlert);
  const selectedIds = useAlarmStore(s => s.selectedAlarmIds);
  const connectionState = useAlarmStore(s => s.connectionState);
  const clearSel = useAlarmStore(s => s.clearSelection);
  const setSelected = useAlarmStore(s => s.setSelectedAlarmIds);
  const applyAckLifecycle = useAlarmStore(s => s.applyAckLifecycle);
  const lastUpdated = useAlarmStore(s => s.lastUpdated);
  const { showLiveEvents, toggleLiveEvents } = useLiveEventsPanel();

  // Dialog / panel state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; alarm: ActiveAlarm } | null>(null);
  const [quickFilter, setQuickFilter] = useState('');
  const [ackDialogOpen, setAckDialogOpen] = useState(false);
  const [ackDialogAlarms, setAckDialogAlarms] = useState<ActiveAlarm[]>([]);
  const [shelveDialogOpen, setShelveDialogOpen] = useState(false);
  const [shelveDialogAlarms, setShelveDialogAlarms] = useState<ActiveAlarm[]>([]);
  const [suppressDialogOpen, setSuppressDialogOpen] = useState(false);
  const [suppressTarget, setSuppressTarget] = useState<ActiveAlarm | null>(null);
  const [oosDialogOpen, setOosDialogOpen] = useState(false);
  const [oosTarget, setOosTarget] = useState<ActiveAlarm | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [detailAlarm, setDetailAlarm] = useState<ActiveAlarm | null>(null);

  // Freeze mode
  const [isFrozen, setIsFrozen] = useState(false);
  const [frozenData, setFrozenData] = useState<ActiveAlarm[]>([]);

  const rowData = useMemo(() => {
    const filter = (a: ActiveAlarm) =>
      alarmMatchesConnectedOpcServer(a, connectedOpcServerIds) && isDisplayableOpcAlarm(a);
    if (isFrozen) return frozenData.filter(filter).sort(sortAlarmsForConsole);
    return Array.from(alarms.values()).filter(filter).sort(sortAlarmsForConsole);
  }, [alarms, isFrozen, frozenData, connectedOpcServerIds]);

  // ─── Dialog openers ────────────────────────────────────────────────────────

  const openAckDialog = useCallback((alarmsToAck?: ActiveAlarm[]) => {
    const targets = alarmsToAck
      ?? (Array.from(selectedIds).map(id => alarms.get(id)).filter(Boolean) as ActiveAlarm[]);
    if (targets.length === 0) { toast.warning('No alarms selected'); return; }
    setAckDialogAlarms(targets);
    setAckDialogOpen(true);
  }, [selectedIds, alarms]);

  const openShelveDialog = useCallback((alarmsToShelve?: ActiveAlarm[]) => {
    const targets = alarmsToShelve
      ?? (Array.from(selectedIds).map(id => alarms.get(id)).filter(Boolean) as ActiveAlarm[]);
    if (targets.length === 0) { toast.warning('No alarms selected'); return; }
    setShelveDialogAlarms(targets);
    setShelveDialogOpen(true);
  }, [selectedIds, alarms]);

  const openSuppressDialog = useCallback((alarm: ActiveAlarm) => {
    setSuppressTarget(alarm);
    setSuppressDialogOpen(true);
  }, []);

  const openOosDialog = useCallback((alarm: ActiveAlarm) => {
    setOosTarget(alarm);
    setOosDialogOpen(true);
  }, []);

  const openDetailPanel = useCallback((alarm: ActiveAlarm) => {
    setDetailAlarm(alarm);
    setDetailPanelOpen(true);
    setContextMenu(null);
  }, []);

  // ─── Freeze toggle ─────────────────────────────────────────────────────────

  const toggleFreeze = useCallback(() => {
    setIsFrozen(prev => {
      const next = !prev;
      if (next) {
        setFrozenData(Array.from(alarms.values()).filter(a =>
          alarmMatchesConnectedOpcServer(a, connectedOpcServerIds) && isDisplayableOpcAlarm(a)));
        toast.info('Freeze Mode ON: Alarm grid updates paused.', { autoClose: 2000 });
      } else {
        setFrozenData([]);
        toast.info('Freeze Mode OFF: Resuming real-time updates.', { autoClose: 2000 });
      }
      return next;
    });
  }, [alarms, connectedOpcServerIds]);

  // ─── Action handlers ───────────────────────────────────────────────────────

  const handleAcknowledgeConfirm = useCallback(async (comment: string, operatorStation: string) => {
    const targets = ackDialogAlarms.filter(a => !a.acknowledged);
    if (targets.length === 0) return;

    const ackable = targets.filter(a => isOpcAckWriteable(a));
    const skipped = targets.filter(a => !ackable.some(k => k.id === a.id));
    const ids = ackable.map(a => a.id);

    if (skipped.length > 0) {
      const reasons = skipped.map(a => `${a.sourceName}: ${opcAckSkipReason(a) || 'Not writeback-ackable'}`);
      toast.warning(
        `Skipped ${skipped.length} alarm(s) — ${reasons[0]}${reasons.length > 1 ? ` (+${reasons.length - 1} more)` : ''}`,
        { autoClose: 5000 },
      );
    }
    if (ids.length === 0) { clearSel(); return; }

    const now = Date.now();
    ids.forEach(id => applyAckLifecycle(id, 'ACK_REQUESTED', 'Command submitted', now));
    clearSel();

    void (async () => {
      try {
        const data = await acknowledgeAlarmsBatch(ids, comment, operatorStation);
        toast.success(
          data?.message ?? `Acknowledgement dispatched for ${ids.length} alarm(s). Awaiting DCS confirmation via SignalR.`,
          { autoClose: 1800 },
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Acknowledge failed';
        ids.forEach(id => applyAckLifecycle(id, 'ACK_FAILED', msg, Date.now()));
        toast.error(msg);
      }
    })();
  }, [ackDialogAlarms, clearSel, applyAckLifecycle]);

  const handleShelveConfirm = useCallback(async (durationMinutes: number, comment: string, operatorStation: string) => {
    try {
      await Promise.all(
        shelveDialogAlarms.map(a => shelveAlarmApi(a.id, durationMinutes, comment, operatorStation)),
      );
      toast.success(`Shelve command sent for ${shelveDialogAlarms.length} alarm(s). State updates via SignalR.`);
      clearSel();
    } catch {
      toast.error('Shelve command failed');
    }
  }, [shelveDialogAlarms, clearSel]);

  const handleSuppressConfirm = useCallback(async (reason: string, operatorStation: string) => {
    if (!suppressTarget) return;
    try {
      await suppressAlarmApi(suppressTarget.id, reason, operatorStation);
      toast.success(`Suppress command sent for ${suppressTarget.sourceName}.`);
    } catch {
      toast.error('Suppress command failed');
    }
  }, [suppressTarget]);

  const handleOosConfirm = useCallback(async (reason: string, operatorStation: string) => {
    if (!oosTarget) return;
    try {
      await setAlarmOutOfServiceApi(oosTarget.id, reason, operatorStation);
      toast.success(`Out-of-service command sent for ${oosTarget.sourceName}.`);
    } catch {
      toast.error('Out-of-service command failed');
    }
  }, [oosTarget]);

  // ─── Column definitions ────────────────────────────────────────────────────
  // Pinned-left columns are declared first and contiguously (selection,
  // Priority, Event Time) so the fixed region is predictable and never
  // interleaves with scrolling columns.

  const columnDefs = useMemo<ColDef<ActiveAlarm>[]>(() => [
    {
      headerName: '',
      field: 'id',
      width: 44,
      minWidth: 44,
      maxWidth: 44,
      pinned: 'left',
      headerCheckboxSelection: true,
      checkboxSelection: true,
      suppressHeaderMenuButton: true,
      sortable: false,
      filter: false,
      resizable: false,
      cellClass: 'ob-checkbox-cell',
      headerClass: 'ob-checkbox-header',
      valueFormatter: () => '',   // do not render the row id text inside the 44px selection column
      cellStyle: { padding: 0 },
    },
    {
      headerName: 'Priority',
      field: 'priority',
      width: 96,
      minWidth: 80,
      pinned: 'left',
      cellRenderer: (p: { value: string }) => <PriorityBadge priority={p.value} />,
      comparator: (a, b) => {
        const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, DIAGNOSTIC: 4 };
        return (order[a] ?? 9) - (order[b] ?? 9);
      },
    },
    {
      headerName: 'Event Time',
      field: 'eventTimeEpochMs',
      width: 176,
      minWidth: 150,
      pinned: 'left',
      cellRenderer: (p: { value: number }) => (
        <span className="timestamp">{formatTimestampMs(p.value)}</span>
      ),
      filter: 'agDateColumnFilter',
    },
    {
      headerName: 'State',
      field: 'state',
      width: 100,
      minWidth: 90,
      cellRenderer: (p: { data?: ActiveAlarm }) => p.data ? <AlarmStateIcon alarm={p.data} /> : null,
    },
    {
      headerName: 'ACK',
      field: 'ackLifecycleState',
      width: 150,
      minWidth: 120,
      valueGetter: (p) => {
        if (!p.data) return '—';
        if (p.data.acknowledged) return p.data.ackLifecycleState ?? 'ACK_CONFIRMED';
        return p.data.ackLifecycleState ?? '—';
      },
      cellRenderer: (p: { data?: ActiveAlarm }) => {
        const a = p.data;
        if (!a) return null;

        if (a.acknowledged) {
          const isExternal = !a.ackLifecycleState || a.ackLifecycleState === '';
          const ackSource = (a.opcAttributes?.['ackSource'] as string | undefined)
            ?? (a.ackedByUsername ? `By: ${a.ackedByUsername}` : null)
            ?? (isExternal ? 'Ext. OPC' : 'This App');
          return (
            <span className="ack-lifecycle-badge ack-lifecycle--ack-confirmed" title={`Acknowledged — Source: ${ackSource}`}>
              ✓ {ackSource}
            </span>
          );
        }

        const st = a.ackLifecycleState;
        if (st) {
          const ms = a.ackRequestedAtEpochMs ? Date.now() - a.ackRequestedAtEpochMs : 0;
          const timer = ms > 0 && !['ACK_CONFIRMED', 'ACK_FAILED', 'ACK_TIMEOUT'].includes(st)
            ? `${(ms / 1000).toFixed(1)}s` : '';
          return (
            <span className={`ack-lifecycle-badge ack-lifecycle--${st.toLowerCase().replace(/_/g, '-')}`} title={st}>
              {st.replace('ACK_', '')}{timer ? ` · ${timer}` : ''}
            </span>
          );
        }

        const writeable = isOpcAckWriteable(a);
        return (
          <button
            className={`ack-inline-btn${writeable ? '' : ' ack-inline-btn--locked'}`}
            onClick={(ev) => { ev.stopPropagation(); if (writeable) openAckDialog([a]); else toast.info(opcAckSkipReason(a)); }}
            title={writeable ? 'Acknowledge this alarm' : opcAckSkipReason(a)}
          >
            Ack
          </button>
        );
      },
    },
    {
      headerName: 'Source',
      field: 'sourceName',
      flex: 1.2,
      minWidth: 140,
      filter: 'agTextColumnFilter',
      tooltipField: 'sourceName',
      cellStyle: { fontFamily: "'Noto Sans Mono', monospace", fontSize: '11px' },
    },
    {
      headerName: 'Condition',
      field: 'conditionName',
      width: 140,
      minWidth: 110,
      filter: 'agTextColumnFilter',
    },
    {
      headerName: 'Sub-Condition',
      field: 'subConditionName',
      width: 130,
      minWidth: 100,
      filter: 'agTextColumnFilter',
    },
    {
      headerName: 'Message',
      field: 'message',
      flex: 1.5,
      minWidth: 180,
      filter: 'agTextColumnFilter',
      tooltipField: 'message',
    },
    {
      headerName: 'Sev',
      field: 'severity',
      width: 64,
      minWidth: 56,
      type: 'numericColumn',
      cellStyle: (p) => ({
        color: p.value >= 900 ? 'var(--alert-alarm-border-color)'
             : p.value >= 700 ? 'var(--alert-warning-border-color)'
             : p.value >= 400 ? 'var(--alert-caution-border-color)'
             : 'var(--on-container-neutral-color)',
        fontFamily: "'Noto Sans Mono', monospace",
        fontWeight: 700,
        fontSize: '12px',
      }),
    },
    {
      headerName: 'Category',
      field: 'category',
      width: 110,
      minWidth: 90,
      filter: 'agTextColumnFilter',
    },
    {
      headerName: 'Server',
      field: 'serverName',
      width: 150,
      minWidth: 120,
      filter: 'agTextColumnFilter',
    },
    {
      headerName: 'Process Val',
      field: 'processValue',
      width: 120,
      type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? `${Number(p.value).toFixed(2)} ${p.data?.processUnit ?? ''}` : '',
      cellStyle: { fontFamily: "'Noto Sans Mono', monospace", fontSize: '12px' },
    },
    {
      headerName: 'Ack By',
      field: 'ackedByUsername',
      width: 110,
      minWidth: 90,
      filter: 'agTextColumnFilter',
    },
    {
      headerName: 'Ack Time',
      field: 'ackTimeEpochMs',
      width: 160,
      cellRenderer: (p: { value: number | null }) =>
        p.value ? <span className="timestamp">{formatTimestampMs(p.value)}</span> : null,
    },
    {
      headerName: 'Time in Alarm',
      width: 116,
      minWidth: 96,
      sortable: false,
      filter: false,
      valueGetter: (p) => {
        if (!p.data) return '';
        const ms = Date.now() - p.data.activeTimeEpochMs;
        const h = Math.floor(ms / 3_600_000);
        const m = Math.floor((ms % 3_600_000) / 60_000);
        const s = Math.floor((ms % 60_000) / 1000);
        return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
      },
      cellStyle: (p) => {
        const ms = p.data ? Date.now() - p.data.activeTimeEpochMs : 0;
        return {
          color: ms > 3_600_000 ? 'var(--alert-warning-border-color)' : 'var(--on-container-neutral-color)',
          fontFamily: "'Noto Sans Mono', monospace",
          fontSize: '12px',
        };
      },
    },
  ] as ColDef<ActiveAlarm>[], [openAckDialog]);

  // ─── Row class rules ────────────────────────────────────────────────────────

  const getRowClass = useCallback((params: RowClassParams<ActiveAlarm>): string => {
    const a = params.data;
    if (!a) return '';
    const classes: string[] = [];
    classes.push(`alarm-row-${a.priority.toLowerCase()}`);
    const ackSt = a.ackLifecycleState;
    if (ackSt && ['ACK_REQUESTED', 'ACK_QUEUED', 'ACK_PROCESSING', 'ACK_PENDING_DCS'].includes(ackSt)) {
      classes.push('alarm-ack-pending');
    } else if (ackSt === 'ACK_DISPATCHED') {
      classes.push('alarm-ack-dispatched');
    } else if (ackSt === 'ACK_FAILED' || ackSt === 'ACK_TIMEOUT') {
      classes.push('alarm-ack-failed');
    } else if (ackSt === 'ACK_RETRYING') {
      classes.push('alarm-ack-retrying');
    } else if (!a.acknowledged && a.priority === 'CRITICAL') {
      classes.push('alarm-unacked');
    }
    if (a.isShelved) classes.push('alarm-row-shelved');
    if (a.isSuppressed) classes.push('alarm-row-suppressed');
    return classes.join(' ');
  }, []);

  const getRowId = useCallback((p: GetRowIdParams<ActiveAlarm>) => p.data.id, []);

  // ─── Grid events ────────────────────────────────────────────────────────────

  const onGridReady = useCallback((e: GridReadyEvent) => {
    if (sortStateRef.current.length > 0) {
      e.api.applyColumnState({ state: sortStateRef.current, defaultState: { sort: null } });
    } else {
      e.api.applyColumnState({
        state: [
          { colId: 'eventTimeEpochMs', sort: 'desc', sortIndex: 0 },
          { colId: 'priority', sort: 'asc', sortIndex: 1 },
        ],
        defaultState: { sort: null },
      });
    }
    alarmSnapshotRef.current = new Map(rowData.map(a => [a.id, a]));
    if (rowData.length > 0) {
      e.api.applyTransactionAsync({ add: rowData });
    }
  }, [rowData]);

  const onSortChanged = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    sortStateRef.current = api
      .getColumnState()
      .filter(c => c.sort === 'asc' || c.sort === 'desc')
      .map(c => ({ colId: c.colId, sort: c.sort as 'asc' | 'desc', sortIndex: c.sortIndex ?? undefined }));
  }, []);

  const onCellContextMenu = useCallback((e: CellContextMenuEvent<ActiveAlarm>) => {
    e.event?.preventDefault();
    if (!e.data) return;
    setContextMenu({
      x: (e.event as MouseEvent).clientX,
      y: (e.event as MouseEvent).clientY,
      alarm: e.data,
    });
  }, []);

  const onRowDoubleClicked = useCallback((e: RowDoubleClickedEvent<ActiveAlarm>) => {
    if (e.data) openDetailPanel(e.data);
  }, [openDetailPanel]);

  const onSelectionChanged = useCallback((e: SelectionChangedEvent<ActiveAlarm>) => {
    setSelected(e.api.getSelectedRows().map(r => r.id));
  }, [setSelected]);

  // ─── Incremental grid updates via applyTransactionAsync ────────────────────

  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api || isFrozen) return;
    const prevMap = alarmSnapshotRef.current;
    if (prevMap.size === 0) {
      if (rowData.length === 0) return;
      alarmSnapshotRef.current = new Map(rowData.map(a => [a.id, a]));
      api.applyTransactionAsync({ add: rowData }, () => {
        api.refreshClientSideRowModel('sort');
      });
      return;
    }

    const nextMap = new Map(rowData.map(a => [a.id, a]));
    const adds: ActiveAlarm[] = [];
    const updates: ActiveAlarm[] = [];
    const removes: { id: string }[] = [];

    for (const a of rowData) {
      if (!prevMap.has(a.id)) adds.push(a);
      else if (prevMap.get(a.id) !== a) updates.push(a);
    }
    for (const id of prevMap.keys()) {
      if (!nextMap.has(id)) removes.push({ id });
    }

    if (adds.length || updates.length || removes.length) {
      api.applyTransactionAsync({
        add: adds,
        update: updates,
        remove: removes as unknown as ActiveAlarm[],
      }, () => {
        api.refreshClientSideRowModel('sort');
      });
    }
    alarmSnapshotRef.current = nextMap;
  }, [lastUpdated, rowData, isFrozen]);

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────

  useHotkeys('ctrl+a', (e) => {
    e.preventDefault();
    gridRef.current?.api?.selectAll();
  }, { enableOnFormTags: false });

  useHotkeys('escape', () => {
    clearSel();
    setContextMenu(null);
  });

  useHotkeys('ctrl+shift+a', (e) => {
    e.preventDefault();
    openAckDialog();
  });

  useHotkeys('f2', (e) => {
    e.preventDefault();
    openAckDialog();
  });

  useHotkeys('f5', (e) => {
    e.preventDefault();
    gridRef.current?.api.refreshCells({ force: true });
  });

  // ─── Toolbar handlers ──────────────────────────────────────────────────────

  const handleExportCsv = useCallback(() => {
    if (gridRef.current?.api) {
      gridRef.current.api.exportDataAsCsv({ fileName: `ams_active_alarms_${Date.now()}.csv` });
      toast.info('Exported active alarms to CSV.');
    } else {
      toast.error('Grid is not ready for export.');
    }
  }, []);

  const handleClearSelection = useCallback(() => {
    gridRef.current?.api?.deselectAll();
    clearSel();
  }, [clearSel]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="alarm-console-page">
      {/* Flood Alert Banner */}
      {floodAlert?.isFlood && <FloodAlertBanner alert={floodAlert} />}

      {/* KPI Summary Bar */}
      <KpiSummaryBar stats={stats} connectionState={connectionState} />

      {/* Toolbar */}
      <div className="toolbar">
        {/* Search */}
        <div className="toolbar__search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--on-container-neutral-color)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="toolbar__search-input"
            placeholder="Filter by Source, Message, Condition..."
            value={quickFilter}
            onChange={(e) => setQuickFilter(e.target.value)}
          />
          {quickFilter && (
            <button
              onClick={() => setQuickFilter('')}
              style={{ background: 'none', border: 'none', color: 'var(--on-container-neutral-color)', cursor: 'pointer', padding: '2px', fontSize: '12px' }}
              title="Clear filter"
            >
              ✕
            </button>
          )}
        </div>

        <div className="toolbar__divider" />

        {selectedIds.size > 0 && (
          <>
            <div className="toolbar__selection">
              <span className="toolbar__selection-count">{selectedIds.size}</span>
              <span>selected</span>
            </div>
            <div className="toolbar__divider" />
          </>
        )}

        {/* Freeze */}
        <ObcButton variant={isFrozen ? 'raised' : 'flat'} size="small" onClick={toggleFreeze}>
          {isFrozen ? '❄ Frozen' : '⏸ Freeze'}
        </ObcButton>

        {/* Acknowledge */}
        <ObcButton
          variant="normal"
          size="small"
          disabled={selectedIds.size === 0}
          onClick={() => openAckDialog()}
        >
          ✔ Acknowledge (F2)
        </ObcButton>

        {/* Shelve */}
        <ObcButton
          variant="flat"
          size="small"
          disabled={selectedIds.size === 0}
          onClick={() => openShelveDialog()}
        >
          📥 Shelve
        </ObcButton>

        {selectedIds.size > 0 && (
          <ObcButton variant="flat" size="small" onClick={handleClearSelection}>
            Clear (Esc)
          </ObcButton>
        )}

        <div className="toolbar__divider" />

        {/* Export CSV */}
        <ObcButton variant="flat" size="small" onClick={handleExportCsv}>
          ↓ Export CSV
        </ObcButton>

        {/* Refresh */}
        <ObcButton
          variant="flat"
          size="small"
          onClick={() => gridRef.current?.api.refreshCells({ force: true })}
        >
          ↻ Refresh (F5)
        </ObcButton>

        <div className="toolbar__divider" />

        {/* Live Events panel toggle */}
        <ObcButton
          variant={showLiveEvents ? 'flat' : 'normal'}
          size="small"
          onClick={toggleLiveEvents}
        >
          {showLiveEvents ? 'Hide Events ◂' : 'Show Events ▸'}
        </ObcButton>
      </div>

      {/* AG Grid — OpenBridge themed (Alpine base + OpenBridge token layer).
          v32 uses CSS-class theming: the `ag-theme-alpine ag-theme-openbridge`
          classes on the wrapper do the work. Fills remaining height. */}
      <div className="ag-theme-alpine ag-theme-openbridge" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <AgGridReact<ActiveAlarm>
          ref={gridRef}
          rowHeight={40}
          headerHeight={40}
          floatingFiltersHeight={34}
          suppressAnimationFrame={false}
          rowBuffer={20}
          asyncTransactionWaitMillis={50}
          maintainColumnOrder={true}
          columnDefs={columnDefs}
          getRowId={getRowId}
          getRowClass={getRowClass}
          onGridReady={onGridReady}
          onSortChanged={onSortChanged}
          onCellContextMenu={onCellContextMenu}
          suppressContextMenu={true}
          preventDefaultOnContextMenu={true}
          onRowDoubleClicked={onRowDoubleClicked}
          onSelectionChanged={onSelectionChanged}
          quickFilterText={quickFilter}
          animateRows={true}
          rowSelection="multiple"
          suppressRowClickSelection={false}
          defaultColDef={{
            sortable: true,
            filter: true,
            resizable: true,
            floatingFilter: true,
            suppressMovable: false,
          }}
          tooltipShowDelay={500}
          tooltipHideDelay={3000}
          domLayout="normal"
          enableCellTextSelection={true}
          columnMenu="legacy"
          context={{ selectedIds }}
        />
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <AlarmContextMenu
          alarm={contextMenu.alarm}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onAcknowledge={(alarm) => { setContextMenu(null); openAckDialog([alarm]); }}
          onShelve={(alarm) => { setContextMenu(null); openShelveDialog([alarm]); }}
          onSuppress={(alarm) => { setContextMenu(null); openSuppressDialog(alarm); }}
          onOutOfService={(alarm) => { setContextMenu(null); openOosDialog(alarm); }}
          onViewDetails={(alarm) => { setContextMenu(null); openDetailPanel(alarm); }}
        />
      )}

      {/* Acknowledge Dialog */}
      <AcknowledgeDialog
        isOpen={ackDialogOpen}
        onClose={() => setAckDialogOpen(false)}
        alarms={ackDialogAlarms}
        onConfirm={handleAcknowledgeConfirm}
      />

      {/* Shelve Dialog */}
      <ShelveDialog
        isOpen={shelveDialogOpen}
        onClose={() => setShelveDialogOpen(false)}
        alarms={shelveDialogAlarms}
        onConfirm={handleShelveConfirm}
      />

      {/* Suppress Dialog */}
      <SuppressDialog
        isOpen={suppressDialogOpen}
        onClose={() => setSuppressDialogOpen(false)}
        alarm={suppressTarget}
        onConfirm={handleSuppressConfirm}
      />

      {/* Out of Service Dialog */}
      <OutOfServiceDialog
        isOpen={oosDialogOpen}
        onClose={() => setOosDialogOpen(false)}
        alarm={oosTarget}
        onConfirm={handleOosConfirm}
      />

      {/* Detail Panel */}
      <AlarmDetailPanel
        alarm={detailAlarm}
        isOpen={detailPanelOpen}
        onClose={() => setDetailPanelOpen(false)}
        onAcknowledge={(alarm) => { setDetailPanelOpen(false); openAckDialog([alarm]); }}
        onShelve={(alarm) => { setDetailPanelOpen(false); openShelveDialog([alarm]); }}
        onSuppress={(alarm) => { setDetailPanelOpen(false); openSuppressDialog(alarm); }}
        onOutOfService={(alarm) => { setDetailPanelOpen(false); openOosDialog(alarm); }}
      />
    </div>
  );
};

// ─── KPI Summary Bar ──────────────────────────────────────────────────────────

interface KpiSummaryBarProps {
  stats: {
    totalActive: number;
    totalCritical: number;
    totalHigh: number;
    totalMedium: number;
    totalLow: number;
    unacknowledged: number;
    shelved: number;
    suppressed: number;
    alarmsPerTenMin: number;
    floodActive: boolean;
  };
  connectionState: string;
}

const KpiSummaryBar: React.FC<KpiSummaryBarProps> = ({ stats, connectionState }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    background: 'var(--container-background-color)',
    border: '1px solid var(--divider-color)',
    borderRadius: 'var(--corner-radius, 4px)',
    padding: '8px 16px',
    flexWrap: 'nowrap',
    overflowX: 'auto',
    whiteSpace: 'nowrap',
  }}>
    {/* Total Active — prominent */}
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: '64px' }}>
      <span style={{ fontSize: '10px', color: 'var(--on-container-neutral-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Active</span>
      <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--on-container-active-color)', lineHeight: 1.1 }}>{stats.totalActive}</span>
    </div>

    <div style={{ width: '1px', height: '32px', background: 'var(--divider-color)', flexShrink: 0 }} />

    {/* Priority breakdown */}
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
      <KpiItem label="Critical" count={stats.totalCritical} color="var(--alert-alarm-border-color)" />
      <KpiItem label="High" count={stats.totalHigh} color="var(--alert-warning-border-color)" />
      <KpiItem label="Medium" count={stats.totalMedium} color="var(--alert-caution-border-color)" />
      <KpiItem label="Low" count={stats.totalLow} color="var(--on-container-neutral-color)" />
    </div>

    <div style={{ width: '1px', height: '32px', background: 'var(--divider-color)', flexShrink: 0 }} />

    {/* Status counts */}
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
      <KpiItem label="Unacked" count={stats.unacknowledged} color="var(--alert-warning-border-color)" highlight={stats.unacknowledged > 0} />
      <KpiItem label="Shelved" count={stats.shelved} color="var(--on-container-neutral-color)" />
      <KpiItem label="Suppressed" count={stats.suppressed} color="var(--on-container-neutral-color)" />
    </div>

    <div style={{ width: '1px', height: '32px', background: 'var(--divider-color)', flexShrink: 0 }} />

    {/* Alarm rate */}
    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right', minWidth: '76px' }}>
      <span style={{ fontSize: '10px', color: 'var(--on-container-neutral-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alarms/10 Min</span>
      <span style={{
        fontSize: '20px',
        fontWeight: 700,
        lineHeight: 1.1,
        color: stats.alarmsPerTenMin > 10 ? 'var(--alert-alarm-border-color)' : 'var(--running-color)',
      }}>{stats.alarmsPerTenMin.toFixed(1)}</span>
    </div>

    {/* Connection state */}
    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
      <div style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: connectionState === 'Connected' ? 'var(--running-color)' : 'var(--alert-alarm-border-color)',
        boxShadow: `0 0 6px ${connectionState === 'Connected' ? 'var(--running-color)' : 'var(--alert-alarm-border-color)'}`,
      }} />
      <span style={{
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        color: connectionState === 'Connected' ? 'var(--running-color)' : 'var(--alert-alarm-border-color)',
      }}>
        {connectionState}
      </span>
    </div>
  </div>
);

const KpiItem: React.FC<{ label: string; count: number; color: string; highlight?: boolean }> = ({
  label, count, color, highlight,
}) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: highlight ? '2px 8px' : '0',
    background: highlight ? 'var(--alert-warning-background-color)' : 'transparent',
    border: highlight ? '1px solid var(--alert-warning-border-color)' : 'none',
    borderRadius: '4px',
  }}>
    <div style={{ width: '3px', height: '14px', background: color, borderRadius: '2px' }} />
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: '9px', color: 'var(--on-container-neutral-color)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--on-container-active-color)' }}>{count}</span>
    </div>
  </div>
);

export default AlarmConsole;