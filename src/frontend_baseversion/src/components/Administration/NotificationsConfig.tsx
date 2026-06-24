import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { Modal, FormField } from '../shared/Modal';

// ============================================================
// Notification Policies Configuration
// Configure SMS/Email routing and active integrations.
// ============================================================

interface NotificationRule {
  id: string;
  name: string;
  trigger: 'Critical Alarms' | 'Flood State' | 'System Errors';
  action: 'Email' | 'SMS' | 'Webhook';
  target: string;
  enabled: boolean;
}

export const NotificationsConfig: React.FC = () => {
  const [rules, setRules] = useState<NotificationRule[]>([
    { id: 'notif-1', name: 'Plant Manager Alert', trigger: 'Flood State', action: 'SMS', target: '+15550199', enabled: true },
    { id: 'notif-2', name: 'Night Shift Supervisors', trigger: 'Critical Alarms', action: 'Email', target: 'nightshift@plant.local', enabled: true },
    { id: 'notif-3', name: 'IT Infrastructure Team', trigger: 'System Errors', action: 'Webhook', target: 'https://pagerduty.local/api/v1/trigger', enabled: false },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<NotificationRule | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState<Partial<NotificationRule>>({
    name: '', trigger: 'Critical Alarms', action: 'Email', target: '', enabled: true
  });

  const handleOpenModal = (rule?: NotificationRule) => {
    if (rule) {
      setEditingRule(rule);
      setFormData({ ...rule });
    } else {
      setEditingRule(null);
      setFormData({ name: '', trigger: 'Critical Alarms', action: 'Email', target: '', enabled: true });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.target) {
      toast.error("Name and Target are required.");
      return;
    }
    setIsSaving(true);
    await new Promise(r => setTimeout(r, 600)); 
    
    if (editingRule) {
      setRules(rules.map(r => r.id === editingRule.id ? { ...r, ...formData } as NotificationRule : r));
      toast.success("Notification rule updated.");
    } else {
      setRules([...rules, { ...formData, id: `notif-${Date.now()}` } as NotificationRule]);
      toast.success("New notification rule created.");
    }
    
    setIsSaving(false);
    setIsModalOpen(false);
  };

  const toggleStatus = (id: string) => {
    setRules(rules.map(r => {
      if (r.id === id) {
        toast.info(`Notification rule ${r.enabled ? 'disabled' : 'enabled'}.`);
        return { ...r, enabled: !r.enabled };
      }
      return r;
    }));
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this notification rule?")) {
      setRules(rules.filter(r => r.id !== id));
      toast.info("Notification rule deleted.");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Notification Policies</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Configure email, SMS, and webhook routing for critical events.</p>
        </div>
        <button className="btn btn--primary" onClick={() => handleOpenModal()} style={{ fontSize: '13px' }}>
          + Add Policy
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 'var(--space-4)' }}>
        {rules.map(r => (
          <div key={r.id} style={{
            background: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
            opacity: r.enabled ? 1 : 0.6,
            position: 'relative'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: r.enabled ? 'var(--color-success)' : 'var(--text-muted)',
                }} />
                <span style={{ fontSize: '14px', fontWeight: 600 }}>{r.name}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn--ghost btn--icon" onClick={() => handleOpenModal(r)} title="Edit">✏️</button>
                <button className="btn btn--ghost btn--icon" onClick={() => handleDelete(r.id)} style={{ color: 'var(--alarm-critical)' }} title="Delete">🗑️</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Trigger Condition:</span>
                <span style={{ fontWeight: 600, color: r.trigger === 'Flood State' ? 'var(--color-warning)' : 'var(--text-primary)' }}>{r.trigger}</span>
              </div>
              <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Action:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{r.action}</span>
              </div>
              <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Target:</span>
                <span style={{ color: 'var(--accent-blue-light)', wordBreak: 'break-all' }}>{r.target}</span>
              </div>
            </div>

            <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)', textAlign: 'right' }}>
              <button 
                className="btn btn--ghost" 
                onClick={() => toggleStatus(r.id)} 
                style={{ fontSize: '12px', padding: '4px 8px' }}
              >
                {r.enabled ? 'Disable Policy' : 'Enable Policy'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => !isSaving && setIsModalOpen(false)}
        title={editingRule ? 'Edit Notification Policy' : 'Add Notification Policy'}
        icon="🔔"
        width="500px"
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setIsModalOpen(false)} disabled={isSaving}>Cancel</button>
            <button className="btn btn--primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Policy'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <FormField label="Policy Name" required>
            <input type="text" className="input-field" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Critical Alert Escalation" />
          </FormField>
          
          <FormField label="Trigger Condition" required>
            <select className="input-field" value={formData.trigger} onChange={e => setFormData({ ...formData, trigger: e.target.value as any })}>
              <option value="Critical Alarms">Critical Priority Alarms</option>
              <option value="Flood State">Alarm Flood State Activated</option>
              <option value="System Errors">System Communication Errors</option>
            </select>
          </FormField>

          <FormField label="Action / Channel" required>
            <select className="input-field" value={formData.action} onChange={e => setFormData({ ...formData, action: e.target.value as any })}>
              <option value="Email">Email</option>
              <option value="SMS">SMS Message</option>
              <option value="Webhook">Webhook (REST API)</option>
            </select>
          </FormField>

          <FormField label="Target Destination" required hint={formData.action === 'Email' ? 'Comma separated emails' : formData.action === 'SMS' ? 'Phone number with country code' : 'HTTPS URL endpoint'}>
            <input type="text" className="input-field" value={formData.target} onChange={e => setFormData({ ...formData, target: e.target.value })} />
          </FormField>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', marginTop: 'var(--space-2)' }}>
            <input
              type="checkbox"
              checked={formData.enabled}
              onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
              style={{ width: '16px', height: '16px', accentColor: 'var(--accent-blue)' }}
            />
            Policy is currently active
          </label>
        </div>
      </Modal>
    </div>
  );
};
