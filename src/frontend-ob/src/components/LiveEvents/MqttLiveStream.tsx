'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getMqttBrokerUrl, useMqttStore, type LiveAlarm } from '../../store/mqttStore';
import { useDebounce } from '../../hooks/useDebounce';
import { MqttAlarmListHeader, MqttAlarmListItem } from './MqttAlarmListItem';
import { LiveAlarmDetailDialog } from './LiveAlarmDetailDialog';
import { ListPager, usePagedSlice } from '../shared/ListPager';
import { T } from '../../styles/theme';


const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

// The DDATA firehose covers every device on the site — page it rather than
// rendering the whole set into the DOM.
const PAGE_SIZE = 50;

const PRIORITY_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  CRITICAL: { color: T.critical, bg: T.criticalBg, border: 'var(--alert-alarm-color)' },
  HIGH:     { color: T.caution,  bg: T.warningBg, border: 'var(--alert-warning-color)' },
  MEDIUM:   { color: T.blue,     bg: T.blueLight, border: T.blueMuted },
  LOW:      { color: T.textMuted, bg: T.bg,       border: T.border },
};

type SortKey = 'newest' | 'severity' | 'priority' | 'source';
type ViewMode = 'list' | 'table';

const SORT_NOTE: Record<SortKey, string> = {
  newest:   'newest first',
  severity: 'highest severity first',
  priority: 'highest priority first',
  source:   'by source',
};

interface MqttLiveStreamProps {
  alarms: LiveAlarm[];
  paused: boolean;
}

function relativeTime(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 0) return 'just now';
  if (sec < 8) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function priorityRank(p: string): number {
  const i = PRIORITIES.indexOf(p as typeof PRIORITIES[number]);
  return i >= 0 ? i : 99;
}

export const MqttLiveStream: React.FC<MqttLiveStreamProps> = ({ alarms, paused }) => {
  const connected      = useMqttStore(s => s.connected);
  const error          = useMqttStore(s => s.error);
  const snapshotLoaded = useMqttStore(s => s.snapshotLoaded);
  const loadAllSnapshots = useMqttStore(s => s.loadAllSnapshots);

  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch]                 = useState('');
  const [sortBy, setSortBy]                 = useState<SortKey>('newest');
  const [viewMode, setViewMode]             = useState<ViewMode>('list');
  const [tick, setTick]                     = useState(0);
  const prevTsRef = useRef<Map<string, number>>(new Map());
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [selectedAlarm, setSelectedAlarm] = useState<LiveAlarm | null>(null);

  // Refresh relative timestamps
  useEffect(() => {
    const id = window.setInterval(() => setTick(n => n + 1), 5000);
    return () => window.clearInterval(id);
  }, []);

  // Highlight rows updated in the last few seconds
  useEffect(() => {
    const nextFlash = new Set<string>();
    for (const a of alarms) {
      const prev = prevTsRef.current.get(a.alarmId);
      if (prev != null && a.ts > prev && !paused) {
        nextFlash.add(a.alarmId);
      }
      prevTsRef.current.set(a.alarmId, a.ts);
    }
    if (nextFlash.size > 0) {
      setFlashIds(nextFlash);
      const t = window.setTimeout(() => setFlashIds(new Set()), 1800);
      return () => window.clearTimeout(t);
    }
  }, [alarms, paused]);

  const stats = useMemo(() => {
    const active = alarms.filter(a => a.conditionActive && a.state !== 'CLEARED');
    return {
      total: alarms.length,
      active: active.length,
      critical: active.filter(a => a.priority === 'CRITICAL').length,
      unack: active.filter(a => !a.acknowledged).length,
    };
  }, [alarms]);

  // FE-02: filter once per typing pause, not per keystroke.
  const debouncedSearch = useDebounce(search, 250);
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    let list = alarms.filter(a => {
      if (priorityFilter && a.priority !== priorityFilter) return false;
      if (q) {
        const hay = `${a.sourceName} ${a.alarmId} ${a.message} ${a.conditionName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'severity': return b.severity - a.severity;
        case 'priority': return priorityRank(a.priority) - priorityRank(b.priority);
        case 'source':   return (a.sourceName || a.alarmId).localeCompare(b.sourceName || b.alarmId);
        default:         return b.ts - a.ts;
      }
    });
    return list;
    // tick is intentionally a dep: it forces the relative-time labels to refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alarms, priorityFilter, debouncedSearch, sortBy, tick]);

  // Re-filtering or re-sorting must land on page 1, not on a now-empty page.
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [priorityFilter, debouncedSearch, sortBy]);
  const { pageCount, safePage, pageItems: pagedAlarms } = usePagedSlice(filtered, page, PAGE_SIZE);

  const brokerLabel = useMemo(() => {
    try {
      const url = new URL(getMqttBrokerUrl(), window.location.origin);
      return url.host + url.pathname.replace(/\/$/, '');
    } catch {
      return 'EMQX WebSocket';
    }
  }, []);

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* Pipeline status + filters — fixed, list scrolls below */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '10px',
      }}>
        <PipelineChip live={connected} label="MQTT" sub={connected ? brokerLabel : 'Reconnecting…'} />
        <PipelineChip live={snapshotLoaded} label="Redis snapshot" sub={snapshotLoaded ? 'Seeded on load' : 'Loading…'} />
        <StatChip label="Active" value={String(stats.active)} accent={stats.active > 0 ? T.caution : T.success} />
        <StatChip label="Unacknowledged" value={String(stats.unack)} accent={stats.unack > 0 ? T.critical : T.textMuted} />
      </div>

      {error && (
        <div style={{
          padding: '12px 16px', background: T.criticalBg, border: '1px solid var(--alert-alarm-color)',
          borderRadius: T.radiusSm, color: T.critical, fontSize: '13px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        }}>
          <span>MQTT error: {error}</span>
        </div>
      )}

      {/* Toolbar */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius,
        padding: '14px 16px', boxShadow: T.shadow,
        display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
          <FilterPill active={!priorityFilter} onClick={() => setPriorityFilter('')}>All</FilterPill>
          {PRIORITIES.map(p => (
            <FilterPill key={p} active={priorityFilter === p} onClick={() => setPriorityFilter(p === priorityFilter ? '' : p)}
              color={PRIORITY_STYLE[p]?.color}>
              {p}
            </FilterPill>
          ))}
        </div>

        <input
          type="search"
          className="ob-input"
          placeholder="Search source, device, message…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 'min(260px, 100%)', minWidth: '160px' }}
        />

        <select className="ob-input" value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)}
          style={{ width: '130px' }} aria-label="Sort alarms">
          <option value="newest">Newest</option>
          <option value="severity">Severity</option>
          <option value="priority">Priority</option>
          <option value="source">Source</option>
        </select>

        <div style={{ display: 'flex', border: `1px solid ${T.border}`, borderRadius: T.radiusSm, overflow: 'hidden' }}>
          <ViewToggle active={viewMode === 'list'} onClick={() => setViewMode('list')} label="List" />
          <ViewToggle active={viewMode === 'table'} onClick={() => setViewMode('table')} label="Table" />
        </div>

        <button type="button" onClick={() => void loadAllSnapshots()} style={toolBtnStyle}
          title="Reload last known state from Redis">
          ↻ Snapshot
        </button>
      </div>
      </div>

      {/* Stream panel — fills remaining height; only the list scrolls */}
      <div style={{
        flex: 1, minHeight: 0,
        background: T.card, border: `1px solid ${T.border}`,
        borderRadius: T.radius, overflow: 'hidden', boxShadow: T.shadow,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '12px 20px', borderBottom: `1.5px solid ${T.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: `linear-gradient(180deg, ${T.bg} 0%, ${T.card} 100%)`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: connected && !paused ? T.success : T.textMuted,
              boxShadow: connected && !paused && stats.active > 0 ? `0 0 8px ${T.success}` : 'none',
            }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              MQTT DDATA Alarms
            </span>
            <span style={{ fontSize: '11px', color: T.textMuted, fontFamily: 'monospace' }}>
              spBv1.0/ams_site1/DDATA/ams_edge1/#
            </span>
          </div>
          <span style={{ fontSize: '11px', color: T.textMuted }}>
            {paused ? 'Paused' : 'Auto-updating'} · {filtered.length} of {stats.total}
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: viewMode === 'table' ? 0 : '0 12px' }}>
          {filtered.length === 0 ? (
            <EmptyMqttState connected={connected} snapshotLoaded={snapshotLoaded} />
          ) : viewMode === 'table' ? (
            <MqttAlarmTable
              alarms={pagedAlarms}
              flashIds={flashIds}
              paused={paused}
              selectedId={selectedAlarm?.alarmId}
              onSelect={setSelectedAlarm}
            />
          ) : (
            <>
              <MqttAlarmListHeader />
              {pagedAlarms.map(alarm => (
                <MqttAlarmListItem
                  key={alarm.alarmId}
                  alarm={alarm}
                  flash={flashIds.has(alarm.alarmId) && !paused}
                  selected={selectedAlarm?.alarmId === alarm.alarmId}
                  onClick={setSelectedAlarm}
                />
              ))}
            </>
          )}
        </div>

        <ListPager
          page={safePage} pageCount={pageCount} pageSize={PAGE_SIZE}
          total={filtered.length} onPageChange={setPage}
          note={paused ? 'paused' : SORT_NOTE[sortBy]}
        />
      </div>
    </div>

    <LiveAlarmDetailDialog
      alarm={selectedAlarm}
      isOpen={selectedAlarm != null}
      onClose={() => setSelectedAlarm(null)}
    />
    </>
  );
};

/* ── Sub-components ─────────────────────────────────────────── */

const toolBtnStyle: React.CSSProperties = {
  padding: '7px 12px', fontSize: '12px', fontWeight: 600,
  border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
  background: T.card, color: T.textSecondary, cursor: 'pointer', fontFamily: 'inherit',
};

const PipelineChip: React.FC<{ live: boolean; label: string; sub: string }> = ({ live, label, sub }) => (
  <div style={{
    padding: '10px 14px', borderRadius: T.radiusSm,
    background: live ? T.successBg : T.bg,
    border: `1px solid ${live ? T.successBorder : T.border}`,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: live ? T.success : T.textMuted }} />
      <span style={{ fontSize: '10px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    </div>
    <div style={{ fontSize: '12px', fontWeight: 600, color: live ? T.success : T.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
  </div>
);

const StatChip: React.FC<{ label: string; value: string; accent: string }> = ({ label, value, accent }) => (
  <div style={{ padding: '10px 14px', borderRadius: T.radiusSm, background: T.card, border: `1px solid ${T.border}` }}>
    <div style={{ fontSize: '10px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
    <div style={{ fontSize: '22px', fontWeight: 700, color: accent, lineHeight: 1 }}>{value}</div>
  </div>
);

const FilterPill: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; color?: string }> =
  ({ active, onClick, children, color }) => (
    <button type="button" onClick={onClick} style={{
      padding: '5px 12px', fontSize: '11px', fontWeight: 700, borderRadius: '20px',
      border: `1.5px solid ${active ? (color ?? T.blue) : T.border}`,
      background: active ? (color ? `${color}14` : T.blueLight) : T.card,
      color: active ? (color ?? T.blue) : T.textSecondary,
      cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.03em',
    }}>
      {children}
    </button>
  );

const ViewToggle: React.FC<{ active: boolean; onClick: () => void; label: string }> = ({ active, onClick, label }) => (
  <button type="button" onClick={onClick} style={{
    padding: '6px 12px', fontSize: '11px', fontWeight: 600, border: 'none',
    background: active ? T.blueLight : T.card,
    color: active ? T.blue : T.textMuted,
    cursor: 'pointer', fontFamily: 'inherit',
  }}>
    {label}
  </button>
);

const EmptyMqttState: React.FC<{ connected: boolean; snapshotLoaded: boolean }> = ({ connected, snapshotLoaded }) => (
  <div style={{ padding: '56px 24px', textAlign: 'center' }}>
    <div style={{
      width: '64px', height: '64px', margin: '0 auto 16px', borderRadius: '50%',
      background: T.blueLight, border: `2px dashed ${T.blueMuted}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px',
    }}>⬡</div>
    <div style={{ fontSize: '16px', fontWeight: 600, color: T.textPrimary, marginBottom: '8px' }}>
      {!connected ? 'Waiting for MQTT connection' : 'No live alarms in view'}
    </div>
    <div style={{ fontSize: '13px', color: T.textMuted, maxWidth: '420px', margin: '0 auto', lineHeight: 1.5 }}>
      {connected
        ? snapshotLoaded
          ? 'Run live_events_feed.py or wait for DDATA from the edge node. Snapshots restore on refresh within the Redis TTL.'
          : 'Loading Redis snapshot…'
        : 'Check EMQX is running and WebSocket proxy (/mqtt-ws) is reachable.'}
    </div>
    <code style={{
      display: 'inline-block', marginTop: '16px', padding: '8px 14px',
      background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
      fontSize: '12px', color: T.blue,
    }}>
      python scripts/e2e-edge/live_events_feed.py --mode mqtt
    </code>
  </div>
);

const MqttAlarmTable: React.FC<{
  alarms: LiveAlarm[];
  flashIds: Set<string>;
  paused: boolean;
  selectedId?: string;
  onSelect: (alarm: LiveAlarm) => void;
}> = ({ alarms, flashIds, paused, selectedId, onSelect }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
    <thead>
      <tr style={{ background: T.bg, borderBottom: `2px solid ${T.border}` }}>
        {['Priority', 'Source / Device', 'State', 'Message', 'Sev', 'Ack', 'Updated'].map(h => (
          <th key={h} style={{
            padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: T.textMuted,
            textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '10px',
          }}>{h}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {alarms.map(alarm => {
        const flash = flashIds.has(alarm.alarmId) && !paused;
        const pStyle = PRIORITY_STYLE[alarm.priority] ?? PRIORITY_STYLE.MEDIUM;
        return (
          <tr
            key={alarm.alarmId}
            onClick={() => onSelect(alarm)}
            style={{
            borderBottom: `1px solid ${T.borderLight}`,
            background: selectedId === alarm.alarmId ? T.blueLight : flash ? T.blueLight : T.card,
            transition: 'background 400ms ease',
            cursor: 'pointer',
          }}>
            <td style={{ padding: '8px 14px' }}>
              <span style={{
                fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px',
                background: pStyle.bg, color: pStyle.color,
              }}>{alarm.priority || '—'}</span>
            </td>
            <td style={{ padding: '8px 14px', fontFamily: 'monospace', fontWeight: 600, color: T.textPrimary }}>
              {alarm.sourceName || alarm.alarmId}
            </td>
            <td style={{ padding: '8px 14px', fontWeight: 600, color: alarm.state === 'CLEARED' ? T.success : alarm.priority === 'CRITICAL' ? T.critical : T.blue }}>
              {alarm.state || 'ACTIVE'}
            </td>
            <td style={{ padding: '8px 14px', color: T.textSecondary, maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {alarm.message || alarm.conditionName || '—'}
            </td>
            <td style={{ padding: '8px 14px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{alarm.severity}</td>
            <td style={{ padding: '8px 14px', color: alarm.acknowledged ? T.success : T.textMuted }}>
              {alarm.acknowledged ? '✓' : '—'}
            </td>
            <td style={{ padding: '8px 14px', color: T.textMuted, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
              {relativeTime(alarm.ts)}
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
);
