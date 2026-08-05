'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { ActiveAlarm } from '../../store/alarmStore';
import { PriorityBadge } from '../shared/PriorityBadge';
import { AlarmStateIcon } from '../shared/AlarmStateIcon';
import { formatTimestampMs } from '../../utils/time';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

interface AlarmDetailPanelProps {
  alarm: ActiveAlarm | null;
  isOpen: boolean;
  onClose: () => void;
  onAcknowledge: (alarm: ActiveAlarm) => void;
  onShelve: (alarm: ActiveAlarm) => void;
  onSuppress: (alarm: ActiveAlarm) => void;
  onOutOfService: (alarm: ActiveAlarm) => void;
}

export const AlarmDetailPanel: React.FC<AlarmDetailPanelProps> = ({
  alarm,
  isOpen,
  onClose,
  onAcknowledge,
  onShelve,
  onSuppress,
  onOutOfService,
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'opc' | 'history'>('details');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) setActiveTab('details');
  }, [isOpen, alarm?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const timeInAlarm = useMemo(() => {
    if (!alarm) return '0s';
    const ms = Date.now() - alarm.activeTimeEpochMs;
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  // alarm identity is captured via alarm.id below; the full object would retrigger on every SignalR patch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alarm?.activeTimeEpochMs]);

  if (!alarm) return null;

  const tabs = [
    { key: 'details' as const, label: 'Details' },
    { key: 'opc' as const, label: 'OPC Attributes' },
    { key: 'history' as const, label: 'History' },
  ];

  const stateLabel = alarm.conditionActive && !alarm.acknowledged
    ? 'ACTIVE / UNACKNOWLEDGED'
    : alarm.conditionActive && alarm.acknowledged
      ? 'ACTIVE / ACKNOWLEDGED'
      : !alarm.conditionActive && !alarm.acknowledged
        ? 'INACTIVE / UNACKNOWLEDGED'
        : 'INACTIVE / ACKNOWLEDGED';

  const stateClass = alarm.conditionActive && !alarm.acknowledged
    ? 'detail-panel__state-value--alarm'
    : alarm.conditionActive && alarm.acknowledged
      ? 'detail-panel__state-value--warning'
      : 'detail-panel__state-value--ok';

  return (
    <>
      {isOpen && <div className="detail-panel-backdrop" onClick={onClose} aria-hidden="true" />}

      <div
        ref={panelRef}
        className="detail-panel"
        style={{ transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}
        role="complementary"
        aria-label="Alarm detail panel"
      >
        <div className="detail-panel__header">
          <div className="detail-panel__header-row">
            <div className="detail-panel__badges">
              <PriorityBadge priority={alarm.priority} />
              <AlarmStateIcon alarm={alarm} />
            </div>
            <ObcButton variant="flat" size="small" onClick={onClose} aria-label="Close detail panel">
              ✕
            </ObcButton>
          </div>

          <h2 className="detail-panel__title">{alarm.sourceName}</h2>
          <div className="detail-panel__meta">
            {alarm.serverName} • {alarm.category} • Severity {alarm.severity}
          </div>
        </div>

        <div className="detail-panel__state-banner">
          <div>
            <div className="detail-panel__state-label">OPC AE Condition State</div>
            <div className={`detail-panel__state-value ${stateClass}`}>{stateLabel}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="detail-panel__state-label">Time in Alarm</div>
            <div className="detail-panel__time-value">{timeInAlarm}</div>
          </div>
        </div>

        <div className="detail-panel__actions">
          <ObcButton
            variant="raised"
            size="small"
            disabled={alarm.acknowledged}
            onClick={() => onAcknowledge(alarm)}
          >
            Acknowledge
          </ObcButton>
          <ObcButton variant="flat" size="small" onClick={() => onShelve(alarm)}>
            Shelve
          </ObcButton>
          <ObcButton variant="flat" size="small" onClick={() => onSuppress(alarm)} disabled={alarm.isSuppressed}>
            {alarm.isSuppressed ? 'Suppressed' : 'Suppress'}
          </ObcButton>
          <ObcButton variant="flat" size="small" onClick={() => onOutOfService(alarm)} disabled={alarm.isOutOfService}>
            {alarm.isOutOfService ? 'Out of Service' : 'Set OOS'}
          </ObcButton>
        </div>

        <div className="detail-panel__tabs">
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`detail-panel__tab ${activeTab === tab.key ? 'detail-panel__tab--active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="detail-panel__content">
          {activeTab === 'details' && <DetailsTab alarm={alarm} />}
          {activeTab === 'opc' && <OpcAttributesTab alarm={alarm} />}
          {activeTab === 'history' && <HistoryTab alarm={alarm} />}
        </div>
      </div>
    </>
  );
};

const DetailsTab: React.FC<{ alarm: ActiveAlarm }> = ({ alarm }) => (
  <div className="detail-panel__sections">
    <Section title="Condition Information">
      <PropertyGrid>
        <Property label="Condition Name" value={alarm.conditionName ?? 'N/A'} mono />
        <Property label="Sub-Condition" value={alarm.subConditionName ?? 'N/A'} mono />
        <Property
          label="Condition Active"
          value={alarm.conditionActive ? 'YES' : 'NO'}
          color={alarm.conditionActive ? 'var(--alert-alarm-border-color)' : 'var(--running-color)'}
        />
        <Property
          label="Quality"
          value={alarm.qualityGood ? 'GOOD' : 'BAD'}
          color={alarm.qualityGood ? 'var(--running-color)' : 'var(--alert-alarm-border-color)'}
        />
      </PropertyGrid>
    </Section>

    <Section title="Contract Identity">
      <PropertyGrid>
        <Property label="AMS Alarm ID" value={alarm.id} mono />
        <Property label="Family ID" value={alarm.logicalAlarmFamilyId} mono />
        <Property label="Key Schema" value={`v${alarm.instanceKeySchemaVersion}`} />
        {alarm.commandId && <Property label="ACK Command ID" value={alarm.commandId} mono />}
        {alarm.ackLifecycleState && <Property label="ACK Lifecycle" value={alarm.ackLifecycleState} mono />}
      </PropertyGrid>
    </Section>

    <Section title="Source & Server">
      <PropertyGrid>
        <Property label="Source Name" value={alarm.sourceName} mono />
        <Property label="Server" value={alarm.serverName} />
        <Property label="Server ID" value={alarm.serverId} mono />
        <Property label="Category" value={alarm.category} />
      </PropertyGrid>
    </Section>

    {alarm.processValue != null && (
      <Section title="Process Value">
        <div className="ob-card">
          <span className="detail-process-value">{alarm.processValue.toFixed(2)}</span>
          {alarm.processUnit && (
            <span className="detail-process-unit">{alarm.processUnit}</span>
          )}
        </div>
      </Section>
    )}

    <Section title="Timestamps">
      <PropertyGrid>
        <Property
          label="Event Time (SOE)"
          value={
            alarm.eventTimeMissing || !alarm.eventTimeEpochMs
              ? '— missing (contract violation)'
              : formatTimestampMs(alarm.eventTimeEpochMs)
          }
          mono
        />
        <Property label="Active Since" value={formatTimestampMs(alarm.activeTimeEpochMs)} mono />
        <Property
          label="Server Received (audit)"
          value={alarm.serverReceivedEpochMs ? formatTimestampMs(alarm.serverReceivedEpochMs) : '—'}
          mono
        />
      </PropertyGrid>
    </Section>

    <Section title="Acknowledgment Status">
      <PropertyGrid>
        <Property
          label="Acknowledged"
          value={alarm.acknowledged ? 'YES' : 'NO'}
          color={alarm.acknowledged ? 'var(--running-color)' : 'var(--alert-alarm-border-color)'}
        />
        <Property label="Acknowledged By" value={alarm.ackedByUsername ?? '—'} />
        <Property
          label="Ack Time"
          value={alarm.ackTimeEpochMs ? formatTimestampMs(alarm.ackTimeEpochMs) : '—'}
          mono
        />
        <Property label="Ack Comment" value={alarm.ackComment ?? '—'} />
      </PropertyGrid>
    </Section>

    <Section title="Management State">
      <PropertyGrid>
        <Property
          label="Shelved"
          value={alarm.isShelved ? 'YES' : 'NO'}
          color={alarm.isShelved ? 'var(--alert-caution-border-color)' : undefined}
        />
        {alarm.isShelved && (
          <>
            <Property
              label="Shelve Expires"
              value={alarm.shelveUntilEpochMs ? formatTimestampMs(alarm.shelveUntilEpochMs) : '—'}
              mono
            />
            <Property label="Shelve Comment" value={alarm.shelveComment ?? '—'} />
          </>
        )}
        <Property
          label="Suppressed"
          value={alarm.isSuppressed ? 'YES' : 'NO'}
          color={alarm.isSuppressed ? 'var(--alert-caution-border-color)' : undefined}
        />
        {alarm.isSuppressed && alarm.suppressionReason && (
          <Property label="Suppression Reason" value={alarm.suppressionReason} />
        )}
        <Property
          label="Out of Service"
          value={alarm.isOutOfService ? 'YES' : 'NO'}
          color={alarm.isOutOfService ? 'var(--alert-caution-border-color)' : undefined}
        />
      </PropertyGrid>
    </Section>

    {alarm.correlationId && (
      <Section title="Correlation / Root Cause">
        <PropertyGrid>
          <Property label="Correlation ID" value={alarm.correlationId} mono />
          <Property
            label="Is Root Cause"
            value={alarm.isRootCause ? 'YES' : 'NO'}
            color={alarm.isRootCause ? 'var(--alert-alarm-border-color)' : undefined}
          />
        </PropertyGrid>
      </Section>
    )}

    {alarm.message && (
      <Section title="Message">
        <div className="ob-card detail-message-quote">&ldquo;{alarm.message}&rdquo;</div>
      </Section>
    )}
  </div>
);

const OpcAttributesTab: React.FC<{ alarm: ActiveAlarm }> = ({ alarm }) => {
  const attributes = alarm.opcAttributes ?? {};
  const entries = Object.entries(attributes);

  return (
    <div>
      <div className="info-notice" style={{ marginBottom: 'var(--spacing-4, 16px)' }}>
        OPC AE 1.10 vendor-specific and event-category attributes returned by the OPC server.
      </div>

      {entries.length === 0 ? (
        <div className="detail-empty-state">
          No additional OPC attributes available for this alarm.
        </div>
      ) : (
        <div className="ob-card" style={{ padding: 0, overflow: 'hidden' }}>
          {entries.map(([key, value]) => (
            <div key={key} className="opc-attr-row">
              <span className="opc-attr-row__key">{key}</span>
              <span className="opc-attr-row__value">
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const HistoryTab: React.FC<{ alarm: ActiveAlarm }> = ({ alarm }) => {
  const events = useMemo(() => {
    const items: { time: number; label: string; detail: string; color: string; pill: string }[] = [];

    items.push({
      time: alarm.activeTimeEpochMs || alarm.eventTimeEpochMs,
      label: 'Alarm Activated',
      detail: `Condition ${alarm.conditionName ?? 'N/A'} became active`,
      color: 'var(--alert-alarm-border-color)',
      pill: 'NEW',
    });

    if (alarm.acknowledged && alarm.ackTimeEpochMs) {
      items.push({
        time: alarm.ackTimeEpochMs,
        label: 'Acknowledged',
        detail: `By ${alarm.ackedByUsername ?? 'Operator'}${alarm.ackComment ? `: "${alarm.ackComment}"` : ''}`,
        color: 'var(--alert-warning-border-color)',
        pill: 'ACKED',
      });
    }

    if (alarm.isShelved && alarm.shelveUntilEpochMs) {
      items.push({
        time: alarm.ackTimeEpochMs ?? alarm.eventTimeEpochMs,
        label: 'Shelved',
        detail: `Until ${formatTimestampMs(alarm.shelveUntilEpochMs)}${alarm.shelveComment ? `: "${alarm.shelveComment}"` : ''}`,
        color: 'var(--focus-color)',
        pill: 'SHELVED',
      });
    }

    if (alarm.isSuppressed) {
      items.push({
        time: alarm.eventTimeEpochMs,
        label: 'Suppressed',
        detail: `Reason: ${alarm.suppressionReason ?? 'DCS Rule'}`,
        color: 'var(--on-container-neutral-color)',
        pill: 'SUPPRESSED',
      });
    }

    if (!alarm.conditionActive && alarm.eventTimeEpochMs) {
      items.push({
        time: alarm.eventTimeEpochMs,
        label: 'Returned to Normal',
        detail: 'Process variable recovered to acceptable range',
        color: 'var(--running-color)',
        pill: 'CLEARED',
      });
    }

    return items.sort((a, b) => a.time - b.time);
  }, [alarm]);

  return (
    <div>
      <div className="info-notice" style={{ marginBottom: 'var(--spacing-4, 16px)' }}>
        Lifecycle event chronology (sorted by event-time authority).
      </div>

      <div className="history-timeline">
        {events.map((event, i) => (
          <div
            key={i}
            className="history-event"
            style={{ '--event-color': event.color } as React.CSSProperties}
          >
            <div className="history-event__dot" />
            <div className="history-event__header">
              <div className="history-event__title-row">
                <span className="history-event__pill">{event.pill}</span>
                <span className="history-event__label">{event.label}</span>
              </div>
              <span className="history-event__time">{formatTimestampMs(event.time)}</span>
            </div>
            <div className="history-event__detail">{event.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h4 className="section-title">{title}</h4>
    {children}
  </div>
);

const PropertyGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="detail-property-grid">{children}</div>
);

const Property: React.FC<{ label: string; value: string; mono?: boolean; color?: string }> = ({
  label, value, mono, color,
}) => (
  <div>
    <div className="detail-property__label">{label}</div>
    <div
      className={`detail-property__value${mono ? ' detail-property__value--mono' : ''}`}
      style={color ? { color } : undefined}
    >
      {value}
    </div>
  </div>
);
