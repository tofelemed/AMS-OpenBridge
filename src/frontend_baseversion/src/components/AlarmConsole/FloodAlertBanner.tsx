import React from 'react';
import { FloodAlert } from '../../store/alarmStore';
import { formatTimestampMs } from '../../utils/time';

interface FloodAlertBannerProps {
  alert: FloodAlert;
}

export const FloodAlertBanner: React.FC<FloodAlertBannerProps> = ({ alert }) => {
  return (
    <div style={{
      background: 'rgba(255, 23, 68, 0.15)',
      border: '1px solid var(--alarm-critical, #ff1744)',
      borderRadius: 'var(--radius-lg, 8px)',
      padding: 'var(--space-3, 12px) var(--space-4, 16px)',
      marginBottom: 'var(--space-3, 12px)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-3, 12px)',
      boxShadow: '0 0 10px rgba(255, 23, 68, 0.2)'
    }}>
      <span style={{ fontSize: '20px' }}>🚨</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, color: 'var(--alarm-critical, #ff1744)', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          Alarm Flood Detected
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary, #b2bec3)' }}>
          Active alarm rate on Server {alert.serverId} has reached <strong>{alert.alarmsPerTenMin.toFixed(1)} alarms/10-min</strong>, exceeding the ISA-18.2 flood threshold (10.0).
        </div>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted, #8a8a8a)', fontFamily: 'var(--font-mono)' }}>
        Detected: {formatTimestampMs(alert.detectedAtEpochMs)}
      </div>
    </div>
  );
};
