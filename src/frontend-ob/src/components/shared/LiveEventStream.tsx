'use client';

import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMqttStore, type LiveAlarm } from '../../store/mqttStore';
import { useLiveEventsPanel } from '../../context/LiveEventsContext';

const T = {
  blue:          '#31598F',
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
  warning:       '#B45309',
  warningBg:     '#FFFBEB',
  warningBorder: '#FDE68A',
  critical:      '#D64545',
  criticalBg:    '#FEF2F2',
  caution:       '#D97706',
  radiusSm:      '8px',
} as const;

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: T.critical,
  HIGH:     T.caution,
  MEDIUM:   T.blue,
  LOW:      T.blueMuted,
};

/** Side panel: Sparkplug B live alarms (same source as /live-events MQTT tab). */
export const LiveEventStream: React.FC = () => {
  const navigate = useNavigate();
  const { toggleLiveEvents } = useLiveEventsPanel();

  const mqttConnect         = useMqttStore(s => s.connect);
  const loadAllSnapshots    = useMqttStore(s => s.loadAllSnapshots);
  const subscribeFirehose   = useMqttStore(s => s.subscribeFirehose);
  const unsubscribeFirehose = useMqttStore(s => s.unsubscribeFirehose);
  const mqttConnected       = useMqttStore(s => s.connected);
  const mqttError           = useMqttStore(s => s.error);
  const liveAlarms          = useMqttStore(s => s.liveAlarms);

  useEffect(() => {
    mqttConnect();
    void loadAllSnapshots();
    // This panel is a plant-wide live monitor → opt into the DDATA firehose.
    subscribeFirehose();
    return () => unsubscribeFirehose();
  }, [mqttConnect, loadAllSnapshots, subscribeFirehose, unsubscribeFirehose]);

  const activeAlarms = useMemo(() => {
    return [...liveAlarms.values()]
      .filter(a => a.conditionActive && a.state !== 'CLEARED')
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 50);
  }, [liveAlarms]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: T.card }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px',
        borderBottom: `1.5px solid ${T.border}`,
        background: T.bg,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: mqttConnected ? T.success : T.textMuted,
            boxShadow: mqttConnected && activeAlarms.length > 0 ? `0 0 6px ${T.success}` : 'none',
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: '11px', fontWeight: 700, color: T.textSecondary,
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            Live Alarms (MQTT)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={() => navigate('/live-events')}
            title="Open full Live Events page"
            style={{
              padding: '5px 10px', fontSize: '11px', fontWeight: 600,
              color: T.blue, background: T.card,
              border: `1px solid ${T.blueMuted}`, borderRadius: T.radiusSm,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Expand ↗
          </button>
          <button
            type="button"
            onClick={toggleLiveEvents}
            aria-label="Hide live events panel"
            title="Hide live events panel"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '5px 12px', fontSize: '11.5px', fontWeight: 600,
              color: T.blue, background: T.blueLight,
              border: `1px solid ${T.blueMuted}`, borderRadius: T.radiusSm,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background 120ms ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = T.card)}
            onMouseLeave={e => (e.currentTarget.style.background = T.blueLight)}
          >
            Hide ◂
          </button>
        </div>
      </div>

      {/* Status strip */}
      <div style={{
        padding: '8px 16px',
        borderBottom: `1px solid ${T.borderLight}`,
        background: T.card,
        flexShrink: 0,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '3px 10px', borderRadius: '20px',
          background: T.bg, border: `1px solid ${T.border}`,
          fontSize: '11px', fontWeight: 600, color: T.textSecondary,
        }}>
          {activeAlarms.length} active alarm{activeAlarms.length !== 1 ? 's' : ''}
          {!mqttConnected && ' · MQTT offline'}
        </span>
      </div>

      {mqttError && (
        <div style={{
          padding: '8px 16px', fontSize: '11px', color: T.critical,
          background: T.criticalBg, borderBottom: `1px solid ${T.borderLight}`,
        }}>
          MQTT: {mqttError}
        </div>
      )}

      {/* Alarm list — card rows (original side panel design) */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {activeAlarms.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: '10px',
            padding: '40px 16px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '28px' }}>⬡</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: T.textSecondary }}>
              {mqttConnected ? 'Waiting for Sparkplug DDATA…' : 'MQTT not connected'}
            </div>
            <div style={{ fontSize: '12px', color: T.textMuted }}>
              Run live_events_feed.py to push test alarms
            </div>
          </div>
        ) : (
          activeAlarms.map(alarm => (
            <MqttAlarmRow key={alarm.alarmId} alarm={alarm} />
          ))
        )}
      </div>
    </div>
  );
};

const MqttAlarmRow: React.FC<{ alarm: LiveAlarm }> = ({ alarm }) => {
  const color = PRIORITY_COLOR[alarm.priority] ?? T.blue;
  const isCritical = alarm.priority === 'CRITICAL';
  const isHigh     = alarm.priority === 'HIGH';

  return (
    <div
      style={{
        padding: '10px 12px',
        marginBottom: '6px',
        borderRadius: T.radiusSm,
        background: T.card,
        border: `1px solid ${T.borderLight}`,
        borderLeft: `3px solid ${color}`,
        transition: 'background 120ms ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = T.blueLight)}
      onMouseLeave={e => (e.currentTarget.style.background = T.card)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
        <span style={{
          fontSize: '10.5px', fontWeight: 700, padding: '2px 7px',
          borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.04em',
          background: isCritical ? T.criticalBg : isHigh ? T.warningBg : T.blueLight,
          color,
          border: `1px solid ${color}33`,
          flexShrink: 0,
        }}>
          {alarm.priority || '—'}
        </span>
        <span style={{
          fontSize: '10.5px', color: T.textMuted,
          fontFamily: "'Noto Sans Mono', monospace", flexShrink: 0,
        }}>
          {new Date(alarm.ts).toLocaleTimeString('en-GB')}
        </span>
      </div>

      <div style={{
        fontSize: '12px', fontWeight: 700, color: T.textPrimary,
        fontFamily: "'Noto Sans Mono', monospace",
        marginBottom: '3px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {alarm.sourceName || alarm.alarmId}
      </div>

      <div style={{ fontSize: '12px', color: T.textSecondary, lineHeight: 1.4 }}>
        {alarm.message || alarm.conditionName || '—'}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
        <span style={{
          fontSize: '10.5px', fontWeight: 700,
          color: alarm.state === 'CLEARED' ? T.success : alarm.priority === 'CRITICAL' ? T.critical : T.blue,
        }}>
          {alarm.state || 'ACTIVE'}
        </span>
        {alarm.severity > 0 && (
          <span style={{ fontSize: '10.5px', color: T.textMuted }}>Sev {alarm.severity}</span>
        )}
      </div>
    </div>
  );
};
