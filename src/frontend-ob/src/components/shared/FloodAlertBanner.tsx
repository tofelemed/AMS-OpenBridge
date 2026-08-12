'use client';

import React from 'react';
import { ObcAlertIcon } from '@oicl/openbridge-webcomponents-react/components/alert-icon/alert-icon';
import type { FloodAlert } from '../../store/alarmStore';

interface FloodAlertBannerProps {
  alert: FloodAlert;
}

export const FloodAlertBanner: React.FC<FloodAlertBannerProps> = ({ alert }) => {
  if (!alert.isFlood) return null;

  return (
    <div className="flood-banner" role="alert">
      {/* OpenBridge alert component (blinking alarm icon) rather than a hand-rolled ⚠
          emoji — the banner frame already uses the alert-alarm tokens. */}
      <ObcAlertIcon alert-type="alarm" />
      <span className="flood-banner__text">
        ALARM FLOOD DETECTED — {alert.alarmsPerTenMin.toFixed(1)} alarms/10min exceeds ISA-18.2 threshold
      </span>
      <span style={{
        fontFamily: "'Noto Sans Mono', monospace",
        fontSize: '12px',
        opacity: 0.85,
        color: 'var(--on-alert-alarm-active-color)',
      }}>
        Server: {alert.serverId}
      </span>
    </div>
  );
};
