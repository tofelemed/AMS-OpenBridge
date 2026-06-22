import React, { useState } from 'react';
import { toast } from 'react-toastify';

// ============================================================
// Alarm Rationalization Rules
// Defines global alarm behavior, flood detection thresholds,
// and shelving duration limits based on ISA-18.2 standards.
// ============================================================

export const AlarmRulesConfig: React.FC = () => {
  const [formData, setFormData] = useState({
    floodThreshold: 10,
    floodWindowMinutes: 10,
    maxShelveDurationHours: 24,
    chatteringThreshold: 3,
    chatteringWindowMinutes: 5,
    autoUnshelve: true,
    requireAckComment: true
  });
  
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate network delay
    await new Promise(r => setTimeout(r, 800));
    toast.success("Alarm rationalization rules updated successfully.");
    setIsSaving(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--space-4)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Alarm Rationalization Rules</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Configure ISA-18.2 compliant threshold rules and global alarm management behavior.</p>
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
        {/* Flood Detection */}
        <div style={{ background: 'var(--color-bg-primary)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: 'var(--space-3)', color: 'var(--accent-blue-light)' }}>Alarm Flood Detection</h4>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>Define the parameters that trigger an Alarm Flood state (EEMUA-191 / ISA-18.2).</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
              <span style={{ fontWeight: 500 }}>Flood Threshold (alarms)</span>
              <input 
                type="number" 
                className="input-field" 
                value={formData.floodThreshold}
                onChange={e => setFormData({ ...formData, floodThreshold: parseInt(e.target.value) || 0 })}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
              <span style={{ fontWeight: 500 }}>Evaluation Window (minutes)</span>
              <input 
                type="number" 
                className="input-field" 
                value={formData.floodWindowMinutes}
                onChange={e => setFormData({ ...formData, floodWindowMinutes: parseInt(e.target.value) || 0 })}
              />
            </label>
          </div>
        </div>

        {/* Chattering Alarms */}
        <div style={{ background: 'var(--color-bg-primary)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: 'var(--space-3)', color: 'var(--accent-blue-light)' }}>Chattering Detection</h4>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>Automatically suppress alarms that transition states too frequently.</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
              <span style={{ fontWeight: 500 }}>Transition Threshold</span>
              <input 
                type="number" 
                className="input-field" 
                value={formData.chatteringThreshold}
                onChange={e => setFormData({ ...formData, chatteringThreshold: parseInt(e.target.value) || 0 })}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
              <span style={{ fontWeight: 500 }}>Evaluation Window (minutes)</span>
              <input 
                type="number" 
                className="input-field" 
                value={formData.chatteringWindowMinutes}
                onChange={e => setFormData({ ...formData, chatteringWindowMinutes: parseInt(e.target.value) || 0 })}
              />
            </label>
          </div>
        </div>

        {/* Operator Controls */}
        <div style={{ background: 'var(--color-bg-primary)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: 'var(--space-3)', color: 'var(--accent-blue-light)' }}>Operator Management Rules</h4>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>Global constraints for operator shelving and acknowledgment.</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
              <span style={{ fontWeight: 500 }}>Max Shelving Duration (hours)</span>
              <input 
                type="number" 
                className="input-field" 
                value={formData.maxShelveDurationHours}
                onChange={e => setFormData({ ...formData, maxShelveDurationHours: parseInt(e.target.value) || 0 })}
              />
            </label>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', marginTop: 'var(--space-2)' }}>
              <input
                type="checkbox"
                checked={formData.requireAckComment}
                onChange={e => setFormData({ ...formData, requireAckComment: e.target.checked })}
                style={{ width: '16px', height: '16px', accentColor: 'var(--accent-blue)' }}
              />
              Require Audit Comment for Acknowledgment
            </label>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={formData.autoUnshelve}
                onChange={e => setFormData({ ...formData, autoUnshelve: e.target.checked })}
                style={{ width: '16px', height: '16px', accentColor: 'var(--accent-blue)' }}
              />
              Automatically unshelve if condition clears
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
