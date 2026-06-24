import React from 'react';
import { AlarmStats } from '../../store/alarmStore';

interface KpiSummaryBarProps {
  stats: AlarmStats;
  connectionState?: string;
}

export const KpiSummaryBar: React.FC<KpiSummaryBarProps> = ({ stats, connectionState = 'Connected' }) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-4, 16px)',
      background: 'var(--color-bg-card, #1e272e)',
      border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
      borderRadius: 'var(--radius-lg, 8px)',
      padding: 'var(--space-2, 8px) var(--space-4, 16px)',
      marginBottom: 'var(--space-3, 12px)',
      flexWrap: 'nowrap',
      overflowX: 'auto',
      whiteSpace: 'nowrap'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted, #8a8a8a)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Active</span>
        <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary, #ffffff)' }}>{stats.totalActive}</span>
      </div>
      
      <div style={{ width: '1px', height: '20px', background: 'var(--color-border, rgba(255,255,255,0.08))', flexShrink: 0 }} />

      <div style={{ display: 'flex', gap: 'var(--space-3, 12px)', flex: 1, flexWrap: 'nowrap' }}>
        <KpiItem label="Critical" count={stats.totalCritical} color="var(--alarm-critical, #ff1744)" />
        <KpiItem label="High" count={stats.totalHigh} color="var(--alarm-high, #ff9100)" />
        <KpiItem label="Medium" count={stats.totalMedium} color="var(--alarm-medium, #ffeb3b)" />
        <KpiItem label="Low" count={stats.totalLow} color="var(--alarm-low, #2196f3)" />
        <KpiItem label="Unacked" count={stats.unacknowledged} color="#e040fb" />
        <KpiItem label="Shelved" count={stats.shelved} color="#90a4ae" />
        <KpiItem label="Suppressed" count={stats.suppressed} color="#b0bec5" />
      </div>

      <div style={{ width: '1px', height: '20px', background: 'var(--color-border, rgba(255,255,255,0.08))', flexShrink: 0 }} />

      <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted, #8a8a8a)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alarms/10 Min</span>
        <span style={{ 
          fontSize: '18px', 
          fontWeight: 700, 
          color: stats.alarmsPerTenMin > 10 ? 'var(--alarm-critical, #ff1744)' : 'var(--color-success, #00e676)'
        }}>{stats.alarmsPerTenMin.toFixed(1)}</span>
      </div>

      <div style={{ width: '1px', height: '20px', background: 'var(--color-border, rgba(255,255,255,0.08))', margin: '0 4px', flexShrink: 0 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          backgroundColor: connectionState === 'Connected' ? 'var(--color-success, #00e676)' : 'var(--alarm-critical, #ff1744)',
          boxShadow: connectionState === 'Connected' ? '0 0 6px var(--color-success, #00e676)' : '0 0 6px var(--alarm-critical, #ff1744)',
          animation: connectionState === 'Connected' ? 'pulse 2s infinite' : 'blink 1s infinite'
        }} />
        <span style={{ fontSize: '10px', fontWeight: 600, color: connectionState === 'Connected' ? 'var(--color-success, #00e676)' : 'var(--alarm-critical, #ff1744)', textTransform: 'uppercase' }}>
          {connectionState}
        </span>
      </div>
    </div>
  );
};

const KpiItem: React.FC<{ label: string; count: number; color: string }> = ({ label, count, color }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '60px' }}>
    <div style={{ width: '3px', height: '14px', background: color, borderRadius: '2px' }} />
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: '9px', color: 'var(--text-muted, #8a8a8a)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary, #ffffff)' }}>{count}</span>
    </div>
  </div>
);
