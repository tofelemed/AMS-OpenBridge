'use client';

import React from 'react';
import { ObiWrench } from '@oicl/openbridge-webcomponents-react/icons/icon-wrench';
import { ObiVolumeOff } from '@oicl/openbridge-webcomponents-react/icons/icon-volume-off';
import { ObiTimerGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-timer-google';
import { ObiCheckGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-check-google';
import { ObiWarningGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-warning-google';
import type { ActiveAlarm } from '../../store/alarmStore';

interface AlarmStateIconProps {
  alarm: ActiveAlarm;
}

// ISA-18.2 alarm state → OpenBridge obi-* icon (no emoji). The circle chrome +
// token color are preserved; only the glyph is now a design-system icon.
export const AlarmStateIcon: React.FC<AlarmStateIconProps> = ({ alarm }) => {
  const getStateInfo = (): { Icon: React.FC; label: string; color: string } => {
    if (alarm.isOutOfService) {
      return { Icon: ObiWrench, label: 'Out of Service', color: 'var(--on-container-neutral-color)' };
    }
    if (alarm.isSuppressed) {
      return { Icon: ObiVolumeOff, label: 'Suppressed', color: 'var(--on-container-neutral-color)' };
    }
    if (alarm.isShelved) {
      // Shelving is a timed temporary suppression — the timer icon reads that.
      return { Icon: ObiTimerGoogle, label: 'Shelved', color: 'var(--alert-caution-border-color)' };
    }
    if (!alarm.conditionActive) {
      return { Icon: ObiCheckGoogle, label: 'Cleared', color: 'var(--running-color)' };
    }
    if (alarm.acknowledged) {
      return { Icon: ObiCheckGoogle, label: 'Acknowledged', color: 'var(--alert-warning-border-color)' };
    }
    return { Icon: ObiWarningGoogle, label: 'Active', color: 'var(--alert-alarm-border-color)' };
  };

  const { Icon, label, color } = getStateInfo();

  return (
    <span
      className="alarm-state-icon"
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
      }}
    >
      <Icon />
    </span>
  );
};
