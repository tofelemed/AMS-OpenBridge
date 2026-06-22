import React, { useState } from 'react';
import { toast } from 'react-toastify';

// ============================================================
// Global System Settings
// Configures infrastructure-level properties such as retention,
// backup paths, UI themes, and external integration points.
// ============================================================

export const SystemSettingsConfig: React.FC = () => {
  const [formData, setFormData] = useState({
    retentionActive: 30, // days
    retentionHistory: 365, // days
    backupPath: '/mnt/backups/ams',
    enableAuditExport: true,
    uiTheme: 'industrial-dark',
    logLevel: 'Information',
  });
  
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate network delay
    await new Promise(r => setTimeout(r, 800));
    toast.success("System settings updated successfully. Some changes may require a restart.");
    setIsSaving(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--space-4)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Global System Settings</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Configure infrastructure retention, UI defaults, and logging.</p>
        </div>
        <button 
          className="btn btn--primary" 
          onClick={handleSave} 
          disabled={isSaving}
          style={{ width: '120px' }}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 'var(--space-4)' }}>
        
        {/* Data Retention */}
        <div style={{ background: 'var(--color-bg-primary)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: 'var(--space-3)', color: 'var(--accent-blue-light)' }}>Data Retention</h4>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>Configure how long alarms and audits are kept before archiving.</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
              <span style={{ fontWeight: 500 }}>Active Alarm TTL (Days)</span>
              <input 
                type="number" 
                className="input-field" 
                value={formData.retentionActive}
                onChange={e => setFormData({ ...formData, retentionActive: parseInt(e.target.value) || 0 })}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
              <span style={{ fontWeight: 500 }}>Historical Log Retention (Days)</span>
              <input 
                type="number" 
                className="input-field" 
                value={formData.retentionHistory}
                onChange={e => setFormData({ ...formData, retentionHistory: parseInt(e.target.value) || 0 })}
              />
            </label>
          </div>
        </div>

        {/* Infrastructure */}
        <div style={{ background: 'var(--color-bg-primary)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: 'var(--space-3)', color: 'var(--accent-blue-light)' }}>Infrastructure & Export</h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
              <span style={{ fontWeight: 500 }}>Backup Path Volume</span>
              <input 
                type="text" 
                className="input-field" 
                value={formData.backupPath}
                onChange={e => setFormData({ ...formData, backupPath: e.target.value })}
              />
            </label>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', marginTop: 'var(--space-2)' }}>
              <input
                type="checkbox"
                checked={formData.enableAuditExport}
                onChange={e => setFormData({ ...formData, enableAuditExport: e.target.checked })}
                style={{ width: '16px', height: '16px', accentColor: 'var(--accent-blue)' }}
              />
              Enable nightly Audit Trail CSV export
            </label>
          </div>
        </div>

        {/* UI & Logging */}
        <div style={{ background: 'var(--color-bg-primary)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: 'var(--space-3)', color: 'var(--accent-blue-light)' }}>UI & Diagnostics</h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
              <span style={{ fontWeight: 500 }}>Global Default Theme</span>
              <select 
                className="input-field" 
                value={formData.uiTheme}
                onChange={e => setFormData({ ...formData, uiTheme: e.target.value })}
              >
                <option value="industrial-dark">Industrial Dark (High Contrast)</option>
                <option value="light">Control Room Light</option>
              </select>
            </label>
            
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
              <span style={{ fontWeight: 500 }}>Backend Log Level</span>
              <select 
                className="input-field" 
                value={formData.logLevel}
                onChange={e => setFormData({ ...formData, logLevel: e.target.value })}
              >
                <option value="Verbose">Verbose</option>
                <option value="Debug">Debug</option>
                <option value="Information">Information</option>
                <option value="Warning">Warning</option>
                <option value="Error">Error</option>
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
