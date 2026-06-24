'use client';

import React from 'react';
import type { FloodAlert } from '../../store/alarmStore';

interface FloodAlertBannerProps {
  alert: FloodAlert;
}

export const FloodAlertBanner: React.FC<FloodAlertBannerProps> = ({ alert }) => {
  if (!alert.isFlood) return null;

  return (
    <div className="flood-banner">
      <span style={{ fontSize: '18px' }}>⚠</span>
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
