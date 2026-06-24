'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Modal, FormField } from '../shared/Modal';
import type { ActiveAlarm } from '../../store/alarmStore';
import { PriorityBadge } from '../shared/PriorityBadge';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import './shelve-dialog.css';

interface ShelveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  alarms: ActiveAlarm[];
  onConfirm: (durationMinutes: number, reason: string, operatorStation: string) => Promise<void>;
}

const DURATION_PRESETS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hr', value: 60 },
  { label: '2 hr', value: 120 },
  { label: '4 hr', value: 240 },
  { label: '8 hr', value: 480 },
];

const REASON_PRESETS = [
  'Planned maintenance in progress',
  'Equipment under repair — work order active',
  'Known nuisance alarm — rationalization pending',
  'Process startup/shutdown sequence',
  'Instrument calibration in progress',
  'Approved by shift supervisor',
];

export const ShelveDialog: React.FC<ShelveDialogProps> = ({
  isOpen,
  onClose,
  alarms,
  onConfirm,
}) => {
  const [duration, setDuration] = useState(60);
  const [customDuration, setCustomDuration] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [reason, setReason] = useState('');
  const [station, setStation] = useState('CCR-01');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const isBatch = alarms.length > 1;
  const primaryAlarm = alarms[0];

  useEffect(() => {
    if (isOpen) {
      setDuration(60);
      setCustomDuration('');
      setUseCustom(false);
      setReason('');
      setError(null);
      setIsSubmitting(false);
      setTimeout(() => reasonRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const effectiveDuration = useCustom ? parseInt(customDuration, 10) : duration;
  const hasValidDuration = !isNaN(effectiveDuration) && effectiveDuration > 0;
  const expiryTime = new Date(Date.now() + (effectiveDuration || 0) * 60000);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError('Shelving reason is required per ISA-18.2.');
      return;
    }
    if (isNaN(effectiveDuration) || effectiveDuration < 1 || effectiveDuration > 480) {
      setError('Duration must be between 1 and 480 minutes.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm(effectiveDuration, reason.trim(), station);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to shelve alarm(s).';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isBatch ? `Shelve ${alarms.length} Alarm(s)` : 'Shelve Alarm'}
      subtitle={
        isBatch
          ? 'Selected alarms will be temporarily suppressed for the specified duration.'
          : primaryAlarm
            ? `${primaryAlarm.sourceName} — ${primaryAlarm.conditionName ?? 'N/A'}`
            : ''
      }
      icon="📥"
      variant="warning"
      width="580px"
      contentClassName="shelve-dialog"
      overlayClassName="shelve-dialog-overlay"
      footer={
        <>
          <ObcButton variant="flat" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </ObcButton>
          <ObcButton
            variant="raised"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || alarms.length === 0}
          >
            {isSubmitting ? 'Shelving...' : `Shelve${isBatch ? ` (${alarms.length})` : ''}`}
          </ObcButton>
        </>
      }
    >
      {!isBatch && primaryAlarm && (
        <div className="shelve-dialog__alarm-card">
          <div className="shelve-dialog__alarm-header">
            <PriorityBadge priority={primaryAlarm.priority} />
            <span className="shelve-dialog__alarm-source" title={primaryAlarm.sourceName}>
              {primaryAlarm.sourceName}
            </span>
          </div>
          <div className="shelve-dialog__alarm-meta">
            <MetaItem label="Condition" value={primaryAlarm.conditionName ?? 'N/A'} mono />
            <MetaItem label="Sub-Condition" value={primaryAlarm.subConditionName ?? 'N/A'} mono />
            <MetaItem label="Server" value={primaryAlarm.serverName} />
            <MetaItem label="Category" value={primaryAlarm.category} />
          </div>
          {primaryAlarm.message && (
            <div className="shelve-dialog__alarm-message">
              {primaryAlarm.message}
            </div>
          )}
        </div>
      )}

      {isBatch && (
        <div className="shelve-dialog__batch">
          {alarms.map(a => (
            <div key={a.id} className="shelve-dialog__batch-row">
              <PriorityBadge priority={a.priority} />
              <span className="dialog-batch-table__source" title={a.sourceName}>
                {a.sourceName}
              </span>
            </div>
          ))}
        </div>
      )}

      {hasValidDuration && (
        <div className="shelve-dialog__expiry-banner">
          <span className="shelve-dialog__expiry-icon" aria-hidden="true">⏱</span>
          <span>
            Alarm{isBatch ? 's' : ''} will <strong>auto-unshelve</strong> at{' '}
            <strong>{expiryTime.toLocaleTimeString()}</strong> on{' '}
            {expiryTime.toLocaleDateString()} ({effectiveDuration} min)
          </span>
        </div>
      )}

      <div className="shelve-dialog__section">
        <FormField
          label="Shelve Duration"
          required
          hint={!hasValidDuration ? 'Select or enter a custom shelving duration' : undefined}
        >
          <div className="shelve-dialog__input-shell">
            <div className="duration-picker">
              {DURATION_PRESETS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => { setDuration(p.value); setUseCustom(false); }}
                  className={`duration-btn ${!useCustom && duration === p.value ? 'duration-btn--active' : ''}`}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setUseCustom(true)}
                className={`duration-btn ${useCustom ? 'duration-btn--active' : ''}`}
              >
                Custom
              </button>
            </div>
            {useCustom && (
              <div className="duration-custom shelve-dialog__duration-custom">
                <input
                  type="number"
                  className="ob-input shelve-dialog__inline-input"
                  value={customDuration}
                  onChange={e => setCustomDuration(e.target.value)}
                  placeholder="Enter minutes"
                  min={1}
                  max={480}
                />
                <span className="duration-custom__hint">minutes (max 480)</span>
              </div>
            )}
          </div>
        </FormField>
      </div>

      <div className="shelve-dialog__section">
        <FormField label="Shelving Reason" required error={error ?? undefined}>
          <div className="shelve-dialog__input-shell shelve-dialog__input-shell--chips">
            <div className="reason-picker">
              {REASON_PRESETS.map((preset, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setReason(preset)}
                  className={`reason-btn ${reason === preset ? 'reason-btn--active' : ''}`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
          <textarea
            ref={reasonRef}
            value={reason}
            onChange={e => { setReason(e.target.value); setError(null); }}
            placeholder="Describe the reason for shelving this alarm..."
            rows={3}
            className="ob-input shelve-dialog__textarea"
          />
        </FormField>

        <FormField label="Operator Station">
          <select
            value={station}
            onChange={e => setStation(e.target.value)}
            className="ob-input"
          >
            <option value="CCR-01">CCR-01 — Central Control Room</option>
            <option value="CCR-02">CCR-02 — Central Control Room</option>
            <option value="FCR-01">FCR-01 — Field Control Room</option>
            <option value="ENG-01">ENG-01 — Engineering Station</option>
            <option value="REMOTE">REMOTE — Remote Access</option>
          </select>
        </FormField>
      </div>

      <div className="isa-notice isa-notice--warning">
        <span aria-hidden="true">⚠</span>
        <div>
          <strong>ISA-18.2 Notice:</strong> Shelved alarms remain monitored
          but will not trigger operator notifications. Shelving is automatically logged in the immutable audit trail.
          The alarm will automatically unshelve when the timer expires.
        </div>
      </div>
    </Modal>
  );
};

const MetaItem: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label, value, mono,
}) => (
  <div className="shelve-dialog__meta-item">
    <span className="shelve-dialog__meta-label">{label}</span>
    <span
      className={`shelve-dialog__meta-value${mono ? ' shelve-dialog__meta-value--mono' : ''}`}
      title={value}
    >
      {value}
    </span>
  </div>
);
