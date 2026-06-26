'use client';

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAlarmStore } from '../../store/alarmStore';
import { formatTimestampMs } from '../../utils/time';
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

export const LiveEventStream: React.FC = () => {
  const navigate = useNavigate();
  const events = useAlarmStore(s => s.recentSoeEvents);
  const recentEvents = events.slice(0, 50);
  const { toggleLiveEvents } = useLiveEventsPanel();

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
            background: recentEvents.length > 0 ? T.success : T.textMuted,
            boxShadow: recentEvents.length > 0 ? `0 0 6px ${T.success}` : 'none',
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: '11px', fontWeight: 700, color: T.textSecondary,
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            Live Events
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

      {/* Event count strip */}
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
          {recentEvents.length} recent event{recentEvents.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Event list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {recentEvents.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: '10px',
            padding: '40px 16px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '28px' }}>📡</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: T.textSecondary }}>
              Waiting for live events…
            </div>
            <div style={{ fontSize: '12px', color: T.textMuted }}>
              OPC AE events will stream here in real time
            </div>
          </div>
        ) : (
          recentEvents.map((event, index) => {
            const color = PRIORITY_COLOR[event.priority] ?? T.blue;
            const isCritical = event.priority === 'CRITICAL';
            const isHigh     = event.priority === 'HIGH';

            return (
              <div
                key={`${event.id}-${index}`}
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
                    {event.priority}
                  </span>
                  <span style={{
                    fontSize: '10.5px', color: T.textMuted,
                    fontFamily: "'Noto Sans Mono', monospace", flexShrink: 0,
                  }}>
                    {formatTimestampMs(event.sourceTimestampEpochMs)}
                  </span>
                </div>

                <div style={{
                  fontSize: '12px', fontWeight: 700, color: T.textPrimary,
                  fontFamily: "'Noto Sans Mono', monospace",
                  marginBottom: '3px',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {event.sourceName}
                </div>

                <div style={{ fontSize: '12px', color: T.textSecondary, lineHeight: 1.4 }}>
                  {event.message}
                </div>

                {event.isOutOfOrder && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    marginTop: '6px', fontSize: '10.5px', fontWeight: 600,
                    color: T.caution, background: T.warningBg,
                    border: `1px solid ${T.warningBorder}`,
                    padding: '2px 8px', borderRadius: '20px',
                  }}>
                    ⚠ Late arrival corrected
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
