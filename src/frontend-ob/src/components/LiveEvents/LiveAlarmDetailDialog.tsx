'use client';

import React, { useMemo } from 'react';
import { Modal } from '../shared/Modal';
import { PriorityBadge } from '../shared/PriorityBadge';
import { formatTimestampMs } from '../../utils/time';
import { useMqttStore, type LiveAlarm, type LiveMetric } from '../../store/mqttStore';

interface LiveAlarmDetailDialogProps {
  alarm: LiveAlarm | null;
  isOpen: boolean;
  onClose: () => void;
}

function stateLabel(alarm: LiveAlarm): string {
  if (alarm.state === 'CLEARED') return 'CLEARED';
  if (alarm.acknowledged || alarm.state === 'ACKNOWLEDGED') return 'ACKNOWLEDGED';
  return alarm.state || 'ACTIVE';
}

function stateVariant(alarm: LiveAlarm): 'default' | 'danger' | 'warning' | 'success' {
  if (alarm.state === 'CLEARED') return 'success';
  if (alarm.priority === 'CRITICAL' && alarm.conditionActive) return 'danger';
  if (alarm.acknowledged) return 'warning';
  return 'default';
}

export const LiveAlarmDetailDialog: React.FC<LiveAlarmDetailDialogProps> = ({
  alarm,
  isOpen,
  onClose,
}) => {
  const metrics = useMqttStore(s => s.metrics);

  const deviceMetrics = useMemo(() => {
    if (!alarm) return [] as { name: string; metric: LiveMetric }[];
    const prefix = `${alarm.alarmId}/`;
    const rows: { name: string; metric: LiveMetric }[] = [];
    for (const [key, metric] of metrics) {
      if (key.startsWith(prefix)) {
        rows.push({ name: key.slice(prefix.length), metric });
      }
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [metrics, alarm]);

  if (!alarm) return null;

  const variant = stateVariant(alarm);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={alarm.sourceName || alarm.alarmId}
      subtitle={`Sparkplug B · ${alarm.alarmId}`}
      variant={variant}
      width="560px"
      icon={<span style={{ fontSize: '20px' }}>⬡</span>}
    >
      <div className="detail-panel__sections">
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
          padding: '12px 14px', borderRadius: '8px',
          background: 'var(--container-background-color, #F6F8FB)',
          border: '1px solid var(--divider-color, #DDE3EA)',
          marginBottom: '4px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <PriorityBadge priority={alarm.priority || 'LOW'} />
            <span style={{
              fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px',
              background: alarm.conditionActive ? '#FEF2F2' : '#ECFDF5',
              color: alarm.conditionActive ? '#D64545' : '#2E8B57',
            }}>
              {stateLabel(alarm)}
            </span>
            {alarm.acknowledged && (
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#2E8B57' }}>ACK</span>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="detail-property__label">Severity</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#31598F', fontVariantNumeric: 'tabular-nums' }}>
              {alarm.severity}
            </div>
          </div>
        </div>

        <Section title="Alarm Information">
          <PropertyGrid>
            <Property label="Source Name" value={alarm.sourceName || '—'} mono />
            <Property label="Device ID" value={alarm.alarmId} mono />
            <Property label="Condition Name" value={alarm.conditionName || '—'} mono />
            <Property
              label="Condition Active"
              value={alarm.conditionActive ? 'YES' : 'NO'}
              color={alarm.conditionActive ? '#D64545' : '#2E8B57'}
            />
            <Property label="Priority" value={alarm.priority || '—'} />
            <Property label="State" value={alarm.state || 'ACTIVE'} />
            <Property
              label="Acknowledged"
              value={alarm.acknowledged ? 'YES' : 'NO'}
              color={alarm.acknowledged ? '#2E8B57' : '#D64545'}
            />
          </PropertyGrid>
        </Section>

        {alarm.message && (
          <Section title="Message">
            <div className="ob-card detail-message-quote">&ldquo;{alarm.message}&rdquo;</div>
          </Section>
        )}

        <Section title="Timestamps">
          <PropertyGrid>
            <Property label="Last Updated (DDATA)" value={formatTimestampMs(alarm.ts)} mono />
          </PropertyGrid>
        </Section>

        <Section title="Sparkplug Metrics (live)">
          {deviceMetrics.length === 0 ? (
            <div className="detail-empty-state">No metric values cached for this device.</div>
          ) : (
            <div className="ob-card" style={{ padding: 0, overflow: 'hidden' }}>
              {deviceMetrics.map(({ name, metric }) => (
                <div key={name} className="opc-attr-row">
                  <span className="opc-attr-row__key">{name}</span>
                  <span className="opc-attr-row__value">
                    {String(metric.value)}
                    <span style={{ marginLeft: '8px', color: '#9CA3AF', fontSize: '10px' }}>
                      q={metric.quality} · {formatTimestampMs(metric.ts)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Data Path">
          <PropertyGrid>
            <Property
              label="MQTT Topic"
              value={`spBv1.0/ams_site1/DDATA/ams_edge1/${alarm.alarmId}`}
              mono
            />
            <Property label="Transport" value="Sparkplug B DDATA → Redis snapshot → HMI" />
          </PropertyGrid>
        </Section>
      </div>
    </Modal>
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
