'use client';

import React, { useState } from 'react';
import { T } from '../../styles/theme';

export const AlarmRulesConfig: React.FC = () => {
  const [formData, setFormData] = useState({
    floodThreshold: 10, floodWindowMinutes: 10,
    maxShelveDurationHours: 24, chatteringThreshold: 3,
    chatteringWindowMinutes: 5, autoUnshelve: true, requireAckComment: true,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* H6: this page is NOT wired to any backend — it used to fake a green
          '✓ Saved' after an 800ms timeout while persisting nothing, which in an
          alarm-management product is a safety-adjacent lie. Until a real
          settings endpoint exists the page is explicitly read-only. */}
      <div role="alert" style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        background: T.warningBg ?? 'var(--container-section-color)', border: `1px solid ${T.warningBorder ?? 'var(--alert-warning-color)'}`,
        borderRadius: T.radiusSm, padding: '12px 16px',
        color: T.warning ?? 'var(--alert-warning-color)', fontSize: '13px', fontWeight: 600,
      }}>
        Not functional yet — these settings are not connected to the backend and cannot be saved.
        Values shown are illustrative defaults, not the running configuration.
      </div>


      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: T.textPrimary, margin: 0 }}>
            Alarm Rationalization Rules
          </h3>
          <p style={{ fontSize: '13px', color: T.textSecondary, margin: '4px 0 0' }}>
            Configure ISA-18.2 compliant threshold rules and global alarm management behavior.
          </p>
        </div>
        <button
          disabled
          title="Not connected to a backend yet — changes cannot be saved"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: T.textMuted, color: '#fff',
            border: 'none', borderRadius: T.radiusSm,
            padding: '8px 20px', fontSize: '13px', fontWeight: 600,
            cursor: 'not-allowed', fontFamily: 'inherit',
          }}
        >
          Save unavailable
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '16px' }}>

        <RuleCard
          title="Alarm Flood Detection"
          icon="🌊"
          description="Define parameters that trigger an Alarm Flood state (EEMUA-191 / ISA-18.2)."
          color={T.warning}
        >
          <FormRow label="Flood Threshold (alarms)">
            <input type="number" className="ob-input"
              value={formData.floodThreshold}
              onChange={e => setFormData({ ...formData, floodThreshold: parseInt(e.target.value) || 0 })}
            />
          </FormRow>
          <FormRow label="Evaluation Window (minutes)">
            <input type="number" className="ob-input"
              value={formData.floodWindowMinutes}
              onChange={e => setFormData({ ...formData, floodWindowMinutes: parseInt(e.target.value) || 0 })}
            />
          </FormRow>
        </RuleCard>

        <RuleCard
          title="Chattering Detection"
          icon="🔁"
          description="Automatically flag alarms that transition states too frequently."
          color={T.blue}
        >
          <FormRow label="Transition Threshold">
            <input type="number" className="ob-input"
              value={formData.chatteringThreshold}
              onChange={e => setFormData({ ...formData, chatteringThreshold: parseInt(e.target.value) || 0 })}
            />
          </FormRow>
          <FormRow label="Evaluation Window (minutes)">
            <input type="number" className="ob-input"
              value={formData.chatteringWindowMinutes}
              onChange={e => setFormData({ ...formData, chatteringWindowMinutes: parseInt(e.target.value) || 0 })}
            />
          </FormRow>
        </RuleCard>

        <RuleCard
          title="Operator Management Rules"
          icon="👷"
          description="Global constraints for operator shelving and acknowledgment workflows."
          color={T.success}
        >
          <FormRow label="Max Shelving Duration (hours)">
            <input type="number" className="ob-input"
              value={formData.maxShelveDurationHours}
              onChange={e => setFormData({ ...formData, maxShelveDurationHours: parseInt(e.target.value) || 0 })}
            />
          </FormRow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
            <CheckRow
              label="Require audit comment for acknowledgment"
              checked={formData.requireAckComment}
              onChange={v => setFormData({ ...formData, requireAckComment: v })}
            />
            <CheckRow
              label="Auto-unshelve when condition clears"
              checked={formData.autoUnshelve}
              onChange={v => setFormData({ ...formData, autoUnshelve: v })}
            />
          </div>
        </RuleCard>
      </div>
    </div>
  );
};

const RuleCard: React.FC<{
  title: string; icon: string; description: string; color: string; children: React.ReactNode;
}> = ({ title, icon, description, color, children }) => (
  <div style={{
    background: T.bg, border: `1px solid ${T.border}`,
    borderTop: `3px solid ${color}`,
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

const FormRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px' }}>
    <span style={{ fontSize: '12px', fontWeight: 600, color: T.textSecondary }}>{label}</span>
    {children}
  </label>
);

const CheckRow: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <label style={{
    display: 'flex', alignItems: 'center', gap: '10px',
    cursor: 'pointer', fontSize: '13px', color: T.textPrimary,
    padding: '9px 12px',
    background: checked ? T.blueLight : T.card,
    border: `1px solid ${checked ? T.blueMuted : T.border}`,
    borderRadius: '6px', transition: 'all 140ms ease',
  }}>
    <input
      type="checkbox"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      style={{ width: '16px', height: '16px', accentColor: T.blue, flexShrink: 0 }}
    />
    {label}
  </label>
);
