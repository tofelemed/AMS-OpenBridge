'use client';

import React, { useState, useEffect } from 'react';
import { Modal, FormField } from '../shared/Modal';
import type { ActiveAlarm } from '../../store/alarmStore';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

interface SuppressDialogProps {
  isOpen: boolean;
  onClose: () => void;
  alarm: ActiveAlarm | null;
  onConfirm: (reason: string, operatorStation: string) => Promise<void>;
}

const SUPPRESS_REASONS = [
  'Equipment taken out of service — no process relevance',
  'Redundant alarm — primary alarm active on parent',
  'Design suppression — process state does not warrant annunciation',
  'Consequential alarm — root cause alarm already active',
  'Maintenance override — field work in progress',
];

export const SuppressDialog: React.FC<SuppressDialogProps> = ({
  isOpen,
  onClose,
  alarm,
  onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const [station, setStation] = useState('ENG-01');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setStation('ENG-01');
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError('Suppression reason is mandatory for audit compliance.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm(reason.trim(), station);
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Failed to suppress alarm.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!alarm) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Suppress Alarm"
      subtitle={`${alarm.sourceName} — ${alarm.conditionName ?? 'N/A'}`}
      icon="🔇"
      variant="danger"
      width="500px"
      footer={
        <>
          <ObcButton variant="flat" onClick={onClose} disabled={isSubmitting}>Cancel</ObcButton>
          <ObcButton
            variant="raised"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Suppressing...' : 'Suppress Alarm'}
          </ObcButton>
        </>
      }
    >
      {/* Warning */}
      <div className="isa-notice isa-notice--danger" style={{ marginBottom: 'var(--spacing-4, 16px)' }}>
        <span style={{ fontSize: '16px' }}>⚠️</span>
        <div>
          <strong>Caution:</strong> Suppressed alarms will <strong>not</strong> be 
          annunciated to operators. This action is logged in the immutable audit trail and should only be performed by 
          authorized engineering personnel per ISA-18.2 §12.
        </div>
      </div>

      {/* Reason presets */}
      <FormField label="Suppression Reason" required error={error ?? undefined}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2, 8px)', marginBottom: 'var(--spacing-3, 12px)' }}>
          {SUPPRESS_REASONS.map((preset, i) => (
            <button
              key={i}
              onClick={() => setReason(preset)}
              className={`reason-btn reason-btn--block ${reason === preset ? 'reason-btn--danger-active' : ''}`}
            >
              {preset}
            </button>
          ))}
        </div>
        <textarea
          value={reason}
          onChange={e => { setReason(e.target.value); setError(null); }}
          placeholder="Enter engineering justification for suppression..."
          rows={2}
          className="ob-input"
          style={{ width: '100%', resize: 'vertical' }}
        />
      </FormField>

      <FormField label="Operator Station">
        <select value={station} onChange={e => setStation(e.target.value)} className="ob-input" style={{ width: '100%' }}>
          <option value="ENG-01">ENG-01 — Engineering Station</option>
          <option value="CCR-01">CCR-01 — Central Control Room</option>
          <option value="CCR-02">CCR-02 — Central Control Room</option>
          <option value="REMOTE">REMOTE — Remote Access</option>
        </select>
      </FormField>
    </Modal>
  );
};

interface OutOfServiceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  alarm: ActiveAlarm | null;
  onConfirm: (reason: string, operatorStation: string) => Promise<void>;
}

export const OutOfServiceDialog: React.FC<OutOfServiceDialogProps> = ({
  isOpen,
  onClose,
  alarm,
  onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const [station, setStation] = useState('ENG-01');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError('Out-of-service reason is required.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm(reason.trim(), station);
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Failed to set alarm out of service.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!alarm) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Set Alarm Out of Service"
      subtitle={`${alarm.sourceName} — This will completely disable alarm monitoring.`}
      icon="🔧"
      variant="danger"
      width="500px"
      footer={
        <>
          <ObcButton variant="flat" onClick={onClose} disabled={isSubmitting}>Cancel</ObcButton>
          <ObcButton
            variant="raised"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Processing...' : 'Confirm Out of Service'}
          </ObcButton>
        </>
      }
    >
      <div className="isa-notice isa-notice--danger" style={{ marginBottom: 'var(--spacing-4, 16px)' }}>
        <span style={{ fontSize: '16px' }}>🚨</span>
        <div>
          <strong>Critical Action:</strong> Setting an alarm out of service 
          completely disables monitoring and notification. This must be authorized by the shift supervisor and is permanently 
          recorded in the audit trail.
        </div>
      </div>

      <FormField label="Justification" required error={error ?? undefined}>
        <textarea
          value={reason}
          onChange={e => { setReason(e.target.value); setError(null); }}
          placeholder="Enter detailed justification (e.g., Work Permit #, equipment removal, etc.)"
          rows={3}
          className="ob-input"
          style={{ width: '100%', resize: 'vertical' }}
        />
      </FormField>

      <FormField label="Authorized Station">
        <select value={station} onChange={e => setStation(e.target.value)} className="ob-input" style={{ width: '100%' }}>
          <option value="ENG-01">ENG-01 — Engineering Station</option>
          <option value="CCR-01">CCR-01 — Central Control Room</option>
          <option value="REMOTE">REMOTE — Remote Access</option>
        </select>
      </FormField>
    </Modal>
  );
};
