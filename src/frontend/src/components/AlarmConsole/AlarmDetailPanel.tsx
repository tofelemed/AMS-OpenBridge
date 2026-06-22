import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ActiveAlarm } from '../../store/alarmStore';
import { PriorityBadge } from '../shared/PriorityBadge';
import { AlarmStateIcon } from '../shared/AlarmStateIcon';
import { formatTimestampMs } from '../../utils/time';

// ============================================================
// Alarm Detail Panel — Slide-out drawer for full OPC AE detail
// Shows all OPC Alarms & Events 1.10 attributes including:
// - Condition / Sub-Condition state machine
// - Process value with trend context
// - OPC vendor-specific attributes
// - Full audit history for the alarm lifecycle
// - Correlation / root-cause linkage
// ============================================================

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
  }, [alarm?.activeTimeEpochMs]);

  if (!alarm) return null;

  const tabs = [
    { key: 'details' as const, label: 'Details' },
    { key: 'opc' as const, label: 'OPC Attributes' },
    { key: 'history' as const, label: 'History' },
  ];

  // OPC AE State Machine visualization
  const stateLabel = alarm.conditionActive && !alarm.acknowledged
    ? 'ACTIVE / UNACKNOWLEDGED'
    : alarm.conditionActive && alarm.acknowledged
      ? 'ACTIVE / ACKNOWLEDGED'
      : !alarm.conditionActive && !alarm.acknowledged
        ? 'INACTIVE / UNACKNOWLEDGED'
        : 'INACTIVE / ACKNOWLEDGED';

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9998,
            animation: 'fadeIn 0.2s ease-out',
          }}
        />
      )}

      {/* Slide-out Panel */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '520px',
          maxWidth: '100vw',
          background: 'var(--color-bg-secondary)',
          borderLeft: '1px solid var(--color-border-strong)',
          boxShadow: '-16px 0 48px rgba(0,0,0,0.6)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg-elevated)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <PriorityBadge priority={alarm.priority} />
              <AlarmStateIcon alarm={alarm} />
            </div>
            <button
              onClick={onClose}
              className="btn btn--ghost btn--icon"
              style={{ fontSize: '14px' }}
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>

          <h2 style={{
            fontSize: '15px',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-primary)',
            wordBreak: 'break-all',
            marginBottom: 'var(--space-1)',
          }}>
            {alarm.sourceName}
          </h2>

          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {alarm.serverName} • {alarm.category} • Severity {alarm.severity}
          </div>
        </div>

        {/* OPC AE State Machine Banner */}
        <div style={{
          padding: 'var(--space-3) var(--space-5)',
          background: alarm.conditionActive && !alarm.acknowledged
            ? 'rgba(255,23,68,0.08)'
            : alarm.conditionActive && alarm.acknowledged
              ? 'rgba(255,214,0,0.06)'
              : !alarm.conditionActive && !alarm.acknowledged
                ? 'rgba(0,230,118,0.06)'
                : 'rgba(0,230,118,0.03)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              OPC AE Condition State
            </div>
            <div style={{
              fontSize: '13px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              color: alarm.conditionActive && !alarm.acknowledged
                ? 'var(--alarm-critical)'
                : alarm.conditionActive && alarm.acknowledged
                  ? 'var(--alarm-medium)'
                  : 'var(--color-success)',
            }}>
              {stateLabel}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Time in Alarm</div>
            <div style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              {timeInAlarm}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{
          padding: 'var(--space-3) var(--space-5)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          gap: 'var(--space-2)',
          flexWrap: 'wrap',
        }}>
          <button
            className="btn btn--primary"
            disabled={alarm.acknowledged}
            onClick={() => onAcknowledge(alarm)}
            style={{ fontSize: '12px', padding: '6px 14px' }}
          >
            ✓ Acknowledge
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => onShelve(alarm)}
            style={{ fontSize: '12px', padding: '6px 14px' }}
          >
            📥 Shelve
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => onSuppress(alarm)}
            style={{ fontSize: '12px', padding: '6px 14px' }}
            disabled={alarm.isSuppressed}
          >
            🔇 {alarm.isSuppressed ? 'Suppressed' : 'Suppress'}
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => onOutOfService(alarm)}
            style={{ fontSize: '12px', padding: '6px 14px' }}
            disabled={alarm.isOutOfService}
          >
            🔧 {alarm.isOutOfService ? 'Out of Service' : 'Set OOS'}
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg-elevated)',
        }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                padding: 'var(--space-3)',
                fontSize: '12px',
                fontWeight: 600,
                color: activeTab === tab.key ? 'var(--accent-blue-light)' : 'var(--text-secondary)',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.key ? '2px solid var(--accent-blue)' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4) var(--space-5)' }}>
          {activeTab === 'details' && <DetailsTab alarm={alarm} />}
          {activeTab === 'opc' && <OpcAttributesTab alarm={alarm} />}
          {activeTab === 'history' && <HistoryTab alarm={alarm} />}
        </div>
      </div>
    </>
  );
};

// ---- Details Tab ----
const DetailsTab: React.FC<{ alarm: ActiveAlarm }> = ({ alarm }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
    {/* Condition Information */}
    <Section title="Condition Information">
      <PropertyGrid>
        <Property label="Condition Name" value={alarm.conditionName ?? 'N/A'} mono />
        <Property label="Sub-Condition" value={alarm.subConditionName ?? 'N/A'} mono />
        <Property label="Condition Active" value={alarm.conditionActive ? 'YES' : 'NO'}
          color={alarm.conditionActive ? 'var(--alarm-critical)' : 'var(--color-success)'} />
        <Property label="Quality" value={alarm.qualityGood ? 'GOOD' : 'BAD'}
          color={alarm.qualityGood ? 'var(--color-success)' : 'var(--alarm-critical)'} />
      </PropertyGrid>
    </Section>

    {/* Contract identity (production-contracts §1) */}
    <Section title="Contract Identity">
      <PropertyGrid>
        <Property label="AMS Alarm ID" value={alarm.id} mono />
        <Property label="Family ID" value={alarm.logicalAlarmFamilyId} mono />
        <Property label="Key Schema" value={`v${alarm.instanceKeySchemaVersion}`} />
        {alarm.commandId && (
          <Property label="ACK Command ID" value={alarm.commandId} mono />
        )}
        {alarm.ackLifecycleState && (
          <Property label="ACK Lifecycle" value={alarm.ackLifecycleState} />
        )}
      </PropertyGrid>
    </Section>

    {/* Source & Server */}
    <Section title="Source & Server">
      <PropertyGrid>
        <Property label="Source Name" value={alarm.sourceName} mono />
        <Property label="Server" value={alarm.serverName} />
        <Property label="Server ID" value={alarm.serverId} mono />
        <Property label="Category" value={alarm.category} />
      </PropertyGrid>
    </Section>

    {/* Process Value */}
    {alarm.processValue != null && (
      <Section title="Process Value">
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--space-2)',
          padding: 'var(--space-3)',
          background: 'var(--color-bg-primary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
        }}>
          <span style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {alarm.processValue.toFixed(2)}
          </span>
          {alarm.processUnit && (
            <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {alarm.processUnit}
            </span>
          )}
        </div>
      </Section>
    )}

    {/* Timestamps — eventTime = SOE authority; activeTime = duration; ingest = audit only */}
    <Section title="Timestamps">
      <PropertyGrid>
        <Property label="Event Time (SOE)" value={
          alarm.eventTimeMissing || !alarm.eventTimeEpochMs
            ? '— missing (contract violation)'
            : formatTimestampMs(alarm.eventTimeEpochMs)
        } mono />
        <Property label="Active Since" value={formatTimestampMs(alarm.activeTimeEpochMs)} mono />
        <Property label="Server Received (audit)" value={
          alarm.serverReceivedEpochMs
            ? formatTimestampMs(alarm.serverReceivedEpochMs)
            : '—'
        } mono />
      </PropertyGrid>
    </Section>

    {/* Acknowledgment */}
    <Section title="Acknowledgment Status">
      <PropertyGrid>
        <Property label="Acknowledged" value={alarm.acknowledged ? 'YES' : 'NO'}
          color={alarm.acknowledged ? 'var(--color-success)' : 'var(--alarm-critical)'} />
        <Property label="Acknowledged By" value={alarm.ackedByUsername ?? '—'} />
        <Property label="Ack Time" value={alarm.ackTimeEpochMs ? formatTimestampMs(alarm.ackTimeEpochMs) : '—'} mono />
        <Property label="Ack Comment" value={alarm.ackComment ?? '—'} />
      </PropertyGrid>
    </Section>

    {/* Shelving / Suppression */}
    <Section title="Management State">
      <PropertyGrid>
        <Property label="Shelved" value={alarm.isShelved ? 'YES' : 'NO'}
          color={alarm.isShelved ? 'var(--color-warning)' : 'var(--text-secondary)'} />
        {alarm.isShelved && (
          <>
            <Property label="Shelve Expires" value={alarm.shelveUntilEpochMs ? formatTimestampMs(alarm.shelveUntilEpochMs) : '—'} mono />
            <Property label="Shelve Comment" value={alarm.shelveComment ?? '—'} />
          </>
        )}
        <Property label="Suppressed" value={alarm.isSuppressed ? 'YES' : 'NO'}
          color={alarm.isSuppressed ? 'var(--color-warning)' : 'var(--text-secondary)'} />
        {alarm.isSuppressed && (
          <Property label="Suppression Reason" value={alarm.suppressionReason ?? '—'} />
        )}
        <Property label="Out of Service" value={alarm.isOutOfService ? 'YES' : 'NO'}
          color={alarm.isOutOfService ? 'var(--color-warning)' : 'var(--text-secondary)'} />
      </PropertyGrid>
    </Section>

    {/* Correlation */}
    {alarm.correlationId && (
      <Section title="Correlation / Root Cause">
        <PropertyGrid>
          <Property label="Correlation ID" value={alarm.correlationId} mono />
          <Property label="Is Root Cause" value={alarm.isRootCause ? 'YES' : 'NO'}
            color={alarm.isRootCause ? 'var(--alarm-critical)' : 'var(--text-secondary)'} />
        </PropertyGrid>
      </Section>
    )}

    {/* Message */}
    {alarm.message && (
      <Section title="Message">
        <div style={{
          padding: 'var(--space-3)',
          background: 'var(--color-bg-primary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          fontSize: '13px',
          color: 'var(--text-primary)',
          fontStyle: 'italic',
          lineHeight: 1.5,
        }}>
          "{alarm.message}"
        </div>
      </Section>
    )}
  </div>
);

// ---- OPC Attributes Tab ----
const OpcAttributesTab: React.FC<{ alarm: ActiveAlarm }> = ({ alarm }) => {
  const attributes = alarm.opcAttributes ?? {};
  const entries = Object.entries(attributes);

  return (
    <div>
      <div style={{
        fontSize: '11px',
        color: 'var(--text-muted)',
        marginBottom: 'var(--space-4)',
        padding: 'var(--space-3)',
        background: 'rgba(41,121,255,0.06)',
        border: '1px solid rgba(41,121,255,0.15)',
        borderRadius: 'var(--radius-md)',
      }}>
        OPC AE 1.10 vendor-specific and event-category attributes returned by the OPC server.
      </div>

      {entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          No additional OPC attributes available for this alarm.
        </div>
      ) : (
        <div style={{
          background: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}>
          {entries.map(([key, value], i) => (
            <div
              key={key}
              style={{
                display: 'flex',
                padding: 'var(--space-2) var(--space-3)',
                borderBottom: i < entries.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                fontSize: '12px',
                gap: 'var(--space-3)',
              }}
            >
              <span style={{
                color: 'var(--accent-cyan)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                minWidth: '160px',
                flexShrink: 0,
              }}>
                {key}
              </span>
              <span style={{
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                wordBreak: 'break-all',
              }}>
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---- History Tab (Lifecycle Timeline) ----
const HistoryTab: React.FC<{ alarm: ActiveAlarm }> = ({ alarm }) => {
  // Build a simple timeline from available data
  const events = useMemo(() => {
    const items: { time: number; label: string; detail: string; color: string; pill: string }[] = [];

    items.push({
      time: alarm.activeTimeEpochMs || alarm.eventTimeEpochMs,
      label: 'Alarm Activated',
      detail: `Condition ${alarm.conditionName ?? 'N/A'} became active`,
      color: 'var(--alarm-critical)',
      pill: 'NEW',
    });

    if (alarm.acknowledged && alarm.ackTimeEpochMs) {
      items.push({
        time: alarm.ackTimeEpochMs,
        label: 'Acknowledged',
        detail: `By ${alarm.ackedByUsername ?? 'Operator'}${alarm.ackComment ? `: "${alarm.ackComment}"` : ''}`,
        color: '#ff9100',
        pill: 'ACKED',
      });
    }

    if (alarm.isShelved && alarm.shelveUntilEpochMs) {
      items.push({
        time: alarm.ackTimeEpochMs ?? alarm.eventTimeEpochMs,
        label: 'Shelved',
        detail: `Until ${formatTimestampMs(alarm.shelveUntilEpochMs)}${alarm.shelveComment ? `: "${alarm.shelveComment}"` : ''}`,
        color: '#60a5fa',
        pill: 'SHELVED',
      });
    }

    if (alarm.isSuppressed) {
      items.push({
        time: alarm.eventTimeEpochMs,
        label: 'Suppressed',
        detail: `Reason: ${alarm.suppressionReason ?? 'DCS Rule'}`,
        color: '#c084fc',
        pill: 'SUPPRESSED',
      });
    }

    if (!alarm.conditionActive && alarm.eventTimeEpochMs) {
      items.push({
        time: alarm.eventTimeEpochMs,
        label: 'Returned to Normal',
        detail: 'Process variable recovered to acceptable range',
        color: '#00e676', // Green
        pill: 'CLEARED',
      });
    }

    return items.sort((a, b) => a.time - b.time);
  }, [alarm]);

  return (
    <div>
      <div style={{
        fontSize: '11px',
        color: 'var(--text-muted)',
        marginBottom: 'var(--space-4)',
        padding: 'var(--space-3)',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 'var(--radius-md)'
      }}>
        Lifecycle event chronology (sorted by event-time authority). SignalR is at-least-once — reconcile from REST on reconnect.
      </div>

      <div className="soe-timeline" style={{ paddingLeft: '28px', position: 'relative' }}>
        {/* Vertical line */}
        <div style={{
          position: 'absolute',
          left: '12px',
          top: 0,
          bottom: 0,
          width: '2px',
          background: 'var(--color-border)',
        }} />
        
        {events.map((event, i) => (
          <div
            key={i}
            style={{
              position: 'relative',
              marginBottom: 'var(--space-3)',
              background: 'linear-gradient(135deg, var(--color-bg-elevated) 0%, var(--color-bg-card) 100%)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3) var(--space-4)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{
              position: 'absolute',
              left: '-21px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: event.color,
              border: '2px solid var(--color-bg-primary)',
              boxShadow: `0 0 8px ${event.color}`,
            }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: '3px',
                  background: `${event.color}20`,
                  color: event.color,
                  border: `1px solid ${event.color}40`,
                }}>{event.pill}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{event.label}</span>
              </div>
              <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                {formatTimestampMs(event.time)}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{event.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---- Utility sub-components ----

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h4 style={{
      fontSize: '11px',
      fontWeight: 600,
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      marginBottom: 'var(--space-3)',
      paddingBottom: 'var(--space-2)',
      borderBottom: '1px solid var(--color-border)',
    }}>
      {title}
    </h4>
    {children}
  </div>
);

const PropertyGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
    {children}
  </div>
);

const Property: React.FC<{ label: string; value: string; mono?: boolean; color?: string }> = ({
  label, value, mono, color,
}) => (
  <div>
    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
      {label}
    </div>
    <div style={{
      fontSize: '13px',
      color: color ?? 'var(--text-primary)',
      fontFamily: mono ? 'var(--font-mono)' : undefined,
      fontWeight: mono ? 500 : 400,
      wordBreak: 'break-all',
    }}>
      {value}
    </div>
  </div>
);
