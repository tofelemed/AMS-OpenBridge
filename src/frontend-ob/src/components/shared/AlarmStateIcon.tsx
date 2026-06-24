'use client';

import React from 'react';
import type { ActiveAlarm } from '../../store/alarmStore';

interface AlarmStateIconProps {
  alarm: ActiveAlarm;
}

export const AlarmStateIcon: React.FC<AlarmStateIconProps> = ({ alarm }) => {
  const getStateInfo = () => {
    if (alarm.isOutOfService) {
      return { icon: '🔧', label: 'Out of Service', color: 'var(--on-container-neutral-color)' };
    }
    if (alarm.isSuppressed) {
      return { icon: '🔇', label: 'Suppressed', color: 'var(--on-container-neutral-color)' };
    }
    if (alarm.isShelved) {
      return { icon: '📥', label: 'Shelved', color: 'var(--alert-caution-border-color)' };
    }
    if (!alarm.conditionActive) {
      return { icon: '✓', label: 'Cleared', color: 'var(--running-color)' };
    }
    if (alarm.acknowledged) {
      return { icon: '✓', label: 'Acknowledged', color: 'var(--alert-warning-border-color)' };
    }
    return { icon: '!', label: 'Active', color: 'var(--alert-alarm-border-color)' };
  };

  const { icon, label, color } = getStateInfo();

  return (
    <span
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        border: `1px solid ${color}`,
        color,
        fontSize: '12px',
        fontWeight: 700,
      }}
    >
      {icon}
    </span>
  );
};
