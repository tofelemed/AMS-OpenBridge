import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridReadyEvent, CellContextMenuEvent, RowClassParams, GetRowIdParams, RowDoubleClickedEvent, SelectionChangedEvent } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { useAlarmStore, type ActiveAlarm } from '../../store/alarmStore';
import { useHotkeys } from 'react-hotkeys-hook';
import { PriorityBadge } from '../shared/PriorityBadge';
import { AlarmStateIcon } from '../shared/AlarmStateIcon';
import { AlarmToolbar } from './AlarmToolbar';
import { AlarmContextMenu } from './AlarmContextMenu';
import { FloodAlertBanner } from './FloodAlertBanner';
import { KpiSummaryBar } from './KpiSummaryBar';
import { AcknowledgeDialog } from './AcknowledgeDialog';
import { ShelveDialog } from './ShelveDialog';
import { SuppressDialog, OutOfServiceDialog } from './SuppressDialog';
import { AlarmDetailPanel } from './AlarmDetailPanel';
import { formatTimestampMs } from '../../utils/time';
import { alarmMatchesConnectedOpcServer, isDisplayableOpcAlarm, sortAlarmsForConsole } from '../../utils/opcAlarmFilter';
import { isOpcAckWriteable, opcAckSkipReason } from '../../utils/opcAckWriteable';
import { toast } from 'react-toastify';
import {
  acknowledgeAlarmsBatch,
  shelveAlarm as shelveAlarmApi,
  suppressAlarm as suppressAlarmApi,
  setAlarmOutOfService as setAlarmOutOfServiceApi,
} from '../../api/alarmApi';

// ============================================================
// Alarm Console — main real-time alarm grid
// AG Grid Community (no license required). Set VITE_AG_GRID_LICENSE and
// restore ag-grid-enterprise imports to re-enable tree data, sidebar, etc.
// Full OPC AE 1.10 compliant with proper dialog-based actions
// ============================================================

export const AlarmConsole: React.FC = () => {
  const gridRef     = useRef<AgGridReact<ActiveAlarm>>(null);
  const sortStateRef = useRef<Array<{ colId: string; sort: 'asc' | 'desc'; sortIndex?: number }>>([]);
  const alarms      = useAlarmStore(s => s.alarms);
  const connectedOpcServerIds = useAlarmStore(s => s.connectedOpcServerIds);
  const stats       = useAlarmStore(s => s.stats);
  const floodAlert  = useAlarmStore(s => s.floodAlert);
  const selectedIds = useAlarmStore(s => s.selectedAlarmIds);
  const connectionState = useAlarmStore(s => s.connectionState);
  const toggleSel   = useAlarmStore(s => s.toggleAlarmSelection);
  const clearSel    = useAlarmStore(s => s.clearSelection);
  const setSelected = useAlarmStore(s => s.setSelectedAlarmIds);
  const selectAll   = useAlarmStore(s => s.selectAll);
  const applyAckLifecycle = useAlarmStore(s => s.applyAckLifecycle);

  // Dialog states
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; alarm: ActiveAlarm } | null>(null);
  const [quickFilter, setQuickFilter] = useState('');
  const [ackDialogOpen, setAckDialogOpen] = useState(false);
  const [ackDialogAlarms, setAckDialogAlarms] = useState<ActiveAlarm[]>([]);
  const [shelveDialogOpen, setShelveDialogOpen] = useState(false);
  const [shelveDialogAlarms, setShelveDialogAlarms] = useState<ActiveAlarm[]>([]);
  const [suppressDialogOpen, setSuppressDialogOpen] = useState(false);
  const [suppressAlarm, setSuppressAlarm] = useState<ActiveAlarm | null>(null);
  const [oosDialogOpen, setOosDialogOpen] = useState(false);
  const [oosAlarm, setOosAlarm] = useState<ActiveAlarm | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [detailAlarm, setDetailAlarm] = useState<ActiveAlarm | null>(null);
  
  // Freeze Mode
  const [isFrozen, setIsFrozen] = useState(false);
  const [frozenData, setFrozenData] = useState<ActiveAlarm[]>([]);

  // Only alarms from connected OPC-AE server(s) — excludes storm/Kafka lab inject (Kiln/… paths).
  const rowData = useMemo(() => {
    const filter = (a: ActiveAlarm) =>
      alarmMatchesConnectedOpcServer(a, connectedOpcServerIds) && isDisplayableOpcAlarm(a);
    if (isFrozen) return frozenData.filter(filter).sort(sortAlarmsForConsole);
    return Array.from(alarms.values()).filter(filter).sort(sortAlarmsForConsole);
  }, [alarms, isFrozen, frozenData, connectedOpcServerIds]);

  const toggleFreeze = useCallback(() => {
    setIsFrozen(prev => {
      const next = !prev;
      if (next) {
        setFrozenData(Array.from(alarms.values()).filter(a =>
          alarmMatchesConnectedOpcServer(a, connectedOpcServerIds) && isDisplayableOpcAlarm(a)));
        toast.info("Freeze Mode ON: Alarm grid updates paused.", { autoClose: 2000 });
      } else {
        setFrozenData([]);
        toast.info("Freeze Mode OFF: Resuming real-time updates.", { autoClose: 2000 });
      }
      return next;
    });
  }, [alarms, connectedOpcServerIds]);

  // ---- Open dialogs from toolbar or context menu ----
  const openAckDialog = useCallback((alarmsToAck?: ActiveAlarm[]) => {
    const targets = alarmsToAck ?? Array.from(selectedIds).map(id => alarms.get(id)).filter(Boolean) as ActiveAlarm[];
    if (targets.length === 0) return;
    setAckDialogAlarms(targets);
    setAckDialogOpen(true);
  }, [selectedIds, alarms]);

  const openShelveDialog = useCallback((alarmsToShelve?: ActiveAlarm[]) => {
    const targets = alarmsToShelve ?? Array.from(selectedIds).map(id => alarms.get(id)).filter(Boolean) as ActiveAlarm[];
    if (targets.length === 0) return;
    setShelveDialogAlarms(targets);
    setShelveDialogOpen(true);
  }, [selectedIds, alarms]);

  const openSuppressDialog = useCallback((alarm: ActiveAlarm) => {
    setSuppressAlarm(alarm);
    setSuppressDialogOpen(true);
  }, []);

  const openOosDialog = useCallback((alarm: ActiveAlarm) => {
    setOosAlarm(alarm);
    setOosDialogOpen(true);
  }, []);

  const openDetailPanel = useCallback((alarm: ActiveAlarm) => {
    setDetailAlarm(alarm);
    setDetailPanelOpen(true);
    setContextMenu(null);
  }, []);

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
    if (ids.length === 0) {
      clearSel();
      return;
    }

    // Operator intent domain — lifecycle from Flink via SignalR only (no client commandId).
    const now = Date.now();
    ids.forEach(id => {
      applyAckLifecycle(id, 'ACK_REQUESTED', 'Command submitted', now);
    });
    clearSel();

    // Fire-and-forget API dispatch to avoid blocking operator workflow.
    void (async () => {
      try {
        const data = await acknowledgeAlarmsBatch(ids, comment, operatorStation);
        toast.success(
          data?.message ?? `Acknowledgement dispatched for ${ids.length} alarm(s). Awaiting DCS confirmation via SignalR.`,
          { autoClose: 1800 },
        );
      } catch (err: unknown) {
        const msg = err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? err.message
          : 'Acknowledge failed';
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
    if (!suppressAlarm) return;
    try {
      await suppressAlarmApi(suppressAlarm.id, reason, operatorStation);
      toast.success(`Suppress command sent for ${suppressAlarm.sourceName}.`);
    } catch {
      toast.error('Suppress command failed');
    }
  }, [suppressAlarm]);

  const handleOosConfirm = useCallback(async (reason: string, operatorStation: string) => {
    if (!oosAlarm) return;
    try {
      await setAlarmOutOfServiceApi(oosAlarm.id, reason, operatorStation);
      toast.success(`Out-of-service command sent for ${oosAlarm.sourceName}.`);
    } catch {
      toast.error('Out-of-service command failed');
    }
  }, [oosAlarm]);

  // ---- Column definitions ----
  const columnDefs = useMemo<ColDef<ActiveAlarm>[]>(() => [
    {
      headerName: '', field: 'id', width: 40, minWidth: 40, pinned: 'left',
      headerCheckboxSelection: true, checkboxSelection: true,
      suppressHeaderMenuButton: true, sortable: false, filter: false,
    },
    {
      headerName: 'Priority', field: 'priority', width: 100, minWidth: 90, pinned: 'left',
      cellRenderer: (p: { value: string }) => <PriorityBadge priority={p.value} />,
      comparator: (a, b) => {
        const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, DIAGNOSTIC: 4 };
        return (order[a] ?? 9) - (order[b] ?? 9);
      },
    },
    {
      headerName: 'State', field: 'state', width: 110, minWidth: 100,
      cellRenderer: (p: { data?: ActiveAlarm }) => p.data ? <AlarmStateIcon alarm={p.data} /> : null,
      suppressHeaderMenuButton: false,
    },
    {
      headerName: 'ACK', field: 'ackLifecycleState', width: 140, minWidth: 110,
      valueGetter: (p) => {
        if (!p.data) return '—';
        if (p.data.acknowledged) return p.data.ackLifecycleState ?? 'ACK_CONFIRMED';
        return p.data.ackLifecycleState ?? '—';
      },
      cellRenderer: (p: { data?: ActiveAlarm }) => {
        const a = p.data;
        if (!a) return null;

        // ── Alarm already acknowledged (by any source) ──────────────────────
        if (a.acknowledged) {
          const isExternal = !a.ackLifecycleState || a.ackLifecycleState === '';
          const ackSource = (a.opcAttributes?.['ackSource'] as string | undefined)
            ?? (a.ackedByUsername ? `By: ${a.ackedByUsername}` : null)
            ?? (isExternal ? 'Ext. OPC' : 'This App');
          return (
            <span
              className="ack-lifecycle-badge ack-lifecycle--ack-confirmed"
              title={`Acknowledged — Source: ${ackSource}`}
              style={{ cursor: 'default' }}
            >
              ✓ {ackSource}
            </span>
          );
        }

        // ── UI-initiated ACK lifecycle in flight ────────────────────────────
        const st = a.ackLifecycleState;
        if (st) {
          const ms = a.ackRequestedAtEpochMs ? Date.now() - a.ackRequestedAtEpochMs : 0;
          const timer = ms > 0 && st !== 'ACK_CONFIRMED' && st !== 'ACK_FAILED' && st !== 'ACK_TIMEOUT'
            ? `${(ms / 1000).toFixed(1)}s` : '';
          return (
            <span className={`ack-lifecycle-badge ack-lifecycle--${st.toLowerCase().replace(/_/g, '-')}`} title={st}>
              {st.replace('ACK_', '')}{timer ? ` · ${timer}` : ''}
            </span>
          );
        }

        // ── Unacknowledged — show ACK button ────────────────────────────────
        const writeable = isOpcAckWriteable(a);
        return (
          <button
            className={`btn ${writeable ? 'btn--primary' : 'btn--ghost'}`}
            style={{ fontSize: '10px', padding: '2px 8px', height: '20px', lineHeight: '14px', marginTop: '4px' }}
            onClick={(e) => {
              e.stopPropagation();
              if (writeable) openAckDialog([a]);
              else toast.info(opcAckSkipReason(a));
            }}
            title={writeable ? 'Acknowledge this alarm' : opcAckSkipReason(a)}
          >
            Ack
          </button>
        );
      },
    },
    {
      headerName: 'Event Time', field: 'eventTimeEpochMs', width: 185, minWidth: 150, pinned: 'left',
      cellRenderer: (p: { value: number }) => (
        <span className="timestamp timestamp--ms">{formatTimestampMs(p.value)}</span>
      ),
      filter: 'agDateColumnFilter',
    },
    {
      headerName: 'Source', field: 'sourceName', flex: 1, minWidth: 150,
      filter: 'agTextColumnFilter',
      cellClass: 'font-mono-sm',
    },
    {
      headerName: 'Condition', field: 'conditionName', width: 160, minWidth: 120,
      filter: 'agTextColumnFilter',
    },
    {
      headerName: 'Sub-Condition', field: 'subConditionName', width: 130, minWidth: 100,
      filter: 'agTextColumnFilter',
    },
    {
      headerName: 'Message', field: 'message', flex: 1.5, minWidth: 200,
      filter: 'agTextColumnFilter',
      tooltipField: 'message',
    },
    {
      headerName: 'Sev', field: 'severity', width: 65, minWidth: 60, type: 'numericColumn',
      cellStyle: (p) => ({
        color: p.value >= 900 ? 'var(--alarm-critical)'
             : p.value >= 700 ? 'var(--alarm-high)'
             : p.value >= 400 ? 'var(--alarm-medium)'
             : 'var(--text-secondary)',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
      }),
    },
    {
      headerName: 'Category', field: 'category', width: 120, minWidth: 100,
      filter: 'agTextColumnFilter',
    },
    {
      headerName: 'Server', field: 'serverName', width: 150, minWidth: 120,
      filter: 'agTextColumnFilter',
    },
    {
      headerName: 'Process Val', field: 'processValue', width: 110, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? `${p.value.toFixed(2)} ${p.data?.processUnit ?? ''}` : '',
      cellStyle: { fontFamily: 'var(--font-mono)', fontSize: '12px' },
    },
    {
      headerName: 'Ack By', field: 'ackedByUsername', width: 120,
      filter: 'agTextColumnFilter',
    },
    {
      headerName: 'Ack Time', field: 'ackTimeEpochMs', width: 160,
      cellRenderer: (p: { value: number | null }) => 
        p.value ? <span className="timestamp timestamp--ms">{formatTimestampMs(p.value)}</span> : '',
    },
    {
      headerName: 'Time in Alarm', width: 120,
      valueGetter: (p) => {
        if (!p.data) return '';
        const ms = Date.now() - p.data.activeTimeEpochMs;
        const h  = Math.floor(ms / 3_600_000);
        const m  = Math.floor((ms % 3_600_000) / 60_000);
        const s  = Math.floor((ms % 60_000) / 1000);
        return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
      },
      cellStyle: (p) => {
        const ms = p.data ? Date.now() - p.data.activeTimeEpochMs : 0;
        return { color: ms > 3_600_000 ? 'var(--alarm-high)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)' };
      },
    },
  ], []);

  const lastUpdated = useAlarmStore(s => s.lastUpdated);
  const alarmSnapshotRef = useRef<Map<string, ActiveAlarm>>(new Map());

  // SignalR deltas → applyTransactionAsync (immutable row model + getRowId); avoids full grid refresh.
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

  // ---- Row class rules for priority/state coloring ----
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
    e.api.sizeColumnsToFit();
  }, [rowData]);

  const onSortChanged = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    sortStateRef.current = api
      .getColumnState()
      .filter(c => c.sort === 'asc' || c.sort === 'desc')
      .map(c => ({
        colId: c.colId,
        sort: c.sort as 'asc' | 'desc',
        sortIndex: c.sortIndex ?? undefined,
      }));
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
    setSelected(e.api.getSelectedRows().map((r) => r.id));
  }, [setSelected]);

  // ---- Keyboard shortcuts ----
  useHotkeys('ctrl+a', (e) => {
    e.preventDefault();
    gridRef.current?.api?.selectAll();
  }, { enableOnFormTags: false });
  useHotkeys('escape', () => { clearSel(); setContextMenu(null); });
  useHotkeys('ctrl+shift+a', (e) => {
    e.preventDefault();
    openAckDialog();
  });
  useHotkeys('f2', (e) => {
    e.preventDefault();
    openAckDialog();
  });
  useHotkeys('f5', (e) => { e.preventDefault(); gridRef.current?.api.refreshCells({ force: true }); });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Flood Alert Banner */}
      {floodAlert?.isFlood && <FloodAlertBanner alert={floodAlert} />}

      {/* KPI Summary Bar */}
      <KpiSummaryBar stats={stats} connectionState={connectionState} />

      {/* Toolbar */}
      <AlarmToolbar
        gridRef={gridRef}
        selectedIds={selectedIds}
        quickFilter={quickFilter}
        onQuickFilterChange={setQuickFilter}
        onAcknowledge={() => openAckDialog()}
        onShelve={() => openShelveDialog()}
        isFrozen={isFrozen}
        onToggleFreeze={toggleFreeze}
      />

      {/* AG Grid Community — no license watermark */}
      <div className="ag-theme-alpine-dark ag-theme-industrial" style={{ flex: 1, overflow: 'hidden' }}>
        <AgGridReact<ActiveAlarm>
          ref={gridRef}
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
          suppressColumnVirtualisation={false}
          tooltipShowDelay={500}
          tooltipHideDelay={3000}
          domLayout="normal"
          suppressMenuHide={false}
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
        alarm={suppressAlarm}
        onConfirm={handleSuppressConfirm}
      />

      {/* Out of Service Dialog */}
      <OutOfServiceDialog
        isOpen={oosDialogOpen}
        onClose={() => setOosDialogOpen(false)}
        alarm={oosAlarm}
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
