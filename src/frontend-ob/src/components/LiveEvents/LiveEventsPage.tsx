'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAlarmStore, type SoeEvent } from '../../store/alarmStore';
import { useMqttStore, type LiveAlarm } from '../../store/mqttStore';
import { formatTimestampMs } from '../../utils/time';

const T = {
  blue:          '#31598F',
  blueMid:       '#4069A5',
  blueLight:     '#EAF2FF',
  blueMuted:     '#C4D8F0',
  bg:            '#F6F8FB',
  card:          '#FFFFFF',
  border:        '#DDE3EA',
  borderLight:   '#EEF2F7',
  textPrimary:   '#1F2937',
  textSecondary: '#6B7280',
  textMuted:     '#9CA3AF',
  success:       '#2E8B57',
  successBg:     '#ECFDF5',
  successBorder: '#A7F3D0',
  warning:       '#B45309',
  warningBg:     '#FFFBEB',
  warningBorder: '#FDE68A',
  critical:      '#D64545',
  criticalBg:    '#FEF2F2',
  caution:       '#D97706',
  radius:        '12px',
  radiusSm:      '8px',
  shadow:        '0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)',
} as const;

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: T.critical,
  HIGH:     T.caution,
  MEDIUM:   T.blue,
  LOW:      T.blueMuted,
};

type StreamTab = 'signalr' | 'mqtt';

const LiveEventsPage: React.FC = () => {
  const navigate = useNavigate();

  const soeEvents       = useAlarmStore(s => s.recentSoeEvents);
  const connectionState = useAlarmStore(s => s.connectionState);
  const signalrLive     = connectionState === 'Connected';

  const mqttConnect     = useMqttStore(s => s.connect);
  const mqttDisconnect  = useMqttStore(s => s.disconnect);
  const mqttConnected   = useMqttStore(s => s.connected);
  const mqttError       = useMqttStore(s => s.error);
  const liveAlarms      = useMqttStore(s => s.liveAlarms);

  const [activeTab,      setActiveTab]      = useState<StreamTab>('signalr');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sourceFilter,   setSourceFilter]   = useState('');
  const [paused,         setPaused]         = useState(false);
  const [frozenSoe,      setFrozenSoe]      = useState<SoeEvent[]>([]);
  const [frozenMqtt,     setFrozenMqtt]     = useState<LiveAlarm[]>([]);

  useEffect(() => {
    mqttConnect();
    return () => { mqttDisconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!paused) setFrozenSoe(soeEvents);
  }, [soeEvents, paused]);

  useEffect(() => {
    if (!paused) setFrozenMqtt([...liveAlarms.values()]);
  }, [liveAlarms, paused]);

  const filteredSoe = useMemo(() => {
    const q = sourceFilter.trim().toLowerCase();
    return frozenSoe.filter(e => {
      if (priorityFilter && e.priority !== priorityFilter) return false;
      if (q && !e.sourceName.toLowerCase().includes(q) && !e.message.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [frozenSoe, priorityFilter, sourceFilter]);

  const filteredMqtt = useMemo(() => {
    const q = sourceFilter.trim().toLowerCase();
    return frozenMqtt.filter(a => {
      if (priorityFilter && a.priority !== priorityFilter) return false;
      if (q && !a.sourceName.toLowerCase().includes(q) && !a.message.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [frozenMqtt, priorityFilter, sourceFilter]);

  const criticalSoe  = filteredSoe.filter(e => e.priority === 'CRITICAL').length;
  const outOfOrder   = filteredSoe.filter(e => e.isOutOfOrder).length;
  const activeMqtt   = filteredMqtt.filter(a => a.conditionActive).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px 0', height: '100%' }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 600, margin: 0, color: T.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            Live Events
          </h1>
          <p style={{ color: T.textSecondary, fontSize: '13.5px', margin: '5px 0 0' }}>
            Real-time alarm and SOE streams — SignalR hub and Sparkplug B MQTT
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <StatusBadge live={signalrLive} label={signalrLive ? 'SignalR Live' : `SignalR ${connectionState}`} />
          <StatusBadge live={mqttConnected} label={mqttConnected ? 'MQTT Live' : 'MQTT Offline'} />
          <button
            type="button"
            onClick={() => setPaused(p => !p)}
            style={{
              padding: '7px 16px', fontSize: '12.5px', fontWeight: 600,
              borderRadius: T.radiusSm, cursor: 'pointer', fontFamily: 'inherit',
              border: `1.5px solid ${paused ? T.warningBorder : T.border}`,
              background: paused ? T.warningBg : T.card,
              color: paused ? T.warning : T.textSecondary,
            }}
          >
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
        </div>
      </div>

      {/* ── KPI row ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        <Kpi label="SignalR Events" value={String(filteredSoe.length)} sub={paused ? 'frozen' : 'streaming'} accent={T.blue} />
        <Kpi label="Critical (SOE)" value={String(criticalSoe)} sub="in filtered view" accent={criticalSoe > 0 ? T.critical : T.textMuted} />
        <Kpi label="Out-of-Order"   value={String(outOfOrder)} sub="late arrivals corrected" accent={outOfOrder > 0 ? T.caution : T.textMuted} />
        <Kpi label="MQTT Alarms"    value={String(activeMqtt)} sub={`${filteredMqtt.length} total`} accent={activeMqtt > 0 ? T.caution : T.success} />
      </div>

      {/* ── Tab bar + filters ──────────────────────────────── */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius,
        padding: '16px 20px', boxShadow: T.shadow,
      }}>
        <div style={{ display: 'flex', gap: '4px', borderBottom: `2px solid ${T.border}`, marginBottom: '16px', paddingBottom: '0' }}>
          {([
            { id: 'signalr' as const, label: '📡 SignalR SOE', count: filteredSoe.length },
            { id: 'mqtt'    as const, label: '⬡ MQTT Sparkplug', count: filteredMqtt.length },
          ]).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: '8px 20px', fontSize: '13px', fontWeight: 600,
              border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
              color: activeTab === tab.id ? T.blue : T.textSecondary,
              borderBottom: activeTab === tab.id ? `2px solid ${T.blue}` : '2px solid transparent',
              marginBottom: '-2px',
            }}>
              {tab.label}
              <span style={{
                marginLeft: '8px', padding: '1px 8px', borderRadius: '10px', fontSize: '11px',
                background: activeTab === tab.id ? T.blueLight : T.bg,
                color: activeTab === tab.id ? T.blue : T.textMuted,
              }}>{tab.count}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
          <FilterField label="Priority">
            <select className="ob-input" value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)} style={{ width: '140px' }}>
              <option value="">All Priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </FilterField>
          <FilterField label="Source / Message">
            <input type="text" className="ob-input" placeholder="Filter…"
              value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
              style={{ width: '220px' }} />
          </FilterField>
          {activeTab === 'signalr' && (
            <button type="button" onClick={() => navigate('/soe')}
              style={{
                marginLeft: 'auto', padding: '8px 16px', fontSize: '12.5px', fontWeight: 600,
                border: `1.5px solid ${T.blueMuted}`, borderRadius: T.radiusSm,
                background: T.blueLight, color: T.blue, cursor: 'pointer', fontFamily: 'inherit',
              }}>
              Open SOE Timeline →
            </button>
          )}
        </div>
      </div>

      {mqttError && activeTab === 'mqtt' && (
        <div style={{ padding: '12px 16px', background: T.criticalBg, border: '1px solid #FCA5A5', borderRadius: T.radiusSm, color: T.critical, fontSize: '13px' }}>
          MQTT error: {mqttError}
        </div>
      )}

      {/* ── Event list ─────────────────────────────────────── */}
      <div style={{
        flex: 1, minHeight: '320px',
        background: T.card, border: `1px solid ${T.border}`,
        borderRadius: T.radius, overflow: 'hidden', boxShadow: T.shadow,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '12px 20px', borderBottom: `1.5px solid ${T.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: T.bg,
        }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {activeTab === 'signalr' ? 'SignalR Event Stream' : 'MQTT DDATA Alarms'}
          </span>
          <span style={{ fontSize: '11px', color: T.textMuted }}>
            {paused ? 'Paused — list frozen' : 'Auto-updating'}
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {activeTab === 'signalr' ? (
            filteredSoe.length === 0 ? (
              <EmptyState icon="📡" title="Waiting for SignalR SOE events"
                sub={signalrLive ? 'OPC AE events will appear here in real time' : 'SignalR hub is not connected'} />
            ) : (
              filteredSoe.map((event, i) => <SoeEventRow key={`${event.id}-${i}`} event={event} />)
            )
          ) : (
            filteredMqtt.length === 0 ? (
              <EmptyState icon="⬡" title="No MQTT alarm messages"
                sub={mqttConnected ? 'Waiting for Sparkplug B DDATA from edge node' : 'Connect MQTT broker to receive live alarms'} />
            ) : (
              filteredMqtt.map(alarm => <MqttAlarmRow key={alarm.alarmId} alarm={alarm} />)
            )
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Sub-components ─────────────────────────────────────────── */

const StatusBadge: React.FC<{ live: boolean; label: string }> = ({ live, label }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '5px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    background: live ? T.successBg : T.criticalBg,
    border: `1px solid ${live ? T.successBorder : '#FCA5A5'}`,
    color: live ? T.success : T.critical,
  }}>
    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'currentColor', boxShadow: live ? `0 0 6px ${T.success}` : 'none' }} />
    {label}
  </span>
);

const Kpi: React.FC<{ label: string; value: string; sub: string; accent: string }> = ({ label, value, sub, accent }) => (
  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: '14px 16px', boxShadow: T.shadow }}>
    <div style={{ fontSize: '10.5px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>{label}</div>
    <div style={{ fontSize: '28px', fontWeight: 700, color: accent, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    <div style={{ fontSize: '11.5px', color: T.textSecondary, marginTop: '4px' }}>{sub}</div>
  </div>
);

const FilterField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    <span style={{ fontSize: '11px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    {children}
  </label>
);

const EmptyState: React.FC<{ icon: string; title: string; sub: string }> = ({ icon, title, sub }) => (
  <div style={{ padding: '48px', textAlign: 'center' }}>
    <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.35 }}>{icon}</div>
    <div style={{ fontSize: '15px', fontWeight: 600, color: T.textSecondary }}>{title}</div>
    <div style={{ fontSize: '13px', color: T.textMuted, marginTop: '6px' }}>{sub}</div>
  </div>
);

const SoeEventRow: React.FC<{ event: SoeEvent }> = ({ event }) => {
  const color = PRIORITY_COLOR[event.priority] ?? T.blue;
  return (
    <div style={{
      padding: '10px 14px', marginBottom: '6px', borderRadius: T.radiusSm,
      background: T.card, border: `1px solid ${T.borderLight}`,
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
        <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: T.bg, color, textTransform: 'uppercase' }}>
          {event.priority}
        </span>
        <span style={{ fontSize: '10.5px', color: T.textMuted, fontFamily: 'monospace' }}>
          {formatTimestampMs(event.sourceTimestampEpochMs)}
        </span>
      </div>
      <div style={{ fontSize: '12px', fontWeight: 700, color: T.textPrimary, fontFamily: 'monospace', marginBottom: '3px' }}>
        {event.sourceName}
      </div>
      <div style={{ fontSize: '12px', color: T.textSecondary }}>{event.message}</div>
      {event.isOutOfOrder && (
        <span style={{ display: 'inline-block', marginTop: '6px', fontSize: '10.5px', fontWeight: 600, color: T.caution, background: T.warningBg, padding: '2px 8px', borderRadius: '20px' }}>
          ⚠ Late arrival corrected
        </span>
      )}
    </div>
  );
};

const MqttAlarmRow: React.FC<{ alarm: LiveAlarm }> = ({ alarm }) => {
  const color = PRIORITY_COLOR[alarm.priority] ?? T.blue;
  return (
    <div style={{
      padding: '10px 14px', marginBottom: '6px', borderRadius: T.radiusSm,
      background: T.card, border: `1px solid ${T.borderLight}`,
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
        <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: T.bg, color }}>
          {alarm.priority || '—'}
        </span>
        <span style={{ fontSize: '10.5px', color: T.textMuted, fontFamily: 'monospace' }}>
          {new Date(alarm.ts).toLocaleString('en-GB')}
        </span>
      </div>
      <div style={{ fontSize: '12px', fontWeight: 700, color: T.textPrimary, fontFamily: 'monospace', marginBottom: '3px' }}>
        {alarm.sourceName || alarm.alarmId}
      </div>
      <div style={{ fontSize: '12px', color: T.textSecondary }}>{alarm.message || alarm.conditionName || '—'}</div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
        <span style={{ fontSize: '10.5px', fontWeight: 700, color: alarm.state === 'CLEARED' ? T.success : T.critical }}>{alarm.state || 'ACTIVE'}</span>
        {alarm.severity > 0 && <span style={{ fontSize: '10.5px', color: T.textMuted }}>Sev {alarm.severity}</span>}
      </div>
    </div>
  );
};

export default LiveEventsPage;
