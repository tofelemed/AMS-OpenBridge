import React, { useState, useEffect, useRef } from 'react';
import { Modal, FormField } from '../shared/Modal';
import { ActiveAlarm } from '../../store/alarmStore';
import { PriorityBadge } from '../shared/PriorityBadge';

// ============================================================
// Shelve Dialog — OPC AE / ISA-18.2 Alarm Shelving
// Enables operators to temporarily suppress alarms with
// mandatory justification, configurable duration, and 
// automatic expiry tracking.
// ============================================================

interface ShelveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  alarms: ActiveAlarm[];
  onConfirm: (durationMinutes: number, reason: string, operatorStation: string) => Promise<void>;
}

const DURATION_PRESETS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hr',   value: 60 },
  { label: '2 hr',   value: 120 },
  { label: '4 hr',   value: 240 },
  { label: '8 hr',   value: 480 },
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
    } catch (err: any) {
      setError(err.message ?? 'Failed to shelve alarm(s).');
    } finally {
      setIsSubmitting(false);
    }
  };

  const expiryTime = new Date(Date.now() + (effectiveDuration || 0) * 60000);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isBatch ? `Shelve ${alarms.length} Alarm(s)` : 'Shelve Alarm'}
      subtitle={
        isBatch
          ? 'Selected alarms will be temporarily suppressed for the specified duration.'
          : alarms[0]
            ? `${alarms[0].sourceName} — ${alarms[0].conditionName ?? 'N/A'}`
            : ''
      }
      icon="📥"
      variant="warning"
      width="560px"
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            className="btn"
            onClick={handleSubmit}
            disabled={isSubmitting || alarms.length === 0}
            style={{
              minWidth: '140px',
              background: 'var(--color-warning)',
              color: 'var(--text-inverse)',
              fontWeight: 600,
            }}
          >
            {isSubmitting ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="spinner" style={{ width: 14, height: 14 }} />
                Shelving...
              </span>
            ) : (
              `Shelve${isBatch ? ` (${alarms.length})` : ''}`
            )}
          </button>
        </>
      }
    >
      {/* Batch alarm list */}
      {isBatch && (
        <div style={{
          background: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-5)',
          maxHeight: '140px',
          overflowY: 'auto',
        }}>
          {alarms.map(a => (
            <div key={a.id} style={{
              padding: 'var(--space-2) var(--space-3)',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              fontSize: '12px',
            }}>
              <PriorityBadge priority={a.priority} />
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.sourceName}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Duration Picker */}
      <FormField
        label="Shelve Duration"
        required
        hint={!isNaN(effectiveDuration) && effectiveDuration > 0
          ? `Alarm will auto-unshelve at ${expiryTime.toLocaleTimeString()} (${expiryTime.toLocaleDateString()})`
          : 'Select or enter a custom shelving duration'
        }
      >
        <div style={{
          display: 'flex',
          gap: 'var(--space-2)',
          flexWrap: 'wrap',
          marginBottom: useCustom ? 'var(--space-3)' : 0,
        }}>
          {DURATION_PRESETS.map(p => (
            <button
              key={p.value}
              onClick={() => { setDuration(p.value); setUseCustom(false); }}
              className="btn"
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 600,
                background: !useCustom && duration === p.value
                  ? 'var(--color-warning)'
                  : 'var(--color-bg-primary)',
                color: !useCustom && duration === p.value
                  ? 'var(--text-inverse)'
                  : 'var(--text-secondary)',
                border: `1px solid ${!useCustom && duration === p.value ? 'var(--color-warning)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-md)',
                transition: 'all var(--transition-fast)',
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setUseCustom(true)}
            className="btn"
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 500,
              background: useCustom ? 'var(--color-warning)' : 'var(--color-bg-primary)',
              color: useCustom ? 'var(--text-inverse)' : 'var(--text-secondary)',
              border: `1px solid ${useCustom ? 'var(--color-warning)' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-md)',
            }}
          >
            Custom
          </button>
        </div>
        {useCustom && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <input
              type="number"
              className="input-field"
              value={customDuration}
              onChange={e => setCustomDuration(e.target.value)}
              placeholder="Enter minutes"
              min={1}
              max={480}
              style={{ width: '120px' }}
            />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>minutes (max 480)</span>
          </div>
        )}
      </FormField>

      {/* Reason Presets */}
      <FormField
        label="Shelving Reason"
        required
        error={error ?? undefined}
      >
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-3)',
        }}>
          {REASON_PRESETS.map((preset, i) => (
            <button
              key={i}
              onClick={() => setReason(preset)}
              className="btn btn--ghost"
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                borderRadius: '12px',
                background: reason === preset ? 'rgba(255,171,0,0.15)' : undefined,
                color: reason === preset ? 'var(--color-warning)' : undefined,
                borderColor: reason === preset ? 'rgba(255,171,0,0.3)' : undefined,
              }}
            >
              {preset}
            </button>
          ))}
        </div>
        <textarea
          ref={reasonRef}
          value={reason}
          onChange={e => { setReason(e.target.value); setError(null); }}
          placeholder="Describe the reason for shelving this alarm..."
          rows={3}
          className="input-field"
          style={{ width: '100%', resize: 'vertical', minHeight: '64px' }}
        />
      </FormField>

      {/* Operator station */}
      <FormField label="Operator Station">
        <select
          value={station}
          onChange={e => setStation(e.target.value)}
          className="input-field"
          style={{ width: '100%' }}
        >
          <option value="CCR-01">CCR-01 — Central Control Room</option>
          <option value="CCR-02">CCR-02 — Central Control Room</option>
          <option value="FCR-01">FCR-01 — Field Control Room</option>
          <option value="ENG-01">ENG-01 — Engineering Station</option>
          <option value="REMOTE">REMOTE — Remote Access</option>
        </select>
      </FormField>

      {/* ISA-18.2 notice */}
      <div style={{
        padding: 'var(--space-3)',
        background: 'rgba(255,171,0,0.06)',
        border: '1px solid rgba(255,171,0,0.15)',
        borderRadius: 'var(--radius-md)',
        fontSize: '11px',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-2)',
      }}>
        <span style={{ fontSize: '14px' }}>⚠️</span>
        <div>
          <strong style={{ color: 'var(--color-warning)' }}>ISA-18.2 Notice:</strong> Shelved alarms remain monitored 
          but will not trigger operator notifications. Shelving is automatically logged in the immutable audit trail. 
          The alarm will automatically unshelve when the timer expires.
        </div>
      </div>
    </Modal>
  );
};
