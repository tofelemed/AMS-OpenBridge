'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Modal, FormField } from '../shared/Modal';
import type { ActiveAlarm } from '../../store/alarmStore';
import { PriorityBadge } from '../shared/PriorityBadge';
import { formatTimestampMs } from '../../utils/time';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to acknowledge alarm(s). Check connectivity.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleSubmit();
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
          <ObcButton variant="flat" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </ObcButton>
          <ObcButton
            variant="raised"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || unackedAlarms.length === 0}
          >
            {isSubmitting ? 'Acknowledging...' : `Acknowledge${isBatch ? ` (${unackedAlarms.length})` : ''}`}
          </ObcButton>
        </>
      }
    >
      {!isBatch && unackedAlarms[0] && (
        <div className="dialog-summary-card">
          <div className="dialog-summary-grid">
            <DetailItem label="Priority" value={<PriorityBadge priority={unackedAlarms[0].priority} />} />
            <DetailItem
              label="Severity"
              value={<span className="dialog-summary-item__value dialog-summary-item__value--mono">{unackedAlarms[0].severity}</span>}
            />
            <DetailItem label="Condition" value={unackedAlarms[0].conditionName ?? 'N/A'} mono />
            <DetailItem label="Sub-Condition" value={unackedAlarms[0].subConditionName ?? 'N/A'} mono />
            <DetailItem label="Event Time" value={formatTimestampMs(unackedAlarms[0].eventTimeEpochMs)} mono />
            <DetailItem label="Active Since" value={formatTimestampMs(unackedAlarms[0].activeTimeEpochMs)} mono />
            <DetailItem label="Server" value={unackedAlarms[0].serverName} />
            <DetailItem label="Category" value={unackedAlarms[0].category} />
          </div>
          {unackedAlarms[0].message && (
            <div className="dialog-message-block">
              <div className="dialog-summary-item__label">Message</div>
              <div className="dialog-summary-item__value detail-message-quote">
                &ldquo;{unackedAlarms[0].message}&rdquo;
              </div>
            </div>
          )}
        </div>
      )}

      {isBatch && (
        <div className="dialog-batch-table">
          <div className="dialog-batch-table__header">
            <span>Priority</span>
            <span>Source</span>
            <span>Event Time</span>
          </div>
          {unackedAlarms.map(a => (
            <div key={a.id} className="dialog-batch-table__row">
              <PriorityBadge priority={a.priority} />
              <span className="dialog-batch-table__source">{a.sourceName}</span>
              <span className="dialog-batch-table__time">{formatTimestampMs(a.eventTimeEpochMs)}</span>
            </div>
          ))}
        </div>
      )}

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
          className="ob-input"
        />
      </FormField>

      <FormField label="Operator Station" hint="Identifies the workstation recording this action.">
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

      <div className="dialog-kbd-hint">
        <kbd>Ctrl+Enter</kbd>
        <span>to submit</span>
      </div>
    </Modal>
  );
};

const DetailItem: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({
  label, value, mono,
}) => (
  <div>
    <div className="dialog-summary-item__label">{label}</div>
    <div className={`dialog-summary-item__value${mono ? ' dialog-summary-item__value--mono' : ''}`}>
      {value}
    </div>
  </div>
);
