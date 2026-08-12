'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  GridApi,
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
import { useSearchParams } from 'react-router-dom';

import { useAlarmStore, type ActiveAlarm } from '../../store/alarmStore';
import { useDebounce } from '../../hooks/useDebounce';
import { formatTimestampMs } from '../../utils/time';
import { alarmMatchesConnectedOpcServer, isDisplayableOpcAlarm, sortAlarmsForConsole } from '../../utils/opcAlarmFilter';
import { alarmSortKeyChanged, alarmsEqual } from '../../utils/alarmReconciliation';
import { isOpcAckWriteable, opcAckSkipReason } from '../../utils/opcAckWriteable';
import {
  acknowledgeAlarmsBatch,
  shelveAlarm as shelveAlarmApi,
  unshelveAlarm as unshelveAlarmApi,
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

  // Drill-in presets (from the Dashboard KPI cards): /alarms?priority=CRITICAL, ?unacked=1.
  const [searchParams, setSearchParams] = useSearchParams();
  const presetPriority = (searchParams.get('priority') ?? '').toUpperCase() || null;
  const presetUnacked = searchParams.get('unacked') === '1';
  const clearPreset = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('priority');
    next.delete('unacked');
    setSearchParams(next, { replace: true });
  };

  // Dialog / panel state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; alarm: ActiveAlarm } | null>(null);
  const [quickFilter, setQuickFilter] = useState('');
  // FE-02: the input stays instant; the GRID refilters once per typing pause instead
  // of resorting the whole row set on every keystroke.
  const debouncedQuickFilter = useDebounce(quickFilter, 250);
  // FE-05: distinguish "still hydrating" from "genuinely no active alarms".
  const hydrated = useAlarmStore(s => s.hydrated);
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
      alarmMatchesConnectedOpcServer(a, connectedOpcServerIds) && isDisplayableOpcAlarm(a)
      && (!presetPriority || (a.priority ?? '').toUpperCase() === presetPriority)
      && (!presetUnacked || !a.acknowledged);
    if (isFrozen) return frozenData.filter(filter).sort(sortAlarmsForConsole);
    return Array.from(alarms.values()).filter(filter).sort(sortAlarmsForConsole);
  }, [alarms, isFrozen, frozenData, connectedOpcServerIds, presetPriority, presetUnacked]);

  const rowDataRef = useRef(rowData);
  rowDataRef.current = rowData;
  const isFrozenRef = useRef(isFrozen);
  isFrozenRef.current = isFrozen;

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
    // H: allSettled (not Promise.all) so a partial failure doesn't misreport the
    // whole batch; on ANY failure we THROW so the dialog stays open and shows the
    // inline error (its catch was dead code because this used to swallow errors).
    const results = await Promise.allSettled(
      shelveDialogAlarms.map(a => shelveAlarmApi(a.id, durationMinutes, comment, operatorStation)),
    );
    const failed = results.filter(r => r.status === 'rejected').length;
    const ok = results.length - failed;
    if (ok > 0) toast.success(`Shelve command sent for ${ok} alarm(s). State updates via SignalR.`);
    if (failed > 0) throw new Error(`${failed} of ${results.length} shelve command(s) failed.`);
    clearSel();
  }, [shelveDialogAlarms, clearSel]);

  // G: real unshelve (no dialog — it takes no parameters).
  const handleUnshelve = useCallback(async (alarm: ActiveAlarm) => {
    try {
      await unshelveAlarmApi(alarm.id, 'CCR-01');
      toast.success('Unshelve command sent. State updates via SignalR.');
    } catch {
      toast.error('Unshelve command failed');
    }
  }, []);

  const handleSuppressConfirm = useCallback(async (reason: string, operatorStation: string) => {
    if (!suppressTarget) return;
    // H: let a failure reject so the dialog keeps its inline error and stays open.
    await suppressAlarmApi(suppressTarget.id, reason, operatorStation);
    toast.success(`Suppress command sent for ${suppressTarget.sourceName}.`);
  }, [suppressTarget]);

  const handleOosConfirm = useCallback(async (reason: string, operatorStation: string) => {
    if (!oosTarget) return;
    // H: reject on failure so the dialog shows its inline error and stays open.
    await setAlarmOutOfServiceApi(oosTarget.id, reason, operatorStation);
    toast.success(`Out-of-service command sent for ${oosTarget.sourceName}.`);
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
      colId: 'timeInAlarm',
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

  /** Push store rows into AG Grid (must run when grid becomes ready and when data changes). */
  const applyGridSync = useCallback((api: GridApi<ActiveAlarm>) => {
    if (isFrozenRef.current) return;

    const data = rowDataRef.current;
    const prevMap = alarmSnapshotRef.current;

    if (prevMap.size === 0) {
      if (data.length === 0) return;
      alarmSnapshotRef.current = new Map(data.map(a => [a.id, a]));
      api.applyTransactionAsync({ add: data }, () => {
        api.refreshClientSideRowModel('sort');
      });
      return;
    }

    const nextMap = new Map(data.map(a => [a.id, a]));
    const adds: ActiveAlarm[] = [];
    const updates: ActiveAlarm[] = [];
    const removes: { id: string }[] = [];
    let sortChanged = false;

    for (const a of data) {
      const prev = prevMap.get(a.id);
      if (!prev) {
        adds.push(a);
        sortChanged = true;
      } else if (!alarmsEqual(prev, a)) {
        updates.push(a);
        if (alarmSortKeyChanged(prev, a)) sortChanged = true;
      }
    }
    for (const id of prevMap.keys()) {
      if (!nextMap.has(id)) {
        removes.push({ id });
        sortChanged = true;
      }
    }

    if (adds.length || updates.length || removes.length) {
      api.applyTransactionAsync({
        add: adds,
        update: updates,
        remove: removes as unknown as ActiveAlarm[],
      }, () => {
        if (sortChanged) api.refreshClientSideRowModel('sort');
      });
      alarmSnapshotRef.current = nextMap;
    }
  }, []);

  // ─── Grid events ────────────────────────────────────────────────────────────

  const onGridReady = useCallback((e: GridReadyEvent<ActiveAlarm>) => {
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
    applyGridSync(e.api);
  }, [applyGridSync]);

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
    applyGridSync(api);
  }, [lastUpdated, rowData, isFrozen, applyGridSync]);

  useEffect(() => () => {
    alarmSnapshotRef.current = new Map();
  }, []);

  // Refresh live timer columns without reloading alarm data.
  useEffect(() => {
    if (isFrozen) return;
    const id = window.setInterval(() => {
      if (alarmSnapshotRef.current.size === 0) return;
      gridRef.current?.api?.refreshCells({
        columns: ['ackLifecycleState', 'timeInAlarm'],
        force: true,
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [isFrozen]);

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
    // G: was a cells-only repaint that looked like a refresh but re-fetched
    // nothing. Now re-hydrates from the API too.
    void useAlarmStore.getState().refreshActiveAlarms();
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

        {(presetPriority || presetUnacked) && (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '4px 10px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 700,
              background: 'var(--container-section-color)', color: 'var(--element-active-color)',
              border: '1px solid var(--element-active-color)', whiteSpace: 'nowrap',
            }}
          >
            {presetPriority ? `Priority: ${presetPriority}` : 'Unacknowledged only'}
            <button
              onClick={clearPreset}
              aria-label="Clear filter preset"
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: '13px', lineHeight: 1 }}
            >
              ✕
            </button>
          </span>
        )}

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
          onClick={() => {
            void useAlarmStore.getState().refreshActiveAlarms();
            gridRef.current?.api.refreshCells({ force: true });
          }}
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
          quickFilterText={debouncedQuickFilter}
          // FE-05: an empty grid mid-hydration must not read as a quiet plant.
          overlayNoRowsTemplate={hydrated
            ? '<span style="color: var(--on-container-neutral-color)">No active alarms</span>'
            : '<span style="color: var(--on-container-neutral-color)">Loading alarms…</span>'}
          animateRows={false}
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
          onUnshelve={(alarm) => { setContextMenu(null); void handleUnshelve(alarm); }}
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

// ─── Design tokens for KPI bar ────────────────────────────────────────────────

const KT = {
  blue:     'var(--element-active-color)', blueLight: 'var(--container-section-color)', blueMuted: 'var(--border-divider-color)',
  bg:       'var(--container-backdrop-color)', card:      'var(--container-background-color)', border:    'var(--border-divider-color)',
  text:     'var(--element-active-color)', textSub:   'var(--element-neutral-color)', textMuted: 'var(--element-inactive-color)',
  success:  'var(--alert-running-color)', successBg: 'var(--container-section-color)', successBorder: 'var(--alert-running-color)',
  critical: 'var(--alert-alarm-color)', criticalBg:'var(--container-section-color)', criticalBorder:'var(--alert-alarm-color)',
  warning:  'var(--alert-warning-color)', warningBg: 'var(--container-section-color)', warningBorder: 'var(--alert-warning-color)',
  caution:  'var(--alert-caution-color)',
  radiusSm: '8px',
  shadow:   '0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)',
} as const;

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

const KpiSummaryBar: React.FC<KpiSummaryBarProps> = ({ stats, connectionState }) => {
  const isConnected = connectionState === 'Connected';
  const rateHigh    = stats.alarmsPerTenMin > 10;
  const rateWarn    = stats.alarmsPerTenMin > 5;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '4px',
      background: KT.card, border: `1px solid ${KT.border}`,
      borderRadius: KT.radiusSm, padding: '0 6px',
      flexWrap: 'nowrap', overflowX: 'auto', whiteSpace: 'nowrap',
      boxShadow: KT.shadow, flexShrink: 0,
    }}>
      {/* Total Active */}
      <KpiCell>
        <span style={{ fontSize: '10px', color: KT.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Total Active</span>
        <span style={{ fontSize: '22px', fontWeight: 800, color: KT.text, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{stats.totalActive}</span>
      </KpiCell>

      <KpiDivider />

      {/* Priority grid */}
      <div style={{ display: 'flex', gap: '2px', padding: '0 4px' }}>
        <PriorityPill label="CRIT"  count={stats.totalCritical} bg={KT.criticalBg} color={KT.critical} border={KT.criticalBorder} pulse={stats.totalCritical > 0} />
        <PriorityPill label="HIGH"  count={stats.totalHigh}     bg={KT.warningBg}  color={KT.warning}  border={KT.warningBorder} />
        <PriorityPill label="MED"   count={stats.totalMedium}   bg={KT.blueLight}  color={KT.blue}     border={KT.blueMuted} />
        <PriorityPill label="LOW"   count={stats.totalLow}      bg={KT.bg}         color={KT.textMuted} border={KT.border} />
      </div>

      <KpiDivider />

      {/* Status cells */}
      <KpiCell>
        <span style={{ fontSize: '10px', color: KT.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Unacked</span>
        <span style={{
          fontSize: '16px', fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
          color: stats.unacknowledged > 0 ? KT.warning : KT.success,
        }}>
          {stats.unacknowledged}
        </span>
      </KpiCell>
      <KpiCell>
        <span style={{ fontSize: '10px', color: KT.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Shelved</span>
        <span style={{ fontSize: '16px', fontWeight: 700, lineHeight: 1, color: KT.textSub, fontVariantNumeric: 'tabular-nums' }}>{stats.shelved}</span>
      </KpiCell>
      <KpiCell>
        <span style={{ fontSize: '10px', color: KT.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Suppressed</span>
        <span style={{ fontSize: '16px', fontWeight: 700, lineHeight: 1, color: KT.textSub, fontVariantNumeric: 'tabular-nums' }}>{stats.suppressed}</span>
      </KpiCell>

      <KpiDivider />

      {/* Rate */}
      <KpiCell>
        <span style={{ fontSize: '10px', color: KT.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Alarms / 10 min</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <span style={{
            fontSize: '22px', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
            color: rateHigh ? KT.critical : rateWarn ? KT.caution : KT.success,
          }}>
            {stats.alarmsPerTenMin.toFixed(1)}
          </span>
          <span style={{ fontSize: '10px', color: KT.textMuted }}>/ 10m</span>
        </div>
      </KpiCell>

      {/* Connection badge */}
      <div style={{ marginLeft: 'auto', padding: '0 10px', display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0 }}>
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: isConnected ? KT.success : KT.critical,
          boxShadow: `0 0 6px ${isConnected ? KT.success : KT.critical}`,
        }} />
        <span style={{
          fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
          color: isConnected ? KT.success : KT.critical,
        }}>
          {connectionState}
        </span>
      </div>
    </div>
  );
};

const KpiCell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px 10px' }}>
    {children}
  </div>
);

const KpiDivider: React.FC = () => (
  <div style={{ width: '1px', height: '32px', background: KT.border, flexShrink: 0 }} />
);

const PriorityPill: React.FC<{ label: string; count: number; bg: string; color: string; border: string; pulse?: boolean }> = ({
  label, count, bg, color, border, pulse,
}) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '7px 10px', borderRadius: '6px', minWidth: '48px',
    background: count > 0 ? bg : KT.bg,
    border: `1.5px solid ${count > 0 ? border : KT.border}`,
    transition: 'all 160ms ease',
  }}>
    <span style={{ fontSize: '9px', fontWeight: 700, color: count > 0 ? color : KT.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {label}
    </span>
    <span style={{
      fontSize: '17px', fontWeight: 800, lineHeight: 1.1,
      color: count > 0 ? color : KT.textMuted,
      fontVariantNumeric: 'tabular-nums',
      textShadow: pulse && count > 0 ? `0 0 8px ${color}66` : 'none',
    }}>
      {count}
    </span>
  </div>
);


export default AlarmConsole;