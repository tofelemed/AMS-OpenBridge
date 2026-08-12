'use client';

import React, { useState } from 'react';

const T = {
  blue: '#31598F', blueLight: '#EAF2FF', blueMuted: '#C4D8F0',
  bg: '#F6F8FB', card: '#FFFFFF', border: '#DDE3EA', borderLight: '#EEF2F7',
  textPrimary: '#1F2937', textSecondary: '#6B7280', textMuted: '#9CA3AF',
  success: '#2E8B57', successBg: '#ECFDF5',
  warning: '#B45309', warningBg: '#FFFBEB', warningBorder: '#FDE68A',
  radius: '12px', radiusSm: '8px',
} as const;

export const SystemSettingsConfig: React.FC = () => {
  const [formData, setFormData] = useState({
    retentionActive: 30, retentionHistory: 365,
    backupPath: '/mnt/backups/ams',
    enableAuditExport: true, uiTheme: 'industrial-dark', logLevel: 'Information',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* H6: this page is NOT wired to any backend — it used to fake a green
          '✓ Saved' after an 800ms timeout while persisting nothing. Retention is
          actually managed by the TimescaleDB policy layer (Plan 05); until a real
          settings endpoint exists the page is explicitly read-only. */}
      <div role="alert" style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        background: T.warningBg, border: `1px solid ${T.warningBorder}`,
        borderRadius: T.radiusSm, padding: '12px 16px',
        color: T.warning, fontSize: '13px', fontWeight: 600,
      }}>
        Not functional yet — these settings are not connected to the backend and cannot be saved.
        Values shown are illustrative defaults, not the running configuration.
      </div>


      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: T.textPrimary, margin: 0 }}>Global System Settings</h3>
          <p style={{ fontSize: '13px', color: T.textSecondary, margin: '4px 0 0' }}>
            Configure infrastructure retention, UI defaults, and backend logging.
          </p>
        </div>
        <button
          disabled
          title="Not connected to a backend yet — changes cannot be saved"
          style={{
            background: T.textMuted, color: '#fff', border: 'none',
            borderRadius: T.radiusSm, padding: '8px 20px',
            fontSize: '13px', fontWeight: 600,
            cursor: 'not-allowed', fontFamily: 'inherit',
          }}
        >
          Save unavailable
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>

        <SettingCard title="Data Retention" icon="📦" description="Configure how long alarms and audit records are kept before archiving.">
          <SettingField label="Active Alarm TTL (Days)">
            <input type="number" className="ob-input"
              value={formData.retentionActive}
              onChange={e => setFormData({ ...formData, retentionActive: parseInt(e.target.value) || 0 })} />
          </SettingField>
          <SettingField label="Historical Log Retention (Days)">
            <input type="number" className="ob-input"
              value={formData.retentionHistory}
              onChange={e => setFormData({ ...formData, retentionHistory: parseInt(e.target.value) || 0 })} />
          </SettingField>
        </SettingCard>

        <SettingCard title="Infrastructure & Export" icon="💾" description="Backup path and automated export configuration.">
          <SettingField label="Backup Path Volume">
            <input type="text" className="ob-input"
              value={formData.backupPath}
              onChange={e => setFormData({ ...formData, backupPath: e.target.value })} />
          </SettingField>
          <label style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            cursor: 'pointer', fontSize: '13px', color: T.textPrimary,
            padding: '10px 12px', marginTop: '4px',
            background: formData.enableAuditExport ? T.blueLight : T.card,
            border: `1px solid ${formData.enableAuditExport ? T.blueMuted : T.border}`,
            borderRadius: '6px', transition: 'all 140ms ease',
          }}>
            <input
              type="checkbox"
              checked={formData.enableAuditExport}
              onChange={e => setFormData({ ...formData, enableAuditExport: e.target.checked })}
              style={{ width: '16px', height: '16px', accentColor: T.blue, flexShrink: 0 }}
            />
            Enable nightly Audit Trail CSV export
          </label>
        </SettingCard>

        <SettingCard title="UI & Diagnostics" icon="🖥" description="Global theme and backend diagnostic log level.">
          <SettingField label="Global Default Theme">
            <select className="ob-input" value={formData.uiTheme}
              onChange={e => setFormData({ ...formData, uiTheme: e.target.value })}>
              <option value="industrial-dark">Industrial Dark (High Contrast)</option>
              <option value="light">Control Room Light</option>
            </select>
          </SettingField>
          <SettingField label="Backend Log Level">
            <select className="ob-input" value={formData.logLevel}
              onChange={e => setFormData({ ...formData, logLevel: e.target.value })}>
              <option value="Verbose">Verbose</option>
              <option value="Debug">Debug</option>
              <option value="Information">Information</option>
              <option value="Warning">Warning</option>
              <option value="Error">Error</option>
            </select>
          </SettingField>
        </SettingCard>
      </div>
    </div>
  );
};

const SettingCard: React.FC<{ title: string; icon: string; description: string; children: React.ReactNode }> = ({ title, icon, description, children }) => (
  <div style={{
    background: T.bg, border: `1px solid ${T.border}`,
    borderTop: `3px solid ${T.blue}`,
    borderRadius: T.radiusSm, padding: '18px 20px',
    display: 'flex', flexDirection: 'column', gap: '16px',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span style={{
        width: '34px', height: '34px', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        background: T.card, border: `1px solid ${T.border}`,
        borderRadius: '8px', fontSize: '16px',
      }}>
        {icon}
      </span>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: T.textPrimary }}>{title}</div>
        <div style={{ fontSize: '12px', color: T.textSecondary, marginTop: '2px' }}>{description}</div>
      </div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {children}
    </div>
  </div>
);

const SettingField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    <span style={{ fontSize: '12px', fontWeight: 600, color: T.textSecondary }}>{label}</span>
    {children}
  </label>
);
