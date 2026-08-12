'use client';

import React, { useState } from 'react';
import { Modal, FormField } from '../shared/Modal';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { T } from '../../styles/theme';


interface NotificationRule {
  id: string; name: string;
  trigger: 'Critical Alarms' | 'Flood State' | 'System Errors';
  action: 'Email' | 'SMS' | 'Webhook';
  target: string; enabled: boolean;
}

const TRIGGER_STYLES: Record<NotificationRule['trigger'], { color: string; bg: string; border: string }> = {
  'Critical Alarms': { color: T.critical, bg: T.criticalBg, border: T.criticalBorder },
  'Flood State':     { color: T.caution,  bg: T.warningBg,  border: T.warningBorder },
  'System Errors':   { color: T.blue,     bg: T.blueLight,  border: T.blueMuted },
};

const ACTION_ICONS: Record<NotificationRule['action'], string> = {
  'Email': '✉', 'SMS': '📱', 'Webhook': '🔗',
};

export const NotificationsConfig: React.FC = () => {
  // H6: was seeded with three FAKE sample policies presented as configured
  // escalation routes. Starts empty until wired to notification-service.
  const [rules, setRules] = useState<NotificationRule[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule,  setEditingRule]  = useState<NotificationRule | null>(null);
  const [isSaving,     setIsSaving]     = useState(false);
  const [formData,     setFormData]     = useState<Partial<NotificationRule>>({
    name: '', trigger: 'Critical Alarms', action: 'Email', target: '', enabled: true,
  });

  const handleOpenModal = (rule?: NotificationRule) => {
    setEditingRule(rule ?? null);
    setFormData(rule ? { ...rule } : { name: '', trigger: 'Critical Alarms', action: 'Email', target: '', enabled: true });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.target) return;
    setIsSaving(true);
    await new Promise(r => setTimeout(r, 600));
    if (editingRule) {
      setRules(rules.map(r => r.id === editingRule.id ? { ...r, ...formData } as NotificationRule : r));
    } else {
      setRules([...rules, { ...formData, id: `notif-${Date.now()}` } as NotificationRule]);
    }
    setIsSaving(false);
    setIsModalOpen(false);
  };

  const toggleStatus = (id: string) =>
    setRules(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this notification policy?'))
      setRules(rules.filter(r => r.id !== id));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* H6: this page is NOT wired to notification-service — it used to show
          three fabricated policies and fake-save edits into local state. Until
          real CRUD exists it is explicitly read-only and starts empty. */}
      <div role="alert" style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        background: 'var(--container-section-color)', border: '1px solid var(--alert-warning-color)',
        borderRadius: T.radiusSm, padding: '12px 16px',
        color: 'var(--alert-warning-color)', fontSize: '13px', fontWeight: 600,
      }}>
        Not functional yet — notification routing is not connected to the backend.
        No escalation policies are active, and policies cannot be created from this page.
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: T.textPrimary, margin: 0 }}>Notification Policies</h3>
          <p style={{ fontSize: '13px', color: T.textSecondary, margin: '4px 0 0' }}>
            Configure email, SMS, and webhook routing for critical events.
          </p>
        </div>
        <button
          disabled
          title="Not connected to notification-service yet — policies cannot be saved"
          style={{
            background: T.textMuted, color: '#fff', border: 'none',
            borderRadius: T.radiusSm, padding: '8px 18px',
            fontSize: '13px', fontWeight: 600, cursor: 'not-allowed', fontFamily: 'inherit',
          }}
        >
          + Add Policy
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
        {rules.map(r => {
          const ts = TRIGGER_STYLES[r.trigger];
          return (
            <div
              key={r.id}
              style={{
                background: T.card, border: `1px solid ${T.border}`,
                borderRadius: T.radiusSm, overflow: 'hidden',
                opacity: r.enabled ? 1 : 0.55,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                transition: 'box-shadow 160ms ease',
              }}
            >
              {/* Card top accent */}
              <div style={{ height: '3px', background: r.enabled ? ts.color : T.border }} />

              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                    <span style={{
                      width: '28px', height: '28px', display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center',
                      background: r.enabled ? ts.bg : T.bg,
                      border: `1px solid ${r.enabled ? ts.border : T.border}`,
                      borderRadius: '7px', fontSize: '14px',
                    }}>
                      {ACTION_ICONS[r.action]}
                    </span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: T.textPrimary }}>{r.name}</div>
                      <span style={{
                        display: 'inline-block', marginTop: '3px',
                        fontSize: '10.5px', fontWeight: 700, padding: '2px 8px',
                        borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.04em',
                        background: ts.bg, color: ts.color, border: `1px solid ${ts.border}`,
                      }}>
                        {r.trigger}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <SmallBtn onClick={() => handleOpenModal(r)}>Edit</SmallBtn>
                    <SmallBtn onClick={() => handleDelete(r.id)} danger>Del</SmallBtn>
                  </div>
                </div>

                {/* Detail rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '12.5px' }}>
                  <DetailRow label="Channel">{r.action}</DetailRow>
                  <DetailRow label="Target">
                    <span style={{ color: T.blue, wordBreak: 'break-all', fontFamily: "'Noto Sans Mono', monospace", fontSize: '12px' }}>
                      {r.target}
                    </span>
                  </DetailRow>
                </div>

                {/* Footer */}
                <div style={{ paddingTop: '12px', borderTop: `1px solid ${T.borderLight}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    fontSize: '11.5px', fontWeight: 600,
                    color: r.enabled ? T.success : T.textMuted,
                  }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: r.enabled ? T.success : T.textMuted, display: 'inline-block' }} />
                    {r.enabled ? 'Active' : 'Inactive'}
                  </span>
                  <SmallBtn onClick={() => toggleStatus(r.id)}>
                    {r.enabled ? 'Disable' : 'Enable'}
                  </SmallBtn>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => !isSaving && setIsModalOpen(false)}
        title={editingRule ? 'Edit Notification Policy' : 'Add Notification Policy'}
        icon="🔔"
        width="500px"
        footer={
          <>
            <ObcButton variant="flat" onClick={() => setIsModalOpen(false)} disabled={isSaving}>Cancel</ObcButton>
            <ObcButton variant="raised" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Policy'}
            </ObcButton>
          </>
        }
      >
        <FormField label="Policy Name" required>
          <input type="text" className="ob-input" style={{ width: '100%' }}
            value={formData.name} placeholder="e.g., Critical Alert Escalation"
            onChange={e => setFormData({ ...formData, name: e.target.value })} />
        </FormField>
        <FormField label="Trigger Condition" required>
          <select className="ob-input" style={{ width: '100%' }} value={formData.trigger}
            onChange={e => setFormData({ ...formData, trigger: e.target.value as NotificationRule['trigger'] })}>
            <option value="Critical Alarms">Critical Priority Alarms</option>
            <option value="Flood State">Alarm Flood State Activated</option>
            <option value="System Errors">System Communication Errors</option>
          </select>
        </FormField>
        <FormField label="Action / Channel" required>
          <select className="ob-input" style={{ width: '100%' }} value={formData.action}
            onChange={e => setFormData({ ...formData, action: e.target.value as NotificationRule['action'] })}>
            <option value="Email">Email</option>
            <option value="SMS">SMS Message</option>
            <option value="Webhook">Webhook (REST API)</option>
          </select>
        </FormField>
        <FormField label="Target Destination" required
          hint={formData.action === 'Email' ? 'Comma-separated email addresses'
            : formData.action === 'SMS' ? 'Phone number with country code'
            : 'HTTPS webhook endpoint URL'}>
          <input type="text" className="ob-input" style={{ width: '100%' }}
            value={formData.target}
            onChange={e => setFormData({ ...formData, target: e.target.value })} />
        </FormField>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: T.textPrimary }}>
          <input type="checkbox" checked={formData.enabled} style={{ width: '16px', height: '16px', accentColor: T.blue }}
            onChange={e => setFormData({ ...formData, enabled: e.target.checked })} />
          Policy is currently active
        </label>
      </Modal>
    </div>
  );
};

const SmallBtn: React.FC<{ onClick: () => void; danger?: boolean; children: React.ReactNode }> = ({ onClick, danger, children }) => (
  <button
    onClick={onClick}
    style={{
      padding: '4px 12px', fontSize: '11.5px', fontWeight: 600,
      borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit',
      border: `1px solid ${danger ? T.criticalBorder : T.border}`,
      background: danger ? T.criticalBg : T.bg,
      color: danger ? T.critical : T.textSecondary,
      transition: 'all 120ms ease',
    }}
    onMouseEnter={e => { e.currentTarget.style.background = danger ? T.critical : T.blueLight; e.currentTarget.style.color = danger ? '#fff' : T.blue; }}
    onMouseLeave={e => { e.currentTarget.style.background = danger ? T.criticalBg : T.bg; e.currentTarget.style.color = danger ? T.critical : T.textSecondary; }}
  >
    {children}
  </button>
);

const DetailRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
    <span style={{ color: T.textMuted, fontWeight: 600, flexShrink: 0, minWidth: '60px' }}>{label}</span>
    <span style={{ color: T.textPrimary, textAlign: 'right' }}>{children}</span>
  </div>
);
