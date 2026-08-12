'use client';

import React from 'react';
import type { LiveAlarm } from '../../store/mqttStore';
import { T } from '../../styles/theme';


const PRIORITY_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  CRITICAL: { color: T.critical, bg: T.criticalBg, border: 'var(--alert-alarm-color)' },
  HIGH:     { color: T.caution,  bg: T.warningBg, border: 'var(--alert-warning-color)' },
  MEDIUM:   { color: T.blue,     bg: T.blueLight, border: T.blueMuted },
  LOW:      { color: T.textMuted, bg: T.bg,       border: T.border },
};

function relativeTime(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 8) return 'now';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatAbsolute(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function stateStyle(alarm: LiveAlarm): { color: string; bg: string } {
  if (alarm.state === 'CLEARED') return { color: T.success, bg: T.successBg };
  if (alarm.state === 'ACKNOWLEDGED' || alarm.acknowledged) return { color: T.caution, bg: T.warningBg };
  if (alarm.priority === 'CRITICAL') return { color: T.critical, bg: T.criticalBg };
  if (alarm.priority === 'HIGH') return { color: T.caution, bg: T.warningBg };
  return { color: T.blue, bg: T.blueLight };
}

function severityColor(severity: number): string {
  if (severity >= 800) return T.critical;
  if (severity >= 600) return T.caution;
  if (severity >= 400) return T.blue;
  return T.textMuted;
}

export interface MqttAlarmListItemProps {
  alarm: LiveAlarm;
  flash?: boolean;
  compact?: boolean;
  onClick?: (alarm: LiveAlarm) => void;
  selected?: boolean;
}

/** Single MQTT DDATA alarm row — shared by Live Events page and side panel. */
export const MqttAlarmListItem: React.FC<MqttAlarmListItemProps> = ({
  alarm,
  flash = false,
  compact = false,
  onClick,
  selected = false,
}) => {
  const pStyle = PRIORITY_STYLE[alarm.priority] ?? PRIORITY_STYLE.MEDIUM;
  const sStyle = stateStyle(alarm);
  const source = alarm.sourceName || alarm.alarmId;
  const message = alarm.message || alarm.conditionName || '—';
  const stateLabel = alarm.state || (alarm.conditionActive ? 'ACTIVE' : 'INACTIVE');
  const clickable = Boolean(onClick);

  return (
    <article
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onClick!(alarm) : undefined}
      onKeyDown={clickable ? e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick!(alarm);
        }
      } : undefined}
      title={clickable ? undefined : `${source}\n${message}\n${formatAbsolute(alarm.ts)}`}
      style={{
        display: 'grid',
        gridTemplateColumns: compact
          ? '3px 68px minmax(100px, 1.1fr) minmax(80px, 1.4fr) 72px 44px 52px'
          : '3px 72px minmax(120px, 1.2fr) minmax(100px, 1.6fr) 80px 48px 56px',
        alignItems: 'center',
        gap: compact ? '8px' : '10px',
        padding: compact ? '7px 10px 7px 0' : '9px 12px 9px 0',
        marginBottom: '1px',
        background: selected ? T.blueLight : flash ? T.blueLight : T.card,
        borderBottom: `1px solid ${T.borderLight}`,
        borderLeft: `3px solid ${pStyle.color}`,
        transition: 'background 350ms ease',
        cursor: clickable ? 'pointer' : 'default',
        outline: 'none',
      }}
      onMouseEnter={e => {
        if (!flash && !selected) e.currentTarget.style.background = T.bg;
      }}
      onMouseLeave={e => {
        if (!flash && !selected) e.currentTarget.style.background = T.card;
      }}
      onFocus={e => { if (clickable) e.currentTarget.style.background = T.bg; }}
      onBlur={e => {
        if (!flash && !selected) e.currentTarget.style.background = T.card;
      }}
    >
      {/* priority stripe spacer — borderLeft handles color */}
      <span aria-hidden style={{ width: 0 }} />

      <span style={{
        fontSize: '9.5px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
        background: pStyle.bg, color: pStyle.color, border: `1px solid ${pStyle.border}`,
        textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {(alarm.priority || '—').slice(0, 8)}
      </span>

      <span style={{
        fontSize: compact ? '11.5px' : '12px', fontWeight: 600, color: T.textPrimary,
        fontFamily: "'Noto Sans Mono', ui-monospace, monospace",
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {source}
      </span>

      <span style={{
        fontSize: compact ? '11px' : '11.5px', color: T.textSecondary,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {message}
      </span>

      <span style={{
        fontSize: '9.5px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
        background: sStyle.bg, color: sStyle.color, textAlign: 'center',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {stateLabel}
      </span>

      <span style={{
        fontSize: '11px', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        color: severityColor(alarm.severity), textAlign: 'right',
      }}>
        {alarm.severity > 0 ? alarm.severity : '—'}
      </span>

      <time
        dateTime={new Date(alarm.ts).toISOString()}
        title={formatAbsolute(alarm.ts)}
        style={{
          fontSize: '10.5px', color: T.textMuted, fontFamily: 'monospace',
          textAlign: 'right', whiteSpace: 'nowrap',
        }}
      >
        {relativeTime(alarm.ts)}
      </time>
    </article>
  );
};

export const MQTT_ALARM_LIST_COLUMNS = ['Priority', 'Source', 'Message', 'State', 'Sev', 'Updated'] as const;

export const MqttAlarmListHeader: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: compact
      ? '3px 68px minmax(100px, 1.1fr) minmax(80px, 1.4fr) 72px 44px 52px'
      : '3px 72px minmax(120px, 1.2fr) minmax(100px, 1.6fr) 80px 48px 56px',
    alignItems: 'center',
    gap: compact ? '8px' : '10px',
    padding: compact ? '6px 10px 6px 0' : '8px 12px 8px 0',
    background: T.bg,
    borderBottom: `2px solid ${T.border}`,
    position: 'sticky',
    top: 0,
    zIndex: 1,
  }}>
    <span />
    {MQTT_ALARM_LIST_COLUMNS.map((h, i) => (
      <span key={h} style={{
        fontSize: '9px', fontWeight: 700, color: T.textMuted,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        textAlign: i >= 4 ? 'right' : 'left',
      }}>
        {h}
      </span>
    ))}
  </div>
);
