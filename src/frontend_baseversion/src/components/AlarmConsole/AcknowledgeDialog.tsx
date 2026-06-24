import React, { useState, useEffect, useRef } from 'react';
import { Modal, FormField } from '../shared/Modal';
import { ActiveAlarm } from '../../store/alarmStore';
import { PriorityBadge } from '../shared/PriorityBadge';
import { formatTimestampMs } from '../../utils/time';

// ============================================================
// Acknowledge Dialog — OPC AE 1.10 compliant acknowledgment
// Supports single and batch alarm acknowledgment with
// mandatory comment field (configurable), operator station,
// and condition name per the OPC AE specification.
// ============================================================

interface AcknowledgeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  alarms: ActiveAlarm[];
  onConfirm: (comment: string, operatorStation: string) => Promise<void>;
}

export const AcknowledgeDialog: React.FC<AcknowledgeDialogProps> = ({
  isOpen,
  onClose,
  alarms,
  onConfirm,
}) => {
  const [comment, setComment] = useState('');
  const [station, setStation] = useState('CCR-01');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const unackedAlarms = alarms.filter(a => !a.acknowledged);
  const isBatch = unackedAlarms.length > 1;

  useEffect(() => {
    if (isOpen) {
      setComment('');
      setError(null);
      setIsSubmitting(false);
      // Focus on comment input after animation
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    const finalComment = comment.trim() || 'Acknowledged by operator via console';
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm(finalComment, station);
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Failed to acknowledge alarm(s). Check connectivity.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isBatch ? `Acknowledge ${unackedAlarms.length} Alarm(s)` : 'Acknowledge Alarm'}
      subtitle={
        isBatch
          ? 'You are acknowledging multiple alarms. A single comment and timestamp will be applied to all.'
          : unackedAlarms[0]
            ? `Source: ${unackedAlarms[0].sourceName}`
            : ''
      }
      icon="✓"
      variant="default"
      width="560px"
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={handleSubmit}
            disabled={isSubmitting || unackedAlarms.length === 0}
            style={{ minWidth: '160px' }}
          >
            {isSubmitting ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="spinner" style={{ width: 14, height: 14 }} />
                Acknowledging...
              </span>
            ) : (
              `Acknowledge${isBatch ? ` (${unackedAlarms.length})` : ''}`
            )}
          </button>
        </>
      }
    >
      {/* Alarm Summary */}
      {!isBatch && unackedAlarms[0] && (
        <div style={{
          background: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-4)',
          marginBottom: 'var(--space-5)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <DetailItem label="Priority" value={<PriorityBadge priority={unackedAlarms[0].priority} />} />
            <DetailItem label="Severity" value={
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                {unackedAlarms[0].severity}
              </span>
            } />
            <DetailItem label="Condition" value={unackedAlarms[0].conditionName ?? 'N/A'} />
            <DetailItem label="Sub-Condition" value={unackedAlarms[0].subConditionName ?? 'N/A'} />
            <DetailItem label="Event Time" value={
              <span className="timestamp timestamp--ms">{formatTimestampMs(unackedAlarms[0].eventTimeEpochMs)}</span>
            } />
            <DetailItem label="Active Since" value={
              <span className="timestamp timestamp--ms">{formatTimestampMs(unackedAlarms[0].activeTimeEpochMs)}</span>
            } />
            <DetailItem label="Server" value={unackedAlarms[0].serverName} />
            <DetailItem label="Category" value={unackedAlarms[0].category} />
          </div>
          {unackedAlarms[0].message && (
            <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Message</div>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontStyle: 'italic' }}>
                "{unackedAlarms[0].message}"
              </div>
            </div>
          )}
          {unackedAlarms[0].processValue != null && (
            <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Process Value</div>
              <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {unackedAlarms[0].processValue.toFixed(2)}
                {unackedAlarms[0].processUnit && (
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                    {unackedAlarms[0].processUnit}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Batch alarm list */}
      {isBatch && (
        <div style={{
          background: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-5)',
          maxHeight: '200px',
          overflowY: 'auto',
        }}>
          <div style={{
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--color-bg-elevated)',
            borderBottom: '1px solid var(--color-border)',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            display: 'grid',
            gridTemplateColumns: '80px 1fr 140px',
            gap: 'var(--space-2)',
          }}>
            <span>Priority</span>
            <span>Source</span>
            <span>Event Time</span>
          </div>
          {unackedAlarms.map(a => (
            <div
              key={a.id}
              style={{
                padding: 'var(--space-2) var(--space-3)',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                display: 'grid',
                gridTemplateColumns: '80px 1fr 140px',
                gap: 'var(--space-2)',
                fontSize: '12px',
                alignItems: 'center',
              }}
            >
              <PriorityBadge priority={a.priority} />
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.sourceName}
              </span>
              <span className="timestamp timestamp--ms" style={{ fontSize: '11px' }}>
                {formatTimestampMs(a.eventTimeEpochMs)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Comment field */}
      <FormField
        label="Acknowledgment Comment"
        hint="Describe the action taken or reason for acknowledgment. This is recorded in the audit trail."
        error={error ?? undefined}
      >
        <textarea
          ref={inputRef}
          value={comment}
          onChange={e => { setComment(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          placeholder="e.g., Confirmed valve closure. Field operator dispatched."
          rows={3}
          className="input-field"
          style={{
            width: '100%',
            resize: 'vertical',
            minHeight: '72px',
          }}
        />
      </FormField>

      {/* Operator station */}
      <FormField label="Operator Station" hint="Identifies the workstation recording this action.">
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

      {/* Keyboard shortcut hint */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        fontSize: '11px',
        color: 'var(--text-muted)',
        marginTop: 'var(--space-2)',
      }}>
        <kbd style={{
          padding: '2px 6px',
          background: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border)',
          borderRadius: '3px',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
        }}>Ctrl+Enter</kbd>
        <span>to submit</span>
      </div>
    </Modal>
  );
};

// ---- Detail item sub-component ----
const DetailItem: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
      {label}
    </div>
    <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{value}</div>
  </div>
);
